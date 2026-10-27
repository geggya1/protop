import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getShellLocation, homePathForLinking, isShellPath, parseShellPath, rememberEntryShellPath, setHomeRouteKey, setShellLocation, shellLinkState,
  shellPathFor, takeEntryShellPath,
} from './shellPaths.js';

test('skallsti: fane og underside i adressen', () => {
  assert.equal(shellPathFor('home'), '/hjem');
  assert.equal(shellPathFor('home', 'members'), '/hjem');
  assert.equal(shellPathFor('iso'), '/hjem/iso');
  assert.equal(shellPathFor('iso', 'avvik'), '/hjem/iso/avvik');
  assert.equal(shellPathFor('projects'), '/hjem/prosjekt');
  assert.equal(shellPathFor('more', 'games'), '/hjem/apper/games');
  assert.equal(shellPathFor('ukjent', 'x'), '/hjem', 'ukjente faner gir hjem');
  assert.equal(shellPathFor('hr', 'lov & iso'), '/hjem/hr/lov%20%26%20iso');
});

test('skallsti: tolkes tilbake, også med skråstrek, spørring og store bokstaver', () => {
  assert.deepEqual(parseShellPath('/hjem'), { tab: 'home', subView: null });
  assert.deepEqual(parseShellPath('/hjem/'), { tab: 'home', subView: null });
  assert.deepEqual(parseShellPath('/hjem/iso/avvik'), { tab: 'iso', subView: 'avvik' });
  assert.deepEqual(parseShellPath('/hjem/iso/avvik/?x=1'), { tab: 'iso', subView: 'avvik' });
  assert.deepEqual(parseShellPath('hjem/prosjekt'), { tab: 'projects', subView: null });
  assert.deepEqual(parseShellPath('/HJEM/ISO'), { tab: 'iso', subView: null });
  assert.deepEqual(parseShellPath('/hjem/hr/lov%20%26%20iso'), { tab: 'hr', subView: 'lov & iso' });
  assert.deepEqual(parseShellPath('/hjem/finnesikke/x'), { tab: 'home', subView: null });
  assert.equal(parseShellPath('/settings/profile'), null);
  assert.equal(parseShellPath('/hjemmeside'), null);
  assert.equal(parseShellPath('/hjem/iso/avvik/ekstra'), null);
  assert.ok(isShellPath('/hjem/okonomi/oversikt'));
});

test('skallsti: rundtur for alle kjente faner', () => {
  for (const tab of ['plan', 'notes', 'mail', 'chat', 'chores', 'stars', 'selskap', 'ansatte', 'hr', 'arbeid', 'okonomi', 'kunder', 'anbud', 'kontrakt', 'projects', 'utstyr', 'iso', 'skjema']) {
    assert.deepEqual(parseShellPath(shellPathFor(tab, 'side')), { tab, subView: 'side' }, tab);
  }
});

test('skallsti: linking beholder Hjem-nøkkelen og skallets egen sti', () => {
  setHomeRouteKey('Home-abc');
  assert.deepEqual(shellLinkState('/hjem/iso/risiko'), { routes: [{ name: 'Home', key: 'Home-abc', params: { openShell: { tab: 'iso', subView: 'risiko' } } }] });
  assert.deepEqual(shellLinkState('/hjem').routes[0].params.openShell, { tab: 'home', subView: null });
  assert.equal(shellLinkState('/login'), null);
  setShellLocation('/hjem/hr/oversikt');
  setShellLocation('/settings/profile');
  assert.equal(getShellLocation(), '/hjem/hr/oversikt', 'bare skallstier lagres');
  assert.equal(homePathForLinking('/hjem/iso/avvik?x=1'), '/hjem/iso/avvik', 'nettleseren står på en skallsti: behold den');
  assert.equal(homePathForLinking('/settings/profile'), '/hjem/hr/oversikt', 'tilbake fra en annen skjerm: siste skallsti');
});

test('skallsti: lenken siden ble åpnet på, huskes til etter innlogging (én gang)', () => {
  assert.equal(takeEntryShellPath(), null);
  rememberEntryShellPath('/login');
  assert.equal(takeEntryShellPath(), null, 'innloggingssider er ikke skallstier');
  rememberEntryShellPath('/hjem');
  assert.equal(takeEntryShellPath(), null, 'hjem alene trenger ingen omvei');
  rememberEntryShellPath('/Hjem/ISO/avvik/');
  assert.equal(takeEntryShellPath(), '/hjem/iso/avvik');
  assert.equal(takeEntryShellPath(), null, 'brukes bare én gang');
});
