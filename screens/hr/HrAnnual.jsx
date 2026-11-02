import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  HR_ANNUAL_ONGOING, MONTHS_NB, annualSummary, hrAnnualWheel, normalizeAnnualSettings, reviewFormsFromFilled,
  reviewProgress, toggleAnnualDone, toggleAnnualOff, wheelLayout,
} from '../../src/hr/annualWheel';
import { loadFilledDocs, peekFilledDocs } from '../../src/forms/filledStore';
import { formatNbDate } from '../../src/hr/model';
import { toneColor } from '../../src/hr/uiHelpers';
import { EmptyHint, HrButton, HrCard, HrChip, HrSectionTitle } from './HrShared';
import { radius, space, type } from '../../src/ui/tokens';
import { useLayout } from '../../src/theme';
import { chartColorsFor } from '../../src/ui/chartColors';
import HrAnnualWheel from './HrAnnualWheel';
import HrAnnualTimeline, { StatusLegend } from './HrAnnualTimeline';

/** ISO-sidene som fører det samme, når bedriften har ISO / K-HMS. */
const ISO_LABEL = {
  hms: 'Åpne ISO › HMS',
  ledelse: 'Åpne ISO › Ledelsens gjennomgang',
};

const STATUS = {
  done: { label: 'Gjort', tone: 'good', icon: 'checkmark-circle' },
  now: { label: 'Denne måneden', tone: 'warn', icon: 'time' },
  late: { label: 'Ikke krysset av', tone: 'bad', icon: 'alert-circle' },
  later: { label: 'Senere', tone: 'muted', icon: 'ellipse-outline' },
  off: { label: 'Slått av', tone: 'muted', icon: 'remove-circle-outline' },
  na: { label: 'Gjelder ikke etter antall ansatte', tone: 'muted', icon: 'remove-circle-outline' },
};

const PAGE_LABEL = {
  oppfolging: 'Åpne Samtaler og saker',
  sykefravaer: 'Åpne Sykefravær',
  undersokelse: 'Åpne Medarbeiderundersøkelse',
  lonn: 'Åpne Lønn',
  compliance: 'Åpne Lovpålagt',
  avtaler: 'Åpne Avtaler',
  handbok: 'Åpne Personalhåndbok',
  fravaer: 'Åpne ferieplanen',
};

function ActivityRow({ colors, item, year, canWrite, onToggleDone, onToggleOff, onOpen, onOpenIso }) {
  const [open, setOpen] = useState(false);
  const { activity, status, done, auto, period } = item;
  const st = STATUS[status] || STATUS.later;
  const muted = status === 'off' || status === 'na';
  return (
    <View style={[styles.activity, { borderColor: colors.line, opacity: muted ? 0.65 : 1 }]} nativeID={`hr-annual-${activity.id}`}>
      <Pressable onPress={() => setOpen((v) => !v)} style={styles.activityHead} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Ionicons name={st.icon} size={18} color={toneColor(st.tone, colors)} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.activityTitle, { color: colors.ink }]}>{activity.title}</Text>
          <Text style={[styles.small, { color: colors.muted }]}>
            {[
              activity.kind === 'lov' ? 'Lovkrav' : 'Anbefalt',
              period,
              st.label,
              done?.at ? formatNbDate(done.at) : '',
              auto?.label || '',
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
      </Pressable>
      {open ? (
        <View style={styles.activityBody}>
          <Text style={[styles.body, { color: colors.ink }]}>{activity.description}</Text>
          {activity.law ? <Text style={[styles.small, { color: colors.muted }]}>{`Grunnlag: ${activity.law}`}</Text> : null}
          {activity.note ? <Text style={[styles.small, { color: colors.muted }]}>{activity.note}</Text> : null}
          {activity.outside ? <Text style={[styles.small, { color: colors.muted }]}>Gjøres utenfor ProTop.</Text> : null}
          <View style={styles.actions}>
            {canWrite && status !== 'off' && status !== 'na' ? (
              <HrChip
                colors={colors}
                label={done ? `Gjort i ${year} ✓` : `Marker gjort i ${year}`}
                active={!!done}
                onPress={() => onToggleDone(activity.id)}
                nativeID={`hr-annual-${activity.id}-done`}
              />
            ) : null}
            {canWrite ? (
              <HrChip
                colors={colors}
                label={status === 'off' ? 'Slå på igjen' : 'Gjelder ikke oss'}
                active={status === 'off'}
                onPress={() => onToggleOff(activity.id)}
              />
            ) : null}
            {activity.page && PAGE_LABEL[activity.page] ? (
              <HrButton colors={colors} icon="arrow-forward" label={PAGE_LABEL[activity.page]} onPress={() => onOpen(activity.page)} />
            ) : null}
            {activity.iso && onOpenIso ? (
              <HrButton colors={colors} icon="shield-checkmark" label={ISO_LABEL[activity.iso]} onPress={() => onOpenIso(activity.iso)} />
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

/** Tall med forklaring, og en strek som viser andelen (gjort av alle). */
function Kpi({ colors, label, value, hint, share = null, nativeID }) {
  const chart = chartColorsFor(colors);
  return (
    <View style={[styles.kpi, { borderColor: colors.line, backgroundColor: colors.bg }]} nativeID={nativeID}>
      <Text style={[styles.kpiLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.kpiValue, { color: colors.ink }]}>{value}</Text>
      {share != null ? (
        <View style={[styles.meter, { backgroundColor: chart.barTrack }]}>
          <View style={[styles.meterFill, { width: `${Math.round(share * 100)}%`, backgroundColor: chart.done }]} />
        </View>
      ) : null}
      {hint ? <Text style={[styles.small, { color: colors.muted }]}>{hint}</Text> : null}
    </View>
  );
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

/**
 * HR → Rutiner → Årshjul: det grafiske hjulet med valgt måned ved siden av, og hele året som
 * tidslinje under. Fristene ved sykefravær og medarbeiderundersøkelsen er egne sider under
 * Oppfølging, og aktivitetene lenker dit.
 * onOpenIso: finnes når personen ser ISO, så HMS-aktivitetene føres der og ikke to steder.
 */
export default function HrAnnual({
  colors, hr, canWrite, onPatch, familyId, actorName, staff = [], onOpen, onOpenIso, onRefreshTasks, today = new Date(),
}) {
  const { isPhone, width } = useLayout();
  const thisYear = today.getFullYear();
  const [year, setYear] = useState(thisYear);
  const [month, setMonth] = useState(today.getMonth());
  const settings = normalizeAnnualSettings(hr?.annual);
  // Medarbeidersamtaler kan også være ført som KS-skjema under Skjemaer.
  const [filled, setFilled] = useState(() => peekFilledDocs(familyId) || []);
  useEffect(() => {
    let live = true;
    if (familyId) loadFilledDocs(familyId).then((rows) => { if (live) setFilled(rows || []); }).catch(() => {});
    return () => { live = false; };
  }, [familyId]);

  const extra = useMemo(() => {
    const out = {};
    const reviews = reviewProgress(hr?.reviews, staff.map((e) => e.id), year, reviewFormsFromFilled(filled));
    if (reviews) out.medarbeidersamtaler = reviews;
    return out;
  }, [hr?.reviews, staff, year, filled]);

  const wheel = useMemo(
    () => hrAnnualWheel(settings, { year, today, staffCount: staff.length || null, extra }),
    // settings lages på nytt hver gang, men følger hr.annual.
    [hr?.annual, year, staff.length, extra, today],
  );
  const layout = useMemo(() => wheelLayout(wheel), [wheel]);
  const summary = annualSummary(wheel);
  const nowMonth = year === thisYear ? today.getMonth() : -1;
  const inMonth = layout.items.filter((i) => i.activity.months.includes(month));
  const wheelSize = isPhone ? Math.max(260, Math.min(340, width - 64)) : 340;

  const patchAnnual = (fn) => onPatch?.((state) => ({ annual: fn(state.annual) }));
  const toggleDone = (id) => patchAnnual((a) => toggleAnnualDone(a, year, id, { by: actorName || '' }));
  const toggleOff = (id) => patchAnnual((a) => toggleAnnualOff(a, id));
  const toggleTasks = () => {
    const turningOn = !settings.tasks;
    patchAnnual((a) => ({ ...normalizeAnnualSettings(a), tasks: !normalizeAnnualSettings(a).tasks }));
    if (turningOn) setTimeout(() => onRefreshTasks?.(), 600);
  };

  return (
    <View style={styles.page}>
      <HrCard colors={colors}>
        <View nativeID="hr-annual-wheel" style={styles.stack}>
          <HrSectionTitle
            colors={colors}
            title="Årshjul"
            subtitle={`Faste HR-oppgaver gjennom året, med lovhenvisning. Beregnet for ${staff.length} egne ansatte. Trykk en måned i hjulet.`}
          />
          <View style={styles.toolbar}>
            <View style={styles.actions}>
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
                <HrChip key={y} colors={colors} label={String(y)} active={year === y} onPress={() => setYear(y)} />
              ))}
            </View>
            {canWrite ? (
              <HrChip
                colors={colors}
                label={settings.tasks ? 'Lager oppgave når måneden starter ✓' : 'Lag oppgave når måneden starter'}
                active={settings.tasks}
                onPress={toggleTasks}
                nativeID="hr-annual-tasks"
              />
            ) : null}
          </View>
          <View style={[styles.hero, isPhone && styles.heroPhone]}>
            <View style={styles.wheelCol}>
              <HrAnnualWheel
                colors={colors}
                layout={layout}
                summary={summary}
                year={year}
                selectedMonth={month}
                onSelectMonth={setMonth}
                size={wheelSize}
                today={today}
              />
              <StatusLegend colors={colors} />
            </View>
            <View style={styles.detailCol}>
              <View style={styles.kpis}>
                <Kpi colors={colors} label="Gjort" value={`${summary.done} av ${summary.total}`} share={summary.total ? summary.done / summary.total : 0} nativeID="hr-annual-kpi-done" />
                <Kpi colors={colors} label="Denne måneden" value={String(summary.now)} hint="Står for tur nå" />
                <Kpi colors={colors} label="Ikke krysset av" value={String(summary.late)} hint="Perioden er passert" />
              </View>
              <View style={styles.monthChips} accessibilityRole="tablist">
                {MONTH_SHORT.map((m, i) => (
                  <HrChip key={m} colors={colors} label={m} active={month === i} onPress={() => setMonth(i)} nativeID={`hr-annual-month-${i}`} />
                ))}
              </View>
              <Text style={[styles.monthTitle, { color: colors.ink }]}>
                {`${MONTHS_NB[month]} ${year}${month === nowMonth ? ' · nå' : ''}`}
              </Text>
              {inMonth.length ? inMonth.map((item) => (
                <ActivityRow
                  key={item.activity.id}
                  colors={colors}
                  item={item}
                  year={year}
                  canWrite={canWrite}
                  onToggleDone={toggleDone}
                  onToggleOff={toggleOff}
                  onOpen={onOpen}
                  onOpenIso={onOpenIso}
                />
              )) : <EmptyHint colors={colors} text="Ingen faste HR-aktiviteter denne måneden." />}
            </View>
          </View>
        </View>
      </HrCard>

      <HrCard colors={colors}>
        <View style={styles.stack}>
          <HrSectionTitle colors={colors} title="Året i oversikt" subtitle="Hver aktivitet på én linje over månedene den gjelder. Trykk en linje for å åpne måneden over." />
          <StatusLegend colors={colors} />
          <HrAnnualTimeline colors={colors} layout={layout} nowMonth={nowMonth} selectedMonth={month} onSelectMonth={setMonth} compact={isPhone} />
        </View>
      </HrCard>

      <HrCard colors={colors}>
        <View style={styles.stack}>
          <HrSectionTitle colors={colors} title="Hele året" subtitle="Plikter uten fast måned." />
          <View style={[styles.ongoing, isPhone && styles.heroPhone]}>
            {HR_ANNUAL_ONGOING.map((row) => (
              <View key={row.id} style={[styles.ongoingItem, { borderColor: colors.line }]} nativeID={`hr-annual-ongoing-${row.id}`}>
                <Text style={[styles.activityTitle, { color: colors.ink }]}>{row.title}</Text>
                <Text style={[styles.body, { color: colors.ink }]}>{row.description}</Text>
                <Text style={[styles.small, { color: colors.muted }]}>{`Grunnlag: ${row.law}`}</Text>
                {row.page && PAGE_LABEL[row.page] ? (
                  <View style={styles.actions}>
                    <HrButton colors={colors} icon="arrow-forward" label={PAGE_LABEL[row.page]} onPress={() => onOpen(row.page)} />
                  </View>
                ) : null}
              </View>
            ))}
          </View>
          <Text style={[styles.small, { color: colors.muted }]}>
            Årshjulet er en hjelp, ikke juridisk rådgivning. Sjekk tariffavtale og egne rutiner, og følg med på lovendringer.
          </Text>
        </View>
      </HrCard>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.sm },
  stack: { gap: 10 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, alignItems: 'center', justifyContent: 'space-between' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  hero: { flexDirection: 'row', gap: space.lg, alignItems: 'flex-start' },
  heroPhone: { flexDirection: 'column', alignItems: 'stretch' },
  wheelCol: { alignItems: 'center', gap: space.sm },
  detailCol: { flex: 1, minWidth: 0, gap: space.xs },
  kpis: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  kpi: { flex: 1, minWidth: 140, borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 4 },
  kpiLabel: { ...type.caption },
  kpiValue: { ...type.h2 },
  meter: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: radius.pill },
  monthChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  monthTitle: { ...type.title, marginTop: 4 },
  ongoing: { flexDirection: 'row', gap: space.xs },
  ongoingItem: { flex: 1, borderWidth: 1, borderRadius: radius.control, padding: space.xs, gap: 6 },
  activity: { borderWidth: 1, borderRadius: radius.control, padding: space.xs, gap: 6 },
  activityHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activityTitle: { ...type.bodyStrong },
  activityBody: { gap: 6, paddingLeft: 26 },
  body: { ...type.label, fontWeight: '400' },
  small: { ...type.caption },
});
