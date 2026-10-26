import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  addChapter,
  chaptersFromText,
  moveChapter,
  normalizeHandbook,
  openPlaceholders,
  removeChapter,
  setChapter,
  standardHandbookChapters,
} from '../../src/hr/handbook';
import {
  ackFor,
  controlStatus,
  docHeader,
  ensureWorkingRevision,
  latestAck,
  newControl,
  revisionLog,
  workingRevision,
} from '../../src/doccontrol/model';
import { handbookFromControl, handbookHash, handbookSnapshot } from '../../src/doccontrol/content';
import { HANDBOOK_CODE } from '../../src/doccontrol/templates';
import { textFromDocx } from '../../src/employees/cvImport';
import { FOCUS_FIELD_BG, FOCUS_FIELD_BORDER, FOCUS_FIELD_INK } from '../../src/forms/highlight';
import { pickDocument } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';
import { HrButton, HrCard, HrSectionTitle } from './HrShared';
import HandbookText, { COMMENT_BG, COMMENT_INK } from './HandbookText';
import { printHandbook } from './handbookPrint';
import { useDocControl } from '../doccontrol/useDocControl';
import DocControlPanel from '../doccontrol/DocControlPanel';
import DocComments, { CommentComposer, SelectionBar, anchorProps, quotesFor, useSelectionCapture } from '../doccontrol/DocComments';
import { StatusChip } from '../doccontrol/parts';

export const HANDBOOK_KEY = 'handbook';

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

/**
 * Lesevisning av gjeldende godkjente versjon, med bekreftelse og merknader.
 * Brukes av HR og av den ansatte selv på Min side.
 * book: { title, chapters, version, at } fra dokumentstyringen. ack: siste bekreftelse { revision, at }.
 */
export function HandbookReader({
  colors, book, company, ack, onAck, busy = false, comments = [], onComment = null,
}) {
  const [open, setOpen] = useState('');
  const chapters = book?.chapters || [];
  if (!book?.version) {
    return <Text style={{ color: colors.muted }}>Personalhåndboken er ikke godkjent ennå.</Text>;
  }
  const current = ack && ack.revision >= book.version;
  return (
    <View style={{ gap: 10 }}>
      <Text style={{ color: colors.muted }}>{`Versjon ${book.version} · godkjent ${dateText(book.at)}`}</Text>
      {chapters.map((chapter, index) => {
        const count = comments.filter((row) => row.anchorId === chapter.id && row.status === 'apen').length;
        return (
          <View key={chapter.id} style={[styles.readRow, { borderColor: colors.line }]} {...anchorProps(chapter.id, chapter.title)}>
            <View style={styles.readHead}>
              <TouchableOpacity onPress={() => setOpen(open === chapter.id ? '' : chapter.id)} accessibilityRole="button" style={styles.readToggle}>
                <Ionicons name={open === chapter.id ? 'chevron-down' : 'chevron-forward'} size={16} color={colors.muted} />
                <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>{`${index + 1}. ${chapter.title}`}</Text>
              </TouchableOpacity>
              {count ? <Text style={[styles.badge, { backgroundColor: COMMENT_BG, color: COMMENT_INK }]}>{count}</Text> : null}
              {onComment ? (
                <TouchableOpacity onPress={() => onComment({ anchorId: chapter.id, anchorLabel: chapter.title, quote: '' })} accessibilityRole="button" accessibilityLabel={`Merknad til ${chapter.title}`}>
                  <Ionicons name="chatbox-ellipses-outline" size={18} color={COMMENT_INK} />
                </TouchableOpacity>
              ) : null}
            </View>
            {open === chapter.id ? (
              <View style={styles.readBody}>
                <HandbookText body={chapter.body} colors={colors} company={company} marks={quotesFor(comments, chapter.id)} />
              </View>
            ) : null}
          </View>
        );
      })}
      {onAck ? (
        current ? (
          <Text style={{ color: '#1d7a3e', fontWeight: '600' }}>{`Du bekreftet versjon ${ack.revision} ${dateText(ack.at)}.`}</Text>
        ) : (
          <View style={[styles.ackBox, { backgroundColor: FOCUS_FIELD_BG, borderColor: FOCUS_FIELD_BORDER }]}>
            <Text style={{ color: FOCUS_FIELD_INK }}>
              {ack ? `Du har bekreftet versjon ${ack.revision}. Les endringene og bekreft versjon ${book.version}.` : 'Les håndboken og bekreft at du har lest og forstått den.'}
            </Text>
            <HrButton colors={colors} primary icon="checkmark-done" label={busy ? 'Lagrer …' : `Jeg har lest og forstått versjon ${book.version}`} onPress={onAck} disabled={busy} />
          </View>
        )
      ) : null}
    </View>
  );
}

export default function HrHandbook({ colors, hr, canWrite, onPatch, employees, actor, company, logo }) {
  const handbook = useMemo(() => normalizeHandbook(hr?.handbook), [hr?.handbook]);
  const dc = useDocControl();
  const control = dc.controlFor(HANDBOOK_KEY);
  const [selected, setSelected] = useState(handbook.chapters[0]?.id || '');
  const [mode, setMode] = useState(canWrite ? 'rediger' : 'les');
  const [composing, setComposing] = useState(null);
  const [picked, setPicked] = useSelectionCapture(dc.canComment && !!control);
  const [note, setNote] = useState('');
  const [noteBad, setNoteBad] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(null);
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState(null);
  const handbookRef = useRef(handbook);
  const onPatchRef = useRef(onPatch);
  const controlRef = useRef(control);
  const creatingRef = useRef(false);
  const pendingRef = useRef(null);
  const timerRef = useRef(null);
  handbookRef.current = handbook;
  onPatchRef.current = onPatch;
  controlRef.current = control;

  // Håndboken styres alltid når den har innhold: første revisjon opprettes av seg selv.
  useEffect(() => {
    if (!dc.ready || control || !canWrite || !handbook.chapters.length || creatingRef.current) return;
    creatingRef.current = true;
    dc.storeControl(newControl({
      kind: 'handbook',
      title: handbook.title,
      code: HANDBOOK_CODE,
      readRule: 'pakrevd',
      reviewIntervalMonths: dc.settings.defaultReviewMonths,
    }, { actor })).finally(() => { creatingRef.current = false; });
  }, [dc.ready, dc.storeControl, dc.settings.defaultReviewMonths, control, canWrite, handbook.chapters.length, handbook.title, actor]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Endret etter godkjenning: start neste revisjon. */
  function track(next) {
    const current = controlRef.current;
    if (!current || workingRevision(current)) return;
    const updated = ensureWorkingRevision(current, handbookHash(next), { actor });
    if (updated !== current) {
      controlRef.current = updated;
      dc.storeControl(updated);
    }
  }

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
    track(next);
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

  const book = handbookFromControl(control);
  const open = openPlaceholders(handbook.chapters);
  const chapter = handbook.chapters.find((row) => row.id === selected) || null;
  const me = (employees || []).find((row) => row.personUid && row.personUid === actor?.uid) || null;
  const myAck = latestAck(dc.acks, HANDBOOK_KEY, { uid: actor?.uid, employeeId: me?.id });
  const comments = dc.comments.filter((row) => row.docKey === HANDBOOK_KEY);
  const status = control ? controlStatus(control) : null;
  const chapterMarks = chapter ? quotesFor(comments, chapter.id) : [];

  function say(text, bad = false) {
    setNote(text);
    setNoteBad(bad);
  }

  function save(next, message = '') {
    onPatch({ handbook: next });
    track(next);
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
    applyChapters(chapters, `${chapters.length} kapitler lest inn fra ${source}. Se over og send til godkjenning.`);
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

  async function confirmRead() {
    if (!book) return;
    setBusy(true);
    const res = await dc.acknowledge(ackFor(HANDBOOK_KEY, book.version, { uid: actor?.uid, employeeId: me?.id || '', name: actor?.name }));
    setBusy(false);
    if (!res.ok) {
      say(res.error, true);
      return;
    }
    showSaveToast('Takk, bekreftelsen er lagret.');
  }

  function print() {
    const draft = mode === 'rediger' || !book;
    printHandbook({
      title: handbook.title,
      chapters: draft ? handbook.chapters : book.chapters,
      header: control ? (draft ? { ...docHeader(control), version: `Utkast ${workingRevision(control)?.revision || 1}`, approvedBy: '', approved: '' } : docHeader(control)) : null,
      log: revisionLog(control),
    }, { company, logo });
  }

  const commentable = dc.canComment && !!control;

  return (
    <View style={styles.page} nativeID="hr-handbook">
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title={handbook.title}
          subtitle={book
            ? `Gjeldende versjon ${book.version}, godkjent ${dateText(book.at)}`
            : 'Ingen godkjent versjon ennå. Ansatte ser håndboken når den er godkjent.'}
          right={(
            <View style={styles.row}>
              {canWrite ? (
                <>
                  <HrButton colors={colors} label="Rediger" onPress={() => setMode('rediger')} primary={mode === 'rediger'} />
                  <HrButton colors={colors} label="Les" onPress={() => setMode('les')} primary={mode === 'les'} />
                </>
              ) : null}
              <HrButton colors={colors} icon="print-outline" label="PDF" onPress={print} />
            </View>
          )}
        />
        {status ? <StatusChip status={status} colors={colors} /> : null}
        {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}
      </HrCard>

      {mode === 'les' ? (
        <HrCard colors={colors}>
          <HandbookReader
            colors={colors}
            book={book}
            company={company}
            ack={myAck}
            onAck={actor?.uid ? confirmRead : null}
            busy={busy}
            comments={comments}
            onComment={commentable ? setComposing : null}
          />
        </HrCard>
      ) : null}

      {mode === 'rediger' && canWrite ? (
        <>
          {!handbook.chapters.length ? (
            <HrCard colors={colors}>
              <HrSectionTitle colors={colors} title="Kom i gang" subtitle="Start fra standardhåndboken, eller les inn den dere har i Word." />
              <View style={styles.row}>
                <HrButton colors={colors} primary icon="book-outline" label="Bruk standard personalhåndbok" onPress={() => applyChapters(standardHandbookChapters(), 'Standardhåndboken er lagt inn. Bekreft de gule feltene og send til godkjenning.')} />
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
                <HrButton colors={colors} primary label="Erstatt utkastet" onPress={() => applyChapters(confirmReplace.chapters, 'Utkastet er erstattet. Godkjente versjoner står urørt.')} />
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
                  <View style={styles.row}>
                    <Text style={[styles.kicker, { color: colors.muted, flex: 1 }]}>Slik ser det ut</Text>
                    {commentable ? (
                      <TouchableOpacity onPress={() => setComposing({ anchorId: chapter.id, anchorLabel: chapter.title, quote: '' })} accessibilityRole="button" style={styles.row}>
                        <Ionicons name="chatbox-ellipses-outline" size={16} color={COMMENT_INK} />
                        <Text style={{ color: COMMENT_INK }}>Merknad til kapitlet</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={[styles.preview, { borderColor: colors.line }]} {...anchorProps(chapter.id, chapter.title)}>
                    <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '600' }}>{edit?.title ?? chapter.title}</Text>
                    <HandbookText body={edit?.body ?? chapter.body} colors={colors} company={company} marks={chapterMarks} />
                  </View>
                </HrCard>
              ) : null}
            </View>
          ) : null}

        </>
      ) : null}

      {control || (canWrite && handbook.chapters.length) ? (
        <DocControlPanel
          colors={colors}
          dc={dc}
          control={control}
          title="Versjon og godkjenning"
          snapshot={handbookSnapshot(handbook)}
          beforeSubmit={async () => handbookSnapshot(flushEdit())}
          blocked={open.length ? `${open.length} gule felt er ikke bekreftet. Første er «${open[0].value}» i «${open[0].chapter}».` : ''}
          canEdit={canWrite}
        />
      ) : null}

      <DocComments
        colors={colors}
        dc={dc}
        control={control}
        anchors={handbook.chapters.map((row) => ({ id: row.id, label: row.title }))}
        onCompose={setComposing}
      />

      {composing ? (
        <CommentComposer colors={colors} dc={dc} control={control} draft={composing} onClose={() => { setComposing(null); setPicked(null); }} />
      ) : (
        <SelectionBar colors={colors} picked={commentable ? picked : null} onComment={() => setComposing(picked)} onClear={() => setPicked(null)} />
      )}
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
  readRow: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  readHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 10 },
  readToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  readBody: { paddingHorizontal: 14, paddingBottom: 14 },
  ackBox: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 8 },
  ackRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth },
});
