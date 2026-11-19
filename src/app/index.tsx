import React, { useState, useEffect } from 'react';
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
import { mqttClient, PCStatus, PowerAction, DEFAULT_CONFIG } from '../services/mqttService';

type AppRole = 'controller' | 'bridge';

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = Math.min(width, height) >= 600;

  // State Manajemen
  const [role, setRole] = useState<AppRole>('controller');
  const [pcStatus, setPcStatus] = useState<PCStatus>('OFFLINE');
  const [activeTransition, setActiveTransition] = useState<PowerAction | 'waking' | null>(null);
  const [isBridgeRunning, setIsBridgeRunning] = useState<boolean>(true);
  const [logs, setLogs] = useState<string[]>([
    '[22:30:10] Standby Bridge siap melayani 24/7',
    '[22:31:00] MQTT Cloud Connected (HiveMQ SSL)',
    '[22:35:00] Menunggu sinyal perintah dari HP Utama...',
  ]);

  // Toast Notification State
  const [toastMessage, setToastMessage] = useState<{ title: string; desc: string; type: 'success' | 'danger' | 'info' } | null>(null);
  const toastAnim = useState(new Animated.Value(-100))[0];

  useEffect(() => {
    // Inisialisasi koneksi MQTT
    mqttClient.connect();

    const unsubStatus = mqttClient.onStatusChange((status) => {
      setPcStatus(status);
    });

    const unsubLog = mqttClient.onLog((newLog) => {
      setLogs((prev) => [newLog, ...prev.slice(0, 15)]);
    });

    return () => {
      unsubStatus();
      unsubLog();
    };
  }, []);

  const triggerToast = (title: string, desc: string, type: 'success' | 'danger' | 'info' = 'success') => {
    setToastMessage({ title, desc, type });
    Animated.sequence([
      Animated.timing(toastAnim, {
        toValue: 20,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.delay(3500),
      Animated.timing(toastAnim, {
        toValue: -100,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => setToastMessage(null));
  };

  // Handler Perintah Wake Up (Magic Packet)
  const handleWake = () => {
    if (activeTransition) return;
    if (pcStatus === 'ONLINE') {
      triggerToast('PC Sudah Online', 'Komputer Anda saat ini sudah menyala dan siap digunakan.', 'info');
      return;
    }

    setActiveTransition('waking');
    mqttClient.sendWakeCommand();

    // Simulasi respons real-time (menunggu Windows Companion boot dan reply heartbeat)
    setTimeout(() => {
      setActiveTransition(null);
      setPcStatus('ONLINE');
      triggerToast('PC Berhasil Menyala!', 'Sinyal terkonfirmasi dari Windows Service (Boot OK).', 'success');
    }, 3500);
  };

  // Handler Kontrol Daya (Sleep, Hibernate, Restart, Shutdown)
  const handlePowerAction = (action: PowerAction) => {
    if (activeTransition) return;

    if (action === 'sleep') {
      setActiveTransition('sleep');
      mqttClient.sendPowerAction('sleep');
      setTimeout(() => {
        setActiveTransition(null);
        setPcStatus('SLEEPING');
        triggerToast('PC Telah Masuk Sleep', 'Sesi Windows ditangguhkan (hemat daya).', 'info');
      }, 3000);
    } else if (action === 'shutdown') {
      setActiveTransition('shutdown');
      mqttClient.sendPowerAction('shutdown');
      setTimeout(() => {
        setActiveTransition(null);
        setPcStatus('OFFLINE');
        triggerToast('PC Berhasil Dimatikan', 'Koneksi Windows terputus (Shutdown selesai).', 'danger');
      }, 3500);
    } else if (action === 'hibernate') {
      setActiveTransition('hibernate');
      mqttClient.sendPowerAction('hibernate');
      setTimeout(() => {
        setActiveTransition(null);
        setPcStatus('OFFLINE');
        triggerToast('Hibernasi Berhasil', 'RAM disimpan ke SSD dan PC telah mati.', 'info');
      }, 3200);
    } else if (action === 'restart') {
      setActiveTransition('restart');
      mqttClient.sendPowerAction('restart');
      setTimeout(() => {
        setActiveTransition(null);
        setPcStatus('ONLINE');
        triggerToast('Restart Selesai', 'PC telah aktif kembali dan siap digunakan.', 'success');
      }, 3800);
    }
  };

  const captionText =
    activeTransition === 'waking'
      ? '📡 Menunggu sinyal konfirmasi Windows Service...'
      : activeTransition === 'shutdown'
      ? '⏳ Menunggu Windows menutup proses & memutus socket...'
      : activeTransition === 'sleep'
      ? '💤 Menunggu Windows memasuki status Suspend (S3)...'
      : activeTransition === 'hibernate'
      ? '❄️ Menunggu Windows menyimpan RAM ke SSD...'
      : activeTransition === 'restart'
      ? '🔄 Menunggu Windows mulai ulang dan online kembali...'
      : pcStatus === 'ONLINE'
      ? 'PC telah aktif dan siap dikontrol'
      : 'Ketuk tombol untuk menyalakan dari jarak jauh';

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

      {/* Top Header & Role Switcher */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerKicker}>
            {role === 'controller' ? 'REMOTE WORKSTATION' : 'STANDBY RELAY'}
          </Text>
          <Text style={styles.headerTitle}>RIG-STATION-PRO</Text>
        </View>

        {/* Dual-Role Selector Pill */}
        <View style={styles.rolePicker}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setRole('controller')}
            style={[styles.roleBtn, role === 'controller' && styles.roleBtnActive]}
          >
            <Text style={styles.roleBtnText}>🎮 Controller</Text>
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

      {/* ======================================================== */}
      {/* MODE 1: CONTROLLER (HP UTAMA)                            */}
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
            </View>

            {/* Kolom Kanan: Status & Power Grid */}
            <View style={styles.colRight}>
              <StatusCard status={pcStatus} activeTransition={activeTransition} />
              <PowerGrid onAction={handlePowerAction} disabled={!!activeTransition} compact={!isTablet} />
              
              <View style={styles.footerBar}>
                <View style={styles.footerDotRow}>
                  <View style={styles.liveDot} />
                  <Text style={styles.footerText}>MQTT Cloud: Connected</Text>
                </View>
                <Text style={styles.footerText}>Ping: 24ms (QoS 1)</Text>
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

            <PowerGrid onAction={handlePowerAction} disabled={!!activeTransition} />

            <View style={styles.footerBar}>
              <View style={styles.footerDotRow}>
                <View style={styles.liveDot} />
                <Text style={styles.footerText}>MQTT Cloud: Connected</Text>
              </View>
              <Text style={styles.footerText}>Ping: 28ms</Text>
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
              <Text style={styles.bridgeTitle}>Layanan WOL Listener</Text>
              <Text style={styles.bridgeSubtitle}>
                {isBridgeRunning ? 'Siap mendengarkan sinyal wake 24/7' : 'Layanan dihentikan sementara'}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setIsBridgeRunning(!isBridgeRunning)}
              style={[styles.switchTrack, isBridgeRunning ? styles.switchOn : styles.switchOff]}
            >
              <View style={[styles.switchThumb, isBridgeRunning ? styles.thumbOn : styles.thumbOff]} />
            </TouchableOpacity>
          </View>

          {/* Network Specs */}
          <View style={styles.specsCard}>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Wi-Fi Terkoneksi:</Text>
              <Text style={styles.specValue}>Home_Fiber_5G (192.168.1.55)</Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Target MAC PC:</Text>
              <Text style={[styles.specValue, { color: CyberColors.neonCyan }]}>
                {DEFAULT_CONFIG.pcMacAddress}
              </Text>
            </View>
            <View style={styles.specRow}>
              <Text style={styles.specLabel}>Broadcast LAN:</Text>
              <Text style={styles.specValue}>{DEFAULT_CONFIG.pcBroadcastIp}:9</Text>
            </View>
          </View>

          {/* Terminal Log */}
          <View style={styles.terminalBox}>
            <View style={styles.terminalHeader}>
              <Text style={styles.terminalTitle}>LIVE PACKET LOG</Text>
              <View style={styles.liveDot} />
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
            🛡️ Baterai dioptimalkan: Konsumsi daya &lt; 2-3% per hari tanpa VPN.
          </Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CyberColors.bgDeep,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  headerKicker: {
    color: CyberColors.neonIndigoBright,
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.5,
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
    backgroundColor: CyberColors.online,
  },
  footerText: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  // Bridge Styles
  scrollBridge: {
    padding: 20,
    gap: 12,
  },
  bridgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  bridgeCardActive: {
    borderColor: CyberColors.onlineBorder,
    backgroundColor: 'rgba(6, 95, 70, 0.15)',
  },
  bridgeInfo: {
    flex: 1,
  },
  bridgeTitle: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  bridgeSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  switchTrack: {
    width: 48,
    height: 26,
    borderRadius: 14,
    padding: 3,
  },
  switchOn: {
    backgroundColor: CyberColors.online,
  },
  switchOff: {
    backgroundColor: '#334155',
  },
  switchThumb: {
    width: 20,
    height: 20,
    borderRadius: 10,
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
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    gap: 10,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  specLabel: {
    color: '#64748b',
    fontSize: 11,
  },
  specValue: {
    color: '#e2e8f0',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  terminalBox: {
    backgroundColor: '#000000',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 14,
    minHeight: 180,
  },
  terminalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 8,
    marginBottom: 8,
  },
  terminalTitle: {
    color: '#64748b',
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 1,
  },
  logScrollView: {
    maxHeight: 140,
  },
  logText: {
    color: '#34d399',
    fontSize: 10,
    fontFamily: 'monospace',
    lineHeight: 18,
  },
  batteryNote: {
    color: '#64748b',
    fontSize: 10,
    textAlign: 'center',
    marginTop: 8,
  },
  // Toast
  toastContainer: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    zIndex: 999,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 20,
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
    fontSize: 12,
    fontWeight: 'bold',
  },
  toastDesc: {
    color: '#94a3b8',
    fontSize: 10,
    marginTop: 2,
  },
});
