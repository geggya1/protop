import { useContext } from 'react';
import { NavigationRouteContext } from '@react-navigation/core';

/**
 * Like useRoute(), but returns undefined outside a Screen instead of throwing.
 * Session overlays and RN-web modals can mount without NavigationRouteContext
 * (PendingAddFriendPrompt → AddFriendModal, SessionOverlays sibling of the stack).
 */
export function useOptionalRoute() {
  return useContext(NavigationRouteContext);
}

export default useOptionalRoute;
