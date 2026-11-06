import 'react-native-gesture-handler';

import React, { useState, useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, Alert, Platform, Text } from 'react-native';
import { NavigationContainer, useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { onAuthStateChanged, reload, signOut } from 'firebase/auth';
import { auth } from './firebase';
import { completeRedirectSignIn, isLikelyOauthReturn } from './src/utils/authProviders';
import { isCalendarOauthReturn } from './src/utils/calendarOAuthCapture';
import { markBiometricUnlocked } from './src/utils/biometricLock';
import { linking, setLinkingSignedIn, isAuthEntryPath } from './src/navigation/linking';
import { takeEntryShellPath } from './src/navigation/shellPaths';
import { capturePendingAddFriendFromLocation, peekPendingAddFriend, persistPendingAddFriend } from './src/utils/pendingAddFriend';
import { captureAgreementLinkFromLocation } from './src/anbud/agreementLink';
import AgreementLinkHost from './screens/anbud/AgreementLinkHost';
import SaveToastHost from './components/SaveToastHost';
import { usePhoneVisualViewport } from './src/shell/usePhoneVisualViewport';
import { syncParentDocs, isChildEmail } from './src/utils/session';

import LoginScreen from './screens/LoginScreen';
const RegisterScreen = lazyScreen(() => import('./screens/RegisterScreen'), { name: 'RegisterScreen' });
const VerifyEmailScreen = lazyScreen(() => import('./screens/VerifyEmailScreen'), { name: 'VerifyEmailScreen' });
const ForgotPasswordScreen = lazyScreen(() => import('./screens/ForgotPasswordScreen'), { name: 'ForgotPasswordScreen' });
const FamilyOverviewScreen = lazyScreen(() => import('./screens/FamilyOverviewScreen'), { name: 'FamilyOverviewScreen' });
const TemplateListScreen = lazyScreen(() => import('./screens/TemplateListScreen'), { name: 'TemplateListScreen' });
const ProfileScreen = lazyScreen(() => import('./screens/ProfileScreen'), { name: 'ProfileScreen' });
const ParentProfileScreen = lazyScreen(() => import('./screens/ParentProfileScreen'), { name: 'ParentProfileScreen' });
const ConfirmationScreen = lazyScreen(() => import('./screens/ConfirmationScreen'), { name: 'ConfirmationScreen' });
const SelectFamilyScreen = lazyScreen(() => import('./screens/SelectFamilyScreen'), { name: 'SelectFamilyScreen' });
const AddTodoScreen = lazyScreen(() => import('./screens/AddTodoScreen'), { name: 'AddTodoScreen' });
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { lazyScreen } from './src/ui/lazyScreen';
import { AppProvider, useApp } from './src/context/AppContext';
import { HelpProvider } from './src/context/HelpContext';
import { ModuleAccessProvider } from './src/context/ModuleAccessContext';
import HelpOverlay, { HelpModuleCardHost as HelpModuleCard } from './components/HelpOverlayHost';
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
import StorageNotice from './components/StorageNotice';
import { ChatDockProvider } from './src/context/ChatDockContext';
const CreateCompanyScreen = lazyScreen(() => import('./screens/company/CreateCompanyScreen'), { name: 'CreateCompanyScreen' });
const PlatformJoinScreen = lazyScreen(() => import('./screens/platform/PlatformJoinScreen'), { name: 'PlatformJoinScreen' });
const ChatThreadScreen = lazyScreen(() => import('./screens/v2/ChatThreadScreen'), { name: 'ChatThreadScreen' });
const EventFormScreen = lazyScreen(() => import('./screens/v2/EventFormScreen'), { name: 'EventFormScreen' });
const ParentTaskScreen = lazyScreen(() => import('./screens/v2/ParentTaskScreen'), { name: 'ParentTaskScreen' });
const NotificationsScreen = lazyScreen(() => import('./screens/v2/NotificationsScreen'), { name: 'NotificationsScreen' });
const SubscriptionScreen = lazyScreen(() => import('./screens/v2/SubscriptionScreen'), { name: 'SubscriptionScreen' });
const NotificationSettingsScreen = lazyScreen(() => import('./screens/v2/NotificationSettingsScreen'), { name: 'NotificationSettingsScreen' });
const WeatherSettingsScreen = lazyScreen(() => import('./screens/v2/WeatherSettingsScreen'), { name: 'WeatherSettingsScreen' });
const AppearanceSettingsScreen = lazyScreen(() => import('./screens/v2/AppearanceSettingsScreen'), { name: 'AppearanceSettingsScreen' });
const DashboardThemeSettingsScreen = lazyScreen(() => import('./screens/v2/DashboardThemeSettingsScreen'), { name: 'DashboardThemeSettingsScreen' });
const DashboardThemeGalleryScreen = lazyScreen(() => import('./screens/v2/DashboardThemeGalleryScreen'), { name: 'DashboardThemeGalleryScreen' });
const FakturaDemoScreen = lazyScreen(() => import('./screens/economy/FakturaDemoScreen'), { name: 'FakturaDemoScreen' });
const MeetingsDemoScreen = lazyScreen(() => import('./screens/meetings/MeetingsDemoScreen'), { name: 'MeetingsDemoScreen' });
const AnbudDemoScreen = lazyScreen(() => import('./screens/anbud/AnbudDemoScreen'), { name: 'AnbudDemoScreen' });
const HelpdeskPortalScreen = lazyScreen(() => import('./screens/helpdesk/HelpdeskPortalScreen'), { name: 'HelpdeskPortalScreen' });
const HelpdeskDemoScreen = lazyScreen(() => import('./screens/helpdesk/HelpdeskDemoScreen'), { name: 'HelpdeskDemoScreen' });
const SurveyAnswerScreen = lazyScreen(() => import('./screens/surveys/SurveyAnswerScreen'), { name: 'SurveyAnswerScreen' });
const CustomerSurveyDemoScreen = lazyScreen(() => import('./screens/surveys/CustomerSurveyDemoScreen'), { name: 'CustomerSurveyDemoScreen' });
import { installDiagnostics } from './src/helpdesk/diagnostics';
const CalendarSettingsScreen = lazyScreen(() => import('./screens/v2/CalendarSettingsScreen'), { name: 'CalendarSettingsScreen' });
const CalendarOAuthRedirectScreen = lazyScreen(() => import('./screens/v2/CalendarOAuthRedirectScreen'), { name: 'CalendarOAuthRedirectScreen' });
const AiChatScreen = lazyScreen(() => import('./screens/v2/AiChatScreen'), { name: 'AiChatScreen' });
const AssistantScreen = lazyScreen(() => import('./screens/v2/AssistantScreen'), { name: 'AssistantScreen' });
import StackShellChrome from './components/StackShellChrome';
const EmployeeDetailPreview = lazyScreen(() => import('./screens/employees/EmployeeDetailPreview'), { name: 'EmployeeDetailPreview' });
const CustomersListPreview = lazyScreen(() => import('./screens/customers/CustomersListPreview'), { name: 'CustomersListPreview' });
const LanguageScreen = lazyScreen(() => import('./screens/onboarding/LanguageScreen'), { name: 'LanguageScreen' });
const WelcomeScreen = lazyScreen(() => import('./screens/onboarding/WelcomeScreen'), { name: 'WelcomeScreen' });
const LegalWizardScreen = lazyScreen(() => import('./screens/onboarding/LegalWizardScreen'), { name: 'LegalWizardScreen' });
const PrivacyTermsScreen = lazyScreen(() => import('./screens/v2/PrivacyTermsScreen'), { name: 'PrivacyTermsScreen' });
const LegalDocScreen = lazyScreen(() => import('./screens/v2/LegalDocScreen'), { name: 'LegalDocScreen' });
const LicensesScreen = lazyScreen(() => import('./screens/v2/LicensesScreen'), { name: 'LicensesScreen' });
const AuthChoiceScreen = lazyScreen(() => import('./screens/onboarding/AuthChoiceScreen'), { name: 'AuthChoiceScreen' });
const ProfileSetupScreen = lazyScreen(() => import('./screens/onboarding/ProfileSetupScreen'), { name: 'ProfileSetupScreen' });
const HomeSetupOnboardingScreen = lazyScreen(() => import('./screens/onboarding/HomeSetupOnboardingScreen'), { name: 'HomeSetupOnboardingScreen' });
const CreateGroupScreen = lazyScreen(() => import('./screens/onboarding/CreateGroupScreen'), { name: 'CreateGroupScreen' });
const GetStartedScreen = lazyScreen(() => import('./screens/onboarding/CreateGroupScreen'), { name: 'GetStartedScreen', pick: 'GetStartedScreen' });
const GroupHubScreen = lazyScreen(() => import('./screens/GroupHubScreen'), { name: 'GroupHubScreen' });
const FamilyInviteRespondScreen = lazyScreen(() => import('./screens/FamilyInviteRespondScreen'), { name: 'FamilyInviteRespondScreen' });
const EditProfileScreen = lazyScreen(() => import('./screens/v2/EditProfileScreen'), { name: 'EditProfileScreen' });
const FriendsHubScreen = lazyScreen(() => import('./screens/v2/FriendsHubScreen'), { name: 'FriendsHubScreen' });
const AddFriendScreen = lazyScreen(() => import('./screens/v2/AddFriendScreen'), { name: 'AddFriendScreen' });
const FriendQrScreen = lazyScreen(() => import('./screens/v2/FriendQrScreen'), { name: 'FriendQrScreen' });
const FriendChatThreadScreen = lazyScreen(() => import('./screens/v2/FriendChatThreadScreen'), { name: 'FriendChatThreadScreen' });
const FriendInviteRespondScreen = lazyScreen(() => import('./screens/v2/FriendInviteRespondScreen'), { name: 'FriendInviteRespondScreen' });
const GroupSettingsScreen = lazyScreen(() => import('./screens/settings/GroupSettingsScreen'), { name: 'GroupSettingsScreen', pick: 'GroupSettingsScreen' });
const MemberSettingsScreen = lazyScreen(() => import('./screens/settings/GroupSettingsScreen'), { name: 'MemberSettingsScreen', pick: 'MemberSettingsScreen' });
const ArchiveScreen = lazyScreen(() => import('./screens/settings/GroupSettingsScreen'), { name: 'ArchiveScreen', pick: 'ArchiveScreen' });
import { consentsComplete, loadLocalConsents, persistUserConsents } from './src/utils/consents';
import { APP_BUILD_ID } from './src/constants/build';
import {
  BUILD_JSON_PATH,
  claimBuildReload,
  shouldReloadForRemoteBuild,
  shouldSkipWebBuildRefresh,
} from './src/utils/webBuildRefresh';
import { markPreferApp, clearPreferApp, isStandaloneDisplay } from './src/utils/preferApp';
import { applyBootNavigation } from './src/shell/pwaNavigation';
import { shouldHoldFamilyBootSpinner, shouldRedirectStartUrlToMarketing } from './src/utils/authBootGate';
import {
  ensurePersonalShellForUser,
  isPersonalShell,
  isHomeSetupCompleteSession,
} from './src/utils/personalShell';
import { clearSessionData } from './src/utils/localCache';
import { useInviteLinkJoin } from './src/hooks/useInviteLinkJoin';
import { blockedFamilyProductRoute, childLoginAllowed } from './src/navigation/familyProduct';

// Demoer og forhåndsvisninger uten innlogging finnes bare i utviklingsbygg (Metro), ikke på protop.no.
const DEV_DEMOS = typeof __DEV__ !== 'undefined' && __DEV__;

SplashScreen.preventAutoHideAsync().catch(() => {});

if (Platform.OS === 'web') {
  try { require('./app.web.css'); } catch {}
  // Unregister stale Expo/PWA workers that cache old bundles, but keep the
  // Web: keep push SW, unregister stale workers. Native: Expo notification handler.
  if (Platform.OS === 'web' && typeof window !== 'undefined' && 'serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      regs.forEach((r) => {
        const url = r.active?.scriptURL || r.waiting?.scriptURL || r.installing?.scriptURL || '';
        if (!url || url.includes('push-sw.js')) return;
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

const NotificationSettingsWithGate = gatedStackScreen('NotificationSettings', NotificationSettingsScreen);
const AddTodoWithGate = gatedStackScreen('AddTodo', AddTodoScreen);
const ParentTaskWithGate = gatedStackScreen('ParentTask', ParentTaskScreen);

const DashboardThemeSettingsWithShell = withStackShell(DashboardThemeSettingsScreen, 'Tilpass hjem');

const NotificationsWithSwipe = withStackEdgeSwipe(NotificationsScreen);
const SubscriptionWithSwipe = withStackEdgeSwipe(SubscriptionScreen);
const WeatherSettingsWithSwipe = withStackEdgeSwipe(WeatherSettingsScreen);
const AppearanceSettingsWithSwipe = withStackEdgeSwipe(AppearanceSettingsScreen);
const ChatThreadWithSwipe = withStackEdgeSwipe(ChatThreadScreen);
const FriendChatThreadWithSwipe = withStackEdgeSwipe(FriendChatThreadScreen);
const AiChatWithSwipe = withStackEdgeSwipe(AiChatScreen);
const AssistantWithSwipe = withStackEdgeSwipe(AssistantScreen);
const GroupSettingsWithSwipe = withStackEdgeSwipe(GroupSettingsScreen);
const MemberSettingsWithSwipe = withStackEdgeSwipe(MemberSettingsScreen);
const ProfileSettingsWithSwipe = withStackEdgeSwipe(EditProfileScreen);
const CompanyJoinWithSwipe = withStackEdgeSwipe(PlatformJoinScreen);
const FriendsHubWithSwipe = withStackEdgeSwipe(FriendsHubScreen);

// Teknisk info til supportsaker (konsollfeil, feilede kall, siste steg). Se src/helpdesk/diagnostics.js.
installDiagnostics();

export default function App() {
  usePhoneVisualViewport();
  // Bare Ionicons (brukt overalt) lastes før første visning. MaterialCommunityIcons og Feather
  // brukes noen få steder og lastes av ikonkomponenten første gang de vises (1,4 MB mindre ved oppstart).
  const [fontsLoaded] = useFonts({
    ...Ionicons.font,
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
  const [, setLaunchRev] = useState(0);

  useEffect(() => {
    // On web, font loading can fail/corrupt due to cached assets.
    if (fontsLoaded || isWeb) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, isWeb]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    try {
      capturePendingAddFriendFromLocation(window.location.href);
      captureAgreementLinkFromLocation(window.location.href);
    } catch { /* ignore */ }
  }, [isWeb]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    // Never hard-reload while returning from Apple/Google OAuth — that wipes getRedirectResult.
    const oauthReturn = isLikelyOauthReturn() || isCalendarOauthReturn();
    if (oauthReturn) {
      window.localStorage.setItem('protop_app_build', APP_BUILD_ID);
      return undefined;
    }
    // Bundlen hører alltid til HTML-en som lastet den, så et nytt bygg siden forrige besøk
    // betyr bare at denne økten allerede kjører det nye. Før ga det en ekstra lasting etter
    // hver deploy. Lasting på nytt skjer bare når build.json under sier at serveren har et nyere.
    window.localStorage.setItem('protop_app_build', APP_BUILD_ID);
    // Local Metro (`npm run web`) skips this so hot reload is instant.
    // On protop.no, poll build.json so a new Hosting revision loads without
    // waiting for a stale PWA bundle.
    if (shouldSkipWebBuildRefresh({ hostname: window.location.hostname, oauthReturn })) {
      return undefined;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch(`${BUILD_JSON_PATH}?t=${Date.now()}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && shouldReloadForRemoteBuild(APP_BUILD_ID, data?.id)) {
          if (claimBuildReload(window.sessionStorage, data.id)) window.location.reload();
        }
      } catch { /* metro / offline */ }
    };
    check();
    const interval = window.setInterval(check, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
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
      // Åpnet via en lenke til en side i appen (/hjem/iso/avvik) før innlogging: gå dit, ikke til forsiden.
      const entry = takeEntryShellPath();
      const path = (window.location.pathname || '/').replace(/\/$/, '') || '/';
      if (isAuthEntryPath(path)) {
        const pending = peekPendingAddFriend() || capturePendingAddFriendFromLocation(window.location.href);
        const next = pending
          ? `/hjem?addFriend=${encodeURIComponent(pending)}`
          : (entry || '/hjem');
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
          const nav = applyBootNavigation(
            window,
            `/signup?addFriend=${encodeURIComponent(pending)}`,
            { standalone: isStandaloneDisplay() },
          );
          if (nav.kind === 'replaceState') setLaunchRev((n) => n + 1);
          return;
        }
        clearPreferApp();
        const nav = applyBootNavigation(window, '/', { standalone: isStandaloneDisplay() });
        if (nav.kind === 'replaceState') setLaunchRev((n) => n + 1);
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
          // LoginScreen / AuthChoice read protop_oauth_error from sessionStorage
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
    if (!loading) return undefined;
    // onAuthStateChanged can fail to arrive (IndexedDB / auth iframe).
    // The bootstrap fail-safe only flips authBootstrapped, so loading
    // would otherwise keep «Laster ProTop…» up forever.
    const watchdog = setTimeout(() => {
      const current = auth.currentUser;
      if (current) {
        setUser((prev) => prev || current);
        const email = (current.email || '').toLowerCase();
        setUserRole((role) => role || (isChildEmail(email) ? 'child' : 'parent'));
      }
      setLoading(false);
      console.warn('[auth] left spinner after wait');
    }, 8000);
    return () => clearTimeout(watchdog);
  }, [loading]);

  useEffect(() => {
    if (!authBootstrapped) return undefined;
    // Den som var innlogget i denne økten. Lokale kopier av ansatt-, HR- og fraværsdata fjernes
    // når hen logger ut eller en annen bruker logger inn (L-03), ikke ved en kald start uten bruker.
    let sessionUid = null;
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        const leaving = sessionUid;
        sessionUid = null;
        setUser(null);
        setUserRole(null);
        setLoading(false);
        // Drop legacy global familyId so the next account is not treated as a returning member.
        try {
          const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
          await AsyncStorage.removeItem('protop.familyId');
        } catch { /* ignore */ }
        if (leaving) clearSessionData().catch(() => {});
        return;
      }
      if (sessionUid && sessionUid !== u.uid) clearSessionData().catch(() => {});
      sessionUid = u.uid;
      // Barnekontoer hører til familieproduktet og har ingen vilkårsgodkjenning fra
      // foresatte. I ProTop logges de ut (L-35); innloggingen sier fra (LoginScreen).
      if (isChildEmail(u.email) && !childLoginAllowed()) {
        console.warn('[auth] barnekonto logges ut: familieproduktet er ikke med i ProTop');
        signOut(auth).catch(() => {});
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

        syncParentDocs(refreshedUser).catch(() => {});
        setReloadKey((prev) => prev + 1);
        // Barnekontoer er logget ut over (L-35), så alle som kommer hit er voksne brukere.
        setUserRole('parent');
      } catch (err) {
        console.error('Feil i onAuthStateChanged:', err);
        Alert.alert('Feil', 'Klarte ikke å hente/verifisere bruker.');
      } finally {
        setLoading(false);
      }
    });

    return unsubscribe;
  }, [authBootstrapped]);

  if ((!isWeb && !fontsLoaded) || !authBootstrapped || loading) {
    return <LoadingView label="Laster ProTop…" />;
  }

  const navKey = `${user?.uid || 'anon'}-${userRole || 'none'}-${reloadKey}`;
  const verifyEmail = (user?.email || justRegisteredEmail || '').toLowerCase();

  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AppProvider user={user} role={userRole}>
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
              try { await auth.authStateReady?.(); } catch { /* ignore */ }
              if (auth.currentUser) {
                try {
                  await reload(auth.currentUser);
                  setReloadKey((k) => k + 1);
                } catch {}
              }
            }}
          />
          <AgreementLinkHost />
          <HelpOverlay />
          <HelpModuleCard />
          <SaveToastHost />
          <StorageNotice />
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
    family, familyId, selectFamily, requestShellTab,
  } = useApp();
  const [localConsents, setLocalConsents] = useState(null);
  const [consentReady, setConsentReady] = useState(false);
  // Hard fail-safe: never leave returning parents on a blank boot spinner forever.
  const [bootTimedOut, setBootTimedOut] = useState(false);
  const [shellEnsureBusy, setShellEnsureBusy] = useState(false);
  // Brukeren (uid) som har fått svar på opprettelsen av arbeidsområdet i denne økten.
  const [shellEnsureSettled, setShellEnsureSettled] = useState(null);
  const shellEnsureAttemptedRef = React.useRef(null);
  // Registrert fra en invitasjonslenke: invitasjonen godtas når e-posten er bekreftet (UX-30).
  const inviteJoin = useInviteLinkJoin({
    user, userProfile, families, familiesReady, selectFamily, requestShellTab,
  });

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
    if (!user?.uid || consentsComplete(userProfile?.consents)) return undefined;
    if (consentsComplete(localConsents)) {
      persistUserConsents(user.uid, localConsents).catch(() => {});
      return undefined;
    }
    // Innloggingskortet lagrer godkjenningen lokalt etter at oppstarten leste den,
    // så les på nytt når brukeren er logget inn (ANSATT-03).
    let alive = true;
    loadLocalConsents().then((c) => {
      if (alive && consentsComplete(c)) setLocalConsents(c);
    }).catch(() => {});
    return () => { alive = false; };
  }, [user?.uid, localConsents, userProfile?.consents]);

  // Solo parents with a finished profile but no group get a personal shell
  // automatically — never park them on GetStarted.
  useEffect(() => {
    if (!user?.uid || userRole !== 'parent') return undefined;
    if (!userProfile?.profileComplete) return undefined;
    if (!familiesReady) return undefined;
    // Personen blir med i bedriften fra invitasjonslenken; da trengs ikke et eget skall først.
    if (inviteJoin.joining) return undefined;
    // Profilen lagres alt ved registreringen (UX-30). Arbeidsområdet lages først når e-posten
    // er bekreftet, så den som kommer fra en invitasjonslenke går rett inn i bedriften.
    const provider = user?.providerData?.[0]?.providerId;
    if ((!provider || provider === 'password') && !user.emailVerified) return undefined;
    const live = (families || []).filter(
      (f) => f.deleted !== true && f.hiddenFromApp !== true
        && f.archived !== true && f.active !== false,
    );
    if (live.length > 0) {
      shellEnsureAttemptedRef.current = null;
      setShellEnsureBusy(false);
      return undefined;
    }
    if (shellEnsureAttemptedRef.current === user.uid) {
      setShellEnsureBusy(false);
      return undefined;
    }
    shellEnsureAttemptedRef.current = user.uid;
    let alive = true;
    let finished = false;
    setShellEnsureBusy(true);
    const shellTimeout = setTimeout(() => {
      if (!alive) return;
      console.warn('[RootNav] personal shell timed out');
      setShellEnsureBusy(false);
      setShellEnsureSettled(user.uid);
    }, 12000);
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
        finished = true;
        clearTimeout(shellTimeout);
        if (alive) {
          setShellEnsureBusy(false);
          setShellEnsureSettled(user.uid);
        }
      }
    })();
    return () => {
      alive = false;
      clearTimeout(shellTimeout);
      // A new profile/family snapshot used to leave this flag true, so the
      // boot spinner never ended even after the family list arrived.
      setShellEnsureBusy(false);
      // Opprettelsen skriver selv users/{uid}, så effekten kjøres på nytt før svaret kommer.
      // Neste runde venter på samme opprettelse og velger arbeidsområdet. Før ble svaret
      // kastet, og «Laster ProTop…» sto til siden ble lastet på nytt (ANSATT-08).
      if (!finished) shellEnsureAttemptedRef.current = null;
    };
  }, [
    user, user?.emailVerified, userRole, userProfile, familiesReady, families, selectFamily, lang,
    inviteJoin.joining,
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
      if (p === '/faktura-demo' && DEV_DEMOS) return 'FakturaDemo';
      if (p === '/helpdesk-demo' && DEV_DEMOS) return 'HelpdeskDemo';
      if (p === '/helpdesk' || p.startsWith('/helpdesk/')) return 'Helpdesk';
      // Kundeundersøkelse: kunden svarer uten innlogging (lenke i e-post).
      if (p.startsWith('/svar/')) return 'SurveyAnswer';
      if (p === '/kundeundersokelse-demo' && DEV_DEMOS) return 'CustomerSurveyDemo';
      if (p === '/moter-demo' && DEV_DEMOS) return 'MeetingsDemo';
      if (p === '/anbud-demo' && DEV_DEMOS) return 'AnbudDemo';
      if (p === '/employee-detail-preview' && DEV_DEMOS) return 'EmployeeDetailPreview';
      if (p === '/customers-list-preview' && DEV_DEMOS) return 'CustomersListPreview';
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
    else if (inviteJoin.joining) stage = 'boot';
    // Never eject incomplete profiles to GetStarted — bootTimedOut only clears the
    // white spinner (boot stage). Kicking off ProfileSetup mid-birthday-picker left
    // new users on «Fant ikke familien din».
    else if (user && !profileOk) stage = 'profile';
    // Personal shell is created in the background; show a short boot while ensuring.
    else if (user && userRole === 'parent' && !hasGroups && !family?.id && !familyId) {
      stage = shouldHoldFamilyBootSpinner({
        bootTimedOut,
        ensuring: shellEnsureBusy || shellEnsureSettled !== user.uid,
      }) ? 'boot' : 'homeSetup';
    }
    else if (needsHomeSetup) stage = 'homeSetup';
    else stage = 'app';
  }

  const initial = forceCalendarOauth ? 'CalendarOAuthRedirect'
    // Utlogget går til Login på alle plattformer (ikke familieappens velkomstside i app-butikk-appen).
    // Web: login/signup paths use welcomePathEntry; /hjem|/start redirect to the marketing homepage above.
    : stage === 'welcome' ? (welcomePathEntry || 'Login')
    : stage === 'language' ? 'PickLanguage'
    : stage === 'auth' ? 'AuthChoice'
    : stage === 'verify' ? 'VerifyEmail'
    : stage === 'profile' ? 'ProfileSetup'
    : stage === 'homeSetup' ? 'HomeSetupOnboarding'
    : stage === 'start' ? 'HomeSetupOnboarding'
    : (!hasLiveGroups && hasGroups) ? 'FamilyOverview'
    : 'Home';

  // Hooks must be called unconditionally (before any early return)
  const goAfterLegal = (nav) => {
    if (!user) nav.replace('AuthChoice');
    else if (!profileOk) nav.replace('ProfileSetup');
    else if (needsHomeSetup || (!hasGroups && !familyId)) nav.replace('HomeSetupOnboarding');
    else if (!hasLiveGroups) nav.replace('FamilyOverview');
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
        // Bekreftelseslenken (/verify-email?vt=…) skal ikke åpnes på nytt når bedriften er klar.
        if (!isAuthEntryPath(path) && !path.startsWith('/verify-email')) return;
      }
      navRef.current.reset({ index: 0, routes: [{ name: initial }] });
    }
  }, [stage, initial, forceCalendarOauth]);

  if (stage === 'boot') return <LoadingView label={inviteJoin.joining ? 'Åpner bedriften…' : 'Laster ProTop…'} />;

  // SessionOverlays must mount for any signed-in user past boot — not only
  // stage==='app'. Users on legal/profile/language/start otherwise never see
  // friend/family invite gates (listFriendRequests never runs).
  if (pendingMarketingRedirect) return <LoadingView label="Åpner ProTop…" />;

  return (
    <NavigationContainer
      ref={navRef}
      linking={linking}
      onReady={() => setAppNav(navRef.current)}
      // Familieskjermene finnes ikke i ProTop (L-35). Lenker går til Hjem (linking.js);
      // kommer en navigering dit likevel, sendes brukeren til Hjem.
      onStateChange={(state) => {
        if (blockedFamilyProductRoute(state) && navRef.current) {
          navRef.current.reset({ index: 0, routes: [{ name: 'Home' }] });
        }
      }}
    >
      <Stack.Navigator initialRouteName={initial} screenOptions={{ headerShown: false, title: 'ProTop', contentStyle: { flex: 1 }, gestureEnabled: true, fullScreenGestureEnabled: true }}>
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
        {DEV_DEMOS ? <Stack.Screen name="FakturaDemo" component={FakturaDemoScreen} options={{ headerShown: false }} /> : null}
        <Stack.Screen name="Helpdesk" component={HelpdeskPortalScreen} options={{ headerShown: false, title: 'ProTop Helpdesk' }} />
        {DEV_DEMOS ? <Stack.Screen name="HelpdeskDemo" component={HelpdeskDemoScreen} options={{ headerShown: false }} /> : null}
        <Stack.Screen name="SurveyAnswer" component={SurveyAnswerScreen} options={{ headerShown: false, title: 'Kundeundersøkelse' }} />
        {DEV_DEMOS ? <Stack.Screen name="CustomerSurveyDemo" component={CustomerSurveyDemoScreen} options={{ headerShown: false }} /> : null}
        {DEV_DEMOS ? <Stack.Screen name="MeetingsDemo" component={MeetingsDemoScreen} options={{ headerShown: false }} /> : null}
        {DEV_DEMOS ? <Stack.Screen name="AnbudDemo" component={AnbudDemoScreen} options={{ headerShown: false }} /> : null}
        {DEV_DEMOS ? <Stack.Screen name="EmployeeDetailPreview" component={EmployeeDetailPreview} options={{ headerShown: false }} /> : null}
        {DEV_DEMOS ? <Stack.Screen name="CustomersListPreview" component={CustomersListPreview} options={{ headerShown: false }} /> : null}
        <Stack.Screen
          name="CalendarOAuthRedirect"
          component={CalendarOAuthRedirectScreen}
          options={{ headerShown: false }}
        />

        <Stack.Group>
          <Stack.Screen name="AuthChoice" component={AuthChoiceScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register">
            {(props) => <RegisterScreen {...props} setJustRegisteredEmail={setJustRegisteredEmail} />}
          </Stack.Screen>
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
            <Stack.Screen name="Home" component={AppShell} />
            <Stack.Screen name="CreateCompany" component={CreateCompanyScreen} options={{ headerShown: false }} />
        {/* Bli med i en bedrift med kode (fra «Bli med i bedrift»). Tidligere rute: GroupJoin. */}
        <Stack.Screen name="CompanyJoin" component={CompanyJoinWithSwipe} options={{ headerShown: false }} initialParams={{ platformType: 'organization' }} />
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
            <Stack.Screen name="Templates" component={TemplateListScreen} />
            <Stack.Screen name="Profile" component={ProfileScreen} />
            <Stack.Screen name="ParentProfile" component={ParentProfileScreen} />
            <Stack.Screen name="Confirmation" component={ConfirmationScreen} />
            <Stack.Screen name="SelectFamilyScreen" component={SelectFamilyScreen} />
            <Stack.Screen name="AddTodo" component={AddTodoWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="AiChat" component={AiChatWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="ProtopAssistant" component={AssistantWithSwipe} options={{ headerShown: false }} />
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
            <Stack.Screen name="NotificationSettings" component={NotificationSettingsWithGate} options={{ headerShown: false }} />
            <Stack.Screen name="WeatherSettings" component={WeatherSettingsWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="AppearanceSettings" component={AppearanceSettingsWithSwipe} options={{ headerShown: false }} />
            <Stack.Screen name="DashboardThemeSettings" component={DashboardThemeSettingsWithShell} options={{ headerShown: false }} />
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
        <Text style={{ fontWeight: '400', fontSize: 18, marginBottom: 10, color: '#b91c1c' }}>
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
