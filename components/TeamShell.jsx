import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../src/context/AppContext';
import { isGroupAdmin } from '../src/utils/groups';
import { isTeamType } from '../src/utils/teams';
import { openPlatformHome } from '../src/utils/platformNav';
import { teamColors as c } from '../src/teamTheme';
import { buildTeamTabs } from '../src/navigation/teamModules';
import { useI18n } from '../src/i18n';
import TeamHeader from './team/TeamHeader';
import TeamDrawer from './team/TeamDrawer';
import TeamHomeScreen from '../screens/team/TeamHomeScreen';
import TeamWallScreen from '../screens/team/TeamWallScreen';
import TeamGroupsScreen from '../screens/team/TeamGroupsScreen';
import TeamMessagesScreen from '../screens/team/TeamMessagesScreen';
import TeamAlertsScreen from '../screens/team/TeamAlertsScreen';
import TeamMembersScreen from '../screens/team/TeamMembersScreen';
import TeamApprovalsScreen from '../screens/team/TeamApprovalsScreen';
import TeamInviteScreen from '../screens/team/TeamInviteScreen';
import TeamEventsScreen from '../screens/team/TeamEventsScreen';
import ModuleIntroHost from './ModuleIntroHost';
import HelpTarget from './HelpTarget';

export default function TeamShell() {
  const nav = useNavigation();
  const route = useRoute();
  const { t } = useI18n();
  const tabs = useMemo(() => buildTeamTabs(t), [t]);
  const { familyId, family, uid, selectFamily } = useApp();
  const [tab, setTab] = useState(route.params?.module || 'home');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [teamDoc, setTeamDoc] = useState(family);

  const team = teamDoc || family;
  const isAdmin = isGroupAdmin(team, uid);

  useEffect(() => {
    if (route.params?.module) setTab(route.params.module);
  }, [route.params?.module]);

  useEffect(() => {
    if (!familyId) return undefined;
    return onSnapshot(doc(db, 'families', familyId), (snap) => {
      if (snap.exists()) setTeamDoc({ id: snap.id, ...snap.data() });
    });
  }, [familyId]);

  useEffect(() => {
    if (!familyId) {
      setTab('groups');
      return;
    }
    // Only bounce away once we know the type — undefined type during load must not blank the shell.
    if (family?.type && !isTeamType(family.type)) {
      openPlatformHome(nav, family);
    }
  }, [familyId, family?.id, family?.type, nav]);

  const title = useMemo(() => {
    const map = {
      home: t('team.home'),
      wall: t('team.wall'),
      events: t('team.calendar'),
      messages: t('team.messages'),
      alerts: t('team.alerts'),
      members: t('team.members'),
      approvals: t('team.approvals'),
      invite: t('team.inviteCode'),
      groups: t('team.teams'),
    };
    return map[tab] || t('team.home');
  }, [tab, t]);

  const openTeam = (id) => {
    selectFamily(id);
    setTab('home');
  };

  // Avoid remounting groups list on every team doc snapshot (was blanking the tab).
  const body = useMemo(() => {
    if (!familyId || tab === 'groups') {
      return <TeamGroupsScreen embedded onOpenTeam={openTeam} />;
    }
    if (tab === 'wall') return <TeamWallScreen teamId={familyId} team={team} />;
    if (tab === 'events') return <TeamEventsScreen teamId={familyId} team={team} />;
    if (tab === 'messages') return <TeamMessagesScreen teamId={familyId} team={team} />;
    if (tab === 'alerts') return <TeamAlertsScreen teamId={familyId} />;
    if (tab === 'members') return <TeamMembersScreen teamId={familyId} team={team} />;
    if (tab === 'approvals') return <TeamApprovalsScreen teamId={familyId} />;
    if (tab === 'invite') return <TeamInviteScreen teamId={familyId} team={team} />;
    return <TeamHomeScreen teamId={familyId} team={team} onSelectTab={setTab} />;
  }, [tab, familyId, team?.id, team?.name, team?.joinCode, team?.sport]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <TeamHeader
        title={title}
        teamName={tab === 'groups' ? undefined : team?.name}
        onMenuPress={() => setDrawerOpen(true)}
        rightLabel={tab === 'members' ? 'Inviter' : 'Mine lag'}
        rightIcon={tab === 'members' ? 'person-add-outline' : 'people-outline'}
        onRightPress={
          tab === 'members' && familyId
            ? () => nav.navigate('TeamAddMember', { teamId: familyId, team })
            : () => setTab('groups')
        }
        addIcon={tab === 'members' || tab === 'invite' ? 'person-add' : 'add'}
        addLabel={tab === 'members' || tab === 'invite' ? 'Inviter deltaker' : 'Legg til'}
        onAddPress={
          familyId && (tab === 'home' || tab === 'events') && isAdmin
            ? () => nav.navigate('TeamCreateEvent', { teamId: familyId })
            : (tab === 'wall' && familyId
              ? () => nav.navigate('TeamComposePost', { teamId: familyId })
              : (familyId && (tab === 'members' || tab === 'invite')
                ? () => nav.navigate('TeamAddMember', { teamId: familyId, team })
                : undefined))
        }
      />

      <View style={styles.body}>
        {body}
        <ModuleIntroHost scope="team" moduleId={tab} />
      </View>

      <HelpTarget id="tabs">
        <View style={styles.tabBar}>
          {tabs.map((item) => {
            const on = tab === item.id;
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
                <Text style={[styles.tabLabel, on && styles.tabLabelOn]} numberOfLines={1}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </HelpTarget>

      <TeamDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        activeTab={tab}
        onSelectTab={setTab}
        team={team}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  body: { flex: 1, minHeight: 0, position: 'relative' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: c.line,
    backgroundColor: c.tabBar,
    paddingTop: 6,
    paddingBottom: 4,
  },
  tabItem: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 6, borderRadius: 14, marginHorizontal: 2,
  },
  tabItemOn: { backgroundColor: c.brandSoft },
  tabLabel: { marginTop: 2, fontSize: 10, fontWeight: '700', color: c.muted },
  tabLabelOn: { color: c.brand },
});
