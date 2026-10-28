/**
 * Team A – kanttilfeller rundt invitasjon og medlemskap i bedriften.
 * Eget selskap og egne brukere per kjøring (prefiks a-<tid>-k…@protop.test).
 *
 *  K1  /register-invited uten parametre (FL-21)
 *  K2  Utløpt/ugyldig bekreftelseslenke viser feil (FL-14)
 *  K3  Bekreftelseslenke åpnet i en annen nettleser (ikke innlogget)
 *  K4  Innlogget bruker med ferdig profil, men uten arbeidsområde: evig «Laster ProTop…»
 *  K5  Invitasjon til e-post med store bokstaver (ny og eksisterende bruker)
 *  K6  Invitasjon til en som allerede er medlem + skjemaet tømmes ved feil (FL-24)
 *  K7  «Send på nytt» til en som allerede har godtatt (FL-06) → låst vindu (FL-05)
 *  K8  Trekke tilbake invitasjon / slettet medarbeider godtar likevel (FL-10)
 *  K9  Invitasjonsvindu når bedriften er slettet (FL-05)
 *  K10 «Be om å bli med» via orgnr (FL-15)
 *  K11 Godtatt mens raden står «queued» (FL-11, e-postfeil simulert i data)
 *  K12 Kolliderende plassholder-id (FL-23)
 *
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/ansatt-kant.mjs [--only=K5,K6]
 */
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { Bot, BASE, closeBrowser } from '../lib/bot.mjs';
import {
  authUserByEmail, callFn, createAuthUser, getDoc, idToken, linksIn, listDocs, mailsTo, putDoc, waitFor,
} from '../lib/emu.mjs';
import {
  OUT_ROOT, Steps, addInvitePerson, memGate, createCompanyUI, loginAndSettle, loginUI, openInvitePanel, rget, rpatch,
  sendQueued, skipTour, tap, tsId, waitShell, waitText,
} from './ansatt-lib.mjs';

const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = (k) => !ONLY.length || ONLY.includes(k);
const S = new Steps('ansatt-kant');
const ID = tsId();
const PW = 'Bygg-2026!test';
const OUT = join(OUT_ROOT, `kant-${ID}`);
const mail = (k) => `a-${ID}-k${k}@protop.test`;
const st = { id: ID, eier: { email: mail('eier'), name: 'Kåre Kanteier' } };
console.log(`Kjøring kant-${ID}`);

const bots = {};
async function bot(key, view, email = '') {
  if (bots[key]) return bots[key];
  bots[key] = await new Bot(key, { email: email || st[key]?.email, password: PW, view, outDir: OUT, consents: false }).start();
  return bots[key];
}
async function closeBot(key) {
  if (!bots[key]) return;
  await bots[key].stop();
  delete bots[key];
}
const company = () => getDoc(`families/${st.companyId}`);
const employees = () => listDocs(`families/${st.companyId}/employees`);
async function employeeByEmail(email) {
  const e = String(email).toLowerCase();
  return (await employees()).find((r) => [r.person?.email, r.company?.email, r.invite?.email].map((x) => String(x || '').toLowerCase()).includes(e)) || null;
}
/** Konto som bare brukes via API (ingen nettleser): Auth + profildokumentene ProfileSetup skriver. */
async function apiUser(key, name, { email = mail(key), profile = true } = {}) {
  const uid = await createAuthUser({ email, password: PW, name });
  if (profile) {
    const u = `${key}${ID}`.toLowerCase().replace(/[^a-z0-9]/g, '');
    await putDoc(`users/${uid}`, { uid, role: 'adult', displayName: name, email: email.toLowerCase(), username: u, usernameLower: u, language: 'nb', profileComplete: true });
    await putDoc(`parents/${uid}`, { uid, name, email: email.toLowerCase(), username: u, usernameLower: u, active: true });
  }
  st[key] = { email, name, uid };
  return uid;
}
const call = async (name, data, email) => {
  const r = await callFn(name, data, await idToken(email, PW));
  return r.result || r.error || r;
};

/* ───────── Oppsett: eier og bedrift (UI) ───────── */
async function setupOwner() {
  st.eier.uid = await createAuthUser({ email: st.eier.email, password: PW, name: st.eier.name });
  if (bots.eier) await closeBot('eier');
  const b = await bot('eier', 'desktop');
  await loginAndSettle(b, { name: st.eier.name });
  await waitShell(b);
  st.company = `Kant Bygg ${ID} AS`;
  await createCompanyUI(b, st.company);
  for (const fid of (await getDoc(`users/${st.eier.uid}`))?.familyIds || []) {
    const f = await getDoc(`families/${fid}`);
    if (f?.type === 'organization' && f?.name === st.company) st.companyId = fid;
  }
  if (!st.companyId) throw new Error('Fikk ikke opprettet bedriften');
  console.log(`Bedrift ${st.company} (${st.companyId})`);
  return b;
}

/** Evas nettleser. Har siden krasjet (lite minne på maskinen), startes en ny økt. */
async function owner() {
  const b = bots.eier;
  if (b && !b.page.isClosed() && await b.page.evaluate(() => 1).catch(() => 0)) return b;
  if (b) { await b.stop().catch(() => {}); delete bots.eier; }
  const nb = await bot('eier', 'desktop');
  await loginUI(nb);
  await waitShell(nb);
  // Sørg for at bedrift A er valgt.
  const fam = await getDoc(`families/${st.companyId}`);
  if (fam && !(await nb.visibleText()).includes(st.company)) {
    await nb.page.locator('[id="platform-switch-bedrift"]').click().catch(() => {});
    await nb.page.waitForTimeout(1200);
    await nb.page.getByText(st.company, { exact: false }).last().click().catch(() => {});
    await nb.page.waitForTimeout(3000);
  }
  return nb;
}

/** Kjører ett kanttilfelle. Krasjer en nettleser, prøves det én gang til med ny økt. */
async function runTest(name, fn) {
  for (let i = 0; i < 2; i += 1) {
    await memGate();
    try {
      await fn();
      return;
    } catch (err) {
      const crash = /crash|Target closed|has been closed/i.test(String(err?.message || err));
      for (const [k, x] of Object.entries(bots)) await x.shot(`stopp-${name}-${k}`).catch(() => {});
      if (crash && i === 0) {
        S.info(`${name}: nettleseren krasjet`, 'Prøver kanttilfellet på nytt med ny økt');
        for (const k of Object.keys(bots)) if (k !== 'eier') await closeBot(k);
        continue;
      }
      S.record({ step: `${name} stoppet`, expected: 'Kanttilfellet kjører ferdig', actual: String(err?.stack || err).slice(0, 400), ok: false, kind: 'bot' });
      console.error(err);
      return;
    }
  }
}

/* ───────── K1–K4: sider uten innlogging og oppstart ───────── */
async function k1() {
  const g = await bot('gjest', 'phone', 'ingen@protop.test');
  const errsBefore = g.errors.length;
  await g.goto('/register-invited');
  await g.page.waitForTimeout(8000);
  const t = await g.visibleText();
  const errs = g.errors.slice(errsBefore).map((e) => e.message).join(' | ');
  const ok = /Opprett konto|Registrer|Logg inn/.test(t) && !/TypeError|Cannot (read|destructure)/.test(errs);
  S.check(ok, 'K1 /register-invited uten parametre gir en brukbar side', 'Registrering eller innlogging, ingen krasj', `${t.trim().slice(0, 120).replace(/\n+/g, ' | ') || '(tom side)'}${errs ? ` · JS: ${errs.slice(0, 200)}` : ''}`, { id: 'ANSATT-20', sev: 'Lav', ref: 'FL-21', shot: await g.shot('k1-register-invited') });
}

async function k2() {
  const g = await bot('gjest', 'phone', 'ingen@protop.test');
  await g.goto(`/verify-email?vt=${'0'.repeat(64)}`);
  await g.page.waitForTimeout(9000);
  const t = await g.visibleText();
  const shown = /ugyldig|utløpt|feil|Kunne ikke|finnes ikke/i.test(t);
  S.check(shown, 'K2 Ugyldig bekreftelseslenke viser en feilmelding', 'Melding om ugyldig/utløpt lenke', t.trim().split('\n').filter(Boolean).slice(0, 4).join(' | '), { id: 'ANSATT-21', sev: 'Middels', ref: 'FL-14', shot: await g.shot('k2-ugyldig-lenke') });
}

async function k3() {
  const email = mail('verify');
  const uid = await createAuthUser({ email, password: PW, name: 'Vera Verifiser', verified: false });
  const r = await call('sendEmailVerificationV2', { email, continueUrl: `${BASE}/verify-email` }, email);
  const m = await waitFor(() => mailsTo(email).find((x) => /Bekreft/.test(x.subject)), { timeout: 20000 }).catch(() => null);
  const link = m ? linksIn(m).find((l) => /vt=/.test(l)) : null;
  if (!link) {
    S.check(false, 'K3 Bekreftelsesmail for test', 'E-post', JSON.stringify(r).slice(0, 200));
    return;
  }
  const g = await bot('annen', 'phone', email);
  await g.page.goto(link, { waitUntil: 'domcontentloaded' });
  const seen = [];
  for (const ms of [2500, 4000, 6000]) {
    await g.page.waitForTimeout(ms);
    seen.push((await g.visibleText()).trim().split('\n').filter(Boolean).slice(0, 2).join(' / '));
  }
  const verified = (await authUserByEmail(email))?.emailVerified === true;
  const final = await g.visibleText();
  const confirmed = /E-post bekreftet|bekreftet/i.test(final) || /Logg inn/.test(final);
  S.check(verified && confirmed && !/Send på nytt/.test(final), 'K3 Lenken åpnet i en annen nettleser sier at e-posten er bekreftet', '«E-post bekreftet» (eller innlogging), ikke «Bekreft e-posten din / Send på nytt»', `Auth emailVerified=${verified}. Skjermen: ${seen.join(' → ')}`, { id: 'ANSATT-07', sev: 'Middels', ref: 'FL-14', shot: await g.shot('k3-lenke-annen-nettleser') });
  // Samme nettleser: logger inn (krysser av samtykket) og fullfører profilsteget.
  await loginAndSettle(g, { name: 'Vera Verifiser' });
  await g.page.waitForTimeout(3000);
  const c = (await getDoc(`users/${uid}`))?.consents || {};
  S.check(!!(c.termsAt && c.privacyAt), 'K3b Samtykket som krysses av ved innlogging lagres med tidspunkt', 'users/{uid}.consents.termsAt/privacyAt satt', `termsAt=${c.termsAt}, privacyAt=${c.privacyAt}, versjon=${c.version}`, { id: 'ANSATT-03', sev: 'Middels', shot: await g.shot('k3-samtykke') });
  await closeBot('annen');
}

async function k4() {
  const email = mail('tom');
  await apiUser('tom', 'Tom Tomrom', { email });
  const g = await bot('tom', 'phone', email);
  await loginUI(g, { wait: 2000 });
  let stuck = true;
  for (let i = 0; i < 9; i += 1) {
    await g.page.waitForTimeout(5000);
    if (!/Laster ProTop/.test(await g.visibleText())) { stuck = false; break; }
  }
  const u = await getDoc(`users/${st.tom.uid}`);
  S.check(!stuck, 'K4 Bruker med ferdig profil uten arbeidsområde kommer inn', 'Hjem innen 45 s', stuck ? `Står på «Laster ProTop…» i 45 s, selv om arbeidsområdet ${u?.familyIds?.[0] || '?'} er opprettet. Laster inn på nytt hjelper.` : 'Kom inn', { id: 'ANSATT-08', sev: 'Middels', shot: await g.shot('k4-laster') });
  await closeBot('tom');
}

/* ───────── K5: store bokstaver ───────── */
async function k5(b) {
  // Ny bruker invitert med store bokstaver.
  const upper = `A-${ID}-KARI.Stor@PROTOP.test`;
  await openInvitePanel(b);
  await addInvitePerson(b, { first: 'Kari', last: 'Stor', email: upper, level: 'Ansatt' });
  // Eksisterende bruker invitert med store bokstaver i e-posten.
  await apiUser('liv', 'Liv Liten');
  const livUpper = st.liv.email.toUpperCase();
  await addInvitePerson(b, { first: 'Liv', last: 'Liten', email: livUpper, level: 'Ansatt' });
  const sent = await sendQueued(b);
  S.info('K5a Inviter (store bokstaver)', (sent.match(/[^\n]*(sendt|Kunne ikke|allerede)[^\n]*/i) || ['?'])[0], await b.shot('k5-store-bokstaver'));
  const kari = await employeeByEmail(upper);
  const fam = await company();
  const lower = upper.toLowerCase();
  S.check(kari?.invite?.email === lower && (fam.invitedEmails || []).includes(lower) && mailsTo(lower).some((m) => /Invitasjon/.test(m.subject)),
    'K5b E-post med store bokstaver lagres og sendes med små', `invite.email, invitedEmails og mottaker = ${lower}`, `invite.email=${kari?.invite?.email}, invitedEmails har lower=${(fam.invitedEmails || []).includes(lower)}, mail=${mailsTo(lower).length}`);
  // Kari registrerer seg med store bokstaver og bekrefter.
  const kariUid = await createAuthUser({ email: upper, password: PW, name: 'Kari Stor' });
  const sync = await call('syncMyInvites', {}, upper);
  S.check((sync.invites || []).some((i) => i.familyId === st.companyId), 'K5c Ny bruker registrert med store bokstaver finner invitasjonen', 'syncMyInvites gir bedriften', JSON.stringify(sync).slice(0, 200));
  void kariUid;
  const liv = await employeeByEmail(st.liv.email);
  S.check(liv?.invite?.parentKey === st.liv.uid, 'K5d Eksisterende bruker invitert med store bokstaver gjenkjennes som eksisterende', `parentKey = Livs uid (eksisterende-flyt)`, `parentKey=${liv?.invite?.parentKey}, status=${liv?.invite?.status}`);
  const inbox = await listDocs(`users/${st.liv.uid}/familyInvites`);
  S.check(inbox.some((x) => x.familyId === st.companyId && x.status === 'pending'), 'K5e Liv får invitasjonen i innboksen', 'users/{uid}/familyInvites pending', `${inbox.length} invitasjon(er)`);
}

/* ───────── K6 + K7: allerede medlem, FL-24 og FL-06 ───────── */
async function k6k7(b) {
  // Mia har konto og godtar en invitasjon i appen.
  st.mia = { email: mail('mia'), name: 'Mia Medlem' };
  st.mia.uid = await createAuthUser({ email: st.mia.email, password: PW, name: st.mia.name });
  let m = await bot('mia', 'phone');
  await loginAndSettle(m, { name: st.mia.name });
  await closeBot('mia');
  await openInvitePanel(b);
  await addInvitePerson(b, { first: 'Mia', last: 'Medlem', email: st.mia.email, level: 'Ansatt' });
  await sendQueued(b);
  m = await bot('mia', 'phone');
  await loginUI(m);
  const ov = await waitText(m, /Bedriftsinvitasjon/i, 40000);
  if (ov) {
    await m.page.getByText('Godta invitasjon', { exact: true }).last().click();
    await m.page.waitForTimeout(6000);
  }
  const inA = ((await company()).members || []).includes(st.mia.uid);
  S.check(inA, 'K6a Mia godtar og er medlem', 'members har Mia', String(inA), { shot: await m.shot('k6-mia-inne') });

  // K6: Eva inviterer Mia igjen.
  await openInvitePanel(b);
  const panelAfter = await addInvitePerson(b, { first: 'Mia', last: 'Medlem', email: st.mia.email, level: 'Ansatt' });
  const msg = (panelAfter.match(/Personen er allerede[^\n]*|allerede inne i bedriften[^\n]*|allerede knyttet[^\n]*/) || [''])[0];
  S.check(!!msg, 'K6b Invitasjon til en som allerede er medlem stoppes med melding', '«Personen er allerede inne i bedriften.»', msg || 'Ingen melding', { shot: await b.shot('k6-allerede-medlem') });
  const first = await b.page.locator('[id="employee-invite-first"]').inputValue().catch(() => '');
  const em = await b.page.locator('[id="employee-invite-email"]').inputValue().catch(() => '');
  S.check(!!first && !!em, 'K6c Skjemaet beholder det som ble skrevet når det feiler', 'Feltene står igjen ved feil', `Fornavn=«${first}», E-post=«${em}»`, { id: 'ANSATT-22', sev: 'Lav', ref: 'FL-24' });

  // K7: duplikatrad med samme e-post (som etter en import) står som «sendt».
  const miaRow = await employeeByEmail(st.mia.email);
  const dupId = `emp_dup_${ID}`;
  const evaTok = await idToken(st.eier.email, PW);
  const dupDoc = {
    id: dupId,
    createdAt: new Date().toISOString(),
    person: { firstName: 'Mia', lastName: 'Medlem (import)', email: st.mia.email },
    company: { status: 'active', personnelKind: 'staff', canLogin: false, email: st.mia.email, accessLevel: 'ansatt', accessRole: 'Ansatt' },
    invite: { status: 'sent', email: st.mia.email, accessLevel: 'ansatt', parentKey: st.mia.uid, sentAt: new Date().toISOString(), queuedAt: '', acceptedAt: '', acceptedUid: '', declinedAt: '', error: '' },
    personUid: '',
  };
  const w = await rpatch(`families/${st.companyId}/employees/${dupId}`, evaTok, dupDoc, { create: true });
  S.info('K7a Forutsetning: duplikatrad for Mia med status «sendt» (som etter import, skrevet med Evas token)', `PATCH → ${w.status}; ekte rad ${miaRow?.id} er godtatt`);
  await openInvitePanel(b);
  await waitText(b, /Sendt, venter på svar/, 15000);
  const resendBtns = b.page.getByText('Send på nytt', { exact: true });
  const cnt = await resendBtns.count();
  if (cnt) {
    await resendBtns.last().click();
    await waitText(b, /Invitasjonen er sendt|Kunne ikke|allerede/, 30000);
  }
  await b.page.waitForTimeout(2000);
  const after = await b.visibleText();
  const par = await getDoc(`families/${st.companyId}/parents/${st.mia.uid}`);
  const inbox = await listDocs(`users/${st.mia.uid}/familyInvites`);
  const reopened = inbox.filter((x) => x.familyId === st.companyId && x.status === 'pending');
  S.check(par?.placeholder !== true && par?.active !== false && !reopened.length, 'K7b «Send på nytt» til en som allerede er med endrer ikke medlemskapet', 'Avvist med «allerede med», medlemsdokumentet uendret',
    `Melding: «${(after.match(/Invitasjonen er sendt\.?|Personen er allerede[^\n]*|Kunne ikke[^\n]*/) || [''])[0]}». parents/${'{uid}'}: placeholder=${par?.placeholder}, active=${par?.active}, inviteStatus=${par?.inviteStatus}. Gjenåpnede invitasjoner i innboksen: ${reopened.length}`,
    { id: 'ANSATT-23', sev: 'Høy', ref: 'FL-06', shot: await b.shot('k7-send-pa-nytt') });
  // Hva ser Mia nå?
  await closeBot('mia');
  m = await bot('mia', 'phone');
  await loginUI(m);
  const lock = await waitText(m, /Bedriftsinvitasjon/i, 30000);
  if (lock) {
    await m.page.getByText('Godta invitasjon', { exact: true }).last().click();
    await m.page.waitForTimeout(5000);
    const t1 = await m.visibleText();
    await m.page.keyboard.press('Escape').catch(() => {});
    await m.page.waitForTimeout(1000);
    const still = /Bedriftsinvitasjon/i.test(await m.visibleText());
    S.check(!still, 'K7c Mia blir ikke låst av en invitasjon som allerede er besvart', 'Ingen vindu, eller vinduet kan lukkes', `Vinduet står etter Godta: «${(t1.match(/Invitasjonen er allerede besvart\.?|[^\n]*besvart[^\n]*|Kunne ikke[^\n]*/) || ['ingen melding'])[0]}», Escape lukker ikke`, { id: 'ANSATT-24', sev: 'Høy', ref: 'FL-05 / FL-06', shot: await m.shot('k7-mia-last') });
  } else {
    S.check(true, 'K7c Mia blir ikke låst av en invitasjon som allerede er besvart', 'Ingen vindu', 'Ingen vindu', { shot: await m.shot('k7-mia') });
  }
  const tok = await idToken(st.mia.email, PW);
  const rr = await rget(`families/${st.companyId}/employees`, tok);
  S.info('K7d Mias tilgang i reglene etter «Send på nytt»', `GET employees (samling) → ${rr.status}; members har Mia=${((await company()).members || []).includes(st.mia.uid)}`);
  await closeBot('mia');
}

/* ───────── K8: trekke tilbake (FL-10) ───────── */
async function k8(b) {
  const email = mail('feil');
  await openInvitePanel(b);
  await addInvitePerson(b, { first: 'Feil', last: 'Person', email, level: 'Ansatt' });
  await sendQueued(b);
  await b.page.waitForTimeout(1500);
  const panel = await b.visibleText();
  const sentCard = panel.slice(panel.indexOf('Sendt, venter på svar'));
  const hasWithdraw = /Trekk tilbake|Avbryt invitasjon|Slett invitasjon/i.test(sentCard.slice(0, 1500));
  S.check(hasWithdraw, 'K8a Sendt invitasjon kan trekkes tilbake', 'Knapp «Trekk tilbake» på sendte invitasjoner', hasWithdraw ? 'Finnes' : 'Bare «Send på nytt»', { id: 'ANSATT-25', sev: 'Høy', ref: 'FL-10', shot: await b.shot('k8-ingen-trekk-tilbake') });
  // Eva sletter personen (papirkurv + permanent).
  const row = await employeeByEmail(email);
  await b.open('ansatte');
  await skipTour(b);
  await b.page.locator(`[id="employee-open-${row.id}"]`).first().click({ timeout: 10000 });
  await b.page.waitForTimeout(1500);
  await tap(b, 'Flytt til papirkurv');
  await tap(b, 'Flytt til papirkurv').catch(() => {});
  await b.page.waitForTimeout(2500);
  await b.open('ansatte');
  await tap(b, 'Papirkurv', { exact: false }).catch(() => {});
  await b.page.locator(`[id="employee-open-${row.id}"]`).first().click({ timeout: 8000 }).catch(() => {});
  await b.page.waitForTimeout(1200);
  await tap(b, 'Slett permanent').catch(() => {});
  await tap(b, 'Slett permanent').catch(() => {});
  await b.page.waitForTimeout(2500);
  const gone = !(await employeeByEmail(email));
  S.info('K8b Eva sletter «Feil Person» permanent', gone ? 'Posten er slettet' : 'Posten finnes fortsatt', await b.shot('k8-slettet'));
  // Mottakeren registrerer seg likevel og godtar.
  await createAuthUser({ email, password: PW, name: 'Feil Person' });
  const sync = await call('syncMyInvites', {}, email);
  const inv = (sync.invites || []).find((i) => i.familyId === st.companyId);
  let resp = null;
  if (inv) resp = await call('respondGroupInvite', { familyId: st.companyId, inviteId: inv.inviteId, response: 'accepted' }, email);
  const uid = (await authUserByEmail(email))?.localId;
  const member = ((await company()).members || []).includes(uid);
  S.check(!member, 'K8c Slettet medarbeider kan ikke godta den gamle invitasjonen', 'Ikke medlem', `syncMyInvites ga invitasjon=${!!inv}, svar=${JSON.stringify(resp || {}).slice(0, 120)}, medlem=${member}`, { id: 'ANSATT-25', sev: 'Høy', ref: 'FL-10' });
  if (member) {
    const ftok = await idToken(email, PW);
    const emp = await rget(`families/${st.companyId}/employees`, ftok);
    S.info('K8d Hva den uønskede får', `Står i members; reglene gir GET employees → ${emp.status}. Uten koblet post gir appen standardnivået «Ansatt» (FL-03).`);
  }
}

/* ───────── K9: bedriften slettet mens invitasjonen venter (FL-05) ───────── */
async function k9(b) {
  st.jon = { email: mail('jon'), name: 'Jon Ventende' };
  st.jon.uid = await createAuthUser({ email: st.jon.email, password: PW, name: st.jon.name });
  let j = await bot('jon', 'phone');
  await loginAndSettle(j, { name: st.jon.name });
  await closeBot('jon');
  // Eva oppretter en bedrift nr. 2, inviterer Jon og sletter bedriften.
  const name2 = `Kant Kortliv ${ID} AS`;
  await createCompanyUI(b, name2);
  let c2 = '';
  for (const fid of (await getDoc(`users/${st.eier.uid}`))?.familyIds || []) {
    const f = await getDoc(`families/${fid}`);
    if (f?.name === name2) c2 = fid;
  }
  await openInvitePanel(b);
  await addInvitePerson(b, { first: 'Jon', last: 'Ventende', email: st.jon.email, level: 'Ansatt' });
  await sendQueued(b);
  const evaTok = await idToken(st.eier.email, PW);
  // Samme felter som deleteGroup (src/utils/groups.js:180) skriver.
  const del = await rpatch(`families/${c2}`, evaTok, { deleted: true, active: false, archived: true, hiddenFromApp: true, subscriptionStatus: 'cancelled', subscriptionCancelReason: 'group_deleted', deletedAt: new Date().toISOString() });
  S.info('K9a Eva sletter bedrift nr. 2 mens invitasjonen til Jon venter', `PATCH (deleteGroup-feltene) → ${del.status}`);
  // Tilbake til første bedrift for de neste testene.
  await b.page.evaluate(() => window.__protopBot.openShell('home', null)).catch(() => {});
  j = await bot('jon', 'phone');
  await loginUI(j);
  const ov = await waitText(j, /Bedriftsinvitasjon/i, 40000);
  if (!ov) {
    S.check(true, 'K9b Jon låses ikke av invitasjonen til en slettet bedrift', 'Ingen vindu eller vindu som kan lukkes', 'Ingen vindu', { shot: await j.shot('k9-jon') });
    await closeBot('jon');
    return;
  }
  await j.page.getByText('Godta invitasjon', { exact: true }).last().click();
  await j.page.waitForTimeout(4000);
  const a1 = await j.visibleText();
  await j.page.getByText('Avslå', { exact: true }).last().click().catch(() => {});
  await j.page.waitForTimeout(4000);
  const a2 = await j.visibleText();
  await j.page.keyboard.press('Escape').catch(() => {});
  await j.page.waitForTimeout(800);
  const still = /Bedriftsinvitasjon/i.test(await j.visibleText());
  const err1 = (a1.match(/[^\n]*(slettet|finnes ikke|Kunne ikke|besvart|feil)[^\n]*/i) || ['ingen melding'])[0];
  const err2 = (a2.match(/[^\n]*(slettet|finnes ikke|Kunne ikke|besvart|feil)[^\n]*/i) || ['ingen melding'])[0];
  S.check(!still, 'K9b Invitasjon til slettet bedrift kan avslås eller lukkes', 'Avslå lykkes eller vinduet forsvinner', `Godta: «${err1}», Avslå: «${err2}», vinduet står etter Escape=${still}`, { id: 'ANSATT-24', sev: 'Høy', ref: 'FL-05', shot: await j.shot('k9-jon-last') });
  if (still) {
    await j.open('selskap').catch(() => {});
    S.info('K9c Jon kommer ikke forbi vinduet', 'Hele appen ligger bak vinduet uten vei ut', await j.shot('k9-jon-bak-vinduet'));
  }
  await closeBot('jon');
}

/* ───────── K10: be om å bli med (FL-15) ───────── */
async function k10(b) {
  const orgnr = `9${String(Date.now()).slice(-8)}`;
  const evaTok = await idToken(st.eier.email, PW);
  await rpatch(`families/${st.companyId}`, evaTok, { orgnr, company: { organisasjonsnummer: orgnr } });
  S.env('K10a Brønnøysund-søket i «Be om innpass» virker ikke uten nett', `Bedriften får orgnr ${orgnr} med Evas token. Forespørselen sendes med samme kall som appen gjør etter valgt treff (findCompanyByOrgnr → requestCompanyJoin).`);
  await apiUser('lise', 'Lise Lurer');
  const found = await call('findCompanyByOrgnr', { orgnr }, st.lise.email);
  const req = await call('requestCompanyJoin', { companyId: st.companyId, name: 'Lise Lurer' }, st.lise.email);
  S.check(req?.ok === true, 'K10b «Be om å bli med» registreres', 'ok', `findCompanyByOrgnr=${JSON.stringify(found).slice(0, 100)} · requestCompanyJoin=${JSON.stringify(req).slice(0, 120)}`);
  // Eva: varsel og Ansatte → Inviter brukere.
  await b.open('more', 'notifications');
  await b.page.waitForTimeout(2500);
  const notes = await b.visibleText();
  const hasNote = /ber om å bli med|Forespørsel om å bli med/i.test(notes);
  S.info('K10c Eva får varselet', hasNote ? 'Varselet «Forespørsel om å bli med» vises' : 'Ikke i varsellisten', await b.shot('k10-varsel'));
  if (hasNote) {
    await b.page.getByText(/Forespørsel om å bli med|ber om å bli med/).first().click().catch(() => {});
    await b.page.waitForTimeout(2500);
    const after = await b.visibleText();
    const opened = /Inviter brukere|Lise Lurer[\s\S]{0,200}(Inviter|Avvis)/.test(after) && !/Varsler/.test(after.slice(0, 200));
    S.check(opened, 'K10d Varselet åpner forespørselen', 'Fører til Inviter brukere / forespørselen', opened ? 'Åpnet' : 'Ingenting skjer', { id: 'ANSATT-26', sev: 'Middels', ref: 'FL-15', shot: await b.shot('k10-varsel-trykk') });
  }
  await openInvitePanel(b);
  const panel = await b.visibleText();
  const listed = /Lise Lurer|Forespørsler|ber om å bli med/i.test(panel);
  S.check(listed, 'K10e Forespørselen vises i Ansatte → Inviter brukere med Inviter/Avvis', 'Liste over forespørsler', listed ? 'Vises' : 'Ingen forespørsler vises (varselet sier «Inviter personen under Ansatte → Inviter brukere»)', { id: 'ANSATT-26', sev: 'Middels', ref: 'FL-15', shot: await b.shot('k10-inviter-panel') });
  const again = await call('requestCompanyJoin', { companyId: st.companyId, name: 'Lise Lurer' }, st.lise.email);
  S.info('K10f Ny forespørsel fra Lise', JSON.stringify(again).slice(0, 150));
  const jr = await getDoc(`families/${st.companyId}/joinRequests/${st.lise.uid}`);
  S.info('K10g joinRequests/{uid}', `status=${jr?.status}`);
}

/* ───────── K11: godtatt mens raden står «queued» (FL-11) ───────── */
async function k11(b) {
  await apiUser('siv', 'Siv Sjef');
  await openInvitePanel(b);
  await addInvitePerson(b, { first: 'Siv', last: 'Sjef', email: st.siv.email, level: 'Avdelingsleder' });
  await sendQueued(b);
  const row = await employeeByEmail(st.siv.email);
  // Som når e-posten feiler: applyInviteSendResult lar raden stå «queued» med parentKey.
  const evaTok = await idToken(st.eier.email, PW);
  await rpatch(`families/${st.companyId}/employees/${row.id}`, evaTok, { invite: { status: 'queued', sentAt: '', error: 'E-post ble ikke sendt (simulert)' } });
  S.info('K11a Forutsetning: e-posten «feilet», raden står queued (simulert i data)', `rad ${row.id}, parentKey=${row.invite?.parentKey}`);
  const inbox = await listDocs(`users/${st.siv.uid}/familyInvites`);
  const inv = inbox.find((x) => x.familyId === st.companyId && x.status === 'pending');
  const resp = inv ? await call('respondGroupInvite', { familyId: st.companyId, inviteId: inv.inviteId || inv.id, response: 'accepted' }, st.siv.email) : null;
  const after = await employeeByEmail(st.siv.email);
  S.check(after?.personUid === st.siv.uid && after?.invite?.status === 'accepted', 'K11b Godtatt invitasjon kobler Siv til raden med valgt nivå (Avdelingsleder)', 'personUid=Siv, invite accepted', `svar=${JSON.stringify(resp || {}).slice(0, 80)}; personUid=${after?.personUid || '(tom)'}, invite.status=${after?.invite?.status}, nivå på raden=${after?.company?.accessLevel}. Uten kobling får Siv standardnivået Ansatt.`, { id: 'ANSATT-27', sev: 'Middels', ref: 'FL-11' });
}

/* ───────── K12: kolliderende plassholder-id (FL-23) ───────── */
async function k12(b) {
  const e1 = `ola.n-${ID}@protop.test`;
  const e2 = `olan-${ID}@protop.test`;
  await openInvitePanel(b);
  await addInvitePerson(b, { first: 'Ola', last: 'Punktum', email: e1, level: 'Ansatt' });
  await addInvitePerson(b, { first: 'Ola', last: 'Uten', email: e2, level: 'Ansatt' });
  await sendQueued(b);
  const parents = await listDocs(`families/${st.companyId}/parents`);
  const key = `olan${ID}protoptest`.replace(/[^a-z0-9]/g, '').slice(0, 40);
  const ph = parents.filter((p) => p.id === key);
  const r1 = await employeeByEmail(e1);
  const r2 = await employeeByEmail(e2);
  S.check(r1?.invite?.parentKey !== r2?.invite?.parentKey, 'K12a To e-poster som bare skiller seg på tegn får hver sin plassholder', 'Ulik parentKey', `parentKey ${r1?.invite?.parentKey} og ${r2?.invite?.parentKey}; plassholderen ${key} har e-post ${ph[0]?.email}`, { id: 'ANSATT-28', sev: 'Lav', ref: 'FL-23' });
  // Begge registrerer seg. Finner begge invitasjonen?
  await createAuthUser({ email: e1, password: PW, name: 'Ola Punktum' });
  await createAuthUser({ email: e2, password: PW, name: 'Ola Uten' });
  const s1 = await call('syncMyInvites', {}, e1);
  const s2 = await call('syncMyInvites', {}, e2);
  const ok1 = (s1.invites || []).some((i) => i.familyId === st.companyId);
  const ok2 = (s2.invites || []).some((i) => i.familyId === st.companyId);
  S.check(ok1 && ok2, 'K12b Begge finner invitasjonen etter registrering', 'Begge får bedriften i syncMyInvites', `ola.n: ${ok1}, olan: ${ok2}`, { id: 'ANSATT-28', sev: 'Lav', ref: 'FL-23' });
}


/* ───────── K13: «Opprett bedrift» avbrutt mellom de to skrivingene (FL-26) ───────── */
async function k13() {
  // Egen eier og egen nettleser: siden kobles fra nettet i det selskapsdokumentet dukker opp.
  st.k13 = { email: mail('avbrudd'), name: 'Anne Avbrudd' };
  st.k13.uid = await createAuthUser({ email: st.k13.email, password: PW, name: st.k13.name });
  const b = await bot('k13', 'desktop', st.k13.email);
  await loginAndSettle(b, { name: st.k13.name });
  await waitShell(b);
  const name = `Avbrudd ${ID} AS`;
  await b.page.goto(`${BASE}/CreateCompany`, { waitUntil: 'domcontentloaded' });
  await waitText(b, /Opprett bedrift/, 60000);
  await b.fill('Bedriftsnavn', name);
  await b.fill('Adresse, hvis kjent', 'Kantveien 2, 0150 Oslo');
  await tap(b, 'Registrer manuelt');
  let fid = '';
  const until = Date.now() + 20000;
  while (Date.now() < until && !fid) {
    for (const id of (await getDoc(`users/${st.k13.uid}`))?.familyIds || []) {
      const f = await getDoc(`families/${id}`);
      if (f?.name === name) fid = id;
    }
  }
  await b.ctx.setOffline(true);
  await closeBot('k13');
  await new Promise((r) => setTimeout(r, 3000));
  const f = fid ? await getDoc(`families/${fid}`) : null;
  const split = !!f && !f.company;
  S.info('K13 Avbrudd rett etter at selskapsdokumentet er skrevet', f ? (split ? `Selskapet ${fid} står uten «company» og «orgnr» (andre skriving gikk tapt)` : 'Begge skrivingene kom fram før avbruddet (ikke reprodusert)') : 'Selskapet ble ikke opprettet før avbruddet');
  if (split) S.check(false, 'K13 «Opprett bedrift» lagres samlet', 'company og orgnr i samme skriving som selskapet', `families/${fid} mangler company/orgnr`, { id: 'ANSATT-29', sev: 'Lav', ref: 'FL-26' });
}

/* ───────── Kjøring ───────── */
try {
  if (want('K1')) await runTest('K1', k1);
  if (want('K2')) await runTest('K2', k2);
  await closeBot('gjest');
  if (want('K3')) await runTest('K3', k3);
  if (want('K4')) await runTest('K4', k4);
  const needsOwner = ['K5', 'K6', 'K7', 'K8', 'K9', 'K10', 'K11', 'K12'].some(want);
  if (needsOwner) {
    await runTest('Oppsett', setupOwner);
    if (!st.companyId) throw new Error('Ingen bedrift – kan ikke kjøre K5–K12');
    if (want('K5')) await runTest('K5', async () => k5(await owner()));
    if (want('K6') || want('K7')) await runTest('K6/K7', async () => k6k7(await owner()));
    if (want('K8')) await runTest('K8', async () => k8(await owner()));
    if (want('K10')) await runTest('K10', async () => k10(await owner()));
    if (want('K11')) await runTest('K11', async () => k11(await owner()));
    if (want('K12')) await runTest('K12', async () => k12(await owner()));
    if (want('K9')) await runTest('K9', async () => k9(await owner()));
  }
  await closeBot('eier');
  if (want('K13')) await runTest('K13', k13);
} catch (err) {
  S.record({ step: 'Skriptet stoppet', expected: 'Alle kanttilfeller kjører ferdig', actual: String(err?.stack || err).slice(0, 500), ok: false, kind: 'bot' });
  console.error(err);
} finally {
  writeFileSync(join(OUT_ROOT, `kant-state-${ID}.json`), JSON.stringify(st, null, 2));
  S.save({ state: st });
  await closeBrowser();
}
process.exit(S.deviations.length || S.rows.some((r) => r.kind === 'bot') ? 1 : 0);
