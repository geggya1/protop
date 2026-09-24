import assert from 'node:assert/strict';
import {
  normalizeTimeString,
  normalizeDayKey,
  salvageTruncatedJson,
  extractSuggestionsFromResponse,
  parseTimetableText,
  parseTimetableLines,
  parseTimetableTokens,
  parseTimetablePositions,
} from './timetableParse.js';

assert.equal(normalizeTimeString('08.25'), '08:25');
assert.equal(normalizeTimeString('8:25'), '08:25');
assert.equal(normalizeTimeString('13:00'), '13:00');
assert.equal(normalizeTimeString(''), null);

assert.equal(normalizeDayKey('Mandag'), 'mon');
assert.equal(normalizeDayKey('fri'), 'fri');

const salvaged = salvageTruncatedJson('{"documentType":"schedule","suggestions":[{"kind":"schedule_slot","title":"NORSK (ET)","day":"mon","time":"08:25","endTime":"09:55"');
assert.equal(salvaged.suggestions.length, 1);
assert.equal(salvaged.suggestions[0].title, 'NORSK (ET)');

const salvagedPartial = salvageTruncatedJson([
  '{',
  '  "documentType": "homework",',
  '  "summary": "Delvis",',
  '  "suggestions": [',
  '    {"kind":"homework","title":"Norsk: Les 15 min","category":"lekser","confidence":0.9},',
  '    {"kind":"homework","title":"Matte: Gjør arket","category":"lekser","confidence":0.85},',
  '    {"kind":"todo","title":"Husk svømmetøy","category":"gjø',
].join('\n'));
assert.equal(salvagedPartial.partialParse, true);
assert.equal(salvagedPartial.documentType, 'homework');
assert.equal(salvagedPartial.suggestions.length, 2);
assert.equal(salvagedPartial.suggestions[0].title, 'Norsk: Les 15 min');

const fromTimetable = extractSuggestionsFromResponse({
  documentType: 'schedule',
  timetable: {
    mon: [{ subject: 'NORSK (ET)', time: '08.25', endTime: '09.55' }],
    tuesday: [{ subject: 'MATTE (HE)', time: '10:10', endTime: '11:00' }],
  },
});
assert.equal(fromTimetable.length, 2);
assert.equal(fromTimetable[0].time, '08:25');
assert.equal(fromTimetable[1].day, 'tue');

const text = `
Timeplan for 7C
Mandag Tirsdag Onsdag Torsdag Fredag
1.økt (08.25 - 09.55)
NORSK (ET) MATTE (HE) ENGELSK (ET) GYM/SVØM (HE/ET) MUSIKK/NORSK (HE)
2.økt (10.10 - 11.00)
MATTE (HE) NATURFAG (HE) FYFO (ET) SAMFUNNSFAG (KY) MATTE (HE)
`;
const parsed = parseTimetableText(text);
assert.ok(parsed.length >= 8, `expected at least 8 slots, got ${parsed.length}`);
assert.equal(parsed[0].day, 'mon');
assert.equal(parsed[0].time, '08:25');
assert.equal(parsed[0].endTime, '09:55');

const lines = parseTimetableLines(`
mon|08:25|09:55|NORSK (ET)
tue|10:10|11:00|MATTE (HE)
`);
assert.equal(lines.length, 2);
assert.equal(lines[1].day, 'tue');

const tokenParsed = parseTimetableTokens([
  'Klasse 7C', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag',
  '1.økt', '08.25 - 09.55',
  'NORSK (ET)', 'MATTE (HE)', 'ENGELSK (ET)', 'GYM/SVØM (HE/ET)', 'MUSIKK/NORSK (HE)',
  'Friminutt', '09.55 - 10.10',
  '2.økt', '10.10 - 11.00',
  'MATTE (HE)', 'NATURFAG (HE)', 'FYFO (ET)', 'SAMFUNNSFAG', '(KY)', 'MATTE (HE)',
]);
assert.equal(tokenParsed.length, 10);
assert.equal(tokenParsed[0].title, 'NORSK (ET)');
assert.equal(tokenParsed[8].title, 'SAMFUNNSFAG (KY)');
assert.equal(tokenParsed[8].day, 'thu');

const positioned = parseTimetablePositions([
  { str: 'Mandag', x: 209, y: 471 },
  { str: 'Tirsdag', x: 317, y: 471 },
  { str: 'Onsdag', x: 432, y: 471 },
  { str: 'Torsdag', x: 550, y: 471 },
  { str: 'Fredag', x: 682, y: 471 },
  { str: '4.økt', x: 74, y: 166 },
  { str: '13.00 - 14.00', x: 74, y: 149 },
  { str: 'KRLE (HE)', x: 309, y: 165 },
  { str: 'NORSK (ET)', x: 419, y: 165 },
  { str: 'Friminutt', x: 74, y: 414 },
  { str: '09.55 - 10.10', x: 74, y: 397 },
]);
const posFourth = positioned.filter((s) => s.time === '13:00');
assert.ok(!posFourth.some((s) => s.day === 'mon'));
assert.equal(posFourth.find((s) => s.day === 'tue')?.title, 'KRLE (HE)');
assert.equal(posFourth.find((s) => s.day === 'wed')?.title, 'NORSK (ET)');
assert.ok(positioned.some((s) => s.title === 'Friminutt' && s.day === 'wed' && s.time === '09:55'));

const homeworkShape = extractSuggestionsFromResponse({
  documentType: 'homework',
  todos: [
    { subject: 'Norsk', description: 'les kapittel 4', category: 'lekser', type: 'once' },
    { title: 'Matte: oppgave 3–7', category: 'lekser' },
  ],
});
assert.equal(homeworkShape.length, 2);
assert.equal(homeworkShape[0].kind, 'todo');
assert.match(homeworkShape[0].title, /Norsk.*kapittel 4/i);

console.log('timetableParse ok');
