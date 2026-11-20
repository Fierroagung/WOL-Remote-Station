import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  Platform,
  Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CyberColors } from '../theme/colors';
import { StationConfig, sanitizeBrokerUrl } from '../services/mqttService';
import { QRScannerModal } from './QRScannerModal';

interface SettingsModalProps {
  visible: boolean;
  onClose: () => void;
  config: StationConfig;
  onSave: (newConfig: StationConfig) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  visible,
  onClose,
  config,
  onSave,
}) => {
  const [stationName, setStationName] = useState(config.stationName || '');
  const [stationKey, setStationKey] = useState(config.stationKey || '');
  const [macAddress, setMacAddress] = useState(config.macAddress || '');
  const [broadcastIp, setBroadcastIp] = useState(config.broadcastIp || '');
  const [brokerUrl, setBrokerUrl] = useState(config.brokerUrl || '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Sinkronisasi setiap kali pengaturan dibuka
  useEffect(() => {
    if (visible) {
      setStationName(config.stationName || '');
      setStationKey(config.stationKey || '');
      setMacAddress(config.macAddress || '');
      setBroadcastIp(config.broadcastIp || '');
      setBrokerUrl(config.brokerUrl || '');
      setErrorMessage(null);
    }
  }, [visible, config]);

  const handleGenerateKey = () => {
    const chars = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newKey = `WOL-${chars}-PC`;
    setStationKey(newKey);
    setErrorMessage(null);
  };

  const handleClearAll = () => {
    setStationName('');
    setStationKey('');
    setMacAddress('');
    setBroadcastIp('');
    setBrokerUrl('');
    setErrorMessage(null);
  };

  const handleSave = () => {
    const trimmedKey = stationKey.trim();
    const trimmedMac = macAddress.trim();

    if (!trimmedKey) {
      setErrorMessage('Station Pairing Key tidak boleh kosong!');
      return;
    }
    if (!trimmedMac) {
      setErrorMessage('MAC Address LAN PC tidak boleh kosong!');
      return;
    }

    const sanitizedBroker = sanitizeBrokerUrl(brokerUrl);

    onSave({
      stationName: stationName.trim() || 'My PC',
      stationKey: trimmedKey,
      macAddress: trimmedMac.toUpperCase(),
      broadcastIp: broadcastIp.trim() || '192.168.0.255',
      brokerUrl: sanitizedBroker,
    });
    Keyboard.dismiss();
    onClose();
  };

  const handleScanSuccess = (scanned: Partial<StationConfig>) => {
    if (scanned.stationName) setStationName(scanned.stationName);
    if (scanned.stationKey) setStationKey(scanned.stationKey);
    if (scanned.macAddress) setMacAddress(scanned.macAddress);
    if (scanned.broadcastIp) setBroadcastIp(scanned.broadcastIp);
    if (scanned.brokerUrl) setBrokerUrl(scanned.brokerUrl);

    // Jika scan berhasil dan memiliki key & mac, otomatis simpan langsung!
    if (scanned.stationKey && scanned.macAddress) {
      onSave({
        stationName: scanned.stationName || 'RIG-STATION-PRO',
        stationKey: scanned.stationKey.trim(),
        macAddress: scanned.macAddress.trim().toUpperCase(),
        broadcastIp: scanned.broadcastIp || '192.168.0.255',
        brokerUrl: sanitizeBrokerUrl(scanned.brokerUrl || 'broker.hivemq.com'),
      });
      onClose();
    }
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.safeContainer} edges={['top', 'bottom', 'left', 'right']}>
        {/* Top Header Navigation */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backBtn} activeOpacity={0.7}>
            <Text style={styles.backBtnText}>← Kembali</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerKicker}>PENGATURAN PERANGKAT</Text>
            <Text style={styles.headerTitle}>Konfigurasi Stasiun PC</Text>
          </View>
          <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn} activeOpacity={0.7}>
            <Text style={styles.clearBtnText}>Reset</Text>
          </TouchableOpacity>
        </View>

        {/* Validation Error Message */}
        {errorMessage && (
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>⚠️</Text>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        )}

        {/* Full-Page Native ScrollView */}
        <ScrollView
          style={styles.fullScrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {/* HERO BUTTON: QR SCANNER */}
          <TouchableOpacity
            style={styles.qrHeroCard}
            onPress={() => setIsScannerOpen(true)}
            activeOpacity={0.8}
          >
            <View style={styles.qrIconBadge}>
              <Text style={styles.qrIconText}>📷</Text>
            </View>
            <View style={styles.qrHeroInfo}>
              <Text style={styles.qrHeroTitle}>PINDAI QR CODE STASIUN PC</Text>
              <Text style={styles.qrHeroSubtitle}>
                Buka aplikasi di PC Anda lalu arahkan kamera ke sini untuk koneksi instan otomatis.
              </Text>
            </View>
            <Text style={styles.qrArrow}>›</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ATAU INPUT MANUAL</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Input: Nama Komputer */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>NAMA KOMPUTER (STATION LABEL)</Text>
            <TextInput
              style={styles.textInput}
              value={stationName}
              editable={true}
              onChangeText={(t) => {
                setStationName(t);
                setErrorMessage(null);
              }}
              placeholder="Contoh: Rig Gaming, PC Kantor"
              placeholderTextColor="#475569"
            />
          </View>

          {/* Input: Station Pairing Key */}
          <View style={styles.inputGroup}>
            <View style={styles.labelRow}>
              <Text style={styles.inputLabel}>STATION PAIRING KEY (KODE RAHASIA)</Text>
              <TouchableOpacity onPress={handleGenerateKey}>
                <Text style={styles.generateBtnText}>+ Buat Acak</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.textInput, styles.monoInput, { color: CyberColors.neonCyan }]}
              value={stationKey}
              editable={true}
              onChangeText={(t) => {
                setStationKey(t);
                setErrorMessage(null);
              }}
              placeholder="Contoh: WOL-9341-PC (Lihat di PC)"
              placeholderTextColor="#475569"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Text style={styles.inputHint}>
              Wajib sama persis dengan yang tertera di aplikasi PC Windows Anda.
            </Text>
          </View>

          {/* Input: MAC Address Target */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>MAC ADDRESS KARTU LAN PC (ETHERNET)</Text>
            <TextInput
              style={[styles.textInput, styles.monoInput]}
              value={macAddress}
              editable={true}
              onChangeText={(t) => {
                setMacAddress(t);
                setErrorMessage(null);
              }}
              placeholder="Contoh: F0:2F:74:8B:F6:43"
              placeholderTextColor="#475569"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            <Text style={styles.inputHint}>
              Alamat fisik kartu LAN PC. Sudah tertera otomatis di layar aplikasi Desktop PC Anda.
            </Text>
          </View>

          {/* Input: Broadcast Subnet IP */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>LAN BROADCAST IP (MODE BRIDGE)</Text>
            <TextInput
              style={[styles.textInput, styles.monoInput]}
              value={broadcastIp}
              editable={true}
              onChangeText={(t) => {
                setBroadcastIp(t);
                setErrorMessage(null);
              }}
              placeholder="Contoh: 192.168.0.255"
              placeholderTextColor="#475569"
              keyboardType="numbers-and-punctuation"
              autoCorrect={false}
            />
            <Text style={styles.inputHint}>
              Alamat broadcast jaringan Wi-Fi rumah (biasanya 192.168.0.255 atau 192.168.1.255).
            </Text>
          </View>

          {/* Input: Cloud MQTT Broker */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>GLOBAL CLOUD MQTT BROKER</Text>
            <TextInput
              style={[styles.textInput, styles.monoInput]}
              value={brokerUrl}
              editable={true}
              onChangeText={(t) => {
                setBrokerUrl(t);
                setErrorMessage(null);
              }}
              placeholder="Default: broker.hivemq.com (Port WebSocket 8884)"
              placeholderTextColor="#475569"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={styles.inputHint}>
              Bisa dikosongkan. Otomatis dialihkan ke port WebSocket aman (8884) agar sinkron dengan port 1883 di PC.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn} activeOpacity={0.7}>
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.saveBtn} activeOpacity={0.7}>
              <Text style={styles.saveBtnText}>Simpan Pengaturan</Text>
            </TouchableOpacity>
          </View>

          {/* Ruang ekstra agar scroll sangat leluasa meluncur sampai bawah */}
          <View style={{ height: 120 }} />
        </ScrollView>

        {/* Modal Kamera QR Scanner */}
        <QRScannerModal
          visible={isScannerOpen}
          onClose={() => setIsScannerOpen(false)}
          onScanSuccess={handleScanSuccess}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: '#020617',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#0b0f19',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
  },
  backBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  backBtnText: {
    color: '#38bdf8',
    fontWeight: '600',
    fontSize: 13,
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerKicker: {
    color: CyberColors.neonIndigoBright,
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 1.5,
  },
  headerTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 2,
  },
  clearBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  clearBtnText: {
    color: '#f87171',
    fontWeight: '600',
    fontSize: 12,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  errorIcon: {
    fontSize: 14,
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  fullScrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  qrHeroCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e1b4b',
    borderWidth: 1.5,
    borderColor: '#6366f1',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  qrIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  qrIconText: {
    fontSize: 24,
  },
  qrHeroInfo: {
    flex: 1,
  },
  qrHeroTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  qrHeroSubtitle: {
    color: '#c7d2fe',
    fontSize: 11,
    lineHeight: 16,
  },
  qrArrow: {
    color: '#a5b4fc',
    fontSize: 24,
    fontWeight: '300',
    marginLeft: 8,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#1e293b',
  },
  dividerText: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
    marginHorizontal: 12,
  },
  inputGroup: {
    marginBottom: 18,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  generateBtnText: {
    color: CyberColors.neonCyan,
    fontSize: 11,
    fontWeight: '600',
  },
  textInput: {
    backgroundColor: '#0f172a',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    color: '#f8fafc',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  monoInput: {
    fontFamily: 'monospace',
    letterSpacing: 0.5,
  },
  inputHint: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 6,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
    marginBottom: 20,
  },
  cancelBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    backgroundColor: '#4f46e5',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#4f46e5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
