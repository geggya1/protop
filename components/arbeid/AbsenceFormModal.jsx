import React, { useMemo, useState } from 'react';
import {
  Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import IsoDateField from './IsoDateField';
import OptionPicker from '../OptionPicker';
import CheckBox from '../CheckBox';
import { HEALTH_FREE_TEXT_NOTICE, absenceTypeById, isHealthAbsence } from '../../src/arbeid/absenceCatalog.js';
import {
  FORM_CATEGORIES, OCCASIONS, PROVIDERS, RELATIONS, WHO_FOR, categoryDaysUsed, defaultFormCategory, formCategory, formTypeFor,
  formWarnings, validateAbsenceForm,
} from '../../src/arbeid/absenceForm.js';
import { addDays, calendarDays, todayIso } from '../../src/arbeid/sickLeave.js';
import { radius, type } from '../../src/ui/tokens';

export const FORM_DECLARATION = 'Jeg bekrefter at opplysningene er riktige, og at dokumentasjon kan kreves.';

/**
 * Fraværsskjema for permisjon, annet fravær, legetime, kurs o.l. Grunnlaget velges etter
 * arbeidsmiljøloven kapittel 12, og skjemaet spør bare om det grunnlaget trenger.
 * Åpnes etter at fravær er ført i timelisten, fra «Mangler fraværsskjema» og fra fraværsdialogen.
 */
export default function AbsenceFormModal(props) {
  if (!props.visible) return null;
  const { initial } = props;
  const key = [initial?.id, initial?.type, initial?.fromDate, initial?.toDate].join(':');
  return <AbsenceForm key={key} {...props} />;
}

function workDayCount(fromDate, toDate, hoursForDate) {
  let n = 0;
  for (let d = fromDate; d && d <= toDate; d = addDays(d, 1)) {
    if (typeof hoursForDate !== 'function' || hoursForDate(d) > 0) n += 1;
  }
  return n;
}

function AbsenceForm({
  colors, catalog, rules = null, employeeId = '', employeeName = '', absences = [], hoursForDate, initial = null,
  onBehalf = false, busy = false, error = '', onClose, onSubmit, onSickChild,
}) {
  const start = initial?.fromDate || todayIso();
  // Typen dagene sto med da skjemaet ble åpnet. Skjemaet kan bytte til riktig type med/uten lønn.
  const typeId = initial?.originType || initial?.type || '';
  const [category, setCategory] = useState(initial?.category || defaultFormCategory(typeId, catalog));
  const [fromDate, setFromDate] = useState(start);
  const [toDate, setToDate] = useState(initial?.toDate || start);
  const [details, setDetails] = useState(initial?.details || {});
  const [reason, setReason] = useState(initial?.reason || '');
  const [note, setNote] = useState(initial?.note || '');
  const [confirmed, setConfirmed] = useState(!!initial?.confirmed);
  const [tried, setTried] = useState(false);
  const typeLabel = absenceTypeById(typeId, catalog).label;
  const cat = formCategory(category);
  const fields = cat?.fields || [];
  const health = cat?.health || isHealthAbsence(typeId, catalog);
  const end = toDate || fromDate;
  const days = calendarDays(fromDate, end);
  const set = (key) => (value) => setDetails((cur) => ({ ...cur, [key]: value }));

  const used = useMemo(() => (cat?.quota ? categoryDaysUsed(absences, {
    employeeId, category, year: Number(String(fromDate).slice(0, 4)), excludeFormId: initial?.id || '',
  }) : 0), [cat, absences, employeeId, category, fromDate, initial?.id]);
  const workDays = workDayCount(fromDate, end, hoursForDate);
  const form = { type: typeId, category, fromDate, toDate: end, details, reason, confirmed };
  const pay = cat ? formTypeFor(form, { rules, catalog }) : null;
  const resolvedLabel = pay?.resolvedType ? absenceTypeById(pay.resolvedType, catalog).label : typeLabel;
  const errors = validateAbsenceForm(form);
  const warnings = formWarnings(form, { usedDays: used, workDays });
  const shown = tried ? errors : [];

  function submit() {
    setTried(true);
    if (errors.length || busy) return;
    onSubmit?.({
      id: initial?.id || '',
      type: pay?.resolvedType || typeId,
      originType: typeId,
      category,
      fromDate,
      toDate: end,
      details,
      reason: reason.trim(),
      note: note.trim(),
      confirmed: true,
    });
  }

  const fieldStyle = [styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }];
  const textField = (key, label, placeholder, id) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={details[key] || ''}
        onChangeText={set(key)}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        maxLength={120}
        style={[fieldStyle, styles.short]}
        accessibilityLabel={label}
        nativeID={`fravaersskjema-${id}`}
      />
    </View>
  );

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.line }]}
          onPress={(event) => event.stopPropagation?.()}
          nativeID="fravaersskjema"
        >
          <ScrollView contentContainerStyle={styles.stack} keyboardShouldPersistTaps="handled">
            <View style={styles.head}>
              <View style={styles.flex}>
                <Text style={[styles.title, { color: colors.ink }]}>Fraværsskjema</Text>
                <Text style={[styles.body, { color: colors.muted }]}>
                  {onBehalf ? `${typeLabel} for ${employeeName || 'medarbeideren'}.` : `${typeLabel}. Går til leder for godkjenning.`}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk">
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Hva gjelder fraværet?</Text>
              <OptionPicker
                options={FORM_CATEGORIES.map((row) => ({ id: row.id, label: row.label }))}
                value={category}
                onChange={(id) => setCategory(id || '')}
                title="Hva gjelder fraværet?"
                placeholder="Velg grunnlag"
                clearable={false}
              />
            </View>

            {cat ? (
              <View style={[styles.info, { backgroundColor: colors.bg, borderColor: colors.line }]} nativeID="fravaersskjema-lov">
                <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
                <View style={styles.flex}>
                  {cat.law ? <Text style={[styles.label, { color: colors.ink }]}>{cat.law}</Text> : null}
                  {cat.info ? <Text style={[styles.body, { color: colors.ink }]}>{cat.info}</Text> : null}
                  {cat.quota ? (
                    <Text style={[styles.caption, { color: colors.muted }]}>
                      {`${used} av ${cat.quota} dager brukt i ${String(fromDate).slice(0, 4)}, ${workDays} arbeidsdag${workDays === 1 ? '' : 'er'} i dette skjemaet.`}
                    </Text>
                  ) : null}
                  {cat.docs ? <Text style={[styles.caption, { color: colors.muted }]}>Arbeidsgiver kan be om dokumentasjon (for eksempel vedtak fra NAV).</Text> : null}
                </View>
              </View>
            ) : null}

            {pay && pay.paid != null ? (
              <View style={[styles.info, { backgroundColor: colors.bg, borderColor: pay.paid ? colors.brand : colors.line }]} nativeID="fravaersskjema-lonn">
                <Ionicons name={pay.paid ? 'cash-outline' : 'remove-circle-outline'} size={18} color={pay.paid ? colors.brand : colors.muted} />
                <View style={styles.flex}>
                  <Text style={[styles.label, { color: colors.ink }]}>{`Føres som: ${resolvedLabel}`}</Text>
                  <Text style={[styles.caption, { color: colors.ink }]}>{pay.basis}</Text>
                  {pay.missingType ? (
                    <Text style={[styles.caption, { color: colors.warnInk || colors.ink }]}>
                      {`Bedriften har ikke fraværstypen «${absenceTypeById(pay.missingType).label}». Dagene beholder typen ${typeLabel}.`}
                    </Text>
                  ) : null}
                </View>
              </View>
            ) : null}

            <View style={styles.row}>
              <View style={[styles.flex, styles.field]}>
                <Text style={[styles.label, { color: colors.muted }]}>Fra og med</Text>
                <IsoDateField
                  value={fromDate}
                  onChange={(iso) => { setFromDate(iso); if (!toDate || toDate < iso) setToDate(iso); }}
                  nativeID="fravaersskjema-fra"
                />
              </View>
              <View style={[styles.flex, styles.field]}>
                <Text style={[styles.label, { color: colors.muted }]}>Til og med</Text>
                <IsoDateField value={toDate} min={fromDate} onChange={setToDate} nativeID="fravaersskjema-til" />
              </View>
            </View>
            <Text style={[styles.caption, { color: colors.muted }]}>
              {`${days} kalenderdag${days === 1 ? '' : 'er'} · ${workDays} arbeidsdag${workDays === 1 ? '' : 'er'} føres i timelisten`}
            </Text>

            {fields.includes('percent') ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>Permisjonsgrad (%)</Text>
                <TextInput
                  value={String(details.percent ?? 100)}
                  onChangeText={(v) => set('percent')(v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  maxLength={3}
                  style={[fieldStyle, styles.short]}
                  accessibilityLabel="Permisjonsgrad"
                  nativeID="fravaersskjema-grad"
                />
                <Text style={[styles.caption, { color: colors.muted }]}>Under 100 % er delvis permisjon (aml. § 12-6).</Text>
              </View>
            ) : null}

            {fields.includes('whoFor') ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>Hvem gjelder timen?</Text>
                <OptionPicker options={WHO_FOR} value={details.whoFor || ''} onChange={(id) => set('whoFor')(id || '')} title="Hvem gjelder timen?" placeholder="Velg" clearable={false} />
              </View>
            ) : null}
            {fields.includes('whoFor') && details.whoFor === 'barn' ? (
              <View style={[styles.info, { backgroundColor: colors.bg, borderColor: colors.line }]} nativeID="fravaersskjema-sykt-barn">
                <Ionicons name="help-circle-outline" size={18} color={colors.brand} />
                <View style={styles.flex}>
                  <Text style={[styles.body, { color: colors.ink }]}>Er barnet sykt?</Text>
                  <Text style={[styles.caption, { color: colors.muted }]}>
                    Følger du et sykt barn til lege eller sykehus, er det sykt barn-dag (omsorgsdager, aml. § 12-9 og ftrl. § 9-5) med lønn fra arbeidsgiver. Rutinekontroll og vaksine er ikke sykdom.
                  </Text>
                  <View style={styles.row}>
                    <TouchableOpacity
                      onPress={() => onSickChild?.({ fromDate, toDate: end })}
                      style={[styles.chip, { borderColor: colors.brand }]}
                      accessibilityRole="button"
                      nativeID="fravaersskjema-meld-sykt-barn"
                    >
                      <Text style={{ color: colors.brand, fontWeight: '600' }}>Ja, meld sykt barn</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => set('childSick')(false)}
                      style={[styles.chip, { borderColor: details.childSick === false ? colors.brand : colors.line }]}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: colors.ink }}>Nei, kontroll / annet</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : null}
            {fields.includes('provider') ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>Type time</Text>
                <OptionPicker options={PROVIDERS} value={details.provider || ''} onChange={(id) => set('provider')(id || '')} title="Type time" placeholder="Velg" clearable={false} />
              </View>
            ) : null}
            {fields.includes('ordered') ? (
              <CheckBox checked={details.ordered === true} onPress={() => set('ordered')(details.ordered !== true)} label="Kurset er pålagt av arbeidsgiver" />
            ) : null}

            {fields.includes('child') ? textField('childName', 'Barnets fornavn', 'Bare fornavn', 'barn') : null}
            {fields.includes('childDate') ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>Fødselsdato, termin eller omsorgsovertakelse</Text>
                <IsoDateField value={details.childDate || ''} onChange={set('childDate')} nativeID="fravaersskjema-barn-dato" />
              </View>
            ) : null}

            {fields.includes('occasion') ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>Anledning</Text>
                <OptionPicker options={OCCASIONS} value={details.occasion || ''} onChange={(id) => set('occasion')(id || '')} title="Anledning" placeholder="Velg anledning" clearable={false} />
              </View>
            ) : null}

            {fields.includes('relation') && (cat?.id !== 'velferd' || details.occasion === 'begravelse') ? (
              <View style={styles.field}>
                <Text style={[styles.label, { color: colors.muted }]}>{cat?.id === 'velferd' ? 'Relasjon til avdøde' : 'Hvem gjelder det?'}</Text>
                <OptionPicker
                  options={cat?.id === 'naerstaende' ? RELATIONS.filter((r) => ['forelder', 'partner', 'barn'].includes(r.id)) : RELATIONS}
                  value={details.relation || ''}
                  onChange={(id) => set('relation')(id || '')}
                  title="Relasjon"
                  placeholder="Velg relasjon"
                  clearable={false}
                />
                {cat?.id === 'naerstaende' && details.relation === 'barn' ? (
                  <Text style={[styles.caption, { color: colors.muted }]}>Gjelder funksjonshemmet eller kronisk sykt barn over 18 år.</Text>
                ) : null}
              </View>
            ) : null}
            {fields.includes('person') ? textField('person', 'Navn (valgfritt)', 'Den du gir omsorg til', 'person') : null}
            {fields.includes('education') ? textField('education', cat?.id === 'kurs' ? 'Kurs / seminar og arrangør' : 'Utdanning og studiested', cat?.id === 'kurs' ? 'For eksempel: ADK1, Byggenæringens kurs' : 'For eksempel: Fagskole, byggteknikk', 'utdanning') : null}
            {fields.includes('organ') ? textField('organ', cat?.id === 'verv' ? 'Verv og organ' : 'Tjeneste', cat?.id === 'verv' ? 'For eksempel: kommunestyret, Stavanger' : 'For eksempel: repetisjonsøvelse, Heimevernet', 'organ') : null}
            {fields.includes('holiday') ? textField('holiday', 'Høytid', 'For eksempel: Eid al-Fitr', 'hoytid') : null}

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>
                {cat?.reasonRequired || details.occasion === 'annet' || !cat ? 'Begrunnelse' : 'Utdypning (valgfritt)'}
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={health ? 'For eksempel: time hos fastlege' : 'Kort om fraværet'}
                placeholderTextColor={colors.muted}
                maxLength={300}
                multiline
                style={fieldStyle}
                accessibilityLabel="Begrunnelse"
                nativeID="fravaersskjema-begrunnelse"
              />
              {health ? <Text style={[styles.caption, { color: colors.muted }]}>{HEALTH_FREE_TEXT_NOTICE}</Text> : null}
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: colors.muted }]}>Merknad i timelisten (valgfritt)</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                maxLength={200}
                style={[fieldStyle, styles.short]}
                accessibilityLabel="Merknad"
                nativeID="fravaersskjema-merknad"
              />
            </View>

            {warnings.length ? (
              <View style={[styles.info, { borderColor: colors.warn || colors.line }]} nativeID="fravaersskjema-varsel">
                <Ionicons name="alert-circle-outline" size={18} color={colors.warnInk || colors.ink} />
                <Text style={[styles.body, styles.flex, { color: colors.warnInk || colors.ink }]}>{warnings.join(' ')}</Text>
              </View>
            ) : null}

            <CheckBox checked={confirmed} onPress={() => setConfirmed((v) => !v)} label={FORM_DECLARATION} />

            {shown.length || error ? (
              <View accessibilityRole="alert" style={[styles.info, { borderColor: colors.dangerInk || colors.danger }]}>
                <Ionicons name="alert-circle" size={18} color={colors.dangerInk || colors.danger} />
                <Text style={[styles.body, styles.flex, { color: colors.dangerInk || colors.danger }]}>
                  {[...shown, error].filter(Boolean).join(' ')}
                </Text>
              </View>
            ) : null}

            <View style={styles.actions}>
              <TouchableOpacity onPress={onClose} style={[styles.button, { borderColor: colors.line, borderWidth: 1 }]} accessibilityRole="button">
                <Text style={[styles.buttonText, { color: colors.ink }]}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={submit}
                disabled={busy}
                style={[styles.button, { backgroundColor: colors.brand, opacity: busy ? 0.5 : 1 }]}
                accessibilityRole="button"
                nativeID="fravaersskjema-send"
              >
                <Text style={[styles.buttonText, { color: colors.onBrand || '#fff' }]}>{busy ? 'Sender …' : 'Send skjema'}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** «Vil du fylle ut fraværsskjema?» rett etter at fraværet er lagret. */
export function AbsenceFormPrompt({ visible, colors, typeLabel = '', onLater, onOpen }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onLater}>
      <Pressable style={styles.backdrop} onPress={onLater}>
        <Pressable
          style={[styles.sheet, styles.prompt, { backgroundColor: colors.card, borderColor: colors.line }]}
          onPress={(event) => event.stopPropagation?.()}
          nativeID="fravaersskjema-sporsmal"
          accessibilityViewIsModal
        >
          <View style={styles.stack}>
            <Ionicons name="document-text-outline" size={28} color={colors.brand} />
            <Text style={[styles.title, { color: colors.ink }]}>Vil du registrere fraværet?</Text>
            <Text style={[styles.body, { color: colors.muted }]}>
              {`${typeLabel || 'Fraværet'} er ført i timelisten. Fyll ut fraværsskjemaet, så får leder begrunnelsen og kan godkjenne.`}
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity
                onPress={onLater}
                style={[styles.button, { borderColor: colors.line, borderWidth: 1 }]}
                accessibilityRole="button"
                nativeID="fravaersskjema-senere"
              >
                <Text style={[styles.buttonText, { color: colors.ink }]}>Senere</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onOpen}
                style={[styles.button, { backgroundColor: colors.brand }]}
                accessibilityRole="button"
                nativeID="fravaersskjema-apne"
              >
                <Text style={[styles.buttonText, { color: colors.onBrand || '#fff' }]}>Fyll ut skjema</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  sheet: {
    width: '100%', maxWidth: 480, maxHeight: '92%', borderRadius: radius.sheet, borderWidth: 1, padding: 18,
  },
  prompt: { maxWidth: 420 },
  stack: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  title: { ...type.title },
  body: { ...type.body },
  caption: { ...type.caption },
  label: { ...type.caption, fontWeight: '600' },
  info: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.card, padding: 12,
  },
  row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  field: { gap: 4, minWidth: 140 },
  input: {
    ...type.body, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 10, minHeight: 64, textAlignVertical: 'top',
  },
  short: { minHeight: 44 },
  chip: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 8, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  button: {
    flex: 1, borderRadius: radius.control, minHeight: 46, alignItems: 'center', justifyContent: 'center',
  },
  buttonText: { ...type.bodyStrong },
});
