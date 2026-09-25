import React, { createContext, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';
import { useI18n } from '../src/i18n';
import { useLayout } from '../src/theme';
import HelpButton from './HelpButton';
import HelpTarget from './HelpTarget';
import { AvatarBubble } from './AvatarPicker';
import ProfileMenuModal from './ProfileMenuModal';
import { useApp } from '../src/context/AppContext';
import { useUnread } from '../src/context/NotificationContext';
import IconBadge from './IconBadge';
import BrandLogo from './BrandLogo';
import { isPersonalShell } from '../src/utils/personalShell';
import { companyContextLabel } from '../src/project/companyOffer';
import { openNotifications } from '../src/navigation/openNotifications';

/**
 * PlanScreen (and similar) register a control to sit on the page-title row.
 * Provider value is `{ claim, release }` from AppShell (see useShellTitleRight).
 */
export const ShellTitleRightContext = createContext(null);

/**
 * Toppfelt for AppShell.
 * compact (desktop): én linje — tittel + handlinger.
 * Mobil/nettbrett: logo øverst, deretter familie / side.
 * På telefon stables lyspæren rett under titleRight (f.eks. «Ny hendelse» /
 * «Nytt ønske»), så den ikke overlapper sideverktøy (innstillinger, del, osv.).
 * På Hjem (chromeOnly) er det samme hvite logo-feltet som på modulene —
 * meny, logo, varsler, profil. Logoen (og meny/faner) er veien hjem —
 * ingen egen «Hjem»-tilbakelenke. Lyspæren ligger i WidgetBoard ved siden
 * av blyanten (ikke floated under chrome).
 * Når `hero` er satt (modulheading på telefon), er pastellbåndet selve
 * toppheadingen — rett under logo/meny, uten familienavn og uten stor
 * sidetittel. titleRight (blå «+ …») overlapper nedre høyre kant av båndet;
 * lyspæren sitter under knappen.
 */
export default function ShellHeader({
  title = 'Hjem',
  onMenuPress,
  compact = false,
  dense = false,
  chromeOnly = false,
  showFamilyHint = false,
  titleRight = null,
  onBackHome = null,
  onLogoHome = null,
  hero = null,
}) {
  const nav = useNavigation();
  const { t } = useI18n();
  const colors = useColors();
  const { isPhone } = useLayout();
  const { activeProfile, family } = useApp();
  const { unreadTotal } = useUnread();
  const [menuOpen, setMenuOpen] = useState(false);
  const floatHelp = isPhone && !compact && !dense;

  const pageTitle = title;
  const companyLabel = companyContextLabel(family);
  const familyName = companyLabel
    || (isPersonalShell(family)
      ? (family?.name || 'Mitt hjem')
      : (family?.name || 'ProTop'));
  // onBackHome kept as optional fallback for logo tap only (no visible Hjem link).
  const goHomeFromLogo = onLogoHome || onBackHome;

  if (dense) {
    return (
      <>
        <View style={[styles.barDense, { backgroundColor: colors.card, borderBottomColor: colors.line }]}>
          <View style={styles.sideSlot}>
            {!!onMenuPress && (
              <TouchableOpacity
                style={[styles.iconBtn, styles.iconBtnCompact, { borderColor: colors.line }]}
                onPress={onMenuPress}
                accessibilityLabel="Åpne meny"
                accessibilityRole="button"
              >
                <IconBadge count={unreadTotal} size={16} offset={-4}>
                  <Ionicons name="menu" size={20} color={colors.ink} />
                </IconBadge>
              </TouchableOpacity>
            )}
          </View>
          <View style={[styles.sideSlot, styles.sideSlotEnd]}>
            {!floatHelp ? (
              <HelpButton compact color={colors.ink} borderColor={colors.line} />
            ) : null}
            <TouchableOpacity
              style={[styles.iconBtn, styles.iconBtnCompact, { borderColor: colors.line }]}
              onPress={() => openNotifications(nav)}
              accessibilityLabel="Varslinger"
            >
              <IconBadge count={unreadTotal} size={16} offset={-4}>
                <Ionicons name="notifications-outline" size={18} color={colors.ink} />
              </IconBadge>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.avatarBtn}
              onPress={() => setMenuOpen(true)}
              accessibilityLabel="Profilmeny"
            >
              <AvatarBubble
                avatarId={activeProfile?.avatarId}
                photoURL={activeProfile?.photoURL}
                name={activeProfile?.name || '?'}
                size={28}
              />
            </TouchableOpacity>
          </View>
        </View>
        <ProfileMenuModal visible={menuOpen} onClose={() => setMenuOpen(false)} />
      </>
    );
  }

  if (compact) {
    return (
      <>
        <View style={[styles.barCompact, { backgroundColor: colors.card, borderBottomColor: colors.line }]}>
          {!!onMenuPress && (
            <TouchableOpacity
              style={[styles.iconBtn, styles.iconBtnCompact, { borderColor: colors.line }]}
              onPress={onMenuPress}
              accessibilityLabel="Åpne meny"
              accessibilityRole="button"
            >
              <IconBadge count={unreadTotal} size={16} offset={-4}>
                <Ionicons name="menu" size={18} color={colors.ink} />
              </IconBadge>
            </TouchableOpacity>
          )}
          <View style={styles.textCol}>
            <Text style={[styles.pageTitleCompact, { color: colors.ink }]} numberOfLines={1}>
              {pageTitle}
            </Text>
            <Text style={[styles.metaCompact, { color: colors.muted }]} numberOfLines={1}>
              {familyName}
            </Text>
          </View>
          <View style={styles.actions}>
            {titleRight ? (
              <HelpTarget id="add" style={styles.titleRight}>{titleRight}</HelpTarget>
            ) : null}
            <HelpButton compact color={colors.ink} borderColor={colors.line} />
            <TouchableOpacity
              style={[styles.iconBtn, styles.iconBtnCompact, { borderColor: colors.line }]}
              onPress={() => openNotifications(nav)}
              accessibilityLabel="Varslinger"
            >
              <IconBadge count={unreadTotal} size={16} offset={-4}>
                <Ionicons name="notifications-outline" size={18} color={colors.ink} />
              </IconBadge>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.avatarBtn}
              onPress={() => setMenuOpen(true)}
              accessibilityLabel="Profilmeny"
            >
              <AvatarBubble
                avatarId={activeProfile?.avatarId}
                photoURL={activeProfile?.photoURL}
                name={activeProfile?.name || '?'}
                size={28}
              />
            </TouchableOpacity>
          </View>
        </View>
        <ProfileMenuModal visible={menuOpen} onClose={() => setMenuOpen(false)} />
      </>
    );
  }

  return (
    <>
      <View
        style={styles.chromeRoot}
        collapsable={false}
      >
        <View
          style={[
            styles.bar,
            chromeOnly && styles.barChromeOnly,
            showFamilyHint && styles.barTablet,
            hero && styles.barHero,
            {
              backgroundColor: chromeOnly ? colors.card : colors.bg,
              borderBottomColor: hero ? 'transparent' : colors.line,
            },
          ]}
        >
        <View style={styles.chromeRow}>
          <View style={styles.sideSlot}>
            {!!onMenuPress && (
              <TouchableOpacity
                style={[styles.iconBtn, { borderColor: colors.line, backgroundColor: colors.card }]}
                onPress={onMenuPress}
                accessibilityLabel="Åpne meny"
                accessibilityRole="button"
              >
                <IconBadge count={unreadTotal} size={16} offset={-4}>
                  <Ionicons name="menu" size={22} color={colors.ink} />
                </IconBadge>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.logoCenter} pointerEvents="box-none">
            <TouchableOpacity
              onPress={goHomeFromLogo}
              disabled={typeof goHomeFromLogo !== 'function'}
              accessibilityRole="button"
              accessibilityLabel={t('start.goHome')}
              hitSlop={8}
              style={styles.logoHit}
            >
              <BrandLogo variant="full" height={40} maxWidth={220} accessible={false} />
            </TouchableOpacity>
          </View>

          <View style={[styles.sideSlot, styles.sideSlotEnd]}>
            {!floatHelp ? (
              <HelpButton color={colors.ink} borderColor={colors.line} />
            ) : null}
            <TouchableOpacity
              style={[styles.iconBtn, {
                borderColor: colors.line,
                backgroundColor: colors.card,
              }]}
              onPress={() => openNotifications(nav)}
              accessibilityLabel="Varslinger"
            >
              <IconBadge count={unreadTotal} size={16} offset={-4}>
                <Ionicons name="notifications-outline" size={20} color={colors.ink} />
              </IconBadge>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.avatarBtn}
              onPress={() => setMenuOpen(true)}
              accessibilityLabel="Profilmeny"
            >
              <AvatarBubble
                avatarId={activeProfile?.avatarId}
                photoURL={activeProfile?.photoURL}
                name={activeProfile?.name || '?'}
                size={34}
              />
            </TouchableOpacity>
          </View>
        </View>

        {!chromeOnly ? (
          <View style={styles.textCol}>
            {hero ? (
              <>
                <View style={styles.heroChrome} pointerEvents="box-none">
                  <View nativeID="module-hero-slot" style={styles.heroSlot} pointerEvents="box-none">
                    {hero}
                  </View>
                  {titleRight ? (
                    <View style={styles.heroTitleRight} pointerEvents="box-none">
                      <HelpTarget id="add" style={styles.titleRight}>{titleRight}</HelpTarget>
                    </View>
                  ) : null}
                </View>
                {floatHelp ? (
                  <View style={styles.heroBelowRow} pointerEvents="box-none">
                    <HelpButton floating color={colors.ink} borderColor={colors.line} />
                  </View>
                ) : null}
              </>
            ) : (
              <>
                <Text style={[styles.familyName, { color: colors.muted }]} numberOfLines={1}>
                  {familyName}
                </Text>
                <View style={styles.pageTitleRow}>
                  <Text
                    style={[styles.pageTitle, showFamilyHint && styles.pageTitleTablet, { color: colors.ink }]}
                    numberOfLines={1}
                  >
                    {pageTitle}
                  </Text>
                  {(titleRight || floatHelp) ? (
                    <View style={styles.titleRightCol}>
                      {titleRight ? (
                        <HelpTarget id="add" style={styles.titleRight}>{titleRight}</HelpTarget>
                      ) : null}
                      {floatHelp ? (
                        <HelpButton floating color={colors.ink} borderColor={colors.line} />
                      ) : null}
                    </View>
                  ) : null}
                </View>
              </>
            )}
          </View>
        ) : null}
        </View>
      </View>
      <ProfileMenuModal visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  chromeRoot: {
    position: 'relative',
    zIndex: 2,
    overflow: 'visible',
    flexGrow: 0,
    flexShrink: 0,
  },
  bar: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    gap: 6,
    flexGrow: 0,
    flexShrink: 0,
  },
  barChromeOnly: {
    /* Same chrome sizing as full header; only title rows are omitted */
    gap: 0,
  },
  barHero: {
    gap: 0,
    paddingBottom: 0,
    overflow: 'hidden',
  },
  heroChrome: {
    position: 'relative',
    marginHorizontal: -12,
    marginTop: 0,
    overflow: 'hidden',
    zIndex: 1,
  },
  heroTitleRight: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    zIndex: 2,
  },
  heroBelowRow: {
    marginTop: 4,
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  barTablet: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  barCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderBottomWidth: 1,
    backgroundColor: '#fff',
    width: '100%',
  },
  barDense: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderBottomWidth: 1,
    backgroundColor: '#fff',
    minHeight: 44,
  },
  chromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    minHeight: 40,
  },
  sideSlot: {
    zIndex: 1,
    minWidth: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sideSlotEnd: {
    marginLeft: 'auto',
  },
  logoCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoHit: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { minWidth: 0, flexGrow: 0, flexShrink: 1 },
  pageTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 1,
    minWidth: 0,
  },
  pageTitle: { fontSize: 20, fontWeight: '400', flex: 1, minWidth: 0 },
  titleRightCol: {
    flexShrink: 0,
    alignItems: 'center',
    gap: 8,
  },
  titleRight: { flexShrink: 0 },
  pageTitleTablet: { fontSize: 18 },
  pageTitleCompact: { fontSize: 15, fontWeight: '500', letterSpacing: -0.2 },
  familyName: { fontSize: 13, fontWeight: '500' },
  heroSlot: { marginTop: 0, marginBottom: 0 },
  metaCompact: { fontSize: 12, fontWeight: '400', marginTop: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1,
  },
  iconBtnCompact: {
    width: 32, height: 32, borderRadius: 6,
  },
  avatarBtn: {
    alignSelf: 'flex-start', padding: 2 },
});
