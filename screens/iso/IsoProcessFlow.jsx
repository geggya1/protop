/**
 * Prosessen som enkel flyt: steg for steg ovenfra og ned, med ansvarlig rolle og veiene videre.
 * Standardvisning i prosessdetaljen. Kartet (IsoDiagram) er et valg for dem som vil se svømmebanene.
 */
import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { processSteps } from '../../src/iso/processFlow';

function BranchPill({ branch, onPress }) {
  const colors = useColors();
  const target = branch.toKind === 'end'
    ? `Slutt${branch.toLabel ? `: ${branch.toLabel}` : ''}`
    : `${branch.toNumber ? `${branch.toNumber} · ` : ''}${branch.toLabel}`;
  const tone = branch.label === 'Nei' || branch.label === 'Avvist' ? colors.danger : (branch.label === 'Ja' || branch.label === 'Godkjent' ? colors.success : colors.brand);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${branch.label || 'Videre'}: ${branch.back ? 'tilbake til ' : ''}${target}`}
      style={({ hovered }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: colors.line, backgroundColor: hovered ? colors.sunken : colors.card, alignSelf: 'flex-start' }]}
    >
      {branch.label ? <Text style={{ color: tone, fontSize: 12, fontWeight: '700' }}>{branch.label}</Text> : null}
      <Ionicons name={branch.back ? 'return-up-back' : 'arrow-forward'} size={13} color={colors.muted} />
      <Text style={{ color: colors.ink, fontSize: 12 }} numberOfLines={1}>{branch.back ? `Tilbake til ${target}` : target}</Text>
    </Pressable>
  );
}

function Marker({ step, last }) {
  const colors = useColors();
  const isStart = step.kind === 'start';
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 32, alignItems: 'center' }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: isStart ? `${colors.success}22` : colors.sunken }}>
          <Ionicons name={isStart ? 'play' : 'flag'} size={14} color={isStart ? colors.success : colors.muted} />
        </View>
        {!last ? <View style={{ flex: 1, width: 2, backgroundColor: colors.line, minHeight: 12 }} /> : null}
      </View>
      <View style={{ flex: 1, paddingTop: 4, paddingBottom: last ? 0 : 14 }}>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{isStart ? 'Start' : 'Slutt'}</Text>
        <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '600' }}>{step.node.label}</Text>
      </View>
    </View>
  );
}

function Step({ step, last, onSelect, targetLabel, byId }) {
  const colors = useColors();
  const n = step.node;
  const decision = n.type === 'decision';
  const target = targetLabel ? targetLabel(n) : '';
  const go = (id) => { const node = byId.get(id); if (node) onSelect?.(node); };
  return (
    <View style={{ flexDirection: 'row', gap: 12 }}>
      <View style={{ width: 32, alignItems: 'center' }}>
        <View style={{ width: 28, height: 28, borderRadius: decision ? 6 : 14, transform: decision ? [{ rotate: '45deg' }] : undefined, alignItems: 'center', justifyContent: 'center', backgroundColor: decision ? `${colors.warn}22` : colors.brand }}>
          <Text style={{ color: decision ? colors.warn : '#fff', fontSize: 12, fontWeight: '700', transform: decision ? [{ rotate: '-45deg' }] : undefined }}>{step.number}</Text>
        </View>
        {!last ? <View style={{ flex: 1, width: 2, backgroundColor: colors.line, minHeight: 12 }} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : 12 }}>
        <Pressable
          onPress={() => onSelect?.(n)}
          accessibilityRole="button"
          accessibilityLabel={`Steg ${step.number}: ${n.label}${step.role ? `, ${step.role}` : ''}`}
          style={({ hovered }) => [{ gap: 4, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: hovered ? colors.brand : colors.line, backgroundColor: colors.card }]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={{ flex: 1, color: colors.ink, fontSize: 15, fontWeight: '600' }}>{n.label}</Text>
            {n.type !== 'activity' && n.type !== 'task' ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colors.sunken }}>
                <Ionicons name={step.type.icon} size={12} color={colors.muted} />
                <Text style={{ color: colors.muted, fontSize: 11 }}>{step.type.label}</Text>
              </View>
            ) : null}
            <Ionicons name="chevron-forward" size={16} color={colors.muted} />
          </View>
          {step.role ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="person-outline" size={13} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 13 }}>{step.role}</Text>
            </View>
          ) : null}
          {n.description ? <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19 }} numberOfLines={2}>{n.description}</Text> : null}
          {target ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Ionicons name="open-outline" size={13} color={colors.brand} />
              <Text style={{ color: colors.brand, fontSize: 12 }} numberOfLines={1}>{target}</Text>
            </View>
          ) : null}
        </Pressable>
        {step.branches.length ? (
          <View style={{ gap: 6, marginTop: 8 }}>
            {step.branches.map((b) => <BranchPill key={`${b.toId}${b.label}`} branch={b} onPress={() => go(b.toId)} />)}
          </View>
        ) : null}
        {!step.branches.length && step.jump ? (
          <View style={{ marginTop: 8 }}><BranchPill branch={step.jump} onPress={() => go(step.jump.toId)} /></View>
        ) : null}
      </View>
    </View>
  );
}

export default function ProcessFlow({ diagram, onSelect, targetLabel }) {
  const colors = useColors();
  const steps = useMemo(() => processSteps(diagram), [diagram]);
  const byId = useMemo(() => new Map((diagram?.nodes || []).map((n) => [n.id, n])), [diagram]);
  if (!steps.length) return <Text style={{ color: colors.muted, fontSize: 13 }}>Prosessen har ingen steg ennå.</Text>;
  return (
    <View style={{ maxWidth: 760 }} accessibilityLabel="Prosessflyt">
      {steps.map((s, i) => (s.kind === 'step'
        ? <Step key={s.node.id} step={s} last={i === steps.length - 1} onSelect={onSelect} targetLabel={targetLabel} byId={byId} />
        : <Marker key={s.node.id} step={s} last={i === steps.length - 1} />))}
    </View>
  );
}
