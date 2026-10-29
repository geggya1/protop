/**
 * Avgiftskode for et utlegg (inngående mva), med standardkodene fra SAF-T som regnskapssystemene
 * (også PowerOffice Go) bruker. Koden foreslås ut fra satsen på kvitteringen, utgiftstypen og om
 * kjøpet er gjort i utlandet. Regnskapsføreren kan alltid endre den.
 *
 * Ref: mval. § 8-1 (fradrag), § 8-3 (ikke fradrag for bl.a. servering, representasjon og gaver),
 * § 8-4 (personkjøretøy), § 11-3 (tjenester kjøpt fra utlandet).
 */

export const VAT_TREATMENTS = [
  { id: '1', label: '1 – Fradrag, høy sats (25 %)', deductible: true, rate: 25 },
  { id: '11', label: '11 – Fradrag, middels sats (15 %)', deductible: true, rate: 15 },
  { id: '13', label: '13 – Fradrag, lav sats (12 %)', deductible: true, rate: 12 },
  { id: '0', label: '0 – Ingen mva-behandling (ikke fradrag)', deductible: false, rate: 0 },
  { id: '86', label: '86 – Tjeneste kjøpt fra utlandet, med fradrag', deductible: true, rate: 25, reverse: true },
];

const BY_RATE = { HIGH: '1', MID: '11', LOW: '13' };

// Tjenester som leveres digitalt fra utlandet (omvendt avgiftsplikt). Ikke hotell, mat og
// transport, som forbrukes der og ikke gir norsk mva.
const REMOTE_SERVICES = new Set(['software', 'phone', 'marketing', 'course', 'books']);

// Typer uten fradrag for inngående mva, med begrunnelse.
const NO_DEDUCTION = {
  representation: 'Representasjon gir ikke fradrag for mva (mval. § 8-3).',
  meals: 'Servering og mat til ansatte gir ikke fradrag for mva (mval. § 8-3).',
  gifts: 'Gaver gir normalt ikke fradrag for mva (mval. § 8-3). Kontroller ved reklamegaver.',
  fuel: 'Drivstoff til personbil gir ikke fradrag (mval. § 8-4). Er det varebil, velg kode 1.',
  charging: 'Lading av personbil gir ikke fradrag (mval. § 8-4). Er det varebil, velg kode 1.',
  vehicle: 'Personbil gir ikke fradrag (mval. § 8-4). Er det varebil, velg kode 1.',
  toll: 'Bompenger har ikke mva.',
  mileage: 'Kjøregodtgjørelse har ikke mva.',
};

export function vatTreatment(id) {
  return VAT_TREATMENTS.find((row) => row.id === String(id ?? '')) || null;
}

/**
 * Foreslått avgiftskode: { id, reason }.
 * vatCode: satsen (HIGH/MID/LOW/EXEMPT/ZERO/OUTSIDE), category: utgiftstypen,
 * foreign: kjøpt i utenlandsk valuta, vendorCountry: landkode, isService: tjeneste.
 */
export function suggestVatTreatment({ vatCode = '', category = '', foreign = false, vendorCountry = '', isService = false } = {}) {
  const abroad = foreign || (!!vendorCountry && vendorCountry !== 'NO');
  if (abroad) {
    if (isService && REMOTE_SERVICES.has(category)) {
      return { id: '86', reason: 'Tjeneste kjøpt fra utlandet: bedriften beregner norsk mva selv (omvendt avgiftsplikt, mval. § 11-3).' };
    }
    return { id: '0', reason: 'Kjøpt i utlandet: ingen norsk mva å trekke fra.' };
  }
  if (NO_DEDUCTION[category]) return { id: '0', reason: NO_DEDUCTION[category] };
  if (BY_RATE[vatCode]) {
    const row = vatTreatment(BY_RATE[vatCode]);
    return { id: row.id, reason: `Mva ${row.rate} % på kvitteringen gir fradrag.` };
  }
  if (vatCode === 'ZERO' || vatCode === 'EXEMPT' || vatCode === 'OUTSIDE') {
    return { id: '0', reason: 'Ingen mva på kvitteringen.' };
  }
  return { id: '', reason: '' };
}
