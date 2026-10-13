import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { setEmployeePath } from '../../src/employees/model';
import { SCHEDULE_DAYS, scheduleFromPercent, timeSettingsOf } from '../../src/arbeid/schedule.js';
import { formatHours, parseHours } from '../../src/arbeid/hours.js';
import { sendPasswordResetV2 } from '../../src/utils/sendPasswordReset';

const CHECKS = [
  { key: 'canLogin', label: 'Kan logge inn', path: 'company' },
  { key: 'activeEmployment', label: 'Har et aktivt arbeidsforhold' },
  { key: 'showFlexInTimesheet', label: 'Vis mertid i timelisten' },
  { key: 'includeInCapacity', label: 'Inkluder i selskapets kapasitetsoversikt' },
  { key: 'externalConsultant', label: 'Er ekstern konsulent' },
  { key: 'mustLockTimesheet', label: 'Skal låse timelisten' },
  { key: 'requireClockTimes', label: 'Skal spesifisere kom- og gå-tid' },
  { key: 'flexCountsAsPay', label: 'Mertid teller i lønn' },
];

const SUBS = [
  { id: 'general', label: 'Generelt' },
  { id: 'rate', label: 'Timepriser' },
  { id: 'work', label: 'Arbeidsforhold' },
  { id: 'password', label: 'Endre passord' },
  { id: 'notify', label: 'Varslinger' },
];

export default function EmployeeWorkViews({
  mode = 'settings',
  employee,
  colors,
  canEdit = false,
  expenses = [],
  onSave,
}) {
  if (mode === 'files') {
    const files = (expenses || []).filter((row) => row.employeeId === employee?.id && (row.receiptName || row.description));
    return (
      <View nativeID="employee-files" style={styles.wrap}>
        <Text style={[styles.title, { color: colors.ink }]}>Filer</Text>
        {files.map((row) => (
          <Text key={row.id} style={{ color: colors.ink, paddingVertical: 6 }}>
            {row.date} · {row.receiptName || row.description}
          </Text>
        ))}
        {!files.length ? <Text style={{ color: colors.muted }}>Ingen kvitteringer er knyttet til utlegg ennå.</Text> : null}
      </View>
    );
  }
  return (
    <EmployeeSettings employee={employee} colors={colors} canEdit={canEdit} onSave={onSave} />
  );
}

function EmployeeSettings({ employee, colors, canEdit, onSave }) {
  const settings = timeSettingsOf(employee);
  const [sub, setSub] = useState('general');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [target, setTarget] = useState(String(settings.utilizationTarget ?? 100));
  const [rate, setRate] = useState(settings.hourlyRate || '');
  const plan = useMemo(() => {
    const list = employee?.extras?.schedules || [];
    return list[list.length - 1] || null;
  }, [employee]);
  const [from, setFrom] = useState(plan?.from || '');
  const [days, setDays] = useState(plan?.days || scheduleFromPercent(employee?.company?.workPercent || 100, 7.5));

  function patchSettings(nextSettings, companyPatch = {}) {
    let next = setEmployeePath(employee, 'extras.timeSettings', {
      ...(employee?.extras?.timeSettings || {}),
      ...nextSettings,
    });
    for (const [key, value] of Object.entries(companyPatch)) {
      next = setEmployeePath(next, `company.${key}`, value);
    }
    return next;
  }

  async function toggle(key) {
    if (!canEdit) return;
    if (key === 'canLogin') {
      await onSave?.(setEmployeePath(employee, 'company.canLogin', employee?.company?.canLogin === false));
      return;
    }
    const current = timeSettingsOf(employee)[key];
    const value = !current;
    const companyPatch = {};
    if (key === 'activeEmployment') {
      companyPatch.status = value ? 'active' : 'inactive';
    }
    await onSave?.(patchSettings({ [key]: value }, companyPatch));
  }

  async function saveGoals() {
    const percent = Number(String(target).replace(',', '.'));
    await onSave?.(patchSettings({
      utilizationTarget: Number.isFinite(percent) ? percent : 100,
      hourlyRate: rate,
    }));
    setNote('Mål og timepris er lagret.');
  }

  async function savePlan() {
    const storedDays = {};
    for (const day of SCHEDULE_DAYS) {
      const slot = days[day.id] || {};
      storedDays[day.id] = {
        hours: parseHours(slot.hours),
        arrival: slot.arrival || '0:00',
        adjustment: slot.adjustment || '0:00',
      };
    }
    const row = {
      id: plan?.id || `plan_${Date.now().toString(36)}`,
      from: from || new Date().toISOString().slice(0, 10),
      days: storedDays,
    };
    const rest = (employee?.extras?.schedules || []).filter((item) => item.id !== row.id);
    await onSave?.(setEmployeePath(employee, 'extras.schedules', [...rest, row]));
    setNote('Tidsplanen er lagret.');
  }

  function fillFromPercent() {
    setDays(scheduleFromPercent(employee?.company?.workPercent || 100, 7.5));
  }

  async function resetPassword() {
    const email = employee?.person?.email || employee?.company?.email || '';
    if (!email) {
      setError('Medarbeideren mangler e-post.');
      return;
    }
    try {
      await sendPasswordResetV2(email);
      setError('');
      setNote('Lenke for nytt passord er sendt.');
    } catch (cause) {
      setError(String(cause?.message || cause || 'Kunne ikke sende passordlenke.'));
    }
  }

  async function closeAccount() {
    let next = setEmployeePath(employee, 'company.status', 'inactive');
    next = setEmployeePath(next, 'company.canLogin', false);
    await onSave?.(next);
    setNote('Medarbeiderkontoen er avsluttet.');
  }

  const flags = {
    ...settings,
    canLogin: employee?.company?.canLogin !== false,
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} nativeID="employee-time-settings">
      <Text style={[styles.title, { color: colors.ink }]}>Brukerinnstillinger</Text>
      <View style={styles.tabs}>
        {SUBS.map((row) => (
          <TouchableOpacity key={row.id} onPress={() => setSub(row.id)} accessibilityRole="tab">
            <Text style={{ color: sub === row.id ? colors.brand : colors.muted, fontWeight: sub === row.id ? '700' : '500' }}>{row.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {note ? <Text style={{ color: colors.brand }}>{note}</Text> : null}
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      {sub === 'general' ? (
        <View style={styles.checks}>
          {CHECKS.map((row) => {
            const on = !!flags[row.key];
            return (
              <TouchableOpacity key={row.key} onPress={() => toggle(row.key)} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <View style={[styles.box, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : 'transparent' }]}>
                  {on ? <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text> : null}
                </View>
                <Text style={{ color: colors.ink }}>{row.label}</Text>
              </TouchableOpacity>
            );
          })}
          <Text style={{ color: colors.muted, marginTop: 8 }}>Mål for faktureringsgrad</Text>
          <View style={styles.row}>
            <TextInput value={target} onChangeText={setTarget} editable={canEdit} style={[styles.input, { color: colors.ink, borderColor: colors.line }]} accessibilityLabel="Faktureringsgrad" />
            <Text style={{ color: colors.muted }}>% av forventede timer må være registrerte timer på prosjekter</Text>
          </View>
          {canEdit ? (
            <View style={styles.row}>
              <TouchableOpacity onPress={closeAccount} style={[styles.btn, { backgroundColor: '#dc2626' }]}>
                <Text style={styles.btnText}>Avslutt medarbeiderkonto</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={saveGoals} style={[styles.btn, { backgroundColor: colors.brand }]} nativeID="employee-settings-save">
                <Text style={styles.btnText}>Lagre endringer</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      {sub === 'rate' ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted }}>Timepris</Text>
          <TextInput value={rate} onChangeText={setRate} editable={canEdit} placeholder="kr / time" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, maxWidth: 180 }]} />
          {canEdit ? (
            <TouchableOpacity onPress={saveGoals} style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}>
              <Text style={styles.btnText}>Lagre timepris</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {sub === 'work' ? (
        <View nativeID="employee-schedule" style={{ gap: 10 }}>
          <View style={styles.row}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>Tidsplan</Text>
            {canEdit ? (
              <TouchableOpacity onPress={fillFromPercent} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Fra stillingsprosent ({employee?.company?.workPercent || 100} %)</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Gjelder fra</Text>
          <TextInput value={from} onChangeText={setFrom} editable={canEdit} placeholder="ÅÅÅÅ-MM-DD" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, maxWidth: 160 }]} />
          <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
            {SCHEDULE_DAYS.map((day) => {
              const slot = days[day.id] || { hours: 0, arrival: '0:00', adjustment: '0:00' };
              return (
                <View key={day.id} style={[styles.day, { borderColor: day.weekend ? '#fecaca' : colors.line, backgroundColor: day.weekend ? '#fff7f7' : colors.card }]}>
                  <Text style={{ color: colors.ink, fontWeight: '700' }}>{day.label}</Text>
                  <TextInput
                    value={typeof slot.hours === 'number' ? formatHours(slot.hours) : String(slot.hours ?? '')}
                    editable={canEdit}
                    onChangeText={(value) => setDays((current) => ({ ...current, [day.id]: { ...slot, hours: value } }))}
                    style={[styles.input, { color: colors.ink, borderColor: colors.line, textAlign: 'center' }]}
                    accessibilityLabel={`${day.label} timer`}
                  />
                  <Text style={{ color: colors.muted, fontSize: 11 }}>Kommer: {slot.arrival || '0:00'}</Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>Fratrekk/tillegg: {slot.adjustment || '0:00'}</Text>
                </View>
              );
            })}
          </ScrollView>
          {canEdit ? (
            <TouchableOpacity onPress={savePlan} style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]} nativeID="employee-schedule-save">
              <Text style={styles.btnText}>Lagre tidsplan</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {sub === 'password' ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted }}>Vi sender en lenke til medarbeiderens e-post for å sette nytt passord.</Text>
          <TouchableOpacity onPress={resetPassword} style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}>
            <Text style={styles.btnText}>Send passordlenke</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {sub === 'notify' ? (
        <View style={styles.checks}>
          {[
            { key: 'notifyTimesheet', label: 'Varsle om timeliste' },
            { key: 'notifyApproval', label: 'Varsle om godkjenning' },
          ].map((row) => {
            const on = settings[row.key] !== false;
            return (
              <TouchableOpacity key={row.key} onPress={() => toggle(row.key)} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: on }}>
                <View style={[styles.box, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : 'transparent' }]}>
                  {on ? <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text> : null}
                </View>
                <Text style={{ color: colors.ink }}>{row.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700' },
  tabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 8 },
  checks: { gap: 10, maxWidth: 560 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 18, height: 18, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 88 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
  day: { width: 140, borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
});
