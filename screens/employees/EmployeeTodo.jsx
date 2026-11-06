import { lazyScreen } from '../../src/ui/lazyScreen';
/**
 * Gjøremål for én ansatt: det personen selv må gjøre eller ha på plass.
 * Full side på personsiden (fanen Gjøremål), og som «Krever oppmerksomhet» på Min side (compact).
 *
 * Dokumenter leses og signeres her (MyDocuments). HMS-kortet skannes eller fotograferes her og
 * lagres i den ansattes skjermede del (hmsSelf.js), så HR ser det i Lovpålagt.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { documentsForEmployee } from '../../src/doccontrol/model';
import { loadFilledDocs } from '../../src/forms/filledStore';
import { hmsCardRequirement, mergeHmsCards } from '../../src/hr/hmsCard';
import { loadOwnHmsCard, saveOwnHmsCard } from '../../src/hr/hmsSelf';
import { employeeVisibleSlice } from '../../src/hr/model';
import { loadEmployeeHrSlice } from '../../src/hr/storage';
import { employeeTodos, openTodoCount } from '../../src/employees/todo';
import { showSaveToast } from '../../src/ui/saveToast';
import MyDocuments from '../doccontrol/MyDocuments';
import { useDocControl } from '../doccontrol/useDocControl';
import { type, radius } from '../../src/ui/tokens';
const HrButton = lazyScreen(() => import('../hr/HrShared'), { name: 'HrButton', pick: 'HrButton', silent: true });
const HrCard = lazyScreen(() => import('../hr/HrShared'), { name: 'HrCard', pick: 'HrCard', silent: true });
const HrSectionTitle = lazyScreen(() => import('../hr/HrShared'), { name: 'HrSectionTitle', pick: 'HrSectionTitle', silent: true });
const RowLink = lazyScreen(() => import('../hr/HrShared'), { name: 'RowLink', pick: 'RowLink', silent: true });
const HmsCardEditor = lazyScreen(() => import('../hr/HmsCardEditor'), { name: 'HmsCardEditor', silent: true });

const ICONS = { document: 'document-text-outline', kin: 'people-outline', hms: 'card-outline', hrTask: 'checkbox-outline' };

function personName(employee) {
  const p = employee?.person || {};
  return [p.firstName, p.middleName, p.lastName].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
}

export default function EmployeeTodo({
  colors, companyId, employee, self = true, naeringskode = '', canEdit = true,
  compact = false, always = false, onOpenTodo = null, onOpenMine = null,
  // 'side': huskeliste i margen til høyre på hovedsiden (frister, rødt når fristen er passert).
  variant = '',
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
    () => documentsForEmployee(dc.controls, {
      acks: dc.acks, filled, uid: employee?.personUid || '', employeeId, employee,
    }),
    [dc.controls, dc.acks, filled, employee, employeeId],
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

  const today = new Date().toISOString().slice(0, 10);
  if (variant === 'side') {
    return (
      <View nativeID="employee-todo-side" style={[styles.side, { borderColor: colors.line }]}>
        <View style={styles.sideHead}>
          <Text style={[styles.sideTitle, { color: colors.muted }]}>Gjøremål</Text>
          {slice && open.length ? (
            <View style={[styles.badge, { backgroundColor: open.some((row) => row.urgent || (row.due && row.due < today)) ? (colors.danger) : colors.brand }]}>
              <Text style={styles.badgeText}>{open.length}</Text>
            </View>
          ) : null}
        </View>
        {!slice ? <Text style={[styles.sideMeta, { color: colors.muted }]}>Henter …</Text> : null}
        {slice && !open.length ? (
          <View style={styles.sideRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[styles.sideText, { color: colors.muted }]}>Alt er på plass.</Text>
          </View>
        ) : null}
        {open.map((row) => {
          const late = !!row.due && row.due < today;
          const red = late || row.urgent;
          return (
            <Pressable
              key={row.id}
              nativeID={`employee-todo-side-${row.id.replace(/[^A-Za-z0-9_-]/g, '-')}`}
              onPress={() => onOpenTodo?.()}
              accessibilityRole="button"
              accessibilityLabel={`${row.title}${row.due ? `, frist ${row.due}` : ''}`}
              style={({ hovered }) => [styles.sideRow, hovered && { backgroundColor: colors.bg }]}
            >
              <Ionicons name="ellipse-outline" size={14} color={red ? (colors.danger) : colors.muted} style={{ marginTop: 2 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.sideText, { color: red ? (colors.danger) : colors.ink }]} numberOfLines={2}>{row.title}</Text>
                {row.due ? (
                  <Text style={[styles.sideMeta, { color: red ? (colors.danger) : colors.muted }]}>
                    {`${late ? 'Frist passert' : 'Frist'} ${row.due.split('-').reverse().join('.')}`}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          );
        })}
        {done.length ? (
          <Text style={[styles.sideMeta, { color: colors.muted }]}>{`${done.length} fullført`}</Text>
        ) : null}
        {onOpenTodo ? (
          <Pressable onPress={onOpenTodo} accessibilityRole="button" nativeID="employee-todo-side-open">
            <Text style={[styles.sideLink, { color: colors.brand }]}>Åpne gjøremål</Text>
          </Pressable>
        ) : null}
      </View>
    );
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

  // Kompakt: på Min side alltid (veien inn til Gjøremål), på Hovedside bare når noe gjenstår.
  if (compact) return always || open.length || !slice ? attention : null;

  return (
    <View style={styles.page} nativeID="employee-todo">
      {attention}

      <MyDocuments colors={colors} employeeId={employeeId} employeeName={personName(employee)} self={self} />

      {/* HMS-kortet kan alltid registreres. Det er et gjøremål bare når bedriften krever det. */}
      <HrCard colors={colors}>
        <View nativeID="employee-todo-hms" style={styles.stack}>
          <HrSectionTitle
            colors={colors}
            title="HMS-kort"
            subtitle={notApplicable
              ? 'HR har satt HMS-kort til «Ikke aktuelt».'
              : `${rule.required ? 'Påkrevd. ' : ''}Skann QR-koden eller ta bilde av forsiden, så registreres kortet og HR ser det i Lovpålagt. Det kommer varsel før kortet går ut.`}
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
  doneTitle: { fontSize: type.body.fontSize },
  side: { gap: 6 },
  sideHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  sideTitle: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  badge: { minWidth: 18, height: 18, borderRadius: radius.pill, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 11, lineHeight: 14 },
  sideRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 4, paddingHorizontal: 4, marginHorizontal: -4, borderRadius: 6 },
  sideText: { fontSize: type.label.fontSize, lineHeight: type.label.lineHeight },
  sideMeta: { fontSize: type.caption.fontSize, lineHeight: type.caption.lineHeight },
  sideLink: { fontSize: type.label.fontSize, marginTop: 4 },
  doneText: { fontSize: 12, lineHeight: 17 },
});
