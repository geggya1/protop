/**
 * Forbruksloggen for AI-assistenten. Bare serveren skriver her (firestore.rules).
 *
 *   families/{c}/aiLedger/{yyyy-mm}             summer for måneden, også per modell
 *   families/{c}/aiLedger/{yyyy-mm}/users/{uid} summer per person
 *   families/{c}/aiLedgerEntries/{id}           én rad per kall, uten innholdet i samtalen
 *
 * Radene per kall får expireAt (13 måneder), så en TTL-policy kan rydde dem etter fakturering.
 */
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { crossedAlertThresholds } from '../aiAssistentSrc.js';

export const ENTRY_RETENTION_MONTHS = 13;

export function ledgerRefs(db, companyId, month, uid) {
  const monthRef = db.doc(`families/${companyId}/aiLedger/${month}`);
  return {
    monthRef,
    userRef: uid ? monthRef.collection('users').doc(uid) : null,
    entryRef: db.collection(`families/${companyId}/aiLedgerEntries`).doc(),
  };
}

/** Forbruket så langt denne måneden, for bedriften og personen. */
export async function readSpend(db, companyId, month, uid) {
  const { monthRef, userRef } = ledgerRefs(db, companyId, month, uid);
  const [monthSnap, userSnap] = await Promise.all([
    monthRef.get(),
    userRef ? userRef.get() : Promise.resolve(null),
  ]);
  const monthData = monthSnap.exists ? monthSnap.data() || {} : {};
  const userData = userSnap?.exists ? userSnap.data() || {} : {};
  return {
    monthSpentNok: Number(monthData.costNok) || 0,
    userSpentNok: Number(userData.costNok) || 0,
    alertsSent: Array.isArray(monthData.alertsSent) ? monthData.alertsSent : [],
  };
}

function expireAt(now) {
  const d = new Date(now.getTime());
  d.setMonth(d.getMonth() + ENTRY_RETENTION_MONTHS);
  return Timestamp.fromDate(d);
}

/** Feltene som økes i både månedsdokumentet og persondokumentet. */
export function usageIncrements(usage, cost) {
  return {
    calls: FieldValue.increment(1),
    costNok: FieldValue.increment(cost.nok),
    costUsd: FieldValue.increment(cost.usd),
    inputTokens: FieldValue.increment(usage.inputTokens || 0),
    cachedInputTokens: FieldValue.increment(usage.cachedInputTokens || 0),
    cacheWriteTokens: FieldValue.increment(usage.cacheWriteTokens || 0),
    outputTokens: FieldValue.increment(usage.outputTokens || 0),
  };
}

/** Raden for ett kall. Bare tall og navn på funksjonen, aldri spørsmål, svar eller filinnhold. */
export function ledgerEntry({
  month, uid, feature, model, provider, tier, usage, cost, toolCalls = 0, now = new Date(),
}) {
  return {
    month,
    uid,
    feature: String(feature || 'chat').slice(0, 40),
    model,
    provider,
    tier,
    inputTokens: usage.inputTokens || 0,
    cachedInputTokens: usage.cachedInputTokens || 0,
    cacheWriteTokens: usage.cacheWriteTokens || 0,
    outputTokens: usage.outputTokens || 0,
    toolCalls: Number(toolCalls) || 0,
    costNok: cost.nok,
    costUsd: cost.usd,
    priceVersion: cost.priceVersion,
    createdAt: FieldValue.serverTimestamp(),
    expireAt: expireAt(now),
  };
}

/**
 * Fører ett kall. Kjører i en transaksjon, så varslene (50/80/100 %) sendes én gang
 * selv om flere kall går samtidig. Svarer { crossed: [50, ...], monthSpentNok }.
 */
export async function recordUsage(db, {
  companyId, uid, userName = '', month, feature, model, provider, tier, usage, cost,
  budgetNok = 0, toolCalls = 0, now = new Date(),
}) {
  const { monthRef, userRef, entryRef } = ledgerRefs(db, companyId, month, uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(monthRef);
    const data = snap.exists ? snap.data() || {} : {};
    const before = Number(data.costNok) || 0;
    const after = before + cost.nok;
    const sent = Array.isArray(data.alertsSent) ? data.alertsSent : [];
    const crossed = crossedAlertThresholds(budgetNok, before, after, sent);
    const inc = usageIncrements(usage, cost);

    tx.set(monthRef, {
      month,
      ...inc,
      byModel: { [model]: { calls: inc.calls, costNok: inc.costNok } },
      ...(crossed.length ? { alertsSent: FieldValue.arrayUnion(...crossed) } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(userRef, {
      uid,
      ...(userName ? { name: String(userName).slice(0, 80) } : {}),
      ...inc,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    tx.set(entryRef, ledgerEntry({
      month, uid, feature, model, provider, tier, usage, cost, toolCalls, now,
    }));
    return { crossed, monthSpentNok: Math.round(after * 100) / 100 };
  });
}
