/**
 * Byggeklosser for ISO / K-HMS. De generelle (Page, Card, Btn, Pill, Banner, Empty, Field,
 * Sheet, ListRow …) er løftet til ProTops designsystem i src/ui og re-eksporteres herfra
 * med de gamle navnene, så ISO ser ut som før. Her ligger bare ISO-velgerne for personer
 * og kontakter.
 */
import React from 'react';
import { View } from 'react-native';
import OptionPicker from '../../components/OptionPicker';
import { useColors } from '../../src/context/ThemeContext';
import { Badge as Pill, Button as Btn, TextIn, styles as uiStyles } from '../../src/ui/primitives';

export {
  Badge as Pill,
  Banner,
  Button as Btn,
  Card,
  Check,
  Chips,
  Choice,
  DateIn,
  Divider,
  EmptyState as Empty,
  Field,
  Initials,
  KV,
  ListRow,
  Page,
  Row,
  Sheet,
  Tabs,
  TextIn,
  TimeIn,
  toneColor,
  toneInk,
  usePhone,
  useWide,
  styles,
} from '../../src/ui/primitives';

/** Velg person fra ProTops ansattregister (ingen egen brukerliste). */
/**
 * Velg en ansatt. Egne aktive ansatte først, deretter innleide, eksterne og inaktive. Søk i navn og stilling.
 * Finnes ikke personen, kan navnet skrives inn («Bruk …»).
 */
export function PersonPick({ people, value, onChange, placeholder = 'Velg ansatt' }) {
  const list = (people || []).filter((p) => p?.name);
  const options = list.map((p) => ({
    id: p.id || p.name,
    label: p.name,
    hint: p.title || '',
    group: p.own === false ? 'Andre' : 'Egne ansatte',
    person: p,
  })).sort((a, b) => Number(a.group !== 'Egne ansatte') - Number(b.group !== 'Egne ansatte'));
  const current = options.find((o) => o.label === value) || null;
  const shown = value && !current ? [{ id: `__navn:${value}`, label: value, hint: 'Ikke i Ansatte', group: 'Valgt' }, ...options] : options;
  const pick = (id) => {
    if (!id) { onChange({ name: '', uid: '' }); return; }
    const o = options.find((x) => x.id === id);
    if (!o) return;
    const p = o.person;
    onChange({ name: p.name, uid: p.uid || '', employeeId: p.id || '', phone: p.phone || '', email: p.email || '' });
  };
  return (
    <OptionPicker
      options={shown}
      value={current ? current.id : (value ? `__navn:${value}` : '')}
      onChange={pick}
      placeholder={placeholder}
      title={placeholder}
      searchable
      searchPlaceholder="Søk i navn eller stilling"
      clearLabel="Fjern person"
      onCustom={(name) => onChange({ name: name.trim(), uid: '' })}
    />
  );
}

export function PersonsPick({ people, value, onChange }) {
  const list = Array.isArray(value) ? value : [];
  return (
    <View style={{ gap: 6 }}>
      {list.length ? (
        <View style={[uiStyles.row, { flexWrap: 'wrap', gap: 6 }]}>
          {list.map((p, i) => (
            <View key={`${p.uid || p.employeeId || p.name}${i}`} style={[uiStyles.row, { gap: 4 }]}>
              <Pill label={p.name} tone={p.uid || p.employeeId ? 'info' : 'muted'} icon="person" />
              <Btn small icon="close" accessibilityLabel={`Fjern ${p.name}`} onPress={() => onChange(list.filter((_, j) => j !== i))} />
            </View>
          ))}
        </View>
      ) : null}
      <PersonPick
        people={(people || []).filter((p) => !list.some((x) => (x.employeeId && x.employeeId === p.id) || x.name === p.name))}
        value=""
        placeholder="Legg til ansatt"
        onChange={(p) => { if (p.name) onChange([...list, { name: p.name, uid: p.uid || '', employeeId: p.employeeId || '' }]); }}
      />
    </View>
  );
}

/** Kontaktliste: rolle, person (velges blant de ansatte, telefon hentes fra Ansatte), telefon og merknad. */
export function ContactsEdit({ people, value, onChange }) {
  const colors = useColors();
  const list = Array.isArray(value) ? value : [];
  const set = (i, patch) => onChange(list.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  return (
    <View style={{ gap: 8 }}>
      {list.map((c, i) => (
        <View key={i} style={{ gap: 6, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.line }}>
          <View style={[uiStyles.row, { gap: 6 }]}>
            <View style={{ flex: 1 }}><TextIn value={c.role} onChangeText={(x) => set(i, { role: x })} placeholder="Rolle, f.eks. Beredskapsleder" /></View>
            <Btn small icon="trash-outline" accessibilityLabel="Fjern kontakt" onPress={() => onChange(list.filter((_, j) => j !== i))} />
          </View>
          <PersonPick
            people={people}
            value={c.name}
            placeholder="Velg ansatt"
            onChange={(p) => set(i, { name: p.name, uid: p.uid || '', employeeId: p.employeeId || '', phone: p.phone || c.phone || '', email: p.email || c.email || '' })}
          />
          <View style={[uiStyles.row, { gap: 6 }]}>
            <View style={{ flex: 1 }}><TextIn value={c.phone} onChangeText={(x) => set(i, { phone: x })} placeholder="Telefon" keyboardType="phone-pad" /></View>
            <View style={{ flex: 2 }}><TextIn value={c.note} onChangeText={(x) => set(i, { note: x })} placeholder="Merknad (stedfortreder, når …)" /></View>
          </View>
        </View>
      ))}
      <Btn small icon="add" label="Legg til kontakt" onPress={() => onChange([...list, { role: '', name: '', phone: '', note: '' }])} />
    </View>
  );
}
