/**
 * Prosesslerret. Brukes både i designmodus (dra, koble, velge) og lesemodus
 * (klikk åpner handling, aktivt trinn markeres). Kanter tegnes med SVG,
 * bokser er vanlige visninger, så tekst og trykk fungerer likt på web og mobil.
 */
import React, { useMemo, useRef } from 'react';
import { PanResponder, Platform, Text, View } from 'react-native';
import Svg, { Defs, Marker, Path, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import {
  EDGE_CONDITIONS, diagramBounds, edgePath, groupBounds, nodeRole, nodeType, snap,
} from '../../src/iso/processes';

const MARK = { added: { label: 'Ny', tone: 'success' }, changed: { label: 'Endret', tone: 'warn' } };

function NodeBox({ node, diagram, selected, active, done, design, scale, onSelect, onMove, onDrop, onDragStart, connecting, hasError, mark }) {
  const colors = useColors();
  const start = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  const cb = useRef({});
  cb.current = { onSelect, onMove, onDrop, onDragStart, node, scale };
  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) + Math.abs(g.dy) > 3,
    onPanResponderGrant: () => {
      start.current = { x: cb.current.node.x, y: cb.current.node.y };
      moved.current = false;
      if (design) cb.current.onDragStart?.(cb.current.node.id);
    },
    onPanResponderMove: (_, g) => {
      if (!design) return;
      if (Math.abs(g.dx) + Math.abs(g.dy) > 4) moved.current = true;
      if (!moved.current) return;
      const s = cb.current.scale || 1;
      cb.current.onMove?.(cb.current.node.id, start.current.x + g.dx / s, start.current.y + g.dy / s);
    },
    onPanResponderRelease: (evt) => {
      if (moved.current && design) cb.current.onDrop?.(cb.current.node.id);
      else {
        const ne = evt?.nativeEvent || {};
        cb.current.onSelect?.(cb.current.node.id, { additive: !!(ne.shiftKey || ne.metaKey || ne.ctrlKey) });
      }
    },
    onPanResponderTerminationRequest: () => false,
  }), [design]);

  const type = nodeType(node.type);
  const role = nodeRole(diagram, node);
  const markTone = mark ? colors[MARK[mark]?.tone] : null;
  const border = hasError ? colors.danger : (active ? colors.brand : (selected ? colors.brand : (markTone || colors.line)));
  const bg = active ? colors.brandSoft : (done ? colors.successSoft : (node.color || colors.card));
  const isDecision = node.type === 'decision';
  const isBar = node.type === 'parallel_split' || node.type === 'parallel_join';
  const pill = node.type === 'start' || node.type === 'end';

  return (
    <View
      {...responder.panHandlers}
      accessibilityRole="button"
      accessibilityLabel={`${type.label}: ${node.label}${role ? `, ${role.label}` : ''}${active ? ', aktivt trinn' : ''}`}
      style={{
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.w,
        height: node.h,
        alignItems: 'center',
        justifyContent: 'center',
        ...(Platform.OS === 'web' ? { cursor: design ? 'grab' : 'pointer', userSelect: 'none' } : {}),
      }}
    >
      {isDecision ? (
        <View style={{ position: 'absolute', width: node.w * 0.7, height: node.w * 0.7, transform: [{ rotate: '45deg' }], borderWidth: selected || active ? 2 : 1.5, borderColor: border, backgroundColor: bg, borderRadius: 6 }} />
      ) : null}
      {isBar ? <View style={{ position: 'absolute', width: node.w, height: node.h, backgroundColor: colors.ink, borderRadius: 4 }} /> : null}
      {!isDecision && !isBar ? (
        <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, borderWidth: selected || active ? 2 : 1.5, borderColor: border, backgroundColor: pill ? (node.type === 'start' ? colors.successSoft : `${colors.danger}18`) : bg, borderRadius: pill ? node.h / 2 : 12, borderStyle: connecting ? 'dashed' : 'solid' }} />
      ) : null}
      {!isBar ? (
        <View style={{ alignItems: 'center', paddingHorizontal: 8, gap: 2, maxWidth: isDecision ? node.w * 0.72 : node.w }} pointerEvents="none">
          <Ionicons name={node.icon || type.icon} size={14} color={active ? colors.brand : colors.muted} />
          <Text style={{ color: colors.ink, fontSize: 12, fontWeight: '600', textAlign: 'center' }} numberOfLines={isDecision ? 3 : 2}>{node.label}</Text>
          {role && !isDecision && !pill ? <Text style={{ color: colors.muted, fontSize: 10 }} numberOfLines={1}>{role.label}</Text> : null}
        </View>
      ) : null}
      {done && !active ? <View style={{ position: 'absolute', top: -6, right: -6 }}><Ionicons name="checkmark-circle" size={16} color={colors.success} /></View> : null}
      {mark ? (
        <View style={{ position: 'absolute', top: -9, left: 8, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 8, backgroundColor: markTone }}>
          <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{MARK[mark]?.label}</Text>
        </View>
      ) : null}
      {node.onClick?.type && node.onClick.type !== 'none' && !design ? <View style={{ position: 'absolute', bottom: 4, right: 6 }}><Ionicons name="open-outline" size={11} color={colors.brand} /></View> : null}
    </View>
  );
}

export default function IsoDiagram({
  diagram, design = false, scale = 1, offset = { x: 0, y: 0 }, selectedId = '', selectedIds = [], selectedEdgeId = '', active = [], done = [],
  errors = [], connectingFrom = '', onSelectNode, onSelectEdge, onMoveNode, onDropNode, onDragStart, onPan, onBackground, onSelectGroup,
  height = 520, marks = null,
}) {
  const colors = useColors();
  const b = diagramBounds(diagram);
  const panStart = useRef({ x: 0, y: 0 });
  const cb = useRef({});
  cb.current = { onPan, offset, onBackground };
  const bg = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { panStart.current = { ...cb.current.offset }; },
    onPanResponderMove: (_, g) => cb.current.onPan?.({ x: panStart.current.x + g.dx, y: panStart.current.y + g.dy }),
    onPanResponderRelease: (_, g) => { if (Math.abs(g.dx) + Math.abs(g.dy) < 4) cb.current.onBackground?.(); },
  }), []);
  const map = new Map(diagram.nodes.map((n) => [n.id, n]));
  const errorIds = new Set(errors.map((e) => e.nodeId).filter(Boolean));
  const activeSet = new Set(active);
  const doneSet = new Set(done);
  const selSet = new Set([selectedId, ...selectedIds].filter(Boolean));
  const W = Math.max(b.x + b.w, 1200);
  const H = Math.max(b.y + b.h, 600);

  return (
    <View
      {...bg.panHandlers}
      style={{ height, overflow: 'hidden', borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.sunken, ...(Platform.OS === 'web' ? { cursor: 'move', touchAction: 'none' } : {}) }}
    >
      <View style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, transform: [{ translateX: offset.x }, { translateY: offset.y }, { scale }], ...(Platform.OS === 'web' ? { transformOrigin: '0 0' } : {}) }}>
        {design ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: H, ...(Platform.OS === 'web' ? { backgroundImage: `radial-gradient(${colors.line} 1px, transparent 1px)`, backgroundSize: '16px 16px' } : {}) }} />
        ) : null}
        {(diagram.lanes || []).map((lane, i) => (
          <View key={lane.id} pointerEvents="none" style={{ position: 'absolute', left: 0, top: lane.y, width: W, height: lane.h, borderTopWidth: 1, borderBottomWidth: i === diagram.lanes.length - 1 ? 1 : 0, borderColor: colors.line, backgroundColor: i % 2 ? 'transparent' : `${colors.brand}08` }}>
            <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700', padding: 6 }}>{lane.label.toUpperCase()}</Text>
          </View>
        ))}
        {(diagram.groups || []).map((g) => {
          const gb = groupBounds(diagram, g);
          if (!gb) return null;
          const on = g.nodeIds.every((id) => selSet.has(id));
          return (
            <View key={g.id} pointerEvents="box-none" style={{ position: 'absolute', left: gb.x, top: gb.y, width: gb.w, height: gb.h, borderWidth: 1.5, borderStyle: 'dashed', borderColor: on ? colors.brand : colors.muted, borderRadius: 14 }}>
              <Text
                onPress={onSelectGroup ? () => onSelectGroup(g.id) : undefined}
                style={{ position: 'absolute', left: 10, top: 2, color: on ? colors.brand : colors.muted, fontSize: 11, fontWeight: '700' }}
              >
                {g.label}
              </Text>
            </View>
          );
        })}
        <Svg width={W} height={H} style={{ position: 'absolute', left: 0, top: 0 }}>
          <Defs>
            <Marker id="iso-arrow" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
              <Path d="M0,0 L10,5 L0,10 z" fill={colors.muted} />
            </Marker>
            <Marker id="iso-arrow-on" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
              <Path d="M0,0 L10,5 L0,10 z" fill={colors.brand} />
            </Marker>
          </Defs>
          {diagram.edges.map((e) => {
            const from = map.get(e.from);
            const to = map.get(e.to);
            if (!from || !to) return null;
            const p = edgePath(from, to);
            const on = e.id === selectedEdgeId;
            const label = e.label || (e.condition !== 'always' ? EDGE_CONDITIONS.find((c) => c.id === e.condition)?.label : '');
            return (
              <React.Fragment key={e.id}>
                <Path d={p.d} stroke="transparent" strokeWidth={14} fill="none" onPress={design ? () => onSelectEdge?.(e.id) : undefined} />
                <Path d={p.d} stroke={on ? colors.brand : colors.muted} strokeWidth={on ? 2.5 : 1.5} fill="none" markerEnd={on ? 'url(#iso-arrow-on)' : 'url(#iso-arrow)'} />
                {label ? <SvgText x={p.lx + 4} y={p.ly - 5} fontSize={11} fill={colors.ink} onPress={design ? () => onSelectEdge?.(e.id) : undefined}>{label}</SvgText> : null}
              </React.Fragment>
            );
          })}
        </Svg>
        {diagram.nodes.map((n) => (
          <NodeBox
            key={n.id}
            node={n}
            diagram={diagram}
            design={design}
            scale={scale}
            selected={selSet.has(n.id)}
            mark={marks?.[n.id] || ''}
            onDragStart={onDragStart}
            active={activeSet.has(n.id)}
            done={doneSet.has(n.id)}
            hasError={errorIds.has(n.id)}
            connecting={!!connectingFrom && n.id !== connectingFrom}
            onSelect={onSelectNode}
            onMove={onMoveNode}
            onDrop={onDropNode}
          />
        ))}
      </View>
    </View>
  );
}

export function fitView(diagram, width, height) {
  const b = diagramBounds(diagram);
  const scale = Math.max(0.35, Math.min(1.2, (width - 24) / b.w, (height - 24) / b.h));
  return { scale, offset: { x: -b.x * scale + 12, y: -b.y * scale + 12 } };
}

export { snap };
