/**
 * Spørsmål og svar fra hjelpeassistenten som kan brukes til å forbedre hjelpen
 * (helpKnowledgeCandidates, GRUNN-01). Radene lagres uten uid, og e-post,
 * telefonnummer og fødselsnummer i teksten maskeres, så de ikke kan knyttes til en bruker.
 * Navn og annet i fritekst fanges ikke opp.
 *
 * Eldre rader med uid anonymiseres, og rader eldre enn lagringstiden slettes, når
 * assistenten brukes neste gang (tidyHelpKnowledge). Ingen planlagt jobb trengs.
 */
import { FieldValue } from 'firebase-admin/firestore';
import { HELP_CANDIDATE_RETENTION_DAYS } from '../src/privacy/retentionPolicy.js';

export const HELP_CANDIDATES = 'helpKnowledgeCandidates';
/** Rader eldre enn dette slettes (ett år, src/privacy/retentionPolicy.js). */
export { HELP_CANDIDATE_RETENTION_DAYS };
/** Antall rader som ryddes per kall, så ett spørsmål aldri blir tregt. */
const TIDY_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

/** E-post, fødselsnummer (11 siffer) og norske telefonnummer (8 siffer, ev. +47) blir plassholdere. */
export function scrubFreeText(value, max = 2000) {
  return String(value ?? '')
    .replace(/[^\s@<>()]+@[^\s@<>()]+\.[a-z]{2,}/gi, '[e-post]')
    .replace(/\b\d{6}\s?\d{5}\b/g, '[fødselsnummer]')
    .replace(/(?:\+47 ?|\b0047 ?)?\b(?:\d{2} ?\d{2} ?\d{2} ?\d{2}|\d{3} ?\d{2} ?\d{3})\b/g, '[telefon]')
    .slice(0, max);
}

/** Raden som lagres. Ingen uid, e-post eller bedrift. */
export function helpKnowledgeCandidate({
  question, answer, audience, device, lang, engine, now = Date.now(),
} = {}) {
  return {
    question: scrubFreeText(question, 500),
    answer: scrubFreeText(answer, 2000),
    audience: String(audience || ''),
    device: String(device || ''),
    lang: String(lang || ''),
    engine: String(engine || ''),
    createdAtMs: now,
    reviewed: false,
  };
}

/** Endringen som anonymiserer en eldre rad: uid fjernes og teksten maskeres. */
export function anonymizedCandidatePatch(row = {}) {
  return {
    uid: FieldValue.delete(),
    question: scrubFreeText(row.question, 500),
    answer: scrubFreeText(row.answer, 2000),
  };
}

/**
 * Rydder litt hver gang: sletter rader eldre enn lagringstiden og anonymiserer rader
 * som fortsatt har uid (skrevet før GRUNN-01). Svar: { deleted, anonymized }
 */
export async function tidyHelpKnowledge(db, { now = Date.now(), limit = TIDY_LIMIT } = {}) {
  const col = db.collection(HELP_CANDIDATES);
  const cutoff = now - HELP_CANDIDATE_RETENTION_DAYS * DAY_MS;
  const [old, withUid] = await Promise.all([
    col.where('createdAtMs', '<', cutoff).limit(limit).get(),
    // orderBy tar bare med dokumenter som har feltet.
    col.orderBy('uid').limit(limit).get(),
  ]);
  const deleted = new Set(old.docs.map((row) => row.id));
  const batch = db.batch();
  old.docs.forEach((row) => batch.delete(row.ref));
  let anonymized = 0;
  for (const row of withUid.docs) {
    if (deleted.has(row.id)) continue;
    batch.update(row.ref, anonymizedCandidatePatch(row.data()));
    anonymized += 1;
  }
  if (deleted.size || anonymized) await batch.commit();
  return { deleted: deleted.size, anonymized };
}
