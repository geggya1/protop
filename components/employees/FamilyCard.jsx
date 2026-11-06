/**
 * «Familie og pårørende» på Gjøremål: nærmeste pårørende og barna, med Rediger som åpner
 * familievinduet (pårørende, antall barn, og navn, kjønn og fødselsdato per barn).
 *
 * Pårørende og barn er skjermet (employeesPrivate): bare personen selv, administrator og HR med
 * tilgang ser dem. Andre ser bare at noe er registrert.
 */
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatBirthDate, kidAge, kidGenderLabel } from '../../src/employees/childCare.js';
import { loadChildCare } from '../../src/employees/childCareStorage.js';
import { elevation, radius, space, type } from '../../src/ui/tokens';

const lift = Platform.OS === 'web' ? elevation[1].web : elevation[1].native;

function text(value) {
  return String(value ?? '').trim();
}

function Line({ icon, title, sub, colors }) {
  return (
    <View style={styles.line}>
      <View style={[styles.lineIcon, { backgroundColor: colors.brandSoft }]}>
        <Ionicons name={icon} size={16} color={colors.brand} />
      </View>
      <View style={styles.grow}>
        <Text style={[type.body, { color: colors.ink }]} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={[type.caption, { color: colors.muted }]} numberOfLines={2}>{sub}</Text> : null}
      </View>
    </View>
  );
}

export default function FamilyCard({
  colors, companyId, employee, reveal = false, canEdit = false, onEdit, refreshKey = 0,
}) {
  const employeeId = employee?.id || '';
  const [kids, setKids] = useState(null);

  useEffect(() => {
    let live = true;
    setKids(null);
    if (!reveal || !companyId || !employeeId) return undefined;
    loadChildCare(companyId, employeeId)
      .then((row) => { if (live) setKids(row?.kids || []); })
      .catch(() => { if (live) setKids([]); });
    return () => { live = false; };
  }, [companyId, employeeId, reveal, refreshKey]);

  const person = employee?.person || {};
  const kinName = text(person.kinName);
  const kinSub = [text(person.kinPhone), text(person.kinNote)].filter(Boolean).join(' · ');
  const summaryCount = Array.isArray(employee?.extras?.childCare?.birthYears) ? employee.extras.childCare.birthYears.length : 0;
  const count = kids ? kids.length : summaryCount;

  return (
    <View nativeID="employee-family" style={[styles.card, lift, { backgroundColor: colors.card, borderColor: colors.line }]}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <Ionicons name="home-outline" size={18} color={colors.brand} />
          <Text style={[type.cardTitle, { color: colors.ink }]} numberOfLines={1}>Familie og pårørende</Text>
        </View>
        {canEdit && onEdit ? (
          <Pressable
            nativeID="employee-family-edit"
            onPress={onEdit}
            accessibilityRole="button"
            accessibilityLabel="Rediger familie og pårørende"
            hitSlop={6}
            style={({ hovered }) => [styles.edit, { borderColor: colors.line, backgroundColor: hovered ? colors.sunken : colors.card }]}
          >
            <Ionicons name="create-outline" size={14} color={colors.brand} />
            <Text style={[type.label, { color: colors.brand }]}>Rediger</Text>
          </Pressable>
        ) : null}
      </View>

      <Text style={[type.caption, styles.section, { color: colors.muted }]}>Nærmeste pårørende</Text>
      {reveal ? (
        kinName
          ? <Line icon="person-outline" title={kinName} sub={kinSub} colors={colors} />
          : <Text style={[type.body, { color: colors.muted }]}>Ikke registrert</Text>
      ) : (
        <Text style={[type.body, { color: colors.muted }]}>{kinName ? 'Registrert (skjermet)' : 'Ikke registrert'}</Text>
      )}

      <Text style={[type.caption, styles.section, { color: colors.muted }]}>
        {count ? `Barn (${count})` : 'Barn'}
      </Text>
      {reveal && kids === null ? <Text style={[type.caption, { color: colors.muted }]}>Henter …</Text> : null}
      {reveal && kids?.length ? kids.map((kid, index) => {
        const age = kidAge(kid.birthDate);
        return (
          <Line
            key={kid.id}
            icon="happy-outline"
            title={kid.name || `Barn ${index + 1}`}
            sub={[kidGenderLabel(kid.gender), `født ${formatBirthDate(kid.birthDate)}`, age != null ? `${age} år` : ''].filter(Boolean).join(' · ')}
            colors={colors}
          />
        );
      }) : null}
      {(reveal && kids && !kids.length) || (!reveal && !count) ? (
        <Text style={[type.body, { color: colors.muted }]}>Ingen barn registrert</Text>
      ) : null}
      {!reveal && count ? <Text style={[type.body, { color: colors.muted }]}>Registrert (skjermet)</Text> : null}

      <View style={[styles.note, { backgroundColor: colors.sunken }]}>
        <Ionicons name="lock-closed-outline" size={14} color={colors.muted} />
        <Text style={[type.caption, styles.grow, { color: colors.muted }]}>
          Brukes ved ulykke og til omsorgsdager. Bare du, administrator og HR med tilgang ser dette.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.sheet, padding: space.md, gap: space.xs },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.xs },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: space.xs, flexShrink: 1, minWidth: 0 },
  edit: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 10, paddingVertical: 5 },
  section: { textTransform: 'uppercase', letterSpacing: 0.4, marginTop: space.xs },
  line: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 2 },
  lineIcon: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1, minWidth: 0 },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: space.xs, borderRadius: radius.control, padding: space.xs, marginTop: space.xs },
});
