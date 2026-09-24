import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { teamColors as c } from '../../src/teamTheme';
import { AvatarBubble } from '../AvatarPicker';
import ProfileMenuModal from '../ProfileMenuModal';
import HelpButton from '../HelpButton';
import HelpTarget from '../HelpTarget';

/** Toppfelt for TeamShell — samme mønster/størrelser som ShellHeader, lag-farger. */
export default function TeamHeader({
  title = 'Hjem',
  teamName,
  onMenuPress,
  onRightPress,
  rightLabel,
  rightIcon = 'people-outline',
  onAddPress,
  addIcon = 'add',
  addLabel = 'Legg til',
}) {
  const { activeProfile } = useApp();
  const [menuOpen, setMenuOpen] = useState(false);
  const orgName = teamName || 'Lag';

  return (
    <>
      <View style={styles.wrap}>
        <View style={styles.stripe} />
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
            <Text style={styles.orgName} numberOfLines={1}>{orgName}</Text>
            <Text style={styles.pageTitle} numberOfLines={1}>{title}</Text>
            <View style={styles.modeRow}>
              <View style={styles.modePill}>
                <Ionicons name="football-outline" size={11} color={c.brand} />
                <Text style={styles.modePillTxt}>Idrettslag</Text>
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
                <TouchableOpacity style={styles.addBtn} onPress={onAddPress} accessibilityLabel={addLabel}>
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
  wrap: {
    backgroundColor: c.bg,
    borderBottomWidth: 1,
    borderBottomColor: c.line,
  },
  stripe: {
    height: 3,
    backgroundColor: c.stripe,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  textCol: { flex: 1, minWidth: 0 },
  orgName: { fontSize: 13, fontWeight: '700', color: c.muted },
  pageTitle: { fontSize: 20, fontWeight: '900', color: c.ink, marginTop: 1 },
  modeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3, minWidth: 0,
  },
  modePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: c.brandSoft, borderRadius: 999,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  modePillTxt: {
    fontSize: 10, fontWeight: '800', color: c.brand, letterSpacing: 0.2,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    borderWidth: 1, borderColor: c.line, backgroundColor: c.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  addBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: c.fab,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarWrap: { marginLeft: 2 },
});
