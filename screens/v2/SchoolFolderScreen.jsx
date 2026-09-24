import React, { useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useUnread } from '../../src/context/NotificationContext';
import { useColors } from '../../src/context/ThemeContext';
import { useI18n } from '../../src/i18n';
import { radius, useLayout, appTileWidth } from '../../src/theme';
import { countForAction, countForModule, badgeLabel } from '../../src/utils/notifications';
import { buildChildSkoleApps } from '../../src/navigation/shellModules';
import { allowedAppsForChild } from '../../src/utils/childApps';
import { childAppArtName } from '../../src/utils/childHome';
import { Screen } from '../../components/ui';
import SchoolPageLayout from '../../components/SchoolPageLayout';
import ModuleIntroHost from '../../components/ModuleIntroHost';
import ChildArt from '../../components/ChildArt';

/**
 * Helside for Skole-mappen: lekser, klasse, leksehjelp, ukeplan.
 */
export default function SchoolFolderScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const colors = useColors();
  const { t } = useI18n();
  const { pad, appCols, isDesktop } = useLayout();
  const {
    familyId: ctxFamilyId,
    activeChild,
    meChild,
    isChild,
    isParent,
  } = useApp();
  const { unreadByModule } = useUnread();

  const child = route.params?.child || (isChild ? meChild : activeChild) || null;
  const familyId = route.params?.familyId || ctxFamilyId;
  const aiEnabled = child?.aiEnabled !== false;
  const allowedApps = allowedAppsForChild(child);

  const apps = useMemo(
    () => buildChildSkoleApps({
      t, familyId, child, aiEnabled, allowedApps, canEdit: isParent && !isChild,
    }),
    [t, familyId, child, aiEnabled, allowedApps, isParent, isChild],
  );

  const styles = useMemo(
    () => makeStyles(colors, { pad, appCols, isDesktop }),
    [colors, pad, appCols, isDesktop],
  );

  const runAppAction = useCallback((action) => {
    if (!action) return;
    if (action.type === 'nav') {
      nav.navigate(action.screen, action.params);
    }
  }, [nav]);

  return (
    <Screen>
      <SchoolPageLayout activeId="hub" child={child} familyId={familyId} aiEnabled={aiEnabled}>
        <Text style={styles.section}>Apper</Text>
        <View style={styles.grid}>
          {apps.map((app) => {
            const n = countForModule(unreadByModule, app.id)
              || countForAction(unreadByModule, app.action)
              || 0;
            const label = badgeLabel(n);
            const artName = childAppArtName(app.id);
            return (
              <TouchableOpacity
                key={app.id}
                style={[styles.appCard, isDesktop && styles.appCardDesktop]}
                onPress={() => runAppAction(app.action)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={app.label}
              >
                {label ? (
                  <View style={styles.cardBadge} pointerEvents="none">
                    <Text style={styles.cardBadgeTxt}>{label}</Text>
                  </View>
                ) : null}
                <View style={styles.appIconWrap}>
                  {artName ? (
                    <ChildArt name={artName} style={styles.appArt} />
                  ) : (
                    <Ionicons
                      name={app.icon}
                      size={isDesktop ? 28 : 26}
                      color={colors.brand}
                    />
                  )}
                </View>
                <Text style={[styles.appLabel, isDesktop && styles.appLabelDesktop]} numberOfLines={1}>
                  {app.label}
                </Text>
                <Text style={styles.appSub} numberOfLines={1}>{app.sub}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {apps.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTxt}>Ingen skoleapper er tilgjengelige akkurat nå.</Text>
          </View>
        ) : null}
      </SchoolPageLayout>
      <ModuleIntroHost scope="family" moduleId="skole" />
    </Screen>
  );
}

function makeStyles(colors, layout = {}) {
  const pad = layout.pad ?? 20;
  const appCols = Math.min(layout.appCols ?? 3, 3);
  const cardWidth = appTileWidth(appCols, 10);
  const isDesktop = !!layout.isDesktop;
  const webShadow = Platform.OS === 'web'
    ? { boxShadow: '0 6px 16px rgba(15, 23, 42, 0.06)' }
    : {
      shadowColor: '#0f172a',
      shadowOpacity: 0.06,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
    };
  return StyleSheet.create({
    section: {
      fontWeight: '800',
      fontSize: 18,
      color: colors.ink,
      marginBottom: 12,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    appCard: {
      width: cardWidth,
      backgroundColor: '#fff',
      borderRadius: 16,
      paddingVertical: 16,
      paddingHorizontal: 8,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
      position: 'relative',
      overflow: 'visible',
      minHeight: 112,
    },
    appCardDesktop: {
      paddingVertical: 12,
      minHeight: 96,
      borderRadius: 8,
    },
    appIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      backgroundColor: colors.brandSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    appArt: { width: 44, height: 44 },
    appLabel: {
      fontWeight: '800',
      color: colors.ink,
      marginTop: 10,
      fontSize: 13,
      textAlign: 'center',
    },
    appLabelDesktop: { fontSize: 14 },
    appSub: {
      color: colors.muted,
      fontWeight: '600',
      fontSize: 11,
      marginTop: 2,
      textAlign: 'center',
    },
    cardBadge: {
      position: 'absolute',
      top: 8,
      right: 8,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      backgroundColor: '#e11d48',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 4,
      borderWidth: 2,
      borderColor: '#fff',
    },
    cardBadgeTxt: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '900',
      lineHeight: 12,
    },
    empty: {
      backgroundColor: '#fff',
      borderRadius: radius.md,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.line,
      marginTop: 8,
    },
    emptyTxt: { color: colors.muted, fontWeight: '600' },
  });
}
