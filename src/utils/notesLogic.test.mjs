import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  canMigrateVoiceNotesInto,
  familyNoteFromVoiceNote,
  filterNotesByQuery,
  isNoteMissing,
  isOfflineSaveError,
  migratedVoiceNoteId,
  noteDraftDirty,
  noteDraftPatch,
  noteSaveStatusFromError,
  noteSaveStatusText,
  voiceNoteNeedsMigration,
  withSaveTimeout,
} from './notesLogic.js';

test('utkast er ulagret bare når tittel eller tekst avviker', () => {
  const saved = { title: 'Møte', body: 'Agenda' };
  assert.equal(noteDraftDirty({ title: 'Møte', body: 'Agenda' }, saved), false);
  assert.equal(noteDraftDirty({ title: 'Møte ', body: 'Agenda' }, saved), true);
  assert.equal(noteDraftDirty({ title: 'Møte', body: 'Agenda\n' }, saved), true);
  // Før notatet er lest, er ingenting ulagret.
  assert.equal(noteDraftDirty({ title: 'x', body: '' }, null), false);
});

test('lagringen trimmer tittelen og bruker «Uten tittel»', () => {
  assert.deepEqual(noteDraftPatch('  Plan  ', 'tekst'), { title: 'Plan', body: 'tekst' });
  assert.deepEqual(noteDraftPatch('', ''), { title: 'Uten tittel', body: '' });
});

test('slettet eller manglende notat gir «finnes ikke», laster gir ikke', () => {
  assert.equal(isNoteMissing(undefined), false);
  assert.equal(isNoteMissing(null), true);
  assert.equal(isNoteMissing({ id: 'a', deleted: true }), true);
  assert.equal(isNoteMissing({ id: 'a', permanentlyDeleted: true }), true);
  assert.equal(isNoteMissing({ id: 'a', title: 'x' }), false);
});

test('tidsavbrudd gir offline-status, ikke evig «Lagrer…»', async () => {
  const never = new Promise(() => {});
  await assert.rejects(withSaveTimeout(never, 20), (err) => err.code === 'timeout');
  assert.equal(await withSaveTimeout(Promise.resolve('ok'), 20), 'ok');
  await assert.rejects(withSaveTimeout(Promise.reject(Object.assign(new Error('nei'), { code: 'permission-denied' })), 20),
    (err) => err.code === 'permission-denied');

  assert.equal(isOfflineSaveError({ code: 'timeout' }), true);
  assert.equal(isOfflineSaveError({ code: 'unavailable' }), true);
  assert.equal(isOfflineSaveError({ code: 'firestore/unavailable' }), true);
  assert.equal(isOfflineSaveError({ code: 'permission-denied' }), false);
  assert.equal(noteSaveStatusFromError({ code: 'timeout' }), 'offline');
  assert.equal(noteSaveStatusFromError({ code: 'permission-denied' }), 'error');
  assert.match(noteSaveStatusText('offline'), /nett/);
  assert.equal(noteSaveStatusText('saving'), 'Lagrer…');
});

test('personlige talenotater flyttes aldri inn i en bedrift', () => {
  assert.equal(canMigrateVoiceNotesInto('company'), false);
  assert.equal(canMigrateVoiceNotesInto('organization'), false);
  assert.equal(canMigrateVoiceNotesInto(''), false, 'ukjent type: ingen flytting');
  assert.equal(canMigrateVoiceNotesInto(undefined), false);
  assert.equal(canMigrateVoiceNotesInto('family'), true);
});

test('flyttingen er idempotent: fast id og markør', () => {
  assert.equal(migratedVoiceNoteId('abc123'), 'voice-abc123');
  assert.equal(migratedVoiceNoteId('abc123'), migratedVoiceNoteId('abc123'));
  assert.equal(voiceNoteNeedsMigration({ id: 'a' }), true);
  assert.equal(voiceNoteNeedsMigration({ id: 'a', migratedToFamilyNoteId: 'voice-a' }), false);
  assert.equal(voiceNoteNeedsMigration({ id: 'a', deleted: true }), false);

  const note = familyNoteFromVoiceNote({ id: 'vn1', title: 'Befaring', transcript: 'rått', durationMs: 5 }, 'u1', 'Kari');
  assert.equal(note.visibility, 'private');
  assert.deepEqual(note.memberIds, ['u1']);
  assert.equal(note.voiceNoteId, 'vn1');
  assert.equal(note.source, 'voice');
  assert.equal(note.title, 'Befaring');
});

test('migreringen skriver notat og markør i én transaksjon', () => {
  const src = readFileSync(new URL('./familyNotes.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export async function migrateVoiceNotesIntoFamily'));
  assert.match(fn, /canMigrateVoiceNotesInto\(groupType\)/);
  assert.match(fn, /runTransaction\(db/);
  assert.match(fn, /tx\.set\(noteDoc\(familyId, noteId\)/);
  assert.match(fn, /migratedToFamilyNoteId: noteId/);
  assert.equal(/createNote\(/.test(fn.slice(0, fn.indexOf('export async function updateNote'))), false);
});

test('notatredigeringen autolagrer og spør ved Tilbake', () => {
  const src = readFileSync(new URL('../../screens/v2/NoteEditorScreen.jsx', import.meta.url), 'utf8');
  assert.match(src, /NOTE_AUTOSAVE_MS/);
  assert.match(src, /withSaveTimeout\(write\)/);
  assert.match(src, /Ulagrede endringer/);
  assert.match(src, /Notatet finnes ikke/);
  assert.match(src, /<EdgeSwipeBack onBack=\{leave\}>/);
  const settings = readFileSync(new URL('../../screens/v2/NoteSettingsScreen.jsx', import.meta.url), 'utf8');
  assert.match(settings, /Notatet finnes ikke/);
  assert.match(settings, /note === undefined/);
});

test('«Slett permanent» sletter notatdokumentet, ikke bare et flagg (SOS-09)', () => {
  const src = readFileSync(new URL('./familyNotes.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('export async function deleteNote'), src.indexOf('export async function setNoteMembers'));
  assert.match(fn, /deleteDoc\(noteDoc\(familyId, noteId\)\)/);
  assert.doesNotMatch(fn, /permanentlyDeleted: true/);
  // Innstillingene kaller fortsatt deleteNote etter bekreftelse.
  const settings = readFileSync(new URL('../../screens/v2/NoteSettingsScreen.jsx', import.meta.url), 'utf8');
  assert.match(settings, /withSaveTimeout\(deleteNote\(familyId, noteId\)\)/);
});

test('søk i Notater: alle ord, uten hensyn til store bokstaver og aksenter', () => {
  const notes = [
    { id: 'a', title: 'Lønnsforhandling 77261', body: 'Kim får 5 % tillegg' },
    { id: 'b', title: 'Byggemøte', body: 'Agenda for mandag', createdByName: 'Eva Eier' },
    { id: 'c', title: 'Talenotat', transcript: 'husk å bestille stillas', summary: '' },
  ];
  assert.deepEqual(filterNotesByQuery(notes, 'lønnsforhandling').map((n) => n.id), ['a']);
  assert.deepEqual(filterNotesByQuery(notes, '  STILLAS ').map((n) => n.id), ['c']);
  assert.deepEqual(filterNotesByQuery(notes, 'eva mandag').map((n) => n.id), ['b']);
  assert.deepEqual(filterNotesByQuery(notes, 'MØTE').map((n) => n.id), ['b']);
  assert.deepEqual(filterNotesByQuery([{ id: 'd', title: 'Café-avtale' }], 'cafe').map((n) => n.id), ['d']);
  assert.deepEqual(filterNotesByQuery(notes, 'eva stillas'), []);
  assert.equal(filterNotesByQuery(notes, '').length, 3);
  assert.deepEqual(filterNotesByQuery(null, 'x'), []);
  const hub = readFileSync(new URL('../../screens/v2/NotesHubScreen.jsx', import.meta.url), 'utf8');
  assert.match(hub, /filterNotesByQuery\(profileNotes, search\)/);
  assert.match(hub, /accessibilityLabel="Søk i notater"/);
});
