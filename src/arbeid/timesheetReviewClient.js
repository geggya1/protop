import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';

function text(value) {
  return String(value || '').trim();
}

/**
 * Be Gemini lese låste føringer. Lokal gjennomgang vises uansett.
 * @returns {Promise<{ findings: object[], engine: string }>}
 */
export async function scanTimesheetWithAi(entries) {
  const rows = (entries || []).slice(0, 80).map((row) => ({
    id: text(row.id).slice(0, 60),
    date: text(row.date).slice(0, 10),
    hours: Number(row.hours) || 0,
    projectName: text(row.projectName).slice(0, 80),
    description: text(row.description).slice(0, 240),
  })).filter((row) => row.id);
  if (!rows.length) return { findings: [], engine: 'local' };
  const fn = httpsCallable(functions, 'scanTimesheetReview', { timeout: 45000 });
  const result = await fn({ entries: rows });
  const data = result?.data || {};
  const findings = Array.isArray(data.findings) ? data.findings : [];
  return { findings, engine: text(data.engine) || 'gemini' };
}
