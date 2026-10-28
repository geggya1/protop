import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateField from '../../components/DateField';
import { dateKey } from '../../src/utils/dates';
import {
  formatMoney, formatNbDate, localIsoDate, salaryBaseFor, SALARY_KINDS,
} from '../../src/hr/model';
import { radius, type } from '../../src/ui/tokens';
import { HrButton, HrChip, HrField } from './HrShared';

function draftFrom(entry) {
  if (!entry) {
    return {
      kind: 'actual',
      effectiveDate: localIsoDate(),
      annualAmount: '',
      reason: '',
      memo: '',
      employeeVisible: true,
    };
  }
  return {
    kind: entry.kind === 'planned' ? 'planned' : 'actual',
    effectiveDate: entry.effectiveDate || '',
    annualAmount: entry.annualAmount ? String(entry.annualAmount) : '',
    reason: entry.reason || '',
    memo: entry.memo || entry.notes || '',
    employeeVisible: entry.employeeVisible !== false,
  };
}

function parseAmount(value) {
  const n = Number(String(value ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Popup for å registrere en ny lønnspost eller endre en som er lagret. */
export default function HrSalaryEntryModal({
  visible, colors, employeeId, entry, salaries, onClose, onSave, onDelete,
}) {
  const [draft, setDraft] = useState(() => draftFrom(entry));
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const editing = !!entry;
  const danger = colors.dangerInk || colors.danger;

  useEffect(() => {
    if (!visible) return;
    setDraft(draftFrom(entry));
    setError('');
    setConfirmDelete(false);
    // Skjemaet fylles på nytt hver gang popupen åpnes, ikke mens den står åpen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, entry?.id]);

  const amount = parseAmount(draft.annualAmount);
  const base = useMemo(
    () => salaryBaseFor(employeeId, salaries, { effectiveDate: draft.effectiveDate, excludeId: entry?.id || '' }),
    [employeeId, salaries, draft.effectiveDate, entry?.id],
  );
  const changePct = base?.annualAmount > 0 && amount > 0
    ? Math.round(((amount - base.annualAmount) / base.annualAmount) * 1000) / 10
    : null;

  const patch = (next) => {
    setError('');
    setDraft((prev) => ({ ...prev, ...next }));
  };

  function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.effectiveDate)) {
      setError('Velg dato.');
      return;
    }
    if (!(amount > 0)) {
      setError('Skriv inn årslønn.');
      return;
    }
    onSave?.({
      ...(entry ? { id: entry.id } : null),
      employeeId,
      kind: draft.kind,
      effectiveDate: draft.effectiveDate,
      annualAmount: amount,
      reason: draft.reason.trim(),
      memo: draft.memo.trim(),
      // Memo erstatter det gamle notatfeltet, så et tømt memo blir tomt.
      notes: '',
      employeeVisible: !!draft.employeeVisible,
    });
  }

  if (!visible) return null;
  const title = editing ? 'Endre lønn' : 'Registrer lønn';
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Lukk"
        />
        <View
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}
          accessibilityRole="dialog"
          accessibilityLabel={title}
          nativeID="hr-salary-modal"
        >
          <View style={[styles.head, { borderBottomColor: colors.line }]}>
            <Text style={[styles.title, { color: colors.ink }]} accessibilityRole="header">{title}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Lukk"
              nativeID="hr-salary-modal-close"
            >
              <Ionicons name="close" size={20} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={styles.scroll} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Type</Text>
              <View style={styles.chips}>
                {SALARY_KINDS.map((kind) => (
                  <HrChip
                    key={kind.id}
                    colors={colors}
                    label={kind.label}
                    active={draft.kind === kind.id}
                    onPress={() => patch({ kind: kind.id })}
                    nativeID={`hr-salary-kind-${kind.id}`}
                  />
                ))}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Gjelder fra</Text>
              <View nativeID="hr-salary-date">
                <DateField
                  value={draft.effectiveDate || null}
                  placeholder="Velg dato"
                  onChange={(day) => patch({ effectiveDate: day ? dateKey(day) : '' })}
                  style={{ borderColor: colors.line, backgroundColor: colors.bg }}
                  textStyle={[type.body, { color: draft.effectiveDate ? colors.ink : colors.muted }]}
                  iconColor={colors.brand}
                />
              </View>
            </View>
            <HrField
              colors={colors}
              label="Årslønn"
              value={draft.annualAmount}
              onChangeText={(annualAmount) => patch({ annualAmount })}
              keyboardType="numeric"
              placeholder="F.eks. 650000"
            />
            {base && changePct != null ? (
              <Text style={[styles.preview, { color: colors.brand }]}>
                {`Endring mot ${formatMoney(base.annualAmount, base.currency)} fra ${formatNbDate(base.effectiveDate)}: ${changePct > 0 ? '+' : ''}${changePct} %`}
              </Text>
            ) : null}
            <HrField
              colors={colors}
              label="Begrunnelse"
              value={draft.reason}
              onChangeText={(reason) => patch({ reason })}
              placeholder="F.eks. årlig justering"
            />
            <HrField
              colors={colors}
              label="Memo knyttet til bevegelsen"
              value={draft.memo}
              onChangeText={(memo) => patch({ memo })}
              multiline
              placeholder="Bakgrunn, forhandling, forutsetninger…"
            />
            <Pressable
              onPress={() => patch({ employeeVisible: !draft.employeeVisible })}
              style={styles.check}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !!draft.employeeVisible }}
              nativeID="hr-salary-visible"
            >
              <Ionicons
                name={draft.employeeVisible ? 'checkbox' : 'square-outline'}
                size={20}
                color={draft.employeeVisible ? colors.brand : colors.muted}
              />
              <Text style={[styles.checkText, { color: colors.ink }]}>
                Synlig for den ansatte på Min side
              </Text>
            </Pressable>
            {error ? (
              <Text style={[styles.error, { color: danger }]} nativeID="hr-salary-error">{error}</Text>
            ) : null}
            {confirmDelete ? (
              <Text style={[styles.error, { color: danger }]}>
                Trykk «Slett for godt» for å fjerne posten. Det kan ikke angres.
              </Text>
            ) : null}
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.line }]}>
            {editing ? (
              <HrButton
                colors={colors}
                label={confirmDelete ? 'Slett for godt' : 'Slett'}
                icon="trash-outline"
                danger={confirmDelete}
                onPress={() => (confirmDelete ? onDelete?.(entry.id) : setConfirmDelete(true))}
                nativeID="hr-salary-delete"
              />
            ) : null}
            <View style={{ flex: 1 }} />
            <HrButton colors={colors} label="Avbryt" onPress={onClose} nativeID="hr-salary-cancel" />
            <HrButton
              colors={colors}
              label={editing ? 'Lagre endringer' : 'Lagre'}
              primary
              icon="save-outline"
              onPress={save}
              nativeID="hr-salary-save"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 540,
    maxHeight: '92%',
    borderWidth: 1,
    borderRadius: radius.sheet,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 18px 48px rgba(15, 23, 42, 0.22)' } : { elevation: 8 }),
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { ...type.title },
  scroll: { flexGrow: 0 },
  body: { padding: 16, gap: 12 },
  field: { gap: 4 },
  label: { ...type.caption },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preview: { ...type.label },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  checkText: { ...type.body, flexShrink: 1 },
  error: { ...type.body },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
