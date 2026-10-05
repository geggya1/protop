import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  addDelivery,
  closeContract,
  exerciseOption,
  setDeliveryStatus,
  setMilestoneDue,
  setMilestoneStatus,
} from '../../src/anbud/lifecycle';
import { childAgreements, coverFromRecord, coverGroups, kindLabel } from '../../src/anbud/agreementTemplate';
import { formatNok } from '../../src/anbud/model';
import { formatOrgnr, maskPersonnummer } from '../../src/anbud/customers';
import { indexLabel } from '../../src/anbud/fieldReview';
import { formatNumberId } from '../../src/anbud/numbering';
import { documentIsOpenable, openAgreementDocument } from '../../src/anbud/openDocument';
import { loadAnbudState } from '../../src/anbud/storage';
import OwnerPicker from './OwnerPicker';

export default function AgreementDetail({
  contract,
  contracts = [],
  customer = null,
  people = [],
  colors,
  companyId,
  onCommit,
  onBack,
  onOpenProject,
  onOpenIndex,
  onOpenCustomer,
  onAssignOwner,
  onOpenAgreement,
  onNewChild,
}) {
  const [dates, setDates] = useState({});
  const [delivery, setDelivery] = useState({ title: '', due: '' });
  const [open, setOpen] = useState({ cover: true, kunde: true, dokumenter: true, milepeler: false, underavtaler: false });
  const form = coverFromRecord(contract);
  const groups = coverGroups(form);
  const children = childAgreements(contracts, contract.id);
  const parent = contracts.find((row) => row.id === contract.parentId) || null;

  async function apply(change) {
    const loaded = await loadAnbudState(companyId);
    const result = change(loaded);
    await onCommit(result);
    return result;
  }

  function valueFor(field, value) {
    if (field.key === 'orgnr') return formatOrgnr(value) || value;
    if (field.key === 'personnummer') return maskPersonnummer(value) || value;
    if (field.key === 'kind') return kindLabel(value) || value;
    if (field.key === 'value') return formatNok(value) || value;
    if (field.key === 'parentId') return parent?.title || '';
    if (field.key === 'indexId') return indexLabel(value) || value;
    if (field.key === 'systemId' || field.key === 'oppdragId') return formatNumberId(value) || value;
    return value;
  }

  function toggle(id) {
    setOpen((current) => ({ ...current, [id]: !current[id] }));
  }

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.row}>
        <TouchableOpacity onPress={onBack} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Til oversikten</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.hero, { borderColor: colors.brand, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.muted, fontSize: 12, letterSpacing: 0.4, textTransform: 'uppercase' }}>{kindLabel(contract.kind) || 'Avtale'}</Text>
        <Text style={[styles.h, { color: colors.ink }]}>{contract.title}</Text>
        <Text style={{ color: colors.ink }}>
          {[`System-ID ${formatNumberId(contract.systemId) || '—'}`, `Oppdrags-ID ${formatNumberId(contract.oppdragId) || '—'}`].join(' · ')}
        </Text>
        <Text style={{ color: colors.ink }}>
          {[contract.buyer, [contract.start, contract.end].filter(Boolean).join(' – '), contract.value ? formatNok(contract.value) : '', contract.fields?.standard].filter(Boolean).join(' · ')}
        </Text>
        {contract.status === 'avsluttet' ? <Text style={{ color: colors.muted }}>Avsluttet</Text> : null}
      </View>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => toggle('cover')} accessibilityRole="button" style={styles.head}>
          <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>Avtaleopplysninger</Text>
          <Text style={{ color: colors.muted }}>{open.cover ? '▾' : '▸'}</Text>
        </TouchableOpacity>
        {open.cover ? groups.map((group) => (
          <View key={group.id} style={[styles.block, { borderColor: colors.line }]}>
            <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.3 }}>{group.title}</Text>
            <View style={styles.grid}>
              {group.rows.map((row) => (
                <View key={row.key} style={styles.fact}>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{row.label}</Text>
                  <Text style={{ color: row.value ? colors.ink : colors.placeholder }}>{row.value ? valueFor(row, row.value) : '—'}</Text>
                </View>
              ))}
            </View>
          </View>
        )) : null}
      </View>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => toggle('kunde')} accessibilityRole="button" style={styles.head}>
          <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>Kundeforhold</Text>
          <Text style={{ color: colors.muted }}>{open.kunde ? '▾' : '▸'}</Text>
        </TouchableOpacity>
        {open.kunde ? (customer ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{customer.name}</Text>
            <Text style={{ color: colors.muted }}>
              {[customer.kind === 'person' ? 'Privatkunde' : 'Virksomhet', formatOrgnr(customer.orgnr), customer.contactName].filter(Boolean).join(' · ')}
            </Text>
            <OwnerPicker
              colors={colors}
              people={people}
              value={customer.ownerUid}
              onChange={(person) => onAssignOwner?.(person)}
            />
            <TouchableOpacity onPress={() => onOpenCustomer?.(customer.id)} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Åpne kundeforholdet</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={{ color: colors.muted }}>Ingen kunde er koblet.</Text>
        )) : null}
      </View>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => toggle('dokumenter')} accessibilityRole="button" style={styles.head}>
          <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>Dokumenter ({(contract.documents || []).length})</Text>
          <Text style={{ color: colors.muted }}>{open.dokumenter ? '▾' : '▸'}</Text>
        </TouchableOpacity>
        {open.dokumenter ? (
          (contract.documents || []).length ? contract.documents.map((doc) => (
            <TouchableOpacity
              key={doc.id}
              onPress={() => openAgreementDocument(doc)}
              accessibilityRole="link"
              disabled={!documentIsOpenable(doc)}
            >
              <Text style={{ color: documentIsOpenable(doc) ? colors.brand : colors.muted, textDecorationLine: documentIsOpenable(doc) ? 'underline' : 'none' }}>
                {doc.name}{documentIsOpenable(doc) ? '' : ' · kan ikke åpnes'}
              </Text>
            </TouchableOpacity>
          )) : <Text style={{ color: colors.muted }}>Ingen dokumenter er lagt ved.</Text>
        ) : null}
      </View>

      {(contract.options || []).length ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Opsjoner</Text>
          {contract.options.map((row) => (
            <TouchableOpacity
              key={row.id}
              onPress={() => apply((loaded) => exerciseOption(loaded, contract.id, row.id, !row.exercised))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: row.exercised }}
            >
              <Text style={{ color: row.exercised ? colors.success : colors.ink }}>
                {row.exercised ? '✓' : '○'} {row.title}{[row.start, row.end].filter(Boolean).length ? ` · ${[row.start, row.end].filter(Boolean).join(' – ')}` : ''}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => toggle('underavtaler')} accessibilityRole="button" style={styles.head}>
          <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>Underavtaler</Text>
          <Text style={{ color: colors.muted }}>{open.underavtaler ? '▾' : '▸'}</Text>
        </TouchableOpacity>
        {open.underavtaler ? (
          <>
            {parent ? (
              <TouchableOpacity onPress={() => onOpenAgreement?.(parent.id)} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Hovedavtale: {parent.title}</Text>
              </TouchableOpacity>
            ) : null}
            {children.map((row) => (
              <TouchableOpacity key={row.id} onPress={() => onOpenAgreement?.(row.id)} accessibilityRole="button">
                <Text style={{ color: colors.ink }}>{kindLabel(row.kind) || 'Avtale'} · {row.title}</Text>
              </TouchableOpacity>
            ))}
            {!children.length && !parent ? <Text style={{ color: colors.muted }}>Ingen avrop eller endringer er knyttet hit ennå.</Text> : null}
            {contract.kind === 'rammeavtale' || contract.kind === 'oppdrag' ? (
              <View style={styles.row}>
                <TouchableOpacity onPress={() => onNewChild?.('avrop')} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Nytt avrop</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onNewChild?.('endring')} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Ny endring</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </>
        ) : null}
      </View>

      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <TouchableOpacity onPress={() => toggle('milepeler')} accessibilityRole="button" style={styles.head}>
          <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>Milepæler og leveranser</Text>
          <Text style={{ color: colors.muted }}>{open.milepeler ? '▾' : '▸'}</Text>
        </TouchableOpacity>
        {open.milepeler ? (
          <>
            {(contract.milestones || []).map((row) => (
              <View key={row.id} style={{ gap: 4 }}>
                <TouchableOpacity
                  onPress={() => apply((loaded) => setMilestoneStatus(loaded, contract.id, row.id, row.status === 'utfort' ? 'planlagt' : 'utfort'))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: row.status === 'utfort' }}
                >
                  <Text style={{ color: row.status === 'utfort' ? colors.success : colors.ink }}>
                    {row.status === 'utfort' ? '✓' : '○'} {row.title}{row.due ? ` · ${row.due}` : ''}
                  </Text>
                </TouchableOpacity>
                {!row.due ? (
                  <TextInput
                    value={dates[row.id] || ''}
                    onChangeText={(due) => setDates((current) => ({ ...current, [row.id]: due }))}
                    onBlur={() => {
                      const due = dates[row.id];
                      if (due) apply((loaded) => setMilestoneDue(loaded, contract.id, row.id, due));
                    }}
                    placeholder="Dato ÅÅÅÅ-MM-DD"
                    placeholderTextColor={colors.placeholder}
                    style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
                  />
                ) : null}
              </View>
            ))}
            <Text style={{ color: colors.ink, fontWeight: '600' }}>Leveranser</Text>
            {(contract.deliveries || []).map((row) => (
              <TouchableOpacity
                key={row.id}
                onPress={() => apply((loaded) => setDeliveryStatus(loaded, contract.id, row.id, row.status === 'levert' ? 'avtalt' : 'levert'))}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: row.status === 'levert' }}
              >
                <Text style={{ color: row.status === 'levert' ? colors.success : colors.ink }}>
                  {row.status === 'levert' ? '✓' : '○'} {row.title}{row.due ? ` · ${row.due}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
            <TextInput value={delivery.title} onChangeText={(title) => setDelivery((current) => ({ ...current, title }))} placeholder="Ny leveranse" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
            <TextInput value={delivery.due} onChangeText={(due) => setDelivery((current) => ({ ...current, due }))} placeholder="Frist ÅÅÅÅ-MM-DD" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
            <TouchableOpacity
              onPress={async () => {
                const result = await apply((loaded) => addDelivery(loaded, contract.id, delivery));
                if (result?.ok) setDelivery({ title: '', due: '' });
              }}
              accessibilityRole="button"
              style={[styles.save, { backgroundColor: colors.brand }]}
            >
              <Text style={{ color: '#fff' }}>Legg til leveranse</Text>
            </TouchableOpacity>
          </>
        ) : null}
      </View>

      <View style={styles.row}>
        <TouchableOpacity onPress={onOpenProject} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>{contract.projectId ? 'Prosjektet er koblet' : 'Opprett prosjekt'}</Text>
        </TouchableOpacity>
        {contract.indexDraft ? (
          <TouchableOpacity onPress={onOpenIndex} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Åpne i indeksarbeid</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => apply((loaded) => closeContract(loaded, contract.id))} accessibilityRole="button">
          <Text style={{ color: colors.muted }}>Avslutt avtale</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 24, fontWeight: '700' },
  hero: { borderWidth: 1, borderRadius: 16, padding: 16, gap: 6 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  block: { borderTopWidth: 1, paddingTop: 10, gap: 8 },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fact: { flexGrow: 1, flexBasis: 180, minWidth: 160, gap: 3 },
});
