import React from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isGroupAdmin } from '../../src/utils/groups';
import { useApp } from '../../src/context/AppContext';

export default function PlatformMoreScreen({ config, group, onSelectTab }) {
  const c = config.theme;
  const { uid } = useApp();
  const isAdmin = isGroupAdmin(group, uid);
  const modules = (config.moreModules || []).filter((m) => !m.admin || isAdmin);

  return (
    <ScrollView contentContainerStyle={[styles.body, { backgroundColor: c.bg }]}>
      <Text style={[styles.lead, { color: c.muted }]}>
        Alle moduler for {config.labelShort.toLowerCase()}en.
      </Text>
      <View style={styles.grid}>
        {modules.map((mod) => (
          <TouchableOpacity
            key={mod.id}
            style={[styles.tile, { backgroundColor: c.surface, borderColor: c.line }]}
            onPress={() => onSelectTab?.(mod.tab)}
          >
            <View style={[styles.iconWrap, { backgroundColor: c.brandSoft }]}>
              <Ionicons name={mod.icon} size={22} color={c.brand} />
            </View>
            <Text style={[styles.label, { color: c.ink }]} numberOfLines={2}>{mod.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 32 },
  lead: { fontSize: 13, marginBottom: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: '47%', borderRadius: 16, padding: 14, borderWidth: 1, gap: 10, minHeight: 100 },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 13, fontWeight: '400', lineHeight: 17 },
});
