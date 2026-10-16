/**
 * Kildeside for et widget på fraværsoversikten.
 * Antall ansatte kommer fra ansattregisteret. Dagene kommer fra fraværsrapporten.
 * Planlagte dager kommer fra planlagt fravær.
 */
import { absenceCategory } from './absenceDashboard.js';

const CATEGORIES = new Set(['ferie', 'sykdom', 'permisjon', 'annet']);

export function monthKeyEnd(key) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(key || ''));
  if (!match) return '';
  const last = new Date(Number(match[1]), Number(match[2]), 0).getDate();
  return `${match[1]}-${match[2]}-${String(last).padStart(2, '0')}`;
}

function person(employeeId) {
  return String(employeeId || '').trim();
}

function categoryFilter(category) {
  const id = String(category || 'ferie');
  if (CATEGORIES.has(id)) return { category: id, typeId: '' };
  return { category: absenceCategory(id), typeId: id };
}

function report({
  category = '',
  typeId = '',
  employeeId = '',
  period = 'all',
  fromDate = '',
  toDate = '',
}) {
  return {
    tab: 'arbeid',
    subView: 'fravaersrapport',
    intent: {
      type: 'absenceReportFocus',
      category,
      typeId,
      employeeId: person(employeeId),
      period,
      fromDate: fromDate || '',
      toDate: toDate || '',
    },
  };
}

function employees(employeeId) {
  const id = person(employeeId);
  if (!id) return { tab: 'ansatte', subView: null, intent: null };
  return {
    tab: 'ansatte',
    subView: null,
    intent: { type: 'openEmployee', employeeId: id, view: 'absence' },
  };
}

function planned(employeeId) {
  const id = person(employeeId);
  return {
    tab: 'arbeid',
    subView: 'planlagt',
    intent: id ? { type: 'plannedAbsenceFocus', employeeId: id } : null,
  };
}

/**
 * @param {string} widget
 * @returns {{ tab: string, subView: string|null, intent: object|null }|null}
 */
export function absenceWidgetDestination(widget, {
  employeeId = '',
  category = 'ferie',
  today = '',
  fromDate = '',
  toDate = '',
} = {}) {
  const id = person(employeeId);
  if (widget === 'headcount' || widget === 'earned') return employees(id);
  if (widget === 'planned') return planned(id);
  if (widget === 'away-ferie' || widget === 'away-sykdom' || widget === 'away-annet') {
    const start = fromDate || today;
    const end = toDate || today;
    return report({
      category: widget.slice('away-'.length),
      employeeId: id,
      period: start && end ? 'custom' : 'all',
      fromDate: start,
      toDate: end,
    });
  }
  if (widget === 'chart') {
    return report({
      employeeId: id,
      period: fromDate && toDate ? 'custom' : 'year',
      fromDate,
      toDate,
    });
  }
  if (widget === 'usage' || widget === 'detail' || widget === 'used' || widget === 'remaining' || widget === 'unplanned') {
    return report({
      ...categoryFilter(category),
      employeeId: id,
      period: 'year',
    });
  }
  return null;
}
