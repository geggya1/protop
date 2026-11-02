/**
 * Utvikling over tid for undersøkelser (medarbeiderundersøkelse og kundeundersøkelse).
 *
 * Inn: ett punkt per avsluttet undersøkelse med resultat:
 *   { id, label, date, index, nps?, count, pct?, areas: [{ area, score }] }
 * Ut: punktene i tidsrekkefølge, en tabell område × undersøkelse, endringen fra forrige
 * og hva som må bedres (områder under målet eller med fall).
 *
 * Ren JS uten avhengigheter, så den testes i node og brukes av både appen og serveren.
 */

export const TREND_GOOD = 70;
/** Et fall på så mange poeng (0–100) fra forrige regnes som en tydelig nedgang. */
export const TREND_DROP = 5;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clean(point = {}, i = 0) {
  const areas = (Array.isArray(point.areas) ? point.areas : [])
    .map((a) => ({ area: String(a?.area || '').trim(), score: num(a?.score) }))
    .filter((a) => a.area && a.score != null);
  return {
    id: String(point.id || `p${i}`),
    label: String(point.label || '').trim() || String(point.date || '').slice(0, 4),
    date: String(point.date || ''),
    index: num(point.index),
    nps: num(point.nps),
    count: Number(point.count) || 0,
    pct: num(point.pct),
    areas,
  };
}

const delta = (now, before) => (now == null || before == null ? null : Math.round(now - before));

/**
 * Samlet utvikling. Gir null når det ikke finnes noen punkter.
 */
export function surveyTrend(points, { good = TREND_GOOD, drop = TREND_DROP } = {}) {
  const rows = (Array.isArray(points) ? points : [])
    .map(clean)
    .filter((p) => p.index != null || p.nps != null || p.areas.length)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  if (!rows.length) return null;
  const latest = rows[rows.length - 1];
  const previous = rows.length > 1 ? rows[rows.length - 2] : null;
  // Områdene i rekkefølgen de først dukket opp.
  const areaNames = [];
  for (const p of rows) for (const a of p.areas) if (!areaNames.includes(a.area)) areaNames.push(a.area);
  const matrix = areaNames.map((area) => {
    const values = rows.map((p) => p.areas.find((a) => a.area === area)?.score ?? null);
    const known = values.filter((v) => v != null);
    const last = values[values.length - 1];
    const before = values.length > 1 ? values[values.length - 2] : null;
    return {
      area,
      values,
      latest: last,
      delta: delta(last, before),
      // Endring fra første gang området ble målt.
      sinceFirst: known.length > 1 && last != null ? Math.round(last - known[0]) : null,
    };
  });
  const changes = matrix.filter((m) => m.delta != null);
  const declining = changes.filter((m) => m.delta <= -drop).sort((a, b) => a.delta - b.delta);
  const improving = changes.filter((m) => m.delta >= drop).sort((a, b) => b.delta - a.delta);
  // Hva må bedres: områder i siste undersøkelse under målet, svakest først, og områder med tydelig fall.
  const weak = matrix.filter((m) => m.latest != null && m.latest < good).sort((a, b) => a.latest - b.latest);
  const mustImprove = [...weak];
  for (const m of declining) if (!mustImprove.some((x) => x.area === m.area)) mustImprove.push(m);
  return {
    points: rows,
    areaNames,
    matrix,
    latest,
    previous,
    indexDelta: delta(latest.index, previous?.index),
    npsDelta: delta(latest.nps, previous?.nps),
    declining,
    improving,
    mustImprove: mustImprove.map((m) => ({
      area: m.area,
      score: m.latest,
      delta: m.delta,
      reason: m.latest != null && m.latest < good
        ? (m.delta != null && m.delta <= -drop ? 'under målet og ned fra forrige' : 'under målet')
        : 'ned fra forrige',
    })),
  };
}

/**
 * Unik tittel: «Kundeundersøkelse 2026» blir «Kundeundersøkelse 2026 (2)» når den finnes fra før,
 * så punktene i utviklingen over tid kan skilles.
 */
export function uniqueSurveyTitle(title, existing = []) {
  const base = String(title || '').trim();
  const taken = new Set((existing || []).map((t) => String(t || '').trim().toLowerCase()));
  if (!taken.has(base.toLowerCase())) return base;
  let i = 2;
  while (taken.has(`${base} (${i})`.toLowerCase())) i += 1;
  return `${base} (${i})`;
}

/** Kort tekst om utviklingen, til oversikten («Opp 6 poeng fra 2025»). */
export function trendSentence(trend, { key = 'index', unit = 'poeng' } = {}) {
  if (!trend?.previous) return '';
  const d = key === 'nps' ? trend.npsDelta : trend.indexDelta;
  if (d == null) return '';
  const from = trend.previous.label;
  if (d === 0) return `Uendret fra ${from}`;
  return `${d > 0 ? 'Opp' : 'Ned'} ${Math.abs(d)} ${unit} fra ${from}`;
}
