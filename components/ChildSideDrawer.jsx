import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, Pressable, Animated, ScrollView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../src/theme';
import { AvatarBubble } from './AvatarPicker';

export const DRAWER_WIDTH = 232;
const NATIVE_DRIVER = Platform.OS !== 'web';

export function DrawerRow({ icon, label, onPress, active }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.row, active && styles.rowActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <View style={[styles.iconCircle, active && styles.iconCircleActive]}>
        <Ionicons name={icon} size={18} color={active ? '#fff' : colors.brand} />
      </View>
      <Text style={[styles.label, active && styles.labelActive]} numberOfLines={1}>{label}</Text>
      {active && <View style={styles.activeDot} />}
    </TouchableOpacity>
  );
}

/** Kompakt venstre skuff — glir inn fra kanten uten å dekke hele skjermen. */
export default function ChildSideDrawer({
  visible,
  onClose,
  onSelect,
  items,
  activeId,
  childName,
  familyName,
  childAvatar,
  bottomInset = 72,
}) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(-DRAWER_WIDTH - 16)).current;
  const fade = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(false);

  const panelTop = insets.top + 10;
  const panelBottom = bottomInset + 10;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(slide, { toValue: 0, useNativeDriver: NATIVE_DRIVER, speed: 18, bounciness: 4 }),
        Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: NATIVE_DRIVER }),
      ]).start();
      return;
    }
    if (!mounted) return undefined;
    Animated.parallel([
      Animated.timing(slide, { toValue: -(DRAWER_WIDTH + 16), duration: 180, useNativeDriver: NATIVE_DRIVER }),
      Animated.timing(fade, { toValue: 0, duration: 160, useNativeDriver: NATIVE_DRIVER }),
    ]).start(({ finished }) => {
      if (finished) setMounted(false);
    });
    return undefined;
  }, [visible, mounted, slide, fade]);

  if (!mounted) return null;

  return (
    <Modal transparent visible={mounted} animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Lukk meny">
          <Animated.View style={[styles.backdrop, { opacity: fade }]} />
        </Pressable>
        <Animated.View
          style={[
            styles.drawer,
            {
              top: panelTop,
              bottom: panelBottom,
              transform: [{ translateX: slide }],
            },
          ]}
        >
          <View style={styles.profile}>
            <AvatarBubble
              avatarId={childAvatar?.avatarId}
              photoURL={childAvatar?.photoURL || childAvatar?.photoUrl}
              name={childName || 'Barn'}
              size={40}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.profileName} numberOfLines={1}>{childName || 'Barn'}</Text>
              <Text style={styles.profileFam} numberOfLines={1}>{familyName || 'ProTop'}</Text>
            </View>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            {items.map((item) => (
              <DrawerRow
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeId === item.id}
                onPress={() => onSelect(item.id)}
              />
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15, 23, 42, 0.22)' },
  drawer: {
    position: 'absolute',
    left: 0,
    width: DRAWER_WIDTH,
    backgroundColor: colors.card,
    paddingTop: 12,
    paddingHorizontal: 10,
    paddingBottom: 10,
    borderTopRightRadius: 18,
    borderBottomRightRadius: 18,
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: colors.line,
    shadowColor: '#0f172a',
    shadowOpacity: 0.12,
    shadowRadius: 20,
    shadowOffset: { width: 6, height: 0 },
    elevation: 10,
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
    paddingBottom: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  profileName: { fontSize: 15, fontWeight: '900', color: colors.ink },
  profileFam: { color: colors.muted, fontWeight: '600', marginTop: 1, fontSize: 12 },
  list: { flex: 1 },
  listContent: { gap: 2, paddingBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minHeight: 40,
  },
  rowActive: { backgroundColor: colors.brandSoft },
  iconCircle: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#eef6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircleActive: { backgroundColor: colors.brand },
  label: { flex: 1, fontWeight: '700', fontSize: 14, color: colors.ink },
  labelActive: { color: colors.brand, fontWeight: '800' },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.brand,
  },
});
