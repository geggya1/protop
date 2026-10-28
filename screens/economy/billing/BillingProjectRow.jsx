/**
 * Én prosjektlinje i Til fakturering. Lukket: nummer, navn, kunde, prismodell,
 * varsler og beløp. Åpen: prismodeller (hittil fakturert / klar), timer per
 * medarbeider, utlegg, kjøring og salg med avkryssing per linje.
 */
import React from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatHours } from '../../../src/arbeid/hours.js';
import { formatDate } from '../../../src/economy/invoices.js';
import { periodLabel } from '../../../src/economy/invoiceLines.js';
import { invoiceTotals } from '../../../src/economy/invoiceFlow.js';
import { selectableKeys, selectionAmount } from '../../../src/economy/billingReady.js';
import { rateSourceLabel } from '../../../src/economy/hourlyRate.js';
import {
  Banner, Button, Check, Chip, LinkText, MiniTable, SectionTitle, TotalRow, money,
} from './ui';

function pct(value) {
  const n = Number(value) || 0;
  return n ? `${String(Math.round(n * 100) / 100).replace('.', ',')} %` : '–';
}

function monthSpan(start, end) {
  return periodLabel(start, end) || '—';
}

export default function BillingProjectRow({
  project,
  colors,
  open,
  onToggleOpen,
  selected,
  onToggleKey,
  checked = false,
  onToggleCheck,
  fixedAmount,
  onFixedAmount,
  stacked = false,
  busy = false,
  canEdit = true,
  onApprove,
  onCreateDraft,
  onOpenDraft,
  onOpenProject,
  hideHeader = false,
  showCheck = true,
}) {
  const keys = selectableKeys(project, { includeFixed: true });
  const picked = keys.filter((key) => selected.has(key));
  const lineKeys = selectableKeys(project);
  const some = lineKeys.some((key) => !selected.has(key)) && picked.length > 0;
  const amount = selectionAmount(project, selected, fixedAmount == null || fixedAmount === '' ? null : Number(fixedAmount) || 0);
  const openTotal = project.totals.total;
  const fixedPicked = project.fixed && selected.has(project.fixed.key) ? (Number(fixedAmount ?? project.fixed.amount) || 0) : 0;
  const unpriced = (project.hourGroups || []).reduce((sum, row) => sum + (row.rateMissing ? row.hours : 0), 0);
  const drafts = project.drafts || [];
  const noOpen = !project.open && !project.fixed;

  const header = (
    <View style={styles.header}>
      {showCheck ? (
        <Check
          checked={checked}
          onPress={onToggleCheck}
          colors={colors}
          disabled={!keys.length || !canEdit}
          label={`Velg ${project.number} ${project.name}`}
          nativeID={`billing-check-${project.projectId}`}
        />
      ) : null}
      <TouchableOpacity
        onPress={onToggleOpen}
        style={styles.headerMain}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? 'Lukk' : 'Åpne'} ${project.number} ${project.name}`}
        nativeID={`billing-row-${project.projectId}`}
      >
        <Ionicons name={open ? 'chevron-down-circle' : 'chevron-forward-circle'} size={18} color={colors.muted} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: colors.ink, fontSize: 14 }} numberOfLines={stacked ? 3 : 1}>
            <Text style={{ color: colors.muted }}>#{project.number} </Text>
            <Text style={{ fontWeight: '700' }}>{project.name}</Text>
            <Text style={{ color: colors.muted }}> for kunden </Text>
            {project.customerNumber ? <Text style={{ color: colors.muted }}>#{project.customerNumber} </Text> : null}
            <Text style={{ fontWeight: '700' }}>{project.customerName || 'Uten kunde'}</Text>
            <Text style={{ color: colors.muted }}>{`, ${project.pricingLabel.toLowerCase()}`}</Text>
          </Text>
          {project.warnings.length ? (
            <View style={styles.chips}>
              {project.warnings.map((row) => (
                <Chip key={row.id} label={row.text} tone={row.level === 'block' ? 'block' : 'warn'} />
              ))}
            </View>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{money(openTotal + fixedPicked)}</Text>
          {some ? <Text style={{ color: colors.muted, fontSize: 12 }}>Valgt {money(amount)}</Text> : null}
          {project.fixed && !fixedPicked && project.fixed.amount > 0 ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {project.fixed.model === 'fixed' ? `Fastpris, rest ${money(project.fixed.remaining)}` : `${project.fixed.description} ${money(project.fixed.amount)}`}
            </Text>
          ) : null}
          {unpriced > 0 ? <Text style={{ color: colors.danger || '#b91c1c', fontSize: 12 }}>{`${formatHours(unpriced)} t uten pris`}</Text> : null}
        </View>
      </TouchableOpacity>
    </View>
  );

  const draftLine = drafts.length ? (
    <View style={[styles.draftLine, { backgroundColor: colors.successSoft || '#dcfce7' }]}>
      <Ionicons name="checkmark-circle" size={16} color={colors.success || '#15803d'} />
      <Text style={{ color: colors.ink, flex: 1, fontSize: 13 }}>
        {drafts.length === 1 ? 'Fakturautkast laget' : `${drafts.length} fakturautkast laget`}
        {' · '}
        {money(drafts.reduce((sum, row) => sum + invoiceTotals(row).amountExVat, 0))} eks. mva
      </Text>
      {drafts.slice(0, 3).map((row, index) => (
        <LinkText
          key={row.id}
          label={drafts.length > 1 ? `Utkast ${index + 1}` : 'Gå til fakturautkast'}
          onPress={() => onOpenDraft?.(row)}
          colors={colors}
          nativeID={`billing-open-draft-${row.id}`}
        />
      ))}
    </View>
  ) : null;

  if (!open) {
    return (
      <View style={[styles.wrap, { borderColor: colors.line, backgroundColor: colors.card, opacity: noOpen ? 0.7 : 1 }]}>
        {hideHeader ? null : header}
        {draftLine}
      </View>
    );
  }

  const fees = (project.hourGroups || []).length;
  const hourColumns = [
    { key: 'pick', label: '', width: 26, render: (row) => (
      <Check
        checked={selected.has(row.key)}
        onPress={() => onToggleKey(row.key)}
        colors={colors}
        disabled={row.rateMissing || !canEdit || project.blocked}
        label={`Velg timer ${row.employeeName}`}
      />
    ) },
    { key: 'employeeName', label: 'Navn', flex: 1.4, render: (row) => (
      <Text style={{ color: colors.brand, fontSize: 13 }} numberOfLines={1}>
        {row.employeeName}{row.timeTypeLabel ? ` (${row.timeTypeLabel})` : ''}
      </Text>
    ) },
    { key: 'activityName', label: 'Aktivitet', flex: 1.2 },
    { key: 'lock', label: 'Levert t.o.m.', width: 104, render: (row) => (
      <View style={styles.lock}>
        <Ionicons name={row.lockThrough ? 'lock-closed' : 'lock-open-outline'} size={12} color={row.lockBehind ? (colors.danger || '#b42318') : colors.muted} />
        <Text style={{ color: row.lockBehind ? (colors.danger || '#b42318') : colors.muted, fontSize: 12 }}>
          {row.lockThrough ? formatDate(row.lockThrough) : 'Ikke levert'}
        </Text>
      </View>
    ) },
    { key: 'period', label: 'Periode', width: 74, render: (row) => monthSpan(row.periodStart, row.periodEnd) },
    { key: 'hours', label: 'Timer', width: 64, align: 'right', render: (row) => formatHours(row.hours) },
    { key: 'approved', label: 'Godkjent', width: 78, align: 'right', render: (row) => (
      <Text style={{ color: row.approvedCount < row.count ? (colors.warn || '#b45309') : colors.ink, fontSize: 13 }}>
        {row.approvedCount} av {row.count}
      </Text>
    ) },
    { key: 'rate', label: 'Timepris', width: 96, align: 'right', render: (row) => (row.rateMissing
      ? <Chip label="Mangler" tone="block" />
      : (
        // Hvor satsen kommer fra (DS-12): prisversjon i avtalen eller prosjektets timepris.
        <View style={{ alignItems: stacked ? 'flex-start' : 'flex-end' }}>
          <Text style={{ color: colors.ink, fontSize: 13 }}>{money(row.rate)}</Text>
          {row.rateSource ? <Text style={{ color: colors.muted, fontSize: 11 }}>{rateSourceLabel(row.rateSource)}</Text> : null}
        </View>
      )) },
    { key: 'base', label: 'Totalt u/påslag', width: 112, align: 'right', render: (row) => money(row.base) },
    { key: 'markup', label: 'Påslag', width: 64, align: 'right', render: (row) => pct(row.markupPercent) },
    { key: 'amount', label: 'Honorar', width: 112, align: 'right', render: (row) => <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>{money(row.amount)}</Text> },
  ];
  const opColumns = (kind) => [
    { key: 'pick', label: '', width: 26, render: (row) => (
      <Check checked={selected.has(row.key)} onPress={() => onToggleKey(row.key)} colors={colors} disabled={!canEdit || project.blocked} label={`Velg ${row.description}`} />
    ) },
    { key: 'description', label: 'Navn', flex: 2, wrap: true, render: (row) => (
      <View>
        <Text style={{ color: colors.brand, fontSize: 13 }} numberOfLines={2}>{row.description}</Text>
        {row.employeeName ? <Text style={{ color: colors.muted, fontSize: 12 }}>{row.employeeName}</Text> : null}
        {row.chargeType === 'outlay' ? <Text style={{ color: colors.muted, fontSize: 12 }}>Utlegg i kundens navn · brutto, uten mva</Text> : null}
      </View>
    ) },
    { key: 'date', label: 'Dato', width: 86, render: (row) => formatDate(row.date) },
    { key: 'approved', label: kind === 'sales' ? 'Klar' : 'Godkjent', width: 72, render: (row) => (
      <Text style={{ color: row.approved ? colors.ink : (colors.warn || '#b45309'), fontSize: 13 }}>{row.approved ? 'Ja' : 'Nei'}</Text>
    ) },
    { key: 'quantity', label: kind === 'trips' ? 'Km' : 'Antall', width: 64, align: 'right', render: (row) => String(row.quantity ?? 1).replace('.', ',') },
    { key: 'unitPrice', label: kind === 'trips' ? 'Sats' : 'Enhetspris', width: 104, align: 'right', render: (row) => money(row.unitPrice) },
    kind === 'sales'
      ? { key: 'discount', label: 'Rabatt', width: 64, align: 'right', render: (row) => pct(row.discountPercent) }
      : { key: 'markup', label: 'Påslag', width: 64, align: 'right', render: (row) => (kind === 'trips' ? (row.extras ? `+ ${money(row.extras)}` : '–') : pct(row.markupPercent)) },
    { key: 'amount', label: 'Totalt', width: 112, align: 'right', render: (row) => <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>{money(row.amount)}</Text> },
  ];
  const visibleHourColumns = stacked ? hourColumns.filter((col) => !['base', 'markup'].includes(col.key)) : hourColumns;

  const fixed = project.fixed;

  return (
    <View style={[styles.wrap, { borderColor: colors.line, backgroundColor: colors.card }]}>
      {hideHeader ? null : header}
      {draftLine}
      <View style={styles.body}>
        {project.blocked ? (
          <Banner tone="block" colors={colors} title="Kan ikke faktureres før dette er rettet">
            <View style={{ gap: 4 }}>
              {project.blockReasons.map((reason) => (
                <Text key={reason} style={{ color: colors.ink, fontSize: 13 }}>{`• ${reason}`}</Text>
              ))}
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Timepris settes under prosjektets Faktureringsvalg. Kontoene settes under Økonomi → Innstillinger → Standard regnskapskontoer, eller overstyres på prosjektet.
              </Text>
              <LinkText label="Åpne Faktureringsvalg" icon="settings-outline" onPress={() => onOpenProject?.('fakturering')} colors={colors} nativeID={`billing-fix-${project.projectId}`} />
            </View>
          </Banner>
        ) : null}
        <SectionTitle title="Prismodeller som skal faktureres" colors={colors} />
        <View style={[styles.models, { borderColor: colors.line }]}>
          <View style={styles.modelRow}>
            <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>
              {project.pricingLabel}
              {fixed?.model === 'fixed' ? <Text style={{ color: colors.muted, fontWeight: '400' }}>{`  avtalt ${money(fixed.agreed)}`}</Text> : null}
            </Text>
          </View>
          <View style={styles.modelRow}>
            <Text style={{ color: colors.muted, flex: 1 }}>Hittil fakturert</Text>
            <Text style={{ color: colors.ink }}>{money(project.invoiced.total)}</Text>
          </View>
          {fixed ? (
            <View style={[styles.modelRow, { alignItems: 'center' }]}>
              <Check
                checked={selected.has(fixed.key)}
                onPress={() => onToggleKey(fixed.key)}
                colors={colors}
                disabled={!canEdit || project.blocked}
                label={`Fakturer ${fixed.description}`}
                nativeID={`billing-fixed-${project.projectId}`}
              />
              <Text style={{ color: colors.muted, flex: 1 }}>
                {fixed.model === 'fixed' ? `Klar til å faktureres (rest ${money(fixed.remaining)})` : `${fixed.description} denne perioden`}
              </Text>
              <TextInput
                value={fixedAmount == null ? String(fixed.amount || '') : String(fixedAmount)}
                onChangeText={(value) => onFixedAmount?.(value.replace(',', '.'))}
                keyboardType="decimal-pad"
                editable={canEdit && !project.blocked}
                accessibilityLabel="Beløp å fakturere"
                nativeID={`billing-fixed-amount-${project.projectId}`}
                style={[styles.amountInput, { borderColor: colors.line, color: colors.ink, backgroundColor: colors.card }]}
              />
            </View>
          ) : (
            <View style={styles.modelRow}>
              <Text style={{ color: colors.muted, flex: 1 }}>Klar til å faktureres</Text>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>{money(openTotal)}</Text>
            </View>
          )}
        </View>

        <SectionTitle title="Påløpt til fakturering (hittil ufakturert)" colors={colors} />
        {fees ? (
          <View style={styles.block}>
            <SectionTitle
              title="Timer"
              colors={colors}
              right={<LinkText label="Vis i timerapporten" icon="open-outline" onPress={() => onOpenProject?.('timerapport')} colors={colors} />}
            />
            <MiniTable
              columns={visibleHourColumns}
              rows={project.hourGroups}
              colors={colors}
              stacked={stacked}
              dimmed={(row) => !selected.has(row.key)}
              footer={(
                <TotalRow
                  label={`Totalt timer · ${formatHours(project.totals.hours)}`}
                  value={money(project.totals.hoursAmount)}
                  colors={colors}
                />
              )}
            />
          </View>
        ) : null}
        {project.expenses.length ? (
          <View style={styles.block}>
            <SectionTitle
              title="Utlegg"
              colors={colors}
              right={<LinkText label="Vis i prosjektutlegg" icon="open-outline" onPress={() => onOpenProject?.('utlegg')} colors={colors} />}
            />
            <MiniTable
              columns={opColumns('expenses')}
              rows={project.expenses}
              colors={colors}
              stacked={stacked}
              dimmed={(row) => !selected.has(row.key)}
              footer={<TotalRow label="Totalt utlegg" value={money(project.totals.expenses)} colors={colors} />}
            />
          </View>
        ) : null}
        {project.trips.length ? (
          <View style={styles.block}>
            <SectionTitle title="Kjøring" colors={colors} />
            <MiniTable
              columns={opColumns('trips')}
              rows={project.trips}
              colors={colors}
              stacked={stacked}
              dimmed={(row) => !selected.has(row.key)}
              footer={<TotalRow label="Totalt kjøring" value={money(project.totals.trips)} colors={colors} />}
            />
          </View>
        ) : null}
        {project.sales.length ? (
          <View style={styles.block}>
            <SectionTitle
              title="Produktsalg"
              colors={colors}
              right={<LinkText label="Vis i produktsalg" icon="open-outline" onPress={() => onOpenProject?.('produktsalg')} colors={colors} />}
            />
            <MiniTable
              columns={opColumns('sales')}
              rows={project.sales}
              colors={colors}
              stacked={stacked}
              dimmed={(row) => !selected.has(row.key)}
              footer={<TotalRow label="Totalt produktsalg" value={money(project.totals.sales)} colors={colors} />}
            />
          </View>
        ) : null}
        {!project.open && !fixed ? (
          <Text style={{ color: colors.muted }}>Ingen åpne poster i perioden.</Text>
        ) : null}

        <View style={styles.actions}>
          <LinkText label="Åpne prosjektet" icon="arrow-redo-outline" onPress={() => onOpenProject?.('fakturering')} colors={colors} />
          <View style={{ flex: 1 }} />
          {canEdit ? (
            <>
              <Button
                label="Godkjenn utvalg"
                icon="checkmark"
                tone="success"
                onPress={onApprove}
                disabled={!picked.length || busy}
                colors={colors}
                small
                nativeID={`billing-approve-${project.projectId}`}
              />
              <Button
                label="Lag fakturautkast av utvalg"
                icon="document-text-outline"
                onPress={onCreateDraft}
                disabled={!picked.length || busy}
                busy={busy}
                colors={colors}
                small
                nativeID={`billing-draft-${project.projectId}`}
              />
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 10 },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  draftLine: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 6, flexWrap: 'wrap' },
  body: { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 6, gap: 10 },
  models: { borderWidth: 1, borderRadius: 8, padding: 10, gap: 6, maxWidth: 620 },
  modelRow: { flexDirection: 'row', gap: 8 },
  amountInput: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, width: 130, textAlign: 'right' },
  block: { gap: 4 },
  lock: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 },
});
