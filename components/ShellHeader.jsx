import React, { createContext, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
import PlatformSwitch from './PlatformSwitch';
import { brandLogoToneForBackground } from '../src/brand/brandLogoTone';
import { isPersonalShell } from '../src/utils/personalShell';
import { companyContextLabel } from '../src/project/companyOffer';
import { openNotifications } from '../src/navigation/openNotifications';
import { isStandaloneWeb, statusBarCover } from '../src/shell/standaloneChrome';

/**
 * PlanScreen (and similar) register a control to sit on the page-title row.
 * Provider value is `{ claim, release }` from AppShell (see useShellTitleRight).
 */
export const ShellTitleRightContext = createContext(null);

/**
 * Phone pages that draw their own band (fraværsoversikt) claim this slot.
 * The band replaces familienavn + stor sidetittel, same as ModuleHero.
 */
export const ShellPageHeroContext = createContext(null);

/**
 * Toppfelt for AppShell.
 * compact (desktop): én linje — tittel + handlinger.
 * Privat/Bedrift er låst i midten av linjen, uavhengig av tittel og sideknapper.
 * Mobil/nettbrett: logo øverst, deretter familie / side.
 * Lyspæren henger på selve profilbildet og starter under det, også når
 * statusfeltet skyver logo-raden ned. Den tar ikke plass i flyten.
 * På Hjem (chromeOnly) er det samme hvite logo-feltet som på modulene —
 * meny, logo, varsler, profil. Logoen (og meny/faner) er veien hjem —
 * ingen egen «Hjem»-tilbakelenke. Lyspæren ligger også her, under profilen.
 * Når `hero` er satt (modulheading på telefon), er pastellbåndet selve
 * toppheadingen — rett under logo/meny, uten familienavn og uten stor
 * sidetittel. titleRight (blå «+ …») overlapper nedre høyre kant av båndet.
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
  viewAs = null,
  coverStatusBar = false,
}) {
  const nav = useNavigation();
  const { t } = useI18n();
  const colors = useColors();
  const { isPhone } = useLayout();
  const insets = useSafeAreaInsets();
  const statusPad = coverStatusBar
    ? statusBarCover(insets.top, { standalone: isStandaloneWeb(), phone: isPhone })
    : 0;
  const { activeProfile, family } = useApp();
  const { unreadTotal } = useUnread();
  const [menuOpen, setMenuOpen] = useState(false);

  const pageTitle = title;
  const logoTone = brandLogoToneForBackground(chromeOnly ? colors.card : colors.bg);
  const companyLabel = companyContextLabel(family);
  const familyName = companyLabel
    || (isPersonalShell(family)
      ? (family?.name || 'Mitt hjem')
      : (family?.name || 'ProTop'));
  // onBackHome kept as optional fallback for logo tap only (no visible Hjem link).
  const goHomeFromLogo = onLogoHome || onBackHome;

  const profileButton = (size) => (
    <View style={styles.avatarSlot}>
      <TouchableOpacity
        style={styles.avatarBtn}
        onPress={() => setMenuOpen(true)}
        accessibilityLabel="Profilmeny"
      >
        <AvatarBubble
          avatarId={activeProfile?.avatarId}
          photoURL={activeProfile?.photoURL}
          name={activeProfile?.name || '?'}
          size={size}
        />
      </TouchableOpacity>
      <View pointerEvents="box-none" style={styles.helpOnAvatar}>
        <HelpButton
          floating
          compact={size < 34}
          color={colors.ink}
          borderColor={colors.line}
        />
      </View>
    </View>
  );

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
            {viewAs}
            <TouchableOpacity
              style={[styles.iconBtn, styles.iconBtnCompact, { borderColor: colors.line }]}
              onPress={() => openNotifications(nav)}
              accessibilityLabel="Varslinger"
            >
              <IconBadge count={unreadTotal} size={16} offset={-4}>
                <Ionicons name="notifications-outline" size={18} color={colors.ink} />
              </IconBadge>
            </TouchableOpacity>
            {profileButton(28)}
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
          <View style={[styles.headerSide, styles.headerSideStart]}>
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
            <View style={styles.textColCompact}>
              <Text style={[styles.pageTitleCompact, { color: colors.ink }]} numberOfLines={1}>
                {pageTitle}
              </Text>
              <Text style={[styles.metaCompact, { color: colors.muted }]} numberOfLines={1}>
                {familyName}
              </Text>
            </View>
          </View>
          <View style={[styles.headerSide, styles.headerSideEnd]}>
            <View style={styles.actions}>
              {titleRight ? (
                <HelpTarget id="add" style={styles.titleRight}>{titleRight}</HelpTarget>
              ) : null}
              {viewAs}
              <TouchableOpacity
                style={[styles.iconBtn, styles.iconBtnCompact, { borderColor: colors.line }]}
                onPress={() => openNotifications(nav)}
                accessibilityLabel="Varslinger"
              >
                <IconBadge count={unreadTotal} size={16} offset={-4}>
                  <Ionicons name="notifications-outline" size={18} color={colors.ink} />
                </IconBadge>
              </TouchableOpacity>
              {profileButton(28)}
            </View>
          </View>
          <View pointerEvents="box-none" nativeID="platform-switch-lock" style={styles.switchLock}>
            <PlatformSwitch compact />
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
            statusPad > 0 && { paddingTop: 4 + statusPad },
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
              <BrandLogo variant="full" tone={logoTone} height={40} maxWidth={220} accessible={false} />
            </TouchableOpacity>
          </View>

          <View style={[styles.sideSlot, styles.sideSlotEnd]}>
            {viewAs}
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
            {profileButton(34)}
          </View>
        </View>

        <View style={styles.switchRow}>
          <PlatformSwitch compact />
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
                  {titleRight ? (
                    <View style={styles.titleRightCol}>
                      <HelpTarget id="add" style={styles.titleRight}>{titleRight}</HelpTarget>
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

/** Halv bredde av Privat/Bedrift, så tittel og sideknapper stopper før bryteren. */
const SWITCH_LOCK_GUTTER = 118;

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
    paddingTop: 4,
    paddingBottom: 2,
    borderBottomWidth: 1,
    gap: 2,
    flexGrow: 0,
    flexShrink: 0,
    overflow: 'visible',
  },
  barChromeOnly: {
    /* Same chrome sizing as full header; only title rows are omitted */
    gap: 0,
    paddingBottom: 2,
  },
  barHero: {
    gap: 0,
    paddingBottom: 0,
    overflow: 'visible',
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
    bottom: 8,
    zIndex: 2,
  },
  avatarSlot: {
    position: 'relative',
    overflow: 'visible',
  },
  /* Starts at the bottom edge of the profile photo, so status-bar padding cannot park it on the picture. */
  helpOnAvatar: {
    position: 'absolute',
    zIndex: 8,
    top: '100%',
    left: 0,
    right: 0,
    alignItems: 'center',
    marginTop: 6,
  },
  barTablet: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  barCompact: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    backgroundColor: '#fff',
    width: '100%',
    minHeight: 52,
    overflow: 'visible',
  },
  headerSide: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 1,
  },
  headerSideStart: {
    paddingRight: SWITCH_LOCK_GUTTER,
  },
  headerSideEnd: {
    justifyContent: 'flex-end',
    paddingLeft: SWITCH_LOCK_GUTTER,
  },
  barDense: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    backgroundColor: '#fff',
    minHeight: 48,
    overflow: 'visible',
  },
  chromeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    minHeight: 44,
    overflow: 'visible',
  },
  sideSlot: {
    zIndex: 4,
    minWidth: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    overflow: 'visible',
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
  textColCompact: { minWidth: 0, flexGrow: 1, flexShrink: 1 },
  switchLock: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  switchRow: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    paddingBottom: 8,
    minHeight: 52,
    width: '100%',
    zIndex: 3,
    overflow: 'visible',
  },
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
