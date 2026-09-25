import React from 'react';
import {
  View, Text, Modal, StyleSheet, TouchableOpacity, Image, ActivityIndicator,
} from 'react-native';
import { colors, radius } from '../src/theme';

export default function ProductScanResultModal({
  visible,
  loading,
  error,
  product,
  onClose,
  onAdd,
  onScanAgain,
  saving,
  addLabel = 'Legg til i listen',
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.brand} size="large" />
              <Text style={styles.loadingTxt}>Slår opp vare…</Text>
            </View>
          ) : error ? (
            <View style={styles.center}>
              <Text style={styles.errorTitle}>Fant ikke varen</Text>
              <Text style={styles.errorBody}>{error}</Text>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={onScanAgain}>
                  <Text style={styles.secondaryBtnTxt}>Skann igjen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={onClose}>
                  <Text style={styles.primaryBtnTxt}>Lukk</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : product ? (
            <>
              <View style={styles.hero}>
                {product.imageUrl ? (
                  <Image source={{ uri: product.imageUrl }} style={styles.image} />
                ) : (
                  <View style={[styles.image, styles.imagePh]}>
                    <Text style={{ fontSize: 36 }}>🛒</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{product.title}</Text>
                  {!!product.brand && <Text style={styles.brand}>{product.brand}</Text>}
                  {!!product.quantity && <Text style={styles.meta}>{product.quantity}</Text>}
                  {product.kcal100g != null && (
                    <Text style={styles.meta}>{Math.round(product.kcal100g)} kcal / 100 g</Text>
                  )}
                  <Text style={styles.barcode}>EAN {product.barcode}</Text>
                </View>
              </View>

              {product.notFound ? (
                <Text style={styles.notFoundHint}>
                  Fant ikke varen i produktbasen. Du kan likevel legge den til og endre navnet etterpå.
                </Text>
              ) : null}

              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={onScanAgain}>
                  <Text style={styles.secondaryBtnTxt}>Skann neste</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
                  onPress={onAdd}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnTxt}>{addLabel}</Text>
                  )}
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.cancelLink} onPress={onClose}>
                <Text style={styles.cancelLinkTxt}>Avbryt</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.center}>
              <Text style={styles.errorTitle}>Ingen vare</Text>
              <Text style={styles.errorBody}>Prøv å skanne på nytt, eller lukk og skriv inn manuelt.</Text>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={onScanAgain}>
                  <Text style={styles.secondaryBtnTxt}>Skann igjen</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryBtn} onPress={onClose}>
                  <Text style={styles.primaryBtnTxt}>Lukk</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 28,
    maxHeight: '85%',
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line, alignSelf: 'center', marginBottom: 16,
  },
  center: { alignItems: 'center', paddingVertical: 24, gap: 12 },
  loadingTxt: { color: colors.muted, fontWeight: '400' },
  errorTitle: { fontWeight: '400', fontSize: 18, color: colors.ink },
  errorBody: { color: colors.muted, textAlign: 'center', lineHeight: 22, fontWeight: '400' },
  hero: { flexDirection: 'row', gap: 14, marginBottom: 20 },
  image: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: '#f1f5f9' },
  imagePh: { alignItems: 'center', justifyContent: 'center' },
  title: { fontWeight: '400', fontSize: 17, color: colors.ink },
  brand: { color: colors.muted, fontWeight: '400', marginTop: 4 },
  meta: { color: colors.muted, fontWeight: '400', fontSize: 12, marginTop: 4 },
  barcode: { color: colors.brand, fontWeight: '400', fontSize: 11, marginTop: 8 },
  notFoundHint: {
    color: colors.muted,
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  actions: { flexDirection: 'row', gap: 10 },
  primaryBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },
  secondaryBtn: {
    flex: 1, backgroundColor: '#eef6ff', borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#93c5fd',
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '400', fontSize: 15 },
  cancelLink: { alignItems: 'center', marginTop: 12, padding: 8 },
  cancelLinkTxt: { color: colors.muted, fontWeight: '400' },
});
