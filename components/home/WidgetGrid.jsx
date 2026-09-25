import React, { useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, PanResponder, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  GRID_COLS,
  gridPixelHeight,
  intendedPlacement,
  pointerToCell,
  spanFor,
  usedRows,
  widgetBox,
} from '../../src/homeGrid';
import { helpIdForWidget, widgetMeta } from '../../src/homeWidgetCatalog';
import HomeWidgetFrame from './HomeWidgetFrame';
import ParentWidgetRenderer from './ParentWidgetRenderer';
import ChildWidgetRenderer from './ChildWidgetRenderer';
import HelpTarget from '../HelpTarget';
import { soft } from '../parentHome/softTheme';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import { immersiveWidgetCell } from './homeGlass';

export default function WidgetGrid({
  role = 'parent',
  widgets = [],
  model,
  handlers,
  canEdit = true,
  editing = false,
  onDraggingChange,
  onMove,
  onRemove,
  onCycleSize,
}) {
  const Renderer = role === 'child' ? ChildWidgetRenderer : ParentWidgetRenderer;
  const immersive = useHomeImmersive();
  const wrapRef = useRef(null);
  const origin = useRef({ x: 0, y: 0, w: 360 });
  const liftRef = useRef(null);
  const [boardW, setBoardW] = useState(360);
  const [lift, setLift] = useState(null);
  liftRef.current = lift;

  const rows = Math.max(usedRows(widgets), editing ? usedRows(widgets) + 4 : usedRows(widgets));
  const height = gridPixelHeight(Math.max(rows, editing ? 8 : 1));
  const usedHelpIds = new Set();

  const measure = (cb) => {
    const node = wrapRef.current;
    if (!node || typeof node.measureInWindow !== 'function') {
      cb(origin.current);
      return;
    }
    node.measureInWindow((x, y, w) => {
      origin.current = { x, y, w: w || boardW };
      cb(origin.current);
    });
  };

  const ghost = useMemo(() => {
    if (!lift) return null;
    const current = widgets.find((w) => w.id === lift.id);
    if (!current) return null;
    return { ...intendedPlacement(current, lift.col, lift.row), id: lift.id };
  }, [lift, widgets]);

  return (
    <View
      ref={wrapRef}
      testID="home-widget-grid"
      style={[styles.wrap, { height }]}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        if (w > 0 && w !== boardW) setBoardW(w);
      }}
    >
      {editing ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="home-dust-grid">
          {Array.from({ length: rows }).flatMap((_, row) => (
            Array.from({ length: GRID_COLS }).map((__, col) => {
              const box = widgetBox({ col: col, row: row, gw: 1, gh: 1 }, boardW);
              return (
                <View
                  key={`dust-${col}-${row}`}
                  style={[styles.dust, { left: box.left, top: box.top, width: box.width, height: box.height }]}
                />
              );
            })
          ))}
        </View>
      ) : null}

      {ghost ? (
        <View
          pointerEvents="none"
          testID="home-drop-ghost"
          style={[
            styles.ghost,
            widgetBox({ col: ghost.col, row: ghost.row, gw: ghost.gw, gh: ghost.gh }, boardW),
          ]}
        />
      ) : null}

      {widgets.map((widget) => {
        const box = widgetBox(widget, boardW);
        const helpId = !editing ? helpIdForWidget(widget, usedHelpIds) : null;
        const lifting = lift?.id === widget.id;
        const wrapStyle = [styles.abs, immersive && styles.absGlass, box, lifting && { zIndex: 20 }];
        const cell = (
          <GridCell
            widget={widget}
            role={role}
            model={model}
            handlers={handlers}
            Renderer={Renderer}
            canEdit={canEdit}
            editing={editing}
            lifting={lifting}
            dragOffset={lifting ? lift.offset : { x: 0, y: 0 }}
            onRemove={() => onRemove?.(widget.id)}
            onCycleSize={() => onCycleSize?.(widget.id)}
            onDragStart={() => {
              measure((o) => {
                const placed = widgetBox(widget, o.w);
                const next = {
                  id: widget.id,
                  col: widget.col,
                  row: widget.row,
                  startLeft: placed.left,
                  startTop: placed.top,
                  offset: { x: 0, y: 0 },
                };
                liftRef.current = next;
                setLift(next);
                onDraggingChange?.(true);
              });
            }}
            onDragDelta={(dx, dy) => {
              const o = origin.current;
              setLift((prev) => {
                const base = prev?.id === widget.id ? prev : liftRef.current;
                if (!base || base.id !== widget.id) return prev;
                const cellPos = pointerToCell(base.startLeft + dx, base.startTop + dy, o.w);
                const next = {
                  ...base,
                  col: cellPos.col,
                  row: cellPos.row,
                  offset: { x: dx, y: dy },
                };
                liftRef.current = next;
                return next;
              });
            }}
            onDragEnd={(dx, dy) => {
              const o = origin.current;
              const base = liftRef.current?.id === widget.id ? liftRef.current : widgetBox(widget, o.w);
              const left = (base.startLeft ?? base.left ?? 0) + dx;
              const top = (base.startTop ?? base.top ?? 0) + dy;
              const cellPos = pointerToCell(left, top, o.w);
              onMove?.(widget.id, cellPos.col, cellPos.row);
              liftRef.current = null;
              setLift(null);
              onDraggingChange?.(false);
            }}
          />
        );
        if (!helpId) {
          return <View key={widget.id} style={wrapStyle}>{cell}</View>;
        }
        return (
          <HelpTarget key={widget.id} id={helpId} style={wrapStyle}>
            {cell}
          </HelpTarget>
        );
      })}
    </View>
  );
}

function GridCell({
  widget, role, model, handlers, Renderer, canEdit, editing, lifting, dragOffset,
  onRemove, onCycleSize, onDragStart, onDragDelta, onDragEnd,
}) {
  const span = spanFor(widget.gw, widget.gh);
  const meta = widgetMeta(widget.type, role);
  const cbs = useRef({});
  cbs.current = { onDragStart, onDragDelta, onDragEnd };
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;

  const responder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => {
      if (!canEditRef.current || !editingRef.current) return false;
      return Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6;
    },
    onMoveShouldSetPanResponderCapture: (_, g) => (
      canEditRef.current
      && editingRef.current
      && (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8)
    ),
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => {
      cbs.current.onDragStart();
    },
    onPanResponderMove: (_, g) => {
      cbs.current.onDragDelta(g.dx, g.dy);
    },
    onPanResponderRelease: (_, g) => {
      cbs.current.onDragEnd(g.dx, g.dy);
    },
    onPanResponderTerminate: (_, g) => {
      cbs.current.onDragEnd(g.dx, g.dy);
    },
  }), []);

  return (
    <View
      {...(canEdit && editing ? responder.panHandlers : {})}
      style={[
        styles.fill,
        canEdit && Platform.OS === 'web' ? { cursor: lifting ? 'grabbing' : (editing ? 'grab' : 'pointer') } : null,
        lifting && {
          transform: [{ translateX: dragOffset.x }, { translateY: dragOffset.y }],
          opacity: 0.92,
        },
      ]}
      testID={`home-widget-${widget.type}`}
    >
      <HomeWidgetFrame widget={widget} role={role} testID={undefined}>
        <Renderer widget={widget} model={model} handlers={editing ? {} : handlers} />
      </HomeWidgetFrame>
      {editing ? (
        <View style={styles.chrome} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.kill}
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Fjern ${meta?.label || widget.type}`}
            testID={`home-remove-${widget.type}`}
          >
            <Ionicons name="close" size={14} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sizeBtn}
            onPress={onCycleSize}
            accessibilityRole="button"
            accessibilityLabel={`Størrelse ${span.label}`}
            testID={`home-size-${widget.type}`}
          >
            <Text style={styles.sizeTxt}>{span.gw}×{span.gh}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'relative', width: '100%', marginTop: 6, backgroundColor: 'transparent' },
  abs: {
    position: 'absolute',
    overflow: 'hidden',
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.88)',
  },
  absGlass: {
    ...immersiveWidgetCell,
  },
  fill: { flex: 1, width: '100%', height: '100%', overflow: 'hidden' },
  dust: {
    position: 'absolute',
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(107,143,113,0.42)',
    backgroundColor: 'rgba(107,143,113,0.08)',
  },
  ghost: {
    position: 'absolute',
    borderRadius: 14,
    backgroundColor: 'rgba(107,143,113,0.22)',
    borderWidth: 2,
    borderColor: soft.sage,
  },
  chrome: { ...StyleSheet.absoluteFillObject, zIndex: 4 },
  kill: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#C45C4A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sizeBtn: {
    alignSelf: 'flex-start',
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: soft.line,
  },
  sizeTxt: { fontSize: 11, color: soft.sage, fontFamily: Platform.OS === 'web' ? 'Inter, system-ui, sans-serif' : undefined },
});
