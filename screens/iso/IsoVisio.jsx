/**
 * Visio i ProTop: les en .vsdx, vis tegningen som prosesskart og lag et prosessutkast av den.
 * Originalfilen lastes opp og ligger som kilde på prosessen. Leseren er src/iso/visio.js.
 */
import React, { useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import { createProcess, PROCESS_CATEGORIES } from '../../src/iso/processes';
import { visioToProcesses } from '../../src/iso/visio';
import { pickDocument, uploadFile } from '../../src/utils/media';
import { readFileBytes, safeFileName } from './readFileBytes';
import IsoDiagram, { fitView } from './IsoDiagram';
import { Banner, Btn, Choice, Field, PersonPick, Pill, Row, Sheet, TextIn } from './isoUi';

const readBytes = (picked) => readFileBytes(picked, 'Visio-filen');
const safeName = (name) => safeFileName(name, 'tegning.vsdx');
const VISIO_ACCEPT = '.vsdx,application/vnd.ms-visio.drawing,application/vnd.ms-visio.drawing.main+xml';

/** Kode, navn og kategori fra filnavnet («B-01-002 - Tilbud.vsdx») og tegningen. */
function metaFromVisio(fileName, out) {
  const base = String(fileName || '').replace(/\.vsdx$/i, '');
  const code = (/^([A-Z]-\d{2}-\d{3})/.exec(base) || [])[1] || '';
  const fromPage = out?.pages?.[0]?.title && !/^(side|page)-?\d+$/i.test(out.pages[0].title) ? out.pages[0].title : '';
  const title = fromPage || base.replace(/^[A-Z]-\d{2}-\d{3}\s*-?\s*/, '') || base;
  const group = (/^B-(\d{2})/.exec(code) || [])[1];
  const category = group === '02' ? 'stotte' : (group === '03' ? 'ledelse' : 'kjerne');
  return { code, title, category };
}

/** Én side fra Visio: statistikk, advarsler, validering og kartet. */
function VisioPage({ page, height = 380 }) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const view = fitView(page.diagram, Math.min(width - 64, 1100), height);
  return (
    <View style={{ gap: 8 }}>
      <Row>
        <Pill label={`${page.stats.steps} steg`} />
        <Pill label={`${page.stats.arrows} piler`} />
        <Pill label={`${page.stats.lanes} baner`} />
        <Pill label={page.validation.ok ? 'Gyldig kart' : `${page.validation.errors.length} feil å rette`} tone={page.validation.ok ? 'ok' : 'warn'} />
      </Row>
      {page.warnings.map((w, i) => <Text key={i} style={{ color: colors.muted, fontSize: 12 }}>• {w}</Text>)}
      {!page.validation.ok ? page.validation.errors.slice(0, 5).map((e, i) => <Text key={`e${i}`} style={{ color: colors.warn, fontSize: 12 }}>• {e.message}</Text>) : null}
      <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 12, overflow: 'hidden' }}>
        <IsoDiagram diagram={page.diagram} scale={view.scale} offset={view.offset} height={height} />
      </View>
    </View>
  );
}

/** Vis en Visio-fil (f.eks. et vedlegg) uten å importere den. */
export function VisioViewer({ visible, source, title, onClose, wide }) {
  const colors = useColors();
  const [res, setRes] = useState(null);
  const [err, setErr] = useState('');
  const [pageIx, setPageIx] = useState(0);
  React.useEffect(() => {
    let live = true;
    if (!visible || !source) return undefined;
    setRes(null); setErr(''); setPageIx(0);
    readBytes(source).then((bytes) => { if (live) setRes(visioToProcesses(bytes)); }).catch((e) => { if (live) setErr(e?.message || 'Kunne ikke lese Visio-filen.'); });
    return () => { live = false; };
  }, [visible, source]);
  const page = res?.pages?.[pageIx] || null;
  return (
    <Sheet visible={visible} title={title || 'Visio-tegning'} onClose={onClose} wide={wide}>
      {err ? <Banner tone="danger" text={err} /> : null}
      {!res && !err ? <Text style={{ color: colors.muted }}>Leser tegningen …</Text> : null}
      {res && res.pages.length > 1 ? <Choice small options={res.pages.map((p, i) => ({ id: String(i), label: p.name }))} value={String(pageIx)} onChange={(x) => setPageIx(Number(x) || 0)} /> : null}
      {page ? <VisioPage page={page} height={460} /> : null}
      <Text style={{ color: colors.muted, fontSize: 11 }}>Tegningen er tolket fra Visio: figurer, piler og svømmebaner. Farger, bilder og fritt plasserte tekster vises ikke.</Text>
    </Sheet>
  );
}

/** «Importer fra Visio»: velg fil, se kartet, lag prosessutkast. */
export function VisioImportSheet({ ctx, visible, onClose, onCreated }) {
  const colors = useColors();
  const { actor, store, people, companyId, wide } = ctx;
  const [file, setFile] = useState(null);
  const [res, setRes] = useState(null);
  const [pageIx, setPageIx] = useState(0);
  const [form, setForm] = useState({ title: '', code: '', category: 'kjerne', ownerName: '', ownerUid: '' });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  // Flere filer på én gang: én rad per fil, felles prosesseier.
  const [batch, setBatch] = useState([]);
  const [made, setMade] = useState('');
  const page = res?.pages?.[pageIx] || null;
  const name = useMemo(() => String(file?.name || '').replace(/\.vsdx$/i, ''), [file]);
  const codeExists = (code) => !!code && (store.current().processes || []).some((p) => !p.archived && String(p.code || '').toUpperCase() === code.toUpperCase());

  async function pick() {
    setErr('');
    setMade('');
    try {
      const picked = await pickDocument({ multiple: true, accept: VISIO_ACCEPT });
      const list = Array.isArray(picked) ? picked : (picked ? [picked] : []);
      if (!list.length) return;
      if (list.length === 1) {
        const out = visioToProcesses(await readBytes(list[0]));
        const meta = metaFromVisio(list[0].name, out);
        setBatch([]);
        setFile(list[0]);
        setRes(out);
        setPageIx(0);
        setForm((f) => ({ ...f, code: meta.code, title: meta.title, category: meta.category }));
        return;
      }
      const rows = [];
      for (const f of list) {
        try {
          const out = visioToProcesses(await readBytes(f));
          rows.push({ key: f.name, file: f, out, ...metaFromVisio(f.name, out) });
        } catch (e) {
          rows.push({ key: f.name, file: f, error: e?.message || 'Kunne ikke lese filen.' });
        }
      }
      setFile(null); setRes(null);
      setBatch(rows);
    } catch (e) {
      setErr(e?.message || 'Kunne ikke lese Visio-filen.');
    }
  }

  async function createBatch() {
    setBusy(true);
    setErr('');
    let count = 0;
    const failed = [];
    const todo = batch.filter((row) => !row.error && row.out?.pages?.[0] && !codeExists(row.code));
    for (const row of batch) {
      if (row.error || !row.out?.pages?.[0] || codeExists(row.code)) continue;
      setProgress({ done: count + failed.length, total: todo.length, detail: row.file?.name || row.title });
      const pg = row.out.pages[0];
      let url = '';
      try {
        url = await uploadFile(`families/${companyId}/iso/visio/${Date.now()}-${safeName(row.file?.name)}`, row.file, 'application/vnd.ms-visio.drawing');
      } catch {
        // Prosessen lages likevel; originalen kan lastes opp på nytt senere.
      }
      const r = createProcess({ ...form, title: row.title, code: row.code, category: row.category }, { actor, template: { title: row.title, category: row.category, diagram: pg.diagram, code: row.code } });
      if (!r.ok) { failed.push(`${row.file.name}: ${r.error}`); continue; }
      const process = {
        ...r.process,
        source: { system: 'Visio', ref: [row.file?.name, pg.name].filter(Boolean).join(' · '), url: typeof url === 'string' ? url : '' },
        purpose: r.process.purpose || (pg.notes?.length ? `Merknader i Visio-tegningen: ${pg.notes.join(' · ')}`.slice(0, 2000) : ''),
      };
      const saved = await store.commit('processes', 'process', { ...r, process });
      if (saved.ok) count += 1; else failed.push(`${row.file.name}: ${saved.error}`);
    }
    setProgress(null);
    setBusy(false);
    setBatch([]);
    if (count) setMade(`${count} ${count === 1 ? 'prosessutkast er laget' : 'prosessutkast er laget'}. Kontroller kartene i prosessbyggeren og send dem til godkjenning.`);
    if (failed.length) setErr(`Ble ikke laget: ${failed.join('; ')}`);
  }

  async function create() {
    if (!page) return;
    setBusy(true);
    setErr('');
    let url = '';
    try {
      url = await uploadFile(`families/${companyId}/iso/visio/${Date.now()}-${safeName(file?.name)}`, file, 'application/vnd.ms-visio.drawing');
    } catch {
      // Prosessen lages likevel; originalen kan lastes opp på nytt senere.
    }
    const res2 = createProcess({ ...form }, { actor, template: { title: form.title, category: form.category, diagram: page.diagram, code: form.code } });
    if (!res2.ok) { setErr(res2.error); setBusy(false); return; }
    const process = {
      ...res2.process,
      source: { system: 'Visio', ref: [file?.name, page.name].filter(Boolean).join(' · '), url: typeof url === 'string' ? url : '' },
      purpose: res2.process.purpose || (page.notes?.length ? `Merknader i Visio-tegningen: ${page.notes.join(' · ')}`.slice(0, 2000) : ''),
    };
    const saved = await store.commit('processes', 'process', { ...res2, process });
    setBusy(false);
    if (!saved.ok) { setErr(saved.error); return; }
    setFile(null); setRes(null);
    onCreated?.(process.id);
  }

  return (
    <Sheet
      visible={visible}
      title="Importer prosesskart fra Visio"
      onClose={onClose}
      wide={wide}
      footer={(
        <>
          <Btn label={made ? 'Lukk' : 'Avbryt'} onPress={onClose} />
          {batch.length ? (
            <Btn kind="primary" label={`Lag ${batch.filter((b) => !b.error && !codeExists(b.code)).length} prosessutkast`} disabled={!form.ownerName || !batch.some((b) => !b.error && !codeExists(b.code))} busy={busy} onPress={createBatch} />
          ) : (
            <Btn kind="primary" label="Lag prosessutkast" disabled={!page || !form.title || !form.ownerName} busy={busy} onPress={create} />
          )}
        </>
      )}
    >
      <Text style={{ color: colors.ink, fontSize: 13 }}>
        Velg én eller flere .vsdx-filer. ProTop leser figurene, pilene og svømmebanene og lager et prosessutkast per fil. Baner blir roller, beslutninger blir Ja/Nei-grener, og originalfilen legges ved som kilde. Kode og navn hentes fra filnavnet (B-01-002 - Tilbud). Kontroller kartene i prosessbyggeren før du sender dem til godkjenning.
      </Text>
      <Row>
        <Btn icon="document-attach-outline" label={file || batch.length ? 'Velg andre filer' : 'Velg Visio-filer'} onPress={pick} />
        {file ? <Pill label={file.name} icon="document-outline" /> : null}
      </Row>
      {err ? <Banner tone="danger" text={err} /> : null}
      {made ? <Banner tone="ok" text={made} /> : null}
      {batch.length ? (
        <>
          {batch.map((row) => {
            const exists = codeExists(row.code);
            const pg = row.out?.pages?.[0];
            return (
              <View key={row.key} style={{ gap: 6, borderTopWidth: 1, borderColor: colors.line, paddingTop: 8 }}>
                <Row>
                  <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700', flex: 1 }}>{row.error ? row.file.name : `${row.code ? `${row.code} · ` : ''}${row.title}`}</Text>
                  {row.error ? <Pill label="Feil" tone="danger" /> : null}
                  {!row.error && exists ? <Pill label="Kode finnes" /> : null}
                  {pg ? <Pill label={pg.validation.ok ? `${pg.stats.steps} steg` : `${pg.validation.errors.length} feil å rette`} tone={pg.validation.ok ? 'ok' : 'warn'} /> : null}
                </Row>
                {row.error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{row.error}</Text> : null}
                {!row.error && !exists ? (
                  <Choice small options={PROCESS_CATEGORIES} value={row.category} onChange={(x) => setBatch((cur) => cur.map((b) => (b.key === row.key ? { ...b, category: x || b.category } : b)))} />
                ) : null}
              </View>
            );
          })}
          <Field label="Prosesseier for alle" required hint="Kan endres per prosess etterpå."><PersonPick people={people} value={form.ownerName} onChange={(p) => setForm({ ...form, ownerName: p.name, ownerUid: p.uid })} /></Field>
        </>
      ) : null}
      {res && res.pages.length > 1 ? (
        <Field label="Side i Visio-filen">
          <Choice small options={res.pages.map((p, i) => ({ id: String(i), label: p.name }))} value={String(pageIx)} onChange={(x) => setPageIx(Number(x) || 0)} />
        </Field>
      ) : null}
      {page ? (
        <>
          <VisioPage page={page} />
          <Field label="Navn" required><TextIn value={form.title} onChangeText={(x) => setForm({ ...form, title: x })} placeholder={name} /></Field>
          <Field label="Kode" hint="F.eks. B-01-003. Hentes fra filnavnet når det starter med en kode."><TextIn value={form.code} onChangeText={(x) => setForm({ ...form, code: x })} /></Field>
          <Field label="Kategori"><Choice options={PROCESS_CATEGORIES} value={form.category} onChange={(x) => setForm({ ...form, category: x || 'kjerne' })} /></Field>
          <Field label="Prosesseier" required><PersonPick people={people} value={form.ownerName} onChange={(p) => setForm({ ...form, ownerName: p.name, ownerUid: p.uid })} /></Field>
        </>
      ) : null}
      <BrandBusyOverlay visible={busy} label="Lager prosessutkast fra Visio" detail={progress?.detail || file?.name} done={progress?.done} total={progress?.total} testID="iso-visio-busy" />
    </Sheet>
  );
}
