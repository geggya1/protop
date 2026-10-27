import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import OptionPicker from '../../components/OptionPicker';
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

const AREA_OPTIONS = TENDER_AREAS.map((area) => ({ id: area.id, label: area.name }));
const AREA_IDS = new Set(AREA_OPTIONS.map((area) => area.id));

function AreaChips({ nationwide, areaIds, colors, onNationwide, onAreas }) {
  // Ukjente regions-id-er (eldre data) beholdes slik de gjorde med knappene.
  const extra = [...areaIds].filter((id) => !AREA_IDS.has(id));
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.row}>
        <Chip label="Hele Norge" colors={colors} on={nationwide} onPress={onNationwide} hint="Hele Norge" />
      </View>
      <OptionPicker
        options={AREA_OPTIONS}
        multiple
        value={nationwide ? [] : [...areaIds].filter((id) => AREA_IDS.has(id))}
        onChange={(ids) => onAreas([...extra, ...ids])}
        placeholder={nationwide ? 'Hele Norge' : 'Velg'}
        title="Regioner"
      />
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
      {picker && departments.length ? (
        <OptionPicker
          options={[{ id: '', label: 'Alle avdelinger' }, ...departments.map((row) => ({ id: row.id, label: row.name }))]}
          value={selectedDepartmentId || ''}
          onChange={(id) => onSelectDepartment?.(id || '')}
          placeholder="Alle avdelinger"
          title="Avdeling"
          clearable={false}
        />
      ) : null}
      {!departments.length ? (
        <>
          <AreaChips
            nationwide={companyNationwide}
            areaIds={companyIds}
            colors={colors}
            onNationwide={() => onCompanyChange?.({
              nationwide: !companyNationwide,
              areaIds: companyNationwide ? [...companyIds] : [],
            })}
            onAreas={(areaIds) => onCompanyChange?.({ nationwide: false, areaIds })}
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
              onAreas={(areaIds) => onDepartmentChange?.(row.id, { nationwide: false, areaIds })}
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
