import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors, radius, useLayout } from '../../src/theme';
import { Screen, ScrollBody } from '../../components/ui';
import ChildProfileHeader from '../../components/ChildProfileHeader';
import BookshelfScreen from './BookshelfScreen';
import ShoppingListHubScreen from './ShoppingListHubScreen';
import WishlistsHubScreen from './WishlistsHubScreen';
import LekserHubScreen from './LekserHubScreen';
import ChatListScreen from './ChatListScreen';
import SettingsScreen from './SettingsScreen';
import DashboardThemeSettingsScreen from './DashboardThemeSettingsScreen';
import ChildAppsScreen from './ChildAppsScreen';
import PlanScreen from './PlanScreen';
import ActivitiesScreen from '../ActivitiesScreen';
import GroupHubScreen from '../GroupHubScreen';
import FriendsHubScreen from './FriendsHubScreen';
import LocationHubScreen from './LocationHubScreen';
import DocumentsHubScreen from './DocumentsHubScreen';
import VoiceNotesHubScreen from './VoiceNotesHubScreen';
import AiChatScreen from './AiChatScreen';
import MealsHubScreen from './MealsHubScreen';
import RecipesHubScreen from './RecipesHubScreen';
import PantryHubScreen from './PantryHubScreen';
import MatcoachHubScreen from './MatcoachHubScreen';
import AlbumsHubScreen from './AlbumsHubScreen';
import HoldingsHubScreen from './HoldingsHubScreen';
import BoligmappaHubScreen from './BoligmappaHubScreen';
import FamilyWallHubScreen from './FamilyWallHubScreen';
import ChildDrawingsHubScreen from './ChildDrawingsHubScreen';
import FamilyProgressScreen from './FamilyProgressScreen';
import FamilyQuizScreen from './FamilyQuizScreen';
import FamilyGamesScreen from './FamilyGamesScreen';
import ScratchMapHubScreen from './ScratchMapHubScreen';
import ReiseplanleggerHubScreen from './ReiseplanleggerHubScreen';
import FamilyTreeHubScreen from './FamilyTreeHubScreen';
import RememberDatesHubScreen from './RememberDatesHubScreen';
import HospitalityHubScreen from './HospitalityHubScreen';
import KlassenHubScreen from './KlassenHubScreen';
import MailHubScreen from './MailHubScreen';
import PrivacyTermsScreen from './PrivacyTermsScreen';
import SubscriptionScreen from './SubscriptionScreen';
import ModuleAccessSettingsScreen from './ModuleAccessSettingsScreen';
import HelpSupportScreen from './HelpSupportScreen';
import {
  GroupSettingsScreen,
} from '../settings/GroupSettingsScreen';
import { useAiPlanImport } from '../../src/hooks/useAiPlanImport';
import AiImportChildPicker from '../../components/AiImportChildPicker';
import { buildChildDashboardApps, buildParentDashboardApps, buildShellModules } from '../../src/navigation/shellModules';
import HomeModulesBoard from '../../components/home/HomeModulesBoard';
import { moreSubviewTitle } from '../../src/navigation/shellHeaderTitle';
import IconBadge from '../../components/IconBadge';
import { useUnread } from '../../src/context/NotificationContext';
import { countForItem } from '../../src/utils/notifications';
import { allowedAppsForChild, isChildAppAllowed } from '../../src/utils/childApps';
import { grandparentModulesFor, isGrandparentAppAllowed } from '../../src/utils/grandparentAccess';
import HelpTarget from '../../components/HelpTarget';

function Row({ icon, label, onPress, highlight, badgeCount = 0, compact = false, showChevron = true, moduleId }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.row,
        compact && styles.rowCompact,
        highlight && styles.rowHighlight,
      ]}
      accessibilityRole="button"
      nativeID={moduleId ? `module-nav-${moduleId}` : undefined}
    >
      <View style={[
        styles.iconCircle,
        compact && styles.iconCircleCompact,
        highlight && styles.iconCircleHighlight,
      ]}
      >
        <IconBadge count={badgeCount} size={compact ? 13 : 15} offset={compact ? -4 : -5} borderColor={highlight ? colors.brand : '#fff'}>
          <Ionicons name={icon} size={compact ? 15 : 20} color={highlight ? '#fff' : colors.brand} />
        </IconBadge>
      </View>
      <Text style={[styles.label, compact && styles.labelCompact, highlight && styles.labelHighlight]} numberOfLines={1}>
        {label}
      </Text>
      {showChevron ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={highlight ? 'rgba(255,255,255,0.8)' : colors.muted}
        />
      ) : null}
    </TouchableOpacity>
  );
}

const SUB_SCREENS = {
  shop: ShoppingListHubScreen,
  wishes: WishlistsHubScreen,
  books: BookshelfScreen,
  lekser: LekserHubScreen,
  chat: ChatListScreen,
  settings: SettingsScreen,
  dashboardSetup: DashboardThemeSettingsScreen,
  childApps: ChildAppsScreen,
  plan: PlanScreen,
  activities: ActivitiesScreen,
  members: GroupHubScreen,
  friends: FriendsHubScreen,
  groupSettings: GroupSettingsScreen,
  location: LocationHubScreen,
  documents: DocumentsHubScreen,
  voiceNotes: VoiceNotesHubScreen,
  ai: AiChatScreen,
  meals: MealsHubScreen,
  recipes: RecipesHubScreen,
  pantry: PantryHubScreen,
  matcoach: MatcoachHubScreen,
  albums: AlbumsHubScreen,
  holdings: HoldingsHubScreen,
  boligmappa: BoligmappaHubScreen,
  wall: FamilyWallHubScreen,
  childDrawings: ChildDrawingsHubScreen,
  progress: FamilyProgressScreen,
  games: FamilyGamesScreen,
  quiz: FamilyQuizScreen,
  scratchMap: ScratchMapHubScreen,
  reiseplanlegger: ReiseplanleggerHubScreen,
  familyTree: FamilyTreeHubScreen,
  rememberDates: RememberDatesHubScreen,
  hospitality: HospitalityHubScreen,
  klassen: KlassenHubScreen,
  mail: MailHubScreen,
  legal: PrivacyTermsScreen,
  subscription: SubscriptionScreen,
  moduleAccess: ModuleAccessSettingsScreen,
  help: HelpSupportScreen,
};

export default function MoreHubScreen({ subView, setSubView }) {
  const nav = useNavigation();
  const { t } = useI18n();
  const { pad, isDesktop, isTablet, hasRail, isPhone } = useLayout();
  const {
    isParent, isChild, family, familyId, meChild, meParent, kids,
    isActingAsChild, activeChild, isAdmin, isSuperAdmin, isGrandparent, requestShellTab,
  } = useApp();
  const multiCol = hasRail && !isDesktop;
  const colWidth = isDesktop ? '100%' : isTablet ? '48.5%' : '100%';
  const [query, setQuery] = useState('');
  const searchRef = useRef(null);

  const {
    startImport, canImport, activeKids: importKids,
    childPickerOpen, selectChild, closePicker,
  } = useAiPlanImport();

  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false),
    [kids],
  );

  const asChild = isChild || isActingAsChild;
  const asParent = isParent && !isActingAsChild;
  const { unreadByModule } = useUnread();
  const profileChild = isChild ? meChild : (isActingAsChild ? activeChild : null);
  const childForSchedule = profileChild;
  const allowedApps = asChild ? allowedAppsForChild(profileChild) : null;
  const grandparentModules = isGrandparent ? grandparentModulesFor(meParent) : null;
  const aiEnabled = asChild ? isChildAppAllowed(allowedApps, 'ai') : true;
  const showChildRestrictions = isActingAsChild && !!childForSchedule;

  const dashboardApps = useMemo(
    () => (asChild
      ? buildChildDashboardApps({
        t,
        familyId,
        child: profileChild,
        aiEnabled,
        allowedApps,
        canEdit: isParent && !isChild,
      })
      : buildParentDashboardApps({
        t,
        familyId,
        eventCount: 0,
        hasKids: activeKids.length > 0,
        firstKid: activeKids[0] || null,
      })),
    [asChild, t, familyId, profileChild, aiEnabled, allowedApps, isParent, isChild, activeKids],
  );

  const sections = useMemo(
    () => buildShellModules({
      t,
      asChild,
      asParent,
      isAdmin,
      isSuperAdmin,
      familyId,
      family,
      canImport: asParent && canImport,
      hasKids: activeKids.length > 0,
      childForSchedule,
      aiEnabled,
      allowedApps,
      showChildRestrictions,
      firstKid: activeKids[0] || null,
      isGrandparent,
      grandparentModules,
    }),
    [
      t, asChild, asParent, isAdmin, isSuperAdmin, familyId, family,
      canImport, activeKids, childForSchedule, aiEnabled,
      allowedApps, showChildRestrictions, isGrandparent, grandparentModules,
    ],
  );

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          const label = String(item.label || '').toLowerCase();
          const id = String(item.id || '').toLowerCase();
          return label.includes(q) || id.includes(q)
            || (q.includes('skrape') && id === 'scratchmap')
            || (q.includes('reise') && id === 'scratchmap')
            || (q.includes('kart') && id === 'scratchmap')
            || (q.includes('besøk') && id === 'scratchmap')
            || (q.includes('slekt') && id === 'familytree')
            || (q.includes('tre') && id === 'familytree')
            || (q.includes('familietre') && id === 'familytree');
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [sections, query]);

  useEffect(() => {
    if (!isDesktop || Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const focusSearch = () => {
      requestAnimationFrame(() => searchRef.current?.focus?.());
    };
    window.addEventListener('weekplan:focus-tools-search', focusSearch);
    return () => window.removeEventListener('weekplan:focus-tools-search', focusSearch);
  }, [isDesktop]);

  const runAction = (action, appId) => {
    if (!action) return;
    if (asChild && appId && appId !== 'restrictions' && !isChildAppAllowed(allowedApps, appId)) {
      return;
    }
    if (isGrandparent && appId && !isGrandparentAppAllowed(grandparentModules, appId)) {
      return;
    }
    if (action.type === 'fn' && action.id === 'aiImport') {
      startImport();
      return;
    }
    if (action.type === 'tab') {
      if (action.tab === 'more' && action.subView) {
        setSubView(action.subView);
        return;
      }
      requestShellTab(action.tab, action.subView || null);
      return;
    }
    if (action.type === 'nav') {
      nav.navigate(action.screen, action.params);
    }
  };

  const openFirstMatch = () => {
    const first = filteredSections[0]?.items?.[0];
    if (first) runAction(first.action, first.id);
  };

  if (subView && asChild && !isChildAppAllowed(allowedApps, subView)) {
    return (
      <Screen>
        <View style={styles.denied}>
          <Ionicons name="lock-closed-outline" size={32} color={colors.muted} />
          <Text style={styles.deniedTitle}>{t('moreHub.appDisabledTitle')}</Text>
          <Text style={styles.deniedSub}>
            {t('moreHub.appDisabledBody')}
          </Text>
        </View>
      </Screen>
    );
  }

  if (subView && SUB_SCREENS[subView]) {
    const Sub = SUB_SCREENS[subView];
    const subTitle = moreSubviewTitle(subView, t);
    const firstName = profileChild?.name?.split(' ')[0] || t('settings.child');
    // On tablet/web the shell top bar already shows the module title; skip the
    // duplicate ChildProfileHeader row (avatar + bold title + «Kun familien.»).
    const hasProfile = !!profileChild;
    const showProfileHeader = hasProfile && isPhone;

    return (
      <View style={styles.subWrap}>
        {showProfileHeader ? (
          <ChildProfileHeader
            child={profileChild}
            kids={activeKids}
            heading={isChild ? subTitle : `${firstName} · ${subTitle}`}
            sub={isChild ? t('moreHub.familyOnly') : t('moreHub.viewingProfile', { name: firstName })}
            showSwitcher={false}
            onSelectChild={() => {}}
            showBack={false}
            compact
          />
        ) : null}
        <View style={styles.subBody}>
          <Sub
            compactHeader={hasProfile}
            profileUid={profileChild?.uid || null}
            profileChildId={profileChild?.id || profileChild?.childId || null}
            inShell
            onBack={() => setSubView(null)}
            setSubView={setSubView}
          />
        </View>
      </View>
    );
  }

  if ((asParent || asChild) && isPhone && !subView) {
    return (
      <Screen>
        <HomeModulesBoard
          apps={dashboardApps}
          unreadByModule={unreadByModule}
          onPress={(app) => runAction(app.action, app.id)}
          title={t('moreHub.modulesTitle')}
          subtitle={t('moreHub.modulesSub')}
        />
        <AiImportChildPicker
          visible={childPickerOpen}
          kids={importKids}
          onSelect={selectChild}
          onClose={closePicker}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollBody pad={pad}>
        {isDesktop ? (
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={colors.muted} />
            <TextInput
              ref={searchRef}
              value={query}
              onChangeText={setQuery}
              placeholder={t('moreHub.searchTools')}
              placeholderTextColor={colors.muted}
              style={[styles.searchInput, Platform.OS === 'web' && { outlineStyle: 'none' }]}
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
              onSubmitEditing={openFirstMatch}
              accessibilityLabel={t('moreHub.searchTools')}
            />
            {query ? (
              <TouchableOpacity onPress={() => setQuery('')} accessibilityRole="button" accessibilityLabel={t('moreHub.clearSearch')}>
                <Ionicons name="close-circle" size={16} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : (
          <Text style={styles.intro}>
            {asChild
              ? t('moreHub.childAppsIntro')
              : hasRail
                ? t('moreHub.railIntro')
                : t('moreHub.phoneIntro')}
          </Text>
        )}
        <View style={isDesktop ? styles.deskSections : null}>
          {filteredSections.map((section, sectionIndex) => (
            <View key={section.id} style={isDesktop ? styles.deskPanel : null}>
              <Text style={[styles.section, isDesktop && styles.sectionDesktop]}>{section.title}</Text>
              <View style={multiCol ? styles.grid : (isDesktop ? styles.deskList : null)}>
                {section.items.map((item, itemIndex) => {
                  const row = (
                    <Row
                      icon={item.icon}
                      label={item.label}
                      highlight={!!item.highlight}
                      badgeCount={countForItem(unreadByModule, item)}
                      compact={isDesktop}
                      showChevron={!isDesktop}
                      moduleId={item.id}
                      onPress={() => runAction(item.action, item.id)}
                    />
                  );
                  const spot = sectionIndex === 0 && itemIndex === 0;
                  return (
                    <View key={item.id} style={multiCol ? { width: colWidth } : null}>
                      {spot ? <HelpTarget id="content" style={{ width: '100%' }}>{row}</HelpTarget> : row}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </View>
        {isDesktop && filteredSections.length === 0 ? (
          <Text style={styles.emptySearch}>Ingen treff for «{query.trim()}».</Text>
        ) : null}
        <View style={{ height: 24 }} />
      </ScrollBody>
      <AiImportChildPicker
        visible={childPickerOpen}
        kids={importKids}
        onSelect={selectChild}
        onClose={closePicker}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  subWrap: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' },
  subBody: { flex: 1, minHeight: 0, minWidth: 0, overflow: 'hidden' },
  denied: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: 32, gap: 8,
  },
  deniedTitle: { fontWeight: '700', fontSize: 18, color: colors.ink },
  deniedSub: {
    textAlign: 'center', color: colors.muted, lineHeight: 20, maxWidth: 280,
  },
  intro: {
    color: colors.muted, fontWeight: '600', fontSize: 13, lineHeight: 18,
    marginBottom: 4, marginTop: 4,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 10,
    minHeight: 34,
    marginBottom: 4,
    maxWidth: 440,
  },
  searchInput: {
    flex: 1,
    fontWeight: '400',
    color: colors.ink,
    paddingVertical: 6,
    fontSize: 13,
  },
  emptySearch: {
    color: colors.muted, fontWeight: '400', fontSize: 13, marginTop: 12,
  },
  section: {
    fontSize: 14, fontWeight: '800', color: colors.ink,
    marginTop: 18, marginBottom: 8, marginLeft: 4,
  },
  sectionDesktop: {
    marginTop: 0,
    marginBottom: 6,
    marginLeft: 2,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'none',
    color: colors.ink,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  deskSections: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 8,
  },
  deskPanel: {
    flexGrow: 1,
    flexBasis: 260,
    maxWidth: 400,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 7,
    padding: 8,
  },
  deskList: {
    gap: 1,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.card,
    borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.line, minHeight: 58,
    marginBottom: 8,
  },
  rowCompact: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 5,
    paddingVertical: 6,
    paddingHorizontal: 6,
    minHeight: 32,
    marginBottom: 0,
  },
  rowHighlight: {
    backgroundColor: colors.brand, borderColor: colors.brand,
  },
  iconCircle: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center',
    overflow: 'visible',
  },
  iconCircleCompact: {
    width: 24, height: 24, borderRadius: 5,
  },
  iconCircleHighlight: { backgroundColor: 'rgba(255,255,255,0.2)' },
  label: { flex: 1, fontWeight: '800', fontSize: 16, color: colors.ink },
  labelCompact: { fontWeight: '500', fontSize: 13 },
  labelHighlight: { color: '#fff' },
});
