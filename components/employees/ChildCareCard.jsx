import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import CheckBox from '../CheckBox';
import {
  CHILD_CARE_PRIVACY, CHILD_CARE_PURPOSE, childCareSummary, formatBirthDate, newKidId, normalizeChildCare, validateChildCare,
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
    loadChildCare(companyId, employeeId).then((row) => { if (live) setCare(row); }).catch(() => {
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
                  <Text style={[styles.label, { color: colors.muted }]}>Fornavn (valgfritt)</Text>
                  <TextInput
                    value={kid.name}
                    onChangeText={(v) => setKid(kid.id, { name: v })}
                    maxLength={40}
                    style={field}
                    accessibilityLabel={`Fornavn barn ${index + 1}`}
                  />
                </View>
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
              {`${kid.name || `Barn ${index + 1}`} · født ${kid.birthDate}${kid.chronic ? ' · utvidet rett fra NAV' : ''}`}
            </Text>
          )}
        </View>
      ))}

      {editing ? (
        <>
          <TouchableOpacity
            onPress={() => setDraft((cur) => ({ ...cur, kids: [...cur.kids, { id: newKidId(), name: '', birthDate: '', chronic: false }] }))}
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
              <TouchableOpacity onPress={() => { setDraft(null); setError(''); }} style={[styles.button, styles.ghostButton, { borderColor: colors.line }]} accessibilityRole="button">
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
});
