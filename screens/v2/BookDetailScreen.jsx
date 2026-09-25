import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ConfirmDialog, { InfoDialog } from '../../components/ConfirmDialog';
import CompactBackLink from '../../components/CompactBackLink';
import ShellHeader from '../../components/ShellHeader';
import StarRating from '../../components/StarRating';
import { Screen, ScrollBody } from '../../components/ui';
import { colors } from '../../src/theme';
import HelpTarget from '../../components/HelpTarget';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import {
  updateBook, deleteBook, BOOK_STATUS, BOOK_OWNER, STATUS_LABELS, progressPct,
  progressPatchForPages, finishedPatchForBook, reopenReadingPatch, effectiveBookStatus,
} from '../../src/utils/books';

function SectionHeader({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

export default function BookDetailScreen() {
  const navigation = useNavigation();
  useHelpScene('inner', { onRetreat: () => navigation.goBack() });
  const route = useRoute();
  const {
    familyId, childId, bookId, book: initial,
    childName, ownerName, ownerKind: rawOwnerKind, ownerId: rawOwnerId,
  } = route.params || {};
  const ownerKind = rawOwnerKind || BOOK_OWNER.child;
  const ownerId = rawOwnerId || childId;
  const displayName = ownerName || childName || 'Bokhylla';

  const [book, setBook] = useState(initial || {});
  const [pagesRead, setPagesRead] = useState(String(initial?.pagesRead ?? 0));
  const [reviewRating, setReviewRating] = useState(initial?.reviewRating ?? 0);
  const [reviewText, setReviewText] = useState(initial?.reviewText ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });
  const [saving, setSaving] = useState(false);

  const displayStatus = effectiveBookStatus({
    ...book,
    pagesRead: Number(pagesRead) || 0,
  });
  const isFinished = displayStatus === BOOK_STATUS.finished;
  const pct = progressPct({ ...book, pagesRead: Number(pagesRead) || 0 });

  const saveProgress = useCallback(async (patch) => {
    setSaving(true);
    try {
      await updateBook(familyId, ownerKind, ownerId, bookId, patch);
      setBook((b) => ({ ...b, ...patch }));
      if (patch.pagesRead != null) setPagesRead(String(patch.pagesRead));
    } catch (e) {
      setInfo({ visible: true, title: 'Feil', message: e?.message || 'Klarte ikke lagre.' });
    } finally {
      setSaving(false);
    }
  }, [familyId, ownerKind, ownerId, bookId]);

  const savePages = useCallback(async () => {
    const patch = progressPatchForPages(book, pagesRead);
    await saveProgress(patch);
    const nextStatus = patch.status || book.status;
    if (patch.status === BOOK_STATUS.reading && book.status === BOOK_STATUS.finished) {
      setInfo({
        visible: true,
        title: 'Oppdatert',
        message: Number(patch.pagesRead) <= 0
          ? 'Boken er satt tilbake til ulest (0 sider).'
          : 'Boken er ikke lenger markert som ferdig lest.',
      });
      return;
    }
    setInfo({
      visible: true,
      title: 'Lagret',
      message: nextStatus === BOOK_STATUS.finished
        ? 'Fremgang lagret.'
        : `Sidetall lagret${Number(patch.pagesRead) <= 0 ? ' — boken er ulest' : ''}.`,
    });
  }, [book, pagesRead, saveProgress]);

  const saveReview = useCallback(async () => {
    await saveProgress({ reviewRating, reviewText });
    setInfo({ visible: true, title: 'Lagret', message: 'Anmeldelsen er oppdatert.' });
  }, [saveProgress, reviewRating, reviewText]);

  const markFinished = useCallback(async () => {
    const patch = finishedPatchForBook(book, pagesRead);
    await saveProgress(patch);
    setInfo({ visible: true, title: 'Gratulerer!', message: 'Boken er registrert som ferdig lest.' });
  }, [book, pagesRead, saveProgress]);

  const markReadingAgain = useCallback(async () => {
    const patch = reopenReadingPatch(book, pagesRead);
    await saveProgress(patch);
    setInfo({
      visible: true,
      title: 'Oppdatert',
      message: 'Boken er satt tilbake til «Leser nå».',
    });
  }, [book, pagesRead, saveProgress]);

  const doDelete = useCallback(async () => {
    setConfirmDelete(false);
    try {
      await deleteBook(familyId, ownerKind, ownerId, bookId);
      navigation.goBack();
    } catch (e) {
      setInfo({ visible: true, title: 'Feil', message: e?.message || 'Klarte ikke slette.' });
    }
  }, [familyId, ownerKind, ownerId, bookId, navigation]);

  const goHome = useCallback(() => {
    if (navigation.canGoBack?.()) navigation.goBack();
    else navigation.navigate('Home');
  }, [navigation]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <Screen>
        <ShellHeader title={book.title || 'Bok'} onMenuPress={goHome} onLogoHome={goHome} />
        <ScrollBody pad={16}>
          <CompactBackLink onPress={() => navigation.goBack()} label="Bokhylla" />
          <Text style={styles.screenSub}>{displayName}</Text>

          <View style={styles.heroCard}>
          {book.coverUrl ? (
            <Image source={{ uri: book.coverUrl }} style={styles.cover} />
          ) : (
            <View style={[styles.cover, styles.coverPh]}>
              <Ionicons name="book-outline" size={36} color={colors.brand} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{book.title || 'Bok'}</Text>
            {!!book.author && <Text style={styles.author}>{book.author}</Text>}
            {!!book.isbn && <Text style={styles.isbn}>ISBN {book.isbn}</Text>}
            <View style={[styles.statusPill, isFinished && styles.statusPillDone]}>
              <Text style={[styles.statusTxt, isFinished && styles.statusTxtDone]}>
                {STATUS_LABELS[displayStatus] || displayStatus}
              </Text>
            </View>
          </View>
        </View>

        <SectionHeader title="Leseframgang" />
        <View style={styles.card}>
          {Number.isFinite(pct) && (
            <View style={styles.progressBox}>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${pct}%` }]} />
              </View>
              <Text style={styles.progressLbl}>{pct}% lest</Text>
            </View>
          )}

          <Text style={styles.lbl}>Sider lest</Text>
          <HelpTarget id="input">
          <View style={styles.progressActions}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={pagesRead}
              onChangeText={setPagesRead}
              keyboardType="number-pad"
              placeholderTextColor={colors.muted}
            />
            <TouchableOpacity
              style={styles.smallBtn}
              disabled={saving}
              onPress={savePages}
            >
              {saving ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.smallBtnTxt}>Lagre</Text>
              )}
            </TouchableOpacity>
          </View>
          </HelpTarget>

          {book.totalPages ? (
            <View style={styles.quickRow}>
              {[10, 25, 50].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={styles.quickBtn}
                  disabled={saving}
                  onPress={() => {
                    const next = Math.min(book.totalPages, (Number(pagesRead) || 0) + n);
                    setPagesRead(String(next));
                    saveProgress(progressPatchForPages(book, next));
                  }}
                >
                  <Text style={styles.quickBtnTxt}>+{n} sider</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}

          <Text style={styles.finishHint}>
            Bruk knappen under når boken er ferdig — ikke bare sidetall.
          </Text>

          {!isFinished ? (
            <TouchableOpacity
              style={styles.finishBtn}
              disabled={saving}
              onPress={markFinished}
              accessibilityRole="button"
              accessibilityLabel="Registrer at boken er ferdiglest"
            >
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.finishBtnTxt}>Registrer ferdiglest</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.reopenBtn}
              disabled={saving}
              onPress={markReadingAgain}
              accessibilityRole="button"
              accessibilityLabel="Sett boken tilbake til under lesing"
            >
              <Ionicons name="book-outline" size={20} color={colors.brand} />
              <Text style={styles.reopenBtnTxt}>Ikke ferdig — fortsett lesing</Text>
            </TouchableOpacity>
          )}
        </View>

        <SectionHeader title="Anmeldelse" />
        <View style={styles.card}>
          <Text style={styles.hint}>Gi boka stjerner og skriv hva du synes.</Text>
          <StarRating value={reviewRating} onChange={setReviewRating} />
          <TextInput
            style={[styles.input, styles.reviewInput]}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder="Skriv anmeldelse…"
            placeholderTextColor={colors.muted}
            multiline
          />
          <TouchableOpacity style={styles.reviewBtn} disabled={saving} onPress={saveReview}>
            <Text style={styles.reviewBtnTxt}>Lagre anmeldelse</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.deleteBtn} onPress={() => setConfirmDelete(true)}>
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.deleteBtnTxt}>Slett bok</Text>
        </TouchableOpacity>
      </ScrollBody>

      <ConfirmDialog
        visible={confirmDelete}
        title="Slette boken?"
        message="Dette kan ikke angres."
        confirmText="Slett"
        cancelText="Avbryt"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        onClose={() => setConfirmDelete(false)}
      />
      <InfoDialog
        visible={info.visible}
        title={info.title}
        message={info.message}
        onClose={() => setInfo({ visible: false, title: '', message: '' })}
      />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screenSub: { fontSize: 13, fontWeight: '400', color: colors.muted, marginBottom: 4 },
  sectionTitle: {
    fontSize: 13, fontWeight: '400', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 12, marginBottom: 8, marginLeft: 4,
  },
  heroCard: {
    flexDirection: 'row', gap: 14, backgroundColor: colors.card,
    borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 14,
  },
  cover: { width: 84, height: 118, borderRadius: 10, backgroundColor: '#e2e8f0' },
  coverPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eef6ff' },
  title: { fontWeight: '400', fontSize: 20, color: colors.ink },
  author: { color: colors.muted, fontWeight: '400', marginTop: 4 },
  isbn: { color: colors.muted, fontSize: 12, marginTop: 4 },
  statusPill: {
    alignSelf: 'flex-start', marginTop: 10,
    backgroundColor: colors.brandSoft, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  statusPillDone: { backgroundColor: '#dcfce7' },
  statusTxt: { color: colors.brand, fontWeight: '400', fontSize: 12 },
  statusTxtDone: { color: '#15803d' },
  card: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1,
    borderColor: colors.line, padding: 14,
  },
  progressBox: { marginBottom: 12 },
  progressTrack: { height: 8, backgroundColor: colors.bg, borderRadius: 4, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: colors.brand },
  progressLbl: { fontWeight: '400', color: colors.muted, marginTop: 6, fontSize: 13 },
  lbl: { fontWeight: '400', color: colors.ink, fontSize: 13, marginBottom: 6 },
  hint: { color: colors.muted, fontWeight: '400', fontSize: 13, marginBottom: 8 },
  finishHint: {
    color: colors.muted, fontWeight: '400', fontSize: 12, marginTop: 14, marginBottom: 8,
  },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 16, fontWeight: '400', color: colors.ink,
  },
  progressActions: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  smallBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 16,
    paddingVertical: 12, minWidth: 72, alignItems: 'center',
  },
  smallBtnTxt: { color: '#fff', fontWeight: '400' },
  quickRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  quickBtn: {
    flex: 1, backgroundColor: '#eef6ff', borderRadius: 12, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: colors.brandSoft,
  },
  quickBtnTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  finishBtn: {
    alignSelf: 'flex-start',
    marginTop: 4, backgroundColor: colors.success || '#16a34a', borderRadius: 14,
    paddingVertical: 16, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: 8,
  },
  finishBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
  reopenBtn: {
    alignSelf: 'flex-start',
    marginTop: 4, backgroundColor: '#eef6ff', borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', flexDirection: 'row',
    justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.brandSoft,
  },
  reopenBtnTxt: { color: colors.brand, fontWeight: '400', fontSize: 15 },
  reviewInput: { minHeight: 90, textAlignVertical: 'top', marginTop: 10 },
  reviewBtn: {
    alignSelf: 'flex-start',
    marginTop: 12, backgroundColor: colors.brand, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  reviewBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  deleteBtn: {
    alignSelf: 'flex-start',
    marginTop: 8, alignItems: 'center', paddingVertical: 12,
    flexDirection: 'row', justifyContent: 'center', gap: 6,
  },
  deleteBtnTxt: { color: colors.danger, fontWeight: '400' },
});
