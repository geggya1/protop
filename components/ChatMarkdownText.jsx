import React, { useMemo } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { parseChatMarkdown } from '../src/utils/chatMarkdown';

/**
 * Renders AI chat text with bold / italic / lists visible in the bubble.
 */
export default function ChatMarkdownText({
  text,
  style,
  user = false,
}) {
  const blocks = useMemo(() => parseChatMarkdown(text), [text]);

  return (
    <View style={styles.wrap}>
      {blocks.map((block, i) => {
        const isList = block.type === 'ul' || block.type === 'ol';
        const padLeft = isList ? 2 + (block.indent || 0) * 10 : 0;
        const isBlank = block.segments.length === 1 && !block.segments[0].text;
        if (isBlank) {
          return <View key={`b-${i}`} style={styles.blank} />;
        }
        return (
          <Text
            key={`b-${i}`}
            style={[style, padLeft ? { paddingLeft: padLeft } : null, i > 0 && styles.blockGap]}
          >
            {block.segments.map((seg, j) => (
              <Text
                key={`s-${i}-${j}`}
                style={[
                  seg.bold && styles.bold,
                  seg.italic && styles.italic,
                  seg.underline && styles.underline,
                  seg.code && (user ? styles.codeUser : styles.code),
                ]}
              >
                {seg.text}
              </Text>
            ))}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexShrink: 1 },
  blank: { height: 8 },
  blockGap: { marginTop: 3 },
  bold: { fontWeight: '800' },
  italic: { fontStyle: 'italic' },
  underline: { textDecorationLine: 'underline' },
  code: {
    fontFamily: 'monospace',
    backgroundColor: '#f1f5f9',
    fontWeight: '600',
    fontSize: 13,
  },
  codeUser: {
    fontFamily: 'monospace',
    backgroundColor: 'rgba(255,255,255,0.18)',
    fontWeight: '600',
    fontSize: 13,
  },
});
