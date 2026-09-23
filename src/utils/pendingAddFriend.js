/** Persist QR /add-friend username through signup, family setup, then Add Friend popup. */

import { normalizeFriendUsername, parseFriendAddUsername } from './friendsLogic.js';

export const PENDING_ADD_FRIEND_KEY = 'weekplan_pending_add_friend';

let memory = '';

function webStorage() {
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch { /* private mode */ }
  return null;
}

function writeNative(value) {
  import('@react-native-async-storage/async-storage')
    .then((mod) => {
      const AS = mod.default;
      if (value) return AS.setItem(PENDING_ADD_FRIEND_KEY, value);
      return AS.removeItem(PENDING_ADD_FRIEND_KEY);
    })
    .catch(() => {});
}

export function persistPendingAddFriend(username) {
  const u = normalizeFriendUsername(username);
  if (!u) return '';
  memory = u;
  try {
    webStorage()?.setItem(PENDING_ADD_FRIEND_KEY, u);
  } catch { /* ignore */ }
  writeNative(u);
  return u;
}

export function peekPendingAddFriend() {
  if (memory) return memory;
  try {
    const v = normalizeFriendUsername(webStorage()?.getItem(PENDING_ADD_FRIEND_KEY));
    if (v) {
      memory = v;
      return v;
    }
  } catch { /* ignore */ }
  return '';
}

export async function hydratePendingAddFriend() {
  const sync = peekPendingAddFriend();
  if (sync) return sync;
  try {
    const mod = await import('@react-native-async-storage/async-storage');
    const v = normalizeFriendUsername(await mod.default.getItem(PENDING_ADD_FRIEND_KEY));
    if (v) {
      memory = v;
      try { webStorage()?.setItem(PENDING_ADD_FRIEND_KEY, v); } catch { /* ignore */ }
      return v;
    }
  } catch { /* ignore */ }
  return memory || '';
}

export function consumePendingAddFriend() {
  const u = peekPendingAddFriend();
  memory = '';
  try { webStorage()?.removeItem(PENDING_ADD_FRIEND_KEY); } catch { /* ignore */ }
  writeNative('');
  return u;
}

export function capturePendingAddFriendFromLocation(pathOrUrl) {
  const u = parseFriendAddUsername(pathOrUrl);
  if (u) persistPendingAddFriend(u);
  return u || peekPendingAddFriend();
}
