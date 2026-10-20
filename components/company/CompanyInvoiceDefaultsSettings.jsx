import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  DUE_DATE_MODE_OPTIONS,
  INVOICE_LANGUAGE_OPTIONS,
  resolveCompanyInvoiceDefaults,
} from '../../src/economy/companyInvoiceDefaults.js';
import { saveCompanyInvoiceDefaults } from '../../src/company/setupState.js';
import { SetupFrame } from './SetupFrame';
import { useCompanyProject } from './useCompanyProject';

function Field({ label, hint, children }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

/**
 * Økonomi → Innstillinger → Faktura- og økonomistandarder.
 * Disse verdiene arves av alle prosjekter med mindre prosjektet overstyrer.
 */
export default function CompanyInvoiceDefaultsSettings({ familyId, colors, canEdit }) {
  const project = useCompanyProject(familyId);
  const [draft, setDraft] = useState(() => resolveCompanyInvoiceDefaults(project.state));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(resolveCompanyInvoiceDefaults(project.state));
  }, [project.state, dirty]);

  function setKey(key, value) {
    setDirty(true);
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    const ok = await project.commit(
      saveCompanyInvoiceDefaults(project.state, draft),
      'Fakturastandarder er lagret. Prosjekter arver verdiene.',
    );
    if (ok) setDirty(false);
  }

  function reset() {
    setDraft(resolveCompanyInvoiceDefaults(project.state));
    setDirty(false);
    project.setError('');
  }

  const input = {
    borderColor: colors.line,
    color: colors.ink,
    backgroundColor: colors.card,
  };

  return (
    <SetupFrame
      colors={colors}
      nativeID="company-invoice-defaults"
      crumbs={[
        { label: 'Økonomi', tab: 'okonomi', page: 'oversikt' },
        { label: 'Innstillinger', tab: 'okonomi', page: 'innstillinger' },
        { label: 'Fakturastandarder' },
      ]}
      title="Faktura- og økonomistandarder"
      note={project.note}
      error={project.error}
    >
      <View
        nativeID="company-invoice-inherit-banner"
        style={[styles.banner, { backgroundColor: colors.brandSoft || '#e8f1ff', borderColor: colors.brand }]}
      >
        <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 20 }}>
          Disse verdiene er selskapets standard. Alle prosjekter åpner med dem under Faktureringsvalg.
          Prosjektet kan overstyre enkeltfelt; tomme prosjektfelt arver alltid hitfra. Endringer gjelder nye fakturaer.
        </Text>
      </View>

      <Text style={[styles.section, { color: colors.ink }]}>Generelle fakturavalg</Text>
      <Field label="Kredittid (dager)" hint="Standardverdi brukt når prosjektet ikke overstyrer.">
        <TextInput
          editable={canEdit}
          keyboardType="numeric"
          value={String(draft.creditDays ?? '')}
          onChangeText={(v) => setKey('creditDays', v)}
          style={[styles.input, input]}
          nativeID="company-invoice-credit-days"
        />
      </Field>
      <Field label="Fakturaspråk">
        <View style={styles.chipRow}>
          {INVOICE_LANGUAGE_OPTIONS.map((row) => {
            const on = draft.invoiceLanguage === row.id;
            return (
              <TouchableOpacity
                key={row.id}
                disabled={!canEdit}
                onPress={() => setKey('invoiceLanguage', row.id)}
                style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : 'transparent' }]}
              >
                <Text style={{ color: colors.ink, fontSize: 13 }}>{row.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Field>
      <Field label="Beregn forfallsdato">
        {DUE_DATE_MODE_OPTIONS.map((row) => {
          const on = draft.dueDateMode === row.id;
          return (
            <TouchableOpacity
              key={row.id}
              disabled={!canEdit}
              onPress={() => setKey('dueDateMode', row.id)}
              style={styles.radio}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
            >
              <Text style={{ color: on ? colors.brand : colors.ink }}>{on ? '●' : '○'} {row.label}</Text>
            </TouchableOpacity>
          );
        })}
      </Field>

      <Text style={[styles.section, { color: colors.ink }]}>Standardtekster</Text>
      <Field label="Standard innledende tekst">
        <TextInput
          editable={canEdit}
          multiline
          value={draft.introText}
          onChangeText={(v) => setKey('introText', v)}
          style={[styles.input, styles.area, input]}
        />
      </Field>
      <Field label="Standard bunntekst">
        <TextInput
          editable={canEdit}
          multiline
          value={draft.footerText}
          onChangeText={(v) => setKey('footerText', v)}
          style={[styles.input, styles.area, input]}
        />
      </Field>

      <Text style={[styles.section, { color: colors.ink }]}>Påslag og rabatter</Text>
      <View style={styles.grid}>
        {[
          ['markupHourly', 'Påslag timepris %'],
          ['markupFixed', 'Påslag fastpris %'],
          ['markupExpenseHourly', 'Påslag utlegg (timepris) %'],
          ['markupExpenseFixed', 'Påslag utlegg (fastpris) %'],
          ['discountHours', 'Rabatt timer %'],
          ['discountProducts', 'Rabatt produkter %'],
          ['adminMarkupPercent', 'Adm.kostnader %'],
          ['adminAmount', 'Adm.kostnader beløp (NOK)'],
        ].map(([key, label]) => (
          <Field key={key} label={label}>
            <TextInput
              editable={canEdit}
              keyboardType="numeric"
              value={String(draft[key] ?? '')}
              onChangeText={(v) => setKey(key, v)}
              style={[styles.input, input]}
            />
          </Field>
        ))}
      </View>

      <Text style={[styles.section, { color: colors.ink }]}>EHF-forsendelse</Text>
      {[
        ['ehfMergePdf', 'Slå sammen PDF-faktura og PDF-vedlegg'],
        ['ehfAlsoEmail', 'Send faktura både som EHF og e-post'],
        ['ehfAttachPdf', 'Legg PDF-versjon ved EHF-faktura'],
      ].map(([key, label]) => (
        <TouchableOpacity
          key={key}
          disabled={!canEdit}
          onPress={() => setKey(key, !draft[key])}
          style={styles.check}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: !!draft[key] }}
        >
          <Text style={{ color: colors.ink }}>{draft[key] ? '☑' : '☐'} {label}</Text>
        </TouchableOpacity>
      ))}

      {canEdit ? (
        <View style={styles.actions}>
          <TouchableOpacity onPress={reset} style={[styles.ghost, { borderColor: colors.line }]} disabled={!dirty}>
            <Text style={{ color: colors.ink }}>Avbryt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={save}
            style={[styles.primary, { backgroundColor: colors.brand, opacity: dirty ? 1 : 0.5 }]}
            disabled={!dirty}
            nativeID="company-invoice-defaults-save"
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SetupFrame>
  );
}

const styles = StyleSheet.create({
  banner: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 18, marginBottom: 10 },
  field: { marginBottom: 12, gap: 4 },
  label: { fontWeight: '600', fontSize: 13 },
  hint: { fontSize: 12, opacity: 0.7, marginBottom: 2 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  area: { minHeight: 80, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  radio: { paddingVertical: 6 },
  check: { paddingVertical: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  ghost: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  primary: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10 },
});
