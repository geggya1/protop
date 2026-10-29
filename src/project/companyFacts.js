/**
 * «Om bedriften» under Offentlig selskapsdata: opplysningene fra Enhetsregisteret i faste
 * grupper med etikett og verdi, så kortet leses som et oppslag og ikke som spredte felt.
 * Register og status, konsern og underenheter står her, ikke i egne kort, så ingenting vises
 * to ganger. Signaturrett og roller ligger i skuffer under (signatureRows, roleRows).
 * Tomme felt og tomme grupper tas ikke med.
 */
import { nbDate, nok } from './companyPublic.js';
import { formatOrgNumber, formatPhone, websiteLabel } from './companyPage.js';

function text(value) {
  return String(value ?? '').trim();
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function rows(list) {
  return list.filter((row) => text(row.value));
}

const WARN = new Set(['Konkurs', 'Avvikling', 'Tvangsavvikling']);

/** «CONSULT1 AS · 916538804» er ikke overordnet til seg selv. */
function otherCompany(label, ownName, ownOrgnr) {
  const value = text(label);
  if (!value) return '';
  const own = text(ownName).toLowerCase();
  const name = value.split('·')[0].trim().toLowerCase();
  if (own && name === own) return '';
  const nr = digits(ownOrgnr);
  if (nr.length === 9 && digits(value).includes(nr)) return '';
  return value;
}

/**
 * [{ id, title, rows: [{ label, value, link?, tone? }], action? }]
 * link: 'mailto' | 'web' når verdien kan trykkes. tone: 'warn' for konkurs og avvikling.
 * action: 'units' når gruppen har «Se alle» til underenhetene.
 */
export function companyFactGroups(profile, {
  stored = null, contact = null, registers = [], overview = null,
} = {}) {
  const p = profile || {};
  const founded = nbDate(p.stiftelsesdato);
  const ownName = p.navn || stored?.navn;
  const ownOrgnr = p.organisasjonsnummer || stored?.organisasjonsnummer;
  const statusRows = (Array.isArray(registers) ? registers : [])
    .filter((row) => row?.label && row.label !== 'Konsern')
    .map((row) => ({ label: row.label, value: text(row.value), tone: WARN.has(row.label) ? 'warn' : undefined }));
  const parent = otherCompany(overview?.parentCompanyName, ownName, ownOrgnr);
  const units = overview?.preview || [];
  const unitCount = overview && (overview.publicCount || overview.registeredCount)
    ? `${overview.publicCount} i Enhetsregisteret · ${overview.registeredCount} registrert her`
    : '';
  const groups = [
    {
      id: 'register',
      title: 'Registrering',
      rows: rows([
        { label: 'Organisasjonsnummer', value: formatOrgNumber(ownOrgnr) },
        { label: 'Organisasjonsform', value: text(p.organisasjonsform) },
        { label: founded ? 'Stiftet' : 'Oppstart', value: founded || nbDate(p.oppstart) },
        { label: 'I Enhetsregisteret', value: nbDate(p.registrert) },
        ...statusRows,
        { label: 'Sektor', value: [p.sektorKode, p.sektor].map(text).filter(Boolean).join(' · ') },
        { label: 'Målform', value: text(p.maalform) },
        { label: 'Tidligere navn', value: (p.historiskeNavn || []).map(text).filter(Boolean).join(', ') },
      ]),
    },
    {
      id: 'numbers',
      title: 'Nøkkeltall',
      rows: rows([
        { label: 'Ansatte', value: p.ansatte != null ? String(p.ansatte) : '' },
        { label: text(p.kapital?.type) || 'Aksjekapital', value: p.kapital ? nok(p.kapital.belop) : '' },
        { label: 'Siste årsregnskap', value: text(p.sisteRegnskap) },
      ]),
    },
    {
      id: 'contact',
      title: 'Kontakt og adresse',
      rows: rows([
        { label: 'Forretningsadresse', value: text(p.forretning?.label) || text(contact?.address) },
        { label: 'Postadresse', value: text(p.post?.label) },
        { label: 'Telefon', value: formatPhone(p.telefon || p.mobil || stored?.telefon) },
        { label: 'E-post', value: text(p.epostadresse || stored?.epostadresse), link: 'mailto' },
        { label: 'Hjemmeside', value: websiteLabel(p.hjemmeside), link: 'web' },
      ]),
    },
    {
      id: 'group',
      title: 'Konsern og underenheter',
      action: unitCount ? 'units' : undefined,
      rows: overview ? rows([
        { label: 'Konsern', value: overview.inKonsern || p.konsern ? 'Inngår i konsern' : 'Ikke registrert i konsern' },
        { label: 'Morselskap', value: overview.isMorselskap ? 'Ja, i siste årsregnskap' : '' },
        { label: 'Overordnet selskap', value: parent },
        { label: 'Underenheter', value: unitCount },
        ...units.map((unit) => ({
          label: formatOrgNumber(unit.organisasjonsnummer) || 'Underenhet',
          value: text(unit.name),
        })),
        { label: '', value: overview.remaining ? `Og ${overview.remaining} til` : '' },
      ]) : [],
    },
    {
      id: 'industry',
      title: 'Bransje',
      rows: rows((p.naeringer || []).map((row) => ({ label: text(row?.kode) || 'Næring', value: text(row?.beskrivelse) }))),
    },
  ];
  return groups.filter((group) => group.rows.length);
}

/** To kolonner på bred skjerm: registrering og bransje til venstre, resten til høyre. */
export function factColumns(groups, columns = 2) {
  const list = Array.isArray(groups) ? groups : [];
  if (columns < 2) return [list];
  const left = list.filter((group) => group.id === 'register' || group.id === 'industry');
  const right = list.filter((group) => group.id !== 'register' && group.id !== 'industry');
  return [left, right].filter((col) => col.length);
}

/** Signaturrett som rader: hvem som kan signere, per kombinasjon. */
export function signatureRows(signature) {
  if (!signature) return [];
  return (signature.kombinasjoner || [])
    .map((row) => ({
      label: text(row?.tekst) || 'Kan signere',
      value: (row?.personer || []).map((person) => text(person?.navn)).filter(Boolean).join(', '),
    }))
    .filter((row) => row.value);
}

/** Roller som rader: rolle til venstre, navn til høyre, i registerets rekkefølge. */
export function roleRows(roles) {
  return (Array.isArray(roles) ? roles : [])
    .map((row) => ({ label: text(row?.rolle), value: text(row?.navn) }))
    .filter((row) => row.label && row.value);
}

/** Kort linje i lukket skuff: daglig leder og styreleder om de finnes, ellers antallet. */
export function roleSummary(roles) {
  const list = roleRows(roles);
  const pick = (name) => list.find((row) => row.label.toLowerCase() === name)?.value;
  const parts = [
    pick('daglig leder') ? `Daglig leder: ${pick('daglig leder')}` : '',
    pick('styrets leder') ? `Styrets leder: ${pick('styrets leder')}` : '',
  ].filter(Boolean);
  if (parts.length) return parts.join(' · ');
  return `${list.length} ${list.length === 1 ? 'rolle' : 'roller'} i Enhetsregisteret`;
}
