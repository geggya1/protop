import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  companyLandingTab, getShellLocation, homePathForLinking, isShellPath, parseShellPath, rememberEntryShellPath, setHomeRouteKey, setShellLocation,
  isCompanyOnlyTab, shellLinkState, shellPathAfterSwitch, shellPathFor, shellSearchFor, takeEntryShellPath,
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

test('skallsti: indeksavtalen i spørringen følger ikke med til andre sider', () => {
  const q = '?indeksAvtale=breitorget&indeksSak=ir1&indeksVis=historikk';
  assert.equal(shellSearchFor('okonomi', 'indeks', q), q, 'på indekssiden blir den stående');
  assert.equal(shellSearchFor('selskap', null, q), '');
  assert.equal(shellSearchFor('home', null, q), '');
  assert.equal(shellSearchFor('okonomi', 'faktura', q), '');
  assert.equal(shellSearchFor('selskap', null, '?avtale=abc&indeksAvtale=x'), '?avtale=abc', 'andre spørringer beholdes');
  assert.equal(shellSearchFor('iso', 'avvik', '?x=a%20b'), '?x=a%20b', 'urørt når ingenting fjernes');
  assert.equal(shellSearchFor('iso', 'avvik', ''), '');
});

test('skallsti: bedrift lander på selskapssiden når adressen bare er /hjem', () => {
  assert.equal(companyLandingTab('/hjem', { company: true }), 'selskap');
  assert.equal(companyLandingTab('/hjem/', { company: true }), 'selskap');
  assert.equal(companyLandingTab('/', { company: true }), 'selskap', 'protop.no før adressen er skrevet om til /hjem');
  assert.equal(companyLandingTab('/hjem', { company: false }), null, 'privat beholder Hjem');
  assert.equal(companyLandingTab('/hjem', { company: true, allowed: false }), null, 'uten tilgang til selskapssiden');
  assert.equal(companyLandingTab('/hjem/okonomi/indeks', { company: true }), null, 'en side i adressen åpnes som før');
  assert.equal(companyLandingTab('/settings/profile', { company: true }), null);
});

test('bytte til Privat: bedriftssider blir ikke med, felles sider blir stående (EGEN-04)', () => {
  assert.equal(shellPathAfterSwitch('/hjem/selskap', 'personal'), '/hjem');
  assert.equal(shellPathAfterSwitch('/hjem/okonomi/faktura', 'personal'), '/hjem');
  assert.equal(shellPathAfterSwitch('/hjem/prosjekt', 'personal'), '/hjem');
  assert.equal(shellPathAfterSwitch('/hjem/plan', 'personal'), null, 'Kalender finnes i begge');
  assert.equal(shellPathAfterSwitch('/hjem/timeliste', 'personal'), null, 'egen timeliste finnes i begge');
  assert.equal(shellPathAfterSwitch('/hjem', 'personal'), null);
  assert.equal(shellPathAfterSwitch('/hjem/selskap', 'company'), null, 'til Bedrift: stien står');
  assert.equal(shellPathAfterSwitch('/settings/profile', 'personal'), null, 'ikke en skallsti');
  assert.equal(isCompanyOnlyTab('selskap'), true);
  assert.equal(isCompanyOnlyTab('plan'), false);
  const shell = readFileSync(new URL('../../components/AppShell.jsx', import.meta.url), 'utf8');
  assert.match(shell, /family\.id !== familyId\) return;/, 'skallet lander ikke på selskapssiden med forrige arbeidsområde');
  const platformSwitch = readFileSync(new URL('../utils/platformSwitch.js', import.meta.url), 'utf8');
  assert.ok(
    platformSwitch.indexOf('leaveShellPathForSwitch(') < platformSwitch.indexOf('await selectFamily?.('),
    'adressen ryddes før byttet',
  );
});
