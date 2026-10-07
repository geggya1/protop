import assert from 'node:assert/strict';
import { normalizeEmployee } from './model.js';
import { mergeCvReads, parseProjectSheet, parseProtopCv } from './cvText.js';

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

const currentRole = parseProtopCv(`
Geir Ove Andersen
Partner
Erfaringer
Consult1 AS
Svanholmen 7, 4313 Sandnes
Partner
2016 - d.d.
Arbeidsoppgaver
• Prosjekteringsledelse
`);
assert.equal(currentRole.experience.length, 1);
assert.equal(currentRole.experience[0].employer, 'Consult1 AS');
assert.equal(currentRole.experience[0].from, '2016');
assert.equal(currentRole.experience[0].to, '');
assert.equal(currentRole.experience[0].current, true);
assert.match(currentRole.experience[0].tasks, /Prosjekteringsledelse/);

const wrappedProject = parseProtopCv(`
Referanseprosjekter
Ny brannstasjon
Austvegen 46, 4341 Bryne, Norge
Ansvar i prosjektet Prosjektleder i
gjennomføringsfasen.
KinoKino
Kinokino, Sandnes, Norge
Kategori Offentlig næring
`);
assert.equal(wrappedProject.projects.length, 2);
assert.equal(wrappedProject.projects[0].title, 'Ny brannstasjon');
assert.match(wrappedProject.projects[0].responsibility, /gjennomføringsfasen/);
assert.equal(wrappedProject.projects[1].title, 'KinoKino');

const wrappedResponsibility = parseProtopCv(`
Referanseprosjekter
Første bygg
Adresseveien 1, 4313 Sandnes, Norge
Ansvar i prosjektet Assisterende prosjektleder,
Fremdrift og LEAN i gjennomføringsfasen.
Sandnes rådhus
Sandnes rådhus, Sandnes, Norge
Kategori Offentlig næring
`);
assert.equal(wrappedResponsibility.projects.length, 2);
assert.match(wrappedResponsibility.projects[0].responsibility, /Fremdrift og LEAN/);
assert.equal(wrappedResponsibility.projects[1].title, 'Sandnes rådhus');
assert.equal(wrappedResponsibility.projects[1].category, 'Offentlig næring');

const brokenLines = parseProtopCv(`
Referanseprosjekter
Riska bioenergisentral
Riska 1, 4313 Sandnes, Norge
Ansvar i prosjektet Byggeleder
Ivaretatt både bygg- og teknisk ledelse, ITB koordinator, med SHA
ansvar.
Iglemyr Bioenergisentral
Iglemyr 1, 4313 Sandnes, Norge
Ansvar i prosjektet Byggeleder
herunder prosjekterings ledelse, bygg- og teknisk ledelse med SHA
Lura BOAS
Lura 2, 4313 Sandnes, Norge
Ansvar i prosjektet Diverse oppgraderinger
Prosjektutvikling,
Ansvar i prosjektet plan og kontrakt
Ny brannstasjon
[Samspill]
Austvegen 46, 4341 Bryne, Norge
Kategori Offentlig
`);
assert.equal(brokenLines.projects.length, 4);
assert.equal(brokenLines.projects[0].title, 'Riska bioenergisentral');
assert.match(brokenLines.projects[0].responsibility, /Ivaretatt både bygg/);
assert.equal(brokenLines.projects[1].title, 'Iglemyr Bioenergisentral');
assert.match(brokenLines.projects[1].responsibility, /herunder prosjekterings/);
assert.equal(brokenLines.projects[2].title, 'Lura BOAS');
assert.match(brokenLines.projects[2].responsibility, /Prosjektutvikling/);
assert.equal(brokenLines.projects[3].title, 'Ny brannstasjon [Samspill]');
assert.match(brokenLines.projects[3].address, /Austvegen/);
assert.equal(brokenLines.projects[3].category, 'Offentlig');
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
      {
        title: 'Bro',
        images: ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg', 'javascript:alert(1)'],
        imageUrl: 'https://cdn.example/a.jpg',
      },
      { title: 'Feil', imageUrl: 'javascript:alert(1)' },
      { imageUrl: 'data:image/jpeg;base64,aaaa' },
    ],
  },
});
assert.deepEqual(withImage.cv.projects[0].images, ['https://cdn.example/a.jpg', 'https://cdn.example/b.jpg']);
assert.equal(withImage.cv.projects[0].imageUrl, undefined);
assert.deepEqual(withImage.cv.projects[1].images, []);
assert.deepEqual(withImage.cv.projects[2].images, ['data:image/jpeg;base64,aaaa']);
assert.equal(withImage.cv.projects[2].title, '');

const sheet = parseProjectSheet(`
Næringsbygg 7 etasjer - Eksempelfjorden (Nybygg
*Breeam
Eksempelveien 1, 0150 Oslo, Norge
Oppdragsgiver
Oppdrag AS
Periode
aug. 17 - jan. 21
Areal
m2
59 172
Prosjektsum
190 MNOK eks mva
Tiltaksklasse
3
Eksempelfjorden ILK2 finner du i den nye bydelen.
Ola Nordmann
Assisterende prosjekterings- og prosjektledelse samt fremdrifts og LEAN-ansvar.
Kontaktperson hos oppdragsgiver
Kari Nord Lie
Oppdrag AS
90011223
kari@example.no
Roller i prosjektet
• Byggeleder
• Prosjektleder
• Prosjekteringsledelse
`);
assert.match(sheet.title, /Eksempelfjorden/);
assert.match(sheet.title, /Breeam/);
assert.equal(sheet.address, 'Eksempelveien 1, 0150 Oslo, Norge');
assert.equal(sheet.client, 'Oppdrag AS');
assert.equal(sheet.period, 'aug. 17 - jan. 21');
assert.equal(sheet.area, '59 172 m2');
assert.equal(sheet.cost, '190 MNOK eks mva');
assert.equal(sheet.buildingClass, '3');
assert.match(sheet.description, /Eksempelfjorden ILK2/);
assert.equal(sheet.referenceName, 'Ola Nordmann');
assert.match(sheet.responsibility, /LEAN-ansvar/);
assert.equal(sheet.contact, 'Kari Nord Lie');
assert.equal(sheet.contactCompany, 'Oppdrag AS');
assert.equal(sheet.phone, '90011223');
assert.equal(sheet.email, 'kari@example.no');
assert.match(sheet.roles, /Byggeleder/);
assert.match(sheet.roles, /Prosjekteringsledelse/);
assert.equal(sheet.category, '');
assert.equal(sheet.object, '');
assert.equal(parseProjectSheet('Kunde\nTinfos\nPeriode\n2021'), null);

const stored = normalizeEmployee({ cv: { projects: [sheet] } });
assert.equal(stored.cv.projects[0].area, '59 172 m2');
assert.equal(stored.cv.projects[0].buildingClass, '3');
assert.equal(stored.cv.projects[0].category, '');

console.log('cvText.test.mjs: ok');
