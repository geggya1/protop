import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  artifikProcId,
  identifySource,
  parseArtifikFiles,
  parseArtifikQaBody,
  parseArtifikQaIndex,
  parseArtifikQaStream,
  parseEuSupplyDocuments,
  richText,
} from './kgvSource.js';

const payload = `
"260914_05_Tilbudsskjema.docx","lastModified","2026-09-21T08:57:20.000Z","orderIndex","isDeleted","key","procurementAttachments/7808/80b840f1-8ee5-4167-95e1-a2103d0c7830","260914_01_Konkurransegrunnlag_konsulenttjenester.docx","procurementAttachments/7808/b0d39a10-f918-480c-9118-c68e332a38d6"
`;
const files = parseArtifikFiles(payload);
assert.equal(files.length, 2);
assert.equal(files[0].name, '260914_05_Tilbudsskjema.docx');
assert.equal(files[0].publishedAt, '2026-09-21T08:57:20.000Z');
assert.equal(files[1].key, 'procurementAttachments/7808/b0d39a10-f918-480c-9118-c68e332a38d6');
const escaped = parseArtifikFiles(payload.replace(/"/g, '\\"'));
assert.equal(escaped.length, 2);
assert.equal(escaped[0].name, files[0].name);
assert.equal(artifikProcId('https://app.artifik.no/procurements/7808/details'), '7808');
assert.equal(identifySource('https://app.artifik.no/procurements/7808').id, 'artifik');
assert.equal(identifySource('https://permalink.mercell.com/1.aspx').name, 'Mercell');
assert.equal(identifySource('https://eu.eu-supply.com/app/rfq/rwlproposal_s.asp?PID=1').id, 'eusupply');
assert.equal(identifySource('https://tendsign.no/doc').id, 'tendsign');
assert.equal(identifySource('https://evil.example/file.pdf').id, 'other');

const qaHtml = `
<a href="/procurements/7808/qas/6276"><h3 class="text-secondary-600">Underleverandør til flere tilbydere</h3>
<p>Publisert den<!-- --> <!-- -->10/07/2026</p></a>
<a href="/procurements/7808/qas/6128"><h3>Evaluering av CV</h3><p>Publisert den 10/02/2026</p></a>
`;
const index = parseArtifikQaIndex(qaHtml);
assert.equal(index.length, 2);
assert.equal(index[0].id, '6276');
assert.equal(index[0].question, 'Underleverandør til flere tilbydere');
assert.equal(index[0].url, 'https://app.artifik.no/procurements/7808/qas/6276');

const body = parseArtifikQaBody('\\"question\\",\\"Kan vi stille som underleverandør?\\",\\"answer\\",\\"Ja, det er tillatt.\\",\\"publishedDate\\"');
assert.equal(body.question, 'Kan vi stille som underleverandør?');
assert.equal(body.answer, 'Ja, det er tillatt.');

// Nyere Artifik-sider: datastrøm der nøkkelen står før filnavnet, og slettede versjoner ligger igjen.
const streamPage = (table) => `<script>window.__reactRouterContext.streamController.enqueue(${JSON.stringify(`${JSON.stringify(table)}\n`)});</script>`;
const fileTable = [
  'procurementAttachments/10173/002b2e4d-3cd8-492d-829c-37c03fc839e5',
  'name', 'Kapittel C0 Avtaledokument.pdf', 'key', 'isDeleted', false, true, 'orderIndex', 1,
  'Gammel versjon.docx', 'procurementAttachments/10173/f961c299-9b63-42f2-aafc-7e951a4a4e44',
  'lastModified', '2026-10-20T09:02:20.000Z',
  { _1: 2, _11: 12, _7: 8, _4: 5, _3: 0 },
  { _1: 9, _7: 8, _4: 6, _3: 10 },
];
const streamed = parseArtifikFiles(streamPage(fileTable));
assert.equal(streamed.length, 1);
assert.equal(streamed[0].name, 'Kapittel C0 Avtaledokument.pdf');
assert.equal(streamed[0].key, 'procurementAttachments/10173/002b2e4d-3cd8-492d-829c-37c03fc839e5');
assert.equal(streamed[0].procId, '10173');
assert.equal(streamed[0].publishedAt, '2026-10-20T09:02:20.000Z');

const qaTable = [
  'id', 6276, 'question', 'Kan vi stille som underleverandør?', 'answer', 'Ja, det er tillatt.',
  'publishedDate', '2026-10-02T13:44:25.085Z', 'title', 'Underleverandør',
  { _0: 1, _8: 9, _2: 3, _4: 5, _6: 7 },
];
const streamQa = parseArtifikQaStream(streamPage(qaTable), '7808');
assert.equal(streamQa.length, 1);
assert.equal(streamQa[0].id, '6276');
assert.equal(streamQa[0].question, 'Kan vi stille som underleverandør?');
assert.equal(streamQa[0].answer, 'Ja, det er tillatt.');
assert.equal(streamQa[0].published, '02/10/2026');
assert.equal(streamQa[0].url, 'https://app.artifik.no/procurements/7808/qas/6276');
assert.deepEqual(parseArtifikQaStream('<html>ingen strøm</html>', '1'), []);
assert.equal(
  richText('<p><span style="color: red;">Er dette en feil?</span></p><p>Nei &amp; ja.<br>Linje to</p>'),
  'Er dette en feil?\nNei & ja.\nLinje to',
);

const deployed = readFileSync(new URL('../../functions/anbud/kgvSource.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('./kgvSource.js', import.meta.url), 'utf8');
assert.equal(deployed, source);
const tedDeployed = readFileSync(new URL('../../functions/anbud/tedQuery.js', import.meta.url), 'utf8');
const tedSource = readFileSync(new URL('./tedQuery.js', import.meta.url), 'utf8');
assert.equal(tedDeployed, tedSource);

const eu = `
var strDomain = 'https://eu.eu-supply.com';
var strArchiveType = '3';
var sDoc_18959452='Begrunnelse.pdf';
function DownloadPublicDocument(strFileID, strFileName, strLotID) {}
<a href="javascript:DownloadPublicDocument('18959452','sDoc_18959452','540643')">Begrunnelse.pdf</a>
`;
const euFiles = parseEuSupplyDocuments(eu);
assert.equal(euFiles.length, 1);
assert.equal(euFiles[0].name, 'Begrunnelse.pdf');
assert.equal(euFiles[0].url, 'https://eu.eu-supply.com/app/docmgmt/downloadPublicDocument.asp?FMT=5&AT=3&LID=540643&DVID=18959452');

console.log('kgvSource.test.mjs ok');
