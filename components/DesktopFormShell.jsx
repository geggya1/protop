import React from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Pressable, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import { useLayout } from '../src/theme';

/**
 * Desktop: sentrert popup over dimmet bakgrunn (ikke full side).
 * Mobil/nettbrett: returnerer null — kallstedet beholder vanlig Screen-layout.
 */
export default function DesktopFormShell({
  visible = true,
  title,
  onClose,
  children,
  footer = null,
  width = 520,
}) {
  const { isDesktop } = useLayout();
  if (!isDesktop || !visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Lukk"
      />
      <View
        style={[styles.card, { maxWidth: width }]}
        accessibilityRole="dialog"
        accessibilityLabel={title}
      >
        <View style={styles.head}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={10}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Lukk"
          >
            <Ionicons name="close" size={18} color={colors.muted} />
          </TouchableOpacity>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollInner}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    zIndex: 50,
    ...Platform.select({
      web: { position: 'fixed', inset: 0 },
      default: {},
    }),
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
  },
  card: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 24px 64px rgba(15, 23, 42, 0.22)' },
      default: {
        elevation: 12,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 20,
        shadowOffset: { width: 0, height: 8 },
      },
    }),
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: colors.ink,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.sunken,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollInner: { padding: 16, paddingBottom: 20 },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: '#fafbfc',
  },
});
