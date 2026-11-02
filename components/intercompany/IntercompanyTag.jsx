import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mirrorTag } from '../../src/intercompany/model';

/**
 * Lite merke på rader fra et tilknyttet selskap: «Datter AS · faktura 20001».
 * Gi row (speilet time, utlegg eller salg) eller label direkte. Hele forklaringen ligger i
 * tilgjengelighetsteksten (og som verktøytips på web).
 */
export default function IntercompanyTag({ row = null, label = '', tone = 'ok', colors, style }) {
  const tag = row ? mirrorTag(row) : (label ? { label, tone, title: label } : null);
  if (!tag) return null;
  const wait = tag.tone === 'wait';
  const fg = wait ? colors.warnInk : colors.brandInk;
  const bg = wait ? `${colors.warn}22` : colors.brandSoft;
  return (
    <View
      style={[styles.tag, { backgroundColor: bg }, style]}
      accessibilityLabel={tag.title}
      {...(typeof document !== 'undefined' ? { title: tag.title } : {})}
    >
      <Ionicons name={wait ? 'time-outline' : 'git-merge-outline'} size={11} color={fg} />
      <Text style={[styles.text, { color: fg }]} numberOfLines={1}>{tag.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 3,
    maxWidth: '100%',
  },
  text: { fontSize: 11, fontWeight: '500', flexShrink: 1 },
});
