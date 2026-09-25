import React, { useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildPlatformModules } from '../../src/platform/platformConfigs';
import { goPlatformOverview } from '../../src/utils/platformNav';
import { useApp } from '../../src/context/AppContext';
import { isGroupAdmin } from '../../src/utils/groups';

export default function PlatformDrawer({
  config, visible, onClose, activeTab, onSelectTab, group,
}) {
  const nav = useNavigation();
  const insets = useSafeAreaInsets();
  const { uid, familyId } = useApp();
  const c = config.theme;
  const isAdmin = isGroupAdmin(group, uid);

  const sections = useMemo(
    () => buildPlatformModules(config, { isAdmin }),
    [config, isAdmin],
  );

  const run = (item) => {
    onClose?.();
    if (item.action?.type === 'platformOverview') {
      goPlatformOverview(nav);
      return;
    }
    if (item.tab) onSelectTab?.(item.tab);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.panel,
            { backgroundColor: c.surface, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 },
          ]}
          onStartShouldSetResponder={() => true}
        >
          <View style={styles.head}>
            <Text style={[styles.headTitle, { color: c.ink }]} numberOfLines={1}>
              {group?.name || config.label}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={c.ink} />
            </TouchableOpacity>
          </View>
          {!!group?.joinCode && isAdmin && (
            <Text style={[styles.codeHint, { color: c.brand }]}>
              {config.codeLabel}: {group.joinCode}
            </Text>
          )}
          <ScrollView showsVerticalScrollIndicator={false}>
            {sections.map((section) => (
              <View key={section.id} style={styles.section}>
                <Text style={[styles.sectionTitle, { color: c.muted }]}>{section.title}</Text>
                {section.items.map((item) => {
                  const on = activeTab === item.tab;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.row, on && { backgroundColor: c.brandSoft }]}
                      onPress={() => run(item)}
                    >
                      <Ionicons
                        name={on ? item.icon : `${item.icon}-outline`}
                        size={20}
                        color={on ? c.brand : c.ink}
                      />
                      <Text style={[styles.rowTxt, { color: on ? c.brand : c.ink }, on && styles.rowTxtOn]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
            <TouchableOpacity
              style={styles.linkRow}
              onPress={() => {
                onClose?.();
                nav.navigate(config.joinRoute);
              }}
            >
              <Ionicons name="key-outline" size={20} color={c.brand} />
              <Text style={[styles.linkTxt, { color: c.brand }]}>
                Bli med med {config.codeLabel.toLowerCase()}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  panel: { width: '82%', maxWidth: 320, height: '100%', paddingHorizontal: 16 },
  head: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  headTitle: { flex: 1, fontSize: 18, fontWeight: '400' },
  closeBtn: {
    alignSelf: 'flex-start', padding: 8 },
  codeHint: { fontSize: 12, fontWeight: '400', marginBottom: 12 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 11, fontWeight: '400', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 10, borderRadius: 12 },
  rowTxt: { fontSize: 15, fontWeight: '400' },
  rowTxtOn: { fontWeight: '400' },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, marginTop: 8 },
  linkTxt: { fontSize: 14, fontWeight: '400' },
});
