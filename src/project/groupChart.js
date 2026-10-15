/**
 * Konsernstruktur fra offentlige registre.
 * Enhetsregisteret (ansatte, underenheter), Regnskapsregisteret (nøkkeltall)
 * og Aksjonærregisteret (eierandeler). Ingen tall finnes opp her.
 */
import { digitsOrgnr } from './companyRegistry.js';

export const OWNERSHIP_LEVELS = [
  { id: 50, label: 'Datterselskap', hint: 'Over 50 %' },
  { id: 20, label: 'Tilknyttede', hint: 'Over 20 %' },
  { id: 1, label: 'Alle eierposter', hint: 'Over 1 %' },
];

export function normalizeGroupChartSettings(raw) {
  const min = Number(raw?.minOwnership);
  const known = OWNERSHIP_LEVELS.some((row) => row.id === min);
  return {
    minOwnership: known ? min : 50,
    // Standard er skjult; konsernvisningen tvinger også false.
    showUnits: raw?.showUnits === true,
  };
}

export function yoyPercent(current, previous) {
  if (current == null || previous == null || current === '' || previous === '') return null;
  const next = Number(current);
  const prev = Number(previous);
  if (!Number.isFinite(next) || !Number.isFinite(prev) || prev === 0) return null;
  return ((next - prev) / Math.abs(prev)) * 100;
}

export function formatCompactAmount(value) {
  if (value == null || value === '') return '–';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '–';
  const sign = amount < 0 ? '−' : '';
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const millions = abs / 1_000_000;
    const digits = millions >= 100 ? 0 : 1;
    const formatted = new Intl.NumberFormat('nb-NO', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(millions);
    return `${sign}${formatted}\u00a0MNOK`;
  }
  const formatted = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(abs);
  return `${sign}${formatted} kr`;
}

export function formatEmployees(value) {
  if (value == null || value === '') return '–';
  const count = Number(value);
  if (!Number.isFinite(count)) return '–';
  return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(count);
}

/** Synlig endring mot året før. Retning styrer farge i visningen. */
export function formatDelta(percent) {
  if (percent == null || percent === '') return null;
  const value = Number(percent);
  if (!Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (!Number.isFinite(rounded)) return null;
  const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat';
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '';
  return { text: `${sign}${Math.abs(rounded)} %`, direction };
}

export function formatOwnership(percent) {
  const value = Number(percent);
  if (!Number.isFinite(value)) return '';
  const clamped = Math.max(0, Math.min(100, value));
  const rounded = clamped >= 99.95 ? 100 : Math.round(clamped * 10) / 10;
  const body = Number.isInteger(rounded)
    ? String(rounded)
    : new Intl.NumberFormat('nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(rounded);
  return `${body} %`;
}

function yearKeys(obj) {
  return Object.keys(obj || {})
    .map((key) => Number(key))
    .filter((year) => year >= 1990 && year <= 2100);
}

function amount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readStatement(row) {
  if (!row || typeof row !== 'object') return null;
  const til = String(row.regnskapsperiode?.tilDato || row.regnskapsperiode?.fraDato || '');
  const year = Number(til.slice(0, 4));
  if (!Number.isFinite(year) || year < 1990 || year > 2100) return null;
  const drift = row.resultatregnskapResultat?.driftsresultat?.driftsinntekter;
  const resultat = row.resultatregnskapResultat;
  const type = String(row.regnskapstype || 'SELSKAP').toUpperCase() === 'KONSERN' ? 'KONSERN' : 'SELSKAP';
  return {
    year,
    type,
    revenue: amount(drift?.sumDriftsinntekter),
    result: amount(resultat?.aarsresultat),
    morselskap: row.virksomhet?.morselskap === true,
  };
}

export function splitStatements(payload) {
  const rows = Array.isArray(payload) ? payload : (payload ? [payload] : []);
  const selskap = new Map();
  const konsern = new Map();
  for (const row of rows) {
    const fig = readStatement(row);
    if (!fig) continue;
    const map = fig.type === 'KONSERN' ? konsern : selskap;
    if (!map.has(fig.year)) map.set(fig.year, fig);
  }
  return { selskap, konsern };
}

export function availableYears(payload) {
  const { selskap, konsern } = splitStatements(payload);
  return [...new Set([...selskap.keys(), ...konsern.keys()])].sort((a, b) => b - a);
}

export function entitySnapshot(payload, year) {
  const { selskap, konsern } = splitStatements(payload);
  const years = [...new Set([...selskap.keys(), ...konsern.keys()])].sort((a, b) => a - b);
  const selected = years.includes(Number(year)) ? Number(year) : years[years.length - 1];
  if (!selected) {
    return {
      year: null,
      revenue: null,
      result: null,
      prevRevenue: null,
      prevResult: null,
      revenueDelta: null,
      resultDelta: null,
      morselskap: false,
      konsern: null,
    };
  }
  const current = selskap.get(selected) || konsern.get(selected);
  const previous = current?.type === 'KONSERN' ? konsern.get(selected - 1) : selskap.get(selected - 1);
  const group = konsern.get(selected) || null;
  const groupPrev = konsern.get(selected - 1) || null;
  return {
    year: selected,
    revenue: current?.revenue ?? null,
    result: current?.result ?? null,
    prevRevenue: previous?.revenue ?? null,
    prevResult: previous?.result ?? null,
    revenueDelta: yoyPercent(current?.revenue, previous?.revenue),
    resultDelta: yoyPercent(current?.result, previous?.result),
    morselskap: current?.morselskap === true || group?.morselskap === true,
    konsern: group ? {
      revenue: group.revenue,
      result: group.result,
      prevRevenue: groupPrev?.revenue ?? null,
      prevResult: groupPrev?.result ?? null,
      revenueDelta: yoyPercent(group.revenue, groupPrev?.revenue),
      resultDelta: yoyPercent(group.result, groupPrev?.result),
    } : null,
  };
}

export function employeeCount(entity) {
  if (!entity || entity.harRegistrertAntallAnsatte === false) return null;
  const count = Number(entity.antallAnsatte);
  return Number.isFinite(count) ? count : null;
}

/**
 * Eierposter der selskapet står som aksjonær.
 * year null bruker siste år med beholdning. Oppgitt år uten beholdning utelates.
 */
export function stakesFromInvestments(rows, { ownerOrgnr, year = null } = {}) {
  const owner = digitsOrgnr(ownerOrgnr);
  const list = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const company = row?.investment || {};
    const orgnr = digitsOrgnr(company.orgnr || row?.orgnr);
    if (orgnr.length !== 9 || (owner && orgnr === owner)) continue;
    const name = String(company.name || '').trim();
    if (!name) continue;
    const holdings = row?.holdings || {};
    const years = yearKeys(holdings);
    if (!years.length) continue;
    if (year != null && !holdings[String(year)]) continue;
    const useYear = year != null ? Number(year) : Math.max(...years);
    const held = Number(holdings[String(useYear)]?.total);
    const total = Number(company.shares?.[String(useYear)]?.total);
    if (!Number.isFinite(held) || held <= 0) continue;
    if (!Number.isFinite(total) || total <= 0) continue;
    const percent = (held / total) * 100;
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100.5) continue;
    list.push({
      organisasjonsnummer: orgnr,
      navn: name,
      percent: Math.min(100, percent),
      year: useYear,
      sharesHeld: held,
      sharesTotal: total,
    });
  }
  list.sort((a, b) => a.navn.localeCompare(b.navn, 'nb') || b.percent - a.percent);
  return list;
}

/** Selskap som eier minst halvparten, når aksjetallet for året er kjent. */
export function majorityCorporateOwner(investors, sharesByYear, { year = null, selfOrgnr } = {}) {
  const self = digitsOrgnr(selfOrgnr);
  const years = yearKeys(sharesByYear);
  if (!years.length) return null;
  if (year != null && !sharesByYear?.[String(year)]) return null;
  const useYear = year != null ? Number(year) : Math.max(...years);
  const total = Number(sharesByYear?.[String(useYear)]?.total);
  if (!Number.isFinite(total) || total <= 0) return null;
  let best = null;
  for (const row of Array.isArray(investors) ? investors : []) {
    const holder = row?.investor?.shareholder || {};
    const orgnr = digitsOrgnr(holder.orgnr || row?.shareholderOrgnr);
    if (orgnr.length !== 9 || orgnr === self) continue;
    const name = String(holder.name || '').trim();
    if (!name) continue;
    const held = Number(row?.holdings?.[String(useYear)]?.total);
    if (!Number.isFinite(held) || held <= 0) continue;
    const percent = Math.min(100, (held / total) * 100);
    if (percent < 50) continue;
    if (!best || percent > best.percent) {
      best = { organisasjonsnummer: orgnr, navn: name, percent, year: useYear };
    }
  }
  return best;
}

export function branchesFrom(payload) {
  const rows = payload?._embedded?.underenheter || (Array.isArray(payload) ? payload : []);
  return rows
    .map((row) => {
      const addr = row?.beliggenhetsadresse || row?.forretningsadresse || {};
      const street = Array.isArray(addr.adresse) ? addr.adresse.filter(Boolean).join(', ') : String(addr.adresse || '').trim();
      const poststed = String(addr.poststed || '').trim();
      return {
        organisasjonsnummer: digitsOrgnr(row?.organisasjonsnummer),
        navn: String(row?.navn || '').trim(),
        poststed,
        adresse: [street, [String(addr.postnummer || '').trim(), poststed].filter(Boolean).join(' ')].filter(Boolean).join(', '),
        nedlagt: String(row?.nedleggelsesdato || '').trim(),
      };
    })
    .filter((row) => row.organisasjonsnummer.length === 9 && row.navn && !row.nedlagt)
    .sort((a, b) => a.navn.localeCompare(b.navn, 'nb'));
}

export function roleForStake(percent) {
  if (percent >= 50) return 'Datterselskap';
  if (percent >= 20) return 'Tilknyttet selskap';
  return 'Eierpost';
}

export function entityCountLabel(children) {
  const total = 1 + (children?.length || 0);
  const enhet = total === 1 ? '1 enhet' : `${total} enheter`;
  const daughters = (children || []).filter((row) => row.percent >= 50).length;
  const associates = (children || []).filter((row) => row.percent >= 20 && row.percent < 50).length;
  const posts = (children || []).length - daughters - associates;
  const bits = [];
  if (daughters) bits.push(daughters === 1 ? '1 datterselskap' : `${daughters} datterselskaper`);
  if (associates) bits.push(associates === 1 ? '1 tilknyttet' : `${associates} tilknyttede`);
  if (posts > 0) bits.push(posts === 1 ? '1 eierpost' : `${posts} eierposter`);
  return bits.length ? `${enhet} (${bits.join(', ')})` : enhet;
}

function presentNode(row, { loading = false } = {}) {
  return {
    ...row,
    revenueLabel: loading ? '…' : formatCompactAmount(row.revenue),
    resultLabel: loading ? '…' : formatCompactAmount(row.result),
    employeesLabel: loading ? '…' : formatEmployees(row.employees),
    revenueDelta: loading ? null : formatDelta(row.revenueDelta),
    resultDelta: loading ? null : formatDelta(row.resultDelta),
    ownershipLabel: formatOwnership(row.percent),
  };
}

export function sumSnapshots(rows) {
  let revenue = 0;
  let prevRevenue = 0;
  let result = 0;
  let prevResult = 0;
  let employees = 0;
  let revenueN = 0;
  let prevRevenueN = 0;
  let resultN = 0;
  let prevResultN = 0;
  let employeesN = 0;
  for (const row of rows || []) {
    if (row?.revenue != null) { revenue += row.revenue; revenueN += 1; }
    if (row?.prevRevenue != null) { prevRevenue += row.prevRevenue; prevRevenueN += 1; }
    if (row?.result != null) { result += row.result; resultN += 1; }
    if (row?.prevResult != null) { prevResult += row.prevResult; prevResultN += 1; }
    if (row?.employees != null) { employees += row.employees; employeesN += 1; }
  }
  return {
    revenue: revenueN ? revenue : null,
    result: resultN ? result : null,
    employees: employeesN ? employees : null,
    revenueDelta: revenueN && prevRevenueN === revenueN ? yoyPercent(revenue, prevRevenue) : null,
    resultDelta: resultN && prevResultN === resultN ? yoyPercent(result, prevResult) : null,
  };
}

function statusBits(entity) {
  const bits = [];
  if (entity?.konkurs === true) bits.push('Konkurs');
  if (entity?.underAvvikling === true) bits.push('Under avvikling');
  return bits;
}

function emptyOwnershipText(known, minOwnership) {
  if (!known) return '';
  if (minOwnership >= 50) return 'Ingen datterselskaper med over 50 % eierandel i Aksjonærregisteret.';
  if (minOwnership >= 20) return 'Ingen eierposter over 20 % i Aksjonærregisteret.';
  return 'Ingen eierposter i Aksjonærregisteret.';
}

/**
 * Ferdig visningsmodell. childBundles kan mangle mens tallene hentes;
 * da vises navn og eierandel med «…» på nøkkeltallene.
 */
export function buildGroupChart({
  fallbackName = '',
  fallbackOrgnr = '',
  entity = null,
  unitPayload = null,
  accountPayload = null,
  investmentRows = null,
  investorRows = null,
  sharesByYear = null,
  childBundles = [],
  year = null,
  settings,
} = {}) {
  const prefs = normalizeGroupChartSettings(settings);
  const orgnr = digitsOrgnr(entity?.organisasjonsnummer || fallbackOrgnr);
  const years = availableYears(accountPayload);
  const selected = years.includes(Number(year)) ? Number(year) : (years[0] ?? null);
  const parentSnap = entitySnapshot(accountPayload, selected);
  const ownershipKnown = Array.isArray(investmentRows);
  const stakes = ownershipKnown
    ? stakesFromInvestments(investmentRows, { ownerOrgnr: orgnr, year: selected })
    : [];
  const visible = stakes.filter((row) => row.percent + 1e-9 >= prefs.minOwnership);
  const bundles = new Map((childBundles || []).map((row) => [
    digitsOrgnr(row?.organisasjonsnummer || row?.entity?.organisasjonsnummer),
    row,
  ]));
  const children = visible.map((stake) => {
    const bundle = bundles.get(stake.organisasjonsnummer);
    const snap = bundle ? entitySnapshot(bundle.accountPayload, selected) : null;
    const ent = bundle?.entity || null;
    const flags = statusBits(ent);
    const loading = !bundle;
    return presentNode({
      organisasjonsnummer: stake.organisasjonsnummer,
      navn: ent?.navn || stake.navn,
      percent: stake.percent,
      role: roleForStake(stake.percent),
      flags,
      employees: ent ? employeeCount(ent) : null,
      revenue: snap?.revenue ?? null,
      result: snap?.result ?? null,
      prevRevenue: snap?.prevRevenue ?? null,
      prevResult: snap?.prevResult ?? null,
      revenueDelta: snap?.revenueDelta ?? null,
      resultDelta: snap?.resultDelta ?? null,
      brregUrl: `https://virksomhet.brreg.no/nb/oppslag/enheter/${stake.organisasjonsnummer}`,
    }, { loading });
  });
  const daughters = children.filter((row) => row.percent >= 50).length;
  const parentFlags = statusBits(entity);
  const parent = presentNode({
    organisasjonsnummer: orgnr,
    navn: String(entity?.navn || fallbackName || '').trim() || 'Selskapet',
    role: daughters > 0 || parentSnap.morselskap ? 'Morselskap' : (entity?.erIKonsern === true ? 'I konsern' : 'Selskap'),
    flags: parentFlags,
    employees: employeeCount(entity),
    revenue: parentSnap.revenue,
    result: parentSnap.result,
    prevRevenue: parentSnap.prevRevenue,
    prevResult: parentSnap.prevResult,
    revenueDelta: parentSnap.revenueDelta,
    resultDelta: parentSnap.resultDelta,
    brregUrl: orgnr ? `https://virksomhet.brreg.no/nb/oppslag/enheter/${orgnr}` : '',
  });
  const units = prefs.showUnits
    ? branchesFrom(unitPayload)
      .filter((row) => row.organisasjonsnummer !== orgnr)
      .map((row) => ({
        ...row,
        brregUrl: `https://virksomhet.brreg.no/nb/oppslag/underenheter/${row.organisasjonsnummer}`,
      }))
    : [];
  const summed = sumSnapshots([
    parentSnap.revenue == null && parentSnap.result == null && parent.employees == null
      ? null
      : { ...parentSnap, employees: parent.employees },
    ...children.filter((row) => !row.revenueLabel || row.revenueLabel !== '…').map((row) => ({
      revenue: row.revenue,
      result: row.result,
      prevRevenue: row.prevRevenue,
      prevResult: row.prevResult,
      employees: row.employees,
    })),
  ].filter(Boolean));
  const useGroup = parentSnap.konsern
    && (parentSnap.konsern.revenue != null || parentSnap.konsern.result != null);
  const totalsRaw = useGroup
    ? {
      ...summed,
      revenue: parentSnap.konsern.revenue,
      result: parentSnap.konsern.result,
      revenueDelta: parentSnap.konsern.revenueDelta,
      resultDelta: parentSnap.konsern.resultDelta,
      source: 'Konsernregnskap',
    }
    : { ...summed, source: children.length ? 'Sum av selskapsregnskapene' : 'Selskapsregnskap' };
  const owner = majorityCorporateOwner(investorRows, sharesByYear, { year: selected, selfOrgnr: orgnr });
  return {
    orgnr,
    year: selected,
    latestYear: years[0] ?? null,
    years: years.map((value) => ({
      year: value,
      label: value === years[0] ? 'Siste regnskapsår' : String(value),
      menu: value === years[0] ? `Siste · ${value}` : String(value),
    })),
    parent,
    children,
    units,
    owner: owner ? { ...owner, ownershipLabel: formatOwnership(owner.percent) } : null,
    totals: {
      ...presentNode(totalsRaw),
      label: 'Totalt i konsernet',
      countLabel: entityCountLabel(children),
      source: totalsRaw.source,
    },
    ownershipKnown,
    emptyOwnership: children.length ? '' : emptyOwnershipText(ownershipKnown, prefs.minOwnership),
    settings: prefs,
  };
}
