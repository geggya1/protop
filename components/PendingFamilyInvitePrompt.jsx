import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../src/context/AppContext';

/**
 * Deep-link helper only. Accept/decline UI lives in InviteRespondOverlay
 * (mandatory full-screen gate after login).
 */
export default function PendingFamilyInvitePrompt() {
  const nav = useNavigation();
  const { uid } = useApp();

  useEffect(() => {
    if (!uid || Platform.OS !== 'web' || typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search || '');
      let inviteId = params.get('familyInvite');
      let familyId = params.get('familyId');
      const pathMatch = String(window.location.pathname || '').match(
        /\/family-invite\/([^/]+)\/([^/]+)/i,
      );
      if (pathMatch) {
        familyId = familyId || decodeURIComponent(pathMatch[1]);
        inviteId = inviteId || decodeURIComponent(pathMatch[2]);
      }
      if (inviteId && familyId) {
        nav.navigate('FamilyInviteRespond', { familyId, inviteId });
        window.history.replaceState({}, '', `${window.location.origin}/`);
      }
    } catch { /* ignore */ }
  }, [uid, nav]);

  return null;
}
