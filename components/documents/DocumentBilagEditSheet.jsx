import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView,
  Platform, ActivityIndicator, Image, KeyboardAvoidingView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { useLayout } from '../../src/theme';
import ConfirmDialog from '../ConfirmDialog';
import { emptyBilag, formatBilagAmount } from '../../src/utils/documentBilag';

function numToStr(v) {
  if (v == null || v === '') return '';
  return String(v);
}

function parseNum(v) {
  const s = String(v || '').trim().replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Rediger regnskapsbilag fra OCR / manuell føring.
 */
export default function DocumentBilagEditSheet({
  visible,
  file,
  canEdit,
  busy = false,
  onClose,
  onSave,
  onDelete,
  onOpenImage,
  onRerunOcr,
}) {
  const { isDesktop } = useLayout();
  const [form, setForm] = useState(() => emptyBilag());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!visible || !file) return;
    setConfirmDelete(false);
    setForm(emptyBilag({
      ...(file.bilag || {}),
      ocrStatus: file.bilag?.ocrStatus || 'edited',
    }));
  }, [visible, file]);

  if (!file || (!visible && !confirmDelete)) return null;

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const save = async () => {
    if (!canEdit || saving || deleting) return;
    setSaving(true);
    try {
      const bilag = {
        ...form,
        amount: parseNum(form.amount),
        vatAmount: parseNum(form.vatAmount),
        vatPercent: parseNum(form.vatPercent),
        lineItems: Array.isArray(form.lineItems) ? form.lineItems : [],
        ocrStatus: form.ocrStatus === 'pending' ? 'edited' : (form.ocrStatus || 'edited'),
      };
      const name = bilag.supplier
        ? `${bilag.supplier}${bilag.date ? ` ${bilag.date}` : ''}${bilag.amount != null ? ` ${formatBilagAmount(bilag.amount, bilag.currency)}` : ''}`
        : file.name;
      await onSave?.({ bilag, name: name.slice(0, 120), kind: 'receipt' });
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!canEdit || deleting) return;
    setConfirmDelete(false);
    setDeleting(true);
    try {
      await onDelete?.();
      onClose?.();
    } finally {
      setDeleting(false);
    }
  };

  const canDelete = canEdit && typeof onDelete === 'function';
  const actionBusy = saving || busy || deleting;

  const ocrLabel = form.ocrStatus === 'done'
    ? 'AI-tolket — sjekk og lagre'
    : form.ocrStatus === 'failed'
      ? 'OCR feilet — fyll inn manuelt'
      : form.ocrStatus === 'pending'
        ? 'Tolker kvittering…'
        : 'Rediger bilag';

  return (
    <>
      <Modal visible={!!visible && !confirmDelete} transparent animationType="slide" onRequestClose={onClose}>
        <KeyboardAvoidingView
          style={[styles.backdrop, isDesktop && desktopOverlay]}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={[styles.sheet, isDesktop && [desktopSheet, styles.sheetDesk]]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {form.supplier || file.name || 'Regnskapsbilag'}
                </Text>
                <Text style={styles.sub}>{ocrLabel}</Text>
              </View>
              {canDelete ? (
                <TouchableOpacity
                  onPress={() => setConfirmDelete(true)}
                  hitSlop={10}
                  disabled={actionBusy}
                  accessibilityRole="button"
                  accessibilityLabel="Slett fil"
                >
                  <Ionicons name="trash-outline" size={22} color={colors.danger} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Lukk">
                <Ionicons name="close" size={24} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {file.downloadUrl ? (
                <TouchableOpacity
                  style={styles.preview}
                  onPress={() => onOpenImage?.(file)}
                  accessibilityRole="button"
                  accessibilityLabel="Vis kvitteringsbilde"
                >
                  <Image source={{ uri: file.downloadUrl }} style={styles.previewImg} resizeMode="cover" />
                  <View style={styles.previewHint}>
                    <Ionicons name="expand-outline" size={14} color="#fff" />
                    <Text style={styles.previewHintTxt}>Vis original</Text>
                  </View>
                </TouchableOpacity>
              ) : null}

              <Field label="Leverandør" value={form.supplier} onChangeText={(v) => setField('supplier', v)} editable={canEdit} />
              <View style={styles.row2}>
                <Field
                  label="Dato"
                  value={form.date}
                  onChangeText={(v) => setField('date', v)}
                  editable={canEdit}
                  placeholder="ÅÅÅÅ-MM-DD"
                  style={{ flex: 1 }}
                />
                <Field
                  label="Beløp"
                  value={numToStr(form.amount)}
                  onChangeText={(v) => setField('amount', v)}
                  editable={canEdit}
                  keyboardType="decimal-pad"
                  style={{ flex: 1 }}
                />
              </View>
              <View style={styles.row2}>
                <Field
                  label="MVA"
                  value={numToStr(form.vatAmount)}
                  onChangeText={(v) => setField('vatAmount', v)}
                  editable={canEdit}
                  keyboardType="decimal-pad"
                  style={{ flex: 1 }}
                />
                <Field
                  label="MVA %"
                  value={numToStr(form.vatPercent)}
                  onChangeText={(v) => setField('vatPercent', v)}
                  editable={canEdit}
                  keyboardType="decimal-pad"
                  style={{ flex: 1 }}
                />
              </View>
              <View style={styles.row2}>
                <Field
                  label="Org.nr"
                  value={form.orgNr}
                  onChangeText={(v) => setField('orgNr', v)}
                  editable={canEdit}
                  keyboardType="number-pad"
                  style={{ flex: 1 }}
                />
                <Field
                  label="Valuta"
                  value={form.currency}
                  onChangeText={(v) => setField('currency', v)}
                  editable={canEdit}
                  style={{ flex: 1 }}
                />
              </View>
              <Field label="Kategori" value={form.category} onChangeText={(v) => setField('category', v)} editable={canEdit} />
              <Field
                label="Faktura-/kvitteringsnr"
                value={form.invoiceNumber}
                onChangeText={(v) => setField('invoiceNumber', v)}
                editable={canEdit}
              />
              <Field
                label="Betaling"
                value={form.paymentMethod}
                onChangeText={(v) => setField('paymentMethod', v)}
                editable={canEdit}
                placeholder="kort, vipps, kontant…"
              />
              <Field
                label="Notat"
                value={form.notes}
                onChangeText={(v) => setField('notes', v)}
                editable={canEdit}
                multiline
              />

              {Array.isArray(form.lineItems) && form.lineItems.length ? (
                <View style={styles.linesCard}>
                  <Text style={styles.linesTitle}>Linjer ({form.lineItems.length})</Text>
                  {form.lineItems.map((line, idx) => (
                    <View key={`${line.description}-${idx}`} style={styles.lineRow}>
                      <Text style={styles.lineDesc} numberOfLines={2}>
                        {line.description || '—'}
                        {line.quantity && line.quantity !== 1 ? ` × ${line.quantity}` : ''}
                      </Text>
                      <Text style={styles.lineAmt}>
                        {formatBilagAmount(line.amount, form.currency)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>

          <View style={styles.footer}>
            {canEdit && typeof onRerunOcr === 'function' ? (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={onRerunOcr}
                disabled={actionBusy}
              >
                {busy ? (
                  <ActivityIndicator color={colors.brand} />
                ) : (
                  <>
                    <Ionicons name="sparkles-outline" size={16} color={colors.brand} />
                    <Text style={styles.secondaryTxt}>Tolke på nytt</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
            {canEdit ? (
              <TouchableOpacity
                style={[styles.saveBtn, actionBusy && { opacity: 0.6 }]}
                onPress={save}
                disabled={actionBusy}
              >
                {saving || deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveTxt}>Lagre bilag</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.saveBtn} onPress={onClose}>
                <Text style={styles.saveTxt}>Lukk</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog
        visible={confirmDelete}
        title="Slett fil"
        message={`Vil du slette «${file.bilag?.supplier || file.name || 'filen'}»?`}
        confirmText="Slett"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
      />
    </>
  );
}

function Field({
  label, value, onChangeText, editable, placeholder, keyboardType, multiline, style,
}) {
  return (
    <View style={[styles.field, style]}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value == null ? '' : String(value)}
        onChangeText={onChangeText}
        editable={editable}
        placeholder={placeholder || ''}
        placeholderTextColor={colors.muted}
        keyboardType={keyboardType || 'default'}
        multiline={!!multiline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
  },
  sheetDesk: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    borderRadius: 14,
    marginBottom: 40,
    maxHeight: '88%',
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: { fontSize: 16, fontWeight: '600', color: colors.ink },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  scroll: { flexGrow: 0 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  preview: {
    height: 120,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#e2e8f0',
    marginBottom: 4,
  },
  previewImg: { width: '100%', height: '100%' },
  previewHint: {
    position: 'absolute',
    right: 8,
    bottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(15,23,42,0.65)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  previewHintTxt: { color: '#fff', fontSize: 11, fontWeight: '500' },
  field: { gap: 4 },
  fieldLbl: { fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: '#f8fafc',
  },
  inputMulti: { minHeight: 72, textAlignVertical: 'top' },
  row2: { flexDirection: 'row', gap: 8 },
  linesCard: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#f8fafc',
    marginTop: 4,
  },
  linesTitle: { fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 6 },
  lineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  lineDesc: { flex: 1, fontSize: 13, color: colors.ink },
  lineAmt: { fontSize: 13, fontWeight: '600', color: colors.ink },
  footer: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  secondaryTxt: { color: colors.brand, fontWeight: '500', fontSize: 14 },
  saveBtn: {
    flex: 1,
    backgroundColor: colors.brand,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  saveTxt: { color: '#fff', fontWeight: '600', fontSize: 15 },
});
