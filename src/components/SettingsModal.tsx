import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { CyberColors } from '../theme/colors';
import { StationConfig, sanitizeBrokerUrl, DEFAULT_BROKER_WS } from '../services/mqttService';

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

  // PENTING: Hanya sinkronisasi saat modal BARU DIBUKA (visible berubah dari false ke true)
  // Tidak bergantung pada config agar parent re-render tidak pernah mengunci/menimpa ketikan user!
  useEffect(() => {
    if (visible) {
      setStationName(config.stationName || '');
      setStationKey(config.stationKey || '');
      setMacAddress(config.macAddress || '');
      setBroadcastIp(config.broadcastIp || '');
      setBrokerUrl(config.brokerUrl || '');
      setErrorMessage(null);
    }
  }, [visible]);

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

    // Normalisasi Broker URL dengan aman (Mencegah crash native Android)
    const sanitizedBroker = sanitizeBrokerUrl(brokerUrl);

    onSave({
      stationName: stationName.trim() || 'My PC',
      stationKey: trimmedKey,
      macAddress: trimmedMac.toUpperCase(),
      broadcastIp: broadcastIp.trim() || '192.168.0.255',
      brokerUrl: sanitizedBroker,
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <View style={styles.modalContent}>
          {/* Header Modal */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalKicker}>PENGATURAN PERANGKAT</Text>
              <Text style={styles.modalTitle}>Konfigurasi Stasiun PC</Text>
            </View>
            <View style={styles.headerRightBtns}>
              <TouchableOpacity onPress={handleClearAll} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>Kosongkan</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Validation Error Message */}
          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorIcon}>⚠️</Text>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          )}

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={styles.helpText}>
              Masukkan nomor identitas komputer Anda yang tertera di script PC Companion. Kolom di bawah bebas Anda edit kapan saja.
            </Text>

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
                Wajib sama persis dengan yang tertera di script PC Windows Anda.
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
                Didapatkan via Command Prompt di PC: <Text style={{ color: '#94a3b8' }}>getmac /v</Text>
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
                Alamat broadcast jaringan lokal Wi-Fi rumah (biasanya 192.168.0.255 atau 192.168.1.255).
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
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.modalFooter}>
            <TouchableOpacity onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSave} style={styles.saveBtn}>
              <Text style={styles.saveBtnText}>Simpan Pengaturan</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0f172a',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: '#1e293b',
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#1e293b',
    paddingBottom: 14,
    marginBottom: 16,
  },
  headerRightBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
  },
  clearBtnText: {
    color: '#f87171',
    fontSize: 11,
    fontWeight: '600',
  },
  modalKicker: {
    color: CyberColors.neonIndigoBright,
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 1.5,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1e293b',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: 'bold',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 14,
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
  formScroll: {
    marginBottom: 16,
  },
  helpText: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
    marginBottom: 16,
  },
  inputGroup: {
    marginBottom: 16,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  inputLabel: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
  generateBtnText: {
    color: CyberColors.neonCyan,
    fontSize: 10,
    fontWeight: 'bold',
  },
  textInput: {
    backgroundColor: '#020617',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 13,
  },
  monoInput: {
    fontFamily: 'monospace',
  },
  inputHint: {
    color: '#64748b',
    fontSize: 9,
    marginTop: 4,
    lineHeight: 13,
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#1e293b',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#94a3b8',
    fontWeight: '600',
    fontSize: 13,
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#4338ca',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 13,
  },
});
