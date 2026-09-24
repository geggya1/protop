import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors } from '../src/theme';
import { custodyLegendLabels } from '../src/utils/custodySchedule';

export default function CustodyLegendBar({
  visible,
  kids,
  viewerUid,
  childFilter,
  members,
  viewerIsChild = false,
}) {
  if (!visible) return null;
  const labels = custodyLegendLabels({ kids, viewerUid, childFilter, members, viewerIsChild });

  return (
    <View style={styles.wrap}>
      <View style={styles.item}>
        <View style={[styles.swatch, styles.swatchMine]} />
        <Text style={styles.txt}>{labels.mine}</Text>
      </View>
      {labels.other ? (
        <View style={styles.item}>
          <View style={[styles.swatch, styles.swatchOther]} />
          <Text style={styles.txt}>{labels.other}</Text>
        </View>
      ) : null}
      {labels.mixed ? (
        <View style={styles.item}>
          <View style={[styles.swatch, styles.swatchMixed]} />
          <Text style={styles.txt}>{labels.mixed}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  item: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 4, borderWidth: 1 },
  swatchMine: { backgroundColor: 'rgba(37, 99, 235, 0.35)', borderColor: '#2563eb' },
  swatchOther: { backgroundColor: 'rgba(234, 88, 12, 0.28)', borderColor: '#ea580c' },
  swatchMixed: { backgroundColor: 'rgba(245, 158, 11, 0.35)', borderColor: '#f59e0b' },
  txt: { fontSize: 11, fontWeight: '700', color: colors.muted },
});
