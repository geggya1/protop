import React, { useState } from 'react';
import {
  Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  CUSTOMER_GOOD_SCORE, CUSTOMER_SCALE_LABELS, customerCsvRows,
} from '../../src/surveys/customerSurvey';
import { csvFileName, downloadCsv } from '../../src/surveys/csv';
import { chartColorsFor } from '../../src/ui/chartColors';
import { showSaveToast } from '../../src/ui/saveToast';
import { useBreakpoints } from '../../src/theme';
import { radius, space, type } from '../../src/ui/tokens';
import { HrButton, HrChip } from '../hr/HrShared';
import { formatNbDate } from '../../src/hr/model';

/** Avrundede ender på søylene (diagrammenes merker). */
const MARK_RADIUS = 4;

/** «Fremdrift» → «fremdrift», men «HMS og orden» beholder forkortelsen. */
function lowerName(name) {
  const s = String(name || '');
  return /^[A-ZÆØÅ]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1);
}

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

/** NPS-fordelingen som én delt søyle: kritikere, passive og anbefalere, med tall og forklaring. */
function NpsBar({ colors, nps }) {
  const chart = chartColorsFor(colors);
  const parts = [
    { key: 'detractors', label: 'Kritikere (0–6)', n: nps.detractors, share: nps.shares.detractors, color: chart.likert[0] },
    { key: 'passives', label: 'Passive (7–8)', n: nps.passives, share: nps.shares.passives, color: chart.likert[2] },
    { key: 'promoters', label: 'Anbefalere (9–10)', n: nps.promoters, share: nps.shares.promoters, color: chart.likert[4] },
  ];
  return (
    <View style={styles.stack} nativeID="customer-survey-nps-bar">
      <View style={styles.npsTrack} accessibilityLabel={parts.map((p) => `${p.label}: ${p.n}`).join(', ')}>
        {parts.filter((p) => p.n > 0).map((p, i, all) => (
          <View
            key={p.key}
            style={[
              styles.npsSeg,
              { flexGrow: p.n, backgroundColor: p.color },
              i === 0 && styles.segStart,
              i === all.length - 1 && styles.segEnd,
            ]}
          />
        ))}
      </View>
      <View style={styles.legend}>
        {parts.map((p) => (
          <View key={p.key} style={styles.legendItem}>
            <View style={[styles.swatch, { backgroundColor: p.color }]} />
            <Text style={[styles.caption, { color: colors.ink }]}>{`${p.label}: ${p.n} (${p.share} %)`}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function AreaBars({ colors, areas, isPhone }) {
  const chart = chartColorsFor(colors);
  const sorted = [...areas].sort((a, b) => b.score - a.score);
  return (
    <View style={styles.stack} nativeID="customer-survey-areas">
      {sorted.map((a) => (
        <View key={a.area} style={[styles.areaRow, isPhone && styles.wrap]} accessibilityLabel={`${a.area}: ${a.score} av 100`}>
          <View style={[styles.areaName, isPhone && styles.full]}>
            <Text style={[styles.body, { color: colors.ink }]} numberOfLines={1}>{a.area}</Text>
            {a.level === 'weak' ? (
              <View style={styles.badge}>
                <Ionicons name="alert-circle" size={13} color={colors.danger} />
                <Text style={[styles.caption, { color: colors.ink }]}>Må bedres</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.trackWrap}>
            <View style={[styles.track, { backgroundColor: chart.barTrack }]}>
              <View style={[styles.fill, { width: `${a.score}%`, backgroundColor: chart.bar }]} />
              <View style={[styles.target, { left: `${CUSTOMER_GOOD_SCORE}%`, backgroundColor: colors.ink }]} />
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
        <Text style={[styles.caption, { color: colors.muted }]}>{`Mål: ${CUSTOMER_GOOD_SCORE} av 100. 0 = alle svært misfornøyd, 100 = alle svært fornøyd.`}</Text>
      </View>
    </View>
  );
}

function FollowUpRow({ colors, row, canWrite, onFollowUp }) {
  const [note, setNote] = useState(row.followUp?.note || '');
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);
  const [busy, setBusy] = useState(false);
  const done = row.followUp?.done;
  const save = async (data) => {
    setBusy(true);
    try {
      return await onFollowUp(row.id, { done: !!done, note, ...data });
    } finally {
      setBusy(false);
    }
  };
  const sendReply = async () => {
    if (!reply.trim()) return;
    const ok = await save({ reply: reply.trim(), done: true });
    if (ok !== false) {
      setReply('');
      setReplying(false);
    }
  };
  const status = done
    ? { icon: 'checkmark-circle', color: colors.success, text: 'Fulgt opp' }
    : row.overdue
      ? { icon: 'time', color: colors.danger, text: `Fristen gikk ut ${formatNbDate(row.due)}` }
      : { icon: 'alert-circle', color: colors.warn, text: row.due ? `Følg opp innen ${formatNbDate(row.due)}${row.daysLeft != null ? ` (${row.daysLeft} ${row.daysLeft === 1 ? 'dag' : 'dager'})` : ''}` : 'Ikke fulgt opp' };
  return (
    <View style={[styles.followRow, { borderColor: colors.line }]} nativeID={`customer-survey-followup-${row.id}`}>
      <View style={styles.followHead}>
        <Ionicons name={status.icon} size={18} color={status.color} />
        <View style={{ flex: 1, minWidth: 160 }}>
          <Text style={[styles.bodyStrong, { color: colors.ink }]}>{row.customerName || row.recipientName || 'Kunde'}</Text>
          <Text style={[styles.caption, { color: colors.muted }]}>
            {[
              row.recipientName && row.recipientName !== row.customerName ? row.recipientName : '',
              row.projectName,
              row.nps != null ? `anbefaling ${row.nps} av 10` : '',
              row.low.length ? `lavt på ${row.low.map(lowerName).join(', ')}` : '',
            ].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={[styles.pill, { borderColor: status.color }]}>
          <Text style={[styles.caption, { color: colors.ink }]}>{status.text}</Text>
        </View>
      </View>
      {row.followUp?.repliedAt ? (
        <View style={[styles.replied, { borderLeftColor: colors.success }]}>
          <Text style={[styles.caption, { color: colors.muted }]}>{`Svar sendt til kunden ${formatNbDate(row.followUp.repliedAt)}`}</Text>
          <Text style={[styles.caption, { color: colors.ink }]} numberOfLines={3}>{row.followUp.reply}</Text>
        </View>
      ) : null}
      {canWrite ? (
        <>
          <View style={styles.followTools}>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Internt notat: hva ble gjort? (f.eks. ringt kunden, avtalt befaring)"
              placeholderTextColor={colors.muted}
              style={[styles.input, { flex: 1, minWidth: 200, color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <HrButton colors={colors} icon={done ? 'refresh' : 'checkmark'} label={done ? 'Åpne igjen' : 'Merk som fulgt opp'} disabled={busy} onPress={() => save({ done: !done })} />
            {!replying ? (
              <HrButton colors={colors} icon="mail-outline" label="Svar kunden" disabled={busy} onPress={() => setReplying(true)} nativeID={`customer-survey-reply-${row.id}`} />
            ) : null}
          </View>
          {replying ? (
            <View style={[styles.replyBox, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
              <Text style={[styles.caption, { color: colors.muted }]}>
                {`Kunden får en e-post fra bedriften med teksten under. Fortell hva dere har gjort med tilbakemeldingen. Det viser at svaret ble tatt på alvor.`}
              </Text>
              <TextInput
                value={reply}
                onChangeText={setReply}
                multiline
                placeholder="Takk for ærlig tilbakemelding. Vi har …"
                placeholderTextColor={colors.muted}
                nativeID={`customer-survey-reply-text-${row.id}`}
                style={[styles.input, styles.replyInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
              <View style={styles.followTools}>
                <HrButton colors={colors} primary icon="send" label={busy ? 'Sender …' : 'Send og merk som fulgt opp'} disabled={busy || !reply.trim()} onPress={sendReply} nativeID={`customer-survey-reply-send-${row.id}`} />
                <HrButton colors={colors} label="Avbryt" onPress={() => setReplying(false)} />
              </View>
            </View>
          ) : null}
        </>
      ) : (row.followUp?.note ? <Text style={[styles.caption, { color: colors.ink }]}>{row.followUp.note}</Text> : null)}
    </View>
  );
}

/**
 * Resultat for én kundeundersøkelse. results fra customerResults(), analysis fra customerAnalysis().
 */
export default function CustomerSurveyResults({
  colors, survey, results, analysis, canWrite, onFollowUp,
}) {
  const { isPhone } = useBreakpoints();
  const [table, setTable] = useState(false);
  const sent = survey.stats.sent || 0;
  const pct = sent ? Math.min(100, Math.round((results.count / sent) * 100)) : null;
  const exportCsv = () => {
    if (!downloadCsv(csvFileName(survey.title, 'resultat'), customerCsvRows(survey, results))) showSaveToast?.('Nedlasting virker bare i nettleseren.');
  };
  const scaleQs = results.questions.filter((q) => q.type === 'scale' && q.n);
  return (
    <View style={styles.stack} nativeID={`customer-survey-results-${survey.id}`}>
      <View style={styles.tiles}>
        {results.nps ? (
          <Tile colors={colors} label="NPS (anbefaling)" value={signed(results.nps.score).replace('±', '')} nativeID="customer-survey-nps">
            <Text style={[styles.caption, { color: colors.ink }]}>{analysis.npsLevel}</Text>
            <DeltaText colors={colors} delta={analysis.npsDelta} suffix=" fra forrige" />
          </Tile>
        ) : null}
        <Tile colors={colors} label="Tilfredshet" value={analysis.index == null ? '–' : `${analysis.index} av 100`} nativeID="customer-survey-index">
          <DeltaText colors={colors} delta={analysis.indexDelta} suffix=" fra forrige" />
        </Tile>
        <Tile colors={colors} label="Svar" value={pct != null ? `${pct} %` : String(results.count)}>
          <Text style={[styles.caption, { color: colors.muted }]}>{`${results.count} av ${sent || '?'} svarte`}</Text>
        </Tile>
        {!survey.anonymous ? (
          <Tile colors={colors} label="Misfornøyde kunder" value={String(results.unhappy.length)}>
            <Text style={[styles.caption, { color: colors.muted }]}>{analysis.unhappyOpen ? `${analysis.unhappyOpen} ikke fulgt opp` : 'Alle er fulgt opp'}</Text>
          </Tile>
        ) : null}
      </View>

      {results.nps ? <NpsBar colors={colors} nps={results.nps} /> : null}
      <Text style={[styles.caption, { color: colors.muted }]}>
        NPS er andelen anbefalere minus andelen kritikere, fra −100 til 100. Over 0 er bra, over 50 er svært bra.
      </Text>

      {!survey.anonymous && results.unhappy.length ? (
        <View style={styles.stack} nativeID="customer-survey-unhappy">
          <Text style={[styles.title, { color: colors.ink }]}>Følg opp misfornøyde kunder</Text>
          <Text style={[styles.caption, { color: colors.muted }]}>Kunder som ga 0–6 på anbefaling eller 1–2 på et spørsmål. Ta kontakt innen 14 dager, finn årsaken, og fortell kunden hva dere har gjort. Registrer det som reklamasjon eller avvik når det trengs (ISO 9001 punkt 9.1.2 og 10.2).</Text>
          {[...results.unhappy].sort((a, b) => (!!a.followUp?.done - !!b.followUp?.done) || (b.overdue - a.overdue) || String(a.due).localeCompare(String(b.due))).map((u) => (
            <FollowUpRow key={u.id || u.customerName} colors={colors} row={u} canWrite={canWrite && !!onFollowUp} onFollowUp={onFollowUp} />
          ))}
        </View>
      ) : null}

      {analysis.areas.length ? (
        <>
          <Text style={[styles.title, { color: colors.ink }]}>Områder</Text>
          <AreaBars colors={colors} areas={analysis.areas} isPhone={isPhone} />
        </>
      ) : null}

      {analysis.improve.length ? (
        <View style={styles.stack} nativeID="customer-survey-improve">
          <Text style={[styles.title, { color: colors.ink }]}>Hva må bedres</Text>
          {analysis.improve.map((a) => (
            <View key={a.area} style={[styles.box, { borderColor: colors.line }]}>
              <Text style={[styles.bodyStrong, { color: colors.ink }]}>{a.score == null ? a.area : `${a.area} · ${a.score} av 100`}</Text>
              {a.advice ? <Text style={[styles.body, { color: colors.ink }]}>{a.advice}</Text> : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={[styles.box, { borderColor: colors.line }]}>
          <Text style={[styles.body, { color: colors.ink }]}>Alle områdene er over målet. Fortsett med det som fungerer, og spør kundene igjen neste år.</Text>
        </View>
      )}

      {analysis.strengths.length ? (
        <View style={[styles.box, { borderColor: colors.line }]} nativeID="customer-survey-strengths">
          <View style={styles.legendItem}>
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
      ) : null}

      <View style={styles.toolbar}>
        <Text style={[styles.title, { color: colors.ink }]}>Spørsmål</Text>
        <View style={styles.actions}>
          <HrChip colors={colors} label={table ? 'Skjul fordeling' : 'Vis fordeling'} active={table} onPress={() => setTable((v) => !v)} nativeID="customer-survey-dist-toggle" />
          {Platform.OS === 'web' ? <HrButton colors={colors} icon="download-outline" label="Last ned (Excel)" onPress={exportCsv} nativeID="customer-survey-export" /> : null}
        </View>
      </View>
      <View>
        <View style={[styles.tableRow, { borderColor: colors.line }]}>
          <Text style={[styles.tableQ, styles.caption, { color: colors.muted }]}>Spørsmål</Text>
          <Text style={[styles.tableNum, styles.caption, { color: colors.muted }]}>Snitt</Text>
          <Text style={[styles.tableNum, styles.caption, { color: colors.muted }]}>Score</Text>
          <Text style={[styles.tableNum, styles.caption, { color: colors.muted }]}>Svar</Text>
        </View>
        {results.questions.filter((q) => q.type !== 'text').map((q) => (
          <View key={q.id} style={[styles.tableBlock, { borderColor: colors.line }]}>
            <View style={styles.tableRowInner}>
              <Text style={[styles.tableQ, styles.body, { color: colors.ink }]}>{q.text.replace(/\{firma\}/g, survey.companyName || 'oss')}</Text>
              <Text style={[styles.tableNum, styles.body, { color: colors.ink }]}>{q.avg == null ? '–' : `${String(q.avg).replace('.', ',')}${q.type === 'nps' ? '/10' : '/5'}`}</Text>
              <Text style={[styles.tableNum, styles.body, { color: colors.ink }]}>{q.type === 'nps' ? (q.nps ? `NPS ${q.nps.score}` : '–') : (q.score ?? '–')}</Text>
              <Text style={[styles.tableNum, styles.body, { color: colors.ink }]}>{q.n}</Text>
            </View>
            {table && q.dist ? (
              <Text style={[styles.caption, { color: colors.muted }]}>
                {q.type === 'nps'
                  ? q.dist.map((n, v) => `${v}: ${n}`).join(' · ')
                  : CUSTOMER_SCALE_LABELS.map((l, i) => `${l}: ${q.dist[i]}`).join(' · ')}
              </Text>
            ) : null}
          </View>
        ))}
        {!scaleQs.length ? <Text style={[styles.caption, { color: colors.muted }]}>Ingen svar på fornøydhet-spørsmålene ennå.</Text> : null}
      </View>

      {results.texts.map((t) => (
        <View key={t.id} style={styles.stack}>
          <Text style={[styles.title, { color: colors.ink }]}>{`${t.question} (${t.answers.length})`}</Text>
          {t.answers.map((a, i) => (
            <View key={`${i}-${a.text.slice(0, 12)}`} style={[styles.comment, { borderLeftColor: colors.line }]}>
              <Text style={[styles.body, { color: colors.ink }]}>{a.text}</Text>
              {a.customerName ? <Text style={[styles.caption, { color: colors.muted }]}>{a.customerName}</Text> : null}
            </View>
          ))}
        </View>
      ))}
      {survey.anonymous ? (
        <Text style={[styles.caption, { color: colors.muted }]}>Undersøkelsen er anonym. Svarene vises bare samlet, uten kunde og tidspunkt, og fritekst i alfabetisk rekkefølge.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: space.xs, marginTop: space.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tile: { flex: 1, minWidth: 140, borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 4 },
  tileValue: { ...type.h2 },
  delta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  title: { ...type.title, marginTop: space.xs },
  body: { ...type.body },
  bodyStrong: { ...type.bodyStrong },
  caption: { ...type.caption },
  npsTrack: { flexDirection: 'row', height: 20, gap: 2 },
  npsSeg: { height: 20 },
  segStart: { borderTopLeftRadius: radius.control, borderBottomLeftRadius: radius.control },
  segEnd: { borderTopRightRadius: radius.control, borderBottomRightRadius: radius.control },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: MARK_RADIUS / 2 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  wrap: { flexWrap: 'wrap' },
  areaName: { width: 180, gap: 2 },
  full: { width: '100%' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  trackWrap: { flex: 1, minWidth: 120 },
  track: { height: 16, borderRadius: MARK_RADIUS, position: 'relative' },
  fill: { height: 16, borderTopRightRadius: MARK_RADIUS, borderBottomRightRadius: MARK_RADIUS },
  target: { position: 'absolute', top: -3, bottom: -3, width: 2 },
  targetKey: { width: 2, height: 12 },
  areaValue: { width: 64, alignItems: 'flex-end' },
  box: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  listRow: { flexDirection: 'row', gap: space.xs, alignItems: 'flex-start' },
  followRow: { borderTopWidth: 1, paddingTop: space.xs, gap: 6 },
  followHead: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.xs },
  followTools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  replied: { borderLeftWidth: 3, paddingLeft: space.xs, gap: 2 },
  replyBox: { borderWidth: 1, borderRadius: radius.control, padding: space.xs, gap: 6 },
  replyInput: { minHeight: 80, textAlignVertical: 'top' },
  input: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.xs, paddingVertical: 8, ...type.body },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderBottomWidth: 1, paddingVertical: 6 },
  tableBlock: { borderBottomWidth: 1, paddingVertical: 6, gap: 4 },
  tableRowInner: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  tableQ: { flex: 3 },
  tableNum: { flex: 1, textAlign: 'right' },
  comment: { borderLeftWidth: 3, paddingLeft: space.xs, gap: 2 },
});
