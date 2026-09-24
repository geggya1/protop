/**
 * Statens vegvesen — tekniske kjøretøydata.
 *
 * Primær kilde (uten API-nøkkel): samme rå-endepunkt som vegvesen.no sin
 * offentlige «Sjekk kjøretøyopplysninger»-side:
 *   https://kjoretoyoppslag.atlas.vegvesen.no/ws/no/vegvesen/kjoretoy/kjoretoyoppslag/v3/oppslag/raw/{kjennemerke}
 *
 * Valgfri fallback med API-nøkkel (enkeltoppslag):
 *   https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata
 *
 * Klienten går via Firebase-callable `lookupVehicleByReg` (CORS tillater ikke
 * direkte kall fra protop.no til atlas.vegvesen.no).
 *
 * Ingen eierinformasjon brukes — kun tekniske data (merke, modell, EU-frist …).
 */

export const VEGVESEN_PUBLIC_RAW_BASE =
  'https://kjoretoyoppslag.atlas.vegvesen.no/ws/no/vegvesen/kjoretoy/kjoretoyoppslag/v3/oppslag/raw';

export const VEGVESEN_KJORETOYDATA_URL =
  'https://www.vegvesen.no/ws/no/vegvesen/kjoretoy/felles/datautlevering/enkeltoppslag/kjoretoydata';

export const VEGVESEN_PUBLIC_LOOKUP_URL =
  'https://www.vegvesen.no/kjoretoy/kjop-og-salg/kjoretoyopplysninger/sjekk-kjoretoyopplysninger/';

export const VEGVESEN_ORDER_API_KEY_URL =
  'https://www.vegvesen.no/fag/teknologi/apne-data/et-utvalg-apne-data/api-for-tekniske-kjoretoyopplysninger/';

const DEFAULT_HEADERS = {
  Accept: 'application/json',
};

function asText(value) {
  if (value == null) return '';
  return String(value).trim();
}

/** Strip mellomrom/bindestrek — «EL 12345» / «el-12345» → «EL12345». */
export function normalizeRegNumber(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9ÆØÅ]/gi, '');
}

/** Visningsformat: bokstaver + mellomrom + sifre når det matcher norsk mønster. */
export function formatRegNumber(value) {
  const raw = normalizeRegNumber(value);
  if (!raw) return '';
  const m = raw.match(/^([A-ZÆØÅ]{1,3})(\d{1,5})$/i);
  if (m) return `${m[1].toUpperCase()} ${m[2]}`;
  return raw;
}

export function isPlausibleRegNumber(value) {
  const raw = normalizeRegNumber(value);
  // Vanlige skilt: 2–3 bokstaver + 2–5 sifre, eller personlig merke (lengre alfanumerisk).
  if (/^[A-ZÆØÅ]{1,3}\d{2,5}$/.test(raw)) return true;
  if (raw.length >= 2 && raw.length <= 7 && /[A-ZÆØÅ]/.test(raw) && /\d/.test(raw)) return true;
  return false;
}

function kodeNavn(obj) {
  if (!obj || typeof obj !== 'object') return asText(obj);
  return asText(obj.kodeNavn || obj.kodeBeskrivelse || obj.kodeVerdi);
}

function firstMerke(generelt = {}) {
  const list = Array.isArray(generelt.merke) ? generelt.merke : [];
  const first = list[0];
  if (!first) return '';
  return asText(typeof first === 'string' ? first : first.merke);
}

function firstHandelsbetegnelse(generelt = {}) {
  const list = Array.isArray(generelt.handelsbetegnelse) ? generelt.handelsbetegnelse : [];
  const first = list[0];
  if (first == null) return '';
  return asText(typeof first === 'string' ? first : first.handelsbetegnelse || first.navn);
}

/** Map SVV drivstoffkode/-navn → interne VEHICLE_FUELS-id-er. */
export function mapFuelType(fuelLabel, { hybrid = false, electricOnly = false } = {}) {
  if (electricOnly) return 'electric';
  if (hybrid) return 'hybrid';
  const s = asText(fuelLabel).toLowerCase();
  if (!s) return '';
  if (/elektr|elbil|battery|hydrogen/.test(s)) return 'electric';
  if (/hybrid|plugin|plug-in|phev/.test(s)) return 'hybrid';
  if (/diesel/.test(s)) return 'diesel';
  if (/bensin|petrol|gasoline|gass|cng|lpg/.test(s)) return 'petrol';
  return 'other';
}

/**
 * Map teknisk kjøretøyklasse (M1, N1, L3e …) → VEHICLE_TYPES-id.
 * @see https://www.vegvesen.no (teknisk kode i Autosys)
 */
export function mapVehicleType(tekniskKode, beskrivelse = '') {
  const kode = asText(tekniskKode).toUpperCase();
  const desc = asText(beskrivelse).toLowerCase();
  if (/^M1/.test(kode) || /personbil/.test(desc)) return 'car';
  if (/^N1/.test(kode) || /varebil|lett lastebil/.test(desc)) return 'van';
  if (/^L3/.test(kode) || /motorsykkel/.test(desc)) return 'motorcycle';
  if (/^L[12]/.test(kode) || /moped/.test(desc)) return 'moped';
  if (/^L[12]e-B|^L2e/.test(kode) || /sparkesykkel|elspark|mikromobilitet/.test(desc)) return 'escooter';
  if (/^O[1-4]/.test(kode) || /tilhenger|trailer/.test(desc)) return 'trailer';
  if (/båt|båt|fartøy/.test(desc)) return 'boat';
  return 'car';
}

function yearFromDate(iso) {
  const s = asText(iso);
  const m = s.match(/^(\d{4})/);
  return m ? m[1] : '';
}

function dateKeyOnly(iso) {
  const s = asText(iso);
  if (!s) return '';
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

function pickFuelLabel(tekniskeData = {}) {
  const groups = tekniskeData?.miljodata?.miljoOgdrivstoffGruppe;
  const list = Array.isArray(groups) ? groups : groups ? [groups] : [];
  for (const g of list) {
    const label = kodeNavn(g?.drivstoffKodeMiljodata);
    if (label) return label;
  }
  const motors = tekniskeData?.motorOgDrivverk?.motor;
  const motorList = Array.isArray(motors) ? motors : motors ? [motors] : [];
  for (const motor of motorList) {
    const fuels = motor?.drivstoff;
    const fuelList = Array.isArray(fuels) ? fuels : fuels ? [fuels] : [];
    for (const f of fuelList) {
      const label = kodeNavn(f?.drivstoffKode);
      if (label) return label;
    }
  }
  return '';
}

/**
 * Normaliser ett kjøretøyobjekt fra SVV-respons til felter som passer Holdings-skjemaet.
 */
export function normalizeKjoretoydata(raw = {}) {
  const id = raw.kjoretoyId || {};
  const teknisk = raw.godkjenning?.tekniskGodkjenning || {};
  const tekniskeData = teknisk.tekniskeData || {};
  const generelt = tekniskeData.generelt || {};
  const klass = teknisk.kjoretoyklassifisering || {};
  const pkk = raw.periodiskKjoretoyKontroll || {};
  const motor = tekniskeData.motorOgDrivverk || {};

  const regRaw = asText(id.kjennemerke)
    || asText(raw.kjennemerke?.kjennemerke)
    || asText(Array.isArray(raw.kjennemerke) ? raw.kjennemerke[0]?.kjennemerke : '');
  const regNumber = normalizeRegNumber(regRaw);
  const make = firstMerke(generelt);
  const model = firstHandelsbetegnelse(generelt) || asText(generelt.typebetegnelse);
  const year = yearFromDate(raw.forstegangsregistrering?.registrertForstegangNorgeDato)
    || yearFromDate(teknisk.gyldigFraDato);
  const fuelLabel = pickFuelLabel(tekniskeData);
  const fuelType = mapFuelType(fuelLabel, {
    hybrid: motor.hybridElektriskKjoretoy === true,
    electricOnly: motor.utelukkendeElektriskDrift === true,
  });
  const tekniskKode = kodeNavn(klass.tekniskKode) || asText(klass.tekniskKode?.kodeVerdi)
    || kodeNavn(generelt.tekniskKode);
  const vehicleType = mapVehicleType(tekniskKode || klass.tekniskKode?.kodeVerdi, klass.beskrivelse);
  const euControlKey = dateKeyOnly(pkk.kontrollfrist);
  const lastEuKey = dateKeyOnly(pkk.sistGodkjent);
  const title = [make, model].filter(Boolean).join(' ') || formatRegNumber(regNumber);

  return {
    source: 'vegvesen.kjoretoydata',
    title,
    make,
    model,
    year,
    regNumber,
    regNumberFormatted: formatRegNumber(regNumber),
    understellsnummer: asText(id.understellsnummer),
    fuelType,
    fuelLabel,
    vehicleType,
    tekniskKode: asText(tekniskKode || klass.tekniskKode?.kodeVerdi),
    klasseBeskrivelse: asText(klass.beskrivelse),
    euControlKey: euControlKey || null,
    lastEuKey: lastEuKey || null,
    registeredInNorwayKey: dateKeyOnly(raw.forstegangsregistrering?.registrertForstegangNorgeDato) || null,
    registrationStatus: kodeNavn(raw.registrering?.registreringsstatus),
    summaryLine: [
      formatRegNumber(regNumber),
      [make, model].filter(Boolean).join(' '),
      year,
      fuelLabel,
    ].filter(Boolean).join(' · '),
    raw,
  };
}

/** Strip eierfelt før data lagres/returneres til klient. */
export function stripOwnerFields(raw = {}) {
  if (!raw || typeof raw !== 'object') return raw;
  const { eierskap, ...rest } = raw;
  return rest;
}

export function normalizeKjoretoyResponse(payload = {}) {
  let list = [];
  if (Array.isArray(payload?.kjoretoydataListe)) {
    list = payload.kjoretoydataListe;
  } else if (payload?.kjoretoy && typeof payload.kjoretoy === 'object') {
    list = [payload.kjoretoy];
  } else if (Array.isArray(payload)) {
    list = payload;
  } else if (payload?.kjoretoyId) {
    list = [payload];
  }
  return {
    results: list.map((row) => normalizeKjoretoydata(stripOwnerFields(row))),
    feilmelding: asText(payload?.feilmelding || payload?.melding) || null,
  };
}

function throwHttpError(res, fallbackNotFound = 'Fant ikke kjøretøy med det registreringsnummeret.') {
  if (res.status === 401 || res.status === 403) {
    const err = new Error('Vegvesen avviste forespørselen.');
    err.code = 'permission-denied';
    err.status = res.status;
    throw err;
  }
  if (res.status === 404 || res.status === 204) {
    const err = new Error(fallbackNotFound);
    err.code = 'not-found';
    err.status = res.status;
    throw err;
  }
  if (res.status === 429) {
    const err = new Error('For mange oppslag mot Vegvesenet — prøv igjen om litt.');
    err.code = 'resource-exhausted';
    err.status = 429;
    throw err;
  }
  const err = new Error(`Vegvesen HTTP ${res.status}`);
  err.code = 'unavailable';
  err.status = res.status;
  throw err;
}

/**
 * Offentlig rå-oppslag (samme som vegvesen.no). Krever ikke API-nøkkel.
 * CORS tillater kun vegvesen.no — bruk fra Cloud Function / Node, ikke direkte i nettleseren.
 */
export async function fetchKjoretoyPublicRaw(regOrVin, { signal } = {}) {
  const q = normalizeRegNumber(regOrVin);
  if (!q) {
    const err = new Error('Oppgi registreringsnummer.');
    err.code = 'invalid-argument';
    throw err;
  }
  const res = await fetch(`${VEGVESEN_PUBLIC_RAW_BASE}/${encodeURIComponent(q)}`, {
    headers: {
      ...DEFAULT_HEADERS,
      // Matcher offentlig nettside — noen gateways forventer Origin.
      Origin: 'https://www.vegvesen.no',
      Referer: VEGVESEN_PUBLIC_LOOKUP_URL,
    },
    signal,
  });
  if (!res.ok) throwHttpError(res);
  const data = await res.json();
  const normalized = normalizeKjoretoyResponse(data);
  if (!normalized.results.length) {
    const err = new Error(normalized.feilmelding || 'Fant ikke kjøretøy med det registreringsnummeret.');
    err.code = 'not-found';
    throw err;
  }
  return normalized.results[0];
}

/**
 * Direkte kall mot Vegvesenet.
 * Prøver offentlig rå-API først; bruker enkeltoppslag med nøkkel som fallback.
 * @param {string} regOrVin - kjennemerke eller understellsnummer
 * @param {{ apiKey?: string, signal?: AbortSignal }} opts
 */
export async function fetchKjoretoyByReg(regOrVin, { apiKey, signal } = {}) {
  const q = normalizeRegNumber(regOrVin);
  if (!q) {
    const err = new Error('Oppgi registreringsnummer.');
    err.code = 'invalid-argument';
    throw err;
  }

  try {
    return await fetchKjoretoyPublicRaw(q, { signal });
  } catch (publicErr) {
    // Ukjent skilt / rate limit: ikke prøv nøkkel-API.
    if (publicErr?.code === 'not-found' || publicErr?.code === 'resource-exhausted') {
      throw publicErr;
    }
    const key = asText(apiKey);
    if (!key) throw publicErr;

    const params = new URLSearchParams();
    if (/^[A-HJ-NPR-Z0-9]{17}$/i.test(q)) params.set('understellsnummer', q);
    else params.set('kjennemerke', q);

    const res = await fetch(`${VEGVESEN_KJORETOYDATA_URL}?${params}`, {
      headers: {
        ...DEFAULT_HEADERS,
        'SVV-Authorization': `Apikey ${key}`,
      },
      signal,
    });
    if (!res.ok) throwHttpError(res);
    const data = await res.json();
    const normalized = normalizeKjoretoyResponse(data);
    if (!normalized.results.length) {
      const err = new Error(normalized.feilmelding || 'Fant ikke kjøretøy med det registreringsnummeret.');
      err.code = 'not-found';
      throw err;
    }
    return normalized.results[0];
  }
}

/** Form-patch fra et normalisert oppslag (bevarer eksisterende notater/logger). */
export function holdingFieldsFromLookup(vehicle, existing = {}) {
  if (!vehicle) return {};
  return {
    title: existing.title?.trim()
      ? existing.title
      : (vehicle.title || existing.title || ''),
    make: vehicle.make || existing.make || '',
    model: vehicle.model || existing.model || '',
    year: vehicle.year || existing.year || '',
    regNumber: vehicle.regNumber || existing.regNumber || '',
    fuelType: vehicle.fuelType || existing.fuelType || 'petrol',
    vehicleType: vehicle.vehicleType || existing.vehicleType || 'car',
    euControlKey: vehicle.euControlKey || existing.euControlKey || '',
    understellsnummer: vehicle.understellsnummer || existing.understellsnummer || '',
    vegvesenSyncedAt: new Date().toISOString(),
  };
}
