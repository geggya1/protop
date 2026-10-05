import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../firebase';
import { createGroup, updateGroup } from '../../src/utils/groups';
import { searchBrregCompanies, searchBrregUnderenheter } from '../../src/utils/boligmappaApis';
import { fetchCompanyCpv } from '../../src/anbud/doffinClient';
import { companyFromBrreg } from '../../src/project/company';
import { digitsOrgnr, organizationByOrgnr } from '../../src/project/companyRegistry';
import {
  addSubUnit,
  createDepartment,
  createUnderenhet,
  departmentsOf,
  findOwnedOrganization,
  linkedCompanyFields,
  normalizeSubUnits,
  publicUnitsNotRegistered,
  removeSubUnit,
  underenheterOf,
} from '../../src/project/companyUnits';

function Field({ label, value, onChangeText, placeholder, colors, editable = true }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        editable={editable}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

export default function CompanyStructureSettings({
  company,
  familyId,
  families = [],
  canEdit,
  colors,
  busy,
  setBusy,
  setError,
  userProfile,
  onSaved,
  onOpenCompany,
}) {
  const units = normalizeSubUnits(company?.subUnits);
  const [queryText, setQueryText] = useState('');
  const [hits, setHits] = useState([]);
  const [publicUnits, setPublicUnits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [deptName, setDeptName] = useState('');
  const [deptNote, setDeptNote] = useState('');
  const orgnr = digitsOrgnr(company?.organisasjonsnummer);

  useEffect(() => {
    if (orgnr.length !== 9) {
      setPublicUnits([]);
      return undefined;
    }
    let alive = true;
    searchBrregUnderenheter('', { size: 50, overordnetEnhet: orgnr })
      .then((res) => {
        if (alive) setPublicUnits(res.results || []);
      })
      .catch(() => {
        if (alive) setPublicUnits([]);
      });
    return () => { alive = false; };
  }, [orgnr]);

  async function persist(nextUnits) {
    await onSaved({ ...company, subUnits: nextUnits });
  }

  async function search() {
    if (!canEdit) return;
    setError('');
    setSearching(true);
    try {
      const res = await searchBrregCompanies(queryText, { size: 8 });
      setHits(res.results || []);
      if (!res.results?.length) setError('Ingen treff i Brønnøysund. Avdelinger uten org.nr. registreres under.');
    } catch (e) {
      setError(e?.message || 'Søket mot Brønnøysund feilet.');
      setHits([]);
    } finally {
      setSearching(false);
    }
  }

  async function registerUnderenhet(hit) {
    const nextCompany = companyFromBrreg(hit);
    if (!nextCompany || !canEdit || busy) return;
    if (nextCompany.organisasjonsnummer === company?.organisasjonsnummer) {
      setError('Du kan ikke registrere selskapet som underenhet av seg selv.');
      return;
    }
    const made = createUnderenhet({
      name: nextCompany.navn,
      organisasjonsnummer: nextCompany.organisasjonsnummer,
    });
    if (!made.ok) {
      setError(made.error);
      return;
    }
    const added = addSubUnit(units, made.unit);
    if (!added.ok) {
      setError(added.error);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const user = auth.currentUser;
      if (!user) throw new Error('Du må være innlogget.');
      const owned = findOwnedOrganization(families, nextCompany.organisasjonsnummer);
      let companyId = owned?.id || '';
      if (!companyId) {
        const snap = await getDocs(query(
          collection(db, 'families'),
          where('orgnr', '==', digitsOrgnr(nextCompany.organisasjonsnummer)),
        ));
        const existing = organizationByOrgnr(
          snap.docs.map((row) => ({ id: row.id, ...row.data() })),
          nextCompany.organisasjonsnummer,
        );
        if (existing?.id) {
          throw new Error('Organisasjonsnummeret er allerede registrert i ProTop. Åpne det selskapet hvis du er med, eller be om innpass.');
        }
        companyId = await createGroup({
          name: nextCompany.navn,
          type: 'organization',
          language: 'nb',
          user,
          profile: userProfile,
        });
        const patch = linkedCompanyFields({
          parentId: familyId,
          parentName: company?.navn || '',
          company: nextCompany,
        });
        if (patch.orgnr) {
          try {
            const data = await fetchCompanyCpv(patch.orgnr);
            patch.cpvCodes = data.cpvCodes || [];
            patch.cpvSource = patch.cpvCodes.length ? 'doffin' : '';
            if (data.company?.name) patch.company = { ...nextCompany, navn: data.company.name };
          } catch {
            patch.cpvSource = '';
          }
        }
        await updateGroup(companyId, patch);
      } else if (owned.id !== familyId) {
        await updateGroup(owned.id, {
          parentCompanyId: familyId,
          parentCompanyName: company?.navn || '',
        });
      }
      const linked = { ...made.unit, companyId };
      const next = addSubUnit(units, linked);
      if (!next.ok) throw new Error(next.error);
      await persist(next.list);
      setHits([]);
      setQueryText('');
    } catch (e) {
      setError(e?.message || 'Kunne ikke registrere underenheten.');
    } finally {
      setBusy(false);
    }
  }

  async function registerDepartment() {
    if (!canEdit || busy) return;
    const made = createDepartment({ name: deptName, note: deptNote });
    if (!made.ok) {
      setError(made.error);
      return;
    }
    const added = addSubUnit(units, made.unit);
    if (!added.ok) {
      setError(added.error);
      return;
    }
    setBusy(true);
    setError('');
    try {
      await persist(added.list);
      setDeptName('');
      setDeptNote('');
    } catch (e) {
      setError(e?.message || 'Kunne ikke registrere avdelingen.');
    } finally {
      setBusy(false);
    }
  }

  async function removeUnit(id) {
    if (!canEdit || busy) return;
    setBusy(true);
    setError('');
    try {
      await persist(removeSubUnit(units, id));
    } catch (e) {
      setError(e?.message || 'Kunne ikke fjerne enheten.');
    } finally {
      setBusy(false);
    }
  }

  const children = underenheterOf(units);
  const departments = departmentsOf(units);

  return (
    <View style={styles.block} nativeID="company-structure" id="company-structure">
      <Text accessibilityRole="header" dataSet={{ heading: '1' }} style={[styles.heading, { color: colors.ink }]}>
        Underenheter og avdelinger
      </Text>
      <Text style={[styles.lead, { color: colors.muted }]}>
        Underenheter, for eksempel datterselskap, får eget selskap og eget abonnement.
        Opplysninger deles ikke automatisk. Avdelinger uten org.nr. ligger på dette selskapet.
      </Text>

      {children.map((row) => (
        <View key={row.id} style={[styles.row, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {[row.organisasjonsnummer, 'Eget abonnement'].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {row.companyId && onOpenCompany ? (
            <TouchableOpacity onPress={() => onOpenCompany(row.companyId)} accessibilityLabel={`Åpne ${row.name}`}>
              <Text style={{ color: colors.brand, fontWeight: '400' }}>Åpne</Text>
            </TouchableOpacity>
          ) : null}
          {canEdit ? (
            <TouchableOpacity onPress={() => removeUnit(row.id)}>
              <Text style={{ color: colors.muted, fontWeight: '400' }}>Fjern</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      {departments.map((row) => (
        <View key={row.id} style={[styles.row, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.ink, fontWeight: '400' }}>{row.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {['Avdeling', row.note].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {canEdit ? (
            <TouchableOpacity onPress={() => removeUnit(row.id)}>
              <Text style={{ color: colors.muted, fontWeight: '400' }}>Fjern</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ))}

      {!units.length ? (
        <Text style={[styles.lead, { color: colors.muted }]}>Ingen underenheter eller avdelinger er registrert ennå.</Text>
      ) : null}

      {canEdit ? (
        <>
          {publicUnitsNotRegistered(publicUnits, units).length ? (
            <>
              <Text style={[styles.label, { color: colors.muted }]}>Fra Enhetsregisteret</Text>
              <Text style={[styles.lead, { color: colors.muted }]}>
                Disse underenhetene er registrert på org.nr. i Brønnøysund. Registrer dem i ProTop for eget abonnement.
              </Text>
              {publicUnitsNotRegistered(publicUnits, units).map((hit) => (
                <TouchableOpacity
                  key={hit.organisasjonsnummer}
                  onPress={() => registerUnderenhet(hit)}
                  disabled={busy}
                  style={[styles.hit, { borderColor: colors.line, backgroundColor: colors.card }]}
                >
                  <Ionicons name="git-network-outline" size={16} color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontWeight: '400' }}>{hit.navn}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>
                      {[hit.organisasjonsnummer, 'Underenhet', hit.addressLabel].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <Text style={{ color: colors.brand, fontWeight: '400' }}>Registrer</Text>
                </TouchableOpacity>
              ))}
            </>
          ) : null}

          <Text style={[styles.label, { color: colors.muted }]}>Søk etter underenhet eller datterselskap</Text>
          <TextInput
            value={queryText}
            onChangeText={setQueryText}
            placeholder="Navn eller org.nr."
            placeholderTextColor={colors.placeholder}
            editable={!busy}
            onSubmitEditing={search}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <TouchableOpacity
            onPress={search}
            disabled={busy || searching}
            style={[styles.btn, { backgroundColor: colors.sunken }]}
          >
            {searching ? <ActivityIndicator color={colors.ink} /> : (
              <Text style={[styles.btnText, { color: colors.ink }]}>Søk i Brønnøysund</Text>
            )}
          </TouchableOpacity>
          {hits.map((hit) => (
            <TouchableOpacity
              key={hit.organisasjonsnummer}
              onPress={() => registerUnderenhet(hit)}
              disabled={busy}
              style={[styles.hit, { borderColor: colors.line, backgroundColor: colors.card }]}
            >
              <Ionicons name="business-outline" size={16} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.ink, fontWeight: '400' }}>{hit.navn}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {[hit.organisasjonsnummer, hit.kind === 'underenhet' ? 'Underenhet' : hit.organisasjonsform, hit.addressLabel].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={{ color: colors.brand, fontWeight: '400' }}>Registrer</Text>
            </TouchableOpacity>
          ))}

          <Text style={[styles.label, { color: colors.muted }]}>Registrer avdeling</Text>
          <Field label="Navn" value={deptName} onChangeText={setDeptName} placeholder="F.eks. Drift Oslo" colors={colors} editable={!busy} />
          <Field label="Merknad" value={deptNote} onChangeText={setDeptNote} placeholder="Valgfritt" colors={colors} editable={!busy} />
          <TouchableOpacity onPress={registerDepartment} disabled={busy} style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={styles.btnText}>{busy ? 'Lagrer…' : 'Legg til avdeling'}</Text>
          </TouchableOpacity>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  heading: { fontSize: 18, fontWeight: '600' },
  lead: { fontSize: 14, lineHeight: 20, fontWeight: '400' },
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '400' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, fontWeight: '400' },
  btn: {
    alignSelf: 'flex-start',
    borderRadius: 12,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  btnText: { color: '#fff', fontWeight: '400' },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  hit: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
});
