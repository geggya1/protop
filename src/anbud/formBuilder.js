/** Skjemabygger for bedriften: felttyper, rekkefølge og lesing av et dokument. */

export const FIELD_TYPES = [
  { id: 'title', label: 'Seksjon', hint: 'Overskrift uten svarfelt' },
  { id: 'note', label: 'Tekst i dokumentet', hint: 'Fast tekst som ikke skal fylles ut' },
  { id: 'long', label: 'Avsnitt', hint: 'Et lengre svar' },
  { id: 'text', label: 'Kort svar', hint: 'Ett svar på en linje' },
  { id: 'choice', label: 'Flervalg', hint: 'Ett av flere alternativer' },
  { id: 'checks', label: 'Avmerkingsbokser', hint: 'Flere avkrysninger' },
  { id: 'dropdown', label: 'Nedtrekk', hint: 'Velg fra en liste' },
  { id: 'scale', label: 'Lineær skala', hint: 'Et tall på en skala' },
  { id: 'date', label: 'Dato', hint: 'Dato' },
  { id: 'time', label: 'Tid', hint: 'Klokkeslett' },
  { id: 'number', label: 'Tall', hint: 'Beløp eller antall' },
  { id: 'check', label: 'Avkrysning', hint: 'Ja eller nei' },
  { id: 'image', label: 'Bilde', hint: 'Last opp et bilde' },
  { id: 'file', label: 'Fil', hint: 'Last opp et dokument' },
  { id: 'table', label: 'Tabell', hint: 'Rader og kolonner, for eksempel sjekkpunkter' },
  { id: 'sign', label: 'Signatur', hint: 'Signeres digitalt med navn og tid' },
];

export const FIELD_GROUPS = [
  { id: 'dokument', label: 'Dokument', types: ['title', 'note'] },
  { id: 'sporsmal', label: 'Felt', types: ['long', 'text', 'choice', 'checks', 'dropdown', 'scale', 'date', 'time', 'number', 'check', 'image', 'file'] },
  { id: 'tabell', label: 'Tabell og signatur', types: ['table', 'sign'] },
];

export const FIELD_TYPE_IDS = new Set(FIELD_TYPES.map((row) => row.id));
const OPTION_KINDS = new Set(['choice', 'checks', 'dropdown']);
export const MAX_FIELDS = 120;
export const MAX_TEMPLATES = 80;
const NOTE_LABEL_MAX = 4000;
const PLAIN_TEXT_LINES = 400;

/** Kolonnetyper i en tabell. «Fast tekst» står i malen, resten fylles ut. */
export const TABLE_COLUMN_TYPES = [
  { id: 'fixed', label: 'Fast tekst', hint: 'Står i malen, for eksempel sjekkpunktet' },
  { id: 'text', label: 'Tekst', hint: 'Kort svar' },
  { id: 'long', label: 'Avsnitt', hint: 'Lengre svar' },
  { id: 'date', label: 'Dato', hint: 'Dato' },
  { id: 'number', label: 'Tall', hint: 'Beløp eller antall' },
  { id: 'check', label: 'Avkrysning', hint: 'Én boks' },
  { id: 'mark', label: 'Ett av valgene', hint: 'For eksempel J, N eller I' },
];
const COLUMN_TYPE_IDS = new Set(TABLE_COLUMN_TYPES.map((row) => row.id));
const COLUMN_WIDTH = { fixed: 4, text: 3, long: 5, date: 2, number: 2, check: 1, mark: 1 };
export const MAX_TABLE_COLUMNS = 10;
export const MAX_TABLE_ROWS = 80;
const MAX_ADDED_ROWS = 60;
const CELL_MAX = 1200;

/** Dokumentinformasjon som står øverst i KS-maler. */
export const DOC_INFO_FIELDS = [
  { key: 'docId', label: 'Dokument-ID' },
  { key: 'owner', label: 'Dokumenteier' },
  { key: 'version', label: 'Versjon' },
  { key: 'approvedBy', label: 'Godkjent av' },
  { key: 'created', label: 'Opprettet' },
  { key: 'changed', label: 'Sist endret' },
  { key: 'approved', label: 'Godkjent' },
];

function text(value) {
  return String(value || '').trim();
}

/** Tekst mens den skrives: mellomrom og linjeskift står til den lagres. Bare blanke tegn er tomt. */
function typedText(value) {
  const raw = String(value || '');
  return raw.trim() ? raw : '';
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export function fieldType(kind) {
  return FIELD_TYPES.find((row) => row.id === kind) || FIELD_TYPES.find((row) => row.id === 'text');
}

export function isAnswerField(field) {
  const kind = field?.kind;
  return kind !== 'title' && kind !== 'note';
}

function columnWidth(type, raw, options) {
  const fallback = type === 'mark' ? Math.max(1, (options || []).length) : (COLUMN_WIDTH[type] || 3);
  const n = Math.round(Number(raw));
  return Number.isFinite(n) && n >= 1 ? Math.min(8, n) : fallback;
}

export function tableColumn(type = 'text', label = '', extra = {}) {
  const kind = COLUMN_TYPE_IDS.has(type) ? type : 'text';
  const options = kind === 'mark'
    ? (Array.isArray(extra.options) && extra.options.length ? extra.options : ['Ja', 'Nei'])
    : [];
  return {
    id: text(extra.id) || createId('kol'),
    label: text(label) || (TABLE_COLUMN_TYPES.find((row) => row.id === kind)?.label || 'Kolonne'),
    type: kind,
    options,
    width: columnWidth(kind, extra.width, options),
  };
}

export function normalizeColumn(raw) {
  const type = COLUMN_TYPE_IDS.has(raw?.type) ? raw.type : 'text';
  const label = text(raw?.label).slice(0, 60);
  const options = type === 'mark'
    ? [...new Set((Array.isArray(raw?.options) ? raw.options : [])
      .map((row) => text(typeof row === 'string' ? row : row?.label).slice(0, 16))
      .filter(Boolean))].slice(0, 6)
    : [];
  if (type === 'mark' && options.length < 2) return null;
  return {
    id: text(raw?.id).slice(0, 40) || createId('kol'),
    label,
    type,
    options,
    width: columnWidth(type, raw?.width, options),
  };
}

function normalizeRows(input, columns) {
  const rows = Array.isArray(input) ? input : [];
  const keep = new Set((columns || []).filter((col) => col.type !== 'check' && col.type !== 'mark').map((col) => col.id));
  const out = [];
  const seen = new Set();
  for (const row of rows) {
    let id = text(row?.id).slice(0, 40) || createId('rad');
    if (seen.has(id)) id = createId('rad');
    seen.add(id);
    const group = text(row?.group).slice(0, 120);
    if (group) {
      out.push({ id, group });
    } else {
      const cells = {};
      const source = row?.cells && typeof row.cells === 'object' ? row.cells : {};
      for (const [key, value] of Object.entries(source)) {
        if (!keep.has(key)) continue;
        const cell = text(value).slice(0, CELL_MAX);
        if (cell) cells[key] = cell;
      }
      out.push({ id, cells });
    }
    if (out.length >= MAX_TABLE_ROWS) break;
  }
  return out;
}

/** Tabellrad i malen. `cells` er faste tekster, `group` gir en mellomoverskrift. */
export function tableRow(cells = {}, extra = {}) {
  if (typeof cells === 'string') return { id: text(extra.id) || createId('rad'), group: cells };
  return { id: text(extra.id) || createId('rad'), cells: { ...cells } };
}

export function blankTableValue() {
  return { cells: {}, added: [] };
}

function cellValue(type, value) {
  if (type === 'check') return !!value;
  if (type === 'mark') return text(value).slice(0, 16);
  return typedText(value).slice(0, CELL_MAX);
}

function cleanCells(source, typing = false) {
  const out = {};
  const raw = source && typeof source === 'object' ? source : {};
  for (const [key, value] of Object.entries(raw).slice(0, MAX_TABLE_COLUMNS * 2)) {
    const id = text(key).slice(0, 40);
    if (!id) continue;
    if (typeof value === 'boolean') {
      if (value) out[id] = true;
      continue;
    }
    const cell = (typing ? typedText(value) : text(value)).slice(0, CELL_MAX);
    if (cell) out[id] = cell;
  }
  return out;
}

function coerceTable(value, typing = false) {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const cells = {};
  const rows = src.cells && typeof src.cells === 'object' ? src.cells : {};
  for (const [rowId, rowCells] of Object.entries(rows).slice(0, MAX_TABLE_ROWS)) {
    const id = text(rowId).slice(0, 40);
    const clean = cleanCells(rowCells, typing);
    if (id && Object.keys(clean).length) cells[id] = clean;
  }
  const added = (Array.isArray(src.added) ? src.added : []).slice(0, MAX_ADDED_ROWS).map((row) => ({
    id: text(row?.id).slice(0, 40) || createId('rad'),
    cells: cleanCells(row?.cells, typing),
  }));
  return { cells, added };
}

function coerceSign(value) {
  if (!value || typeof value !== 'object') return null;
  const name = text(value.name).slice(0, 120);
  if (!name) return null;
  return {
    name,
    at: text(value.at).slice(0, 40),
    uid: text(value.uid).slice(0, 128),
    place: text(value.place).slice(0, 120),
  };
}

/** Rader slik de vises: radene i malen, deretter radene som er lagt til ved utfylling. */
export function tableRows(field) {
  const value = field?.value && typeof field.value === 'object' ? field.value : blankTableValue();
  const base = (field?.rows || []).map((row) => (row.group
    ? { id: row.id, group: row.group, preset: {}, cells: {}, added: false }
    : { id: row.id, group: '', preset: row.cells || {}, cells: value.cells?.[row.id] || {}, added: false }));
  const extra = (value.added || []).map((row) => ({ id: row.id, group: '', preset: {}, cells: row.cells || {}, added: true }));
  return [...base, ...extra];
}

/** Sett én celle mens den skrives. Returnerer ny verdi; malen endres ikke. */
export function setTableCell(field, rowId, columnId, next) {
  const column = (field?.columns || []).find((col) => col.id === columnId);
  const type = column?.type || 'text';
  const value = coerceTable(field?.value, true);
  const clean = cellValue(type, next);
  const apply = (cells) => {
    const out = { ...(cells || {}) };
    if (clean === '' || clean === false) delete out[columnId];
    else out[columnId] = clean;
    return out;
  };
  const addedIndex = value.added.findIndex((row) => row.id === rowId);
  if (addedIndex >= 0) {
    value.added = value.added.map((row, index) => (index === addedIndex ? { ...row, cells: apply(row.cells) } : row));
    return value;
  }
  const cells = apply(value.cells[rowId]);
  if (Object.keys(cells).length) value.cells = { ...value.cells, [rowId]: cells };
  else {
    const rest = { ...value.cells };
    delete rest[rowId];
    value.cells = rest;
  }
  return value;
}

export function addTableRow(field) {
  const value = coerceTable(field?.value);
  if (value.added.length >= MAX_ADDED_ROWS) return value;
  value.added = [...value.added, { id: createId('rad'), cells: {} }];
  return value;
}

export function removeTableRow(field, rowId) {
  const value = coerceTable(field?.value);
  value.added = value.added.filter((row) => row.id !== rowId);
  return value;
}

/** Celler som skal fylles ut (alt unntatt fast tekst i malens rader). */
function answerColumns(field) {
  return (field?.columns || []).filter((col) => col.type !== 'fixed');
}

export function tableRowFilled(field, row) {
  const cols = answerColumns(field);
  if (row.added) return (field?.columns || []).some((col) => row.cells[col.id] !== undefined && row.cells[col.id] !== '');
  return cols.some((col) => row.cells[col.id] !== undefined && row.cells[col.id] !== '' && row.cells[col.id] !== false);
}

export function tableProgress(field) {
  const rows = tableRows(field).filter((row) => !row.group);
  const filled = rows.filter((row) => tableRowFilled(field, row)).length;
  return { rows: rows.length, filled };
}

/** Har feltet fått et svar? Brukes til gul markering og fremdrift. */
export function answerFilled(field) {
  if (!field || !isAnswerField(field)) return true;
  const value = field.value;
  if (field.kind === 'table') return tableProgress(field).filled > 0;
  if (field.kind === 'sign') return !!value?.name;
  if (field.kind === 'check') return value === true;
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === 'object') return !!(value.name || value.dataUrl);
  return value != null && String(value).trim() !== '';
}

/** Felt som venter på utfylling: ikke låst, og uten svar. */
export function needsInput(field) {
  return isAnswerField(field) && field.editor !== 'fast' && !answerFilled(field);
}

export function formProgress(fields) {
  const open = (Array.isArray(fields) ? fields : []).filter((field) => isAnswerField(field) && field.editor !== 'fast');
  const required = open.filter((field) => field.required);
  const missing = required.filter((field) => !answerFilled(field));
  return {
    total: open.length,
    filled: open.filter((field) => answerFilled(field)).length,
    required: required.length,
    missing: missing.map((field) => field.id),
    ready: missing.length === 0,
  };
}

export function blankDocInfo() {
  return { system: '', docId: '', owner: '', version: '', approvedBy: '', created: '', changed: '', approved: '' };
}

export function normalizeDocInfo(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    system: text(src.system).slice(0, 120),
    docId: text(src.docId).slice(0, 40),
    owner: text(src.owner).slice(0, 60),
    version: text(src.version).slice(0, 20),
    approvedBy: text(src.approvedBy).slice(0, 60),
    created: text(src.created).slice(0, 20),
    changed: text(src.changed).slice(0, 20),
    approved: text(src.approved).slice(0, 20),
  };
}

export function hasDocInfo(doc) {
  const info = normalizeDocInfo(doc);
  return DOC_INFO_FIELDS.some((row) => info[row.key]) || !!info.system;
}

export function blankField(kind = 'text') {
  const id = createId('felt');
  const type = FIELD_TYPE_IDS.has(kind) ? kind : 'text';
  const label = type === 'title' ? 'Ny seksjon' : type === 'note' ? 'Ny tekst' : (type === 'choice' ? 'Spørsmål' : fieldType(type).label);
  const table = type === 'table'
    ? {
      columns: [
        tableColumn('fixed', 'Sjekkpunkt', { id: `${id}_k1` }),
        tableColumn('text', 'Merknad', { id: `${id}_k2` }),
        tableColumn('mark', 'Status', { id: `${id}_k3`, options: ['Ja', 'Nei'] }),
      ],
      rows: [
        tableRow({ [`${id}_k1`]: 'Punkt 1' }, { id: `${id}_r1` }),
        tableRow({ [`${id}_k1`]: 'Punkt 2' }, { id: `${id}_r2` }),
      ],
      allowAdd: true,
      legend: '',
    }
    : { columns: [], rows: [], allowAdd: false, legend: '' };
  return {
    id,
    label,
    kind: type,
    required: false,
    help: '',
    shuffle: false,
    other: false,
    scaleMin: 1,
    scaleMax: 5,
    lowLabel: '',
    highLabel: '',
    placeholder: '',
    width: 'full',
    review: '',
    options: OPTION_KINDS.has(type)
      ? [
        { id: `${id}_a`, label: 'Alternativ 1' },
        { id: `${id}_b`, label: 'Alternativ 2' },
      ]
      : [],
    ...table,
    editor: type === 'title' || type === 'note' ? 'fast' : 'avsender',
    value: emptyAnswer(type),
  };
}

export function blankSettings() {
  return {
    collectEmail: false,
    requireLogin: false,
    allowEdit: false,
    showSummary: false,
    pushAlerts: false,
    emailAlerts: false,
    progress: false,
    shuffleQuestions: false,
    anotherResponse: true,
    // Bedriftens logo brukes i dokumentene med mindre den er slått av på skjemaet.
    useCompanyLogo: true,
    layout: 'brev',
    confirmation: 'Svaret er sendt.',
  };
}

export function blankForm() {
  return {
    id: '',
    title: '',
    category: 'skjema',
    intro: '',
    cover: '',
    doc: blankDocInfo(),
    settings: blankSettings(),
    responses: [],
    fields: [blankField('choice')],
  };
}

export function emptyAnswer(kind) {
  if (kind === 'check') return false;
  if (kind === 'checks') return [];
  if (kind === 'image' || kind === 'file' || kind === 'sign') return null;
  if (kind === 'table') return blankTableValue();
  if (kind === 'scale') return '';
  return '';
}

function cleanImage(value, max = 180000) {
  const raw = text(value);
  if (!raw.startsWith('data:image/') || raw.length > max) return '';
  return raw;
}

function normalizeOptions(input) {
  const rows = Array.isArray(input) ? input : [];
  const out = [];
  for (const row of rows) {
    const label = text(typeof row === 'string' ? row : row?.label).slice(0, 80);
    if (!label) continue;
    const id = text(row?.id).slice(0, 40) || createId('alt');
    out.push({ id, label, image: cleanImage(row?.image) });
    if (out.length >= 12) break;
  }
  return out;
}

/**
 * Svaret i riktig form for felttypen. Med typing (hvert tastetrykk) står mellomrom og
 * linjeskift slik de er skrevet; uten (lagring og innlasting) trimmes teksten.
 */
export function coerceAnswer(kind, value, { typing = false } = {}) {
  const clean = typing ? typedText : text;
  if (kind === 'title' || kind === 'note') return '';
  if (kind === 'table') return coerceTable(value, typing);
  if (kind === 'sign') return coerceSign(value);
  if (kind === 'check') return !!value;
  if (kind === 'scale') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return String(Math.max(0, Math.min(10, Math.round(n))));
  }
  if (kind === 'time') return text(value).slice(0, 8);
  if (kind === 'checks') {
    const list = Array.isArray(value) ? value : [];
    return [...new Set(list.map((row) => clean(row)).filter(Boolean))].slice(0, 12);
  }
  if (kind === 'image' || kind === 'file') {
    if (!value || typeof value !== 'object') return null;
    const name = text(value.name).slice(0, 180);
    const dataUrl = text(value.dataUrl);
    const stored = dataUrl.startsWith('data:') && dataUrl.length <= 700000 ? dataUrl : '';
    if (!name && !stored) return null;
    return {
      name: name || 'Fil',
      mimeType: text(value.mimeType).slice(0, 120),
      dataUrl: stored,
    };
  }
  return clean(value).slice(0, 8000);
}

export function normalizeBuilderField(raw) {
  const kind = FIELD_TYPE_IDS.has(raw?.kind) ? raw.kind : 'text';
  const label = text(raw?.label).slice(0, kind === 'note' ? NOTE_LABEL_MAX : 120);
  const id = text(raw?.id).slice(0, 40) || createId('felt');
  if (!label) return null;
  const staticKind = kind === 'title' || kind === 'note';
  const columns = kind === 'table'
    ? (Array.isArray(raw?.columns) ? raw.columns : []).map(normalizeColumn).filter(Boolean).slice(0, MAX_TABLE_COLUMNS)
    : [];
  const table = kind === 'table'
    ? {
      columns,
      rows: normalizeRows(raw?.rows, columns),
      allowAdd: raw?.allowAdd !== false,
      legend: text(raw?.legend).slice(0, 240),
    }
    : {};
  return {
    id,
    label,
    kind,
    required: staticKind ? false : !!raw?.required,
    help: text(raw?.help).slice(0, 180),
    shuffle: OPTION_KINDS.has(kind) ? !!raw?.shuffle : false,
    other: kind === 'choice' || kind === 'checks' ? !!raw?.other : false,
    scaleMin: 1,
    scaleMax: kind === 'scale' ? Math.max(2, Math.min(10, Number(raw?.scaleMax) || 5)) : 5,
    lowLabel: kind === 'scale' ? text(raw?.lowLabel).slice(0, 40) : '',
    highLabel: kind === 'scale' ? text(raw?.highLabel).slice(0, 40) : '',
    placeholder: staticKind ? '' : text(raw?.placeholder).slice(0, 120),
    width: staticKind || kind === 'table' ? 'full' : (raw?.width === 'half' ? 'half' : 'full'),
    review: text(raw?.review).slice(0, 180),
    editor: staticKind
      ? 'fast'
      : (['fast', 'avsender', 'motpart', 'begge'].includes(raw?.editor) ? raw.editor : 'avsender'),
    options: OPTION_KINDS.has(kind) ? normalizeOptions(raw?.options) : [],
    ...table,
    value: coerceAnswer(kind, raw?.value),
  };
}

export function normalizeSettings(raw) {
  const base = blankSettings();
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    collectEmail: !!src.collectEmail,
    requireLogin: !!src.requireLogin,
    allowEdit: !!src.allowEdit,
    showSummary: !!src.showSummary,
    pushAlerts: !!src.pushAlerts,
    emailAlerts: !!src.emailAlerts,
    progress: !!src.progress,
    shuffleQuestions: !!src.shuffleQuestions,
    anotherResponse: src.anotherResponse !== false,
    useCompanyLogo: src.useCompanyLogo !== false,
    layout: src.layout === 'skjema' ? 'skjema' : 'brev',
    confirmation: text(src.confirmation).slice(0, 280) || base.confirmation,
  };
}

export function cleanCover(value) {
  return cleanImage(value, 500000);
}

export function normalizeResponses(input) {
  const rows = Array.isArray(input) ? input : [];
  const out = [];
  for (const row of rows) {
    const id = text(row?.id).slice(0, 40) || createId('svar');
    const answers = row?.answers && typeof row.answers === 'object' ? row.answers : {};
    const clean = {};
    for (const [key, value] of Object.entries(answers)) {
      const idKey = text(key).slice(0, 40);
      if (!idKey) continue;
      if (typeof value === 'boolean') clean[idKey] = value;
      else if (Array.isArray(value)) clean[idKey] = value.map((item) => text(item).slice(0, 200)).filter(Boolean).slice(0, 12);
      else if (value && typeof value === 'object' && (value.cells || value.added)) clean[idKey] = coerceTable(value);
      else if (value && typeof value === 'object' && value.at) clean[idKey] = coerceSign(value);
      else if (value && typeof value === 'object') clean[idKey] = { name: text(value.name).slice(0, 120) };
      else clean[idKey] = text(value).slice(0, 2000);
    }
    out.push({
      id,
      at: text(row?.at).slice(0, 40),
      email: text(row?.email).slice(0, 120),
      answers: clean,
    });
    if (out.length >= 40) break;
  }
  return out;
}

export function cloneFields(fields) {
  return (Array.isArray(fields) ? fields : []).map((field) => {
    const id = createId('felt');
    return {
      ...field,
      id,
      options: (field.options || []).map((row) => ({ ...row, id: createId('alt') })),
      value: emptyAnswer(field.kind),
    };
  });
}

function optionName(field, id) {
  const raw = String(id || '');
  if (raw.startsWith('other:')) return raw.slice(6) || 'Annet';
  const option = (field.options || []).find((row) => row.id === raw);
  return option ? option.label : raw;
}

function answerText(field, value) {
  if (value == null || value === '') return '';
  if (field.kind === 'table') {
    const filled = tableProgress({ ...field, value }).filled;
    return filled ? `${filled} ${filled === 1 ? 'rad' : 'rader'} utfylt` : '';
  }
  if (field.kind === 'sign') return value?.name ? `Signert av ${text(value.name)}` : '';
  if (field.kind === 'check') return value ? 'Ja' : 'Nei';
  if (Array.isArray(value)) return value.map((id) => optionName(field, id)).filter(Boolean).join('; ');
  if (typeof value === 'object') return text(value.name);
  return optionName(field, value);
}

export function summarizeQuestion(field, responses) {
  const rows = Array.isArray(responses) ? responses : [];
  const values = rows.map((row) => row?.answers?.[field.id]).filter((value) => value !== undefined && value !== '' && value !== null && !(Array.isArray(value) && !value.length));
  if (OPTION_KINDS.has(field.kind) || field.kind === 'check') {
    const counts = field.kind === 'check'
      ? [
        { id: 'ja', label: 'Ja', count: values.filter(Boolean).length },
        { id: 'nei', label: 'Nei', count: values.filter((value) => !value).length },
      ]
      : (field.options || []).map((option) => ({
        id: option.id,
        label: option.label,
        count: values.reduce((sum, value) => {
          if (Array.isArray(value)) return sum + (value.includes(option.id) ? 1 : 0);
          return sum + (value === option.id ? 1 : 0);
        }, 0),
      }));
    if (field.other) {
      const other = values.reduce((sum, value) => {
        const list = Array.isArray(value) ? value : [value];
        return sum + (list.some((item) => String(item).startsWith('other:')) ? 1 : 0);
      }, 0);
      counts.push({ id: 'other', label: 'Annet', count: other });
    }
    return { id: field.id, label: field.label, kind: field.kind, answered: values.length, counts };
  }
  if (field.kind === 'scale') {
    const nums = values.map(Number).filter((n) => Number.isFinite(n));
    const max = field.scaleMax || 5;
    const counts = [];
    for (let n = 1; n <= max; n += 1) {
      counts.push({ id: String(n), label: String(n), count: nums.filter((value) => value === n).length });
    }
    const average = nums.length ? Math.round((nums.reduce((sum, n) => sum + n, 0) / nums.length) * 10) / 10 : 0;
    return { id: field.id, label: field.label, kind: field.kind, answered: nums.length, average, counts };
  }
  const texts = values.map((value) => answerText(field, value)).filter(Boolean).slice(-8);
  return { id: field.id, label: field.label, kind: field.kind, answered: values.length, texts };
}

function csvCell(value) {
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function responsesToCsv(form) {
  const fields = (form?.fields || []).filter((field) => isAnswerField(field));
  const collectEmail = !!form?.settings?.collectEmail;
  const headers = ['Tid', ...(collectEmail ? ['E-post'] : []), ...fields.map((field) => field.label)];
  const lines = [headers];
  for (const row of form?.responses || []) {
    const cells = [row.at || ''];
    if (collectEmail) cells.push(row.email || '');
    for (const field of fields) cells.push(answerText(field, row.answers?.[field.id]));
    lines.push(cells);
  }
  return lines.map((cells) => cells.map(csvCell).join(',')).join('\n');
}

export function starterForm(kind) {
  const base = blankForm();
  if (kind === 'kontakt') {
    return {
      ...base,
      title: 'Kontakt',
      intro: 'Opplysninger vi trenger for å komme i gang.',
      fields: [
        { ...blankField('text'), label: 'Navn' },
        { ...blankField('text'), label: 'E-post' },
        { ...blankField('text'), label: 'Telefon' },
        { ...blankField('long'), label: 'Melding' },
      ],
    };
  }
  if (kind === 'befaring') {
    return {
      ...base,
      title: 'Befaring',
      intro: 'Notater fra befaringen.',
      fields: [
        { ...blankField('date'), label: 'Dato' },
        { ...blankField('time'), label: 'Tidspunkt' },
        { ...blankField('text'), label: 'Adresse' },
        { ...blankField('choice'), label: 'Tilstand', options: [{ id: 'god', label: 'God' }, { id: 'merknad', label: 'Merknad' }] },
        { ...blankField('image'), label: 'Bilde' },
      ],
    };
  }
  return base;
}

export function moveField(fields, from, to) {
  const rows = Array.isArray(fields) ? fields.slice() : [];
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const [item] = rows.splice(from, 1);
  rows.splice(to, 0, item);
  return rows;
}

export function insertField(fields, index, kind) {
  const rows = Array.isArray(fields) ? fields.slice() : [];
  const at = Math.max(0, Math.min(Number(index) || 0, rows.length));
  rows.splice(at, 0, blankField(kind));
  return rows.slice(0, MAX_FIELDS);
}

export function duplicateField(fields, index) {
  const rows = Array.isArray(fields) ? fields.slice() : [];
  const source = rows[index];
  if (!source) return rows;
  const copy = {
    ...source,
    id: createId('felt'),
    label: source.label,
    options: (source.options || []).map((row) => ({ ...row, id: createId('alt') })),
    value: emptyAnswer(source.kind),
  };
  rows.splice(index + 1, 0, copy);
  return rows.slice(0, MAX_FIELDS);
}

export function applyDrag(fields, payload, index) {
  const raw = String(payload || '');
  const rows = Array.isArray(fields) ? fields : [];
  if (raw.startsWith('kind:')) return insertField(rows, index, raw.slice(5));
  if (raw.startsWith('move:')) {
    const target = index >= rows.length ? rows.length - 1 : index;
    return moveField(rows, Number(raw.slice(5)), target);
  }
  return rows;
}

/**
 * Peker over skjemaet → gap-indeks (0 = før første felt).
 * Utenfor lerretet blir det null, så slipp ikke havner i et tekstfelt.
 */
export function insertionIndex(clientX, clientY, fieldRects, canvasRect) {
  const x = Number(clientX);
  const y = Number(clientY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (canvasRect) {
    const left = Number.isFinite(canvasRect.left) ? canvasRect.left : -Infinity;
    const right = Number.isFinite(canvasRect.right) ? canvasRect.right : Infinity;
    if (y < canvasRect.top || y > canvasRect.bottom || x < left || x > right) return null;
  }
  const rects = (Array.isArray(fieldRects) ? fieldRects : []).filter(
    (row) => row && Number.isFinite(row.top) && Number.isFinite(row.height),
  );
  if (!rects.length) return canvasRect ? 0 : null;
  for (let i = 0; i < rects.length; i += 1) {
    const mid = rects[i].top + rects[i].height / 2;
    if (y < mid) return i;
  }
  return rects.length;
}

/**
 * Gap-indeks til indeks applyDrag forventer.
 * Flytt nedover må ett hakk tilbake, fordi feltet tas ut før det settes inn.
 */
export function dragTargetIndex(payload, gapIndex, length) {
  const raw = String(payload || '');
  const gap = Math.max(0, Number(gapIndex) || 0);
  const count = Math.max(0, Number(length) || 0);
  if (!raw.startsWith('move:')) return Math.max(0, Math.min(gap, count));
  const from = Number(raw.slice(5));
  const adjusted = from < gap ? gap - 1 : gap;
  if (!count) return 0;
  return Math.max(0, Math.min(adjusted, count - 1));
}

const CHECK_MARK = /^(?:\[\s*[xX ]?\]|[☐☑☒□■○◯◉]|\(\s*[xX ]?\s*\))\s+(.+)$/;
const BULLET = /^(?:[-*•]|\d+[.)])\s+(.+)$/;
const GENERIC_TITLE = 'Skjema fra dokument';

function foldLabel(value) {
  return text(value).toLocaleLowerCase('nb-NO').replace(/\s+/g, ' ');
}

export function formPrompt() {
  return `Du leser et skjema slik det ser ut på papir, i PDF, som skann eller som bilde.
Du får teksten og selve siden, med bokser, streker, avkrysninger, logo og kolonner.
Returner KUN gyldig JSON:
{
  "title": "navnet på skjemaet",
  "intro": "én setning om hva skjemaet brukes til, eller tom streng",
  "designNote": "én setning om oppsettet, for eksempel to kolonner og logo øverst",
  "fields": [
    {
      "label": "teksten som står ved feltet",
      "kind": "title|note|text|long|date|time|number|scale|check|choice|checks|dropdown|image|file",
      "required": false,
      "help": "hjelpetekst under feltet, eller tom streng",
      "placeholder": "grå tekst inne i feltet, eller tom streng",
      "value": "utfylt verdi som allerede står i malen, eller tom streng",
      "options": ["bare for choice, checks og dropdown"],
      "scaleMax": 5,
      "lowLabel": "",
      "highLabel": "",
      "width": "full|half",
      "review": "tom streng, eller en kort grunn til at feltet bør ses over"
    }
  ]
}
Slik kjenner du igjen felt:
- title er en overskrift eller seksjon som ikke skal fylles ut.
- note er fast tekst som skal stå i dokumentet og ikke fylles ut: brevhode, dokument-id, org.nr, sidefot, lovtekst eller en hel setning. Hele teksten ligger i label.
- text er én linje, en understrek eller en liten boks.
- long er en stor tekstboks eller flere linjer.
- date er et datofelt, også når det står dd.mm.åååå.
- time er et klokkeslett.
- number er beløp, antall, mål eller prosent.
- scale er en tallrekke eller en vurdering fra–til.
- check er én avkrysning eller ja/nei.
- choice er ett av flere runde valg.
- checks er flere firkantede avkrysninger.
- dropdown er en liste med pil eller «velg».
- image er foto, skisse, signatur som skal tegnes, eller et bildefelt.
- file er et vedlegg.
- width er half når to felt står ved siden av hverandre. Ellers full.
- required er true når feltet har stjerne eller «må fylles ut».
- review fylles når typen er usikker, teksten er kuttet, alternativene mangler, eller et bilde i skjemaet ikke kan gjenskapes som felt.
- value fylles når malen allerede har en konkret verdi (navn, org.nr, beløp, ferdig tekst). Tom streng når feltet bare har strek eller [klamme].
Utfyllingsfelter som er listet opp, er fasit for type. Bruk etiketten som står ved feltet, ikke interne navn som Text1.
Brevhode, dokumentnavn, dokument-id, org.nr, nettadresse, utskriftstid og sidefot er note, ikke utfyllingsfelt.
Tekst i klammer, som [Skriv inn prosjektnavn] eller [Dato], er placeholder. Etiketten er ordene foran klammen.
Felt som spør om prosent, beløp eller antall er number, også når en nabokolonne har [Dato].
Hold separate skjemafelter adskilt: Eksternt PO.nr og Oppdragsnummer; Postnr og Sted; Gnr/Bnr og Opprettet dato; Oppstart, Sluttdato og Engasjementsbehov; Epost og Telefon nr; Tabell og Start indeks; Avtalt honorarpris; Merknad, Po og EHF under faktura.
Når malen har en ferdig verdi (Consult1 AS, 916 538 804, 1350,- eks mva., 09525, Sandnes), legg den i value og behold etiketten ren (f.eks. Oppdragstaker / Organisasjons nr).
«Sett inn …» / «Skriv inn …» og stubber som Adresse, Postnr., Sted er placeholder, ikke value.
To signaturfelt (oppdragsgiver og Consult1) skal være image. Signeringssted og -dato på hver side er egne felt.
Flere avkrysninger på samme linje, som ☐ EPOST ☐ EHF ☐ POST, er ett checks-felt.
Avsnitt som er brutt over flere linjer i PDF-en (standardvilkår, lovtekst, bokstaverte punkter a)–h)) skal bli ÉN note per avsnitt med hele teksten i label. Ikke ett felt per linje.
Gjentatte sidehoder på side 2 og senere skal ikke gjentas. Ta med hele siste side til slutten — ikke kutt midt i en setning.
Ikke finn opp felter som ikke står i dokumentet. Ta med feltene i alle kolonner, og behold rekkefølgen fra dokumentet. Maks 120 felt.`;
}

/** Internt PDF-navn som Text1 eller Check Box 2 er ikke en etikett. */
export function technicalFieldName(label) {
  const value = text(label);
  if (!value) return true;
  if (/^(text|check|checkbox|radio|button|field|felt|signature|sig|undefined)(\s+box)?\s*\d*$/i.test(value)) return true;
  if (/^[A-Za-z]{1,16}\d{1,3}$/.test(value)) return true;
  return false;
}

export function fieldFromWidget(ann, pageWidth = 0) {
  const src = ann && typeof ann === 'object' ? ann : {};
  const rawName = text(src.fieldName || src.alternativeText || src.label);
  const rect = Array.isArray(src.rect) ? src.rect : [];
  const boxWidth = Math.abs(Number(rect[2] || 0) - Number(rect[0] || 0));
  const boxHeight = Math.abs(Number(rect[3] || 0) - Number(rect[1] || 0));
  const page = Number(pageWidth) || 0;
  const type = text(src.fieldType);
  if (src.readOnly && type === 'Tx') return null;
  let kind = 'text';
  if (type === 'Btn') kind = src.radioButton ? 'choice' : 'check';
  else if (type === 'Ch') kind = src.combo ? 'dropdown' : 'choice';
  else if (type === 'Sig' || /signatur|underskrift/i.test(rawName)) kind = 'image';
  else if (src.multiLine || boxHeight > 40) kind = 'long';
  else if (/dato|frist/i.test(rawName)) kind = 'date';
  else if (/\btid\b|klokke/i.test(rawName)) kind = 'time';
  const options = (Array.isArray(src.options) ? src.options : []).map((row) => (
    text(typeof row === 'string' ? row : (row?.displayValue || row?.exportValue))
  )).filter(Boolean);
  const named = !technicalFieldName(rawName);
  if (!named && !options.length && kind === 'text') {
    return {
      label: 'Felt uten etikett',
      kind,
      required: !!src.required,
      help: '',
      placeholder: '',
      options: [],
      width: page > 0 && boxWidth > 0 && boxWidth < page * 0.48 ? 'half' : 'full',
      review: 'PDF-feltet har ikke et lesbart navn. Gi det etiketten som står ved siden av.',
      scaleMax: 5,
      lowLabel: '',
      highLabel: '',
    };
  }
  return {
    label: (named ? rawName : (kind === 'check' ? 'Avkrysning' : 'Felt')).slice(0, 120),
    kind: options.length && kind === 'text' ? 'dropdown' : kind,
    required: !!src.required,
    help: '',
    placeholder: '',
    options,
    width: page > 0 && boxWidth > 0 && boxWidth < page * 0.48 ? 'half' : 'full',
    review: named ? '' : 'PDF-feltet har ikke et lesbart navn. Gi det etiketten som står ved siden av.',
    scaleMax: 5,
    lowLabel: '',
    highLabel: '',
  };
}

export function formFromWidgets(widgets, pageWidth = 0) {
  const groups = new Map();
  const fields = [];
  for (const ann of (Array.isArray(widgets) ? widgets : [])) {
    const made = fieldFromWidget(ann, pageWidth);
    if (!made) continue;
    const key = text(ann?.fieldName);
    const radio = made.kind === 'choice' && (ann?.radioButton || ann?.fieldType === 'Btn');
    if (radio && key) {
      const option = text(ann?.buttonValue || ann?.exportValue);
      const existing = groups.get(key);
      if (existing) {
        if (option && !existing.options.some((row) => foldLabel(row) === foldLabel(option))) existing.options.push(option);
        continue;
      }
      const field = { ...made, kind: 'choice', options: option ? [option] : made.options };
      groups.set(key, field);
      fields.push(field);
      continue;
    }
    fields.push(made);
  }
  return formFromScan({ title: '', fields });
}

function kindFromLabel(label, raw = '') {
  const source = `${label} ${raw}`;
  const shortLabel = String(label || '').trim().length < 60;
  if (/signatur|underskrift/i.test(source)) return 'image';
  if (/klokken|tidspunkt|\bkl\b/i.test(label) || (/^(tid|klokkeslett)\b/i.test(label) && !/periode|frist|medgått/i.test(label))) return 'time';
  if (/skala|fra 1 til|svært (uenig|enig)/i.test(source)) return 'scale';
  // Prosent/beløp bare for korte feltnavn — ikke hele setninger med «10 %» i lovtekst.
  if (shortLabel && (/\b(beløp|antall|pris|kr|m2|kvm|prosent|påslag)\b|%/i.test(label) || /\bsum\b/i.test(label))) return 'number';
  if (/dato|frist|gyldig til|dd\.mm/i.test(source)) return 'date';
  if (/bilde|foto|skisse|lim inn/i.test(label)) return 'image';
  if (/vedlegg|last opp|dokumentasjon/i.test(label)) return 'file';
  if (/ja\s*\/\s*nei|kryss av|\bbekreft\b|avkrys/i.test(label)) return 'check';
  if (/_{20,}/.test(raw) || String(label || '').length > 80) return 'long';
  return 'text';
}

function isHeading(line) {
  const value = String(line || '').trim();
  if (!value || value.includes(':') || value.length >= 60) return false;
  if (/^#{1,3}\s+\S/.test(value)) return true;
  return value === value.toUpperCase() && /[A-ZÆØÅ]/.test(value);
}

function chromeLine(line) {
  const value = String(line || '').trim();
  if (!value || value.length > 220 || /\[[^\]]+\]/.test(value) || CHECK_MARK.test(value) || BULLET.test(value)) return false;
  return /dokument\s*(navn|id)|dokumenteier|godkjent av|sentralbord|utskriftstidspunkt|sidetall|\bwww\.|org\.\s*\d{3}|ledelsessystem/i.test(value);
}

function sectionLine(line) {
  const value = String(line || '').trim();
  if (!value || value.length >= 48 || /[:[\]]/.test(value) || CHECK_MARK.test(value) || BULLET.test(value)) return false;
  if (isHeading(value)) return true;
  if (/^underskrifter$/i.test(value) || /bestemmelser$/i.test(value)) return true;
  if (kindFromLabel(value, value) !== 'text') return false;
  return /^(om|vedlegg|del|kapittel)\s+\S/i.test(value);
}

function endsSentence(line) {
  const value = String(line || '').trim();
  if (!value) return false;
  if (/\bpkt\.\s*$/i.test(value) || /\bbl\.?\s*$/i.test(value) || /\bm\.fl\.\s*$/i.test(value)) return false;
  if (/\b(nr|tlf|org|pr|jf|inkl|eks|ca|kl)\.\s*$/i.test(value)) return false;
  if (/\d+\.\s*$/.test(value)) return false;
  return /[.!?…"»)]$/.test(value);
}

function proseLine(line) {
  const value = String(line || '').trim();
  if (value.length < 55 || /\[[^\]]+\]/.test(value) || CHECK_MARK.test(value)) return false;
  if (letteredHeading(value)) return false;
  if (letteredListItem(value) || BULLET.test(value)) return true;
  if (endsSentence(value) || value.length > 120) return true;
  // PDF-brutte setninger (slutter på «pkt.» / «ved» / «har») skal bli note, ikke kort felt.
  if (value.length >= 70 && !/^(Post|Sted|Epost|Telefon|Tabell|Oppdrag|Att|Po|EHF|Merknad|Gnr)\b/i.test(value)) {
    return !/:\s*$/.test(value) || value.indexOf(':') > 50;
  }
  return false;
}

/** Hovedpunkter i vilkår, typisk «a) Kommunikasjon (NS 8403 …)». */
function letteredHeading(line) {
  const value = String(line || '').trim();
  if (!/^[a-h]\)\s+\S/i.test(value) || /\[[^\]]+\]/.test(value) || value.length >= 120) return false;
  return /\(NS\s*\d+/i.test(value) || /\bpkt\./i.test(value);
}

/** Underpunkter i en liste, typisk «a) Faktura fra entreprenører…». */
function letteredListItem(line) {
  const value = String(line || '').trim();
  return /^[a-h]\)\s+\S/i.test(value) && !letteredHeading(value) && !/\[[^\]]+\]/.test(value);
}

function plainTitle(line) {
  const value = String(line || '').trim();
  if (!value || value.length >= 40 || /[:[\]]/.test(value) || CHECK_MARK.test(value) || BULLET.test(value)) return false;
  if (kindFromLabel(value, value) !== 'text') return false;
  return value.split(/\s+/).length <= 4;
}

function looksLikeFieldLine(line) {
  const value = String(line || '').trim();
  if (!value) return true;
  if (/\[[^\]]+\]/.test(value) || CHECK_MARK.test(value) || BULLET.test(value)) return true;
  if (chromeLine(value) || sectionLine(value) || isHeading(value) || letteredHeading(value)) return true;
  // Kolon markerer skjemafelt bare på korte linjer — ikke lovtekst med «pkt. 5.2/8.2: …».
  if (value.length <= 100 && (/:\s*$/.test(value) || /^[^:]{2,55}:\s+\S/.test(value))) return true;
  if (/^[A-ZÆØÅ][^:]{1,55}:\s*\S/.test(value) && value.length < 110) return true;
  if (value.length <= 80 && /\b(gnr|bnr|post\s*nr|oppstart|sluttdato|telefon\s*nr|organisasjons\s*nr|start\s*indeks|honorar\s*pris)\b/i.test(value)) {
    return true;
  }
  return false;
}

/** PDF bryter ofte avsnitt midt i setningen. Lim dem sammen før feltlesing. */
function shouldJoinLines(prev, next) {
  const left = String(prev || '').trim();
  const right = String(next || '').trim();
  if (!left || !right) return false;
  if (letteredHeading(right) || sectionLine(right) || chromeLine(right) || isHeading(right)) return false;
  if (chromeLine(left) || sectionLine(left) || isHeading(left) || letteredHeading(left)) return false;
  if (looksLikeFieldLine(left) || looksLikeFieldLine(right)) return false;
  if (/\[[^\]]+\]/.test(left) || CHECK_MARK.test(left)) return false;
  if (BULLET.test(left)) return /^[a-zæøå(,;:]/.test(right) && !BULLET.test(right);
  if (letteredListItem(right)) return !endsSentence(left) || letteredListItem(left) || proseLine(left);
  if (/^[a-zæøå(,;:]/.test(right) || /^\d+[.)]\s/.test(right)) return true;
  if (!endsSentence(left) && right.length < 95 && !plainTitle(right)) {
    return left.length >= 24 || proseLine(left) || letteredListItem(left);
  }
  return false;
}

function joinWrappedLines(lines) {
  const out = [];
  for (const line of (Array.isArray(lines) ? lines : [])) {
    const value = String(line || '').trim();
    if (!value) continue;
    const prev = out[out.length - 1];
    if (prev && shouldJoinLines(prev, value)) {
      out[out.length - 1] = `${prev} ${value}`.replace(/\s+/g, ' ').trim();
    } else {
      out.push(value);
    }
  }
  return out;
}

function isTemplateStub(value) {
  return /^(adresse|postnr\.?|sted|firma|kontaktperson|dato|oppdragsnr\.?|po|ehf|epost|telefon(\s*nr)?|att|merknad)\.?$/i.test(text(value));
}

function isInstructionStub(value) {
  return /^(sett inn|skriv inn|fyll inn|angi|lim inn)\b/i.test(text(value));
}

/** Etikett + ferdig verdi i malen, uten [klamme]. */
function filledFromLine(raw, width = 'full') {
  const line = String(raw || '').trim();
  if (!line || CHECK_MARK.test(line) || BULLET.test(line)) return null;
  if (chromeLine(line) || sectionLine(line) || letteredHeading(line) || proseLine(line)) return null;
  // Lang linje med kolon midt i setningen er lovtekst, ikke «etikett: verdi».
  const firstColon = line.indexOf(':');
  if (firstColon > 55 || (firstColon > 0 && line.length > 110 && !/^(Tabell|Post|Sted|Epost|Oppdrag|Att|Merknad|Po|EHF|Organisasjons|Telefon|Start|Avtalt)\b/i.test(line))) {
    return null;
  }
  const bracket = line.match(/^(.+?)\s*\[([^[\]]{1,80})\]\s*$/);
  if (bracket && !bracket[1].includes(':')) {
    const before = text(bracket[1]);
    const spaced = before.match(/^((?:Avtalte honorar|Tildelt ressurs|Særlige bestemmelser|Oppdragstaker|Avtalt honorar pris))\s+(.+)$/i);
    if (spaced) return makeAnswerField(spaced[1], spaced[2], bracket[2], width, line);
    const label = stripDecor(before).slice(0, 120);
    if (!label) return null;
    return makeAnswerField(label, '', bracket[2], width, line);
  }
  const colon = line.match(/^([^:]{2,70}?):\s*(.*)$/);
  if (!colon) {
    const spaced = line.match(/^((?:Oppdragstaker|Oppdragsleder|Tildelt ressurs|Oppdragsgiver|Kontakt person|Avtalte honorar|Avtalt honorar pris|Generelle bestemmelser|Betalingsbetingelser|Særlige bestemmelser|Varsel\/kommunikasjon|Biomkostninger|Oppdragssted\s+Adresse|Gnr\s*\/\s*Bnr|Opprettet\s+dato|Beskrivelse av oppdraget|Angivelse av hvilke kontroller[^]*?for\.?))\s+(.+)$/i);
    if (!spaced) return null;
    const field = makeAnswerField(spaced[1], spaced[2], '', width, line);
    if (field && /beskrivelse|angivelse/i.test(spaced[1]) && isInstructionStub(spaced[2]) === false && spaced[2].length > 40) {
      field.kind = 'long';
      field.placeholder = spaced[2].slice(0, 120);
      field.value = '';
    }
    return field;
  }
  let label = text(colon[1]).replace(/[:：]\s*$/, '').slice(0, 120);
  let value = text(colon[2]).slice(0, 8000);
  let placeholder = placeholderOf(line);
  if (!label) return null;
  // «ansvarsbegrensningene … 5.2/8.2: Consult1 …» er lovtekst, ikke skjemafelt.
  if (/^[a-zæøå]/.test(label) || (label.length > 50 && /pkt\.|NS\s*\d+/i.test(label))) return null;
  const nsKeep = label.match(/^(Generelle bestemmelser)\s+(NS\s*\d+.*)$/i);
  if (nsKeep) {
    label = nsKeep[1];
    value = text([nsKeep[2], value].filter(Boolean).join(' : '));
  }
  const bracketInValue = value.match(/^(.*?)\[([^[\]]{1,80})\]\s*$/);
  if (bracketInValue) {
    const before = text(bracketInValue[1]);
    const bracket = text(bracketInValue[2]);
    if (before && /\bprosent\b|%/i.test(before)) {
      label = `${label} ${before}`.replace(/\s+/g, ' ').slice(0, 120);
      value = '';
      placeholder = /^dato$/i.test(bracket) ? '' : bracket;
    } else if (!before) {
      value = '';
      placeholder = bracket;
    } else if (isTemplateStub(before) || isInstructionStub(before)) {
      value = '';
      placeholder = before;
    }
  }
  if (!value) return makeAnswerField(label, '', placeholder, width, line);
  if (/^(epost|telefon(\s*nr)?|adresse|post(\s*nr)?|att|org(anisasjon)?(\s*nr)?|dato|sted|po|ehf|tabell|start\s*indeks)\b\.?$/i.test(value)) {
    return makeAnswerField(label, '', value, width, line);
  }
  if (foldLabel(label) === foldLabel(value) || isTemplateStub(value)) {
    return makeAnswerField(label, '', value, width, line);
  }
  if (isInstructionStub(value)) {
    return makeAnswerField(label, '', value, width, line);
  }
  return makeAnswerField(label, value, placeholder, width, line);
}

function makeAnswerField(labelRaw, valueRaw, placeholderRaw, width, source) {
  const label = stripDecor(labelRaw).slice(0, 120);
  if (!label) return null;
  let kind = kindFromLabel(label, source || label);
  if (/\bprosent\b|%/i.test(label) && kind === 'date') kind = 'number';
  const placeholder = text(placeholderRaw).replace(/^\[|\]$/g, '').slice(0, 120);
  let value = text(valueRaw).slice(0, 8000);
  if (isTemplateStub(value) || isInstructionStub(value)) {
    return {
      ...blankField(kind),
      label,
      width,
      placeholder: placeholder || value,
      value: emptyAnswer(kind),
    };
  }
  if (/^sted$/i.test(label) && value && !/^\d/.test(value) && !isTemplateStub(value)) {
    kind = 'text';
  }
  if (kind === 'date' && value && !/\d/.test(value)) {
    return { ...blankField('date'), label, width, placeholder: placeholder || value || 'Dato' };
  }
  if (kind === 'number' && placeholder && /^dato$/i.test(placeholder) && !value) {
    return { ...blankField('number'), label, width, placeholder: '' };
  }
  const useKind = kind === 'long' && value && value.length < 160 ? 'text' : kind;
  return {
    ...blankField(useKind),
    label,
    width,
    value: value ? coerceAnswer(useKind, value) : emptyAnswer(useKind),
    placeholder: value ? '' : (placeholder || (useKind === 'date' ? 'Dato' : '')),
    review: /signatur|underskrift/i.test(label)
      ? 'Signaturfelt. Behold bilde hvis det skal tegnes, eller bytt til kort svar hvis navnet skrives.'
      : '',
  };
}

function checksFromBoxes(line) {
  const marks = [...String(line || '').matchAll(/[☐☑☒□■]\s*([^☐☑☒□■]+)/g)];
  if (marks.length < 2) return null;
  const at = String(line).search(/[☐☑☒□■]/);
  const label = stripDecor(String(line).slice(0, at)).slice(0, 120) || 'Valg';
  const field = { ...blankField('checks'), label, options: [] };
  for (const mark of marks) addOption(field, mark[1], 'checks');
  return field.options.length >= 2 ? field : null;
}

/** Del skjemalinjer med flere etiketter på samme rad (PDF-kolonner). */
const ROW_SPLIT = new RegExp(
  [
    '(?=',
    [
      'Eksternt\\s+PO\\.?\\s*nr',
      'Oppdrags\\s+nummer',
      'Post\\s+nr\\.?',
      'Gnr\\s*/\\s*Bnr',
      'Opprettet\\s+dato',
      'Oppstart\\s*:',
      'Sluttdato\\s*:',
      'Engasjement\\s+behov',
      'Organisasjons\\s+nr',
      'Telefon\\s+nr',
      'Att\\s*:',
      '(?<![A-Za-zÆØÅæøå])Po\\s*:',
      '(?<![A-Za-zÆØÅæøå])EHF\\s*:',
      'Tabell\\s*:',
      'Start\\s+indeks',
      'Avtalt\\s+honorar\\s+pris',
      'Påslagsprosent',
      'Epost\\s*:',
      '(?<![A-Za-zÆØÅæøå])Sted\\s*:',
      '(?<=:\\s*(?:[^:\\[\\]]{1,40}?\\s)?)Dato\\s*:',
    ].join('|'),
    ')',
  ].join(''),
  'i',
);

function splitRowChunks(line) {
  const raw = String(line || '').trim();
  if (!raw) return [];
  const rough = raw.split(ROW_SPLIT).map((part) => part.trim()).filter(Boolean);
  if (rough.length >= 2) return rough;
  // Dobbel mellomrom: bare når begge deler er egne etiketter — ikke «Label:  verdi».
  const spaced = raw.split(/\s{2,}/).map((part) => part.trim()).filter((part) => part && !/^[_·.]{3,}$/.test(part));
  if (
    spaced.length >= 2
    && !spaced.some((part, index) => index < spaced.length - 1 && /:\s*$/.test(part))
    && spaced.every((part) => /:\s*$/.test(part) || /\[[^\]]+\]/.test(part) || /^(Post\s*nr|Sted|Att|Po|EHF|Epost|Telefon)/i.test(part))
  ) {
    return spaced;
  }
  const afterBracket = raw.split(/(?<=\])\s+(?=[A-ZÆØÅ])/).map((part) => part.trim()).filter(Boolean);
  if (afterBracket.length >= 2) return afterBracket;
  return [raw];
}

function explodeBlanks(line) {
  const raw = String(line || '').trim();
  const boxes = raw.match(/[☐☑☒□■]/g) || [];
  if (boxes.length >= 2) {
    const field = checksFromBoxes(raw);
    return field ? [field] : null;
  }
  const chunks = splitRowChunks(raw);
  // Én lang setning (evt. med avsluttende kolon) er vilkårstekst, ikke skjemarad.
  if (chunks.length < 2 && proseLine(raw.replace(/:\s*$/, ''))) return null;
  if (chunks.length < 2 && !/\[[^\]]+\]/.test(raw) && !/:\s/.test(raw) && !/:\s*$/.test(raw) && !/^(Oppdragstaker|Tildelt ressurs|Avtalte honorar|Avtalt honorar pris|Generelle bestemmelser)\b/i.test(raw)) {
    return null;
  }
  const parts = chunks.length >= 2 ? chunks : [raw];
  const width = parts.length >= 2 ? 'half' : 'full';
  const fields = [];
  for (const part of parts) {
    let chunk = part;
    // [Oppdragsnr.] som havnet på adresselinjen hører til oppdragsnummer, ikke adresse.
    const strayNumber = chunk.match(/^(.*?)\[Oppdragsnr\.?\]\s*$/i);
    if (strayNumber && /adresse|oppdragssted/i.test(strayNumber[1])) {
      chunk = strayNumber[1].trim();
    }
    const filled = filledFromLine(chunk, width);
    const field = filled || pushField(chunk, width);
    if (field) fields.push(field);
  }
  return fields.length ? fields : null;
}

function requiredOf(raw) {
  return /\*\s*$/.test(String(raw || '').trim()) || /\bobligatorisk\b/i.test(raw);
}

function placeholderOf(raw) {
  const bracket = String(raw || '').match(/\[([^[\]]{1,80})\]/);
  if (bracket) return text(bracket[1]).slice(0, 120);
  const match = String(raw || '').match(/\((?:f\.eks\.|for eksempel|eks\.|dd\.mm|tt:?mm|åååå)[^)]*\)/i);
  return match ? match[0].slice(1, -1).slice(0, 120) : '';
}

function stripDecor(raw) {
  return text(raw)
    .replace(/^#{1,3}\s+/, '')
    .replace(/\[[^[\]]{1,80}\]/g, ' ')
    .replace(/\((?:f\.eks\.|for eksempel|eks\.)[^)]*\)/gi, '')
    .replace(/[_·.]{3,}/g, ' ')
    .replace(/\s*\*+\s*$/, '')
    .replace(/[:：]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function pushField(raw, width = 'full') {
  const mark = String(raw || '').trim().match(CHECK_MARK);
  const body = mark ? mark[1] : String(raw || '').trim();
  const label = stripDecor(body).slice(0, 120);
  if (!label) return null;
  const radio = /^[○◯◉]/.test(String(raw || '').trim());
  const kind = mark && !radio ? 'check' : kindFromLabel(label, raw);
  const field = {
    ...blankField(kind),
    label,
    required: requiredOf(raw),
    placeholder: placeholderOf(raw),
    width,
    review: /signatur|underskrift/i.test(label)
      ? 'Signaturfelt. Behold bilde hvis det skal tegnes, eller bytt til kort svar hvis navnet skrives.'
      : '',
  };
  if (kind === 'scale') {
    const max = String(raw).match(/(\d+)\s*[-–]\s*(\d+)/);
    if (max) field.scaleMax = Math.max(2, Math.min(10, Number(max[2]) || 5));
    const ends = String(raw).match(/(.{2,30}?)\s+\d\s*[-–]\s*\d\s+(.{2,30})/);
    if (ends) {
      field.lowLabel = stripDecor(ends[1]).slice(0, 40);
      field.highLabel = stripDecor(ends[2]).slice(0, 40);
    }
  }
  return field;
}

function addOption(field, label, kind) {
  const value = stripDecor(label).slice(0, 80);
  if (!value) return;
  if (field.kind === 'text') field.kind = kind;
  if (!Array.isArray(field.options)) field.options = [];
  field.options.push({ id: createId('alt'), label: value });
}

function forceNoteField(field) {
  return {
    ...field,
    kind: 'note',
    label: String(field.label || '').slice(0, NOTE_LABEL_MAX),
    value: '',
    placeholder: '',
    width: 'full',
    required: false,
    editor: 'fast',
  };
}

function shouldForceNote(field) {
  if (!field || field.kind === 'note' || field.kind === 'title' || field.kind === 'checks' || field.kind === 'image' || field.kind === 'file') return false;
  if (field.value || field.placeholder) return false;
  if (letteredListItem(field.label) || BULLET.test(field.label)) return true;
  if (String(field.label || '').length > 80) return true;
  if (/^[a-zæøå]/.test(field.label || '') && String(field.label || '').length > 18) return true;
  return false;
}

function shouldCoalesceProse(prev, next) {
  if (!prev || !next) return false;
  if (next.kind === 'title' || next.kind === 'checks' || next.kind === 'image' || next.kind === 'file') return false;
  if (prev.kind === 'title') return false;
  if (next.placeholder) return false;
  if (prev.value || (prev.placeholder && prev.kind !== 'note')) return false;
  // Sidehode / dokumentmeta skal ikke limes inn i vilkårstekst.
  if (chromeLine(prev.label) || chromeLine(next.label)) return false;
  const prevProse = prev.kind === 'note' || prev.kind === 'long' || shouldForceNote(prev)
    || (prev.kind === 'number' && String(prev.label || '').length > 45)
    || (prev.kind === 'text' && String(prev.label || '').length > 55);
  if (!prevProse) return false;
  const nextContinues = letteredListItem(next.label) || BULLET.test(next.label) || /^[a-zæøå•]/.test(next.label || '');
  // Kort value etter kolon-feilsplitt («…8.2: Consult1 har gjennom») skal også limes inn.
  if (nextContinues && (!next.value || String(next.value).length < 120)) return true;
  if (next.value) return false;
  if (!endsSentence(prev.label) && String(next.label || '').length >= 12
    && !/^(Post|Sted|Epost|Telefon|Tabell|Oppdrag|Att|Po|EHF|Merknad|Gnr|Opprettet|Oppstart|Slutt|Dokument)/i.test(next.label || '')) {
    return true;
  }
  return false;
}

/** Lim sammen PDF-brutte vilkårsfragmenter til hele noter. */
function coalesceProseFields(fields) {
  const out = [];
  for (const field of (Array.isArray(fields) ? fields : [])) {
    if (!field?.label) continue;
    const prev = out[out.length - 1];
    if (prev && shouldCoalesceProse(prev, field)) {
      const left = String(prev.label).replace(/\s+$/g, '');
      const right = String(field.label).replace(/^\s+/g, '');
      const tail = field.value ? ` ${String(field.value).trim()}` : '';
      const joiner = (left.endsWith('\n') || right.startsWith('•') || letteredListItem(right)) ? '\n' : ' ';
      Object.assign(prev, forceNoteField(prev));
      prev.label = `${left}${joiner}${right}${tail}`.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, NOTE_LABEL_MAX);
      continue;
    }
    out.push(shouldForceNote(field) ? forceNoteField(field) : field);
  }
  return out;
}

/** Lager et utkast fra ren tekst når AI ikke svarer. */
export function formFromPlainText(source, titleHint = '') {
  const rawLines = String(source || '').replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean);
  const lines = joinWrappedLines(rawLines).slice(0, PLAIN_TEXT_LINES);
  const fields = [];
  const seenChrome = new Set();
  let pending = null;
  let heading = '';
  let lastWasChrome = false;
  function pushTitle(line) {
    const label = stripDecor(line).slice(0, 120);
    if (!label) return;
    if (!heading) heading = label;
    fields.push({ ...blankField('title'), label });
    pending = null;
    lastWasChrome = false;
  }
  for (const line of lines) {
    if (chromeLine(line)) {
      pending = null;
      lastWasChrome = true;
      const key = foldLabel(stripDecor(line)).replace(/\d{1,2}\s*av\s*\d{1,2}/g, '').replace(/\d{2}\.\d{2}\.\d{2,4}/g, '').trim();
      if (key && seenChrome.has(key)) continue;
      if (key) seenChrome.add(key);
      fields.push({ ...blankField('note'), label: stripDecor(line).slice(0, NOTE_LABEL_MAX) });
      continue;
    }
    if (/^\s*underskrift\b/i.test(line) || (/\bunderskrift\b/i.test(line) && /\bunderskrift\b.*\bunderskrift\b/i.test(line))) {
      pending = null;
      lastWasChrome = false;
      fields.push({
        ...blankField('image'),
        label: 'Underskrift oppdragsgiver',
        placeholder: 'Signatur',
        review: 'Signaturfelt. Behold bilde hvis det skal tegnes, eller bytt til kort svar hvis navnet skrives.',
      });
      fields.push({
        ...blankField('image'),
        label: 'Underskrift Consult1',
        placeholder: 'Signatur',
        review: 'Signaturfelt. Behold bilde hvis det skal tegnes, eller bytt til kort svar hvis navnet skrives.',
      });
      const validity = line.match(/Denne avtale[^]*?(?:parter|partene)\.?/i) || line.match(/kun gyldig[^.]*\.?/i);
      if (validity) fields.push({ ...blankField('note'), label: text(validity[0]).slice(0, NOTE_LABEL_MAX) });
      continue;
    }
    const exploded = explodeBlanks(line);
    if (exploded) {
      pending = null;
      lastWasChrome = false;
      for (const field of exploded) fields.push(field);
      if (/\[Oppdragsnr/i.test(line) && /adresse|oppdragssted/i.test(line)) {
        const target = [...fields].reverse().find((row) => /oppdrags\s*nummer/i.test(row.label));
        if (target && !target.placeholder && !target.value) target.placeholder = 'Oppdragsnr.';
      }
      const last = exploded[exploded.length - 1];
      if (last && ['text', 'choice', 'checks'].includes(last.kind)) pending = last;
      continue;
    }
    const pair = line.split(/\t+|\s{3,}/).map((part) => part.trim()).filter((part) => part && !/^[_·.]{3,}$/.test(part));
    if (pair.length === 2 && pair.every((part) => part.length < 70 && !BULLET.test(part) && !CHECK_MARK.test(part))) {
      pending = null;
      lastWasChrome = false;
      for (const part of pair) {
        const filled = filledFromLine(part, 'half');
        const field = filled || pushField(part, 'half');
        if (field) fields.push(field);
      }
      continue;
    }
    const bullet = line.match(BULLET);
    if (bullet && pending && ['text', 'choice', 'checks'].includes(pending.kind)) {
      const option = stripDecor(bullet[1]);
      if (option && option.length <= 40) {
        addOption(pending, bullet[1], 'choice');
        continue;
      }
    }
    if (bullet) {
      const option = stripDecor(bullet[1]);
      const prev = fields[fields.length - 1];
      if (option && prev?.kind === 'note' && (option.length > 40 || /[.!?]$/.test(option) || prev.label.length > 120)) {
        prev.label = `${prev.label}\n• ${option}`.slice(0, NOTE_LABEL_MAX);
        pending = null;
        lastWasChrome = false;
        continue;
      }
      if (option && pending && ['text', 'choice', 'checks'].includes(pending.kind) && option.length <= 40) {
        addOption(pending, option, 'choice');
        continue;
      }
    }
    const mark = line.match(CHECK_MARK);
    if (mark && pending && ['text', 'choice', 'checks'].includes(pending.kind)) {
      const option = stripDecor(mark[1]);
      const radio = /^[○◯◉]/.test(line);
      const wanted = radio ? 'choice' : 'checks';
      const compatible = pending.kind === 'text' || pending.kind === wanted;
      if (option && option.length <= 40 && compatible) {
        addOption(pending, option, wanted);
        continue;
      }
    }
    pending = null;
    if (sectionLine(line) || (lastWasChrome && plainTitle(line))) {
      const label = stripDecor(line).slice(0, 120);
      if (label && fields.some((row) => row.kind === 'title' && sameLabel(row.label, label))) {
        lastWasChrome = false;
        continue;
      }
      pushTitle(line);
      continue;
    }
    lastWasChrome = false;
    if (letteredHeading(line)) {
      fields.push({ ...blankField('title'), label: stripDecor(line).slice(0, 120) });
      continue;
    }
    if (proseLine(line) || letteredListItem(line)) {
      const noteText = stripDecor(line).slice(0, NOTE_LABEL_MAX);
      const prev = fields[fields.length - 1];
      if (prev?.kind === 'note' && letteredListItem(line) && prev.label.length + noteText.length < NOTE_LABEL_MAX) {
        prev.label = `${prev.label}\n${noteText}`.slice(0, NOTE_LABEL_MAX);
      } else {
        fields.push({ ...blankField('note'), label: noteText });
      }
      continue;
    }
    const filled = filledFromLine(line);
    if (filled) {
      fields.push(filled);
      if (filled.kind === 'text' || filled.kind === 'checks' || filled.kind === 'choice') pending = filled;
      continue;
    }
    const field = pushField(line);
    if (!field) continue;
    fields.push(field);
    if (field.kind === 'text' || field.kind === 'checks' || field.kind === 'choice') pending = field;
  }
  const usable = coalesceProseFields(fields.filter((row) => row.label)).slice(0, MAX_FIELDS);
  if (!usable.length) return { ok: false, form: null, error: 'Fant ingen felter i teksten.' };
  return {
    ok: true,
    form: {
      ...blankForm(),
      id: '',
      title: text(titleHint).slice(0, 80) || heading || usable.find((row) => row.kind === 'title')?.label || GENERIC_TITLE,
      intro: '',
      fields: usable,
    },
    error: null,
  };
}

export function formFromScan(raw) {
  const title = text(raw?.title).slice(0, 80);
  const fields = (Array.isArray(raw?.fields) ? raw.fields : []).map((row) => normalizeBuilderField({
    label: row?.label,
    kind: row?.kind,
    required: row?.required,
    help: row?.help,
    placeholder: row?.placeholder,
    width: row?.width,
    review: row?.review,
    scaleMax: row?.scaleMax,
    lowLabel: row?.lowLabel,
    highLabel: row?.highLabel,
    options: row?.options,
    value: row?.value,
  })).filter(Boolean).slice(0, MAX_FIELDS);
  if (!fields.length) {
    return { ok: false, form: null, error: 'AI fant ikke et skjema i dokumentet.' };
  }
  return {
    ok: true,
    form: {
      ...blankForm(),
      id: '',
      title: title || GENERIC_TITLE,
      intro: text(raw?.intro).slice(0, 280),
      fields,
    },
    error: null,
  };
}

function sameLabel(left, right) {
  const a = foldLabel(left);
  const b = foldLabel(right);
  return !!a && a === b;
}

function preferTitle(primary, fallback) {
  const first = text(primary);
  const second = text(fallback);
  if (first && first !== GENERIC_TITLE) return first.slice(0, 80);
  return (second || first || GENERIC_TITLE).slice(0, 80);
}

/** AI-felt vinner typen. Felt som bare den lokale lesingen fant, legges bakerst. */
export function mergeFormReads(localForm, aiForm) {
  const localFields = Array.isArray(localForm?.fields) ? localForm.fields : [];
  const aiFields = Array.isArray(aiForm?.fields) ? aiForm.fields : [];
  if (!aiFields.length) return localFields.length ? { ...localForm, id: '' } : null;
  if (!localFields.length) return { ...aiForm, id: '' };
  const used = new Set();
  const fields = aiFields.map((field) => {
    const match = localFields.find((row) => !used.has(row) && sameLabel(row.label, field.label));
    if (!match) return field;
    used.add(match);
    const emptyValue = field.value == null || field.value === '' || (Array.isArray(field.value) && !field.value.length);
    return {
      ...field,
      required: !!(field.required || match.required),
      help: field.help || match.help || '',
      placeholder: field.placeholder || match.placeholder || '',
      width: field.width === 'half' || match.width === 'half' ? 'half' : 'full',
      review: field.review || match.review || '',
      options: (field.options || []).length ? field.options : (match.options || []),
      scaleMax: field.kind === 'scale' ? (field.scaleMax || match.scaleMax || 5) : field.scaleMax,
      lowLabel: field.lowLabel || match.lowLabel || '',
      highLabel: field.highLabel || match.highLabel || '',
      value: emptyValue ? match.value : field.value,
    };
  });
  for (const row of localFields) {
    if (used.has(row) || fields.length >= MAX_FIELDS) continue;
    fields.push({
      ...row,
      review: row.review || 'Feltet stod i dokumentet, men ble ikke med i AI-lesingen. Se over typen.',
    });
  }
  return {
    ...aiForm,
    id: '',
    title: preferTitle(aiForm.title, localForm.title),
    intro: text(aiForm.intro) || text(localForm.intro),
    cover: aiForm.cover || localForm.cover || '',
    fields: fields.slice(0, MAX_FIELDS),
  };
}

function matchOptions(previous, incoming) {
  const prev = Array.isArray(previous) ? previous : [];
  const next = Array.isArray(incoming) ? incoming : [];
  if (!next.length) return prev;
  return next.map((option) => {
    const found = prev.find((row) => sameLabel(row.label, option.label));
    if (!found) return option;
    return { ...option, id: found.id, image: option.image || found.image || '' };
  });
}

/** Leser inn i malen som er åpen. Id, svar og innstillinger blir stående. */
export function applyImportedForm(current, incoming) {
  const base = current && typeof current === 'object' ? current : blankForm();
  const next = incoming && typeof incoming === 'object' ? incoming : {};
  const incomingFields = Array.isArray(next.fields) ? next.fields : [];
  const previous = Array.isArray(base.fields) ? base.fields : [];
  const byLabel = new Map();
  for (const field of previous) {
    const key = foldLabel(field.label);
    if (key && !byLabel.has(key)) byLabel.set(key, field);
  }
  const fields = incomingFields.length
    ? incomingFields.map((field) => {
      const prev = byLabel.get(foldLabel(field.label));
      if (!prev) return field;
      return {
        ...field,
        id: prev.id,
        options: matchOptions(prev.options, field.options),
      };
    })
    : previous;
  return {
    ...blankForm(),
    ...base,
    id: base.id || '',
    title: preferTitle(next.title, base.title),
    intro: text(next.intro) || text(base.intro),
    cover: next.cover || base.cover || '',
    settings: base.settings || next.settings || blankSettings(),
    responses: Array.isArray(base.responses) ? base.responses : [],
    fields,
  };
}

export function formAttention(form) {
  const fields = Array.isArray(form?.fields) ? form.fields : [];
  const issues = [];
  if (form?.title === GENERIC_TITLE) {
    issues.push({ tone: 'warn', text: 'Gi skjemaet navnet som står på dokumentet.' });
  }
  if (!fields.length) issues.push({ tone: 'warn', text: 'Ingen felt er lest inn.' });
  const flagged = fields.filter((field) => text(field.review));
  for (const field of flagged.slice(0, 8)) {
    issues.push({ tone: 'warn', fieldId: field.id, text: `${field.label}: ${field.review}` });
  }
  if (flagged.length > 8) issues.push({ tone: 'warn', text: `${flagged.length - 8} felt til bør ses over.` });
  const bare = fields.filter((field) => OPTION_KINDS.has(field.kind) && (field.options || []).filter((row) => text(row.label)).length < 2);
  for (const field of bare.slice(0, 4)) {
    if (flagged.includes(field)) continue;
    issues.push({ tone: 'warn', fieldId: field.id, text: `«${field.label}» mangler alternativer.` });
  }
  const emptyTables = fields.filter((field) => field.kind === 'table' && !(field.columns || []).length);
  for (const field of emptyTables.slice(0, 4)) {
    issues.push({ tone: 'warn', fieldId: field.id, text: `«${field.label}» har ingen kolonner.` });
  }
  return { issues };
}
