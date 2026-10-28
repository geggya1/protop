import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, Text, View, useWindowDimensions } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { useShellWide } from '../../components/ModuleAside';
import { prettyDate } from '../../src/iso/core';
import { ISO_ROLES } from '../../src/iso/catalog';
import {
  CLICK_ACTIONS, EDGE_CONDITIONS, ENTER_ACTIONS, NODE_TYPES, PROCESS_CATEGORIES, VERSION_STATES,
  alignNodes, approveAndPublish, archiveProcess, cancelInstance, completeStep, createProcess, diagramToSvg, diffDiagrams, distributeNodes,
  draftVersion, duplicateNodes, exportProcessJson, focusView, groupNodes, groupOf, importProcessJson, makeEdge, makeNode, moveNodes, nodeRole, reorderProcesses,
  nodeType, normalizeDiagram, removeNodes, ungroup,
  publishedVersionOf, rejectVersion, saveDraftDiagram, snap, startInstance, startNewVersion, stepBlocker, submitForApproval,
  validateDiagram, versionOf,
} from '../../src/iso/processes';
import { PROCESS_TEMPLATES, templateByKey } from '../../src/iso/processTemplates';
import IsoDiagram, { fitView } from './IsoDiagram';
import ProcessFlow from './IsoProcessFlow';
import { anbudMenuTitle, arbeidMenuTitle, hrMenuTitle, isoMenuTitle, okonomiMenuTitle, selskapMenuTitle } from '../../src/navigation/shellModules';
import IsoProcessMap, { sortProcesses } from './IsoProcessMap';
import IsoMarkdown from './IsoMarkdown';
import { VisioImportSheet } from './IsoVisio';
import { riskSummary } from '../../src/iso/registers';
import { FormFillSheet } from './IsoForms';
import {
  Banner, Btn, Card, Choice, Empty, Field, KV, ListRow, Page, PersonPick, Pill, Row, Sheet, TextIn,
} from './isoUi';

const VSTATE_TONE = { utkast: 'muted', til_godkjenning: 'warn', godkjent: 'info', publisert: 'ok', erstattet: 'muted', avvist: 'danger' };

function download(name, mime, content) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

function exportPng(svg, name) {
  if (Platform.OS !== 'web') return;
  const img = new window.Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  img.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = img.width * 2;
    canvas.height = img.height * 2;
    const g = canvas.getContext('2d');
    g.scale(2, 2);
    g.drawImage(img, 0, 0);
    canvas.toBlob((blob) => blob && download(name, 'image/png', blob));
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

function exportPdf(svg, title) {
  if (Platform.OS !== 'web') return;
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><title>${title.replace(/</g, '')}</title><style>@page{size:A4 landscape;margin:12mm}body{margin:0}svg{max-width:100%;height:auto}</style></head><body>${svg}<script>setTimeout(function(){window.print()},300)</script></body></html>`);
  w.document.close();
}

export default function IsoProcesses({ ctx }) {
  const { state, params } = ctx;
  const [view, setView] = useState({ mode: 'library', id: '', instanceId: '' });
  useEffect(() => {
    if (params?.instance) setView({ mode: 'run', instanceId: params.instance, id: '' });
    else if (params?.open) setView({ mode: 'detail', id: params.open, instanceId: '' });
    else if (params?.design) setView({ mode: 'design', id: params.design, instanceId: '' });
  }, [params]);
  const proc = state.processes.find((p) => p.id === view.id) || null;
  const inst = state.instances.find((i) => i.id === view.instanceId) || null;
  if (view.mode === 'design' && proc) return <ProcessDesigner ctx={ctx} proc={proc} onBack={() => setView({ mode: 'detail', id: proc.id })} />;
  if (view.mode === 'detail' && proc) return <ProcessDetail ctx={ctx} proc={proc} onBack={() => setView({ mode: 'library' })} onDesign={() => setView({ mode: 'design', id: proc.id })} onRun={(id) => setView({ mode: 'run', instanceId: id })} />;
  if (view.mode === 'run' && inst) return <ProcessRun ctx={ctx} instance={inst} onBack={() => setView({ mode: 'library' })} />;
  return <ProcessLibrary ctx={ctx} onOpen={(id) => setView({ mode: 'detail', id })} onRun={(id) => setView({ mode: 'run', instanceId: id })} onDesign={(id) => setView({ mode: 'design', id })} />;
}

function ProcessLibrary({ ctx, onOpen, onRun, onDesign }) {
  const colors = useColors();
  const { state, caps, actor, store, wide, people } = ctx;
  const [creating, setCreating] = useState(false);
  const [q, setQ] = useState('');
  const [form, setForm] = useState({ title: '', category: 'kjerne', ownerName: '', ownerUid: '', template: '' });
  const [err, setErr] = useState('');
  const [importText, setImportText] = useState('');
  const [visio, setVisio] = useState(false);
  const live = state.processes.filter((p) => !p.archived && (!q || `${p.code || ''} ${p.title}`.toLowerCase().includes(q.toLowerCase())));
  const visibleToStaff = (p) => caps.manage || p.publishedVersion;
  const mineActive = state.instances.filter((i) => i.state === 'aktiv');

  /** Ny rekkefølge i landskapet: { kategori: [ids] }. Lagres én og én med revisjonslås. */
  async function saveOrder(lists) {
    for (const ids of Object.values(lists)) {
      for (const { process, event } of reorderProcesses(store.current().processes, ids, { actor })) {
        const previous = store.current().processes.find((p) => p.id === process.id);
        const res = await store.commit('processes', 'process', { ok: true, process, events: [event] }, { previous });
        if (!res.ok) return res;
      }
    }
    return { ok: true };
  }

  async function create() {
    let template = form.template ? templateByKey(form.template) : null;
    if (form.template === 'import') {
      const imp = importProcessJson(importText);
      if (!imp.ok) { setErr(imp.error); return; }
      template = imp.template;
    }
    const res = createProcess({ ...form, title: form.title || template?.title || '' }, { actor, template });
    if (!res.ok) { setErr(res.error); return; }
    const saved = await store.commit('processes', 'process', res);
    if (!saved.ok) { setErr(saved.error); return; }
    setCreating(false);
    onDesign(res.process.id);
  }

  return (
    <Page
      wide={wide}
      crumb={['Prosesser']}
      title="Prosesslandskap"
      intro="Ledelses-, kjerne- og støtteprosesser. Klikk en prosess for detaljer, eller start den i daglig arbeid. Bare publiserte versjoner kan brukes."
      actions={caps.manage ? (
        <>
          <Btn icon="document-attach-outline" label="Importer fra Visio" onPress={() => setVisio(true)} />
          <Btn kind="primary" icon="add" label="Ny prosess" onPress={() => { setErr(''); setCreating(true); }} />
        </>
      ) : null}
    >
      <VisioImportSheet ctx={ctx} visible={visio} onClose={() => setVisio(false)} onCreated={(id) => { setVisio(false); onDesign(id); }} />
      {mineActive.length ? (
        <Card title="Aktive saker" subtitle="Prosessinstanser som pågår">
          {mineActive.slice(0, 8).map((i) => <ListRow key={i.id} icon="play-circle-outline" title={i.title} subtitle={`${i.processTitle} v${i.version} · startet ${prettyDate(i.startedAt)} av ${i.startedBy}`} onPress={() => onRun(i.id)} />)}
        </Card>
      ) : null}
      {!q ? <IsoProcessMap processes={state.processes.filter(visibleToStaff)} onOpen={onOpen} wide={wide} onReorder={caps.manage ? saveOrder : null} /> : null}
      <TextIn value={q} onChangeText={setQ} placeholder="Søk i prosesser" />
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
        {PROCESS_CATEGORIES.map((cat) => {
          const list = sortProcesses(live.filter((p) => p.category === cat.id && visibleToStaff(p)));
          return (
            <Card key={cat.id} title={cat.label} style={{ ...(wide ? { flex: 1 } : { width: '100%' }) }}>
              {!list.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen prosesser.</Text> : null}
              {list.map((p) => {
                const draft = draftVersion(p);
                const running = state.instances.filter((i) => i.processId === p.id && i.state === 'aktiv').length;
                return (
                  <ListRow
                    key={p.id}
                    nativeID={`iso-proc-${p.id}`}
                    icon="git-network-outline"
                    title={`${p.code ? `${p.code} ` : ''}${p.title}`}
                    subtitle={[p.ownerName ? `Eier: ${p.ownerName}` : 'Mangler eier', p.publishedVersion ? `v${p.publishedVersion} publisert` : 'Ikke publisert', draft && caps.manage ? `utkast v${draft.version} (${VERSION_STATES[draft.state]})` : '', running ? `${running} aktive` : ''].filter(Boolean).join(' · ')}
                    right={p.publishedVersion ? <Pill label="I bruk" tone="ok" /> : <Pill label="Utkast" tone="muted" />}
                    onPress={() => onOpen(p.id)}
                  />
                );
              })}
            </Card>
          );
        })}
      </View>
      {!state.processes.length ? (
        <Empty icon="git-network-outline" title="Ingen prosesser ennå" text="Start fra en mal (f.eks. Avviksbehandling) eller tegn din egen. Malen kopieres og kan endres fritt." action={caps.manage ? <Btn kind="primary" label="Ny prosess" onPress={() => setCreating(true)} /> : null} />
      ) : null}

      <Sheet visible={creating} title="Ny prosess" onClose={() => setCreating(false)} footer={<><Btn label="Avbryt" onPress={() => setCreating(false)} /><Btn kind="primary" label="Opprett og åpne bygger" onPress={create} /></>}>
        <Field label="Start fra">
          <Choice options={[{ id: '', label: 'Tom prosess' }, ...PROCESS_TEMPLATES.map((t) => ({ id: t.key, label: t.title })), { id: 'import', label: 'Importer JSON' }]} value={form.template} onChange={(x) => setForm({ ...form, template: x || '', title: form.title || (templateByKey(x)?.title || ''), category: templateByKey(x)?.category || form.category })} />
        </Field>
        {form.template === 'import' ? <Field label="Lim inn ProTop-prosessfil (JSON)"><TextIn multiline rows={5} value={importText} onChangeText={setImportText} /></Field> : null}
        <Field label="Navn" required><TextIn value={form.title} onChangeText={(x) => setForm({ ...form, title: x })} /></Field>
        <Field label="Kategori"><Choice options={PROCESS_CATEGORIES} value={form.category} onChange={(x) => setForm({ ...form, category: x || 'kjerne' })} /></Field>
        <Field label="Prosesseier" required><PersonPick people={people} value={form.ownerName} onChange={(p) => setForm({ ...form, ownerName: p.name, ownerUid: p.uid })} /></Field>
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
      </Sheet>
    </Page>
  );
}

function ProcessDetail({ ctx, proc, onBack, onDesign, onRun }) {
  const colors = useColors();
  const { state, caps, actor, store, wide, projects } = ctx;
  const { width } = useWindowDimensions();
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [startOpen, setStartOpen] = useState(false);
  const [startForm, setStartForm] = useState({ title: '', projectId: '' });
  const [reason, setReason] = useState('');
  const [showVersion, setShowVersion] = useState(proc.publishedVersion || (proc.versions || []).at(-1)?.version);
  const pub = publishedVersionOf(proc);
  const draft = draftVersion(proc);
  const version = versionOf(proc, showVersion) || pub || draft;
  const diagram = normalizeDiagram(version?.diagram || { nodes: [], edges: [] });
  const [compareWith, setCompareWith] = useState(0);
  const base = compareWith && compareWith !== version?.version ? versionOf(proc, compareWith) : null;
  const diff = useMemo(() => (base ? diffDiagrams(base.diagram, version?.diagram) : null), [base, version]);
  const fit = fitView(diagram, wide ? Math.min(width - 340, 1200) : width - 32, 420);
  const [view, setViewState] = useState(fit);
  useEffect(() => { setViewState(fitView(diagram, wide ? Math.min(width - 340, 1200) : width - 32, 420)); }, [showVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  const instances = state.instances.filter((i) => i.processId === proc.id);
  const context = { forms: state.forms, documents: state.documents, processes: state.processes };
  const [nodeSel, setNodeSel] = useState(null);
  // Flyt (steg for steg) er standard. Kartet med svømmebaner er et valg, og brukes ved sammenligning av versjoner.
  const [mode, setMode] = useState('flyt');
  const docs = state.documents.filter((d) => !d.archived && ((proc.documentIds || []).includes(d.id) || (d.processIds || []).includes(proc.id)) && (caps.manage || d.publishedRevision));
  const risks = (state.records?.risiko || []).filter((r) => r.processId === proc.id && !['lukket', 'arkivert'].includes(r.state));
  // Verdikjeden: hvilke prosesser leder hit, og hvor går den videre.
  const pointsTo = (p, id) => (publishedVersionOf(p) || (p.versions || []).at(-1))?.diagram?.nodes?.some((n) => n.onClick?.type === 'openProcess' && n.onClick.ref === id);
  const fromProcs = state.processes.filter((p) => p.id !== proc.id && !p.archived && pointsTo(p, proc.id));
  const toProcs = state.processes.filter((p) => p.id !== proc.id && !p.archived && diagram.nodes.some((n) => n.onClick?.type === 'openProcess' && n.onClick.ref === p.id));

  async function run(label, result, key = 'process', kind = 'processes', previous = proc) {
    setErr(''); setMsg('');
    if (!result.ok) { setErr(result.error); return result; }
    const saved = await store.commit(kind, key, result, { previous });
    if (!saved.ok) setErr(saved.error); else setMsg(label);
    return saved;
  }

  async function start() {
    const project = projects.find((p) => p.id === startForm.projectId);
    const res = startInstance(proc, { title: startForm.title || `${proc.title} ${prettyDate(new Date().toISOString())}`, projectId: project?.id, projectName: project ? `${project.number || ''} ${project.name || ''}`.trim() : '' }, { actor });
    const saved = await run('Saken er startet', res, 'instance', 'instances', null);
    if (saved?.ok) { setStartOpen(false); onRun(res.instance.id); }
  }

  return (
    <Page
      wide={wide}
      back={{ label: 'Prosesslandskap', onPress: onBack }}
      title={`${proc.code ? `${proc.code} ` : ''}${proc.title}`}
      intro={proc.purpose}
      actions={(
        <>
          {pub && proc.executable !== false ? <Btn kind="primary" icon="play" label="Bruk prosess" onPress={() => setStartOpen(true)} /> : null}
          {caps.manage ? <Btn icon="create-outline" label={draft ? 'Rediger utkast' : 'Ny versjon'} onPress={async () => {
            if (!draft) {
              const res = startNewVersion(proc, { actor });
              const saved = await run('Nytt utkast', res);
              if (!saved?.ok) return;
            }
            onDesign();
          }} /> : null}
        </>
      )}
    >
      {msg ? <Banner tone="ok" text={msg} /> : null}
      {err ? <Banner tone="danger" text={err} /> : null}
      {!pub ? <Banner tone="warn" text="Prosessen er ikke publisert. Ansatte ser bare publiserte versjoner." /> : null}
      <Row>
        <Choice
          small
          title="Versjon"
          clearable={false}
          options={(proc.versions || []).map((v) => ({ id: String(v.version), label: `v${v.version} · ${VERSION_STATES[v.state]}` }))}
          value={String(showVersion || '')}
          onChange={(x) => { if (x) setShowVersion(Number(x)); }}
        />
        {(proc.versions || []).length > 1 ? (
          <Btn
            small
            icon="git-compare-outline"
            label={compareWith ? 'Avslutt sammenligning' : 'Sammenlign versjoner'}
            onPress={() => {
              if (compareWith) { setCompareWith(0); return; }
              const list = proc.versions || [];
              const latest = list.at(-1)?.version;
              // Vanligst: nyeste utkast mot gjeldende versjon.
              if (latest && latest !== version?.version) { setCompareWith(version?.version); setShowVersion(latest); return; }
              setCompareWith(list.filter((v) => v.version < (version?.version || 0)).at(-1)?.version || 0);
            }}
          />
        ) : null}
      </Row>
      {compareWith ? (
        <Card title={`Endringer fra v${compareWith} til v${version?.version}`} subtitle={diff?.summary}>
          <Row>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Sammenlign med:</Text>
            <Choice
              small
              title="Sammenlign med"
              clearable={false}
              options={(proc.versions || []).filter((v) => v.version !== version?.version).map((v) => ({ id: String(v.version), label: `v${v.version}` }))}
              value={String(compareWith || '')}
              onChange={(x) => { if (x) setCompareWith(Number(x)); }}
            />
          </Row>
          {diff?.added.map((n) => <ListRow key={`a${n.id}`} icon="add-circle-outline" tone="ok" title={`Ny: ${n.label}`} subtitle={nodeType(n.type).label} />)}
          {diff?.changed.map((c) => <ListRow key={`c${c.id}`} icon="create-outline" tone="warn" title={`Endret: ${c.label}`} subtitle={`${c.fields.join(', ')}${c.before !== c.label ? ` (før: ${c.before})` : ''}`} />)}
          {diff?.removed.map((n) => <ListRow key={`r${n.id}`} icon="remove-circle-outline" tone="danger" title={`Fjernet: ${n.label}`} subtitle={nodeType(n.type).label} />)}
          {diff && (diff.edgesAdded.length || diff.edgesRemoved.length) ? <Text style={{ color: colors.muted, fontSize: 12 }}>Koblinger: {diff.edgesAdded.length} nye, {diff.edgesRemoved.length} fjernet.{diff.lanesChanged ? ' Ansvarsbaner er endret.' : ''}</Text> : null}
          <Text style={{ color: colors.muted, fontSize: 12 }}>Nye og endrede bokser er merket i diagrammet.</Text>
        </Card>
      ) : null}
      {!compareWith ? (
        <Choice
          options={[{ id: 'flyt', label: 'Flyt', icon: 'list-outline' }, { id: 'kart', label: 'Kart', icon: 'git-network-outline' }]}
          value={mode}
          onChange={(x) => setMode(x || 'flyt')}
          clearable={false}
        />
      ) : null}
      {mode === 'flyt' && !compareWith ? (
        <ProcessFlow diagram={diagram} onSelect={setNodeSel} targetLabel={(n) => (nodeHasTarget(n) ? nodeTargetLabel(ctx, n) : '')} />
      ) : (
        <IsoDiagram
          marks={diff?.marks || null}
          diagram={diagram}
          scale={view.scale}
          offset={view.offset}
          onPan={(o) => setViewState({ ...view, offset: o })}
          onSelectNode={(id) => {
            const node = diagram.nodes.find((n) => n.id === id);
            if (node) setNodeSel(node);
          }}
          height={wide ? 460 : 380}
        />
      )}
      <Text style={{ color: colors.muted, fontSize: 12 }}>{mode === 'flyt' && !compareWith ? 'Trykk på et steg for detaljer, dokumenter og hvor det gjøres i ProTop.' : 'Trykk på en boks for detaljer, dokumenter og hvor trinnet utføres i ProTop. Dra for å flytte kartet.'}</Text>
      {fromProcs.length || toProcs.length ? (
        <Row>
          {fromProcs.map((p) => <Btn key={p.id} small icon="arrow-back" label={`Fra ${p.code ? `${p.code} ` : ''}${p.title}`} onPress={() => ctx.go('prosesser', { open: p.id })} />)}
          {toProcs.map((p) => <Btn key={p.id} small icon="arrow-forward" label={`Videre til ${p.code ? `${p.code} ` : ''}${p.title}`} onPress={() => ctx.go('prosesser', { open: p.id })} />)}
        </Row>
      ) : null}
      <NodeSheet ctx={ctx} diagram={diagram} node={nodeSel} onClose={() => setNodeSel(null)} />
      <Row>
        {mode === 'kart' || compareWith ? (
          <>
            <Btn small icon="remove" accessibilityLabel="Zoom ut" onPress={() => setViewState({ ...view, scale: Math.max(0.3, view.scale - 0.1) })} />
            <Text style={{ color: colors.muted }}>{Math.round(view.scale * 100)} %</Text>
            <Btn small icon="add" accessibilityLabel="Zoom inn" onPress={() => setViewState({ ...view, scale: Math.min(2, view.scale + 0.1) })} />
            <Btn small label="Tilpass" onPress={() => setViewState(fitView(diagram, wide ? Math.min(width - 340, 1200) : width - 32, 420))} />
          </>
        ) : null}
        {Platform.OS === 'web' ? (
          <>
            <Btn small icon="download-outline" label="SVG" onPress={() => download(`${proc.title}-v${version?.version}.svg`, 'image/svg+xml', diagramToSvg(diagram, { title: proc.title, subtitle: `v${version?.version} · ${VERSION_STATES[version?.state]} · eier ${proc.ownerName}` }))} />
            <Btn small icon="image-outline" label="PNG" onPress={() => exportPng(diagramToSvg(diagram, { title: proc.title, subtitle: `v${version?.version}` }), `${proc.title}-v${version?.version}.png`)} />
            <Btn small icon="print-outline" label="PDF" onPress={() => exportPdf(diagramToSvg(diagram, { title: proc.title, subtitle: `v${version?.version} · ${VERSION_STATES[version?.state]} · eier ${proc.ownerName}` }), proc.title)} />
            <Btn small icon="code-download-outline" label="JSON" onPress={() => download(`${proc.title}.protop-prosess.json`, 'application/json', exportProcessJson(proc))} />
          </>
        ) : null}
      </Row>

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
        <Card title="Prosessbeskrivelse" style={{ ...(wide ? { flex: 1 } : { width: '100%' }) }}>
          <KV label="Prosesseier" value={proc.ownerName || 'Ikke satt'} />
          <KV label="Kategori" value={PROCESS_CATEGORIES.find((c) => c.id === proc.category)?.label} />
          <KV label="Input" value={proc.inputs} />
          <KV label="Output" value={proc.outputs} />
          <KV label="KPI" value={proc.kpi} />
          <KV label="Publisert" value={pub ? `v${pub.version} ${prettyDate(pub.publishedAt)} av ${pub.publishedBy}` : 'Nei'} />
          {version?.rejectNote ? <Banner tone="danger" text={`Avvist: ${version.rejectNote}`} /> : null}
        </Card>
        <Card title="Styrende dokumenter" subtitle="Prosedyrer, instrukser og maler for prosessen." style={{ ...(wide ? { flex: 1 } : { width: '100%' }) }}>
          {!docs.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen dokumenter koblet. Velg dem under «Rediger utkast».</Text> : null}
          {docs.map((d) => <ListRow key={d.id} icon="document-text-outline" title={`${d.code} · ${d.title}`} subtitle={d.publishedRevision ? `rev. ${d.publishedRevision}` : 'ikke publisert'} onPress={() => ctx.go('dokumenter', { open: d.id })} />)}
        </Card>
        <Card title="Saker" style={{ ...(wide ? { flex: 1 } : { width: '100%' }) }}>
          {!instances.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen saker er startet.</Text> : null}
          {instances.slice(0, 20).map((i) => (
            <ListRow key={i.id} icon={i.state === 'aktiv' ? 'play-circle-outline' : 'checkmark-done-outline'} title={i.title} subtitle={`v${i.version} · ${i.state === 'aktiv' ? 'pågår' : (i.state === 'fullfort' ? 'fullført' : 'avbrutt')} · ${prettyDate(i.startedAt)}`} onPress={() => onRun(i.id)} />
          ))}
        </Card>
      </View>

      {risks.length || caps.manage ? (
        <Card title="Risiko i prosessen" subtitle="Risikoer og muligheter i ISO → Risiko som er koblet til prosessen.">
          {!risks.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen risiko koblet. Velg prosessen på risikoposten i ISO → Risiko.</Text> : null}
          {risks.slice(0, 30).map((r) => {
            const lv = riskSummary(r, state.system.riskMethod);
            const shown = lv.residual.score ? lv.residual : lv.inherent;
            return (
              <ListRow
                key={r.id}
                icon={r.kind === 'Mulighet' ? 'trending-up-outline' : 'warning-outline'}
                tone={['hoy', 'kritisk'].includes(shown.id) ? 'danger' : (shown.id === 'middels' ? 'warn' : 'muted')}
                title={`${r.number} · ${r.title}`}
                subtitle={[r.activity, r.ownerName, shown.score ? `${lv.residual.score ? 'rest' : 'iboende'} ${shown.label} (${shown.score})` : ''].filter(Boolean).join(' · ')}
                right={r.needsReview ? <Pill label="Må gjennomgås" tone="warn" /> : null}
                onPress={() => ctx.go('risiko', { open: r.id })}
              />
            );
          })}
          {risks.length > 30 ? <Text style={{ color: colors.muted, fontSize: 12 }}>+ {risks.length - 30} flere i ISO → Risiko.</Text> : null}
        </Card>
      ) : null}
      {caps.approve && draft?.state === 'til_godkjenning' ? (
        <Card title={`Godkjenning av v${draft.version}`} subtitle={`Sendt av ${draft.submittedBy} ${prettyDate(draft.submittedAt)}`}>
          <Row>
            <Btn kind="primary" icon="checkmark-done" label="Godkjenn og publiser" onPress={() => run(`v${draft.version} er publisert`, approveAndPublish(proc, context, { actor, caps }))} />
          </Row>
          <TextIn value={reason} onChangeText={setReason} placeholder="Merknad ved avvisning" />
          <Btn kind="danger" label="Avvis" onPress={() => run('Avvist', rejectVersion(proc, reason, { actor, caps }))} />
        </Card>
      ) : null}
      {caps.approve ? (
        <Card title="Arkiver">
          <TextIn value={reason} onChangeText={setReason} placeholder="Begrunnelse" />
          <Btn kind="danger" label="Arkiver prosess" onPress={() => run('Arkivert', archiveProcess(proc, reason, { actor, caps, instances: state.instances }))} />
        </Card>
      ) : null}
      <Card title="Historikk">
        {(proc.history || []).slice().reverse().slice(0, 30).map((h, i) => <Text key={i} style={{ color: colors.muted, fontSize: 12 }}>{prettyDate(h.at)} · {h.action} · {h.by}{h.note ? ` · ${h.note}` : ''}</Text>)}
      </Card>

      <Sheet visible={startOpen} title={`Bruk «${proc.title}»`} onClose={() => setStartOpen(false)} footer={<><Btn label="Avbryt" onPress={() => setStartOpen(false)} /><Btn kind="primary" label="Start" onPress={start} /></>}>
        <Text style={{ color: colors.muted, fontSize: 13 }}>Saken låses til v{pub?.version}. Senere endringer i prosessen påvirker ikke denne saken.</Text>
        <Field label="Saksnavn"><TextIn value={startForm.title} onChangeText={(x) => setStartForm({ ...startForm, title: x })} placeholder={proc.title} /></Field>
        {projects.length ? <Field label="Knytt til prosjekt"><Choice small title="Prosjekt" options={projects.map((p) => ({ id: p.id, label: `${p.number || ''} ${p.name || ''}`.trim() }))} value={startForm.projectId} onChange={(x) => setStartForm({ ...startForm, projectId: x })} /></Field> : null}
        {err ? <Text style={{ color: colors.danger }}>{err}</Text> : null}
      </Sheet>
    </Page>
  );
}

/** Har boksen noe å åpne (dokument, skjema, prosess, modul, lenke)? */
export function nodeHasTarget(node) {
  const click = node?.onClick || { type: 'none' };
  return (click.type && click.type !== 'none' && (click.ref || ['openForm', 'openDocument', 'openProcess'].includes(click.type)))
    || (node?.type === 'form' && node.formKey) || !!node?.documentId || (node?.type === 'subprocess' && node.subprocessId);
}

/** Navn på det boksen åpner, til knappen i detaljpanelet. */
const MODULE_NAMES = {
  anbud: 'Anbud', arbeid: 'Arbeid', hr: 'HR', iso: 'ISO', okonomi: 'Økonomi', selskap: 'Selskap', kunder: 'Kunder',
  kontrakt: 'Kontrakt', projects: 'Prosjekt', ansatte: 'Ansatte', utstyr: 'Utstyr', skjema: 'Skjemabygger',
};
const SUB_TITLES = { anbud: anbudMenuTitle, arbeid: arbeidMenuTitle, hr: hrMenuTitle, iso: isoMenuTitle, okonomi: okonomiMenuTitle, selskap: selskapMenuTitle };

/** «tab:anbud/foresporsel» → «Anbud → Forespørsel» (navnene fra menyen). */
export function moduleTargetName(ref) {
  const [tab, sub] = String(ref || '').replace(/^tab:/, '').split('/');
  const name = MODULE_NAMES[tab] || tab;
  const subName = sub ? String((SUB_TITLES[tab] && SUB_TITLES[tab](sub)) || sub).replace(/^[\d.]+\s+/, '') : '';
  return subName && subName !== name && subName !== 'ISO / K-HMS' ? `${name} → ${subName}` : name;
}

export function nodeTargetLabel(ctx, node) {
  const click = node?.onClick || { type: 'none' };
  const docId = click.type === 'openDocument' ? (click.ref || node.documentId) : node.documentId;
  if (click.type === 'openDocument' || (click.type === 'none' && docId)) {
    const d = (ctx.state.documents || []).find((x) => x.id === docId);
    return d ? `Åpne ${d.code} ${d.title}` : 'Åpne dokument';
  }
  if (click.type === 'openProcess' || node?.type === 'subprocess') {
    const p = (ctx.state.processes || []).find((x) => x.id === (click.ref || node.subprocessId));
    return p ? `Gå til ${p.code ? `${p.code} ` : ''}${p.title}` : 'Åpne prosess';
  }
  if (click.type === 'openForm' || node?.type === 'form') return 'Fyll ut skjema';
  if (click.type === 'openModule') return String(click.ref || '').startsWith('tab:') ? `Åpne ${moduleTargetName(click.ref)}` : 'Åpne i ISO';
  if (click.type === 'openUrl') return 'Åpne lenke';
  return 'Åpne';
}

/** Klikkhandling på node i lesemodus. «tab:anbud/vurdering» åpner en annen ProTop-modul. */
export function openNodeTarget(ctx, node) {
  const click = node.onClick || { type: 'none' };
  if (click.type === 'openForm' || (click.type === 'none' && node.type === 'form' && node.formKey)) return ctx.go('skjema', { fill: click.ref || node.formKey });
  if (click.type === 'openDocument' || (click.type === 'none' && node.documentId)) return ctx.go('dokumenter', { open: click.ref || node.documentId });
  if (click.type === 'openProcess' || (node.type === 'subprocess' && node.subprocessId)) return ctx.go('prosesser', { open: click.ref || node.subprocessId });
  if (click.type === 'openModule' && click.ref) {
    const ref = String(click.ref);
    if (ref.startsWith('tab:')) {
      const [tab, subView] = ref.slice(4).split('/');
      return ctx.requestTab ? ctx.requestTab(tab, subView) : null;
    }
    return ctx.go(ref, {});
  }
  if (click.type === 'openUrl' && click.ref) return Linking.openURL(click.ref).catch(() => {});
  return null;
}

/** Detaljer for en boks i prosesskartet: hva, hvem, hvor i ProTop, frist, neste trinn og hva som kan åpnes. */
function NodeSheet({ ctx, diagram, node, onClose }) {
  const colors = useColors();
  if (!node) return null;
  const type = nodeType(node.type);
  const role = nodeRole(diagram, node);
  const outs = diagram.edges.filter((e) => e.from === node.id);
  return (
    <Sheet visible={!!node} title={node.label} onClose={onClose} wide={ctx.wide}>
      <Row>
        <Pill label={type.label} icon={type.icon} tone="info" />
        {role ? <Pill label={role.label} icon="person-outline" /> : null}
        {node.dueDays ? <Pill label={`Frist ${node.dueDays} dager`} icon="time-outline" tone="warn" /> : null}
      </Row>
      {node.description ? <IsoMarkdown text={node.description} /> : <Text style={{ color: colors.muted }}>Ingen beskrivelse.</Text>}
      {node.system ? <KV label="System / datalager" value={node.system} /> : null}
      {node.inputs ? <KV label="Input" value={node.inputs} /> : null}
      {node.outputs ? <KV label="Output" value={node.outputs} /> : null}
      {outs.length ? (
        <View style={{ gap: 2 }}>
          <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13 }}>Neste</Text>
          {outs.map((e) => <Text key={e.id} style={{ color: colors.muted, fontSize: 13 }}>→ {diagram.nodes.find((n) => n.id === e.to)?.label}{e.label ? ` (${e.label})` : ''}</Text>)}
        </View>
      ) : null}
      {nodeHasTarget(node) ? <Btn kind="primary" icon="open-outline" label={nodeTargetLabel(ctx, node)} onPress={() => { onClose(); openNodeTarget(ctx, node); }} /> : null}
    </Sheet>
  );
}

function ProcessRun({ ctx, instance, onBack }) {
  const colors = useColors();
  const { state, actor, store, caps, wide } = ctx;
  const { width } = useWindowDimensions();
  const proc = state.processes.find((p) => p.id === instance.processId);
  const version = proc ? versionOf(proc, instance.version) : null;
  const diagram = normalizeDiagram(version?.diagram || { nodes: [], edges: [] });
  const [view, setViewState] = useState(() => fitView(diagram, wide ? Math.min(width - 340, 1200) : width - 32, 380));
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [fill, setFill] = useState(null);
  const [reason, setReason] = useState('');
  if (!proc || !version) return <Empty title="Fant ikke prosessversjonen" text="Saken peker til en versjon som ikke finnes." action={<Btn label="Tilbake" onPress={onBack} />} />;
  const focus = focusView(instance, proc);

  async function complete(nodeId, input = {}) {
    setErr('');
    const res = completeStep(instance, proc, nodeId, { ...input, note }, { actor, caps, roleMap: state.system?.roleMap });
    if (!res.ok) { setErr(res.error); return; }
    // Oppgaven for trinnet krysses av i Oppgaver, så den ikke blir hengende igjen.
    const visit = (instance.visits || {})[nodeId] || 1;
    const saved = await store.commit('instances', 'instance', res, { previous: instance, effects: [{ type: 'completeTask', key: `isoproc_${instance.id}_${nodeId}_${visit}` }] });
    if (!saved.ok) setErr(saved.error); else setNote('');
  }

  function outs(nodeId) {
    return diagram.edges.filter((e) => e.from === nodeId);
  }

  return (
    <Page
      wide={wide}
      crumb={['Prosesser', proc.title, instance.title]}
      title={instance.title}
      intro={`${proc.title} · låst til v${instance.version} · startet ${prettyDate(instance.startedAt)} av ${instance.startedBy}${instance.context?.projectName ? ` · ${instance.context.projectName}` : ''}`}
      back={{ label: 'Prosesser', onPress: onBack }}
    >
      <Row>
        <Pill label={instance.state === 'aktiv' ? 'Pågår' : (instance.state === 'fullfort' ? 'Fullført' : 'Avbrutt')} tone={instance.state === 'aktiv' ? 'info' : (instance.state === 'fullfort' ? 'ok' : 'muted')} />
        {proc.publishedVersion !== instance.version ? <Pill label={`Ny versjon v${proc.publishedVersion} finnes – saken følger v${instance.version}`} tone="warn" /> : null}
      </Row>
      {err ? <Banner tone="danger" text={err} /> : null}

      <Card title="Nå" subtitle="Aktive trinn">
        {!focus.now.length ? <Text style={{ color: colors.muted }}>{instance.state === 'fullfort' ? 'Prosessen er fullført.' : 'Ingen aktive trinn.'}</Text> : null}
        {focus.now.map((n) => {
          const role = nodeRole(diagram, n);
          const edges = outs(n.id);
          return (
            <View key={n.id} style={{ gap: 8, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: colors.brand, backgroundColor: colors.brandSoft }}>
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>{n.label}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{nodeType(n.type).label}{role ? ` · ${role.label}` : ''}{n.dueDays ? ` · frist ${n.dueDays} dager` : ''}</Text>
              {n.description ? <Text style={{ color: colors.ink, fontSize: 14 }}>{n.description}</Text> : null}
              <Row>
                {n.type === 'form' && n.formKey ? <Btn icon="document-text-outline" label="Fyll ut skjema" onPress={() => setFill({ nodeId: n.id, formKey: n.formKey })} /> : null}
                {(n.onClick?.type && n.onClick.type !== 'none') || n.documentId ? <Btn icon="open-outline" label="Åpne" onPress={() => openNodeTarget(ctx, n)} /> : null}
              </Row>
              <TextIn value={note} onChangeText={setNote} placeholder="Merknad (valgfritt)" />
              {n.type === 'decision' ? (
                <Row>{edges.map((e) => <Btn key={e.id} kind="primary" label={e.label || EDGE_CONDITIONS.find((c) => c.id === e.condition)?.label || 'Velg'} onPress={() => complete(n.id, { decision: e.id })} />)}</Row>
              ) : n.type === 'approval' && stepBlocker(instance, proc, n.id, { actor, caps, roleMap: state.system?.roleMap }) ? (
                // Godkjenningstrinn vises bare som knapper for rollen i trinnet eller en godkjenner.
                <Text style={{ color: colors.muted, fontSize: 13 }}>{stepBlocker(instance, proc, n.id, { actor, caps, roleMap: state.system?.roleMap })}</Text>
              ) : n.type === 'approval' && edges.length > 1 ? (
                <Row>
                  <Btn kind="primary" icon="checkmark" label="Godkjenn" onPress={() => complete(n.id, { approval: 'approved' })} />
                  <Btn kind="danger" icon="close" label="Avvis" onPress={() => complete(n.id, { approval: 'rejected' })} />
                </Row>
              ) : (
                <Btn kind="primary" icon="checkmark" label="Fullfør trinn" onPress={() => complete(n.id)} />
              )}
            </View>
          );
        })}
      </Card>

      <IsoDiagram
        diagram={diagram}
        scale={view.scale}
        offset={view.offset}
        active={instance.active}
        done={instance.completed.map((c) => c.nodeId)}
        onPan={(o) => setViewState({ ...view, offset: o })}
        onSelectNode={(id) => { const node = diagram.nodes.find((x) => x.id === id); if (node) openNodeTarget(ctx, node); }}
        height={wide ? 420 : 320}
      />

      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
        <Card title="Neste" style={{ ...(wide ? { flex: 1 } : { width: '100%' }) }}>
          {focus.next.length ? focus.next.map((n) => <Text key={n.id} style={{ color: colors.ink }}>→ {n.label}</Text>) : <Text style={{ color: colors.muted }}>–</Text>}
        </Card>
        <Card title="Hendelseslogg" style={{ ...(wide ? { flex: 2 } : { width: '100%' }) }}>
          {instance.log.slice().reverse().map((l, i) => <Text key={i} style={{ color: colors.muted, fontSize: 12 }}>{String(l.at).replace('T', ' ').slice(0, 16)} · {l.text}</Text>)}
        </Card>
      </View>
      {instance.state === 'aktiv' && caps.manage ? (
        <Card title="Avbryt sak">
          <TextIn value={reason} onChangeText={setReason} placeholder="Begrunnelse" />
          <Btn kind="danger" label="Avbryt saken" onPress={async () => {
            const res = cancelInstance(instance, reason, { actor, caps });
            if (!res.ok) { setErr(res.error); return; }
            const saved = await store.commit('instances', 'instance', res, { previous: instance });
            if (!saved.ok) setErr(saved.error);
          }} />
        </Card>
      ) : null}
      <FormFillSheet
        ctx={ctx}
        templateId={fill?.formKey}
        visible={!!fill}
        subjectRef={{ type: 'processInstance', id: instance.id, nodeId: fill?.nodeId }}
        idempotencyKey={fill ? `${instance.id}_${fill.nodeId}_${(instance.visits || {})[fill.nodeId] || 1}` : ''}
        onClose={() => setFill(null)}
        onSubmitted={async (submission) => { const nodeId = fill.nodeId; setFill(null); await complete(nodeId, { submissionId: submission.id }); }}
      />
    </Page>
  );
}

/* ─────────────────────────── Designmodus ─────────────────────────── */

function ProcessDesigner({ ctx, proc, onBack }) {
  const colors = useColors();
  const { state, caps, actor, store, wide, people } = ctx;
  const { width } = useWindowDimensions();
  // Tegneflaten trenger hele bredden; tipsfeltet skjules mens prosessen tegnes.
  useShellWide(true);
  const draft = draftVersion(proc);
  const [diagram, setDiagram] = useState(() => normalizeDiagram(draft?.diagram || publishedVersionOf(proc)?.diagram || { nodes: [], edges: [] }));
  const [meta, setMeta] = useState({ title: proc.title, code: proc.code || '', order: proc.order || 0, documentIds: proc.documentIds || [], purpose: proc.purpose, ownerName: proc.ownerName, ownerUid: proc.ownerUid, category: proc.category, inputs: proc.inputs, outputs: proc.outputs, kpi: proc.kpi });
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [sel, setSel] = useState('');
  const [multi, setMulti] = useState([]);
  const [multiMode, setMultiMode] = useState(false);
  const dragRef = useRef(null);
  const modRef = useRef(false);
  const [selEdge, setSelEdge] = useState('');
  const [selLane, setSelLane] = useState('');
  const [connectFrom, setConnectFrom] = useState('');
  const [dirty, setDirty] = useState(false);
  const [check, setCheck] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const canvasW = wide ? Math.max(480, width - 280 - 360 - 120) : width - 32;
  const [view, setViewState] = useState(() => fitView(diagram, canvasW, 560));
  const editable = !!draft && ['utkast', 'avvist'].includes(draft.state) && caps.manage;
  const context = { forms: state.forms, documents: state.documents, processes: state.processes, selfId: proc.id };
  const selection = multi.length ? multi : (sel ? [sel] : []);
  const node = selection.length === 1 ? (diagram.nodes.find((n) => n.id === selection[0]) || null) : null;
  const selectedGroup = selection.length > 1 ? (diagram.groups || []).find((g) => g.nodeIds.length === selection.length && g.nodeIds.every((id) => selection.includes(id))) || null : null;
  const clearSel = () => { setSel(''); setMulti([]); setSelEdge(''); setSelLane(''); };
  const edge = diagram.edges.find((e) => e.id === selEdge) || null;
  const lane = (diagram.lanes || []).find((l) => l.id === selLane) || null;

  function change(next, record = true) {
    if (!editable) return;
    if (record) { setPast((p) => [...p.slice(-49), diagram]); setFuture([]); }
    setDiagram(next);
    setDirty(true);
    setCheck(null);
  }
  const patchNode = (id, patch) => change({ ...diagram, nodes: diagram.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  const patchEdge = (id, patch) => change({ ...diagram, edges: diagram.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) });

  function addNode(type) {
    const cx = (-view.offset.x + canvasW / 2) / view.scale;
    const cy = (-view.offset.y + 200) / view.scale;
    const n = makeNode(type, { x: cx - 80 + (diagram.nodes.length % 4) * 16, y: cy + (diagram.nodes.length % 4) * 16 });
    change({ ...diagram, nodes: [...diagram.nodes, n] });
    setMulti([]); setSel(n.id); setSelEdge(''); setSelLane('');
  }

  function onSelectNode(id, opts = {}) {
    if (connectFrom && editable) {
      if (id !== connectFrom && !diagram.edges.some((e) => e.from === connectFrom && e.to === id)) {
        const fromNode = diagram.nodes.find((n) => n.id === connectFrom);
        const existing = diagram.edges.filter((e) => e.from === connectFrom);
        let condition = 'always';
        let label = '';
        if (fromNode?.type === 'decision') { condition = existing.some((e) => e.condition === 'yes') ? 'no' : 'yes'; label = condition === 'yes' ? 'Ja' : 'Nei'; }
        if (fromNode?.type === 'approval') { condition = existing.some((e) => e.condition === 'approved') ? 'rejected' : 'approved'; label = condition === 'approved' ? 'Godkjent' : 'Avvist'; }
        const e = makeEdge(connectFrom, id, { condition, label });
        change({ ...diagram, edges: [...diagram.edges, e] });
        setSelEdge(e.id);
      }
      setConnectFrom('');
      return;
    }
    setSelEdge(''); setSelLane('');
    if (opts.additive || modRef.current || multiMode) {
      const cur = selection;
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      setMulti(next.length > 1 ? next : []);
      setSel(next.length === 1 ? next[0] : (next.length ? id : ''));
      return;
    }
    // Første trykk på en boks i en gruppe velger hele gruppen; neste trykk velger boksen alene.
    const g = groupOf(diagram, id);
    if (g && !(multi.length && g.nodeIds.every((x) => multi.includes(x)))) {
      setMulti(g.nodeIds); setSel(id);
      return;
    }
    setMulti([]); setSel(id);
  }

  function selectGroup(groupId) {
    const g = (diagram.groups || []).find((x) => x.id === groupId);
    if (g) { setMulti(g.nodeIds); setSel(g.nodeIds[0]); setSelEdge(''); setSelLane(''); }
  }

  function onDragStart(id) {
    if (selection.length > 1 && selection.includes(id)) {
      dragRef.current = { ids: selection, origin: Object.fromEntries(diagram.nodes.filter((n) => selection.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }])) };
    } else {
      dragRef.current = null;
    }
  }

  function onMoveNode(id, x, y) {
    const drag = dragRef.current;
    if (drag && drag.ids.includes(id)) {
      const dx = x - drag.origin[id].x;
      const dy = y - drag.origin[id].y;
      setDiagram((d) => ({ ...d, nodes: d.nodes.map((n) => (drag.origin[n.id] ? { ...n, x: drag.origin[n.id].x + dx, y: drag.origin[n.id].y + dy } : n)) }));
      return;
    }
    setDiagram((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === id ? { ...n, x, y } : n)) }));
  }

  function onDropNode(id) {
    const ids = dragRef.current?.ids || [id];
    dragRef.current = null;
    setPast((p) => [...p.slice(-49), diagram]);
    setDiagram((d) => ({ ...d, nodes: d.nodes.map((n) => (ids.includes(n.id) ? { ...n, x: snap(n.x), y: snap(n.y) } : n)) }));
    setDirty(true); setCheck(null);
  }

  // Flervalg-handlinger
  const multiAct = {
    align: (how) => change(alignNodes(diagram, selection, how)),
    distribute: (axis) => change(distributeNodes(diagram, selection, axis)),
    duplicate: () => { const r = duplicateNodes(diagram, selection); change(r.diagram); setMulti(r.ids.length > 1 ? r.ids : []); setSel(r.ids[0] || ''); },
    remove: () => { change(removeNodes(diagram, selection)); clearSel(); },
    group: () => { const r = groupNodes(diagram, selection, 'Gruppe'); if (r.id) change(r.diagram); },
    ungroup: (gid) => change(ungroup(diagram, gid)),
    role: (roleKey) => change({ ...diagram, nodes: diagram.nodes.map((n) => (selection.includes(n.id) && nodeType(n.type).human ? { ...n, roleKey, roleLabel: ISO_ROLES.find((r) => r.id === roleKey)?.label || '' } : n)) }),
    nudge: (dx, dy) => change(moveNodes(diagram, selection, dx, dy)),
  };

  const undo = () => { if (!past.length || !editable) return; setFuture((f) => [diagram, ...f]); setDiagram(past.at(-1)); setPast(past.slice(0, -1)); setDirty(true); };
  const redo = () => { if (!future.length || !editable) return; setPast((p) => [...p, diagram]); setDiagram(future[0]); setFuture(future.slice(1)); setDirty(true); };

  // Tastatursnarveier på web (ikke når man skriver i et felt).
  const keys = useRef({});
  keys.current = { selection, editable, multiAct, undo, redo, diagram, clearSel, connectFrom };
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const onMod = (ev) => { modRef.current = !!(ev.shiftKey || ev.metaKey || ev.ctrlKey); };
    const onKey = (ev) => {
      onMod(ev);
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const k = keys.current;
      const mod = ev.metaKey || ev.ctrlKey;
      if (ev.key === 'Escape') { k.clearSel(); return; }
      if (!k.editable) return;
      if (mod && ev.key.toLowerCase() === 'z') { ev.preventDefault(); if (ev.shiftKey) k.redo(); else k.undo(); return; }
      if (mod && ev.key.toLowerCase() === 'y') { ev.preventDefault(); k.redo(); return; }
      if (mod && ev.key.toLowerCase() === 'a') { ev.preventDefault(); setMulti(k.diagram.nodes.map((n) => n.id)); setSel(k.diagram.nodes[0]?.id || ''); return; }
      if (!k.selection.length) return;
      if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); k.multiAct.remove(); return; }
      if (mod && ev.key.toLowerCase() === 'd') { ev.preventDefault(); k.multiAct.duplicate(); return; }
      if (mod && ev.key.toLowerCase() === 'g') { ev.preventDefault(); k.multiAct.group(); return; }
      const step = ev.shiftKey ? 64 : 16;
      const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      if (arrows[ev.key]) { ev.preventDefault(); k.multiAct.nudge(...arrows[ev.key]); }
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('keyup', onMod);
    window.addEventListener('blur', onMod);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('keyup', onMod);
      window.removeEventListener('blur', onMod);
    };
  }, []);

  function removeSelected() {
    if (selection.length > 1) { multiAct.remove(); return; }
    if (node) change({ ...diagram, nodes: diagram.nodes.filter((n) => n.id !== node.id), edges: diagram.edges.filter((e) => e.from !== node.id && e.to !== node.id) });
    else if (edge) change({ ...diagram, edges: diagram.edges.filter((e) => e.id !== edge.id) });
    else if (lane) change({ ...diagram, lanes: diagram.lanes.filter((l) => l.id !== lane.id) });
    setSel(''); setSelEdge(''); setSelLane('');
  }

  function duplicate() {
    if (!node) return;
    const copy = makeNode(node.type, { ...node, id: undefined, x: node.x + 32, y: node.y + 32, label: `${node.label} (kopi)` });
    change({ ...diagram, nodes: [...diagram.nodes, copy] });
    setSel(copy.id);
  }

  function addLane() {
    const lanes = diagram.lanes || [];
    const y = lanes.length ? Math.max(...lanes.map((l) => l.y + l.h)) : 0;
    const l = { id: `lane_${Date.now().toString(36)}`, label: `Bane ${lanes.length + 1}`, roleKey: '', y, h: 176 };
    change({ ...diagram, lanes: [...lanes, l] });
    setSelLane(l.id); setSel(''); setSelEdge('');
  }

  async function save() {
    setErr(''); setMsg('');
    const res = saveDraftDiagram(proc, diagram, { actor, meta });
    if (!res.ok) { setErr(res.error); return null; }
    const saved = await store.commit('processes', 'process', res, { previous: proc });
    if (!saved.ok) { setErr(saved.error); return null; }
    setDirty(false);
    setMsg('Utkastet er lagret.');
    return res.process;
  }

  async function submit() {
    const current = dirty ? await save() : proc;
    if (!current) return;
    const res = submitForApproval(current, context, { actor, caps });
    if (!res.ok) { setErr(res.error); if (res.validation) setCheck(res.validation); return; }
    const saved = await store.commit('processes', 'process', res, { previous: current, effects: [{ type: 'requestApproval', key: `isoappr_${proc.id}_v${draft.version}`, title: `Prosess «${proc.title}» v${draft.version}`, roleKey: 'top_management', roleLabel: 'Godkjenner' }] });
    if (!saved.ok) setErr(saved.error); else setMsg('Sendt til godkjenning. Godkjenner har fått oppgave.');
  }

  const errors = check?.errors || [];

  const palette = (
    <Card title="Nodepalett" style={{ width: wide ? 220 : '100%' }}>
      {!editable ? <Text style={{ color: colors.muted, fontSize: 12 }}>{draft ? 'Utkastet er til godkjenning og låst.' : 'Publisert versjon er låst. Lag ny versjon fra prosessiden.'}</Text> : null}
      <View style={{ flexDirection: wide ? 'column' : 'row', flexWrap: 'wrap', gap: 6 }}>
        {NODE_TYPES.map((t) => <Btn key={t.id} small icon={t.icon} label={t.label} disabled={!editable} onPress={() => addNode(t.id)} />)}
        <Btn small icon="reorder-four-outline" label="Ansvarsbane" disabled={!editable} onPress={addLane} />
      </View>
      <Btn small icon={multiMode ? 'checkbox' : 'checkbox-outline'} label={multiMode ? 'Flervalg på' : 'Flervalg'} kind={multiMode ? 'primary' : 'ghost'} onPress={() => setMultiMode(!multiMode)} />
      <Text style={{ color: colors.muted, fontSize: 11 }}>Dra bokser for å flytte. Velg en boks, trykk «Koble fra», og trykk deretter på målboksen. Shift/Ctrl-klikk eller «Flervalg» velger flere.{Platform.OS === 'web' ? ' Snarveier: Delete, Ctrl+Z/Y, Ctrl+D dupliser, Ctrl+G grupper, Ctrl+A alle, piltaster flytter.' : ''}</Text>
    </Card>
  );

  const inspector = (
    <Card title={selection.length > 1 ? `${selection.length} bokser valgt` : (node ? 'Egenskaper – boks' : (edge ? 'Egenskaper – kobling' : (lane ? 'Egenskaper – bane' : 'Prosess')))} style={{ width: wide ? 340 : '100%' }}>
      {selection.length > 1 ? (
        <>
          {selectedGroup ? (
            <Field label="Gruppenavn">
              <TextIn value={selectedGroup.label} editable={editable} onChangeText={(x) => change({ ...diagram, groups: diagram.groups.map((g) => (g.id === selectedGroup.id ? { ...g, label: x } : g)) })} />
            </Field>
          ) : null}
          <Text style={{ color: colors.muted, fontSize: 12 }}>Juster</Text>
          <Row gap={6}>
            <Btn small icon="arrow-back-outline" accessibilityLabel="Juster venstre" disabled={!editable} onPress={() => multiAct.align('left')} />
            <Btn small icon="arrow-up-outline" accessibilityLabel="Juster topp" disabled={!editable} onPress={() => multiAct.align('top')} />
            <Btn small label="Midt ↔" disabled={!editable} onPress={() => multiAct.align('vcenter')} />
            <Btn small label="Midt ↕" disabled={!editable} onPress={() => multiAct.align('hcenter')} />
          </Row>
          {selection.length > 2 ? (
            <Row gap={6}>
              <Btn small label="Fordel vannrett" disabled={!editable} onPress={() => multiAct.distribute('h')} />
              <Btn small label="Fordel loddrett" disabled={!editable} onPress={() => multiAct.distribute('v')} />
            </Row>
          ) : null}
          <Field label="Ansvarlig rolle for alle valgte">
            <Choice small options={ISO_ROLES.map((r) => ({ id: r.id, label: r.label }))} value="" onChange={(x) => editable && x && multiAct.role(x)} />
          </Field>
          {editable ? (
            <Row>
              {selectedGroup
                ? <Btn small icon="albums-outline" label="Oppløs gruppe" onPress={() => multiAct.ungroup(selectedGroup.id)} />
                : <Btn small icon="albums-outline" label="Grupper" onPress={multiAct.group} />}
              <Btn small icon="copy-outline" label="Dupliser" onPress={multiAct.duplicate} />
              <Btn small kind="danger" icon="trash-outline" label="Slett" onPress={multiAct.remove} />
            </Row>
          ) : null}
          <Btn small label="Fjern valg" onPress={clearSel} />
        </>
      ) : node ? (
        <>
          <Pill label={nodeType(node.type).label} tone="info" icon={nodeType(node.type).icon} />
          <Field label="Tittel"><TextIn value={node.label} onChangeText={(x) => patchNode(node.id, { label: x })} editable={editable} /></Field>
          <Field label="Beskrivelse / instruks"><TextIn multiline rows={3} value={node.description} onChangeText={(x) => patchNode(node.id, { description: x })} editable={editable} /></Field>
          {nodeType(node.type).human ? (
            <Field label="Ansvarlig rolle" hint="Tom = rollen til banen boksen ligger i.">
              <Choice small options={ISO_ROLES.map((r) => ({ id: r.id, label: r.label }))} value={node.roleKey} onChange={(x) => editable && patchNode(node.id, { roleKey: x, roleLabel: ISO_ROLES.find((r) => r.id === x)?.label || '' })} />
            </Field>
          ) : null}
          <Field label="Frist (dager)"><TextIn keyboardType="numeric" value={String(node.dueDays || '')} onChangeText={(x) => patchNode(node.id, { dueDays: Number(x) || 0 })} editable={editable} /></Field>
          {node.type === 'form' ? (
            <Field label="Skjema">
              <Choice small options={(state.forms || []).filter((f) => !f.archived && f.publishedVersion).map((f) => ({ id: f.templateId, label: f.title }))} value={node.formKey} onChange={(x) => editable && patchNode(node.id, { formKey: x })} />
              {!(state.forms || []).some((f) => f.publishedVersion) ? <Text style={{ color: colors.muted, fontSize: 12 }}>Godkjenn skjema fra Skjemabygger under ISO → Skjemaer først.</Text> : null}
            </Field>
          ) : null}
          {node.type === 'document' ? (
            <Field label="Styrt dokument"><Choice small options={state.documents.filter((d) => !d.archived).map((d) => ({ id: d.id, label: `${d.code} ${d.title}` }))} value={node.documentId} onChange={(x) => editable && patchNode(node.id, { documentId: x })} /></Field>
          ) : null}
          {node.type === 'subprocess' ? (
            <Field label="Underprosess"><Choice small options={state.processes.filter((p) => p.id !== proc.id && !p.archived).map((p) => ({ id: p.id, label: p.title }))} value={node.subprocessId} onChange={(x) => editable && patchNode(node.id, { subprocessId: x, onClick: { type: 'openProcess', ref: x } })} /></Field>
          ) : null}
          <Field label="System / datalager" hint="Hvor trinnet utføres eller registreres, f.eks. «ProTop Anbud» eller «Kundens system»."><TextIn value={node.system} onChangeText={(x) => patchNode(node.id, { system: x })} editable={editable} /></Field>
          <Field label="Klikkhandling (lesemodus)"><Choice small options={CLICK_ACTIONS} value={node.onClick?.type || 'none'} onChange={(x) => editable && patchNode(node.id, { onClick: { type: x || 'none', ref: x === node.onClick?.type ? node.onClick?.ref || '' : '' } })} /></Field>
          {node.onClick?.type === 'openDocument' ? (
            <Field label="Dokument"><Choice small options={state.documents.filter((d) => !d.archived).map((d) => ({ id: d.id, label: `${d.code} ${d.title}` }))} value={node.onClick.ref || node.documentId} onChange={(x) => editable && patchNode(node.id, { onClick: { type: 'openDocument', ref: x || '' } })} /></Field>
          ) : null}
          {node.onClick?.type === 'openProcess' ? (
            <Field label="Prosess"><Choice small options={state.processes.filter((p) => p.id !== proc.id && !p.archived).map((p) => ({ id: p.id, label: `${p.code ? `${p.code} ` : ''}${p.title}` }))} value={node.onClick.ref} onChange={(x) => editable && patchNode(node.id, { onClick: { type: 'openProcess', ref: x || '' } })} /></Field>
          ) : null}
          {node.onClick?.type === 'openForm' ? (
            <Field label="Skjema"><Choice small options={(state.forms || []).filter((f) => !f.archived && f.publishedVersion).map((f) => ({ id: f.templateId, label: f.title }))} value={node.onClick.ref || node.formKey} onChange={(x) => editable && patchNode(node.id, { onClick: { type: 'openForm', ref: x || '' } })} /></Field>
          ) : null}
          {['openModule', 'openUrl'].includes(node.onClick?.type) ? (
            <Field label={node.onClick.type === 'openUrl' ? 'Lenke' : 'Modul'} hint={node.onClick.type === 'openModule' ? 'ISO-side (avvik, risiko, leverandorer, dokumenter …) eller annen modul som tab:anbud/vurdering, tab:projects, tab:arbeid/timeliste' : ''}>
              <TextIn value={node.onClick.ref} onChangeText={(x) => patchNode(node.id, { onClick: { ...node.onClick, ref: x } })} editable={editable} />
            </Field>
          ) : null}
          <Field label="Utføringshandling (publisert prosess)"><Choice small options={ENTER_ACTIONS} value={node.onEnter?.type || 'none'} onChange={(x) => editable && patchNode(node.id, { onEnter: { type: x || 'none' } })} /></Field>
          <Field label="Farge"><Choice small options={[{ id: '', label: 'Standard' }, { id: '#eff6ff', label: 'Blå' }, { id: '#f0fdf4', label: 'Grønn' }, { id: '#fffbeb', label: 'Gul' }, { id: '#fef2f2', label: 'Rød' }]} value={node.color} onChange={(x) => editable && patchNode(node.id, { color: x || '' })} /></Field>
          <Field label="Input"><TextIn value={node.inputs} onChangeText={(x) => patchNode(node.id, { inputs: x })} editable={editable} /></Field>
          <Field label="Output"><TextIn value={node.outputs} onChangeText={(x) => patchNode(node.id, { outputs: x })} editable={editable} /></Field>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Utganger:</Text>
          {diagram.edges.filter((e) => e.from === node.id).map((e) => (
            <ListRow key={e.id} title={`→ ${diagram.nodes.find((n) => n.id === e.to)?.label || '?'}`} subtitle={e.label || EDGE_CONDITIONS.find((c) => c.id === e.condition)?.label} onPress={() => { setSelEdge(e.id); setSel(''); setMulti([]); }} />
          ))}
          {editable ? (
            <Row>
              <Btn small kind="primary" icon="git-commit-outline" label={connectFrom ? 'Velg mål …' : 'Koble fra'} onPress={() => setConnectFrom(connectFrom ? '' : node.id)} />
              <Btn small icon="copy-outline" label="Dupliser" onPress={duplicate} />
              <Btn small kind="danger" icon="trash-outline" label="Slett" onPress={removeSelected} />
            </Row>
          ) : null}
        </>
      ) : edge ? (
        <>
          <Text style={{ color: colors.ink }}>{diagram.nodes.find((n) => n.id === edge.from)?.label} → {diagram.nodes.find((n) => n.id === edge.to)?.label}</Text>
          <Field label="Vilkår"><Choice small options={EDGE_CONDITIONS} value={edge.condition} onChange={(x) => editable && patchEdge(edge.id, { condition: x || 'always', label: edge.label || (EDGE_CONDITIONS.find((c) => c.id === x)?.label || '') })} /></Field>
          <Field label="Etikett"><TextIn value={edge.label} onChangeText={(x) => patchEdge(edge.id, { label: x })} editable={editable} /></Field>
          {editable ? <Btn small kind="danger" icon="trash-outline" label="Slett kobling" onPress={removeSelected} /> : null}
        </>
      ) : lane ? (
        <>
          <Field label="Navn"><TextIn value={lane.label} onChangeText={(x) => change({ ...diagram, lanes: diagram.lanes.map((l) => (l.id === lane.id ? { ...l, label: x } : l)) })} editable={editable} /></Field>
          <Field label="Rolle"><Choice small options={ISO_ROLES.map((r) => ({ id: r.id, label: r.label }))} value={lane.roleKey} onChange={(x) => change({ ...diagram, lanes: diagram.lanes.map((l) => (l.id === lane.id ? { ...l, roleKey: x, label: l.label.startsWith('Bane') ? (ISO_ROLES.find((r) => r.id === x)?.label || l.label) : l.label } : l)) })} /></Field>
          <Field label="Høyde"><Choice small options={[{ id: '144', label: 'Lav' }, { id: '176', label: 'Normal' }, { id: '240', label: 'Høy' }]} value={String(lane.h)} onChange={(x) => {
            const h = Number(x) || 176;
            let y = 0;
            change({ ...diagram, lanes: diagram.lanes.map((l) => { const next = { ...l, y, h: l.id === lane.id ? h : l.h }; y += next.h; return next; }) });
          }} /></Field>
          {editable ? <Btn small kind="danger" label="Slett bane" onPress={removeSelected} /> : null}
        </>
      ) : (
        <>
          <Field label="Navn"><TextIn value={meta.title} onChangeText={(x) => { setMeta({ ...meta, title: x }); setDirty(true); }} editable={editable} /></Field>
          <Row>
            <View style={{ flex: 1, minWidth: 110 }}><Field label="Kode"><TextIn value={meta.code} onChangeText={(x) => { setMeta({ ...meta, code: x }); setDirty(true); }} editable={editable} placeholder="B-01-001" /></Field></View>
            <View style={{ width: 90 }}><Field label="Rekkefølge"><TextIn keyboardType="numeric" value={String(meta.order || '')} onChangeText={(x) => { setMeta({ ...meta, order: Number(x) || 0 }); setDirty(true); }} editable={editable} /></Field></View>
          </Row>
          <Field label="Formål"><TextIn multiline rows={2} value={meta.purpose} onChangeText={(x) => { setMeta({ ...meta, purpose: x }); setDirty(true); }} editable={editable} /></Field>
          <Field label="Prosesseier" required><PersonPick people={people} value={meta.ownerName} onChange={(p) => { setMeta({ ...meta, ownerName: p.name, ownerUid: p.uid }); setDirty(true); }} /></Field>
          <Field label="Kategori"><Choice small options={PROCESS_CATEGORIES} value={meta.category} onChange={(x) => { setMeta({ ...meta, category: x || 'kjerne' }); setDirty(true); }} /></Field>
          <Field label="Input"><TextIn value={meta.inputs} onChangeText={(x) => { setMeta({ ...meta, inputs: x }); setDirty(true); }} editable={editable} /></Field>
          <Field label="Output"><TextIn value={meta.outputs} onChangeText={(x) => { setMeta({ ...meta, outputs: x }); setDirty(true); }} editable={editable} /></Field>
          <Field label="KPI"><TextIn value={meta.kpi} onChangeText={(x) => { setMeta({ ...meta, kpi: x }); setDirty(true); }} editable={editable} /></Field>
          <Field label="Styrende dokumenter" hint="Prosedyrer og maler prosessen bygger på. Vises på prosessen og kan åpnes derfra.">
            <Choice small multi options={state.documents.filter((d) => !d.archived).map((d) => ({ id: d.id, label: `${d.code} ${d.title}` }))} value={meta.documentIds || []} onChange={(x) => { if (!editable) return; setMeta({ ...meta, documentIds: x }); setDirty(true); }} />
          </Field>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Velg en boks, kobling eller bane for å redigere den.</Text>
          {(diagram.lanes || []).map((l) => <ListRow key={l.id} icon="reorder-four-outline" title={l.label} onPress={() => { setSelLane(l.id); setSel(''); setMulti([]); setSelEdge(''); }} />)}
        </>
      )}
    </Card>
  );

  return (
    <Page
      wide={wide}
      back={{ label: proc.title, onPress: onBack }}
      title={proc.title}
      intro={`v${draft?.version || proc.publishedVersion} · ${draft ? VERSION_STATES[draft.state] : 'Publisert (låst)'}${dirty ? ' · ulagrede endringer' : ''}`}
      actions={(
        <>
          <Btn icon="arrow-undo-outline" accessibilityLabel="Angre" disabled={!past.length || !editable} onPress={undo} />
          <Btn icon="arrow-redo-outline" accessibilityLabel="Gjør om" disabled={!future.length || !editable} onPress={redo} />
          <Btn icon="shield-checkmark-outline" label="Valider" onPress={() => setCheck(validateDiagram(diagram, context))} />
          {editable ? <Btn icon="save-outline" label="Lagre" disabled={!dirty} onPress={save} /> : null}
          {editable ? <Btn kind="primary" icon="send-outline" label="Send til godkjenning" onPress={submit} /> : null}
        </>
      )}
    >
      {!wide ? <Banner tone="info" text="Full redigering er laget for større skjerm. På mobil kan du se, panorere og gjøre små endringer." /> : null}
      {msg ? <Banner tone="ok" text={msg} /> : null}
      {err ? <Banner tone="danger" text={err} /> : null}
      {check ? (
        <Card title={check.ok ? 'Validering OK' : `Validering: ${check.errors.length} feil`}>
          {check.ok ? <Text style={{ color: colors.success }}>Flyten har start og slutt, alle bokser kan nås, beslutninger har grener, og roller og referanser er satt.</Text> : null}
          {check.errors.map((e, i) => <ListRow key={`e${i}`} icon="alert-circle-outline" tone="danger" title={e.message} onPress={e.nodeId ? () => { setMulti([]); setSel(e.nodeId); setSelEdge(''); } : undefined} />)}
          {check.warnings.map((e, i) => <ListRow key={`w${i}`} icon="warning-outline" tone="warn" title={e.message} onPress={e.nodeId ? () => { setMulti([]); setSel(e.nodeId); } : undefined} />)}
        </Card>
      ) : null}
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 12, alignItems: 'flex-start' }}>
        {palette}
        <View style={{ ...(wide ? { flex: 1 } : { width: '100%' }), gap: 8 }}>
          {connectFrom ? <Banner tone="info" text="Trykk på boksen koblingen skal gå til. Trykk «Velg mål …» igjen for å avbryte." /> : null}
          <IsoDiagram
            design={editable}
            diagram={diagram}
            scale={view.scale}
            offset={view.offset}
            selectedId={sel}
            selectedIds={selection}
            selectedEdgeId={selEdge}
            onSelectGroup={selectGroup}
            onDragStart={onDragStart}
            errors={errors}
            connectingFrom={connectFrom}
            onSelectNode={onSelectNode}
            onSelectEdge={(id) => { setSelEdge(id); setSel(''); setMulti([]); setSelLane(''); }}
            onMoveNode={onMoveNode}
            onDropNode={onDropNode}
            onPan={(o) => setViewState({ ...view, offset: o })}
            onBackground={() => { clearSel(); setConnectFrom(''); }}
            height={wide ? 620 : 420}
          />
          <Row>
            <Btn small icon="remove" accessibilityLabel="Zoom ut" onPress={() => setViewState({ ...view, scale: Math.max(0.3, +(view.scale - 0.1).toFixed(2)) })} />
            <Text style={{ color: colors.muted }}>{Math.round(view.scale * 100)} %</Text>
            <Btn small icon="add" accessibilityLabel="Zoom inn" onPress={() => setViewState({ ...view, scale: Math.min(2, +(view.scale + 0.1).toFixed(2)) })} />
            <Btn small label="Tilpass" onPress={() => setViewState(fitView(diagram, canvasW, 620))} />
            <Text style={{ color: colors.muted, fontSize: 12 }}>{diagram.nodes.length} bokser · {diagram.edges.length} koblinger · {(diagram.lanes || []).length} baner</Text>
          </Row>
        </View>
        {inspector}
      </View>
    </Page>
  );
}
