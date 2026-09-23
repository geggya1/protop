import React from 'react';
import {
  Modal, Pressable, ScrollView, View, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, useLayout } from '../src/theme';
import { desktopOverlay, desktopFormSheet } from '../src/desktop';
import FriendQrScreen from '../screens/v2/FriendQrScreen';

/** Min QR som popup — samme mønster som AddFriendModal. */
export default function FriendQrModal({ visible, onClose }) {
  const { isDesktop, isTablet } = useLayout();
  const centered = isDesktop || isTablet;

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType={centered ? 'fade' : 'slide'}
      onRequestClose={onClose}
    >
      <Pressable
        style={[styles.backdrop, centered && desktopOverlay]}
        onPress={onClose}
      >
        <Pressable
          style={[
            styles.sheet,
            centered && [styles.sheetCentered, desktopFormSheet],
          ]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <View style={styles.head}>
            <View style={{ flex: 1 }} />
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
            showsVerticalScrollIndicator={false}
          >
            {visible ? (
              <FriendQrScreen asModal onClose={onClose} />
            ) : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.42)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
    maxHeight: '88%',
  },
  sheetCentered: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 16,
    maxWidth: 420,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { flexGrow: 0 },
  scrollInner: { paddingBottom: 8 },
});
