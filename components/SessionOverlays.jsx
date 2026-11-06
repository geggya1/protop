import React, { useEffect, useState } from 'react';
import { NavigationRouteContext, useNavigation } from '@react-navigation/native';
import { useApp } from '../src/context/AppContext';
import { useHelp } from '../src/context/HelpContext';
import { routeFromNavigation } from '../src/navigation/routeFromNavigation';
import DailyGreetingModal from './DailyGreetingModal';
import BiometricLockOverlay from './BiometricLockOverlay';
import ChatDockHost from './ChatDock';
import InviteRespondOverlay from './InviteRespondOverlay';
import PendingAddFriendPrompt from './PendingAddFriendPrompt';
import MajorUpdateModal from './MajorUpdateModal';
import LegalUpdateNotice from './LegalUpdateNotice';
import JoinVerifyNotice from './JoinVerifyNotice';
import {
  defaultGreetingEnabled,
  loadGreetingPrefs,
  subscribeGreetingPrefs,
} from '../src/utils/greetingPrefs';

/** Popups og lås som gjelder alle innloggede brukere (familie, lag, klasse osv.). */
export default function SessionOverlays() {
  const nav = useNavigation();
  const overlayRoute = routeFromNavigation(nav);
  const { uid, loading, isChild } = useApp();
  const help = useHelp();
  const [greetingEnabled, setGreetingEnabled] = useState(() => defaultGreetingEnabled(isChild));
  const [hasPendingInvites, setHasPendingInvites] = useState(false);

  // Friend/family invite gate must not wait on AppContext family-list loading —
  // that boot can hang or stay true and then listFriendRequests never runs,
  // so the invitee sees no overlay/varsel despite a pending request.

  useEffect(() => {
    if (!uid) {
      setGreetingEnabled(defaultGreetingEnabled(isChild));
      return undefined;
    }
    let alive = true;
    loadGreetingPrefs(uid, { isChild }).then((s) => {
      if (alive) setGreetingEnabled(!!s.enabled);
    });
    const unsub = subscribeGreetingPrefs((s) => {
      if (!alive) return;
      if (typeof s?.enabled === 'boolean') setGreetingEnabled(s.enabled);
    });
    return () => { alive = false; unsub(); };
  }, [uid, isChild]);

  // Invite gate outranks help tour — welcome portal uses a sky-high z-index on web.
  useEffect(() => {
    if (!hasPendingInvites) return;
    try { help?.dismiss?.({ welcome: false, module: false }); } catch { /* ignore */ }
  }, [hasPendingInvites, help]);

  if (!uid) return null;
  const invitesEnabled = true;
  return (
    <NavigationRouteContext.Provider value={overlayRoute}>
      <InviteRespondOverlay
        enabled={invitesEnabled}
        onPendingChange={setHasPendingInvites}
      />
      <PendingAddFriendPrompt enabled={invitesEnabled && !hasPendingInvites} />
      <DailyGreetingModal
        uid={uid}
        enabled={!loading && invitesEnabled && greetingEnabled && !hasPendingInvites}
      />
      <MajorUpdateModal
        enabled={!loading && invitesEnabled && !hasPendingInvites}
      />
      {invitesEnabled && !hasPendingInvites ? <LegalUpdateNotice /> : null}
      {/* Invitasjonslenke, men e-posten er ikke bekreftet (f.eks. Microsoft): vei videre (UX-30). */}
      {invitesEnabled && !hasPendingInvites ? <JoinVerifyNotice /> : null}
      <BiometricLockOverlay uid={uid} />
      <ChatDockHost />
    </NavigationRouteContext.Provider>
  );
}
