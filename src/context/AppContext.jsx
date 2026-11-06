import { setActiveNumberSeries } from '../intercompany/numberSeries.js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { MEMBER_COLORS } from '../theme';
import { ageBand, profileAge } from '../utils/age';
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
import { preferAuthUid } from '../utils/inviteAuthUid';
import { isLiveOrganization } from '../project/companyOffer';
import { aliasFamilyIds, companyWorkspaces, preferHovedenhetWorkspace, resolveLoginLanding } from '../utils/platformSwitch';
import { bindCompanyAliases } from '../project/companyAlias';

const Ctx = createContext(null);
// Navigering i skallet fra kode (requestShellTab) og «intent» til modulen som åpnes.
// Egen kontekst, så et fanebytte ikke gir nye renders av alle som leser useApp().
const ShellNavCtx = createContext({ shellNav: null, shellIntent: null });
const FAMILY_KEY = 'protop.familyId';
const COMPANY_KEY = 'protop.companyId';
const EMPTY_LIST = Object.freeze([]);
const PROFILE_CACHE_KEY = 'protop.profileCache';

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

function companyStorageKey(uid) {
  return uid ? `${COMPANY_KEY}.${uid}` : COMPANY_KEY;
}

async function readStoredCompanyId(uid) {
  try {
    if (!uid) return '';
    return (await AsyncStorage.getItem(companyStorageKey(uid))) || '';
  } catch {
    return '';
  }
}

async function writeStoredCompanyId(uid, id) {
  try {
    if (!uid || !id) return;
    await AsyncStorage.setItem(companyStorageKey(uid), id);
  } catch { /* ignore */ }
}

function colorFor(i) {
  return MEMBER_COLORS[i % MEMBER_COLORS.length];
}

export function AppProvider({ user, role, children }) {
  const [families, setFamilies] = useState([]);
  const userRef = useRef(user);
  userRef.current = user;
  const familiesRef = useRef(families);
  familiesRef.current = families;
  const familyPickRef = useRef(false);
  const [familyId, setFamilyIdState] = useState(null);
  const [family, setFamily] = useState(null);
  // Konsernets nummerserie for valgt selskap (kunder og prosjekter), se src/intercompany/numberSeries.js.
  useEffect(() => {
    setActiveNumberSeries(family?.numberSeries);
  }, [family?.numberSeries]);
  const [parents, setParents] = useState([]);
  const [friends, setFriends] = useState([]);
  const [loading, setLoading] = useState(true);
  /** True after family list query finishes — used so RootNav does not flash ProfileSetup. */
  const [familiesReady, setFamiliesReady] = useState(false);
  const [familiesLoadError, setFamiliesLoadError] = useState(null);

  const [userProfile, setUserProfile] = useState(null);
  const [cachedProfile, setCachedProfile] = useState(null);
  const [userProfileReady, setUserProfileReady] = useState(false);
  const uid = user?.uid || null;
  // ProTop har ingen barnekontoer eller «vis som barn» (familieproduktet er fjernet). Barnekontoer
  // logges ut i App.jsx. Feltene under står igjen med faste verdier, så forbrukerne har samme form.
  const isChild = false;
  const isParent = true;
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

  // Test-boten (scripts/help-bot) åpner faner direkte. Finnes bare i emulator-bygg.
  useEffect(() => {
    if (!process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || typeof window === 'undefined') return undefined;
    window.__protopBot = { openShell: requestShellTab };
    return () => { delete window.__protopBot; };
  }, [requestShellTab]);

  useEffect(() => {
    let alive = true;
    familyPickRef.current = false;
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
        // Vis shell raskt fra cache mens Firestore-søk kjører.
        // Land på bedrift når personen er tilknyttet et firma, ellers privat.
        // Ikke sett familiesReady her — ellers flasher ProfileSetup før listene er hentet.
        let storedId = '';
        let preferredCompanyId = '';
        try {
          storedId = (await readStoredFamilyId(uid)) || '';
          preferredCompanyId = await readStoredCompanyId(uid);
          const cached = peekFamilyListCache(uid) || await loadFamilyListCache(uid);
          if (alive && cached?.families?.length) {
            const landing = resolveLoginLanding(cached.families, storedId, preferredCompanyId);
            setFamilies(cached.families);
            if (landing?.id) setFamilyIdState(landing.id);
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

        // Spørringene, profilen (users/{uid}), foresatt-posten (parents/{uid}) og de lagrede
        // id-ene hentes samtidig. Før gikk de etter hverandre (5–6 rundturer før Hjem).
        const withTimeout = (promise, ms, label) => Promise.race([
          promise,
          new Promise((_, reject) => { setTimeout(() => reject(new Error(label)), ms); }),
        ]);
        const familyQueries = withTimeout(Promise.all([
          getDocs(query(collection(db, 'families'), where('members', 'array-contains', uid))),
          getDocs(query(collection(db, 'families'), where('adminUids', 'array-contains', uid))),
          getDocs(query(collection(db, 'families'), where('ownerUid', '==', uid))),
        ]), 15000, 'family-list-timeout');
        const [listResult, scopedId, legacyIdEarly, userSnap, parentSnap] = await Promise.all([
          familyQueries.then((v) => ({ ok: true, v }), (err) => ({ ok: false, err })),
          AsyncStorage.getItem(familyStorageKey(uid)).catch(() => null),
          AsyncStorage.getItem(FAMILY_KEY).catch(() => null),
          getDoc(doc(db, 'users', uid)).catch(() => null),
          getDoc(doc(db, 'parents', uid)).catch(() => null),
        ]);
        if (listResult.ok) {
          const [mSnap, aSnap, oSnap] = listResult.v;
          mergeDocs([...mSnap.docs, ...aSnap.docs, ...oSnap.docs]);
        } else {
          listFailed = true;
          const err = listResult.err;
          console.warn('[AppContext] family list query failed', err?.code || err?.message || err);
        }

        // Fallback: hydrate by known IDs (getDoc still works when list rules use exists()/get()).
        const candidateIds = new Set(map.keys());
        if (scopedId) candidateIds.add(scopedId);
        if (legacyIdEarly) candidateIds.add(legacyIdEarly);
        try {
          const cachedHints = peekFamilyListCache(uid);
          (cachedHints?.families || []).forEach((f) => {
            if (f?.id) membershipHints.add(String(f.id));
          });
        } catch { /* ignore */ }
        try {
          if (userSnap?.exists()) {
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
          if (parentSnap?.exists()) {
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

        // Kandidatene som ikke kom med i spørringene hentes samtidig, ikke én og én.
        const missing = [];
        candidateIds.forEach((id) => {
          if (map.has(id)) membershipHints.add(id);
          else missing.push(id);
        });
        const extra = await Promise.all(missing.map((id) => (
          getDoc(doc(db, 'families', id)).catch(() => null) // likely permission-denied for another account's id
        )));
        extra.forEach((snap) => {
          if (snap?.exists() && !isGroupDeleted(snap.data())) {
            map.set(snap.id, { id: snap.id, ...snap.data() });
            membershipHints.add(snap.id);
          }
        });

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

        const keptCache = listFailed && list.length === 0 && membershipHints.size > 0;
        if (!keptCache && !familyPickRef.current) {
          const pool = list.length ? list : (map.size ? [...map.values()] : []);
          const landing = resolveLoginLanding(pool, storedId, preferredCompanyId);
          const landingId = landing?.id || null;
          if (alive) setFamilyIdState(landingId);
          if (landingId) {
            writeStoredFamilyId(uid, landingId).catch(() => {});
            if (isLiveOrganization(landing)) writeStoredCompanyId(uid, landingId).catch(() => {});
          } else {
            writeStoredFamilyId(uid, '').catch(() => {});
          }
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
  }, [uid]);

  // Alias med samme navn åpnes alltid som hovednummeret. Dataene lastes inn der.
  useEffect(() => {
    if (!uid || !familyId) return undefined;
    const companies = companyWorkspaces(families);
    const current = companies.find((group) => group.id === familyId);
    if (!current) return undefined;
    const next = preferHovedenhetWorkspace(current, companies);
    if (!next?.id || next.id === current.id) return undefined;
    setFamilyIdState(next.id);
    writeStoredFamilyId(uid, next.id).catch(() => {});
    writeStoredCompanyId(uid, next.id).catch(() => {});
    return undefined;
  }, [uid, families, familyId]);

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
        if (!canUsePlatformType(next.type, user)) {
          setFamily(null);
          setFamilyIdState((cur) => (cur === snap.id ? null : cur));
          return;
        }
        setFamily(next);
      },
      (error) => {
        const code = String(error?.code || '');
        // Nettverk skal ikke tømme arbeidsområdet. Neste lasting henter de samme dataene.
        if (code === 'unavailable' || code === 'deadline-exceeded') return;
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
    // Barn (families/{id}/children) hørte til familieproduktet. ProTop lytter ikke på dem;
    // `kids` står som tom liste så forbrukerne har samme form.
    return () => {
      unsubFam();
      unsubParents();
    };
  }, [familyId, user, uid, listedOnFamily]);

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
    familyPickRef.current = true;
    setFamilyIdState(id);
    await writeStoredFamilyId(uid, id || '');
    const known = familiesRef.current.find((f) => f.id === id);
    const group = preview && typeof preview === 'object' ? { ...known, ...preview, id } : known;
    if (isLiveOrganization(group)) writeStoredCompanyId(uid, id).catch(() => {});
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
    const p = activeP.map((x, i) => {
      const age = profileAge(x);
      // Prefer Auth-shaped id: doc id is often the real UID when `uid` is a stale invite key.
      const authUid = preferAuthUid(x.uid, x.id);
      return {
      id: authUid || x.uid || x.id,
      docId: x.id,
      name: x.name || x.displayName || (x.email || '').split('@')[0] || 'Foresatt',
      role: 'parent',
      adultRole: 'parent',
      isGrandparent: false,
      uid: authUid || x.uid || x.id,
      photoURL: x.photoURL || x.photoUrl || null,
      avatarId: x.avatarId || null,
      birthday: x.birthday || null,
      age,
      ageBand: ageBand(age),
      color: colorFor(i),
    };
    });
    return p;
  }, [parents]);

  useEffect(() => {
    if (!uid) {
      setFriends([]);
      return undefined;
    }
    // Keep parent graph warm in state; friendPeople scopes to active profile below.
    return listenFriends(uid, setFriends);
  }, [uid]);

  const meParent = useMemo(() => {
    if (!uid) return null;
    return parents.find((p) => p.uid === uid) || null;
  }, [parents, uid]);

  const meChild = null;
  const isGrandparent = false;
  const activeProfileKind = 'parent';
  const activeChildId = null;
  const activeChild = null;
  const isActingAsChild = false;
  const viewingChildId = null;
  const viewingChild = null;
  const kids = EMPTY_LIST;

  /** Friends as picker people for the active profile (never family members). */
  const friendPeople = useMemo(() => {
    return (friends || []).map((f, i) => ({
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
  }, [friends]);

  const activeProfile = useMemo(() => {
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
  }, [meParent, userProfile, user, uid, cachedProfile]);

  useEffect(() => {
    if (!uid) return;
    const { photoURL, avatarId, name } = activeProfile;
    if (!photoURL && !avatarId) return;
    const payload = { photoURL: photoURL || null, avatarId: avatarId || null, name: name || null };
    setCachedProfile(payload);
    AsyncStorage.setItem(`${PROFILE_CACHE_KEY}.${uid}`, JSON.stringify(payload)).catch(() => {});
  }, [uid, activeProfile?.photoURL, activeProfile?.avatarId, activeProfile?.name]);

  const switchToParentProfile = useCallback(() => {}, []);
  const switchToChildProfile = useCallback(() => {}, []);
  const setViewingChildId = switchToChildProfile;
  const clearViewingChild = switchToParentProfile;

  const clearFamiliesLoadError = useCallback(() => {
    setFamiliesLoadError(null);
  }, []);

  bindCompanyAliases(family?.id || '', family ? aliasFamilyIds(family, families) : []);

  const isSuperAdmin = !!(uid && family && family.ownerUid === uid);
  const isAdmin = isSuperAdmin || !!(uid && family && Array.isArray(family.adminUids) && family.adminUids.includes(uid));
  const liveFamilies = useMemo(
    () => families.filter((f) => f.archived !== true && f.active !== false),
    [families]
  );
  const currentAge = useMemo(
    () => profileAge(userProfile),
    [userProfile]
  );
  const currentAgeBand = useMemo(() => ageBand(currentAge), [currentAge]);

  const value = useMemo(() => ({
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
    childProfile: null,
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
    requestShellTab,
    clearShellIntent,
  }), [
    user, uid, role, isSuperAdmin, isAdmin, loading,
    familiesReady, familiesLoadError, clearFamiliesLoadError, userProfileReady, families,
    liveFamilies, familyId, family, parents, members, friends, friendPeople,
    meParent, activeProfile,
    setViewingChildId, clearViewingChild,
    switchToParentProfile, switchToChildProfile, userProfile, currentAge, currentAgeBand,
    selectFamily, applyFamilyPatch, requestShellTab, clearShellIntent,
  ]);
  const shellNavValue = useMemo(() => ({ shellNav, shellIntent }), [shellNav, shellIntent]);


  return (
    <Ctx.Provider value={value}>
      <ShellNavCtx.Provider value={shellNavValue}>{children}</ShellNavCtx.Provider>
    </Ctx.Provider>
  );
}

export function useOptionalApp() {
  return useContext(Ctx);
}

/** Skallnavigering ({ shellNav, shellIntent }). requestShellTab og clearShellIntent ligger i useApp(). */
export function useShellNav() {
  return useContext(ShellNavCtx);
}

export function useApp() {
  const ctx = useOptionalApp();
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
