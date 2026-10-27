/**
 * Import av et helt ledelsessystem (ISO-pakke) i Innstillinger.
 * Velg fil → forhåndsvisning (ny / finnes / feil) → valg → import med fremdrift.
 * Alt går gjennom domenefunksjonene i src/iso/importPackage.js og lagres med revisjonsspor.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { pickDocument } from '../../src/utils/media';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { normalizeFormTemplates, saveFormTemplate } from '../../src/anbud/bidLibrary';
import { approveTemplate } from '../../src/iso/forms';
import { saveEmployee } from '../../src/employees/storage';
import { displayName } from '../../src/employees/model';
import { companyWallHasImport, createCompanyWallPost } from '../../src/project/companyWall';
import {
  PACKAGE_SECTIONS, approvalTaskFor, buildImport, importKeyFor, parsePackage, planImport,
} from '../../src/iso/importPackage';
import {
  Banner, Btn, Card, Check, Field, ListRow, Pill, Row, TextIn,
} from './isoUi';

const STATUS = { ny: { label: 'Ny', tone: 'ok' }, finnes: { label: 'Finnes', tone: 'muted' }, feil: { label: 'Feil', tone: 'danger' } };

async function readPicked(picked) {
  if (!picked) return '';
  if (picked.blob?.text) return picked.blob.text();
  if (typeof Blob !== 'undefined' && picked instanceof Blob) return picked.text();
  const res = await fetch(picked.uri);
  return res.text();
}

export default function IsoImport({ ctx, first = false, onSystemImported }) {
  const colors = useColors();
  const { state, caps, actor, store, companyId, go, sources } = ctx;
  const [raw, setRaw] = useState('');
  const [paste, setPaste] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState(null);
  const [sections, setSections] = useState(() => new Set(PACKAGE_SECTIONS.map((s) => s.id)));
  const [publishDirect, setPublishDirect] = useState(false);
  // Nyheter går til Selskap → Nyheter. Hver nyhet kan velges bort; de som allerede ligger der, hoppes over.
  const [newsKeys, setNewsKeys] = useState(null);
  const [wallKeys, setWallKeys] = useState(null);
  const [open, setOpen] = useState('');
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  const anbudTemplates = sources?.formTemplates || [];
  const people = sources?.people;
  const employees = useMemo(() => (sources?.employees || []).map((e) => ({ id: e.id, name: displayName(e), employee: e })), [sources?.employees]);
  const options = useMemo(() => ({
    sections,
    newsKeys,
    publish: { documents: publishDirect && caps.approve, processes: publishDirect && caps.approve },
  }), [sections, newsKeys, publishDirect, caps.approve]);
  const extra = useMemo(() => ({ anbudTemplates, people, employees, wallKeys }), [anbudTemplates, people, employees, wallKeys]);
  const plan = useMemo(() => (parsed?.ok
    ? planImport(state, parsed.pkg, { actor, caps, options, ...extra })
    : null), [parsed, state, actor, caps, options, extra]);

  // Hvilke nyheter ligger allerede på Selskap → Nyheter?
  useEffect(() => {
    let live = true;
    const news = parsed?.ok ? parsed.pkg.news || [] : [];
    if (!news.length || !companyId) { setWallKeys(null); return undefined; }
    (async () => {
      const found = new Set();
      for (const n of news) {
        const ik = importKeyFor(parsed.pkg, 'news', n.key);
        try { if (await companyWallHasImport(companyId, ik)) found.add(ik); } catch { /* ukjent: kontrolleres igjen ved import */ }
      }
      if (live) setWallKeys(found);
    })();
    return () => { live = false; };
  }, [parsed, companyId]);

  function load(text, name = '') {
    setErr(''); setLog([]); setDone(false);
    const res = parsePackage(text);
    if (!res.ok) { setParsed(null); setErr(res.error); return; }
    setParsed(res);
    setFileName(name);
    setNewsKeys(new Set((res.pkg.news || []).map((n) => n.key)));
    const present = new Set(PACKAGE_SECTIONS.map((s) => s.id).filter((id) => {
      if (id === 'system') return !!res.pkg.system;
      if (id === 'records') return Object.values(res.pkg.records).some((rows) => rows.length);
      return (res.pkg[id] || []).length > 0;
    }));
    setSections(present);
  }

  async function pick() {
    try {
      const picked = await pickDocument({ accept: '.json,application/json' });
      if (!picked) return;
      const text = await readPicked(picked);
      setRaw(text);
      load(text, picked.name || '');
    } catch (e) {
      setErr(e?.message || 'Kunne ikke lese filen.');
    }
  }

  const total = plan ? Object.values(plan.counts).reduce((n, c) => n + c.ny, 0) : 0;

  async function run() {
    if (!parsed?.ok) return;
    setBusy(true); setErr(''); setDone(false);
    const lines = [];
    const say = (line) => { lines.push(line); setLog([...lines]); };
    try {
      // Med skjemaene som er godkjent i Dokumentstyring (KS-biblioteket), så prosesser som bruker dem kan publiseres.
      const current = { ...store.current(), forms: state.forms };
      const built = buildImport(current, parsed.pkg, { actor, caps, options, ...extra });
      const { out } = built;

      if (out.system) {
        const saved = await store.commit('system', 'system', { ok: true, system: out.system, events: [] }, { previous: current.system });
        if (!saved.ok) throw new Error(`Oppsett: ${saved.error}`);
        // Innstillingene må vise det importen lagret, ellers kan autolagringen skrive det gamle skjemaet tilbake.
        onSystemImported?.(out.system);
        say('Oppsett, omfang og dokumentstruktur er lagret.');
      }

      // Skjema først: prosesser som peker til et skjema, kan bare publiseres når skjemaet er styrt.
      if (out.forms.length) {
        let anbud = await loadAnbudState(companyId);
        let added = 0;
        const full = [];
        for (const f of out.forms) {
          if (f.existing || normalizeFormTemplates(anbud.formTemplates).some((t) => t.id === f.template.id)) continue;
          const res = saveFormTemplate(anbud, f.template);
          if (!res.ok) { say(`Skjema «${f.template.title}»: ${res.error}`); continue; }
          // Skjemabygger har et tak på antall maler; det som ikke får plass, faller ut ved normalisering.
          if (!normalizeFormTemplates(res.state.formTemplates).some((t) => t.id === f.template.id)) { full.push(f.template.title); continue; }
          anbud = res.state;
          added += 1;
        }
        if (added) anbud = await saveAnbudState(anbud, companyId);
        if (full.length) say(`Ikke plass i Skjemabygger (for mange maler): ${full.join(', ')}. Slett maler dere ikke bruker, og kjør importen på nytt.`);
        const fresh = normalizeFormTemplates(anbud.formTemplates);
        let approved = 0;
        for (const f of out.forms.filter((x) => x.approve && caps.approve)) {
          const tpl = fresh.find((t) => t.id === f.template.id);
          const control = store.current().forms.find((c) => c.templateId === f.template.id && !c.archived) || null;
          if (!tpl || control?.publishedVersion) continue;
          const res = approveTemplate(control, tpl, { actor, caps, templateKey: '', note: `Importert fra «${parsed.pkg.title}»` });
          if (res.ok && (await store.commit('forms', 'form', res, { previous: control })).ok) approved += 1;
        }
        sources?.reloadAnbud?.();
        const reused = out.forms.filter((x) => x.existing).length;
        say(`${added} skjema og sjekklister er lagt i Skjemabygger${reused ? `, ${reused} fantes fra før og er brukt i stedet for kopi` : ''}${approved ? `, ${approved} godkjent som styrte skjema` : ''}.`);
      }

      const rows = [
        ...out.requirements.map((r) => ({ kind: 'requirements', entity: r.requirement })),
        ...out.documents.map((d) => ({ kind: 'documents', entity: d.document })),
        ...out.processes.map((p) => ({ kind: 'processes', entity: p.process })),
        ...out.records.map((r) => ({ kind: 'records', entity: r.record })),
      ];
      const events = [
        ...out.requirements.flatMap((r) => r.events || []),
        ...out.documents.flatMap((d) => d.events || []),
        ...out.processes.flatMap((p) => p.events || []),
        ...out.records.flatMap((r) => r.events || []),
      ];
      if (rows.length) {
        const saved = await store.commitMany(rows, events);
        if (!saved.ok) throw new Error(saved.committed ? `${saved.error} (${saved.committed} av ${saved.total} er lagret)` : saved.error);
        say(`${out.documents.length} dokumenter, ${out.processes.length} prosesser, ${out.records.length} registerposter og ${out.requirements.length} krav er lagt inn.`);
      }

      const published = [
        ...out.publishDocuments.map((d) => ({ kind: 'documents', entity: d.document })),
        ...out.publishProcesses.map((p) => ({ kind: 'processes', entity: p.process })),
      ];
      if (published.length) {
        const saved = await store.commitMany(published, [...out.publishDocuments, ...out.publishProcesses].flatMap((x) => x.events || []));
        if (!saved.ok) throw new Error(`Publisering: ${saved.error}${saved.committed ? ` (${saved.committed} av ${saved.total} er publisert)` : ''}`);
        say(`${out.publishDocuments.length} dokumenter og ${out.publishProcesses.length} prosesser er publisert.`);
      }

      if (out.assessments || out.evidence) {
        const patch = {};
        if (out.assessments) patch.assessments = out.assessments;
        if (out.evidence) { patch.evidence = out.evidence.evidence; patch.evidenceLinks = out.evidence.evidenceLinks; }
        const saved = await store.commitLists(patch, out.events);
        if (!saved.ok) throw new Error(`Kravvurderinger: ${saved.error}`);
        say('Kravvurderinger og bevis er oppdatert i ISO-kravmatrisen.');
      }

      if (out.news.length) {
        let posted = 0;
        for (const n of out.news) {
          let exists = true;
          try {
            exists = await companyWallHasImport(companyId, n.importKey);
          } catch {
            say(`Nyhet «${n.title}»: kunne ikke kontrollere om den allerede er lagt ut. Hoppet over.`);
            continue;
          }
          if (exists) continue;
          try {
            await createCompanyWallPost({ companyId, authorUid: actor.uid, authorName: actor.name, title: n.title, body: n.body, category: n.category, linkUrl: n.linkUrl, importKey: n.importKey });
            posted += 1;
          } catch (e) {
            say(`Nyhet «${n.title}»: ${e?.message || 'ble ikke publisert'}`);
          }
        }
        if (posted) say(`${posted} nyheter er publisert på Selskap → Nyheter.`);
      }

      // Kompetanse: inn i CV-en til hver ansatt (Ansatte → CV). ISO → Kompetanse leser den derfra.
      if (out.competence.length) {
        let saved = 0;
        for (const c of out.competence) {
          try {
            await saveEmployee(companyId, c.employee);
            saved += 1;
          } catch (e) {
            say(`CV for ${c.name}: ${e?.message || 'ble ikke lagret'}`);
          }
        }
        if (saved) say(`Kompetanse er lagt inn i CV-en til ${saved} ansatte.`);
      }

      const task = approvalTaskFor(parsed.pkg, built);
      if (task) {
        await store.runEffects([task]);
        say('Godkjenner har fått én samleoppgave i Oppgaver.');
      }
      say('Ferdig. Det som allerede fantes, ble hoppet over.');
      setDone(true);
    } catch (e) {
      setErr(e?.message || 'Importen stoppet.');
      say('Importen stoppet. Det som er lagret, blir liggende. Kjør importen på nytt for å fortsette – ferdige poster hoppes over.');
    }
    setBusy(false);
  }

  if (!caps.admin) return null;

  return (
    <Card
      title={first ? 'Har dere allerede et ledelsessystem?' : 'Importer ledelsessystem'}
      subtitle={`${first ? 'Importer det i stedet for startpakken. Oppsettet fylles ut fra pakken. ' : ''}Flytt et eksisterende ledelsessystem inn i ProTop fra en ISO-pakke (JSON): dokumenter, prosesskart, registre, lovkrav, vurderinger, skjema og nyheter. Alt legges inn som data, med historikk og godkjenning – som om dere la det inn selv.`}
    >
      <Row>
        <Btn icon="folder-open-outline" label="Velg fil" onPress={pick} />
        <Btn icon="clipboard-outline" label={paste ? 'Skjul innliming' : 'Lim inn'} onPress={() => setPaste(!paste)} />
        {fileName ? <Pill label={fileName} icon="document-outline" /> : null}
      </Row>
      {paste ? (
        <>
          <TextIn multiline rows={6} value={raw} onChangeText={setRaw} placeholder='{ "format": "protop.iso.package", … }' />
          <Btn small label="Les inn" onPress={() => load(raw, 'innlimt')} />
        </>
      ) : null}
      {err ? <Banner tone="danger" text={err} /> : null}
      {parsed?.ok ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 15 }}>{parsed.pkg.title}</Text>
          {parsed.pkg.source?.system ? <Text style={{ color: colors.muted, fontSize: 12 }}>Kilde: {parsed.pkg.source.system}{parsed.pkg.source.readAt ? ` · lest ${parsed.pkg.source.readAt}` : ''}</Text> : null}
          {parsed.pkg.description ? <Text style={{ color: colors.ink, fontSize: 13 }}>{parsed.pkg.description}</Text> : null}
          {parsed.warnings.map((w, i) => <Banner key={i} tone="warn" text={w} />)}
          {PACKAGE_SECTIONS.map((s) => {
            const c = plan?.counts?.[s.id] || { ny: 0, finnes: 0, feil: 0 };
            const rows = plan?.plan?.[s.id] || [];
            const present = rows.length > 0 || (s.id === 'system' && parsed.pkg.system);
            if (!present) return null;
            return (
              <View key={s.id} style={{ gap: 4, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: colors.line }}>
                <Row>
                  <View style={{ flex: 1, minWidth: 200 }}><Check label={s.label} value={sections.has(s.id)} onChange={(x) => { const n = new Set(sections); if (x) n.add(s.id); else n.delete(s.id); setSections(n); }} /></View>
                  <Pill label={`${c.ny} nye`} tone={c.ny ? 'ok' : 'muted'} />
                  {c.finnes ? <Pill label={`${c.finnes} finnes`} /> : null}
                  {c.feil ? <Pill label={`${c.feil} feil`} tone="danger" /> : null}
                  <Btn small icon={open === s.id ? 'chevron-up' : 'chevron-down'} label={open === s.id ? 'Skjul' : 'Vis'} onPress={() => setOpen(open === s.id ? '' : s.id)} />
                </Row>
                {open === s.id && s.id === 'news' ? (parsed.pkg.news || []).map((n) => {
                  const r = rows.find((x) => x.key === n.key);
                  const there = r?.message === 'Ligger allerede på Selskap → Nyheter';
                  return (
                    <View key={n.key} style={{ gap: 2, paddingVertical: 4 }}>
                      {there
                        ? <ListRow icon="checkmark-circle-outline" title={n.title || n.key} subtitle={r.message} right={<Pill label="Finnes" />} />
                        : <Check label={`${n.title || n.key}${n.category ? ` · ${n.category}` : ''}`} value={!!newsKeys?.has(n.key)} onChange={(x) => { const next = new Set(newsKeys || []); if (x) next.add(n.key); else next.delete(n.key); setNewsKeys(next); }} />}
                      {!there && n.body ? <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={3}>{n.body}</Text> : null}
                    </View>
                  );
                }) : null}
                {open === s.id && s.id !== 'news' ? rows.map((r, i) => (
                  <ListRow key={`${r.key}${i}`} icon={r.status === 'feil' ? 'alert-circle-outline' : (r.status === 'ny' ? 'add-circle-outline' : 'checkmark-circle-outline')} tone={STATUS[r.status].tone} title={r.title || r.key} subtitle={r.message} right={<Pill label={STATUS[r.status].label} tone={STATUS[r.status].tone} />} />
                )) : null}
                {s.id === 'news' ? <Text style={{ color: colors.muted, fontSize: 12 }}>Nyhetene publiseres på Selskap → Nyheter, som er eneste sted for nyheter i ProTop. Velg bort dem som skal vente, og skriv dem senere fra Selskap.</Text> : null}
                {s.id === 'competence' ? <Text style={{ color: colors.muted, fontSize: 12 }}>Utdanning, kurs og sertifiseringer legges i CV-en til den ansatte. ISO → Kompetanse viser dem sammen med kompetansekravene.</Text> : null}
              </View>
            );
          })}
          {plan?.issues?.length ? (
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Merknader ({plan.issues.length})</Text>
              {plan.issues.slice(0, open === 'issues' ? 500 : 6).map((m, i) => <Text key={i} style={{ color: colors.muted, fontSize: 12 }}>• {m}</Text>)}
              {plan.issues.length > 6 ? <Btn small label={open === 'issues' ? 'Vis færre' : `Vis alle ${plan.issues.length}`} onPress={() => setOpen(open === 'issues' ? '' : 'issues')} /> : null}
            </View>
          ) : null}
          {parsed.pkg.review.length ? (
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Til oppfølging fra pakken ({parsed.pkg.review.length})</Text>
              {parsed.pkg.review.slice(0, open === 'review' ? 1000 : 5).map((m, i) => <Text key={i} style={{ color: colors.ink, fontSize: 12 }}>• {m}</Text>)}
              {parsed.pkg.review.length > 5 ? <Btn small label={open === 'review' ? 'Vis færre' : `Vis alle ${parsed.pkg.review.length}`} onPress={() => setOpen(open === 'review' ? '' : 'review')} /> : null}
            </View>
          ) : null}
          <Field label="Godkjenning">
            {caps.approve ? (
              <Check label="Publiser dokumenter og prosesser direkte (jeg har gått gjennom innholdet og er godkjenner)" value={publishDirect} onChange={setPublishDirect} />
            ) : null}
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {publishDirect && caps.approve
                ? 'Dokumenter og prosesser publiseres med en gang og blir synlige for alle ansatte.'
                : 'Dokumenter og prosesser sendes til godkjenning. Godkjenner får én samleoppgave og godkjenner hvert dokument i ISO → Dokumenter.'}
            </Text>
          </Field>
          <Row>
            <Btn kind="primary" icon="cloud-upload-outline" label={total ? `Importer ${total} poster` : 'Ingenting nytt å importere'} disabled={!total || busy} busy={busy} onPress={run} />
            {done ? <Btn icon="document-text-outline" label="Gå til Dokumenter" onPress={() => go('dokumenter', { awaiting: true })} /> : null}
            {done ? <Btn icon="git-network-outline" label="Gå til Prosesser" onPress={() => go('prosesser')} /> : null}
          </Row>
          {log.map((l, i) => <Text key={i} style={{ color: colors.ink, fontSize: 13 }}>• {l}</Text>)}
          {Platform.OS !== 'web' ? <Text style={{ color: colors.muted, fontSize: 11 }}>Tips: Store pakker importeres raskest fra nettleseren.</Text> : null}
        </View>
      ) : null}
    </Card>
  );
}
