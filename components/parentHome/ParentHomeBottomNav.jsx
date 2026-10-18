import React, { useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import IconBadge from '../IconBadge';
import { parentAppShortLabel } from '../../src/utils/parentHomeShortcuts';
import { MAX_PARENT_BOTTOM_SHORTCUTS } from '../../src/parentDashboardThemes';
import { useI18n } from '../../src/i18n';
import { soft } from './softTheme';
import { IMMERSIVE_GLASS_BG, immersiveGlassBarStyle } from '../../src/theme/immersiveGlass';
import { isStandaloneWeb, tabBarBottomPad } from '../../src/shell/standaloneChrome';
import { useVisualViewportFrame } from '../../src/shell/useVisualViewportFrame';

function builtinNav(t) {
  return {
    home: { id: 'home', label: t('tabs.home'), icon: 'home' },
    plan: { id: 'plan', label: t('nav.planShort'), icon: 'calendar' },
    family: { id: 'family', label: t('nav.family'), icon: 'people' },
    more: { id: 'more', label: t('tabs.more'), icon: 'ellipsis-horizontal' },
    stars: { id: 'stars', label: t('tabs.tasks'), icon: 'checkmark-circle' },
    chores: { id: 'chores', label: t('tabs.chores'), icon: 'star' },
    shop: { id: 'shop', label: t('tabs.shop'), icon: 'cart' },
    chat: { id: 'chat', label: t('tabs.chat'), icon: 'chatbubbles' },
    mail: { id: 'mail', label: t('tabs.mail'), icon: 'mail' },
    meals: { id: 'meals', label: t('home.meals'), icon: 'restaurant' },
  };
}

function navPalette(tokens) {
  return {
    bg: tokens?.surface || soft.card,
    line: tokens?.border || soft.line,
    accent: tokens?.accent || soft.sage,
    accentSoft: tokens?.accentSoft || soft.brandSoft,
    muted: tokens?.textMuted || tokens?.textSecondary || soft.muted,
  };
}

/**
 * Valgfri bunnnavigasjon med inntil 5 snarveier.
 * Farger følger dashboard-temaets tokens. Alltid tilgjengelig — ikke knyttet til layout-tema.
 */
export default function ParentHomeBottomNav({
  ids = [],
  appById = {},
  badgeById = {},
  activeId = null,
  onSelect,
  tokens = null,
  includeSafeArea = true,
  onLayout,
  glass = false,
  presetItems = null,
}) {
  const insets = useSafeAreaInsets();
  const frame = useVisualViewportFrame();
  const { t } = useI18n();
  const palette = navPalette(tokens);
  const items = useMemo(() => {
    if (Array.isArray(presetItems) && presetItems.length) {
      return presetItems.slice(0, MAX_PARENT_BOTTOM_SHORTCUTS).map((item) => ({
        ...item,
        badge: Number(badgeById[item.id] || item.badge || 0),
      }));
    }
    const builtin = builtinNav(t);
    return (ids || []).slice(0, MAX_PARENT_BOTTOM_SHORTCUTS).map((id) => {
      if (builtin[id]) {
        return { ...builtin[id], badge: Number(badgeById[id] || 0) };
      }
      const app = appById[id];
      if (app) {
        return {
          id: app.id,
          label: parentAppShortLabel(app) || app.label,
          icon: app.icon || 'apps',
          action: app.action,
          badge: Number(badgeById[id] || app.badge || 0),
        };
      }
      return { id, label: id, icon: 'apps', badge: Number(badgeById[id] || 0) };
    });
  }, [ids, appById, badgeById, t, presetItems]);

  if (!items.length) return null;

  // Home-indicator clearance lives inside the bar, so the bar itself reaches
  // the screen edge. Safari's covered bottom band is part of that padding:
  // the icons stay visible and the toolbar sits on our background.
  const standalone = isStandaloneWeb();
  const bottomPad = includeSafeArea
    ? tabBarBottomPad(insets.bottom, {
      standalone,
      web: Platform.OS === 'web',
      browserOverlap: standalone ? 0 : frame.bottom,
    })
    : 0;

  return (
    <View
      nativeID="parent-bottom-nav"
      onLayout={onLayout}
      style={[
        styles.bar,
        glass && styles.barGlass,
        {
          paddingBottom: bottomPad,
          backgroundColor: glass ? IMMERSIVE_GLASS_BG : palette.bg,
          borderTopColor: glass ? 'transparent' : palette.line,
        },
      ]}
      accessibilityRole="tablist"
    >
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <TouchableOpacity
            key={item.id}
            style={styles.item}
            onPress={() => onSelect?.(item)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={item.label}
          >
            <View style={[
              styles.iconWrap,
              active && { backgroundColor: glass ? 'rgba(255,255,255,0.22)' : palette.accentSoft },
            ]}
            >
              <IconBadge count={item.badge || 0} size={13} offset={-4}>
                <Ionicons
                  name={active && item.iconActive ? item.iconActive : item.icon}
                  size={20}
                  color={active ? (glass ? '#E8F8EC' : palette.accent) : (glass ? '#F4F7FB' : palette.muted)}
                />
              </IconBadge>
            </View>
            <Text
              style={[
                styles.label,
                { color: active ? (glass ? '#fff' : palette.accent) : (glass ? '#F4F7FB' : palette.muted) },
                active && styles.labelOn,
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 4,
    paddingHorizontal: 4,
    flexShrink: 0,
  },
  barGlass: {
    borderTopWidth: 0,
    ...immersiveGlassBarStyle({ edge: 'bottom' }),
  },
  item: {
    flex: 1,
    alignItems: 'center',
    gap: 1,
    paddingVertical: 3,
  },
  iconWrap: {
    width: 40,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: soft.wReg,
    fontFamily: soft.body,
  },
  labelOn: {
    fontWeight: soft.wMed,
  },
});
