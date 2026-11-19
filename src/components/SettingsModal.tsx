import React, { useState } from 'react';
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
import { StationConfig } from '../services/mqttService';

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
  const [stationName, setStationName] = useState(config.stationName);
  const [stationKey, setStationKey] = useState(config.stationKey);
  const [macAddress, setMacAddress] = useState(config.macAddress);
  const [broadcastIp, setBroadcastIp] = useState(config.broadcastIp);
  const [brokerUrl, setBrokerUrl] = useState(config.brokerUrl);

  const handleGenerateKey = () => {
    const randomHex = Math.random().toString(36).substring(2, 7).toUpperCase();
    setStationKey(`WOL-${randomHex}-PC`);
  };

  const handleSave = () => {
    onSave({
      stationName: stationName.trim() || 'My PC',
      stationKey: stationKey.trim() || 'WOL-DEFAULT-PC',
      macAddress: macAddress.trim() || 'A4:83:E7:2B:10:9C',
      broadcastIp: broadcastIp.trim() || '192.168.1.255',
      brokerUrl: brokerUrl.trim() || 'wss://broker.hivemq.com:8884/mqtt',
    });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.modalContent}>
          {/* Header Modal */}
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalKicker}>PENGATURAN PERANGKAT</Text>
              <Text style={styles.modalTitle}>Konfigurasi Stasiun PC</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.helpText}>
              Sesuaikan dengan nomor identitas komputer Anda. Kode ini yang menghubungkan HP Anda
              ke PC Windows secara universal dari mana saja.
            </Text>

            {/* Input: Nama Komputer */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>NAMA KOMPUTER (STATION LABEL)</Text>
              <TextInput
                style={styles.textInput}
                value={stationName}
                onChangeText={setStationName}
                placeholder="Contoh: Rig Gaming, PC Kantor"
                placeholderTextColor="#64748b"
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
                onChangeText={setStationKey}
                placeholder="Contoh: WOL-9341-PC"
                placeholderTextColor="#64748b"
                autoCapitalize="characters"
              />
              <Text style={styles.inputHint}>
                Kode ini harus sama dengan yang tertera di script PC Windows Anda.
              </Text>
            </View>

            {/* Input: MAC Address Target */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>MAC ADDRESS KARTU LAN PC (ETHERNET)</Text>
              <TextInput
                style={[styles.textInput, styles.monoInput]}
                value={macAddress}
                onChangeText={setMacAddress}
                placeholder="Contoh: A4:83:E7:2B:10:9C"
                placeholderTextColor="#64748b"
                autoCapitalize="characters"
              />
              <Text style={styles.inputHint}>
                Didapatkan via command prompt di PC: <Text style={{ color: '#94a3b8' }}>getmac /v</Text>
              </Text>
            </View>

            {/* Input: Broadcast Subnet IP */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>LAN BROADCAST IP (MODE BRIDGE)</Text>
              <TextInput
                style={[styles.textInput, styles.monoInput]}
                value={broadcastIp}
                onChangeText={setBroadcastIp}
                placeholder="192.168.1.255"
                placeholderTextColor="#64748b"
              />
            </View>

            {/* Input: Cloud MQTT Broker */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>GLOBAL CLOUD MQTT BROKER</Text>
              <TextInput
                style={[styles.textInput, styles.monoInput]}
                value={brokerUrl}
                onChangeText={setBrokerUrl}
                placeholder="wss://broker.hivemq.com:8884/mqtt"
                placeholderTextColor="#64748b"
              />
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
