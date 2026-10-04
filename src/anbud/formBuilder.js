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
export const MAX_FIELDS = 40;
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

function kindFromLabel(label) {
  if (/klokken|tidspunkt|\btid\b/i.test(label)) return 'time';
  if (/skala|fra 1 til/i.test(label)) return 'scale';
  if (/dato|frist|gyldig til/i.test(label)) return 'date';
  if (/bilde|foto|skisse/i.test(label)) return 'image';
  if (/vedlegg|last opp|dokumentasjon/i.test(label)) return 'file';
  if (/\b(beløp|antall|pris|kr)\b/i.test(label) || /sum/i.test(label)) return 'number';
  if (/ja\s*\/\s*nei|kryss av|bekreft/i.test(label)) return 'check';
  if (label.length > 80) return 'long';
  return 'text';
}

/** Lager et utkast fra ren tekst når AI ikke svarer. */
export function formFromPlainText(source, titleHint = '') {
  const lines = String(source || '').split(/\n/).map((line) => line.trim()).filter(Boolean).slice(0, 120);
  const fields = [];
  let pendingChoice = null;
  for (const line of lines) {
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.+)$/);
    if (bullet && pendingChoice) {
      pendingChoice.options.push({ id: createId('alt'), label: bullet[1].slice(0, 80) });
      if (pendingChoice.options.length === 2) pendingChoice.kind = 'choice';
      continue;
    }
    pendingChoice = null;
    const heading = !line.includes(':') && line.length < 60 && line === line.toUpperCase() && /[A-ZÆØÅ]/.test(line);
    if (heading) {
      fields.push({ ...blankField('title'), label: line.slice(0, 120) });
      continue;
    }
    const label = line.replace(/[:*]\s*$/, '').slice(0, 120);
    if (!label) continue;
    const field = { ...blankField(kindFromLabel(label)), label };
    fields.push(field);
    if (field.kind === 'text') pendingChoice = field;
  }
  const usable = fields.filter((row) => row.label).slice(0, MAX_FIELDS);
  if (!usable.length) return { ok: false, form: null, error: 'Fant ingen felter i teksten.' };
  return {
    ok: true,
    form: {
      ...blankForm(),
      id: '',
      title: text(titleHint).slice(0, 80) || usable.find((row) => row.kind === 'title')?.label || 'Skjema fra dokument',
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
    options: row?.options,
    value: '',
  })).filter(Boolean).slice(0, MAX_FIELDS);
  if (!title || !fields.length) {
    return { ok: false, form: null, error: 'AI fant ikke et skjema i dokumentet.' };
  }
  return {
    ok: true,
    form: { ...blankForm(), id: '', title, intro: text(raw?.intro).slice(0, 280), fields },
    error: null,
  };
}
