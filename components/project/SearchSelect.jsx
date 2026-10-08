import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

/**
 * Enkel søkbar rullegardin for lange lister (kunder, prosjekter, avtaler).
 * options: [{ id, label, search? }]
 */
export default function SearchSelect({
  colors,
  label,
  value,
  options = [],
  placeholder = 'Velg…',
  emptyLabel = 'Ingen treff',
  noneLabel = 'Ingen',
  allowNone = true,
  onChange,
  helper,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const selected = options.find((row) => row.id === value) || null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 40);
    return options
      .filter((row) => {
        const hay = `${row.label || ''} ${row.search || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [options, query]);

  function pick(id) {
    onChange?.(id);
    setOpen(false);
    setQuery('');
  }

  return (
    <View style={styles.wrap}>
      {label ? <Text style={[styles.label, { color: colors.muted }]}>{label}</Text> : null}
      <TouchableOpacity
        onPress={() => setOpen((current) => !current)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={[styles.trigger, { borderColor: colors.line, backgroundColor: colors.card }]}
      >
        <Text style={{ color: selected ? colors.ink : colors.placeholder, flex: 1 }} numberOfLines={1}>
          {selected?.label || placeholder}
        </Text>
        <Text style={{ color: colors.muted }}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>
      {helper ? <Text style={{ color: colors.muted, fontSize: 12 }}>{helper}</Text> : null}
      {open ? (
        <View style={[styles.panel, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Søk…"
            placeholderTextColor={colors.placeholder}
            autoFocus
            style={[styles.search, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg || colors.sunken || colors.card }]}
          />
          {allowNone ? (
            <TouchableOpacity onPress={() => pick('')} accessibilityRole="button" style={styles.option}>
              <Text style={{ color: !value ? colors.brand : colors.ink }}>{noneLabel}</Text>
            </TouchableOpacity>
          ) : null}
          {filtered.map((row) => (
            <TouchableOpacity
              key={row.id}
              onPress={() => pick(row.id)}
              accessibilityRole="button"
              style={[styles.option, value === row.id && { backgroundColor: colors.brandSoft || colors.bg }]}
            >
              <Text style={{ color: value === row.id ? colors.brand : colors.ink }} numberOfLines={2}>
                {row.label}
              </Text>
            </TouchableOpacity>
          ))}
          {!filtered.length ? (
            <Text style={{ color: colors.muted, paddingHorizontal: 10, paddingVertical: 8 }}>{emptyLabel}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 4, zIndex: 2 },
  label: { fontSize: 12, fontWeight: '400' },
  trigger: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panel: {
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
    maxHeight: 280,
  },
  search: {
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
});
