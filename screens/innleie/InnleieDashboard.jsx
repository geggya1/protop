import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { assignmentTimeline, innleieDashboard } from '../../src/innleie/dashboard';
import { durationLabel } from '../../src/innleie/followUp';
import { formatNbDate } from '../../src/hr/model';
import { displayName } from '../../src/employees/model';
import { radius, type } from '../../src/ui/tokens';
import {
  ACCENT, Avatar, Bar, DashCard, KpiTile, MoreToggle, Pill, Ring, SectionLabel, gridItem, gridStyle, tint,
} from '../hr/HrDashParts';
import { TRIVSEL_LOOK } from './InnleieFollowUp';

function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}

function period(row) {
  if (row.fromDate === row.toDate) return formatNbDate(row.fromDate);
  return `${formatNbDate(row.fromDate)}–${formatNbDate(row.toDate)}`;
}

function year(iso) {
  return String(iso || '').slice(0, 4);
}

/**
 * Oversikt over innleide og eksterne: hvor mange, hva som mangler av lovkrav, trivsel,
 * varighet på oppdragene, leverandørene, hvem som er borte, HMS-kort og innleie som slutter.
 */
export default function InnleieDashboard({
  colors, employees, hr, notices, onOpenPerson, onOpenPeople, onOpenFollowUp, onOpenSuppliers,
}) {
  const dash = useMemo(() => innleieDashboard(employees, hr, { notices }), [employees, hr, notices]);
  const timeline = useMemo(() => assignmentTimeline(dash.durations), [dash.durations]);
  const fu = dash.followUp;
  const sup = dash.suppliers;
  const maxSupplier = Math.max(1, ...dash.bySupplier.map((row) => row.count));
  const innleidPct = dash.total ? (dash.innleid / dash.total) * 100 : 0;
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
            accent={fu.avg && fu.avg < 3 ? ACCENT.amber : ACCENT.green}
            ringPct={fu.avg ? (fu.avg / 5) * 100 : 0}
            label="Trivsel"
            value={fu.avg ? `${String(fu.avg).replace('.', ',')} av 5` : '–'}
            hint={fu.dueTrivsel.length ? `${plural(fu.dueTrivsel.length, 'person', 'personer')} venter på måling` : (fu.scored ? 'Alle er målt siste 30 dager' : 'Ingen målinger ennå')}
            onPress={() => onOpenFollowUp?.()}
            nativeID="innleie-kpi-trivsel"
          />
        </View>
      </View>

      <View style={gridStyle(2, 300, 12)}>
        <View style={gridItem(300)}>
          <DashCard
            colors={colors}
            icon="git-commit-outline"
            title="Varighet på oppdrag"
            subtitle="Fra start til i dag. Lys del er avtalt tid som gjenstår. Rød strek er tre år for innleide."
            badge={dash.tenureWarnings.length || null}
            badgeAccent={ACCENT.amber}
            nativeID="innleie-duration"
          >
            {timeline.rows.length ? (
              <View style={styles.timeline}>
                {timeline.rows.map((row) => (
                  <Pressable key={row.id} onPress={() => onOpenPerson?.(row.id)} accessibilityRole="button" accessibilityLabel={`${row.name}, ${durationLabel(row.months)}`} style={styles.tlRow}>
                    <Text numberOfLines={1} style={[styles.tlName, { color: colors.ink }]}>{row.name}</Text>
                    <View style={[styles.tlTrack, { backgroundColor: tint(ACCENT.slate, 0.08) }]}>
                      <View style={[styles.tlBar, { left: `${row.left}%`, width: `${row.width}%`, backgroundColor: barColor(row) }]} />
                      {row.future ? (
                        <View style={[styles.tlBar, { left: `${row.left + row.width}%`, width: `${row.future}%`, backgroundColor: tint(kindColor(row), 0.3) }]} />
                      ) : null}
                      {row.threeYearPct != null ? <View style={[styles.tlMark, { left: `${row.threeYearPct}%`, backgroundColor: ACCENT.red }]} /> : null}
                      <View style={[styles.tlToday, { left: `${timeline.todayPct}%`, backgroundColor: colors.ink }]} />
                    </View>
                    <Text style={[styles.tlMeta, { color: levelColor(row, colors) }]} numberOfLines={1}>
                      {durationLabel(row.months)}
                    </Text>
                  </Pressable>
                ))}
                <View style={styles.tlAxis}>
                  <Text style={[styles.caption, { color: colors.muted }]}>{year(timeline.start)}</Text>
                  <Text style={[styles.caption, { color: colors.muted }]}>{year(timeline.end)}</Text>
                </View>
                {dash.tenureWarnings.length ? (
                  <View style={[styles.note, { backgroundColor: tint(ACCENT.amber, 0.1) }]}>
                    <Ionicons name="information-circle-outline" size={18} color={ACCENT.amber} />
                    <Text style={[styles.caption, { color: colors.ink, flex: 1 }]}>
                      {`${plural(dash.tenureWarnings.length, 'innleid nærmer', 'innleide nærmer')} seg eller har passert tre år. Etter tre års sammenhengende innleie fra bemanningsforetak har den innleide rett til fast ansettelse hos dere.`}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Empty colors={colors} icon="calendar-outline" text="Ingen har startdato. Legg inn «Fra» i perioden på personen, så vises varigheten her." />
            )}
          </DashCard>
        </View>

        <View style={gridItem(300)}>
          <DashCard
            colors={colors}
            icon="pie-chart-outline"
            title="Hvem som er her"
            subtitle="Innleid fra bemanningsforetak og eksterne, og hvilket firma de kommer fra."
            actionLabel="Leverandører"
            onAction={onOpenSuppliers}
            nativeID="innleie-mix"
          >
            <View style={styles.mixBar}>
              {dash.innleid ? <View style={[styles.mixPart, { flex: dash.innleid, backgroundColor: ACCENT.blue }]} /> : null}
              {dash.ekstern ? <View style={[styles.mixPart, { flex: dash.ekstern, backgroundColor: ACCENT.teal }]} /> : null}
            </View>
            <View style={styles.legend}>
              <Legend colors={colors} color={ACCENT.blue} label={`Innleid ${dash.innleid}`} />
              <Legend colors={colors} color={ACCENT.teal} label={`Ekstern ${dash.ekstern}`} />
              <Text style={[styles.caption, { color: colors.muted }]}>{`${Math.round(innleidPct)} % innleid`}</Text>
            </View>
            {dash.bySupplier.slice(0, 5).map((row) => (
              <View key={row.name} style={styles.gap}>
                <View style={styles.gapHead}>
                  <Text numberOfLines={1} style={[styles.name, { color: row.linked ? colors.ink : colors.muted, flex: 1 }]}>{row.name}</Text>
                  <Text style={[styles.count, { color: colors.ink }]}>{row.count}</Text>
                </View>
                <Bar ratio={row.count / maxSupplier} accent={row.linked ? ACCENT.violet : ACCENT.slate} height={5} />
              </View>
            ))}
            <Pressable onPress={onOpenSuppliers} accessibilityRole="button" style={[styles.supRow, { borderColor: colors.line }]} nativeID="innleie-supplier-status">
              <Ring pct={sup.pct} size={40} stroke={5} color={supColor(sup)} label={sup.count ? `${sup.pct}%` : '–'} labelColor={colors.ink} labelSize={10} />
              <View style={styles.lineText}>
                <Text style={[styles.name, { color: colors.ink }]}>Leverandørkontroll</Text>
                <Text style={[styles.caption, { color: colors.muted }]}>
                  {supText(sup)}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          </DashCard>
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

      {dash.hms.length || dash.endingSoon.length || fu.dueTrivsel.length || fu.dueExit.length ? (
        <View style={gridStyle(3, 280, 12)}>
          {fu.dueTrivsel.length || fu.dueExit.length ? (
            <View style={gridItem(280)}>
              <DashCard colors={colors} icon="happy-outline" title="Oppfølging" subtitle="Trivsel som venter, og avslutninger som ikke er ferdige." actionLabel="Alle" onAction={() => onOpenFollowUp?.()} nativeID="innleie-followup-card">
                {[...fu.dueExit, ...fu.dueTrivsel].slice(0, 5).map((row) => {
                  const last = row.trivsel?.score;
                  return (
                    <Pressable key={row.employeeId} onPress={() => onOpenFollowUp?.(row.employeeId)} style={styles.line} accessibilityRole="button">
                      <Ionicons name={last ? TRIVSEL_LOOK[last].icon : 'help-circle-outline'} size={22} color={last ? TRIVSEL_LOOK[last].color : colors.muted} />
                      <View style={styles.lineText}>
                        <Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>{displayName(row.employee)}</Text>
                        <Text style={[styles.caption, { color: colors.muted }]}>{row.due === 'avslutning' ? `Avslutning ${row.exitProgress.done} av ${row.exitProgress.total}` : (last ? `Sist ${last} av 5` : 'Ikke målt')}</Text>
                      </View>
                      <Pill label={row.due === 'avslutning' ? 'Avslutning' : 'Trivsel'} accent={row.due === 'avslutning' ? ACCENT.red : ACCENT.amber} />
                    </Pressable>
                  );
                })}
              </DashCard>
            </View>
          ) : null}
          {dash.hms.length ? (
            <View style={gridItem(280)}>
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
            <View style={gridItem(280)}>
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

function kindColor(row) {
  return row.kindLabel === 'Innleid' ? ACCENT.blue : ACCENT.teal;
}

function barColor(row) {
  if (row.level === 'over') return ACCENT.red;
  if (row.level === 'watch') return ACCENT.amber;
  return kindColor(row);
}

function levelColor(row, colors) {
  if (row.level === 'over') return ACCENT.red;
  if (row.level === 'watch') return ACCENT.amber;
  return colors.muted;
}

function supColor(sup) {
  if (sup.withLawGaps) return ACCENT.red;
  return sup.pct < 100 ? ACCENT.amber : ACCENT.green;
}

function supText(sup) {
  if (!sup.count) return 'Ingen leverandører registrert ennå';
  if (sup.withLawGaps) return `${plural(sup.withLawGaps, 'firma', 'firma')} mangler lovkrav`;
  return `${plural(sup.count, 'firma', 'firma')}, lovkravene er på plass`;
}

function Legend({ colors, color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.caption, { color: colors.ink }]}>{label}</Text>
    </View>
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
  timeline: { gap: 6 },
  tlRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30 },
  tlName: { ...type.caption, width: 110 },
  tlTrack: { flex: 1, height: 12, borderRadius: radius.pill, position: 'relative', overflow: 'hidden' },
  tlBar: { position: 'absolute', top: 0, bottom: 0, borderRadius: radius.pill },
  tlMark: { position: 'absolute', top: 0, bottom: 0, width: 2 },
  tlToday: { position: 'absolute', top: 0, bottom: 0, width: 1, opacity: 0.45 },
  tlMeta: { ...type.caption, width: 74, textAlign: 'right' },
  tlAxis: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 120, paddingRight: 84 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, borderRadius: radius.card, padding: 10, marginTop: 4 },
  mixBar: { flexDirection: 'row', height: 14, borderRadius: radius.pill, overflow: 'hidden', gap: 2 },
  mixPart: { height: 14 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: radius.pill },
  supRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, paddingTop: 10, marginTop: 4 },
});
