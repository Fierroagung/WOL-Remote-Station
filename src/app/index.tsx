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
import {
  mqttClient,
  PCStatus,
  PowerAction,
  StationConfig,
  EMPTY_STATION_CONFIG,
} from '../services/mqttService';
import { StorageService } from '../services/storageService';
import { WOLService } from '../services/wolService';

type AppRole = 'controller' | 'bridge';

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 600;

  // State Konfigurasi Stasiun (Universal - Default Kosong)
  const [stationConfig, setStationConfig] = useState<StationConfig>(EMPTY_STATION_CONFIG);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // State Manajemen Daya & Peran
  const [role, setRole] = useState<AppRole>('controller');
  const [pcStatus, setPcStatus] = useState<PCStatus>('UNCONFIGURED');
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [activeTransition, setActiveTransition] = useState<PowerAction | 'waking' | null>(null);
  const [isBridgeRunning, setIsBridgeRunning] = useState<boolean>(true);
  const [logs, setLogs] = useState<string[]>([
    '[INIT] WOL Remote Station dimulai.',
  ]);

  // Awaiting timer ref for real hardware sync
  const actionTimeoutRef = useRef<any>(null);
  const wakeTimeoutRef = useRef<any>(null);

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

  useEffect(() => {
    // 1. Muat konfigurasi tersimpan dari storage
    const loadStoredConfig = async () => {
      try {
        const stored = await StorageService.getItem('wol_station_config');
        if (stored) {
          const parsed = JSON.parse(stored) as StationConfig;
          if (parsed && parsed.stationKey && parsed.stationKey.trim().length > 0) {
            setStationConfig(parsed);
            mqttClient.updateConfig(parsed);
            setPcStatus('OFFLINE');
          } else {
            setPcStatus('UNCONFIGURED');
          }
        } else {
          setPcStatus('UNCONFIGURED');
        }
      } catch {
        setPcStatus('UNCONFIGURED');
      }
    };
    loadStoredConfig();

    // 2. Listener status real-time dari PC
    const unsubStatus = mqttClient.onStatusChange((status, rawData) => {
      setPcStatus(status);

      // Verifikasi respons real-time PC untuk membatalkan timer timeout
      if (actionTimeoutRef.current) {
        clearTimeout(actionTimeoutRef.current);
        actionTimeoutRef.current = null;
        setActiveTransition(null);

        if (status === 'SLEEPING') {
          triggerToast('PC Berhasil Masuk Sleep', 'Windows mengonfirmasi mode hemat daya (Suspend S3).', 'info');
        } else if (status === 'OFFLINE') {
          triggerToast('PC Berhasil Dimatikan', 'Koneksi Windows terputus (Shutdown/Hibernasi terkonfirmasi).', 'danger');
        } else if (status === 'ONLINE') {
          triggerToast('PC Online Kembali', 'Windows Companion aktif dan terhubung.', 'success');
        }
      }

      // Verifikasi respons Wake Up
      if (wakeTimeoutRef.current && status === 'ONLINE') {
        clearTimeout(wakeTimeoutRef.current);
        wakeTimeoutRef.current = null;
        setActiveTransition(null);
        triggerToast('PC Berhasil Menyala!', 'Sinyal terkonfirmasi dari Windows Service (Boot Online OK).', 'success');
      }
    });

    // 3. Listener koneksi broker
    const unsubConn = mqttClient.onConnectionChange((connected) => {
      setIsCloudConnected(connected);
    });

    // 4. Listener log
    const unsubLog = mqttClient.onLog((newLog) => {
      setLogs((prev) => [newLog, ...prev.slice(0, 19)]);
    });

    // 5. Listener Sinyal Wake (Khusus Mode Bridge)
    const unsubWake = mqttClient.onWakeReceived(async (wakeData) => {
      if (role === 'bridge' && isBridgeRunning) {
        setLogs((prev) => [
          `[WAKE RELAY] Sinyal diterima dari HP Remote. Memancarkan Magic Packet ke ${wakeData.broadcastIp || '255.255.255.255'}...`,
          ...prev.slice(0, 19),
        ]);

        const sent = await WOLService.sendMagicPacket(
          wakeData.targetMac || stationConfig.macAddress,
          wakeData.broadcastIp || stationConfig.broadcastIp,
          9
        );

        if (sent) {
          setLogs((prev) => [
            `[WAKE SUKSES] 102-byte Magic Packet berhasil ditransmisikan ke LAN!`,
            ...prev.slice(0, 19),
          ]);
          triggerToast('Magic Packet Diteruskan', `Sinyal bangun ditransmisikan ke kabel LAN PC (${wakeData.targetMac}).`, 'info');
        } else {
          setLogs((prev) => [
            `[WAKE ERROR] Gagal mengirim paket native UDP. Pastikan izin jaringan aktif.`,
            ...prev.slice(0, 19),
          ]);
        }
      }
    });

    return () => {
      unsubStatus();
      unsubConn();
      unsubLog();
      unsubWake();
      if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
      if (wakeTimeoutRef.current) clearTimeout(wakeTimeoutRef.current);
    };
  }, [role, isBridgeRunning, stationConfig]);

  const handleSaveConfig = async (newConfig: StationConfig) => {
    setStationConfig(newConfig);
    mqttClient.updateConfig(newConfig);
    await StorageService.setItem('wol_station_config', JSON.stringify(newConfig));
    triggerToast('Konfigurasi Disimpan', `Terhubung ke stasiun: ${newConfig.stationKey}`, 'success');
  };

  // Handler Perintah Wake Up (Magic Packet)
  const handleWake = async () => {
    if (activeTransition) return;

    if (!stationConfig.stationKey || !stationConfig.macAddress) {
      triggerToast('Konfigurasi Belum Diisi', 'Silakan masukkan Station Key dan MAC PC di menu ⚙️ Pengaturan.', 'danger');
      setIsSettingsOpen(true);
      return;
    }

    if (pcStatus === 'ONLINE') {
      triggerToast('PC Sudah Online', 'Komputer Anda saat ini sudah menyala dan siap digunakan.', 'info');
      return;
    }

    setActiveTransition('waking');

    // 1. Kirim via Cloud MQTT (agar diterima HP Bridge di rumah)
    const mqttSent = await mqttClient.sendWakeCommand();

    // 2. Kirim juga secara native UDP broadcast lokal (jika HP ini sedang di Wi-Fi rumah yang sama)
    await WOLService.sendMagicPacket(stationConfig.macAddress, stationConfig.broadcastIp, 9);

    if (!mqttSent && !isCloudConnected) {
      triggerToast('Koneksi Cloud Terputus', 'Sinyal hanya dicoba via LAN lokal. Hubungkan ponsel ke internet jika berada di luar rumah.', 'danger');
    } else {
      triggerToast('Sinyal WAKE Dikirim', 'Menunggu PC menyala dan melapor ke Cloud (maks. 25 detik)...', 'info');
    }

    // 3. Pasang timeout nyata: jika 25 detik PC belum Online, beri tahu user bahwa gagal
    if (wakeTimeoutRef.current) clearTimeout(wakeTimeoutRef.current);
    wakeTimeoutRef.current = setTimeout(() => {
      wakeTimeoutRef.current = null;
      setActiveTransition(null);
      triggerToast(
        'PC Belum Menyala',
        'Magic Packet telah dikirim tapi PC belum merespons. Pastikan fitur Wake-On-LAN aktif di BIOS dan kabel LAN terhubung.',
        'danger'
      );
    }, 25000);
  };

  // Handler Kontrol Daya (Sleep, Hibernate, Restart, Shutdown)
  const handlePowerAction = async (action: PowerAction) => {
    if (activeTransition) return;

    if (!stationConfig.stationKey) {
      triggerToast('Konfigurasi Belum Diisi', 'Silakan masukkan Station Key PC di menu ⚙️ Pengaturan.', 'danger');
      setIsSettingsOpen(true);
      return;
    }

    if (!isCloudConnected) {
      triggerToast('Gagal: Cloud Terputus', 'Ponsel belum terhubung ke Cloud MQTT. Periksa koneksi internet Anda.', 'danger');
      return;
    }

    if (pcStatus === 'OFFLINE' || pcStatus === 'UNCONFIGURED') {
      triggerToast('PC Sedang Mati / Offline', 'Perintah daya hanya bisa dieksekusi saat komputer sedang ON. Gunakan tombol WAKE UP untuk menyalakan.', 'danger');
      return;
    }

    setActiveTransition(action);
    const sent = await mqttClient.sendPowerAction(action);

    if (!sent) {
      setActiveTransition(null);
      triggerToast('Gagal Mengirim', `Perintah ${action.toUpperCase()} gagal diteruskan ke broker.`, 'danger');
      return;
    }

    // Pasang timeout nyata: jika 8 detik PC tidak merespons (misal Companion tidak dibuka di PC)
    if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
    actionTimeoutRef.current = setTimeout(() => {
      actionTimeoutRef.current = null;
      setActiveTransition(null);
      triggerToast(
        'Perintah Tidak Direspons',
        `PC tidak merespons perintah ${action.toUpperCase()} dalam 8 detik. Pastikan run_companion.bat sedang berjalan di PC Anda.`,
        'danger'
      );
    }, 8000);
  };

  const captionText =
    pcStatus === 'UNCONFIGURED'
      ? '⚠️ Belum dikonfigurasi. Klik ⚙️ di pojok kanan atas.'
      : activeTransition === 'waking'
      ? '📡 Menunggu konfirmasi Windows Service boot up...'
      : activeTransition === 'shutdown'
      ? '⏳ Menunggu Windows menutup proses & memutus socket...'
      : activeTransition === 'sleep'
      ? '💤 Menunggu Windows memasuki status Suspend (S3)...'
      : activeTransition === 'hibernate'
      ? '❄️ Menunggu Windows menyimpan RAM ke SSD...'
      : activeTransition === 'restart'
      ? '🔄 Menunggu Windows mulai ulang dan online kembali...'
      : pcStatus === 'ONLINE'
      ? 'PC telah aktif dan siap dikontrol secara realtime'
      : 'Ketuk tombol untuk membangunkan komputer via LAN';

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Settings Modal (Universal Configuration) */}
      <SettingsModal
        visible={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        config={stationConfig}
        onSave={handleSaveConfig}
      />

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
            {role === 'controller' ? 'REMOTE WORKSTATION' : 'STANDBY RELAY'}
          </Text>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {stationConfig.stationName || 'Belum Dikonfigurasi'}
          </Text>
        </View>

        <View style={styles.headerRight}>
          {/* Settings Button */}
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
              <Text style={styles.roleBtnText}>📡 Bridge</Text>
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
              Ketuk di sini untuk memasukkan Station Key & MAC Address dari PC Anda.
            </Text>
          </View>
          <Text style={styles.unconfiguredBannerArrow}>→</Text>
        </TouchableOpacity>
      )}

      {/* ======================================================== */}
      {/* MODE 1: CONTROLLER (HP UTAMA - UNIVERSAL)                 */}
      {/* ======================================================== */}
      {role === 'controller' ? (
        isLandscape || isTablet ? (
          // TABLET / LANDSCAPE 2-KOLOM (COMMAND CENTER)
          <View style={styles.landscapeRow}>
            {/* Kolom Kiri: Master Hub Circle */}
            <View style={styles.colLeft}>
              <CyberMasterCircle
                pcStatus={pcStatus}
                activeTransition={activeTransition}
                onPress={handleWake}
                size={isTablet ? 'large' : 'compact'}
                captionText={captionText}
              />
              <Text style={styles.stationKeyBadge}>
                KEY: {stationConfig.stationKey || 'KOSONG'}
              </Text>
            </View>

            {/* Kolom Kanan: Status & Power Grid */}
            <View style={styles.colRight}>
              <StatusCard status={pcStatus} activeTransition={activeTransition} />
              <PowerGrid
                onAction={handlePowerAction}
                disabled={!!activeTransition || pcStatus === 'UNCONFIGURED'}
                compact={!isTablet}
              />

              <View style={styles.footerBar}>
                <View style={styles.footerDotRow}>
                  <View style={[styles.liveDot, { backgroundColor: isCloudConnected ? CyberColors.online : '#ef4444' }]} />
                  <Text style={styles.footerText}>
                    Cloud: {isCloudConnected ? 'Connected (QoS 1)' : 'Offline'}
                  </Text>
                </View>
                <Text style={styles.footerText}>
                  Stasiun: {stationConfig.stationKey || 'Belum Diset'}
                </Text>
              </View>
            </View>
          </View>
        ) : (
          // SMARTPHONE PORTRAIT (VERTICAL FLOW)
          <ScrollView contentContainerStyle={styles.scrollPortrait} showsVerticalScrollIndicator={false}>
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
              disabled={!!activeTransition || pcStatus === 'UNCONFIGURED'}
            />

            <View style={styles.footerBar}>
              <View style={styles.footerDotRow}>
                <View style={[styles.liveDot, { backgroundColor: isCloudConnected ? CyberColors.online : '#ef4444' }]} />
                <Text style={styles.footerText}>
                  Cloud: {isCloudConnected ? 'Connected' : 'Offline'}
                </Text>
              </View>
              <Text style={styles.footerText}>
                Stasiun: {stationConfig.stationKey || 'Belum Diset'}
              </Text>
            </View>
          </ScrollView>
        )
      ) : (
        // ========================================================
        // MODE 2: STANDBY BRIDGE (HP RUMAH NGANGGUR)
        // ========================================================
        <ScrollView contentContainerStyle={styles.scrollBridge} showsVerticalScrollIndicator={false}>
          {/* Bridge Service Card */}
          <View style={[styles.bridgeCard, isBridgeRunning && styles.bridgeCardActive]}>
            <View style={styles.bridgeInfo}>
              <Text style={styles.bridgeTitle}>Layanan WOL Listener (Bridge)</Text>
              <Text style={styles.bridgeSubtitle}>
                {isBridgeRunning
                  ? stationConfig.stationKey
                    ? `Mendengarkan stasiun '${stationConfig.stationKey}' 24/7`
                    : 'Menunggu konfigurasi stasiun di menu ⚙️'
                  : 'Layanan dihentikan sementara'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsBridgeRunning(!isBridgeRunning)}
              style={[styles.switchTrack, isBridgeRunning ? styles.switchOn : styles.switchOff]}
            >
              <View style={[styles.switchThumb, isBridgeRunning ? styles.thumbOn : styles.thumbOff]} />
            </TouchableOpacity>
          </View>

          {/* Network & Pairing Specs */}
          <View style={styles.specsCard}>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Status Koneksi Cloud:</Text>
              <Text style={[styles.specValue, { color: isCloudConnected ? CyberColors.online : '#ef4444' }]}>
                {isCloudConnected ? '🟢 TERHUBUNG' : '🔴 TERPUTUS'}
              </Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Station Pairing Key:</Text>
              <Text style={[styles.specValue, { color: CyberColors.neonCyan }]}>
                {stationConfig.stationKey || '(Kosong)'}
              </Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Target MAC PC:</Text>
              <Text style={[styles.specValue, { color: '#ffffff' }]}>
                {stationConfig.macAddress || '(Kosong)'}
              </Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Broadcast LAN:</Text>
              <Text style={styles.specValue}>
                {stationConfig.broadcastIp ? `${stationConfig.broadcastIp}:9` : '(Kosong)'}
              </Text>
            </View>
          </View>

          {/* Terminal Log */}
          <View style={styles.terminalBox}>
            <View style={styles.terminalHeader}>
              <Text style={styles.terminalTitle}>LIVE PACKET LOG</Text>
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
            🛡️ Baterai dioptimalkan: Standby Bridge berjalan sangat hemat daya di latar belakang.
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
    gap: 10,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtnText: {
    fontSize: 16,
  },
  rolePicker: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  roleBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  roleBtnActive: {
    backgroundColor: '#4338ca',
  },
  roleBtnActiveBridge: {
    backgroundColor: '#065f46',
  },
  roleBtnText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  unconfiguredBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(234, 179, 8, 0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(234, 179, 8, 0.3)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  unconfiguredBannerIcon: {
    fontSize: 18,
  },
  unconfiguredBannerCol: {
    flex: 1,
  },
  unconfiguredBannerTitle: {
    color: '#fef08a',
    fontSize: 12,
    fontWeight: '700',
  },
  unconfiguredBannerDesc: {
    color: '#fef9c3',
    fontSize: 10,
    marginTop: 1,
  },
  unconfiguredBannerArrow: {
    color: '#fef08a',
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollPortrait: {
    padding: 20,
    justifyContent: 'space-between',
    flexGrow: 1,
  },
  landscapeRow: {
    flex: 1,
    flexDirection: 'row',
    padding: 20,
    gap: 20,
  },
  colLeft: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#1e293b',
    paddingRight: 16,
  },
  colRight: {
    flex: 1,
    justifyContent: 'space-between',
    paddingLeft: 4,
  },
  stationKeyBadge: {
    color: CyberColors.neonCyan,
    fontSize: 10,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
    marginTop: 8,
  },
  footerDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  footerText: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  scrollBridge: {
    padding: 20,
    gap: 16,
  },
  bridgeCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  bridgeCardActive: {
    borderColor: 'rgba(16, 185, 129, 0.4)',
    backgroundColor: '#091e1d',
  },
  bridgeInfo: {
    flex: 1,
    paddingRight: 12,
  },
  bridgeTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  bridgeSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
    lineHeight: 16,
  },
  switchTrack: {
    width: 52,
    height: 30,
    borderRadius: 15,
    padding: 3,
    justifyContent: 'center',
  },
  switchOn: {
    backgroundColor: CyberColors.online,
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
  specsCard: {
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 12,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  specLabel: {
    color: '#64748b',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  specValue: {
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: '700',
    color: '#e2e8f0',
  },
  terminalBox: {
    backgroundColor: '#020617',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    minHeight: 180,
  },
  terminalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    marginBottom: 10,
  },
  terminalTitle: {
    color: CyberColors.neonCyan,
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  logScrollView: {
    maxHeight: 150,
  },
  logText: {
    color: '#a7f3d0',
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 17,
  },
  batteryNote: {
    color: '#64748b',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
  toastContainer: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: '#0f172a',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  toastEmoji: {
    fontSize: 18,
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
    lineHeight: 15,
  },
});
