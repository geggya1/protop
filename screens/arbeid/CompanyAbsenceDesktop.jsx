import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useColors } from '../../src/context/ThemeContext';
import { absenceTypeById } from '../../src/arbeid/absenceCatalog.js';
import { buildAbsenceWebBoard } from '../../src/arbeid/absenceDashboard.js';

const ink = '#152033';
const muted = '#8B95A6';
const line = '#E6EBF2';
const blue = '#2F6BDB';
const BARS = { ferie: '#2F6BDB', sykdom: '#E15D6A', annet: '#F0A04B' };
const FILTERS = [
  { id: 'alle', label: 'Alle' },
  { id: 'ferie', label: 'Ferie' },
  { id: 'sykdom', label: 'Sykdom' },
  { id: 'permisjon', label: 'Permisjon' },
  { id: 'annet', label: 'Annet' },
];
const STATUS = {
  planlagt: 'Planlagt',
  pagar: 'Pågår',
  avsluttet: 'Avsluttet',
  registrert: 'Registrert',
  behandling: 'Til behandling',
  godkjent: 'Godkjent',
  låst: 'Låst',
};

function approvalLabel(period, absences = []) {
  const ids = new Set(period?.ids || []);
  if (!ids.size) return STATUS[period?.status] || 'Registrert';
  const days = (absences || []).filter((row) => ids.has(row.id));
  if (!days.length) return STATUS[period?.status] || 'Registrert';
  if (days.every((row) => row.status === 'låst')) return STATUS.låst;
  if (days.every((row) => row.status === 'godkjent' || row.status === 'låst')) return STATUS.godkjent;
  if (days.some((row) => (row.status || 'registrert') === 'registrert')) return STATUS.behandling;
  return STATUS[period?.status] || 'Registrert';
}

function formatCount(value) {
  const n = Math.round((Number(value) || 0) * 100) / 100;
  if (Number.isInteger(n)) return String(n);
  return String(n).replace('.', ',');
}

function monthTotal(month) {
  return (Number(month?.ferie) || 0) + (Number(month?.sykdom) || 0) + (Number(month?.annet) || 0);
}

function monthTone(month) {
  if (month.sykdom >= month.ferie && month.sykdom >= month.annet && month.sykdom > 0) return BARS.sykdom;
  if (month.annet > month.ferie && month.annet > 0) return BARS.annet;
  return BARS.ferie;
}

function useBoard(props) {
  const {
    employees = [], names = {}, employeeId = '', absences = [], adjustments = [],
    fullDayHours = 7.5, today = '',
  } = props;
  return useMemo(() => buildAbsenceWebBoard({
    employees, employeeId, absences, adjustments, fullDayHours, today, names,
  }), [employees, employeeId, absences, adjustments, fullDayHours, today, names]);
}

export function CompanyAbsenceDesktop({
  employees = [],
  names = {},
  employeeId = '',
  canChooseEmployee = false,
  onSelectEmployee,
  absences = [],
  adjustments = [],
  fullDayHours = 7.5,
  today = '',
  error = '',
  opening = '',
  onOpeningChange,
  onSaveOpening,
}) {
  const colors = useColors();
  const board = useBoard({
    employees, names, employeeId, absences, adjustments, fullDayHours, today,
  });
  const [kind, setKind] = useState('alle');
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [chartWidth, setChartWidth] = useState(420);
  const summary = board.dash.summary || {};
  const earned = Number(summary.earned) || 0;
  const used = Number(summary.used) || 0;
  const hasQuota = earned > 0;
  const lines = board.lines.filter((row) => kind === 'alle' || row.category === kind);
  const away = board.lines.filter((row) => row.status === 'pagar');
  const selectedName = employeeId ? (names[employeeId] || 'Ansatt') : 'Alle ansatte';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F4F7FB' }}
      contentContainerStyle={styles.page}
      nativeID="fravaer-oversikt-web"
    >
      <View style={styles.toolbar}>
        <Text style={styles.lead}>Registrert fravær, feriesaldo, hvem som er borte og hva som er planlagt.</Text>
        {canChooseEmployee ? (
          <TouchableOpacity
            onPress={() => setPeopleOpen((value) => !value)}
            style={[styles.personBtn, { borderColor: line, backgroundColor: '#fff' }]}
            accessibilityRole="button"
            accessibilityLabel="Velg ansatt"
          >
            <Ionicons name="people" size={15} color={blue} />
            <Text style={styles.personTxt}>{selectedName}</Text>
            <Ionicons name="chevron-down" size={14} color={muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {peopleOpen ? (
        <View style={[styles.menu, { borderColor: line }]}>
          <MenuRow label="Alle ansatte" on={!employeeId} onPress={() => { setPeopleOpen(false); onSelectEmployee?.(''); }} />
          {employees.map((row) => (
            <MenuRow
              key={row.id}
              label={names[row.id] || 'Ansatt'}
              on={row.id === employeeId}
              onPress={() => { setPeopleOpen(false); onSelectEmployee?.(row.id); }}
            />
          ))}
        </View>
      ) : null}
      {error ? <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text> : null}

      <View style={styles.kpis}>
        <Kpi icon="people" tint={blue} bg="#E8F0FE" value={board.dash.headcount || 0} label="Ansatte" />
        <Kpi icon="calendar" tint="#1F9D55" bg="#E7F8EF" value={board.dash.onVacation || 0} label="På ferie nå" />
        <Kpi icon="heart" tint="#E15B73" bg="#FDECEF" value={board.dash.sickNow || 0} label="Sykemeldte nå" />
        <Kpi icon="time" tint="#E09A3E" bg="#FFF4E5" value={board.dash.otherNow || 0} label="Annet fravær nå" />
      </View>

      <View style={[styles.card, styles.awayCard]}>
        <Text style={styles.cardTitle}>Borte i dag</Text>
        {away.length ? (
          <View style={styles.awayRow}>
            {away.map((row) => (
              <View key={row.id} style={styles.awayPill}>
                <View style={[styles.swatch, { backgroundColor: BARS[row.bucket] || BARS.annet }]} />
                <Text style={styles.awayName}>{row.employeeName}</Text>
                <Text style={styles.awayType}>{row.typeLabel}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.empty}>Ingen er registrert borte i dag.</Text>
        )}
      </View>

      <PlannedCard rows={board.planned || []} />

      <View style={styles.split}>
        <View style={[styles.card, styles.splitCard]}>
          <Text style={styles.cardTitle}>{`Feriebruk ${board.year}`}</Text>
          <View style={styles.donutRow}>
            <Donut used={used} total={earned} hasQuota={hasQuota} />
            <View style={styles.legend}>
              <Legend color={blue} label="Brukte dager" value={formatCount(used)} />
              {hasQuota ? <Legend color="#D5DEEA" label="Gjenstående" value={formatCount(Math.max(0, earned - used))} /> : null}
              {hasQuota ? <Legend label="Startsaldo" value={formatCount(earned)} /> : null}
            </View>
          </View>
          {employeeId ? (
            <View style={styles.opening}>
              <Text style={styles.openingLabel}>{`Startsaldo ${absenceTypeById('ferie').label.toLowerCase()}`}</Text>
              <TextInput
                value={opening}
                onChangeText={onOpeningChange}
                placeholder={formatCount(summary.opening || 0)}
                placeholderTextColor="#A0A8B8"
                keyboardType="decimal-pad"
                style={styles.input}
                accessibilityLabel="Startsaldo ferie"
                nativeID="ferie-startsaldo"
              />
              <TouchableOpacity onPress={() => onSaveOpening?.('ferie')} style={styles.save} nativeID="ferie-startsaldo-save">
                <Text style={styles.saveTxt}>Lagre</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
        <View
          style={[styles.card, styles.splitCard]}
          onLayout={(event) => setChartWidth(Math.max(220, event.nativeEvent.layout.width - 36))}
        >
          <Text style={styles.cardTitle}>Fravær siste 6 måneder</Text>
          <MonthChart months={board.dash.recentMonths || []} width={chartWidth} />
          <View style={styles.keys}>
            <Key color={BARS.ferie} label="Ferie" />
            <Key color={BARS.sykdom} label="Sykdom" />
            <Key color={BARS.annet} label="Annet" />
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{`Fravær i ${board.year}`}</Text>
        <Text style={styles.hint}>Dager per måned. Feriesaldoen er lagret startsaldo minus registrert ferie.</Text>
        {board.staff.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.matrix}>
              <View style={styles.matrixHead}>
                <Text style={[styles.nameCol, styles.headTxt]}>Ansatt</Text>
                {board.months.map((label) => (
                  <Text key={label} style={[styles.monthCol, styles.headTxt]}>{label}</Text>
                ))}
                <Text style={[styles.numCol, styles.headTxt]}>Ferie</Text>
                <Text style={[styles.numCol, styles.headTxt]}>Til gode</Text>
              </View>
              {board.staff.map((person) => (
                <View key={person.id} style={styles.matrixRow}>
                  <Text style={[styles.nameCol, styles.nameTxt]} numberOfLines={1}>{person.name}</Text>
                  {person.months.map((month) => {
                    const total = monthTotal(month);
                    return (
                      <Text key={month.label} style={[styles.monthCol, styles.monthNum, total ? { color: monthTone(month) } : null]}>
                        {total ? formatCount(total) : ''}
                      </Text>
                    );
                  })}
                  <Text style={[styles.numCol, styles.numTxt]}>{formatCount(person.vacationUsed)}</Text>
                  <Text style={[styles.numCol, styles.numTxt]}>{person.earned ? formatCount(person.remaining) : '–'}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        ) : (
          <Text style={styles.empty}>{`Ingen fravær er registrert i ${board.year}.`}</Text>
        )}
      </View>

      <View style={styles.card} nativeID="fravaer-perioder">
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Registrerte perioder</Text>
          <View style={styles.filters}>
            {FILTERS.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => setKind(item.id)}
                style={[styles.filter, kind === item.id && styles.filterOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: kind === item.id }}
              >
                <Text style={[styles.filterTxt, kind === item.id && styles.filterTxtOn]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        {lines.length ? lines.map((row) => (
          <View key={row.id} style={styles.period}>
            <View style={[styles.swatch, { backgroundColor: BARS[row.bucket] || BARS.annet }]} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.periodName} numberOfLines={1}>{row.employeeName}</Text>
              <Text style={styles.periodMeta}>{`${row.typeLabel} · ${row.start === row.end ? row.start : `${row.start} – ${row.end}`}`}</Text>
            </View>
            <Text style={styles.periodDays}>{`${formatCount(row.days)} d`}</Text>
            <Text style={styles.periodStatus}>{STATUS[row.status] || 'Registrert'}</Text>
          </View>
        )) : (
          <Text style={styles.empty}>Ingen perioder i dette utvalget.</Text>
        )}
      </View>
    </ScrollView>
  );
}

export function AbsenceReportDesktop({
  employees = [],
  names = {},
  absences = [],
  adjustments = [],
  fullDayHours = 7.5,
  today = '',
  canChooseEmployee = false,
  lockedEmployeeId = '',
  canImport = false,
  onImport,
  onOpenPeriod,
  note = '',
  error = '',
}) {
  const [employeeId, setEmployeeId] = useState(canChooseEmployee ? '' : lockedEmployeeId);
  const [kind, setKind] = useState('alle');
  const [peopleOpen, setPeopleOpen] = useState(false);
  const board = useBoard({
    employees, names, employeeId, absences, adjustments, fullDayHours, today,
  });
  const lines = board.lines.filter((row) => kind === 'alle' || row.category === kind);
  const selectedName = employeeId ? (names[employeeId] || 'Ansatt') : 'Alle ansatte';
  const totals = { ferie: 0, sykdom: 0, annet: 0 };
  for (const row of board.lines) {
    const key = row.bucket === 'sykdom' ? 'sykdom' : row.bucket === 'ferie' ? 'ferie' : 'annet';
    totals[key] += Number(row.days) || 0;
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F4F7FB' }}
      contentContainerStyle={styles.page}
      nativeID="fravaersrapport"
    >
      <View style={styles.toolbar}>
        <Text style={styles.lead}>Alle registrerte fraværsperioder i år. Åpne en rad for å behandle, eller importer fra Excel.</Text>
        <View style={styles.toolbarRight}>
          {canImport ? (
            <TouchableOpacity
              onPress={onImport}
              style={[styles.importBtn, { backgroundColor: blue }]}
              accessibilityRole="button"
              accessibilityLabel="Importer fravær"
              nativeID="fravaer-import"
            >
              <Ionicons name="cloud-upload-outline" size={15} color="#fff" />
              <Text style={styles.importTxt}>Importer</Text>
            </TouchableOpacity>
          ) : null}
          {canChooseEmployee ? (
            <TouchableOpacity
              onPress={() => setPeopleOpen((value) => !value)}
              style={[styles.personBtn, { borderColor: line, backgroundColor: '#fff' }]}
              accessibilityRole="button"
            >
              <Ionicons name="people" size={15} color={blue} />
              <Text style={styles.personTxt}>{selectedName}</Text>
              <Ionicons name="chevron-down" size={14} color={muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {peopleOpen ? (
        <View style={[styles.menu, { borderColor: line }]}>
          <MenuRow label="Alle ansatte" on={!employeeId} onPress={() => { setPeopleOpen(false); setEmployeeId(''); }} />
          {employees.map((row) => (
            <MenuRow
              key={row.id}
              label={names[row.id] || 'Ansatt'}
              on={row.id === employeeId}
              onPress={() => { setPeopleOpen(false); setEmployeeId(row.id); }}
            />
          ))}
        </View>
      ) : null}
      {error ? <Text style={{ color: '#b42318' }}>{error}</Text> : null}
      {note ? <Text style={{ color: muted }}>{note}</Text> : null}
      <View style={styles.kpis}>
        <Kpi icon="umbrella" tint={blue} bg="#E8F0FE" value={formatCount(totals.ferie)} label="Feriedager" />
        <Kpi icon="heart" tint="#E15B73" bg="#FDECEF" value={formatCount(totals.sykdom)} label="Sykedager" />
        <Kpi icon="time" tint="#E09A3E" bg="#FFF4E5" value={formatCount(totals.annet)} label="Andre dager" />
        <Kpi icon="list" tint="#34507A" bg="#EEF2F7" value={board.lines.length} label="Perioder" />
      </View>
      <PlannedCard rows={board.planned || []} onOpenPeriod={onOpenPeriod} />
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>{`Perioder ${board.year}`}</Text>
          <View style={styles.filters}>
            {FILTERS.map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => setKind(item.id)}
                style={[styles.filter, kind === item.id && styles.filterOn]}
                accessibilityRole="button"
              >
                <Text style={[styles.filterTxt, kind === item.id && styles.filterTxtOn]}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.tableHead}>
          <Text style={[styles.colGrow, styles.headTxt]}>Medarbeider</Text>
          <Text style={[styles.colGrow, styles.headTxt]}>Type</Text>
          <Text style={[styles.colGrow, styles.headTxt]}>Periode</Text>
          <Text style={[styles.colDays, styles.headTxt]}>Dager</Text>
          <Text style={[styles.colStatus, styles.headTxt]}>Status</Text>
        </View>
        {lines.length ? lines.map((row) => (
          <TouchableOpacity
            key={row.id}
            style={styles.tableRow}
            onPress={() => onOpenPeriod?.(row)}
            accessibilityRole="button"
            accessibilityLabel={`Åpne fravær for ${row.employeeName}`}
            disabled={!onOpenPeriod}
          >
            <Text style={[styles.colGrow, styles.nameTxt]} numberOfLines={1}>{row.employeeName}</Text>
            <Text style={[styles.colGrow, styles.periodMeta]} numberOfLines={1}>{row.typeLabel}</Text>
            <Text style={[styles.colGrow, styles.periodMeta]} numberOfLines={1}>{row.start === row.end ? row.start : `${row.start} – ${row.end}`}</Text>
            <Text style={[styles.colDays, styles.numTxt]}>{formatCount(row.days)}</Text>
            <Text style={[styles.colStatus, styles.periodMeta]}>{approvalLabel(row, absences)}</Text>
          </TouchableOpacity>
        )) : (
          <Text style={styles.empty}>Ingen fravær er registrert i dette utvalget.</Text>
        )}
      </View>
    </ScrollView>
  );
}

export function PlannedAbsenceDesktop({
  employees = [],
  names = {},
  absences = [],
  adjustments = [],
  fullDayHours = 7.5,
  today = '',
  canChooseEmployee = false,
  lockedEmployeeId = '',
}) {
  const [employeeId, setEmployeeId] = useState(canChooseEmployee ? '' : lockedEmployeeId);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const board = useBoard({
    employees, names, employeeId, absences, adjustments, fullDayHours, today,
  });
  const selectedName = employeeId ? (names[employeeId] || 'Ansatt') : 'Alle ansatte';
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#F4F7FB' }}
      contentContainerStyle={styles.page}
      nativeID="planlagt-fravaer-side"
    >
      <View style={styles.toolbar}>
        <Text style={styles.lead}>Fravær som er registrert frem i tid, også inn i neste år.</Text>
        {canChooseEmployee ? (
          <TouchableOpacity
            onPress={() => setPeopleOpen((value) => !value)}
            style={[styles.personBtn, { borderColor: line, backgroundColor: '#fff' }]}
            accessibilityRole="button"
            accessibilityLabel="Velg ansatt"
          >
            <Ionicons name="people" size={15} color={blue} />
            <Text style={styles.personTxt}>{selectedName}</Text>
            <Ionicons name="chevron-down" size={14} color={muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      {peopleOpen ? (
        <View style={[styles.menu, { borderColor: line }]}>
          <MenuRow label="Alle ansatte" on={!employeeId} onPress={() => { setPeopleOpen(false); setEmployeeId(''); }} />
          {employees.map((row) => (
            <MenuRow
              key={row.id}
              label={names[row.id] || 'Ansatt'}
              on={row.id === employeeId}
              onPress={() => { setPeopleOpen(false); setEmployeeId(row.id); }}
            />
          ))}
        </View>
      ) : null}
      <PlannedCard rows={board.planned || []} />
    </ScrollView>
  );
}

function PlannedCard({ rows, onOpenPeriod }) {
  return (
    <View style={styles.card} nativeID="planlagt-fravaer">
      <Text style={styles.cardTitle}>Planlagt fravær</Text>
      <Text style={styles.hint}>Registrert fravær som ligger frem i tid.</Text>
      {rows.length ? rows.map((row) => (
        <TouchableOpacity
          key={row.id}
          style={styles.period}
          onPress={() => onOpenPeriod?.(row)}
          disabled={!onOpenPeriod}
          accessibilityRole="button"
        >
          <View style={[styles.swatch, { backgroundColor: BARS[row.bucket] || BARS.annet }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.periodName} numberOfLines={1}>{row.employeeName}</Text>
            <Text style={styles.periodMeta}>{`${row.typeLabel} · ${row.start === row.end ? row.start : `${row.start} – ${row.end}`}`}</Text>
          </View>
          <Text style={styles.periodDays}>{`${formatCount(row.days)} d`}</Text>
          <Text style={styles.periodStatus}>Planlagt</Text>
        </TouchableOpacity>
      )) : (
        <Text style={styles.empty}>Ingen planlagt fravær frem i tid.</Text>
      )}
    </View>
  );
}

function Kpi({ icon, tint, bg, value, label }) {
  return (
    <View style={styles.kpi}>
      <View style={[styles.kpiIcon, { backgroundColor: bg }]}>
        <Ionicons name={icon} size={16} color={tint} />
      </View>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiLabel}>{label}</Text>
    </View>
  );
}

function Legend({ color, label, value }) {
  return (
    <View style={styles.legendRow}>
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : <View style={styles.dot} />}
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendValue}>{value}</Text>
    </View>
  );
}

function Key({ color, label }) {
  return (
    <View style={styles.key}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.periodMeta}>{label}</Text>
    </View>
  );
}

function MenuRow({ label, on, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.menuRow} accessibilityRole="button">
      <Text style={[styles.nameTxt, on && { color: blue }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Donut({ used, total, hasQuota }) {
  const size = 128;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const ratio = hasQuota && total > 0 ? Math.min(1, Math.max(0, used / total)) : 0;
  const dash = c * ratio;
  const percent = hasQuota && total > 0 ? Math.round((used / total) * 100) : 0;
  const center = size / 2;
  return (
    <View style={{ width: size, height: size }} nativeID="feriebruk-donut">
      <Svg width={size} height={size}>
        <Circle cx={center} cy={center} r={radius} stroke="#E7EEF6" strokeWidth={stroke} fill="none" />
        {dash > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={blue}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>
      <View style={styles.donutCenter} pointerEvents="none">
        <Text style={styles.donutValue}>{hasQuota ? `${percent}%` : formatCount(used)}</Text>
        <Text style={styles.donutCaption}>{hasQuota ? `${formatCount(used)} av ${formatCount(total)}` : 'dager'}</Text>
      </View>
    </View>
  );
}

function MonthChart({ months, width }) {
  const plotH = 140;
  const gap = 10;
  const count = Math.max(1, months.length);
  const barW = Math.max(12, (width - 28 - gap * (count - 1)) / count);
  const max = Math.max(1, ...months.map((month) => month.ferie + month.sykdom + month.annet));
  return (
    <View nativeID="fravaer-maneder">
      <View style={styles.chartPlot}>
        <Svg width={Math.max(80, width - 8)} height={plotH}>
          {months.map((month, index) => {
            const x = index * (barW + gap);
            const parts = [['ferie', month.ferie], ['sykdom', month.sykdom], ['annet', month.annet]].filter((part) => part[1] > 0);
            let y = plotH;
            return parts.map(([key, value]) => {
              const h = Math.max(3, (value / max) * (plotH - 6));
              y -= h;
              return <Rect key={`${month.key || month.label}-${key}`} x={x} y={y} width={barW} height={h} rx={3} fill={BARS[key]} />;
            });
          })}
        </Svg>
      </View>
      <View style={styles.monthLabels}>
        {months.map((month) => (
          <Text key={month.key || month.label} style={[styles.monthLabel, { width: barW + gap }]}>{month.label}</Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: 20, gap: 14, paddingBottom: 48 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toolbarRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  lead: { color: muted, fontSize: 14, flex: 1 },
  importBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
  },
  importTxt: { color: '#fff', fontWeight: '700' },
  personBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
  },
  personTxt: { color: ink, fontWeight: '600' },
  menu: { borderWidth: 1, borderRadius: 12, backgroundColor: '#fff', maxHeight: 280, overflow: 'hidden' },
  menuRow: { paddingHorizontal: 12, paddingVertical: 8 },
  kpis: { flexDirection: 'row', gap: 12 },
  kpi: {
    flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: line, borderRadius: 14,
    padding: 14, gap: 4,
  },
  kpiIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  kpiValue: { color: ink, fontSize: 26, fontWeight: '800' },
  kpiLabel: { color: muted, fontSize: 13 },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: line, borderRadius: 14, padding: 16, gap: 10 },
  awayCard: { gap: 8 },
  cardTitle: { color: ink, fontSize: 16, fontWeight: '700' },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  hint: { color: muted, fontSize: 12, marginTop: -4 },
  empty: { color: muted, fontSize: 14 },
  awayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  awayPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#F4F7FB', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6,
  },
  awayName: { color: ink, fontWeight: '700', fontSize: 13 },
  awayType: { color: muted, fontSize: 12 },
  split: { flexDirection: 'row', gap: 14, alignItems: 'stretch' },
  splitCard: { flex: 1, minWidth: 280 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  donutCenter: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  donutValue: { color: ink, fontSize: 22, fontWeight: '800' },
  donutCaption: { color: muted, fontSize: 11 },
  legend: { flex: 1, gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendLabel: { color: muted, flex: 1 },
  legendValue: { color: ink, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  keys: { flexDirection: 'row', gap: 14 },
  key: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chartPlot: { paddingTop: 4 },
  monthLabels: { flexDirection: 'row' },
  monthLabel: { color: muted, fontSize: 11, textAlign: 'center' },
  opening: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  openingLabel: { color: muted, fontSize: 12 },
  input: { borderWidth: 1, borderColor: line, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, minWidth: 72, color: ink },
  save: { backgroundColor: blue, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  saveTxt: { color: '#fff', fontWeight: '700' },
  matrix: { minWidth: 920, gap: 2 },
  matrixHead: { flexDirection: 'row', alignItems: 'center', paddingBottom: 6 },
  matrixRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line, paddingVertical: 6 },
  nameCol: { width: 150 },
  monthCol: { width: 48, textAlign: 'center' },
  numCol: { width: 72, textAlign: 'right' },
  headTxt: { color: muted, fontSize: 11, fontWeight: '700' },
  nameTxt: { color: ink, fontWeight: '600', fontSize: 13 },
  monthNum: { fontSize: 12, fontWeight: '700' },
  numTxt: { color: ink, fontWeight: '700', fontSize: 13, textAlign: 'right' },
  filters: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  filter: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#F3F6FA' },
  filterOn: { backgroundColor: '#102848' },
  filterTxt: { color: muted, fontSize: 13 },
  filterTxtOn: { color: '#fff', fontWeight: '700' },
  period: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line },
  periodName: { color: ink, fontWeight: '700' },
  periodMeta: { color: muted, fontSize: 12 },
  periodDays: { color: ink, fontWeight: '700', width: 48, textAlign: 'right' },
  periodStatus: { color: muted, width: 88, textAlign: 'right', fontSize: 12 },
  tableHead: { flexDirection: 'row', paddingBottom: 6 },
  tableRow: { flexDirection: 'row', alignItems: 'center', borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line, paddingVertical: 8 },
  colGrow: { flex: 1, minWidth: 0 },
  colDays: { width: 72, textAlign: 'right' },
  colStatus: { width: 100, textAlign: 'right' },
});
