/**
 * Rendrer prosjektfremdriften med ekte React-elementer, så manglende symboler
 * og ødelagt JSX feiler her.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import React from 'react';
import { transformSync } from '@babel/core';
import * as planApi from '../capacity/plan.js';
import * as timelineApi from './timeline.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const colors = {
  brand: '#1099F4',
  ink: '#152033',
  muted: '#8B95A6',
  line: '#E6EBF2',
  card: '#fff',
  bg: '#F4F7FB',
  sunken: '#F3F6FA',
};

function host(name) {
  return function Host(props) {
    return React.createElement(name, props, props && props.children);
  };
}

const rnMock = {
  View: host('View'),
  Text: host('Text'),
  ScrollView: host('ScrollView'),
  Pressable: host('Pressable'),
  TextInput: host('TextInput'),
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
    absoluteFill: { position: 'absolute' },
  },
  Platform: { OS: 'web', select: (options) => options?.web || options?.default },
  useWindowDimensions: () => ({ width: 1280, height: 800, scale: 1, fontScale: 1 }),
};

function loadJsx(rel) {
  const full = join(ROOT, rel);
  const out = transformSync(readFileSync(full, 'utf8'), {
    filename: full,
    presets: [['babel-preset-expo', { jsxRuntime: 'classic' }]],
    plugins: [['@babel/plugin-transform-modules-commonjs', { lazy: false }]],
    babelrc: false,
    configFile: false,
    sourceType: 'module',
  });
  const compiled = new Module(full);
  compiled.filename = full;
  compiled.paths = Module._nodeModulePaths(dirname(full));
  const orig = compiled.require.bind(compiled);
  compiled.require = (id) => {
    if (id === 'react') return React;
    if (id === 'react-native') return rnMock;
    if (id === '@expo/vector-icons') return { Ionicons: function Ionicons() { return null; } };
    if (id.includes('capacity/plan')) return planApi;
    if (id.includes('project/timeline')) return timelineApi;
    return orig(id);
  };
  compiled._compile(out.code, full);
  return compiled.exports;
}

// Tilstand i tavlen etter rekkefølge: zoom, anker, søk, åpen rad, skuff, målt bredde.
let stateOverrides = {};
let stateCalls = 0;
const dispatcher = {
  useState(initial) {
    const index = stateCalls;
    stateCalls += 1;
    const value = Object.prototype.hasOwnProperty.call(stateOverrides, index)
      ? stateOverrides[index]
      : (typeof initial === 'function' ? initial() : initial);
    return [value, () => {}];
  },
  useMemo(fn) { return fn(); },
  useEffect() {},
  useLayoutEffect() {},
  useRef(value) { return { current: value }; },
  useCallback(fn) { return fn; },
  useContext() { return undefined; },
};

function withHooks(fn) {
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  assert.ok(internals, 'React 19 client internals missing');
  const previous = internals.H;
  internals.H = dispatcher;
  try {
    return fn();
  } finally {
    internals.H = previous;
  }
}

/** Ekspanderer hele treet til vertselementer, så søk kan gjøres uten å rendre to ganger. */
function expand(node, depth = 0) {
  if (depth > 60 || node == null || typeof node === 'boolean') return null;
  if (Array.isArray(node)) return node.map((child) => expand(child, depth + 1));
  if (typeof node === 'string' || typeof node === 'number') return node;
  if (!React.isValidElement(node)) return null;
  if (typeof node.type === 'function') {
    return expand(withHooks(() => node.type(node.props || {})), depth + 1);
  }
  if (node.type === React.Fragment) return expand(node.props.children, depth + 1);
  return { type: node.type, props: node.props, children: expand(node.props?.children, depth + 1) };
}

function walk(tree, visit) {
  if (tree == null) return;
  if (Array.isArray(tree)) {
    tree.forEach((child) => walk(child, visit));
    return;
  }
  if (typeof tree !== 'object') return;
  visit(tree);
  walk(tree.children, visit);
}

function ids(tree) {
  const out = [];
  walk(tree, (node) => { if (node.props?.nativeID) out.push(node.props.nativeID); });
  return out;
}

function byId(tree, id) {
  let hit = null;
  walk(tree, (node) => { if (!hit && node.props?.nativeID === id) hit = node; });
  return hit;
}

function texts(tree) {
  const out = [];
  const collect = (node) => {
    if (node == null) return;
    if (Array.isArray(node)) { node.forEach(collect); return; }
    if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return; }
    collect(node.children);
  };
  collect(tree);
  return out.join(' ');
}

function styleOf(node) {
  const flat = [].concat(node?.props?.style || []).flat(Infinity).filter(Boolean);
  return Object.assign({}, ...flat);
}

const boardModule = loadJsx('screens/arbeid/ProjectTimelineBoard.jsx');
const Board = boardModule.default;
assert.equal(boardModule.timelineLabelWidth(390), 132);
assert.equal(boardModule.timelineLabelWidth(700), 190);
assert.equal(boardModule.timelineLabelWidth(1280), 260);

const projects = [
  { id: 'p1', number: '1001', name: 'Skole', client: 'Sandnes kommune', phase: 'produksjon', start: '2026-02-01', end: '2026-12-31' },
  { id: 'p2', number: '1002', name: 'Bru', phase: 'planlegging', contractId: 'k1' },
  { id: 'p3', number: '1003', name: 'Uten datoer', phase: 'produksjon' },
  { id: 'p4', number: '0900', name: 'Gammel', phase: 'avsluttet', start: '2024-01-01', end: '2024-06-30' },
];
const contracts = [
  { id: 'k1', title: 'Rammeavtale', start: '2026-06-01', end: '2027-01-31', renewal: { type: 'opsjon', until: '2027-12-31' } },
];
const timeEntries = [
  { projectId: 'p1', employeeId: 'a', date: '2026-10-19', hours: 40 },
  { projectId: 'p1', employeeId: 'a', date: '2026-10-12', hours: 6 },
  { projectId: 'p2', employeeId: 'a', date: '2026-10-20', hours: 3 },
];
const props = {
  colors, projects, contracts, timeEntries, fullWeekHours: 40, today: '2026-10-27',
};

function render(overrides = {}) {
  stateOverrides = overrides;
  stateCalls = 0;
  return expand(React.createElement(Board, props));
}

const closed = render({ 5: 1240 });
const closedIds = ids(closed);
for (const id of ['fremdrift-board', 'fremdrift-matrix', 'fremdrift-row-p1', 'fremdrift-row-p2', 'fremdrift-row-p3', 'fremdrift-drawer']) {
  assert.ok(closedIds.includes(id), `mangler ${id}`);
}
assert.equal(closedIds.includes('fremdrift-row-p4'), false, 'avsluttet ligger i lukket skuff');
assert.ok(closedIds.includes('fremdrift-plan-p1'), 'planlagt stolpe fra prosjektet');
assert.ok(closedIds.includes('fremdrift-plan-p2'), 'planlagt stolpe fra avtalen');
assert.ok(closedIds.includes('fremdrift-option-p2'), 'opsjon fra avtalen');
assert.ok(closedIds.includes('fremdrift-work-p1-2026-10-12'), 'utført arbeid uke 42');
assert.ok(closedIds.includes('fremdrift-work-p1-2026-10-19'), 'utført arbeid uke 43');
assert.equal(closedIds.some((id) => id.startsWith('fremdrift-detail-')), false);

const text = texts(closed);
assert.match(text, /Aktive prosjekter/);
assert.match(text, /Avsluttede og arkiverte prosjekter \(1\)/);
assert.match(text, /Ingen planlagt periode/, 'prosjekt uten datoer sier fra');
assert.match(text, /Q4 2026/);
assert.match(text, /apr 2026 – mar 2027/);

// Stolpen ligger innenfor sporet og starter i februar 2026, før vinduet.
const plan = styleOf(byId(closed, 'fremdrift-plan-p1'));
assert.equal(plan.left, 0);
assert.ok(plan.width > 0 && plan.width <= 1240 - 260);
assert.equal(plan.borderTopLeftRadius, 0, 'åpen start har rett kant');
const option = styleOf(byId(closed, 'fremdrift-option-p2'));
const main = styleOf(byId(closed, 'fremdrift-plan-p2'));
assert.ok(Math.abs(main.left + main.width - option.left) < 0.01, 'opsjonen fortsetter der avtalen slutter');
const full = styleOf(byId(closed, 'fremdrift-work-p1-2026-10-19'));
assert.equal(full.backgroundColor, planApi.INTENSITY_SCALE[5].color, '40 t er en full uke');

const open = render({ 3: 'p2', 4: true, 5: 1240 });
const openIds = ids(open);
assert.ok(openIds.includes('fremdrift-row-p4'), 'skuffen åpner avsluttede');
const detail = texts(byId(open, 'fremdrift-detail-p2'));
assert.match(detail, /01\.06\.2026 – 31\.01\.2027/);
assert.match(detail, /Avtale · Rammeavtale/);
assert.match(detail, /til 31\.12\.2027/);
assert.match(detail, /3 t siden/);

const searched = render({ 2: 'sandnes', 5: 1240 });
const searchedIds = ids(searched);
assert.ok(searchedIds.includes('fremdrift-row-p1'));
assert.equal(searchedIds.includes('fremdrift-row-p2'), false);

stateOverrides = {};
stateCalls = 0;
const empty = expand(React.createElement(Board, { ...props, projects: [] }));
assert.match(texts(empty), /Ingen prosjekter ennå/);

const screenSrc = readFileSync(join(ROOT, 'screens/arbeid/ProjectTimelineScreen.jsx'), 'utf8');
assert.match(screenSrc, /ensureProjectHours\(companyId, range\)/, 'timer hentes for vinduet');
assert.match(screenSrc, /canView\('productivity'\) && access\.canView\('projects'\)/);
const hub = readFileSync(join(ROOT, 'screens/arbeid/ArbeidHub.jsx'), 'utf8');
assert.match(hub, /page === 'fremdrift'/);

console.log('timelineBoard.test.mjs: ok');
