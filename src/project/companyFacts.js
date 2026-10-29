/**
 * «Om bedriften» under Offentlig selskapsdata: opplysningene fra Enhetsregisteret i faste
 * grupper med etikett og verdi, så kortet leses som et oppslag og ikke som spredte felt.
 * Tomme felt og tomme grupper tas ikke med.
 */
import { nbDate, nok } from './companyPublic.js';
import { formatOrgNumber, formatPhone, websiteLabel } from './companyPage.js';

function text(value) {
  return String(value ?? '').trim();
}

function rows(list) {
  return list.filter((row) => text(row.value));
}

/**
 * [{ id, title, rows: [{ label, value, link? }] }]
 * link: 'mailto' | 'web' når verdien kan trykkes.
 */
export function companyFactGroups(profile, { stored = null, contact = null, parentLabel = '' } = {}) {
  const p = profile || {};
  const founded = nbDate(p.stiftelsesdato);
  const groups = [
    {
      id: 'register',
      title: 'Registrering',
      rows: rows([
        { label: 'Organisasjonsnummer', value: formatOrgNumber(p.organisasjonsnummer || stored?.organisasjonsnummer) },
        { label: 'Organisasjonsform', value: text(p.organisasjonsform) },
        { label: founded ? 'Stiftet' : 'Oppstart', value: founded || nbDate(p.oppstart) },
        { label: 'I Enhetsregisteret', value: nbDate(p.registrert) },
        { label: 'Overordnet enhet', value: text(parentLabel) },
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
      id: 'industry',
      title: 'Bransje',
      rows: rows((p.naeringer || []).map((row) => ({ label: text(row?.kode) || 'Næring', value: text(row?.beskrivelse) }))),
    },
  ];
  return groups.filter((group) => group.rows.length);
}

/** To kolonner på bred skjerm: registrering og bransje til venstre, nøkkeltall og kontakt til høyre. */
export function factColumns(groups, columns = 2) {
  const list = Array.isArray(groups) ? groups : [];
  if (columns < 2) return [list];
  const left = list.filter((group) => group.id === 'register' || group.id === 'industry');
  const right = list.filter((group) => group.id !== 'register' && group.id !== 'industry');
  return [left, right].filter((col) => col.length);
}
