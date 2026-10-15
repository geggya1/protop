import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import {
  displayName, formatNbDate as empFormatNbDate, periodLabel, statusLabel,
} from '../../src/employees/model';
import {
  activeContractFor,
  choiceLabel,
  CONTRACT_STATUSES,
  currentSalaryFor,
  formatMoney,
  formatNbDate,
  normalizeContract,
  yearsBetween,
} from '../../src/hr/model';
import { EmptyHint, HrButton, HrCard, HrField, HrSectionTitle, RowLink } from './HrShared';

export default function HrPeople({
  colors, employees, hr, selectedId, onSelect, canWrite, onPatch,
}) {
  const [query, setQuery] = useState('');
  const [contractDraft, setContractDraft] = useState({
    title: 'Arbeidsavtale',
    startDate: '',
    endDate: '',
    workPercent: '100',
    employmentType: 'Fast',
    notes: '',
  });
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (employees || [])
      .filter((row) => row?.company?.status !== 'deleted')
      .filter((row) => {
        if (!q) return true;
        const hay = [
          displayName(row),
          row?.company?.title,
          row?.person?.email,
          row?.company?.email,
        ].join(' ').toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => displayName(a).localeCompare(displayName(b), 'nb'));
  }, [employees, query]);

  const selected = rows.find((row) => row.id === selectedId) || employees.find((row) => row.id === selectedId) || null;
  const contract = selected ? activeContractFor(selected.id, hr.contracts) : null;
  const salary = selected ? currentSalaryFor(selected.id, hr.salaries) : null;
  const tenure = selected ? yearsBetween(selected?.company?.periodFrom) : null;
  const personReviews = selected ? (hr.reviews || []).filter((r) => r.employeeId === selected.id) : [];
  const personCases = selected ? (hr.cases || []).filter((r) => r.employeeId === selected.id && r.status !== 'closed') : [];
  const personTasks = selected ? (hr.tasks || []).filter((r) => r.employeeId === selected.id && r.status !== 'done') : [];
  const personMemos = selected ? (hr.memos || []).filter((r) => r.employeeId === selected.id) : [];

  return (
    <View style={styles.page}>
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Personell"
          subtitle="Ansatt dato, jubileum, fødselsdato og kontraktstatus"
        />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Søk etter navn, tittel eller e-post"
          placeholderTextColor={colors.muted}
          style={[styles.search, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
        {rows.length === 0 ? (
          <EmptyHint colors={colors} text="Ingen treff i personaloversikten." />
        ) : rows.map((row) => {
          const hired = row?.company?.periodFrom;
          const years = yearsBetween(hired);
          const c = activeContractFor(row.id, hr.contracts);
          return (
            <RowLink
              key={row.id}
              colors={colors}
              title={displayName(row)}
              subtitle={[
                row?.company?.title || statusLabel(row?.company?.status),
                hired ? `Ansatt ${empFormatNbDate(hired)}${years != null ? ` · ${years} år` : ''}` : '',
                row?.person?.birthDate ? `Født ${empFormatNbDate(row.person.birthDate)}` : '',
              ].filter(Boolean).join(' · ')}
              meta={c ? choiceLabel(CONTRACT_STATUSES, c.status) : 'Uten kontrakt'}
              onPress={() => onSelect?.(row.id)}
            />
          );
        })}
      </HrCard>

      {selected ? (
        <HrCard colors={colors}>
          <HrSectionTitle
            colors={colors}
            title={displayName(selected)}
            subtitle={[selected?.company?.title, periodLabel(selected)].filter(Boolean).join(' · ')}
          />
          <View style={styles.facts}>
            <Fact colors={colors} label="Ansatt dato" value={empFormatNbDate(selected?.company?.periodFrom) || '—'} />
            <Fact colors={colors} label="Jubileum" value={tenure != null ? `${tenure} år` : '—'} />
            <Fact colors={colors} label="Fødselsdato" value={empFormatNbDate(selected?.person?.birthDate) || '—'} />
            <Fact
              colors={colors}
              label="Kontrakt"
              value={contract
                ? `${choiceLabel(CONTRACT_STATUSES, contract.status)} · ${formatNbDate(contract.startDate)}`
                : 'Ikke registrert'}
            />
            <Fact
              colors={colors}
              label="Lønn"
              value={salary ? formatMoney(salary.annualAmount, salary.currency) : 'Ikke registrert'}
            />
            <Fact colors={colors} label="Åpne saker" value={String(personCases.length)} />
            <Fact colors={colors} label="Oppgaver" value={String(personTasks.length)} />
            <Fact colors={colors} label="Samtaler" value={String(personReviews.length)} />
            <Fact colors={colors} label="Memo" value={String(personMemos.length)} />
          </View>
          {personMemos.slice(0, 3).map((memo) => (
            <RowLink
              key={memo.id}
              colors={colors}
              title={memo.title}
              subtitle={memo.body}
              meta={memo.employeeVisible ? 'Synlig' : 'HR'}
              icon="document-text-outline"
              onPress={() => {}}
            />
          ))}
          {canWrite ? (
            <View style={styles.form}>
              <Text style={[styles.formTitle, { color: colors.ink }]}>Registrer ansettelseskontrakt</Text>
              <HrField colors={colors} label="Tittel" value={contractDraft.title} onChangeText={(title) => setContractDraft((p) => ({ ...p, title }))} />
              <HrField colors={colors} label="Fra dato" value={contractDraft.startDate} onChangeText={(startDate) => setContractDraft((p) => ({ ...p, startDate }))} placeholder="ÅÅÅÅ-MM-DD" />
              <HrField colors={colors} label="Til dato" value={contractDraft.endDate} onChangeText={(endDate) => setContractDraft((p) => ({ ...p, endDate }))} placeholder="Tom = løpende" />
              <HrField colors={colors} label="Stillingsprosent" value={contractDraft.workPercent} onChangeText={(workPercent) => setContractDraft((p) => ({ ...p, workPercent }))} />
              <HrField colors={colors} label="Type" value={contractDraft.employmentType} onChangeText={(employmentType) => setContractDraft((p) => ({ ...p, employmentType }))} />
              <HrField colors={colors} label="Notat" value={contractDraft.notes} onChangeText={(notes) => setContractDraft((p) => ({ ...p, notes }))} multiline />
              <HrButton
                colors={colors}
                label="Lagre kontrakt"
                primary
                icon="ribbon-outline"
                onPress={() => {
                  const startDate = contractDraft.startDate || selected?.company?.periodFrom || new Date().toISOString().slice(0, 10);
                  const row = normalizeContract({
                    ...contractDraft,
                    startDate,
                    employeeId: selected.id,
                    status: 'active',
                  });
                  onPatch?.({ contracts: [row, ...(hr.contracts || [])] });
                  setContractDraft({
                    title: 'Arbeidsavtale',
                    startDate: '',
                    endDate: '',
                    workPercent: '100',
                    employmentType: 'Fast',
                    notes: '',
                  });
                }}
              />
            </View>
          ) : (
            <EmptyHint colors={colors} text="Du har lesetilgang. Endringer gjøres av leder/HR." />
          )}
        </HrCard>
      ) : null}
    </View>
  );
}

function Fact({ colors, label, value }) {
  return (
    <View style={styles.fact}>
      <Text style={[styles.factLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.factValue, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  search: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  fact: { minWidth: '45%', flexGrow: 1, gap: 2 },
  factLabel: { fontSize: 12 },
  factValue: { fontSize: 15, fontWeight: '600' },
  form: { gap: 10, marginTop: 8 },
  formTitle: { fontSize: 14, fontWeight: '600' },
});
