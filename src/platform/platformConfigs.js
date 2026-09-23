/**
 * Plattformkonfigurasjon — styrer skall, faner og moduler.
 */
import {
  friendsColors, congregationColors, daycareColors, flexGroupColors,
} from './platformThemes';

export const PLATFORM_CONFIGS = {
  friends: {
    type: 'friends',
    homeRoute: 'FriendsHome',
    joinRoute: 'FriendsJoin',
    createEventRoute: 'FriendsCreateEvent',
    composePostRoute: 'FriendsComposePost',
    label: 'Vennegjeng',
    labelShort: 'Venner',
    icon: 'happy-outline',
    theme: friendsColors,
    codeLabel: 'Gjengkode',
    tabs: [
      { id: 'home', icon: 'home', label: 'Hjem' },
      { id: 'plans', icon: 'calendar', label: 'Planer' },
      { id: 'groups', icon: 'people', label: 'Gjenger' },
      { id: 'messages', icon: 'chatbubbles', label: 'Prat' },
      { id: 'more', icon: 'grid', label: 'Mer' },
    ],
    homeKicker: 'Vennegjeng',
    homeSubtitle: 'Planlegg treff, turer og felles gjøremål — inspirert av ZynkUp og Somo.',
    quickActions: [
      { tab: 'plans', icon: 'calendar-outline', label: 'Planer', soft: '#e0f2fe' },
      { tab: 'polls', icon: 'stats-chart-outline', label: 'Stem', soft: '#dbeafe' },
      { tab: 'expenses', icon: 'wallet-outline', label: 'Utgifter', soft: '#fef3c7' },
      { tab: 'wall', icon: 'newspaper-outline', label: 'Vegg', soft: '#f0fdf4' },
    ],
    moreModules: [
      { id: 'polls', icon: 'stats-chart', label: 'Avstemninger', tab: 'polls' },
      { id: 'expenses', icon: 'wallet', label: 'Utgiftsdeling', tab: 'expenses' },
      { id: 'wall', icon: 'newspaper', label: 'Vegg', tab: 'wall' },
      { id: 'members', icon: 'people', label: 'Medlemmer', tab: 'members' },
      { id: 'invite', icon: 'key', label: 'Gjengkode', tab: 'invite' },
      { id: 'approvals', icon: 'shield-checkmark', label: 'Godkjenninger', tab: 'approvals', admin: true },
    ],
    eventsLabel: 'Planer',
    wallLabel: 'Vegg',
    chatId: 'friends',
    chatTitle: 'Gjengen',
  },
  congregation: {
    type: 'congregation',
    homeRoute: 'CongregationHome',
    joinRoute: 'CongregationJoin',
    createEventRoute: 'CongregationCreateEvent',
    composePostRoute: 'CongregationComposePost',
    label: 'Forsamling',
    labelShort: 'Menighet',
    icon: 'business-outline',
    theme: congregationColors,
    codeLabel: 'Menighetskode',
    tabs: [
      { id: 'home', icon: 'home', label: 'Hjem' },
      { id: 'calendar', icon: 'calendar', label: 'Kalender' },
      { id: 'groups', icon: 'people', label: 'Menigheter' },
      { id: 'stream', icon: 'chatbubbles', label: 'Strøm' },
      { id: 'more', icon: 'grid', label: 'Mer' },
    ],
    homeKicker: 'Forsamling',
    homeSubtitle: 'Samlinger, grupper og praktisk info — som MinMenighet og ChurchDesk.',
    quickActions: [
      { tab: 'calendar', icon: 'calendar-outline', label: 'Kalender', soft: '#e2e8f0' },
      { tab: 'ministry', icon: 'people-outline', label: 'Grupper', soft: '#ccfbf1' },
      { tab: 'volunteer', icon: 'hand-left-outline', label: 'Tjeneste', soft: '#fef3c7' },
      { tab: 'stream', icon: 'megaphone-outline', label: 'Strøm', soft: '#f1f5f9' },
    ],
    moreModules: [
      { id: 'ministry', icon: 'people', label: 'Menighetsgrupper', tab: 'ministry' },
      { id: 'volunteer', icon: 'hand-left', label: 'Frivillig tjeneste', tab: 'volunteer' },
      { id: 'messages', icon: 'chatbubbles', label: 'Meldinger', tab: 'messages' },
      { id: 'members', icon: 'person', label: 'Medlemmer', tab: 'members' },
      { id: 'invite', icon: 'key', label: 'Menighetskode', tab: 'invite' },
      { id: 'approvals', icon: 'shield-checkmark', label: 'Godkjenninger', tab: 'approvals', admin: true },
    ],
    eventsLabel: 'Samlinger',
    wallLabel: 'Strøm',
    chatId: 'congregation',
    chatTitle: 'Menigheten',
  },
  daycare: {
    type: 'daycare',
    homeRoute: 'DaycareHome',
    joinRoute: 'DaycareJoin',
    createEventRoute: 'DaycareCreateAnnouncement',
    composePostRoute: 'DaycareCreateAnnouncement',
    label: 'Barnehage / SFO',
    labelShort: 'Barnehage',
    icon: 'balloon-outline',
    theme: daycareColors,
    codeLabel: 'Barnehagekode',
    tabs: [
      { id: 'home', icon: 'home', label: 'Hjem' },
      { id: 'rhythm', icon: 'time', label: 'Dag' },
      { id: 'groups', icon: 'people', label: 'Avdelinger' },
      { id: 'messages', icon: 'chatbubbles', label: 'Beskjeder' },
      { id: 'more', icon: 'grid', label: 'Mer' },
    ],
    homeKicker: 'Barnehage / SFO',
    homeSubtitle: 'Dagsrytme, beskjeder og oversikt — som IST Home og MyKid.',
    quickActions: [
      { tab: 'rhythm', icon: 'time-outline', label: 'Dagsrytme', soft: '#ffe4e6' },
      { tab: 'absence', icon: 'medical-outline', label: 'Fravær', soft: '#fef3c7' },
      { tab: 'pickup', icon: 'car-outline', label: 'Henting', soft: '#e0f2fe' },
      { tab: 'announcements', icon: 'megaphone-outline', label: 'Info', soft: '#f0fdf4' },
    ],
    moreModules: [
      { id: 'absence', icon: 'medical', label: 'Meld fravær', tab: 'absence' },
      { id: 'pickup', icon: 'car', label: 'Henteplan', tab: 'pickup' },
      { id: 'announcements', icon: 'megaphone', label: 'Beskjeder', tab: 'announcements' },
      { id: 'members', icon: 'people', label: 'Barn og foresatte', tab: 'members' },
      { id: 'invite', icon: 'key', label: 'Barnehagekode', tab: 'invite' },
      { id: 'approvals', icon: 'shield-checkmark', label: 'Godkjenninger', tab: 'approvals', admin: true },
    ],
    eventsLabel: 'Aktiviteter',
    wallLabel: 'Beskjeder',
    chatId: 'daycare',
    chatTitle: 'Barnehagen',
  },
  group: {
    type: 'group',
    homeRoute: 'GroupHome',
    joinRoute: 'GroupJoin',
    createEventRoute: 'GroupCreateEvent',
    composePostRoute: 'GroupComposePost',
    label: 'Gruppe',
    labelShort: 'Gruppe',
    icon: 'people-outline',
    theme: flexGroupColors,
    codeLabel: 'Gruppekode',
    tabs: [
      { id: 'home', icon: 'home', label: 'Hjem' },
      { id: 'plans', icon: 'calendar', label: 'Planer' },
      { id: 'groups', icon: 'grid', label: 'Grupper' },
      { id: 'tasks', icon: 'checkbox', label: 'Oppgaver' },
      { id: 'more', icon: 'ellipsis-horizontal', label: 'Mer' },
    ],
    homeKicker: 'Gruppe',
    homeSubtitle: 'Fleksibel plattform for det som passer dere best.',
    quickActions: [
      { tab: 'plans', icon: 'calendar-outline', label: 'Planer', soft: '#e2e8f0' },
      { tab: 'tasks', icon: 'checkbox-outline', label: 'Oppgaver', soft: '#dbeafe' },
      { tab: 'wall', icon: 'newspaper-outline', label: 'Vegg', soft: '#f0fdf4' },
      { tab: 'messages', icon: 'chatbubbles-outline', label: 'Prat', soft: '#fef3c7' },
    ],
    moreModules: [
      { id: 'wall', icon: 'newspaper', label: 'Vegg', tab: 'wall' },
      { id: 'messages', icon: 'chatbubbles', label: 'Meldinger', tab: 'messages' },
      { id: 'members', icon: 'people', label: 'Medlemmer', tab: 'members' },
      { id: 'invite', icon: 'key', label: 'Gruppekode', tab: 'invite' },
      { id: 'approvals', icon: 'shield-checkmark', label: 'Godkjenninger', tab: 'approvals', admin: true },
    ],
    eventsLabel: 'Planer',
    wallLabel: 'Vegg',
    chatId: 'group',
    chatTitle: 'Gruppen',
  },
};

export function configForType(type) {
  const t = String(type || '').toLowerCase();
  return PLATFORM_CONFIGS[t] || PLATFORM_CONFIGS.group;
}

export function buildPlatformModules(config, { isAdmin }) {
  const main = (config.tabs || []).filter((t) => t.id !== 'more' && t.id !== 'groups').map((t) => ({
    id: t.id,
    icon: t.icon,
    label: t.label,
    tab: t.id,
  }));

  const extra = (config.moreModules || [])
    .filter((m) => !m.admin || isAdmin)
    .map((m) => ({
      id: m.id,
      icon: m.icon,
      label: m.label,
      tab: m.tab,
    }));

  const manage = [
    { id: 'groups', icon: 'grid', label: `Mine ${config.labelShort.toLowerCase()}er`, tab: 'groups' },
    ...extra,
  ];

  const switchers = [
    { id: 'platformOverview', icon: 'swap-horizontal', label: 'Skift plattform', action: { type: 'platformOverview' } },
  ];

  return [
    { id: 'main', title: config.label, items: main },
    { id: 'manage', title: 'Flere moduler', items: manage },
    { id: 'switch', title: 'Bytt modus', items: switchers },
  ];
}
