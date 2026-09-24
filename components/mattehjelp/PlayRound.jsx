/**
 * Interaktiv spillrunde for Mattehjelpen — store knapper, umiddelbar feedback.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Animated, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import GamePlayArena from '../GamePlayArena';

const NATIVE = Platform.OS !== 'web';

export default function PlayRound({
  round,
  accent = '#245fef',
  onAnswer,
  disabled = false,
}) {
  const [picked, setPicked] = useState(null);
  const [result, setResult] = useState(null); // 'ok' | 'no'
  const bounce = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    setPicked(null);
    setResult(null);
  }, [round?.prompt, round?.correctId]);

  const choose = (optId) => {
    if (disabled || result) return;
    setPicked(optId);
    const ok = optId === round.correctId;
    setResult(ok ? 'ok' : 'no');
    Animated.sequence([
      Animated.timing(bounce, { toValue: 1.08, duration: 90, useNativeDriver: NATIVE }),
      Animated.timing(bounce, { toValue: 1, duration: 120, useNativeDriver: NATIVE }),
    ]).start();
    setTimeout(() => onAnswer?.(ok, optId), ok ? 650 : 900);
  };

  if (!round) return null;

  return (
    <GamePlayArena theme="cards" style={styles.wrap}>
      <Text style={styles.prompt}>{round.prompt}</Text>

      {round.hero ? (
        <Animated.Text style={[styles.hero, { transform: [{ scale: bounce }] }]}>
          {round.hero}
        </Animated.Text>
      ) : null}

      {round.items?.length ? (
        <View style={styles.items}>
          {round.items.map((it) => (
            <Text key={it.id} style={styles.itemEmoji}>{it.emoji}</Text>
          ))}
        </View>
      ) : null}

      {round.piles?.length ? (
        <View style={styles.piles}>
          {round.piles.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.pile,
                picked === p.id && { borderColor: accent, borderWidth: 2 },
              ]}
              onPress={() => choose(p.id)}
              disabled={disabled || !!result}
              activeOpacity={0.85}
            >
              <Text style={styles.pileLabel}>{p.id === 'a' ? 'A' : 'B'}</Text>
              <View style={styles.pileItems}>
                {Array.from({ length: p.count }, (_, i) => (
                  <Text key={i} style={styles.itemEmoji}>{p.emoji}</Text>
                ))}
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.options}>
        {(round.options || []).map((opt) => {
          const isPick = picked === opt.id;
          const showOk = result === 'ok' && isPick;
          const showNo = result === 'no' && isPick;
          return (
            <TouchableOpacity
              key={String(opt.id)}
              style={[
                styles.opt,
                isPick && { borderColor: accent },
                showOk && styles.optOk,
                showNo && styles.optNo,
              ]}
              onPress={() => choose(opt.id)}
              disabled={disabled || !!result}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={String(opt.label)}
            >
              <Text style={styles.optTxt}>{opt.label}</Text>
              {showOk ? <Ionicons name="checkmark-circle" size={22} color="#059669" /> : null}
              {showNo ? <Ionicons name="close-circle" size={22} color="#dc2626" /> : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {result === 'ok' && round.explain ? (
        <Text style={styles.explainOk}>{round.explain}</Text>
      ) : null}
      {result === 'no' ? (
        <Text style={styles.explainNo}>Prøv neste — du lærer av forsøk!</Text>
      ) : null}
    </GamePlayArena>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', paddingVertical: 20, paddingHorizontal: 14 },
  prompt: {
    fontSize: 22, fontWeight: '800', color: '#152c4b', textAlign: 'center', marginBottom: 14,
  },
  hero: { fontSize: 64, textAlign: 'center', marginBottom: 12 },
  items: {
    flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center',
    gap: 8, marginBottom: 16, maxWidth: 320,
  },
  itemEmoji: { fontSize: 36 },
  piles: { flexDirection: 'row', gap: 12, marginBottom: 16, width: '100%' },
  pile: {
    flex: 1, backgroundColor: '#fff', borderRadius: 16, padding: 12,
    borderWidth: 1, borderColor: '#d6e1ef', minHeight: 120,
  },
  pileLabel: { fontWeight: '800', color: '#53667f', marginBottom: 6 },
  pileItems: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  options: { width: '100%', gap: 10, marginTop: 4 },
  opt: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fff', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16,
    borderWidth: 2, borderColor: '#d6e1ef', minHeight: 56,
  },
  optOk: { backgroundColor: '#ecfdf5', borderColor: '#059669' },
  optNo: { backgroundColor: '#fef2f2', borderColor: '#dc2626' },
  optTxt: { fontSize: 18, fontWeight: '700', color: '#152c4b', flex: 1 },
  explainOk: {
    marginTop: 14, textAlign: 'center', color: '#059669', fontWeight: '700', fontSize: 15,
  },
  explainNo: {
    marginTop: 14, textAlign: 'center', color: '#b45309', fontWeight: '600', fontSize: 14,
  },
});
