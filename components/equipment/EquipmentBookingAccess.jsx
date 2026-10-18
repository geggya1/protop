import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  activeCompanyEmployees,
  bookingAccessLabel,
  employeeMayBook,
} from '../../src/equipment/calendars';
import { normalizeEquipment } from '../../src/equipment/model';
import { displayName } from '../../src/employees/model';

/**
 * Hvem som kan booke hvert utstyr.
 * Standard er egne aktive ansatte. Øverste leder og administrator endrer listen.
 */
export default function EquipmentBookingAccess({
  equipment = [],
  employees = [],
  canEdit = false,
  colors,
  onSave,
}) {
  const [openId, setOpenId] = useState('');
  const rows = (equipment || [])
    .map(normalizeEquipment)
    .filter((row) => row.scope !== 'private')
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  const active = activeCompanyEmployees(employees);

  return (
    <View style={{ gap: 10 }} nativeID="equipment-booking-access">
      <Text style={{ color: colors.ink, fontSize: 16, fontWeight: '700' }}>Hvem kan booke</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Utstyret legger seg inn som egne kalendere. Ansatte huker av det de vil se, og booker med samme innkalling som ellers, også regelmessig. Ledig tid godtas med en gang. Opptatt tid avvises. Dette erstatter rom og utstyr i Outlook.
      </Text>
      {!canEdit ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Øverste leder og administrator endrer hvem som har tilgang.
        </Text>
      ) : null}
      {!rows.length ? <Text style={{ color: colors.muted }}>Ingen bedriftsutstyr er registrert.</Text> : null}
      {rows.map((row) => {
        const open = openId === row.id;
        const bookable = row.bookable && row.status === 'available';
        return (
          <View key={row.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{row.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {bookingAccessLabel(row, employees)}
              {row.allowRepeating ? ' · Regelmessig booking på' : ' · Regelmessig booking av'}
              {bookable ? '' : ' · Vises ikke i kalenderen'}
            </Text>
            {canEdit ? (
              <TouchableOpacity onPress={() => setOpenId(open ? '' : row.id)} accessibilityLabel={`Endre tilgang for ${row.name}`}>
                <Text style={{ color: colors.brand, fontSize: 13 }}>{open ? 'Lukk' : 'Endre tilgang'}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={{ color: colors.ink, fontSize: 13 }}>
                {active.filter((employee) => employeeMayBook(row, employee)).map((employee) => displayName(employee)).join(', ') || 'Ingen aktive ansatte'}
              </Text>
            )}
            {open && canEdit ? (
              <AccessEditor
                gear={row}
                active={active}
                colors={colors}
                onSave={(patch) => onSave?.(row.id, patch)}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function AccessEditor({ gear, active, colors, onSave }) {
  const [mode, setMode] = useState(gear.bookingAccess === 'selected' ? 'selected' : 'active');
  const [picked, setPicked] = useState(() => new Set(gear.bookingEmployeeIds || []));
  const [repeating, setRepeating] = useState(gear.allowRepeating !== false);

  function toggle(id) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        <Choice label="Alle aktive ansatte" active={mode === 'active'} colors={colors} onPress={() => setMode('active')} />
        <Choice label="Valgte ansatte" active={mode === 'selected'} colors={colors} onPress={() => setMode('selected')} />
        <Choice
          label={repeating ? 'Regelmessig booking på' : 'Regelmessig booking av'}
          active={repeating}
          colors={colors}
          onPress={() => setRepeating((value) => !value)}
        />
      </View>
      {mode === 'selected' ? (
        <View style={styles.row}>
          {active.map((employee) => (
            <Choice
              key={employee.id}
              label={displayName(employee)}
              active={picked.has(employee.id)}
              colors={colors}
              onPress={() => toggle(employee.id)}
            />
          ))}
          {!active.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen aktive ansatte.</Text> : null}
        </View>
      ) : (
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          Nye aktive ansatte får tilgang av seg selv. Deaktiverte og innleide tas ikke med.
        </Text>
      )}
      <TouchableOpacity
        onPress={() => onSave?.({
          bookingAccess: mode,
          bookingEmployeeIds: [...picked],
          allowRepeating: repeating,
        })}
        style={[styles.save, { backgroundColor: colors.brand }]}
        accessibilityLabel={`Lagre tilgang for ${gear.name}`}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre tilgang</Text>
      </TouchableOpacity>
    </View>
  );
}

function Choice({ label, active, onPress, colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.choice, { borderColor: active ? colors.brand : colors.line, backgroundColor: active ? `${colors.brand}18` : colors.card }]}
    >
      <Text style={{ color: colors.ink, fontSize: 12 }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, padding: 14, gap: 6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  save: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
});
