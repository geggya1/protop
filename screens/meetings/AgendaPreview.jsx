/**
 * Kompakt visning av en dagsorden (mal, skjema eller AI-forslag).
 * Med onChange kan punkter og kapitler fjernes før dagsordenen tas i bruk.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { durationLabel } from '../../src/meetings/model';
import { IconBtn } from './meetingUi';

export default function AgendaPreview({ chapters = [], onChange, maxItems = 200 }) {
  const colors = useColors();
  let shown = 0;
  const total = chapters.reduce((s, c) => s + c.items.reduce((t, i) => t + (Number(i.minutes) || 0), 0), 0);
  const removeItem = (ci, ii) => onChange(chapters
    .map((c, x) => (x === ci ? { ...c, items: c.items.filter((_, y) => y !== ii) } : c))
    .filter((c) => c.items.length));
  const removeChapter = (ci) => onChange(chapters.filter((_, x) => x !== ci));
  return (
    <View style={{ gap: 10 }}>
      {chapters.map((chapter, ci) => (
        <View key={chapter.id || ci} style={{ gap: 4 }}>
          <View style={styles.chapter}>
            <Text style={[styles.chNum, { color: colors.brand }]}>{ci + 1}</Text>
            <Text style={[styles.chTitle, { color: colors.ink }]} numberOfLines={1}>{chapter.title}</Text>
            {onChange ? <IconBtn icon="close" size={15} label={`Fjern kapittel ${chapter.title}`} onPress={() => removeChapter(ci)} /> : null}
          </View>
          {chapter.items.map((item, ii) => {
            shown += 1;
            if (shown > maxItems) return null;
            return (
              <View key={item.id || ii} style={[styles.item, { borderLeftColor: colors.line }]}>
                <Text style={[styles.itNum, { color: colors.muted }]}>{ci + 1}.{ii + 1}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 13.5, color: colors.ink }} numberOfLines={2}>{item.title}</Text>
                  {item.description ? <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }} numberOfLines={2}>{item.description}</Text> : null}
                </View>
                {item.minutes ? <Text style={[styles.min, { color: colors.muted }]}>{item.minutes} min</Text> : null}
                {onChange ? <IconBtn icon="close" size={14} label={`Fjern ${item.title}`} onPress={() => removeItem(ci, ii)} /> : null}
              </View>
            );
          })}
        </View>
      ))}
      {total ? (
        <Text style={{ fontSize: 12.5, color: colors.muted, marginTop: 2 }}>
          {chapters.reduce((s, c) => s + c.items.length, 0)} punkter · {durationLabel(total)}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chapter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  chNum: { width: 22, fontSize: 13, fontWeight: '800' },
  chTitle: { flex: 1, fontSize: 14, fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 8, paddingLeft: 14, borderLeftWidth: 2, paddingVertical: 3 },
  itNum: { width: 30, fontSize: 12, fontWeight: '600' },
  min: { fontSize: 12, width: 48, textAlign: 'right' },
});
