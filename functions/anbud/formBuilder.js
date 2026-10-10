/** Skjemabygger for bedriften: felttyper, rekkefølge og lesing av et dokument. */

export const FIELD_TYPES = [
  { id: 'title', label: 'Seksjon', hint: 'Overskrift uten svarfelt' },
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
];

export const FIELD_GROUPS = [
  { id: 'seksjon', label: 'Seksjon', types: ['title'] },
  { id: 'sporsmal', label: 'Spørsmål', types: ['long', 'text', 'choice', 'checks', 'dropdown', 'scale', 'date', 'time', 'number', 'check', 'image', 'file'] },
];

export const FIELD_TYPE_IDS = new Set(FIELD_TYPES.map((row) => row.id));
const OPTION_KINDS = new Set(['choice', 'checks', 'dropdown']);
export const MAX_FIELDS = 80;
export const MAX_TEMPLATES = 80;

function text(value) {
  return String(value || '').trim();
}

function createId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export function fieldType(kind) {
  return FIELD_TYPES.find((row) => row.id === kind) || FIELD_TYPES.find((row) => row.id === 'text');
}

export function blankField(kind = 'text') {
  const id = createId('felt');
  const type = FIELD_TYPE_IDS.has(kind) ? kind : 'text';
  return {
    id,
    label: type === 'title' ? 'Ny seksjon' : (type === 'choice' ? 'Spørsmål' : fieldType(type).label),
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
    useCompanyLogo: false,
    confirmation: 'Svaret er sendt.',
  };
}

export function blankForm() {
  return {
    id: '',
    title: '',
    intro: '',
    cover: '',
    settings: blankSettings(),
    responses: [],
    fields: [blankField('choice')],
  };
}

export function emptyAnswer(kind) {
  if (kind === 'check') return false;
  if (kind === 'checks') return [];
  if (kind === 'image' || kind === 'file') return null;
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

export function coerceAnswer(kind, value) {
  if (kind === 'title') return '';
  if (kind === 'check') return !!value;
  if (kind === 'scale') {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    return String(Math.max(0, Math.min(10, Math.round(n))));
  }
  if (kind === 'time') return text(value).slice(0, 8);
  if (kind === 'checks') {
    const list = Array.isArray(value) ? value : [];
    return [...new Set(list.map((row) => text(row)).filter(Boolean))].slice(0, 12);
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
  return text(value).slice(0, 8000);
}

export function normalizeBuilderField(raw) {
  const label = text(raw?.label).slice(0, 120);
  const id = text(raw?.id).slice(0, 40) || createId('felt');
  if (!label) return null;
  const kind = FIELD_TYPE_IDS.has(raw?.kind) ? raw.kind : 'text';
  return {
    id,
    label,
    kind,
    required: kind === 'title' ? false : !!raw?.required,
    help: text(raw?.help).slice(0, 180),
    shuffle: OPTION_KINDS.has(kind) ? !!raw?.shuffle : false,
    other: kind === 'choice' || kind === 'checks' ? !!raw?.other : false,
    scaleMin: 1,
    scaleMax: kind === 'scale' ? Math.max(2, Math.min(10, Number(raw?.scaleMax) || 5)) : 5,
    lowLabel: kind === 'scale' ? text(raw?.lowLabel).slice(0, 40) : '',
    highLabel: kind === 'scale' ? text(raw?.highLabel).slice(0, 40) : '',
    placeholder: kind === 'title' ? '' : text(raw?.placeholder).slice(0, 120),
    width: raw?.width === 'half' ? 'half' : 'full',
    review: text(raw?.review).slice(0, 180),
    options: OPTION_KINDS.has(kind) ? normalizeOptions(raw?.options) : [],
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
    useCompanyLogo: !!src.useCompanyLogo,
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
  const fields = (form?.fields || []).filter((field) => field.kind !== 'title');
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
      "kind": "title|text|long|date|time|number|scale|check|choice|checks|dropdown|image|file",
      "required": false,
      "help": "hjelpetekst under feltet, eller tom streng",
      "placeholder": "grå tekst inne i feltet, eller tom streng",
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
Utfyllingsfelter som er listet opp, er fasit for type. Bruk etiketten som står ved feltet, ikke interne navn som Text1.
Ikke finn opp felter som ikke står i dokumentet. Ta med feltene i alle kolonner. Maks 80 felt.`;
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
  if (/signatur|underskrift/i.test(source)) return 'image';
  if (/klokken|tidspunkt|\bkl\b|\btid\b/i.test(label) && !/periode|frist/i.test(label)) return 'time';
  if (/skala|fra 1 til|svært (uenig|enig)/i.test(source)) return 'scale';
  if (/dato|frist|gyldig til|dd\.mm/i.test(source)) return 'date';
  if (/bilde|foto|skisse|lim inn/i.test(label)) return 'image';
  if (/vedlegg|last opp|dokumentasjon/i.test(label)) return 'file';
  if (/\b(beløp|antall|pris|kr|m2|kvm|prosent)\b/i.test(label) || /\bsum\b/i.test(label)) return 'number';
  if (/ja\s*\/\s*nei|kryss av|bekreft|avkrys/i.test(label)) return 'check';
  if (/_{20,}/.test(raw) || String(label || '').length > 80) return 'long';
  return 'text';
}

function isHeading(line) {
  const value = String(line || '').trim();
  if (!value || value.includes(':') || value.length >= 60) return false;
  if (/^#{1,3}\s+\S/.test(value)) return true;
  return value === value.toUpperCase() && /[A-ZÆØÅ]/.test(value);
}

function requiredOf(raw) {
  return /\*\s*$/.test(String(raw || '').trim()) || /\bobligatorisk\b/i.test(raw);
}

function placeholderOf(raw) {
  const match = String(raw || '').match(/\((?:f\.eks\.|for eksempel|eks\.|dd\.mm|tt:?mm|åååå)[^)]*\)/i);
  return match ? match[0].slice(1, -1).slice(0, 120) : '';
}

function stripDecor(raw) {
  return text(raw)
    .replace(/^#{1,3}\s+/, '')
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

/** Lager et utkast fra ren tekst når AI ikke svarer. */
export function formFromPlainText(source, titleHint = '') {
  const lines = String(source || '').replace(/\r\n/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 240);
  const fields = [];
  let pending = null;
  let heading = '';
  for (const line of lines) {
    const pair = line.split(/\t+|\s{3,}/).map((part) => part.trim()).filter((part) => part && !/^[_·.]{3,}$/.test(part));
    if (pair.length === 2 && pair.every((part) => part.length < 70 && !BULLET.test(part) && !CHECK_MARK.test(part))) {
      pending = null;
      for (const part of pair) {
        const field = pushField(part, 'half');
        if (field) fields.push(field);
      }
      continue;
    }
    const bullet = line.match(BULLET);
    if (bullet && pending && ['text', 'choice', 'checks'].includes(pending.kind)) {
      addOption(pending, bullet[1], 'choice');
      continue;
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
    if (isHeading(line)) {
      const label = stripDecor(line).slice(0, 120);
      if (!heading) heading = label;
      fields.push({ ...blankField('title'), label });
      continue;
    }
    const field = pushField(line);
    if (!field) continue;
    fields.push(field);
    if (field.kind === 'text' || field.kind === 'checks' || field.kind === 'choice') pending = field;
  }
  const usable = fields.filter((row) => row.label).slice(0, MAX_FIELDS);
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
    value: '',
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
  if (!text(form?.title) || form.title === GENERIC_TITLE) {
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
  return { issues };
}
