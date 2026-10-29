/**
 * Ansatte på bedriftssiden: kort med bilde, avdeling, navn, stilling, e-post og telefon.
 * Alt om personen kommer fra ansattregisteret og endres der. Her velger bedriften bare
 * om listen vises, om eksterne er med, og rekkefølgen (dra og slipp på nett, piler ellers).
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Image, Linking, Platform, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { companyInitials, gridColumns, gridItemWidth } from '../../src/project/companyPage';
import { radius, space, type } from '../../src/ui/tokens';
import {
  Card, CheckRow, EmptyNote, IconAction, PillButton,
} from './ProfileParts';

const GAP = space.lg;
const isWeb = Platform.OS === 'web';

function Photo({ person, colors }) {
  if (person.photoUrl) {
    return (
      <Image
        source={{ uri: person.photoUrl }}
        style={[styles.photo, { backgroundColor: colors.sunken }]}
        resizeMode="cover"
        accessibilityLabel={`Bilde av ${person.name}`}
      />
    );
  }
  // Plassholder til personen har fått bilde i ansattregisteret.
  return (
    <View style={[styles.photo, styles.placeholder, { backgroundColor: colors.sunken }]} accessibilityLabel="Bilde mangler">
      <Ionicons name="person" size={44} color={colors.line} />
      <Text style={[type.label, { color: colors.muted }]}>{companyInitials(person.name)}</Text>
    </View>
  );
}

/**
 * Kort som kan dras på nett. react-native-web sender ikke draggable og drag-hendelser videre
 * fra View, så de settes på DOM-noden direkte.
 */
function DragCell({
  id, enabled, onStart, onOver, onDrop, onEnd, style, children,
}) {
  const ref = useRef(null);
  const handlers = useRef({});
  handlers.current = { onStart, onOver, onDrop, onEnd };
  useEffect(() => {
    const node = ref.current;
    if (!isWeb || !enabled || !node || typeof node.addEventListener !== 'function') return undefined;
    const start = (event) => {
      try {
        event.dataTransfer.setData('text/plain', id);
        event.dataTransfer.effectAllowed = 'move';
      } catch { /* eldre nettlesere */ }
      handlers.current.onStart(id);
    };
    const over = (event) => {
      event.preventDefault();
      try { event.dataTransfer.dropEffect = 'move'; } catch { /* eldre nettlesere */ }
      handlers.current.onOver(id);
    };
    const drop = (event) => {
      event.preventDefault();
      handlers.current.onDrop(id);
    };
    const end = () => handlers.current.onEnd();
    node.setAttribute('draggable', 'true');
    node.addEventListener('dragstart', start);
    node.addEventListener('dragenter', over);
    node.addEventListener('dragover', over);
    node.addEventListener('drop', drop);
    node.addEventListener('dragend', end);
    return () => {
      node.removeAttribute('draggable');
      node.removeEventListener('dragstart', start);
      node.removeEventListener('dragenter', over);
      node.removeEventListener('dragover', over);
      node.removeEventListener('drop', drop);
      node.removeEventListener('dragend', end);
    };
  }, [enabled, id]);
  return <View ref={ref} style={style}>{children}</View>;
}

function PersonCard({ person, colors }) {
  return (
    <View style={styles.person}>
      <Photo person={person} colors={colors} />
      <View style={styles.personText}>
        {person.department ? <Text style={[type.caption, { color: colors.muted }]}>{person.department}</Text> : null}
        <Text style={[type.bodyStrong, { color: colors.ink }]}>
          {person.name}
          {person.degree ? <Text style={[styles.degree, { color: colors.muted }]}>{`  ${person.degree}`}</Text> : null}
        </Text>
        {person.title ? <Text style={[type.caption, { color: colors.muted }]}>{person.title}</Text> : null}
        {person.email ? (
          <Text
            style={[type.caption, styles.contact, { color: colors.brandInk || colors.brand }]}
            onPress={() => Linking.openURL(`mailto:${person.email}`).catch(() => {})}
            accessibilityRole="link"
            numberOfLines={1}
          >
            {person.email}
          </Text>
        ) : null}
        {person.phone ? (
          <Text
            style={[type.caption, { color: colors.ink }]}
            onPress={() => Linking.openURL(`tel:${person.phone.replace(/\s/g, '')}`).catch(() => {})}
            accessibilityRole="link"
          >
            {person.phone}
          </Text>
        ) : null}
        {person.external ? <Text style={[type.caption, { color: colors.muted }]}>Ekstern</Text> : null}
      </View>
    </View>
  );
}

export default function CompanyStaff({
  people,
  visible,
  includeExternal,
  canEdit,
  colors,
  onToggleVisible,
  onToggleExternal,
  onMove,
  onShift,
  onOpenRegister,
}) {
  const [width, setWidth] = useState(0);
  const [arranging, setArranging] = useState(false);
  const [dragId, setDragId] = useState('');
  const [overId, setOverId] = useState('');
  const count = gridColumns(width, { min: 170, gap: GAP, max: 4 });
  const itemWidth = gridItemWidth(width, count, GAP);
  const list = Array.isArray(people) ? people : [];
  const showGrid = visible || canEdit;

  function drop(targetId) {
    if (dragId && targetId && dragId !== targetId) onMove(dragId, targetId);
    setDragId('');
    setOverId('');
  }

  return (
    <View style={styles.stack}>
      {canEdit ? (
        <Card colors={colors} nativeID="company-staff-settings">
          <View style={styles.settingsRow}>
            <View style={styles.flex}>
              <CheckRow
                checked={visible}
                label="Vis ansatte på profilen"
                hint="Aktive i eget personell vises med bilde, stilling og kontakt."
                onPress={onToggleVisible}
                colors={colors}
              />
              <CheckRow
                checked={includeExternal}
                label="Ta med eksterne"
                hint="Aktive eksterne og innleide. Normalt av."
                onPress={onToggleExternal}
                colors={colors}
              />
            </View>
            <View style={styles.settingsActions}>
              {list.length > 1 ? (
                <PillButton
                  label={arranging ? 'Ferdig' : 'Endre rekkefølge'}
                  icon={arranging ? 'checkmark' : 'swap-horizontal-outline'}
                  primary={arranging}
                  onPress={() => setArranging((on) => !on)}
                  colors={colors}
                  nativeID="company-staff-arrange"
                />
              ) : null}
              {onOpenRegister ? (
                <PillButton label="Åpne ansattregisteret" icon="open-outline" onPress={onOpenRegister} colors={colors} />
              ) : null}
            </View>
          </View>
          <Text style={[type.caption, { color: colors.muted }]}>
            {arranging
              ? (isWeb ? 'Dra et kort til ny plass, eller bruk pilene. Rekkefølgen lagres med en gang.' : 'Bruk pilene for å flytte. Rekkefølgen lagres med en gang.')
              : 'Navn, bilde, avdeling, stilling og kontakt hentes fra ansattregisteret og endres der.'}
            {!visible ? ' Listen er skjult for besøkende til visningen er slått på.' : ''}
          </Text>
        </Card>
      ) : null}

      {!showGrid ? (
        <Card colors={colors}>
          <EmptyNote colors={colors}>Ansatte vises ikke på profilen.</EmptyNote>
        </Card>
      ) : null}

      {showGrid && !list.length ? (
        <Card colors={colors}>
          <EmptyNote colors={colors}>Ingen aktive ansatte er registrert.</EmptyNote>
        </Card>
      ) : null}

      {showGrid && list.length ? (
        <Card colors={colors} nativeID="company-staff" style={!visible ? styles.dimmed : null}>
          <View style={styles.grid} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
            {width ? list.map((person, index) => {
              const dragging = dragId === person.id;
              const target = arranging && overId === person.id && dragId && !dragging;
              return (
                <DragCell
                  key={person.id}
                  id={person.id}
                  enabled={arranging}
                  onStart={setDragId}
                  onOver={(id) => setOverId((current) => (current === id ? current : id))}
                  onDrop={drop}
                  onEnd={() => { setDragId(''); setOverId(''); }}
                  style={[
                    { width: itemWidth },
                    arranging && styles.arranging,
                    arranging && { borderColor: target ? colors.brand : colors.line },
                    dragging && styles.dragging,
                    arranging && isWeb ? styles.grab : null,
                  ]}
                >
                  <PersonCard person={person} colors={colors} />
                  {arranging ? (
                    <View style={styles.moveRow}>
                      <IconAction icon="arrow-back" label={`Flytt ${person.name} tidligere`} onPress={() => onShift(person.id, -1)} disabled={index === 0} colors={colors} />
                      <Text style={[type.caption, { color: colors.muted }]}>{index + 1}</Text>
                      <IconAction icon="arrow-forward" label={`Flytt ${person.name} senere`} onPress={() => onShift(person.id, 1)} disabled={index === list.length - 1} colors={colors} />
                    </View>
                  ) : null}
                </DragCell>
              );
            }) : null}
          </View>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.sm },
  flex: { flex: 1, minWidth: 220, gap: space.xxs },
  settingsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, alignItems: 'flex-start' },
  settingsActions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs, flexShrink: 1, maxWidth: '100%' },
  dimmed: { opacity: 0.7 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, rowGap: space.xl },
  person: { gap: space.sm },
  photo: { width: '100%', aspectRatio: 3 / 2, borderRadius: radius.control },
  placeholder: { alignItems: 'center', justifyContent: 'center', gap: space.xxs },
  personText: { gap: 2 },
  degree: { fontSize: type.caption.fontSize, fontWeight: '400' },
  contact: { marginTop: space.xxs },
  arranging: { borderWidth: 1, borderStyle: 'dashed', borderRadius: radius.card, padding: space.xs },
  dragging: { opacity: 0.4 },
  grab: { cursor: 'grab' },
  moveRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.xs, marginTop: space.xs },
});
