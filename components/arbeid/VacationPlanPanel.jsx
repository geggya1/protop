import React, { useMemo, useState } from 'react';
import {
  Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View,
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
  vacationRequestBalance,
} from '../../src/arbeid/vacationPlan.js';

// Samme farger og vekt som resten av fraværssidene (CompanyAbsenceDesktop): ingen fet skrift.
const ink = '#152033';
const muted = '#8B95A6';
const soft = '#66758A';
const line = '#E6EBF2';
const blue = '#2F6BDB';
const green = '#15803D';
const greenSoft = '#EEF8F1';
const greenLine = '#16A34A';
const amber = '#9A6700';
const amberSoft = '#FFF8E8';
const danger = '#B42318';

/** Antall godkjente perioder i skuffen før «Vis alle». */
const APPROVED_STEP = 8;
/** Antall personer under Dager igjen før «Vis alle». */
const REMAINING_STEP = 12;

function daysLabel(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  const shown = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return shown;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function periodLabel(row) {
  return row.start === row.end
    ? formatPlanDate(row.start)
    : `${formatPlanDate(row.start)} – ${formatPlanDate(row.end)}`;
}

/** «Godkjent 29.10.2026 kl. 10:12 av Hanne Hansen». Eldre godkjenninger har verken tid eller navn. */
function approvalLabel(row, nameOf) {
  const who = row.approvedByName || nameOf(row.approvedByUid) || '';
  const when = row.approvedAt ? new Date(row.approvedAt) : null;
  const date = when && !Number.isNaN(when.getTime())
    ? `${pad(when.getDate())}.${pad(when.getMonth() + 1)}.${when.getFullYear()} kl. ${pad(when.getHours())}:${pad(when.getMinutes())}`
    : '';
  if (!date && !who) return 'Godkjent før dato og godkjenner ble lagret';
  return ['Godkjent', date, who ? `av ${who}` : ''].filter(Boolean).join(' ');
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
 * - board: Planlagt fravær for HR (godkjenning, godkjent-skuff, dager igjen)
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
  onReopen,
  onRegister,
}) {
  const [showAll, setShowAll] = useState(false);
  const [approvedOpen, setApprovedOpen] = useState(false);
  const [approvedAll, setApprovedAll] = useState(false);
  const [lastApproved, setLastApproved] = useState('');
  const current = useMemo(() => normalizeVacationPlan(plan || {}), [plan]);
  const people = useMemo(() => {
    const list = (employees || []).filter(isPlanningEmployee);
    if (canManage && !focusEmployeeId) return list;
    const id = focusEmployeeId || list[0]?.id;
    return list.filter((row) => row.id === id);
  }, [employees, canManage, focusEmployeeId]);
  const byId = useMemo(() => {
    const map = new Map();
    for (const row of employees || []) {
      if (row?.id) map.set(row.id, row);
    }
    return map;
  }, [employees]);
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
  const nameOf = (uid) => (uid ? directory.resolvePerson?.(uid)?.name || '' : '');
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
    const shownRemaining = showAll ? remainingPeople : remainingPeople.slice(0, REMAINING_STEP);
    const shownApproved = approvedAll ? approved : approved.slice(0, APPROVED_STEP);
    const latest = approved.find((row) => row.approvedAt);
    const approve = (row) => {
      onApprove?.(row.ids);
      setLastApproved(row.ids[0] || '');
      setApprovedOpen(true);
    };
    return (
      <View style={styles.wrap} nativeID="ferieplan-panel">
        <View style={[styles.card, styles.head]} nativeID="ferieplan-statuskort">
          <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
            <Text style={styles.cardTitle}>{`Ferieplan ${current.year}`}</Text>
            <Text style={styles.hint}>
              {announced
                ? `${planningPhaseLabel(window.phase)}${window.effectiveDeadline ? `. Frist ${formatPlanDate(window.effectiveDeadline)}` : ''}.`
                : 'Ferieplanen er ikke sendt ut ennå. Startsaldo settes under Fravær → Innstillinger.'}
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          </View>
          <TouchableOpacity onPress={onRegister} style={styles.primary} accessibilityRole="button" nativeID="registrer-ferie-hr">
            <Ionicons name="add" size={15} color="#fff" />
            <Text style={styles.primaryText}>Registrer ferie</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.columns}>
          <View style={styles.mainCol}>
            <View style={styles.card} nativeID="ferieplan-godkjenninger">
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>Skal godkjennes</Text>
                <Text style={styles.countBadge}>{pending.length}</Text>
              </View>
              <Text style={styles.hint}>
                {`Innmeldt ferie som venter. HR skal ta stilling innen ${current.approvalDays} dager. Saldoen gjelder året ferien ligger i.`}
              </Text>
              {pending.length ? pending.map((row) => {
                const balance = vacationRequestBalance(byId.get(row.employeeId), current, row, { absences, today, dayHours });
                return (
                  <View key={row.ids[0] || row.start} style={styles.request} nativeID={`ferieplan-venter-${row.ids[0]}`}>
                    <View style={styles.requestMain}>
                      <Text style={styles.name} numberOfLines={1}>{row.employeeName}</Text>
                      <Text style={styles.meta}>{`${periodLabel(row)} · ${daysLabel(row.days)} ${row.days === 1 ? 'dag' : 'dager'}`}</Text>
                      <View style={styles.badgeRow}>
                        <Text style={[styles.badge, styles.badgePending]}>Venter</Text>
                        <Text style={[styles.badge, row.overdue ? styles.badgeDanger : styles.badgeQuiet]}>
                          {row.overdue ? `Frist ${formatPlanDate(row.due)} er passert` : `Frist ${formatPlanDate(row.due)}`}
                        </Text>
                        {row.shortNotice ? <Text style={[styles.badge, styles.badgeQuiet]}>Starter innen to måneder</Text> : null}
                        {row.extraordinary ? <Text style={[styles.badge, styles.badgePending]}>Særskilt behandling</Text> : null}
                      </View>
                    </View>
                    {balance ? (
                      <View style={styles.balance} nativeID={`ferieplan-saldo-${row.ids[0]}`}>
                        <Text style={styles.meta}>{`Saldo ${balance.year}: ${daysLabel(balance.total)} d`}</Text>
                        <Text style={styles.meta}>{`Igjen før: ${daysLabel(balance.before)} d`}</Text>
                        <Text style={[styles.balanceAfter, balance.over && styles.balanceOver]}>
                          {balance.over
                            ? `${daysLabel(-balance.after)} d over saldo`
                            : `Igjen etter: ${daysLabel(balance.after)} d`}
                        </Text>
                      </View>
                    ) : null}
                    <TouchableOpacity
                      onPress={() => approve(row)}
                      style={styles.ghost}
                      accessibilityRole="button"
                      accessibilityLabel={`Godkjenn ferie for ${row.employeeName}`}
                      nativeID={`ferieplan-godkjenn-${row.ids[0]}`}
                    >
                      <Ionicons name="checkmark" size={15} color={green} />
                      <Text style={styles.ghostText}>Godkjenn</Text>
                    </TouchableOpacity>
                  </View>
                );
              }) : <Text style={styles.empty}>Ingen ferie venter på godkjenning.</Text>}
            </View>

            <View style={[styles.card, styles.drawer]} nativeID="ferieplan-godkjent">
              <Pressable
                onPress={() => setApprovedOpen((open) => !open)}
                style={({ hovered }) => [styles.drawerHead, hovered && styles.drawerHeadHover]}
                accessibilityRole="button"
                accessibilityState={{ expanded: approvedOpen }}
                accessibilityLabel={approvedOpen ? 'Lukk Godkjent' : 'Åpne Godkjent'}
                nativeID="ferieplan-godkjent-skuff"
              >
                <Ionicons name={approvedOpen ? 'chevron-down' : 'chevron-forward'} size={16} color={soft} />
                <Ionicons name="checkmark-circle" size={16} color={greenLine} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cardTitle}>Godkjent</Text>
                  <Text style={styles.hint} numberOfLines={1}>
                    {latest
                      ? `Sist: ${latest.employeeName}, ${approvalLabel(latest, nameOf).replace(/^Godkjent /, '')}`
                      : `Godkjent ferie i ${current.year > Number(String(today).slice(0, 4)) ? `${String(today).slice(0, 4)} og ${current.year}` : current.year}.`}
                  </Text>
                </View>
                <Text style={[styles.countBadge, styles.countGreen]}>{approved.length}</Text>
              </Pressable>
              {approvedOpen ? (
                <>
                  {shownApproved.length ? shownApproved.map((row) => {
                    const fresh = !!lastApproved && row.ids.includes(lastApproved);
                    return (
                      <View
                        key={row.ids[0] || row.start}
                        style={[styles.approved, fresh && styles.approvedFresh]}
                        nativeID={`ferieplan-godkjent-${row.ids[0]}`}
                      >
                        <View style={styles.requestMain}>
                          <Text style={styles.name} numberOfLines={1}>{row.employeeName}</Text>
                          <Text style={styles.meta}>{`${periodLabel(row)} · ${daysLabel(row.days)} ${row.days === 1 ? 'dag' : 'dager'}`}</Text>
                          <View style={styles.approvedBy}>
                            <Ionicons name="checkmark-circle" size={14} color={greenLine} />
                            <Text style={styles.approvedText}>{approvalLabel(row, nameOf)}</Text>
                          </View>
                        </View>
                        {onReopen && !row.locked ? (
                          <TouchableOpacity
                            onPress={() => {
                              onReopen(row.ids);
                              if (row.ids.includes(lastApproved)) setLastApproved('');
                            }}
                            style={styles.ghostSmall}
                            accessibilityRole="button"
                            accessibilityLabel={`Angre godkjenning for ${row.employeeName}`}
                            nativeID={`ferieplan-angre-${row.ids[0]}`}
                          >
                            <Ionicons name="arrow-undo-outline" size={14} color={soft} />
                            <Text style={styles.ghostText}>Angre</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    );
                  }) : <Text style={styles.empty}>Ingen godkjent ferie ennå.</Text>}
                  {approved.length > APPROVED_STEP ? (
                    <TouchableOpacity onPress={() => setApprovedAll((value) => !value)} nativeID="ferieplan-godkjent-alle">
                      <Text style={styles.link}>{approvedAll ? 'Vis færre' : `Vis alle ${approved.length}`}</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : null}
            </View>
          </View>

          <View style={styles.sideCol}>
            <View style={styles.card} nativeID="ferieplan-dager-igjen">
              <View style={styles.cardHead}>
                <Text style={styles.cardTitle}>Dager igjen</Text>
                <Text style={styles.countBadge}>{remainingPeople.length}</Text>
              </View>
              <Text style={styles.hint}>
                {`Aktive interne ansatte og feriedagene de har igjen å planlegge i ${current.year}.`}
              </Text>
              {shownRemaining.length ? shownRemaining.map(({ person, quota }) => (
                <View key={person.id} style={styles.remaining} nativeID={`ferieplan-igjen-${person.id}`}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.name} numberOfLines={1}>{names[person.id] || employeePlanName(person)}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {`Saldo ${daysLabel(quota.total)} · planlagt ${daysLabel(quota.planned)} · tatt ut ${daysLabel(quota.taken)}`}
                    </Text>
                  </View>
                  <Text style={[styles.sum, quota.remaining < -0.001 && styles.balanceOver]}>
                    {`${daysLabel(Math.max(0, quota.remaining))} d`}
                  </Text>
                </View>
              )) : (
                <Text style={styles.empty}>Ingen aktive interne ansatte å vise.</Text>
              )}
              {remainingPeople.length > REMAINING_STEP ? (
                <TouchableOpacity onPress={() => setShowAll((value) => !value)} nativeID="ferieplan-igjen-alle">
                  <Text style={styles.link}>{showAll ? 'Vis færre' : `Vis alle ${remainingPeople.length}`}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
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
              <Ionicons name="chevron-back" size={18} color={ink} />
            </TouchableOpacity>
            <Text style={styles.year}>{current.year}</Text>
            <TouchableOpacity onPress={() => onChange?.(vacationPlanForYear(current, current.year + 1))} accessibilityLabel="Neste år" nativeID="ferieplan-aar-neste">
              <Ionicons name="chevron-forward" size={18} color={ink} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.reminder} nativeID="ferieplan-paaminnelse">
          <Ionicons name="alarm-outline" size={18} color={amber} />
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
                <Ionicons name={row.assign ? 'checkbox' : 'square-outline'} size={18} color={row.assign ? blue : muted} />
                <Text style={styles.hint}>Legg datoene inn som planlagt ferie ved utsending</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => patch({ fixedExtras: current.fixedExtras.filter((item) => item.id !== row.id) })} accessibilityLabel="Fjern ekstra dager">
                <Ionicons name="trash-outline" size={18} color={danger} />
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
          <TouchableOpacity onPress={() => onSave?.(current)} disabled={busy} style={styles.ghost} nativeID="ferieplan-lagre">
            <Text style={styles.ghostText}>{busy ? 'Lagrer…' : 'Lagre'}</Text>
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
                <Text style={styles.name}>{names[person.id] || employeePlanName(person)}</Text>
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
                  <Ionicons name={seniorOn ? 'checkbox' : 'square-outline'} size={18} color={seniorOn ? blue : muted} />
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

const badge = {
  overflow: 'hidden',
  borderRadius: 6,
  paddingHorizontal: 7,
  paddingVertical: 2,
  fontSize: 12,
  fontWeight: '400',
};

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: line,
  },
  head: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' },
  // Godkjenning til venstre, Dager igjen til høyre. Smalt vindu: under hverandre.
  columns: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: 10 },
  mainCol: { flexGrow: 1.7, flexShrink: 1, flexBasis: 560, minWidth: 280, gap: 10 },
  sideCol: { flexGrow: 1, flexShrink: 1, flexBasis: 300, minWidth: 260, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { color: ink, fontSize: 13, fontWeight: '400' },
  countBadge: {
    ...badge,
    color: muted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    backgroundColor: '#F3F6FA',
  },
  countGreen: { color: green, backgroundColor: greenSoft },
  title: { color: ink, fontSize: 15, fontWeight: '400' },
  lead: { color: soft, fontSize: 13, lineHeight: 18 },
  hint: { color: muted, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  empty: { color: muted, fontSize: 13, paddingVertical: 2 },
  memo: { color: ink, fontSize: 14, lineHeight: 20 },
  yearRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  year: { color: ink, fontSize: 15, fontWeight: '400', minWidth: 48, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { gap: 6, minWidth: 180, flexGrow: 1 },
  label: { color: muted, fontSize: 12, fontWeight: '400' },
  input: {
    borderWidth: 1,
    borderColor: line,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: ink,
    backgroundColor: '#fff',
    fontSize: 14,
  },
  memoInput: { minHeight: 76, textAlignVertical: 'top' },
  daysInput: { width: 72, flexGrow: 0 },
  extra: { gap: 8, padding: 10, borderRadius: 8, backgroundColor: '#F4F7FB' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: line, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fff' },
  chipText: { color: ink, fontSize: 13, fontWeight: '400' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sumBox: { gap: 4, padding: 12, borderRadius: 8, backgroundColor: '#E7F3FB' },
  reminder: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: amberSoft,
    borderWidth: 1,
    borderColor: '#F5E6B8',
  },
  line: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  strong: { color: ink, fontWeight: '400' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  // Knappene som Filtrer og Lagre på de andre fraværssidene: normal vekt, 8 px hjørner.
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: blue,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignSelf: 'flex-start',
  },
  primaryText: { color: '#fff', fontSize: 13, fontWeight: '400' },
  ghost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    paddingHorizontal: 12,
    paddingVertical: 7,
    alignSelf: 'center',
    backgroundColor: '#fff',
  },
  ghostSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: line,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'center',
    backgroundColor: '#fff',
  },
  ghostText: { color: ink, fontSize: 13, fontWeight: '400' },
  error: { color: danger, fontSize: 13 },
  notice: { color: green, fontSize: 13 },
  warn: { color: amber, fontSize: 13, lineHeight: 18, flex: 1 },
  request: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: line,
  },
  requestMain: { flex: 1, minWidth: 200, gap: 2 },
  balance: { width: 150, gap: 1 },
  balanceAfter: { color: ink, fontSize: 13, fontWeight: '400', fontVariant: ['tabular-nums'] },
  balanceOver: { color: danger },
  name: { color: ink, fontSize: 13, fontWeight: '400' },
  meta: { color: muted, fontSize: 13, fontWeight: '400', fontVariant: ['tabular-nums'] },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 3 },
  badge,
  badgePending: { color: amber, backgroundColor: amberSoft },
  badgeQuiet: { color: soft, backgroundColor: '#F3F6FA' },
  badgeDanger: { color: danger, backgroundColor: '#FDECEC' },
  drawer: { gap: 6 },
  drawerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: -6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  drawerHeadHover: { backgroundColor: '#F4F7FB' },
  // Godkjent ferie er grønn: lys flate og grønn kant til venstre.
  approved: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: greenSoft,
    borderLeftWidth: 3,
    borderLeftColor: greenLine,
  },
  approvedFresh: { backgroundColor: '#DDF3E4' },
  approvedBy: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  approvedText: { color: green, fontSize: 13, fontWeight: '400', flexShrink: 1 },
  remaining: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: line,
  },
  person: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', paddingTop: 8, borderTopWidth: 1, borderTopColor: line },
  sum: { color: ink, fontSize: 14, fontWeight: '400', minWidth: 44, textAlign: 'right', fontVariant: ['tabular-nums'] },
  link: { color: blue, fontSize: 13 },
});
