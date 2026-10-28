import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  answerConfirm, cancelConfirm, confirmOptions, createConfirmGate, requestConfirm, resetConfirmForTests, subscribeConfirm,
} from './confirm.js';

test('bekreftelse får norske standardtekster etter tone', () => {
  assert.deepEqual(confirmOptions({ tone: 'danger' }), {
    title: 'Slette?', message: '', confirmText: 'Slett', cancelText: 'Avbryt', tone: 'danger',
  });
  assert.equal(confirmOptions('Fjerne raden?').message, 'Fjerne raden?');
  assert.equal(confirmOptions({ danger: true }).tone, 'danger', 'det gamle danger-flagget virker');
  assert.equal(confirmOptions({ tone: 'rar' }).tone, 'default');
  assert.equal(confirmOptions({ tone: 'warn', confirmText: '  Lås  ' }).confirmText, 'Lås');
});

test('bare ett svar per forespørsel, og ny forespørsel avviser den gamle', async () => {
  const gate = createConfirmGate();
  const first = new Promise((resolve) => gate.open(resolve));
  const second = new Promise((resolve) => gate.open(resolve));
  assert.equal(await first, false);
  assert.equal(gate.settle(true), true);
  assert.equal(gate.settle(false), false, 'dobbelttrykk gir ikke et nytt svar');
  assert.equal(await second, true);
  assert.equal(gate.busy, false);
});

test('requestConfirm viser én dialog i verten og gir svaret tilbake', async () => {
  resetConfirmForTests();
  assert.equal(await requestConfirm({ title: 'Uten vert' }), false, 'uten ConfirmHost slettes ingenting');
  const seen = [];
  const stop = subscribeConfirm((request) => seen.push(request));
  const yes = requestConfirm({ title: 'Slette linjen?', tone: 'danger' });
  const shown = seen[seen.length - 1];
  assert.equal(shown.title, 'Slette linjen?');
  assert.equal(shown.confirmText, 'Slett');
  assert.equal(yes.confirmId, shown.id);
  assert.equal(answerConfirm(shown.id + 99, false), false, 'sent svar til en annen dialog gjør ingenting');
  assert.equal(answerConfirm(shown.id, true), true);
  assert.equal(await yes, true);
  assert.equal(seen[seen.length - 1], null, 'dialogen lukkes');
  const no = requestConfirm('Fjerne?');
  assert.equal(cancelConfirm(no.confirmId), true);
  assert.equal(await no, false);
  stop();
  resetConfirmForTests();
});

test('ingen window.confirm i skjermene som skal bruke ProTops dialog', () => {
  const absence = readFileSync(new URL('../../screens/arbeid/AbsenceScreens.jsx', import.meta.url), 'utf8');
  assert.equal(absence.includes('window.confirm'), false);
  assert.match(absence, /await confirm\(\{/);
  assert.match(absence, /const confirm = useConfirm\(\);/);
  assert.match(readFileSync(new URL('../../components/AppShell.jsx', import.meta.url), 'utf8'), /<ConfirmHost \/>/, 'verten er montert i skallet');
  const project = readFileSync(new URL('../../screens/project/ProjectWorkScreen.jsx', import.meta.url), 'utf8');
  assert.match(project, /showUndoToast\(/, 'fjernet dokument kan angres');
});

test('designsystemet eksporterer tilbakemeldingspakken', () => {
  const ui = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  for (const name of ['InlineError', 'Skeleton', 'useConfirm', 'requestConfirm', 'showUndoToast']) {
    assert.match(ui, new RegExp(`\\b${name}\\b`), name);
  }
});
