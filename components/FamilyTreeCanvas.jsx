/**
 * Familietreet — visuelt canvas + personsentrisk pedigree + slektsoversikt.
 */
import React, { createElement, memo, useMemo } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Pressable, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AvatarBubble } from './AvatarPicker';
import { colors, radius } from '../src/theme';
import {
  layoutFamilyTree,
  buildPedigreeAround,
  personDisplayName,
  personMetaLine,
  relationLabelForGeneration,
  lifeSpanLabel,
  parentEdgeSegments,
} from '../src/utils/familyTreeLogic';

const NODE_W = 118;
const NODE_H = 102;
const MAX_CANVAS = 12000;

/**
 * Absolutt scroller utenfor flex-flyten. onLayout-mål av innholdet matet
 * tilbake i forelderen og låste fanen (viewport ↔ min-content-løkke).
 */
function WebTreePort({ canvasW, canvasH, children }) {
  return (
    <View collapsable={false} style={styles.port}>
      {createElement(
        'div',
        {
          className: 'wp-family-tree-port',
          style: {
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            overflow: 'auto',
            contain: 'strict',
            overscrollBehavior: 'contain',
          },
        },
        <View style={{ width: canvasW, height: canvasH, position: 'relative' }}>
          {children}
        </View>,
      )}
    </View>
  );
}

function ManagePencil({ person, size, onManage, placement = 'overlay' }) {
  if (!person) return null;
  return (
    <Pressable
      onPress={(e) => {
        e?.stopPropagation?.();
        onManage?.(person);
      }}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Innstillinger for ${personDisplayName(person)}`}
      style={[
        placement === 'inline' ? styles.manageBtnInline : styles.manageBtn,
        size === 'sm' && placement !== 'inline' && styles.manageBtnSm,
      ]}
    >
      <Ionicons name="pencil" size={size === 'sm' ? 11 : 12} color="#fff" />
    </Pressable>
  );
}

function PersonCard({
  person, selected, onSelect, size = 'md', placeholder, placeholderLabel, onPlaceholderPress, style,
  canManage = false, onManage, editMode = false,
}) {
  if (placeholder) {
    return (
      <TouchableOpacity
        onPress={onPlaceholderPress}
        style={[styles.node, styles.nodePlaceholder, size === 'sm' && styles.nodeSm, style]}
        accessibilityRole="button"
        accessibilityLabel={placeholderLabel || 'Legg til'}
      >
        <View style={styles.plusCircle}>
          <Ionicons name="add" size={20} color={colors.brand} />
        </View>
        <Text style={styles.placeholderTxt} numberOfLines={2}>
          {placeholderLabel || 'Legg til'}
        </Text>
      </TouchableOpacity>
    );
  }
  if (!person) return null;
  const life = lifeSpanLabel(person);
  const showPencil = editMode && canManage && !person.provisional && !!onManage;
  return (
    <TouchableOpacity
      onPress={() => onSelect?.(person)}
      accessibilityRole="button"
      accessibilityLabel={personDisplayName(person)}
      style={[
        styles.node,
        size === 'sm' && styles.nodeSm,
        selected && styles.nodeSelected,
        person.isExternal && !person.linkedUid && styles.nodeExternal,
        person.provisional && styles.nodeProvisional,
        style,
      ]}
    >
      <>
        <AvatarBubble
          photoURL={person.photoURL}
          avatarId={person.avatarId}
          name={personDisplayName(person)}
          size={size === 'sm' ? 28 : 36}
          color={person.color || colors.brand}
        />
        <Text style={styles.nodeName} numberOfLines={2}>
          {personDisplayName(person)}
        </Text>
        {life ? <Text style={styles.nodeLife} numberOfLines={1}>{life}</Text> : null}
        {person.inviteStatus === 'pending' ? (
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>Invitert</Text>
          </View>
        ) : null}
        {showPencil ? (
          <ManagePencil person={person} size={size} onManage={onManage} />
        ) : null}
      </>
    </TouchableOpacity>
  );
}

/** Helhetlig generasjonstre. */
function FamilyTreeCanvas({
  people = [],
  focusIds = [],
  selectedId = null,
  onSelect,
  compact = false,
  canManage = false,
  onManage,
  editMode = false,
}) {
  const layout = useMemo(() => {
    try {
      const next = layoutFamilyTree(people, {
        focusIds,
        nodeW: compact ? 100 : NODE_W,
        nodeH: compact ? 90 : NODE_H,
        gapX: compact ? 18 : 28,
        gapY: compact ? 56 : 72,
        pad: 20,
      });
      const width = Math.min(Math.max(Number(next.width) || 320, 1), MAX_CANVAS);
      const height = Math.min(Math.max(Number(next.height) || 200, 1), MAX_CANVAS);
      return { ...next, width, height };
    } catch (err) {
      console.warn('[familyTree] layout', err?.message || err);
      return {
        nodes: [], edges: [], width: 320, height: 200, generations: [],
      };
    }
  }, [people, focusIds, compact]);

  if (!people.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="git-network-outline" size={40} color={colors.placeholder} />
        <Text style={styles.emptyTitle}>Ingen i treet ennå</Text>
        <Text style={styles.emptySub}>
          Legg til familiemedlemmer, besteforeldre og tippoldeforeldre — også uten ProTop-bruker.
        </Text>
      </View>
    );
  }

  const nodeW = compact ? 100 : NODE_W;
  const nodeH = compact ? 90 : NODE_H;
  const canvasW = layout.width;
  const canvasH = layout.height;

  const canvas = (
    <View style={[styles.canvas, { width: canvasW, height: canvasH }]}>
      {layout.generations.map((row) => {
        const sample = layout.nodes.find((n) => n.gen === row.gen);
        if (!sample) return null;
        return (
          <Text
            key={`g-${row.gen}`}
            style={[styles.genLabel, { top: sample.y - 18 }]}
            numberOfLines={1}
          >
            {relationLabelForGeneration(row.gen)}
          </Text>
        );
      })}

      {layout.edges.map((e) => {
        if (e.type === 'partner') {
          const left = Math.min(e.x1, e.x2);
          const width = Math.abs(e.x2 - e.x1);
          return (
            <View
              key={e.id}
              style={[
                styles.partnerLine,
                { left, top: e.y1, width: Math.max(width, 2) },
              ]}
            />
          );
        }
        // Pedigree-albue via midX: ikke strekk H fra forelder til barn
        // (det koblet oldeforeldre feil på tvers av besteforeldre).
        const segments = parentEdgeSegments(e);
        return (
          <View key={e.id} pointerEvents="none">
            {segments.map((seg, i) => {
              if (seg.orient === 'v') {
                const top = Math.min(seg.y1, seg.y2);
                const height = Math.max(Math.abs(seg.y2 - seg.y1), 2);
                return (
                  <View
                    key={`${e.id}-v-${i}`}
                    style={[styles.vLine, { left: seg.x - 1, top, height }]}
                  />
                );
              }
              const left = Math.min(seg.x1, seg.x2);
              const width = Math.max(Math.abs(seg.x2 - seg.x1), 2);
              return (
                <View
                  key={`${e.id}-h-${i}`}
                  style={[styles.hLine, { left, top: seg.y, width }]}
                />
              );
            })}
          </View>
        );
      })}

      {layout.nodes.map((n) => {
        const p = n.person;
        return (
          <PersonCard
            key={n.id}
            person={p}
            selected={selectedId === n.id}
            onSelect={onSelect}
            canManage={canManage}
            onManage={onManage}
            editMode={editMode}
            style={{
              position: 'absolute',
              left: n.x,
              top: n.y,
              width: nodeW,
              height: nodeH,
              maxWidth: nodeW,
            }}
          />
        );
      })}
    </View>
  );

  // Absolutt HTML-scroller på web — treet deltar ikke i flex min-content.
  if (Platform.OS === 'web') {
    return (
      <WebTreePort canvasW={canvasW} canvasH={canvasH}>
        {canvas}
      </WebTreePort>
    );
  }

  return (
    <View style={styles.port}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        style={styles.portScroll}
        contentContainerStyle={{ flexGrow: 1 }}
        showsHorizontalScrollIndicator
      >
        <ScrollView
          nestedScrollEnabled
          style={styles.portScroll}
          contentContainerStyle={{ width: canvasW, height: canvasH + 24 }}
          showsVerticalScrollIndicator
        >
          {canvas}
        </ScrollView>
      </ScrollView>
    </View>
  );
}

export default memo(FamilyTreeCanvas);

/**
 * Personsentrisk pedigree — inspirert av MyHeritage/Ancestry:
 * besteforeldre → foreldre → deg (+partner) → barn, med «+»-plasser.
 */
export function PedigreeView({
  people = [],
  focusId,
  selectedId,
  onSelect,
  onQuickAdd,
  canManage = false,
  onManage,
  editMode = false,
}) {
  const ped = useMemo(() => buildPedigreeAround(people, focusId), [people, focusId]);
  if (!ped.focus) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptySub}>Velg en person for å se slektstreet rundt dem.</Text>
      </View>
    );
  }

  const mother = ped.parents.find((p) => p.gender === 'female') || ped.parents[0] || null;
  const father = ped.parents.find((p) => p.gender === 'male')
    || ped.parents.find((p) => p.id !== mother?.id)
    || null;
  const manage = { canManage, onManage, editMode };
  const showPlaceholders = canManage && editMode;

  return (
    <ScrollView nestedScrollEnabled contentContainerStyle={styles.pedigree}>
      {ped.grandparents.length > 0 ? (
        <View style={styles.pedRow}>
          <Text style={styles.pedLabel}>Besteforeldre</Text>
          <View style={styles.pedChips}>
            {ped.grandparents.map((p) => (
              <PersonCard
                key={p.id}
                person={p}
                size="sm"
                selected={selectedId === p.id}
                onSelect={onSelect}
                {...manage}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.pedRow}>
        <Text style={styles.pedLabel}>Foreldre</Text>
        <View style={styles.pedChips}>
          {mother ? (
            <PersonCard person={mother} selected={selectedId === mother.id} onSelect={onSelect} {...manage} />
          ) : showPlaceholders ? (
            <PersonCard
              placeholder
              placeholderLabel="Legg til mor"
              onPlaceholderPress={() => onQuickAdd?.('mother')}
            />
          ) : null}
          {father ? (
            <PersonCard person={father} selected={selectedId === father.id} onSelect={onSelect} {...manage} />
          ) : showPlaceholders ? (
            <PersonCard
              placeholder
              placeholderLabel="Legg til far"
              onPlaceholderPress={() => onQuickAdd?.('father')}
            />
          ) : null}
        </View>
      </View>

      <View style={styles.pedRow}>
        <Text style={styles.pedLabel}>Valgt</Text>
        <View style={styles.pedChips}>
          <PersonCard
            person={ped.focus}
            selected={selectedId === ped.focus.id}
            onSelect={onSelect}
            {...manage}
          />
          {ped.partners.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              selected={selectedId === p.id}
              onSelect={onSelect}
              {...manage}
            />
          ))}
          {ped.partners.length === 0 && showPlaceholders ? (
            <PersonCard
              placeholder
              placeholderLabel="Partner"
              onPlaceholderPress={() => onQuickAdd?.('partner')}
            />
          ) : null}
        </View>
      </View>

      {ped.siblings.length > 0 ? (
        <View style={styles.pedRow}>
          <Text style={styles.pedLabel}>Søsken</Text>
          <View style={styles.pedChips}>
            {ped.siblings.map((p) => (
              <PersonCard
                key={p.id}
                person={p}
                size="sm"
                selected={selectedId === p.id}
                onSelect={onSelect}
                {...manage}
              />
            ))}
            {showPlaceholders ? (
              <PersonCard
                placeholder
                placeholderLabel="Søsken"
                size="sm"
                onPlaceholderPress={() => onQuickAdd?.('sibling')}
              />
            ) : null}
          </View>
        </View>
      ) : showPlaceholders ? (
        <View style={styles.pedRow}>
          <Text style={styles.pedLabel}>Søsken</Text>
          <View style={styles.pedChips}>
            <PersonCard
              placeholder
              placeholderLabel="Legg til søsken"
              onPlaceholderPress={() => onQuickAdd?.('sibling')}
            />
          </View>
        </View>
      ) : null}

      <View style={styles.pedRow}>
        <Text style={styles.pedLabel}>Barn</Text>
        <View style={styles.pedChips}>
          {ped.children.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              selected={selectedId === p.id}
              onSelect={onSelect}
              {...manage}
            />
          ))}
          {showPlaceholders ? (
            <PersonCard
              placeholder
              placeholderLabel="Legg til barn"
              onPlaceholderPress={() => onQuickAdd?.('child')}
            />
          ) : null}
        </View>
      </View>
    </ScrollView>
  );
}

export function GenerationOverviewList({
  people = [], focusIds = [], onSelect, selectedId,
  canManage = false, onManage, editMode = false,
}) {
  const rows = useMemo(() => {
    try {
      return layoutFamilyTree(people, { focusIds }).generations;
    } catch (err) {
      console.warn('[familyTree] overview', err?.message || err);
      return [];
    }
  }, [people, focusIds]);

  if (!rows.length) return null;

  return (
    <View style={styles.overview}>
      {rows.map((row) => (
        <View key={`ov-${row.gen}`} style={styles.overviewBlock}>
          <Text style={styles.overviewTitle}>
            {relationLabelForGeneration(row.gen)}
            <Text style={styles.overviewCount}> · {row.count}</Text>
          </Text>
          <View style={styles.overviewChips}>
            {row.people.map((p) => {
              const on = selectedId === p.id;
              const life = lifeSpanLabel(p);
              const showPencil = editMode && canManage && !p.provisional && !!onManage;
              return (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => onSelect?.(p)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="button"
                >
                  <>
                    <AvatarBubble
                      photoURL={p.photoURL}
                      avatarId={p.avatarId}
                      name={personDisplayName(p)}
                      size={26}
                      color={p.color || colors.brand}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.chipName, on && styles.chipNameOn]} numberOfLines={1}>
                        {personDisplayName(p)}
                      </Text>
                      <Text style={styles.chipMeta} numberOfLines={1}>
                        {[life, personMetaLine(p)].filter(Boolean).join(' · ') || '—'}
                      </Text>
                    </View>
                    {showPencil ? (
                      <ManagePencil person={p} onManage={onManage} placement="inline" />
                    ) : null}
                  </>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

const cardBase = {
  backgroundColor: colors.card,
  borderRadius: Platform.OS === 'web' ? 12 : radius.md,
  borderWidth: 1.5,
  borderColor: colors.line,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 6,
  paddingVertical: 8,
  gap: 3,
  minWidth: 100,
  maxWidth: 130,
  minHeight: 96,
  overflow: 'visible',
  position: 'relative',
  shadowColor: '#1a2744',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
};

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
    marginTop: 8,
  },
  emptySub: {
    fontSize: 14,
    color: colors.muted,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  port: {
    flex: 1,
    flexBasis: 0,
    minHeight: 0,
    minWidth: 0,
    alignSelf: 'stretch',
    position: 'relative',
    overflow: 'hidden',
  },
  portScroll: { flex: 1, minHeight: 0, minWidth: 0 },
  canvas: { position: 'relative', backgroundColor: 'transparent' },
  genLabel: {
    position: 'absolute',
    left: 8,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.muted,
    zIndex: 2,
  },
  partnerLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#94a3b8',
    borderRadius: 1,
    marginTop: -1,
  },
  vLine: {
    position: 'absolute',
    width: 2,
    backgroundColor: '#cbd5e1',
    borderRadius: 1,
  },
  hLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: '#cbd5e1',
    borderRadius: 1,
  },
  node: { ...cardBase },
  nodeSm: { minWidth: 88, minHeight: 84, maxWidth: 110 },
  nodeSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  nodeHover: {
    borderColor: colors.brand,
  },
  manageBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
  },
  manageBtnSm: {
    width: 22,
    height: 22,
    borderRadius: 7,
    top: 3,
    right: 3,
  },
  manageBtnInline: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nodeExternal: { borderStyle: 'dashed' },
  nodeProvisional: { opacity: 0.85 },
  nodePlaceholder: {
    borderStyle: 'dashed',
    backgroundColor: '#f8fafc',
    borderColor: '#94a3b8',
  },
  plusCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderTxt: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.brand,
    textAlign: 'center',
  },
  nodeName: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.ink,
    textAlign: 'center',
    lineHeight: 15,
  },
  nodeLife: {
    fontSize: 10,
    color: colors.muted,
  },
  badge: {
    backgroundColor: colors.warn,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 6,
  },
  badgeTxt: { fontSize: 9, fontWeight: '700', color: '#fff' },
  pedigree: {
    padding: 16,
    gap: 18,
  },
  pedRow: { gap: 8 },
  pedLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.muted,
  },
  pedChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  overview: { gap: 16 },
  overviewBlock: { gap: 8 },
  overviewTitle: { fontSize: 13, fontWeight: '700', color: colors.ink },
  overviewCount: { fontWeight: '500', color: colors.muted },
  overviewChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: Platform.OS === 'web' ? 10 : radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    minWidth: 140,
    maxWidth: '100%',
    flexGrow: 1,
    flexBasis: 160,
    overflow: 'visible',
  },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  chipName: { fontSize: 13, fontWeight: '600', color: colors.ink },
  chipNameOn: { color: colors.brand },
  chipMeta: { fontSize: 11, color: colors.muted, marginTop: 1 },
});
