import React, { useEffect, useRef, useState } from 'react';
import {
  Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  PIPELINE_COLUMNS, applicationIdleDays, stageLabel,
} from '../../src/hr/recruitment';
import {
  applicationClosed, applicationDeleteOn, deleteCountdownLabel,
} from '../../src/hr/retention';
import { radius, type } from '../../src/ui/tokens';

const isWeb = Platform.OS === 'web';
const CARD_TYPE = 'application/x-protop-application';

function hasFiles(event) {
  return Array.from(event?.dataTransfer?.types || []).includes('Files');
}

/**
 * Kort som kan dras på nett. react-native-web sender ikke draggable og drag-hendelser
 * videre fra View, så de settes på DOM-noden direkte (som CompanyStaff).
 */
function DragCard({
  id, enabled, onStart, onEnd, style, children,
}) {
  const ref = useRef(null);
  const handlers = useRef({});
  handlers.current = { onStart, onEnd };
  useEffect(() => {
    const node = ref.current;
    if (!isWeb || !enabled || !node || typeof node.addEventListener !== 'function') return undefined;
    const start = (event) => {
      try {
        event.dataTransfer.setData(CARD_TYPE, id);
        event.dataTransfer.setData('text/plain', id);
        event.dataTransfer.effectAllowed = 'move';
      } catch { /* eldre nettlesere */ }
      handlers.current.onStart(id);
    };
    const end = () => handlers.current.onEnd();
    node.setAttribute('draggable', 'true');
    node.style.cursor = 'grab';
    node.addEventListener('dragstart', start);
    node.addEventListener('dragend', end);
    return () => {
      node.removeAttribute('draggable');
      node.style.cursor = '';
      node.removeEventListener('dragstart', start);
      node.removeEventListener('dragend', end);
    };
  }, [enabled, id]);
  return <View ref={ref} style={style}>{children}</View>;
}

/** Kolonne som tar imot kort (flytt steg) og filer (ny søknad i dette steget). */
function DropColumn({
  id, enabled, onCard, onFiles, onHover, style, children, nativeID,
}) {
  const ref = useRef(null);
  const handlers = useRef({});
  handlers.current = { onCard, onFiles, onHover };
  useEffect(() => {
    const node = ref.current;
    if (!isWeb || !enabled || !node || typeof node.addEventListener !== 'function') return undefined;
    let depth = 0;
    const enter = (event) => {
      event.preventDefault();
      depth += 1;
      handlers.current.onHover(id);
    };
    const over = (event) => {
      event.preventDefault();
      try { event.dataTransfer.dropEffect = hasFiles(event) ? 'copy' : 'move'; } catch { /* eldre nettlesere */ }
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) handlers.current.onHover('');
    };
    const drop = (event) => {
      event.preventDefault();
      event.stopPropagation();
      depth = 0;
      handlers.current.onHover('');
      const files = Array.from(event.dataTransfer?.files || []);
      if (files.length) {
        handlers.current.onFiles(id, files);
        return;
      }
      let cardId = '';
      try { cardId = event.dataTransfer.getData(CARD_TYPE) || event.dataTransfer.getData('text/plain'); } catch { /* ignore */ }
      handlers.current.onCard(id, cardId);
    };
    node.addEventListener('dragenter', enter);
    node.addEventListener('dragover', over);
    node.addEventListener('dragleave', leave);
    node.addEventListener('drop', drop);
    return () => {
      node.removeEventListener('dragenter', enter);
      node.removeEventListener('dragover', over);
      node.removeEventListener('dragleave', leave);
      node.removeEventListener('drop', drop);
    };
  }, [enabled, id]);
  return <View ref={ref} style={style} nativeID={nativeID}>{children}</View>;
}

function initials(name) {
  return String(name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function ScorePill({ colors, label, value, tone }) {
  return (
    <View style={[styles.pill, { backgroundColor: `${tone}18` }]}>
      <Text style={[styles.pillText, { color: tone }]}>{`${label} ${value}`}</Text>
    </View>
  );
}

function ApplicationCard({
  colors, app, job, showJob, selected, canWrite, onOpen, onStep, retention, dragging, anonymous,
}) {
  // Anonym vurdering: navn og kontaktinfo skjules til søkeren går videre til intervju.
  const hidden = anonymous && (app.stage === 'new' || app.stage === 'screening');
  const name = hidden ? `Søker ${String(app.id).slice(-4).toUpperCase()}` : app.name;
  const idle = applicationIdleDays(app);
  const closed = app.board === 'completed';
  const outcomeTone = app.stage === 'hired' ? colors.successInk : colors.dangerInk;
  const columnIndex = PIPELINE_COLUMNS.findIndex((col) => col.id === app.stage);
  const prev = columnIndex > 0 ? PIPELINE_COLUMNS[columnIndex - 1] : null;
  const next = columnIndex >= 0 && columnIndex < PIPELINE_COLUMNS.length - 2 ? PIPELINE_COLUMNS[columnIndex + 1] : null;
  return (
    <View
      nativeID={`hr-app-${app.id}`}
      style={[
        styles.card,
        {
          borderColor: selected ? colors.brand : colors.line,
          backgroundColor: colors.card,
          opacity: dragging ? 0.45 : 1,
        },
      ]}
    >
      {/* Kortet er ikke selv en knapp: flytteknappene under kan ikke ligge inni en annen knapp. */}
      <Pressable
        onPress={() => onOpen(app.id)}
        accessibilityRole="button"
        accessibilityLabel={`Åpne søknaden fra ${name}`}
        style={styles.cardBody}
      >
        <View style={styles.cardHead}>
          <View style={[styles.avatar, { backgroundColor: `${colors.brand}1a` }]}>
            <Text style={[styles.avatarText, { color: colors.brand }]}>{hidden ? '?' : (initials(app.name) || '?')}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.cardTitle, { color: colors.ink }]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={1}>
              {app.profile?.headline || (hidden ? '' : app.email) || app.source || 'Ingen detaljer ennå'}
            </Text>
          </View>
        </View>
        {showJob && job ? (
          <Text style={[styles.cardMeta, { color: colors.muted }]} numberOfLines={1}>{job.title}</Text>
        ) : null}
        <View style={styles.pills}>
          {app.scorecards?.length ? (
            <ScorePill colors={colors} label="Score" value={`${app.score}/10`} tone={colors.brand} />
          ) : null}
          {app.ai?.match != null ? (
            <ScorePill colors={colors} label="AI" value={`${app.ai.match}/10`} tone={colors.accent} />
          ) : null}
          {app.attachments?.length ? (
            <View style={styles.metaIcon}>
              <Ionicons name="attach-outline" size={13} color={colors.muted} />
              <Text style={[styles.cardMeta, { color: colors.muted }]}>{app.attachments.length}</Text>
            </View>
          ) : null}
          {app.comments?.length ? (
            <View style={styles.metaIcon}>
              <Ionicons name="chatbubble-outline" size={12} color={colors.muted} />
              <Text style={[styles.cardMeta, { color: colors.muted }]}>{app.comments.length}</Text>
            </View>
          ) : null}
          {app.stage === 'interview' && app.interviewDate ? (
            <View style={styles.metaIcon}>
              <Ionicons name="calendar-outline" size={12} color={colors.muted} />
              <Text style={[styles.cardMeta, { color: colors.muted }]}>
                {`${app.interviewDate.slice(8, 10)}.${app.interviewDate.slice(5, 7)}${app.interviewTime ? ` ${app.interviewTime}` : ''}`}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cardFoot}>
          <Text style={[styles.cardMeta, { color: app.ownerName ? colors.ink : colors.warnInk }]} numberOfLines={1}>
            {app.ownerName ? `Ansvarlig: ${app.ownerName}` : 'Ingen ansvarlig'}
          </Text>
          {!closed && idle != null && idle >= 14 ? (
            <Text style={[styles.cardMeta, { color: colors.warnInk }]}>{`Uendret ${idle} d`}</Text>
          ) : null}
        </View>
        {closed ? (
          <Text style={[styles.outcome, { color: outcomeTone }]}>{stageLabel(app.stage)}</Text>
        ) : null}
        {applicationClosed(app) ? (
          <Text style={[styles.cardMeta, { color: colors.muted }]} nativeID={`hr-app-retention-${app.id}`}>
            {deleteCountdownLabel(applicationDeleteOn(app, retention))}
          </Text>
        ) : null}
      </Pressable>
      {canWrite && !closed && (prev || next) ? (
        <View style={styles.stepRow}>
          {prev ? (
            <Pressable
              onPress={() => onStep(app, prev.id)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Flytt tilbake til ${prev.label}`}
              style={[styles.stepBtn, { borderColor: colors.line }]}
            >
              <Ionicons name="chevron-back" size={14} color={colors.muted} />
            </Pressable>
          ) : <View />}
          {next ? (
            <Pressable
              onPress={() => onStep(app, next.id)}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Flytt til ${next.label}`}
              style={[styles.stepBtn, styles.stepNext, { borderColor: colors.line }]}
            >
              <Text style={[styles.stepText, { color: colors.ink }]} numberOfLines={1}>{next.label}</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Tavlen: én kolonne per steg og én for avsluttede.
 * Dra kort mellom kolonnene, eller slipp CV-filer i en kolonne for å legge dem inn der.
 */
export default function RecruitmentBoard({
  colors, buckets, jobsById, showJob, selectedId, canWrite, retention,
  onOpen, onMove, onFiles, anonymous = false,
}) {
  const [dragId, setDragId] = useState('');
  const [hoverCol, setHoverCol] = useState('');
  const dragRef = useRef('');

  // Filer sluppet ved siden av en kolonne skal ikke åpnes i nettleseren.
  useEffect(() => {
    if (!isWeb || !canWrite || typeof window === 'undefined') return undefined;
    const allow = (event) => { if (hasFiles(event)) event.preventDefault(); };
    window.addEventListener('dragover', allow);
    window.addEventListener('drop', allow);
    return () => {
      window.removeEventListener('dragover', allow);
      window.removeEventListener('drop', allow);
    };
  }, [canWrite]);

  return (
    <View style={styles.board} nativeID="hr-ats-board">
      {PIPELINE_COLUMNS.map((col) => {
        const rows = buckets[col.id] || [];
        const hot = hoverCol === col.id;
        return (
          <DropColumn
            key={col.id}
            id={col.id}
            enabled={canWrite}
            nativeID={`hr-ats-col-${col.id}`}
            onHover={setHoverCol}
            onCard={(target, id) => {
              const cardId = id || dragRef.current;
              dragRef.current = '';
              setDragId('');
              if (cardId) onMove(cardId, target);
            }}
            onFiles={(target, files) => onFiles(files, target === 'closed' ? 'new' : target)}
            style={[
              styles.column,
              {
                borderColor: hot ? colors.brand : colors.line,
                backgroundColor: hot ? `${colors.brand}10` : colors.bg,
                borderStyle: hot ? 'dashed' : 'solid',
              },
            ]}
          >
            <View style={styles.columnHead}>
              <Text style={[styles.columnTitle, { color: colors.ink }]} numberOfLines={1}>{col.label}</Text>
              <View style={[styles.countBadge, { backgroundColor: colors.card, borderColor: colors.line }]}>
                <Text style={[styles.countText, { color: colors.muted }]}>{rows.length}</Text>
              </View>
            </View>
            {rows.map((app) => (
              <DragCard
                key={app.id}
                id={app.id}
                enabled={canWrite}
                onStart={(id) => { dragRef.current = id; setDragId(id); }}
                onEnd={() => { dragRef.current = ''; setDragId(''); setHoverCol(''); }}
              >
                <ApplicationCard
                  colors={colors}
                  app={app}
                  job={jobsById[app.jobId]}
                  showJob={showJob}
                  selected={selectedId === app.id}
                  canWrite={canWrite}
                  onOpen={onOpen}
                  onStep={(row, stage) => onMove(row.id, stage)}
                  retention={retention}
                  dragging={dragId === app.id}
                  anonymous={anonymous}
                />
              </DragCard>
            ))}
            {rows.length === 0 ? (
              <Text style={[styles.empty, { color: colors.muted }]}>
                {canWrite && isWeb
                  ? (col.id === 'closed' ? 'Dra hit for å avslutte.' : 'Dra søknader eller slipp CV-filer hit.')
                  : 'Ingen søknader.'}
              </Text>
            ) : null}
          </DropColumn>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'stretch' },
  column: {
    flexGrow: 1,
    flexBasis: 200,
    minWidth: 190,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: 8,
    gap: 8,
    minHeight: 220,
  },
  columnHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingHorizontal: 2, paddingTop: 2,
  },
  columnTitle: { fontSize: type.label.fontSize, fontWeight: '700', flexShrink: 1 },
  countBadge: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 1 },
  countText: { fontSize: type.caption.fontSize, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: radius.card, padding: 9, gap: 5 },
  cardBody: { gap: 5 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatar: {
    width: 28, height: 28, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: type.caption.fontSize, fontWeight: '700' },
  cardTitle: { fontSize: type.label.fontSize, fontWeight: '600' },
  cardMeta: { fontSize: type.caption.fontSize, lineHeight: 15 },
  pills: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center',
  },
  pill: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
  pillText: { fontSize: type.caption.fontSize, fontWeight: '700' },
  metaIcon: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  cardFoot: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 6, alignItems: 'center',
  },
  outcome: { fontSize: type.caption.fontSize, fontWeight: '700' },
  stepRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginTop: 2,
  },
  stepBtn: {
    borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 6, paddingVertical: 3, flexDirection: 'row', alignItems: 'center',
  },
  stepNext: { gap: 2, flexShrink: 1 },
  stepText: { fontSize: type.caption.fontSize, fontWeight: '600', flexShrink: 1 },
  empty: { fontSize: type.caption.fontSize, lineHeight: 17, paddingHorizontal: 2 },
});
