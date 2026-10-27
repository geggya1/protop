import assert from 'node:assert/strict';
import test from 'node:test';
import { strToU8, zipSync } from 'fflate';
import { classifyShape, pageToSpec, parseXml, readVsdx, visioToProcesses } from './visio.js';

const cell = (n, v) => `<Cell N="${n}" V="${v}"/>`;
const shape = (id, master, text, x, y, w = 1.5, h = 0.75, extra = '') => `<Shape ID="${id}" NameU="S${id}" Type="Shape" Master="${master}">${cell('PinX', x)}${cell('PinY', y)}${cell('Width', w)}${cell('Height', h)}${extra}${text ? `<Text><cp IX="0"/>${text}</Text>` : ''}</Shape>`;
const connector = (id, text = '', begin = null, end = null) => `<Shape ID="${id}" NameU="Dynamic connector.${id}" Type="Shape" Master="4">${begin ? cell('BeginX', begin[0]) + cell('BeginY', begin[1]) : cell('BeginX', 0) + cell('BeginY', 0)}${end ? cell('EndX', end[0]) + cell('EndY', end[1]) : cell('EndX', 0) + cell('EndY', 0)}${text ? `<Text>${text}</Text>` : ''}</Shape>`;

function vsdx({ swapLanes = false } = {}) {
  const masters = `<?xml version="1.0" encoding="utf-8"?><Masters xmlns="http://schemas.microsoft.com/office/visio/2012/main">
    <Master ID="1" NameU="Process" Name="Prosess"/><Master ID="2" NameU="Decision" Name="Beslutning"/>
    <Master ID="3" NameU="Start/End" Name="Start/slutt"/><Master ID="4" NameU="Dynamic connector" Name="Dynamisk kobling"/>
    <Master ID="5" NameU="Swimlane" Name="Svømmebane"/></Masters>`;
  const lanes = swapLanes
    ? shape(90, 5, 'Prosjektleder', 5, 6, 10, 2) + shape(91, 5, 'Kunde &amp; marked', 5, 4, 10, 2)
    : shape(90, 5, 'Kunde &amp; marked', 5, 6, 10, 2) + shape(91, 5, 'Prosjektleder', 5, 4, 10, 2);
  const page = `<?xml version="1.0"?><PageContents xmlns="http://schemas.microsoft.com/office/visio/2012/main"><Shapes>
    ${lanes}
    ${shape(1, 3, 'Start', 1, 6)}
    ${shape(2, 1, 'Motta forespørsel', 3, 6)}
    <Shape ID="3" NameU="Gruppe" Type="Group" Master="2">${cell('PinX', 5)}${cell('PinY', 4)}${cell('Width', 1.5)}${cell('Height', 1)}<Shapes><Shape ID="31" Type="Shape" MasterShape="6"><Text>Aktuelt oppdrag?</Text></Shape></Shapes></Shape>
    ${shape(4, 1, 'Lag tilbud', 7, 4)}
    ${shape(5, 3, 'Slutt', 9, 4)}
    ${shape(6, 1, 'Avslå', 7, 2.9)}
    <Shape ID="7" NameU="Tekst" Type="Shape">${cell('PinX', 9)}${cell('PinY', 7)}<Text>Revidert 2025</Text></Shape>
    ${connector(10)}${connector(11)}${connector(12, 'Ja')}${connector(13, 'Nei')}${connector(14, '', [7, 4], [9, 4])}${connector(15)}
  </Shapes><Connects>
    <Connect FromSheet="10" FromCell="BeginX" ToSheet="1"/><Connect FromSheet="10" FromCell="EndX" ToSheet="2"/>
    <Connect FromSheet="11" FromCell="BeginX" ToSheet="2"/><Connect FromSheet="11" FromCell="EndX" ToSheet="31"/>
    <Connect FromSheet="12" FromCell="BeginX" ToSheet="3"/><Connect FromSheet="12" FromCell="EndX" ToSheet="4"/>
    <Connect FromSheet="13" FromCell="BeginX" ToSheet="3"/><Connect FromSheet="13" FromCell="EndX" ToSheet="6"/>
    <Connect FromSheet="15" FromCell="BeginX" ToSheet="6"/><Connect FromSheet="15" FromCell="EndX" ToSheet="5"/>
  </Connects></PageContents>`;
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'visio/document.xml': strToU8('<VisioDocument/>'),
    'visio/masters/masters.xml': strToU8(masters),
    'visio/pages/pages.xml': strToU8('<Pages xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><Page ID="0" NameU="Tilbud" Name="Tilbud"><Rel r:id="rId1"/></Page><Page ID="1" Name="Bakgrunn" Background="1"><Rel r:id="rId2"/></Page></Pages>'),
    'visio/pages/_rels/pages.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="page" Target="page1.xml"/><Relationship Id="rId2" Type="page" Target="page2.xml"/></Relationships>'),
    'visio/pages/page1.xml': strToU8(page),
    'visio/pages/page2.xml': strToU8('<PageContents><Shapes/></PageContents>'),
  });
}

test('parseXml: elementer, attributter, tekst og entiteter', () => {
  const t = parseXml('<?xml version="1.0"?><a x="1" r:id="r2"><b>Hei &amp; hå</b><c/></a>');
  const a = t.children[0];
  assert.equal(a.name, 'a');
  assert.equal(a.attrs.id, 'r2');
  assert.equal(a.children[0].children[0], 'Hei & hå');
  assert.equal(a.children[1].name, 'c');
});

test('readVsdx: sider, maler, grupper og koblinger', () => {
  const { pages } = readVsdx(vsdx());
  assert.equal(pages.length, 1, 'bakgrunnssiden hoppes over');
  assert.equal(pages[0].name, 'Tilbud');
  assert.equal(pages[0].shapes.get('3').text, 'Aktuelt oppdrag?', 'gruppen får teksten fra barnet');
  assert.ok(pages[0].connects.some((c) => c.from === '11' && c.to === '3'), 'kobling til barn peker til gruppen');
  assert.equal(classifyShape(pages[0].shapes.get('3')), 'decision');
  assert.equal(classifyShape(pages[0].shapes.get('90')), 'lane');
});

test('visioToProcesses: gyldig prosesskart med baner, Ja/Nei og festet pil', () => {
  const res = visioToProcesses(vsdx());
  const p = res.pages[0];
  assert.deepEqual(p.diagram.lanes.map((l) => l.label), ['Kunde & marked', 'Prosjektleder']);
  const byLabel = (l) => p.diagram.nodes.find((n) => n.label === l);
  assert.equal(byLabel('Start').type, 'start');
  assert.equal(byLabel('Slutt').type, 'end');
  assert.equal(byLabel('Aktuelt oppdrag?').type, 'decision');
  const laneOf = (n) => p.diagram.lanes.find((l) => n.y >= l.y && n.y < l.y + l.h)?.label;
  assert.equal(laneOf(byLabel('Motta forespørsel')), 'Kunde & marked');
  assert.equal(laneOf(byLabel('Lag tilbud')), 'Prosjektleder');
  const fromDecision = p.diagram.edges.filter((e) => e.from === byLabel('Aktuelt oppdrag?').id).map((e) => e.condition).sort();
  assert.deepEqual(fromDecision, ['no', 'yes']);
  assert.ok(p.diagram.edges.some((e) => e.from === byLabel('Lag tilbud').id && e.to === byLabel('Slutt').id), 'pil uten lim kobles etter endepunkt');
  assert.ok(p.warnings.some((w) => /ikke festet/.test(w)));
  assert.ok(p.warnings.some((w) => /Revidert 2025/.test(w)), 'løs tekst blir merknad');
  assert.ok(p.validation.ok, JSON.stringify(p.validation.errors));
});

test('visioToProcesses: banene sorteres ovenfra og ned', () => {
  const p = visioToProcesses(vsdx({ swapLanes: true })).pages[0];
  assert.deepEqual(p.diagram.lanes.map((l) => l.label), ['Prosjektleder', 'Kunde & marked']);
});

test('pageToSpec: uten start og slutt legges de til', () => {
  const page = {
    name: 'X',
    shapes: new Map([
      ['1', { id: '1', name: 'Process', master: 'Process', text: 'A', x: 1, y: 1, w: 1, h: 1 }],
      ['2', { id: '2', name: 'Process', master: 'Process', text: 'B', x: 3, y: 1, w: 1, h: 1 }],
      ['3', { id: '3', name: 'Dynamic connector', master: 'Dynamic connector', text: '', oneD: true }],
    ]),
    connects: [{ from: '3', cell: 'BeginX', to: '1' }, { from: '3', cell: 'EndX', to: '2' }],
  };
  const spec = pageToSpec(page);
  assert.equal(spec.nodes.filter((n) => n.type === 'start').length, 1);
  assert.equal(spec.nodes.filter((n) => n.type === 'end').length, 1);
  assert.ok(spec.warnings.some((w) => /svømmebaner/.test(w)));
});

test('readVsdx: avviser filer som ikke er .vsdx', () => {
  assert.throws(() => readVsdx(new Uint8Array([1, 2, 3, 4])), /ikke en \.vsdx/);
});
