import React, { useEffect, useMemo, useState } from 'react';
import {
  Image, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useColors } from '../../src/context/ThemeContext';
import { useApp } from '../../src/context/AppContext';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import { useWeather } from '../../src/hooks/useWeather';
import { useParentDashboardTheme } from '../../src/hooks/useParentDashboardTheme';
import { CUSTOM_BANNER_ID, getHomeBanner } from '../../src/homeBanners';
import { formatGreetingDate } from '../../src/utils/timeGreeting';
import { roundTemp } from '../../src/utils/weather';
import { listenParentTodos, toggleParentTodo } from '../../src/utils/todos';
import { isParentTaskOpen, parentTaskVisibleOnDate } from '../../src/utils/parentTasks';
import { parentTaskVisibleToUser } from '../../src/utils/parentTaskVisibility';
import { useBottomChromeInset } from '../../src/utils/useBottomChromeInset';
import { useNow } from '../../src/hooks/useNow';
import { soft } from '../../components/parentHome/softTheme';
import {
  COMPANY_HOME_SHORTCUTS,
  companyGreetingHello,
  companyHomeName,
  companyHomeTaskRows,
} from '../../src/companyHome/model';

const webCardShadow = Platform.OS === 'web'
  ? { boxShadow: '0 10px 28px rgba(15, 23, 42, 0.1)' }
  : { elevation: 3 };

function capitalizeNb(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Låst bedriftsforside for telefon. Nettbrett og PC bruker CompanyDesktopLanding.
 * Bakgrunnsbildet er privat landing sitt bilde, og byttes på samme sted.
 */
export default function CompanyHomePhone() {
  const colors = useColors();
  const nav = useNavigation();
  const { activeProfile, uid, familyId, requestShellTab } = useApp();
  const immersive = useHomeImmersive();
  const { bannerId, customBannerUri } = useParentDashboardTheme();
  const { forecast, place } = useWeather();
  const { contentPaddingBottom } = useBottomChromeInset();
  const [todos, setTodos] = useState([]);
  const [frameHeight, setFrameHeight] = useState(0);
  const [topHeight, setTopHeight] = useState(0);
  const today = useNow(60_000);

  useEffect(() => {
    if (!familyId) {
      setTodos([]);
      return undefined;
    }
    return listenParentTodos(familyId, setTodos);
  }, [familyId]);

  const pack = bannerId === CUSTOM_BANNER_ID ? null : getHomeBanner(bannerId);
  const bannerSource = customBannerUri ? { uri: customBannerUri } : pack?.source || null;
  const hello = companyGreetingHello(today);
  const name = companyHomeName(activeProfile);
  const dateLabel = capitalizeNb(formatGreetingDate(today));
  const temp = forecast?.current?.temp ?? forecast?.today?.temp;
  const weatherIcon = forecast?.current?.icon || forecast?.today?.icon || 'sunny';
  const weatherLabel = forecast?.current?.label || forecast?.today?.label || '';
  const placeName = place?.name || '';
  const showWeather = Number.isFinite(Number(temp)) || !!placeName || !!weatherLabel;

  const viewer = useMemo(() => ({
    uid,
    ids: new Set([uid].filter(Boolean)),
    asChild: false,
  }), [uid]);

  const tasks = useMemo(
    () => companyHomeTaskRows(todos, today, viewer, {
      visibleToUser: parentTaskVisibleToUser,
      visibleOnDate: parentTaskVisibleOnDate,
      isOpen: isParentTaskOpen,
    }),
    [todos, today, viewer],
  );

  const openBanner = () => nav.navigate('DashboardThemeSettings');

  const openShortcut = (item) => {
    requestShellTab?.(item.tab, item.subView || null, item.intent || null);
  };

  const toggleTask = (row) => {
    const task = (todos || []).find((item) => item.id === row.id);
    if (!task || !familyId) return;
    toggleParentTodo(familyId, task, today).catch(() => {});
  };

  return (
    <ScrollView
      nativeID="company-home"
      id="company-home"
      style={[styles.scroll, immersive && styles.scrollClear]}
      contentContainerStyle={styles.body}
      onLayout={(event) => {
        const next = Math.round(event.nativeEvent.layout.height);
        if (next > 0) setFrameHeight((current) => (current === next ? current : next));
      }}
      showsVerticalScrollIndicator={false}
    >
      <View
        onLayout={(event) => {
          const next = Math.round(event.nativeEvent.layout.height);
          if (next > 0) setTopHeight((current) => (current === next ? current : next));
        }}
      >
      <Pressable
        onPress={openBanner}
        accessibilityRole="button"
        accessibilityLabel="Bakgrunnsbilde. Trykk for å bytte bilde."
        style={styles.hero}
        testID="company-home-hero"
      >
        {!immersive && bannerSource ? (
          <Image source={bannerSource} style={styles.heroImage} resizeMode="cover" />
        ) : null}
        {!immersive && !bannerSource ? <View style={styles.heroFallback} pointerEvents="none" /> : null}
        {!immersive ? <View style={styles.heroScrim} pointerEvents="none" /> : null}
        <Text style={styles.hello}>{hello}</Text>
        {name ? <Text style={styles.name} numberOfLines={2}>{name}</Text> : null}
        <Text style={styles.date}>{dateLabel}</Text>
        {showWeather ? (
          <View style={styles.weather} testID="company-home-weather">
            <Ionicons name={weatherIcon} size={34} color="#F6C445" />
            <Text style={styles.temp}>
              {Number.isFinite(Number(temp)) ? `${roundTemp(temp)}°` : '—'}
            </Text>
            <View style={styles.weatherCopy}>
              {placeName ? <Text style={styles.place} numberOfLines={1}>{placeName}</Text> : null}
              {weatherLabel ? <Text style={styles.cond} numberOfLines={2}>{weatherLabel}</Text> : null}
            </View>
          </View>
        ) : null}
      </Pressable>

      <View style={styles.shortcuts} testID="company-home-shortcuts">
        {COMPANY_HOME_SHORTCUTS.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.shortcut}
            onPress={() => openShortcut(item)}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            testID={`company-shortcut-${item.id}`}
          >
            <Ionicons name={item.icon} size={26} color={colors.brand} />
            <Text style={styles.shortcutLabel} numberOfLines={2}>{item.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      </View>

      <View
        style={[
          styles.sheet,
          {
            paddingBottom: contentPaddingBottom,
            minHeight: Math.max(160, frameHeight - topHeight),
          },
        ]}
        testID="company-home-sheet"
      >
        <View style={styles.taskCard} testID="company-home-tasks">
          <View style={styles.taskHead}>
            <Text style={styles.taskTitle}>Mine gjøremål</Text>
            <TouchableOpacity
              onPress={() => requestShellTab?.('stars')}
              accessibilityRole="button"
              accessibilityLabel="Se alle gjøremål"
            >
              <Text style={[styles.seeAll, { color: colors.brand }]}>Se alle</Text>
            </TouchableOpacity>
          </View>
          {tasks.length ? tasks.map((row) => (
            <TouchableOpacity
              key={row.id}
              style={styles.taskRow}
              onPress={() => toggleTask(row)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: false }}
              accessibilityLabel={row.title}
            >
              <Ionicons name="ellipse-outline" size={22} color="#C5CDD8" />
              <Text style={styles.taskLabel} numberOfLines={2}>{row.title}</Text>
              {row.badge > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{row.badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )) : (
            <Text style={styles.empty}>Ingen gjøremål akkurat nå.</Text>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const heroText = {
  color: '#fff',
  fontWeight: '400',
  fontFamily: soft.body,
  textShadowColor: 'rgba(0,0,0,0.45)',
  textShadowOffset: { width: 0, height: 1 },
  textShadowRadius: 6,
};

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: '#F4F7FB' },
  scrollClear: { backgroundColor: 'transparent' },
  body: { flexGrow: 1 },
  hero: {
    minHeight: 280,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 52,
    justifyContent: 'flex-start',
    overflow: 'hidden',
  },
  heroImage: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  heroFallback: { ...StyleSheet.absoluteFillObject, backgroundColor: '#8AA0B8' },
  heroScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.18)',
  },
  hello: { ...heroText, fontSize: 16, lineHeight: 22 },
  name: { ...heroText, fontSize: 32, lineHeight: 38, marginTop: 2 },
  date: { ...heroText, fontSize: 15, lineHeight: 20, marginTop: 4 },
  weather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  temp: { ...heroText, fontSize: 32, lineHeight: 36 },
  weatherCopy: { flex: 1, minWidth: 0 },
  place: { ...heroText, fontSize: 15, lineHeight: 18 },
  cond: { ...heroText, fontSize: 13, lineHeight: 17, marginTop: 1 },
  shortcuts: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    marginTop: -36,
    zIndex: 2,
  },
  shortcut: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#fff',
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    gap: 8,
    ...webCardShadow,
  },
  shortcutLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '400',
    fontFamily: soft.body,
    color: '#1A2744',
    textAlign: 'center',
  },
  sheet: {
    flexGrow: 1,
    backgroundColor: '#F4F7FB',
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  taskCard: {
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 18,
    ...webCardShadow,
  },
  taskHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  taskTitle: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700',
    fontFamily: soft.body,
    color: '#1A2744',
  },
  seeAll: { fontSize: 15, fontWeight: '400', fontFamily: soft.body },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EEF2F6',
  },
  taskLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '400',
    fontFamily: soft.body,
    color: '#1A2744',
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: '#E53935',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '400', fontFamily: soft.body },
  empty: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
    fontFamily: soft.body,
    color: '#5B6B82',
    paddingVertical: 12,
  },
});
