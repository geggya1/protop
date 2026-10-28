/**
 * Lønnskartlegging fordelt på kjønn (likestillings- og diskrimineringsloven §§ 26 og 26 a, ARP).
 * Gjennomsnitt og median av gjeldende årslønn per stillingskategori, for kvinner og menn.
 * Grupper med færre enn minGroup personer av ett kjønn vises ikke, så ingen kan kjennes igjen.
 * Kjønn kommer fra ansattregisteret (person.gender), lønn og stilling fra HR.
 */
import { activeContractFor, currentSalaryFor, employeeHrBucket } from './model.js';

export const PAY_GAP_MIN_GROUP = 3;

function text(value) {
  return String(value ?? '').trim();
}

/** 'kvinne', 'mann', 'annet' eller '' når kjønn ikke er registrert. */
export function genderOf(employee) {
  const raw = text(employee?.person?.gender).toLowerCase();
  if (/^(k|kvinne|f|female|woman)$/.test(raw)) return 'kvinne';
  if (/^(m|mann|male|man)$/.test(raw)) return 'mann';
  return raw ? 'annet' : '';
}

/** Stillingskategori: stillingen i aktiv avtale, ellers tittelen i ansattregisteret. */
export function payCategoryOf(employee, contracts = []) {
  const contract = activeContractFor(employee?.id, contracts);
  return text(contract?.positionTitle) || text(employee?.company?.title) || 'Uten stilling';
}

function stats(amounts) {
  if (!amounts.length) return { count: 0, average: 0, median: 0 };
  const sorted = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    count: sorted.length,
    average: Math.round(sorted.reduce((sum, n) => sum + n, 0) / sorted.length),
    median: Math.round(median),
  };
}

function ratio(women, men) {
  return women.count && men.count && men.average ? Math.round((women.average / men.average) * 1000) / 10 : null;
}

/**
 * { categories, total, people, missingGender, missingSalary, minGroup, onDate }.
 * Kategori: { category, women, men, other, ratio, hidden } der women/men er { count, average, median }
 * og hidden betyr at minst ett kjønn har færre enn minGroup og tallene ikke vises.
 */
export function payGapReport({
  employees = [],
  salaries = [],
  contracts = [],
  onDate = new Date(),
  minGroup = PAY_GAP_MIN_GROUP,
} = {}) {
  const groups = new Map();
  const all = { kvinne: [], mann: [] };
  let missingGender = 0;
  let missingSalary = 0;
  let people = 0;
  for (const employee of employees || []) {
    if (!employee?.id || employeeHrBucket(employee) !== 'active') continue;
    const salary = currentSalaryFor(employee.id, salaries, { onDate });
    const amount = Number(salary?.annualAmount) || 0;
    const gender = genderOf(employee);
    if (!amount) {
      missingSalary += 1;
      continue;
    }
    if (!gender) {
      missingGender += 1;
      continue;
    }
    people += 1;
    const category = payCategoryOf(employee, contracts);
    const group = groups.get(category) || { kvinne: [], mann: [], annet: 0 };
    if (gender === 'annet') group.annet += 1;
    else {
      group[gender].push(amount);
      all[gender].push(amount);
    }
    groups.set(category, group);
  }
  const hide = (women, men) => (women.count > 0 && women.count < minGroup) || (men.count > 0 && men.count < minGroup);
  const categories = [...groups.entries()].map(([category, group]) => {
    const women = stats(group.kvinne);
    const men = stats(group.mann);
    const hidden = hide(women, men);
    return {
      category,
      women: hidden ? { count: women.count, average: null, median: null } : women,
      men: hidden ? { count: men.count, average: null, median: null } : men,
      other: group.annet,
      ratio: hidden ? null : ratio(women, men),
      hidden,
    };
  }).sort((a, b) => (b.women.count + b.men.count) - (a.women.count + a.men.count) || a.category.localeCompare(b.category, 'nb'));
  const women = stats(all.kvinne);
  const men = stats(all.mann);
  const totalHidden = hide(women, men);
  return {
    categories,
    total: {
      women: totalHidden ? { count: women.count, average: null, median: null } : women,
      men: totalHidden ? { count: men.count, average: null, median: null } : men,
      ratio: totalHidden ? null : ratio(women, men),
      hidden: totalHidden,
    },
    people,
    missingGender,
    missingSalary,
    minGroup,
  };
}
