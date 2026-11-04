/**
 * Bedriftens valg for arbeidstid (Selskapsinnstillinger → Arbeidstid og overtid) og hvem
 * som varsles når timene går over grensene i arbeidsmiljøloven kapittel 10.
 *
 * Lagres på bedriften som company.workingTime = { tariffBound: boolean }. Standard er av:
 * da gjelder lovens grunngrenser (§ 10-6 (4) og (8)). På: bedriften er bundet av tariffavtale
 * og har skriftlig avtale med tillitsvalgte, så de utvidede grensene i § 10-6 (5) og (9) gjelder.
 *
 * Varsel er en beskjed til øverste leder og administrator. Timene lagres og godkjennes som før.
 *
 * Ren modul: brukes av innstillingssiden, timelisten, timesaldoen og testene.
 */
import { employeeLevelIds } from '../access/companyAccess.js';
import { formatDateNb } from './workingTimeRules.js';

/** Nivåene i tilgangsstyringen som får varsel om overskridelser. */
export const WORKING_TIME_ALERT_LEVELS = ['leder', 'administrator'];

/** Reglene som gir varsel til ledelsen. Info om vanlig overtid sendes ikke. */
export const ALERT_RULES = ['overtime7d', 'overtime4w', 'overtime52w', 'dayTotal', 'weekTotal', 'dailyRest', 'weeklyRest'];

function text(value) {
  return String(value ?? '').trim();
}

/** Bedriftens innstilling. Mangler den, er tariffavtale av. */
export function companyWorkingTime(company) {
  const raw = company?.workingTime;
  return { tariffBound: raw?.tariffBound === true };
}

/** Ny company med innstillingen satt. Resten av company beholdes. */
export function withWorkingTime(company, patch = {}) {
  return {
    ...(company || {}),
    workingTime: { ...companyWorkingTime(company), ...(patch.tariffBound != null ? { tariffBound: patch.tariffBound === true } : {}) },
  };
}

/** Valgene til checkWorkingTime for bedriften. */
export function workingTimeOptions(company) {
  return { tariff: companyWorkingTime(company).tariffBound };
}

/** Kort forklaring av hva som følges opp, for innstillingen og varselkortet. */
export function workingTimeFocusText(company) {
  return companyWorkingTime(company).tariffBound
    ? 'Tariffavtale: overtid høyst 20 t på sju dager, 50 t på fire uker og 300 t på 52 uker, og høyst 16 t arbeid på 24 timer (§ 10-6 (5) og (9)). Krever skriftlig avtale med tillitsvalgte. Overtid over 10, 25 eller 200 t krever at den ansatte har sagt seg villig.'
    : 'Lovens grunngrenser: overtid høyst 10 t på sju dager, 25 t på fire uker og 200 t på 52 uker, og høyst 13 t arbeid på 24 timer og 48 t på sju dager (§ 10-6 (4) og (8)).';
}

/**
 * Hvem som får varsel: eier, gruppeadministratorer og aktive ansatte med nivået
 * Øverste leder eller Administrator. exclude: uid som ikke skal ha varsel.
 */
export function workingTimeAlertRecipients({ family, employees = [], exclude = [] } = {}) {
  const skip = new Set((exclude || []).filter(Boolean));
  const out = new Set();
  for (const id of [family?.ownerUid, family?.ownerId, ...(Array.isArray(family?.adminUids) ? family.adminUids : [])]) {
    if (typeof id === 'string' && id) out.add(id);
  }
  for (const row of Array.isArray(employees) ? employees : []) {
    const uid = text(row?.personUid);
    if (!uid) continue;
    if (row?.deletedAt || row?.status === 'inactive' || row?.active === false) continue;
    const levels = employeeLevelIds(row);
    if (levels.some((id) => WORKING_TIME_ALERT_LEVELS.includes(id))) out.add(uid);
  }
  return [...out].filter((uid) => !skip.has(uid));
}

/** Overtidsreglene der Arbeidstilsynet kan gi utvidet ramme (§ 10-6 (6)). */
const OVERTIME_RULES = ['overtime7d', 'overtime4w', 'overtime52w'];

export const ARBEIDSTILSYNET_URL = 'https://www.arbeidstilsynet.no/arbeidstid-og-organisering/arbeidstid/overtid/sok-utvidet-overtid/';

/** Andel av overtidsrammen der forslaget kommer før grensen er nådd (søknaden må sendes i forkant). */
export const SUGGEST_SHARE = 0.8;

/**
 * Automatisk forslag om å søke Arbeidstilsynet om utvidet overtidsramme (§ 10-6 (6)).
 * Kommer når overtiden er over en grense, eller når overtiden på fire eller 52 uker har nådd
 * 80 % av rammen. Arbeidstilsynet godkjenner ikke i etterkant, og søknaden må sendes senest
 * fire uker før arbeidet. null når det ikke er grunn til å foreslå det.
 * { reason: 'over' | 'near', ref, url, text }
 */
export function arbeidstilsynetSuggestion(result) {
  if (!result) return null;
  const over = (result.warnings || []).some((row) => row.level === 'warn' && OVERTIME_RULES.includes(row.rule));
  const totals = result.totals || {};
  const limits = result.limits || {};
  const near = ['overtime4w', 'overtime52w'].some((key) => (
    Number(limits[key]) > 0 && Number(totals[key]) >= Number(limits[key]) * SUGGEST_SHARE
  ));
  if (!over && !near) return null;
  const lead = over
    ? 'Overtiden er over grensen.'
    : 'Overtiden nærmer seg grensen.';
  return {
    reason: over ? 'over' : 'near',
    ref: 'AML § 10-6 (6)',
    url: ARBEIDSTILSYNET_URL,
    text: `${lead} Er behovet varig, kan bedriften i særlige tilfeller søke Arbeidstilsynet om utvidet ramme: inntil 25 t overtid på sju dager og 200 t på 26 uker. Søknaden sendes i Altinn senest fire uker før arbeidet, med referat fra drøfting med tillitsvalgte. Den godkjennes ikke i etterkant.`,
  };
}

/**
 * Varsler som skal sendes etter at timer er ført på dates (ÅÅÅÅ-MM-DD).
 * Bare overskridelser der dagen som ble ført, ligger i vinduet. Id-en er fast per ansatt,
 * regel og vindu, så samme overskridelse varsles én gang.
 * [{ id, rule, title, body, text }]: body til ledelsen, text til den som fører timene.
 */
export function workingTimeAlerts(result, { employeeId = '', employeeName = '', dates = [] } = {}) {
  const touched = (Array.isArray(dates) ? dates : [dates]).map(text).filter(Boolean);
  if (!touched.length || !result?.warnings?.length) return [];
  const who = text(employeeName) || 'En ansatt';
  const mode = result.tariff ? 'med tariffavtale' : 'etter lovens grunngrenser';
  return result.warnings
    .filter((row) => row.level === 'warn' && ALERT_RULES.includes(row.rule))
    .filter((row) => touched.some((date) => date >= row.from && date <= row.to))
    .map((row) => ({
      id: `wt_${text(employeeId).replace(/[^\w-]/g, '_')}_${row.rule}_${row.to}`,
      rule: row.rule,
      title: `Arbeidstid over grensen: ${who}`,
      body: `${who}: ${row.text} ${row.ref}, ${mode}. Timene er lagret. Følg opp med den ansatte.${OVERTIME_RULES.includes(row.rule) ? ' Er behovet varig, kan bedriften søke Arbeidstilsynet om utvidet overtidsramme (§ 10-6 (6)), senest fire uker før arbeidet. Et ferdig søknadsutkast ligger under Timesaldo for den ansatte.' : ''}`,
      text: `${row.text} ${row.ref}.`,
      date: row.to,
      dateLabel: formatDateNb(row.to),
    }));
}
