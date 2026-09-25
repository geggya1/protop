import 'react-native-gesture-handler';

import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, Alert, Platform, Text } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons, Feather } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { completeRedirectSignIn, isLikelyOauthReturn } from './src/utils/authProviders';
import { isCalendarOauthReturn } from './src/utils/calendarOAuthCapture';
import { markBiometricUnlocked } from './src/utils/biometricLock';
import { linking, setLinkingSignedIn, isAuthEntryPath } from './src/navigation/linking';
import { capturePendingAddFriendFromLocation, peekPendingAddFriend, persistPendingAddFriend } from './src/utils/pendingAddFriend';
import { platformHomeRoute } from './src/utils/groupTypes';
import {
  upgradeFamilyMembership,
  syncParentDocs,
  resolveChildFamilyId,
  resolveChildProfile,
  isChildEmail,
} from './src/utils/session';

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import RegisterInvitedUserScreen from './screens/RegisterInvitedUserScreen';
import VerifyEmailScreen from './screens/VerifyEmailScreen';
import ForgotPasswordScreen from './screens/ForgotPasswordScreen';
import FamilyOverviewScreen from './screens/FamilyOverviewScreen';
import FamilyDashboardScreen from './screens/FamilyDashboardScreen';
import ChildListScreen from './screens/ChildListScreen';
import TemplateListScreen from './screens/TemplateListScreen';
import ProfileScreen from './screens/ProfileScreen';
import ChildProfileScreen from './screens/ChildProfileScreen';
import ParentProfileScreen from './screens/ParentProfileScreen';
import ConfirmationScreen from './screens/ConfirmationScreen';
import SelectFamilyScreen from './screens/SelectFamilyScreen';
import ChildDashboardScreen from './screens/ChildDashboardScreen';
import ChildScheduleScreen from './screens/ChildScheduleScreen';
import ChildSettingsScreen from './screens/ChildSettingsScreen';
import ChoreSettingsScreen from './screens/v2/ChoreSettingsScreen';
import StarGoalsScreen from './screens/v2/StarGoalsScreen';
import AddTodoScreen from './screens/AddTodoScreen';
import AddNote from './screens/AddNote';
import ActivitiesScreen from './screens/ActivitiesScreen';
import ActivityDetailScreen from './screens/ActivityDetailScreen';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from './src/context/AppContext';
import { HelpProvider } from './src/context/HelpContext';
import { ModuleAccessProvider } from './src/context/ModuleAccessContext';
import HelpOverlay from './components/HelpOverlay';
import HelpModuleCard from './components/HelpModuleCard';
import ModuleActivationGate from './components/ModuleActivationGate';
import StackEdgeSwipe, { withStackEdgeSwipe } from './components/StackEdgeSwipe';
import { STACK_MODULE_IDS } from './src/modules/moduleActivationRegistry';
import { NotificationProvider } from './src/context/NotificationContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { AppearanceProvider } from './src/appearance/AppearanceContext';
import { setAppNav } from './src/navigation/navRef';
import { configurePushHandlers } from './src/utils/push';
import { I18nProvider, useI18n } from './src/i18n';
import AppShell from './components/AppShell';
import SessionOverlays from './components/SessionOverlays';
import { ChatDockProvider } from './src/context/ChatDockContext';
import TeamShell from './components/TeamShell';
import TeamJoinScreen from './screens/team/TeamJoinScreen';
import TeamCreateScreen from './screens/team/TeamCreateScreen';
import TeamComposePostScreen from './screens/team/TeamComposePostScreen';
import TeamCreateEventScreen from './screens/team/TeamCreateEventScreen';
import TeamAddMemberScreen from './screens/team/TeamAddMemberScreen';
import ClassroomShell from './components/ClassroomShell';
import {
  FriendsShell, CongregationShell, DaycareShell, GroupShell, CompanyShell,
} from './components/SocialPlatformShell';
import PlatformJoinScreen from './screens/platform/PlatformJoinScreen';
import CreateCompanyScreen from './screens/company/CreateCompanyScreen';
import PlatformComposePostScreen from './screens/platform/PlatformComposePostScreen';
import PlatformCreateEventScreen from './screens/platform/PlatformCreateEventScreen';
import ClassroomJoinScreen from './screens/classroom/ClassroomJoinScreen';
import ClassroomCreateScreen from './screens/classroom/ClassroomCreateScreen';
import ClassroomComposeMessageScreen from './screens/classroom/ClassroomComposeMessageScreen';
import ClassroomClassworkEditorScreen from './screens/classroom/ClassroomClassworkEditorScreen';
import ClassroomAssignmentDetailScreen from './screens/classroom/ClassroomAssignmentDetailScreen';
import ClassroomAddStaffScreen from './screens/classroom/ClassroomAddStaffScreen';
import ClassroomAddStudentsScreen from './screens/classroom/ClassroomAddStudentsScreen';
import ClassroomStudentMapScreen from './screens/classroom/ClassroomStudentMapScreen';
import ChatThreadScreen from './screens/v2/ChatThreadScreen';
import EventFormScreen from './screens/v2/EventFormScreen';
import ParentTaskScreen from './screens/v2/ParentTaskScreen';
import AddHomeworkScreen from './screens/AddHomeworkScreen';
import NotificationsScreen from './screens/v2/NotificationsScreen';
import SubscriptionScreen from './screens/v2/SubscriptionScreen';
import LocationSettingsScreen from './screens/v2/LocationSettingsScreen';
import WeatherSettingsScreen from './screens/v2/WeatherSettingsScreen';
import AppearanceSettingsScreen from './screens/v2/AppearanceSettingsScreen';
import DashboardThemeSettingsScreen from './screens/v2/DashboardThemeSettingsScreen';
import DashboardThemeGalleryScreen from './screens/v2/DashboardThemeGalleryScreen';
import ChildDashboardThemeSettingsScreen from './screens/v2/ChildDashboardThemeSettingsScreen';
import ChildDashboardThemeGalleryScreen from './screens/v2/ChildDashboardThemeGalleryScreen';
import FamilyProgressScreen from './screens/v2/FamilyProgressScreen';
import CalendarSettingsScreen from './screens/v2/CalendarSettingsScreen';
import CustodySettingsScreen from './screens/v2/CustodySettingsScreen';
import CalendarOAuthRedirectScreen from './screens/v2/CalendarOAuthRedirectScreen';
import StravaOAuthRedirectScreen from './screens/v2/StravaOAuthRedirectScreen';
import AirbnbOAuthRedirectScreen from './screens/v2/AirbnbOAuthRedirectScreen';
import AiChatScreen from './screens/v2/AiChatScreen';
import LeksehjelpScreen from './screens/v2/LeksehjelpScreen';
import MattehjelpScreen from './screens/v2/MattehjelpScreen';
import LekserHubScreen from './screens/v2/LekserHubScreen';
import SchoolFolderScreen from './screens/v2/SchoolFolderScreen';
import KlassenHubScreen from './screens/v2/KlassenHubScreen';
import KlassenDetailScreen from './screens/v2/KlassenDetailScreen';
import StackShellChrome from './components/StackShellChrome';
import FamilyGamesScreen from './screens/v2/FamilyGamesScreen';
import TicTacToeScreen from './screens/v2/TicTacToeScreen';
import RockPaperScissorsScreen from './screens/v2/RockPaperScissorsScreen';
import GuessNumberScreen from './screens/v2/GuessNumberScreen';
import DrawGuessScreen from './screens/v2/DrawGuessScreen';
import Connect4Screen from './screens/v2/Connect4Screen';
import LocalPlayScreen from './screens/v2/LocalPlayScreen';
import ChessScreen from './screens/v2/ChessScreen';
import MemoryScreen from './screens/v2/MemoryScreen';
import GamePreviewScreen from './screens/v2/GamePreviewScreen';
import AiImportReviewScreen from './screens/AiImportReviewScreen';
import BookshelfScreen from './screens/v2/BookshelfScreen';
import AddBookScreen from './screens/v2/AddBookScreen';
import BookDetailScreen from './screens/v2/BookDetailScreen';
import MealDetailScreen from './screens/v2/MealDetailScreen';
import LanguageScreen from './screens/onboarding/LanguageScreen';
import WelcomeScreen from './screens/onboarding/WelcomeScreen';
import LegalWizardScreen from './screens/onboarding/LegalWizardScreen';
import PrivacyTermsScreen from './screens/v2/PrivacyTermsScreen';
import LegalDocScreen from './screens/v2/LegalDocScreen';
import LicensesScreen from './screens/v2/LicensesScreen';
import AuthChoiceScreen from './screens/onboarding/AuthChoiceScreen';
import ProfileSetupScreen from './screens/onboarding/ProfileSetupScreen';
import HomeSetupOnboardingScreen from './screens/onboarding/HomeSetupOnboardingScreen';
import CreateGroupScreen, { GetStartedScreen } from './screens/onboarding/CreateGroupScreen';
import GroupHubScreen from './screens/GroupHubScreen';
import AddMemberScreen from './screens/AddMemberScreen';
import FamilyInviteRespondScreen from './screens/FamilyInviteRespondScreen';
import EditProfileScreen from './screens/v2/EditProfileScreen';
import FriendsHubScreen from './screens/v2/FriendsHubScreen';
import AddFriendScreen from './screens/v2/AddFriendScreen';
import FriendQrScreen from './screens/v2/FriendQrScreen';
import FriendChatThreadScreen from './screens/v2/FriendChatThreadScreen';
import FriendInviteRespondScreen from './screens/v2/FriendInviteRespondScreen';
import {
  GroupSettingsScreen, MemberSettingsScreen, ArchiveScreen,
} from './screens/settings/GroupSettingsScreen';
import { consentsComplete, loadLocalConsents, persistUserConsents } from './src/utils/consents';
import { APP_BUILD_ID } from './src/constants/build';
import { markPreferApp, clearPreferApp } from './src/utils/preferApp';
import { shouldRedirectStartUrlToMarketing } from './src/utils/authBootGate';
import {
  ensurePersonalShellForUser,
  isPersonalShell,
  isHomeSetupCompleteSession,
} from './src/utils/personalShell';

SplashScreen.preventAutoHideAsync().catch(() => {});

if (Platform.OS === 'web') {
  try { require('./app.web.css'); } catch {}
  // Unregister stale Expo/PWA workers that cache old bundles, but keep the
  // Web: keep push SW, unregister stale workers. Native: Expo notification handler.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => {
        const url = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || '';
        if (url.includes('push-sw.js') || url.includes('firebase-messaging-sw')) return;
        r.unregister();
      });
    });
  }
  configurePushHandlers().catch(() => {});
}

const Stack = createNativeStackNavigator();

function LoadingView({ label } = {}) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color="#2563eb" />
      {label ? (
        <Text style={{ marginTop: 14, color: '#64748b', fontSize: 14 }}>{label}</Text>
      ) : null}
    </View>
  );
}

function GatedStackScreen({ moduleId, children }) {
  const nav = useNavigation();
  const { requestShellTab } = useApp();
  return (
    <ModuleActivationGate
      moduleId={moduleId}
      onBack={() => {
        if (nav.canGoBack()) nav.goBack();
        else {
          nav.navigate('Home');
          requestShellTab?.('home');
        }
      }}
    >
      {children}
    </ModuleActivationGate>
  );
}

function gatedStackScreen(routeName, ScreenComponent) {
  const moduleId = STACK_MODULE_IDS[routeName];
  function Gated(props) {
    const inner = <ScreenComponent {...props} />;
    return (
      <StackEdgeSwipe>
        {moduleId ? <GatedStackScreen moduleId={moduleId}>{inner}</GatedStackScreen> : inner}
      </StackEdgeSwipe>
    );
  }
  Gated.displayName = `Gated(${routeName})`;
  return Gated;
}

function withStackShell(ScreenComponent, title, moduleId) {
  function Wrapped(props) {
    const inner = <ScreenComponent {...props} />;
    return (
      <StackShellChrome title={title} moduleId={moduleId || null}>
        {moduleId ? <GatedStackScreen moduleId={moduleId}>{inner}</GatedStackScreen> : inner}
      </StackShellChrome>
    );
  }
  Wrapped.displayName = `StackShell(${ScreenComponent.displayName || ScreenComponent.name || title})`;
  return Wrapped;
}

const ChoreSettingsWithGate = gatedStackScreen('ChoreSettings', ChoreSettingsScreen);
const FamilyGamesWithGate = gatedStackScreen('FamilyGames', FamilyGamesScreen);
const BookshelfWithGate = gatedStackScreen('Bookshelf', BookshelfScreen);
const ActivitiesWithGate = gatedStackScreen('Activities', ActivitiesScreen);
const ActivityDetailWithGate = gatedStackScreen('ActivityDetail', ActivityDetailScreen);
const StarGoalsWithGate = gatedStackScreen('StarGoals', StarGoalsScreen);
const FamilyProgressWithGate = gatedStackScreen('FamilyProgress', FamilyProgressScreen);
const LocationSettingsWithGate = gatedStackScreen('LocationSettings', LocationSettingsScreen);
const AddTodoWithGate = gatedStackScreen('AddTodo', AddTodoScreen);
const AddNoteWithGate = gatedStackScreen('AddNote', AddNote);
const AddBookWithGate = gatedStackScreen('AddBook', AddBookScreen);
const BookDetailWithGate = gatedStackScreen('BookDetail', BookDetailScreen);
const MealDetailWithGate = gatedStackScreen('MealDetail', MealDetailScreen);
const AddHomeworkWithGate = gatedStackScreen('AddHomework', AddHomeworkScreen);
const ParentTaskWithGate = gatedStackScreen('ParentTask', ParentTaskScreen);
const TicTacToeWithGate = gatedStackScreen('TicTacToe', TicTacToeScreen);
const RockPaperScissorsWithGate = gatedStackScreen('RockPaperScissors', RockPaperScissorsScreen);
const GuessNumberWithGate = gatedStackScreen('GuessNumber', GuessNumberScreen);
const DrawGuessWithGate = gatedStackScreen('DrawGuess', DrawGuessScreen);
const Connect4WithGate = gatedStackScreen('Connect4', Connect4Screen);
const LocalPlayWithGate = gatedStackScreen('LocalPlay', LocalPlayScreen);
const ChessWithGate = gatedStackScreen('Chess', ChessScreen);
const MemoryWithGate = gatedStackScreen('Memory', MemoryScreen);

const SchoolFolderWithShell = withStackShell(SchoolFolderScreen, 'Skole', STACK_MODULE_IDS.SchoolFolder);
const LekserWithShell = withStackShell(LekserHubScreen, 'Lekser', STACK_MODULE_IDS.Lekser);
const LeksehjelpWithShell = withStackShell(LeksehjelpScreen, 'Leksehjelpen', STACK_MODULE_IDS.Leksehjelp);
const MattehjelpWithShell = withStackShell(MattehjelpScreen, 'Lær skole', STACK_MODULE_IDS.Mattehjelp);
const ChildScheduleWithShell = withStackShell(ChildScheduleScreen, 'Ukeplan', STACK_MODULE_IDS.ChildSchedule);
const KlassenWithShell = withStackShell(KlassenHubScreen, 'Klassen', STACK_MODULE_IDS.Klassen);
const KlassenDetailWithShell = withStackShell(KlassenDetailScreen, 'Klassen', STACK_MODULE_IDS.KlassenDetail);
const AiImportReviewWithShell = withStackShell(AiImportReviewScreen, 'Importer');
const ChildSettingsWithShell = withStackShell(ChildSettingsScreen, 'Innstillinger');
const DashboardThemeSettingsWithShell = withStackShell(DashboardThemeSettingsScreen, 'Tilpass hjem');
const ChildDashboardThemeSettingsWithShell = withStackShell(ChildDashboardThemeSettingsScreen, 'Tilpass hjem');

const NotificationsWithSwipe = withStackEdgeSwipe(NotificationsScreen);
const SubscriptionWithSwipe = withStackEdgeSwipe(SubscriptionScreen);
const WeatherSettingsWithSwipe = withStackEdgeSwipe(WeatherSettingsScreen);
const AppearanceSettingsWithSwipe = withStackEdgeSwipe(AppearanceSettingsScreen);
const ChatThreadWithSwipe = withStackEdgeSwipe(ChatThreadScreen);
const FriendChatThreadWithSwipe = withStackEdgeSwipe(FriendChatThreadScreen);
const AiChatWithSwipe = withStackEdgeSwipe(AiChatScreen);
const GroupSettingsWithSwipe = withStackEdgeSwipe(GroupSettingsScreen);
const MemberSettingsWithSwipe = withStackEdgeSwipe(MemberSettingsScreen);
const ProfileSettingsWithSwipe = withStackEdgeSwipe(EditProfileScreen);
const FriendsHubWithSwipe = withStackEdgeSwipe(FriendsHubScreen);
const TeamComposePostWithSwipe = withStackEdgeSwipe(TeamComposePostScreen);
const TeamCreateEventWithSwipe = withStackEdgeSwipe(TeamCreateEventScreen);
const TeamAddMemberWithSwipe = withStackEdgeSwipe(TeamAddMemberScreen);
const TeamJoinWithSwipe = withStackEdgeSwipe(TeamJoinScreen);
const TeamCreateWithSwipe = withStackEdgeSwipe(TeamCreateScreen);
const PlatformJoinWithSwipe = withStackEdgeSwipe(PlatformJoinScreen);
const PlatformComposePostWithSwipe = withStackEdgeSwipe(PlatformComposePostScreen);
const PlatformCreateEventWithSwipe = withStackEdgeSwipe(PlatformCreateEventScreen);
const ClassroomJoinWithSwipe = withStackEdgeSwipe(ClassroomJoinScreen);
const ClassroomCreateWithSwipe = withStackEdgeSwipe(ClassroomCreateScreen);
const ClassroomComposeMessageWithSwipe = withStackEdgeSwipe(ClassroomComposeMessageScreen);
const ClassroomClassworkEditorWithSwipe = withStackEdgeSwipe(ClassroomClassworkEditorScreen);
const ClassroomAssignmentDetailWithSwipe = withStackEdgeSwipe(ClassroomAssignmentDetailScreen);
const ClassroomAddStaffWithSwipe = withStackEdgeSwipe(ClassroomAddStaffScreen);
const ClassroomAddStudentsWithSwipe = withStackEdgeSwipe(ClassroomAddStudentsScreen);
const ClassroomStudentMapWithSwipe = withStackEdgeSwipe(ClassroomStudentMapScreen);

export default function App() {
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
    ...MaterialCommunityIcons.font,
    ...Feather.font,
  });
  const isWeb = Platform.OS === 'web';

  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Wait for getRedirectResult before mounting auth listener — otherwise Safari
  // can race and treat a successful Google/Microsoft return as logged-out.
  const [authBootstrapped, setAuthBootstrapped] = useState(!isWeb);
  const [justRegisteredEmail, setJustRegisteredEmail] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [userRole, setUserRole] = useState(null);
  const [childData, setChildData] = useState(null);
  const [childFamilyId, setChildFamilyId] = useState(null);
  const [childResolving, setChildResolving] = useState(false);

  useEffect(() => {
    // On web, font loading can fail/corrupt due to cached assets.
    if (fontsLoaded || isWeb) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, isWeb]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    try {
      capturePendingAddFriendFromLocation(window.location.href);
    } catch { /* ignore */ }
  }, [isWeb]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    // Never hard-reload while returning from Apple/Google OAuth — that wipes getRedirectResult.
    if (isLikelyOauthReturn() || isCalendarOauthReturn()) {
      window.localStorage.setItem('weekplan_app_build', APP_BUILD_ID);
      return;
    }
    const key = 'weekplan_app_build';
    const prev = window.localStorage.getItem(key);
    if (prev && prev !== APP_BUILD_ID) {
      window.localStorage.setItem(key, APP_BUILD_ID);
      window.location.reload();
      return;
    }
    window.localStorage.setItem(key, APP_BUILD_ID);
  }, [isWeb]);

  // Only mark "prefer app" for signed-in users (and clear on logout).
  // Marking on every SPA visit (incl. /signup) made protop.no/ jump to the
  // old Welcome screen instead of the upgraded marketing homepage.
  // Wait until auth has finished — otherwise every cold PWA launch briefly has
  // user=null and would clear prefer_app mid-"Laster ProTop…".
  useEffect(() => {
    if (!isWeb) return;
    if (!authBootstrapped || loading) return;
    if (user) markPreferApp();
    else clearPreferApp();
  }, [isWeb, user, authBootstrapped, loading]);

  // Keep React Navigation linking aware of auth, and leave /signup|/login in
  // the address bar so a remount after «Henter familien din…» cannot land on
  // AuthChoice again (seen on iOS Safari after social sign-in).
  useEffect(() => {
    setLinkingSignedIn(!!user);
    if (!isWeb || !user || typeof window === 'undefined') return;
    try {
      const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
      if (isAuthEntryPath(path)) {
        const pending = peekPendingAddFriend() || capturePendingAddFriendFromLocation(window.location.href);
        const next = pending
          ? `/hjem?addFriend=${encodeURIComponent(pending)}`
          : '/hjem';
        window.history.replaceState(window.history.state || {}, '', next);
      }
    } catch { /* ignore */ }
  }, [isWeb, user]);

  // Logged-out /hjem|/start (browser + PWA start_url) → marketing homepage.
  // Never keep the legacy in-app Welcome screen on web — including standalone.
  // Clear prefer_app so marketing pages do not bounce straight back to /hjem.
  // Must wait for auth bootstrap: signed-in desktop/PWA cold starts always open
  // /hjem with user=null until Firebase restores the session. Redirecting (and
  // clearing prefer_app) during that window kicked users to marketing and made
  // login feel stuck on "Laster ProTop…".
  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    if (!shouldRedirectStartUrlToMarketing({
      authBootstrapped,
      loading,
      user,
      justRegisteredEmail,
      oauthReturn: isLikelyOauthReturn(),
    })) return;
    try {
      const p = (window.location.pathname || '/').replace(/\/$/, '') || '/';
      if (p === '/hjem' || p === '/start') {
        const pending = peekPendingAddFriend() || capturePendingAddFriendFromLocation(window.location.href);
        if (pending) {
          persistPendingAddFriend(pending);
          window.location.replace(`/signup?addFriend=${encodeURIComponent(pending)}`);
          return;
        }
        clearPreferApp();
        window.location.replace('/');
      }
    } catch { /* ignore */ }
  }, [isWeb, user, justRegisteredEmail, authBootstrapped, loading]);

  useEffect(() => {
    if (!isWeb) return undefined;
    let cancelled = false;
    // Hard fail-safe: never leave PWA / desktop-saved launches on
    // "Laster ProTop…" if getRedirectResult hangs past its own timeout.
    const failSafe = setTimeout(() => {
      if (!cancelled) {
        console.warn('[auth] redirect bootstrap fail-safe fired');
        setAuthBootstrapped(true);
      }
    }, 6000);
    (async () => {
      try {
        await completeRedirectSignIn();
      } catch (err) {
        if (cancelled) return;
        const code = err?.message || err?.code || '';
        if (code && code !== 'cancelled') {
          console.warn('[auth] redirect result', err);
          // LoginScreen / AuthChoice read weekplan_oauth_error from sessionStorage
        }
      } finally {
        if (!cancelled) {
          clearTimeout(failSafe);
          setAuthBootstrapped(true);
        }
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(failSafe);
    };
  }, [isWeb]);

  useEffect(() => {
    if (!authBootstrapped) return undefined;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUser(null);
        setUserRole(null);
        setChildData(null);
        setChildFamilyId(null);
        setLoading(false);
        // Drop legacy global familyId so the next account is not treated as a returning member.
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          await AsyncStorage.removeItem('weekplan.familyId');
        } catch { /* ignore */ }
        return;
      }
      try {
        // Network / IDB stalls must not leave the app on a forever white spinner.
        const withTimeout = (promise, ms, label) => Promise.race([
          promise,
          new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${label}-timeout`)), ms);
          }),
        ]);
        // Use cached token for cold start (PWA / desktop-saved). Forced
        // reload + getIdToken(true) can cost ~20s and was the main cause of
        // a long "Laster ProTop…" on resume — refresh in the background.
        try {
          await withTimeout(u.getIdToken(/* forceRefresh */ false), 3000, 'auth-token');
        } catch (tokenErr) {
          console.warn('[auth] token slow or failed, continuing with cached user', tokenErr?.message || tokenErr);
        }
        const refreshedUser = auth.currentUser || u;
        setUser(refreshedUser);
        markBiometricUnlocked();

        (async () => {
          try {
            await withTimeout(u.reload(), 10000, 'auth-reload');
            await withTimeout(u.getIdToken(true), 10000, 'auth-token-refresh');
            const next = auth.currentUser;
            if (next) setUser(next);
          } catch (bgErr) {
            console.warn('[auth] background reload/token failed', bgErr?.message || bgErr);
          }
        })();

        const email = (refreshedUser.email || '').toLowerCase();
        const isChildLogin = isChildEmail(email);

        syncParentDocs(refreshedUser).catch(() => {});
        upgradeFamilyMembership(refreshedUser).catch(() => {});
        setReloadKey((prev) => prev + 1);

        if (isChildLogin) {
          setUserRole('child');
          setChildResolving(true);
          const withTimeout = (promise, ms, label) => Promise.race([
            promise,
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error(`${label}-timeout`)), ms);
            }),
          ]);
          try {
            const profile = await withTimeout(resolveChildProfile(refreshedUser), 12000, 'child-profile');
            if (profile) {
              setChildData(profile);
              const { familyId, childIdFromFam } = await withTimeout(
                resolveChildFamilyId(profile),
                12000,
                'child-family',
              );
              setChildFamilyId(familyId || profile.familyId || null);
              if (childIdFromFam && profile.id !== childIdFromFam) {
                setChildData((prev) => (prev ? { ...prev, id: childIdFromFam } : prev));
              }
            } else {
              setChildData({
                uid: refreshedUser.uid,
                name: refreshedUser.displayName || 'Barn',
                username: email.replace(/@weekplan\.app$/i, ''),
              });
              const { familyId, childIdFromFam } = await withTimeout(
                resolveChildFamilyId({ uid: refreshedUser.uid }),
                12000,
                'child-family',
              );
              setChildFamilyId(familyId || null);
              if (childIdFromFam) {
                setChildData((prev) => (prev ? { ...prev, id: childIdFromFam } : prev));
              }
            }
          } catch (childErr) {
            console.warn('[auth] child resolve failed/timed out', childErr?.message || childErr);
            setChildData((prev) => prev || {
              uid: refreshedUser.uid,
              name: refreshedUser.displayName || 'Barn',
              username: email.replace(/@weekplan\.app$/i, ''),
            });
          }
          setChildResolving(false);
        } else {
          setUserRole('parent');
          setChildData(null);
          setChildFamilyId(null);
        }
      } catch (err) {
        console.error('Feil i onAuthStateChanged:', err);
        Alert.alert('Feil', 'Klarte ikke å hente/verifisere bruker.');
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [authBootstrapped]);

  if ((!isWeb && !fontsLoaded) || !authBootstrapped || loading || (user && userRole === 'child' && childResolving)) {
    return <LoadingView label="Laster ProTop…" />;
  }

  const navKey = `${user?.uid || 'anon'}-${userRole || 'none'}-${reloadKey}`;
  const verifyEmail = (user?.email || justRegisteredEmail || '').toLowerCase();

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AppProvider user={user} role={userRole} childProfile={childData} childFamilyId={childFamilyId}>
          <ModuleAccessProvider>
          <HelpProvider>
          <NotificationProvider>
          <AppearanceProvider>
          <ThemeProvider>
          <ChatDockProvider>
          <RootNav
            user={user}
            userRole={userRole}
            justRegisteredEmail={justRegisteredEmail}
            setJustRegisteredEmail={setJustRegisteredEmail}
            reloadKey={navKey}
            verifyEmail={verifyEmail}
            onEmailVerified={async () => {
              setJustRegisteredEmail(null);
              if (auth.currentUser) {
                try {
                  await reload(auth.currentUser);
                  setReloadKey((k) => k + 1);
                } catch {}
              }
            }}
          />
          <HelpOverlay />
          <HelpModuleCard />
          </ChatDockProvider>
          </ThemeProvider>
          </AppearanceProvider>
          </NotificationProvider>
          </HelpProvider>
          </ModuleAccessProvider>
        </AppProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}

function RootNav({ user, userRole, justRegisteredEmail, setJustRegisteredEmail, reloadKey, verifyEmail, onEmailVerified }) {
  const isWeb = Platform.OS === 'web';
  const { langPicked, ready, t, lang } = useI18n();
  const {
    userProfile, families, familiesReady, familiesLoadError, userProfileReady,
    family, familyId, selectFamily,
  } = useApp();
  const [localConsents, setLocalConsents] = useState(null);
  const [consentReady, setConsentReady] = useState(false);
  // Hard fail-safe: never leave returning parents on a blank boot spinner forever.
  const [bootTimedOut, setBootTimedOut] = useState(false);
  const [shellEnsureBusy, setShellEnsureBusy] = useState(false);
  const shellEnsureAttemptedRef = React.useRef(null);

  useEffect(() => {
    setBootTimedOut(false);
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    if (familiesReady && userProfileReady) return undefined;
    const t = setTimeout(() => {
      console.warn('[RootNav] boot timeout — forcing UI past spinner');
      setBootTimedOut(true);
    }, 8000);
    return () => clearTimeout(t);
  }, [user?.uid, familiesReady, userProfileReady]);

  useEffect(() => {
    let alive = true;
    loadLocalConsents()
      .then((c) => {
        if (!alive) return;
        setLocalConsents(c);
        setConsentReady(true);
      })
      .catch(() => {
        if (!alive) return;
        setLocalConsents(null);
        setConsentReady(true);
      });
    // Fail-safe if AsyncStorage never resolves.
    const t = setTimeout(() => {
      if (alive) setConsentReady(true);
    }, 5000);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, []);

  useEffect(() => {
    if (user?.uid && consentsComplete(localConsents) && !consentsComplete(userProfile?.consents)) {
      persistUserConsents(user.uid, localConsents).catch(() => {});
    }
  }, [user?.uid, localConsents, userProfile?.consents]);

  // Solo parents with a finished profile but no group get a personal shell
  // automatically — never park them on GetStarted.
  useEffect(() => {
    if (!user?.uid || userRole !== 'parent') return undefined;
    if (!userProfile?.profileComplete) return undefined;
    if (!familiesReady) return undefined;
    const live = (families || []).filter(
      (f) => f.deleted !== true && f.hiddenFromApp !== true
        && f.archived !== true && f.active !== false,
    );
    if (live.length > 0) {
      shellEnsureAttemptedRef.current = null;
      return undefined;
    }
    if (shellEnsureAttemptedRef.current === user.uid) return undefined;
    shellEnsureAttemptedRef.current = user.uid;
    let alive = true;
    setShellEnsureBusy(true);
    (async () => {
      try {
        const result = await ensurePersonalShellForUser({
          user,
          profile: userProfile,
          language: lang || 'nb',
          existingFamilies: families || [],
        });
        if (!alive || !result?.id) return;
        await selectFamily(result.id, result.family);
      } catch (err) {
        console.warn('[RootNav] personal shell ensure failed', err?.message || err);
        // Allow one retry on next familiesReady cycle if list stays empty.
        if (alive) shellEnsureAttemptedRef.current = null;
      } finally {
        if (alive) setShellEnsureBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [
    user, userRole, userProfile, familiesReady, families, selectFamily, lang,
  ]);

  const consented = userRole === 'child'
    || consentsComplete(userProfile?.consents)
    || consentsComplete(localConsents);
  const hasGroups = (families || []).length > 0;
  const hasLiveGroups = (families || []).some(
    (f) => f.archived !== true && f.active !== false && f.deleted !== true && f.hiddenFromApp !== true,
  );
  // Ikke bruk tidlig famLoading=false (familyId-restore) her — da blir hasGroups tom midlertidig
  // og ProfileSetup flasher før Firestore-svar.
  // Etter bootTimedOut: stol på cachet liste / familyId så returnerende brukere ikke
  // kastes til ProfileSetup mens familiesReady fortsatt er false.
  const profileOk = userRole === 'child'
    || !!userProfile?.profileComplete
    || (familiesReady && hasGroups)
    || (bootTimedOut && (hasGroups || !!family?.id || !!familyId));
  const provider = user?.providerData?.[0]?.providerId;
  const isPasswordUser = !provider || provider === 'password';
  const needsVerify = !!(
    (user && isPasswordUser && !user.emailVerified && userRole !== 'child')
    || (!user && !!justRegisteredEmail)
  );
  const activeFamily = family || (families || []).find((f) => f.id === familyId) || null;
  const needsHomeSetup = !!(
    user
    && userRole === 'parent'
    && profileOk
    && userProfile?.homeSetupComplete !== true
    && !isHomeSetupCompleteSession(user?.uid)
    && (isPersonalShell(activeFamily) || (!hasGroups && shellEnsureBusy))
  );
  // On web: if the user opens `/verify-email?vt=...` (from their email),
  // we must force the VerifyEmail screen. Otherwise App's stage logic may
  // reset navigation and send them to the landing/home page.
  const forceVerifyFromUrl = (() => {
    if (typeof window === 'undefined') return false;
    try {
      const u = new URL(window.location.href);
      const path = u.pathname || '';
      return (
        path.includes('/verify-email')
        || u.searchParams.has('vt')
        || u.searchParams.has('oobCode')
        || u.searchParams.has('oobcode')
      );
    } catch {
      return false;
    }
  })();
  const forceVerify = forceVerifyFromUrl && !(user && user.emailVerified);
  const forceCalendarOauth = isCalendarOauthReturn();

  // Logged-out PWA/start_url must not paint the legacy Welcome while redirecting.
  // Use Platform.OS directly — do not close over a missing `isWeb` binding (Safari
  // ReferenceError: Can't find variable: isWeb crashed home-screen launches).
  const pendingMarketingRedirect = (() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
    if (user || justRegisteredEmail) return false;
    try {
      const p = (window.location.pathname || '/').replace(/\/$/, '') || '/';
      return p === '/hjem' || p === '/start';
    } catch {
      return false;
    }
  })();

  const welcomePathEntry = (() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
    try {
      const p = (window.location.pathname || '/').replace(/\/$/, '') || '/';
      if (p === '/login') return 'Login';
      if (p === '/forgot-password') return 'ForgotPassword';
      if (p === '/signup') return 'AuthChoice';
      if (p === '/register') return 'Register';
      if (p === '/add-friend' || p.startsWith('/add-friend/')) {
        try { capturePendingAddFriendFromLocation(window.location.href); } catch { /* ignore */ }
        return 'AuthChoice';
      }
      // /start used to mount the legacy Welcome marketing clone — redirect via /.
      if (p === '/start') return null;
      if (p === '/dashboard-themes') return 'DashboardThemeGallery';
      if (p === '/child-dashboard-themes') return 'ChildDashboardThemeGallery';
      if (p === '/game-preview' || p.startsWith('/game-preview/')) {
        try {
          const parts = p.split('/').filter(Boolean);
          if (parts[1] && typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('weekplanGamePreviewId', parts[1]);
          }
        } catch { /* ignore */ }
        return 'GamePreview';
      }
      if (p === '/family-games-preview') return 'FamilyGamesPreview';
      return null;
    } catch {
      return null;
    }
  })();

  // bootTimedOut must also bypass stuck i18n/consent *gates* — otherwise a hung
  // AsyncStorage/Firestore read leaves returning users on a forever white spinner.
  // Language/legal screens still show when needed; only profile/family waits soft-fail.
  let stage = 'boot';
  if ((ready && consentReady) || bootTimedOut) {
    if (forceCalendarOauth) stage = 'app';
    else if (forceVerify) stage = 'verify';
    else if (!user && !justRegisteredEmail) stage = 'welcome';
    else if (needsVerify) stage = 'verify';
    else if (user && userRole === 'parent' && !bootTimedOut && (!familiesReady || (!userProfileReady && !hasGroups))) stage = 'boot';
    else if (!langPicked && user) stage = 'language';
    // Never eject incomplete profiles to GetStarted — bootTimedOut only clears the
    // white spinner (boot stage). Kicking off ProfileSetup mid-birthday-picker left
    // new users on «Fant ikke familien din».
    else if (user && !profileOk) stage = 'profile';
    // Personal shell is created in the background; show a short boot while ensuring.
    else if (user && userRole === 'parent' && !hasGroups && !family?.id && !familyId) {
      stage = shellEnsureBusy || !bootTimedOut ? 'boot' : 'homeSetup';
    }
    else if (needsHomeSetup) stage = 'homeSetup';
    else stage = 'app';
  }

  const initial = forceCalendarOauth ? 'CalendarOAuthRedirect'
    // Web: never default to legacy Welcome — login/signup paths use welcomePathEntry;
    // /hjem|/start redirect to the marketing homepage above.
    : stage === 'welcome' ? (welcomePathEntry || (Platform.OS === 'web' ? 'Login' : 'Welcome'))
    : stage === 'language' ? 'PickLanguage'
    : stage === 'auth' ? 'AuthChoice'
    : stage === 'verify' ? 'VerifyEmail'
    : stage === 'profile' ? 'ProfileSetup'
    : stage === 'homeSetup' ? 'HomeSetupOnboarding'
    : stage === 'start' ? 'HomeSetupOnboarding'
    : (!hasLiveGroups && hasGroups) ? 'FamilyOverview'
    : (family ? platformHomeRoute(family.type) : 'Home');

  // Hooks must be called unconditionally (before any early return)
  const goAfterLegal = (nav) => {
    if (!user) nav.replace('AuthChoice');
    else if (!profileOk) nav.replace('ProfileSetup');
    else if (needsHomeSetup || (!hasGroups && !familyId)) nav.replace('HomeSetupOnboarding');
    else if (!hasLiveGroups) nav.replace('FamilyOverview');
    else if (family) nav.replace(platformHomeRoute(family.type));
    else nav.replace('Home');
  };

  const navRef = React.useRef(null);
  const prevStageRef = React.useRef(stage);
  React.useEffect(() => {
    if (stage === 'boot') return;
    if (forceCalendarOauth) return;
    if (prevStageRef.current !== stage && navRef.current?.isReady()) {
      const from = prevStageRef.current;
      prevStageRef.current = stage;
      // Leaving boot remounts NavigationContainer. Linking already resolves the
      // current URL (e.g. /settings/profile). A reset to `initial` (usually Home)
      // would wipe that deep link — skip it. Never skip for auth entry URLs:
      // /signup must not stick after «Henter familien din…».
      if (from === 'boot' && stage === 'app') {
        let path = '/hjem';
        try {
          if (typeof window !== 'undefined') {
            path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
          }
        } catch { /* ignore */ }
        if (!isAuthEntryPath(path)) return;
      }
      navRef.current.reset({ index: 0, routes: [{ name: initial }] });
    }
  }, [stage, initial, forceCalendarOauth]);

  if (stage === 'boot') return <LoadingView label="Laster ProTop…" />;

  // SessionOverlays must mount for any signed-in user past boot — not only
  // stage==='app'. Users on legal/profile/language/start otherwise never see
  // friend/family invite gates (listFriendRequests never runs).
  if (pendingMarketingRedirect) return <LoadingView label="Åpner ProTop…" />;

  return (
    <NavigationContainer
      ref={navRef}
      linking={linking}
      onReady={() => setAppNav(navRef.current)}
    >
      <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, contentStyle: { flex: 1 }, gestureEnabled: true, fullScreenGestureEnabled: true }}>
        <Stack.Screen name="Welcome">
          {(props) => (
            <WelcomeScreen
              {...props}
              onTryFree={() => {
                props.navigation.navigate('AuthChoice');
              }}
              onLogin={() => props.navigation.navigate('Login')}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="PickLanguage">
          {(props) => (
            <LanguageScreen
              {...props}
              onDone={() => {
                if (props.navigation.canGoBack()) props.navigation.goBack();
                else if (!user) props.navigation.replace('AuthChoice');
                else goAfterLegal(props.navigation);
              }}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Legal" component={PrivacyTermsScreen} options={{ headerShown: false }} />
        <Stack.Screen name="LegalConsent">
          {(props) => (
            <LegalWizardScreen
              {...props}
              existing={localConsents}
              nextLabel={user ? t('common.save') : undefined}
              onDone={async (c) => {
                setLocalConsents(c);
                if (user?.uid) await persistUserConsents(user.uid, c);
                if (props.navigation.canGoBack() && user) {
                  props.navigation.goBack();
                  return;
                }
                goAfterLegal(props.navigation);
              }}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="LegalDoc" component={LegalDocScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Licenses" component={LicensesScreen} options={{ headerShown: false }} />
        <Stack.Screen name="DashboardThemeGallery" component={DashboardThemeGalleryScreen} options={{ headerShown: false }} />
        <Stack.Screen name="ChildDashboardThemeGallery" component={ChildDashboardThemeGalleryScreen} options={{ headerShown: false }} />
        <Stack.Screen name="GamePreview" component={GamePreviewScreen} options={{ headerShown: false }} />
        <Stack.Screen
          name="FamilyGamesPreview"
          options={{ headerShown: false }}
        >
          {() => <FamilyGamesScreen compactHeader />}
        </Stack.Screen>
        <Stack.Screen
          name="CalendarOAuthRedirect"
          component={CalendarOAuthRedirectScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="StravaOAuthRedirect"
          component={StravaOAuthRedirectScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AirbnbOAuthRedirect"
          component={AirbnbOAuthRedirectScreen}
          options={{ headerShown: false }}
        />

        <Stack.Group>
          <Stack.Screen name="AuthChoice" component={AuthChoiceScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register">
            {(props) => <RegisterScreen {...props} setJustRegisteredEmail={setJustRegisteredEmail} />}
          </Stack.Screen>
          <Stack.Screen name="RegisterInvitedUser" component={RegisterInvitedUserScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        </Stack.Group>

        <Stack.Screen name="VerifyEmail">
          {(props) => (
            <VerifyEmailScreen
              {...props}
              email={verifyEmail}
              onVerified={onEmailVerified}
              clearJustRegisteredEmail={async ({ keepSession } = {}) => {
                if (user && !keepSession) {
                  try { await signOut(auth); } catch {}
                }
                setJustRegisteredEmail(null);
              }}
            />
          )}
        </Stack.Screen>

        {user && (
          <>
            <Stack.Screen name="ProfileSetup">
              {(props) => (
                <ProfileSetupScreen
                  consents={localConsents}
                  initial={userProfile}
                  onDone={async (profile) => {
                    try {
                      const result = await ensurePersonalShellForUser({
                        user,
                        profile: profile || userProfile,
                        language: lang || 'nb',
                        existingFamilies: families || [],
                      });
                      if (result?.id) {
                        await selectFamily(result.id, result.family);
                      }
                    } catch (err) {
                      console.warn('[ProfileSetup] personal shell', err?.message || err);
                    }
                    const setupDone = userProfile?.homeSetupComplete === true;
                    if (setupDone && hasLiveGroups) {
                      props.navigation.replace('Home');
                    } else if (setupDone && hasGroups) {
                      props.navigation.replace('FamilyOverview');
                    } else {
                      props.navigation.replace('HomeSetupOnboarding');
                    }
                  }}
                />
              )}
            </Stack.Screen>
            <Stack.Screen name="HomeSetupOnboarding" component={HomeSetupOnboardingScreen} options={{ headerShown: false }} />
            <Stack.Screen name="GetStarted" component={GetStartedScreen} />
            <Stack.Screen name="CreateGroup" component={CreateGroupScreen} />
            <Stack.Screen name="GroupHub" component={GroupHubScreen} />
            <Stack.Screen name="AddMember" component={AddMemberScreen} />
            <Stack.Screen name="FamilyInviteRespond" component={FamilyInviteRespondScreen} options={{ headerShown: false }} />
            <Stack.Screen name="FriendInviteRespond" component={FriendInviteRespondScreen} options={{ headerShown: false }} />
            <Stack.Screen name="AddFriend" component={AddFriendScreen} options={{ headerShown: false }} />
            <Stack.Screen name="FriendQr" component={FriendQrScreen} options={{ headerShown: false }} />
            <Stack.Screen name="FriendsHub" component={FriendsHubWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="GroupSettings" component={GroupSettingsWithSwipe} />
            <Stack.Screen name="MemberSettings" component={MemberSettingsWithSwipe} />
            <Stack.Screen name="Archive" component={ArchiveScreen} />
            <Stack.Screen name="ProfileSettings" component={ProfileSettingsWithSwipe} />
            <Stack.Screen name="CalendarSettings" component={CalendarSettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="CustodySettings" component={CustodySettingsScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Home" component={AppShell} />
            <Stack.Screen name="TeamHome" component={TeamShell} options={{ headerShown: false }} />
            <Stack.Screen name="TeamJoin" component={TeamJoinWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="TeamCreate" component={TeamCreateWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="TeamComposePost" component={TeamComposePostWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="TeamCreateEvent" component={TeamCreateEventWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="TeamAddMember" component={TeamAddMemberWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="ClassroomHome" component={ClassroomShell} options={{ headerShown: false }} />
            <Stack.Screen name="FriendsHome" component={FriendsShell} options={{ headerShown: false }} />
            <Stack.Screen name="CongregationHome" component={CongregationShell} options={{ headerShown: false }} />
            <Stack.Screen name="DaycareHome" component={DaycareShell} options={{ headerShown: false }} />
            <Stack.Screen name="GroupHome" component={GroupShell} options={{ headerShown: false }} />
            <Stack.Screen name="CompanyHome" component={CompanyShell} options={{ headerShown: false }} />
            <Stack.Screen name="FriendsJoin" component={PlatformJoinWithSwipe} options={{ headerShown: false }} initialParams={{ platformType: 'friends' }} />
            <Stack.Screen name="CongregationJoin" component={PlatformJoinWithSwipe} options={{ headerShown: false }} initialParams={{ platformType: 'congregation' }} />
            <Stack.Screen name="DaycareJoin" component={PlatformJoinWithSwipe} options={{ headerShown: false }} initialParams={{ platformType: 'daycare' }} />
            <Stack.Screen name="GroupJoin" component={PlatformJoinWithSwipe} options={{ headerShown: false }} initialParams={{ platformType: 'group' }} />
            <Stack.Screen name="CreateCompany" component={CreateCompanyScreen} options={{ headerShown: false }} />
            <Stack.Screen name="FriendsComposePost" component={PlatformComposePostWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="CongregationComposePost" component={PlatformComposePostWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="DaycareCreateAnnouncement" component={PlatformCreateEventWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="GroupComposePost" component={PlatformComposePostWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="FriendsCreateEvent" component={PlatformCreateEventWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="CongregationCreateEvent" component={PlatformCreateEventWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="GroupCreateEvent" component={PlatformCreateEventWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="ClassroomJoin" component={ClassroomJoinWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="ClassroomCreate" component={ClassroomCreateWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="ClassroomComposeMessage" component={ClassroomComposeMessageWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="ClassroomClassworkEditor" component={ClassroomClassworkEditorWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="ClassroomAssignmentDetail" component={ClassroomAssignmentDetailWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="ClassroomAddStaff" component={ClassroomAddStaffWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="ClassroomAddStudents" component={ClassroomAddStudentsWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="ClassroomStudentMap" component={ClassroomStudentMapWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="ChatThread" component={ChatThreadWithSwipe} options={{ headerShown: false, title: 'Chat' }} />
            <Stack.Screen name="FriendChatThread" component={FriendChatThreadWithSwipe} options={{ headerShown: false, title: 'Chat' }} />
            <Stack.Screen
              name="EventForm"
              component={EventFormScreen}
              options={{
                headerShown: false,
                title: 'Hendelse',
                presentation: 'transparentModal',
                animation: 'fade',
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
            <Stack.Screen name="FamilyOverview">
              {(p) => (
                <StackShellChrome title="Velg organisasjon">
                  <FamilyOverviewScreen {...p} reloadKey={reloadKey} />
                </StackShellChrome>
              )}
            </Stack.Screen>
            <Stack.Screen name="FamilyDashboard" component={FamilyDashboardScreen} />
            <Stack.Screen name="ChildDashboard" component={ChildDashboardScreen} />
            <Stack.Screen name="AddFamily" component={CreateGroupScreen} />
            <Stack.Screen name="AddChild" component={AddMemberScreen} />
            <Stack.Screen name="AddParent" component={AddMemberScreen} />
            <Stack.Screen name="ChildList" component={ChildListScreen} />
            <Stack.Screen name="Templates" component={TemplateListScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="ChildProfile" component={ChildProfileScreen} />
            <Stack.Screen name="ParentProfile" component={ParentProfileScreen} />
            <Stack.Screen name="Confirmation" component={ConfirmationScreen} />
            <Stack.Screen name="SelectFamilyScreen" component={SelectFamilyScreen} />
            <Stack.Screen name="AddTodo" component={AddTodoWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="AddNote" component={AddNoteWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="ChildSchedule" component={ChildScheduleWithShell} options={{ headerShown: false }} />
            <Stack.Screen name="ChildSettings" component={ChildSettingsWithShell} options={{ headerShown: false }} />
            <Stack.Screen name="ChoreSettings" component={ChoreSettingsWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="StarGoals" component={StarGoalsWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="Activities" component={ActivitiesWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="ActivityDetail" component={ActivityDetailWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="AiChat" component={AiChatWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="Leksehjelp" component={LeksehjelpWithShell} options={{ headerShown: false }} />
            <Stack.Screen name="Mattehjelp" component={MattehjelpWithShell} options={{ headerShown: false }} />
            <Stack.Screen name="Lekser" component={LekserWithShell} options={{ headerShown: false }} />
            <Stack.Screen name="SchoolFolder" component={SchoolFolderWithShell} options={{ headerShown: false }} />
            <Stack.Screen name="Klassen" component={KlassenWithShell} options={{ headerShown: false }} />
            <Stack.Screen name="KlassenDetail" component={KlassenDetailWithShell} options={{ headerShown: false }} />
            <Stack.Screen name="FamilyGames" component={FamilyGamesWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="TicTacToe" component={TicTacToeWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="RockPaperScissors" component={RockPaperScissorsWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="GuessNumber" component={GuessNumberWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="DrawGuess" component={DrawGuessWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="Connect4" component={Connect4WithGate} options={{ headerShown: false }} />
            <Stack.Screen name="Chess" component={ChessWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="Memory" component={MemoryWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="LocalPlay" component={LocalPlayWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="AiImportReview" component={AiImportReviewWithShell} options={{ headerShown: false }} />
            <Stack.Screen name="Bookshelf" component={BookshelfWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="AddBook" component={AddBookWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="BookDetail" component={BookDetailWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="MealDetail" component={MealDetailWithGate} options={{ headerShown: false }} />
            <Stack.Screen
              name="AddHomework"
              component={AddHomeworkWithGate}
              options={{
                headerShown: false,
                presentation: 'transparentModal',
                animation: 'fade',
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
            <Stack.Screen
              name="ParentTask"
              component={ParentTaskWithGate}
              options={{
                headerShown: false,
                presentation: 'transparentModal',
                animation: 'fade',
                contentStyle: { backgroundColor: 'transparent' },
              }}
            />
            <Stack.Screen name="Notifications" component={NotificationsWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="Subscription" component={SubscriptionWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="LocationSettings" component={LocationSettingsWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="WeatherSettings" component={WeatherSettingsWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="AppearanceSettings" component={AppearanceSettingsWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="DashboardThemeSettings" component={DashboardThemeSettingsWithShell} options={{ headerShown: false }} />
            <Stack.Screen name="ChildDashboardThemeSettings" component={ChildDashboardThemeSettingsWithShell} options={{ headerShown: false }} />
            <Stack.Screen name="FamilyProgress" component={FamilyProgressWithGate} options={{ headerShown: false }} />
          </>
        )}

        <Stack.Screen name="__KeepAlive" component={() => <LoadingView />} />
      </Stack.Navigator>
      {user ? <SessionOverlays /> : null}
    </NavigationContainer>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // RN-web should render this as normal UI (instead of blank page).
    return (
      <View style={{ flex: 1, padding: 20, backgroundColor: '#fff' }}>
        <Text style={{ fontWeight: '900', fontSize: 18, marginBottom: 10, color: '#b91c1c' }}>
          App error
        </Text>
        <Text style={{ fontFamily: 'monospace', fontSize: 12, color: '#111827' }}>
          {String(error?.message || error)}
        </Text>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f4f7fb' },
});
