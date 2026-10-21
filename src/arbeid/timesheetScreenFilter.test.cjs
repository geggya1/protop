/**
 * Timelisten skjuler prosjekt uten timer siste to måneder, unntatt stjernemerkede,
 * og bunnknappene bruker merkefargen.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');
const colors = {
  brand: '#1099F4',
  ink: '#152033',
  muted: '#8B95A6',
  line: '#E6EBF2',
  card: '#fff',
  bg: '#F4F7FB',
  sunken: '#F3F6FA',
  danger: '#b42318',
  placeholder: '#94a3b8',
  success: '#15803d',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function dateKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

const today = new Date();
const recent = new Date(today.getFullYear(), today.getMonth() - 1, 15);
const projectState = {
  projects: [
    { id: 'p-old', number: '100', name: 'Gammelt uten timer', client: 'A', status: 'aktiv' },
    { id: 'p-star', number: '101', name: 'Stjernemerket', client: 'A', status: 'aktiv' },
    { id: 'p-new', number: '102', name: 'Nytt medlemskap', client: 'A', status: 'aktiv' },
    { id: 'p-hours', number: '103', name: 'Med timer', client: 'A', status: 'aktiv' },
  ],
  members: [
    { id: 'm-old', projectId: 'p-old', employeeId: 'e1', active: true, starred: false, addedAt: '2024-01-01T00:00:00.000Z', role: 'Prosjektmedlem' },
    { id: 'm-star', projectId: 'p-star', employeeId: 'e1', active: true, starred: true, addedAt: '2024-01-01T00:00:00.000Z', role: 'Prosjektmedlem' },
    { id: 'm-new', projectId: 'p-new', employeeId: 'e1', active: true, starred: false, addedAt: new Date().toISOString(), role: 'Prosjektmedlem' },
    { id: 'm-hours', projectId: 'p-hours', employeeId: 'e1', active: true, starred: false, addedAt: '2024-01-01T00:00:00.000Z', role: 'Prosjektmedlem' },
  ],
  timeEntries: [
    { id: 't1', employeeId: 'e1', projectId: 'p-hours', date: dateKey(recent), hours: 7.5 },
    { id: 't0', employeeId: 'e1', projectId: 'p-old', date: '2020-03-01', hours: 8 },
  ],
  absences: [],
  redDays: [],
  timesheetLocks: [],
  timesheetPins: [],
  hiddenTimesheetProjects: [],
  fullDayHours: 7.5,
  activities: [],
};

const employees = [{
  id: 'e1',
  personUid: 'u1',
  person: { firstName: 'Anders', lastName: 'Rolandsen' },
  company: { status: 'active', accessRole: 'Medarbeider' },
}];

function host(name) {
  return function Host(props) {
    return React.createElement(name, props, props && props.children);
  };
}

const rnMock = {
  View: host('View'),
  Text: host('Text'),
  Image: host('Image'),
  ScrollView: host('ScrollView'),
  TouchableOpacity: host('TouchableOpacity'),
  Pressable: host('Pressable'),
  TextInput: host('TextInput'),
  Modal: function Modal() { return null; },
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
    absoluteFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
};

let gridProjects = [];

function loadJsx(rel) {
  const full = path.join(ROOT, rel);
  const code = fs.readFileSync(full, 'utf8');
  const out = babel.transformSync(code, {
    filename: full,
    presets: [['babel-preset-expo', { jsxRuntime: 'classic' }]],
    plugins: [['@babel/plugin-transform-modules-commonjs', { lazy: false }]],
    babelrc: false,
    configFile: false,
    sourceType: 'module',
  });
  const m = new Module(full);
  m.filename = full;
  m.paths = Module._nodeModulePaths(path.dirname(full));
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (id === 'react') return React;
    if (id === 'react-native') return rnMock;
    if (id === '@expo/vector-icons') return { Ionicons: function Ionicons() { return null; } };
    if (id.includes('ThemeContext')) return { useColors: () => colors };
    if (id.includes('/theme')) {
      return { useLayout: () => ({ width: 1280, isPhone: false, isDesktop: true }) };
    }
    if (id.includes('AppContext')) {
      return {
        useApp: () => ({
          familyId: 'co1',
          family: { name: 'CONSULT1 AS', company: { navn: 'CONSULT1 AS' } },
          user: { uid: 'u1', email: 'anders@example.com', displayName: 'Anders Rolandsen' },
          isAdmin: false,
          requestShellTab: () => {},
          shellIntent: null,
          clearShellIntent: () => {},
        }),
      };
    }
    if (id.includes('useCompanyAccess')) {
      return {
        useCompanyAccess: () => ({
          ready: true,
          can: () => false,
          canView: () => false,
          canEdit: () => false,
          canAdmin: () => false,
          previewLocks: () => false,
        }),
      };
    }
    if (id.includes('project/storage')) {
      return {
        peekProjectState: () => projectState,
        loadProjectState: async () => projectState,
        ensureProjectHours: async () => projectState,
        hoursRangeCovered: () => true,
        putProjectState: () => projectState,
        saveProjectState: async () => {},
        applyHoursOntoState: (current, loaded) => ({
          ...(loaded || {}),
          absences: (current?.absences || []).length ? current.absences : (loaded?.absences || []),
          absenceAdjustments: (current?.absenceAdjustments || []).length
            ? current.absenceAdjustments
            : (loaded?.absenceAdjustments || []),
        }),
      };
    }
    if (id.includes('employees/storage')) {
      return { watchEmployees: (_id, onData) => { onData(employees); return () => {}; } };
    }
    if (id.includes('saveToast')) return { showSaveToast: () => {} };
    if (id.includes('usageClient')) return { recordUsage: () => {} };
    if (id.includes('timeEntryStorage')) {
      // Timelisten henter tidligere måneder. Uten disse blir deployen rød fra februar av.
      return {
        removeTimeEntry: async () => {},
        loadTimeEntries: async () => [],
        readCachedTimeEntries: async () => [],
      };
    }
    if (id.includes('absenceStorage')) return { loadAbsences: async () => [] };
    if (id.includes('TimesheetGrid')) {
      return {
        __esModule: true,
        default: function TimesheetGrid(props) {
          gridProjects = props.projects || [];
          return React.createElement('Grid', null, gridProjects.map((row) => row.project.name).join('|'));
        },
      };
    }
    if (
      id.includes('TimeEntryModal')
      || id.includes('BrandBusyOverlay')
      || id.includes('TimesheetDayView')
      || id.includes('MonthJump')
      || id.includes('TimesheetEmployeePicker')
      || id.includes('AbsenceTypeModal')
      || id.includes('TimesheetSideForm')
      || id.includes('ScrollSheet')
    ) {
      return { __esModule: true, default: function Stub() { return null; } };
    }
    return orig(id);
  };
  m._compile(out.code, full);
  return m.exports;
}

function createHooks() {
  const frame = { values: [], i: 0, effects: [] };
  let dirty = false;
  const pending = [];
  const dispatcher = {
    useState(initial) {
      const i = frame.i++;
      if (frame.values.length <= i) {
        frame.values[i] = typeof initial === 'function' ? initial() : initial;
      }
      return [frame.values[i], (next) => {
        const value = typeof next === 'function' ? next(frame.values[i]) : next;
        if (Object.is(value, frame.values[i])) return;
        frame.values[i] = value;
        dirty = true;
      }];
    },
    useMemo(fn, deps) {
      const i = frame.i++;
      const prev = frame.values[i];
      const same = prev && deps && prev.deps.length === deps.length
        && deps.every((dep, index) => Object.is(dep, prev.deps[index]));
      if (same) return prev.value;
      const value = fn();
      frame.values[i] = { deps, value };
      return value;
    },
    useEffect(fn, deps) {
      const i = frame.i++;
      const prev = frame.effects[i];
      const same = prev && deps && prev.deps.length === deps.length
        && deps.every((dep, index) => Object.is(dep, prev.deps[index]));
      if (!same) pending.push({ i, fn, deps });
    },
    useLayoutEffect(fn, deps) { this.useEffect(fn, deps); },
    useRef(value) {
      const i = frame.i++;
      if (frame.values.length <= i) frame.values[i] = { current: value };
      return frame.values[i];
    },
    useCallback(fn) { return fn; },
    useContext() { return undefined; },
  };
  return {
    dispatcher,
    begin() { frame.i = 0; },
    takeDirty() { const was = dirty; dirty = false; return was; },
    runEffects() {
      const batch = pending.splice(0);
      for (const effect of batch) {
        frame.effects[effect.i] = { deps: effect.deps };
        const clean = effect.fn();
        if (typeof clean === 'function') clean();
      }
    },
  };
}

function collect(node, acc, depth = 0) {
  if (depth > 30 || node == null || typeof node === 'boolean') return;
  if (Array.isArray(node)) {
    node.forEach((child) => collect(child, acc, depth));
    return;
  }
  if (typeof node === 'string' || typeof node === 'number') {
    acc.text.push(String(node));
    return;
  }
  if (!React.isValidElement(node)) return;
  const style = node.props && node.props.style;
  if (style) acc.styles.push(style);
  if (typeof node.type === 'function') {
    collect(node.type(node.props), acc, depth + 1);
    return;
  }
  collect(node.props && node.props.children, acc, depth + 1);
}

function backgroundColors(style, acc = []) {
  if (!style) return acc;
  if (Array.isArray(style)) {
    style.forEach((item) => backgroundColors(item, acc));
    return acc;
  }
  if (style.backgroundColor) acc.push(style.backgroundColor);
  return acc;
}

async function renderScreen(Screen) {
  const hooks = createHooks();
  const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  assert.ok(internals, 'React 19 client internals missing');
  let tree = null;
  for (let pass = 0; pass < 12; pass += 1) {
    hooks.begin();
    const previous = internals.H;
    internals.H = hooks.dispatcher;
    try {
      tree = Screen({ lockedEmployeeId: 'e1' });
    } finally {
      internals.H = previous;
    }
    hooks.runEffects();
    await Promise.resolve();
    await Promise.resolve();
    if (!hooks.takeDirty()) break;
  }
  return tree;
}

const { default: ArbeidScreen } = loadJsx('screens/arbeid/ArbeidScreen.jsx');

(async () => {
  const tree = await renderScreen(ArbeidScreen);
  const acc = { text: [], styles: [] };
  collect(tree, acc);
  const text = acc.text.join('\n');
  const names = gridProjects.map((row) => row.project.id).sort();
  assert.deepEqual(names, ['p-hours', 'p-star'], `synlige prosjekt: ${names.join(', ')}`);
  assert.ok(!text.includes('Henter timer'), 'timelisten skal ikke låse skjermen på «Henter timer»');
  assert.ok(text.includes('Legg til prosjekt'));
  assert.ok(text.includes('Legg til fravær / ferie'));
  const fills = acc.styles.flatMap((style) => backgroundColors(style));
  assert.ok(fills.includes('#1099F4'), `forventet blå merkefarge, fikk ${fills.join(', ')}`);
  assert.ok(!fills.includes('#0d9488') && !fills.includes('#0f766e'), `teal knapper igjen: ${fills.join(', ')}`);
  const brandButtons = fills.filter((color) => color === '#1099F4');
  assert.ok(brandButtons.length >= 2, `forventet minst to blå knapper, fikk ${brandButtons.length}`);
  console.log('timesheetScreenFilter.test.cjs: ok');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
