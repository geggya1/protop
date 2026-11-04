import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { innleieDashboard } from '../../src/innleie/dashboard';
import { formatNbDate } from '../../src/hr/model';
import { radius, type } from '../../src/ui/tokens';
import {
  ACCENT, Avatar, Bar, DashCard, KpiTile, MoreToggle, Pill, SectionLabel, gridItem, gridStyle, tint,
} from '../hr/HrDashParts';

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function period(row) {
  if (row.fromDate === row.toDate) return formatNbDate(row.fromDate);
  return `${formatNbDate(row.fromDate)}–${formatNbDate(row.toDate)}`;
}

/**
 * Oversikt over innleide og eksterne: hvor mange, hva som mangler av lovkrav,
 * hvem som er borte, HMS-kort som går ut og innleie som slutter.
 */
export default function InnleieDashboard({
  colors, employees, hr, notices, onOpenPerson, onOpenPeople,
}) {
  const dash = useMemo(() => innleieDashboard(employees, hr, { notices }), [employees, hr, notices]);
  const maxGap = Math.max(1, ...dash.gaps.map((row) => row.count));
  const [showAllGaps, setShowAllGaps] = useState(false);

  if (!dash.total) {
    return (
      <View nativeID="innleie-dashboard" style={styles.page}>
        <DashCard colors={colors} icon="swap-horizontal-outline" title="Ingen innleide ennå">
          <Text style={[styles.body, { color: colors.muted }]}>
            Innleide fra bemanningsforetak og eksterne som konsulenter og underleverandører vises her når de er registrert under Ansatte med personelltype Innleid eller Ekstern.
          </Text>
        </DashCard>
      </View>
    );
  }

  return (
    <View nativeID="innleie-dashboard" style={styles.page}>
      {/* To og to på telefon, fire på rad på PC. */}
      <View style={gridStyle(4, 150, 10)} nativeID="innleie-kpis">
        <View style={gridItem(150)}>
          <KpiTile
            colors={colors}
            icon="people-outline"
            accent={ACCENT.blue}
            label="Aktive innleide"
            value={String(dash.total)}
            hint={`${dash.innleid} innleid · ${dash.ekstern} ekstern`}
            onPress={() => onOpenPeople?.()}
            nativeID="innleie-kpi-total"
          />
        </View>
        <View style={gridItem(150)}>
          <KpiTile
            colors={colors}
            accent={dash.peopleWithGaps ? ACCENT.red : ACCENT.green}
            ringPct={dash.law.pct}
            label="Lovkrav på plass"
            value={`${dash.law.ok}/${dash.law.total}`}
            hint={dash.peopleWithGaps ? `${plural(dash.peopleWithGaps, 'person', 'personer')} mangler noe` : 'Alt er på plass'}
            onPress={() => onOpenPeople?.()}
            nativeID="innleie-kpi-law"
          />
        </View>
        <View style={gridItem(150)}>
          <KpiTile
            colors={colors}
            icon="calendar-clear-outline"
            accent={ACCENT.violet}
            label="Borte i dag"
            value={String(dash.awayToday.length)}
            hint={dash.away.length > dash.awayToday.length ? `${dash.away.length - dash.awayToday.length} til de neste 7 dagene` : 'Fra fraværsbeskjedene'}
            nativeID="innleie-kpi-away"
          />
        </View>
        <View style={gridItem(150)}>
          <KpiTile
            colors={colors}
            icon="card-outline"
            accent={dash.hms.length ? ACCENT.amber : ACCENT.teal}
            label="HMS-kort"
            value={dash.hms.length ? String(dash.hms.length) : 'OK'}
            hint={dash.hms.length ? 'Utløpt eller går ut innen 30 dager' : 'Ingen kort går ut snart'}
            nativeID="innleie-kpi-hms"
          />
        </View>
      </View>

      <View style={gridStyle(2, 300, 12)}>
        <View style={gridItem(300)}>
          <DashCard
            colors={colors}
            icon="calendar-outline"
            title="Borte"
            subtitle="I dag og de neste 7 dagene. Personen sender fraværsbeskjed. Sykefravær følges opp av arbeidsgiveren deres."
            nativeID="innleie-away"
          >
            {dash.away.length ? dash.away.map((row) => (
              <Pressable key={row.id} onPress={() => onOpenPerson?.(row.employeeId)} style={styles.line} accessibilityRole="button">
                <Avatar name={row.name} photoUrl={row.employee.person?.photoUrl} size={34} accent={ACCENT.violet} />
                <View style={styles.lineText}>
                  <Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>{row.name}</Text>
                  <Text numberOfLines={1} style={[styles.caption, { color: colors.muted }]}>
                    {[period(row), row.note].filter(Boolean).join(' · ')}
                  </Text>
                </View>
                <Pill label={row.today ? 'I dag' : `Om ${row.startsIn} d`} accent={row.today ? ACCENT.violet : ACCENT.slate} />
              </Pressable>
            )) : (
              <Empty colors={colors} icon="checkmark-circle-outline" text="Ingen har meldt fravær." />
            )}
          </DashCard>
        </View>

        <View style={gridItem(300)}>
          <DashCard
            colors={colors}
            icon="shield-checkmark-outline"
            title="Lovkrav som mangler"
            subtitle="Antall personer per krav. Trykk for å se hvem."
            badge={dash.peopleWithGaps || null}
            nativeID="innleie-gaps"
          >
            {dash.gaps.length ? dash.gaps.slice(0, showAllGaps ? undefined : 5).map((row) => (
              <Pressable key={row.id} onPress={() => onOpenPeople?.({ gap: row.id })} style={styles.gap} accessibilityRole="button">
                <View style={styles.gapHead}>
                  <Text numberOfLines={1} style={[styles.name, { color: colors.ink, flex: 1 }]}>{row.label}</Text>
                  <Text style={[styles.count, { color: ACCENT.red }]}>{row.count}</Text>
                </View>
                <Bar ratio={row.count / maxGap} accent={ACCENT.red} height={5} />
              </Pressable>
            )) : (
              <Empty colors={colors} icon="checkmark-circle-outline" text="Alle lovkrav er på plass." accent={ACCENT.green} />
            )}
            {dash.gaps.length > 5 ? (
              <MoreToggle colors={colors} expanded={showAllGaps} more={dash.gaps.length - 5} onPress={() => setShowAllGaps((v) => !v)} />
            ) : null}
          </DashCard>
        </View>
      </View>

      {dash.hms.length || dash.endingSoon.length ? (
        <View style={gridStyle(2, 300, 12)}>
          {dash.hms.length ? (
            <View style={gridItem(300)}>
              <DashCard colors={colors} icon="card-outline" title="HMS-kort som går ut" nativeID="innleie-hms">
                {dash.hms.map((row) => (
                  <Pressable key={row.employeeId} onPress={() => onOpenPerson?.(row.employeeId)} style={styles.line} accessibilityRole="button">
                    <Ionicons name={row.status === 'expired' ? 'alert-circle' : 'time-outline'} size={20} color={row.status === 'expired' ? ACCENT.red : ACCENT.amber} />
                    <View style={styles.lineText}>
                      <Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>{row.name}</Text>
                      <Text style={[styles.caption, { color: colors.muted }]}>{`${row.number} · ${row.text}`}</Text>
                    </View>
                  </Pressable>
                ))}
              </DashCard>
            </View>
          ) : null}
          {dash.endingSoon.length ? (
            <View style={gridItem(300)}>
              <DashCard colors={colors} icon="hourglass-outline" title="Innleie som slutter" subtitle="Sluttdato de neste 30 dagene." nativeID="innleie-ending">
                {dash.endingSoon.map((row) => (
                  <Pressable key={row.id} onPress={() => onOpenPerson?.(row.id)} style={styles.line} accessibilityRole="button">
                    <Avatar name={row.name} photoUrl={row.employee.person?.photoUrl} size={34} accent={ACCENT.slate} />
                    <View style={styles.lineText}>
                      <Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>{row.name}</Text>
                      <Text style={[styles.caption, { color: colors.muted }]}>{formatNbDate(row.endDate)}</Text>
                    </View>
                    <Pill label={row.endsIn === 0 ? 'I dag' : `${row.endsIn} d`} accent={ACCENT.amber} />
                  </Pressable>
                ))}
              </DashCard>
            </View>
          ) : null}
        </View>
      ) : null}

      <SectionLabel
        colors={colors}
        icon="people-outline"
        title="Innleide og eksterne"
        hint="Det som mangler, står først"
        right={(
          <Pressable onPress={() => onOpenPeople?.()} accessibilityRole="link" style={styles.link}>
            <Text style={[styles.caption, { color: colors.brand, fontWeight: '600' }]}>Alle</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </Pressable>
        )}
      />
      <View style={gridStyle(3, 240, 10)} nativeID="innleie-people">
        {dash.rows.slice(0, 9).map((row) => (
          <View key={row.id} style={gridItem(240)}>
            <PersonCard colors={colors} row={row} away={dash.awayToday.some((a) => a.employeeId === row.id)} onPress={() => onOpenPerson?.(row.id)} />
          </View>
        ))}
      </View>
    </View>
  );
}

/** Ett kort per person: navn, rolle, type og status for lovkravene. Brukes også i Personell. */
export function PersonCard({ colors, row, away = false, onPress }) {
  const missing = row.cells.summary.lawMissing;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      nativeID={`innleie-person-${row.id}`}
      style={[styles.person, { backgroundColor: colors.card, borderColor: missing ? tint(ACCENT.red, 0.35) : colors.line }]}
    >
      <Avatar name={row.name} photoUrl={row.employee.person?.photoUrl} size={40} accent={ACCENT.slate} square />
      <View style={styles.lineText}>
        <Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>{row.name}</Text>
        <Text numberOfLines={1} style={[styles.caption, { color: colors.muted }]}>
          {[row.kindLabel, row.title].filter(Boolean).join(' · ')}
        </Text>
        <View style={styles.pills}>
          {missing
            ? <Pill label={`${missing} lovkrav mangler`} accent={ACCENT.red} icon="alert-circle" />
            : <Pill label="Lovkrav OK" accent={ACCENT.green} icon="checkmark-circle" />}
          {away ? <Pill label="Borte i dag" accent={ACCENT.violet} icon="calendar-clear-outline" /> : null}
          {row.openCases ? <Pill label={plural(row.openCases, 'sak', 'saker')} accent={ACCENT.amber} icon="flag-outline" /> : null}
        </View>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </Pressable>
  );
}

function Empty({ colors, icon, text, accent }) {
  return (
    <View style={[styles.empty, { backgroundColor: tint(accent || ACCENT.slate, 0.07) }]}>
      <Ionicons name={icon} size={18} color={accent || colors.muted} />
      <Text style={[styles.caption, { color: colors.muted }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  body: { ...type.body },
  caption: { ...type.caption },
  name: { ...type.body, fontWeight: '500' },
  count: { ...type.bodyStrong },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  lineText: { flex: 1, minWidth: 0, gap: 2 },
  gap: { gap: 5, paddingVertical: 3 },
  gapHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: 32 },
  person: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.card, padding: 12,
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  empty: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.card, padding: 12,
  },
});
