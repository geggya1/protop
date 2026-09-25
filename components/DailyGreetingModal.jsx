import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Pressable, ActivityIndicator,
  Platform, ScrollView, LayoutAnimation, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../src/i18n';
import { useApp } from '../src/context/AppContext';
import { useUnread } from '../src/context/NotificationContext';
import { useWeather } from '../src/hooks/useWeather';
import { useDailyGreeting } from '../src/hooks/useDailyGreeting';
import { useGreetingDayStatus } from '../src/hooks/useGreetingDayStatus';
import { colors, radius } from '../src/theme';
import WeatherPeriodsView from './WeatherPeriodsView';
import WeatherDetailModal from './WeatherDetailModal';
import {
  firstNameFromProfile,
  formatGreetingDate,
  greetingKey,
  periodEmoji,
} from '../src/utils/timeGreeting';
import { interpretWeatherCode, roundTemp } from '../src/utils/weather';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

function interpolate(template, vars = {}) {
  return String(template || '').replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

function WeatherRow({ forecast, place, loading, onPress, asChild = false, period = 'morning' }) {
  const { t } = useI18n();
  if (loading) {
    return (
      <View style={styles.weatherRow}>
        <ActivityIndicator size="small" color={colors.brand} />
        <Text style={styles.weatherTxt}>{t('greeting.weatherLoading')}</Text>
      </View>
    );
  }
  const code = forecast?.current?.code ?? forecast?.today?.code;
  const info = interpretWeatherCode(code);
  const temp = roundTemp(forecast?.current?.temp ?? forecast?.today?.max);
  const placeName = place?.name || place?.label?.split(',')[0] || '';
  const periods = forecast?.todayPeriods || [];
  const clothing = forecast?.clothing || [];
  const showChildDetail = asChild && period === 'morning' && periods.length > 0;

  if (temp == null && !info.label) return null;

  const inner = (
    <>
      <Ionicons name={info.icon} size={showChildDetail ? 24 : 28} color={colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={styles.weatherTemp}>{temp != null ? `${temp}°` : '—'}</Text>
        <Text style={styles.weatherTxt}>
          {[info.label, placeName].filter(Boolean).join(' · ')}
        </Text>
        {showChildDetail ? (
          <View style={styles.weatherChildDetail}>
            <Text style={styles.weatherChildTitle}>{t('greeting.weatherToday')}</Text>
            <WeatherPeriodsView
              periods={periods.filter((p) => p.id !== 'evening')}
              clothing={clothing}
              compact
            />
          </View>
        ) : null}
        {onPress ? (
          <Text style={styles.weatherTap}>{t('greeting.weatherTapDetail')}</Text>
        ) : null}
      </View>
      {onPress ? (
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      ) : null}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[styles.weatherRow, showChildDetail && styles.weatherRowExpanded]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('greeting.weatherTapDetail')}
      >
        {inner}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.weatherRow, showChildDetail && styles.weatherRowExpanded]}>
      {inner}
    </View>
  );
}

function StatusRow({ icon, label, value, hint, tone = 'default' }) {
  const valueColor = tone === 'good'
    ? '#15803d'
    : tone === 'warn'
      ? '#b45309'
      : '#0f1419';
  return (
    <View style={styles.statusRow}>
      <View style={styles.statusIcon}>
        <Ionicons name={icon} size={18} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.statusLabel}>{label}</Text>
        {hint ? <Text style={styles.statusHint}>{hint}</Text> : null}
      </View>
      <Text style={[styles.statusValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function DayStatusBlock({ status, period, t }) {
  const { asChild, chores, tasks, todayEvents, peekEvents } = status;

  const choreValue = chores.total === 0
    ? t('greeting.noneToday')
    : interpolate(t('greeting.doneOf'), { done: chores.done, total: chores.total });
  const choreHint = chores.remaining > 0
    ? interpolate(t('greeting.remaining'), { n: chores.remaining })
    : (chores.total > 0 ? t('greeting.allDone') : null);
  const choreTone = chores.total === 0
    ? 'default'
    : (chores.remaining === 0 ? 'good' : (chores.ratio != null && chores.ratio < 0.5 ? 'warn' : 'default'));

  const taskValue = tasks.total === 0
    ? t('greeting.noneToday')
    : interpolate(t('greeting.doneOf'), { done: tasks.done, total: tasks.total });
  const taskHint = tasks.remaining > 0
    ? interpolate(t('greeting.openTasks'), { n: tasks.remaining })
    : (tasks.total > 0 ? t('greeting.allDone') : null);
  const taskTone = tasks.total === 0
    ? 'default'
    : (tasks.remaining === 0 ? 'good' : 'warn');

  const eventValue = todayEvents.length === 0
    ? t('greeting.noEvents')
    : interpolate(t('greeting.eventCount'), { n: todayEvents.length });
  const eventHint = peekEvents?.[0]
    ? `${peekEvents[0].time} · ${peekEvents[0].title}`
    : null;

  return (
    <View style={styles.statusBlock}>
      <Text style={styles.sectionLabel}>
        {period === 'evening' ? t('greeting.todayStatus') : t('greeting.dayStatus')}
      </Text>

      {asChild ? (
        <StatusRow
          icon="checkbox-outline"
          label={t('greeting.chores')}
          value={choreValue}
          hint={choreHint}
          tone={choreTone}
        />
      ) : (
        <StatusRow
          icon="checkbox-outline"
          label={t('greeting.tasks')}
          value={taskValue}
          hint={taskHint}
          tone={taskTone}
        />
      )}

      <StatusRow
        icon="calendar-outline"
        label={t('greeting.calendar')}
        value={eventValue}
        hint={eventHint}
      />

      {peekEvents?.length > 1 ? (
        <View style={styles.eventPeek}>
          {peekEvents.slice(0, 3).map((ev) => (
            <Text key={ev.id} style={styles.eventPeekLine} numberOfLines={1}>
              {ev.time} · {ev.title}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function YesterdayProgress({ status, t }) {
  const [open, setOpen] = useState(false);
  const { yesterday, yesterdayChores, yesterdayTasks, asChild } = status;
  const hasData = yesterday.total > 0 || yesterday.eventCount > 0;

  if (!hasData) return null;

  const pct = yesterday.ratio != null ? Math.round(yesterday.ratio * 100) : null;
  const summary = yesterday.total > 0
    ? interpolate(t('greeting.yesterdayDone'), {
      done: yesterday.done,
      total: yesterday.total,
      pct: pct ?? 0,
    })
    : interpolate(t('greeting.yesterdayEventsOnly'), { n: yesterday.eventCount });

  const coach = yesterday.weak
    ? t('greeting.coachBetter')
    : yesterday.strong
      ? t('greeting.coachProud')
      : null;

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <View style={styles.yesterdayWrap}>
      <TouchableOpacity
        style={styles.yesterdayHeader}
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.yesterdayTitle}>{t('greeting.yesterdayTitle')}</Text>
          <Text style={styles.yesterdaySummary} numberOfLines={open ? 4 : 2}>{summary}</Text>
        </View>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color="#536471"
        />
      </TouchableOpacity>

      {open ? (
        <View style={styles.yesterdayBody}>
          {asChild ? (
            yesterdayChores.total > 0 ? (
              <Text style={styles.yesterdayDetail}>
                {t('greeting.chores')}: {yesterdayChores.done}/{yesterdayChores.total}
              </Text>
            ) : null
          ) : (
            yesterdayTasks.total > 0 ? (
              <Text style={styles.yesterdayDetail}>
                {t('greeting.tasks')}: {yesterdayTasks.done}/{yesterdayTasks.total}
              </Text>
            ) : null
          )}
          {yesterday.eventCount > 0 ? (
            <Text style={styles.yesterdayDetail}>
              {t('greeting.calendar')}: {interpolate(t('greeting.eventCount'), { n: yesterday.eventCount })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {coach ? (
        <View style={[
          styles.coachBanner,
          yesterday.weak ? styles.coachWarn : styles.coachGood,
        ]}
        >
          <Ionicons
            name={yesterday.weak ? 'bulb-outline' : 'sparkles-outline'}
            size={18}
            color={yesterday.weak ? '#92400e' : '#166534'}
          />
          <Text style={[
            styles.coachTxt,
            { color: yesterday.weak ? '#92400e' : '#166534' },
          ]}
          >
            {coach}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function GreetingCard({ period, onClose, status }) {
  const { t, lang } = useI18n();
  const { userProfile, meParent, meChild, isChild, isActingAsChild, activeChild } = useApp();
  const { unreadTotal } = useUnread();
  const { forecast, place, loading: weatherLoading } = useWeather();
  const [weatherOpen, setWeatherOpen] = useState(false);
  const profile = isChild || isActingAsChild ? (activeChild || meChild) : (userProfile || meParent);
  const firstName = firstNameFromProfile(profile, '');
  const asChild = status.asChild;

  const title = interpolate(t(greetingKey(period)), { name: firstName || t('greeting.friend') });
  const locale = lang === 'nb' ? 'nb-NO' : `${lang}-${lang.toUpperCase()}`;
  const dateLine = formatGreetingDate(new Date(), locale);

  const tipLine = useMemo(() => {
    if (unreadTotal > 0) return interpolate(t('greeting.unread'), { n: unreadTotal });
    if (period === 'evening') return t('greeting.eveningTip');
    return null;
  }, [unreadTotal, period, t]);

  const handleClose = () => {
    setWeatherOpen(false);
    onClose();
  };

  return (
    <View style={styles.card} accessibilityRole="dialog" accessibilityViewIsModal>
      <ScrollView
        style={styles.cardScroll}
        contentContainerStyle={styles.cardScrollInner}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={styles.emoji}>{periodEmoji(period)}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.date}>{dateLine}</Text>

        <WeatherRow
          forecast={forecast}
          place={place}
          loading={weatherLoading}
          onPress={() => setWeatherOpen(true)}
          asChild={asChild}
          period={period}
        />

        <WeatherDetailModal visible={weatherOpen} onClose={() => setWeatherOpen(false)} />

        <DayStatusBlock status={status} period={period} t={t} />

        {tipLine ? (
          <Text style={styles.tipLine}>{tipLine}</Text>
        ) : null}

        {period === 'morning' ? (
          <YesterdayProgress status={status} t={t} />
        ) : null}
      </ScrollView>

      <TouchableOpacity style={styles.btn} onPress={handleClose} accessibilityRole="button">
        <Text style={styles.btnTxt}>
          {period === 'evening' ? t('greeting.endDay') : t('greeting.startDay')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Morgen- og kveldshilsen som popup for alle innloggede brukere.
 */
export default function DailyGreetingModal({ uid, enabled = true }) {
  const { period, visible, dismiss } = useDailyGreeting(uid, { enabled });
  const dayStatus = useGreetingDayStatus({ enabled: enabled && !!period });
  const [allowDismiss, setAllowDismiss] = useState(false);

  useEffect(() => {
    if (visible) {
      setAllowDismiss(false);
      const id = setTimeout(() => setAllowDismiss(true), 400);
      return () => clearTimeout(id);
    }
    setAllowDismiss(false);
    return undefined;
  }, [visible]);

  if (!visible || !period) return null;

  const overlay = (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        onPress={() => { if (allowDismiss) dismiss(); }}
        accessibilityRole="button"
        accessibilityLabel="Lukk"
      />
      <GreetingCard period={period} onClose={dismiss} status={dayStatus} />
    </View>
  );

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
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
    maxWidth: 420,
    maxHeight: '88%',
    backgroundColor: colors.card,
    borderRadius: 24,
    paddingTop: 24,
    paddingBottom: 20,
    zIndex: 1,
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
  cardScroll: { maxHeight: 480 },
  cardScrollInner: { paddingHorizontal: 22, paddingBottom: 8 },
  emoji: { fontSize: 36, textAlign: 'center', marginBottom: 8 },
  title: {
    fontSize: 24,
    fontWeight: '400',
    color: '#0f1419',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  date: {
    fontSize: 14,
    fontWeight: '400',
    color: '#536471',
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 16,
    textTransform: 'capitalize',
  },
  weatherRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#f0f9ff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
  },
  weatherRowExpanded: { paddingBottom: 10 },
  weatherChildDetail: { marginTop: 10 },
  weatherChildTitle: {
    fontSize: 12,
    fontWeight: '400',
    color: '#536471',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  weatherTap: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.brand,
    marginTop: 6,
  },
  weatherTemp: { fontSize: 22, fontWeight: '400', color: '#0f1419' },
  weatherTxt: { fontSize: 13, fontWeight: '400', color: '#536471', marginTop: 2 },
  statusBlock: {
    backgroundColor: '#f7f9f9',
    borderRadius: 16,
    padding: 12,
    gap: 4,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: '#536471',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  statusIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusLabel: { fontSize: 14, fontWeight: '400', color: '#0f1419' },
  statusHint: { fontSize: 12, fontWeight: '400', color: '#536471', marginTop: 2 },
  statusValue: { fontSize: 14, fontWeight: '400' },
  eventPeek: { paddingLeft: 42, paddingBottom: 4, gap: 2 },
  eventPeekLine: { fontSize: 12, fontWeight: '400', color: '#536471' },
  tipLine: {
    fontSize: 13,
    fontWeight: '400',
    color: '#536471',
    textAlign: 'center',
    marginBottom: 10,
    lineHeight: 18,
  },
  yesterdayWrap: {
    borderTopWidth: 1,
    borderTopColor: '#eff3f4',
    paddingTop: 12,
    marginBottom: 8,
  },
  yesterdayHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  yesterdayTitle: {
    fontSize: 13,
    fontWeight: '400',
    color: '#0f1419',
    marginBottom: 2,
  },
  yesterdaySummary: {
    fontSize: 13,
    fontWeight: '400',
    color: '#536471',
    lineHeight: 18,
  },
  yesterdayBody: {
    marginTop: 10,
    paddingLeft: 4,
    gap: 4,
  },
  yesterdayDetail: { fontSize: 13, fontWeight: '400', color: '#0f1419' },
  yesterdayKid: { fontSize: 12, fontWeight: '400', color: '#536471', paddingLeft: 8 },
  coachBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
  },
  coachWarn: { backgroundColor: '#fffbeb' },
  coachGood: { backgroundColor: '#f0fdf4' },
  coachTxt: { flex: 1, fontSize: 13, fontWeight: '400', lineHeight: 18 },
  btn: {
    alignSelf: 'flex-start',
    marginHorizontal: 22,
    marginTop: 8,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
});
