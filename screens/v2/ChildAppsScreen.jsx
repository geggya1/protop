import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout, appTileWidth } from '../../src/theme';
import { Screen, Loader } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import { AvatarBubble } from '../../components/AvatarPicker';
import ChildAppAccessCard from '../../components/ChildAppAccessCard';
import {
  allowedAppsForChild,
  persistChildAllowedApps,
  countAllowedApps,
} from '../../src/utils/childApps';

const COL_GAP = 12;
const COL_MAX = 300;

function childAppColumns({ width, isPhone, isTablet, railWidth, pad, kidCount }) {
  if (!kidCount) return 1;
  if (isPhone) return 1;
  const minCol = isTablet ? 240 : 196;
  const chrome = railWidth + pad * 2 + 24;
  const available = Math.max(minCol, width - chrome);
  const fit = Math.max(1, Math.floor((available + COL_GAP) / (minCol + COL_GAP)));
  return Math.min(5, kidCount, fit);
}

/**
 * Admin/foreldre: slå av og på apper per barn, uten å bytte til barneprofil.
 */
export default function ChildAppsScreen({ onBack }) {
  const nav = useNavigation();
  const { width, isPhone, isTablet, isDesktop, railWidth, pad } = useLayout();
  const { familyId, kids, isParent, isChild } = useApp();
  const canEdit = isParent && !isChild;
  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false && k.archived !== true && k.deleted !== true),
    [kids],
  );
  const cols = useMemo(
    () => childAppColumns({
      width, isPhone, isTablet, railWidth, pad, kidCount: activeKids.length,
    }),
    [width, isPhone, isTablet, railWidth, pad, activeKids.length],
  );
  const accordion = isPhone && activeKids.length > 1;
  const [openId, setOpenId] = useState(null);
  const [localApps, setLocalApps] = useState({});

  useEffect(() => {
    if (!accordion || openId || activeKids.length === 0) return;
    setOpenId(activeKids[0].id);
  }, [accordion, activeKids, openId]);

  const appsFor = useCallback((kid) => (
    localApps[kid.id] || allowedAppsForChild(kid)
  ), [localApps]);

  const toggleApp = useCallback((kid, appId, value) => {
    if (!canEdit || !familyId || !kid?.id) return;
    setLocalApps((prev) => {
      const current = prev[kid.id] || allowedAppsForChild(kid);
      const next = { ...current, [appId]: value };
      persistChildAllowedApps(familyId, kid.id, next).catch(() => {});
      return { ...prev, [kid.id]: next };
    });
  }, [canEdit, familyId]);

  const goBack = () => {
    if (onBack) onBack();
    else if (nav.canGoBack()) nav.goBack();
  };

  if (!familyId) {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  const gridStyle = Platform.OS === 'web'
    ? {
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gap: COL_GAP,
      maxWidth: cols * COL_MAX + (cols - 1) * COL_GAP,
      alignItems: 'start',
    }
    : {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: COL_GAP,
      maxWidth: cols === 1 && !isPhone ? COL_MAX : undefined,
    };

  const nativeColWidth = cols === 1 ? '100%' : appTileWidth(cols, COL_GAP);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={[styles.body, isDesktop && styles.bodyDesktop]}
        showsVerticalScrollIndicator={false}
      >
        <CompactBackLink onPress={goBack} label="Mer" />
        <Text style={[styles.screenTitle, isDesktop && styles.screenTitleDesk]}>Barnas apper</Text>
        <Text style={[styles.lead, isDesktop && styles.leadDesk]}>
          Velg hvilke moduler hvert barn skal se i appen. Hjem og innstillinger kan ikke slås av.
        </Text>

        {!canEdit ? (
          <Text style={styles.empty}>Bare foresatte kan endre tilganger.</Text>
        ) : activeKids.length === 0 ? (
          <Text style={styles.empty}>Ingen barn i familien ennå.</Text>
        ) : (
          <View style={gridStyle}>
            {activeKids.map((kid) => {
              const open = !accordion || openId === kid.id;
              const { on: onCount, total } = countAllowedApps(appsFor(kid));
              return (
                <View
                  key={kid.id}
                  style={[
                    styles.kidBlock,
                    !isPhone && styles.kidBlockDesk,
                    Platform.OS !== 'web' && { width: nativeColWidth },
                  ]}
                >
                  <View style={[
                    styles.kidHead,
                    !isPhone && styles.kidHeadDesk,
                    open && styles.kidHeadOpen,
                  ]}>
                    {accordion ? (
                      <TouchableOpacity
                        style={styles.kidHeadMain}
                        onPress={() => setOpenId(open ? null : kid.id)}
                        accessibilityRole="button"
                      >
                        <KidIdentity kid={kid} onCount={onCount} total={total} compact={!isPhone} />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.kidHeadMain}>
                        <KidIdentity kid={kid} onCount={onCount} total={total} compact={!isPhone} />
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => nav.navigate('ChildSettings', { familyId, child: kid })}
                      accessibilityRole="button"
                      accessibilityLabel={`Innstillinger for ${kid.name || 'barnet'}`}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      style={styles.settingsBtn}
                    >
                      <Ionicons name="settings-outline" size={16} color={colors.brand} />
                    </TouchableOpacity>
                    {accordion ? (
                      <Ionicons
                        name={open ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.muted}
                      />
                    ) : null}
                  </View>
                  {open ? (
                    <View style={[styles.kidBody, !isPhone && styles.kidBodyDesk]}>
                      <ChildAppAccessCard
                        allowedApps={appsFor(kid)}
                        onToggle={(appId, value) => toggleApp(kid, appId, value)}
                        title={null}
                        subtitle={null}
                        compact
                        showCount={false}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>
    </Screen>
  );
}

function KidIdentity({ kid, onCount, total, compact }) {
  return (
    <>
      <AvatarBubble
        avatarId={kid.avatarId}
        photoURL={kid.photoURL || kid.photoUrl}
        name={kid.name}
        size={compact ? 28 : 36}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.kidName, compact && styles.kidNameDesk]} numberOfLines={1}>
          {kid.name || 'Barn'}
        </Text>
        <Text style={[styles.kidSub, compact && styles.kidSubDesk]}>
          {onCount} av {total} på
        </Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 40 },
  bodyDesktop: { paddingHorizontal: 12, paddingTop: 4 },
  screenTitle: { fontSize: 22, fontWeight: '400', color: colors.ink, marginBottom: 6 },
  screenTitleDesk: { fontSize: 18, fontWeight: '400', letterSpacing: -0.2, marginBottom: 4 },
  lead: {
    fontSize: 13, fontWeight: '500', color: colors.muted, lineHeight: 18, marginBottom: 14,
  },
  leadDesk: { fontSize: 13, fontWeight: '400', marginBottom: 12 },
  empty: { fontSize: 13, fontWeight: '500', color: colors.muted, marginTop: 8 },
  kidBlock: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    minWidth: 0,
  },
  kidBlockDesk: { borderRadius: 8 },
  kidHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  kidHeadOpen: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  kidHeadDesk: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  kidHeadMain: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kidName: { fontSize: 14, fontWeight: '400', color: colors.ink },
  kidNameDesk: { fontSize: 13, fontWeight: '400' },
  kidSub: { fontSize: 12, fontWeight: '500', color: colors.muted, marginTop: 1 },
  kidSubDesk: { fontSize: 11, fontWeight: '400' },
  kidBody: { paddingHorizontal: 8, paddingBottom: 8 },
  kidBodyDesk: { paddingHorizontal: 6, paddingBottom: 6 },
  settingsBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
