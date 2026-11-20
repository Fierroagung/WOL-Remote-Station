import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
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
      // 2. Fallback: jika berupa teks biasa (misalnya hanya Station Key)
      if (data.startsWith('WOL-')) {
        onScanSuccess({ stationKey: data.trim() });
        onClose();
        return;
      }
    }

    // Jika format tidak dikenali
    alert('Format QR Code tidak dikenali. Pastikan Anda memindai QR Code dari aplikasi WOL Remote Station di PC.');
    setTimeout(() => setIsScanned(false), 2000);
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
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
            <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
              <Text style={styles.grantBtnText}>Berikan Izin Kamera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
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

            {/* Viewfinder Target Reticle */}
            <View style={styles.overlay}>
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
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    backgroundColor: '#0f172a',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    marginTop: Platform.OS === 'android' ? 24 : 44,
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
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 6, 23, 0.45)',
  },
  scanTarget: {
    width: 260,
    height: 260,
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    width: 32,
    height: 32,
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
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 32,
    textAlign: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingVertical: 8,
    borderRadius: 20,
  },
});
