import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import IsoDateField from './IsoDateField';
import CheckBox from '../CheckBox';
import {
  CHILD_DECLARATION,
  SELF_DECLARATION,
  SICK_KIND_LABEL,
  calendarDays,
  childCareQuota,
  selfCertStatus,
  todayIso,
  validateSickNote,
} from '../../src/arbeid/sickLeave.js';

const CONFIRM_ERROR = 'Du må bekrefte erklæringen før du sender.';

const KINDS = ['self', 'child', 'doctor'];

/**
 * Egenmeldingsskjema (ftrl §§ 8-23 og 8-26, 9-7). Brukes fra timelisten,
 * påminnelsen «Husk egenmelding» og av leder som melder på vegne av en ansatt.
 */
export default function SickNoteModal(props) {
  if (!props.visible) return null;
  const { initial } = props;
  // Ny nøkkel per åpning, så skjemaet starter med verdiene det åpnes med.
  const key = [initial?.id, initial?.kind, initial?.fromDate, initial?.toDate].join(':');
  return <SickNoteForm key={key} {...props} />;
}

function SickNoteForm({
  colors,
  employee,
  employeeName = '',
  absences = [],
  catalog,
  rules,
  initial = null,
  onBehalf = false,
  busy = false,
  onClose,
  onSubmit,
}) {
  const start = initial?.fromDate || todayIso();
  const [kind, setKind] = useState(KINDS.includes(initial?.kind) ? initial.kind : 'self');
  const [fromDate, setFromDate] = useState(start);
  const [toDate, setToDate] = useState(initial?.toDate || start);
  const [percent, setPercent] = useState(String(initial?.percent || 100));
  const [confirmed, setConfirmed] = useState(!!initial?.confirmed);
  const [workRelated, setWorkRelated] = useState(!!initial?.workRelated);
  const [note, setNote] = useState(initial?.note || '');
  const [tried, setTried] = useState(false);

  const others = useMemo(
    () => (initial?.id ? absences.filter((row) => row.caseId !== initial.id) : absences),
    [absences, initial?.id],
  );
  const status = useMemo(
    () => selfCertStatus({ employee, absences: others, catalog, rules, at: fromDate || todayIso() }),
    [employee, others, catalog, rules, fromDate],
  );
  const childQuota = useMemo(
    () => childCareQuota(employee?.extras?.childCare, {
      absences: others,
      employeeId: employee?.id,
      year: Number(String(fromDate || todayIso()).slice(0, 4)),
      catalog,
    }),
    [employee, others, fromDate, catalog],
  );
  const check = useMemo(() => validateSickNote({
    kind,
    fromDate,
    toDate,
    employee,
    absences,
    catalog,
    rules,
    confirmed: kind === 'doctor' ? true : confirmed,
    childQuota,
    ignoreCaseId: initial?.id || '',
  }), [kind, fromDate, toDate, employee, absences, catalog, rules, confirmed, childQuota, initial?.id]);

  const days = calendarDays(fromDate, toDate || fromDate);
  const declaration = kind === 'child' ? CHILD_DECLARATION : SELF_DECLARATION;
  const who = employeeName || 'deg';

  function submit() {
    setTried(true);
    if (!check.ok || busy) return;
    onSubmit?.({
      ...(initial?.id ? { id: initial.id } : {}),
      kind,
      fromDate,
      toDate: toDate || fromDate,
      percent: kind === 'doctor' ? Number(percent) || 100 : 100,
      confirmed: kind === 'doctor' ? false : confirmed,
      declaration: kind === 'doctor' ? '' : declaration,
      workRelated,
      note,
      onBehalf,
    });
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}
          onPress={(event) => event.stopPropagation?.()}
          nativeID="egenmelding-skjema"
        >
          <ScrollView contentContainerStyle={{ gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={styles.head}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.title, { color: colors.ink }]}>
                  {initial?.id ? 'Endre melding om fravær' : 'Meld sykefravær'}
                </Text>
                <Text style={{ color: colors.muted }}>
                  {onBehalf ? `Du melder på vegne av ${who}.` : 'Meldingen går til leder for behandling.'}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk">
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.segment} accessibilityRole="radiogroup">
              {KINDS.map((id) => {
                const on = kind === id;
                return (
                  <TouchableOpacity
                    key={id}
                    onPress={() => setKind(id)}
                    style={[styles.segBtn, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : 'transparent' }]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    nativeID={`egenmelding-type-${id}`}
                  >
                    <Text style={{ color: on ? '#fff' : colors.ink, fontWeight: '600' }}>{SICK_KIND_LABEL[id]}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <QuotaBox colors={colors} kind={kind} status={status} childQuota={childQuota} />

            <View style={styles.row}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.label, { color: colors.muted }]}>Fra og med</Text>
                <IsoDateField value={fromDate} onChange={(iso) => { setFromDate(iso); if (!toDate || toDate < iso) setToDate(iso); }} nativeID="egenmelding-fra" />
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[styles.label, { color: colors.muted }]}>Til og med</Text>
                <IsoDateField value={toDate} min={fromDate} onChange={setToDate} nativeID="egenmelding-til" />
              </View>
            </View>
            <Text style={{ color: colors.muted }}>{`${days} kalenderdag${days === 1 ? '' : 'er'}`}</Text>

            {kind === 'doctor' ? (
              <View style={{ gap: 4 }}>
                <Text style={[styles.label, { color: colors.muted }]}>Sykmeldingsgrad (%)</Text>
                <TextInput
                  value={percent}
                  onChangeText={(value) => setPercent(value.replace(/[^\d]/g, '').slice(0, 3))}
                  keyboardType="number-pad"
                  style={[styles.field, { color: colors.ink, borderColor: colors.line }]}
                  nativeID="egenmelding-grad"
                />
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  Sykmeldingen sendes digitalt fra legen via NAV. Her registreres bare perioden og graden.
                </Text>
              </View>
            ) : (
              <CheckBox checked={confirmed} onPress={() => setConfirmed((v) => !v)} label={declaration} />
            )}

            <CheckBox
              checked={workRelated}
              onPress={() => setWorkRelated((v) => !v)}
              label="Fraværet kan ha sammenheng med forhold på jobben"
            />

            <View style={{ gap: 4 }}>
              <Text style={[styles.label, { color: colors.muted }]}>Behov for tilrettelegging eller beskjed til leder</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                multiline
                placeholder="Ikke skriv diagnose eller helseopplysninger."
                placeholderTextColor={colors.muted}
                style={[styles.field, styles.area, { color: colors.ink, borderColor: colors.line }]}
                nativeID="egenmelding-merknad"
              />
            </View>

            {/* Lovkrav (dager, ansettelsestid, fratatt rett) vises med en gang. Glemt avkrysning først ved sending. */}
            {check.errors.filter((msg) => tried || msg !== CONFIRM_ERROR).length ? (
              <View style={[styles.block, { borderColor: '#F04438', backgroundColor: '#FEF3F2' }]} nativeID="egenmelding-feil" accessibilityRole="alert">
                {check.errors.filter((msg) => tried || msg !== CONFIRM_ERROR).map((msg) => (
                  <View key={msg} style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
                    <Ionicons name="alert-circle" size={18} color="#B42318" />
                    <Text style={[styles.msg, { color: '#B42318', flex: 1 }]}>{msg}</Text>
                  </View>
                ))}
                {kind === 'self' && check.errors.some((msg) => msg !== CONFIRM_ERROR) ? (
                  <TouchableOpacity
                    onPress={() => { setKind('doctor'); setTried(false); }}
                    style={[styles.switchBtn, { borderColor: '#B42318' }]}
                    accessibilityRole="button"
                    nativeID="egenmelding-bytt-sykmelding"
                  >
                    <Ionicons name="document-text-outline" size={16} color="#B42318" />
                    <Text style={{ color: '#B42318', fontWeight: '700' }}>Registrer som sykmelding i stedet</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            {check.warnings.map((msg) => (
              <Text key={msg} style={[styles.msg, { color: '#9A6700' }]}>{msg}</Text>
            ))}

            <View style={styles.actions}>
              <TouchableOpacity onPress={onClose} style={[styles.ghost, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submit}
                disabled={busy}
                style={[styles.cta, { backgroundColor: colors.brand, opacity: busy || (tried && !check.ok) ? 0.6 : 1 }]}
                nativeID="egenmelding-send"
                accessibilityRole="button"
              >
                <Text style={styles.ctaText}>{busy ? 'Sender…' : (initial?.id ? 'Lagre' : 'Send melding')}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function QuotaBox({ colors, kind, status, childQuota }) {
  if (kind === 'child') {
    return (
      <View style={[styles.quota, { borderColor: colors.line }]} nativeID="egenmelding-kvote">
        <Text style={[styles.quotaTitle, { color: colors.ink }]}>Omsorgsdager {childQuota.year}</Text>
        <Text style={{ color: colors.muted }}>
          {childQuota.unknown
            ? (childQuota.registered
              ? 'Ingen barn under 12 år er registrert.'
              : 'Barna er ikke registrert. Registrer dem på ansattkortet ditt under «Barn og omsorgsdager».')
            : `${childQuota.used} av ${childQuota.total} dager brukt · ${childQuota.remaining} igjen`}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Egenmelding for sykt barn gjelder tre kalenderdager om gangen.</Text>
      </View>
    );
  }
  if (kind === 'doctor') return null;
  return (
    <View style={[styles.quota, { borderColor: colors.line }]} nativeID="egenmelding-kvote">
      <Text style={[styles.quotaTitle, { color: colors.ink }]}>Egenmelding siste 12 måneder</Text>
      <Text style={{ color: colors.muted }}>
        {`${status.occasionsUsed} gang${status.occasionsUsed === 1 ? '' : 'er'} · ${status.daysUsed} dager${status.daysLeft != null ? ` · ${status.daysLeft} dager igjen av ${status.annualCapDays}` : ''}`}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        {`Inntil ${status.maxDaysPerOccasion} kalenderdager om gangen. Lengre fravær dokumenteres med sykmelding.`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  sheet: { width: '100%', maxWidth: 520, maxHeight: '92%', borderRadius: 14, borderWidth: 1, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 2 },
  segment: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  segBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, minHeight: 40, justifyContent: 'center' },
  quota: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 4 },
  quotaTitle: { fontWeight: '700' },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  label: { fontSize: 12, fontWeight: '600' },
  field: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  area: { minHeight: 72, textAlignVertical: 'top' },
  msg: { fontSize: 13, lineHeight: 18 },
  block: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 10 },
  switchBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  ghost: { flex: 1, borderWidth: 1, borderRadius: 10, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  cta: { flex: 1, borderRadius: 10, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  ctaText: { color: '#fff', fontWeight: '700' },
});
