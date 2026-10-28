/**
 * Låst bedriftsforside på telefon. Nettbrett/PC beholder bedriftsoversikten.
 * Privat hjem beholder egne widgets. Bakgrunnsbildet er det samme lageret.
 */

export const COMPANY_HOME_SHORTCUTS = [
  { id: 'time', label: 'Timeføring', icon: 'time-outline', tab: 'timeliste', subView: null },
  { id: 'absence', label: 'Fravær/Ferie', icon: 'people-outline', tab: 'ansatte', subView: null, intent: { type: 'openMyAbsence' } },
  { id: 'tasks', label: 'Gjøremål', icon: 'checkbox-outline', tab: 'stars', subView: null },
  { id: 'expense', label: 'Utlegg', icon: 'receipt-outline', tab: 'okonomi', subView: 'utlegg' },
];

export const COMPANY_BOTTOM_NAV = [
  { id: 'home', label: 'Hjem', icon: 'home-outline', iconActive: 'home', action: { type: 'tab', tab: 'home' } },
  { id: 'projects', label: 'Prosjekter', icon: 'business-outline', action: { type: 'tab', tab: 'projects' } },
  { id: 'timeliste', label: 'Timer', icon: 'time-outline', action: { type: 'tab', tab: 'timeliste' } },
  { id: 'stars', label: 'Oppgaver', icon: 'create-outline', action: { type: 'tab', tab: 'stars' } },
  { id: 'more', label: 'Mer', icon: 'menu-outline', action: { type: 'tab', tab: 'more' } },
];

export function companyGreetingHello(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 11) return 'God morgen';
  if (hour >= 11 && hour < 17) return 'God ettermiddag';
  if (hour >= 17 && hour < 22) return 'God kveld';
  return 'Hei';
}

export function companyHomeName(profile) {
  return String(profile?.name || profile?.displayName || '').trim();
}

export function companyTaskBadge(task) {
  const direct = Number(task?.badge ?? task?.count);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const match = String(task?.title || task?.name || '').match(/\((\d+)\)\s*$/);
  return match ? Number(match[1]) : 0;
}

/**
 * Åpne gjøremål som hører til dagen, samme synlighet som privat oppgaveliste.
 * `visibleOnDate` og `isOpen` injiseres så modellen ikke drar inn Firestore.
 */
export function companyHomeTaskRows(tasks, today, viewer, {
  visibleToUser = () => true,
  visibleOnDate = () => true,
  isOpen = () => true,
} = {}) {
  return (tasks || [])
    .filter((task) => visibleToUser(task, viewer))
    .filter((task) => visibleOnDate(task, today, today))
    .filter((task) => isOpen(task, today))
    .slice(0, 8)
    .map((task) => ({
      id: task.id,
      title: String(task.title || task.name || 'Gjøremål'),
      badge: companyTaskBadge(task),
    }));
}
