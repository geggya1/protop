import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayName } from '../../src/employees/model';
import { saveEmployee } from '../../src/employees/storage';
import {
  activeContractFor,
  formatNbDate,
  normalizeContract,
} from '../../src/hr/model';
import { AML_CONTRACT_FIELDS, amlContractCompleteness } from '../../src/hr/compliance';
import {
  applyContractFieldsToEmployee,
  interpretEmploymentContract,
  parseEmploymentContractText,
} from '../../src/hr/contractOcr';
import { answersToContractFields, employmentContractFormTemplate } from '../../src/hr/forms';
import { saveFormTemplate } from '../../src/anbud/bidLibrary';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle, RowLink,
} from './HrShared';

export default function HrContracts({
  colors, employees, hr, canWrite, onPatch, familyId, selectedEmployeeId, onSelectEmployee,
}) {
  const people = useMemo(
    () => (employees || []).filter((e) => e?.company?.status !== 'deleted'),
    [employees],
  );
  const [employeeId, setEmployeeId] = useState(selectedEmployeeId || people[0]?.id || '');
  const activeId = employeeId || selectedEmployeeId || '';
  const selected = people.find((e) => e.id === activeId) || null;
  const contracts = useMemo(() => (hr.contracts || []).filter((c) => !activeId || c.employeeId === activeId), [hr.contracts, activeId]);
  const active = activeId ? activeContractFor(activeId, hr.contracts) : null;

  const [ocrText, setOcrText] = useState('');
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    title: 'Arbeidsavtale',
    startDate: '',
    endDate: '',
    workPercent: '100',
    employmentType: 'Fast',
    employerName: '',
    employeeName: '',
    workplace: '',
    roleDescription: '',
    salaryAmount: '',
    workHours: '',
    noticePeriod: '',
    probationMonths: '',
    holidayTerms: '',
    documentUrl: '',
    notes: '',
  });

  function setField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  async function runOcr() {
    if (!ocrText.trim()) return;
    setBusy(true);
    try {
      const result = await interpretEmploymentContract({
        familyId,
        text: ocrText,
        filename: 'arbeidsavtale.txt',
      });
      const fields = result.fields || parseEmploymentContractText(ocrText);
      setDraft((prev) => ({
        ...prev,
        ...Object.fromEntries(
          Object.entries(fields).filter(([, v]) => String(v || '').trim()),
        ),
        title: fields.title ? `Arbeidsavtale · ${fields.title}` : prev.title,
        ocrSource: result.source,
      }));
      showSaveToast?.(result.source === 'ai' ? 'Nøkkeldata hentet med AI' : 'Nøkkeldata hentet lokalt');
    } finally {
      setBusy(false);
    }
  }

  async function saveContract() {
    if (!canWrite || !activeId) return;
    const row = normalizeContract({
      ...draft,
      employeeId: activeId,
      status: 'active',
      title: draft.title || draft.roleDescription || 'Arbeidsavtale',
    });
    onPatch?.({ contracts: [row, ...(hr.contracts || []).filter((c) => c.id !== row.id)] });

    if (selected && familyId) {
      try {
        const merged = applyContractFieldsToEmployee(selected, draft);
        await saveEmployee(familyId, merged);
      } catch {
        /* HR-kontrakt er lagret uansett */
      }
    }
    showSaveToast?.('Avtale lagret på person');
  }

  async function ensureFormTemplate() {
    if (!familyId) return;
    try {
      const state = await loadAnbudState(familyId);
      const exists = (state?.formTemplates || []).some((t) => t.title === 'Arbeidsavtale' && t.category === 'avtale');
      if (exists) {
        showSaveToast?.('Mal finnes allerede i skjemabygger');
        return;
      }
      const template = employmentContractFormTemplate();
      const result = saveFormTemplate(state, template);
      if (!result?.ok) {
        showSaveToast?.(result?.error || 'Kunne ikke lagre skjemamal');
        return;
      }
      await saveAnbudState(result.state, familyId);
      showSaveToast?.('Arbeidsavtale-mal lagt i skjemabygger');
    } catch {
      showSaveToast?.('Kunne ikke lagre skjemamal');
    }
  }

  const completeness = amlContractCompleteness(draft);

  return (
    <View style={styles.page}>
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Ansettelsesavtaler"
          subtitle="Lagres på personnivå. OCR/AI fyller AML § 14-6-nøkkeldata automatisk."
        />
        <View style={styles.chips}>
          {people.map((emp) => (
            <HrChip
              key={emp.id}
              colors={colors}
              label={displayName(emp)}
              active={emp.id === activeId}
              onPress={() => {
                setEmployeeId(emp.id);
                onSelectEmployee?.(emp.id);
              }}
            />
          ))}
        </View>
        {active ? (
          <Text style={[styles.line, { color: colors.ink }]}>
            {`Aktiv avtale: ${active.title} · AML-dekning ${active.aml?.pct ?? 0} % · fra ${formatNbDate(active.startDate)}`}
          </Text>
        ) : (
          <EmptyHint colors={colors} text="Ingen aktiv avtale på valgt person." />
        )}
        {contracts.map((row) => (
          <RowLink
            key={row.id}
            colors={colors}
            title={row.title}
            subtitle={`${formatNbDate(row.startDate)} · AML ${row.aml?.pct ?? 0} %`}
            meta={row.status}
            icon="document-text-outline"
            onPress={() => setDraft({
              ...draft,
              ...row,
              title: row.title,
            })}
          />
        ))}
      </HrCard>

      {canWrite && activeId ? (
        <>
          <HrCard colors={colors}>
            <HrSectionTitle colors={colors} title="OCR / AI-skann" subtitle="Lim inn tekst fra PDF eller avtaledokument" />
            <HrField colors={colors} label="Avtaletekst" value={ocrText} onChangeText={setOcrText} multiline />
            <HrButton colors={colors} label={busy ? 'Skanner…' : 'Skann og fyll ut'} primary icon="scan-outline" disabled={busy} onPress={runOcr} />
            <HrButton colors={colors} label="Opprett mal i skjemabygger" icon="clipboard-outline" onPress={ensureFormTemplate} />
          </HrCard>

          <HrCard colors={colors}>
            <HrSectionTitle
              colors={colors}
              title="Nøkkeldata"
              subtitle={`AML-minimum: ${completeness.filled}/${completeness.total} (${completeness.pct} %)`}
            />
            <HrField colors={colors} label="Tittel på avtalen" value={draft.title} onChangeText={(v) => setField('title', v)} />
            {AML_CONTRACT_FIELDS.filter((f) => [
              'employerName', 'employeeName', 'workplace', 'title', 'roleDescription',
              'startDate', 'endDate', 'workPercent', 'salaryAmount', 'workHours',
              'noticePeriod', 'probationMonths', 'holidayTerms', 'passportOrId', 'loanOrAdvance', 'otherTerms',
            ].includes(f.key)).map((field) => (
              <HrField
                key={field.key}
                colors={colors}
                label={field.label}
                value={String(draft[field.key] || '')}
                onChangeText={(v) => setField(field.key, v)}
                multiline={field.key === 'roleDescription' || field.key === 'otherTerms'}
              />
            ))}
            <HrField colors={colors} label="Dokument-URL" value={draft.documentUrl} onChangeText={(v) => setField('documentUrl', v)} />
            <HrButton colors={colors} label="Lagre avtale på person" primary icon="save-outline" onPress={saveContract} />
          </HrCard>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  line: { fontSize: 14, lineHeight: 20 },
});
