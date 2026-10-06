import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readProjectTable } from './projectImport.js';

const csv = [
  'Prosjekt;Prosjektbilde;Adresse;Kategori;Objekt;Periode;Kostnad;Kunde;Kontakt;Telefon;E-post;Arbeidsgiver i perioden;Roller i prosjektet',
  'Flateland Kraftverk;https://cdn.example/kraftverk.jpg;Flatelandsveien 211;Entreprenør;Energi;aug. 21 - mai 24;350 mill;Tinfos AS;Eirik Smedstad;518000;eirik@t infos.no;TINFOS AS;Byggeleder',
  ';;;;;;;;;uten tittel;;',
  'Bamble;;Tangvall;Privat næring;Næring;feb. 21 - apr. 22;40 mill;Seabrokers;Svein;92 41 83 99;;;',
].join('\n');

const projects = await readProjectTable(new TextEncoder().encode(csv), 'prosjekter.csv');
assert.equal(projects.length, 2);
assert.equal(projects[0].title, 'Flateland Kraftverk');
assert.equal(projects[0].imageUrl, 'https://cdn.example/kraftverk.jpg');
assert.equal(projects[0].address, 'Flatelandsveien 211');
assert.equal(projects[0].cost, '350 mill');
assert.equal(projects[0].email, 'eirik@tinfos.no');
assert.equal(projects[0].phone, '518000');
assert.equal(projects[0].employer, 'TINFOS AS');
assert.equal(projects[0].roles, 'Byggeleder');
assert.equal(projects[0].source, 'excel');
assert.equal(projects[0].link.owner, 'person');
assert.equal(projects[0].link.companyProjectId, '');
assert.equal(projects[1].phone, '92 41 83 99');

await assert.rejects(
  () => readProjectTable(new TextEncoder().encode('Kunde;Periode\nTinfos;2021\n'), 'tom.csv'),
  /prosjektnavn/,
);

const screen = readFileSync(new URL('../../screens/employees/EmployeesScreen.jsx', import.meta.url), 'utf8');
assert.match(screen, /Importer prosjekter/);
assert.match(screen, /readProjectTable/);
const schema = readFileSync(new URL('./schema.js', import.meta.url), 'utf8');
assert.match(schema, /title: 'Prosjekter'/);
assert.match(schema, /Prosjektbilde/);
assert.match(schema, /bedriftens prosjektregister/);
assert.match(screen, /chooseProjectImage/);
assert.match(screen, /projects\/\$\{projectId\}/);

console.log('projectImport.test.mjs: ok');
