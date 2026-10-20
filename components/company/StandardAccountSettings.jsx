import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  STANDARD_ACCOUNT_SLOTS,
  accountOptionLabel,
  resolveCompanyAccounts,
  resolveStandardAccounts,
} from '../../src/economy/companyChart.js';
import { saveStandardAccounts } from '../../src/company/setupState.js';
import { SetupFrame } from './SetupFrame';
import { useCompanyProject } from './useCompanyProject';

export default function StandardAccountSettings({ familyId, colors, canEdit }) {
  const project = useCompanyProject(familyId);
  const accounts = resolveCompanyAccounts(project.state);
  const [draft, setDraft] = useState(() => resolveStandardAccounts(project.state));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(resolveStandardAccounts(project.state));
  }, [project.state, dirty]);

  function setSlot(scope, slot, code) {
    setDirty(true);
    setDraft((current) => {
      if (scope === 'other') return { ...current, rounding: code };
      return { ...current, [scope]: { ...current[scope], [slot]: code } };
    });
  }

  async function save() {
    const ok = await project.commit(saveStandardAccounts(project.state, draft), 'Standardkontoene er lagret.');
    if (ok) setDirty(false);
  }

  function reset() {
    setDraft(resolveStandardAccounts(project.state));
    setDirty(false);
    project.setError('');
  }

  return (
    <SetupFrame
      colors={colors}
      nativeID="company-standard-accounts"
      crumbs={[
        { label: 'Økonomi', tab: 'okonomi', page: 'oversikt' },
        { label: 'Innstillinger', tab: 'okonomi', page: 'innstillinger' },
        { label: 'Standard regnskapskontoer' },
      ]}
      title="Standard regnskapskontoer"
      note={project.note}
      error={project.error}
    >
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 12 }}>
        Disse kontoene er selskapets standard og arves av alle prosjekter under Faktureringsvalg
        (Regnskapskontoer og MVA). Prosjektet kan overstyre enkeltkontoer.
      </Text>
      <Text accessibilityRole="header" style={[styles.section, { color: colors.ink, marginTop: 0 }]}>
        Standard regnskapskontoer for kunder i samme land som egen bedrift
      </Text>
      <AccountGroup
        colors={colors}
        accounts={accounts}
        values={draft.domestic}
        canEdit={canEdit}
        onChange={(slot, code) => setSlot('domestic', slot, code)}
      />
      <Text accessibilityRole="header" style={[styles.section, { color: colors.ink }]}>
        Standard regnskapskontoer for kunder i andre land enn egen bedrift
      </Text>
      <AccountGroup
        colors={colors}
        accounts={accounts}
        values={draft.foreign}
        canEdit={canEdit}
        onChange={(slot, code) => setSlot('foreign', slot, code)}
      />
      <Text accessibilityRole="header" style={[styles.section, { color: colors.ink }]}>Øvrige kontoer</Text>
      <AccountRow
        label="Avrunding"
        value={draft.rounding}
        accounts={accounts}
        colors={colors}
        canEdit={canEdit}
        onChange={(code) => setSlot('other', 'rounding', code)}
      />
      {canEdit ? (
        <View style={styles.actions}>
          <TouchableOpacity onPress={reset} style={[styles.btn, { backgroundColor: '#fff', borderColor: colors.line, borderWidth: 1 }]}>
            <Text style={{ color: colors.ink }}>Avbryt</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={save} nativeID="save-standard-accounts" style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre endringer</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SetupFrame>
  );
}

function AccountGroup({ colors, accounts, values, canEdit, onChange }) {
  return (
    <View style={{ gap: 10 }}>
      {STANDARD_ACCOUNT_SLOTS.map((slot) => (
        <AccountRow
          key={slot.id}
          label={slot.label}
          value={values?.[slot.id] || ''}
          accounts={accounts}
          colors={colors}
          canEdit={canEdit}
          onChange={(code) => onChange(slot.id, code)}
        />
      ))}
    </View>
  );
}

function AccountRow({ label, value, accounts, colors, canEdit, onChange }) {
  const options = [{ value: '', label: '' }, ...accounts.map((row) => ({
    value: row.code,
    label: accountOptionLabel(row),
  }))];
  if (value && !options.some((row) => row.value === value)) {
    options.push({ value, label: value });
  }
  return (
    <View style={styles.line}>
      <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      {Platform.OS === 'web' ? (
        <select
          aria-label={label}
          disabled={!canEdit}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          style={selectStyle}
        >
          {options.map((option) => (
            <option key={`${label}-${option.value}`} value={option.value}>{option.label}</option>
          ))}
        </select>
      ) : (
        <TouchableOpacity
          disabled={!canEdit}
          onPress={() => {
            const index = options.findIndex((option) => option.value === value);
            const next = options[(index + 1) % options.length];
            onChange(next?.value || '');
          }}
          style={[styles.nativePick, { borderColor: colors.line }]}
        >
          <Text style={{ color: colors.ink }}>{options.find((option) => option.value === value)?.label || 'Velg konto'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const selectStyle = {
  flex: 1,
  minWidth: 280,
  height: 40,
  borderRadius: 8,
  border: '1px solid #d5dbe3',
  padding: '0 12px',
  background: '#fff',
  color: '#152033',
  fontSize: 14,
};

const styles = StyleSheet.create({
  section: { fontSize: 22, fontWeight: '600', marginTop: 12 },
  line: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  label: { width: 280, fontSize: 15 },
  nativePick: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, minWidth: 240 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
  btn: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
});
