/**
 * Hvor et gjøremål gjøres, og hvor siden ruller når det trykkes på.
 * Mål: 'documents:<id>' (dokumentet åpnes), 'hms' (HMS-kortet), 'kin' (familievinduet),
 * 'hr:<id>' (oppgaven fra HR foldes ut), og seksjonene 'attention' og 'done'.
 * Ren modul – brukes av Gjøremål, Min side og testene.
 */

function text(value) {
  return String(value ?? '').trim();
}

/** Målet for et punkt fra employeeTodos. */
export function todoTargetOf(row) {
  if (!row) return 'attention';
  if (row.target === 'documents') {
    const id = text(row.id).replace(/^doc:/, '');
    return id ? `documents:${id}` : 'documents';
  }
  if (row.target === 'hr') {
    const id = text(row.id).replace(/^hr:/, '');
    return id ? `hr:${id}` : 'attention';
  }
  if (row.target === 'hms' || row.target === 'kin') return row.target;
  return 'attention';
}

/** 'documents:abc' → { kind: 'documents', id: 'abc' }. */
export function parseTodoTarget(target) {
  const raw = text(target);
  const at = raw.indexOf(':');
  if (at < 0) return { kind: raw, id: '' };
  return { kind: raw.slice(0, at), id: raw.slice(at + 1) };
}

/** Trygg id til nativeID/DOM-id. */
export function anchorSafe(id) {
  return text(id).replace(/[^A-Za-z0-9_-]/g, '-');
}

/** nativeID-en siden ruller til for et mål. */
export function todoAnchorId(target) {
  const { kind, id } = parseTodoTarget(target);
  if (kind === 'documents') return id ? `my-doc-${anchorSafe(id)}` : 'employee-todo-docs';
  if (kind === 'hms') return 'employee-todo-hms';
  if (kind === 'hr') return id ? `employee-todo-hr-${anchorSafe(id)}` : 'employee-todo-attention';
  if (kind === 'done') return 'employee-todo-done';
  return 'employee-todo-attention';
}

/** Teksten på knappen i raden: hva som skjer når en trykker. */
export function todoActionLabel(row) {
  if (!row) return 'Åpne';
  if (row.target === 'documents') return row.title?.startsWith('Fyll ut') ? 'Fyll ut og signer' : 'Les og bekreft';
  if (row.target === 'hms') return row.card ? 'Oppdater kortet' : 'Registrer kortet';
  if (row.target === 'kin') return row.done ? 'Endre' : 'Legg inn';
  if (row.target === 'hr') return 'Se oppgaven';
  return 'Åpne';
}
