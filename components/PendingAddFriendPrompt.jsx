import React, { useEffect, useState } from 'react';
import { useApp } from '../src/context/AppContext';
import AddFriendModal from './AddFriendModal';
import {
  hydratePendingAddFriend,
  peekPendingAddFriend,
  consumePendingAddFriend,
} from '../src/utils/pendingAddFriend';

/**
 * After login + family/group exists, open Add Friend with QR username autofilled.
 * User must press Inviter themselves.
 */
export default function PendingAddFriendPrompt({ enabled = true }) {
  const { uid, familyId } = useApp();
  const [username, setUsername] = useState('');

  useEffect(() => {
    if (!enabled || !uid || !familyId) {
      setUsername('');
      return undefined;
    }
    let alive = true;
    hydratePendingAddFriend().then((u) => {
      if (!alive) return;
      setUsername(u || peekPendingAddFriend());
    });
    return () => { alive = false; };
  }, [enabled, uid, familyId]);

  if (!enabled || !uid || !familyId || !username) return null;

  return (
    <AddFriendModal
      visible
      username={username}
      onClose={() => {
        consumePendingAddFriend();
        setUsername('');
      }}
    />
  );
}
