import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Share, Platform, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors } from '../../src/theme';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import { AvatarBubble } from '../../components/AvatarPicker';
import { friendAddByUsernameUrl } from '../../src/utils/friendsLogic';
import { isValidUsername } from '../../src/utils/usernames';

/**
 * Vis QR-kode andre kan skanne for å sende deg venneforespørsel.
 * asModal: kompakt innhold til FriendQrModal.
 */
export default function FriendQrScreen({ asModal = false, onClose } = {}) {
  const nav = useNavigation();
  const { t } = useI18n();
  const { activeProfile, meParent, meChild, userProfile } = useApp();
  const [copied, setCopied] = useState(false);

  const name = activeProfile?.name || meParent?.name || meChild?.name
    || userProfile?.displayName || userProfile?.name || '';
  const username = String(
    activeProfile?.username || meParent?.username || meChild?.username
      || userProfile?.username || '',
  ).trim().replace(/^@+/, '').toLowerCase();
  const photoURL = activeProfile?.photoURL || meParent?.photoURL || userProfile?.photoURL || null;
  const avatarId = activeProfile?.avatarId || meParent?.avatarId || userProfile?.avatarId || null;

  const hasUsername = isValidUsername(username);
  const shareUrl = useMemo(
    () => (hasUsername ? friendAddByUsernameUrl(username) : ''),
    [hasUsername, username],
  );

  const copyText = async (value) => {
    const text = String(value || '').trim();
    if (!text) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        await Share.share({ message: text });
        return;
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      Alert.alert(t('common.error'), text);
    }
  };

  const shareInvite = async () => {
    if (!shareUrl) return;
    const message = t('friend.qrShareMessage', { name: name || 'ProTop', username, url: shareUrl });
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(message);
        Alert.alert(t('friend.copiedTitle'), t('friend.copiedBody'));
        return;
      }
      await Share.share({ message, url: shareUrl });
    } catch {
      Alert.alert(t('friend.qrTitle'), shareUrl);
    }
  };

  const goProfile = () => {
    if (asModal && onClose) onClose();
    nav.navigate('ProfileSettings');
  };

  const body = (
    <View style={[styles.body, asModal && styles.bodyModal]}>
      {asModal ? null : (
        <CompactBackLink onPress={() => nav.goBack()} label={t('common.back')} />
      )}
      <Text style={[styles.title, asModal && styles.titleModal]}>{t('friend.qrTitle')}</Text>
      <Text style={[styles.lead, asModal && styles.leadModal]}>{t('friend.qrLead')}</Text>

      {!hasUsername ? (
        <View style={styles.missingCard}>
          <Ionicons name="at-outline" size={28} color={colors.brand} />
          <Text style={styles.missingTitle}>{t('friend.qrNeedUsername')}</Text>
          <Text style={styles.missingBody}>{t('friend.qrNeedUsernameBody')}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={goProfile}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnTxt}>{t('settings.editProfile')}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.card, asModal && styles.cardModal]}>
          <AvatarBubble avatarId={avatarId} photoURL={photoURL} name={name} size={asModal ? 44 : 56} />
          <Text style={styles.name}>{name || t('friend.friendLabel')}</Text>
          <TouchableOpacity onPress={() => copyText(`@${username}`)} accessibilityRole="button">
            <Text style={styles.handle}>@{username}</Text>
          </TouchableOpacity>

          <View style={[styles.qrWrap, asModal && styles.qrWrapModal]}>
            <QRCode
              value={shareUrl}
              size={asModal ? 168 : 180}
              backgroundColor="#fff"
              color={colors.ink || '#0f172a'}
            />
          </View>
          <Text style={styles.scanHint}>{t('friend.qrScanHint')}</Text>

          <TouchableOpacity style={styles.primaryBtn} onPress={shareInvite} accessibilityRole="button">
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={styles.primaryBtnTxt}>{t('friend.qrShare')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => copyText(`@${username}`)}
            accessibilityRole="button"
          >
            <Ionicons name="copy-outline" size={16} color={colors.brand} />
            <Text style={styles.secondaryBtnTxt}>
              {copied ? t('friend.copiedShort') : t('friend.copyUsername')}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  if (asModal) return body;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {body}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24 },
  body: { padding: 16, paddingBottom: 24 },
  bodyModal: { padding: 0, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 6 },
  titleModal: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  lead: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 18 },
  leadModal: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
  card: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    gap: 8,
  },
  cardModal: {
    padding: 12,
    borderWidth: 0,
  },
  name: { fontSize: 18, fontWeight: '800', color: colors.ink, marginTop: 4 },
  handle: { fontSize: 16, fontWeight: '700', color: colors.brand },
  qrWrap: {
    marginTop: 12,
    marginBottom: 8,
    padding: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  qrWrapModal: {
    marginTop: 8,
    padding: 10,
  },
  scanHint: {
    textAlign: 'center',
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  primaryBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 18,
    alignSelf: 'stretch',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    alignSelf: 'stretch',
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '700', fontSize: 14 },
  missingCard: {
    alignItems: 'center',
    gap: 10,
    padding: 20,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  missingTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  missingBody: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 18 },
});
