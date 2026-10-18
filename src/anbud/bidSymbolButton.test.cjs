/**
 * Tilbudskortets tre handlinger er ikonknapper.
 * Ordene Åpne, Tilbake til vurdering og Uaktuell skal ikke ligge som løpende tekst.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');

function host(name) {
  return function Host(props) {
    const { children, accessibilityLabel, accessibilityRole, accessibilityState, title, disabled, dataSet, ...rest } = props || {};
    const data = {};
    if (dataSet) {
      for (const key of Object.keys(dataSet)) data[`data-${key}`] = dataSet[key];
    }
    return React.createElement(name, {
      ...rest,
      ...data,
      title,
      role: accessibilityRole,
      'aria-label': accessibilityLabel,
      'aria-disabled': accessibilityState && accessibilityState.disabled ? 'true' : undefined,
      disabled: disabled || undefined,
    }, children);
  };
}

const rnMock = {
  View: host('View'),
  Text: host('Text'),
  TouchableOpacity: host('button'),
  Pressable: host('button'),
  StyleSheet: { create: (styles) => styles },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
};

function load(rel) {
  const full = path.join(ROOT, rel);
  const out = babel.transformSync(fs.readFileSync(full, 'utf8'), {
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
  m.require = (id) => {
    if (id === 'react') return React;
    if (id === 'react-native') return rnMock;
    if (id === '@expo/vector-icons') {
      return {
        Ionicons(props) {
          return React.createElement('i', { 'data-icon': props.name, 'data-color': props.color });
        },
      };
    }
    return Module.prototype.require.call(m, id);
  };
  m._compile(out.code, full);
  return m.exports;
}

const { BidDeskActions } = load('screens/anbud/BidSymbolButton.jsx');

const colors = {
  brand: '#1099F4',
  card: '#fff',
  danger: '#dc2626',
};

function render(props) {
  return renderToStaticMarkup(React.createElement(BidDeskActions, {
    colors,
    title: 'Rammeavtale',
    canReturn: true,
    canLeave: true,
    busy: false,
    onOpen() {},
    onReturn() {},
    onLeave() {},
    ...props,
  }));
}

const full = render();
assert.match(full, /data-icon="open-outline"/);
assert.match(full, /data-icon="arrow-undo-outline"/);
assert.match(full, /data-icon="ban-outline"/);
assert.match(full, /data-title="Åpne"/);
assert.match(full, /data-title="Tilbake til vurdering"/);
assert.match(full, /data-title="Uaktuell"/);
assert.match(full, /aria-label="Åpne Rammeavtale her"/);
assert.match(full, /aria-label="Flytt Rammeavtale tilbake til vurdering"/);
assert.match(full, /aria-label="Meld Rammeavtale som uaktuell"/);
assert.equal((full.match(/<button/g) || []).length, 3);
assert.doesNotMatch(full, />Åpne</);
assert.doesNotMatch(full, />Tilbake til vurdering</);
assert.doesNotMatch(full, />Uaktuell</);

const openOnly = render({ canReturn: false, canLeave: false });
assert.match(openOnly, /data-icon="open-outline"/);
assert.doesNotMatch(openOnly, /arrow-undo-outline|ban-outline/);
assert.equal((openOnly.match(/<button/g) || []).length, 1);

const busy = render({ busy: true });
assert.match(busy, /aria-label="Flytt Rammeavtale tilbake til vurdering"[^>]*disabled/);
assert.match(busy, /aria-label="Meld Rammeavtale som uaktuell"[^>]*disabled/);
assert.doesNotMatch(busy, /aria-label="Åpne Rammeavtale her"[^>]*disabled/);

const desk = fs.readFileSync(path.join(ROOT, 'screens/anbud/BidDesk.jsx'), 'utf8');
const workspace = fs.readFileSync(path.join(ROOT, 'screens/anbud/BidWorkspace.jsx'), 'utf8');
assert.match(desk, /<BidDeskActions/);
assert.doesNotMatch(desk, />Åpne</);
assert.doesNotMatch(desk, />Tilbake til vurdering</);
assert.doesNotMatch(desk, />Uaktuell</);
assert.doesNotMatch(workspace, />Tilbake til vurdering</);
assert.doesNotMatch(workspace, />Uaktuell</);

console.log('bid symbol buttons: 3 icon buttons, no running text');
