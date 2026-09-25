import React, { useMemo } from 'react';
import { Text, View, StyleSheet, Platform } from 'react-native';
import { tokenizeMath, splitProseAndMath, mathToPlain } from '../../src/utils/leksehjelp/mathText';

function MathRun({ tokens, baseStyle, accentColor }) {
  return (
    <Text style={baseStyle} accessibilityLabel={mathToPlain(tokens.map((t) => {
      if (t.type === 'frac') return `${t.num}/${t.den}`;
      if (t.type === 'sup') return `^${t.value}`;
      if (t.type === 'sub') return `_${t.value}`;
      return t.value;
    }).join(''))}>
      {tokens.map((t, i) => {
        if (t.type === 'text') {
          return <Text key={i} style={baseStyle}>{t.value}</Text>;
        }
        if (t.type === 'sup') {
          return (
            <Text
              key={i}
              style={[
                baseStyle,
                styles.sup,
                accentColor ? { color: accentColor } : null,
              ]}
            >
              {t.value}
            </Text>
          );
        }
        if (t.type === 'sub') {
          return (
            <Text key={i} style={[baseStyle, styles.sub]}>
              {t.value}
            </Text>
          );
        }
        if (t.type === 'frac') {
          return (
            <Text key={i} style={baseStyle}>
              <Text style={[baseStyle, styles.fracNum]}>{t.num}</Text>
              <Text style={baseStyle}>/</Text>
              <Text style={[baseStyle, styles.fracDen]}>{t.den}</Text>
            </Text>
          );
        }
        return null;
      })}
    </Text>
  );
}

/**
 * Rich text that renders inline math (eksponenter, brøk, regnestykker)
 * inside tutor bubbles and on the pencil board.
 */
export default function MathText({
  children,
  style,
  mathStyle,
  accentColor,
  mode = 'auto', // auto | math | prose
}) {
  const text = typeof children === 'string' || typeof children === 'number'
    ? String(children)
    : '';

  const content = useMemo(() => {
    if (!text) return null;
    if (mode === 'math') {
      return (
        <MathRun
          tokens={tokenizeMath(text)}
          baseStyle={[styles.math, mathStyle, style]}
          accentColor={accentColor}
        />
      );
    }
    if (mode === 'prose') {
      return <Text style={style}>{text}</Text>;
    }
    const parts = splitProseAndMath(text);
    return (
      <Text style={style}>
        {parts.map((p, idx) => {
          if (p.kind === 'prose') {
            return <Text key={idx} style={style}>{p.text}</Text>;
          }
          return (
            <MathRun
              key={idx}
              tokens={tokenizeMath(p.text)}
              baseStyle={[style, styles.mathInline, mathStyle]}
              accentColor={accentColor}
            />
          );
        })}
      </Text>
    );
  }, [text, mode, style, mathStyle, accentColor]);

  return content;
}

/** Single display equation — larger, board-friendly. */
export function MathEquation({ expression, style, color = '#1a2744' }) {
  const tokens = useMemo(() => tokenizeMath(String(expression || '')), [expression]);
  return (
    <View style={styles.eqWrap} accessible accessibilityRole="text">
      <MathRun
        tokens={tokens}
        baseStyle={[styles.eq, { color }, style]}
        accentColor="#b45309"
      />
    </View>
  );
}

const handFont = Platform.select({
  ios: 'Noteworthy',
  android: 'sans-serif-medium',
  web: '"Caveat", "Segoe Print", "Comic Sans MS", cursive',
  default: undefined,
});

const styles = StyleSheet.create({
  math: {
    fontFamily: handFont,
    fontSize: 22,
    fontWeight: '400',
    letterSpacing: 0.3,
  },
  mathInline: {
    fontWeight: '400',
    letterSpacing: 0.2,
  },
  sup: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '400',
    ...Platform.select({
      web: { verticalAlign: 'super', position: 'relative', top: -4 },
      default: { position: 'relative', top: -5 },
    }),
  },
  sub: {
    fontSize: 11,
    lineHeight: 14,
    ...Platform.select({
      web: { verticalAlign: 'sub', position: 'relative', top: 2 },
      default: { position: 'relative', top: 3 },
    }),
  },
  fracNum: { textDecorationLine: 'underline' },
  fracDen: {},
  eqWrap: {
    paddingVertical: 2,
  },
  eq: {
    fontFamily: handFont,
    fontSize: 26,
    fontWeight: '400',
    letterSpacing: 0.6,
    lineHeight: 34,
  },
});
