import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
  Vibration,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { CyberColors } from '../theme/colors';
import { StationConfig } from '../services/mqttService';

interface QRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScanSuccess: (scannedConfig: Partial<StationConfig>) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({
  visible,
  onClose,
  onScanSuccess,
}) => {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torch, setTorch] = useState<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);

  // Animasi Laser Bar Scanner Naik-Turun
  const scanLineAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      isProcessingRef.current = false;
      const scanLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 240,
            duration: 1800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 1800,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      scanLoop.start();
      return () => scanLoop.stop();
    }
  }, [visible]);

  if (!visible) return null;

  const handleBarcodeScanned = (scanningResult: BarcodeScanningResult) => {
    // Sinkronisasi kunci instan agar tidak dobel-trigger antar frame 60fps
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const data = scanningResult?.data;
    if (!data || typeof data !== 'string') {
      isProcessingRef.current = false;
      return;
    }

    try {
      // 1. Coba parse JSON payload resmi (mendukung camelCase & snake_case)
      const parsed = JSON.parse(data.trim());
      if (parsed && typeof parsed === 'object') {
        const stationName = parsed.stationName || parsed.station_name || parsed.name || 'RIG-STATION-PRO';
        const stationKey = parsed.stationKey || parsed.station_key || parsed.key || '';
        const macAddress = parsed.macAddress || parsed.mac_address || parsed.mac || '';
        const broadcastIp = parsed.broadcastIp || parsed.broadcast_ip || parsed.ip || '192.168.0.255';
        const brokerUrl = parsed.mqttBroker || parsed.brokerUrl || parsed.broker_host || parsed.broker || 'broker.hivemq.com';

        if (stationKey || macAddress) {
          try {
            Vibration.vibrate(80);
          } catch {}

          onScanSuccess({
            stationName: String(stationName).trim(),
            stationKey: String(stationKey).trim(),
            macAddress: String(macAddress).trim().toUpperCase(),
            broadcastIp: String(broadcastIp).trim(),
            brokerUrl: String(brokerUrl).trim(),
          });
          onClose();
          return;
        }
      }
    } catch {
      // 2. Fallback jika berupa teks biasa (misalnya hanya teks Station Key: WOL-XXXX-PC)
      const trimmed = data.trim();
      if (trimmed.startsWith('WOL-') || trimmed.includes('-PC')) {
        try {
          Vibration.vibrate(80);
        } catch {}

        onScanSuccess({ stationKey: trimmed });
        onClose();
        return;
      }
    }

    // Jika format tidak dikenali
    Alert.alert(
      'QR Code Tidak Dikenali',
      'Format kode QR yang dipindai bukan dari aplikasi WOL Remote Station PC.\n\nBuka aplikasi Desktop di PC Anda untuk melihat QR Code yang valid.',
      [
        {
          text: 'Pindai Lagi',
          onPress: () => {
            isProcessingRef.current = false;
          },
        },
        {
          text: 'Tutup',
          style: 'cancel',
          onPress: onClose,
        },
      ]
    );
  };

  // 1. Menunggu status izin kamera (mencegah flickering layar izin)
  if (!permission) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={CyberColors.neonCyan} />
        <Text style={styles.loadingText}>Menyiapkan Pemindai Kamera...</Text>
      </View>
    );
  }

  // 2. Jika izin kamera belum diberikan atau ditolak
  if (!permission.granted) {
    const isPermanentlyDenied = !permission.canAskAgain;

    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.permissionBox} edges={['top', 'bottom', 'left', 'right']}>
          <Text style={styles.permissionIcon}>📷</Text>
          <Text style={styles.permissionTitle}>Izin Akses Kamera Diperlukan</Text>
          <Text style={styles.permissionDesc}>
            {isPermanentlyDenied
              ? 'Izin kamera sebelumnya ditolak di pengaturan perangkat Anda. Silakan aktifkan izin kamera secara manual untuk menggunakan fitur pemindai QR Code.'
              : 'Aplikasi memerlukan akses kamera untuk memindai kode QR stasiun PC Anda secara instan dan otomatis tanpa perlu mengetik manual.'}
          </Text>

          {isPermanentlyDenied ? (
            <TouchableOpacity
              style={styles.grantBtn}
              onPress={() => Linking.openSettings()}
              activeOpacity={0.8}
            >
              <Text style={styles.grantBtnText}>⚙️ Buka Pengaturan HP</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.grantBtn}
              onPress={requestPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.grantBtnText}>✓ Berikan Izin Kamera</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.cancelLink} onPress={onClose} activeOpacity={0.7}>
            <Text style={styles.cancelLinkText}>Batal / Kembali</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  // 3. Tampilan Utama Pemindai Kamera Aktif
  return (
    <View style={styles.container}>
      {/* Native Camera View Full Screen */}
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{
          barcodeTypes: ['qr'],
        }}
        onBarcodeScanned={handleBarcodeScanned}
      />

      {/* Lapisan UI Overlay */}
      <View style={styles.overlayContainer} pointerEvents="box-none">
        {/* Header Bar Penuh & Luwes (Termasuk Status Bar / Notch) */}
        <View style={[styles.headerWrapper, { paddingTop: Math.max(insets.top, 14) }]}>
          <View style={styles.header}>
            {/* Tombol Kembali Lebih Luas & Haptic */}
            <TouchableOpacity
              onPress={() => {
                try {
                  Vibration.vibrate(25);
                } catch {}
                onClose();
              }}
              style={styles.closeBtn}
              activeOpacity={0.7}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <Text style={styles.closeBtnText}>← Kembali</Text>
            </TouchableOpacity>

            {/* Judul Tengah dengan Subtitle Status */}
            <View style={styles.headerTitleBox}>
              <Text style={styles.headerTitle}>PINDAI QR PC</Text>
              <Text style={styles.headerSubtitle}>KAMERA AKTIF</Text>
            </View>

            {/* Tombol Senter Lebih Luas, Rapi & Haptic */}
            <TouchableOpacity
              onPress={() => {
                try {
                  Vibration.vibrate(30);
                } catch {}
                setTorch((prev) => !prev);
              }}
              style={[styles.torchBtn, torch && styles.torchBtnActive]}
              activeOpacity={0.7}
              hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
            >
              <Text style={[styles.torchBtnText, torch && styles.torchBtnTextActive]}>
                {torch ? '🔦 Nyala' : '💡 Senter'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Viewfinder Reticle dengan Garis Laser Bergerak */}
        <View style={styles.reticleContainer} pointerEvents="none">
          <View style={styles.scanTarget}>
            {/* 4 Sudut Glowing Cyan */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />

            {/* Animasi Garis Laser Pemindai */}
            <Animated.View
              style={[
                styles.scanLaser,
                {
                  transform: [{ translateY: scanLineAnim }],
                },
              ]}
            />
          </View>
          <Text style={styles.instructionText}>
            Arahkan kamera ke QR Code di layar PC Anda
          </Text>
        </View>

        {/* Bottom Helper Bar */}
        <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 20) }]} pointerEvents="none">
          <Text style={styles.bottomTipText}>
            Buka aplikasi "WOL Remote Station" di PC Windows untuk melihat kode QR
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: '#020617',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 14,
    marginTop: 16,
    fontWeight: '600',
  },
  overlayContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
  },
  headerWrapper: {
    backgroundColor: 'rgba(15, 23, 42, 0.96)',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    width: '100%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  closeBtnText: {
    color: '#38bdf8',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.3,
  },
  headerTitleBox: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 8,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  headerSubtitle: {
    color: CyberColors.neonCyan,
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 1.2,
    marginTop: 2,
  },
  torchBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  torchBtnActive: {
    backgroundColor: '#ca8a04',
    borderColor: '#eab308',
  },
  torchBtnText: {
    color: '#fef08a',
    fontWeight: 'bold',
    fontSize: 13,
  },
  torchBtnTextActive: {
    color: '#ffffff',
  },
  reticleContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  scanTarget: {
    width: 260,
    height: 260,
    position: 'relative',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  scanLaser: {
    position: 'absolute',
    left: 8,
    right: 8,
    top: 0,
    height: 2.5,
    backgroundColor: CyberColors.neonCyan,
    shadowColor: CyberColors.neonCyan,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 6,
    elevation: 4,
  },
  corner: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderColor: CyberColors.neonCyan,
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  instructionText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 28,
    textAlign: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingBottom: 20,
    alignItems: 'center',
  },
  bottomTipText: {
    color: '#94a3b8',
    fontSize: 11,
    textAlign: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.8)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  permissionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    backgroundColor: '#020617',
  },
  permissionIcon: {
    fontSize: 54,
    marginBottom: 20,
  },
  permissionTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  permissionDesc: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  grantBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  grantBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  cancelLink: {
    padding: 10,
  },
  cancelLinkText: {
    color: '#64748b',
    fontSize: 14,
  },
});
