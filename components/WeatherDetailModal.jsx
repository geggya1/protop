import React, { useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, ActivityIndicator,
  Platform, ScrollView, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../src/i18n';
import { useWeather } from '../src/hooks/useWeather';
import { colors, radius } from '../src/theme';
import WeatherPeriodsView from './WeatherPeriodsView';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch {}
}

const SEARCH_DEBOUNCE_MS = 280;

function DayCol({ label, day }) {
  if (!day) {
    return (
      <View style={styles.dayCol}>
        <Text style={styles.dayLbl}>{label}</Text>
        <Text style={styles.muted}>—</Text>
      </View>
    );
  }
  return (
    <View style={styles.dayCol}>
      <Text style={styles.dayLbl}>{label}</Text>
      <View style={styles.dayHead}>
        <Ionicons name={day.icon} size={18} color={colors.brand} />
        <Text style={styles.dayTemp}>{day.tempRange}</Text>
      </View>
      <Text style={styles.dayCond} numberOfLines={2}>{day.label}</Text>
    </View>
  );
}

function WeatherDetailCard({ onClose }) {
  const { t } = useI18n();
  const {
    place, forecast, loading, error, hits, searching,
    search, setPlace, useDevice, useHomeAddress, hasProfileLocation,
  } = useWeather();
  const [dayTab, setDayTab] = useState('today');
  const [editing, setEditing] = useState(false);
  const [q, setQ] = useState('');
  const debounceRef = React.useRef(null);

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
    setEditing(false);
    setQ('');
    search('');
  };

  const current = forecast?.current;
  const periods = dayTab === 'today' ? forecast?.todayPeriods : forecast?.tomorrowPeriods;
  const clothing = dayTab === 'today' ? forecast?.clothing : [];
  const placeName = place?.name || t('home.weatherPlace');

  return (
    <View style={styles.card} accessibilityRole="dialog" accessibilityViewIsModal>
      <View style={styles.cardHead}>
        <Text style={styles.title}>{t('home.weatherDetailTitle')}</Text>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="close" size={22} color={colors.muted} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} showsVerticalScrollIndicator={false}>
        <View style={styles.placeRow}>
          <Ionicons name="location-outline" size={16} color={colors.brand} />
          <Text style={styles.placeName} numberOfLines={1}>{placeName}</Text>
          <TouchableOpacity onPress={() => setEditing((v) => !v)}>
            <Text style={styles.change}>{editing ? t('common.cancel') : t('home.weatherChangePlace')}</Text>
          </TouchableOpacity>
        </View>

        {editing ? (
          <View style={styles.editBox}>
            <View style={styles.searchRow}>
              <Ionicons name="search" size={16} color={colors.muted} />
              <TextInput
                value={q}
                onChangeText={onQuery}
                placeholder={t('home.weatherSearch')}
                placeholderTextColor={colors.muted}
                style={styles.searchInput}
                autoFocus
                autoCorrect={false}
              />
              {searching ? <ActivityIndicator size="small" color={colors.brand} /> : null}
            </View>
            <View style={styles.quickRow}>
              <TouchableOpacity
                style={styles.quickBtn}
                onPress={async () => {
                  if (await useDevice()) setEditing(false);
                }}
              >
                <Ionicons name="navigate-outline" size={14} color={colors.brand} />
                <Text style={styles.quickTxt}>{t('home.weatherUseLocation')}</Text>
              </TouchableOpacity>
              {hasProfileLocation ? (
                <TouchableOpacity
                  style={styles.quickBtn}
                  onPress={async () => {
                    if (await useHomeAddress()) setEditing(false);
                  }}
                >
                  <Ionicons name="home-outline" size={14} color={colors.brand} />
                  <Text style={styles.quickTxt}>{t('home.weatherUseHome')}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {hits.map((hit) => (
              <TouchableOpacity key={`${hit.lat},${hit.lng}`} style={styles.hit} onPress={() => pick(hit)}>
                <Ionicons name="location-outline" size={16} color={colors.brand} />
                <Text style={styles.hitTxt} numberOfLines={1}>{hit.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {loading && !forecast ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        ) : error && !forecast && !editing ? (
          <Text style={styles.error}>{error}</Text>
        ) : (
          <>
            {current?.temp != null ? (
              <View style={styles.nowRow}>
                <Ionicons name={current.icon} size={28} color={colors.brand} />
                <Text style={styles.nowTemp}>{current.temp}°</Text>
                <Text style={styles.nowCond}>{current.label}</Text>
              </View>
            ) : null}

            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, dayTab === 'today' && styles.tabOn]}
                onPress={() => setDayTab('today')}
              >
                <Text style={[styles.tabTxt, dayTab === 'today' && styles.tabTxtOn]}>{t('home.today')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, dayTab === 'tomorrow' && styles.tabOn]}
                onPress={() => setDayTab('tomorrow')}
              >
                <Text style={[styles.tabTxt, dayTab === 'tomorrow' && styles.tabTxtOn]}>{t('home.tomorrow')}</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLbl}>{t('home.weatherDayParts')}</Text>
            {periods?.length ? (
              <WeatherPeriodsView
                periods={periods}
                clothing={clothing}
                showClothing={dayTab === 'today'}
              />
            ) : (
              <View style={styles.days}>
                <DayCol label={t('home.today')} day={forecast?.today} />
                <View style={styles.daySplit} />
                <DayCol label={t('home.tomorrow')} day={forecast?.tomorrow} />
              </View>
            )}

            {forecast?.summary ? (
              <Text style={styles.summary}>{forecast.summary}</Text>
            ) : null}
          </>
        )}

        <Text style={styles.attr}>{forecast?.sourceLabel || t('home.weatherSource')}</Text>
      </ScrollView>
    </View>
  );
}

export default function WeatherDetailModal({ visible, onClose }) {
  if (!visible) return null;

  const overlay = (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
      <WeatherDetailCard onClose={onClose} />
    </View>
  );

  if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined') {
    return createPortal(overlay, document.body);
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {overlay}
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...Platform.select({
      web: { position: 'fixed', inset: 0, zIndex: 100000 },
      default: { flex: 1 },
    }),
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 20, 25, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    backgroundColor: colors.card,
    borderRadius: 24,
    zIndex: 1,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.18)' },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      },
    }),
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  title: { fontWeight: '800', fontSize: 18, color: colors.ink },
  scroll: { maxHeight: 520 },
  scrollInner: { paddingHorizontal: 20, paddingBottom: 20 },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  placeName: { flex: 1, fontWeight: '500', fontSize: 13, color: colors.muted },
  change: { fontWeight: '600', fontSize: 12, color: colors.brand },
  nowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
    backgroundColor: '#f0f9ff',
    borderRadius: 14,
    padding: 12,
  },
  nowTemp: { fontWeight: '800', fontSize: 28, color: colors.ink },
  nowCond: { flex: 1, fontWeight: '600', fontSize: 14, color: colors.ink },
  tabRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  tabOn: { backgroundColor: colors.brandSoft },
  tabTxt: { fontWeight: '600', fontSize: 13, color: colors.muted },
  tabTxtOn: { color: colors.brand },
  sectionLbl: {
    fontWeight: '700',
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  days: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 8,
  },
  dayCol: { flex: 1, minWidth: 0 },
  daySplit: { width: 1, backgroundColor: colors.line },
  dayLbl: { fontWeight: '600', fontSize: 10, color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  dayTemp: { fontWeight: '600', fontSize: 14, color: colors.ink },
  dayCond: { fontWeight: '400', fontSize: 12, color: colors.ink },
  summary: { fontWeight: '400', fontSize: 12, color: colors.ink, marginTop: 12, lineHeight: 17 },
  attr: { fontWeight: '400', fontSize: 10, color: colors.muted, marginTop: 12 },
  muted: { color: colors.muted },
  error: { color: colors.danger, fontWeight: '500', fontSize: 13, paddingVertical: 8 },
  center: { paddingVertical: 16, alignItems: 'center' },
  editBox: { marginBottom: 12 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: colors.bg,
  },
  searchInput: { flex: 1, fontSize: 14, fontWeight: '400', color: colors.ink, paddingVertical: 2 },
  quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  quickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 999, backgroundColor: colors.brandSoft,
  },
  quickTxt: { fontWeight: '500', fontSize: 12, color: colors.brand },
  hit: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  hitTxt: { flex: 1, fontWeight: '500', fontSize: 13, color: colors.ink },
});
