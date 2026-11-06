import * as Linking from 'expo-linking';
import { Platform } from 'react-native';
import { getPathFromState as defaultGetPathFromState, getStateFromPath as defaultGetStateFromPath } from '@react-navigation/native';
import { isAuthEntryPath, resolveAuthEntryLinkState } from './authEntryPaths';
import { queueChatDockThread } from '../utils/chatDockBridge';
import { parseFriendAddUsername } from '../utils/friendsLogic';
import { persistPendingAddFriend } from '../utils/pendingAddFriend';
import { formatWebDocumentTitle } from './webDocumentTitle';
import { linkingPrefixes } from '../utils/hostingChannel';
import { captureAgreementLinkFromLocation, withAgreementQuery } from '../anbud/agreementLink';
import { indexLinkFromPath } from '../indeksregulering/indexLink';
import { homePathForLinking, shellLinkState } from './shellPaths';
import { legacyNewNoteState, legacyRegisterInvitedState } from './legacyPaths.js';
import { parseFriendInviteFromPath, registerFriendInviteParams } from './friendInviteLinks.js';
import { guardFamilyProductState } from './familyProduct.js';
import { helpdeskLinkTarget, helpdeskShellOpen } from '../helpdesk/shellLink.js';

export { isAuthEntryPath, AUTH_ENTRY_PATHS } from './authEntryPaths';

export const prefixes = [
  ...linkingPrefixes(typeof window !== 'undefined' ? window.location?.origin : ''),
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

function parseAddFriendFromPath(path) {
  const username = parseFriendAddUsername(path);
  if (username) return { username };
  return null;
}

/** /hjelp-lenker fra e-post og meny → intent til hjelpesenteret. */
export function helpCenterLinkIntent(path) {
  const raw = String(path || '');
  const pathOnly = raw.split('?')[0].replace(/\/+$/, '');
  const m = pathOnly.match(/^\/?hjelp(?:\/(sak|artikkel|ny|saker|assistent)(?:\/([^/?#]+))?)?$/i);
  if (!m) return null;
  const params = new URLSearchParams(raw.includes('?') ? raw.slice(raw.indexOf('?') + 1) : '');
  let id = '';
  try { id = m[2] ? decodeURIComponent(m[2]) : ''; } catch { id = m[2] || ''; }
  const kind = (m[1] || '').toLowerCase();
  if (kind === 'sak' && id) return { type: 'helpdesk', view: 'ticket', id, rate: params.get('vurder') ? (params.get('svar') || 'ask') : null };
  if (kind === 'artikkel' && id) return { type: 'helpdesk', view: 'article', id };
  if (kind === 'ny') return { type: 'helpdesk', view: 'new' };
  if (kind === 'saker') return { type: 'helpdesk', view: 'tickets' };
  if (kind === 'assistent') return { type: 'helpdesk', view: 'assistant' };
  return { type: 'helpdesk', view: 'home' };
}

export const linking = {
  prefixes,
  getPathFromState(state, options) {
    // Web: når Hjem har fokus, eier skallet stien (/hjem/iso/avvik). Den skal ikke nullstilles til /hjem.
    const top = state?.routes?.[state.index ?? (state.routes?.length || 1) - 1];
    if (Platform.OS === 'web' && top?.name === 'Home' && !top.state) {
      return withAgreementQuery(homePathForLinking(typeof window !== 'undefined' ? window.location?.pathname : ''));
    }
    return withAgreementQuery(defaultGetPathFromState(state, options));
  },
  getStateFromPath(path, options) {
    // Familieproduktet er ikke med i ProTop: lenker til familieskjermene åpner Hjem (L-35).
    return guardFamilyProductState(linking.resolveStateFromPath(path, options));
  },
  /** Tilstanden for en adresse, før vakten for familieproduktet. */
  resolveStateFromPath(path, options) {
    try { captureAgreementLinkFromLocation(path); } catch { /* ignore */ }
    const indexLink = indexLinkFromPath(path);
    if (indexLink) {
      return {
        routes: [{
          name: 'Home',
          params: { openShell: indexLink },
        }],
      };
    }
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
    // Venneinvitasjon til ny e-post: registreringen beholder token og e-post (SOS-01).
    const registerInvite = registerFriendInviteParams(path);
    if (registerInvite && !linkingSignedIn) {
      return { routes: [{ name: 'Register', params: registerInvite }] };
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
    // Tilbudsarbeid: /anbud/tilbud/:bidId
    const anbudBid = String(path || '').match(/^\/?anbud\/tilbud\/([^/?#]+)/i);
    if (anbudBid?.[1]) {
      let bidId = anbudBid[1];
      try { bidId = decodeURIComponent(bidId); } catch { /* keep raw */ }
      return {
        routes: [{
          name: 'Home',
          params: {
            openShell: {
              tab: 'anbud',
              subView: 'tilbud',
              intent: { type: 'openBid', bidId },
            },
          },
        }],
      };
    }
    // Kundeundersøkelse: /svar/:lenke er svarsiden, uten innlogging og også for innloggede.
    const surveyAnswer = String(path || '').match(/^\/?svar\/([A-Za-z0-9_-]{20,100})/);
    if (surveyAnswer?.[1]) {
      return { routes: [{ name: 'SurveyAnswer', params: { token: surveyAnswer[1] } }] };
    }
    // Helpdesk-portalen: /helpdesk og /helpdesk/sak/:id. Innlogget åpnes den i skallet
    // (samme topplinje, meny og rammeverk som resten av ProTop); ellers innloggingen.
    const helpdeskLink = helpdeskLinkTarget(path);
    if (helpdeskLink && linkingSignedIn) {
      return { routes: [{ name: 'Home', params: { openShell: helpdeskShellOpen(helpdeskLink.ticketId) } }] };
    }
    if (helpdeskLink?.ticketId) {
      return { routes: [{ name: 'Helpdesk', params: { ticketId: helpdeskLink.ticketId } }] };
    }
    // Hjelpesenteret: /hjelp, /hjelp/ny, /hjelp/saker, /hjelp/sak/:id, /hjelp/artikkel/:id (lenker i e-post).
    const help = helpCenterLinkIntent(path);
    if (help && linkingSignedIn) {
      return { routes: [{ name: 'Home', params: { openShell: { tab: 'more', subView: 'help', intent: help } } }] };
    }
    // Gamle adresser: /register-invited → registrering, /note/new → Notater, nytt notat.
    const legacyRegister = legacyRegisterInvitedState(path, { signedIn: linkingSignedIn });
    if (legacyRegister) return legacyRegister;
    const legacyNote = legacyNewNoteState(path);
    if (legacyNote) return legacyNote;
    // After Google/Apple/Microsoft from /signup, URL often stays on signup while
    // RootNav enters app stage. Linking must not force AuthChoice again.
    const authOverride = resolveAuthEntryLinkState(path, { signedIn: linkingSignedIn });
    if (authOverride) return authOverride;
    // Skallet: /hjem/fane/underside åpner fanen i Hjem. Ved tilbake beholdes Hjem-rutens nøkkel, så skallet ikke lastes på nytt.
    if (Platform.OS === 'web') {
      const shell = shellLinkState(path);
      if (shell) return shell;
    }
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
          email: (v) => (v ? String(v) : ''),
          familyId: (v) => (v ? String(v) : ''),
        },
      },
      PickLanguage: 'language',
      Legal: 'legal',
      // Offentlige lenker til dokumentene (app.config, butikkoppføringer og Innstillinger).
      LegalDoc: {
        path: ':doc(personvern|vilkar|databehandleravtale)',
        parse: {
          doc: (v) => ({ personvern: 'privacy', vilkar: 'terms', databehandleravtale: 'dpa' }[v] || 'terms'),
        },
        stringify: {
          doc: (v) => ({ privacy: 'personvern', terms: 'vilkar', dpa: 'databehandleravtale' }[v] || 'vilkar'),
        },
      },
      ProfileSetup: 'profile-setup',
      HomeSetupOnboarding: 'home-setup',
      GetStarted: 'get-started',
      CreateGroup: 'groups/new',
      GroupHub: 'groups/:familyId',
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
      NotificationSettings: 'settings/notifications',
      AppearanceSettings: 'settings/appearance',
      CalendarSettings: 'settings/calendar',
      CalendarOAuthRedirect: 'oauth/calendar',
      ForgotPassword: 'forgot-password',
      VerifyEmail: {
        path: 'verify-email',
        parse: {
          vt: String,
          oobCode: String,
        },
      },
      Confirmation: 'confirmation',
      // Auth-frie forhåndsvisninger (samme path som welcomePathEntry i App.jsx).
      FakturaDemo: 'faktura-demo',
      HelpdeskDemo: 'helpdesk-demo',
      Helpdesk: 'helpdesk',
      SurveyAnswer: 'svar/:token',
      CustomerSurveyDemo: 'kundeundersokelse-demo',
      MeetingsDemo: 'moter-demo',
      AnbudDemo: 'anbud-demo',
      DashboardThemeGallery: 'dashboard-themes',
      // Marketing site owns `/`. Logged-in home lives at /hjem.
      Home: 'hjem',
      ChatThread: 'chat/:chatId',
      EventForm: 'event/new',
      FamilyOverview: 'organisasjoner',
      Templates: 'templates',
      Profile: 'profile',
      ParentProfile: 'parent/:parentId',
      SelectFamilyScreen: 'select-family',
      AddTodo: 'todo/new',
      __KeepAlive: '__keepalive',
    },
  },
  documentTitle: {
    enabled: true,
    formatter: () => formatWebDocumentTitle(),
  },
};
