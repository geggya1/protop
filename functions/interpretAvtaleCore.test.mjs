import assert from 'node:assert/strict';
import { handleInterpretIndeks } from './interpretAvtaleCore.js';

const NS8403 = `
Consult1 AS - Ledelsessystem
Oppdragsbekreftelse
Oppdrag Madlalia Eksternt PO. nr: Oppdrags nummer:
Oppdragssted Adresse: Haakon VIIs gate 8, 4005 Sted: Stavanger
Oppstart: 17.11.2025 Sluttdato: 31.12.2028
Beskrivelse av oppdraget Anleggsleder
Oppdragsgiver Igang Totalentreprenør As Organisasjons nr: 922 98 7106
Kontakt person Øyvind Lerbrekk
Epost: oyvind@igang.no Telefon nr: 920 82 276
Oppdragstaker Consult1 AS Organisasjons nr: 916 538 804
Generelle bestemmelser NS8403 : Alminnelig kontrakts bestemmelser for byggeleder oppdrag
Avtalte honorar Honoreres etter medgått tid.
Regulering av pris. Timesats reguleres etter SSB prisindeks for 71.121. Byggeteknisk konsulentvirksomhet
Tabell: 14335 Start indeks: K2 2025
Avtalt honorar pris 1080,- eks mva.
Påslagsprosent: 10%
Timepriser reguleres kvartalsvis i henhold til SSBs prisindeks for konsulentvirksomhet (tabell 14335).
Sted: Klepp Dato: 09.10.2025 Sted: Sandnes Dato: 09.10.2025
`;

const result = await handleInterpretIndeks({
  documents: [{ name: 'C1-H-03-001.pdf', text: NS8403 }],
});
assert.equal(result.ok, true);
assert.equal(result.engine, 'lokal');
assert.equal(result.extracted.standard, 'NS 8403');
assert.equal(result.extracted.buyer, 'Igang Totalentreprenør As');
assert.equal(result.extracted.indexId, 'ppi-byggeteknisk');
assert.match(String(result.extracted.honorar || result.extracted.lines?.[0]?.rate || ''), /1080/);

let failed = false;
try {
  await handleInterpretIndeks({ text: 'for kort' });
} catch (error) {
  failed = true;
  assert.match(String(error?.message || ''), /Lim inn|last opp|avtale/i);
}
assert.equal(failed, true);

console.log('functions/interpretAvtaleCore.test.mjs: all passed');
