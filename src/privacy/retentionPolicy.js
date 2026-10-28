/**
 * Lagringstider (GRUNN-04, GDPR art. 5 nr. 1 e). Ren logikk, felles for appen og functions/.
 * Forklaring og lovgrunnlag: docs/personvern/lagringstider.md.
 *
 * status:
 *   'implemented' – slettes i koden i dag (enabled: true)
 *   'locked'      – skal oppbevares, kan ikke slettes av brukerne (regnskap)
 *   'proposal'    – forslag til eierens beslutning. Ingenting slettes før eieren har bestemt
 *                   fristen og satt enabled: true, og en slettejobb leser retentionCutoffIso().
 *
 * keep: { days | months | years }. from: hva fristen regnes fra.
 */
import { USAGE_RETENTION_DAYS } from './companyPrivacy.js';

/** Innsynsloggen (hvem åpnet HR, lønn, fravær eller personnummer): to år. */
export const ACCESS_LOG_RETENTION_DAYS = 730;
/** Spørsmål til hjelpeassistenten (functions/helpKnowledge.js). */
export const HELP_CANDIDATE_RETENTION_DAYS = 365;

const BOKFORING = 'Bokføringsloven § 13 første ledd: fem år etter regnskapsårets slutt';

export const RETENTION_POLICY = [
  {
    id: 'accessLog', label: 'Innsynslogg (HR, lønn, fravær, personnummer)', keep: { days: ACCESS_LOG_RETENTION_DAYS }, from: 'innsynet',
    basis: ['GDPR art. 5 nr. 2 og art. 32 (sporbarhet)', 'Den ansatte skal kunne se hvem som har sett egne opplysninger'],
    status: 'implemented', enabled: true, where: 'functions/accessLog.js (ved skriving og lesing)',
  },
  {
    id: 'usageLog', label: 'Brukslogg (innlogging, aktivitet, sidevisninger)', keep: { days: USAGE_RETENTION_DAYS }, from: 'hendelsen',
    basis: ['GDPR art. 5 nr. 1 c og e', 'Arbeidsmiljøloven kap. 9 (kontrolltiltak)'],
    status: 'implemented', enabled: true, where: 'functions/usageLog.js',
  },
  {
    id: 'helpKnowledge', label: 'Spørsmål til hjelpeassistenten (uten uid)', keep: { days: HELP_CANDIDATE_RETENTION_DAYS }, from: 'spørsmålet',
    basis: ['GDPR art. 5 nr. 1 e'],
    status: 'implemented', enabled: true, where: 'functions/helpKnowledge.js',
  },
  {
    id: 'invoices', label: 'Fakturaer, kreditnotaer og bilag', keep: { years: 5 }, from: 'regnskapsårets slutt',
    basis: [BOKFORING],
    status: 'locked', enabled: false, where: 'firestore.rules (utstedt faktura kan ikke slettes)',
  },
  {
    id: 'timeEntries', label: 'Timer (arbeidstid, lønns- og fakturagrunnlag)', keep: { years: 5 }, from: 'regnskapsårets slutt',
    basis: [BOKFORING, 'Arbeidsmiljøloven § 10-7 (oversikt over arbeidstid, ingen fast frist i bestemmelsen)', 'Foreldelsesloven § 2 (krav på lønn: tre år)'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'absences', label: 'Fravær og ferie (dato, timer, type)', keep: { years: 5 }, from: 'regnskapsårets slutt',
    basis: [`${BOKFORING} (lønnsgrunnlag: sykepenger, feriepenger)`, 'Ferieloven (feriepenger)'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'absenceComments', label: 'Kommentar på sykefravær (fritekst)', keep: { months: 12 }, from: 'fraværet',
    basis: ['GDPR art. 5 nr. 1 c og e og art. 9 (helseopplysning)', 'Arbeidsmiljøloven § 4-6 (oppfølging mens den pågår)'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'mileage', label: 'Kjørebok, utlegg og kvitteringer', keep: { years: 5 }, from: 'regnskapsårets slutt',
    basis: [BOKFORING, 'Skattefri bilgodtgjørelse krever kjørebok'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'isoInjuries', label: 'ISO: personskader og yrkesskader', keep: { years: 10 }, from: 'saken ble lukket',
    basis: ['Arbeidsmiljøloven § 5-1 (registrering av personskader)', 'Folketrygdloven kap. 13 og yrkesskadeforsikringsloven: krav kan komme sent (foreldelsesloven § 9)'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'isoCases', label: 'ISO: avvik, RUH og tiltak (uten personskade)', keep: { years: 5 }, from: 'saken ble lukket',
    basis: ['Internkontrollforskriften § 5 (dokumentasjon)', 'ISO 9001/14001/45001 punkt 7.5.3 og 10.2 (bevis på avvik og tiltak)'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'isoAudits', label: 'ISO: revisjoner, ledelsens gjennomgang og risikovurderinger', keep: { years: 6 }, from: 'datoen',
    basis: ['ISO 9001/14001/45001 punkt 9.2 og 9.3 (to sertifiseringsperioder)', 'Internkontrollforskriften § 5'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'isoCompetence', label: 'Kompetansebevis og opplæring', keep: { years: 3 }, from: 'sluttdato',
    basis: ['Forskrift om utførelse av arbeid og forskrift om administrative ordninger (dokumentert opplæring)', 'ISO punkt 7.2'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'whistleblowing', label: 'Varslingssaker (arbeidsmiljøloven kap. 2 A)', keep: { years: 3 }, from: 'saken ble avsluttet',
    basis: ['Arbeidsmiljøloven § 2 A-3 (rutiner)', 'Foreldelsesloven § 9 (krav etter gjengjeldelse)'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'chat', label: 'Chat og meldinger i bedriften', keep: { months: 24 }, from: 'meldingen',
    basis: ['GDPR art. 5 nr. 1 e (ingen lovkrav om oppbevaring)'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'customers', label: 'Kunder og kontaktpersoner', keep: { years: 3 }, from: 'siste oppdrag eller kontakt',
    basis: ['GDPR art. 5 nr. 1 e', 'Foreldelsesloven § 2 (reklamasjon og krav: tre år)', 'Fakturaene beholdes etter bokføringsloven'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'customerNationalId', label: 'Personnummer for privatkunder i avtaler', keep: { years: 3 }, from: 'avtalen er oppfylt',
    basis: ['GDPR art. 5 nr. 1 c og e', 'Personopplysningsloven § 12 (fødselsnummer bare ved saklig behov)'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'tenders', label: 'Anbud og tilbud som ikke ble vunnet', keep: { years: 3 }, from: 'tildelingen',
    basis: ['GDPR art. 5 nr. 1 e', 'Klagefrist og foreldelse'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'notifications', label: 'Varsler i appen', keep: { months: 12 }, from: 'varselet',
    basis: ['GDPR art. 5 nr. 1 e (kopi av hendelser som finnes andre steder)'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'supportTickets', label: 'Supportsaker', keep: { years: 3 }, from: 'saken ble lukket',
    basis: ['GDPR art. 5 nr. 1 e', 'Foreldelsesloven § 2'],
    status: 'proposal', enabled: false,
  },
  {
    id: 'rateLimits', label: 'Tellere mot misbruk (rateLimits)', keep: { days: 30 }, from: 'siste kall',
    basis: ['GDPR art. 5 nr. 1 e (tellerne trengs bare i vinduet)'],
    status: 'proposal', enabled: false,
  },
];

/** Fristen i dager (år = 365, måned = 30). */
export function retentionDays(entry) {
  const keep = entry?.keep || {};
  if (Number.isFinite(keep.days)) return keep.days;
  if (Number.isFinite(keep.months)) return keep.months * 30;
  if (Number.isFinite(keep.years)) return keep.years * 365;
  return null;
}

export function retentionEntry(id, policy = RETENTION_POLICY) {
  return (Array.isArray(policy) ? policy : []).find((row) => row.id === id) || null;
}

/**
 * Eldste tidspunkt (ISO) som fortsatt beholdes, eller '' når kategorien ikke er slått på.
 * En slettejobb sletter det som er eldre. Gjelder frister regnet fra en dato i dokumentet;
 * frister fra regnskapsårets slutt må regnes fra 31.12 i året (se regnskapsYearCutoff).
 */
export function retentionCutoffIso(id, now = new Date(), policy = RETENTION_POLICY) {
  const entry = retentionEntry(id, policy);
  if (!entry || entry.enabled !== true) return '';
  const days = retentionDays(entry);
  if (!Number.isFinite(days)) return '';
  return new Date(new Date(now).getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** Siste regnskapsår som kan slettes når fristen er «N år etter regnskapsårets slutt». */
export function lastDeletableAccountingYear(years, now = new Date()) {
  return new Date(now).getUTCFullYear() - 1 - Number(years || 0);
}

/** «2 år», «12 måneder», «90 dager». */
export function retentionLabel(entry) {
  const keep = entry?.keep || {};
  if (Number.isFinite(keep.years)) return `${keep.years} år`;
  if (Number.isFinite(keep.months)) return `${keep.months} måneder`;
  if (Number.isFinite(keep.days)) {
    if (keep.days % 365 === 0) return `${keep.days / 365} år`;
    return `${keep.days} dager`;
  }
  return '';
}
