import React, { useEffect, useState } from 'react';
import {
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import OptionPicker from '../OptionPicker';
import {
  AGREEMENT_OPTIONS, IA_SELF_CERT, PAID_LEAVE_OPTIONS, SICK_LEAVE_DEFAULTS, normalizeSickRules, selfCertScheme,
} from '../../src/arbeid/sickLeave.js';
import { loadSickRules, saveSickRules } from '../../src/arbeid/sickStorage.js';
import { radius, type } from '../../src/ui/tokens';

const SCHEMES = [
  {
    id: 'law',
    label: 'Lovens regler',
    detail: 'Egenmelding i inntil 3 kalenderdager om gangen etter to måneders ansettelse (ftrl § 8-24). Etter fire tilfeller på 12 måneder kan arbeidsgiver ta fra retten (ftrl § 8-27).',
  },
  {
    id: 'ia',
    label: 'IA-ordning',
    detail: 'Inntil 8 kalenderdager om gangen og 24 kalenderdager per 12 måneder. Ordningen fra IA-avtalen, som mange virksomheter har videreført.',
  },
  {
    id: 'custom',
    label: 'Egen ordning',
    detail: 'Velg antall dager om gangen (høyst 16, arbeidsgiverperioden) og eventuelt et tak per 12 måneder.',
  },
];

const STATUTORY = [
  'Egenmelding og sykmelding i arbeidsgiverperioden, 16 kalenderdager (ftrl. § 8-19)',
  'Sykt barn: omsorgsdager, de første 10 dagene betales av arbeidsgiver (ftrl. §§ 9-5 til 9-8)',
  'Svangerskapskontroll (aml. § 12-1)',
  'Ammefri inntil én time per dag til barnet er ett år (aml. § 12-8)',
];

/** Kompakt avkrysning i samme skrift som resten av innstillingene. */
function Check({ checked, onPress, label, colors, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      style={styles.check}
    >
      <View style={[styles.box, { borderColor: checked ? colors.brand : colors.muted, backgroundColor: checked ? colors.brand : colors.card }]}>
        {checked ? <Ionicons name="checkmark" size={13} color={colors.onBrand || '#fff'} /> : null}
      </View>
      <Text style={[styles.body, styles.flex, { color: colors.ink }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function digits(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 3);
}

/**
 * Fraværsinnstillinger → Sykefravær: egenmeldingsordningen bedriften bruker. Samme regler
 * som HR → Sykefravær (hr/sickLeave), så endringen gjelder begge steder.
 */
export default function SickRulesSettings({ familyId, colors, canEdit }) {
  const [rules, setRules] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    loadSickRules(familyId).then((loaded) => { if (live) setRules(loaded); });
    return () => { live = false; };
  }, [familyId]);

  if (!rules) return <Text style={{ color: colors.muted }}>Henter regler…</Text>;

  const current = draft || rules;
  const scheme = draft?.scheme || selfCertScheme(current);
  const set = (patch) => { setMessage(''); setDraft((d) => ({ ...(d || rules), scheme, ...patch })); };

  function pick(id) {
    if (!canEdit) return;
    if (id === 'law') set({ scheme: id, extendedSelfCert: false, annualCapDays: 0 });
    else if (id === 'ia') set({ scheme: id, ...IA_SELF_CERT });
    else set({ scheme: id, extendedSelfCert: true, extendedDays: current.extendedDays || SICK_LEAVE_DEFAULTS.extendedDays });
  }

  async function save() {
    if (!draft || busy) return;
    setBusy(true);
    setError('');
    try {
      const { scheme: _scheme, ...next } = draft;
      const saved = await saveSickRules(familyId, { ...next, denied: [] });
      setRules({ ...saved, denied: rules.denied });
      setDraft(null);
      setMessage('Reglene er lagret.');
    } catch (cause) {
      const denied = /permission|insufficient/i.test(String(cause?.message || cause?.code || ''));
      setError(denied ? 'Du trenger skrivetilgang til HR for å endre disse reglene.' : 'Kunne ikke lagre reglene.');
    } finally {
      setBusy(false);
    }
  }

  const effective = normalizeSickRules(current);
  const extended = scheme !== 'law' && effective.extendedSelfCert;

  return (
    <View style={styles.stack} nativeID="fravaer-innstillinger-sykefravaer">
      <Text style={[styles.body, { color: colors.muted }]}>
        Egenmeldingsordningen gjelder i timelisten og i skjemaet for sykefravær. Valgene nederst bestemmer hvilket fravær bedriften dekker ut over loven.
      </Text>

      {SCHEMES.map((row) => {
        const on = scheme === row.id;
        return (
          <TouchableOpacity
            key={row.id}
            onPress={() => pick(row.id)}
            disabled={!canEdit}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            nativeID={`egenmelding-ordning-${row.id}`}
            style={[styles.option, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft || colors.card : colors.card }]}
          >
            <Ionicons name={on ? 'radio-button-on' : 'radio-button-off'} size={20} color={on ? colors.brand : colors.muted} />
            <View style={styles.flex}>
              <Text style={[styles.strong, { color: colors.ink }]}>{row.label}</Text>
              <Text style={[styles.caption, { color: colors.muted }]}>{row.detail}</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {scheme === 'custom' ? (
        <View style={styles.row}>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.muted }]}>Dager om gangen (3–16)</Text>
            <TextInput
              value={String(current.extendedDays ?? '')}
              onChangeText={(v) => set({ extendedDays: digits(v) })}
              editable={canEdit}
              keyboardType="number-pad"
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              accessibilityLabel="Dager om gangen"
            />
          </View>
          <View style={styles.field}>
            <Text style={[styles.label, { color: colors.muted }]}>Tak per 12 måneder (0 = ingen)</Text>
            <TextInput
              value={String(current.annualCapDays ?? '')}
              onChangeText={(v) => set({ annualCapDays: digits(v) })}
              editable={canEdit}
              keyboardType="number-pad"
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              accessibilityLabel="Tak per 12 måneder"
            />
          </View>
        </View>
      ) : null}

      {scheme !== 'law' ? (
        <View style={styles.stackTight}>
          <Check
            checked={!!current.extendedDiscussed}
            onPress={() => set({ extendedDiscussed: !current.extendedDiscussed })}
            disabled={!canEdit}
            colors={colors}
            label="Drøftet med tillitsvalgte (ftrl § 8-24)"
          />
          {!current.extendedDiscussed ? (
            <Text style={[styles.caption, { color: colors.warnInk || colors.ink }]}>
              Utvidelsen gjelder ikke før drøftingen er krysset av. Til da gjelder lovens tre dager.
            </Text>
          ) : null}
        </View>
      ) : null}

      <Check
        checked={!!current.requireForm}
        onPress={() => set({ requireForm: !current.requireForm })}
        disabled={!canEdit}
        colors={colors}
        label="Krev skriftlig egenmelding i appen (ftrl § 8-26)"
      />

      <View style={[styles.info, { borderColor: colors.line, backgroundColor: colors.bg }]}>
        <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
        <View style={styles.flex}>
          <Text style={[styles.caption, { color: colors.ink }]}>
            {`Gjelder nå: ${extended && current.extendedDiscussed ? `${effective.extendedDays} kalenderdager om gangen` : '3 kalenderdager om gangen'}${effective.annualCapDays ? `, høyst ${effective.annualCapDays} dager per 12 måneder` : ''}.`}
          </Text>
          <Text style={[styles.caption, { color: colors.muted }]}>
            Helg mellom to fraværsdager regnes med: syk fredag og mandag er ett tilfelle på fire kalenderdager. Egenmelding fra de siste 16 dagene teller med.
          </Text>
          <Text style={[styles.caption, { color: colors.muted }]}>
            Sykt barn: egenmelding i 3 kalenderdager om gangen (ftrl § 9-7). Antall omsorgsdager følger av barna som er registrert på hver ansatt under Barn og omsorgsdager.
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { borderTopColor: colors.line }]} />
      <Text style={[styles.strong, { color: colors.ink }]}>Hva bedriften dekker</Text>

      <View style={[styles.group, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="fravaer-dekning-lovpalagt">
        <View style={[styles.groupHead, { backgroundColor: colors.successSoft || colors.bg, borderBottomColor: colors.line }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={colors.successInk || colors.brand} />
          <View style={styles.flex}>
            <Text style={[styles.strong, { color: colors.ink }]}>Lovpålagt</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>Alltid med lønn fra arbeidsgiver. Kan ikke slås av.</Text>
          </View>
        </View>
        {STATUTORY.map((label, i) => (
          <View key={label} style={[styles.itemRow, i > 0 && styles.itemLine, { borderTopColor: colors.line }]}>
            <Ionicons name="lock-closed" size={14} color={colors.muted} />
            <Text style={[styles.body, styles.flex, { color: colors.ink }]}>{label}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.group, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID="fravaer-dekning-valgfritt">
        <View style={[styles.groupHead, { backgroundColor: colors.brandSoft || colors.bg, borderBottomColor: colors.line }]}>
          <Ionicons name="options-outline" size={18} color={colors.brand} />
          <View style={styles.flex}>
            <Text style={[styles.strong, { color: colors.ink }]}>Ikke lovpålagt – bedriften velger</Text>
            <Text style={[styles.caption, { color: colors.muted }]}>
              Av som standard. Slå på det tariffavtale, personalhåndbok eller arbeidsavtale gir rett til. Fraværsskjemaet fører dagene med eller uten lønn etter valgene her.
            </Text>
          </View>
        </View>
        <View style={[styles.itemRow, styles.agreementRow]}>
          <Text style={[styles.label, { color: colors.muted }]}>Avtalegrunnlag</Text>
          <View style={styles.agreementPicker}>
            <OptionPicker
              options={AGREEMENT_OPTIONS}
              value={current.agreement || 'none'}
              onChange={(id) => canEdit && set({ agreement: id || 'none' })}
              title="Avtalegrunnlag"
              clearable={false}
              disabled={!canEdit}
            />
          </View>
        </View>
        {PAID_LEAVE_OPTIONS.map((row) => {
          const on = !!current.paidLeave?.[row.id];
          return (
            <TouchableOpacity
              key={row.id}
              onPress={() => canEdit && set({ paidLeave: { ...(current.paidLeave || {}), [row.id]: !on } })}
              disabled={!canEdit}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: !canEdit }}
              accessibilityLabel={row.label}
              nativeID={`fravaer-dekning-${row.id}`}
              style={[styles.itemRow, styles.itemLine, { borderTopColor: colors.line }]}
            >
              <View style={[styles.box, { borderColor: on ? colors.brand : colors.muted, backgroundColor: on ? colors.brand : colors.card }]}>
                {on ? <Ionicons name="checkmark" size={13} color={colors.onBrand || '#fff'} /> : null}
              </View>
              <Text style={[styles.body, styles.flex, { color: colors.ink }]}>{row.label}</Text>
              <View style={[styles.pill, { backgroundColor: on ? (colors.successSoft || colors.brandSoft || colors.bg) : colors.bg }]}>
                <Text style={[styles.pillText, { color: on ? (colors.successInk || colors.brand) : colors.muted }]}>{on ? 'Med lønn' : 'Uten lønn'}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {error ? <Text style={{ color: colors.dangerInk || colors.danger }}>{error}</Text> : null}
      {message ? <Text style={{ color: colors.brand }}>{message}</Text> : null}
      {canEdit && draft ? (
        <View style={styles.row}>
          <TouchableOpacity onPress={save} disabled={busy} style={[styles.button, { backgroundColor: colors.brand, opacity: busy ? 0.5 : 1 }]} accessibilityRole="button" nativeID="egenmelding-ordning-lagre">
            <Text style={[styles.strong, { color: colors.onBrand || '#fff' }]}>{busy ? 'Lagrer …' : 'Lagre'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setDraft(null)} style={[styles.button, { borderColor: colors.line, borderWidth: 1 }]} accessibilityRole="button">
            <Text style={[styles.strong, { color: colors.ink }]}>Avbryt</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  group: { borderWidth: 1, borderRadius: radius.card, overflow: 'hidden', maxWidth: 760 },
  groupHead: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  itemRow: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, minHeight: 44 },
  itemLine: { borderTopWidth: StyleSheet.hairlineWidth },
  agreementRow: { flexWrap: 'wrap' },
  agreementPicker: { flexGrow: 1, flexBasis: 240, maxWidth: 420 },
  check: { flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 36 },
  box: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  pillText: { ...type.caption, fontWeight: '600' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 4 },
  stackTight: { gap: 4 },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { flexGrow: 1, flexBasis: 180, gap: 4 },
  option: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.card, padding: 12 },
  info: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.card, padding: 12 },
  body: { ...type.body },
  caption: { ...type.caption },
  label: { ...type.caption, fontWeight: '600' },
  strong: { ...type.bodyStrong },
  input: { ...type.body, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 10 },
  button: { borderRadius: radius.control, minHeight: 44, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
});
