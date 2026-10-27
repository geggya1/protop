/**
 * Excel (.xlsx/.xlsm) og CSV → poster i ISO-registrene.
 * En .xlsx/.xlsm er en ZIP med XML. Vi leser verdiene (ikke makroene), så også
 * makrofiler som årshjul og kompetansematrise kan importeres. Rene funksjoner –
 * ingen lagring. Brukes av «Importer fra Excel» på registrene.
 */
import { strFromU8, unzipSync } from 'fflate';
import { parseXml } from './visio.js';
import { createRecord, registerDef, validateRecord } from './registers.js';
import { isoDate, text } from './core.js';

const kids = (node, name) => (node?.children || []).filter((c) => typeof c === 'object' && (!name || c.name === name));
const kid = (node, name) => kids(node, name)[0] || null;

function textOf(node, skip = []) {
  if (!node) return '';
  let out = '';
  for (const c of node.children || []) {
    if (typeof c === 'string') out += c;
    else if (!skip.includes(c.name)) out += textOf(c, skip);
  }
  return out;
}

const norm = (s) => String(s ?? '').toLowerCase()
  .replace(/[æ]/g, 'ae').replace(/[ø]/g, 'o').replace(/[å]/g, 'a')
  .replace(/[^a-z0-9]+/g, ' ').trim();

/* ───────── Les fil ───────── */

function isZip(bytes) {
  return bytes?.[0] === 0x50 && bytes?.[1] === 0x4b;
}

function isOldExcel(bytes) {
  return bytes?.[0] === 0xd0 && bytes?.[1] === 0xcf && bytes?.[2] === 0x11 && bytes?.[3] === 0xe0;
}

/** Kolonnebokstaver → indeks (A = 0). */
export function columnIndex(ref) {
  const letters = (/^[A-Z]+/i.exec(String(ref || '')) || [''])[0].toUpperCase();
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57]);

function isDateFormat(code) {
  const c = String(code || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '').toLowerCase();
  return /[dmy]/.test(c) && !/^general$/.test(c) && !/0\.0|#/.test(c);
}

/** Excel-serienummer → ÅÅÅÅ-MM-DD. */
export function excelDate(serial, date1904 = false) {
  const n = Number(serial);
  if (!Number.isFinite(n) || n <= 0) return '';
  const days = date1904 ? n + 1462 : n;
  const ms = Math.round((days - 25569) * 86400000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

function readXlsx(bytes) {
  const raw = unzipSync(bytes, { filter: (f) => /^(xl\/|\[Content_Types\])/i.test(f.name) && /\.(xml|rels)$/i.test(f.name) });
  const files = {};
  for (const [name, buf] of Object.entries(raw)) files[name.replace(/\\/g, '/')] = strFromU8(buf);
  const wbXml = files['xl/workbook.xml'];
  if (!wbXml) throw new Error('Fant ingen arbeidsbok i filen. Er det en Excel-fil (.xlsx/.xlsm)?');
  const wb = parseXml(wbXml);
  const workbook = kid(wb, 'workbook');
  const date1904 = ['1', 'true'].includes(String(kid(workbook, 'workbookPr')?.attrs?.date1904 || '').toLowerCase());
  const rels = {};
  for (const r of kids(kid(parseXml(files['xl/_rels/workbook.xml.rels'] || ''), 'Relationships'), 'Relationship')) {
    const target = String(r.attrs.Target || '').replace(/^\/?xl\//, '').replace(/^\//, '');
    rels[r.attrs.Id] = `xl/${target}`;
  }
  const shared = kids(kid(parseXml(files['xl/sharedStrings.xml'] || ''), 'sst'), 'si').map((si) => textOf(si, ['rPh', 'phoneticPr']));
  // Stiler: hvilke celler er datoer.
  const styles = kid(parseXml(files['xl/styles.xml'] || ''), 'styleSheet');
  const custom = {};
  for (const f of kids(kid(styles, 'numFmts'), 'numFmt')) custom[Number(f.attrs.numFmtId)] = f.attrs.formatCode;
  const dateStyle = kids(kid(styles, 'cellXfs'), 'xf').map((xf) => {
    const id = Number(xf.attrs.numFmtId || 0);
    return BUILTIN_DATE_FORMATS.has(id) || (custom[id] != null && isDateFormat(custom[id]));
  });

  const sheets = [];
  for (const s of kids(kid(workbook, 'sheets'), 'sheet')) {
    const path = rels[s.attrs.id];
    const xml = path && files[path];
    if (!xml) continue;
    const data = kid(kid(parseXml(xml), 'worksheet'), 'sheetData');
    const rows = [];
    for (const row of kids(data, 'row')) {
      const r = Number(row.attrs.r || rows.length + 1) - 1;
      const cells = [];
      let next = 0;
      for (const c of kids(row, 'c')) {
        const col = c.attrs.r ? columnIndex(c.attrs.r) : next;
        next = col + 1;
        const t = c.attrs.t || 'n';
        const v = textOf(kid(c, 'v'));
        let value = '';
        if (t === 's') value = shared[Number(v)] ?? '';
        else if (t === 'inlineStr') value = textOf(kid(c, 'is'), ['rPh', 'phoneticPr']);
        else if (t === 'b') value = v === '1' ? 'Ja' : 'Nei';
        else if (t === 'e') value = '';
        else if (t === 'str') value = v;
        else if (v !== '' && dateStyle[Number(c.attrs.s || 0)]) value = excelDate(v, date1904);
        else value = v === '' ? '' : String(Number(v) === Math.round(Number(v)) ? Number(v) : Number(Number(v).toPrecision(12)));
        cells[col] = String(value ?? '').replace(/\r\n?/g, '\n').trim();
      }
      for (let i = 0; i < cells.length; i += 1) if (cells[i] == null) cells[i] = '';
      rows[r] = cells;
    }
    for (let i = 0; i < rows.length; i += 1) if (!rows[i]) rows[i] = [];
    sheets.push({ name: s.attrs.name || `Ark ${sheets.length + 1}`, hidden: !!s.attrs.state && s.attrs.state !== 'visible', rows });
  }
  return sheets;
}

/** CSV med ; , eller tabulator. Eksport fra SharePoint-lister og Excel. */
export function parseCsv(input) {
  const src = String(input || '').replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] || '';
  const counts = [';', ',', '\t'].map((d) => [d, first.split(d).length]);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ''; } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows.filter((r, i) => i < rows.length - 1 || r.some(Boolean));
}

/**
 * Les .xlsx, .xlsm eller .csv. Gir { sheets: [{ name, hidden, rows: string[][] }] }.
 * Gamle .xls (før 2007) kan ikke leses: lagre dem som .xlsx først.
 */
export function readSpreadsheet(bytes, fileName = '') {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  if (isZip(data)) return { sheets: readXlsx(data) };
  if (isOldExcel(data)) throw new Error('Dette er en gammel Excel-fil (.xls). Åpne den i Excel og lagre som .xlsx, så kan den importeres.');
  if (/\.(csv|txt|tsv)$/i.test(fileName) || !data.slice(0, 200).some((b) => b === 0)) {
    return { sheets: [{ name: String(fileName || 'CSV').replace(/\.[^.]+$/, ''), hidden: false, rows: parseCsv(strFromU8(data)) }] };
  }
  throw new Error('Filen kan ikke leses. Bruk .xlsx, .xlsm eller .csv.');
}

/* ───────── Overskrifter og kobling til registerfelt ───────── */

/** Første rad som ser ut som overskrifter: flest utfylte tekstceller, og data under. */
export function detectHeaderRow(rows) {
  let best = 0;
  let score = -1;
  const limit = Math.min(rows.length, 25);
  for (let i = 0; i < limit; i += 1) {
    const cells = (rows[i] || []).filter((c) => String(c).trim());
    const textual = cells.filter((c) => !/^[-\d.,\s%]+$/.test(c)).length;
    const below = (rows[i + 1] || []).filter((c) => String(c).trim()).length;
    const s = textual * 2 + (below ? 1 : 0) - (cells.length === 1 ? 3 : 0);
    if (s > score) { score = s; best = i; }
  }
  return best;
}

/** Vanlige kolonnenavn i norske registre, per felt. Supplerer feltets egen etikett. */
const SYNONYMS = {
  title: ['tittel', 'navn', 'beskrivelse', 'uonsket hendelse', 'hendelse', 'risiko', 'aktivitet', 'leverandor', 'firma', 'mal', 'forhold', 'interessent', 'kompetanse', 'tema', 'scenario', 'rolle', 'stilling', 'hva'],
  description: ['beskrivelse', 'arsak', 'arsaker og konsekvenser', 'behov og forventninger', 'forklaring', 'innspill'],
  ownerName: ['eier', 'ansvarlig', 'ansvar', 'risikoeier', 'ansvarlig person'],
  activity: ['aktivitet', 'omrade', 'prosess', 'arbeidsaktivitet'],
  plan: ['tiltak', 'handlingsplan', 'tiltak handlingsplan', 'forebyggende tiltak'],
  controls: ['eksisterende tiltak', 'barrierer', 'kontroll', 'hvordan handteres'],
  inherentL: ['sannsynlighet', 's', 'sanns'],
  inherentC: ['konsekvens', 'k', 'kons'],
  residualL: ['ny sannsynlighet', 'rest sannsynlighet', 'sannsynlighet etter tiltak'],
  residualC: ['ny konsekvens', 'rest konsekvens', 'konsekvens etter tiltak'],
  nextReview: ['neste vurdering', 'revurdering', 'neste gjennomgang', 'frist'],
  deadline: ['frist', 'tidsfrist', 'innen'],
  orgnr: ['org nr', 'organisasjonsnummer', 'orgnr'],
  contactPerson: ['kontaktperson', 'kontakt'],
  email: ['e post', 'epost', 'mail'],
  phone: ['telefon', 'tlf', 'mobil'],
  address: ['adresse'],
  services: ['varer tjenester', 'tjenester', 'produkter', 'leveranse'],
  certificates: ['sertifikater', 'sertifisering', 'miljosertifisering'],
  months: ['maned', 'maneder', 'mnd', 'tidspunkt'],
  frequency: ['hyppighet', 'frekvens', 'intervall'],
  responsibleRole: ['ansvarlig rolle', 'rolle'],
  role: ['rolle', 'stilling', 'funksjon'],
  validityMonths: ['gyldighet', 'gyldig mnd'],
  target: ['maltall', 'mal', 'malverdi'],
  baseline: ['utgangsverdi', 'naverdi', 'start'],
  unit: ['enhet'],
  method: ['malemetode', 'metode', 'datakilde'],
  impact: ['miljopavirkning', 'pavirkning', 'pavirkninger'],
  lifecycle: ['livslop', 'livslopstrinn', 'livsfase'],
  category: ['kategori', 'type', 'gruppe'],
  scope: ['internt eksternt', 'intern ekstern'],
  limit: ['belopsgrense', 'grense', 'vilkar'],
  audience: ['til hvem', 'mottaker', 'malgruppe'],
  when: ['nar', 'hvor ofte', 'tidspunkt'],
  responsible: ['hvem kommuniserer', 'ansvarlig'],
  holders: ['innehaves av', 'innehaver', 'person'],
  responsibilities: ['ansvar', 'ansvarsomrader'],
};

function overlap(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const ta = a.split(' ');
  const tb = b.split(' ');
  const hit = ta.filter((t) => tb.includes(t)).length;
  if (!hit) return (a.length > 3 && b.includes(a)) || (b.length > 3 && a.includes(b)) ? 0.6 : 0;
  // Kolonnen er en del av feltnavnet («Kurs» i «Bevis / kurs»): sterkt treff.
  if (hit === tb.length && tb.length < ta.length) return 0.75;
  return hit / Math.max(ta.length, tb.length);
}

/** Felt som kan importeres fra et regneark (ikke beregnede eller koblede felt). */
export function importableFields(registerKey) {
  const def = registerDef(registerKey);
  return (def?.fields || []).filter((f) => !['refmulti', 'project', 'contacts', 'check'].includes(f.type));
}

/** Foreslår kolonne for hvert felt. Gir { fieldKey: kolonneindeks | -1 }. */
export function suggestMapping(headers, registerKey) {
  const cols = (headers || []).map((h) => norm(h));
  const fields = importableFields(registerKey);
  // Alle par (felt, kolonne) med poeng. Feltets egen etikett teller mest, så synonymene i rekkefølge.
  const pairs = [];
  for (const f of fields) {
    const own = [norm(f.label), norm(f.key)];
    const syn = SYNONYMS[f.key] || [];
    cols.forEach((c, i) => {
      if (!c) return;
      let s = Math.max(...own.map((n) => overlap(n, c)));
      syn.forEach((n, j) => { s = Math.max(s, overlap(n, c) * 0.9 * (1 - j * 0.02)); });
      if (s > 0.5) pairs.push({ key: f.key, col: i, s });
    });
  }
  // Sterkeste treff først; hvert felt og hver kolonne brukes én gang.
  pairs.sort((a, b) => b.s - a.s || a.col - b.col);
  const out = Object.fromEntries(fields.map((f) => [f.key, -1]));
  const used = new Set();
  for (const p of pairs) {
    if (out[p.key] !== -1 || used.has(p.col)) continue;
    out[p.key] = p.col;
    used.add(p.col);
  }
  return out;
}

/* ───────── Verdier ───────── */

function optionFor(field, value) {
  const v = norm(value);
  if (!v) return '';
  const opts = field.options || [];
  const exact = opts.find((o) => norm(o.label) === v || norm(o.id) === v);
  if (exact) return exact.id;
  const starts = opts.find((o) => norm(o.label).startsWith(v) || v.startsWith(norm(o.label)));
  if (starts) return starts.id;
  const partial = opts.find((o) => overlap(norm(o.label), v) >= 0.5);
  return partial ? partial.id : null;
}

function dateValue(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  const iso = isoDate(s);
  if (iso) return iso;
  const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(s);
  if (!m) return null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

function numberValue(value) {
  const s = String(value ?? '').replace(/\s/g, '').replace(',', '.');
  if (!s) return '';
  const n = Number((/-?\d+(\.\d+)?/.exec(s) || [''])[0]);
  return Number.isFinite(n) && /\d/.test(s) ? n : null;
}

/** Koblet post (krav, prosess, rolle …) etter navn, nummer eller kode. */
function refValue(field, s, refs) {
  const list = (refs?.[field.ref] || []).filter((r) => r && r.state !== 'arkivert' && !r.archived);
  const v = norm(s);
  const hit = list.find((r) => [r.title, r.number, r.code, r.id].some((x) => x && norm(x) === v))
    || list.find((r) => r.title && norm(r.title).startsWith(v) && v.length > 3);
  return hit ? { value: hit.id } : { error: `Fant ikke «${s}» i ${field.label}` };
}

/** Celleverdi → feltverdi. Gir { value } eller { error }. refs: { register/prosess/krav: poster } for koblede felt. */
export function fieldValue(field, raw, refs = {}) {
  const s = String(raw ?? '').trim();
  if (!s) return { value: field.type === 'multi' || field.type === 'persons' ? [] : '' };
  switch (field.type) {
    case 'ref':
      return refValue(field, s, refs);
    case 'number':
    case 'scale': {
      const n = numberValue(s);
      return n == null ? { error: `«${s}» er ikke et tall` } : { value: n };
    }
    case 'date': {
      const d = dateValue(s);
      return d == null ? { error: `«${s}» er ikke en dato` } : { value: d };
    }
    case 'select': {
      const id = optionFor(field, s);
      return id == null ? { error: `«${s}» passer ikke med valgene i ${field.label}` } : { value: id };
    }
    case 'multi': {
      const parts = s.split(/[,;/\n]+/).map((x) => x.trim()).filter(Boolean);
      const ids = parts.map((p) => optionFor(field, p)).filter(Boolean);
      return ids.length ? { value: ids } : { error: `«${s}» passer ikke med valgene i ${field.label}` };
    }
    case 'persons':
      return { value: s.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean) };
    default:
      return { value: s };
  }
}

const slug = (s) => norm(s).replace(/\s+/g, '-').slice(0, 60) || 'x';

/** Nøkkel som gjør importen idempotent: samme fil, ark og rad gir samme nøkkel. */
export function rowImportKey(fileName, sheetName, rowIndex) {
  return `xlsx:${slug(String(fileName || '').replace(/\.[^.]+$/, ''))}:${slug(sheetName)}:${rowIndex + 1}`;
}

/**
 * Lag registerposter av arkets rader.
 * mapping: { fieldKey: kolonne | -1 }, defaults: { fieldKey: verdi } for felt som ikke er i arket,
 * groupField: felt som får teksten fra mellomoverskrifter (rader med bare én utfylt celle).
 * Gir rader med status «ny», «finnes» (importert før) eller «feil».
 */
export function planSheetImport({ registerKey, rows, headerRow = 0, mapping = {}, defaults = {}, groupField = '', fileName = '', sheetName = '', existing = [], refs = {} }) {
  const def = registerDef(registerKey);
  if (!def) return { rows: [], counts: { ny: 0, finnes: 0, feil: 0 } };
  const fields = importableFields(registerKey);
  const taken = new Set((existing || []).map((r) => r.importKey).filter(Boolean));
  const mapped = fields.filter((f) => mapping[f.key] >= 0);
  const out = [];
  let group = '';
  for (let i = headerRow + 1; i < (rows || []).length; i += 1) {
    const row = rows[i] || [];
    const filled = row.filter((c) => String(c ?? '').trim());
    if (!filled.length) continue;
    const mappedFilled = mapped.filter((f) => String(row[mapping[f.key]] ?? '').trim());
    // Mellomoverskrift: én celle med tekst, ingen andre koblede verdier.
    if (filled.length === 1 && mappedFilled.length <= 1 && !/^\d/.test(filled[0])) { group = filled[0]; continue; }
    if (!mappedFilled.length) continue;
    const values = {};
    const errors = [];
    for (const f of fields) {
      const col = mapping[f.key];
      let raw = col >= 0 ? row[col] : '';
      if ((raw == null || String(raw).trim() === '') && f.key === groupField && group) raw = group;
      const got = fieldValue(f, raw, refs);
      if (got.error) errors.push(got.error);
      else if (got.value !== '' && !(Array.isArray(got.value) && !got.value.length)) values[f.key] = got.value;
    }
    for (const [k, v] of Object.entries(defaults || {})) {
      if (values[k] == null && v !== '' && v != null) values[k] = v;
    }
    const importKey = rowImportKey(fileName, sheetName, i);
    values.importKey = importKey;
    values.origin = { system: 'Excel', ref: `${fileName} › ${sheetName} rad ${i + 1}`, url: '' };
    errors.push(...validateRecord(registerKey, values));
    const status = taken.has(importKey) ? 'finnes' : (errors.length ? 'feil' : 'ny');
    out.push({ index: i, values, errors, status, label: text(values.title || values.activity || values.personName || filled[0], 120) });
  }
  const counts = { ny: 0, finnes: 0, feil: 0 };
  for (const r of out) counts[r.status] += 1;
  return { rows: out, counts };
}

/** Lag postene for radene med status «ny». Gir { ok, records, events } klare for commitMany. */
export function buildSheetImport(plan, registerKey, { actor, existing = [], riskMethod, now = new Date() } = {}) {
  const records = [];
  const events = [];
  let list = [...(existing || [])];
  for (const row of plan?.rows || []) {
    if (row.status !== 'ny') continue;
    const res = createRecord(registerKey, row.values, { actor, existing: list, now, ...(riskMethod ? { riskMethod } : {}) });
    if (!res.ok) return { ok: false, error: `Rad ${row.index + 1}: ${res.error}` };
    list = [...list, res.record];
    records.push(res.record);
    events.push(...res.events);
  }
  return { ok: true, records, events };
}

