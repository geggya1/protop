import { fitAnbudState } from './model.js';

export const ANBUD_LOCAL_KEY = 'protop.anbud.v1';

export function anbudLocalKey(companyId) {
  const id = String(companyId || '').trim();
  return id ? `${ANBUD_LOCAL_KEY}.${id}` : ANBUD_LOCAL_KEY;
}

export function isQuotaError(err) {
  const name = String(err?.name || '');
  const message = String(err?.message || '');
  return name === 'QuotaExceededError'
    || name === 'NS_ERROR_DOM_QUOTA_REACHED'
    || name === 'SecurityError'
    || err?.code === 22
    || err?.code === 1014
    || /quota/i.test(message)
    || /operation is insecure/i.test(message);
}

/**
 * Nettleseren er en cache. Når den er full eller stengt, er skyen nok
 * så lenge bedriften er kjent. Feilen kastes bare når ingen av dem tar imot.
 */
export async function saveWhereItFits({ companyId, writeLocal, writeRemote }) {
  try {
    await writeLocal();
    return 'local';
  } catch (localError) {
    if (!String(companyId || '').trim()) throw localError;
    try {
      await writeRemote();
      return 'remote';
    } catch {
      throw localError;
    }
  }
}

async function putPayload(storage, companyId, key, payload) {
  try {
    await storage.setItem(key, payload);
  } catch (err) {
    if (!isQuotaError(err)) throw err;
    if (companyId && key !== ANBUD_LOCAL_KEY) {
      try { await storage.removeItem(ANBUD_LOCAL_KEY); } catch { /* den gamle kopien får stå */ }
    }
    try {
      await storage.setItem(key, payload);
    } catch (again) {
      if (!isQuotaError(again)) throw again;
      let previous = null;
      try { previous = await storage.getItem(key); } catch { previous = null; }
      try { await storage.removeItem(key); } catch { /* nøkkelen kan alt være borte */ }
      try {
        await storage.setItem(key, payload);
      } catch (finalErr) {
        if (previous != null) {
          try { await storage.setItem(key, previous); } catch { /* forrige kopi får ikke plass */ }
        }
        throw finalErr;
      }
    }
  }
  if (companyId && key !== ANBUD_LOCAL_KEY) {
    try { await storage.removeItem(ANBUD_LOCAL_KEY); } catch { /* dobbeltkopien er valgfri */ }
  }
}

/** Skriver en tilpasset kopi. Ved full nettleser fjernes den gamle dobbeltkopien og forsøket gjentas. */
export async function storeAnbudPayload(storage, companyId, state) {
  const key = anbudLocalKey(companyId);
  const budgets = [800_000, 350_000, 120_000];
  let lastError = null;
  for (const budget of budgets) {
    let payload = '';
    try {
      payload = JSON.stringify(fitAnbudState(state, budget));
    } catch (err) {
      lastError = err;
      continue;
    }
    try {
      await putPayload(storage, companyId, key, payload);
      return payload;
    } catch (err) {
      lastError = err;
      if (!isQuotaError(err)) throw err;
    }
  }
  throw lastError || new Error('Kunne ikke lagre varslingen.');
}
