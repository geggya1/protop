import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Alert, Modal, Pressable, Image,
  ScrollView, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { serverTimestamp } from 'firebase/firestore';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Screen, Mute } from '../../components/ui';
import ConfirmDialog, { InfoDialog } from '../../components/ConfirmDialog';
import ShellAddButton from '../../components/ShellAddButton';
import HelpTarget from '../../components/HelpTarget';
import OverlayHost from '../../components/OverlayHost';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelp } from '../../src/context/HelpContext';
import { useHelpScene, useHelpTourAnchor } from '../../src/hooks/useHelpScene';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import ProductScanResultModal from '../../components/ProductScanResultModal';
import {
  listenList, listenListItems, addListItem, updateListItem, deleteListItem,
  restoreListItem, purgeListItem, emptyListTrash,
  canManageList, canEditListItems,
} from '../../src/utils/shoppingLists';
import { classifyShoppingItem, AISLE_ORDER } from '../../src/utils/groceryCategory';
import { isValidBarcode, normalizeBarcode } from '../../src/utils/barcode';
import { lookupProduct } from '../../src/utils/productLookup';
import { pickImage, uploadImage, alertPhotoError } from '../../src/utils/media';
import {
  isSessionActive, startShoppingSession, endShoppingSession,
  attachSessionReceipt, sortItemsForSession, sessionStats,
} from '../../src/utils/shoppingSession';
import { addDoneShoppingToPantry, addReceiptLinesToPantry, listenPantry } from '../../src/utils/familyPantry';
import { storeById } from '../../src/data/groceryStores';
import { illustrationSourceById } from '../../src/modules/moduleActivationAssets';
import { useShowModuleHero } from '../../components/ModulePageBg';
import IconBadge from '../../components/IconBadge';

const SHOPPING_BG = illustrationSourceById('shop');

function Frame({ inShell, children }) {
  if (inShell) return <View style={styles.shellFrame}>{children}</View>;
  return <Screen>{children}</Screen>;
}

const CATEGORIES = [
  { key: 'general', label: 'Generelt', icon: '🛒' },
  { key: 'dairy', label: 'Meieri', icon: '🥛' },
  { key: 'meat', label: 'Kjøtt', icon: '🥩' },
  { key: 'produce', label: 'Frukt & grønt', icon: '🥬' },
  { key: 'bread', label: 'Bakeri', icon: '🍞' },
  { key: 'pantry', label: 'Pålegg & tørrvare', icon: '🥫' },
  { key: 'frozen', label: 'Frys', icon: '🧊' },
  { key: 'snacks', label: 'Snacks', icon: '🍿' },
  { key: 'drinks', label: 'Drikke', icon: '🥤' },
  { key: 'household', label: 'Husholdning', icon: '🧴' },
  { key: 'other', label: 'Annet', icon: '📦' },
];

const CATEGORY_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

/** Soft-slettet i papirkurv (tåler legacy truthy-verdier). */
function isTrashed(item) {
  return item?.deleted === true || item?.deleted === 1 || item?.deleted === 'true';
}

export default function ShoppingListScreen({
  listId, listScope = null, onBack, onOpenSettings, inShell = false,
}) {
  const { familyId, members, uid, isParent, isAdmin } = useApp();
  const { mode: helpMode } = useHelp();
  const tourAnchor = useHelpTourAnchor();
  useHelpScene('inner', { onRetreat: onBack });
  const { isDesktop, width: layoutW, height: layoutH } = useLayout();
  const showPageHero = useShowModuleHero();
  const bgH = Math.round(Math.min(layoutW * 0.72, layoutH * 0.5, isDesktop ? 380 : 360));
  const scope = listScope || { personal: false, familyId, listId };
  const memberList = members || [];
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState('general');
  const [categoryConfident, setCategoryConfident] = useState(true);
  const [categorySuggestions, setCategorySuggestions] = useState([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [newRecurring, setNewRecurring] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSuccessMsg, setAddSuccessMsg] = useState(null);
  const [addedDuringSession, setAddedDuringSession] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const addTitleRef = useRef(null);
  const addSuccessTimerRef = useRef(null);
  const [newImageLocalUri, setNewImageLocalUri] = useState(null);
  const [newImagePicked, setNewImagePicked] = useState(null);
  const [newImageUrl, setNewImageUrl] = useState(null);
  const [filter, setFilter] = useState('open');
  const [saving, setSaving] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editImageLocalUri, setEditImageLocalUri] = useState(null);
  const [editImagePicked, setEditImagePicked] = useState(null);
  const [editImageUrl, setEditImageUrl] = useState(null);
  const [editImageRemoved, setEditImageRemoved] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [pantryPrompt, setPantryPrompt] = useState(null);
  const [pantryItems, setPantryItems] = useState([]);
  const [receiptLinesOpen, setReceiptLinesOpen] = useState(false);
  const [receiptLines, setReceiptLines] = useState('');
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResumeKey, setScanResumeKey] = useState(0);
  const [scanResultOpen, setScanResultOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scannedProduct, setScannedProduct] = useState(null);

  useEffect(() => {
    if (!scope?.listId) return undefined;
    return listenList(scope, setList);
  }, [scope?.listId, scope?.personal, scope?.ownerUid, scope?.familyId]);

  useEffect(() => {
    if (!scope?.listId) return undefined;
    return listenListItems(scope, (next) => {
      // Deduplisér på id — duplikater i snapshot gir feil papirkurv-sum og skjulte rader i FlatList.
      const seen = new Set();
      const unique = [];
      for (const item of next || []) {
        if (!item?.id || seen.has(item.id)) continue;
        seen.add(item.id);
        unique.push(item);
      }
      setItems(unique);
    });
  }, [scope?.listId, scope?.personal, scope?.ownerUid, scope?.familyId]);

  useEffect(() => {
    const famId = !scope?.personal ? (scope?.familyId || familyId) : null;
    if (!famId) {
      setPantryItems([]);
      return undefined;
    }
    return listenPantry(famId, setPantryItems);
  }, [scope?.personal, scope?.familyId, familyId]);

  const canManage = canManageList(list, uid, isAdmin);
  const canEdit = canEditListItems(list, uid, isAdmin);

  const applyCategoryGuess = useCallback((title) => {
    const result = classifyShoppingItem(title);
    setNewCategory(result.category);
    setCategoryConfident(result.confident);
    setCategorySuggestions(result.suggestions);
    if (result.confident) {
      setShowCategoryPicker(false);
      setShowAllCategories(false);
    }
  }, []);

  const itemImageStoragePath = useCallback(() => {
    if (scope?.personal && scope?.ownerUid) {
      return `users/${scope.ownerUid}/shoppingLists/${scope.listId}/items/${Date.now()}.jpg`;
    }
    const fam = scope?.familyId || familyId;
    return `families/${fam}/shoppingLists/${scope?.listId || listId}/items/${Date.now()}.jpg`;
  }, [scope, familyId, listId]);

  const openAddModal = useCallback(() => {
    setNewTitle('');
    setNewDescription('');
    setNewRecurring(false);
    setNewCategory('general');
    setCategoryConfident(true);
    setCategorySuggestions([]);
    setShowCategoryPicker(false);
    setShowAllCategories(false);
    setNewImageLocalUri(null);
    setNewImagePicked(null);
    setNewImageUrl(null);
    setAddSuccessMsg(null);
    setAddedDuringSession(false);
    setAddModalOpen(true);
  }, []);

  const showLocalAdd = canEdit && !scannerOpen && !scanResultOpen && !addModalOpen && filter !== 'trash';
  const shellAddBtn = useMemo(() => {
    if (!showLocalAdd) return null;
    return (
      <ShellAddButton
        label="Legg til"
        accessibilityLabel="Legg til vare"
        onPress={openAddModal}
      />
    );
  }, [showLocalAdd, openAddModal]);
  useShellTitleRight(shellAddBtn);

  const clearAddSuccessTimer = useCallback(() => {
    if (addSuccessTimerRef.current) {
      clearTimeout(addSuccessTimerRef.current);
      addSuccessTimerRef.current = null;
    }
  }, []);

  const closeAddModal = useCallback(() => {
    clearAddSuccessTimer();
    setAddModalOpen(false);
    setAddSuccessMsg(null);
    setAddedDuringSession(false);
    setNewTitle('');
    setNewDescription('');
    setNewRecurring(false);
    setShowCategoryPicker(false);
    setShowAllCategories(false);
    setNewImageLocalUri(null);
    setNewImagePicked(null);
    setNewImageUrl(null);
  }, [clearAddSuccessTimer]);

  const resetAddFormForNext = useCallback(() => {
    setNewTitle('');
    setNewDescription('');
    setNewRecurring(false);
    setNewCategory('general');
    setCategoryConfident(true);
    setCategorySuggestions([]);
    setShowCategoryPicker(false);
    setShowAllCategories(false);
    setNewImageLocalUri(null);
    setNewImagePicked(null);
    setNewImageUrl(null);
  }, []);

  useEffect(() => {
    if (tourAnchor === 'input') {
      setAddModalOpen(true);
      return;
    }
    if (tourAnchor && tourAnchor !== 'input' && addModalOpen) {
      setAddModalOpen(false);
    }
  }, [tourAnchor]);

  // Keep action buttons above the soft keyboard on web (iOS Safari / PWA).
  // Native uses KeyboardAvoidingView instead to avoid double padding.
  useEffect(() => {
    if (!addModalOpen) {
      setKeyboardInset(0);
      return undefined;
    }
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.visualViewport) {
      return undefined;
    }
    const vv = window.visualViewport;
    const sync = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      setKeyboardInset(inset);
    };
    sync();
    vv.addEventListener('resize', sync);
    vv.addEventListener('scroll', sync);
    return () => {
      vv.removeEventListener('resize', sync);
      vv.removeEventListener('scroll', sync);
    };
  }, [addModalOpen]);

  useEffect(() => () => clearAddSuccessTimer(), [clearAddSuccessTimer]);

  const pickNewItemImage = useCallback(async () => {
    try {
      const picked = await pickImage({ aspect: [1, 1], edit: true });
      if (!picked) return;
      setNewImageLocalUri(picked.uri || null);
      setNewImagePicked(picked);
    } catch (e) {
      alertPhotoError(e);
    }
  }, []);

  const clearNewItemImage = useCallback(() => {
    setNewImageLocalUri(null);
    setNewImagePicked(null);
    setNewImageUrl(null);
  }, []);

  const addItem = useCallback(async () => {
    if (!newTitle.trim() || !scope?.listId) return;
    setSaving(true);
    const addedTitle = newTitle.trim();
    try {
      let imageUrl = newImageUrl || null;
      if (newImagePicked || newImageLocalUri) {
        try {
          imageUrl = await uploadImage(
            itemImageStoragePath(),
            newImagePicked || { uri: newImageLocalUri },
          );
        } catch (e) {
          alertPhotoError(e);
          return;
        }
      }
      await addListItem(scope, {
        title: addedTitle,
        description: newDescription.trim(),
        category: newCategory,
        done: false,
        recurring: newRecurring,
        imageUrl: imageUrl || null,
        addedBy: uid,
        addedByName: memberList.find((m) => m.uid === uid)?.name || '',
      });
      // Keep sheet open so several items can be added without reopening.
      resetAddFormForNext();
      clearAddSuccessTimer();
      setAddedDuringSession(true);
      setAddSuccessMsg(`«${addedTitle}» lagt til`);
      addSuccessTimerRef.current = setTimeout(() => {
        setAddSuccessMsg(null);
        addSuccessTimerRef.current = null;
      }, 2200);
      requestAnimationFrame(() => {
        addTitleRef.current?.focus?.();
      });
    } catch {
      Alert.alert('Feil', 'Klarte ikke legge til vare.');
    } finally {
      setSaving(false);
    }
  }, [
    newTitle, newDescription, newCategory, newRecurring, newImageUrl,
    newImagePicked, newImageLocalUri, scope, uid, memberList, resetAddFormForNext,
    clearAddSuccessTimer, itemImageStoragePath,
  ]);

  const normalizeScan = useCallback((raw) => {
    const normalized = normalizeBarcode(raw);
    return isValidBarcode(normalized) ? normalized : null;
  }, []);

  const openScanner = useCallback(() => {
    setAddModalOpen(false);
    setScanError(null);
    setScannedProduct(null);
    setScanResultOpen(false);
    setScannerOpen(true);
  }, []);

  const closeScanFlow = useCallback(() => {
    setScannerOpen(false);
    setScanResultOpen(false);
    setScanLoading(false);
    setScanError(null);
    setScannedProduct(null);
  }, []);

  const handleBarcodeScanned = useCallback(async (code) => {
    // Keep scanner mounted/warm so the "Åpne kamera" gate is not shown again.
    setScanResultOpen(true);
    setScanLoading(true);
    setScanError(null);
    setScannedProduct(null);
    try {
      const product = await lookupProduct(code);
      setScannedProduct(product);
    } catch (e) {
      setScanError(e?.message || 'Klarte ikke slå opp varen.');
    } finally {
      setScanLoading(false);
    }
  }, []);

  const resumeScanner = useCallback(() => {
    setScanResultOpen(false);
    setScanError(null);
    setScannedProduct(null);
    setScanResumeKey((k) => k + 1);
    setScannerOpen(true);
  }, []);

  const addScannedProduct = useCallback(async () => {
    if (!scannedProduct || !scope?.listId) return;
    setSaving(true);
    try {
      const descParts = [scannedProduct.brand, scannedProduct.quantity].filter(Boolean);
      await addListItem(scope, {
        title: scannedProduct.title,
        description: descParts.join(' · '),
        category: scannedProduct.category || 'general',
        done: false,
        recurring: false,
        barcode: scannedProduct.barcode,
        brand: scannedProduct.brand || null,
        imageUrl: scannedProduct.imageUrl || null,
        addedBy: uid,
        addedByName: memberList.find((m) => m.uid === uid)?.name || '',
      });
      resumeScanner();
    } catch {
      Alert.alert('Feil', 'Klarte ikke legge til varen.');
    } finally {
      setSaving(false);
    }
  }, [scannedProduct, scope, uid, memberList, resumeScanner]);

  const toggleDone = useCallback(async (item) => {
    if (!scope?.listId) return;
    try {
      await updateListItem(scope, item.id, {
        done: !item.done,
        checkedBy: item.done ? null : uid,
        checkedAt: item.done ? null : serverTimestamp(),
      });
    } catch { /* ignore */ }
  }, [scope, uid]);

  const openEdit = useCallback((item) => {
    setEditingItem(item);
    setEditTitle(item.title || '');
    setEditDescription(item.description || '');
    setEditImageUrl(item.imageUrl || null);
    setEditImageLocalUri(null);
    setEditImagePicked(null);
    setEditImageRemoved(false);
  }, []);

  const closeEdit = useCallback(() => {
    setEditingItem(null);
    setEditTitle('');
    setEditDescription('');
    setEditImageUrl(null);
    setEditImageLocalUri(null);
    setEditImagePicked(null);
    setEditImageRemoved(false);
  }, []);

  const pickEditItemImage = useCallback(async () => {
    try {
      const picked = await pickImage({ aspect: [1, 1], edit: true });
      if (!picked) return;
      setEditImageLocalUri(picked.uri || null);
      setEditImagePicked(picked);
      setEditImageRemoved(false);
    } catch (e) {
      alertPhotoError(e);
    }
  }, []);

  const clearEditItemImage = useCallback(() => {
    setEditImageLocalUri(null);
    setEditImagePicked(null);
    setEditImageUrl(null);
    setEditImageRemoved(true);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingItem || !scope?.listId) return;
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setDialog({ title: 'Navn mangler', message: 'Varen må ha et navn.' });
      return;
    }
    setEditSaving(true);
    try {
      let imageUrl = editImageRemoved ? null : (editImageUrl || editingItem.imageUrl || null);
      if (editImagePicked || editImageLocalUri) {
        try {
          imageUrl = await uploadImage(
            itemImageStoragePath(),
            editImagePicked || { uri: editImageLocalUri },
          );
        } catch (e) {
          alertPhotoError(e);
          return;
        }
      }
      await updateListItem(scope, editingItem.id, {
        title: trimmed,
        description: editDescription.trim(),
        imageUrl: imageUrl || null,
      });
      closeEdit();
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke lagre endringene.' });
    } finally {
      setEditSaving(false);
    }
  }, [
    editingItem, editTitle, editDescription, editImageUrl, editImagePicked,
    editImageLocalUri, editImageRemoved, scope, closeEdit, itemImageStoragePath,
  ]);

  const removeItem = useCallback(async (item) => {
    if (!scope?.listId) return;
    try {
      await deleteListItem(scope, item.id, undefined, { deletedBy: uid });
    } catch { /* ignore */ }
  }, [scope, uid]);

  const restoreItem = useCallback(async (item) => {
    if (!scope?.listId) return;
    try {
      await restoreListItem(scope, item.id);
    } catch {
      Alert.alert('Feil', 'Klarte ikke gjenopprette varen.');
    }
  }, [scope]);

  const purgeItem = useCallback(async (item) => {
    if (!scope?.listId) return;
    Alert.alert(
      'Slett permanent?',
      `«${item.title || 'Vare'}» slettes for godt og kan ikke gjenopprettes.`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Slett',
          style: 'destructive',
          onPress: async () => {
            try {
              await purgeListItem(scope, item.id);
            } catch {
              Alert.alert('Feil', 'Klarte ikke slette varen.');
            }
          },
        },
      ],
    );
  }, [scope]);

  const emptyTrash = useCallback(async () => {
    if (!scope?.listId) return;
    const toEmpty = items.filter(isTrashed);
    if (!toEmpty.length) return;
    Alert.alert(
      'Tøm papirkurv?',
      `Slette ${toEmpty.length} varer permanent?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Tøm',
          style: 'destructive',
          onPress: async () => {
            try {
              await emptyListTrash(scope, toEmpty);
            } catch {
              Alert.alert('Feil', 'Klarte ikke tømme papirkurven.');
            }
          },
        },
      ],
    );
  }, [scope, items]);

  const clearDone = useCallback(async () => {
    if (!scope?.listId) return;
    const active = items.filter((i) => !isTrashed(i));
    const doneItems = active.filter((i) => i.done && !i.recurring);
    Alert.alert(
      'Flytt til papirkurv',
      `Flytte ${doneItems.length} utkvitterte varer til papirkurven?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Flytt', style: 'destructive',
          onPress: async () => {
            for (const item of doneItems) {
              try {
                await deleteListItem(scope, item.id, undefined, { deletedBy: uid });
              } catch { /* ignore */ }
            }
            const recurringDone = active.filter((i) => i.done && i.recurring);
            for (const item of recurringDone) {
              try {
                await updateListItem(scope, item.id, {
                  done: false, checkedBy: null, checkedAt: null,
                });
              } catch { /* ignore */ }
            }
          },
        },
      ],
    );
  }, [scope, items, uid]);

  const activeItems = useMemo(() => items.filter((i) => !isTrashed(i)), [items]);
  const trashItems = useMemo(() => items.filter(isTrashed), [items]);

  const filtered = useMemo(() => {
    if (filter === 'trash') {
      // type/key siste — ellers kan Firestore-felt overskrive og FlatList/rader kollapser
      return trashItems.map((item) => ({ ...item, type: 'trash', key: `trash-${item.id}` }));
    }
    const sessionOn = isSessionActive(list);
    let listItems = activeItems;
    if (filter === 'open') listItems = listItems.filter((i) => !i.done);
    if (filter === 'done') listItems = listItems.filter((i) => !!i.done);
    if (sessionOn && filter === 'all') {
      listItems = sortItemsForSession(listItems);
    }
    const groups = {};
    for (const item of listItems) {
      const cat = item.category || 'general';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    }
    const out = [];
    const catOrder = sessionOn
      ? AISLE_ORDER
      : CATEGORIES.map((c) => c.key);
    const knownKeys = new Set(CATEGORIES.map((c) => c.key));
    for (const key of catOrder) {
      const cat = CATEGORY_BY_KEY[key];
      if (!cat || !groups[key]?.length) continue;
      out.push({ ...cat, type: 'header', key: `h-${key}` });
      for (const item of groups[key]) {
        out.push({ ...item, type: 'item', key: `item-${item.id}` });
      }
    }
    const orphan = Object.keys(groups).filter((k) => !knownKeys.has(k));
    if (orphan.length) {
      for (const key of orphan) {
        out.push({ type: 'header', key: `h-orphan-${key}`, label: key, icon: '📦' });
        for (const item of groups[key]) {
          out.push({ ...item, type: 'item', key: `item-${item.id}` });
        }
      }
    }
    return out;
  }, [activeItems, trashItems, filter, list]);

  const openCount = activeItems.filter((i) => !i.done).length;
  const doneCount = activeItems.filter((i) => i.done).length;
  const trashCount = trashItems.length;
  const sessionOn = isSessionActive(list);
  const preferredStore = storeById(list?.preferredStoreId || list?.sessionStoreId);
  const stats = sessionStats(activeItems);

  const toggleSession = useCallback(async () => {
    if (!scope || !canEdit) return;
    try {
      if (sessionOn) {
        await endShoppingSession(scope);
        const doneItems = activeItems.filter((i) => i.done && !isTrashed(i));
        const famId = !scope.personal ? (scope.familyId || familyId) : null;
        const doneMsg = `${stats.done} av ${stats.total} varer krysset av. Du kan legge ved kvitteringsbilde.`;
        if (famId && doneItems.length > 0) {
          setPantryPrompt({
            famId,
            items: doneItems,
            doneMsg,
          });
        } else {
          setDialog({
            title: 'Handletur ferdig',
            message: doneMsg,
          });
        }
      } else {
        await startShoppingSession(scope, {
          storeId: list?.preferredStoreId || null,
          uid,
        });
      }
    } catch {
      Alert.alert('Feil', 'Klarte ikke starte/avslutte handletur.');
    }
  }, [scope, canEdit, sessionOn, stats, list?.preferredStoreId, uid, activeItems, familyId]);

  const attachReceipt = useCallback(async () => {
    if (!scope || !canEdit) return;
    try {
      const picked = await pickImage({ edit: false });
      if (!picked) return;
      const path = scope.personal && scope.ownerUid
        ? `users/${scope.ownerUid}/shoppingLists/${scope.listId}/receipts/${Date.now()}.jpg`
        : `families/${scope.familyId || familyId}/shoppingLists/${scope.listId}/receipts/${Date.now()}.jpg`;
      const url = await uploadImage(path, picked);
      await attachSessionReceipt(scope, { imageUrl: url });
      const famId = !scope.personal ? (scope.familyId || familyId) : null;
      if (famId) {
        setDialog({
          title: 'Kvittering lagret',
          message: 'Bildet er lagret. Lim inn varer fra kvitteringen til lageret (én linje per vare).',
        });
        setTimeout(() => setReceiptLinesOpen(true), 350);
      } else {
        setDialog({ title: 'Kvittering lagret', message: 'Bildet er knyttet til handleturen.' });
      }
    } catch (e) {
      alertPhotoError(e);
    }
  }, [scope, canEdit, familyId]);

  const saveReceiptLines = useCallback(async () => {
    const famId = !scope?.personal ? (scope?.familyId || familyId) : null;
    if (!famId || !receiptLines.trim()) {
      setReceiptLinesOpen(false);
      return;
    }
    setReceiptBusy(true);
    try {
      const { added, merged, lines } = await addReceiptLinesToPantry(
        famId,
        receiptLines,
        uid,
        pantryItems,
      );
      setReceiptLines('');
      setReceiptLinesOpen(false);
      setDialog({
        title: 'Lagt i lager',
        message: `${lines} linjer · ${added} nye · ${merged} sammenslått.`,
      });
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke legge linjene i lageret.' });
    } finally {
      setReceiptBusy(false);
    }
  }, [scope, familyId, receiptLines, uid, pantryItems]);

  const renderItem = useCallback(({ item }) => {
    if (item.type === 'header') {
      return (
        <View style={styles.catHeader}>
          <Text style={{ fontSize: 16 }}>{item.icon}</Text>
          <Text style={styles.catTitle}>{item.label}</Text>
        </View>
      );
    }

    if (item.type === 'trash') {
      return (
        <View style={[styles.itemRow, styles.trashRow]}>
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={styles.itemThumb} />
          ) : null}
          <View style={{ flex: 1 }}>
            <Text style={[styles.itemTitle, styles.itemTitleDone]}>{item.title}</Text>
            {!!item.description && (
              <Text style={[styles.itemDesc, styles.itemDescDone]} numberOfLines={2}>
                {item.description}
              </Text>
            )}
          </View>
          {canEdit ? (
            <>
              <TouchableOpacity
                style={styles.restoreBtn}
                onPress={() => restoreItem(item)}
                accessibilityLabel="Gjenopprett"
              >
                <Ionicons name="arrow-undo-outline" size={18} color={colors.brand} />
              </TouchableOpacity>
              <TouchableOpacity
                style={{ padding: 8 }}
                onPress={() => purgeItem(item)}
                accessibilityLabel="Slett permanent"
              >
                <Ionicons name="trash-outline" size={16} color="#b91c1c" />
              </TouchableOpacity>
            </>
          ) : null}
        </View>
      );
    }

    return (
      <View style={[styles.itemRow, item.done && styles.itemDone]}>
        <TouchableOpacity style={styles.checkArea} onPress={() => toggleDone(item)}>
          <View style={[styles.checkbox, item.done && styles.checkboxDone]}>
            {item.done && <Ionicons name="checkmark" size={16} color="#fff" />}
          </View>
        </TouchableOpacity>

        {item.imageUrl ? (
          <Image source={{ uri: item.imageUrl }} style={styles.itemThumb} />
        ) : null}

        <TouchableOpacity style={{ flex: 1 }} onPress={() => openEdit(item)} activeOpacity={0.7}>
          <Text style={[styles.itemTitle, item.done && styles.itemTitleDone]}>{item.title}</Text>
          {!!item.description && (
            <Text style={[styles.itemDesc, item.done && styles.itemDescDone]} numberOfLines={2}>
              {item.description}
            </Text>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {item.recurring && (
              <View style={styles.recurBadge}>
                <MaterialCommunityIcons name="repeat" size={12} color={colors.brand} />
                <Text style={styles.recurTxt}>Ukentlig</Text>
              </View>
            )}
            {item.addedByName ? <Text style={styles.addedBy}>{item.addedByName}</Text> : null}
          </View>
        </TouchableOpacity>

        {canEdit ? (
          <TouchableOpacity
            style={{ padding: 8 }}
            onPress={() => removeItem(item)}
            accessibilityLabel="Flytt til papirkurv"
          >
            <Ionicons name="trash-outline" size={16} color="#b91c1c" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  }, [toggleDone, openEdit, removeItem, restoreItem, purgeItem, canEdit]);

  const selectedCategory = CATEGORY_BY_KEY[newCategory] || CATEGORY_BY_KEY.general;
  const suggestedCategories = useMemo(
    () => categorySuggestions.map((key) => CATEGORY_BY_KEY[key]).filter(Boolean),
    [categorySuggestions],
  );

  if (!isParent) {
    return (
      <Frame inShell={inShell}>
        <View style={{ padding: 16 }}>
          <Mute>Handlelister er kun for foresatte.</Mute>
        </View>
      </Frame>
    );
  }

  if (!listId) {
    return (
      <Frame inShell={inShell}>
        <View style={{ padding: 16 }}>
          <Mute>Velg en handleliste.</Mute>
        </View>
      </Frame>
    );
  }

  return (
    <Frame inShell={inShell}>
      {!showPageHero ? (
      <View
        pointerEvents="none"
        style={[styles.bgWrap, { height: bgH }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Image source={SHOPPING_BG} style={styles.bgArt} resizeMode="contain" />
      </View>
      ) : null}
      <View style={styles.page}>
        <View style={styles.topRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            {onBack && (
              <TouchableOpacity style={styles.backBtn} onPress={onBack} accessibilityRole="button">
                <Ionicons name="chevron-back" size={18} color={colors.brand} />
                <Text style={styles.backTxt}>Alle lister</Text>
              </TouchableOpacity>
            )}
            <Text style={[styles.listTitle, isDesktop && styles.listTitleDesk]} numberOfLines={1}>
              {list?.name || 'Handleliste'}
            </Text>
          </View>
          <View style={styles.topActions}>
            <View style={[styles.badges, !isDesktop && styles.badgesMobile]}>
              <View style={styles.countBadge}><Text style={styles.countTxt}>{openCount} gjenstår</Text></View>
              {doneCount > 0 && filter !== 'trash' && (
                <TouchableOpacity style={[styles.countBadge, { backgroundColor: '#d1fae5' }]} onPress={clearDone}>
                  <Text style={[styles.countTxt, { color: '#10b981' }]}>{doneCount} ferdig</Text>
                  <Ionicons name="trash-outline" size={12} color="#10b981" />
                </TouchableOpacity>
              )}
              {trashCount > 0 && filter === 'trash' && canEdit && (
                <TouchableOpacity style={[styles.countBadge, { backgroundColor: '#fee2e2' }]} onPress={emptyTrash}>
                  <Text style={[styles.countTxt, { color: '#b91c1c' }]}>Tøm</Text>
                  <Ionicons name="trash" size={12} color="#b91c1c" />
                </TouchableOpacity>
              )}
            </View>
            <View style={styles.iconRow}>
              {canEdit && (
                <TouchableOpacity
                  style={[styles.scanBtn, sessionOn && styles.sessionBtnOn]}
                  onPress={toggleSession}
                  accessibilityLabel={sessionOn ? 'Avslutt handletur' : 'Start handletur'}
                >
                  <IconBadge
                    count={openCount}
                    size={14}
                    offset={-4}
                    borderColor={sessionOn ? colors.brand : '#fff'}
                  >
                    <Ionicons
                      name={sessionOn ? 'bag-check-outline' : 'bag-handle-outline'}
                      size={20}
                      color={sessionOn ? '#fff' : colors.brand}
                    />
                  </IconBadge>
                </TouchableOpacity>
              )}
              {canEdit && (sessionOn || list?.sessionReceiptUrl) && (
                <TouchableOpacity
                  style={styles.scanBtn}
                  onPress={attachReceipt}
                  accessibilityLabel="Legg ved kvittering"
                >
                  <Ionicons name="receipt-outline" size={20} color={colors.brand} />
                </TouchableOpacity>
              )}
              {canEdit && (
                <TouchableOpacity style={styles.scanBtn} onPress={openScanner} accessibilityLabel="Skann vare">
                  <Ionicons name="barcode-outline" size={20} color={colors.brand} />
                </TouchableOpacity>
              )}
              {canManage && onOpenSettings && (
                <TouchableOpacity
                  style={styles.settingsBtn}
                  onPress={onOpenSettings}
                  accessibilityLabel="Innstillinger"
                  accessibilityRole="button"
                >
                  <Ionicons name="settings-outline" size={20} color={colors.brand} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {sessionOn ? (
          <View style={styles.sessionBanner}>
            <Ionicons name="bag-handle" size={16} color={colors.brand} />
            <Text style={styles.sessionBannerTxt}>
              Handletur · {stats.open} gjenstår
              {preferredStore ? ` · ${preferredStore.shortName}` : ''}
              {' · sortert etter hyller'}
            </Text>
          </View>
        ) : null}

        {!!list?.sessionReceiptUrl && !sessionOn ? (
          <TouchableOpacity
            style={styles.receiptRow}
            onPress={() => Linking.openURL(list.sessionReceiptUrl)}
          >
            <Ionicons name="receipt-outline" size={16} color={colors.muted} />
            <Text style={styles.receiptTxt}>Siste kvittering</Text>
          </TouchableOpacity>
        ) : null}

        <View style={[styles.filterRow, isDesktop && styles.filterRowDesk]}>
          {[
            ['open', 'Gjenstår'],
            ['all', 'Alle'],
            ['done', 'Kvittert'],
            ['trash', trashCount > 0 ? `Papirkurv (${trashCount})` : 'Papirkurv'],
          ].map(([k, l]) => (
            <TouchableOpacity
              key={k}
              style={[
                styles.filterBtn,
                isDesktop && styles.filterBtnDesk,
                filter === k && styles.filterOn,
              ]}
              onPress={() => setFilter(k)}
            >
              <Text
                style={[
                  styles.filterTxt,
                  isDesktop && styles.filterTxtDesk,
                  filter === k && styles.filterTxtOn,
                ]}
              >
                {l}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          style={styles.list}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {filtered.length === 0 ? (
            <View style={{ paddingTop: 40, alignItems: 'center' }}>
              <Mute>
                {filter === 'trash'
                  ? 'Papirkurven er tom.'
                  : 'Ingen varer i listen. Legg til en vare for å komme i gang.'}
              </Mute>
            </View>
          ) : (
            filtered.map((row, i) => {
              const node = <View key={row.key}>{renderItem({ item: row })}</View>;
              if (i === 0 && filter !== 'trash') {
                return (
                  <HelpTarget key={row.key} id="content">
                    {renderItem({ item: row })}
                  </HelpTarget>
                );
              }
              return node;
            })
          )}
        </ScrollView>
      </View>

      <OverlayHost
        inline={helpMode === 'module'}
        visible={addModalOpen}
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={closeAddModal}
      >
        <KeyboardAvoidingView
          style={styles.addKeyboardRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          enabled={Platform.OS !== 'web'}
        >
          <Pressable style={[styles.addBackdrop, isDesktop && desktopOverlay]} onPress={closeAddModal}>
            <Pressable
              style={[
                styles.addSheet,
                isDesktop && [desktopSheet, styles.addSheetDesk],
                !isDesktop && keyboardInset > 0 ? { paddingBottom: Math.max(12, keyboardInset) } : null,
              ]}
              onPress={() => {}}
            >
              {!isDesktop ? <View style={styles.addSheetHandle} /> : null}
              <Text style={[styles.addSheetTitle, isDesktop && styles.addSheetTitleDesk]}>
                Legg til vare
              </Text>

              {addSuccessMsg ? (
                <View style={styles.addSuccessBanner} accessibilityLiveRegion="polite">
                  <Ionicons name="checkmark-circle" size={18} color="#166534" />
                  <Text style={styles.addSuccessTxt}>{addSuccessMsg}</Text>
                </View>
              ) : null}

              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                style={[
                  styles.addSheetScrollView,
                  {
                    maxHeight: Math.round(
                      layoutH * (keyboardInset > 0 ? 0.34 : isDesktop ? 0.55 : 0.48),
                    ),
                  },
                ]}
                contentContainerStyle={styles.addSheetScroll}
              >
                <TouchableOpacity style={[styles.scanLink, isDesktop && styles.scanLinkDesk]} onPress={openScanner} accessibilityRole="button">
                  <Ionicons name="barcode-outline" size={16} color={colors.brand} />
                  <Text style={[styles.scanLinkTxt, isDesktop && styles.scanLinkTxtDesk]}>Skann strekkode</Text>
                </TouchableOpacity>

                {(newImageLocalUri || newImageUrl) ? (
                  <View style={styles.imageAttachedRow}>
                    <TouchableOpacity
                      onPress={pickNewItemImage}
                      accessibilityRole="button"
                      accessibilityLabel="Bytt bilde"
                    >
                      <Image
                        source={{ uri: newImageLocalUri || newImageUrl }}
                        style={styles.imageAttachedThumb}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                    <View style={styles.imageAttachedMeta}>
                      <TouchableOpacity onPress={pickNewItemImage} accessibilityRole="button">
                        <Text style={styles.imageAttachTitle}>Bytt bilde</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={clearNewItemImage} style={styles.imageRemoveBtn}>
                        <Text style={styles.imageRemoveTxt}>Fjern bilde</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.imageAttachBtn, isDesktop && styles.imageAttachBtnDesk]}
                    onPress={pickNewItemImage}
                    accessibilityRole="button"
                    accessibilityLabel="Legg til bilde"
                  >
                    <Ionicons name="camera-outline" size={18} color={colors.brand} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.imageAttachTitle}>Legg til bilde</Text>
                      <Text style={styles.imageAttachHint}>Valgfritt</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </TouchableOpacity>
                )}

                <Text style={[styles.modalLabel, isDesktop && styles.modalLabelDesk]}>Navn</Text>
                <HelpTarget id="input">
                  <TextInput
                    ref={addTitleRef}
                    style={[styles.modalInput, isDesktop && styles.modalInputDesk]}
                    value={newTitle}
                    onChangeText={(text) => {
                      setNewTitle(text);
                      applyCategoryGuess(text);
                    }}
                    placeholder="Navn på vare..."
                    autoFocus
                    returnKeyType="next"
                  />
                </HelpTarget>

                <Text style={[styles.modalLabel, isDesktop && styles.modalLabelDesk]}>Beskrivelse (valgfritt)</Text>
                <TextInput
                  style={[styles.modalInput, styles.modalDescInput, isDesktop && styles.modalInputDesk]}
                  value={newDescription}
                  onChangeText={setNewDescription}
                  placeholder="F.eks. grovt, 1 stk"
                  returnKeyType="done"
                  onSubmitEditing={addItem}
                />

                {categoryConfident ? (
                  newTitle.trim().length >= 2 ? (
                    <View style={styles.autoCatRow}>
                      <Text style={styles.autoCatIcon}>{selectedCategory.icon}</Text>
                      <Text style={styles.autoCatTxt}>
                        Legges i {selectedCategory.label}
                      </Text>
                    </View>
                  ) : null
                ) : (
                  <View style={styles.catSection}>
                    <TouchableOpacity
                      style={styles.catExpandBtn}
                      onPress={() => {
                        setShowCategoryPicker((v) => !v);
                        setShowAllCategories(false);
                      }}
                      accessibilityRole="button"
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.catExpandLbl}>Velg kategori</Text>
                        <Text style={styles.catExpandHint}>
                          {showCategoryPicker
                            ? `Valgt: ${selectedCategory.label}`
                            : 'Systemet er usikkert — trykk for forslag'}
                        </Text>
                      </View>
                      <Ionicons
                        name={showCategoryPicker ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.muted}
                      />
                    </TouchableOpacity>
                    {showCategoryPicker ? (
                      <>
                        <View style={styles.catChips}>
                          {(showAllCategories ? CATEGORIES : suggestedCategories).map((c) => (
                            <TouchableOpacity
                              key={c.key}
                              style={[styles.catChip, newCategory === c.key && styles.catChipActive]}
                              onPress={() => setNewCategory(c.key)}
                            >
                              <Text style={{ fontSize: 14 }}>{c.icon}</Text>
                              <Text style={[styles.catChipTxt, newCategory === c.key && styles.catChipTxtActive]}>
                                {c.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        {!showAllCategories && suggestedCategories.length < CATEGORIES.length ? (
                          <TouchableOpacity
                            style={styles.catMoreBtn}
                            onPress={() => setShowAllCategories(true)}
                          >
                            <Text style={styles.catMoreTxt}>Vis alle kategorier</Text>
                          </TouchableOpacity>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                )}

                <TouchableOpacity
                  style={[styles.recurToggle, newRecurring && styles.recurToggleOn]}
                  onPress={() => setNewRecurring(!newRecurring)}
                >
                  <MaterialCommunityIcons name="repeat" size={16} color={newRecurring ? '#fff' : colors.brand} />
                  <Text style={[styles.recurToggleTxt, newRecurring && { color: '#fff' }]}>Ukentlig</Text>
                </TouchableOpacity>
              </ScrollView>

              <View style={styles.addSheetFooter}>
                <TouchableOpacity
                  style={[styles.modalCancelBtn, isDesktop && styles.modalBtnDesk]}
                  onPress={closeAddModal}
                >
                  <Text style={styles.modalCancelTxt}>{addedDuringSession ? 'Lukk' : 'Avbryt'}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalSaveBtn,
                    isDesktop && styles.modalBtnDesk,
                    (!newTitle.trim() || saving) && { opacity: 0.5 },
                  ]}
                  onPress={addItem}
                  disabled={!newTitle.trim() || saving}
                >
                  <Text style={styles.modalSaveTxt}>{saving ? 'Legger til…' : 'Legg til'}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </OverlayHost>

      <Modal
        visible={!!editingItem}
        animationType={isDesktop ? 'fade' : 'fade'}
        transparent
        onRequestClose={closeEdit}
      >
        <Pressable style={[styles.modalBackdrop, isDesktop && desktopOverlay]} onPress={closeEdit}>
          <Pressable
            style={[styles.modalCard, isDesktop && [desktopSheet, styles.modalCardDesk]]}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, isDesktop && styles.modalTitleDesk]}>Rediger vare</Text>

            {(editImageLocalUri || editImageUrl) ? (
              <View style={styles.imageAttachedRow}>
                <TouchableOpacity
                  onPress={pickEditItemImage}
                  accessibilityRole="button"
                  accessibilityLabel="Bytt bilde"
                >
                  <Image
                    source={{ uri: editImageLocalUri || editImageUrl }}
                    style={styles.imageAttachedThumb}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
                <View style={styles.imageAttachedMeta}>
                  <TouchableOpacity onPress={pickEditItemImage} accessibilityRole="button">
                    <Text style={styles.imageAttachTitle}>Bytt bilde</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={clearEditItemImage} style={styles.imageRemoveBtn}>
                    <Text style={styles.imageRemoveTxt}>Fjern bilde</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.imageAttachBtn, isDesktop && styles.imageAttachBtnDesk]}
                onPress={pickEditItemImage}
                accessibilityRole="button"
                accessibilityLabel="Legg til bilde"
              >
                <Ionicons name="camera-outline" size={18} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.imageAttachTitle}>Legg til bilde</Text>
                  <Text style={styles.imageAttachHint}>Valgfritt</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
            )}

            <Text style={[styles.modalLabel, isDesktop && styles.modalLabelDesk]}>Navn</Text>
            <TextInput
              style={[styles.modalInput, isDesktop && styles.modalInputDesk]}
              value={editTitle}
              onChangeText={setEditTitle}
              placeholder="F.eks. Brød"
              autoFocus
            />
            <Text style={[styles.modalLabel, isDesktop && styles.modalLabelDesk]}>Beskrivelse</Text>
            <TextInput
              style={[styles.modalInput, styles.modalDescInput, isDesktop && styles.modalInputDesk]}
              value={editDescription}
              onChangeText={setEditDescription}
              placeholder="F.eks. grovt, 1 stk"
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalCancelBtn, isDesktop && styles.modalBtnDesk]}
                onPress={closeEdit}
              >
                <Text style={styles.modalCancelTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, isDesktop && styles.modalBtnDesk, editSaving && { opacity: 0.6 }]}
                onPress={saveEdit}
                disabled={editSaving}
              >
                <Text style={styles.modalSaveTxt}>{editSaving ? 'Lagrer…' : 'Lagre'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <InfoDialog
        visible={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        onClose={() => setDialog(null)}
      />

      <ConfirmDialog
        visible={!!pantryPrompt}
        title="Handletur ferdig"
        message={`${pantryPrompt?.doneMsg || ''}\n\nVil du legge de ${pantryPrompt?.items?.length || 0} kryssede varene inn i familielageret?`}
        cancelText="Nei takk"
        confirmText="Legg i lager"
        onCancel={() => {
          setPantryPrompt(null);
          setDialog({
            title: 'Handletur ferdig',
            message: pantryPrompt?.doneMsg || 'Handleturen er avsluttet.',
          });
        }}
        onConfirm={async () => {
          const prompt = pantryPrompt;
          setPantryPrompt(null);
          try {
            const { added, merged } = await addDoneShoppingToPantry(
              prompt?.famId,
              prompt?.items || [],
              uid,
              pantryItems,
            );
            setDialog({
              title: 'Lagt i lager',
              message: `${added} nye · ${merged} sammenslått. Du kan også lim inn ekstra linjer fra kvitteringen.`,
            });
            // Åpne kvitteringslinjer etter at infosdialogen lukkes — unngå dobbel modal.
            setTimeout(() => setReceiptLinesOpen(true), 350);
          } catch {
            setDialog({
              title: 'Handletur ferdig',
              message: `${prompt?.doneMsg || ''} Klarte ikke å oppdatere lageret.`.trim(),
            });
          }
        }}
        onClose={() => setPantryPrompt(null)}
      />

      <Modal visible={receiptLinesOpen} transparent animationType="fade" onRequestClose={() => setReceiptLinesOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setReceiptLinesOpen(false)}>
          <Pressable style={styles.modalCard} onPress={() => {}} onStartShouldSetResponder={() => true}>
            <Text style={styles.modalTitle}>Varer fra kvittering</Text>
            <Text style={styles.modalLabel}>Én vare per linje (manuelt — ingen OCR)</Text>
            <TextInput
              style={[styles.modalInput, styles.modalDescInput]}
              value={receiptLines}
              onChangeText={setReceiptLines}
              multiline
              placeholder={'Melk 1 L\nBrød\nEgg 12 stk'}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setReceiptLinesOpen(false)}>
                <Text style={styles.modalCancelTxt}>Hopp over</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, receiptBusy && { opacity: 0.7 }]}
                onPress={saveReceiptLines}
                disabled={receiptBusy}
              >
                <Text style={styles.modalSaveTxt}>{receiptBusy ? 'Lagrer…' : 'Legg i lager'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={closeScanFlow}
        onScan={handleBarcodeScanned}
        title="Skann vare"
        hint="Hold strekkoden på varen i rammen. Perfekt på handletur!"
        permissionText="Vi trenger kamera for å skanne varer i butikken."
        normalize={normalizeScan}
        resumeKey={scanResumeKey}
      />

      <ProductScanResultModal
        visible={scanResultOpen}
        loading={scanLoading}
        error={scanError}
        product={scannedProduct}
        onClose={closeScanFlow}
        onAdd={addScannedProduct}
        onScanAgain={resumeScanner}
        saving={saving}
      />
    </Frame>
  );
}

const styles = StyleSheet.create({
  shellFrame: { flex: 1, minHeight: 0 },
  bgWrap: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 10,
    zIndex: 0,
  },
  bgArt: {
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },
  page: {
    flex: 1,
    minHeight: 0,
    padding: 16,
    gap: 10,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  list: { flex: 1, minHeight: 0, backgroundColor: 'transparent' },
  listContent: { paddingBottom: 32, flexGrow: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  topActions: { alignItems: 'flex-end', gap: 6, flexShrink: 0 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  listTitle: { fontSize: 18, fontWeight: '400', color: colors.ink, letterSpacing: -0.2 },
  listTitleDesk: { fontSize: 16, fontWeight: '400' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 2, alignSelf: 'flex-start' },
  backTxt: { fontWeight: '400', color: colors.brand, fontSize: 13 },
  settingsBtn: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
  },
  scanBtn: {
    width: 36, height: 36, borderRadius: 8, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
    overflow: 'visible',
  },
  sessionBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  sessionBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#eef6ff', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#bfdbfe',
  },
  sessionBannerTxt: { flex: 1, color: colors.ink, fontWeight: '400', fontSize: 12 },
  flyerLink: { color: colors.brand, fontWeight: '400', fontSize: 12 },
  receiptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4,
  },
  receiptTxt: { color: colors.muted, fontWeight: '400', fontSize: 12 },
  badges: { flexDirection: 'row', gap: 8 },
  badgesMobile: { gap: 4 },
  countBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.brandSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  countTxt: { fontWeight: '400', color: colors.brand, fontSize: 12 },

  filterRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filterRowDesk: { gap: 5 },
  filterBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  filterBtnDesk: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6 },
  filterOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterTxt: { fontWeight: '500', color: colors.ink, fontSize: 12 },
  filterTxtDesk: { fontWeight: '500', fontSize: 12 },
  filterTxtOn: { color: '#fff' },

  deskAddWrap: { marginBottom: 8, alignSelf: 'flex-start' },

  addBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  addKeyboardRoot: { flex: 1 },
  addSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 20, maxHeight: '88%',
  },
  addSheetDesk: {
    maxWidth: 420, width: '100%', maxHeight: '82%',
    borderRadius: 12, marginBottom: 0, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16,
  },
  addSheetScrollView: { flexGrow: 0, flexShrink: 1 },
  addSheetScroll: { gap: 8, paddingBottom: 8 },
  addSheetFooter: {
    flexDirection: 'row', justifyContent: 'flex-end', gap: 10,
    paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  addSheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line, marginBottom: 8,
  },
  addSheetTitle: { fontSize: 17, fontWeight: '400', color: colors.ink, marginBottom: 4 },
  addSheetTitleDesk: { fontSize: 16, fontWeight: '500', marginBottom: 2 },
  addSuccessBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#dcfce7', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10,
    borderWidth: 1, borderColor: '#86efac', marginBottom: 6,
  },
  addSuccessTxt: { flex: 1, fontWeight: '400', color: '#166534', fontSize: 13 },
  scanLink: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 8, backgroundColor: '#eef6ff', borderWidth: 1, borderColor: '#93c5fd',
    marginBottom: 2,
  },
  scanLinkDesk: { paddingVertical: 5, borderRadius: 6 },
  scanLinkTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  scanLinkTxtDesk: { fontWeight: '500', fontSize: 13 },
  imageAttachBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderRadius: 10, borderWidth: 1, borderColor: colors.line,
    backgroundColor: '#f8fafc', paddingVertical: 10, paddingHorizontal: 12,
  },
  imageAttachBtnDesk: { borderRadius: 8, paddingVertical: 8 },
  imageAttachTitle: { fontWeight: '400', color: colors.ink, fontSize: 13 },
  imageAttachHint: { fontWeight: '400', color: colors.muted, fontSize: 11, marginTop: 1 },
  imageAttachedRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    borderRadius: 10, borderWidth: 1, borderColor: colors.line,
    backgroundColor: '#f8fafc', padding: 8,
  },
  imageAttachedThumb: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#e2e8f0' },
  imageAttachedMeta: { flex: 1, gap: 2 },
  imageRemoveBtn: { alignSelf: 'flex-start', paddingVertical: 2 },
  imageRemoveTxt: { color: '#b91c1c', fontWeight: '500', fontSize: 12 },

  autoCatRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.brandSoft, borderRadius: 8, padding: 8,
  },
  autoCatIcon: { fontSize: 16 },
  autoCatTxt: { fontWeight: '500', color: colors.ink, fontSize: 13 },

  catSection: { gap: 8 },
  catExpandBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#f8fafc', borderRadius: 8, padding: 10,
    borderWidth: 1, borderColor: colors.line,
  },
  catExpandLbl: { fontWeight: '400', color: colors.ink, fontSize: 13 },
  catExpandHint: { fontWeight: '400', color: colors.muted, fontSize: 12, marginTop: 2 },
  catChips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  catChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: colors.line },
  catChipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  catChipTxt: { fontWeight: '500', color: colors.ink, fontSize: 12 },
  catChipTxtActive: { color: '#fff' },
  catMoreBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  catMoreTxt: { fontWeight: '500', color: colors.brand, fontSize: 12 },
  recurToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7, backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brand, marginTop: 2 },
  recurToggleOn: { backgroundColor: colors.brand },
  recurToggleTxt: { fontWeight: '500', color: colors.brand, fontSize: 12 },

  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, marginTop: 8 },
  catTitle: { fontWeight: '400', color: colors.ink, fontSize: 13 },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.card,
    borderRadius: 10, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: colors.line,
  },
  itemDone: { opacity: 0.65, backgroundColor: '#f0fdf4' },
  trashRow: { opacity: 0.9, backgroundColor: '#f8fafc' },
  restoreBtn: {
    alignSelf: 'flex-start',
    padding: 8, borderRadius: 8, backgroundColor: '#eef6ff',
    borderWidth: 1, borderColor: '#93c5fd',
  },
  checkArea: { padding: 4 },
  checkbox: {
    width: 26, height: 26, borderRadius: 7, borderWidth: 2,
    borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  checkboxDone: { backgroundColor: '#10b981', borderColor: '#10b981' },
  itemTitle: { fontWeight: '400', fontSize: 14, color: colors.ink },
  itemTitleDone: { textDecorationLine: 'line-through', color: colors.muted },
  itemDesc: { marginTop: 2, fontWeight: '400', fontSize: 12, color: colors.muted },
  itemDescDone: { textDecorationLine: 'line-through' },
  itemThumb: { width: 36, height: 36, borderRadius: 7, backgroundColor: '#f1f5f9' },
  recurBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.brandSoft, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  recurTxt: { fontWeight: '500', color: colors.brand, fontSize: 10 },
  addedBy: { color: colors.muted, fontWeight: '400', fontSize: 11 },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 20,
  },
  modalCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 18, gap: 8,
    width: '100%', maxWidth: 420, alignSelf: 'center',
  },
  modalCardDesk: {
    maxWidth: 420, width: '100%', borderRadius: 12, padding: 16, gap: 6,
  },
  modalTitle: { fontSize: 17, fontWeight: '400', color: colors.ink, marginBottom: 4 },
  modalTitleDesk: { fontSize: 16, fontWeight: '500', marginBottom: 2 },
  modalLabel: { fontWeight: '500', color: colors.ink, fontSize: 13, marginTop: 2 },
  modalLabelDesk: { fontWeight: '500', fontSize: 12 },
  modalInput: {
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    padding: 12, fontSize: 15, fontWeight: '400', color: colors.ink,
  },
  modalInputDesk: { paddingVertical: 8, paddingHorizontal: 12, fontSize: 14, borderRadius: 8 },
  modalDescInput: { minHeight: 44, textAlignVertical: 'top' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 10 },
  modalCancelBtn: {
    alignSelf: 'flex-start', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#e5e7eb' },
  modalCancelTxt: { fontWeight: '500', color: colors.ink, fontSize: 14 },
  modalSaveBtn: {
    alignSelf: 'flex-start', paddingVertical: 9, paddingHorizontal: 16, borderRadius: 8, backgroundColor: colors.brand },
  modalSaveTxt: { fontWeight: '400', color: '#fff', fontSize: 14 },
  modalBtnDesk: { paddingVertical: 8, borderRadius: 7 },
});