import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import { isAuthEntryPath, resolveAuthEntryLinkState } from './authEntryPaths';
import { queueChatDockThread } from '../utils/chatDockBridge';
import { parseFriendAddUsername } from '../utils/friendsLogic';
import { persistPendingAddFriend } from '../utils/pendingAddFriend';
import { GAME_TYPE_SCREENS } from '../utils/familyGamesShared';
import { gameInviteNavParams } from '../utils/gameInviteNav';

export { isAuthEntryPath, AUTH_ENTRY_PATHS } from './authEntryPaths';

export const prefixes = [
  'https://protop.no',
  'https://www.protop.no',
  'https://protop-c189c.web.app',
  'https://protop-c189c.firebaseapp.com',
  Linking.createURL('/'),
];

let linkingSignedIn = false;

/** Keep linking in sync with Firebase auth so /signup cannot remount AuthChoice. */
export function setLinkingSignedIn(next) {
  linkingSignedIn = !!next;
}

/** Friend DM deep link → ChatDock on web (never full-screen FriendChatThread). */
function parseFriendChatFromPath(path) {
  const raw = String(path || '');
  const pathOnly = raw.split('?')[0] || '';
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const m = pathOnly.match(/\/?my-friends\/chat\/([^/?#]+)/i);
  if (!m) return null;
  let chatId = '';
  try { chatId = decodeURIComponent(m[1]); } catch { chatId = m[1]; }
  if (!chatId) return null;
  let title = params.get('title') || '';
  if (title) {
    try { title = decodeURIComponent(title); } catch { /* keep raw */ }
  }
  return {
    chatId,
    friendUid: params.get('friendUid') || '',
    title,
  };
}

function rewriteWebPathToHome() {
  if (typeof window === 'undefined' || !window.history?.replaceState) return;
  try {
    const next = `${window.location.origin}/hjem`;
    if (window.location.pathname !== '/hjem') {
      window.history.replaceState(window.history.state || {}, '', next);
    }
  } catch { /* ignore */ }
}

function parseFamilyInviteFromPath(path) {
  const raw = String(path || '');
  const pathOnly = raw.split('?')[0] || '';
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  let familyId = params.get('familyId') || '';
  let inviteId = params.get('familyInvite') || params.get('inviteId') || '';
  const m = pathOnly.match(/\/?family-invite\/([^/?#]+)\/([^/?#]+)/i);
  if (m) {
    familyId = familyId || decodeURIComponent(m[1]);
    inviteId = inviteId || decodeURIComponent(m[2]);
  }
  if (familyId && inviteId) return { familyId, inviteId };
  return null;
}

function parseFriendInviteFromPath(path) {
  const raw = String(path || '');
  const pathOnly = raw.split('?')[0] || '';
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  let requestId = params.get('friendInvite') || params.get('requestId') || '';
  const m = pathOnly.match(/\/?friend-invite\/([^/?#]+)/i);
  if (m) requestId = requestId || decodeURIComponent(m[1]);
  if (requestId) return { requestId, token: params.get('token') || '' };
  return null;
}

/** /game-invite/:gameType/:gameId?familyId=… — open online hub to accept. */
function parseGameInviteFromPath(path) {
  const raw = String(path || '');
  const pathOnly = raw.split('?')[0] || '';
  const query = raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '';
  const params = new URLSearchParams(query);
  const m = pathOnly.match(/\/?game-invite\/([^/?#]+)(?:\/([^/?#]+))?/i);
  if (!m) return null;
  let gameType = '';
  let gameId = '';
  try { gameType = decodeURIComponent(m[1] || ''); } catch { gameType = m[1] || ''; }
  try { gameId = m[2] ? decodeURIComponent(m[2]) : ''; } catch { gameId = m[2] || ''; }
  if (!gameType) return null;
  return {
    gameType,
    gameId: gameId || params.get('gameId') || '',
    familyId: params.get('familyId') || '',
  };
}

function parseAddFriendFromPath(path) {
  const username = parseFriendAddUsername(path);
  if (username) return { username };
  return null;
}

export const linking = {
  prefixes,
  getStateFromPath(path, options) {
    const invite = parseFamilyInviteFromPath(path);
    if (invite) {
      return {
        routes: [
          { name: 'Home' },
          {
            name: 'FamilyInviteRespond',
            params: { familyId: invite.familyId, inviteId: invite.inviteId },
          },
        ],
      };
    }
    const friendInvite = parseFriendInviteFromPath(path);
    if (friendInvite) {
      return {
        routes: [
          { name: 'Home' },
          {
            name: 'FriendInviteRespond',
            params: { requestId: friendInvite.requestId },
          },
        ],
      };
    }
    const gameInvite = parseGameInviteFromPath(path);
    if (gameInvite?.gameType) {
      const screen = GAME_TYPE_SCREENS[gameInvite.gameType];
      const params = gameInviteNavParams({
        familyId: gameInvite.familyId,
        gameId: gameInvite.gameId,
      });
      if (screen) {
        return {
          routes: [
            { name: 'Home' },
            { name: screen, params },
          ],
        };
      }
      return {
        routes: [{ name: 'Home', params: { openShell: { tab: 'more', subView: 'games' } } }],
      };
    }
    const addFriend = parseAddFriendFromPath(path);
    if (addFriend) {
      persistPendingAddFriend(addFriend.username);
      if (linkingSignedIn) {
        return { routes: [{ name: 'Home' }] };
      }
      return {
        routes: [{
          name: 'AuthChoice',
          params: { addFriend: addFriend.username },
        }],
      };
    }
    // Web: friend chat deep links open ChatDock on Home — never the old full-screen thread.
    if (Platform.OS === 'web') {
      const friendChat = parseFriendChatFromPath(path);
      if (friendChat?.chatId) {
        queueChatDockThread({
          kind: 'friend',
          friendUid: friendChat.friendUid || null,
          chatId: friendChat.chatId,
          title: friendChat.title || 'Chat',
          memberIds: friendChat.friendUid ? [friendChat.friendUid] : [],
        });
        rewriteWebPathToHome();
        return { routes: [{ name: 'Home' }] };
      }
    }
    // After Google/Apple/Microsoft from /signup, URL often stays on signup while
    // RootNav enters app stage. Linking must not force AuthChoice again.
    const authOverride = resolveAuthEntryLinkState(path, { signedIn: linkingSignedIn });
    if (authOverride) return authOverride;
    return defaultGetStateFromPath(path, options);
  },
  config: {
    screens: {
      // Must be unique: we can't have both Welcome and Home matching the root path ('')
      Welcome: 'start',
      Register: {
        path: 'register',
        parse: {
          email: (v) => (v ? String(v) : ''),
          familyId: (v) => (v ? String(v) : ''),
          phone: (v) => (v ? String(v) : ''),
          friendInvite: (v) => (v ? String(v) : ''),
          addFriend: (v) => (v ? String(v) : ''),
        },
      },
      AuthChoice: {
        path: 'signup',
        parse: {
          addFriend: (v) => (v ? String(v) : ''),
        },
      },
      Login: {
        path: 'login',
        parse: {
          addFriend: (v) => (v ? String(v) : ''),
        },
      },
      PickLanguage: 'language',
      Legal: 'legal',
      ProfileSetup: 'profile-setup',
      HomeSetupOnboarding: 'home-setup',
      GetStarted: 'get-started',
      CreateGroup: 'groups/new',
      GroupHub: 'groups/:familyId',
      AddMember: 'groups/:familyId/members/new',
      GroupSettings: 'groups/:familyId/settings',
      MemberSettings: 'groups/:familyId/member/:memberId',
      FamilyInviteRespond: {
        path: 'family-invite/:familyId/:inviteId',
        parse: {
          familyId: (v) => (v ? String(v) : ''),
          inviteId: (v) => (v ? String(v) : ''),
        },
      },
      FriendInviteRespond: {
        path: 'friend-invite/:requestId',
        parse: {
          requestId: (v) => (v ? String(v) : ''),
        },
      },
      // Peer-venner (personlig) — must not collide with Vennegjeng FriendsHome at `friends`.
      // Deep link add-friend/:username is handled in getStateFromPath above.
      AddFriend: 'my-friends/add',
      FriendQr: 'my-friends/qr',
      FriendsHub: 'my-friends',
      FriendChatThread: {
        path: 'my-friends/chat/:chatId',
        parse: {
          chatId: (v) => (v ? String(v) : ''),
          friendUid: (v) => (v ? String(v) : ''),
          title: (v) => {
            if (!v) return '';
            try { return decodeURIComponent(String(v)); } catch { return String(v); }
          },
        },
      },
      Archive: 'archive',
      ProfileSettings: 'settings/profile',
      AppearanceSettings: 'settings/appearance',
      CalendarSettings: 'settings/calendar',
      CustodySettings: {
        path: 'settings/custody/:childId',
        parse: {
          childId: String,
          familyId: String,
          childName: String,
        },
      },
      CalendarOAuthRedirect: 'oauth/calendar',
      StravaOAuthRedirect: 'oauth/strava',
      AirbnbOAuthRedirect: 'oauth/airbnb',
      RegisterInvitedUser: 'register-invited',
      ForgotPassword: 'forgot-password',
      VerifyEmail: {
        path: 'verify-email',
        parse: {
          vt: String,
          oobCode: String,
        },
      },
      Confirmation: 'confirmation',
      // Marketing site owns `/`. Logged-in family home lives at /hjem.
      Home: 'hjem',
      TeamHome: 'teams',
      TeamJoin: 'teams/join',
      TeamCreate: 'teams/new',
      TeamComposePost: 'teams/post/new',
      TeamCreateEvent: 'teams/event/new',
      ClassroomHome: 'classroom',
      ClassroomJoin: 'classroom/join',
      ClassroomCreate: 'classroom/new',
      ClassroomComposeMessage: 'classroom/message/new',
      ClassroomClassworkEditor: 'classroom/classwork/edit',
      ClassroomAssignmentDetail: 'classroom/classwork/:classworkId',
      ClassroomAddStaff: 'classroom/staff/new',
      ClassroomAddStudents: 'classroom/students/new',
      ClassroomStudentMap: 'classroom/map/:studentId',
      FriendsHome: 'friends',
      CongregationHome: 'congregation',
      DaycareHome: 'daycare',
      GroupHome: 'group',
      FriendsJoin: 'friends/join',
      CongregationJoin: 'congregation/join',
      DaycareJoin: 'daycare/join',
      GroupJoin: 'group/join',
      ChatThread: 'chat/:chatId',
      EventForm: 'event/new',
      FamilyOverview: 'organisasjoner',
      FamilyDashboard: 'family/:familyId',
      AddFamily: 'families/new',
      AddChild: 'families/:familyId/add-child',
      AddParent: 'families/:familyId/add-parent',
      ChildList: 'families/:familyId/children',
      Templates: 'templates',
      Profile: 'profile',
      ChildProfile: 'child/:childId',
      ParentProfile: 'parent/:parentId',
      SelectFamilyScreen: 'select-family',
      AddTodo: 'todo/new',
      AddNote: 'note/new',
      Activities: 'activities/:familyId',
      ActivityDetail: 'activities/:familyId/:activityId',
      ChildDashboard: 'child/:familyId',
      ChildSchedule: {
        path: 'ukeplan',
        parse: {
          familyId: (v) => (v ? String(v) : ''),
          childId: (v) => (v ? String(v) : ''),
          childName: (v) => (v ? String(v) : ''),
          canEdit: (v) => v === true || v === 'true',
        },
      },
      Lekser: {
        path: 'lekser',
        parse: {
          familyId: (v) => (v ? String(v) : ''),
          childId: (v) => (v ? String(v) : ''),
          childName: (v) => (v ? String(v) : ''),
          canEdit: (v) => v === true || v === 'true',
        },
      },
      Mattehjelp: {
        path: 'mattehjelp',
        parse: {
          familyId: (v) => (v ? String(v) : ''),
          childId: (v) => (v ? String(v) : ''),
        },
      },
      Leksehjelp: {
        path: 'leksehjelp',
        parse: {
          familyId: (v) => (v ? String(v) : ''),
          childId: (v) => (v ? String(v) : ''),
        },
      },
      Klassen: {
        path: 'klassen',
        parse: {
          familyId: (v) => (v ? String(v) : ''),
          childId: (v) => (v ? String(v) : ''),
          childName: (v) => (v ? String(v) : ''),
        },
      },
      KlassenDetail: {
        path: 'klassen/:classId',
        parse: {
          familyId: (v) => (v ? String(v) : ''),
          classId: (v) => (v ? String(v) : ''),
          childId: (v) => (v ? String(v) : ''),
          childName: (v) => (v ? String(v) : ''),
        },
      },
      AddHomework: 'lekse/ny',
      AiImportReview: {
        path: 'import-ukeplan',
        parse: {
          familyId: (v) => (v ? String(v) : ''),
          childId: (v) => (v ? String(v) : ''),
          childName: (v) => (v ? String(v) : ''),
          autoStart: (v) => (v ? String(v) : ''),
          returnToSchedule: (v) => v === true || v === 'true',
          returnToHomework: (v) => v === true || v === 'true',
          focusMode: (v) => (v ? String(v) : ''),
        },
      },
      __KeepAlive: '__keepalive',
    },
  },
  documentTitle: {
    formatter: (options, route) => {
      const base = 'ProTop';
      const title = options?.title ?? route?.name;
      return title ? `${title} — ${base}` : base;
    },
  },
};
