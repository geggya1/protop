import React from 'react';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { INVOICE_DELIVERY_OPTIONS, normalizeLinkSettings } from '../../src/intercompany/model';

function Choice({ options, value, onChange, colors, disabled, idPrefix }) {
  return (
    <View style={styles.choices}>
      {options.map((row) => {
        const on = row.id === value;
        return (
          <Pressable
            key={row.id}
            nativeID={`${idPrefix}-${row.id}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, disabled }}
            disabled={disabled}
            onPress={() => onChange(row.id)}
            style={[styles.choice, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
          >
            <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 13 }}>{row.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function Area({ title, hint, enabled, onToggle, colors, disabled }) {
  return (
    <View style={[styles.area, { borderColor: colors.line }]}>
      <View style={styles.areaHead}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{title}</Text>
          {hint ? <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text> : null}
        </View>
        <Switch value={enabled} onValueChange={onToggle} disabled={disabled} accessibilityLabel={title} />
      </View>
    </View>
  );
}

/**
 * Hva avtalen omfatter (timer, produktsalg, utleie) og hvordan fakturaen sendes. Gjelder begge
 * veier: den som leverer folk eller varer, fakturerer den andre. Prisen settes på prosjektnivå,
 * ikke her. value holder rå tekst fra feltene; normalizeLinkSettings gjør den om ved lagring.
 */
export default function LinkSettingsForm({ value, onChange, colors, disabled = false, ourCompanyId = '' }) {
  const raw = value || {};
  const s = normalizeLinkSettings(raw);
  const hours = { ...s.hours, ...(raw.hours || {}) };
  const products = { ...s.products, ...(raw.products || {}) };
  const rental = { ...s.rental, ...(raw.rental || {}) };
  const set = (patch) => onChange({ ...raw, ...patch });
  const ourEmail = ourCompanyId ? (raw.invoiceEmails?.[ourCompanyId] ?? '') : '';

  return (
    <View style={styles.block}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Prisen settes på hvert prosjekt. Prosjektet hos arbeidsgiveren starter med timeprisen på prosjekteierens
        prosjekt, og pris og betingelser kan endres der som på ethvert prosjekt.
      </Text>
      <Area
        title="Timer"
        hint="Timer ført på prosjekter hos det andre selskapet."
        enabled={hours.enabled !== false}
        onToggle={(on) => set({ hours: { ...hours, enabled: on } })}
        colors={colors}
        disabled={disabled}
      />
      <Area
        title="Produktsalg"
        hint="Varer som selges på prosjektet."
        enabled={products.enabled !== false}
        onToggle={(on) => set({ products: { ...products, enabled: on } })}
        colors={colors}
        disabled={disabled}
      />
      <Area
        title="Utleie av utstyr"
        hint="Maskiner og utstyr booket på prosjektet."
        enabled={rental.enabled !== false}
        onToggle={(on) => set({ rental: { ...rental, enabled: on } })}
        colors={colors}
        disabled={disabled}
      />
      <Text style={[styles.label, { color: colors.muted }]}>Faktura mellom selskapene sendes som</Text>
      <Choice
        idPrefix="ic-delivery"
        options={INVOICE_DELIVERY_OPTIONS}
        value={s.invoiceDelivery}
        onChange={(invoiceDelivery) => set({ invoiceDelivery })}
        colors={colors}
        disabled={disabled}
      />
      {ourCompanyId && s.invoiceDelivery === 'email' ? (
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.muted }]}>Vår fakturaadresse (e-post)</Text>
          <TextInput
            nativeID="ic-invoice-email"
            value={ourEmail}
            onChangeText={(email) => set({ invoiceEmails: { ...(raw.invoiceEmails || {}), [ourCompanyId]: email } })}
            editable={!disabled}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="faktura@selskap.no"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  area: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  areaHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  field: { gap: 4 },
  label: { fontSize: 12 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, fontSize: 16, minWidth: 120 },
});
