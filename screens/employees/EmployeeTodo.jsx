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
import Svg, { Circle } from 'react-native-svg';
import { parseTodoTarget, todoActionLabel, todoAnchorId, todoTargetOf } from '../../src/employees/todoFocus';
import { scrollToAnchorSoon } from '../../src/ui/scrollToAnchor';
import { ANSATT_AREAS } from '../../src/employees/ansattAreas';
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
const HmsCardEditor = lazyScreen(() => import('../hr/HmsCardEditor'), { name: 'HmsCardEditor', silent: true });

const lift = Platform.OS === 'web' ? elevation[1].web : elevation[1].native;

/** Farge med gjennomsiktighet, for myke flater. Bare #rrggbb, ellers fargen som den er. */
function tint(color, alpha) {
  const raw = String(color || '');
  if (!/^#[0-9a-f]{6}$/i.test(raw)) return raw;
  return `${raw}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}

/** Nøkkeltall øverst på Gjøremål. Et trykk ruller til det tallet gjelder. */
function TodoKpi({
  icon, label, value, hint, colors, tone, color, onPress, nativeID,
}) {
  const ink = tone ? tone.ink : colors.ink;
  const accent = tone ? tone.ink : (color || colors.brand);
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      style={({ hovered, pressed }) => [
        styles.kpi,
        lift,
        {
          backgroundColor: tone ? tone.bg : colors.card,
          borderColor: hovered && onPress ? accent : colors.line,
          transform: pressed ? [{ scale: 0.985 }] : undefined,
        },
      ]}
    >
      <View style={[styles.kpiIcon, { backgroundColor: tone ? colors.card : tint(accent, 0.12) }]}>
        <Ionicons name={icon} size={20} color={accent} />
      </View>
      <View style={styles.kpiBody}>
        <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>{label}</Text>
        <Text style={[type.value, { color: ink }]} numberOfLines={1}>{value}</Text>
        {hint ? <Text style={[type.caption, { color: colors.muted }]} numberOfLines={1}>{hint}</Text> : null}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={16} color={colors.muted} /> : null}
    </Pressable>
  );
}

/** Ring med andelen som er på plass. */
function Ring({
  pct, colors, size = 132, stroke = 13, color, children,
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const value = Math.max(0, Math.min(100, pct || 0));
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.sunken} strokeWidth={stroke} fill="none" />
        {value > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color || colors.success}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * c} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

/** «Mine gjøremål»: hvor mye som er på plass, som ring, med fordeling per type. Radene kan trykkes. */
function ProgressCard({
  colors, open, done, loading, byKind = [], onOpen,
}) {
  const total = open + done;
  const pct = total ? Math.round((done / total) * 100) : 100;
  const all = !loading && open === 0;
  return (
    <View nativeID="employee-todo-progress" style={[styles.panel, lift, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.cardHead}>
        <Ionicons name="checkmark-done-outline" size={18} color={colors.brand} />
        <Text style={[styles.cardTitle, { color: colors.ink }]}>Mine gjøremål</Text>
      </View>
      <View style={styles.progressBody}>
        <Ring pct={loading ? 0 : pct} colors={colors} color={all ? colors.success : colors.brand}>
          <Text style={[type.value, { color: colors.ink }]}>{loading ? '…' : `${pct} %`}</Text>
          <Text style={[type.caption, { color: colors.muted }]}>på plass</Text>
        </Ring>
        <View style={styles.progressList}>
          {byKind.map((row) => (
            <Pressable
              key={row.kind}
              nativeID={`employee-todo-progress-${row.kind}`}
              onPress={onOpen ? () => onOpen(row.target) : undefined}
              disabled={!onOpen}
              accessibilityRole="button"
              accessibilityLabel={`${row.label}: ${row.open ? `${row.open} igjen` : 'på plass'}`}
              style={({ hovered }) => [styles.progressRow, hovered && { backgroundColor: colors.sunken }]}
            >
              <View style={[styles.progressDot, { backgroundColor: row.open ? row.color : colors.success }]} />
              <Text style={[type.body, styles.grow, { color: colors.ink }]} numberOfLines={1}>{row.label}</Text>
              <Text style={[type.label, { color: row.open ? colors.ink : colors.successInk }]}>
                {row.open ? `${row.open} igjen` : 'OK'}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={colors.muted} />
            </Pressable>
          ))}
          {!byKind.length && !loading ? (
            <Text style={[type.caption, { color: colors.muted }]}>Ingen gjøremål ennå.</Text>
          ) : null}
        </View>
      </View>
      <Text style={[type.caption, { color: colors.muted }]}>
        {loading ? 'Henter …' : all ? 'Alt er på plass.' : `${done} av ${total} er på plass, ${open} gjenstår.`}
      </Text>
    </View>
  );
}

const ICONS = { document: 'document-text-outline', kin: 'people-outline', hms: 'card-outline', hrTask: 'checkbox-outline' };

/** Type gjøremål: ikon, farge og navn i fordelingen, og hvor et trykk på typen fører. */
const KIND = {
  document: { icon: 'document-text', label: 'Dokumenter', color: () => ANSATT_AREAS.todo.color, target: 'documents' },
  kin: { icon: 'people', label: 'Pårørende', color: (c) => c.accent, target: 'kin' },
  hms: { icon: 'card', label: 'HMS-kort', color: (c) => c.warn, target: 'hms' },
  hrTask: { icon: 'checkbox', label: 'Oppgaver fra HR', color: (c) => c.success, target: 'attention' },
};

/** Én rad i «Krever oppmerksomhet»: ikon, tekst, frist og knapp. Hele raden kan trykkes. */
function TodoRow({
  row, colors, today, onPress, expanded, flash,
}) {
  const late = !!row.due && row.due < today;
  const red = late || row.urgent;
  const kind = KIND[row.kind] || KIND.hrTask;
  const color = red ? colors.danger : kind.color(colors);
  const hrAnchor = row.kind === 'hrTask'
    ? `employee-todo-hr-${String(row.id).replace(/^hr:/, '').replace(/[^A-Za-z0-9_-]/g, '-')}`
    : undefined;
  return (
    <Pressable
      nativeID={hrAnchor || `employee-todo-${row.id.replace(/[^A-Za-z0-9_-]/g, '-')}`}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${row.title}. ${todoActionLabel(row)}`}
      accessibilityState={row.kind === 'hrTask' ? { expanded: !!expanded } : undefined}
      style={({ hovered, pressed }) => [
        styles.todoRow,
        {
          backgroundColor: red ? colors.dangerSoft : (hovered ? colors.sunken : colors.card),
          borderColor: flash || hovered ? color : colors.line,
          transform: pressed ? [{ scale: 0.995 }] : undefined,
        },
      ]}
    >
      <View style={[styles.todoIcon, { backgroundColor: tint(color, 0.14) }]}>
        <Ionicons name={red ? 'alert-circle' : kind.icon} size={20} color={color} />
      </View>
      <View style={styles.grow}>
        <View style={styles.todoTitleRow}>
          <Text style={[type.label, styles.shrink, { color: colors.ink }]} numberOfLines={2}>{row.title}</Text>
          {row.urgent ? (
            <View style={[styles.chip, { backgroundColor: colors.danger }]}>
              <Text style={[styles.chipText, { color: '#fff' }]}>Haster</Text>
            </View>
          ) : null}
        </View>
        {row.text ? (
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={expanded ? undefined : 2}>{row.text}</Text>
        ) : null}
        {row.due ? (
          <View style={styles.dueRow}>
            <Ionicons name="calendar-outline" size={12} color={red ? colors.dangerInk : colors.muted} />
            <Text style={[type.caption, { color: red ? colors.dangerInk : colors.muted }]}>
              {`${late ? 'Frist passert' : 'Frist'} ${row.due.split('-').reverse().join('.')}`}
            </Text>
          </View>
        ) : null}
        {expanded && row.kind === 'hrTask' ? (
          <Text style={[type.caption, { color: colors.muted }]}>
            Oppgaven er gitt av HR. Gi beskjed til HR når den er gjort, så lukker de den.
          </Text>
        ) : null}
      </View>
      <View style={[styles.todoAction, { backgroundColor: tint(color, 0.1) }]}>
        <Text style={[type.label, { color }]} numberOfLines={1}>{todoActionLabel(row)}</Text>
        <Ionicons
          name={row.kind === 'hrTask' ? (expanded ? 'chevron-up' : 'chevron-down') : 'chevron-forward'}
          size={14}
          color={color}
        />
      </View>
    </Pressable>
  );
}

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
  // Fra Min side eller varsel: { target, n } (src/employees/todoFocus.js). Siden ruller dit.
  focus = null,
  // Antall åpne og om noe haster, til flisen på Min side: ({ open, urgent }) => void.
  onCount = null,
}) {
  const [width, setWidth] = useState(0);
  // Oppgave fra HR som er foldet ut, dokumentet som er åpnet og kortet som blinker etter et trykk.
  const [expandedHr, setExpandedHr] = useState('');
  const [docOpen, setDocOpen] = useState({ id: '', n: 0 });
  const [flash, setFlash] = useState('');
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

  // Gå til et gjøremål: dokumentet åpnes, HMS-kortet vises, familievinduet åpnes, oppgaven foldes ut.
  function go(target) {
    const { kind, id } = parseTodoTarget(target);
    if (kind === 'kin') {
      (onOpenKin || onOpenMine)?.();
      return;
    }
    if (kind === 'documents' && id) setDocOpen({ id, n: Date.now() });
    if (kind === 'hr' && id) setExpandedHr((prev) => (prev === id ? '' : id));
    const anchor = todoAnchorId(target);
    setFlash(anchor);
    scrollToAnchorSoon(anchor, { block: kind === 'hr' ? 'center' : 'start' });
  }

  // Fokus fra Min side: venter til gjøremålene er hentet, så raden finnes.
  useEffect(() => {
    if (!focus?.target || !slice) return undefined;
    const { kind, id } = parseTodoTarget(focus.target);
    if (kind === 'kin') {
      (onOpenKin || onOpenMine)?.();
      return undefined;
    }
    if (kind === 'documents' && id) setDocOpen({ id, n: Date.now() });
    if (kind === 'hr' && id) setExpandedHr(id);
    const anchor = todoAnchorId(focus.target);
    setFlash(anchor);
    return scrollToAnchorSoon(anchor, { block: kind === 'hr' ? 'center' : 'start' });
  }, [focus?.n, focus?.target, !!slice]); // eslint-disable-line react-hooks/exhaustive-deps

  const openCount = open.length;
  const urgentCount = open.filter((row) => row.urgent || (row.due && row.due < new Date().toISOString().slice(0, 10))).length;
  useEffect(() => {
    if (slice && onCount) onCount({ open: openCount, urgent: urgentCount });
  }, [!!slice, openCount, urgentCount]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!flash) return undefined;
    const timer = setTimeout(() => setFlash(''), 1800);
    return () => clearTimeout(timer);
  }, [flash]);

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
            <Pressable onPress={() => onOpenTodo()} accessibilityRole="link" nativeID="employee-todo-card-open" style={styles.cardLink} hitSlop={6}>
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
              onPress={() => onOpenTodo?.(todoTargetOf(row))}
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
        {open.length > 5 && onOpenTodo ? (
          <Pressable onPress={() => onOpenTodo('attention')} accessibilityRole="link" nativeID="employee-todo-card-more" hitSlop={6}>
            <Text style={[styles.cardLinkText, { color: colors.brand }]}>{`og ${open.length - 5} til`}</Text>
          </Pressable>
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
              onPress={() => onOpenTodo?.(todoTargetOf(row))}
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
          <Pressable onPress={() => onOpenTodo()} accessibilityRole="button" nativeID="employee-todo-side-open">
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
          subtitle={!slice ? 'Henter …' : (open.length ? `${openTodoCount(todos)} ${open.length === 1 ? 'punkt' : 'punkter'} gjenstår. Trykk på et punkt for å gjøre det.` : 'Alt er på plass.')}
        />
        {slice && !open.length ? (
          <View style={[styles.allDone, { backgroundColor: colors.successSoft }]}>
            <View style={[styles.todoIcon, { backgroundColor: colors.card }]}>
              <Ionicons name="checkmark-done" size={22} color={colors.successInk} />
            </View>
            <View style={styles.grow}>
              <Text style={[type.label, { color: colors.successInk }]}>Ingenting venter på deg</Text>
              <Text style={[type.caption, { color: colors.successInk }]}>Nye dokumenter og oppgaver fra HR dukker opp her.</Text>
            </View>
          </View>
        ) : null}
        {open.map((row) => {
          const target = todoTargetOf(row);
          const hrId = row.kind === 'hrTask' ? String(row.id).replace(/^hr:/, '') : '';
          return (
            <TodoRow
              key={row.id}
              row={row}
              colors={colors}
              today={today}
              expanded={!!hrId && expandedHr === hrId}
              flash={flash === todoAnchorId(target)}
              onPress={() => (compact ? onOpenTodo?.(target) : go(target))}
            />
          );
        })}
        {compact && onOpenTodo ? (
          <View style={styles.actions}>
            <HrButton colors={colors} label="Åpne gjøremål" icon="list-outline" nativeID="employee-todo-open" onPress={() => onOpenTodo()} />
          </View>
        ) : null}
      </View>
    </HrCard>
  );

  // Kompakt: på Min side alltid (veien inn til Gjøremål), på Hovedside bare når noe gjenstår.
  if (compact) return always || open.length || !slice ? attention : null;

  const flashStyle = (anchor) => (flash === anchor ? [styles.flash, { borderColor: colors.brand }] : null);
  const documentsCard = (
    <View nativeID="employee-todo-docs" style={flashStyle('employee-todo-docs')}>
      <MyDocuments
        colors={colors}
        employeeId={employeeId}
        employeeName={personName(employee)}
        self={self}
        openId={docOpen.id}
        openToken={docOpen.n}
      />
    </View>
  );

  // HMS-kortet kan alltid registreres. Det er et gjøremål bare når bedriften krever det.
  const hmsCard = (
    <HrCard colors={colors} style={flashStyle('employee-todo-hms')}>
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
          <Pressable
            key={row.id}
            nativeID={`employee-todo-done-${row.id.replace(/[^A-Za-z0-9_-]/g, '-')}`}
            onPress={() => go(todoTargetOf(row))}
            accessibilityRole="button"
            style={({ hovered }) => [styles.doneRow, { borderColor: colors.line }, hovered && { backgroundColor: colors.sunken }]}
          >
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <View style={styles.grow}>
              <Text style={[styles.doneTitle, { color: colors.ink }]}>{row.title}</Text>
              {row.text ? <Text style={[styles.doneText, { color: colors.muted }]}>{row.text}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={14} color={colors.muted} />
          </Pressable>
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
    <View nativeID="employee-todo-kpis" style={[styles.kpiRow, width && width < BREAKPOINTS.desktop && styles.kpiWrap]}>
      <TodoKpi
        nativeID="employee-todo-kpi-open"
        icon={ANSATT_AREAS.todo.icon}
        label="Åpne gjøremål"
        value={loading ? '…' : String(open.length)}
        hint={loading ? '' : (open.length ? 'Trykk for å se dem' : 'Alt er gjort')}
        colors={colors}
        color={ANSATT_AREAS.todo.color}
        onPress={() => go('attention')}
      />
      <TodoKpi
        nativeID="employee-todo-kpi-urgent"
        icon="alert-circle"
        label="Haster eller forfalt"
        value={loading ? '…' : String(urgent)}
        hint={urgent ? 'Gjør disse først' : 'Ingen frister passert'}
        colors={colors}
        color={colors.danger}
        tone={urgent ? { bg: colors.dangerSoft, ink: colors.dangerInk } : null}
        onPress={() => go('attention')}
      />
      <TodoKpi
        nativeID="employee-todo-kpi-done"
        icon="checkmark-circle"
        label="Fullført"
        value={loading ? '…' : String(done.length)}
        hint={done.length ? 'Se det som er på plass' : ''}
        colors={colors}
        color={colors.success}
        onPress={done.length ? () => go('done') : undefined}
      />
      <TodoKpi
        nativeID="employee-todo-kpi-hms"
        icon="card"
        label="HMS-kort"
        value={loading ? '…' : hmsValue}
        hint={hmsState.id === 'valid' || hmsState.id === 'expiring' || hmsState.id === 'expired' ? hmsState.label : (notApplicable ? '' : 'Trykk for å registrere')}
        colors={colors}
        color={colors.warn}
        tone={hmsTone}
        onPress={notApplicable ? undefined : () => go('hms')}
      />
    </View>
  );
  const byKind = ['document', 'kin', 'hms', 'hrTask']
    .map((kind) => {
      const rows = todos.filter((row) => row.kind === kind);
      if (!rows.length) return null;
      const first = rows.find((row) => !row.done) || rows[0];
      return {
        kind,
        label: KIND[kind].label,
        color: KIND[kind].color(colors),
        open: rows.filter((row) => !row.done).length,
        target: kind === 'kin' || kind === 'hms' ? KIND[kind].target : todoTargetOf(first),
      };
    })
    .filter(Boolean);
  const progress = (
    <ProgressCard colors={colors} open={open.length} done={done.length} loading={loading} byKind={byKind} onOpen={go} />
  );
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
  kpi: { flex: 1, flexBasis: 200, minWidth: 180, flexDirection: 'row', alignItems: 'center', gap: space.sm, borderWidth: 1, borderRadius: radius.sheet, padding: space.md },
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
  doneRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 8, paddingHorizontal: 4, borderRadius: 6 },
  center: { alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0, gap: 2 },
  shrink: { flexShrink: 1, minWidth: 0 },
  progressBody: { flexDirection: 'row', alignItems: 'center', gap: space.md, flexWrap: 'wrap' },
  progressList: { flex: 1, minWidth: 150, gap: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 6, borderRadius: 8 },
  progressDot: { width: 10, height: 10, borderRadius: radius.pill },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.card, borderWidth: 1 },
  todoIcon: { width: 40, height: 40, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  todoTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  todoAction: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6, flexShrink: 0 },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  chip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 11, fontWeight: '600' },
  allDone: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.card },
  flash: { borderWidth: 2, borderRadius: radius.sheet },
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
