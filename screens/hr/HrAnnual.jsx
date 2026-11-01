import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  HR_ANNUAL_ONGOING, annualSummary, hrAnnualWheel, normalizeAnnualSettings, reviewProgress,
  toggleAnnualDone, toggleAnnualOff,
} from '../../src/hr/annualWheel';
import { formatNbDate } from '../../src/hr/model';
import { toneColor } from '../../src/hr/uiHelpers';
import { EmptyHint, HrButton, HrCard, HrChip, HrSectionTitle, HrStat } from './HrShared';
import { radius, space, type } from '../../src/ui/tokens';
import HrSickLeave from './HrSickLeave';
import HrSurvey from './HrSurvey';

const STATUS = {
  done: { label: 'Gjort', tone: 'good', icon: 'checkmark-circle' },
  now: { label: 'Denne måneden', tone: 'warn', icon: 'time' },
  late: { label: 'Ikke krysset av', tone: 'bad', icon: 'alert-circle' },
  later: { label: 'Senere', tone: 'muted', icon: 'ellipse-outline' },
  off: { label: 'Slått av', tone: 'muted', icon: 'remove-circle-outline' },
  na: { label: 'Gjelder ikke etter antall ansatte', tone: 'muted', icon: 'remove-circle-outline' },
};

const PAGE_LABEL = {
  oppfolging: 'Åpne Oppfølging',
  lonn: 'Åpne Lønn',
  compliance: 'Åpne Lovpålagt',
  avtaler: 'Åpne Avtaler',
  handbok: 'Åpne Personalhåndbok',
  fravaer: 'Åpne ferieplanen',
};

function ActivityRow({ colors, item, year, canWrite, onToggleDone, onToggleOff, onOpen }) {
  const [open, setOpen] = useState(false);
  const { activity, status, done, auto } = item;
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
          </View>
        </View>
      ) : null}
    </View>
  );
}

/**
 * HR → Årshjul: frister ved sykefravær, årshjulet måned for måned, og medarbeiderundersøkelsen.
 */
export default function HrAnnual({
  colors, hr, canWrite, onPatch, familyId, uid, actorName, deadlines, onOpen, onRefreshTasks,
}) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const staff = deadlines?.staff || [];
  const settings = normalizeAnnualSettings(hr?.annual);

  const extra = useMemo(() => {
    const out = {};
    const reviews = reviewProgress(hr?.reviews, staff.map((e) => e.id), year);
    if (reviews) out.medarbeidersamtaler = reviews;
    return out;
  }, [hr?.reviews, staff, year]);

  const wheel = useMemo(
    () => hrAnnualWheel(settings, { year, staffCount: staff.length || null, extra }),
    // settings lages på nytt hver gang, men følger hr.annual.
    [hr?.annual, year, staff.length, extra],
  );
  const summary = annualSummary(wheel);
  const invited = staff.filter((e) => String(e?.personUid || '').trim()).length;
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
      <HrSickLeave
        colors={colors}
        rows={deadlines?.sickRows || []}
        loading={!!deadlines?.loading}
        canWrite={canWrite}
        onPatch={onPatch}
        actorName={actorName}
      />

      <HrCard colors={colors}>
        <View nativeID="hr-annual-wheel" style={styles.stack}>
          <HrSectionTitle
            colors={colors}
            title={`HR-årshjul ${year}`}
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
                />
              )) : <EmptyHint colors={colors} text="Ingen faste HR-aktiviteter." />}
            </View>
          ))}
          <View style={styles.month}>
            <Text style={[styles.monthName, { color: colors.ink }]}>Hele året</Text>
            {HR_ANNUAL_ONGOING.map((row) => (
              <View key={row.id} style={[styles.activity, { borderColor: colors.line }]}>
                <Text style={[styles.activityTitle, { color: colors.ink }]}>{row.title}</Text>
                <Text style={[styles.body, { color: colors.ink }]}>{row.description}</Text>
                <Text style={[styles.small, { color: colors.muted }]}>{`Grunnlag: ${row.law}`}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.small, { color: colors.muted }]}>
            Årshjulet er en hjelp, ikke juridisk rådgivning. Sjekk tariffavtale og egne rutiner, og følg med på lovendringer.
          </Text>
        </View>
      </HrCard>

      <HrSurvey colors={colors} familyId={familyId} canWrite={canWrite} invited={invited} uid={uid} />
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
