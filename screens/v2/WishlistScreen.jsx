import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Image,
  Modal, ActivityIndicator, ScrollView, Linking, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Mute } from '../../components/ui';
import ShellAddButton from '../../components/ShellAddButton';
import HelpTarget from '../../components/HelpTarget';
import OverlayHost from '../../components/OverlayHost';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelp } from '../../src/context/HelpContext';
import { useHelpScene, useHelpTourAnchor } from '../../src/hooks/useHelpScene';
import CompactBackLink from '../../components/CompactBackLink';
import ConfirmDialog, { InfoDialog } from '../../components/ConfirmDialog';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import ProductScanResultModal from '../../components/ProductScanResultModal';
import { isValidBarcode, normalizeBarcode } from '../../src/utils/barcode';
import { lookupProduct } from '../../src/utils/productLookup';
import { pickImage, uploadImage } from '../../src/utils/media';
import {
  listenWishlist, listenWishItems, listenWishSecrets, addWishItem, updateWishItem, deleteWishItem,
  reserveWishItem, unreserveWishItem, purchaseWishItem, unpurchaseWishItem,
  deleteWishlist, updateWishlist, setWishlistSharing, migrateLegacyReservations,
  canReserveWish, canPurchaseWish, canEditWishContent, canManageWishlist, canShareWishlist,
  shouldHideReservations, wishlistSecretUids,
  formatWishPrice, formatOccasionDate,
  mergeWishSecrets, wishReservationStatus, reservationWhoLabel, hasLegacyReservationFields,
  resolveWishlistViewers, wishlistShareHint, shareStateFromList, buildWishlistSharePatch,
  memberUids, isWishlistDraft,
} from '../../src/utils/wishlists';
import { notifyUsers } from '../../src/utils/notifications';
import MemberAvatarStack from '../../components/MemberAvatarStack';
import WishlistSharePicker from '../../components/WishlistSharePicker';
import { familyShareMemberUids } from '../../src/utils/grandparentAccess';
import { friendUidsFromViewerList } from '../../src/utils/albumVisibility';
import {
  shareWishlistWithFriends,
  unshareWishlistWithFriend,
} from '../../src/utils/friends';

function emptyForm() {
  return { title: '', price: '', url: '', note: '', brand: '', imageUrl: null, imageLocalUri: null };
}

export default function WishlistScreen({ listId, listFamilyId = null, onBack, mode = 'owner' }) {
  const { isDesktop } = useLayout();
  const {
    familyId: activeFamilyId, members, uid, isAdmin, isParent, isActingAsChild, activeChild, meChild, isChild,
    isGrandparent, liveFamilies, families, friendPeople,
  } = useApp();
  const familyId = listFamilyId || activeFamilyId;
  const { mode: helpMode } = useHelp();
  const tourAnchor = useHelpTourAnchor();
  useHelpScene('inner', { onRetreat: onBack });
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(false);

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResumeKey, setScanResumeKey] = useState(0);
  const [scanResultOpen, setScanResultOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scannedProduct, setScannedProduct] = useState(null);

  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [editingItem, setEditingItem] = useState(null);
  const [itemMenu, setItemMenu] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsName, setSettingsName] = useState('');
  const [settingsDate, setSettingsDate] = useState('');
  const [settingsNotify, setSettingsNotify] = useState(true);
  const [shareMode, setShareMode] = useState('family');
  const [shareViewerUids, setShareViewerUids] = useState([]);
  const [shareFamilyIds, setShareFamilyIds] = useState([]);
  const [secrets, setSecrets] = useState([]);
  const [confirmDeleteList, setConfirmDeleteList] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const listRef = React.useRef(null);

  const profileChild = isChild ? meChild : (isActingAsChild ? activeChild : null);
  const profileChildId = profileChild?.id || null;
  const myName = members.find((m) => m.uid === uid)?.name || '';

  useEffect(() => {
    if (!familyId || !listId) return undefined;
    return listenWishlist(familyId, listId, setList);
  }, [familyId, listId]);

  useEffect(() => {
    if (!familyId || !listId) return undefined;
    return listenWishItems(familyId, listId, setItems);
  }, [familyId, listId]);

  const actor = useMemo(() => ({
    uid,
    childId: profileChildId,
    isAdmin,
    isParent: isParent && !isGrandparent,
    isChild,
    isActingAsChild,
    isGrandparent,
    familyId: activeFamilyId,
  }), [uid, profileChildId, isAdmin, isParent, isChild, isActingAsChild, isGrandparent, activeFamilyId]);
  const hideReservations = shouldHideReservations(list, actor);

  useEffect(() => {
    if (!familyId || !listId || hideReservations) {
      setSecrets([]);
      return undefined;
    }
    return listenWishSecrets(familyId, listId, setSecrets);
  }, [familyId, listId, hideReservations]);

  const displayItems = useMemo(
    () => mergeWishSecrets(items, secrets, { hideReservations }),
    [items, secrets, hideReservations],
  );

  useEffect(() => {
    // Vent til listen er lastet — ellers er hideReservations midlertidig false.
    if (!list || hideReservations || !familyId || !listId) return;
    const legacy = (items || []).filter((item) => hasLegacyReservationFields(item));
    if (!legacy.length) return;
    migrateLegacyReservations(familyId, listId, legacy).catch(() => {});
  }, [list, hideReservations, familyId, listId, items]);
  const canEdit = canEditWishContent(list, actor);
  const canManage = canManageWishlist(list, actor);
  const canShare = canShareWishlist(list, actor)
    && (!list?.familyId || list.familyId === activeFamilyId);
  const reservedCount = hideReservations
    ? 0
    : displayItems.filter((i) => wishReservationStatus(i) === 'reserved').length;
  const purchasedCount = hideReservations
    ? 0
    : displayItems.filter((i) => wishReservationStatus(i) === 'purchased').length;
  const occasionLabel = formatOccasionDate(list?.occasionDate);
  const viewers = useMemo(
    () => resolveWishlistViewers(list, {
      members,
      familyId,
      families: liveFamilies || families || [],
    }),
    [list, members, familyId, liveFamilies, families],
  );
  const draft = isWishlistDraft(list);
  const shareHint = wishlistShareHint(viewers);

  const forLabel = useMemo(() => {
    if (!list) return '';
    if (list.scope === 'family' || list.kind === 'family_shared') {
      return 'Felles for hele familien';
    }
    if (list.forChildName) {
      return list.createdByName && list.createdBy !== list.subjectUid
        ? `${list.createdByName} på vegne av ${list.forChildName}`
        : list.forChildName;
    }
    if (list.forMemberName) {
      return list.createdByName && list.createdBy !== list.forMemberUid
        ? `${list.createdByName} på vegne av ${list.forMemberName}`
        : list.forMemberName;
    }
    return list.createdByName ? `Opprettet av ${list.createdByName}` : '';
  }, [list]);

  const openAddForm = useCallback(() => {
    setEditingItem(null);
    setForm(emptyForm());
    setFormOpen(true);
  }, []);

  const shellWishAdd = useMemo(() => {
    if (!canEdit || formOpen) return null;
    return <ShellAddButton label="Nytt ønske" onPress={openAddForm} />;
  }, [isDesktop, canEdit, formOpen, openAddForm]);
  useShellTitleRight(shellWishAdd);

  const closeForm = useCallback(() => {
    if (saving) return;
    setFormOpen(false);
    setEditingItem(null);
    setForm(emptyForm());
  }, [saving]);

  useEffect(() => {
    if (tourAnchor === 'input') {
      setFormOpen(true);
      return;
    }
    if (tourAnchor && tourAnchor !== 'input' && formOpen && !editingItem) {
      setFormOpen(false);
    }
  }, [tourAnchor]);

  const openEditForm = useCallback((item) => {
    setEditingItem(item);
    setForm({
      title: item.title || '',
      price: item.price != null ? String(item.price) : '',
      url: item.url || '',
      note: item.note || '',
      brand: item.brand || '',
      imageUrl: item.imageUrl || null,
      imageLocalUri: null,
    });
    setItemMenu(null);
    setFormOpen(true);
  }, []);

  const pickFormImage = useCallback(async () => {
    try {
      const picked = await pickImage({ aspect: [1, 1], edit: true });
      if (!picked) return;
      setForm((f) => ({
        ...f,
        imageLocalUri: picked.uri || null,
        imageUrl: f.imageUrl,
        _picked: picked,
      }));
    } catch {
      setDialog({ title: 'Bilde', message: 'Klarte ikke hente bildet.' });
    }
  }, []);

  const normalizeScan = useCallback((raw) => {
    const normalized = normalizeBarcode(raw);
    return isValidBarcode(normalized) ? normalized : null;
  }, []);

  const handleBarcodeScanned = useCallback(async (code) => {
    if (!canEdit) return;
    // Keep scanner warm — avoid the "Åpne kamera" gate between items.
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
  }, [canEdit]);

  const resumeScanner = useCallback(() => {
    setScanResultOpen(false);
    setScanError(null);
    setScannedProduct(null);
    setScanResumeKey((k) => k + 1);
    setScannerOpen(true);
  }, []);

  const addScannedProduct = useCallback(async () => {
    if (!canEdit || !scannedProduct || !familyId || !listId) return;
    setSaving(true);
    try {
      await addWishItem(familyId, listId, {
        title: scannedProduct.title,
        brand: scannedProduct.brand || null,
        barcode: scannedProduct.barcode,
        imageUrl: scannedProduct.imageUrl || null,
        createdByUid: uid,
        createdByName: myName,
      });
      resumeScanner();
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke legge til ønsket.' });
    } finally {
      setSaving(false);
    }
  }, [canEdit, scannedProduct, familyId, listId, uid, myName, resumeScanner]);

  const closeScanFlow = useCallback(() => {
    setScannerOpen(false);
    setScanResultOpen(false);
    setScanLoading(false);
    setScanError(null);
    setScannedProduct(null);
  }, []);

  const submitForm = useCallback(async () => {
    if (!canEdit) return;
    const title = form.title.trim();
    if (!title || !familyId || !listId) return;
    setSaving(true);
    try {
      const priceNum = form.price.trim() ? Number(String(form.price).replace(',', '.')) : null;
      let imageUrl = form.imageUrl || null;
      if (form._picked || form.imageLocalUri) {
        try {
          const picked = form._picked || { uri: form.imageLocalUri };
          imageUrl = await uploadImage(
            `families/${familyId}/wishlists/${listId}/items/${Date.now()}.jpg`,
            picked,
          );
        } catch {
          // behold eksisterende bilde hvis opplasting feiler
        }
      }
      const payload = {
        title,
        brand: form.brand.trim() || null,
        price: Number.isFinite(priceNum) ? priceNum : null,
        url: form.url.trim() || null,
        note: form.note.trim() || null,
        imageUrl,
      };
      if (editingItem) {
        await updateWishItem(familyId, listId, editingItem.id, payload);
      } else {
        await addWishItem(familyId, listId, {
          ...payload,
          createdByUid: uid,
          createdByName: myName,
        });
      }
      setFormOpen(false);
      setEditingItem(null);
      setForm(emptyForm());
      requestAnimationFrame(() => {
        listRef.current?.scrollTo?.({ y: 0, animated: true });
      });
    } catch {
      setDialog({
        title: 'Feil',
        message: editingItem ? 'Klarte ikke lagre endringen.' : 'Klarte ikke legge til ønsket.',
      });
    } finally {
      setSaving(false);
    }
  }, [canEdit, form, familyId, listId, editingItem, uid, myName]);

  const toggleReserve = useCallback(async (item) => {
    if (!familyId || !listId || !canReserveWish(list, item, actor)) return;
    try {
      if (item.reservedByUid === uid && !item.purchasedByUid) {
        await unreserveWishItem(familyId, listId, item.id);
      } else if (!item.reservedByUid && !item.purchasedByUid) {
        await reserveWishItem(familyId, listId, item.id, { uid, name: myName });
        if (list?.notifyOnReserve !== false) {
          const secret = new Set(wishlistSecretUids(list));
          const recipients = (members || [])
            .map((m) => m.uid)
            .filter((id) => id && id !== uid && !secret.has(id));
          const extra = (list.viewerUids || []).filter((id) => id && id !== uid && !secret.has(id));
          const all = [...new Set([...recipients, ...extra])];
          if (all.length) {
            notifyUsers(all, {
              eventType: 'wishReserved',
              title: 'Gave reservert',
              body: item.title || 'Et ønske er reservert',
              familyId,
              createdBy: uid,
            }).catch(() => {});
          }
        }
      }
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke oppdatere reservasjon.' });
    }
    setItemMenu(null);
  }, [familyId, listId, list, actor, uid, myName, members]);

  const togglePurchase = useCallback(async (item) => {
    if (!familyId || !listId || !canPurchaseWish(list, item, actor)) return;
    try {
      if (item.purchasedByUid === uid) {
        await unpurchaseWishItem(familyId, listId, item.id, { item });
      } else {
        await purchaseWishItem(familyId, listId, item.id, { uid, name: myName, item });
        if (list?.notifyOnReserve !== false) {
          const secret = new Set(wishlistSecretUids(list));
          const recipients = [...new Set([
            ...(members || []).map((m) => m.uid),
            ...(list.viewerUids || []),
          ])].filter((id) => id && id !== uid && !secret.has(id));
          if (recipients.length) {
            notifyUsers(recipients, {
              eventType: 'wishPurchased',
              title: 'Gave kjøpt',
              body: item.title || 'Et ønske er kjøpt',
              familyId,
              createdBy: uid,
            }).catch(() => {});
          }
        }
      }
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke oppdatere kjøp.' });
    }
    setItemMenu(null);
  }, [familyId, listId, list, actor, uid, myName, members]);

  const askRemoveItem = useCallback((item) => {
    if (!canEdit || !item) return;
    setItemMenu(null);
    setConfirmDeleteItem(item);
  }, [canEdit]);

  const doRemoveItem = useCallback(async () => {
    const item = confirmDeleteItem;
    setConfirmDeleteItem(null);
    if (!item || !canEdit || !familyId || !listId) return;
    setDeleting(true);
    try {
      await deleteWishItem(familyId, listId, item.id);
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke slette ønsket.' });
    } finally {
      setDeleting(false);
    }
  }, [confirmDeleteItem, canEdit, familyId, listId]);

  const openUrl = useCallback(async (url) => {
    if (!url) return;
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) await Linking.openURL(url);
      else setDialog({ title: 'Lenke', message: 'Kunne ikke åpne lenken.' });
    } catch {
      setDialog({ title: 'Lenke', message: 'Kunne ikke åpne lenken.' });
    }
    setItemMenu(null);
  }, []);

  const openSettings = useCallback(() => {
    const state = shareStateFromList(list, { uid, members });
    setSettingsName(list?.name || '');
    setSettingsDate(list?.occasionDate ? String(list.occasionDate).slice(0, 10) : '');
    setSettingsNotify(list?.notifyOnReserve !== false);
    setShareMode(state.mode);
    setShareViewerUids(state.viewerUids);
    setShareFamilyIds(state.sharedFamilyIds);
    setSettingsOpen(true);
  }, [list, uid, members]);

  const saveSettings = useCallback(async () => {
    if ((!canManage && !canShare) || !familyId || !listId) return;
    setSaving(true);
    try {
      if (canManage) {
        await updateWishlist(familyId, listId, {
          name: settingsName.trim() || list?.name || 'Ønskeliste',
          occasionDate: settingsDate.trim() || null,
          notifyOnReserve: !!settingsNotify,
        });
      }
      if (canShare) {
        const ownerIds = [list?.subjectUid, list?.ownerUid, list?.createdBy, uid].filter(Boolean);
        const extraUids = [];
        for (const fid of shareFamilyIds) {
          const fam = (liveFamilies || families || []).find((f) => f.id === fid);
          extraUids.push(...(fam?.members || fam?.memberIds || []));
        }
        const patch = buildWishlistSharePatch({
          mode: shareMode,
          viewerUids: shareViewerUids,
          sharedFamilyIds: shareFamilyIds,
          uid,
          ownerIds,
          familyMemberUids: familyShareMemberUids(members),
          otherFamilyMemberUids: extraUids,
        });
        const previous = new Set(list?.viewerUids || []);
        const previousFriends = friendUidsFromViewerList([...previous], { members, uid });
        const nextFriends = friendUidsFromViewerList(patch.viewerUids, { members, uid });
        await setWishlistSharing(familyId, listId, patch);
        const listTitle = settingsName.trim() || list?.name || 'Ønskeliste';
        if (nextFriends.length) {
          await shareWishlistWithFriends({
            familyId,
            listId,
            listTitle,
            ownerUid: uid,
            ownerName: myName,
            friendUids: nextFriends,
          }).catch(() => {});
        }
        const removedFriends = previousFriends.filter((id) => !nextFriends.includes(id));
        await Promise.all(removedFriends.map((fid) => (
          unshareWishlistWithFriend({ listId, friendUid: fid })
        )));
        const friendSet = new Set(nextFriends);
        const added = (patch.viewerUids || []).filter((id) => (
          id && id !== uid && !previous.has(id)
          && !(wishlistSecretUids(list) || []).includes(id)
          && !friendSet.has(id)
        ));
        if (added.length && patch.published) {
          notifyUsers(added, {
            eventType: 'wishShared',
            title: 'Ønskeliste delt',
            body: `${listTitle} er delt med deg`,
            familyId,
            listId,
            createdBy: uid,
          }).catch(() => {});
        }
      }
      setSettingsOpen(false);
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke lagre innstillinger.' });
    } finally {
      setSaving(false);
    }
  }, [
    canManage, canShare, familyId, listId, settingsName, settingsDate, settingsNotify, list,
    shareMode, shareViewerUids, shareFamilyIds, uid, members, liveFamilies, families,
  ]);

  const askDeleteList = useCallback(() => {
    if (!canManage || !familyId || !listId) return;
    setSettingsOpen(false);
    setConfirmDeleteList(true);
  }, [canManage, familyId, listId]);

  const doDeleteList = useCallback(async () => {
    setConfirmDeleteList(false);
    if (!canManage || !familyId || !listId) return;
    setDeleting(true);
    try {
      await deleteWishlist(familyId, listId);
      onBack?.();
    } catch {
      setDialog({ title: 'Feil', message: 'Klarte ikke slette listen.' });
    } finally {
      setDeleting(false);
    }
  }, [canManage, familyId, listId, onBack]);

  const renderItem = useCallback((item) => {
    const status = hideReservations ? null : wishReservationStatus(item);
    const reserved = status === 'reserved';
    const purchased = status === 'purchased';
    const priceLabel = formatWishPrice(item.price, item.currency);
    const whoLabel = status ? reservationWhoLabel(item, uid) : '';
    const hasImage = !!item.imageUrl;

    return (
      <TouchableOpacity
        key={item.id}
        style={[
          styles.card, styles.cardCompact,
          reserved && styles.cardReserved,
          purchased && styles.cardPurchased,
        ]}
        onPress={() => setItemMenu(item)}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <View style={styles.cardCompactRow}>
          <View style={styles.cardThumbWrap}>
            {hasImage ? (
              <Image source={{ uri: item.imageUrl }} style={styles.cardThumb} resizeMode="cover" />
            ) : (
              <View style={[styles.cardThumb, styles.cardImagePh]}>
                <Ionicons name="gift-outline" size={18} color={colors.muted} />
              </View>
            )}
            {(reserved || purchased) && (
              <View style={[styles.thumbReservedBadge, purchased && styles.thumbPurchasedBadge]} pointerEvents="none">
                <Text style={styles.thumbReservedTxt}>{purchased ? '✓' : '♥'}</Text>
              </View>
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.cardTitleCompact} numberOfLines={2}>{item.title}</Text>
            {!!item.brand && (
              <Text style={styles.cardBrandCompact} numberOfLines={1}>{item.brand}</Text>
            )}
            {!!priceLabel && <Text style={styles.cardPrice}>{priceLabel}</Text>}
            {whoLabel ? (
              <Text style={styles.cardWho} numberOfLines={1}>{whoLabel}</Text>
            ) : null}
          </View>
          {!hideReservations && (
            <View style={[
              styles.statusDotInline,
              purchased ? styles.statusDotPurchased : (reserved ? styles.statusDotReserved : styles.statusDotOpen),
            ]} />
          )}
        </View>
      </TouchableOpacity>
    );
  }, [hideReservations, uid]);

  return (
    <View style={[styles.wrap, isDesktop && styles.wrapDesk]}>
      <View style={styles.topBar}>
        <CompactBackLink onPress={onBack} label="Tilbake" />
        <View style={styles.topActions}>
          {canShare && (
            <TouchableOpacity onPress={openSettings} hitSlop={10} style={styles.iconBtn} accessibilityLabel="Del listen">
              <Ionicons name="share-outline" size={18} color={colors.brand} />
            </TouchableOpacity>
          )}
          {canManage && (
            <TouchableOpacity onPress={openSettings} hitSlop={10} style={styles.iconBtn}>
              <Ionicons name="ellipsis-horizontal" size={18} color={colors.ink} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView
        ref={listRef}
        contentContainerStyle={[styles.scrollContent, isDesktop && styles.scrollContentDesk]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, isDesktop && styles.titleDesk]}>{list?.name || 'Ønskeliste'}</Text>
        {!!forLabel && <Text style={[styles.forLabel, isDesktop && styles.forLabelDesk]}>{forLabel}</Text>}
        <View style={styles.viewersRow}>
          {viewers?.people?.length ? (
            <MemberAvatarStack people={viewers.people} size={22} max={5} />
          ) : (
            <Ionicons name={draft ? 'lock-closed-outline' : 'eye-outline'} size={16} color={colors.muted} />
          )}
          <Text style={styles.viewersTxt} numberOfLines={2}>{shareHint || viewers?.label}</Text>
        </View>
        {!!occasionLabel && (
          <View style={styles.dateInline}>
            <Ionicons name="time-outline" size={13} color={colors.muted} />
            <Text style={styles.dateInlineTxt}>{occasionLabel}</Text>
          </View>
        )}
        <Text style={[styles.stats, isDesktop && styles.statsDesk]}>
          {displayItems.length} {displayItems.length === 1 ? 'ønske' : 'ønsker'}
          {reservedCount > 0 ? ` · ${reservedCount} reservert` : ''}
          {purchasedCount > 0 ? ` · ${purchasedCount} kjøpt` : ''}
        </Text>

        {draft && canShare && (
          <TouchableOpacity
            style={[styles.familyBanner, isDesktop && styles.familyBannerDesk]}
            onPress={openSettings}
            activeOpacity={0.8}
          >
            <Ionicons name="lock-closed-outline" size={15} color={colors.brand} />
            <Text style={styles.familyBannerTxt}>
              Listen er bare synlig for deg. Trykk for å dele med familien eller andre familier når du er ferdig.
            </Text>
          </TouchableOpacity>
        )}

        {!canEdit && (
          <View style={[styles.familyBanner, isDesktop && styles.familyBannerDesk]}>
            <Ionicons name="heart-outline" size={15} color={colors.brand} />
            <Text style={styles.familyBannerTxt}>
              Du kan reservere gaver. Endring av ønsker skjer fra eierens side.
            </Text>
          </View>
        )}
        {hideReservations && canEdit && (
          <View style={[styles.familyBanner, isDesktop && styles.familyBannerDesk]}>
            <Ionicons name="eye-off-outline" size={15} color={colors.brand} />
            <Text style={styles.familyBannerTxt}>
              Reservasjoner og kjøp er skjult for deg, så gaven blir en overraskelse.
            </Text>
          </View>
        )}

        {displayItems.length === 0 ? (
          <View style={[styles.panel, isDesktop && styles.panelDesk]}>
            <Text style={styles.emptyInline}>
              {canEdit ? 'Ingen ønsker ennå. Bruk knappen over for å legge til.' : 'Ingen ønsker på listen ennå.'}
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {displayItems.map((item, i) => (
              <View key={item.id} style={styles.gridCellFull}>
                {i === 0 ? (
                  <HelpTarget id="content">{renderItem(item)}</HelpTarget>
                ) : renderItem(item)}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal
        visible={!!itemMenu}
        transparent
        animationType="fade"
        onRequestClose={() => setItemMenu(null)}
      >
        <Pressable
          style={[styles.menuBackdrop, isDesktop && desktopOverlay]}
          onPress={() => setItemMenu(null)}
        >
          <Pressable
            style={[styles.menuSheet, isDesktop && [desktopSheet, styles.menuSheetDesk]]}
            onPress={() => {}}
          >
            {!isDesktop ? <View style={styles.sheetHandle} /> : null}
            <Text style={[styles.menuTitle, isDesktop && styles.menuTitleDesk]} numberOfLines={2}>
              {itemMenu?.title}
            </Text>
            {itemMenu && canReserveWish(list, itemMenu, actor) && !itemMenu.purchasedByUid && (
              <TouchableOpacity style={styles.menuRow} onPress={() => toggleReserve(itemMenu)}>
                <Ionicons
                  name={itemMenu.reservedByUid === uid ? 'heart-dislike-outline' : 'heart-outline'}
                  size={18}
                  color={colors.brand}
                />
                <Text style={styles.menuRowTxt}>
                  {itemMenu.reservedByUid === uid ? 'Fjern reservasjon' : 'Reserver gave'}
                </Text>
              </TouchableOpacity>
            )}
            {itemMenu && canPurchaseWish(list, itemMenu, actor) && (
              <TouchableOpacity style={styles.menuRow} onPress={() => togglePurchase(itemMenu)}>
                <Ionicons
                  name={itemMenu.purchasedByUid === uid ? 'bag-remove-outline' : 'bag-check-outline'}
                  size={18}
                  color={colors.brand}
                />
                <Text style={styles.menuRowTxt}>
                  {itemMenu.purchasedByUid === uid ? 'Fjern kjøpt' : 'Marker som kjøpt'}
                </Text>
              </TouchableOpacity>
            )}
            {!!itemMenu?.url && (
              <TouchableOpacity style={styles.menuRow} onPress={() => openUrl(itemMenu.url)}>
                <Ionicons name="open-outline" size={18} color={colors.brand} />
                <Text style={styles.menuRowTxt}>Åpne lenke</Text>
              </TouchableOpacity>
            )}
            {canEdit && (
              <>
                <TouchableOpacity style={styles.menuRow} onPress={() => openEditForm(itemMenu)}>
                  <Ionicons name="pencil-outline" size={18} color={colors.brand} />
                  <Text style={styles.menuRowTxt}>Rediger</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuRow} onPress={() => askRemoveItem(itemMenu)}>
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  <Text style={[styles.menuRowTxt, { color: colors.danger }]}>Slett</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <OverlayHost
        inline={helpMode === 'module'}
        visible={formOpen}
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={closeForm}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={closeForm}
        >
          <Pressable
            style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
            onPress={() => {}}
          >
            {!isDesktop ? <View style={styles.sheetHandle} /> : null}
            <Text style={[styles.modalTitle, isDesktop && styles.modalTitleDesk]}>
              {editingItem ? 'Rediger ønske' : 'Nytt ønske'}
            </Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={isDesktop ? { maxHeight: 420 } : undefined}
            >
              <TouchableOpacity
                style={[styles.imagePicker, isDesktop && styles.imagePickerDesk]}
                onPress={pickFormImage}
              >
                {(form.imageLocalUri || form.imageUrl) ? (
                  <Image
                    source={{ uri: form.imageLocalUri || form.imageUrl }}
                    style={styles.imagePickerPreview}
                  />
                ) : (
                  <View style={[styles.imagePickerPh, isDesktop && styles.imagePickerPhDesk]}>
                    <Ionicons name="camera-outline" size={22} color={colors.brand} />
                    <Text style={styles.imagePickerTxt}>Legg til bilde</Text>
                    <Text style={styles.imagePickerSub}>Valgfritt</Text>
                  </View>
                )}
              </TouchableOpacity>
              {(form.imageLocalUri || form.imageUrl) && (
                <TouchableOpacity
                  onPress={() => setForm((f) => ({
                    ...f, imageLocalUri: null, imageUrl: null, _picked: null,
                  }))}
                  style={{ marginBottom: 8 }}
                >
                  <Text style={styles.removeImgTxt}>Fjern bilde</Text>
                </TouchableOpacity>
              )}
              <HelpTarget id="input">
                <TextInput
                  style={[styles.input, isDesktop && styles.inputDesk]}
                  placeholder="Hva ønsker du?"
                  placeholderTextColor={colors.muted}
                  value={form.title}
                  onChangeText={(t) => setForm((f) => ({ ...f, title: t }))}
                  autoFocus={!isDesktop}
                />
              </HelpTarget>
              <TextInput
                style={[styles.input, isDesktop && styles.inputDesk]}
                placeholder="Merke (valgfritt)"
                placeholderTextColor={colors.muted}
                value={form.brand}
                onChangeText={(t) => setForm((f) => ({ ...f, brand: t }))}
              />
              <TextInput
                style={[styles.input, isDesktop && styles.inputDesk]}
                placeholder="Pris (valgfritt)"
                placeholderTextColor={colors.muted}
                value={form.price}
                onChangeText={(t) => setForm((f) => ({ ...f, price: t }))}
                keyboardType="decimal-pad"
              />
              <TextInput
                style={[styles.input, isDesktop && styles.inputDesk]}
                placeholder="Lenke til butikk (valgfritt)"
                placeholderTextColor={colors.muted}
                value={form.url}
                onChangeText={(t) => setForm((f) => ({ ...f, url: t }))}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.input, isDesktop && styles.inputDesk, { minHeight: isDesktop ? 56 : 64 }]}
                placeholder="Notat (valgfritt)"
                placeholderTextColor={colors.muted}
                value={form.note}
                onChangeText={(t) => setForm((f) => ({ ...f, note: t }))}
                multiline
              />
              {!editingItem && (
                <TouchableOpacity
                  style={styles.scanLink}
                  onPress={() => { setFormOpen(false); setScannerOpen(true); }}
                >
                  <Ionicons name="barcode-outline" size={16} color={colors.brand} />
                  <Text style={styles.scanLinkTxt}>Eller skann strekkode</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, isDesktop && styles.modalBtnDesk]}
                onPress={closeForm}
                disabled={saving}
              >
                <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  isDesktop && styles.modalBtnDesk,
                  (!form.title.trim() || saving) && { opacity: 0.5 },
                ]}
                onPress={submitForm}
                disabled={!form.title.trim() || saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnTxt}>{editingItem ? 'Lagre' : 'Legg til'}</Text>
                )}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </OverlayHost>

      <Modal
        visible={settingsOpen}
        transparent
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={() => setSettingsOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={() => !saving && setSettingsOpen(false)}
        >
          <Pressable
            style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
            onPress={() => {}}
          >
            {!isDesktop ? <View style={styles.sheetHandle} /> : null}
            <Text style={[styles.modalTitle, isDesktop && styles.modalTitleDesk]}>Listeinnstillinger</Text>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Navn</Text>
              <TextInput
                style={[styles.input, isDesktop && styles.inputDesk]}
                value={settingsName}
                onChangeText={setSettingsName}
                editable={canManage}
              />
              <Text style={styles.fieldLabel}>Anledning / dato (ÅÅÅÅ-MM-DD)</Text>
              <TextInput
                style={[styles.input, isDesktop && styles.inputDesk]}
                value={settingsDate}
                onChangeText={setSettingsDate}
                placeholder="f.eks. 2026-12-24"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                editable={canManage}
              />
              {canShare && (
                <WishlistSharePicker
                  mode={shareMode}
                  viewerUids={shareViewerUids}
                  sharedFamilyIds={shareFamilyIds}
                  members={members}
                  friends={friendPeople || []}
                  families={liveFamilies || families || []}
                  familyId={familyId}
                  uid={uid}
                  ownerIds={[list?.subjectUid, list?.ownerUid, list?.createdBy, uid].filter(Boolean)}
                  disabled={saving}
                  hint="Del når listen er ferdig. Under Venner kan du valgfritt invitere venner. Eieren ser aldri hvem som reserverer eller kjøper."
                  onChange={({ mode, viewerUids, sharedFamilyIds }) => {
                    setShareMode(mode);
                    setShareViewerUids(viewerUids);
                    setShareFamilyIds(sharedFamilyIds);
                  }}
                />
              )}
              <TouchableOpacity
                style={styles.toggleRow}
                onPress={() => setSettingsNotify((v) => !v)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleTitle}>Varsling ved reservasjon og kjøp</Text>
                  <Text style={styles.toggleSub}>
                    Andre som ser listen får beskjed — ikke du som eier den.
                  </Text>
                </View>
                <Ionicons
                  name={settingsNotify ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={colors.brand}
                />
              </TouchableOpacity>
              {canManage && (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={askDeleteList}
                disabled={deleting}
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
                <Text style={[styles.menuRowTxt, { color: colors.danger }]}>Slett listen</Text>
              </TouchableOpacity>
              )}
            </ScrollView>
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, isDesktop && styles.modalBtnDesk]}
                onPress={() => setSettingsOpen(false)}
              >
                <Text style={styles.secondaryBtnTxt}>Lukk</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, isDesktop && styles.modalBtnDesk, saving && { opacity: 0.5 }]}
                onPress={saveSettings}
                disabled={saving}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnTxt}>Lagre</Text>}
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={closeScanFlow}
        onScan={handleBarcodeScanned}
        normalize={normalizeScan}
        title="Skann gaveønske"
        hint="Hold strekkoden innenfor rammen"
        permissionText="Vi trenger kamera for å skanne strekkoder på gaver."
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
        addLabel="Legg til i ønskelisten"
      />

      <ConfirmDialog
        visible={confirmDeleteList}
        title="Slett ønskeliste?"
        message={`Hele listen «${list?.name || 'Ønskeliste'}» og alle ønsker slettes. Dette kan ikke angres.`}
        confirmText="Slett"
        cancelText="Avbryt"
        danger
        onCancel={() => setConfirmDeleteList(false)}
        onConfirm={doDeleteList}
        onClose={() => setConfirmDeleteList(false)}
      />
      <ConfirmDialog
        visible={!!confirmDeleteItem}
        title="Slett ønske?"
        message={confirmDeleteItem
          ? `Fjerne «${confirmDeleteItem.title || 'ønske'}» fra listen?`
          : ''}
        confirmText="Slett"
        cancelText="Avbryt"
        danger
        onCancel={() => setConfirmDeleteItem(null)}
        onConfirm={doRemoveItem}
        onClose={() => setConfirmDeleteItem(null)}
      />
      <InfoDialog
        visible={!!dialog}
        title={dialog?.title}
        message={dialog?.message}
        onClose={() => setDialog(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 16, paddingTop: 4 },
  wrapDesk: { paddingHorizontal: 12, paddingTop: 8 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6,
  },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  iconBtn: {
    alignSelf: 'flex-start', padding: 6 },
  scrollContent: { paddingBottom: 28, gap: 2 },
  scrollContentDesk: { paddingBottom: 20 },
  deskAddWrap: { marginBottom: 8, alignSelf: 'flex-start' },
  title: { fontWeight: '400', fontSize: 18, color: colors.ink, marginTop: 2 },
  titleDesk: { fontWeight: '500', fontSize: 16 },
  forLabel: { color: colors.muted, fontWeight: '400', fontSize: 13, marginTop: 2 },
  forLabelDesk: { fontSize: 12 },
  viewersRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8,
  },
  viewersTxt: { flex: 1, color: colors.muted, fontWeight: '400', fontSize: 12, lineHeight: 16 },
  dateInline: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  dateInlineTxt: { fontWeight: '400', fontSize: 12, color: colors.muted },
  stats: { color: colors.muted, fontWeight: '500', fontSize: 12, marginTop: 6, marginBottom: 8 },
  statsDesk: { fontWeight: '400', fontSize: 12, marginBottom: 6 },
  familyBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.brandSoft, borderRadius: 10, padding: 10, marginBottom: 8,
  },
  familyBannerDesk: { borderRadius: 8, padding: 8 },
  familyBannerTxt: { flex: 1, color: colors.ink, fontWeight: '400', fontSize: 12, lineHeight: 17 },
  panel: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line, padding: 14,
  },
  panelDesk: { borderRadius: 8, padding: 12 },
  emptyInline: { color: colors.muted, fontWeight: '400', fontSize: 13, textAlign: 'center' },
  grid: { gap: 8 },
  gridCellFull: { width: '100%' },
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
    paddingBottom: 8,
  },
  cardCompact: { paddingBottom: 6 },
  cardReserved: { opacity: 0.72 },
  cardPurchased: { opacity: 0.58 },
  cardImagePh: { alignItems: 'center', justifyContent: 'center' },
  cardCompactRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingTop: 10, paddingBottom: 4,
  },
  cardThumbWrap: { position: 'relative' },
  cardThumb: {
    width: 48, height: 48, borderRadius: 10, backgroundColor: '#eef2f7',
  },
  thumbReservedBadge: {
    position: 'absolute', right: -3, bottom: -3,
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#ec4899',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff',
  },
  thumbReservedTxt: { color: '#fff', fontSize: 10, fontWeight: '400', lineHeight: 12 },
  thumbPurchasedBadge: { backgroundColor: '#16a34a' },
  cardTitleCompact: { fontWeight: '400', fontSize: 14, color: colors.ink },
  cardBrandCompact: { color: colors.muted, fontWeight: '400', fontSize: 11, marginTop: 1 },
  statusDotInline: { width: 8, height: 8, borderRadius: 4, marginRight: 4 },
  statusDotOpen: { backgroundColor: colors.success },
  statusDotReserved: { backgroundColor: '#ec4899' },
  statusDotPurchased: { backgroundColor: '#16a34a' },
  cardPrice: { color: colors.ink, fontWeight: '500', fontSize: 12, marginTop: 3 },
  cardWho: { color: colors.muted, fontWeight: '400', fontSize: 11, marginTop: 2 },

  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line, marginBottom: 12,
  },
  menuBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end',
  },
  menuSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 16, paddingBottom: 24, gap: 2,
  },
  menuSheetDesk: {
    borderRadius: 12, padding: 14, paddingBottom: 14, maxWidth: 420, width: '100%',
  },
  menuTitle: { fontWeight: '400', fontSize: 16, color: colors.ink, marginBottom: 8 },
  menuTitleDesk: { fontWeight: '500', fontSize: 15, marginBottom: 6 },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  menuRowTxt: { fontWeight: '500', fontSize: 14, color: colors.ink },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    padding: 16, paddingBottom: 24, maxHeight: '90%',
  },
  modalSheetDesk: {
    maxWidth: 420, width: '100%',
    borderRadius: 12, marginBottom: 0, padding: 16, paddingBottom: 16, maxHeight: '85%',
  },
  modalTitle: { fontWeight: '400', fontSize: 16, color: colors.ink, marginBottom: 10 },
  modalTitleDesk: { fontWeight: '500', fontSize: 15, marginBottom: 8 },
  imagePicker: {
    borderRadius: 10, overflow: 'hidden', marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, backgroundColor: '#f8fbff',
  },
  imagePickerDesk: { borderRadius: 8 },
  imagePickerPreview: { width: '100%', aspectRatio: 1.6 },
  imagePickerPh: {
    height: 88, alignItems: 'center', justifyContent: 'center', gap: 2,
  },
  imagePickerPhDesk: { height: 72 },
  imagePickerTxt: { fontWeight: '500', color: colors.brand, fontSize: 13 },
  imagePickerSub: { fontWeight: '400', color: colors.muted, fontSize: 11 },
  removeImgTxt: { color: colors.danger, fontWeight: '500', textAlign: 'center', fontSize: 13 },
  scanLink: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, marginBottom: 2,
  },
  scanLinkTxt: { fontWeight: '500', color: colors.brand, fontSize: 13 },
  input: {
    backgroundColor: '#f8fafc', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, fontWeight: '500', color: colors.ink, marginBottom: 8,
  },
  inputDesk: { paddingVertical: 8, fontSize: 13, borderRadius: 8, fontWeight: '400' },
  fieldLabel: {
    fontWeight: '500', color: colors.muted, fontSize: 11,
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 4, marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, marginBottom: 4,
  },
  toggleTitle: { fontWeight: '500', color: colors.ink, fontSize: 14 },
  toggleSub: { color: colors.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  modalActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
  primaryBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  secondaryBtn: {
    flex: 1, backgroundColor: colors.brandSoft, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '500', fontSize: 14 },
  modalBtnDesk: { paddingVertical: 10, borderRadius: 8 },
});
