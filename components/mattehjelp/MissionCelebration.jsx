/**
 * Feiring etter oppdrag — stjerner + ros (growth mindset).
 */
import React, { useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const NATIVE = Platform.OS !== 'web';

const LINES = [
  'Du klarte oppdraget — stilig innsats!',
  'Mestring! Du tenkte og prøvde selv.',
  'Hurra! Klar for et nytt eventyr?',
  'Stjerner til deg — du lærte noe nytt!',
];

export default function MissionCelebration({
  visible,
  stars = 1,
  correct = 0,
  total = 0,
  onContinue,
  onClose,
}) {
  const scale = useRef(new Animated.Value(0.7)).current;
  const line = LINES[Math.abs(stars + correct) % LINES.length];

  useEffect(() => {
    if (!visible) return;
    scale.setValue(0.7);
    Animated.spring(scale, { toValue: 1, friction: 6, useNativeDriver: NATIVE }).start();
  }, [visible, scale]);

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.bg}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <View style={styles.starRow}>
            {Array.from({ length: Math.min(5, Math.max(1, stars)) }, (_, i) => (
              <Ionicons key={i} name="star" size={36} color="#f59e0b" />
            ))}
          </View>
          <Text style={styles.title}>{line}</Text>
          {total > 0 ? (
            <Text style={styles.meta}>
              {correct} av {total} riktige · +{stars} stjerne{stars === 1 ? '' : 'r'}
            </Text>
          ) : null}
          <Text style={styles.hint}>
            Vi roser innsats og metode — ikke bare fasit. Det er slik man blir god.
          </Text>
          <TouchableOpacity style={styles.btn} onPress={onContinue} activeOpacity={0.85}>
            <Text style={styles.btnTxt}>Videre</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: {
    flex: 1, backgroundColor: 'rgba(21,44,75,0.45)',
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  card: {
    width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 24,
    padding: 24, alignItems: 'center', gap: 10,
  },
  starRow: { flexDirection: 'row', gap: 6, marginBottom: 4 },
  title: { fontSize: 22, fontWeight: '400', color: '#152c4b', textAlign: 'center' },
  meta: { fontSize: 15, fontWeight: '400', color: '#53667f' },
  hint: { fontSize: 13, color: '#53667f', textAlign: 'center', lineHeight: 18, marginTop: 4 },
  btn: {
    marginTop: 12, backgroundColor: '#245fef', borderRadius: 14,
    paddingVertical: 14, paddingHorizontal: 28, width: '100%', alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
});
