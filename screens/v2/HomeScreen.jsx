import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useLayout } from '../../src/theme';
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
import ChildHomeScreen from './ChildHomeScreen';
import DeskHomeDashboard from '../../components/DeskHomeDashboard';
import KitchenWallDashboard from '../../components/KitchenWallDashboard';
import KitchenPinModal from '../../components/KitchenPinModal';
import ParentHomeThemeHost from '../../components/parentHome/ParentHomeThemeHost';
import PendingFamilyInvitePrompt from '../../components/PendingFamilyInvitePrompt';
import { buildParentDashboardApps } from '../../src/navigation/shellModules';
import { useHomeWidgetData } from '../../src/hooks/useHomeWidgetData';
import { useI18n } from '../../src/i18n';
import { BOOK_OWNER } from '../../src/utils/books';
import { toggleParentTodo } from '../../src/utils/todos';
import {
  loadKitchenDisplaySettings,
  saveKitchenDisplaySettings,
  subscribeKitchenDisplay,
  verifyKitchenPin,
} from '../../src/utils/kitchenDisplay';

export default function HomeScreen() {
  const {
    isParent, isChild, isActingAsChild, activeChild, meChild,
  } = useApp();

  const viewingChild = isActingAsChild
    ? activeChild
    : (isChild ? meChild : null);

  if (viewingChild) {
    return <ChildHomeScreen child={viewingChild} />;
  }

  return <ParentHomeScreen />;
}

function ParentHomeScreen() {
  const nav = useNavigation();
  const { t } = useI18n();
  const { isDesktop } = useLayout();
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
  const [kitchenMode, setKitchenMode] = useState(false);
  const [kitchenSettings, setKitchenSettings] = useState({ enabled: false, pinEnabled: false });
  const [pinModalOpen, setPinModalOpen] = useState(false);

  useEffect(() => {
    if (!uid) {
      setKitchenMode(false);
      setKitchenSettings({ enabled: false, pinEnabled: false });
      return undefined;
    }
    let alive = true;
    loadKitchenDisplaySettings(uid).then((s) => {
      if (!alive) return;
      setKitchenSettings(s);
      setKitchenMode(!!s.enabled);
    });
    const unsub = subscribeKitchenDisplay((s) => {
      if (!alive) return;
      const next = typeof s === 'object' && s ? s : { enabled: !!s };
      setKitchenSettings((prev) => ({ ...prev, ...next }));
      setKitchenMode(!!next.enabled);
    });
    return () => { alive = false; unsub(); };
  }, [uid]);

  const requestExitKitchen = () => {
    if (kitchenSettings.pinEnabled) {
      setPinModalOpen(true);
      return;
    }
    exitKitchenMode();
  };

  const exitKitchenMode = async () => {
    if (!uid) return;
    setKitchenMode(false);
    await saveKitchenDisplaySettings(uid, { enabled: false });
  };

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
      requestShellTab(action.tab, action.subView || null);
      return;
    }
    if (action.type === 'nav') {
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

  const firstKid = activeKids[0] || null;

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
        sub: 'Oppgave for deg eller andre foresatte',
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
      {
        id: 'shop',
        icon: 'cart',
        label: 'Ny handleliste',
        sub: 'Skriv navn og opprett',
        onPress: () => requestShellTab('more', 'shop', 'create'),
      },
      {
        id: 'wish',
        icon: 'gift',
        label: 'Ny ønskeliste',
        sub: 'Gaveønsker',
        onPress: () => requestShellTab('more', 'wishes', 'create'),
      },
      {
        id: 'book',
        icon: 'library',
        label: 'Ny bok',
        sub: firstKid ? `I ${firstKid.name?.split(' ')[0] || 'barn'}s bokhylle` : 'I din bokhylle',
        onPress: () => {
          if (firstKid) {
            nav.navigate('AddBook', {
              familyId,
              ownerKind: BOOK_OWNER.child,
              ownerId: firstKid.id,
              childId: firstKid.id,
              ownerName: firstKid.name,
              childName: firstKid.name,
            });
            return;
          }
          nav.navigate('AddBook', {
            familyId,
            ownerKind: BOOK_OWNER.parent,
            ownerId: uid,
            ownerName: 'Meg',
          });
        },
      },
    ];

    if (familyId) {
      opts.push({
        id: 'activity',
        icon: 'fitness',
        label: 'Ny aktivitet',
        sub: 'Treningsplan / aktivitet',
        onPress: () => requestShellTab('more', 'activities', 'create'),
      });
    }

    return opts;
  }, [familyId, todayKey, firstKid, uid, nav, requestShellTab]);

  if (!familyId) {
    return (
      <Screen>
        <PendingFamilyInvitePrompt />
        <Loader />
      </Screen>
    );
  }

  if (kitchenMode) {
    return (
      <Screen>
        <PendingFamilyInvitePrompt />
        <KitchenWallDashboard
          widgetData={widgetData}
          familyEventsToday={familyEventsToday}
          onOpenEvent={openEvent}
          onTab={(tab, subView) => requestShellTab(tab, subView || null)}
          onExitRequest={requestExitKitchen}
        />
        <KitchenPinModal
          visible={pinModalOpen}
          mode="unlock"
          onCancel={() => setPinModalOpen(false)}
          onSubmit={async (pin) => {
            const full = await loadKitchenDisplaySettings(uid);
            if (!(await verifyKitchenPin(full, pin))) return false;
            setPinModalOpen(false);
            await exitKitchenMode();
            return true;
          }}
        />
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
          onNotify={() => nav.navigate('Notifications')}
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
