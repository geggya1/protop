import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CheckBox from '../CheckBox';
import {
  CHILD_CARE_PRIVACY, CHILD_CARE_PURPOSE, KID_GENDERS, childCareSummary, formatBirthDate, kidAge, kidGenderLabel, newKidId, normalizeChildCare, resizeKids, validateChildCare,
} from '../../src/employees/childCare.js';
import { loadChildCare, saveChildCare } from '../../src/employees/childCareStorage.js';
import { childCareQuota } from '../../src/arbeid/sickLeave.js';
import { radius, type } from '../../src/ui/tokens';

/**
 * «Barn og omsorgsdager» på ansattkortet. Den ansatte registrerer barna selv (fødselsdato,
 * valgfritt fornavn, utvidet rett fra NAV) og om hen er alene om omsorgen. Kortet forklarer
 * hvorfor bedriften spør og hvem som ser opplysningene.
 */
export default function ChildCareCard({
  companyId, employee, colors, canEdit = false, self = false, by = '', onSaved,
  // Åpne rett i redigering (familievinduet på Gjøremål).
  startEditing = false,
  onCancel,
}) {
  const employeeId = employee?.id || '';
  const [care, setCare] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [why, setWhy] = useState(false);

  useEffect(() => {
    let live = true;
    setCare(null);
    setDraft(null);
    setLoadError('');
    if (!companyId || !employeeId) return undefined;
    loadChildCare(companyId, employeeId).then((row) => {
      if (!live) return;
      setCare(row);
      if (startEditing && canEdit) {
        setDraft({ ...row, kids: row.kids.map((kid) => ({ ...kid, birthDate: formatBirthDate(kid.birthDate) })) });
      }
    }).catch(() => {
      if (live) {
        setCare(normalizeChildCare({}));
        setLoadError('Barna kunne ikke hentes. Du kan likevel registrere dem på nytt.');
      }
    });
    return () => { live = false; };
  }, [companyId, employeeId]);

  if (!care) return <Text style={[styles.caption, { color: colors.muted }]}>Henter barn …</Text>;

  const year = new Date().getFullYear();
  const shown = draft || { ...care, kids: care.kids.map((kid) => ({ ...kid, birthDate: formatBirthDate(kid.birthDate) })) };
  const quota = childCareQuota(childCareSummary({ ...shown, kids: shown.kids }), { year });
  const editing = !!draft;
  const setKid = (id, patch) => setDraft((cur) => ({ ...cur, kids: cur.kids.map((kid) => (kid.id === id ? { ...kid, ...patch } : kid)) }));

  function start() {
    setNote('');
    setError('');
    setDraft({ ...care, kids: care.kids.map((kid) => ({ ...kid, birthDate: formatBirthDate(kid.birthDate) })) });
  }

  async function save() {
    const errors = validateChildCare(draft);
    if (errors.length) {
      setError(errors.join(' '));
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await saveChildCare(companyId, employeeId, draft, { by });
      setCare(result.care);
      setDraft(null);
      setNote('Barna er lagret.');
      onSaved?.(result.summary);
    } catch (cause) {
      setError(/permission|insufficient/i.test(String(cause?.message || cause?.code || ''))
        ? 'Du har ikke tilgang til å endre barna for denne personen.'
        : 'Kunne ikke lagre. Prøv igjen.');
    } finally {
      setBusy(false);
    }
  }

  const field = [styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }];

  return (
    <View style={styles.stack} nativeID="employee-child-care">
      <TouchableOpacity onPress={() => setWhy((v) => !v)} style={[styles.info, { borderColor: colors.line, backgroundColor: colors.bg }]} accessibilityRole="button" nativeID="child-care-why">
        <Ionicons name="information-circle-outline" size={18} color={colors.brand} />
        <View style={styles.flex}>
          <Text style={[styles.strong, { color: colors.ink }]}>Hvorfor vi spør</Text>
          <Text style={[styles.caption, { color: colors.ink }]} numberOfLines={why ? undefined : 2}>{CHILD_CARE_PURPOSE}</Text>
          {why ? <Text style={[styles.caption, { color: colors.muted }]}>{CHILD_CARE_PRIVACY}</Text> : null}
          <Text style={[styles.caption, { color: colors.brand }]}>{why ? 'Vis mindre' : 'Les mer'}</Text>
        </View>
      </TouchableOpacity>

      <Text style={[styles.body, { color: colors.ink }]} nativeID="child-care-quota">
        {quota.unknown
          ? (shown.kids.length ? `Ingen barn som gir omsorgsdager i ${year}.` : 'Ingen barn registrert.')
          : `Omsorgsdager ${year}: ${quota.total} dager`}
      </Text>

      {editing ? (
        <View style={styles.countRow} nativeID="child-care-count">
          <Text style={[styles.body, { color: colors.ink }]}>Antall barn</Text>
          <View style={[styles.stepper, { borderColor: colors.line }]}>
            <TouchableOpacity
              onPress={() => setDraft((cur) => ({ ...cur, kids: resizeKids(cur.kids, cur.kids.length - 1) }))}
              disabled={!draft.kids.length}
              accessibilityRole="button"
              accessibilityLabel="Ett barn færre"
              nativeID="child-care-count-minus"
              style={[styles.stepBtn, { opacity: draft.kids.length ? 1 : 0.4 }]}
            >
              <Ionicons name="remove" size={18} color={colors.ink} />
            </TouchableOpacity>
            <Text style={[styles.body, styles.stepValue, { color: colors.ink }]} nativeID="child-care-count-value">{draft.kids.length}</Text>
            <TouchableOpacity
              onPress={() => setDraft((cur) => ({ ...cur, kids: resizeKids(cur.kids, cur.kids.length + 1) }))}
              accessibilityRole="button"
              accessibilityLabel="Ett barn til"
              nativeID="child-care-count-plus"
              style={styles.stepBtn}
            >
              <Ionicons name="add" size={18} color={colors.ink} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {shown.kids.map((kid, index) => (
        <View key={kid.id} style={[styles.kid, { borderColor: colors.line }]} nativeID={`child-care-kid-${index}`}>
          {editing ? (
            <>
              <View style={styles.row}>
                <View style={styles.cell}>
                  <Text style={[styles.label, { color: colors.muted }]}>Fødselsdato</Text>
                  <TextInput
                    value={kid.birthDate}
                    onChangeText={(v) => setKid(kid.id, { birthDate: v })}
                    placeholder="dd.mm.åååå"
                    placeholderTextColor={colors.muted}
                    keyboardType="numbers-and-punctuation"
                    style={field}
                    accessibilityLabel={`Fødselsdato barn ${index + 1}`}
                  />
                </View>
                <View style={styles.cell}>
                  <Text style={[styles.label, { color: colors.muted }]}>Fornavn</Text>
                  <TextInput
                    value={kid.name}
                    onChangeText={(v) => setKid(kid.id, { name: v })}
                    maxLength={40}
                    style={field}
                    accessibilityLabel={`Fornavn barn ${index + 1}`}
                  />
                </View>
              </View>
              <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={`Kjønn barn ${index + 1}`}>
                <Text style={[styles.label, { color: colors.muted }]}>Kjønn</Text>
                {KID_GENDERS.map((g) => {
                  const on = kid.gender === g.id;
                  return (
                    <TouchableOpacity
                      key={g.id}
                      onPress={() => setKid(kid.id, { gender: on ? '' : g.id })}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      nativeID={`child-care-gender-${index}-${g.id}`}
                      style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.bg }]}
                    >
                      <Text style={[styles.caption, { color: on ? colors.brand : colors.ink }]}>{g.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.rowBetween}>
                <CheckBox checked={kid.chronic} onPress={() => setKid(kid.id, { chronic: !kid.chronic })} label="Utvidet rett fra NAV (kronisk syk eller funksjonshemmet)" />
                <TouchableOpacity
                  onPress={() => setDraft((cur) => ({ ...cur, kids: cur.kids.filter((row) => row.id !== kid.id) }))}
                  accessibilityRole="button"
                  accessibilityLabel={`Fjern barn ${index + 1}`}
                  hitSlop={8}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.dangerInk || colors.danger} />
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <Text style={[styles.body, { color: colors.ink }]}>
              {[
                kid.name || `Barn ${index + 1}`,
                kidGenderLabel(kid.gender),
                `født ${kid.birthDate}`,
                kidAge(kid.birthDate) != null ? `${kidAge(kid.birthDate)} år` : '',
                kid.chronic ? 'utvidet rett fra NAV' : '',
              ].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
      ))}

      {editing ? (
        <>
          <TouchableOpacity
            onPress={() => setDraft((cur) => ({ ...cur, kids: [...cur.kids, { id: newKidId(), name: '', birthDate: '', chronic: false, gender: '' }] }))}
            style={[styles.ghost, { borderColor: colors.line }]}
            accessibilityRole="button"
            nativeID="child-care-add"
          >
            <Ionicons name="add" size={16} color={colors.brand} />
            <Text style={[styles.body, { color: colors.ink }]}>Legg til barn</Text>
          </TouchableOpacity>
          <CheckBox checked={draft.alone} onPress={() => setDraft((cur) => ({ ...cur, alone: !cur.alone }))} label="Jeg er alene om omsorgen" />
        </>
      ) : (shown.alone ? <Text style={[styles.caption, { color: colors.muted }]}>Alene om omsorgen.</Text> : null)}

      {loadError ? <Text style={[styles.caption, { color: colors.warnInk || colors.muted }]}>{loadError}</Text> : null}
      {error ? <Text style={[styles.caption, { color: colors.dangerInk || colors.danger }]} accessibilityRole="alert">{error}</Text> : null}
      {note ? <Text style={[styles.caption, { color: colors.brand }]}>{note}</Text> : null}

      {canEdit ? (
        <View style={styles.row}>
          {editing ? (
            <>
              <TouchableOpacity onPress={save} disabled={busy} style={[styles.button, { backgroundColor: colors.brand, opacity: busy ? 0.5 : 1 }]} accessibilityRole="button" nativeID="child-care-save">
                <Text style={[styles.strong, { color: colors.onBrand || '#fff' }]}>{busy ? 'Lagrer …' : 'Lagre'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setDraft(null); setError(''); onCancel?.(); }} style={[styles.button, styles.ghostButton, { borderColor: colors.line }]} accessibilityRole="button">
                <Text style={[styles.strong, { color: colors.ink }]}>Avbryt</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity onPress={start} style={[styles.button, styles.ghostButton, { borderColor: colors.line }]} accessibilityRole="button" nativeID="child-care-edit">
              <Text style={[styles.strong, { color: colors.ink }]}>{shown.kids.length ? 'Endre barn' : (self ? 'Registrer barna dine' : 'Registrer barn')}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  flex: { flex: 1, minWidth: 0, gap: 2 },
  info: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', borderWidth: 1, borderRadius: radius.card, padding: 12 },
  kid: { borderWidth: 1, borderRadius: radius.card, padding: 10, gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cell: { flexGrow: 1, flexBasis: 160, gap: 4 },
  input: { ...type.body, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 8, minHeight: 40 },
  ghost: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  button: { borderRadius: radius.control, minHeight: 40, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  ghostButton: { borderWidth: 1 },
  body: { ...type.body },
  caption: { ...type.caption },
  label: { ...type.caption, fontWeight: '600' },
  strong: { ...type.bodyStrong },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radius.control },
  stepBtn: { width: 40, height: 38, alignItems: 'center', justifyContent: 'center' },
  stepValue: { minWidth: 28, textAlign: 'center' },
  chip: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
});
