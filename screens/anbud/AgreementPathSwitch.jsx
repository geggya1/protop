import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLayout } from '../../src/theme';
import InfoButton from '../../components/InfoButton';
import ScrollSheet from '../../components/ScrollSheet';

/** Veier under Kontrakt / avtale: behandle utkast eller registrere en avtale som allerede er inngått. */
export default function AgreementPathSwitch({ colors, value, onChange, options }) {
  const { isPhone } = useLayout();
  const [open, setOpen] = useState(false);
  if (isPhone) {
    const current = options.find((row) => row[0] === value) || options[0];
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TouchableOpacity
          onPress={() => setOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Filter"
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            borderWidth: 1,
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderColor: colors.brand,
            backgroundColor: colors.brandSoft,
          }}
        >
          <Ionicons name="funnel-outline" size={16} color={colors.brand} />
          <Text style={{ color: colors.brand }}>{current?.[1] || 'Filter'}</Text>
        </TouchableOpacity>
        {current?.[2] ? <InfoButton title={current[1]}>{current[2]}</InfoButton> : null}
        <ScrollSheet visible={open} title="Filter" onClose={() => setOpen(false)}>
          <View style={{ gap: 8 }}>
            {options.map(([id, title]) => {
              const on = value === id;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => { onChange(id); setOpen(false); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{
                    borderWidth: 1,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderColor: on ? colors.brand : colors.line,
                    backgroundColor: on ? colors.brandSoft : colors.card,
                  }}
                >
                  <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: on ? '600' : '400' }}>{title}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollSheet>
      </View>
    );
  }
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {options.map(([id, title, body]) => {
        const on = value === id;
        return (
          <TouchableOpacity
            key={id}
            onPress={() => onChange(id)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{
              flexGrow: 1,
              flexBasis: 240,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 12,
              gap: 4,
              borderColor: on ? colors.brand : colors.line,
              backgroundColor: on ? colors.brandSoft : colors.card,
            }}
          >
            <Text style={{ color: on ? colors.brand : colors.ink, fontSize: 15 }}>{title}</Text>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{body}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
