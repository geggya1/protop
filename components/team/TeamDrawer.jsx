import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { teamColors as c } from '../../src/teamTheme';
import { buildTeamModules } from '../../src/navigation/teamModules';
import { goPlatformOverview } from '../../src/utils/platformNav';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { isGroupAdmin } from '../../src/utils/groups';

export default function TeamDrawer({ visible, onClose, activeTab, onSelectTab, team }) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { t } = useI18n();
  const { uid, familyId } = useApp();
  const isAdmin = isGroupAdmin(team, uid);

  const sections = useMemo(
    () => buildTeamModules({ t, isAdmin }),
    [t, isAdmin],
  );

  const run = (item) => {
    onClose?.();
    if (item.action?.type === 'platformOverview') {
      goPlatformOverview(nav);
      return;
    }
    if (item.action?.type === 'nav') {
      const params = { ...(item.action.params || {}) };
      if (item.action.screen === 'TeamAddMember') {
        params.teamId = team?.id || familyId;
        params.team = team;
      }
      if (item.action.screen === 'FamilyOverview') {
        goPlatformOverview(nav);
        return;
      }
      nav.navigate(item.action.screen, params);
      return;
    }
    if (item.tab) onSelectTab?.(item.tab);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.panel, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.head}>
            <Text style={styles.headTitle} numberOfLines={1}>{team?.name || 'Idrettslag'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={c.ink} />
            </TouchableOpacity>
          </View>
          {!!team?.sport && (
            <Text style={styles.sportHint}>{team.sport}</Text>
          )}
          {!!team?.joinCode && isAdmin && (
            <Text style={styles.codeHint}>Lagkode: {team.joinCode}</Text>
          )}
          <ScrollView showsVerticalScrollIndicator={false}>
            {sections.map((section) => (
              <View key={section.id} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.items.map((item) => {
                  const on = activeTab === item.tab;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.row, on && styles.rowOn]}
                      onPress={() => run(item)}
                    >
                      <Ionicons
                        name={on ? item.icon : `${item.icon}-outline`}
                        size={20}
                        color={on ? c.brand : c.ink}
                      />
                      <Text style={[styles.rowTxt, on && styles.rowTxtOn]}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => {
                onClose?.();
                nav.navigate('TeamJoin');
              }}
            >
              <Ionicons name="key-outline" size={20} color={c.brand} />
              <Text style={styles.linkTxt}>Bli med med lagkode</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => {
                onClose?.();
                goPlatformOverview(nav);
              }}
            >
              <Ionicons name="swap-horizontal-outline" size={20} color={c.tint} />
              <Text style={[styles.linkTxt, { color: c.tint }]}>Skift organisasjon</Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(26, 39, 68, 0.4)', flexDirection: 'row' },
  panel: {
    width: '82%', maxWidth: 320, backgroundColor: c.surface,
    borderRightWidth: 1, borderRightColor: c.line, paddingHorizontal: 14,
    borderLeftWidth: 4, borderLeftColor: c.stripe,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  headTitle: { flex: 1, fontSize: 20, fontWeight: '900', color: c.ink },
  closeBtn: {
    width: 36, height: 36, borderRadius: 12, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  sportHint: { color: c.tint, fontWeight: '700', fontSize: 13, marginBottom: 4 },
  codeHint: { color: c.muted, fontWeight: '700', fontSize: 12, marginBottom: 12 },
  section: { marginBottom: 16 },
  sectionTitle: {
    color: c.muted, fontSize: 11, fontWeight: '800',
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 10, borderRadius: 14, marginBottom: 4,
  },
  rowOn: { backgroundColor: c.brandSoft },
  rowTxt: { color: c.ink, fontWeight: '700', fontSize: 15 },
  rowTxtOn: { color: c.brand },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 10, marginBottom: 4,
  },
  linkTxt: { color: c.brand, fontWeight: '800', fontSize: 15 },
});
