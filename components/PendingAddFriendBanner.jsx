import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '../src/i18n';
import { colors } from '../src/theme';
import {
  peekPendingAddFriend,
  hydratePendingAddFriend,
} from '../src/utils/pendingAddFriend';

/** Shown on signup/login/onboarding so the QR username survives until Add Friend. */
export default function PendingAddFriendBanner() {
  const { t } = useI18n();
  const [username, setUsername] = useState(() => peekPendingAddFriend());

  useEffect(() => {
    let alive = true;
    hydratePendingAddFriend().then((u) => {
      if (alive && u) setUsername(u);
    });
    return () => { alive = false; };
  }, []);

  if (!username) return null;

  return (
    <View style={styles.box} accessibilityRole="text">
      <Ionicons name="qr-code-outline" size={18} color={colors.brand} />
      <View style={{ flex: 1 }}>
        <Text style={styles.eyebrow}>{t('friend.pendingQrEyebrow')}</Text>
        <Text style={styles.title}>{t('friend.pendingQrTitle', { username })}</Text>
        <Text style={styles.body}>{t('friend.pendingQrBody', { username })}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#eff6ff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  title: { fontSize: 15, fontWeight: '800', color: colors.ink },
  body: { marginTop: 4, fontSize: 13, fontWeight: '600', color: colors.muted, lineHeight: 18 },
});
