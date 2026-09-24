import assert from 'node:assert/strict';
import {
  applyHomeworkFocusToSuggestions,
  isHomeworkFocusMode,
  homeworkIntroText,
  parseHomeworkText,
  parseHomeworkLines,
  parseLekseplanTableText,
  isHomeworkLikeSuggestion,
  extractWeekNumberFromText,
  extractYearFromHomeworkText,
  fridayOfIsoWeek,
  inferHomeworkSubjectId,
  resolveHomeworkSubjectId,
  OCR_LEKSEPLAN_PROMPT,
} from './homeworkImport.js';

assert.equal(isHomeworkFocusMode('homework'), true);
assert.equal(isHomeworkFocusMode(''), false);
assert.match(homeworkIntroText('Celine'), /Celine/);
assert.match(homeworkIntroText('Celine'), /Lekser|lekse/i);

assert.equal(extractWeekNumberFromText('Lekse uke 34'), 34);
assert.match(fridayOfIsoWeek(34, 2026), /^\d{4}-\d{2}-\d{2}$/);

const sampleText = `
Lekse uke 34

Norsk: les kapittel 4 og svar på spørsmål 1–3
Matte: oppgave 3–7 i arbeidsboka
Engelsk: 10 gloser til fredag

Mandag  Tirsdag  Onsdag
1.økt 08.25 - 09.55
NORSK   MATTE    ENGELSK
`;

const parsed = parseHomeworkText(sampleText);
assert.ok(parsed.length >= 3, `forventet minst 3 lekser, fikk ${parsed.length}`);
assert.ok(parsed.some((s) => /norsk/i.test(s.title)), 'skal finne norsk-lekse');
assert.ok(parsed.some((s) => /matte|matematikk/i.test(s.title)), 'skal finne matte-lekse');
assert.ok(parsed.every((s) => s.kind === 'homework' && s.category === 'lekser'), 'alle skal være lekser');
assert.ok(parsed.every((s) => s.dateHint), 'alle skal ha dateHint');
assert.equal(parsed.find((s) => /norsk/i.test(s.title))?.subject, 'norsk');
assert.equal(parsed.find((s) => /matte|matematikk/i.test(s.title))?.subject, 'matematikk');
assert.equal(parsed.find((s) => /engelsk/i.test(s.title))?.subject, 'engelsk');

const lines = parseHomeworkLines(`
Norsk: les kapittel 4|Norsk|2026-09-05
Matte: oppgave 3–7|Matte|2026-09-05
mon|08:25|09:55|NORSK
`);
assert.equal(lines.length, 2);
assert.equal(lines[0].title, 'Norsk: les kapittel 4');
assert.equal(lines[0].dateHint, '2026-09-05');
assert.equal(lines[0].subject, 'norsk');
assert.equal(lines[1].subject, 'matematikk');

const shaped = applyHomeworkFocusToSuggestions([
  { id: 'a', kind: 'todo', title: 'Matte: s. 12', type: 'daily', selected: true },
  { id: 'b', kind: 'event', title: 'Skolestart', time: '08:25', day: 'mon', selected: true },
  { id: 'c', kind: 'schedule_slot', title: 'Engelsk: 10 gloser', selected: true },
  { id: 'd', kind: 'todo', title: '', selected: true },
]);
assert.equal(shaped.length, 2);
assert.equal(shaped[0].id, 'a');
assert.equal(shaped[0].type, 'once');
assert.equal(shaped[0].category, 'lekser');
assert.equal(shaped[0].subject, 'matematikk');
assert.equal(shaped.find((s) => s.id === 'c').category, 'lekser');
assert.equal(shaped.find((s) => s.id === 'c').subject, 'engelsk');

const withHusk = applyHomeworkFocusToSuggestions([
  { id: 'h1', kind: 'todo', title: 'Husk svømmetøy', prepTask: true, prepWhen: 'morning', selected: true },
  { id: 'h2', kind: 'homework', title: 'Matte: Gjør arket', subject: 'Matte', selected: true },
]);
assert.equal(withHusk.length, 2);
assert.equal(withHusk.find((s) => s.id === 'h1').kind, 'todo');
assert.equal(withHusk.find((s) => s.id === 'h1').category, 'gjøremål');
assert.equal(withHusk.find((s) => s.id === 'h2').kind, 'homework');

const newLines = parseHomeworkLines(`
homework|Norsk: Les 15 minutter|Norsk||2026-09-05
todo|Husk svømmetøy||wed|2026-09-03
`);
assert.equal(newLines.length, 2);
assert.equal(newLines[0].kind, 'homework');
assert.equal(newLines[1].kind, 'todo');

assert.equal(isHomeworkLikeSuggestion({ title: 'Norsk: les kapittel 4' }), true);
assert.equal(isHomeworkLikeSuggestion({ title: 'MATTE', time: '08:25' }), false);

assert.equal(inferHomeworkSubjectId('Norsk: les kapittel 4'), 'norsk');
assert.equal(resolveHomeworkSubjectId('engelsk', 'Norsk: les kapittel 4'), 'engelsk');
assert.equal(resolveHomeworkSubjectId('Norsk', 'les kapittel 4'), 'norsk');

const keepSubject = applyHomeworkFocusToSuggestions([
  { id: 'x', kind: 'homework', title: 'Norsk: les kapittel 4', subject: 'engelsk', selected: true },
]);
assert.equal(keepSubject[0].subject, 'engelsk');

// Sande-skole LEKSEPLAN uke 36 2026 — sammenslåtte celler LESING/REGNING/SKRIVING + HUSK
const sandeLekseplan = `
LEKSEPLAN 7. klassetrinn
Navn:
Sande skole - uke 36 2026
MANDAG TIRSDAG ONSDAG TORSDAG
LESING Les teksten 'Elgen-skogens konge' som du får på eget ark. Svar på spørsmålene A og B. Oppgave C er valgfri. Svar med hel setning i Norsk leksebok
REGNING Gjør oppgavene på eget ARK. Føres fint inn i egen leksebok i matematikk. Husk å følg kriterielisten.
SKRIVING Rektors quiz. Eget svarark finner du i classroom. Denne må gjøres ferdig hjemme til torsdag (gjerne sammen med en voksen)
HUSK! 7ABC: Gym tirsdag. Husk: Gymtøy, håndkle og såpe til dusjing
7A og 7B: Svømming torsdag. Ha med badetøy, såpe, håndkle og NB! badehette. 7C: Gym
`;

const sande = parseHomeworkText(sandeLekseplan);
assert.ok(sande.length >= 4, `forventet minst 4 forslag fra Sande-lekseplan, fikk ${sande.length}`);
const lesing = sande.find((s) => /elgen/i.test(s.title));
const regning = sande.find((s) => /kriterielisten|gjør oppgavene/i.test(s.title));
const skriving = sande.find((s) => /quiz|classroom/i.test(s.title));
assert.ok(lesing, 'skal finne LESING-lekse');
assert.ok(regning, 'skal finne REGNING-lekse');
assert.ok(skriving, 'skal finne SKRIVING-lekse');
assert.equal(lesing.kind, 'homework');
assert.equal(lesing.subject, 'norsk');
assert.equal(regning.subject, 'matematikk');
assert.equal(skriving.subject, 'norsk');
assert.equal(skriving.dateHint, '2026-09-03'); // torsdag uke 36 2026
assert.equal(lesing.dateHint, '2026-09-04'); // fredag uke 36 2026
assert.ok(sande.some((s) => s.kind === 'todo' && /gym|svøm/i.test(s.title)), 'skal finne HUSK gym/svøm');

assert.equal(extractWeekNumberFromText('Sande skole - uke 36 2026'), 36);
assert.equal(extractYearFromHomeworkText('Sande skole - uke 36 2026'), 2026);
assert.equal(inferHomeworkSubjectId('LESING: Elgen'), 'norsk');
assert.equal(inferHomeworkSubjectId('REGNING: Oppgaver'), 'matematikk');
assert.equal(inferHomeworkSubjectId('SKRIVING: Quiz'), 'norsk');
assert.ok(parseLekseplanTableText(sandeLekseplan).length >= 4);

assert.match(OCR_LEKSEPLAN_PROMPT, /LESING/);
assert.match(OCR_LEKSEPLAN_PROMPT, /ren tekst|linjeskift/i);

// Typisk litt rotete OCR fra bilde — skal fortsatt parses
const messyOcr = `
LEKSEPLAN 7. klassetrinn
Sande skole - uke 36 2026
MANDAG TIRSDAG ONSDAG TORSDAG
LESING
Les teksten 'Elgen-skogens konge' som du får på eget ark. Svar på spørsmålene A og B.
REGNING
Gjør oppgavene på eget ARK. Føres fint inn i egen leksebok i matematikk.
SKRIVING
Rektors quiz. Denne må gjøres ferdig hjemme til torsdag
HUSK!
7ABC: Gym tirsdag. Husk: Gymtøy
7A og 7B: Svømming torsdag. Ha med badetøy
`;
const fromOcr = parseHomeworkText(messyOcr);
assert.ok(fromOcr.length >= 4, `OCR-lignende tekst skal gi lekser, fikk ${fromOcr.length}`);
assert.ok(fromOcr.some((s) => /elgen/i.test(s.title)));
assert.ok(fromOcr.some((s) => s.subject === 'matematikk'));

// Sande uke 37 2026 — «Bier» + «Husk å følg» må ikke bli egen HUSK-rad
const sandeUke37 = `
RESPEKT
Det er når vi viser hensyn til oss selv, andre, ting og de som bestemmer
LEKSEPLAN 7. klassetrinn
Navn:
Sande skole - uke 37 2026
MANDAG TIRSDAG ONSDAG TORSDAG
LESING
Les teksten "Bier" som du får på eget ark. Svar på spørsmålene A og B. Oppgave C er valgfri. Svar med hel setning i Norsk leksebok
REGNING
Gjør oppgavene på eget ARK. Føres fint inn i egen leksebok i matematikk. Husk å følg kriterielisten.
SKRIVING
Rektors quiz. Eget svarark finner du i classroom. Denne må gjøres ferdig hjemme til torsdag (gjerne sammen med en voksen)
HUSK!
7ABC: Gym tirsdag. Husk: Gymtøy, håndkle og såpe til dusjing
7A og 7B: Svømming torsdag. Ha med badetøy, såpe, håndkle og NB! badehette. 7C: Gym
`;
const uke37 = parseHomeworkText(sandeUke37);
assert.ok(uke37.length >= 4, `uke 37 skal gi minst 4 forslag, fikk ${uke37.length}`);
assert.ok(uke37.some((s) => /bier/i.test(s.title)), 'skal finne LESING Bier');
const regning37 = uke37.find((s) => s.subject === 'matematikk');
assert.ok(regning37, 'skal finne REGNING');
assert.match(regning37.title, /kriterielisten/i);
assert.ok(!uke37.some((s) => /^å følg/i.test(s.title)), '«Husk å følg» skal ikke bli eget gjøremål');
assert.equal(regning37.dateHint, '2026-09-11'); // fredag uke 37 2026
const quiz37 = uke37.find((s) => /quiz|classroom/i.test(s.title));
assert.equal(quiz37?.dateHint, '2026-09-10'); // torsdag uke 37
const svom = uke37.find((s) => /svøm/i.test(s.title));
assert.ok(svom, 'skal finne svømming');
assert.match(svom.title, /7A og 7B/i);
assert.ok(!uke37.some((s) => /^7B:\s*Svøm/i.test(s.title)), 'skal ikke knekke «7A og 7B» til bare 7B');

// OCR limer alt til én linje — må fortsatt parses
const runOnOcr = 'LEKSEPLAN 7. klassetrinn Sande skole - uke 37 2026 MANDAG TIRSDAG ONSDAG TORSDAG '
  + 'LESING Les teksten Bier som du får på eget ark. Svar på spørsmålene A og B. Oppgave C er valgfri. Svar med hel setning i Norsk leksebok '
  + 'REGNING Gjør oppgavene på eget ARK. Føres fint inn i egen leksebok i matematikk. Husk å følg kriterielisten. '
  + 'SKRIVING Rektors quiz. Eget svarark finner du i classroom. Denne må gjøres ferdig hjemme til torsdag '
  + 'HUSK! 7ABC: Gym tirsdag. Husk: Gymtøy 7A og 7B: Svømming torsdag. Ha med badetøy';
const runOn = parseHomeworkText(runOnOcr);
assert.ok(runOn.length >= 4, `sammenlimt OCR skal gi lekser, fikk ${runOn.length}`);
assert.ok(runOn.some((s) => /bier/i.test(s.title)));
assert.ok(runOn.some((s) => s.subject === 'matematikk' && /kriterielisten/i.test(s.title)));

console.log('homeworkImport.test.mjs ok');
