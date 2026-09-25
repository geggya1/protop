import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import { useI18n } from '../src/i18n';

export default function AdminBadge({ superAdmin, admin }) {
  const { t } = useI18n();
  if (!superAdmin && !admin) return null;
  return (
    <View style={[styles.badge, superAdmin ? styles.super : styles.admin]}>
      <Ionicons name={superAdmin ? 'shield' : 'shield-outline'} size={12} color="#fff" />
      <Text style={styles.txt}>{superAdmin ? t('group.superAdmin') : t('group.admin')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
  },
  super: { backgroundColor: '#e2a325' },
  admin: { backgroundColor: colors.brand },
  txt: { color: '#fff', fontWeight: '400', fontSize: 11 },
});
