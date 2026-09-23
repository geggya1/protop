import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogForRole } from '../../src/homeWidgetCatalog';
import { soft } from '../parentHome/softTheme';
import WidgetCatalogGrid from './WidgetCatalogGrid';

export default function AddWidgetSheet({
  visible, role = 'parent', widgets = [], onClose, onPick,
}) {
  const catalog = catalogForRole(role);
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: Math.max(28, insets.bottom + 16) }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title}>Velg widgets</Text>
          <Text style={styles.lead}>
            Alle modulene kan ligge på hjem. Trykk for å skru av eller på — {catalog.length} valg.
          </Text>
          <ScrollView style={{ maxHeight: 460 }} showsVerticalScrollIndicator={false}>
            <WidgetCatalogGrid
              role={role}
              widgets={widgets}
              onToggle={(type) => onPick?.(type)}
              testIDPrefix="home-add"
            />
          </ScrollView>
          <TouchableOpacity
            style={styles.close}
            onPress={onClose}
            accessibilityRole="button"
            testID="home-add-done"
          >
            <Text style={styles.closeTxt}>Ferdig</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(40,44,52,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: soft.bg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 18,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: soft.line, marginBottom: 12,
  },
  title: { fontSize: 22, color: soft.ink, fontFamily: soft.display, marginBottom: 4 },
  lead: { fontSize: 14, color: soft.muted, fontFamily: soft.body, marginBottom: 12, lineHeight: 20 },
  close: { alignSelf: 'center', marginTop: 8, padding: 10 },
  closeTxt: { fontSize: 15, color: soft.sage, fontFamily: soft.body },
});
