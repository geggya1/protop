import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HomeBanner from './HomeBanner';
import HomeHeroOverlay from './HomeHeroOverlay';
import { HomeWeekStrip, HomeFooterLine } from './PastelCards';
import WidgetGrid from './WidgetGrid';
import AddWidgetSheet from './AddWidgetSheet';
import { soft } from '../parentHome/softTheme';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import { useModuleHeroHosted } from '../ModulePageBg';
import { HOME_FOOTER_LINE } from '../../src/homeBanners';
import { immersiveGlass } from './homeGlass';
import { displayHomeWidgets } from '../../src/homeGrid';
import {
  FALLBACK_TIMELINE,
  FALLBACK_TASKS,
  FALLBACK_HOMEWORK,
  FALLBACK_SCHOOL,
  FALLBACK_SHOP,
  FALLBACK_EVENTS,
} from '../../src/utils/homeWidgetVisuals';

/** Item counts used to shrink list widgets to content (capped by saved gh). */
function contentFitCounts(model) {
  const demo = !!model?.isPreview;
  const timelineLive = (model?.timeline || []).length;
  const openN = model?.taskProgress?.openItems?.length || 0;
  const doneN = model?.taskProgress?.doneItems?.length || 0;
  const itemsN = (model?.taskProgress?.items || []).length;
  const tasksLive = Number(model?.taskProgress?.total) || (openN + doneN) || itemsN || 0;
  const homeworkLive = (model?.homeworkItems || []).length;
  const schoolLive = (model?.weekProgram?.lessons || []).length;
  const shopLive = (model?.shopItems || []).length
    || Number(model?.shopCount)
    || 0;
  const weekPlanLive = (model?.appointmentsPeek || []).length;
  const progressLive = (model?.kidProgress || model?.activeKids || []).length;

  return {
    timeline: timelineLive || (demo ? FALLBACK_TIMELINE.length : 0),
    tasks: tasksLive || (demo ? FALLBACK_TASKS.length : 0),
    homework: homeworkLive || (demo ? FALLBACK_HOMEWORK.length : 0),
    school: schoolLive || (demo ? FALLBACK_SCHOOL.length : 0),
    shopping: shopLive || (demo ? FALLBACK_SHOP.length : 0),
    weekPlan: weekPlanLive || (demo ? FALLBACK_EVENTS.length : 0),
    progress: progressLive || (demo ? 3 : 0),
    kids: (model?.activeKids || []).length || (demo ? 3 : 0),
  };
}

export default function WidgetBoard({
  role = 'parent',
  layout,
  model,
  handlers,
  greeting,
  title,
  subtitle,
  onOpenBannerSettings,
  canEdit = true,
  editing = false,
  setupEditHint = false,
  onToggleEdit,
  onAddWidget,
  onRemoveWidget,
  onMoveWidget,
  onCycleSize,
  onResetWidgets,
  onDraggingChange,
}) {
  const [addOpen, setAddOpen] = useState(false);
  const look = layout?.look || 'oversikt';
  const immersive = useHomeImmersive();
  const shellHeroHosted = useModuleHeroHosted();
  const fitCounts = useMemo(() => contentFitCounts(model), [model]);
  // Edit: saved sizes so ghost footprint matches collision.
  // View: may shrink content height, but never pack widgets upward.
  const gridWidgets = useMemo(
    () => displayHomeWidgets(layout?.widgets || [], fitCounts, { editing }),
    [layout?.widgets, fitCounts, editing],
  );

  const openCatalog = () => {
    if (!editing) onToggleEdit?.();
    setAddOpen(true);
  };

  const ink = immersive ? '#fff' : soft.sage;
  const inkOn = '#fff';

  return (
    <View style={styles.board} testID="home-widget-board">
      {immersive && !shellHeroHosted ? (
        <HomeHeroOverlay
          greeting={greeting}
          subtitle={subtitle}
          weather={model?.weather}
          onPress={onOpenBannerSettings}
        />
      ) : (!immersive ? (
        <HomeBanner
          bannerId={layout?.bannerId}
          customUri={layout?.customBannerUri}
          greeting={greeting}
          title={title}
          subtitle={subtitle}
          weather={model?.weather}
          onPressBanner={onOpenBannerSettings}
          onEdit={onOpenBannerSettings}
        />
      ) : null)}

      {immersive ? null : <HomeWeekStrip onPressDay={handlers?.onOpenPlan} />}

      {canEdit ? (
        <View style={styles.editRow}>
          <TouchableOpacity
            style={[
              styles.iconBtn,
              immersive && styles.iconBtnGlass,
              editing && styles.iconBtnOn,
            ]}
            onPress={onToggleEdit}
            accessibilityRole="button"
            accessibilityLabel={editing ? 'Ferdig med å redigere hjemskjerm' : 'Rediger hjemskjerm'}
            testID="home-edit-toggle"
          >
            <Ionicons
              name={editing ? 'checkmark' : 'pencil'}
              size={18}
              color={editing ? inkOn : ink}
            />
          </TouchableOpacity>
          {editing ? (
            <>
              <TouchableOpacity
                style={[styles.iconBtn, immersive && styles.iconBtnGlass]}
                onPress={openCatalog}
                accessibilityRole="button"
                accessibilityLabel="Velg widgets"
                testID="home-add-widget"
              >
                <Ionicons name="apps-outline" size={18} color={ink} />
              </TouchableOpacity>
              {onResetWidgets ? (
                <TouchableOpacity
                  style={[styles.iconBtn, immersive && styles.iconBtnGlass]}
                  onPress={onResetWidgets}
                  accessibilityRole="button"
                  accessibilityLabel="Tilbakestill til mal"
                  testID="home-reset-grid"
                >
                  <Ionicons name="refresh-outline" size={17} color={ink} />
                </TouchableOpacity>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}

      {editing ? (
        <Text style={[styles.editHint, immersive && styles.editHintGlass]} testID="home-edit-hint">
          {setupEditHint
            ? 'Standard widgets er på. Endre her, eller trykk ✓ for å hoppe over og fullføre.'
            : 'Dra for å flytte. Trykk × for å fjerne, eller størrelse-merket for 5×1 / 5×2.'}
        </Text>
      ) : null}

      <WidgetGrid
        role={role}
        widgets={gridWidgets}
        model={model}
        handlers={handlers}
        canEdit={canEdit}
        editing={editing}
        onDraggingChange={onDraggingChange}
        onMove={onMoveWidget}
        onRemove={onRemoveWidget}
        onCycleSize={onCycleSize}
      />

      {look === 'oversikt' && !editing ? (
        <HomeFooterLine text={immersive ? HOME_FOOTER_LINE : undefined} light={immersive} />
      ) : null}

      <AddWidgetSheet
        visible={addOpen}
        role={role}
        widgets={layout?.widgets || []}
        onClose={() => setAddOpen(false)}
        onPick={(type) => {
          onAddWidget?.(type);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  board: { paddingBottom: 8, backgroundColor: 'transparent' },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 4,
    marginBottom: 2,
    minHeight: 36,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: soft.cream,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: soft.line,
  },
  iconBtnGlass: {
    ...immersiveGlass,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  iconBtnOn: {
    backgroundColor: soft.sage,
    borderColor: soft.sage,
  },
  editHint: { fontSize: 11, color: soft.muted, fontFamily: soft.body, marginBottom: 2, lineHeight: 15 },
  editHintGlass: {
    color: 'rgba(255,255,255,0.92)',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
