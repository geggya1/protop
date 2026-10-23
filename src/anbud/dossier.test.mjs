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
    { label: 'Internett-adresse', value: 'https://kommune.example/', sections: null },
    { label: 'Sources of grounds for exclusion', value: 'document-used-in-public-procurement.epo-acc-espd-request', sections: null },
    { label: 'Hovedtrekkene i prosedyren', value: 'Løpende tjenester', sections: null },
    { label: 'Spørsmål', value: 'Kan vi dele opp?', sections: null },
    { label: 'Svar', value: 'Nei.', sections: null },
  ],
});
assert.equal(sample.documents.some((doc) => /kommune\.example/.test(doc.url)), false);
assert.equal(sample.buyerUrl, 'https://kommune.example/');
assert.equal(sample.procedure, 'Åpen');
assert.equal(sample.questionDeadline, '12.10.2026 12:00');
assert.equal(sample.espd, 'Egenerklæring brukes');
assert.equal(sample.documents[0].url, 'https://permalink.mercell.com/1.aspx');
assert.equal(sample.procedureOutline, 'Løpende tjenester');
assert.equal(sample.qa[0].question, 'Kan vi dele opp?');
assert.equal(sample.qa[0].answer, 'Nei.');
assert.equal(sample.summaryVersion, 2);

const mapped = summarizeNotice({
  id: '2026-2',
  heading: 'Grafisk',
  buyer: [{ id: '974761262', name: 'Etaten' }],
  publicationDate: '2026-10-01',
  tedId: '699650-2026',
  regulationUrl: 'https://lovdata.no/dokument/SF/forskrift/2016-08-12-974',
  core: { estimatedValue: { amount: 2000000, code: 'NOK' } },
  eform: [
    { label: 'Kontraktens art', value: 'Tjenester', sections: null },
    { label: 'Intern identifikator', value: '25/6727', sections: null },
    { label: 'Frist til anbudet må være gyldig, Måned', value: '3', sections: null },
    {
      label: 'Anslått varighet',
      sections: [{ label: 'Varighet, Måned', value: '48', sections: null }],
    },
    {
      label: 'Rammeavtale',
      sections: [
        { label: 'Rammeavtale uten gjenåpning av konkurransen', sections: null },
        { label: 'Maks antall deltakere', value: '1', sections: null },
      ],
    },
    {
      label: 'Informasjon om den dynamiske innkjøpsordningen',
      sections: [{ label: 'Ingen', sections: null }],
    },
    {
      label: 'Tildelingskriterier',
      sections: [
        {
          label: 'Kriterium',
          sections: [
            { label: 'Type', value: 'Kvalitet', sections: null },
            { label: 'Beskrivelse', value: 'Oppdragsforståelse', sections: null },
            {
              label: 'Category of award threshold criterion',
              sections: [{ label: 'Tildelingskriterium - tallverdi', value: '60', sections: null }],
            },
          ],
        },
      ],
    },
    {
      label: 'Utvelgelseskriterier',
      sections: [
        {
          label: 'Kriterium',
          value: 'References on specified services',
          sections: [{ label: 'Beskrivelse', value: 'Tre relevante oppdrag siste tre år.', sections: null }],
        },
      ],
    },
    {
      label: 'Informasjon om offentlig åpning',
      sections: [{ label: 'Dato/klokkeslett', value: '22.10.2026 12:05', sections: null }],
    },
  ],
});
assert.equal(mapped.contractNature, 'Tjenester');
assert.equal(mapped.duration, '48 måneder');
assert.equal(mapped.validity, '3 måneder');
assert.equal(mapped.estimatedValue, '2\u00a0000\u00a0000 kr');
assert.match(mapped.framework, /uten gjenåpning/);
assert.match(mapped.framework, /Maks antall deltakere: 1/);
assert.equal(mapped.dps, '');
assert.equal(mapped.awards[0].title, 'Oppdragsforståelse');
assert.equal(mapped.awards[0].weight, '60');
assert.equal(mapped.selection[0].title, 'Tre relevante oppdrag siste tre år.');
assert.equal(mapped.opening, '22.10.2026 12:05');
assert.equal(mapped.reference, '25/6727');
assert.equal(mapped.buyerOrg, '974761262');
assert.equal(mapped.tedUrl, 'https://ted.europa.eu/no/notice/-/detail/699650-2026');
assert.match(mapped.regulationUrl, /lovdata/);

// Doffin 2025-114386: feltet om anskaffelsesdokumentene har bare et firmanavn.
const nameOnly = summarizeNotice({
  eform: [
    { label: 'Virksomhet som gir tilgang til anskaffelsesdokumentene', value: 'Innherred Anskaffelser -' },
    { label: 'Adresse på anskaffelsesdokumentene', value: 'http://eu.eu-supply.com/app/rfq/rwlentrance_s.asp?PID=375426&B=DFO' },
  ],
});
assert.equal(nameOnly.documentsUrl, 'https://eu.eu-supply.com/app/rfq/rwlentrance_s.asp?PID=375426&B=DFO');
// Doffin 2026-116004: competitionDocsUrl med http.
assert.equal(
  summarizeNotice({ competitionDocsUrl: 'http://permalink.mercell.com/290423823.aspx', eform: [] }).documentsUrl,
  'https://permalink.mercell.com/290423823.aspx',
);
assert.equal(summarizeNotice({ eform: [{ label: 'Virksomhet som gir tilgang til anskaffelsesdokumentene', value: 'Innherred Anskaffelser -' }] }).documentsUrl, '');

const live = await fetchNoticeDossier('2026-114937');
assert.equal(live.ok, true);
assert.match(live.dossier.buyer, /Sortland/);
assert.ok(live.dossier.documentsUrl);
assert.ok(live.dossier.submissionDeadline);
assert.equal(live.dossier.summaryVersion, 2);
assert.equal(live.dossier.contractNature, 'Tjenester');
assert.equal(live.dossier.duration, '48 måneder');
assert.match(live.dossier.estimatedValue, /14\s000\s000 kr/);
assert.match(live.dossier.framework, /Rammeavtale/i);
assert.equal(live.dossier.dps, '');
assert.equal(live.dossier.buyerOrg, '847737492');
assert.match(live.dossier.tedUrl, /658097-2026/);
console.log(`${live.dossier.title} · ${live.dossier.procedure} · spørsmål ${live.dossier.questionDeadline}`);
