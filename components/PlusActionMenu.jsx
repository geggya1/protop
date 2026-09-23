import React from 'react';
import { Modal, Pressable, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, useLayout } from '../src/theme';
import { desktopOverlay, desktopSheet } from '../src/desktop';

/**
 * Bottom-sheet / popup for «hva vil du registrere?» after pressing +.
 * items: [{ id, icon, label, hint?, onPress, danger? }]
 */
export default function PlusActionMenu({
  visible,
  title = 'Hva vil du registrere?',
  subtitle,
  items = [],
  onClose,
}) {
  const { isDesktop } = useLayout();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, isDesktop && desktopOverlay]}
        onPress={onClose}
      >
        <Pressable
          style={[styles.sheet, isDesktop && [desktopSheet, styles.sheetDesk]]}
          onPress={(e) => e.stopPropagation?.()}
        >
          {!isDesktop ? <View style={styles.handle} /> : null}
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.row}
              onPress={() => {
                // Kjør handling først, så kallere kan lese midlertidig state
                // (f.eks. drop-kø) før onClose tømmer den.
                item.onPress?.();
                onClose?.();
              }}
              accessibilityRole="button"
              accessibilityLabel={item.label}
            >
              <View style={[styles.iconWrap, item.danger && styles.iconWrapDanger]}>
                <Ionicons
                  name={item.icon || 'add'}
                  size={18}
                  color={item.danger ? '#b91c1c' : colors.brand}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, item.danger && styles.rowLabelDanger]}>
                  {item.label}
                </Text>
                {item.hint ? <Text style={styles.rowHint}>{item.hint}</Text> : null}
              </View>
              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelTxt}>Avbryt</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    paddingBottom: 28,
  },
  sheetDesk: {
    alignSelf: 'center',
    marginBottom: 0,
    maxWidth: 420,
    width: '100%',
    borderRadius: 12,
    padding: 18,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: 12,
  },
  title: { fontSize: 17, fontWeight: '500', color: colors.ink, marginBottom: 4 },
  subtitle: {
    fontSize: 13, fontWeight: '400', color: colors.muted, marginBottom: 8, lineHeight: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDanger: { backgroundColor: '#fef2f2' },
  rowLabel: { fontSize: 15, fontWeight: '500', color: colors.ink },
  rowLabelDanger: { color: '#b91c1c' },
  rowHint: { fontSize: 12, fontWeight: '400', color: colors.muted, marginTop: 2 },
  cancel: {
    marginTop: 12,
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: colors.brandSoft,
    borderRadius: 10,
  },
  cancelTxt: { color: colors.brand, fontWeight: '500' },
});
