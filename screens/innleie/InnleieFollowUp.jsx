import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { displayName } from '../../src/employees/model';
import { hrKindLabel } from '../../src/hr/directory';
import { employeeHrBucket, formatNbDate, localIsoDate } from '../../src/hr/model';
import { hiredPeople } from '../../src/innleie/dashboard';
import {
  EVALUATION_CRITERIA, EXIT_CHECKS, FOLLOWUP_KINDS, TRIVSEL_INTERVAL_DAYS, TRIVSEL_SCALE,
  evaluationScore, exitProgress, followUpStatus, followUpSummary, normalizeHiredFollowUp,
} from '../../src/innleie/followUp';
import { showSaveToast } from '../../src/ui/saveToast';
import { radius, type } from '../../src/ui/tokens';
import {
  ACCENT, Avatar, Bar, DashCard, KpiTile, Pill, Segmented, gridItem, gridStyle, tint,
} from '../hr/HrDashParts';
import { EmptyHint, HrButton, HrField } from '../hr/HrShared';

/** Fjes og farge per trivselsnivå, 1 til 5. */
export const TRIVSEL_LOOK = {
  1: { icon: 'sad-outline', color: ACCENT.red },
  2: { icon: 'sad-outline', color: ACCENT.amber },
  3: { icon: 'happy-outline', color: ACCENT.slate },
  4: { icon: 'happy-outline', color: ACCENT.teal },
  5: { icon: 'happy', color: ACCENT.green },
};

function daysText(n) {
  if (n == null) return 'Aldri';
  if (n === 0) return 'I dag';
  return n === 1 ? 'For 1 dag siden' : `For ${n} dager siden`;
}

/** Små søyler for de siste trivselsmålingene. */
export function TrivselSpark({ history, colors }) {
  if (!history?.length) return null;
  return (
    <View style={styles.spark} accessibilityLabel={`Trivsel: ${history.map((row) => row.score).join(', ')}`}>
      {history.map((row) => (
        <View
          key={`${row.date}_${row.score}`}
          style={[styles.sparkBar, { height: 4 + row.score * 4, backgroundColor: TRIVSEL_LOOK[row.score]?.color || colors.muted }]}
        />
      ))}
    </View>
  );
}

/**
 * Oppfølging av innleide og eksterne: trivsel, evaluering og avslutning.
 * Ikke medarbeidersamtaler; de holdes av arbeidsgiveren deres.
 */
export default function InnleieFollowUp({
  colors, employees, hr, canWrite, onPatch, assigneeName, selectedId, onSelect,
}) {
  const [status, setStatus] = useState('active');
  const rows = useMemo(() => followUpStatus(
    hiredPeople(employees, 'all').map((employee) => ({ employee, active: employeeHrBucket(employee) === 'active' })),
    hr.hiredFollowUps,
  ), [employees, hr.hiredFollowUps]);
  const summary = useMemo(() => followUpSummary(rows), [rows]);
  const selected = rows.find((row) => row.employeeId === selectedId) || null;

  function saveEntry(entry, toast) {
    onPatch?.((state) => {
      const list = Array.isArray(state.hiredFollowUps) ? [...state.hiredFollowUps] : [];
      const now = new Date().toISOString();
      const next = normalizeHiredFollowUp({ ...entry, updatedAt: now, createdAt: entry.createdAt || now, byName: entry.byName || assigneeName });
      const index = list.findIndex((row) => row.id === next.id);
      if (index >= 0) list[index] = next;
      else list.unshift(next);
      return { hiredFollowUps: list };
    });
    showSaveToast?.(toast || 'Lagret');
  }

  function removeEntry(id) {
    onPatch?.((state) => ({ hiredFollowUps: (state.hiredFollowUps || []).filter((row) => row.id !== id) }));
    showSaveToast?.('Slettet');
  }

  if (selected) {
    return (
      <PersonFollowUp
        key={selected.employeeId}
        colors={colors}
        row={selected}
        canWrite={canWrite}
        onSave={saveEntry}
        onRemove={removeEntry}
        onBack={() => onSelect?.('')}
      />
    );
  }

  const shown = rows
    .filter((row) => (status === 'active' ? row.active && !row.ended : !row.active || row.ended))
    .sort((a, b) => Number(!!b.due) - Number(!!a.due)
      || (a.trivsel?.score ?? 9) - (b.trivsel?.score ?? 9)
      || displayName(a.employee).localeCompare(displayName(b.employee), 'nb'));
  const maxDist = Math.max(1, ...summary.distribution.map((row) => row.count));
  const due = [...summary.dueExit, ...summary.dueTrivsel];

  return (
    <View style={styles.page} nativeID="innleie-followup">
      <View style={gridStyle(4, 150, 10)}>
        <View style={gridItem(150)}>
          <KpiTile
            colors={colors}
            accent={summary.avg && summary.avg < 3 ? ACCENT.amber : ACCENT.green}
            ringPct={summary.avg ? (summary.avg / 5) * 100 : 0}
            label="Trivsel"
            value={summary.avg ? `${String(summary.avg).replace('.', ',')} av 5` : '–'}
            hint={summary.scored ? `Siste måling for ${summary.scored} av ${summary.activeCount}` : 'Ingen målinger ennå'}
          />
        </View>
        <View style={gridItem(150)}>
          <KpiTile colors={colors} icon="chatbubbles-outline" accent={summary.dueTrivsel.length ? ACCENT.amber : ACCENT.teal} label="Venter på trivsel" value={String(summary.dueTrivsel.length)} hint={`Mer enn ${TRIVSEL_INTERVAL_DAYS} dager siden sist`} />
        </View>
        <View style={gridItem(150)}>
          <KpiTile colors={colors} icon="log-out-outline" accent={summary.dueExit.length ? ACCENT.red : ACCENT.teal} label="Avslutning mangler" value={String(summary.dueExit.length)} hint="Sluttet uten ferdig sjekkliste" />
        </View>
        <View style={gridItem(150)}>
          <KpiTile colors={colors} icon="ribbon-outline" accent={ACCENT.violet} label="Evaluering" value={summary.evaluationAvg ? `${String(summary.evaluationAvg).replace('.', ',')} av 5` : '–'} hint={summary.evaluatedCount ? `Snitt av ${summary.evaluatedCount} evalueringer` : 'Ingen evalueringer ennå'} />
        </View>
      </View>

      <View style={gridStyle(2, 300, 12)}>
        <View style={gridItem(300)}>
          <DashCard colors={colors} icon="happy-outline" title="Trivsel nå" subtitle="Siste måling per aktiv person." nativeID="innleie-followup-dist">
            {summary.scored ? [...summary.distribution].reverse().map((step) => (
              <View key={step.value} style={styles.distRow}>
                <Ionicons name={TRIVSEL_LOOK[step.value].icon} size={18} color={TRIVSEL_LOOK[step.value].color} />
                <Text style={[styles.distLabel, { color: colors.ink }]} numberOfLines={1}>{step.label}</Text>
                <View style={styles.grow}><Bar ratio={step.count / maxDist} accent={TRIVSEL_LOOK[step.value].color} height={8} /></View>
                <Text style={[styles.count, { color: colors.ink }]}>{step.count}</Text>
              </View>
            )) : <EmptyHint colors={colors} text="Ingen trivselsmålinger ennå. Trykk på en person for å registrere den første." />}
          </DashCard>
        </View>
        <View style={gridItem(300)}>
          <DashCard colors={colors} icon="alarm-outline" title="Venter" subtitle="Trivsel som skal tas, og avslutninger som ikke er ferdige." badge={due.length || null} badgeAccent={ACCENT.amber} nativeID="innleie-followup-due">
            {due.length ? due.slice(0, 6).map((row) => (
              <Pressable key={row.employeeId} onPress={() => onSelect?.(row.employeeId)} style={styles.line} accessibilityRole="button">
                <Avatar name={displayName(row.employee)} photoUrl={row.employee.person?.photoUrl} size={32} accent={ACCENT.slate} />
                <View style={styles.lineText}>
                  <Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>{displayName(row.employee)}</Text>
                  <Text numberOfLines={1} style={[styles.caption, { color: colors.muted }]}>
                    {row.due === 'avslutning'
                      ? `Avslutning ${row.exitProgress.done} av ${row.exitProgress.total}`
                      : `Trivsel: ${daysText(row.trivselSince).toLowerCase()}`}
                  </Text>
                </View>
                <Pill label={row.due === 'avslutning' ? 'Avslutning' : 'Trivsel'} accent={row.due === 'avslutning' ? ACCENT.red : ACCENT.amber} />
              </Pressable>
            )) : (
              <View style={[styles.ok, { backgroundColor: tint(ACCENT.green, 0.08) }]}>
                <Ionicons name="checkmark-circle-outline" size={18} color={ACCENT.green} />
                <Text style={[styles.caption, { color: colors.muted }]}>Alle er fulgt opp.</Text>
              </View>
            )}
          </DashCard>
        </View>
      </View>

      <Segmented
        colors={colors}
        nativeID="innleie-followup-status"
        options={[
          { id: 'active', label: 'På oppdrag', count: rows.filter((row) => row.active && !row.ended).length },
          { id: 'ended', label: 'Avsluttet', count: rows.filter((row) => !row.active || row.ended).length },
        ]}
        value={status}
        onChange={setStatus}
      />
      {shown.length ? (
        <View style={gridStyle(3, 260, 10)} nativeID="innleie-followup-people">
          {shown.map((row) => {
            const score = row.trivsel?.score || 0;
            const face = TRIVSEL_LOOK[score];
            return (
              <View key={row.employeeId} style={gridItem(260)}>
                <Pressable
                  onPress={() => onSelect?.(row.employeeId)}
                  accessibilityRole="button"
                  nativeID={`innleie-followup-${row.employeeId}`}
                  style={[styles.card, { backgroundColor: colors.card, borderColor: row.due ? tint(ACCENT.amber, 0.45) : colors.line }]}
                >
                  <View style={[styles.face, { backgroundColor: tint(face?.color || ACCENT.slate, 0.12) }]}>
                    <Ionicons name={face?.icon || 'help-outline'} size={24} color={face?.color || colors.muted} />
                  </View>
                  <View style={styles.lineText}>
                    <Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>{displayName(row.employee)}</Text>
                    <Text numberOfLines={1} style={[styles.caption, { color: colors.muted }]}>
                      {[hrKindLabel(row.employee), score ? `Trivsel ${score}/5` : 'Ingen måling', row.evaluationScore ? `Eval. ${String(row.evaluationScore).replace('.', ',')}` : ''].filter(Boolean).join(' · ')}
                    </Text>
                    <View style={styles.pills}>
                      {row.due === 'trivsel' ? <Pill label="Trivsel venter" accent={ACCENT.amber} icon="alarm-outline" /> : null}
                      {row.due === 'avslutning' ? <Pill label={`Avslutning ${row.exitProgress.done}/${row.exitProgress.total}`} accent={ACCENT.red} icon="log-out-outline" /> : null}
                      {!row.due && row.trivselSince != null ? <Pill label={daysText(row.trivselSince)} accent={ACCENT.slate} /> : null}
                    </View>
                  </View>
                  <TrivselSpark history={row.history} colors={colors} />
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : (
        <EmptyHint colors={colors} text={status === 'active' ? 'Ingen innleide eller eksterne på oppdrag.' : 'Ingen avsluttede oppdrag.'} />
      )}
    </View>
  );
}

function PersonFollowUp({
  colors, row, canWrite, onSave, onRemove, onBack,
}) {
  const name = displayName(row.employee);
  const [kind, setKind] = useState(row.due === 'avslutning' ? 'avslutning' : 'trivsel');
  const [date, setDate] = useState(localIsoDate());
  const [score, setScore] = useState(0);
  const [ratings, setRatings] = useState({});
  const [rehire, setRehire] = useState('');
  const [note, setNote] = useState('');
  // Avslutningen er én sjekkliste per person: endringer lagres på den siste.
  const exit = row.exit || null;
  const meta = FOLLOWUP_KINDS.find((item) => item.id === kind);

  function reset() {
    setScore(0);
    setRatings({});
    setRehire('');
    setNote('');
    setDate(localIsoDate());
  }

  function saveTrivsel() {
    if (!score) return;
    onSave({ employeeId: row.employeeId, kind: 'trivsel', date, score, note }, 'Trivselen er lagret');
    reset();
  }

  function saveEvaluation() {
    if (!Object.keys(ratings).length) return;
    onSave({ employeeId: row.employeeId, kind: 'evaluering', date, ratings, rehire, note }, 'Evalueringen er lagret');
    reset();
  }

  function toggleExit(id) {
    const base = exit || normalizeHiredFollowUp({ employeeId: row.employeeId, kind: 'avslutning', date: localIsoDate() });
    const checks = { ...base.checks, [id]: !base.checks?.[id] };
    onSave({ ...base, checks }, checks[id] ? 'Huket av' : 'Fjernet');
  }

  return (
    <View style={styles.page} nativeID="innleie-followup-sheet">
      <Pressable onPress={onBack} accessibilityRole="button" style={styles.back}>
        <Ionicons name="arrow-back" size={16} color={colors.brand} />
        <Text style={[styles.caption, { color: colors.brand, fontWeight: '600' }]}>Til oppfølging</Text>
      </Pressable>
      <View style={[styles.head, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Avatar name={name} photoUrl={row.employee.person?.photoUrl} size={52} accent={ACCENT.slate} square />
        <View style={styles.lineText}>
          <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.caption, { color: colors.muted }]}>
            {[hrKindLabel(row.employee), row.trivsel ? `Trivsel ${row.trivsel.score}/5 ${formatNbDate(row.trivsel.date)}` : 'Ingen trivselsmåling'].join(' · ')}
          </Text>
          <TrivselSpark history={row.history} colors={colors} />
        </View>
      </View>

      <Segmented
        colors={colors}
        nativeID="innleie-followup-kind"
        options={FOLLOWUP_KINDS.map((item) => ({ id: item.id, label: item.label, icon: item.icon }))}
        value={kind}
        onChange={setKind}
      />
      <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Text style={[styles.caption, { color: colors.muted }]}>{meta?.hint}</Text>

        {kind === 'trivsel' ? (
          <>
            <View style={styles.faces} nativeID="innleie-trivsel-scale">
              {TRIVSEL_SCALE.map((step) => {
                const on = score === step.value;
                const l = TRIVSEL_LOOK[step.value];
                return (
                  <Pressable
                    key={step.value}
                    disabled={!canWrite}
                    onPress={() => setScore(step.value)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${step.value}: ${step.label}`}
                    nativeID={`innleie-trivsel-${step.value}`}
                    style={[styles.faceBtn, { borderColor: on ? l.color : colors.line, backgroundColor: on ? tint(l.color, 0.12) : colors.bg }]}
                  >
                    <Ionicons name={l.icon} size={26} color={on ? l.color : colors.muted} />
                    <Text style={[styles.caption, { color: on ? l.color : colors.muted, textAlign: 'center' }]}>{step.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <EntryFields colors={colors} date={date} onDate={setDate} note={note} onNote={setNote} placeholder="Hva sa personen? Noe dere bør rette på?" />
            {canWrite ? <HrButton colors={colors} primary label="Lagre trivsel" disabled={!score} onPress={saveTrivsel} nativeID="innleie-trivsel-save" /> : null}
          </>
        ) : null}

        {kind === 'evaluering' ? (
          <>
            {EVALUATION_CRITERIA.map((crit) => (
              <View key={crit.id} style={styles.critRow}>
                <Text style={[styles.critLabel, { color: colors.ink }]}>{crit.label}</Text>
                <Segmented
                  colors={colors}
                  compact
                  options={[1, 2, 3, 4, 5].map((n) => ({ id: n, label: String(n) }))}
                  value={ratings[crit.id] || 0}
                  onChange={(n) => canWrite && setRatings({ ...ratings, [crit.id]: n })}
                />
              </View>
            ))}
            <View style={styles.critRow}>
              <Text style={[styles.critLabel, { color: colors.ink }]}>Vil dere leie inn personen igjen?</Text>
              <Segmented
                colors={colors}
                compact
                options={[{ id: 'yes', label: 'Ja' }, { id: 'maybe', label: 'Kanskje' }, { id: 'no', label: 'Nei' }]}
                value={rehire}
                onChange={(value) => canWrite && setRehire(value)}
              />
            </View>
            <EntryFields colors={colors} date={date} onDate={setDate} note={note} onNote={setNote} placeholder="Kort om oppdraget" />
            {canWrite ? <HrButton colors={colors} primary label="Lagre evaluering" disabled={!Object.keys(ratings).length} onPress={saveEvaluation} /> : null}
          </>
        ) : null}

        {kind === 'avslutning' ? (
          <View nativeID="innleie-exit-checks">
            {EXIT_CHECKS.map((check) => {
              const on = !!exit?.checks?.[check.id];
              return (
                <Pressable
                  key={check.id}
                  disabled={!canWrite}
                  onPress={() => toggleExit(check.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={styles.checkRow}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? ACCENT.green : colors.muted} />
                  <Text style={[styles.body, { color: colors.ink, flex: 1 }]}>{check.label}</Text>
                </Pressable>
              );
            })}
            <View style={styles.exitBar}>
              <Bar ratio={exitProgress(exit).done / EXIT_CHECKS.length} accent={exitProgress(exit).complete ? ACCENT.green : ACCENT.amber} height={6} />
              <Text style={[styles.caption, { color: colors.muted }]}>{`${exitProgress(exit).done} av ${EXIT_CHECKS.length} er gjort`}</Text>
            </View>
          </View>
        ) : null}
      </View>

      <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.line }]} nativeID="innleie-followup-history">
        <Text style={[styles.groupTitle, { color: colors.muted }]}>HISTORIKK</Text>
        {row.entries.length ? row.entries.map((entry, index) => (
          <View key={entry.id} style={[styles.histRow, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }]}>
            <Ionicons
              name={entry.kind === 'trivsel' ? (TRIVSEL_LOOK[entry.score]?.icon || 'happy-outline') : FOLLOWUP_KINDS.find((k) => k.id === entry.kind)?.icon}
              size={20}
              color={entry.kind === 'trivsel' ? (TRIVSEL_LOOK[entry.score]?.color || colors.muted) : colors.muted}
            />
            <View style={styles.lineText}>
              <Text style={[styles.name, { color: colors.ink }]}>
                {entry.kind === 'trivsel' && `Trivsel ${entry.score}/5`}
                {entry.kind === 'evaluering' && `Evaluering ${String(evaluationScore(entry)).replace('.', ',')}/5${entry.rehire ? ` · igjen: ${{ yes: 'ja', maybe: 'kanskje', no: 'nei' }[entry.rehire]}` : ''}`}
                {entry.kind === 'avslutning' && `Avslutning ${exitProgress(entry).done}/${EXIT_CHECKS.length}`}
              </Text>
              <Text style={[styles.caption, { color: colors.muted }]}>
                {[formatNbDate(entry.date), entry.byName, entry.note].filter(Boolean).join(' · ')}
              </Text>
            </View>
            {canWrite ? (
              <Pressable onPress={() => onRemove(entry.id)} accessibilityRole="button" accessibilityLabel="Slett" hitSlop={8} style={styles.iconBtn}>
                <Ionicons name="trash-outline" size={16} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        )) : <Text style={[styles.caption, { color: colors.muted }]}>Ingenting registrert ennå.</Text>}
      </View>
    </View>
  );
}

function EntryFields({ colors, date, onDate, note, onNote, placeholder }) {
  return (
    <View style={gridStyle(2, 220, 10)}>
      <View style={gridItem(220)}>
        <HrField colors={colors} label="Dato" date="iso" value={date} onChangeText={onDate} />
      </View>
      <View style={gridItem(220)}>
        <HrField colors={colors} label="Notat" value={note} onChangeText={onNote} placeholder={placeholder} multiline />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  grow: { flex: 1, minWidth: 0 },
  caption: { ...type.caption },
  body: { ...type.body },
  name: { ...type.body, fontWeight: '500' },
  title: { ...type.h2 },
  count: { ...type.bodyStrong, minWidth: 18, textAlign: 'right' },
  distRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30 },
  distLabel: { ...type.caption, width: 92 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  lineText: { flex: 1, minWidth: 0, gap: 2 },
  ok: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.card, padding: 12 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.card, padding: 12,
  },
  face: { width: 44, height: 44, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  spark: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 26, marginTop: 4 },
  sparkBar: { width: 6, borderRadius: 2 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36 },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: radius.card, padding: 14,
  },
  box: { borderWidth: 1, borderRadius: radius.card, padding: 14, gap: 12 },
  faces: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  faceBtn: {
    flexGrow: 1, flexBasis: 90, alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.card, paddingVertical: 10, paddingHorizontal: 6,
  },
  critRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  critLabel: { ...type.body, flexGrow: 1, flexBasis: 200 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  exitBar: { gap: 6, marginTop: 6 },
  groupTitle: { ...type.caption, fontWeight: '600', letterSpacing: 0.6 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  iconBtn: { padding: 6 },
});
