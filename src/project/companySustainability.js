/**
 * Bærekraft på bedriftssiden: bedriftens egen tekst og det som allerede står i ISO.
 * ISO 14001 krever at miljøpolicyen er tilgjengelig for interessenter, så publisert policy,
 * gyldige sertifikater og miljømål hentes derfra i stedet for å skrives to ganger.
 *
 * Bare publisert innhold: policy med publisert revisjon, ikke arkivert og tilgangsklasse Intern
 * (Begrenset og Skjermet vises aldri). Sertifikater med status Gyldig. Miljømål som er aktive eller nådd.
 */
import { standardLabel } from '../iso/catalog.js';
import { publishedRevisionOf } from '../iso/documents.js';
import { objectiveProgress } from '../iso/registers.js';

export const SUSTAINABILITY_NEWS = ['baerekraft', 'ledelsessystem'];

function text(value) {
  return String(value ?? '').trim();
}

function recordsOf(parts, register) {
  const records = parts?.records;
  if (Array.isArray(records)) return records.filter((row) => row?.register === register);
  return Array.isArray(records?.[register]) ? records[register] : [];
}

function goalTarget(record) {
  const target = text(record?.target);
  if (!target) return '';
  const unit = text(record?.unit);
  const verb = record?.direction === 'Redusere' ? 'Ned til' : 'Opp til';
  return `${verb} ${target}${unit ? ` ${unit}` : ''}`;
}

/** { standards, certificates, policy, goals } fra ISO-delene loadIsoProfileParts gir. */
export function isoSustainability(parts) {
  const system = parts?.system || {};
  const setUp = Array.isArray(system.standards) && system.standards.length && text(system.setupAt);
  const standards = setUp ? system.standards.map((code) => standardLabel(code, system.editions)) : [];

  const certificates = recordsOf(parts, 'sertifikat')
    .filter((row) => row?.state === 'gyldig' && text(row?.title))
    .map((row) => ({
      id: text(row.id),
      title: text(row.title),
      body: text(row.certBody),
      number: text(row.certNumber),
      validTo: text(row.validTo),
      scope: text(row.scopeText),
    }))
    .sort((a, b) => a.title.localeCompare(b.title, 'nb'));

  const policies = (Array.isArray(parts?.documents) ? parts.documents : [])
    .filter((row) => row?.docType === 'policy' && !row.archived && Number(row.publishedRevision) > 0)
    .filter((row) => (row.accessClass || 'intern') === 'intern')
    .map((row) => ({ row, revision: publishedRevisionOf(row) }))
    .filter((item) => text(item.revision?.content))
    .sort((a, b) => text(b.revision.publishedAt).localeCompare(text(a.revision.publishedAt)));
  const first = policies[0];
  const policy = first ? {
    id: text(first.row.id),
    title: text(first.row.title) || 'Policy',
    content: text(first.revision.content),
    publishedAt: text(first.revision.publishedAt || first.revision.effectiveFrom),
    revision: Number(first.row.publishedRevision) || 0,
  } : null;

  const goals = recordsOf(parts, 'mal')
    .filter((row) => row?.domain === 'Miljø' && (row.state === 'aktiv' || row.state === 'nådd') && text(row.title))
    .map((row) => {
      const progress = objectiveProgress(row);
      return {
        id: text(row.id),
        title: text(row.title),
        target: goalTarget(row),
        deadline: text(row.deadline),
        reached: row.state === 'nådd' || progress.status === 'naadd',
        progress: progress.status === 'ingen_data' ? '' : progress.label,
        pct: progress.pct ?? null,
      };
    });

  return { standards, certificates, policy, goals };
}

export function hasIsoSustainability(iso) {
  return !!(iso && (iso.standards.length || iso.certificates.length || iso.policy || iso.goals.length));
}

/** Starten av en lang Markdown-tekst: hele avsnitt til omtrent max tegn. */
export function markdownExcerpt(value, max = 900) {
  const src = text(value);
  if (src.length <= max) return { text: src, clipped: false };
  const parts = src.split(/\n{2,}/);
  let out = '';
  for (const part of parts) {
    if (out && out.length + part.length > max) break;
    out = out ? `${out}\n\n${part}` : part;
  }
  if (out.length > max * 1.6) out = `${out.slice(0, max).replace(/\s+\S*$/, '')}…`;
  return { text: out, clipped: out.length < src.length };
}
