import assert from 'node:assert/strict';
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
  updateSja,
  toggleCheckItem,
  wasteSummary,
} from './engine.js';
import { draftMinutes, projectAdvice, projectReport, suggestIso, suggestMeasures } from './assistant.js';

function must(result) {
  assert.equal(result.ok, true, result.error || 'expected ok');
  return result.state;
}

let state = emptyProjectState();
const denied = postEntry(state, { kind: 'cost', account: '4010', costCode: '21', text: 'Betong', amount: 1000 });
assert.equal(denied.ok, false);

state = must(createProject(state, { name: 'Skolebygg', number: 'P-100', client: 'Kommune', place: 'Bodø', phase: 'produksjon', manager: 'Ada' }));
const projectId = state.activeProjectId;
assert.equal(createProject(state, { name: 'Duplikat', number: 'P-100' }).ok, false);
assert.equal(createProject(state, { name: '', number: 'P-2' }).ok, false);

state = must(addActivity(state, { name: 'Grunnarbeid', owner: 'Ola' }));
const first = state.activities[0];
state = must(addActivity(state, { name: 'Dekke', predecessorId: first.id }));
const second = state.activities.find((row) => row.name === 'Dekke');
assert.equal(setActivityProgress(state, second.id, 20).ok, false);
state = must(setActivityProgress(state, first.id, 100));
state = must(setActivityProgress(state, second.id, 50));
assert.equal(progressSummary(state, projectId).percent, 75);

state = must(addBoardNote(state, { title: 'Hjelm påbudt', body: 'Hele riggen', kind: 'påbud' }));
state = must(addSja(state, { task: 'Arbeid i høyden', hazards: 'fall fra tak', measures: '' }));
assert.equal(signSja(state, state.sja[0].id).ok, false);
state = must(updateSja(state, state.sja[0].id, {
  hazards: state.sja[0].hazards,
  measures: suggestMeasures(state.sja[0].hazards),
}));
state = must(signSja(state, state.sja[0].id));
assert.match(state.sja[0].measures, /Fallsikring/);

state = must(addIncident(state, { title: 'Løs rekkverk', severity: 'kritisk', description: 'Dekke øst' }));
state = must(closeIncident(state, state.incidents[0].id));
state = must(addInspection(state, { area: 'Dekke', date: '2026-09-23', findings: 'Rekkverk rettet' }));

state = must(addDeviation(state, { title: 'Manglende protokoll', type: 'ks', description: 'Støp' }));
assert.equal(closeDeviation(state, state.deviations[0].id, { cause: '', action: 'Ny protokoll' }).ok, false);
state = must(closeDeviation(state, state.deviations[0].id, { cause: 'Skjema ble ikke brukt', action: 'KS-mal lagt i perm' }));

state = must(addChecklist(state, { templateId: 'vernerunde' }));
const list = state.checklists[0];
state = must(toggleCheckItem(state, list.id, list.items[0].id));
state = must(addDocument(state, { title: 'Plan 1', discipline: 'tegning', note: 'A' }));
state = must(addDocument(state, { title: 'Plan 1', discipline: 'tegning', note: 'B' }));
const drawings = state.documents.filter((doc) => doc.title === 'Plan 1');
assert.equal(drawings.find((doc) => doc.revision === 1).status, 'utgått');
assert.equal(drawings.find((doc) => doc.revision === 2).status, 'gjeldende');

state = must(addMeeting(state, { title: 'Byggemøte', date: '2026-09-23', agenda: 'Fremdrift\nHMS' }));
assert.match(draftMinutes(state.meetings[0]), /Byggemøte/);
state = must(addContract(state, { title: 'Hovedentreprise', party: 'Bygg AS', value: 1000000 }));
state = must(addChange(state, { title: 'Ekstra vindfang', amount: 80000 }));
state = must(setChangeStatus(state, state.changes[0].id, 'godkjent'));

assert.equal(postEntry(state, { kind: 'income', account: '4010', costCode: '21', text: 'Feil', amount: 10 }).ok, false);
assert.equal(postEntry(state, { kind: 'hours', account: '4010', costCode: '21', text: 'Timer', hours: 2, rate: 700 }).ok, false);
state = must(postEntry(state, { kind: 'income', account: '3000', costCode: '19', text: 'A-konto', amount: 400000, date: '2026-09-01' }));
state = must(postEntry(state, { kind: 'cost', account: '4010', costCode: '21', text: 'Betong', amount: 120000, date: '2026-09-02' }));
state = must(postEntry(state, { kind: 'hours', account: '5010', costCode: '25', text: 'Forskaling', hours: 10, rate: 850, date: '2026-09-03' }));
const economy = projectEconomy(state, projectId);
assert.equal(economy.income, 400000);
assert.equal(economy.cost, 128500);
assert.equal(economy.result, 271500);
assert.equal(economy.hours, 10);
assert.equal(economy.approvedChanges, 80000);
assert.equal(economy.contract, 1000000);

state = must(checkInCrew(state, { name: 'Kari Nord', company: 'Betong AS' }));
state = must(checkOutCrew(state, state.crew[0].id));
state = must(addWaste(state, { fraction: 'Trevirke', kg: 30, sorted: true }));
state = must(addWaste(state, { fraction: 'Rest', kg: 70, sorted: false }));
assert.equal(wasteSummary(state, projectId).rate, 30);
state = must(addAudit(state, { standard: 'ISO 9001', date: '2026-09-23', findings: 'Avvikslogg i bruk' }));

const advice = projectAdvice(state, projectId);
assert.ok(advice.some((item) => /Sorteringsgrad/.test(item.text)));
assert.match(projectReport(state, projectId), /P-100/);
assert.equal(suggestIso('farlig avfall'), 'ISO 14001 kap. 8');
assert.equal(suggestIso('åpen RUH'), 'ISO 45001 kap. 8');

state = must(removeRecord(state, 'board', state.board[0].id));
assert.equal(state.board.length, 0);
const other = must(createProject(state, { name: 'Lager', number: 'P-200' }));
state = must(selectProject(other, projectId));
state = must(archiveProject(state, projectId));
assert.equal(state.projects.find((row) => row.id === projectId).status, 'arkivert');
assert.notEqual(state.activeProjectId, projectId);

console.log('project engine ok');
