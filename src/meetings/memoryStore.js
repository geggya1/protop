/**
 * Minnelagring med samme grensesnitt som createMeetingStore, til /moter-demo.
 * Ingen Firestore, ingen e-post: utsending registreres som om den gikk.
 */
import { normalizeMeeting } from './model.js';
import { normalizeTemplate } from './templates.js';
import { loadFormSources } from './storage.js';

export function createMemoryMeetingStore({ meetings = [], templates = [] } = {}) {
  let rows = meetings.map(normalizeMeeting);
  let own = templates.map(normalizeTemplate);
  const meetingSubs = new Set();
  const templateSubs = new Set();
  const emit = () => meetingSubs.forEach((fn) => fn(rows.slice(), { source: 'remote' }));
  const emitTemplates = () => templateSubs.forEach((fn) => fn(own.slice()));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  return {
    demo: true,
    companyId: '__demo__',
    watchMeetings(onData) {
      meetingSubs.add(onData);
      onData(rows.slice(), { source: 'remote' });
      return () => meetingSubs.delete(onData);
    },
    async saveMeeting(meeting) {
      const next = normalizeMeeting({ ...meeting, updatedAt: new Date().toISOString() });
      rows = rows.some((m) => m.id === next.id) ? rows.map((m) => (m.id === next.id ? next : m)) : [...rows, next];
      emit();
      return next;
    },
    async deleteMeeting(id) {
      rows = rows.filter((m) => m.id !== id);
      emit();
    },
    watchTemplates(onData) {
      templateSubs.add(onData);
      onData(own.slice());
      return () => templateSubs.delete(onData);
    },
    async saveTemplate(template) {
      const row = normalizeTemplate({ ...template, updatedAt: new Date().toISOString() });
      own = own.some((t) => t.id === row.id) ? own.map((t) => (t.id === row.id ? row : t)) : [row, ...own];
      emitTemplates();
      return row;
    },
    async deleteTemplate(id) {
      own = own.filter((t) => t.id !== id);
      emitTemplates();
    },
    async archiveFile(meetingId, name, bytes, mime = 'application/pdf') {
      const blob = typeof Blob !== 'undefined' ? new Blob([bytes], { type: mime }) : null;
      return {
        url: blob && typeof URL !== 'undefined' ? URL.createObjectURL(blob) : '',
        storagePath: '',
        name,
        mime,
        size: bytes?.length || 0,
        at: new Date().toISOString(),
      };
    },
    async sendMail({ kind, to }) {
      await wait(700);
      return { ok: true, kind, to, failed: [], refused: [], demo: true };
    },
    async syncCalendar() {
      return '';
    },
    loadForms() {
      return loadFormSources('');
    },
  };
}
