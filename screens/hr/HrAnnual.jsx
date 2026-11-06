import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  HR_ANNUAL_ONGOING, MONTHS_NB, annualSummary, hrAnnualWheel, isoAnnualItems, normalizeAnnualSettings,
  reviewFormsFromFilled, reviewProgress, toggleAnnualDone, toggleAnnualOff, wheelLayout,
} from '../../src/hr/annualWheel';
import { annualWheel as isoAnnualWheel } from '../../src/iso/planning';
import { loadFilledDocs, peekFilledDocs } from '../../src/forms/filledStore';
import { formatNbDate } from '../../src/hr/model';
import { toneColor } from '../../src/hr/uiHelpers';
import { radius, space, type } from '../../src/ui/tokens';
import { useLayout } from '../../src/theme';
import { chartColorsFor } from '../../src/ui/chartColors';
import HrAnnualWheel from './HrAnnualWheel';
import HrAnnualTimeline, { StatusLegend } from './HrAnnualTimeline';
import { lazyScreen } from '../../src/ui/lazyScreen';
const EmptyHint = lazyScreen(() => import('./HrShared'), { name: 'EmptyHint', pick: 'EmptyHint', silent: true });
const HrButton = lazyScreen(() => import('./HrShared'), { name: 'HrButton', pick: 'HrButton', silent: true });
const HrCard = lazyScreen(() => import('./HrShared'), { name: 'HrCard', pick: 'HrCard', silent: true });
const HrChip = lazyScreen(() => import('./HrShared'), { name: 'HrChip', pick: 'HrChip', silent: true });
const HrSectionTitle = lazyScreen(() => import('./HrShared'), { name: 'HrSectionTitle', pick: 'HrSectionTitle', silent: true });

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

/** Rull fram til raden når den er valgt fra tidslinjen (web). */
function scrollToRow(nativeID) {
  setTimeout(() => {
    globalThis.document?.getElementById?.(nativeID)?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, 60);
}

function rowId(id) {
  return `hr-annual-${String(id).replace(/[^a-z0-9_-]/gi, '_')}`;
}

function ActivityRow({ colors, item, year, canWrite, onToggleDone, onToggleOff, onOpen, onOpenIso, focus = 0 }) {
  const [open, setOpen] = useState(false);
  // Valgt fra tidslinjen: åpne raden og rull dit (focus øker for hvert trykk).
  useEffect(() => {
    if (!focus) return;
    setOpen(true);
    scrollToRow(rowId(item.activity.id));
  }, [focus, item.activity.id]);
  const { activity, status, done, auto, period } = item;
  const st = STATUS[status] || STATUS.later;
  const muted = status === 'off' || status === 'na';
  return (
    <View
      style={[styles.activity, { borderColor: focus ? colors.brand || colors.ink : colors.line, opacity: muted ? 0.65 : 1 }]}
      nativeID={rowId(activity.id)}
    >
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

/** En aktivitet fra ISO-årshjulet i den samlede visningen. Føres i ISO, så bare lenke dit. */
function IsoRow({ colors, item, onOpenIso, focus = 0 }) {
  const chart = chartColorsFor(colors);
  const a = item.activity;
  useEffect(() => {
    if (focus) scrollToRow(rowId(a.id));
  }, [focus, a.id]);
  return (
    <View style={[styles.activity, { borderColor: focus ? colors.brand || colors.ink : colors.line }]} nativeID={rowId(a.id)}>
      <View style={styles.activityHead}>
        <View style={[styles.isoDot, { backgroundColor: chart.iso }]} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.activityTitle, { color: colors.ink }]}>{a.title}</Text>
          <Text style={[styles.small, { color: colors.muted }]}>
            {['ISO-årshjulet', item.period, a.responsible].filter(Boolean).join(' · ')}
          </Text>
        </View>
        {onOpenIso ? (
          <HrButton colors={colors} icon="shield-checkmark" label="Åpne i ISO" onPress={() => onOpenIso(a.page || 'arshjul')} />
        ) : null}
      </View>
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
  iso = null,
}) {
  const { isPhone, width } = useLayout();
  const thisYear = today.getFullYear();
  const [year, setYear] = useState(thisYear);
  const [month, setMonthState] = useState(today.getMonth());
  // Aktiviteten valgt i tidslinjen: { id, n }. n øker for hvert trykk, så samme rad kan velges igjen.
  const [picked, setPicked] = useState(null);
  const setMonth = (m) => { setMonthState(m); setPicked(null); };
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
  // Samlet visning: ISO-årshjulet i samme hjul og tidslinje (iso: { show, onToggle, status, state }).
  const isoItems = useMemo(
    () => (iso?.show && iso.status === 'ready' && iso.state ? isoAnnualItems(isoAnnualWheel(iso.state, { year })) : []),
    [iso?.show, iso?.status, iso?.state, year],
  );
  const layout = useMemo(() => wheelLayout(wheel, { extra: isoItems }), [wheel, isoItems]);
  const summary = annualSummary(wheel);
  const nowMonth = year === thisYear ? today.getMonth() : -1;
  const inMonth = layout.items.filter((i) => i.status !== 'iso' && i.activity.months.includes(month));
  const isoInMonth = layout.items.filter((i) => i.status === 'iso' && i.activity.months.includes(month));
  const wheelSize = isPhone ? Math.max(260, Math.min(340, width - 64)) : 340;

  const patchAnnual = (fn) => onPatch?.((state) => ({ annual: fn(state.annual) }));
  const toggleDone = (id) => patchAnnual((a) => toggleAnnualDone(a, year, id, { by: actorName || '' }));
  const toggleOff = (id) => patchAnnual((a) => toggleAnnualOff(a, id));
  // Fra tidslinjen: vis en måned aktiviteten gjelder (helst valgt måned, så inneværende), åpne den og rull dit.
  const pickActivity = (item) => {
    const months = item.activity.months || [item.start];
    const target = months.includes(month) ? month : months.includes(nowMonth) ? nowMonth : item.start;
    setMonthState(target);
    setPicked((p) => ({ id: item.activity.id, n: (p?.n || 0) + 1 }));
  };
  const focusOf = (id) => (picked?.id === id ? picked.n : 0);
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
            {iso?.available ? (
              <HrChip
                colors={colors}
                label={iso.show ? 'Viser også ISO-årshjulet ✓' : 'Vis også ISO-årshjulet'}
                active={!!iso.show}
                onPress={iso.onToggle}
                nativeID="hr-annual-iso"
              />
            ) : null}
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
              <StatusLegend colors={colors} withIso={!!iso?.show} />
              {iso?.show && iso.status === 'loading' ? <Text style={[styles.small, { color: colors.muted }]}>Henter ISO-årshjulet …</Text> : null}
              {iso?.show && iso.status === 'error' ? <Text style={[styles.small, { color: colors.muted }]}>Kunne ikke hente ISO-årshjulet.</Text> : null}
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
                  focus={focusOf(item.activity.id)}
                />
              )) : <EmptyHint colors={colors} text="Ingen faste HR-aktiviteter denne måneden." />}
              {isoInMonth.length ? (
                <View style={styles.stack} nativeID="hr-annual-iso-month">
                  <Text style={[styles.small, { color: colors.muted }]}>Fra ISO-årshjulet (føres i ISO / K-HMS)</Text>
                  {isoInMonth.map((item) => <IsoRow key={item.activity.id} colors={colors} item={item} onOpenIso={onOpenIso} focus={focusOf(item.activity.id)} />)}
                </View>
              ) : null}
            </View>
          </View>
        </View>
      </HrCard>

      <HrCard colors={colors}>
        <View style={styles.stack}>
          <HrSectionTitle colors={colors} title="Året i oversikt" subtitle="Hver aktivitet på én linje over månedene den gjelder. Trykk en linje for å gå til aktiviteten." />
          <StatusLegend colors={colors} withIso={!!iso?.show} />
          <HrAnnualTimeline colors={colors} layout={layout} nowMonth={nowMonth} selectedId={picked?.id} onSelectActivity={pickActivity} compact={isPhone} />
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
  isoDot: { width: 10, height: 10, borderRadius: radius.pill },
  activityBody: { gap: 6, paddingLeft: 26 },
  body: { ...type.label, fontWeight: '400' },
  small: { ...type.caption },
});
