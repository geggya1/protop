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
export default function ProjectBillingTab({
  state,
  project,
  activities = [],
  colors,
  isAdmin,
  onChangeState,
  onOpenEconomySettings,
}) {
  const [sub, setSub] = useState('meny'); // meny | prismodell | innstillinger | section id
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

  return (
    <View style={styles.wrap} nativeID="project-billing-tab">
      <View style={styles.subTabs}>
        {[
          { id: 'meny', label: 'Oversikt' },
          { id: 'prismodell', label: 'Prismodeller' },
          { id: 'innstillinger', label: 'Fakturainnstillinger' },
        ].map((row) => {
          const on = sub === row.id || (sub !== 'meny' && sub !== 'prismodell' && sub !== 'innstillinger' && row.id === 'innstillinger');
          return (
            <TouchableOpacity
              key={row.id}
              onPress={() => { setSub(row.id); reloadDrafts(); }}
              style={[styles.subTab, on && { borderBottomColor: colors.brand }]}
            >
              <Text style={{ color: on ? colors.brand : colors.muted, fontWeight: on ? '700' : '400' }}>{row.label}</Text>
            </TouchableOpacity>
          );
        })}
        {isAdmin ? (
          <TouchableOpacity onPress={restoreDefaults} style={[styles.restoreBtn, { borderColor: colors.line }]}>
            <Ionicons name="refresh" size={14} color={colors.ink} />
            <Text style={{ color: colors.ink, fontSize: 12 }}>Gjenopprett standard</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View
        nativeID="project-billing-inherit-banner"
        style={[styles.banner, { backgroundColor: colors.brandSoft || '#e8f1ff', borderColor: colors.brand }]}
      >
        <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 20 }}>
          Sett fakturainnstillinger for prosjekt <Text style={{ fontWeight: '700' }}>{project.name}</Text>.
          Dette overstyrer innstillinger på kunde- eller globalt nivå. Tomme felt arver fra{' '}
          <Text style={{ color: colors.brand, fontWeight: '700' }} onPress={onOpenEconomySettings}>
            Økonomi → Innstillinger
          </Text>
          . {resolved.sourceLabel}. Endringer påvirker kun nye fakturaer.
        </Text>
      </View>

      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      {sub === 'meny' ? (
        <View style={styles.cardGrid}>
          <TouchableOpacity
            onPress={() => setSub('prismodell')}
            style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <Ionicons name="cash-outline" size={22} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Prismodell</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {pricingModelLabel(project.pricingModel) || 'Ikke satt'}
                {project.pricingSettings?.hourlyRate != null ? ` · ${project.pricingSettings.hourlyRate} kr` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.brand} />
          </TouchableOpacity>
          {MENU_CARDS.map((card) => (
            <TouchableOpacity
              key={card.id}
              onPress={() => { setSub(card.id); reloadDrafts(); }}
              style={[styles.menuCard, { backgroundColor: colors.card, borderColor: colors.line }]}
              accessibilityRole="button"
              accessibilityLabel={card.title}
            >
              <Ionicons name={card.icon} size={22} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>{card.title}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{card.sub}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.brand} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {sub === 'prismodell' ? (
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

      {sub !== 'meny' && sub !== 'prismodell' ? (
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
  wrap: { gap: 12 },
  subTabs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e2e8f0' },
  subTab: { paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  restoreBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  banner: { borderWidth: 1, borderRadius: 10, padding: 12 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  menuCard: {
    flexGrow: 1,
    flexBasis: 280,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  panel: { borderWidth: 1, borderRadius: 12, padding: 16 },
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
