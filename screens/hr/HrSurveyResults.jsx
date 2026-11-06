import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  SURVEY_GOOD_SCORE, SURVEY_SCALE_LABELS, surveyActionDraft,
} from '../../src/hr/survey';
import { useBreakpoints } from '../../src/theme';
import { LIKERT_LABELS, chartColorsFor } from '../../src/ui/chartColors';
import { radius, space, type } from '../../src/ui/tokens';
import { HrButton, HrChip } from './HrShared';

function signed(n) {
  if (n == null) return '';
  if (n === 0) return '±0';
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

function DeltaText({ colors, delta, suffix = '' }) {
  if (delta == null) return null;
  const icon = delta > 0 ? 'arrow-up' : delta < 0 ? 'arrow-down' : 'remove';
  return (
    <View style={styles.delta}>
      <Ionicons name={icon} size={12} color={colors.muted} />
      <Text style={[styles.caption, { color: colors.muted }]}>{`${signed(delta)}${suffix}`}</Text>
    </View>
  );
}

function Tile({ colors, label, value, children, nativeID }) {
  return (
    <View style={[styles.tile, { borderColor: colors.line, backgroundColor: colors.bg }]} nativeID={nativeID}>
      <Text style={[styles.caption, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.tileValue, { color: colors.ink }]}>{value}</Text>
      {children}
    </View>
  );
}

function Meter({ colors, share }) {
  const chart = chartColorsFor(colors);
  return (
    <View style={[styles.meter, { backgroundColor: chart.barTrack }]}>
      <View style={[styles.meterFill, { width: `${Math.max(0, Math.min(100, share))}%`, backgroundColor: chart.bar }]} />
    </View>
  );
}

function Legend({ colors }) {
  const chart = chartColorsFor(colors);
  return (
    <View style={styles.legend}>
      {LIKERT_LABELS.map((l, i) => (
        <View key={l} style={styles.legendItem}>
          <View style={[styles.swatch, { backgroundColor: chart.likert[i] }]} />
          <Text style={[styles.caption, { color: colors.muted }]}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

/** Områdene som liggende søyler 0–100, med linje ved målet (70) og utvikling fra forrige gang. */
function AreaBars({ colors, areas, isPhone }) {
  const chart = chartColorsFor(colors);
  const sorted = [...areas].sort((a, b) => b.score - a.score);
  return (
    <View style={styles.stack} nativeID="hr-survey-areas">
      {sorted.map((a) => (
        <View key={a.area} style={[styles.areaRow, isPhone && styles.areaRowPhone]} accessibilityLabel={`${a.area}: ${a.score} av 100`}>
          <View style={[styles.areaName, isPhone && styles.areaNamePhone]}>
            <Text style={[styles.body, { color: colors.ink }]} numberOfLines={1}>{a.area}</Text>
            {a.note ? <Text style={[styles.caption, { color: colors.muted }]}>{a.note}</Text> : null}
            {a.level === 'weak' ? (
              <View style={styles.badge}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={[styles.caption, { color: colors.ink }]}>Forbedringsområde</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.areaTrackWrap}>
            <View style={[styles.areaTrack, { backgroundColor: chart.barTrack }]}>
              <View style={[styles.areaFill, { width: `${a.score}%`, backgroundColor: chart.bar }]} />
              <View style={[styles.target, { left: `${SURVEY_GOOD_SCORE}%`, backgroundColor: colors.ink }]} />
            </View>
          </View>
          <View style={styles.areaValue}>
            <Text style={[styles.bodyStrong, { color: colors.ink }]}>{a.score}</Text>
            <DeltaText colors={colors} delta={a.delta} />
          </View>
        </View>
      ))}
      <View style={styles.legendItem}>
        <View style={[styles.targetKey, { backgroundColor: colors.ink }]} />
        <Text style={[styles.caption, { color: colors.muted }]}>{`Mål: ${SURVEY_GOOD_SCORE} av 100. Tallet er snittet av spørsmålene i området, der 100 er best.`}</Text>
      </View>
    </View>
  );
}

/** Én rad i svarfordelingen: negativt til venstre for midten, positivt til høyre (nøytralt delt på midten). */
function LikertBar({ colors, likert }) {
  const chart = chartColorsFor(colors);
  const [s0, s1, s2, s3, s4] = likert.shares;
  const seg = (w, color, key, outer) => (w > 0 ? (
    <View key={key} style={[styles.seg, { width: `${w}%`, backgroundColor: color }, outer]} />
  ) : null);
  return (
    <View style={styles.likertRow}>
      <Text style={[styles.likertPct, styles.alignRight, { color: colors.ink }]}>{`${likert.negative} %`}</Text>
      <View style={styles.half}>
        <View style={styles.halfLeft}>
          {seg(s2 / 2, chart.likert[2], 'n', null)}
          {seg(s1, chart.likert[1], 'a', null)}
          {seg(s0, chart.likert[0], 'b', styles.endLeft)}
        </View>
      </View>
      <View style={[styles.axis, { backgroundColor: colors.muted }]} />
      <View style={styles.half}>
        <View style={styles.halfRight}>
          {seg(s2 / 2, chart.likert[2], 'n', null)}
          {seg(s3, chart.likert[3], 'c', null)}
          {seg(s4, chart.likert[4], 'd', styles.endRight)}
        </View>
      </View>
      <Text style={[styles.likertPct, { color: colors.ink }]}>{`${likert.positive} %`}</Text>
    </View>
  );
}

/** Svarfordeling per spørsmål. Trykk (eller hold over) en rad for antall per svar. */
function LikertChart({ colors, questions, isPhone }) {
  const [focus, setFocus] = useState('');
  const [table, setTable] = useState(false);
  return (
    <View style={styles.stack} nativeID="hr-survey-likert">
      <View style={styles.toolbar}>
        <Legend colors={colors} />
        <HrChip colors={colors} label={table ? 'Vis som diagram' : 'Vis som tabell'} active={table} onPress={() => setTable((v) => !v)} nativeID="hr-survey-table-toggle" />
      </View>
      {table ? (
        <View style={styles.stack} nativeID="hr-survey-table">
          <View style={[styles.tableRow, { borderColor: colors.line }]}>
            <Text style={[styles.tableQ, styles.caption, { color: colors.muted }]}>Spørsmål</Text>
            {['Snitt (1–5)', 'Positivt', 'Negativt', 'Svar', 'Endring'].map((h) => (
              <Text key={h} style={[styles.tableNum, styles.caption, { color: colors.muted }]}>{h}</Text>
            ))}
          </View>
          {questions.map((q) => (
            <View key={q.id} style={[styles.tableRow, { borderColor: colors.line }]}>
              <Text style={[styles.tableQ, styles.body, { color: colors.ink }]}>{q.text}</Text>
              <Text style={[styles.tableNum, styles.body, { color: colors.ink }]}>{String(q.avg).replace('.', ',')}</Text>
              <Text style={[styles.tableNum, styles.body, { color: colors.ink }]}>{`${q.likert?.positive ?? '–'} %`}</Text>
              <Text style={[styles.tableNum, styles.body, { color: colors.ink }]}>{`${q.likert?.negative ?? '–'} %`}</Text>
              <Text style={[styles.tableNum, styles.body, { color: colors.ink }]}>{q.n}</Text>
              <Text style={[styles.tableNum, styles.body, { color: colors.ink }]}>{q.delta == null ? '–' : signed(q.delta)}</Text>
            </View>
          ))}
        </View>
      ) : questions.map((q) => {
        const on = focus === q.id;
        return (
          <Pressable
            key={q.id}
            onPress={() => setFocus(on ? '' : q.id)}
            onHoverIn={() => setFocus(q.id)}
            onHoverOut={() => setFocus((f) => (f === q.id ? '' : f))}
            accessibilityRole="button"
            accessibilityLabel={`${q.text}: ${q.likert.positive} prosent positivt, ${q.likert.negative} prosent negativt`}
            style={[styles.qBlock, isPhone ? null : styles.qBlockWide, { borderTopColor: colors.line, backgroundColor: on ? colors.sunken : 'transparent' }]}
          >
            <View style={isPhone ? null : styles.qTextCol}>
              <Text style={[styles.body, { color: colors.ink }]}>{q.text}</Text>
              {q.reverse ? <Text style={[styles.caption, { color: colors.muted }]}>Snudd: «helt uenig» regnes som positivt her.</Text> : null}
            </View>
            <View style={isPhone ? null : styles.qBarCol}>
              {q.likert ? <LikertBar colors={colors} likert={q.likert} /> : null}
              {on ? (
                <Text style={[styles.caption, { color: colors.muted }]}>
                  {[
                    ...SURVEY_SCALE_LABELS.map((l, i) => `${l}: ${q.dist?.[i] ?? 0}`),
                    `Snitt ${String(q.avg).replace('.', ',')} av 5`,
                    q.delta != null ? `${signed(q.delta)} poeng fra forrige` : '',
                  ].filter(Boolean).join(' · ')}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Resultat og analyse for en avsluttet undersøkelse (HR → Oppfølging → Medarbeiderundersøkelse).
 * analysis fra surveyAnalysis(). onCreateTask lager oppgave i HR (createFollowUpTask).
 */
export default function HrSurveyResults({
  colors, survey, results, analysis, participation: part, canWrite, onCreateTask, onOpenHandbook,
}) {
  const { isPhone } = useBreakpoints();
  const [made, setMade] = useState({});
  const makeTask = async (area) => {
    if (!onCreateTask || made[area.area]) return;
    setMade((m) => ({ ...m, [area.area]: 'busy' }));
    try {
      await onCreateTask(surveyActionDraft(survey, area));
      setMade((m) => ({ ...m, [area.area]: 'done' }));
    } catch {
      setMade((m) => ({ ...m, [area.area]: '' }));
    }
  };
  const taskButton = (area) => (canWrite && onCreateTask ? (
    <HrButton
      colors={colors}
      icon={made[area.area] === 'done' ? 'checkmark' : 'add'}
      label={made[area.area] === 'done' ? 'Oppgave laget' : 'Lag oppgave for tiltak'}
      disabled={!!made[area.area]}
      onPress={() => makeTask(area)}
    />
  ) : null);

  return (
    <View style={styles.stack} nativeID={`hr-survey-results-${survey.id}`}>
      <View style={styles.tiles}>
        <Tile colors={colors} label="Totalindeks" value={analysis.index == null ? "–" : `${analysis.index} av 100`} nativeID="hr-survey-index">
          <DeltaText colors={colors} delta={analysis.indexDelta} suffix=" fra forrige" />
        </Tile>
        <Tile colors={colors} label="Svarprosent" value={part.pct != null ? `${part.pct} %` : String(results.count)}>
          {part.pct != null ? <Meter colors={colors} share={part.pct} /> : null}
          <Text style={[styles.caption, { color: colors.muted }]}>{`${results.count} av ${part.invited || '?'} svarte`}</Text>
        </Tile>
        <Tile colors={colors} label="Positive svar" value={analysis.positive == null ? "–" : `${analysis.positive} %`}>
          <Text style={[styles.caption, { color: colors.muted }]}>Snitt av alle spørsmål</Text>
        </Tile>
        <Tile colors={colors} label="Negative svar" value={analysis.negative == null ? "–" : `${analysis.negative} %`}>
          <Text style={[styles.caption, { color: colors.muted }]}>Snitt av alle spørsmål</Text>
        </Tile>
      </View>

      {analysis.harassment?.count ? (
        <View style={[styles.alert, { borderColor: colors.danger, backgroundColor: colors.dangerSoft }]} nativeID="hr-survey-harassment">
          <View style={styles.alertHead}>
            <Ionicons name="warning" size={18} color={colors.danger} />
            <Text style={[styles.bodyStrong, { color: colors.ink }]}>
              {`${analysis.harassment.count} av ${analysis.harassment.of} oppgir at de kan ha opplevd mobbing, trakassering eller uønsket seksuell oppmerksomhet`}
            </Text>
          </View>
          <Text style={[styles.body, { color: colors.ink }]}>
            Arbeidsgiver skal sørge for at ingen utsettes for dette (arbeidsmiljøloven § 4-3). Gå gjennom rutinen for varsling og håndtering med verneombudet, gjør det trygt å si fra, og vurder tiltak. Svarene er anonyme, så ingen kan eller skal spores.
          </Text>
          <View style={styles.actions}>
            {taskButton({ area: 'Trakassering', score: analysis.areas.find((a) => a.area === 'Trakassering')?.score ?? 0, advice: analysis.areas.find((a) => a.area === 'Trakassering')?.advice || '' })}
            {onOpenHandbook ? <HrButton colors={colors} icon="book" label="Åpne Personalhåndbok" onPress={onOpenHandbook} /> : null}
          </View>
        </View>
      ) : null}

      <View style={[styles.cols, isPhone && styles.colsPhone]}>
        <View style={[styles.col, { borderColor: colors.line }]} nativeID="hr-survey-strengths">
          <View style={styles.alertHead}>
            <Ionicons name="thumbs-up" size={16} color={colors.success} />
            <Text style={[styles.bodyStrong, { color: colors.ink }]}>Styrker</Text>
          </View>
          {analysis.strengths.map((q) => (
            <View key={q.id} style={styles.listRow}>
              <Text style={[styles.body, { color: colors.ink, flex: 1 }]}>{q.text}</Text>
              <Text style={[styles.bodyStrong, { color: colors.ink }]}>{q.score}</Text>
            </View>
          ))}
        </View>
        <View style={[styles.col, { borderColor: colors.line }]} nativeID="hr-survey-improvements">
          <View style={styles.alertHead}>
            <Ionicons name="construct" size={16} color={colors.warn} />
            <Text style={[styles.bodyStrong, { color: colors.ink }]}>Forbedringsområder</Text>
          </View>
          {analysis.improvements.length ? analysis.improvements.map((q) => (
            <View key={q.id} style={styles.listRow}>
              <Text style={[styles.body, { color: colors.ink, flex: 1 }]}>{q.text}</Text>
              <Text style={[styles.bodyStrong, { color: colors.ink }]}>{q.score}</Text>
            </View>
          )) : <Text style={[styles.body, { color: colors.muted }]}>Alle spørsmål er over målet.</Text>}
        </View>
      </View>

      <Text style={[styles.title, { color: colors.ink }]}>Områder</Text>
      <AreaBars colors={colors} areas={analysis.areas} isPhone={isPhone} />

      {analysis.weakAreas.length ? (
        <View style={styles.stack} nativeID="hr-survey-actions">
          <Text style={[styles.title, { color: colors.ink }]}>Forslag til tiltak</Text>
          {analysis.weakAreas.map((a) => (
            <View key={a.area} style={[styles.col, { borderColor: colors.line }]}>
              <Text style={[styles.bodyStrong, { color: colors.ink }]}>{`${a.area} · ${a.score} av 100`}</Text>
              <Text style={[styles.body, { color: colors.ink }]}>{a.advice}</Text>
              <View style={styles.actions}>{taskButton(a)}</View>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={[styles.title, { color: colors.ink }]}>Svarfordeling per spørsmål</Text>
      <LikertChart colors={colors} questions={analysis.questions} isPhone={isPhone} />

      {results.comments.length ? (
        <View style={styles.stack}>
          <Text style={[styles.title, { color: colors.ink }]}>{`Kommentarer (${results.comments.length})`}</Text>
          {results.comments.map((c, i) => (
            <Text key={`${i}-${c.slice(0, 12)}`} style={[styles.comment, styles.body, { color: colors.ink, borderLeftColor: colors.line }]}>{c}</Text>
          ))}
        </View>
      ) : null}
      <Text style={[styles.caption, { color: colors.muted }]}>
        Lav score på et område er en fare i arbeidsmiljøet som skal vurderes og følges opp med tiltak (internkontrollforskriften § 5). Gå gjennom resultatene med verneombudet og de ansatte.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tile: { flex: 1, minWidth: 150, borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 4 },
  tileValue: { ...type.h2 },
  meter: { height: 6, borderRadius: radius.pill, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: radius.pill },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  alert: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  alertHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cols: { flexDirection: 'row', gap: space.xs },
  colsPhone: { flexDirection: 'column' },
  col: { flex: 1, borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  listRow: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-start' },
  title: { ...type.title, marginTop: space.xs },
  body: { ...type.body },
  bodyStrong: { ...type.bodyStrong },
  caption: { ...type.caption },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  areaRowPhone: { flexWrap: 'wrap' },
  areaName: { width: 200, gap: 2 },
  areaNamePhone: { width: '100%' },
  areaTrackWrap: { flex: 1, minWidth: 120 },
  areaTrack: { height: 16, borderRadius: 4, position: 'relative' },
  areaFill: { height: 16, borderTopRightRadius: 4, borderBottomRightRadius: 4, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  target: { position: 'absolute', top: -3, bottom: -3, width: 2 },
  targetKey: { width: 2, height: 12 },
  areaValue: { width: 64, alignItems: 'flex-end' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 2 },
  qBlock: { borderTopWidth: 1, paddingVertical: space.xs, paddingHorizontal: space.xxs, gap: 6, borderRadius: radius.control },
  qBlockWide: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  qTextCol: { flex: 2, minWidth: 0 },
  qBarCol: { flex: 3, minWidth: 0, gap: 4 },
  likertRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  likertPct: { width: 40, ...type.caption },
  alignRight: { textAlign: 'right' },
  half: { flex: 1 },
  halfLeft: { flexDirection: 'row-reverse', height: 16 },
  halfRight: { flexDirection: 'row', height: 16 },
  seg: { height: 16, marginHorizontal: 1 },
  endLeft: { borderTopLeftRadius: 4, borderBottomLeftRadius: 4 },
  endRight: { borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  axis: { width: 1, height: 22 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderTopWidth: 1, paddingTop: 6 },
  tableQ: { flex: 3 },
  tableNum: { flex: 1, textAlign: 'right' },
  comment: { borderLeftWidth: 3, paddingLeft: space.xs },
});
