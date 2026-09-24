import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPdfText } from './documentText.js';
import {
  looksLikeWeeklyInfoPlan,
  parseWeeklyInfoPositions,
  parseWeeklyInfoText,
} from './weeklyInfoParse.js';

const sampleText = `
UKEPLAN FOR 4. TRINN UKE 36
Mål Fag Læringsmål
Norsk: Jeg kan lese og skrive ord med diftonger.
Informasjon til de hjemme: Leksehjelp på mandager.

Lekser
Fag Tirsdag Onsdag Torsdag Fredag
4A - husk svømmetøy. 4b - husk gymtøy, gymsko, håndkle og såpe.
Levering av lekser og postmappe.
Vi går på tur. Husk klær etter vær.
Norsk Les 15 minutter i en bok du har liggende hjemme hver dag. Skriv 3-5 setninger om Ukas Grej på ark.
Matte Gjør arket. Velg ett av de tre nivåene. Lov å gjøre flere.
Engelsk Øv på glosene: Me - meg Name - navn Years old - år gammel Like - liker
`;

assert.equal(looksLikeWeeklyInfoPlan(sampleText), true);
assert.equal(looksLikeWeeklyInfoPlan('1.økt 08.25 - 09.55 Mandag NORSK'), false);

const fromText = parseWeeklyInfoText(sampleText);
assert.ok(fromText.length >= 5, `expected >=5 from text, got ${fromText.length}`);
assert.ok(fromText.some((s) => s.kind === 'homework' && /norsk/i.test(s.title)));
assert.ok(fromText.some((s) => s.kind === 'homework' && /matte/i.test(s.title)));
assert.ok(fromText.some((s) => s.kind === 'homework' && /engelsk/i.test(s.title)));
assert.ok(fromText.some((s) => /svømmetøy/i.test(s.title) && s.prepTask));
assert.ok(fromText.every((s) => s.kind !== 'schedule_slot'), 'must not invent schedule slots');

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  __dirname,
  '../.cursor-uploads-uke36.pdf',
);
// Prefer workspace upload path used by cloud agent, else skip PDF integration.
const uploadPath = '/home/ubuntu/.cursor/projects/workspace/uploads/uke_36_d559.pdf';
let pdfBuf = null;
try {
  pdfBuf = readFileSync(uploadPath);
} catch {
  try {
    pdfBuf = readFileSync(fixturePath);
  } catch {
    pdfBuf = null;
  }
}

if (pdfBuf) {
  const extracted = await extractPdfText(pdfBuf);
  assert.equal(looksLikeWeeklyInfoPlan(extracted.text, extracted.positionedItems), true);
  assert.ok(extracted.positionedItems.some((i) => i.page === 2), 'PDF items should carry page numbers');

  const fromPos = parseWeeklyInfoPositions(extracted.positionedItems, { sourceText: extracted.text });
  assert.ok(fromPos.length >= 6, `expected >=6 from PDF positions, got ${fromPos.length}`);
  assert.ok(fromPos.filter((s) => s.kind === 'homework').length >= 3);
  assert.ok(fromPos.some((s) => s.day === 'wed' && /svømmetøy/i.test(s.title)));
  assert.ok(fromPos.some((s) => s.day === 'wed' && /gymtøy/i.test(s.title)));
  assert.ok(fromPos.some((s) => s.day === 'thu' && /levering/i.test(s.title)));
  assert.ok(fromPos.some((s) => s.day === 'fri' && /tur/i.test(s.title)));
  assert.ok(fromPos.every((s) => s.kind !== 'schedule_slot'));
  assert.ok(!fromPos.some((s) => /diftonger|læringsmål|jeg kan samtale/i.test(s.title)),
    'must not mix page-1 læringsmål into lekser');
}

console.log('weeklyInfoParse.test.mjs ok');
