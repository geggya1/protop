import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  ackFor,
  ackStatus,
  addChapter,
  chaptersFromText,
  draftChanged,
  moveChapter,
  normalizeHandbook,
  openPlaceholders,
  publishHandbook,
  removeChapter,
  setChapter,
  standardHandbookChapters,
} from '../../src/hr/handbook';
import { loadHandbookAcks, saveHandbookAck } from '../../src/hr/handbookAcks';
import { filterHrEmployees } from '../../src/hr/model';
import { textFromDocx } from '../../src/employees/cvImport';
import { FOCUS_FIELD_BG, FOCUS_FIELD_BORDER, FOCUS_FIELD_INK } from '../../src/forms/highlight';
import { pickDocument } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';
import { HrButton, HrCard, HrSectionTitle } from './HrShared';
import HandbookText from './HandbookText';
import { printHandbook } from './handbookPrint';

function dateText(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' });
}

async function readImportFile(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') blob = await (await fetch(file.uri)).blob();
  if (!blob || typeof blob.arrayBuffer !== 'function') return '';
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const name = String(file?.name || '').toLowerCase();
  if (name.endsWith('.docx')) return textFromDocx(bytes);
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

/** Lesevisning med innholdsliste og bekreftelse. Brukes av HR og av den ansatte selv. */
export function HandbookReader({ colors, handbook, company, ack, onAck, busy = false }) {
  const [open, setOpen] = useState('');
  const chapters = handbook?.chapters || [];
  if (!handbook?.version) {
    return <Text style={{ color: colors.muted }}>Personalhåndboken er ikke publisert ennå.</Text>;
  }
  const current = ack && ack.version >= handbook.version;
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.muted }}>Versjon {handbook.version} · publisert {dateText(handbook.at)}</Text>
      {chapters.map((chapter, index) => (
        <View key={chapter.id} style={[styles.readRow, { borderColor: colors.line }]}>
          <TouchableOpacity onPress={() => setOpen(open === chapter.id ? '' : chapter.id)} accessibilityRole="button" style={styles.readHead}>
            <Ionicons name={open === chapter.id ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.muted} />
            <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>{index + 1}. {chapter.title}</Text>
          </TouchableOpacity>
          {open === chapter.id ? <View style={styles.readBody}><HandbookText body={chapter.body} colors={colors} company={company} /></View> : null}
        </View>
      ))}
      {onAck ? (
        current ? (
          <Text style={{ color: '#1d7a3e', fontWeight: '600' }}>Du bekreftet versjon {ack.version} {dateText(ack.at)}.</Text>
        ) : (
          <View style={[styles.ackBox, { backgroundColor: FOCUS_FIELD_BG, borderColor: FOCUS_FIELD_BORDER }]}>
            <Text style={{ color: FOCUS_FIELD_INK }}>
              {ack ? `Du har bekreftet versjon ${ack.version}. Les endringene og bekreft versjon ${handbook.version}.` : 'Les håndboken og bekreft at du har lest og forstått den.'}
            </Text>
            <HrButton colors={colors} primary icon="checkmark-done" label={busy ? 'Lagrer …' : `Jeg har lest og forstått versjon ${handbook.version}`} onPress={onAck} disabled={busy} />
          </View>
        )
      ) : null}
    </View>
  );
}

export default function HrHandbook({ colors, hr, canWrite, onPatch, employees, familyId, actor, company, logo }) {
  const handbook = useMemo(() => normalizeHandbook(hr?.handbook), [hr?.handbook]);
  const [selected, setSelected] = useState(handbook.chapters[0]?.id || '');
  const [mode, setMode] = useState(canWrite ? 'rediger' : 'les');
  const [acks, setAcks] = useState([]);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [noteBad, setNoteBad] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const handbookRef = useRef(handbook);
  const onPatchRef = useRef(onPatch);
  const pendingRef = useRef(null);
  const timerRef = useRef(null);
  handbookRef.current = handbook;
  onPatchRef.current = onPatch;

  useEffect(() => {
    let live = true;
    loadHandbookAcks(familyId).then((rows) => { if (live) setAcks(rows); });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    if (!handbook.chapters.some((row) => row.id === selected)) setSelected(handbook.chapters[0]?.id || '');
  }, [handbook.chapters, selected]);

  // Tekst lagres etter en kort pause i skrivingen, ikke for hvert tastetrykk.
  function flushEdit() {
    clearTimeout(timerRef.current);
    const pending = pendingRef.current;
    pendingRef.current = null;
    if (!pending) return handbookRef.current;
    const next = setChapter(handbookRef.current, pending.id, { title: pending.title, body: pending.body });
    onPatchRef.current({ handbook: next });
    handbookRef.current = next;
    return next;
  }

  useEffect(() => {
    flushEdit();
    const row = handbookRef.current.chapters.find((item) => item.id === selected);
    setEdit(row ? { id: row.id, title: row.title, body: row.body } : null);
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => flushEdit(), []); // eslint-disable-line react-hooks/exhaustive-deps

  function editChapter(part) {
    setEdit((current) => {
      if (!current) return current;
      const next = { ...current, ...part };
      pendingRef.current = next;
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flushEdit, 900);
      return next;
    });
  }

  const published = handbook.published;
  const changed = draftChanged(handbook);
  const open = openPlaceholders(handbook.chapters);
  const people = filterHrEmployees(employees, 'active');
  const status = published ? ackStatus(people, acks, published.version) : [];
  const done = status.filter((row) => row.current).length;
  const chapter = handbook.chapters.find((row) => row.id === selected) || null;
  const myAck = acks
    .filter((row) => row.uid && row.uid === actor?.uid)
    .sort((a, b) => b.version - a.version)[0] || null;

  function say(text, bad = false) {
    setNote(text);
    setNoteBad(bad);
  }

  function save(next, message = '') {
    onPatch({ handbook: next });
    if (message) say(message);
  }

  function applyChapters(chapters, message) {
    pendingRef.current = null;
    clearTimeout(timerRef.current);
    save({ ...handbookRef.current, chapters, changedAt: new Date().toISOString() }, message);
    setSelected(chapters[0]?.id || '');
    setConfirmReplace(null);
  }

  function offerChapters(chapters, source) {
    if (!chapters.length) {
      say(`Fant ingen kapitler i ${source}.`, true);
      return;
    }
    if (handbook.chapters.length) {
      setConfirmReplace({ chapters, source });
      return;
    }
    applyChapters(chapters, `${chapters.length} kapitler lest inn fra ${source}. Se over og publiser.`);
  }

  async function importFile() {
    try {
      const picked = await pickDocument({ accept: '.docx,.txt,.md,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      const file = Array.isArray(picked) ? picked[0] : picked;
      if (!file) return;
      const text = await readImportFile(file);
      offerChapters(chaptersFromText(text), file.name || 'filen');
    } catch (err) {
      say(err?.message || 'Kunne ikke lese filen.', true);
    }
  }

  function publish() {
    const latest = flushEdit();
    const res = publishHandbook(latest, { by: actor?.name || '', reason });
    if (!res.ok) {
      say(res.error, true);
      if (res.open?.[0]) setSelected(res.open[0].chapterId);
      return;
    }
    save(res.handbook, `Versjon ${res.handbook.published.version} er publisert. Alle ansatte må bekrefte den.`);
    setReason('');
    showSaveToast('Personalhåndboken er publisert.');
  }

  async function confirmRead() {
    if (!published) return;
    const employee = people.find((row) => row.personUid && row.personUid === actor?.uid);
    setBusy(true);
    const res = await saveHandbookAck(familyId, ackFor({ uid: actor?.uid, employeeId: employee?.id || '', name: actor?.name }, published.version));
    setBusy(false);
    if (!res.ok) {
      say(res.error, true);
      return;
    }
    setAcks((rows) => [...rows.filter((row) => row.uid !== res.ack.uid), res.ack]);
    showSaveToast('Takk, bekreftelsen er lagret.');
  }

  const readerBook = published ? { ...published, chapters: published.chapters } : null;

  return (
    <View style={styles.page} nativeID="hr-handbook">
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title={handbook.title}
          subtitle={published
            ? `Versjon ${published.version} publisert ${dateText(published.at)}${published.by ? ` av ${published.by}` : ''}${changed ? ' · utkastet har endringer' : ''}`
            : 'Ikke publisert ennå'}
          right={(
            <View style={styles.row}>
              {canWrite ? (
                <>
                  <HrButton colors={colors} label="Rediger" onPress={() => setMode('rediger')} primary={mode === 'rediger'} />
                  <HrButton colors={colors} label="Les" onPress={() => setMode('les')} primary={mode === 'les'} />
                </>
              ) : null}
              <HrButton
                colors={colors}
                icon="print-outline"
                label="PDF"
                onPress={() => printHandbook(
                  mode === 'rediger' || !published
                    ? { title: handbook.title, chapters: handbook.chapters, version: 0, revisions: handbook.revisions }
                    : { title: handbook.title, chapters: published.chapters, version: published.version, at: published.at, revisions: handbook.revisions },
                  { company, logo },
                )}
              />
            </View>
          )}
        />
        {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}
        {published ? (
          <Text style={{ color: colors.muted }}>
            Lesebekreftelser: {done} av {status.length} ansatte har bekreftet versjon {published.version}.
          </Text>
        ) : null}
      </HrCard>

      {mode === 'les' ? (
        <HrCard colors={colors}>
          <HandbookReader colors={colors} handbook={readerBook} company={company} ack={myAck} onAck={actor?.uid ? confirmRead : null} busy={busy} />
        </HrCard>
      ) : null}

      {mode === 'rediger' && canWrite ? (
        <>
          {!handbook.chapters.length ? (
            <HrCard colors={colors}>
              <HrSectionTitle colors={colors} title="Kom i gang" subtitle="Start fra standardhåndboken, eller les inn den dere har i Word." />
              <View style={styles.row}>
                <HrButton colors={colors} primary icon="book-outline" label="Bruk standard personalhåndbok" onPress={() => applyChapters(standardHandbookChapters(), 'Standardhåndboken er lagt inn. Bekreft de gule feltene og publiser.')} />
                <HrButton colors={colors} icon="document-text-outline" label="Les inn fra Word" onPress={importFile} />
                <HrButton colors={colors} icon="clipboard-outline" label="Lim inn tekst" onPress={() => setPasteOpen(true)} />
              </View>
            </HrCard>
          ) : null}

          {confirmReplace ? (
            <HrCard colors={colors}>
              <Text style={{ color: colors.ink }}>
                Fant {confirmReplace.chapters.length} kapitler i {confirmReplace.source}. Skal de erstatte utkastet, eller legges til bakerst?
              </Text>
              <View style={styles.row}>
                <HrButton colors={colors} primary label="Erstatt utkastet" onPress={() => applyChapters(confirmReplace.chapters, 'Utkastet er erstattet. Publiserte versjoner står urørt.')} />
                <HrButton colors={colors} label="Legg til bakerst" onPress={() => applyChapters([...handbook.chapters, ...confirmReplace.chapters.map((row, i) => ({ ...row, id: `${row.id}_${Date.now().toString(36)}${i}` }))], 'Kapitlene er lagt til bakerst.')} />
                <HrButton colors={colors} label="Avbryt" onPress={() => setConfirmReplace(null)} />
              </View>
            </HrCard>
          ) : null}

          {pasteOpen ? (
            <HrCard colors={colors}>
              <HrSectionTitle colors={colors} title="Lim inn tekst" subtitle="«1 Tittel» blir kapittel, «1.2 Tittel» blir underoverskrift." />
              <TextInput
                value={paste}
                onChangeText={setPaste}
                multiline
                placeholder="Lim inn hele håndboken her"
                placeholderTextColor={colors.placeholder}
                style={[styles.paste, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
              <View style={styles.row}>
                <HrButton colors={colors} primary label="Del i kapitler" onPress={() => { offerChapters(chaptersFromText(paste), 'teksten'); setPaste(''); setPasteOpen(false); }} />
                <HrButton colors={colors} label="Avbryt" onPress={() => setPasteOpen(false)} />
              </View>
            </HrCard>
          ) : null}

          {handbook.chapters.length ? (
            <View style={styles.editor}>
              <HrCard colors={colors} style={styles.toc}>
                <HrSectionTitle colors={colors} title="Kapitler" subtitle={open.length ? `${open.length} gule felt å bekrefte` : 'Alle felt er bekreftet'} />
                {handbook.chapters.map((row, index) => {
                  const marks = open.filter((item) => item.chapterId === row.id).length;
                  return (
                    <TouchableOpacity
                      key={row.id}
                      onPress={() => setSelected(row.id)}
                      accessibilityRole="button"
                      style={[styles.tocRow, { backgroundColor: row.id === selected ? `${colors.brand}18` : 'transparent' }]}
                    >
                      <Text style={{ color: row.id === selected ? colors.brand : colors.ink, flex: 1 }} numberOfLines={2}>{index + 1}. {row.title}</Text>
                      {marks ? <Text style={[styles.badge, { backgroundColor: FOCUS_FIELD_BG, color: FOCUS_FIELD_INK }]}>{marks}</Text> : null}
                    </TouchableOpacity>
                  );
                })}
                <View style={styles.row}>
                  <HrButton colors={colors} icon="add" label="Nytt kapittel" onPress={() => { const res = addChapter(flushEdit(), { after: selected }); save(res.handbook); setSelected(res.chapter.id); }} />
                  <HrButton colors={colors} icon="document-text-outline" label="Les inn fra Word" onPress={importFile} />
                  <HrButton colors={colors} icon="clipboard-outline" label="Lim inn" onPress={() => setPasteOpen(true)} />
                </View>
              </HrCard>

              {chapter ? (
                <HrCard colors={colors} style={styles.work}>
                  <View style={styles.row}>
                    <TextInput
                      value={edit?.title ?? chapter.title}
                      onChangeText={(title) => editChapter({ title })}
                      placeholder="Kapittelnavn"
                      placeholderTextColor={colors.placeholder}
                      style={[styles.titleInput, { color: colors.ink, borderBottomColor: colors.line }]}
                    />
                    <TouchableOpacity onPress={() => save(moveChapter(flushEdit(), chapter.id, -1))} accessibilityRole="button" accessibilityLabel="Flytt kapittel opp"><Ionicons name="arrow-up" size={18} color={colors.muted} /></TouchableOpacity>
                    <TouchableOpacity onPress={() => save(moveChapter(flushEdit(), chapter.id, 1))} accessibilityRole="button" accessibilityLabel="Flytt kapittel ned"><Ionicons name="arrow-down" size={18} color={colors.muted} /></TouchableOpacity>
                    <TouchableOpacity onPress={() => { pendingRef.current = null; save(removeChapter(handbookRef.current, chapter.id)); }} accessibilityRole="button" accessibilityLabel={`Slett kapittel ${chapter.title}`}><Ionicons name="trash-outline" size={18} color={colors.danger} /></TouchableOpacity>
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    «## » gir underoverskrift, «• » gir punkt. Tekst i [[doble klammer]] er gul til dere har bekreftet den: fjern klammene når teksten stemmer. {'{{firma}}'} fylles fra bedriftsprofilen.
                  </Text>
                  <TextInput
                    value={edit?.body ?? chapter.body}
                    onChangeText={(body) => editChapter({ body })}
                    multiline
                    placeholder="Teksten i kapitlet"
                    placeholderTextColor={colors.placeholder}
                    style={[styles.body, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                  />
                  <Text style={[styles.kicker, { color: colors.muted }]}>Slik ser det ut</Text>
                  <View style={[styles.preview, { borderColor: colors.line }]}>
                    <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '600' }}>{edit?.title ?? chapter.title}</Text>
                    <HandbookText body={edit?.body ?? chapter.body} colors={colors} company={company} />
                  </View>
                </HrCard>
              ) : null}
            </View>
          ) : null}

          {handbook.chapters.length ? (
            <HrCard colors={colors}>
              <HrSectionTitle colors={colors} title="Publiser" subtitle={changed ? 'Utkastet har endringer som ikke er publisert.' : 'Ingen endringer siden forrige versjon.'} />
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Grunn til revidering, for eksempel «Ferie og arbeidstid»"
                placeholderTextColor={colors.placeholder}
                style={[styles.reason, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
              <HrButton colors={colors} primary icon="cloud-upload-outline" label={`Publiser versjon ${(published?.version || 0) + 1}`} onPress={publish} disabled={!changed} />
            </HrCard>
          ) : null}
        </>
      ) : null}

      {published && canWrite ? (
        <HrCard colors={colors}>
          <HrSectionTitle colors={colors} title="Lesebekreftelser" subtitle={`Versjon ${published.version} · ${done} av ${status.length} har bekreftet`} />
          {status.map((row) => (
            <View key={row.employeeId} style={[styles.ackRow, { borderBottomColor: colors.line }]}>
              <Ionicons name={row.current ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={row.current ? '#1d7a3e' : FOCUS_FIELD_BORDER} />
              <Text style={{ color: colors.ink, flex: 1 }}>{row.name}</Text>
              <Text style={{ color: row.current ? colors.muted : FOCUS_FIELD_INK, fontSize: 13 }}>
                {row.current ? `Bekreftet ${dateText(row.latest.at)}` : (row.latest ? `Har bekreftet versjon ${row.latest.version}` : 'Mangler')}
              </Text>
            </View>
          ))}
          {!status.length ? <Text style={{ color: colors.muted }}>Ingen aktive ansatte i Ansatte.</Text> : null}
          <Text style={{ color: colors.muted, fontSize: 12 }}>Ansatte bekrefter på sin egen side under Ansatte, eller her under «Les».</Text>
        </HrCard>
      ) : null}

      {handbook.revisions.length ? (
        <HrCard colors={colors}>
          <HrSectionTitle colors={colors} title="Revisjonslogg" />
          {handbook.revisions.slice().reverse().map((row) => (
            <View key={row.version} style={[styles.ackRow, { borderBottomColor: colors.line }]}>
              <Text style={{ color: colors.ink, width: 34, fontWeight: '600' }}>{row.version}</Text>
              <Text style={{ color: colors.ink, flex: 1 }}>{row.reason}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{dateText(row.at)}{row.by ? ` · ${row.by}` : ''}</Text>
            </View>
          ))}
        </HrCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  editor: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  toc: { flexGrow: 1, flexBasis: 260, maxWidth: 420, gap: 4 },
  tocRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 7 },
  badge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, fontSize: 12, fontWeight: '700', overflow: 'hidden' },
  work: { flexGrow: 3, flexBasis: 420, minWidth: 0, gap: 8 },
  titleInput: { flex: 1, minWidth: 160, fontSize: 18, fontWeight: '600', borderBottomWidth: 1, paddingVertical: 4 },
  body: { minHeight: 260, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, lineHeight: 20, textAlignVertical: 'top' },
  preview: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8 },
  kicker: { fontSize: 11, fontWeight: '600', letterSpacing: 0.4, textTransform: 'uppercase' },
  paste: { minHeight: 200, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 14, textAlignVertical: 'top' },
  reason: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  readRow: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  readHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10 },
  readBody: { paddingHorizontal: 14, paddingBottom: 14 },
  ackBox: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  ackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
});
