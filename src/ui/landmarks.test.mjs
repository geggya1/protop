import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('skallet har landemerker for meny og hovedinnhold (WCAG 1.3.1)', () => {
  const shell = read('components/AppShell.jsx');
  assert.match(shell, /role="navigation"\s+aria-label="Hovedmeny"/);
  assert.match(shell, /nativeID="shell-scroll"\s+role="main"/);
  assert.match(read('components/parentHome/ParentShellBottomNav.jsx'), /role="navigation" aria-label="Snarveier"/);
});

test('hopp-lenken er første element i skallet og synes med fokus (WCAG 2.4.1)', () => {
  const shell = read('components/AppShell.jsx');
  assert.match(shell, /<SkipToContent \/>/);
  assert.match(shell, /Hopp til innholdet/);
  assert.match(shell, /getElementById\('shell-scroll'\)/);
  // Lenken endrer ikke adressen: navigasjonen leser stien, og et #-hopp skal ikke bytte side.
  assert.match(shell, /event\.preventDefault\(\)/);
  const css = read('app.web.css');
  assert.match(css, /\.wp-skip-link \{[\s\S]*?top: -80px;/);
  assert.match(css, /\.wp-skip-link:focus,[\s\S]*?top: 12px;/);
});

test('sidetitler i felles komponenter er overskrifter (WCAG 2.4.6)', () => {
  assert.match(read('components/ui.jsx'), /<Text accessibilityRole="header" aria-level=\{2\} style=\{\[styles\.title/);
  const header = read('components/ShellHeader.jsx');
  assert.equal((header.match(/accessibilityRole="header"/g) || []).length >= 2, true, 'tittelen i toppfeltet på PC og mobil');
  for (const path of ['components/ConfirmDialog.jsx', 'components/ConfirmActionModal.jsx', 'components/ScrollSheet.jsx', 'components/DesktopFormShell.jsx']) {
    assert.match(read(path), /accessibilityRole="header"/, path);
  }
});
