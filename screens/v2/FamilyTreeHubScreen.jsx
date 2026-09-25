/**
 * Familietreet — tre, pedigree, oversikt, hurtigvalg og invitasjon.
 * Spinner-fiks: bootstrap blokkerer aldri UI; listener har timeout.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Pressable,
  ActivityIndicator, ScrollView, Switch, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer, ModuleHubIntro } from '../../components/ModulePageBg';
import CompactBackLink from '../../components/CompactBackLink';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { AvatarBubble } from '../../components/AvatarPicker';
import ShellAddButton from '../../components/ShellAddButton';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import FamilyTreeCanvas, {
  GenerationOverviewList, PedigreeView,
} from '../../components/FamilyTreeCanvas';
import BirthdayPicker from '../../components/BirthdayPicker';
import { useApp } from '../../src/context/AppContext';
import { colors, radius } from '../../src/theme';
import { parseBirthday, toIsoDate, formatBirthday } from '../../src/utils/age';
import {
  listenFamilyTreePeople,
  listFamilyTreePeople,
  createFamilyTreePerson,
  updateFamilyTreePerson,
  deleteFamilyTreePerson,
  bootstrapFamilyTree,
  syncMembersIntoTree,
  inviteTreePerson,
  linkMembersToTreePeople,
  dedupeFamilyTreePeople,
  repairMutualPartners,
  emptyPersonForm,
  personDisplayName,
  personMetaLine,
  lifeSpanLabel,
  RELATION_TYPES,
  GENDER_OPTIONS,
  QUICK_ADD_ACTIONS,
  membersMissingFromTree,
  findDuplicatePersonGroups,
  provisionalPeopleFromMembers,
  searchPeople,
  buildTreeStats,
  sanitizeFamilyTreeParentIds,
  buildParentIdSanitizationPatches,
} from '../../src/utils/familyTree';


const TABS = [
  { id: 'tree', label: 'Treet', icon: 'git-network' },
  { id: 'pedigree', label: 'Person', icon: 'person' },
  { id: 'overview', label: 'Oversikt', icon: 'list' },
];

const TREE_DATE_YEARS = 160;

function useDesktopOnce() {
  const [isDesktop] = useState(() => {
    try {
      if (typeof window !== 'undefined' && Number(window.innerWidth) >= 1024) return true;
    } catch { /* native / SSR */ }
    return false;
  });
  return isDesktop;
}

export default function FamilyTreeHubScreen({
  compactHeader = false, inShell = false, onBack,
}) {
  const isDesktop = useDesktopOnce();
  const {
    familyId, family, uid, members, requestShellTab,
    isAdmin, isParent, isChild, isActingAsChild,
  } = useApp();

  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(!!familyId);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState('tree');
  const [selectedId, setSelectedId] = useState(null);
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyPersonForm());
  const [saving, setSaving] = useState(false);
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);

  const bootstrappedRef = useRef(false);
  const healedRef = useRef(false);
  const membersKey = useMemo(
    () => (members || []).map((m) => `${m.id}:${m.role}`).sort().join('|'),
    [members],
  );

  const displayPeople = useMemo(() => {
    if (people.length > 0) return people;
    // Vis midlertidig tre fra husstandsmedlemmer mens Firestore er tom/synces
    if (members?.length) return provisionalPeopleFromMembers(members);
    return [];
  }, [people, members]);

  const focusKey = useMemo(() => {
    const parentLinked = displayPeople
      .filter((p) => (
        p.linkedRole === 'parent'
        || (p.linkedUid && members.some((m) => m.id === p.linkedUid && m.role === 'parent'))
      ))
      .map((p) => p.id);
    if (parentLinked.length) return parentLinked.join('|');
    const anyLinked = displayPeople.filter((p) => p.linkedUid).map((p) => p.id);
    if (anyLinked.length) return anyLinked.join('|');
    return displayPeople.filter((p) => !(p.parentIds || []).length).map((p) => p.id).join('|');
  }, [displayPeople, members]);

  const focusIds = useMemo(
    () => (focusKey ? focusKey.split('|') : []),
    [focusKey],
  );

  const filteredPeople = useMemo(
    () => searchPeople(displayPeople, query),
    [displayPeople, query],
  );

  const stats = useMemo(
    () => buildTreeStats(displayPeople, focusIds),
    [displayPeople, focusIds],
  );

  const selected = useMemo(
    () => displayPeople.find((p) => p.id === selectedId) || null,
    [displayPeople, selectedId],
  );

  const canManageTree = (isAdmin || isParent) && !isChild && !isActingAsChild;

  // Velg første foresatt som standard for pedigree
  useEffect(() => {
    if (selectedId && displayPeople.some((p) => p.id === selectedId)) return;
    const prefer = focusIds[0] || displayPeople[0]?.id || null;
    setSelectedId(prefer);
  }, [displayPeople, focusIds, selectedId]);

  const missingMembers = useMemo(
    () => membersMissingFromTree(members, people),
    [members, people],
  );

  const isProvisional = people.length === 0 && displayPeople.length > 0;

  useEffect(() => {
    bootstrappedRef.current = false;
    healedRef.current = false;
    if (!familyId) {
      setPeople([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    return listenFamilyTreePeople(familyId, (rows, meta) => {
      if (meta?.pending) {
        // Timeout uten snapshot — ikke overskriv med tom liste (unngår bootstrap-duplikater)
        setLoading(false);
        return;
      }
      setPeople(rows);
      setLoading(false);
    });
  }, [familyId]);

  // Bakgrunnssync — aldri fullskjerm-spinner
  useEffect(() => {
    if (!familyId || !uid || loading) return undefined;
    if (bootstrappedRef.current) return undefined;
    if (!members?.length) return undefined;

    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        if (people.length === 0) {
          bootstrappedRef.current = true;
          await bootstrapFamilyTree(familyId, uid, members);
        } else if (missingMembers.length > 0) {
          bootstrappedRef.current = true;
          // ikke auto-sync missing etter bootstrap — bare markér
        } else {
          bootstrappedRef.current = true;
        }
      } catch (err) {
        bootstrappedRef.current = true;
        console.warn('[familyTree] bootstrap', err?.message || err);
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();

    return () => { cancelled = true; };
  }, [familyId, uid, loading, people.length, membersKey, missingMembers.length, members]);

  // Auto-helbred: knytt inviterte til medlemmer + slå sammen duplikater + fiks partner-lenker
  useEffect(() => {
    if (!familyId || !uid || loading || !canManageTree) return undefined;
    if (healedRef.current) return undefined;
    if (!people.length) return undefined;

    const needsLink = members?.some((m) => {
      const match = people.find((p) => p.linkedUid === m.id)
        || people.find((p) => !p.linkedUid && (
          (m.email && String(p.email || '').toLowerCase() === String(m.email).toLowerCase())
          || (m.name && String(p.displayName || '').trim().toLowerCase() === String(m.name).trim().toLowerCase())
        ));
      return match && !match.linkedUid;
    });
    const needsDedupe = findDuplicatePersonGroups(people).length > 0;
    const needsPartnerFix = people.some((p) => (
      (p.partnerIds || []).some((pid) => {
        const other = people.find((x) => x.id === pid);
        return other && !(other.partnerIds || []).includes(p.id);
      })
    ));
    const needsParentSanitize = buildParentIdSanitizationPatches(people).size > 0;
    if (!needsLink && !needsDedupe && !needsPartnerFix && !needsParentSanitize) {
      healedRef.current = true;
      return undefined;
    }

    let cancelled = false;
    (async () => {
      healedRef.current = true;
      try {
        if (needsLink) {
          await linkMembersToTreePeople(familyId, members, people);
        }
        let latest = await listFamilyTreePeople(familyId);
        await repairMutualPartners(familyId, latest);
        latest = await listFamilyTreePeople(familyId);
        if (findDuplicatePersonGroups(latest).length > 0) {
          await dedupeFamilyTreePeople(familyId, latest);
          latest = await listFamilyTreePeople(familyId);
        }
        if (buildParentIdSanitizationPatches(latest).size > 0) {
          await sanitizeFamilyTreeParentIds(familyId, latest);
        }
      } catch (err) {
        console.warn('[familyTree] heal', err?.message || err);
        if (!cancelled) healedRef.current = false;
      }
    })();

    return () => { cancelled = true; };
  }, [familyId, uid, loading, canManageTree, people, members]);

  const goBack = useCallback(() => {
    if (onBack) onBack();
    else requestShellTab?.('more', null);
  }, [onBack, requestShellTab]);

  const showInfo = useCallback((title, message) => {
    setInfo({ visible: true, title, message: String(message || '') });
  }, []);

  const openPersonDetail = useCallback((person) => {
    if (!person) return;
    if (person.provisional) {
      showInfo('Synkroniserer', 'Personen lagres fortsatt. Prøv igjen om litt.');
      return;
    }
    setSelectedId(person.id);
    setActionsOpen(true);
  }, [showInfo]);

  const openPersonActions = useCallback((person) => {
    openPersonDetail(person);
  }, [openPersonDetail]);

  const openNew = useCallback((relativeTo = null, relationType = 'parent', extras = {}) => {
    if (isProvisional) {
      showInfo(
        'Synkroniserer',
        'Treet lagres fortsatt. Prøv igjen om et øyeblikk, eller trykk «Hent medlemmer».',
      );
      return;
    }
    setEditingId(null);
    setForm(emptyPersonForm({
      relativeToId: relativeTo?.id || selectedId || null,
      relationType: relationType || 'parent',
      gender: extras.gender || null,
      displayName: extras.displayName || '',
      isExternal: true,
      sendInvite: false,
    }));
    setActionsOpen(false);
    setFormOpen(true);
  }, [selectedId, isProvisional, showInfo]);

  const openQuickAdd = useCallback((actionId, relative = null) => {
    const action = QUICK_ADD_ACTIONS.find((a) => a.id === actionId);
    if (!action) return;
    const target = relative || selected;
    openNew(target, action.relationType, {
      gender: action.gender,
      displayName: '',
    });
  }, [openNew, selected]);

  const openEdit = useCallback((person) => {
    if (person?.provisional) {
      showInfo('Synkroniserer', 'Personen lagres fortsatt. Prøv igjen om litt.');
      return;
    }
    setEditingId(person.id);
    setForm(emptyPersonForm({
      displayName: person.displayName || '',
      gender: person.gender || null,
      birthday: toIsoDate(person.birthday) || person.birthday || '',
      deathDate: toIsoDate(person.deathDate) || person.deathDate || '',
      notes: person.notes || '',
      email: person.email || '',
      phone: person.phone || '',
      linkedUid: person.linkedUid || null,
      linkedRole: person.linkedRole || null,
      isExternal: person.isExternal !== false && !person.linkedUid,
      sendInvite: false,
      relativeToId: null,
      relationType: 'parent',
    }));
    setActionsOpen(false);
    setFormOpen(true);
  }, [showInfo]);

  const saveForm = useCallback(async () => {
    if (!familyId || !uid) return;
    if (isProvisional && !editingId) {
      showInfo('Vent litt', 'Treet synkroniseres fortsatt.');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateFamilyTreePerson(familyId, editingId, form);
        if (form.sendInvite && (form.email || form.phone)) {
          const person = { ...form, id: editingId, displayName: form.displayName };
          await inviteTreePerson(familyId, uid, person, { familyName: family?.name });
          showInfo('Invitasjon sendt', `${form.displayName} er invitert til familien.`);
        }
      } else {
        const { inviteResult } = await createFamilyTreePerson(
          familyId,
          uid,
          form,
          {
            relativeToId: form.relativeToId,
            relationType: form.relationType,
            existingPeople: people,
            sendInvite: !!form.sendInvite,
            familyName: family?.name || '',
          },
        );
        if (form.sendInvite) {
          const parts = [];
          if (inviteResult?.emailSent) parts.push('e-post');
          if (inviteResult?.smsSent) parts.push('SMS');
          showInfo(
            'Person lagt til',
            parts.length
              ? `${form.displayName} er lagt til og invitert via ${parts.join(' og ')}.`
              : `${form.displayName} er lagt til.`,
          );
        }
      }
      setFormOpen(false);
    } catch (err) {
      showInfo('Kunne ikke lagre', err?.message || 'Noe gikk galt.');
    } finally {
      setSaving(false);
    }
  }, [familyId, uid, editingId, form, people, family?.name, showInfo, isProvisional]);

  const syncMissing = useCallback(async () => {
    if (!familyId || !uid) return;
    setSyncing(true);
    try {
      if (people.length === 0) {
        const res = await bootstrapFamilyTree(familyId, uid, members);
        showInfo('Treet er klart', `${res.added} personer lagt inn fra familien.`);
      } else {
        const res = await syncMembersIntoTree(familyId, uid, members, people);
        const latest = await listFamilyTreePeople(familyId);
        const partners = await repairMutualPartners(familyId, latest);
        const after = await listFamilyTreePeople(familyId);
        const deduped = await dedupeFamilyTreePeople(familyId, after);
        const parts = [];
        if (res.linked) parts.push(`${res.linked} knyttet`);
        if (res.added) parts.push(`${res.added} lagt inn`);
        if (partners.fixed) parts.push(`${partners.fixed} partnerlenker fikset`);
        if (deduped.merged) parts.push(`${deduped.merged} duplikater fjernet`);
        showInfo(
          'Synkronisert',
          parts.length ? parts.join(' · ') : 'Alle familiemedlemmer er allerede i treet.',
        );
      }
      bootstrappedRef.current = true;
      healedRef.current = true;
    } catch (err) {
      showInfo('Kunne ikke synke', err?.message || 'Noe gikk galt.');
    } finally {
      setSyncing(false);
    }
  }, [familyId, uid, members, people, showInfo]);

  const doInviteSelected = useCallback(async () => {
    if (!selected || selected.provisional || !familyId || !uid) return;
    if (!selected.email && !selected.phone) {
      openEdit(selected);
      showInfo('Kontakt mangler', 'Legg til e-post eller telefon, og huk av for invitasjon.');
      return;
    }
    setInviting(true);
    try {
      await inviteTreePerson(familyId, uid, selected, { familyName: family?.name });
      showInfo('Invitasjon sendt', `${personDisplayName(selected)} er invitert til ProTop.`);
    } catch (err) {
      showInfo('Kunne ikke invitere', err?.message || 'Noe gikk galt.');
    } finally {
      setInviting(false);
    }
  }, [selected, familyId, uid, family?.name, openEdit, showInfo]);

  const doDelete = useCallback(async () => {
    if (!confirmDelete || !familyId || confirmDelete.provisional) return;
    try {
      await deleteFamilyTreePerson(familyId, confirmDelete.id, people);
      if (selectedId === confirmDelete.id) setSelectedId(null);
      setActionsOpen(false);
    } catch (err) {
      showInfo('Kunne ikke slette', err?.message || 'Noe gikk galt.');
    } finally {
      setConfirmDelete(null);
    }
  }, [confirmDelete, familyId, people, selectedId, showInfo]);

  const relativeOptions = useMemo(
    () => people.map((p) => ({ id: p.id, label: personDisplayName(p) })),
    [people],
  );

  const showChrome = !compactHeader && !inShell;
  // Kun kort innlasting — aldri permanent spinner
  const showFullSpinner = loading && displayPeople.length === 0;

  const treeSource = query.trim() ? filteredPeople : displayPeople;

  const openAddPerson = useCallback(() => {
    openNew(selected, 'parent');
  }, [openNew, selected]);

  const shellAddBtn = useMemo(() => {
    if (formOpen || !canManageTree || !editMode) return null;
    return (
      <ShellAddButton
        label="Legg til"
        accessibilityLabel="Legg til familiemedlem"
        onPress={openAddPerson}
      />
    );
  }, [isDesktop, formOpen, canManageTree, editMode, openAddPerson]);
  useShellTitleRight(shellAddBtn);

  const statsLine = `${stats.people} personer · ${stats.generations} gen. · ${stats.external} uten bruker`;

  return (
    <Screen>
      <ModulePageFrame name="family-tree">
      <View style={styles.fg}>
      {showChrome ? (
        <View style={styles.topBar}>
          <CompactBackLink onPress={goBack} label="Mer" />
          <ModuleHubIntro>
          <Text style={styles.title}>Familietreet</Text>
          <Mute>Slektsoversikt — også uten ProTop-bruker</Mute>
          </ModuleHubIntro>
        </View>
      ) : null}

      <View style={styles.chromeCompact}>
        <View style={styles.toolbar}>
          <View style={styles.tabs}>
            {TABS.map((t) => {
              const on = tab === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  onPress={() => setTab(t.id)}
                  style={[styles.tab, on && styles.tabOn]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  <Ionicons name={t.icon} size={14} color={on ? colors.brand : colors.muted} />
                  <Text style={[styles.tabTxt, on && styles.tabTxtOn]}>{t.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={styles.toolbarActions}>
            {(missingMembers.length > 0 || isProvisional) ? (
              <TouchableOpacity
                onPress={syncMissing}
                style={styles.iconAction}
                disabled={syncing}
                accessibilityLabel={isProvisional ? 'Lagre treet' : 'Hent medlemmer'}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color={colors.brand} />
                ) : (
                  <Ionicons name="sync" size={18} color={colors.brand} />
                )}
              </TouchableOpacity>
            ) : syncing ? (
              <ActivityIndicator size="small" color={colors.brand} style={{ marginRight: 4 }} />
            ) : null}
            {canManageTree ? (
              <TouchableOpacity
                onPress={() => setEditMode((v) => !v)}
                style={[styles.editToggle, editMode && styles.editToggleOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: editMode }}
                accessibilityLabel={editMode ? 'Avslutt redigering' : 'Rediger slektstreet'}
              >
                <Ionicons
                  name={editMode ? 'eye-outline' : 'create-outline'}
                  size={15}
                  color={editMode ? '#fff' : colors.brand}
                />
                <Text style={[styles.editToggleTxt, editMode && styles.editToggleTxtOn]}>
                  {editMode ? 'Ferdig' : 'Rediger'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.metaRow}>
          <Text style={styles.statsLine} numberOfLines={1}>{statsLine}</Text>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={15} color={colors.muted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Søk i slektstreet…"
            placeholderTextColor={colors.placeholder}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {query ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {showFullSpinner ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.loadingTxt}>Laster slektstreet…</Text>
        </View>
      ) : tab === 'tree' ? (
        <View style={styles.treePane}>
          {isProvisional ? (
            <View style={styles.banner}>
              <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
              <Text style={styles.bannerTxt}>
                Viser familien midlertidig. Trykk synk-ikonet for å lagre treet.
              </Text>
            </View>
          ) : null}
          <View style={styles.treeCard}>
            <FamilyTreeCanvas
              people={treeSource}
              focusIds={focusIds}
              selectedId={selectedId}
              onSelect={openPersonDetail}
              onManage={canManageTree && editMode ? openPersonActions : undefined}
              canManage={canManageTree}
              editMode={editMode}
              compact={!isDesktop}
            />
          </View>
          {!displayPeople.length && canManageTree ? (
            <View style={styles.hintBox}>
              <Text style={styles.hintTitle}>Kom i gang</Text>
              <Text style={styles.hintBody}>
                Legg til besteforeldre, oldeforeldre og tippoldeforeldre — de trenger ikke
                være brukere. Huk av for invitasjon hvis de skal få tilgang til ProTop.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setEditMode(true);
                  openNew(null, 'parent');
                }}
                style={styles.addBtn}
              >
                <Ionicons name="person-add" size={18} color="#fff" />
                <Text style={styles.addBtnTxt}>Første person</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={styles.body}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.mainPane}>
            {isProvisional ? (
              <View style={styles.banner}>
                <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
                <Text style={styles.bannerTxt}>
                  Viser familien midlertidig. Trykk synk-ikonet for å lagre treet.
                </Text>
              </View>
            ) : null}

            {tab === 'pedigree' ? (
              <View style={styles.pedigreeCard}>
                <PedigreeView
                  people={displayPeople}
                  focusId={selectedId || focusIds[0]}
                  selectedId={selectedId}
                  onSelect={openPersonDetail}
                  onQuickAdd={canManageTree && editMode ? (actionId) => openQuickAdd(actionId) : undefined}
                  onManage={canManageTree && editMode ? openPersonActions : undefined}
                  canManage={canManageTree}
                  editMode={editMode}
                />
              </View>
            ) : null}

            {tab === 'overview' ? (
              <View style={styles.overviewCard}>
                <GenerationOverviewList
                  people={treeSource}
                  focusIds={focusIds}
                  selectedId={selectedId}
                  onSelect={openPersonDetail}
                  onManage={canManageTree && editMode ? openPersonActions : undefined}
                  canManage={canManageTree}
                  editMode={editMode}
                />
              </View>
            ) : null}

            {!displayPeople.length && canManageTree ? (
              <View style={styles.hintBox}>
                <Text style={styles.hintTitle}>Kom i gang</Text>
                <Text style={styles.hintBody}>
                  Legg til besteforeldre, oldeforeldre og tippoldeforeldre — de trenger ikke
                  være brukere. Huk av for invitasjon hvis de skal få tilgang til ProTop.
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setEditMode(true);
                    openNew(null, 'parent');
                  }}
                  style={styles.addBtn}
                >
                  <Ionicons name="person-add" size={18} color="#fff" />
                  <Text style={styles.addBtnTxt}>Første person</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        <ModuleBgSpacer />
      </ScrollView>
      )}
      </View>
      </ModulePageFrame>
      <Modal
        visible={actionsOpen && !!selected && !selected.provisional}
        animationType="slide"
        transparent
        onRequestClose={() => setActionsOpen(false)}
      >
        <View style={[styles.modalBackdrop, isDesktop && styles.modalBackdropDesk]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActionsOpen(false)} />
          <View style={[styles.modalCard, isDesktop && styles.modalCardDesk]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Person</Text>
              <TouchableOpacity onPress={() => setActionsOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </TouchableOpacity>
            </View>
            {selected ? (
              <>
                <View style={styles.detailHeader}>
                  <AvatarBubble
                    photoURL={selected.photoURL}
                    avatarId={selected.avatarId}
                    name={personDisplayName(selected)}
                    size={52}
                    color={selected.color || colors.brand}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.detailName}>{personDisplayName(selected)}</Text>
                    <Text style={styles.detailMeta}>
                      {[lifeSpanLabel(selected), personMetaLine(selected)].filter(Boolean).join(' · ')
                        || 'I slektstreet'}
                    </Text>
                  </View>
                </View>

                {selected.birthday || selected.deathDate ? (
                  <View style={styles.infoGrid}>
                    {selected.birthday ? (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>Født</Text>
                        <Text style={styles.infoValue}>
                          {formatBirthday(selected.birthday, 'nb') || String(selected.birthday)}
                        </Text>
                      </View>
                    ) : null}
                    {selected.deathDate ? (
                      <View style={styles.infoItem}>
                        <Text style={styles.infoLabel}>Død</Text>
                        <Text style={styles.infoValue}>
                          {formatBirthday(selected.deathDate, 'nb') || String(selected.deathDate)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {selected.notes ? (
                  <Text style={styles.notes}>{selected.notes}</Text>
                ) : (
                  <Text style={styles.notesEmpty}>Ingen notater lagret om denne personen.</Text>
                )}

                {canManageTree && editMode ? (
                  <>
                    <Text style={styles.sectionLabel}>Hurtigvalg</Text>
                    <View style={styles.relRow}>
                      {QUICK_ADD_ACTIONS.map((r) => (
                        <TouchableOpacity
                          key={r.id}
                          onPress={() => openQuickAdd(r.id, selected)}
                          style={styles.relChip}
                        >
                          <Ionicons name={r.icon} size={14} color={colors.brand} />
                          <Text style={styles.relChipTxt}>{r.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <View style={styles.detailActions}>
                      <TouchableOpacity onPress={() => openEdit(selected)} style={styles.secondaryBtn}>
                        <Ionicons name="create-outline" size={18} color={colors.brand} />
                        <Text style={styles.secondaryBtnTxt}>Rediger</Text>
                      </TouchableOpacity>
                      {(!selected.linkedUid || selected.isExternal) ? (
                        <TouchableOpacity
                          onPress={doInviteSelected}
                          style={styles.secondaryBtn}
                          disabled={inviting}
                        >
                          <Ionicons name="mail-outline" size={18} color={colors.brand} />
                          <Text style={styles.secondaryBtnTxt}>
                            {selected.inviteStatus === 'pending' ? 'Send igjen' : 'Inviter'}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      <TouchableOpacity
                        onPress={() => {
                          setActionsOpen(false);
                          setConfirmDelete(selected);
                        }}
                        style={styles.dangerBtn}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                        <Text style={styles.dangerBtnTxt}>Fjern</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : canManageTree ? (
                  <Text style={styles.readHint}>
                    Trykk «Rediger» øverst for å endre slektstreet.
                  </Text>
                ) : null}
              </>
            ) : null}
          </View>
        </View>
      </Modal>

      {formOpen ? (
      <Modal visible animationType="slide" transparent onRequestClose={() => setFormOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, isDesktop && styles.modalCardDesk]}>
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Rediger person' : 'Ny i slektstreet'}
              </Text>
              <TouchableOpacity onPress={() => setFormOpen(false)} hitSlop={8}>
                <Ionicons name="close" size={24} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.fieldLabel}>Navn</Text>
              <TextInput
                style={styles.input}
                value={form.displayName}
                onChangeText={(displayName) => setForm((f) => ({ ...f, displayName }))}
                placeholder="F.eks. Kari Nordmann"
                placeholderTextColor={colors.placeholder}
                autoFocus
              />

              <Text style={styles.fieldLabel}>Kjønn</Text>
              <View style={styles.segRow}>
                {GENDER_OPTIONS.map((g) => {
                  const on = form.gender === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => setForm((f) => ({ ...f, gender: on ? null : g.id }))}
                      style={[styles.seg, on && styles.segOn]}
                    >
                      <Text style={[styles.segTxt, on && styles.segTxtOn]}>{g.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {!editingId ? (
                <>
                  <Text style={styles.fieldLabel}>Relasjon</Text>
                  <View style={styles.segRow}>
                    {RELATION_TYPES.map((r) => {
                      const on = form.relationType === r.id;
                      return (
                        <TouchableOpacity
                          key={r.id}
                          onPress={() => setForm((f) => ({ ...f, relationType: r.id }))}
                          style={[styles.seg, on && styles.segOn]}
                        >
                          <Text style={[styles.segTxt, on && styles.segTxtOn]}>{r.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {relativeOptions.length > 0 ? (
                    <>
                      <Text style={styles.fieldLabel}>Knyttet til</Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                        <View style={styles.segRow}>
                          <TouchableOpacity
                            onPress={() => setForm((f) => ({ ...f, relativeToId: null }))}
                            style={[styles.seg, !form.relativeToId && styles.segOn]}
                          >
                            <Text style={[styles.segTxt, !form.relativeToId && styles.segTxtOn]}>Ingen</Text>
                          </TouchableOpacity>
                          {relativeOptions.map((o) => {
                            const on = form.relativeToId === o.id;
                            return (
                              <TouchableOpacity
                                key={o.id}
                                onPress={() => setForm((f) => ({ ...f, relativeToId: o.id }))}
                                style={[styles.seg, on && styles.segOn]}
                              >
                                <Text style={[styles.segTxt, on && styles.segTxtOn]} numberOfLines={1}>
                                  {o.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </ScrollView>
                    </>
                  ) : null}
                </>
              ) : null}

              <Text style={styles.fieldLabel}>Fødselsdato</Text>
              <BirthdayPicker
                key={`birth-${editingId || 'new'}`}
                value={form.birthday}
                onChange={(birthday) => setForm((f) => {
                  const next = { ...f, birthday: birthday || '' };
                  if (birthday && f.deathDate) {
                    const born = parseBirthday(birthday);
                    const died = parseBirthday(f.deathDate);
                    if (born && died && died < born) next.deathDate = '';
                  }
                  return next;
                })}
                defaultAge={70}
                maxYearsAgo={TREE_DATE_YEARS}
                maxValue={form.deathDate || undefined}
                ageAsOf={form.deathDate || undefined}
                allowClear
                emptyLabel="Velg fødselsdato"
              />

              <Text style={styles.fieldLabel}>Dødsdato (valgfritt)</Text>
              <BirthdayPicker
                key={`death-${editingId || 'new'}`}
                value={form.deathDate}
                onChange={(deathDate) => setForm((f) => ({ ...f, deathDate: deathDate || '' }))}
                defaultAge={30}
                maxYearsAgo={TREE_DATE_YEARS}
                minValue={form.birthday || undefined}
                showAge={false}
                allowClear
                emptyLabel="Velg dødsdato"
              />

              <Text style={styles.fieldLabel}>Notat</Text>
              <TextInput
                style={[styles.input, styles.inputArea]}
                value={form.notes}
                onChangeText={(notes) => setForm((f) => ({ ...f, notes }))}
                placeholder="Valgfritt"
                placeholderTextColor={colors.placeholder}
                multiline
              />

              <View style={styles.inviteBlock}>
                <Text style={styles.inviteTitle}>Invitasjon til ProTop</Text>
                <Text style={styles.inviteSub}>
                  Personen trenger ikke være bruker. Fyll inn kontakt og slå på invitasjon
                  for å sende dem tilgang til familien.
                </Text>
                <Text style={styles.fieldLabel}>E-post</Text>
                <TextInput
                  style={styles.input}
                  value={form.email}
                  onChangeText={(email) => setForm((f) => ({ ...f, email }))}
                  placeholder="valgfritt"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <Text style={styles.fieldLabel}>Telefon</Text>
                <TextInput
                  style={styles.input}
                  value={form.phone}
                  onChangeText={(phone) => setForm((f) => ({ ...f, phone }))}
                  placeholder="+47 …"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="phone-pad"
                />
                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Send invitasjon nå</Text>
                  <Switch
                    value={!!form.sendInvite}
                    onValueChange={(sendInvite) => setForm((f) => ({ ...f, sendInvite }))}
                    trackColor={{ true: colors.brand }}
                  />
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity onPress={() => setFormOpen(false)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={saveForm}
                style={[styles.addBtn, saving && { opacity: 0.6 }]}
                disabled={saving || !form.displayName?.trim()}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.addBtnTxt}>{editingId ? 'Lagre' : 'Legg til'}</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      ) : null}

      <ConfirmActionModal
        visible={info.visible}
        title={info.title}
        body={info.message}
        confirmLabel="OK"
        cancelLabel="Lukk"
        onConfirm={() => setInfo({ visible: false, title: '', message: '' })}
        onCancel={() => setInfo({ visible: false, title: '', message: '' })}
      />

      <ConfirmActionModal
        visible={!!confirmDelete}
        title="Fjern fra treet?"
        body={
          confirmDelete
            ? `${personDisplayName(confirmDelete)} fjernes fra slektstreet. ProTop-kontoen slettes ikke.`
            : ''
        }
        confirmLabel="Fjern"
        danger
        onConfirm={doDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fg: { flex: 1, zIndex: 1, backgroundColor: 'transparent', minHeight: 0, minWidth: 0, overflow: 'hidden' },
  topBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '400',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  chromeCompact: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 6,
    gap: 6,
    flexShrink: 0,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 18,
  },
  statsLine: {
    flex: 1,
    fontSize: 12,
    fontWeight: '400',
    color: colors.muted,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#e8eef6',
    borderRadius: Platform.OS === 'web' ? 10 : radius.sm,
    padding: 2,
    gap: 2,
    flexShrink: 1,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tabOn: { backgroundColor: colors.card },
  tabTxt: { fontSize: 12, fontWeight: '400', color: colors.muted },
  tabTxtOn: { color: colors.brand },
  toolbarActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  editToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.brand,
  },
  editToggleOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  editToggleTxt: { fontSize: 13, fontWeight: '400', color: colors.brand },
  editToggleTxtOn: { color: '#fff' },
  addBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Platform.OS === 'web' ? 10 : radius.sm,
  },
  addBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'web' ? 6 : 7,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingTxt: { color: colors.muted, fontSize: 14 },
  body: { paddingHorizontal: 16, paddingBottom: 40, gap: 12, paddingTop: 4 },
  mainPane: { flex: 1, gap: 12, minWidth: 0 },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: colors.brandSoft,
    borderRadius: 10,
    padding: 10,
  },
  bannerTxt: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18 },
  treePane: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 12,
  },
  treeCard: {
    flex: 1,
    flexBasis: 0,
    minHeight: 240,
    minWidth: 0,
    width: '100%',
    maxWidth: '100%',
    backgroundColor: '#eef3f9',
    borderRadius: Platform.OS === 'web' ? 14 : radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    position: 'relative',
  },
  pedigreeCard: {
    backgroundColor: '#eef3f9',
    borderRadius: Platform.OS === 'web' ? 14 : radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    minHeight: 280,
    overflow: 'hidden',
  },
  overviewCard: { backgroundColor: colors.bg, gap: 8 },
  hintBox: {
    backgroundColor: colors.card,
    borderRadius: Platform.OS === 'web' ? 12 : radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    gap: 10,
    alignItems: 'flex-start',
  },
  hintTitle: { fontSize: 16, fontWeight: '400', color: colors.ink },
  hintBody: { fontSize: 14, color: colors.muted, lineHeight: 20 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  detailName: { fontSize: 18, fontWeight: '400', color: colors.ink },
  detailMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
  notes: {
    fontSize: 14,
    color: colors.ink,
    lineHeight: 20,
    backgroundColor: colors.bg,
    padding: 10,
    borderRadius: 8,
  },
  notesEmpty: {
    fontSize: 13,
    color: colors.muted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  infoItem: {
    flexGrow: 1,
    minWidth: '40%',
    backgroundColor: colors.bg,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: '400',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.ink,
    marginTop: 2,
  },
  readHint: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 4,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '400',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.muted,
    marginTop: 4,
  },
  relRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  relChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  relChipTxt: { fontSize: 13, fontWeight: '400', color: colors.brand },
  detailActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  secondaryBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  secondaryBtnTxt: { fontSize: 13, fontWeight: '400', color: colors.brand },
  dangerBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  dangerBtnTxt: { fontSize: 13, fontWeight: '400', color: colors.danger },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,39,68,0.45)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalBackdropDesk: {
    justifyContent: 'center',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    width: '100%',
    maxHeight: '92%',
    gap: 12,
    zIndex: 2,
  },
  modalCardDesk: {
    maxWidth: 480,
    borderRadius: 16,
    marginBottom: 40,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalTitle: { fontSize: 18, fontWeight: '400', color: colors.ink },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.muted,
    marginBottom: 6,
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'web' ? 10 : 12,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.bg,
  },
  inputArea: { minHeight: 72, textAlignVertical: 'top' },
  segRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  seg: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  segOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  segTxt: { fontSize: 13, fontWeight: '400', color: colors.muted },
  segTxtOn: { color: colors.brand },
  inviteBlock: {
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  inviteTitle: { fontSize: 14, fontWeight: '400', color: colors.ink },
  inviteSub: {
    fontSize: 13,
    color: colors.muted,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  switchLabel: { fontSize: 14, fontWeight: '400', color: colors.ink },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 8,
  },
});
