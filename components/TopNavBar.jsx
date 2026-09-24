// components/TopNavBar.jsx
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  useWindowDimensions, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useOptionalRoute } from '../src/hooks/useOptionalRoute';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useApp } from '../src/context/AppContext';
import { AvatarBubble } from './AvatarPicker';
import ProfileMenuModal from './ProfileMenuModal';

function defaultPages(familyId) {
  const pages = [
    { label: 'Familier', route: 'FamilyOverview', icon: 'home-outline' },
  ];
  if (familyId) {
    pages.push({
      label: 'Aktiviteter',
      route: 'Activities',
      params: { familyId },
      icon: 'fitness-outline',
    });
  }
  return pages;
}

export default function TopNavBar({
  title = 'Familiedashboard',
  subtitle = '',
  pages = null,
  bg = '#0b74d1',
  familyId = null,
  showBack = false,
  onBack = null,
  showMenu = false,
  onMenuPress = null,
  showInfo = false,
  onInfoPress = null,
  rightIcon = null,      // e.g. 'settings-outline'
  onRightIcon = null,    // callback for custom right icon
  onAvatarPress = null,
  onTitlePress = null,
}) {
  const navigation = useNavigation();
  const route = useOptionalRoute();
  const { activeProfile } = useApp();
  const { width } = useWindowDimensions();
  const isWide = width >= 768;

  const [menuOpen, setMenuOpen] = useState(false);

  const effectiveFamilyId =
    familyId
    ?? route?.params?.familyId
    ?? route?.params?.parent?.familyId
    ?? route?.params?.child?.familyId
    ?? null;

  const navPages = useMemo(() => {
    const base = Array.isArray(pages) && pages.length ? pages : defaultPages(effectiveFamilyId);
    const hasActivities = base.some((p) => p.route === 'Activities');
    if (effectiveFamilyId && !hasActivities) {
      return [
        ...base,
        {
          label: 'Aktiviteter',
          route: 'Activities',
          params: { familyId: effectiveFamilyId },
          icon: 'fitness-outline',
        },
      ];
    }
    return base;
  }, [pages, effectiveFamilyId]);

  const go = (page) => {
    if (!page?.route) return;
    setMenuOpen(false);
    if (page.params) navigation.navigate(page.route, page.params);
    else navigation.navigate(page.route);
  };

  const handleBack = () => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }
    // Gå bare én side tilbake dersom mulig
    if (navigation.canGoBack()) navigation.goBack();
  };

  const handleAvatarPress = () => {
    if (typeof onAvatarPress === 'function') return onAvatarPress();
    setMenuOpen(true);
  };

  return (
    <SafeAreaView edges={['top']} style={[styles.safe, { backgroundColor: bg }]}>
      <View style={[styles.appbar, { backgroundColor: bg }]}>
        {/* Venstre: hamburger og/eller tilbake */}
        <View style={[styles.left, showMenu && showBack && styles.leftWide]}>
          {showMenu && onMenuPress ? (
            <TouchableOpacity
              onPress={onMenuPress}
              style={styles.roundBtn}
              accessibilityLabel="Åpne meny"
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="menu" size={24} color="#fff" />
            </TouchableOpacity>
          ) : null}
          {showBack ? (
            <TouchableOpacity
              onPress={handleBack}
              style={styles.roundBtn}
              accessibilityLabel="Tilbake"
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="chevron-back" size={22} color="#fff" />
            </TouchableOpacity>
          ) : null}
          {!showMenu && !showBack ? (
            <MaterialCommunityIcons name="calendar-check" size={22} color="#fff" style={{ marginRight: 8 }} />
          ) : null}
        </View>

        {/* Tittel */}
        <View style={styles.center} pointerEvents="box-none">
          <TouchableOpacity
            disabled={!onTitlePress}
            onPress={onTitlePress}
            style={styles.titleWrap}
            accessibilityRole={onTitlePress ? 'button' : undefined}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text numberOfLines={1} style={styles.title}>{title}</Text>
            {!!subtitle && <Text numberOfLines={1} style={styles.subtitle}>{subtitle}</Text>}
            {onTitlePress && <Ionicons name="chevron-down" size={14} color="#dbeafe" style={{ marginLeft: 6 }} />}
          </TouchableOpacity>
        </View>

        {/* Sider (bred skjerm) */}
        {isWide && (
          <View style={styles.pages}>
            {navPages.map((p) => (
              <TouchableOpacity
                key={p.label}
                style={styles.pageBtn}
                onPress={() => go(p)}
                accessibilityRole="button"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.pageText}>{p.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Høyre */}
        <View style={styles.right}>
          {showInfo && (
            <TouchableOpacity
              onPress={onInfoPress}
              style={[styles.roundBtn, { marginRight: 8 }]}
              accessibilityLabel="Info"
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="information-circle-outline" size={20} color="#fff" />
            </TouchableOpacity>
          )}
          {rightIcon && onRightIcon && (
            <TouchableOpacity
              onPress={onRightIcon}
              style={[styles.roundBtn, { marginRight: 8 }]}
              accessibilityLabel="Innstillinger"
              accessibilityRole="button"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name={rightIcon} size={20} color="#fff" />
            </TouchableOpacity>
          )}

          <TouchableOpacity
            onPress={handleAvatarPress}
            style={styles.avatarBtn}
            accessibilityLabel="Profilmeny"
            accessibilityRole="button"
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <AvatarBubble
              avatarId={activeProfile?.avatarId}
              photoURL={activeProfile?.photoURL}
              name={activeProfile?.name || '?'}
              size={32}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ProfileMenuModal visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { zIndex: 1000, position: 'relative' } : {}),
  },
  appbar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    zIndex: 1000,
    position: 'relative',
  },
  left: { width: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },
  leftWide: { width: 80, gap: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flexDirection: 'row', alignItems: 'center', maxWidth: '90%' },
  title: { color: '#fff', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#dbeafe', fontSize: 12, marginLeft: 8 },
  pages: { flexDirection: 'row', marginLeft: 12 },
  pageBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, marginRight: 6 },
  pageText: { color: '#fff', fontWeight: '600' },
  right: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center' },
  roundBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarBtn: { padding: 4 },
});
