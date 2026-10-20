/**
 * Endringer i fraværstyper, kontoplan og standardkontoer.
 * Ren state inn / state ut, lagres sammen med prosjektstate.
 */

import { normalizeAbsenceType, resolveAbsenceTypes } from '../arbeid/absenceCatalog.js';
import {
  normalizeCompanyAccount,
  resolveCompanyAccounts,
  resolveStandardAccounts,
  standardAccountRows,
} from '../economy/companyChart.js';
import { normalizeCompanyInvoiceDefaults } from '../economy/companyInvoiceDefaults.js';

function text(value) {
  return String(value || '').trim();
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function stamp() {
  return new Date().toISOString();
}

function fail(state, error) {
  return { ok: false, state, error };
}

function ok(state) {
  return { ok: true, state, error: null };
}

function slug(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32);
}

export function upsertAbsenceType(state, input = {}) {
  const label = text(input.label);
  if (!label) return fail(state, 'Skriv inn navn på fraværstypen.');
  const current = resolveAbsenceTypes(state);
  let id = text(input.id);
  if (!id) {
    const base = slug(label) || 'fravaer';
    id = current.some((row) => row.id === base) ? createId(base) : base;
  } else if (!current.some((row) => row.id === id)) {
    return fail(state, 'Fraværstypen finnes ikke.');
  }
  const nextRow = normalizeAbsenceType({
    ...input,
    id,
    label,
    legacy: false,
    custom: true,
    builtin: false,
    updatedAt: stamp(),
  });
  const absenceTypes = current.some((row) => row.id === id)
    ? current.map((row) => (row.id === id ? nextRow : row))
    : [...current, nextRow];
  return ok({ ...state, absenceTypes, absenceTypesCustom: true });
}

export function deleteAbsenceType(state, id) {
  const key = text(id);
  const current = resolveAbsenceTypes(state);
  if (!current.some((row) => row.id === key)) return fail(state, 'Fraværstypen finnes ikke.');
  return ok({
    ...state,
    absenceTypes: current.filter((row) => row.id !== key),
    absenceTypesCustom: true,
  });
}

export function upsertCompanyAccount(state, input = {}) {
  const code = text(input.code);
  if (!/^\d{3,8}$/.test(code)) return fail(state, 'Kontonummer må være 3 til 8 siffer.');
  const name = text(input.name);
  if (!name) return fail(state, 'Skriv inn navn på kontoen.');
  const current = resolveCompanyAccounts(state);
  const id = text(input.id) || code;
  if (current.some((row) => row.code === code && row.id !== id)) {
    return fail(state, 'Kontonummeret er allerede i bruk.');
  }
  const nextRow = {
    ...normalizeCompanyAccount({ ...input, id, code, name }),
    updatedAt: stamp(),
  };
  const companyAccounts = current.some((row) => row.id === id)
    ? current.map((row) => (row.id === id ? nextRow : row))
    : [...current, nextRow].sort((a, b) => a.code.localeCompare(b.code, 'nb'));
  return ok({ ...state, companyAccounts, companyAccountsCustom: true });
}

export function deleteCompanyAccount(state, id) {
  const key = text(id);
  const current = resolveCompanyAccounts(state);
  if (!current.some((row) => row.id === key)) return fail(state, 'Kontoen finnes ikke.');
  return ok({
    ...state,
    companyAccounts: current.filter((row) => row.id !== key),
    companyAccountsCustom: true,
  });
}

export function saveStandardAccounts(state, draft) {
  const base = resolveStandardAccounts(state);
  const next = {
    domestic: { ...base.domestic, ...(draft?.domestic || {}) },
    foreign: { ...base.foreign, ...(draft?.foreign || {}) },
    rounding: draft?.rounding == null ? base.rounding : String(draft.rounding),
  };
  const now = stamp();
  return ok({
    ...state,
    standardAccounts: standardAccountRows(next).map((row) => ({ ...row, updatedAt: now })),
  });
}

/** Lagre selskapets faktura-/økonomistandarder som prosjekter arver. */
export function saveCompanyInvoiceDefaults(state, draft = {}) {
  const next = normalizeCompanyInvoiceDefaults(draft);
  return ok({
    ...state,
    companyInvoiceDefaults: { ...next, updatedAt: stamp() },
  });
}
