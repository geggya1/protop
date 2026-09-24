/**
 * Apply notification / deep-link route params for online family games.
 * Lands invitees on the online hub (accept UI) unless they already have a seated gameId.
 */
import { useEffect } from 'react';
import { GAME_PLAY_MODES } from '../../components/GameModePicker';

export function useOnlineInviteRoute(route, {
  setMode,
  setView,
  setGameId,
  uid,
  game,
}) {
  // Notification / deep-link: open online invite hub (not mode picker).
  useEffect(() => {
    const m = route?.params?.mode;
    if (m === 'ai' || m === 'hotseat' || m === 'online') {
      setMode?.(m);
      if (m === 'online' && !route?.params?.gameId) {
        setView?.('hub');
      }
    }
  }, [route?.params?.mode, route?.params?.gameId, setMode, setView]);

  // After accept (overlay) — open the joined game.
  useEffect(() => {
    const nextId = route?.params?.gameId || null;
    if (!nextId) return;
    setGameId?.(nextId);
    setMode?.(GAME_PLAY_MODES.online);
  }, [route?.params?.gameId, setGameId, setMode]);

  // If gameId was opened while still pending for this user, keep hub so they can accept.
  useEffect(() => {
    if (!game || !uid || !setView) return;
    const seated = game.playerX?.uid === uid
      || game.playerO?.uid === uid
      || game.player1?.uid === uid
      || game.player2?.uid === uid
      || game.playerWhite?.uid === uid
      || game.playerBlack?.uid === uid
      || game.hostUid === uid;
    const pending = (game.inviteStatus || {})[uid] === 'pending'
      || ((game.invitedUids || []).includes(uid) && !seated && game.status === 'waiting');
    if (pending && !seated) {
      setView('hub');
    } else if (route?.params?.gameId && seated) {
      setView('game');
    }
  }, [game, uid, setView, route?.params?.gameId]);
}
