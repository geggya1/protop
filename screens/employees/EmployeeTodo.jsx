/**
 * Gjøremål for én ansatt: det personen selv må gjøre eller ha på plass.
 * Full side på personsiden (fanen Gjøremål), og som «Krever oppmerksomhet» på Min side (compact).
 *
 * Dokumenter leses og signeres her (MyDocuments). HMS-kortet skannes eller fotograferes her og
 * lagres i den ansattes skjermede del (hmsSelf.js), så HR ser det i Lovpålagt.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { documentsForEmployee } from '../../src/doccontrol/model';
import { loadFilledDocs } from '../../src/forms/filledStore';
import { hmsCardRequirement, mergeHmsCards } from '../../src/hr/hmsCard';
import { loadOwnHmsCard, saveOwnHmsCard } from '../../src/hr/hmsSelf';
import { employeeVisibleSlice } from '../../src/hr/model';
import { loadEmployeeHrSlice } from '../../src/hr/storage';
import { employeeTodos, openTodoCount } from '../../src/employees/todo';
import { showSaveToast } from '../../src/ui/saveToast';
import { HrButton, HrCard, HrSectionTitle, RowLink } from '../hr/HrShared';
import HmsCardEditor from '../hr/HmsCardEditor';
import MyDocuments from '../doccontrol/MyDocuments';
import { useDocControl } from '../doccontrol/useDocControl';

const ICONS = { document: 'document-text-outline', kin: 'people-outline', hms: 'card-outline', hrTask: 'checkbox-outline' };

function personName(employee) {
  const p = employee?.person || {};
  return [p.firstName, p.middleName, p.lastName].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
}

export default function EmployeeTodo({
  colors, companyId, employee, self = true, naeringskode = '', canEdit = true,
  compact = false, onOpenTodo = null, onOpenMine = null,
}) {
  const dc = useDocControl();
  const employeeId = employee?.id || '';
  const [slice, setSlice] = useState(null);
  const [ownCard, setOwnCard] = useState(null);
  const [filled, setFilled] = useState([]);

  useEffect(() => {
    let live = true;
    setSlice(null);
    setOwnCard(null);
    if (!companyId || !employeeId) return undefined;
    loadEmployeeHrSlice(companyId, employeeId)
      .then((next) => { if (live) setSlice(next); })
      .catch(() => { if (live) setSlice(employeeVisibleSlice({}, employeeId)); });
    loadOwnHmsCard(companyId, employeeId).then((card) => { if (live) setOwnCard(card); });
    loadFilledDocs(companyId).then((list) => { if (live) setFilled((list || []).filter((row) => row.scope === 'hr')); });
    return () => { live = false; };
  }, [companyId, employeeId]);

  const docs = useMemo(
    () => documentsForEmployee(dc.controls, { acks: dc.acks, filled, uid: employee?.personUid || '', employeeId }),
    [dc.controls, dc.acks, filled, employee?.personUid, employeeId],
  );
  const card = useMemo(
    () => mergeHmsCards(slice?.hmsCards || [], ownCard ? [ownCard] : []).find((row) => row.employeeId === employeeId) || null,
    [slice, ownCard, employeeId],
  );
  const rule = hmsCardRequirement({ naeringskode, setting: slice?.settings?.hmsCard });
  const notApplicable = (slice?.compliance || []).some((row) => row.status === 'na');
  const todos = useMemo(() => employeeTodos({
    employee,
    docs,
    hms: { required: rule.required || !!card, notApplicable, card },
    hrTasks: slice?.tasks || [],
  }), [employee, docs, rule.required, notApplicable, card, slice]);
  const open = todos.filter((row) => !row.done);
  const done = todos.filter((row) => row.done);

  if (!employeeId) return null;

  async function saveCard(next) {
    const saved = await saveOwnHmsCard(companyId, employeeId, next);
    setOwnCard(saved);
    showSaveToast?.('HMS-kortet er lagret');
  }

  const attention = (
    <HrCard colors={colors}>
      <View nativeID="employee-todo-attention" style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title="Krever oppmerksomhet"
          subtitle={!slice ? 'Henter …' : (open.length ? `${openTodoCount(todos)} ${open.length === 1 ? 'punkt' : 'punkter'} gjenstår` : 'Alt er på plass.')}
        />
        {open.map((row) => (
          <RowLink
            key={row.id}
            nativeID={`employee-todo-${row.id.replace(/[^A-Za-z0-9_-]/g, '-')}`}
            colors={colors}
            title={row.title}
            subtitle={row.text}
            meta={row.urgent ? 'Haster' : ''}
            icon={ICONS[row.kind] || 'ellipse-outline'}
            onPress={() => {
              if (compact) onOpenTodo?.();
              else if (row.target === 'kin') onOpenMine?.();
            }}
          />
        ))}
        {compact && onOpenTodo ? (
          <View style={styles.actions}>
            <HrButton colors={colors} label="Åpne gjøremål" icon="list-outline" nativeID="employee-todo-open" onPress={onOpenTodo} />
          </View>
        ) : null}
      </View>
    </HrCard>
  );

  if (compact) return open.length || !slice ? attention : null;

  return (
    <View style={styles.page} nativeID="employee-todo">
      {attention}

      <MyDocuments colors={colors} employeeId={employeeId} employeeName={personName(employee)} self={self} />

      {(rule.required || card) ? (
        <HrCard colors={colors}>
          <View nativeID="employee-todo-hms" style={styles.stack}>
            <HrSectionTitle
              colors={colors}
              title="HMS-kort"
              subtitle={notApplicable ? 'HR har satt HMS-kort til «Ikke aktuelt» for deg.' : rule.text}
            />
            {!notApplicable ? (
              <HmsCardEditor
                key={employeeId}
                colors={colors}
                card={card}
                canWrite={canEdit}
                familyId={companyId}
                personName={personName(employee)}
                personBirthDate={employee?.person?.birthDate || ''}
                onSave={saveCard}
              />
            ) : null}
          </View>
        </HrCard>
      ) : null}

      {done.length ? (
        <HrCard colors={colors}>
          <View nativeID="employee-todo-done" style={styles.stack}>
            <HrSectionTitle colors={colors} title="Fullført" subtitle={`${done.length} ${done.length === 1 ? 'punkt' : 'punkter'} er på plass`} />
            {done.map((row) => (
              <View key={row.id} style={[styles.doneRow, { borderColor: colors.line }]}>
                <Text style={[styles.doneTitle, { color: colors.ink }]}>{row.title}</Text>
                {row.text ? <Text style={[styles.doneText, { color: colors.muted }]}>{row.text}</Text> : null}
              </View>
            ))}
          </View>
        </HrCard>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  stack: { gap: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  doneRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 2 },
  doneTitle: { fontSize: 14, fontWeight: '600' },
  doneText: { fontSize: 12, lineHeight: 17 },
});
