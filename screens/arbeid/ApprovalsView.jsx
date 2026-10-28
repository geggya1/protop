import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { employeeActivityTab } from '../../src/employees/model.js';
import { employeeDisplayName, filterEmployeesForPicker } from '../../src/arbeid/roles.js';
import {
  approveTimesheetLock,
  dismissTimesheetFinding,
  reviseLockedEntry,
} from '../../src/arbeid/timesheetState.js';
import {
  blockingFindings,
  controlEntries,
  openFindings,
  reportedLock,
  lockNeedsControl,
  reviewTimesheetEntries,
  splitApprovalQueues,
  sumHours,
} from '../../src/arbeid/timesheetReview.js';
import { billingReadyLabel } from '../../src/economy/billingChain.js';
import Breadcrumb from '../../components/Breadcrumb';

function applyMutation(workspace, result) {
  if (!result.ok) {
    workspace.setError(result.error);
    return false;
  }
  workspace.setState(result.state);
  workspace.setError('');
  return true;
}

function periodLabel(lock) {
  const since = String(lock?.approvedThrough || '').trim();
  if (!since) return `Låst innhold til ${lock.throughDate}`;
  return `Nytt siden ${since}, låst til ${lock.throughDate}`;
}

/**
 * chainLine: prosesslinjen Timer → Godkjenn → Til fakturering → Faktura (fra skjermen rundt).
 * readyCount: prosjekter med godkjente timer som ikke er fakturert.
 */
export function ApprovalsBody({
  workspace,
  hostedHero = false,
  colors,
  scan,
  chainLine = null,
  readyCount = null,
  onOpenBilling = null,
  onApproved = null,
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const [controlId, setControlId] = useState('');
  const [drafts, setDrafts] = useState({});
  const [aiFindings, setAiFindings] = useState([]);
  const [aiNote, setAiNote] = useState('');
  const [queue, setQueue] = useState('locked');
  const [approvedName, setApprovedName] = useState('');

  const people = useMemo(() => {
    const active = filterEmployeesForPicker(workspace.employees, '')
      .filter((row) => employeeActivityTab(row) === 'active');
    const visible = workspace.manager
      ? active
      : active.filter((row) => row.id === workspace.linked?.id);
    return visible.map((row) => ({ ...row, name: employeeDisplayName(row) }));
  }, [workspace.employees, workspace.manager, workspace.linked?.id]);

  const queues = useMemo(() => splitApprovalQueues({
    employees: people,
    locks: workspace.state?.timesheetLocks || [],
    archive: workspace.state?.timesheetLockArchive || [],
  }), [people, workspace.state?.timesheetLocks, workspace.state?.timesheetLockArchive]);

  const lockedRows = useMemo(
    () => queues.locked.filter((row) => lockNeedsControl(workspace.state, row.lock)),
    [queues.locked, workspace.state],
  );
  const control = lockedRows.find((row) => row.employee.id === controlId) || null;
  const bundle = useMemo(
    () => (control ? controlEntries(workspace.state, control.lock) : { hours: [], absences: [] }),
    [workspace.state, control],
  );
  const localFindings = useMemo(
    () => reviewTimesheetEntries(bundle.hours),
    [bundle.hours],
  );
  const scanKey = bundle.hours.map((row) => `${row.id}:${row.hours}:${row.description || ''}`).join('|');
  const findings = useMemo(() => {
    const merged = [...localFindings];
    const currentText = new Map(bundle.hours.map((row) => [row.id, String(row.description || '').trim()]));
    const known = new Set(localFindings.map((row) => `${row.entryId}:${row.suggestion || row.message}`));
    for (const row of aiFindings) {
      if (row.suggestion && currentText.get(row.entryId) === String(row.suggestion).trim()) continue;
      const key = `${row.entryId}:${row.suggestion || row.message}`;
      if (known.has(key)) continue;
      known.add(key);
      merged.push(row);
    }
    return openFindings(merged, control?.lock?.dismissedFindingIds || []);
  }, [localFindings, aiFindings, control?.lock?.dismissedFindingIds, bundle.hours]);
  const blockers = blockingFindings(findings);
  const findingByEntry = useMemo(() => {
    const map = new Map();
    for (const row of findings) {
      const list = map.get(row.entryId) || [];
      list.push(row);
      map.set(row.entryId, list);
    }
    return map;
  }, [findings]);

  useEffect(() => {
    if (!control || typeof scan !== 'function') {
      setAiFindings([]);
      setAiNote('');
      return undefined;
    }
    let live = true;
    setAiFindings([]);
    setAiNote('AI (Google Gemini) leser listen …');
    const rows = bundle.hours;
    Promise.resolve(scan(rows)).then((result) => {
      if (!live) return;
      setAiFindings(result?.findings || []);
      setAiNote(result?.engine === 'gemini'
        ? 'AI har lest listen.'
        : 'Lokal kontroll er klar. AI-tjenesten svarte ikke, så skrivefeil og avvik over er fra reglene i appen.');
    }).catch(() => {
      if (!live) return;
      setAiNote('Lokal kontroll er klar. AI-tjenesten svarte ikke, så skrivefeil og avvik over er fra reglene i appen.');
    });
    return () => { live = false; };
  }, [control?.employee?.id, control?.lock?.throughDate, control?.lock?.lockedAt, scanKey, scan]);

  function saveText(entry) {
    const description = drafts[entry.id] != null ? drafts[entry.id] : entry.description;
    applyMutation(workspace, reviseLockedEntry(workspace.state, { entryId: entry.id, description }));
  }

  function useSuggestion(entry, suggestion) {
    if (applyMutation(workspace, reviseLockedEntry(workspace.state, { entryId: entry.id, description: suggestion }))) {
      setDrafts((current) => ({ ...current, [entry.id]: suggestion }));
    }
  }

  function ignoreFinding(findingId) {
    if (!control) return;
    applyMutation(workspace, dismissTimesheetFinding(workspace.state, {
      employeeId: control.employee.id,
      findingId,
    }));
  }

  function approve() {
    if (!control || blockers.length) return;
    if (applyMutation(workspace, approveTimesheetLock(workspace.state, {
      employeeId: control.employee.id,
      approvedByUid: workspace.uid,
    }))) {
      onApproved?.(control.employee);
      setApprovedName(control.employee.name);
      setControlId('');
    }
  }

  if (control) {
    const hoursTotal = sumHours(bundle.hours);
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="godkjenning-kontroll">
        <TouchableOpacity onPress={() => setControlId('')} nativeID="kontroll-tilbake">
          <Text style={{ color: colors.brand, fontWeight: '700' }}>Tilbake til oversikt</Text>
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.ink }]}>Kontroll · {control.employee.name}</Text>
        <Text style={{ color: colors.muted }}>{periodLabel(control.lock)}. {hoursTotal} timer i perioden.</Text>
        <Text style={{ color: colors.muted }}>{aiNote}</Text>
        {workspace.error ? <Text style={{ color: colors.danger || '#b42318' }}>{workspace.error}</Text> : null}
        <View style={[styles.head, { backgroundColor: colors.sunken }]}>
          {['', 'Dato', 'Prosjekt', 'Timer', 'Tekst'].map((label) => (
            <Text key={label || 'mark'} style={[styles.headCell, { color: colors.muted }]}>{label}</Text>
          ))}
        </View>
        {bundle.hours.map((row) => {
          const marks = findingByEntry.get(row.id) || [];
          const hasError = marks.some((item) => item.severity === 'error');
          const draft = drafts[row.id] != null ? drafts[row.id] : (row.description || '');
          return (
            <View key={row.id} style={[styles.entry, { borderColor: hasError ? '#b42318' : colors.line, backgroundColor: colors.card }]}>
              <View style={styles.entryTop}>
                <Text style={[styles.bang, { color: hasError ? '#b42318' : colors.muted }]}>{hasError ? '!' : ''}</Text>
                <Text style={[styles.meta, { color: colors.ink }]}>{row.date}</Text>
                <Text style={[styles.meta, { color: colors.ink }]}>{row.projectName || row.projectNumber || '—'}</Text>
                <Text style={[styles.meta, { color: colors.ink }]}>{row.hours}</Text>
              </View>
              <TextInput
                value={draft}
                onChangeText={(value) => setDrafts((current) => ({ ...current, [row.id]: value }))}
                style={[styles.input, { color: colors.ink, borderColor: colors.line }]}
                nativeID={`kontroll-tekst-${row.id}`}
              />
              {marks.map((mark) => (
                <View key={mark.id} style={styles.finding}>
                  <Text style={{ color: mark.severity === 'error' ? '#b42318' : colors.ink, flex: 1 }}>
                    {mark.severity === 'error' ? '! ' : ''}{mark.message}
                    {mark.suggestion ? ` Forslag: ${mark.suggestion}` : ''}
                  </Text>
                  {mark.suggestion ? (
                    <TouchableOpacity onPress={() => useSuggestion(row, mark.suggestion)} nativeID={`bruk-forslag-${row.id}`}>
                      <Text style={{ color: colors.brand, fontWeight: '700' }}>Bruk forslag</Text>
                    </TouchableOpacity>
                  ) : null}
                  <TouchableOpacity onPress={() => ignoreFinding(mark.id)}>
                    <Text style={{ color: colors.muted }}>Ignorer</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity onPress={() => saveText(row)} style={[styles.btn, { backgroundColor: colors.sunken }]}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>Lagre tekst</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        {!bundle.hours.length ? <Text style={{ color: colors.muted }}>Ingen timer i perioden som kontrolleres.</Text> : null}
        {bundle.absences.length ? (
          <View style={{ gap: 4 }}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>Fravær i perioden</Text>
            {bundle.absences.map((row) => (
              <Text key={row.id} style={{ color: colors.muted }}>{row.date} · {row.type || 'fravær'} · {row.hours} t</Text>
            ))}
          </View>
        ) : null}
        <Text style={{ color: colors.muted }}>
          {blockers.length
            ? 'Rett feilene merket med ! før du godkjenner. Først da er timene klare for fakturering.'
            : 'Ingen åpne feil. Godkjenning gjør timene klare for fakturering.'}
        </Text>
        {workspace.manager && !control.lock.approvedAt ? (
          <TouchableOpacity
            onPress={approve}
            disabled={blockers.length > 0}
            style={[styles.btn, { backgroundColor: blockers.length ? colors.line : colors.brand }]}
            nativeID={`godkjenn-lock-${control.employee.id}`}
          >
            <Text style={{ color: blockers.length ? colors.muted : '#fff', fontWeight: '700' }}>Godkjenn</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.body} nativeID="godkjenninger">
      {hostedHero ? null : (
        <>
          <Breadcrumb tab="arbeid" subView="godkjenning" />
          <Text style={[styles.title, { color: colors.ink }]}>Godkjenninger</Text>
        </>
      )}
      {chainLine}
      <Text style={{ color: colors.muted }}>
        Låste lister kontrolleres før godkjenning. Timene er klare for fakturering først når de er godkjent.
      </Text>
      {workspace.error ? <Text style={{ color: colors.danger || '#b42318' }}>{workspace.error}</Text> : null}
      {approvedName ? (
        <View
          style={[styles.done, { borderColor: colors.line, backgroundColor: colors.card }]}
          nativeID="godkjenning-ferdig"
          accessibilityLiveRegion="polite"
        >
          <Text style={{ color: colors.ink, flex: 1, minWidth: 200 }}>
            Timelisten til {approvedName} er godkjent. Timene er klare for fakturering.
          </Text>
          {onOpenBilling ? (
            <TouchableOpacity
              onPress={onOpenBilling}
              accessibilityRole="link"
              nativeID="godkjenning-til-fakturering"
              style={[styles.btn, { backgroundColor: colors.brand }]}
            >
              <Text style={{ color: '#fff', fontWeight: '700' }}>{billingReadyLabel(readyCount)}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {!wide ? (
        <View
          style={[styles.switchTrack, { borderColor: colors.line, backgroundColor: colors.sunken || '#f4f6f9' }]}
          accessibilityRole="tablist"
          accessibilityLabel="Velg timelister"
          nativeID="godkjenning-visning"
        >
          {[
            { id: 'locked', label: 'Låst til kontroll', nativeID: 'godkjenning-vis-last' },
            { id: 'unlocked', label: 'Ikke låst', nativeID: 'godkjenning-vis-ulast' },
          ].map((item) => {
            const on = queue === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => setQueue(item.id)}
                nativeID={item.nativeID}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[
                  styles.switchSeg,
                  on && styles.switchSegOn,
                  on && { backgroundColor: colors.card },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.switchLabel,
                    { color: on ? colors.ink : colors.muted },
                    on && styles.switchLabelOn,
                  ]}
                >
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
      <View style={[styles.split, wide ? styles.splitWide : null]}>
        {wide || queue === 'locked' ? (
        <View style={[styles.pane, wide && styles.paneWide]} nativeID="godkjenning-laste">
          {wide ? <Text style={[styles.paneTitle, { color: colors.ink }]}>Låst til kontroll</Text> : null}
          <Text style={{ color: colors.muted }}>Låste timer. Kontroller før du godkjenner til fakturering.</Text>
          <View style={[styles.tableHead, { borderColor: colors.line }]}>
            <Text style={[styles.colName, { color: colors.muted }]}>Ansatt</Text>
            <Text style={[styles.col, { color: colors.muted }]}>Låst til</Text>
            <Text style={[styles.col, { color: colors.muted }]}>Timer</Text>
            <Text style={[styles.col, { color: colors.muted }]} />
          </View>
          {lockedRows.map((row) => {
            const period = controlEntries(workspace.state, reportedLock(row.lock));
            const waiting = !row.lock.approvedAt;
            return (
              <View key={row.employee.id} style={[styles.tableRow, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <Text style={[styles.colName, { color: colors.ink, fontWeight: '700' }]}>{row.employee.name}</Text>
                <Text style={[styles.col, { color: colors.ink }]}>{row.lock.throughDate}</Text>
                <Text style={[styles.col, { color: colors.ink }]}>{sumHours(period.hours)}</Text>
                {workspace.manager && waiting ? (
                  <TouchableOpacity
                    onPress={() => setControlId(row.employee.id)}
                    style={[styles.btn, { backgroundColor: colors.brand }]}
                    nativeID={`kontroller-${row.employee.id}`}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Kontroller</Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.col, { color: colors.muted }]}>{waiting ? 'Venter' : 'Godkjent'}</Text>
                )}
              </View>
            );
          })}
          {!lockedRows.length ? <Text style={{ color: colors.muted, padding: 8 }}>Ingen timer å kontrollere.</Text> : null}
        </View>
        ) : null}
        {wide || queue === 'unlocked' ? (
        <View style={[styles.pane, wide && styles.paneWide]} nativeID="godkjenning-ulaste">
          {wide ? <Text style={[styles.paneTitle, { color: colors.ink }]}>Ikke låst</Text> : null}
          <Text style={{ color: colors.muted }}>Hvor lenge siden listen ble låst sist.</Text>
          <View style={[styles.tableHead, { borderColor: colors.line }]}>
            <Text style={[styles.colName, { color: colors.muted }]}>Ansatt</Text>
            <Text style={[styles.colWide, { color: colors.muted }]}>Sist låst</Text>
          </View>
          {queues.unlocked.map((row) => (
            <View key={row.employee.id} style={[styles.tableRow, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={[styles.colName, { color: colors.ink, fontWeight: '700' }]}>{row.employee.name}</Text>
              <Text style={[styles.colWide, { color: colors.ink }]}>
                {row.lastThrough ? `${row.ageLabel} (til ${row.lastThrough})` : row.ageLabel}
              </Text>
            </View>
          ))}
          {!queues.unlocked.length ? <Text style={{ color: colors.muted, padding: 8 }}>Alle aktive har låst timelisten.</Text> : null}
        </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 10, paddingBottom: 48 },
  title: { fontSize: 22, fontWeight: '700' },
  split: { gap: 16 },
  splitWide: { flexDirection: 'row', alignItems: 'flex-start' },
  pane: { gap: 8, minWidth: 0, alignSelf: 'stretch' },
  paneWide: { flex: 1, minWidth: 280 },
  switchTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderRadius: 10,
    padding: 3,
    gap: 2,
  },
  switchSeg: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  switchSegOn: {
    shadowColor: '#0f172a',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  switchLabel: { fontSize: 13, fontWeight: '500' },
  switchLabelOn: { fontWeight: '600' },
  paneTitle: { fontSize: 16, fontWeight: '700' },
  tableHead: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 6 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  colName: { flex: 1.2, fontSize: 14 },
  col: { width: 88, fontSize: 13 },
  colWide: { flex: 1.4, fontSize: 13 },
  btn: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  done: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12 },
  head: { flexDirection: 'row', gap: 8, borderRadius: 8, padding: 8 },
  headCell: { flex: 1, fontSize: 12, fontWeight: '700' },
  entry: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 6 },
  entryTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bang: { width: 16, fontSize: 18, fontWeight: '800' },
  meta: { flex: 1, fontSize: 13 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  finding: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
});
