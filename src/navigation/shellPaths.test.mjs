import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SHELL_DETAILS, companyLandingTab, detailSyncStep, getShellLocation, homePathForLinking, isShellPath, parseShellPath, rememberEntryShellPath,
  setHomeRouteKey, setShellLocation, shellDetailKind, shellLinkState, shellPathFor, shellSearchFor, takeEntryShellPath,
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
  assert.equal(parseShellPath('/hjem/iso/avvik/ekstra/mer'), null);
  assert.equal(parseShellPath('/hjem/iso/risiko/ekstra'), null, 'bare detaljsider har et tredje ledd');
  assert.ok(isShellPath('/hjem/okonomi/oversikt'));
});

test('skallsti: rundtur for alle kjente faner', () => {
  for (const tab of ['plan', 'notes', 'mail', 'chat', 'chores', 'stars', 'selskap', 'hr', 'arbeid', 'okonomi', 'kunder', 'anbud', 'kontrakt', 'utstyr', 'iso', 'skjema']) {
    assert.deepEqual(parseShellPath(shellPathFor(tab, 'side')), { tab, subView: 'side' }, tab);
  }
  // Prosjekt og Ansatte har ingen undersider: neste ledd er id-en på detaljsiden.
  for (const tab of ['projects', 'ansatte']) {
    assert.deepEqual(parseShellPath(shellPathFor(tab)), { tab, subView: null }, tab);
  }
});

test('detaljadresse (UX-20): prosjekt, faktura, ansatt og ISO-avvik', () => {
  assert.equal(shellPathFor('projects', null, 'prj-1'), '/hjem/prosjekt/prj-1');
  assert.equal(shellPathFor('okonomi', 'faktura', 'inv-1001'), '/hjem/okonomi/faktura/inv-1001');
  assert.equal(shellPathFor('ansatte', null, 'emp-kari'), '/hjem/ansatte/emp-kari');
  assert.equal(shellPathFor('iso', 'avvik', 'f_1'), '/hjem/iso/avvik/f_1');
  assert.equal(shellPathFor('iso', 'avvik', 'a/b c'), '/hjem/iso/avvik/a%2Fb%20c', 'id-en kodes');
  assert.deepEqual(parseShellPath('/hjem/prosjekt/prj-1'), { tab: 'projects', subView: null, detail: 'prj-1' });
  assert.deepEqual(parseShellPath('/hjem/okonomi/faktura/inv-1001/'), { tab: 'okonomi', subView: 'faktura', detail: 'inv-1001' });
  assert.deepEqual(parseShellPath('/hjem/ansatte/emp-kari?x=1'), { tab: 'ansatte', subView: null, detail: 'emp-kari' });
  assert.deepEqual(parseShellPath('/HJEM/ISO/avvik/f_1'), { tab: 'iso', subView: 'avvik', detail: 'f_1' });
  assert.deepEqual(parseShellPath('/hjem/iso/avvik/a%2Fb%20c'), { tab: 'iso', subView: 'avvik', detail: 'a/b c' });
  for (const kind of Object.keys(SHELL_DETAILS)) {
    const { tab, subView } = SHELL_DETAILS[kind];
    assert.equal(shellDetailKind(tab, subView), kind);
    const back = parseShellPath(shellPathFor(tab, subView, 'id-123'));
    assert.deepEqual(back, { tab, subView, detail: 'id-123' }, `${kind}: rundtur`);
    assert.match(SHELL_DETAILS[kind].list, /^[A-ZÆØÅ]/, `${kind}: listenavn til tilbakelenken`);
  }
  // Bare sidene med detaljadresse får id-en med. De andre beholder adressen de hadde.
  assert.equal(shellPathFor('okonomi', 'oversikt', 'inv-1001'), '/hjem/okonomi/oversikt');
  assert.equal(shellPathFor('iso', 'risiko', 'x'), '/hjem/iso/risiko');
  assert.equal(shellPathFor('iso', null, 'x'), '/hjem/iso');
  assert.equal(shellDetailKind('okonomi', 'oversikt'), null);
  assert.equal(parseShellPath('/hjem/prosjekt/prj-1/mer'), null);
});

test('detaljadresse: gamle adresser virker som før', () => {
  assert.deepEqual(parseShellPath('/hjem/prosjekt'), { tab: 'projects', subView: null });
  assert.deepEqual(parseShellPath('/hjem/ansatte/'), { tab: 'ansatte', subView: null });
  assert.deepEqual(parseShellPath('/hjem/okonomi/faktura'), { tab: 'okonomi', subView: 'faktura' });
  assert.deepEqual(parseShellPath('/hjem/iso/avvik'), { tab: 'iso', subView: 'avvik' });
  assert.equal(shellPathFor('iso', 'avvik'), '/hjem/iso/avvik');
  assert.equal(shellPathFor('projects'), '/hjem/prosjekt');
  assert.equal(shellPathFor('okonomi', 'faktura'), '/hjem/okonomi/faktura');
  assert.deepEqual(parseShellPath('/hjem/okonomi/indeks?indeksAvtale=a'), { tab: 'okonomi', subView: 'indeks' });
  assert.equal(parseShellPath('/anbud/tilbud/bid-1'), null, 'tilbudslenken tolkes fortsatt av linking.js');
});

test('detaljadresse: linking og innlogging tar med detaljen', () => {
  setHomeRouteKey('Home-abc');
  assert.deepEqual(shellLinkState('/hjem/prosjekt/prj-1').routes[0].params.openShell, { tab: 'projects', subView: null, detail: 'prj-1' });
  assert.deepEqual(shellLinkState('/hjem/iso/avvik/f_1').routes[0].params.openShell, { tab: 'iso', subView: 'avvik', detail: 'f_1' });
  assert.deepEqual(shellLinkState('/hjem/iso/avvik').routes[0].params.openShell, { tab: 'iso', subView: 'avvik' }, 'uten detalj: som før');
  rememberEntryShellPath('/hjem/okonomi/faktura/inv-1001');
  assert.equal(takeEntryShellPath(), '/hjem/okonomi/faktura/inv-1001', 'en delt fakturalenke åpnes etter innlogging');
  setShellLocation('/hjem/ansatte/emp-kari');
  assert.equal(homePathForLinking('/settings/profile'), '/hjem/ansatte/emp-kari');
});

test('detaljadresse: adressen og modulen holdes i takt', () => {
  let seen = { url: '', open: '' };
  const step = (urlId, openId) => {
    const out = detailSyncStep(seen, { urlId, openId });
    seen = out.seen;
    return out.action;
  };
  // Delt lenke: adressen har id-en før modulen har åpnet den.
  assert.deepEqual(step('prj-1', ''), { type: 'open', id: 'prj-1' });
  assert.equal(step('prj-1', ''), null, 'venter på data: ingen ny beskjed, og adressen nullstilles ikke');
  assert.equal(step('prj-1', 'prj-1'), null, 'åpnet');
  // Nettleserens Tilbake: adressen går til listen, modulen lukker detaljen.
  assert.deepEqual(step('', 'prj-1'), { type: 'close' });
  assert.equal(step('', ''), null);
  // Trykk i listen: modulen åpner, adressen følger.
  assert.deepEqual(step('', 'prj-2'), { type: 'report', id: 'prj-2' });
  assert.equal(step('prj-2', 'prj-2'), null, 'eget ekko gir ingen ny beskjed');
  // Forrige/Neste inne i detaljen.
  assert.deepEqual(step('prj-2', 'prj-3'), { type: 'report', id: 'prj-3' });
  assert.equal(step('prj-3', 'prj-3'), null);
  // «‹ Prosjekter»: modulen lukker, adressen følger.
  assert.deepEqual(step('prj-3', ''), { type: 'report', id: '' });
  assert.equal(step('', ''), null);
  // Fram i nettleseren til en annen detalj.
  assert.deepEqual(step('prj-9', ''), { type: 'open', id: 'prj-9' });
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
