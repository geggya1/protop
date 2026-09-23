/**
 * Boligen — familiens registrerte hjem, rom, papirer og håndverkere.
 * Oversikt uten åpne felt; pluss for å registrere, blyant for standard opplysninger.
 * Internt id/collection beholdes som boligmappa / boligmapper.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert, Linking,
  ActivityIndicator, Modal, Pressable, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Screen, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer } from '../../components/ModulePageBg';
import ShellAddButton from '../../components/ShellAddButton';
import PlusActionMenu from '../../components/PlusActionMenu';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useModuleAsideSlot } from '../../src/hooks/useModuleAsideSlot';
import {
  listenBoligmapper, saveBoligmappe, archiveBoligmappe, boligSummaryLine, BOLIG_DOC_KINDS,
  CONTRACTOR_SERVICES, markBoligCarePing,
} from '../../src/utils/familyBoligmappa';
import {
  careNotificationId, careReminderCopy, holdingsForHome, itemCareParts, todayKey, watchItems,
} from '../../src/utils/boligCare';
import { adultUidsFromMembers } from '../../src/utils/birthdayPrepReminder';
import { notifyUsers } from '../../src/utils/notifications';
import BoligenCareSections from '../../components/BoligenCareSections';
import HelpTarget from '../../components/HelpTarget';

import {
  listenHoldings, saveHolding, archiveHolding, isHomeItemHolding,
} from '../../src/utils/familyHoldings';
import {
  searchKartverketAdresser,
  searchBrregEnheter,
  buildSeeiendomUrl,
  buildOsmMapUrl,
  buildBrregUrl,
  formatOrgnummer,
} from '../../src/utils/boligmappaApis';
import { pickImage, uploadImage, alertPhotoError, pickDocument, uploadFile, DEFAULT_DOCUMENT_ACCEPT } from '../../src/utils/media';
import { useDocumentScanCrop } from '../../src/hooks/useDocumentScanCrop';
import { isImageUpload } from '../../src/utils/documentScanCrop';
import { ocrReceiptWithAi, blobToDataUrl } from '../../src/utils/receiptOcr';
import {
  BOLIG_PAPER_KIND_PRIMARY,
  cleanBoligEntries,
  formatBoligPaperLine,
  suggestBoligPaperFromBilag,
} from '../../src/utils/boligPaper';

function openUrl(url) {
  if (!url) return;
  Linking.openURL(url).catch(() => Alert.alert('Feil', 'Klarte ikke åpne lenken.'));
}

function homeTitle(bolig) {
  return bolig?.title || bolig?.adressetekst || 'Bolig';
}

function SectionTitle({ children }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipOn]} onPress={onPress}>
      <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function WorkNotesField({ value, onSave }) {
  const [text, setText] = useState(value || '');
  useEffect(() => { setText(value || ''); }, [value]);
  return (
    <TextInput
      style={styles.input}
      value={text}
      onChangeText={setText}
      onBlur={() => {
        if (text !== (value || '')) onSave(text);
      }}
      placeholder="Hva har de gjort? (bad, varmepumpe, el-anlegg…)"
      placeholderTextColor={colors.placeholder}
    />
  );
}

function CollectedPapers({ items, paperKindFilter, setPaperKindFilter, paperFilter, setPaperFilter }) {
  const vendors = useMemo(() => {
    const seen = new Map();
    items.forEach((b) => {
      (b.contractors || []).forEach((c) => {
        if (!c.id || seen.has(c.id)) return;
        seen.set(c.id, { id: c.id, name: c.name, home: homeTitle(b) });
      });
    });
    return [...seen.values()];
  }, [items]);

  const rows = useMemo(() => {
    const out = [];
    items.forEach((b) => {
      (b.entries || []).forEach((e) => {
        out.push({
          ...e,
          homeId: b.id,
          homeTitle: homeTitle(b),
          vendorName: (b.contractors || []).find((c) => c.id === e.contractorId)?.name || '',
        });
      });
    });
    return out
      .filter((e) => paperKindFilter === 'all' || e.kind === paperKindFilter)
      .filter((e) => paperFilter === 'all' || e.contractorId === paperFilter);
  }, [items, paperKindFilter, paperFilter]);

  return (
    <View style={styles.card}>
      <SectionTitle>Samlede papirer</SectionTitle>
      <Mute>Tilbud, faktura og bilag fra alle boliger — filtrer på type og firma.</Mute>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="Alle typer" active={paperKindFilter === 'all'} onPress={() => setPaperKindFilter('all')} />
        {BOLIG_DOC_KINDS.map((k) => (
          <Chip
            key={k.id}
            label={k.label}
            active={paperKindFilter === k.id}
            onPress={() => setPaperKindFilter(k.id)}
          />
        ))}
      </ScrollView>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip label="Alle firma" active={paperFilter === 'all'} onPress={() => setPaperFilter('all')} />
        {vendors.map((v) => (
          <Chip
            key={v.id}
            label={items.length > 1 ? `${v.name} · ${v.home}` : v.name}
            active={paperFilter === v.id}
            onPress={() => setPaperFilter(v.id)}
          />
        ))}
      </ScrollView>
      {rows.map((e) => {
        const label = formatBoligPaperLine(e, {
          vendorName: e.vendorName,
          homeTitle: e.homeTitle,
          showHome: items.length > 1,
        });
        if (e.downloadUrl) {
          return (
            <TouchableOpacity
              key={`${e.homeId}-${e.id || e.title}`}
              onPress={() => openUrl(e.downloadUrl)}
              accessibilityRole="link"
            >
              <Text style={[styles.listLine, { color: colors.brand }]}>{label}</Text>
              <Text style={styles.rowMeta}>Trykk for å åpne / laste ned filen</Text>
            </TouchableOpacity>
          );
        }
        return (
          <Text key={`${e.homeId}-${e.id || e.title}`} style={styles.listLine}>
            {label}
          </Text>
        );
      })}
      {!rows.length ? <Mute>Ingen papirer treffer filteret.</Mute> : null}
    </View>
  );
}

function BoligenTipsCard() {
  return (
    <View style={styles.asideCard}>
      <Text style={styles.asideKicker}>Slik bruker dere Boligen</Text>
      <Text style={styles.asideLead}>
        De fleste trenger bare én bolig. Pluss for vedlikehold, papirer og håndverkere — blyant for notater.
      </Text>
      {[
        'Søk adressen når du registrerer, så fylles den inn automatisk.',
        'Legg inn startpakken, så røykvarsler og takrenner ikke blir glemt.',
        'Knytt ting til rom, garanti og bilag — og firma fra Brønnøysund.',
      ].map((tip) => (
        <View key={tip} style={styles.asideTip}>
          <View style={styles.asideDot} />
          <Text style={styles.asideTipTxt}>{tip}</Text>
        </View>
      ))}
    </View>
  );
}

export default function BoligmappaHubScreen({ inShell = false }) {
  const { familyId, uid, isParent, members, shellIntent, clearShellIntent } = useApp();
  const { isDesktop } = useLayout();
  const [items, setItems] = useState([]);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [contractorOpen, setContractorOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [panel, setPanel] = useState(null); // notes | room | item | paper
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [addressQuery, setAddressQuery] = useState('');
  const [addressHits, setAddressHits] = useState([]);
  const [addressSearching, setAddressSearching] = useState(false);
  const [addressError, setAddressError] = useState('');

  const [notes, setNotes] = useState('');
  const [roomName, setRoomName] = useState('');
  const [entryTitle, setEntryTitle] = useState('');
  const [entryKind, setEntryKind] = useState('receipt');
  const [entryNotes, setEntryNotes] = useState('');
  const [entryDateKey, setEntryDateKey] = useState('');
  const [warrantyUntil, setWarrantyUntil] = useState('');
  const [warrantyMonths, setWarrantyMonths] = useState('');
  const [warrantyText, setWarrantyText] = useState('');
  const [paperVendorId, setPaperVendorId] = useState('');
  const [paperFile, setPaperFile] = useState(null); // { downloadUrl, storagePath, mimeType, name, size, supplier, amount, currency }
  const [uploadingPaper, setUploadingPaper] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrHint, setOcrHint] = useState('');
  const [showMorePaperKinds, setShowMorePaperKinds] = useState(false);
  const [paperFilter, setPaperFilter] = useState('all');
  const [paperKindFilter, setPaperKindFilter] = useState('all');
  const [hubView, setHubView] = useState('home');
  const [itemName, setItemName] = useState('');
  const [itemRoomId, setItemRoomId] = useState('');
  const [itemWarranty, setItemWarranty] = useState('');
  const [itemPaperId, setItemPaperId] = useState('');
  const [editingItemId, setEditingItemId] = useState(null);
  const [careForm, setCareForm] = useState(null);
  const [belongings, setBelongings] = useState([]);
  const carePingRef = useRef(null);

  const [contractorQuery, setContractorQuery] = useState('');
  const [contractorHits, setContractorHits] = useState([]);
  const [contractorSearching, setContractorSearching] = useState(false);
  const [contractorRole, setContractorRole] = useState('Håndverker');

  const { prepareUpload, cropModal } = useDocumentScanCrop({
    title: 'Juster bilag',
  });

  const addressAbort = useRef(null);
  const addressSearchGen = useRef(0);
  const contractorAbort = useRef(null);
  const contractorSearchGen = useRef(0);
  const addressTimer = useRef(null);
  const contractorTimer = useRef(null);
  const pendingId = useRef(null);

  useEffect(() => {
    if (!familyId) return undefined;
    setReady(false);
    return listenBoligmapper(familyId, (list) => {
      setItems(list);
      setReady(true);
    });
  }, [familyId]);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenHoldings(familyId, (list) => {
      setBelongings(list.filter(isHomeItemHolding));
    });
  }, [familyId]);

  const selected = useMemo(
    () => items.find((b) => b.id === selectedId) || null,
    [items, selectedId],
  );

  useEffect(() => {
    if (!ready) return;
    if (!items.length) {
      pendingId.current = null;
      setSelectedId(null);
      return;
    }
    const want = pendingId.current || selectedId;
    if (want && items.some((b) => b.id === want)) {
      pendingId.current = null;
      if (selectedId !== want) setSelectedId(want);
      return;
    }
    if (pendingId.current) return;
    setSelectedId(items[0].id);
  }, [ready, items, selectedId]);

  useEffect(() => {
    if (selected) setNotes(selected.notes || '');
    else setNotes('');
  }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!familyId || !selected?.id || !isParent) return undefined;
    const items = watchItems(selected, todayKey(), belongings);
    if (!items.length) return undefined;
    const key = careNotificationId(familyId, selected.id, items);
    if (selected.carePingId === key || carePingRef.current === key) return undefined;
    const recipients = adultUidsFromMembers(members);
    if (!recipients.length) return undefined;
    carePingRef.current = key;
    const copy = careReminderCopy(homeTitle(selected), items);
    let cancelled = false;
    (async () => {
      try {
        await notifyUsers(recipients, {
          eventType: 'boligReminder',
          title: copy.title,
          body: copy.body,
          familyId,
          notificationId: key,
        });
        if (!cancelled) await markBoligCarePing(familyId, selected.id, key);
      } catch {
        if (!cancelled && carePingRef.current === key) carePingRef.current = null;
      }
    })();
    return () => { cancelled = true; };
  }, [familyId, selected, isParent, members, belongings]);

  const openRegister = useCallback(() => {
    setAddressQuery('');
    setAddressHits([]);
    setAddressError('');
    setRegisterOpen(true);
  }, []);

  const closeRegister = useCallback(() => {
    if (saving) return;
    setRegisterOpen(false);
    setAddressQuery('');
    setAddressHits([]);
    setAddressError('');
  }, [saving]);

  useEffect(() => {
    if (shellIntent !== 'create') return;
    clearShellIntent?.();
    openRegister();
  }, [shellIntent, clearShellIntent, openRegister]);

  const busyModal = registerOpen || contractorOpen || !!panel;
  const openAddMenu = useCallback(() => {
    if (!items.length) {
      openRegister();
      return;
    }
    setAddMenuOpen(true);
  }, [items.length, openRegister]);
  const addBtn = useMemo(
    () => (isParent ? (
      <ShellAddButton
        accessibilityLabel={items.length ? 'Registrer' : 'Registrer ny bolig'}
        onPress={openAddMenu}
      />
    ) : null),
    [isParent, items.length, openAddMenu],
  );
  useShellTitleRight(addBtn, { active: isParent && !busyModal });

  const aside = useMemo(() => <BoligenTipsCard />, []);
  useModuleAsideSlot(aside, { active: isDesktop && inShell && isParent });

  const runAddressSearch = useCallback(async (q) => {
    addressAbort.current?.abort?.();
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    addressAbort.current = ctrl;
    const gen = ++addressSearchGen.current;
    setAddressSearching(true);
    setAddressError('');
    try {
      const { results } = await searchKartverketAdresser(q, { signal: ctrl?.signal });
      if (gen !== addressSearchGen.current) return;
      setAddressHits(results);
    } catch (e) {
      if (e?.name === 'AbortError' || gen !== addressSearchGen.current) return;
      setAddressHits([]);
      setAddressError('Klarte ikke søke adresse. Sjekk nettverket, eller registrer manuelt.');
    } finally {
      if (gen === addressSearchGen.current) setAddressSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!registerOpen) return undefined;
    const q = addressQuery.trim();
    if (q.length < 2) {
      addressAbort.current?.abort?.();
      addressSearchGen.current += 1;
      setAddressHits([]);
      setAddressSearching(false);
      setAddressError('');
      return undefined;
    }
    clearTimeout(addressTimer.current);
    addressTimer.current = setTimeout(() => runAddressSearch(q), 350);
    return () => clearTimeout(addressTimer.current);
  }, [addressQuery, registerOpen, runAddressSearch]);

  const persist = useCallback(async (payload, { id = selectedId } = {}) => {
    if (!familyId) return null;
    setSaving(true);
    try {
      const savedId = await saveBoligmappe(familyId, id, payload, uid);
      pendingId.current = savedId;
      setSelectedId(savedId);
      return savedId;
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre.');
      return null;
    } finally {
      setSaving(false);
    }
  }, [familyId, selectedId, uid]);

  const registerAddress = useCallback(async (hit) => {
    if (!hit || saving) return;
    const id = await persist({
      title: hit.adressetekst || hit.label,
      adressetekst: hit.adressetekst || hit.label,
      postnummer: hit.postnummer || '',
      poststed: hit.poststed || '',
      label: hit.label || hit.adressetekst,
      notes: '',
      photoUrl: null,
      photoPath: null,
      matrikkel: hit.matrikkel || null,
      matrikkelnummertekst: hit.matrikkelnummertekst || '',
      bruksenhetsnummer: hit.bruksenhetsnummer || [],
      lat: hit.lat ?? null,
      lon: hit.lon ?? null,
      rooms: [],
      contractors: [],
      entries: [],
    }, { id: null });
    if (id) {
      setRegisterOpen(false);
      setAddressQuery('');
      setAddressHits([]);
      setAddressError('');
    }
  }, [saving, persist]);

  const registerTypedAddress = useCallback(async () => {
    const label = addressQuery.trim();
    if (label.length < 3 || saving) return;
    await registerAddress({
      adressetekst: label,
      label,
      postnummer: '',
      poststed: '',
      matrikkel: null,
      matrikkelnummertekst: '',
      bruksenhetsnummer: [],
      lat: null,
      lon: null,
      source: 'manual',
    });
  }, [addressQuery, saving, registerAddress]);

  const openPanel = useCallback((kind) => {
    if (kind === 'notes' && selected) setNotes(selected.notes || '');
    if (kind === 'room') setRoomName('');
    if (kind === 'item') {
      setEditingItemId(null);
      setItemName('');
      setItemRoomId('');
      setItemWarranty('');
      setItemPaperId('');
    }
    if (kind === 'paper') {
      setEntryTitle('');
      setEntryKind('receipt');
      setEntryNotes('');
      setEntryDateKey('');
      setWarrantyUntil('');
      setWarrantyMonths('');
      setWarrantyText('');
      setPaperVendorId('');
      setPaperFile(null);
      setOcrHint('');
      setShowMorePaperKinds(false);
    }
    setPanel(kind);
  }, [selected]);

  const closePanel = useCallback(() => {
    if (saving || uploadingPaper || ocrBusy) return;
    setPaperFile(null);
    setOcrHint('');
    setPanel(null);
  }, [saving, uploadingPaper, ocrBusy]);

  const resetPaperForm = useCallback(() => {
    setEntryTitle('');
    setEntryNotes('');
    setEntryDateKey('');
    setWarrantyUntil('');
    setWarrantyMonths('');
    setWarrantyText('');
    setPaperFile(null);
    setOcrHint('');
  }, []);

  const applyOcrSuggestion = useCallback((bilag) => {
    const suggestion = suggestBoligPaperFromBilag(bilag);
    if (suggestion.title) setEntryTitle(suggestion.title);
    if (suggestion.notes) setEntryNotes(suggestion.notes);
    if (suggestion.dateKey) setEntryDateKey(suggestion.dateKey);
    if (suggestion.warrantyUntil) setWarrantyUntil(suggestion.warrantyUntil);
    if (suggestion.warrantyMonths != null) setWarrantyMonths(String(suggestion.warrantyMonths));
    if (suggestion.warrantyText) setWarrantyText(suggestion.warrantyText);
    setPaperFile((prev) => (prev ? {
      ...prev,
      supplier: suggestion.supplier,
      amount: suggestion.amount,
      currency: suggestion.currency,
    } : prev));
    setOcrHint('Forslag fra tolking — juster gjerne før du legger til.');
  }, []);

  const saveSelectedNotes = useCallback(async () => {
    if (!selected) return;
    await persist({ ...selected, notes });
    setPanel(null);
  }, [selected, notes, persist]);

  const addRoom = useCallback(async () => {
    if (!selected || !roomName.trim()) return;
    const rooms = [...(selected.rooms || []), { name: roomName.trim() }];
    setRoomName('');
    await persist({ ...selected, notes: selected.notes || '', rooms });
    setPanel(null);
  }, [selected, roomName, persist]);

  const addEntry = useCallback(async () => {
    if (!selected) return;
    const title = entryTitle.trim()
      || paperFile?.name
      || (paperFile ? 'Bilag' : '');
    if (!title && !paperFile) return;
    const monthsNum = warrantyMonths !== '' ? Number(warrantyMonths) : null;
    const entries = cleanBoligEntries([
      ...(selected.entries || []),
      {
        id: `entry_${Date.now()}`,
        kind: entryKind,
        title,
        notes: entryNotes.trim(),
        dateKey: entryDateKey.trim() || null,
        contractorId: paperVendorId || null,
        warrantyUntil: warrantyUntil.trim() || null,
        warrantyMonths: Number.isFinite(monthsNum) && monthsNum > 0 ? monthsNum : null,
        warrantyText: warrantyText.trim() || null,
        supplier: paperFile?.supplier || null,
        amount: paperFile?.amount ?? null,
        currency: paperFile?.currency || null,
        ...(paperFile ? {
          downloadUrl: paperFile.downloadUrl,
          storagePath: paperFile.storagePath,
          mimeType: paperFile.mimeType || null,
          fileName: paperFile.name || null,
          size: paperFile.size || null,
        } : {}),
      },
    ]);
    resetPaperForm();
    await persist({ ...selected, notes: selected.notes || '', entries });
    setPanel(null);
  }, [
    selected, entryTitle, entryKind, entryNotes, entryDateKey, paperVendorId,
    paperFile, warrantyUntil, warrantyMonths, warrantyText, persist, resetPaperForm,
  ]);

  const pickPaperFile = useCallback(async () => {
    if (!familyId || !selected?.id || uploadingPaper || ocrBusy) return;
    try {
      const picked = await pickDocument({ accept: DEFAULT_DOCUMENT_ACCEPT });
      if (!picked) return;
      const ready = await prepareUpload(picked);
      if (!ready) return;
      setUploadingPaper(true);
      setOcrHint('');
      const name = ready.name || picked.name || `bilag-${Date.now()}`;
      const safe = String(name).replace(/[^\w.\-()+ ]/g, '_');
      const path = `families/${familyId}/bolig-files/${selected.id}/${Date.now()}-${safe}`;
      const mimeType = ready.mimeType || picked.mimeType || null;
      const downloadUrl = await uploadFile(path, ready, mimeType);
      const fileMeta = {
        downloadUrl,
        storagePath: path,
        mimeType,
        name,
        size: ready.size || picked.size || null,
      };
      setPaperFile(fileMeta);
      if (!entryTitle.trim()) {
        setEntryTitle(String(name).replace(/\.[^.]+$/, '').slice(0, 120));
      }

      const shouldOcr = isImageUpload(ready) || isImageUpload(picked)
        || String(mimeType || '').startsWith('image/')
        || String(mimeType || '') === 'application/pdf';
      if (shouldOcr) {
        setOcrBusy(true);
        setOcrHint('Tolker bilaget…');
        try {
          let imageBase64 = '';
          if (ready?.blob) {
            imageBase64 = await blobToDataUrl(ready.blob);
          }
          const { bilag } = await ocrReceiptWithAi(familyId, {
            storagePath: path,
            imageBase64,
            hint: name,
          });
          applyOcrSuggestion(bilag);
        } catch (ocrErr) {
          setOcrHint(ocrErr?.message
            ? `Tolking feilet: ${ocrErr.message}`
            : 'Tolking feilet — fyll inn manuelt.');
        } finally {
          setOcrBusy(false);
        }
      }

      if (ready.revoke && ready.uri && typeof URL !== 'undefined') {
        try { URL.revokeObjectURL(ready.uri); } catch { /* ignore */ }
      }
    } catch (e) {
      Alert.alert('Opplasting feilet', e?.message || 'Klarte ikke laste opp filen.');
    } finally {
      setUploadingPaper(false);
    }
  }, [
    familyId, selected, uploadingPaper, ocrBusy, prepareUpload,
    entryTitle, applyOcrSuggestion,
  ]);

  const saveBelonging = useCallback(async () => {
    if (!familyId || !itemName.trim()) return;
    const existing = belongings.find((row) => row.id === editingItemId) || {};
    await saveHolding(familyId, editingItemId, {
      ...existing,
      title: itemName.trim(),
      kind: 'item',
      emoji: existing.emoji || '📦',
      roomId: itemRoomId || null,
      warrantyUntil: itemWarranty.trim() || null,
      linkedEntryId: itemPaperId || null,
      boligId: existing.boligId || selected?.id || null,
    }, uid);
    setItemName('');
    setItemRoomId('');
    setItemWarranty('');
    setItemPaperId('');
    setEditingItemId(null);
    setPanel(null);
  }, [familyId, itemName, itemRoomId, itemWarranty, itemPaperId, editingItemId, belongings, selected?.id, uid]);

  const openItemEditor = useCallback((holding) => {
    setEditingItemId(holding?.id || null);
    setItemName(holding?.title || '');
    setItemRoomId(holding?.roomId || '');
    setItemWarranty(holding?.warrantyUntil || '');
    setItemPaperId(holding?.linkedEntryId || '');
    setPanel('item');
  }, []);

  const uploadHomePhoto = useCallback(async () => {
    if (!familyId || !selected?.id || uploadingPhoto) return;
    try {
      const picked = await pickImage({ edit: true, aspect: [16, 10] });
      if (!picked) return;
      setUploadingPhoto(true);
      const path = `families/${familyId}/bolig-photos/${selected.id}/${Date.now()}.jpg`;
      const photoUrl = await uploadImage(path, picked);
      await persist({ ...selected, photoUrl, photoPath: path });
    } catch (e) {
      alertPhotoError(e);
    } finally {
      setUploadingPhoto(false);
    }
  }, [familyId, selected, uploadingPhoto, persist]);

  const patchContractor = useCallback(async (contractor, patch) => {
    if (!selected) return;
    const contractors = (selected.contractors || []).map((c) => (
      c.id === contractor.id ? { ...c, ...patch } : c
    ));
    await persist({ ...selected, notes: selected.notes || '', contractors });
  }, [selected, persist]);

  const toggleContractorService = useCallback(async (contractor, service) => {
    if (!selected) return;
    const current = contractor.services || [];
    const services = current.includes(service)
      ? current.filter((s) => s !== service)
      : [...current, service];
    await patchContractor(contractor, { services, role: services[0] || contractor.role });
  }, [selected, patchContractor]);

  const runContractorSearch = useCallback(async (q) => {
    contractorAbort.current?.abort?.();
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    contractorAbort.current = ctrl;
    const gen = ++contractorSearchGen.current;
    setContractorSearching(true);
    try {
      const { results } = await searchBrregEnheter(q, { signal: ctrl?.signal });
      if (gen !== contractorSearchGen.current) return;
      setContractorHits(results);
    } catch (e) {
      if (e?.name === 'AbortError' || gen !== contractorSearchGen.current) return;
      setContractorHits([]);
    } finally {
      if (gen === contractorSearchGen.current) setContractorSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!contractorOpen) return undefined;
    const q = contractorQuery.trim();
    if (q.length < 2) {
      setContractorHits([]);
      return undefined;
    }
    clearTimeout(contractorTimer.current);
    contractorTimer.current = setTimeout(() => runContractorSearch(q), 350);
    return () => clearTimeout(contractorTimer.current);
  }, [contractorQuery, contractorOpen, runContractorSearch]);

  const addContractor = useCallback(async (enhet) => {
    if (!selected || !enhet) return;
    const contractors = [
      ...(selected.contractors || []),
      {
        name: enhet.navn,
        organisasjonsnummer: enhet.organisasjonsnummer,
        role: contractorRole.trim() || 'Håndverker',
        services: [contractorRole.trim() || 'Håndverker'],
        email: enhet.epostadresse || '',
        source: 'brreg',
      },
    ];
    const id = await persist({ ...selected, notes: selected.notes || '', contractors });
    if (id) {
      setContractorOpen(false);
      setContractorQuery('');
      setContractorHits([]);
    }
  }, [selected, contractorRole, persist]);

  const removeContractor = useCallback(async (contractorId) => {
    if (!selected) return;
    const contractors = (selected.contractors || []).filter((c) => c.id !== contractorId);
    await persist({ ...selected, notes: selected.notes || '', contractors });
  }, [selected, persist]);

  const confirmArchive = useCallback((bolig) => {
    Alert.alert('Fjern bolig?', homeTitle(bolig), [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Fjern',
        style: 'destructive',
        onPress: async () => {
          await archiveBoligmappe(familyId, bolig.id);
          if (selectedId === bolig.id) {
            const next = items.find((b) => b.id !== bolig.id);
            setSelectedId(next?.id || null);
          }
        },
      },
    ]);
  }, [familyId, selectedId, items]);

  const closeContractor = useCallback(() => {
    if (saving) return;
    setContractorOpen(false);
    setContractorQuery('');
    setContractorHits([]);
  }, [saving]);

  const addMenuItems = useMemo(() => ([
    {
      id: 'task',
      icon: 'checkbox-outline',
      label: 'Ny vedlikeholdsoppgave',
      hint: 'Noe som bør gjøres, og komme tilbake',
      onPress: () => setCareForm('task'),
    },
    {
      id: 'system',
      icon: 'hardware-chip-outline',
      label: 'Nytt anlegg',
      hint: 'Varmepumpe, bereder, sikringsskap',
      onPress: () => setCareForm('system'),
    },
    {
      id: 'issue',
      icon: 'alert-circle-outline',
      label: 'Noe å fikse',
      hint: 'Lekkasje eller noe som er i ustand',
      onPress: () => setCareForm('issue'),
    },
    {
      id: 'room',
      icon: 'grid-outline',
      label: 'Nytt rom',
      hint: 'F.eks. bad, kjøkken, soverom',
      onPress: () => openPanel('room'),
    },
    {
      id: 'item',
      icon: 'cube-outline',
      label: 'Ny ting i boligen',
      hint: 'Møbler, hvitevarer og annet',
      onPress: () => openPanel('item'),
    },
    {
      id: 'paper',
      icon: 'receipt-outline',
      label: 'Nytt bilag',
      hint: 'Last opp kvittering — AI foreslår tittel og garanti',
      onPress: () => openPanel('paper'),
    },
    {
      id: 'contractor',
      icon: 'hammer-outline',
      label: 'Ny håndverker',
      hint: 'Søk firma i Brønnøysund',
      onPress: () => {
        setContractorQuery('');
        setContractorHits([]);
        setContractorOpen(true);
      },
    },
    {
      id: 'info',
      icon: 'document-text-outline',
      label: 'Nye opplysninger',
      hint: 'Notater og øvrige detaljer',
      onPress: () => openPanel('notes'),
    },
    {
      id: 'home',
      icon: 'home-outline',
      label: 'Registrer ny bolig',
      hint: 'Unntak — de fleste trenger bare én',
      onPress: openRegister,
    },
  ]), [openPanel, openRegister]);

  if (!isParent) {
    return (
      <Screen>
        <View style={styles.body}><Mute>Kun foresatte.</Mute></View>
      </Screen>
    );
  }

  const detail = selected;
  const matrikkel = detail?.matrikkel || {};
  const seeUrl = detail ? buildSeeiendomUrl(matrikkel) : null;
  const mapUrl = detail ? buildOsmMapUrl(detail.lat, detail.lon) : null;
  const panelTitle = {
    notes: 'Standard opplysninger',
    room: 'Nytt rom',
    item: editingItemId ? 'Knytt tingen' : 'Ny ting i boligen',
    paper: 'Nytt bilag',
  }[panel] || '';
  const homeItems = holdingsForHome(belongings, selected?.id);

  return (
    <Screen>
      <ModulePageFrame name="boligmappa">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {!inShell ? <Text style={styles.title}>Boligen</Text> : null}

        {!ready ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.loadingTxt}>Laster bolig…</Text>
          </View>
        ) : null}

        {ready && !items.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ingen bolig registrert ennå</Text>
            <Text style={styles.emptySub}>
              Registrer hjemmet. Deretter passer Boligen på garanti, service og det som bør gjøres.
            </Text>
            <HelpTarget id="add" style={{ alignSelf: 'stretch' }}>
              <TouchableOpacity
                style={styles.emptyCta}
                onPress={openRegister}
                accessibilityRole="button"
                accessibilityLabel="Registrer ny bolig"
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.emptyCtaTxt}>Registrer ny bolig</Text>
              </TouchableOpacity>
            </HelpTarget>
          </View>
        ) : null}

        {ready && items.length ? (
          <View style={styles.chipRow}>
            <Chip label="Boligen" active={hubView === 'home'} onPress={() => setHubView('home')} />
            <Chip label="Alle papirer" active={hubView === 'papers'} onPress={() => setHubView('papers')} />
          </View>
        ) : null}

        {ready && hubView === 'papers' && items.length ? (
          <CollectedPapers
            items={items}
            paperKindFilter={paperKindFilter}
            setPaperKindFilter={setPaperKindFilter}
            paperFilter={paperFilter}
            setPaperFilter={setPaperFilter}
          />
        ) : null}

        {ready && items.length > 1 && hubView === 'home' ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.switcher}
          >
            {items.map((b) => {
              const on = b.id === selectedId;
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[styles.switchChip, on && styles.switchChipOn]}
                  onPress={() => setSelectedId(b.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.switchChipTxt, on && styles.switchChipTxtOn]} numberOfLines={1}>
                    {homeTitle(b)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        {hubView === 'home' && detail ? (
          <>
            <View style={styles.card}>
              <View style={styles.homeHead}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailTitle}>{homeTitle(detail)}</Text>
                  {!!boligSummaryLine(detail) && boligSummaryLine(detail) !== homeTitle(detail) ? (
                    <Text style={styles.rowMeta}>{boligSummaryLine(detail)}</Text>
                  ) : null}
                </View>
                <TouchableOpacity
                  style={styles.pencilBtn}
                  onPress={() => openPanel('notes')}
                  accessibilityLabel="Rediger standard opplysninger"
                >
                  <Ionicons name="pencil" size={18} color={colors.brand} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => confirmArchive(detail)}
                  hitSlop={8}
                  accessibilityLabel="Fjern bolig"
                >
                  <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={styles.photoBox}
                onPress={uploadHomePhoto}
                disabled={uploadingPhoto}
                accessibilityLabel={detail.photoUrl ? 'Bytt bilde' : 'Legg til bilde'}
              >
                {detail.photoUrl ? (
                  <Image source={{ uri: detail.photoUrl }} style={styles.photoImg} resizeMode="cover" />
                ) : (
                  <View style={styles.photoEmpty}>
                    <Ionicons name="camera-outline" size={28} color={colors.brand} />
                    <Text style={styles.photoEmptyTxt}>
                      {uploadingPhoto ? 'Laster opp…' : 'Legg til bilde av boligen'}
                    </Text>
                  </View>
                )}
                {detail.photoUrl ? (
                  <View style={styles.photoBadge}>
                    <Ionicons name="camera" size={14} color="#fff" />
                    <Text style={styles.photoBadgeTxt}>{uploadingPhoto ? '…' : 'Bytt'}</Text>
                  </View>
                ) : null}
              </TouchableOpacity>

              <View style={styles.metaGrid}>
                <Text style={styles.metaLabel}>Kommune</Text>
                <Text style={styles.metaValue}>
                  {[matrikkel.kommunenummer, matrikkel.kommunenavn].filter(Boolean).join(' · ') || '—'}
                </Text>
                <Text style={styles.metaLabel}>Gårdsnr / bruksnr</Text>
                <Text style={styles.metaValue}>
                  {detail.matrikkelnummertekst
                    ? `${matrikkel.kommunenummer || '?'}/${detail.matrikkelnummertekst}`
                    : '—'}
                </Text>
                <Text style={styles.metaLabel}>Post</Text>
                <Text style={styles.metaValue}>
                  {[detail.postnummer, detail.poststed].filter(Boolean).join(' ') || '—'}
                </Text>
                {detail.bruksenhetsnummer?.length ? (
                  <>
                    <Text style={styles.metaLabel}>Bruksenheter</Text>
                    <Text style={styles.metaValue}>{detail.bruksenhetsnummer.join(', ')}</Text>
                  </>
                ) : null}
              </View>

              <View style={styles.linkRow}>
                {seeUrl ? (
                  <TouchableOpacity style={styles.linkBtn} onPress={() => openUrl(seeUrl)}>
                    <Ionicons name="map-outline" size={16} color={colors.brand} />
                    <Text style={styles.linkTxt}>Seeiendom</Text>
                  </TouchableOpacity>
                ) : null}
                {mapUrl ? (
                  <TouchableOpacity style={styles.linkBtn} onPress={() => openUrl(mapUrl)}>
                    <Ionicons name="navigate-outline" size={16} color={colors.brand} />
                    <Text style={styles.linkTxt}>Kart</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              {detail.notes ? (
                <View style={{ marginTop: 8 }}>
                  <Text style={styles.smallLabel}>Notater</Text>
                  <Text style={styles.notesRead}>{detail.notes}</Text>
                </View>
              ) : (
                <Mute>Ingen notater ennå — trykk blyanten for å legge til.</Mute>
              )}
            </View>

            <BoligenCareSections
              bolig={selected}
              holdings={belongings}
              saving={saving}
              formRequest={careForm}
              onFormHandled={() => setCareForm(null)}
              onSave={(patch) => persist({ ...selected, notes: selected.notes || '', ...patch })}
            />

            <View style={styles.card}>
              <SectionTitle>Rom</SectionTitle>
              {(selected.rooms || []).map((r) => (
                <Text key={r.id} style={styles.listLine}>• {r.name}</Text>
              ))}
              {!selected.rooms?.length ? (
                <Mute>Ingen rom ennå — bruk + for å legge til.</Mute>
              ) : null}
            </View>

            <View style={styles.card}>
              <SectionTitle>Ting i boligen</SectionTitle>
              <Mute>Møbler og hvitevarer — knytt dem til rom, garanti og bilag.</Mute>
              {homeItems.map((h) => {
                const parts = itemCareParts(h, selected);
                return (
                  <View key={h.id} style={styles.belongRow}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => openItemEditor(h)}>
                      <Text style={styles.listLine}>📦 {h.title}</Text>
                      {parts.length ? <Text style={styles.rowMeta}>{parts.join(' · ')}</Text> : null}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => archiveHolding(familyId, h.id)} hitSlop={8}>
                      <Ionicons name="trash-outline" size={16} color="#b91c1c" />
                    </TouchableOpacity>
                  </View>
                );
              })}
              {!homeItems.length ? (
                <Mute>Ingen ting ennå — bruk + for å legge til.</Mute>
              ) : null}
            </View>

            <View style={styles.card}>
              <SectionTitle>Papirer</SectionTitle>
              {(selected.entries || []).length ? (
                <>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    <Chip
                      label="Alle papirer"
                      active={paperKindFilter === 'all'}
                      onPress={() => setPaperKindFilter('all')}
                    />
                    {BOLIG_DOC_KINDS.map((k) => (
                      <Chip
                        key={`f-${k.id}`}
                        label={k.label}
                        active={paperKindFilter === k.id}
                        onPress={() => setPaperKindFilter(k.id)}
                      />
                    ))}
                  </ScrollView>
                  {(selected.entries || [])
                    .filter((e) => paperFilter === 'all' || e.contractorId === paperFilter)
                    .filter((e) => paperKindFilter === 'all' || e.kind === paperKindFilter)
                    .map((e) => {
                      const vendor = (selected.contractors || []).find((c) => c.id === e.contractorId);
                      const label = formatBoligPaperLine(e, { vendorName: vendor?.name || '' });
                      if (e.downloadUrl) {
                        return (
                          <TouchableOpacity
                            key={e.id || `${e.title}-${e.kind}`}
                            onPress={() => openUrl(e.downloadUrl)}
                            accessibilityRole="link"
                            style={{ gap: 2 }}
                          >
                            <Text style={[styles.listLine, { color: colors.brand }]}>{label}</Text>
                            <Text style={styles.rowMeta}>
                              {[e.notes ? e.notes.split('\n')[0].slice(0, 80) : null, 'Åpne / last ned']
                                .filter(Boolean)
                                .join(' · ')}
                            </Text>
                          </TouchableOpacity>
                        );
                      }
                      return (
                        <View key={e.id || `${e.title}-${e.kind}`} style={{ gap: 2 }}>
                          <Text style={styles.listLine}>{label}</Text>
                          {e.notes ? (
                            <Text style={styles.rowMeta}>{e.notes.split('\n')[0].slice(0, 80)}</Text>
                          ) : null}
                        </View>
                      );
                    })}
                </>
              ) : (
                <Mute>Ingen papirer ennå — bruk + for å laste opp bilag.</Mute>
              )}
            </View>

            <View style={styles.card}>
              <SectionTitle>Håndverkere</SectionTitle>
              {(selected.contractors || []).map((c) => (
                <View key={c.id} style={styles.contractorRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{c.name}</Text>
                    <Text style={styles.rowMeta}>
                      {[c.organisasjonsnummer ? formatOrgnummer(c.organisasjonsnummer) : null]
                        .filter(Boolean)
                        .join(' · ')}
                    </Text>
                    {(c.services || []).length ? (
                      <Text style={styles.rowMeta}>{(c.services || []).join(' · ')}</Text>
                    ) : null}
                    {c.workNotes ? (
                      <Text style={styles.notesRead}>{c.workNotes}</Text>
                    ) : null}
                    <View style={styles.chipRow}>
                      {CONTRACTOR_SERVICES.map((s) => {
                        const on = (c.services || []).includes(s);
                        return (
                          <TouchableOpacity
                            key={s}
                            style={[styles.miniChip, on && styles.miniChipOn]}
                            onPress={() => toggleContractorService(c, s)}
                          >
                            <Text style={[styles.miniChipTxt, on && styles.miniChipTxtOn]}>{s}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <WorkNotesField
                      value={c.workNotes || ''}
                      onSave={(workNotes) => patchContractor(c, { workNotes })}
                    />
                  </View>
                  {c.organisasjonsnummer ? (
                    <TouchableOpacity
                      onPress={() => openUrl(buildBrregUrl(c.organisasjonsnummer))}
                      hitSlop={8}
                      style={{ marginRight: 8 }}
                    >
                      <Ionicons name="open-outline" size={18} color={colors.brand} />
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity onPress={() => removeContractor(c.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                  </TouchableOpacity>
                </View>
              ))}
              {!selected.contractors?.length ? (
                <Mute>Ingen håndverkere ennå — bruk + for å søke firma.</Mute>
              ) : null}
            </View>
          </>
        ) : null}

        <View style={{ height: 40 }} />
      <ModuleBgSpacer />
      </ScrollView>
      </ModulePageFrame>

      <PlusActionMenu
        visible={addMenuOpen}
        title="Hva vil du registrere?"
        subtitle={detail ? homeTitle(detail) : undefined}
        items={addMenuItems}
        onClose={() => setAddMenuOpen(false)}
      />

      <Modal
        visible={!!panel}
        transparent
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={closePanel}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={closePanel}
        >
          <Pressable
            style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
            onPress={(e) => e.stopPropagation?.()}
          >
            {!isDesktop ? <View style={styles.sheetHandle} /> : null}
            <Text style={styles.modalTitle}>{panelTitle}</Text>
            {panel === 'notes' ? (
              <>
                <Mute>Notater om boligen — varmepumpe, sikringsskap, forsikring med mer.</Mute>
                <TextInput
                  style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
                  value={notes}
                  onChangeText={setNotes}
                  placeholder="F.eks. varmepumpe, sikringsskap, forsikring…"
                  placeholderTextColor={colors.placeholder}
                  multiline
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={closePanel} disabled={saving}>
                    <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.primaryBtn} onPress={saveSelectedNotes} disabled={saving}>
                    <Text style={styles.primaryBtnTxt}>{saving ? 'Lagrer…' : 'Lagre'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
            {panel === 'room' ? (
              <>
                <TextInput
                  style={styles.input}
                  value={roomName}
                  onChangeText={setRoomName}
                  placeholder="F.eks. Bad 1. etasje"
                  placeholderTextColor={colors.placeholder}
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={closePanel} disabled={saving}>
                    <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={addRoom}
                    disabled={saving || !roomName.trim()}
                  >
                    <Text style={styles.primaryBtnTxt}>{saving ? 'Lagrer…' : 'Legg til'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
            {panel === 'item' ? (
              <>
                <TextInput
                  style={styles.input}
                  value={itemName}
                  onChangeText={setItemName}
                  placeholder="F.eks. Vaskemaskin"
                  placeholderTextColor={colors.placeholder}
                />
                {(selected?.rooms || []).length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    <Chip label="Uten rom" active={!itemRoomId} onPress={() => setItemRoomId('')} />
                    {(selected.rooms || []).map((room) => (
                      <Chip
                        key={room.id}
                        label={room.name}
                        active={itemRoomId === room.id}
                        onPress={() => setItemRoomId(room.id)}
                      />
                    ))}
                  </ScrollView>
                ) : (
                  <Mute>Legg til rom først hvis tingen skal høre til et sted.</Mute>
                )}
                <TextInput
                  style={styles.input}
                  value={itemWarranty}
                  onChangeText={setItemWarranty}
                  placeholder="Garanti til (ÅÅÅÅ-MM-DD)"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                />
                {(selected?.entries || []).length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    <Chip label="Uten bilag" active={!itemPaperId} onPress={() => setItemPaperId('')} />
                    {(selected.entries || []).map((entry) => (
                      <Chip
                        key={entry.id}
                        label={entry.title || 'Papir'}
                        active={itemPaperId === entry.id}
                        onPress={() => setItemPaperId(entry.id)}
                      />
                    ))}
                  </ScrollView>
                ) : null}
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.secondaryBtn} onPress={closePanel}>
                    <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={saveBelonging}
                    disabled={!itemName.trim()}
                  >
                    <Text style={styles.primaryBtnTxt}>{editingItemId ? 'Lagre' : 'Legg til'}</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}
            {panel === 'paper' ? (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                style={{ maxHeight: isDesktop ? 520 : 440 }}
                contentContainerStyle={{ paddingBottom: 8 }}
              >
                <Mute>
                  Last opp kvittering eller PDF først — vi foreslår tittel, innhold og garanti. Du kan justere før lagring.
                </Mute>
                <TouchableOpacity
                  style={[styles.secondaryBtn, { marginTop: 10, flex: 0 }]}
                  onPress={pickPaperFile}
                  disabled={uploadingPaper || ocrBusy || saving}
                >
                  {uploadingPaper || ocrBusy ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <ActivityIndicator color={colors.brand} />
                      <Text style={styles.secondaryBtnTxt}>
                        {uploadingPaper ? 'Laster opp…' : 'Tolker…'}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.secondaryBtnTxt}>
                      {paperFile ? `Vedlagt: ${paperFile.name}` : 'Last opp bilde / PDF'}
                    </Text>
                  )}
                </TouchableOpacity>
                {paperFile ? (
                  <TouchableOpacity
                    onPress={() => {
                      setPaperFile(null);
                      setOcrHint('');
                    }}
                    style={{ marginTop: 6 }}
                    disabled={uploadingPaper || ocrBusy}
                  >
                    <Text style={[styles.rowMeta, { color: colors.brand }]}>Fjern vedlegg</Text>
                  </TouchableOpacity>
                ) : null}
                {ocrHint ? <Mute>{ocrHint}</Mute> : null}

                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Type</Text>
                <View style={styles.chipRow}>
                  {(showMorePaperKinds
                    ? BOLIG_DOC_KINDS
                    : BOLIG_DOC_KINDS.filter((k) => BOLIG_PAPER_KIND_PRIMARY.includes(k.id))
                  ).map((k) => (
                    <Chip
                      key={k.id}
                      label={`${k.emoji} ${k.label}`}
                      active={entryKind === k.id}
                      onPress={() => setEntryKind(k.id)}
                    />
                  ))}
                  <Chip
                    label={showMorePaperKinds ? 'Færre' : 'Flere typer'}
                    active={false}
                    onPress={() => setShowMorePaperKinds((v) => !v)}
                  />
                </View>

                {(selected?.contractors || []).length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    <Chip
                      label="Uten firma"
                      active={!paperVendorId}
                      onPress={() => setPaperVendorId('')}
                    />
                    {(selected.contractors || []).map((c) => (
                      <Chip
                        key={`v-${c.id}`}
                        label={`Knytt til ${c.name}`}
                        active={paperVendorId === c.id}
                        onPress={() => setPaperVendorId(c.id)}
                      />
                    ))}
                  </ScrollView>
                ) : null}

                <Text style={styles.fieldLabel}>Tittel</Text>
                <TextInput
                  style={styles.input}
                  value={entryTitle}
                  onChangeText={setEntryTitle}
                  placeholder="F.eks. Kvittering bad"
                  placeholderTextColor={colors.placeholder}
                />

                <Text style={styles.fieldLabel}>Innhold / notat</Text>
                <TextInput
                  style={[styles.input, { minHeight: 72, textAlignVertical: 'top' }]}
                  value={entryNotes}
                  onChangeText={setEntryNotes}
                  placeholder="Hva bilaget gjelder (fylles gjerne automatisk)"
                  placeholderTextColor={colors.placeholder}
                  multiline
                />

                <Text style={styles.fieldLabel}>Dato (ÅÅÅÅ-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={entryDateKey}
                  onChangeText={setEntryDateKey}
                  placeholder="Valgfritt"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                />

                <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Garanti</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={warrantyMonths}
                    onChangeText={setWarrantyMonths}
                    placeholder="Mnd"
                    placeholderTextColor={colors.placeholder}
                    keyboardType="number-pad"
                  />
                  <TextInput
                    style={[styles.input, { flex: 2 }]}
                    value={warrantyUntil}
                    onChangeText={setWarrantyUntil}
                    placeholder="Til dato (ÅÅÅÅ-MM-DD)"
                    placeholderTextColor={colors.placeholder}
                    autoCapitalize="none"
                  />
                </View>
                <TextInput
                  style={styles.input}
                  value={warrantyText}
                  onChangeText={setWarrantyText}
                  placeholder="Garantiinfo (valgfritt)"
                  placeholderTextColor={colors.placeholder}
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={closePanel}
                    disabled={saving || uploadingPaper || ocrBusy}
                  >
                    <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={addEntry}
                    disabled={
                      saving
                      || uploadingPaper
                      || ocrBusy
                      || (!entryTitle.trim() && !paperFile)
                    }
                  >
                    <Text style={styles.primaryBtnTxt}>{saving ? 'Lagrer…' : 'Legg til'}</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={registerOpen}
        transparent
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={closeRegister}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={closeRegister}
        >
          <Pressable
            style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
            onPress={(e) => e.stopPropagation?.()}
          >
            {!isDesktop ? <View style={styles.sheetHandle} /> : null}
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Registrer ny bolig</Text>
              <TouchableOpacity onPress={closeRegister} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <Mute>Søk adresse hos Kartverket — vi fyller inn matrikkel automatisk. Oppgi gjerne sted eller postnr hvis det finnes flere like gatenavn.</Mute>
            <Text style={styles.fieldLabel}>Adresse</Text>
            <TextInput
              style={styles.input}
              value={addressQuery}
              onChangeText={setAddressQuery}
              placeholder="F.eks. Storgata 15 Oslo"
              placeholderTextColor={colors.placeholder}
              autoCorrect={false}
              autoCapitalize="words"
              returnKeyType="search"
            />
            {addressSearching ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.loadingTxt}>Søker…</Text>
              </View>
            ) : null}
            {!!addressError && <Text style={styles.error}>{addressError}</Text>}
            <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
              {addressHits.map((hit) => {
                const meta = [
                  [hit.postnummer, hit.poststed].filter(Boolean).join(' '),
                  hit.matrikkel?.kommunenavn && hit.matrikkel.kommunenavn !== hit.poststed
                    ? hit.matrikkel.kommunenavn
                    : null,
                  hit.matrikkelnummertekst ? `gnr/bnr ${hit.matrikkelnummertekst}` : null,
                ].filter(Boolean).join(' · ');
                return (
                  <TouchableOpacity
                    key={hit.id || hit.label}
                    style={styles.row}
                    onPress={() => registerAddress(hit)}
                    disabled={saving}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{hit.adressetekst || hit.label}</Text>
                      {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </TouchableOpacity>
                );
              })}
              {!addressSearching
              && addressQuery.trim().length >= 2
              && !addressHits.length
              && !addressError ? (
                <Mute style={{ marginTop: 8 }}>
                  Ingen treff. Prøv gate + husnummer + sted, eller registrer adressen manuelt.
                </Mute>
              ) : null}
            </ScrollView>
            {addressQuery.trim().length >= 3 && !addressSearching ? (
              <TouchableOpacity
                style={[styles.secondaryBtn, { marginTop: 10 }, saving && { opacity: 0.6 }]}
                onPress={registerTypedAddress}
                disabled={saving}
              >
                <Text style={styles.secondaryBtnTxt}>
                  {saving ? 'Lagrer…' : `Registrer «${addressQuery.trim()}»`}
                </Text>
              </TouchableOpacity>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={contractorOpen}
        transparent
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={closeContractor}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={closeContractor}
        >
          <Pressable
            style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
            onPress={(e) => e.stopPropagation?.()}
          >
            {!isDesktop ? <View style={styles.sheetHandle} /> : null}
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Søk firma</Text>
              <TouchableOpacity onPress={closeContractor} hitSlop={8}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <Text style={styles.fieldLabel}>Rolle / tjeneste</Text>
            <TextInput
              style={styles.input}
              value={contractorRole}
              onChangeText={setContractorRole}
              placeholder="F.eks. Rørlegger"
              placeholderTextColor={colors.placeholder}
            />
            <Text style={styles.fieldLabel}>Firmanavn eller org.nr</Text>
            <TextInput
              style={styles.input}
              value={contractorQuery}
              onChangeText={setContractorQuery}
              placeholder="Søk i Brønnøysund…"
              placeholderTextColor={colors.placeholder}
              autoCorrect={false}
            />
            {contractorSearching ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={colors.brand} />
                <Text style={styles.loadingTxt}>Søker…</Text>
              </View>
            ) : null}
            <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
              {contractorHits.map((enhet) => (
                <TouchableOpacity
                  key={enhet.organisasjonsnummer || enhet.navn}
                  style={styles.row}
                  onPress={() => addContractor(enhet)}
                  disabled={saving}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{enhet.navn}</Text>
                    <Text style={styles.rowMeta}>
                      {enhet.organisasjonsnummer
                        ? formatOrgnummer(enhet.organisasjonsnummer)
                        : ''}
                    </Text>
                  </View>
                  <Ionicons name="add" size={20} color={colors.brand} />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      {cropModal}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  body: { padding: 16, paddingBottom: 40 },
  bodyFab: { paddingBottom: 100 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  title: { fontSize: 20, fontWeight: '500', color: colors.ink, marginBottom: 4 },
  sectionTitle: {
    fontSize: 14, fontWeight: '500', color: colors.ink,
  },
  card: {
    marginTop: 12, backgroundColor: colors.card, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.line, gap: 8,
  },
  homeHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  pencilBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  photoBox: {
    height: 160, borderRadius: 12, overflow: 'hidden',
    backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.line,
  },
  photoImg: { width: '100%', height: '100%' },
  photoEmpty: {
    flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  photoEmptyTxt: { color: colors.brand, fontWeight: '500', fontSize: 14 },
  photoBadge: {
    position: 'absolute', right: 10, bottom: 10,
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: 'rgba(15,23,42,0.72)', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  photoBadgeTxt: { color: '#fff', fontSize: 12, fontWeight: '500' },
  notesRead: { color: colors.ink, fontSize: 14, fontWeight: '400', lineHeight: 20, marginTop: 4 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12,
    backgroundColor: colors.card, color: colors.ink, fontSize: 15, marginTop: 4,
  },
  secondaryBtn: {
    flex: 1, backgroundColor: colors.brandSoft, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', justifyContent: 'center', minHeight: 44,
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '500' },
  primaryBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '500' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10,
    backgroundColor: colors.card, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  rowTitle: { fontWeight: '500', color: colors.ink },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
  empty: {
    marginTop: 28, alignItems: 'center', paddingHorizontal: 12, gap: 8,
  },
  emptyTitle: { fontWeight: '500', fontSize: 17, color: colors.ink, textAlign: 'center' },
  emptySub: {
    color: colors.muted, fontWeight: '400', fontSize: 14, lineHeight: 20,
    textAlign: 'center', maxWidth: 360,
  },
  emptyCta: {
    marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brand, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 12,
  },
  emptyCtaTxt: { color: '#fff', fontWeight: '500', fontSize: 14 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  loadingTxt: { color: colors.muted, fontWeight: '500' },
  error: { color: colors.danger, marginTop: 8, fontWeight: '600' },
  detailTitle: { fontSize: 18, fontWeight: '500', color: colors.ink },
  metaGrid: { marginTop: 8, gap: 2 },
  metaLabel: { color: colors.muted, fontSize: 11, fontWeight: '500', marginTop: 6 },
  metaValue: { color: colors.ink, fontWeight: '500' },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  linkBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.brandSoft, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  linkTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
  smallLabel: { fontWeight: '500', color: colors.ink, fontSize: 13 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10,
    backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontWeight: '500', color: colors.muted, fontSize: 12 },
  chipTxtOn: { color: '#fff' },
  listLine: { color: colors.ink, marginTop: 4, fontWeight: '500' },
  belongRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  miniChip: {
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginTop: 6,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  miniChipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  miniChipTxt: { fontSize: 11, fontWeight: '400', color: colors.muted },
  miniChipTxtOn: { color: colors.brand, fontWeight: '500' },
  contractorRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 8,
    paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line,
  },
  switcher: { gap: 8, paddingVertical: 4, marginTop: 8 },
  switchChip: {
    maxWidth: 220, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  switchChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  switchChipTxt: { fontWeight: '500', color: colors.ink, fontSize: 13 },
  switchChipTxtOn: { color: '#fff' },
  asideCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  asideKicker: {
    fontSize: 11, fontWeight: '600', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  asideLead: { fontSize: 13, fontWeight: '400', color: colors.muted, lineHeight: 18 },
  asideTip: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  asideDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand, marginTop: 6,
  },
  asideTipTxt: { flex: 1, fontSize: 13, fontWeight: '400', color: colors.ink, lineHeight: 18 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, paddingBottom: 28, maxHeight: '92%',
  },
  modalSheetDesk: {
    alignSelf: 'center', marginBottom: 0, maxWidth: 440, width: '100%',
    borderRadius: 12, padding: 18, maxHeight: '85%',
  },
  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line, marginBottom: 12,
  },
  modalHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: '500', color: colors.ink },
  fieldLabel: {
    marginTop: 12, marginBottom: 6, color: colors.muted, fontWeight: '500',
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4,
  },
});
