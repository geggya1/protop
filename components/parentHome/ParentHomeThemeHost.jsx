import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useUnread } from '../../src/context/NotificationContext';
import { useProfileNavigation } from '../../src/hooks/useProfileNavigation';
import { useApp } from '../../src/context/AppContext';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import { useOptionalRoute } from '../../src/hooks/useOptionalRoute';
import { colors, useLayout } from '../../src/theme';
import { soft } from './softTheme';
import { useParentHomeModel } from './useParentHomeModel';
import { usePullToRefresh, hardReloadApp } from '../../src/hooks/usePullToRefresh';
import { useHomeLayout } from '../../src/hooks/useHomeLayout';
import { homeSceneTitle, homeSceneTagline, HOME_SCENE_SUBTITLE } from '../../src/homeBanners';
import { useBottomChromeInset } from '../../src/utils/useBottomChromeInset';
import WidgetBoard from '../home/WidgetBoard';

/**
 * Fixed parent home — same tidy widget layout for every login.
 * Top logo bar (ShellHeader chromeOnly) matches modules — white with menu,
 * logo, notifications and profile. On phone, help sits beside the home pencil
 * in WidgetBoard. Bottom nav lives in AppShell.
 */
export default function ParentHomeThemeHost({
  familyEventsToday,
  familyEventsTomorrow,
  allMembers,
  dashboardApps,
  widgetData,
  onOpenEvent,
  onOpenPlan,
  onAppAction,
}) {
  const nav = useNavigation();
  const route = useOptionalRoute();
  const { uid } = useApp();
  const { unreadByModule } = useUnread();
  const { goChildProfile } = useProfileNavigation();
  const model = useParentHomeModel({
    familyEventsToday,
    familyEventsTomorrow,
    allMembers,
    dashboardApps,
    widgetData,
    unreadByModule,
  });
  const home = useHomeLayout(uid, { role: 'parent' });
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [setupEdit, setSetupEdit] = useState(false);

  // Tilpass hjem steg 3: land rett i redigeringsmodus.
  useEffect(() => {
    if (!route?.params?.editHome) return;
    setEditing(true);
    setSetupEdit(true);
    nav.setParams?.({ editHome: undefined });
  }, [route?.params?.editHome, nav]);

  const { refreshControl } = usePullToRefresh(async () => {
    if (hardReloadApp()) return;
    await Promise.all([model.refreshHome(), home.reload()]);
  });

  const handlers = {
    onOpenEvent,
    onOpenPlan,
    onOpenAssistant: () => nav.navigate('AiChat', { newChat: true }),
    onAppAction,
    onOpenKid: goChildProfile,
    onOpenTasks: () => {
      const app = model.appById?.stars;
      if (app) onAppAction?.(app.action);
    },
  };

  const { isPhone } = useLayout();
  const immersive = useHomeImmersive() && isPhone;
  const pageBg = immersive ? 'transparent' : soft.bg;
  const { contentPaddingBottom } = useBottomChromeInset();

  if (!model.themeReady || !home.ready) {
    return (
      <View style={[styles.loading, { backgroundColor: pageBg }]}>
        <ActivityIndicator color={colors.brand} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: pageBg }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { paddingBottom: contentPaddingBottom }]}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
        scrollEnabled={!dragging}
      >
        <WidgetBoard
          role="parent"
          layout={home.layout}
          model={model}
          handlers={handlers}
          greeting={model.greeting}
          title={homeSceneTitle(model.dayPart)}
          subtitle={immersive ? homeSceneTagline(model.dayPart) : HOME_SCENE_SUBTITLE}
          onOpenBannerSettings={() => nav.navigate('DashboardThemeSettings')}
          canEdit
          editing={editing}
          setupEditHint={setupEdit}
          onToggleEdit={() => {
            setEditing((v) => {
              if (v) setSetupEdit(false);
              return !v;
            });
          }}
          onAddWidget={home.toggleType}
          onRemoveWidget={home.remove}
          onMoveWidget={home.moveTo}
          onCycleSize={home.cycleSize}
          onResetWidgets={home.resetWidgets}
          onDraggingChange={setDragging}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: 'transparent' },
  scroll: { flex: 1, backgroundColor: 'transparent' },
  loading: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40,
    backgroundColor: 'transparent',
  },
  body: { paddingHorizontal: 10, paddingTop: 0, paddingBottom: 20, backgroundColor: 'transparent' },
});
