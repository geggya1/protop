/**
 * Artikkeltekst på bedriftssiden (Om oss, Bærekraft). Samme Markdown som ISO-dokumentene
 * (src/iso/markdown.js), men med lesetypografi: større brødtekst, luft og sitat som utheving.
 */
import React, { useMemo } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { parseMarkdown } from '../../src/iso/markdown';
import { withSafeLinks } from '../../src/project/articleFormat';
import { radius, space, type } from '../../src/ui/tokens';

const HEADING = {
  1: type.h1,
  2: type.h2,
  3: type.title,
  4: type.bodyStrong,
};

// Inne i et kort (policy) skal overskriftene ikke være større enn kortets tittel.
const HEADING_COMPACT = {
  1: type.title,
  2: type.title,
  3: type.bodyStrong,
  4: type.bodyStrong,
};

function Inline({ inline, colors }) {
  return inline.map((seg, i) => (
    <Text
      key={i}
      onPress={seg.href ? () => Linking.openURL(seg.href).catch(() => {}) : undefined}
      accessibilityRole={seg.href ? 'link' : undefined}
      style={[
        seg.bold ? styles.bold : null,
        seg.italic ? styles.italic : null,
        seg.code ? { backgroundColor: colors.sunken } : null,
        seg.href ? { color: colors.brandInk || colors.brand, textDecorationLine: 'underline' } : null,
      ]}
    >
      {seg.text}
    </Text>
  ));
}

export default function ArticleText({ text, colors, compact = false }) {
  const blocks = useMemo(() => parseMarkdown(withSafeLinks(text)), [text]);
  if (!blocks.length) return null;
  const body = compact ? styles.bodyCompact : styles.body;
  return (
    <View style={styles.wrap}>
      {blocks.map((b, i) => {
        if (b.type === 'h') {
          return (
            <Text
              key={i}
              accessibilityRole="header"
              style={[(compact ? HEADING_COMPACT : HEADING)[b.level] || type.title, { color: colors.ink }, i ? styles.headingGap : null]}
            >
              <Inline inline={b.inline} colors={colors} />
            </Text>
          );
        }
        if (b.type === 'hr') return <View key={i} style={[styles.rule, { backgroundColor: colors.line }]} />;
        if (b.type === 'quote') {
          return (
            <View key={i} style={[styles.quote, { borderLeftColor: colors.brand }]}>
              <Text style={[body, styles.quoteText, { color: colors.ink }]}>
                <Inline inline={b.inline} colors={colors} />
              </Text>
            </View>
          );
        }
        if (b.type === 'li') {
          const marker = b.checked != null ? (b.checked ? '☑' : '☐') : (b.ordered ? `${b.number}.` : '•');
          return (
            <View key={i} style={[styles.item, b.depth ? styles.itemNested : null]}>
              <Text style={[body, styles.marker, { color: colors.muted }]}>{marker}</Text>
              <Text style={[body, styles.flex, { color: colors.ink }]}>
                <Inline inline={b.inline} colors={colors} />
              </Text>
            </View>
          );
        }
        if (b.type === 'table') {
          return (
            <View key={i} style={[styles.table, { borderColor: colors.line }]}>
              {[b.head, ...b.rows].map((row, r) => (
                <View key={r} style={[styles.tableRow, r ? { borderTopWidth: 1, borderColor: colors.line } : { backgroundColor: colors.sunken }]}>
                  {row.map((cell, c) => (
                    <Text key={c} style={[type.body, styles.cell, r ? null : styles.bold, { color: colors.ink }]}>
                      <Inline inline={cell} colors={colors} />
                    </Text>
                  ))}
                </View>
              ))}
            </View>
          );
        }
        return (
          <Text key={i} style={[body, { color: colors.ink }]}>
            <Inline inline={b.inline} colors={colors} />
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  body: { fontSize: type.body.fontSize + 2, lineHeight: 26 },
  bodyCompact: { fontSize: type.body.fontSize, lineHeight: 22 },
  bold: { fontWeight: '600' },
  italic: { fontStyle: 'italic' },
  headingGap: { marginTop: space.xs },
  rule: { height: 1, marginVertical: space.xxs },
  quote: { borderLeftWidth: 3, paddingLeft: space.md, paddingVertical: space.xxs },
  quoteText: { fontStyle: 'italic' },
  item: { flexDirection: 'row', gap: space.xs, paddingLeft: space.xxs, marginTop: -space.xxs },
  itemNested: { paddingLeft: space.lg },
  marker: { minWidth: 18 },
  flex: { flex: 1 },
  table: { borderWidth: 1, borderRadius: radius.control, overflow: 'hidden' },
  tableRow: { flexDirection: 'row' },
  cell: { flex: 1, padding: space.xs },
});
