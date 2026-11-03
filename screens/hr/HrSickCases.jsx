import React, { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useTimesheetWorkspace } from '../arbeid/useTimesheetWorkspace';
import { persistProjectState, putProjectState } from '../../src/project/storage';
import { resolveAbsenceTypes } from '../../src/arbeid/absenceCatalog.js';
import { agreedHoursForDate, resolveRedDays } from '../../src/arbeid/holidays.js';
import { scheduledHours } from '../../src/arbeid/schedule.js';
import { parseDateKey } from '../../src/arbeid/calendar.js';
import { employeeDisplayName } from '../../src/arbeid/roles.js';
import { saveEmployee } from '../../src/employees/storage';
import { showSaveToast } from '../../src/ui/saveToast';
import { useSickLeave } from '../../src/arbeid/useSickLeave.js';
import { applySickCaseToState } from '../../src/arbeid/sickApply.js';
import { removeSelfCertDenial, saveSelfCertDenial, saveSickRules } from '../../src/arbeid/sickStorage.js';
import {
  CASE_STATUS_LABEL,
  SICK_KIND_LABEL,
  addMonths,
  calendarDays,
  childCareQuota,
  missingSickNotes,
  selfCertStatus,
  todayIso,
} from '../../src/arbeid/sickLeave.js';
import { formatNbDate } from '../../src/hr/model';
import { toneColor } from '../../src/hr/uiHelpers';
import { radius, space, type } from '../../src/ui/tokens';
import SickNoteModal from '../../components/arbeid/SickNoteModal';
import { EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle, RowLink } from './HrShared';

const STATUS_TONE = { innmeldt: 'warn', dokumentasjon: 'warn', godkjent: 'good', avvist: 'bad' };

function range(row) {
  return row.fromDate === row.toDate ? formatNbDate(row.fromDate) : `${formatNbDate(row.fromDate)} – ${formatNbDate(row.toDate)}`;
}

function digits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

/**
 * HR → Sykefravær: egenmelding, sykt barn og sykmelding (ftrl kap. 8 og 9). Meldingene til
 * behandling, hyppig korttidsfravær og retten til egenmelding, kvoter og firmaets regler.
 * Fristene etter aml § 4-6 står i kortet over (HrSickLeave). Ingen diagnose lagres.
 */
export default function HrSickCases({ colors, canWrite }) {
  const { user, family } = useApp();
  const today = todayIso();
  const workspace = useTimesheetWorkspace({
    fromDate: addMonths(today, -14),
    toDate: addMonths(today, 2),
    absences: { all: true },
    liveAbsences: true,
  });
  const { state, employees, uid, workspaceId } = workspace;
  // HR behandler sakene; reglene for sickCases gir det samme som fravær for alle.
  const sick = useSickLeave(workspaceId, { uid, manager: true, family, employees });
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const saveChain = useRef(Promise.resolve());

  const catalog = useMemo(() => resolveAbsenceTypes(state), [state.absenceTypes, state.absenceTypesCustom]);
  const fullDayHours = Number(state.fullDayHours) > 0 ? Number(state.fullDayHours) : 8;
  const year = Number(today.slice(0, 4));
  const redDays = useMemo(() => resolveRedDays(state, [year - 1, year, year + 1]), [state.redDays, year]);
  const people = useMemo(
    () => employees.filter((row) => !['former', 'deleted'].includes(row.company?.status)),
    [employees],
  );
  const byId = useMemo(() => new Map(employees.map((row) => [row.id, row])), [employees]);
  const actor = user?.displayName || user?.email || '';

  function plannedFor(emp, iso) {
    const date = parseDateKey(iso);
    if (!date) return 0;
    return agreedHoursForDate(date, { fullDayHours, redDays, scheduleHours: scheduledHours(emp, date, fullDayHours) }).hours;
  }

  function persist(next) {
    workspace.setState(next);
    putProjectState(next, workspaceId);
    const job = saveChain.current.then(() => persistProjectState(next, workspaceId));
    saveChain.current = job.catch(() => {});
    return job;
  }

  async function run(job, done) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await job();
      if (done) showSaveToast(done);
    } catch (cause) {
      setError(String(cause?.message || '') || 'Kunne ikke lagre.');
    } finally {
      setBusy(false);
    }
  }

  function updateCase(sickCase, patch, action) {
    return run(async () => {
      const saved = await sick.save({ ...sickCase, ...patch }, { actor, action });
      if (patch.status && patch.status !== sickCase.status) {
        const emp = byId.get(saved.employeeId);
        const result = applySickCaseToState(state, saved, { hoursForDate: (iso) => plannedFor(emp, iso), catalog, createdByUid: uid });
        if (result.ok) await persist(result.state);
        else throw new Error(result.error);
      }
    }, action);
  }

  function submitForm(input) {
    const emp = byId.get(form?.employeeId);
    if (!emp) return;
    run(async () => {
      const saved = await sick.save({
        ...input,
        employeeId: emp.id,
        employeeUid: emp.personUid || '',
        employeeName: employeeDisplayName(emp),
        status: form?.status || 'innmeldt',
      }, { actor, action: input.id ? 'Endret av HR' : 'Meldt av HR' });
      const result = applySickCaseToState(state, saved, { hoursForDate: (iso) => plannedFor(emp, iso), catalog, createdByUid: uid });
      if (result.ok) await persist(result.state);
      setForm(null);
    }, 'Fraværet er registrert.');
  }

  const ctx = {
    colors, state, people, byId, sick, catalog, today, busy, canWrite, actor, uid, workspaceId, run, updateCase,
    openForm: (employeeId, initial = {}) => setForm({ ...initial, employeeId }),
  };
  const formEmployee = form ? byId.get(form.employeeId) : null;

  return (
    <>
      {sick.error ? (
        <HrCard colors={colors}>
          <Text style={[styles.line, { color: colors.dangerInk || colors.danger }]}>
            {`Kunne ikke lese meldingene om sykefravær. Det krever tilgang til HR → Oppfølging eller andres timer. (${sick.error})`}
          </Text>
        </HrCard>
      ) : null}
      <Queue ctx={ctx} />
      <Frequent ctx={ctx} />
      <Quotas ctx={ctx} />
      <Rules ctx={ctx} />
      {error ? <Text style={[styles.line, { color: colors.dangerInk || colors.danger }]}>{error}</Text> : null}
      <SickNoteModal
        visible={!!form && !!formEmployee}
        colors={colors}
        employee={formEmployee}
        employeeName={employeeDisplayName(formEmployee)}
        absences={(state.absences || []).filter((row) => row.employeeId === form?.employeeId)}
        catalog={catalog}
        rules={sick.rules}
        initial={form}
        onBehalf={!!formEmployee && formEmployee.personUid !== uid}
        busy={busy}
        onClose={() => setForm(null)}
        onSubmit={submitForm}
      />
    </>
  );
}

function EmployeePick({ ctx, onPick }) {
  const { colors, people } = ctx;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const hits = people.filter((emp) => employeeDisplayName(emp).toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8);
  if (!open) {
    return (
      <View style={styles.row}>
        <HrButton colors={colors} label="Registrer for ansatt" icon="add" nativeID="hr-sick-register" onPress={() => setOpen(true)} />
      </View>
    );
  }
  return (
    <View style={styles.stack}>
      <HrField colors={colors} label="Ansatt" value={q} onChangeText={setQ} placeholder="Søk etter navn" autoFocus />
      {hits.map((emp) => (
        <RowLink key={emp.id} colors={colors} title={employeeDisplayName(emp)} onPress={() => { setOpen(false); setQ(''); onPick(emp); }} />
      ))}
      <View style={styles.row}>
        <HrButton colors={colors} label="Avbryt" onPress={() => setOpen(false)} />
      </View>
    </View>
  );
}

/** Egenmeldinger og sykmeldinger som venter, sykedager uten skjema og sist behandlet. */
function Queue({ ctx }) {
  const { colors, sick, state, people, byId, catalog, today, busy, canWrite, updateCase } = ctx;
  const [notes, setNotes] = useState({});
  const open = sick.cases
    .filter((c) => c.status === 'innmeldt' || c.status === 'dokumentasjon')
    .sort((a, b) => b.fromDate.localeCompare(a.fromDate));
  const missing = useMemo(() => people.flatMap((emp) => missingSickNotes(state.absences || [], sick.cases, emp.id, { catalog, rules: sick.rules, today })
    .map((row) => ({ ...row, name: employeeDisplayName(emp) }))), [people, state.absences, sick.cases, catalog, sick.rules, today]);
  const handled = sick.cases.filter((c) => c.status === 'godkjent' || c.status === 'avvist')
    .sort((a, b) => String(b.handledAt).localeCompare(String(a.handledAt))).slice(0, 10);
  const stamp = () => ({ handledBy: ctx.actor, handledByUid: ctx.uid, handledAt: new Date().toISOString() });

  return (
    <HrCard colors={colors}>
      <View nativeID="hr-sick-queue" style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title="Egenmelding og sykmelding"
          subtitle="Meldinger fra de ansatte som venter på behandling. Godkjent fravær føres i timelisten. Ingen diagnose lagres."
        />
        {canWrite ? <EmployeePick ctx={ctx} onPick={(emp) => ctx.openForm(emp.id, { kind: 'self', fromDate: today, toDate: today })} /> : null}
        {!open.length ? <EmptyHint colors={colors} text="Ingen meldinger venter på behandling." /> : null}
        {open.map((c) => {
          const emp = byId.get(c.employeeId);
          const status = selfCertStatus({ employee: emp, absences: state.absences, catalog, rules: sick.rules, at: c.fromDate });
          const note = notes[c.id] || '';
          return (
            <View key={c.id} style={[styles.case, { borderColor: colors.line }]} nativeID={`hr-sick-case-${c.id}`}>
              <View style={styles.between}>
                <Text style={[styles.name, { color: colors.ink }]}>{c.employeeName || employeeDisplayName(emp)}</Text>
                <Text style={[styles.status, { color: toneColor(STATUS_TONE[c.status], colors) }]}>{CASE_STATUS_LABEL[c.status]}</Text>
              </View>
              <Text style={[styles.meta, { color: colors.ink }]}>
                {`${SICK_KIND_LABEL[c.kind]} · ${range(c)} · ${calendarDays(c.fromDate, c.toDate)} kalenderdager${c.percent < 100 ? ` · ${c.percent} %` : ''}`}
              </Text>
              {c.kind === 'self' ? (
                <Text style={[styles.meta, { color: colors.muted }]}>
                  {`Siste 12 måneder før dette: ${status.occasionsUsed} egenmeldinger, ${status.daysUsed} dager.${status.revokeReview ? ' Fire eller flere fravær uten legeerklæring.' : ''}`}
                </Text>
              ) : null}
              {c.confirmed ? <Text style={[styles.meta, { color: colors.muted }]}>Erklæringen er bekreftet av den ansatte.</Text> : null}
              {c.workRelated ? <Text style={[styles.meta, { color: colors.warnInk }]}>Kan ha sammenheng med jobben. Vurder avviksmelding og tilrettelegging.</Text> : null}
              {c.note ? <Text style={[styles.meta, { color: colors.ink }]}>{`Beskjed: ${c.note}`}</Text> : null}
              {canWrite ? (
                <>
                  <HrField
                    colors={colors}
                    label="Notat til den ansatte (må fylles ut ved avvisning)"
                    value={note}
                    onChangeText={(value) => setNotes((m) => ({ ...m, [c.id]: value }))}
                  />
                  <View style={styles.row}>
                    <HrButton colors={colors} primary disabled={busy} label="Godkjenn" nativeID={`hr-sick-case-${c.id}-ok`}
                      onPress={() => updateCase(c, { status: 'godkjent', ...stamp(), handlerNote: note }, 'Godkjent')} />
                    {c.kind !== 'doctor' ? (
                      <HrButton colors={colors} disabled={busy} label="Be om legeerklæring"
                        onPress={() => updateCase(c, { status: 'dokumentasjon', ...stamp(), handlerNote: note || 'Fraværet må dokumenteres med legeerklæring.' }, 'Ba om legeerklæring')} />
                    ) : null}
                    <HrButton colors={colors} danger disabled={busy || !note.trim()} label="Avvis"
                      onPress={() => updateCase(c, { status: 'avvist', ...stamp(), handlerNote: note }, 'Avvist')} />
                    <HrButton colors={colors} label="Endre" onPress={() => ctx.openForm(c.employeeId, c)} />
                  </View>
                </>
              ) : null}
            </View>
          );
        })}

        {missing.length ? (
          <View nativeID="hr-sick-missing" style={styles.stack}>
            <Text style={[styles.label, { color: colors.ink }]}>Sykedager uten skjema</Text>
            <Text style={[styles.line, { color: colors.muted }]}>De ansatte ser en påminnelse i timelisten med lenke til skjemaet.</Text>
            {missing.slice(0, 20).map((row) => (
              <View key={`${row.employeeId}:${row.kind}:${row.fromDate}`} style={[styles.item, { borderTopColor: colors.line }]}>
                <Text style={[styles.line, { color: colors.ink, flex: 1, minWidth: 180 }]}>{`${row.name} · ${SICK_KIND_LABEL[row.kind]} · ${range(row)}`}</Text>
                {canWrite ? <HrButton colors={colors} label="Fyll ut" onPress={() => ctx.openForm(row.employeeId, { kind: row.kind, fromDate: row.fromDate, toDate: row.toDate })} /> : null}
              </View>
            ))}
          </View>
        ) : null}

        {handled.length ? (
          <View style={styles.stack}>
            <Text style={[styles.label, { color: colors.ink }]}>Sist behandlet</Text>
            {handled.map((c) => (
              <Text key={c.id} style={[styles.line, { color: colors.muted }]}>
                {`${c.employeeName} · ${SICK_KIND_LABEL[c.kind]} · ${range(c)} · ${CASE_STATUS_LABEL[c.status]}${c.handledBy ? ` av ${c.handledBy}` : ''}`}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </HrCard>
  );
}

/** Hyppig korttidsfravær og vedtak om å ta fra retten til egenmelding (ftrl § 8-27). */
function Frequent({ ctx }) {
  const { colors, sick, state, people, catalog, today, busy, canWrite, workspaceId } = ctx;
  const [deny, setDeny] = useState(null);
  const flagged = people
    .map((emp) => ({ emp, status: selfCertStatus({ employee: emp, absences: state.absences, catalog, rules: sick.rules, at: today }) }))
    .filter((row) => row.status.frequent || row.status.revokeReview);

  function saveDenial() {
    if (!deny?.reason?.trim() || !deny?.heardAt) return;
    ctx.run(async () => {
      const saved = await saveSelfCertDenial(workspaceId, {
        employeeId: deny.emp.id,
        employeeUid: deny.emp.personUid || '',
        employeeName: employeeDisplayName(deny.emp),
        from: today,
        heardAt: deny.heardAt,
        reason: deny.reason,
        decidedBy: ctx.actor,
        decidedByUid: ctx.uid,
      });
      const denials = [...sick.denials.filter((d) => d.employeeId !== saved.employeeId), saved];
      sick.setDenials(denials);
      sick.setRules({ ...sick.rules, denied: denials });
      setDeny(null);
    }, 'Vedtaket er lagret. Det må vurderes på nytt om seks måneder.');
  }

  function lift(denial) {
    ctx.run(async () => {
      await removeSelfCertDenial(workspaceId, denial.employeeId);
      const denials = sick.denials.filter((d) => d.employeeId !== denial.employeeId);
      sick.setDenials(denials);
      sick.setRules({ ...sick.rules, denied: denials });
    }, 'Retten til egenmelding er gitt tilbake.');
  }

  return (
    <HrCard colors={colors}>
      <View nativeID="hr-sick-frequent" style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title="Hyppig korttidsfravær"
          subtitle={`Ansatte med ${sick.rules.frequentOccasions} eller flere sykefravær de siste 12 månedene. Ta en samtale om trivsel og tilrettelegging. Etter fire fravær uten legeerklæring kan retten til egenmelding tas bort (ftrl § 8-27).`}
        />
        {!flagged.length ? <EmptyHint colors={colors} text="Ingen akkurat nå." /> : null}
        {flagged.map(({ emp, status }) => {
          const denial = sick.denials.find((d) => d.employeeId === emp.id);
          return (
            <View key={emp.id} style={[styles.item, { borderTopColor: colors.line }]}>
              <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
                <Text style={[styles.label, { color: colors.ink }]}>{employeeDisplayName(emp)}</Text>
                <Text style={[styles.line, { color: colors.muted }]}>{`${status.occasions.length} fravær · ${status.occasionsUsed} egenmeldinger`}</Text>
                {denial ? (
                  <Text style={[styles.line, { color: colors.warnInk }]}>
                    {`Egenmelding fratatt fra ${formatNbDate(denial.from)}. Vurderes på nytt ${formatNbDate(addMonths(denial.from, 6))}.`}
                  </Text>
                ) : null}
              </View>
              {canWrite && status.revokeReview && !denial ? (
                <HrButton colors={colors} label="Vurder egenmeldingsretten" onPress={() => setDeny({ emp, reason: '', heardAt: '' })} />
              ) : null}
              {canWrite && denial ? <HrButton colors={colors} disabled={busy} label="Opphev" onPress={() => lift(denial)} /> : null}
            </View>
          );
        })}
        {deny ? (
          <View nativeID="hr-sick-deny" style={[styles.case, { borderColor: colors.line }]}>
            <Text style={[styles.name, { color: colors.ink }]}>{`Ta fra retten til egenmelding: ${employeeDisplayName(deny.emp)}`}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              Den ansatte skal ha fått uttale seg før vedtaket. Vedtaket gjelder i seks måneder og skal da vurderes på nytt.
            </Text>
            <HrField colors={colors} label="Den ansatte fikk uttale seg" date="iso" clearable value={deny.heardAt} onChangeText={(heardAt) => setDeny((d) => ({ ...d, heardAt }))} />
            <HrField colors={colors} label="Begrunnelse" value={deny.reason} onChangeText={(reason) => setDeny((d) => ({ ...d, reason }))} multiline />
            <View style={styles.row}>
              <HrButton colors={colors} primary disabled={busy || !deny.reason.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(deny.heardAt)} label="Lagre vedtak" onPress={saveDenial} />
              <HrButton colors={colors} label="Avbryt" onPress={() => setDeny(null)} />
            </View>
          </View>
        ) : null}
      </View>
    </HrCard>
  );
}

/** Egenmelding siste 12 måneder og omsorgsdager i kalenderåret (ftrl §§ 8-24 og 9-6). */
function Quotas({ ctx }) {
  const { colors, people, state, catalog, sick, today, canWrite, workspaceId } = ctx;
  const [edit, setEdit] = useState(null);
  const year = Number(today.slice(0, 4));

  function saveCare() {
    const emp = ctx.byId.get(edit.id);
    if (!emp) return;
    ctx.run(async () => {
      await saveEmployee(workspaceId, {
        ...emp,
        extras: { ...(emp.extras || {}), childCare: { children: Number(edit.children) || 0, chronic: Number(edit.chronic) || 0, alone: !!edit.alone } },
      });
      setEdit(null);
    }, 'Omsorgsdagene er oppdatert.');
  }

  return (
    <HrCard colors={colors}>
      <View nativeID="hr-sick-quotas" style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title="Egenmelding og omsorgsdager"
          subtitle="Egenmelding regnes over de siste 12 månedene. Omsorgsdager gjelder kalenderåret og avhenger av antall barn (ftrl § 9-6). Dager ut over 10 kan kreves refundert fra NAV."
        />
        {!people.length ? <EmptyHint colors={colors} text="Ingen ansatte." /> : null}
        {people.map((emp) => {
          const status = selfCertStatus({ employee: emp, absences: state.absences, catalog, rules: sick.rules, at: today });
          const care = childCareQuota(emp.extras?.childCare, { absences: state.absences, employeeId: emp.id, year, catalog });
          const editing = edit?.id === emp.id;
          return (
            <View key={emp.id} style={[styles.item, { borderTopColor: colors.line }]}>
              <View style={{ flex: 1, minWidth: 200, gap: 2 }}>
                <Text style={[styles.label, { color: colors.ink }]}>{employeeDisplayName(emp)}</Text>
                <Text style={[styles.line, { color: colors.muted }]}>
                  {`Egenmelding: ${status.occasionsUsed} ganger, ${status.daysUsed} dager${status.daysLeft != null ? `, ${status.daysLeft} igjen` : ''}${status.eligible === false ? ` · kan brukes fra ${formatNbDate(status.eligibleFrom)}` : ''}${status.denied ? ' · fratatt' : ''}`}
                </Text>
                <Text style={[styles.line, { color: colors.muted }]}>
                  {care.unknown ? 'Omsorgsdager: antall barn er ikke registrert' : `Omsorgsdager ${year}: ${care.used} av ${care.total}${care.refundDays ? ` · ${care.refundDays} kan refunderes` : ''}`}
                </Text>
              </View>
              {canWrite && !editing ? (
                <HrButton colors={colors} label="Omsorgsdager" onPress={() => setEdit({ id: emp.id, children: String(care.children || ''), chronic: String(care.chronic || ''), alone: !!care.alone })} />
              ) : null}
              {editing ? (
                <View style={[styles.stack, { flexBasis: '100%' }]}>
                  <View style={styles.row}>
                    <View style={styles.field}><HrField colors={colors} label="Barn til og med 12 år" value={edit.children} keyboardType="number-pad" onChangeText={(v) => setEdit((e) => ({ ...e, children: digits(v) }))} /></View>
                    <View style={styles.field}><HrField colors={colors} label="Barn med utvidet rett fra NAV" value={edit.chronic} keyboardType="number-pad" onChangeText={(v) => setEdit((e) => ({ ...e, chronic: digits(v) }))} /></View>
                  </View>
                  <View style={styles.row}>
                    <HrChip colors={colors} label="Alene om omsorgen" active={!!edit.alone} onPress={() => setEdit((e) => ({ ...e, alone: !e.alone }))} />
                  </View>
                  <View style={styles.row}>
                    <HrButton colors={colors} primary label="Lagre" onPress={saveCare} />
                    <HrButton colors={colors} label="Avbryt" onPress={() => setEdit(null)} />
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </HrCard>
  );
}

/** Firmaets regler for egenmelding (ftrl §§ 8-24 og 8-26). */
function Rules({ ctx }) {
  const { colors, sick, canWrite, workspaceId } = ctx;
  const [draft, setDraft] = useState(null);
  const current = draft || sick.rules;
  const set = (patch) => setDraft((d) => ({ ...(d || sick.rules), ...patch }));

  function save() {
    ctx.run(async () => {
      const next = await saveSickRules(workspaceId, current);
      sick.setRules({ ...next, denied: sick.rules.denied });
      setDraft(null);
    }, 'Reglene er lagret.');
  }

  return (
    <HrCard colors={colors}>
      <View nativeID="hr-sick-rules" style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title="Regler for egenmelding"
          subtitle="Lovens utgangspunkt er tre kalenderdager om gangen etter to måneders ansettelse (ftrl § 8-24). Utvidet egenmelding gjelder bare innenfor arbeidsgiverperioden og krever drøfting med tillitsvalgte."
        />
        <View style={styles.row}>
          <HrChip colors={colors} label="Krev skriftlig skjema (§ 8-26)" active={!!current.requireForm} onPress={canWrite ? () => set({ requireForm: !current.requireForm }) : undefined} />
          <HrChip colors={colors} label="Utvidet egenmelding" active={!!current.extendedSelfCert} onPress={canWrite ? () => set({ extendedSelfCert: !current.extendedSelfCert }) : undefined} />
          {current.extendedSelfCert ? (
            <HrChip colors={colors} label="Drøftet med tillitsvalgte" active={!!current.extendedDiscussed} onPress={canWrite ? () => set({ extendedDiscussed: !current.extendedDiscussed }) : undefined} />
          ) : null}
        </View>
        {current.extendedSelfCert && !current.extendedDiscussed ? (
          <Text style={[styles.line, { color: colors.warnInk }]}>Utvidelsen gjelder ikke før drøftingen er krysset av.</Text>
        ) : null}
        <View style={styles.row}>
          {current.extendedSelfCert ? (
            <View style={styles.field}><HrField colors={colors} label="Dager om gangen (høyst 16)" value={String(current.extendedDays ?? '')} keyboardType="number-pad" onChangeText={(v) => set({ extendedDays: digits(v) })} /></View>
          ) : null}
          <View style={styles.field}><HrField colors={colors} label="Tak på egenmeldingsdager per 12 måneder (0 = bare varsel)" value={String(current.annualCapDays ?? '')} keyboardType="number-pad" onChangeText={(v) => set({ annualCapDays: digits(v) })} /></View>
          <View style={styles.field}><HrField colors={colors} label="Varsle om hyppig fravær ved antall på 12 måneder" value={String(current.frequentOccasions ?? '')} keyboardType="number-pad" onChangeText={(v) => set({ frequentOccasions: digits(v) })} /></View>
        </View>
        {canWrite && draft ? (
          <View style={styles.row}>
            <HrButton colors={colors} primary label="Lagre regler" nativeID="hr-sick-rules-save" onPress={save} />
            <HrButton colors={colors} label="Avbryt" onPress={() => setDraft(null)} />
          </View>
        ) : null}
      </View>
    </HrCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  case: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  item: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  between: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { ...type.bodyStrong },
  meta: { ...type.label, fontWeight: '400' },
  status: { ...type.label, fontWeight: '600' },
  label: { fontSize: 14, fontWeight: '600' },
  line: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { flexGrow: 1, flexBasis: 180 },
});
