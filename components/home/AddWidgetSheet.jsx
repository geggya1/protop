import React from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, ScrollView, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { catalogForRole } from '../../src/homeWidgetCatalog';
import { colors } from '../../src/theme';
import { radius } from '../../src/ui/tokens';
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
    backgroundColor: 'rgba(15,23,42,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: 18,
    paddingBottom: 28,
  },
  handle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line, marginBottom: 12,
  },
  title: { fontSize: 20, color: colors.ink, fontWeight: '600', marginBottom: 4 },
  lead: { fontSize: 14, color: colors.muted, marginBottom: 12, lineHeight: 20 },
  close: { alignSelf: 'center', marginTop: 8, padding: 10 },
  closeTxt: { fontSize: 15, color: colors.brandInk, fontWeight: '600' },
});
