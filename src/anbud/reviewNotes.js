/** Egne notater fra vurderingen, som følger med videre i tilbud eller avslag. */

function text(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

export function normalizeReviewNotes(value) {
  const rows = Array.isArray(value) ? value : [];
  const seen = new Set();
  const notes = [];
  for (const row of rows) {
    const body = text(row?.text);
    const id = String(row?.id || '').trim().slice(0, 40);
    if (!body || !id || seen.has(id)) continue;
    seen.add(id);
    notes.push({
      id,
      text: body,
      createdAt: String(row?.createdAt || '').slice(0, 40),
      updatedAt: String(row?.updatedAt || row?.createdAt || '').slice(0, 40),
    });
    if (notes.length >= 30) break;
  }
  return notes;
}

function noteId() {
  return `rn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function upsertReviewNote(notes, input = {}) {
  const body = text(input.text);
  const current = normalizeReviewNotes(notes);
  if (!body) return { ok: false, error: 'Skriv et notat.', notes: current };
  const now = new Date().toISOString();
  const id = String(input.id || '').trim();
  if (id) {
    const existing = current.find((row) => row.id === id);
    if (!existing) return { ok: false, error: 'Notatet finnes ikke.', notes: current };
    return {
      ok: true,
      notes: current.map((row) => (row.id === id ? { ...row, text: body, updatedAt: now } : row)),
    };
  }
  return {
    ok: true,
    notes: [{ id: noteId(), text: body, createdAt: now, updatedAt: now }, ...current].slice(0, 30),
  };
}

export function deleteReviewNote(notes, id) {
  const current = normalizeReviewNotes(notes);
  const next = current.filter((row) => row.id !== id);
  if (next.length === current.length) return { ok: false, error: 'Notatet finnes ikke.', notes: current };
  return { ok: true, notes: next };
}

/** Tar med et usendt utkast, slik at beslutningen ikke mister teksten i feltet. */
export function notesWithDraft(notes, draft, editingId = '') {
  const pending = text(draft);
  if (!pending) return normalizeReviewNotes(notes);
  const saved = upsertReviewNote(notes, { id: editingId, text: pending });
  return saved.ok ? saved.notes : normalizeReviewNotes(notes);
}
