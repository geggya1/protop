import { lazyScreen } from '../../src/ui/lazyScreen';
/**
 * Gjøremål for én ansatt: det personen selv må gjøre eller ha på plass.
 * Full side på personsiden (fanen Gjøremål), og som «Krever oppmerksomhet» på Min side (compact).
 *
 * Dokumenter leses og signeres her (MyDocuments). HMS-kortet skannes eller fotograferes her og
 * lagres i den ansattes skjermede del (hmsSelf.js), så HR ser det i Lovpålagt.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { documentsForEmployee } from '../../src/doccontrol/model';
import { loadFilledDocs } from '../../src/forms/filledStore';
import { hmsCardRequirement, hmsCardStatus, mergeHmsCards } from '../../src/hr/hmsCard';
import { loadOwnHmsCard, saveOwnHmsCard } from '../../src/hr/hmsSelf';
import { employeeVisibleSlice } from '../../src/hr/model';
import { loadEmployeeHrSlice } from '../../src/hr/storage';
import { employeeTodos, openTodoCount } from '../../src/employees/todo';
import { showSaveToast } from '../../src/ui/saveToast';
import MyDocuments from '../doccontrol/MyDocuments';
import { useDocControl } from '../doccontrol/useDocControl';
import { BREAKPOINTS } from '../../src/ui/layout';
import { elevation, type, radius, space } from '../../src/ui/tokens';
const HrButton = lazyScreen(() => import('../hr/HrShared'), { name: 'HrButton', pick: 'HrButton', silent: true });
const HrCard = lazyScreen(() => import('../hr/HrShared'), { name: 'HrCard', pick: 'HrCard', silent: true });
const HrSectionTitle = lazyScreen(() => import('../hr/HrShared'), { name: 'HrSectionTitle', pick: 'HrSectionTitle', silent: true });
const RowLink = lazyScreen(() => import('../hr/HrShared'), { name: 'RowLink', pick: 'RowLink', silent: true });
const HmsCardEditor = lazyScreen(() => import('../hr/HmsCardEditor'), { name: 'HmsCardEditor', silent: true });

const lift = Platform.OS === 'web' ? elevation[1].web : elevation[1].native;

/** Nøkkeltall øverst på Gjøremål. */
function TodoKpi({ icon, label, value, hint, colors, tone }) {
  return (
    <View style={[styles.kpi, lift, { backgroundColor: tone ? tone.bg : colors.card, borderColor: colors.line }]}>
      <View style={[styles.kpiIcon, { backgroundColor: tone ? colors.card : colors.brandSoft }]}>
        <Ionicons name={icon} size={18} color={tone ? tone.ink : colors.brand} />
      </View>
      <View style={styles.kpiBody}>
        <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>{label}</Text>
        <Text style={[type.value, { color: tone ? tone.ink : colors.ink }]} numberOfLines={1}>{value}</Text>
        {hint ? <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>{hint}</Text> : null}
      </View>
    </View>
  );
}

/** «Mine gjøremål»: hvor mye som er på plass, som andel og stolpe. */
function ProgressCard({ colors, open, done, loading }) {
  const total = open + done;
  const pct = total ? Math.round((done / total) * 100) : 100;
  return (
    <View nativeID="employee-todo-progress" style={[styles.panel, lift, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.cardHead}>
        <Ionicons name="checkmark-done-outline" size={18} color={colors.brand} />
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Mine gjøremål</Text>
      </View>
      <View style={styles.progressTop}>
        <Text style={[type.value, { color: colors.ink }]}>{loading ? '…' : `${pct} %`}</Text>
        <Text style={[type.caption, { color: colors.muted }]}>{loading ? 'Henter …' : `${done} av ${total} på plass`}</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.sunken }]}>
        <View style={[styles.fill, { width: `${loading ? 0 : pct}%`, backgroundColor: colors.success }]} />
      </View>
      <View style={styles.progressLegend}>
        <Text style={[type.caption, { color: colors.muted }]}>{`${open} gjenstår`}</Text>
        <Text style={[type.caption, { color: colors.muted }]}>{`${done} fullført`}</Text>
      </View>
    </View>
  );
}

const ICONS = { document: 'document-text-outline', kin: 'people-outline', hms: 'card-outline', hrTask: 'checkbox-outline' };

function personName(employee) {
  const p = employee?.person || {};
  return [p.firstName, p.middleName, p.lastName].map((v) => String(v || '').trim()).filter(Boolean).join(' ');
}

export default function EmployeeTodo({
  colors, companyId, employee, self = true, naeringskode = '', canEdit = true,
  compact = false, always = false, onOpenTodo = null, onOpenMine = null, onOpenKin = null,
  // 'side': huskeliste i margen til høyre på hovedsiden (frister, rødt når fristen er passert).
  // 'hms': bare dokumentene og HMS-kortet (Innstillinger › HMS og dokumentasjon).
  variant = '',
  // Kort i høyre kolonne på hele siden (fravær, familie, snarveier), fra personsiden.
  aside = null,
}) {
  const [width, setWidth] = useState(0);
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
  // 'card': kortet på hovedsiden. Overskrift med antall og «Se alle», én rad per gjøremål.
  if (variant === 'card') {
    return (
      <View nativeID="employee-todo-card" style={styles.cardRoot}>
        <View style={styles.cardHead}>
          <Ionicons name="checkmark-done-outline" size={18} color={colors.brand} />
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Gjøremål</Text>
          {slice && open.length ? (
            <View style={[styles.cardBadge, { backgroundColor: open.some((row) => row.urgent || (row.due && row.due < today)) ? colors.danger : colors.brand }]}>
              <Text style={[styles.cardBadgeText, { color: colors.onBrand }]}>{open.length}</Text>
            </View>
          ) : null}
          {onOpenTodo ? (
            <Pressable onPress={onOpenTodo} accessibilityRole="link" nativeID="employee-todo-card-open" style={styles.cardLink} hitSlop={6}>
              <Text style={[styles.cardLinkText, { color: colors.brand }]}>Se alle</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.brand} />
            </Pressable>
          ) : null}
        </View>
        {!slice ? <Text style={[styles.sideMeta, { color: colors.muted }]}>Henter …</Text> : null}
        {slice && !open.length ? (
          <View style={styles.sideRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            <Text style={[styles.sideText, { color: colors.muted }]}>Alt er på plass.</Text>
          </View>
        ) : null}
        {open.slice(0, 5).map((row) => {
          const late = !!row.due && row.due < today;
          const red = late || row.urgent;
          return (
            <Pressable
              key={row.id}
              nativeID={`employee-todo-card-${row.id.replace(/[^A-Za-z0-9_-]/g, '-')}`}
              onPress={() => onOpenTodo?.()}
              accessibilityRole="button"
              accessibilityLabel={`${row.title}${row.due ? `, frist ${row.due}` : ''}`}
              style={({ hovered }) => [styles.cardRow, {
                backgroundColor: red ? colors.starSoft : colors.sunken,
                borderColor: hovered ? colors.brand : 'transparent',
              }]}
            >
              <Ionicons
                name={red ? 'alert-circle-outline' : (ICONS[row.kind] || 'ellipse-outline')}
                size={20}
                color={red ? colors.warn : colors.brand}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.cardRowText, { color: colors.ink }]} numberOfLines={2}>{row.title}</Text>
                {row.due ? (
                  <Text style={[styles.sideMeta, { color: red ? colors.dangerInk : colors.muted }]}>
                    {`${late ? 'Frist passert' : 'Frist'} ${row.due.split('-').reverse().join('.')}`}
                  </Text>
                ) : null}
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.ink} />
            </Pressable>
          );
        })}
        {open.length > 5 ? (
          <Text style={[styles.sideMeta, { color: colors.muted }]}>{`og ${open.length - 5} til`}</Text>
        ) : null}
      </View>
    );
  }

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
              else if (row.target === 'kin') (onOpenKin || onOpenMine)?.();
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

  const documentsCard = (
    <MyDocuments colors={colors} employeeId={employeeId} employeeName={personName(employee)} self={self} />
  );

  // HMS-kortet kan alltid registreres. Det er et gjøremål bare når bedriften krever det.
  const hmsCard = (
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
  );

  if (variant === 'hms') {
    return (
      <View style={styles.page} nativeID="employee-hms">
        {hmsCard}
        {documentsCard}
      </View>
    );
  }

  const doneCard = done.length ? (
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
  ) : null;

  const urgent = open.filter((row) => row.urgent || (row.due && row.due < today)).length;
  const hmsState = notApplicable ? { id: 'na', label: 'Ikke aktuelt' } : hmsCardStatus(card, today);
  const hmsTone = hmsState.id === 'expired' || (hmsState.id === 'missing' && rule.required)
    ? { bg: colors.dangerSoft, ink: colors.dangerInk }
    : hmsState.id === 'expiring' ? { bg: colors.starSoft, ink: colors.warnInk } : null;
  const hmsValue = { valid: 'Gyldig', expiring: 'Utløper snart', expired: 'Utløpt', na: 'Ikke aktuelt' }[hmsState.id]
    || (rule.required ? 'Mangler' : 'Ikke registrert');
  const loading = !slice;
  const kpis = (
    <View nativeID="employee-todo-kpis" style={[styles.kpiRow, width && width < BREAKPOINTS.tablet && styles.kpiWrap]}>
      <TodoKpi icon="list-outline" label="Åpne gjøremål" value={loading ? '…' : String(open.length)} colors={colors} />
      <TodoKpi
        icon="alert-circle-outline"
        label="Haster eller forfalt"
        value={loading ? '…' : String(urgent)}
        colors={colors}
        tone={urgent ? { bg: colors.dangerSoft, ink: colors.dangerInk } : null}
      />
      <TodoKpi icon="checkmark-circle-outline" label="Fullført" value={loading ? '…' : String(done.length)} colors={colors} />
      <TodoKpi
        icon="card-outline"
        label="HMS-kort"
        value={loading ? '…' : hmsValue}
        hint={hmsState.id === 'valid' || hmsState.id === 'expiring' || hmsState.id === 'expired' ? hmsState.label : ''}
        colors={colors}
        tone={hmsTone}
      />
    </View>
  );
  const progress = <ProgressCard colors={colors} open={open.length} done={done.length} loading={loading} />;
  const wide = width >= BREAKPOINTS.tablet;

  return (
    <View style={styles.page} nativeID="employee-todo" onLayout={(ev) => setWidth(ev.nativeEvent.layout.width)}>
      {kpis}
      {wide ? (
        <View style={styles.columns}>
          <View style={styles.mainCol}>
            {attention}
            {documentsCard}
            {hmsCard}
            {doneCard}
          </View>
          <View style={styles.sideCol}>
            {progress}
            {aside}
          </View>
        </View>
      ) : (
        <>
          {attention}
          {progress}
          {documentsCard}
          {hmsCard}
          {aside}
          {doneCard}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.md },
  kpiRow: { flexDirection: 'row', gap: space.md },
  kpiWrap: { flexWrap: 'wrap' },
  kpi: { flex: 1, flexBasis: 150, minWidth: 150, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderRadius: radius.sheet, padding: space.md },
  kpiIcon: { width: 38, height: 38, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  kpiBody: { flex: 1, minWidth: 0 },
  columns: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  mainCol: { flex: 2, minWidth: 0, gap: space.md },
  sideCol: { flex: 1, minWidth: 260, gap: space.md },
  panel: { borderWidth: 1, borderRadius: radius.sheet, padding: space.md, gap: space.sm },
  progressTop: { flexDirection: 'row', alignItems: 'baseline', gap: space.xs },
  track: { height: 10, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  progressLegend: { flexDirection: 'row', justifyContent: 'space-between' },
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
  cardRoot: { gap: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { ...type.cardTitle },
  cardBadge: { minWidth: 22, height: 22, borderRadius: radius.pill, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  cardBadgeText: { ...type.label },
  cardLink: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 'auto' },
  cardLinkText: { ...type.label },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.control, borderWidth: 1 },
  cardRowText: { ...type.label },
});
