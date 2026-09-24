import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Animated, Platform, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MathEquation } from './MathText';

const NATIVE = Platform.OS !== 'web';

/**
 * «Blyanttavle» — viser regnesteg som om de skrives med blyant.
 * Inspirert av tenkende klasserom / vertikale tavler + Kikora stegvis feedback.
 */
export default function TutorPencilBoard({
  lines = [],
  title = 'Blyanttavlen',
  accent = '#1d4ed8',
  visibleCount,
}) {
  const safe = useMemo(
    () => (Array.isArray(lines) ? lines.filter((l) => l && (l.expression || l.note)) : []).slice(0, 8),
    [lines],
  );
  const showN = visibleCount == null ? safe.length : Math.min(safe.length, Math.max(0, visibleCount));
  const shown = safe.slice(0, showN);

  if (!safe.length) return null;

  return (
    <View style={styles.wrap} accessibilityLabel="Blyanttavle med regnesteg">
      <View style={styles.header}>
        <View style={[styles.pencil, { backgroundColor: accent }]}>
          <Ionicons name="pencil" size={14} color="#fff" />
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.meta}>{shown.length}/{safe.length}</Text>
      </View>

      <View style={styles.paper}>
        <View style={styles.marginLine} />
        {shown.map((line, i) => (
          <BoardLine
            key={line.id || `${line.expression}-${i}`}
            line={line}
            index={i}
            accent={accent}
            isLatest={i === shown.length - 1}
          />
        ))}
        {showN < safe.length ? (
          <Text style={styles.moreHint}>Neste steg kommer når du prøver …</Text>
        ) : null}
      </View>
    </View>
  );
}

function BoardLine({ line, index, accent, isLatest }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(10)).current;
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    opacity.setValue(0);
    slide.setValue(12);
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 420,
        delay: Math.min(index * 80, 240),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: NATIVE,
      }),
      Animated.timing(slide, {
        toValue: 0,
        duration: 420,
        delay: Math.min(index * 80, 240),
        easing: Easing.out(Easing.cubic),
        useNativeDriver: NATIVE,
      }),
    ]).start(() => setDrawn(true));
  }, [line?.expression, line?.note, index, opacity, slide]);

  const kind = line.kind || 'write';
  const muted = kind === 'ask' || line.hiddenAnswer;

  return (
    <Animated.View
      style={[
        styles.lineRow,
        isLatest && styles.lineLatest,
        { opacity, transform: [{ translateY: slide }] },
      ]}
    >
      <Text style={styles.lineNum}>{index + 1}.</Text>
      <View style={styles.lineBody}>
        {!!line.expression && (
          <MathEquation
            expression={line.expression}
            color={muted ? '#92400e' : '#1a2744'}
            style={drawn && isLatest ? styles.inkFresh : null}
          />
        )}
        {!!line.note && (
          <Text style={[styles.note, { color: accent }]}>{line.note}</Text>
        )}
        {kind === 'ask' ? (
          <View style={styles.askBadge}>
            <Ionicons name="help-circle-outline" size={14} color="#b45309" />
            <Text style={styles.askTxt}>Din tur — skriv svaret under</Text>
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const handFont = Platform.select({
  ios: 'Noteworthy',
  android: 'sans-serif-medium',
  web: '"Caveat", "Segoe Print", cursive',
  default: undefined,
});

const styles = StyleSheet.create({
  wrap: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#d6c7a8',
    backgroundColor: '#f7f0e1',
    // Ikke la ytre flex knuse tavlen til én linje
    flexShrink: 0,
    alignSelf: 'stretch',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2d4b5',
  },
  pencil: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontWeight: '700',
    fontSize: 13,
    color: '#3f3a2f',
    letterSpacing: 0.2,
  },
  meta: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8a7d64',
  },
  paper: {
    paddingLeft: 18,
    paddingRight: 12,
    paddingTop: 10,
    paddingBottom: 12,
    minHeight: 88,
    position: 'relative',
  },
  marginLine: {
    position: 'absolute',
    left: 12,
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#f0b4b4',
    opacity: 0.7,
  },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148, 120, 70, 0.18)',
  },
  lineLatest: {
    backgroundColor: 'rgba(255,255,255,0.35)',
    marginHorizontal: -4,
    paddingHorizontal: 4,
    borderRadius: 8,
  },
  lineNum: {
    width: 22,
    fontFamily: handFont,
    fontSize: 16,
    color: '#a08b6a',
    marginTop: 6,
  },
  lineBody: { flex: 1, gap: 2 },
  note: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  inkFresh: {
    opacity: 0.95,
  },
  askBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  askTxt: {
    fontSize: 12,
    fontWeight: '600',
    color: '#b45309',
  },
  moreHint: {
    marginTop: 10,
    fontSize: 12,
    fontStyle: 'italic',
    color: '#8a7d64',
    fontFamily: handFont,
  },
});
