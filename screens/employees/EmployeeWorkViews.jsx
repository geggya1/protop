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
import DateInput from '../../components/DateInput';
import { radius, space, type } from '../../src/ui/tokens';
import SettingsCard from '../../components/employees/SettingsCard.jsx';

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
  // Lønn: vises etter lønnsformen. Fastlønn med overtid inkludert skjuler overtid og uttak av mertid.
  { key: 'overtimeInSalary', label: 'Overtid inngår i fastlønnen (ikke krav på overtid)', locked: 'external', show: (f) => f.fixedSalary },
  { key: 'bankPayout', label: 'Kan få mertid utbetalt som overtid ved månedsslutt', locked: 'external', show: (f) => !f.overtimeInSalary },
];

const PAY_FORMS = ['Fastlønn', 'Timelønn', 'Provisjon', 'Honorar'];

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

/** Bryter (av/på). Tilstanden står på raden rundt (accessibilityRole checkbox). */
function Switch({ on, locked, colors }) {
  return (
    <View style={[styles.track, { backgroundColor: on ? colors.brand : colors.line, opacity: locked ? 0.45 : 1 }]}>
      <View style={[styles.knob, { backgroundColor: colors.card || '#fff' }, on && styles.knobOn]} />
    </View>
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
    <ScrollView contentContainerStyle={styles.settingsWrap} nativeID="employee-time-settings">
      {note ? <Text style={[type.body, { color: colors.brand }]}>{note}</Text> : null}
      {error ? <Text style={[type.body, { color: colors.danger }]}>{error}</Text> : null}

      {sub === 'general' ? (
        <View style={styles.cards}>
          <SettingsCard colors={colors} title="Timeliste og lønn" icon="time-outline" hint="Hvordan timene føres og regnes" nativeID="employee-settings-rules">
            {membership.externalRules ? null : (
              <View style={styles.payForm} nativeID="employee-pay-form">
                <Text style={[type.caption, { color: colors.muted }]}>Lønnsform</Text>
                <View style={styles.payChips}>
                  {PAY_FORMS.map((form) => {
                    const on = String(employee?.company?.compensationType || '').toLowerCase() === form.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={form}
                        disabled={!canEdit}
                        onPress={() => onSave?.(patchSettings({}, { compensationType: on ? '' : form }))}
                        style={[styles.payChip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : 'transparent', opacity: canEdit ? 1 : 0.6 }]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on, disabled: !canEdit }}
                      >
                        <Text style={[type.label, { color: on ? colors.brand : colors.ink }]}>{form}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
            <View style={styles.toggles}>
              {CHECKS.filter((row) => !row.show || row.show(flags)).map((row, index, list) => {
                const on = !!flags[row.key];
                const locked = rowLocked(row, membership);
                const last = index === list.length - 1;
                const inner = (
                  <>
                    <Text style={[type.body, styles.toggleLabel, { color: locked ? colors.muted : colors.ink }]}>{row.label}</Text>
                    <Switch on={on} locked={locked} colors={colors} />
                  </>
                );
                const rowStyle = [styles.toggleRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }];
                if (locked) {
                  return (
                    <View key={row.key} style={rowStyle} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: true }}>
                      {inner}
                    </View>
                  );
                }
                return (
                  <TouchableOpacity key={row.key} onPress={() => toggle(row.key)} style={rowStyle} accessibilityRole="checkbox" accessibilityState={{ checked: on, disabled: false }}>
                    {inner}
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[type.caption, { color: colors.muted }]}>
              Eksternt personell og kapasitetsoversikten styres under rettigheter.
            </Text>
          </SettingsCard>

          <SettingsCard colors={colors} title="Mål og timepris" icon="locate-outline" hint="Brukes i produktivitet og fakturering" nativeID="employee-settings-goals">
            <View style={styles.fieldRow}>
              <View style={styles.field}>
                <Text style={[type.caption, { color: colors.muted }]}>Mål for faktureringsgrad</Text>
                <View style={styles.inputRow}>
                  <TextInput value={target} onChangeText={setTarget} editable={canEdit} style={[styles.input, { color: colors.ink, borderColor: colors.line }]} accessibilityLabel="Faktureringsgrad" />
                  <Text style={[type.body, { color: colors.muted }]}>%</Text>
                </View>
                <Text style={[type.caption, { color: colors.muted }]}>av forventede timer må være registrerte timer på prosjekter</Text>
              </View>
              <View style={styles.field}>
                <Text style={[type.caption, { color: colors.muted }]}>Timepris</Text>
                <View style={styles.inputRow}>
                  <TextInput value={rate} onChangeText={setRate} editable={canEdit} placeholder="kr / time" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line }]} accessibilityLabel="Timepris" nativeID="employee-settings-rate" />
                  <Text style={[type.body, { color: colors.muted }]}>kr</Text>
                </View>
              </View>
            </View>
            {canEdit ? (
              <TouchableOpacity onPress={saveGoals} style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]} nativeID="employee-settings-save">
                <Text style={styles.btnText}>Lagre mål og timepris</Text>
              </TouchableOpacity>
            ) : null}
          </SettingsCard>
        </View>
      ) : null}

      {sub === 'close' ? (
        <SettingsCard colors={colors} title="Avslutt medarbeiderkonto" icon="exit-outline" nativeID="employee-settings-close-card">
          <Text style={[type.body, { color: colors.muted }]}>
            {isActiveEmployee(employee)
              ? 'Personen tas ut av bedriften, logges ut og mister all tilgang. Timer, fravær og dokumenter blir liggende, og kontoen kan aktiveres igjen senere.'
              : 'Kontoen er avsluttet. Aktiver den igjen under Konto og sikkerhet.'}
          </Text>
          {canEdit && isActiveEmployee(employee) ? (
            <TouchableOpacity
              nativeID="employee-settings-close"
              onPress={closeAccount}
              accessibilityRole="button"
              style={[styles.btn, { backgroundColor: colors.danger, alignSelf: 'flex-start' }]}
            >
              <Text style={styles.btnText}>Avslutt medarbeiderkonto</Text>
            </TouchableOpacity>
          ) : null}
        </SettingsCard>
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
        <SettingsCard colors={colors} title="Passord" icon="key-outline" nativeID="employee-settings-password">
          <Text style={[type.body, { color: colors.muted }]}>Vi sender en lenke til medarbeiderens e-post for å sette nytt passord.</Text>
          {canEdit ? (
            <TouchableOpacity onPress={resetPassword} nativeID="employee-password-send" style={[styles.btn, { backgroundColor: colors.brand, alignSelf: 'flex-start' }]}>
              <Text style={styles.btnText}>Send passordlenke</Text>
            </TouchableOpacity>
          ) : null}
        </SettingsCard>
      ) : null}

      {sub === 'notify' ? (
        <SettingsCard colors={colors} title="Varsler" icon="notifications-outline" hint="Varsler på e-post og i appen" nativeID="employee-settings-notify">
          <View style={styles.toggles}>
            {[
              { key: 'notifyTimesheet', label: 'Varsle om timeliste', hint: 'Påminnelse når timelisten skal føres eller låses' },
              { key: 'notifyApproval', label: 'Varsle om godkjenning', hint: 'Når timer, fravær eller utlegg er godkjent eller avvist' },
            ].map((row, index) => {
              const on = settings[row.key] !== false;
              return (
                <TouchableOpacity
                  key={row.key}
                  onPress={() => toggle(row.key)}
                  disabled={!canEdit}
                  style={[styles.toggleRow, index === 0 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line }]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on, disabled: !canEdit }}
                >
                  <View style={styles.toggleLabel}>
                    <Text style={[type.body, { color: colors.ink }]}>{row.label}</Text>
                    <Text style={[type.caption, { color: colors.muted }]}>{row.hint}</Text>
                  </View>
                  <Switch on={on} locked={!canEdit} colors={colors} />
                </TouchableOpacity>
              );
            })}
          </View>
        </SettingsCard>
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
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Tidsplaner</Text>
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
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{editor.isNew ? 'Ny tidsplan' : 'Rediger tidsplan'}</Text>
            {canEdit ? (
              <TouchableOpacity onPress={fillFromPercent} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>{`Fra bedriftsstandard (${STANDARD_DAY_HOURS} t, ${employee?.company?.workPercent || 100} %)`}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.planBody}>
            <View style={styles.period}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Gjelder fra</Text>
              <DateInput
                value={editor.fromText}
                onChange={(value) => setEditor((current) => (current ? { ...current, fromText: value } : current))}
                format="nb"
                accessibilityLabel="Fra-dato"
              />
              <Text style={{ color: colors.muted, fontSize: 12 }}>Gjelder til</Text>
              {newer?.from ? (
                <Text style={{ color: colors.ink }}>{formatScheduleDate(scheduleRange({ id: editor.id, from: editorFrom }, [...others, { id: editor.id, from: editorFrom }]).to)}</Text>
              ) : (
                <DateInput
                  value={editor.toText}
                  onChange={(value) => setEditor((current) => (current ? { ...current, toText: value } : current))}
                  format="nb"
                  placeholder="nåværende"
                  clearable
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
                <Text style={{ color: colors.danger, fontWeight: '600' }}>{confirmDelete ? 'Bekreft sletting' : 'Slett tidsplan'}</Text>
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
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Tidsplan</Text>
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
              <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>{day.label}</Text>
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
                <Text style={{ color: colors.ink, fontSize: 22, fontWeight: '600', textAlign: 'center' }}>{hoursLabel}</Text>
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
  settingsWrap: { gap: space.md, paddingBottom: space.lg },
  cards: { gap: space.md },
  toggles: { gap: 0 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md, paddingVertical: 10 },
  toggleLabel: { flex: 1, minWidth: 0 },
  track: { width: 40, height: 22, borderRadius: radius.pill, padding: 2, justifyContent: 'center' },
  knob: { width: 18, height: 18, borderRadius: radius.pill },
  knobOn: { alignSelf: 'flex-end' },
  fieldRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.lg },
  field: { gap: 4, flexBasis: 220, flexGrow: 1 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  title: { fontSize: 20, fontWeight: '600' },
  checks: { gap: 10, maxWidth: 560 },
  payForm: { gap: 6 },
  payChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  payChip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: { width: 18, height: 18, borderWidth: 1, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 88 },
  btn: { borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  btnText: { color: '#fff', fontWeight: '600' },
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
