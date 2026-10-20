/**
 * Prosjektspesifikke fakturainnstillinger.
 * Tomme / inherit-felt arver fra selskapets Økonomi → Innstillinger.
 */

import {
  normalizeCompanyInvoiceDefaults,
  resolveCompanyInvoiceDefaults,
} from '../economy/companyInvoiceDefaults.js';
import { resolveStandardAccounts, accountOptionLabel, resolveCompanyAccounts } from '../economy/companyChart.js';

function text(value) {
  return String(value ?? '').trim();
}

function numOrNull(value) {
  if (value === '' || value == null) return null;
  const n = Number(String(value).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Felt som kan arves (null = bruk selskapstandard). */
export const INHERITABLE_KEYS = [
  'creditDays',
  'invoiceLanguage',
  'ourReferenceMode',
  'dueDateMode',
  'showPeriod',
  'showUnit',
  'showSubtotal',
  'groupLinesBy',
  'periodization',
  'groupExpensesBy',
  'groupSalesBy',
  'groupHoursBy',
  'hoursVisibility',
  'standardLineTextHours',
  'showBillingSummary',
  'summaryPlacement',
  'includeExpensesInSummary',
  'includeSalesInSummary',
  'showTimeSummaryPerActivity',
  'attachTimeSpec',
  'showHourlyEntries',
  'showFixedEntries',
  'groupTimeEntriesBy',
  'timeSpecShowEmployee',
  'timeSpecShowRole',
  'timeSpecShowActivity',
  'timeSpecShowTask',
  'timeSpecShowTags',
  'timeSpecShowDescription',
  'timeSpecShowRate',
  'timeSpecShowAmount',
  'timeSpecShowActualHours',
  'timeSpecShowNonBillable',
  'requireInvoiceAttachment',
  'copyExpenseAttachments',
  'markupHourly',
  'markupFixed',
  'markupExpenseHourly',
  'markupExpenseFixed',
  'discountHours',
  'discountProducts',
  'adminMarkupPercent',
  'adminAmount',
  'adminOnFixed',
  'adminOnHourly',
  'adminOnExpenses',
  'adminOnProducts',
  'ehfMergePdf',
  'ehfAlsoEmail',
  'ehfAttachPdf',
  'introText',
  'footerText',
  'accountFees',
  'accountHours',
  'accountExpenses',
  'accountProducts',
  'accountAdmin',
  'accountAconto',
  'accountingDepartment',
  'accountingProject',
];

/** Prosjekt-only tekstfelter (alltid prosjektnivå, tom = ingen verdi). */
export const PROJECT_TEXT_KEYS = [
  'theirReference',
  'orderReference',
  'contractReference',
  'customerContactId',
  'addressLineAbove',
  'addressLineBelow',
];

export function emptyProjectInvoiceSettings() {
  const inherit = {};
  for (const key of INHERITABLE_KEYS) inherit[key] = null;
  const texts = {};
  for (const key of PROJECT_TEXT_KEYS) texts[key] = '';
  return {
    ...inherit,
    ...texts,
    invoiceCountExternal: null,
  };
}

function normalizeTriBool(value) {
  if (value === true || value === 'yes' || value === 'ja') return true;
  if (value === false || value === 'no' || value === 'nei') return false;
  return null;
}

/**
 * Normaliser prosjektinnstillinger. null / '' / 'inherit' betyr arv.
 */
export function normalizeProjectInvoiceSettings(raw = {}) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const base = emptyProjectInvoiceSettings();
  const companyShape = normalizeCompanyInvoiceDefaults({});
  const next = { ...base };

  for (const key of INHERITABLE_KEYS) {
    if (src[key] === undefined) continue;
    const sample = companyShape[key];
    if (src[key] === null || src[key] === '' || src[key] === 'inherit') {
      next[key] = null;
      continue;
    }
    if (typeof sample === 'boolean') {
      next[key] = normalizeTriBool(src[key]);
    } else if (typeof sample === 'number') {
      next[key] = numOrNull(src[key]);
    } else {
      next[key] = text(src[key]).slice(0, key.endsWith('Text') ? 4000 : 200) || null;
    }
  }

  for (const key of PROJECT_TEXT_KEYS) {
    if (src[key] !== undefined) next[key] = text(src[key]).slice(0, 500);
  }
  if (src.invoiceCountExternal !== undefined) {
    next.invoiceCountExternal = numOrNull(src.invoiceCountExternal);
  }
  return next;
}

/**
 * Effektiv fakturakonfig for et prosjekt: selskapstandard + prosjekt-overstyringer.
 * Returnerer også meta om hvilke felt som er overstyrt.
 */
export function resolveProjectInvoiceSettings(state, project) {
  const company = resolveCompanyInvoiceDefaults(state);
  const accounts = resolveStandardAccounts(state);
  const chart = resolveCompanyAccounts(state);
  const byCode = new Map(chart.map((row) => [row.code, row]));
  const projectSettings = normalizeProjectInvoiceSettings(project?.invoiceSettings);
  const effective = { ...company };
  const overridden = [];

  for (const key of INHERITABLE_KEYS) {
    const override = projectSettings[key];
    if (override === null || override === undefined) continue;
    // Kontofelter arver fra standardkontoer når ikke satt på selskap-invoice-defaults
    effective[key] = override;
    overridden.push(key);
  }

  // Konto-default fra standardkontoer hvis ikke overstyrt
  const accountMap = {
    accountFees: accounts.domestic.fees,
    accountHours: accounts.domestic.hours,
    accountExpenses: accounts.domestic.expenses,
    accountProducts: accounts.domestic.products,
    accountAdmin: accounts.domestic.admin,
    accountAconto: accounts.domestic.aconto,
  };
  for (const [key, code] of Object.entries(accountMap)) {
    if (projectSettings[key] != null && projectSettings[key] !== '') {
      effective[key] = projectSettings[key];
    } else if (effective[key] == null || effective[key] === '') {
      effective[key] = code;
    }
  }

  for (const key of PROJECT_TEXT_KEYS) {
    effective[key] = projectSettings[key] || company[`${key}Default`] || '';
  }
  effective.invoiceCountExternal = projectSettings.invoiceCountExternal;

  const accountLabels = {};
  for (const key of Object.keys(accountMap)) {
    const code = effective[key];
    const row = byCode.get(code);
    accountLabels[key] = row ? accountOptionLabel(row) : (code || 'Ikke satt');
  }

  return {
    company,
    project: projectSettings,
    effective,
    overridden,
    accountLabels,
    accounts,
    inheritsAll: overridden.length === 0,
    sourceLabel: overridden.length
      ? `Prosjekt overstyrer ${overridden.length} felt · øvrige fra Økonomi`
      : 'Alle verdier arves fra Økonomi → Innstillinger',
  };
}

/** Sett ett felt til arv (null) eller overstyring. */
export function patchProjectInvoiceSetting(current, key, value) {
  const base = normalizeProjectInvoiceSettings(current);
  if (INHERITABLE_KEYS.includes(key)) {
    if (value === 'inherit' || value === null || value === '') {
      return { ...base, [key]: null };
    }
    return normalizeProjectInvoiceSettings({ ...base, [key]: value });
  }
  return normalizeProjectInvoiceSettings({ ...base, [key]: value });
}

/** Nullstill alle arvelige felt tilbake til selskapstandard. */
export function restoreProjectInvoiceDefaults(current = {}) {
  const texts = {};
  const src = normalizeProjectInvoiceSettings(current);
  for (const key of PROJECT_TEXT_KEYS) texts[key] = src[key];
  return {
    ...emptyProjectInvoiceSettings(),
    ...texts,
    invoiceCountExternal: src.invoiceCountExternal,
  };
}

/** Kredittid brukt ved fakturaopprettelse for prosjektet. */
export function effectiveCreditDays(state, project, fallback = 14) {
  const resolved = resolveProjectInvoiceSettings(state, project);
  const days = resolved.effective.creditDays;
  return Number.isFinite(days) && days >= 0 ? days : fallback;
}
