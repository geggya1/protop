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
  hyyrProcurementId,
  parseHyyrPageFiles,
  parseHyyrQa,
  parseTendsignDocuments,
  tendsignNoticeId,
  zipEntries,
  zipEntryBytes,
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
const doubleSpace = parseArtifikFiles(streamPage([
  'name', '1-  SSA-L - Avtale.docx', 'key', 'procurementAttachments/9684/cf8fe557-6d86-471c-ba0d-ed1937caf1b0',
  { _0: 1, _2: 3 },
]));
// Visningsnavnet ryddes, men Artifik må få navnet nøyaktig som lagret for å gi ut filen.
assert.equal(doubleSpace[0].name, '1- SSA-L - Avtale.docx');
assert.equal(doubleSpace[0].portalName, '1-  SSA-L - Avtale.docx');
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

// Minimal zip (lagret uten komprimering) som Hyyr-nedlastingen leses med.
function storedZip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, body] of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const data = Buffer.from(body, 'utf8');
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(0x800, 6);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x800, 8);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const zip = storedZip([['Konkurranse/Vedlegg/Kravspesifikasjon å.docx', 'hei'], ['Konkurranse/Feil.txt', 'mangler']]);
const entries = zipEntries(zip);
assert.equal(entries.length, 2);
assert.equal(entries[0].name, 'Konkurranse/Vedlegg/Kravspesifikasjon å.docx');
assert.equal(zipEntryBytes(zip, entries[0]).toString('utf8'), 'hei');
assert.equal(hyyrProcurementId('https://hyyr.no/procurement/cmugp559c000004jy6ykwgewf'), 'cmugp559c000004jy6ykwgewf');
assert.equal(identifySource('https://www.hyyr.no/procurement/x').id, 'hyyr');
const hyyrPage = parseHyyrPageFiles('self.__next_f.push([1,"{\\"id\\":\\"cmup5mjji000p04l8bjhtefsq\\",\\"tenantId\\":\\"stryn-kommune\\",\\"blobId\\":\\"lot-files/shared/x/K.docx\\",\\"lotId\\":\\"cmugp55az000304jy9zwm8g9i\\",\\"fileName\\":\\"Konkurransegrunnlag Stryn.docx\\",\\"fileUrl\\":\\"https://m9.private.blob.vercel-storage.com/K.docx\\",\\"fileSize\\":80705,\\"fileType\\":\\"application/vnd.openxmlformats-officedocument.wordprocessingml.document\\"}"])');
assert.equal(hyyrPage.length, 1);
assert.equal(hyyrPage[0].id, 'cmup5mjji000p04l8bjhtefsq');
assert.equal(hyyrPage[0].name, 'Konkurransegrunnlag Stryn.docx');
assert.equal(hyyrPage[0].size, 80705);

const hyyrQa = parseHyyrQa('Innleie Spørsmål og svar Offentlige spørsmål. Spørsmål 1: Timer 06. oktober 2026 04:50 Hei De 2000 timene, er det for 24 mnd? Svar fra oppdragsgiver 06. oktober 2026 07:36 Det er for 24 måneder. Spørsmål 2: Intervju 15. oktober 2026 10:00 Fysisk eller digitalt?');
assert.equal(hyyrQa.length, 2);
assert.equal(hyyrQa[0].title, 'Timer');
assert.equal(hyyrQa[0].question, 'Hei De 2000 timene, er det for 24 mnd?');
assert.equal(hyyrQa[0].answer, 'Det er for 24 måneder.');
assert.equal(hyyrQa[0].published, '06/10/2026');
assert.equal(hyyrQa[1].answer, '');

const tendsignFiles = parseTendsignDocuments(`
<a onclick="window.open(&#39;../tools/download.aspx?Filename=3341893Inv_2.zip&amp;ObjectType=1&amp;ObjectID=YPsu=&amp;PathType=3&amp;Report=0&amp;ZipFile=1&amp;PublicFileName=Samtliga+bifogade+dokument.zip&#39;,&#39;Download&#39;)">
<a onclick="window.open(&#39;../tools/download.aspx?Filename=Foresp%c3%b8rselsbrev.docx&amp;ObjectType=1&amp;ObjectID=YPsu=&amp;PathType=3&amp;Report=0&#39;,&#39;Download&#39;)">`);
assert.equal(tendsignFiles.length, 1);
assert.equal(tendsignFiles[0].name, 'Forespørselsbrev.docx');
assert.equal(tendsignNoticeId('https://tendsign.com/doc.aspx?MeFormsNoticeId=102198'), '102198');

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
