import React, { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { updateProject } from '../../src/project/engine.js';
import {
  PRICING_MODELS,
  emptyPricingSettings,
  normalizePricingSettings,
  pricingModelLabel,
} from '../../src/project/projectFields.js';
import {
  labelForDefault,
  TRI_BOOL_OPTIONS,
  INVOICE_LANGUAGE_OPTIONS,
  DUE_DATE_MODE_OPTIONS,
} from '../../src/economy/companyInvoiceDefaults.js';
import {
  patchProjectInvoiceSetting,
  resolveProjectInvoiceSettings,
  restoreProjectInvoiceDefaults,
} from '../../src/project/invoiceSettings.js';
import { resolveCompanyAccounts, accountOptionLabel } from '../../src/economy/companyChart.js';
import { showSaveToast } from '../../src/ui/saveToast';

const MENU_CARDS = [
  { id: 'tekster', icon: 'document-text-outline', title: 'Standard fakturatekster', sub: 'Definer standardtekster som foreslås på fakturaer.' },
  { id: 'generelt', icon: 'options-outline', title: 'Generelle fakturavalg', sub: 'Velg hvordan dette prosjektet skal faktureres.' },
  { id: 'linjer', icon: 'list-outline', title: 'Fakturalinjer', sub: 'Innstillinger for time-, produkt- og utleggslinjer.' },
  { id: 'sammendrag', icon: 'stats-chart-outline', title: 'Faktureringssammendrag', sub: 'Hvordan informasjon grupperes på faktura.' },
  { id: 'timespec', icon: 'time-outline', title: 'Timespesifikasjoner og vedlegg', sub: 'Innstillinger for timelister og dokumentasjon.' },
  { id: 'paslag', icon: 'trending-up-outline', title: 'Standard påslag for prismodeller', sub: 'Påslag for timer, utlegg og produkter.' },
  { id: 'rabatter', icon: 'pricetag-outline', title: 'Rabatter', sub: 'Prosjektspesifikke rabatter.' },
  { id: 'admin', icon: 'briefcase-outline', title: 'Administrasjonskostnader', sub: 'Eventuelle tilleggskostnader.' },
  { id: 'kontoer', icon: 'wallet-outline', title: 'Regnskapskontoer og MVA', sub: 'Kontoer, mva-satser og bokføringsinnstillinger.' },
  { id: 'regnskap', icon: 'business-outline', title: 'Regnskapsavdeling og regnskapsprosjekt', sub: 'Tilknytning mot regnskapssystem.' },
  { id: 'ehf', icon: 'send-outline', title: 'Fakturaforsendelse per EHF', sub: 'Innstillinger for elektronisk fakturaforsendelse.' },
];

/**
 * Faktureringsvalg: prismodell + prosjektinnstillinger som arver fra Økonomi.
 */
const PROJECT_SETTING_BUTTONS = [
  { id: 'prismodell', icon: 'cash-outline', title: 'Prismodell' },
  { id: 'tekster', icon: 'document-text-outline', title: 'Fakturatekster' },
  { id: 'generelt', icon: 'options-outline', title: 'Generelle valg' },
  { id: 'linjer', icon: 'list-outline', title: 'Fakturalinjer' },
  { id: 'paslag', icon: 'trending-up-outline', title: 'Påslag & rabatter' },
  { id: 'kontoer', icon: 'wallet-outline', title: 'Kontoer' },
  { id: 'ehf', icon: 'send-outline', title: 'EHF' },
];

export default function ProjectBillingTab({
  state,
  project,
  activities = [],
  colors,
  isAdmin,
  onChangeState,
  onOpenEconomySettings,
}) {
  const [scope, setScope] = useState('project'); // project | company
  const [sub, setSub] = useState('oversikt'); // oversikt | prismodell | section ids
  const resolved = useMemo(() => resolveProjectInvoiceSettings(state, project), [state, project]);
  const [pricingDraft, setPricingDraft] = useState(() => ({
    pricingModel: project.pricingModel || 'hourly',
    pricingSettings: normalizePricingSettings(project.pricingSettings, project.pricingModel),
  }));
  const [invoiceDraft, setInvoiceDraft] = useState(() => resolved.project);
  const [error, setError] = useState('');

  function reloadDrafts() {
    setPricingDraft({
      pricingModel: project.pricingModel || 'hourly',
      pricingSettings: normalizePricingSettings(project.pricingSettings, project.pricingModel),
    });
    setInvoiceDraft(resolveProjectInvoiceSettings(state, project).project);
  }

  function openProjectSection(id) {
    setScope('project');
    setSub(id);
    reloadDrafts();
  }

  function savePricing() {
    const result = updateProject(state, project.id, {
      pricingModel: pricingDraft.pricingModel,
      pricingSettings: normalizePricingSettings(pricingDraft.pricingSettings, pricingDraft.pricingModel),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    setError('');
    showSaveToast('Prismodell lagret.');
  }

  function saveInvoice() {
    const result = updateProject(state, project.id, { invoiceSettings: invoiceDraft });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onChangeState(result.state);
    setError('');
    showSaveToast('Fakturainnstillinger lagret.');
  }

  function restoreDefaults() {
    const next = restoreProjectInvoiceDefaults(invoiceDraft);
    setInvoiceDraft(next);
    const result = updateProject(state, project.id, { invoiceSettings: next });
    if (result.ok) {
      onChangeState(result.state);
      showSaveToast('Tilbakestilt til selskapstandard.');
    }
  }

  function setInvoiceField(key, value) {
    setInvoiceDraft((current) => patchProjectInvoiceSetting(current, key, value));
  }

  function setPricingField(key, value) {
    setPricingDraft((current) => ({
      ...current,
      pricingSettings: { ...emptyPricingSettings(), ...current.pricingSettings, [key]: value },
    }));
  }

  const projectActivities = activities.filter((row) => row.projectId === project.id);
  const overrideCount = resolved.overridden.length;
  const pricing = normalizePricingSettings(project.pricingSettings, project.pricingModel);

  return (
    <View style={styles.wrap} nativeID="project-billing-tab">
      <View style={styles.scopeTabs}>
        {[
          { id: 'project', label: 'Prosjektspesifikk', hint: 'Her retter du prosjektet' },
          { id: 'company', label: 'Selskapsspesifikk', hint: 'Leses fra Økonomi — ikke her' },
        ].map((row) => {
          const on = scope === row.id;
          return (
            <TouchableOpacity
              key={row.id}
              onPress={() => { setScope(row.id); setSub('oversikt'); reloadDrafts(); }}
              style={[
                styles.scopeTab,
                {
                  borderColor: on ? colors.brand : colors.line,
                  backgroundColor: on ? colors.brandSoft : colors.card,
                },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              nativeID={`project-billing-scope-${row.id}`}
            >
              <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: '700', fontSize: 13 }}>{row.label}</Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>{row.hint}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {scope === 'project' ? (
        <View
          nativeID="project-billing-inherit-banner"
          style={[styles.banner, { backgroundColor: colors.brandSoft || '#e8f1ff', borderColor: colors.brand }]}
        >
          <Text style={{ color: colors.ink, fontSize: 12, lineHeight: 18 }}>
            Prosjekt <Text style={{ fontWeight: '700' }}>{project.name}</Text> overstyrer selskapstandard der felt er fylt ut.
            Tomme felt arver fra Økonomi. {resolved.sourceLabel}.
          </Text>
        </View>
      ) : (
        <View
          style={[styles.banner, { backgroundColor: colors.sunken || '#f1f5f9', borderColor: colors.line }]}
          nativeID="project-billing-company-banner"
        >
          <Text style={{ color: colors.ink, fontSize: 12, lineHeight: 18 }}>
            Dette er selskapets standardverdier fra{' '}
            <Text style={{ color: colors.brand, fontWeight: '700' }} onPress={onOpenEconomySettings}>
              Økonomi → Innstillinger
            </Text>
            . Endre dem der — ikke under prosjektet — med mindre du vil overstyre i Prosjektspesifikk.
          </Text>
        </View>
      )}

      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      {scope === 'company' ? (
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]} nativeID="project-billing-company-panel">
          <View style={styles.companyHead}>
            <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 14 }}>Selskapsspesifikke verdier</Text>
            <TouchableOpacity onPress={onOpenEconomySettings} style={[styles.openEco, { borderColor: colors.brand }]}>
              <Ionicons name="open-outline" size={14} color={colors.brand} />
              <Text style={{ color: colors.brand, fontWeight: '600', fontSize: 12 }}>Åpne Økonomi</Text>
            </TouchableOpacity>
          </View>
          {[
            ['Kredittid', `${resolved.company.creditDays} dager`],
            ['Fakturaspråk', labelForDefault('invoiceLanguage', resolved.company.invoiceLanguage)],
            ['Forfall', labelForDefault('dueDateMode', resolved.company.dueDateMode)],
            ['Påslag utlegg (timepris)', `${resolved.company.markupExpenseHourly}%`],
            ['Påslag timer', `${resolved.company.markupHourly}%`],
            ['Rabatt timer', `${resolved.company.discountHours}%`],
            ['EHF + e-post', resolved.company.ehfAlsoEmail ? 'Ja' : 'Nei'],
            ['Konto timer', resolved.accountLabels.accountHours],
            ['Konto utlegg', resolved.accountLabels.accountExpenses],
            ['Konto produkter', resolved.accountLabels.accountProducts],
          ].map(([label, value]) => (
            <View key={label} style={[styles.kv, { borderColor: colors.line }]}>
              <Text style={{ color: colors.muted, fontSize: 12, width: 160 }}>{label}</Text>
              <Text style={{ color: colors.ink, fontSize: 12, flex: 1, fontWeight: '600' }}>{value}</Text>
            </View>
          ))}
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>
            Disse verdiene er lagret på selskapet og hentes hit for oversikt. Ikke rediger her.
          </Text>
        </View>
      ) : null}

      {scope === 'project' && sub === 'oversikt' ? (
        <View style={{ gap: 10 }}>
          <View style={styles.btnRow}>
            {PROJECT_SETTING_BUTTONS.map((btn) => (
              <TouchableOpacity
                key={btn.id}
                onPress={() => openProjectSection(btn.id)}
                style={[styles.setBtn, { borderColor: colors.line, backgroundColor: colors.card }]}
              >
                <Ionicons name={btn.icon} size={16} color={colors.brand} />
                <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '600' }}>{btn.title}</Text>
              </TouchableOpacity>
            ))}
            {isAdmin ? (
              <TouchableOpacity onPress={restoreDefaults} style={[styles.setBtn, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Ionicons name="refresh" size={16} color={colors.ink} />
                <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '600' }}>Gjenopprett standard</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]} nativeID="project-billing-project-overview">
            <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 14, marginBottom: 8 }}>
              Prosjektspesifikk oversikt
            </Text>
            <View style={[styles.kv, { borderColor: colors.line }]}>
              <Text style={{ color: colors.muted, fontSize: 12, width: 160 }}>Prismodell</Text>
              <Text style={{ color: colors.ink, fontSize: 12, flex: 1, fontWeight: '600' }}>
                {pricingModelLabel(project.pricingModel) || 'Ikke satt'}
                {pricing.hourlyRate != null ? ` · ${pricing.hourlyRate} kr` : ''}
              </Text>
            </View>
            <View style={[styles.kv, { borderColor: colors.line }]}>
              <Text style={{ color: colors.muted, fontSize: 12, width: 160 }}>Overstyringer</Text>
              <Text style={{ color: colors.ink, fontSize: 12, flex: 1, fontWeight: '600' }}>
                {overrideCount ? `${overrideCount} felt overstyrt` : 'Ingen — arver hele selskapstandarden'}
              </Text>
            </View>
            {[
              ['Kredittid', resolved.project.creditDays == null ? `Arver (${resolved.company.creditDays} d)` : `${resolved.project.creditDays} d`],
              ['Påslag utlegg', pricing.markupExpenses == null ? `Arver (${resolved.company.markupExpenseHourly}%)` : `${pricing.markupExpenses}%`],
              ['Deres referanse', resolved.project.theirReference || '—'],
              ['Innledning', resolved.project.introText == null ? 'Arver selskapstekst' : (resolved.project.introText || '(tom overstyring)')],
            ].map(([label, value]) => (
              <View key={label} style={[styles.kv, { borderColor: colors.line }]}>
                <Text style={{ color: colors.muted, fontSize: 12, width: 160 }}>{label}</Text>
                <Text style={{ color: colors.ink, fontSize: 12, flex: 1 }} numberOfLines={2}>{value}</Text>
              </View>
            ))}
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>
              Bruk knappene over for å endre prosjektverdier. Se «Selskapsspesifikk» for det som ikke skal endres her.
            </Text>
          </View>

          <View style={styles.cardGrid}>
            {MENU_CARDS.map((card) => (
              <TouchableOpacity
                key={card.id}
                onPress={() => openProjectSection(card.id)}
                style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.line }]}
              >
                <Ionicons name={card.icon} size={18} color={colors.brand} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13 }}>{card.title}</Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>{card.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.brand} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}

      {scope === 'project' && sub !== 'oversikt' ? (
        <TouchableOpacity onPress={() => setSub('oversikt')} style={styles.backLink}>
          <Ionicons name="arrow-back" size={14} color={colors.brand} />
          <Text style={{ color: colors.brand, fontWeight: '600', fontSize: 12 }}>Tilbake til prosjektspesifikk oversikt</Text>
        </TouchableOpacity>
      ) : null}

      {scope === 'project' && sub === 'prismodell' ? (
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <FormRow label="Navn">
            <Text style={{ color: colors.ink }}>{project.name}</Text>
          </FormRow>
          <FormRow label="Prismodell">
            <View style={styles.chipRow}>
              {PRICING_MODELS.map((row) => {
                const on = pricingDraft.pricingModel === row.id;
                return (
                  <TouchableOpacity
                    key={row.id}
                    disabled={!isAdmin}
                    onPress={() => setPricingDraft((c) => ({ ...c, pricingModel: row.id }))}
                    style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : 'transparent' }]}
                  >
                    <Text style={{ color: colors.ink, fontSize: 12 }}>{row.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FormRow>
          <FormRow label="Aktiviteter">
            <View style={styles.chipRow}>
              {projectActivities.map((row) => {
                const selected = (pricingDraft.pricingSettings.activityIds || []).includes(row.id);
                return (
                  <TouchableOpacity
                    key={row.id}
                    disabled={!isAdmin}
                    onPress={() => {
                      const current = pricingDraft.pricingSettings.activityIds || [];
                      const next = selected ? current.filter((id) => id !== row.id) : [...current, row.id];
                      setPricingField('activityIds', next);
                    }}
                    style={[styles.chip, { borderColor: selected ? colors.brand : colors.line, backgroundColor: selected ? colors.brandSoft : 'transparent' }]}
                  >
                    <Text style={{ color: colors.ink, fontSize: 12 }}>{row.name}</Text>
                  </TouchableOpacity>
                );
              })}
              {!projectActivities.length ? <Text style={{ color: colors.muted }}>Ingen aktiviteter</Text> : null}
            </View>
          </FormRow>
          <FormRow label="Kunde">
            <Text style={{ color: colors.ink }}>{project.client || '—'}</Text>
          </FormRow>
          <FormRow label="Sannsynlighet">
            <TextInput
              editable={isAdmin}
              keyboardType="numeric"
              value={String(pricingDraft.pricingSettings.probability ?? 100)}
              onChangeText={(v) => setPricingField('probability', v)}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
            />
          </FormRow>
          {pricingDraft.pricingModel === 'hourly' ? (
            <FormRow label="Ens timepris" hint="Definerer timepris for salgsprisestimering og prosjektplan.">
              <TextInput
                editable={isAdmin}
                keyboardType="numeric"
                value={pricingDraft.pricingSettings.hourlyRate == null ? '' : String(pricingDraft.pricingSettings.hourlyRate)}
                onChangeText={(v) => setPricingField('hourlyRate', v)}
                style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
                nativeID="project-billing-hourly-rate"
              />
            </FormRow>
          ) : null}
          {pricingDraft.pricingModel === 'fixed' ? (
            <FormRow label="Fastpris">
              <TextInput
                editable={isAdmin}
                keyboardType="numeric"
                value={pricingDraft.pricingSettings.fixedFee == null ? '' : String(pricingDraft.pricingSettings.fixedFee)}
                onChangeText={(v) => setPricingField('fixedFee', v)}
                style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
              />
            </FormRow>
          ) : null}
          <FormRow label="Estimert totalhonorar">
            <TextInput
              editable={isAdmin}
              keyboardType="numeric"
              value={pricingDraft.pricingSettings.estimatedTotalFee == null ? '' : String(pricingDraft.pricingSettings.estimatedTotalFee)}
              onChangeText={(v) => setPricingField('estimatedTotalFee', v)}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
            />
          </FormRow>
          <FormRow label="Vises i Til fakturering">
            <Check
              colors={colors}
              label="Fakturerbare utlegg"
              value={pricingDraft.pricingSettings.showBillableExpenses !== false}
              onChange={(v) => setPricingField('showBillableExpenses', v)}
              disabled={!isAdmin}
            />
            <Check
              colors={colors}
              label="Fakturerbare produktsalg"
              value={pricingDraft.pricingSettings.showBillableSales !== false}
              onChange={(v) => setPricingField('showBillableSales', v)}
              disabled={!isAdmin}
            />
          </FormRow>
          <FormRow label="Påslag på fakturerte timer %">
            <TextInput
              editable={isAdmin}
              keyboardType="numeric"
              value={String(pricingDraft.pricingSettings.markupHours ?? 0)}
              onChangeText={(v) => setPricingField('markupHours', v)}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
            />
          </FormRow>
          <FormRow
            label="Påslag på fakturerte utlegg %"
            hint={`Selskapstandard: ${resolved.company.markupExpenseHourly}% — la stå tom for «standard».`}
          >
            <TextInput
              editable={isAdmin}
              keyboardType="numeric"
              value={pricingDraft.pricingSettings.markupExpenses == null ? '' : String(pricingDraft.pricingSettings.markupExpenses)}
              onChangeText={(v) => setPricingField('markupExpenses', v === '' ? null : v)}
              placeholder={`standard (${resolved.company.markupExpenseHourly})`}
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
            />
          </FormRow>
          <FormRow label="Sett importerte utlegg som fakturerbare">
            <View style={styles.seg}>
              {[
                { id: 'yes', label: 'Ja' },
                { id: 'no', label: 'Nei' },
                { id: 'standard', label: 'standard' },
              ].map((opt) => {
                const on = (pricingDraft.pricingSettings.importedExpensesBillable || 'standard') === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    disabled={!isAdmin}
                    onPress={() => setPricingField('importedExpensesBillable', opt.id)}
                    style={[styles.segBtn, { backgroundColor: on ? colors.sunken || colors.line : 'transparent', borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink, fontSize: 12 }}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </FormRow>
          <FormRow label="Kommentar">
            <TextInput
              editable={isAdmin}
              multiline
              value={pricingDraft.pricingSettings.note || ''}
              onChangeText={(v) => setPricingField('note', v)}
              style={[styles.input, styles.area, { color: colors.ink, borderColor: colors.line }]}
            />
          </FormRow>
          {isAdmin ? (
            <TouchableOpacity onPress={savePricing} style={[styles.save, { backgroundColor: colors.brand }]} nativeID="project-billing-save-pricing">
              <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {scope === 'project' && sub !== 'oversikt' && sub !== 'prismodell' ? (
        <InvoiceSettingsForm
          section={sub === 'innstillinger' ? 'all' : sub}
          colors={colors}
          isAdmin={isAdmin}
          draft={invoiceDraft}
          company={resolved.company}
          accounts={resolveCompanyAccounts(state)}
          onChange={setInvoiceField}
          onSave={saveInvoice}
        />
      ) : null}
    </View>
  );
}

function InvoiceSettingsForm({
  section,
  colors,
  isAdmin,
  draft,
  company,
  accounts,
  onChange,
  onSave,
}) {
  const show = (id) => section === 'all' || section === id;
  return (
    <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.line }]} nativeID="project-invoice-settings-form">
      {show('tekster') || show('all') ? (
        <>
          <Text style={[styles.section, { color: colors.ink }]}>Standard fakturatekster</Text>
          {[
            ['theirReference', 'Deres referanse'],
            ['orderReference', 'Ordrereferanse'],
            ['contractReference', 'Kontraktreferanse'],
            ['addressLineAbove', 'Tilleggslinje over selskapsnavn'],
            ['addressLineBelow', 'Tilleggslinje under selskapsnavn'],
          ].map(([key, label]) => (
            <FormRow key={key} label={label}>
              <TextInput
                editable={isAdmin}
                value={draft[key] || ''}
                onChangeText={(v) => onChange(key, v)}
                style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
              />
            </FormRow>
          ))}
          <FormRow label="Standard innledende tekst" hint={`standardverdi: ${company.introText || '(tom)'}`}>
            <TextInput
              editable={isAdmin}
              multiline
              value={draft.introText == null ? '' : draft.introText}
              onChangeText={(v) => onChange('introText', v === '' ? null : v)}
              placeholder="Bruk standardinnstillinger"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.area, { color: colors.ink, borderColor: colors.line }]}
            />
          </FormRow>
          <FormRow label="Standard bunntekst" hint={`standardverdi: ${company.footerText || '(tom)'}`}>
            <TextInput
              editable={isAdmin}
              multiline
              value={draft.footerText == null ? '' : draft.footerText}
              onChangeText={(v) => onChange('footerText', v === '' ? null : v)}
              placeholder="Bruk standardinnstillinger"
              placeholderTextColor={colors.muted}
              style={[styles.input, styles.area, { color: colors.ink, borderColor: colors.line }]}
            />
          </FormRow>
        </>
      ) : null}

      {show('generelt') || show('all') ? (
        <>
          <Text style={[styles.section, { color: colors.ink }]}>Generelle fakturavalg</Text>
          <FormRow label="Kredittid" hint={`standardverdi: ${company.creditDays} dager`}>
            <TextInput
              editable={isAdmin}
              keyboardType="numeric"
              value={draft.creditDays == null ? '' : String(draft.creditDays)}
              onChangeText={(v) => onChange('creditDays', v === '' ? null : v)}
              placeholder={`Bruk standard (${company.creditDays})`}
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
              nativeID="project-invoice-credit-days"
            />
          </FormRow>
          <FormRow label="Fakturaspråk" hint={`standardverdi: ${labelForDefault('invoiceLanguage', company.invoiceLanguage)}`}>
            <TriSelect
              colors={colors}
              value={draft.invoiceLanguage}
              options={[{ id: 'inherit', label: 'Bruk standardinnstillinger' }, ...INVOICE_LANGUAGE_OPTIONS]}
              onChange={(v) => onChange('invoiceLanguage', v === 'inherit' ? null : v)}
              disabled={!isAdmin}
            />
          </FormRow>
          <FormRow label="Beregn forfallsdato">
            <TriSelect
              colors={colors}
              value={draft.dueDateMode}
              options={[{ id: 'inherit', label: 'Bruk standardinnstillinger' }, ...DUE_DATE_MODE_OPTIONS]}
              onChange={(v) => onChange('dueDateMode', v === 'inherit' ? null : v)}
              disabled={!isAdmin}
            />
          </FormRow>
        </>
      ) : null}

      {show('linjer') || show('all') ? (
        <>
          <Text style={[styles.section, { color: colors.ink }]}>Fakturalinjer</Text>
          {[
            ['showPeriod', 'Vis periode for fakturalinjer'],
            ['showUnit', 'Vis enhet for PDF-fakturalinjer'],
            ['showSubtotal', 'Vis subtotal per fakturalinjegruppe'],
          ].map(([key, label]) => (
            <FormRow key={key} label={label} hint={`standardverdi: ${labelForDefault(key, company[key])}`}>
              <TriBool colors={colors} value={draft[key]} onChange={(v) => onChange(key, v)} disabled={!isAdmin} />
            </FormRow>
          ))}
          <FormRow label="Standard fakturalinjetekst for timer">
            <TextInput
              editable={isAdmin}
              value={draft.standardLineTextHours == null ? '' : draft.standardLineTextHours}
              onChangeText={(v) => onChange('standardLineTextHours', v === '' ? null : v)}
              placeholder="Bruk standard"
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
            />
          </FormRow>
        </>
      ) : null}

      {show('sammendrag') || show('timespec') || show('all') ? (
        <>
          <Text style={[styles.section, { color: colors.ink }]}>Sammendrag og timespesifikasjon</Text>
          {[
            ['includeExpensesInSummary', 'Inkluder utlegg i sammendrag'],
            ['includeSalesInSummary', 'Inkluder produktsalg i sammendrag'],
            ['attachTimeSpec', 'Legg ved timespesifikasjon'],
            ['copyExpenseAttachments', 'Kopier utleggsvedlegg til faktura'],
          ].map(([key, label]) => (
            <FormRow key={key} label={label} hint={`standardverdi: ${labelForDefault(key, company[key])}`}>
              <TriBool colors={colors} value={draft[key]} onChange={(v) => onChange(key, v)} disabled={!isAdmin} />
            </FormRow>
          ))}
        </>
      ) : null}

      {show('paslag') || show('rabatter') || show('admin') || show('all') ? (
        <>
          <Text style={[styles.section, { color: colors.ink }]}>Påslag, rabatter og adm.kostnader</Text>
          {[
            ['markupHourly', 'Påslag på timepris %'],
            ['markupFixed', 'Påslag på fastpris %'],
            ['markupExpenseHourly', 'Påslag på utlegg (timepris) %'],
            ['markupExpenseFixed', 'Påslag på utlegg (fastpris) %'],
            ['discountHours', 'Standard rabatt for timer %'],
            ['discountProducts', 'Standard rabatt for produkter %'],
            ['adminMarkupPercent', 'Administrasjonskostnader som påslag %'],
            ['adminAmount', 'Standardbeløp for administrasjonskostnader'],
          ].map(([key, label]) => (
            <FormRow key={key} label={label} hint={`standardverdi: ${labelForDefault(key, company[key])}`}>
              <TextInput
                editable={isAdmin}
                keyboardType="numeric"
                value={draft[key] == null ? '' : String(draft[key])}
                onChangeText={(v) => onChange(key, v === '' ? null : v)}
                placeholder={`Bruk standard (${company[key]})`}
                placeholderTextColor={colors.muted}
                style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
              />
            </FormRow>
          ))}
          {[
            ['adminOnFixed', 'Bruk adm.kostnader på fastpris'],
            ['adminOnHourly', 'Bruk adm.kostnader på timepris'],
            ['adminOnExpenses', 'Bruk adm.kostnader på utlegg'],
            ['adminOnProducts', 'Bruk adm.kostnader på produkter'],
          ].map(([key, label]) => (
            <FormRow key={key} label={label} hint={`standardverdi: ${labelForDefault(key, company[key])}`}>
              <TriBool colors={colors} value={draft[key]} onChange={(v) => onChange(key, v)} disabled={!isAdmin} />
            </FormRow>
          ))}
        </>
      ) : null}

      {show('kontoer') || show('regnskap') || show('all') ? (
        <>
          <Text style={[styles.section, { color: colors.ink }]}>Regnskapskontoer</Text>
          {[
            ['accountFees', 'Regnskapskonto for fastpris'],
            ['accountHours', 'Regnskapskonto for timepris'],
            ['accountExpenses', 'Regnskapskonto for utlegg'],
            ['accountProducts', 'Regnskapskonto for produkter'],
            ['accountAdmin', 'Regnskapskonto for adm.kostnader'],
            ['accountAconto', 'Regnskapskonto for akonto'],
          ].map(([key, label]) => (
            <FormRow key={key} label={label}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                <TouchableOpacity
                  disabled={!isAdmin}
                  onPress={() => onChange(key, null)}
                  style={[styles.chip, { borderColor: draft[key] == null ? colors.brand : colors.line }]}
                >
                  <Text style={{ color: colors.ink, fontSize: 12 }}>Bruk standard</Text>
                </TouchableOpacity>
                {accounts.filter((a) => a.kind === 'sale').slice(0, 12).map((acc) => {
                  const on = draft[key] === acc.code;
                  return (
                    <TouchableOpacity
                      key={acc.code}
                      disabled={!isAdmin}
                      onPress={() => onChange(key, acc.code)}
                      style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : 'transparent' }]}
                    >
                      <Text style={{ color: colors.ink, fontSize: 11 }}>{accountOptionLabel(acc)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </FormRow>
          ))}
          <FormRow label="Standard regnskapsavdeling">
            <TextInput
              editable={isAdmin}
              value={draft.accountingDepartment || ''}
              onChangeText={(v) => onChange('accountingDepartment', v === '' ? null : v)}
              placeholder="Velg regnskapsavdeling..."
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
            />
          </FormRow>
          <FormRow label="Standard regnskapsprosjekt">
            <TextInput
              editable={isAdmin}
              value={draft.accountingProject || ''}
              onChangeText={(v) => onChange('accountingProject', v === '' ? null : v)}
              placeholder="Velg regnskapsprosjekt..."
              placeholderTextColor={colors.muted}
              style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
            />
          </FormRow>
        </>
      ) : null}

      {show('ehf') || show('all') ? (
        <>
          <Text style={[styles.section, { color: colors.ink }]}>Fakturaforsendelse per EHF</Text>
          {[
            ['ehfMergePdf', 'Slå sammen PDF-faktura og PDF-vedlegg'],
            ['ehfAlsoEmail', 'Send faktura både som EHF og e-post'],
            ['ehfAttachPdf', 'PDF-versjon skal legges ved EHF'],
          ].map(([key, label]) => (
            <FormRow key={key} label={label} hint={`standardverdi: ${labelForDefault(key, company[key])}`}>
              <TriBool colors={colors} value={draft[key]} onChange={(v) => onChange(key, v)} disabled={!isAdmin} />
            </FormRow>
          ))}
        </>
      ) : null}

      {isAdmin ? (
        <TouchableOpacity onPress={onSave} style={[styles.save, { backgroundColor: colors.brand }]} nativeID="project-billing-save-invoice">
          <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function FormRow({ label, hint, children }) {
  return (
    <View style={styles.formRow}>
      <View style={styles.formLabel}>
        <Text style={styles.formLabelText}>{label}</Text>
        {hint ? <Text style={styles.formHint}>{hint}</Text> : null}
      </View>
      <View style={styles.formControl}>{children}</View>
    </View>
  );
}

function TriBool({ colors, value, onChange, disabled }) {
  return (
    <TriSelect
      colors={colors}
      value={value === null || value === undefined ? 'inherit' : value ? 'yes' : 'no'}
      options={TRI_BOOL_OPTIONS}
      onChange={(v) => onChange(v === 'inherit' ? null : v === 'yes')}
      disabled={disabled}
    />
  );
}

function TriSelect({ colors, value, options, onChange, disabled }) {
  const current = value == null || value === '' ? 'inherit' : value;
  return (
    <View style={{ gap: 4 }}>
      {options.map((opt) => {
        const on = current === opt.id;
        return (
          <TouchableOpacity
            key={opt.id}
            disabled={disabled}
            onPress={() => onChange(opt.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            style={{ paddingVertical: 4 }}
          >
            <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 13 }}>
              {on ? '●' : '○'} {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Check({ colors, label, value, onChange, disabled }) {
  return (
    <TouchableOpacity disabled={disabled} onPress={() => onChange(!value)} style={{ paddingVertical: 4 }}>
      <Text style={{ color: colors.ink }}>{value ? '☑' : '☐'} {label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  scopeTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  scopeTab: {
    flexGrow: 1,
    flexBasis: 200,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 2,
  },
  banner: { borderWidth: 1, borderRadius: 10, padding: 10 },
  btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  setBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  kv: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 7,
  },
  companyHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8, flexWrap: 'wrap' },
  openEco: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  backLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  menuCard: {
    flexGrow: 1,
    flexBasis: 240,
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  panel: { borderWidth: 1, borderRadius: 12, padding: 14 },
  section: { fontSize: 16, fontWeight: '700', marginTop: 8, marginBottom: 10 },
  formRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 14, alignItems: 'flex-start' },
  formLabel: { width: 220, maxWidth: '100%' },
  formLabelText: { fontWeight: '600', fontSize: 13 },
  formHint: { fontSize: 11, opacity: 0.65, marginTop: 2 },
  formControl: { flex: 1, minWidth: 200 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  area: { minHeight: 72, textAlignVertical: 'top' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  seg: { flexDirection: 'row', borderRadius: 8, overflow: 'hidden' },
  segBtn: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  save: { alignSelf: 'flex-end', borderRadius: 8, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 },
});
