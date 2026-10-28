import React, { useMemo, useRef, useState } from 'react';
import {
  Platform, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
import {
  isValidAddress,
  parseRecipients,
  suggestContacts,
  uniqueRecipients,
} from '../../src/utils/mailModel';

function Chip({ r, onRemove, onEdit }) {
  const ok = isValidAddress(r.address);
  return (
    <Pressable
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={`${r.name || r.address}. Trykk for å endre`}
      style={[styles.chip, !ok && styles.chipBad]}
    >
      <Text style={[styles.chipTxt, !ok && styles.chipTxtBad]} numberOfLines={1}>
        {r.name || r.address}
      </Text>
      <Pressable onPress={onRemove} hitSlop={6} accessibilityLabel={`Fjern ${r.name || r.address}`}>
        <Ionicons name="close" size={12} color={ok ? colors.muted : colors.danger} />
      </Pressable>
    </Pressable>
  );
}

/**
 * Mottakerfelt som i Outlook: adressene blir merkelapper, og forslag
 * kommer fra folk du har hatt e-post med. Skill flere med ; eller ,.
 */
export default function MailRecipientField({
  label,
  value = [],
  onChange,
  contacts = [],
  placeholder = '',
  autoFocus = false,
  right = null,
}) {
  const [text, setText] = useState('');
  const [focus, setFocus] = useState(false);
  const [hi, setHi] = useState(0);
  const inputRef = useRef(null);
  const pickingRef = useRef(false);
  const latest = useRef({ text: '', list: [] });
  const list = value || [];
  latest.current = { text, list };

  const suggestions = useMemo(
    () => (focus ? suggestContacts(contacts, text, list.map((r) => r.address), 6) : []),
    [contacts, text, list, focus],
  );

  const commit = (raw = latest.current.text) => {
    const parsed = parseRecipients(raw).filter((r) => r.address);
    if (!parsed.length) return false;
    onChange(uniqueRecipients([...latest.current.list, ...parsed]));
    setText('');
    setHi(0);
    return true;
  };

  const pick = (c) => {
    pickingRef.current = false;
    onChange(uniqueRecipients([...latest.current.list, { name: c.name || '', address: c.address }]));
    setText('');
    setHi(0);
    inputRef.current?.focus?.();
  };

  const onChangeText = (v) => {
    if (/[;,\n]/.test(v)) {
      const parts = v.split(/[;,\n]/);
      const tail = parts.pop();
      const done = parts.join(';');
      if (parseRecipients(done).length) {
        onChange(uniqueRecipients([...list, ...parseRecipients(done)]));
        setText(tail.trimStart());
        return;
      }
    }
    setText(v);
    setHi(0);
  };

  const onKeyPress = (e) => {
    const key = e.nativeEvent?.key;
    if (key === 'ArrowDown' && suggestions.length) {
      e.preventDefault?.();
      setHi((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (key === 'ArrowUp' && suggestions.length) {
      e.preventDefault?.();
      setHi((i) => Math.max(0, i - 1));
    } else if (key === 'Enter' || key === 'Tab') {
      if (suggestions.length && text.trim()) {
        e.preventDefault?.();
        pick(suggestions[Math.min(hi, suggestions.length - 1)]);
      } else if (text.trim()) {
        e.preventDefault?.();
        commit();
      }
    } else if (key === 'Backspace' && !text && list.length) {
      onChange(list.slice(0, -1));
    }
  };

  const edit = (i) => {
    const r = list[i];
    onChange(list.filter((_, idx) => idx !== i));
    setText(r.name && r.name !== r.address ? `${r.name} <${r.address}>` : r.address);
    inputRef.current?.focus?.();
  };

  return (
    <View>
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <Pressable style={styles.box} onPress={() => inputRef.current?.focus?.()}>
          {list.map((r, i) => (
            <Chip
              key={`${r.address}-${i}`}
              r={r}
              onRemove={() => onChange(list.filter((_, idx) => idx !== i))}
              onEdit={() => edit(i)}
            />
          ))}
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={text}
            onChangeText={onChangeText}
            onKeyPress={onKeyPress}
            onFocus={() => setFocus(true)}
            onBlur={() => {
              // Et klikk på et forslag blurrer feltet først; da skal ikke halvskrevet tekst bli en merkelapp.
              setTimeout(() => {
                setFocus(false);
                if (!pickingRef.current) commit();
              }, 180);
            }}
            placeholder={list.length ? '' : placeholder}
            placeholderTextColor={colors.placeholder}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoFocus={autoFocus}
            accessibilityLabel={label}
          />
        </Pressable>
        {right}
      </View>
      {suggestions.length ? (
        <View style={styles.suggest} accessibilityRole="menu">
          {suggestions.map((c, i) => (
            <Pressable
              key={c.address}
              onPressIn={() => { pickingRef.current = true; }}
              onPress={() => pick(c)}
              style={({ hovered }) => [styles.sugRow, (hovered || i === hi) && styles.sugOn]}
              accessibilityRole="menuitem"
            >
              <Ionicons name="person-circle-outline" size={18} color={colors.muted} />
              <View style={{ flex: 1, minWidth: 0 }}>
                {c.name ? <Text style={styles.sugName} numberOfLines={1}>{c.name}</Text> : null}
                <Text style={styles.sugAddr} numberOfLines={1}>{c.address}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 38,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    gap: 6,
  },
  label: { width: 70, fontSize: 12, color: colors.muted },
  box: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, paddingVertical: 4, minWidth: 0 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingLeft: 8,
    paddingRight: 6,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    maxWidth: 260,
  },
  chipBad: { backgroundColor: '#fde8e8' },
  chipTxt: { fontSize: 12, color: colors.ink, flexShrink: 1 },
  chipTxtBad: { color: colors.danger },
  input: {
    flexGrow: 1,
    minWidth: 120,
    fontSize: 13,
    color: colors.ink,
    paddingVertical: 4,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  suggest: {
    marginLeft: 76,
    borderWidth: 1,
    borderColor: colors.line,
    borderTopWidth: 0,
    backgroundColor: colors.card,
    marginBottom: 4,
  },
  sugRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 6 },
  sugOn: { backgroundColor: colors.sunken },
  sugName: { fontSize: 13, color: colors.ink },
  sugAddr: { fontSize: 11, color: colors.muted },
});
