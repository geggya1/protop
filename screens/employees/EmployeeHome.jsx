/**
 * Hovedsiden for én ansatt (Min side, Ansatte og HR med valgt person).
 *
 * Venstre: personkortet (blyanten åpner persondata) og snarveier.
 * Midten: nøkkeltall, produktivitet og prosjektene som er brukt sist.
 * Høyre: gjøremål, fravær i år og arbeidstiden denne uken.
 *
 * Produktivitet er fakturerbare timer mot mulig tid: stillingsprosent × arbeidsdager
 * uten røde dager. Interntid og fravær er ikke fakturerbart (src/employees/homeStats.js).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import StorageImage from '../../components/StorageImage';
import { loadAbsences, mergeAbsenceLists } from '../../src/arbeid/absenceStorage';
import { resolveAbsenceTypes } from '../../src/arbeid/absenceCatalog';
import { timeSettingsOf } from '../../src/arbeid/schedule';
import { loadTimeEntries } from '../../src/economy/timeEntryStorage';
import { employmentState } from '../../src/employees/employmentState';
import {
  PERIOD_MODES, absenceYear, dailyLedger, formatHoursShort, homeLoadWindow, productivitySeries, recentProjects, weekWork,
} from '../../src/employees/homeStats';
import { displayName, initials } from '../../src/employees/model';
import { ownCompanyMatcher } from '../../src/hr/billable';
import { aliasSourceIds } from '../../src/project/companyAlias';
import { elevation, radius, space, type } from '../../src/ui/tokens';
import EmployeeTodo from './EmployeeTodo';

const lift = Platform.OS === 'web' ? elevation[1].web : elevation[1].native;

/** Farge med gjennomsiktighet, for myke flater. Bare #rrggbb, ellers fargen som den er. */
function tint(color, alpha) {
  const raw = String(color || '');
  if (!/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  return `${raw}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

function shortDate(iso) {
  const [, m, d] = String(iso || '').split('-');
  return d && m ? `${Number(d)}.${Number(m)}.` : '';
}

function monthsAgoKey(months, today) {
  const d = new Date(today.getFullYear(), today.getMonth() - months, today.getDate());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function loadEmployeeAbsences(companyId, range) {
  const lists = await Promise.all([companyId, ...aliasSourceIds(companyId)].map(
    (id) => loadAbsences(id, range).catch(() => []),
  ));
  return mergeAbsenceLists(...lists);
}

/** Timer og fravær for personen i vinduet hovedsiden trenger (13 måneder). */
function useEmployeeHours({ companyId, employeeId, enabled }) {
  const [state, setState] = useState({ key: '', entries: [], absences: [] });
  const key = enabled && companyId && employeeId ? `${companyId}:${employeeId}` : '';
  useEffect(() => {
    if (!key) return undefined;
    let live = true;
    const { fromDate, toDate } = homeLoadWindow(new Date());
    const range = { fromDate, toDate, employeeId };
    Promise.all([
      loadTimeEntries(companyId, { ...range, cache: false }).catch(() => []),
      loadEmployeeAbsences(companyId, range).catch(() => []),
    ]).then(([entries, absences]) => {
      if (!live) return;
      setState({
        key,
        entries: Array.isArray(entries) ? entries : [],
        absences: Array.isArray(absences) ? absences : [],
      });
    });
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return {
    loading: !!key && state.key !== key,
    entries: state.key === key ? state.entries : [],
    absences: state.key === key ? state.absences : [],
  };
}

function Card({ colors, children, style, nativeID }) {
  return (
    <View nativeID={nativeID} style={[styles.card, lift, { backgroundColor: colors.card, borderColor: colors.line }, style]}>
      {children}
    </View>
  );
}

function CardHead({ icon, title, colors, badge, link, onLink, right, nativeID }) {
  return (
    <View style={styles.cardHead}>
      <View style={styles.cardHeadLeft}>
        {icon ? <Ionicons name={icon} size={20} color={colors.brand} /> : null}
        <Text style={[styles.cardTitle, { color: colors.ink }]} numberOfLines={1}>{title}</Text>
        {badge ? (
          <View style={[styles.countBadge, { backgroundColor: colors.brand }]}>
            <Text style={[styles.countBadgeText, { color: colors.onBrand }]}>{badge}</Text>
          </View>
        ) : null}
      </View>
      {right}
      {link && onLink ? (
        <Pressable onPress={onLink} accessibilityRole="link" nativeID={nativeID} style={styles.linkRow} hitSlop={6}>
          <Text style={[styles.link, { color: colors.brand }]}>{link}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.brand} />
        </Pressable>
      ) : null}
    </View>
  );
}

const STATUS = {
  active: { label: 'Aktiv', tone: 'success' },
  leave: { label: 'Permisjon', tone: 'warn' },
  inactive: { label: 'Deaktivert', tone: 'danger' },
  ended: { label: 'Sluttet', tone: 'danger' },
  deleted: { label: 'I papirkurven', tone: 'danger' },
};

function ProfileCard({ employee, colors, onEdit }) {
  const name = displayName(employee);
  const role = [employee.company?.title, employee.company?.projectRole]
    .map((part) => String(part || '').trim()).filter(Boolean).join(' | ');
  const status = STATUS[employmentState(employee)] || STATUS.active;
  const toneInk = status.tone === 'success' ? colors.successInk : status.tone === 'warn' ? colors.warnInk : colors.dangerInk;
  const toneDot = status.tone === 'success' ? colors.success : status.tone === 'warn' ? colors.warn : colors.danger;
  const toneBg = status.tone === 'success' ? colors.successSoft : status.tone === 'warn' ? colors.starSoft : colors.dangerSoft;
  const phone = String(employee.person?.phone || '').trim();
  const email = String(employee.company?.email || employee.person?.email || '').trim();
  return (
    <Card colors={colors} nativeID="employee-home-profile">
      <View style={styles.profileTop}>
        {employee.person?.photoUrl ? (
          <StorageImage uri={employee.person.photoUrl} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.photoFallback, { backgroundColor: colors.brandSoft }]}>
            <Text style={[type.h1, { color: colors.brand }]}>{initials(employee)}</Text>
          </View>
        )}
        <View style={styles.profileFacts}>
          <Text style={[type.title, { color: colors.ink }]} numberOfLines={2}>{name}</Text>
          {role ? <Text style={[type.body, { color: colors.muted }]} numberOfLines={3}>{role}</Text> : null}
          <View style={[styles.statusChip, { backgroundColor: toneBg }]}>
            <View style={[styles.statusDot, { backgroundColor: toneDot }]} />
            <Text style={[type.label, { color: toneInk }]}>{status.label}</Text>
          </View>
        </View>
        {onEdit ? (
          <Pressable
            nativeID="employee-home-edit"
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel="Rediger persondata"
            hitSlop={6}
            style={({ hovered }) => [styles.editBtn, { borderColor: colors.line, backgroundColor: hovered ? colors.sunken : colors.card }]}
          >
            <Ionicons name="pencil" size={16} color={colors.ink} />
          </Pressable>
        ) : null}
      </View>
      {phone || email ? (
        <View style={styles.contactRow}>
          {phone ? (
            <View style={styles.contactItem}>
              <View style={[styles.contactIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="call-outline" size={16} color={colors.brand} />
              </View>
              <Text style={[type.body, { color: colors.ink }]} numberOfLines={1} selectable>{phone}</Text>
            </View>
          ) : null}
          {email ? (
            <View style={[styles.contactItem, styles.contactGrow]}>
              <View style={[styles.contactIcon, { backgroundColor: colors.brandSoft }]}>
                <Ionicons name="mail-outline" size={16} color={colors.brand} />
              </View>
              <Text style={[type.body, styles.shrink, { color: colors.ink }]} numberOfLines={1} selectable>{email}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function Shortcuts({ items, colors }) {
  if (!items.length) return null;
  return (
    <Card colors={colors} nativeID="employee-home-shortcuts">
      <CardHead icon="flash-outline" title="Snarveier" colors={colors} />
      <View style={styles.shortcutGrid}>
        {items.map((item) => (
          <Pressable
            key={item.id}
            nativeID={`employee-home-shortcut-${item.id}`}
            onPress={item.onPress}
            accessibilityRole="button"
            style={({ hovered }) => [styles.shortcut, { backgroundColor: tint(item.color, hovered ? 0.16 : 0.09) }]}
          >
            <Ionicons name={item.icon} size={24} color={item.color} />
            <View style={styles.shortcutFoot}>
              <Text style={[type.bodyStrong, styles.shrink, { color: colors.ink }]} numberOfLines={2}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={colors.ink} />
            </View>
          </Pressable>
        ))}
      </View>
    </Card>
  );
}

function Kpi({ icon, label, value, hint, colors, tone, aside }) {
  return (
    <Card colors={colors} style={[styles.kpi, tone ? { backgroundColor: tone.bg } : null]}>
      <View style={[styles.kpiIcon, { backgroundColor: tone ? colors.card : colors.brandSoft }]}>
        <Ionicons name={icon} size={22} color={tone ? tone.ink : colors.brand} />
      </View>
      <View style={styles.kpiBody}>
        <Text style={[type.label, { color: colors.ink }]} numberOfLines={1}>{label}</Text>
        <Text style={[type.h1, { color: tone ? tone.ink : colors.ink }]} numberOfLines={1}>{value}</Text>
        {hint ? <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>{hint}</Text> : null}
      </View>
      {aside}
    </Card>
  );
}

function Gauge({ pct, colors, size = 120 }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(100, pct || 0));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.brandSoft} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.success}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[type.h1, { color: colors.ink }]}>{pct == null ? '–' : `${pct} %`}</Text>
      </View>
    </View>
  );
}

function niceMax(value) {
  if (!(value > 0)) return 10;
  const steps = [5, 10, 20, 25, 40, 50, 100, 150, 200];
  const step = steps.find((s) => value / s <= 4) || 250;
  return Math.ceil(value / step) * step;
}

function ProductivityCard({
  series, mode, onMode, target, colors, loading, compact,
}) {
  const bars = series.bars;
  const top = niceMax(Math.max(...bars.map((b) => Math.max(b.worked, (b.capacity || b.planned) * (target / 100))), 1));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(top * f));
  const chartH = 150;
  const delta = series.deltaPp;
  return (
    <Card colors={colors} nativeID="employee-home-productivity">
      <View style={[styles.cardHead, compact && styles.cardHeadWrap]}>
        <View style={styles.cardHeadLeft}>
          <Ionicons name="bar-chart-outline" size={20} color={colors.brand} />
          <Text style={[styles.cardTitle, { color: colors.ink }]} numberOfLines={1}>{`Produktivitet – ${series.title.toLowerCase()}`}</Text>
        </View>
        <View accessibilityRole="tablist" style={[styles.segment, { borderColor: colors.line }]}>
          {PERIOD_MODES.map((m) => {
            const active = m.id === mode;
            return (
              <Pressable
                key={m.id}
                nativeID={`employee-home-period-${m.id}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => onMode(m.id)}
                style={[styles.segmentItem, active && { backgroundColor: colors.brand }]}
              >
                <Text style={[type.label, { color: active ? colors.onBrand : colors.ink }]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={[styles.chartRow, compact && styles.chartRowStack]}>
        <View style={styles.chartArea}>
          <View style={{ flexDirection: 'row', height: chartH }}>
            <View style={styles.yAxis}>
              {[...ticks].reverse().map((t) => (
                <Text key={t} style={[type.caption, { color: colors.muted }]}>{`${t} t`}</Text>
              ))}
            </View>
            <View style={[styles.plot, { borderBottomColor: colors.line }]}>
              {bars.map((bar) => {
                const cap = bar.future ? 0 : bar.capacity;
                const goalH = cap > 0 ? ((cap * target) / 100 / top) * chartH : 0;
                const billH = (bar.billable / top) * chartH;
                const otherH = (bar.other / top) * chartH;
                return (
                  <View
                    key={bar.key}
                    style={styles.barSlot}
                    accessibilityLabel={`${bar.label}: ${formatHoursShort(bar.billable)} fakturerbart, ${formatHoursShort(bar.other)} øvrig, mulig ${formatHoursShort(bar.capacity)}`}
                  >
                    {goalH > 0 ? (
                      <View style={[styles.goalTick, { bottom: goalH, borderColor: colors.success }]} />
                    ) : null}
                    <View style={[styles.bar, { height: Math.max(0, otherH), backgroundColor: tint(colors.brand, 0.3) }]} />
                    <View style={[styles.bar, styles.barBase, { height: Math.max(0, billH), backgroundColor: colors.brand }]} />
                  </View>
                );
              })}
            </View>
          </View>
          <View style={styles.xAxis}>
            {bars.map((bar) => (
              <Text key={bar.key} style={[type.caption, styles.xLabel, { color: colors.muted }]} numberOfLines={1}>{bar.label}</Text>
            ))}
          </View>
          <View style={styles.legend}>
            <Legend color={colors.brand} label="Fakturerbare timer" colors={colors} />
            <Legend color={tint(colors.brand, 0.3)} label="Øvrige timer" colors={colors} />
            <Legend color={colors.success} dashed label={`Mål (${target} %)`} colors={colors} />
          </View>
        </View>
        <View style={styles.gaugeCol}>
          <Gauge pct={loading ? null : series.total.pct} colors={colors} />
          <Text style={[type.label, { color: colors.ink }]}>Faktureringsgrad</Text>
          {delta != null ? (
            <View style={[styles.deltaChip, { backgroundColor: delta >= 0 ? colors.successSoft : colors.dangerSoft }]}>
              <Ionicons name={delta >= 0 ? 'arrow-up' : 'arrow-down'} size={12} color={delta >= 0 ? colors.successInk : colors.dangerInk} />
              <Text style={[type.label, { color: delta >= 0 ? colors.successInk : colors.dangerInk }]}>{`${delta >= 0 ? '+' : '−'}${Math.abs(delta)} pp`}</Text>
            </View>
          ) : null}
          {delta != null ? <Text style={[type.caption, { color: colors.muted }]}>(vs. forrige periode)</Text> : null}
        </View>
      </View>
    </Card>
  );
}

function Legend({ color, label, colors, dashed }) {
  return (
    <View style={styles.legendItem}>
      {dashed
        ? <View style={[styles.legendDash, { borderColor: color }]} />
        : <View style={[styles.legendDot, { backgroundColor: color }]} />}
      <Text style={[type.caption, { color: colors.ink }]}>{label}</Text>
    </View>
  );
}

const PROJECT_RANGES = [
  { id: 3, label: 'Siste 3 mnd' },
  { id: 12, label: 'Siste 12 mnd' },
];

function ProjectsCard({
  rows, colors, range, onRange, onOpenProject, onAll, loading, compact, own,
}) {
  const shown = rows.slice(0, 6);
  const max = Math.max(...shown.map((r) => r.hours), 1);
  return (
    <Card colors={colors} nativeID="employee-home-projects">
      <CardHead
        icon="layers-outline"
        title={own ? 'Mine prosjekter – sist benyttet' : 'Prosjekter – sist benyttet'}
        colors={colors}
        link={onAll ? 'Se alle prosjekter' : null}
        onLink={onAll}
        nativeID="employee-home-projects-all"
        right={(
          <View style={[styles.segment, { borderColor: colors.line }]}>
            {PROJECT_RANGES.map((r) => {
              const active = r.id === range;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => onRange(r.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[styles.segmentItem, active && { backgroundColor: colors.brandSoft }]}
                >
                  <Text style={[type.label, { color: active ? colors.brand : colors.ink }]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      />
      {loading ? <Text style={[type.body, { color: colors.muted }]}>Henter timer …</Text> : null}
      {!loading && !shown.length ? (
        <Text style={[type.body, { color: colors.muted }]}>{`Ingen timer ført på prosjekt ${range === 3 ? 'de siste 3 månedene' : 'det siste året'}.`}</Text>
      ) : null}
      {shown.map((row) => (
        <Pressable
          key={row.id}
          onPress={row.project && onOpenProject ? () => onOpenProject(row.project) : undefined}
          disabled={!row.project || !onOpenProject}
          accessibilityRole="button"
          style={({ hovered }) => [styles.projectRow, { borderTopColor: colors.line }, hovered && { backgroundColor: colors.sunken }]}
        >
          <Text style={[type.bodyStrong, styles.projectNo, { color: colors.ink }]} numberOfLines={1}>{row.number ? `#${row.number}` : ''}</Text>
          <Text style={[type.body, styles.projectName, { color: colors.ink }]} numberOfLines={1}>{row.name}</Text>
          {compact ? null : (
            <Text style={[type.caption, styles.projectClient, { color: colors.muted }]} numberOfLines={1}>{row.client}</Text>
          )}
          {compact ? null : (
            <View style={[styles.projectTrack, { backgroundColor: colors.sunken }]}>
              <View style={[styles.projectFill, { width: `${Math.max(4, (row.hours / max) * 100)}%`, backgroundColor: colors.brand }]} />
            </View>
          )}
          <Text style={[type.bodyStrong, styles.projectHours, { color: colors.ink }]}>{formatHoursShort(row.hours)}</Text>
          <Ionicons name="chevron-forward" size={16} color={row.project ? colors.ink : 'transparent'} />
        </Pressable>
      ))}
    </Card>
  );
}

function Donut({ groups, total, colors, palette, size = 116 }) {
  const stroke = 12;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.sunken} strokeWidth={stroke} fill="none" />
        {total > 0 ? groups.filter((g) => g.days > 0).map((g) => {
          const len = (g.days / total) * c;
          const el = (
            <Circle
              key={g.id}
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={palette[g.id]}
              strokeWidth={stroke}
              fill="none"
              strokeDasharray={`${len} ${c}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          );
          offset += len;
          return el;
        }) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text style={[type.h1, { color: colors.ink }]}>{String(total).replace('.', ',')}</Text>
        <Text style={[type.caption, { color: colors.muted }]}>dager i år</Text>
      </View>
    </View>
  );
}

function AbsenceCard({ data, colors, onAll, loading }) {
  const palette = { ferie: colors.success, egenmelding: colors.brand, syk: colors.warn, annet: colors.accent };
  const groups = data.groups.filter((g) => g.days > 0 || g.id === 'ferie' || g.id === 'egenmelding');
  const dayText = (n) => `${String(n).replace('.', ',')} ${n === 1 ? 'dag' : 'dager'}`;
  return (
    <Card colors={colors} nativeID="employee-home-absence">
      <CardHead icon="calendar-outline" title="Fravær" colors={colors} link={onAll ? 'Se alle' : null} onLink={onAll} nativeID="employee-home-absence-all" />
      <View style={styles.absenceBody}>
        <Donut groups={data.groups} total={loading ? 0 : data.total} colors={colors} palette={palette} />
        <View style={styles.absenceList}>
          {groups.map((g) => (
            <View key={g.id} style={styles.absenceRow}>
              <View style={[styles.legendDot, { backgroundColor: palette[g.id] }]} />
              <Text style={[type.body, styles.grow, { color: colors.ink }]} numberOfLines={1}>{g.label}</Text>
              <Text style={[type.body, { color: colors.ink }]}>{dayText(g.days)}</Text>
            </View>
          ))}
        </View>
      </View>
    </Card>
  );
}

function WeekCard({ data, colors, onDetails }) {
  const pct = data.pct == null ? 0 : Math.min(100, data.pct);
  return (
    <Card colors={colors} nativeID="employee-home-week">
      <CardHead icon="time-outline" title="Arbeidstid denne uken" colors={colors} link={onDetails ? 'Se detaljer' : null} onLink={onDetails} nativeID="employee-home-week-details" />
      <View style={[styles.weekTrack, { backgroundColor: colors.sunken }]}>
        <View style={[styles.weekFill, { width: `${pct}%`, backgroundColor: colors.brand }]} />
      </View>
      <View style={styles.weekStats}>
        <WeekStat value={formatHoursShort(data.worked)} label="Registrert" colors={colors} />
        <View style={[styles.weekDivider, { backgroundColor: colors.line }]} />
        <WeekStat value={formatHoursShort(data.planned)} label="Planlagt" colors={colors} />
        <View style={[styles.weekDivider, { backgroundColor: colors.line }]} />
        <WeekStat value={data.pct == null ? '–' : `${data.pct} %`} label="Gjennomført" colors={colors} />
      </View>
    </Card>
  );
}

function WeekStat({ value, label, colors }) {
  return (
    <View style={styles.weekStat}>
      <Text style={[type.h2, { color: colors.ink }]}>{value}</Text>
      <Text style={[type.body, { color: colors.muted }]}>{label}</Text>
    </View>
  );
}

function TodoCard({ colors, companyId, employee, naeringskode, onOpenTodo }) {
  return (
    <Card colors={colors} nativeID="employee-home-todo">
      <EmployeeTodo
        variant="card"
        colors={colors}
        companyId={companyId}
        employee={employee}
        naeringskode={naeringskode}
        onOpenTodo={onOpenTodo}
      />
    </Card>
  );
}

export default function EmployeeHome({
  employee,
  colors,
  companyId,
  company,
  projectState,
  projects = [],
  showWork = false,
  showTodo = false,
  own = false,
  naeringskode = '',
  shortcuts = [],
  onEditProfile,
  onOpenTodo,
  onOpenAbsence,
  onOpenHours,
  onOpenProject,
  onOpenProjects,
}) {
  const [width, setWidth] = useState(0);
  const [mode, setMode] = useState('weeks12');
  const [projectRange, setProjectRange] = useState(3);
  const today = useMemo(() => new Date(), []);
  const hours = useEmployeeHours({ companyId, employeeId: employee?.id, enabled: showWork });

  useEffect(() => {
    setMode('weeks12');
    setProjectRange(3);
  }, [employee?.id]);

  const absenceTypes = useMemo(() => resolveAbsenceTypes(projectState), [projectState]);
  const fullDayHours = Number(projectState?.fullDayHours) || 0;
  const isOwnCompany = useMemo(() => ownCompanyMatcher({
    name: company?.navn || '',
    orgnr: company?.organisasjonsnummer || '',
    projects: projectState?.projects || [],
  }), [company?.navn, company?.organisasjonsnummer, projectState?.projects]);

  const ledger = useMemo(() => {
    if (!showWork) return new Map();
    const { fromDate, toDate } = homeLoadWindow(today);
    return dailyLedger({
      employee,
      entries: hours.entries,
      absences: hours.absences,
      fromDate,
      toDate,
      redDays: projectState?.redDays || [],
      fullDayHours: fullDayHours || undefined,
      absenceTypes,
      isOwnCompany,
    });
  }, [showWork, employee, hours.entries, hours.absences, projectState?.redDays, fullDayHours, absenceTypes, isOwnCompany, today]);

  const series = useMemo(() => productivitySeries(ledger, mode, { today }), [ledger, mode, today]);
  const week = useMemo(() => weekWork(ledger, today), [ledger, today]);
  const absence = useMemo(() => absenceYear({
    employee, absences: hours.absences, absenceTypes, ledger, today, fullDayHours: fullDayHours || undefined,
  }), [employee, hours.absences, absenceTypes, ledger, today, fullDayHours]);
  const projectRows = useMemo(() => {
    // Bare prosjekter den som ser på, har innsyn i.
    const known = new Set((projects || []).map((p) => p.id));
    return recentProjects({
      employeeId: employee?.id, entries: hours.entries, projects, since: monthsAgoKey(projectRange, today),
    }).filter((row) => known.has(row.id));
  }, [employee?.id, hours.entries, projects, projectRange, today]);

  const target = Number(timeSettingsOf(employee).utilizationTarget) || 100;
  const pct = series.total.pct;
  const onGoal = pct != null && pct >= target;
  const loadingText = hours.loading ? '…' : null;

  const cols = width >= 1180 ? 3 : width >= 760 ? 2 : 1;
  const compact = width < 560;

  const profile = <ProfileCard employee={employee} colors={colors} onEdit={onEditProfile} />;
  const shortcutCard = <Shortcuts items={shortcuts} colors={colors} />;
  const todo = showTodo ? (
    <TodoCard colors={colors} companyId={companyId} employee={employee} naeringskode={naeringskode} onOpenTodo={onOpenTodo} />
  ) : null;

  const kpis = showWork ? (
    <View style={[styles.kpiRow, compact && styles.kpiRowStack]}>
      <Kpi icon="calendar-outline" label="Tilgjengelige timer" value={loadingText || formatHoursShort(series.total.capacity)} hint="i perioden" colors={colors} />
      <Kpi icon="layers-outline" label="Fakturerbare timer" value={loadingText || formatHoursShort(series.total.billable)} hint="i perioden" colors={colors} />
      <Kpi
        icon="locate-outline"
        label="Faktureringsgrad"
        value={loadingText || (pct == null ? '–' : `${pct} %`)}
        colors={colors}
        tone={onGoal ? { bg: colors.successSoft, ink: colors.successInk } : null}
        aside={(
          <View style={[styles.kpiAside, { borderLeftColor: colors.line }]}>
            <Text style={[type.caption, { color: colors.muted }]}>Mål</Text>
            <Text style={[type.label, { color: colors.ink }]}>{`${target} %`}</Text>
          </View>
        )}
      />
    </View>
  ) : null;
  const chart = showWork ? (
    <ProductivityCard series={series} mode={mode} onMode={setMode} target={target} colors={colors} loading={hours.loading} compact={compact} />
  ) : null;
  const projectsCard = showWork ? (
    <ProjectsCard
      rows={projectRows}
      colors={colors}
      range={projectRange}
      onRange={setProjectRange}
      onOpenProject={onOpenProject}
      onAll={onOpenProjects}
      loading={hours.loading}
      compact={compact}
      own={own}
    />
  ) : null;
  const absenceCard = showWork ? <AbsenceCard data={absence} colors={colors} onAll={onOpenAbsence} loading={hours.loading} /> : null;
  const weekCard = showWork ? <WeekCard data={week} colors={colors} onDetails={onOpenHours} /> : null;

  let body;
  if (cols === 3) {
    body = (
      <View style={styles.row}>
        <View style={styles.colSide}>{profile}{shortcutCard}</View>
        <View style={styles.colMain}>{kpis}{chart}{projectsCard}</View>
        <View style={styles.colSide}>{todo}{absenceCard}{weekCard}</View>
      </View>
    );
  } else if (cols === 2) {
    body = (
      <View style={styles.row}>
        <View style={styles.colSide}>{profile}{todo}{weekCard}{absenceCard}{shortcutCard}</View>
        <View style={styles.colMain}>{kpis}{chart}{projectsCard}</View>
      </View>
    );
  } else {
    body = (
      <View style={styles.stack}>
        {profile}{todo}{shortcutCard}{kpis}{chart}{weekCard}{absenceCard}{projectsCard}
      </View>
    );
  }

  return (
    <View nativeID="employee-home" style={styles.root} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width ? body : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  stack: { gap: space.sm },
  colSide: { flex: 1, minWidth: 0, gap: space.md },
  colMain: { flex: 2, minWidth: 0, gap: space.md },
  card: { borderWidth: 1, borderRadius: radius.sheet, padding: space.md, gap: space.sm },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: space.xs, justifyContent: 'space-between' },
  cardHeadWrap: { flexWrap: 'wrap' },
  cardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1, minWidth: 0 },
  cardTitle: { ...type.title },
  countBadge: { minWidth: 22, height: 22, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  countBadgeText: { ...type.label },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  link: { ...type.label },
  center: { alignItems: 'center', justifyContent: 'center' },
  shrink: { flexShrink: 1, minWidth: 0 },
  grow: { flex: 1, minWidth: 0 },
  profileTop: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  photo: { width: 112, height: 124, borderRadius: radius.card },
  photoFallback: { alignItems: 'center', justifyContent: 'center' },
  profileFacts: { flex: 1, minWidth: 0, gap: space.xxs },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4, marginTop: space.xxs },
  statusDot: { width: 8, height: 8, borderRadius: radius.pill },
  editBtn: { width: 34, height: 34, borderRadius: radius.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'center' },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs, minWidth: 0 },
  contactGrow: { flexShrink: 1 },
  contactIcon: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  shortcutGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  shortcut: { flexGrow: 1, flexBasis: 140, minHeight: 92, borderRadius: radius.card, padding: space.sm, gap: space.xs, justifyContent: 'space-between' },
  shortcutFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xxs },
  kpiRow: { flexDirection: 'row', gap: space.md },
  kpiRowStack: { flexDirection: 'column', gap: space.sm },
  kpi: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm, minWidth: 0 },
  kpiIcon: { width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  kpiBody: { flex: 1, minWidth: 0 },
  kpiAside: { borderLeftWidth: 1, paddingLeft: space.xs, alignItems: 'flex-end' },
  segment: { flexDirection: 'row', borderWidth: 1, borderRadius: radius.control, padding: 2, gap: 2, flexShrink: 0 },
  segmentItem: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.control - 2 },
  chartRow: { flexDirection: 'row', gap: space.md, alignItems: 'center' },
  chartRowStack: { flexDirection: 'column', alignItems: 'stretch' },
  chartArea: { flex: 1, minWidth: 0 },
  yAxis: { width: 36, justifyContent: 'space-between', alignItems: 'flex-end', paddingRight: 6, marginTop: -8, marginBottom: -8 },
  plot: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: 1, gap: 6 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'stretch', position: 'relative' },
  bar: { borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  barBase: { borderTopLeftRadius: 0, borderTopRightRadius: 0 },
  goalTick: { position: 'absolute', left: -3, right: -3, borderTopWidth: 2, borderStyle: 'dashed', zIndex: 1 },
  xAxis: { flexDirection: 'row', marginLeft: 36, gap: 6, marginTop: 4 },
  xLabel: { flex: 1, textAlign: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md, marginTop: space.xs, marginLeft: 36 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: radius.pill },
  legendDash: { width: 16, borderTopWidth: 2, borderStyle: 'dashed' },
  gaugeCol: { alignItems: 'center', gap: space.xxs, minWidth: 130 },
  deltaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  projectRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderRadius: radius.control - 4 },
  projectNo: { width: 64 },
  projectName: { flex: 2.2, minWidth: 0 },
  projectClient: { flex: 1.2, minWidth: 0 },
  projectTrack: { flex: 1, height: 6, borderRadius: radius.pill, overflow: 'hidden', minWidth: 40 },
  projectFill: { height: '100%', borderRadius: radius.pill },
  projectHours: { width: 56, textAlign: 'right' },
  absenceBody: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  absenceList: { flex: 1, minWidth: 150, gap: space.xs },
  absenceRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, justifyContent: 'space-between' },
  weekTrack: { height: 12, borderRadius: radius.pill, overflow: 'hidden' },
  weekFill: { height: '100%', borderRadius: radius.pill },
  weekStats: { flexDirection: 'row', alignItems: 'stretch' },
  weekStat: { flex: 1, alignItems: 'center', gap: 2 },
  weekDivider: { width: 1 },
});
