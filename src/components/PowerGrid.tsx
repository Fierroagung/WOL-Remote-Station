import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { CyberColors } from '../theme/colors';
import { PowerAction } from '../services/mqttService';

interface PowerGridProps {
  onAction: (action: PowerAction) => void;
  disabled?: boolean;
  compact?: boolean;
}

export const PowerGrid: React.FC<PowerGridProps> = ({
  onAction,
  disabled = false,
  compact = false,
}) => {
  const cardHeight = compact ? 52 : 64;
  const iconSize = compact ? 30 : 38;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>POWER CONTROLS (OS)</Text>
      
      <View style={styles.grid}>
        {/* ROW 1: Sleep & Hibernate */}
        <View style={styles.row}>
          {/* Sleep Button */}
          <TouchableOpacity
            activeOpacity={0.75}
            disabled={disabled}
            onPress={() => onAction('sleep')}
            style={[styles.card, { height: cardHeight }]}
          >
            <View style={[styles.iconBox, { width: iconSize, height: iconSize, backgroundColor: CyberColors.sleepBg, borderColor: CyberColors.sleepBorder }]}>
              <Text style={styles.actionIcon}>💤</Text>
            </View>
            <View style={styles.textCol}>
              <Text style={styles.titleText} numberOfLines={1}>Sleep</Text>
              <Text style={styles.subText} numberOfLines={1}>Mode Senyap</Text>
            </View>
          </TouchableOpacity>

          {/* Hibernate Button */}
          <TouchableOpacity
            activeOpacity={0.75}
            disabled={disabled}
            onPress={() => onAction('hibernate')}
            style={[styles.card, { height: cardHeight }]}
          >
            <View style={[styles.iconBox, { width: iconSize, height: iconSize, backgroundColor: CyberColors.hibernateBg, borderColor: CyberColors.hibernateBorder }]}>
              <Text style={styles.actionIcon}>❄️</Text>
            </View>
            <View style={styles.textCol}>
              <Text style={styles.titleText} numberOfLines={1}>Hibernate</Text>
              <Text style={styles.subText} numberOfLines={1}>Simpan SSD</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* ROW 2: Restart & Shutdown */}
        <View style={styles.row}>
          {/* Restart Button */}
          <TouchableOpacity
            activeOpacity={0.75}
            disabled={disabled}
            onPress={() => onAction('restart')}
            style={[styles.card, { height: cardHeight }]}
          >
            <View style={[styles.iconBox, { width: iconSize, height: iconSize, backgroundColor: CyberColors.restartBg, borderColor: CyberColors.restartBorder }]}>
              <Text style={styles.actionIcon}>🔄</Text>
            </View>
            <View style={styles.textCol}>
              <Text style={styles.titleText} numberOfLines={1}>Restart</Text>
              <Text style={styles.subText} numberOfLines={1}>Mulai Ulang</Text>
            </View>
          </TouchableOpacity>

          {/* Shutdown Button */}
          <TouchableOpacity
            activeOpacity={0.75}
            disabled={disabled}
            onPress={() => onAction('shutdown')}
            style={[styles.card, { height: cardHeight }]}
          >
            <View style={[styles.iconBox, { width: iconSize, height: iconSize, backgroundColor: CyberColors.shutdownBg, borderColor: CyberColors.shutdownBorder }]}>
              <Text style={[styles.actionIcon, { color: CyberColors.shutdownRose }]}>⛔</Text>
            </View>
            <View style={styles.textCol}>
              <Text style={[styles.titleText, { color: '#fda4af' }]} numberOfLines={1}>Shutdown</Text>
              <Text style={styles.subText} numberOfLines={1}>Matikan PC</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    marginVertical: 4,
  },
  sectionTitle: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  grid: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#1e293b',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  iconBox: {
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  actionIcon: {
    fontSize: 16,
  },
  textCol: {
    flex: 1,
    justifyContent: 'center',
  },
  titleText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  subText: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2,
  },
});
