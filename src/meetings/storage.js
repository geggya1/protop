/**
 * Lagring for Møter i Firestore:
 *   families/{bedrift}/meetings/{id}          møtet med dagsorden, deltakere og referat
 *   families/{bedrift}/meetingTemplates/{id}  bedriftens egne møtemaler
 *   families/{bedrift}/events/meeting_{id}    møtet i deltakernes kalender i ProTop
 * PDF-arkivet ligger i Storage under families/{bedrift}/meetings/{id}/.
 *
 * Skjermen bruker et «store»-objekt, så demoen kan bytte inn minnelagring.
 */
import { isLocked, mergeMeetingEdits, normalizeMeeting, text } from './model.js';
import { meetingType, normalizeTemplate } from './templates.js';

const CACHE_PREFIX = 'protop.meetings.v1.';
const CACHE_MAX_CHARS = 1_500_000;

async function firestore() {
  const [fs, { db }] = await Promise.all([import('firebase/firestore'), import('../../firebase.js')]);
  return { ...fs, db };
}

async function readCache(companyId) {
  try {
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${companyId}`);
    const rows = raw ? JSON.parse(raw) : null;
    return Array.isArray(rows) ? rows.map(normalizeMeeting) : null;
  } catch {
    return null;
  }
}

async function writeCache(companyId, rows) {
  try {
    const raw = JSON.stringify(rows);
    if (raw.length > CACHE_MAX_CHARS) return;
    const { default: AsyncStorage } = await import('@react-native-async-storage/async-storage');
    await AsyncStorage.setItem(`${CACHE_PREFIX}${companyId}`, raw);
  } catch {
    // Kvote eller utilgjengelig lagring: listen kommer fra Firestore uansett.
  }
}

function safeName(name) {
  return String(name || 'fil').replace(/[^\wæøåÆØÅ.\- ()]+/g, '_').slice(0, 120);
}

function blobOf(bytes, mime) {
  if (typeof Blob === 'undefined') throw new Error('Filen kan bare lagres i nettleseren.');
  return new Blob([bytes], { type: mime });
}

function base64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  if (typeof btoa === 'function') return btoa(binary);
  return Buffer.from(binary, 'binary').toString('base64');
}

export function friendlyCallError(error, fallback = 'Noe gikk galt.') {
  const message = String(error?.message || '').replace(/^FirebaseError:\s*/i, '').trim();
  const code = String(error?.code || '');
  if (code.includes('not-found') && /function|404/i.test(message)) {
    return 'Utsendingen er ikke tilgjengelig ennå. Den kommer med neste oppdatering av serveren.';
  }
  if (/internal/i.test(code) && !message) return fallback;
  return message || fallback;
}

/** Kalenderhendelse for møtet: deltakerne med innlogging ser det i Kalender. */
export function calendarEventFor(meeting, { uid = '' } = {}) {
  const m = normalizeMeeting(meeting);
  if (!m.date || m.status === 'avlyst') return null;
  const memberIds = [...new Set([
    ...m.participants.filter((p) => p.uid && p.role !== 'kopi').map((p) => p.uid),
    uid,
  ].filter(Boolean))];
  return {
    title: m.number ? `${m.title} (møte ${m.number})` : m.title,
    dateKey: m.date,
    endDateKey: m.date,
    startTime: m.start || null,
    endTime: m.end || null,
    place: m.location || (m.videoUrl ? 'Videomøte' : null),
    audience: 'selected',
    memberIds,
    color: meetingType(m.typeId).color,
    recurring: false,
    childIds: [],
    source: 'meeting',
    meetingId: m.id,
  };
}

/** Skjemaer fra Skjemabygger: bedriftens egne først, så KS-biblioteket. */
export async function loadFormSources(companyId) {
  const [{ KS_LIBRARY, libraryForm }, { normalizeFormTemplates }] = await Promise.all([
    import('../forms/ksLibrary.js'),
    import('../anbud/bidLibrary.js'),
  ]);
  let own = [];
  if (companyId) {
    try {
      const { loadAnbudState, peekAnbudState } = await import('../anbud/storage.js');
      const state = peekAnbudState(companyId) || await loadAnbudState(companyId);
      own = normalizeFormTemplates(state?.formTemplates || []);
    } catch {
      own = [];
    }
  }
  const mine = own
    .filter((form) => (form.category || 'skjema') === 'skjema' && (form.fields || []).length)
    .map((form) => ({ id: form.id, title: form.title || 'Skjema uten navn', source: 'egen', summary: form.intro || '', fields: form.fields }));
  const library = KS_LIBRARY
    .filter((row) => row.kind === 'mal' && !row.hr)
    .map((row) => {
      const form = libraryForm(row.key);
      return form ? { id: `ks_${row.key}`, title: form.title, source: 'ks', ref: row.ref, summary: row.summary, fields: form.fields } : null;
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.id === 'ks_motereferat') - Number(a.id === 'ks_motereferat'));
  return [...mine, ...library];
}

/**
 * Store mot Firestore for én bedrift.
 * `actor` = { uid, name, email } brukes til kalender og arkiv.
 */
export function createMeetingStore(companyId, actor = {}) {
  const id = text(companyId);
  return {
    demo: false,
    companyId: id,

    watchMeetings(onData, onError) {
      let live = true;
      let unsub = () => {};
      readCache(id).then((rows) => { if (live && rows) onData(rows, { source: 'cache' }); });
      firestore().then(({ db, collection, onSnapshot }) => {
        if (!live) return;
        unsub = onSnapshot(collection(db, 'families', id, 'meetings'), (snap) => {
          const rows = snap.docs.map((d) => normalizeMeeting({ ...d.data(), id: d.id }));
          onData(rows, { source: 'remote' });
          writeCache(id, rows);
        }, (error) => onError?.(error));
      }).catch((error) => onError?.(error));
      return () => { live = false; unsub(); };
    },

    /**
     * Lagrer møtet. Har noen andre lagret siden `base`, slås endringene sammen
     * per felt, deltaker og punkt (se mergeMeetingEdits).
     */
    async saveMeeting(meeting, base = null) {
      const { db, doc, runTransaction, setDoc } = await firestore();
      const local = normalizeMeeting(meeting);
      const ref = doc(db, 'families', id, 'meetings', local.id);
      const stampIt = (row) => normalizeMeeting({
        ...row,
        createdAt: row.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        updatedBy: actor.uid || row.updatedBy,
      });
      try {
        return await runTransaction(db, async (tx) => {
          const snap = await tx.get(ref);
          const remote = snap.exists() ? normalizeMeeting({ ...snap.data(), id: snap.id }) : null;
          const stale = !!(remote && base && remote.updatedAt && remote.updatedAt !== base.updatedAt);
          if (stale && isLocked(remote) && local.status === base.status) {
            const what = { ferdigstilt: 'ferdigstilt', sendt: 'ferdigstilt og sendt', avlyst: 'avlyst' }[remote.status];
            throw new Error(`Møtet ble ${what} av noen andre mens du skrev. Endringene dine er ikke lagret.`);
          }
          const next = stampIt(stale ? mergeMeetingEdits(base, local, remote) : local);
          tx.set(ref, next);
          return next;
        });
      } catch (error) {
        // Uten nett kan ikke transaksjonen lese. Da køes skrivingen og sendes når nettet er tilbake.
        const code = String(error?.code || '');
        if (!/unavailable|deadline-exceeded|failed-precondition/.test(code)) throw error;
        const next = stampIt(local);
        setDoc(ref, next).catch(() => {});
        return next;
      }
    },

    async deleteMeeting(meetingId) {
      const { db, doc, deleteDoc } = await firestore();
      await deleteDoc(doc(db, 'families', id, 'meetings', meetingId));
      await deleteDoc(doc(db, 'families', id, 'events', `meeting_${meetingId}`)).catch(() => {});
    },

    watchTemplates(onData) {
      let live = true;
      let unsub = () => {};
      firestore().then(({ db, collection, onSnapshot }) => {
        if (!live) return;
        unsub = onSnapshot(collection(db, 'families', id, 'meetingTemplates'), (snap) => {
          onData(snap.docs.map((d) => normalizeTemplate({ ...d.data(), id: d.id })));
        }, () => onData([]));
      }).catch(() => onData([]));
      return () => { live = false; unsub(); };
    },

    async saveTemplate(template) {
      const { db, doc, setDoc } = await firestore();
      const row = normalizeTemplate({ ...template, updatedAt: new Date().toISOString() });
      await setDoc(doc(db, 'families', id, 'meetingTemplates', row.id), row);
      return row;
    },

    async deleteTemplate(templateId) {
      const { db, doc, deleteDoc } = await firestore();
      await deleteDoc(doc(db, 'families', id, 'meetingTemplates', templateId));
    },

    /** Lagrer PDF i møtets mappe. Returnerer filreferanse. */
    async archiveFile(meetingId, name, bytes, mime = 'application/pdf') {
      const file = safeName(name);
      const storagePath = `families/${id}/meetings/${meetingId}/${file}`;
      const blob = blobOf(bytes, mime);
      const { uploadFile } = await import('../utils/media');
      const url = await uploadFile(storagePath, { blob, name: file, mimeType: mime }, mime);
      return { url, storagePath, name: file, mime, size: blob.size, at: new Date().toISOString() };
    },

    /** Sender innkalling eller referat. files: [{ name, mime, bytes } | { name, mime, storagePath }] */
    async sendMail({ meetingId, kind, to, extra = [], subject, text: body, replyTo, fromName, files = [] }) {
      const { guardedCallable } = await import('../utils/guardedCallable.js');
      const payload = {
        familyId: id,
        meetingId,
        kind,
        to,
        extra,
        subject,
        text: body,
        replyTo,
        fromName,
        files: files.map((f) => (f.bytes
          ? { name: f.name, mime: f.mime, base64: base64(f.bytes) }
          : { name: f.name, mime: f.mime, storagePath: f.storagePath, url: f.url })),
      };
      return guardedCallable('sendMeetingMail', payload, { timeout: 120000 });
    },

    async syncCalendar(meeting) {
      const { db, doc, setDoc, deleteDoc, serverTimestamp } = await firestore();
      const ref = doc(db, 'families', id, 'events', `meeting_${meeting.id}`);
      const event = calendarEventFor(meeting, { uid: actor.uid });
      if (!event) {
        await deleteDoc(ref).catch(() => {});
        return '';
      }
      await setDoc(ref, { ...event, createdBy: actor.uid || '', createdAt: serverTimestamp(), updatedAt: serverTimestamp() }, { merge: true });
      return ref.id;
    },

    loadForms() {
      return loadFormSources(id);
    },
  };
}
