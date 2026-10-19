import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  artifikProcId,
  identifySource,
  parseArtifikFiles,
  parseArtifikQaBody,
  parseArtifikQaIndex,
  parseEuSupplyDocuments,
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
