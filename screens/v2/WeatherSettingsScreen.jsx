import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, radius } from '../../src/theme';
import { useI18n } from '../../src/i18n';
import { useWeather } from '../../src/hooks/useWeather';
import { Screen } from '../../components/ui';

const SEARCH_DEBOUNCE_MS = 280;

export default function WeatherSettingsScreen() {
  const nav = useNavigation();
  const { t } = useI18n();
  const {
    place, loading, hits, searching, error,
    search, setPlace, useDevice, useHomeAddress, hasProfileLocation, usingDevice,
  } = useWeather();
  const [q, setQ] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  const onQuery = (text) => {
    setQ(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(text), SEARCH_DEBOUNCE_MS);
  };

  const pick = (hit) => {
    setPlace(hit);
    setQ('');
    search('');
  };

  const placeName = place?.name || t('home.weatherPlace');
  const sourceLabel = usingDevice
    ? t('home.weatherUseLocation')
    : (place?.source === 'profile' ? t('home.weatherUseHome') : placeName);

  return (
    <Screen>
      <View style={styles.head}>
        <TouchableOpacity onPress={() => nav.goBack()} style={styles.back} accessibilityRole="button">
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.headTitle}>{t('home.weatherSettings')}</Text>
        <View style={styles.back} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.hint}>{t('home.weatherSettingsHint')}</Text>

        <View style={styles.currentBox}>
          <Ionicons name="partly-sunny-outline" size={20} color={colors.brand} />
          <View style={{ flex: 1 }}>
            <Text style={styles.currentLbl}>{t('home.weatherPlace')}</Text>
            <Text style={styles.currentVal}>{placeName}</Text>
            <Text style={styles.currentSub}>{sourceLabel}</Text>
          </View>
          {loading ? <ActivityIndicator size="small" color={colors.brand} /> : null}
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            value={q}
            onChangeText={onQuery}
            placeholder={t('home.weatherSearch')}
            placeholderTextColor={colors.muted}
            style={styles.searchInput}
            autoCorrect={false}
          />
          {searching ? <ActivityIndicator size="small" color={colors.brand} /> : null}
        </View>

        <View style={styles.quickRow}>
          <TouchableOpacity style={styles.quickBtn} onPress={() => { useDevice(); }}>
            <Ionicons name="navigate-outline" size={16} color={colors.brand} />
            <Text style={styles.quickTxt}>{t('home.weatherUseLocation')}</Text>
          </TouchableOpacity>
          {hasProfileLocation ? (
            <TouchableOpacity style={styles.quickBtn} onPress={() => { useHomeAddress(); }}>
              <Ionicons name="home-outline" size={16} color={colors.brand} />
              <Text style={styles.quickTxt}>{t('home.weatherUseHome')}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {error ? <Text style={styles.err}>{error}</Text> : null}

        {hits.map((hit) => (
          <TouchableOpacity key={`${hit.lat},${hit.lng}`} style={styles.hit} onPress={() => pick(hit)}>
            <Ionicons name="location-outline" size={16} color={colors.brand} />
            <Text style={styles.hitTxt} numberOfLines={1}>{hit.label}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.muted} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, textAlign: 'center', fontWeight: '700', fontSize: 16, color: colors.ink },
  body: { padding: 16, gap: 12, paddingBottom: 40 },
  hint: { fontWeight: '500', fontSize: 14, color: colors.muted, lineHeight: 20 },
  currentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: radius.md,
    padding: 14,
  },
  currentLbl: { fontWeight: '600', fontSize: 11, color: colors.muted, textTransform: 'uppercase' },
  currentVal: { fontWeight: '700', fontSize: 16, color: colors.ink, marginTop: 2 },
  currentSub: { fontWeight: '500', fontSize: 12, color: colors.muted, marginTop: 2 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.card,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  quickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.brandSoft,
  },
  quickTxt: { fontWeight: '600', fontSize: 13, color: colors.brand },
  hit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  hitTxt: { flex: 1, fontWeight: '500', fontSize: 14, color: colors.ink },
  err: { fontWeight: '600', fontSize: 13, color: colors.danger },
});
