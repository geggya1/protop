/**
 * Kjørebokflyt: prosjekt med timer siste to måneder, firmadresse, sats og tur/retur.
 */

import { timesheetActivityRange } from '../arbeid/timesheetProjects.js';
import { parseHours } from '../arbeid/hours.js';
import { MILEAGE_RATE_TAX_FREE } from '../economy/mileage.js';
import { roundMoney } from '../economy/vat.js';
import { parseNorwegianAddressQuery } from '../utils/boligmappaApis.js';

export const VISIT_PURPOSES = [
  { id: 'befaring', label: 'Befaring' },
  { id: 'mote', label: 'Møte' },
  { id: 'befaring-mote', label: 'Befaring og møte' },
  { id: 'service', label: 'Service' },
  { id: 'annet', label: 'Annet' },
];

function text(value) {
  return String(value ?? '').trim();
}

export function visitPurposeLabel(id, custom = '') {
  if (id === 'annet') return text(custom) || 'Annet';
  return VISIT_PURPOSES.find((row) => row.id === id)?.label || 'Befaring';
}

function joinAddress(street, postalCode, placeName) {
  const streetText = text(street);
  const postal = text(postalCode);
  const place = text(placeName);
  const tail = [postal, place].filter(Boolean).join(' ');
  if (!streetText) return tail;
  if (tail && streetText.toLowerCase().includes(tail.toLowerCase())) return streetText;
  if (postal && streetText.includes(postal)) return streetText;
  return [streetText, tail].filter(Boolean).join(', ');
}

/** «2 Etasje» og «2. etasje» er ikke en gate. Etasjeveien blir stående. */
export function stripFloorPhrase(value) {
  return text(value)
    .replace(/(?:^|[,\s]+)\d{0,2}\.?\s*etasje\b/gi, ' ')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,+/g, ',')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();
}

function agreementForProject(project, contracts) {
  const list = (Array.isArray(contracts) ? contracts : []).filter((row) => row && !row.deletedAt);
  const byId = text(project?.contractId)
    ? list.find((row) => row.id === project.contractId) || null
    : null;
  if (byId) return byId;
  const pointing = list.filter((row) => text(row.projectId) && row.projectId === project?.id);
  return pointing.find((row) => row.status !== 'avsluttet') || pointing[0] || null;
}

function customerForProject(project, customers) {
  const list = Array.isArray(customers) ? customers : [];
  const id = text(project?.customerId);
  const number = text(project?.customerNumber);
  const orgnr = text(project?.orgnr);
  return list.find((row) => (
    (id && row?.id === id)
    || (number && text(row?.customerNumber) === number)
    || (orgnr && text(row?.orgnr) === orgnr)
  )) || null;
}

/**
 * Gate, postnummer og poststed på prosjektet.
 * Mangler de, brukes stedsteksten, deretter adressen på avtalen, deretter kunden.
 */
export function projectAddressLabel(project, sources = {}) {
  if (!project) return '';
  const own = joinAddress(project.street, project.postalCode, project.placeName);
  if (own) return own;
  const place = text(project.place);
  if (place) return place;
  const contract = agreementForProject(project, sources.contracts);
  if (contract) {
    const fields = contract.fields || {};
    const fromContract = joinAddress(
      fields.address || contract.address,
      fields.postalCode || contract.postalCode,
      fields.place || contract.place,
    );
    if (fromContract) return fromContract;
  }
  const customer = customerForProject(project, sources.customers);
  if (customer) {
    const fromCustomer = joinAddress(customer.address, customer.postalCode, customer.place);
    if (fromCustomer) return fromCustomer;
  }
  return '';
}

/** Prosjektet har egen gate/sted, ikke bare adresse fra avtale eller kunde. */
export function projectHasOwnAddress(project) {
  if (!project) return false;
  return Boolean(joinAddress(project.street, project.postalCode, project.placeName) || text(project.place));
}

/** Felter som lagres på prosjektet når en tur skal bli fast prosjektadresse. */
export function addressFieldsFromPlace(place, fallbackLabel = '') {
  const label = text(place?.label || fallbackLabel);
  const street = text(place?.adressetekst) || label;
  return {
    street,
    postalCode: text(place?.postnummer),
    placeName: text(place?.poststed),
    place: label || street,
  };
}

/** Til-feltet. Uten registrert adresse brukes prosjektnavnet, så stedet kan geokodes. */
export function projectDestinationSuggestion(project, sources = {}) {
  return projectAddressLabel(project, sources) || text(project?.name);
}

/**
 * Gate, postnummer og poststed fra bedriften.
 * `forretning` (Brreg) brukes når den finnes, ellers addressLabel eller flate felt.
 */
export function companyAddressParts(company) {
  if (!company) return null;
  const travel = company.kjoeradresse && typeof company.kjoeradresse === 'object' ? company.kjoeradresse : {};
  const business = company.forretning && typeof company.forretning === 'object' ? company.forretning : {};
  let street = stripFloorPhrase(travel.gate || travel.adresse || '');
  let postnummer = text(travel.postnummer);
  let poststed = text(travel.poststed);
  const overridden = !!street;
  if (!street) {
    const lines = (Array.isArray(business.lines) ? business.lines : [])
      .map((line) => stripFloorPhrase(line))
      .filter(Boolean);
    street = lines.join(', ') || stripFloorPhrase(company.adresse);
    if (!postnummer) postnummer = text(business.postnummer) || text(company.postnummer);
    if (!poststed) poststed = text(business.poststed) || text(company.poststed);
  }
  const stored = stripFloorPhrase(text(company.addressLabel) || text(business.label));
  if (!overridden && stored && (!street || !postnummer)) {
    const parsed = parseNorwegianAddressQuery(stored);
    if (!street && parsed.adressenavn) {
      const number = parsed.nummer != null ? `${parsed.nummer}${parsed.bokstav || ''}` : '';
      street = stripFloorPhrase([parsed.adressenavn, number].filter(Boolean).join(' '));
    }
    if (!postnummer) postnummer = parsed.postnummer;
    if (!poststed) poststed = parsed.sted;
  }
  street = stripFloorPhrase(street);
  const label = street && (postnummer || poststed)
    ? joinAddress(street, postnummer, poststed)
    : (stored || [street, postnummer, poststed].filter(Boolean).join(' '));
  if (!label) return null;
  return { street, postnummer, poststed, label };
}

/**
 * Firmaadressen som søketreff når teksten treffer gate, postnummer eller sted.
 * Treffet geokodes når det velges, slik at etasje-tekst ikke blir stående i feltet.
 */
export function companyAddressSearchHit(company, query) {
  const parts = companyAddressParts(company);
  if (!parts?.label) return null;
  const q = text(query).toLowerCase();
  if (q.length < 3) return null;
  const blob = `${parts.street} ${parts.postnummer} ${parts.poststed} ${parts.label}`.toLowerCase();
  if (!blob.includes(q)) return null;
  return {
    placeId: 'company-address',
    label: parts.label,
    adressetekst: parts.street,
    postnummer: parts.postnummer,
    poststed: parts.poststed,
    source: 'company',
  };
}

export function companyAddressLabel(company) {
  return companyAddressParts(company)?.label || '';
}

/** Søketekster som Kartverket kan treffe, mest presise først. */
export function companyAddressQueries(company) {
  const parts = companyAddressParts(company);
  if (!parts) return [];
  const tail = [parts.postnummer, parts.poststed].filter(Boolean).join(' ');
  const queries = [
    parts.street && tail ? `${parts.street}, ${tail}` : '',
    parts.street && parts.postnummer ? `${parts.street} ${parts.postnummer}` : '',
    parts.label,
    parts.street && parts.poststed ? `${parts.street} ${parts.poststed}` : '',
  ];
  const seen = new Set();
  const out = [];
  for (const query of queries) {
    const clean = text(query).replace(/\s+/g, ' ');
    const key = clean.toLowerCase();
    if (clean.length < 3 || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/**
 * Automatisk karttreff bare når søket er en gateadresse og treffet har samme postnummer.
 * Prosjektnavn og stedsnavn uten postnummer brukes ikke som første treff.
 */
export function automaticPlaceHit(query, hits) {
  const parsed = parseNorwegianAddressQuery(text(query));
  const mappable = (parsed.nummer != null && parsed.adressenavn) || !!parsed.postnummer;
  if (!mappable) return null;
  const rows = (hits || []).filter((hit) => (
    Number.isFinite(Number(hit?.lat)) && Number.isFinite(Number(hit?.lng))
  ));
  if (parsed.postnummer) {
    const same = rows.filter((hit) => text(hit.postnummer) === parsed.postnummer);
    if (!same.length) return null;
    if (parsed.adressenavn) {
      const street = parsed.adressenavn.toLowerCase();
      const exact = same.find((hit) => text(hit.adressetekst || hit.label).toLowerCase().startsWith(`${street} `));
      if (exact) return exact;
      const loose = same.find((hit) => text(hit.adressetekst || hit.label).toLowerCase().includes(street));
      if (loose) return loose;
    }
    return same[0];
  }
  const street = parsed.adressenavn.toLowerCase();
  return rows.find((hit) => text(hit.adressetekst || hit.label).toLowerCase().includes(street)) || null;
}

/**
 * Uten søk vises prosjekt der den ansatte har ført timer i samme vindu som timelisten.
 * Medlemskap alene er ikke nok. Søk treffer alle ikke-arkiverte prosjekt, med timeprosjekt først.
 */
export function mileageProjectOptions(state, employeeId, { query = '', today = new Date(), customers, contracts } = {}) {
  const q = text(query).toLowerCase();
  const projects = (state?.projects || []).filter((row) => row?.status !== 'arkivert' && row?.id);
  const range = timesheetActivityRange(today);
  const recent = new Set();
  for (const row of state?.timeEntries || []) {
    if (text(row.employeeId) !== text(employeeId)) continue;
    if (parseHours(row.hours) <= 0) continue;
    const date = text(row.date);
    if (!date || date < range.fromDate || date > range.toDate) continue;
    recent.add(text(row.projectId));
  }
  const ranked = projects.map((project) => ({
    project,
    recent: recent.has(project.id),
    address: projectAddressLabel(project, {
      customers: customers || state?.customers,
      contracts: [...(contracts || []), ...(state?.contracts || [])],
    }),
    label: [project.number ? `#${project.number}` : '', project.name].filter(Boolean).join(' '),
  }));
  const pool = q
    ? ranked.filter((row) => `${row.label} ${row.project.client || ''} ${row.address}`.toLowerCase().includes(q))
    : ranked.filter((row) => row.recent);
  pool.sort((a, b) => (
    Number(b.recent) - Number(a.recent)
    || a.label.localeCompare(b.label, 'nb')
  ));
  return { range, options: pool };
}

/** Kilometerstand når bilen har telling på: startsaldo pluss turer etter startdatoen. */
export function vehicleOdometer(vehicle, trips = []) {
  if (!vehicle?.trackOdometer) return null;
  const since = text(vehicle.odometerSince);
  const id = text(vehicle.id);
  let driven = 0;
  for (const row of trips || []) {
    if (text(row?.vehicleId) !== id) continue;
    if (row?.status === 'rejected') continue;
    const date = text(row?.date);
    if (since && date && date < since) continue;
    driven += Number(row?.km) || 0;
  }
  const start = Math.max(0, Number(vehicle.odometerStart) || 0);
  const drivenKm = Math.round(driven * 10) / 10;
  return {
    start,
    driven: drivenKm,
    current: Math.round((start + drivenKm) * 10) / 10,
    since,
  };
}

export function mileageRate(policies = []) {
  const row = (policies || []).find((item) => item?.id === 'company') || (policies || [])[0];
  const rate = Number(row?.ratePerKm);
  if (Number.isFinite(rate) && rate > 0) {
    return { rate: roundMoney(rate), source: 'company', label: 'Selskapssats' };
  }
  return { rate: MILEAGE_RATE_TAX_FREE, source: 'statutory', label: 'Statens regulativ' };
}

export function sumCharges(charges = [], kind) {
  return roundMoney((charges || []).reduce((sum, row) => (
    !kind || row.kind === kind ? sum + (Number(row.amount) || 0) : sum
  ), 0));
}

export function roundTripKm(oneWayKm) {
  const one = Number(oneWayKm);
  if (!Number.isFinite(one) || one <= 0) return 0;
  return roundMoney(one * 2);
}

export function tripCost({
  km = 0, rate = 0, tolls = 0, ferries = 0, parking = 0, charging = 0, other = 0,
} = {}) {
  const distance = Math.max(0, Number(km) || 0);
  const kroner = Math.max(0, Number(rate) || 0);
  const allowance = roundMoney(distance * kroner);
  const extras = roundMoney(
    (Number(tolls) || 0)
    + (Number(ferries) || 0)
    + (Number(parking) || 0)
    + (Number(charging) || 0)
    + (Number(other) || 0),
  );
  return {
    allowance,
    extras,
    amount: roundMoney(allowance + extras),
  };
}
