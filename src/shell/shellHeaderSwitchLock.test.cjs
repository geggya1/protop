/**
 * Privat/Bedrift på desktop-headeren skal ligge i et absolutt midtstilt spor.
 * Tittel, «Vis som» og sideknapper får ikke flytte bryteren.
 */
const fs = require('fs');
const path = require('path');
const Module = require('module');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const assert = require('node:assert/strict');

const ROOT = path.join(__dirname, '../..');

function flattenStyle(style) {
  if (!style) return {};
  if (Array.isArray(style)) {
    return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
  }
  return style;
}

function host(name) {
  return function Host(props) {
    const style = flattenStyle(props && props.style);
    return React.createElement(
      'div',
      {
        'data-rn': name,
        'data-id': props && props.nativeID ? props.nativeID : undefined,
        'data-pointer': props && props.pointerEvents ? props.pointerEvents : undefined,
        'data-style': JSON.stringify(style),
      },
      props && props.children,
    );
  };
}

const rnMock = {
  View: host('View'),
  Text: host('Text'),
  TouchableOpacity: host('TouchableOpacity'),
  StyleSheet: {
    create: (styles) => styles,
    hairlineWidth: 1,
    absoluteFillObject: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  },
  Platform: { OS: 'web', select: (options) => options && (options.web || options.default) },
};

function loadShellHeader() {
  const full = path.join(ROOT, 'components/ShellHeader.jsx');
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
  const orig = Module.prototype.require;
  m.require = function requireMock(id) {
    if (id === 'react') return React;
    if (id === 'react-native') return rnMock;
    if (id === 'react-native-safe-area-context') {
      return { useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) };
    }
    if (id.includes('standaloneChrome')) {
      return {
        isStandaloneWeb: () => false,
        statusBarCover: () => 0,
        headerTopPad: () => 0,
        tabBarBottomPad: () => 0,
      };
    }
    if (id.includes('useVisualViewportFrame')) {
      return { useVisualViewportFrame: () => ({ top: 0, height: 0, bottom: 0 }) };
    }
    if (id === '@react-navigation/native') return { useNavigation: () => ({}) };
    if (id === '@expo/vector-icons') return { Ionicons: function Ionicons() { return null; } };
    if (id.includes('ThemeContext')) return { useColors: () => ({ ink: '#111', muted: '#888', line: '#ddd', card: '#fff' }) };
    if (id.includes('i18n')) return { useI18n: () => ({ t: (key) => key }) };
    if (id.includes('/theme')) return { useLayout: () => ({ isPhone: false }) };
    if (id.includes('HelpButton')) return { __esModule: true, default: host('HelpButton') };
    if (id.includes('HelpTarget')) return { __esModule: true, default: host('HelpTarget') };
    if (id.includes('AvatarPicker')) return { AvatarBubble: function AvatarBubble() { return null; } };
    if (id.includes('ProfileMenuModal')) return { __esModule: true, default: function ProfileMenuModal() { return null; } };
    if (id.includes('AppContext')) {
      return { useApp: () => ({ activeProfile: { name: 'Geir' }, family: { name: 'CONSULT1 AS' } }) };
    }
    if (id.includes('NotificationContext')) return { useUnread: () => ({ unreadTotal: 0 }) };
    if (id.includes('IconBadge')) return { __esModule: true, default: host('IconBadge') };
    if (id.includes('BrandLogo')) return { __esModule: true, default: function BrandLogo() { return null; } };
    if (id.includes('PlatformSwitch')) {
      return {
        __esModule: true,
        default: function PlatformSwitch() {
          return React.createElement('div', { 'data-rn': 'PlatformSwitch' });
        },
      };
    }
    if (id.includes('brandLogoTone')) return { brandLogoToneForBackground: () => 'onLight' };
    if (id.includes('personalShell')) return { isPersonalShell: () => false };
    if (id.includes('companyOffer')) return { companyContextLabel: () => 'Bedrift - CONSULT1 AS' };
    if (id.includes('openNotifications')) return { openNotifications: () => {} };
    return orig.call(this, id);
  };
  m._compile(out.code, full);
  return m.exports.default;
}

function decodeAttr(value) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;/g, "'");
}

function lockStyle(html) {
  const match = html.match(/data-id="platform-switch-lock"[^>]*data-style="([^"]*)"/);
  assert.ok(match, 'platform-switch-lock mangler');
  return JSON.parse(decodeAttr(match[1]));
}

function renderHeader(ShellHeader, props) {
  return renderToStaticMarkup(React.createElement(ShellHeader, {
    compact: true,
    title: props.title,
    titleRight: props.titleRight || null,
    viewAs: props.viewAs || null,
  }));
}

const ShellHeader = loadShellHeader();

const quiet = renderHeader(ShellHeader, { title: 'Timeliste' });
const busy = renderHeader(ShellHeader, {
  title: 'Medarbeidere og kompetanse i konsernet',
  titleRight: React.createElement('div', { 'data-rn': 'TitleRight' }, 'Ny hendelse'),
  viewAs: React.createElement('div', { 'data-rn': 'ViewAs' }, 'Vis som'),
});

const quietLock = lockStyle(quiet);
const busyLock = lockStyle(busy);

assert.deepEqual(quietLock, busyLock);
assert.equal(quietLock.position, 'absolute');
assert.equal(quietLock.left, 0);
assert.equal(quietLock.right, 0);
assert.equal(quietLock.alignItems, 'center');
assert.equal(quietLock.justifyContent, 'center');
assert.match(quiet, /data-pointer="box-none"/);
assert.match(quiet, /data-id="platform-switch-lock"[^>]*>\s*<div data-rn="PlatformSwitch"/);
assert.match(busy, /data-id="platform-switch-lock"[^>]*>\s*<div data-rn="PlatformSwitch"/);

const sideStyles = [...quiet.matchAll(/data-style="([^"]*)"/g)]
  .map((hit) => JSON.parse(decodeAttr(hit[1])))
  .filter((style) => style.flex === 1 && style.minWidth === 0);
assert.equal(sideStyles.length, 2);
assert.equal(sideStyles.filter((style) => style.paddingRight === 118).length, 1);
assert.equal(sideStyles.filter((style) => style.paddingLeft === 118).length, 1);

const phone = renderToStaticMarkup(React.createElement(ShellHeader, {
  compact: false,
  title: 'Fraværsoversikt',
}));
const phoneStyles = [...phone.matchAll(/data-style="([^"]*)"/g)]
  .map((hit) => JSON.parse(decodeAttr(hit[1])));
// EGEN-03: lyspæren står i logo-raden (ved menyknappen), ikke hengende over innholdet.
assert.equal(phoneStyles.some((style) => style.top === '100%' && style.position === 'absolute'), false,
  'lyspæren henger ikke under profilbildet');
const row = phone.indexOf('data-rn="HelpButton"');
assert.ok(row > 0, 'lyspæren finnes på telefon');
assert.ok(row < phone.indexOf('data-rn="BrandLogo"') || phone.indexOf('data-rn="BrandLogo"') < 0,
  'lyspæren står i raden ved menyen, før logoen');
const switchRow = phoneStyles.find((style) => style.minHeight === 52 && style.zIndex === 3);
assert.ok(switchRow, 'Privat/Bedrift-baren skal ha full høyde');
assert.equal(switchRow.overflow, 'visible');
assert.ok(switchRow.paddingTop >= 8 && switchRow.paddingBottom >= 8);

console.log('shellHeaderSwitchLock.test.cjs: ok');
