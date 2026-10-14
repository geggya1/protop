import React, { useMemo, useState } from 'react';
import {
  Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Svg, { Circle, Rect } from 'react-native-svg';
import DateField from '../../components/DateField';
import { useApp } from '../../src/context/AppContext';
import { absencePickerTypes, absenceTypeById } from '../../src/arbeid/absenceCatalog.js';
import {
  ABSENCE_DAY_HOURS,
  absenceRoster,
  buildAbsenceDashboard,
  eachWeekday,
} from '../../src/arbeid/absenceDashboard.js';
import { employeeDisplayName, filterEmployeesForPicker } from '../../src/arbeid/roles.js';
import { employeeActivityTab } from '../../src/employees/model.js';
import { setAbsenceAdjustment } from '../../src/arbeid/timesheetState.js';
import { toDateKey } from '../../src/arbeid/calendar.js';
import { addAbsence } from '../../src/project/engine';
import { dateKey } from '../../src/utils/dates';
import { isOrganizationType } from '../../src/utils/groupTypes';
import { useLayout } from '../../src/theme';
import { useTimesheetWorkspace } from './useTimesheetWorkspace';
import { CompanyAbsenceView } from './CompanyAbsenceView';
import { CompanyAbsenceDesktop } from './CompanyAbsenceDesktop';
import { useModuleHeroHosted } from '../../components/ModulePageBg';

const HERO = require('../../assets/absence/hero-construction.png');
const BEACH = require('../../assets/absence/beach-illustration.png');

const ui = {
  page: '#F4F7FB',
  card: '#FFFFFF',
  ink: '#152033',
  muted: '#8B95A6',
  faint: '#A0A8B8',
  line: '#E6EBF2',
  sand: '#E4C48A',
  track: '#E8E2D6',
  blue: '#1E6FEA',
  blueSoft: '#E7F3FB',
  sunken: '#F3F5F8',
  peach: '#F7F1E6',
  danger: '#B42318',
};

const BARS = {
  ferie: '#3E6FE0',
  sykdom: '#F08B9A',
  annet: '#E8A84A',
};

const STATUS = {
  planlagt: { label: 'Planlagt', color: '#9A6700', bg: '#FFF4D6' },
  pagar: { label: 'Pågår', color: '#047857', bg: '#E5F6EE' },
  avsluttet: { label: 'Avsluttet', color: '#64748B', bg: '#F1F5F9' },
  registrert: { label: 'Registrert', color: '#1D4ED8', bg: '#E8F0FE' },
};

const STAT_ROWS = [
  { key: 'earned', label: 'Startsaldo og justeringer', icon: 'calendar-outline' },
  { key: 'used', label: 'Brukte dager totalt', icon: 'umbrella-outline' },
  { key: 'remaining', label: 'Dager til gode', icon: 'cash-outline' },
  { key: 'planned', label: 'Planlagte fraværsdager', icon: 'calendar-number-outline' },
  { key: 'unplanned', label: 'Dager som ikke er planlagt', icon: 'time-outline' },
];

function formatCount(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',');
}

function companyLabel(group) {
  return String(group?.company?.navn || group?.name || 'Selskap').trim();
}

function usePeople(lockedEmployeeId) {
  const year = new Date().getFullYear();
  const workspace = useTimesheetWorkspace({
    lockedEmployeeId,
    fromDate: `${year - 1}-01-01`,
    toDate: `${year + 1}-12-31`,
    absences: { all: true },
  });
  const [pickedId, setPickedId] = useState('');
  return { workspace, pickedId, setPickedId };
}

export function AbsenceOverviewScreen({ lockedEmployeeId = '', onBack = null, embedded = false } = {}) {
  const { isDesktop } = useLayout();
  const { workspace, pickedId, setPickedId } = usePeople(lockedEmployeeId);
  const { family, families, liveFamilies, selectFamily, familyId } = useApp();
  const [typeId, setTypeId] = useState('');
  const [category, setCategory] = useState('ferie');
  const [opening, setOpening] = useState('');
  const fullDay = Number(workspace.state.fullDayHours) > 0 ? Number(workspace.state.fullDayHours) : 7.5;
  const today = toDateKey(new Date());
  const locked = !!workspace.lockedId;
  const canChooseEmployee = !!workspace.manager && !locked;
  const people = useMemo(
    () => filterEmployeesForPicker(workspace.employees, '').filter((row) => row?.company?.status !== 'deleted'),
    [workspace.employees],
  );
  const employeeId = locked
    ? workspace.lockedId
    : (canChooseEmployee ? pickedId : (workspace.linked?.id || ''));
  const visiblePeople = (canChooseEmployee || locked)
    ? people
    : people.filter((row) => row.id && row.id === employeeId);

  const names = useMemo(() => {
    const map = {};
    const source = canChooseEmployee ? (workspace.employees || []) : visiblePeople;
    for (const row of source) {
      if (employeeActivityTab(row) === 'trash') continue;
      map[row.id] = employeeDisplayName(row);
    }
    return map;
  }, [canChooseEmployee, workspace.employees, visiblePeople]);
  const desktopPeople = useMemo(() => (
    (canChooseEmployee ? (workspace.employees || []) : visiblePeople)
      .filter((row) => employeeActivityTab(row) !== 'trash')
  ), [canChooseEmployee, workspace.employees, visiblePeople]);
  const phoneRoster = useMemo(
    () => (canChooseEmployee ? absenceRoster(desktopPeople) : visiblePeople),
    [canChooseEmployee, desktopPeople, visiblePeople],
  );
  const phoneEmployeeId = phoneRoster.some((row) => row.id === employeeId) ? employeeId : '';

  const companyMode = !locked;
  const dashboard = useMemo(() => buildAbsenceDashboard({
    employees: companyMode ? phoneRoster : visiblePeople,
    employeeId: companyMode ? phoneEmployeeId : employeeId,
    typeId: companyMode ? '' : typeId,
    category: companyMode ? (category || 'ferie') : '',
    absences: workspace.state.absences,
    adjustments: workspace.state.absenceAdjustments,
    fullDayHours: companyMode ? ABSENCE_DAY_HOURS : fullDay,
    today,
    names,
  }), [
    phoneRoster, visiblePeople, employeeId, phoneEmployeeId, typeId, category, companyMode,
    workspace.state.absences, workspace.state.absenceAdjustments,
    fullDay, today, names,
  ]);

  const orgs = (liveFamilies || families || []).filter((row) => isOrganizationType(row?.type));
  const companies = (orgs.length ? orgs : (family ? [family] : [])).map((row) => ({
    id: row.id,
    name: companyLabel(row),
  }));

  function saveOpening(typeOverride = '') {
    const target = employeeId;
    if (!target) {
      workspace.setError('Velg én ansatt for å sette startsaldo.');
      return;
    }
    const days = Number(String(opening).replace(',', '.'));
    const balanceType = typeof typeOverride === 'string' && typeOverride ? typeOverride : dashboard.balanceType;
    const result = setAbsenceAdjustment(workspace.state, {
      employeeId: target,
      typeId: balanceType,
      kind: 'opening',
      days,
      date: today,
      note: 'Startsaldo',
    });
    if (!result.ok) {
      workspace.setError(result.error);
      return;
    }
    workspace.setState(result.state);
    workspace.setError('');
    setOpening('');
  }

  function register({ personId, from, to, note }) {
    const days = eachWeekday(from, to);
    if (!personId) {
      workspace.setError('Velg ansatt.');
      return false;
    }
    if (!days.length) {
      workspace.setError('Velg minst én virkedag.');
      return false;
    }
    let state = workspace.state;
    const name = names[personId] || '';
    for (const date of days) {
      const result = addAbsence(state, {
        employeeId: personId,
        employeeName: name,
        date,
        hours: fullDay,
        type: typeId || 'ferie',
        description: note,
        createdByUid: workspace.uid,
      });
      if (!result.ok) {
        workspace.setError(result.error);
        return false;
      }
      state = result.state;
    }
    workspace.setState(state);
    workspace.setError('');
    return true;
  }

  if (companyMode && isDesktop) {
    return (
      <CompanyAbsenceDesktop
        employees={desktopPeople}
        names={names}
        employeeId={employeeId}
        canChooseEmployee={canChooseEmployee}
        onSelectEmployee={setPickedId}
        typeId={typeId || 'ferie'}
        onSelectType={setTypeId}
        absences={workspace.state.absences || []}
        adjustments={workspace.state.absenceAdjustments || []}
        fullDayHours={ABSENCE_DAY_HOURS}
        today={today}
        error={workspace.error}
        opening={opening}
        onOpeningChange={setOpening}
        onSaveOpening={saveOpening}
      />
    );
  }

  if (companyMode) {
    return (
      <CompanyAbsenceView
        employees={phoneRoster.map((row) => ({ id: row.id, name: employeeDisplayName(row) }))}
        employeeId={phoneEmployeeId}
        canChooseEmployee={canChooseEmployee}
        onSelectEmployee={setPickedId}
        category={category || 'ferie'}
        onSelectCategory={setCategory}
        dashboard={dashboard}
        error={workspace.error}
      />
    );
  }

  return (
    <AbsenceOverviewView
      embedded={embedded}
      companyName={companyLabel(family)}
      companies={companies}
      companyId={familyId}
      onSelectCompany={(id) => selectFamily?.(id)}
      employees={visiblePeople.map((row) => ({ id: row.id, name: employeeDisplayName(row) }))}
      employeeId={employeeId}
      canChooseEmployee={canChooseEmployee}
      onSelectEmployee={setPickedId}
      typeId={typeId}
      onSelectType={setTypeId}
      dashboard={dashboard}
      error={workspace.error}
      opening={opening}
      onOpeningChange={setOpening}
      onSaveOpening={saveOpening}
      canEditOpening={!!employeeId}
      onRegister={register}
      onBack={onBack}
    />
  );
}

export function AbsenceOverviewView({
  embedded = false,
  companyName = '',
  companies = [],
  companyId = '',
  onSelectCompany,
  employees = [],
  employeeId = '',
  canChooseEmployee = false,
  onSelectEmployee,
  typeId = '',
  onSelectType,
  dashboard,
  error = '',
  opening = '',
  onOpeningChange,
  onSaveOpening,
  canEditOpening = false,
  onRegister,
  onBack = null,
}) {
  const { width } = useLayout();
  const hostedHero = useModuleHeroHosted();
  const wide = width >= 1180;
  const [menu, setMenu] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [editingOpening, setEditingOpening] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [chartWidth, setChartWidth] = useState(280);
  const types = absencePickerTypes();
  const employeeName = employees.find((row) => row.id === employeeId)?.name || '';
  const typeName = typeId ? absenceTypeById(typeId).label : '';
  const visiblePeriods = showAll ? dashboard.periods : dashboard.periods.slice(0, 5);
  const spotlight = dashboard.periods.find((row) => (
    row.type === dashboard.balanceType && (row.status === 'pagar' || row.status === 'planlagt')
  )) || dashboard.periods.find((row) => row.type === dashboard.balanceType);
  const registerLabel = dashboard.balanceType === 'ferie' ? '+ Registrer ferie' : `+ Registrer ${dashboard.balanceTitle.toLowerCase()}`;

  const body = (
    <View style={[styles.frame, wide && styles.frameWide]}>
      <View style={styles.companyRow}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="Tilbake til ansatt" style={styles.backBtn}>
            <Ionicons name="chevron-back" size={18} color={ui.ink} />
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={styles.companyBtn}
          onPress={() => setMenu(menu === 'company' ? '' : 'company')}
          accessibilityRole="button"
          accessibilityLabel="Velg selskap"
        >
          <Text style={styles.companyName} numberOfLines={1}>{companyName.toUpperCase()}</Text>
          <Ionicons name="chevron-down" size={14} color={ui.ink} />
        </TouchableOpacity>
      </View>
      {menu === 'company' ? (
        <ChoiceList
          options={companies.map((row) => ({ id: row.id, label: row.name }))}
          selected={companyId}
          onPick={(id) => { setMenu(''); onSelectCompany?.(id); }}
        />
      ) : null}

      {hostedHero ? null : (
      <View style={[styles.heroBlock, wide && styles.heroBlockWide]}>
        <View style={[styles.heroCopy, wide && styles.heroCopyWide]}>
          <Text accessibilityRole="header" style={styles.title}>Fraværsoversikt</Text>
          <Text style={styles.lead}>Få full oversikt over ferie og annet fravær for dine ansatte.</Text>
        </View>
        <View style={[styles.hero, wide && styles.heroWide]} pointerEvents="none">
          <Image source={HERO} resizeMode="cover" style={styles.heroImage} />
          <View style={styles.heroFade} />
        </View>
      </View>
      )}

      <View style={styles.filterCard}>
        <FilterField
          icon="person-outline"
          label="Ansatt"
          value={employeeId ? employeeName : 'Alle ansatte'}
          onPress={canChooseEmployee ? () => setMenu(menu === 'employee' ? '' : 'employee') : undefined}
          disabled={!canChooseEmployee}
        />
        <View style={styles.filterSplit} />
        <FilterField
          icon="pricetag-outline"
          label="Fraværstype"
          value={typeId ? typeName : 'Alle fraværstyper'}
          onPress={() => setMenu(menu === 'type' ? '' : 'type')}
        />
      </View>
      {menu === 'employee' ? (
        <ChoiceList
          options={[{ id: '', label: 'Alle ansatte' }, ...employees.map((row) => ({ id: row.id, label: row.name }))]}
          selected={employeeId}
          onPick={(id) => { setMenu(''); onSelectEmployee?.(id); }}
        />
      ) : null}
      {menu === 'type' ? (
        <ChoiceList
          options={[{ id: '', label: 'Alle fraværstyper' }, ...types.map((row) => ({ id: row.id, label: row.label }))]}
          selected={typeId}
          onPick={(id) => { setMenu(''); onSelectType?.(id); }}
        />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {wide ? (
        <View style={styles.kpis}>
          <Kpi icon="people" tint="#3E6FE0" bg="#EEF2FF" value={dashboard.headcount} label="Ansatte" />
          <Kpi icon="sunny" tint="#1F9D55" bg="#E7F8EF" value={dashboard.onVacation} label="På ferie nå" />
          <Kpi icon="heart" tint="#E15B73" bg="#FDECEF" value={dashboard.sickNow} label="Sykemeldte nå" />
          <Kpi icon="time" tint="#E09A3E" bg="#FFF4E5" value={dashboard.otherNow} label="Annet fravær nå" />
        </View>
      ) : null}

      <View style={[styles.columns, wide && styles.columnsWide]}>
        <View style={[styles.card, styles.ferieCard, wide && styles.columnMain]}>
          <View style={styles.ferieHead}>
            <View style={styles.palm}>
              <MaterialCommunityIcons name="palm-tree" size={18} color="#C4A36A" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ferieTitle}>{dashboard.balanceTitle}</Text>
              <Text style={styles.ferieLead}>
                {dashboard.balanceType === 'ferie' ? 'Saldo og bruk av feriedager' : 'Saldo og bruk'}
              </Text>
            </View>
          </View>
          <View style={styles.ferieBody}>
            <Donut used={dashboard.summary.used} total={dashboard.allowance} size={wide ? 156 : 146} />
            <View style={styles.stats}>
              {STAT_ROWS.map((row) => (
                <View key={row.key} style={styles.statRow}>
                  <Ionicons name={row.icon} size={16} color="#7E8BA0" />
                  <Text style={styles.statLabel} numberOfLines={2}>{row.label}</Text>
                  {row.key === 'earned' && canEditOpening ? (
                    <TouchableOpacity
                      onPress={() => setEditingOpening(true)}
                      accessibilityRole="button"
                      accessibilityLabel="Endre startsaldo"
                      style={styles.statValue}
                    >
                      <Text style={styles.statValueText}>{formatCount(dashboard.summary.earned)}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.statValue}>
                      <Text style={styles.statValueText}>{formatCount(dashboard.summary[row.key])}</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
          {editingOpening ? (
            <View style={styles.openingRow}>
              <TextInput
                value={opening}
                onChangeText={onOpeningChange}
                placeholder={formatCount(dashboard.summary.opening || 0)}
                placeholderTextColor={ui.faint}
                keyboardType="decimal-pad"
                style={styles.openingInput}
                accessibilityLabel="Startsaldo feriedager"
                nativeID="ferie-startsaldo"
              />
              <TouchableOpacity onPress={() => { onSaveOpening?.(); setEditingOpening(false); }} style={styles.openingSave} nativeID="ferie-startsaldo-save">
                <Text style={styles.openingSaveText}>Lagre startsaldo</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <View style={styles.track}>
            <View style={[styles.trackFill, { width: `${dashboard.allowance > 0 ? Math.min(100, (dashboard.summary.used / dashboard.allowance) * 100) : 0}%` }]} />
          </View>
          <View style={styles.trackLabels}>
            <Text style={styles.trackLabel}>{formatCount(dashboard.summary.used)} dager brukt</Text>
            <Text style={styles.trackLabel}>{formatCount(dashboard.allowance)} dager tilgjengelig</Text>
          </View>
        </View>

        <View style={[styles.beachCard, wide && styles.columnSide]}>
          <Image source={BEACH} resizeMode="contain" style={[styles.beachImage, wide && styles.beachImageWide]} />
          <View style={styles.beachCopy}>
            <Text style={styles.beachTitle}>
              {spotlight
                ? `${dashboard.balanceTitle} ${spotlight.rangeLabel === 'Heldag' ? spotlight.dateLabel : spotlight.rangeLabel}`
                : (dashboard.balanceType === 'ferie' ? 'Ingen registrert ferie ennå' : `Ingen registrert ${dashboard.balanceTitle.toLowerCase()} ennå`)}
            </Text>
            <Text style={styles.beachBody}>
              {spotlight
                ? `${formatCount(spotlight.days)} dager · ${STATUS[spotlight.status]?.label || 'Registrert'}`
                : (dashboard.balanceType === 'ferie'
                  ? 'Det er ikke registrert ferie for valgt periode og filter. Når ferie registreres vil den vises her.'
                  : 'Det er ikke registrert fravær for valgt periode og filter. Når det registreres vil det vises her.')}
            </Text>
            <TouchableOpacity
              onPress={() => setRegisterOpen(true)}
              accessibilityRole="button"
              style={styles.cta}
              nativeID="registrer-ferie"
            >
              <Text style={styles.ctaText}>{registerLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {(wide || dashboard.chartHasData) ? (
        <View style={styles.card}>
          <View style={[styles.chartLayout, wide && styles.chartLayoutWide]}>
            <View style={{ flex: 1 }} onLayout={(event) => setChartWidth(Math.max(160, event.nativeEvent.layout.width))}>
              <MonthChart months={dashboard.months} width={Math.max(120, chartWidth - 22)} />
            </View>
            <View style={styles.legend}>
              <Legend swatch={BARS.ferie} label="Ferie" />
              <Legend swatch={BARS.sykdom} label="Sykdom" />
              <Legend swatch={BARS.annet} label="Annet" />
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>Siste fravær</Text>
        <TouchableOpacity onPress={() => setShowAll((value) => !value)} accessibilityRole="button" nativeID="fravaer-se-alle">
          <Text style={styles.seeAll}>{showAll ? 'Vis færre' : 'Se alle'}  ›</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.card}>
        <View style={styles.tableHead}>
          {['Dato', 'Ansatt', 'Type', 'Tidsrom', 'Status'].map((label) => (
            <Text key={label} style={styles.th}>{label}</Text>
          ))}
        </View>
        {visiblePeriods.length ? visiblePeriods.map((row) => {
          const tone = STATUS[row.status] || STATUS.registrert;
          return (
            <View key={row.id} style={styles.tr}>
              <Text style={styles.td} numberOfLines={1}>{row.dateLabel}</Text>
              <Text style={styles.td} numberOfLines={1}>{row.employeeName}</Text>
              <Text style={styles.td} numberOfLines={1}>{row.typeLabel}</Text>
              <Text style={styles.td} numberOfLines={1}>{row.rangeLabel}</Text>
              <View style={styles.td}>
                <Text style={[styles.status, { color: tone.color, backgroundColor: tone.bg }]}>{tone.label}</Text>
              </View>
            </View>
          );
        }) : (
          <View style={styles.emptyTable}>
            <View style={styles.emptyIcon}>
              <Ionicons name="document-text-outline" size={22} color="#9AA6B8" />
              <Ionicons name="search" size={12} color="#9AA6B8" style={styles.emptySearch} />
            </View>
            <Text style={styles.emptyTitle}>Ingen registreringer</Text>
            <Text style={styles.emptyBody}>Det er ingen fravær som matcher valgt filter.</Text>
          </View>
        )}
      </View>
    </View>
  );

  const modal = (
    <RegisterModal
      visible={registerOpen}
      title={dashboard.balanceType === 'ferie' ? 'Registrer ferie' : `Registrer ${dashboard.balanceTitle.toLowerCase()}`}
      employees={employees}
      employeeId={employeeId}
      requireEmployee={!employeeId}
      onClose={() => setRegisterOpen(false)}
      onSave={(payload) => {
        const ok = onRegister?.(payload);
        if (ok) setRegisterOpen(false);
      }}
    />
  );

  if (embedded) {
    return (
      <View nativeID="fravaer-oversikt" style={styles.page}>
        {body}
        {modal}
      </View>
    );
  }
  return (
    <ScrollView
      nativeID="fravaer-oversikt"
      style={styles.page}
      contentContainerStyle={styles.pageInner}
      keyboardShouldPersistTaps="handled"
    >
      {body}
      {modal}
    </ScrollView>
  );
}

function Donut({ used, total, size = 146 }) {
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(1, Math.max(0, used / total)) : 0;
  const dash = c * ratio;
  const center = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={radius} stroke={ui.track} strokeWidth={stroke} fill="none" />
        {dash > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={ui.sand}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>
      <View style={styles.donutCenter}>
        <Text style={styles.donutValue}>{formatCount(used)}</Text>
        <Text style={styles.donutOf}>av {formatCount(total)}</Text>
        <Text style={styles.donutCaption}>dager brukt</Text>
      </View>
    </View>
  );
}

function MonthChart({ months, width }) {
  const plotH = 96;
  const gap = months.length > 8 ? 5 : 8;
  const barW = Math.max(7, (width - gap * Math.max(0, months.length - 1)) / Math.max(1, months.length));
  const max = Math.max(1, ...months.map((month) => month.ferie + month.sykdom + month.annet));
  const mid = max > 1 ? Math.round((max / 2) * 10) / 10 : null;
  const ticks = [max, mid, 0].filter((tick, index, list) => tick != null && list.indexOf(tick) === index);
  return (
    <View>
      <View style={styles.chartPlot}>
        <View style={styles.yAxis}>
          {ticks.map((tick, index) => (
            <Text key={`${index}-${tick}`} style={styles.yTick}>{formatCount(tick)}</Text>
          ))}
        </View>
        <Svg width={width} height={plotH}>
          {months.map((month, index) => {
            const x = index * (barW + gap);
            const parts = [
              ['ferie', month.ferie],
              ['sykdom', month.sykdom],
              ['annet', month.annet],
            ].filter((part) => part[1] > 0);
            let y = plotH;
            return parts.map(([key, value], partIndex) => {
              const h = Math.max(2, (value / max) * (plotH - 2));
              y -= h;
              const top = partIndex === parts.length - 1;
              return (
                <Rect
                  key={`${month.label}-${key}`}
                  x={x}
                  y={y}
                  width={barW}
                  height={h + (top ? 0 : 0.6)}
                  rx={top ? 3 : 0}
                  fill={BARS[key]}
                />
              );
            });
          })}
        </Svg>
      </View>
      <View style={[styles.monthLabels, { marginLeft: 22 }]}>
        {months.map((month) => (
          <Text key={month.label} style={[styles.monthLabel, { width: barW + gap }]}>{month.label}</Text>
        ))}
      </View>
    </View>
  );
}

function Legend({ swatch, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: swatch }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function Kpi({ icon, tint, bg, value, label }) {
  return (
    <View style={styles.kpi}>
      <View style={[styles.kpiIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View>
        <Text style={styles.kpiValue}>{formatCount(value)}</Text>
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>
    </View>
  );
}

function FilterField({ icon, label, value, onPress, disabled = false }) {
  return (
    <TouchableOpacity
      style={styles.filterField}
      onPress={onPress}
      disabled={disabled || !onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <View style={styles.filterIcon}>
        <Ionicons name={icon} size={16} color="#8B95A6" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.filterLabel}>{label}</Text>
        <View style={styles.filterValueRow}>
          <Text style={styles.filterValue} numberOfLines={1}>{value}</Text>
          {disabled ? null : <Ionicons name="chevron-down" size={14} color={ui.ink} />}
        </View>
      </View>
    </TouchableOpacity>
  );
}

function ChoiceList({ options, selected, onPick }) {
  return (
    <ScrollView style={styles.choices} nestedScrollEnabled keyboardShouldPersistTaps="handled">
      {options.map((option) => (
        <TouchableOpacity key={option.id || 'all'} onPress={() => onPick(option.id)} style={styles.choice}>
          <Text style={[styles.choiceText, option.id === selected && styles.choiceOn]}>{option.label}</Text>
          {option.id === selected ? <Ionicons name="checkmark" size={16} color={ui.blue} /> : null}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

function RegisterModal({ visible, title, employees, employeeId, requireEmployee, onClose, onSave }) {
  const today = toDateKey(new Date());
  const [personId, setPersonId] = useState(employeeId || '');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState('');
  React.useEffect(() => {
    if (!visible) return;
    setPersonId(employeeId || '');
    setLocalError('');
  }, [visible, employeeId]);

  function save() {
    const id = requireEmployee ? personId : (employeeId || personId);
    if (!id) {
      setLocalError('Velg ansatt.');
      return;
    }
    if (!from || !to) {
      setLocalError('Velg fra- og til-dato.');
      return;
    }
    setLocalError('');
    onSave?.({ personId: id, from, to, note: note.trim() });
  }

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBg} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Text style={styles.sheetLead}>Virkedager i perioden registreres som hele dager.</Text>
          {requireEmployee ? (
            <View style={styles.sheetField}>
              <Text style={styles.sheetLabel}>Ansatt</Text>
              <ScrollView style={{ maxHeight: 140 }}>
                {employees.map((row) => (
                  <TouchableOpacity key={row.id} onPress={() => setPersonId(row.id)} style={styles.choice}>
                    <Text style={[styles.choiceText, row.id === personId && styles.choiceOn]}>{row.name}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          ) : null}
          <View style={styles.sheetField}>
            <Text style={styles.sheetLabel}>Fra</Text>
            <DateField value={from} onChange={(value) => setFrom(value ? dateKey(value) : '')} placeholder="Velg dato" />
          </View>
          <View style={styles.sheetField}>
            <Text style={styles.sheetLabel}>Til</Text>
            <DateField value={to} onChange={(value) => setTo(value ? dateKey(value) : '')} placeholder="Velg dato" min={from} />
          </View>
          <View style={styles.sheetField}>
            <Text style={styles.sheetLabel}>Merknad</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Valgfritt"
              placeholderTextColor={ui.faint}
              style={styles.openingInput}
            />
          </View>
          {localError ? <Text style={styles.error}>{localError}</Text> : null}
          <View style={styles.sheetActions}>
            <TouchableOpacity onPress={onClose} style={styles.sheetGhost}>
              <Text style={styles.sheetGhostText}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={save} style={styles.cta}>
              <Text style={styles.ctaText}>Lagre</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const cardShadow = Platform.select({
  web: { boxShadow: '0 10px 30px rgba(20, 36, 64, 0.06)' },
  default: {
    shadowColor: '#142840',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 16,
    elevation: 2,
  },
});

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: ui.page },
  pageInner: { paddingBottom: 28 },
  frame: { paddingHorizontal: 16, paddingTop: 6, gap: 12, width: '100%', maxWidth: 1120, alignSelf: 'center' },
  frameWide: { paddingHorizontal: 8, paddingTop: 4 },
  companyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  companyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '86%' },
  companyName: { color: ui.ink, fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  heroBlock: { minHeight: 132, justifyContent: 'center', position: 'relative', paddingRight: 108, overflow: 'hidden' },
  heroBlockWide: { minHeight: 150, paddingRight: 280 },
  heroCopy: { zIndex: 1, maxWidth: 250, gap: 6 },
  heroCopyWide: { maxWidth: 520 },
  title: { color: ui.ink, fontSize: 32, lineHeight: 36, fontWeight: '800', letterSpacing: -0.8 },
  lead: { color: ui.muted, fontSize: 14, lineHeight: 20 },
  hero: {
    position: 'absolute',
    right: -16,
    top: -6,
    width: 220,
    height: 140,
    overflow: 'hidden',
  },
  heroWide: { width: 380, height: 176, top: -20, right: -8 },
  heroImage: { width: '100%', height: '100%' },
  heroFade: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: '78%',
    backgroundImage: 'linear-gradient(90deg, #F4F7FB 0%, #F4F7FB 12%, rgba(244,247,251,0.55) 48%, rgba(244,247,251,0) 100%)',
  },
  filterCard: {
    ...cardShadow,
    backgroundColor: ui.card,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  filterField: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6, minWidth: 0 },
  filterIcon: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: ui.sunken, alignItems: 'center', justifyContent: 'center',
  },
  filterLabel: { color: ui.muted, fontSize: 11 },
  filterValueRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  filterValue: { color: ui.ink, fontSize: 12.5, fontWeight: '700', flexShrink: 1 },
  filterSplit: { width: 1, alignSelf: 'stretch', backgroundColor: ui.line, marginVertical: 4 },
  choices: {
    ...cardShadow,
    backgroundColor: ui.card,
    borderRadius: 16,
    paddingVertical: 6,
    maxHeight: 280,
  },
  choice: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  choiceText: { color: ui.ink, fontSize: 14, flex: 1 },
  choiceOn: { color: ui.blue, fontWeight: '700' },
  error: { color: ui.danger, fontSize: 13 },
  kpis: { flexDirection: 'row', gap: 10 },
  kpi: {
    ...cardShadow,
    flex: 1,
    backgroundColor: ui.card,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  kpiIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { color: ui.ink, fontSize: 20, fontWeight: '800' },
  kpiLabel: { color: ui.muted, fontSize: 12 },
  columns: { gap: 12 },
  columnsWide: { flexDirection: 'row', alignItems: 'stretch' },
  columnMain: { flex: 1.35 },
  columnSide: { flex: 0.85 },
  card: { ...cardShadow, backgroundColor: ui.card, borderRadius: 22, padding: 16 },
  ferieCard: { gap: 14 },
  ferieHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  palm: { width: 36, height: 36, borderRadius: 18, backgroundColor: ui.peach, alignItems: 'center', justifyContent: 'center' },
  ferieTitle: { color: ui.ink, fontSize: 20, fontWeight: '800' },
  ferieLead: { color: ui.muted, fontSize: 13, marginTop: 1 },
  ferieBody: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stats: { flex: 1, gap: 8, minWidth: 0 },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statLabel: { flex: 1, color: '#6D7A8E', fontSize: 12, lineHeight: 16 },
  statValue: {
    minWidth: 42, height: 32, paddingHorizontal: 8, borderRadius: 10, backgroundColor: ui.sunken,
    alignItems: 'center', justifyContent: 'center',
  },
  statValueText: { color: ui.ink, fontWeight: '800', fontSize: 14 },
  donutCenter: { position: 'absolute', left: 18, right: 18, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  donutValue: { color: ui.ink, fontSize: 26, fontWeight: '800', lineHeight: 28 },
  donutOf: { color: ui.ink, fontSize: 12, fontWeight: '700', lineHeight: 14 },
  donutCaption: { color: ui.muted, fontSize: 10, lineHeight: 12, marginTop: 1 },
  openingRow: { gap: 8 },
  openingInput: {
    borderWidth: 1, borderColor: ui.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
    color: ui.ink, backgroundColor: ui.card, fontSize: 15,
  },
  openingSave: { backgroundColor: ui.blue, borderRadius: 999, paddingVertical: 10, alignItems: 'center' },
  openingSaveText: { color: '#fff', fontWeight: '700' },
  track: { height: 8, borderRadius: 99, backgroundColor: ui.track, overflow: 'hidden' },
  trackFill: { height: 8, borderRadius: 99, backgroundColor: ui.sand },
  trackLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  trackLabel: { color: ui.muted, fontSize: 12 },
  beachCard: {
    backgroundColor: ui.blueSoft,
    borderRadius: 22,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 168,
  },
  beachImage: { width: 148, height: 156 },
  beachImageWide: { width: 240, height: 210 },
  beachCopy: { flex: 1, paddingVertical: 16, paddingRight: 16, paddingLeft: 12, gap: 8 },
  beachTitle: { color: ui.ink, fontSize: 16, fontWeight: '800', lineHeight: 21 },
  beachBody: { color: '#66758A', fontSize: 13, lineHeight: 18 },
  cta: {
    alignSelf: 'flex-start', backgroundColor: ui.blue, borderRadius: 999,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 2,
  },
  ctaText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  chartLayout: { gap: 8 },
  chartLayoutWide: { flexDirection: 'row', alignItems: 'center' },
  chartPlot: { flexDirection: 'row', alignItems: 'flex-end' },
  yAxis: { width: 22, height: 96, justifyContent: 'space-between' },
  yTick: { color: ui.faint, fontSize: 10 },
  monthLabels: { flexDirection: 'row', marginTop: 4 },
  monthLabel: { color: ui.muted, fontSize: 11 },
  legend: { gap: 8, paddingTop: 4 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendSwatch: { width: 10, height: 10, borderRadius: 5 },
  legendText: { color: ui.ink, fontSize: 13 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  sectionTitle: { color: ui.ink, fontSize: 22, fontWeight: '800' },
  seeAll: { color: ui.muted, fontSize: 14, fontWeight: '600' },
  tableHead: { flexDirection: 'row', paddingBottom: 8, gap: 4 },
  th: { flex: 1, color: ui.faint, fontSize: 12, fontWeight: '600' },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, borderTopWidth: 1, borderTopColor: ui.line },
  td: { flex: 1, color: ui.ink, fontSize: 12 },
  status: { alignSelf: 'flex-start', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, fontSize: 10, fontWeight: '700' },
  emptyTable: { alignItems: 'center', paddingVertical: 22, gap: 4 },
  emptyIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  emptySearch: { position: 'absolute', right: 0, bottom: 2 },
  emptyTitle: { color: ui.ink, fontWeight: '800', fontSize: 15 },
  emptyBody: { color: ui.muted, fontSize: 13, textAlign: 'center' },
  modalBg: { flex: 1, backgroundColor: 'rgba(16, 24, 40, 0.35)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: ui.card, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, gap: 10,
    ...(Platform.OS === 'web' ? { maxWidth: 520, width: '100%', alignSelf: 'center', borderRadius: 24, marginBottom: 24 } : null),
  },
  sheetTitle: { color: ui.ink, fontSize: 20, fontWeight: '800' },
  sheetLead: { color: ui.muted, fontSize: 13 },
  sheetField: { gap: 6 },
  sheetLabel: { color: ui.muted, fontSize: 12, fontWeight: '700' },
  sheetActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 6 },
  sheetGhost: { paddingHorizontal: 14, paddingVertical: 10 },
  sheetGhostText: { color: ui.ink, fontWeight: '700' },
});
