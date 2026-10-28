import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../../app.web.css', import.meta.url), 'utf8');

/** Regler på toppnivå i stilarket (utenfor @media), med selektor og innhold. */
function topLevelRules(text) {
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const ch = clean[i];
    if (ch === '{') {
      if (depth === 0) rules.push({ selector: clean.slice(start, i).trim(), bodyStart: i + 1 });
      depth += 1;
    } else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        rules[rules.length - 1].body = clean.slice(rules[rules.length - 1].bodyStart, i);
        start = i + 1;
      }
    }
  }
  return rules;
}

test('fokusringen gjelder på alle bredder, ikke bare desktop (WCAG 2.4.7)', () => {
  const rules = topLevelRules(css);
  const focus = rules.find((r) => !r.selector.startsWith('@') && r.selector.includes('[role="tab"]:focus-visible'));
  assert.ok(focus, 'fokusregelen ligger på toppnivå');
  for (const role of ['button', 'link', 'tab', 'checkbox', 'switch']) {
    assert.ok(focus.selector.includes(`[role="${role}"]:focus-visible`), `rollen ${role} har fokusring`);
  }
  for (const tag of ['input', 'textarea', 'select', 'a', 'button']) {
    assert.ok(focus.selector.includes(`${tag}:focus-visible`), `${tag} har fokusring`);
  }
  assert.match(focus.body, /outline:\s*2px solid #1099F4/);
  const desktop = rules.find((r) => r.selector.startsWith('@media (min-width: 1024px)'));
  assert.ok(desktop);
  assert.equal(desktop.body.includes(':focus-visible'), false, 'ingen egen fokusregel inne i desktop-media query');
});

test('søkefelt uten egen ramme får fokus på feltet rundt', () => {
  const rules = topLevelRules(css);
  assert.ok(rules.some((r) => r.selector === '[data-focus-within="1"]:focus-within' && /outline:\s*2px solid/.test(r.body)));
  for (const path of ['components/OptionPicker.jsx', 'components/DesktopRail.jsx', 'components/arbeid/TimesheetEmployeePicker.jsx']) {
    const src = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    assert.ok(src.includes("dataSet={{ focusWithin: '1' }}"), `${path} markerer søkefeltet`);
  }
});
