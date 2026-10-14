import assert from 'node:assert/strict';
import { extractContractText, extractEmailText } from './extractText.js';

const eml = new TextEncoder().encode([
  'From: kunde@example.com',
  'To: leverage@consult1.no',
  'Subject: Oppdragsavtale',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Hei, vedlagt er oppdragsavtalen for Consult1 AS.',
  'Honorar er 125000 eks. mva.',
].join('\r\n'));

const emailText = extractEmailText(eml);
assert.match(emailText, /Consult1 AS/);
assert.match(emailText, /125000/);

const viaContract = await extractContractText(eml, 'svar.eml', 'message/rfc822');
assert.match(viaContract, /Oppdragsavtalen/i);

console.log('extractText.email ok');
