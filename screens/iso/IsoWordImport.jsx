/**
 * «Importer fra Word» i Dokumenter: velg én eller flere .docx og få dokumentutkast.
 * Innholdet blir Markdown (overskrifter, lister, tabeller), dokument-ID og tittel hentes fra
 * filnavnet (F-01-009 …), og originalfilen legges ved. Utkastene godkjennes som vanlig.
 * Leseren er src/iso/docx.js.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import { codeTaken, createDocument, DOC_TYPES } from '../../src/iso/documents';
import { documentMetaFromFileName, docxToMarkdown } from '../../src/iso/docx';
import { requirementIdsForDocument } from '../../src/iso/integrations';
import { pickDocument, uploadFile } from '../../src/utils/media';
import { readFileBytes, safeFileName } from './readFileBytes';
import { Banner, Btn, Check, Choice, ListRow, Pill, Row, Sheet } from './isoUi';

const ACCEPT = '.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export default function IsoWordImport({ ctx, visible, onClose }) {
  const colors = useColors();
  const { state, actor, store, companyId, wide } = ctx;
  const [items, setItems] = useState([]);
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState('');
  const [progress, setProgress] = useState(null);

  async function pick() {
    setErr('');
    setDone('');
    try {
      const picked = await pickDocument({ multiple: true, accept: ACCEPT });
      const list = Array.isArray(picked) ? picked : (picked ? [picked] : []);
      if (!list.length) return;
      const next = [];
      for (const file of list) {
        try {
          const parsed = docxToMarkdown(await readFileBytes(file, 'Word-filen'));
          const meta = documentMetaFromFileName(file.name, parsed.title);
          next.push({ key: `${file.name}:${file.size || 0}`, file, parsed, meta, docType: meta.docType });
        } catch (e) {
          next.push({ key: `${file.name}:feil`, file, error: e?.message || 'Kunne ikke lese filen.' });
        }
      }
      setItems((cur) => [...cur.filter((c) => !next.some((n) => n.key === c.key)), ...next]);
    } catch (e) {
      setErr(e?.message || 'Kunne ikke lese filene.');
    }
  }

  const statusOf = (it) => {
    if (it.error) return 'feil';
    if (it.meta.code && codeTaken(it.meta.code, state.documents)) return 'finnes';
    return 'ny';
  };
  const ready = items.filter((it) => statusOf(it) === 'ny');

  async function run() {
    setBusy(true);
    setErr('');
    let existing = store.current().documents || [];
    let made = 0;
    const failed = [];
    for (const [i, it] of ready.entries()) {
      setProgress({ done: i, total: ready.length, detail: it.file.name });
      let url = '';
      if (attach) {
        try {
          url = await uploadFile(`families/${companyId}/iso/word/${Date.now()}-${safeFileName(it.file.name, 'dokument.docx')}`, it.file, it.file.mimeType || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        } catch {
          // Dokumentet lages likevel; originalen kan legges ved senere.
        }
      }
      const res = createDocument({
        title: it.meta.title,
        docType: it.docType,
        code: codeTaken(it.meta.code, existing) ? '' : it.meta.code,
        folder: it.meta.folder,
        content: it.parsed.markdown,
        attachments: typeof url === 'string' && url ? [{ label: it.file.name, url, kind: 'original' }] : [],
        source: { system: 'Word', path: it.file.name, originalCode: it.meta.originalCode, note: it.parsed.images ? `${it.parsed.images} bilder i originalen er ikke tatt med i teksten.` : '' },
        changeReason: `Importert fra Word (${it.file.name})`,
        requirementIds: requirementIdsForDocument(state, it.docType),
        readAckRequired: ['policy', 'instruks', 'handbok'].includes(it.docType),
      }, { actor, existing });
      const saved = res.ok ? await store.commit('documents', 'document', res) : res;
      if (saved.ok) { existing = [...existing, res.document]; made += 1; } else failed.push(`${it.file.name}: ${saved.error}`);
    }
    setProgress(null);
    setBusy(false);
    setItems((cur) => cur.filter((it) => statusOf(it) !== 'ny'));
    if (made) setDone(`${made} ${made === 1 ? 'dokument er lagt inn' : 'dokumenter er lagt inn'} som utkast. Kontroller innholdet og send til godkjenning.`);
    if (failed.length) setErr(`Ble ikke lagt inn: ${failed.join('; ')}`);
  }

  function close() {
    setItems([]); setErr(''); setDone('');
    onClose?.();
  }

  return (
    <Sheet
      visible={visible}
      title="Importer dokumenter fra Word"
      onClose={close}
      wide={wide}
      footer={(
        <>
          <Btn label={done && !ready.length ? 'Lukk' : 'Avbryt'} onPress={close} />
          <Btn kind="primary" icon="cloud-upload-outline" label={ready.length ? `Lag ${ready.length} utkast` : 'Lag utkast'} disabled={!ready.length} busy={busy} onPress={run} />
        </>
      )}
    >
      <Text style={{ color: colors.ink, fontSize: 13 }}>
        Velg én eller flere .docx-filer. Overskrifter, avsnitt, lister og tabeller blir med. Dokument-ID og tittel hentes fra filnavnet, f.eks. «F-01-009 Prosedyre - Dokumentstyring». Dokumenter med en ID som finnes fra før, hoppes over.
      </Text>
      <Row>
        <Btn icon="document-attach-outline" label={items.length ? 'Legg til flere filer' : 'Velg Word-filer'} onPress={pick} />
      </Row>
      <Check label="Legg ved originalfilen" value={attach} onChange={setAttach} />
      {err ? <Banner tone="danger" text={err} /> : null}
      {done ? <Banner tone="ok" text={done} /> : null}
      {items.map((it) => {
        const st = statusOf(it);
        return (
          <View key={it.key} style={{ gap: 6 }}>
            <ListRow
              icon={st === 'feil' ? 'alert-circle-outline' : 'document-text-outline'}
              tone={st === 'feil' ? 'danger' : (st === 'finnes' ? 'muted' : 'info')}
              title={it.error ? it.file.name : `${it.meta.code ? `${it.meta.code} · ` : ''}${it.meta.title}`}
              subtitle={it.error || [
                `${it.parsed.words} ord`,
                it.parsed.headings ? `${it.parsed.headings} overskrifter` : '',
                it.parsed.tables ? `${it.parsed.tables} tabeller` : '',
                it.parsed.images ? `${it.parsed.images} bilder ikke tatt med` : '',
                it.parsed.truncated ? 'teksten er kortet ned' : '',
              ].filter(Boolean).join(' · ')}
              right={<Pill label={st === 'ny' ? 'Ny' : (st === 'finnes' ? 'ID finnes' : 'Feil')} tone={st === 'ny' ? 'ok' : (st === 'finnes' ? 'muted' : 'danger')} />}
            />
            {st === 'ny' ? (
              <Choice small options={DOC_TYPES} value={it.docType} onChange={(x) => setItems((cur) => cur.map((c) => (c.key === it.key ? { ...c, docType: x || c.docType } : c)))} />
            ) : null}
          </View>
        );
      })}
      <BrandBusyOverlay visible={!!progress} label="Lager dokumentutkast" detail={progress?.detail} done={progress?.done} total={progress?.total} testID="iso-word-busy" />
    </Sheet>
  );
}
