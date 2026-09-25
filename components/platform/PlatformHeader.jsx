import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { AvatarBubble } from '../AvatarPicker';
import ProfileMenuModal from '../ProfileMenuModal';
import HelpButton from '../HelpButton';
import HelpTarget from '../HelpTarget';

/** Toppfelt for sosiale plattformskjell — konfigurerbart per type. */
export default function PlatformHeader({
  config,
  title = 'Hjem',
  groupName,
  onMenuPress,
  onRightPress,
  rightLabel,
  rightIcon = 'people-outline',
  onAddPress,
  addIcon = 'add',
  addLabel = 'Legg til',
}) {
  const c = config.theme;
  const { activeProfile } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const orgName = groupName || config.label;

  return (
    <>
      <View style={[styles.wrap, { backgroundColor: c.bg, borderBottomColor: c.line }]}>
        <View style={[styles.stripe, { backgroundColor: c.stripe }]} />
        <View style={styles.bar}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={onMenuPress}
            accessibilityLabel="Åpne meny"
            accessibilityRole="button"
          >
            <Ionicons name="menu" size={22} color={c.ink} />
          </TouchableOpacity>

          <View style={styles.textCol}>
            <Text style={[styles.orgName, { color: c.muted }]} numberOfLines={1}>{orgName}</Text>
            <Text style={[styles.pageTitle, { color: c.ink }]} numberOfLines={1}>{title}</Text>
            <View style={styles.modeRow}>
              <View style={[styles.modePill, { backgroundColor: c.brandSoft }]}>
                <Ionicons name={config.icon} size={11} color={c.brand} />
                <Text style={[styles.modePillTxt, { color: c.brand }]}>{config.labelShort}</Text>
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <HelpButton color={c.ink} borderColor={c.line} backgroundColor={c.surface} />
            {!!rightLabel && !!onRightPress && (
              <TouchableOpacity style={styles.iconBtn} onPress={onRightPress} accessibilityLabel={rightLabel}>
                <Ionicons name={rightIcon} size={20} color={c.ink} />
              </TouchableOpacity>
            )}
            {!!onAddPress && (
              <HelpTarget id="add">
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: c.fab }]}
                  onPress={onAddPress}
                  accessibilityLabel={addLabel}
                >
                  <Ionicons name={addIcon} size={22} color="#fff" />
                </TouchableOpacity>
              </HelpTarget>
            )}
            <TouchableOpacity
              style={styles.avatarWrap}
              onPress={() => setMenuOpen(true)}
              accessibilityLabel="Profilmeny"
            >
              <AvatarBubble
                avatarId={activeProfile?.avatarId}
                photoURL={activeProfile?.photoURL}
                name={activeProfile?.name || '?'}
                size={34}
              />
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <ProfileMenuModal visible={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: 1 },
  stripe: { height: 3 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 8 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  textCol: { flex: 1, minWidth: 0 },
  orgName: { fontSize: 11, fontWeight: '400' },
  pageTitle: { fontSize: 17, fontWeight: '400' },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  modePill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  modePillTxt: { fontSize: 10, fontWeight: '400' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  addBtn: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  avatarWrap: { marginLeft: 2 },
});
