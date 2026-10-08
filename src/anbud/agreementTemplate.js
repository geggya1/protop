/** Standardfelt fra C1-H-03-001 Oppdragsavtale NS 8403-fremsiden, pluss ramme/avrop. */

export const AGREEMENT_KINDS = [
  { id: 'oppdrag', label: 'Oppdragsavtale' },
  { id: 'rammeavtale', label: 'Rammeavtale' },
  { id: 'avrop', label: 'Avrop' },
  { id: 'endring', label: 'Endring' },
  { id: 'annet', label: 'Annen avtale' },
];

export const RENEWAL_TYPES = [
  { id: 'ingen', label: 'Ingen fornyelse' },
  { id: 'automatisk', label: 'Fornyes automatisk' },
  { id: 'opsjon', label: 'Fornyelse som opsjon' },
];

export const COVER_FIELD_GROUPS = [
  {
    id: 'avtalen',
    title: 'Avtalen',
    fields: [
      { key: 'kind', label: 'Avtaletype' },
      { key: 'systemId', label: 'System-ID' },
      { key: 'oppdragId', label: 'Oppdrags-ID' },
      { key: 'title', label: 'Oppdrag' },
      { key: 'description', label: 'Beskrivelse av oppdraget' },
      { key: 'poNumber', label: 'Eksternt PO-nummer' },
      { key: 'standard', label: 'Generelle bestemmelser' },
      { key: 'parentId', label: 'Tilknyttet avtale' },
    ],
  },
  {
    id: 'sted',
    title: 'Oppdragssted og periode',
    fields: [
      { key: 'address', label: 'Adresse' },
      { key: 'place', label: 'Sted' },
      { key: 'start', label: 'Oppstart' },
      { key: 'end', label: 'Sluttdato' },
      { key: 'contractDate', label: 'Avtaledato' },
    ],
  },
  {
    id: 'kunde',
    title: 'Oppdragsgiver',
    fields: [
      { key: 'buyer', label: 'Oppdragsgiver' },
      { key: 'orgnr', label: 'Organisasjonsnummer' },
      { key: 'personnummer', label: 'Personnummer' },
      { key: 'contactName', label: 'Kontaktperson' },
      { key: 'email', label: 'E-post' },
      { key: 'phone', label: 'Telefon' },
    ],
  },
  {
    id: 'leverandor',
    title: 'Oppdragstaker',
    fields: [
      { key: 'supplier', label: 'Oppdragstaker' },
      { key: 'supplierOrgnr', label: 'Organisasjonsnummer' },
    ],
  },
  {
    id: 'honorar',
    title: 'Honorar og regulering',
    fields: [
      { key: 'value', label: 'Avtalt honorar (eks. mva)' },
      { key: 'surchargePercent', label: 'Påslagsprosent' },
      { key: 'indexId', label: 'Prisregulering / indeks' },
    ],
  },
  {
    id: 'ramme',
    title: 'Varighet og fornyelse',
    fields: [
      { key: 'renewalType', label: 'Fornyelse' },
      { key: 'renewalUntil', label: 'Fornyes til' },
      { key: 'renewalNoticeDays', label: 'Varsel før utløp (dager)' },
    ],
  },
];

export const COVER_FIELD_KEYS = COVER_FIELD_GROUPS.flatMap((group) => group.fields.map((field) => field.key));

export function kindLabel(kind) {
  return AGREEMENT_KINDS.find((row) => row.id === kind)?.label || '';
}

export function emptyCoverForm() {
  const form = {};
  for (const key of COVER_FIELD_KEYS) form[key] = '';
  // Legacy OCR-tekst; vises ikke i UI — beløp ligger i `value` (eks. mva).
  form.honorar = '';
  form.kind = '';
  form.renewalType = 'ingen';
  form.projectId = '';
  form.customerId = '';
  form.createCustomer = false;
  form.ownerUid = '';
  form.ownerName = '';
  return form;
}

export function coverFromRecord(record = {}) {
  const form = emptyCoverForm();
  const fields = record.fields && typeof record.fields === 'object' ? record.fields : {};
  const renewal = record.renewal && typeof record.renewal === 'object' ? record.renewal : {};
  for (const key of COVER_FIELD_KEYS) {
    if (key === 'start') form.start = record.start || fields.startDate || '';
    else if (key === 'end') form.end = record.end || fields.endDate || '';
    else if (key === 'value') form.value = record.value == null || record.value === '' ? '' : String(record.value);
    else if (key === 'renewalType') form.renewalType = renewal.type || 'ingen';
    else if (key === 'renewalUntil') form.renewalUntil = renewal.until || '';
    else if (key === 'renewalNoticeDays') form.renewalNoticeDays = renewal.noticeDays == null ? '' : String(renewal.noticeDays);
    else if (key === 'kind') form.kind = record.kind || '';
    else if (key === 'parentId') form.parentId = record.parentId || '';
    else if (key === 'systemId') form.systemId = record.systemId || '';
    else if (key === 'oppdragId') form.oppdragId = record.oppdragId || record.fields?.reference || '';
    else if (record[key] != null && record[key] !== '') form[key] = String(record[key]);
    else if (fields[key] != null && fields[key] !== '') form[key] = String(fields[key]);
  }
  form.honorar = fields.honorar != null && fields.honorar !== ''
    ? String(fields.honorar)
    : (record.honorar != null && record.honorar !== '' ? String(record.honorar) : '');
  form.projectId = record.projectId || '';
  form.customerId = record.customerId || '';
  form.ownerUid = '';
  form.ownerName = '';
  return form;
}

function hiddenIdentityKey(form) {
  const org = String(form?.orgnr || '').replace(/\D/g, '').length === 9;
  const person = String(form?.personnummer || '').replace(/\D/g, '').length === 11;
  if (person && !org) return 'orgnr';
  if (org && !person) return 'personnummer';
  if (!org && !person) return 'personnummer';
  return '';
}

export function coverGroups(form) {
  const hide = hiddenIdentityKey(form);
  return COVER_FIELD_GROUPS.map((group) => ({
    ...group,
    rows: group.fields
      .filter((field) => field.key !== hide)
      .map((field) => ({
        ...field,
        value: form?.[field.key] ?? '',
      })),
  }));
}

export function childKindsFor(parentKind) {
  if (parentKind === 'rammeavtale') return ['avrop', 'endring', 'oppdrag'];
  if (parentKind === 'oppdrag' || parentKind === 'avrop') return ['endring'];
  return ['endring', 'avrop'];
}

export function agreementKindFromText(source) {
  const text = String(source || '');
  if (/\brammeavtale/i.test(text)) return 'rammeavtale';
  if (/\bavrop\b|avropsavtale/i.test(text)) return 'avrop';
  if (/endringsavtale|endringsordre|tilleggsavtale/i.test(text)) return 'endring';
  if (/oppdragsavtale|oppdragsbekreftelse/i.test(text)) return 'oppdrag';
  return '';
}

export function emptyOption(partial = {}) {
  return {
    id: partial.id || '',
    title: String(partial.title || '').trim(),
    start: String(partial.start || '').trim(),
    end: String(partial.end || '').trim(),
    exercised: !!partial.exercised,
    note: String(partial.note || '').trim(),
  };
}

export function parentOptions(contracts, currentId = '') {
  const rows = Array.isArray(contracts) ? contracts : [];
  return rows.filter((row) => (
    row?.id
    && row.id !== currentId
    && row.status !== 'avsluttet'
    && (row.kind === 'rammeavtale' || row.kind === 'oppdrag')
  ));
}

export function childAgreements(contracts, parentId) {
  const id = String(parentId || '');
  if (!id) return [];
  return (Array.isArray(contracts) ? contracts : []).filter((row) => row?.parentId === id);
}
