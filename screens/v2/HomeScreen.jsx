import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useBreakpoints } from '../../src/theme';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import { dateKey, addDays } from '../../src/utils/dates';
import { eventOccursOnDate } from '../../src/utils/events';
import {
  listenEventsAcrossPlatforms,
  platformIdsFromFamilies,
} from '../../src/utils/crossPlatformData';
import { resolveEventWriteTarget } from '../../src/utils/eventWriteTarget';
import { Screen, Loader } from '../../components/ui';
import CreateShortcutSheet from '../../components/CreateShortcutSheet';
import DeskHomeDashboard from '../../components/DeskHomeDashboard';
import ParentHomeThemeHost from '../../components/parentHome/ParentHomeThemeHost';
import PendingFamilyInvitePrompt from '../../components/PendingFamilyInvitePrompt';
import { buildParentDashboardApps } from '../../src/navigation/shellModules';
import { openNotifications } from '../../src/navigation/openNotifications';
import { useHomeWidgetData } from '../../src/hooks/useHomeWidgetData';
import { useI18n } from '../../src/i18n';
import { toggleParentTodo } from '../../src/utils/todos';

// Barnas hjem hørte til familieproduktet (barnekontoer logges ut i ProTop).
export default function HomeScreen() {
  return <ParentHomeScreen />;
}

function ParentHomeScreen() {
  const nav = useNavigation();
  const { t } = useI18n();
  const { isDesktop } = useBreakpoints();
  const immersive = useHomeImmersive();
  const {
    familyId, families, kids, members, parents, isParent, uid,
    requestShellTab,
  } = useApp();
  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);
  const tomorrow = useMemo(() => addDays(today, 1), [today]);

  const [events, setEvents] = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const viewerIds = useMemo(() => new Set([uid].filter(Boolean)), [uid]);
  const platformIds = useMemo(() => {
    const ids = platformIdsFromFamilies(families);
    if (familyId && !ids.includes(familyId)) ids.push(familyId);
    return ids;
  }, [families, familyId]);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenEventsAcrossPlatforms({
      platformIds,
      activePlatformId: familyId,
      viewerIds,
      platforms: families,
      onChange: setEvents,
    });
  }, [familyId, platformIds, viewerIds, families]);

  const familyEventsToday = useMemo(
    () => events
      .filter((e) => eventOccursOnDate(e, today))
      .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || ''))),
    [events, todayKey],
  );

  const familyEventsTomorrow = useMemo(
    () => events
      .filter((e) => eventOccursOnDate(e, tomorrow))
      .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || ''))),
    [events, tomorrow],
  );

  // Avtaler per dag denne uken (widgeten «Uken»), fra samme lytter som kalenderen.
  const weekCounts = useMemo(() => {
    const monday = addDays(today, -((today.getDay() + 6) % 7));
    const out = {};
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(monday, i);
      out[dateKey(day)] = events.filter((e) => eventOccursOnDate(e, day)).length;
    }
    return out;
  }, [events, today]);

  const widgetData = useHomeWidgetData({
    todayEvents: familyEventsToday,
    tomorrowEvents: familyEventsTomorrow,
    enabled: true,
  });

  const allMembers = useMemo(() => {
    if (members?.length) return members;
    return [
      ...(parents || []).map((p) => ({ ...p, uid: p.uid })),
      ...(kids || []).map((k) => ({ ...k, uid: k.uid || k.id || k.childId })),
    ];
  }, [members, parents, kids]);

  const activeKids = useMemo(
    () => kids.filter((k) => k.active !== false),
    [kids],
  );

  const dashboardApps = useMemo(
    () => buildParentDashboardApps({
      t,
      familyId,
      eventCount: familyEventsToday.length,
      hasKids: activeKids.length > 0,
      firstKid: activeKids[0] || null,
    }),
    [t, familyId, familyEventsToday.length, activeKids],
  );

  const runAppAction = (action) => {
    if (!action) return;
    if (action.type === 'tab') {
      if (action.mode) requestShellTab(action.tab, action.subView || null, action.mode);
      else requestShellTab(action.tab, action.subView || null);
      return;
    }
    if (action.type === 'nav') {
      // Skjemaene trenger arbeidsområdet (og dagen for nye avtaler).
      if (action.screen === 'EventForm') {
        nav.navigate('EventForm', { familyId, dateKey: todayKey, ...(action.params || {}) });
        return;
      }
      if (action.screen === 'ParentTask') {
        nav.navigate('ParentTask', { familyId, ...(action.params || {}) });
        return;
      }
      nav.navigate(action.screen, action.params);
    }
  };

  const openEvent = (ev) => {
    const canOpen = !ev.readOnly && (
      isParent || (uid && ev.createdBy === uid)
    );
    if (canOpen) {
      const { familyId: targetFamilyId, eventId } = resolveEventWriteTarget(ev, familyId);
      nav.navigate('EventForm', {
        familyId: targetFamilyId || familyId,
        event: {
          ...ev,
          id: eventId || ev.sourceEventId || ev.id,
          sourceEventId: eventId || ev.sourceEventId || ev.id,
          familyId: targetFamilyId || ev.familyId || familyId,
        },
      });
    } else if (!isParent) {
      requestShellTab('plan');
    }
  };

  const createOptions = useMemo(() => {
    const opts = [
      {
        id: 'event',
        icon: 'calendar',
        label: 'Ny kalenderføring',
        sub: 'Åpner skjema for ny hendelse',
        onPress: () => nav.navigate('EventForm', { familyId, dateKey: todayKey }),
      },
      {
        id: 'task',
        icon: 'checkbox',
        label: 'Ny oppgave',
        sub: 'Oppgave for deg eller kolleger',
        onPress: () => nav.navigate('ParentTask', { familyId }),
      },
      {
        id: 'chat',
        icon: 'chatbubbles',
        label: 'Ny chat',
        sub: 'Velg mottaker',
        onPress: () => requestShellTab('chat', null, 'create'),
      },
      {
        id: 'ai',
        icon: 'sparkles',
        label: 'Chat med AI',
        sub: 'Start en ny AI-samtale',
        onPress: () => nav.navigate('AiChat', { newChat: true }),
      },
      {
        id: 'note',
        icon: 'document-text',
        label: 'Nytt notat',
        sub: 'Skriv eller ta opp med AI',
        onPress: () => requestShellTab('notes', null, 'create'),
      },
    ];

    return opts;
  }, [familyId, todayKey, nav, requestShellTab]);

  if (!familyId) {
    return (
      <Screen>
        <PendingFamilyInvitePrompt />
        <Loader />
      </Screen>
    );
  }

  if (isDesktop) {
    return (
      <Screen>
        <PendingFamilyInvitePrompt />
        <DeskHomeDashboard
          widgetData={widgetData}
          familyEventsToday={familyEventsToday}
          familyEventsTomorrow={familyEventsTomorrow}
          onOpenEvent={openEvent}
          onCreate={() => setCreateOpen(true)}
          onTab={(tab, subView) => requestShellTab(tab, subView || null)}
          onNotify={() => openNotifications(nav)}
          onUpgrade={() => requestShellTab('more', 'subscription')}
          onToggleTask={async (task) => {
            try { await toggleParentTodo(familyId, task, today); } catch { /* ignore */ }
          }}
        />
        {isParent ? (
          <CreateShortcutSheet
            visible={createOpen}
            onClose={() => setCreateOpen(false)}
            options={createOptions}
          />
        ) : null}
      </Screen>
    );
  }

  return (
    <Screen style={[styles.mobileScreen, immersive && styles.mobileScreenImmersive]}>
      <PendingFamilyInvitePrompt />
      <ParentHomeThemeHost
        familyEventsToday={familyEventsToday}
        familyEventsTomorrow={familyEventsTomorrow}
        allMembers={allMembers}
        dashboardApps={dashboardApps}
        widgetData={widgetData}
        weekCounts={weekCounts}
        onOpenEvent={openEvent}
        onOpenPlan={() => requestShellTab('plan')}
        onAppAction={runAppAction}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  mobileScreen: { padding: 0 },
  mobileScreenImmersive: { backgroundColor: 'transparent' },
});
