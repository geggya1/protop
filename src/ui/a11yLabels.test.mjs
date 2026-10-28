import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const root = fileURLToPath(new URL('../../', import.meta.url));

// Bedriftsmodulene: alle ikonknapper skal ha skjermlesertekst (WCAG 1.1.1 / 4.1.2).
const DIRS = [
  'screens/company', 'screens/employees', 'screens/hr', 'screens/arbeid', 'screens/economy', 'screens/customers',
  'screens/anbud', 'screens/project', 'screens/iso', 'screens/doccontrol', 'screens/equipment',
  'components/arbeid', 'components/company', 'components/economy', 'components/employees',
  'components/equipment', 'components/project', 'components/documents',
];

function jsxFiles(dir) {
  const out = [];
  let names = [];
  try { names = readdirSync(join(root, dir)); } catch { return out; }
  for (const name of names) {
    const rel = `${dir}/${name}`;
    if (statSync(join(root, rel)).isDirectory()) out.push(...jsxFiles(rel));
    else if (/\.jsx$/.test(name) && !/\.test\./.test(name)) out.push(rel);
  }
  return out;
}

function tagName(node) {
  if (!node) return '';
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') return `${tagName(node.object)}.${tagName(node.property)}`;
  return '';
}

function walk(node, visit) {
  if (!node || typeof node.type !== 'string') return;
  visit(node);
  for (const key of Object.keys(node)) {
    const value = node[key];
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (value && typeof value.type === 'string') walk(value, visit);
  }
}

/** Knapper der det eneste innholdet er et ikon, og som verken har etikett eller spredte props. */
export function unlabeledIconButtons(source) {
  const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
  const hits = [];
  walk(ast, (node) => {
    if (node.type !== 'JSXElement') return;
    if (!/^(TouchableOpacity|Pressable|TouchableHighlight)$/.test(tagName(node.openingElement.name))) return;
    const kids = node.children.filter((child) => !(child.type === 'JSXText' && !child.value.trim()));
    if (!kids.length || !kids.every((child) => child.type === 'JSXElement' && /Ionicons|IconBadge/.test(tagName(child.openingElement.name)))) return;
    const attrs = node.openingElement.attributes;
    if (attrs.some((a) => a.type === 'JSXSpreadAttribute' || tagName(a.name) === 'accessibilityLabel')) return;
    hits.push(node.loc.start.line);
  });
  return hits;
}

test('ikonknapper i bedriftsmodulene har skjermlesertekst', () => {
  const missing = [];
  for (const dir of DIRS) {
    for (const rel of jsxFiles(dir)) {
      for (const line of unlabeledIconButtons(readFileSync(join(root, rel), 'utf8'))) missing.push(`${rel}:${line}`);
    }
  }
  assert.deepEqual(missing, [], 'legg accessibilityLabel på ikonknappene');
});

test('finner en ikonknapp uten etikett', () => {
  const src = 'const A = () => (<View><TouchableOpacity onPress={f}><Ionicons name="x" /></TouchableOpacity>'
    + '<Pressable accessibilityLabel="Lukk"><Ionicons name="close" /></Pressable></View>);';
  assert.deepEqual(unlabeledIconButtons(src), [1]);
});

test('innlogging og registrering har etiketter og autofyll (WCAG 1.3.5)', () => {
  const login = readFileSync(join(root, 'screens/LoginScreen.jsx'), 'utf8');
  assert.match(login, /autoComplete="username"/);
  assert.match(login, /autoComplete="current-password"/);
  assert.match(login, /accessibilityLabel=\{t\('auth\.password'\)\}/);
  assert.match(login, /errorText\} accessibilityRole="alert" accessibilityLiveRegion="polite"/);
  const register = readFileSync(join(root, 'screens/RegisterScreen.jsx'), 'utf8');
  for (const value of ['name', 'email', 'new-password']) assert.ok(register.includes(`autoComplete="${value}"`), value);
  const time = readFileSync(join(root, 'components/arbeid/TimeEntryModal.jsx'), 'utf8');
  assert.match(time, /accessibilityLabel="Timer"/);
});
