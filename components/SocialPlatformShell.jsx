import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../src/context/AppContext';
import { isGroupAdmin } from '../src/utils/groups';
import {
  isFriendsType, isCongregationType, isDaycareType, isFlexGroupType,
} from '../src/utils/groupTypes';
import { openPlatformHome } from '../src/utils/platformNav';
import { configForType } from '../src/platform/platformConfigs';
import PlatformHeader from './platform/PlatformHeader';
import PlatformDrawer from './platform/PlatformDrawer';
import PlatformHomeScreen from '../screens/platform/PlatformHomeScreen';
import PlatformListScreen from '../screens/platform/PlatformListScreen';
import PlatformWallScreen from '../screens/platform/PlatformWallScreen';
import PlatformPlansScreen from '../screens/platform/PlatformPlansScreen';
import PlatformMessagesScreen from '../screens/platform/PlatformMessagesScreen';
import PlatformMembersScreen from '../screens/platform/PlatformMembersScreen';
import PlatformInviteScreen from '../screens/platform/PlatformInviteScreen';
import PlatformApprovalsScreen from '../screens/platform/PlatformApprovalsScreen';
import PlatformMoreScreen from '../screens/platform/PlatformMoreScreen';
import PlatformPollsScreen from '../screens/platform/PlatformPollsScreen';
import PlatformExpensesScreen from '../screens/platform/PlatformExpensesScreen';
import PlatformMinistryScreen from '../screens/platform/PlatformMinistryScreen';
import PlatformVolunteerScreen from '../screens/platform/PlatformVolunteerScreen';
import PlatformRhythmScreen from '../screens/platform/PlatformRhythmScreen';
import PlatformAbsenceScreen from '../screens/platform/PlatformAbsenceScreen';
import PlatformPickupScreen from '../screens/platform/PlatformPickupScreen';
import PlatformAnnouncementsScreen from '../screens/platform/PlatformAnnouncementsScreen';
import PlatformTasksScreen from '../screens/platform/PlatformTasksScreen';
import ModuleIntroHost from './ModuleIntroHost';
import HelpTarget from './HelpTarget';

const TITLES = {
  home: 'Hjem',
  plans: 'Planer',
  calendar: 'Kalender',
  groups: 'Mine grupper',
  messages: 'Meldinger',
  stream: 'Strøm',
  wall: 'Vegg',
  more: 'Mer',
  polls: 'Avstemninger',
  expenses: 'Utgifter',
  ministry: 'Menighetsgrupper',
  volunteer: 'Frivillig tjeneste',
  rhythm: 'Dagsrytme',
  absence: 'Fravær',
  pickup: 'Henteplan',
  announcements: 'Beskjeder',
  tasks: 'Oppgaver',
  members: 'Medlemmer',
  invite: 'Invitasjon',
  approvals: 'Godkjenninger',
};

function matchesPlatformType(type, platformType) {
  const t = String(type || '').toLowerCase();
  if (platformType === 'friends') return isFriendsType(t);
  if (platformType === 'congregation') return isCongregationType(t);
  if (platformType === 'daycare') return isDaycareType(t);
  if (platformType === 'group') return isFlexGroupType(t);
  return false;
}

export default function SocialPlatformShell({ platformType }) {
  const config = configForType(platformType);
  const c = config.theme;
  const nav = useNavigation();
  const route = useRoute();
  const { familyId, family, uid, selectFamily } = useApp();
  const [tab, setTab] = useState(route.params?.module || 'home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [groupDoc, setGroupDoc] = useState(family);

  const group = groupDoc || family;
  const isAdmin = isGroupAdmin(group, uid);

  useEffect(() => {
    if (route.params?.module) setTab(route.params.module);
  }, [route.params?.module]);

  useEffect(() => {
    if (!familyId) return undefined;
    return onSnapshot(doc(db, 'families', familyId), (snap) => {
      if (snap.exists()) setGroupDoc({ id: snap.id, ...snap.data() });
    });
  }, [familyId]);

  useEffect(() => {
    if (!familyId) {
      setTab('groups');
      return;
    }
    if (family?.type && !matchesPlatformType(family.type, platformType)) {
      openPlatformHome(nav, family);
    }
  }, [familyId, family?.id, family?.type, nav, platformType]);

  const title = TITLES[tab] || 'Hjem';

  const openGroup = (id) => {
    selectFamily(id);
    setTab('home');
  };

  const body = useMemo(() => {
    const props = { config, groupId: familyId, group, onSelectTab: setTab };

    if (!familyId || tab === 'groups') {
      return <PlatformListScreen {...props} embedded onOpenGroup={openGroup} />;
    }
    if (tab === 'home') return <PlatformHomeScreen {...props} />;
    if (tab === 'plans' || tab === 'calendar') return <PlatformPlansScreen {...props} />;
    if (tab === 'wall' || tab === 'stream') return <PlatformWallScreen {...props} />;
    if (tab === 'messages') return <PlatformMessagesScreen {...props} />;
    if (tab === 'members') return <PlatformMembersScreen {...props} />;
    if (tab === 'invite') return <PlatformInviteScreen {...props} />;
    if (tab === 'approvals') return <PlatformApprovalsScreen {...props} />;
    if (tab === 'more') return <PlatformMoreScreen {...props} />;
    if (tab === 'polls') return <PlatformPollsScreen {...props} />;
    if (tab === 'expenses') return <PlatformExpensesScreen {...props} />;
    if (tab === 'ministry') return <PlatformMinistryScreen {...props} />;
    if (tab === 'volunteer') return <PlatformVolunteerScreen {...props} />;
    if (tab === 'rhythm') return <PlatformRhythmScreen {...props} />;
    if (tab === 'absence') return <PlatformAbsenceScreen {...props} />;
    if (tab === 'pickup') return <PlatformPickupScreen {...props} />;
    if (tab === 'announcements') return <PlatformAnnouncementsScreen {...props} />;
    if (tab === 'tasks') return <PlatformTasksScreen {...props} />;
    return <PlatformHomeScreen {...props} />;
  }, [tab, familyId, group?.id, group?.name, group?.joinCode, config, platformType]);

  const addPress = () => {
    if (!familyId || !isAdmin) return undefined;
    if (tab === 'wall' || tab === 'stream') {
      return () => nav.navigate(config.composePostRoute, { groupId: familyId, group, platformType });
    }
    if (tab === 'plans' || tab === 'calendar' || tab === 'home') {
      return () => nav.navigate(config.createEventRoute, { groupId: familyId, group, platformType });
    }
    if (tab === 'announcements' || (platformType === 'daycare' && tab === 'messages')) {
      return () => nav.navigate(config.createEventRoute, {
        groupId: familyId, group, platformType, mode: 'announcement',
      });
    }
    if (tab === 'polls' || tab === 'expenses' || tab === 'ministry' || tab === 'volunteer') {
      return undefined;
    }
    return undefined;
  };

  const addHandler = addPress();

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.safe, { backgroundColor: c.bg }]}>
      <PlatformHeader
        config={config}
        title={title}
        groupName={tab === 'groups' ? undefined : group?.name}
        onMenuPress={() => setDrawerOpen(true)}
        rightLabel={tab === 'members' ? 'Inviter' : `Mine ${config.labelShort.toLowerCase()}er`}
        rightIcon={tab === 'members' ? 'person-add-outline' : 'people-outline'}
        onRightPress={
          tab === 'members' && familyId
            ? () => setTab('invite')
            : () => setTab('groups')
        }
        onAddPress={addHandler}
        addLabel="Legg til"
      />

      <View style={styles.body}>
        {body}
        <ModuleIntroHost scope={platformType} moduleId={tab} />
      </View>

      <HelpTarget id="tabs">
        <View style={[styles.tabBar, { backgroundColor: c.tabBar, borderTopColor: c.line }]}>
          {config.tabs.map((item) => {
            const on = tab === item.id || (item.id === 'more' && ['polls', 'expenses', 'ministry', 'volunteer', 'rhythm', 'absence', 'pickup', 'announcements', 'members', 'invite', 'approvals', 'wall'].includes(tab));
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.tabItem, on && styles.tabItemOn]}
                onPress={() => setTab(item.id)}
                accessibilityLabel={item.label}
              >
                <Ionicons
                  name={on ? item.icon : `${item.icon}-outline`}
                  size={22}
                  color={on ? c.brand : c.muted}
                />
                <Text style={[styles.tabLabel, { color: on ? c.brand : c.muted }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </HelpTarget>

      <PlatformDrawer
        config={config}
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeTab={tab}
        onSelectTab={setTab}
        group={group}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1, position: 'relative' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    paddingTop: 6,
    paddingBottom: 4,
  },
  tabItem: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  tabItemOn: {},
  tabLabel: { fontSize: 10, fontWeight: '700' },
});

export function FriendsShell() {
  return <SocialPlatformShell platformType="friends" />;
}

export function CongregationShell() {
  return <SocialPlatformShell platformType="congregation" />;
}

export function DaycareShell() {
  return <SocialPlatformShell platformType="daycare" />;
}

export function GroupShell() {
  return <SocialPlatformShell platformType="group" />;
}
