import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatTimer, shiftMonthKey } from '../../src/hr/billable';
import { formatNbDate, localIsoDate } from '../../src/hr/model';
import {
  ACCENT, IconDisc, Pill, Ring, Segmented, gridItem, gridStyle, tint,
} from './HrDashParts';

const PANEL_LIST = 8;

const webShadow = Platform.OS === 'web'
  ? { boxShadow: '0 6px 18px rgba(20, 36, 64, 0.06)' }
  : {};

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

export function caseLook(title) {
  const t = String(title || '').toLowerCase();
  if (t.includes('bursdag')) return { icon: 'gift-outline', accent: ACCENT.rose };
  if (t.includes('jubileum')) return { icon: 'ribbon-outline', accent: ACCENT.green };
  if (t.includes('avtale')) return { icon: 'document-text-outline', accent: ACCENT.amber };
  return { icon: 'flag-outline', accent: ACCENT.violet };
}

/** Ikon, tekst, dato og handling for en sak, oppgave eller samtale. */
export function followRowProps(kind, row, {
  nameOf, onOpenCase, onOpenPerson, onOpenFollowUp,
}) {
  const who = nameOf(row.employeeId) || 'Uten person';
  if (kind === 'cases') {
    const taskBit = row.assigneeName
      ? `oppgave til ${row.assigneeName}`
      : (row.taskId ? 'oppgave opprettet' : '');
    return {
      ...caseLook(row.title),
      title: row.title,
      subtitle: taskBit ? `${who} · ${taskBit}` : who,
      date: row.dueDate,
      onPress: () => (onOpenCase ? onOpenCase(row) : onOpenFollowUp?.()),
    };
  }
  const onPress = () => (row.employeeId ? onOpenPerson(row.employeeId, 'oppfolging') : onOpenFollowUp?.());
  if (kind === 'reviews') {
    return {
      icon: 'chatbubbles-outline', accent: ACCENT.blue, title: 'Medarbeidersamtale', subtitle: who, date: row.date, onPress,
    };
  }
  return {
    icon: 'checkbox-outline', accent: ACCENT.teal, title: row.title, subtitle: who, date: row.dueDate, onPress,
  };
}

export function FollowRow({
  colors, icon, accent, title, subtitle, date, onPress, divider, nativeID,
}) {
  const late = date && date < localIsoDate();
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.followRow, divider && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}
    >
      <IconDisc icon={icon} accent={accent} size={36} iconSize={17} />
      <View style={styles.flexText}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: colors.ink }]}>{title}</Text>
        {subtitle ? <Text numberOfLines={1} style={[styles.rowSub, { color: colors.muted }]}>{subtitle}</Text> : null}
      </View>
      {date ? (
        <Text style={[styles.rowMeta, { color: late ? ACCENT.red : colors.muted }]}>
          {late ? `Forfalt ${formatNbDate(date)}` : formatNbDate(date)}
        </Text>
      ) : null}
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

function PanelFrame({
  colors, nativeID, icon, accent, title, subtitle, onClose, children,
}) {
  return (
    <View nativeID={nativeID} style={[styles.panel, { backgroundColor: colors.card, borderColor: tint(accent, 0.45) }]}>
      <View style={styles.panelHead}>
        <IconDisc icon={icon} accent={accent} size={36} iconSize={17} />
        <View style={styles.flexText}>
          <Text style={[styles.panelTitle, { color: colors.ink }]}>{title}</Text>
          {subtitle ? <Text style={[styles.rowSub, { color: colors.muted }]}>{subtitle}</Text> : null}
        </View>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Lukk" hitSlop={8} style={styles.close}>
          <Ionicons name="close" size={18} color={colors.muted} />
        </Pressable>
      </View>
      {children}
    </View>
  );
}

function PanelLink({ colors, label, onPress }) {
  if (!onPress) return null;
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.link}>
      <Text style={[styles.linkText, { color: colors.brand }]}>{label}</Text>
      <Ionicons name="chevron-forward" size={14} color={colors.brand} />
    </Pressable>
  );
}

const FOLLOW_GROUPS = [
  { id: 'cases', label: 'Saker' },
  { id: 'tasks', label: 'Oppgaver' },
  { id: 'reviews', label: 'Planlagte samtaler' },
];

/** Åpne saker for egne ansatte, med vei rett inn i hver sak. */
export function CasesPanel({
  colors, follow, nameOf, onOpenCase, onOpenPerson, onOpenFollowUp, onClose,
}) {
  const groups = FOLLOW_GROUPS.filter((group) => follow[group.id].length);
  const handlers = {
    nameOf, onOpenCase, onOpenPerson, onOpenFollowUp,
  };
  return (
    <PanelFrame
      colors={colors}
      nativeID="hr-cases-panel"
      icon="document-text-outline"
      accent={ACCENT.violet}
      title="Åpne HR-saker"
      subtitle="Trykk på en sak for å gå rett til den hos den ansatte."
      onClose={onClose}
    >
      {groups.length ? groups.map((group) => {
        const rows = follow[group.id];
        return (
          <View key={group.id}>
            {groups.length > 1 ? (
              <Text style={[styles.groupLabel, { color: colors.muted }]}>{`${group.label} · ${rows.length}`}</Text>
            ) : null}
            {rows.slice(0, PANEL_LIST).map((row, index) => (
              <FollowRow
                key={row.id}
                colors={colors}
                divider={index > 0}
                nativeID={group.id === 'cases' ? `hr-open-case-${row.id}` : undefined}
                {...followRowProps(group.id, row, handlers)}
              />
            ))}
            {rows.length > PANEL_LIST ? (
              <PanelLink colors={colors} label={`Se alle ${rows.length} i Oppfølging`} onPress={onOpenFollowUp} />
            ) : null}
          </View>
        );
      }) : (
        <View style={[styles.empty, { backgroundColor: tint(ACCENT.slate, 0.06) }]}>
          <Ionicons name="checkmark-done-outline" size={18} color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>Ingen åpne saker, oppgaver eller samtaler for egne ansatte.</Text>
        </View>
      )}
      <PanelLink colors={colors} label="Gå til Oppfølging" onPress={onOpenFollowUp} />
    </PanelFrame>
  );
}

function StackBar({ parts, height = 10 }) {
  return (
    <View style={[styles.stackBar, { height, borderRadius: height / 2, backgroundColor: tint(ACCENT.slate, 0.1) }]}>
      {parts.filter((part) => part.hours > 0).map((part) => (
        <View key={part.id} style={{ flexGrow: part.hours, flexShrink: 1, flexBasis: 0, backgroundColor: part.fill }} />
      ))}
    </View>
  );
}

function timeParts(row) {
  return [
    { id: 'billable', label: 'Fakturerbart', hours: row.billable, fill: ACCENT.green },
    { id: 'nonBillable', label: 'Ikke fakturerbart', hours: row.nonBillable, fill: ACCENT.amber },
    { id: 'absence', label: 'Fravær', hours: row.absence, fill: ACCENT.violet },
    { id: 'unlogged', label: 'Ikke ført', hours: row.unlogged, fill: tint(ACCENT.slate, 0.35) },
  ];
}

function pctText(pct) {
  return pct == null ? '–' : `${Math.round(pct)} %`;
}

function pctAccent(pct) {
  if (pct >= 75) return ACCENT.green;
  if (pct >= 50) return ACCENT.amber;
  return ACCENT.slate;
}

function StepButton({
  colors, icon, label, disabled, onPress,
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={[styles.step, { borderColor: colors.line, opacity: disabled ? 0.35 : 1 }]}
    >
      <Ionicons name={icon} size={16} color={colors.ink} />
    </Pressable>
  );
}

/**
 * Fakturerbar tid for valgt måned: mulig tid, hva som trekker ned,
 * og hver ansatt for seg. Blas måned for måned, inneværende og forrige som hurtigvalg.
 */
export function BillablePanel({
  colors, result, loading, month, todayMonth, onMonth, onOpenPerson, onOpenProductivity, onClose,
}) {
  const [showAll, setShowAll] = useState(false);
  const parts = timeParts(result);
  const notes = {
    billable: `${pctText(result.pct)} av mulig tid`,
    nonBillable: result.ownCompany ? `Herav ${formatTimer(result.ownCompany)} på eget selskap` : 'Intern tid og eget selskap',
    absence: 'Ferie, sykdom og permisjon',
    unlogged: 'Mulig tid uten timer',
  };
  const equation = [
    `Mulig ${formatTimer(result.capacity)}`,
    `− fravær ${formatTimer(result.absence)}`,
    `− ikke fakturerbart ${formatTimer(result.nonBillable)}`,
    `− ikke ført ${formatTimer(result.unlogged)}`,
    result.over ? `+ ${formatTimer(result.over)} utover mulig tid` : '',
    `= ${formatTimer(result.billable)} fakturerbart`,
  ].filter(Boolean).join(' ');
  const rows = showAll ? result.rows : result.rows.slice(0, PANEL_LIST);
  return (
    <PanelFrame
      colors={colors}
      nativeID="hr-billable-panel"
      icon="time-outline"
      accent={ACCENT.green}
      title="Fakturerbar tid"
      subtitle="Egne ansatte. Mulig tid er stillingsprosent × arbeidsdagene i måneden, uten helg og helligdager."
      onClose={onClose}
    >
      <View style={styles.monthBar}>
        <View style={styles.stepper} nativeID="hr-billable-month">
          <StepButton colors={colors} icon="chevron-back" label="Forrige måned" onPress={() => onMonth(shiftMonthKey(month, -1))} />
          <Text style={[styles.monthLabel, { color: colors.ink }]}>
            {result.current ? `${result.label} · hittil` : result.label}
          </Text>
          <StepButton
            colors={colors}
            icon="chevron-forward"
            label="Neste måned"
            disabled={month >= todayMonth}
            onPress={() => onMonth(shiftMonthKey(month, 1))}
          />
        </View>
        <Segmented
          colors={colors}
          compact
          nativeID="hr-billable-quick"
          value={month}
          onChange={onMonth}
          options={[
            { id: todayMonth, label: 'Denne måneden' },
            { id: shiftMonthKey(todayMonth, -1), label: 'Forrige måned' },
          ]}
        />
      </View>

      {loading ? (
        <Text style={[styles.rowSub, { color: colors.muted }]}>Henter timer og fravær …</Text>
      ) : null}
      {!loading && !(result.capacity > 0) ? (
        <View style={[styles.empty, { backgroundColor: tint(ACCENT.slate, 0.06) }]}>
          <Ionicons name="calendar-clear-outline" size={18} color={colors.muted} />
          <Text style={[styles.emptyText, { color: colors.muted }]}>
            Ingen mulig tid denne måneden. Egne ansatte trenger startdato før måneden er over.
          </Text>
        </View>
      ) : null}
      {!loading && result.capacity > 0 ? (
        <>
          <View style={styles.billTop}>
            <Ring
              pct={result.pct || 0}
              size={64}
              stroke={7}
              color={ACCENT.green}
              label={`${Math.round(result.pct || 0)}%`}
              labelColor={colors.ink}
              labelSize={14}
            />
            <View style={styles.flexText}>
              <Text style={[styles.billHead, { color: colors.ink }]}>
                {`${formatTimer(result.billable)} fakturerbart av ${formatTimer(result.capacity)} mulig`}
              </Text>
              <Text style={[styles.rowSub, { color: colors.muted }]} nativeID="hr-billable-equation">{equation}</Text>
            </View>
          </View>
          <StackBar parts={parts} />
          <View style={gridStyle(4, 140, 10)} nativeID="hr-billable-parts">
            {parts.map((part) => (
              <View key={part.id} style={[gridItem(140), styles.legend]}>
                <View style={styles.legendHead}>
                  <View style={[styles.dot, { backgroundColor: part.fill }]} />
                  <Text style={[styles.legendLabel, { color: colors.muted }]} numberOfLines={1}>{part.label}</Text>
                </View>
                <Text style={[styles.legendValue, { color: colors.ink }]}>{formatTimer(part.hours)}</Text>
                <Text style={[styles.legendNote, { color: colors.muted }]} numberOfLines={2}>{notes[part.id]}</Text>
              </View>
            ))}
          </View>

          <View nativeID="hr-billable-people">
            {rows.map((row, index) => (
              <Pressable
                key={row.id}
                onPress={() => onOpenPerson(row.id)}
                accessibilityRole="button"
                accessibilityLabel={`${row.name}: ${formatTimer(row.billable)} fakturerbart, ${pctText(row.pct)}`}
                style={[styles.person, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line }]}
              >
                <View style={styles.personHead}>
                  <Text numberOfLines={1} style={[styles.rowTitle, styles.flexText, { color: colors.ink }]}>{row.name}</Text>
                  <Text style={[styles.personHours, { color: colors.ink }]}>{formatTimer(row.billable)}</Text>
                  <Pill label={pctText(row.pct)} accent={pctAccent(row.pct)} />
                </View>
                <Text numberOfLines={2} style={[styles.rowSub, { color: colors.muted }]}>
                  {[
                    `${row.workPercent} % stilling`,
                    row.capacity ? `mulig ${formatTimer(row.capacity)}` : 'timer utenfor ansettelsesperioden',
                    row.absence ? `fravær ${formatTimer(row.absence)}` : '',
                    row.nonBillable ? `ikke fakturerbart ${formatTimer(row.nonBillable)}` : '',
                    row.unlogged ? `ikke ført ${formatTimer(row.unlogged)}` : '',
                  ].filter(Boolean).join(' · ')}
                </Text>
                <StackBar parts={timeParts(row)} height={5} />
              </Pressable>
            ))}
          </View>
          {result.rows.length > PANEL_LIST ? (
            <Pressable onPress={() => setShowAll((v) => !v)} accessibilityRole="button" style={styles.link}>
              <Text style={[styles.linkText, { color: colors.brand }]}>
                {showAll ? 'Vis færre' : `Vis alle ${result.rows.length}`}
              </Text>
              <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={14} color={colors.brand} />
            </Pressable>
          ) : null}
        </>
      ) : null}
      <PanelLink colors={colors} label="Åpne Produktivitet" onPress={onOpenProductivity} />
    </PanelFrame>
  );
}

const styles = StyleSheet.create({
  flexText: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 14, fontWeight: '500' },
  rowSub: { fontSize: 12, lineHeight: 17, marginTop: 1 },
  rowMeta: { fontSize: 12 },
  followRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
  },
  panel: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    ...webShadow,
  },
  panelHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  panelTitle: { fontSize: 16, fontWeight: '500' },
  close: { padding: 4 },
  groupLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 4 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', paddingVertical: 2 },
  linkText: { fontSize: 13, fontWeight: '500' },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    padding: 12,
  },
  emptyText: { fontSize: 13, lineHeight: 18, flex: 1 },
  monthBar: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10,
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  step: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthLabel: { fontSize: 15, minWidth: 150, textAlign: 'center' },
  billTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  billHead: { fontSize: 15 },
  stackBar: { flexDirection: 'row', width: '100%', overflow: 'hidden' },
  legend: { gap: 2 },
  legendHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendLabel: { fontSize: 12, flexShrink: 1 },
  legendValue: { fontSize: 18, fontWeight: '500' },
  legendNote: { fontSize: 11, lineHeight: 15 },
  person: { gap: 4, paddingVertical: 9 },
  personHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personHours: { fontSize: 13 },
});
