import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Image,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { Screen, Loader } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer } from '../../components/ModulePageBg';
import ShellAddButton from '../../components/ShellAddButton';
import HelpTarget from '../../components/HelpTarget';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import { AvatarBubble } from '../../components/AvatarPicker';
import {
  listenChildBooks, listenParentBooks, BOOK_OWNER,
  STATUS_LABELS, BOOK_STATUS, progressPct, reviewStarsLabel, effectiveBookStatus,
  bookNavPayload,
} from '../../src/utils/books';


function ownerKey(owner, ownerKind = BOOK_OWNER.child) {
  if (ownerKind === BOOK_OWNER.parent) return owner?.uid || owner?.id || null;
  return owner?.id || owner?.childId || owner?.docId || null;
}

function Frame({ inShell, children }) {
  if (inShell) return <View style={styles.shellFrame}>{children}</View>;
  return <Screen>{children}</Screen>;
}

function CountRing({ count, done = 0 }) {
  const empty = count === 0;
  const allDone = count > 0 && done >= count;
  return (
    <View style={[
      styles.countRing,
      empty && styles.countRingEmpty,
      allDone && styles.countRingDone,
    ]}
    >
      <Text style={[
        styles.countRingTxt,
        empty && styles.countRingTxtEmpty,
        allDone && styles.countRingTxtDone,
      ]}
      >
        {count}
      </Text>
    </View>
  );
}

function BookRow({ book, onPress, compact }) {
  const pct = progressPct(book);
  const status = effectiveBookStatus(book);
  const coverW = compact ? 32 : 40;
  const coverH = compact ? 44 : 56;
  return (
    <TouchableOpacity style={styles.bookRow} onPress={onPress} activeOpacity={0.75}>
      {book.coverUrl ? (
        <Image source={{ uri: book.coverUrl }} style={{ width: coverW, height: coverH, borderRadius: 4 }} />
      ) : (
        <View style={[styles.coverPh, { width: coverW, height: coverH }]}>
          <Text style={{ fontSize: compact ? 16 : 20 }}>📚</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.bookTitle} numberOfLines={1}>{book.title || 'Uten tittel'}</Text>
        {!!book.author && <Text style={styles.bookAuthor} numberOfLines={1}>{book.author}</Text>}
        <Text style={styles.bookStatus}>{STATUS_LABELS[status] || String(status || '')}</Text>
        {book.reviewRating > 0 && (
          <Text style={styles.bookStars}>{reviewStarsLabel(book.reviewRating)}</Text>
        )}
        {Number.isFinite(pct) && (
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${pct}%` }]} />
            </View>
            <Text style={styles.progressTxt}>{pct}%</Text>
          </View>
        )}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

function countByStatus(books, status) {
  return (books || []).filter((b) => effectiveBookStatus(b) === status).length;
}

function ChildBooksSection({
  child, books, expanded, onToggle, onOpenBook, onAddBook,
}) {
  const count = books.length;
  const finished = countByStatus(books, BOOK_STATUS.finished);
  const reading = countByStatus(books, BOOK_STATUS.reading);
  const firstName = child?.name?.split(' ')[0] || 'Barn';

  return (
    <View style={styles.childBlock}>
      <TouchableOpacity style={styles.childHeader} onPress={onToggle} activeOpacity={0.75}>
        <AvatarBubble
          avatarId={child?.avatarId}
          photoURL={child?.photoURL || child?.photoUrl}
          name={child?.name}
          size={36}
        />
        <View style={{ flex: 1 }}>
          <Text style={styles.childName}>{firstName}</Text>
          <Text style={styles.childSub}>
            {reading} leser · {finished} ferdig
          </Text>
        </View>
        <CountRing count={count} done={finished} />
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
      </TouchableOpacity>
      {expanded && count > 0 && books.map((book) => (
        <BookRow
          key={book.id}
          book={book}
          compact
          onPress={() => onOpenBook(child, book)}
        />
      ))}
      {expanded && count === 0 && (
        <Text style={styles.childEmpty}>Ingen bøker registrert</Text>
      )}
      {expanded && (
        <TouchableOpacity style={styles.addLink} onPress={() => onAddBook(child)}>
          <Ionicons name="add" size={16} color={colors.brand} />
          <Text style={styles.addLinkTxt}>Legg til bok for {firstName}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function BookshelfScreen({ inShell = false } = {}) {
  useChildAppGuard('books');
  useHelpScene('hub');
  const nav = useNavigation();
  const { isDesktop } = useLayout();
  const {
    familyId, uid, kids, meChild, meParent, userProfile, isChild, isParent,
    isActingAsChild, activeChild, activeChildId,
  } = useApp();
  const [books, setBooks] = useState([]);
  const [parentBooks, setParentBooks] = useState([]);
  const [kidBooks, setKidBooks] = useState({});
  const [expandedKids, setExpandedKids] = useState({});
  const [parentExpanded, setParentExpanded] = useState(true);

  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false),
    [kids],
  );

  const selectedChild = isChild ? meChild : activeChild;
  const childId = isChild
    ? ownerKey(meChild)
    : (isActingAsChild ? (activeChildId || ownerKey(activeChild)) : null);

  useEffect(() => {
    if (!familyId || !childId) {
      setBooks([]);
      return undefined;
    }
    return listenChildBooks(familyId, childId, setBooks);
  }, [familyId, childId]);

  useEffect(() => {
    if (!familyId || !uid || !isParent || isActingAsChild) return undefined;
    return listenParentBooks(familyId, uid, setParentBooks);
  }, [familyId, uid, isParent, isActingAsChild]);

  useEffect(() => {
    if (!familyId || !isParent || isActingAsChild) return undefined;
    const unsubs = activeKids.map((k) => listenChildBooks(familyId, k.id, (items) => {
      setKidBooks((prev) => ({ ...prev, [k.id]: items }));
    }));
    return () => unsubs.forEach((u) => u && u());
  }, [familyId, isParent, isActingAsChild, activeKids]);

  const showParentOverview = isParent && !isActingAsChild && !isChild;

  const parentOwner = useMemo(() => ({
    id: uid,
    uid,
    name: meParent?.name || userProfile?.displayName || userProfile?.name || 'Meg',
  }), [uid, meParent, userProfile]);

  const totalBooks = useMemo(
    () => parentBooks.length + Object.values(kidBooks).reduce((sum, list) => sum + (list?.length || 0), 0),
    [parentBooks, kidBooks],
  );

  const openBook = useCallback((owner, book, ownerKind = BOOK_OWNER.child) => {
    const ownerId = ownerKey(owner, ownerKind);
    nav.navigate('BookDetail', {
      familyId,
      ownerKind,
      ownerId,
      childId: ownerKind === BOOK_OWNER.child ? ownerId : undefined,
      bookId: book.id,
      book: bookNavPayload(book),
      ownerName: owner?.name,
      childName: owner?.name,
    });
  }, [nav, familyId]);

  const openAdd = useCallback((owner, ownerKind = BOOK_OWNER.child) => {
    const ownerId = ownerKey(owner, ownerKind);
    nav.navigate('AddBook', {
      familyId,
      ownerKind,
      ownerId,
      childId: ownerKind === BOOK_OWNER.child ? ownerId : undefined,
      ownerName: owner?.name,
      childName: owner?.name,
    });
  }, [nav, familyId]);

  const toggleChild = (id) => {
    setExpandedKids((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Shell-knapp alltid når mobil + familieId (hub-eierskap fikset i useShellTitleRight).
  const shellAddBtn = useMemo(() => {
    if (!familyId) return null;
    if (showParentOverview) {
      return (
        <ShellAddButton
          label="Legg til bok"
          accessibilityLabel="Legg til bok i min bokhylle"
          onPress={() => openAdd(parentOwner, BOOK_OWNER.parent)}
        />
      );
    }
    if (!childId) return null;
    return (
      <ShellAddButton
        label="Legg til bok"
        onPress={() => openAdd(selectedChild || meChild)}
      />
    );
  }, [
    isDesktop, familyId, showParentOverview, childId,
    parentOwner, selectedChild, meChild, openAdd,
  ]);
  useShellTitleRight(shellAddBtn);

  if (!familyId) return <Frame inShell={inShell}><Loader /></Frame>;

  if (showParentOverview) {
    return (
      <Frame inShell={inShell}>
        <ModulePageFrame name="books">
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.lead, isDesktop && styles.leadDesk]}>
            {totalBooks > 0
              ? `${totalBooks} bøker totalt · trykk på et barn for å se bøkene`
              : 'Registrer bøker per barn — perfekt for leseløven!'}
          </Text>

          <View style={[styles.listCard, isDesktop && styles.listCardDesk]}>
            <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>Mine bøker</Text>
            <View style={styles.childBlock}>
              <TouchableOpacity
                style={[styles.childHeader, isDesktop && styles.childHeaderDesk]}
                onPress={() => setParentExpanded((v) => !v)}
                activeOpacity={0.75}
              >
                <View style={[styles.parentIcon, isDesktop && styles.parentIconDesk]}>
                  <Ionicons name="person" size={isDesktop ? 15 : 18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.childName, isDesktop && styles.childNameDesk]}>
                    {parentOwner.name?.split(' ')[0] || 'Meg'}
                  </Text>
                  <Text style={[styles.childSub, isDesktop && styles.childSubDesk]}>
                    {countByStatus(parentBooks, BOOK_STATUS.reading)} leser ·{' '}
                    {countByStatus(parentBooks, BOOK_STATUS.finished)} ferdig
                  </Text>
                </View>
                <CountRing
                  count={parentBooks.length}
                  done={countByStatus(parentBooks, BOOK_STATUS.finished)}
                />
                <Ionicons
                  name={parentExpanded ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.muted}
                />
              </TouchableOpacity>
              {parentExpanded && parentBooks.length > 0 && parentBooks.map((book, i) => {
                const row = (
                  <BookRow
                    book={book}
                    compact
                    onPress={() => openBook(parentOwner, book, BOOK_OWNER.parent)}
                  />
                );
                if (i === 0) {
                  return (
                    <HelpTarget
                      key={book.id}
                      id="content"
                      onAdvance={() => openBook(parentOwner, book, BOOK_OWNER.parent)}
                    >
                      {row}
                    </HelpTarget>
                  );
                }
                return <React.Fragment key={book.id}>{row}</React.Fragment>;
              })}
              {parentExpanded && parentBooks.length === 0 && (
                <Text style={styles.childEmpty}>Ingen bøker registrert</Text>
              )}
            </View>
          </View>

          <View style={[styles.listCard, isDesktop && styles.listCardDesk, { marginTop: 10 }]}>
            <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>Barn · bokhyller</Text>
            {activeKids.length === 0 && (
              <Text style={styles.emptyInline}>Ingen barn registrert.</Text>
            )}
            {activeKids.map((k) => (
              <ChildBooksSection
                key={k.id}
                child={k}
                books={kidBooks[k.id] || []}
                expanded={!!expandedKids[k.id]}
                onToggle={() => toggleChild(k.id)}
                onOpenBook={openBook}
                onAddBook={openAdd}
              />
            ))}
          </View>
          <View style={{ height: 24 }} />
      <ModuleBgSpacer />
      </ScrollView>
      </ModulePageFrame>
      </Frame>
    );
  }

  if (!childId) {
    return (
      <Frame inShell={inShell}>
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>📚</Text>
          <Text style={styles.emptyTitle}>Ingen barn valgt</Text>
          <Text style={styles.emptySub}>Bytt til et barn via profilmenyen.</Text>
        </View>
      </Frame>
    );
  }

  const stats = {
    reading: countByStatus(books, BOOK_STATUS.reading),
    finished: countByStatus(books, BOOK_STATUS.finished),
  };

  return (
    <Frame inShell={inShell}>
      <ModulePageFrame name="books">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.lead, isDesktop && styles.leadDesk]}>
          {stats.reading} under lesing · {stats.finished} lest ferdig
        </Text>

        <View style={[styles.listCard, isDesktop && styles.listCardDesk]}>
          <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>
            {isChild ? 'Mine bøker' : `${selectedChild?.name?.split(' ')[0] || 'Barn'} · bøker`}
          </Text>
          {books.length === 0 ? (
            <Text style={styles.emptyInline}>Ingen bøker ennå.</Text>
          ) : (
            books.map((book, i) => {
              const row = (
                <BookRow
                  book={book}
                  onPress={() => openBook(selectedChild || meChild, book)}
                />
              );
              if (i === 0) {
                return (
                  <HelpTarget
                    key={book.id}
                    id="content"
                    onAdvance={() => openBook(selectedChild || meChild, book)}
                  >
                    {row}
                  </HelpTarget>
                );
              }
              return <React.Fragment key={book.id}>{row}</React.Fragment>;
            })
          )}
        </View>
        <View style={{ height: 24 }} />
      <ModuleBgSpacer />
      </ScrollView>
      </ModulePageFrame>
    </Frame>
  );
}

const styles = StyleSheet.create({
  shellFrame: { flex: 1, minHeight: 0, position: 'relative', backgroundColor: 'transparent' },
  scroll: { flex: 1, minHeight: 0, zIndex: 1, backgroundColor: 'transparent' },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 8 },
  bodyDesk: { paddingHorizontal: 12, paddingTop: 8 },
  deskAddWrap: { marginBottom: 6, alignSelf: 'flex-start' },
  lead: {
    color: colors.muted, fontWeight: '500', fontSize: 13,
    lineHeight: 18, marginBottom: 10,
  },
  leadDesk: { fontWeight: '400', fontSize: 12, marginBottom: 8 },
  listCard: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1,
    borderColor: colors.line, overflow: 'hidden',
  },
  listCardDesk: { borderRadius: 8 },
  listSection: {
    fontSize: 10, fontWeight: '400', color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.6, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
  },
  listSectionDesk: { fontWeight: '500', fontSize: 11, paddingTop: 8, paddingBottom: 2 },
  emptyInline: {
    paddingHorizontal: 12, paddingBottom: 12, color: colors.muted,
    fontWeight: '500', fontSize: 13,
  },
  childBlock: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  childHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 9, minHeight: 50,
  },
  childHeaderDesk: { paddingVertical: 8, minHeight: 44, gap: 8 },
  childName: { fontWeight: '400', fontSize: 14, color: colors.ink },
  childNameDesk: { fontWeight: '500', fontSize: 13 },
  childSub: { fontSize: 11, color: colors.muted, fontWeight: '500', marginTop: 1 },
  childSubDesk: { fontWeight: '400', fontSize: 11 },
  countRing: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, borderColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  countRingEmpty: { borderColor: colors.line, backgroundColor: colors.bg },
  countRingDone: { borderColor: colors.success, backgroundColor: colors.successSoft },
  countRingTxt: { fontWeight: '400', fontSize: 12, color: colors.brand },
  countRingTxtEmpty: { color: colors.muted },
  countRingTxtDone: { color: colors.success },
  childEmpty: { paddingHorizontal: 24, paddingBottom: 8, fontSize: 12, color: colors.muted, fontWeight: '400' },
  addLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 24, paddingBottom: 10, paddingTop: 2,
  },
  addLinkTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  bookRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 12, paddingVertical: 8, minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
    paddingLeft: 24,
  },
  coverPh: {
    borderRadius: 4, backgroundColor: '#f1f5f9',
    alignItems: 'center', justifyContent: 'center',
  },
  bookTitle: { fontWeight: '400', fontSize: 13, color: colors.ink },
  bookAuthor: { color: colors.muted, fontWeight: '500', fontSize: 11, marginTop: 1 },
  bookStatus: { color: colors.brand, fontWeight: '400', fontSize: 10, marginTop: 3 },
  bookStars: { color: colors.star, fontWeight: '400', fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
  parentIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    alignItems: 'center', justifyContent: 'center',
  },
  parentIconDesk: { width: 32, height: 32, borderRadius: 16 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  progressTrack: { flex: 1, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, backgroundColor: colors.brand, borderRadius: 2 },
  progressTxt: { fontSize: 10, fontWeight: '400', color: colors.muted, minWidth: 28 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontWeight: '400', fontSize: 18, color: colors.ink },
  emptySub: { textAlign: 'center', color: colors.muted, lineHeight: 20, maxWidth: 280 },
});
