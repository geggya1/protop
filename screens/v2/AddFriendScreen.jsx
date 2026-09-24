import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Alert, TouchableOpacity, ScrollView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors } from '../../src/theme';
import { Screen } from '../../components/ui';
import PhoneInput from '../../components/PhoneInput';
import useOptionalRoute from '../../src/hooks/useOptionalRoute';
import { isValidEmail } from '../../src/utils/account';
import { inviteFriendSmart } from '../../src/utils/friends';
import { classifyInviteIdentifier } from '../../src/utils/inviteIdentifiers';
import { friendProfileOwnerUid } from '../../src/utils/friendsLogic';
import { preferAuthUid } from '../../src/utils/inviteAuthUid';

function initialUsernameFromParams(params) {
  const raw = params?.username || params?.u || '';
  return String(raw).trim().replace(/^@+/, '').toLowerCase();
}

/**
 * Inviter venn via brukernavn, e-post eller telefon.
 * asModal: kompakt innhold til AddFriendModal (uten egen Screen / store knapper).
 *
 * Success is shown inline (not window.alert) — iOS Safari often suppresses
 * alert() after async work and would close the modal with no visible feedback.
 */
export default function AddFriendScreen({
  asModal = false, onClose, presetUsername: presetFromProps, asUid = null, familyId = null,
} = {}) {
  const nav = useNavigation();
  // Optional: SessionOverlays mounts AddFriendModal outside any Screen, so
  // useRoute() would throw "Couldn't find a route object" on mobile web.
  const route = useOptionalRoute();
  const { t } = useI18n();
  const {
    uid, activeProfile, meParent, meChild, userProfile,
    isActingAsChild, activeChild, familyId: ctxFamilyId, family,
  } = useApp();

  const presetUsername = String(presetFromProps || '').trim().replace(/^@+/, '').toLowerCase()
    || initialUsernameFromParams(route?.params);
  const fromQr = !!presetUsername;
  const [mode, setMode] = useState('existing'); // existing | new
  const [identifier, setIdentifier] = useState(presetUsername ? `@${presetUsername}` : '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null); // { type: 'ok'|'err', text, title? }

  const fromName = activeProfile?.name || meParent?.name || meChild?.name
    || userProfile?.displayName || userProfile?.name || '';
  const fromPhotoURL = activeProfile?.photoURL || meParent?.photoURL || userProfile?.photoURL || null;
  const fromAvatarId = activeProfile?.avatarId || meParent?.avatarId || userProfile?.avatarId || null;
  const childAuthUid = preferAuthUid(activeChild?.uid, activeChild?.id);
  const profileOwnerUid = friendProfileOwnerUid({
    authUid: uid,
    isActingAsChild,
    childUid: childAuthUid,
  });
  const inviteAsUid = String(asUid || '').trim()
    || (isActingAsChild && profileOwnerUid && profileOwnerUid !== uid ? profileOwnerUid : '');
  const inviteFamilyId = String(familyId || ctxFamilyId || family?.id || '').trim() || null;
  const fromUid = inviteAsUid || uid;

  const emailInvalid = email.trim().length > 0 && !isValidEmail(email);
  const classified = classifyInviteIdentifier(identifier.trim());

  const canSubmit = useMemo(() => {
    if (feedback?.type === 'ok') return false;
    if (mode === 'existing') {
      if (!identifier.trim()) return false;
      if (classified.kind === 'invalid-email' || classified.kind === 'invalid-username') return false;
      if (classified.kind === 'email' || classified.kind === 'phone' || classified.kind === 'username') {
        return true;
      }
      return false;
    }
    if (emailInvalid) return false;
    const wantMail = sendEmail && email.trim();
    const wantSms = sendSms && phone.trim();
    if (!wantMail && !wantSms) return false;
    if (wantMail && !isValidEmail(email)) return false;
    return true;
  }, [mode, identifier, classified.kind, email, phone, sendEmail, sendSms, emailInvalid, feedback]);

  const finish = () => {
    if (asModal && onClose) onClose();
    else nav.goBack();
  };

  const submit = async () => {
    if (!canSubmit || !uid || saving) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await inviteFriendSmart({
        fromUid,
        fromName,
        fromPhotoURL,
        fromAvatarId,
        asUid: inviteAsUid || undefined,
        familyId: inviteAsUid ? inviteFamilyId : undefined,
        name: name.trim(),
        email: mode === 'new'
          ? (sendEmail ? email.trim() : '')
          : (classified.kind === 'email' ? identifier.trim() : email.trim()),
        phone: mode === 'new'
          ? (sendSms ? phone : '')
          : (classified.kind === 'phone' ? identifier.trim() : phone),
        username: classified.kind === 'username' ? identifier.trim() : '',
        identifier: mode === 'existing' ? identifier.trim() : '',
      });

      const parts = [];
      if (res.existingUser) {
        parts.push(t('friend.inviteSentExisting'));
        parts.push(t('friend.inviteSentExistingPrivacy'));
      } else {
        parts.push(t('friend.inviteSentNew'));
      }
      if (res.emailSent) parts.push(t('friend.emailSent'));
      else if (res.emailQueued && res.emailError) parts.push(`${t('friend.emailFailed')}: ${res.emailError}`);
      else if (res.emailError && res.emailError !== 'mail-key-missing') {
        parts.push(`${t('friend.emailFailed')}: ${res.emailError}`);
      }
      if (res.smsSent) parts.push(t('friend.smsSent'));
      else if (res.smsQueued && res.smsError) parts.push(`${t('friend.smsFailed')}: ${res.smsError}`);
      else if (res.smsError) parts.push(`${t('friend.smsFailed')}: ${res.smsError}`);
      if (!res.existingUser && res.registerUrl && !res.emailSent && !res.smsSent) {
        parts.push(res.registerUrl);
      }

      const text = parts.join('\n');
      // Inline only — never auto-dismiss. window.alert after await is unreliable on iOS.
      setFeedback({ type: 'ok', title: t('friend.inviteSentTitle'), text });
      if (Platform.OS !== 'web') {
        Alert.alert(t('friend.inviteSentTitle'), text, [
          { text: t('common.ok'), onPress: finish },
        ]);
      }
    } catch (e) {
      const msg = e?.message;
      let text = t('common.error');
      if (msg === 'user-not-found') text = t('friend.userNotFound');
      else if (msg === 'already-friends') text = t('friend.alreadyFriends');
      else if (msg === 'invite-pending') text = t('friend.invitePending');
      else if (msg === 'cannot-invite-self') text = t('friend.cannotInviteSelf');
      else if (msg === 'contact-required') text = t('friend.contactRequired');
      else if (msg === 'invite-failed') text = t('friend.inviteFailed');
      else if (msg) text = msg;
      setFeedback({ type: 'err', title: t('common.error'), text });
      if (Platform.OS !== 'web') {
        Alert.alert(t('common.error'), text);
      }
    } finally {
      setSaving(false);
    }
  };

  if (feedback?.type === 'ok') {
    const done = (
      <View style={[styles.body, asModal && styles.bodyModal, styles.successWrap]}>
        <Ionicons name="checkmark-circle" size={48} color="#16a34a" />
        <Text style={styles.successTitle}>{feedback.title || t('friend.inviteSentTitle')}</Text>
        <Text style={styles.successBody}>{feedback.text}</Text>
        <TouchableOpacity style={styles.doneBtn} onPress={finish} accessibilityRole="button">
          <Text style={styles.doneBtnTxt}>{t('common.ok')}</Text>
        </TouchableOpacity>
      </View>
    );
    if (asModal) return done;
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.scroll}>{done}</ScrollView>
      </Screen>
    );
  }

  const form = (
    <View style={[styles.body, asModal && styles.bodyModal]}>
      {!asModal ? (
        <TouchableOpacity style={styles.back} onPress={() => nav.goBack()}>
          <Ionicons name="chevron-back" size={18} color={colors.brand} />
          <Text style={styles.backTxt}>{t('common.back')}</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={[styles.title, asModal && styles.titleModal]}>{t('friend.add')}</Text>
      <Text style={[styles.lead, asModal && styles.leadModal]}>
        {fromQr ? t('friend.addFromQrLead', { username: presetUsername }) : t('friend.addLead')}
      </Text>

      <View style={styles.modeRow}>
        {[
          { id: 'existing', label: t('friend.existingUser'), icon: 'search-outline' },
          { id: 'new', label: t('friend.newUser'), icon: 'mail-outline' },
        ].map((opt) => {
          const on = mode === opt.id;
          return (
            <TouchableOpacity
              key={opt.id}
              style={[styles.modeChip, on && styles.modeChipOn]}
              onPress={() => { setMode(opt.id); setFeedback(null); }}
            >
              <Ionicons name={opt.icon} size={14} color={on ? '#fff' : colors.brand} />
              <Text style={[styles.modeTxt, on && styles.modeTxtOn]}>{opt.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {mode === 'existing' ? (
        <>
          <Text style={styles.label}>{t('friend.identifierLabel')}</Text>
          <TextInput
            style={styles.input}
            value={identifier}
            onChangeText={(v) => { setIdentifier(v); setFeedback(null); }}
            placeholder={t('friend.identifierPlaceholder')}
            autoCapitalize="none"
            autoCorrect={false}
            placeholderTextColor={colors.muted}
          />
          <Text style={styles.hint}>{t('friend.identifierHint')}</Text>
        </>
      ) : (
        <>
          <Text style={styles.label}>{t('profile.name')}</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('friend.namePlaceholder')}
            placeholderTextColor={colors.muted}
          />

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setSendEmail((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: sendEmail }}
          >
            <Ionicons
              name={sendEmail ? 'checkbox' : 'square-outline'}
              size={18}
              color={colors.brand}
            />
            <Text style={styles.checkTxt}>{t('friend.sendEmail')}</Text>
          </TouchableOpacity>
          {sendEmail ? (
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="navn@epost.no"
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={colors.muted}
            />
          ) : null}
          {emailInvalid ? <Text style={styles.error}>{t('auth.emailInvalid')}</Text> : null}

          <TouchableOpacity
            style={styles.checkRow}
            onPress={() => setSendSms((v) => !v)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: sendSms }}
          >
            <Ionicons
              name={sendSms ? 'checkbox' : 'square-outline'}
              size={18}
              color={colors.brand}
            />
            <Text style={styles.checkTxt}>{t('friend.sendSms')}</Text>
          </TouchableOpacity>
          {sendSms ? (
            <PhoneInput value={phone} onChange={setPhone} />
          ) : null}
        </>
      )}

      <View style={styles.notice}>
        <Ionicons name="shield-checkmark-outline" size={16} color={colors.brand} />
        <Text style={styles.noticeTxt}>{t('friend.privacyNotice')}</Text>
      </View>

      {feedback?.type === 'err' ? (
        <View style={[styles.feedback, styles.feedbackErr]} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={16} color="#991b1b" />
          <Text style={[styles.feedbackTxt, styles.feedbackTxtErr]}>{feedback.text}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {asModal ? (
          <TouchableOpacity style={styles.cancelBtn} onPress={finish} disabled={saving}>
            <Text style={styles.cancelTxt}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[
            styles.submit,
            asModal && styles.submitModal,
            (!canSubmit || saving) && styles.submitDisabled,
          ]}
          onPress={submit}
          disabled={!canSubmit || saving}
        >
          <Text style={styles.submitTxt}>
            {saving ? t('common.loading') : t('friend.sendInvite')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (asModal) return form;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {form}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 40 },
  body: { padding: 16 },
  bodyModal: { padding: 0, paddingBottom: 4 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backTxt: { color: colors.brand, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: 6 },
  titleModal: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  lead: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 16 },
  leadModal: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line || colors.border,
  },
  modeChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  modeTxt: { color: colors.ink || colors.text, fontWeight: '500', fontSize: 12 },
  modeTxtOn: { color: '#fff' },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: 11,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.card,
    marginBottom: 8,
  },
  hint: { fontSize: 12, color: colors.muted, marginBottom: 12, lineHeight: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, marginBottom: 6 },
  checkTxt: { fontSize: 13, color: colors.text, fontWeight: '500' },
  error: { color: '#dc2626', fontSize: 12, marginBottom: 8 },
  notice: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#eff6ff',
    borderRadius: 8,
    padding: 10,
    marginTop: 12,
    marginBottom: 14,
  },
  noticeTxt: { flex: 1, fontSize: 12, color: colors.text, lineHeight: 17 },
  feedback: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    alignItems: 'flex-start',
  },
  feedbackErr: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  feedbackTxt: { flex: 1, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  feedbackTxtErr: { color: '#991b1b' },
  successWrap: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 8,
    gap: 10,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  successBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: 'center',
    marginBottom: 8,
  },
  doneBtn: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 28,
    minWidth: 160,
    alignItems: 'center',
    marginTop: 8,
  },
  doneBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  cancelBtn: { paddingHorizontal: 12, paddingVertical: 8 },
  cancelTxt: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  submit: {
    backgroundColor: colors.brand,
    borderRadius: 8,
    paddingVertical: 11,
    paddingHorizontal: 16,
    alignItems: 'center',
    flex: 1,
  },
  submitModal: { flex: 0, minWidth: 160 },
  submitDisabled: { opacity: 0.45 },
  submitTxt: { color: '#fff', fontWeight: '600', fontSize: 13 },
});
