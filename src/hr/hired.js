/**
 * Innleid og eksternt personell: det dere som innleier eller oppdragsgiver skal ha
 * kontroll på. Holdes atskilt fra egne ansatte (Lovpålagt i compliance.js), fordi
 * arbeidsgiveransvaret for lønn, arbeidsavtale og medarbeidersamtaler ligger hos
 * bemanningsforetaket eller leverandøren, ikke hos dere.
 *
 * Kilder: arbeidsmiljøloven (AML) §§ 2-2, 14-12, 14-12a, 14-12b og 14-12c, kapittel 10,
 * forskrift om bemanningsforetak, forskrift om HMS-kort og personvernforordningen.
 *
 * Radene lagres i hr.compliance med catalogId «inn_…», så de følger samme lagring og
 * sletting (retention) som resten av HR-mappen, men teller ikke i egne ansattes Lovpålagt.
 */
import { hmsCardFor, hmsComplianceStatus } from './hmsCard.js';
import { normalizeComplianceItem } from './compliance.js';

/** «Innleid» er fra bemanningsforetak. «Ekstern» er konsulent, regnskap, underleverandør o.l. */
export const HIRED_TYPES = ['innleid', 'ekstern'];

export function hiredType(kindLabel) {
  return String(kindLabel || '').toLowerCase() === 'innleid' ? 'innleid' : 'ekstern';
}

/**
 * level: 'law' er lovkrav, 'advice' er anbefalt.
 * requiredFor: typene der punktet er påkrevd. For de andre typene i appliesTo er det «ved behov».
 * derived: 'hmsCard' følger HMS-kortet som er registrert.
 */
export const HIRED_CATALOG = [
  {
    id: 'inn_legal_basis',
    level: 'law',
    label: 'Lovlig grunnlag for innleien',
    short: 'grunnlag',
    appliesTo: ['innleid'],
    requiredFor: ['innleid'],
    todo: 'Skriv ned hvorfor dere leier inn (midlertidig behov, eller avtale med tillitsvalgte), og marker OK.',
    hint: 'AML § 14-12: innleie fra bemanningsforetak er bare tillatt for arbeid av midlertidig karakter, eller etter skriftlig avtale med tillitsvalgte i virksomhet som er bundet av tariffavtale. Bruken av innleie skal drøftes med tillitsvalgte. Innleie til bygningsarbeid på byggeplass er forbudt i Oslo, tidligere Viken og tidligere Vestfold.',
  },
  {
    id: 'inn_agency_registered',
    level: 'law',
    label: 'Bemanningsforetaket er registrert hos Arbeidstilsynet',
    short: 'registrert foretak',
    appliesTo: ['innleid'],
    requiredFor: ['innleid'],
    todo: 'Søk opp foretaket i Arbeidstilsynets register over bemanningsforetak før innleien starter, og marker OK.',
    hint: 'Forskrift om bemanningsforetak: innleier skal påse at foretaket står i registeret. Det er ikke lov å leie inn fra et foretak som ikke er registrert.',
  },
  {
    id: 'inn_equal_terms',
    level: 'law',
    label: 'Lønns- og arbeidsvilkår gitt til bemanningsforetaket',
    short: 'likebehandling',
    appliesTo: ['innleid'],
    requiredFor: ['innleid'],
    todo: 'Send bemanningsforetaket lønn, arbeidstid, overtid og andre vilkår som gjelder for tilsvarende egne ansatte, og marker OK.',
    hint: 'AML §§ 14-12a og 14-12b: den innleide skal ha minst de samme vilkårene som om hen var ansatt hos dere. Dere skal gi foretaket opplysningene som trengs, og påse at vilkårene følges.',
  },
  {
    id: 'inn_hms_card',
    level: 'law',
    label: 'Gyldig HMS-kort',
    short: 'HMS-kort',
    appliesTo: ['innleid', 'ekstern'],
    requiredFor: ['innleid'],
    derived: 'hmsCard',
    todo: 'Registrer HMS-kortet under, eller velg «Ikke aktuelt» for den som ikke arbeider der kortet kreves.',
    hint: 'Alle som arbeider på bygge- og anleggsplass skal bære HMS-kort, også innleide og underleverandører. Kortet til en innleid viser bemanningsforetaket.',
  },
  {
    id: 'inn_safety_intro',
    level: 'law',
    label: 'HMS-introduksjon og sikkerhetsopplæring gitt',
    short: 'HMS-introduksjon',
    appliesTo: ['innleid', 'ekstern'],
    requiredFor: ['innleid'],
    todo: 'Gå gjennom rutiner, risiko på arbeidsstedet, verneutstyr og hvordan avvik meldes før arbeidet starter, og marker OK.',
    hint: 'AML § 2-2: dere har ansvaret for arbeidsmiljøet og sikkerheten til alle som arbeider hos dere, også innleide og andre virksomheters folk.',
  },
  {
    id: 'inn_working_time',
    level: 'law',
    label: 'Arbeidstiden følges opp',
    short: 'arbeidstid',
    appliesTo: ['innleid'],
    requiredFor: ['innleid'],
    todo: 'La personen føre timer i ProTop, eller hent timelister fra foretaket, så grensene for arbeidstid og overtid kan følges. Marker OK.',
    hint: 'Innleier har ansvaret for at reglene om arbeidstid i AML kapittel 10 følges for innleide.',
  },
  {
    id: 'inn_privacy_notice',
    level: 'law',
    label: 'Personverninformasjon gitt',
    short: 'personvern',
    appliesTo: ['innleid', 'ekstern'],
    requiredFor: ['innleid', 'ekstern'],
    todo: 'Fortell personen hvilke opplysninger dere lagrer (timer, HMS-kort, tilganger), hvorfor og hvor lenge, og marker OK.',
    hint: 'Personvernforordningen art. 13: dere behandler opplysninger om personen og skal informere om det, selv om hen ikke er ansatt hos dere.',
  },
  {
    id: 'inn_ppe',
    level: 'law',
    label: 'Verneutstyr avklart (ved behov)',
    short: 'verneutstyr',
    appliesTo: ['innleid', 'ekstern'],
    requiredFor: [],
    todo: 'Avklar hvem som stiller verneutstyret, og at det passer til arbeidet. Marker OK, eller «Ikke aktuelt».',
    hint: 'Avtal med leverandøren hvem som stiller utstyret. Dere har ansvaret for at det brukes og passer til arbeidet hos dere.',
  },
  {
    id: 'inn_processor_agreement',
    level: 'law',
    label: 'Databehandleravtale (hvis de behandler personopplysninger for dere)',
    short: 'databehandleravtale',
    appliesTo: ['ekstern'],
    requiredFor: [],
    todo: 'Inngå databehandleravtale når leverandøren behandler personopplysninger på vegne av dere, for eksempel regnskap eller lønn. Ellers «Ikke aktuelt».',
    hint: 'Personvernforordningen art. 28.',
  },
  {
    id: 'inn_supplier_contract',
    level: 'advice',
    label: 'Skriftlig avtale med leverandøren',
    short: 'avtale med leverandør',
    appliesTo: ['innleid', 'ekstern'],
    requiredFor: [],
    todo: 'Ha en skriftlig avtale med pris, varighet, ansvar for HMS og verneutstyr, og hvem som er kontaktperson.',
    hint: 'Ikke lovpålagt, men avtalen er det dere har å vise til hvis noe går galt. Ved innleie bør den si at foretaket betaler lønn og feriepenger og gir dokumentasjon på det.',
  },
  {
    id: 'inn_wage_check',
    level: 'advice',
    label: 'Kontroll av at lønn og feriepenger er betalt',
    short: 'lønnskontroll',
    appliesTo: ['innleid'],
    requiredFor: [],
    todo: 'Be bemanningsforetaket om dokumentasjon på utbetalt lønn og feriepenger, for eksempel hvert halvår.',
    hint: 'AML § 14-12c: dere har solidaransvar for lønn og feriepenger til den innleide hvis foretaket ikke betaler.',
  },
  {
    id: 'inn_end_date',
    level: 'advice',
    label: 'Varighet for innleien satt',
    short: 'varighet',
    appliesTo: ['innleid'],
    requiredFor: [],
    todo: 'Skriv inn når innleien slutter, eller når behovet skal vurderes på nytt.',
    hint: 'Innleie skal dekke et midlertidig behov. Lang, sammenhengende innleie kan gi den innleide rett til fast ansettelse hos dere (AML § 14-12).',
  },
];

export const HIRED_LEVELS = [
  { id: 'law', label: 'Lovkrav' },
  { id: 'advice', label: 'Anbefalt' },
];

const HIRED_IDS = new Set(HIRED_CATALOG.map((row) => row.id));

export function isHiredCatalogId(catalogId) {
  return HIRED_IDS.has(String(catalogId || ''));
}

export function hiredCatalogItem(catalogId) {
  return HIRED_CATALOG.find((row) => row.id === catalogId) || null;
}

export function hiredCatalogFor(type) {
  const t = hiredType(type);
  return HIRED_CATALOG.filter((row) => row.appliesTo.includes(t));
}

/** Påkrevd for denne typen? HMS-kort er det bare når bedriften krever HMS-kort. */
export function isHiredRequired(catalogId, type, { hmsRequired = true } = {}) {
  const cat = hiredCatalogItem(catalogId);
  if (!cat || cat.level !== 'law') return false;
  if (!cat.requiredFor.includes(hiredType(type))) return false;
  return cat.derived === 'hmsCard' ? hmsRequired !== false : true;
}

/** «påkrevd», «ved behov» eller «anbefalt». */
export function hiredRequirementLabel(catalogId, type, opts) {
  const cat = hiredCatalogItem(catalogId);
  if (cat?.level === 'advice') return 'anbefalt';
  return isHiredRequired(catalogId, type, opts) ? 'påkrevd' : 'ved behov';
}

function emptyHiredItem(catalogId, employeeId) {
  const cat = hiredCatalogItem(catalogId);
  return normalizeComplianceItem({
    id: `${catalogId}_${employeeId || 'x'}`,
    catalogId,
    employeeId,
    source: cat?.level === 'advice' ? 'anbefalt' : 'lov',
    label: cat?.label || catalogId,
    status: 'missing',
  });
}

/** Punktene som gjelder personen, med lagret status. HMS-kortet følger kortet som er registrert. */
export function hiredItemsFor(compliance, employeeId, type, { hmsCards = [], today = '' } = {}) {
  const emp = String(employeeId || '').trim();
  if (!emp) return [];
  const saved = new Map(
    (compliance || [])
      .filter((row) => String(row.employeeId) === emp && isHiredCatalogId(row.catalogId))
      .map((row) => [row.catalogId, normalizeComplianceItem(row)]),
  );
  const now = String(today || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  return hiredCatalogFor(type).map((cat) => {
    const row = saved.get(cat.id) || emptyHiredItem(cat.id, emp);
    if (cat.derived === 'hmsCard' && row.status !== 'na') {
      const card = hmsCardFor(emp, hmsCards);
      const status = hmsComplianceStatus(card, now);
      return { ...row, label: cat.label, status, dueDate: card?.validTo || '' };
    }
    return { ...row, label: cat.label };
  });
}

/** Bytt ut én persons innleiepunkter. Alle andre rader (også egne ansattes Lovpålagt) blir stående. */
export function replaceHiredItems(all, employeeId, rows) {
  const emp = String(employeeId || '').trim();
  const kept = (all || []).filter((row) => String(row.employeeId) !== emp || !isHiredCatalogId(row.catalogId));
  // HMS-kortets status følger kortet og lagres ikke, bare «Ikke aktuelt».
  const stored = (rows || []).map((row) => {
    if (hiredCatalogItem(row.catalogId)?.derived !== 'hmsCard') return row;
    return { ...row, status: row.status === 'na' ? 'na' : 'missing', dueDate: '', completedAt: '' };
  });
  return [...kept, ...stored];
}

/** Sett status på ett punkt. Gir ny compliance-liste. */
export function setHiredStatus(compliance, employeeId, type, catalogId, status, { today = '' } = {}) {
  const cat = hiredCatalogItem(catalogId);
  if (!cat || !['ok', 'missing', 'na'].includes(status)) return compliance || [];
  if (cat.derived === 'hmsCard' && status === 'ok') return compliance || [];
  const day = String(today || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const rows = hiredItemsFor(compliance, employeeId, type).map((row) => (
    row.catalogId === catalogId
      ? { ...row, status, completedAt: status === 'ok' ? day : '', updatedAt: new Date().toISOString() }
      : row
  ));
  return replaceHiredItems(compliance, employeeId, rows);
}

export function setHiredNote(compliance, employeeId, type, catalogId, note) {
  const rows = hiredItemsFor(compliance, employeeId, type).map((row) => (
    row.catalogId === catalogId ? { ...row, note: String(note || '').trim(), updatedAt: new Date().toISOString() } : row
  ));
  return replaceHiredItems(compliance, employeeId, rows);
}

function isGap(row) {
  return row.status === 'missing' || row.status === 'overdue';
}

/**
 * Status for én person: lovkrav som mangler (påkrevde), og anbefalte punkter som er gjort.
 * «Ikke aktuelt» telles ikke.
 */
export function hiredSummary(items, type, { hmsRequired = true } = {}) {
  const rows = Array.isArray(items) ? items : [];
  const law = rows.filter((row) => (
    isHiredRequired(row.catalogId, type, { hmsRequired }) && row.status !== 'na'
  ));
  const lawGaps = law.filter(isGap);
  const advice = rows.filter((row) => hiredCatalogItem(row.catalogId)?.level === 'advice' && row.status !== 'na');
  const adviceDone = advice.filter((row) => row.status === 'ok').length;
  return {
    lawTotal: law.length,
    lawOk: law.filter((row) => row.status === 'ok').length,
    lawMissing: lawGaps.length,
    lawGapShort: lawGaps.map((row) => {
      const name = hiredCatalogItem(row.catalogId)?.short || row.label;
      return row.status === 'overdue' ? `${name} (forfalt)` : name;
    }),
    adviceTotal: advice.length,
    adviceDone,
  };
}

/** Celletekster for listen over innleide. */
export function hiredCells(employee, kindLabel, hr = {}) {
  const id = String(employee?.id || '');
  const type = hiredType(kindLabel);
  const items = hiredItemsFor(hr.compliance, id, type, { hmsCards: hr.hmsCards });
  const summary = hiredSummary(items, type, { hmsRequired: hr.hmsRequired !== false });
  const gapText = summary.lawGapShort.join(', ');
  return {
    type,
    items,
    summary,
    law: summary.lawMissing
      ? gapText.charAt(0).toUpperCase() + gapText.slice(1)
      : (summary.lawTotal ? 'OK' : '—'),
    lawWarn: summary.lawMissing > 0,
    advice: summary.adviceTotal ? `${summary.adviceDone} av ${summary.adviceTotal}` : '—',
  };
}
