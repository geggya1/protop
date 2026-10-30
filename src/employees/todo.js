/**
 * Gjøremål for én ansatt: det personen selv må gjøre eller ha på plass, samlet på
 * personsiden (fanen Gjøremål) og som «Krever oppmerksomhet» på Min side.
 *
 * Kilder: dokumenter med lesekrav (les og bekreft, fyll ut og signer), nærmeste pårørende,
 * HMS-kortet når bedriften krever det, og oppgaver HR har delt med personen.
 * Ren modul – testes uten Firebase.
 */
import { hmsCardStatus } from '../hr/hmsCard.js';

function text(value) {
  return String(value ?? '').trim();
}

/** Mangler navn eller telefon til nærmeste pårørende? */
export function kinIsMissing(employee) {
  const person = employee?.person || {};
  return !text(person.kinName) || !text(person.kinPhone);
}

/**
 * docs: rader fra documentsForEmployee. hms: { required, notApplicable, card }.
 * hrTasks: oppgaver HR har delt (slice.tasks). Gir punkter med åpne først.
 *   { id, kind, title, text, done, urgent, target }
 * target sier hvor punktet gjøres: 'documents', 'hms', 'kin' eller 'hr'.
 */
export function employeeTodos({ employee = null, docs = [], hms = null, hrTasks = [], today = '' } = {}) {
  const out = [];
  for (const row of docs || []) {
    if (!row?.required) continue;
    const sign = row.control?.readRule === 'signeres';
    out.push({
      id: `doc:${row.control?.id}`,
      kind: 'document',
      title: `${sign ? 'Fyll ut og signer' : 'Les og bekreft'}: ${row.control?.title || 'Dokument'}`,
      text: row.done
        ? (sign ? 'Signert.' : `Bekreftet versjon ${row.revision}.`)
        : (sign ? 'Fyll ut og signer dokumentet under.' : `Les versjon ${row.revision} og trykk «Jeg har lest og forstått».`),
      done: !!row.done,
      urgent: false,
      target: 'documents',
    });
  }
  if (employee) {
    const missing = kinIsMissing(employee);
    out.push({
      id: 'kin',
      kind: 'kin',
      title: 'Nærmeste pårørende',
      text: missing
        ? 'Legg inn navn og telefon til nærmeste pårørende på Min side. Det vises bare for deg og administrator.'
        : `${text(employee.person?.kinName)} · ${text(employee.person?.kinPhone)}`,
      done: !missing,
      urgent: false,
      target: 'kin',
    });
  }
  if (hms?.required && !hms.notApplicable) {
    const state = hmsCardStatus(hms.card, today);
    const ok = state.id === 'valid' || state.id === 'expiring';
    let detail = 'Skann QR-koden eller ta bilde av forsiden av HMS-kortet ditt.';
    if (state.id === 'expired') detail = `${state.label}. Be arbeidsgiver bestille nytt kort, og registrer det nye her.`;
    else if (state.id === 'expiring') detail = `${state.label}. Be arbeidsgiver bestille nytt kort i tide.`;
    else if (ok) detail = `${hms.card?.number} · ${state.label}.`;
    else if (hms.card) detail = `${state.label}. Ta bilde av forsiden av kortet, så leses det inn.`;
    out.push({
      id: 'hms',
      kind: 'hms',
      title: 'HMS-kort',
      text: detail,
      done: state.id === 'valid',
      urgent: state.id === 'expired' || state.id === 'expiring',
      target: 'hms',
    });
  }
  for (const task of hrTasks || []) {
    if (!task?.id) continue;
    out.push({
      id: `hr:${task.id}`,
      kind: 'hrTask',
      title: task.title || 'Oppgave fra HR',
      text: task.description || '',
      done: task.status === 'done',
      urgent: false,
      target: 'hr',
    });
  }
  return out.sort((a, b) => Number(a.done) - Number(b.done) || Number(b.urgent) - Number(a.urgent));
}

/** Antall punkter som krever oppmerksomhet. */
export function openTodoCount(todos) {
  return (todos || []).filter((row) => !row.done).length;
}
