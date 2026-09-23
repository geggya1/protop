import { useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../context/AppContext';

/** Sentral navigasjon ved profilbytte (Netflix-modell). */
export function useProfileNavigation() {
  const nav = useNavigation();
  const {
    isChild,
    isParent,
    isGrandparent,
    activeProfileKind,
    activeChildId,
    activeProfile,
    meParent,
    userProfile,
    user,
    kids,
    switchToParentProfile,
    switchToChildProfile,
  } = useApp();

  const parentTile = {
    name: meParent?.name || userProfile?.displayName || user?.displayName || 'Meg',
    avatarId: meParent?.avatarId || userProfile?.avatarId || null,
    photoURL: meParent?.photoURL || meParent?.photoUrl || user?.photoURL || null,
  };

  const canSwitchProfiles = isParent && !isGrandparent;

  const goParentProfile = useCallback(() => {
    switchToParentProfile();
    nav.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  }, [switchToParentProfile, nav]);

  const goChildProfile = useCallback((kid) => {
    const child = kid?.id ? kid : kids.find((k) => k.id === kid);
    if (!child) return;
    switchToChildProfile(child.id);
    nav.reset({
      index: 0,
      routes: [{ name: 'Home' }],
    });
  }, [switchToChildProfile, nav, kids]);

  return {
    activeProfileKind,
    activeChildId,
    activeProfile,
    parentTile,
    canSwitchProfiles,
    goParentProfile,
    goChildProfile,
    isChildAccount: isChild,
  };
}
