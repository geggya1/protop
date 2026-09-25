import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Image, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../firebase';
import { InfoDialog } from '../../components/ConfirmDialog';
import CompactBackLink from '../../components/CompactBackLink';
import ShellHeader from '../../components/ShellHeader';
import { Screen, ScrollBody, BigButton } from '../../components/ui';
import { colors } from '../../src/theme';
import { addBook, lookupIsbn, BOOK_STATUS, BOOK_OWNER, STATUS_LABELS } from '../../src/utils/books';
import { normalizeIsbn } from '../../src/utils/isbn';
import IsbnScannerModal from '../../components/IsbnScannerModal';
import StarRating from '../../components/StarRating';

function SectionHeader({ title }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
}

export default function AddBookScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const {
    familyId, childId, childName, ownerKind: rawOwnerKind, ownerId: rawOwnerId, ownerName,
  } = route.params || {};
  const ownerKind = rawOwnerKind || BOOK_OWNER.child;
  const ownerId = rawOwnerId || childId;
  const displayName = ownerName || childName || 'Bokhylla';

  const [isbn, setIsbn] = useState('');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [coverUrl, setCoverUrl] = useState(null);
  const [totalPages, setTotalPages] = useState('');
  const [pagesRead, setPagesRead] = useState('0');
  const [status, setStatus] = useState(BOOK_STATUS.reading);
  const [notes, setNotes] = useState('');
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });
  const [scannerOpen, setScannerOpen] = useState(false);

  const showInfo = (heading, message) => setInfo({ visible: true, title: heading, message });

  const doLookup = useCallback(async (overrideIsbn) => {
    const target = normalizeIsbn(overrideIsbn ?? isbn);
    if (!target) {
      showInfo('Mangler ISBN', 'Skriv inn eller skann et ISBN-nummer.');
      return;
    }
    setIsbn(target);
    setLookingUp(true);
    try {
      const found = await lookupIsbn(target);
      setTitle(found.title || '');
      setAuthor(found.author || '');
      setCoverUrl(found.coverUrl || null);
      if (found.totalPages) setTotalPages(String(found.totalPages));
      setIsbn(found.isbn);
    } catch (e) {
      showInfo('Ikke funnet', e?.message || 'Klarte ikke slå opp ISBN.');
    } finally {
      setLookingUp(false);
    }
  }, [isbn]);

  const handleScan = useCallback((scanned) => {
    setScannerOpen(false);
    doLookup(scanned);
  }, [doLookup]);

  const save = useCallback(async () => {
    const uid = auth.currentUser?.uid;
    if (!uid || !familyId || !ownerId) {
      showInfo('Feil', 'Mangler innlogging eller eier.');
      return;
    }
    if (!title.trim()) {
      showInfo('Mangler tittel', 'Skriv inn boktittel.');
      return;
    }
    setSaving(true);
    try {
      await addBook(familyId, ownerKind, ownerId, uid, {
        title: title.trim(),
        author: author.trim(),
        isbn: isbn.replace(/\D/g, '') || null,
        coverUrl,
        totalPages: totalPages ? Number(totalPages) : null,
        pagesRead: Number(pagesRead) || 0,
        status,
        notes,
        reviewRating,
        reviewText,
      });
      navigation.goBack();
    } catch (e) {
      showInfo('Feil', e?.message || 'Klarte ikke lagre boken.');
    } finally {
      setSaving(false);
    }
  }, [
    familyId, ownerKind, ownerId, title, author, isbn, coverUrl,
    totalPages, pagesRead, status, notes, reviewRating, reviewText, navigation,
  ]);

  const goHome = useCallback(() => {
    if (navigation.canGoBack?.()) navigation.goBack();
    else navigation.navigate('Home');
  }, [navigation]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <Screen>
        <ShellHeader title="Legg til bok" onMenuPress={goHome} onLogoHome={goHome} />
        <ScrollBody pad={16}>
          <CompactBackLink onPress={() => navigation.goBack()} label="Bokhylla" />
          <Text style={styles.screenSub}>{displayName}</Text>

          <SectionHeader title="Finn boka" />
        <View style={styles.card}>
          <Text style={styles.lbl}>ISBN</Text>
          <View style={styles.isbnRow}>
            <TextInput
              style={[styles.input, styles.isbnInput]}
              value={isbn}
              onChangeText={setIsbn}
              placeholder="ISBN (skann eller skriv)"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              maxLength={17}
            />
            <TouchableOpacity
              style={styles.iconBtn}
              onPress={() => setScannerOpen(true)}
              accessibilityLabel="Skann ISBN"
            >
              <Ionicons name="barcode-outline" size={20} color={colors.brand} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.searchBtn}
              onPress={() => doLookup()}
              disabled={lookingUp}
              accessibilityLabel="Søk ISBN"
            >
              {lookingUp ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Ionicons name="search" size={18} color="#fff" />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            Skann strekkoden eller skriv ISBN og søk. Norske bøker hentes fra Nasjonalbiblioteket.
          </Text>
          {!!coverUrl && (
            <Image source={{ uri: coverUrl }} style={styles.coverPreview} />
          )}
        </View>

        <SectionHeader title="Om boka" />
        <View style={styles.card}>
          <Text style={styles.lbl}>Tittel *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Boktittel"
            placeholderTextColor={colors.muted}
          />

          <Text style={styles.lbl}>Forfatter</Text>
          <TextInput
            style={styles.input}
            value={author}
            onChangeText={setAuthor}
            placeholder="Forfatter"
            placeholderTextColor={colors.muted}
          />

          <View style={styles.row2}>
            <View style={{ flex: 1 }}>
              <Text style={styles.lbl}>Sider lest</Text>
              <TextInput
                style={styles.input}
                value={pagesRead}
                onChangeText={setPagesRead}
                keyboardType="number-pad"
                placeholderTextColor={colors.muted}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.lbl}>Totalt sider</Text>
              <TextInput
                style={styles.input}
                value={totalPages}
                onChangeText={setTotalPages}
                keyboardType="number-pad"
                placeholder="Valgfritt"
                placeholderTextColor={colors.muted}
              />
            </View>
          </View>

          <Text style={styles.lbl}>Status</Text>
          <View style={styles.statusRow}>
            {Object.entries(STATUS_LABELS).map(([key, label]) => {
              const on = status === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.statusChip, on && styles.statusChipOn]}
                  onPress={() => setStatus(key)}
                >
                  <Text style={[styles.statusChipTxt, on && styles.statusChipTxtOn]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <SectionHeader title="Notat og anmeldelse" />
        <View style={styles.card}>
          <Text style={styles.lbl}>Notat</Text>
          <TextInput
            style={[styles.input, styles.notes]}
            value={notes}
            onChangeText={setNotes}
            placeholder="Valgfritt notat"
            placeholderTextColor={colors.muted}
            multiline
          />

          <Text style={styles.lbl}>Anmeldelse</Text>
          <Text style={styles.hint}>Valgfritt — gi boka stjerner og skriv hva du synes.</Text>
          <StarRating value={reviewRating} onChange={setReviewRating} size={22} />
          <TextInput
            style={[styles.input, styles.notes, { marginTop: 10 }]}
            value={reviewText}
            onChangeText={setReviewText}
            placeholder="Skriv anmeldelse…"
            placeholderTextColor={colors.muted}
            multiline
          />
        </View>

        <BigButton
          label={saving ? 'Lagrer…' : 'Lagre i bokhylla'}
          onPress={save}
          disabled={saving}
        />
      </ScrollBody>

      <InfoDialog
        visible={info.visible}
        title={info.title}
        message={info.message}
        onClose={() => setInfo({ visible: false, title: '', message: '' })}
      />

      <IsbnScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleScan}
      />
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screenSub: { fontSize: 14, fontWeight: '400', color: colors.muted, marginBottom: 8 },
  sectionTitle: {
    fontSize: 13, fontWeight: '400', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: 12, marginBottom: 8, marginLeft: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  isbnRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  isbnInput: { flex: 1, marginBottom: 0 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#eef6ff', borderWidth: 1, borderColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  searchBtn: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  hint: { color: colors.muted, fontSize: 12, fontWeight: '400', marginTop: 8, lineHeight: 17 },
  coverPreview: {
    width: 72, height: 100, borderRadius: 8, alignSelf: 'center',
    marginTop: 12, backgroundColor: '#e2e8f0',
  },
  lbl: { fontWeight: '400', color: colors.ink, fontSize: 13, marginTop: 10, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line,
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 16, fontWeight: '400', color: colors.ink,
  },
  row2: { flexDirection: 'row', gap: 10 },
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  statusChip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12,
    backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.line,
  },
  statusChipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  statusChipTxt: { fontWeight: '400', color: colors.muted, fontSize: 13 },
  statusChipTxtOn: { color: colors.brand },
  notes: { minHeight: 72, textAlignVertical: 'top' },
});
