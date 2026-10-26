import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KS_LIBRARY, entryTitle, libraryForm, libraryTemplateId } from '../../src/forms/ksLibrary';
import {
  completeFilledDoc,
  filledLine,
  newFilledDoc,
  reopenFilledDoc,
} from '../../src/forms/filledDocs';
import { deleteFilledDoc, loadFilledDocs, peekFilledDocs, saveFilledDoc } from '../../src/forms/filledStore';
import { formWithTokens } from '../../src/forms/tokens';
import { normalizeFormTemplates } from '../../src/anbud/bidLibrary';
import { loadAnbudState, peekAnbudState } from '../../src/anbud/storage';
import { displayName } from '../../src/employees/model';
import { filterHrEmployees } from '../../src/hr/model';
import { showSaveToast } from '../../src/ui/saveToast';
import FormFill, { FilledStatusIcon } from '../anbud/FormFill';
import { HrButton, HrCard, HrSectionTitle } from './HrShared';

const HR_ENTRIES = KS_LIBRARY.filter((row) => row.kind === 'mal' && row.hr);

function dateText(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Ferdige felt som kan fylles fra personkortet. */
function prefill(doc, employee) {
  if (!employee) return doc;
  const person = employee.person || {};
  const name = displayName(employee);
  const company = employee.company || {};
  const values = {
    navn: name,
    medarbeider: name,
    stilling: company.title || '',
    ansattnummer: company.externalEmployeeNumber || '',
    'privat e-post': person.email || '',
    'privat telefon': person.phone || '',
    'e-post arbeid': company.email || '',
    'telefon arbeid': '',
    adresse: [person.address1, person.address2].filter(Boolean).join(', '),
    'postnr. og sted': [person.postalCode, person.place].filter(Boolean).join(' '),
    pårørende: person.kinName || '',
    'telefon pårørende': person.kinPhone || '',
  };
  const dates = {
    tiltredelsesdato: company.periodFrom || '',
    'ansatt siden': company.periodFrom || '',
    fødselsdato: person.birthDate || '',
  };
  return {
    ...doc,
    fields: doc.fields.map((field) => {
      const key = String(field.label || '').trim().toLocaleLowerCase('nb-NO');
      if (field.editor === 'fast' || field.value) return field;
      if (field.kind === 'date' && /^\d{4}-\d{2}-\d{2}/.test(String(dates[key] || ''))) return { ...field, value: String(dates[key]).slice(0, 10) };
      const value = values[key];
      if (!value || !['text', 'long'].includes(field.kind)) return field;
      return { ...field, value: String(value) };
    }),
  };
}

export default function HrForms({ colors, employees, canWrite, familyId, actor, company, logo }) {
  const [docs, setDocs] = useState(() => (peekFilledDocs(familyId) || []).filter((row) => row.scope === 'hr'));
  const [templates, setTemplates] = useState(() => normalizeFormTemplates(peekAnbudState(familyId)?.formTemplates || []));
  const [employeeId, setEmployeeId] = useState('');
  const [picking, setPicking] = useState('');
  const [filled, setFilled] = useState(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [noteBad, setNoteBad] = useState(false);
  const people = useMemo(() => filterHrEmployees(employees, 'active'), [employees]);

  useEffect(() => {
    let live = true;
    loadFilledDocs(familyId).then((list) => { if (live) setDocs(list.filter((row) => row.scope === 'hr')); });
    loadAnbudState(familyId).then((state) => { if (live) setTemplates(normalizeFormTemplates(state?.formTemplates || [])); });
    return () => { live = false; };
  }, [familyId]);

  function say(text, bad = false) {
    setNote(text);
    setNoteBad(bad);
  }

  function templateFor(key) {
    const own = templates.find((row) => row.id === libraryTemplateId(key));
    if (own) return own;
    const form = libraryForm(key);
    return form ? { ...form, id: libraryTemplateId(key) } : null;
  }

  function start(key, employee) {
    const template = templateFor(key);
    if (!template) return;
    const subject = employee ? { kind: 'employee', id: employee.id, name: displayName(employee) } : null;
    setFilled(prefill(newFilledDoc(template, { actor, scope: 'hr', subject }), employee));
    setPicking('');
    say('');
  }

  async function store(next, message) {
    setSaving(true);
    const res = await saveFilledDoc(familyId, next);
    setSaving(false);
    if (res.list) setDocs(res.list.filter((row) => row.scope === 'hr'));
    setFilled(res.doc || next);
    say(res.ok ? message : res.error, !res.ok);
    if (res.ok) showSaveToast(message);
  }

  if (filled) {
    const useLogo = filled.settings?.useCompanyLogo ? (logo?.dataUrl || '') : '';
    return (
      <FormFill
        doc={filled}
        colors={colors}
        company={company}
        logo={useLogo}
        actor={actor}
        busy={saving}
        note={note}
        noteBad={noteBad}
        fill
        onChange={canWrite ? setFilled : () => {}}
        onSave={() => store(filled, 'Dokumentet er lagret i HR.')}
        onComplete={() => {
          const res = completeFilledDoc(formWithTokens(filled, company), { actor });
          if (!res.ok) say(res.error, true);
          else store(res.doc, 'Dokumentet er ferdig og lagret i HR.');
        }}
        onReopen={() => store(reopenFilledDoc(filled, { actor }), 'Dokumentet er åpnet for endring.')}
        onDelete={canWrite && docs.some((row) => row.id === filled.id) ? async () => {
          const res = await deleteFilledDoc(familyId, filled.id);
          if (res.list) setDocs(res.list.filter((row) => row.scope === 'hr'));
          setFilled(null);
          say(res.ok ? 'Dokumentet er slettet.' : res.error, !res.ok);
        } : null}
        onBack={() => { setFilled(null); say(''); }}
        backLabel="Alle personalskjema"
      />
    );
  }

  const visible = employeeId ? docs.filter((row) => row.subject?.id === employeeId) : docs;

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.page} nativeID="hr-forms">
      <HrCard colors={colors}>
        <HrSectionTitle colors={colors} title="Personalskjema" subtitle="KS-malene for personal. Velg skjema og ansatt. Navn og kontaktinfo hentes fra personkortet." />
        {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}
        <View style={styles.grid}>
          {HR_ENTRIES.map((entry) => (
            <View key={entry.key} style={[styles.formCard, { borderColor: colors.line, backgroundColor: colors.bg }]}>
              <View style={styles.headRow}>
                <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>{entryTitle(entry)}</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{entry.ref}</Text>
              </View>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{entry.summary}</Text>
              {canWrite ? (
                picking === entry.key ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: colors.ink, fontSize: 13 }}>Hvem gjelder skjemaet?</Text>
                    <View style={styles.chips}>
                      {people.map((employee) => (
                        <TouchableOpacity key={employee.id} onPress={() => start(entry.key, employee)} accessibilityRole="button" style={[styles.chip, { borderColor: colors.line }]}>
                          <Text style={{ color: colors.ink }}>{displayName(employee)}</Text>
                        </TouchableOpacity>
                      ))}
                      <TouchableOpacity onPress={() => start(entry.key, null)} accessibilityRole="button" style={[styles.chip, { borderColor: colors.line }]}>
                        <Text style={{ color: colors.muted }}>Uten ansatt</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={() => setPicking('')} accessibilityRole="button">
                      <Text style={{ color: colors.muted }}>Avbryt</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <HrButton colors={colors} primary icon="create-outline" label="Fyll ut" onPress={() => setPicking(entry.key)} />
                )
              ) : null}
            </View>
          ))}
        </View>
        <Text style={{ color: colors.muted, fontSize: 12 }}>Malene kan tilpasses i Skjemabygger › KS-maler. Egenmelding registreres under Fravær.</Text>
      </HrCard>

      <HrCard colors={colors}>
        <HrSectionTitle colors={colors} title="Utfylte personalskjema" subtitle={`${docs.length} dokumenter`} />
        <View style={styles.chips}>
          <TouchableOpacity onPress={() => setEmployeeId('')} accessibilityRole="button" style={[styles.chip, { borderColor: !employeeId ? colors.brand : colors.line, backgroundColor: !employeeId ? `${colors.brand}18` : 'transparent' }]}>
            <Text style={{ color: !employeeId ? colors.brand : colors.ink }}>Alle</Text>
          </TouchableOpacity>
          {people.filter((employee) => docs.some((row) => row.subject?.id === employee.id)).map((employee) => (
            <TouchableOpacity key={employee.id} onPress={() => setEmployeeId(employee.id)} accessibilityRole="button" style={[styles.chip, { borderColor: employeeId === employee.id ? colors.brand : colors.line, backgroundColor: employeeId === employee.id ? `${colors.brand}18` : 'transparent' }]}>
              <Text style={{ color: employeeId === employee.id ? colors.brand : colors.ink }}>{displayName(employee)}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {visible.map((row) => (
          <TouchableOpacity key={row.id} onPress={() => { setFilled(row); say(''); }} accessibilityRole="button" style={[styles.docRow, { borderBottomColor: colors.line }]}>
            <FilledStatusIcon status={row.status} colors={colors} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.title}</Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>{filledLine(row)} · {dateText(row.updatedAt)}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </TouchableOpacity>
        ))}
        {!visible.length ? <Text style={{ color: colors.muted }}>Ingen personalskjema er fylt ut ennå.</Text> : null}
      </HrCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12, paddingBottom: 32 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  formCard: { flexGrow: 1, flexBasis: 280, maxWidth: 460, borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  headRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
});
