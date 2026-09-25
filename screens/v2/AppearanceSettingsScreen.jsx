import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Switch, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAppearance } from '../../src/appearance/AppearanceContext';
import { useI18n } from '../../src/i18n';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import TimeField from '../../components/TimeField';

function Preview({ mode, selected, label, onPress }) {
  const colors = useColors();
  const dark = mode === 'dark';
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.previewHit}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
    >
      <View style={[styles.phone, dark ? styles.phoneDark : styles.phoneLight]}>
        <View style={[styles.phoneBar, dark ? styles.phoneBarDark : styles.phoneBarLight]} />
        <View style={[styles.phoneCard, dark ? styles.phoneCardDark : styles.phoneCardLight]}>
          <View style={[styles.line, dark ? styles.lineDark : styles.lineLight, { width: '72%' }]} />
          <View style={[styles.line, dark ? styles.lineDark : styles.lineLight, { width: '48%' }]} />
        </View>
        <View style={[styles.phoneCard, dark ? styles.phoneCardDark : styles.phoneCardLight]}>
          <View style={[styles.line, dark ? styles.lineDark : styles.lineLight, { width: '84%' }]} />
        </View>
      </View>
      <Text style={[styles.previewLabel, { color: colors.ink }]}>{label}</Text>
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={26}
        color={selected ? '#0a84ff' : colors.muted}
      />
    </TouchableOpacity>
  );
}

export default function AppearanceSettingsScreen() {
  const nav = useNavigation();
  const { t } = useI18n();
  const colors = useColors();
  const { isDesktop } = useLayout();
  const { prefs, scheme, summary, updatePrefs } = useAppearance();
  const [page, setPage] = useState('main');
  const card = { backgroundColor: colors.card, borderColor: colors.line };
  const ink = { color: colors.ink };
  const muted = { color: colors.muted };

  const optionsValue = summary.key === 'darkUntil'
    ? t('settings.appearanceDarkUntil', { time: summary.time })
    : summary.key === 'lightUntil'
      ? t('settings.appearanceLightUntil', { time: summary.time })
      : t('settings.appearanceFollowSystem');

  const pickManual = (manual) => {
    updatePrefs({ automatic: false, manual });
  };

  if (page === 'options') {
    return (
      <Screen>
        <ScrollView contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}>
          <CompactBackLink label={t('settings.appearance')} onPress={() => setPage('main')} />
          <Text style={[styles.title, ink]}>{t('settings.appearanceOptions')}</Text>
          <Text style={[styles.lead, muted]}>{t('settings.appearanceOptionsLead')}</Text>
          <View style={[styles.group, card]}>
            <TouchableOpacity
              style={styles.optionRow}
              onPress={() => updatePrefs({ schedule: 'system' })}
              accessibilityRole="radio"
              accessibilityState={{ selected: prefs.schedule !== 'clock' }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, ink]}>{t('settings.appearanceFollowSystem')}</Text>
                <Text style={[styles.optionHint, muted]}>{t('settings.appearanceFollowSystemHint')}</Text>
              </View>
              <Ionicons
                name={prefs.schedule !== 'clock' ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={prefs.schedule !== 'clock' ? '#0a84ff' : colors.muted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.optionRow, styles.optionRowLast]}
              onPress={() => updatePrefs({ schedule: 'clock' })}
              accessibilityRole="radio"
              accessibilityState={{ selected: prefs.schedule === 'clock' }}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.optionTitle, ink]}>{t('settings.appearanceCustomSchedule')}</Text>
                <Text style={[styles.optionHint, muted]}>{t('settings.appearanceCustomScheduleHint')}</Text>
              </View>
              <Ionicons
                name={prefs.schedule === 'clock' ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={prefs.schedule === 'clock' ? '#0a84ff' : colors.muted}
              />
            </TouchableOpacity>
          </View>
          {prefs.schedule === 'clock' ? (
            <View style={[styles.group, card, { marginTop: 14 }]}>
              <View style={styles.timeRow}>
                <Text style={[styles.optionTitle, ink]}>{t('settings.appearanceDarkFrom')}</Text>
                <TimeField value={prefs.darkAt} onChange={(darkAt) => updatePrefs({ darkAt })} />
              </View>
              <View style={[styles.timeRow, styles.optionRowLast]}>
                <Text style={[styles.optionTitle, ink]}>{t('settings.appearanceLightFrom')}</Text>
                <TimeField value={prefs.lightAt} onChange={(lightAt) => updatePrefs({ lightAt })} />
              </View>
            </View>
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}>
        <CompactBackLink label={t('settings.title')} onPress={() => nav.goBack()} />
        <Text style={[styles.title, ink]}>{t('settings.appearance')}</Text>
        <Text style={[styles.lead, muted]}>{t('settings.appearanceLead')}</Text>

        <View style={styles.previews}>
          <Preview
            mode="light"
            label={t('settings.appearanceLight')}
            selected={scheme === 'light'}
            onPress={() => pickManual('light')}
          />
          <Preview
            mode="dark"
            label={t('settings.appearanceDark')}
            selected={scheme === 'dark'}
            onPress={() => pickManual('dark')}
          />
        </View>

        <View style={[styles.group, card]}>
          <View style={styles.switchRow}>
            <Text style={[styles.optionTitle, ink]}>{t('settings.appearanceAutomatic')}</Text>
            <Switch
              value={prefs.automatic}
              onValueChange={(automatic) => updatePrefs({ automatic })}
              trackColor={{ false: '#d1d5db', true: '#34c759' }}
              thumbColor={Platform.OS === 'android' ? (prefs.automatic ? '#f4fff6' : '#f9fafb') : undefined}
              accessibilityLabel={t('settings.appearanceAutomatic')}
            />
          </View>
          {prefs.automatic ? (
            <TouchableOpacity
              style={[styles.optionRow, styles.optionRowLast]}
              onPress={() => setPage('options')}
              accessibilityRole="button"
            >
              <Text style={[styles.optionTitle, ink]}>{t('settings.appearanceOptions')}</Text>
              <Text style={[styles.optionValue, muted]} numberOfLines={1}>{optionsValue}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 },
  bodyDesk: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '400', marginTop: 8, marginBottom: 6 },
  lead: { fontSize: 15, lineHeight: 21, marginBottom: 18 },
  previews: { flexDirection: 'row', justifyContent: 'center', gap: 28, marginBottom: 22 },
  previewHit: { alignItems: 'center', width: 120 },
  phone: {
    width: 92,
    height: 132,
    borderRadius: 16,
    padding: 8,
    gap: 6,
    borderWidth: 1,
    marginBottom: 8,
  },
  phoneLight: { backgroundColor: '#f2f2f7', borderColor: '#d1d1d6' },
  phoneDark: { backgroundColor: '#000000', borderColor: '#3a3a3c' },
  phoneBar: { height: 10, borderRadius: 4, marginHorizontal: 10 },
  phoneBarLight: { backgroundColor: '#ffffff' },
  phoneBarDark: { backgroundColor: '#2c2c2e' },
  phoneCard: { borderRadius: 8, padding: 8, gap: 5 },
  phoneCardLight: { backgroundColor: '#ffffff' },
  phoneCardDark: { backgroundColor: '#1c1c1e' },
  line: { height: 6, borderRadius: 3 },
  lineLight: { backgroundColor: '#d1d1d6' },
  lineDark: { backgroundColor: '#636366' },
  previewLabel: { fontSize: 15, fontWeight: '400', marginBottom: 6 },
  group: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 52,
    gap: 12,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.35)',
  },
  optionRowLast: {},
  optionTitle: { fontSize: 16, fontWeight: '400' },
  optionHint: { fontSize: 13, marginTop: 2, lineHeight: 18 },
  optionValue: { flex: 1, textAlign: 'right', fontSize: 15 },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.35)',
  },
});
