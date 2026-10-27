/**
 * Prosesskartet som enkel flyt: stegene i rekkefølge fra start, med rolle og forgreninger.
 * Brukes som standardvisning (lettere å lese enn kartet, særlig på mobil). Kartet er et valg.
 */
import { nodeRole, nodeType } from './processes.js';

const FIRST = ['always', 'yes', 'approved', 'default'];
const MARKERS = new Set(['start', 'end']);
const BRANCH_LABEL = { yes: 'Ja', no: 'Nei', approved: 'Godkjent', rejected: 'Avvist', default: 'Ellers' };

const byPos = (a, b) => (a.x - b.x) || (a.y - b.y);

/**
 * Steg i lesbar rekkefølge. Svar: [{ node, kind: 'start'|'end'|'step', number, role, type, branches, back }]
 * branches: når et steg har flere veier videre (beslutning, godkjenning, parallell): [{ label, toId, toNumber, toLabel, back }]
 */
export function processSteps(diagram) {
  const nodes = diagram?.nodes || [];
  const edges = diagram?.edges || [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out = new Map();
  edges.forEach((e) => { if (byId.has(e.from) && byId.has(e.to)) out.set(e.from, [...(out.get(e.from) || []), e]); });
  const sortEdges = (list) => [...list].sort((a, b) => {
    const pa = FIRST.includes(a.condition) ? 0 : 1;
    const pb = FIRST.includes(b.condition) ? 0 : 1;
    return pa - pb || byPos(byId.get(a.to), byId.get(b.to));
  });

  const order = [];
  const seen = new Set();
  const visit = (id) => {
    if (seen.has(id)) return;
    seen.add(id);
    order.push(byId.get(id));
    for (const e of sortEdges(out.get(id) || [])) visit(e.to);
  };
  const incoming = new Set(edges.map((e) => e.to));
  const starts = nodes.filter((n) => n.type === 'start').sort(byPos);
  const roots = starts.length ? starts : nodes.filter((n) => !incoming.has(n.id)).sort(byPos);
  roots.forEach((n) => visit(n.id));
  // Bokser som ikke nås fra start, kommer til slutt i kartets rekkefølge, så ingenting forsvinner.
  nodes.filter((n) => !seen.has(n.id)).sort(byPos).forEach((n) => visit(n.id));
  // Slutt-bokser sist, så flyten leses ovenfra og ned.
  const ends = order.filter((n) => n.type === 'end');
  const main = order.filter((n) => n.type !== 'end');
  const flow = [...main, ...ends];

  const numbers = new Map();
  let i = 0;
  flow.forEach((n) => { if (!MARKERS.has(n.type)) numbers.set(n.id, ++i); });
  const pos = new Map(flow.map((n, ix) => [n.id, ix]));

  return flow.map((n) => {
    const outs = sortEdges(out.get(n.id) || []);
    const toStep = (e) => {
      const target = byId.get(e.to);
      return {
        label: e.label || BRANCH_LABEL[e.condition] || '',
        toId: e.to,
        toNumber: numbers.get(e.to) || null,
        toLabel: target?.label || '',
        toKind: MARKERS.has(target?.type) ? target.type : 'step',
        back: (pos.get(e.to) ?? 0) <= (pos.get(n.id) ?? 0),
      };
    };
    const branching = outs.length > 1 || n.type === 'decision' || n.type === 'parallel_split';
    const next = outs.length === 1 ? toStep(outs[0]) : null;
    // Et steg som ikke peker til neste i listen (hopp eller tilbake), viser hvor det går.
    const jump = next && (next.back || pos.get(next.toId) !== (pos.get(n.id) ?? 0) + 1) ? next : null;
    return {
      node: n,
      kind: MARKERS.has(n.type) ? n.type : 'step',
      number: numbers.get(n.id) || null,
      role: nodeRole(diagram, n)?.label || '',
      type: nodeType(n.type),
      branches: branching ? outs.map(toStep) : [],
      jump,
    };
  });
}
