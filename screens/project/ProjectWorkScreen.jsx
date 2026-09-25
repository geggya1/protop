import React, { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { ACCOUNTS, CHECKLIST_TEMPLATES, COST_CODES, ISO_STANDARDS, PHASES } from '../../src/project/catalog';
import {
  addActivity,
  addAudit,
  addBoardNote,
  addChange,
  addChecklist,
  addContract,
  addDeviation,
  addDocument,
  addIncident,
  addInspection,
  addMeeting,
  addSja,
  addWaste,
  archiveProject,
  checkInCrew,
  checkOutCrew,
  checklistScore,
  closeDeviation,
  closeIncident,
  createProject,
  emptyProjectState,
  postEntry,
  progressSummary,
  projectEconomy,
  removeRecord,
  selectProject,
  setActivityProgress,
  setChangeStatus,
  signSja,
  toggleCheckItem,
  updateSja,
  wasteSummary,
} from '../../src/project/engine';
import { draftMinutes, projectAdvice, projectReport, suggestIso, suggestMeasures } from '../../src/project/assistant';
import { loadProjectState, saveProjectState } from '../../src/project/storage';

const SECTIONS = [
  ['portefolje', 'Portefølje'],
  ['fremdrift', 'Fremdrift'],
  ['hms', 'HMS'],
  ['kvalitet', 'Kvalitet'],
  ['dokumenter', 'Dokumenter'],
  ['moter', 'Møter'],
  ['okonomi', 'Økonomi'],
  ['iso', 'ISO'],
  ['assistent', 'Assistent'],
];

function Field({ label, value, onChangeText, placeholder, colors, keyboardType, multiline }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={keyboardType || 'default'}
        multiline={!!multiline}
        style={[styles.input, multiline && styles.inputMulti, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

function Btn({ label, onPress, colors, tone = 'brand' }) {
  const bg = tone === 'danger' ? colors.danger : tone === 'quiet' ? colors.sunken : colors.brand;
  const fg = tone === 'quiet' ? colors.ink : '#fff';
  return (
    <TouchableOpacity onPress={onPress} style={[styles.btn, { backgroundColor: bg }]} accessibilityRole="button">
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ProjectWorkScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= 900;
  const [state, setState] = useState(emptyProjectState());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [section, setSection] = useState('portefolje');
  const [query, setQuery] = useState('');
  const [forms, setForms] = useState({
    project: { name: '', number: '', client: '', place: '', phase: 'planlegging', manager: '' },
    activity: { name: '', owner: '', predecessorId: '' },
    board: { title: '', body: '' },
    sja: { task: '', hazards: '' },
    ruh: { title: '', description: '', severity: 'middels' },
    inspection: { area: '', findings: '' },
    deviation: { title: '', description: '', type: 'ks', cause: '', action: '' },
    document: { title: '', discipline: 'tegning', note: '' },
    meeting: { title: '', date: '', agenda: '' },
    change: { title: '', amount: '' },
    contract: { title: '', party: '', value: '' },
    entry: { kind: 'cost', account: '4010', costCode: '21', text: '', amount: '', hours: '', rate: '' },
    crew: { name: '', company: '' },
    waste: { fraction: 'Restavfall', kg: '', sorted: true },
    audit: { standard: 'ISO 9001', findings: '' },
    closeId: '',
  });

  useEffect(() => {
    let live = true;
    loadProjectState().then((loaded) => {
      if (!live) return;
      setState(loaded);
      setReady(true);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (ready) saveProjectState(state).catch(() => setError('Kunne ikke lagre lokalt.'));
  }, [state, ready]);

  const project = state.projects.find((item) => item.id === state.activeProjectId && item.status !== 'arkivert') || null;
  const economy = project ? projectEconomy(state, project.id) : null;
  const progress = project ? progressSummary(state, project.id) : null;
  const waste = project ? wasteSummary(state, project.id) : null;
  const advice = project ? projectAdvice(state, project.id) : [];

  function patch(group, key, value) {
    setForms((current) => ({ ...current, [group]: { ...current[group], [key]: value } }));
  }

  function run(result, after) {
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError('');
    setState(result.state);
    if (after) after();
  }

  const visibleProjects = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.projects.filter((item) => {
      if (!q) return true;
      return `${item.number} ${item.name} ${item.client} ${item.place}`.toLowerCase().includes(q);
    });
  }, [state.projects, query]);

  function scoped(list) {
    if (!project) return [];
    return list.filter((row) => row.projectId === project.id);
  }

  const body = (
    <View style={styles.stack}>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      {project ? (
        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.summaryTitle, { color: colors.ink }]}>{project.number} · {project.name}</Text>
          <Text style={{ color: colors.muted }}>
            {project.phase} · fremdrift {progress.percent}% · resultat {economy.result} kr · sortering {waste.rate}%
          </Text>
        </View>
      ) : (
        <Text style={{ color: colors.muted }}>Opprett et prosjekt for å bruke HMS, kvalitet, dokumenter og regnskap.</Text>
      )}

      {section === 'portefolje' && (
        <View style={styles.stack}>
          <Field label="Søk" value={query} onChangeText={setQuery} placeholder="Nummer, navn, kunde" colors={colors} />
          <Field label="Navn" value={forms.project.name} onChangeText={(v) => patch('project', 'name', v)} colors={colors} />
          <Field label="Prosjektnummer" value={forms.project.number} onChangeText={(v) => patch('project', 'number', v)} colors={colors} />
          <Field label="Kunde" value={forms.project.client} onChangeText={(v) => patch('project', 'client', v)} colors={colors} />
          <Field label="Sted" value={forms.project.place} onChangeText={(v) => patch('project', 'place', v)} colors={colors} />
          <Field label="Prosjektleder" value={forms.project.manager} onChangeText={(v) => patch('project', 'manager', v)} colors={colors} />
          <Text style={[styles.label, { color: colors.muted }]}>Fase</Text>
          <View style={styles.rowWrap}>
            {PHASES.map((phase) => (
              <Btn key={phase} label={phase} tone={forms.project.phase === phase ? 'brand' : 'quiet'} colors={colors} onPress={() => patch('project', 'phase', phase)} />
            ))}
          </View>
          <Btn label="Opprett prosjekt" colors={colors} onPress={() => run(createProject(state, forms.project), () => setForms((current) => ({ ...current, project: { ...current.project, name: '', number: '' } })))} />
          {visibleProjects.map((item) => (
            <View key={item.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '400' }}>{item.number} {item.name}</Text>
              <Text style={{ color: colors.muted }}>{item.client || 'Uten kunde'} · {item.phase} · {item.status}</Text>
              <View style={styles.rowWrap}>
                {item.status !== 'arkivert' ? <Btn label="Åpne" tone="quiet" colors={colors} onPress={() => run(selectProject(state, item.id))} /> : null}
                {item.status !== 'arkivert' ? <Btn label="Arkiver" tone="danger" colors={colors} onPress={() => run(archiveProject(state, item.id))} /> : null}
              </View>
            </View>
          ))}
        </View>
      )}

      {section === 'fremdrift' && project && (
        <View style={styles.stack}>
          <Field label="Aktivitet" value={forms.activity.name} onChangeText={(v) => patch('activity', 'name', v)} colors={colors} />
          <Field label="Ansvarlig" value={forms.activity.owner} onChangeText={(v) => patch('activity', 'owner', v)} colors={colors} />
          <Text style={{ color: colors.muted }}>
            {forms.activity.predecessorId ? 'Ny aktivitet legges etter valgt forgjenger.' : 'Ingen forgjenger. Trykk «Etter denne» på en aktivitet.'}
          </Text>
          <Btn label="Legg til aktivitet" colors={colors} onPress={() => run(addActivity(state, { ...forms.activity, predecessorId: forms.activity.predecessorId || null }), () => setForms((current) => ({ ...current, activity: { ...current.activity, name: '', predecessorId: '' } })))} />
          {scoped(state.activities).map((row) => (
            <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.name} · {row.progress}%</Text>
              <Text style={{ color: colors.muted }}>{row.owner || 'Uten ansvarlig'}</Text>
              <View style={styles.rowWrap}>
                <Btn label="0%" tone="quiet" colors={colors} onPress={() => run(setActivityProgress(state, row.id, 0))} />
                <Btn label="50%" tone="quiet" colors={colors} onPress={() => run(setActivityProgress(state, row.id, 50))} />
                <Btn label="100%" tone="quiet" colors={colors} onPress={() => run(setActivityProgress(state, row.id, 100))} />
                <Btn label="Etter denne" tone="quiet" colors={colors} onPress={() => patch('activity', 'predecessorId', row.id)} />
                <Btn label="Slett" tone="danger" colors={colors} onPress={() => run(removeRecord(state, 'activities', row.id))} />
              </View>
            </View>
          ))}
        </View>
      )}

      {section === 'hms' && project && (
        <View style={styles.stack}>
          <Text style={[styles.h2, { color: colors.ink }]}>HMS-tavle</Text>
          <Field label="Overskrift" value={forms.board.title} onChangeText={(v) => patch('board', 'title', v)} colors={colors} />
          <Field label="Tekst" value={forms.board.body} onChangeText={(v) => patch('board', 'body', v)} colors={colors} />
          <Btn label="Publiser på tavlen" colors={colors} onPress={() => run(addBoardNote(state, forms.board))} />
          {scoped(state.board).map((row) => (
            <Text key={row.id} style={{ color: colors.ink }}>{row.title}: {row.body}</Text>
          ))}

          <Text style={[styles.h2, { color: colors.ink }]}>SJA</Text>
          <Field label="Arbeidsoperasjon" value={forms.sja.task} onChangeText={(v) => patch('sja', 'task', v)} colors={colors} />
          <Field label="Farer" value={forms.sja.hazards} onChangeText={(v) => patch('sja', 'hazards', v)} colors={colors} />
          <Btn label="Opprett SJA" colors={colors} onPress={() => run(addSja(state, forms.sja))} />
          {scoped(state.sja).map((row) => (
            <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.task} · {row.status}</Text>
              <Text style={{ color: colors.muted }}>{row.measures || 'Ingen tiltak ennå'}</Text>
              <View style={styles.rowWrap}>
                <Btn label="Foreslå tiltak" tone="quiet" colors={colors} onPress={() => run(updateSja(state, row.id, { hazards: row.hazards, measures: suggestMeasures(row.hazards) }))} />
                <Btn label="Signer" colors={colors} onPress={() => run(signSja(state, row.id))} />
              </View>
            </View>
          ))}

          <Text style={[styles.h2, { color: colors.ink }]}>RUH</Text>
          <Field label="Tittel" value={forms.ruh.title} onChangeText={(v) => patch('ruh', 'title', v)} colors={colors} />
          <Field label="Beskrivelse" value={forms.ruh.description} onChangeText={(v) => patch('ruh', 'description', v)} colors={colors} />
          <View style={styles.rowWrap}>
            {['lav', 'middels', 'høy', 'kritisk'].map((level) => (
              <Btn key={level} label={level} tone={forms.ruh.severity === level ? 'brand' : 'quiet'} colors={colors} onPress={() => patch('ruh', 'severity', level)} />
            ))}
          </View>
          <Btn label="Registrer RUH" colors={colors} onPress={() => run(addIncident(state, forms.ruh))} />
          {scoped(state.incidents).map((row) => (
            <View key={row.id} style={styles.rowWrap}>
              <Text style={{ color: colors.ink }}>{row.title} · {row.severity} · {row.status}</Text>
              {row.status !== 'lukket' ? <Btn label="Lukk" tone="quiet" colors={colors} onPress={() => run(closeIncident(state, row.id))} /> : null}
            </View>
          ))}

          <Text style={[styles.h2, { color: colors.ink }]}>Befaring</Text>
          <Field label="Område" value={forms.inspection.area} onChangeText={(v) => patch('inspection', 'area', v)} colors={colors} />
          <Field label="Funn" value={forms.inspection.findings} onChangeText={(v) => patch('inspection', 'findings', v)} colors={colors} />
          <Btn label="Lagre befaring" colors={colors} onPress={() => run(addInspection(state, forms.inspection))} />

          <Text style={[styles.h2, { color: colors.ink }]}>Mannskap</Text>
          <Field label="Navn" value={forms.crew.name} onChangeText={(v) => patch('crew', 'name', v)} colors={colors} />
          <Field label="Firma" value={forms.crew.company} onChangeText={(v) => patch('crew', 'company', v)} colors={colors} />
          <Btn label="Sjekk inn" colors={colors} onPress={() => run(checkInCrew(state, forms.crew))} />
          {scoped(state.crew).map((row) => (
            <View key={row.id} style={styles.rowWrap}>
              <Text style={{ color: colors.ink }}>{row.name}, {row.company} · {row.status}</Text>
              {row.status === 'inne' ? <Btn label="Sjekk ut" tone="quiet" colors={colors} onPress={() => run(checkOutCrew(state, row.id))} /> : null}
            </View>
          ))}

          <Text style={[styles.h2, { color: colors.ink }]}>Avfall · mål {waste.goal}%</Text>
          <Field label="Fraksjon" value={forms.waste.fraction} onChangeText={(v) => patch('waste', 'fraction', v)} colors={colors} />
          <Field label="Kg" value={forms.waste.kg} onChangeText={(v) => patch('waste', 'kg', v)} keyboardType="decimal-pad" colors={colors} />
          <View style={styles.rowWrap}>
            <Btn label="Sortert" tone={forms.waste.sorted ? 'brand' : 'quiet'} colors={colors} onPress={() => patch('waste', 'sorted', true)} />
            <Btn label="Usortert" tone={!forms.waste.sorted ? 'brand' : 'quiet'} colors={colors} onPress={() => patch('waste', 'sorted', false)} />
          </View>
          <Btn label="Registrer avfall" colors={colors} onPress={() => run(addWaste(state, forms.waste))} />
        </View>
      )}

      {section === 'kvalitet' && project && (
        <View style={styles.stack}>
          <Field label="Avvik" value={forms.deviation.title} onChangeText={(v) => patch('deviation', 'title', v)} colors={colors} />
          <Field label="Beskrivelse" value={forms.deviation.description} onChangeText={(v) => patch('deviation', 'description', v)} colors={colors} />
          <View style={styles.rowWrap}>
            {['ks', 'hms', 'iso', 'miljø'].map((type) => (
              <Btn key={type} label={type} tone={forms.deviation.type === type ? 'brand' : 'quiet'} colors={colors} onPress={() => patch('deviation', 'type', type)} />
            ))}
          </View>
          <Btn
            label="Registrer avvik"
            colors={colors}
            onPress={() => run(addDeviation(state, { ...forms.deviation, iso: suggestIso(`${forms.deviation.title} ${forms.deviation.description}`) }))}
          />
          <Field label="Årsak ved lukking" value={forms.deviation.cause} onChangeText={(v) => patch('deviation', 'cause', v)} colors={colors} />
          <Field label="Tiltak ved lukking" value={forms.deviation.action} onChangeText={(v) => patch('deviation', 'action', v)} colors={colors} />
          {scoped(state.deviations).map((row) => (
            <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.title} · {row.type} · {row.status}</Text>
              <Text style={{ color: colors.muted }}>{row.iso}</Text>
              {row.status !== 'lukket' ? (
                <Btn label="Lukk avvik" colors={colors} onPress={() => run(closeDeviation(state, row.id, forms.deviation))} />
              ) : <Text style={{ color: colors.muted }}>{row.cause} → {row.action}</Text>}
            </View>
          ))}
          <Text style={[styles.h2, { color: colors.ink }]}>Sjekklister</Text>
          <View style={styles.rowWrap}>
            {CHECKLIST_TEMPLATES.map((template) => (
              <Btn key={template.id} label={template.title} tone="quiet" colors={colors} onPress={() => run(addChecklist(state, { templateId: template.id }))} />
            ))}
          </View>
          {scoped(state.checklists).map((list) => (
            <View key={list.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '400' }}>{list.title} · {checklistScore(list)}%</Text>
              {list.items.map((item) => (
                <Btn key={item.id} label={`${item.done ? '✓' : '○'} ${item.label}`} tone={item.done ? 'brand' : 'quiet'} colors={colors} onPress={() => run(toggleCheckItem(state, list.id, item.id))} />
              ))}
            </View>
          ))}
        </View>
      )}

      {section === 'dokumenter' && project && (
        <View style={styles.stack}>
          <Field label="Tittel" value={forms.document.title} onChangeText={(v) => patch('document', 'title', v)} colors={colors} />
          <Field label="Merknad" value={forms.document.note} onChangeText={(v) => patch('document', 'note', v)} colors={colors} />
          <View style={styles.rowWrap}>
            {['tegning', 'beskrivelse', 'sha', 'fdv', 'dokument'].map((discipline) => (
              <Btn key={discipline} label={discipline} tone={forms.document.discipline === discipline ? 'brand' : 'quiet'} colors={colors} onPress={() => patch('document', 'discipline', discipline)} />
            ))}
          </View>
          <Btn label="Ny revisjon" colors={colors} onPress={() => run(addDocument(state, forms.document))} />
          {scoped(state.documents).map((doc) => (
            <Text key={doc.id} style={{ color: doc.status === 'gjeldende' ? colors.ink : colors.muted }}>
              {doc.discipline} · {doc.title} rev {doc.revision} · {doc.status}
            </Text>
          ))}
        </View>
      )}

      {section === 'moter' && project && (
        <View style={styles.stack}>
          <Field label="Tittel" value={forms.meeting.title} onChangeText={(v) => patch('meeting', 'title', v)} colors={colors} />
          <Field label="Dato" value={forms.meeting.date} onChangeText={(v) => patch('meeting', 'date', v)} placeholder="2026-09-23" colors={colors} />
          <Field label="Saksliste, ett punkt per linje" value={forms.meeting.agenda} onChangeText={(v) => patch('meeting', 'agenda', v)} colors={colors} multiline />
          <Btn
            label="Opprett møte med referatutkast"
            colors={colors}
            onPress={() => run(addMeeting(state, { ...forms.meeting, minutes: draftMinutes(forms.meeting) }))}
          />
          {scoped(state.meetings).map((row) => (
            <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.title} {row.date}</Text>
              <Text style={{ color: colors.muted }}>{row.minutes}</Text>
            </View>
          ))}
          <Text style={[styles.h2, { color: colors.ink }]}>Kontrakt og endring</Text>
          <Field label="Kontrakt" value={forms.contract.title} onChangeText={(v) => patch('contract', 'title', v)} colors={colors} />
          <Field label="Part" value={forms.contract.party} onChangeText={(v) => patch('contract', 'party', v)} colors={colors} />
          <Field label="Sum" value={forms.contract.value} onChangeText={(v) => patch('contract', 'value', v)} keyboardType="decimal-pad" colors={colors} />
          <Btn label="Lagre kontrakt" colors={colors} onPress={() => run(addContract(state, forms.contract))} />
          <Field label="Endring" value={forms.change.title} onChangeText={(v) => patch('change', 'title', v)} colors={colors} />
          <Field label="Beløp" value={forms.change.amount} onChangeText={(v) => patch('change', 'amount', v)} keyboardType="decimal-pad" colors={colors} />
          <Btn label="Varsle endring" colors={colors} onPress={() => run(addChange(state, forms.change))} />
          {scoped(state.changes).map((row) => (
            <View key={row.id} style={styles.rowWrap}>
              <Text style={{ color: colors.ink }}>{row.title} · {row.amount} kr · {row.status}</Text>
              <Btn label="Godkjenn" tone="quiet" colors={colors} onPress={() => run(setChangeStatus(state, row.id, 'godkjent'))} />
              <Btn label="Avvis" tone="danger" colors={colors} onPress={() => run(setChangeStatus(state, row.id, 'avvist'))} />
            </View>
          ))}
        </View>
      )}

      {section === 'okonomi' && project && (
        <View style={styles.stack}>
          <Text style={{ color: colors.ink }}>
            Inntekt {economy.income} · kostnad {economy.cost} · resultat {economy.result} · timer {economy.hours}
          </Text>
          <Text style={{ color: colors.muted }}>Kontrakt {economy.contract} · godkjente endringer {economy.approvedChanges} · prognose {economy.forecast}</Text>
          <View style={styles.rowWrap}>
            {['income', 'cost', 'hours'].map((kind) => (
              <Btn key={kind} label={kind === 'income' ? 'Inntekt' : kind === 'cost' ? 'Kostnad' : 'Timer'} tone={forms.entry.kind === kind ? 'brand' : 'quiet'} colors={colors} onPress={() => patch('entry', 'kind', kind)} />
            ))}
          </View>
          <Text style={[styles.label, { color: colors.muted }]}>Konto</Text>
          <View style={styles.rowWrap}>
            {ACCOUNTS.map((row) => (
              <Btn key={row.code} label={`${row.code} ${row.name}`} tone={forms.entry.account === row.code ? 'brand' : 'quiet'} colors={colors} onPress={() => patch('entry', 'account', row.code)} />
            ))}
          </View>
          <Text style={[styles.label, { color: colors.muted }]}>Prosjektkode</Text>
          <View style={styles.rowWrap}>
            {COST_CODES.map((row) => (
              <Btn key={row.code} label={`${row.code} ${row.name}`} tone={forms.entry.costCode === row.code ? 'brand' : 'quiet'} colors={colors} onPress={() => patch('entry', 'costCode', row.code)} />
            ))}
          </View>
          <Field label="Tekst" value={forms.entry.text} onChangeText={(v) => patch('entry', 'text', v)} colors={colors} />
          {forms.entry.kind === 'hours' ? (
            <>
              <Field label="Timer" value={forms.entry.hours} onChangeText={(v) => patch('entry', 'hours', v)} keyboardType="decimal-pad" colors={colors} />
              <Field label="Timepris" value={forms.entry.rate} onChangeText={(v) => patch('entry', 'rate', v)} keyboardType="decimal-pad" colors={colors} />
            </>
          ) : (
            <Field label="Beløp" value={forms.entry.amount} onChangeText={(v) => patch('entry', 'amount', v)} keyboardType="decimal-pad" colors={colors} />
          )}
          <Btn label="Før bilag" colors={colors} onPress={() => run(postEntry(state, forms.entry), () => setForms((current) => ({ ...current, entry: { ...current.entry, text: '', amount: '', hours: '' } })))} />
          {scoped(state.entries).map((row) => (
            <Text key={row.id} style={{ color: colors.ink }}>
              {row.date} {row.account}/{row.costCode} {row.text} · {row.amount} kr
            </Text>
          ))}
        </View>
      )}

      {section === 'iso' && (
        <View style={styles.stack}>
          {state.procedures.map((row) => (
            <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.id} {row.title}</Text>
              <Text style={{ color: colors.muted }}>{row.iso}</Text>
              <Text style={{ color: colors.ink }}>{row.body}</Text>
            </View>
          ))}
          {project ? (
            <>
              <View style={styles.rowWrap}>
                {ISO_STANDARDS.map((standard) => (
                  <Btn key={standard} label={standard} tone={forms.audit.standard === standard ? 'brand' : 'quiet'} colors={colors} onPress={() => patch('audit', 'standard', standard)} />
                ))}
              </View>
              <Field label="Funn" value={forms.audit.findings} onChangeText={(v) => patch('audit', 'findings', v)} colors={colors} />
              <Btn label="Registrer revisjon" colors={colors} onPress={() => run(addAudit(state, forms.audit))} />
              {scoped(state.audits).map((row) => (
                <Text key={row.id} style={{ color: colors.ink }}>{row.standard}: {row.findings}</Text>
              ))}
            </>
          ) : null}
        </View>
      )}

      {section === 'assistent' && project && (
        <View style={styles.stack}>
          {advice.map((item) => (
            <Text key={item.text} style={{ color: item.level === 'høy' ? colors.danger : colors.ink }}>{item.level}: {item.text}</Text>
          ))}
          <Text style={[styles.report, { color: colors.ink, backgroundColor: colors.card, borderColor: colors.line }]}>{projectReport(state, project.id)}</Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: colors.bg }, wide && styles.wide]}>
      <ScrollView horizontal={!wide} style={wide ? styles.navWide : styles.nav} contentContainerStyle={styles.navContent}>
        {SECTIONS.map(([id, label]) => (
          <TouchableOpacity key={id} onPress={() => { setSection(id); setError(''); }} accessibilityRole="button">
            <Text style={[styles.navItem, { color: section === id ? colors.brand : colors.muted }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner}>
        {body}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  wide: { flexDirection: 'row' },
  nav: { maxHeight: 48, flexGrow: 0 },
  navWide: { width: 180, flexGrow: 0 },
  navContent: { paddingHorizontal: 12, paddingVertical: 10, gap: 14, alignItems: 'flex-start' },
  navItem: { fontWeight: '400', fontSize: 15 },
  content: { flex: 1 },
  contentInner: { padding: 16, paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'flex-start' },
  stack: { gap: 10 },
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '400' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  inputMulti: { minHeight: 88, textAlignVertical: 'top' },
  btn: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  btnText: { fontWeight: '400', fontSize: 13 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 6 },
  summary: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 4 },
  summaryTitle: { fontWeight: '400', fontSize: 16 },
  h2: { fontWeight: '400', fontSize: 16, marginTop: 8 },
  error: { fontWeight: '400' },
  report: { borderWidth: 1, borderRadius: 16, padding: 12, fontSize: 14, lineHeight: 20 },
});
