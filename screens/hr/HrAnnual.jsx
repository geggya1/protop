import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  HR_ANNUAL_ONGOING, annualSummary, hrAnnualWheel, normalizeAnnualSettings, reviewFormsFromFilled, reviewProgress,
  toggleAnnualDone, toggleAnnualOff,
} from '../../src/hr/annualWheel';
import { loadFilledDocs, peekFilledDocs } from '../../src/forms/filledStore';
import { formatNbDate } from '../../src/hr/model';
import { toneColor } from '../../src/hr/uiHelpers';
import { EmptyHint, HrButton, HrCard, HrChip, HrSectionTitle, HrStat } from './HrShared';
import { radius, space, type } from '../../src/ui/tokens';

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

/**
 * HR → Rutiner → Årshjul: faste HR-aktiviteter måned for måned. Fristene ved sykefravær og
 * medarbeiderundersøkelsen er egne sider under Oppfølging, og aktivitetene lenker dit.
 * onOpenIso: finnes når personen ser ISO, så HMS-aktivitetene føres der og ikke to steder.
 */
export default function HrAnnual({
  colors, hr, canWrite, onPatch, familyId, actorName, staff = [], onOpen, onOpenIso, onRefreshTasks,
}) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
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
    () => hrAnnualWheel(settings, { year, staffCount: staff.length || null, extra }),
    // settings lages på nytt hver gang, men følger hr.annual.
    [hr?.annual, year, staff.length, extra],
  );
  const summary = annualSummary(wheel);
  const currentMonth = new Date().getMonth();

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
            subtitle={`Faste HR-oppgaver gjennom året, med lovhenvisning. ${staff.length} egne ansatte: aktiviteter som krever flere ansatte, er tonet ned. Trykk en aktivitet for detaljer.`}
          />
          <View style={styles.actions}>
            {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
              <HrChip key={y} colors={colors} label={String(y)} active={year === y} onPress={() => setYear(y)} />
            ))}
          </View>
          <View style={styles.stats}>
            <HrStat colors={colors} label="Gjort" value={`${summary.done} av ${summary.total}`} />
            <HrStat colors={colors} label="Denne måneden" value={String(summary.now)} />
            <HrStat colors={colors} label="Ikke krysset av" value={String(summary.late)} hint="Måneden er passert" />
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
          {settings.tasks ? (
            <Text style={[styles.small, { color: colors.muted }]}>
              Oppgavene tildeles den i HR som først åpner HR i måneden, med frist siste dag i måneden.
            </Text>
          ) : null}
          {wheel.map((m) => (
            <View key={m.month} style={styles.month}>
              <Text style={[styles.monthName, { color: year === thisYear && m.month === currentMonth ? colors.brand : colors.ink }]}>
                {m.name}
              </Text>
              {m.items.length ? m.items.map((item) => (
                <ActivityRow
                  key={`${m.month}-${item.activity.id}`}
                  colors={colors}
                  item={item}
                  year={year}
                  canWrite={canWrite}
                  onToggleDone={toggleDone}
                  onToggleOff={toggleOff}
                  onOpen={onOpen}
                  onOpenIso={onOpenIso}
                />
              )) : <EmptyHint colors={colors} text="Ingen faste HR-aktiviteter." />}
            </View>
          ))}
          <View style={styles.month}>
            <Text style={[styles.monthName, { color: colors.ink }]}>Hele året</Text>
            {HR_ANNUAL_ONGOING.map((row) => (
              <View key={row.id} style={[styles.activity, { borderColor: colors.line }]} nativeID={`hr-annual-ongoing-${row.id}`}>
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
  page: { gap: 12 },
  stack: { gap: 10 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  month: { gap: 6, marginTop: 4 },
  monthName: { ...type.bodyStrong },
  activity: { borderWidth: 1, borderRadius: radius.control, padding: space.xs, gap: 6 },
  activityHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activityTitle: { ...type.bodyStrong },
  activityBody: { gap: 6, paddingLeft: 26 },
  body: { ...type.label, fontWeight: '400' },
  small: { ...type.caption },
});
