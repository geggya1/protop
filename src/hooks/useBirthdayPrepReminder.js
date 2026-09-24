import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  birthdayPrepDismissKey,
  birthdayPrepYear,
  findDueBirthdayPrep,
} from '../utils/birthdayPrepReminder';
import { ensureBirthdayPrepNotifications } from '../utils/birthdayPrepActions';
import { registerBirthdayPrepResume } from '../utils/birthdayPrepBridge';
import { memberBirthdayItems } from '../utils/rememberDatesLogic';

async function wasDismissed(uid, memberId, year) {
  if (!uid || !memberId || !year) return true;
  try {
    const val = await AsyncStorage.getItem(birthdayPrepDismissKey(uid, memberId, year));
    return val === '1';
  } catch {
    return false;
  }
}

export async function markBirthdayPrepDismissed(uid, memberId, year) {
  if (!uid || !memberId || !year) return;
  try {
    await AsyncStorage.setItem(birthdayPrepDismissKey(uid, memberId, year), '1');
  } catch { /* ignore */ }
}

function resolveItemFromPayload(payload, members, now = new Date()) {
  if (!payload) return null;
  const memberId = payload.memberId || payload.childId || null;
  if (!memberId) return null;
  const member = (members || []).find(
    (m) => m.id === memberId || m.docId === memberId || m.childId === memberId || m.uid === memberId,
  );
  if (!member?.birthday) {
    if (payload.dateKey || payload.title) {
      return {
        memberId,
        memberName: String(payload.title || '')
          .replace(/\s*bursdag.*$/i, '')
          .trim() || 'Familiemedlem',
        role: payload.childId ? 'child' : null,
        daysUntil: null,
        nextDate: payload.dateKey ? new Date(`${payload.dateKey}T12:00:00`) : null,
        dateKey: payload.dateKey || null,
      };
    }
    return null;
  }
  const items = memberBirthdayItems([member], now);
  return items[0] || null;
}

function membersBirthdaySig(members) {
  return (members || [])
    .map((m) => `${m?.id || m?.docId || ''}:${m?.birthday || ''}:${m?.role || ''}`)
    .join('|');
}

/**
 * Viser bursdagsforberedelse-popup for voksne når det er ≤20 dager til bursdag.
 * Varsel skrives til inbox slik at det kan gjenopptas fra bjelle-menyen.
 */
export function useBirthdayPrepReminder({
  uid,
  familyId,
  members = [],
  enabled = true,
} = {}) {
  const [item, setItem] = useState(null);
  const [resumeMode, setResumeMode] = useState(false);
  const [ready, setReady] = useState(false);
  const membersRef = useRef(members);
  membersRef.current = members;
  const sig = useMemo(() => membersBirthdaySig(members), [members]);

  const dueList = useMemo(
    () => (enabled ? findDueBirthdayPrep({ members: membersRef.current }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, sig],
  );

  const check = useCallback(async () => {
    const list = membersRef.current;
    if (!enabled || !uid || !familyId) {
      setItem(null);
      setReady(true);
      return;
    }
    const due = findDueBirthdayPrep({ members: list });
    let next = null;
    for (const candidate of due) {
      const year = birthdayPrepYear(candidate.nextDate);
      // eslint-disable-next-line no-await-in-loop
      const dismissed = await wasDismissed(uid, candidate.memberId, year);
      if (!dismissed) {
        next = candidate;
        break;
      }
    }
    if (next) {
      ensureBirthdayPrepNotifications({
        familyId,
        members: list,
        item: next,
      }).catch(() => {});
    }
    setResumeMode(false);
    setItem(next);
    setReady(true);
    // sig tracks member birthday changes without thrashing on new array refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, uid, familyId, sig]);

  useEffect(() => {
    setReady(false);
    check();
  }, [check]);

  const resume = useCallback((payload) => {
    const list = membersRef.current;
    const resolved = resolveItemFromPayload(payload, list);
    if (!resolved) return;
    setResumeMode(true);
    setItem(resolved);
    setReady(true);
    if (familyId) {
      ensureBirthdayPrepNotifications({
        familyId,
        members: list,
        item: resolved,
      }).catch(() => {});
    }
  }, [familyId]);

  useEffect(() => {
    registerBirthdayPrepResume(resume);
    return () => registerBirthdayPrepResume(null);
  }, [resume]);

  const dismiss = useCallback(async ({ skipNext = false } = {}) => {
    if (item?.memberId && uid) {
      const year = birthdayPrepYear(item.nextDate);
      await markBirthdayPrepDismissed(uid, item.memberId, year);
    }
    setItem(null);
    setResumeMode(false);
    if (!skipNext && !resumeMode) {
      check();
    }
  }, [item, uid, resumeMode, check]);

  return useMemo(() => ({
    item: ready ? item : null,
    visible: ready && !!item,
    resumeMode,
    dueCount: dueList.length,
    dismiss,
    refresh: check,
  }), [ready, item, resumeMode, dueList.length, dismiss, check]);
}
