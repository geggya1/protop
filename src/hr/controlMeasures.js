/**
 * Kontrolltiltak overfor ansatte (aml kap. 9) som ProTop selv utfører:
 * brukslogg, produktivitetsoversikt og AI-kontroll av timelister.
 *
 * aml § 9-1: saklig grunn og ikke uforholdsmessig belastning. Personopplysningsloven gjelder.
 * aml § 9-2: drøftes med tillitsvalgte så tidlig som mulig, de berørte informeres om formål,
 * gjennomføring og varighet før start, og behovet evalueres jevnlig sammen med tillitsvalgte.
 *
 * Lagres i families/{companyId}/hr/controlMeasures. Bruksloggens lagringstid og av/på står
 * i companyPrivacy (Selskapsinnstillinger → Personvern), så den hentes derfra.
 */
import { USAGE_RETENTION_DAYS } from '../privacy/companyPrivacy.js';

export const CONTROL_MEASURES = [
  {
    id: 'usage',
    label: 'Brukslogg',
    collects: 'Innlogging, aktivitet og sidevisninger med tidspunkt, IP-adresse og nettleser, og endringer i timer og sendte invitasjoner.',
    purpose: 'Sikkerhet og feilsøking, og dokumentasjon av hvem som har ført og endret timer.',
    retentionDays: USAGE_RETENTION_DAYS,
  },
  {
    id: 'productivity',
    label: 'Produktivitet og belegg',
    collects: 'Fakturerbar andel av førte timer per ansatt, sammenlignet med et mål.',
    purpose: 'Kapasitetsplanlegging og prising av prosjekter.',
    retentionDays: 0,
  },
  {
    id: 'timesheetAi',
    label: 'AI-kontroll av timelister',
    collects: 'Tekst og timer i timelisten leses av en AI-tjeneste før godkjenning.',
    purpose: 'Finne skrivefeil og avvik før lønn og fakturering.',
    retentionDays: 0,
  },
];

/** Evaluering bør skje minst en gang i året. */
export const EVALUATE_EVERY_DAYS = 365;

function text(value) {
  return String(value ?? '').trim();
}

function isoDay(value) {
  const day = text(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : '';
}

function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function normalizeControlMeasures(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const measures = {};
  for (const base of CONTROL_MEASURES) {
    const row = src.measures?.[base.id] && typeof src.measures[base.id] === 'object' ? src.measures[base.id] : {};
    measures[base.id] = {
      id: base.id,
      enabled: row.enabled !== false,
      purpose: text(row.purpose) || base.purpose,
      justification: text(row.justification).slice(0, 800),
      discussedAt: isoDay(row.discussedAt),
      discussedWith: text(row.discussedWith).slice(0, 200),
      informedAt: isoDay(row.informedAt),
      evaluatedAt: isoDay(row.evaluatedAt),
      retentionDays: base.retentionDays,
    };
  }
  return { measures, updatedAt: text(src.updatedAt) };
}

/** Hva som mangler for ett tiltak etter § 9-2. */
export function controlMeasureGaps(measure, { today } = {}) {
  const day = isoDay(today) || new Date().toISOString().slice(0, 10);
  const gaps = [];
  if (!measure?.enabled) return gaps;
  if (!text(measure.justification)) gaps.push('Saklig grunn er ikke beskrevet (§ 9-1).');
  if (!measure.discussedAt) gaps.push('Ikke drøftet med tillitsvalgte (§ 9-2 (1)).');
  if (!measure.informedAt) gaps.push('De ansatte er ikke informert om formål, gjennomføring og varighet (§ 9-2 (2)).');
  const last = measure.evaluatedAt || measure.discussedAt;
  if (last && addDays(last, EVALUATE_EVERY_DAYS) < day) gaps.push('Behovet er ikke evaluert det siste året (§ 9-2 (3)).');
  return gaps;
}

export function controlMeasuresSummary(settings, { today } = {}) {
  const norm = normalizeControlMeasures(settings);
  const rows = CONTROL_MEASURES.map((base) => {
    const measure = norm.measures[base.id];
    return { ...base, ...measure, gaps: controlMeasureGaps(measure, { today }) };
  });
  return { rows, open: rows.filter((row) => row.gaps.length).length };
}
