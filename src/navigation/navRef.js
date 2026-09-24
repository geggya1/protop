import { tryOpenChatInDock } from '../utils/chatDockBridge';
import { requestBirthdayPrepResume } from '../utils/birthdayPrepBridge';
import { isFriendChatNavPayload, friendUidFromNavPayload } from '../utils/friendsLogic';
import { GAME_TYPE_SCREENS } from '../utils/familyGamesShared';
import { gameInviteNavParams } from '../utils/gameInviteNav';
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

export { gameInviteNavParams };

function shellForEvent(eventType) {
  if (eventType === 'taskReceived') return { tab: 'stars' };
  if (eventType === 'choreReceived') return { tab: 'chores' };
  if (eventType === 'eventCreated') return { tab: 'plan' };
  if (eventType === 'noteShared') return { tab: 'notes' };
  if (eventType === 'wishReserved' || eventType === 'wishPurchased' || eventType === 'wishShared') {
    return { tab: 'more', subView: 'wishes' };
  }
  if (eventType === 'messageReceived') return { tab: 'chat' };
  if (eventType === 'familyInvite') return null;
  if (eventType === 'gameInvite') return { tab: 'more', subView: 'games' };
  if (eventType === 'attestPending') return { tab: 'more', subView: 'progress', intent: 'attest' };
  if (eventType === 'birthdayReminder') return { tab: 'home' };
  if (eventType === 'boligReminder') return { tab: 'more', subView: 'boligmappa' };
  return null;
}

function navigateGameInvite(nav, payload) {
  const type = payload.gameType;
  const params = gameInviteNavParams(payload);
  // Open the online invite hub so pending invites can be accepted — do not jump
  // into a gameId the invitee has not joined yet.
  if (type === 'quiz') {
    nav.navigate('Home', { openShell: { tab: 'more', subView: 'quiz' } });
    return true;
  }
  const screen = GAME_TYPE_SCREENS[type];
  if (screen) {
    nav.navigate(screen, params);
    return true;
  }
  nav.navigate('Home', { openShell: { tab: 'more', subView: 'games' } });
  return true;
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
  if (payload.eventType === 'gameInvite') {
    return navigateGameInvite(nav, payload);
  }
  if (payload.eventType === 'birthdayReminder') {
    // Gjenåpne forberedelses-popup; fallback til Husk dato.
    if (requestBirthdayPrepResume(payload)) {
      try { nav.navigate('Home'); } catch { /* ignore */ }
      return true;
    }
    nav.navigate('Home', { openShell: { tab: 'more', subView: 'rememberDates' } });
    return true;
  }
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
