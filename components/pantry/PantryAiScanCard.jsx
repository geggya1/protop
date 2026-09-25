/**
 * AI-lagerskanner — bilde/tekst → innholdsliste → bekreft og lagre i lageret.
 * Flyttet hit fra AI Matcoach (hørte hjemme under Lager).
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, Image,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { colors } from '../../src/theme';
import { Mute } from '../ui';
import { PANTRY_LOCATIONS } from '../../src/utils/familyPantry';
import { scanMatcoachFridge, applyFridgeItemsToPantry } from '../../src/utils/matcoach';

function alertMsg(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

async function pickedToBase64(picked) {
  if (!picked) return '';
  if (picked.base64) {
    const mime = picked.mimeType || 'image/jpeg';
    return `data:${mime};base64,${picked.base64}`;
  }
  let blob = picked.blob;
  if (!blob && picked.uri) {
    const res = await fetch(picked.uri);
    blob = await res.blob();
  }
  if (!blob) return '';
  if (typeof FileReader === 'undefined') return '';
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Kunne ikke lese bildet'));
    reader.readAsDataURL(blob);
  });
}

function locMeta(id) {
  return PANTRY_LOCATIONS.find((l) => l.id === id) || PANTRY_LOCATIONS[0];
}

export default function PantryAiScanCard({ familyId, uid, existingItems = [] }) {
  const [hint, setHint] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState(null);
  const [selected, setSelected] = useState([]);
  const [itemOverrides, setItemOverrides] = useState({});

  const resolvedItems = useMemo(() => {
    if (!scan?.items?.length) return [];
    return scan.items.map((item, idx) => {
      const key = `${item.name}-${idx}`;
      const over = itemOverrides[key] || {};
      return {
        key,
        name: over.name != null ? over.name : item.name,
        amountText: over.amountText != null ? over.amountText : (item.amountText || ''),
        location: over.location || item.location || 'fridge',
        category: item.category || 'general',
        confidence: item.confidence,
        originalName: item.name,
      };
    });
  }, [scan, itemOverrides]);

  const patchItem = useCallback((key, part) => {
    setItemOverrides((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...part } }));
  }, []);

  const toggleSelected = useCallback((originalName) => {
    setSelected((prev) => (
      prev.includes(originalName)
        ? prev.filter((n) => n !== originalName)
        : [...prev, originalName]
    ));
  }, []);

  const runScan = useCallback(async ({ imageBase64 = '', hintText = '' } = {}) => {
    if (!familyId) {
      alertMsg('Mangler familie', 'Velg en familie først.');
      return;
    }
    setBusy(true);
    try {
      const result = await scanMatcoachFridge(familyId, { imageBase64, hintText });
      setScan(result);
      setItemOverrides({});
      setSelected((result.items || []).map((i) => i.name));
    } catch (err) {
      alertMsg('Skanning feilet', err?.message || 'Prøv igjen eller skriv inn varer manuelt.');
    } finally {
      setBusy(false);
    }
  }, [familyId]);

  const pickImage = useCallback(async (fromCamera) => {
    try {
      const perm = fromCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        alertMsg('Trenger tilgang', 'Gi tilgang til kamera/bilder for å skanne lageret.');
        return;
      }
      const result = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.55, base64: true })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.55, base64: true });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPreview(asset.uri);
      const imageBase64 = await pickedToBase64(asset);
      if (!imageBase64) {
        alertMsg('Bildet feilet', 'Klarte ikke lese bildet. Prøv et annet bilde eller skriv varene.');
        return;
      }
      await runScan({ imageBase64, hintText: hint });
    } catch (err) {
      alertMsg('Skanning feilet', err?.message || 'Prøv igjen.');
    }
  }, [hint, runScan]);

  const onTextScan = useCallback(async () => {
    if (!hint.trim()) {
      alertMsg('Skriv inn varer', 'F.eks. «melk, egg, paprika, ost»');
      return;
    }
    setPreview(null);
    await runScan({ hintText: hint.trim() });
  }, [hint, runScan]);

  const onSave = useCallback(async () => {
    if (!familyId || !resolvedItems.length) return;
    const chosen = resolvedItems.filter((it) => selected.includes(it.originalName));
    if (!chosen.length) {
      alertMsg('Velg varer', 'Kryss av minst én vare før du lagrer.');
      return;
    }
    setBusy(true);
    try {
      const payload = chosen.map((it) => ({
        name: String(it.name || '').trim(),
        amountText: String(it.amountText || '').trim(),
        location: it.location || 'fridge',
        category: it.category || 'general',
      }));
      const result = await applyFridgeItemsToPantry(
        familyId,
        payload,
        uid,
        null,
        existingItems,
      );
      const parts = [];
      if (result.added) parts.push(`${result.added} nye`);
      if (result.merged) parts.push(`${result.merged} slått sammen`);
      alertMsg(
        'Lagret i lager',
        parts.length ? `${parts.join(', ')}.` : `${payload.length} varer lagret.`,
      );
      setScan(null);
      setSelected([]);
      setItemOverrides({});
      setPreview(null);
      setHint('');
    } catch (err) {
      alertMsg('Kunne ikke lagre', err?.message || 'Prøv igjen');
    } finally {
      setBusy(false);
    }
  }, [familyId, uid, resolvedItems, selected, existingItems]);

  const selectAll = useCallback(() => {
    setSelected(resolvedItems.map((i) => i.originalName));
  }, [resolvedItems]);

  const selectNone = useCallback(() => {
    setSelected([]);
  }, []);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.iconWrap}>
          <Ionicons name="scan-outline" size={20} color={colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>AI-lagerskanner</Text>
          <Mute>
            Ta bilde av kjøleskap, fryser eller skap — eller skriv hva du har. AI lager innholdslisten, du bekrefter før lagring.
          </Mute>
        </View>
      </View>

      {preview ? (
        <Image source={{ uri: preview }} style={styles.preview} accessibilityLabel="Skannet bilde" />
      ) : null}

      <TextInput
        style={styles.input}
        placeholder="Eller skriv varer: melk, egg, paprika…"
        placeholderTextColor={colors.placeholder}
        value={hint}
        onChangeText={setHint}
        editable={!busy}
      />

      <View style={styles.actionRow}>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => pickImage(true)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Skann med kamera"
        >
          <Ionicons name="camera" size={18} color={colors.brand} />
          <Text style={styles.secondaryBtnTxt}>Kamera</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => pickImage(false)}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Velg bilde fra bibliotek"
        >
          <Ionicons name="image" size={18} color={colors.brand} />
          <Text style={styles.secondaryBtnTxt}>Bibliotek</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={onTextScan}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Tolke varer fra tekst"
        >
          <Ionicons name="list" size={18} color={colors.brand} />
          <Text style={styles.secondaryBtnTxt}>Fra tekst</Text>
        </TouchableOpacity>
      </View>

      {busy ? <ActivityIndicator style={{ marginVertical: 14 }} color={colors.brand} /> : null}

      {scan && !busy ? (
        <View style={styles.result}>
          {scan.summary ? <Text style={styles.summary}>{scan.summary}</Text> : null}
          <View style={styles.resultHead}>
            <Mute>Bekreft varene — fjern det AI tok feil, og velg plassering.</Mute>
            <View style={styles.selectRow}>
              <TouchableOpacity onPress={selectAll} hitSlop={8}>
                <Text style={styles.selectLink}>Velg alle</Text>
              </TouchableOpacity>
              <Text style={styles.selectSep}>·</Text>
              <TouchableOpacity onPress={selectNone} hitSlop={8}>
                <Text style={styles.selectLink}>Ingen</Text>
              </TouchableOpacity>
            </View>
          </View>

          {resolvedItems.map((item) => {
            const on = selected.includes(item.originalName);
            const loc = locMeta(item.location);
            return (
              <View key={item.key} style={[styles.itemRow, !on && styles.itemOff]}>
                <TouchableOpacity
                  style={styles.checkHit}
                  onPress={() => toggleSelected(item.originalName)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <Ionicons
                    name={on ? 'checkbox' : 'square-outline'}
                    size={20}
                    color={colors.brand}
                  />
                </TouchableOpacity>
                <View style={{ flex: 1, gap: 6 }}>
                  <TextInput
                    style={styles.itemName}
                    value={item.name}
                    onChangeText={(name) => patchItem(item.key, { name })}
                    placeholder="Varenavn"
                    placeholderTextColor={colors.placeholder}
                  />
                  <TextInput
                    style={styles.itemAmount}
                    value={item.amountText}
                    onChangeText={(amountText) => patchItem(item.key, { amountText })}
                    placeholder="Mengde (valgfritt)"
                    placeholderTextColor={colors.placeholder}
                  />
                  <View style={styles.locRow}>
                    {PANTRY_LOCATIONS.map((l) => (
                      <TouchableOpacity
                        key={l.id}
                        style={[styles.locChip, item.location === l.id && styles.locChipOn]}
                        onPress={() => patchItem(item.key, { location: l.id })}
                      >
                        <Text style={[styles.locChipTxt, item.location === l.id && styles.locChipTxtOn]}>
                          {l.emoji}
                        </Text>
                      </TouchableOpacity>
                    ))}
                    <Text style={styles.locLabel} numberOfLines={1}>{loc.label}</Text>
                    {item.confidence != null ? (
                      <Text style={styles.conf}>{Math.round(item.confidence * 100)}%</Text>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}

          {(scan.mealIdeas || []).length ? (
            <View style={styles.ideas}>
              <Text style={styles.ideasTitle}>Middagstips fra lageret</Text>
              {scan.mealIdeas.map((m) => (
                <View key={m.title} style={styles.ideaCard}>
                  <Text style={styles.ideaTitle}>{m.emoji} {m.title}</Text>
                  {m.why ? <Text style={styles.ideaWhy}>{m.why}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, (!selected.length || busy) && { opacity: 0.5 }]}
            onPress={onSave}
            disabled={!selected.length || busy}
            accessibilityRole="button"
          >
            <Ionicons name="cube" size={18} color="#fff" />
            <Text style={styles.primaryBtnTxt}>
              Lagre {selected.length ? `(${selected.length})` : ''} i lager
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    gap: 10,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '400', color: colors.ink, marginBottom: 2 },
  preview: {
    width: '100%', height: 160, borderRadius: 12,
    backgroundColor: colors.brandSoft, marginTop: 4,
  },
  input: {
    backgroundColor: colors.bg || '#f8fafc',
    borderRadius: 10, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 12, paddingVertical: 11,
    fontSize: 15, color: colors.ink, fontWeight: '400',
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  secondaryBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10,
    backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: 'transparent',
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  result: { marginTop: 4, gap: 8 },
  summary: { fontSize: 14, fontWeight: '500', color: colors.ink, lineHeight: 20 },
  resultHead: { gap: 4 },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectLink: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  selectSep: { color: colors.muted },
  itemRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.bg || '#f8fafc',
    borderRadius: 12, padding: 10,
    borderWidth: 1, borderColor: colors.line,
  },
  itemOff: { opacity: 0.55 },
  checkHit: { paddingTop: 4 },
  itemName: {
    fontSize: 15, fontWeight: '500', color: colors.ink,
    paddingVertical: 2, paddingHorizontal: 0,
  },
  itemAmount: {
    fontSize: 13, fontWeight: '400', color: colors.muted,
    paddingVertical: 0, paddingHorizontal: 0,
  },
  locRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  locChip: {
    width: 28, height: 28, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  locChipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  locChipTxt: { fontSize: 13 },
  locChipTxtOn: {},
  locLabel: { fontSize: 12, color: colors.muted, marginLeft: 2, flexShrink: 1 },
  conf: { fontSize: 11, color: colors.muted, marginLeft: 'auto' },
  ideas: { marginTop: 4, gap: 6 },
  ideasTitle: { fontSize: 13, fontWeight: '400', color: colors.ink },
  ideaCard: {
    backgroundColor: colors.brandSoft, borderRadius: 10, padding: 10, gap: 2,
  },
  ideaTitle: { fontSize: 14, fontWeight: '400', color: colors.ink },
  ideaWhy: { fontSize: 12, color: colors.muted, lineHeight: 16 },
  primaryBtn: {
    alignSelf: 'flex-start',
    marginTop: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: colors.brand, borderRadius: 12,
    paddingVertical: 13, paddingHorizontal: 16,
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },
});
