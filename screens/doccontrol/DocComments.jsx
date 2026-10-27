/**
 * Merknader til et dokument. Marker tekst og skriv en merknad. Den er bare synlig
 * for den som skrev den, dokumentets eier og godkjenner, godkjennere og utpekte lesere
 * i innstillingene, og administrator (se firestore.rules).
 */
import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COMMENT_STATUSES, newComment, resolveComment } from '../../src/doccontrol/model';
import { showSaveToast } from '../../src/ui/saveToast';
import { HrButton, HrCard, HrSectionTitle } from '../hr/HrShared';
import { COMMENT_BG, COMMENT_INK } from '../hr/HandbookText';
import { ChoiceChips, Label, OK_INK, dateText } from './parts';

// Fast nederst i vinduet. Bare på nett, der position: fixed finnes.
const FLOATING = Platform.OS === 'web'
  ? { position: 'fixed', left: 16, right: 16, bottom: 16, maxWidth: 560, marginHorizontal: 'auto', zIndex: 50, boxShadow: '0 6px 24px rgba(0,0,0,0.18)' }
  : null;

// Valget «Hele dokumentet» i velgeren. Merknaden lagres med tomt anker.
const WHOLE_DOC = '__dokument__';

const VISIBLE_TO = 'Merknaden ser bare du, dokumentets eier og godkjenner, og dem som er satt til å lese merknader.';

/** Egenskaper som gjør en blokk til et anker for merknader (data-doc-anchor på nett). */
export function anchorProps(id, label) {
  return Platform.OS === 'web' ? { dataSet: { docAnchor: id, docLabel: label } } : {};
}

/**
 * Husk siste markerte tekst inne i et anker. Brukes til «Merknad til markert tekst».
 * Lytter på mouseup/keyup/touchend, siden markeringen ofte forsvinner når man trykker på en knapp.
 */
export function useSelectionCapture(enabled) {
  const [picked, setPicked] = useState(null);
  useEffect(() => {
    if (!enabled || Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const read = () => {
      const selection = typeof window !== 'undefined' ? window.getSelection?.() : null;
      const quote = String(selection?.toString() || '').replace(/\s+\n/g, '\n').trim();
      if (!quote) return;
      const node = selection.anchorNode?.nodeType === 1 ? selection.anchorNode : selection.anchorNode?.parentElement;
      const anchor = node?.closest?.('[data-doc-anchor]');
      if (!anchor) return;
      setPicked({ anchorId: anchor.getAttribute('data-doc-anchor') || '', anchorLabel: anchor.getAttribute('data-doc-label') || '', quote: quote.slice(0, 600) });
    };
    document.addEventListener('mouseup', read);
    document.addEventListener('keyup', read);
    document.addEventListener('touchend', read);
    return () => {
      document.removeEventListener('mouseup', read);
      document.removeEventListener('keyup', read);
      document.removeEventListener('touchend', read);
    };
  }, [enabled]);
  return [picked, setPicked];
}

/** Sitatene som skal merkes i en blokk. */
export function quotesFor(comments, anchorId) {
  return (comments || []).filter((row) => row.anchorId === anchorId && row.quote && row.status === 'apen').map((row) => row.quote);
}

/**
 * Skriv en merknad. Står fast nederst i vinduet på nett, så den er der når teksten er markert.
 * draft: { anchorId, anchorLabel, quote }
 */
export function CommentComposer({ colors, dc, control, draft, onClose }) {
  const [note, setNote] = useState('');
  const [quote, setQuote] = useState(draft?.quote || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setQuote(draft?.quote || ''); }, [draft?.quote, draft?.anchorId]);

  if (!draft || !control) return null;

  async function save() {
    const comment = newComment({ control, anchorId: draft.anchorId, anchorLabel: draft.anchorLabel, quote, note }, { actor: dc.actor });
    if (!comment) {
      setError('Skriv merknaden først.');
      return;
    }
    setBusy(true);
    const res = await dc.addComment(comment, control);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    showSaveToast('Merknaden er lagret.');
    setNote('');
    onClose?.();
  }

  const web = Platform.OS === 'web';
  return (
    <View style={[styles.composer, web && FLOATING, { backgroundColor: colors.card, borderColor: '#6b9be0' }]}>
      <View style={styles.row}>
        <Ionicons name="chatbox-ellipses-outline" size={18} color={COMMENT_INK} />
        <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>
          {`Merknad${draft.anchorLabel ? ` til ${draft.anchorLabel}` : ''}`}
        </Text>
      </View>
      <TextInput
        value={quote}
        onChangeText={setQuote}
        multiline
        placeholder="Sitat fra teksten (valgfritt)"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: COMMENT_INK, backgroundColor: COMMENT_BG, borderColor: '#b9cff3', minHeight: 40 }]}
      />
      <TextInput
        value={note}
        onChangeText={setNote}
        multiline
        autoFocus={web}
        placeholder="Hva bør endres eller vurderes?"
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg, minHeight: 64 }]}
      />
      <Text style={{ color: colors.muted, fontSize: 12 }}>{VISIBLE_TO}</Text>
      {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
      <View style={styles.row}>
        <HrButton colors={colors} primary icon="checkmark" label={busy ? 'Lagrer …' : 'Lagre merknad'} onPress={save} disabled={busy || !note.trim()} />
        <HrButton colors={colors} label="Avbryt" onPress={onClose} />
      </View>
    </View>
  );
}

/** Liten stripe som dukker opp når tekst er markert i dokumentet. */
export function SelectionBar({ colors, picked, onComment, onClear }) {
  if (!picked) return null;
  return (
    <View style={[styles.bar, FLOATING, { backgroundColor: COMMENT_BG, borderColor: '#6b9be0' }]}>
      <Text style={{ color: COMMENT_INK, flex: 1 }} numberOfLines={2}>{`«${picked.quote}»`}</Text>
      <HrButton colors={colors} primary icon="chatbox-ellipses-outline" label="Merknad" onPress={onComment} />
      <HrButton colors={colors} label="Lukk" onPress={onClear} />
    </View>
  );
}

function CommentRow({ colors, dc, control, comment, canResolve }) {
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState(comment.resolution || '');
  const [busy, setBusy] = useState(false);
  const status = COMMENT_STATUSES.find((row) => row.id === comment.status);

  async function resolve(next) {
    setBusy(true);
    const res = await dc.updateComment(resolveComment(comment, { status: next, resolution, actor: dc.actor, control }));
    setBusy(false);
    if (res.ok) {
      setOpen(false);
      showSaveToast(next === 'apen' ? 'Merknaden er åpnet igjen.' : 'Merknaden er behandlet.');
    }
  }

  return (
    <View style={[styles.comment, { borderColor: colors.line }]}>
      <View style={styles.row}>
        <Ionicons name={comment.status === 'apen' ? 'chatbox-ellipses-outline' : 'checkmark-circle'} size={16} color={comment.status === 'apen' ? COMMENT_INK : OK_INK} />
        <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>
          {comment.anchorLabel || 'Hele dokumentet'}
        </Text>
        <Text style={{ color: comment.status === 'apen' ? COMMENT_INK : colors.muted, fontSize: 12 }}>{status?.label}</Text>
      </View>
      {comment.quote ? <Text style={[styles.quote, { color: COMMENT_INK, backgroundColor: COMMENT_BG }]}>{`«${comment.quote}»`}</Text> : null}
      <Text style={{ color: colors.ink }}>{comment.note}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {`${comment.authorName || 'Ukjent'} · ${dateText(comment.createdAt)}${comment.revision ? ` · til versjon ${comment.revision}` : ''}`}
      </Text>
      {comment.status !== 'apen' ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {`${status?.label}${comment.resolvedInRevision ? ` i rev. ${comment.resolvedInRevision}` : ''} · ${comment.resolvedBy} ${dateText(comment.resolvedAt)}${comment.resolution ? `: ${comment.resolution}` : ''}`}
        </Text>
      ) : null}
      {canResolve ? (
        open ? (
          <View style={{ gap: 6 }}>
            <TextInput
              value={resolution}
              onChangeText={setResolution}
              placeholder="Kort svar, for eksempel hva som er endret"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <View style={styles.row}>
              <HrButton colors={colors} primary label="Tatt inn i revisjon" onPress={() => resolve('tatt_inn')} disabled={busy} />
              <HrButton colors={colors} label="Ikke tatt inn" onPress={() => resolve('avvist')} disabled={busy} />
              <HrButton colors={colors} label="Avbryt" onPress={() => setOpen(false)} />
            </View>
          </View>
        ) : (
          <View style={styles.row}>
            {comment.status === 'apen'
              ? <HrButton colors={colors} icon="checkmark-done-outline" label="Behandle" onPress={() => setOpen(true)} />
              : <HrButton colors={colors} label="Åpne igjen" onPress={() => resolve('apen')} disabled={busy} />}
          </View>
        )
      ) : null}
    </View>
  );
}

/** Kan personen behandle merknader til dokumentet? */
export function canResolveComments(dc, control) {
  const uid = dc.actor?.uid;
  return !!uid && (dc.allComments || control?.owner?.uid === uid || control?.approver?.uid === uid);
}

/**
 * Merknadene til et dokument, med mulighet til å skrive nye.
 * anchors: blokkene merknaden kan knyttes til (kapitler eller seksjoner).
 */
export default function DocComments({ colors, dc, control, anchors = [], onCompose = null, title = 'Merknader' }) {
  const [filter, setFilter] = useState('apen');
  const [composing, setComposing] = useState(null);
  if (!control) return null;
  const rows = dc.comments.filter((row) => row.docKey === control.id);
  const open = rows.filter((row) => row.status === 'apen');
  const shown = filter === 'apen' ? open : rows;
  const canResolve = canResolveComments(dc, control);
  if (!rows.length && !dc.canComment) return null;
  const compose = (draft) => (onCompose ? onCompose(draft) : setComposing(draft));

  return (
    <HrCard colors={colors}>
      <HrSectionTitle
        colors={colors}
        title={title}
        subtitle={rows.length ? `${open.length} åpne av ${rows.length}` : 'Ingen merknader ennå'}
        right={dc.canComment ? <HrButton colors={colors} icon="add" label="Ny merknad" onPress={() => compose({ anchorId: '', anchorLabel: '', quote: '' })} /> : null}
      />
      {dc.canComment ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          {`${Platform.OS === 'web' ? 'Marker tekst i dokumentet og trykk «Merknad». ' : ''}${VISIBLE_TO}`}
        </Text>
      ) : null}
      {composing && !onCompose ? (
        <>
          {anchors.length ? (
            <>
              <Label colors={colors}>Gjelder</Label>
              <ChoiceChips
                colors={colors}
                options={[{ id: WHOLE_DOC, label: 'Hele dokumentet' }, ...anchors]}
                value={composing.anchorId || WHOLE_DOC}
                onChange={(picked) => {
                  const anchorId = picked === WHOLE_DOC ? '' : picked;
                  setComposing({ ...composing, anchorId, anchorLabel: anchors.find((row) => row.id === anchorId)?.label || '' });
                }}
                title="Gjelder"
              />
            </>
          ) : null}
          <CommentComposer colors={colors} dc={dc} control={control} draft={composing} onClose={() => setComposing(null)} />
        </>
      ) : null}
      {rows.length ? (
        <ChoiceChips colors={colors} options={[{ id: 'apen', label: `Åpne (${open.length})` }, { id: 'alle', label: `Alle (${rows.length})` }]} value={filter} onChange={setFilter} title="Vis merknader" />
      ) : null}
      {shown.map((row) => (
        <CommentRow key={row.id} colors={colors} dc={dc} control={control} comment={row} canResolve={canResolve} />
      ))}
      {rows.length && !shown.length ? <Text style={{ color: colors.muted }}>Ingen åpne merknader.</Text> : null}
    </HrCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15, textAlignVertical: 'top' },
  composer: { borderWidth: 2, borderRadius: 14, padding: 12, gap: 8 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 8 },
  comment: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 4 },
  quote: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, fontStyle: 'italic' },
});
