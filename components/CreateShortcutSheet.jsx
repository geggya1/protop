import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, useLayout } from '../src/theme';
import { desktopOverlay, desktopSheet } from '../src/desktop';

/**
 * Snarvei-meny fra dashboard-FAB: velg hva du vil registrere.
 * Mobil/nettbrett: bunnpane. Desktop: sentrert dialog.
 * options: [{ id, icon, label, sub?, onPress }]
 */
export default function CreateShortcutSheet({ visible, onClose, options = [] }) {
  const { isDesktop } = useLayout();
  return (
    <Modal
      visible={visible}
      transparent
      animationType={isDesktop ? 'fade' : 'slide'}
      onRequestClose={onClose}
    >
      <Pressable
        style={[styles.backdrop, isDesktop && desktopOverlay]}
        onPress={onClose}
      >
        <Pressable
          style={[styles.sheet, isDesktop && [styles.sheetDesktop, desktopSheet]]}
          onPress={(e) => e.stopPropagation()}
        >
          {isDesktop ? null : <View style={styles.handle} />}
          <Text style={[styles.title, isDesktop && styles.titleDesktop]}>Hva vil du registrere?</Text>
          <Text style={[styles.sub, isDesktop && styles.subDesktop]}>Snarvei til ny oppføring i appene</Text>
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {options.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[styles.row, isDesktop && styles.rowDesktop]}
                onPress={() => {
                  onClose?.();
                  setTimeout(() => opt.onPress?.(), 40);
                }}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
              >
                <View style={[styles.iconWrap, isDesktop && styles.iconWrapDesktop]}>
                  <Ionicons name={opt.icon} size={isDesktop ? 18 : 20} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.rowLabel, isDesktop && styles.rowLabelDesk]}>{opt.label}</Text>
                  {opt.sub ? <Text style={[styles.rowSub, isDesktop && styles.rowSubDesk]}>{opt.sub}</Text> : null}
                </View>
                {isDesktop ? null : <Ionicons name="chevron-forward" size={16} color={colors.muted} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={[styles.cancel, isDesktop && styles.cancelDesktop]} onPress={onClose}>
            <Text style={[styles.cancelTxt, isDesktop && styles.cancelTxtDesk]}>Avbryt</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 10,
    maxHeight: '78%',
  },
  sheetDesktop: {
    paddingBottom: 16,
    paddingTop: 16,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d1d5db',
    marginBottom: 12,
  },
  title: { fontSize: 20, fontWeight: '400', color: colors.ink },
  titleDesktop: { fontSize: 16, fontWeight: '400', letterSpacing: -0.2 },
  sub: { color: colors.muted, fontWeight: '400', fontSize: 13, marginTop: 4, marginBottom: 12 },
  subDesktop: { fontWeight: '400', fontSize: 12, marginBottom: 8 },
  list: { flexGrow: 0 },
  listContent: { paddingBottom: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    minHeight: 56,
  },
  rowDesktop: {
    minHeight: 40,
    paddingVertical: 8,
    gap: 10,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapDesktop: {
    width: 28,
    height: 28,
    borderRadius: 6,
  },
  rowLabel: { fontWeight: '400', fontSize: 15, color: colors.ink },
  rowLabelDesk: { fontWeight: '500', fontSize: 14 },
  rowSub: { fontWeight: '400', fontSize: 12, color: colors.muted, marginTop: 2 },
  rowSubDesk: { fontWeight: '400' },
  cancel: {
    marginTop: 10,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.sunken,
  },
  cancelDesktop: {
    paddingVertical: 8,
  },
  cancelTxt: { fontWeight: '400', fontSize: 15, color: colors.ink },
  cancelTxtDesk: { fontWeight: '500', fontSize: 13 },
});
