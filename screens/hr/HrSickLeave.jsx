import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayName } from '../../src/employees/model';
import { formatNbDate } from '../../src/hr/model';
import { markSickMilestone } from '../../src/hr/sickLeave';
import { toneColor } from '../../src/hr/uiHelpers';
import { radius, space, type } from '../../src/ui/tokens';
import { lazyScreen } from '../../src/ui/lazyScreen';
const EmptyHint = lazyScreen(() => import('./HrShared'), { name: 'EmptyHint', pick: 'EmptyHint', silent: true });
const HrCard = lazyScreen(() => import('./HrShared'), { name: 'HrCard', pick: 'HrCard', silent: true });
const HrChip = lazyScreen(() => import('./HrShared'), { name: 'HrChip', pick: 'HrChip', silent: true });
const HrSectionTitle = lazyScreen(() => import('./HrShared'), { name: 'HrSectionTitle', pick: 'HrSectionTitle', silent: true });

const STATUS = {
  done: { label: 'Gjort', tone: 'good' },
  na: { label: 'Ikke nødvendig', tone: 'muted' },
  notNeeded: { label: 'Ikke aktuelt lenger', tone: 'muted' },
  paused: { label: 'Tilbake i arbeid før fristen', tone: 'muted' },
  unknown: { label: 'Ukjent: startet før fraværet som er hentet', tone: 'muted' },
  overdue: { label: 'Forsinket', tone: 'bad' },
  soon: { label: 'Snart', tone: 'warn' },
  later: { label: 'Senere', tone: 'muted' },
};

/**
 * HR → Oppfølging → Sykefravær: fristene per sykefraværstilfelle. rows fra sickFollowUpRows.
 * Navn vises bare her, i HR.
 */
export default function HrSickLeave({ colors, rows, loading, loadFailed = false, canWrite, onPatch, actorName }) {
  const mark = (row, milestoneId, status) => {
    if (!canWrite) return;
    onPatch?.((state) => ({
      sickFollowUps: markSickMilestone(state.sickFollowUps, row, milestoneId, status, { by: actorName || '' }),
    }));
  };

  return (
    <HrCard colors={colors}>
      <View nativeID="hr-sick-followup" style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title="Sykefravær"
          subtitle="Regnet fra første sykedag i Fravær. Oppfølgingsplan innen 4 uker og dialogmøte 1 innen 7 uker (arbeidsmiljøloven § 4-6). NAV kaller inn til dialogmøte 2 innen 26 uker. HR får oppgave før fristen, uten navn i oppgaven."
        />
        {loading ? <EmptyHint colors={colors} text="Henter fravær …" /> : null}
        {loadFailed ? <EmptyHint colors={colors} text="Kunne ikke hente fraværet. Fristene vises når det er hentet." /> : null}
        {!loading && !loadFailed && !rows.length ? (
          <EmptyHint colors={colors} text="Ingen pågående sykefravær over to uker, og ingen åpne frister." />
        ) : null}
        {rows.map((row) => (
          <View key={row.key} style={[styles.case, { borderColor: colors.line }]} nativeID={`hr-sick-${row.key}`}>
            <Text style={[styles.name, { color: colors.ink }]}>
              {row.employee ? displayName(row.employee) : 'Ukjent ansatt'}
            </Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              {`Syk fra ${row.truncated ? 'før ' : ''}${formatNbDate(row.start)}${row.ongoing ? '' : ` til ${formatNbDate(row.end)}`} · ${row.length} dager${row.ongoing ? ' så langt' : ''}`}
            </Text>
            {row.truncated ? (
              <Text style={[styles.meta, { color: colors.muted }]}>
                Fraværet startet for mer enn halvannet år siden. Fristene regnes ikke ut, og det lages ingen oppgaver. Følg opp manuelt.
              </Text>
            ) : null}
            {row.milestones.map((m) => {
              const st = STATUS[m.status] || STATUS.later;
              const marked = m.status === 'done' || m.status === 'na';
              return (
                <View key={m.id} style={[styles.milestone, { borderColor: colors.line }]}>
                  <View style={{ flex: 1, minWidth: 180 }}>
                    <Text style={[styles.mLabel, { color: colors.ink }]}>{`${m.label} · frist ${formatNbDate(m.due)}`}</Text>
                    <Text style={[styles.mStatus, { color: toneColor(st.tone, colors) }]}>
                      {marked && m.mark?.date ? `${st.label} ${formatNbDate(m.mark.date)}` : st.label}
                    </Text>
                  </View>
                  {canWrite && m.status !== 'notNeeded' && m.status !== 'unknown' ? (
                    <View style={styles.actions}>
                      <HrChip
                        colors={colors}
                        label="Gjort"
                        active={m.status === 'done'}
                        onPress={() => mark(row, m.id, m.status === 'done' ? '' : 'done')}
                        nativeID={`hr-sick-${row.key}-${m.id}-done`}
                      />
                      <HrChip
                        colors={colors}
                        label="Ikke nødvendig"
                        active={m.status === 'na'}
                        onPress={() => mark(row, m.id, m.status === 'na' ? '' : 'na')}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </HrCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  case: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  name: { ...type.bodyStrong },
  meta: { ...type.label, fontWeight: '400' },
  milestone: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderTopWidth: 1, paddingTop: 8,
  },
  mLabel: { ...type.body },
  mStatus: { ...type.label, fontWeight: '600', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
});
