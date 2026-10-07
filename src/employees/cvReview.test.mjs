import assert from 'node:assert/strict';
import { assignProjectImages, cvDocumentFits, storeCvImages, titlesMatch, withoutInlineImages } from './cvPictures.js';
import { cutoffTitle, cvAttention } from './cvReview.js';

assert.equal(titlesMatch(
  'Ny brannstasjon, legevakt, ambulansestasjon og hjelpemiddelsentral',
  'Ny brannstasjon, legevakt, ambulansestasjon og hjelpemi-',
), true);
assert.equal(titlesMatch('KinoKino', 'ddelsent'), false);

const assigned = assignProjectImages([
  { title: 'Ny brannstasjon, legevakt og ambulansestasjon' },
  { title: 'KinoKino', images: ['https://cdn.example/allerede.jpg'] },
  { title: 'Helt annet prosjekt' },
], [
  { titleHint: 'Ny brannstasjon, legevakt, ambulansestasjon og hjelpemi-', dataUrl: 'data:image/png;base64,aaa' },
  { titleHint: 'KinoKino', dataUrl: 'data:image/png;base64,bbb' },
]);
assert.equal(assigned[0].images[0], 'data:image/png;base64,aaa');
assert.deepEqual(assigned[1].images, ['https://cdn.example/allerede.jpg']);
assert.deepEqual(assigned[2].images, []);

assert.equal(cutoffTitle('Lagårdsveien 80 Næringsbygg (Sykehus, kontor og'), true);
assert.equal(cutoffTitle('[Nybygg], *Breeam'), true);
assert.equal(cutoffTitle('KinoKino'), false);

const attention = cvAttention({
  company: { title: 'Partner' },
  person: { nationality: 'Norsk', maritalStatus: 'Ugift' },
  cv: {
    headline: 'Partner',
    summary: 'Leder prosjekter.',
    education: [{ school: 'UiS', from: '2004' }],
    experience: [{ employer: 'Consult1 AS', from: '2016', title: 'Partner' }],
    projects: [{ title: 'Lagårdsveien 80 Næringsbygg (Sykehus, kontor og', client: 'Jærentreprenør' }],
  },
});
assert.equal(attention.gaps.length, 0);
assert.ok(attention.issues.some((issue) => issue.text === 'Profilbildet mangler.'));
assert.ok(attention.issues.some((issue) => /mangler bilde/.test(issue.text)));
assert.ok(attention.issues.some((issue) => /Avkuttet tittel/.test(issue.text)));

const stored = await storeCvImages({
  id: 'emp',
  person: { photoUrl: 'data:image/png;base64,aaaa' },
  cv: { projects: [{ id: 'p1', title: 'Bro', images: ['data:image/png;base64,bbbb', 'https://cdn.example/ute.jpg'] }] },
}, async (path) => `https://cdn.example/${path}`);
assert.equal(stored.person.photoUrl, 'https://cdn.example/employees/emp/photo');
assert.deepEqual(stored.cv.projects[0].images, [
  'https://cdn.example/employees/emp/projects/p1/0',
  'https://cdn.example/ute.jpg',
]);
const heavy = {
  person: { photoUrl: `data:image/png;base64,${'a'.repeat(20)}` },
  cv: { projects: [] },
};
assert.equal(cvDocumentFits(heavy, 40), false);
const slim = withoutInlineImages(heavy);
assert.equal(slim.dropped, 1);
assert.equal(slim.employee.person.photoUrl, '');
assert.equal(cvDocumentFits(slim.employee, 200), true);

console.log('cvReview.test.mjs: ok');
