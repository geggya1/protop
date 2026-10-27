import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { documentMetaFromFileName, docxToMarkdown } from './docx.js';
import { parseMarkdown } from './markdown.js';

const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
const p = (inner, style = '', num = '') => `<w:p><w:pPr>${style ? `<w:pStyle w:val="${style}"/>` : ''}${num}</w:pPr>${inner}</w:p>`;
const r = (t, rPr = '') => `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${t}</w:t></w:r>`;
const li = (lvl, numId) => `<w:numPr><w:ilvl w:val="${lvl}"/><w:numId w:val="${numId}"/></w:numPr>`;
const cell = (t) => `<w:tc>${p(r(t))}</w:tc>`;

function docx() {
  const body = [
    p(r('Prosedyre – Dokumentstyring'), 'Tittel'),
    p(r('Formål'), 'Overskrift1'),
    p(`${r('Prosedyren sikrer at ')}${r('gjeldende', '<w:b/>')}${r(' versjon brukes.')}`),
    p(r('Ansvar'), 'Overskrift2'),
    p(r('Daglig leder godkjenner'), '', li(0, 1)),
    p(r('Kvalitetsleder vedlikeholder'), '', li(0, 1)),
    p(r('Underpunkt'), '', li(1, 1)),
    p(r('Steg én'), '', li(0, 2)),
    p(r('Steg to'), '', li(0, 2)),
    `<w:tbl><w:tr>${cell('Rolle')}${cell('Ansvar')}</w:tr><w:tr>${cell('DL')}${cell('Godkjenne | signere')}</w:tr></w:tbl>`,
    p(`<w:hyperlink r:id="rId9">${r('Lovdata')}</w:hyperlink>`),
    p(`${r('Slettet', '')}`.replace('<w:r>', '<w:del><w:r>').replace('</w:r>', '</w:r></w:del>')),
    p('<w:r><w:drawing/></w:r>'),
    '<w:sdt><w:sdtContent>' + p(r('Innhold i kontrollfelt')) + '</w:sdtContent></w:sdt>',
  ].join('');
  const files = {
    'word/document.xml': `<?xml version="1.0"?><w:document ${W}><w:body>${body}<w:sectPr/></w:body></w:document>`,
    'word/styles.xml': `<?xml version="1.0"?><w:styles ${W}>
      <w:style w:styleId="Tittel"><w:name w:val="Title"/></w:style>
      <w:style w:styleId="Overskrift1"><w:name w:val="heading 1"/></w:style>
      <w:style w:styleId="Overskrift2"><w:name w:val="heading 2"/></w:style></w:styles>`,
    'word/numbering.xml': `<?xml version="1.0"?><w:numbering ${W}>
      <w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl><w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
      <w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
      <w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num></w:numbering>`,
    'word/_rels/document.xml.rels': '<?xml version="1.0"?><Relationships><Relationship Id="rId9" Target="https://lovdata.no/" TargetMode="External"/></Relationships>',
  };
  const zip = {};
  for (const [k, v] of Object.entries(files)) zip[k] = strToU8(v);
  return zipSync(zip);
}

test('docxToMarkdown: tittel, overskrifter, lister, tabell, lenke og fet tekst', () => {
  const out = docxToMarkdown(docx());
  assert.equal(out.title, 'Prosedyre – Dokumentstyring');
  assert.equal(out.headings, 2);
  assert.equal(out.tables, 1);
  assert.equal(out.images, 1);
  const md = out.markdown;
  assert.match(md, /^# Prosedyre – Dokumentstyring/);
  assert.match(md, /## Formål\n\nProsedyren sikrer at \*\*gjeldende\*\* versjon brukes\./);
  assert.match(md, /- Daglig leder godkjenner\n- Kvalitetsleder vedlikeholder\n {2}- Underpunkt\n1\. Steg én\n2\. Steg to/);
  assert.match(md, /\| Rolle \| Ansvar \|\n\|---\|---\|\n\| DL \| Godkjenne \\\| signere \|/);
  assert.match(md, /\[Lovdata\]\(https:\/\/lovdata\.no\/\)/);
  assert.doesNotMatch(md, /Slettet/);
  assert.match(md, /Innhold i kontrollfelt/);
  // Det ProTop viser: overskrifter, liste og tabell gjenkjennes.
  const blocks = parseMarkdown(md);
  assert.ok(blocks.some((b) => b.type === 'table'));
  const items = blocks.filter((b) => b.type === 'li');
  assert.deepEqual(items.map((b) => [b.ordered, b.depth]), [[false, 0], [false, 0], [false, 1], [true, 0], [true, 0]]);
  assert.deepEqual(blocks.filter((b) => b.type === 'h').map((b) => b.level), [1, 2, 3]);
});

test('docxToMarkdown avviser gamle .doc og andre filer', () => {
  assert.throws(() => docxToMarkdown(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0])), /lagre som \.docx/);
  assert.throws(() => docxToMarkdown(new Uint8Array([1, 2, 3])), /ikke en Word-fil/);
});

test('documentMetaFromFileName: kode, mappe, tittel og type fra SharePoint-navn', () => {
  assert.deepEqual(documentMetaFromFileName('F-01-009 Prosedyre - Dokumentstyring.docx'), {
    code: 'F-01-009', originalCode: 'F-01-009', folder: 'F-01', title: 'Dokumentstyring', docType: 'prosedyre',
  });
  assert.deepEqual(documentMetaFromFileName('F-01-001 Prosedyre_Markedsføringsplan.docx').title, 'Markedsføringsplan');
  const t = documentMetaFromFileName('C1-C-01-003 Taushetserklæring.docx');
  assert.equal(t.code, 'C-01-003');
  assert.equal(t.originalCode, 'C1-C-01-003');
  assert.equal(t.folder, 'C-01');
  assert.equal(documentMetaFromFileName('A-01-002 Miljøpolitikk.docx').docType, 'policy');
  assert.equal(documentMetaFromFileName('C1-D-01-002 Avfallsinstruks.docx').docType, 'instruks');
  assert.deepEqual(documentMetaFromFileName('Referat driftsmøte.docx').code, '');
});
