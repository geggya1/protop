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
import { HomeImmersiveProvider } from '../../src/context/HomeImmersiveContext';
import HomeModulesBoard from '../../components/home/HomeModulesBoard';
import { buildParentDashboardApps } from '../../src/navigation/shellModules';
import { previewCompany, previewDay } from '../../src/utils/proHomePreview';
import { DEFAULT_GLASS_TINT, glassTintForBanner } from '../../src/homeBannerTints';
import { hasHomePhoto } from '../../src/homeSurface';
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

  // Som i appen: bildeflate og glass bare når Hjem har bakgrunnsbilde.
  const photo = immersivePreview && (hasHomePhoto(layout.bannerId) || !!layout.customBannerUri);
  // Samme glass som i appen: mørkt glass i bildets egen farge når Hjem har bilde.
  const glassTint = layout.customBannerUri ? DEFAULT_GLASS_TINT : glassTintForBanner(layout.bannerId);
  const theme = getParentDashboardTheme('calm-day');
  // ProTop: Privat og Bedrift, med en vanlig arbeidsdag som eksempel (ingen familie).
  const model = useMemo(() => {
    const now = new Date();
    const base = buildParentDashboardPreviewModel(theme, {
      greeting: 'Hei, Geir',
      dayPart: 'morning',
      focusTomorrow: false,
    });
    const day = previewDay(now);
    if (role === 'company') {
      return {
        ...base,
        ...day,
        greeting: 'Hei, Geir',
        board: 'company',
        companyId: '',
        isoActive: true,
        mileageActive: true,
        anbudActive: true,
        absenceActive: true,
        preview: previewCompany(now),
      };
    }
    return {
      ...base,
      ...day,
      greeting: 'Hei, Geir',
      board: 'private',
      companyId: '',
      preview: { mileage: previewCompany(now).mileage },
      mileageCompanyName: 'Byggmester AS',
    };
  }, [theme, role]);

  const catalogApps = useMemo(
    () => buildParentDashboardApps({
      t,
      familyId: 'preview',
      eventCount: 3,
      hasKids: false,
      firstKid: null,
    }),
    [t],
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
          Widgets på et 5-ruters rutenett. Privat er din egen arbeidsdag, Bedrift er firmaets skjerm. Trykk blyanten, dra for å flytte, og legg til eller fjern widgets. Bakgrunnsbilde velger du selv under Tilpass hjem.
        </Text>

        <View style={styles.roleRow}>
          {['parent', 'company'].map((id) => {
            const on = role === id;
            return (
              <TouchableOpacity
                key={id}
                style={[styles.roleChip, on && styles.roleChipOn]}
                onPress={() => switchRole(id)}
                testID={`preview-role-${id}`}
              >
                <Text style={[styles.roleTxt, on && styles.roleTxtOn]}>
                  {id === 'parent' ? 'Privat' : 'Bedrift'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={[
          styles.phone,
          photo && styles.phoneImmersive,
          modulesOpen && styles.phoneBoard,
        ]} testID="home-preview-phone">
          {photo ? (
            <HomeBackdrop bannerId={layout.bannerId} customUri={layout.customBannerUri} />
          ) : null}
          <View style={[styles.chrome, photo && styles.chromeImmersive]}>
            <Text style={[styles.logo, photo && styles.logoImmersive]}>ProTop</Text>
          </View>
          <HomeImmersiveProvider value={photo} tint={glassTint}>
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
            subtitle={photo ? homeSceneTagline(model.dayPart || 'evening') : HOME_SCENE_SUBTITLE}
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
              glass={photo}
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
    backgroundColor: colors.bg,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 24,
    position: 'relative',
  },
  phoneImmersive: { backgroundColor: 'transparent' },
  phoneBoard: { height: 740 },
  phoneBody: { paddingHorizontal: 14, paddingTop: 0, paddingBottom: 8, zIndex: 1, position: 'relative' },
  phoneBodyBoard: { flex: 1, minHeight: 0, paddingBottom: 0 },
  chrome: {
    paddingVertical: 12, alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
    backgroundColor: colors.card,
    zIndex: 1,
  },
  // Same white logo bar as on modules (meny / logo / varsler / profil).
  chromeImmersive: {
    backgroundColor: colors.card,
    borderBottomColor: colors.line,
  },
  logo: { fontSize: 18, color: colors.brandInk, fontWeight: '600' },
  logoImmersive: { color: colors.ink },
});
