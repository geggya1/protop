import React, { useEffect, useState } from 'react';
import {
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CheckBox from '../CheckBox';
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
        Egenmeldingsordningen gjelder i timelisten og i skjemaet for sykefravær, og står også under HR → Sykefravær. Lønnsvalgene nederst styrer fraværsskjemaet.
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
          <CheckBox
            checked={!!current.extendedDiscussed}
            onPress={canEdit ? () => set({ extendedDiscussed: !current.extendedDiscussed }) : undefined}
            label="Drøftet med tillitsvalgte (ftrl § 8-24)"
          />
          {!current.extendedDiscussed ? (
            <Text style={[styles.caption, { color: colors.warnInk || colors.ink }]}>
              Utvidelsen gjelder ikke før drøftingen er krysset av. Til da gjelder lovens tre dager.
            </Text>
          ) : null}
        </View>
      ) : null}

      <CheckBox
        checked={!!current.requireForm}
        onPress={canEdit ? () => set({ requireForm: !current.requireForm }) : undefined}
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
      <Text style={[styles.strong, { color: colors.ink }]}>Lønn ved permisjon og legetime</Text>
      <Text style={[styles.caption, { color: colors.muted }]}>
        Arbeidsmiljøloven gir lønn bare ved svangerskapskontroll (§ 12-1) og ammefri inntil én time per dag første leveår (§ 12-8). Sykt barn betales som omsorgsdager (ftrl. § 9-5). Alt annet følger av tariffavtale, personalhåndbok eller arbeidsavtale. Kryss av det avtalen gir lønn for, så fører fraværsskjemaet dagene som fravær med eller uten lønn.
      </Text>
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.muted }]}>Avtalegrunnlag</Text>
        <OptionPicker
          options={AGREEMENT_OPTIONS}
          value={current.agreement || 'none'}
          onChange={(id) => canEdit && set({ agreement: id || 'none' })}
          title="Avtalegrunnlag"
          clearable={false}
          disabled={!canEdit}
        />
      </View>
      {PAID_LEAVE_OPTIONS.map((row) => (
        <CheckBox
          key={row.id}
          checked={!!current.paidLeave?.[row.id]}
          onPress={canEdit ? () => set({ paidLeave: { ...(current.paidLeave || {}), [row.id]: !current.paidLeave?.[row.id] } }) : undefined}
          label={`Med lønn: ${row.label}`}
        />
      ))}

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
