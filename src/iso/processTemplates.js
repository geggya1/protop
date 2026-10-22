/**
 * Malbibliotek for prosesser (spesifikasjon kap. 5 og P01–P15).
 * Maler er utgangspunkt — kundens kopi endres uavhengig av malen.
 * Klausulhenvisninger er indikative og ikke faglig validert.
 */
import { makeEdge, makeNode, normalizeDiagram, snap } from './processes.js';

const LANE_H = 176;

/** Lag diagram fra kompakt spesifikasjon med enkel lagdelt autolayout. */
export function buildDiagram({ lanes = [], nodes = [], edges = [] }) {
  const laneIndex = new Map(lanes.map((l, i) => [l[0], i]));
  const made = nodes.map(([id, type, label, extra = {}]) => makeNode(type, { id, label, ...extra }));
  const edgeRows = edges.map(([from, to, cond = 'always', label = '']) => makeEdge(from, to, {
    id: `e_${from}_${to}`,
    condition: cond,
    label: label || '',
  }));
  // Lag: lengste vei fra start, uten bakoverkanter
  const layer = new Map();
  const start = made.find((n) => n.type === 'start');
  const order = [];
  if (start) {
    layer.set(start.id, 0);
    const queue = [start.id];
    const seen = new Set();
    while (queue.length) {
      const id = queue.shift();
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
      for (const e of edgeRows.filter((x) => x.from === id)) {
        if (seen.has(e.to)) continue;
        const l = (layer.get(id) || 0) + 1;
        if (!layer.has(e.to) || layer.get(e.to) < l) layer.set(e.to, l);
        queue.push(e.to);
      }
    }
  }
  const perLayer = new Map();
  for (const node of made) {
    const l = layer.has(node.id) ? layer.get(node.id) : 0;
    const laneId = node.__lane;
    const key = lanes.length ? `${l}:${laneId}` : String(l);
    const idx = perLayer.get(key) || 0;
    perLayer.set(key, idx + 1);
    node.x = snap(48 + l * 208);
    if (lanes.length) {
      const li = laneIndex.get(laneId) ?? 0;
      node.y = snap(li * LANE_H + (LANE_H - node.h) / 2 + idx * 8);
    } else {
      node.y = snap(64 + idx * 128);
    }
  }
  for (const node of made) delete node.__lane;
  return normalizeDiagram({
    lanes: lanes.map(([id, label, roleKey], i) => ({ id, label, roleKey, y: i * LANE_H, h: LANE_H })),
    nodes: made,
    edges: edgeRows,
  });
}

function n(id, type, label, extra = {}) {
  return [id, type, label, extra];
}

function laneNode(lane, id, type, label, extra = {}) {
  return [id, type, label, { ...extra, __lane: lane }];
}

// makeNode ignorerer ukjente felt; vi legger banen på etterpå.
function withLanes(spec) {
  const nodes = spec.nodes.map(([id, type, label, extra]) => {
    const { __lane, ...rest } = extra || {};
    return [id, type, label, rest, __lane];
  });
  const built = buildDiagram({
    lanes: spec.lanes,
    nodes: nodes.map(([id, type, label, rest]) => [id, type, label, rest]),
    edges: spec.edges,
  });
  // plasser i riktig bane
  const laneIndex = new Map(spec.lanes.map((l, i) => [l[0], i]));
  const counts = new Map();
  built.nodes = built.nodes.map((node) => {
    const lane = nodes.find((row) => row[0] === node.id)?.[4];
    if (!lane) return node;
    const li = laneIndex.get(lane) ?? 0;
    const key = `${node.x}:${lane}`;
    const k = counts.get(key) || 0;
    counts.set(key, k + 1);
    return { ...node, y: snap(li * LANE_H + (LANE_H - node.h) / 2 + k * 72) };
  });
  return built;
}

const R = (role, label) => ({ roleKey: role, roleLabel: label });

export const PROCESS_TEMPLATES = [
  {
    key: 'P02_avvik',
    title: 'Avviksbehandling',
    category: 'stotte',
    executable: true,
    purpose: 'Sikre at avvik, hendelser og forbedringsforslag blir registrert, vurdert, rettet og fulgt opp med effektkontroll.',
    inputs: 'Avviksmelding (SF16), revisjonsfunn, kundeklage',
    outputs: 'Lukket sak med tiltak, effektvurdering og bevis i kravmatrisen',
    kpi: 'Lukket innen frist (n/N), forfalte tiltak',
    clauseHint: '9001/14001/45001 10.2',
    diagram: () => withLanes({
      lanes: [['l1', 'Medarbeider', 'employee'], ['l2', 'Kvalitets-/HMS-leder', 'quality_manager'], ['l3', 'Tiltaksansvarlig', 'process_owner'], ['l4', 'Godkjenner', 'manager']],
      nodes: [
        laneNode('l1', 's', 'start', 'Avvik oppdaget'),
        laneNode('l1', 'a', 'form', 'Registrer avvik', { formKey: 'SF16_AVVIK', onClick: { type: 'openModule', ref: 'avvik' } }),
        laneNode('l2', 'b', 'activity', 'Triagering og klassifisering', { ...R('quality_manager', 'Kvalitetsleder'), dueDays: 3 }),
        laneNode('l2', 'c', 'decision', 'Akutt fare?', R('quality_manager', 'Kvalitetsleder')),
        laneNode('l2', 'd', 'task', 'Strakstiltak og varsling', { ...R('hse_manager', 'HMS-leder'), dueDays: 0 }),
        laneNode('l2', 'f', 'decision', 'Korrigerende tiltak?', R('quality_manager', 'Kvalitetsleder')),
        laneNode('l3', 'g', 'form', 'Årsaksanalyse', { formKey: 'SF17_ARSAK', ...R('process_owner', 'Prosesseier') }),
        laneNode('l3', 'h', 'task', 'Gjennomfør tiltak med bevis', { ...R('process_owner', 'Tiltaksansvarlig'), dueDays: 14 }),
        laneNode('l4', 'j', 'decision', 'Effekt tilfredsstillende?', R('manager', 'Godkjenner')),
        laneNode('l2', 'l', 'activity', 'Dokumenter begrunnelse', R('quality_manager', 'Kvalitetsleder')),
        laneNode('l4', 'k', 'approval', 'Godkjenn lukking', R('manager', 'Godkjenner')),
        laneNode('l4', 'e', 'end', 'Lukket og arkivert'),
      ],
      edges: [
        ['s', 'a'], ['a', 'b'], ['b', 'c'],
        ['c', 'd', 'yes', 'Ja'], ['c', 'f', 'no', 'Nei'], ['d', 'f'],
        ['f', 'g', 'yes', 'Ja'], ['f', 'l', 'no', 'Nei, begrunnet'],
        ['g', 'h'], ['h', 'j'], ['j', 'g', 'no', 'Nei'], ['j', 'k', 'yes', 'Ja'],
        ['l', 'k'], ['k', 'e', 'approved', 'Godkjent'], ['k', 'l', 'rejected', 'Avvist'],
      ],
    }),
  },
  {
    key: 'P03_prosessdesign',
    title: 'Prosessdesign og publisering',
    category: 'ledelse',
    executable: true,
    purpose: 'Styrt endring av prosesser: utkast, validering, godkjenning, publisering og opplæring.',
    inputs: 'Endringsbehov', outputs: 'Publisert prosessversjon', kpi: 'Prosesser med gyldig gjennomgang',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Endringsbehov'),
        n('a', 'activity', 'Lag utkast og tegn flyt', R('process_owner', 'Prosesseier')),
        n('c', 'control', 'Valider graf og referanser', R('process_owner', 'Prosesseier')),
        n('d', 'approval', 'Godkjenning', R('top_management', 'Godkjenner')),
        n('g', 'notify', 'Publiser og varsle berørte'),
        n('h', 'task', 'Vurder opplæringsbehov', R('quality_manager', 'Kvalitetsleder')),
        n('e', 'end', 'Prosess i bruk'),
      ],
      edges: [['s', 'a'], ['a', 'c'], ['c', 'd'], ['d', 'g', 'approved', 'Godkjent'], ['d', 'a', 'rejected', 'Avvist'], ['g', 'h'], ['h', 'e']],
    }),
  },
  {
    key: 'P04_kundekrav',
    title: 'Kundekrav, tilbud, kontrakt og oppstart',
    category: 'kjerne',
    executable: true,
    purpose: 'Avklare krav, kapasitet og kompetanse før tilbud og kontrakt, og etablere prosjekt med kvalitetsplan.',
    inputs: 'Kundeforespørsel, anbud', outputs: 'Kontrakt, prosjekt og kvalitetsplan', kpi: 'Kontrakter gjennomgått før aksept',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Kundeforespørsel'),
        n('b', 'form', 'Kontraktsgjennomgang', { formKey: 'SF19_KONTRAKT', ...R('project_manager', 'Prosjektleder') }),
        n('c', 'decision', 'Kompetanse, kapasitet og lovkrav OK?', R('manager', 'Leder')),
        n('d', 'activity', 'Avklar / avstå / revider', R('project_manager', 'Prosjektleder')),
        n('e1', 'approval', 'Tilbud godkjennes', R('manager', 'Leder')),
        n('f', 'activity', 'Kontrakt og kontroll', R('manager', 'Leder')),
        n('g', 'form', 'Prosjektkvalitetsplan', { formKey: 'SF20_KVALITETSPLAN', ...R('project_manager', 'Prosjektleder') }),
        n('e', 'end', 'Prosjekt startet'),
      ],
      edges: [['s', 'b'], ['b', 'c'], ['c', 'e1', 'yes', 'Ja'], ['c', 'd', 'no', 'Nei'], ['d', 'b'], ['e1', 'f', 'approved', 'Godkjent'], ['e1', 'd', 'rejected', 'Avvist'], ['f', 'g'], ['g', 'e']],
    }),
  },
  {
    key: 'P05_prosjektering',
    title: 'Prosjektering og fagkontroll',
    category: 'kjerne',
    executable: true,
    purpose: 'Planlegge prosjektering, kontrollere leveranser og frigi sporbar revisjon.',
    inputs: 'Godkjente kravinput', outputs: 'Frigitt leveranse med kontrollspor', kpi: 'Leveranser frigitt etter kontroll',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Kravinput godkjent'),
        n('b', 'activity', 'Planlegg prosjektering', R('project_manager', 'Prosjektleder')),
        n('c', 'activity', 'Utarbeid leveranse/revisjon', R('process_owner', 'Fagansvarlig')),
        n('d', 'form', 'Fag- og samordningskontroll', { formKey: 'SF21_FAGKONTROLL', ...R('process_owner', 'Kontrollør') }),
        n('e1', 'decision', 'Kontroll godkjent?', R('process_owner', 'Kontrollør')),
        n('f', 'activity', 'Registrer merknader og korriger', R('process_owner', 'Fagansvarlig')),
        n('g', 'decision', 'Behov for validering?', R('project_manager', 'Prosjektleder')),
        n('h', 'activity', 'Valider egnethet', R('project_manager', 'Prosjektleder')),
        n('i', 'approval', 'Frigi revisjon', R('project_manager', 'Prosjektleder')),
        n('e', 'end', 'Distribuert gjeldende revisjon'),
      ],
      edges: [['s', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e1'], ['e1', 'g', 'yes', 'Ja'], ['e1', 'f', 'no', 'Nei'], ['f', 'c'], ['g', 'h', 'yes', 'Ja'], ['g', 'i', 'no', 'Nei, vurdert'], ['h', 'i'], ['i', 'e', 'approved', 'Godkjent'], ['i', 'f', 'rejected', 'Avvist']],
    }),
  },
  {
    key: 'P06_risiko',
    title: 'Risikovurdering og tiltak',
    category: 'stotte',
    executable: true,
    purpose: 'Identifisere og vurdere risiko med godkjent metode, prioritere tiltak og revurdere rest-risiko.',
    inputs: 'Kontekst, endring, hendelse', outputs: 'Oppdatert risikoregister', kpi: 'Risikoer med gyldig vurdering',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Behov for vurdering'),
        n('b', 'activity', 'Identifiser risiko/fare', R('process_owner', 'Risikoeier')),
        n('d', 'form', 'Vurder sannsynlighet og konsekvens', { formKey: 'SF07_RISIKO', ...R('process_owner', 'Risikoeier') }),
        n('e1', 'decision', 'Innen akseptkriterier?', R('manager', 'Leder')),
        n('f', 'task', 'Gjennomfør tiltak', R('process_owner', 'Tiltaksansvarlig')),
        n('h', 'approval', 'Godkjenn vurdering', R('manager', 'Leder')),
        n('e', 'end', 'Register oppdatert'),
      ],
      edges: [['s', 'b'], ['b', 'd'], ['d', 'e1'], ['e1', 'h', 'yes', 'Ja'], ['e1', 'f', 'no', 'Nei'], ['f', 'd'], ['h', 'e', 'approved', 'Godkjent'], ['h', 'd', 'rejected', 'Avvist']],
    }),
  },
  {
    key: 'P07_miljo',
    title: 'Miljøaspekter og samsvarsforpliktelser',
    category: 'stotte',
    executable: true,
    purpose: 'Identifisere miljøaspekter i livsløpsperspektiv og vurdere vesentlighet og etterlevelse.',
    inputs: 'Aktiviteter og tjenester', outputs: 'Vurderte miljøaspekter', kpi: 'Vesentlige aspekter med tiltak',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Aktivitet/livsløpstrinn'),
        n('b', 'form', 'Miljøaspekt og vesentlighet', { formKey: 'SF10_MILJOASPEKT', ...R('hse_manager', 'Miljøansvarlig') }),
        n('e1', 'decision', 'Vesentlig aspekt?', R('hse_manager', 'Miljøansvarlig')),
        n('f', 'task', 'Operativ kontroll, mål og tiltak', R('hse_manager', 'Miljøansvarlig')),
        n('g', 'activity', 'Dokumenter vurdering', R('hse_manager', 'Miljøansvarlig')),
        n('h', 'form', 'Vurder etterlevelse', { formKey: 'SF26_SAMSVAR', ...R('hse_manager', 'Miljøansvarlig') }),
        n('e', 'end', 'Planlegg måling/revurdering'),
      ],
      edges: [['s', 'b'], ['b', 'e1'], ['e1', 'f', 'yes', 'Ja'], ['e1', 'g', 'no', 'Nei'], ['f', 'h'], ['g', 'h'], ['h', 'e']],
    }),
  },
  {
    key: 'P08_kompetanse',
    title: 'Kompetanse og autorisasjon',
    category: 'stotte',
    executable: true,
    purpose: 'Sikre dokumentert kompetanse før tildeling av rolle eller oppgave.',
    inputs: 'Rollekrav', outputs: 'Kompetansebevis og tildeling', kpi: 'Kompetansegap',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Rolle/oppgave'),
        n('b', 'activity', 'Koble person og krav', R('manager', 'Leder')),
        n('c', 'decision', 'Gyldig kompetanse?', R('manager', 'Leder')),
        n('d', 'task', 'Opplæring/kvalifisering', R('employee', 'Ansatt')),
        n('e1', 'control', 'Vurder effekt og registrer bevis', R('manager', 'Leder')),
        n('f', 'activity', 'Tildel rolle', R('manager', 'Leder')),
        n('e', 'end', 'Kvalifisert'),
      ],
      edges: [['s', 'b'], ['b', 'c'], ['c', 'f', 'yes', 'Ja'], ['c', 'd', 'no', 'Nei'], ['d', 'e1'], ['e1', 'c'], ['f', 'e']],
    }),
  },
  {
    key: 'P09_dokument',
    title: 'Styrt dokumentrevisjon',
    category: 'stotte',
    executable: true,
    purpose: 'Ny revisjon av styrt dokument med fagkontroll, godkjenning og varsling.',
    inputs: 'Endringsbehov', outputs: 'Publisert revisjon', kpi: 'Dokumenter med forfalt revisjon',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Endringsbehov'),
        n('b', 'activity', 'Ny revisjon av dokument', R('process_owner', 'Dokumenteier')),
        n('c', 'control', 'Fagkontroll', R('quality_manager', 'Kvalitetsleder')),
        n('d', 'approval', 'Godkjenn', R('manager', 'Godkjenner')),
        n('f', 'notify', 'Varsle berørte'),
        n('e', 'end', 'Revisjon publisert'),
      ],
      edges: [['s', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'f', 'approved', 'Godkjent'], ['d', 'b', 'rejected', 'Avvist'], ['f', 'e']],
    }),
  },
  {
    key: 'P10_internrevisjon',
    title: 'Internrevisjon med funn og oppfølging',
    category: 'ledelse',
    executable: true,
    purpose: 'Planlegge og gjennomføre internrevisjon etter risikobasert program, og følge opp funn.',
    inputs: 'Revisjonsprogram', outputs: 'Rapport, funn og tiltak', kpi: 'Revisjoner gjennomført etter plan',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Revisjonsprogram'),
        n('b', 'activity', 'Planlegg revisor, omfang og kriterier', R('internal_auditor', 'Internrevisor')),
        n('c', 'checklist', 'Gjennomfør revisjon', R('internal_auditor', 'Internrevisor')),
        n('d', 'decision', 'Avvik funnet?', R('internal_auditor', 'Internrevisor')),
        n('f', 'task', 'Opprett avvik og tiltak', R('quality_manager', 'Kvalitetsleder')),
        n('g', 'approval', 'Godkjenn rapport', R('manager', 'Leder')),
        n('e', 'end', 'Rapport distribuert'),
      ],
      edges: [['s', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'f', 'yes', 'Ja'], ['d', 'g', 'no', 'Nei'], ['f', 'g'], ['g', 'e', 'approved', 'Godkjent'], ['g', 'c', 'rejected', 'Avvist']],
    }),
  },
  {
    key: 'P11_ledelse',
    title: 'Ledelsens gjennomgang',
    category: 'ledelse',
    executable: true,
    purpose: 'Samle grunnlag, gjennomføre møte, fatte beslutninger og følge dem opp.',
    inputs: 'Mål, KPI, revisjoner, avvik, lovetterlevelse', outputs: 'Godkjent referat og tiltak', kpi: 'Vedtak gjennomført',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Periode'),
        n('a', 'activity', 'Hent grunnlag', R('quality_manager', 'Kvalitetsleder')),
        n('c', 'activity', 'Møte og diskusjon', R('top_management', 'Øverste ledelse')),
        n('d', 'approval', 'Godkjenn referat', R('top_management', 'Øverste ledelse')),
        n('f', 'task', 'Følg opp vedtak', R('manager', 'Leder')),
        n('e', 'end', 'Vedtak fulgt opp'),
      ],
      edges: [['s', 'a'], ['a', 'c'], ['c', 'd'], ['d', 'f', 'approved', 'Godkjent'], ['d', 'c', 'rejected', 'Avvist'], ['f', 'e']],
    }),
  },
  {
    key: 'P12_beredskap',
    title: 'Beredskapsøvelse og evaluering',
    category: 'stotte',
    executable: true,
    purpose: 'Planlegge og gjennomføre øvelser, evaluere og forbedre beredskapsplanen.',
    inputs: 'Scenario og plan', outputs: 'Evaluert øvelse og tiltak', kpi: 'Øvelser etter plan',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Scenario'),
        n('b', 'activity', 'Planlegg øvelse', R('hse_manager', 'Beredskapsansvarlig')),
        n('c', 'manual_event', 'Gjennomfør øvelse', R('hse_manager', 'Beredskapsansvarlig')),
        n('d', 'form', 'Evaluer', { formKey: 'SF15_BEREDSKAP', ...R('hse_manager', 'Beredskapsansvarlig') }),
        n('e1', 'decision', 'Behov for forbedring?', R('hse_manager', 'Beredskapsansvarlig')),
        n('f', 'task', 'Tiltak og planrevisjon', R('hse_manager', 'Beredskapsansvarlig')),
        n('e', 'end', 'Rapport arkivert'),
      ],
      edges: [['s', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'e1'], ['e1', 'f', 'yes', 'Ja'], ['e1', 'e', 'no', 'Nei'], ['f', 'e']],
    }),
  },
  {
    key: 'P13_leverandor',
    title: 'Leverandørkvalifisering og evaluering',
    category: 'stotte',
    executable: true,
    purpose: 'Kvalifisere leverandører etter kritikalitet, stille krav og evaluere leveranser.',
    inputs: 'Behov for leveranse', outputs: 'Godkjent leverandør og evaluering', kpi: 'Leverandører med gyldig evaluering',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Behov'),
        n('a', 'activity', 'Definer krav og kritikalitet', R('manager', 'Innkjøpsansvarlig')),
        n('b', 'form', 'Forhåndsevaluer', { formKey: 'SF22_LEVERANDOR', ...R('manager', 'Innkjøpsansvarlig') }),
        n('c', 'approval', 'Godkjenn leverandør', R('manager', 'Leder')),
        n('d', 'activity', 'Avvis / avklar', R('manager', 'Innkjøpsansvarlig')),
        n('f', 'activity', 'Følg opp leveranse', R('project_manager', 'Prosjektleder')),
        n('e', 'end', 'Reevaluert'),
      ],
      edges: [['s', 'a'], ['a', 'b'], ['b', 'c'], ['c', 'f', 'approved', 'Godkjent'], ['c', 'd', 'rejected', 'Avvist'], ['d', 'b'], ['f', 'e']],
    }),
  },
  {
    key: 'SJA',
    title: 'Sikker jobbanalyse (SJA)',
    category: 'stotte',
    executable: true,
    purpose: 'Vurdere risiko før arbeid med særlig fare. Aktiveres etter arbeidsoppgave og risiko, ikke som generelt ISO-krav.',
    inputs: 'Arbeidsoppgave', outputs: 'Godkjent SJA', kpi: 'SJA gjennomført før oppstart',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Arbeid planlegges'),
        n('a', 'form', 'Gjennomfør SJA', { formKey: 'SF12_SJA', ...R('project_manager', 'Arbeidsleder') }),
        n('b', 'decision', 'Akseptabel risiko?', R('project_manager', 'Arbeidsleder')),
        n('c', 'task', 'Iverksett tiltak', R('project_manager', 'Arbeidsleder')),
        n('d', 'approval', 'Godkjenn oppstart', R('manager', 'Ansvarlig leder')),
        n('e', 'end', 'Arbeid kan starte'),
      ],
      edges: [['s', 'a'], ['a', 'b'], ['b', 'd', 'yes', 'Ja'], ['b', 'c', 'no', 'Nei'], ['c', 'a'], ['d', 'e', 'approved', 'Godkjent'], ['d', 'a', 'rejected', 'Avvist']],
    }),
  },
  {
    key: 'P01_pdca',
    title: 'Ledelsessystemets PDCA-syklus',
    category: 'ledelse',
    executable: false,
    purpose: 'Oversikt over hvordan ledelsessystemet planlegges, gjennomføres, kontrolleres og forbedres. Navigasjon, ikke automatikk.',
    inputs: 'Kontekst og krav', outputs: 'Forbedret ledelsessystem', kpi: '',
    diagram: () => buildDiagram({
      nodes: [
        n('s', 'start', 'Start'),
        n('c', 'activity', 'Kontekst, interessenter og krav', { ...R('top_management', 'Ledelse'), onClick: { type: 'openModule', ref: 'kontekst' } }),
        n('p', 'activity', 'Policy, ansvar, mål og risiko', { ...R('top_management', 'Ledelse'), onClick: { type: 'openModule', ref: 'risiko' } }),
        n('d', 'activity', 'Prosesser, kompetanse og drift', { ...R('process_owner', 'Prosesseiere'), onClick: { type: 'openModule', ref: 'prosesser' } }),
        n('e1', 'activity', 'Overvåking, KPI og lovetterlevelse', { ...R('quality_manager', 'Kvalitetsleder'), onClick: { type: 'openModule', ref: 'mal' } }),
        n('a', 'activity', 'Internrevisjon og ledelsens gjennomgang', { ...R('internal_auditor', 'Revisor/ledelse'), onClick: { type: 'openModule', ref: 'revisjon' } }),
        n('f', 'activity', 'Avvik og forbedring', { ...R('quality_manager', 'Kvalitetsleder'), onClick: { type: 'openModule', ref: 'avvik' } }),
        n('e', 'end', 'Ny syklus'),
      ],
      edges: [['s', 'c'], ['c', 'p'], ['p', 'd'], ['d', 'e1'], ['e1', 'a'], ['a', 'f'], ['f', 'e']],
    }),
  },
];

export function templateByKey(key) {
  const t = PROCESS_TEMPLATES.find((row) => row.key === key);
  if (!t) return null;
  return { ...t, diagram: t.diagram() };
}
