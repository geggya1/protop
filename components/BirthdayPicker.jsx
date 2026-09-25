import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, BREAKPOINTS } from '../src/theme';
import { useI18n } from '../src/i18n';
import { addDays, monthGrid, startOfWeekMonday } from '../src/utils/dates';
import {
  calculateAge,
  formatBirthday,
  LANG_LOCALES,
  parseBirthday,
  startOfDay,
  toIsoDate,
} from '../src/utils/age';

/** Fixed day cell size — % width + aspectRatio blows up on wide web parents. */
const DAY_SIZE = 40;
const CAL_MAX = DAY_SIZE * 7; // 280

function localeFor(lang) {
  return LANG_LOCALES[lang] || LANG_LOCALES.nb;
}

function weekdayLabels(lang) {
  const loc = localeFor(lang);
  const monday = startOfWeekMonday(new Date());
  return Array.from({ length: 7 }, (_, i) =>
    addDays(monday, i).toLocaleDateString(loc, { weekday: 'short' }).replace(/\.$/, '')
  );
}

/**
 * @param {object} props
 * @param {string} [props.value] ISO date
 * @param {(iso: string) => void} [props.onChange]
 * @param {number} [props.defaultAge]
 * @param {boolean} [props.alwaysOpen] Keep calendar open (e.g. onboarding)
 * @param {boolean} [props.showAge] Show derived age under the date
 * @param {boolean} [props.allowClear] Optional date — empty stays collapsed
 * @param {number} [props.maxYearsAgo]
 * @param {string} [props.minValue] Earliest ISO date (e.g. birthday for death date)
 * @param {string} [props.maxValue] Latest ISO date (defaults to today)
 * @param {string} [props.ageAsOf] ISO date to compute age against (death date)
 * @param {string} [props.emptyLabel] CTA when optional date is empty
 */
export default function BirthdayPicker({
  value,
  onChange,
  defaultAge = 30,
  alwaysOpen = false,
  showAge = true,
  allowClear = false,
  maxYearsAgo = 120,
  minValue = null,
  maxValue = null,
  ageAsOf = null,
  emptyLabel = null,
}) {
  const { t, lang } = useI18n();
  const { width: winW } = useWindowDimensions();
  const compact = winW >= BREAKPOINTS.tablet;
  const today = startOfDay(new Date());
  const selected = parseBirthday(value);
  const span = Math.min(200, Math.max(1, Number(maxYearsAgo) || 120));
  const minBound = parseBirthday(minValue)
    || new Date(today.getFullYear() - span, today.getMonth(), today.getDate());
  const maxBound = parseBirthday(maxValue) || today;
  const inRange = (d) => d >= minBound && d <= maxBound;
  const valid = !!(selected && inRange(selected));

  const fallbackYear = today.getFullYear() - Math.min(span, Math.max(0, Number(defaultAge) || 30));
  const initialCursor = selected || new Date(fallbackYear, today.getMonth(), 1);
  const clampCursor = (d) => {
    const next = new Date(d.getFullYear(), d.getMonth(), 1);
    if (next < new Date(minBound.getFullYear(), minBound.getMonth(), 1)) {
      return new Date(minBound.getFullYear(), minBound.getMonth(), 1);
    }
    if (next > new Date(maxBound.getFullYear(), maxBound.getMonth(), 1)) {
      return new Date(maxBound.getFullYear(), maxBound.getMonth(), 1);
    }
    return next;
  };
  const [cursor, setCursor] = useState(() => clampCursor(initialCursor));
  const [mode, setMode] = useState('calendar');
  const [editing, setEditing] = useState(() => alwaysOpen || (!allowClear && !valid));

  useEffect(() => {
    if (!selected) return;
    setCursor(new Date(selected.getFullYear(), selected.getMonth(), 1));
  }, [value]);

  useEffect(() => {
    if (alwaysOpen) {
      setEditing(true);
      return;
    }
    if (valid) setEditing(false);
    else if (!allowClear) setEditing(true);
  }, [valid, alwaysOpen, allowClear]);

  const loc = localeFor(lang);
  const days = useMemo(() => monthGrid(cursor), [cursor]);
  const labels = useMemo(() => weekdayLabels(lang), [lang]);
  const ageRef = parseBirthday(ageAsOf) || today;
  const age = calculateAge(selected, ageRef);
  const formatted = formatBirthday(selected, lang);
  const ageLabel = ageAsOf ? t('profile.ageAtDeath') : t('profile.age');

  const title = cursor.toLocaleDateString(loc, { month: 'long', year: 'numeric' });
  const decadeStart = Math.floor(cursor.getFullYear() / 12) * 12;
  const years = Array.from({ length: 12 }, (_, i) => decadeStart + i);

  const pickDay = (d) => {
    if (!inRange(d)) return;
    onChange?.(toIsoDate(d));
    setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
    if (!alwaysOpen) setEditing(false);
  };

  const clearDate = () => {
    onChange?.('');
    if (!alwaysOpen) setEditing(false);
  };

  const shiftMonth = (delta) => {
    setCursor(clampCursor(new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1)));
  };

  const pickYear = (year) => {
    setCursor(clampCursor(new Date(year, cursor.getMonth(), 1)));
    setMode('calendar');
  };

  const sameDay = (a, b) =>
    a && b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();

  if (!editing && valid) {
    return (
      <View style={styles.summary}>
        <View style={styles.summaryIcon}>
          <Ionicons name="calendar-outline" size={18} color={colors.brand} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.summaryDate}>{formatted}</Text>
          {showAge && age != null ? (
            <Text style={styles.summaryAge}>
              {ageLabel}: {age} {t('profile.years')}
            </Text>
          ) : null}
        </View>
        {allowClear ? (
          <TouchableOpacity
            style={styles.editBtn}
            onPress={clearDate}
            accessibilityRole="button"
            accessibilityLabel={t('profile.clearDate')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons name="close" size={16} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.editBtn}
          onPress={() => setEditing(true)}
          accessibilityRole="button"
          accessibilityLabel={t('common.edit')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="pencil" size={16} color={colors.brand} />
        </TouchableOpacity>
      </View>
    );
  }

  if (!editing && allowClear && !valid) {
    return (
      <TouchableOpacity
        style={styles.summary}
        onPress={() => setEditing(true)}
        accessibilityRole="button"
        accessibilityLabel={emptyLabel || t('profile.pickDate')}
      >
        <View style={styles.summaryIcon}>
          <Ionicons name="calendar-outline" size={18} color={colors.brand} />
        </View>
        <Text style={[styles.summaryDate, { color: colors.muted, fontWeight: '400' }]}>
          {emptyLabel || t('profile.pickDate')}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      {(valid || allowClear) && !alwaysOpen ? (
        <View style={styles.editBar}>
          <Text style={styles.editBarTxt}>{emptyLabel || t('profile.pickDate')}</Text>
          <View style={styles.editBarActions}>
            {allowClear && valid ? (
              <TouchableOpacity
                onPress={clearDate}
                style={styles.doneEdit}
                accessibilityRole="button"
                accessibilityLabel={t('profile.clearDate')}
              >
                <Text style={styles.doneEditTxt}>{t('profile.clearDate')}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={() => setEditing(false)}
              style={styles.doneEdit}
              accessibilityRole="button"
            >
              <Text style={styles.doneEditTxt}>{t('common.ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={styles.cal}>
        <View style={styles.nav}>
          <TouchableOpacity
            onPress={() => (mode === 'year' ? setCursor(clampCursor(new Date(cursor.getFullYear() - 12, cursor.getMonth(), 1))) : shiftMonth(-1))}
            style={styles.navBtn}
            accessibilityLabel={t('common.back')}
          >
            <Text style={styles.navTxt}>‹</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setMode(mode === 'year' ? 'calendar' : 'year')} style={styles.navTitleBtn}>
            <Text style={styles.navTitle} numberOfLines={1}>
              {mode === 'year' ? `${decadeStart}–${decadeStart + 11}` : title}
            </Text>
            <Text style={styles.navHint} numberOfLines={1}>
              {mode === 'year' ? t('profile.pickYear') : t('profile.pickDate')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => (mode === 'year' ? setCursor(clampCursor(new Date(cursor.getFullYear() + 12, cursor.getMonth(), 1))) : shiftMonth(1))}
            style={styles.navBtn}
          >
            <Text style={styles.navTxt}>›</Text>
          </TouchableOpacity>
        </View>

        {mode === 'year' ? (
          <View style={styles.yearGrid}>
            {years.map((y) => {
              const disabled = y > maxBound.getFullYear() || y < minBound.getFullYear();
              const on = selected && selected.getFullYear() === y;
              return (
                <TouchableOpacity
                  key={y}
                  disabled={disabled}
                  onPress={() => pickYear(y)}
                  style={[styles.yearCell, on && styles.dayOn, disabled && styles.dayOff]}
                >
                  <Text style={[styles.yearTxt, on && styles.dayOnTxt, disabled && styles.dayMuted]}>{y}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <>
            <View style={styles.weekRow}>
              {labels.map((l, i) => (
                <Text key={i} style={styles.weekLbl}>{l}</Text>
              ))}
            </View>
            <View style={styles.grid}>
              {days.map((d) => {
                const key = toIsoDate(d);
                const outside = d.getMonth() !== cursor.getMonth();
                const disabled = !inRange(d);
                const on = sameDay(d, selected);
                const isToday = sameDay(d, today);
                return (
                  <TouchableOpacity
                    key={key}
                    disabled={disabled}
                    onPress={() => pickDay(d)}
                    style={[
                      styles.day,
                      on && styles.dayOn,
                      isToday && !on && styles.dayToday,
                      disabled && styles.dayOff,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dayTxt,
                        outside && styles.dayMuted,
                        on && styles.dayOnTxt,
                        disabled && styles.dayMuted,
                      ]}
                    >
                      {d.getDate()}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </>
        )}
      </View>

      {showAge || !valid ? (
        <Text style={[styles.ageLine, valid ? styles.ageOk : styles.ageWait]}>
          {valid && showAge && age != null
            ? `${ageLabel}: ${age} ${t('profile.years')}`
            : t('profile.birthdayHint')}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryDate: { fontWeight: '400', fontSize: 16, color: colors.ink },
  summaryAge: { fontWeight: '400', fontSize: 13, color: colors.muted, marginTop: 2 },
  editBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  editBarTxt: { fontWeight: '400', color: colors.muted, fontSize: 13, flex: 1 },
  editBarActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  doneEdit: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.brandSoft,
  },
  doneEditTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  wrap: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 12,
    gap: 8,
    alignSelf: 'stretch',
  },
  wrapCompact: {
    alignSelf: 'flex-start',
    maxWidth: CAL_MAX + 24,
    width: '100%',
  },
  cal: {
    width: '100%',
    maxWidth: CAL_MAX,
    alignSelf: 'center',
  },
  nav: { flexDirection: 'row', alignItems: 'center', gap: 4, width: '100%' },
  navBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  navTxt: { fontSize: 22, fontWeight: '400', color: colors.brand, marginTop: -2 },
  navTitleBtn: { flex: 1, alignItems: 'center', minWidth: 0, paddingHorizontal: 4 },
  navTitle: { fontWeight: '400', fontSize: 15, color: colors.ink, textTransform: 'capitalize' },
  navHint: { color: colors.muted, fontWeight: '400', fontSize: 11 },
  weekRow: { flexDirection: 'row', width: '100%' },
  weekLbl: {
    flex: 1,
    textAlign: 'center',
    fontWeight: '400',
    color: colors.muted,
    fontSize: 11,
    textTransform: 'capitalize',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  day: {
    width: '14.2857%',
    height: DAY_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  dayOn: { backgroundColor: colors.brand },
  dayToday: { borderWidth: 2, borderColor: colors.brand },
  dayOff: { opacity: 0.35 },
  dayTxt: { fontWeight: '400', color: colors.ink, fontSize: 14 },
  dayOnTxt: { color: '#fff' },
  dayMuted: { color: colors.muted },
  yearGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    width: '100%',
  },
  yearCell: {
    width: '31%',
    flexGrow: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.bg,
    alignItems: 'center',
  },
  yearTxt: { fontWeight: '400', fontSize: 15, color: colors.ink },
  ageLine: { fontWeight: '400', fontSize: 14, textAlign: 'center', marginTop: 4 },
  ageOk: { color: colors.brand },
  ageWait: { color: colors.muted },
});
