import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
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
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanned, setIsScanned] = useState(false);

  if (!visible) return null;

  const handleBarcodeScanned = ({ data }: { data: string }) => {
    if (isScanned) return;
    setIsScanned(true);

    try {
      // 1. Coba parse JSON payload resmi dari WOL Companion GUI
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        const result: Partial<StationConfig> = {
          stationName: parsed.stationName || parsed.name || 'RIG-STATION-PRO',
          stationKey: parsed.stationKey || parsed.key || '',
          macAddress: parsed.macAddress || parsed.mac || '',
          broadcastIp: parsed.broadcastIp || parsed.ip || '192.168.0.255',
          brokerUrl: parsed.mqttBroker || parsed.broker || 'broker.hivemq.com',
        };
        onScanSuccess(result);
        onClose();
        return;
      }
    } catch {
      // 2. Fallback jika berupa teks biasa (misalnya hanya Station Key)
      if (data.startsWith('WOL-')) {
        onScanSuccess({ stationKey: data.trim() });
        onClose();
        return;
      }
    }

    alert('Format QR Code tidak dikenali. Pastikan Anda memindai QR Code dari aplikasi WOL Remote Station di PC.');
    setTimeout(() => setIsScanned(false), 2000);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.innerSafe} edges={['top', 'bottom', 'left', 'right']}>
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Text style={styles.closeBtnText}>← Kembali</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>PINDAI QR CODE PC</Text>
          <View style={{ width: 60 }} />
        </View>

        {/* Permission Request Check */}
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionIcon}>📷</Text>
            <Text style={styles.permissionTitle}>Izin Kamera Diperlukan</Text>
            <Text style={styles.permissionDesc}>
              Aplikasi memerlukan akses kamera untuk memindai kode QR stasiun PC Anda secara instan.
            </Text>
            <TouchableOpacity style={styles.grantBtn} onPress={requestPermission} activeOpacity={0.8}>
              <Text style={styles.grantBtnText}>Berikan Izin Kamera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelLink} onPress={onClose} activeOpacity={0.7}>
              <Text style={styles.cancelLinkText}>Batal</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.cameraWrapper}>
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr'],
              }}
              onBarcodeScanned={isScanned ? undefined : handleBarcodeScanned}
            />

            {/* Viewfinder Target Reticle (Transparan Penuh Tanpa Lapisan Gelap) */}
            <View style={styles.overlay} pointerEvents="none">
              <View style={styles.scanTarget}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>

              <Text style={styles.instructionText}>
                Arahkan kamera ke QR Code di layar PC Anda
              </Text>
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000000',
    zIndex: 9999,
    elevation: 9999,
  },
  innerSafe: {
    flex: 1,
    backgroundColor: '#000000',
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  closeBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  closeBtnText: {
    color: '#38bdf8',
    fontWeight: '600',
    fontSize: 14,
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: 'bold',
    letterSpacing: 1,
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
    marginBottom: 8,
  },
  permissionDesc: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  grantBtn: {
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginBottom: 16,
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
  cameraWrapper: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  scanTarget: {
    width: 270,
    height: 270,
    position: 'relative',
    backgroundColor: 'transparent',
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
    fontSize: 14,
    fontWeight: '600',
    marginTop: 36,
    textAlign: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
});
