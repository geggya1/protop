/**
 * Familietreet — Firestore CRUD for personer og relasjoner.
 */
import {
  collection, doc, addDoc, updateDoc, writeBatch,
  onSnapshot, serverTimestamp, getDocs,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { inviteAdult } from './groups';
import {
  assertValidPersonInput,
  applyRelationPatch,
  indexPeople,
  normalizeIdList,
  seedPeopleFromMembers,
  membersMissingFromTree,
  membersNeedingTreeLink,
  findMatchingTreePerson,
  findDuplicatePersonGroups,
  buildMergeRelationPatches,
  pickPreferredDuplicate,
  normalizePersonKey,
  emptyPersonForm,
  personDisplayName,
  buildGenerationOverview,
  layoutFamilyTree,
  RELATION_TYPES,
  generationLabel,
  relationLabelForGeneration,
  personMetaLine,
  GENDER_OPTIONS,
  QUICK_ADD_ACTIONS,
  searchPeople,
  buildTreeStats,
  buildPedigreeAround,
  provisionalPeopleFromMembers,
  lifeSpanLabel,
  parentSlotsFilled,
  householdParentIdsForChildren,
  buildParentIdSanitizationPatches,
  immediateParentIds,
  nuclearParentIds,
  areSiblings,
} from './familyTreeLogic.js';

export {
  emptyPersonForm,
  personDisplayName,
  buildGenerationOverview,
  layoutFamilyTree,
  RELATION_TYPES,
  generationLabel,
  relationLabelForGeneration,
  personMetaLine,
  GENDER_OPTIONS,
  membersMissingFromTree,
  membersNeedingTreeLink,
  findMatchingTreePerson,
  findDuplicatePersonGroups,
  seedPeopleFromMembers,
  QUICK_ADD_ACTIONS,
  searchPeople,
  buildTreeStats,
  buildPedigreeAround,
  provisionalPeopleFromMembers,
  lifeSpanLabel,
  parentSlotsFilled,
  householdParentIdsForChildren,
  buildParentIdSanitizationPatches,
  immediateParentIds,
  nuclearParentIds,
  areSiblings,
};

function peopleCol(familyId) {
  return collection(db, 'families', familyId, 'familyTreePeople');
}

function personDoc(familyId, personId) {
  return doc(db, 'families', familyId, 'familyTreePeople', personId);
}

function mapDoc(d) {
  return { id: d.id, ...(d.data() || {}) };
}

export function listenFamilyTreePeople(familyId, cb) {
  if (!familyId) {
    cb([]);
    return () => {};
  }
  let settled = false;
  const safeCb = (rows) => {
    settled = true;
    cb(rows);
  };
  // Ikke send tom liste ved timeout — det trigget bootstrap-duplikater.
  // Signaliser bare at UI kan slutte å spinne (meta.pending).
  const timeout = setTimeout(() => {
    if (!settled) cb([], { pending: true });
  }, 2500);
  const unsub = onSnapshot(
    peopleCol(familyId),
    (snap) => {
      clearTimeout(timeout);
      const rows = snap.docs
        .map(mapDoc)
        .filter((p) => p.deleted !== true)
        .sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b), 'nb'));
      safeCb(rows);
    },
    (err) => {
      clearTimeout(timeout);
      console.warn('[familyTree] listen failed', err?.message || err);
      safeCb([]);
    },
  );
  return () => {
    clearTimeout(timeout);
    unsub();
  };
}

export async function listFamilyTreePeople(familyId) {
  if (!familyId) return [];
  const snap = await getDocs(peopleCol(familyId));
  return snap.docs
    .map(mapDoc)
    .filter((p) => p.deleted !== true);
}

function basePersonPayload(uid, data) {
  const valid = assertValidPersonInput(data);
  return {
    displayName: valid.displayName,
    gender: valid.gender,
    birthday: valid.birthday,
    deathDate: valid.deathDate,
    notes: valid.notes,
    email: valid.email,
    phone: valid.phone,
    linkedUid: valid.linkedUid,
    linkedRole: valid.linkedRole,
    isExternal: valid.isExternal,
    photoURL: data.photoURL || null,
    avatarId: data.avatarId || null,
    color: data.color || null,
    parentIds: normalizeIdList(data.parentIds),
    partnerIds: normalizeIdList(data.partnerIds),
    inviteStatus: data.inviteStatus || null,
    inviteKey: data.inviteKey || null,
    createdBy: uid,
    deleted: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

/**
 * Opprett person i treet. Valgfritt:
 * - relativeToId + relationType for å knytte relasjon
 * - sendInvite + email/phone for å invitere til ProTop-familien
 * Gjenbruker eksisterende person ved samme e-post (eller entydig navn ved invitasjon).
 */
export async function createFamilyTreePerson(familyId, uid, data, {
  relativeToId = null,
  relationType = null,
  existingPeople = [],
  sendInvite = false,
  familyName = '',
} = {}) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');
  const payload = basePersonPayload(uid, data);

  // Unngå dobbeltperson: gjenbruk ved e-post / entydig navn
  const email = payload.email;
  const nameKey = normalizePersonKey(payload.displayName);
  const reuseCandidates = (existingPeople || []).filter((p) => {
    if (!p?.id || p.deleted === true) return false;
    if (email && String(p.email || '').toLowerCase().trim() === email) return true;
    if (sendInvite && nameKey && !p.linkedUid
      && normalizePersonKey(personDisplayName(p)) === nameKey) {
      return true;
    }
    return false;
  });
  let reuse = null;
  if (reuseCandidates.length === 1) {
    reuse = reuseCandidates[0];
  } else if (reuseCandidates.length > 1) {
    const related = relativeToId
      ? reuseCandidates.find((p) => (
        normalizeIdList(p.parentIds).includes(relativeToId)
        || normalizeIdList(p.partnerIds).includes(relativeToId)
        || normalizeIdList(existingPeople.find((x) => x.id === relativeToId)?.parentIds).includes(p.id)
        || normalizeIdList(existingPeople.find((x) => x.id === relativeToId)?.partnerIds).includes(p.id)
      ))
      : null;
    reuse = related || pickPreferredDuplicate(reuseCandidates);
  }

  if (reuse) {
    const patch = {
      displayName: payload.displayName,
      gender: payload.gender || reuse.gender || null,
      birthday: payload.birthday || reuse.birthday || null,
      deathDate: payload.deathDate || reuse.deathDate || null,
      notes: payload.notes || reuse.notes || '',
      email: payload.email || reuse.email || null,
      phone: payload.phone || reuse.phone || null,
    };
    await updateFamilyTreePerson(familyId, reuse.id, patch);

    let inviteResult = null;
    if (sendInvite && (payload.email || payload.phone || reuse.email || reuse.phone)) {
      inviteResult = await inviteTreePerson(
        familyId,
        uid,
        { ...reuse, ...patch, id: reuse.id },
        { familyName },
      );
    }

    if (relativeToId && relationType) {
      const map = indexPeople(existingPeople);
      const patches = applyRelationPatch(map, reuse.id, relativeToId, relationType);
      if (patches.size) {
        const batch = writeBatch(db);
        patches.forEach((relPatch, id) => {
          batch.update(personDoc(familyId, id), {
            parentIds: relPatch.parentIds,
            partnerIds: relPatch.partnerIds,
            updatedAt: serverTimestamp(),
          });
        });
        await batch.commit();
      }
    }

    return { id: reuse.id, inviteResult, reused: true };
  }

  let inviteResult = null;
  if (sendInvite && (payload.email || payload.phone)) {
    try {
      inviteResult = await inviteAdult({
        familyId,
        name: payload.displayName,
        email: payload.email || '',
        phone: payload.phone || '',
        familyName,
        createdBy: uid,
        asAdmin: false,
      });
      payload.inviteStatus = 'pending';
      payload.inviteKey = inviteResult?.key || inviteResult?.inviteId || null;
    } catch (err) {
      if (err?.message === 'contact-required') {
        throw new Error('Oppgi e-post eller telefon for å invitere.');
      }
      throw err;
    }
  }

  const ref = await addDoc(peopleCol(familyId), payload);
  const newId = ref.id;

  if (relativeToId && relationType) {
    const map = indexPeople([
      ...existingPeople,
      { id: newId, ...payload },
    ]);
    const patches = applyRelationPatch(map, newId, relativeToId, relationType);
    const batch = writeBatch(db);
    patches.forEach((patch, id) => {
      batch.update(personDoc(familyId, id), {
        parentIds: patch.parentIds,
        partnerIds: patch.partnerIds,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  }

  return { id: newId, inviteResult, reused: false };
}

export async function updateFamilyTreePerson(familyId, personId, patch) {
  if (!familyId || !personId) throw new Error('Mangler person.');
  const next = { updatedAt: serverTimestamp() };

  if ('displayName' in patch || 'name' in patch) {
    next.displayName = assertValidPersonInput({
      displayName: patch.displayName ?? patch.name,
    }).displayName;
  }
  if ('gender' in patch) {
    next.gender = ['female', 'male', 'other'].includes(patch.gender) ? patch.gender : null;
  }
  if ('birthday' in patch || 'deathDate' in patch) {
    const birthday = 'birthday' in patch ? patch.birthday : undefined;
    const deathDate = 'deathDate' in patch ? patch.deathDate : undefined;
    const valid = assertValidPersonInput({
      displayName: patch.displayName || patch.name || 'Person',
      birthday,
      deathDate,
    });
    if ('birthday' in patch) next.birthday = valid.birthday;
    if ('deathDate' in patch) next.deathDate = valid.deathDate;
  }
  if ('notes' in patch) next.notes = String(patch.notes || '').trim().slice(0, 2000);
  if ('email' in patch) next.email = String(patch.email || '').toLowerCase().trim().slice(0, 120) || null;
  if ('phone' in patch) next.phone = String(patch.phone || '').trim().slice(0, 40) || null;
  if ('photoURL' in patch) next.photoURL = patch.photoURL || null;
  if ('avatarId' in patch) next.avatarId = patch.avatarId || null;
  if ('parentIds' in patch) next.parentIds = normalizeIdList(patch.parentIds);
  if ('partnerIds' in patch) next.partnerIds = normalizeIdList(patch.partnerIds);
  if ('linkedUid' in patch) {
    next.linkedUid = patch.linkedUid || null;
    next.isExternal = !patch.linkedUid;
  }
  if ('linkedRole' in patch) next.linkedRole = patch.linkedRole || null;
  if ('inviteStatus' in patch) next.inviteStatus = patch.inviteStatus || null;

  await updateDoc(personDoc(familyId, personId), next);
}

export async function setPersonRelation(familyId, personId, relativeToId, relationType, existingPeople = []) {
  if (!familyId || !personId || !relativeToId || !relationType) {
    throw new Error('Mangler relasjon.');
  }
  if (personId === relativeToId) throw new Error('Kan ikke knytte person til seg selv.');
  const map = indexPeople(existingPeople);
  if (!map.has(personId) || !map.has(relativeToId)) {
    throw new Error('Personen finnes ikke i treet.');
  }
  const patches = applyRelationPatch(map, personId, relativeToId, relationType);
  const batch = writeBatch(db);
  patches.forEach((patch, id) => {
    batch.update(personDoc(familyId, id), {
      parentIds: patch.parentIds,
      partnerIds: patch.partnerIds,
      updatedAt: serverTimestamp(),
    });
  });
  await batch.commit();
}

export async function removePersonRelation(familyId, personId, otherId, kind, existingPeople = []) {
  if (!familyId || !personId || !otherId) throw new Error('Mangler relasjon.');
  const map = indexPeople(existingPeople);
  const a = map.get(personId);
  const b = map.get(otherId);
  if (!a || !b) throw new Error('Personen finnes ikke.');

  const batch = writeBatch(db);
  if (kind === 'partner') {
    batch.update(personDoc(familyId, personId), {
      partnerIds: normalizeIdList(a.partnerIds).filter((id) => id !== otherId),
      updatedAt: serverTimestamp(),
    });
    batch.update(personDoc(familyId, otherId), {
      partnerIds: normalizeIdList(b.partnerIds).filter((id) => id !== personId),
      updatedAt: serverTimestamp(),
    });
  } else if (kind === 'parent') {
    // otherId er forelder til personId
    batch.update(personDoc(familyId, personId), {
      parentIds: normalizeIdList(a.parentIds).filter((id) => id !== otherId),
      updatedAt: serverTimestamp(),
    });
  } else if (kind === 'child') {
    // otherId er barn av personId — fjern personId fra barnets parentIds
    batch.update(personDoc(familyId, otherId), {
      parentIds: normalizeIdList(b.parentIds).filter((id) => id !== personId),
      updatedAt: serverTimestamp(),
    });
  }
  await batch.commit();
}

export async function deleteFamilyTreePerson(familyId, personId, existingPeople = []) {
  if (!familyId || !personId) throw new Error('Mangler person.');
  const map = indexPeople(existingPeople);
  const batch = writeBatch(db);

  batch.update(personDoc(familyId, personId), {
    deleted: true,
    updatedAt: serverTimestamp(),
  });

  map.forEach((p, id) => {
    if (id === personId) return;
    const parentIds = normalizeIdList(p.parentIds).filter((x) => x !== personId);
    const partnerIds = normalizeIdList(p.partnerIds).filter((x) => x !== personId);
    if (parentIds.length !== (p.parentIds || []).length
      || partnerIds.length !== (p.partnerIds || []).length) {
      batch.update(personDoc(familyId, id), {
        parentIds,
        partnerIds,
        updatedAt: serverTimestamp(),
      });
    }
  });

  await batch.commit();
}

/** Importer familiemedlemmer som mangler i treet (én gang / på forespørsel). */
export async function syncMembersIntoTree(familyId, uid, members, existingPeople = []) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');

  // Først: knytt eksisterende tre-personer (f.eks. etter invitasjon) til medlemmer
  const linkResult = await linkMembersToTreePeople(familyId, members, existingPeople);
  const peopleAfterLink = (existingPeople || []).map((p) => {
    const linked = linkResult.links.find((l) => l.personId === p.id);
    if (!linked) return p;
    return {
      ...p,
      linkedUid: linked.linkedUid,
      linkedRole: linked.linkedRole,
      isExternal: false,
      inviteStatus: p.inviteStatus === 'pending' ? 'accepted' : p.inviteStatus,
    };
  });

  const missing = membersMissingFromTree(members, peopleAfterLink);
  if (!missing.length) {
    const sanitized = await sanitizeFamilyTreeParentIds(familyId, peopleAfterLink);
    const latest = await listFamilyTreePeople(familyId);
    const deduped = await dedupeFamilyTreePeople(familyId, latest);
    return {
      added: 0,
      linked: linkResult.linked,
      merged: deduped.merged,
      sanitized: sanitized.updated,
    };
  }

  const existingParents = (peopleAfterLink || []).filter(
    (p) => p.linkedRole === 'parent' || (p.linkedUid && members.find((m) => m.id === p.linkedUid && m.role === 'parent')),
  );
  // Kun nærmeste husstands-foresatte — ikke besteforeldre som også er «parent» i ProTop
  const parentTreeIds = householdParentIdsForChildren(
    existingParents.map((p) => p.id),
    peopleAfterLink,
  );

  const batch = writeBatch(db);
  const created = [];

  missing.forEach((m) => {
    const ref = doc(peopleCol(familyId));
    const isChild = m.role === 'child';
    const payload = {
      displayName: m.name || (isChild ? 'Barn' : 'Foresatt'),
      linkedUid: m.id,
      linkedRole: isChild ? 'child' : 'parent',
      isExternal: false,
      photoURL: m.photoURL || null,
      avatarId: m.avatarId || null,
      birthday: m.birthday || null,
      gender: m.gender || null,
      color: m.color || null,
      parentIds: isChild ? [...parentTreeIds] : [],
      partnerIds: [],
      email: m.email ? String(m.email).toLowerCase().trim() : null,
      phone: m.phone || null,
      notes: '',
      inviteStatus: null,
      createdBy: uid,
      deleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    batch.set(ref, payload);
    created.push({ id: ref.id, role: m.role, linkedUid: m.id });
  });

  // Hvis akkurat to foresatte i treet etter sync og ingen partnere — knytt dem
  const allParents = [
    ...existingParents.map((p) => p.id),
    ...created.filter((c) => c.role === 'parent').map((c) => c.id),
  ];
  if (allParents.length === 2 && existingParents.length < 2) {
    const [a, b] = allParents;
    const aExisting = existingParents.find((p) => p.id === a);
    if (aExisting && !(aExisting.partnerIds || []).includes(b)) {
      batch.update(personDoc(familyId, a), {
        partnerIds: normalizeIdList([...(aExisting.partnerIds || []), b]),
        updatedAt: serverTimestamp(),
      });
    }
    const bPerson = existingParents.find((p) => p.id === b);
    if (bPerson && !(bPerson.partnerIds || []).includes(a)) {
      batch.update(personDoc(familyId, b), {
        partnerIds: normalizeIdList([...(bPerson.partnerIds || []), a]),
        updatedAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();

  // Partner-kobling for to nye foresatte
  if (created.filter((c) => c.role === 'parent').length === 2 && existingParents.length === 0) {
    const [a, b] = created.filter((c) => c.role === 'parent');
    const batch2 = writeBatch(db);
    batch2.update(personDoc(familyId, a.id), {
      partnerIds: [b.id],
      updatedAt: serverTimestamp(),
    });
    batch2.update(personDoc(familyId, b.id), {
      partnerIds: [a.id],
      updatedAt: serverTimestamp(),
    });
    await batch2.commit();
  }

  // Rydd opp eventuelle duplikater som allerede finnes
  const latest = await listFamilyTreePeople(familyId);
  const sanitized = await sanitizeFamilyTreeParentIds(familyId, latest);
  const afterSanitize = sanitized.people || latest;
  const deduped = await dedupeFamilyTreePeople(familyId, afterSanitize);

  return {
    added: created.length,
    linked: linkResult.linked,
    merged: deduped.merged,
    sanitized: sanitized.updated,
  };
}

/**
 * Fjern besteforeldre fra parentIds når nærmeste forelder også er listet,
 * fjern søsken feilaktig listet som felles foresatte, og fjern 3+ tvetydige
 * foresatte uten partnerpar (limer ellers ulike slektslinjer sammen).
 * Retter også tippolde-hub (overlappende par) og knytter navne-ektepar.
 * Retter feilkoblede barn uten å endre gyldige to-foreldre-koblinger.
 */
export async function sanitizeFamilyTreeParentIds(familyId, existingPeople = []) {
  if (!familyId) return { updated: 0, people: existingPeople || [] };
  const patches = buildParentIdSanitizationPatches(existingPeople);
  if (!patches.size) return { updated: 0, people: existingPeople || [] };

  const batch = writeBatch(db);
  patches.forEach((patch, id) => {
    const update = { updatedAt: serverTimestamp() };
    if (patch.parentIds) update.parentIds = patch.parentIds;
    if (patch.partnerIds) update.partnerIds = patch.partnerIds;
    batch.update(personDoc(familyId, id), update);
  });
  await batch.commit();

  const people = (existingPeople || []).map((p) => {
    const patch = patches.get(p.id);
    if (!patch) return p;
    return {
      ...p,
      ...(patch.parentIds ? { parentIds: patch.parentIds } : {}),
      ...(patch.partnerIds ? { partnerIds: patch.partnerIds } : {}),
    };
  });
  return { updated: patches.size, people };
}

/**
 * Knytt ulinkede tre-personer til familiemedlemmer (e-post/navn-match etter invitasjon).
 */
export async function linkMembersToTreePeople(familyId, members, existingPeople = []) {
  if (!familyId) return { linked: 0, links: [] };
  const needing = membersNeedingTreeLink(members, existingPeople);
  if (!needing.length) return { linked: 0, links: [] };

  const batch = writeBatch(db);
  const links = [];
  needing.forEach(({ member, person }) => {
    const linkedRole = member.role === 'child' ? 'child' : 'parent';
    const patch = {
      linkedUid: member.id,
      linkedRole,
      isExternal: false,
      updatedAt: serverTimestamp(),
    };
    if (person.inviteStatus === 'pending') patch.inviteStatus = 'accepted';
    if (!person.photoURL && member.photoURL) patch.photoURL = member.photoURL;
    if (!person.avatarId && member.avatarId) patch.avatarId = member.avatarId;
    if (!person.email && member.email) patch.email = String(member.email).toLowerCase().trim();
    batch.update(personDoc(familyId, person.id), patch);
    links.push({ personId: person.id, linkedUid: member.id, linkedRole });
  });
  await batch.commit();
  return { linked: links.length, links };
}

/**
 * Slå sammen åpenbare duplikater (samme uid/e-post/navn) og skriv om relasjoner.
 */
export async function dedupeFamilyTreePeople(familyId, existingPeople = []) {
  if (!familyId) return { merged: 0 };
  const groups = findDuplicatePersonGroups(existingPeople);
  if (!groups.length) return { merged: 0 };

  let merged = 0;
  let working = (existingPeople || []).map((p) => ({ ...p }));

  for (const group of groups) {
    // Recompute against current working set (groups were from original — re-find keep)
    const candidates = working.filter(
      (p) => p.deleted !== true && (p.id === group.keepId || group.dropIds.includes(p.id)),
    );
    if (candidates.length < 2) continue;
    const keep = pickPreferredDuplicate(candidates);
    const dropIds = candidates.filter((p) => p.id !== keep.id).map((p) => p.id);
    if (!dropIds.length) continue;

    const patches = buildMergeRelationPatches(working, keep.id, dropIds);
    const batch = writeBatch(db);

    // Behold beste felter på keep
    const keepPatch = {
      updatedAt: serverTimestamp(),
    };
    dropIds.forEach((dropId) => {
      const drop = working.find((p) => p.id === dropId);
      if (!drop) return;
      if (!keep.linkedUid && drop.linkedUid) {
        keepPatch.linkedUid = drop.linkedUid;
        keepPatch.linkedRole = drop.linkedRole || keep.linkedRole || null;
        keepPatch.isExternal = false;
      }
      if (!keep.photoURL && drop.photoURL) keepPatch.photoURL = drop.photoURL;
      if (!keep.email && drop.email) keepPatch.email = drop.email;
      if (!keep.phone && drop.phone) keepPatch.phone = drop.phone;
      if (!keep.birthday && drop.birthday) keepPatch.birthday = drop.birthday;
      if (!keep.inviteKey && drop.inviteKey) keepPatch.inviteKey = drop.inviteKey;
      if (drop.inviteStatus === 'pending' && keep.inviteStatus !== 'accepted') {
        keepPatch.inviteStatus = 'pending';
      }
    });

    const relKeep = patches.get(keep.id);
    if (relKeep) {
      keepPatch.parentIds = relKeep.parentIds;
      keepPatch.partnerIds = relKeep.partnerIds;
    }
    batch.update(personDoc(familyId, keep.id), keepPatch);

    patches.forEach((patch, id) => {
      if (id === keep.id) return;
      if (dropIds.includes(id)) return;
      batch.update(personDoc(familyId, id), {
        parentIds: patch.parentIds,
        partnerIds: patch.partnerIds,
        updatedAt: serverTimestamp(),
      });
    });

    dropIds.forEach((dropId) => {
      batch.update(personDoc(familyId, dropId), {
        deleted: true,
        mergedInto: keep.id,
        updatedAt: serverTimestamp(),
      });
    });

    await batch.commit();
    merged += dropIds.length;

    // Oppdater working set for neste gruppe
    working = working.map((p) => {
      if (p.id === keep.id) {
        return {
          ...p,
          ...keepPatch,
          parentIds: keepPatch.parentIds || p.parentIds,
          partnerIds: keepPatch.partnerIds || p.partnerIds,
          deleted: false,
        };
      }
      if (dropIds.includes(p.id)) return { ...p, deleted: true };
      const rel = patches.get(p.id);
      if (rel) return { ...p, parentIds: rel.parentIds, partnerIds: rel.partnerIds };
      return p;
    });
  }

  return { merged };
}

/** Fiks ensidige partnerIds (A→B uten B→A) som splitter par i layout. */
export async function repairMutualPartners(familyId, existingPeople = []) {
  if (!familyId) return { fixed: 0 };
  const map = indexPeople(existingPeople);
  const batch = writeBatch(db);
  let fixed = 0;
  const updates = new Map();

  map.forEach((person, id) => {
    normalizeIdList(person.partnerIds).forEach((pid) => {
      const other = map.get(pid);
      if (!other) return;
      if (!normalizeIdList(other.partnerIds).includes(id)) {
        const next = normalizeIdList([...(updates.get(pid)?.partnerIds || other.partnerIds), id]);
        updates.set(pid, { partnerIds: next });
      }
    });
  });

  updates.forEach((patch, id) => {
    batch.update(personDoc(familyId, id), {
      partnerIds: patch.partnerIds,
      updatedAt: serverTimestamp(),
    });
    fixed += 1;
  });

  if (fixed) await batch.commit();
  return { fixed };
}

/** Første gangs seeding når treet er tomt. */
export async function bootstrapFamilyTree(familyId, uid, members) {
  if (!familyId || !uid) throw new Error('Mangler familie eller bruker.');

  // Alltid les fersk liste — unngår dobbelt-seed etter listener-timeout.
  const existing = await listFamilyTreePeople(familyId);
  if (existing.length > 0) {
    const linked = await linkMembersToTreePeople(familyId, members, existing);
    const missing = membersMissingFromTree(members, existing);
    if (missing.length) {
      const synced = await syncMembersIntoTree(familyId, uid, members, existing);
      return { added: synced.added, linked: (linked.linked || 0) + (synced.linked || 0), skippedSeed: true };
    }
    const deduped = await dedupeFamilyTreePeople(familyId, existing);
    return { added: 0, linked: linked.linked, merged: deduped.merged, skippedSeed: true };
  }

  const seeds = seedPeopleFromMembers(members);
  if (!seeds.length) return { added: 0 };

  const batch = writeBatch(db);
  const idMap = new Map();

  seeds.forEach((s) => {
    const ref = doc(peopleCol(familyId));
    idMap.set(s.tempId, ref.id);
  });

  seeds.forEach((s) => {
    const id = idMap.get(s.tempId);
    batch.set(personDoc(familyId, id), {
      displayName: s.displayName,
      linkedUid: s.linkedUid,
      linkedRole: s.linkedRole,
      isExternal: false,
      photoURL: s.photoURL,
      avatarId: s.avatarId,
      birthday: s.birthday,
      gender: s.gender,
      color: s.color,
      parentIds: (s.parentIds || []).map((t) => idMap.get(t)).filter(Boolean),
      partnerIds: (s.partnerIds || []).map((t) => idMap.get(t)).filter(Boolean),
      email: null,
      phone: null,
      notes: '',
      inviteStatus: null,
      createdBy: uid,
      deleted: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return { added: seeds.length };
}

/**
 * Inviter en eksisterende tre-person til ProTop-familien.
 */
export async function inviteTreePerson(familyId, uid, person, { familyName = '' } = {}) {
  if (!familyId || !person?.id) throw new Error('Mangler person.');
  if (person.linkedUid && !person.isExternal) {
    throw new Error('Personen er allerede bruker i familien.');
  }
  const email = String(person.email || '').trim();
  const phone = String(person.phone || '').trim();
  if (!email && !phone) throw new Error('Oppgi e-post eller telefon på personen først.');

  const inviteResult = await inviteAdult({
    familyId,
    name: personDisplayName(person),
    email,
    phone,
    familyName,
    createdBy: uid,
    asAdmin: false,
  });

  await updateDoc(personDoc(familyId, person.id), {
    inviteStatus: 'pending',
    inviteKey: inviteResult?.key || inviteResult?.inviteId || null,
    email: email || person.email || null,
    phone: phone || person.phone || null,
    updatedAt: serverTimestamp(),
  });

  return inviteResult;
}
