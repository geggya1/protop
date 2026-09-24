import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { todoEmoji, todoIconPath } from '../src/utils/todoIcons';
import WebSafeIcon from './WebSafeIcon';

/**
 * Gjøremål-ikon: prøver bilde (Storage / public), faller tilbake til emoji
 * så ruten aldri blir tom grå boks.
 */
export default function TodoTaskIcon({ task, style, emojiStyle, emojiSize = 22 }) {
  const emoji = todoEmoji(task);
  const path = todoIconPath(task);
  const fallback = (
    <Text style={[styles.emoji, emojiSize ? { fontSize: emojiSize } : null, emojiStyle]}>
      {emoji}
    </Text>
  );
  if (!path) return fallback;
  return (
    <WebSafeIcon
      pathOrUrl={path}
      style={style}
      fallback={fallback}
    />
  );
}

const styles = StyleSheet.create({
  emoji: { textAlign: 'center' },
});
