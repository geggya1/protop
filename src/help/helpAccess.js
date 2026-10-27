/**
 * Tilgang i hjelpen. Hver ProTop-side og hvert steg sier hvilket område
 * (rettighet i Tilgangsstyring) og hvilket trinn det krever:
 *   see   = Lese
 *   read  = Begrenset redigering (opprette og endre)
 *   write = Admin (innstillinger, import og full styring)
 * Mangler brukeren tilgangen, viser hjelpen hva som kreves, brukerens nivå
 * og hvem i bedriften som har tilgangen — i stedet for å peke på en knapp
 * brukeren ikke har.
 */

import {
  ACCESS_GROUPS,
  ACCESS_LEVELS,
  allows,
  companyTabAllowed,
  effectiveLevelId,
  employeeLevelIds,
  grantsForEmployee,
  levelById,
} from '../access/companyAccess.js';
import { PROTOP_PAGES, resolvePageKey } from './protopPages.js';
import { PROTOP_PROCESSES } from './protopProcesses.js';

const S = 'see';
const R = 'read';
const W = 'write';
/** Steg med eget område, f.eks. godkjenning av andres timer. */
const on = (need, res) => ({ need, res });

/**
 * Område og trinn per side og steg (samme rekkefølge som stegene i
 * protopPages.js). Personlige sider står ikke her — de krever ingen
 * bedriftstilgang. Import av lister krever alltid Admin på området.
 */
export const PAGE_ACCESS = {
  selskap: { res: 'companyPublic', steps: [W, S, on(S, 'companyProfile')] },
  'selskap.innstillinger': { res: 'companyProfile', steps: [W, W, W, W] },
  'selskap.moduler': { res: 'moduleSettings', steps: [W, W] },
  'selskap.tilgang': { res: 'accessControl', steps: [S, W, W, on(S, 'viewAs')] },
  'selskap.underenheter': { res: 'units', steps: [W, W] },
  'selskap.fravaerstyper': { res: 'absenceSettings', steps: [W, W, W] },
  'selskap.kontoplan': { res: 'economySettings', steps: [W, W, W] },

  ansatte: { res: 'employees', steps: [R, R, W, S] },
  'hr.oversikt': { res: 'hr', steps: [S, S, S, S, R, S, S] },
  'hr.personell': { res: 'hrPeople', steps: [S, S] },
  'hr.avtaler': { res: 'hrAgreements', steps: [S, R, R] },
  'hr.lonn': { res: 'hrPayroll', steps: [S, R] },
  'hr.oppfolging': { res: 'hrFollowup', steps: [S, R, R, R, R] },
  'hr.compliance': { res: 'hrCompliance', steps: [S, R, R] },
  'hr.rekruttering': { res: 'hrRecruitment', steps: [R, R, R, R] },
  'hr.handbok': { res: 'hr', steps: [W, W, W, R, R] },
  'hr.skjema': { res: 'hrPeople', steps: [W, W, R] },

  'arbeid.timeliste': { res: 'hours', steps: [on(S, 'hoursOthers'), R, R, R, R, S] },
  'arbeid.timerapport': { res: 'hoursReport', steps: [S, W] },
  'arbeid.timesaldo': { res: 'hoursBalance', steps: [S, S, W] },
  'arbeid.godkjenning': { res: 'hoursApproval', steps: [S, on(R, 'hoursOthers'), on(R, 'hoursOthers')] },
  'arbeid.produktivitet': { res: 'productivity', steps: [S, S, R] },
  'arbeid.fremdrift': { res: 'productivity', steps: [S, S, S] },
  'arbeid.fravaer': { res: 'absence', steps: [S, S, S] },
  'arbeid.fravaersrapport': { res: 'absenceReport', steps: [S] },
  'arbeid.planlagt': { res: 'absencePlanned', steps: [R, R, on(R, 'hoursOthers')] },
  'arbeid.utlegg': { res: 'economyProjectExpenses', steps: [S, W] },
  'arbeid.salg': { res: 'productSales', steps: [S, W] },

  'okonomi.oversikt': { res: 'economyOverview', steps: [S, S] },
  'okonomi.faktura': { res: 'economyInvoices', steps: [S, R, R, R, W, S] },
  'okonomi.fakturagrunnlag': { res: 'economyBilling', steps: [S, R, S] },
  'okonomi.utlegg': { res: 'economyExpenses', steps: [R, R] },
  'okonomi.indeks': { res: 'economyIndex', steps: [S, R, R] },
  'okonomi.indekser': { res: 'economyIndices', steps: [S] },
  'okonomi.innstillinger': { res: 'economySettings', steps: [W, W] },
  'okonomi.inntjening': { res: 'economyEarnings', steps: [S, W] },
  'okonomi.produkter': { res: 'products', steps: [S, R, R, R, S] },
  'okonomi.kjorebok': { res: 'mileage', steps: [R, R, R, S] },

  kunder: { res: 'customers', steps: [R, R, S, W, S] },
  kontrakt: { res: 'contracts', steps: [R, R, R, R, S] },
  // Nye prosjekter opprettes av Admin på Prosjekt; tildelte prosjekt kan åpnes.
  projects: { res: 'projects', steps: [W, W, null, R, W] },

  'anbud.varsling': { res: 'tenders', steps: [on(W, 'tenderSettings'), S, R, R] },
  'anbud.foresporsel': { res: 'tenderRequest', steps: [R, R, R] },
  'anbud.vurdering': { res: 'tenderReview', steps: [S, R, R] },
  'anbud.tilbud': { res: 'offers', steps: [R, R, R, R, R] },
  'anbud.innstillinger': { res: 'tenderSettings', steps: [W, W, W, W] },

  utstyr: { res: 'equipment', steps: [R, R, R] },
  skjema: { res: 'forms', steps: [R, R, R, S, R, R, R] },

  'iso.oversikt': { res: 'iso', steps: [W, S, R, R] },
  'iso.prosesser': { res: 'iso', steps: [R, W, S] },
  'iso.dokumenter': { res: 'iso', steps: [R, W, S] },
  'iso.skjema': { res: 'iso', steps: [W, W, S] },
  'iso.krav': { res: 'iso', steps: [S, R, R] },
  'iso.lovkrav': { res: 'iso', steps: [R, R] },
  'iso.kontekst': { res: 'iso', steps: [R, R, R] },
  'iso.organisasjon': { res: 'iso', steps: [R, R, W] },
  'iso.kommunikasjon': { res: 'iso', steps: [R, R] },
  'iso.mal': { res: 'iso', steps: [R, R] },
  'iso.arshjul': { res: 'iso', steps: [R, R, R] },
  'iso.avvik': { res: 'iso', steps: [S, R, R, W] },
  'iso.risiko': { res: 'iso', steps: [R, S] },
  'iso.miljo': { res: 'iso', steps: [R, R] },
  'iso.hms': { res: 'iso', steps: [S, R, S] },
  'iso.prosjekt': { res: 'iso', steps: [S, R] },
  'iso.kompetanse': { res: 'iso', steps: [R, R] },
  'iso.leverandorer': { res: 'iso', steps: [R, R] },
  'iso.beredskap': { res: 'iso', steps: [R, R] },
  'iso.revisjon': { res: 'iso', steps: [R, R, W] },
  'iso.ledelse': { res: 'iso', steps: [R, W] },
  'iso.sertifisering': { res: 'iso', steps: [R, R] },
  'iso.innstillinger': { res: 'iso', steps: [W, W, W] },
};

/**
 * Arbeidsflyter: trinn per steg utover å kunne åpne siden (null = siden er nok).
 * Området er sidens, med mindre steget sier noe annet.
 */
export const PROCESS_ACCESS = {
  'anbud-til-faktura': [W, R, R, R, R, R, W, R, on(R, 'hoursOthers'), R, R],
  'kunde-prosjekt': [R, R, W, R],
  'ny-ansatt': [R, R, W, R, R],
  ferie: [W, R, null, null],
  avvik: [W, S, null, W],
  oppstart: [W, W, R, W, R, W],
  ledelsessystem: [W, R, R, R, R, null, R],
};

const ACTION_LABEL = {
  see: { nb: 'Lese', en: 'Read' },
  read: { nb: 'Begrenset redigering', en: 'Limited editing' },
  write: { nb: 'Admin', en: 'Admin' },
};

/** Generiske navn får gruppen foran («Anbud → Innstillinger»). */
const GENERIC_AREA = new Set(['Innstillinger', 'Oversikt']);

export function actionLabel(action, lang = 'nb') {
  const row = ACTION_LABEL[action] || ACTION_LABEL.see;
  return lang === 'en' ? row.en : row.nb;
}

export function areaLabel(resource) {
  for (const group of ACCESS_GROUPS) {
    const row = group.resources.find((r) => r.id === resource);
    if (!row) continue;
    if (row.parentLabel) return `${row.parentLabel} → ${row.label}`;
    return GENERIC_AREA.has(row.label) ? `${group.label} → ${row.label}` : row.label;
  }
  return resource === 'economy' ? 'Økonomi' : resource;
}

export function levelLabel(levelId) {
  return levelById(levelId)?.label || '';
}

/** Hva siden krever for å åpnes, og hva steg nr. `index` krever i tillegg. */
export function pageNeed(pageKey) {
  const key = resolvePageKey(pageKey);
  const spec = key ? PAGE_ACCESS[key] : null;
  if (!spec) return null;
  return { resource: spec.res, action: 'see' };
}

export function stepNeed(pageKey, index) {
  const key = resolvePageKey(pageKey);
  const spec = key ? PAGE_ACCESS[key] : null;
  if (!spec) return null;
  const raw = spec.steps[index];
  if (raw == null) return null;
  if (typeof raw === 'string') return { resource: spec.res, action: raw };
  return { resource: raw.res || spec.res, action: raw.need };
}

/**
 * Kan brukeren dette? `grants` er brukerens effektive rettigheter
 * (null = ikke bedrift / ingen begrensning), `bypass` = eier.
 * Gir { ok, need, page } der `page` er true når selve siden er stengt.
 */
export function processStepNeed(processId, index) {
  const steps = PROCESS_ACCESS[processId];
  const raw = steps ? steps[index] : null;
  if (raw == null) return null;
  const pageKey = PROTOP_PROCESSES[processId]?.steps?.[index]?.page;
  const res = PAGE_ACCESS[resolvePageKey(pageKey)]?.res || null;
  if (typeof raw === 'string') return res ? { resource: res, action: raw } : null;
  return { resource: raw.res || res, action: raw.need };
}

export function evaluateHelpAccess({ grants = null, bypass = false, pageKey, stepIndex = null, need: given = null } = {}) {
  if (bypass || !grants) return { ok: true, need: null, page: false };
  const key = resolvePageKey(pageKey);
  const def = key ? PROTOP_PAGES[key] : null;
  if (!def) return { ok: true, need: null, page: false };
  const nav = def.nav || {};
  if (PAGE_ACCESS[key] && !companyTabAllowed(nav.tab, nav.subView || null, grants)) {
    return { ok: false, need: pageNeed(key), page: true };
  }
  if (stepIndex == null && !given) return { ok: true, need: null, page: false };
  const need = given || stepNeed(key, stepIndex);
  if (!need || allows(grants, need.resource, need.action)) return { ok: true, need: null, page: false };
  return { ok: false, need, page: false };
}

function personName(employee) {
  const p = employee?.person || {};
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ').trim();
  return name || String(employee?.name || p.email || employee?.company?.email || '').trim();
}

const LEVEL_ORDER = Object.fromEntries(ACCESS_LEVELS.map((l) => [l.id, l.order]));

/**
 * Hvem i bedriften har tilgangen? Aktive ansatte med innlogging, nærmeste
 * nivå over først (avdelingsleder før administrator). Uten treff: tom liste.
 */
export function accessContacts({
  employees = [], policy = null, need, selfEmployeeId = '', limit = 2, ownerUids = [], lang = 'nb',
} = {}) {
  if (!need) return [];
  const owners = new Set((ownerUids || []).filter(Boolean));
  const rows = [];
  for (const employee of employees || []) {
    if (!employee || employee.id === selfEmployeeId) continue;
    const status = String(employee.company?.status || 'active');
    if (status !== 'active') continue;
    if (!employee.personUid && employee.company?.canLogin === false) continue;
    // Eieren av bedriften har alltid full tilgang, også uten nivå i Tilgangsstyring.
    const owner = !!employee.personUid && owners.has(employee.personUid);
    if (!owner && !allows(grantsForEmployee(policy, employee), need.resource, need.action)) continue;
    const ids = employeeLevelIds(employee);
    const levelId = ids.length ? ids[ids.length - 1] : effectiveLevelId(employee);
    const name = personName(employee);
    if (!name) continue;
    rows.push(owner
      ? { id: employee.id, name, levelId: 'owner', level: lang === 'en' ? 'Owner' : 'Eier', order: 99 }
      : { id: employee.id, name, levelId, level: levelLabel(levelId), order: LEVEL_ORDER[levelId] || 0 });
  }
  rows.sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, 'nb'));
  return rows.slice(0, limit);
}

function contactList(contacts, lang) {
  const parts = (contacts || []).map((c) => (c.level ? `${c.name} (${c.level})` : c.name));
  if (!parts.length) return lang === 'en' ? 'an administrator in the company' : 'en administrator i bedriften';
  if (parts.length === 1) return parts[0];
  const or = lang === 'en' ? ' or ' : ' eller ';
  return `${parts.slice(0, -1).join(', ')}${or}${parts[parts.length - 1]}`;
}

/**
 * Teksten brukeren ser når noe er låst: hva som kreves, eget nivå og hvem
 * som kan hjelpe. `pageLabel` brukes når hele siden er stengt.
 */
export function lockedText(opts = {}) {
  const { head, who } = lockedParts(opts);
  return head ? `${head} ${who}` : '';
}

const ACTION_RANK = { see: 1, read: 2, write: 3 };

/**
 * Låsene for stegene i en liste (`gates` = svar fra check per steg).
 * Ett låst steg: hele teksten. Flere: «hva som kreves» per steg og «hvem som
 * kan hjelpe» én gang (`who`), så det samme ikke gjentas under hvert steg.
 * Kontaktene for det strengeste kravet (Admin før Lese) kan hjelpe med alle.
 */
export function condenseStepLocks(gates = []) {
  const locked = gates.filter((g) => g && !g.ok);
  if (locked.length < 2 || locked.some((g) => !g.head || !g.who)) {
    return { locks: gates.map((g) => (g && !g.ok ? g.text || '' : '')), who: '' };
  }
  const strictest = locked.reduce((best, g) => (
    (ACTION_RANK[g.need?.action] || 0) > (ACTION_RANK[best.need?.action] || 0) ? g : best
  ), locked[0]);
  return {
    locks: gates.map((g) => (g && !g.ok ? g.head : '')),
    who: strictest.who,
  };
}

/**
 * Låseteksten i to deler: `head` (hva som kreves) og `who` (eget nivå og hvem
 * som kan hjelpe). Assistenten viser `head` per steg og `who` én gang.
 */
export function lockedParts({ need, page = false, pageLabel = '', level = '', contacts = [], lang = 'nb' } = {}) {
  if (!need) return { head: '', who: '' };
  const action = actionLabel(need.action, lang);
  const area = areaLabel(need.resource);
  const names = contactList(contacts, lang);
  if (lang === 'en') {
    const head = page
      ? `You don’t have access to ${pageLabel || area}. It requires “${action}” on “${area}”.`
      : `This requires “${action}” on “${area}”.`;
    const mine = level ? `Your level: ${level}. ` : '';
    return { head, who: `${mine}Ask ${names} — they can do it or give you access.` };
  }
  const head = page
    ? `Du har ikke tilgang til ${pageLabel || area}. Det krever «${action}» på «${area}».`
    : `Dette krever «${action}» på «${area}».`;
  const mine = level ? `Ditt nivå: ${level}. ` : '';
  return { head, who: `${mine}Spør ${names} — de kan gjøre det eller gi deg tilgang.` };
}
