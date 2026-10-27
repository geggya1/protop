import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  activeCompanyEmployees,
  bookingAccessLabel,
  employeeMayBook,
} from '../../src/equipment/calendars';
import { displayName } from '../../src/employees/model';
import OptionPicker from '../OptionPicker';

/**
 * Hvem som kan booke utstyret, inne i redigeringsskjemaet.
 * Standard er egne aktive ansatte. Øverste leder og administrator endrer listen.
 * Endringene lagres sammen med resten av utstyret.
 */
export default function EquipmentBookingAccess({
  gear,
  employees = [],
  canEdit = false,
  colors,
  onChange,
}) {
  const active = activeCompanyEmployees(employees);
  const mode = gear.bookingAccess === 'selected' ? 'selected' : 'active';
  const picked = new Set(gear.bookingEmployeeIds || []);
  const repeating = gear.allowRepeating !== false;

  function toggle(id) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange?.({ bookingEmployeeIds: [...next] });
  }

  return (
    <View style={{ gap: 8 }} nativeID="equipment-booking-access">
      <Text style={{ color: colors.ink, fontWeight: '700' }}>Tilgang</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Hvem som kan se og booke utstyret i kalenderen. Ledig tid godtas med en gang. Opptatt tid avvises.
      </Text>
      {!canEdit ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, fontSize: 13 }}>
            {bookingAccessLabel(gear, employees)}
            {repeating ? ' · Regelmessig booking på' : ' · Regelmessig booking av'}
          </Text>
          <Text style={{ color: colors.ink, fontSize: 13 }}>
            {active.filter((employee) => employeeMayBook(gear, employee)).map((employee) => displayName(employee)).join(', ') || 'Ingen aktive ansatte'}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            Øverste leder og administrator endrer hvem som har tilgang.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.row}>
            <Choice label="Alle aktive ansatte" active={mode === 'active'} colors={colors} onPress={() => onChange?.({ bookingAccess: 'active' })} />
            <Choice label="Valgte ansatte" active={mode === 'selected'} colors={colors} onPress={() => onChange?.({ bookingAccess: 'selected' })} />
            <Choice
              label={repeating ? 'Regelmessig booking på' : 'Regelmessig booking av'}
              active={repeating}
              colors={colors}
              onPress={() => onChange?.({ allowRepeating: !repeating })}
            />
          </View>
          {mode === 'selected' ? (
            active.length ? (
              <OptionPicker
                options={active.map((employee) => ({ id: employee.id, label: displayName(employee) }))}
                multiple
                value={active.filter((employee) => picked.has(employee.id)).map((employee) => employee.id)}
                onChange={(ids) => {
                  // Id-er for ansatte som ikke lenger er aktive, beholdes slik knappene gjorde.
                  const stale = [...picked].filter((id) => !active.some((employee) => employee.id === id));
                  onChange?.({ bookingEmployeeIds: [...stale, ...ids] });
                }}
                title="Valgte ansatte"
              />
            ) : <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen aktive ansatte.</Text>
          ) : (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Nye aktive ansatte får tilgang av seg selv. Deaktiverte og innleide tas ikke med.
            </Text>
          )}
        </>
      )}
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
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
});
