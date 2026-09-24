import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import { useI18n } from '../src/i18n';

const PERIOD_LABEL_KEYS = {
  morning: 'home.periodMorning',
  forenoon: 'home.periodForenoon',
  afternoon: 'home.periodAfternoon',
  evening: 'home.periodEvening',
};

const CLOTHING_KEYS = {
  rain_gear: 'home.clothingRainGear',
  storm_gear: 'home.clothingStormGear',
  snow_gear: 'home.clothingSnowGear',
  very_cold: 'home.clothingVeryCold',
  winter_jacket: 'home.clothingWinterJacket',
  jacket: 'home.clothingJacket',
  light_jacket: 'home.clothingLightJacket',
  summer_clothes: 'home.clothingSummerClothes',
  layers: 'home.clothingLayers',
  windproof: 'home.clothingWindproof',
  light_clothes: 'home.clothingLightClothes',
};

function periodDetail(period) {
  const bits = [period.label];
  if (period.tempRange) bits.push(period.tempRange);
  if (period.precipMm >= 0.5) bits.push(`${String(period.precipMm).replace('.', ',')} mm`);
  else if (period.precipProb >= 40) bits.push(`${period.precipProb} %`);
  return bits.join(' · ');
}

export function ClothingTips({ tips = [], compact = false, style }) {
  const { t } = useI18n();
  if (!tips.length) return null;
  return (
    <View style={[styles.clothingBox, compact && styles.clothingBoxCompact, style]}>
      <View style={styles.clothingHead}>
        <Ionicons name="shirt-outline" size={compact ? 16 : 18} color={colors.brand} />
        <Text style={[styles.clothingTitle, compact && styles.clothingTitleCompact]}>
          {t('home.clothingTitle')}
        </Text>
      </View>
      {tips.map((tip) => (
        <Text key={tip} style={[styles.clothingLine, compact && styles.clothingLineCompact]}>
          · {t(CLOTHING_KEYS[tip] || 'home.clothingLayers')}
        </Text>
      ))}
    </View>
  );
}

export default function WeatherPeriodsView({
  periods = [],
  clothing = [],
  showClothing = true,
  compact = false,
}) {
  const { t } = useI18n();
  if (!periods.length) return null;

  return (
    <View style={styles.wrap}>
      {periods.map((period, index) => (
        <View
          key={period.id}
          style={[
            styles.row,
            compact && styles.rowCompact,
            index < periods.length - 1 && styles.rowBorder,
          ]}
        >
          <View style={styles.periodCol}>
            <Text style={[styles.periodLbl, compact && styles.periodLblCompact]}>
              {t(PERIOD_LABEL_KEYS[period.id] || 'home.periodMorning')}
            </Text>
          </View>
          <View style={styles.iconCol}>
            <Ionicons name={period.icon} size={compact ? 18 : 22} color={colors.brand} />
          </View>
          <View style={styles.infoCol}>
            <Text style={[styles.periodCond, compact && styles.periodCondCompact]} numberOfLines={2}>
              {periodDetail(period)}
            </Text>
          </View>
        </View>
      ))}
      {showClothing && clothing.length ? (
        <ClothingTips tips={clothing} compact={compact} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  rowCompact: { paddingVertical: 7, gap: 8 },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  periodCol: { width: 84 },
  periodLbl: { fontWeight: '700', fontSize: 13, color: colors.ink },
  periodLblCompact: { fontSize: 12 },
  iconCol: { width: 28, alignItems: 'center' },
  infoCol: { flex: 1, minWidth: 0 },
  periodCond: { fontWeight: '500', fontSize: 13, color: colors.ink, lineHeight: 18 },
  periodCondCompact: { fontSize: 12, lineHeight: 16 },
  clothingBox: {
    marginTop: 10,
    backgroundColor: '#fffbeb',
    borderRadius: 12,
    padding: 12,
    gap: 4,
  },
  clothingBoxCompact: { marginTop: 8, padding: 10, borderRadius: 10 },
  clothingHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  clothingTitle: { fontWeight: '700', fontSize: 13, color: '#92400e' },
  clothingTitleCompact: { fontSize: 12 },
  clothingLine: { fontWeight: '600', fontSize: 13, color: '#92400e', lineHeight: 18, paddingLeft: 4 },
  clothingLineCompact: { fontSize: 12, lineHeight: 16 },
});
