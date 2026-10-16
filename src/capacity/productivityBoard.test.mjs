/**
 * Rendrer kapasitetsflaten med ekte React-elementer, så manglende symboler
 * og ødelagt JSX feiler her.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Module from 'node:module';
import React from 'react';
import { transformSync } from '@babel/core';
import * as planApi from './plan.js';
import {
  makeAllocation,
  weekKeys,
  weekSeries,
} from './plan.js';

const require = createRequire(import.meta.url);
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
};

const svgMock = {
  __esModule: true,
  default: host('Svg'),
  Line: host('Line'),
  Rect: host('Rect'),
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
    if (id === 'react-native-svg') return svgMock;
    if (id === '@expo/vector-icons') return { Ionicons: function Ionicons() { return null; } };
    if (id.includes('employees/model')) {
      return { displayName: (employee) => employee.label || employee.id };
    }
    if (id.includes('capacity/plan')) return planApi;
    return orig(id);
  };
  compiled._compile(out.code, full);
  return compiled.exports;
}

const dispatcher = {
  useState(initial) {
    const value = typeof initial === 'function' ? initial() : initial;
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

function collectText(node, depth = 0, out = []) {
  if (depth > 50 || node == null || typeof node === 'boolean') return out;
  if (Array.isArray(node)) {
    node.forEach((child) => collectText(child, depth, out));
    return out;
  }
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
    return out;
  }
  if (!React.isValidElement(node)) return out;
  if (typeof node.type === 'function') {
    collectText(withHooks(() => node.type(node.props || {})), depth + 1, out);
    return out;
  }
  collectText(node.props && node.props.children, depth + 1, out);
  return out;
}

const boardModule = loadJsx('screens/arbeid/ProductivityBoard.jsx');
const Board = boardModule.default;
const { WeekSumChart } = boardModule;

const people = [
  { id: 'a', label: 'Ada Nord', company: { personnelKind: 'staff', workPercent: '80', status: 'active' } },
  { id: 'b', label: 'Bo Ekstern', company: { personnelKind: 'external', workPercent: '', status: 'active' } },
];
const projects = [
  { id: 'p1', name: 'Alpha', number: '100', phase: 'produksjon', status: 'aktiv' },
];
const members = [{ employeeId: 'a', projectId: 'p1', active: true }];
const weeks = weekKeys('2026-10-12', 4);
const plan = {
  weekHours: 37.5,
  allocations: [
    makeAllocation({
      employeeId: 'a',
      project: projects[0],
      start: '2026-10-12',
      weeks: 3,
      percent: 50,
      weekHours: 37.5,
    }),
  ],
};

const tree = withHooks(() => React.createElement(Board, {
  colors,
  people,
  projects,
  members,
  plan,
  canWrite: true,
  onPlan: () => {},
}));
const text = collectText(tree).join('\n');
assert.match(text, /Ada Nord/);
assert.doesNotMatch(text, /Bo Ekstern/);
assert.match(text, /Intern/);
assert.match(text, /Full uke 40 t/);
const allKinds = withHooks(() => React.createElement(Board, {
  colors,
  people,
  projects,
  members,
  plan,
  canWrite: true,
  onPlan: () => {},
  initialKind: 'alle',
}));
assert.match(collectText(allKinds).join('\n'), /Bo Ekstern/);
assert.match(text, /Sammenslått/);
assert.match(text, /80 % stilling/);

const series = weekSeries(people, plan.allocations, weeks, 37.5);
const chart = withHooks(() => React.createElement(WeekSumChart, { series, colors }));
const chartText = collectText(chart).join('\n');
assert.match(chartText, /U42/);
assert.match(chartText, /%/) ;
assert.ok(series[0].ofContract > 0);
assert.equal(series[0].hours, 18.8);

const screen = readFileSync(join(ROOT, 'screens/arbeid/ProductivityScreen.jsx'), 'utf8');
assert.match(screen, /loadCapacityPlan/);
assert.match(screen, /activeEmployees/);
const hub = readFileSync(join(ROOT, 'screens/arbeid/ArbeidHub.jsx'), 'utf8');
assert.match(hub, /page === 'produktivitet'/);
const menu = readFileSync(join(ROOT, 'src/navigation/shellModules.js'), 'utf8');
assert.match(menu, /id: 'produktivitet', icon: 'bar-chart', label: 'Produktivitet'/);
assert.doesNotMatch(menu, /HR_MENU = \[[\s\S]*produktivitet/);
