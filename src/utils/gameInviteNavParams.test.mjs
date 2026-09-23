import assert from 'node:assert/strict';
import { gameInviteNavParams } from './gameInviteNav.js';

assert.deepEqual(
  gameInviteNavParams({ familyId: 'fam1', gameId: 'game1' }),
  { mode: 'online', familyId: 'fam1', inviteGameId: 'game1' },
);
assert.deepEqual(gameInviteNavParams({}), { mode: 'online' });
assert.deepEqual(
  gameInviteNavParams({ familyId: 'f' }),
  { mode: 'online', familyId: 'f' },
);

console.log('gameInviteNavParams.test.mjs: ok');
