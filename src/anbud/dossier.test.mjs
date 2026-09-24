import assert from 'node:assert/strict';
import { fetchNoticeDossier, summarizeNotice } from './dossier.js';

const sample = summarizeNotice({
  id: '2026-1',
  heading: 'Skole',
  description: 'Ny skole',
  buyer: [{ name: 'Kommune' }],
  competitionDocsUrl: 'https://permalink.mercell.com/1.aspx',
  directCpvCodes: ['45000000'],
  eform: [
    { label: 'Type prosedyre', value: 'Åpen', sections: null },
    { label: 'Frist for å be om tilleggsopplysninger', value: '12.10.2026 12:00', sections: null },
    { label: 'Sources of grounds for exclusion', value: 'document-used-in-public-procurement.epo-acc-espd-request', sections: null },
  ],
});
assert.equal(sample.procedure, 'Åpen');
assert.equal(sample.questionDeadline, '12.10.2026 12:00');
assert.match(sample.espd, /espd/i);
assert.equal(sample.documents[0].url, 'https://permalink.mercell.com/1.aspx');

const live = await fetchNoticeDossier('2026-114937');
assert.equal(live.ok, true);
assert.match(live.dossier.buyer, /Sortland/);
assert.ok(live.dossier.documentsUrl);
assert.ok(live.dossier.submissionDeadline);
console.log(`${live.dossier.title} · ${live.dossier.procedure} · spørsmål ${live.dossier.questionDeadline}`);
