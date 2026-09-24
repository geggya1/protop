/**
 * Unified accept/decline for pending game invites (overlay + deep links).
 */

import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import {
  GAME_TYPES,
  GAME_COLLECTIONS,
  setGameInviteResponse,
  markGameInviteInbox,
} from './familyGamesShared';
import { acceptQuizInvite, declineQuizInvite } from './familyQuiz';
import { acceptTttInvite, declineTttInvite } from './ticTacToe';
import { acceptRpsInvite, declineRpsInvite } from './rockPaperScissors';
import { acceptGuessInvite, declineGuessInvite } from './guessNumber';
import { acceptDrawGuessInvite, declineDrawGuessInvite } from './drawGuess';
import { acceptConnect4Invite, declineConnect4Invite } from './connect4';
import { acceptChessInvite, declineChessInvite } from './chessOnline';
import { acceptMemoryInvite, declineMemoryInvite } from './memoryOnline';

export async function respondToGameInvite({
  familyId,
  gameType,
  gameId,
  uid,
  name,
  response,
}) {
  if (!familyId || !gameType || !gameId || !uid) throw new Error('missing-params');
  if (response !== 'accepted' && response !== 'declined') {
    throw new Error('invalid-response');
  }

  // Prefer Admin path so invited friends (non-members) can respond without family rules.
  try {
    const fn = httpsCallable(functions, 'respondFriendGameInviteAdmin');
    const res = await fn({
      familyId,
      gameType,
      gameId,
      response,
      name,
      collection: GAME_COLLECTIONS[gameType] || '',
    });
    if (res?.data?.ok) {
      return {
        familyId: res.data.familyId || familyId,
        gameType,
        gameId: res.data.gameId || gameId,
        response,
      };
    }
  } catch {
    /* fall through to client writers */
  }

  const params = { gameId, uid, name };
  if (response === 'accepted') {
    if (gameType === GAME_TYPES.quiz) await acceptQuizInvite(familyId, params);
    else if (gameType === GAME_TYPES.ttt) await acceptTttInvite(familyId, params);
    else if (gameType === GAME_TYPES.rps) await acceptRpsInvite(familyId, params);
    else if (gameType === GAME_TYPES.guess) await acceptGuessInvite(familyId, params);
    else if (gameType === GAME_TYPES.draw) await acceptDrawGuessInvite(familyId, params);
    else if (gameType === GAME_TYPES.connect4) await acceptConnect4Invite(familyId, params);
    else if (gameType === GAME_TYPES.chess) await acceptChessInvite(familyId, params);
    else if (gameType === GAME_TYPES.memory) await acceptMemoryInvite(familyId, params);
    else {
      const col = GAME_COLLECTIONS[gameType];
      if (!col) throw new Error('unknown-game');
      await setGameInviteResponse(familyId, col, gameId, uid, 'accepted');
    }
  } else if (gameType === GAME_TYPES.quiz) await declineQuizInvite(familyId, params);
  else if (gameType === GAME_TYPES.ttt) await declineTttInvite(familyId, params);
  else if (gameType === GAME_TYPES.rps) await declineRpsInvite(familyId, params);
  else if (gameType === GAME_TYPES.guess) await declineGuessInvite(familyId, params);
  else if (gameType === GAME_TYPES.draw) await declineDrawGuessInvite(familyId, params);
  else if (gameType === GAME_TYPES.connect4) await declineConnect4Invite(familyId, params);
  else if (gameType === GAME_TYPES.chess) await declineChessInvite(familyId, params);
  else if (gameType === GAME_TYPES.memory) await declineMemoryInvite(familyId, params);
  else {
    const col = GAME_COLLECTIONS[gameType];
    if (!col) throw new Error('unknown-game');
    await setGameInviteResponse(familyId, col, gameId, uid, 'declined');
  }

  // Accept paths that update inviteStatus directly still need inbox sync.
  await markGameInviteInbox(uid, gameType, gameId, response);
  return { familyId, gameType, gameId, response };
}
