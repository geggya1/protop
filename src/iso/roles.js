/**
 * ISO-roller fra tekst: «Daglig leder», «HMSK-leder», «Kvalitetsansvarlig / Prosjektleder» …
 *
 * Tidligere systemer setter ofte en rolle, en funksjon eller ingenting som eier. I ProTop eier en
 * person (med innlogging) hver post, så oppgaver og varsler når fram. Importen og «Koble rolle-eiere»
 * i Innstillinger bruker dette til å flytte eierskapet til personen som har rollen (Innstillinger → Roller).
 * Funksjoner ProTop ikke har som rolle (Tilbudsansvarlig, Innkjøpsansvarlig …), og poster uten eier,
 * får kvalitetslederen (eller systemansvarlig) som eier og merkes «må gjennomgås».
 */
import { auditEvent, bump, pushHistory, text } from './core.js';
import { ISO_ROLES, roleLabel } from './catalog.js';

const fold = (v) => text(v).toLowerCase()
  .replace(/[‐-―-]/g, ' ')
  .replace(/[^a-z0-9æøå ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Rolletekster fra tidligere systemer → ProTops ISO-rolle. Rollenes egne navn kommer i tillegg. */
const ALIASES = {
  system_owner: ['systemansvarlig', 'systemeier', 'k hms ansvarlig', 'khms ansvarlig', 'ledelsessystemansvarlig', 'iso ansvarlig'],
  quality_manager: [
    'kvalitetsansvarlig', 'kvalitetssjef', 'kvalitetskoordinator', 'kvalitetsrådgiver', 'kvalitet', 'kvalitetsavdelingen',
    'hmsk leder', 'hmsk ansvarlig', 'k hms leder', 'khms leder', 'kshms leder', 'qhse leder', 'qhse manager', 'quality manager',
    'qa', 'qa ansvarlig', 'dokumentansvarlig',
  ],
  hse_manager: [
    'hms ansvarlig', 'hms koordinator', 'hms rådgiver', 'hms sjef', 'hms', 'hse leder', 'hse manager',
    'miljøansvarlig', 'miljøleder', 'miljøkoordinator', 'beredskapsleder', 'beredskapsansvarlig', 'sikkerhetsleder',
  ],
  top_management: [
    'daglig leder', 'ledelsen', 'ledelse', 'øverste leder', 'toppledelsen', 'toppleder', 'ledergruppen', 'ledergruppa',
    'administrerende direktør', 'adm dir', 'ceo', 'daglig ledelse',
  ],
  manager: ['avdelingsleder', 'linjeleder', 'nærmeste leder', 'fagleder', 'teamleder', 'seksjonsleder', 'gruppeleder'],
  process_owner: ['prosessansvarlig', 'prosessleder'],
  project_manager: [
    'prosjektansvarlig', 'assisterende prosjektleder', 'oppdragsleder', 'oppdragsansvarlig', 'byggeleder', 'prosjekteringsleder',
  ],
  internal_auditor: ['intern revisor', 'revisjonsleder'],
  hr_manager: ['hr', 'hr leder', 'hr sjef', 'personalansvarlig', 'personalleder', 'opplæringsansvarlig', 'kompetanseansvarlig'],
  safety_rep: ['verneombud', 'hovedverneombud', 'ansattrepresentant', 'ansattes representant', 'tillitsvalgt'],
  employee: ['ansatte', 'alle ansatte', 'alle', 'medarbeider', 'medarbeidere', 'alle medarbeidere'],
};

const ROLE_BY_TEXT = new Map();
for (const r of ISO_ROLES) ROLE_BY_TEXT.set(fold(r.label), r.id);
for (const [role, list] of Object.entries(ALIASES)) for (const a of list) ROLE_BY_TEXT.set(fold(a), role);

/** Ingen eier i kilden («Ikke tildelt», «Tildelt ressurs» …). */
export function isBlankOwner(value) {
  return /^(ikke tildelt|ikke satt|ikke angitt|ukjent|mangler|ingen|tbd|n\/?a|tildelt ressurs|-+)$/i.test(text(value));
}

/** ISO-rollen én rolletekst svarer til, eller ''. */
export function isoRoleIdFor(value) {
  return ROLE_BY_TEXT.get(fold(value)) || '';
}

/** Delene i «Kvalitetsansvarlig / Prosjektleder», «HR, Ledelse». Første del er hovedansvarlig. */
export function ownerParts(value) {
  return text(value, 300).split(/\s*(?:\/|,|;|&|\bog\b)\s*/i).map((x) => x.trim()).filter(Boolean);
}

/** Rolle- eller funksjonsnavn (ikke et personnavn): finnes som rolle, eller ser ut som en tittel. */
export function isRoleName(name, roleTitles = new Set()) {
  const n = text(name).toLowerCase();
  if (!n) return false;
  if (roleTitles.has(n) || n.split('/').map((x) => x.trim()).some((x) => roleTitles.has(x))) return true;
  if (ownerParts(n).some((x) => isoRoleIdFor(x))) return true;
  return /\/|ansvarlig|leder|ledelse|rådgiver|ressurs|konsulent|koordinator|innkjøper|ombud|revisor|styret|sjef|direktør|medarbeider|ansatte|avdeling|behandler|ingeniør|byggeleder|administrasjon|^hr\b|^it\b|^hms|^k-?hms|^økonomi/.test(n);
}

/** Eieren når kilden ikke har en: kvalitetsleder, ellers systemansvarlig. */
export function defaultOwner(system) {
  const roles = system?.roleMap || {};
  for (const role of ['quality_manager', 'system_owner']) {
    if (roles[role]?.name) return { role, name: text(roles[role].name, 160), uid: text(roles[role].uid, 128) };
  }
  if (text(system?.ownerName)) return { role: 'system_owner', name: text(system.ownerName, 160), uid: text(system.ownerUid, 128) };
  return null;
}

/**
 * Hvem som eier en post med denne eierteksten (som ikke er en ansatt):
 *   person   – flere navn («Kari / Ola»): den første som er en ansatt (bare med people)
 *   rolle       – personen med rollen («Daglig leder» → den som er øverste ledelse)
 *   ledig_rolle – rollen finnes i ProTop, men ingen har den ennå: rollenavnet blir eier (uten bruker)
 *   standard – ingen eier eller en funksjon ProTop ikke har → kvalitetsleder/systemansvarlig, må gjennomgås
 *   null     – ser ut som et personnavn; står som tekst til noen velger personen
 * fallback: false når feltet ikke skal få standard eier (f.eks. deltakere).
 */
export function roleOwner(value, system, { fallback = true, people = null } = {}) {
  const raw = text(value, 300);
  const roles = system?.roleMap || {};
  const parts = ownerParts(raw);
  // «Kari Nordmann / Ola Hansen»: første del som er en ansatt, eier posten.
  if (people && parts.length > 1) {
    for (const part of parts) {
      const hit = matchPerson(people, part);
      if (hit) return { kind: 'person', name: text(hit.name, 160), uid: text(hit.uid, 128), from: raw };
    }
  }
  const ids = parts.map(isoRoleIdFor).filter(Boolean);
  for (const role of ids) {
    if (roles[role]?.name) return { kind: 'rolle', role, name: text(roles[role].name, 160), uid: text(roles[role].uid, 128), from: raw };
  }
  // En ProTop-rolle som ingen har ennå: rollenavnet blir stående, så «Koble rolle-eiere til personer»
  // kan gi posten til personen når rollen er satt. Ingen standard eier.
  const vacant = ids.find((r) => r !== 'employee');
  if (vacant) return { kind: 'ledig_rolle', role: vacant, name: roleLabel(vacant), uid: '', from: raw };
  if (!fallback) return null;
  const blank = !raw || parts.every((p) => isBlankOwner(p) || isoRoleIdFor(p) === 'employee');
  if (!blank && !isRoleName(raw)) return null;
  const def = defaultOwner(system);
  if (!def) return null;
  const why = blank
    ? (raw ? `Eier mangler i kilden («${raw}»).` : 'Eier mangler i kilden.')
    : `«${raw}» er ikke en rolle i ProTop.`;
  return {
    kind: 'standard',
    role: def.role,
    name: def.name,
    uid: def.uid,
    from: raw,
    note: `${why} ${roleLabel(def.role)} er satt som eier. Velg riktig person.`,
  };
}

export const normName = (s) => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-zæøå0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Finn den ansatte et navn gjelder: likt navn, ellers samme fornavn og etternavn
 * (mellomnavn kan mangle). Bare entydige treff brukes.
 */
export function matchPerson(people, name) {
  const n = normName(name);
  if (!n) return null;
  const list = people || [];
  const exact = list.filter((p) => normName(p.name) === n);
  if (exact.length === 1) return exact[0];
  const parts = n.split(' ');
  if (parts.length < 2) return null;
  const first = parts[0];
  const last = parts[parts.length - 1];
  const loose = list.filter((p) => {
    const q = normName(p.name).split(' ');
    return q.length >= 2 && q[0] === first && q[q.length - 1] === last;
  });
  return loose.length === 1 ? loose[0] : null;
}

/**
 * Eiere som er en rolle, en funksjon eller «Ikke tildelt» i stedet for en person, i registre,
 * dokumenter og prosesser som allerede ligger i ProTop (f.eks. importert før rollene var satt).
 * Gir de oppdaterte objektene: personen som har rollen, ellers kvalitetsleder og «må gjennomgås»
 * på registerposter. Personnavn som ikke finnes blant de ansatte, røres ikke.
 * Svar: [{ kind: 'records' | 'documents' | 'processes', title, from, to, role, how, entity, event }]
 */
export function roleOwnerFixes(state, { people = [], actor = null, now = new Date(), build = true } = {}) {
  const system = state?.system;
  const out = [];
  const resolve = (value, fallback = true) => {
    const name = text(value, 300);
    if (!name || matchPerson(people, name)) return null;
    const hit = roleOwner(name, system, { fallback, people });
    // Ingen har rollen ennå: ingenting å koble til.
    return hit && hit.kind !== 'ledig_rolle' ? hit : null;
  };
  const push = (kind, entity, title, hit, patch, entityType) => {
    const note = `«${hit.from}» → ${hit.name}`;
    // build: false gir bare oversikten (uten nye objekter og revisjonsspor), f.eks. for visning.
    if (!build) { out.push({ kind, title, from: hit.from, to: hit.name, role: hit.role, how: hit.kind }); return; }
    const next = bump({ ...entity, ...patch, history: pushHistory(entity, 'Eier koblet til person', actor, note, now) }, actor, now);
    out.push({
      kind, title, from: hit.from, to: hit.name, role: hit.role, how: hit.kind, entity: next,
      event: auditEvent({ entityType, entityId: entity.id, action: `iso.${entityType}.owner_linked`, actor, before: entity, after: next, reason: note, now }),
    });
  };
  for (const rows of Object.values(state?.records || {})) {
    for (const r of rows || []) {
      if (!r?.id || r.locked || r.archived || r.state === 'arkivert') continue;
      const hit = resolve(r.ownerName);
      if (!hit) continue;
      const patch = { ownerName: hit.name, ownerUid: hit.uid };
      if (hit.note) Object.assign(patch, { needsReview: true, reviewNote: text([r.reviewNote, hit.note].filter(Boolean).join(' '), 1000) });
      push('records', r, r.title || r.number || r.id, hit, patch, r.register || 'record');
    }
  }
  for (const d of state?.documents || []) {
    if (!d?.id || d.archived || d.state === 'arkivert') continue;
    const owner = resolve(d.ownerName);
    const approver = resolve(d.approverName, false);
    if (!owner && !approver) continue;
    const patch = {
      ...(owner ? { ownerName: owner.name, ownerUid: owner.uid } : {}),
      ...(approver ? { approverName: approver.name } : {}),
    };
    push('documents', d, `${d.code || ''} ${d.title || ''}`.trim(), owner || approver, patch, 'document');
  }
  for (const p of state?.processes || []) {
    if (!p?.id || p.archived) continue;
    const hit = resolve(p.ownerName);
    if (!hit) continue;
    push('processes', p, `${p.code || ''} ${p.title || ''}`.trim(), hit, { ownerName: hit.name, ownerUid: hit.uid }, 'process');
  }
  return out;
}
