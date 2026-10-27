/**
 * Skjema for produktet og for å registrere et salg av det.
 */
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import DateField from '../../components/DateField';
import OptionPicker from '../../components/OptionPicker';
import { formatMoney, parseMoney } from '../../src/economy/invoices.js';
import { productMargin } from '../../src/economy/productCatalog.js';
import { PRODUCT_KINDS, emptyProduct, productKind, saleFromProduct } from '../../src/economy/products.js';
import { VAT_CODES, roundMoney } from '../../src/economy/vat.js';
import { dateKey } from '../../src/utils/dates';
import {
  Btn, Field, PickerField, SectionLabel, numText, todayKey, ui as styles, withVat,
} from './productUi';

const UNITS = ['stk', 'time', 'dag', 'mnd', 'år', 'm', 'm²', 'm³', 'kg', 'km', 'pakke', 'lisens'];

const VAT_OPTIONS = VAT_CODES.map((row) => ({
  id: row.id,
  label: `${row.label} (${row.percent} %)`,
  hint: row.description,
}));

function toDraft(product) {
  const row = emptyProduct(product || {});
  const defaultAccount = productKind(row.kind).account;
  return {
    name: row.name,
    sku: row.sku,
    kind: row.kind,
    unit: row.unit || 'stk',
    price: numText(row.priceExVat),
    cost: numText(row.costExVat),
    vatCode: row.vatCode || 'HIGH',
    account: row.account && row.account !== defaultAccount ? row.account : '',
    trackStock: row.trackStock,
    stock: row.trackStock ? String(row.stock ?? 0).replace('.', ',') : '',
    description: row.description,
    notes: row.notes,
  };
}

/** Skjemaet til et produkt. Feil i tallfelt meldes før lagring. */
export function productFromDraft(draft, base = {}) {
  const price = draft.price.trim() ? parseMoney(draft.price) : 0;
  if (price == null || price < 0) return { ok: false, error: 'Pris må være et tall.' };
  const cost = draft.cost.trim() ? parseMoney(draft.cost) : 0;
  if (cost == null || cost < 0) return { ok: false, error: 'Kostpris må være et tall.' };
  const stock = draft.trackStock ? (draft.stock.trim() ? parseMoney(draft.stock) : 0) : null;
  if (draft.trackStock && stock == null) return { ok: false, error: 'Beholdning må være et tall.' };
  return {
    ok: true,
    product: {
      ...base,
      name: draft.name,
      sku: draft.sku,
      kind: draft.kind,
      unit: draft.unit,
      priceExVat: price,
      costExVat: cost,
      vatCode: draft.vatCode,
      account: draft.account.trim(),
      trackStock: !!draft.trackStock,
      stock,
      description: draft.description,
      notes: draft.notes,
    },
  };
}

export function ProductForm({ product, colors, narrow, busy, error, onSave, onCancel, isNew }) {
  const [draft, setDraft] = useState(() => toDraft(product));
  const [localError, setLocalError] = useState('');
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const kind = productKind(draft.kind);
  const price = parseMoney(draft.price) || 0;
  const cost = parseMoney(draft.cost) || 0;
  const margin = cost > 0 ? productMargin({ priceExVat: price, costExVat: cost }) : null;
  const units = UNITS.includes(draft.unit) ? UNITS : [draft.unit, ...UNITS];
  const basis = (n) => (narrow ? '100%' : n);

  function submit() {
    const built = productFromDraft(draft, product || {});
    if (!built.ok) {
      setLocalError(built.error);
      return;
    }
    setLocalError('');
    onSave(built.product);
  }

  return (
    <View style={{ gap: 18 }} nativeID="produkt-skjema">
      <View style={{ gap: 10 }}>
        <SectionLabel colors={colors}>Hva vi selger</SectionLabel>
        <View style={styles.formRow}>
          <Field label="Navn" value={draft.name} onChange={set('name')} colors={colors} basis={basis(320)} grow nativeID="produkt-navn" placeholder="F.eks. SHA-plan med risikoregister" />
          <Field label="Varenr" value={draft.sku} onChange={set('sku')} colors={colors} basis={basis(140)} nativeID="produkt-varenr" />
        </View>
        <View style={styles.formRow}>
          <PickerField label="Type" colors={colors} basis="100%">
            <OptionPicker
              options={PRODUCT_KINDS.map((row) => ({ id: row.id, label: row.label }))}
              value={draft.kind}
              onChange={(id) => { if (id) set('kind')(id); }}
              clearable={false}
              small
              title="Type"
            />
          </PickerField>
        </View>
        <View style={styles.formRow}>
          <Field
            label="Beskrivelse"
            value={draft.description}
            onChange={set('description')}
            colors={colors}
            basis="100%"
            grow
            multiline
            nativeID="produkt-beskrivelse"
            placeholder="Hva er produktet, hva er inkludert, og når brukes det?"
          />
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <SectionLabel colors={colors}>Pris</SectionLabel>
        <View style={styles.formRow}>
          <Field label="Pris eks. mva" value={draft.price} onChange={set('price')} colors={colors} basis={basis(150)} keyboardType="decimal-pad" nativeID="produkt-pris" placeholder="0" />
          <PickerField label="Enhet" colors={colors} basis={basis(150)}>
            <OptionPicker
              options={units.map((u) => ({ id: u, label: u }))}
              value={draft.unit}
              onChange={(id) => { if (id) set('unit')(id); }}
              onCustom={(text) => { const u = String(text || '').trim(); if (u) set('unit')(u); }}
              clearable={false}
              title="Enhet"
              searchPlaceholder="Søk eller skriv ny enhet"
            />
          </PickerField>
          <PickerField label="MVA" colors={colors} basis={basis(220)}>
            <OptionPicker
              options={VAT_OPTIONS}
              value={draft.vatCode}
              onChange={(id) => { if (id) set('vatCode')(id); }}
              clearable={false}
              title="MVA"
            />
          </PickerField>
          <Field label="Kostpris eks. mva" value={draft.cost} onChange={set('cost')} colors={colors} basis={basis(150)} keyboardType="decimal-pad" placeholder="Valgfritt" />
        </View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {`Pris inkl. mva ${formatMoney(withVat(price, draft.vatCode))} per ${draft.unit}`}
          {margin ? ` · Dekningsbidrag ${formatMoney(margin.amount)} (${String(margin.percent).replace('.', ',')} %)` : ''}
        </Text>
      </View>

      <View style={{ gap: 10 }}>
        <SectionLabel colors={colors}>Regnskap og lager</SectionLabel>
        <View style={styles.formRow}>
          <Field
            label="Salgskonto"
            value={draft.account}
            onChange={set('account')}
            colors={colors}
            basis={basis(150)}
            keyboardType="number-pad"
            placeholder={kind.account}
            hint={`Tomt = ${kind.account} for ${kind.label.toLowerCase()}`}
          />
          <PickerField label="Lagerstyring" colors={colors} basis={basis(200)}>
            <OptionPicker
              options={[{ id: 'off', label: 'Av' }, { id: 'on', label: 'Før lager' }]}
              value={draft.trackStock ? 'on' : 'off'}
              onChange={(id) => { if (id) setDraft((d) => ({ ...d, trackStock: id === 'on' })); }}
              clearable={false}
              small
              title="Lagerstyring"
            />
          </PickerField>
          {draft.trackStock ? (
            <Field label="Beholdning" value={draft.stock} onChange={set('stock')} colors={colors} basis={basis(130)} keyboardType="decimal-pad" placeholder="0" hint="Trekkes ved hvert salg" />
          ) : null}
        </View>
        <View style={styles.formRow}>
          <Field
            label="Internt notat"
            value={draft.notes}
            onChange={set('notes')}
            colors={colors}
            basis="100%"
            grow
            multiline
            placeholder="Vises bare her, ikke på faktura."
          />
        </View>
      </View>

      {localError || error ? (
        <Text style={{ color: colors.danger || '#b42318' }} nativeID="produkt-skjema-feil">{localError || error}</Text>
      ) : null}
      <View style={styles.actions}>
        <Btn label={busy ? 'Lagrer…' : isNew ? 'Opprett produkt' : 'Lagre endringer'} icon="checkmark" primary onPress={submit} disabled={busy} colors={colors} nativeID="produkt-lagre" />
        <Btn label="Avbryt" onPress={onCancel} disabled={busy} colors={colors} />
      </View>
    </View>
  );
}

export function SaleForm({ product, colors, narrow, customers, projects, busy, error, onSave, onCancel }) {
  const [date, setDate] = useState(todayKey());
  const [quantity, setQuantity] = useState('1');
  const [price, setPrice] = useState(numText(product.priceExVat));
  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [status, setStatus] = useState('approved');
  const [localError, setLocalError] = useState('');
  const qty = parseMoney(quantity) || 0;
  const unitPrice = parseMoney(price) || 0;
  const amount = roundMoney(qty * unitPrice);
  const basis = (n) => (narrow ? '100%' : n);
  const project = projects.find((row) => row.id === projectId) || null;

  const customerOptions = useMemo(() => customers.map((row) => ({
    id: row.id,
    label: row.name,
    hint: row.customerNumber ? `Kundenr ${row.customerNumber}` : undefined,
  })), [customers]);
  const projectOptions = useMemo(() => projects.map((row) => ({
    id: row.id,
    label: [row.number, row.name].filter(Boolean).join(' · ') || 'Uten navn',
    hint: row.client || undefined,
  })), [projects]);

  function pickProject(id) {
    setProjectId(id || '');
    const hit = projects.find((row) => row.id === id);
    if (!hit || customerId || customerName) return;
    const known = customers.find((row) => row.id === hit.customerId);
    if (known) setCustomerId(known.id);
    else if (hit.client) setCustomerName(hit.client);
  }

  function submit() {
    if (!(qty > 0)) {
      setLocalError('Antall må være større enn 0.');
      return;
    }
    if (price.trim() && parseMoney(price) == null) {
      setLocalError('Pris må være et tall.');
      return;
    }
    const customer = customers.find((row) => row.id === customerId) || null;
    setLocalError('');
    onSave(saleFromProduct(product, {
      date: date || todayKey(),
      quantity: qty,
      unitPrice,
      customerId: customer?.id || project?.customerId || '',
      customerNumber: customer?.customerNumber || '',
      customerName: customer?.name || customerName.trim() || project?.client || '',
      projectId: project?.id || '',
      projectNumber: project?.number || '',
      projectName: project?.name || '',
      status,
    }));
  }

  return (
    <View style={{ gap: 12 }} nativeID="produkt-salg-skjema">
      <View style={styles.formRow}>
        <PickerField label="Dato" colors={colors} basis={basis(190)}>
          <DateField value={date} onChange={(d) => setDate(d ? dateKey(d) : '')} />
        </PickerField>
        <Field label={`Antall (${product.unit})`} value={quantity} onChange={setQuantity} colors={colors} basis={basis(110)} keyboardType="decimal-pad" nativeID="produkt-salg-antall" />
        <Field label="Pris eks. mva" value={price} onChange={setPrice} colors={colors} basis={basis(140)} keyboardType="decimal-pad" />
      </View>
      <View style={styles.formRow}>
        <PickerField label="Prosjekt" colors={colors} basis={basis(260)} grow>
          <OptionPicker
            options={projectOptions}
            value={projectId}
            onChange={pickProject}
            placeholder={projectOptions.length ? 'Velg prosjekt' : 'Ingen aktive prosjekter'}
            clearLabel="Uten prosjekt"
            chipLimit={0}
            title="Prosjekt"
            disabled={!projectOptions.length}
          />
        </PickerField>
        {customerOptions.length ? (
          <PickerField label="Kunde" colors={colors} basis={basis(260)} grow>
            <OptionPicker
              options={customerOptions}
              value={customerId}
              onChange={(id) => { setCustomerId(id || ''); setCustomerName(''); }}
              placeholder={customerName || 'Velg kunde'}
              clearLabel="Uten kunde"
              chipLimit={0}
              title="Kunde"
            />
          </PickerField>
        ) : (
          <Field label="Kunde" value={customerName} onChange={setCustomerName} colors={colors} basis={basis(260)} grow />
        )}
      </View>
      <View style={styles.formRow}>
        <PickerField label="Status" colors={colors} basis="100%">
          <OptionPicker
            options={[{ id: 'approved', label: 'Klar for faktura' }, { id: 'draft', label: 'Utkast' }]}
            value={status}
            onChange={(id) => { if (id) setStatus(id); }}
            clearable={false}
            small
            title="Status"
          />
        </PickerField>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {`Sum ${formatMoney(amount)} eks. mva · ${formatMoney(withVat(amount, product.vatCode))} inkl. mva. `}
        {status === 'approved' ? 'Salget kommer med i Fakturagrunnlag.' : 'Utkast kommer med i Fakturagrunnlag når det er merket klart.'}
      </Text>
      {localError || error ? <Text style={{ color: colors.danger || '#b42318' }}>{localError || error}</Text> : null}
      <View style={styles.actions}>
        <Btn label={busy ? 'Lagrer…' : 'Registrer salg'} icon="cart-outline" primary onPress={submit} disabled={busy} colors={colors} nativeID="produkt-salg-lagre" />
        <Btn label="Avbryt" onPress={onCancel} disabled={busy} colors={colors} />
      </View>
    </View>
  );
}
