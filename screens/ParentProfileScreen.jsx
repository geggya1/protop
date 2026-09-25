// src/screens/ParentProfileScreen.jsx
import React, { useCallback, useMemo, useState, useLayoutEffect, useEffect } from 'react';
import {
  View, Text, StyleSheet, Image, TouchableOpacity, Modal, TextInput, Switch,
  Platform, ActivityIndicator, Pressable, ScrollView,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { auth, db, storage } from '../firebase';
import {
  doc, setDoc, getDoc, getDocs, collection, query, where, limit, serverTimestamp,
  collectionGroup, updateDoc, arrayUnion, arrayRemove, onSnapshot, writeBatch
} from 'firebase/firestore';
import { updateProfile, signOut as firebaseSignOut } from 'firebase/auth';
import TopNavBar from '../components/TopNavBar';
import ConfirmDialog from '../components/ConfirmDialog';
import { Ionicons } from '@expo/vector-icons';
import {
  revokeMemberFamilyAccess,
  restoreMemberFamilyAccess,
  softDeleteParentFromFamily,
} from '../src/utils/groups';

let Cropper = null;
if (Platform.OS === 'web') {
  try { Cropper = require('react-easy-crop').default; } catch {}
}

export default function ParentProfileScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  useLayoutEffect(() => { navigation.setOptions({ headerShown: false }); }, [navigation]);

  // Inndata
  const routeParent = route?.params?.parent || {};
  const explicitFamilyId = route?.params?.familyId ?? routeParent?.familyId ?? null;
  const parentDocIdFromList = routeParent?.id || null;

  const currentUid = auth.currentUser?.uid || null;
  const currentEmail = (auth.currentUser?.email || '').toLowerCase();

  // UI/state
  const [familyId, setFamilyId] = useState(explicitFamilyId);
  const [familyAdmins, setFamilyAdmins] = useState([]);
  const [familyOwnerUid, setFamilyOwnerUid] = useState(null);
  const [familyName, setFamilyName] = useState('');

  const [parentDocRefPath, setParentDocRefPath] = useState(null);
  const [targetUid, setTargetUid] = useState(routeParent?.uid || routeParent?.id || null);
  const [parentEmail, setParentEmail] = useState((routeParent?.email || currentEmail).toLowerCase());
  const [photoURL, setPhotoURL] = useState(routeParent.photoURL || routeParent.photoUrl || (auth.currentUser?.photoURL || ''));
  const [cacheBust, setCacheBust] = useState(Date.now());
  const [name, setName] = useState(routeParent.name || routeParent.displayName || auth.currentUser?.displayName || '');
  const [isActive, setIsActive] = useState(routeParent.active !== false);
  const [isAdmin, setIsAdmin] = useState(!!routeParent.admin);
  const [emailVerified, setEmailVerified] = useState(!!routeParent.emailVerified);
  const [placeholder, setPlaceholder] = useState(!!routeParent.placeholder);
  const [deactivatedAt, setDeactivatedAt] = useState(null);

  const [busy, setBusy] = useState(false);
  const [pendingImageURL, setPendingImageURL] = useState(null);
  const [deletePhotoRequested, setDeletePhotoRequested] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Dialog-state
  const [confirm, setConfirm] = useState({ open: false, kind: null });

  // Crop (web)
  const [cropVisible, setCropVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);

  // Finn dokumenter + familie
  useEffect(() => {
    let stopTargetUnsub = null;
    let stopFamilyUnsub = null;

    (async () => {
      let famId = explicitFamilyId || null;
      let targetRef = null;

      if (!targetRef && (routeParent?.uid || routeParent?.id)) {
        const uidLike = routeParent?.uid || routeParent?.id;
        try {
          const cgByUid = query(collectionGroup(db, 'parents'), where('uid', '==', uidLike), limit(1));
          const s1 = await getDocs(cgByUid);
          if (!s1.empty) {
            targetRef = s1.docs[0].ref;
            famId = targetRef.parent?.parent?.id || famId;
          }
        } catch {}
      }
      if (!targetRef) {
        const email = (routeParent?.email || parentEmail || '').toLowerCase();
        if (email) {
          try {
            const cgByEmail = query(collectionGroup(db, 'parents'), where('email', '==', email), limit(1));
            const s2 = await getDocs(cgByEmail);
            if (!s2.empty) {
              targetRef = s2.docs[0].ref;
              famId = targetRef.parent?.parent?.id || famId;
            }
          } catch {}
        }
      }
      if (!targetRef && famId) {
        const candidates = [parentDocIdFromList, routeParent?.uid, routeParent?.id, parentEmail].filter(Boolean);
        for (const id of candidates) {
          const cand = doc(db, 'families', famId, 'parents', String(id));
          const s = await getDoc(cand);
          if (s.exists()) { targetRef = cand; break; }
        }
      }

      if (famId) setFamilyId(famId);
      if (targetRef) {
        setParentDocRefPath(targetRef.path);
        stopTargetUnsub = onSnapshot(targetRef, (snap) => {
          if (!snap.exists()) return;
          const d = snap.data() || {};
          setName(d.name || '');
          setParentEmail((d.email || parentEmail || '').toLowerCase());
          setPhotoURL(d.photoURL || d.photoUrl || photoURL);
          setIsActive(d.active !== false);
          setIsAdmin(!!d.admin);
          setEmailVerified(!!d.emailVerified);
          setPlaceholder(!!d.placeholder);
          setDeactivatedAt(d.deactivatedAt || null);
          setTargetUid(d.uid || null);
          setCacheBust(Date.now());
        });
      }

      if (famId) {
        const famRef = doc(db, 'families', famId);
        stopFamilyUnsub = onSnapshot(famRef, (snap) => {
          if (!snap.exists()) return;
          const fd = snap.data() || {};
          setFamilyAdmins(Array.isArray(fd.adminUids) ? fd.adminUids : []);
          setFamilyOwnerUid(fd.ownerUid || fd.ownerId || null);
          setFamilyName(fd.name || '');
        });
      }
    })();

    return () => {
      stopTargetUnsub && stopTargetUnsub();
      stopFamilyUnsub && stopFamilyUnsub();
    };
  }, [explicitFamilyId, parentDocIdFromList, routeParent, parentEmail, photoURL]);

  // Avledet tilgang
  const isFamilyAdmin = useMemo(() => {
    return Boolean(
      (currentUid && familyAdmins?.includes(currentUid)) ||
      (currentUid && currentUid === familyOwnerUid)
    );
  }, [familyAdmins, familyOwnerUid, currentUid]);

  const isViewingOwn = useMemo(() => {
    const targetIsMeByUid = !!(currentUid && targetUid && currentUid === targetUid);
    const targetIsMeByEmail = !!(parentEmail && currentEmail && parentEmail === currentEmail);
    return targetIsMeByUid || targetIsMeByEmail;
  }, [currentUid, targetUid, parentEmail, currentEmail]);

  const needsActivation = useMemo(() => {
    return placeholder === true || !emailVerified || !targetUid || isActive === false;
  }, [placeholder, emailVerified, targetUid, isActive]);

  // ---------- Bilde ----------
  const canEditPhoto = isViewingOwn || isFamilyAdmin;

  const pickImage = useCallback(async () => {
    if (!canEditPhoto) return;
    setDeletePhotoRequested(false);
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: Platform.OS !== 'web',
      aspect: [1, 1],
      quality: 0.92,
    });
    if (result.canceled) return;
    const uri = result.assets?.[0]?.uri ?? null;
    if (!uri) return;
    if (Platform.OS === 'web' && Cropper) {
      setSelectedImageUri(uri);
      setCropVisible(true);
    } else {
      await uploadImageUri(uri);
    }
  }, [canEditPhoto]);

  const createCroppedBlobWeb = useCallback(async (imageSrc, areaPixels) => {
    return new Promise((resolve, reject) => {
      try {
        const img = new (typeof window !== 'undefined' ? window.Image : Image)();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            canvas.width = areaPixels.width;
            canvas.height = areaPixels.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(
              img,
              areaPixels.x, areaPixels.y, areaPixels.width, areaPixels.height,
              0, 0, areaPixels.width, areaPixels.height
            );
            canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Kunne ikke lage blob'))), 'image/jpeg', 0.92);
          } catch (err) { reject(err); }
        };
        img.onerror = (e) => reject(e?.message || e || new Error('Bilde kunne ikke lastes'));
        img.src = imageSrc;
      } catch (e) { reject(e); }
    });
  }, []);

  const handleCropConfirm = useCallback(async () => {
    if (!selectedImageUri || !croppedAreaPixels) return;
    setBusy(true);
    try {
      const blob = await createCroppedBlobWeb(selectedImageUri, croppedAreaPixels);
      await uploadBlobToStorage(blob);
      setCropVisible(false);
      setSelectedImageUri(null);
    } finally {
      setBusy(false);
    }
  }, [selectedImageUri, croppedAreaPixels, createCroppedBlobWeb]);

  const uploadBlobToStorage = useCallback(async (blob) => {
    const uid = targetUid || auth.currentUser?.uid;
    if (!uid) return;
    setDeletePhotoRequested(false);
    const path = `profiles/${uid}/parent-${uid}-${Date.now()}.jpg`;
    const storageRefObj = ref(storage, path);
    await uploadBytes(storageRefObj, blob, { contentType: 'image/jpeg' });
    const url = await getDownloadURL(storageRefObj);
    setPendingImageURL(url);
    setPhotoURL(url);
    setCacheBust(Date.now());
  }, [targetUid]);

  const requestDeletePhoto = useCallback(() => {
    if (!canEditPhoto) return;
    setDeletePhotoRequested(true);
    setPendingImageURL(null);
    setPhotoURL('');
    setCacheBust(Date.now());
  }, [canEditPhoto]);

  const uploadImageUri = useCallback(async (uri) => {
    setBusy(true);
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      await uploadBlobToStorage(blob);
    } finally {
      setBusy(false);
    }
  }, [uploadBlobToStorage]);

  // Hjelper: alle doc-refs for denne foresatt
  const allParentRefs = useCallback(() => {
    if (!familyId) return [];
    const keys = Array.from(new Set(
      [parentDocRefPath?.split('/').slice(-1)[0], targetUid, parentEmail].filter(Boolean).map(String)
    ));
    return keys.map((k) => doc(db, 'families', familyId, 'parents', k));
  }, [familyId, parentDocRefPath, targetUid, parentEmail]);

  // AKSEPTER INVITASJON
  const acceptInvite = useCallback(async () => {
    if (!auth.currentUser || !familyId) return;
    if (!isViewingOwn && !isFamilyAdmin) return;

    try {
      setBusy(true);
      const me = auth.currentUser;
      const myUid = me.uid;
      const myEmail = (me.email || '').toLowerCase();
      const emailDocRef = doc(db, 'families', familyId, 'parents', myEmail);
      const uidDocRef = doc(db, 'families', familyId, 'parents', myUid);
      const now = serverTimestamp();
      const payload = {
        uid: myUid,
        email: myEmail,
        name: me.displayName || name || myEmail.split('@')[0],
        active: true,
        placeholder: false,
        emailVerified: !!me.emailVerified,
        acceptedAt: now,
        acceptedBy: myUid,
        updatedAt: now,
      };
      await setDoc(emailDocRef, payload, { merge: true });
      await setDoc(uidDocRef, payload, { merge: true });
      await setDoc(doc(db, 'parents', myUid), {
        uid: myUid, email: myEmail, displayName: me.displayName || '', photoURL: me.photoURL || null,
        emailVerified: !!me.emailVerified, familyId, active: true, role: 'parent', updatedAt: now,
      }, { merge: true });
      await updateDoc(doc(db, 'families', familyId), { members: arrayUnion(myUid), updatedAt: now });

      setParentDocRefPath(uidDocRef.path);
      setTargetUid(myUid);
      setParentEmail(myEmail);
      setIsActive(true);
      setEmailVerified(!!me.emailVerified);
      setPlaceholder(false);
    } finally {
      setBusy(false);
    }
  }, [familyId, isViewingOwn, isFamilyAdmin, name]);

  // Persist helpers (admin-aksjoner)
  const persistActive = useCallback(async (next) => {
    if (!familyId) return;
    const refs = allParentRefs();
    if (refs.length === 0) return;

    const now = serverTimestamp();
    const batch = writeBatch(db);
    refs.forEach((r) =>
      batch.set(
        r,
        next
          ? {
            active: true,
            deleted: false,
            leftAt: null,
            reactivatedAt: now,
            reactivatedBy: currentUid || null,
            placeholder: false,
            deactivatedBy: null,
            updatedAt: now,
          }
          : { active: false, deactivatedAt: now, deactivatedBy: currentUid || null, updatedAt: now },
        { merge: true }
      )
    );
    await batch.commit();
    if (targetUid) {
      if (next) {
        await restoreMemberFamilyAccess({ familyId, uid: targetUid, asAdmin: !!isAdmin });
      } else {
        await revokeMemberFamilyAccess({ familyId, uid: targetUid });
      }
    }
    setIsActive(next);
  }, [allParentRefs, familyId, currentUid, targetUid, isAdmin]);

  const persistAdmin = useCallback(async (next) => {
    if (!familyId) return;
    const refs = allParentRefs();
    if (refs.length === 0) return;

    const now = serverTimestamp();
    const batch = writeBatch(db);
    refs.forEach((r) => batch.set(r, { admin: !!next, updatedAt: now }, { merge: true }));
    await batch.commit();

    if (targetUid) {
      const famRef = doc(db, 'families', familyId);
      await updateDoc(famRef, {
        adminUids: next ? arrayUnion(targetUid) : arrayRemove(targetUid),
        updatedAt: now,
      });
    }
    setIsAdmin(!!next);
  }, [allParentRefs, familyId, targetUid]);

  const performDelete = useCallback(async () => {
    if (!familyId) return;
    const refs = allParentRefs();
    if (refs.length === 0) return;
    await softDeleteParentFromFamily({
      familyId,
      parentRefs: refs,
      uid: targetUid || null,
    });
    navigation.navigate('FamilyDashboard', { familyId });
  }, [allParentRefs, familyId, targetUid, navigation]);

  // Switch-handlers -> åpner dialoger
  const onToggleActive = useCallback((next) => {
    if (!isFamilyAdmin) return;
    setConfirm({
      open: true,
      kind: next ? 'activate' : 'deactivate',
    });
  }, [isFamilyAdmin]);

  const onToggleAdmin = useCallback((next) => {
    if (!isFamilyAdmin) return;
    setConfirm({
      open: true,
      kind: next ? 'grantAdmin' : 'revokeAdmin',
    });
  }, [isFamilyAdmin]);

  // Lagre “vanlige” felter (navn/bilde) – admin/aktiv/admin styres via egne actions over
  const handleSaveBasics = useCallback(async () => {
    if (!familyId) return;
    const refs = allParentRefs();
    if (refs.length === 0) return;
    setBusy(true);
    try {
      const now = serverTimestamp();
      const payload = {
        name: (name || '').trim(),
        updatedAt: now,
      };
      if ((deletePhotoRequested || pendingImageURL) && (isViewingOwn || isFamilyAdmin)) {
        payload.photoURL = deletePhotoRequested ? null : pendingImageURL;
        payload.photoUrl = deletePhotoRequested ? null : pendingImageURL;
      }
      const batch = writeBatch(db);
      refs.forEach((r) => batch.set(r, payload, { merge: true }));
      await batch.commit();

      if (isViewingOwn && auth.currentUser) {
        try {
          await updateProfile(auth.currentUser, {
            photoURL: deletePhotoRequested ? null : (pendingImageURL || auth.currentUser.photoURL || null),
            displayName: (name || '').trim() || auth.currentUser.displayName || '',
          });
          await auth.currentUser.reload();
        } catch {}
      }
      setPendingImageURL(null);
      setDeletePhotoRequested(false);
      setCacheBust(Date.now());
    } finally {
      setBusy(false);
    }
  }, [familyId, allParentRefs, name, pendingImageURL, isViewingOwn, isFamilyAdmin, deletePhotoRequested]);

  // UI helpers
  const emailPretty = useMemo(() => parentEmail || '', [parentEmail]);
  const showVerifyBanner = placeholder || !emailVerified;
  const showDeactivatedBanner = !isActive && !showVerifyBanner && !!(deactivatedAt);

  const handleBack = useCallback(() => {
    if (familyId) navigation.navigate('FamilyDashboard', { familyId });
    else if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('FamilyOverview');
  }, [navigation, familyId]);

  const confirmConfig = (() => {
    switch (confirm.kind) {
      case 'deactivate':
        return {
          title: 'Deaktivere bruker?',
          message: 'Brukeren mister tilgang. Dette kan angres ved reaktivering.',
          danger: false,
          ok: 'Deaktiver',
          onOk: () => persistActive(false),
        };
      case 'activate':
        return {
          title: 'Aktivere bruker?',
          message: 'Brukeren får tilgang igjen.',
          danger: false,
          ok: 'Aktiver',
          onOk: () => persistActive(true),
        };
      case 'grantAdmin':
        return {
          title: 'Gi administrator?',
          message: 'Brukeren får administrator-tilgang i familien.',
          danger: false,
          ok: 'Gi',
          onOk: () => persistAdmin(true),
        };
      case 'revokeAdmin':
        return {
          title: 'Fjerne administrator?',
          message: 'Brukeren mister administrator-tilgang.',
          danger: false,
          ok: 'Fjern',
          onOk: () => persistAdmin(false),
        };
      case 'delete':
        return {
          title: 'Slette foresatt?',
          message: 'Dette fjerner profilen fra familien. Er du sikker?',
          danger: true,
          ok: 'Slett',
          onOk: () => performDelete(),
        };
      default:
        return { title: '', message: '', ok: 'OK', danger: false, onOk: () => {} };
    }
  })();

  // -------------------------- RENDER --------------------------
  return (
    <View style={styles.screen}>
      <TopNavBar
        title="Foresatt"
        showBack
        onBack={handleBack}
      />

      {(showDeactivatedBanner || showVerifyBanner) && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          {showDeactivatedBanner && (
            <View style={[styles.banner, { backgroundColor: '#ffe6e6' }]}>
              <Text style={styles.bannerTitle}>Denne brukeren er deaktivert</Text>
              <Text style={styles.bannerText}>Kan reaktiveres av en administrator.</Text>
            </View>
          )}
          {showVerifyBanner && (
            <View style={[styles.banner, { backgroundColor: '#fff7d6' }]}>
              <Text style={[styles.bannerTitle, { color: '#8a6d00' }]}>Må verifisere/aktivere</Text>
              <Text style={[styles.bannerText, { color: '#8a6d00' }]}>
                Denne profilen er invitert og/eller ikke e-postverifisert.
              </Text>
              {(needsActivation && (isViewingOwn || isFamilyAdmin)) && (
                <TouchableOpacity
                  style={[styles.primaryBtn, { marginTop: 10 }]}
                  onPress={acceptInvite}
                  disabled={busy}
                >
                  <Text style={styles.primaryBtnText}>Aksepter invitasjon / aktiver profil</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <View style={[!isActive ? { opacity: 0.5 } : null]}>
          <View style={styles.avatarWrap}>
            <View style={{ alignItems: 'center' }}>
              <Image
                source={photoURL ? { uri: `${photoURL}${photoURL.includes('?') ? '&' : '?'}cb=${cacheBust}` } : require('../assets/avatar-parent.png')}
                style={styles.avatar}
              />
              <View style={styles.badgeRow}>
                {isAdmin && (
                  <View style={styles.badge}>
                    <Ionicons name="shield-checkmark" size={12} color="#fff" />
                    <Text style={styles.badgeTxt}>Admin</Text>
                  </View>
                )}
                {!isActive && (
                  <View style={[styles.badge, { backgroundColor: '#64748b' }]}>
                    <Ionicons name="pause" size={12} color="#fff" />
                    <Text style={styles.badgeTxt}>Deaktivert</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={pickImage}
                disabled={!canEditPhoto}
                style={[styles.linkBtn, !canEditPhoto && { opacity: 0.4 }]}
                activeOpacity={0.8}
              >
                <Text style={styles.linkBtnTxt}>Endre bilde</Text>
              </TouchableOpacity>

              {canEditPhoto && !!photoURL ? (
                <TouchableOpacity
                  onPress={requestDeletePhoto}
                  disabled={busy}
                  style={[styles.linkBtn, { backgroundColor: '#fee2e2' }]}
                >
                  <Text style={[styles.linkBtnTxt, { color: '#b00020' }]}>Slett bilde</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <TextInput placeholder="Navn" value={name} onChangeText={setName} style={styles.input} />
          {!!emailPretty && <Text style={styles.email}>📧 {emailPretty}</Text>}
        </View>

        {/* Switches (kun admin får endre) */}
        <View style={[styles.switchRow, !isFamilyAdmin && { opacity: 0.45 }]}>
          <Text style={styles.switchLabel}>Bruker aktiv</Text>
          <Switch value={isActive} onValueChange={onToggleActive} disabled={!isFamilyAdmin} />
        </View>

        <View style={[styles.switchRow, !isFamilyAdmin && { opacity: 0.45 }]}>
          <Text style={styles.switchLabel}>Administrator</Text>
          <Switch value={isAdmin} onValueChange={onToggleAdmin} disabled={!isFamilyAdmin} />
        </View>

        <TouchableOpacity onPress={handleSaveBasics} style={styles.primaryBtn} disabled={busy}>
          <Text style={styles.primaryBtnText}>Lagre endringer</Text>
        </TouchableOpacity>

        {isFamilyAdmin && !isViewingOwn && (
          <TouchableOpacity
            onPress={() => setConfirm({ open: true, kind: 'delete' })}
            style={[styles.primaryBtn, { backgroundColor: '#b00020', marginTop: 12 }]}
            disabled={busy}
          >
            <Text style={styles.primaryBtnText}>Slett foresatt fra familien</Text>
          </TouchableOpacity>
        )}

        {busy && <ActivityIndicator style={{ marginTop: 16 }} />}
      </ScrollView>

      {/* Drawer (uendret bortsett fra logout-confirm kan stå som før) */}
      <Modal visible={drawerOpen} animationType="slide" transparent onRequestClose={() => setDrawerOpen(false)}>
        <Pressable style={styles.drawerBackdrop} onPress={() => setDrawerOpen(false)} />
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>Min profil</Text>
            <Text style={styles.drawerSub}>{name || ' '}</Text>
          </View>
          <View style={styles.drawerList}>
            <DrawerItem icon="person-circle-outline" label="Min profil" onPress={() => setDrawerOpen(false)} />
            <DrawerItem icon="home-outline" label="Gå til familieoversikt" onPress={() => { setDrawerOpen(false); navigation.navigate('FamilyOverview'); }} />
            <DrawerItem icon="swap-horizontal" label="Bytt familie" onPress={() => { setDrawerOpen(false); navigation.navigate('FamilyOverview'); }} />
            <View style={{ flex: 1 }} />
          </View>
          <View style={styles.drawerBottom}>
            <DrawerItem icon="log-out-outline" label="Logg ut" onPress={() => setConfirm({ open: true, kind: 'logout' })} danger />
          </View>
        </View>
      </Modal>

      {/* WEB: Cropper-modal */}
      {Platform.OS === 'web' && cropVisible && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setCropVisible(false)}>
          <View style={styles.cropBackdrop}>
            <View style={styles.cropCard}>
              <View style={styles.cropperArea}>
                {Cropper && (
                  <Cropper
                    image={selectedImageUri}
                    crop={crop}
                    zoom={zoom}
                    aspect={1}
                    onCropChange={setCrop}
                    onZoomChange={setZoom}
                    onCropComplete={(_, areaPixels) => setCroppedAreaPixels(areaPixels)}
                  />
                )}
              </View>
              <View style={styles.cropActions}>
                <TouchableOpacity onPress={() => { setCropVisible(false); setSelectedImageUri(null); }} style={[styles.roundBtn, { backgroundColor: '#e5e7eb' }]}>
                  <Text>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCropConfirm} style={[styles.roundBtn, { backgroundColor: '#0b74d1' }]}>
                  <Text style={{ color: '#fff', fontWeight: '400' }}>Bruk bilde</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Bekreftelser */}
      <ConfirmDialog
        visible={confirm.open && confirm.kind !== 'logout'}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmText={confirmConfig.ok}
        danger={confirmConfig.danger}
        onCancel={() => setConfirm({ open: false, kind: null })}
        onConfirm={async () => {
          setConfirm({ open: false, kind: null });
          await confirmConfig.onOk?.();
        }}
      />
      {/* Enkel logout-confirm (kan bruke samme dialog om ønskelig) */}
      <ConfirmDialog
        visible={confirm.open && confirm.kind === 'logout'}
        title="Logg ut?"
        message="Er du sikker på at du vil logge ut?"
        confirmText="Logg ut"
        danger
        onCancel={() => setConfirm({ open: false, kind: null })}
        onConfirm={async () => {
          setConfirm({ open: false, kind: null });
          try { await firebaseSignOut(auth); navigation.reset({ index: 0, routes: [{ name: 'Login' }] }); } catch {}
        }}
      />
    </View>
  );
}

function DrawerItem({ icon, label, onPress, danger }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.drawerItem}>
      <Ionicons name={icon} size={20} color={danger ? '#b00020' : '#0b1f33'} />
      <Text style={[styles.drawerItemText, danger && { color: '#b00020' }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color="#789" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f6fbff' },
  container: { padding: 16 },
  avatarWrap: { alignItems: 'center', marginTop: 10, marginBottom: 4 },
  avatar: { width: 112, height: 112, borderRadius: 999, backgroundColor: '#e2e8f0' },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 8, justifyContent: 'center' },
  badge: { flexDirection: 'row', gap: 6, backgroundColor: '#0b74d1', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, alignItems: 'center' },
  badgeTxt: { color: '#fff', fontWeight: '400', fontSize: 11 },
  linkBtn: {
    alignSelf: 'flex-start', marginTop: 8, paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#eaf2ff', borderRadius: 10 },
  linkBtnTxt: { color: '#0b74d1', fontWeight: '400' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, marginTop: 12, backgroundColor: '#fff' },
  email: { textAlign: 'center', color: '#64748b', marginVertical: 10 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, alignItems: 'center' },
  switchLabel: { fontSize: 16, color: '#0f172a' },
  primaryBtn: {
    alignSelf: 'flex-start', backgroundColor: '#0b74d1', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 18 },
  primaryBtnText: { color: '#fff', fontWeight: '400', fontSize: 16 },
  banner: { borderRadius: 10, padding: 12, marginBottom: 8 },
  bannerTitle: { fontWeight: '400', color: '#b91c1c', marginBottom: 4 },
  bannerText: { color: '#0f172a' },
  drawerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  drawer: { position: 'absolute', right: 0, top: 0, bottom: 0, width: '70%', backgroundColor: '#fff', padding: 16, zIndex: 2, elevation: 6 },
  drawerHeader: { marginBottom: 2 },
  drawerTitle: { fontSize: 18, fontWeight: '400' },
  drawerSub: { color: '#64748b', marginBottom: 8 },
  drawerList: { flex: 1 },
  drawerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eef2f7' },
  drawerItemText: { fontSize: 16, color: '#0b1f33', flex: 1, marginLeft: 10 },
  drawerBottom: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#eef2f7', paddingTop: 8 },
  cropBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  cropCard: { width: 380, maxWidth: '92%', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden' },
  cropperArea: { height: 340, position: 'relative' },
  cropActions: { flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  roundBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, alignItems: 'center', justifyContent: 'center', minWidth: 110 },
});
