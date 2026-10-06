import assert from 'node:assert/strict';
import { normalizeEmployee } from './model.js';
import { mergeCvReads, parseProtopCv } from './cvText.js';

const sample = `
CURRICULUM VITAE
Titi Alexandru Georgescu
Prosjekt- og byggeleder
Profil
Født 6.4.1980
Sivil status Gift
Nasjonalitet Norsk
Språk Norsk, Engelsk,
1 / 8
-- 1 of 8 --
Utdanning
2018 - 2022 Fagskolen i Agder - Bygg og anlegg
Kurs
04. 2017 U3 Betongarbeider for produksjonsleder,
formann/bas
11. 2004 Dokumentert opplæring Modul 4,
15.
Erfaringer
Consult1 Sør
Gravane 18 , Kristiansand
Prosjektleder, Byggeleder
2021 - -
Arbeidsoppgaver
• Byggeleder
Veidekke Anlegg 2019 - 2021
Postboks 506 Skøyen, 0214 Oslo
Armering bas
Lyngdal Armering & Betong AS
Skromoen , Lyngdal
Daglig leder
2013 - 2015
Arbeidsoppgaver
• Produksjonsansvar og samkjøring med
forskjellige byggeplasser)
Referanseprosjekter
Flateland Kraftverk
Flatelandsveien 211, Evje, Norge
Kategori Entreprenør
Objekt Energi
Periode aug. 21 - mai 24
Kostnad 350 mill
Kunde Tinfos AS
Kontakt Eirik Smedstad
Telefon 99115007
Epost eirik.smedstad@t infos.no
Arbeidsgiver i periodenTINFOS AS
Roller i prosjektet Byggeleder,
Bamble Kombinasjonsbygg
Tangvall, Norge
Kategori Privat Næring
Periode feb. 21 - apr. 22
Telefon 518000
Epost svein.kverme@sea brokers.no
Arbeidsgiver i periodenCONSULT1 SØR AS
Roller i prosjektet
Neste prosjekt
E8, Tromsø, Norge
Kategori Offentlig næring
Periode des. 17 - mai 19
Telefon 92 41 83 99
Epost
`;

const cv = parseProtopCv(sample);
assert.equal(cv.firstName, 'Titi');
assert.equal(cv.middleName, 'Alexandru');
assert.equal(cv.lastName, 'Georgescu');
assert.equal(cv.headline, 'Prosjekt- og byggeleder');
assert.equal(cv.birthDate, '6.4.1980');
assert.equal(cv.maritalStatus, 'Gift');
assert.equal(cv.nationality, 'Norsk');
assert.equal(cv.language, 'Norsk, Engelsk');
assert.equal(cv.education[0].school, 'Fagskolen i Agder');
assert.equal(cv.education[0].program, 'Bygg og anlegg');
assert.equal(cv.courses.length, 2);
assert.match(cv.courses[0].title, /formann\/bas/);
assert.match(cv.courses[1].title, /15\.$/);
assert.equal(cv.experience.length, 3);
assert.equal(cv.experience[0].current, true);
assert.equal(cv.experience[0].to, '');
assert.equal(cv.experience[0].title, 'Prosjektleder, Byggeleder');
assert.equal(cv.experience[1].employer, 'Veidekke Anlegg');
assert.equal(cv.experience[1].from, '2019');
assert.equal(cv.experience[1].to, '2021');
assert.match(cv.experience[1].place, /Postboks 506/);
assert.equal(cv.experience[1].title, 'Armering bas');
assert.equal(cv.experience[2].place, 'Skromoen , Lyngdal');
assert.equal(cv.experience[2].title, 'Daglig leder');
assert.match(cv.experience[2].tasks, /forskjellige byggeplasser\)/);
assert.equal(cv.projects.length, 3);
assert.equal(cv.projects[0].address, 'Flatelandsveien 211, Evje, Norge');
assert.equal(cv.projects[0].email, 'eirik.smedstad@tinfos.no');
assert.equal(cv.projects[0].employer, 'TINFOS AS');
assert.equal(cv.projects[0].roles, 'Byggeleder');
assert.equal(cv.projects[0].source, 'cv');
assert.equal(cv.projects[0].link.owner, 'person');
assert.equal(cv.projects[0].link.companyProjectId, '');
assert.equal(cv.projects[1].phone, '518000');
assert.equal(cv.projects[1].email, 'svein.kverme@seabrokers.no');
assert.equal(cv.projects[2].title, 'Neste prosjekt');
assert.equal(cv.projects[2].phone, '92 41 83 99');

const merged = mergeCvReads(cv, {
  projects: [
    { title: 'Flateland Kraftverk', period: 'aug. 21 - mai 24', responsibility: 'Fremdrift' },
    { title: 'Ny bru', period: '2020', client: 'Statens vegvesen' },
  ],
});
assert.equal(merged.projects.length, 4);
assert.equal(merged.projects[0].email, 'eirik.smedstad@tinfos.no');
assert.equal(merged.projects[0].responsibility, 'Fremdrift');
assert.equal(merged.projects[3].title, 'Ny bru');

const promoted = normalizeEmployee({
  cv: {
    projects: [{
      title: 'Bro',
      source: 'excel',
      link: { owner: 'company', companyProjectId: 'prj_1' },
    }],
  },
});
assert.equal(promoted.cv.projects[0].source, 'excel');
assert.equal(promoted.cv.projects[0].link.owner, 'company');
assert.equal(promoted.cv.projects[0].link.companyProjectId, 'prj_1');

const withImage = normalizeEmployee({
  cv: {
    projects: [
      { title: 'Bro', imageUrl: 'https://cdn.example/bro.jpg' },
      { title: 'Feil', imageUrl: 'javascript:alert(1)' },
      { imageUrl: 'data:image/jpeg;base64,aaaa' },
    ],
  },
});
assert.equal(withImage.cv.projects[0].imageUrl, 'https://cdn.example/bro.jpg');
assert.equal(withImage.cv.projects[1].imageUrl, '');
assert.equal(withImage.cv.projects[2].imageUrl, 'data:image/jpeg;base64,aaaa');
assert.equal(withImage.cv.projects[2].title, '');

console.log('cvText.test.mjs: ok');
