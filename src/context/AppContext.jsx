import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { MEMBER_COLORS } from '../theme';
import { ageBand, profileAge } from '../utils/age';
import { isChildEmail } from '../utils/session';
import { dedupeFamilyParents, archiveSupersededParentPlaceholders, isGroupDeleted } from '../utils/groups';
import { ensureListedOnFamily, isListedOnFamilyData } from '../utils/familyMembership';
import { canUsePlatformType, visibleGroupsForUser } from '../utils/platformAccess';
import {
  loadFamilyListCache,
  peekFamilyListCache,
  putFamilyListCache,
} from '../utils/familyListCache';
import { listMyFamilies } from '../utils/joinRequests';
import { resetSharedCollectionListeners } from '../utils/sharedCollectionListeners';
import { resetCostGuards } from '../utils/costGuards';
import { listenFriends } from '../utils/friends';
import { friendProfileOwnerUid } from '../utils/friendsLogic';
import { preferAuthUid } from '../utils/inviteAuthUid';

const Ctx = createContext(null);
const FAMILY_KEY = 'weekplan.familyId';
const PROFILE_KEY = 'weekplan.activeProfile';
const PROFILE_CACHE_KEY = 'weekplan.profileCache';

function familyStorageKey(uid) {
  return uid ? `${FAMILY_KEY}.${uid}` : FAMILY_KEY;
}

async function readStoredFamilyId(uid) {
  try {
    if (uid) {
      const scoped = await AsyncStorage.getItem(familyStorageKey(uid));
      if (scoped) return scoped;
    }
    // Legacy global key (pre per-uid) — only accept after callers verify access.
    return await AsyncStorage.getItem(FAMILY_KEY);
  } catch {
    return null;
  }
}

async function writeStoredFamilyId(uid, id) {
  try {
    if (uid) await AsyncStorage.setItem(familyStorageKey(uid), id || '');
    // Keep legacy key in sync for older builds; clear when empty.
    if (id) await AsyncStorage.setItem(FAMILY_KEY, id);
    else await AsyncStorage.removeItem(FAMILY_KEY);
  } catch { /* ignore */ }
}

function colorFor(i) {
  return MEMBER_COLORS[i % MEMBER_COLORS.length];
}

export function AppProvider({ user, role, childProfile, childFamilyId, children }) {
  const [families, setFamilies] = useState([]);
  const userRef = useRef(user);
  userRef.current = user;
  const [familyId, setFamilyIdState] = useState(childFamilyId || null);
  const [family, setFamily] = useState(null);
  const [parents, setParents] = useState([]);
  const [kids, setKids] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  /** True after family list query finishes — used so RootNav does not flash ProfileSetup. */
  const [familiesReady, setFamiliesReady] = useState(false);
  const [familiesLoadError, setFamiliesLoadError] = useState(null);

  const [userProfile, setUserProfile] = useState(null);
  const [cachedProfile, setCachedProfile] = useState(null);
  const [userProfileReady, setUserProfileReady] = useState(false);
  const uid = user?.uid || null;
  const isChild = role === 'child' || isChildEmail(user?.email);
  const isParent = !isChild;

  const [activeProfileKind, setActiveProfileKindState] = useState(() => (
    role === 'child' || isChildEmail(user?.email) ? 'child' : 'parent'
  ));
  const [activeChildId, setActiveChildIdState] = useState(() => (
    (role === 'child' || isChildEmail(user?.email)) ? (childProfile?.id || null) : null
  ));
  const [shellNav, setShellNav] = useState(null);
  const [shellIntent, setShellIntent] = useState(null);

  const requestShellTab = React.useCallback((tab, subView = null, intent = null) => {
    if (tab == null) {
      setShellNav(null);
      return;
    }
    let nextTab = tab;
    let nextSub = subView || null;
    let nextIntent = intent || null;
    if (nextTab === 'more' && nextSub === 'addMember') {
      nextSub = 'members';
      nextIntent = nextIntent || 'addMember';
    }
    if (nextIntent) setShellIntent(nextIntent);
    else setShellIntent(null);
    setShellNav({ tab: nextTab, subView: nextSub });
  }, []);

  const clearShellIntent = React.useCallback(() => {
    setShellIntent(null);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!uid) {
        setFamilies([]);
        setFamilyIdState(null);
        setFamiliesLoadError(null);
        setLoading(false);
        setFamiliesReady(true);
        resetSharedCollectionListeners();
        resetCostGuards();
        return;
      }
      setLoading(true);
      setFamiliesReady(false);
      setFamiliesLoadError(null);
      try {
        if (isChild) {
          const id = childFamilyId || childProfile?.familyId;
          if (id) {
            const snapPromise = getDoc(doc(db, 'families', id));
            const timeout = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('child-family-timeout')), 15000);
            });
            const snap = await Promise.race([snapPromise, timeout]);
            if (alive && snap.exists() && !isGroupDeleted(snap.data())) {
              setFamilies([{ id: snap.id, ...snap.data() }]);
              setFamilyIdState(id);
            } else if (alive) {
              setFamilies([]);
              setFamilyIdState(null);
            }
          } else if (alive) {
            setFamilies([]);
            setFamilyIdState(null);
          }
          return;
        }

        // Vis shell raskt med sist brukte familie + cachet gruppeliste mens Firestore-søk kjører.
        // Ikke sett familiesReady her — ellers flasher ProfileSetup før listene er hentet.
        try {
          const scopedEarly = await AsyncStorage.getItem(familyStorageKey(uid));
          const legacyEarly = scopedEarly ? null : await AsyncStorage.getItem(FAMILY_KEY);
          const earlyId = scopedEarly || legacyEarly;
          if (alive && earlyId) {
            // Legacy id is only used for a fast shell; membershipHints still require proof.
            setFamilyIdState((cur) => cur || earlyId);
            setLoading(false);
          } else if (alive) {
            setFamilyIdState(null);
          }
          const cached = peekFamilyListCache(uid) || await loadFamilyListCache(uid);
          if (alive && cached?.families?.length) {
            setFamilies(cached.families);
            setLoading(false);
          }
        } catch { /* ignore */ }

        // Hard timeout so a hung Firestore client never leaves the UI on a white spinner.
        const map = new Map();
        let listFailed = false;
        // Evidence THIS user already belongs to a family (returning user).
        // Unverified legacy AsyncStorage must not count — shared devices falsely blocked new users.
        const membershipHints = new Set();

        const mergeDocs = (docs) => {
          docs.forEach((d) => {
            if (isGroupDeleted(d.data())) return;
            map.set(d.id, { id: d.id, ...d.data() });
          });
        };

        try {
          const familyQueries = Promise.all([
            getDocs(query(collection(db, 'families'), where('members', 'array-contains', uid))),
            getDocs(query(collection(db, 'families'), where('adminUids', 'array-contains', uid))),
            getDocs(query(collection(db, 'families'), where('ownerUid', '==', uid))),
          ]);
          const timeout = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('family-list-timeout')), 15000);
          });
          const [mSnap, aSnap, oSnap] = await Promise.race([familyQueries, timeout]);
          mergeDocs([...mSnap.docs, ...aSnap.docs, ...oSnap.docs]);
        } catch (err) {
          listFailed = true;
          console.warn('[AppContext] family list query failed', err?.code || err?.message || err);
        }

        // Fallback: hydrate by known IDs (getDoc still works when list rules use exists()/get()).
        const candidateIds = new Set(map.keys());
        try {
          const scopedId = await AsyncStorage.getItem(familyStorageKey(uid));
          if (scopedId) candidateIds.add(scopedId);
        } catch { /* ignore */ }
        try {
          const legacyId = await AsyncStorage.getItem(FAMILY_KEY);
          if (legacyId) candidateIds.add(legacyId);
        } catch { /* ignore */ }
        try {
          const cachedHints = peekFamilyListCache(uid);
          (cachedHints?.families || []).forEach((f) => {
            if (f?.id) membershipHints.add(String(f.id));
          });
        } catch { /* ignore */ }
        try {
          const userSnap = await getDoc(doc(db, 'users', uid));
          if (userSnap.exists()) {
            const d = userSnap.data() || {};
            const ids = []
              .concat(d.familyIds || [])
              .concat(d.familyId ? [d.familyId] : [])
              .concat(d.activeFamilyId ? [d.activeFamilyId] : []);
            ids.forEach((id) => {
              if (!id) return;
              const sid = String(id);
              candidateIds.add(sid);
              membershipHints.add(sid);
            });
          }
        } catch { /* ignore */ }
        try {
          const parentSnap = await getDoc(doc(db, 'parents', uid));
          if (parentSnap.exists()) {
            const d = parentSnap.data() || {};
            [].concat(d.familyIds || []).concat(d.familyId ? [d.familyId] : [])
              .forEach((id) => {
                if (!id) return;
                const sid = String(id);
                candidateIds.add(sid);
                membershipHints.add(sid);
              });
          }
        } catch { /* ignore */ }

        for (const id of candidateIds) {
          if (map.has(id)) {
            membershipHints.add(id);
            continue;
          }
          try {
            const snap = await getDoc(doc(db, 'families', id));
            if (snap.exists() && !isGroupDeleted(snap.data())) {
              map.set(snap.id, { id: snap.id, ...snap.data() });
              membershipHints.add(snap.id);
            }
          } catch { /* ignore — likely permission-denied for another account's id */ }
        }

        // Drop legacy/global familyId that we could not prove access to.
        try {
          const legacyId = await AsyncStorage.getItem(FAMILY_KEY);
          if (legacyId && !map.has(legacyId) && !membershipHints.has(legacyId)) {
            await AsyncStorage.removeItem(FAMILY_KEY);
          }
        } catch { /* ignore */ }

        const hadMembershipHints = membershipHints.size > 0;

        // Always ask Admin when the client list is empty — membership may only
        // exist under families/*/parents/{uid} (collectionGroup), which client
        // queries cannot see. Empty [] from a healthy callable = brand-new user
        // (GetStarted). Timeout/failure without hints must not block signup.
        if (listFailed || map.size === 0) {
          try {
            const remotePromise = listMyFamilies();
            const timeout = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('listMyFamilies-timeout')), 10000);
            });
            const remote = await Promise.race([remotePromise, timeout]);
            (remote || []).forEach((f) => {
              if (!f?.id || isGroupDeleted(f)) return;
              map.set(f.id, f);
              membershipHints.add(f.id);
            });
            // Successful callable (including empty []) clears list failure.
            listFailed = false;
          } catch (err) {
            console.warn('[AppContext] listMyFamilies callable failed', err?.message || err);
            // Only keep the recovery wall when we have evidence of membership.
            if (hadMembershipHints || listFailed) {
              listFailed = true;
            } else {
              listFailed = false;
            }
          }
        }

        const list = visibleGroupsForUser(
          [...map.values()].filter((f) => !isGroupDeleted(f)),
          userRef.current,
        );
        if (!alive) return;
        if (listFailed && list.length === 0 && membershipHints.size > 0) {
          setFamiliesLoadError('family-list-denied');
          // Keep any cache already shown — never wipe a returning user to GetStarted.
          setFamilies((prev) => (prev?.length ? prev : list));
        } else {
          // New users (no hints) or successful empty list → normal GetStarted / create flow.
          setFamiliesLoadError(null);
          setFamilies(list);
          putFamilyListCache(uid, list);
        }

        const stored = await readStoredFamilyId(uid);
        const effective = list.length ? list : (map.size ? [...map.values()] : []);
        // Prefer current families state if we kept cache
        setFamilyIdState((cur) => {
          const pool = list.length ? list : effective;
          const livePool = pool.filter((f) => f.archived !== true && f.active !== false);
          const next = livePool.find((f) => f.id === stored)?.id
            || livePool.find((f) => f.id === cur)?.id
            || livePool[0]?.id
            || null;
          // Do not keep a stale cur familyId when this user has no accessible families.
          return next;
        });
        if (list.length) {
          const pick = list.find((f) => f.archived !== true && f.active !== false) || list[0];
          if (pick?.id) writeStoredFamilyId(uid, pick.id).catch(() => {});
        } else {
          writeStoredFamilyId(uid, '').catch(() => {});
        }
      } catch (err) {
        console.warn('[AppContext] family boot failed', err?.message || err);
        if (alive) {
          // Never block brand-new users behind the recovery screen on unexpected boot errors.
          setFamiliesLoadError(null);
          // Do not clear cached families on error.
        }
      } finally {
        if (alive) {
          setLoading(false);
          setFamiliesReady(true);
        }
      }
    })();
    return () => { alive = false; };
  }, [uid, isChild, childFamilyId, childProfile?.familyId]);

  useEffect(() => {
    if (!uid) {
      setUserProfile(null);
      setUserProfileReady(true);
      return undefined;
    }
    setUserProfileReady(false);
    let readyMarked = false;
    const markReady = () => {
      if (readyMarked) return;
      readyMarked = true;
      setUserProfileReady(true);
    };
    // Never block boot forever if the users/{uid} listener wedges (seen after
    // the short-lived Firestore persistence experiment).
    const failSafe = setTimeout(() => {
      console.warn('[AppContext] userProfile snapshot timeout — continuing boot');
      markReady();
    }, 6000);
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        clearTimeout(failSafe);
        setUserProfile(snap.exists() ? { id: snap.id, ...snap.data() } : null);
        markReady();
      },
      () => {
        clearTimeout(failSafe);
        setUserProfile(null);
        markReady();
      },
    );
    return () => {
      clearTimeout(failSafe);
      unsub();
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setCachedProfile(null);
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`${PROFILE_CACHE_KEY}.${uid}`);
        if (alive && raw) setCachedProfile(JSON.parse(raw));
      } catch {}
    })();
    return () => { alive = false; };
  }, [uid]);

  const listedOnFamily = useMemo(
    () => isListedOnFamilyData(family, uid),
    [uid, family],
  );

  useEffect(() => {
    if (!familyId) {
      setFamily(null);
      setParents([]);
      setKids([]);
      return undefined;
    }
    const unsubFam = onSnapshot(
      doc(db, 'families', familyId),
      (snap) => {
        if (!snap.exists()) {
          setFamily(null);
          return;
        }
        const next = { id: snap.id, ...snap.data() };
        if (isGroupDeleted(next)) {
          setFamily(null);
          setFamilies((prev) => prev.filter((f) => f.id !== snap.id));
          setFamilyIdState((cur) => (cur === snap.id ? null : cur));
          return;
        }
        if (!isChild && !canUsePlatformType(next.type, user)) {
          setFamily(null);
          setFamilyIdState((cur) => (cur === snap.id ? null : cur));
          return;
        }
        setFamily(next);
      },
      () => {
        // Example: Firestore rules denies access (stale familyId from another account).
        setFamily(null);
        setFamilyIdState((cur) => (cur === familyId ? null : cur));
        writeStoredFamilyId(uid, '').catch(() => {});
      },
    );
    const unsubParents = onSnapshot(
      collection(db, 'families', familyId, 'parents'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.deleted !== true);
        const deduped = dedupeFamilyParents(list);
        setParents(deduped);
        // Heal Firestore when invite-placeholder + uid-doc still both active
        if (list.length > deduped.length) {
          archiveSupersededParentPlaceholders(familyId, list).catch(() => {});
        }
      },
      () => {
        setParents([]);
      },
    );
    const unsubKids = onSnapshot(
      collection(db, 'families', familyId, 'children'),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((c) => c.deleted !== true)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setKids(list);
      },
      () => {
        setKids([]);
      },
    );
    return () => {
      unsubFam();
      unsubParents();
      unsubKids();
    };
  }, [familyId, isChild, user, uid, listedOnFamily]);

  // Parent/child docs grant GET, but LIST of chats/messages needs members[]/activeUsers.
  // Heal orphans so inbox/push recipients can actually open the thread.
  const listHealAttemptedRef = useRef(null);
  useEffect(() => {
    if (!familyId || !uid || !family || listedOnFamily) {
      if (listedOnFamily) listHealAttemptedRef.current = familyId;
      return undefined;
    }
    if (listHealAttemptedRef.current === familyId) return undefined;
    listHealAttemptedRef.current = familyId;
    ensureListedOnFamily(familyId, uid).catch(() => {
      // Allow a later retry if this attempt failed (rules/network).
      if (listHealAttemptedRef.current === familyId) listHealAttemptedRef.current = null;
    });
    return undefined;
  }, [familyId, uid, family, listedOnFamily]);

  const selectFamily = useCallback(async (id, preview) => {
    if (id && preview && typeof preview === 'object') {
      if (!canUsePlatformType(preview.type, user)) return;
      setFamilies((prev) => {
        const next = {
          id,
          active: true,
          archived: false,
          deleted: false,
          ...preview,
        };
        return [next, ...prev.filter((f) => f.id !== id)];
      });
    }
    setFamilyIdState(id);
    await writeStoredFamilyId(uid, id || '');
  }, [user, uid]);

  const applyFamilyPatch = useCallback((id, patch) => {
    if (!id || !patch) return;
    setFamilies((prev) => {
      if (patch.deleted === true || patch.hiddenFromApp === true) return prev.filter((f) => f.id !== id);
      return prev.map((f) => (f.id === id ? { ...f, ...patch } : f));
    });
  }, []);

  const members = useMemo(() => {
    const activeP = parents.filter((p) => p.active !== false && p.archived !== true);
    const activeK = kids.filter((k) => k.active !== false && k.archived !== true);
    const p = activeP.map((x, i) => {
      const age = profileAge(x);
      // Prefer Auth-shaped id: doc id is often the real UID when `uid` is a stale invite key.
      const authUid = preferAuthUid(x.uid, x.id);
      return {
      id: authUid || x.uid || x.id,
      docId: x.id,
      name: x.name || x.displayName || (x.email || '').split('@')[0] || 'Foresatt',
      role: 'parent',
      adultRole: x.adultRole === 'grandparent' || x.isGrandparent === true ? 'grandparent' : 'parent',
      isGrandparent: x.adultRole === 'grandparent' || x.isGrandparent === true,
      uid: authUid || x.uid || x.id,
      photoURL: x.photoURL || x.photoUrl || null,
      avatarId: x.avatarId || null,
      birthday: x.birthday || null,
      age,
      ageBand: ageBand(age),
      color: colorFor(i),
    };
    });
    const k = activeK.map((x, i) => {
      const age = profileAge(x);
      return {
      id: x.id,
      docId: x.id,
      name: x.name || 'Barn',
      role: 'child',
      uid: x.uid || x.id,
      photoURL: x.photoURL || x.photoUrl || null,
      avatarId: x.avatarId || null,
      birthday: x.birthday || null,
      age,
      ageBand: ageBand(age),
      color: colorFor(activeP.length + i),
      childId: x.id,
    };
    });
    return [...p, ...k];
  }, [parents, kids]);

  useEffect(() => {
    if (!uid) {
      setFriends([]);
      return undefined;
    }
    // Keep parent graph warm in state; friendPeople scopes to active profile below.
    return listenFriends(uid, setFriends);
  }, [uid]);

  const meChild = useMemo(() => {
    if (!isChild) return childProfile || null;
    return kids.find((c) => c.uid === uid || c.id === childProfile?.id) || childProfile || null;
  }, [isChild, kids, uid, childProfile]);

  const meParent = useMemo(() => {
    if (!uid) return null;
    return parents.find((p) => p.uid === uid) || null;
  }, [parents, uid]);

  const isGrandparent = useMemo(
    () => !!(meParent && (meParent.adultRole === 'grandparent' || meParent.isGrandparent === true)),
    [meParent],
  );

  // Keep child id in sync when child account loads profile doc
  useEffect(() => {
    if (!isChild || !meChild?.id) return;
    setActiveChildIdState(meChild.id);
    setActiveProfileKindState('child');
  }, [isChild, meChild?.id]);

  // Restore last profile choice for parent admins (not grandparents)
  useEffect(() => {
    if (isChild || !uid || !familyId || kids.length === 0) return undefined;
    if (isGrandparent) {
      setActiveProfileKindState('parent');
      setActiveChildIdState(null);
      return undefined;
    }
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(`${PROFILE_KEY}.${uid}`);
        if (!alive || !raw) return;
        const parsed = JSON.parse(raw);
        if (parsed?.kind === 'child' && parsed.childId) {
          const exists = kids.some((k) => k.id === parsed.childId && k.active !== false);
          if (exists) {
            setActiveProfileKindState('child');
            setActiveChildIdState(parsed.childId);
          }
        }
      } catch {}
    })();
    return () => { alive = false; };
  }, [isChild, uid, familyId, kids.length, isGrandparent]);

  const activeChild = useMemo(() => {
    if (activeProfileKind !== 'child' || !activeChildId) return null;
    const fromKids = kids.find((k) => k.id === activeChildId);
    if (fromKids) return fromKids;
    if (isChild && childProfile?.id === activeChildId) return childProfile;
    return null;
  }, [activeProfileKind, activeChildId, kids, isChild, childProfile]);

  const isActingAsChild = isParent && !isGrandparent && activeProfileKind === 'child' && !!activeChild;
  const viewingChildId = activeProfileKind === 'child' ? activeChildId : null;
  const viewingChild = activeChild;

  const friendOwnerUid = useMemo(() => friendProfileOwnerUid({
    authUid: uid,
    isActingAsChild,
    childUid: preferAuthUid(activeChild?.uid, activeChild?.id),
  }), [uid, isActingAsChild, activeChild?.uid, activeChild?.id]);

  const [profileFriends, setProfileFriends] = useState([]);
  useEffect(() => {
    if (!isActingAsChild || !friendOwnerUid || !uid) {
      setProfileFriends([]);
      return undefined;
    }
    return listenFriends(uid, setProfileFriends, {
      forUid: friendOwnerUid,
      familyId: familyId || null,
    });
  }, [isActingAsChild, friendOwnerUid, uid, familyId]);

  /** Friends as picker people for the active profile (never family members). */
  const friendPeople = useMemo(() => {
    const list = isActingAsChild ? profileFriends : friends;
    return (list || []).map((f, i) => ({
      id: f.friendUid || f.id,
      uid: f.friendUid || f.id,
      name: f.name || 'Venn',
      role: 'friend',
      photoURL: f.photoURL || null,
      avatarId: f.avatarId || null,
      username: f.username || '',
      color: colorFor(80 + i),
      isFriend: true,
    }));
  }, [friends, profileFriends, isActingAsChild]);

  const activeProfile = useMemo(() => {
    if (activeProfileKind === 'child' && activeChild) {
      return {
        kind: 'child',
        id: activeChild.id,
        name: activeChild.name || 'Barn',
        avatarId: activeChild.avatarId,
        photoURL: activeChild.photoURL || activeChild.photoUrl || null,
        record: activeChild,
      };
    }
    const name = meParent?.name || userProfile?.displayName || user?.displayName
      || cachedProfile?.name || (user?.email || '').split('@')[0] || 'Meg';
    return {
      kind: 'parent',
      id: uid,
      name,
      avatarId: meParent?.avatarId || userProfile?.avatarId || cachedProfile?.avatarId || null,
      photoURL: meParent?.photoURL || meParent?.photoUrl || userProfile?.photoURL || userProfile?.photoUrl
        || user?.photoURL || cachedProfile?.photoURL || null,
      record: meParent || userProfile,
    };
  }, [activeProfileKind, activeChild, meParent, userProfile, user, uid, cachedProfile]);

  useEffect(() => {
    if (!uid || activeProfileKind === 'child') return;
    const { photoURL, avatarId, name } = activeProfile;
    if (!photoURL && !avatarId) return;
    const payload = { photoURL: photoURL || null, avatarId: avatarId || null, name: name || null };
    setCachedProfile(payload);
    AsyncStorage.setItem(`${PROFILE_CACHE_KEY}.${uid}`, JSON.stringify(payload)).catch(() => {});
  }, [uid, activeProfileKind, activeProfile?.photoURL, activeProfile?.avatarId, activeProfile?.name]);

  const persistProfile = useCallback(async (kind, childId) => {
    if (!uid || isChild) return;
    try {
      await AsyncStorage.setItem(`${PROFILE_KEY}.${uid}`, JSON.stringify({ kind, childId: childId || null }));
    } catch {}
  }, [uid, isChild]);

  const switchToParentProfile = useCallback(() => {
    setActiveProfileKindState('parent');
    setActiveChildIdState(null);
    persistProfile('parent', null);
  }, [persistProfile]);

  const switchToChildProfile = useCallback((childId) => {
    if (!childId || isGrandparent) return;
    setActiveProfileKindState('child');
    setActiveChildIdState(childId);
    persistProfile('child', childId);
  }, [persistProfile, isGrandparent]);

  const setViewingChildId = useCallback((id) => {
    if (id) switchToChildProfile(id);
    else switchToParentProfile();
  }, [switchToChildProfile, switchToParentProfile]);

  const clearViewingChild = useCallback(() => {
    switchToParentProfile();
  }, [switchToParentProfile]);

  const clearFamiliesLoadError = useCallback(() => {
    setFamiliesLoadError(null);
  }, []);

  const isSuperAdmin = !!(uid && family && family.ownerUid === uid);
  const isAdmin = isSuperAdmin || !!(uid && family && Array.isArray(family.adminUids) && family.adminUids.includes(uid));
  const liveFamilies = useMemo(
    () => families.filter((f) => f.archived !== true && f.active !== false),
    [families]
  );
  const currentAge = useMemo(
    () => profileAge(isChild ? (meChild || childProfile || userProfile) : userProfile),
    [isChild, meChild, childProfile, userProfile]
  );
  const currentAgeBand = useMemo(() => ageBand(currentAge), [currentAge]);

  const value = {
    user,
    uid,
    role,
    isChild,
    isParent,
    isGrandparent,
    isSuperAdmin,
    isAdmin,
    loading,
    familiesReady,
    familiesLoadError,
    clearFamiliesLoadError,
    userProfileReady,
    families,
    liveFamilies,
    familyId,
    family,
    parents,
    kids,
    members,
    friends,
    friendPeople,
    meChild,
    meParent,
    childProfile,
    activeProfileKind,
    activeChildId,
    activeChild,
    activeProfile,
    isActingAsChild,
    viewingChildId,
    viewingChild,
    setViewingChildId,
    clearViewingChild,
    switchToParentProfile,
    switchToChildProfile,
    userProfile,
    currentAge,
    currentAgeBand,
    selectFamily,
    applyFamilyPatch,
    shellNav,
    shellIntent,
    requestShellTab,
    clearShellIntent,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
