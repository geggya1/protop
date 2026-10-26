/**
 * Autolayout for prosesskart med svømmebaner.
 * Brukes når en prosess kommer inn som data (import) uten koordinater:
 * kolonne = lengste vei fra start (tilbakekoblinger/løkker teller ikke), rad = svømmebanen.
 * Bokser med egne koordinater (x/y) beholdes.
 */
import { makeEdge, makeNode, normalizeDiagram, snap } from './processes.js';

export const LANE_H = 176;
const COL_W = 216;
const LEFT = 136; // plass til banenavnet

/** Kanter som går bakover (løkker) finnes med dybde-først-søk fra startnodene. */
function backEdges(nodes, edges) {
  const out = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) out.get(e.from)?.push(e);
  const state = new Map();
  const back = new Set();
  const visit = (id) => {
    state.set(id, 1);
    for (const e of out.get(id) || []) {
      const s = state.get(e.to);
      if (s === 1) back.add(e.id);
      else if (!s) visit(e.to);
    }
    state.set(id, 2);
  };
  const starts = nodes.filter((n) => n.type === 'start').map((n) => n.id);
  for (const id of [...starts, ...nodes.map((n) => n.id)]) if (!state.get(id)) visit(id);
  return back;
}

/** Lengste vei fra start i grafen uten tilbakekoblinger. */
function layers(nodes, edges, back) {
  const fwd = edges.filter((e) => !back.has(e.id));
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of fwd) indeg.set(e.to, (indeg.get(e.to) || 0) + 1);
  const layer = new Map(nodes.map((n) => [n.id, 0]));
  const queue = nodes.filter((n) => !indeg.get(n.id)).map((n) => n.id);
  while (queue.length) {
    const id = queue.shift();
    for (const e of fwd.filter((x) => x.from === id)) {
      layer.set(e.to, Math.max(layer.get(e.to) || 0, (layer.get(id) || 0) + 1));
      indeg.set(e.to, indeg.get(e.to) - 1);
      if (!indeg.get(e.to)) queue.push(e.to);
    }
  }
  return layer;
}

/**
 * spec: { lanes: [{ id, label, roleKey }], nodes: [{ id, type, label, lane, …nodefelt }], edges: [{ id?, from, to, condition, label }] }
 * Returnerer et normalisert diagram ({ lanes, nodes, edges, groups }).
 */
export function layoutSwimlanes(spec) {
  const lanes = (spec?.lanes || []).filter((l) => l?.id).map((l, i) => ({
    id: String(l.id), label: String(l.label || `Bane ${i + 1}`), roleKey: String(l.roleKey || ''), y: i * LANE_H, h: LANE_H,
  }));
  const laneIndex = new Map(lanes.map((l, i) => [l.id, i]));
  const nodes = (spec?.nodes || []).filter((n) => n?.id).map((n) => ({ ...makeNode(n.type, { ...n, x: n.x ?? 0, y: n.y ?? 0 }), id: String(n.id), __lane: n.lane, __fixed: n.x != null && n.y != null }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (spec?.edges || []).filter((e) => ids.has(e.from) && ids.has(e.to)).map((e, i) => makeEdge(e.from, e.to, {
    id: e.id || `e_${e.from}_${e.to}_${i}`, condition: e.condition, label: e.label,
  }));
  const back = backEdges(nodes, edges);
  const layer = layers(nodes, edges, back);
  const slots = new Map();
  for (const n of nodes) {
    if (n.__fixed) continue;
    const li = laneIndex.has(n.__lane) ? laneIndex.get(n.__lane) : 0;
    const col = layer.get(n.id) || 0;
    const key = `${col}:${li}`;
    const k = slots.get(key) || 0;
    slots.set(key, k + 1);
    n.x = snap((lanes.length ? LEFT : 48) + col * COL_W + (COL_W - n.w) / 2 - 24);
    n.y = lanes.length
      ? snap(li * LANE_H + (LANE_H - n.h) / 2 + (k ? (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 40 : 0))
      : snap(64 + k * 128);
  }
  for (const n of nodes) { delete n.__lane; delete n.__fixed; }
  return normalizeDiagram({ lanes, nodes, edges, groups: spec?.groups || [] });
}
