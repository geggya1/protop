/**
 * Fraværsskjema, egenmelding og lønn – hele flyten i nettleseren mot emulatorene.
 *
 *  1. Bedrift → Fravær → Innstillinger → «Egenmelding og lønn»: lovpålagt dekning vises låst,
 *     alt annet er av som standard. Velg IA-ordning, drøftet, «Egen legetime» under Ikke lovpålagt, lagre.
 *     Sjekker dokumentet hr/sickLeave.
 *  2. Timeliste (telefon): fører «Annet fravær med lønn» → spørsmålet «Vil du registrere
 *     fraværet?» → «Senere» → «Mangler fraværsskjema» → fyller ut skjemaet som legetime hos
 *     spesialist for seg selv → dagen føres som «Legebesøk med lønn» med skjemaet koblet.
 *  3. Neste dag: legetime med barnet → «Er barnet sykt?» → «Ja, meld sykt barn» åpner
 *     egenmeldingen for sykt barn.
 *  4. HR → Sykefravær viser reglene og peker til innstillingene. Ansattkortet har
 *     «Barn og omsorgsdager».
 *
 * Bruker hjelpe-botens testbedrift (scripts/help-bot/seed.mjs). Skriver OK/AVVIK per steg og
 * avslutter med kode 1 ved avvik.
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/fravaersskjema.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { ROOT, createAuthUser, getDoc, listDocs, putDoc } from '../lib/emu.mjs';
import { BOT_COMPANY_ID, BOT_USER, toValue } from '../../help-bot/seed.mjs';

const OUT = join(ROOT, 'e2e-out', 'fravaersskjema');
mkdirSync(OUT, { recursive: true });
const results = [];
let failed = 0;

function log(ok, step, detail = '') {
  results.push({ ok, step, detail });
  if (!ok) failed += 1;
  console.log(`${ok ? 'OK   ' : 'AVVIK'} ${step}${detail ? ` – ${detail}` : ''}`);
}

const bots = [];
async function check(step, fn) {
  try {
    const detail = await fn();
    log(true, step, typeof detail === 'string' ? detail : '');
  } catch (err) {
    log(false, step, String(err?.message || err).slice(0, 400));
    // Skjermbilde av det som sto, og lukk åpne vinduer så neste steg starter rent.
    for (const b of bots) {
      await b.shot(`avvik-${step.split(' ')[0]}`).catch(() => {});
      for (let i = 0; i < 3; i += 1) await b.page.keyboard.press('Escape').catch(() => {});
    }
  }
}

function osloToday(offset = 0) {
  const d = new Date(Date.now() + offset * 86400000);
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Oslo' }).format(d);
}

/** Første arbeidsdag fra og med i dag (mandag–fredag). */
function workday(from = 0) {
  for (let i = from; i < from + 7; i += 1) {
    const iso = osloToday(i);
    const wd = new Date(`${iso}T12:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6) return { iso, offset: i };
  }
  return { iso: osloToday(from), offset: from };
}

async function absences() {
  const rows = await listDocs(`families/${BOT_COMPANY_ID}/absences`).catch(() => []);
  return (Array.isArray(rows) ? rows : []).filter((row) => row.employeeId === 'emp-bot');
}

async function expectText(bot, text, timeout = 10000) {
  if (!(await bot.hasText(text, { timeout }))) throw new Error(`Fant ikke «${text}»`);
}

async function expectNoText(bot, text) {
  await bot.page.waitForTimeout(800);
  const all = await bot.visibleText();
  if (all.includes(text)) throw new Error(`«${text}» står fortsatt på skjermen`);
}

async function clickId(bot, id, timeout = 10000) {
  const loc = bot.page.locator(`[id="${id}"]`).first();
  await loc.waitFor({ state: 'visible', timeout });
  await loc.click();
  await bot.page.waitForTimeout(600);
}

// Fraværskategoriene i timelisten: «Annet fravær med lønn» festet for boten.
await putDoc(`families/${BOT_COMPANY_ID}/employees/emp-bot/prefs/timesheet`, {
  absencePins: ['annet_med'],
  starred: {},
  hidden: {},
  updatedAt: new Date().toISOString(),
});

// ---------------------------------------------------------------- 1. Innstillinger (desktop)
const desk = await new Bot('eier-desktop', { ...BOT_USER, view: 'desktop', outDir: OUT }).start();
bots.push(desk);
await desk.login();
await desk.open('selskap', 'sykefravaer', 3500);
await desk.shot('innstillinger-for');

await check('1.1 Fanen «Egenmelding og lønn» åpnes fra Bedrift → Fravær → Innstillinger', async () => {
  await expectText(desk, 'Egenmelding og lønn');
  await expectText(desk, 'Lovens regler');
  await expectText(desk, 'IA-ordning');
});
await check('1.2 Lovpålagt dekning vises låst', async () => {
  await expectText(desk, 'Lovpålagt, alltid med lønn fra arbeidsgiver');
  await expectText(desk, 'Svangerskapskontroll (aml. § 12-1)');
  await expectText(desk, 'Ammefri inntil én time per dag');
});
await check('1.3 Alt som ikke er lovpålagt, er av som standard', async () => {
  const boxes = desk.page.getByRole('checkbox', { name: /^Dekkes:/ });
  const n = await boxes.count();
  if (n < 7) throw new Error(`Fant ${n} «Dekkes»-valg, ventet 7`);
  for (let i = 0; i < n; i += 1) {
    const on = await boxes.nth(i).getAttribute('aria-checked');
    if (on === 'true') throw new Error(`Valg ${i + 1} er på fra start`);
  }
  const doc = await getDoc(`families/${BOT_COMPANY_ID}/hr/sickLeave`);
  if (doc && Object.values(doc.paidLeave || {}).some(Boolean)) throw new Error('hr/sickLeave har dekning på fra før');
  return `${n} valg, alle av`;
});
await check('1.4 Velg IA-ordning, drøftet og egen legetime, lagre', async () => {
  await desk.click('IA-ordning');
  await desk.click('Drøftet med tillitsvalgte (ftrl § 8-24)');
  await desk.click('Egen lege-, tannlege- eller spesialisttime');
  await desk.click('Lagre');
  await expectText(desk, 'Reglene er lagret.');
  await desk.shot('innstillinger-lagret');
});
await check('1.5 hr/sickLeave er lagret riktig', async () => {
  const doc = await getDoc(`families/${BOT_COMPANY_ID}/hr/sickLeave`);
  if (!doc) throw new Error('Dokumentet finnes ikke');
  const want = { extendedSelfCert: true, extendedDays: 8, annualCapDays: 24, extendedDiscussed: true };
  for (const [k, v] of Object.entries(want)) if (doc[k] !== v) throw new Error(`${k} = ${JSON.stringify(doc[k])}, ventet ${v}`);
  if (doc.paidLeave?.lege !== true) throw new Error('paidLeave.lege er ikke på');
  const others = Object.entries(doc.paidLeave || {}).filter(([k, v]) => k !== 'lege' && v);
  if (others.length) throw new Error(`Andre valg ble slått på: ${others.map(([k]) => k).join(', ')}`);
});
await check('1.6 Etter ny innlasting står IA-ordning og «Gjelder nå: 8 kalenderdager»', async () => {
  await desk.page.reload({ waitUntil: 'domcontentloaded' });
  await desk.waitShell();
  await desk.open('selskap', 'sykefravaer', 3500);
  await expectText(desk, 'Gjelder nå: 8 kalenderdager om gangen, høyst 24 dager per 12 måneder.');
});
await check('1.7 HR → Sykefravær viser reglene og peker til innstillingene', async () => {
  await desk.open('hr', 'sykefravaer', 3500);
  if (!(await desk.hasText('Regler for egenmelding', { timeout: 6000 }))) {
    await desk.open('hr', null, 2500);
    await desk.click('Sykefravær', { timeout: 6000 }).catch(() => {});
  }
  await expectText(desk, 'IA-ordning: 8 kalenderdager om gangen, 24 per 12 måneder.');
  await expectText(desk, 'Settes under Bedrift → Fravær → Innstillinger → Egenmelding og lønn.');
  await expectText(desk, 'Bedriften dekker også: Egen lege-, tannlege- eller spesialisttime.');
  await desk.shot('hr-regler');
});
await check('1.8 Ansattkortet har «Barn og omsorgsdager»', async () => {
  await desk.open('ansatte', null, 3500);
  await desk.click('Ola Tømrer', { exact: false, timeout: 10000 });
  await desk.page.waitForTimeout(1500);
  await expectText(desk, 'Barn og omsorgsdager');
});
await check('1.9 Administrator registrerer to barn (ett med utvidet rett) og alene om omsorgen: 40 dager', async () => {
  await expectText(desk, 'Hvorfor vi spør');
  await clickId(desk, 'child-care-edit');
  await clickId(desk, 'child-care-add');
  await clickId(desk, 'child-care-add');
  await desk.page.getByLabel('Fødselsdato barn 1').fill('15.03.2018');
  await desk.page.getByLabel('Fornavn barn 1').fill('Ida');
  await desk.page.getByLabel('Fødselsdato barn 2').fill('02.09.2010');
  await desk.page.locator('[id="child-care-kid-1"]').getByText('Utvidet rett fra NAV', { exact: false }).click();
  await desk.click('Jeg er alene om omsorgen');
  await clickId(desk, 'child-care-save');
  await expectText(desk, 'Barna er lagret.');
  await expectText(desk, `Omsorgsdager ${new Date().getFullYear()}: 40 dager`);
  const priv = await getDoc(`families/${BOT_COMPANY_ID}/employeesPrivate/emp-ola`);
  const kids = priv?.childCare?.kids || [];
  if (kids.length !== 2 || kids[1].birthDate !== '2018-03-15' || kids[1].name !== 'Ida' || kids[0].chronic !== true) throw new Error(`skjermet: ${JSON.stringify(priv?.childCare)}`);
  const post = (await getDoc(`families/${BOT_COMPANY_ID}/employees/emp-ola`))?.extras?.childCare;
  if (JSON.stringify(post?.birthYears) !== '[2010,2018]' || post?.alone !== true) throw new Error(`på posten: ${JSON.stringify(post)}`);
  if (JSON.stringify(post).includes('Ida') || JSON.stringify(post).includes('2018-03-15')) throw new Error('navn eller dato står på ansattposten');
  await desk.shot('ansatt-barn');
});

// ---------------------------------------------------------------- 2. Timeliste (telefon): linjen «Fravær»
const d1 = workday(0);
const d2 = workday(d1.offset + 1);
const d3 = workday(d2.offset + 1);
const d4 = workday(d3.offset + 1);
// Et eldre fravær uten skjema (ført før veiviseren): skal gi «Mangler fraværsskjema».
await putDoc(`families/${BOT_COMPANY_ID}/absences/fra-legacy`, {
  id: 'fra-legacy', employeeId: 'emp-bot', employeeName: 'Hjelpe Bot', date: d4.iso, hours: 7.5, type: 'annet_med',
  status: 'registrert', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

const phone = await new Bot('eier-telefon', { ...BOT_USER, view: 'phone', outDir: OUT }).start();
bots.push(phone);
await phone.login();
await phone.open('timeliste', null, 4000);
async function goToDay(target, from) {
  for (let i = from; i < target; i += 1) {
    await phone.page.getByRole('button', { name: 'Neste dag' }).first().click();
    await phone.page.waitForTimeout(500);
  }
}
await goToDay(d1.offset, 0);
await phone.shot('timeliste');

async function waitAbsence(pred, label, timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const row = (await absences()).find(pred);
    if (row) return row;
    await phone.page.waitForTimeout(800);
  }
  throw new Error(`${label}: ikke i skyen`);
}

await check('2.1 Linjen «Fravær» står nederst og åpner «Registrer fravær»', async () => {
  await expectText(phone, 'Trykk for å registrere fravær');
  await clickId(phone, 'timesheet-absence', 20000);
  await expectText(phone, 'Registrer fravær');
  await expectText(phone, 'Hva gjelder fraværet?');
  for (const id of ['sykdom', 'fri', 'permisjoner', 'kurs_annet']) {
    if (!(await phone.page.locator(`[id="fravaer-tema-${id}"]`).count())) throw new Error(`mangler temaet ${id}`);
  }
  if (await phone.page.locator('[id^="fravaer-valg-"]').count()) throw new Error('undervalgene skal komme på neste side');
  await phone.shot('valg');
});
await check('2.2 Lege: felt, lønn etter avtale og timer per dag', async () => {
  await clickId(phone, 'fravaer-tema-sykdom');
  await clickId(phone, 'fravaer-valg-lege');
  await expectText(phone, 'Ingen lovfestet rett etter aml.');
  await phone.click('Meg selv');
  await phone.click('Spesialisthelsetjenesten / sykehus');
  await phone.page.locator('[id="fravaersskjema-timer"]').first().fill('2:00');
  await expectText(phone, 'Føres som: Legebesøk med lønn');
  await phone.shot('skjema-lege');
});
await check('2.3 Sende uten bekreftelse gir feil', async () => {
  await clickId(phone, 'fravaersskjema-send');
  await expectText(phone, 'Bekreft at opplysningene er riktige.');
});
await check('2.4 Send: legetime 2:00 med skjema i skyen', async () => {
  await phone.click('Jeg bekrefter at opplysningene er riktige, og at dokumentasjon kan kreves.');
  await clickId(phone, 'fravaersskjema-send');
  await expectText(phone, 'Fraværsskjema sendt til leder.');
  const row = await waitAbsence((r) => r.date === d1.iso && r.formId, 'legetimen');
  if (row.type !== 'lege_med' || row.hours !== 2) throw new Error(`${row.type} ${row.hours}`);
  if (row.formDetails?.provider !== 'spesialist' || row.formDetails?.whoFor !== 'selv') throw new Error(JSON.stringify(row.formDetails));
  return `${row.date} ${row.type} ${row.hours}`;
});
await check('2.5 Linjen viser dagens fravær, og trykk viser det først', async () => {
  await expectText(phone, 'Legebesøk med lønn');
  await clickId(phone, 'timesheet-absence');
  await expectText(phone, 'Registrer nytt fravær');
  if (!(await phone.page.locator('[id^="fravaer-rad-"]').count())) throw new Error('fraværet på dagen vises ikke');
  await phone.shot('dagen');
});
await check('2.6 Nytt fravær samme dag: velferd (flytting) via «Permisjon og velferd»', async () => {
  await clickId(phone, 'fravaer-nytt');
  await clickId(phone, 'fravaer-tema-permisjoner');
  await clickId(phone, 'fravaer-valg-permisjon');
  await clickId(phone, 'fravaer-undervalg-velferd');
  await expectText(phone, 'Anledning');
  await phone.shot('velferd');
  if (!(await phone.hasText('Flytting', { timeout: 1500 }))) {
    await phone.page.getByRole('button', { name: /Anledning/ }).first().click();
    await phone.page.waitForTimeout(600);
  }
  await phone.click('Flytting', { timeout: 10000 });
  await phone.page.locator('[id="fravaersskjema-timer"]').first().fill('4:00');
  await expectText(phone, 'Føres som: Annet fravær uten lønn');
  await phone.click('Jeg bekrefter at opplysningene er riktige, og at dokumentasjon kan kreves.');
  await clickId(phone, 'fravaersskjema-send');
  const row = await waitAbsence((r) => r.date === d1.iso && r.formCategory === 'velferd', 'velferden');
  if (row.type !== 'annet_uten' || row.hours !== 4) throw new Error(`${row.type} ${row.hours}`);
});
await check('2.7 Ferie neste arbeidsdag: lagres uten skjema, hel dag', async () => {
  await goToDay(d2.offset, d1.offset);
  await clickId(phone, 'timesheet-absence');
  await clickId(phone, 'fravaer-tema-fri');
  await clickId(phone, 'fravaer-valg-ferie');
  await expectText(phone, 'Føres som: Ferie');
  await clickId(phone, 'fravaersskjema-send');
  const row = await waitAbsence((r) => r.date === d2.iso && r.type === 'ferie', 'ferien');
  if (row.formId) throw new Error('ferie skal ikke ha skjema');
  return `${row.date} ${row.hours} t`;
});
await check('2.8 Sykt barn går til egenmeldingen', async () => {
  await goToDay(d3.offset, d2.offset);
  await clickId(phone, 'timesheet-absence');
  await clickId(phone, 'fravaer-tema-sykdom');
  await clickId(phone, 'fravaer-valg-sykt_barn');
  await expectText(phone, 'Meld sykefravær');
  await expectText(phone, 'Omsorgsdager');
  await phone.shot('sykt-barn');
  await phone.click('Avbryt');
  await phone.page.waitForTimeout(600);
});
await check('2.9 Eldre fravær uten skjema: «Mangler fraværsskjema» → skjema, typen byttes', async () => {
  await expectText(phone, 'Mangler fraværsskjema');
  await clickId(phone, 'husk-fravaersskjema');
  await expectText(phone, 'Dagene står som Annet fravær med lønn');
  await clickId(phone, 'fravaer-tema-sykdom');
  await clickId(phone, 'fravaer-valg-lege');
  await phone.click('Meg selv');
  await phone.click('Tannlege');
  await expectText(phone, 'Føres som: Legebesøk med lønn');
  await phone.click('Jeg bekrefter at opplysningene er riktige, og at dokumentasjon kan kreves.');
  await clickId(phone, 'fravaersskjema-send');
  const row = await waitAbsence((r) => r.id === 'fra-legacy' && r.formId, 'det eldre fraværet');
  if (row.type !== 'lege_med' || row.hours !== 7.5) throw new Error(`${row.type} ${row.hours}`);
  const same = (await absences()).filter((r) => r.date === d4.iso);
  if (same.length !== 1) throw new Error(`${same.length} rader på dagen`);
  await expectNoText(phone, 'Mangler fraværsskjema');
});

// ---------------------------------------------------------------- 3. Timeliste på PC
await check('3.1 PC: «Fravær» nederst i rutenettet, knappene synlige over tabellen, uten «Åpne prosjekt»', async () => {
  await desk.open('timeliste', null, 4000);
  await desk.page.locator('[id="timesheet-absence-row-fravaer"]').first().waitFor({ state: 'visible', timeout: 20000 });
  await expectText(desk, 'Legg til prosjekt');
  if (await desk.page.locator('[id="registrer-fravaer"]').count()) throw new Error('knappen «Registrer fravær» står fortsatt');
  const all = await desk.visibleText();
  if (all.includes('Åpne prosjekt')) throw new Error('«Åpne prosjekt» står fortsatt');
  const pos = await desk.page.evaluate(() => {
    const row = document.querySelector('[id="timesheet-absence-row-fravaer"]');
    const rows = [...document.querySelectorAll('[id="timesheet-grid"] [role=button]')];
    const add = document.querySelector('[id="timesheet-add-project"]');
    const grid = document.querySelector('[id="timesheet-grid"]');
    const a = add?.getBoundingClientRect();
    const g = grid?.getBoundingClientRect();
    return {
      visible: !!(a && a.width > 60 && a.right <= window.innerWidth && a.left >= 0),
      above: !!(a && g && a.bottom <= g.top + 2),
      size: a ? `${Math.round(a.width)}×${Math.round(a.height)}` : '',
      cells: rows.length,
    };
  });
  if (!pos.visible || !pos.above) throw new Error(`«Legg til prosjekt» ${pos.size}: synlig=${pos.visible} over=${pos.above}`);
  await desk.page.locator('[id="timesheet-absence-row-fravaer"] > [role=button]').nth(Number(d1.iso.slice(8, 10)) - 1).click();
  // PC-økten har ikke lastet fraværet telefonen førte: da går den rett til valgene.
  if (!(await desk.hasText('Registrer nytt fravær', { timeout: 3000 }))) await expectText(desk, 'Hva gjelder fraværet?');
  await desk.shot('pc-timeliste');
});

// ---------------------------------------------------------------- 5. Den ansatte registrerer egne barn
const EVA = { email: `eva-${Date.now().toString(36)}@protop.test`, password: 'Eva-Barn-2026!', name: 'Eva Egen' };
const evaUid = await createAuthUser({ email: EVA.email, password: EVA.password, name: EVA.name });
{
  const stamp = new Date().toISOString();
  const consents = { version: '2.0.0', termsAt: stamp, privacyAt: stamp, gdprAt: stamp, dataAt: stamp, copyrightAt: stamp, language: 'nb', marketingOptIn: false };
  await putDoc(`users/${evaUid}`, {
    uid: evaUid, email: EVA.email, name: EVA.name, displayName: EVA.name, profileComplete: true, homeSetupComplete: true, consents, language: 'nb',
    familyId: BOT_COMPANY_ID, familyIds: [BOT_COMPANY_ID], activeFamilyId: BOT_COMPANY_ID,
  });
  await putDoc(`parents/${evaUid}`, { uid: evaUid, name: EVA.name, email: EVA.email, familyId: BOT_COMPANY_ID, familyIds: [BOT_COMPANY_ID], admin: false });
  await putDoc(`families/${BOT_COMPANY_ID}/parents/${evaUid}`, { uid: evaUid, name: EVA.name, email: EVA.email, admin: false, active: true, role: 'member' });
  const fam = await getDoc(`families/${BOT_COMPANY_ID}`);
  const members = [...new Set([...(fam?.members || []), evaUid])];
  const res = await fetch(`http://127.0.0.1:8085/v1/projects/protop-c189c/databases/(default)/documents/families/${BOT_COMPANY_ID}?updateMask.fieldPaths=members`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer owner' },
    body: JSON.stringify({ fields: { members: toValue(members) } }),
  });
  if (!res.ok) throw new Error(`members: ${res.status}`);
  await putDoc(`families/${BOT_COMPANY_ID}/employees/emp-eva`, {
    id: 'emp-eva', version: 1, createdAt: stamp, updatedAt: stamp, personUid: evaUid,
    person: { firstName: 'Eva', lastName: 'Egen', email: EVA.email, language: 'Norsk bokmål' },
    company: { personnelKind: 'staff', status: 'active', external: false, canLogin: true, workPercent: '100', email: EVA.email, title: 'Tømrer', accessLevel: 'ansatt' },
  });
}
const eva = await new Bot('eva-telefon', { ...EVA, view: 'phone', outDir: OUT }).start();
bots.push(eva);
await eva.login();
await check('5.1 Den ansatte ser «Barn og omsorgsdager» med begrunnelse på sitt eget ansattkort', async () => {
  await eva.open('ansatte', null, 4000);
  if (!(await eva.hasText('Hvorfor vi spør', { timeout: 4000 }))) {
    await eva.click('Eva Egen', { exact: false, timeout: 10000 });
    await eva.page.waitForTimeout(1500);
  }
  await expectText(eva, 'Barn og omsorgsdager');
  await expectText(eva, 'Hvorfor vi spør');
  await expectText(eva, 'Registrer barna dine');
  await eva.shot('eva-barn-for');
});
await check('5.2 Den ansatte registrerer barnet selv: 10 omsorgsdager, lagret skjermet', async () => {
  await clickId(eva, 'child-care-edit');
  await clickId(eva, 'child-care-add');
  await eva.page.getByLabel('Fødselsdato barn 1').fill('01.06.2020');
  await clickId(eva, 'child-care-save');
  await expectText(eva, 'Barna er lagret.');
  await expectText(eva, `Omsorgsdager ${new Date().getFullYear()}: 10 dager`);
  const priv = await getDoc(`families/${BOT_COMPANY_ID}/employeesPrivate/emp-eva`);
  if (priv?.childCare?.kids?.[0]?.birthDate !== '2020-06-01' || priv?.childCare?.updatedBy !== evaUid) throw new Error(JSON.stringify(priv?.childCare));
  const post = (await getDoc(`families/${BOT_COMPANY_ID}/employees/emp-eva`))?.extras?.childCare;
  if (JSON.stringify(post?.birthYears) !== '[2020]') throw new Error(JSON.stringify(post));
  await eva.shot('eva-barn-lagret');
});
await check('5.3 Sykt barn: egenmeldingen viser omsorgsdagene fra barna hun registrerte', async () => {
  await eva.open('timeliste', null, 4000);
  await clickId(eva, 'timesheet-absence', 20000);
  if (await eva.hasText('Registrer nytt fravær', { timeout: 1500 })) await clickId(eva, 'fravaer-nytt');
  await clickId(eva, 'fravaer-tema-sykdom');
  await clickId(eva, 'fravaer-valg-sykt_barn');
  await expectText(eva, 'av 10 dager brukt');
  await eva.click('Avbryt');
});

// Emulatoren laster bare konsernfunksjonene: CORS-feil fra andre funksjoner ved innlogging er miljøstøy.
const errors = [...desk.errors, ...phone.errors, ...eva.errors].filter((e) => !/blocked by CORS policy|net::ERR_FAILED/.test(e.message));
const calls = [...desk.failedCalls, ...phone.failedCalls, ...eva.failedCalls];
log(!errors.length, '4.1 Ingen JS-feil', errors.map((e) => `${e.at}: ${e.message}`).join(' | ').slice(0, 600));
log(!calls.length, '4.2 Ingen funksjonskall feilet', calls.map((c) => `${c.at}: ${c.url} ${c.status}`).join(' | ').slice(0, 600));

writeFileSync(join(OUT, 'result.json'), JSON.stringify({ failed, results, errors, calls }, null, 2));
await desk.stop();
await phone.stop();
await eva.stop();
await closeBrowser();
console.log(failed ? `\n${failed} avvik` : '\nAlle steg OK');
process.exit(failed ? 1 : 0);
