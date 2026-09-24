import React from 'react';
import { Modal, View, StyleSheet } from 'react-native';

/**
 * During a help tour the overlay is already a Modal. Nested RN Modals hide the
 * tour card, so the same sheet is rendered as a View in the screen tree.
 */
export default function OverlayHost({
  inline, visible, onRequestClose, children, animationType = 'fade',
}) {
  if (inline) {
    if (!visible) return null;
    return (
      <View style={[StyleSheet.absoluteFill, styles.inline]} pointerEvents="box-none">
        {children}
      </View>
    );
  }
  return (
    <Modal
      visible={visible}
      animationType={animationType}
      transparent
      onRequestClose={onRequestClose}
    >
      {children}
    </Modal>
  );
}

const styles = StyleSheet.create({
  inline: { zIndex: 40 },
});
