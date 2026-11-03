import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { KS_LIBRARY, entryTitle, libraryTemplateId } from '../../src/forms/ksLibrary';
import { filledLine } from '../../src/forms/filledDocs';
import { loadFilledDocs, peekFilledDocs } from '../../src/forms/filledStore';
import { displayName } from '../../src/employees/model';
import { filterHrEmployees, formatNbDate, normalizeCase, normalizeReview } from '../../src/hr/model';
import { hrKindBucket, hrKindLabel } from '../../src/hr/directory';
import { casesFromReviewDoc, isReviewDoc, reviewDocsToSync, syncReviewRows } from '../../src/hr/reviewForms';
import { controlStatus } from '../../src/doccontrol/model';
import { templateControlKey } from '../../src/doccontrol/templates';
import { FilledStatusIcon } from '../anbud/FormFill';
import OptionPicker from '../../components/OptionPicker';
import HrFilledForm from './HrFilledForm';
import { useHrFormStart } from './useHrFormStart';
import { StatusChip } from '../doccontrol/parts';
import { HrButton, HrCard, HrSectionTitle } from './HrShared';

const HR_ENTRIES = KS_LIBRARY.filter((row) => row.kind === 'mal' && row.hr);
// Skjema som også kan gjelde innleide og eksterne. Resten (medarbeidersamtale, nyansatt,
// oppfølgingsplan ved sykefravær, personverninformasjon til ansatte) er arbeidsgivers skjema for egne ansatte.
const HIRED_FORMS = new Set(['taushetserklaering']);
const NO_EMPLOYEE = '__uten__';

function dateText(value) {
  const d = new Date(value);
  if (!value || Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nb-NO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * HR → Rutiner → Skjemaer: personalskjemaene fra KS-biblioteket. Medarbeidersamtalen fylles ut i
 * samme visning som under HR → Oppfølging (HrFilledForm), og speiles i hr.reviews (onPatch).
 * open: { docId } eller { key, employeeId } for å åpne et skjema direkte.
 */
export default function HrForms({
  colors, employees, canWrite, familyId, actor, company, logo, onPatch, reviews = [],
}) {
  const [docs, setDocs] = useState(() => (peekFilledDocs(familyId) || []).filter((row) => row.scope === 'hr'));
  const [employeeId, setEmployeeId] = useState('');
  const [picking, setPicking] = useState('');
  const [filled, setFilled] = useState(null);
  const [startNote, setStartNote] = useState('');
  const [note, setNote] = useState('');
  const [noteBad, setNoteBad] = useState(false);
  const people = useMemo(() => filterHrEmployees(employees, 'active'), [employees]);
  const { start: startForm, dc } = useHrFormStart(familyId);
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    let live = true;
    loadFilledDocs(familyId).then((list) => { if (live) setDocs(list.filter((row) => row.scope === 'hr')); });
    return () => { live = false; };
  }, [familyId]);

  function say(text, bad = false) {
    setNote(text);
    setNoteBad(bad);
  }

  function start(key, employee) {
    const res = startForm(key, employee, actor);
    if (!res) return;
    setFilled(res.doc);
    setPicking('');
    setStartNote(res.approved ? '' : 'Malen er ikke godkjent ennå. Dokumentet får «Utkast» i hodet til en versjon er godkjent.');
  }

  // Samtaleskjema speiles i hr.reviews, så samtalen er den samme uansett hvor den ble ført.
  function syncReview(doc, { removed = false } = {}) {
    if (!isReviewDoc(doc) || !onPatch) return;
    onPatch((state) => ({
      reviews: syncReviewRows(state.reviews, doc, normalizeReview, { removed }),
      cases: removed ? state.cases : casesFromReviewDoc(state.cases, doc, normalizeCase, { formatDate: formatNbDate }),
    }));
  }

  // Samtaler den ansatte har signert på Min side: speil dem i hr.reviews (én gang per lasting).
  useEffect(() => {
    if (!canWrite || !onPatch || synced || !docs.length) return;
    setSynced(true);
    if (!reviewDocsToSync(reviews, docs).length) return;
    onPatch((state) => {
      const pending = reviewDocsToSync(state.reviews, docs);
      if (!pending.length) return {};
      let { reviews, cases } = state;
      for (const doc of pending) {
        reviews = syncReviewRows(reviews, doc, normalizeReview);
        cases = casesFromReviewDoc(cases, doc, normalizeCase, { formatDate: formatNbDate });
      }
      return { reviews, cases };
    });
  }, [canWrite, docs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (filled) {
    const subject = (employees || []).find((row) => row.id === filled.subject?.id) || null;
    return (
      <HrFilledForm
        key={filled.id}
        employee={subject ? { id: subject.id, name: displayName(subject), personUid: subject.personUid || '' } : null}
        colors={colors}
        familyId={familyId}
        doc={filled}
        onDoc={setFilled}
        canWrite={canWrite}
        actor={actor}
        company={company}
        logo={logo?.dataUrl || ''}
        fill
        initialNote={startNote}
        canDelete={docs.some((row) => row.id === filled.id)}
        onStored={(doc, list) => {
          if (list) setDocs(list.filter((row) => row.scope === 'hr'));
          syncReview(doc);
        }}
        onDeleted={(doc, list) => {
          if (list) setDocs(list.filter((row) => row.scope === 'hr'));
          syncReview(doc, { removed: true });
          setFilled(null);
          say('Dokumentet er slettet.');
        }}
        onBack={() => { setFilled(null); say(''); setStartNote(''); }}
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
              {(() => {
                const control = dc.controlFor(templateControlKey({ id: libraryTemplateId(entry.key) }));
                return <StatusChip status={control ? controlStatus(control) : { label: 'Ikke godkjent', tone: 'warn' }} colors={colors} />;
              })()}
              {canWrite ? (
                picking === entry.key ? (
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: colors.ink, fontSize: 13 }}>Hvem gjelder skjemaet?</Text>
                    <OptionPicker
                      options={[
                        ...people
                          .filter((employee) => HIRED_FORMS.has(entry.key) || hrKindBucket(employee) !== 'external')
                          .map((employee) => ({
                            id: employee.id,
                            label: hrKindBucket(employee) === 'external' ? `${displayName(employee)} · ${hrKindLabel(employee)}` : displayName(employee),
                          })),
                        { id: NO_EMPLOYEE, label: 'Uten ansatt' },
                      ]}
                      value=""
                      onChange={(id) => { if (id) start(entry.key, id === NO_EMPLOYEE ? null : people.find((row) => row.id === id) || null); }}
                      clearable={false}
                      placeholder="Velg ansatt"
                      title="Hvem gjelder skjemaet?"
                    />
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
        <OptionPicker
          options={people.filter((employee) => docs.some((row) => row.subject?.id === employee.id)).map((employee) => ({ id: employee.id, label: displayName(employee) }))}
          value={employeeId}
          onChange={(id) => setEmployeeId(id || '')}
          placeholder="Alle ansatte"
          clearLabel="Alle ansatte"
          title="Vis for ansatt"
        />
        {visible.map((row) => (
          <TouchableOpacity key={row.id} onPress={() => { setFilled(row); setStartNote(''); say(''); }} accessibilityRole="button" style={[styles.docRow, { borderBottomColor: colors.line }]}>
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
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
});
