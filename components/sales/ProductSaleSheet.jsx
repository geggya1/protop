/**
 * Ett produktsalg i et sidepanel: all informasjon, lenke til prosjekt og
 * faktura, og redigering. Fakturert salg er låst for endring og sletting.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateField from '../DateField';
import OptionPicker from '../OptionPicker';
import SaleStatusBadge from './SaleStatusBadge';
import { displayName } from '../../src/employees/model.js';
import { formatMoney } from '../../src/economy/invoices.js';
import { normalizeSale } from '../../src/economy/products.js';
import { SALE_EDIT_STATUSES, applySaleDraft, saleDraft } from '../../src/economy/productSaleEdit.js';
import { isExternalSale } from '../../src/economy/productSalesStorage.js';
import { saleIsLocked, saleProjectLabel } from '../../src/economy/productSalesView.js';
import { VAT_CODES } from '../../src/economy/vat.js';
import { dateKey } from '../../src/utils/dates';
import {
  Btn, Fact, Field, PickerField, SectionLabel, qtyText, shortDate, ui,
} from '../../screens/economy/productUi';

const VAT_OPTIONS = VAT_CODES.map((row) => ({ id: row.id, label: `${row.label} (${row.percent} %)` }));

function sourceLabel(sale) {
  if (sale.source?.filename) return `Import fra ${sale.source.filename}`;
  if (isExternalSale(sale)) return 'Import';
  if (sale.productId) return 'Registrert under Produkt';
  return 'Registrert i timelisten eller på prosjekt';
}

function stamp(value) {
  const key = String(value || '');
  if (!key) return '—';
  const time = key.length > 10 ? key.slice(11, 16) : '';
  return `${shortDate(key)}${time ? ` ${time}` : ''}`;
}

function SaleFacts({ sale, colors, onOpenProject, onOpenInvoice }) {
  const [showSource, setShowSource] = useState(false);
  const original = sale.source?.values && typeof sale.source.values === 'object'
    ? Object.entries(sale.source.values).filter(([, value]) => String(value ?? '').trim())
    : [];
  const project = saleProjectLabel(sale);
  const cost = (Number(sale.purchaseUnitPrice) || 0) * (Number(sale.quantity) || 0);
  const margin = sale.amountExVat > 0 && cost > 0
    ? Math.round(((sale.amountExVat - cost) / sale.amountExVat) * 100)
    : null;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ gap: 8 }}>
        <SectionLabel colors={colors}>Salg</SectionLabel>
        <View style={ui.facts}>
          <Fact label="Dato" value={shortDate(sale.date)} colors={colors} />
          {sale.period ? <Fact label="Periode" value={sale.period} colors={colors} /> : null}
          <Fact label="Antall" value={`${qtyText(sale.quantity)} ${sale.unit}`} colors={colors} />
          <Fact label="Enhetspris eks. mva" value={formatMoney(sale.unitPrice)} colors={colors} />
          {sale.discountPercent ? <Fact label="Rabatt" value={`${qtyText(sale.discountPercent)} %`} colors={colors} /> : null}
        </View>
        <View style={ui.facts}>
          <Fact label="Beløp eks. mva" value={formatMoney(sale.amountExVat)} colors={colors} strong />
          <Fact label={`MVA (${qtyText(sale.vatPercent)} %)`} value={formatMoney(sale.vatAmount)} colors={colors} />
          <Fact label="Beløp inkl. mva" value={formatMoney(sale.amountInclVat)} colors={colors} strong />
          <Fact label="Konto" value={sale.accountLabel ? `${sale.account} ${sale.accountLabel}` : sale.account} colors={colors} />
        </View>
        {cost > 0 ? (
          <View style={ui.facts}>
            <Fact label="Kostpris eks. mva" value={formatMoney(sale.purchaseUnitPrice)} colors={colors} />
            <Fact label="Kost totalt" value={formatMoney(cost)} colors={colors} />
            {margin != null ? <Fact label="Margin" value={`${margin} %`} colors={colors} /> : null}
          </View>
        ) : null}
      </View>

      <View style={{ gap: 8 }}>
        <SectionLabel colors={colors}>Kunde og prosjekt</SectionLabel>
        <View style={ui.facts}>
          <Fact
            label="Kunde"
            value={sale.customerName ? `${sale.customerName}${sale.customerNumber ? ` (${sale.customerNumber})` : ''}` : '—'}
            colors={colors}
          />
          <Fact label="Medarbeider" value={sale.employeeName || '—'} colors={colors} />
        </View>
        <View style={{ gap: 4 }}>
          <Text style={[ui.label, { color: colors.muted }]}>Prosjekt</Text>
          {project && sale.projectId && onOpenProject ? (
            <TouchableOpacity
              onPress={() => onOpenProject(sale.projectId)}
              accessibilityRole="link"
              accessibilityLabel={`Åpne prosjekt ${project}`}
              nativeID="produktsalg-detalj-prosjekt"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
            >
              <Text style={{ color: colors.brand, fontSize: 14, fontWeight: '600' }}>{project}</Text>
              <Ionicons name="open-outline" size={14} color={colors.brand} />
            </TouchableOpacity>
          ) : (
            <Text style={{ color: colors.ink, fontSize: 14 }}>{project || '—'}</Text>
          )}
          {project && !sale.projectId ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>Ikke koblet til et prosjekt i registeret.</Text>
          ) : null}
        </View>
        {sale.department || sale.activityName || sale.productGroup ? (
          <View style={ui.facts}>
            {sale.department ? <Fact label="Avdeling" value={sale.department} colors={colors} /> : null}
            {sale.activityName ? <Fact label="Aktivitet" value={sale.activityName} colors={colors} /> : null}
            {sale.productGroup ? <Fact label="Produktgruppe" value={sale.productGroup} colors={colors} /> : null}
          </View>
        ) : null}
      </View>

      {(sale.title && sale.title !== sale.name) || sale.comment || sale.postponeReason ? (
        <View style={{ gap: 8 }}>
          <SectionLabel colors={colors}>Tekst</SectionLabel>
          {/* Hver tekst på egen rad. Fact har flexBasis, som ellers blir høyde i en kolonne. */}
          {sale.title && sale.title !== sale.name ? (
            <View style={ui.facts}><Fact label="Beskrivelse" value={sale.title} colors={colors} /></View>
          ) : null}
          {sale.comment ? <View style={ui.facts}><Fact label="Kommentar" value={sale.comment} colors={colors} /></View> : null}
          {sale.postponeReason ? (
            <View style={ui.facts}>
              <Fact label="Utsatt" value={`${sale.postponeReason}${sale.postponedUntil ? ` (til ${shortDate(sale.postponedUntil)})` : ''}`} colors={colors} />
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 8 }}>
        <SectionLabel colors={colors}>Historikk</SectionLabel>
        <View style={ui.facts}>
          <Fact label="Kilde" value={sourceLabel(sale)} colors={colors} />
          <Fact label="Opprettet" value={stamp(sale.createdAt || sale.source?.importedAt)} colors={colors} />
          <Fact label="Sist endret" value={stamp(sale.updatedAt)} colors={colors} />
        </View>
        {sale.invoiceId ? (
          <View style={{ gap: 4 }}>
            <Text style={[ui.label, { color: colors.muted }]}>Faktura</Text>
            {onOpenInvoice ? (
              <TouchableOpacity
                onPress={() => onOpenInvoice(sale.invoiceId)}
                accessibilityRole="link"
                nativeID="produktsalg-detalj-faktura"
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
              >
                <Text style={{ color: colors.brand, fontSize: 14, fontWeight: '600' }}>Åpne fakturaen</Text>
                <Ionicons name="open-outline" size={14} color={colors.brand} />
              </TouchableOpacity>
            ) : (
              <Text style={{ color: colors.ink, fontSize: 14 }}>{sale.invoiceId}</Text>
            )}
          </View>
        ) : null}
        {original.length ? (
          <View style={{ gap: 6 }}>
            <TouchableOpacity
              onPress={() => setShowSource((on) => !on)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showSource }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start' }}
            >
              <Ionicons name={showSource ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.brand} />
              <Text style={{ color: colors.brand, fontSize: 13, fontWeight: '600' }}>
                {showSource ? 'Skjul verdiene fra filen' : `Vis verdiene fra filen (${original.length})`}
              </Text>
            </TouchableOpacity>
            {showSource ? (
              <View style={[ui.miniTable, { borderColor: colors.line }]} nativeID="produktsalg-detalj-kilde">
                {original.map(([label, value]) => (
                  <View key={label} style={[ui.miniRow, { borderBottomColor: colors.line }]}>
                    <Text style={{ color: colors.muted, fontSize: 12, width: 150 }}>{label}</Text>
                    <Text style={{ color: colors.ink, fontSize: 12, flex: 1 }}>{String(value)}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SaleEditForm({ sale, colors, narrow, projects, customers, employees, busy, error, submitLabel = 'Lagre endringer', onSave, onCancel }) {
  const [draft, setDraft] = useState(() => saleDraft(sale));
  const [localError, setLocalError] = useState('');
  const set = (key) => (value) => setDraft((current) => ({ ...current, [key]: value }));
  const basis = (n) => (narrow ? '100%' : n);

  const projectOptions = useMemo(() => {
    const list = (projects || [])
      .filter((row) => row?.id && (row.status !== 'arkivert' || row.id === sale.projectId))
      .map((row) => ({ id: row.id, label: [row.number ? `#${row.number}` : '', row.name].filter(Boolean).join(' ') || 'Uten navn', hint: row.client || undefined }));
    if (sale.projectId && !list.some((row) => row.id === sale.projectId)) {
      list.unshift({ id: sale.projectId, label: saleProjectLabel(sale) || 'Nåværende prosjekt' });
    }
    return list;
  }, [projects, sale]);
  const customerOptions = useMemo(() => {
    const list = (customers || [])
      .filter((row) => row?.id)
      .map((row) => ({ id: row.id, label: row.name || 'Uten navn', hint: row.customerNumber ? `Kundenr ${row.customerNumber}` : undefined }));
    if (sale.customerId && !list.some((row) => row.id === sale.customerId)) {
      list.unshift({ id: sale.customerId, label: sale.customerName || 'Nåværende kunde' });
    }
    return list;
  }, [customers, sale]);
  const employeeOptions = useMemo(() => {
    const list = (employees || [])
      .filter((row) => row?.id && ((row.company?.status !== 'former' && row.company?.status !== 'deleted') || row.id === sale.employeeId))
      .map((row) => ({ id: row.id, label: displayName(row) }));
    if (sale.employeeId && !list.some((row) => row.id === sale.employeeId)) {
      list.unshift({ id: sale.employeeId, label: sale.employeeName || 'Nåværende medarbeider' });
    }
    return list;
  }, [employees, sale]);

  const preview = useMemo(
    () => applySaleDraft(sale, draft, { projects, customers, employees }),
    [sale, draft, projects, customers, employees],
  );

  function pickProject(id) {
    setDraft((current) => {
      const next = { ...current, projectId: id || '' };
      const hit = (projects || []).find((row) => row.id === id);
      if (hit && !current.customerId && !current.customerName) {
        const known = (customers || []).find((row) => row.id === hit.customerId);
        if (known) next.customerId = known.id;
        else if (hit.client) next.customerName = hit.client;
      }
      return next;
    });
  }

  function submit() {
    if (!preview.ok) {
      setLocalError(preview.error);
      return;
    }
    setLocalError('');
    onSave(preview.sale);
  }

  return (
    <View style={{ gap: 12 }} nativeID="produktsalg-rediger">
      <View style={ui.formRow}>
        <PickerField label="Dato" colors={colors} basis={basis(180)}>
          <DateField value={draft.date} onChange={(d) => set('date')(d ? dateKey(d) : '')} />
        </PickerField>
        <Field label="Produkt" value={draft.name} onChange={set('name')} colors={colors} basis={basis(240)} grow nativeID="produktsalg-rediger-navn" />
      </View>
      <View style={ui.formRow}>
        <Field label="Beskrivelse" value={draft.title} onChange={set('title')} colors={colors} basis="100%" grow multiline placeholder="Tekst på salgslinjen" />
      </View>
      <View style={ui.formRow}>
        <Field label="Antall" value={draft.quantity} onChange={set('quantity')} colors={colors} basis={basis(120)} keyboardType="decimal-pad" nativeID="produktsalg-rediger-antall" />
        <Field label="Enhet" value={draft.unit} onChange={set('unit')} colors={colors} basis={basis(120)} />
        <Field label="Enhetspris eks. mva" value={draft.unitPrice} onChange={set('unitPrice')} colors={colors} basis={basis(150)} grow keyboardType="decimal-pad" />
      </View>
      <View style={ui.formRow}>
        <Field label="Rabatt %" value={draft.discountPercent} onChange={set('discountPercent')} colors={colors} basis={basis(120)} keyboardType="decimal-pad" />
        <PickerField label="MVA" colors={colors} basis={basis(200)} grow>
          <OptionPicker options={VAT_OPTIONS} value={draft.vatCode} onChange={(id) => { if (id) set('vatCode')(id); }} clearable={false} chipLimit={0} title="MVA" />
        </PickerField>
        <Field label="Kostpris eks. mva" value={draft.purchaseUnitPrice} onChange={set('purchaseUnitPrice')} colors={colors} basis={basis(150)} keyboardType="decimal-pad" />
      </View>
      <View style={ui.formRow}>
        <PickerField label="Prosjekt" colors={colors} basis={basis(260)} grow>
          <OptionPicker
            options={projectOptions}
            value={draft.projectId}
            onChange={pickProject}
            placeholder={!draft.projectId && saleProjectLabel(sale) ? `${saleProjectLabel(sale)} (ikke koblet)` : 'Velg prosjekt'}
            clearLabel="Uten prosjekt"
            chipLimit={0}
            title="Prosjekt"
          />
        </PickerField>
        {customerOptions.length ? (
          <PickerField label="Kunde" colors={colors} basis={basis(260)} grow>
            <OptionPicker
              options={customerOptions}
              value={draft.customerId}
              onChange={(id) => setDraft((current) => ({ ...current, customerId: id || '', customerName: id ? current.customerName : '' }))}
              placeholder={draft.customerName || 'Velg kunde'}
              clearLabel="Uten kunde"
              chipLimit={0}
              title="Kunde"
            />
          </PickerField>
        ) : (
          <Field label="Kunde" value={draft.customerName} onChange={set('customerName')} colors={colors} basis={basis(260)} grow />
        )}
      </View>
      <View style={ui.formRow}>
        <PickerField label="Medarbeider" colors={colors} basis={basis(260)} grow>
          <OptionPicker
            options={employeeOptions}
            value={draft.employeeId}
            onChange={(id) => set('employeeId')(id || '')}
            placeholder={!draft.employeeId && sale.employeeName ? sale.employeeName : 'Velg medarbeider'}
            clearLabel="Uten medarbeider"
            chipLimit={0}
            title="Medarbeider"
          />
        </PickerField>
        <PickerField label="Status" colors={colors} basis={basis(200)} grow>
          <OptionPicker options={SALE_EDIT_STATUSES} value={draft.status} onChange={(id) => { if (id) set('status')(id); }} clearable={false} small title="Status" />
        </PickerField>
      </View>
      <View style={ui.formRow}>
        <Field label="Kommentar" value={draft.comment} onChange={set('comment')} colors={colors} basis="100%" grow multiline placeholder="Internt, vises ikke på faktura." />
      </View>
      {preview.ok ? (
        <Text style={{ color: colors.muted, fontSize: 12 }} nativeID="produktsalg-rediger-sum">
          {`Sum ${formatMoney(preview.sale.amountExVat)} eks. mva · ${formatMoney(preview.sale.amountInclVat)} inkl. mva.`}
          {preview.priceChanged ? ' Beløpet regnes ut på nytt fra antall, pris og rabatt.' : ''}
        </Text>
      ) : null}
      {localError || error ? <Text style={{ color: (colors.dangerInk || colors.danger) }}>{localError || error}</Text> : null}
      <View style={ui.actions}>
        <Btn label={busy ? 'Lagrer…' : submitLabel} icon="checkmark" primary onPress={submit} disabled={busy} colors={colors} nativeID="produktsalg-rediger-lagre" />
        <Btn label="Avbryt" onPress={onCancel} disabled={busy} colors={colors} />
      </View>
    </View>
  );
}

/**
 * sale: salget som vises. null skjuler panelet.
 * onSave(sale) og onDelete(sale) returnerer { ok, error }.
 */
export default function ProductSaleSheet({
  sale: raw,
  colors,
  projects = [],
  customers = [],
  employees = [],
  canEdit = false,
  canDelete = false,
  onSave,
  onDelete,
  onOpenProject,
  onOpenInvoice,
  onClose,
  // Nytt salg: skjemaet åpnes med en gang, og Avbryt lukker panelet.
  isNew = false,
}) {
  const { width, height } = useWindowDimensions();
  const side = width >= 900;
  const narrow = width < 560;
  const sale = useMemo(() => (raw ? normalizeSale(raw) : null), [raw]);
  const [mode, setMode] = useState(isNew ? 'edit' : 'view');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const saleId = sale?.id || '';

  useEffect(() => {
    setMode(isNew ? 'edit' : 'view');
    setError('');
    setConfirmDelete(false);
  }, [saleId, isNew]);

  if (!sale) return null;
  const locked = saleIsLocked(sale);

  async function save(next) {
    if (!onSave) return;
    setBusy(true);
    setError('');
    const result = await Promise.resolve(onSave(next)).catch((cause) => ({ ok: false, error: cause?.message }));
    setBusy(false);
    if (!result?.ok) {
      setError(result?.error || 'Kunne ikke lagre salget.');
      return;
    }
    if (isNew) onClose?.();
    else setMode('view');
  }

  async function remove() {
    if (!onDelete) return;
    setBusy(true);
    setError('');
    const result = await Promise.resolve(onDelete(sale)).catch((cause) => ({ ok: false, error: cause?.message }));
    setBusy(false);
    if (!result?.ok) {
      setError(result?.error || 'Kunne ikke slette salget.');
      setConfirmDelete(false);
    }
  }

  const panelStyle = side
    ? { position: 'absolute', top: 0, right: 0, bottom: 0, width: Math.min(560, width), borderLeftWidth: 1 }
    : { marginTop: 'auto', maxHeight: height * 0.92, width: '100%', borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 1 };

  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => (mode === 'edit' && !busy && !isNew ? setMode('view') : onClose?.())}>
      {/* Et klikk utenfor lukker bare visningen, så et halvfylt skjema ikke forsvinner. */}
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.35)' }} onPress={busy || mode === 'edit' ? undefined : onClose} accessibilityLabel="Lukk">
        <Pressable
          style={[panelStyle, { backgroundColor: colors.card, borderColor: colors.line }]}
          nativeID="produktsalg-detalj"
          accessibilityViewIsModal
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }} numberOfLines={2}>{isNew ? 'Nytt produktsalg' : sale.name}</Text>
              {isNew ? null : (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {sale.sku ? <Text style={{ color: colors.muted, fontSize: 13 }}>Varenr {sale.sku}</Text> : null}
                  <SaleStatusBadge status={sale.status} colors={colors} />
                </View>
              )}
            </View>
            <TouchableOpacity onPress={onClose} disabled={busy} accessibilityRole="button" accessibilityLabel="Lukk" nativeID="produktsalg-detalj-lukk" style={{ padding: 4 }}>
              <Ionicons name="close" size={22} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
            {locked ? (
              <View style={[ui.notice, { borderColor: '#86efac', backgroundColor: '#f0fdf4', flexDirection: 'row', alignItems: 'flex-start' }]} nativeID="produktsalg-detalj-laast">
                <Ionicons name="lock-closed" size={16} color="#166534" style={{ marginTop: 2 }} />
                <Text style={{ color: '#14532d', fontSize: 13, flex: 1, lineHeight: 19 }}>
                  Salget er fakturert og låst. Det kan ikke endres eller slettes her. Feil rettes med kreditnota i Økonomi.
                </Text>
              </View>
            ) : null}
            {mode === 'edit' && !locked ? (
              <SaleEditForm
                sale={sale}
                colors={colors}
                narrow={narrow}
                projects={projects}
                customers={customers}
                employees={employees}
                busy={busy}
                error={error}
                submitLabel={isNew ? 'Registrer salg' : 'Lagre endringer'}
                onSave={save}
                onCancel={() => {
                  if (isNew) onClose?.();
                  else setMode('view');
                  setError('');
                }}
              />
            ) : (
              <>
                <SaleFacts sale={sale} colors={colors} onOpenProject={onOpenProject} onOpenInvoice={onOpenInvoice} />
                {error ? <Text style={{ color: (colors.dangerInk || colors.danger) }}>{error}</Text> : null}
                {!locked && (canEdit || canDelete) ? (
                  <View style={ui.actions}>
                    {canEdit ? (
                      <Btn label="Rediger" icon="create-outline" primary onPress={() => setMode('edit')} disabled={busy} colors={colors} nativeID="produktsalg-detalj-rediger" />
                    ) : null}
                    {canDelete && !confirmDelete ? (
                      <Btn label="Slett" icon="trash-outline" danger onPress={() => setConfirmDelete(true)} disabled={busy} colors={colors} nativeID="produktsalg-detalj-slett" />
                    ) : null}
                    {canDelete && confirmDelete ? (
                      <>
                        <Btn label={busy ? 'Sletter…' : 'Bekreft sletting'} icon="trash" danger onPress={remove} disabled={busy} colors={colors} nativeID="produktsalg-detalj-slett-bekreft" />
                        <Btn label="Avbryt" onPress={() => setConfirmDelete(false)} disabled={busy} colors={colors} />
                      </>
                    ) : null}
                  </View>
                ) : null}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
