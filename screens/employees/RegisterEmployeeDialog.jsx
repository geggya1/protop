import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LANGUAGE_OPTIONS } from '../../src/employees/schema';
import { displayName } from '../../src/employees/model';
import {
  WORK_PLANS,
  buildFirstRegistration,
  defaultRegistrationLevel,
  registrationEmailState,
  registrationLevels,
} from '../../src/employees/register';
import { PHONE_COUNTRIES, parsePhoneInput } from '../../src/utils/phone';
import { dateKey } from '../../src/utils/dates';
import DateField from '../../components/DateField';

const LANGUAGE_IDS = {
  'Norsk bokmål': 'nb',
  'Norsk nynorsk': 'nn',
  Engelsk: 'en',
  Samisk: 'se',
};

function Field({ label, colors, children }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.ink }]}>{label}</Text>
      <View style={styles.control}>{children}</View>
    </View>
  );
}

function SelectField({
  nativeID, value, options, onChange, colors, placeholder, open, onToggle, disabled,
}) {
  const current = options.find((option) => option.value === value);
  return (
    <View style={styles.selectWrap}>
      <TouchableOpacity
        nativeID={nativeID}
        disabled={disabled}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: !!open, disabled: !!disabled }}
        style={[
          styles.input,
          styles.selectButton,
          { borderColor: colors.line, backgroundColor: colors.bg, opacity: disabled ? 0.55 : 1 },
        ]}
      >
        <Text style={{ color: current ? colors.ink : colors.placeholder, flex: 1 }} numberOfLines={1}>
          {current?.label || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </TouchableOpacity>
      {open && !disabled ? (
        <View style={[styles.menu, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <ScrollView style={styles.menuScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <TouchableOpacity
                  key={option.id || option.value}
                  nativeID={`${nativeID}-${option.id || option.value}`}
                  onPress={() => onChange(option.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.menuItem, selected && { backgroundColor: colors.brandSoft }]}
                >
                  <Text style={{ color: selected ? colors.brand : colors.ink }}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

export default function RegisterEmployeeDialog({
  visible = false,
  initialEmail = '',
  colors,
  employees = [],
  departments = [],
  canEditAccess = false,
  busy = false,
  onClose,
  onOpenExisting,
  onSubmit,
}) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dial, setDial] = useState('+47');
  const [national, setNational] = useState('');
  const [language, setLanguage] = useState('Norsk bokmål');
  const [externalNumber, setExternalNumber] = useState('');
  const [placement, setPlacement] = useState('internal');
  const [accessLevel, setAccessLevel] = useState('ansatt');
  const [departmentIds, setDepartmentIds] = useState([]);
  const [workPlan, setWorkPlan] = useState('full-40');
  const [periodFrom, setPeriodFrom] = useState('');
  const [sendWelcome, setSendWelcome] = useState(true);
  const [openMenu, setOpenMenu] = useState('');
  const [formError, setFormError] = useState('');
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!visible) {
      wasOpen.current = false;
      return;
    }
    if (wasOpen.current) return;
    wasOpen.current = true;
    setEmail(initialEmail || '');
    setFirstName('');
    setLastName('');
    setDial('+47');
    setNational('');
    setLanguage('Norsk bokmål');
    setExternalNumber('');
    setPlacement('internal');
    setAccessLevel('ansatt');
    setDepartmentIds([]);
    setWorkPlan('full-40');
    setPeriodFrom('');
    setSendWelcome(true);
    setOpenMenu('');
    setFormError('');
  }, [visible, initialEmail]);

  const emailState = registrationEmailState(employees, email);
  const showForm = emailState.status === 'new';
  const existing = emailState.status === 'existing' ? emailState.employee : null;
  const levels = registrationLevels(canEditAccess ? placement : 'internal', { canEditAccess });
  const chosenDepartments = departmentIds
    .map((id) => departments.find((row) => row.id === id))
    .filter(Boolean);
  const remainingDepartments = departments.filter((row) => !departmentIds.includes(row.id));

  function toggleMenu(id) {
    if (busy) return;
    setOpenMenu((current) => (current === id ? '' : id));
  }

  function choosePlacement(next) {
    if (!canEditAccess || busy) return;
    setPlacement(next);
    setOpenMenu('');
    const allowed = registrationLevels(next, { canEditAccess: true }).map((level) => level.id);
    setAccessLevel((current) => (allowed.includes(current) ? current : defaultRegistrationLevel(next)));
  }

  function addDepartment(id) {
    setDepartmentIds((current) => (current.includes(id) ? current : [...current, id]));
    setOpenMenu('');
  }

  async function submit() {
    if (busy) return;
    const phone = national.trim() ? parsePhoneInput(dial, national) : '';
    const result = buildFirstRegistration({
      email,
      firstName,
      lastName,
      phone,
      language,
      externalEmployeeNumber: externalNumber,
      placement: canEditAccess ? placement : 'internal',
      accessLevel: canEditAccess ? accessLevel : 'ansatt',
      departmentIds,
      workPlan,
      periodFrom,
      sendWelcome,
      canEditAccess,
    });
    if (!result.ok) {
      setFormError(result.errors.join('\n'));
      return;
    }
    setFormError('');
    try {
      await onSubmit?.(result);
    } catch (err) {
      setFormError(err?.message || 'Kunne ikke registrere medarbeideren.');
    }
  }

  const inputStyle = [
    styles.input,
    { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk" />
        <View
          nativeID="employee-register"
          accessibilityRole="dialog"
          accessibilityLabel="Registrer ny medarbeider"
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}
        >
          <View style={styles.head}>
            <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>Registrer ny medarbeider</Text>
            <TouchableOpacity
              nativeID="employee-register-close"
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Lukk"
            >
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <Field colors={colors} label="E-post">
              <TextInput
                nativeID="employee-register-email"
                accessibilityLabel="E-post"
                autoComplete="email"
                value={email}
                onChangeText={(value) => { setEmail(value); setFormError(''); }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="navn@firma.no"
                placeholderTextColor={colors.placeholder}
                style={inputStyle}
              />
            </Field>
            {emailState.status === 'invalid' && email.includes('@') ? (
              <Text style={{ color: colors.danger || '#b42318' }}>Skriv en gyldig e-postadresse.</Text>
            ) : null}
            {existing ? (
              <View nativeID="employee-register-existing" style={[styles.banner, styles.existingBanner]}>
                <Text style={styles.existingText}>
                  {`E-postadressen ${emailState.email} er allerede registrert på ${displayName(existing)}.`}
                </Text>
                <TouchableOpacity
                  nativeID="employee-register-open-existing"
                  onPress={() => onOpenExisting?.(existing)}
                  accessibilityRole="button"
                  style={[styles.secondary, { borderColor: colors.line }]}
                >
                  <Text style={{ color: colors.ink, fontWeight: '600' }}>Åpne medarbeideren</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {showForm ? (
              <View nativeID="employee-register-banner" style={styles.banner}>
                <Text style={styles.bannerText}>
                  {`E-postadressen ${emailState.email} er ikke registrert fra før. Vennligst oppgi den nye medarbeiderens for- og etternavn. ${
                    sendWelcome
                      ? 'Medarbeideren vil så motta en e-post med lenke til å sette passord.'
                      : 'Velkomstmalen sendes ikke. Personen kan inviteres senere.'
                  }`}
                </Text>
              </View>
            ) : null}
            {showForm ? (
              <>
                <Field colors={colors} label="Fornavn">
                  <TextInput
                    nativeID="employee-register-first"
                    accessibilityLabel="Fornavn"
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="Fornavn"
                    placeholderTextColor={colors.placeholder}
                    style={inputStyle}
                  />
                </Field>
                <Field colors={colors} label="Etternavn">
                  <TextInput
                    nativeID="employee-register-last"
                    accessibilityLabel="Etternavn"
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Etternavn"
                    placeholderTextColor={colors.placeholder}
                    style={inputStyle}
                  />
                </Field>
                <Field colors={colors} label="Mobiltelefon">
                  <View style={styles.phoneRow}>
                    <View style={styles.dial}>
                      <SelectField
                        nativeID="employee-register-dial"
                        value={dial}
                        options={PHONE_COUNTRIES.map((country) => ({
                          value: country.dial,
                          id: country.code,
                          label: `${country.flag} ${country.dial}`,
                        }))}
                        onChange={(value) => { setDial(value); setOpenMenu(''); }}
                        colors={colors}
                        open={openMenu === 'dial'}
                        onToggle={() => toggleMenu('dial')}
                      />
                    </View>
                    <TextInput
                      nativeID="employee-register-phone"
                      accessibilityLabel="Mobiltelefon"
                      value={national}
                      onChangeText={setNational}
                      keyboardType="phone-pad"
                      placeholder="900 00 000"
                      placeholderTextColor={colors.placeholder}
                      style={[inputStyle, styles.phoneInput]}
                    />
                  </View>
                </Field>
                <Field colors={colors} label="Språk">
                  <SelectField
                    nativeID="employee-register-language"
                    value={language}
                    options={LANGUAGE_OPTIONS.map((option) => ({
                      value: option,
                      id: LANGUAGE_IDS[option] || option,
                      label: option,
                    }))}
                    onChange={(value) => { setLanguage(value); setOpenMenu(''); }}
                    colors={colors}
                    open={openMenu === 'language'}
                    onToggle={() => toggleMenu('language')}
                  />
                </Field>
                <Field colors={colors} label="Eksternt ansattnummer">
                  <TextInput
                    nativeID="employee-register-number"
                    accessibilityLabel="Eksternt ansattnummer"
                    value={externalNumber}
                    onChangeText={setExternalNumber}
                    placeholderTextColor={colors.placeholder}
                    style={inputStyle}
                  />
                </Field>
                <Field colors={colors} label="Ansatt">
                  <View style={styles.radios}>
                    <TouchableOpacity
                      nativeID="employee-register-internal"
                      onPress={() => choosePlacement('internal')}
                      disabled={!canEditAccess}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: placement !== 'external' || !canEditAccess, disabled: !canEditAccess }}
                      style={styles.radio}
                    >
                      <View style={[styles.radioOuter, { borderColor: colors.brand }]}>
                        {(placement !== 'external' || !canEditAccess) ? <View style={[styles.radioInner, { backgroundColor: colors.brand }]} /> : null}
                      </View>
                      <Text style={{ color: colors.ink }}>Interne</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      nativeID="employee-register-external"
                      onPress={() => choosePlacement('external')}
                      disabled={!canEditAccess}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: canEditAccess && placement === 'external', disabled: !canEditAccess }}
                      style={[styles.radio, !canEditAccess && styles.locked]}
                    >
                      <View style={[styles.radioOuter, { borderColor: canEditAccess ? colors.brand : colors.line }]}>
                        {canEditAccess && placement === 'external' ? <View style={[styles.radioInner, { backgroundColor: colors.brand }]} /> : null}
                      </View>
                      <Text style={{ color: canEditAccess ? colors.ink : colors.muted }}>Eksterne</Text>
                    </TouchableOpacity>
                  </View>
                </Field>
                <Field colors={colors} label="Tagger">
                  <View style={styles.tags}>
                    {chosenDepartments.map((department) => (
                      <View key={department.id} style={[styles.tag, { backgroundColor: colors.brand }]}>
                        <Text style={styles.tagText}>{`Avdeling: ${department.name}`}</Text>
                        <TouchableOpacity
                          nativeID={`employee-register-dept-${department.id}`}
                          onPress={() => setDepartmentIds((current) => current.filter((id) => id !== department.id))}
                          accessibilityRole="button"
                          accessibilityLabel={`Fjern ${department.name}`}
                        >
                          <Text style={styles.tagText}>×</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                    {departments.length ? (
                      <SelectField
                        nativeID="employee-register-departments"
                        value=""
                        options={remainingDepartments.map((department) => ({
                          value: department.id,
                          id: department.id,
                          label: department.name,
                        }))}
                        placeholder={remainingDepartments.length ? 'Velg avdeling…' : 'Alle avdelinger er valgt'}
                        onChange={addDepartment}
                        colors={colors}
                        disabled={!remainingDepartments.length}
                        open={openMenu === 'dept'}
                        onToggle={() => toggleMenu('dept')}
                      />
                    ) : (
                      <Text style={{ color: colors.muted }}>Ingen avdelinger er opprettet under Selskap.</Text>
                    )}
                  </View>
                </Field>
                <Field colors={colors} label="Tilgangsstyring">
                  <SelectField
                    nativeID="employee-register-access"
                    value={canEditAccess ? accessLevel : 'ansatt'}
                    options={levels.map((level) => ({ value: level.id, id: level.id, label: level.label }))}
                    onChange={(value) => { setAccessLevel(value); setOpenMenu(''); }}
                    colors={colors}
                    disabled={!canEditAccess}
                    open={openMenu === 'access'}
                    onToggle={() => toggleMenu('access')}
                  />
                </Field>
                <Field colors={colors} label="Arbeidsplan">
                  <SelectField
                    nativeID="employee-register-plan"
                    value={workPlan}
                    options={WORK_PLANS.map((plan) => ({ value: plan.id, id: plan.id, label: plan.label }))}
                    onChange={(value) => { setWorkPlan(value); setOpenMenu(''); }}
                    colors={colors}
                    open={openMenu === 'plan'}
                    onToggle={() => toggleMenu('plan')}
                  />
                </Field>
                <Field colors={colors} label="Ansatt siden">
                  {/* Datovelger i stedet for fritekst (UX-14). Lagres som ISO-dato, som registreringen leser. */}
                  <View nativeID="employee-register-since" style={[inputStyle, styles.dateBox]}>
                    <DateField
                      value={periodFrom || null}
                      placeholder="Velg dato"
                      onChange={(day) => setPeriodFrom(day ? dateKey(day) : '')}
                      textStyle={{ color: periodFrom ? colors.ink : colors.placeholder }}
                      iconColor={colors.brand}
                    />
                  </View>
                </Field>
                <Field colors={colors} label="">
                <TouchableOpacity
                  nativeID="employee-register-welcome"
                  onPress={() => setSendWelcome((on) => !on)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: sendWelcome }}
                  style={styles.checkRow}
                >
                  <View style={[
                    styles.box,
                    { borderColor: sendWelcome ? colors.brand : colors.line, backgroundColor: sendWelcome ? colors.brand : colors.bg },
                  ]}
                  >
                    {sendWelcome ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                  </View>
                  <Text style={{ color: colors.ink }}>Send velkomstmall til medarbeideren</Text>
                </TouchableOpacity>
                </Field>
              </>
            ) : null}
          </ScrollView>
          {!!formError && (
            <Text nativeID="employee-register-error" style={{ color: colors.danger || '#b42318' }}>{formError}</Text>
          )}
          <View style={[styles.footer, { borderTopColor: colors.line }]}>
            <TouchableOpacity
              nativeID="employee-register-cancel"
              onPress={onClose}
              disabled={busy}
              accessibilityRole="button"
            >
              <Text style={{ color: colors.ink }}>Avbryt</Text>
            </TouchableOpacity>
            {showForm ? (
              <TouchableOpacity
                nativeID="employee-register-submit"
                onPress={submit}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.primary, { backgroundColor: colors.brand, opacity: busy ? 0.7 : 1 }]}
              >
                {busy
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.primaryText}>Registrer ny medarbeider</Text>}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(26, 21, 35, 0.55)' },
  card: {
    width: '100%',
    maxWidth: 560,
    maxHeight: Platform.OS === 'web' ? '90vh' : '92%',
    borderWidth: 1,
    borderRadius: 12,
    padding: 18,
    gap: 12,
    zIndex: 1,
    ...(Platform.OS === 'web' ? { boxShadow: '0 18px 48px rgba(15, 23, 42, 0.22)' } : {}),
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  title: { fontSize: 18, fontWeight: '700', flex: 1 },
  scroll: { flexGrow: 0, flexShrink: 1 },
  form: { gap: 10, paddingBottom: 4 },
  field: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  label: { width: 148, paddingTop: 10, fontSize: 14 },
  control: { flexGrow: 1, flexBasis: 220, minWidth: 180 },
  input: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  dateBox: { paddingVertical: 2, justifyContent: 'center' },
  phoneRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  dial: { width: 118 },
  phoneInput: { flex: 1 },
  selectWrap: { gap: 4 },
  selectButton: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 38 },
  menu: { borderWidth: 1, borderRadius: 6, overflow: 'hidden' },
  menuScroll: { maxHeight: 220 },
  menuItem: { paddingHorizontal: 10, paddingVertical: 8 },
  radios: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 38 },
  radio: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  radioOuter: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  radioInner: { width: 8, height: 8, borderRadius: 4 },
  locked: { opacity: 0.55 },
  tags: { gap: 8 },
  tag: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
  box: { width: 18, height: 18, borderRadius: 3, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  banner: { backgroundColor: '#d9f4f2', borderRadius: 4, padding: 12 },
  bannerText: { color: '#134e4a', fontSize: 14, lineHeight: 20 },
  existingBanner: { backgroundColor: '#fff7ed', gap: 10 },
  existingText: { color: '#7c2d12', fontSize: 14, lineHeight: 20 },
  footer: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, borderTopWidth: 1, paddingTop: 12 },
  primary: { borderRadius: 6, paddingHorizontal: 14, paddingVertical: 8, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondary: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
});
