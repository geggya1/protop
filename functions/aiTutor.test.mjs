import assert from 'node:assert/strict';
import {
  parseAge,
  ageFromBirthday,
  detectArithmeticProblem,
  buildMathCoachResponse,
  serverCanReveal,
} from './tutorMath.js';
import { localTutorFallback } from './tutorLocal.js';

assert.equal(parseAge(9), 9);
assert.equal(parseAge(3), null);
assert.equal(ageFromBirthday('2017-03-01', new Date('2026-09-14')), 9);

const p = detectArithmeticProblem('324x9');
assert.ok(p);
assert.equal(p.a, 324);
assert.equal(p.b, 9);
assert.equal(p.op, '×');
assert.ok(detectArithmeticProblem('324 × 9'));
assert.equal(detectArithmeticProblem('hei'), null);

const pow = detectArithmeticProblem('5^2');
assert.ok(pow);
assert.equal(pow.op, '^');
assert.equal(pow.a, 5);
assert.equal(pow.b, 2);
assert.ok(detectArithmeticProblem('5²'));

const start = buildMathCoachResponse({
  problem: p,
  action: 'start',
  hintLevel: 0,
  age: 9,
  allowFasit: true,
});
assert.match(start.message, /Først|deler|300/i);
assert.match(start.questionToStudent, /300\s*×\s*9/);
assert.equal(start.steps[0].status, 'current');
assert.doesNotMatch(start.message, /2916|2700/);
assert.equal(start.finalAnswer, null);
assert.equal(start.subject, 'matematikk');
assert.ok(Array.isArray(start.boardSteps));
assert.ok(start.boardSteps.length >= 2);
assert.ok(start.boardSteps.some((b) => b.kind === 'ask'));

const hint = buildMathCoachResponse({
  problem: p,
  action: 'hint',
  hintLevel: 1,
  age: 9,
  allowFasit: true,
});
assert.ok(hint.hintLevel >= 2);

const revealBlocked = buildMathCoachResponse({
  problem: p,
  action: 'reveal',
  hintLevel: 0,
  age: 9,
  allowFasit: true,
  attemptCount: 0,
});
assert.equal(revealBlocked.finalAnswer, null);
assert.equal(serverCanReveal({ allowFasit: true, hintLevel: 0, attemptCount: 0 }), false);

const reveal = buildMathCoachResponse({
  problem: p,
  action: 'reveal',
  hintLevel: 3,
  age: 9,
  allowFasit: true,
  attemptCount: 2,
});
assert.match(String(reveal.finalAnswer), /2916/);
assert.match(String(reveal.finalAnswer), /300\s*×\s*9\s*=\s*2700/);
assert.equal(reveal.missionAccomplished, true);
assert.ok(reveal.boardSteps.length >= 3);

const noFasit = buildMathCoachResponse({
  problem: p,
  action: 'reveal',
  hintLevel: 3,
  age: 9,
  allowFasit: false,
});
assert.equal(noFasit.finalAnswer, null);

const powerStart = buildMathCoachResponse({
  problem: pow,
  action: 'start',
  hintLevel: 0,
  age: 10,
  allowFasit: true,
});
assert.match(powerStart.message, /potens|ganges|multiplikasjon/i);
assert.ok(powerStart.boardSteps.some((b) => /5\^2/.test(b.expression)));
assert.equal(powerStart.finalAnswer, null);

const powerReveal = buildMathCoachResponse({
  problem: pow,
  action: 'reveal',
  hintLevel: 3,
  age: 10,
  allowFasit: true,
  attemptCount: 2,
});
assert.match(String(powerReveal.finalAnswer), /25/);
assert.ok(powerReveal.boardSteps.some((b) => /5\s*×\s*5/.test(b.expression)));

const researchStart = localTutorFallback({
  message: 'Finn fakta på internett om isbjørnen og klimaet',
  subject: 'naturfag',
  action: 'start',
  hintLevel: 0,
  age: 9,
  allowFasit: true,
});
assert.doesNotMatch(researchStart.message, /hva tror|spør om|Ingen fare|forenkle/i);
assert.match(researchStart.message, /søkeord|stikkord/i);
assert.ok(researchStart.boardVisible >= 2);
assert.ok(researchStart.boardSteps.length >= 4);

const researchReply = localTutorFallback({
  message: 'isbjørn klima',
  subject: 'naturfag',
  action: 'reply',
  hintLevel: 1,
  age: 9,
  allowFasit: true,
  history: [
    { role: 'user', text: 'Finn fakta på internett om isbjørnen' },
    { role: 'assistant', text: 'Skriv søkeord' },
  ],
});
assert.ok(researchReply.boardVisible > researchStart.boardVisible);
assert.doesNotMatch(researchReply.message, /hva tror.*oppgaven spør/i);

const researchReveal = localTutorFallback({
  message: 'Finn fakta på internett om isbjørnen',
  subject: 'naturfag',
  action: 'reveal',
  hintLevel: 3,
  age: 9,
  allowFasit: true,
  attemptCount: 3,
});
assert.equal(researchReveal.canRevealAnswer, true);
assert.ok(researchReveal.finalAnswer);
assert.match(String(researchReveal.finalAnswer), /søkeord|fremgangsmåte|kilde/i);
assert.doesNotMatch(String(researchReveal.message + researchReveal.finalAnswer), /uten AI|AI ikke|AI-tilkobling|utilgjengelig/i);

const factReveal = localTutorFallback({
  message: 'Hva er hovedstaden i Norge?',
  subject: 'samfunnsfag',
  action: 'reveal',
  hintLevel: 3,
  age: 10,
  allowFasit: true,
  attemptCount: 3,
});
assert.equal(factReveal.canRevealAnswer, true);
assert.match(String(factReveal.finalAnswer), /Oslo/i);
assert.doesNotMatch(String(factReveal.message), /AI/i);

const mathRevealLocal = localTutorFallback({
  message: '12 × 4',
  action: 'reveal',
  hintLevel: 3,
  age: 9,
  allowFasit: true,
  attemptCount: 2,
});
assert.equal(mathRevealLocal.canRevealAnswer, true);
assert.match(String(mathRevealLocal.finalAnswer), /48/);

const textStuck = localTutorFallback({
  message: 'Skriv en tekst om vennskap',
  subject: 'norsk',
  action: 'stuck',
  hintLevel: 1,
  age: 8,
});
assert.doesNotMatch(textStuck.message, /Ingen fare|forenkle|hva .* spør om/i);
assert.match(textStuck.message, /setning|stikkord|skriv/i);
assert.ok(textStuck.boardVisible >= 2);

const simpleMathQ = buildMathCoachResponse({
  problem: detectArithmeticProblem('12+5'),
  action: 'start',
  hintLevel: 0,
  age: 8,
  allowFasit: true,
});
assert.doesNotMatch(simpleMathQ.questionToStudent || '', /tror du .* spør om/i);

console.log('aiTutor pedagogy tests ok');

console.log('aiTutor.test.mjs ok');
