import { homeFocusCopy } from './deskHome';
import {
  dashboardDayPart,
  dateForDashboardDayPart,
  resolveThemeHeroArt,
  resolveThemeAccentArt,
  resolveThemeBackgroundArt,
} from './dashboardTimeArt';

/** Demo-data for forhåndsvisning av voksen hjem uten innlogging. */
export function buildParentDashboardPreviewModel(theme, {
  focusTomorrow = false,
  greeting,
  dayPart,
} = {}) {
  const apps = {
    stars: { id: 'stars', icon: 'checkbox', label: 'Oppgaver', action: { type: 'tab', tab: 'stars' } },
    shop: { id: 'shop', icon: 'cart', label: 'Handleliste', action: { type: 'tab', tab: 'more', subView: 'shop' } },
    plan: { id: 'plan', icon: 'calendar', label: 'Kalender', action: { type: 'tab', tab: 'plan' } },
    chat: { id: 'chat', icon: 'chatbubbles', label: 'Chat', action: { type: 'tab', tab: 'chat' } },
    games: { id: 'games', icon: 'game-controller', label: 'FamilieSpill', action: { type: 'tab', tab: 'more', subView: 'games' } },
    family: { id: 'family', icon: 'people', label: 'Familie', action: { type: 'tab', tab: 'family' } },
    meals: { id: 'meals', icon: 'restaurant', label: 'Måltider', action: { type: 'tab', tab: 'more', subView: 'meals' } },
    more: { id: 'more', icon: 'add', label: '+ mer', folder: true, action: { type: 'tab', tab: 'more' } },
    progress: { id: 'progress', icon: 'stats-chart', label: 'Progresjon', action: { type: 'tab', tab: 'more', subView: 'progress' } },
  };
  const focusCopy = homeFocusCopy(focusTomorrow);
  const timeline = focusTomorrow
    ? [
      { id: '1', time: 'Heldag', title: 'Skolefri / aktivitet', place: '', color: '#2563eb' },
      { id: '2', time: '09:00', title: 'Kino kino fremdriftsmøte', place: '', color: '#7c3aed' },
      { id: '3', time: '16:30', title: 'Adelen - Turn', place: 'Fjogstad-Hus Turnarena', color: '#059669' },
    ]
    : [
      { id: '1', time: 'Heldag', title: 'Tronny sin fødselsdag', place: '', color: '#2F80ED' },
      { id: '2', time: '15:00', title: 'Geir Ove [har barna]', place: '', color: '#7c3aed' },
      { id: '3', time: '16:00', title: 'Håkan Bolin', place: '', color: '#059669' },
    ];
  const now = dateForDashboardDayPart(dayPart || (focusTomorrow ? 'evening' : 'morning'));
  const resolvedPart = dayPart || dashboardDayPart(now);
  return {
    theme,
    isPreview: true,
    greeting: greeting || (focusTomorrow ? 'God kveld, Geir' : resolvedPart === 'afternoon' ? 'God ettermiddag, Geir' : 'God morgen, Geir'),
    firstName: 'Geir',
    dateLabel: focusTomorrow ? 'Fredag 11. september' : 'Torsdag 10. september',
    focusTomorrow,
    focusLabel: focusCopy.focusLabel,
    focusCopy,
    weather: {
      temp: 13,
      icon: 'partly-sunny',
      label: 'Delvis skyet',
      hint: resolvedPart === 'evening' ? 'Det blir en fin uke' : 'En nydelig dag venter',
      place: 'Røyneberg',
      high: 15,
      low: 12,
      periods: [
        { id: 'morning', icon: 'partly-sunny', temp: 14 },
        { id: 'forenoon', icon: 'partly-sunny', temp: 15 },
        { id: 'afternoon', icon: 'cloudy', temp: 15 },
        { id: 'midafternoon', icon: 'cloudy', temp: 14 },
        { id: 'evening', icon: 'cloudy', temp: 13 },
      ],
      hours: [
        { id: '09', hour: '09', icon: 'partly-sunny', temp: 13 },
        { id: '11', hour: '11', icon: 'partly-sunny', temp: 14 },
        { id: '13', hour: '13', icon: 'cloudy', temp: 15 },
        { id: '15', hour: '15', icon: 'cloudy', temp: 15 },
        { id: '17', hour: '17', icon: 'cloudy', temp: 14 },
        { id: '19', hour: '19', icon: 'cloudy', temp: 13 },
      ],
      days: [
        { weekday: 'I dag', icon: 'partly-sunny', max: 15, min: 12, label: 'Delvis skyet' },
        { weekday: 'I morgen', icon: 'cloudy', max: 14, min: 10, label: 'Skyet' },
        { weekday: 'Lør', icon: 'rainy', max: 12, min: 9, label: 'Lett regn' },
      ],
    },
    nextEvent: {
      title: 'Tronny sin fødselsdag',
      time: 'Heldag',
      end: '',
      place: '',
      peopleLine: 'Familie',
    },
    timeline,
    appointmentsPeek: [
      { id: '1', time: '17:00', title: 'Fotballtrening', place: '', color: '#34C759' },
      { id: '2', time: '19:00', title: 'Foreldremøte', place: '', color: '#E0A106' },
      { id: '3', time: '20:00', title: 'Leggetid', place: '', color: '#2F80ED' },
    ],
    focusEvents: [
      { id: 'fe1', title: 'Turn', startTime: '16:30', memberIds: ['k1'] },
      { id: 'fe2', title: 'Fotballtrening', startTime: '14:30', memberIds: ['k2'] },
      { id: 'fe3', title: 'Korøvelse', startTime: '17:00', memberIds: ['k3'] },
    ],
    taskProgress: {
      done: 2,
      total: 3,
      open: 1,
      items: [
        { id: 't1', title: 'Gå tur med hunden', meta: 'I dag', done: true },
        { id: 't2', title: 'Gjør lekser', meta: 'I dag', done: true },
        { id: 't3', title: 'Rydd rommet', meta: 'I dag' },
      ],
    },
    taskCount: 1,
    shopCount: 5,
    shopItems: [
      { id: 's1', title: 'Melk' },
      { id: 's2', title: 'Brød' },
      { id: 's3', title: 'Bananer' },
    ],
    dinner: { title: 'Pasta med tomatsaus' },
    mealItems: [
      { id: 'm1', title: 'Havregrøt', meta: 'Frokost' },
      { id: 'm2', title: 'Laks og ris', meta: 'Middag' },
      { id: 'm3', title: 'Smørbrød', meta: 'Matpakke' },
    ],
    mealCount: 3,
    notes: [
      { id: 'n1', title: 'Husk gymtøy i morgen 💪', meta: 'I dag kl. 16:42' },
    ],
    noteCount: 1,
    chatPreview: [
      { id: 'c1', name: 'Mamma', preview: 'Husk regntøy i morgen', time: '21:08', tint: '#F3B6C2' },
      { id: 'c2', name: 'Pappa', preview: 'Jeg henter kl. 16', time: '20:42', tint: '#8EB4F0' },
      { id: 'c3', name: 'Celine', preview: 'Kan jeg ta med bok?', time: '19:55', tint: '#B9A6F0' },
    ],
    unreadByModule: { chat: 3 },
    remainingHints: ['Dagligvarer', 'Planlegg middag'],
    remainingCount: 2,
    custodyWeekLabel: 'Neste bytte: mandag',
    weekStats: { swaps: 1, activities: 3, appointments: 3, reminders: 6 },
    activeKids: (theme?.layout === 'kidsFocus' || theme?.layout === 'sharedWeek')
      ? [
        { id: 'k1', name: 'Emma', avatarId: 'fox' },
        { id: 'k2', name: 'Lucas', avatarId: 'bear' },
        { id: 'k3', name: 'Nora', avatarId: 'cat' },
        { id: 'k4', name: 'Elias', avatarId: 'dog' },
        { id: 'k5', name: 'Maja', avatarId: 'bunny' },
      ]
      : [
        { id: 'k1', name: 'Adelen', avatarId: 'fox' },
        { id: 'k2', name: 'Celine', avatarId: 'bear' },
        { id: 'k3', name: 'Vanessa', avatarId: 'cat' },
      ],
    allMembers: [
      { id: 'p1', name: 'Mamma', role: 'parent' },
      { id: 'p2', name: 'Pappa', role: 'parent' },
      { id: 'k1', name: 'Adelen' },
      { id: 'k2', name: 'Celine' },
      { id: 'k3', name: 'Vanessa' },
    ],
    parents: [
      { id: 'p1', name: 'Mamma', avatarId: 'fox' },
      { id: 'p2', name: 'Pappa', avatarId: 'fox' },
    ],
    members: [],
    appById: apps,
    dashboardApps: Object.values(apps),
    assistantSuggestions: [
      { id: 'a1', icon: 'checkmark-circle', color: '#16a34a', text: 'Husk gymtøy i morgen' },
      { id: 'a2', icon: 'calendar', color: '#7c3aed', text: 'Tronny har bursdag i dag' },
    ],
    rewardBalance: 36,
    rewardHint: '64 kr igjen denne uken',
    weekGoals: [
      { id: 'g1', title: 'Være snill', done: true },
      { id: 'g2', title: 'Lese bok', done: true },
      { id: 'g3', title: 'Hjelpe hjemme' },
    ],
    kidProgress: [
      { kidId: 'k1', name: 'Adelen', doneToday: 0, todayTotal: 1, pct: 0, avatarId: 'fox' },
      { kidId: 'k2', name: 'Celine', doneToday: 0, todayTotal: 0, pct: 0, avatarId: 'bear' },
      { kidId: 'k3', name: 'Vanessa', doneToday: 2, todayTotal: 3, pct: 67, avatarId: 'cat' },
    ],
    bottomShortcutIds: ['home', 'plan', 'family', 'more'],
    dayPart: resolvedPart,
    heroArt: resolveThemeHeroArt(theme, now),
    accentArt: resolveThemeAccentArt(theme, now),
    backgroundArt: resolveThemeBackgroundArt(theme, now),
  };
}
