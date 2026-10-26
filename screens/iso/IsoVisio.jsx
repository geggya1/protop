/**
 * Visio i ProTop: les en .vsdx, vis tegningen som prosesskart og lag et prosessutkast av den.
 * Originalfilen lastes opp og ligger som kilde på prosessen. Leseren er src/iso/visio.js.
 */
import React, { useMemo, useState } from 'react';
import { Text, useWindowDimensions, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { createProcess, PROCESS_CATEGORIES } from '../../src/iso/processes';
import { visioToProcesses } from '../../src/iso/visio';
import { pickDocument, uploadFile } from '../../src/utils/media';
import { bytesFromBase64, storagePathFromReference } from '../../src/anbud/documentFile';
import IsoDiagram, { fitView } from './IsoDiagram';
import { Banner, Btn, Choice, Field, PersonPick, Pill, Row, Sheet, TextIn } from './isoUi';

async function readBytes(picked) {
  if (picked?.blob?.arrayBuffer) return new Uint8Array(await picked.blob.arrayBuffer());
  if (typeof Blob !== 'undefined' && picked instanceof Blob) return new Uint8Array(await picked.arrayBuffer());
  try {
    const res = await fetch(picked.uri || picked.url);
    if (res.ok) return new Uint8Array(await res.arrayBuffer());
  } catch {
    // CORS mot Storage fra nettleseren: hent via serveren under.
  }
  const path = picked.path || storagePathFromReference(picked.url || '');
  if (path) {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('../../firebase');
    const res = await httpsCallable(functions, 'downloadStorageFile', { timeout: 120000 })({ objectPath: path });
    const bytes = bytesFromBase64(res?.data?.fileBase64 || '');
    if (bytes?.length) return bytes;
  }
  throw new Error('Kunne ikke hente Visio-filen.');
}

const safeName = (name) => String(name || 'tegning.vsdx').replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);

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
  const page = res?.pages?.[pageIx] || null;
  const name = useMemo(() => String(file?.name || '').replace(/\.vsdx$/i, ''), [file]);

  async function pick() {
    setErr('');
    try {
      const picked = await pickDocument({ accept: '.vsdx,application/vnd.ms-visio.drawing,application/vnd.ms-visio.drawing.main+xml' });
      if (!picked) return;
      const bytes = await readBytes(picked);
      const out = visioToProcesses(bytes);
      setFile(picked);
      setRes(out);
      setPageIx(0);
      const base = String(picked.name || '').replace(/\.vsdx$/i, '');
      const code = (/^([A-Z]-\d{2}-\d{3})/.exec(base) || [])[1] || '';
      setForm((f) => ({ ...f, code, title: (out.pages[0]?.title && out.pages[0].title !== 'Side-1' ? out.pages[0].title : base.replace(/^[A-Z]-\d{2}-\d{3}\s*-?\s*/, '')) || base }));
    } catch (e) {
      setErr(e?.message || 'Kunne ikke lese Visio-filen.');
    }
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
          <Btn label="Avbryt" onPress={onClose} />
          <Btn kind="primary" label="Lag prosessutkast" disabled={!page || !form.title || !form.ownerName} busy={busy} onPress={create} />
        </>
      )}
    >
      <Text style={{ color: colors.ink, fontSize: 13 }}>
        Velg en .vsdx-fil. ProTop leser figurene, pilene og svømmebanene og lager et prosessutkast. Baner blir roller, beslutninger blir Ja/Nei-grener, og originalfilen legges ved som kilde. Kontroller kartet i prosessbyggeren før du sender det til godkjenning.
      </Text>
      <Row>
        <Btn icon="document-attach-outline" label={file ? 'Velg en annen fil' : 'Velg Visio-fil'} onPress={pick} />
        {file ? <Pill label={file.name} icon="document-outline" /> : null}
      </Row>
      {err ? <Banner tone="danger" text={err} /> : null}
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
    </Sheet>
  );
}
