/**
 * Det som bør ses over før en importert CV lagres.
 * Manglende felt og avvik fra innlesingen samles her, ikke i skjemafeltene.
 */
import { gapReport, normalizeEmployee } from './model.js';

function text(value) {
  return String(value || '').trim();
}

export function cutoffTitle(title) {
  const value = text(title);
  if (!value) return false;
  if (value.length < 8) return true;
  if (/[(/–-]$/.test(value)) return true;
  if (/\bog$/i.test(value)) return true;
  if (/^\[/.test(value)) return true;
  return false;
}

export function cvAttention(employee) {
  const row = normalizeEmployee(employee);
  const gaps = gapReport(row).cv;
  const issues = [];
  if (!text(row.person?.photoUrl)) {
    issues.push({ tone: 'warn', text: 'Profilbildet mangler.' });
  }
  const projects = row.cv?.projects || [];
  const withoutImage = projects.filter((project) => !(project.images || []).length);
  if (projects.length && withoutImage.length) {
    issues.push({
      tone: 'warn',
      text: withoutImage.length === 1
        ? `Prosjektet «${withoutImage[0].title || 'Uten tittel'}» mangler bilde.`
        : `${withoutImage.length} prosjekter mangler bilde.`,
    });
  }
  const cutoffs = projects.filter((project) => cutoffTitle(project.title));
  for (const project of cutoffs.slice(0, 6)) {
    issues.push({ tone: 'warn', text: `Avkuttet tittel: ${project.title}` });
  }
  if (cutoffs.length > 6) {
    issues.push({ tone: 'warn', text: `${cutoffs.length - 6} titler til ser avkuttet ut.` });
  }
  return { gaps, issues };
}
