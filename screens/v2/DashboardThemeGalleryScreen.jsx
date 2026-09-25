import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import WidgetBoard from '../../components/home/WidgetBoard';
import HomeBackdrop from '../../components/home/HomeBackdrop';
import HomeSetupForm, { toggleBottomId } from '../../components/home/HomeSetupForm';
import ParentHomeBottomNav from '../../components/parentHome/ParentHomeBottomNav';
import { emptyHomeLayout } from '../../src/utils/homeLayoutStore';
import { removeWidget, toggleWidgetType, widgetsForLook } from '../../src/homeWidgetCatalog';
import { cycleWidgetSpan, moveWidgetOnGrid } from '../../src/homeGrid';
import { CUSTOM_BANNER_ID, homeSceneTitle, homeSceneTagline, HOME_SCENE_SUBTITLE } from '../../src/homeBanners';
import { getParentDashboardTheme } from '../../src/parentDashboardThemes';
import { buildParentDashboardPreviewModel } from '../../src/utils/parentDashboardPreview';
import { homeFocusCopy } from '../../src/utils/deskHome';
import { HomeImmersiveProvider } from '../../src/context/HomeImmersiveContext';
import { soft } from '../../components/parentHome/softTheme';
import HomeModulesBoard from '../../components/home/HomeModulesBoard';
import { buildChildDashboardApps, buildParentDashboardApps } from '../../src/navigation/shellModules';
import { useI18n } from '../../src/i18n';
import { colors } from '../../src/theme';

/**
 * Public preview of the fixed home (no login).
 * Open via /dashboard-themes
 */
export default function DashboardThemeGalleryScreen() {
  const nav = useNavigation();
  const { t } = useI18n();
  const [role, setRole] = useState('parent');
  const [layout, setLayout] = useState(() => emptyHomeLayout('parent'));
  const [editing, setEditing] = useState(false);
  const [setupEdit, setSetupEdit] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const immersivePreview = true;

  const switchRole = (next) => {
    setRole(next);
    setEditing(false);
    setSetupEdit(false);
    setModulesOpen(false);
    setLayout(emptyHomeLayout(next));
  };

  const theme = getParentDashboardTheme('calm-day');
  const model = useMemo(() => {
    const base = buildParentDashboardPreviewModel(theme, {
      greeting: role === 'child' ? 'Hei, Noah' : 'God kveld, Geir',
      dayPart: 'evening',
      focusTomorrow: true,
    });
    if (role === 'child') {
      const openItems = [
        { id: 'c1', title: 'Leggetid 20:30', meta: 'I kveld', done: false },
        { id: 'c2', title: 'Inn/ut av oppvaskmaskinen', meta: 'I dag', done: false },
      ];
      const doneItems = [
        { id: 'c4', title: 'Pusse tenner', meta: 'Ferdig', done: true },
        { id: 'c5', title: 'Lage matpakke', meta: 'Ferdig', done: true },
      ];
      return {
        ...base,
        isPreview: true,
        greeting: 'Hei, Noah',
        dateLabel: 'Lørdag 19. september',
        focusLabel: 'Lørdag 19. september',
        focusTomorrow: true,
        focusCopy: homeFocusCopy(true),
        timeline: [
          { id: '1', time: '09:00', title: 'Fotballtrening', place: 'Banen', color: '#059669' },
          { id: '2', time: '14:00', title: 'Kino med bestemor', place: '', color: '#7c3aed' },
        ],
        apps: (base.dashboardApps || []).slice(0, 6),
        showChores: true,
        showCalendar: true,
        period: 'school',
        taskProgress: {
          done: doneItems.length,
          total: openItems.length + doneItems.length,
          open: openItems.length,
          items: [...openItems, ...doneItems],
          openItems,
          doneItems,
        },
        homeworkItems: [
          { id: 'h1', title: 'Matte – brøk', done: false },
          { id: 'h2', title: 'Lese 2 sider', done: true },
        ],
        weekProgram: {
          programTitle: 'I morgen',
          weekLabel: 'Uke 38',
          focusTomorrow: true,
          reason: 'weekend',
          weekDays: [
            { id: 'mon', label: 'Man', first: 'Norsk', count: 4, active: true },
            { id: 'tue', label: 'Tir', first: 'Matte', count: 5, active: false },
            { id: 'wed', label: 'Ons', first: 'Engelsk', count: 4, active: false },
            { id: 'thu', label: 'Tor', first: 'Gym', count: 5, active: false },
            { id: 'fri', label: 'Fre', first: 'Kunst', count: 3, active: false },
          ],
          lessons: [
            { id: 'l1', time: '08:15–09:00', title: 'Norsk', color: '#16a34a' },
            { id: 'l2', time: '09:15–10:00', title: 'Matematikk', color: '#2563eb' },
            { id: 'l3', time: '11:30–12:15', title: 'Kroppsøving', color: '#0d9488' },
          ],
        },
        rewardBalance: 42,
        unitLabel: 'poeng',
        rewardHint: '18 poeng igjen denne uken',
        weekGoals: [
          { id: 'g1', title: 'Pakke sekken selv', done: false },
          { id: 'g2', title: 'Lese hver dag', done: true },
        ],
      };
    }
    return base;
  }, [theme, role]);

  const catalogApps = useMemo(
    () => (role === 'child'
      ? buildChildDashboardApps({
        t,
        familyId: 'preview',
        child: { id: 'k1', name: 'Noah' },
        eventCount: 3,
        aiEnabled: true,
      })
      : buildParentDashboardApps({
        t,
        familyId: 'preview',
        eventCount: 3,
        hasKids: true,
        firstKid: { id: 'k1', name: 'Noah' },
      })),
    [t, role],
  );

  const handlers = {
    onOpenEvent: () => {},
    onOpenPlan: () => {},
    onOpenAssistant: () => {},
    onAppAction: (action) => {
      if (action?.type === 'tab' && action.tab === 'more' && !action.subView) {
        setModulesOpen(true);
      }
    },
    onOpenKid: () => {},
    onOpenTasks: () => {},
    onToggleTask: () => {},
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        scrollEnabled={!dragging}
      >
        <CompactBackLink label="Tilbake" onPress={() => nav.goBack()} />
        <Text style={styles.kicker}>Forhåndsvisning</Text>
        <Text style={styles.title}>Slik blir hjem</Text>
        <Text style={styles.lead}>
          Widgets på et 5-ruters rutenett. Tilpass hjem i korte steg — bilde, meny, deretter widgets direkte på hjem. Trykk blyanten, dra for å flytte, og åpne Widgets for alle moduler.
        </Text>

        <View style={styles.roleRow}>
          {['parent', 'child'].map((id) => {
            const on = role === id;
            return (
              <TouchableOpacity
                key={id}
                style={[styles.roleChip, on && styles.roleChipOn]}
                onPress={() => switchRole(id)}
                testID={`preview-role-${id}`}
              >
                <Text style={[styles.roleTxt, on && styles.roleTxtOn]}>
                  {id === 'parent' ? 'Voksen' : 'Barn'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[
          styles.phone,
          immersivePreview && styles.phoneImmersive,
          modulesOpen && styles.phoneBoard,
        ]} testID="home-preview-phone">
          {immersivePreview ? (
            <HomeBackdrop bannerId={layout.bannerId} customUri={layout.customBannerUri} />
          ) : null}
          <View style={[styles.chrome, immersivePreview && styles.chromeImmersive]}>
            <Text style={[styles.logo, immersivePreview && styles.logoImmersive]}>ProTop</Text>
          </View>
          <HomeImmersiveProvider value={immersivePreview}>
          <View style={[styles.phoneBody, modulesOpen && styles.phoneBodyBoard]}>
          {modulesOpen ? (
            <HomeModulesBoard
              apps={catalogApps}
              onPress={() => {}}
              onBack={() => setModulesOpen(false)}
              title={t('moreHub.modulesTitle')}
              subtitle={t('moreHub.modulesSub')}
              backLabel="Tilbake"
            />
          ) : (
          <WidgetBoard
            role={role}
            layout={layout}
            model={model}
            handlers={handlers}
            greeting={model.greeting}
            title={homeSceneTitle(model.dayPart || 'morning')}
            subtitle={immersivePreview ? homeSceneTagline(model.dayPart || 'evening') : HOME_SCENE_SUBTITLE}
            onOpenBannerSettings={() => {}}
            canEdit
            editing={editing}
            setupEditHint={setupEdit}
            onToggleEdit={() => {
              setEditing((v) => {
                if (v) setSetupEdit(false);
                return !v;
              });
            }}
            onAddWidget={(type) => setLayout((prev) => ({
              ...prev,
              widgets: toggleWidgetType(prev.widgets, type, role),
            }))}
            onRemoveWidget={(id) => setLayout((prev) => ({
              ...prev,
              widgets: removeWidget(prev.widgets, id),
            }))}
            onMoveWidget={(id, col, row) => setLayout((prev) => ({
              ...prev,
              widgets: moveWidgetOnGrid(prev.widgets, id, col, row),
            }))}
            onCycleSize={(id) => setLayout((prev) => ({
              ...prev,
              widgets: cycleWidgetSpan(prev.widgets, id),
            }))}
            onResetWidgets={() => setLayout((prev) => ({
              ...prev,
              widgets: widgetsForLook(prev.look, role),
            }))}
            onDraggingChange={setDragging}
          />
          )}
          </View>
          {layout.bottomNavEnabled !== false ? (
            <ParentHomeBottomNav
              ids={layout.bottomIds}
              appById={model.appById}
              activeId="home"
              onSelect={() => {}}
              includeSafeArea={false}
              glass={immersivePreview}
            />
          ) : null}
          </HomeImmersiveProvider>
        </View>

        <HomeSetupForm
          role={role}
          showIntro={false}
          bannerId={layout.bannerId}
          customBannerUri={layout.customBannerUri}
          bottomIds={layout.bottomIds}
          canEdit
          onSelectBanner={(id) => setLayout((prev) => ({ ...prev, bannerId: id, customBannerUri: null }))}
          onUploadBanner={(uri) => setLayout((prev) => ({
            ...prev,
            bannerId: CUSTOM_BANNER_ID,
            customBannerUri: uri,
          }))}
          onToggleBottom={(id) => setLayout((prev) => ({
            ...prev,
            bottomIds: toggleBottomId(prev.bottomIds, id),
          }))}
          bottomNavEnabled={layout.bottomNavEnabled}
          onToggleBottomNav={(enabled) => setLayout((prev) => ({
            ...prev,
            bottomNavEnabled: !!enabled,
          }))}
          onComplete={() => {
            setEditing(true);
            setSetupEdit(true);
          }}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48, maxWidth: 430, alignSelf: 'center', width: '100%' },
  kicker: { fontSize: 12, fontWeight: '400', color: colors.muted, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  title: { fontSize: 22, fontWeight: '400', color: colors.ink, marginTop: 4 },
  lead: { fontSize: 15, color: colors.muted, lineHeight: 22, marginTop: 8, marginBottom: 12 },
  roleRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  roleChip: {
    borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
  },
  roleChipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  roleTxt: { fontSize: 14, fontWeight: '400', color: colors.ink },
  roleTxtOn: { color: colors.brand },
  phone: {
    backgroundColor: soft.bg,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: soft.line,
    marginBottom: 24,
    position: 'relative',
  },
  phoneImmersive: { backgroundColor: 'transparent' },
  phoneBoard: { height: 740 },
  phoneBody: { paddingHorizontal: 14, paddingTop: 0, paddingBottom: 8, zIndex: 1, position: 'relative' },
  phoneBodyBoard: { flex: 1, minHeight: 0, paddingBottom: 0 },
  chrome: {
    paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: soft.line,
    backgroundColor: soft.card,
    zIndex: 1,
  },
  // Same white logo bar as on modules (meny / logo / varsler / profil).
  chromeImmersive: {
    backgroundColor: '#fff',
    borderBottomColor: soft.line,
  },
  logo: { fontSize: 18, color: soft.sage, fontFamily: soft.display },
  logoImmersive: { color: soft.ink },
});
