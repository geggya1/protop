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
  upcomingPeopleEvents,
  upsertActiveContract,
  yearsBetween,
} from '../../src/hr/model';
import {
  companyComplianceOverview,
  complianceSummary,
  ensureEmployeeCompliance,
  syncComplianceFromEvidence,
} from '../../src/hr/compliance';
import { EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle, RowLink } from './HrShared';

export default function HrPeople({
  colors, employees, hr, selectedId, onSelect, canWrite, onPatch, onGo,
}) {
  const emptyQuickContract = () => ({
    title: 'Arbeidsavtale',
    startDate: '',
    endDate: '',
    workPercent: '100',
    employmentType: 'Fast',
    notes: '',
  });
  const [query, setQuery] = useState('');
  const [contractDraft, setContractDraft] = useState(emptyQuickContract);
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

  const complianceByEmp = useMemo(
    () => Object.fromEntries(
      companyComplianceOverview(employees, hr.compliance, {
        contracts: hr.contracts,
        reviews: hr.reviews,
        applyEvidence: true,
      }).map((row) => [row.employeeId, row]),
    ),
    [employees, hr.compliance, hr.contracts, hr.reviews],
  );

  const selected = rows.find((row) => row.id === selectedId) || employees.find((row) => row.id === selectedId) || null;
  const contract = selected ? activeContractFor(selected.id, hr.contracts) : null;
  const salary = selected ? currentSalaryFor(selected.id, hr.salaries) : null;
  const tenure = selected ? yearsBetween(selected?.company?.periodFrom) : null;
  const personReviews = selected ? (hr.reviews || []).filter((r) => r.employeeId === selected.id) : [];
  const personCases = selected ? (hr.cases || []).filter((r) => r.employeeId === selected.id && r.status !== 'closed') : [];
  const personTasks = selected ? (hr.tasks || []).filter((r) => r.employeeId === selected.id && r.status !== 'done') : [];
  const personMemos = selected ? (hr.memos || []).filter((r) => r.employeeId === selected.id) : [];
  const personFiles = selected ? (hr.files || []).filter((r) => r.employeeId === selected.id) : [];
  const nextEvents = selected
    ? upcomingPeopleEvents([selected], { withinDays: 366 }).slice(0, 2)
    : [];
  const compliance = selected
    ? complianceSummary(ensureEmployeeCompliance(
      syncComplianceFromEvidence(hr.compliance || [], {
        employeeId: selected.id,
        contracts: hr.contracts || [],
        reviews: hr.reviews || [],
      }),
      selected.id,
    ))
    : null;

  return (
    <View style={styles.page} nativeID="hr-people">
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Personell"
          subtitle="Personalmappe: jubileum, kontrakt, compliance og snareveier"
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
          const gap = complianceByEmp[row.id];
          return (
            <RowLink
              key={row.id}
              colors={colors}
              title={displayName(row)}
              subtitle={[
                row?.company?.title || statusLabel(row?.company?.status),
                hired ? `Ansatt ${empFormatNbDate(hired)}${years != null ? ` · ${years} år` : ''}` : '',
                gap ? `Compliance ${gap.pct} %` : '',
              ].filter(Boolean).join(' · ')}
              meta={c ? (c.aml?.pct != null ? `AML ${c.aml.pct} %` : choiceLabel(CONTRACT_STATUSES, c.status)) : 'Uten kontrakt'}
              onPress={() => {
                onSelect?.(row.id);
                setContractDraft(emptyQuickContract());
              }}
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
            <Fact colors={colors} label="Ansiennitet" value={tenure != null ? `${tenure} år` : '—'} />
            <Fact colors={colors} label="Fødselsdato" value={empFormatNbDate(selected?.person?.birthDate) || '—'} />
            <Fact
              colors={colors}
              label="Kontrakt / AML"
              value={contract
                ? `${choiceLabel(CONTRACT_STATUSES, contract.status)} · AML ${contract.aml?.pct ?? 0} %`
                : 'Ikke registrert'}
            />
            <Fact
              colors={colors}
              label="Lønn"
              value={salary ? formatMoney(salary.annualAmount, salary.currency) : 'Ikke registrert'}
            />
            <Fact
              colors={colors}
              label="Compliance"
              value={compliance ? `${compliance.ok}/${compliance.total} (${compliance.pct} %)` : '—'}
            />
            <Fact colors={colors} label="Åpne saker" value={String(personCases.length)} />
            <Fact colors={colors} label="Oppgaver" value={String(personTasks.length)} />
            <Fact colors={colors} label="Samtaler" value={String(personReviews.length)} />
            <Fact colors={colors} label="Memo" value={String(personMemos.length)} />
            <Fact colors={colors} label="Filer" value={String(personFiles.length)} />
          </View>

          {nextEvents.length ? (
            <View style={styles.block}>
              <Text style={[styles.blockTitle, { color: colors.ink }]}>Neste milepæl</Text>
              {nextEvents.map((event) => (
                <Text key={`${event.type}-${event.date}`} style={[styles.line, { color: colors.muted }]}>
                  {`${event.label} · ${formatNbDate(event.date)} · ${event.days === 0 ? 'i dag' : `${event.days} dager`}`}
                </Text>
              ))}
            </View>
          ) : null}

          {personFiles.slice(0, 4).map((file) => (
            <RowLink
              key={file.id}
              colors={colors}
              title={file.name}
              subtitle={file.kind || 'Dokument'}
              icon="document-attach-outline"
              onPress={() => onGo?.('oppfolging')}
            />
          ))}
          {personMemos.slice(0, 3).map((memo) => (
            <RowLink
              key={memo.id}
              colors={colors}
              title={memo.title}
              subtitle={memo.body}
              meta={memo.employeeVisible ? 'Synlig' : 'HR'}
              icon="document-text-outline"
              onPress={() => onGo?.('oppfolging')}
            />
          ))}
          <View style={styles.chips}>
            <HrChip colors={colors} label="Avtaler" active={false} onPress={() => onGo?.('avtaler')} />
            <HrChip colors={colors} label="Lønn" active={false} onPress={() => onGo?.('lonn')} />
            <HrChip colors={colors} label="Oppfølging" active={false} onPress={() => onGo?.('oppfolging')} />
            <HrChip colors={colors} label="Lov & ISO" active={false} onPress={() => onGo?.('compliance')} />
            <HrChip colors={colors} label="Produktivitet" active={false} onPress={() => onGo?.('produktivitet')} />
          </View>
          {canWrite ? (
            <View style={styles.form}>
              <Text style={[styles.formTitle, { color: colors.ink }]}>Hurtigregistrer kontrakt</Text>
              <Text style={[styles.formHint, { color: colors.muted }]}>
                For OCR/AI, AML-nøkkeldata og skjemamal — bruk Avtaler.
              </Text>
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
                  onPatch?.((state) => {
                    const contracts = upsertActiveContract(state.contracts || [], row);
                    const compliance = syncComplianceFromEvidence(state.compliance || [], {
                      employeeId: selected.id,
                      contracts,
                      reviews: state.reviews || [],
                    });
                    return { contracts, compliance };
                  });
                  setContractDraft(emptyQuickContract());
                }}
              />
              <HrButton
                colors={colors}
                label="Åpne full avtale + OCR"
                icon="scan-outline"
                onPress={() => onGo?.('avtaler')}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  form: { gap: 10, marginTop: 8 },
  formTitle: { fontSize: 14, fontWeight: '600' },
  formHint: { fontSize: 12, lineHeight: 17 },
  block: { gap: 4, marginTop: 4 },
  blockTitle: { fontSize: 14, fontWeight: '600' },
  line: { fontSize: 13, lineHeight: 18 },
});
