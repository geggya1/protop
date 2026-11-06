import { tryOpenChatInDock } from '../utils/chatDockBridge';
import { isFriendChatNavPayload, friendUidFromNavPayload } from '../utils/friendsLogic';
import { auth } from '../../firebase';

let navRef = null;
const routeListeners = new Set();
let detachNavState = null;

function emitRoute() {
  let name = '';
  try { name = navRef?.getCurrentRoute?.()?.name || ''; } catch { name = ''; }
  routeListeners.forEach((fn) => fn(name));
}

export function setAppNav(ref) {
  if (detachNavState) detachNavState();
  detachNavState = null;
  navRef = ref;
  if (ref?.addListener) {
    detachNavState = ref.addListener('state', emitRoute);
  }
  emitRoute();
}

export function getAppNav() {
  return navRef;
}

export function currentRouteName() {
  try { return navRef?.getCurrentRoute?.()?.name || ''; } catch { return ''; }
}

export function subscribeAppRoute(fn) {
  routeListeners.add(fn);
  fn(currentRouteName());
  return () => routeListeners.delete(fn);
}


function shellForEvent(eventType) {
  if (eventType === 'taskReceived') return { tab: 'stars' };
  if (eventType === 'choreReceived') return { tab: 'chores' };
  if (eventType === 'eventCreated') return { tab: 'plan' };
  if (eventType === 'noteShared') return { tab: 'notes' };
  if (eventType === 'messageReceived') return { tab: 'chat' };
  if (eventType === 'familyInvite') return null;
  // Venneforespørsel (også en som er trukket tilbake) og godtatt forespørsel: Venner.
  if (eventType === 'friendInvite' || eventType === 'friendInviteAccepted') {
    return { tab: 'more', subView: 'friends' };
  }
  if (eventType === 'documentApproval' || eventType === 'documentComment') return { tab: 'skjema', intent: { type: 'docControl', tab: 'styring' } };
  if (eventType === 'documentPublished') return { tab: 'ansatte', intent: { type: 'myDocuments' } };
  // Medarbeiderundersøkelse: Min side, der skjemaet står.
  if (eventType === 'hrSurvey') return { tab: 'ansatte', intent: { type: 'mySurvey' } };
  // Medarbeidersamtalen: den ansatte forbereder og signerer på Min side; lederen følger opp i HR.
  if (eventType === 'hrReviewInvite') return { tab: 'ansatte', intent: { type: 'myDocuments' } };
  if (eventType === 'hrReviewUpdate') return { tab: 'hr', subView: 'oppfolging' };
  // Misfornøyd kunde: Kunder → Kundeundersøkelse, der oppfølgingen står.
  if (eventType === 'customerSurveyAlert') return { tab: 'kunder', subView: 'undersokelse' };
  // Forespørsel om å bli med i bedriften: Ansatte → Inviter brukere.
  if (eventType === 'companyJoinRequest') return { tab: 'ansatte', intent: { type: 'openInvite' } };
  // Tilknytning mellom selskaper: Bedrift → Underenheter, der avtalene godkjennes.
  if (eventType === 'intercompanyLink') return { tab: 'selskap', subView: 'underenheter' };
  if (eventType === 'companyMemberLeft') return { tab: 'ansatte' };
  if (eventType === 'birthdayReminder') return { tab: 'home' };
  return null;
}

export function navigateFromNotification(payload = {}) {
  const nav = navRef;
  if (!nav?.navigate) return false;
  if (payload.eventType === 'familyInvite' && payload.familyId && payload.inviteId) {
    nav.navigate('FamilyInviteRespond', {
      familyId: payload.familyId,
      inviteId: payload.inviteId,
    });
    return true;
  }
  // Spill, ønskelister og andre familievarsler finnes ikke i ProTop; de åpner Hjem (under).
  const chatId = payload.chatId;
  const familyId = payload.familyId;
  if (chatId) {
    const isFriend = isFriendChatNavPayload(payload);
    const myUid = auth.currentUser?.uid || null;
    const friendUid = isFriend ? friendUidFromNavPayload(payload, myUid) : null;
    const dockThread = isFriend
      ? {
        kind: 'friend',
        friendChat: true,
        friendUid,
        chatId,
        title: payload.title || 'Chat',
        memberIds: payload.memberIds || (friendUid && myUid ? [myUid, friendUid] : (friendUid ? [friendUid] : [])),
        notificationId: payload.notificationId || null,
      }
      : {
        familyId,
        chatId,
        title: payload.title || 'Chat',
      };
    if (tryOpenChatInDock(dockThread)) {
      return true;
    }
    if (isFriend) {
      nav.navigate('FriendChatThread', {
        chatId,
        friendUid,
        title: payload.title || 'Chat',
      });
      return true;
    }
    nav.navigate('ChatThread', { familyId, chatId, title: payload.title || 'Chat' });
    return true;
  }
  if (payload.taskId || payload.eventType === 'taskReceived') {
    nav.navigate('Home', { openShell: { tab: 'stars' } });
    return true;
  }
  if (payload.choreId || payload.eventType === 'choreReceived') {
    nav.navigate('Home', { openShell: { tab: 'chores' } });
    return true;
  }
  if (payload.eventId || payload.eventType === 'eventCreated') {
    nav.navigate('Home', { openShell: { tab: 'plan' } });
    return true;
  }
  if (payload.noteId || payload.eventType === 'noteShared') {
    nav.navigate('Home', { openShell: { tab: 'notes' } });
    return true;
  }
  if (payload.wishlistId || payload.wishId || payload.eventType === 'wishReserved'
    || payload.eventType === 'wishPurchased' || payload.eventType === 'wishShared') {
    nav.navigate('Home', { openShell: { tab: 'more', subView: 'wishes' } });
    return true;
  }
  if (payload.eventType === 'attestPending') {
    nav.navigate('Home', { openShell: { tab: 'more', subView: 'progress', intent: 'attest' } });
    return true;
  }
  const shell = shellForEvent(payload.eventType);
  if (shell) {
    nav.navigate('Home', { openShell: shell });
    return true;
  }
  return false;
}
