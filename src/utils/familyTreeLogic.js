/**
 * Familietreet — relasjoner, generasjonslabels og layout (ren logikk).
 */
import { formatBirthday, parseBirthday, startOfDay, toIsoDate } from './age.js';

export const RELATION_TYPES = [
  { id: 'parent', label: 'Forelder', reverse: 'child' },
  { id: 'child', label: 'Barn', reverse: 'parent' },
  { id: 'partner', label: 'Partner / ektefelle', reverse: 'partner' },
  { id: 'sibling', label: 'Søsken', reverse: 'sibling' },
];

export const GENERATION_LABELS = {
  '-4': 'Tippoldeforeldre',
  '-3': 'Oldeforeldre',
  '-2': 'Besteforeldre',
  '-1': 'Foreldre',
  0: 'Familien',
  1: 'Barn',
  2: 'Barnebarn',
  3: 'Oldebarn',
  4: 'Tippoldebarn',
};

export const GENDER_OPTIONS = [
  { id: 'female', label: 'Kvinne' },
  { id: 'male', label: 'Mann' },
  { id: 'other', label: 'Annet' },
];

export function emptyPersonForm(overrides = {}) {
  return {
    displayName: '',
    gender: null,
    birthday: '',
    deathDate: '',
    notes: '',
    email: '',
    phone: '',
    linkedUid: null,
    linkedRole: null,
    isExternal: true,
    sendInvite: false,
    relationType: 'parent',
    relativeToId: null,
    ...overrides,
  };
}

export function normalizeName(name) {
  return String(name || '').trim().slice(0, 80);
}

export function personDisplayName(person) {
  return normalizeName(person?.displayName || person?.name) || 'Uten navn';
}

export function generationLabel(gen, { relative = true } = {}) {
  const key = String(gen);
  if (GENERATION_LABELS[key]) return GENERATION_LABELS[key];
  if (gen < -4) return relative ? `${Math.abs(gen)} generasjoner opp` : `Gen ${gen}`;
  if (gen > 4) return relative ? `${gen} generasjoner ned` : `Gen ${gen}`;
  return `Generasjon ${gen}`;
}

/** Relasjonslabels for slektsoversikt (0 = husstandens foresatte). */
export function relationLabelForGeneration(gen) {
  if (gen === 0) return 'Familien';
  if (gen === -1) return 'Besteforeldre';
  if (gen === -2) return 'Oldeforeldre';
  if (gen === -3) return 'Tippoldeforeldre';
  if (gen === -4) return 'Tippoldeforeldre (+1)';
  if (gen === 1) return 'Barn';
  if (gen === 2) return 'Barnebarn';
  if (gen === 3) return 'Oldebarn';
  if (gen < -4) return `Tippoldeforeldre (+${Math.abs(gen) - 3})`;
  if (gen > 3) return `Etterkommere (+${gen})`;
  return generationLabel(gen);
}

/** ISO-dato når mulig; bevarer rene årstall (f.eks. «1928»). */
export function normalizeTreeDate(value) {
  if (value == null || value === '') return null;
  const iso = toIsoDate(value);
  if (iso) return iso;
  const s = String(value).trim().slice(0, 32);
  if (/^\d{4}$/.test(s)) return s;
  return s || null;
}

export function assertValidPersonInput(data) {
  const displayName = normalizeName(data?.displayName || data?.name);
  if (!displayName) throw new Error('Oppgi et navn.');
  const birthday = normalizeTreeDate(data?.birthday);
  const deathDate = normalizeTreeDate(data?.deathDate);
  const birth = parseBirthday(birthday);
  const death = parseBirthday(deathDate);
  if (birth && death && death < birth) {
    throw new Error('Dødsdato kan ikke være før fødselsdato.');
  }
  return {
    displayName,
    gender: ['female', 'male', 'other'].includes(data?.gender) ? data.gender : null,
    birthday,
    deathDate,
    notes: String(data?.notes || '').trim().slice(0, 2000),
    email: String(data?.email || '').toLowerCase().trim().slice(0, 120) || null,
    phone: String(data?.phone || '').trim().slice(0, 40) || null,
    linkedUid: data?.linkedUid || null,
    linkedRole: data?.linkedRole || null,
    isExternal: data?.isExternal !== false && !data?.linkedUid,
  };
}

export function normalizeIdList(ids) {
  const seen = new Set();
  const out = [];
  (Array.isArray(ids) ? ids : []).forEach((id) => {
    const v = String(id || '').trim();
    if (!v || seen.has(v)) return;
    seen.add(v);
    out.push(v);
  });
  return out;
}

/** Bygg personmap fra Firestore-rader. */
export function indexPeople(people) {
  const map = new Map();
  (people || []).forEach((p) => {
    if (!p?.id || p.deleted === true) return;
    map.set(p.id, {
      ...p,
      parentIds: normalizeIdList(p.parentIds).filter((id) => id !== p.id),
      partnerIds: normalizeIdList(p.partnerIds).filter((id) => id !== p.id),
    });
  });
  return map;
}

function childrenIndex(peopleMap) {
  const children = new Map();
  peopleMap.forEach((p, id) => {
    (p.parentIds || []).forEach((pid) => {
      if (!pid || pid === id || !peopleMap.has(pid)) return;
      if (!children.has(pid)) children.set(pid, []);
      children.get(pid).push(id);
    });
  });
  return children;
}

function isParentChildPair(a, b, peopleMap) {
  const pa = peopleMap.get(a);
  const pb = peopleMap.get(b);
  if (!pa || !pb) return false;
  return (pa.parentIds || []).includes(b) || (pb.parentIds || []).includes(a);
}

function arePartners(a, b, peopleMap) {
  const pa = peopleMap.get(a);
  const pb = peopleMap.get(b);
  if (!pa || !pb) return false;
  return normalizeIdList(pa.partnerIds).includes(b)
    || normalizeIdList(pb.partnerIds).includes(a);
}

/** True hvis a og b deler minst én forelder (søsken / halvsøsken). */
export function areSiblings(a, b, peopleMap) {
  if (!a || !b || a === b) return false;
  const map = peopleMap instanceof Map ? peopleMap : indexPeople(peopleMap);
  const pa = map.get(a);
  const pb = map.get(b);
  if (!pa || !pb) return false;
  const aParents = new Set(normalizeIdList(pa.parentIds).filter((id) => map.has(id)));
  if (!aParents.size) return false;
  return normalizeIdList(pb.parentIds).some((id) => aParents.has(id));
}

/** True hvis ancestorId er i parent-kjeden til descendantId. */
export function isAncestorOf(ancestorId, descendantId, peopleMap, depth = 0) {
  if (!ancestorId || !descendantId || ancestorId === descendantId || depth > 32) return false;
  const person = peopleMap.get(descendantId);
  if (!person) return false;
  const parents = normalizeIdList(person.parentIds);
  if (parents.includes(ancestorId)) return true;
  return parents.some((pid) => isAncestorOf(ancestorId, pid, peopleMap, depth + 1));
}

/**
 * Behold kun nærmeste foreldre i parentIds.
 * Dropper besteforeldre o.l. når en etterkommer også står i lista
 * (typisk feil når sync knytter barn til alle husstands-foresatte).
 */
export function immediateParentIds(parentIds, peopleMap) {
  const map = peopleMap instanceof Map ? peopleMap : indexPeople(peopleMap);
  const ids = normalizeIdList(parentIds).filter((id) => map.has(id));
  if (ids.length <= 1) return ids;
  return ids.filter(
    (id) => !ids.some((other) => other !== id && isAncestorOf(id, other, map)),
  );
}

/**
 * Gyldige kjerne-foreldre for et barn.
 * - Dropper søsken feilaktig listet som felles foresatte
 * - Beholder maks én partner-duo
 * - 3+ foresatte uten partnerpar behandles ikke som én kjernefamilie
 *   (ellers limes ulike slektslinjer — f.eks. tippolderforeldre — sammen)
 */
export function nuclearParentIds(parentIds, peopleMap) {
  const map = peopleMap instanceof Map ? peopleMap : indexPeople(peopleMap);
  const ids = immediateParentIds(parentIds, map);
  if (ids.length <= 1) return ids;

  const hasSiblingCoParents = ids.some((id, i) => (
    ids.slice(i + 1).some((other) => areSiblings(id, other, map))
  ));
  // Søsken er aldri gyldig kjernefamilie for felles barn i treet
  if (hasSiblingCoParents) return [];

  // Maks én ekte/partner-duo
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      if (arePartners(ids[i], ids[j], map)) {
        return [ids[i], ids[j]].sort();
      }
    }
  }

  // To foresatte uten partnerIds — tillatt (ugift / ufullstendig data)
  if (ids.length === 2) return ids;

  // Tre eller flere uten partnerpar: tvetydig — ikke tegn som én familie
  return [];
}

/**
 * Blant husstands-foresatte: kun den yngste generasjonen,
 * og ikke søsken som begge har rolle «parent» uten å være partnere.
 */
export function householdParentIdsForChildren(parentCandidateIds, peopleMap) {
  return nuclearParentIds(parentCandidateIds, peopleMap);
}

/**
 * Patches for personer der parentIds inkluderer besteforeldre,
 * søsken-foresatte, eller 3+ tvetydige foresatte uten partnerpar.
 * Retter også tippolde-hub: (A,H)→barn1 og (H,C)→barn2 når A↔C er
 * partnere (eller navn tyder på ektepar, f.eks. «Ove … / Johnsen» + Martine Johnsen)
 * — da skal barn1 under (A,C) og barn2 under H alene.
 * Returnerer Map(id → { parentIds?, partnerIds? }).
 */
export function buildParentIdSanitizationPatches(people) {
  const map = indexPeople(people);
  const patches = new Map();

  function ensurePatch(id) {
    if (!patches.has(id)) {
      const p = map.get(id);
      patches.set(id, {
        parentIds: normalizeIdList(p?.parentIds).filter((pid) => map.has(pid)),
        partnerIds: normalizeIdList(p?.partnerIds).filter((pid) => map.has(pid)),
      });
    }
    return patches.get(id);
  }

  map.forEach((person, id) => {
    const prev = normalizeIdList(person.parentIds).filter((pid) => map.has(pid));
    const next = nuclearParentIds(prev, map);
    if (next.length === prev.length && next.every((pid, i) => pid === prev[i])) return;
    const patch = ensurePatch(id);
    patch.parentIds = next;
  });

  // --- Tippoldé-hub: overlappende par som deler H, der A↔C er det ekte paret ---
  const groups = [];
  map.forEach((person, id) => {
    const parentIds = nuclearParentIds(
      patches.has(id) ? patches.get(id).parentIds : person.parentIds,
      map,
    ).filter((pid) => map.has(pid)).sort();
    if (parentIds.length !== 2) return;
    groups.push({ childId: id, parentIds });
  });

  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const g1 = groups[i];
      const g2 = groups[j];
      const shared = g1.parentIds.filter((id) => g2.parentIds.includes(id));
      if (shared.length !== 1) continue;
      const hub = shared[0];
      const n1 = g1.parentIds.find((id) => id !== hub);
      const n2 = g2.parentIds.find((id) => id !== hub);
      if (!n1 || !n2 || n1 === n2) continue;

      // Ole med to ekte partnere: ikke auto-omkoble
      if (arePartners(n1, hub, map) || arePartners(n2, hub, map)) continue;

      const spouses = arePartners(n1, n2, map)
        || likelySpousesByName(map.get(n1), map.get(n2));
      if (!spouses) continue;

      // Primær i paret: den uten «/» i navnet (Martine Johnsen vs Ove … / Johnsen)
      const primary = pickCouplePrimary(n1, n2, map);
      const secondary = primary === n1 ? n2 : n1;
      const childOfPrimary = g1.parentIds.includes(primary) ? g1.childId : g2.childId;
      const childOfSecondary = g1.parentIds.includes(secondary) ? g1.childId : g2.childId;
      if (childOfPrimary === childOfSecondary) continue;

      const couple = [primary, secondary].sort();
      const pCouple = ensurePatch(childOfPrimary);
      pCouple.parentIds = couple;
      const pHub = ensurePatch(childOfSecondary);
      pHub.parentIds = [hub];

      const pa = ensurePatch(primary);
      const pc = ensurePatch(secondary);
      if (!pa.partnerIds.includes(secondary)) {
        pa.partnerIds = [...pa.partnerIds, secondary];
      }
      if (!pc.partnerIds.includes(primary)) {
        pc.partnerIds = [...pc.partnerIds, primary];
      }
    }
  }

  // Drop patches som ikke endrer noe
  const out = new Map();
  patches.forEach((patch, id) => {
    const person = map.get(id);
    if (!person) return;
    const result = {};
    const prevParents = normalizeIdList(person.parentIds).filter((pid) => map.has(pid));
    const nextParents = normalizeIdList(patch.parentIds);
    if (nextParents.length !== prevParents.length
      || nextParents.some((pid, i) => pid !== prevParents[i])) {
      result.parentIds = nextParents;
    }
    const prevPartners = new Set(normalizeIdList(person.partnerIds).filter((pid) => map.has(pid)));
    const nextPartners = normalizeIdList(patch.partnerIds);
    const nextSet = new Set(nextPartners);
    const partnersSame = prevPartners.size === nextSet.size
      && [...prevPartners].every((pid) => nextSet.has(pid));
    if (!partnersSame) result.partnerIds = nextPartners;
    if (result.parentIds || result.partnerIds) out.set(id, result);
  });
  return out;
}

/** Navnetokens (ord på 3+ tegn) for ektepar-gjetting. */
function nameTokens(person) {
  return String(personDisplayName(person) || '')
    .toLowerCase()
    .split(/[\s/,.-]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3);
}

/** Primær i et antatt ektepar — foretrekk navn uten «/». */
function pickCouplePrimary(id1, id2, map) {
  const n1 = personDisplayName(map.get(id1));
  const n2 = personDisplayName(map.get(id2));
  const s1 = String(n1).includes('/');
  const s2 = String(n2).includes('/');
  if (s1 && !s2) return id2;
  if (s2 && !s1) return id1;
  return [id1, id2].sort((x, y) => (
    personDisplayName(map.get(x)).localeCompare(personDisplayName(map.get(y)), 'nb')
  ))[0];
}

/**
 * True hvis navn tyder på ektepar: den ene har «/ Etternavn» som matcher den andres etternavn
 * (f.eks. «Ove Olsen / Johnsen» + «Martine Johnsen»).
 */
export function likelySpousesByName(a, b) {
  if (!a || !b) return false;
  const nameA = personDisplayName(a);
  const nameB = personDisplayName(b);
  const slashA = String(nameA).split('/').map((s) => s.trim()).filter(Boolean);
  const slashB = String(nameB).split('/').map((s) => s.trim()).filter(Boolean);
  const marriedSide = slashA.length >= 2 ? slashA : (slashB.length >= 2 ? slashB : null);
  const other = slashA.length >= 2 ? b : (slashB.length >= 2 ? a : null);
  if (!marriedSide || !other) return false;
  const afterSlash = marriedSide.slice(1).join(' ').toLowerCase()
    .split(/[\s/,.-]+/)
    .filter((t) => t.length >= 4);
  const otherTokens = nameTokens(other);
  return afterSlash.some((t) => otherTokens.includes(t));
}

/** Beregn generasjonstall relativt til «fokus» (0 = fokus / husstand). */
export function computeGenerations(people, focusIds = []) {
  const map = indexPeople(people);
  const gens = new Map();
  const queue = [];
  const n = map.size;
  const maxSpan = Math.min(32, Math.max(8, n));
  const maxSteps = n * 6 + 16;
  const visits = new Map();
  const kidsOf = childrenIndex(map);

  function assign(id, gen) {
    if (!map.has(id)) return false;
    const clamped = Math.max(-maxSpan, Math.min(maxSpan, gen));
    if (gens.has(id) && gens.get(id) === clamped) return false;
    const seen = visits.get(id) || 0;
    if (seen >= 6) return false;
    visits.set(id, seen + 1);
    gens.set(id, clamped);
    queue.push(id);
    return true;
  }

  const seeds = (focusIds || []).filter((id) => map.has(id));
  if (!seeds.length) {
    map.forEach((p) => {
      const parentsInTree = (p.parentIds || []).filter((id) => map.has(id));
      if (!parentsInTree.length) seeds.push(p.id);
    });
  }
  if (!seeds.length && map.size) {
    seeds.push([...map.keys()][0]);
  }

  seeds.forEach((id) => assign(id, 0));

  let steps = 0;
  while (queue.length && steps < maxSteps) {
    steps += 1;
    const id = queue.shift();
    const g = gens.get(id);
    const person = map.get(id);
    if (!person || g == null) continue;

    (person.parentIds || []).forEach((pid) => {
      if (pid === id || !map.has(pid)) return;
      const next = g - 1;
      if (!gens.has(pid) || next < gens.get(pid)) assign(pid, next);
    });

    (person.partnerIds || []).forEach((pid) => {
      if (pid === id || !map.has(pid)) return;
      if (isParentChildPair(id, pid, map)) return;
      if (!gens.has(pid)) {
        assign(pid, g);
      } else if (gens.get(pid) !== g) {
        const aligned = Math.min(g, gens.get(pid));
        if (gens.get(pid) !== aligned) assign(pid, aligned);
        if (gens.get(id) !== aligned) assign(id, aligned);
      }
    });

    (kidsOf.get(id) || []).forEach((cid) => {
      if (cid === id) return;
      const next = g + 1;
      if (!gens.has(cid) || next > gens.get(cid)) assign(cid, next);
    });
  }

  map.forEach((_, id) => {
    if (!gens.has(id)) gens.set(id, 0);
  });

  return gens;
}

/** Sørg for at partnerIds er gjensidige (A↔B). */
export function ensureMutualPartners(peopleMap) {
  peopleMap.forEach((person, id) => {
    normalizeIdList(person.partnerIds).forEach((pid) => {
      const other = peopleMap.get(pid);
      if (!other) return;
      if (!normalizeIdList(other.partnerIds).includes(id)) {
        other.partnerIds = normalizeIdList([...other.partnerIds, id]);
      }
    });
  });
  return peopleMap;
}

/**
 * Layout for canvas: rader per generasjon, kolonner per person/par.
 * Barn plasseres under egne foreldre (ikke på tvers av andre slektslinjer).
 * Returnerer { nodes, edges, width, height, generations, gens, minGen }
 */
export function layoutFamilyTree(people, {
  focusIds = [],
  nodeW = 112,
  nodeH = 88,
  gapX = 28,
  gapY = 72,
  pad = 24,
} = {}) {
  const map = ensureMutualPartners(indexPeople(people));
  const gens = computeGenerations([...map.values()], focusIds);
  const byGen = new Map();

  map.forEach((person, id) => {
    const g = gens.get(id) ?? 0;
    if (!byGen.has(g)) byGen.set(g, []);
    byGen.get(g).push(person);
  });

  const genKeys = [...byGen.keys()].sort((a, b) => a - b); // eldst (mest negativ) først
  const minGen = genKeys[0] ?? 0;

  /** Partner-enheter i en rad — finner partnere begge veier. */
  function partnerUnits(row) {
    const placed = new Set();
    const units = [];
    const rowIds = new Set(row.map((p) => p.id));

    function partnersOf(person) {
      const out = [];
      const seen = new Set();
      normalizeIdList(person.partnerIds).forEach((pid) => {
        if (!rowIds.has(pid) || seen.has(pid)) return;
        const partner = row.find((x) => x.id === pid);
        if (partner) {
          seen.add(pid);
          out.push(partner);
        }
      });
      // Omvendt: andre på raden som peker hit
      row.forEach((other) => {
        if (other.id === person.id || seen.has(other.id)) return;
        if (normalizeIdList(other.partnerIds).includes(person.id)) {
          seen.add(other.id);
          out.push(other);
        }
      });
      return out;
    }

    row
      .slice()
      .sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b), 'nb'))
      .forEach((p) => {
        if (placed.has(p.id)) return;
        const members = [p];
        placed.add(p.id);
        partnersOf(p).forEach((partner) => {
          if (placed.has(partner.id)) return;
          members.push(partner);
          placed.add(partner.id);
          // Transitively pull partners-of-partners on same row (sjeldent)
          partnersOf(partner).forEach((extra) => {
            if (placed.has(extra.id)) return;
            members.push(extra);
            placed.add(extra.id);
          });
        });
        // Stabil rekkefølge inne i enheten
        members.sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b), 'nb'));
        units.push({ members });
      });
    return units;
  }

  /**
   * Plasseringsenheter: partnere først, deretter slå sammen søsken
   * (samme kjerne-foreldre) til én blokk — unngår at kusiner/fettere
   * skyves under tante/onkel og limer sammen strekene.
   */
  function placementUnits(row) {
    const pUnits = partnerUnits(row);

    function siblingKeyForUnit(unit) {
      // Partnerpar har egne nøkler — ikke slå sammen via søsken.
      if (unit.members.length > 1) return `couple:${unit.members.map((m) => m.id).sort().join('-')}`;
      const pids = nuclearParentIds(unit.members[0].parentIds, map).sort();
      if (!pids.length) return `solo:${unit.members[0].id}`;
      return `sib:${pids.join('|')}`;
    }

    const clusters = [];
    const used = new Set();
    pUnits.forEach((unit, i) => {
      if (used.has(i)) return;
      const key = siblingKeyForUnit(unit);
      const members = [...unit.members];
      used.add(i);
      if (key.startsWith('sib:')) {
        pUnits.forEach((other, j) => {
          if (used.has(j) || j === i) return;
          if (siblingKeyForUnit(other) === key) {
            members.push(...other.members);
            used.add(j);
          }
        });
      }
      members.sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b), 'nb'));
      const partnerCoupled = members.length > 1 && members.every((m) => (
        members.some((o) => o.id !== m.id && arePartners(m.id, o.id, map))
      ));
      clusters.push({ members, partnerCoupled });
    });
    return clusters;
  }

  /** Bredde for en persons egne barn (kjernefamilie), ellers nodeW. */
  function nuclearChildBlockWidth(person) {
    const partnerIds = new Set(normalizeIdList(person.partnerIds));
    const kids = [];
    map.forEach((p) => {
      const nParents = nuclearParentIds(p.parentIds, map);
      if (!nParents.length) return;
      if (!nParents.includes(person.id)) return;
      if (!nParents.every((id) => id === person.id || partnerIds.has(id))) return;
      kids.push(p);
    });
    if (!kids.length) return nodeW;
    return kids.length * nodeW + Math.max(0, kids.length - 1) * gapX;
  }

  function memberSlots(unit) {
    if (unit.partnerCoupled || unit.members.length === 1) {
      const coupleW = unit.members.length * nodeW + Math.max(0, unit.members.length - 1) * gapX;
      // Felles barn for partnerpar
      let kidsW = 0;
      if (unit.partnerCoupled) {
        const parentSet = new Set(unit.members.map((m) => m.id));
        const kids = [];
        map.forEach((p) => {
          const nParents = nuclearParentIds(p.parentIds, map);
          if (nParents.length && nParents.every((id) => parentSet.has(id))
            && nParents.some((id) => parentSet.has(id))) {
            kids.push(p);
          }
        });
        if (kids.length) {
          kidsW = kids.length * nodeW + Math.max(0, kids.length - 1) * gapX;
        }
      } else {
        kidsW = nuclearChildBlockWidth(unit.members[0]);
      }
      const w = Math.max(coupleW, kidsW);
      return { w, slots: unit.members.map((m) => ({ member: m, slotW: nodeW })) };
    }

    // Søsken uten partner: hvert medlem får plass til egen barneflokk
    const slots = unit.members.map((m) => ({
      member: m,
      slotW: Math.max(nodeW, nuclearChildBlockWidth(m)),
    }));
    const w = slots.reduce((s, slot) => s + slot.slotW, 0)
      + Math.max(0, slots.length - 1) * gapX;
    return { w, slots };
  }

  function unitWidth(unit) {
    return memberSlots(unit).w;
  }

  function unitAnchorX(unit, posMap) {
    const xs = [];
    unit.members.forEach((m) => {
      nuclearParentIds(m.parentIds, map).forEach((pid) => {
        const parent = posMap.get(pid);
        if (parent) xs.push(parent.x + parent.w / 2);
      });
    });
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }

  /** Plasser enheter uten overlapp; foretrukket under foreldre-midtpunkt. */
  function placeUnits(units, posMap) {
    const enriched = units.map((unit) => {
      const { w, slots } = memberSlots(unit);
      return {
        ...unit,
        w,
        slots,
        anchorX: unitAnchorX(unit, posMap),
      };
    });
    enriched.sort((a, b) => {
      if (a.anchorX != null && b.anchorX != null && a.anchorX !== b.anchorX) {
        return a.anchorX - b.anchorX;
      }
      if (a.anchorX != null && b.anchorX == null) return -1;
      if (a.anchorX == null && b.anchorX != null) return 1;
      return personDisplayName(a.members[0]).localeCompare(personDisplayName(b.members[0]), 'nb');
    });

    let cursor = pad;
    const starts = [];
    enriched.forEach((unit) => {
      let x = unit.anchorX != null ? unit.anchorX - unit.w / 2 : cursor;
      if (x < cursor) x = cursor;
      starts.push(x);
      cursor = x + unit.w + gapX;
    });
    return { units: enriched, starts };
  }

  const nodes = [];
  const pos = new Map();

  genKeys.forEach((g, rowIndex) => {
    const row = byGen.get(g);
    const y = pad + rowIndex * (nodeH + gapY);
    const { units, starts } = placeUnits(placementUnits(row), pos);
    units.forEach((unit, ui) => {
      const startX = starts[ui];
      if (unit.partnerCoupled || unit.members.length === 1) {
        const coupleW = unit.members.length * nodeW + Math.max(0, unit.members.length - 1) * gapX;
        let x = startX + Math.max(0, (unit.w - coupleW) / 2);
        unit.members.forEach((person) => {
          const node = {
            id: person.id,
            x,
            y,
            w: nodeW,
            h: nodeH,
            gen: g,
            person,
          };
          nodes.push(node);
          pos.set(person.id, node);
          x += nodeW + gapX;
        });
      } else {
        let slotX = startX;
        (unit.slots || []).forEach((slot) => {
          const x = slotX + Math.max(0, (slot.slotW - nodeW) / 2);
          const node = {
            id: slot.member.id,
            x,
            y,
            w: nodeW,
            h: nodeH,
            gen: g,
            person: slot.member,
          };
          nodes.push(node);
          pos.set(slot.member.id, node);
          slotX += slot.slotW + gapX;
        });
      }
    });
    byGen.set(g, units.flatMap((u) => u.members));
  });

  // Én felles forskyvning — ikke sentrer hver rad for seg (det ødelegger foreldre→barn-linjer).
  const minX = nodes.length ? Math.min(...nodes.map((n) => n.x)) : pad;
  const maxX = nodes.length ? Math.max(...nodes.map((n) => n.x + n.w)) : pad + nodeW;
  const shift = pad - minX;
  if (shift !== 0) {
    nodes.forEach((n) => { n.x += shift; });
  }
  const canvasW = Math.max(maxX - minX + pad * 2, nodeW + pad * 2);

  const edges = [];
  // Partner-linjer (kun samme generasjon / nærliggende Y — ellers hopp over for å unngå «spøkelseslinjer»)
  // Personer med flere partnere på samme rad (f.eks. Ole↔Martine og Ole↔Ove) må ikke
  // få abutende streker på samme Y — det blir én tippolde-tråd over alle tre.
  const sameRowPartnerCount = new Map();
  map.forEach((person) => {
    const a = pos.get(person.id);
    if (!a) return;
    let n = 0;
    normalizeIdList(person.partnerIds).forEach((pid) => {
      const b = pos.get(pid);
      if (!b) return;
      if (Math.abs(a.y - b.y) > nodeH * 0.5) return;
      n += 1;
    });
    // Tell også omvendte (ensidige) lenker
    map.forEach((other) => {
      if (other.id === person.id) return;
      if (!normalizeIdList(other.partnerIds).includes(person.id)) return;
      const b = pos.get(other.id);
      if (!b || Math.abs(a.y - b.y) > nodeH * 0.5) return;
      if (normalizeIdList(person.partnerIds).includes(other.id)) return;
      n += 1;
    });
    sameRowPartnerCount.set(person.id, n);
  });
  const partnerLaneByKey = new Map();
  const partnerLaneCounter = new Map(); // personId → next lane index for multi-partner
  function partnerLaneFor(personId, key) {
    if (partnerLaneByKey.has(key)) return partnerLaneByKey.get(key);
    const count = sameRowPartnerCount.get(personId) || 0;
    if (count < 2) {
      partnerLaneByKey.set(key, 0);
      return 0;
    }
    const lane = partnerLaneCounter.get(personId) || 0;
    partnerLaneCounter.set(personId, lane + 1);
    partnerLaneByKey.set(key, lane);
    return lane;
  }

  const partnerSeen = new Set();
  map.forEach((person) => {
    (person.partnerIds || []).forEach((pid) => {
      if (!map.has(pid)) return;
      const key = [person.id, pid].sort().join('|');
      if (partnerSeen.has(key)) return;
      partnerSeen.add(key);
      const a = pos.get(person.id);
      const b = pos.get(pid);
      if (!a || !b) return;
      // Partnere på ulike rader: ikke tegn lang diagonal/horisontal
      if (Math.abs(a.y - b.y) > nodeH * 0.5) return;
      // Velg hub (flest partnere) for fil-tildeling
      const hubId = (sameRowPartnerCount.get(person.id) || 0) >= (sameRowPartnerCount.get(pid) || 0)
        ? person.id
        : pid;
      const hubCount = sameRowPartnerCount.get(hubId) || 0;
      const lane = partnerLaneFor(hubId, key);
      const baseY = (a.y + a.h / 2 + b.y + b.h / 2) / 2;
      // Spre par-linjer (±6px) når noen har 2+ partnere på raden
      const yOff = hubCount >= 2
        ? (lane - (hubCount - 1) / 2) * 8
        : 0;
      edges.push({
        id: `p-${key}`,
        type: 'partner',
        from: person.id,
        to: pid,
        x1: a.x + a.w / 2,
        y1: baseY + yOff,
        x2: b.x + b.w / 2,
        y2: baseY + yOff,
      });
    });
  });

  // Foreldre → barn: grupper søsken med samme kjerne-foreldre — én bus, én drop per forelder.
  // nuclearParentIds dropper besteforeldre og søsken feilaktig listet som felles foresatte.
  const siblingGroups = new Map();
  map.forEach((person) => {
    const parentIds = nuclearParentIds(person.parentIds, map)
      .filter((id) => pos.has(id))
      .sort();
    if (!parentIds.length || !pos.has(person.id)) return;
    const key = parentIds.join('|');
    if (!siblingGroups.has(key)) siblingGroups.set(key, { parentIds, childIds: [] });
    siblingGroups.get(key).childIds.push(person.id);
  });

  const siblingGroupList = [...siblingGroups.values()];
  // Foreldre som inngår i flere søskengrupper (f.eks. Ole i Martine–Ole og Ole–Ove).
  // Delte H-albuer på samme Y limer tippolde-linjer til én sammenhengende tråd.
  const parentGroupCount = new Map();
  siblingGroupList.forEach((group) => {
    group.parentIds.forEach((pid) => {
      parentGroupCount.set(pid, (parentGroupCount.get(pid) || 0) + 1);
    });
  });
  const groupSharesParent = (group) => group.parentIds.some((pid) => (parentGroupCount.get(pid) || 0) > 1);
  // Stabil «fil»-forskyvning per gruppe, så H-jogs ikke ligger på samme Y.
  const sharedGroupLane = new Map();
  let nextSharedLane = 0;
  siblingGroupList.forEach((group) => {
    const key = group.parentIds.join('|');
    if (groupSharesParent(group) && !sharedGroupLane.has(key)) {
      sharedGroupLane.set(key, nextSharedLane);
      nextSharedLane += 1;
    }
  });
  siblingGroupList.forEach((group) => {
    let parents = group.parentIds.map((id) => pos.get(id)).filter(Boolean);
    const children = group.childIds.map((id) => pos.get(id)).filter(Boolean);
    if (!parents.length || !children.length) return;

    // Ekstra vern: hvis foreldre likevel ligger på ulike rader, knytt kun til nederste rad.
    if (parents.length > 1) {
      const maxY = Math.max(...parents.map((p) => p.y));
      const closest = parents.filter((p) => p.y >= maxY - 1);
      if (closest.length && closest.length < parents.length) parents = closest;
    }

    const parentBottom = Math.max(...parents.map((p) => p.y + p.h));
    const childTops = children.map((c) => c.y);
    const childY = Math.min(...childTops);
    const gap = Math.max(childY - parentBottom, 48);
    const groupKey = group.parentIds.join('-');
    const lane = sharedGroupLane.get(group.parentIds.join('|'));
    const sharesParent = groupSharesParent(group);
    // Delte foresatte: første gruppe nær foreldre, neste nær barn — maks avstand
    // så H-albuer ikke smelter til én tippolde-tråd.
    let midY = parentBottom + gap * 0.35;
    if (lane != null && nextSharedLane > 1) {
      const t = nextSharedLane === 2
        ? (lane === 0 ? 0.22 : 0.78)
        : (lane + 1) / (nextSharedLane + 1);
      midY = parentBottom + gap * t;
    }
    const parentXs = parents.map((p) => p.x + p.w / 2);
    const midX = parentXs.reduce((s, x) => s + x, 0) / parentXs.length;

    // Horisontal foreldre-bus kun for ekte partnerpar som ikke deler person med
    // en annen gruppe — ellers limer Martine–Ole og Ole–Ove seg til én strek.
    const parentsAreCouple = parents.length === 2
      && arePartners(parents[0].id, parents[1].id, map)
      && !sharesParent;

    if (parentsAreCouple) {
      parents.forEach((p) => {
        edges.push({
          id: `c-drop-${p.id}-${groupKey}`,
          type: 'parent',
          kind: 'drop',
          from: p.id,
          to: children[0].id,
          x1: p.x + p.w / 2,
          y1: p.y + p.h,
          x2: p.x + p.w / 2,
          y2: midY,
          midX,
          midY,
        });
      });
      edges.push({
        id: `c-bus-${groupKey}`,
        type: 'parent',
        kind: 'bus',
        from: parents[0].id,
        to: children[0].id,
        x1: Math.min(...parentXs),
        y1: midY,
        x2: Math.max(...parentXs),
        y2: midY,
        midX,
        midY,
      });

      if (children.length === 1) {
        const child = children[0];
        const childX = child.x + child.w / 2;
        edges.push({
          id: `c-stem-${child.id}`,
          type: 'parent',
          kind: 'stem',
          from: parents[0].id,
          to: child.id,
          x1: midX,
          y1: midY,
          x2: childX,
          y2: child.y,
          midX,
          midY,
        });
      } else {
        const childXs = children.map((c) => c.x + c.w / 2).sort((a, b) => a - b);
        const barLeft = childXs[0];
        const barRight = childXs[childXs.length - 1];
        const barY = midY + Math.max((childY - midY) * 0.5, 14);
        edges.push({
          id: `c-stem-${groupKey}`,
          type: 'parent',
          kind: 'stem',
          from: parents[0].id,
          to: children[0].id,
          x1: midX,
          y1: midY,
          x2: Math.min(Math.max(midX, barLeft), barRight),
          y2: barY,
          midX,
          midY,
        });
        edges.push({
          id: `c-bar-${groupKey}`,
          type: 'parent',
          kind: 'bus',
          from: parents[0].id,
          to: children[0].id,
          x1: barLeft,
          y1: barY,
          x2: barRight,
          y2: barY,
          midX,
          midY,
        });
        children.forEach((child) => {
          const cx = child.x + child.w / 2;
          edges.push({
            id: `c-child-${child.id}`,
            type: 'parent',
            kind: 'drop',
            from: parents[0].id,
            to: child.id,
            x1: cx,
            y1: barY,
            x2: cx,
            y2: child.y,
            midX,
            midY,
          });
        });
      }
      return;
    }

    // Én forelder, eller flere uten partner-flagg: egen strek per forelder.
    // Viktig: ikke del midY mellom foresatte i samme gruppe — da møtes H-albuene
    // og gjenskaper en «c-bus» (Martine–Ole / Ole–Ove tippolde-strek) selv om
    // parentsAreCouple er false.
    function stemMidYForParent(parentIndex) {
      if (parents.length <= 1) return midY;
      // Stor Y-avstand (min 22px) — liten forskyvning så fortsatt ut som én bus.
      const minSep = 22;
      if (parents.length === 2) {
        let tLow;
        let tHigh;
        if (sharesParent && nextSharedLane > 1) {
          // Gruppe nær foreldre vs nær barn
          if (lane === 0) {
            tLow = 0.14;
            tHigh = 0.36;
          } else if (lane === nextSharedLane - 1) {
            tLow = 0.64;
            tHigh = 0.86;
          } else {
            const base = (lane + 1) / (nextSharedLane + 1);
            tLow = Math.max(0.12, base - 0.12);
            tHigh = Math.min(0.88, base + 0.12);
          }
        } else {
          tLow = 0.22;
          tHigh = 0.52;
        }
        let yLow = parentBottom + gap * tLow;
        let yHigh = parentBottom + gap * tHigh;
        if (yHigh - yLow < minSep) yHigh = yLow + minSep;
        return parentIndex === 0 ? yLow : yHigh;
      }
      const t = 0.18 + parentIndex * (0.54 / Math.max(parents.length - 1, 1));
      return parentBottom + gap * Math.min(0.88, t);
    }

    if (children.length === 1) {
      const child = children[0];
      const childX = child.x + child.w / 2;
      parents.forEach((p, pi) => {
        const px = p.x + p.w / 2;
        const stemMidY = stemMidYForParent(pi);
        // Delt foresatt (Ole): start ikke alle stems i samme X — ellers blir
        // én vertikal «ryggrad» som limer Martine–Ole–Ove visuelt sammen.
        const sharedCount = parentGroupCount.get(p.id) || 0;
        let startX = px;
        if (sharedCount > 1 && lane != null) {
          const dir = childX >= px ? 1 : -1;
          startX = px + dir * (10 + lane * 6);
        }
        edges.push({
          id: `c-stem-${p.id}-${child.id}`,
          type: 'parent',
          kind: 'stem',
          from: p.id,
          to: child.id,
          x1: startX,
          y1: p.y + p.h,
          x2: childX,
          y2: child.y,
          midX: startX,
          midY: stemMidY,
        });
      });
      return;
    }

    const childXs = children.map((c) => c.x + c.w / 2).sort((a, b) => a - b);
    const barLeft = childXs[0];
    const barRight = childXs[childXs.length - 1];
    // Barne-bar under laveste foresatt-albue så den ikke limer tippolde-H
    const parentStemYs = parents.map((_, pi) => stemMidYForParent(pi));
    const lowestStemY = Math.max(...parentStemYs);
    const barY = lowestStemY + Math.max((childY - lowestStemY) * 0.45, 14);
    edges.push({
      id: `c-bar-${groupKey}`,
      type: 'parent',
      kind: 'bus',
      from: parents[0].id,
      to: children[0].id,
      x1: barLeft,
      y1: barY,
      x2: barRight,
      y2: barY,
      midX,
      midY: lowestStemY,
    });
    parents.forEach((p, pi) => {
      const px = p.x + p.w / 2;
      const stemMidY = parentStemYs[pi];
      const targetX = Math.min(Math.max(px, barLeft), barRight);
      const sharedCount = parentGroupCount.get(p.id) || 0;
      let startX = px;
      if (sharedCount > 1 && lane != null) {
        const dir = targetX >= px ? 1 : -1;
        startX = px + dir * (10 + lane * 6);
      }
      edges.push({
        id: `c-stem-${p.id}-${groupKey}`,
        type: 'parent',
        kind: 'stem',
        from: p.id,
        to: children[0].id,
        x1: startX,
        y1: p.y + p.h,
        x2: targetX,
        y2: barY,
        midX: startX,
        midY: stemMidY,
      });
    });
    children.forEach((child) => {
      const cx = child.x + child.w / 2;
      edges.push({
        id: `c-child-${child.id}`,
        type: 'parent',
        kind: 'drop',
        from: parents[0].id,
        to: child.id,
        x1: cx,
        y1: barY,
        x2: cx,
        y2: child.y,
        midX,
        midY: lowestStemY,
      });
    });
  });

  const height = genKeys.length
    ? pad * 2 + genKeys.length * nodeH + Math.max(0, genKeys.length - 1) * gapY
    : pad * 2 + nodeH;

  return {
    nodes,
    edges,
    width: canvasW,
    height,
    generations: genKeys.map((g) => ({
      gen: g,
      label: relationLabelForGeneration(g - (minGen < 0 ? 0 : 0)),
      count: byGen.get(g)?.length || 0,
      people: byGen.get(g) || [],
    })),
    gens,
    minGen,
  };
}

/**
 * Pedigree-segmenter for foreldre→barn.
 * Støtter nye kind-kanter (drop/bus/stem) og legacy-kanter.
 */
export function parentEdgeSegments(edge) {
  const x1 = Number(edge?.x1) || 0;
  const y1 = Number(edge?.y1) || 0;
  const x2 = Number(edge?.x2) || 0;
  const y2 = Number(edge?.y2) || 0;
  const kind = edge?.kind;

  if (kind === 'drop') {
    return [{ orient: 'v', x: x1, y1, y2 }];
  }
  if (kind === 'bus') {
    return [{ orient: 'h', y: y1, x1, x2 }];
  }
  if (kind === 'stem') {
    // Alltid albue fra forelder-X (x1) — ikke midX — så delt foresatt ikke
    // «stråler» begge veier fra samme punkt på en måte som limer trådene.
    const jogY = edge?.midY != null
      ? Number(edge.midY)
      : y1 + Math.max((y2 - y1) * 0.55, 12);
    if (Math.abs(x2 - x1) < 1) {
      return [{ orient: 'v', x: x1, y1, y2 }];
    }
    const clampedJog = Math.min(Math.max(jogY, y1 + 8), Math.max(y2 - 8, y1 + 8));
    return [
      { orient: 'v', x: x1, y1, y2: clampedJog },
      { orient: 'h', y: clampedJog, x1, x2 },
      { orient: 'v', x: x2, y1: clampedJog, y2 },
    ];
  }

  // Legacy: én kant per forelder med full sti via midX
  const midX = edge?.midX != null ? Number(edge.midX) : (x1 + x2) / 2;
  const midY = edge?.midY != null ? Number(edge.midY) : (y1 + y2) / 2;
  const dropY = midY + Math.max((y2 - midY) * 0.5, 10);
  return [
    { orient: 'v', x: x1, y1, y2: midY },
    { orient: 'h', y: midY, x1, x2: midX },
    { orient: 'v', x: midX, y1: midY, y2: dropY },
    { orient: 'h', y: dropY, x1: midX, x2 },
    { orient: 'v', x: x2, y1: dropY, y2 },
  ];
}

/** Juster generasjonslabels så fokus (0) er husstanden. */
export function buildGenerationOverview(people, focusIds = []) {
  const layout = layoutFamilyTree(people, { focusIds });
  return layout.generations.map((row) => ({
    ...row,
    label: relationLabelForGeneration(row.gen),
  }));
}

/** Normalisert nøkkel for navnematch (trim + lower + kollaps whitespace). */
export function normalizePersonKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Finn tre-person som matcher et familiemedlem.
 * Prioritet: linkedUid → e-post → entydig navn (ulinket foretrekkes).
 */
export function findMatchingTreePerson(member, people) {
  if (!member?.id) return null;
  const active = (people || []).filter((p) => p && p.deleted !== true);
  const byUid = active.find((p) => p.linkedUid && p.linkedUid === member.id);
  if (byUid) return byUid;

  const email = String(member.email || '').toLowerCase().trim();
  if (email) {
    const byEmail = active.find(
      (p) => !p.linkedUid && String(p.email || '').toLowerCase().trim() === email,
    );
    if (byEmail) return byEmail;
  }

  const nameKey = normalizePersonKey(member.name || member.displayName);
  if (!nameKey) return null;
  const nameMatches = active.filter(
    (p) => normalizePersonKey(personDisplayName(p)) === nameKey,
  );
  if (!nameMatches.length) return null;
  const unlinked = nameMatches.filter((p) => !p.linkedUid);
  if (unlinked.length === 1) return unlinked[0];
  if (unlinked.length > 1) {
    // Foretrekk invitert / den med flest relasjoner
    return pickPreferredDuplicate(unlinked);
  }
  if (nameMatches.length === 1) return nameMatches[0];
  return null;
}

/** Poeng for hvilken duplikat som skal beholdes. */
export function duplicateKeepScore(person) {
  if (!person) return -1;
  let score = 0;
  if (person.linkedUid) score += 100;
  if (person.inviteStatus === 'pending') score += 40;
  if (person.inviteKey) score += 10;
  if (person.photoURL) score += 15;
  if (person.email) score += 8;
  if (person.phone) score += 5;
  if (person.birthday) score += 5;
  score += normalizeIdList(person.parentIds).length * 3;
  score += normalizeIdList(person.partnerIds).length * 3;
  return score;
}

export function pickPreferredDuplicate(people) {
  const list = (people || []).filter(Boolean);
  if (!list.length) return null;
  return list.slice().sort((a, b) => {
    const diff = duplicateKeepScore(b) - duplicateKeepScore(a);
    if (diff !== 0) return diff;
    return String(a.id || '').localeCompare(String(b.id || ''));
  })[0];
}

/**
 * Grupper åpenbare duplikater: samme linkedUid, samme e-post, eller samme navn.
 * Returnerer [{ keepId, dropIds }].
 */
export function findDuplicatePersonGroups(people) {
  const active = (people || []).filter((p) => p && p.deleted !== true && p.id);
  const groups = [];
  const claimed = new Set();

  function addGroup(candidates) {
    const unique = [];
    const seen = new Set();
    candidates.forEach((p) => {
      if (!p?.id || seen.has(p.id) || claimed.has(p.id)) return;
      seen.add(p.id);
      unique.push(p);
    });
    if (unique.length < 2) return;
    const keep = pickPreferredDuplicate(unique);
    if (!keep) return;
    const dropIds = unique.filter((p) => p.id !== keep.id).map((p) => p.id);
    if (!dropIds.length) return;
    unique.forEach((p) => claimed.add(p.id));
    groups.push({ keepId: keep.id, dropIds, keep });
  }

  // 1) Samme linkedUid
  const byUid = new Map();
  active.forEach((p) => {
    if (!p.linkedUid) return;
    if (!byUid.has(p.linkedUid)) byUid.set(p.linkedUid, []);
    byUid.get(p.linkedUid).push(p);
  });
  byUid.forEach((list) => addGroup(list));

  // 2) Samme e-post
  const byEmail = new Map();
  active.forEach((p) => {
    if (claimed.has(p.id)) return;
    const email = String(p.email || '').toLowerCase().trim();
    if (!email) return;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(p);
  });
  byEmail.forEach((list) => addGroup(list));

  // 3) Samme normaliserte navn (inkl. invitert + ulinket kopi)
  const byName = new Map();
  active.forEach((p) => {
    if (claimed.has(p.id)) return;
    const key = normalizePersonKey(personDisplayName(p));
    if (!key) return;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(p);
  });
  byName.forEach((list) => addGroup(list));

  return groups;
}

/**
 * Bygg patch-map for å slå sammen dropIds inn i keepId:
 * - alle parentIds/partnerIds som peker på drop → keep
 * - keep arver relasjoner fra drop
 * Returnerer Map(id → { parentIds, partnerIds }).
 */
export function buildMergeRelationPatches(people, keepId, dropIds) {
  const map = indexPeople(people);
  const drops = new Set((dropIds || []).filter((id) => id && id !== keepId));
  if (!map.has(keepId) || !drops.size) return new Map();

  const patches = new Map();
  const ensure = (id) => {
    if (!patches.has(id)) {
      const p = map.get(id);
      patches.set(id, {
        parentIds: normalizeIdList(p?.parentIds),
        partnerIds: normalizeIdList(p?.partnerIds),
      });
    }
    return patches.get(id);
  };

  const keepPatch = ensure(keepId);
  drops.forEach((dropId) => {
    const drop = map.get(dropId);
    if (!drop) return;
    normalizeIdList(drop.parentIds).forEach((pid) => {
      if (pid === keepId || drops.has(pid)) return;
      if (!keepPatch.parentIds.includes(pid) && keepPatch.parentIds.length < 2) {
        keepPatch.parentIds = [...keepPatch.parentIds, pid];
      }
    });
    normalizeIdList(drop.partnerIds).forEach((pid) => {
      if (pid === keepId || drops.has(pid)) return;
      if (!keepPatch.partnerIds.includes(pid)) {
        keepPatch.partnerIds = [...keepPatch.partnerIds, pid];
      }
    });
  });

  // Skriv om peilere fra andre personer
  map.forEach((person, id) => {
    if (id === keepId || drops.has(id)) return;
    let parentIds = normalizeIdList(person.parentIds);
    let partnerIds = normalizeIdList(person.partnerIds);
    let changed = false;

    const nextParents = [];
    parentIds.forEach((pid) => {
      if (drops.has(pid)) {
        if (!nextParents.includes(keepId) && keepId !== id) nextParents.push(keepId);
        changed = true;
      } else if (!nextParents.includes(pid)) {
        nextParents.push(pid);
      }
    });
    const nextPartners = [];
    partnerIds.forEach((pid) => {
      if (drops.has(pid)) {
        if (!nextPartners.includes(keepId) && keepId !== id) nextPartners.push(keepId);
        changed = true;
      } else if (!nextPartners.includes(pid)) {
        nextPartners.push(pid);
      }
    });

    if (changed) {
      const patch = ensure(id);
      patch.parentIds = nextParents.slice(0, 2);
      patch.partnerIds = nextPartners;
    }
  });

  // Speil partner-kobling keep ↔ arvede partnere
  keepPatch.partnerIds.forEach((pid) => {
    if (!map.has(pid) || drops.has(pid)) return;
    const other = ensure(pid);
    if (!other.partnerIds.includes(keepId)) {
      other.partnerIds = [...other.partnerIds, keepId];
    }
  });

  // Fjern drop-id-er fra keep sine lister
  keepPatch.parentIds = keepPatch.parentIds.filter((id) => !drops.has(id) && id !== keepId);
  keepPatch.partnerIds = keepPatch.partnerIds.filter((id) => !drops.has(id) && id !== keepId);

  return patches;
}

/** Finn personer blant app-medlemmer som mangler i treet (inkl. match på e-post/navn). */
export function membersMissingFromTree(members, people) {
  return (members || []).filter((m) => m?.id && !findMatchingTreePerson(m, people));
}

/**
 * Medlemmer som har en tre-match uten linkedUid — skal linkes, ikke opprettes på nytt.
 */
export function membersNeedingTreeLink(members, people) {
  const out = [];
  (members || []).forEach((m) => {
    if (!m?.id) return;
    const match = findMatchingTreePerson(m, people);
    if (match && !match.linkedUid) {
      out.push({ member: m, person: match });
    }
  });
  return out;
}

/** Seed-payloads fra eksisterende familiemedlemmer. */
export function seedPeopleFromMembers(members) {
  const parents = (members || []).filter((m) => m.role === 'parent');
  const kids = (members || []).filter((m) => m.role === 'child');
  const parentIds = [];

  const people = [];
  parents.forEach((m) => {
    const id = `m_${m.id}`;
    parentIds.push(id);
    people.push({
      tempId: id,
      displayName: m.name || 'Foresatt',
      linkedUid: m.id,
      linkedRole: 'parent',
      isExternal: false,
      photoURL: m.photoURL || null,
      avatarId: m.avatarId || null,
      birthday: m.birthday || null,
      gender: m.gender || null,
      parentIds: [],
      partnerIds: [],
      color: m.color || null,
    });
  });

  // Link foresatte som partnere hvis det er nøyaktig to
  if (parentIds.length === 2) {
    people[0].partnerIds = [parentIds[1]];
    people[1].partnerIds = [parentIds[0]];
  }

  // Kun nærmeste foresatte som foreldre for barn (ikke besteforeldre i samme husstand)
  const mapForParents = new Map(
    people.map((p) => [p.tempId, { ...p, id: p.tempId, parentIds: p.parentIds || [], partnerIds: p.partnerIds || [] }]),
  );
  // Seed har ikke besteforeldre blant members, men behold samme helper for konsistens
  const childParentIds = householdParentIdsForChildren(parentIds, mapForParents);

  kids.forEach((m) => {
    people.push({
      tempId: `m_${m.id}`,
      displayName: m.name || 'Barn',
      linkedUid: m.id,
      linkedRole: 'child',
      isExternal: false,
      photoURL: m.photoURL || null,
      avatarId: m.avatarId || null,
      birthday: m.birthday || null,
      gender: m.gender || null,
      parentIds: [...childParentIds],
      partnerIds: [],
      color: m.color || null,
    });
  });

  return people;
}

/** Anvend relasjon: oppdater parentIds/partnerIds for begge sider. */
export function applyRelationPatch(peopleMap, newPersonId, relativeToId, relationType) {
  const patches = new Map(); // id -> { parentIds?, partnerIds? }
  const get = (id) => {
    if (!patches.has(id)) {
      const p = peopleMap.get(id) || { id, parentIds: [], partnerIds: [] };
      patches.set(id, {
        parentIds: normalizeIdList(p.parentIds),
        partnerIds: normalizeIdList(p.partnerIds),
      });
    }
    return patches.get(id);
  };

  if (!relativeToId || !relationType) return patches;

  const rel = get(relativeToId);
  const neu = get(newPersonId);

  if (relationType === 'parent') {
    // Ny person er forelder til relativeTo
    if (!rel.parentIds.includes(newPersonId) && rel.parentIds.length < 2) {
      rel.parentIds = [...rel.parentIds, newPersonId];
    }
  } else if (relationType === 'child') {
    // Ny person er barn av relativeTo
    if (!neu.parentIds.includes(relativeToId) && neu.parentIds.length < 2) {
      neu.parentIds = [...neu.parentIds, relativeToId];
    }
  } else if (relationType === 'partner') {
    if (!rel.partnerIds.includes(newPersonId)) rel.partnerIds = [...rel.partnerIds, newPersonId];
    if (!neu.partnerIds.includes(relativeToId)) neu.partnerIds = [...neu.partnerIds, relativeToId];
  } else if (relationType === 'sibling') {
    // Del foreldre med relativeTo
    const sharedParents = [...rel.parentIds];
    sharedParents.forEach((pid) => {
      if (!neu.parentIds.includes(pid) && neu.parentIds.length < 2) {
        neu.parentIds = [...neu.parentIds, pid];
      }
    });
  }

  return patches;
}

export function ageFromBirthday(birthday, asOf, now = new Date()) {
  if (!birthday) return null;
  const end = parseBirthday(asOf) || startOfDay(now);
  const birth = parseBirthday(birthday);
  if (birth) {
    let age = end.getFullYear() - birth.getFullYear();
    const m = end.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && end.getDate() < birth.getDate())) age -= 1;
    return age >= 0 && age < 150 ? age : null;
  }
  const by = birthYear({ birthday });
  if (by == null) return null;
  const age = end.getFullYear() - by;
  return age >= 0 && age < 150 ? age : null;
}

export function personMetaLine(person) {
  const bits = [];
  const age = ageFromBirthday(person?.birthday, person?.deathDate || undefined);
  if (age != null) bits.push(`${age} år`);
  if (person?.deathDate) {
    const formatted = formatBirthday(person.deathDate, 'nb') || String(person.deathDate);
    bits.push(`† ${formatted}`);
  }
  if (person?.isExternal && !person?.linkedUid) bits.push('Ikke bruker');
  else if (person?.inviteStatus === 'pending') bits.push('Invitert');
  else if (person?.linkedUid) bits.push('I ProTop');
  return bits.join(' · ');
}

export function birthYear(person) {
  const raw = person?.birthday || person?.deathDate;
  if (!raw) return null;
  const m = String(raw).match(/^(\d{4})/);
  if (m) return Number(m[1]);
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.getFullYear();
}

export function lifeSpanLabel(person) {
  const by = birthYear({ birthday: person?.birthday });
  const dy = person?.deathDate ? birthYear({ birthday: person.deathDate }) : null;
  if (by && dy) return `${by}–${dy}`;
  if (by) return `f. ${by}`;
  if (dy) return `† ${dy}`;
  return '';
}

/** Hurtigvalg ala Ancestry/MyHeritage — Mor/Far/Partner/Barn. */
export const QUICK_ADD_ACTIONS = [
  { id: 'mother', label: 'Mor', relationType: 'parent', gender: 'female', icon: 'woman-outline' },
  { id: 'father', label: 'Far', relationType: 'parent', gender: 'male', icon: 'man-outline' },
  { id: 'partner', label: 'Partner', relationType: 'partner', gender: null, icon: 'heart-outline' },
  { id: 'child', label: 'Barn', relationType: 'child', gender: null, icon: 'happy-outline' },
  { id: 'sibling', label: 'Søsken', relationType: 'sibling', gender: null, icon: 'people-outline' },
];

export function searchPeople(people, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return people || [];
  return (people || []).filter((p) => {
    const name = personDisplayName(p).toLowerCase();
    const notes = String(p.notes || '').toLowerCase();
    const email = String(p.email || '').toLowerCase();
    return name.includes(q) || notes.includes(q) || email.includes(q);
  });
}

export function buildTreeStats(people, focusIds = []) {
  const list = (people || []).filter((p) => p && p.deleted !== true);
  const gens = computeGenerations(list, focusIds);
  const values = [...gens.values()];
  const min = values.length ? Math.min(...values) : 0;
  const max = values.length ? Math.max(...values) : 0;
  const generations = values.length ? (max - min + 1) : 0;
  const linked = list.filter((p) => p.linkedUid).length;
  const external = list.filter((p) => !p.linkedUid).length;
  const pending = list.filter((p) => p.inviteStatus === 'pending').length;
  return {
    people: list.length,
    generations,
    linked,
    external,
    pending,
    spanUp: Math.abs(Math.min(0, min)),
    spanDown: Math.max(0, max),
  };
}

function childrenOfId(personId, peopleMap) {
  const out = [];
  peopleMap.forEach((p) => {
    if ((p.parentIds || []).includes(personId)) out.push(p);
  });
  return out.sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b), 'nb'));
}

/**
 * Personsentrisk pedigree (MyHeritage/Ancestry-stil):
 * besteforeldre → foreldre → fokus (+partner) → barn
 */
export function buildPedigreeAround(people, focusId) {
  const map = indexPeople(people);
  const focus = map.get(focusId);
  if (!focus) {
    return {
      focus: null, partners: [], parents: [], grandparents: [], children: [], siblings: [],
    };
  }

  const partners = (focus.partnerIds || []).map((id) => map.get(id)).filter(Boolean);
  const parents = (focus.parentIds || []).map((id) => map.get(id)).filter(Boolean);
  const grandparents = [];
  parents.forEach((parent) => {
    (parent.parentIds || []).forEach((gid) => {
      const gp = map.get(gid);
      if (gp && !grandparents.some((x) => x.id === gp.id)) grandparents.push(gp);
    });
  });

  const children = childrenOfId(focusId, map);
  const siblings = [];
  parents.forEach((parent) => {
    childrenOfId(parent.id, map).forEach((sib) => {
      if (sib.id === focusId) return;
      if (!siblings.some((x) => x.id === sib.id)) siblings.push(sib);
    });
  });

  return { focus, partners, parents, grandparents, children, siblings };
}

/** Midlertidige tre-noder fra app-medlemmer (vises mens Firestore synces). */
export function provisionalPeopleFromMembers(members) {
  const seeds = seedPeopleFromMembers(members);
  const idMap = new Map();
  seeds.forEach((s) => idMap.set(s.tempId, `local_${s.linkedUid || s.tempId}`));
  return seeds.map((s) => ({
    id: idMap.get(s.tempId),
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
    provisional: true,
    notes: '',
  }));
}

export function parentSlotsFilled(person, peopleMap) {
  const parents = (person?.parentIds || []).map((id) => peopleMap.get(id)).filter(Boolean);
  const hasMother = parents.some((p) => p.gender === 'female');
  const hasFather = parents.some((p) => p.gender === 'male');
  return {
    mother: hasMother || (parents.length >= 2 && !hasFather),
    father: hasFather || (parents.length >= 2 && !hasMother),
    count: parents.length,
    canAddParent: parents.length < 2,
  };
}
