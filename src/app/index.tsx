import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  useWindowDimensions,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CyberColors } from '../theme/colors';
import { CyberMasterCircle } from '../components/CyberMasterCircle';
import { PowerGrid } from '../components/PowerGrid';
import { StatusCard } from '../components/StatusCard';
import { SettingsModal } from '../components/SettingsModal';
import { QRScannerModal } from '../components/QRScannerModal';
import {
  mqttClient,
  PCStatus,
  PowerAction,
  StationConfig,
  DEFAULT_STATION_CONFIG,
  sanitizeBrokerUrl,
} from '../services/mqttService';
import { StorageService } from '../services/storageService';
import { WOLService } from '../services/wolService';

type AppRole = 'controller' | 'bridge';

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 600;

  // State Konfigurasi Stasiun (Universal - Default Terisi Stasiun PC)
  const [stationConfig, setStationConfig] = useState<StationConfig>(DEFAULT_STATION_CONFIG);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isDirectScannerOpen, setIsDirectScannerOpen] = useState<boolean>(false);

  // State Manajemen Daya & Peran
  const [role, setRole] = useState<AppRole>('controller');
  const [pcStatus, setPcStatus] = useState<PCStatus>('OFFLINE');
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [isGatewayActive, setIsGatewayActive] = useState<boolean>(false);
  const [activeTransition, setActiveTransition] = useState<PowerAction | 'waking' | null>(null);
  const [isBridgeRunning, setIsBridgeRunning] = useState<boolean>(true);
  const [logs, setLogs] = useState<string[]>([
    '[INIT] WOL Remote Station siap.',
  ]);

  const actionTimeoutRef = useRef<any>(null);
  const wakeTimeoutRef = useRef<any>(null);
  const pingIntervalRef = useRef<any>(null);
  const heartbeatIntervalRef = useRef<any>(null);

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<{
    title: string;
    desc: string;
    type: 'success' | 'danger' | 'info';
  } | null>(null);
  const toastAnim = useState(new Animated.Value(-100))[0];

  const triggerToast = (
    title: string,
    desc: string,
    type: 'success' | 'danger' | 'info' = 'success'
  ) => {
    setToastMessage({ title, desc, type });
    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: 20,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(4000),
      Animated.timing(toastAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setToastMessage(null));
  };

  const roleRef = useRef<AppRole>(role);
  roleRef.current = role;
  const isBridgeRunningRef = useRef<boolean>(isBridgeRunning);
  isBridgeRunningRef.current = isBridgeRunning;
  const stationConfigRef = useRef<StationConfig>(stationConfig);
  stationConfigRef.current = stationConfig;
  const pcStatusRef = useRef<PCStatus>(pcStatus);
  pcStatusRef.current = pcStatus;

  // 1. Muat konfigurasi tersimpan
  useEffect(() => {
    const loadStoredConfig = async () => {
      try {
        const storedRole = await StorageService.getItem('wol_app_role');
        if (storedRole === 'controller' || storedRole === 'bridge') {
          setRole(storedRole);
        }

        const stored = await StorageService.getItem('wol_station_config');
        if (stored) {
          const parsed = JSON.parse(stored) as StationConfig;
          if (parsed && parsed.stationKey && parsed.stationKey.trim().length > 0) {
            setStationConfig(parsed);
            mqttClient.updateConfig(parsed);
            return;
          }
        }
      } catch {}

      setStationConfig(DEFAULT_STATION_CONFIG);
      mqttClient.updateConfig(DEFAULT_STATION_CONFIG);
    };
    loadStoredConfig();

    // Listener Status PC
    const unsubStatus = mqttClient.onStatusChange((status) => {
      setPcStatus(status);

      if (actionTimeoutRef.current) {
        clearTimeout(actionTimeoutRef.current);
        actionTimeoutRef.current = null;
        setActiveTransition(null);

        if (status === 'SLEEPING') {
          triggerToast('PC Masuk Sleep', 'Konfirmasi: Windows memasuki Suspend (S3).', 'info');
        } else if (status === 'OFFLINE') {
          triggerToast('PC Dimatikan', 'Konfirmasi: PC terputus / mati.', 'danger');
        } else if (status === 'ONLINE') {
          triggerToast('PC Telah Online', 'Konfirmasi: Windows Companion aktif.', 'success');
        }
      }

      if (wakeTimeoutRef.current && status === 'ONLINE') {
        clearTimeout(wakeTimeoutRef.current);
        wakeTimeoutRef.current = null;
        setActiveTransition(null);
        triggerToast('PC Berhasil Menyala!', 'Sinyal terkonfirmasi dari HP Gateway & PC (Boot Online OK).', 'success');
      }
    });

    // Listener Koneksi Broker
    const unsubConn = mqttClient.onConnectionChange((connected) => {
      setIsCloudConnected(connected);
    });

    // Listener Gateway Status (Khusus HP Utama)
    const unsubGateway = mqttClient.onGatewayStatus((alive, lastPcStatus) => {
      setIsGatewayActive(alive);
      if (lastPcStatus) {
        setPcStatus(lastPcStatus);
      }
    });

    // Listener ACK dari Gateway saat Magic Packet ditembakkan
    const unsubAck = mqttClient.onAckReceived((ackData) => {
      if (roleRef.current === 'controller') {
        triggerToast('Sinyal Diteruskan Gateway', 'HP di rumah berhasil menembakkan Magic Packet ke kabel LAN PC.', 'info');
      }
    });

    // Listener Log
    const unsubLog = mqttClient.onLog((newLog) => {
      setLogs((prev) => [newLog, ...prev.slice(0, 19)]);
    });

    // Listener Sinyal Wake (Khusus HP Kedua / Bridge Mode)
    const unsubWake = mqttClient.onWakeReceived(async (wakeData) => {
      if (roleRef.current === 'bridge' && isBridgeRunningRef.current) {
        const targetMac = wakeData.targetMac || stationConfigRef.current.macAddress;
        const targetBroadcast = wakeData.broadcastIp || stationConfigRef.current.broadcastIp;

        setLogs((prev) => [
          `[WAKE GATEWAY] Menerima sinyal dari HP Utama. Memancarkan Magic Packet ke ${targetBroadcast}...`,
          ...prev.slice(0, 19),
        ]);

        const sent = await WOLService.sendMagicPacket(targetMac, targetBroadcast, 9);

        if (sent) {
          await mqttClient.publishWakeAck(`Magic packet dipancarkan ke ${targetMac}`);
          setLogs((prev) => [
            `[WAKE SUKSES] 102-byte Magic Packet berhasil ditransmisikan ke LAN!`,
            ...prev.slice(0, 19),
          ]);
          triggerToast('Magic Packet Terkirim', `Paket bangun ditransmisikan ke kartu LAN PC (${targetMac}).`, 'info');

          // Polling cepat hingga PC bangun
          for (let i = 0; i < 20; i++) {
            await new Promise((r) => setTimeout(r, 1500));
            const pcTargetIp = targetBroadcast.replace('.255', '.102');
            const alive = await WOLService.pingPC(pcTargetIp);
            if (alive) {
              setPcStatus('ONLINE');
              await mqttClient.publishPcStatus('ONLINE');
              triggerToast('PC Terdeteksi Hidup!', 'Ping LAN merespons, PC sekarang ONLINE.', 'success');
              break;
            }
          }
        }
      }
    });

    // Listener Kontrol Daya (Khusus HP Kedua / Bridge Mode - Relay Lokal)
    const unsubControl = mqttClient.onControlReceived(async (action) => {
      if (roleRef.current === 'bridge' && isBridgeRunningRef.current) {
        setLogs((prev) => [
          `[KONTROL RELAY] Perintah ${action} dari HP Utama diterima. Meneruskan ke PC via LAN...`,
          ...prev.slice(0, 19),
        ]);

        const targetBroadcast = stationConfigRef.current.broadcastIp || '192.168.0.255';
        const pcTargetIp = targetBroadcast.replace('.255', '.102');
        const targetMac = stationConfigRef.current.macAddress;

        // Kirim langsung ke UDP Port 20388 PC Companion di LAN
        const upper = action.toUpperCase() as any;
        const localSent = await WOLService.sendLocalPowerCommand(pcTargetIp, targetMac, upper);
        if (localSent) {
          setLogs((prev) => [
            `[LAN OK] Perintah ${action} berhasil ditembakkan ke port 20388 PC (${pcTargetIp}).`,
            ...prev.slice(0, 19),
          ]);
        }
      }
    });

    return () => {
      unsubStatus();
      unsubConn();
      unsubGateway();
      unsubAck();
      unsubLog();
      unsubWake();
      unsubControl();
      if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
      if (wakeTimeoutRef.current) clearTimeout(wakeTimeoutRef.current);
    };
  }, []);

  // Manajemen Siklus Gateway Standby 24/7 (HP Kedua)
  useEffect(() => {
    StorageService.setItem('wol_app_role', role);

    if (role === 'bridge') {
      // 1. Kunci CPU WakeLock agar Android tidak pernah mematikan proses saat layar mati
      WOLService.setGatewayKeepAlive(true);

      // 2. Loop Ping Fisik PC Lokal di LAN setiap 3.5 detik
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(async () => {
        if (!isBridgeRunningRef.current) return;
        const targetBroadcast = stationConfigRef.current.broadcastIp || '192.168.0.255';
        const pcTargetIp = targetBroadcast.replace('.255', '.102');
        const alive = await WOLService.pingPC(pcTargetIp, 1200);

        const newStat: PCStatus = alive ? 'ONLINE' : 'OFFLINE';
        if (newStat !== pcStatusRef.current) {
          setPcStatus(newStat);
          mqttClient.publishPcStatus(newStat);
        }
      }, 3500);

      // 3. Heartbeat Gateway ke Cloud setiap 10 detik
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = setInterval(() => {
        if (!isBridgeRunningRef.current) return;
        mqttClient.publishGatewayHeartbeat(true, pcStatusRef.current);
      }, 10000);
    } else {
      // Role Controller: Lepaskan keepalive jika sebelumnya bridge
      WOLService.setGatewayKeepAlive(false);
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
    }

    return () => {
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    };
  }, [role, isBridgeRunning]);

  const handleSaveConfig = async (newConfig: StationConfig) => {
    setStationConfig(newConfig);
    mqttClient.updateConfig(newConfig);
    await StorageService.setItem('wol_station_config', JSON.stringify(newConfig));
    triggerToast('Konfigurasi Disimpan', `Terhubung ke stasiun: ${newConfig.stationKey}`, 'success');
  };

  const handleDirectScanSuccess = (scanned: Partial<StationConfig>) => {
    const effectiveKey = scanned.stationKey || stationConfig.stationKey;
    const effectiveMac = scanned.macAddress || stationConfig.macAddress;

    if (effectiveKey || effectiveMac) {
      const newConfig: StationConfig = {
        stationName: (scanned.stationName || stationConfig.stationName || 'DESKTOP-FIERRO').trim(),
        stationKey: (effectiveKey || 'WOL-9341-PC').trim(),
        macAddress: (effectiveMac || 'F0:2F:74:8B:F6:43').trim().toUpperCase(),
        broadcastIp: (scanned.broadcastIp || stationConfig.broadcastIp || '192.168.0.255').trim(),
        brokerUrl: sanitizeBrokerUrl(scanned.brokerUrl || stationConfig.brokerUrl || 'broker.hivemq.com'),
      };
      handleSaveConfig(newConfig);
      setIsDirectScannerOpen(false);
      setIsSettingsOpen(false);
      triggerToast('Pairing PC Berhasil!', `Stasiun ${newConfig.stationKey} terhubung.`, 'success');
    }
  };

  // Handler Perintah Wake Up (Magic Packet via Gateway)
  const handleWake = async () => {
    if (activeTransition) return;

    if (!stationConfig.stationKey || !stationConfig.macAddress) {
      triggerToast('Konfigurasi Belum Diisi', 'Silakan masukkan Station Key dan MAC PC di menu ⚙️ Pengaturan.', 'danger');
      setIsSettingsOpen(true);
      return;
    }

    setActiveTransition('waking');

    // 1. Kirim sinyal bangun ke HP Standby di rumah via Cloud Broker
    await mqttClient.sendWakeCommand();

    // 2. Transmisikan juga broadcast lokal (jika kebetulan HP utama sedang berada di rumah)
    await WOLService.sendMagicPacket(stationConfig.macAddress, stationConfig.broadcastIp, 9);

    triggerToast(
      'Sinyal Wake Terkirim!',
      'Perintah bangun diteruskan ke HP Standby di rumah. Sedang menembakkan sinyal ke PC...',
      'success'
    );

    // Timeout 30 detik untuk menunggu PC boot
    if (wakeTimeoutRef.current) clearTimeout(wakeTimeoutRef.current);
    wakeTimeoutRef.current = setTimeout(() => {
      wakeTimeoutRef.current = null;
      if (pcStatus !== 'ONLINE') {
        setActiveTransition(null);
        triggerToast('PC Belum Merespons', 'Pastikan kabel LAN terpasang & HP Standby di rumah aktif terhubung Wi-Fi.', 'danger');
      }
    }, 30000);
  };

  // Handler Kontrol Daya (Sleep, Hibernate, Restart, Shutdown, Lock)
  const handlePowerAction = async (action: PowerAction) => {
    if (activeTransition) return;

    if (!stationConfig.stationKey) {
      triggerToast('Konfigurasi Belum Diisi', 'Silakan masukkan Station Key PC di menu ⚙️ Pengaturan.', 'danger');
      setIsSettingsOpen(true);
      return;
    }

    if (!isCloudConnected) {
      triggerToast('Mencoba Menghubungkan...', 'Ponsel sedang menghubungkan ulang ke Cloud MQTT...', 'info');
      mqttClient.reconnect();
    }

    setActiveTransition(action);
    const sent = await mqttClient.sendPowerAction(action);

    if (!sent) {
      setActiveTransition(null);
      triggerToast('Gagal Mengirim', `Perintah ${action.toUpperCase()} gagal diteruskan ke broker.`, 'danger');
      return;
    }

    // Pasang timeout konfirmasi 10 detik
    if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
    actionTimeoutRef.current = setTimeout(() => {
      actionTimeoutRef.current = null;
      setActiveTransition(null);
      triggerToast(
        'Perintah Diteruskan',
        `Perintah ${action.toUpperCase()} telah dikirim ke Gateway rumah. Menunggu PC beralih status.`,
        'info'
      );
    }, 10000);
  };

  const captionText =
    pcStatus === 'UNCONFIGURED'
      ? '⚠️ Belum dikonfigurasi. Klik ⚙️ di pojok kanan atas.'
      : activeTransition === 'waking'
      ? '📡 HP Gateway rumah sedang menembakkan Magic Packet ke PC...'
      : activeTransition === 'shutdown'
      ? '⏳ Menunggu Windows menutup proses & memutus daya...'
      : activeTransition === 'sleep'
      ? '💤 Menunggu Windows memasuki status Suspend (S3)...'
      : activeTransition === 'hibernate'
      ? '❄️ Menunggu Windows menyimpan RAM ke SSD...'
      : activeTransition === 'restart'
      ? '🔄 Menunggu Windows mulai ulang dan online kembali...'
      : pcStatus === 'ONLINE'
      ? 'PC telah aktif dan siap dikontrol dari jarak jauh'
      : 'Ketuk untuk membangunkan komputer via HP Standby di rumah';

  if (isDirectScannerOpen) {
    return (
      <QRScannerModal
        visible={true}
        onClose={() => setIsDirectScannerOpen(false)}
        onScanSuccess={handleDirectScanSuccess}
      />
    );
  }

  if (isSettingsOpen) {
    return (
      <SettingsModal
        visible={true}
        onClose={() => setIsSettingsOpen(false)}
        config={stationConfig}
        onSave={handleSaveConfig}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Floating In-App Toast Notification */}
      {toastMessage && (
        <Animated.View
          style={[
            styles.toastContainer,
            {
              transform: [{ translateY: toastAnim }],
              borderColor:
                toastMessage.type === 'success'
                  ? CyberColors.onlineBorder
                  : toastMessage.type === 'danger'
                  ? CyberColors.shutdownBorder
                  : CyberColors.sleepBorder,
            },
          ]}
        >
          <Text style={styles.toastEmoji}>
            {toastMessage.type === 'success' ? '✓' : toastMessage.type === 'danger' ? '⛔' : 'ℹ️'}
          </Text>
          <View style={styles.toastTextCol}>
            <Text style={styles.toastTitle}>{toastMessage.title}</Text>
            <Text style={styles.toastDesc}>{toastMessage.desc}</Text>
          </View>
        </Animated.View>
      )}

      {/* Top Header & Navigation */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerKicker}>
            {role === 'controller' ? '🎮 REMOTE CONTROLLER' : '📡 HOME GATEWAY RELAY'}
          </Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {stationConfig.stationName || 'DESKTOP-FIERRO'}
          </Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setIsDirectScannerOpen(true)}
            style={styles.settingsBtn}
          >
            <Text style={styles.settingsBtnText}>📷</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setIsSettingsOpen(true)}
            style={styles.settingsBtn}
          >
            <Text style={styles.settingsBtnText}>⚙️</Text>
          </TouchableOpacity>

          {/* Dual-Role Selector Pill */}
          <View style={styles.rolePicker}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setRole('controller')}
              style={[styles.roleBtn, role === 'controller' && styles.roleBtnActive]}
            >
              <Text style={styles.roleBtnText}>🎮 Remote</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setRole('bridge')}
              style={[styles.roleBtn, role === 'bridge' && styles.roleBtnActiveBridge]}
            >
              <Text style={styles.roleBtnText}>📡 Gateway</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Unconfigured Alert Banner */}
      {!stationConfig.stationKey && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setIsSettingsOpen(true)}
          style={styles.unconfiguredBanner}
        >
          <Text style={styles.unconfiguredBannerIcon}>⚠️</Text>
          <View style={styles.unconfiguredBannerCol}>
            <Text style={styles.unconfiguredBannerTitle}>Komputer Belum Dihubungkan</Text>
            <Text style={styles.unconfiguredBannerDesc}>
              Ketuk di sini untuk memindai QR Code PC atau masukkan Station Key & MAC.
            </Text>
          </View>
          <Text style={styles.unconfiguredBannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* ======================================================== */}
      {/* MODE 1: CONTROLLER (HP UTAMA DI TANGAN ANDA)              */}
      {/* ======================================================== */}
      {role === 'controller' ? (
        <ScrollView contentContainerStyle={styles.scrollPortrait} showsVerticalScrollIndicator={false}>
          {/* Gateway Status Pill */}
          <View style={styles.gatewayStatusCard}>
            <View style={styles.gatewayStatusRow}>
              <View
                style={[
                  styles.gatewayIndicator,
                  { backgroundColor: isGatewayActive ? CyberColors.online : '#94a3b8' },
                ]}
              />
              <Text style={styles.gatewayStatusText}>
                {isGatewayActive
                  ? 'HP Standby di Rumah: AKTIF (Siap Meneruskan)'
                  : 'HP Standby di Rumah: Menunggu Detak Jantung...'}
              </Text>
            </View>
          </View>

          <StatusCard status={pcStatus} activeTransition={activeTransition} />

          <CyberMasterCircle
            pcStatus={pcStatus}
            activeTransition={activeTransition}
            onPress={handleWake}
            size="normal"
            captionText={captionText}
          />

          <PowerGrid
            onAction={handlePowerAction}
            disabled={!!activeTransition}
          />

          <View style={styles.footerBar}>
            <View style={styles.footerDotRow}>
              <View style={[styles.liveDot, { backgroundColor: isCloudConnected ? CyberColors.online : '#ef4444' }]} />
              <Text style={styles.footerText}>
                Cloud: {isCloudConnected ? 'Connected (QoS 1)' : 'Offline'}
              </Text>
            </View>
            <Text style={styles.footerText}>
              Stasiun: {stationConfig.stationKey}
            </Text>
          </View>
        </ScrollView>
      ) : (
        // ========================================================
        // MODE 2: HOME GATEWAY (HP KEDUA STANDBY DI DEKAT PC)
        // ========================================================
        <ScrollView contentContainerStyle={styles.scrollBridge} showsVerticalScrollIndicator={false}>
          {/* Bridge Service Card */}
          <View style={[styles.bridgeCard, isBridgeRunning && styles.bridgeCardActive]}>
            <View style={styles.bridgeInfo}>
              <Text style={styles.bridgeTitle}>GATEWAY SIAGA 24/7 (RUMAH)</Text>
              <Text style={styles.bridgeSubtitle}>
                {isBridgeRunning
                  ? `Siaga meneruskan sinyal HP Utama ke PC '${stationConfig.stationName}'`
                  : 'Layanan gateway dihentikan sementara'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsBridgeRunning(!isBridgeRunning)}
              style={[styles.switchTrack, isBridgeRunning ? styles.switchOn : styles.switchOff]}
            >
              <View style={[styles.switchThumb, isBridgeRunning ? styles.thumbOn : styles.thumbOff]} />
            </TouchableOpacity>
          </View>

          {/* Live PC Physical Ping Status */}
          <View style={styles.pingStatusBox}>
            <Text style={styles.pingTitle}>STATUS FISIK PC DI LAN (PING WAKEDOG):</Text>
            <View style={styles.pingRow}>
              <View
                style={[
                  styles.pingDot,
                  { backgroundColor: pcStatus === 'ONLINE' ? CyberColors.online : '#ef4444' },
                ]}
              />
              <Text
                style={[
                  styles.pingValue,
                  { color: pcStatus === 'ONLINE' ? CyberColors.online : '#ef4444' },
                ]}
              >
                {pcStatus === 'ONLINE' ? 'ONLINE (Merespons Ping)' : 'OFFLINE / MATI (Siap Bangun)'}
              </Text>
            </View>
          </View>

          {/* Specs Card */}
          <View style={styles.specsCard}>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Status Cloud MQTT:</Text>
              <Text style={[styles.specValue, { color: isCloudConnected ? CyberColors.online : '#ef4444' }]}>
                {isCloudConnected ? '🟢 TERHUBUNG' : '🔴 TERPUTUS'}
              </Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Station Pairing Key:</Text>
              <Text style={[styles.specValue, { color: CyberColors.neonCyan }]}>
                {stationConfig.stationKey}
              </Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Target MAC LAN:</Text>
              <Text style={[styles.specValue, { color: '#ffffff' }]}>
                {stationConfig.macAddress}
              </Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Broadcast LAN:</Text>
              <Text style={styles.specValue}>
                {stationConfig.broadcastIp}:9
              </Text>
            </View>
          </View>

          {/* Terminal Log */}
          <View style={styles.terminalBox}>
            <View style={styles.terminalHeader}>
              <Text style={styles.terminalTitle}>LIVE PACKET RELAY LOG</Text>
              <View style={[styles.liveDot, { backgroundColor: isCloudConnected ? CyberColors.online : '#ef4444' }]} />
            </View>
            <ScrollView style={styles.logScrollView}>
              {logs.map((log, index) => (
                <Text key={index} style={styles.logText}>
                  {log}
                </Text>
              ))}
            </ScrollView>
          </View>

          <Text style={styles.batteryNote}>
            🛡️ CPU WakeLock Aktif: Ponsel ini tidak akan tertidur meski layar mati. Biarkan tercolok charger.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CyberColors.oledBlack,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerLeft: {
    flex: 1,
  },
  headerKicker: {
    color: CyberColors.neonIndigoBright,
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 1.5,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsBtnText: {
    fontSize: 16,
  },
  rolePicker: {
    flexDirection: 'row',
    backgroundColor: '#020617',
    borderRadius: 20,
    padding: 3,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  roleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
  },
  roleBtnActive: {
    backgroundColor: CyberColors.neonIndigo,
  },
  roleBtnActiveBridge: {
    backgroundColor: '#059669',
  },
  roleBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
  unconfiguredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#451a03',
    borderBottomWidth: 1,
    borderColor: '#f59e0b',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  unconfiguredBannerIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  unconfiguredBannerCol: {
    flex: 1,
  },
  unconfiguredBannerTitle: {
    color: '#fbbf24',
    fontSize: 13,
    fontWeight: 'bold',
  },
  unconfiguredBannerDesc: {
    color: '#fde68a',
    fontSize: 11,
    marginTop: 2,
  },
  unconfiguredBannerArrow: {
    color: '#fbbf24',
    fontSize: 18,
    fontWeight: 'bold',
  },
  gatewayStatusCard: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  gatewayStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gatewayIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  gatewayStatusText: {
    color: '#94a3b8',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  scrollPortrait: {
    padding: 20,
    alignItems: 'center',
    paddingBottom: 40,
  },
  scrollBridge: {
    padding: 20,
    paddingBottom: 40,
  },
  bridgeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
  },
  bridgeCardActive: {
    borderColor: '#059669',
    backgroundColor: '#06281e',
  },
  bridgeInfo: {
    flex: 1,
    paddingRight: 12,
  },
  bridgeTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  bridgeSubtitle: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  switchTrack: {
    width: 50,
    height: 28,
    borderRadius: 14,
    padding: 2,
  },
  switchOn: {
    backgroundColor: '#10b981',
  },
  switchOff: {
    backgroundColor: '#334155',
  },
  switchThumb: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ffffff',
  },
  thumbOn: {
    alignSelf: 'flex-end',
  },
  thumbOff: {
    alignSelf: 'flex-start',
  },
  pingStatusBox: {
    backgroundColor: '#09131d',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    marginBottom: 16,
  },
  pingTitle: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: 'monospace',
    letterSpacing: 1,
    marginBottom: 6,
  },
  pingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  pingValue: {
    fontSize: 14,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  specsCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    marginBottom: 16,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  specLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  specValue: {
    color: '#ffffff',
    fontSize: 12,
    fontFamily: 'monospace',
    fontWeight: 'bold',
  },
  terminalBox: {
    backgroundColor: '#020617',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    minHeight: 180,
  },
  terminalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 6,
  },
  terminalTitle: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: 'monospace',
    letterSpacing: 1.5,
  },
  logScrollView: {
    maxHeight: 150,
  },
  logText: {
    color: '#38bdf8',
    fontSize: 11,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  batteryNote: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 14,
    paddingHorizontal: 20,
  },
  footerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    marginTop: 16,
  },
  footerDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  footerText: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: '#0f172a',
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  toastEmoji: {
    fontSize: 20,
    marginRight: 12,
  },
  toastTextCol: {
    flex: 1,
  },
  toastTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  toastDesc: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
});
