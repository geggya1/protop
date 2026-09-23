import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, Switch, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { useI18n } from '../../src/i18n';
import { useApp } from '../../src/context/AppContext';
import { colors, radius, useLayout } from '../../src/theme';
import {
  isSuperAdmin,
  isGroupAdmin,
  updateGroup,
  deactivateGroup,
  reactivateGroup,
  deleteGroup,
  isGroupDeactivated,
  setMemberActive,
  setMemberAdmin,
  setMemberAdultRole,
  setMemberGrandparentModules,
  removeMemberFromGroup,
  isPendingMemberInvite,
} from '../../src/utils/groups';
import {
  GRANDPARENT_INVITE_APPS,
  isGrandparentMember,
  mergeGrandparentModules,
} from '../../src/utils/grandparentAccess';
import { goPlatformOverview } from '../../src/utils/platformNav';
import { isTeamType } from '../../src/utils/teams';
import { isClassroomType } from '../../src/utils/groupTypes';
import { pickImage, uploadImage, alertPhotoError } from '../../src/utils/media';
import Wizard, { Choice } from '../../components/Wizard';
import AvatarPicker, { AvatarBubble } from '../../components/AvatarPicker';
import LocationPicker from '../../components/LocationPicker';
import { Screen, Title, Mute, ScrollBody, BigButton } from '../../components/ui';
import { DeskBtn } from '../../components/DeskBtn';
import { hasContactAccount } from '../../src/utils/account';
import { setMemberPassword } from '../../src/utils/setMemberPassword';
import { sendPasswordResetV2 } from '../../src/utils/sendPasswordReset';
import { calculateAge, isValidBirthday, toIsoDate } from '../../src/utils/age';
import { NOTIF_DEFAULT, mergeNotificationPrefs } from '../../src/utils/notificationPrefs';
import { disablePushSubscription, ensurePushSubscription } from '../../src/utils/push';
import BirthdayPicker from '../../components/BirthdayPicker';
import PhoneInput from '../../components/PhoneInput';
import WebImageCropperModal from '../../components/WebImageCropperModal';
import ConfirmActionModal from '../../components/ConfirmActionModal';

function groupLifecycleCopy(t, { isClassroom, isTeam }) {
  if (isClassroom) {
    return {
      deactivate: t('group.deactivateClassroom'),
      reactivate: t('group.reactivateClassroom'),
      deactivateBody: t('group.deactivateClassroomBody'),
      deactivateCheck: t('group.deactivateClassroomCheck'),
      delete: t('group.deleteClassroom'),
      deleteBody: t('group.deleteClassroomBody'),
      deleteCheck: t('group.deleteClassroomCheck'),
      deleteTypeName: t('group.deleteClassroomTypeName'),
      deactivatedHint: t('group.deactivatedClassroomHint'),
      reactivateBody: t('group.reactivateClassroomBody'),
    };
  }
  if (isTeam) {
    return {
      deactivate: t('group.deactivateTeam'),
      reactivate: t('group.reactivateTeam'),
      deactivateBody: t('group.deactivateTeamBody'),
      deactivateCheck: t('group.deactivateTeamCheck'),
      delete: t('group.deleteTeam'),
      deleteBody: t('group.deleteTeamBody'),
      deleteCheck: t('group.deleteTeamCheck'),
      deleteTypeName: t('group.deleteTeamTypeName'),
      deactivatedHint: t('group.deactivatedTeamHint'),
      reactivateBody: t('group.reactivateTeamBody'),
    };
  }
  return {
    deactivate: t('group.deactivateGroup'),
    reactivate: t('group.reactivateGroup'),
    deactivateBody: t('group.deactivateBody'),
    deactivateCheck: t('group.deactivateCheck'),
    delete: t('group.deleteGroup'),
    deleteBody: t('group.deleteBody'),
    deleteCheck: t('group.deleteCheck'),
    deleteTypeName: t('group.deleteTypeName'),
    deactivatedHint: t('group.deactivatedHint'),
    reactivateBody: t('group.reactivateBody'),
  };
}

export function GroupSettingsScreen({ inShell = false }) {
  const { t } = useI18n();
  const nav = useNavigation();
  const { isDesktop } = useLayout();
  const { family, familyId, uid, families, selectFamily, applyFamilyPatch, requestShellTab } = useApp();
  const superOk = isSuperAdmin(family, uid);
  const adminOk = isGroupAdmin(family, uid);
  const [name, setName] = useState(family?.name || '');
  const [avatarId, setAvatarId] = useState(family?.avatarId || 'home');
  const [photoURL, setPhotoURL] = useState(family?.photoURL || family?.photoUrl || '');
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cropVisible, setCropVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [confirmKind, setConfirmKind] = useState(null);
  const [busyAction, setBusyAction] = useState(false);
  const groupType = family?.type || 'family';
  const isTeam = isTeamType(groupType);
  const isClassroom = isClassroomType(groupType);
  const deactivated = isGroupDeactivated(family);
  const life = groupLifecycleCopy(t, { isClassroom, isTeam });

  useEffect(() => {
    setName(family?.name || '');
    setAvatarId(family?.avatarId || 'home');
    setPhotoURL(family?.photoURL || family?.photoUrl || '');
  }, [family?.id, family?.name, family?.avatarId, family?.photoURL, family?.photoUrl]);

  if (!adminOk) {
    return (
      <SafeAreaView style={gs.safe} edges={inShell ? [] : ['top', 'bottom']}>
        <Text style={gs.mutedPad}>{t('member.noAccess')}</Text>
      </SafeAreaView>
    );
  }

  const uploadPicked = async (picked) => {
    if (!picked?.uri || !familyId) return;
    setPhotoBusy(true);
    try {
      if (Platform.OS === 'web') {
        setSelectedImageUri(picked.uri);
        setCropVisible(true);
        return;
      }
      const url = await uploadImage(`groups/${familyId}-${Date.now()}.jpg`, picked);
      setPhotoURL(url);
      setAvatarId((prev) => prev || 'home');
    } catch (e) {
      alertPhotoError(e, t);
    } finally {
      setPhotoBusy(false);
    }
  };

  const photo = async (camera) => {
    try {
      setPhotoBusy(true);
      const picked = await pickImage({ camera, edit: Platform.OS !== 'web' });
      if (!picked?.uri) return;
      await uploadPicked(picked);
    } catch (e) {
      alertPhotoError(e, t);
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await updateGroup(familyId, {
        name: name.trim(),
        avatarId: avatarId || 'home',
        photoURL: photoURL || null,
      });
      if (inShell) requestShellTab?.('home');
      else nav.goBack();
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const leaveToOverview = (nextId) => {
    if (nextId) selectFamily(nextId);
    else selectFamily(null);
    goPlatformOverview(nav);
  };

  const runDeactivate = async () => {
    if (!familyId || busyAction) return;
    setBusyAction(true);
    try {
      await deactivateGroup(familyId);
      applyFamilyPatch(familyId, {
        archived: true,
        active: false,
        deactivatedAt: new Date().toISOString(),
      });
      const next = (families || []).find(
        (g) => g.id !== familyId && g.deleted !== true && !isGroupDeactivated(g),
      );
      setConfirmKind(null);
      leaveToOverview(next?.id || null);
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setBusyAction(false);
    }
  };

  const runReactivate = async () => {
    if (!familyId || busyAction) return;
    setBusyAction(true);
    try {
      await reactivateGroup(familyId);
      applyFamilyPatch(familyId, {
        archived: false,
        active: true,
        reactivatedAt: new Date().toISOString(),
      });
      selectFamily(familyId);
      setConfirmKind(null);
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setBusyAction(false);
    }
  };

  const runDelete = async () => {
    if (!familyId || busyAction) return;
    setBusyAction(true);
    try {
      await deleteGroup(familyId);
      applyFamilyPatch(familyId, {
        deleted: true,
        hiddenFromApp: true,
        archived: true,
        active: false,
        subscriptionStatus: 'cancelled',
      });
      const next = (families || []).find(
        (g) => g.id !== familyId && g.deleted !== true && !isGroupDeactivated(g),
      );
      setConfirmKind(null);
      leaveToOverview(next?.id || null);
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <SafeAreaView style={gs.safe} edges={inShell ? [] : ['top', 'bottom']}>
      {!inShell ? (
        <View style={gs.head}>
          <TouchableOpacity style={gs.backBtn} onPress={() => nav.goBack()} accessibilityRole="button">
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={gs.headTitle}>{t('common.settings')}</Text>
            <Text style={gs.headSub} numberOfLines={1}>{name || family?.name || t(`group.${groupType}`)}</Text>
          </View>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[gs.body, isDesktop && gs.bodyDesk]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {isDesktop ? (
          <View style={[gs.deskSaveWrap, (!name.trim() || saving) && { opacity: 0.45 }]}>
            <DeskBtn
              primary
              icon="checkmark"
              label={saving ? t('common.loading') : t('common.save')}
              onPress={(!name.trim() || saving) ? undefined : save}
            />
          </View>
        ) : (
          <TouchableOpacity
            style={[gs.saveBtnTop, (!name.trim() || saving) && { opacity: 0.45 }]}
            onPress={save}
            disabled={!name.trim() || saving}
          >
            <Ionicons name="checkmark" size={18} color="#fff" />
            <Text style={gs.saveBtnTopTxt}>{saving ? t('common.loading') : t('common.save')}</Text>
          </TouchableOpacity>
        )}

        <View style={[gs.panel, isDesktop && gs.panelDesk]}>
          <View style={gs.heroRow}>
            <AvatarBubble
              group
              avatarId={avatarId}
              photoURL={photoURL}
              name={name || family?.name}
              size={isDesktop ? 56 : 64}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={gs.typePill}>
                <Text style={gs.typePillTxt}>{t(`group.${groupType}`)}</Text>
              </View>
              <Text style={gs.typeHint}>{t('group.typeLocked')}</Text>
            </View>
          </View>

          <Text style={[gs.lbl, isDesktop && gs.lblDesk]}>{t('group.picture')}</Text>
          <View style={gs.photoRow}>
            <TouchableOpacity
              style={[gs.photoBtn, isDesktop && gs.photoBtnDesk]}
              onPress={() => photo(false)}
              disabled={photoBusy}
            >
              <Ionicons name="image-outline" size={15} color={colors.brand} />
              <Text style={gs.photoBtnTxt}>{photoBusy ? t('common.loading') : t('profile.upload')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[gs.photoBtn, isDesktop && gs.photoBtnDesk]}
              onPress={() => photo(true)}
              disabled={photoBusy}
            >
              <Ionicons name="camera-outline" size={15} color={colors.brand} />
              <Text style={gs.photoBtnTxt}>{t('profile.takePhoto')}</Text>
            </TouchableOpacity>
            {!!photoURL && (
              <TouchableOpacity
                style={[gs.photoBtn, gs.photoBtnDanger, isDesktop && gs.photoBtnDesk]}
                onPress={() => setPhotoURL('')}
                disabled={photoBusy}
              >
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                <Text style={[gs.photoBtnTxt, { color: colors.danger }]}>{t('common.delete')}</Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={[gs.lbl, isDesktop && gs.lblDesk]}>{t('profile.cartoons')}</Text>
          <AvatarPicker
            group
            compact
            value={avatarId}
            onChange={(id) => {
              setAvatarId(id);
            }}
          />

          <Text style={[gs.lbl, isDesktop && gs.lblDesk]}>{t('group.name')}</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={[gs.input, isDesktop && gs.inputDesk]}
            placeholder={t(`group.${groupType}`)}
            placeholderTextColor={colors.placeholder}
          />
        </View>

        <View style={[gs.panel, isDesktop && gs.panelDesk]}>
          <Text style={[gs.section, isDesktop && gs.sectionDesk]}>Administrasjon</Text>

          {deactivated ? (
            <View style={gs.deactivatedBanner}>
              <Ionicons name="pause-circle" size={16} color={colors.muted} />
              <Text style={gs.deactivatedBannerTxt}>{life.deactivatedHint}</Text>
            </View>
          ) : null}

          {deactivated ? (
            <TouchableOpacity
              style={[gs.actionRow, isDesktop && gs.actionRowDesk]}
              onPress={() => setConfirmKind('reactivate')}
              disabled={busyAction}
              accessibilityRole="button"
            >
              <View style={[gs.actionIcon, isDesktop && gs.actionIconDesk, { backgroundColor: '#e4f5ea' }]}>
                <Ionicons name="refresh-outline" size={16} color={colors.success} />
              </View>
              <Text style={[gs.actionTxt, { color: colors.success }]}>{life.reactivate}</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[gs.actionRow, isDesktop && gs.actionRowDesk]}
              onPress={() => setConfirmKind('deactivate')}
              accessibilityRole="button"
            >
              <View style={[gs.actionIcon, isDesktop && gs.actionIconDesk, { backgroundColor: '#fff7ed' }]}>
                <Ionicons name="pause-circle-outline" size={16} color={colors.warn} />
              </View>
              <Text style={[gs.actionTxt, { color: colors.warn }]}>{life.deactivate}</Text>
            </TouchableOpacity>
          )}

          {superOk ? (
            <TouchableOpacity
              style={[gs.actionRow, isDesktop && gs.actionRowDesk, gs.actionRowBorder]}
              onPress={() => setConfirmKind('delete')}
              accessibilityRole="button"
            >
              <View style={[gs.actionIcon, isDesktop && gs.actionIconDesk, { backgroundColor: '#fef2f2' }]}>
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              </View>
              <Text style={[gs.actionTxt, { color: colors.danger }]}>{life.delete}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {!isTeam && !isClassroom ? null : (
          <Text style={gs.billingHint}>
            {isClassroom
              ? 'Klasserom administreres under klasseflaten (fag, timeplan, elever og mapper).'
              : 'Idrettslag administreres også under lagflaten (medlemmer, lagkode, arrangementer).'}
          </Text>
        )}
      </ScrollView>

      <WebImageCropperModal
        visible={cropVisible}
        imageUri={selectedImageUri}
        aspect={1}
        title={t('group.picture')}
        onCancel={() => {
          setCropVisible(false);
          setSelectedImageUri(null);
          setPhotoBusy(false);
        }}
        onConfirm={async (blob) => {
          try {
            setPhotoBusy(true);
            const url = await uploadImage(`groups/${familyId}-${Date.now()}.jpg`, { blob });
            setPhotoURL(url);
          } catch (e) {
            alertPhotoError(e, t);
          } finally {
            setCropVisible(false);
            setSelectedImageUri(null);
            setPhotoBusy(false);
          }
        }}
      />

      <ConfirmActionModal
        visible={confirmKind === 'deactivate'}
        title={life.deactivate}
        body={life.deactivateBody}
        confirmLabel={life.deactivate}
        cancelLabel={t('common.cancel')}
        danger
        checkLabel={life.deactivateCheck}
        busy={busyAction}
        onCancel={() => !busyAction && setConfirmKind(null)}
        onConfirm={runDeactivate}
      />
      <ConfirmActionModal
        visible={confirmKind === 'reactivate'}
        title={life.reactivate}
        body={life.reactivateBody}
        confirmLabel={life.reactivate}
        cancelLabel={t('common.cancel')}
        busy={busyAction}
        onCancel={() => !busyAction && setConfirmKind(null)}
        onConfirm={runReactivate}
      />
      <ConfirmActionModal
        visible={confirmKind === 'delete'}
        title={life.delete}
        body={`${life.deleteBody}\n\n${t('group.subscriptionEnds')}`}
        confirmLabel={life.delete}
        cancelLabel={t('common.cancel')}
        danger
        checkLabel={life.deleteCheck}
        nameToMatch={name.trim() || family?.name}
        namePlaceholder={life.deleteTypeName}
        busy={busyAction}
        onCancel={() => !busyAction && setConfirmKind(null)}
        onConfirm={runDelete}
      />
    </SafeAreaView>
  );
}

export function MemberSettingsScreen() {
  const { t } = useI18n();
  const nav = useNavigation();
  const { params } = useRoute();
  const { family, familyId, uid } = useApp();
  const role = params?.role || 'child';
  const memberId = params?.memberId;
  const superOk = isSuperAdmin(family, uid);
  const adminOk = isGroupAdmin(family, uid);
  const [m, setM] = useState(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [location, setLocation] = useState(null);
  const [birthday, setBirthday] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmKind, setConfirmKind] = useState(null); // 'activate' | 'deactivate' | 'delete'
  const [busyAction, setBusyAction] = useState(false);
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!familyId || !memberId) return;
    const col = role === 'child' ? 'children' : 'parents';
    getDoc(doc(db, 'families', familyId, col, memberId)).then((s) => {
      if (!s.exists()) return;
      const d = { id: s.id, ...s.data() };
      setM(d);
      setName(d.name || '');
      setPhone(d.phone || '');
      setEmail(d.email || '');
      setLocation(d.location || null);
      setBirthday(toIsoDate(d.birthday) || '');
    });
  }, [familyId, memberId, role]);

  if (!adminOk) {
    return (
      <SafeAreaView style={ms.safe} edges={['top', 'bottom']}>
        <Text style={ms.mutedPad}>{t('member.noAccess')}</Text>
      </SafeAreaView>
    );
  }
  if (!m) {
    return (
      <SafeAreaView style={ms.safe} edges={['top', 'bottom']}>
        <Text style={ms.mutedPad}>{t('common.loading')}</Text>
      </SafeAreaView>
    );
  }

  const col = role === 'child' ? 'children' : 'parents';
  const inactive = m.active === false || m.archived === true;
  const pendingInvite = role === 'parent' && isPendingMemberInvite(m);
  const showActivateAction = inactive || pendingInvite;
  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const age = calculateAge(birthday);
      const payload = {
        name: name.trim(), phone, email: email.toLowerCase(), location, updatedAt: serverTimestamp(),
      };
      if (isValidBirthday(birthday)) {
        payload.birthday = birthday;
        payload.age = age;
      }
      await updateDoc(doc(db, 'families', familyId, col, memberId), payload);
      const uidToSync = m.uid || m.id;
      if (uidToSync && isValidBirthday(birthday)) {
        await updateDoc(doc(db, 'users', uidToSync), { birthday, age, updatedAt: serverTimestamp() }).catch(() => {});
        if (role === 'child') {
          await updateDoc(doc(db, 'children', uidToSync), { birthday, age, updatedAt: serverTimestamp() }).catch(() => {});
        } else {
          await updateDoc(doc(db, 'parents', uidToSync), { birthday, age, updatedAt: serverTimestamp() }).catch(() => {});
        }
      }
      nav.goBack();
    } finally {
      setSaving(false);
    }
  };

  const isOwner = (m.uid || m.id) === family?.ownerUid;
  const memberUid = m.uid || m.id;
  const contactOk = hasContactAccount(null, { email: email || m.email, phone: phone || m.phone });
  const localPassword = role === 'child' || !contactOk;

  const savePassword = async () => {
    if (password.length < 6) {
      Alert.alert(t('common.error'), t('member.passwordSet'));
      return;
    }
    if (password !== password2) {
      Alert.alert(t('common.error'), t('auth.passwordMismatch'));
      return;
    }
    setPwdBusy(true);
    try {
      await setMemberPassword({ uid: memberUid, password, familyId });
      setPassword('');
      setPassword2('');
      Alert.alert(t('common.ok'), t('auth.passwordChanged'));
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setPwdBusy(false);
    }
  };

  const sendReset = async () => {
    try {
      await sendPasswordResetV2(email || m.email);
      Alert.alert(t('auth.resetSentTitle'), t('auth.resetSentBody'));
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    }
  };

  const toggleAdmin = async () => {
    if (isGrandparentMember(m)) return;
    await setMemberAdmin({ familyId, uid: m.uid || m.id, admin: !m.admin });
    setM({ ...m, admin: !m.admin });
  };

  const toggleGrandparent = async () => {
    if (busyAction || isOwner) return;
    const next = !isGrandparentMember(m);
    setBusyAction(true);
    try {
      await setMemberAdultRole({
        familyId,
        uid: m.uid || m.id,
        asGrandparent: next,
        adultRole: next ? 'grandparent' : 'parent',
      });
      setM({
        ...m,
        adultRole: next ? 'grandparent' : 'parent',
        isGrandparent: next,
        admin: next ? false : m.admin,
      });
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setBusyAction(false);
    }
  };

  const toggleGrandparentModule = async (moduleId) => {
    if (!isGrandparentMember(m) || busyAction) return;
    const current = mergeGrandparentModules(m.grandparentModules);
    const next = { ...current, [moduleId]: !current[moduleId] };
    // Speil reise-apper
    if (moduleId === 'reiseplanlegger') next.scratchMap = next.reiseplanlegger;
    if (moduleId === 'scratchMap') next.reiseplanlegger = next.scratchMap;
    setBusyAction(true);
    try {
      await setMemberGrandparentModules({
        familyId,
        uid: m.uid || m.id,
        grandparentModules: next,
      });
      setM({ ...m, grandparentModules: next });
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setBusyAction(false);
    }
  };

  const toggleActive = () => {
    // Alert.alert is a no-op on react-native-web — use ConfirmActionModal instead
    setActionError('');
    setConfirmKind(showActivateAction ? 'activate' : 'deactivate');
  };

  const deleteMember = () => {
    setActionError('');
    setConfirmKind('delete');
  };

  const runToggleActive = async () => {
    if (busyAction) return;
    // Pending invites must complete membership even if a prior "Aktiver" only flipped active.
    const nextActive = pendingInvite ? true : inactive;
    setBusyAction(true);
    setActionError('');
    try {
      await setMemberActive({ familyId, role, id: memberId, active: nextActive });
      setConfirmKind(null);
      nav.navigate('GroupHub', { familyId });
    } catch (e) {
      setActionError(e?.message || t('common.error'));
    } finally {
      setBusyAction(false);
    }
  };

  const runDeleteMember = async () => {
    if (busyAction) return;
    setBusyAction(true);
    setActionError('');
    try {
      await removeMemberFromGroup({
        familyId,
        role,
        member: { ...m, id: memberId, uid: m.uid || memberId, email, phone },
        wipePersonal: true,
      });
      setConfirmKind(null);
      nav.navigate('GroupHub', { familyId });
    } catch (e) {
      setActionError(e?.message || t('common.error'));
    } finally {
      setBusyAction(false);
    }
  };

  return (
    <SafeAreaView style={ms.safe} edges={['top', 'bottom']}>
      <View style={ms.head}>
        <TouchableOpacity
          style={ms.backBtn}
          onPress={() => nav.navigate('GroupHub', { familyId })}
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={ms.headTitle} numberOfLines={1}>{name || t('common.settings')}</Text>
          <Text style={ms.headSub}>
            {role === 'child' ? t('group.members') : t('group.leaders')}
            {m.username ? ` · @${m.username}` : ''}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={ms.body} keyboardShouldPersistTaps="handled">
        {pendingInvite ? (
          <View style={ms.deactBanner}>
            <Text style={ms.deactBannerTxt}>{t('member.waitingForReply')}</Text>
            <Text style={ms.deactBannerSub}>
              {t('member.activatePendingQ')}
            </Text>
          </View>
        ) : inactive ? (
          <View style={ms.deactBanner}>
            <Text style={ms.deactBannerTxt}>Deaktivert</Text>
            <Text style={ms.deactBannerSub}>
              Brukeren har ikke tilgang. Du kan reaktivere eller slette permanent.
            </Text>
          </View>
        ) : null}

        <Text style={ms.lbl}>{t('profile.name')}</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          style={ms.input}
          placeholderTextColor={colors.muted}
        />

        <Text style={ms.lbl}>{t('profile.birthday')}</Text>
        <BirthdayPicker value={birthday} onChange={setBirthday} defaultAge={role === 'child' ? 8 : 30} />

        <Text style={ms.lbl}>{t('auth.email')}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder={t('auth.email')}
          placeholderTextColor={colors.muted}
          style={ms.input}
        />

        <Text style={ms.lbl}>{t('auth.phone')}</Text>
        <PhoneInput value={phone} onChange={setPhone} />

        <Text style={ms.lbl}>{t('profile.location')}</Text>
        <LocationPicker value={location} onChange={setLocation} />

        <Text style={[ms.section, { marginTop: 8 }]}>Konto</Text>
        {localPassword ? (
          <View style={ms.card}>
            <Text style={ms.cardLbl}>{t('auth.newPassword')}</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              style={ms.inputInCard}
              placeholderTextColor={colors.muted}
            />
            <Text style={ms.cardLbl}>{t('auth.repeatPassword')}</Text>
            <TextInput
              value={password2}
              onChangeText={setPassword2}
              secureTextEntry
              style={ms.inputInCard}
              placeholderTextColor={colors.muted}
            />
            <TouchableOpacity
              style={ms.primaryOutline}
              onPress={savePassword}
              disabled={pwdBusy}
            >
              <Ionicons name="key-outline" size={18} color={colors.brand} />
              <Text style={ms.primaryOutlineTxt}>
                {pwdBusy ? t('common.loading') : t('member.passwordSet')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={ms.actionRow} onPress={sendReset}>
            <View style={ms.actionIcon}>
              <Ionicons name="mail-outline" size={18} color={colors.brand} />
            </View>
            <Text style={ms.actionTxt}>{t('auth.resetSend')}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}

        {role === 'parent' && !isOwner ? (
          <TouchableOpacity style={ms.actionRow} onPress={toggleGrandparent} disabled={busyAction}>
            <View style={ms.actionIcon}>
              <Ionicons
                name={isGrandparentMember(m) ? 'people' : 'people-outline'}
                size={18}
                color={colors.brand}
              />
            </View>
            <Text style={ms.actionTxt}>{t('member.grandparentToggle')}</Text>
            <Switch
              value={isGrandparentMember(m)}
              onValueChange={toggleGrandparent}
              disabled={busyAction}
            />
          </TouchableOpacity>
        ) : null}

        {role === 'parent' && isGrandparentMember(m) ? (
          <View style={[ms.card, { marginTop: 8 }]}>
            <Text style={ms.cardLbl}>{t('member.grandparentModulesTitle')}</Text>
            <Text style={[ms.mutedPad, { paddingHorizontal: 0, paddingTop: 0, marginBottom: 8 }]}>
              {t('member.grandparentModulesHint')}
            </Text>
            {GRANDPARENT_INVITE_APPS.filter((app) => app.id !== 'scratchMap').map((app) => {
              const mods = mergeGrandparentModules(m.grandparentModules);
              const on = mods[app.id] === true;
              return (
                <TouchableOpacity
                  key={app.id}
                  style={[ms.actionRow, { paddingHorizontal: 0 }]}
                  onPress={() => toggleGrandparentModule(app.id)}
                  disabled={busyAction}
                >
                  <View style={ms.actionIcon}>
                    <Ionicons name={app.icon} size={18} color={colors.brand} />
                  </View>
                  <Text style={ms.actionTxt}>{app.label}</Text>
                  <Switch
                    value={on}
                    onValueChange={() => toggleGrandparentModule(app.id)}
                    disabled={busyAction}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {role === 'parent' && superOk && !isOwner && !isGrandparentMember(m) ? (
          <TouchableOpacity style={ms.actionRow} onPress={toggleAdmin}>
            <View style={ms.actionIcon}>
              <Ionicons name={m.admin ? 'shield-checkmark' : 'shield-outline'} size={18} color={colors.brand} />
            </View>
            <Text style={ms.actionTxt}>
              {m.admin ? t('group.removeAdmin') : t('group.makeAdmin')}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </TouchableOpacity>
        ) : null}

        <Text style={[ms.section, { marginTop: 16 }]}>Administrasjon</Text>
        <TouchableOpacity style={ms.actionRow} onPress={toggleActive}>
          <View style={[ms.actionIcon, { backgroundColor: '#fff7ed' }]}>
            <Ionicons
              name={inactive ? 'play-circle-outline' : 'pause-circle-outline'}
              size={18}
              color={colors.warn}
            />
          </View>
          <Text style={[ms.actionTxt, { color: colors.warn }]}>
            {showActivateAction
              ? (pendingInvite ? t('member.acceptInvite') : t('member.activate'))
              : t('member.deactivate')}
          </Text>
        </TouchableOpacity>

        {!isOwner ? (
          <TouchableOpacity style={ms.actionRow} onPress={deleteMember}>
            <View style={[ms.actionIcon, { backgroundColor: '#fef2f2' }]}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </View>
            <Text style={[ms.actionTxt, { color: colors.danger }]}>{t('common.delete')}</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={[ms.saveBtn, saving && { opacity: 0.5 }]}
          onPress={save}
          disabled={saving}
        >
          <Text style={ms.saveBtnTxt}>{saving ? t('common.loading') : t('common.save')}</Text>
        </TouchableOpacity>
      </ScrollView>

      <ConfirmActionModal
        visible={confirmKind === 'activate'}
        title={pendingInvite ? t('member.acceptInvite') : t('member.activate')}
        body={actionError || (pendingInvite ? t('member.activatePendingQ') : t('member.activateQ'))}
        confirmLabel={pendingInvite ? t('member.acceptInvite') : t('member.activate')}
        cancelLabel={t('common.cancel')}
        busy={busyAction}
        onCancel={() => !busyAction && setConfirmKind(null)}
        onConfirm={runToggleActive}
      />
      <ConfirmActionModal
        visible={confirmKind === 'deactivate'}
        title={t('member.deactivate')}
        body={actionError || t('member.deactivateQ')}
        confirmLabel={t('member.deactivate')}
        cancelLabel={t('common.cancel')}
        danger
        busy={busyAction}
        onCancel={() => !busyAction && setConfirmKind(null)}
        onConfirm={runToggleActive}
      />
      <ConfirmActionModal
        visible={confirmKind === 'delete'}
        title={t('common.delete')}
        body={actionError || t('member.deletePermanentWarn')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        danger
        busy={busyAction}
        onCancel={() => !busyAction && setConfirmKind(null)}
        onConfirm={runDeleteMember}
      />
    </SafeAreaView>
  );
}

export function ArchiveScreen({ inShell = false }) {
  const { t } = useI18n();
  const nav = useNavigation();
  const { family, familyId, uid, requestShellTab } = useApp();
  const adminOk = isGroupAdmin(family, uid);

  useEffect(() => {
    if (!familyId || !adminOk) return;
    if (inShell) {
      requestShellTab?.('more', 'members', 'showArchived');
    } else {
      nav.replace('GroupHub', { familyId, showArchived: true });
    }
  }, [familyId, adminOk, inShell, requestShellTab, nav]);

  if (!adminOk) {
    return (
      <Screen>
        <ScrollBody><Mute>{t('member.noAccess')}</Mute></ScrollBody>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollBody>
        <Mute>Omdirigerer til medlemmer…</Mute>
      </ScrollBody>
    </Screen>
  );
}

export function ProfileSettingsScreen() {
  const { t, lang, setLang, langs } = useI18n();
  const nav = useNavigation();
  const { userProfile } = useApp();
  const user = auth.currentUser;
  const contactOk = hasContactAccount(user, userProfile || {});
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [pwdBusy, setPwdBusy] = useState(false);

  const [notificationPrefs, setNotificationPrefs] = useState(NOTIF_DEFAULT);
  const [notifBusy, setNotifBusy] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    let alive = true;
    getDoc(doc(db, 'users', user.uid))
      .then((s) => {
        if (!alive) return;
        const p = s.exists() ? s.data()?.notificationPrefs : null;
        if (!p) return;
        setNotificationPrefs(mergeNotificationPrefs(p));
      })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const persistNotificationPrefs = async (prefs) => {
    if (!user?.uid) return;
    setNotifBusy(true);
    try {
      await setDoc(doc(db, 'users', user.uid), { notificationPrefs: prefs }, { merge: true });
    } catch {}
    finally {
      setNotifBusy(false);
    }
  };

  const updateEventChannel = (eventType, channel, value) => {
    const next = {
      ...notificationPrefs,
      events: {
        ...notificationPrefs.events,
        [eventType]: {
          ...(notificationPrefs.events?.[eventType] || {}),
          [channel]: value,
        },
      },
    };
    setNotificationPrefs(next);
    persistNotificationPrefs(next);
    if (channel === 'push') {
      if (value) ensurePushSubscription(user.uid).catch(() => {});
      else if (!next.events?.messageReceived?.push && !next.events?.taskReceived?.push) {
        disablePushSubscription(user.uid).catch(() => {});
      }
    }
  };

  const saveLocalPassword = async () => {
    if (password.length < 6) return Alert.alert(t('common.error'), t('member.passwordSet'));
    if (password !== password2) return Alert.alert(t('common.error'), t('auth.passwordMismatch'));
    setPwdBusy(true);
    try {
      await setMemberPassword({ uid: user.uid, password });
      setPassword('');
      setPassword2('');
      Alert.alert(t('common.ok'), t('auth.passwordChanged'));
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    } finally {
      setPwdBusy(false);
    }
  };

  const sendReset = async () => {
    try {
      await sendPasswordResetV2(user?.email || userProfile?.email);
      Alert.alert(t('auth.resetSentTitle'), t('auth.resetSentBody'));
    } catch (e) {
      Alert.alert(t('common.error'), e?.message || t('common.error'));
    }
  };

  return (
    <Wizard title={t('profile.title')} onBack={() => nav.goBack()} onNext={() => nav.navigate('ProfileSetup')} nextLabel={t('common.edit')}>
      <Mute>{userProfile?.displayName} {userProfile?.username ? `@${userProfile.username}` : ''}</Mute>
      {contactOk ? (
        <BigButton label={t('auth.resetSend')} onPress={sendReset} />
      ) : (
        <>
          <Text style={{ fontWeight: '800' }}>{t('auth.newPassword')}</Text>
          <TextInput value={password} onChangeText={setPassword} secureTextEntry style={styles.input} />
          <Text style={{ fontWeight: '800' }}>{t('auth.repeatPassword')}</Text>
          <TextInput value={password2} onChangeText={setPassword2} secureTextEntry style={styles.input} />
          <BigButton label={pwdBusy ? t('common.loading') : t('member.passwordSet')} onPress={saveLocalPassword} disabled={pwdBusy} />
        </>
      )}
      <Text style={{ fontWeight: '800' }}>{t('more.language')}</Text>
      {langs.map((l) => (
        <Choice key={l.id} emoji={l.flag} label={l.name} active={lang === l.id} onPress={() => setLang(l.id)} />
      ))}

      {/* Varslinger */}
      <Text style={{ fontWeight: '900', fontSize: 18, marginTop: 18, marginBottom: 8 }}>🔔 Varslinger</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text style={{ fontWeight: '800' }}>Aktiver</Text>
        <Switch
          value={notificationPrefs.enabled}
          onValueChange={(v) => {
            const next = { ...notificationPrefs, enabled: v };
            setNotificationPrefs(next);
            persistNotificationPrefs(next);
          }}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.enabled ? '#0b74d1' : '#f9fafb'}
          disabled={notifBusy}
        />
      </View>

      <Text style={{ fontWeight: '800', marginTop: 10 }}>Oppgave mottatt</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text>📧 E-post</Text>
        <Switch
          value={!!notificationPrefs.events?.taskReceived?.email}
          onValueChange={(v) => updateEventChannel('taskReceived', 'email', v)}
          disabled={notifBusy}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.events?.taskReceived?.email ? '#0b74d1' : '#f9fafb'}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text>🔔 Push</Text>
        <Switch
          value={!!notificationPrefs.events?.taskReceived?.push}
          onValueChange={(v) => updateEventChannel('taskReceived', 'push', v)}
          disabled={notifBusy}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.events?.taskReceived?.push ? '#0b74d1' : '#f9fafb'}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text>📱 SMS</Text>
        <Switch
          value={!!notificationPrefs.events?.taskReceived?.sms}
          onValueChange={(v) => updateEventChannel('taskReceived', 'sms', v)}
          disabled={notifBusy}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.events?.taskReceived?.sms ? '#0b74d1' : '#f9fafb'}
        />
      </View>

      <Text style={{ fontWeight: '800', marginTop: 10 }}>Melding mottatt</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text>📧 E-post</Text>
        <Switch
          value={!!notificationPrefs.events?.messageReceived?.email}
          onValueChange={(v) => updateEventChannel('messageReceived', 'email', v)}
          disabled={notifBusy}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.events?.messageReceived?.email ? '#0b74d1' : '#f9fafb'}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text>🔔 Push</Text>
        <Switch
          value={!!notificationPrefs.events?.messageReceived?.push}
          onValueChange={(v) => updateEventChannel('messageReceived', 'push', v)}
          disabled={notifBusy}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.events?.messageReceived?.push ? '#0b74d1' : '#f9fafb'}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text>📱 SMS</Text>
        <Switch
          value={!!notificationPrefs.events?.messageReceived?.sms}
          onValueChange={(v) => updateEventChannel('messageReceived', 'sms', v)}
          disabled={notifBusy}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.events?.messageReceived?.sms ? '#0b74d1' : '#f9fafb'}
        />
      </View>

      <Text style={{ fontWeight: '800', marginTop: 10 }}>Til attestering</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text>📧 E-post</Text>
        <Switch
          value={!!notificationPrefs.events?.attestPending?.email}
          onValueChange={(v) => updateEventChannel('attestPending', 'email', v)}
          disabled={notifBusy}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.events?.attestPending?.email ? '#0b74d1' : '#f9fafb'}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text>🔔 Push</Text>
        <Switch
          value={!!notificationPrefs.events?.attestPending?.push}
          onValueChange={(v) => updateEventChannel('attestPending', 'push', v)}
          disabled={notifBusy}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.events?.attestPending?.push ? '#0b74d1' : '#f9fafb'}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text>📱 SMS</Text>
        <Switch
          value={!!notificationPrefs.events?.attestPending?.sms}
          onValueChange={(v) => updateEventChannel('attestPending', 'sms', v)}
          disabled={notifBusy}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.events?.attestPending?.sms ? '#0b74d1' : '#f9fafb'}
        />
      </View>

      <Text style={{ fontWeight: '800', marginTop: 10 }}>Invitasjoner (familie/lag/klasse)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text>📧 E-post</Text>
        <Switch
          value={!!notificationPrefs.events?.familyInvite?.email}
          onValueChange={(v) => updateEventChannel('familyInvite', 'email', v)}
          disabled={notifBusy}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.events?.familyInvite?.email ? '#0b74d1' : '#f9fafb'}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text>🔔 Push</Text>
        <Switch
          value={!!notificationPrefs.events?.familyInvite?.push}
          onValueChange={(v) => updateEventChannel('familyInvite', 'push', v)}
          disabled={notifBusy}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.events?.familyInvite?.push ? '#0b74d1' : '#f9fafb'}
        />
      </View>

      <Text style={{ fontWeight: '800', marginTop: 10 }}>Spillinvitasjoner</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
        <Text>🔔 Push</Text>
        <Switch
          value={!!notificationPrefs.events?.gameInvite?.push}
          onValueChange={(v) => updateEventChannel('gameInvite', 'push', v)}
          disabled={notifBusy}
          trackColor={{ false: '#d1d5db', true: '#93c5fd' }}
          thumbColor={notificationPrefs.events?.gameInvite?.push ? '#0b74d1' : '#f9fafb'}
        />
      </View>

      <Text style={{ color: '#94a3b8', fontWeight: '600', marginTop: 10, fontSize: 12 }}>
        Push-varsler vises på enheten når du får en ny melding, også når appen er i bakgrunnen.
        Nettleseren spør om tillatelse første gang. SMS støttes ikke ennå.
      </Text>
    </Wizard>
  );
}

const styles = StyleSheet.create({
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 14, fontSize: 18, fontWeight: '600',
  },
  row: { backgroundColor: colors.card, borderRadius: 16, padding: 14 },
  name: { fontWeight: '800', fontSize: 16, color: colors.ink },
  sub: { color: colors.brand, fontWeight: '700' },
  lbl: { fontWeight: '800', color: colors.ink, marginTop: 6 },
  deactBanner: {
    backgroundColor: '#fef2f2', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#fecaca',
  },
  deactBannerTxt: {
    color: colors.danger, fontWeight: '900', fontSize: 14,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
});

const ms = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  mutedPad: { color: colors.muted, fontWeight: '600', padding: 24 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.bg,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  headTitle: { fontSize: 18, fontWeight: '900', color: colors.ink },
  headSub: { fontSize: 12, fontWeight: '600', color: colors.muted, marginTop: 2 },
  body: { padding: 16, paddingBottom: 96, gap: 8 },
  lbl: {
    fontWeight: '800',
    color: colors.ink,
    fontSize: 13,
    marginTop: 10,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
  },
  section: {
    color: colors.muted,
    fontWeight: '800',
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 8,
  },
  cardLbl: { fontWeight: '700', color: colors.ink, fontSize: 13 },
  inputInCard: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    fontWeight: '600',
    color: colors.ink,
  },
  primaryOutline: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.brand,
    paddingVertical: 12,
    backgroundColor: colors.brandSoft,
  },
  primaryOutlineTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionTxt: { flex: 1, fontWeight: '700', fontSize: 15, color: colors.ink },
  saveBtn: {
    marginTop: 12,
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  deactBanner: {
    backgroundColor: '#fef2f2',
    borderRadius: 14,
    padding: 14,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  deactBannerTxt: {
    color: colors.danger,
    fontWeight: '900',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  deactBannerSub: { color: colors.muted, fontWeight: '600', fontSize: 13, lineHeight: 18 },
});

const gs = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  mutedPad: { color: colors.muted, fontWeight: '500', padding: 24 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.bg,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  headTitle: { fontSize: 17, fontWeight: '600', color: colors.ink },
  headSub: { fontSize: 12, fontWeight: '500', color: colors.muted, marginTop: 1 },
  body: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 28, gap: 10 },
  bodyDesk: { maxWidth: 640, width: '100%', alignSelf: 'center', paddingTop: 12, gap: 8 },
  deskSaveWrap: { alignItems: 'flex-end', marginBottom: 2 },
  saveBtnTop: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 40,
    borderRadius: 10,
    backgroundColor: colors.brand,
    marginBottom: 2,
  },
  saveBtnTopTxt: { color: '#fff', fontWeight: '600', fontSize: 14 },
  panel: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  panelDesk: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  typePill: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 2,
  },
  typePillTxt: { color: colors.brand, fontWeight: '600', fontSize: 12 },
  typeHint: {
    color: colors.muted,
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 16,
  },
  lbl: {
    fontWeight: '600',
    color: colors.muted,
    fontSize: 12,
    marginTop: 10,
    marginBottom: 6,
  },
  lblDesk: { fontWeight: '500', fontSize: 11, marginTop: 8, marginBottom: 4 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  photoBtnDesk: { borderRadius: 6, paddingVertical: 6 },
  photoBtnDanger: { borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  photoBtnTxt: { color: colors.brand, fontWeight: '600', fontSize: 12 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    fontWeight: '500',
    color: colors.ink,
  },
  inputDesk: { borderRadius: 8, fontSize: 14, paddingVertical: 8 },
  section: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  sectionDesk: { fontWeight: '500', fontSize: 11, marginBottom: 2 },
  billingHint: {
    color: colors.muted,
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
  },
  actionRowDesk: { paddingVertical: 8, gap: 8 },
  actionRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  actionIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconDesk: { width: 28, height: 28, borderRadius: 7 },
  actionTxt: { flex: 1, fontWeight: '500', fontSize: 14, color: colors.ink },
  deactivatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  deactivatedBannerTxt: { flex: 1, fontWeight: '500', fontSize: 12, color: colors.muted },
});
