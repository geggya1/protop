import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import SafeImage from './SafeImage';

export default function RewardImageField({
  imageUrl,
  busy = false,
  onPick,
  onClear,
  label = 'Legg til bilde',
}) {
  return (
    <View>
      {imageUrl ? (
        <View>
          <SafeImage pathOrUrl={imageUrl} style={styles.preview} resizeMode="cover" />
          <View style={styles.row}>
            <TouchableOpacity
              style={styles.btn}
              onPress={onPick}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Bytt bilde"
            >
              {busy
                ? <ActivityIndicator color={colors.brand} />
                : <Text style={styles.btnTxt}>Bytt bilde</Text>}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btn}
              onPress={onClear}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Fjern bilde"
            >
              <Text style={[styles.btnTxt, styles.danger]}>Fjern</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.pick}
          onPress={onPick}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          {busy
            ? <ActivityIndicator color={colors.brand} />
            : (
              <>
                <Ionicons name="image-outline" size={22} color={colors.brand} />
                <Text style={styles.pickTxt}>{label}</Text>
              </>
            )}
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: colors.line,
  },
  btnTxt: { fontWeight: '800', color: colors.brand, fontSize: 13 },
  danger: { color: '#b91c1c' },
  pick: {
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    borderStyle: 'dashed',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
  },
  pickTxt: { fontWeight: '800', color: colors.brand, fontSize: 14 },
});
