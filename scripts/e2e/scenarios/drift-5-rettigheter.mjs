/**
 * Drift-bot 5 – rettigheter i økonomi (FL-09, FL-17) og fakturautsendelse.
 *   L = Øverste leder (økonomirolle, IKKE i adminUids), E = eier/admin,
 *   ansatt og innleid kaller funksjonene direkte med sitt eget ID-token.
 * PowerOffice er «koblet til» ved å legge inn powerOfficeClients/{id} i emulatoren
 * (ingen nett: kallet mot PowerOffice selv feiler uansett – det er en miljøbegrensning).
 *
 *   NODE_PATH=$(npm root -g) node scripts/e2e/scenarios/drift-5-rettigheter.mjs
 */
import { join } from 'node:path';
import { Bot, closeBrowser } from '../lib/bot.mjs';
import { putDoc, getDoc, callFn, mailsTo } from '../lib/emu.mjs';
import {
  Report, seedCompany, stamp, go, guard, newBot, token, clickId, osloDate, OUT,
} from './drift-lib.mjs';

const R = new Report('drift-5-rettigheter');
const SHOTS = join(OUT, '5-rettigheter');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const S = await seedCompany(`r${stamp()}`);
const C = S.companyId;
const K1 = S.customers[0];
const today = osloDate();
console.log(`Selskap ${C}`);

// En sendt faktura (nr. 1) og et utkast, laget direkte i emulatoren.
const line = {
  id: 'l1', section: 'hours', description: 'Tømrerarbeid', quantity: 10, unit: 't', unitPrice: 1000, markupPercent: 0, discountPercent: 0,
  vatCode: 'HIGH', vatPercent: 25, account: '3000', baseAmount: 10000, amountExVat: 10000, vatAmount: 2500, amountInclVat: 12500, netUnitPrice: 10000,
  timeEntryIds: [], expenseIds: [], tripIds: [], saleIds: [],
};
const base = {
  kind: 'invoice', currency: 'NOK', customerId: K1.id, customerNumber: K1.customerNumber, customerName: K1.name, orgnr: K1.orgnr,
  customerEmail: K1.invoiceEmail, customerAddress: 'Kundeveien 1, 5003 Bergen', projectId: 'prj-100', projectNumber: '100', projectName: 'Rehab Kundeveien',
  invoiceDate: today, dueDate: today, lines: [line], amountExVat: 10000, vat: 2500, amountInclVat: 12500, outstandingAmount: 12500,
  bankAccount: '12345678903', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), events: [], deliveries: [],
};
await putDoc(`families/${C}/invoices/inv-sendt-1`, {
  ...base, id: 'inv-sendt-1', invoiceNumber: '1', status: 'sent', issuedAt: new Date().toISOString(), issuedByUid: S.users.eier.uid, kid: '0100010000001',
});
await putDoc(`families/${C}/invoiceSeries/main`, { last: 1, updatedAt: new Date().toISOString() });
await putDoc(`families/${C}/invoices/inv-utkast-2`, { ...base, id: 'inv-utkast-2', invoiceNumber: '', status: 'draft', issuedAt: '' });
await putDoc(`powerOfficeClients/${C}`, {
  connected: true, env: 'demo', clientKey: '00000000-0000-0000-0000-000000000000', clientName: 'Drift Test (demo)', clientId: 'demo-1', connectedAt: new Date().toISOString(),
});

const EHF_XML = '<?xml version="1.0" encoding="UTF-8"?><Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" '
  + 'xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">'
  + '<cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>'
  + '<cbc:ID>1</cbc:ID></Invoice>';

let L; let E;
async function openInvoice(bot, aria) {
  await go(bot, 'okonomi', 'faktura', 5000);
  const row = aria === 'utkast'
    ? bot.page.locator('[role=button][aria-label^="Faktura"]').filter({ hasText: /Utkast/ }).first()
    : bot.page.locator(`[role=button][aria-label="${aria}"]`).first();
  await row.waitFor({ state: 'visible', timeout: 20000 });
  await row.click({ position: { x: 12, y: 12 } });
  await bot.page.waitForTimeout(2500);
}

try {
  L = await newBot(Bot, 'L-leder', S.users.okonomi, { outDir: SHOTS });

  /* ───── FL-09: PowerOffice-innstillinger og overføring for Øverste leder ───── */
  await guard(R, '5.01', 'PowerOffice-innstillinger', async () => {
    await go(L, 'okonomi', 'innstillinger', 5000);
    const tab = await clickId(L, 'economy-settings-tab-regnskapssystem', { timeout: 30000 }).then(() => true).catch(() => false);
    await L.page.getByText('PowerOffice Go', { exact: true }).first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});
    await sleep(3000);
    const controls = ['Koble fra', 'Bytt klient', 'Synk nå'].filter((x) => 0);
    for (const label of ['Koble fra', 'Bytt klient', 'Synk nå']) if (await L.hasText(label, { timeout: 1500 })) controls.push(label);
    await L.shot('poweroffice-innstillinger');
    // Lim inn en (falsk) klientnøkkel og trykk «Bytt klient»: serveren krever admin.
    let msg = '';
    if (controls.includes('Bytt klient')) {
      await L.fill('Klientnøkkel', '00000000-0000-0000-0000-000000000001');
      await L.click('Bytt klient');
      for (let i = 0; i < 30 && !/Bare admin/.test(msg); i += 1) {
        await sleep(2000);
        msg = ((await L.visibleText()).match(/[^\n]*Bare admin[^\n]*/) || [''])[0];
      }
    }
    R.check('5.01', 'FL-09: Øverste leder får PowerOffice-innstillinger bare hvis serveren lar ham bruke dem', !(tab && controls.length && /Bare admin/.test(msg)), {
      expected: 'Innstillingene skjult/låst for roller serveren avviser, eller serveren godtar',
      actual: `fanen vises=${tab}; knapper: ${controls.join(', ') || 'ingen'}; svar på «Bytt klient»: «${msg || 'ingen melding'}»`,
      shot: await L.shot('poweroffice-bytt-klient'),
    });
  });

  await guard(R, '5.02', 'Overfør til PowerOffice (leder)', async () => {
    await openInvoice(L, 'utkast');
    const label = await L.page.locator('[id="invoice-action-finalize"]').first().getAttribute('aria-label').catch(() => '');
    const shown = /PowerOffice/.test(label || (await L.visibleText()));
    await L.shot('utkast-poweroffice');
    let msg = '';
    if (shown) {
      await clickId(L, 'invoice-action-finalize');
      await sleep(4000);
      // Overføringen kan be om bekreftelse i en dialog.
      await clickId(L, 'invoice-send-confirm', { timeout: 4000 }).catch(() => {});
      for (let i = 0; i < 45 && !msg; i += 1) {
        await sleep(2000);
        const t = await L.visibleText();
        msg = (t.match(/[^\n]*(Bare admin|tilgang|kunne ikke|feilet)[^\n]*/i) || [''])[0];
      }
    }
    const call = L.failedCalls.find((c) => /powerOfficeTransferInvoice/.test(c.url));
    R.check('5.02', 'FL-09: Når «Overfør til PowerOffice» vises for Øverste leder, godtar serveren overføringen', !shown || !call || call.status < 400 || !/admin/i.test(call.body), {
      expected: 'Knapp skjult for roller serveren avviser, eller serveren godtar',
      actual: shown ? `knappen vises; server: ${call ? `${call.status} ${call.body.slice(0, 120)}` : 'ingen feil'}; melding: «${msg}»` : 'knappen vises ikke',
      shot: await L.shot('overfor-poweroffice'),
    });
  });

  await guard(R, '5.03', 'Server: leder vs eier', async () => {
    const tl = await callFn('powerOfficeTransferInvoice', { familyId: C, invoiceId: 'inv-utkast-2' }, await token(S.users.okonomi));
    const te = await callFn('powerOfficeTransferInvoice', { familyId: C, invoiceId: 'inv-utkast-2' }, await token(S.users.eier));
    const tp = await callFn('powerOfficeProducts', { familyId: C }, await token(S.users.okonomi));
    R.check('5.03', 'FL-09: Serveren gir Øverste leder samme rettighet som UI (overføring/produkter)', !/admin/i.test(`${tl.error?.message} ${tp.error?.message}`), {
      actual: `leder overfør: ${tl.status} ${tl.error?.message || 'ok'} · leder produkter: ${tp.status} ${tp.error?.message || 'ok'}`,
    });
    R.info('5.03b', 'Eier (admin) overfører: kallet når PowerOffice-klienten (feiler uten nett – miljø)', `${te.status} ${te.error?.message || JSON.stringify(te.result || {}).slice(0, 100)}`);
  });

  /* ───── FL-17: EHF ───── */
  await guard(R, '5.04', 'EHF i UI', async () => {
    // Uten PowerOffice: ellers skjules «Send faktura» (PowerOffice sender selv).
    await putDoc(`powerOfficeClients/${C}`, { connected: false, disconnectedAt: new Date().toISOString() });
    await L.page.reload();
    await L.waitShell();
    await openInvoice(L, 'Faktura 1');
    await clickId(L, 'invoice-action-send');
    await sleep(2000);
    // Dialogen sjekker først om kunden kan ta imot EHF, og bytter da stille til e-post.
    await sleep(10000);
    const auto = await L.page.locator('[id="invoice-channel-email"]').first().getAttribute('aria-selected').catch(() => null);
    const s1 = await L.shot('send-dialog-etter-ehf-sjekk');
    await clickId(L, 'invoice-channel-ehf', { timeout: 5000 }).catch(() => {});
    await sleep(3000);
    const t = await L.visibleText();
    const msg = (t.match(/EHF kan ikke sendes nå\n[^\n]*/) || [''])[0].replace('\n', ': ');
    R.info('5.04', 'EHF i send-dialogen (ingen nett i testmiljøet)', `byttet selv til e-post: ${auto === 'true' ? 'ja, uten forklaring' : 'nei'}; etter trykk på «Send som EHF»: «${msg || 'ingen melding'}»`, await L.shot('ehf-dialog'));
    void s1;
    await L.page.keyboard.press('Escape').catch(() => {});
  });

  await guard(R, '5.05', 'EHF avsenderorgnr', async () => {
    const res = await callFn('sendInvoiceEhf', { familyId: C, invoiceId: 'inv-sendt-1', xml: EHF_XML, senderOrgnr: '999999999' }, await token(S.users.okonomi));
    const msg = res.error?.message || '';
    const rejectedForSender = /avsender|orgnr|org\.nr/i.test(msg) && !/mangler/i.test(msg);
    R.check('5.05', 'FL-17: sendInvoiceEhf avviser avsender-orgnr som ikke er selskapets (999999999 ≠ 912345678)', rejectedForSender, {
      expected: 'Avvist på grunn av feil avsender', actual: `${res.status} ${res.error?.status || ''} «${msg}» (kom forbi kontrollene til selve sendingen)`,
    });
    const resA = await callFn('sendInvoiceEhf', { familyId: C, invoiceId: 'inv-sendt-1', xml: EHF_XML, senderOrgnr: '912345678' }, await token(S.users.innleid));
    R.check('5.05a', 'Innleid (ingen økonomitilgang) kan ikke sende EHF for selskapets faktura', /permission|tilgang|admin/i.test(`${resA.error?.status} ${resA.error?.message}`), {
      actual: `${resA.status} ${resA.error?.status || ''} «${resA.error?.message || 'ok'}»`,
    });
  });

  await guard(R, '5.06', 'Faktura-e-post fra innleid', async () => {
    const target = `svindel-${stamp()}@protop.test`;
    const res = await callFn('sendInvoiceMail', {
      familyId: C, invoiceId: 'inv-sendt-1', to: [target], subject: 'Ny bankkonto for betaling',
      text: 'Hei, vi har byttet bank. Betal faktura 1 til konto 9999.99.99999. Mvh regnskap', fromName: S.name, replyTo: target,
    }, await token(S.users.innleid));
    await sleep(1500);
    const got = mailsTo(target);
    R.check('5.06', 'Innleid kan ikke sende selskapets faktura med egen tekst og avsendernavn til en vilkårlig adresse', res.status >= 400 && !got.length, {
      expected: 'permission-denied', actual: `HTTP ${res.status} ${res.error?.message || 'ok'}; e-post fanget: ${got.length ? `${got[0].subject} → ${got[0].to.join(',')}` : 'nei'}`,
    });
  });

  await L.stop();
  L = null;
  await guard(R, '5.07', 'PowerOffice for eier', async () => {
    await putDoc(`powerOfficeClients/${C}`, { connected: true, disconnectedAt: '' });
    E = await newBot(Bot, 'E-eier', S.users.eier, { outDir: SHOTS });
    await go(E, 'okonomi', 'innstillinger', 5000);
    await clickId(E, 'economy-settings-tab-regnskapssystem', { timeout: 8000 }).catch(() => {});
    await sleep(6000);
    const t = await E.visibleText();
    R.info('5.07', 'Eier i Regnskapssystem (henter produkter fra PowerOffice – feiler uten nett)', (t.match(/[^\n]*(PowerOffice|koblet|Klient)[^\n]*/g) || []).slice(0, 3).join(' | '), await E.shot('poweroffice-eier'));
  });
} catch (e) {
  R.step('X', 'Uventet feil i boten', { ok: false, actual: e?.stack || e });
} finally {
  for (const b of [L, E]) {
    const errs = (b?.errors || []).filter((x) => !/listCalendarConnections|fetchExternalCalendarEvents|CORS policy/.test(x.message));
    if (errs.length) R.info('JS', `JS-feil hos ${b.name}`, errs.slice(0, 3).map((x) => x.message).join(' | '));
  }
  await closeBrowser();
}
process.exit(R.summary() ? 1 : 0);
