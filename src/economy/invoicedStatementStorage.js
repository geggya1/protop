/**
 * Mellomlagring av utfakturert oppstilling.
 * Fakturalisten skriver den samme veien som sin egen visning: lokalt med en gang,
 * og til families/{companyId}/economy/invoicedStatement så landingssiden kan vise
 * tallene før hele fakturalisten er lest på nytt.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { buildInvoicedStatement } from './invoicedStatement.js';

const KEY = 'protop.invoicedStatement.v1';

function storageKey(companyId) {
  return `${KEY}.${companyId}`;
}

function statementRef(companyId) {
  return doc(db, 'families', companyId, 'economy', 'invoicedStatement');
}

function stableString(value) {
  return JSON.stringify(value, (_, item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.keys(item).sort().reduce((acc, key) => {
      acc[key] = item[key];
      return acc;
    }, {});
  });
}

export function normalizeStoredStatement(value) {
  if (!value || typeof value !== 'object') return null;
  if (!Array.isArray(value.chartYears) || !Array.isArray(value.allYears)) return null;
  if (!value.monthly || typeof value.monthly !== 'object') return null;
  return value;
}

async function readLocal(companyId) {
  if (!companyId) return null;
  try {
    const raw = await AsyncStorage.getItem(storageKey(companyId));
    if (!raw) return null;
    return normalizeStoredStatement(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function writeLocal(companyId, payload) {
  await AsyncStorage.setItem(storageKey(companyId), JSON.stringify(payload));
}

export async function readInvoicedStatement(companyId) {
  const id = String(companyId || '').trim();
  if (!id) return null;
  const local = await readLocal(id);
  if (local) return local;
  try {
    const snap = await getDoc(statementRef(id));
    if (!snap.exists()) return null;
    const stored = normalizeStoredStatement(snap.data());
    if (stored) await writeLocal(id, stored).catch(() => {});
    return stored;
  } catch {
    return null;
  }
}

function withoutSavedAt(statement) {
  if (!statement || typeof statement !== 'object') return statement;
  const { savedAt, ...rest } = statement;
  return rest;
}

export async function persistInvoicedStatement(companyId, statement) {
  const id = String(companyId || '').trim();
  if (!id || !statement) return null;
  const existing = await readLocal(id);
  if (existing && stableString(withoutSavedAt(existing)) === stableString(statement)) {
    return existing;
  }
  const payload = {
    ...statement,
    version: 1,
    savedAt: new Date().toISOString(),
  };
  try {
    await writeLocal(id, payload);
  } catch {
    // Nettleserkvoten kan være full. Skykopien under er nok til neste åpning.
  }
  await setDoc(statementRef(id), payload);
  return payload;
}

const jobs = new Map();
const latest = new Map();
const written = new Map();

function kickStatementSave(id) {
  if (!id || jobs.has(id)) return;
  const run = async () => {
    while (latest.get(id) && latest.get(id).body !== written.get(id)) {
      const next = latest.get(id);
      try {
        await persistInvoicedStatement(id, next.statement);
        written.set(id, next.body);
      } catch {
        if (latest.get(id)?.body === next.body) latest.delete(id);
        break;
      }
    }
  };
  jobs.set(id, run().finally(() => {
    jobs.delete(id);
    if (latest.get(id) && latest.get(id).body !== written.get(id)) kickStatementSave(id);
  }));
}

/** Kalles når fakturalisten er lest fra Firestore. Hopper over uendret innhold. */
export function rememberInvoicedStatement(companyId, invoices, options = {}) {
  const id = String(companyId || '').trim();
  if (!id) return null;
  let statement = null;
  try {
    statement = buildInvoicedStatement(invoices, options);
  } catch {
    return null;
  }
  const body = stableString(statement);
  latest.set(id, { body, statement });
  if (written.get(id) !== body) kickStatementSave(id);
  return statement;
}
