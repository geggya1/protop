/**
 * Organisasjon, kommunikasjon og årshjul (ISO 5.3, 7.4 og planlagte aktiviteter).
 * Rene funksjoner: organisasjonskart av rollene, myndighetsmatrise, kommunikasjonsplan
 * gruppert, og årshjul som samler planlagte aktiviteter og datoer fra registrene.
 */
import { roleLabel } from './catalog.js';
import { ANNUAL_PAGES, MONTH_NAMES, ROLE_LEVELS } from './registers.js';
import { publishedRevisionOf } from './documents.js';

const norm = (s) => String(s || '').trim().toLowerCase();
const live = (rows) => (rows || []).filter((r) => r && r.state !== 'arkivert');
/** Årshjulaktivitet som gjelder året (tomt «Bare i år» = hvert år, f.eks. innføringsaktiviteter for 2027). */
const inYear = (r, year) => !Number(r.year) || Number(r.year) === Number(year);

export function sortRoles(roles) {
  const level = (r) => {
    const i = ROLE_LEVELS.indexOf(r.category);
    return i < 0 ? ROLE_LEVELS.length : i;
  };
  return [...(roles || [])].sort((a, b) => level(a) - level(b)
    || String(a.number || '').localeCompare(String(b.number || ''), 'nb', { numeric: true })
    || String(a.title).localeCompare(String(b.title), 'nb'));
}

/**
 * Organisasjonskart fra «Rapporterer til». Treffer på tittel (eksakt, ellers starten av tittelen).
 * Roller uten treff blir røtter; sykluser brytes. Gir [{ role, reportsToText, children: [...] }].
 */
export function orgTree(roles) {
  const list = sortRoles(live(roles));
  const byTitle = new Map(list.map((r) => [norm(r.title), r]));
  const parentOf = (r) => {
    const t = norm(r.reportsTo);
    if (!t) return null;
    let p = byTitle.get(t);
    if (!p && t.length >= 4) p = list.find((x) => x.id !== r.id && (t.startsWith(norm(x.title)) || norm(x.title).startsWith(t)));
    return p && p.id !== r.id ? p.id : null;
  };
  const parent = new Map(list.map((r) => [r.id, parentOf(r)]));
  for (const r of list) {
    const seen = new Set([r.id]);
    let p = parent.get(r.id);
    while (p) {
      if (seen.has(p)) { parent.set(r.id, null); break; }
      seen.add(p);
      p = parent.get(p);
    }
  }
  const build = (r) => ({
    role: r,
    reportsToText: parent.get(r.id) ? '' : String(r.reportsTo || '').trim(),
    children: list.filter((x) => parent.get(x.id) === r.id).map(build),
  });
  return list.filter((r) => !parent.get(r.id)).map(build);
}

/** Myndighetsmatrise: kolonner = roller som har myndighet, rader gruppert per kategori. */
export function authorityMatrix(roles, rows) {
  const active = live(rows);
  const used = new Set(active.flatMap((r) => r.roles || []));
  const columns = sortRoles((roles || []).filter((r) => used.has(r.id)));
  const groups = [];
  const sorted = [...active].sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), 'nb', { numeric: true }));
  for (const record of sorted) {
    const category = String(record.category || 'Annet').trim() || 'Annet';
    let g = groups.find((x) => x.category === category);
    if (!g) groups.push(g = { category, rows: [] });
    g.rows.push({ record, cells: columns.map((c) => (record.roles || []).includes(c.id)) });
  }
  return { columns, groups };
}

/** Roller og myndighet for én rolle: hva den kan beslutte, hvem som rapporterer til den, kompetansekrav. */
export function roleLinks(state, role) {
  const t = norm(role?.title);
  const records = state?.records || {};
  return {
    authority: live(records.myndighet).filter((m) => (m.roles || []).includes(role?.id)),
    reports: live(records.rolle).filter((r) => r.id !== role?.id && t && norm(r.reportsTo) === t),
    competence: live(records.kompetansekrav).filter((k) => t && (norm(k.role) === t || norm(k.role) === 'alle')),
    processes: (state?.processes || []).filter((p) => !p.archived && (p.versions || []).some((v) => (v.diagram?.lanes || []).some((l) => norm(l.label) === t))),
  };
}

export const COMMUNICATION_GROUPS = ['Intern', 'Ekstern', 'Intern og ekstern'];

/** Kommunikasjonsplanen gruppert på intern/ekstern, i planens rekkefølge. */
export function communicationGroups(rows) {
  const active = live(rows).sort((a, b) => String(a.number || '').localeCompare(String(b.number || ''), 'nb', { numeric: true }));
  const out = COMMUNICATION_GROUPS.map((direction) => ({ direction, rows: active.filter((r) => r.direction === direction) }));
  const other = active.filter((r) => !COMMUNICATION_GROUPS.includes(r.direction));
  if (other.length) out.push({ direction: 'Uten retning', rows: other });
  return out.filter((g) => g.rows.length);
}

/* ───────────────────────── Årshjul ───────────────────────── */

export function pageLabel(id) {
  return ANNUAL_PAGES.find((p) => p.id === id)?.label || '';
}

function monthOf(date) {
  const m = /^(\d{4})-(\d{2})/.exec(String(date || ''));
  return m ? { year: Number(m[1]), month: Number(m[2]) - 1 } : null;
}

/** Datoer fra registrene som hører hjemme i årshjulet. Mange like poster samles til én linje med antall. */
function datedItems(state, year) {
  const records = state?.records || {};
  const items = [];
  const single = (rows, field, page, prefix, keep = () => true) => {
    for (const r of live(rows)) {
      const m = monthOf(r[field]);
      if (!m || m.year !== year || !keep(r)) continue;
      items.push({ key: `${page}:${r.id}`, month: m.month, date: r[field], title: `${prefix}: ${r.title}`, page, open: r.id });
    }
  };
  const grouped = (rows, field, page, title, keep = () => true) => {
    const byMonth = new Map();
    for (const r of rows || []) {
      if (!keep(r)) continue;
      const m = monthOf(r[field]);
      if (!m || m.year !== year) continue;
      byMonth.set(m.month, (byMonth.get(m.month) || 0) + 1);
    }
    for (const [month, count] of byMonth) items.push({ key: `${page}:${title}:${month}`, month, title, count, page });
  };
  const open = (r) => !['arkivert', 'lukket', 'avlyst', 'godkjent', 'gjennomfort', 'nådd', 'ikke_nådd'].includes(r.state);
  single(records.revisjon, 'plannedDate', 'revisjon', 'Internrevisjon', (r) => ['planlagt', 'pagar'].includes(r.state));
  single(records.ledelse, 'meetingDate', 'ledelse', 'Ledelsens gjennomgang', (r) => r.state === 'planlagt');
  single(records.beredskap, 'nextExercise', 'beredskap', 'Beredskapsøvelse');
  single(records.mal, 'deadline', 'mal', 'Frist for mål', open);
  grouped(records.risiko, 'nextReview', 'risiko', 'Revurdering av risiko', open);
  grouped(records.fare, 'nextReview', 'hms', 'Revurdering av farer', open);
  grouped(records.miljoaspekt, 'nextReview', 'miljo', 'Revurdering av miljøaspekter', open);
  grouped(records.samsvar, 'nextReview', 'lovkrav', 'Evaluering av samsvar', open);
  grouped(records.leverandor, 'nextReview', 'leverandorer', 'Leverandørevaluering', open);
  grouped(records.interessent, 'nextReview', 'kontekst', 'Gjennomgang av interessenter', open);
  grouped(records.rolle, 'nextReview', 'organisasjon', 'Gjennomgang av rollebeskrivelser', open);
  grouped(records.kompetanse, 'validTo', 'kompetanse', 'Kompetanse som utløper', open);
  grouped((state?.documents || []).filter((d) => !d.archived && publishedRevisionOf(d)), 'nextReview', 'dokumenter', 'Dokumentgjennomgang');
  return items;
}

/**
 * Årshjulet for et år: 12 måneder med planlagte aktiviteter (registeret Årshjul)
 * og datoer fra registrene (revisjoner, gjennomganger, øvelser, revurderinger …).
 */
export function annualWheel(state, { year = new Date().getFullYear() } = {}) {
  const planned = live(state?.records?.aarshjul);
  const dated = datedItems(state, year);
  return MONTH_NAMES.map((name, month) => ({
    month,
    name,
    planned: planned.filter((r) => (r.months || []).includes(name) && inYear(r, year)).sort((a, b) => String(a.title).localeCompare(String(b.title), 'nb')),
    dated: dated.filter((d) => d.month === month).sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || a.title.localeCompare(b.title, 'nb')),
  }));
}

const ROLE_ALIASES = {
  'daglig leder': 'top_management',
  ledelsen: 'top_management',
  'øverste ledelse': 'top_management',
  'hmsk-leder': 'quality_manager',
  'hms-leder': 'hse_manager',
  kvalitetsansvarlig: 'quality_manager',
  verneombud: 'safety_rep',
};

/** ISO-rollen som svarer til en rolletekst («Kvalitetsleder», «Daglig leder» …). */
export function isoRoleFor(roleMap, text) {
  const t = norm(text);
  if (!t) return null;
  const key = ROLE_ALIASES[t] || Object.keys(roleMap || {}).find((k) => norm(roleLabel(k)) === t);
  return key && roleMap?.[key]?.uid ? roleMap[key] : null;
}

/**
 * Oppgaver for årshjulets aktiviteter i inneværende måned. Bare aktiviteter med «Lag oppgave»,
 * med mindre all = true (knappen på siden). Nøkkelen er per aktivitet og måned, så den lages én gang.
 */
export function annualTaskEffects(state, { now = new Date(), all = false } = {}) {
  const month = now.getMonth();
  const year = now.getFullYear();
  const name = MONTH_NAMES[month];
  const deadline = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
  const roles = state?.system?.roleMap || {};
  const fallback = roles.quality_manager || roles.system_owner || {};
  return live(state?.records?.aarshjul)
    .filter((r) => (r.months || []).includes(name) && inYear(r, year) && (all || r.createTasks))
    .map((r) => {
      const page = pageLabel(r.page);
      return {
        type: 'createTask',
        key: `isoauto_ahj_${r.id}_${year}_${String(month + 1).padStart(2, '0')}`.replace(/[^A-Za-z0-9_-]/g, '_'),
        title: `Årshjul ${name.toLowerCase()}: ${r.title}`,
        deadline,
        assigneeUid: r.ownerUid || isoRoleFor(roles, r.responsibleRole)?.uid || fallback.uid || '',
        roleLabel: r.responsibleRole || '',
        description: [r.description, page ? `Utføres i ISO → ${page}.` : ''].filter(Boolean).join('\n'),
      };
    });
}
