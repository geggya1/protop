/**
 * Visio (.vsdx) → ProTop-prosesskart.
 * En .vsdx er en ZIP med XML: sider (visio/pages/pageN.xml), maler (visio/masters/masters.xml)
 * og koblinger (<Connects>). Vi leser figurene (aktivitet, beslutning, start/slutt …), pilene
 * mellom dem og svømmebanene, og lager et diagram som ProTop kan vise, validere og publisere.
 * Rene funksjoner – ingen lagring. Brukes av «Importer fra Visio» og visningen av Visio-vedlegg.
 */
import { strFromU8, unzipSync } from 'fflate';
import { layoutSwimlanes } from './processLayout.js';
import { validateDiagram } from './processes.js';

/* ───────── Liten XML-leser (Visio-XML er velformet og regelmessig) ───────── */

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decode(s) {
  return String(s || '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** Gir et tre { name, attrs, children: [node | string] }. Navnerom-prefiks (r:, x:) fjernes fra navnene. */
export function parseXml(xml) {
  const root = { name: '#root', attrs: {}, children: [] };
  const stack = [root];
  const re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(String(xml || '')))) {
    const top = stack[stack.length - 1];
    if (m[1] != null) { top.children.push(m[1]); continue; }
    if (m[6] != null) { if (m[6].trim() || top.children.length) top.children.push(decode(m[6])); continue; }
    if (!m[3]) continue;
    const name = m[3].includes(':') ? m[3].split(':').pop() : m[3];
    if (m[2] === '/') {
      for (let i = stack.length - 1; i > 0; i -= 1) if (stack[i].name === name) { stack.length = i; break; }
      continue;
    }
    const attrs = {};
    const ar = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
    let a;
    while ((a = ar.exec(m[4] || ''))) attrs[a[1].includes(':') ? a[1].split(':').pop() : a[1]] = decode(a[3] ?? a[4]);
    const node = { name, attrs, children: [] };
    top.children.push(node);
    if (!m[5]) stack.push(node);
  }
  return root;
}

const kids = (node, name) => (node?.children || []).filter((c) => typeof c === 'object' && (!name || c.name === name));
const kid = (node, name) => kids(node, name)[0] || null;

/** All tekst under en node, uten Visios formateringsmarkører. */
function textOf(node) {
  if (!node) return '';
  let out = '';
  for (const c of node.children || []) {
    if (typeof c === 'string') out += c;
    else if (!['cp', 'pp', 'tp'].includes(c.name)) out += textOf(c);
  }
  return out;
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/* ───────── Les .vsdx ───────── */

function readFiles(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data[0] !== 0x50 || data[1] !== 0x4b) throw new Error('Filen er ikke en .vsdx (Visio 2013 eller nyere). Lagre den som .vsdx i Visio og prøv igjen.');
  const files = unzipSync(data, { filter: (f) => /\.(xml|rels)$/i.test(f.name) });
  const out = {};
  for (const [name, buf] of Object.entries(files)) out[name.replace(/\\/g, '/')] = strFromU8(buf);
  return out;
}

function relsFor(files, path) {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const file = path.slice(path.lastIndexOf('/') + 1);
  const xml = files[`${dir}/_rels/${file}.rels`];
  const map = {};
  if (!xml) return map;
  for (const r of kids(kid(parseXml(xml), 'Relationships'), 'Relationship')) {
    const target = r.attrs.Target || '';
    map[r.attrs.Id] = target.startsWith('/') ? target.slice(1) : `${dir}/${target}`.replace(/[^/]+\/\.\.\//g, '');
  }
  return map;
}

function cellMap(shape) {
  const cells = {};
  for (const c of kids(shape, 'Cell')) cells[c.attrs.N] = c.attrs.V;
  return cells;
}

function readMasters(files) {
  const masters = new Map();
  const xml = files['visio/masters/masters.xml'];
  if (!xml) return masters;
  for (const m of kids(kid(parseXml(xml), 'Masters'), 'Master')) {
    masters.set(m.attrs.ID, clean(m.attrs.NameU || m.attrs.Name).replace(/\.\d+$/, ''));
  }
  return masters;
}

/** Figurer på en side, flatet ut: grupper beholdes som én figur, og barn peker til gruppen. */
function readShapes(pageRoot, masters) {
  const shapes = new Map();
  const parentOf = new Map();
  const walk = (node, topId, inheritedMaster) => {
    for (const s of kids(kid(node, 'Shapes'), 'Shape')) {
      const id = s.attrs.ID;
      const master = masters.get(s.attrs.Master) || inheritedMaster || '';
      const cells = cellMap(s);
      const txt = clean(textOf(kid(s, 'Text')));
      if (topId) {
        parentOf.set(id, topId);
        const top = shapes.get(topId);
        if (top && !top.text && txt) top.text = txt;
      } else {
        shapes.set(id, {
          id,
          name: clean(s.attrs.NameU || s.attrs.Name).replace(/\.\d+$/, ''),
          master,
          type: s.attrs.Type || 'Shape',
          text: txt,
          x: Number(cells.PinX),
          y: Number(cells.PinY),
          w: Number(cells.Width),
          h: Number(cells.Height),
          begin: cells.BeginX != null ? { x: Number(cells.BeginX), y: Number(cells.BeginY) } : null,
          end: cells.EndX != null ? { x: Number(cells.EndX), y: Number(cells.EndY) } : null,
          oneD: cells.BeginX != null && cells.EndX != null,
        });
      }
      walk(s, topId || id, master);
    }
  };
  walk(kid(pageRoot, 'PageContents'), null, '');
  const connects = kids(kid(kid(pageRoot, 'PageContents'), 'Connects'), 'Connect').map((c) => ({
    from: c.attrs.FromSheet, cell: c.attrs.FromCell || '', to: parentOf.get(c.attrs.ToSheet) || c.attrs.ToSheet,
  }));
  return { shapes, connects };
}

/** Sidene i filen: [{ name, shapes, connects }]. Bakgrunnssider hoppes over. */
export function readVsdx(bytes) {
  const files = readFiles(bytes);
  const masters = readMasters(files);
  const pagesXml = files['visio/pages/pages.xml'];
  if (!pagesXml) throw new Error('Fant ingen sider i Visio-filen.');
  const rels = relsFor(files, 'visio/pages/pages.xml');
  const pages = [];
  for (const p of kids(kid(parseXml(pagesXml), 'Pages'), 'Page')) {
    if (p.attrs.Background === '1') continue;
    const relId = kid(p, 'Rel')?.attrs?.id;
    const path = rels[relId];
    if (!path || !files[path]) continue;
    pages.push({ name: clean(p.attrs.NameU || p.attrs.Name) || `Side ${pages.length + 1}`, ...readShapes(parseXml(files[path]), masters) });
  }
  if (!pages.length) throw new Error('Fant ingen sider med innhold i Visio-filen.');
  return { pages };
}

/* ───────── Fra figurer til prosesskart ───────── */

/** Hva en figur er, ut fra malnavnet (Visio på norsk eller engelsk). */
export function classifyShape(s) {
  const n = `${s.master} ${s.name}`.toLowerCase();
  if (s.oneD || /connector|kobling|tilkobling|\bline\b|linje|\barrow\b|\bpil\b/.test(n)) return 'connector';
  if (/swimlane|svømmebane|functional band|funksjonsbånd|^bane\b|\blane\b/.test(n)) return 'lane';
  if (/separator|skillelinje|\bphase\b|\bfase\b/.test(n)) return 'ignore';
  if (/cff container|container|beholder|title|tittel|legend|tegnforklaring/.test(n)) return 'title';
  if (/decision|beslutning|avgjørelse|valg/.test(n)) return 'decision';
  if (/start\/end|start|terminator|slutt|avslutt|\bend\b|begin|ende/.test(n)) return 'terminal';
  if (/subprocess|sub-process|delprosess|underprosess|predefined|forhåndsdefinert/.test(n)) return 'subprocess';
  if (/document|dokument/.test(n)) return 'document';
  if (/off-page|on-page|reference|henvisning|referanse/.test(n)) return 'reference';
  if (!s.master && !s.text) return 'ignore';
  if (!s.master) return 'text';
  return 'activity';
}

function conditionFor(label) {
  const t = clean(label).toLowerCase();
  if (/^(ja|yes|j|y|ok|godkjent)\b/.test(t)) return 'yes';
  if (/^(nei|no|n|ikke)\b/.test(t)) return 'no';
  return '';
}

function inside(s, p, tol = 0.15) {
  return Number.isFinite(s.x) && Number.isFinite(s.w)
    && Math.abs(p.x - s.x) <= s.w / 2 + tol && Math.abs(p.y - s.y) <= s.h / 2 + tol;
}

/**
 * Én Visio-side → spesifikasjon for layoutSwimlanes, med advarsler.
 * Svømmebanene blir roller; figurene plasseres i banen de står i.
 */
export function pageToSpec(page) {
  const all = [...page.shapes.values()].map((s) => ({ ...s, kind: classifyShape(s) }));
  const warnings = [];
  const laneShapes = all.filter((s) => s.kind === 'lane' && s.text);
  const horizontal = laneShapes.length ? laneShapes.filter((l) => l.w >= l.h).length >= laneShapes.length / 2 : true;
  const lanesSorted = [...laneShapes].sort((a, b) => (horizontal ? b.y - a.y : a.x - b.x));
  const lanes = lanesSorted.map((l, i) => ({ id: `l${i + 1}`, label: l.text.slice(0, 80), shape: l }));
  const laneFor = (s) => {
    const hit = lanes.find((l) => (horizontal
      ? Math.abs(s.y - l.shape.y) <= l.shape.h / 2
      : Math.abs(s.x - l.shape.x) <= l.shape.w / 2));
    return hit?.id || '';
  };

  const nodeKinds = ['activity', 'decision', 'terminal', 'subprocess', 'document', 'reference', 'text'];
  const candidates = all.filter((s) => nodeKinds.includes(s.kind));
  const byId = new Map(candidates.map((s) => [s.id, s]));
  const title = clean(all.find((s) => s.kind === 'title' && s.text)?.text || '');

  // Kanter: limte koblinger først, ellers endepunktene som ligger i en figur.
  const edges = [];
  const glued = new Map();
  for (const c of page.connects) {
    if (!glued.has(c.from)) glued.set(c.from, {});
    if (/^Begin/i.test(c.cell)) glued.get(c.from).from = c.to;
    else if (/^End/i.test(c.cell)) glued.get(c.from).to = c.to;
  }
  let loose = 0;
  for (const conn of all.filter((s) => s.kind === 'connector')) {
    const g = glued.get(conn.id) || {};
    let from = byId.has(g.from) ? g.from : '';
    let to = byId.has(g.to) ? g.to : '';
    if ((!from || !to) && conn.begin && conn.end) {
      const a = candidates.find((s) => inside(s, conn.begin));
      const b = candidates.find((s) => inside(s, conn.end));
      if (!from && a) { from = a.id; loose += 1; }
      if (!to && b) { to = b.id; loose += 1; }
    }
    if (from && to && from !== to) edges.push({ id: `e${conn.id}`, from, to, label: conn.text.slice(0, 60), condition: conditionFor(conn.text) || 'always' });
  }
  if (loose) warnings.push(`${loose} piler var ikke festet til figurene i Visio. De er koblet til figuren de peker på – kontroller.`);

  // Tekst uten kobling er kommentarer, ikke steg i prosessen.
  const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
  const notes = candidates.filter((s) => s.kind === 'text' && !linked.has(s.id));
  if (notes.length) warnings.push(`${notes.length} tekstfelt uten piler er tatt med som merknad i beskrivelsen: ${notes.slice(0, 4).map((s) => `«${s.text.slice(0, 40)}»`).join(', ')}${notes.length > 4 ? ' …' : ''}`);
  const used = candidates.filter((s) => !(s.kind === 'text' && !linked.has(s.id)));

  const inc = (id) => edges.filter((e) => e.to === id).length;
  const out = (id) => edges.filter((e) => e.from === id).length;
  const nodes = used.map((s) => {
    let type = 'activity';
    if (s.kind === 'decision') type = 'decision';
    else if (s.kind === 'terminal') type = !inc(s.id) ? 'start' : (!out(s.id) ? 'end' : 'activity');
    else if (s.kind === 'reference' && !out(s.id)) type = 'end';
    const label = (s.text || (type === 'start' ? 'Start' : type === 'end' ? 'Slutt' : s.master || 'Steg')).slice(0, 120);
    const description = s.kind === 'document' ? 'Dokument i Visio-kartet. Koble til styrt dokument i ProTop.'
      : (s.kind === 'subprocess' ? 'Underprosess i Visio-kartet. Koble til prosessen i ProTop.' : '');
    return { id: `v${s.id}`, type, label, lane: laneFor(s) || (lanes[0]?.id || ''), description, __x: s.x, __vid: s.id };
  });
  const idMap = new Map(used.map((s) => [s.id, `v${s.id}`]));
  const specEdges = edges.filter((e) => idMap.has(e.from) && idMap.has(e.to)).map((e) => ({ ...e, from: idMap.get(e.from), to: idMap.get(e.to) }));

  // Én start og minst én slutt. Mangler de, legges de til og merkes.
  const starts = nodes.filter((n) => n.type === 'start');
  if (starts.length > 1) {
    for (const n of starts.slice(1)) n.type = 'activity';
    warnings.push('Kartet hadde flere startpunkter. Det første er beholdt som start.');
  }
  if (!nodes.some((n) => n.type === 'start') && nodes.length) {
    const sources = nodes.filter((n) => !specEdges.some((e) => e.to === n.id));
    const first = sources.sort((a, b) => a.__x - b.__x)[0] || nodes[0];
    nodes.unshift({ id: 'vstart', type: 'start', label: 'Start', lane: first.lane });
    specEdges.unshift({ id: 'evstart', from: 'vstart', to: first.id, condition: 'always' });
    warnings.push('Start manglet og er lagt til foran første steg.');
  }
  const sinks = nodes.filter((n) => n.type !== 'end' && n.type !== 'start' && !specEdges.some((e) => e.from === n.id));
  if (!nodes.some((n) => n.type === 'end') || sinks.length) {
    if (sinks.length) {
      const endLane = sinks[sinks.length - 1].lane;
      nodes.push({ id: 'vend', type: 'end', label: 'Slutt', lane: endLane });
      for (const s of sinks) specEdges.push({ id: `evend_${s.id}`, from: s.id, to: 'vend', condition: 'always' });
      warnings.push(`${sinks.length === 1 ? 'Ett steg' : `${sinks.length} steg`} uten utgang er koblet til Slutt.`);
    }
  }

  // Beslutninger med to umerkede grener: anta Ja/Nei i rekkefølge, og si fra.
  for (const d of nodes.filter((n) => n.type === 'decision')) {
    const outs = specEdges.filter((e) => e.from === d.id);
    const unl = outs.filter((e) => e.condition === 'always');
    if (outs.length === 2 && unl.length === 2) {
      unl[0].condition = 'yes'; unl[0].label = unl[0].label || 'Ja';
      unl[1].condition = 'no'; unl[1].label = unl[1].label || 'Nei';
      warnings.push(`Beslutningen «${d.label}» hadde grener uten Ja/Nei. Ja og Nei er antatt – kontroller.`);
    } else if (unl.length && outs.length > 2) {
      unl[unl.length - 1].condition = 'default';
      warnings.push(`Beslutningen «${d.label}» har flere grener. Den siste umerkede er satt som «Ellers».`);
    }
  }

  if (!lanes.length) {
    lanes.push({ id: 'l1', label: 'Ansvarlig' });
    for (const n of nodes) n.lane = 'l1';
    warnings.push('Kartet har ingen svømmebaner. Alle steg ligger i én bane – sett riktig rolle.');
  }
  for (const n of nodes) if (!n.lane) n.lane = lanes[0].id;

  return {
    title,
    notes: notes.map((s) => s.text),
    lanes: lanes.map(({ id, label }) => ({ id, label })),
    nodes: nodes.map(({ __x, __vid, ...n }) => n),
    edges: specEdges,
    warnings,
  };
}

/**
 * Hele filen: hver side blir et forslag til prosesskart med validering.
 * Gir { pages: [{ name, title, diagram, validation, warnings, stats, notes }] }.
 */
export function visioToProcesses(bytes) {
  const { pages } = readVsdx(bytes);
  return {
    pages: pages.map((p) => {
      const spec = pageToSpec(p);
      const diagram = layoutSwimlanes(spec);
      const validation = validateDiagram(diagram);
      return {
        name: p.name,
        title: spec.title || p.name,
        diagram,
        validation,
        warnings: spec.warnings,
        notes: spec.notes,
        stats: { steps: diagram.nodes.length, arrows: diagram.edges.length, lanes: diagram.lanes.length },
      };
    }),
  };
}
