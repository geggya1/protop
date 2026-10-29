import assert from 'node:assert/strict';
import {
  categoryLabel,
  defaultCompanyPage,
  formatOrgNumber,
  formatPhone,
  movePageModule,
  normalizeCompanyPage,
  openingStatus,
  presentNewsPost,
  publicStaff,
  safeWebUrl,
  setPageModuleColumn,
  shortCompanyName,
  shownAbout,
  shownContact,
  shownTagline,
  togglePageModule,
  videoPreview,
  visibleModules,
} from './companyPage.js';

const page = defaultCompanyPage();
assert.deepEqual(visibleModules(page, 'main').map((row) => row.id), ['about', 'news', 'explore']);
assert.deepEqual(visibleModules(page, 'side').map((row) => row.id), ['facts', 'hours', 'contact', 'jobs']);
assert.equal(visibleModules(page, 'main').some((row) => row.id === 'registers'), false);

const hidden = togglePageModule(page, 'jobs');
assert.equal(visibleModules(hidden, 'side').some((row) => row.id === 'jobs'), false);
const shown = togglePageModule(hidden, 'registers');
assert.equal(visibleModules(shown, 'main')[0].id, 'about');
assert.equal(visibleModules(shown, 'main').some((row) => row.id === 'registers'), true);

const moved = movePageModule(page, 'news', -1);
assert.deepEqual(visibleModules(moved, 'main').map((row) => row.id), ['news', 'about', 'explore']);
assert.equal(movePageModule(page, 'about', -1).modules[0].id, 'about');

const parked = setPageModuleColumn(page, 'news', 'side');
assert.equal(visibleModules(parked, 'main').some((row) => row.id === 'news'), false);
assert.equal(visibleModules(parked, 'side').at(-1).id, 'news');

const custom = normalizeCompanyPage({
  tagline: '  Eiendom og investering  ',
  coverUrl: 'javascript:alert(1)',
  website: 'consult1.no',
  modules: [{ id: 'contact', column: 'main', visible: true }, { id: 'nope', visible: true }],
  highlights: [{ id: 'kompetanse', title: 'Fag', text: 'Bredt' }],
  services: [{ title: 'Rådgivning', text: 'Hele løpet', imageUrl: 'https://cdn.example/a.jpg' }],
  jobs: { text: 'Bli med', url: 'not a url' },
});
assert.equal(custom.tagline, 'Eiendom og investering');
assert.equal(custom.coverUrl, '');
assert.equal(custom.website, 'https://consult1.no');
assert.equal(custom.jobs.url, '');
assert.equal(custom.modules[0].id, 'contact');
assert.equal(custom.modules.some((row) => row.id === 'about'), true);
assert.equal(custom.highlights[0].title, 'Fag');
assert.equal(custom.highlights.length, 1);
assert.equal(custom.services[0].imageUrl, 'https://cdn.example/a.jpg');
assert.equal(normalizeCompanyPage(custom).tagline, custom.tagline);

assert.equal(formatOrgNumber('916538804'), '916 538 804');
assert.equal(formatPhone('52055210'), '52 05 52 10');
assert.equal(shortCompanyName('CONSULT1 AS'), 'CONSULT1');
assert.equal(shownTagline(custom, { organisasjonsform: 'Aksjeselskap' }), 'Eiendom og investering');
assert.equal(shownTagline(defaultCompanyPage(), {
  naeringer: [{ beskrivelse: 'Eiendom' }, { beskrivelse: 'Konsulent' }],
}), 'Eiendom · Konsulent');
assert.equal(shownAbout(defaultCompanyPage(), { formaal: ['Bygg og anlegg.'] }), 'Bygg og anlegg.');
assert.deepEqual(shownContact(custom, { telefon: '1', epostadresse: 'a@b.no' }, {}, 'Gate 1'), {
  phone: '1',
  email: 'a@b.no',
  website: 'https://consult1.no',
  address: 'Gate 1',
});

const wednesday = new Date(2026, 9, 14, 10, 30, 0);
const sunday = new Date(2026, 9, 18, 12, 0, 0);
const evening = new Date(2026, 9, 14, 18, 0, 0);
assert.equal(openingStatus(page.hours, wednesday).label, 'Åpent nå');
assert.equal(openingStatus(page.hours, sunday).open, false);
assert.equal(openingStatus(page.hours, evening).label, 'Stengt');

assert.equal(categoryLabel('baerekraft'), 'Bærekraft');
assert.deepEqual(presentNewsPost({
  title: 'Nytt prosjekt i Sandnes',
  body: 'Nytt prosjekt i Sandnes\nVi er stolte av å bistå.',
  category: 'prosjekt',
  imageUrl: 'https://cdn.example/news.jpg',
}), {
  title: 'Nytt prosjekt i Sandnes',
  excerpt: 'Vi er stolte av å bistå.',
  category: 'prosjekt',
  imageUrl: 'https://cdn.example/news.jpg',
});
assert.equal(presentNewsPost({ body: 'Bare en setning' }).title, 'Bare en setning');
// Formatering (## og **) vises ikke i kortene.
assert.deepEqual(
  (({ title, excerpt }) => ({ title, excerpt }))(presentNewsPost({ body: '## Ny avtale\n**Vi** har signert.\n\n- Fem år' })),
  { title: 'Ny avtale', excerpt: 'Vi har signert. • Fem år' },
);
assert.equal(videoPreview('https://youtu.be/abcdefghijk').thumb.includes('abcdefghijk'), true);
assert.equal(videoPreview(''), null);
assert.equal(safeWebUrl('javascript:alert(1)'), '');

assert.deepEqual(publicStaff([
  { id: '1', person: { firstName: 'Ada', lastName: 'Nord' }, company: { title: 'Rådgiver', status: 'active' } },
  { id: '2', person: { firstName: 'Bo' }, company: { status: 'former' } },
]), [{ id: '1', name: 'Ada Nord', title: 'Rådgiver' }]);

console.log('companyPage.test.mjs ok');
