import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { bodyBlocks, placeholderParts } from '../../src/hr/handbook';
import { FOCUS_FIELD_BG, FOCUS_FIELD_INK } from '../../src/forms/highlight';
import { fillTokens } from '../../src/forms/tokens';

/** Én linje der [[…]] vises med gul bakgrunn til bedriften har bekreftet verdien. */
function Line({ value, colors, company, style }) {
  const parts = placeholderParts(fillTokens(value, company || {}));
  return (
    <Text style={[styles.text, { color: colors.ink }, style]}>
      {parts.map((part, index) => (part.mark ? (
        // eslint-disable-next-line react/no-array-index-key
        <Text key={index} style={styles.mark}>{part.text}</Text>
      ) : part.text))}
    </Text>
  );
}

export default function HandbookText({ body, colors, company }) {
  const blocks = bodyBlocks(body);
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === 'h') return <Line key={key} value={block.text} colors={colors} company={company} style={styles.heading} />;
        if (block.kind === 'ul') {
          return (
            <View key={key} style={{ gap: 4 }}>
              {block.items.map((item, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <View key={i} style={styles.bulletRow}>
                  <Text style={[styles.text, { color: colors.muted }]}>•</Text>
                  <View style={{ flex: 1 }}><Line value={item} colors={colors} company={company} /></View>
                </View>
              ))}
            </View>
          );
        }
        return <Line key={key} value={block.text} colors={colors} company={company} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 22 },
  heading: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  mark: { backgroundColor: FOCUS_FIELD_BG, color: FOCUS_FIELD_INK, fontWeight: '600' },
});
