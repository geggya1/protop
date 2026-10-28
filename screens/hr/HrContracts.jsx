import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { saveEmployee } from '../../src/employees/storage';
import {
  activeContractFor,
  formatNbDate,
  normalizeContract,
  upsertActiveContract,
  upsertRow,
} from '../../src/hr/model';
import {
  AML_CONTRACT_FIELDS,
  amlContractCompleteness,
  amlFieldLabel,
  amlRequiredKeys,
  probationIssues,
  syncComplianceFromEvidence,
  withAmlStandardTexts,
} from '../../src/hr/compliance';
import {
  applyContractFieldsToEmployee,
  interpretEmploymentContract,
  parseEmploymentContractText,
} from '../../src/hr/contractOcr';
import { employmentContractFormTemplate } from '../../src/hr/forms';
import { saveFormTemplate } from '../../src/anbud/bidLibrary';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { DEFAULT_DOCUMENT_ACCEPT, pickDocument, uploadFile } from '../../src/utils/media';
import { showSaveToast } from '../../src/ui/saveToast';
import {
  EmptyHint, HrButton, HrCard, HrField, HrSectionTitle, RowLink,
} from './HrShared';

/** Alle punktene i AML § 14-6 (fra 1.7.2024) kan fylles ut i skjemaet. */
const KEY_FIELDS = AML_CONTRACT_FIELDS.map((field) => field.key);

const MULTILINE_FIELDS = new Set([
  'roleDescription', 'otherTerms', 'terminationProcedure', 'overtimeTerms', 'holidayTerms',
  'competenceDevelopment', 'pensionInsurance',
]);

const EMPTY_CONTRACT_DRAFT = {
  id: '',
  title: 'Arbeidsavtale',
  ...Object.fromEntries(KEY_FIELDS.map((key) => [key, ''])),
  workPercent: '100',
  employmentType: 'Fast',
  documentUrl: '',
  documentName: '',
  notes: '',
};

function draftFromContract(row) {
  if (!row) return { ...EMPTY_CONTRACT_DRAFT };
  return {
    ...EMPTY_CONTRACT_DRAFT,
    ...row,
    id: row.id || '',
    title: row.title || 'Arbeidsavtale',
    documentName: row.documentName || row.attachments?.[0]?.name || '',
  };
}

export default function HrContracts({
  colors, employees, hr, canWrite, onPatch, familyId, lockedEmployeeId,
}) {
  const activeId = String(lockedEmployeeId || '');
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const selected = (employees || []).find((row) => row.id === activeId) || null;
  const contracts = useMemo(
    () => (hr.contracts || []).filter((row) => row.employeeId === activeId),
    [hr.contracts, activeId],
  );
  const active = activeId ? activeContractFor(activeId, hr.contracts) : null;

  const [ocrText, setOcrText] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_CONTRACT_DRAFT);

  useEffect(() => {
    setComposerOpen(false);
    setOcrText('');
    setDraft(EMPTY_CONTRACT_DRAFT);
  }, [activeId]);

  function setField(key, value) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  function openNew() {
    setDraft({ ...EMPTY_CONTRACT_DRAFT });
    setOcrText('');
    setComposerOpen(true);
  }

  function openExisting(row) {
    setDraft(draftFromContract(row));
    setOcrText('');
    setComposerOpen(true);
  }

  async function runOcr() {
    if (!ocrText.trim()) return;
    const forEmployeeId = activeIdRef.current;
    setBusy(true);
    try {
      const result = await interpretEmploymentContract({
        familyId,
        text: ocrText,
        filename: 'arbeidsavtale.txt',
      });
      if (forEmployeeId && forEmployeeId !== activeIdRef.current) {
        showSaveToast?.('OCR avbrutt — person byttet');
        return;
      }
      const fields = result.fields || parseEmploymentContractText(ocrText);
      setDraft((prev) => {
        const positionTitle = fields.positionTitle || fields.title || '';
        const mapped = Object.fromEntries(
          Object.entries(fields).filter(([key, value]) => key !== 'title' && String(value || '').trim()),
        );
        return {
          ...prev,
          ...mapped,
          positionTitle: positionTitle || prev.positionTitle,
          title: positionTitle ? `Arbeidsavtale · ${positionTitle}` : prev.title,
          ocrSource: result.source,
        };
      });
      showSaveToast?.(result.source === 'ai' ? 'Nøkkeldata hentet med AI' : 'Nøkkeldata hentet lokalt');
    } finally {
      setBusy(false);
    }
  }

  async function attachFile() {
    if (!canWrite || !activeId || !familyId || uploading) return;
    const forEmployeeId = activeIdRef.current;
    setUploading(true);
    try {
      const picked = await pickDocument({ accept: DEFAULT_DOCUMENT_ACCEPT });
      if (!picked) return;
      const path = `families/${familyId}/hr/${forEmployeeId}/${Date.now()}_${picked.name || 'avtale'}`;
      const url = await uploadFile(path, picked, picked.mimeType || 'application/octet-stream');
      if (forEmployeeId !== activeIdRef.current) {
        showSaveToast?.('Opplasting avbrutt — person byttet');
        return;
      }
      setDraft((prev) => ({
        ...prev,
        documentUrl: url,
        documentName: picked.name || 'Avtale',
      }));
      showSaveToast?.('Avtale lastet opp');
    } catch {
      showSaveToast?.('Kunne ikke laste opp avtale');
    } finally {
      setUploading(false);
    }
  }

  async function saveContract() {
    if (!canWrite || !activeId) return;
    const existingId = String(draft.id || '').trim();
    const prior = existingId
      ? (hr.contracts || []).find((row) => row.id === existingId)
      : null;
    const keepStatus = prior && prior.status && prior.status !== 'active'
      ? prior.status
      : 'active';
    const attachments = Array.isArray(draft.attachments) ? [...draft.attachments] : [];
    if (draft.documentUrl && !attachments.some((row) => row.url === draft.documentUrl)) {
      attachments.push({
        name: draft.documentName || 'Avtale',
        url: draft.documentUrl,
      });
    }
    const row = normalizeContract({
      ...draft,
      attachments,
      id: existingId || undefined,
      employeeId: activeId,
      status: keepStatus,
      title: draft.title || draft.positionTitle || 'Arbeidsavtale',
    });
    onPatch?.((state) => {
      const nextContracts = keepStatus === 'active'
        ? upsertActiveContract(state.contracts || [], row)
        : upsertRow(state.contracts || [], row, normalizeContract);
      const compliance = syncComplianceFromEvidence(state.compliance || [], {
        employeeId: activeId,
        contracts: nextContracts,
        reviews: state.reviews || [],
        hmsCards: state.hmsCards || [],
      });
      return { contracts: nextContracts, compliance };
    });
    setComposerOpen(false);
    setDraft(EMPTY_CONTRACT_DRAFT);

    if (selected && familyId) {
      try {
        const merged = applyContractFieldsToEmployee(selected, draft);
        await saveEmployee(familyId, merged);
      } catch {
        /* HR-kontrakt er lagret uansett */
      }
    }
    showSaveToast?.(
      row.aml?.pct >= 100
        ? 'Avtale lagret · AML og compliance oppdatert'
        : `Avtale lagret på person · mangler ${row.aml?.missing?.length || 0} punkter etter AML § 14-6`,
    );
  }

  async function ensureFormTemplate() {
    if (!familyId) return;
    try {
      const state = await loadAnbudState(familyId);
      const exists = (state?.formTemplates || []).some((row) => row.title === 'Arbeidsavtale' && row.category === 'avtale');
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
  const required = new Set(amlRequiredKeys(draft));
  const probation = probationIssues(draft);
  const previewUrl = /^https?:\/\//i.test(String(draft.documentUrl || '')) ? draft.documentUrl : '';

  if (!activeId) {
    return (
      <HrCard colors={colors}>
        <EmptyHint colors={colors} text="Velg en ansatt i personellisten for å registrere avtale." />
      </HrCard>
    );
  }

  return (
    <View style={styles.page} nativeID="hr-employee-contract">
      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Ansettelsesavtale"
          subtitle="Avtalen ligger på denne personen."
        />
        {active ? (
          <Text style={[styles.line, { color: colors.ink }]}>
            {`Aktiv avtale: ${active.title} · AML-dekning ${active.aml?.pct ?? 0} % · fra ${formatNbDate(active.startDate)}`}
          </Text>
        ) : (
          <EmptyHint colors={colors} text="Ingen avtale registrert." />
        )}
        {contracts.map((row) => (
          <RowLink
            key={row.id}
            colors={colors}
            title={row.title}
            subtitle={`${formatNbDate(row.startDate)} · AML ${row.aml?.pct ?? 0} %`}
            meta={row.status}
            icon="document-text-outline"
            onPress={() => openExisting(row)}
          />
        ))}
        {canWrite && !composerOpen ? (
          <HrButton
            colors={colors}
            label="Registrer avtale"
            primary
            icon="add-outline"
            onPress={openNew}
          />
        ) : null}
      </HrCard>

      {canWrite && composerOpen ? (
        <HrCard colors={colors}>
          <HrSectionTitle
            colors={colors}
            title="Registrer avtale"
            subtitle={`AML § 14-6 (fra 1.7.2024): ${completeness.filled}/${completeness.total} (${completeness.pct} %). Felt med * er påkrevd.`}
          />
          {completeness.missing.length ? (
            <Text style={[styles.line, { color: colors.muted }]} nativeID="hr-contract-missing">
              {`Mangler: ${completeness.missing.map(amlFieldLabel).join(' · ')}. «Lovpålagt» blir grønn først når disse er fylt ut.`}
            </Text>
          ) : null}
          {probation.map((message) => (
            <Text key={message} style={[styles.line, { color: colors.danger }]} nativeID="hr-contract-probation">{message}</Text>
          ))}
          <View style={styles.split}>
            <View style={styles.pane}>
              <HrButton
                colors={colors}
                label="Fyll tomme felt med standardtekst etter loven"
                icon="document-text-outline"
                nativeID="hr-contract-standard-texts"
                onPress={() => setDraft((prev) => withAmlStandardTexts(prev))}
              />
              <Text style={[styles.line, { color: colors.muted, fontSize: 12 }]}>
                Gjelder ferie, opphør og søksmålsfrister, overtid, kompetanseutvikling og pensjon. Kontroller teksten mot bedriftens ordninger før avtalen signeres.
              </Text>
              <HrField colors={colors} label="Tittel på avtalen" value={draft.title} onChangeText={(value) => setField('title', value)} />
              {AML_CONTRACT_FIELDS.filter((field) => KEY_FIELDS.includes(field.key)).map((field) => (
                <HrField
                  key={field.key}
                  colors={colors}
                  label={required.has(field.key) ? `${field.label} *` : field.label}
                  value={String(draft[field.key] || '')}
                  onChangeText={(value) => setField(field.key, value)}
                  multiline={MULTILINE_FIELDS.has(field.key)}
                />
              ))}
              <HrButton colors={colors} label="Lagre avtale på person" primary icon="save-outline" onPress={saveContract} />
              <HrButton colors={colors} label="Avbryt" onPress={() => setComposerOpen(false)} />
            </View>
            <View style={styles.pane}>
              <Text style={[styles.paneTitle, { color: colors.ink }]}>Avtalen</Text>
              <HrButton
                colors={colors}
                label={uploading ? 'Laster opp…' : 'Last opp avtale'}
                icon="cloud-upload-outline"
                disabled={uploading}
                onPress={attachFile}
              />
              <HrField
                colors={colors}
                label="Lim inn tekst fra PDF eller avtaledokument"
                value={ocrText}
                onChangeText={setOcrText}
                multiline
              />
              <HrButton
                colors={colors}
                label={busy ? 'Skanner…' : 'Skann og fyll ut'}
                primary
                icon="scan-outline"
                disabled={busy}
                onPress={runOcr}
              />
              <HrButton colors={colors} label="Opprett mal i skjemabygger" icon="clipboard-outline" onPress={ensureFormTemplate} />
              {draft.documentName ? (
                <Text style={[styles.line, { color: colors.muted }]}>{draft.documentName}</Text>
              ) : null}
              {Platform.OS === 'web' && previewUrl ? (
                React.createElement('iframe', {
                  src: previewUrl,
                  title: 'Forhåndsvisning av avtale',
                  style: {
                    width: '100%',
                    height: 520,
                    border: `1px solid ${colors.line || '#e5e7eb'}`,
                    borderRadius: 10,
                    background: '#fff',
                  },
                })
              ) : (
                <ScrollView style={[styles.preview, { borderColor: colors.line, backgroundColor: colors.bg }]}>
                  <Text style={[styles.previewText, { color: colors.ink }]}>
                    {ocrText.trim()
                      ? ocrText
                      : 'Forhåndsvisning av avtalen vises her etter opplasting, eller som innlimt tekst.'}
                  </Text>
                </ScrollView>
              )}
            </View>
          </View>
        </HrCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  line: { fontSize: 14, lineHeight: 20 },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  pane: { flex: 1, minWidth: 280, gap: 10 },
  paneTitle: { fontSize: 15, fontWeight: '600' },
  preview: { maxHeight: 520, minHeight: 220, borderWidth: 1, borderRadius: 10, padding: 12 },
  previewText: { fontSize: 13, lineHeight: 18 },
});
