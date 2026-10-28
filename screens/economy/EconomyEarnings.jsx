import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { loadVacationPlan } from '../../src/arbeid/vacationPlanStorage';
import { displayName } from '../../src/employees/model';
import { matchEmployeePickerQuery } from '../../src/arbeid/roles.js';
import { useEmployees } from '../../src/context/CompanyDataContext';
import { formatMoney } from '../../src/economy/invoices';
import {
  calculateRoster,
  earningsStatus,
  pct,
  portfolioProjects,
  setGrunnbelop,
  setVariable,
  yearCapacity,
} from '../../src/economy/earnings';
import { fetchGrunnbelop, grunnbelopIsStale } from '../../src/economy/grunnbelop';
import { loadHrState } from '../../src/hr/storage';
import { useEarningsSettings } from '../../src/economy/useEarningsSettings';
import { useLayout } from '../../src/theme';
import EmployeeEarningsSheet from '../../components/economy/EmployeeEarningsSheet';
import EarningsSettings from '../../components/economy/EarningsSettings';
import { ActivityTabs } from '../../components/arbeid/TimesheetEmployeePicker';
import EconomyCustomers from './EconomyCustomers';
import EconomyContracts from './EconomyContracts';

const SECTIONS = [
  { id: 'ansatte', label: 'Interne' },
  { id: 'innleide', label: 'Eksterne' },
  { id: 'kunder', label: 'Kunder' },
  { id: 'prosjekt', label: 'Prosjekter' },
  { id: 'avtaler', label: 'Avtaler' },
];

function sectionFromProp(section) {
  return SECTIONS.some((row) => row.id === section) ? section : 'ansatte';
}

function money(value) {
  if (value == null) return '—';
  return formatMoney(value);
}

function parsePlain(text) {
  const n = Number(String(text ?? '').replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function EconomyEarnings({
  section = 'ansatte',
  customers = [],
  contracts = [],
  projects = [],
  timeEntries = [],
  people = [],
  onOpenCustomer,
  onOpenContract,
  onOpenProject,
  onOpenCustomerRegister,
  onOpenContractRegister,
  onOpenIndex,
}) {
  const colors = useColors();
  const { isPhone } = useLayout();
  const { familyId } = useApp();
  const access = useCompanyAccess();
  const canEarnings = access.canView('economyEarnings') || access.canView('economy');
  const canCustomers = access.canView('economyCustomers') || access.canView('economy');
  const canContracts = access.canView('economyContracts') || access.canView('economy');
  const canSee = canEarnings || canCustomers || canContracts;
  const canEdit = access.canEdit('economyEarnings') || access.canEdit('economy');
  const canAdmin = access.canAdmin('economyEarnings') || access.canAdmin('economy');
  const { settings, ready, update } = useEarningsSettings(canSee ? familyId : '');
  const [page, setPage] = useState(sectionFromProp(section));
  const sections = SECTIONS.filter((item) => {
    if (item.id === 'kunder') return canCustomers;
    if (item.id === 'avtaler') return canContracts;
    return canEarnings;
  });
  const current = sections.some((item) => item.id === page) ? page : (sections[0]?.id || '');
  // Felles lytter på ansatte i skallet.
  const { employees } = useEmployees(familyId, { enabled: !!canSee });
  const [salaries, setSalaries] = useState([]);
  const [vacationPlan, setVacationPlan] = useState(null);
  const [yearEntries, setYearEntries] = useState(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [mode, setMode] = useState('table');
  const [employeeId, setEmployeeId] = useState('');
  const [gState, setGState] = useState({ busy: false, error: '' });
  const [billableText, setBillableText] = useState('');
  const autoG = useRef(false);

  useEffect(() => {
    setPage(sectionFromProp(section));
    setMode('table');
    setEmployeeId('');
  }, [section]);

  useEffect(() => {
    if (!familyId || !canSee) return undefined;
    let live = true;
    loadHrState(familyId).then((state) => {
      if (live) setSalaries(state?.salaries || []);
    }).catch(() => {});
    loadVacationPlan(familyId).then((plan) => {
      if (live) setVacationPlan(plan);
    }).catch(() => {});
    return () => { live = false; };
  }, [familyId, canSee]);

  useEffect(() => {
    if (current !== 'prosjekt' || !familyId || !canSee) return undefined;
    let live = true;
    const year = new Date().getFullYear();
    import('../../src/project/storage.js').then(({ loadProjectState }) => (
      loadProjectState(familyId, { hours: { fromDate: `${year}-01-01` } })
    )).then((loaded) => {
      if (live) setYearEntries(loaded?.timeEntries || []);
    }).catch(() => {});
    return () => { live = false; };
  }, [current, familyId, canSee]);

  const refreshGrunnbelop = useMemo(() => async () => {
    setGState({ busy: true, error: '' });
    try {
      const row = await fetchGrunnbelop();
      update((current) => setGrunnbelop(current, row));
      setGState({ busy: false, error: '' });
    } catch {
      setGState({ busy: false, error: 'Kunne ikke hente grunnbeløpet fra NAV.' });
    }
  }, [update]);

  useEffect(() => {
    if (!ready || !canEdit || autoG.current) return undefined;
    if (!grunnbelopIsStale(settings?.variables)) return undefined;
    autoG.current = true;
    refreshGrunnbelop();
    return undefined;
  }, [ready, canEdit, settings?.variables?.grunnbelopFetchedAt, settings?.variables?.grunnbelopTo, refreshGrunnbelop]);

  const yearHoursById = useMemo(() => {
    const map = {};
    for (const row of employees) {
      if (row?.id) map[row.id] = yearCapacity(row, vacationPlan);
    }
    return map;
  }, [employees, vacationPlan]);

  const peoplePage = current === 'innleide' ? 'innleide' : 'ansatte';
  // Samme utvalg som timelisten: intern/ekstern, aktive/deaktiverte og samme søk.
  const roster = useMemo(() => {
    const byId = new Map((employees || []).map((row) => [row.id, row]));
    const list = calculateRoster({
      employees,
      salaries,
      settings,
      yearHoursById,
      audience: peoplePage,
      status: 'all',
    })
      .map((calc) => ({ calc, employee: byId.get(calc.employeeId) }))
      .filter((row) => row.employee && matchEmployeePickerQuery(row.employee, query))
      .sort((a, b) => displayName(a.employee).localeCompare(displayName(b.employee), 'nb'));
    return {
      active: list.filter((row) => earningsStatus(row.employee) === 'active'),
      inactive: list.filter((row) => earningsStatus(row.employee) === 'inactive'),
    };
  }, [employees, salaries, settings, query, yearHoursById, peoplePage]);
  const rows = status === 'inactive' ? roster.inactive : roster.active;

  const projectRows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('nb');
    return portfolioProjects({
      projects,
      contracts,
      entries: yearEntries || timeEntries,
      employees,
      salaries,
      settings,
      yearHoursById,
    }).filter((row) => !needle || `${row.name} ${row.customer}`.toLocaleLowerCase('nb').includes(needle));
  }, [projects, contracts, yearEntries, timeEntries, employees, salaries, settings, yearHoursById, query]);

  const selected = employees.find((row) => row.id === employeeId) || null;
  const totals = rows.reduce((acc, row) => ({
    cost: acc.cost + row.calc.totalCost,
    revenue: acc.revenue + row.calc.revenue,
    profit: acc.profit + row.calc.profit,
  }), { cost: 0, revenue: 0, profit: 0 });
  const showPeople = current === 'ansatte' || current === 'innleide';
  const hired = current === 'innleide';

  useEffect(() => {
    const percent = Number(settings?.variables?.defaultBillablePercent) || 0;
    setBillableText(String(Math.round(percent * 1000) / 10));
  }, [settings?.variables?.defaultBillablePercent]);

  function choose(next) {
    setPage(next);
    setMode('table');
    setEmployeeId('');
    setQuery('');
    setStatus('active');
  }

  function commitBillable() {
    const percent = Math.max(0, Math.min(100, parsePlain(billableText))) / 100;
    update(setVariable(settings, 'defaultBillablePercent', percent));
  }

  if (!canSee) {
    return (
      <View nativeID="economy-earnings" style={styles.screen}>
        <Text style={{ color: colors.muted }}>Du har ikke tilgang til inntjening.</Text>
      </View>
    );
  }

  const head = hired
    ? ['Person', 'Timer', 'Innkjøp', 'Sats', 'Grad', 'Kostnad', 'Honorar', 'Fortjeneste']
    : ['Ansatt', 'Prosent', 'Årslønn', 'Kostnad', 'Sats', 'Grad', 'Honorar', 'Fortjeneste'];

  return (
    <View nativeID="economy-earnings" style={[styles.screen, { backgroundColor: colors.bg }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        nativeID="earnings-subnav"
        style={[styles.nav, { borderBottomColor: colors.line, backgroundColor: colors.card }]}
        contentContainerStyle={styles.navInner}
      >
        {sections.map((item) => {
          const on = current === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              nativeID={`earnings-tab-${item.id}`}
              onPress={() => choose(item.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, on && { borderBottomColor: colors.brand }]}
            >
              <Text style={{ color: on ? colors.brand : colors.muted, fontWeight: '700' }}>{item.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
      >
        {showPeople ? (
          <View style={styles.toolbar}>
            {mode !== 'table' ? (
              <TouchableOpacity onPress={() => setMode('table')} accessibilityRole="button" nativeID="earnings-back">
                <Text style={{ color: colors.brand }}>{hired ? 'Alle eksterne' : 'Alle interne'}</Text>
              </TouchableOpacity>
            ) : <View />}
            <TouchableOpacity
              onPress={() => setMode(mode === 'variables' ? 'table' : 'variables')}
              accessibilityRole="button"
              nativeID="earnings-open-variables"
            >
              <Text style={{ color: colors.brand }}>{mode === 'variables' ? 'Lukk variabler' : 'Variabler'}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {!ready && showPeople ? <Text style={{ color: colors.muted }}>Henter satser…</Text> : null}

        {showPeople && mode !== 'person' ? (
          <View style={[styles.billable, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <View style={styles.grow}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Faktureringsgrad</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                Standard for {hired ? 'eksterne' : 'interne'}. Personen kan ha sin egen.
              </Text>
            </View>
            <TextInput
              nativeID="earnings-default-billable"
              value={billableText}
              onChangeText={setBillableText}
              onBlur={commitBillable}
              editable={canEdit}
              keyboardType="decimal-pad"
              accessibilityLabel="Standard faktureringsgrad"
              style={[styles.billableInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.starSoft }]}
            />
            <Text style={{ color: colors.muted }}>%</Text>
          </View>
        ) : null}

        {showPeople && mode === 'variables' ? (
          <EarningsSettings
            settings={settings}
            canEdit={canAdmin}
            onChange={update}
            colors={colors}
            audience={hired ? 'hired' : 'staff'}
            onRefreshGrunnbelop={refreshGrunnbelop}
            grunnbelopBusy={gState.busy}
            grunnbelopError={gState.error}
          />
        ) : null}

        {showPeople && mode === 'person' && selected ? (
          <EmployeeEarningsSheet
            employee={selected}
            salaries={salaries}
            settings={settings}
            onChange={update}
            canEdit={canEdit}
            colors={colors}
            capacity={yearHoursById[selected.id]}
          />
        ) : null}

        {showPeople && mode === 'table' ? (
          <View style={styles.gap}>
            <Text style={{ color: colors.muted, lineHeight: 18 }}>
              {hired
                ? 'Innleide og eksterne. Kostnaden er avtalt timehonorar ganger timer.'
                : 'Egne ansatte. Timer er disponible arbeidsdager minus ferie. Feriepenger, avgift og pensjon regnes ut fra lønnen.'}
            </Text>
            <TextInput
              nativeID="earnings-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Søk navn, e-post, rolle eller ansattnr"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.search, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
            />
            <ActivityTabs
              value={status}
              activeCount={roster.active.length}
              inactiveCount={roster.inactive.length}
              colors={colors}
              onChange={setStatus}
              idPrefix="earnings-status"
            />
            {!rows.length ? (
              <Text style={{ color: colors.muted }}>
                {query.trim()
                  ? `Ingen treff for «${query.trim()}».`
                  : `Ingen ${status === 'inactive' ? 'deaktiverte' : 'aktive'} ${hired ? 'eksterne' : 'interne'}.`}
              </Text>
            ) : null}
            <View nativeID="earnings-roster" style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
              {isPhone || !rows.length ? null : (
                <View style={[styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
                  {head.map((label) => (
                    <Text key={label} style={[styles.cell, styles.headText, { color: colors.muted }]}>{label}</Text>
                  ))}
                </View>
              )}
              {rows.map((row) => {
                const name = displayName(row.employee);
                const open = () => {
                  setEmployeeId(row.employee.id);
                  setMode('person');
                };
                if (isPhone) {
                  return (
                    <TouchableOpacity
                      key={row.employee.id}
                      nativeID={`earnings-open-${row.employee.id}`}
                      onPress={open}
                      accessibilityRole="button"
                      accessibilityLabel={name}
                      style={[styles.phone, { borderBottomColor: colors.line }]}
                    >
                      <Text style={{ color: colors.ink, fontWeight: '700' }}>{name}</Text>
                      <Text style={{ color: colors.muted }}>
                        {hired ? `innkjøp ${money(row.calc.purchaseRate)} · ` : `${money(row.calc.salary.amount)} · `}
                        kostnad {money(row.calc.totalCost)} · fortjeneste {money(row.calc.profit)}
                      </Text>
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={row.employee.id}
                    nativeID={`earnings-open-${row.employee.id}`}
                    onPress={open}
                    accessibilityRole="button"
                    accessibilityLabel={name}
                    style={[styles.head, { borderBottomColor: colors.line }]}
                  >
                    <Text style={[styles.cell, { color: colors.ink, fontWeight: '600' }]}>{name}</Text>
                    <Text style={[styles.cell, { color: colors.muted }]}>
                      {hired ? formatPlainHours(row.calc.hours) : `${Math.round(row.calc.position * 100)} %`}
                    </Text>
                    <Text style={[styles.cell, { color: !hired && row.calc.salary.missing ? (colors.danger || '#b42318') : colors.ink }]}>
                      {hired
                        ? money(row.calc.purchaseRate)
                        : (row.calc.salary.missing ? 'Mangler' : money(row.calc.salary.amount))}
                    </Text>
                    <Text style={[styles.cell, { color: colors.ink }]}>{hired ? money(row.calc.rate) : money(row.calc.totalCost)}</Text>
                    <Text style={[styles.cell, { color: colors.ink }]}>{hired ? pct(row.calc.billablePercent) : money(row.calc.rate)}</Text>
                    <Text style={[styles.cell, { color: colors.ink }]}>{hired ? money(row.calc.totalCost) : pct(row.calc.billablePercent)}</Text>
                    <Text style={[styles.cell, { color: colors.ink }]}>{hired ? money(row.calc.revenue) : money(row.calc.revenue)}</Text>
                    <Text style={[styles.cell, { color: row.calc.profit < 0 ? (colors.danger || '#b42318') : colors.ink }]}>
                      {money(row.calc.profit)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {rows.length && !isPhone ? (
                <View style={[styles.head, { backgroundColor: colors.sunken || colors.bg }]}>
                  <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>Sum</Text>
                  <Text style={styles.cell} />
                  <Text style={styles.cell} />
                  <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{hired ? '' : money(totals.cost)}</Text>
                  <Text style={styles.cell} />
                  <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{hired ? money(totals.cost) : ''}</Text>
                  <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{money(totals.revenue)}</Text>
                  <Text style={[styles.cell, { color: colors.ink, fontWeight: '700' }]}>{money(totals.profit)}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ) : null}

        {current === 'kunder' ? (
          <EconomyCustomers
            customers={customers}
            contracts={contracts}
            people={people}
            onOpenRegister={onOpenCustomerRegister}
            onOpenCustomer={onOpenCustomer}
          />
        ) : null}

        {current === 'avtaler' ? (
          <EconomyContracts
            customers={customers}
            contracts={contracts}
            people={people}
            onOpenRegister={onOpenContractRegister}
            onOpenContract={onOpenContract}
            onOpenIndex={onOpenIndex}
          />
        ) : null}

        {current === 'prosjekt' ? (
          <View style={styles.gap}>
            <Text style={{ color: colors.muted, lineHeight: 18 }}>
              Inntjening per prosjekt fra timene i år og avtalenes beløp.
            </Text>
            <TextInput
              nativeID="earnings-project-search"
              value={query}
              onChangeText={setQuery}
              placeholder="Søk på prosjekt eller kunde"
              placeholderTextColor={colors.placeholder}
              style={[styles.search, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
            />
            {!projectRows.length ? <Text style={{ color: colors.muted }}>Ingen prosjekter å vise.</Text> : null}
            <View nativeID="earnings-projects" style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
              {isPhone || !projectRows.length ? null : (
                <View style={[styles.head, { borderBottomColor: colors.line, backgroundColor: colors.sunken || colors.bg }]}>
                  {['Prosjekt', 'Kunde', 'Avtaler', 'Avtalebeløp', 'Timer', 'Honorar', 'Kostnad', 'Fortjeneste'].map((label) => (
                    <Text key={label} style={[styles.cell, styles.headText, { color: colors.muted }]}>{label}</Text>
                  ))}
                </View>
              )}
              {projectRows.map((row) => {
                const open = () => onOpenProject?.(row.id);
                const body = (
                  <>
                    <Text style={[styles.cell, { color: colors.ink, fontWeight: '600' }]}>{row.name}</Text>
                    <Text style={[styles.cell, { color: colors.muted }]}>{row.customer || '—'}</Text>
                    <Text style={[styles.cell, { color: colors.ink }]}>{row.agreements}</Text>
                    <Text style={[styles.cell, { color: colors.ink }]}>{row.contractValue ? money(row.contractValue) : '—'}</Text>
                    <Text style={[styles.cell, { color: colors.ink }]}>{formatPlainHours(row.hours)}</Text>
                    <Text style={[styles.cell, { color: colors.ink }]}>{money(row.revenue)}</Text>
                    <Text style={[styles.cell, { color: colors.ink }]}>{money(row.cost)}</Text>
                    <Text style={[styles.cell, { color: row.profit != null && row.profit < 0 ? (colors.danger || '#b42318') : colors.ink }]}>
                      {money(row.profit)}
                    </Text>
                  </>
                );
                if (isPhone) {
                  return (
                    <TouchableOpacity
                      key={row.id}
                      onPress={open}
                      accessibilityRole="button"
                      accessibilityLabel={row.name}
                      style={[styles.phone, { borderBottomColor: colors.line }]}
                    >
                      <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.name}</Text>
                      <Text style={{ color: colors.muted }}>
                        {row.customer || 'Uten kunde'} · honorar {money(row.revenue)} · fortjeneste {money(row.profit)}
                      </Text>
                    </TouchableOpacity>
                  );
                }
                return (
                  <TouchableOpacity
                    key={row.id}
                    onPress={open}
                    accessibilityRole="button"
                    accessibilityLabel={row.name}
                    style={[styles.head, { borderBottomColor: colors.line }]}
                  >
                    {body}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function formatPlainHours(value) {
  return new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 1 }).format(Number(value) || 0);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, gap: 12, width: '100%' },
  nav: { flexGrow: 0, borderBottomWidth: StyleSheet.hairlineWidth },
  navInner: { paddingHorizontal: 8, gap: 4 },
  tab: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  toolbar: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  billable: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 12 },
  billableInput: { width: 72, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, textAlign: 'right' },
  grow: { flexGrow: 1, flexShrink: 1 },
  gap: { gap: 10 },
  search: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8 },
  table: { borderWidth: 1, borderRadius: 12, overflow: 'hidden' },
  head: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, alignItems: 'center' },
  headText: { fontSize: 11, fontWeight: '700' },
  cell: { flex: 1, paddingHorizontal: 8, paddingVertical: 10, fontSize: 13 },
  phone: { paddingHorizontal: 12, paddingVertical: 12, gap: 4, borderBottomWidth: StyleSheet.hairlineWidth },
});
