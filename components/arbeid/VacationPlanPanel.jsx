import React, { useMemo, useState } from 'react';
import {
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import IsoDateField from './IsoDateField';
import TypedInput from '../../src/ui/TypedInput';
import { sameOrCleared } from '../../src/ui/typedText';
import { useCompanyDirectory } from '../../src/context/CompanyDataContext';
import {
  FIXED_EXTRA_TEMPLATES,
  approvedVacationRequests,
  employeePlanName,
  firstWorkingDayBalanceReminder,
  formatPlanDate,
  isPlanningEmployee,
  isUpcomingVacationPlanYear,
  normalizeVacationPlan,
  openingBalanceYearLabel,
  pendingVacationRequests,
  planningPhaseLabel,
  planningWindow,
  vacationPlanForYear,
  vacationPlanId,
  vacationQuota,
} from '../../src/arbeid/vacationPlan.js';

function daysLabel(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  const shown = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return shown;
}

function NumberField({ label, value, onChange, nativeID, hint }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value == null ? '' : String(value)}
        onChangeText={(raw) => {
          const cleaned = raw.replace(',', '.');
          if (cleaned === '') {
            onChange(0);
            return;
          }
          if (!/^\d{0,3}(\.\d{0,2})?$/.test(cleaned)) return;
          onChange(cleaned.endsWith('.') ? cleaned : Number(cleaned));
        }}
        keyboardType="decimal-pad"
        style={styles.input}
        nativeID={nativeID}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * variant:
 * - settings: Fravær → Innstillinger (startsaldo, regler, ansatte)
 * - board: Planlagt fravær for HR (godkjenning, godkjent, dager igjen)
 * Employee-visning brukes automatisk når canManage er false.
 */
export default function VacationPlanPanel({
  plan,
  employees = [],
  names = {},
  absences = [],
  dayHours = 8,
  today = '',
  canManage = false,
  variant = 'board',
  focusEmployeeId = '',
  companyName = '',
  busy = false,
  notice = '',
  error = '',
  onChange,
  onSave,
  onSend,
  onApprove,
  onRegister,
}) {
  const [showAll, setShowAll] = useState(false);
  const current = useMemo(() => normalizeVacationPlan(plan || {}), [plan]);
  const people = useMemo(() => {
    const list = (employees || []).filter(isPlanningEmployee);
    if (canManage && !focusEmployeeId) return list;
    const id = focusEmployeeId || list[0]?.id;
    return list.filter((row) => row.id === id);
  }, [employees, canManage, focusEmployeeId]);
  const window = planningWindow(current, today);
  const announced = !!current.announcedAt;
  // Navn fra registeret også for ferie ført på uid eller på personer utenfor utvalget (DS-08).
  const directory = useCompanyDirectory();
  const lookupNames = useMemo(() => {
    let out = names;
    for (const row of absences || []) {
      const id = String(row?.employeeId || '');
      if (!id || out[id]) continue;
      const name = directory.resolvePerson?.(id)?.name;
      if (!name) continue;
      if (out === names) out = { ...names };
      out[id] = name;
    }
    return out;
  }, [names, absences, directory]);
  const pending = useMemo(() => (
    canManage ? pendingVacationRequests(absences, {
      year: current.year,
      today,
      approvalDays: current.approvalDays,
      dayHours,
      names: lookupNames,
    }) : []
  ), [absences, canManage, current.year, current.approvalDays, today, dayHours, lookupNames]);
  const approved = useMemo(() => (
    canManage ? approvedVacationRequests(absences, {
      year: current.year,
      today,
      approvalDays: current.approvalDays,
      dayHours,
      names: lookupNames,
    }) : []
  ), [absences, canManage, current.year, current.approvalDays, today, dayHours, lookupNames]);
  const sample = vacationQuota({ id: '_sample', person: {}, company: { status: 'active' } }, { ...current, grants: {} }, { today, dayHours });
  const upcomingYear = isUpcomingVacationPlanYear(current.year, today);
  const balanceTitle = openingBalanceYearLabel(current.year, today);
  const yearReminder = firstWorkingDayBalanceReminder(current.year);

  function patch(partial) {
    onChange?.(normalizeVacationPlan({ ...current, ...partial }));
  }

  function updateGrant(employeeId, partial) {
    const prev = current.grants[employeeId] || { carryoverDays: 0, extraAgreedDays: null, senior: null };
    patch({ grants: { ...current.grants, [employeeId]: { ...prev, ...partial } } });
  }

  function updateExtra(id, partial) {
    patch({
      fixedExtras: current.fixedExtras.map((row) => (row.id === id ? { ...row, ...partial } : row)),
    });
  }

  if (!canManage) {
    const person = people[0];
    const quota = person ? vacationQuota(person, current, { absences, today, dayHours }) : null;
    return (
      <View style={styles.wrap} nativeID="ferieplan-panel">
        <View style={styles.card}>
          <Text style={styles.title}>{`Ferieplan ${current.year}`}</Text>
          {announced && quota ? (
            <>
              <Text style={styles.lead}>
                {`${planningPhaseLabel(window.phase)}. ${window.effectiveDeadline ? `Frist ${formatPlanDate(window.effectiveDeadline)}.` : ''}`}
              </Text>
              {current.memo ? <Text style={styles.memo}>{current.memo}</Text> : null}
              {quota.lines.map((row) => (
                <Line key={row.key} label={row.label} value={`+ ${daysLabel(row.days)}`} />
              ))}
              <Line label="Sum til planlegging" value={daysLabel(quota.total)} strong />
              <Line label="Planlagt frem i tid" value={daysLabel(quota.planned)} />
              <Line label="Tatt ut" value={daysLabel(quota.taken)} />
              <Line label="Igjen å planlegge" value={daysLabel(Math.max(0, quota.remaining))} strong />
              <Text style={styles.hint}>
                {`Hovedferie 1. juni–30. september: ${daysLabel(quota.main)} av ${daysLabel(current.mainVacationDays)} dager. Ferieloven legger opp til at tre uker kan kreves i denne perioden.`}
              </Text>
              {window.locked ? (
                <Text style={styles.warn}>
                  Planleggingen er låst. Du kan fortsatt registrere, men søknaden krever særskilt godkjenning og kan ikke påregnes godkjent uten videre.
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.lead}>
              {`${companyName || 'Bedriften'} har ikke sendt ut ferieplanen for ${current.year} ennå. Du kan likevel registrere ferie.`}
            </Text>
          )}
          <TouchableOpacity onPress={onRegister} style={styles.primary} accessibilityRole="button" nativeID="registrer-ferie">
            <Text style={styles.primaryText}>{window.locked ? 'Send ferie til godkjenning' : '+ Registrer ferie'}</Text>
          </TouchableOpacity>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </View>
    );
  }

  if (variant === 'board') {
    const remainingPeople = people.map((person) => ({
      person,
      quota: vacationQuota(person, current, { absences, today, dayHours }),
    }));
    return (
      <View style={styles.wrap} nativeID="ferieplan-panel">
        <View style={styles.card} nativeID="ferieplan-statuskort">
          <View style={styles.head}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={styles.title}>{`Ferieplan ${current.year}`}</Text>
              <Text style={styles.lead}>
                {announced
                  ? `${planningPhaseLabel(window.phase)}${window.effectiveDeadline ? `. Frist ${formatPlanDate(window.effectiveDeadline)}` : ''}.`
                  : 'Ferieplanen er ikke sendt ut ennå. Startsaldo settes under Fravær → Innstillinger.'}
              </Text>
            </View>
            <TouchableOpacity onPress={onRegister} style={styles.primary} nativeID="registrer-ferie-hr">
              <Text style={styles.primaryText}>Registrer ferie</Text>
            </TouchableOpacity>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        </View>

        <View style={styles.card} nativeID="ferieplan-godkjenninger">
          <Text style={styles.title}>Skal godkjennes</Text>
          <Text style={styles.lead}>
            {`Innmeldt ferie som venter. HR skal ta stilling innen ${current.approvalDays} dager.`}
          </Text>
          {pending.length ? pending.map((row) => (
            <View key={row.ids[0] || row.start} style={styles.person} nativeID={`ferieplan-venter-${row.ids[0]}`}>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Text style={styles.personName}>{row.employeeName}</Text>
                <Text style={styles.hint}>
                  {`${formatPlanDate(row.start)} – ${formatPlanDate(row.end)} · ${daysLabel(row.days)} dager`}
                  {row.extraordinary ? ' · særskilt behandling' : ''}
                  {row.overdue ? ` · frist ${formatPlanDate(row.due)} er passert` : ` · frist ${formatPlanDate(row.due)}`}
                  {row.shortNotice ? ' · starter innen to måneder' : ''}
                </Text>
                <View style={styles.badgeRow}>
                  <Text style={styles.badgePending}>Venter på godkjenning</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => onApprove?.(row.ids)} style={styles.secondary} nativeID={`ferieplan-godkjenn-${row.ids[0]}`}>
                <Text style={styles.secondaryText}>Godkjenn</Text>
              </TouchableOpacity>
            </View>
          )) : <Text style={styles.hint}>Ingen ferie venter på godkjenning.</Text>}
        </View>

        <View style={styles.card} nativeID="ferieplan-godkjent">
          <Text style={styles.title}>Godkjent</Text>
          <Text style={styles.lead}>{`Godkjent ferie i ${current.year}.`}</Text>
          {approved.length ? approved.map((row) => (
            <View key={row.ids[0] || row.start} style={styles.person} nativeID={`ferieplan-godkjent-${row.ids[0]}`}>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Text style={styles.personName}>{row.employeeName}</Text>
                <Text style={styles.hint}>
                  {`${formatPlanDate(row.start)} – ${formatPlanDate(row.end)} · ${daysLabel(row.days)} dager`}
                </Text>
                <View style={styles.badgeRow}>
                  <Text style={styles.badgeApproved}>Godkjent</Text>
                </View>
              </View>
            </View>
          )) : <Text style={styles.hint}>Ingen godkjent ferie ennå for dette året.</Text>}
        </View>

        <View style={styles.card} nativeID="ferieplan-dager-igjen">
          <Text style={styles.title}>Dager igjen</Text>
          <Text style={styles.lead}>
            Aktive interne ansatte og hvor mange feriedager de har igjen å planlegge i {current.year}.
          </Text>
          {remainingPeople.length ? remainingPeople.map(({ person, quota }) => (
            <View key={person.id} style={styles.person} nativeID={`ferieplan-igjen-${person.id}`}>
              <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
                <Text style={styles.personName}>{names[person.id] || employeePlanName(person)}</Text>
                <Text style={styles.hint}>
                  {`Saldo ${daysLabel(quota.total)} · planlagt ${daysLabel(quota.planned)} · tatt ut ${daysLabel(quota.taken)}`}
                </Text>
              </View>
              <Text style={styles.sum}>{`${daysLabel(Math.max(0, quota.remaining))} d igjen`}</Text>
            </View>
          )) : (
            <Text style={styles.hint}>Ingen aktive interne ansatte å vise.</Text>
          )}
        </View>
      </View>
    );
  }

  const visiblePeople = showAll ? people : people.slice(0, 8);
  return (
    <View style={styles.wrap} nativeID="ferieplan-panel">
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.title}>Innstillinger for ferieplan</Text>
            <Text style={styles.lead}>
              {`${balanceTitle}. Gjelder bare aktive interne ansatte. Summen er det hver ansatt skal planlegge.`}
            </Text>
          </View>
          <View style={styles.yearRow}>
            <TouchableOpacity onPress={() => onChange?.(vacationPlanForYear(current, current.year - 1))} accessibilityLabel="Forrige år" nativeID="ferieplan-aar-forrige">
              <Ionicons name="chevron-back" size={18} color="#152033" />
            </TouchableOpacity>
            <Text style={styles.year}>{current.year}</Text>
            <TouchableOpacity onPress={() => onChange?.(vacationPlanForYear(current, current.year + 1))} accessibilityLabel="Neste år" nativeID="ferieplan-aar-neste">
              <Ionicons name="chevron-forward" size={18} color="#152033" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.reminder} nativeID="ferieplan-paaminnelse">
          <Ionicons name="alarm-outline" size={18} color="#9A6700" />
          <Text style={styles.warn}>{yearReminder}</Text>
        </View>

        {upcomingYear ? (
          <View style={styles.sumBox} nativeID="ferieplan-inngaende-merke">
            <Text style={styles.strong}>{balanceTitle}</Text>
            <Text style={styles.hint}>
              {`${current.year} er neste år som er i vente. Tallene under er inngående feriedagssaldo som skal gjelde fra 1. januar ${current.year}.`}
            </Text>
          </View>
        ) : null}

        <View style={styles.grid}>
          <NumberField label="Ordinær ferie" value={current.ordinaryDays} onChange={(ordinaryDays) => patch({ ordinaryDays })} nativeID="ferieplan-ordinar" hint="Fem uker mandag–fredag. Ferielovens 25 virkedager inkluderer lørdag." />
          <NumberField label="Senioruke, dager" value={current.seniorDays} onChange={(seniorDays) => patch({ seniorDays })} nativeID="ferieplan-senior-dager" hint={`Foreslått fra året man fyller ${current.seniorAge}. Én uke uten lørdag er 5 dager.`} />
          <NumberField label="Aldersgrense" value={current.seniorAge} onChange={(seniorAge) => patch({ seniorAge })} nativeID="ferieplan-senior-alder" hint="Ferieloven bruker året man fyller 60." />
          <NumberField label="Maks overføring" value={current.carryoverMax} onChange={(carryoverMax) => patch({ carryoverMax })} nativeID="ferieplan-overforing-maks" hint="To uker uten lørdag er 10. Loven åpner for avtale om 12 virkedager." />
          <NumberField label="Ekstra avtalt ferie" value={current.extraAgreedDays} onChange={(extraAgreedDays) => patch({ extraAgreedDays })} nativeID="ferieplan-ekstra-avtalt" hint="Felles antall. Kan overstyres per ansatt." />
          <NumberField label="Godkjenningsfrist, dager" value={current.approvalDays} onChange={(approvalDays) => patch({ approvalDays })} nativeID="ferieplan-godkjenning" hint="HR skal godkjenne innmeldt ferie innen denne fristen. 14 dager er vanlig." />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Frist for å planlegge</Text>
          <IsoDateField
            value={current.planDeadline}
            onChange={(planDeadline) => patch({
              planDeadline,
              extendedDeadline: '',
              notices: {},
            })}
            nativeID="ferieplan-frist"
          />
          <Text style={styles.hint}>
            Påminnelse går ut tre dager før. Etter fristen får de som har dager igjen én uke ekstra, og deretter låses ordinær registrering.
          </Text>
          {current.extendedDeadline ? (
            <Text style={styles.warn}>{`Utvidet frist er satt til ${formatPlanDate(current.extendedDeadline)}.`}</Text>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Faste ekstra feriedager</Text>
          <Text style={styles.hint}>For eksempel inneklemte dager i påsken eller mellom jul og nyttår. Dagene legges til summen for alle.</Text>
          {current.fixedExtras.map((row) => (
            <View key={row.id} style={styles.extra} nativeID={`ferieplan-ekstra-${row.id}`}>
              {/* Tomt navn fjerner raden i planen, så et tømt felt beholder det gamle navnet til noe er skrevet. */}
              <TypedInput
                same={sameOrCleared}
                value={row.label}
                onChangeText={(label) => { if (label.trim()) updateExtra(row.id, { label }); }}
                style={[styles.input, { flex: 1 }]}
              />
              <TextInput
                value={String(row.days)}
                onChangeText={(raw) => updateExtra(row.id, { days: Number(raw.replace(',', '.')) || 0 })}
                keyboardType="decimal-pad"
                style={[styles.input, styles.daysInput]}
                accessibilityLabel="Antall dager"
              />
              <IsoDateField value={row.from} onChange={(from) => updateExtra(row.id, { from })} placeholder="Fra" nativeID={`ferieplan-ekstra-fra-${row.id}`} />
              <IsoDateField value={row.to} min={row.from} onChange={(to) => updateExtra(row.id, { to })} placeholder="Til" nativeID={`ferieplan-ekstra-til-${row.id}`} />
              <TouchableOpacity
                onPress={() => updateExtra(row.id, { assign: !row.assign })}
                style={styles.check}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: row.assign }}
              >
                <Ionicons name={row.assign ? 'checkbox' : 'square-outline'} size={18} color={row.assign ? '#1E6FEA' : '#8B95A6'} />
                <Text style={styles.hint}>Legg datoene inn som planlagt ferie ved utsending</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => patch({ fixedExtras: current.fixedExtras.filter((item) => item.id !== row.id) })} accessibilityLabel="Fjern ekstra dager">
                <Ionicons name="trash-outline" size={18} color="#B42318" />
              </TouchableOpacity>
            </View>
          ))}
          <View style={styles.row}>
            {FIXED_EXTRA_TEMPLATES.map((item) => (
              <TouchableOpacity
                key={item.label}
                onPress={() => patch({ fixedExtras: [...current.fixedExtras, { id: vacationPlanId('fex'), label: item.label, days: 0, from: '', to: '', assign: false }] })}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{`+ ${item.label}`}</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              onPress={() => patch({ fixedExtras: [...current.fixedExtras, { id: vacationPlanId('fex'), label: 'Ekstra feriedager', days: 0, from: '', to: '', assign: false }] })}
              style={styles.chip}
              nativeID="ferieplan-ekstra-ny"
            >
              <Text style={styles.chipText}>+ Annen fast dag</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Memo til alle</Text>
          <TypedInput
            value={current.memo}
            onChangeText={(memo) => patch({ memo })}
            placeholder="+ 25 dager ordinær ferie. Husk å legge hovedferien mellom 1. juni og 30. september."
            placeholderTextColor="#A0A8B8"
            multiline
            style={[styles.input, styles.memoInput]}
            nativeID="ferieplan-memo"
          />
        </View>

        <View style={styles.sumBox} nativeID="ferieplan-sum">
          <Text style={styles.label}>{balanceTitle}</Text>
          {sample.lines.map((row) => (
            <Line key={row.key} label={row.label} value={`+ ${daysLabel(row.days)}`} />
          ))}
          <Line label="Sum uten senioruke og overføring" value={daysLabel(sample.total)} strong />
          <Text style={styles.hint}>Senioruke og innvilget overføring legges på den enkelte under.</Text>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity onPress={() => onSave?.(current)} disabled={busy} style={styles.secondary} nativeID="ferieplan-lagre">
            <Text style={styles.secondaryText}>{busy ? 'Lagrer…' : 'Lagre'}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onSend?.(current)} disabled={busy} style={styles.primary} nativeID="ferieplan-send">
            <Text style={styles.primaryText}>{busy ? 'Sender…' : 'Send melding til alle'}</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.hint}>
          Utsending oppdaterer startsaldo til summen for aktive interne ansatte og sender melding i ProTop og på e-post, med saldoen og memoet.
        </Text>
        {announced ? <Text style={styles.notice}>{`Sist sendt ${formatPlanDate(current.announcedAt.slice(0, 10)) || 'tidligere'}. ${planningPhaseLabel(window.phase)}.`}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Aktive interne ansatte</Text>
        <Text style={styles.lead}>
          Overføring fra i fjor legges inn for dem som har fått den innvilget, innenfor maksantallet. Bare ansatte med status aktiv og uten ekstern markering.
        </Text>
        {visiblePeople.map((person) => {
          const quota = vacationQuota(person, current, { absences, today, dayHours });
          const grant = current.grants[person.id] || {};
          const seniorOn = grant.senior === true || (grant.senior == null && quota.senior);
          return (
            <View key={person.id} style={styles.person} nativeID={`ferieplan-ansatt-${person.id}`}>
              <View style={{ flex: 1, minWidth: 180, gap: 2 }}>
                <Text style={styles.personName}>{names[person.id] || employeePlanName(person)}</Text>
                <Text style={styles.hint}>
                  {quota.seniorUnknown
                    ? 'Fødselsdato mangler, senioruke er ikke foreslått.'
                    : (quota.age == null ? '' : `Fyller ${quota.age} år i ${current.year}.`)}
                  {` Planlagt ${daysLabel(quota.planned)} · igjen ${daysLabel(quota.remaining)}`}
                </Text>
              </View>
              <NumberField
                label="Overført"
                value={grant.carryoverDays || 0}
                onChange={(carryoverDays) => updateGrant(person.id, { carryoverDays })}
                nativeID={`ferieplan-overfort-${person.id}`}
                hint={quota.carryoverCapped ? `Kappes til maks ${daysLabel(current.carryoverMax)}.` : ''}
              />
              <NumberField
                label="Ekstra avtalt"
                value={grant.extraAgreedDays == null ? current.extraAgreedDays : grant.extraAgreedDays}
                onChange={(extraAgreedDays) => updateGrant(person.id, {
                  extraAgreedDays: extraAgreedDays === current.extraAgreedDays ? null : extraAgreedDays,
                })}
                nativeID={`ferieplan-avtalt-${person.id}`}
              />
              {current.seniorEnabled ? (
                <TouchableOpacity
                  onPress={() => {
                    const next = !seniorOn;
                    const auto = quota.age != null && quota.age >= current.seniorAge;
                    updateGrant(person.id, { senior: next === auto ? null : next });
                  }}
                  style={styles.check}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: seniorOn }}
                  nativeID={`ferieplan-senior-${person.id}`}
                >
                  <Ionicons name={seniorOn ? 'checkbox' : 'square-outline'} size={18} color={seniorOn ? '#1E6FEA' : '#8B95A6'} />
                  <Text style={styles.hint}>Senioruke</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={styles.sum}>{`${daysLabel(quota.total)} d`}</Text>
            </View>
          );
        })}
        {people.length > 8 ? (
          <TouchableOpacity onPress={() => setShowAll((value) => !value)} nativeID="ferieplan-vis-alle">
            <Text style={styles.link}>{showAll ? 'Vis færre' : `Vis alle ${people.length}`}</Text>
          </TouchableOpacity>
        ) : null}
        {!people.length ? (
          <Text style={styles.hint}>Ingen aktive interne ansatte i selskapet.</Text>
        ) : null}
      </View>
    </View>
  );
}

function Line({ label, value, strong = false }) {
  return (
    <View style={styles.line}>
      <Text style={[styles.lead, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.lead, strong && styles.strong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#E6EBF2',
  },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  title: { color: '#152033', fontSize: 18, fontWeight: '700' },
  lead: { color: '#66758A', fontSize: 13, lineHeight: 18 },
  hint: { color: '#8B95A6', fontSize: 12, lineHeight: 16 },
  memo: { color: '#152033', fontSize: 14, lineHeight: 20 },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  year: { color: '#152033', fontSize: 16, fontWeight: '700', minWidth: 48, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { gap: 6, minWidth: 180, flexGrow: 1 },
  label: { color: '#8B95A6', fontSize: 12, fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#E6EBF2',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#152033',
    backgroundColor: '#fff',
    fontSize: 15,
  },
  memoInput: { minHeight: 76, textAlignVertical: 'top' },
  daysInput: { width: 72, flexGrow: 0 },
  extra: { gap: 8, padding: 10, borderRadius: 12, backgroundColor: '#F4F7FB' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#E6EBF2', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff' },
  chipText: { color: '#152033', fontSize: 13 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sumBox: { gap: 4, padding: 12, borderRadius: 12, backgroundColor: '#E7F3FB' },
  reminder: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FFF8E8',
    borderWidth: 1,
    borderColor: '#F5E6B8',
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  strong: { color: '#152033', fontWeight: '700' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { backgroundColor: '#1E6FEA', borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, alignSelf: 'flex-start' },
  primaryText: { color: '#fff', fontWeight: '700' },
  secondary: { borderRadius: 999, borderWidth: 1, borderColor: '#E6EBF2', paddingHorizontal: 16, paddingVertical: 10, alignSelf: 'flex-start', backgroundColor: '#fff' },
  secondaryText: { color: '#152033', fontWeight: '700' },
  error: { color: '#B42318', fontSize: 13 },
  notice: { color: '#047857', fontSize: 13 },
  warn: { color: '#9A6700', fontSize: 13, lineHeight: 18, flex: 1 },
  person: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: '#E6EBF2' },
  personName: { color: '#152033', fontSize: 15, fontWeight: '700' },
  sum: { color: '#152033', fontSize: 16, fontWeight: '700', minWidth: 48 },
  link: { color: '#1E6FEA', fontSize: 14 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  badgePending: {
    color: '#9A6700',
    backgroundColor: '#FFF8E8',
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: '700',
  },
  badgeApproved: {
    color: '#047857',
    backgroundColor: '#ECFDF5',
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 12,
    fontWeight: '700',
  },
});
