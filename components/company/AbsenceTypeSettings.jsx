import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  ABSENCE_CATEGORIES,
  ABSENCE_MONTHS,
  absenceTypeTitle,
  resolveAbsenceTypes,
} from '../../src/arbeid/absenceCatalog.js';
import { deleteAbsenceType, upsertAbsenceType } from '../../src/company/setupState.js';
import { SetupFrame, TextAction } from './SetupFrame';
import { useCompanyProject } from './useCompanyProject';

const EMPTY = {
  id: '',
  label: '',
  category: 'Annet fravær',
  paid: false,
  deductBalance: false,
  billable: false,
  startMonth: 1,
};

export default function AbsenceTypeSettings({ familyId, colors, canEdit }) {
  const project = useCompanyProject(familyId);
  const [draft, setDraft] = useState(null);
  const rows = resolveAbsenceTypes(project.state);

  function openNew() {
    setDraft({ ...EMPTY });
    project.setNote('');
    project.setError('');
  }

  function openRow(row) {
    setDraft({
      id: row.id,
      label: row.label,
      category: row.category,
      paid: row.paid,
      deductBalance: row.deductBalance,
      billable: row.billable,
      startMonth: row.startMonth,
    });
    project.setNote('');
    project.setError('');
  }

  async function save() {
    const ok = await project.commit(
      upsertAbsenceType(project.state, draft),
      draft?.id ? 'Fraværstypen er oppdatert.' : 'Fraværstypen er lagt til.',
    );
    if (ok) setDraft(null);
  }

  async function remove(row) {
    const ok = await project.commit(deleteAbsenceType(project.state, row.id), 'Fraværstypen er slettet.');
    if (ok) setDraft(null);
  }

  return (
    <SetupFrame
      colors={colors}
      nativeID="company-absence-types"
      crumbs={[
        { label: 'Fravær', tab: 'arbeid', page: 'fravaer' },
        { label: 'Innstillinger', tab: 'arbeid', page: 'fravaer-innstillinger' },
        { label: 'Fraværstyper' },
      ]}
      title="Fraværstyper"
      note={project.note}
      error={project.error}
      action={canEdit ? <TextAction filled colors={colors} label="+ Legg til fraværstype" onPress={openNew} nativeID="add-absence-type" /> : null}
    >
      <Text style={{ color: colors.muted }}>
        Typene brukes når fravær føres på timelisten. Betalt fravær teller i lønnsgrunnlaget.
        Trekk fra timebalanse tar timene ut av timebanken. Fakturerbart arbeid teller som arbeid som kan viderefaktureres.
      </Text>
      {draft ? (
        <View style={[styles.form, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.formTitle, { color: colors.ink }]}>{draft.id ? 'Endre fraværstype' : 'Ny fraværstype'}</Text>
          <Field label="Navn" colors={colors}>
            <TextInput
              value={draft.label}
              onChangeText={(label) => setDraft((current) => ({ ...current, label }))}
              editable={canEdit}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
              accessibilityLabel="Navn på fraværstype"
            />
          </Field>
          <Field label="Kategori" colors={colors}>
            <View style={styles.chips}>
              {ABSENCE_CATEGORIES.map((category) => (
                <TouchableOpacity
                  key={category}
                  disabled={!canEdit}
                  onPress={() => setDraft((current) => ({ ...current, category }))}
                  style={[styles.chip, { borderColor: draft.category === category ? colors.brand : colors.line, backgroundColor: draft.category === category ? `${colors.brand}18` : 'transparent' }]}
                >
                  <Text style={{ color: colors.ink }}>{category}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>
          <Toggle label="Betalt fravær" value={draft.paid} disabled={!canEdit} onChange={(paid) => setDraft((current) => ({ ...current, paid }))} colors={colors} />
          <Toggle label="Trekkes fra timebalanse" value={draft.deductBalance} disabled={!canEdit} onChange={(deductBalance) => setDraft((current) => ({ ...current, deductBalance }))} colors={colors} />
          <Toggle label="Teller som fakturerbart arbeid" value={draft.billable} disabled={!canEdit} onChange={(billable) => setDraft((current) => ({ ...current, billable }))} colors={colors} />
          <Field label="Startmåned" colors={colors}>
            <View style={styles.chips}>
              {ABSENCE_MONTHS.map((month) => (
                <TouchableOpacity
                  key={month.id}
                  disabled={!canEdit}
                  onPress={() => setDraft((current) => ({ ...current, startMonth: month.id }))}
                  style={[styles.chip, { borderColor: draft.startMonth === month.id ? colors.brand : colors.line }]}
                >
                  <Text style={{ color: colors.ink }}>{month.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Field>
          <View style={styles.formActions}>
            <TextAction label="Avbryt" colors={colors} onPress={() => setDraft(null)} />
            {canEdit ? <TextAction filled label="Lagre" colors={colors} onPress={save} nativeID="save-absence-type" /> : null}
            {canEdit && draft.id ? (
              <TouchableOpacity onPress={() => remove(draft)} accessibilityLabel="Slett fraværstype">
                <Text style={{ color: colors.danger || '#b42318' }}>Slett</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
      <View style={[styles.table, { borderColor: colors.line }]}>
        <View style={[styles.header, { backgroundColor: `${colors.brand}22` }]}>
          <Text style={[styles.headerText, { color: colors.ink }]}>Fraværstype</Text>
          <Text style={[styles.headerText, { color: colors.ink, width: 150 }]}>Innstillinger</Text>
        </View>
        {rows.map((row, index) => (
          <View key={row.id} style={[styles.row, { backgroundColor: index % 2 ? (colors.sunken || '#f6f7fb') : colors.card }]}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{absenceTypeTitle(row)}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {`Betalt fravær: ${yesNo(row.paid)} · Trekkes fra timebalanse: ${yesNo(row.deductBalance)}`}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {`Teller som fakturerbart arbeid: ${yesNo(row.billable)} · Startmåned: ${row.startMonthLabel}`}
              </Text>
            </View>
            {canEdit ? (
              <TouchableOpacity onPress={() => openRow(row)} accessibilityLabel={`Endre ${row.label}`}>
                <Text style={{ color: colors.brand, fontWeight: '700' }}>Rediger</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>
    </SetupFrame>
  );
}

function yesNo(value) {
  return value ? 'Ja' : 'Nei';
}

function Field({ label, colors, children }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      {children}
    </View>
  );
}

function Toggle({ label, value, onChange, disabled, colors }) {
  return (
    <View style={styles.toggle}>
      <Text style={{ color: colors.ink, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.muted, marginRight: 8 }}>{yesNo(value)}</Text>
      <Switch
        value={!!value}
        disabled={disabled}
        onValueChange={onChange}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 12 },
  formTitle: { fontSize: 16, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
  headerText: { fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  toggle: { flexDirection: 'row', alignItems: 'center' },
});
