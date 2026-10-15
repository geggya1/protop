import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayName } from '../../src/employees/model';
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  choiceLabel,
  formatNbDate,
  normalizeCase,
  normalizeMemo,
  normalizeReview,
  normalizeTask,
  REVIEW_STATUSES,
  TASK_STATUSES,
} from '../../src/hr/model';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle, RowLink,
} from './HrShared';

const TABS = [
  { id: 'cases', label: 'Saker' },
  { id: 'reviews', label: 'Samtaler' },
  { id: 'memos', label: 'Memo' },
  { id: 'tasks', label: 'Oppgaver' },
];

export default function HrFollowUp({
  colors, employees, hr, canWrite, onPatch, selectedEmployeeId,
}) {
  const [tab, setTab] = useState('cases');
  const [employeeId, setEmployeeId] = useState(selectedEmployeeId || employees[0]?.id || '');
  const people = useMemo(
    () => (employees || []).filter((e) => e?.company?.status !== 'deleted'),
    [employees],
  );

  const [caseDraft, setCaseDraft] = useState({ title: '', description: '', priority: 'normal', dueDate: '', employeeVisible: false });
  const [reviewDraft, setReviewDraft] = useState({ date: new Date().toISOString().slice(0, 10), interviewer: '', summary: '', goals: '', status: 'planned' });
  const [memoDraft, setMemoDraft] = useState({ title: '', body: '', author: '', employeeVisible: false });
  const [taskDraft, setTaskDraft] = useState({ title: '', description: '', dueDate: '', status: 'open' });

  function nameOf(id) {
    const hit = people.find((row) => row.id === id);
    return hit ? displayName(hit) : 'Uten person';
  }

  return (
    <View style={styles.page}>
      <View style={styles.chips}>
        {TABS.map((item) => (
          <HrChip key={item.id} colors={colors} label={item.label} active={tab === item.id} onPress={() => setTab(item.id)} />
        ))}
      </View>

      <HrCard colors={colors}>
        <HrSectionTitle
          colors={colors}
          title="Medarbeider"
          subtitle="Knytt sak, samtale, memo eller oppgave til en person"
        />
        <View style={styles.chips}>
          {people.map((emp) => (
            <HrChip
              key={emp.id}
              colors={colors}
              label={displayName(emp)}
              active={emp.id === employeeId}
              onPress={() => setEmployeeId(emp.id)}
            />
          ))}
        </View>
      </HrCard>

      {tab === 'cases' ? (
        <HrCard colors={colors}>
          <HrSectionTitle colors={colors} title="Saker til oppfølging" />
          {(hr.cases || []).map((row) => (
            <RowLink
              key={row.id}
              colors={colors}
              title={row.title}
              subtitle={`${nameOf(row.employeeId)} · ${choiceLabel(CASE_PRIORITIES, row.priority)}`}
              meta={choiceLabel(CASE_STATUSES, row.status)}
              onPress={() => {
                if (!canWrite) return;
                const status = row.status === 'closed' ? 'open' : 'closed';
                onPatch?.({
                  cases: (hr.cases || []).map((item) => (item.id === row.id ? { ...item, status } : item)),
                });
              }}
            />
          ))}
          {(hr.cases || []).length === 0 ? <EmptyHint colors={colors} text="Ingen saker ennå." /> : null}
          {canWrite && employeeId ? (
            <View style={styles.form}>
              <HrField colors={colors} label="Tittel" value={caseDraft.title} onChangeText={(title) => setCaseDraft((p) => ({ ...p, title }))} />
              <HrField colors={colors} label="Beskrivelse" value={caseDraft.description} onChangeText={(description) => setCaseDraft((p) => ({ ...p, description }))} multiline />
              <HrField colors={colors} label="Frist (ÅÅÅÅ-MM-DD)" value={caseDraft.dueDate} onChangeText={(dueDate) => setCaseDraft((p) => ({ ...p, dueDate }))} />
              <View style={styles.chips}>
                {CASE_PRIORITIES.map((p) => (
                  <HrChip key={p.id} colors={colors} label={p.label} active={caseDraft.priority === p.id} onPress={() => setCaseDraft((prev) => ({ ...prev, priority: p.id }))} />
                ))}
              </View>
              <HrButton
                colors={colors}
                label="Opprett sak"
                primary
                icon="add-outline"
                onPress={() => {
                  if (!caseDraft.title.trim()) return;
                  const row = normalizeCase({ ...caseDraft, employeeId });
                  onPatch?.({ cases: [row, ...(hr.cases || [])] });
                  setCaseDraft({ title: '', description: '', priority: 'normal', dueDate: '', employeeVisible: false });
                }}
              />
            </View>
          ) : null}
        </HrCard>
      ) : null}

      {tab === 'reviews' ? (
        <HrCard colors={colors}>
          <HrSectionTitle colors={colors} title="Medarbeidersamtaler" />
          {(hr.reviews || []).map((row) => (
            <RowLink
              key={row.id}
              colors={colors}
              title={nameOf(row.employeeId)}
              subtitle={row.summary || row.goals || 'Uten sammendrag'}
              meta={`${formatNbDate(row.date)} · ${choiceLabel(REVIEW_STATUSES, row.status)}`}
              onPress={() => {}}
            />
          ))}
          {(hr.reviews || []).length === 0 ? <EmptyHint colors={colors} text="Ingen samtaler registrert." /> : null}
          {canWrite && employeeId ? (
            <View style={styles.form}>
              <HrField colors={colors} label="Dato" value={reviewDraft.date} onChangeText={(date) => setReviewDraft((p) => ({ ...p, date }))} />
              <HrField colors={colors} label="Samtalepartner" value={reviewDraft.interviewer} onChangeText={(interviewer) => setReviewDraft((p) => ({ ...p, interviewer }))} />
              <HrField colors={colors} label="Sammendrag" value={reviewDraft.summary} onChangeText={(summary) => setReviewDraft((p) => ({ ...p, summary }))} multiline />
              <HrField colors={colors} label="Mål" value={reviewDraft.goals} onChangeText={(goals) => setReviewDraft((p) => ({ ...p, goals }))} multiline />
              <HrButton
                colors={colors}
                label="Lagre samtale"
                primary
                onPress={() => {
                  const row = normalizeReview({ ...reviewDraft, employeeId, employeeVisible: true });
                  onPatch?.({ reviews: [row, ...(hr.reviews || [])] });
                  setReviewDraft({ date: new Date().toISOString().slice(0, 10), interviewer: '', summary: '', goals: '', status: 'planned' });
                }}
              />
            </View>
          ) : null}
        </HrCard>
      ) : null}

      {tab === 'memos' ? (
        <HrCard colors={colors}>
          <HrSectionTitle colors={colors} title="Memo og notater" subtitle="HR-notater kan holdes private eller deles med den ansatte" />
          {(hr.memos || []).map((row) => (
            <RowLink
              key={row.id}
              colors={colors}
              title={row.title}
              subtitle={`${nameOf(row.employeeId)} · ${row.body}`}
              meta={row.employeeVisible ? 'Synlig' : 'Kun HR'}
              onPress={() => {}}
            />
          ))}
          {(hr.memos || []).length === 0 ? <EmptyHint colors={colors} text="Ingen memo ennå." /> : null}
          {canWrite && employeeId ? (
            <View style={styles.form}>
              <HrField colors={colors} label="Tittel" value={memoDraft.title} onChangeText={(title) => setMemoDraft((p) => ({ ...p, title }))} />
              <HrField colors={colors} label="Forfatter" value={memoDraft.author} onChangeText={(author) => setMemoDraft((p) => ({ ...p, author }))} />
              <HrField colors={colors} label="Notat" value={memoDraft.body} onChangeText={(body) => setMemoDraft((p) => ({ ...p, body }))} multiline />
              <HrChip
                colors={colors}
                label={memoDraft.employeeVisible ? 'Synlig for ansatt' : 'Kun HR'}
                active={!!memoDraft.employeeVisible}
                onPress={() => setMemoDraft((p) => ({ ...p, employeeVisible: !p.employeeVisible }))}
              />
              <HrButton
                colors={colors}
                label="Lagre memo"
                primary
                onPress={() => {
                  if (!memoDraft.title.trim() && !memoDraft.body.trim()) return;
                  const row = normalizeMemo({ ...memoDraft, employeeId });
                  onPatch?.({ memos: [row, ...(hr.memos || [])] });
                  setMemoDraft({ title: '', body: '', author: '', employeeVisible: false });
                }}
              />
            </View>
          ) : null}
        </HrCard>
      ) : null}

      {tab === 'tasks' ? (
        <HrCard colors={colors}>
          <HrSectionTitle colors={colors} title="Oppgaver og gjøremål" subtitle="Tildeles den enkelte ansatte og synlig på Min side" />
          {(hr.tasks || []).map((row) => (
            <RowLink
              key={row.id}
              colors={colors}
              title={row.title}
              subtitle={`${nameOf(row.employeeId)}${row.dueDate ? ` · frist ${formatNbDate(row.dueDate)}` : ''}`}
              meta={choiceLabel(TASK_STATUSES, row.status)}
              onPress={() => {
                if (!canWrite) return;
                const status = row.status === 'done' ? 'open' : 'done';
                onPatch?.({
                  tasks: (hr.tasks || []).map((item) => (item.id === row.id ? { ...item, status } : item)),
                });
              }}
            />
          ))}
          {(hr.tasks || []).length === 0 ? <EmptyHint colors={colors} text="Ingen oppgaver tildelt." /> : null}
          {canWrite && employeeId ? (
            <View style={styles.form}>
              <HrField colors={colors} label="Oppgave" value={taskDraft.title} onChangeText={(title) => setTaskDraft((p) => ({ ...p, title }))} />
              <HrField colors={colors} label="Beskrivelse" value={taskDraft.description} onChangeText={(description) => setTaskDraft((p) => ({ ...p, description }))} multiline />
              <HrField colors={colors} label="Frist" value={taskDraft.dueDate} onChangeText={(dueDate) => setTaskDraft((p) => ({ ...p, dueDate }))} />
              <HrButton
                colors={colors}
                label="Tildel oppgave"
                primary
                icon="checkbox-outline"
                onPress={() => {
                  if (!taskDraft.title.trim()) return;
                  const row = normalizeTask({ ...taskDraft, employeeId, employeeVisible: true });
                  onPatch?.({ tasks: [row, ...(hr.tasks || [])] });
                  setTaskDraft({ title: '', description: '', dueDate: '', status: 'open' });
                }}
              />
            </View>
          ) : null}
        </HrCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  form: { gap: 10, marginTop: 8 },
});
