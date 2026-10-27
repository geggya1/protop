/**
 * Visning av dokumentinnhold skrevet i Markdown (src/iso/markdown.js).
 * Overskrifter, lister, avkrysning, tabeller, merknader og lenker – likt på web og mobil.
 */
import React, { useMemo } from 'react';
import { Linking, Platform, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { parseMarkdown } from '../../src/iso/markdown';

function Inline({ inline, colors, base }) {
  return inline.map((seg, i) => (
    <Text
      key={i}
      onPress={seg.href ? () => Linking.openURL(seg.href).catch(() => {}) : undefined}
      style={[
        seg.bold ? { fontWeight: '700' } : null,
        seg.italic ? { fontStyle: 'italic' } : null,
        seg.code ? { fontFamily: Platform.OS === 'web' ? 'monospace' : undefined, backgroundColor: colors.sunken, fontSize: (base?.fontSize || 14) - 1 } : null,
        seg.href ? { color: colors.brand, textDecorationLine: 'underline' } : null,
      ]}
    >
      {seg.text}
    </Text>
  ));
}

const H_SIZE = { 1: 20, 2: 17, 3: 15, 4: 14 };

export default function IsoMarkdown({ text, fontSize = 14 }) {
  const colors = useColors();
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  const base = { color: colors.ink, fontSize, lineHeight: Math.round(fontSize * 1.55) };
  if (!blocks.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          return (
            <Text key={i} accessibilityRole="header" style={{ color: colors.ink, fontSize: H_SIZE[b.level], fontWeight: '700', marginTop: i ? 8 : 0 }}>
              <Inline inline={b.inline} colors={colors} base={base} />
            </Text>
          );
        }
        if (b.type === 'hr') return <View key={i} style={{ height: 1, backgroundColor: colors.line, marginVertical: 4 }} />;
        if (b.type === 'quote') {
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 8, padding: 10, borderRadius: 10, backgroundColor: `${colors.brand}10`, borderLeftWidth: 3, borderLeftColor: colors.brand }}>
              <Ionicons name="information-circle-outline" size={16} color={colors.brand} style={{ marginTop: 2 }} />
              <Text style={[base, { flex: 1 }]}><Inline inline={b.inline} colors={colors} base={base} /></Text>
            </View>
          );
        }
        if (b.type === 'li') {
          const marker = b.checked != null
            ? <Ionicons name={b.checked ? 'checkbox-outline' : 'square-outline'} size={fontSize + 1} color={colors.muted} style={{ marginTop: 2 }} />
            : <Text style={[base, { minWidth: b.ordered ? 22 : 12, color: colors.muted }]}>{b.ordered ? `${b.number}.` : '•'}</Text>;
          return (
            <View key={i} style={{ flexDirection: 'row', gap: 6, paddingLeft: b.depth ? 20 : 2, marginTop: -4 }}>
              {marker}
              <Text style={[base, { flex: 1 }]}><Inline inline={b.inline} colors={colors} base={base} /></Text>
            </View>
          );
        }
        if (b.type === 'table') {
          const cols = Math.max(b.head.length, ...b.rows.map((r) => r.length));
          const cell = { flex: 1, minWidth: 120, padding: 8, borderRightWidth: 1, borderColor: colors.line };
          return (
            <ScrollView key={i} horizontal contentContainerStyle={{ flexGrow: 1 }}>
              <View style={{ flex: 1, minWidth: Math.min(cols * 140, 900), borderWidth: 1, borderColor: colors.line, borderRadius: 8, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', backgroundColor: colors.sunken }}>
                  {Array.from({ length: cols }).map((_, c) => (
                    <Text key={c} style={[base, cell, { fontWeight: '700', fontSize: fontSize - 1 }]}>
                      <Inline inline={b.head[c] || [{ text: '' }]} colors={colors} base={base} />
                    </Text>
                  ))}
                </View>
                {b.rows.map((row, r) => (
                  <View key={r} style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: colors.line }}>
                    {Array.from({ length: cols }).map((_, c) => (
                      <Text key={c} style={[base, cell, { fontSize: fontSize - 1 }]}>
                        <Inline inline={row[c] || [{ text: '' }]} colors={colors} base={base} />
                      </Text>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          );
        }
        return <Text key={i} style={base}><Inline inline={b.inline} colors={colors} base={base} /></Text>;
      })}
    </View>
  );
}
