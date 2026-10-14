import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEmlText, parseMsgBuffer, prepareIntakeParts, tenderFromScan } from './intakeScan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const msgPath = join(__dirname, '../fixtures/foresporsel.msg');

const scan = tenderFromScan({
  title: 'Ressurser Rogaland',
  contactName: 'Julie Vold',
  email: 'Jv@Faber.no',
  phone: '40620649',
  amount: null,
  deadline: '',
});
assert.equal(scan.email, 'jv@faber.no');
assert.equal(scan.amount, null);
assert.equal(scan.deadline, '');

const eml = parseEmlText(`From: Kari Nordmann <kari@firma.no>
Subject: Pris på takarbeid
Content-Type: text/plain; charset=utf-8

Hei,

Kan dere gi tilbud på takarbeid i Sandnes?

Mvh Kari
`);
assert.match(eml.subject, /takarbeid/i);
assert.equal(eml.email, 'kari@firma.no');
assert.equal(eml.contactName, 'Kari Nordmann');
assert.match(eml.text, /Sandnes/);

const msgBuf = readFileSync(msgPath);
const mail = await parseMsgBuffer(msgBuf);
assert.match(mail.subject, /Forespørsel/i);
assert.match(mail.email, /@consult1\.no|@faber\.no/i);
assert.match(mail.text, /Julie Vold|byggeleder|Rogaland/i);

const dataUrl = `data:application/vnd.ms-outlook;base64,${msgBuf.toString('base64')}`;
const prepared = await prepareIntakeParts(dataUrl, 'Forespørsel.msg');
assert.equal(prepared.error, '');
assert.ok(prepared.parts.length >= 2);
assert.match(prepared.parts.map((p) => p.text || '').join('\n'), /Rogaland|byggeleder|Julie/i);
assert.ok(prepared.local?.title || prepared.local?.description);
assert.match(prepared.local?.contactName || '', /Julie Vold/i);
assert.equal(prepared.local?.email, 'jv@faber.no');
assert.match(prepared.local?.title || '', /Forespørsel/i);

const tiny = await prepareIntakeParts('data:text/plain;base64,YQ==', 'a.txt');
assert.match(tiny.error || '', /Last opp|tom/i);
const blank = Buffer.from(' '.repeat(80)).toString('base64');
const empty = await prepareIntakeParts(`data:text/plain;base64,${blank}`, 'blank.txt');
assert.match(empty.error || '', /tom/i);

console.log('functions/anbud/intakeScan.test.mjs ok');
