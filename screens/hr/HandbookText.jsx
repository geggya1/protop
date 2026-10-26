import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { bodyBlocks, placeholderParts } from '../../src/hr/handbook';
import { FOCUS_FIELD_BG, FOCUS_FIELD_INK } from '../../src/forms/highlight';
import { fillTokens } from '../../src/forms/tokens';
import { markParts } from '../../src/doccontrol/content';

export const COMMENT_BG = '#e3edff';
export const COMMENT_INK = '#1d4f91';

/**
 * Én linje der [[…]] vises med gul bakgrunn til bedriften har bekreftet verdien.
 * marks er sitater fra merknader. De vises med blå bakgrunn for dem som ser merknadene.
 */
function Line({ value, colors, company, style, marks }) {
  const parts = placeholderParts(fillTokens(value, company || {}));
  return (
    <Text style={[styles.text, { color: colors.ink }, style]}>
      {parts.map((part, index) => markParts(part.text, marks).map((bit, i) => {
        // eslint-disable-next-line react/no-array-index-key
        const key = `${index}-${i}`;
        if (!part.mark && !bit.hit) return bit.text;
        return <Text key={key} style={[part.mark && styles.mark, bit.hit && styles.comment]}>{bit.text}</Text>;
      }))}
    </Text>
  );
}

export default function HandbookText({ body, colors, company, marks = null }) {
  const blocks = bodyBlocks(body);
  return (
    <View style={{ gap: 8 }}>
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === 'h') return <Line key={key} value={block.text} colors={colors} company={company} style={styles.heading} marks={marks} />;
        if (block.kind === 'ul') {
          return (
            <View key={key} style={{ gap: 4 }}>
              {block.items.map((item, i) => (
                // eslint-disable-next-line react/no-array-index-key
                <View key={i} style={styles.bulletRow}>
                  <Text style={[styles.text, { color: colors.muted }]}>•</Text>
                  <View style={{ flex: 1 }}><Line value={item} colors={colors} company={company} marks={marks} /></View>
                </View>
              ))}
            </View>
          );
        }
        return <Line key={key} value={block.text} colors={colors} company={company} marks={marks} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 15, lineHeight: 22 },
  heading: { fontSize: 16, fontWeight: '700', marginTop: 6 },
  bulletRow: { flexDirection: 'row', gap: 8, paddingLeft: 4 },
  mark: { backgroundColor: FOCUS_FIELD_BG, color: FOCUS_FIELD_INK, fontWeight: '600' },
  comment: { backgroundColor: COMMENT_BG, color: COMMENT_INK, borderBottomWidth: 2, borderBottomColor: '#6b9be0' },
});
