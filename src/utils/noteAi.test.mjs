import assert from 'node:assert/strict';
import { structuredNoteBody, stripUnwantedNoteSections } from './noteAi.js';

assert.equal(
  structuredNoteBody({ body: 'Vi møtes klokka sju.' }),
  'Vi møtes klokka sju.',
);

assert.equal(
  structuredNoteBody({
    summary: 'Kort',
    keyPoints: ['A', 'B'],
    transcript: 'rå tekst her',
  }),
  'Kort',
);

assert.equal(
  structuredNoteBody({
    body: '',
    keyPoints: ['Skal ikke med'],
    transcript: 'Skal heller ikke med',
  }),
  '',
);

const withExtras = stripUnwantedNoteSections(
  'Fin tekst.\n\n## Nøkkelpunkter\n\n- a\n- b\n\n## Transkripsjon\n\nrå rå',
);
assert.equal(withExtras, 'Fin tekst.');

assert.equal(
  structuredNoteBody({
    body: 'Hei.\n\n## Nøkkelpunkter\n\n- x\n\n## Transkripsjon\n\nyy',
  }),
  'Hei.',
);

console.log('noteAi.test.mjs: ok');
