/**
 * Familieproduktet (barnekontoer, familie, skole og lekser, lag, klasse, menighet, barnehage,
 * familiespill, måltider, familieposisjon) ligger fortsatt i kodebasen, men er ikke en del av
 * ProTop (L-35). Barnekontoer har ingen vilkårsgodkjenning fra foresatte (GDPR art. 8,
 * aldersgrense 13 år i Norge), så i ProTop-bygget kan ingenting av det nås:
 * - ruter og lenker til familieskjermene går til Hjem (linking.js og navigasjonsvakten i App.jsx),
 * - familiesidene under Meny (/hjem/apper/…) vises ikke (MoreHubScreen),
 * - barnekontoer (brukernavn-innlogging) kan ikke logge inn,
 * - invitasjoner til familie, lag og klasse og spillinvitasjoner vises ikke, og en
 *   invitasjonslenke til dem kan bare avslås,
 * - posisjonsdeling er av.
 * Et eget bygg for familieproduktet slår alt på igjen med EXPO_PUBLIC_FAMILY_PRODUCT=1.
 * Koden er ikke slettet.
 */
import { isCompanyGroupType } from '../utils/groupInviteLogic.js';

// Leses bokstavelig, så Expo bygger verdien inn (ikke satt i deploy-hosting.yml = av).
export const FAMILY_PRODUCT_ENABLED = String(process.env.EXPO_PUBLIC_FAMILY_PRODUCT || '') === '1';

/** Skjermer (rutenavn i App.jsx) som bare hører til familieproduktet. */
export const FAMILY_PRODUCT_ROUTES = new Set([
  // Barn og familie
  'AddMember', 'AddChild', 'AddParent', 'AddFamily', 'ChildList', 'ChildProfile', 'ChildDashboard',
  'FamilyDashboard', 'ChildSchedule', 'ChildSettings', 'ChoreSettings', 'StarGoals', 'CustodySettings',
  'ChildDashboardThemeSettings', 'ChildDashboardThemeGallery', 'AddNote', 'Activities', 'ActivityDetail',
  'FamilyProgress', 'LocationSettings', 'Bookshelf', 'AddBook', 'BookDetail', 'MealDetail',
  // Skole og lekser
  'Leksehjelp', 'Mattehjelp', 'Lekser', 'SchoolFolder', 'Klassen', 'KlassenDetail',
  // Familiespill
  'FamilyGames', 'GamePreview', 'TicTacToe', 'RockPaperScissors', 'GuessNumber', 'DrawGuess', 'Chess',
  'Memory', 'LocalPlay',
  // Lag, klasse, vennegjeng, menighet, barnehage og grupper
  'TeamHome', 'TeamJoin', 'TeamCreate', 'TeamComposePost', 'TeamCreateEvent', 'TeamAddMember',
  'ClassroomHome', 'ClassroomJoin', 'ClassroomCreate', 'ClassroomComposeMessage', 'ClassroomClassworkEditor',
  'ClassroomAssignmentDetail', 'ClassroomAddStaff', 'ClassroomAddStudents', 'ClassroomStudentMap',
  'FriendsHome', 'FriendsJoin', 'FriendsComposePost', 'FriendsCreateEvent',
  'CongregationHome', 'CongregationJoin', 'CongregationComposePost', 'CongregationCreateEvent',
  'DaycareHome', 'DaycareJoin', 'DaycareCreateAnnouncement',
  'GroupHome', 'GroupJoin', 'GroupComposePost', 'GroupCreateEvent',
]);

/** Familiesider under Meny (/hjem/apper/…, MoreHubScreen). */
export const FAMILY_PRODUCT_MORE_VIEWS = new Set([
  'shop', 'wishes', 'books', 'lekser', 'childApps', 'activities', 'location', 'meals', 'recipes', 'pantry',
  'matcoach', 'albums', 'holdings', 'boligmappa', 'wall', 'childDrawings', 'progress', 'games', 'quiz',
  'scratchMap', 'reiseplanlegger', 'familyTree', 'rememberDates', 'hospitality', 'klassen',
]);

export const FAMILY_PRODUCT_UNAVAILABLE = 'Barnekontoer og familiefunksjoner finnes ikke i ProTop.';

export function isFamilyProductRoute(name, enabled = FAMILY_PRODUCT_ENABLED) {
  return !enabled && FAMILY_PRODUCT_ROUTES.has(String(name || ''));
}

export function isFamilyProductMoreView(subView, enabled = FAMILY_PRODUCT_ENABLED) {
  return !enabled && FAMILY_PRODUCT_MORE_VIEWS.has(String(subView || ''));
}

/** Første familieskjerm i en navigasjonstilstand (også nøstede), eller null. */
export function blockedFamilyProductRoute(state, enabled = FAMILY_PRODUCT_ENABLED) {
  if (enabled || !state || !Array.isArray(state.routes)) return null;
  for (const route of state.routes) {
    if (isFamilyProductRoute(route?.name, enabled)) return route.name;
    const open = route?.params?.openShell;
    if (open?.tab === 'more' && isFamilyProductMoreView(open.subView, enabled)) return `more/${open.subView}`;
    const nested = blockedFamilyProductRoute(route?.state, enabled);
    if (nested) return nested;
  }
  return null;
}

/** Lenke til en familieskjerm åpner Hjem i stedet. */
export function guardFamilyProductState(state, enabled = FAMILY_PRODUCT_ENABLED) {
  return blockedFamilyProductRoute(state, enabled) ? { routes: [{ name: 'Home' }] } : state;
}

/** Bare bedriftsinvitasjoner kan godtas i ProTop (ikke familie, lag eller klasse). */
export function groupInviteAllowed(groupType, enabled = FAMILY_PRODUCT_ENABLED) {
  return enabled || isCompanyGroupType(groupType);
}

/** Barnekontoer (brukernavn-innlogging med syntetisk e-post) kan ikke logge inn i ProTop. */
export function childLoginAllowed(enabled = FAMILY_PRODUCT_ENABLED) {
  return !!enabled;
}
