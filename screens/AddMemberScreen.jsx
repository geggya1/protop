import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, TouchableOpacity, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useOptionalRoute } from '../src/hooks/useOptionalRoute';
import { auth } from '../firebase';
import { useI18n } from '../src/i18n';
import { useApp } from '../src/context/AppContext';
import { colors, radius } from '../src/theme';
import { isValidUsername, suggestUsername, usernameTaken } from '../src/utils/usernames';
import {
  addChildMember, addAdultManual, inviteAdultSmart, isSuperAdmin,
} from '../src/utils/groups';
import { pickImage, uploadImage, alertPhotoError } from '../src/utils/media';
import { calculateAge, isValidBirthday } from '../src/utils/age';
import { hasContactInfo, isValidEmail } from '../src/utils/account';
import Wizard, { Choice } from '../components/Wizard';
import AvatarPicker, { AvatarBubble } from '../components/AvatarPicker';
import LocationPicker from '../components/LocationPicker';
import BirthdayPicker from '../components/BirthdayPicker';
import PhoneInput from '../components/PhoneInput';
import PasswordFields, { passwordRules } from '../components/PasswordFields';
import WebImageCropperModal from '../components/WebImageCropperModal';

export default function AddMemberScreen({
  inShell = false,
  asModal = false,
  onClose,
  familyId: familyIdProp,
}) {
  const { t } = useI18n();
  const nav = useNavigation();
  const { params } = useOptionalRoute() || {};
  const { family, familyId, uid, requestShellTab } = useApp();
  const fid = familyIdProp || params?.familyId || familyId;
  const superOk = isSuperAdmin(family, uid);

  const [kind, setKind] = useState(null);
  const [how, setHow] = useState(null);
  const [adultKind, setAdultKind] = useState(null); // 'parent' | 'grandparent'
  const [name, setName] = useState('');
  const [birthday, setBirthday] = useState('');
  const [username, setUsername] = useState('');
  const [taken, setTaken] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [location, setLocation] = useState(null);
  const [avatarId, setAvatarId] = useState('fox');
  const [photoURL, setPhotoURL] = useState('');
  const [asAdmin, setAsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [cropVisible, setCropVisible] = useState(false);
  const [selectedImageUri, setSelectedImageUri] = useState(null);
  const [created, setCreated] = useState(null);

  const isAdult = kind === 'adult';
  const isGrandparentInvite = isAdult && adultKind === 'grandparent';
  const isManual = how !== 'invite';
  const isInvite = how === 'invite';
  const pwMinLen = isAdult ? 8 : 6;
  const pwRules = useMemo(
    () => passwordRules(password, { minLen: pwMinLen, requireMixed: isAdult }),
    [password, pwMinLen, isAdult],
  );

  useEffect(() => {
    if (name && !username) setUsername(suggestUsername(name));
  }, [name]); // eslint-disable-line

  useEffect(() => {
    let alive = true;
    if (!isValidUsername(username)) {
      setTaken(false);
      setCheckingUsername(false);
      return undefined;
    }
    setCheckingUsername(true);
    setTaken(false);
    const tmr = setTimeout(async () => {
      try {
        const busy = await Promise.race([
          usernameTaken(username),
          new Promise((resolve) => setTimeout(() => resolve(false), 4000)),
        ]);
        if (alive) setTaken(!!busy);
      } catch {
        if (alive) setTaken(false);
      } finally {
        if (alive) setCheckingUsername(false);
      }
    }, 400);
    return () => { alive = false; clearTimeout(tmr); };
  }, [username]);

  const hasContact = hasContactInfo(email, phone);
  const emailInvalid = email.trim().length > 0 && !isValidEmail(email);
  const usernameOk = isValidUsername(username) && !taken && !checkingUsername;
  const passwordOk = isManual && pwRules.strong && password === password2;

  const canCreate = isInvite
    ? hasContact && !emailInvalid
    : (name.trim() && usernameOk
      && (kind === 'child' ? isValidBirthday(birthday) : true)
      && passwordOk
      && (isAdult ? hasContact : true));

  const missing = useMemo(() => {
    const list = [];
    if (isInvite) {
      if (!hasContact) list.push(t('member.emailOrPhone'));
      if (emailInvalid) list.push(t('auth.emailInvalid'));
      return list;
    }
    if (!name.trim()) list.push(t('profile.name'));
    if (isManual && !usernameOk) {
      if (!isValidUsername(username)) list.push(t('profile.username'));
      else if (checkingUsername) list.push(t('member.checkingUsername'));
      else if (taken) list.push(t('profile.usernameTaken'));
    }
    if (isManual && !passwordOk) list.push(t('auth.password'));
    if (isAdult && !hasContact) list.push(t('member.emailOrPhone'));
    if (emailInvalid) list.push(t('auth.emailInvalid'));
    if (kind === 'child' && !isValidBirthday(birthday)) list.push(t('profile.birthday'));
    return list;
  }, [
    isInvite, name, username, usernameOk, isManual, passwordOk,
    isAdult, hasContact, emailInvalid, kind, birthday, checkingUsername, taken, t,
  ]);

  const photo = async (camera) => {
    if (!fid) return;
    setPhotoBusy(true);
    try {
      const picked = await pickImage({ camera });
      if (!picked?.uri) return;
      if (Platform.OS === 'web') {
        setSelectedImageUri(picked.uri);
        setCropVisible(true);
        return;
      }
      setPhotoURL(picked.uri);
      const url = await uploadImage(`families/${fid}/avatars/pending-${Date.now()}.jpg`, picked);
      setPhotoURL(url);
    } catch (e) {
      alertPhotoError(e, t);
    } finally {
      setPhotoBusy(false);
    }
  };

  const submit = async () => {
    if (!canCreate) return;
    setSaving(true);
    try {
      if (kind === 'child') {
        const res = await addChildMember({
          familyId: fid,
          name,
          username,
          password,
          birthday: birthday || null,
          age: calculateAge(birthday),
          gender,
          location,
          phone,
          email,
          photoURL,
          avatarId,
          createdBy: auth.currentUser?.uid,
        });
        setCreated(res);
      } else if (how === 'invite') {
        const res = await inviteAdultSmart({
          familyId: fid,
          name: name.trim() || '',
          email: email.trim(),
          phone,
          identifier: email.trim() || phone || '',
          familyName: family?.name,
          groupType: family?.type || 'family',
          createdBy: auth.currentUser?.uid,
          asAdmin: superOk && asAdmin && !isGrandparentInvite,
          asGrandparent: isGrandparentInvite,
          adultRole: isGrandparentInvite ? 'grandparent' : 'parent',
        });
        if (res?.existingUser) {
          Alert.alert(
            t('member.inviteSentTitle'),
            t('member.inviteSentExistingPrivacy'),
          );
        } else {
          const target = email || phone;
          const msg = email
            ? (res?.emailSent
              ? `Invitasjon sendt til ${target}`
              : `Invitert (ikke akseptert). E-post feilet${res?.emailError ? `: ${res.emailError}` : ''}`)
            : (res?.smsSent
              ? `SMS-invitasjon sendt til ${target}`
              : `Invitert med telefon ${target}`);
          Alert.alert(t('member.created'), msg);
        }
        leave();
      } else {
        const res = await addAdultManual({
          familyId: fid,
          name,
          username,
          password,
          email,
          phone,
          gender,
          location,
          photoURL,
          avatarId,
          createdBy: auth.currentUser?.uid,
          asAdmin: superOk && asAdmin && !isGrandparentInvite,
          asGrandparent: isGrandparentInvite,
          adultRole: isGrandparentInvite ? 'grandparent' : 'parent',
        });
        setCreated(res);
      }
    } catch (e) {
      const code = e?.message;
      const msg = code === 'taken' ? t('profile.usernameTaken')
        : code === 'user-not-found' ? t('member.userNotFound')
          : code === 'already-member' ? t('member.alreadyMember')
            : code === 'invite-pending' ? t('member.invitePending')
              : code === 'cannot-invite-self' ? t('member.cannotInviteSelf')
                : code === 'contact-required' ? t('member.emailOrPhone')
                  : t('common.error');
      Alert.alert(t('common.error'), msg);
    } finally {
      setSaving(false);
    }
  };

  const leave = () => {
    if (onClose) {
      onClose();
      return;
    }
    if (inShell) {
      requestShellTab?.('more', 'members');
      return;
    }
    if (nav.canGoBack()) nav.goBack();
  };

  const wizardProps = { embedded: inShell || asModal, plain: asModal };
  const compactChoice = asModal;

  if (created) {
    return (
      <Wizard title={t('member.created')} onNext={leave} nextLabel={t('common.done')} {...wizardProps}>
        <Text style={[styles.big, asModal && styles.bigModal]}>{t('member.loginWith')}</Text>
        <Text style={[styles.cred, asModal && styles.credModal]}>@{created.username || created.login}</Text>
        {!email && !phone ? <Text style={styles.warn}>{t('profile.rememberUser')}</Text> : null}
      </Wizard>
    );
  }

  if (!kind) {
    return (
      <Wizard title={t('member.addTitle')} subtitle={t('member.who')} onBack={asModal ? undefined : leave} {...wizardProps}>
        <Choice compact={compactChoice} huge={!compactChoice} emoji="🧒" label={t('member.child')} onPress={() => { setKind('child'); setHow('manual'); }} />
        <Choice compact={compactChoice} huge={!compactChoice} emoji="🧑" label={t('member.adult')} onPress={() => setKind('adult')} />
      </Wizard>
    );
  }

  if (kind === 'adult' && !how) {
    return (
      <Wizard title={t('member.how')} onBack={() => { setKind(null); setAdultKind(null); }} {...wizardProps}>
        <Choice compact={compactChoice} huge={!compactChoice} emoji="✉️" label={t('member.invite')} onPress={() => setHow('invite')} />
        <Choice compact={compactChoice} huge={!compactChoice} emoji="✍️" label={t('member.manual')} onPress={() => setHow('manual')} />
      </Wizard>
    );
  }

  if (kind === 'adult' && how && !adultKind) {
    return (
      <Wizard title={t('member.adultRoleTitle')} onBack={() => setHow(null)} {...wizardProps}>
        <Text style={styles.hint}>{t('member.adultRoleHint')}</Text>
        <Choice
          compact={compactChoice}
          huge={!compactChoice}
          emoji="👪"
          label={t('member.roleParent')}
          onPress={() => setAdultKind('parent')}
        />
        <Choice
          compact={compactChoice}
          huge={!compactChoice}
          emoji="🧓"
          label={t('member.roleGrandparent')}
          onPress={() => setAdultKind('grandparent')}
        />
      </Wizard>
    );
  }

  return (
    <Wizard
      title={kind === 'child' ? t('member.child') : (isGrandparentInvite ? t('member.roleGrandparent') : t('member.adult'))}
      onBack={() => { if (kind === 'adult') setAdultKind(null); else setKind(null); }}
      onNext={submit}
      nextDisabled={!canCreate || saving || photoBusy}
      nextLabel={how === 'invite' ? t('member.invite') : t('group.create')}
      {...wizardProps}
    >
      {isGrandparentInvite ? (
        <Text style={styles.hint}>{t('member.grandparentAccessHint')}</Text>
      ) : null}
      {isInvite && (
        <>
          <Text style={styles.hint}>{t('member.inviteByContactHint')}</Text>
          <Text style={styles.foundHint}>{t('member.willSendAcceptInvite')}</Text>
          <Text style={styles.lbl}>
            {t('auth.email')}{' '}({t('member.atLeastOneContact')})
          </Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={[styles.input, emailInvalid && { borderColor: colors.danger }]}
          />
          {emailInvalid ? <Text style={styles.warn}>{t('auth.emailInvalid')}</Text> : null}
          <Text style={styles.lbl}>
            {t('auth.phone')}{' '}({t('member.atLeastOneContact')})
          </Text>
          <Text style={styles.hint}>{t('profile.phoneHint')}</Text>
          <PhoneInput value={phone} onChange={setPhone} />
          {!hasContact ? <Text style={styles.warn}>{t('member.emailOrPhone')}</Text> : null}
          <Text style={styles.lbl}>{t('profile.name')} ({t('common.optional')})</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} />
        </>
      )}

      {!isInvite && (
        <>
          <Text style={styles.lbl}>{t('profile.name')}</Text>
          <TextInput value={name} onChangeText={setName} style={styles.input} />
        </>
      )}

      {kind === 'child' && (
        <>
          <Text style={styles.lbl}>{t('profile.birthday')}</Text>
          <BirthdayPicker value={birthday} onChange={setBirthday} defaultAge={8} />
        </>
      )}

      {isManual && (
        <>
          <Text style={styles.lbl}>{t('profile.username')}</Text>
          <TextInput
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
            style={[styles.input, taken && { borderColor: colors.danger }]}
          />
          {username.trim() ? (
            checkingUsername ? (
              <Text style={styles.hint}>{t('member.checkingUsername')}</Text>
            ) : (
              <Text style={{ fontWeight: '700', color: taken ? colors.danger : colors.brand }}>
                {taken ? t('profile.usernameTaken') : isValidUsername(username) ? t('profile.usernameFree') : t('common.required')}
              </Text>
            )
          ) : null}
          {!email && !phone ? <Text style={styles.warn}>{t('profile.rememberUser')}</Text> : null}
          <PasswordFields
            password={password}
            onPasswordChange={setPassword}
            confirm={password2}
            onConfirmChange={setPassword2}
            minLen={pwMinLen}
            requireMixed={isAdult}
            hint={kind === 'child' ? t('member.passwordSet') : undefined}
          />
        </>
      )}

      {isManual ? (
        <>
          <Text style={styles.lbl}>
            {t('auth.email')}{' '}
            {kind === 'adult' ? '' : `(${t('common.optional')})`}
          </Text>
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            style={[styles.input, emailInvalid && { borderColor: colors.danger }]}
          />
          {emailInvalid ? <Text style={styles.warn}>{t('auth.emailInvalid')}</Text> : null}

          <Text style={styles.lbl}>
            {t('auth.phone')}{' '}
            {kind !== 'adult' ? `(${t('common.optional')})` : ''}
          </Text>
          <Text style={styles.hint}>{t('profile.phoneHint')}</Text>
          <PhoneInput value={phone} onChange={setPhone} />
          {kind === 'adult' && !hasContact ? (
            <Text style={styles.warn}>{t('member.emailOrPhone')}</Text>
          ) : null}
        </>
      ) : null}

      <Text style={styles.lbl}>{t('profile.location')} ({t('common.optional')})</Text>
      <LocationPicker value={location} onChange={setLocation} />

      <Text style={styles.lbl}>{t('profile.gender')}</Text>
      {[['woman', 'profile.woman'], ['man', 'profile.man'], ['other', 'profile.other'], ['unspecified', 'profile.unspecified']].map(([id, key]) => (
        <Choice key={id} label={t(key)} active={gender === id} onPress={() => setGender(id)} />
      ))}

      <Text style={styles.lbl}>{t('profile.photo')}</Text>
      <View style={{ alignItems: 'center' }}>
        <AvatarBubble avatarId={avatarId} photoURL={photoURL} name={name} size={72} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
        <TouchableOpacity style={styles.chip} onPress={() => photo(true)} disabled={photoBusy}>
          <Text style={styles.chipTxt}>{photoBusy ? t('common.loading') : t('profile.takePhoto')}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.chip} onPress={() => photo(false)} disabled={photoBusy}>
          <Text style={styles.chipTxt}>{t('profile.upload')}</Text>
        </TouchableOpacity>
        {photoURL ? (
          <TouchableOpacity
            style={[styles.chip, { backgroundColor: '#e2e8f0' }]}
            onPress={() => setPhotoURL('')}
            disabled={photoBusy}
          >
            <Text style={[styles.chipTxt, { color: colors.ink }]}>{t('common.delete')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={styles.hint}>{t('profile.pickCartoon')}</Text>
      <AvatarPicker value={avatarId} onChange={(id) => { setAvatarId(id); setPhotoURL(''); }} />

      <WebImageCropperModal
        visible={cropVisible}
        imageUri={selectedImageUri}
        aspect={1}
        title="Crop"
        onCancel={() => { setCropVisible(false); setSelectedImageUri(null); }}
        onConfirm={async (blob) => {
          setPhotoBusy(true);
          try {
            const url = await uploadImage(`families/${fid}/avatars/pending-${Date.now()}.jpg`, { blob });
            setPhotoURL(url);
          } catch (e) {
            alertPhotoError(e, t);
          } finally {
            setPhotoBusy(false);
            setCropVisible(false);
            setSelectedImageUri(null);
          }
        }}
      />

      {kind === 'adult' && superOk && !isGrandparentInvite && (
        <Choice label={t('group.makeAdmin')} active={asAdmin} onPress={() => setAsAdmin(!asAdmin)} />
      )}

      {!canCreate && missing.length > 0 ? (
        <View style={styles.missingBox}>
          <Text style={styles.missingTitle}>{t('member.missingFields')}</Text>
          {missing.map((item) => (
            <Text key={item} style={styles.missingItem}>• {item}</Text>
          ))}
        </View>
      ) : null}
    </Wizard>
  );
}

const styles = StyleSheet.create({
  lbl: { fontWeight: '800', color: colors.ink, marginTop: 6 },
  hint: { color: colors.muted, fontWeight: '600' },
  warn: { color: colors.warn, fontWeight: '700' },
  input: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    padding: 14, fontSize: 18, fontWeight: '600',
  },
  chip: { backgroundColor: colors.brandSoft, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 999 },
  chipTxt: { fontWeight: '800', color: colors.ink },
  big: { fontWeight: '800', fontSize: 18, textAlign: 'center' },
  bigModal: { fontWeight: '600', fontSize: 15 },
  cred: { fontSize: 28, fontWeight: '900', textAlign: 'center', color: colors.brand },
  credModal: { fontSize: 20, fontWeight: '700' },
  missingBox: {
    marginTop: 12, padding: 12, borderRadius: radius.md,
    backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa',
  },
  missingTitle: { fontWeight: '800', color: colors.ink, marginBottom: 4 },
  missingItem: { color: colors.warn, fontWeight: '600' },
  foundBox: {
    marginTop: 8, padding: 12, borderRadius: radius.md,
    backgroundColor: '#ecfdf5', borderWidth: 1, borderColor: '#a7f3d0', gap: 2,
  },
  foundTitle: { fontWeight: '800', color: colors.ink, marginBottom: 4 },
  foundName: { fontWeight: '900', color: colors.ink, fontSize: 16 },
  foundMeta: { fontWeight: '600', color: colors.muted },
  foundHint: { fontWeight: '700', color: colors.brand, marginTop: 6 },
});
