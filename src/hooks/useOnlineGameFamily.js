/**
 * Friend-aware online games: host family may differ from the invitee's active family.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listenIncomingGameInvites,
} from '../utils/familyGamesShared';
import { respondToGameInvite } from '../utils/gameInviteRespond';

/** Resolve which family owns the open game (route / accept override / app family). */
export function useOnlineGameFamily(route, appFamilyId) {
  const routeFamilyId = route?.params?.familyId || null;
  const [overrideFamilyId, setOverrideFamilyId] = useState(routeFamilyId);
  useEffect(() => {
    if (routeFamilyId) setOverrideFamilyId(routeFamilyId);
  }, [routeFamilyId]);
  const effectiveFamilyId = overrideFamilyId || appFamilyId || null;
  return { effectiveFamilyId, setGameFamilyId: setOverrideFamilyId };
}

/**
 * Merge family-scoped pending invites with users/{uid}/gameInvites for one game type.
 * Rows always expose `id` === gameId for GameInvitePanel + `familyId` for cross-family accept.
 */
export function useMergedTypeGameInvites({
  familyId,
  uid,
  gameType,
  listenFamilyPending,
  enabled = true,
}) {
  const [familyInvites, setFamilyInvites] = useState([]);
  const [inboxInvites, setInboxInvites] = useState([]);

  useEffect(() => {
    if (!enabled || !familyId || !uid || !listenFamilyPending) {
      setFamilyInvites([]);
      return undefined;
    }
    return listenFamilyPending(familyId, uid, setFamilyInvites);
  }, [enabled, familyId, uid, listenFamilyPending]);

  useEffect(() => {
    if (!enabled || !uid || !gameType) {
      setInboxInvites([]);
      return undefined;
    }
    return listenIncomingGameInvites(uid, (list) => {
      setInboxInvites((list || []).filter((i) => i.gameType === gameType && i.status === 'pending'));
    });
  }, [enabled, uid, gameType]);

  return useMemo(() => {
    const map = new Map();
    (familyInvites || []).forEach((g) => {
      const gid = g.id;
      if (!gid) return;
      map.set(gid, {
        id: gid,
        gameId: gid,
        familyId,
        gameType,
        hostName: g.hostName,
        title: g.hostName || 'Spillinvitasjon',
      });
    });
    (inboxInvites || []).forEach((inv) => {
      const gid = inv.gameId;
      if (!gid || map.has(gid)) return;
      map.set(gid, {
        id: gid,
        gameId: gid,
        familyId: inv.familyId || familyId,
        gameType: inv.gameType || gameType,
        hostName: inv.hostName,
        title: inv.gameTitle || inv.hostName || 'Spillinvitasjon',
      });
    });
    return [...map.values()];
  }, [familyInvites, inboxInvites, familyId, gameType]);
}

/** Accept/decline using Admin path so friends outside the host family can join. */
export function useRespondGameInvite({ uid, name, gameType, setGameFamilyId }) {
  return useCallback(async (inv, response) => {
    const fid = inv?.familyId;
    const gid = inv?.gameId || inv?.id;
    if (!fid || !gid || !uid) throw new Error('missing-params');
    if (response === 'accepted' && setGameFamilyId) setGameFamilyId(fid);
    await respondToGameInvite({
      familyId: fid,
      gameType,
      gameId: gid,
      uid,
      name,
      response,
    });
    return { familyId: fid, gameId: gid };
  }, [uid, name, gameType, setGameFamilyId]);
}
