/**
 * Kontrollerbar nummerserie (bokføringsforskriften § 5-1-1 nr. 1).
 * Fakturanummeret er neste i serien. Et hopp framover gir nummer som aldri blir brukt,
 * og da skal det finnes en begrunnelse. Begrunnelsen logges i fakturastandardene når
 * startnummeret settes, og på telleren (invoiceSeries) når hoppet faktisk skjer.
 */

const MAX_LOG = 100;
export const JUMP_REASON_MIN = 10;

function text(value, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function whole(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Neste nummer uten hopp: høyeste brukte nummer + 1. */
export function expectedNextNumber({ last = 0, highest = 0 } = {}) {
  return Math.max(whole(last), whole(highest)) + 1;
}

/**
 * Hoppet et startnummer gir. null når serien ikke er startet (første nummer velges fritt)
 * eller når startnummeret ikke ligger over neste nummer.
 * { from, to } er nummerne som ikke blir brukt, next er nummeret fakturaen får.
 */
export function plannedNumberJump({ last = 0, highest = 0, start = 0 } = {}) {
  const begun = whole(last) > 0 || whole(highest) > 0;
  const expected = expectedNextNumber({ last, highest });
  const next = Math.max(expected, whole(start));
  if (!begun || next <= expected) return null;
  return { from: expected, to: next - 1, next, count: next - expected };
}

/** «105» eller «105–109». */
export function formatNumberRange(range) {
  if (!range) return '';
  return range.from === range.to ? String(range.from) : `${range.from}–${range.to}`;
}

export function normalizeNumberJump(row) {
  if (!row || typeof row !== 'object') return null;
  const from = whole(row.from);
  const to = whole(row.to);
  const next = whole(row.next) || to + 1;
  const reason = text(row.reason);
  if (!from || !to || to < from || !reason) return null;
  return {
    id: text(row.id, 60) || `jump_${from}_${to}`,
    at: text(row.at, 40),
    from,
    to,
    next,
    reason,
    byUid: text(row.byUid, 128),
    byName: text(row.byName, 120),
  };
}

export function normalizeNumberJumps(list) {
  return (Array.isArray(list) ? list : []).map(normalizeNumberJump).filter(Boolean).slice(-MAX_LOG);
}

/** Hoppet er begrunnet når loggen har en begrunnelse for samme neste nummer. */
export function isJumpDocumented(log, jump) {
  if (!jump) return true;
  return normalizeNumberJumps(log).some((row) => row.next === jump.next && row.from <= jump.from);
}

/** Feilmelding når hoppet mangler begrunnelse, ellers tom streng. */
export function numberJumpError(jump, reason, log = []) {
  if (!jump || isJumpDocumented(log, jump)) return '';
  const why = text(reason);
  const range = formatNumberRange(jump);
  if (!why) {
    return `Startnummeret hopper over ${jump.count === 1 ? 'nummer' : 'nummerne'} ${range}. Skriv hvorfor (bokføringsforskriften § 5-1-1).`;
  }
  if (why.length < JUMP_REASON_MIN) return 'Begrunnelsen for hoppet i nummerserien er for kort.';
  return '';
}

/** Loggrad for et begrunnet hopp. */
export function numberJumpEntry(jump, { reason = '', actor = null, at = '' } = {}) {
  if (!jump) return null;
  return normalizeNumberJump({
    id: `jump_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    at: text(at, 40) || new Date().toISOString(),
    from: jump.from,
    to: jump.to,
    next: jump.next,
    reason,
    byUid: actor?.byUid || actor?.uid,
    byName: actor?.byName || actor?.name,
  });
}

/** Loggen bare vokser. Nye rader legges sist. */
export function appendNumberJump(log, entry) {
  const rows = normalizeNumberJumps(log);
  const row = normalizeNumberJump(entry);
  return row ? [...rows, row].slice(-MAX_LOG) : rows;
}

/**
 * Hullet når fakturaen får nummer number. Telleren står på last, og highest er høyeste
 * nummer i fakturalisten (også importerte). null uten hull eller før serien er startet.
 */
export function seriesGapOnIssue({ last = 0, highest = 0, number = 0 } = {}) {
  const prev = Math.max(whole(last), whole(highest));
  const n = whole(number);
  if (!prev || n <= prev + 1) return null;
  return { from: prev + 1, to: n - 1, next: n, count: n - prev - 1 };
}

/** Begrunnelsen fra loggen for et hull som oppstår ved ferdigstilling. */
export function jumpReasonFor(log, gap) {
  if (!gap) return '';
  const rows = normalizeNumberJumps(log).filter((row) => row.next === gap.next);
  return rows.length ? rows[rows.length - 1].reason : '';
}

export const UNDOCUMENTED_GAP_REASON = 'Nummeret fulgte startnummeret eller høyeste nummer i fakturalisten. Se loggen under Økonomi → Innstillinger → Fakturastandarder.';

/** Rad på telleren og tekst i fakturaens hendelseslogg når ferdigstillingen hopper over nummer. */
export function issueGapRecord(gap, { reason = '', invoiceId = '', actor = null, at = '' } = {}) {
  if (!gap) return null;
  const why = text(reason) || UNDOCUMENTED_GAP_REASON;
  return {
    entry: {
      from: gap.from,
      to: gap.to,
      next: gap.next,
      reason: why,
      invoiceId: text(invoiceId, 120),
      byUid: text(actor?.byUid, 128),
      byName: text(actor?.byName, 120),
      at: text(at, 40) || new Date().toISOString(),
    },
    event: `nummerserien hoppet over ${formatNumberRange(gap)}: ${why}`,
  };
}

/**
 * Raden telleren (invoiceSeries.jumps) må få når den flyttes mer enn ett steg. Reglene krever
 * en begrunnet rad med neste nummer for hvert hopp (L-31). Et hull har sin egen rad (record);
 * nummer som er brukt i fakturalisten (import), forklares her. null når telleren går ett steg
 * eller ikke er startet.
 */
export function counterJumpEntry({ last = 0, number = 0, record = null, invoiceId = '', actor = null, at = '' } = {}) {
  const prev = whole(last);
  const n = whole(number);
  if (!prev || n <= prev + 1) return null;
  if (record?.entry) return record.entry;
  const range = formatNumberRange({ from: prev + 1, to: n - 1 });
  return {
    from: prev + 1,
    to: n - 1,
    next: n,
    reason: `Nummer ${range} er brukt i fakturalisten (importerte eller eldre fakturaer).`,
    invoiceId: text(invoiceId, 120),
    byUid: text(actor?.byUid, 128),
    byName: text(actor?.byName, 120),
    at: text(at, 40) || new Date().toISOString(),
  };
}
