/**
 * Familielager — oversikt over kjøl / fryser / tørrvare, registrering i popup.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Alert,
  Modal, Pressable, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { dateKey, addDays } from '../../src/utils/dates';
import { toIsoDate } from '../../src/utils/age';
import { Screen, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer, ModuleHubIntro } from '../../components/ModulePageBg';
import ShellAddButton from '../../components/ShellAddButton';
import HelpTarget from '../../components/HelpTarget';

import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import { useModuleAsideSlot } from '../../src/hooks/useModuleAsideSlot';
import BirthdayPicker from '../../components/BirthdayPicker';
import {
  listenPantry, upsertPantryItem, deletePantryItem, PANTRY_LOCATIONS,
  pantryExpiryStatus,
} from '../../src/utils/familyPantry';
import { normalizeBarcode, isValidBarcode } from '../../src/utils/barcode';
import { lookupProduct } from '../../src/utils/productLookup';
import BarcodeScannerModal from '../../components/BarcodeScannerModal';
import ProductScanResultModal from '../../components/ProductScanResultModal';
import PantryAiScanCard from '../../components/pantry/PantryAiScanCard';

function emptyForm() {
  return { title: '', amount: '', expiry: '', location: 'pantry', barcode: null };
}

function PantryTipsCard() {
  return (
    <View style={styles.asideCard}>
      <Text style={styles.asideKicker}>Slik bruker dere lageret</Text>
      <Text style={styles.asideLead}>
        Registrer det som står hjemme. Når et måltid sendes til handlelisten, trekkes det dere allerede har fra.
      </Text>
      {[
        'Ta bilde — AI lager innholdslisten, du bekrefter.',
        'Like varer slås sammen — du slipper duplikater.',
        'Skann strekkode for å legge inn én og én vare.',
        'Best før vises i oversikten, så dere bruker det som er i ferd med å gå ut.',
      ].map((tip) => (
        <View key={tip} style={styles.asideTip}>
          <View style={styles.asideDot} />
          <Text style={styles.asideTipTxt}>{tip}</Text>
        </View>
      ))}
    </View>
  );
}

function DateField({ value, onChange }) {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.dateBtn}>
        <Ionicons name="calendar-outline" size={16} color={value ? colors.brand : colors.muted} />
        <Text style={[styles.dateBtnTxt, !value && styles.datePlaceholder]}>
          {value || 'Best før (valgfritt)'}
        </Text>
        {value ? (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={8} accessibilityLabel="Fjern dato">
            <Ionicons name="close-circle" size={16} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
        <input
          type="date"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || '')}
          style={styles.webDateOverlay}
          aria-label="Best før"
        />
      </View>
    );
  }
  const max = toIsoDate(addDays(new Date(), 365 * 3));
  const min = toIsoDate(addDays(new Date(), -30));
  return (
    <BirthdayPicker
      value={value || ''}
      onChange={(iso) => onChange(iso || '')}
      showAge={false}
      allowClear
      minValue={min}
      maxValue={max}
      emptyLabel="Best før (valgfritt)"
    />
  );
}

export default function PantryHubScreen({ inShell = false }) {
  const { familyId, uid, isParent, shellIntent, clearShellIntent } = useApp();
  const { isDesktop } = useLayout();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanResumeKey, setScanResumeKey] = useState(0);
  const [scanResultOpen, setScanResultOpen] = useState(false);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scannedProduct, setScannedProduct] = useState(null);
  const todayKey = dateKey(new Date());

  useEffect(() => {
    if (!familyId) return undefined;
    return listenPantry(familyId, setItems);
  }, [familyId]);

  const grouped = useMemo(() => {
    const map = {};
    PANTRY_LOCATIONS.forEach((l) => { map[l.id] = []; });
    items.forEach((i) => {
      const key = map[i.location] ? i.location : 'other';
      map[key].push(i);
    });
    return map;
  }, [items]);

  const expiring = useMemo(
    () => items
      .map((i) => ({ item: i, status: pantryExpiryStatus(i.expiryKey, todayKey) }))
      .filter((x) => x.status && (x.status.kind === 'expired' || x.status.kind === 'soon' || x.status.kind === 'today'))
      .sort((a, b) => String(a.item.expiryKey).localeCompare(String(b.item.expiryKey))),
    [items, todayKey],
  );

  const openForm = useCallback((preset = null) => {
    setForm({
      ...emptyForm(),
      ...(preset || {}),
    });
    setFormOpen(true);
  }, []);

  const closeForm = useCallback(() => {
    if (saving) return;
    setFormOpen(false);
    setForm(emptyForm());
  }, [saving]);

  useEffect(() => {
    if (shellIntent !== 'create') return;
    clearShellIntent?.();
    openForm();
  }, [shellIntent, clearShellIntent, openForm]);

  const addBtn = useMemo(
    () => (isParent ? (
      <HelpTarget id="add" onAdvance={() => openForm()}>
        <ShellAddButton label="Registrer vare" onPress={() => openForm()} />
      </HelpTarget>
    ) : null),
    [isParent, openForm],
  );
  useShellTitleRight(addBtn, { active: isParent && !formOpen });

  useHelpScene(formOpen ? 'inner' : 'hub', {
    onRetreat: closeForm,
  });

  const aside = useMemo(() => <PantryTipsCard />, []);
  useModuleAsideSlot(aside, { active: isDesktop && inShell && isParent });

  const patch = (part) => setForm((s) => ({ ...s, ...part }));

  const save = useCallback(async () => {
    if (!familyId || !form.title.trim() || saving) return;
    const expiryKey = /^\d{4}-\d{2}-\d{2}$/.test(form.expiry.trim()) ? form.expiry.trim() : null;
    setSaving(true);
    try {
      const result = await upsertPantryItem(familyId, {
        name: form.title.trim(),
        amountText: form.amount.trim(),
        location: form.location,
        expiryKey,
        barcode: form.barcode || null,
      }, uid, items);
      setFormOpen(false);
      setForm(emptyForm());
      if (result.merged) {
        Alert.alert('Oppdatert', 'Varen fantes allerede — mengden er slått sammen.');
      }
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre.');
    } finally {
      setSaving(false);
    }
  }, [familyId, form, uid, saving, items]);

  const normalizeScan = useCallback((raw) => {
    const normalized = normalizeBarcode(raw);
    return isValidBarcode(normalized) ? normalized : null;
  }, []);

  const handleBarcodeScanned = useCallback(async (code) => {
    // Keep scanner warm — avoid the "Åpne kamera" gate between items.
    setScanResultOpen(true);
    setScanLoading(true);
    setScanError(null);
    setScannedProduct(null);
    try {
      const product = await lookupProduct(code);
      setScannedProduct(product);
    } catch (e) {
      setScanError(e?.message || 'Klarte ikke slå opp varen.');
    } finally {
      setScanLoading(false);
    }
  }, []);

  const resumeScanner = useCallback(() => {
    setScanResultOpen(false);
    setScanError(null);
    setScannedProduct(null);
    setScanResumeKey((k) => k + 1);
    setScannerOpen(true);
  }, []);

  const applyScanned = useCallback(() => {
    if (!scannedProduct) return;
    setForm((s) => ({
      ...s,
      title: scannedProduct.title || s.title,
      amount: scannedProduct.quantity || s.amount,
      barcode: scannedProduct.barcode || null,
    }));
    setScanResultOpen(false);
    setScannedProduct(null);
    setScannerOpen(false);
    setFormOpen(true);
  }, [scannedProduct]);

  if (!isParent) {
    return (
      <Screen>
        <View style={styles.body}><Mute>Lager er for foresatte.</Mute></View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ModulePageFrame name="pantry">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        <ModuleHubIntro>
        {!inShell ? <Text style={styles.title}>Lager</Text> : null}
        <Mute>
          Oversikt over det dere har hjemme — kjøleskap, fryser og tørrvare.
          Skann med AI eller registrer manuelt. Trekkes fra når et måltid sendes til handlelisten.
        </Mute>
        </ModuleHubIntro>

        <HelpTarget id="content" style={{ width: '100%' }}>
        <PantryAiScanCard familyId={familyId} uid={uid} existingItems={items} />

        <View style={styles.overview}>
          {PANTRY_LOCATIONS.map((loc) => {
            const count = (grouped[loc.id] || []).length;
            return (
              <View key={loc.id} style={styles.statCard}>
                <Text style={styles.statEmoji}>{loc.emoji}</Text>
                <Text style={styles.statCount}>{count}</Text>
                <Text style={styles.statLabel} numberOfLines={1}>{loc.label}</Text>
              </View>
            );
          })}
        </View>
        </HelpTarget>

        {expiring.length > 0 ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>Holdbarhet</Text>
            {expiring.slice(0, 5).map(({ item, status }) => (
              <Text
                key={item.id}
                style={[styles.warnRow, status.kind === 'expired' && styles.warnExpired]}
              >
                {item.name} · {status.label}
              </Text>
            ))}
          </View>
        ) : null}

        {!items.length ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ingen varer i lageret ennå</Text>
            <Text style={styles.emptySub}>
              Ta bilde med AI-skanneren over, eller registrer manuelt. Når dere planlegger middag, trekkes det dere allerede har fra handlelisten.
            </Text>
          </View>
        ) : (
          PANTRY_LOCATIONS.map((loc) => {
            const list = grouped[loc.id] || [];
            if (!list.length) return null;
            return (
              <View key={loc.id} style={styles.section}>
                <Text style={styles.sectionTitle}>{loc.emoji} {loc.label}</Text>
                {list.map((item) => {
                  const status = pantryExpiryStatus(item.expiryKey, todayKey);
                  return (
                    <View key={item.id} style={styles.row}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{item.name}</Text>
                        <Text style={styles.rowMeta}>
                          {[item.amountText, status?.label, item.barcode ? `EAN ${item.barcode}` : null]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => deletePantryItem(familyId, item.id)}
                        hitSlop={8}
                        accessibilityLabel={`Slett ${item.name}`}
                      >
                        <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            );
          })
        )}

        {!isDesktop && items.length > 0 ? (
          <TouchableOpacity style={styles.fabLike} onPress={() => openForm()}>
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.fabTxt}>Registrer vare</Text>
          </TouchableOpacity>
        ) : null}

        <View style={{ height: 40 }} />
      <ModuleBgSpacer />
      </ScrollView>
      </ModulePageFrame>
      <Modal
        visible={formOpen}
        transparent
        animationType={isDesktop ? 'fade' : 'slide'}
        onRequestClose={closeForm}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={closeForm}
        >
          <Pressable
            style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
            onPress={(e) => e.stopPropagation?.()}
          >
            {!isDesktop ? <View style={styles.sheetHandle} /> : null}
            <View style={styles.modalHead}>
              <Text style={styles.modalTitle}>Registrer vare</Text>
              <TouchableOpacity onPress={closeForm} hitSlop={10} accessibilityLabel="Lukk">
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.fieldLabel}>Vare</Text>
              <TextInput
                style={styles.input}
                value={form.title}
                onChangeText={(title) => patch({ title })}
                placeholder="F.eks. melk"
                placeholderTextColor={colors.placeholder}
                autoFocus={isDesktop}
              />

              <Text style={styles.fieldLabel}>Mengde</Text>
              <TextInput
                style={styles.input}
                value={form.amount}
                onChangeText={(amount) => patch({ amount })}
                placeholder="F.eks. 2 L"
                placeholderTextColor={colors.placeholder}
              />

              <Text style={styles.fieldLabel}>Best før</Text>
              <DateField
                value={form.expiry}
                onChange={(expiry) => patch({ expiry })}
              />

              <Text style={styles.fieldLabel}>Hvor står den</Text>
              <View style={styles.chipRow}>
                {PANTRY_LOCATIONS.map((l) => (
                  <TouchableOpacity
                    key={l.id}
                    style={[styles.chip, form.location === l.id && styles.chipOn]}
                    onPress={() => patch({ location: l.id })}
                  >
                    <Text style={[styles.chipTxt, form.location === l.id && styles.chipTxtOn]}>
                      {l.emoji} {l.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={styles.scanLink}
                onPress={() => setScannerOpen(true)}
                accessibilityRole="button"
              >
                <Ionicons name="barcode-outline" size={18} color={colors.brand} />
                <Text style={styles.scanLinkTxt}>Skann strekkode</Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.secondaryBtn} onPress={closeForm} disabled={saving}>
                  <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primaryBtn, (!form.title.trim() || saving) && { opacity: 0.5 }]}
                  onPress={save}
                  disabled={!form.title.trim() || saving}
                >
                  <Text style={styles.primaryBtnTxt}>{saving ? 'Lagrer…' : 'Registrer'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onScan={handleBarcodeScanned}
        title="Skann til lager"
        hint="Hold strekkoden i rammen"
        permissionText="Vi trenger kamera for å skanne varer."
        normalize={normalizeScan}
        resumeKey={scanResumeKey}
      />
      <ProductScanResultModal
        visible={scanResultOpen}
        loading={scanLoading}
        error={scanError}
        product={scannedProduct}
        onClose={() => {
          setScanResultOpen(false);
          setScannedProduct(null);
          setScannerOpen(false);
        }}
        onAdd={applyScanned}
        addLabel="Bruk i skjema"
        saving={false}
        onScanAgain={resumeScanner}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  body: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 20, fontWeight: '500', color: colors.ink, marginBottom: 4 },
  overview: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 16,
  },
  statCard: {
    flexGrow: 1,
    flexBasis: 72,
    minWidth: 72,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 2,
  },
  statEmoji: { fontSize: 18 },
  statCount: { fontSize: 20, fontWeight: '500', color: colors.ink },
  statLabel: { fontSize: 11, fontWeight: '400', color: colors.muted },
  warnCard: {
    marginTop: 12, backgroundColor: '#fff7ed', borderRadius: 12, padding: 12,
    borderWidth: 1, borderColor: '#fed7aa', gap: 4,
  },
  warnTitle: { fontWeight: '500', color: '#9a3412', marginBottom: 2, fontSize: 13 },
  warnRow: { color: '#9a3412', fontWeight: '400', fontSize: 13 },
  warnExpired: { color: '#b91c1c' },
  empty: {
    marginTop: 28, alignItems: 'center', paddingHorizontal: 12, gap: 8,
  },
  emptyTitle: { fontWeight: '500', fontSize: 17, color: colors.ink, textAlign: 'center' },
  emptySub: {
    color: colors.muted, fontWeight: '400', fontSize: 14, lineHeight: 20,
    textAlign: 'center', maxWidth: 360,
  },
  section: { marginTop: 18 },
  sectionTitle: { fontWeight: '500', color: colors.ink, marginBottom: 8, fontSize: 14 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: colors.line,
  },
  rowTitle: { fontWeight: '500', color: colors.ink, fontSize: 15 },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 2, fontWeight: '400' },
  fabLike: {
    marginTop: 20, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.brand, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 12,
  },
  fabTxt: { color: '#fff', fontWeight: '500' },
  asideCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  asideKicker: {
    fontSize: 11, fontWeight: '400', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.4,
  },
  asideLead: { fontSize: 13, fontWeight: '400', color: colors.muted, lineHeight: 18 },
  asideTip: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  asideDot: {
    width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand, marginTop: 6,
  },
  asideTipTxt: { flex: 1, fontSize: 13, fontWeight: '400', color: colors.ink, lineHeight: 18 },
  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, paddingBottom: 28, maxHeight: '92%',
  },
  modalSheetDesk: {
    alignSelf: 'center', marginBottom: 0, maxWidth: 440, width: '100%',
    borderRadius: 12, padding: 18, maxHeight: '85%',
  },
  sheetHandle: {
    alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
    backgroundColor: colors.line, marginBottom: 12,
  },
  modalHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
  },
  modalTitle: { fontSize: 17, fontWeight: '500', color: colors.ink },
  fieldLabel: {
    marginTop: 12, marginBottom: 6, color: colors.muted, fontWeight: '500',
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  input: {
    backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, color: colors.ink, fontWeight: '400',
  },
  dateBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 12, minHeight: 46, position: 'relative', overflow: 'hidden',
  },
  dateBtnTxt: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '400' },
  datePlaceholder: { color: colors.placeholder },
  webDateOverlay: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0,
    opacity: 0, border: 'none', backgroundColor: 'transparent', cursor: 'pointer',
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  chipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  chipTxt: { fontWeight: '400', color: colors.muted, fontSize: 13 },
  chipTxtOn: { color: colors.brand, fontWeight: '500' },
  scanLink: {
    marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start',
  },
  scanLinkTxt: { color: colors.brand, fontWeight: '500', fontSize: 14 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primaryBtn: {
    flex: 1, backgroundColor: colors.brand, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '500' },
  secondaryBtn: {
    flex: 1, backgroundColor: colors.brandSoft, borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '500' },
});
