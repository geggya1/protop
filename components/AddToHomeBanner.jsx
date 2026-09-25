import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  APP_INSTALL,
  dismissAddHome,
  shouldOfferAddToHome,
  wasAddHomeDismissed,
} from '../src/utils/addToHome';

/**
 * Smartplan-style top install strip: dark bar, app icon, Installer CTA.
 */
export default function AddToHomeBanner({ onOpenGuide }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      setVisible(false);
      return;
    }
    if (!shouldOfferAddToHome() || wasAddHomeDismissed()) {
      setVisible(false);
      return;
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    dismissAddHome();
    setVisible(false);
  };

  return (
    <View style={styles.wrap} accessibilityRole="summary">
      <TouchableOpacity
        onPress={dismiss}
        hitSlop={10}
        style={styles.closeBtn}
        accessibilityLabel="Lukk"
      >
        <Ionicons name="close" size={18} color="#cbd5e1" />
      </TouchableOpacity>

      <Image
        source={{ uri: APP_INSTALL.iconSrc }}
        style={styles.icon}
        accessibilityIgnoresInvertColors
      />

      <Text style={styles.txt} numberOfLines={2}>
        Få rask tilgang til appen vår — installer den nå på enheten din.
      </Text>

      <TouchableOpacity
        onPress={() => onOpenGuide?.()}
        style={styles.btn}
        accessibilityRole="button"
        accessibilityLabel="Installer"
      >
        <Text style={styles.btnTxt}>Installer</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 0,
    marginBottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#0f172a',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1e293b',
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  txt: {
    flex: 1,
    fontSize: 12,
    fontWeight: '400',
    color: '#f8fafc',
    lineHeight: 16,
  },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: '#020617',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  btnTxt: {
    color: '#fff',
    fontWeight: '400',
    fontSize: 13,
  },
});
