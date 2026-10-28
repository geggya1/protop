/**
 * Team A – «fra invitasjon til avsluttet engasjement».
 * Flere boter spiller ekte brukere mot hverandre i nettleseren (desktop og telefon):
 *  1. Eva registrerer seg via /register (ekte samtykke), bekrefter e-posten fra fangeren
 *     og oppretter bedriften manuelt (Brønnøysund svarer ikke uten nett).
 *  2. Eva inviterer Nina (ny bruker, Ansatt), Ola (har konto og egen bedrift, Administrator)
 *     og Per (har konto, Avdelingsleder). Nina registrerer seg via lenken, Ola godtar og bytter
 *     bedrift, Per avslår.
 *  3. Tilgang per nivå i UI og i reglene (REST med brukerens eget idToken).
 *  4. Eva bytter nivå (Ola admin → ansatt, Nina ansatt → admin): UI, regler og adminUids (FL-08).
 *  5. Eva avslutter engasjementet (deaktiver, «Avslutt medarbeiderkonto», sluttdato, papirkurv,
 *     permanent sletting) og sjekker hva den tidligere ansatte ser og kan (FL-01/03/04/16/18).
 *
 * Hvert steg skriver OK/AVVIK. Avslutter med kode 1 ved avvik i appen.
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/ansatt.mjs
 * Utvikling: --from=<fase> --state=<fil> fortsetter med brukerne i en tidligere kjøring.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { Bot, BASE, closeBrowser } from '../lib/bot.mjs';
import {
  authUserByEmail, callFn, createAuthUser, getDoc, idToken, linksIn, listDocs, mailsTo, putDoc, waitFor,
} from '../lib/emu.mjs';
import {
  OUT_ROOT, Steps, allowed, denied, fillId, localLink, loginUI, pageAccess, rarray, rget, rlist, rpatch,
  skipTour, tap, tapId, tsId, waitShell, waitText,
} from './ansatt-lib.mjs';

const arg = (n, d = '') => (process.argv.find((a) => a.startsWith(`--${n}=`)) || '').split('=').slice(1).join('=') || d;
const FROM = Number(arg('from', '1'));
const ONLY = arg('only', '');
const runPhase = (n) => (ONLY ? ONLY.split(',').map(Number).includes(n) : n >= FROM);

const S = new Steps('ansatt');
const OUT = OUT_ROOT;
mkdirSync(OUT, { recursive: true });

const STATE_FILE = arg('state', '');
const ID = tsId();
const PW = 'Bygg-2026!test';
let st = STATE_FILE && existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {
  id: ID,
  eier: { email: `a-${ID}-eier@protop.test`, name: 'Eva Eiersen', password: PW },
  nina: { email: `a-${ID}-nina@protop.test`, name: 'Nina Nyansatt', first: 'Nina', last: 'Nyansatt', password: PW },
  ola: { email: `a-${ID}-ola@protop.test`, name: 'Ola Olsen', first: 'Ola', last: 'Olsen', password: PW },
  per: { email: `a-${ID}-per@protop.test`, name: 'Per Persen', first: 'Per', last: 'Persen', password: PW },
  company: `Eva Bygg ${ID} AS`,
  companyB: `Ola Rør ${ID} AS`,
};
const stateFile = STATE_FILE || join(OUT, `state-${st.id}.json`);
const saveState = () => writeFileSync(stateFile, JSON.stringify(st, null, 2));
saveState();
console.log(`Kjøring ${st.id} · tilstand: ${stateFile}`);

const bots = {};
async function bot(key, view) {
  if (bots[key]) return bots[key];
  const who = st[key];
  const b = await new Bot(key, { email: who.email, password: who.password, view, outDir: join(OUT, st.id), consents: false }).start();
  bots[key] = b;
  return b;
}
async function closeBot(key) {
  if (!bots[key]) return;
  await bots[key].stop();
  delete bots[key];
}
async function shot(b, label) {
  return b.shot(label);
}
async function token(key) {
  return idToken(st[key].email, st[key].password);
}
async function company() {
  return getDoc(`families/${st.companyId}`);
}
async function employees() {
  return listDocs(`families/${st.companyId}/employees`);
}
async function employeeOf(key) {
  const email = st[key].email.toLowerCase();
  return (await employees()).find((e) => [e.person?.email, e.company?.email, e.invite?.email].map((x) => String(x || '').toLowerCase()).includes(email)) || null;
}
const ENGLISH = /\b(Loading|Save|Cancel|Delete|Settings|Submit|Search|Error|Unknown|Close|Back|Next|Edit|Failed to fetch|Something went wrong|invite|Invitation|undefined|NaN)\b/;

/** Ny bruker logger inn første gang i en ny nettleser og blir ført gjennom profilsteget. */
async function loginAndSettle(b, { name } = {}) {
  await loginUI(b);
  let text = await waitText(b, /Velkommen|Hei,|Bedriftsinvitasjon|Bekreft e-posten|Selskap|Hjem/i, 60000) || '';
  if (/Velkommen/.test(text) && /Fortsett/.test(text)) {
    if (name) {
      const field = b.page.getByPlaceholder(/navn/i);
      if (await field.count()) await field.first().fill(name).catch(() => {});
    }
    await tap(b, 'Fortsett');
    text = await waitText(b, /Hei,|Bedriftsinvitasjon|Selskap|Hjem/i, 60000) || '';
  }
  return text;
}

/* ════════════════════ Fase 1: Eva registrerer seg og oppretter bedriften ════════════════════ */
async function phase1() {
  console.log('\n── Fase 1: registrering, e-postbekreftelse og ny bedrift ──');
  const b = await bot('eier', 'desktop');
  const steps = [];
  const t0 = Date.now();
  b.where = 'registrering';
  await b.goto('/login');
  await b.page.waitForSelector('input[type=password]', { timeout: 300000 });
  steps.push('Åpne /login');
  await tap(b, 'Registrer deg');
  steps.push('Trykk «Registrer deg»');
  const regText = await waitText(b, /Opprett konto/, 20000);
  S.check(!!regText, 'R1 «Registrer deg» fra /login åpner registreringen', 'Skjemaet «Opprett konto»', regText ? 'Opprett konto vises' : 'Fant ikke skjemaet', { shot: await shot(b, 'registrer-skjema') });

  await b.fill('Ditt navn', st.eier.name);
  await b.fill('navn@domene.no', st.eier.email);
  await b.fill('Minst 8 tegn', st.eier.password);
  steps.push('Fyll navn', 'Fyll e-post', 'Fyll passord');
  await tap(b, 'Registrer');
  await b.page.waitForTimeout(1200);
  const noConsent = await b.visibleText();
  const blocked = /Huk av for å gå videre/.test(noConsent) && /Opprett konto/.test(noConsent);
  S.check(blocked, 'R2 Registrering uten samtykke stoppes', 'Melding «Huk av for å gå videre», ingen konto', blocked ? 'Stoppet med melding' : 'Gikk videre uten samtykke', { shot: await shot(b, 'uten-samtykke') });
  S.check(!(await authUserByEmail(st.eier.email)), 'R3 Ingen konto opprettet uten samtykke', 'Ingen Auth-bruker', (await authUserByEmail(st.eier.email)) ? 'Konto finnes' : 'Ingen konto');

  await tap(b, 'Jeg har lest og forstått', { exact: false });
  steps.push('Kryss av samtykke');
  await tap(b, 'Registrer');
  steps.push('Trykk «Registrer»');
  const verifyText = await waitText(b, /Bekreft e-posten din/, 30000);
  S.check(!!verifyText && verifyText.includes(st.eier.email), 'R4 Etter registrering: «Bekreft e-posten din» med adressen', 'Side som ber om bekreftelse og viser e-posten', verifyText ? verifyText.split('\n').filter(Boolean).slice(0, 4).join(' | ') : 'Ikke vist', { shot: await shot(b, 'bekreft-epost') });

  const mail = await waitFor(() => mailsTo(st.eier.email).find((m) => /Bekreft/i.test(m.subject)), { timeout: 30000, label: 'bekreftelsesmail' }).catch(() => null);
  const link = mail ? linksIn(mail).find((l) => /verify-email\?vt=/.test(l)) : null;
  S.check(!!mail, 'R5 Bekreftelsesmail fanget', 'E-post til brukeren', mail ? `Emne «${mail.subject}», avsender ${mail.raw?.sender?.email || '?'}` : 'Ingen e-post');
  if (mail) {
    const blob = `${mail.subject}\n${mail.text}\n${mail.html}`;
    const plain = String(mail.text || '').replace(/https?:\/\/\S+/g, '');
    S.check(!ENGLISH.test(plain) && /Hei|Bekreft/.test(blob), 'R6 Bekreftelsesmailen er på norsk', 'Norsk tekst', ENGLISH.test(plain) ? `Engelsk funnet: ${(plain.match(ENGLISH) || [])[0]}` : 'Norsk');
    S.check(!!link && link.startsWith('http://localhost:8081/'), 'R7 Bekreftelseslenken peker til appen som sendte den', 'Lenke til localhost:8081/verify-email?vt=…', link || linksIn(mail).join(' '));
  }
  // Åpner lenken i samme nettleser (personen er fortsatt innlogget etter registreringen).
  if (link) {
    await b.page.goto(link, { waitUntil: 'domcontentloaded' });
    steps.push('Åpne lenken i e-posten');
    const done = await waitText(b, /E-post bekreftet|Velkommen/, 30000);
    S.check(!!done, 'R8 Lenken bekrefter e-posten og fører videre', '«E-post bekreftet» og så profilsteget', done ? done.split('\n').filter(Boolean).slice(0, 3).join(' | ') : (await b.visibleText()).slice(0, 200), { shot: await shot(b, 'etter-lenke') });
  }
  const auth = await authUserByEmail(st.eier.email);
  st.eier.uid = auth?.localId;
  S.check(auth?.emailVerified === true, 'R9 Auth: emailVerified=true etter lenken', 'emailVerified true', `emailVerified=${auth?.emailVerified}`);

  // Etter «E-post bekreftet» skal personen videre til profilsteget, ikke ut til innlogging.
  const where = await waitText(b, /Velkommen|Har du ikke konto\?/, 30000) || '';
  const toLogin = /Har du ikke konto\?/.test(where) && !/Velkommen/.test(where);
  S.check(!toLogin, 'R8b Etter bekreftelsen går innlogget bruker videre (ikke til innlogging)', 'Profilsteget «Velkommen»', toLogin ? 'Havnet på «Logg inn» og må logge inn på nytt' : 'Profilsteget', { id: 'ANSATT-06', sev: 'Lav', shot: toLogin ? await shot(b, 'etter-bekreftelse-til-login') : '' });
  if (toLogin) {
    steps.push('Logg inn på nytt');
    await loginUI(b);
  }
  const prof = await waitText(b, /Velkommen/, 30000);
  if (prof) {
    const nameVal = await b.page.locator('input').first().inputValue().catch(() => '');
    S.info('R10 Profilsteget «Velkommen» spør om navn og kjønn igjen', `Navnefeltet er forhåndsutfylt med «${nameVal}». Kjønn er valgfritt.`, await shot(b, 'profil'));
    await tap(b, 'Fortsett');
    steps.push('Trykk «Fortsett» på profilsteget');
  }
  await waitShell(b);
  const hjem = await b.visibleText();
  S.check(/Hei, Eva|Hjem/.test(hjem), 'R11 Kommer inn på Hjem etter profilsteget', 'Hjem i personlig arbeidsområde', hjem.split('\n').filter(Boolean).slice(0, 3).join(' | '), { shot: await shot(b, 'hjem-privat') });

  const user = await getDoc(`users/${st.eier.uid}`);
  const shells = [];
  for (const fid of user?.familyIds || []) {
    const f = await getDoc(`families/${fid}`);
    if (f?.isPersonal) shells.push(fid);
  }
  S.check(shells.length === 1, 'R12 Ett personlig arbeidsområde etter første innlogging', '1 personlig «familie»', `${shells.length} personlige arbeidsområder: ${shells.join(', ')}`, { id: 'ANSATT-02', sev: 'Lav' });
  const c = user?.consents || {};
  S.check(!!(c.termsAt && c.privacyAt), 'R13 Samtykket er lagret med tidspunkt på brukeren', 'users/{uid}.consents.termsAt og privacyAt satt', `termsAt=${c.termsAt}, privacyAt=${c.privacyAt}, versjon ${c.version}`, { id: 'ANSATT-03', sev: 'Middels' });

  // Opprett bedrift: Privat/Bedrift-bryteren → «Opprett ny bedrift».
  await skipTour(b);
  await tapId(b, 'platform-switch-bedrift');
  steps.push('Trykk «Bedrift»');
  await waitText(b, /Opprett ny bedrift|Ingen bedrift ennå/, 15000);
  await skipTour(b);
  await shot(b, 'ingen-bedrift');
  await tap(b, 'Opprett ny bedrift');
  steps.push('Trykk «Opprett ny bedrift»');
  await waitText(b, /Opprett bedrift/, 15000);
  await b.fill('Navn eller organisasjonsnummer', st.company);
  await tap(b, 'Søk');
  const brreg = await waitText(b, /Failed to fetch|feilet|Ingen treff|Velg denne bedriften/, 20000) || '';
  S.env('R14 Søk i Brønnøysund', `Uten nett: «${(brreg.match(/Failed to fetch|Søket mot Brønnøysund feilet\.?|Ingen treff[^\n]*/) || ['?'])[0]}»`, await shot(b, 'brreg-sok'));
  if (/Failed to fetch/.test(brreg)) {
    S.check(false, 'R15 Feilmeldingen ved Brønnøysund-søk er på norsk', 'Norsk melding, f.eks. «Fikk ikke kontakt med Brønnøysund»', 'Viser rå engelsk «Failed to fetch»', { id: 'ANSATT-04', sev: 'Lav' });
  }
  await b.fill('Bedriftsnavn', st.company);
  await b.fill('Adresse, hvis kjent', 'Storgata 1, 0155 Oslo');
  steps.push('Fyll bedriftsnavn', 'Fyll adresse');
  await tap(b, 'Registrer manuelt');
  steps.push('Trykk «Registrer manuelt»');
  const inside = await waitText(b, new RegExp(st.company.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 30000);
  await waitShell(b);
  const fams = (await getDoc(`users/${st.eier.uid}`))?.familyIds || [];
  for (const fid of fams) {
    const f = await getDoc(`families/${fid}`);
    if (f?.type === 'organization' && f?.name === st.company) st.companyId = fid;
  }
  saveState();
  const comp = st.companyId ? await company() : null;
  S.check(!!inside && !!comp, 'R16 Manuell bedrift opprettes og åpnes', 'Bedriftens forside med navnet', comp ? `families/${st.companyId}, eier ${comp.ownerUid === st.eier.uid ? 'Eva' : comp.ownerUid}` : 'Ikke opprettet', { shot: await shot(b, 'bedrift-opprettet') });
  if (comp) {
    S.check(comp.type === 'organization' && (comp.adminUids || []).includes(st.eier.uid) && comp.company?.navn === st.company,
      'R17 Bedriftsdokumentet har type, eier, admin og navn', 'type=organization, adminUids=[Eva], company.navn',
      `type=${comp.type}, adminUids=${(comp.adminUids || []).length}, navn=${comp.company?.navn}, orgnr='${comp.orgnr}'`);
  }
  st.registerSteps = steps.length;
  st.registerSeconds = Math.round((Date.now() - t0) / 1000);
  S.info('R18 Antall handlinger fra /login til egen bedrift', `${steps.length} handlinger: ${steps.join(' → ')}`);
  saveState();
}

/* ════════════════════ Fase 2: invitasjoner ════════════════════ */

async function ensureOwner() {
  if (bots.eier && (bots.eier.page.isClosed() || !(await bots.eier.page.evaluate(() => 1).catch(() => 0)))) {
    await bots.eier.stop().catch(() => {});
    delete bots.eier;
  }
  const b = await bot('eier', 'desktop');
  if (!(await b.page.evaluate(() => !!window.__protopBot).catch(() => false))) {
    await loginUI(b);
    await waitShell(b);
  }
  return b;
}

/** Eva legger til personer i «Inviter brukere» og trykker Inviter. */
async function inviteFromPanel(b, people) {
  await b.open('ansatte');
  await skipTour(b);
  await tap(b, 'Ny ansatt').catch(() => {});
  await tap(b, 'Inviter brukere');
  await waitText(b, /Inviter brukere/, 10000);
  for (const p of people) {
    await fillId(b, 'employee-invite-first', p.first);
    await fillId(b, 'employee-invite-last', p.last);
    await fillId(b, 'employee-invite-email', p.email);
    // Nivåvelgeren: «Velg» åpner listen.
    await tap(b, 'Velg');
    await b.page.waitForTimeout(500);
    const opt = b.page.getByText(p.level, { exact: true });
    const n = await opt.count();
    let clicked = false;
    for (let i = n - 1; i >= 0 && !clicked; i -= 1) {
      if (await opt.nth(i).isVisible().catch(() => false)) { await opt.nth(i).click(); clicked = true; }
    }
    await b.page.waitForTimeout(400);
    await tapId(b, 'employee-invite-add');
    await waitText(b, new RegExp(`${p.first} ${p.last} er lagt klar|${p.first}`), 10000);
    await b.page.waitForTimeout(800);
  }
  return b.visibleText();
}

async function inviteMail(email, re = /Invitasjon|invitert/i) {
  return waitFor(() => mailsTo(email).filter((m) => re.test(m.subject)).pop(), { timeout: 30000, label: `invitasjon til ${email}` }).catch(() => null);
}

function mailCheck(prefix, who, mail, { existing, inviterCheck = false }) {
  if (!mail) {
    S.check(false, `${prefix} Invitasjonsmail til ${who}`, 'E-post fanget', 'Ingen e-post');
    return null;
  }
  const links = linksIn(mail);
  const link = links.find((l) => existing ? /family-invite\//.test(l) : /register\?/.test(l)) || links[0];
  const sender = mail.raw?.sender?.email || mail.raw?.from?.email || '';
  S.check(new RegExp(st.company).test(mail.subject) || new RegExp(st.company).test(mail.text), `${prefix} Invitasjonsmail til ${who}: emne og bedriftsnavn`, `Emne/innhold nevner «${st.company}»`, `Emne «${mail.subject}», avsender ${mail.raw?.sender?.name || ''} <${sender}>`);
  const plain = String(mail.text || '').replace(/https?:\/\/\S+/g, '');
  S.check(!ENGLISH.test(plain), `${prefix} Invitasjonsmail til ${who} er på norsk`, 'Ingen engelske ord', ENGLISH.test(plain) ? (plain.match(ENGLISH) || [])[0] : 'Norsk');
  const inviter = /Eiersen/.test(`${mail.text}${mail.html}`);
  if (inviterCheck) S.check(inviter, `${prefix} Invitasjonsmailen sier hvem som inviterer`, 'Navnet på den som inviterte (Eva Eiersen)', inviter ? 'Nevner Eva Eiersen' : `Nevner bare bedriften: «${(mail.text || '').split('\n').filter(Boolean).slice(0, 2).join(' ')}»`, { id: 'ANSATT-05', sev: 'Lav' });
  S.info(`${prefix} Lenke i invitasjonen til ${who}`, `${link} (${/^https:\/\/www\.protop\.no/.test(link) ? 'hardkodet produksjonsadresse – boten bytter til localhost:8081' : 'lokal'})`);
  return link;
}

async function phase2() {
  console.log('\n── Fase 2: invitasjoner (ny bruker, eksisterende bruker i annen bedrift, avslag) ──');
  const b = await ensureOwner();

  // Ola og Per har konto fra før. Ola har også sin egen bedrift (B).
  st.ola.uid = await createAuthUser({ email: st.ola.email, password: PW, name: st.ola.name });
  st.per.uid = await createAuthUser({ email: st.per.email, password: PW, name: st.per.name });
  saveState();
  const o = await bot('ola', 'desktop');
  await loginAndSettle(o, { name: st.ola.name });
  await waitShell(o);
  await tapId(o, 'platform-switch-bedrift');
  await waitText(o, /Opprett ny bedrift/, 15000);
  await tap(o, 'Opprett ny bedrift');
  await waitText(o, /Opprett bedrift/, 15000);
  await o.fill('Bedriftsnavn', st.companyB);
  await tap(o, 'Registrer manuelt');
  await waitText(o, new RegExp(st.companyB), 30000);
  for (const fid of (await getDoc(`users/${st.ola.uid}`))?.familyIds || []) {
    const f = await getDoc(`families/${fid}`);
    if (f?.type === 'organization' && f?.name === st.companyB) st.companyBId = fid;
  }
  saveState();
  // Per har logget inn én gang før (profilsteget), men har ingen bedrift.
  const pp = await bot('per', 'phone');
  await loginAndSettle(pp, { name: st.per.name });
  await waitShell(pp).catch(() => {});
  S.info('I0 Per har logget inn én gang (profil og personlig arbeidsområde)', (await pp.visibleText()).split('\n').filter(Boolean).slice(0, 2).join(' | '), await shot(pp, 'per-forste-innlogging'));
  await closeBot('per');
  S.check(!!st.companyBId, 'I1 Ola har egen bedrift B fra før', 'Bedrift B finnes med Ola som eier', st.companyBId || 'mangler', { shot: await shot(o, 'ola-bedrift-b') });

  // Eva inviterer tre personer med ulike nivåer.
  const before = await b.visibleText();
  void before;
  const panel = await inviteFromPanel(b, [
    { ...st.nina, level: 'Ansatt' },
    { ...st.ola, level: 'Administrator' },
    { ...st.per, level: 'Avdelingsleder' },
  ]);
  const queuedOk = ['Nina', 'Ola', 'Per'].every((n) => panel.includes(n)) && /Klare til invitasjon \(3\)/.test(panel);
  S.check(queuedOk, 'I2 Tre personer lagt klare i «Inviter brukere»', '«Klare til invitasjon (3)» med Nina, Ola og Per', (panel.match(/Klare til invitasjon[^\n]*/) || ['?'])[0], { shot: await shot(b, 'klare-til-invitasjon') });
  await tapId(b, 'employee-invite-send');
  const sentText = await waitText(b, /\d+ invitasjoner er sendt|Invitasjonen er sendt|E-post ble ikke sendt|Kunne ikke/, 90000) || '';
  await b.page.waitForTimeout(1500);
  S.check(/3 invitasjoner er sendt/.test(sentText), 'I3 «Inviter» sender alle tre', 'Melding «3 invitasjoner er sendt» og listen «Sendt, venter på svar»', (sentText.match(/[^\n]*(invitasjon[^\n]*sendt|ikke sendt|Kunne ikke)[^\n]*/i) || ['(ingen melding)'])[0], { shot: await shot(b, 'invitasjoner-sendt') });
  const errLine = (sentText.match(/E-post ble ikke sendt[^\n]*|Bare administrator[^\n]*|Kunne ikke[^\n]*/) || [''])[0];
  if (errLine) S.check(false, 'I3b Ingen feil ved utsending', 'Ingen feilmelding', errLine);

  const rows = await employees();
  for (const key of ['nina', 'ola', 'per']) {
    const e = rows.find((r) => r.invite?.email === st[key].email.toLowerCase());
    st[key].empId = e?.id;
    S.check(e?.invite?.status === 'sent', `I4 Medarbeiderpost for ${st[key].first}: invitasjon «sent» med valgt nivå`, `invite.status=sent, nivå ${key === 'nina' ? 'ansatt' : key === 'ola' ? 'administrator' : 'avdelingsleder'}`, e ? `status=${e.invite?.status}, nivå=${e.company?.accessLevel}, parentKey=${e.invite?.parentKey}` : 'mangler');
  }
  saveState();

  // E-postene
  const ninaMail = await inviteMail(st.nina.email);
  st.nina.link = mailCheck('I5', 'Nina (ny bruker)', ninaMail, { existing: false, inviterCheck: true });
  const olaMail = await inviteMail(st.ola.email);
  st.ola.link = mailCheck('I6', 'Ola (eksisterende)', olaMail, { existing: true });
  const perMail = await inviteMail(st.per.email);
  st.per.link = mailCheck('I7', 'Per (eksisterende)', perMail, { existing: true });
  saveState();
  if (olaMail) {
    S.check(/godta eller avslå/i.test(olaMail.text) && /allerede en ProTop-konto/i.test(olaMail.text), 'I8 Eksisterende bruker får «godta eller avslå»-tekst', 'Tekst om at hen har konto og må godta', olaMail.text.split('\n').filter(Boolean).slice(1, 3).join(' '));
  }
  if (ninaMail) {
    S.check(/Opprett en konto/i.test(ninaMail.text), 'I9 Ny bruker får «opprett konto»-tekst', 'Ber personen opprette konto med e-posten', ninaMail.text.split('\n').filter(Boolean).slice(1, 3).join(' '));
  }

}

/* ════════════════════ Fase 3: Nina (ny bruker, telefon) registrerer seg via lenken ════════════════════ */
async function phase3() {
  console.log('\n── Fase 3: Nina registrerer seg via invitasjonslenken og godtar ──');
  const n = await bot('nina', 'phone');
  const nSteps = [];
  const regUrl = localLink(st.nina.link || `https://www.protop.no/register?email=${encodeURIComponent(st.nina.email)}&familyId=${st.companyId}`);
  await n.page.goto(regUrl, { waitUntil: 'domcontentloaded', timeout: 300000 });
  nSteps.push('Åpne lenken i e-posten');
  const reg = await waitText(n, /Opprett konto/, 120000) || '';
  await waitText(n, /Invitasjon til bedrift|Vi fant ikke invitasjonen/, 15000);
  const regTxt = await n.visibleText();
  S.check(/Invitasjon til bedrift/i.test(regTxt) && regTxt.includes(st.company), 'I10 Registreringssiden viser bedriftsinvitasjonen', '«Invitasjon til bedrift» + bedriftsnavn', (regTxt.match(/INVITASJON[^\n]*\n[^\n]*/i) || [regTxt.slice(0, 160)])[0].replace(/\n/g, ' | '), { shot: await shot(n, 'nina-registrer-invitasjon') });
  const emailVal = await n.page.getByPlaceholder('navn@domene.no').inputValue().catch(() => '');
  const emailLocked = !(await n.page.getByPlaceholder('navn@domene.no').isEditable().catch(() => true));
  S.check(emailVal === st.nina.email && emailLocked, 'I11 E-posten er forhåndsutfylt og låst', `Låst felt med ${st.nina.email}`, `verdi «${emailVal}», låst=${emailLocked}`);
  void reg;
  await n.fill('Ditt navn', st.nina.name);
  await n.fill('Minst 8 tegn', PW);
  nSteps.push('Fyll navn', 'Fyll passord');
  await tap(n, 'Jeg har lest og forstått', { exact: false });
  nSteps.push('Kryss av samtykke');
  await tap(n, 'Registrer og se invitasjonen');
  nSteps.push('Trykk «Registrer og se invitasjonen»');
  await waitText(n, /Bekreft e-posten din/, 30000);
  await shot(n, 'nina-bekreft');
  const vmail = await waitFor(() => mailsTo(st.nina.email).find((m) => /Bekreft/.test(m.subject)), { timeout: 30000, label: 'bekreft nina' }).catch(() => null);
  const vlink = vmail ? linksIn(vmail).find((l) => /vt=/.test(l)) : null;
  if (vlink) {
    await n.page.goto(vlink, { waitUntil: 'domcontentloaded' });
    nSteps.push('Åpne bekreftelseslenken');
  }
  st.nina.uid = (await authUserByEmail(st.nina.email))?.localId;
  saveState();
  // Profilsteget og invitasjonsvinduet kommer om hverandre: vinduet kan legge seg over «Velkommen».
  let t = '';
  let sawBoth = false;
  const until = Date.now() + 90000;
  while (Date.now() < until) {
    t = await n.visibleText();
    if (/Bedriftsinvitasjon/i.test(t)) { sawBoth = /Velkommen/.test(t); break; }
    if (/Velkommen/.test(t) && /Fortsett/.test(t)) {
      const ok = await n.page.getByText('Fortsett', { exact: true }).first().click({ timeout: 3000 }).then(() => true).catch(() => false);
      if (ok) nSteps.push('Trykk «Fortsett» på profilsteget');
    }
    await n.page.waitForTimeout(1500);
  }
  S.info('I12a Hva Nina ser rett etter bekreftelsen', sawBoth ? 'Invitasjonsvinduet legger seg over profilsteget «Velkommen»' : t.split('\n').filter(Boolean).slice(0, 3).join(' | '), await shot(n, 'nina-etter-bekreftelse'));
  const overlay = /Bedriftsinvitasjon/i.test(t) ? t : null;
  if (overlay) {
    await n.page.getByText('Godta invitasjon', { exact: true }).last().click();
    nSteps.push('Trykk «Godta invitasjon»');
    await n.page.waitForTimeout(6000);
  }
  t = await n.visibleText();
  if (/Velkommen/.test(t) && /Fortsett/.test(t)) {
    await tap(n, 'Fortsett');
    nSteps.push('Trykk «Fortsett» på profilsteget');
  }
  await waitShell(n).catch(() => {});
  const inCo = await waitText(n, new RegExp(st.company), 30000);
  S.check(!!inCo, 'I13 Nina er inne i bedriften etter Godta', 'Bedriftens navn i skallet', inCo ? 'Inne' : (await n.visibleText()).slice(0, 200), { shot: await shot(n, 'nina-inne') });
  st.ninaSteps = nSteps.length;
  S.info('I14 Antall handlinger for invitert ny bruker fra e-post til bedriften', `${nSteps.length} handlinger: ${nSteps.join(' → ')}`);
  const comp = await company();
  const ninaEmp = await employeeOf('nina');
  S.check((comp.members || []).includes(st.nina.uid), 'I15 Nina står i members', 'members inneholder Nina', `members=${(comp.members || []).length}`);
  S.check(ninaEmp?.personUid === st.nina.uid && ninaEmp?.invite?.status === 'accepted' && ninaEmp?.company?.accessLevel === 'ansatt', 'I16 Ninas medarbeiderpost er koblet med nivå Ansatt', 'personUid=Nina, invite accepted, nivå ansatt', `personUid=${ninaEmp?.personUid === st.nina.uid ? 'Nina' : ninaEmp?.personUid}, status=${ninaEmp?.invite?.status}, nivå=${ninaEmp?.company?.accessLevel}`);
  S.check(!(comp.adminUids || []).includes(st.nina.uid), 'I17 Nina (Ansatt) står ikke i adminUids', 'Ikke admin', `adminUids=${JSON.stringify(comp.adminUids)}`);
  saveState();
  // FL-02: selskapet har ikke åpnet ISO ennå, så tilgangsspeilet (accessAcl) finnes ikke.
  const ntk = await token('nina');
  const aclList = await listDocs(`families/${st.companyId}/accessAcl`);
  const rPol0 = await rpatch(`families/${st.companyId}`, ntk, { company: { accessPolicy: { levels: { ansatt: { accessControl: 'write', economy: 'write', hr: 'write' } } } } });
  S.check(denied(rPol0.status), 'I31 Regler (bedrift uten ISO): Ansatt kan ikke skrive tilgangsmatrisen', '403', `${rPol0.status} (accessAcl-dokumenter i bedriften: ${aclList.length})`, { id: 'ANSATT-13', sev: 'Kritisk', ref: 'FL-02' });
  if (allowed(rPol0.status)) {
    const pol = (await company())?.company?.accessPolicy;
    S.info('I31b Etter Ninas skriving', `company.accessPolicy=${JSON.stringify(pol).slice(0, 160)} – tilbakestilles`);
    await rpatch(`families/${st.companyId}`, 'owner', { company: { accessPolicy: {} } });
  }
  const rMem0 = await rarray(`families/${st.companyId}`, ntk, 'members', ['fremmed-test-uid']);
  S.check(denied(rMem0.status), 'I32 Regler (bedrift uten ISO): Ansatt kan ikke legge en fremmed inn i members', '403', String(rMem0.status), { id: 'ANSATT-13', sev: 'Kritisk', ref: 'FL-02' });
  if (allowed(rMem0.status)) await rarray(`families/${st.companyId}`, 'owner', 'members', ['fremmed-test-uid'], { remove: true });

}

/** Logger inn en bot som ikke har en åpen økt i denne kjøringen. */
async function ensure(key, view) {
  if (bots[key] && (bots[key].page.isClosed() || !(await bots[key].page.evaluate(() => 1).catch(() => 0)))) {
    S.info(`Nettleseren til ${key} krasjet`, 'Starter ny økt');
    await bots[key].stop().catch(() => {});
    delete bots[key];
  }
  const fresh = !bots[key];
  const b = await bot(key, view);
  if (fresh || !(await b.page.evaluate(() => !!window.__protopBot).catch(() => false))) {
    await loginAndSettle(b, { name: st[key].name });
    await waitShell(b).catch(() => {});
  }
  return b;
}

/* ════════════════════ Fase 4: Ola (har konto og egen bedrift) godtar og bytter bedrift ════════════════════ */
async function phase4() {
  console.log('\n── Fase 4: Ola godtar og bytter mellom bedriftene ──');
  const o = await ensure('ola', 'desktop');
  const olaMember = ((await company()).members || []).includes(st.ola.uid);
  if (olaMember) S.info('I18–I22', 'Ola har allerede godtatt i en tidligere kjøring (gjenopptatt)');
  else {
    // Ola er innlogget i bedrift B. Invitasjonsvinduet kommer i økten.
    const oOverlay = await waitText(o, /Bedriftsinvitasjon/i, 30000);
    S.check(!!oOverlay && oOverlay.includes(st.company), 'I18 Ola får invitasjonsvinduet i økten han har åpen', '«Bedriftsinvitasjon» med bedrift A', oOverlay ? 'Vist' : 'Ikke vist', { shot: await shot(o, 'ola-invitasjon-vindu') });
    // Lenken i e-posten (family-invite) skal føre til samme invitasjon.
    if (st.ola.link) {
      await o.page.goto(localLink(st.ola.link), { waitUntil: 'domcontentloaded' });
      await waitShell(o).catch(() => {});
      const lt = await waitText(o, /Bedriftsinvitasjon/i, 30000) || '';
      S.check(lt.includes(st.company), 'I19 Lenken i Olas e-post åpner invitasjonen', 'Side/vindu med Godta og Avslå for bedrift A', lt ? lt.split('\n').filter((l) => /Bedrift|Godta|Avslå/i.test(l)).slice(0, 4).join(' | ') : 'Ingenting', { shot: await shot(o, 'ola-lenke') });
    }
    await o.page.getByText('Godta invitasjon', { exact: true }).last().click();
    await o.page.waitForTimeout(6000);
    await skipTour(o);
    const after = await o.visibleText();
    const stillOverlay = /Bedriftsinvitasjon/i.test(after);
    S.check(!stillOverlay, 'I20 Ola godtar', 'Vinduet lukkes', stillOverlay ? `Vinduet står: ${(after.match(/Invitasjonen er allerede besvart\.?|Kunne ikke[^\n]*/) || [''])[0]}` : 'Lukket', { shot: await shot(o, 'ola-godtatt') });
    if (stillOverlay) {
      // FamilyInviteRespond-siden og vinduet viser samme invitasjon. Det andre står igjen.
      await o.page.getByText('Godta invitasjon', { exact: true }).last().click().catch(() => {});
      await o.page.waitForTimeout(4000);
    }
    const comp2 = await company();
    const olaEmp = await employeeOf('ola');
    S.check((comp2.members || []).includes(st.ola.uid) && (comp2.adminUids || []).includes(st.ola.uid), 'I21 Ola er medlem og administrator (adminUids)', 'members + adminUids', `members=${(comp2.members || []).includes(st.ola.uid)}, adminUids=${(comp2.adminUids || []).includes(st.ola.uid)}`);
    S.check(olaEmp?.personUid === st.ola.uid && olaEmp?.company?.accessLevel === 'administrator', 'I22 Olas medarbeiderpost koblet med nivå Administrator', 'personUid=Ola, nivå administrator', `personUid=${olaEmp?.personUid === st.ola.uid}, nivå=${olaEmp?.company?.accessLevel}, status=${olaEmp?.invite?.status}`);
    // Svarsiden fra e-postlenken: «Du er med i bedriften!» + Ferdig.
    const doneTxt = await waitText(o, /Du er med i bedriften/, 8000);
    if (doneTxt) {
      S.info('I22b Bekreftelse etter Godta fra e-postlenken', '«Du er med i bedriften!» med knappen Ferdig', await shot(o, 'ola-med-i-bedriften'));
      await tap(o, 'Ferdig');
    }
    await waitShell(o).catch(() => {});
  }
  // Bytte mellom bedriftene.
  await o.page.keyboard.press('Escape').catch(() => {});
  await tapId(o, 'platform-switch-bedrift');
  await o.page.waitForTimeout(1200);
  const menu = await o.visibleText();
  const both = menu.includes(st.company) && menu.includes(st.companyB);
  S.check(both, 'I23 Bedrift-menyen viser begge bedriftene', `${st.company} og ${st.companyB}`, both ? 'Begge vises' : menu.split('\n').filter((l) => /AS$/.test(l)).join(', '), { shot: await shot(o, 'ola-bedriftsmeny') });
  if (both) {
    await o.page.getByText(st.companyB, { exact: false }).last().click();
    await o.page.waitForTimeout(4000);
    const inB = await o.visibleText();
    S.check(inB.includes(st.companyB), 'I24 Ola bytter til bedrift B', 'Skallet viser B', inB.includes(st.companyB) ? 'B' : '?', { shot: await shot(o, 'ola-i-b') });
    await tapId(o, 'platform-switch-bedrift');
    await o.page.waitForTimeout(1000);
    await o.page.getByText(st.company, { exact: false }).last().click();
    await o.page.waitForTimeout(4000);
    await skipTour(o);
    const inA = await o.visibleText();
    S.check(inA.includes(st.company), 'I25 Ola bytter tilbake til bedrift A', 'Skallet viser A', inA.includes(st.company) ? 'A' : '?', { shot: await shot(o, 'ola-i-a') });
  }
  saveState();

}

/* ════════════════════ Fase 5: Per avslår ════════════════════ */
async function phase5() {
  console.log('\n── Fase 5: Per avslår ──');
  await closeBot('nina');
  const b = await ensureOwner();
  const p = await bot('per', 'phone');
  await loginAndSettle(p, { name: st.per.name });
  await skipTour(p);
  const pOverlay = await waitText(p, /Bedriftsinvitasjon/i, 30000);
  S.check(!!pOverlay, 'I26 Per får bedriftsinvitasjonen ved innlogging', 'Vindu med Godta/Avslå', pOverlay ? 'Vist' : 'Ikke vist', { shot: await shot(p, 'per-invitasjon') });
  await p.page.getByText('Avslå', { exact: true }).last().click();
  await p.page.waitForTimeout(5000);
  const pAfter = await p.visibleText();
  S.check(!/Bedriftsinvitasjon/i.test(pAfter), 'I27 Per avslår, vinduet lukkes', 'Vinduet borte', /Bedriftsinvitasjon/i.test(pAfter) ? 'Står fortsatt' : 'Borte', { shot: await shot(p, 'per-avslatt') });
  const comp3 = await company();
  const perEmp = await employeeOf('per');
  S.check(!(comp3.members || []).includes(st.per.uid) && perEmp?.invite?.status === 'declined', 'I28 Per er ikke medlem og posten står som avslått', 'Ikke i members, invite.status=declined', `members=${(comp3.members || []).includes(st.per.uid)}, status=${perEmp?.invite?.status}`);
  // Eva ser avslaget.
  await b.open('ansatte');
  await tap(b, 'Ny ansatt').catch(() => {});
  await tap(b, 'Inviter brukere').catch(() => {});
  const ev = await waitText(b, /Avslått/, 20000) || '';
  S.check(/Avslått/.test(ev) && /Per Persen/.test(ev) && /Inviter på nytt/.test(ev), 'I29 Eva ser avslaget med «Inviter på nytt»', 'Seksjon «Avslått» med Per', /Avslått/.test(ev) ? 'Vist' : 'Ikke vist', { shot: await shot(b, 'eva-ser-avslag') });
  const notes = await listDocs(`users/${st.eier.uid}/notifications`);
  S.check(notes.some((x) => x.eventType === 'familyInviteDeclined') && notes.some((x) => x.eventType === 'familyInviteAccepted'), 'I30 Eva får varsel om godtatt og avslått', 'Varsler familyInviteAccepted og familyInviteDeclined', notes.map((x) => x.title).join(', '));
  saveState();
}

/* ════════════════════ Fase 5b: Eva inviterer Per på nytt, Per godtar ════════════════════ */
async function phase5b() {
  console.log('\n── Fase 5b: ny invitasjon etter avslag – Per godtar ──');
  const b = await ensureOwner();
  if (((await company()).members || []).includes(st.per.uid)) {
    S.info('P1–P4', 'Per er allerede medlem (gjenopptatt kjøring)');
    return;
  }
  await b.open('ansatte');
  await tap(b, 'Ny ansatt').catch(() => {});
  await tap(b, 'Inviter brukere');
  await waitText(b, /Avslått/, 15000);
  await tap(b, 'Inviter på nytt');
  const re = await waitText(b, /Invitasjonen er sendt|Kunne ikke|ikke sendt/, 40000) || '';
  S.check(/Invitasjonen er sendt/.test(re), 'P1 «Inviter på nytt» etter avslag sender ny invitasjon', 'Melding «Invitasjonen er sendt»', (re.match(/[^\n]*(Invitasjonen er sendt|Kunne ikke|ikke sendt)[^\n]*/) || ['(ingen melding)'])[0], { shot: await shot(b, 'per-inviter-pa-nytt') });
  const p = await ensure('per', 'phone');
  const ov = await waitText(p, /Bedriftsinvitasjon/i, 40000);
  S.check(!!ov, 'P2 Per får ny invitasjon etter avslaget', 'Vinduet «Bedriftsinvitasjon»', ov ? 'Vist' : 'Ikke vist', { shot: await shot(p, 'per-ny-invitasjon') });
  if (ov) {
    await p.page.getByText('Godta invitasjon', { exact: true }).last().click();
    await p.page.waitForTimeout(6000);
    const errTxt = await p.visibleText();
    if (/Bedriftsinvitasjon/i.test(errTxt)) S.check(false, 'P3 Per godtar', 'Vinduet lukkes', (errTxt.match(/[^\n]*(besvart|Kunne ikke|feil)[^\n]*/i) || ['Vinduet står'])[0], { shot: await shot(p, 'per-godta-feil') });
  }
  const perEmp = await employeeOf('per');
  const comp = await company();
  S.check((comp.members || []).includes(st.per.uid) && perEmp?.personUid === st.per.uid && perEmp?.company?.accessLevel === 'avdelingsleder', 'P4 Per er medlem som Avdelingsleder', 'members + koblet post med nivå avdelingsleder', `members=${(comp.members || []).includes(st.per.uid)}, personUid=${perEmp?.personUid === st.per.uid}, nivå=${perEmp?.company?.accessLevel}, status=${perEmp?.invite?.status}`, { shot: await shot(p, 'per-inne') });
  saveState();
}

/* ════════════════════ Fase 6: tilgang per nivå (UI og regler) ════════════════════ */
const PAGES = [
  ['selskap', null, 'Selskap (forside)'],
  ['selskap', 'innstillinger', 'Selskapsinnstillinger'],
  ['selskap', 'tilgang', 'Tilgangsstyring'],
  ['selskap', 'moduler', 'Moduler'],
  ['ansatte', null, 'Ansatte'],
  ['hr', 'lonn', 'HR – Lønn'],
  ['hr', 'personell', 'HR – Personell'],
  ['arbeid', 'timeliste', 'Timeliste'],
  ['arbeid', 'godkjenning', 'Godkjenning av timer'],
  ['okonomi', 'faktura', 'Økonomi – Faktura'],
  ['kunder', null, 'Kunder'],
  ['projects', null, 'Prosjekt'],
  ['anbud', 'tilbud', 'Anbud – Tilbud'],
  ['iso', 'oversikt', 'ISO / K-HMS'],
];

/** Sammenligner det personen får i UI med tilgangsmatrisen for nivået (standardnivåene). */
async function accessMatrix(prefix, key, b, levelId) {
  const access = await import('../../../src/access/companyAccess.js');
  const grants = access.standardGrants(levelId);
  const seen = [];
  const wrong = [];
  for (const [tab, sub, label] of PAGES) {
    const expected = access.companyTabAllowed(tab, sub, grants) ? 'allowed' : 'denied';
    const actual = await pageAccess(b, tab, sub);
    seen.push(`${label}: ${actual === 'allowed' ? 'åpen' : 'sperret'}`);
    if (actual !== expected) wrong.push(`${label} forventet ${expected === 'allowed' ? 'åpen' : 'sperret'}, fikk ${actual}`);
  }
  await b.open('selskap');
  S.check(!wrong.length, `${prefix} ${st[key].first} (${access.levelById(levelId)?.label}) ser riktige sider`, 'UI følger tilgangsmatrisen for nivået', wrong.length ? wrong.join('; ') : seen.join(', '), { shot: await shot(b, `${key}-tilgang-${levelId}`) });
  return { seen, wrong };
}

async function phase6() {
  console.log('\n── Fase 6: tilgang per nivå i UI og i reglene ──');
  const n = await ensure('nina', 'phone');
  await accessMatrix('A1', 'nina', n, 'ansatt');
  // Sperret side: hva står det?
  await pageAccess(n, 'hr', 'lonn');
  const deniedTxt = await n.visibleText();
  S.info('A2 Teksten Nina møter på en sperret side', (deniedTxt.match(/Ingen tilgang[\s\S]{0,140}/) || ['?'])[0].replace(/\n/g, ' '), await shot(n, 'nina-sperret-hr'));
  const o = await ensure('ola', 'desktop');
  await accessMatrix('A3', 'ola', o, 'administrator');

  // Reglene (REST med Ninas eget idToken).
  const eva = await token('eier');
  const nt = await token('nina');
  const hr = await rpatch(`families/${st.companyId}/hr/state`, eva, { version: 1, salaries: [{ id: 'sal-test', employeeId: st.ola.empId || 'x', amount: '812000', from: '2026-01-01' }], updatedAt: new Date().toISOString() }, { create: true });
  S.info('A4 Eva legger inn lønn i HR (eierens token)', `PATCH hr/state → ${hr.status}`);
  const rHr = await rget(`families/${st.companyId}/hr/state`, nt);
  S.check(denied(rHr.status), 'A5 Regler: Ansatt kan ikke lese hr/state (lønn)', '403', `${rHr.status}${rHr.data?.salaries ? ` – leste ${rHr.data.salaries.length} lønnslinje(r), beløp ${rHr.data.salaries[0]?.amount}` : ''}`, { id: 'ANSATT-10', sev: 'Høy', ref: 'SEC-06' });
  const rAdm = await rarray(`families/${st.companyId}`, nt, 'adminUids', [st.nina.uid]);
  S.check(denied(rAdm.status), 'A6 Regler: Ansatt kan ikke føre seg selv inn i adminUids', '403', String(rAdm.status));
  if (allowed(rAdm.status)) await rarray(`families/${st.companyId}`, 'owner', 'adminUids', [st.nina.uid], { remove: true });
  const rPar = await rpatch(`families/${st.companyId}/parents/${st.nina.uid}`, nt, { admin: true });
  S.check(denied(rPar.status), 'A7 Regler: Ansatt kan ikke sette admin:true på eget medlemsdokument', '403', String(rPar.status), { id: 'ANSATT-11', sev: 'Kritisk', ref: 'SEC-03' });
  if (allowed(rPar.status)) await rpatch(`families/${st.companyId}/parents/${st.nina.uid}`, 'owner', { admin: false });
  const ninaEmp = await employeeOf('nina');
  const rEmp = await rpatch(`families/${st.companyId}/employees/${ninaEmp.id}`, nt, { company: { accessLevels: ['administrator'], accessLevel: 'administrator', accessRole: 'Administrator' } });
  S.check(denied(rEmp.status), 'A8 Regler: Ansatt kan ikke gi seg selv nivå Administrator på egen post', '403', String(rEmp.status));
  if (allowed(rEmp.status)) await rpatch(`families/${st.companyId}/employees/${ninaEmp.id}`, 'owner', { company: { accessLevels: ['ansatt'], accessLevel: 'ansatt', accessRole: 'Ansatt' } });
  const perEmp = await employeeOf('per');
  if (perEmp) {
    const rLead = await rpatch(`families/${st.companyId}/employees/${perEmp.id}`, nt, { company: { accessLevels: ['leder'], accessLevel: 'leder', accessRole: 'Øverste leder' } });
    S.check(denied(rLead.status), 'A9 Regler: Ansatt kan ikke gi en kollega nivå Øverste leder', '403', String(rLead.status), { id: 'ANSATT-12', sev: 'Høy', ref: 'FL-02 / SEC-04' });
    if (allowed(rLead.status)) await rpatch(`families/${st.companyId}/employees/${perEmp.id}`, 'owner', { company: { accessLevels: ['avdelingsleder'], accessLevel: 'avdelingsleder', accessRole: 'Avdelingsleder' } });
  }
  // Et annet selskap (Olas bedrift B).
  const rB = await rget(`families/${st.companyBId}`, nt);
  const rBEmp = await rlist(`families/${st.companyBId}/employees`, nt);
  const rBHr = await rget(`families/${st.companyBId}/hr/state`, nt);
  S.check(denied(rB.status) && denied(rBEmp.status) && (denied(rBHr.status) || rBHr.status === 404), 'A10 Regler: Ansatt i A kan ikke lese bedrift B', '403 på B, B/employees og B/hr', `B=${rB.status}, employees=${rBEmp.status}, hr=${rBHr.status}`);
  // FL-02: tilgangsmatrisen og members i en bedrift uten ISO (ingen accessAcl).
  const acl = await rget(`families/${st.companyId}/accessAcl/${st.nina.uid}`, nt);
  const rPol = await rpatch(`families/${st.companyId}`, nt, { company: { accessPolicy: { levels: { ansatt: { accessControl: 'write', economy: 'write' } } } } });
  S.check(denied(rPol.status), 'A11 Regler: Ansatt kan ikke skrive tilgangsmatrisen når tilgangsspeilet finnes', '403', `${rPol.status} (accessAcl/${st.nina.uid}: ${acl.status})`, { id: 'ANSATT-13', sev: 'Kritisk', ref: 'FL-02' });
  if (allowed(rPol.status)) await rpatch(`families/${st.companyId}`, 'owner', { company: { accessPolicy: {} } });
  const rMem = await rarray(`families/${st.companyId}`, nt, 'members', ['fremmed-test-uid']);
  S.check(denied(rMem.status), 'A12 Regler: Ansatt kan ikke legge en fremmed inn i members', '403', String(rMem.status), { id: 'ANSATT-13', sev: 'Kritisk', ref: 'FL-02' });
  if (allowed(rMem.status)) await rarray(`families/${st.companyId}`, 'owner', 'members', ['fremmed-test-uid'], { remove: true });
  saveState();
}

/* ════════════════════ Fase 7: Eva bytter nivå (FL-08) ════════════════════ */
async function toggleLevel(b, empId, levelId) {
  const sel = `[id="employee-level-${empId}-${levelId}"]`;
  await b.page.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {});
  await b.page.locator(sel).first().click({ timeout: 8000 });
  await b.page.waitForTimeout(2500);
}

async function phase7() {
  console.log('\n── Fase 7: nivåbytte (admin → ansatt, ansatt → admin) ──');
  const b = await ensureOwner();
  const ola = await employeeOf('ola');
  const nina = await employeeOf('nina');
  await b.open('selskap', 'tilgang');
  await skipTour(b);
  await tap(b, 'Personer');
  await b.page.waitForTimeout(1500);
  await shot(b, 'tilgang-personer');
  await toggleLevel(b, ola.id, 'ansatt');
  await toggleLevel(b, ola.id, 'administrator');
  await toggleLevel(b, nina.id, 'administrator');
  await toggleLevel(b, nina.id, 'ansatt');
  await b.page.waitForTimeout(2000);
  const ola2 = await employeeOf('ola');
  const nina2 = await employeeOf('nina');
  const lv = (e) => (e?.company?.accessLevels?.length ? e.company.accessLevels : [e?.company?.accessLevel]).join('+');
  S.check(lv(ola2) === 'ansatt' && lv(nina2) === 'administrator', 'N1 Tilgangsstyring: Ola → Ansatt, Nina → Administrator', 'Ola ansatt, Nina administrator', `Ola=${lv(ola2)}, Nina=${lv(nina2)}`, { shot: await shot(b, 'tilgang-etter-bytte') });
  const comp = await company();
  S.check(!(comp.adminUids || []).includes(st.ola.uid), 'N2 Nedgradert Ola fjernes fra adminUids', 'Ola ikke i adminUids', `Ola i adminUids=${(comp.adminUids || []).includes(st.ola.uid)}`, { id: 'ANSATT-14', sev: 'Høy', ref: 'FL-08' });
  S.check((comp.adminUids || []).includes(st.nina.uid), 'N3 Oppgradert Nina legges i adminUids', 'Nina i adminUids', `Nina i adminUids=${(comp.adminUids || []).includes(st.nina.uid)}`, { id: 'ANSATT-14', sev: 'Høy', ref: 'FL-08' });
  // UI følger nivået (åpne økter).
  const o = await ensure('ola', 'desktop');
  await o.page.waitForTimeout(3000);
  await accessMatrix('N4', 'ola', o, 'ansatt');
  const n = await ensure('nina', 'phone');
  await n.page.waitForTimeout(3000);
  await accessMatrix('N5', 'nina', n, 'administrator');
  // Reglene: det som henger på adminUids.
  const ot = await token('ola');
  const nt = await token('nina');
  const oAdm = await rarray(`families/${st.companyId}`, ot, 'adminUids', ['probe-ola']);
  S.check(denied(oAdm.status), 'N6 Regler: nedgradert Ola kan ikke lenger endre adminUids', '403', String(oAdm.status), { id: 'ANSATT-14', sev: 'Høy', ref: 'FL-08' });
  if (allowed(oAdm.status)) await rarray(`families/${st.companyId}`, 'owner', 'adminUids', ['probe-ola'], { remove: true });
  const per = await employeeOf('per');
  if (per) {
    const nGive = await rpatch(`families/${st.companyId}/employees/${per.id}`, nt, { company: { accessLevels: ['administrator'], accessLevel: 'administrator', accessRole: 'Administrator' } });
    S.check(allowed(nGive.status), 'N7 Regler: ny administrator Nina kan gi en annen nivå Administrator', '200 (administrator kan gjøre alt)', String(nGive.status), { id: 'ANSATT-14', sev: 'Høy', ref: 'FL-08' });
    await rpatch(`families/${st.companyId}/employees/${per.id}`, 'owner', { company: { accessLevels: ['avdelingsleder'], accessLevel: 'avdelingsleder', accessRole: 'Avdelingsleder' } });
  }
  await closeBot('ola');
  saveState();
}

/* ════════════════════ Fase 8: Eva avslutter engasjementet ════════════════════ */
/** Kjører fn med Evas nettleser. Krasjer siden (lite minne på maskinen), startes en ny økt og fn prøves én gang til. */
async function ownerDo(fn) {
  for (let i = 0; i < 2; i += 1) {
    const b = await ensureOwner();
    try {
      return await fn(b);
    } catch (err) {
      if (i || !/crash|Target closed|has been closed/i.test(String(err?.message || err))) throw err;
      S.info('Nettleseren til eier krasjet', 'Ny økt og nytt forsøk');
    }
  }
  return null;
}

async function openPerson(b, empId, name = '') {
  // Ansatte husker personvisningen. Gå via en annen side, så listen vises.
  await b.open('selskap', null, 1000);
  await b.open('ansatte');
  await skipTour(b);
  const crumb = b.page.getByText('Ansatte', { exact: true });
  const loc = b.page.locator(`[id="employee-open-${empId}"]`);
  const visible = async () => loc.first().isVisible().catch(() => false);
  if (!(await visible()) && await crumb.count()) await crumb.first().click().catch(() => {});
  await b.page.waitForTimeout(800);
  for (const label of [/^Deaktiverte/, /^Papirkurv/]) {
    if (await visible()) break;
    const el = b.page.getByText(label);
    const n = await el.count();
    for (let i = 0; i < n; i += 1) {
      if (await el.nth(i).isVisible().catch(() => false)) { await el.nth(i).click().catch(() => {}); break; }
    }
    await b.page.waitForTimeout(800);
  }
  if (await visible()) await loc.first().click({ timeout: 10000 });
  else if (name) await b.page.getByRole('button', { name, exact: true }).last().click({ timeout: 10000 });
  else await loc.first().click({ timeout: 10000 });
  await b.page.waitForTimeout(1500);
}

async function phase8() {
  console.log('\n── Fase 8: avslutning (deaktiver, avslutt konto, sluttdato, papirkurv, sletting) ──');
  const b = await ensureOwner();
  const nina = await employeeOf('nina');
  // a) Deaktiver Nina (nå Administrator) under Innstillinger → Brukerkonto.
  await openPerson(b, nina.id);
  await tap(b, 'Innstillinger');
  await waitText(b, /Brukerkonto|Konto/, 10000);
  await tapId(b, 'employee-account-deactivate');
  await b.page.waitForTimeout(2500);
  const dTxt = await b.visibleText();
  S.check(/Deaktivert\. Personen kan ikke logge inn/.test(dTxt), 'D1 Eva deaktiverer Nina under Brukerkonto', 'Status «Deaktivert …»', (dTxt.match(/Deaktivert\.[^\n]*/) || ['?'])[0], { shot: await shot(b, 'nina-deaktivert') });
  const nEmp = await employeeOf('nina');
  S.check(nEmp?.company?.status === 'inactive', 'D2 Ninas post har status inactive', 'company.status=inactive', `status=${nEmp?.company?.status}, canLogin=${nEmp?.company?.canLogin}`);
  // Hva ser Nina i den åpne økten?
  const n = await ensure('nina', 'phone');
  await n.page.waitForTimeout(3000);
  const nPages = [];
  for (const [tab, sub, label] of [['ansatte', null, 'Ansatte'], ['selskap', null, 'Selskap'], ['arbeid', 'timeliste', 'Timeliste'], ['projects', null, 'Prosjekt']]) {
    nPages.push(`${label}: ${await pageAccess(n, tab, sub)}`);
  }
  S.check(nPages.every((x) => /denied/.test(x)), 'D3 Deaktivert Nina har ingen sider i bedriften', 'Alle bedriftssider sperret', nPages.join(', '), { shot: await shot(n, 'nina-deaktivert-ui') });
  const nTxt = await n.visibleText();
  S.check(/avsluttet|deaktivert/i.test(nTxt), 'D4 Nina får forklaring på at kontoen er avsluttet', 'Tekst om at kontoen/ansettelsen er avsluttet', (nTxt.match(/Ingen tilgang[\s\S]{0,120}/) || [nTxt.slice(0, 120)])[0].replace(/\n/g, ' '), { id: 'ANSATT-16', sev: 'Middels', ref: 'FL-16' });
  // FL-16: kan hun forlate bedriften selv? Organisasjonsoversikten («Velg organisasjon») og selskapet.
  await n.page.goto(`${BASE}/organisasjoner`, { waitUntil: 'domcontentloaded' });
  await n.page.waitForTimeout(6000);
  await skipTour(n);
  const leaveTxt = await n.visibleText();
  const listed = leaveTxt.includes(st.company);
  S.check(/Forlat|Forlate|Gå ut av bedriften|Meld deg ut/i.test(leaveTxt), 'D5 Tidligere ansatt kan forlate bedriften selv', 'Valget «Forlat bedriften»', `Ingen slik knapp på «Velg organisasjon». Bedriften står fortsatt i listen: ${listed}`, { id: 'ANSATT-16', sev: 'Middels', ref: 'FL-16', shot: await shot(n, 'nina-forlat') });
  // Reglene for den deaktiverte.
  const nt = await token('nina');
  const comp = await company();
  S.check(!(comp.members || []).includes(st.nina.uid), 'D6 Deaktivert Nina er fjernet fra members', 'Ikke i members', `i members=${(comp.members || []).includes(st.nina.uid)}`, { id: 'ANSATT-15', sev: 'Kritisk', ref: 'FL-01' });
  const rHr = await rget(`families/${st.companyId}/hr/state`, nt);
  S.check(denied(rHr.status), 'D7 Regler: deaktivert Nina kan ikke lese hr/state', '403', `${rHr.status}${rHr.data?.salaries ? ` – leste lønn ${rHr.data.salaries[0]?.amount}` : ''}`, { id: 'ANSATT-15', sev: 'Kritisk', ref: 'FL-01' });
  const rList = await rlist(`families/${st.companyId}/employees`, nt);
  S.check(denied(rList.status), 'D8 Regler: deaktivert Nina kan ikke liste ansatte', '403', `${rList.status} (${rList.count} poster)`, { id: 'ANSATT-15', sev: 'Kritisk', ref: 'FL-01' });
  const rSelf = await rpatch(`families/${st.companyId}/employees/${nina.id}`, nt, { company: { status: 'active', canLogin: true } });
  S.check(denied(rSelf.status), 'D9 Regler: deaktivert Nina kan ikke aktivere seg selv', '403', String(rSelf.status), { id: 'ANSATT-15', sev: 'Kritisk', ref: 'FL-01' });
  if (allowed(rSelf.status)) await rpatch(`families/${st.companyId}/employees/${nina.id}`, 'owner', { company: { status: 'inactive', canLogin: false } });
  // Ny innlogging: UsageRecorder kaller claimEmployeeInvite.
  await rarray(`families/${st.companyId}`, 'owner', 'adminUids', [st.nina.uid], { remove: true });
  await closeBot('nina');
  const n2 = await ensure('nina', 'phone');
  await n2.page.waitForTimeout(8000);
  const comp2 = await company();
  const par = await getDoc(`families/${st.companyId}/parents/${st.nina.uid}`);
  S.check(!(comp2.adminUids || []).includes(st.nina.uid), 'D10 Ny innlogging gir ikke deaktivert administrator adminUids tilbake', 'Nina ikke i adminUids', `adminUids har Nina=${(comp2.adminUids || []).includes(st.nina.uid)}, members=${(comp2.members || []).includes(st.nina.uid)}, parents.active=${par?.active}`, { id: 'ANSATT-15', sev: 'Kritisk', ref: 'FL-01', shot: await shot(n2, 'nina-ny-innlogging') });

  saveState();
}

/* ════════════════════ Fase 9: papirkurv og permanent sletting (FL-03) ════════════════════ */
async function phase9() {
  console.log('\n── Fase 9: papirkurv og permanent sletting ──');
  const b = await ensureOwner();
  void b;
  const nina = await employeeOf('nina');
  const n2 = await ensure('nina', 'phone');
  if (!nina) S.info('D11–D13', 'Ninas post er allerede slettet (gjenopptatt kjøring)');
  else {
  if (nina.company?.status !== 'deleted') await ownerDo(async (o) => {
    await openPerson(o, nina.id);
    await tap(o, 'Flytt til papirkurv');
    await o.page.waitForTimeout(800);
    await tap(o, 'Flytt til papirkurv').catch(() => {});
    await o.page.waitForTimeout(2500);
  });
  S.check((await employeeOf('nina'))?.company?.status === 'deleted', 'D11 Eva flytter Nina til papirkurven', 'status=deleted', `status=${(await employeeOf('nina'))?.company?.status}`, { shot: await shot(bots.eier || b, 'nina-papirkurv') });
  await n2.page.waitForTimeout(3000);
  const trashAccess = await pageAccess(n2, 'ansatte');
  S.check(trashAccess === 'denied', 'D12 Nina i papirkurven har ingen tilgang', 'Ansatte sperret', `Ansatte: ${trashAccess}`, { id: 'ANSATT-17', sev: 'Høy', ref: 'FL-03', shot: await shot(n2, 'nina-papirkurv-ui') });
  // Permanent sletting fra papirkurven.
  await ownerDo(async (o) => {
    await openPerson(o, nina.id, st.nina.name);
    await tap(o, 'Slett permanent').catch(() => {});
    await o.page.waitForTimeout(800);
    await tap(o, 'Slett permanent').catch(() => {});
    await o.page.waitForTimeout(2500);
  });
  }
  const gone = !(await employeeOf('nina'));
  if (nina) S.check(gone, 'D13 Eva sletter Nina permanent', 'Posten er borte', gone ? 'Slettet' : 'Finnes fortsatt', { shot: await shot(bots.eier, 'nina-slettet') });
  if (gone) {
    await n2.page.waitForTimeout(3000);
    const after = await pageAccess(n2, 'ansatte');
    const t = await n2.visibleText();
    const restore = /Gjenopprett min profil/.test(t);
    S.check(after === 'denied' && !restore, 'D14 Permanent slettet Nina ser ikke Ansatte og kan ikke gjenopprette seg', 'Sperret, ingen «Gjenopprett min profil»', `Ansatte: ${after}, «Gjenopprett min profil» vises=${restore}`, { id: 'ANSATT-17', sev: 'Høy', ref: 'FL-03', shot: await shot(n2, 'nina-etter-sletting') });
    if (restore) {
      // Nina har fylt ut «Min side» med e-post tidligere (det appen lagrer i users/{uid}.professionalProfile).
      await rpatch(`users/${st.nina.uid}`, await token('nina'), { professionalProfile: { person: { firstName: st.nina.first, lastName: st.nina.last, email: st.nina.email } } });
      await n2.page.reload({ waitUntil: 'domcontentloaded' });
      await waitShell(n2).catch(() => {});
      await pageAccess(n2, 'ansatte');
      await tap(n2, 'Gjenopprett min profil');
      await n2.page.waitForTimeout(3000);
      await n2.page.waitForTimeout(2000);
      const back = (await employees()).find((e) => e.personUid === st.nina.uid) || await employeeOf('nina');
      S.check(!back, 'D15 «Gjenopprett min profil» gir ikke tidligere ansatt en ny aktiv post', 'Ingen ny post', back ? `Ny post ${back.id}, status=${back.company?.status}, nivå=${back.company?.accessLevel}` : 'Ingen', { id: 'ANSATT-17', sev: 'Høy', ref: 'FL-03', shot: await shot(n2, 'nina-gjenopprettet') });
      if (back) await rpatch(`families/${st.companyId}/employees/${back.id}`, 'owner', { company: { status: 'inactive', canLogin: false } });
    }
  }

  saveState();
}

/* ════════════════════ Fase 10: «Avslutt medarbeiderkonto» (FL-18) ════════════════════ */
async function phase10() {
  console.log('\n── Fase 10: Avslutt medarbeiderkonto ──');
  const b = await ensureOwner();
  await closeBot('nina');
  const ola = await employeeOf('ola');
  await openPerson(b, ola.id);
  await tap(b, 'Innstillinger');
  await tap(b, 'Generelt');
  await waitText(b, /Avslutt medarbeiderkonto/, 10000);
  await tap(b, 'Avslutt medarbeiderkonto');
  await b.page.waitForTimeout(1500);
  const conf = await b.visibleText();
  const asked = /Er du sikker|Bekreft|Vil du avslutte/i.test(conf);
  const olaNow = await employeeOf('ola');
  const note = (conf.match(/Medarbeiderkontoen er avsluttet\.?/) || [''])[0];
  S.check(asked && olaNow?.company?.status !== 'inactive', 'D16 «Avslutt medarbeiderkonto» ber om bekreftelse', 'Bekreftelsesdialog før kontoen avsluttes', `Dialog=${asked}, status etter ett trykk=${olaNow?.company?.status}${note ? `, melding «${note}»` : ''}`, { id: 'ANSATT-18', sev: 'Middels', ref: 'FL-18', shot: await shot(b, 'ola-avslutt') });
  if (asked) {
    for (const label of ['Avslutt', 'Bekreft', 'Ja']) {
      if (await b.page.getByText(label, { exact: true }).count()) { await tap(b, label).catch(() => {}); break; }
    }
    await b.page.waitForTimeout(2000);
  }
  const oComp = await company();
  S.check(!(oComp.members || []).includes(st.ola.uid), 'D17 Avsluttet Ola er fjernet fra members', 'Ikke i members', `members=${(oComp.members || []).includes(st.ola.uid)}, adminUids=${(oComp.adminUids || []).includes(st.ola.uid)}`, { id: 'ANSATT-15', sev: 'Kritisk', ref: 'FL-01' });

  saveState();
}

/* ════════════════════ Fase 11: «Kan logge inn» og sluttdato (FL-04, FL-18) ════════════════════ */
async function phase11() {
  console.log('\n── Fase 11: Kan logge inn og Ansatt til ──');
  const b = await ensureOwner();
  const per = await employeeOf('per');
  if (per?.personUid) {
    await openPerson(b, per.id);
    await tap(b, 'Innstillinger');
    await waitText(b, /Kan logge inn/, 10000);
    await tapId(b, 'employee-account-login');
    await b.page.waitForTimeout(2000);
    const perNow = await employeeOf('per');
    S.info('D18 Eva fjerner «Kan logge inn» for Per', `company.canLogin=${perNow?.company?.canLogin}`, await shot(b, 'per-kan-ikke-logge-inn'));
    await closeBot('per');
    const p2 = await ensure('per', 'phone');
    const pAcc = await pageAccess(p2, 'ansatte');
    S.check(pAcc === 'denied' || !(await p2.visibleText()).includes(st.company), 'D19 Per uten «Kan logge inn» kommer ikke inn i bedriften', 'Ingen tilgang / ikke innlogget i bedriften', `Ansatte: ${pAcc}`, { id: 'ANSATT-19', sev: 'Høy', ref: 'FL-04', shot: await shot(p2, 'per-etter-kan-ikke-logge-inn') });
    await rpatch(`families/${st.companyId}/employees/${per.id}`, await token('eier'), { company: { canLogin: true, periodTo: '2026-01-31' } });
    await p2.page.waitForTimeout(3000);
    const pAcc2 = await pageAccess(p2, 'ansatte');
    S.check(pAcc2 === 'denied', 'D20 Per med sluttdato («Ansatt til») passert har ikke tilgang', 'Sperret etter sluttdato', `periodTo=2026-01-31, Ansatte: ${pAcc2}`, { id: 'ANSATT-18', sev: 'Middels', ref: 'FL-18', shot: await shot(p2, 'per-sluttdato') });
  }
  saveState();
}

/* ════════════════════ Kjøring ════════════════════ */
const PHASES = [phase1, phase2, phase3, phase4, phase5, phase5b, phase6, phase7, phase8, phase9, phase10, phase11];
try {
  for (let i = 0; i < PHASES.length; i += 1) {
    if (!runPhase(i + 1)) continue;
    try {
      await PHASES[i]();
    } catch (err) {
      S.record({ step: `Fase ${PHASES[i].name} stoppet`, expected: 'Fasen kjører ferdig', actual: String(err?.stack || err).slice(0, 500), ok: false, kind: 'bot' });
      for (const [k, b] of Object.entries(bots)) await b.shot(`stopp-${k}`).catch(() => {});
      console.error(err);
      // Fase 1–3 er forutsetninger for resten.
      if (i < 3) break;
    }
  }
} finally {
  for (const [k, b] of Object.entries(bots)) {
    const errs = b.errors.filter((e) => !/Calendar|CORS|listCalendarConnections|fetchExternalCalendarEvents/.test(e.message));
    if (errs.length) S.info(`JS-feil hos ${k}`, errs.slice(0, 5).map((e) => e.message.slice(0, 160)).join(' || '));
    if (b.failedCalls.length) S.info(`Feilende funksjonskall hos ${k}`, b.failedCalls.slice(0, 5).map((c) => `${c.url} ${c.status}`).join(', '));
  }
  saveState();
  S.save({ state: st });
  await closeBrowser();
}
process.exit(S.deviations.length || S.rows.some((r) => r.kind === "bot") ? 1 : 0);
