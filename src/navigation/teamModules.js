/**
 * Modulkatalog for idrettslag (parallell til shellModules for familie).
 */
export function buildTeamModules({ t, isAdmin }) {
  const main = [
    { id: 'home', icon: 'home', label: t('team.home'), tab: 'home' },
    { id: 'wall', icon: 'newspaper', label: t('team.wall'), tab: 'wall' },
    { id: 'events', icon: 'calendar', label: t('team.calendar'), tab: 'events' },
    { id: 'messages', icon: 'chatbubbles', label: t('team.messages'), tab: 'messages' },
    { id: 'alerts', icon: 'notifications', label: t('team.alerts'), tab: 'alerts' },
  ];

  const manage = [
    { id: 'members', icon: 'people', label: t('team.members'), tab: 'members' },
    ...(isAdmin ? [
      { id: 'approvals', icon: 'shield-checkmark', label: t('team.approvals'), tab: 'approvals' },
      { id: 'invite', icon: 'key', label: t('team.inviteCode'), tab: 'invite' },
      {
        id: 'addMember',
        icon: 'person-add',
        label: t('team.inviteParticipant'),
        action: { type: 'nav', screen: 'TeamAddMember', params: {} },
      },
    ] : []),
    { id: 'groups', icon: 'grid', label: t('team.myTeams'), tab: 'groups' },
  ];

  const switchers = [
    { id: 'familyMode', icon: 'swap-horizontal', label: t('team.switchPlatform'), action: { type: 'platformOverview' } },
  ];

  return [
    { id: 'main', title: t('team.sectionTeam'), items: main },
    { id: 'manage', title: t('team.sectionAdmin'), items: manage },
    { id: 'switch', title: t('team.sectionSwitch'), items: switchers },
  ];
}

export function buildTeamTabs(t) {
  return [
    { id: 'home', icon: 'home', label: t('team.home') },
    { id: 'wall', icon: 'newspaper', label: t('team.wall') },
    { id: 'groups', icon: 'people', label: t('team.teams') },
    { id: 'messages', icon: 'chatbubbles', label: t('team.messages') },
    { id: 'alerts', icon: 'notifications', label: t('team.alerts') },
  ];
}

/** @deprecated Prefer buildTeamTabs(t) so labels follow the active language. */
export const TEAM_TABS = [
  { id: 'home', icon: 'home', label: 'Hjem' },
  { id: 'wall', icon: 'newspaper', label: 'Vegg' },
  { id: 'groups', icon: 'people', label: 'Lag' },
  { id: 'messages', icon: 'chatbubbles', label: 'Meldinger' },
  { id: 'alerts', icon: 'notifications', label: 'Varsler' },
];
