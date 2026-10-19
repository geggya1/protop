import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  accountTitle,
  resolveCompanyAccounts,
} from '../../src/economy/companyChart.js';
import { deleteCompanyAccount, upsertCompanyAccount } from '../../src/company/setupState.js';
import { SetupFrame, TextAction } from './SetupFrame';
import { useCompanyProject } from './useCompanyProject';

const EMPTY = {
  id: '',
  code: '',
  kind: 'sale',
  vatRate: '25',
  vatLetter: 'S',
  name: '',
  turnoverClass: '',
  vatCode: '',
  note: '',
};

export default function ChartOfAccountsSettings({ familyId, colors, canEdit }) {
  const project = useCompanyProject(familyId);
  const [draft, setDraft] = useState(null);
  const rows = resolveCompanyAccounts(project.state);

  function openNew() {
    setDraft({ ...EMPTY });
    project.setNote('');
    project.setError('');
  }

  function openRow(row) {
    setDraft({
      id: row.id,
      code: row.code,
      kind: row.kind,
      vatRate: row.vatRate == null ? '' : String(row.vatRate),
      vatLetter: row.vatLetter,
      name: row.name,
      turnoverClass: row.turnoverClass,
      vatCode: row.vatCode,
      note: row.note,
    });
  }

  async function save() {
    const ok = await project.commit(upsertCompanyAccount(project.state, {
      ...draft,
      vatRate: draft.vatRate === '' ? null : Number(String(draft.vatRate).replace(',', '.')),
    }), draft?.id ? 'Kontoen er oppdatert.' : 'Kontoen er lagt til.');
    if (ok) setDraft(null);
  }

  async function remove() {
    const ok = await project.commit(deleteCompanyAccount(project.state, draft.id), 'Kontoen er slettet.');
    if (ok) setDraft(null);
  }

  return (
    <SetupFrame
      colors={colors}
      nativeID="company-chart"
      crumbs={[
        { label: 'Selskap', page: '' },
        { label: 'Innstillinger', page: 'innstillinger' },
        { label: 'Kontoplan' },
      ]}
      title="Kontoplan"
      note={project.note}
      error={project.error}
      action={canEdit ? <TextAction filled colors={colors} label="+ Opprett konto" onPress={openNew} nativeID="add-account" /> : null}
    >
      {draft ? (
        <View style={[styles.form, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.formTitle, { color: colors.ink }]}>{draft.id ? 'Endre konto' : 'Ny konto'}</Text>
          <View style={styles.grid}>
            <Labeled label="Kontonummer" colors={colors}>
              <TextInput value={draft.code} onChangeText={(code) => setDraft((current) => ({ ...current, code }))} editable={canEdit} accessibilityLabel="Kontonummer" style={inputStyle(colors)} />
            </Labeled>
            <Labeled label="Navn" colors={colors}>
              <TextInput value={draft.name} onChangeText={(name) => setDraft((current) => ({ ...current, name }))} editable={canEdit} accessibilityLabel="Kontonavn" style={inputStyle(colors)} />
            </Labeled>
          </View>
          <View style={styles.chips}>
            {[['sale', 'Salg'], ['purchase', 'Kjøp']].map(([id, label]) => (
              <TouchableOpacity
                key={id}
                disabled={!canEdit}
                onPress={() => setDraft((current) => ({ ...current, kind: id }))}
                style={[styles.chip, { borderColor: draft.kind === id ? colors.brand : colors.line, backgroundColor: draft.kind === id ? `${colors.brand}18` : 'transparent' }]}
              >
                <Text style={{ color: colors.ink }}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.grid}>
            <Labeled label="MVA-sats" colors={colors}>
              <TextInput value={draft.vatRate} onChangeText={(vatRate) => setDraft((current) => ({ ...current, vatRate }))} editable={canEdit} accessibilityLabel="MVA-sats" style={inputStyle(colors)} />
            </Labeled>
            <Labeled label="MVA-bokstav" colors={colors}>
              <View style={styles.chips}>
                {['S', 'Z', 'E'].map((letter) => (
                  <TouchableOpacity
                    key={letter}
                    disabled={!canEdit}
                    onPress={() => setDraft((current) => ({ ...current, vatLetter: letter }))}
                    style={[styles.chip, { borderColor: draft.vatLetter === letter ? colors.brand : colors.line }]}
                  >
                    <Text style={{ color: colors.ink }}>{letter}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Labeled>
            <Labeled label="Ekstern omsetningsklasse" colors={colors}>
              <TextInput value={draft.turnoverClass} onChangeText={(turnoverClass) => setDraft((current) => ({ ...current, turnoverClass }))} editable={canEdit} accessibilityLabel="Ekstern omsetningsklasse" style={inputStyle(colors)} />
            </Labeled>
            <Labeled label="Regnskap MVA kode" colors={colors}>
              <TextInput value={draft.vatCode} onChangeText={(vatCode) => setDraft((current) => ({ ...current, vatCode }))} editable={canEdit} accessibilityLabel="Regnskap MVA kode" style={inputStyle(colors)} />
            </Labeled>
          </View>
          <Labeled label="Merknad" colors={colors}>
            <TextInput value={draft.note} onChangeText={(note) => setDraft((current) => ({ ...current, note }))} editable={canEdit} accessibilityLabel="Merknad" style={inputStyle(colors)} />
          </Labeled>
          <View style={styles.formActions}>
            <TextAction label="Avbryt" colors={colors} onPress={() => setDraft(null)} />
            {canEdit ? <TextAction filled label="Lagre" colors={colors} onPress={save} nativeID="save-account" /> : null}
            {canEdit && draft.id ? (
              <TouchableOpacity onPress={remove} accessibilityLabel="Slett konto">
                <Text style={{ color: colors.danger || '#b42318' }}>Slett</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
      <View style={[styles.table, { borderColor: colors.line }]} nativeID="chart-of-accounts">
        <View style={[styles.header, { backgroundColor: colors.sunken || '#f4f1fb' }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Kontoplan</Text>
        </View>
        {rows.map((row, index) => (
          <View key={row.id} style={[styles.row, { backgroundColor: index % 2 ? '#f7f8fb' : '#fff', borderTopColor: colors.line }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{accountTitle(row)}</Text>
              {row.turnoverClass ? <Text style={styles.meta}>{`Ekstern omsetningsklasse: ${row.turnoverClass}`}</Text> : null}
              {row.vatCode ? <Text style={styles.meta}>{`Regnskap MVA kode: ${row.vatCode}`}</Text> : null}
              {row.note ? <Text style={styles.meta}>{row.note}</Text> : null}
            </View>
            {canEdit ? (
              <TouchableOpacity onPress={() => openRow(row)} accessibilityLabel={`Rediger ${row.code}`}>
                <Text style={{ color: colors.brand, fontWeight: '700' }}>Rediger</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>
    </SetupFrame>
  );
}

function Labeled({ label, colors, children }) {
  return (
    <View style={{ gap: 4, flex: 1, minWidth: 180 }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      {children}
    </View>
  );
}

function inputStyle(colors) {
  return {
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.ink,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
  };
}

const styles = StyleSheet.create({
  form: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 12 },
  formTitle: { fontSize: 16, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  header: { paddingHorizontal: 16, paddingVertical: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth },
  meta: { color: '#667085', fontSize: 13 },
});
