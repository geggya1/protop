/**
 * Drift-bot 2 – arbeidsflyten timer → godkjenning → fakturagrunnlag → faktura → send → kreditnota.
 *
 *   A = ansatt (fører og låser timer), L = Øverste leder/økonomi (godkjenner og fakturerer),
 *   E = eier (ferdigstiller samtidig med L for å teste nummerserien).
 * Sjekker lovpålagt innhold i PDF-en i e-posten (pdftotext), låsing av sendt faktura
 * (UI + regler via REST), nummerserien ved samtidig ferdigstilling og dobbel fakturering.
 *
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/drift-2-faktura.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { getDoc, putDoc, listDocs, mailsTo, readMails } from '../lib/emu.mjs';
import {
  Report, seedCompany, stamp, dump, go, guard, newBot, openTimesheetCell, enterHours, osloDay, osloDate,
  patchAs, getAs, rest, token, clickId, OUT,
} from './drift-lib.mjs';

const R = new Report('drift-2-faktura');
const SHOTS = join(OUT, '2-faktura');
const PDF_DIR = join(OUT, '2-faktura', 'pdf');
mkdirSync(PDF_DIR, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const S = await seedCompany(`f${stamp()}`);
const C = S.companyId;
const K1 = S.customers[0];
console.log(`Selskap ${C}`);
const today = osloDate();
const day = osloDay();
let A; let L; let E;

const invoices = async () => (await listDocs(`families/${C}/invoices`)).filter((i) => !i.id.startsWith('x'));
const entriesOf = async (empId) => (await listDocs(`families/${C}/timeEntries`)).filter((t) => t.employeeId === empId);

/** Åpner fakturaen fra listen i Økonomi → Faktura. Trykker radens første celle (kundenavnet er en lenke til Kunder). */
async function openInvoiceFromList(bot, label) {
  await go(bot, 'okonomi', 'faktura', 4500);
  const row = typeof label === 'string' && /^Faktura \d+$/.test(label)
    ? bot.page.locator(`[role=button][aria-label="${label}"]`).first()
    : bot.page.locator('[role=button][aria-label^="Faktura"]').filter({ hasText: label }).first();
  await row.waitFor({ state: 'visible', timeout: 15000 });
  await row.click({ position: { x: 12, y: 12 } });
  await bot.page.waitForTimeout(2500);
}

const norm = (t) => String(t || '').replace(/[\u00a0\u202f]/g, ' ');

/** Ferdigstill i dialogen. channel: 'email' | 'self' | null (ikke send). */
async function finalize(bot, { channel = 'email' } = {}) {
  await clickId(bot, 'invoice-action-finalize');
  await bot.page.locator('[id="invoice-send-dialog"]:visible').first().waitFor({ state: 'visible', timeout: 15000 });
  await bot.page.waitForTimeout(1500);
  if (channel === null) {
    await clickId(bot, 'invoice-send-toggle');
  } else if (channel) {
    await clickId(bot, `invoice-channel-${channel}`, { timeout: 4000 }).catch(() => {});
  }
  await bot.page.waitForTimeout(800);
  // Venter til EHF-sjekken er ferdig og knappen kan trykkes.
  await clickId(bot, 'invoice-send-confirm', { timeout: 40000 });
}

try {
  /* ───── Timer føres og låses av ansatt ───── */
  A = await newBot(Bot, 'A-ansatt', S.users.ansatt, { outDir: SHOTS });
  await go(A, 'arbeid', 'timeliste', 4500);
  await guard(R, '2.01', 'Føre timer', async () => {
    await openTimesheetCell(A, '#100 Rehab Kundeveien', day);
    await enterHours(A, '7,5', 'Riving av bad og bæring');
    const te = await entriesOf('emp-ansatt');
    R.check('2.01', 'Ansatt fører 7,5 t på #100 med beskrivelse', te.length === 1 && Number(te[0].hours) === 7.5 && te[0].description, {
      actual: te.map((t) => `${t.date} ${t.hours} «${t.description}» ${t.status}`).join(';'), shot: await A.shot('timer-fort'),
    });
  });
  await guard(R, '2.02', 'Låse timeliste', async () => {
    await A.page.getByRole('button', { name: `Lås timer til ${today}` }).click();
    await sleep(2500);
    const te = await entriesOf('emp-ansatt');
    R.check('2.02', 'Ansatt låser timelisten (sender til kontroll)', te[0]?.status === 'låst', { actual: te[0]?.status, shot: await A.shot('last') });
  });
  await A.stop();
  A = null;

  /* ───── Leder godkjenner og lager fakturagrunnlag ───── */
  L = await newBot(Bot, 'L-okonomi', S.users.okonomi, { outDir: SHOTS });
  await guard(R, '2.03', 'Godkjenning', async () => {
    await go(L, 'arbeid', 'godkjenning', 4500);
    await L.click('Kontroller');
    await L.page.waitForTimeout(2000);
    await L.shot('kontroll');
    await L.click('Godkjenn');
    await sleep(3000);
    const te = await entriesOf('emp-ansatt');
    R.check('2.03', 'Leder kontrollerer og godkjenner timelisten', te[0]?.status === 'godkjent', { actual: te[0]?.status, shot: await L.shot('godkjent') });
  });

  let invId = '';
  await guard(R, '2.04', 'Fakturagrunnlag → utkast', async () => {
    await go(L, 'okonomi', 'fakturagrunnlag', 5000);
    await L.click('T.o.m. i dag');
    await L.page.waitForTimeout(2500);
    const t = norm(await L.visibleText());
    R.check('2.04a', 'Til fakturering viser 7,5 t × 1 000 kr = 7 500 kr for #100', /7 500,00 kr/.test(t), {
      actual: (t.match(/Totalt å faktureres:[^\n]*/) || [''])[0], shot: await L.shot('til-fakturering'),
    });
    await L.page.locator('#billing-check-all').click();
    await L.page.waitForTimeout(600);
    if (await L.page.locator('#billing-approve-selected').isEnabled()) {
      await L.page.locator('#billing-approve-selected').click();
      await sleep(2500);
    }
    if (!(await L.page.locator('#billing-draft-selected').isEnabled())) {
      await L.page.locator('#billing-check-all').click().catch(() => {});
      await L.page.waitForTimeout(600);
    }
    await L.page.locator('#billing-draft-selected').click({ timeout: 8000 });
    await sleep(4000);
    const inv = await invoices();
    invId = inv[0]?.id || '';
    const te = await entriesOf('emp-ansatt');
    R.check('2.04', 'Fakturautkast lages med timelinjen og timen kobles til utkastet', inv.length === 1 && inv[0].status === 'draft' && te[0]?.invoiceId === invId, {
      actual: `utkast=${inv.length} status=${inv[0]?.status} beløp=${inv[0]?.amountExVat} timeInvoiceId=${te[0]?.invoiceId}`, shot: await L.shot('utkast'),
    });
  });

  await guard(R, '2.05', 'Ingen dobbel fakturering fra grunnlaget', async () => {
    await go(L, 'okonomi', 'fakturagrunnlag', 4500);
    await L.click('T.o.m. i dag');
    await L.page.waitForTimeout(2500);
    const t = norm(await L.visibleText());
    const open = (t.match(/Totalt å faktureres: ([^\n]*)/) || ['', ''])[1];
    R.check('2.05', 'Timer på et utkast tilbys ikke for fakturering på nytt', /^0,00 kr/.test(open) || /Ingenting å fakturere/.test(t), {
      actual: `Totalt å faktureres: ${open}`, shot: await L.shot('grunnlag-etter-utkast'),
    });
  });

  /* ───── Ferdigstill og send på e-post ───── */
  const mail0 = readMails().length;
  await guard(R, '2.06', 'Ferdigstill og send', async () => {
    await openInvoiceFromList(L, 'Kunde En AS');
    await L.shot('utkast-apnet');
    await finalize(L, { channel: 'email' });
    await sleep(9000);
    const inv = (await invoices()).find((i) => i.id === invId);
    dump('2-06-faktura-etter-sending', inv);
    R.check('2.06', 'Faktura ferdigstilles med nummer 1 og sendes på e-post', inv?.invoiceNumber === '1' && !!inv?.issuedAt && (inv?.deliveries || []).some((d) => d.channel === 'email' && d.status === 'sent'), {
      actual: `nr=${inv?.invoiceNumber} status=${inv?.status} levering=${(inv?.deliveries || []).map((d) => `${d.channel}:${d.status}`).join(',')}`,
      shot: await L.shot('ferdigstilt'),
    });
    const events = (inv?.events || []).map((e) => e.text || '').join(' | ');
    if (/PDF-arkivet feilet/.test(events)) R.info('2.06b', 'PDF-arkivet feilet (Storage i emulatoren når ikke en bøtte uten nett – miljøbegrensning)', events.slice(0, 200));
  });

  await guard(R, '2.07', 'E-post og PDF', async () => {
    const mails = mailsTo(K1.invoiceEmail).filter((m) => /Faktura/.test(m.subject));
    const mail = mails[mails.length - 1];
    R.check('2.07', 'E-post til kundens faktura-e-post er fanget med PDF-vedlegg', !!mail && (mail.raw.attachment || []).some((a) => /Faktura-1\.pdf/.test(a.name)), {
      actual: mail ? `${mail.subject} · vedlegg=${(mail.raw.attachment || []).map((a) => a.name).join(',')}` : `ingen e-post (fanget totalt ${readMails().length - mail0})`,
    });
    if (!mail) return;
    const att = (mail.raw.attachment || []).find((a) => /Faktura-1\.pdf/.test(a.name));
    const file = join(PDF_DIR, `${C}-Faktura-1.pdf`);
    writeFileSync(file, Buffer.from(att.content, 'base64'));
    const text = execFileSync('pdftotext', ['-layout', file, '-']).toString();
    writeFileSync(`${file}.txt`, text);
    const flat = text.replace(/\s+/g, ' ');
    const checks = [
      ['Fakturanummer', /FAKTURA 1\b/.test(flat)],
      ['Fakturadato', new RegExp(`Fakturadato: ${today.split('-').reverse().join('.')}`).test(flat)],
      ['Selgers navn', flat.includes(S.name)],
      ['Selgers org.nr. med «MVA»', /NO 912 345 678 MVA/.test(flat)],
      ['«Foretaksregisteret»', /Foretaksregisteret/.test(flat)],
      ['Selgers adresse', /Driftveien 7/.test(flat) && /0150 Oslo/.test(flat)],
      ['Kjøpers navn og adresse', /Kunde En AS/.test(flat) && /Kundeveien 1/.test(flat) && /5003 Bergen/.test(flat)],
      ['Leveringsdato/-periode', /Leveringsperiode: \d\d\.\d\d\.\d{4} - \d\d\.\d\d\.\d{4}/.test(flat)],
      ['Mengde og art (7,50 timer)', /7,50 TIME/.test(flat)],
      ['Beløp eks. mva 7 500,00', /7 500,00/.test(flat)],
      ['MVA 1 875,00 (25 %)', /1 875,00/.test(flat) && /25,00/.test(flat)],
      ['Sum inkl. mva 9 375,00', /9 375,00/.test(flat)],
      ['Betalingsfrist (forfall)', /Betalingsfrist: \d\d\.\d\d\.\d{4}/.test(flat)],
      ['Bankkonto og KID', /1234\.56\.78903/.test(flat) && /KID: \d+/.test(flat)],
    ];
    for (const [label, ok] of checks) R.check(`2.07-${label}`, `Faktura-PDF har lovpålagt innhold: ${label}`, ok, { actual: ok ? 'funnet' : 'mangler i PDF-teksten' });
    const lineText = (text.match(/Timer[\s\S]*?\n\s*\n([^\n]+)/) || ['', ''])[1].trim();
    R.info('2.07-beskrivelse', 'Linjeteksten på fakturaen (beskrivelse av ytelsen)', lineText.replace(/\s+/g, ' '),
      'Linjen viser den ansattes navn, ikke arbeidet («Riving av bad og bæring» står bare i timespesifikasjonen).');
  });

  /* ───── Sendt faktura er låst ───── */
  await guard(R, '2.08', 'Låst i UI', async () => {
    const t = await L.visibleText();
    const editable = /Oppdater utkast|Slett utkast|Lagre linjer/.test(t);
    R.check('2.08', 'Sendt faktura viser ikke redigering/sletting i UI', !editable, { actual: editable ? 'redigeringsknapper vises' : 'bare status-handlinger', shot: await L.shot('sendt-faktura') });
  });

  await guard(R, '2.09', 'Låst i reglene', async () => {
    const cur = (await invoices()).find((i) => i.id === invId);
    if (!cur?.issuedAt) throw new Error('fakturaen ble ikke ferdigstilt – kan ikke teste låsing');
    const tok = await token(S.users.okonomi);
    const path = `families/${C}/invoices/${invId}`;
    const r1 = await patchAs(tok, path, { amountExVat: 1, amountInclVat: 1.25 });
    const r2 = await patchAs(tok, path, { invoiceNumber: '99' });
    const r3 = await rest(tok, 'DELETE', path);
    const r4 = await patchAs(tok, path, { customerName: 'Annen kunde AS' });
    R.check('2.09', 'Reglene nekter endring av beløp, nummer, kunde og sletting av sendt faktura (REST)', [r1, r2, r3, r4].every((r) => r.status === 403), {
      expected: '403 på alle', actual: `beløp=${r1.status} nummer=${r2.status} slett=${r3.status} kunde=${r4.status}`,
    });
  });

  await guard(R, '2.10', 'Ansatt uten økonomitilgang', async () => {
    if (!(await invoices()).find((i) => i.id === invId)?.issuedAt) throw new Error('fakturaen ble ikke ferdigstilt');
    const tok = await token(S.users.ansatt);
    const path = `families/${C}/invoices/${invId}`;
    const read = await getAs(tok, path);
    const paid = await patchAs(tok, path, { status: 'paid', paidAmount: 9375, outstandingAmount: 0, paidAt: today });
    R.check('2.10a', 'Ansatt (ingen tilgang til Økonomi) kan ikke lese fakturaer via REST', read.status === 403, { expected: '403', actual: `HTTP ${read.status}` });
    R.check('2.10', 'Ansatt kan ikke markere en sendt faktura som betalt via REST', paid.status === 403, { expected: '403', actual: `HTTP ${paid.status}` });
    if (paid.status === 200) {
      await patchAs(await token(S.users.okonomi), path, { status: 'sent', paidAmount: 0, outstandingAmount: 9375, paidAt: '' });
    }
  });

  /* ───── Kreditnota ───── */
  await guard(R, '2.11', 'Kreditnota', async () => {
    await L.page.reload();
    await L.waitShell();
    await openInvoiceFromList(L, 'Faktura 1');
    await clickId(L, 'invoice-action-credit');
    await L.page.locator('[id="invoice-credit-reason"]:visible').first().fill('Feil timepris');
    await clickId(L, 'invoice-credit-release', { timeout: 3000 }).catch(() => {});
    await L.shot('kreditnota-dialog');
    await clickId(L, 'invoice-credit-confirm');
    await sleep(4000);
    let all = await invoices();
    let credit = all.find((i) => i.creditNoteForId === invId);
    if (credit && !credit.issuedAt) {
      // Kreditnotaen lages som utkast. Ferdigstill den.
      await L.shot('kreditnota-utkast');
      await finalize(L, { channel: 'email' });
      await sleep(8000);
      all = await invoices();
      credit = all.find((i) => i.creditNoteForId === invId);
    }
    const orig = all.find((i) => i.id === invId);
    dump('2-11-kreditnota', { credit, orig: { status: orig?.status, creditedAmount: orig?.creditedAmount, creditNoteIds: orig?.creditNoteIds } });
    R.check('2.11', 'Kreditnota ferdigstilles med neste nummer, negativt beløp og henviser til faktura 1', credit?.invoiceNumber === '2' && Number(credit?.amountExVat) < 0 && credit?.creditNoteForNumber === '1', {
      actual: `nr=${credit?.invoiceNumber} beløp=${credit?.amountExVat} for=${credit?.creditNoteForNumber} årsak=${credit?.creditReason}`, shot: await L.shot('kreditnota'),
    });
    R.check('2.11a', 'Opprinnelig faktura står som kreditert', orig?.status === 'credited', { actual: orig?.status });
    const mails = mailsTo(K1.invoiceEmail).filter((m) => /Kreditnota|Faktura 2|2 fra/i.test(m.subject));
    R.check('2.11b', 'Kreditnota sendt på e-post til kunden', mails.length > 0, { actual: mails.map((m) => m.subject).join(' | ') || 'ingen' });
    const te = await entriesOf('emp-ansatt');
    R.check('2.11c', 'Timene er frigitt til fakturering igjen etter kreditering (valgt «Ja»)', !te[0]?.invoiceId, { actual: `invoiceId=${te[0]?.invoiceId} status=${te[0]?.status}` });
  });

  /* ───── Nummerserie ved samtidig ferdigstilling ───── */
  await guard(R, '2.12', 'Samtidig ferdigstilling', async () => {
    const base = (await invoices()).find((i) => i.id === invId) || {};
    const line0 = (base.lines || [])[0] || { section: 'hours', unit: 't', vatCode: 'HIGH', vatPercent: 25, account: '3000', markupPercent: 0, discountPercent: 0 };
    const mk = (id, cust, amount) => ({
      ...Object.fromEntries(Object.entries(base).filter(([k]) => !['path', 'id'].includes(k))),
      id, kind: 'invoice', status: 'draft', invoiceNumber: '', issuedAt: '', issuedByUid: '', issuedByName: '', sentAt: '', sent: '', deliveries: [], events: [], kid: '',
      invoiceDate: today, dueDate: today, currency: 'NOK', projectId: 'prj-101', projectNumber: '101', projectName: 'Tilbygg Oslo',
      customerId: cust.id, customerName: cust.name, customerNumber: cust.customerNumber, orgnr: cust.orgnr, customerEmail: cust.invoiceEmail,
      creditNoteIds: [], creditNoteForId: '', creditNoteForNumber: '', creditedAmount: 0, paidAmount: 0, payments: [], timeEntryIds: [], archive: {},
      lines: [{ ...line0, id: `${id}-l1`, description: `Samtidig ${id}`, timeEntryIds: [], expenseIds: [], quantity: 1, unitPrice: amount, baseAmount: amount, amountExVat: amount, vatAmount: amount * 0.25, amountInclVat: amount * 1.25, netUnitPrice: amount }],
      amountExVat: amount, vat: amount * 0.25, amountInclVat: amount * 1.25, outstandingAmount: amount * 1.25, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
    await putDoc(`families/${C}/invoices/inv-samtidig-a`, mk('inv-samtidig-a', S.customers[1], 1111));
    await putDoc(`families/${C}/invoices/inv-samtidig-b`, mk('inv-samtidig-b', S.customers[1], 2222));
    E = await newBot(Bot, 'E-eier', S.users.eier, { outDir: SHOTS });
    await L.page.reload();
    await L.waitShell();
    await openInvoiceFromList(L, /1\s?388,75/);
    await openInvoiceFromList(E, /2\s?777,50/);
    await Promise.all([finalize(L, { channel: null }), finalize(E, { channel: null })]);
    await sleep(6000);
    const all = await invoices();
    const a = all.find((i) => i.id === 'inv-samtidig-a');
    const b = all.find((i) => i.id === 'inv-samtidig-b');
    const series = await getDoc(`families/${C}/invoiceSeries/main`);
    const numbers = all.filter((i) => i.invoiceNumber).map((i) => Number(i.invoiceNumber)).sort((x, y) => x - y);
    const uniq = new Set(numbers).size === numbers.length;
    const noGap = numbers.every((n, i) => n === i + 1);
    R.check('2.12', 'To brukere ferdigstiller samtidig: unike nummer uten hull (3 og 4)', uniq && noGap && a?.issuedAt && b?.issuedAt, {
      actual: `a=${a?.invoiceNumber} b=${b?.invoiceNumber} alle=${numbers.join(',')} teller=${series?.last}`,
      shot: await L.shot('samtidig-L'),
    });
    await E.shot('samtidig-E');
  });

  await guard(R, '2.13', 'Telleren via REST', async () => {
    const before = (await getDoc(`families/${C}/invoiceSeries/main`)) || { last: 0 };
    const tok = await token(S.users.ansatt2);
    const res = await patchAs(tok, `families/${C}/invoiceSeries/main`, { last: Number(before.last) + 100 });
    R.check('2.13', 'En ansatt uten økonomitilgang kan ikke flytte fakturatelleren (hull i nummerserien) via REST', res.status === 403, {
      expected: '403', actual: `HTTP ${res.status} (teller ${before.last} → ${(await getDoc(`families/${C}/invoiceSeries/main`))?.last})`,
    });
    if (res.status === 200) await putDoc(`families/${C}/invoiceSeries/main`, { last: Number(before.last), updatedAt: new Date().toISOString() });
  });
} catch (e) {
  R.step('X', 'Uventet feil i boten', { ok: false, actual: e?.stack || e });
} finally {
  for (const b of [A, L, E]) {
    const errs = (b?.errors || []).filter((x) => !/listCalendarConnections|CORS policy/.test(x.message));
    if (errs.length) R.info('JS', `JS-feil hos ${b.name}`, errs.slice(0, 3).map((x) => x.message).join(' | '));
    if (b?.failedCalls?.length) R.info('FN', `Feilende funksjonskall hos ${b.name}`, b.failedCalls.slice(0, 4).map((x) => `${x.url} ${x.status} ${x.body.slice(0, 80)}`).join(' | '));
  }
  await closeBrowser();
}
process.exit(R.summary() ? 1 : 0);
