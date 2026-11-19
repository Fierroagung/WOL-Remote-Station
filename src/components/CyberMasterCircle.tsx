import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { CyberColors } from '../theme/colors';
import { PCStatus, PowerAction } from '../services/mqttService';

interface CyberMasterCircleProps {
  pcStatus: PCStatus;
  activeTransition: PowerAction | 'waking' | null;
  onPress: () => void;
  size?: 'compact' | 'normal' | 'large';
  captionText: string;
}

export const CyberMasterCircle: React.FC<CyberMasterCircleProps> = ({
  pcStatus,
  activeTransition,
  onPress,
  size = 'normal',
  captionText,
}) => {
  // Animasi Denyut Aura (Pulse Glow)
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.7)).current;

  // Animasi Putaran Radar (Spin)
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Jalankan denyut aura terus menerus
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.25,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseOpacity, {
            toValue: 0.7,
            duration: 1500,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    pulseLoop.start();

    // Jalankan putaran radar jika sedang sinkronisasi
    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 2000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    if (activeTransition) {
      spinLoop.start();
    } else {
      spinLoop.stop();
      spinAnim.setValue(0);
    }

    return () => {
      pulseLoop.stop();
      spinLoop.stop();
    };
  }, [activeTransition]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Skala ukuran berdasarkan device / mode
  const isCompact = size === 'compact';
  const isLarge = size === 'large';
  const containerDim = isCompact ? 150 : isLarge ? 210 : 185;
  const buttonDim = isCompact ? 110 : isLarge ? 160 : 140;
  const ringDim = isCompact ? 130 : isLarge ? 190 : 165;

  // Warna gradasi dinamis
  let btnBgColor = '#4338ca';
  let ringBorderColor = CyberColors.neonCyan;
  let auraBgColor = 'rgba(56, 189, 248, 0.25)';

  if (activeTransition === 'shutdown') {
    btnBgColor = '#9f1239';
    ringBorderColor = CyberColors.shutdownRose;
    auraBgColor = 'rgba(244, 63, 94, 0.3)';
  } else if (activeTransition === 'sleep') {
    btnBgColor = '#3730a3';
    ringBorderColor = CyberColors.sleepIndigo;
    auraBgColor = 'rgba(99, 102, 241, 0.3)';
  } else if (activeTransition === 'hibernate') {
    btnBgColor = '#0e7490';
    ringBorderColor = CyberColors.hibernateCyan;
    auraBgColor = 'rgba(6, 182, 212, 0.3)';
  } else if (activeTransition === 'restart') {
    btnBgColor = '#b45309';
    ringBorderColor = CyberColors.restartAmber;
    auraBgColor = 'rgba(245, 158, 11, 0.3)';
  } else if (pcStatus === 'ONLINE') {
    btnBgColor = '#065f46';
    ringBorderColor = CyberColors.online;
    auraBgColor = 'rgba(16, 185, 129, 0.25)';
  }

  return (
    <View style={styles.wrapper}>
      {/* Outer Clear Container: Menjamin clearance aman dari teks caption */}
      <View style={[styles.container, { width: containerDim, height: containerDim }]}>
        {/* Aura Denyut di Belakang */}
        <Animated.View
          style={[
            styles.auraGlow,
            {
              width: ringDim,
              height: ringDim,
              borderRadius: ringDim / 2,
              backgroundColor: auraBgColor,
              transform: [{ scale: pulseAnim }],
              opacity: pulseOpacity,
            },
          ]}
        />

        {/* Cincin Radar Berputar (Hanya saat sinkronisasi aktif) */}
        {activeTransition ? (
          <Animated.View
            style={[
              styles.radarRing,
              {
                width: ringDim,
                height: ringDim,
                borderRadius: ringDim / 2,
                borderColor: ringBorderColor,
                transform: [{ rotate: spin }],
              },
            ]}
          />
        ) : null}

        {/* Tombol Utama Lingkaran */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPress}
          style={[
            styles.mainButton,
            {
              width: buttonDim,
              height: buttonDim,
              borderRadius: buttonDim / 2,
              backgroundColor: btnBgColor,
            },
          ]}
        >
          {activeTransition ? (
            <View style={styles.centerContent}>
              <Text style={styles.syncIcon}>⚡</Text>
              <Text style={styles.syncTitle}>SINKRONISASI</Text>
              <Text style={styles.syncSub}>
                {activeTransition === 'waking'
                  ? 'BOOTING...'
                  : activeTransition === 'shutdown'
                  ? 'MEMATIKAN...'
                  : activeTransition === 'sleep'
                  ? 'MASUK SLEEP...'
                  : activeTransition === 'hibernate'
                  ? 'HIBERNASI...'
                  : 'RESTART PC...'}
              </Text>
            </View>
          ) : (
            <View style={styles.centerContent}>
              <Text style={styles.boltIcon}>⚡</Text>
              <Text style={styles.mainTitle}>
                {pcStatus === 'ONLINE' ? 'KOMPUTER AKTIF' : 'WAKE UP'}
              </Text>
              <Text style={styles.mainSub}>
                {pcStatus === 'ONLINE' ? 'READY' : 'MAGIC PACKET'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Caption Keterangan Real-time Berjarak Aman (Zero Clipping) */}
      <Text style={styles.captionText}>{captionText}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  auraGlow: {
    position: 'absolute',
  },
  radarRing: {
    position: 'absolute',
    borderWidth: 2,
    borderStyle: 'dashed',
  },
  mainButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#1e293b',
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  boltIcon: {
    fontSize: 28,
    color: '#a5f3fc',
    marginBottom: 4,
  },
  syncIcon: {
    fontSize: 24,
    color: '#ffffff',
    marginBottom: 2,
  },
  mainTitle: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1.2,
    textAlign: 'center',
  },
  mainSub: {
    color: '#c7d2fe',
    fontSize: 9,
    fontFamily: 'monospace',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  syncTitle: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  syncSub: {
    color: '#cbd5e1',
    fontSize: 8,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  captionText: {
    color: '#94a3b8',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 16,
    lineHeight: 16,
    maxWidth: 290,
  },
});
