/**
 * Prosessbygger og kjørbar prosessmotor (M03 / P03 / U04).
 *
 *  ProcessDefinition  – prosess med eier, formål, kategori og versjoner
 *  ProcessVersion     – diagram (noder, kanter, baner). Utkast kan endres;
 *                       publisert versjon er låst. Endring = ny versjon.
 *  ProcessInstance    – låst til versjonen den startet på (A05). Aktivt trinn,
 *                       ferdige trinn og hendelseslogg. Steg kan bare fullføres én gang.
 *
 * Tegnelinjer alene utløser aldri automasjon: bare publiserte versjoner kan kjøres,
 * og bare allowlistede handlinger (createTask, notify, requestApproval) finnes.
 */
import {
  auditEvent, bump, checksum, fail, newId, nowIso, pushHistory, text, uniq,
} from './core.js';

export const NODE_TYPES = [
  { id: 'start', label: 'Start', icon: 'play-circle', shape: 'pill', human: false, group: 'Flyt' },
  { id: 'end', label: 'Slutt', icon: 'stop-circle', shape: 'pill', human: false, group: 'Flyt' },
  { id: 'activity', label: 'Aktivitet', icon: 'square-outline', shape: 'rect', human: true, group: 'Arbeid' },
  { id: 'task', label: 'Oppgave', icon: 'checkbox-outline', shape: 'rect', human: true, group: 'Arbeid' },
  { id: 'decision', label: 'Beslutning', icon: 'git-branch-outline', shape: 'diamond', human: true, group: 'Flyt' },
  { id: 'parallel_split', label: 'Parallell start', icon: 'git-network-outline', shape: 'bar', human: false, group: 'Flyt' },
  { id: 'parallel_join', label: 'Parallell samling', icon: 'git-merge-outline', shape: 'bar', human: false, group: 'Flyt' },
  { id: 'form', label: 'Skjema', icon: 'document-text-outline', shape: 'rect', human: true, group: 'Dokumentasjon' },
  { id: 'checklist', label: 'Sjekkliste', icon: 'list-outline', shape: 'rect', human: true, group: 'Dokumentasjon' },
  { id: 'document', label: 'Dokument', icon: 'document-outline', shape: 'doc', human: false, group: 'Dokumentasjon' },
  { id: 'approval', label: 'Godkjenning', icon: 'shield-checkmark-outline', shape: 'rect', human: true, group: 'Kontroll' },
  { id: 'control', label: 'Kontrollpunkt', icon: 'eye-outline', shape: 'rect', human: true, group: 'Kontroll' },
  { id: 'notify', label: 'Varsel', icon: 'notifications-outline', shape: 'rect', human: false, group: 'System' },
  { id: 'timer', label: 'Frist / vent', icon: 'hourglass-outline', shape: 'circle', human: false, group: 'System' },
  { id: 'subprocess', label: 'Underprosess', icon: 'layers-outline', shape: 'rect', human: false, group: 'Struktur' },
  { id: 'integration', label: 'Systemhandling', icon: 'flash-outline', shape: 'rect', human: false, group: 'System' },
  { id: 'manual_event', label: 'Manuell hendelse', icon: 'hand-left-outline', shape: 'rect', human: true, group: 'Flyt' },
];

export function nodeType(id) {
  return NODE_TYPES.find((t) => t.id === id) || NODE_TYPES[2];
}

export const CLICK_ACTIONS = [
  { id: 'none', label: 'Ingen' },
  { id: 'openForm', label: 'Åpne skjema' },
  { id: 'openDocument', label: 'Åpne dokument' },
  { id: 'openProcess', label: 'Åpne underprosess' },
  { id: 'openModule', label: 'Åpne ProTop-modul' },
  { id: 'openUrl', label: 'Åpne lenke' },
];

/** Utføringshandlinger — allowlistet, deklarativt. Ingen brukerskript. */
export const ENTER_ACTIONS = [
  { id: 'none', label: 'Ingen' },
  { id: 'createTask', label: 'Opprett oppgave i ProTop' },
  { id: 'notify', label: 'Varsle ansvarlig rolle' },
  { id: 'requestApproval', label: 'Be om godkjenning' },
];

export const EDGE_CONDITIONS = [
  { id: 'always', label: 'Alltid' },
  { id: 'yes', label: 'Ja' },
  { id: 'no', label: 'Nei' },
  { id: 'approved', label: 'Godkjent' },
  { id: 'rejected', label: 'Avvist' },
  { id: 'default', label: 'Ellers (standard)' },
];

export const PROCESS_CATEGORIES = [
  { id: 'ledelse', label: 'Ledelsesprosess' },
  { id: 'kjerne', label: 'Kjerneprosess' },
  { id: 'stotte', label: 'Støtteprosess' },
];

export const VERSION_STATES = {
  utkast: 'Utkast',
  til_godkjenning: 'Til godkjenning',
  godkjent: 'Godkjent',
  publisert: 'Publisert',
  erstattet: 'Erstattet',
  avvist: 'Avvist',
};

export const NODE_W = 168;
export const NODE_H = 64;
export const GRID = 16;

export function snap(value) {
  return Math.round((Number(value) || 0) / GRID) * GRID;
}

export function emptyDiagram() {
  return {
    lanes: [],
    nodes: [
      makeNode('start', { x: 64, y: 96, label: 'Start' }),
      makeNode('end', { x: 560, y: 96, label: 'Slutt' }),
    ],
    edges: [],
  };
}

export function makeNode(type, patch = {}) {
  const def = nodeType(type);
  const isDecision = type === 'decision';
  const isBar = type === 'parallel_split' || type === 'parallel_join';
  return {
    id: patch.id || newId('n'),
    type: def.id,
    label: text(patch.label, 120) || def.label,
    description: text(patch.description, 2000),
    x: snap(patch.x ?? 64),
    y: snap(patch.y ?? 64),
    w: isDecision ? 128 : (isBar ? 24 : NODE_W),
    h: isDecision ? 96 : (isBar ? 96 : NODE_H),
    color: text(patch.color, 20),
    icon: text(patch.icon, 60) || def.icon,
    roleKey: text(patch.roleKey, 60),
    roleLabel: text(patch.roleLabel, 120),
    dueDays: Number(patch.dueDays) || 0,
    onClick: patch.onClick || { type: 'none', ref: '' },
    onEnter: patch.onEnter || { type: def.human ? 'createTask' : 'none' },
    formKey: text(patch.formKey, 80),
    documentId: text(patch.documentId, 120),
    subprocessId: text(patch.subprocessId, 120),
    requirementIds: uniq(patch.requirementIds),
    inputs: text(patch.inputs, 1000),
    outputs: text(patch.outputs, 1000),
  };
}

export function makeEdge(from, to, patch = {}) {
  return {
    id: patch.id || newId('e'),
    from,
    to,
    label: text(patch.label, 60),
    condition: EDGE_CONDITIONS.some((c) => c.id === patch.condition) ? patch.condition : 'always',
  };
}

export function normalizeDiagram(raw) {
  const nodes = (raw?.nodes || []).filter((n) => n?.id).map((n) => ({ ...makeNode(n.type, n), id: n.id }));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = (raw?.edges || [])
    .filter((e) => e?.id && ids.has(e.from) && ids.has(e.to))
    .map((e) => ({ ...makeEdge(e.from, e.to, e), id: e.id }));
  const lanes = (raw?.lanes || []).filter((l) => l?.id).map((l, i) => ({
    id: l.id,
    label: text(l.label, 80) || `Bane ${i + 1}`,
    roleKey: text(l.roleKey, 60),
    y: Number(l.y) || i * 160,
    h: Number(l.h) || 160,
  }));
  // Grupper: navngitte rammer rundt bokser som hører sammen (flyttes og velges samlet).
  const groups = (raw?.groups || []).filter((g) => g?.id).map((g) => ({
    id: g.id,
    label: text(g.label, 80) || 'Gruppe',
    nodeIds: uniq((g.nodeIds || []).filter((id) => ids.has(id))),
  })).filter((g) => g.nodeIds.length >= 2);
  return { nodes, edges, lanes, groups };
}

/* ───────── Redigering av flere bokser (flervalg) ───────── */

export function moveNodes(diagram, ids, dx, dy) {
  const set = new Set(ids);
  return { ...diagram, nodes: diagram.nodes.map((n) => (set.has(n.id) ? { ...n, x: snap(n.x + dx), y: snap(n.y + dy) } : n)) };
}

/** Juster valgte bokser: left | right | top | bottom | hcenter | vcenter. */
export function alignNodes(diagram, ids, how) {
  const sel = diagram.nodes.filter((n) => ids.includes(n.id));
  if (sel.length < 2) return diagram;
  const minX = Math.min(...sel.map((n) => n.x));
  const maxX = Math.max(...sel.map((n) => n.x + n.w));
  const minY = Math.min(...sel.map((n) => n.y));
  const maxY = Math.max(...sel.map((n) => n.y + n.h));
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const place = (n) => {
    switch (how) {
      case 'left': return { x: minX };
      case 'right': return { x: maxX - n.w };
      case 'top': return { y: minY };
      case 'bottom': return { y: maxY - n.h };
      case 'hcenter': return { x: snap(cx - n.w / 2) };
      case 'vcenter': return { y: snap(cy - n.h / 2) };
      default: return {};
    }
  };
  return { ...diagram, nodes: diagram.nodes.map((n) => (ids.includes(n.id) ? { ...n, ...place(n) } : n)) };
}

/** Fordel valgte bokser med lik avstand horisontalt (h) eller vertikalt (v). */
export function distributeNodes(diagram, ids, axis = 'h') {
  const sel = diagram.nodes.filter((n) => ids.includes(n.id)).sort((a, b) => (axis === 'h' ? a.x - b.x : a.y - b.y));
  if (sel.length < 3) return diagram;
  const first = sel[0];
  const last = sel[sel.length - 1];
  const span = axis === 'h' ? (last.x - first.x) : (last.y - first.y);
  const step = span / (sel.length - 1);
  const pos = new Map(sel.map((n, i) => [n.id, Math.round((axis === 'h' ? first.x : first.y) + step * i)]));
  return { ...diagram, nodes: diagram.nodes.map((n) => (pos.has(n.id) ? { ...n, [axis === 'h' ? 'x' : 'y']: pos.get(n.id) } : n)) };
}

/** Kopier valgte bokser med koblingene mellom dem. Returnerer { diagram, ids } for de nye. */
export function duplicateNodes(diagram, ids, offset = 32) {
  const map = new Map();
  const copies = diagram.nodes.filter((n) => ids.includes(n.id)).map((n) => {
    const copy = makeNode(n.type, { ...n, id: undefined, x: n.x + offset, y: n.y + offset, label: n.label });
    map.set(n.id, copy.id);
    return copy;
  });
  const edges = diagram.edges.filter((e) => map.has(e.from) && map.has(e.to)).map((e) => makeEdge(map.get(e.from), map.get(e.to), { ...e, id: undefined }));
  return { diagram: { ...diagram, nodes: [...diagram.nodes, ...copies], edges: [...diagram.edges, ...edges] }, ids: copies.map((c) => c.id) };
}

export function removeNodes(diagram, ids) {
  const set = new Set(ids);
  return {
    ...diagram,
    nodes: diagram.nodes.filter((n) => !set.has(n.id)),
    edges: diagram.edges.filter((e) => !set.has(e.from) && !set.has(e.to)),
    groups: (diagram.groups || []).map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => !set.has(id)) })).filter((g) => g.nodeIds.length >= 2),
  };
}

export function groupNodes(diagram, ids, label = 'Gruppe') {
  const valid = uniq(ids).filter((id) => diagram.nodes.some((n) => n.id === id));
  if (valid.length < 2) return { diagram, id: '' };
  // En boks hører til én gruppe; den tas ut av tidligere grupper.
  const rest = (diagram.groups || []).map((g) => ({ ...g, nodeIds: g.nodeIds.filter((id) => !valid.includes(id)) })).filter((g) => g.nodeIds.length >= 2);
  const group = { id: newId('g'), label: text(label, 80) || 'Gruppe', nodeIds: valid };
  return { diagram: { ...diagram, groups: [...rest, group] }, id: group.id };
}

export function ungroup(diagram, groupId) {
  return { ...diagram, groups: (diagram.groups || []).filter((g) => g.id !== groupId) };
}

export function groupOf(diagram, nodeId) {
  return (diagram.groups || []).find((g) => g.nodeIds.includes(nodeId)) || null;
}

export function groupBounds(diagram, group, pad = 14) {
  const sel = diagram.nodes.filter((n) => group.nodeIds.includes(n.id));
  if (!sel.length) return null;
  const x = Math.min(...sel.map((n) => n.x)) - pad;
  const y = Math.min(...sel.map((n) => n.y)) - pad - 14;
  return { x, y, w: Math.max(...sel.map((n) => n.x + n.w)) + pad - x, h: Math.max(...sel.map((n) => n.y + n.h)) + pad - y };
}

/* ───────── Versjonssammenligning ───────── */

const NODE_FIELDS = [
  ['label', 'tittel'], ['type', 'type'], ['roleKey', 'rolle'], ['description', 'beskrivelse'], ['dueDays', 'frist'],
  ['formKey', 'skjema'], ['documentId', 'dokument'], ['subprocessId', 'underprosess'], ['inputs', 'input'], ['outputs', 'output'],
];

/**
 * Forskjeller mellom to versjoner av en prosess (a = eldre, b = nyere).
 * Flytting alene regnes ikke som endring av innhold, men telles for seg.
 */
export function diffDiagrams(a, b) {
  const A = normalizeDiagram(a);
  const B = normalizeDiagram(b);
  const am = new Map(A.nodes.map((n) => [n.id, n]));
  const bm = new Map(B.nodes.map((n) => [n.id, n]));
  const added = B.nodes.filter((n) => !am.has(n.id));
  const removed = A.nodes.filter((n) => !bm.has(n.id));
  const changed = [];
  const moved = [];
  for (const n of B.nodes) {
    const old = am.get(n.id);
    if (!old) continue;
    const fields = NODE_FIELDS.filter(([k]) => JSON.stringify(old[k] ?? '') !== JSON.stringify(n[k] ?? '')).map(([, label]) => label);
    if (JSON.stringify(old.onEnter || {}) !== JSON.stringify(n.onEnter || {})) fields.push('utføringshandling');
    if (JSON.stringify(old.onClick || {}) !== JSON.stringify(n.onClick || {})) fields.push('klikkhandling');
    if (fields.length) changed.push({ id: n.id, label: n.label, before: old.label, fields });
    else if (old.x !== n.x || old.y !== n.y) moved.push(n.id);
  }
  const ek = (e) => `${e.from}>${e.to}:${e.condition}`;
  const ae = new Map(A.edges.map((e) => [ek(e), e]));
  const be = new Map(B.edges.map((e) => [ek(e), e]));
  const edgesAdded = B.edges.filter((e) => !ae.has(ek(e)));
  const edgesRemoved = A.edges.filter((e) => !be.has(ek(e)));
  const lanesA = A.lanes.map((l) => l.label).join('|');
  const lanesB = B.lanes.map((l) => l.label).join('|');
  const groupsA = JSON.stringify((A.groups || []).map((g) => [g.label, [...g.nodeIds].sort()]));
  const groupsB = JSON.stringify((B.groups || []).map((g) => [g.label, [...g.nodeIds].sort()]));
  const total = added.length + removed.length + changed.length + edgesAdded.length + edgesRemoved.length + (lanesA !== lanesB ? 1 : 0) + (groupsA !== groupsB ? 1 : 0);
  return {
    added, removed, changed, moved, edgesAdded, edgesRemoved,
    lanesChanged: lanesA !== lanesB,
    groupsChanged: groupsA !== groupsB,
    marks: Object.fromEntries([...added.map((n) => [n.id, 'added']), ...changed.map((c) => [c.id, 'changed'])]),
    total,
    summary: total
      ? [added.length ? `${added.length} nye` : '', removed.length ? `${removed.length} fjernet` : '', changed.length ? `${changed.length} endret` : '',
        edgesAdded.length || edgesRemoved.length ? `${edgesAdded.length + edgesRemoved.length} koblinger endret` : '', lanesA !== lanesB ? 'baner endret' : '', groupsA !== groupsB ? 'grupper endret' : '']
        .filter(Boolean).join(' · ')
      : (moved.length ? 'Bare plassering er endret' : 'Ingen forskjeller'),
  };
}

export function diagramHash(diagram) {
  const d = normalizeDiagram(diagram);
  return checksum({
    nodes: d.nodes.map((n) => [n.id, n.type, n.label, n.roleKey, n.formKey, n.documentId, n.onEnter?.type, n.onClick?.type, n.onClick?.ref]),
    edges: d.edges.map((e) => [e.id, e.from, e.to, e.condition, e.label]),
  });
}

function outgoing(diagram, id) {
  return diagram.edges.filter((e) => e.from === id);
}

function incoming(diagram, id) {
  return diagram.edges.filter((e) => e.to === id);
}

/** Bane for en node, avledet av y-posisjon (swimlanes). */
export function laneOf(diagram, node) {
  const cy = (node?.y || 0) + (node?.h || NODE_H) / 2;
  return (diagram?.lanes || []).find((l) => cy >= l.y && cy < l.y + l.h) || null;
}

/** Ansvarlig rolle: nodens egen rolle, ellers banens rolle. */
export function nodeRole(diagram, node) {
  if (node?.roleLabel || node?.roleKey) return { key: node.roleKey, label: node.roleLabel || node.roleKey };
  const lane = laneOf(diagram, node);
  if (lane) return { key: lane.roleKey, label: lane.label };
  return null;
}

/**
 * Publiseringsvalidator. Returnerer konkrete feil per node (T05).
 * context.forms / context.documents / context.processes brukes til referansekontroll.
 */
export function validateDiagram(raw, context = {}) {
  const diagram = normalizeDiagram(raw);
  const errors = [];
  const warnings = [];
  const add = (list, nodeId, message) => list.push({ nodeId: nodeId || '', message });
  const starts = diagram.nodes.filter((n) => n.type === 'start');
  const ends = diagram.nodes.filter((n) => n.type === 'end');
  if (!starts.length) add(errors, '', 'Prosessen mangler startnode.');
  if (!ends.length) add(errors, '', 'Prosessen mangler sluttnode.');

  for (const e of diagram.edges) {
    if (e.from === e.to) add(errors, e.from, 'En kobling kan ikke gå til samme boks.');
  }

  // Nåbarhet fra start
  const reach = new Set();
  const queue = starts.map((s) => s.id);
  while (queue.length) {
    const id = queue.shift();
    if (reach.has(id)) continue;
    reach.add(id);
    for (const e of outgoing(diagram, id)) queue.push(e.to);
  }
  // Kan nå slutt (bakoverløp)
  const toEnd = new Set();
  const back = ends.map((s) => s.id);
  while (back.length) {
    const id = back.shift();
    if (toEnd.has(id)) continue;
    toEnd.add(id);
    for (const e of incoming(diagram, id)) back.push(e.from);
  }

  const formKeys = context.forms ? new Set(context.forms.filter((f) => !f.archived && f.publishedVersion).map((f) => f.templateId)) : null;
  const docIds = context.documents ? new Set(context.documents.filter((d) => d.publishedRevision).map((d) => d.id)) : null;
  const processIds = context.processes ? new Set(context.processes.filter((p) => p.publishedVersion).map((p) => p.id)) : null;

  for (const node of diagram.nodes) {
    const out = outgoing(diagram, node.id);
    const inc = incoming(diagram, node.id);
    const name = `«${node.label}»`;
    if (!reach.has(node.id)) add(errors, node.id, `${name} kan ikke nås fra start.`);
    if (node.type !== 'end' && !toEnd.has(node.id) && reach.has(node.id)) add(errors, node.id, `${name} fører ikke fram til slutt.`);
    if (node.type === 'start' && inc.length) add(errors, node.id, 'Startnoden kan ikke ha innkommende koblinger.');
    if (node.type === 'end' && out.length) add(errors, node.id, 'Sluttnoden kan ikke ha utgående koblinger.');
    if (node.type !== 'end' && !out.length) add(errors, node.id, `${name} mangler utgang.`);
    if (node.type === 'decision') {
      if (out.length < 2) add(errors, node.id, `Beslutningen ${name} må ha minst to utganger.`);
      const conds = out.map((e) => e.condition);
      const unlabeled = out.filter((e) => e.condition === 'always' && !e.label);
      if (unlabeled.length) add(errors, node.id, `Beslutningen ${name} har gren uten vilkår (velg Ja/Nei/Ellers).`);
      if (out.length >= 2 && !conds.includes('default') && !(conds.includes('yes') && conds.includes('no'))) {
        add(errors, node.id, `Beslutningen ${name} må ha både Ja- og Nei-gren, eller en «Ellers»-gren.`);
      }
      const dup = conds.filter((c, i) => c !== 'always' && conds.indexOf(c) !== i);
      if (dup.length) add(errors, node.id, `Beslutningen ${name} har to grener med samme vilkår.`);
    } else if (node.type === 'approval') {
      const conds = out.map((e) => e.condition);
      if (out.length > 1 && !(conds.includes('approved') && (conds.includes('rejected') || conds.includes('default')))) {
        add(errors, node.id, `Godkjenningen ${name} må ha «Godkjent»- og «Avvist»-gren.`);
      }
    } else if (node.type === 'parallel_split') {
      if (out.length < 2) add(errors, node.id, `${name} må ha minst to parallelle grener.`);
    } else if (node.type !== 'end' && out.length > 1) {
      add(errors, node.id, `${name} har flere utganger. Bruk Beslutning eller Parallell start.`);
    }
    if (node.type === 'parallel_join' && inc.length < 2) add(errors, node.id, `${name} må samle minst to grener.`);
    if (nodeType(node.type).human && !nodeRole(diagram, node)) add(errors, node.id, `${name} mangler ansvarlig rolle.`);
    if (node.type === 'form') {
      if (!node.formKey) add(errors, node.id, `Skjemaboksen ${name} er ikke koblet til et skjema.`);
      else if (formKeys && !formKeys.has(node.formKey)) add(errors, node.id, `Skjemaet i ${name} er ikke godkjent som styrt skjema i ISO.`);
    }
    if (node.type === 'document') {
      if (!node.documentId) add(warnings, node.id, `Dokumentboksen ${name} er ikke koblet til et styrt dokument.`);
      else if (docIds && !docIds.has(node.documentId)) add(errors, node.id, `Dokumentet i ${name} er ikke publisert.`);
    }
    if (node.type === 'subprocess') {
      if (!node.subprocessId) add(errors, node.id, `Underprosessen ${name} er ikke valgt.`);
      else if (node.subprocessId === context.selfId) add(errors, node.id, 'En prosess kan ikke være underprosess av seg selv.');
      else if (processIds && !processIds.has(node.subprocessId)) add(errors, node.id, `Underprosessen i ${name} er ikke publisert.`);
    }
    if (node.onClick?.type === 'openForm' && !node.onClick.ref && !node.formKey) add(warnings, node.id, `${name}: klikkhandling «Åpne skjema» mangler skjema.`);
  }

  // Ukontrollerte løkker: syklus uten beslutning/godkjenning
  const cycles = findCycles(diagram);
  for (const cycle of cycles) {
    const controlled = cycle.some((id) => ['decision', 'approval'].includes(diagram.nodes.find((n) => n.id === id)?.type));
    if (!controlled) add(errors, cycle[0], 'Løkke uten beslutningspunkt. Legg inn en beslutning som avslutter løkken.');
  }
  return { ok: errors.length === 0, errors, warnings };
}

function findCycles(diagram) {
  const out = [];
  const state = new Map();
  const stack = [];
  const visit = (id) => {
    state.set(id, 1);
    stack.push(id);
    for (const e of outgoing(diagram, id)) {
      if (state.get(e.to) === 1) {
        const at = stack.indexOf(e.to);
        out.push(stack.slice(at));
      } else if (!state.get(e.to)) {
        visit(e.to);
      }
    }
    stack.pop();
    state.set(id, 2);
  };
  for (const n of diagram.nodes) if (!state.get(n.id)) visit(n.id);
  return out;
}

/* ───────────────────────── Prosessdefinisjon og versjoner ───────────────────────── */

export function createProcess(input, { actor, now = new Date(), template = null } = {}) {
  if (!text(input?.title)) return fail('Gi prosessen et navn.');
  const diagram = template?.diagram ? normalizeDiagram(template.diagram) : emptyDiagram();
  const proc = bump({
    id: newId('pro'),
    title: text(input.title, 160),
    purpose: text(input.purpose || template?.purpose, 2000),
    category: PROCESS_CATEGORIES.some((c) => c.id === input.category) ? input.category : (template?.category || 'kjerne'),
    ownerName: text(input.ownerName, 160),
    ownerUid: text(input.ownerUid, 128),
    inputs: text(input.inputs || template?.inputs, 1000),
    outputs: text(input.outputs || template?.outputs, 1000),
    kpi: text(input.kpi || template?.kpi, 1000),
    requirementIds: uniq(input.requirementIds || template?.requirementIds),
    parentId: text(input.parentId, 120),
    templateKey: text(template?.key, 60),
    executable: template ? !!template.executable : true,
    versions: [{
      version: 1,
      state: 'utkast',
      diagram,
      createdAt: nowIso(now),
      createdBy: text(actor?.name, 160),
      changeNote: template ? `Opprettet fra mal «${template.title}»` : 'Første utkast',
    }],
    publishedVersion: 0,
    history: pushHistory({}, 'Opprettet', actor, template ? `Mal: ${template.title}` : '', now),
    createdAt: nowIso(now),
    rev: 0,
  }, actor, now);
  return { ok: true, process: proc, events: [auditEvent({ entityType: 'process', entityId: proc.id, action: 'iso.process.created', actor, after: proc, now })] };
}

export function draftVersion(proc) {
  return (proc?.versions || []).find((v) => ['utkast', 'til_godkjenning', 'godkjent', 'avvist'].includes(v.state)) || null;
}

export function publishedVersionOf(proc) {
  return (proc?.versions || []).find((v) => v.version === proc?.publishedVersion && v.state === 'publisert') || null;
}

export function versionOf(proc, version) {
  return (proc?.versions || []).find((v) => v.version === Number(version)) || null;
}

function replaceVersion(proc, version, patch) {
  return (proc.versions || []).map((v) => (v.version === version ? { ...v, ...patch } : v));
}

/** Ny revisjon fra publisert versjon. Publisert versjon røres ikke. */
export function startNewVersion(proc, { actor, now = new Date(), changeNote = '' } = {}) {
  if (draftVersion(proc)) return fail('Det finnes allerede et utkast.');
  const base = publishedVersionOf(proc) || (proc.versions || []).at(-1);
  const version = Math.max(0, ...(proc.versions || []).map((v) => v.version)) + 1;
  const next = bump({
    ...proc,
    versions: [...proc.versions, {
      version,
      state: 'utkast',
      diagram: normalizeDiagram(base?.diagram || emptyDiagram()),
      createdAt: nowIso(now),
      createdBy: text(actor?.name, 160),
      changeNote: text(changeNote, 500) || `Ny versjon basert på v${base?.version || 1}`,
    }],
    history: pushHistory(proc, `Utkast v${version} opprettet`, actor, changeNote, now),
  }, actor, now);
  return { ok: true, process: next, events: [auditEvent({ entityType: 'process', entityId: proc.id, action: 'iso.process.new_version', actor, before: proc, after: next, now })] };
}

export function saveDraftDiagram(proc, diagram, { actor, now = new Date(), meta = null } = {}) {
  const draft = draftVersion(proc);
  if (!draft) return fail('Publisert versjon er låst. Lag ny versjon for å endre.');
  if (draft.state !== 'utkast' && draft.state !== 'avvist') return fail('Utkastet er sendt til godkjenning og kan ikke endres nå.');
  const next = bump({
    ...proc,
    ...(meta ? {
      title: text(meta.title, 160) || proc.title,
      purpose: meta.purpose != null ? text(meta.purpose, 2000) : proc.purpose,
      category: meta.category || proc.category,
      ownerName: meta.ownerName != null ? text(meta.ownerName, 160) : proc.ownerName,
      ownerUid: meta.ownerUid != null ? text(meta.ownerUid, 128) : proc.ownerUid,
      inputs: meta.inputs != null ? text(meta.inputs, 1000) : proc.inputs,
      outputs: meta.outputs != null ? text(meta.outputs, 1000) : proc.outputs,
      kpi: meta.kpi != null ? text(meta.kpi, 1000) : proc.kpi,
    } : {}),
    versions: replaceVersion(proc, draft.version, { diagram: normalizeDiagram(diagram), state: 'utkast', savedAt: nowIso(now) }),
  }, actor, now);
  return { ok: true, process: next, events: [] };
}

export function submitForApproval(proc, context, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.manage) return fail('Du har ikke tilgang til å sende prosesser til godkjenning.');
  const draft = draftVersion(proc);
  if (!draft || !['utkast', 'avvist'].includes(draft.state)) return fail('Ingen utkast å sende.');
  if (!text(proc.ownerName)) return fail('Prosessen må ha en prosesseier.');
  const check = validateDiagram(draft.diagram, { ...context, selfId: proc.id });
  if (!check.ok) return fail(check.errors[0].message, { validation: check });
  const next = bump({
    ...proc,
    versions: replaceVersion(proc, draft.version, {
      state: 'til_godkjenning',
      submittedAt: nowIso(now),
      submittedBy: text(actor?.name, 160),
      hash: diagramHash(draft.diagram),
    }),
    history: pushHistory(proc, `v${draft.version} sendt til godkjenning`, actor, '', now),
  }, actor, now);
  return { ok: true, process: next, validation: check, events: [auditEvent({ entityType: 'process', entityId: proc.id, action: 'iso.process.submitted', actor, before: proc, after: next, now })] };
}

export function rejectVersion(proc, note, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.approve) return fail('Bare godkjenner kan avvise.');
  const draft = draftVersion(proc);
  if (!draft || draft.state !== 'til_godkjenning') return fail('Ingen versjon venter på godkjenning.');
  if (text(note).length < 5) return fail('Skriv hva som må endres.');
  const next = bump({
    ...proc,
    versions: replaceVersion(proc, draft.version, { state: 'avvist', rejectNote: text(note, 2000), rejectedBy: text(actor?.name, 160), rejectedAt: nowIso(now) }),
    history: pushHistory(proc, `v${draft.version} avvist`, actor, note, now),
  }, actor, now);
  return { ok: true, process: next, events: [auditEvent({ entityType: 'process', entityId: proc.id, action: 'iso.process.rejected', actor, before: proc, after: next, reason: note, now })] };
}

/** Godkjenn og publiser. Forrige publiserte versjon blir «erstattet», men bevares (A03/T06). */
export function approveAndPublish(proc, context, { actor, caps, now = new Date(), note = '' } = {}) {
  if (caps && !caps.approve) return fail('Du har ikke fullmakt til å publisere prosesser.');
  const draft = draftVersion(proc);
  if (!draft || draft.state !== 'til_godkjenning') return fail('Versjonen må sendes til godkjenning først.');
  if (draft.hash && draft.hash !== diagramHash(draft.diagram)) return fail('Diagrammet er endret etter innsending. Send på nytt.');
  const check = validateDiagram(draft.diagram, { ...context, selfId: proc.id });
  if (!check.ok) return fail(check.errors[0].message, { validation: check });
  const stamp = nowIso(now);
  const versions = (proc.versions || []).map((v) => {
    if (v.version === draft.version) {
      return { ...v, state: 'publisert', approvedAt: stamp, approvedBy: text(actor?.name, 160), publishedAt: stamp, publishedBy: text(actor?.name, 160), approvalNote: text(note, 1000) };
    }
    if (v.state === 'publisert') return { ...v, state: 'erstattet', supersededAt: stamp };
    return v;
  });
  const next = bump({
    ...proc,
    versions,
    publishedVersion: draft.version,
    history: pushHistory(proc, `v${draft.version} godkjent og publisert`, actor, note, now),
  }, actor, now);
  return { ok: true, process: next, events: [auditEvent({ entityType: 'process', entityId: proc.id, action: 'iso.process.published', actor, before: proc, after: next, now })] };
}

export function archiveProcess(proc, reason, { actor, caps, now = new Date(), instances = [] } = {}) {
  if (caps && !caps.approve) return fail('Bare en godkjenner kan arkivere prosesser.');
  if (text(reason).length < 5) return fail('Begrunn arkiveringen.');
  const running = instances.filter((i) => i.processId === proc.id && i.state === 'aktiv').length;
  if (running) return fail(`${running} aktive saker bruker prosessen. Fullfør eller avbryt dem først.`);
  const next = bump({ ...proc, archived: true, archivedAt: nowIso(now), history: pushHistory(proc, 'Arkivert', actor, reason, now) }, actor, now);
  return { ok: true, process: next, events: [auditEvent({ entityType: 'process', entityId: proc.id, action: 'iso.process.archived', actor, before: proc, after: next, reason, now })] };
}

/* ───────────────────────── Kjørbar instans ───────────────────────── */

function nodeIn(diagram, id) {
  return diagram.nodes.find((n) => n.id === id) || null;
}

/** Effekter som lagringslaget utfører idempotent (deterministisk nøkkel → ingen duplikater ved retry). */
function enterEffects(instance, diagram, node, visit) {
  const effects = [];
  const type = node.onEnter?.type || 'none';
  if (!['createTask', 'notify', 'requestApproval'].includes(type)) return effects;
  const role = nodeRole(diagram, node);
  effects.push({
    type,
    key: `isoproc_${instance.id}_${node.id}_${visit}`,
    nodeId: node.id,
    title: `${node.label} – ${instance.title}`,
    roleLabel: role?.label || '',
    assigneeUid: instance.roleAssignments?.[role?.key || role?.label]?.uid || '',
    dueDays: node.dueDays || 0,
  });
  return effects;
}

/** Aktiverer en node; automatiske noder (start, varsel, split, systemhandling) går videre av seg selv. */
function activate(instance, diagram, nodeId, effects, stamp, depth = 0) {
  if (depth > 200) throw new Error('loop');
  const node = nodeIn(diagram, nodeId);
  if (!node) return instance;
  const visits = { ...(instance.visits || {}) };
  visits[nodeId] = (visits[nodeId] || 0) + 1;
  let next = { ...instance, visits };
  if (node.type === 'parallel_join') {
    const arrived = (next.joins?.[nodeId] || 0) + 1;
    const need = incoming(diagram, nodeId).length;
    next = { ...next, joins: { ...(next.joins || {}), [nodeId]: arrived } };
    if (arrived < need) return next;
    next = { ...next, joins: { ...(next.joins || {}), [nodeId]: 0 } };
  }
  if (node.type === 'end') {
    next = { ...next, completed: [...next.completed, { nodeId, at: stamp, by: 'system' }] };
    next.log = [...next.log, { at: stamp, nodeId, type: 'end', text: `Nådde slutt: ${node.label}` }];
    return next;
  }
  const auto = ['start', 'notify', 'parallel_split', 'parallel_join', 'integration', 'document'].includes(node.type)
    || (node.type === 'subprocess' && !node.subprocessId);
  effects.push(...enterEffects(next, diagram, node, visits[nodeId]));
  if (!auto) {
    next = { ...next, active: uniq([...next.active, nodeId]) };
    next.log = [...next.log, { at: stamp, nodeId, type: 'activated', text: `Aktivt trinn: ${node.label}` }];
    return next;
  }
  next.completed = [...next.completed, { nodeId, at: stamp, by: 'system' }];
  if (node.type === 'notify') next.log = [...next.log, { at: stamp, nodeId, type: 'notify', text: `Varsel: ${node.label}` }];
  for (const e of outgoing(diagram, nodeId)) next = activate(next, diagram, e.to, effects, stamp, depth + 1);
  return next;
}

export function startInstance(proc, input, { actor, now = new Date() } = {}) {
  const published = publishedVersionOf(proc);
  if (!published) return fail('Prosessen har ingen publisert versjon.');
  if (proc.archived) return fail('Prosessen er arkivert.');
  const diagram = normalizeDiagram(published.diagram);
  const start = diagram.nodes.find((n) => n.type === 'start');
  if (!start) return fail('Prosessen mangler start.');
  const stamp = nowIso(now);
  let instance = {
    id: newId('pin'),
    processId: proc.id,
    processTitle: proc.title,
    version: published.version,
    diagramHash: published.hash || diagramHash(published.diagram),
    title: text(input?.title, 200) || proc.title,
    context: {
      projectId: text(input?.projectId, 120),
      projectName: text(input?.projectName, 200),
      customerId: text(input?.customerId, 120),
      customerName: text(input?.customerName, 200),
      employeeId: text(input?.employeeId, 120),
      findingId: text(input?.findingId, 120),
    },
    roleAssignments: input?.roleAssignments || {},
    state: 'aktiv',
    active: [],
    completed: [],
    joins: {},
    visits: {},
    log: [{ at: stamp, nodeId: start.id, type: 'started', text: `Startet av ${text(actor?.name, 160)} (v${published.version})` }],
    startedAt: stamp,
    startedBy: text(actor?.name, 160),
    startedByUid: text(actor?.uid, 128),
    rev: 0,
  };
  const effects = [];
  instance = activate(instance, diagram, start.id, effects, stamp);
  if (!instance.active.length) instance = { ...instance, state: 'fullfort', finishedAt: stamp };
  instance = bump(instance, actor, now);
  return { ok: true, instance, effects, events: [auditEvent({ entityType: 'processInstance', entityId: instance.id, action: 'iso.process.instance_started', actor, after: instance, now })] };
}

/**
 * Fullfører et aktivt trinn. Idempotent: et trinn som ikke er aktivt, kan ikke fullføres igjen (T08/A15).
 * decision: 'yes' | 'no' | edgeId, approval: 'approved' | 'rejected'.
 */
export function completeStep(instance, proc, nodeId, input = {}, { actor, now = new Date() } = {}) {
  if (!instance || instance.state !== 'aktiv') return fail('Saken er ikke aktiv.');
  if (!instance.active.includes(nodeId)) return fail('Trinnet er allerede fullført eller ikke aktivt.', { duplicate: true });
  const version = versionOf(proc, instance.version);
  if (!version) return fail('Fant ikke prosessversjonen saken startet på.');
  const diagram = normalizeDiagram(version.diagram);
  const node = nodeIn(diagram, nodeId);
  if (!node) return fail('Fant ikke trinnet.');
  const out = outgoing(diagram, nodeId);
  let chosen = out;
  if (node.type === 'decision') {
    const pick = input.decision;
    chosen = out.filter((e) => e.id === pick || e.condition === pick);
    if (!chosen.length) chosen = out.filter((e) => e.condition === 'default');
    if (!chosen.length) return fail('Velg utfall for beslutningen.');
    chosen = chosen.slice(0, 1);
  } else if (node.type === 'approval' && out.length > 1) {
    const pick = input.approval === 'rejected' ? 'rejected' : (input.approval === 'approved' ? 'approved' : '');
    if (!pick) return fail('Velg godkjent eller avvist.');
    chosen = out.filter((e) => e.condition === pick);
    if (!chosen.length) chosen = out.filter((e) => e.condition === 'default');
    if (pick === 'rejected' && !text(input.note)) return fail('Skriv hvorfor det avvises.');
  }
  if (nodeType(node.type).human && node.type === 'form' && input.requireSubmission && !input.submissionId) {
    return fail('Fyll ut og send inn skjemaet først.');
  }
  const stamp = nowIso(now);
  let next = {
    ...instance,
    active: instance.active.filter((id) => id !== nodeId),
    completed: [...instance.completed, {
      nodeId,
      at: stamp,
      by: text(actor?.name, 160),
      byUid: text(actor?.uid, 128),
      note: text(input.note, 2000),
      decision: input.decision || input.approval || '',
      submissionId: text(input.submissionId, 120),
    }],
    log: [...instance.log, {
      at: stamp,
      nodeId,
      type: 'completed',
      text: `${node.label} fullført av ${text(actor?.name, 160)}${chosen.length === 1 && chosen[0].label ? ` → ${chosen[0].label}` : ''}`,
    }],
  };
  const effects = [];
  try {
    for (const e of chosen) next = activate(next, diagram, e.to, effects, stamp);
  } catch {
    return fail('Prosessen gikk i ukontrollert løkke. Kontakt prosesseier.');
  }
  const reachedEnd = next.completed.some((c) => nodeIn(diagram, c.nodeId)?.type === 'end');
  if (!next.active.length && reachedEnd) next = { ...next, state: 'fullfort', finishedAt: stamp };
  next = bump(next, actor, now);
  return {
    ok: true,
    instance: next,
    effects,
    events: [auditEvent({ entityType: 'processInstance', entityId: instance.id, action: 'iso.process.step_completed', actor, before: instance, after: next, now })],
  };
}

export function cancelInstance(instance, reason, { actor, caps, now = new Date() } = {}) {
  if (caps && !caps.manage) return fail('Du har ikke tilgang til å avbryte saker.');
  if (instance?.state !== 'aktiv') return fail('Saken er ikke aktiv.');
  if (text(reason).length < 5) return fail('Begrunn hvorfor saken avbrytes.');
  const stamp = nowIso(now);
  const next = bump({
    ...instance,
    state: 'avbrutt',
    active: [],
    finishedAt: stamp,
    log: [...instance.log, { at: stamp, nodeId: '', type: 'cancelled', text: `Avbrutt: ${text(reason, 500)}` }],
  }, actor, now);
  return { ok: true, instance: next, events: [auditEvent({ entityType: 'processInstance', entityId: instance.id, action: 'iso.process.instance_cancelled', actor, before: instance, after: next, reason, now })] };
}

/** Mobil fokusvisning: nå / neste / tidligere. */
export function focusView(instance, proc) {
  const version = versionOf(proc, instance?.version);
  if (!version) return { now: [], next: [], done: [] };
  const diagram = normalizeDiagram(version.diagram);
  const nowNodes = (instance.active || []).map((id) => nodeIn(diagram, id)).filter(Boolean);
  const nextIds = uniq(nowNodes.flatMap((n) => outgoing(diagram, n.id).map((e) => e.to)));
  return {
    now: nowNodes,
    next: nextIds.map((id) => nodeIn(diagram, id)).filter(Boolean),
    done: (instance.completed || []).map((c) => ({ ...c, node: nodeIn(diagram, c.nodeId) })).filter((c) => c.node),
  };
}

/* ───────────────────────── Eksport ───────────────────────── */

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function diagramBounds(diagram) {
  const d = normalizeDiagram(diagram);
  const xs = d.nodes.flatMap((n) => [n.x, n.x + n.w]);
  const ys = [...d.nodes.flatMap((n) => [n.y, n.y + n.h]), ...d.lanes.flatMap((l) => [l.y, l.y + l.h])];
  const minX = Math.min(0, ...xs) - 32;
  const minY = Math.min(0, ...ys) - 32;
  const maxX = Math.max(400, ...xs) + 48;
  const maxY = Math.max(200, ...ys) + 48;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function edgePath(from, to) {
  const x1 = from.x + from.w;
  const y1 = from.y + from.h / 2;
  const x2 = to.x;
  const y2 = to.y + to.h / 2;
  if (x2 >= x1 + 16) {
    const mx = (x1 + x2) / 2;
    return { d: `M${x1},${y1} L${mx},${y1} L${mx},${y2} L${x2},${y2}`, lx: mx, ly: (y1 + y2) / 2 };
  }
  // Bakoverkobling: gå under boksene
  const by = Math.max(from.y + from.h, to.y + to.h) + 32;
  const sx = from.x + from.w / 2;
  const ex = to.x + to.w / 2;
  return { d: `M${sx},${from.y + from.h} L${sx},${by} L${ex},${by} L${ex},${to.y + to.h}`, lx: (sx + ex) / 2, ly: by };
}

/** SVG-eksport (også grunnlag for PNG og PDF i nettleser). */
export function diagramToSvg(diagram, { title = '', subtitle = '', active = [], done = [] } = {}) {
  const d = normalizeDiagram(diagram);
  const b = diagramBounds(d);
  const head = title ? 56 : 0;
  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${b.w}" height="${b.h + head}" viewBox="${b.x} ${b.y - head} ${b.w} ${b.h + head}" font-family="Inter, Arial, sans-serif">`);
  parts.push(`<rect x="${b.x}" y="${b.y - head}" width="${b.w}" height="${b.h + head}" fill="#ffffff"/>`);
  if (title) {
    parts.push(`<text x="${b.x + 24}" y="${b.y - head + 28}" font-size="18" font-weight="700" fill="#0f172a">${esc(title)}</text>`);
    if (subtitle) parts.push(`<text x="${b.x + 24}" y="${b.y - head + 46}" font-size="12" fill="#475569">${esc(subtitle)}</text>`);
  }
  parts.push('<defs><marker id="arr" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#64748b"/></marker></defs>');
  for (const lane of d.lanes) {
    parts.push(`<rect x="${b.x + 8}" y="${lane.y}" width="${b.w - 16}" height="${lane.h}" fill="#f8fafc" stroke="#e2e8f0"/>`);
    parts.push(`<text x="${b.x + 18}" y="${lane.y + 20}" font-size="12" font-weight="600" fill="#475569">${esc(lane.label)}</text>`);
  }
  for (const g of d.groups || []) {
    const gb = groupBounds(d, g);
    if (!gb) continue;
    parts.push(`<rect x="${gb.x}" y="${gb.y}" width="${gb.w}" height="${gb.h}" rx="14" fill="none" stroke="#94a3b8" stroke-dasharray="6 4"/>`);
    parts.push(`<text x="${gb.x + 10}" y="${gb.y + 14}" font-size="11" font-weight="600" fill="#475569">${esc(g.label)}</text>`);
  }
  const map = new Map(d.nodes.map((n) => [n.id, n]));
  for (const e of d.edges) {
    const from = map.get(e.from);
    const to = map.get(e.to);
    if (!from || !to) continue;
    const p = edgePath(from, to);
    parts.push(`<path d="${p.d}" fill="none" stroke="#64748b" stroke-width="1.5" marker-end="url(#arr)"/>`);
    const label = e.label || (e.condition !== 'always' ? EDGE_CONDITIONS.find((c) => c.id === e.condition)?.label : '');
    if (label) parts.push(`<text x="${p.lx + 4}" y="${p.ly - 4}" font-size="11" fill="#334155">${esc(label)}</text>`);
  }
  const activeSet = new Set(active);
  const doneSet = new Set(done);
  for (const n of d.nodes) {
    const fill = activeSet.has(n.id) ? '#dbeafe' : (doneSet.has(n.id) ? '#dcfce7' : (n.color || '#ffffff'));
    const stroke = activeSet.has(n.id) ? '#2563eb' : '#334155';
    if (n.type === 'decision') {
      const cx = n.x + n.w / 2;
      const cy = n.y + n.h / 2;
      parts.push(`<polygon points="${cx},${n.y} ${n.x + n.w},${cy} ${cx},${n.y + n.h} ${n.x},${cy}" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
    } else if (n.type === 'start' || n.type === 'end') {
      parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="${n.h / 2}" fill="${n.type === 'start' ? '#ecfdf5' : '#fef2f2'}" stroke="${stroke}" stroke-width="1.5"/>`);
    } else if (n.type === 'parallel_split' || n.type === 'parallel_join') {
      parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" fill="#334155"/>`);
    } else {
      parts.push(`<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`);
    }
    if (n.type !== 'parallel_split' && n.type !== 'parallel_join') {
      parts.push(`<text x="${n.x + n.w / 2}" y="${n.y + n.h / 2 + 4}" font-size="12" font-weight="600" text-anchor="middle" fill="#0f172a">${esc(n.label.slice(0, 28))}</text>`);
      if (n.roleLabel) parts.push(`<text x="${n.x + n.w / 2}" y="${n.y + n.h - 8}" font-size="10" text-anchor="middle" fill="#64748b">${esc(n.roleLabel.slice(0, 30))}</text>`);
    }
  }
  parts.push('</svg>');
  return parts.join('');
}

/** Eget versjonert JSON-format for import/eksport. */
export function exportProcessJson(proc) {
  return JSON.stringify({
    format: 'protop.iso.process',
    formatVersion: 1,
    title: proc.title,
    purpose: proc.purpose,
    category: proc.category,
    inputs: proc.inputs,
    outputs: proc.outputs,
    kpi: proc.kpi,
    versions: (proc.versions || []).map((v) => ({ version: v.version, state: v.state, publishedAt: v.publishedAt || '', diagram: normalizeDiagram(v.diagram) })),
  }, null, 2);
}

export function importProcessJson(raw) {
  let data;
  try {
    data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return fail('Filen er ikke gyldig JSON.');
  }
  if (data?.format !== 'protop.iso.process') return fail('Ukjent format. Forventet ProTop prosessfil.');
  const last = (data.versions || []).at(-1);
  if (!last?.diagram) return fail('Filen inneholder ikke noe diagram.');
  return {
    ok: true,
    template: {
      key: 'import',
      title: text(data.title, 160) || 'Importert prosess',
      purpose: text(data.purpose, 2000),
      category: data.category,
      inputs: data.inputs,
      outputs: data.outputs,
      kpi: data.kpi,
      executable: true,
      diagram: normalizeDiagram(last.diagram),
    },
  };
}
