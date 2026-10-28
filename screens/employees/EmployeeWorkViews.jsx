import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { displayName, newId, setEmployeePath } from '../../src/employees/model';
import { employmentEndDate, isActiveEmployee, todayKey } from '../../src/employees/employmentState';
import { confirmUser } from '../../src/utils/dialog';
import { employmentFlags } from '../../src/employees/employmentFlags';
import {
  SCHEDULE_DAYS,
  departureOf,
  formatScheduleDate,
  normalizeScheduleRow,
  parseScheduleDate,
  removeSchedule,
  replaceSchedule,
  dayAfter,
  scheduleFromPercent,
  scheduleIdentity,
  scheduleRange,
  sortedSchedules,
  STANDARD_DAY_HOURS,
  timeSettingsOf,
} from '../../src/arbeid/schedule.js';
import { formatHours, parseHours } from '../../src/arbeid/hours.js';
import { toDateKey } from '../../src/arbeid/calendar.js';
import { sendPasswordResetV2 } from '../../src/utils/sendPasswordReset';
import { formatDate } from '../../src/format/nb';

// «Kan logge inn» er ikke et eget valg: innlogging følger kobling og om ansettelsen er aktiv.
const CHECKS = [
  { key: 'activeEmployment', label: 'Har et aktivt arbeidsforhold' },
  { key: 'showFlexInTimesheet', label: 'Vis mertid i timelisten' },
  // Kapasitet og ekstern følger personelltypen under rettigheter.
  { key: 'includeInCapacity', label: 'Inkluder i selskapets kapasitetsoversikt', locked: 'kind' },
  { key: 'externalConsultant', label: 'Er ekstern konsulent', locked: 'kind' },
  // Lås og kom/gå-tid settes ikke her for eksternt personell.
  { key: 'mustLockTimesheet', label: 'Skal låse timelisten', locked: 'external' },
  { key: 'requireClockTimes', label: 'Skal spesifisere kom- og gå-tid', locked: 'external' },
  { key: 'flexCountsAsPay', label: 'Mertid teller i lønn' },
];

export default function EmployeeWorkViews({
  mode = 'settings',
  employee,
  colors,
  canEdit = false,
  expenses = [],
  onSave,
  // Delen av brukerinnstillingene. Menyen ligger øverst på personen (Innstillinger), ikke her.
  sub = 'general',
}) {
  if (mode === 'files') {
    const files = (expenses || []).filter((row) => row.employeeId === employee?.id && (row.receiptName || row.description));
    return (
      <View nativeID="employee-files" style={styles.wrap}>
        <Text style={[styles.title, { color: colors.ink }]}>Filer</Text>
        {files.map((row) => (
          <Text key={row.id} style={{ color: colors.ink, paddingVertical: 6 }}>
            {formatDate(row.date)} · {row.receiptName || row.description}
          </Text>
        ))}
        {!files.length ? <Text style={{ color: colors.muted }}>Ingen kvitteringer er knyttet til utlegg ennå.</Text> : null}
      </View>
    );
  }
  return (
    <EmployeeSettings employee={employee} colors={colors} canEdit={canEdit} onSave={onSave} sub={sub} />
  );
}

function EmployeeSettings({ employee, colors, canEdit, onSave, sub = 'general' }) {
  const settings = timeSettingsOf(employee);
  const membership = employmentFlags(employee);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [target, setTarget] = useState(String(settings.utilizationTarget ?? 100));
  const [rate, setRate] = useState(settings.hourlyRate || '');

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

  function rowLocked(row, membership) {
    if (!canEdit) return true;
    if (row.locked === 'kind') return true;
    return row.locked === 'external' && membership.externalRules;
  }

  async function toggle(key) {
    const row = CHECKS.find((item) => item.key === key);
    if (row ? rowLocked(row, membership) : !canEdit) return;
    const current = timeSettingsOf(employee)[key];
    const value = !current;
    const companyPatch = {};
    if (key === 'activeEmployment') {
      if (!value) {
        await closeAccount();
        return;
      }
      companyPatch.status = 'active';
      // En passert sluttdato ville holdt ansettelsen avsluttet.
      if (employmentEndDate(employee) && employmentEndDate(employee) < todayKey()) companyPatch.periodTo = '';
    }
    setNote('');
    setError('');
    const ok = await onSave?.(patchSettings({ [key]: value }, companyPatch));
    if (ok && key === 'activeEmployment') setNote('Arbeidsforholdet er aktivt igjen.');
  }

  async function saveGoals() {
    const percent = Number(String(target).replace(',', '.'));
    const ok = await onSave?.(patchSettings({
      utilizationTarget: Number.isFinite(percent) ? percent : 100,
      hourlyRate: rate,
    }));
    if (ok) setNote('Mål og timepris er lagret.');
  }

  async function resetPassword() {
    if (!canEdit) return;
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

  /** Avslutt: bekreft først, sett sluttdato til i dag, og si fra bare når lagringen lyktes. */
  async function closeAccount() {
    if (!canEdit || !isActiveEmployee(employee)) return;
    const name = displayName(employee);
    const sure = await confirmUser(
      'Avslutte medarbeiderkontoen?',
      `${name} tas ut av bedriften, logges ut og mister all tilgang. Timer, fravær og dokumenter blir liggende. Du kan aktivere kontoen igjen senere.`,
      { ok: 'Avslutt kontoen' },
    );
    if (!sure) return;
    setNote('');
    setError('');
    const today = todayKey();
    let next = patchSettings({ activeEmployment: false }, { status: 'inactive', canLogin: false });
    const end = employmentEndDate(employee);
    if (!end || end > today) next = setEmployeePath(next, 'company.periodTo', today);
    const ok = await onSave?.(next);
    if (ok) setNote('Medarbeiderkontoen er avsluttet.');
    else setError('Kontoen ble ikke avsluttet. Se feilmeldingen øverst og prøv igjen.');
  }

  const flags = {
    ...settings,
    activeEmployment: isActiveEmployee(employee),
    includeInCapacity: membership.includeInCapacity,
    externalConsultant: membership.externalConsultant,
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} nativeID="employee-time-settings">
      {note ? <Text style={{ color: colors.brand }}>{note}</Text> : null}
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      {sub === 'general' ? (
        <View style={styles.checks}>
          {CHECKS.map((row) => {
            const on = !!flags[row.key];
            const locked = rowLocked(row, membership);
            const box = (
              <View style={[styles.box, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : 'transparent', opacity: locked ? 0.45 : 1 }]}>
                {on ? <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text> : null}
              </View>
            );
            const label = <Text style={{ color: locked ? colors.muted : colors.ink, flex: 1 }}>{row.label}</Text>;
            if (locked) {
              return (
                <View key={row.key} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: true }}>
                  {box}
                  {label}
                </View>
              );
            }
            return (
              <TouchableOpacity key={row.key} onPress={() => toggle(row.key)} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: false }}>
                {box}
                {label}
              </TouchableOpacity>
            );
          })}
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Eksternt personell og kapasitetsoversikten styres under rettigheter.
          </Text>
          <Text style={{ color: colors.muted, marginTop: 8 }}>Mål for faktureringsgrad</Text>
          <View style={styles.row}>
            <TextInput value={target} onChangeText={setTarget} editable={canEdit} style={[styles.input, { color: colors.ink, borderColor: colors.line }]} accessibilityLabel="Faktureringsgrad" />
            <Text style={{ color: colors.muted }}>% av forventede timer må være registrerte timer på prosjekter</Text>
          </View>
          {canEdit ? (
            <View style={styles.row}>
              {isActiveEmployee(employee) ? (
                <TouchableOpacity
                  nativeID="employee-settings-close"
                  onPress={closeAccount}
                  accessibilityRole="button"
                  style={[styles.btn, { backgroundColor: '#dc2626' }]}
                >
                  <Text style={styles.btnText}>Avslutt medarbeiderkonto</Text>
                </TouchableOpacity>
              ) : null}
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
        <ScheduleSection
          employee={employee}
          colors={colors}
          canEdit={canEdit}
          onSave={onSave}
          onNote={setNote}
          onError={setError}
        />
      ) : null}

      {sub === 'password' ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted }}>Vi sender en lenke til medarbeiderens e-post for å sette nytt passord.</Text>
          {canEdit ? (
            <TouchableOpacity onPress={resetPassword} nativeID="employee-password-send" style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}>
              <Text style={styles.btnText}>Send passordlenke</Text>
            </TouchableOpacity>
          ) : null}
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
              <TouchableOpacity key={row.key} onPress={() => toggle(row.key)} disabled={!canEdit} style={styles.check} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: !canEdit }}>
                <View style={[styles.box, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brand : 'transparent', opacity: canEdit ? 1 : 0.45 }]}>
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

function editableDays(days) {
  const next = {};
  for (const day of SCHEDULE_DAYS) {
    const slot = days?.[day.id] || {};
    const arrival = formatHours(slot.arrival || 0);
    const hours = formatHours(slot.hours || 0);
    const leave = slot.leave ? formatHours(slot.leave) : departureOf({ arrival, hours });
    next[day.id] = {
      hours,
      arrival,
      leave,
      adjustment: formatHours(slot.adjustment || 0),
      leaveTouched: Boolean(slot.leave),
    };
  }
  return next;
}

function ScheduleSection({ employee, colors, canEdit, onSave, onNote, onError }) {
  const plans = useMemo(() => sortedSchedules(employee?.extras?.schedules), [employee]);
  const [editor, setEditor] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function openEditor(plan, isNew) {
    onError('');
    onNote('');
    setConfirmDelete(false);
    setEditor({
      id: plan.id || newId('plan'),
      isNew,
      previousId: plan.id || '',
      previousFrom: isNew ? '' : (plan.from || ''),
      fromText: formatScheduleDate(plan.from) || plan.from || '',
      toText: plan.to ? formatScheduleDate(plan.to) : '',
      days: editableDays(plan.days),
    });
  }

  function startCreate() {
    if (editor) {
      onError('Lagre eller avbryt tidsplanen du redigerer.');
      return;
    }
    const today = toDateKey(new Date());
    const ordered = [...plans].sort((a, b) => String(a.from).localeCompare(String(b.from)));
    const latest = ordered[ordered.length - 1];
    let from = today;
    if (latest?.to && latest.to >= from) from = dayAfter(latest.to);
    else if (latest?.from && latest.from >= from) from = dayAfter(latest.from);
    const source = ordered.filter((plan) => plan.from && plan.from <= from).slice(-1)[0] || latest;
    openEditor({
      id: newId('plan'),
      from,
      days: source?.days || scheduleFromPercent(employee?.company?.workPercent || 100, STANDARD_DAY_HOURS),
    }, true);
  }

  function fillFromPercent() {
    const seeded = scheduleFromPercent(employee?.company?.workPercent || 100, STANDARD_DAY_HOURS);
    setEditor((current) => (current ? { ...current, days: editableDays(seeded) } : current));
  }

  function patchDay(dayId, field, value) {
    setEditor((current) => {
      if (!current) return current;
      const slot = { ...(current.days[dayId] || {}), [field]: value };
      if (field === 'leave') slot.leaveTouched = true;
      if ((field === 'hours' || field === 'arrival') && !slot.leaveTouched) {
        slot.leave = formatHours(parseHours(slot.arrival) + parseHours(slot.hours));
      }
      return { ...current, days: { ...current.days, [dayId]: slot } };
    });
  }

  async function saveEditor() {
    if (!editor) return;
    const normalized = normalizeScheduleRow({
      id: editor.id,
      from: editor.fromText,
      to: newer?.from ? '' : editor.toText,
      days: editor.days,
      custom: true,
    });
    if (!normalized.ok) {
      onError(normalized.error);
      return;
    }
    const replaced = replaceSchedule(employee?.extras?.schedules, normalized.row, {
      id: editor.previousId,
      from: editor.previousFrom,
    });
    if (!replaced.ok) {
      onError(replaced.error);
      return;
    }
    await onSave?.(setEmployeePath(employee, 'extras.schedules', replaced.schedules));
    setEditor(null);
    onError('');
    onNote('Tidsplanen er lagret.');
  }

  async function deleteEditor() {
    if (!editor || editor.isNew) {
      setEditor(null);
      return;
    }
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const identity = editor.previousId || `from:${editor.previousFrom}`;
    await onSave?.(setEmployeePath(employee, 'extras.schedules', removeSchedule(employee?.extras?.schedules, identity)));
    setEditor(null);
    setConfirmDelete(false);
    onError('');
    onNote('Tidsplanen er slettet.');
  }

  const editorFrom = editor ? parseScheduleDate(editor.fromText) : '';
  const others = editor
    ? plans.filter((plan) => scheduleIdentity(plan) !== (editor.previousId || `from:${editor.previousFrom}`) && plan.id !== editor.id)
    : [];
  const newer = editorFrom
    ? others.filter((plan) => plan.from > editorFrom).sort((a, b) => String(a.from).localeCompare(String(b.from)))[0]
    : null;

  return (
    <View nativeID="employee-schedule" style={{ gap: 14 }}>
      <View style={styles.scheduleHead}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Tidsplaner</Text>
          <Text style={{ color: colors.muted }}>
            {`Bedriften anbefaler ${STANDARD_DAY_HOURS} timer mandag til fredag. Periodene kan ikke overlappe. En lagret plan på personen endres ikke når bedriftsstandarden oppdateres.`}
          </Text>
        </View>
        {canEdit ? (
          <TouchableOpacity onPress={startCreate} accessibilityRole="button" accessibilityLabel="Opprett tidsplan" nativeID="employee-schedule-create" style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={styles.btnText}>+ Ny periode</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {editor ? (
        <View style={[styles.planCard, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View style={styles.planTop}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{editor.isNew ? 'Ny tidsplan' : 'Rediger tidsplan'}</Text>
            {canEdit ? (
              <TouchableOpacity onPress={fillFromPercent} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>{`Fra bedriftsstandard (${STANDARD_DAY_HOURS} t, ${employee?.company?.workPercent || 100} %)`}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.planBody}>
            <View style={styles.period}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Gjelder fra</Text>
              <TextInput
                value={editor.fromText}
                onChangeText={(value) => setEditor((current) => (current ? { ...current, fromText: value } : current))}
                placeholder="DD.MM.ÅÅÅÅ"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
                accessibilityLabel="Fra-dato"
              />
              <Text style={{ color: colors.muted, fontSize: 12 }}>Gjelder til</Text>
              {newer?.from ? (
                <Text style={{ color: colors.ink }}>{formatScheduleDate(scheduleRange({ id: editor.id, from: editorFrom }, [...others, { id: editor.id, from: editorFrom }]).to)}</Text>
              ) : (
                <TextInput
                  value={editor.toText}
                  onChangeText={(value) => setEditor((current) => (current ? { ...current, toText: value } : current))}
                  placeholder="nåværende"
                  placeholderTextColor={colors.placeholder}
                  style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
                  accessibilityLabel="Til-dato"
                />
              )}
            </View>
            <DayGrid
              colors={colors}
              editing
              days={editor.days}
              onPatch={patchDay}
            />
          </View>
          <View style={styles.row}>
            <TouchableOpacity onPress={saveEditor} style={[styles.btn, { backgroundColor: colors.brand }]} nativeID="employee-schedule-save">
              <Text style={styles.btnText}>Lagre tidsplan</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditor(null); setConfirmDelete(false); onError(''); }} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Avbryt</Text>
            </TouchableOpacity>
            {!editor.isNew ? (
              <TouchableOpacity onPress={deleteEditor} accessibilityRole="button">
                <Text style={{ color: colors.danger || '#b42318', fontWeight: '600' }}>{confirmDelete ? 'Bekreft sletting' : 'Slett tidsplan'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {plans.map((plan) => {
        const range = scheduleRange(plan, plans);
        const hidden = editor && !editor.isNew && (plan.id === editor.previousId || (!plan.id && plan.from === editor.previousFrom));
        if (hidden) return null;
        return (
          <View key={scheduleIdentity(plan)} style={[styles.planCard, { borderColor: colors.line, backgroundColor: colors.card }]} nativeID={`employee-schedule-${plan.from}`}>
            <View style={styles.planTop}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Tidsplan</Text>
              {canEdit ? (
                <TouchableOpacity onPress={() => openEditor(plan, false)} accessibilityRole="button" accessibilityLabel={`Rediger tidsplan fra ${formatScheduleDate(plan.from)}`}>
                  <Text style={{ color: colors.brand, fontWeight: '600' }}>Rediger</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={styles.planBody}>
              <View style={styles.period}>
                <Text style={{ color: colors.muted }}>Gjelder fra: <Text style={{ color: colors.ink }}>{formatScheduleDate(range.from) || '—'}</Text></Text>
                <Text style={{ color: colors.muted }}>Gjelder til: <Text style={{ color: colors.ink }}>{range.open ? 'nåværende' : (formatScheduleDate(range.to) || '—')}</Text></Text>
              </View>
              <DayGrid colors={colors} days={plan.days} onEditDay={canEdit ? () => openEditor(plan, false) : undefined} />
            </View>
          </View>
        );
      })}

      {!plans.length && !editor ? (
        <Text style={{ color: colors.muted }}>Ingen tidsplan er lagret. Forventede timer følger stillingsprosenten til du oppretter en.</Text>
      ) : null}
    </View>
  );
}

function DayGrid({ colors, days, editing = false, onPatch, onEditDay }) {
  return (
    <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
      {SCHEDULE_DAYS.map((day) => {
        const slot = days?.[day.id] || {};
        const hoursLabel = formatHours(slot.hours || 0);
        const off = parseHours(slot.hours) === 0;
        return (
          <View key={day.id} style={[styles.day, { borderColor: off ? '#fecaca' : colors.line, backgroundColor: colors.card }]}>
            <View style={[styles.dayHead, { backgroundColor: off ? '#fee2e2' : (colors.sunken || '#f8fafc') }]}>
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13 }}>{day.label}</Text>
              {onEditDay ? (
                <TouchableOpacity onPress={onEditDay} accessibilityRole="button" accessibilityLabel={`Rediger ${day.label}`}>
                  <Ionicons name="create-outline" size={16} color={colors.brand} />
                </TouchableOpacity>
              ) : <View style={{ width: 16 }} />}
            </View>
            {editing ? (
              <View style={{ gap: 6, padding: 8 }}>
                <TextInput
                  value={String(slot.hours ?? '')}
                  onChangeText={(value) => onPatch?.(day.id, 'hours', value)}
                  style={[styles.input, styles.dayInput, { color: colors.ink, borderColor: colors.line }]}
                  accessibilityLabel={`${day.label} timer`}
                />
                <Text style={{ color: colors.muted, fontSize: 11 }}>Kommer</Text>
                <TextInput
                  value={String(slot.arrival ?? '')}
                  onChangeText={(value) => onPatch?.(day.id, 'arrival', value)}
                  style={[styles.input, styles.dayInput, { color: colors.ink, borderColor: colors.line }]}
                  accessibilityLabel={`${day.label} kommer`}
                />
                <Text style={{ color: colors.muted, fontSize: 11 }}>Går</Text>
                <TextInput
                  value={String(slot.leave ?? '')}
                  onChangeText={(value) => onPatch?.(day.id, 'leave', value)}
                  style={[styles.input, styles.dayInput, { color: colors.ink, borderColor: colors.line }]}
                  accessibilityLabel={`${day.label} går`}
                />
                <Text style={{ color: colors.muted, fontSize: 11 }}>Fratrekk/tillegg</Text>
                <TextInput
                  value={String(slot.adjustment ?? '')}
                  onChangeText={(value) => onPatch?.(day.id, 'adjustment', value)}
                  style={[styles.input, styles.dayInput, { color: colors.ink, borderColor: colors.line }]}
                  accessibilityLabel={`${day.label} fratrekk`}
                />
              </View>
            ) : (
              <View style={{ gap: 4, padding: 8 }}>
                <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '700', textAlign: 'center' }}>{hoursLabel}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Kommer: {formatHours(slot.arrival || 0)}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Går: {departureOf(slot)}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>Fratrekk/tillegg: {formatHours(slot.adjustment || 0)}</Text>
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, gap: 10, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700' },
  checks: { gap: 10, maxWidth: 560 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 18, height: 18, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 88 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '700' },
  secondary: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  scheduleHead: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' },
  planCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 12 },
  planTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  planBody: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'flex-start' },
  period: { width: 160, gap: 6, paddingTop: 4 },
  day: { width: 148, borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  dayHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8 },
  dayInput: { minWidth: 0, width: '100%', textAlign: 'center', paddingVertical: 6 },
});
