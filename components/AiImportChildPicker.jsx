import React from 'react';
import {
  View, Text, TouchableOpacity, Modal, Pressable, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import { AvatarBubble } from './AvatarPicker';

export default function AiImportChildPicker({
  visible,
  kids,
  onSelect,
  onClose,
  title = 'Hvilket barn gjelder ukeplanen?',
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          {kids.map((kid) => (
            <TouchableOpacity
              key={kid.id || kid.childId}
              style={styles.row}
              onPress={() => onSelect(kid)}
            >
              <AvatarBubble
                avatarId={kid.avatarId}
                photoURL={kid.photoURL || kid.photoUrl}
                name={kid.name}
                size={36}
              />
              <Text style={styles.name}>{kid.name}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
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
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24,
  },
  card: {
    backgroundColor: colors.card, borderRadius: 16, padding: 20, gap: 8,
  },
  title: { fontWeight: '400', fontSize: 17, color: colors.ink, marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  name: { flex: 1, fontWeight: '400', fontSize: 16, color: colors.ink },
  cancel: { alignItems: 'center', paddingTop: 12 },
  cancelTxt: { color: colors.muted, fontWeight: '400' },
});
