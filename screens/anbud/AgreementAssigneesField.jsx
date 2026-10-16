import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ScrollSheet from '../../components/ScrollSheet';
import { assigneeFromChoice, followUpChoices } from '../../src/anbud/assignees';

const FOCUS_BG = '#fff4cc';
const FOCUS_BORDER = '#d4a017';

function sourceLabel(source) {
  if (source === 'intern') return 'Intern';
  if (source === 'ekstern') return 'Ekstern';
  return 'Ny';
}

export default function AgreementAssigneesField({
  colors,
  employees = [],
  assignees = [],
  onChange,
}) {
  const [sheet, setSheet] = useState(false);
  const [mode, setMode] = useState('choose');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState({ name: '', email: '', phone: '' });
  const choices = useMemo(() => followUpChoices(employees), [employees]);
  const pool = mode === 'ekstern'
    ? choices.filter((row) => row.kind === 'ekstern')
    : choices.filter((row) => row.kind === 'intern');
  const needle = query.trim().toLocaleLowerCase('nb-NO');
  const listed = needle
    ? pool.filter((row) => `${row.name} ${row.email} ${row.phone}`.toLocaleLowerCase('nb-NO').includes(needle))
    : pool;
  const shown = listed.filter((_, index) => index < 40);
  const empty = !assignees.length;

  function close() {
    setSheet(false);
    setMode('choose');
    setQuery('');
    setDraft({ name: '', email: '', phone: '' });
  }

  function add(person) {
    if (!person?.name && !person?.email) return;
    const exists = person.employeeId && assignees.some((row) => row.employeeId === person.employeeId);
    if (exists) {
      close();
      return;
    }
    onChange?.([...assignees, person]);
    close();
  }

  function pickChoice(choice) {
    const person = assigneeFromChoice(choice);
    if (person) add(person);
  }

  return (
    <View style={{ gap: 8, flexBasis: '100%' }}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Oppfølging på oppdraget</Text>
      <Text style={{ color: colors.muted, fontSize: 13 }}>
        Hvem som følger opp oppdraget fysisk. Flere personer kan legges inn, interne eller eksterne.
      </Text>
      {assignees.map((person) => (
        <View key={person.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.bg }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{person.name || 'Uten navn'}</Text>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              {[sourceLabel(person.source), person.email, person.phone].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => onChange?.(assignees.filter((row) => row.id !== person.id))}
            accessibilityRole="button"
            accessibilityLabel={`Fjern ${person.name || 'person'}`}
          >
            <Text style={{ color: colors.brand }}>Fjern</Text>
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity
        nativeID="agreement-assignee-open"
        onPress={() => { setMode('choose'); setSheet(true); }}
        accessibilityRole="button"
        style={[styles.add, {
          borderColor: empty ? FOCUS_BORDER : colors.line,
          backgroundColor: empty ? FOCUS_BG : colors.bg,
        }]}
      >
        <Text style={{ color: colors.ink, fontWeight: '600' }}>
          {assignees.length ? 'Legg til person' : 'Velg hvem som følger opp'}
        </Text>
        <Text style={{ color: colors.brand }}>Velg</Text>
      </TouchableOpacity>
      <ScrollSheet visible={sheet} title="Oppfølging på oppdraget" onClose={close} placement="center">
        {mode === 'choose' ? (
          <View style={{ gap: 8 }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Velg intern eller ekstern fra listen, eller registrer en ny person. Kontaktdata hentes inn automatisk fra listen.
            </Text>
            <TouchableOpacity onPress={() => setMode('intern')} accessibilityRole="button" style={[styles.choice, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Intern</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Aktiv ansatt i bedriften</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('ekstern')} accessibilityRole="button" style={[styles.choice, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Ekstern</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Innleid eller eksternt personell</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('ny')} accessibilityRole="button" style={[styles.choice, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>Ny</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Hvem som helst, med navn og kontakt</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {mode === 'intern' || mode === 'ekstern' ? (
          <View style={{ gap: 8 }}>
            <TouchableOpacity onPress={() => { setMode('choose'); setQuery(''); }} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Tilbake</Text>
            </TouchableOpacity>
            <TextInput
              nativeID="agreement-assignee-search"
              value={query}
              onChangeText={setQuery}
              placeholder={mode === 'ekstern' ? 'Søk blant eksterne' : 'Søk blant interne'}
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            {shown.length ? shown.map((row) => (
              <TouchableOpacity
                key={row.id}
                onPress={() => pickChoice(row)}
                accessibilityRole="button"
                style={[styles.choice, { borderColor: colors.line }]}
              >
                <Text style={{ color: colors.ink }}>{row.name}</Text>
                <Text style={{ color: colors.muted, fontSize: 13 }}>{[row.email, row.phone].filter(Boolean).join(' · ') || 'Ingen kontakt lagret'}</Text>
              </TouchableOpacity>
            )) : (
              <Text style={{ color: colors.muted }}>
                {needle ? 'Ingen treff.' : 'Ingen aktive personer i denne listen.'}
              </Text>
            )}
            {listed.length > shown.length ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>{`Viser ${shown.length} av ${listed.length}. Skriv for å snevre inn.`}</Text>
            ) : null}
          </View>
        ) : null}
        {mode === 'ny' ? (
          <View style={{ gap: 8 }}>
            <TouchableOpacity onPress={() => setMode('choose')} accessibilityRole="button">
              <Text style={{ color: colors.brand }}>Tilbake</Text>
            </TouchableOpacity>
            <TextInput
              value={draft.name}
              onChangeText={(name) => setDraft((current) => ({ ...current, name }))}
              placeholder="Navn"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <TextInput
              value={draft.email}
              onChangeText={(email) => setDraft((current) => ({ ...current, email }))}
              placeholder="E-post"
              placeholderTextColor={colors.placeholder}
              autoCapitalize="none"
              keyboardType="email-address"
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <TextInput
              value={draft.phone}
              onChangeText={(phone) => setDraft((current) => ({ ...current, phone }))}
              placeholder="Telefon"
              placeholderTextColor={colors.placeholder}
              keyboardType="phone-pad"
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            <TouchableOpacity
              onPress={() => add({
                id: `oppfolging_${Date.now()}`,
                source: 'ny',
                employeeId: '',
                name: draft.name.trim(),
                email: draft.email.trim(),
                phone: draft.phone.trim(),
              })}
              disabled={!draft.name.trim()}
              accessibilityRole="button"
              style={[styles.choice, { borderColor: colors.brand, opacity: draft.name.trim() ? 1 : 0.5 }]}
            >
              <Text style={{ color: colors.brand, fontWeight: '600' }}>Legg til</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </ScrollSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  add: { borderWidth: 1, borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  choice: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 2 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 16 },
});
