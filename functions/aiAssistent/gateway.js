/**
 * Gatewayen for AI-assistenten. Alle kall går hit, aldri direkte til en leverandør:
 *
 *   1. Er personen medlem, og har bedriften slått på AI-assistenten og AI under personvern?
 *   2. Er personen innleid/ekstern, og er det tillatt?
 *   3. Er det budsjett igjen for bedriften og personen? (aiAccessDecision)
 *   4. Velg modell for nivået (router.js), med tak på tokens og verktøykall.
 *   5. Gjør kallet (`call`, leverandøren kommer i fase 3).
 *   6. Pris forbruket (pricing.js) og før det i loggen (ledger.js).
 *
 * Ingen leverandør kalles uten at 1–4 er sjekket, og ingen kall føres uten pris.
 */
import {
  AI_EXTERNAL_LEVELS, aiAccessDecision, aiMonthKey, companyAiAllowed, normalizeAiPlan,
} from '../aiAssistentSrc.js';
import { estimateCostNok, costForUsage } from './pricing.js';
import { modelForTier } from './router.js';
import { normalizeUsage } from './usage.js';
import { readSpend, recordUsage } from './ledger.js';

export class AiGatewayError extends Error {
  constructor(code, reason, message) {
    super(message);
    this.code = code;
    this.reason = reason;
  }
}

function isMember(family, uid) {
  if (!uid || !family) return false;
  if (family.ownerUid === uid || family.ownerId === uid) return true;
  return ['members', 'activeUsers', 'memberIds'].some((key) => Array.isArray(family[key]) && family[key].includes(uid));
}

/** Bedrift, plan og personens tilgangsnivå. */
export async function loadAiContext(db, companyId, uid) {
  if (!companyId || !uid) throw new AiGatewayError('permission-denied', 'no-access', 'Mangler tilgang.');
  const [familySnap, planSnap, aclSnap] = await Promise.all([
    db.doc(`families/${companyId}`).get(),
    db.doc(`families/${companyId}/aiSettings/plan`).get(),
    db.doc(`families/${companyId}/accessAcl/${uid}`).get(),
  ]);
  const family = familySnap.exists ? familySnap.data() || {} : null;
  if (!family || !isMember(family, uid)) {
    throw new AiGatewayError('permission-denied', 'no-access', 'Du er ikke medlem av bedriften.');
  }
  if (!['company', 'organization'].includes(family.type)) {
    throw new AiGatewayError('failed-precondition', 'not-company', 'AI-assistenten finnes bare for bedrifter.');
  }
  const levelId = aclSnap.exists ? String(aclSnap.data()?.levelId || '') : '';
  return {
    plan: normalizeAiPlan(planSnap.exists ? planSnap.data() : null),
    aiAllowed: companyAiAllowed(family.company),
    external: AI_EXTERNAL_LEVELS.includes(levelId),
  };
}

/**
 * Kjør ett AI-kall gjennom gatewayen.
 *
 *   call(route) → { usage, toolCalls?, ...resultat }
 *     route = { tier, model, provider, maxOutputTokens, maxInputTokens, maxToolCalls }
 *     usage er leverandørens rå forbruk (Claude: response.usage, Gemini: usageMetadata).
 *
 * Svarer { result, route, cost, notice, alerts }. Kaster AiGatewayError når kallet ikke er tillatt.
 */
export async function runAiCall({
  db, companyId, uid, userName = '', feature = 'chat', tier = 'standard',
  estimateInputTokens = 2_000, call, now = new Date(), modelOverrides = {},
}) {
  if (typeof call !== 'function') throw new Error('runAiCall mangler call.');
  const ctx = await loadAiContext(db, companyId, uid);
  const month = aiMonthKey(now);
  const spend = await readSpend(db, companyId, month, uid);

  const wanted = modelForTier(tier, modelOverrides);
  const estimateNok = estimateCostNok(wanted.model, {
    inputTokens: Math.min(estimateInputTokens, wanted.maxInputTokens),
    maxOutputTokens: wanted.maxOutputTokens,
  });
  const decision = aiAccessDecision({
    plan: ctx.plan,
    aiAllowed: ctx.aiAllowed,
    external: ctx.external,
    tier,
    monthSpentNok: spend.monthSpentNok,
    userSpentNok: spend.userSpentNok,
    estimateNok,
  });
  if (!decision.allowed) {
    throw new AiGatewayError(
      decision.reason.endsWith('limit') ? 'resource-exhausted' : 'failed-precondition',
      decision.reason,
      decision.message,
    );
  }

  const route = modelForTier(decision.tier, modelOverrides);
  const result = await call(route);
  const usage = normalizeUsage(route.provider, result?.usage);
  const cost = costForUsage(route.model, usage);
  const { crossed } = await recordUsage(db, {
    companyId,
    uid,
    userName,
    month,
    feature,
    model: route.model,
    provider: route.provider,
    tier: route.tier,
    usage,
    cost,
    budgetNok: ctx.plan.monthlyBudgetNok,
    toolCalls: result?.toolCalls || 0,
    now,
  });
  return {
    result, route, cost, notice: decision.message, alerts: crossed,
  };
}
