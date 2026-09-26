/**
 * Offentlige opplysninger om en bedrift.
 * Enhetsregisteret, roller, underenheter og siste innsendte årsregnskap.
 */

import { shapeAccountPayload } from './accountSeries.js';

const BRREG = 'https://data.brreg.no/enhetsregisteret/api';
const FULLMAKT = 'https://data.brreg.no/fullmakt/enheter';
const ACCOUNTS = 'https://data.brreg.no/regnskapsregisteret/regnskap';

function text(value) {
  if (value == null) return '';
  return String(value).trim();
}

function codeLabel(node) {
  if (!node) return '';
  if (typeof node === 'string') return text(node);
  return text(node.beskrivelse || node.kode);
}

function addressBlock(addr) {
  if (!addr || typeof addr !== 'object') return null;
  const lines = (Array.isArray(addr.adresse) ? addr.adresse : [addr.adresse])
    .map(text)
    .filter(Boolean);
  const postnummer = text(addr.postnummer);
  const poststed = text(addr.poststed);
  const kommune = text(addr.kommune);
  if (!lines.length && !postnummer && !poststed && !kommune) return null;
  const label = [...lines, [postnummer, poststed].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return {
    lines,
    postnummer,
    poststed,
    kommune,
    kommunenummer: text(addr.kommunenummer),
    land: text(addr.land) || 'Norge',
    label,
  };
}

function industryCodes(raw) {
  const listed = Array.isArray(raw?.naeringskoder) ? raw.naeringskoder : [];
  const rows = ['naeringskode1', 'naeringskode2', 'naeringskode3']
    .map((key) => raw?.[key])
    .concat(listed);
  const seen = new Set();
  return rows
    .filter((row) => row && (row.kode || row.beskrivelse))
    .map((row) => ({ kode: text(row.kode), beskrivelse: text(row.beskrivelse) }))
    .filter((row) => {
      const key = `${row.kode}|${row.beskrivelse}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function shapePublicCompany(raw) {
  if (!raw?.organisasjonsnummer || !raw?.navn) return null;
  const forretning = addressBlock(raw.forretningsadresse);
  const post = addressBlock(raw.postadresse);
  const ansatte = raw.harRegistrertAntallAnsatte === true || Number.isFinite(Number(raw.antallAnsatte))
    ? Number(raw.antallAnsatte)
    : null;
  return {
    organisasjonsnummer: text(raw.organisasjonsnummer),
    navn: text(raw.navn),
    organisasjonsform: codeLabel(raw.organisasjonsform),
    organisasjonsformKode: text(raw.organisasjonsform?.kode),
    stiftelsesdato: text(raw.stiftelsesdato),
    registrert: text(raw.registreringsdatoEnhetsregisteret),
    maalform: text(raw.maalform),
    sektor: codeLabel(raw.institusjonellSektorkode),
    sektorKode: text(raw.institusjonellSektorkode?.kode),
    konsern: raw.erIKonsern === true,
    vedtektsdato: text(raw.vedtektsdato),
    formaal: (raw.vedtektsfestetFormaal || []).map(text).filter(Boolean),
    aktivitet: (raw.aktivitet || []).map(text).filter(Boolean),
    historiskeNavn: (raw.historiskeNavn || []).map((row) => text(row?.navn || row)).filter(Boolean),
    hjemmeside: text(raw.hjemmeside),
    epostadresse: text(raw.epostadresse),
    telefon: text(raw.telefon),
    mobil: text(raw.mobil),
    forretning,
    post: post && post.label !== forretning?.label ? post : null,
    naeringer: industryCodes(raw),
    ansatte: Number.isFinite(ansatte) ? ansatte : null,
    ansatteRegistrert: text(raw.registreringsdatoAntallAnsatteEnhetsregisteret),
    mva: raw.registrertIMvaregisteret === true,
    mvaDato: text(raw.registreringsdatoMerverdiavgiftsregisteret),
    foretak: raw.registrertIForetaksregisteret === true,
    foretakDato: text(raw.registreringsdatoForetaksregisteret),
    stiftelse: raw.registrertIStiftelsesregisteret === true,
    frivillig: raw.registrertIFrivillighetsregisteret === true,
    konkurs: raw.konkurs === true,
    avvikling: raw.underAvvikling === true,
    tvang: raw.underTvangsavviklingEllerTvangsopplosning === true,
    sisteRegnskap: text(raw.sisteInnsendteAarsregnskap),
    kapital: raw.kapital && Number.isFinite(Number(raw.kapital.belop)) ? {
      belop: Number(raw.kapital.belop),
      aksjer: Number(raw.kapital.antallAksjer) || null,
      type: text(raw.kapital.type) || 'Aksjekapital',
      valuta: text(raw.kapital.valuta) || 'NOK',
      innfort: text(raw.kapital.innfortDato),
    } : null,
  };
}

function orgName(enhet) {
  const navn = enhet?.navn;
  if (Array.isArray(navn)) return navn.map((part) => text(part?.navn || part)).filter(Boolean).join(', ');
  return text(navn?.navn || navn);
}

function personName(person) {
  const navn = person?.navn || {};
  return [navn.fornavn, navn.mellomnavn, navn.etternavn].map(text).filter(Boolean).join(' ');
}

export function shapePublicRoles(payload) {
  const rows = [];
  for (const group of payload?.rollegrupper || []) {
    for (const role of group.roller || []) {
      if (role?.fratraadt === true || role?.avregistrert === true) continue;
      const navn = personName(role.person) || orgName(role.enhet);
      if (!navn) continue;
      rows.push({
        gruppe: text(group.type?.beskrivelse) || 'Rolle',
        rolle: text(role.type?.beskrivelse) || text(group.type?.beskrivelse),
        navn,
        orgnr: text(role.enhet?.organisasjonsnummer),
      });
    }
  }
  return rows;
}

export function shapePublicAccounts(payload) {
  return shapeAccountPayload(payload);
}

export function shapePublicSignature(payload) {
  const basis = payload?.signeringsGrunnlag;
  const combos = payload?.signeringsKombinasjon?.kombinasjon;
  if (!basis && !Array.isArray(combos)) return null;
  const seen = new Set();
  const kombinasjoner = (combos || []).map((row) => {
    const personer = (row.personRolleKombinasjon || []).map((person) => ({
      navn: text(person.navn),
      rolle: text(person.rolle?.tekstforklaring),
    })).filter((person) => person.navn);
    return {
      tekst: text(row.tekstforklaring),
      personer,
    };
  }).filter((row) => {
    const key = `${row.tekst}|${row.personer.map((person) => person.navn).join(',')}`;
    if (!row.personer.length || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const fritekst = text(basis?.signaturProkuraRoller?.signaturProkuraFritekst);
  if (!fritekst && !kombinasjoner.length) return null;
  return { fritekst, kombinasjoner };
}

export function shapePublicUnits(payload) {
  return (payload?._embedded?.underenheter || [])
    .map((row) => {
      const adresse = addressBlock(row.beliggenhetsadresse || row.forretningsadresse);
      return {
        organisasjonsnummer: text(row.organisasjonsnummer),
        navn: text(row.navn),
        naering: text(row.naeringskode1?.beskrivelse),
        adresse: adresse?.label || '',
        nedlagt: text(row.nedleggelsesdato),
      };
    })
    .filter((row) => row.organisasjonsnummer && row.navn && !row.nedlagt);
}

export function nbDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return text(value);
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  try {
    return date.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return `${match[3]}.${match[2]}.${match[1]}`;
  }
}

export function nok(value) {
  const amountValue = Number(value);
  if (!Number.isFinite(amountValue)) return '';
  try {
    return new Intl.NumberFormat('nb-NO', {
      style: 'currency',
      currency: 'NOK',
      maximumFractionDigits: 0,
    }).format(amountValue);
  } catch {
    return `${Math.round(amountValue)} kr`;
  }
}

export function registerRows(company) {
  if (!company) return [];
  const rows = [
    company.foretak ? { label: 'Foretaksregisteret', value: nbDate(company.foretakDato) || 'Registrert' } : null,
    company.mva ? { label: 'Merverdiavgift', value: nbDate(company.mvaDato) || 'Registrert' } : null,
    company.stiftelse ? { label: 'Stiftelsesregisteret', value: 'Registrert' } : null,
    company.frivillig ? { label: 'Frivillighetsregisteret', value: 'Registrert' } : null,
    company.konsern ? { label: 'Konsern', value: 'Inngår i konsern' } : null,
    company.konkurs ? { label: 'Konkurs', value: 'Konkurs åpnet' } : null,
    company.avvikling ? { label: 'Avvikling', value: 'Under avvikling' } : null,
    company.tvang ? { label: 'Tvangsavvikling', value: 'Under tvangsavvikling' } : null,
  ];
  return rows.filter(Boolean);
}

/** Gate og sted som kan geokodes. Etasje-linjer er ikke en adresse. */
export function weatherQuery(company) {
  const addr = company?.forretning;
  if (!addr) return '';
  const street = (addr.lines || []).filter((line) => !/etasje/i.test(line)).join(' ');
  return [street, addr.postnummer, addr.poststed].filter(Boolean).join(' ');
}

export function storedCompanyProfile(company) {
  if (!company?.navn) return null;
  const naeringer = company.naeringskode || company.naeringsbeskrivelse
    ? [{ kode: text(company.naeringskode), beskrivelse: text(company.naeringsbeskrivelse) }]
    : [];
  return {
    organisasjonsnummer: text(company.organisasjonsnummer),
    navn: text(company.navn),
    organisasjonsform: text(company.organisasjonsform),
    organisasjonsformKode: '',
    hjemmeside: text(company.hjemmeside),
    epostadresse: text(company.epostadresse),
    telefon: text(company.telefon),
    mobil: '',
    forretning: company.addressLabel ? { label: text(company.addressLabel), lines: [], poststed: '', postnummer: '' } : null,
    post: null,
    naeringer,
    formaal: [],
    aktivitet: [],
    historiskeNavn: [],
    ansatte: null,
    kapital: null,
    konkurs: false,
    avvikling: false,
    tvang: false,
  };
}

async function readJson(url, fetchImpl) {
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const error = new Error(`Registeret svarte ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function fetchPublicCompany(orgnr, { fetchImpl = fetch } = {}) {
  const id = String(orgnr || '').replace(/\D/g, '');
  if (id.length !== 9) return { ok: false, error: 'Organisasjonsnummer må ha 9 siffer.' };
  const enhet = await readJson(`${BRREG}/enheter/${id}`, fetchImpl);
  const company = shapePublicCompany(enhet);
  if (!company) return { ok: false, error: 'Fant ikke organisasjonsnummeret i Enhetsregisteret.' };
  const browser = typeof window !== 'undefined' && fetchImpl === fetch;
  const [roller, units, extras] = await Promise.all([
    readJson(`${BRREG}/enheter/${id}/roller`, fetchImpl).catch(() => null),
    readJson(`${BRREG}/underenheter?overordnetEnhet=${id}&size=50`, fetchImpl).catch(() => null),
    browser
      ? fetch('/api/tender-proxy', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', orgnr: id }),
      }).then((res) => (res.ok ? res.json() : null)).catch(() => null)
      : Promise.all([
        readJson(`${ACCOUNTS}/${id}`, fetchImpl).catch(() => null),
        readJson(`${FULLMAKT}/${id}/signatur`, fetchImpl).catch(() => null),
      ]).then(([accounts, signature]) => ({ accounts, signature })),
  ]);
  const accounts = extras?.accounts || null;
  const signatur = extras?.signature || null;
  return {
    ok: true,
    company,
    roles: shapePublicRoles(roller),
    units: shapePublicUnits(units),
    accounts: shapePublicAccounts(accounts),
    signature: shapePublicSignature(signatur),
    brregUrl: `https://virksomhet.brreg.no/nb/oppslag/enhet/${id}`,
  };
}
