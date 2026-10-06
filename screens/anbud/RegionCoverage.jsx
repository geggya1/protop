import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { TENDER_AREAS } from '../../src/anbud/catalog';

function Chip({ label, on, onPress, colors, hint }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint || label}
      accessibilityState={{ selected: !!on }}
      style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
    >
      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

function AreaChips({ nationwide, areaIds, colors, onNationwide, onArea }) {
  return (
    <View style={styles.row}>
      <Chip label="Hele Norge" colors={colors} on={nationwide} onPress={onNationwide} hint="Hele Norge" />
      {TENDER_AREAS.map((area) => (
        <Chip
          key={area.id}
          label={area.name}
          colors={colors}
          on={!nationwide && areaIds.has(area.id)}
          hint={area.name}
          onPress={() => onArea(area.id)}
        />
      ))}
    </View>
  );
}

export default function RegionCoverage({
  colors,
  departments = [],
  companyNationwide = true,
  companyAreaIds = [],
  onCompanyChange,
  onDepartmentChange,
  selectedDepartmentId = '',
  onSelectDepartment,
  picker = false,
}) {
  const companyIds = new Set(companyAreaIds);
  const visible = !departments.length
    ? []
    : (selectedDepartmentId
      ? departments.filter((row) => row.id === selectedDepartmentId)
      : departments);

  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.h, { color: colors.ink }]}>Regioner</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Velg hvilke deler av landet som skal gi treff. Hver avdeling kan dekke sine fylker, så treffene blir forskjellige.
      </Text>
      {picker && departments.length ? (
        <View style={styles.row}>
          <Chip
            label="Alle avdelinger"
            colors={colors}
            on={!selectedDepartmentId}
            hint="Vis treff for alle avdelinger"
            onPress={() => onSelectDepartment?.('')}
          />
          {departments.map((row) => (
            <Chip
              key={row.id}
              label={row.name}
              colors={colors}
              on={selectedDepartmentId === row.id}
              hint={`Vis treff for ${row.name}`}
              onPress={() => onSelectDepartment?.(row.id)}
            />
          ))}
        </View>
      ) : null}
      {!departments.length ? (
        <>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            Ingen avdelinger er registrert. Området gjelder hele bedriften. Avdelinger legges inn under Underenheter.
          </Text>
          <AreaChips
            nationwide={companyNationwide}
            areaIds={companyIds}
            colors={colors}
            onNationwide={() => onCompanyChange?.({
              nationwide: !companyNationwide,
              areaIds: companyNationwide ? [...companyIds] : [],
            })}
            onArea={(id) => {
              const next = new Set(companyIds);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              onCompanyChange?.({ nationwide: false, areaIds: [...next] });
            }}
          />
        </>
      ) : visible.map((row) => {
        const ids = new Set((row.areas || []).map((area) => area.id));
        return (
          <View key={row.id} style={{ gap: 6 }}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.name}</Text>
            <AreaChips
              nationwide={!!row.nationwide}
              areaIds={ids}
              colors={colors}
              onNationwide={() => onDepartmentChange?.(row.id, {
                nationwide: !row.nationwide,
                areaIds: [],
              })}
              onArea={(id) => {
                const next = new Set(ids);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                onDepartmentChange?.(row.id, { nationwide: false, areaIds: [...next] });
              }}
            />
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
});
