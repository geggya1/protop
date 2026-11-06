/**
 * AI-abonnementet til en bedrift (AI-assistenten): rammene eier eller administrator setter,
 * og budsjettsjekken som kjøres før hvert AI-kall.
 *
 * Lagres i families/{bedrift}/aiSettings/plan. Abonnementet er av til noen slår det på,
 * fordi det koster penger. Forbruket føres av serveren i aiLedger (se functions/aiAssistent/ledger.js).
 * Ren JS uten Firebase, så både appen og serveren bruker samme regler.
 *
 * Tilgang gis person for person. Ingen har tilgang som standard:
 *   allowedUids   egne, aktive ansatte som har fått tilgang
 *   externalUids  innleide og eksterne som har fått tilgang, hver for seg (aldri i bulk)
 * En innleid eller ekstern teller bare i externalUids, så en person som går fra egen ansatt
 * til ekstern mister tilgangen til den gis på nytt. Personer som ikke er aktive, har aldri tilgang.
 */

export const AI_TIERS = ['light', 'standard', 'deep'];
export const AI_ON_LIMIT = ['stop', 'downgrade'];

/** Varsler til eier når månedens forbruk passerer disse andelene av budsjettet. */
export const AI_ALERT_THRESHOLDS = [50, 80, 100];

/** Med «bytt til lett modell» kan forbruket gå til 110 % av budsjettet før alt stopper. */
export const AI_DOWNGRADE_CEILING = 1.1;

export const AI_PLAN_LIMITS = {
  monthlyBudgetNok: { min: 0, max: 1_000_000 },
  perUserMonthlyNok: { min: 0, max: 100_000 },
  maxFileMb: { min: 1, max: 100 },
  maxFilesPerMessage: { min: 1, max: 20 },
  chatRetentionDays: { min: 1, max: 3650 },
  /** Personer med tilgang (samme tak som i firestore.rules). */
  uids: 1000,
};

export const DEFAULT_AI_PLAN = Object.freeze({
  enabled: false,
  monthlyBudgetNok: 0,
  onLimit: 'stop',
  /** 0 = ingen egen grense per bruker, bare bedriftens budsjett. */
  perUserMonthlyNok: 0,
  deepModelEnabled: false,
  maxFileMb: 20,
  maxFilesPerMessage: 5,
  chatRetentionDays: 90,
  emailDraftsEnabled: true,
  allowedUids: Object.freeze([]),
  externalUids: Object.freeze([]),
});

/** Feltene appen får skrive (samme liste som aiPlanShapeOk i firestore.rules). */
export const AI_PLAN_KEYS = [...Object.keys(DEFAULT_AI_PLAN), 'updatedAt', 'updatedBy'];

function uidList(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const raw of value) {
    const uid = typeof raw === 'string' ? raw.trim() : '';
    if (uid && uid.length <= 128 && !out.includes(uid)) out.push(uid);
    if (out.length >= AI_PLAN_LIMITS.uids) break;
  }
  return out;
}

/** Gi eller ta tilgang for én person. `external` velger listen for innleide og eksterne. */
export function withAiAccess(plan, uid, on, { external = false } = {}) {
  const p = normalizeAiPlan(plan);
  const key = external ? 'externalUids' : 'allowedUids';
  const other = external ? 'allowedUids' : 'externalUids';
  const rest = p[key].filter((row) => row !== uid);
  return {
    ...p,
    [key]: uidList(on && uid ? [...rest, uid] : rest),
    // En person står bare i én liste.
    [other]: p[other].filter((row) => row !== uid),
  };
}

/** Har personen fått tilgang? `person.external` avgjør hvilken liste som teller. */
export function aiAccessGranted(plan, uid, person = {}) {
  const p = normalizeAiPlan(plan);
  if (!uid) return false;
  return person.external ? p.externalUids.includes(uid) : p.allowedUids.includes(uid);
}

function clampNumber(value, { min, max }, fallback, integer = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const v = integer ? Math.round(n) : Math.round(n * 100) / 100;
  return Math.min(max, Math.max(min, v));
}

export function normalizeAiPlan(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const d = DEFAULT_AI_PLAN;
  const L = AI_PLAN_LIMITS;
  return {
    enabled: src.enabled === true,
    monthlyBudgetNok: clampNumber(src.monthlyBudgetNok, L.monthlyBudgetNok, d.monthlyBudgetNok),
    onLimit: AI_ON_LIMIT.includes(src.onLimit) ? src.onLimit : d.onLimit,
    perUserMonthlyNok: clampNumber(src.perUserMonthlyNok, L.perUserMonthlyNok, d.perUserMonthlyNok),
    deepModelEnabled: src.deepModelEnabled === true,
    maxFileMb: clampNumber(src.maxFileMb, L.maxFileMb, d.maxFileMb, true),
    maxFilesPerMessage: clampNumber(src.maxFilesPerMessage, L.maxFilesPerMessage, d.maxFilesPerMessage, true),
    chatRetentionDays: clampNumber(src.chatRetentionDays, L.chatRetentionDays, d.chatRetentionDays, true),
    emailDraftsEnabled: src.emailDraftsEnabled !== false,
    allowedUids: uidList(src.allowedUids),
    externalUids: uidList(src.externalUids),
  };
}

/** Feltene som settes i selskapsinnstillingene. Tilgangslistene endres bare via accessChanges. */
const AI_SETTING_KEYS = [
  'enabled', 'monthlyBudgetNok', 'onLimit', 'perUserMonthlyNok', 'deepModelEnabled',
  'maxFileMb', 'maxFilesPerMessage', 'chatRetentionDays', 'emailDraftsEnabled',
];

/**
 * Bygg neste plan fra den lagrede: `settings` (bare AI_SETTING_KEYS) og tilgangsendringer
 * [{ uid, on, external }]. Ren funksjon, testes uten Firebase.
 */
export function mergeAiPlan(current, settings = null, accessChanges = []) {
  let next = normalizeAiPlan(current);
  if (settings) {
    const picked = Object.fromEntries(AI_SETTING_KEYS.filter((key) => key in settings).map((key) => [key, settings[key]]));
    next = normalizeAiPlan({ ...next, ...picked });
  }
  for (const change of accessChanges || []) {
    if (change?.uid) next = withAiAccess(next, change.uid, !!change.on, { external: !!change.external });
  }
  return next;
}

/** Måneden forbruket føres på, i norsk tid (2026-11). */
export function aiMonthKey(date = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Oslo', year: 'numeric', month: '2-digit' })
      .format(date)
      .slice(0, 7);
  } catch {
    return date.toISOString().slice(0, 7);
  }
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * Får denne personen bruke AI-assistenten nå, og med hvilket nivå?
 *
 * input:
 *   plan            normalisert eller rå plan
 *   aiAllowed       bedriftens personvernvalg (company.privacy.ai)
 *   uid             personen
 *   person          { active, external } fra ansattposten. Eier og administratorer uten
 *                   ansattpost regnes som aktive egne ansatte.
 *   tier            ønsket nivå: light | standard | deep
 *   monthSpentNok   bedriftens forbruk denne måneden
 *   userSpentNok    personens forbruk denne måneden
 *   estimateNok     anslått pris på kallet som skal gjøres
 *
 * Svarer { allowed, tier, reason, message }. `tier` kan være nedgradert til light.
 */
export function aiAccessDecision({
  plan: rawPlan, aiAllowed = true, uid = '', person = {}, tier = 'standard',
  monthSpentNok = 0, userSpentNok = 0, estimateNok = 0,
}) {
  const plan = normalizeAiPlan(rawPlan);
  const deny = (reason, message) => ({ allowed: false, tier: null, reason, message });

  if (!plan.enabled) return deny('disabled', 'AI-assistenten er ikke slått på for bedriften.');
  if (!aiAllowed) return deny('privacy', 'Bedriften har slått av AI-funksjoner under personvern.');
  if (!person?.active) return deny('inactive', 'AI-assistenten er bare for aktive personer i bedriften.');
  if (!aiAccessGranted(plan, uid, person)) {
    return deny('not-granted', person?.external
      ? 'Innleide og eksterne får AI-assistenten bare når administrator gir tilgang til hver enkelt.'
      : 'Du har ikke fått tilgang til AI-assistenten. Spør administrator.');
  }
  if (plan.monthlyBudgetNok <= 0) return deny('no-budget', 'Bedriften har ikke satt et månedsbudsjett for AI.');

  let wanted = AI_TIERS.includes(tier) ? tier : 'standard';
  if (wanted === 'deep' && !plan.deepModelEnabled) wanted = 'standard';

  const estimate = Math.max(0, Number(estimateNok) || 0);
  const companyLeft = plan.monthlyBudgetNok - (Number(monthSpentNok) || 0);
  const userCap = plan.perUserMonthlyNok > 0;
  const userLeft = userCap ? plan.perUserMonthlyNok - (Number(userSpentNok) || 0) : Infinity;

  if (userCap && userLeft <= 0) {
    return deny('user-limit', 'Du har brukt opp din del av AI-budsjettet denne måneden.');
  }
  if (companyLeft <= 0 || companyLeft < estimate) {
    // Nedgradering gir lett modell, men aldri ubegrenset: over taket stopper det uansett.
    const hardCap = plan.monthlyBudgetNok * AI_DOWNGRADE_CEILING;
    const underCap = (Number(monthSpentNok) || 0) + estimate < hardCap;
    if (plan.onLimit === 'downgrade' && underCap) {
      return {
        allowed: true,
        tier: 'light',
        reason: 'downgraded',
        message: 'Månedsbudsjettet er nesten brukt opp. Svaret lages med den lette modellen.',
      };
    }
    return deny('company-limit', 'Bedriftens AI-budsjett for denne måneden er brukt opp.');
  }
  if (userCap && userLeft < estimate) {
    return deny('user-limit', 'Du har brukt opp din del av AI-budsjettet denne måneden.');
  }
  return { allowed: true, tier: wanted, reason: 'ok', message: '' };
}

/** Terskler (50/80/100 %) som passeres når forbruket går fra `before` til `after`. */
export function crossedAlertThresholds(budgetNok, beforeNok, afterNok, sent = []) {
  const budget = Number(budgetNok) || 0;
  if (budget <= 0) return [];
  const before = (Number(beforeNok) || 0) / budget * 100;
  const after = (Number(afterNok) || 0) / budget * 100;
  return AI_ALERT_THRESHOLDS.filter((pct) => before < pct && after >= pct && !sent.includes(pct));
}

/** Oppsummering til adminsiden fra månedsdokumentet og brukerdokumentene. */
export function aiUsageSummary(plan, monthDoc, userDocs = []) {
  const p = normalizeAiPlan(plan);
  const spent = round2(monthDoc?.costNok);
  const budget = p.monthlyBudgetNok;
  const users = (userDocs || [])
    .map((row) => ({
      uid: row.uid || row.id || '',
      name: row.name || '',
      costNok: round2(row.costNok),
      calls: Number(row.calls) || 0,
    }))
    .sort((a, b) => b.costNok - a.costNok);
  return {
    spentNok: spent,
    budgetNok: budget,
    leftNok: round2(Math.max(0, budget - spent)),
    percent: budget > 0 ? Math.min(999, Math.round(spent / budget * 100)) : 0,
    calls: Number(monthDoc?.calls) || 0,
    inputTokens: Number(monthDoc?.inputTokens) || 0,
    cachedInputTokens: Number(monthDoc?.cachedInputTokens) || 0,
    outputTokens: Number(monthDoc?.outputTokens) || 0,
    users,
  };
}

export function formatNok(value) {
  const n = round2(value);
  try {
    return `${new Intl.NumberFormat('nb-NO', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }).format(n)} kr`;
  } catch {
    return `${n} kr`;
  }
}
