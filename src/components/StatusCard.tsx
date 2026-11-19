import React from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { CyberColors } from '../theme/colors';
import { PCStatus, PowerAction } from '../services/mqttService';

interface StatusCardProps {
  status: PCStatus;
  activeTransition: PowerAction | 'waking' | null;
}

export const StatusCard: React.FC<StatusCardProps> = ({ status, activeTransition }) => {
  let displayStatus = status as string;
  let dotColor = CyberColors.offline;
  let badgeBg = CyberColors.offlineBg;
  let badgeBorder = CyberColors.offlineBorder;
  let textColor = '#fda4af';

  if (activeTransition) {
    dotColor = CyberColors.transitioning;
    badgeBg = CyberColors.transitioningBg;
    badgeBorder = CyberColors.transitioningBorder;
    textColor = '#fde68a';

    if (activeTransition === 'waking') displayStatus = 'BOOTING WINDOWS...';
    else if (activeTransition === 'shutdown') displayStatus = 'MEMATIKAN...';
    else if (activeTransition === 'sleep') displayStatus = 'SUSPENDING...';
    else if (activeTransition === 'hibernate') displayStatus = 'SAVING TO SSD...';
    else if (activeTransition === 'restart') displayStatus = 'RESTARTING...';
  } else if (status === 'ONLINE') {
    dotColor = CyberColors.online;
    badgeBg = CyberColors.onlineBg;
    badgeBorder = CyberColors.onlineBorder;
    textColor = '#6ee7b7';
  } else if (status === 'SLEEPING') {
    dotColor = CyberColors.sleepIndigo;
    badgeBg = CyberColors.sleepBg;
    badgeBorder = CyberColors.sleepBorder;
    textColor = '#c7d2fe';
  }

  return (
    <View style={styles.card}>
      <View>
        <Text style={styles.label}>Status Daya Komputer</Text>
        <Text style={styles.statusText}>{displayStatus}</Text>
      </View>

      <View style={[styles.badge, { backgroundColor: badgeBg, borderColor: badgeBorder }]}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <Text style={[styles.badgeText, { color: textColor }]}>{displayStatus}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#0f172a',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#1e293b',
    width: '100%',
    marginVertical: 6,
  },
  label: {
    color: '#64748b',
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  statusText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    fontFamily: 'monospace',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
