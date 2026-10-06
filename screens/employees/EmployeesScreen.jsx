import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { departmentsOf } from '../../src/project/companyUnits';
import { searchKartverketAdresser } from '../../src/utils/boligmappaApis';
import { pickDocument, pickImage, uploadImage } from '../../src/utils/media';
import { EMPLOYEE_IMPORT_ACCEPT, planEmployeeImport } from '../../src/employees/import';
import {
  absorbCompanyIntoProfile,
  applyProfessionalProfile,
  buildCv,
  canSeeSensitive,
  cardSubtitle,
  choiceLabel,
  commitEmployee,
  contactLine,
  cvPlainText,
  departmentLabels,
  directoryStats,
  displayName,
  emptyEmployee,
  filterEmployees,
  formatNbDate,
  gapReport,
  hasPersonContent,
  initials,
  linkClash,
  maskNationalId,
  newId,
  periodLabel,
  presentEmployee,
  readPath,
  rememberLink,
  sortEmployees,
  statusLabel,
} from '../../src/employees/model';
import { FORM_SECTIONS, OWNER_LABEL } from '../../src/employees/schema';
import {
  loadProfessionalProfile,
  removeEmployee,
  saveEmployee,
  saveProfessionalProfile,
  watchEmployees,
} from '../../src/employees/storage';
import EmployeeCvView from './EmployeeCvView';
import EmployeeFields from './EmployeeFields';

async function bytesFromFile(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') {
    blob = await (await fetch(file.uri)).blob();
  }
  if (!blob || typeof blob.arrayBuffer !== 'function') {
    throw new Error('Kunne ikke lese filen.');
  }
  return new Uint8Array(await blob.arrayBuffer());
}

const FILTERS = [
  ['current', 'Nåværende'],
  ['external', 'Eksterne'],
  ['leave', 'Permisjon'],
  ['former', 'Sluttet'],
  ['all', 'Alle'],
];

function showDetailValue(employee, field, reveal) {
  if (field.sensitive && !reveal) return '';
  if (field.type === 'photo' || field.type === 'departments' || field.type === 'member') return '';
  const raw = readPath(employee, field.key);
  if (field.type === 'tags') return Array.isArray(raw) ? raw.filter(Boolean).join(', ') : '';
  if (field.type === 'bool') return raw ? 'Ja' : '';
  if (field.key === 'person.nationalId') return reveal ? raw : maskNationalId(raw);
  if (field.type === 'date') return formatNbDate(raw);
  if (field.type === 'choice') return choiceLabel(field.options, raw);
  if (field.type === 'percent') return raw ? `${raw} %` : '';
  return String(raw || '').trim();
}

export default function EmployeesScreen() {
  const colors = useColors();
  const { familyId, family, members, uid, user, userProfile, isAdmin } = useApp();
  const companyName = family?.company?.navn || family?.name || '';
  const departments = useMemo(
    () => departmentsOf(family?.company?.subUnits || []),
    [family?.company?.subUnits],
  );
  const people = useMemo(() => {
    const list = (members || [])
      .filter((member) => member.uid || member.id)
      .map((member) => ({ uid: member.uid || member.id, name: member.name || 'Medlem' }));
    if (uid && !list.some((member) => member.uid === uid)) {
      list.unshift({
        uid,
        name: userProfile?.displayName || user?.displayName || user?.email || 'Meg',
      });
    }
    return list;
  }, [members, uid, user, userProfile]);

  const [rows, setRows] = useState([]);
  const [profile, setProfile] = useState(null);
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [filter, setFilter] = useState('current');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [addressHits, setAddressHits] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importPlan, setImportPlan] = useState(null);
  const pickedAddress = useRef('');
  const scrollRef = useRef(null);

  function showError(message) {
    setNote('');
    setError(message);
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  }

  useEffect(() => {
    if (!familyId) return undefined;
    return watchEmployees(familyId, setRows, (err) => {
      setError(err?.message || 'Kunne ikke hente medarbeidere.');
    });
  }, [familyId]);

  useEffect(() => {
    if (!uid) return undefined;
    let live = true;
    loadProfessionalProfile(uid).then((next) => {
      if (live) setProfile(next);
    }).catch(() => {});
    return () => { live = false; };
  }, [uid]);

  useEffect(() => {
    if (view !== 'edit' && view !== 'mine') return undefined;
    const q = String(draft?.person?.address1 || '').trim();
    if (q.length < 3 || q === pickedAddress.current) {
      setAddressHits([]);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(async () => {
      try {
        const found = await searchKartverketAdresser(q, { treffPerSide: 5 });
        if (live) setAddressHits(found.results || []);
      } catch {
        if (live) setAddressHits([]);
      }
    }, 280);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [view, draft?.person?.address1]);

  const selected = rows.find((row) => row.id === selectedId) || null;
  const linked = rows.find((row) => row.personUid && row.personUid === uid) || null;
  const statusRows = useMemo(
    () => filterEmployees(rows, { status: filter, departments }),
    [rows, filter, departments],
  );
  const visible = useMemo(
    () => filterEmployees(rows, { status: filter, query, departments }),
    [rows, filter, query, departments],
  );
  const stats = directoryStats(statusRows);
  const reveal = selected ? canSeeSensitive(selected, { uid, isAdmin }) : false;

  function resetMessage() {
    setNote('');
    setError('');
    setConfirmDelete(false);
  }

  function openList() {
    setView('list');
    setDraft(null);
    setAddressHits([]);
    resetMessage();
  }

  async function openImport() {
    if (!isAdmin || busy) return;
    resetMessage();
    const picked = await pickDocument({ accept: EMPLOYEE_IMPORT_ACCEPT });
    const file = Array.isArray(picked) ? picked[0] : picked;
    if (!file) return;
    setBusy(true);
    try {
      const bytes = await bytesFromFile(file);
      const plan = await planEmployeeImport(bytes, file.name, { existing: rows, departments });
      setImportPlan(plan);
      setView('import');
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
    } catch (err) {
      showError(err?.message || 'Kunne ikke lese listen.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!isAdmin || !importPlan || busy) return;
    const accepted = importPlan.rows.filter((row) => row.employee);
    if (!accepted.length) {
      showError('Ingen rader kan importeres.');
      return;
    }
    if (!familyId) {
      showError('Åpne selskapet før du importerer.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const saved = [];
      for (const row of accepted) saved.push(await saveEmployee(familyId, row.employee));
      setRows((current) => {
        const map = new Map(current.map((row) => [row.id, row]));
        for (const row of saved) map.set(row.id, row);
        return sortEmployees([...map.values()]);
      });
      const created = importPlan.rows.filter((row) => row.action === 'create').length;
      const updated = importPlan.rows.filter((row) => row.action === 'update').length;
      const skipped = importPlan.rows.filter((row) => row.action === 'skip').length;
      setImportPlan(null);
      setDraft(null);
      setView('list');
      setNote(`Importert ${created} nye og oppdatert ${updated}.${skipped ? ` ${skipped} rader ble hoppet over.` : ''}`);
    } catch (err) {
      showError(err?.message || 'Kunne ikke importere listen.');
    } finally {
      setBusy(false);
    }
  }

  function openNew() {
    resetMessage();
    setSelectedId('');
    setDraft(presentEmployee({
      ...emptyEmployee(newId('emp')),
      createdAt: new Date().toISOString(),
    }));
    setView('edit');
  }

  function openDetail(row) {
    resetMessage();
    setSelectedId(row.id);
    setView('detail');
  }

  function openEdit(row) {
    resetMessage();
    setSelectedId(row.id);
    setDraft(presentEmployee(row));
    setView('edit');
  }

  function openMine() {
    resetMessage();
    const base = profile || { person: {}, cv: {}, customFields: [] };
    const seed = !hasPersonContent(base) && linked ? absorbCompanyIntoProfile(base, linked) : base;
    setDraft(presentEmployee({
      ...emptyEmployee(),
      person: seed.person,
      cv: seed.cv,
      customFields: seed.customFields || [],
    }));
    setView('mine');
  }

  function changeDraft(next) {
    const previous = draft?.personUid || '';
    if (next.personUid && next.personUid !== previous && !next.person.firstName) {
      const member = people.find((person) => person.uid === next.personUid);
      const parts = String(member?.name || '').trim().split(/\s+/).filter(Boolean);
      if (parts.length) {
        next.person.firstName = parts.shift();
        if (!next.person.lastName) next.person.lastName = parts.join(' ');
      }
    }
    setDraft(next);
    setError('');
  }

  function pickAddress(hit) {
    const line = hit.adressetekst || hit.label || '';
    pickedAddress.current = line;
    setDraft((current) => ({
      ...current,
      person: {
        ...current.person,
        address1: line || current.person.address1,
        postalCode: hit.postnummer || current.person.postalCode,
        place: hit.poststed || current.person.place,
      },
    }));
    setAddressHits([]);
  }

  async function choosePhoto() {
    try {
      const picked = await pickImage({ edit: true, aspect: [1, 1] });
      if (!picked || !draft) return;
      const id = draft.id || newId('emp');
      const url = await uploadImage(`families/${familyId || 'personal'}/employees/${id}/photo`, picked);
      setDraft((current) => ({ ...current, id, person: { ...current.person, photoUrl: url } }));
    } catch (err) {
      setError(err?.message || 'Kunne ikke laste opp bildet.');
    }
  }

  function canEditOwner(owner) {
    if (view === 'mine') return owner === 'person';
    if (owner === 'company') return !!isAdmin;
    return !!isAdmin || (!!draft?.personUid && draft.personUid === uid);
  }

  async function save() {
    if (!draft || busy) return;
    const scope = view === 'mine' ? 'profile' : 'company';
    const result = commitEmployee(draft, { scope });
    if (!result.ok) {
      showError(result.errors.join('\n'));
      return;
    }
    if (scope === 'company' && !familyId) {
      showError('Åpne selskapet før du lagrer en ansettelse.');
      return;
    }
    const clash = scope === 'company' ? linkClash(rows, result.employee) : null;
    if (clash) {
      showError(`${displayName(clash)} er allerede knyttet til denne personen.`);
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (scope === 'profile') {
        const nextProfile = rememberLink({
          ...(profile || {}),
          person: result.employee.person,
          cv: result.employee.cv,
          customFields: result.employee.customFields.filter((field) => field.owner === 'person'),
        }, linked ? { companyId: familyId, employeeId: linked.id, companyName } : null);
        const stored = await saveProfessionalProfile(uid, nextProfile);
        setProfile(stored);
        if (linked && familyId) {
          const updated = await saveEmployee(familyId, applyProfessionalProfile(linked, stored));
          setRows((current) => sortEmployees([...current.filter((row) => row.id !== updated.id), updated]));
        }
        setDraft(presentEmployee({
          ...emptyEmployee(),
          person: stored.person,
          cv: stored.cv,
          customFields: stored.customFields,
        }));
        setNote(linked
          ? 'Profilen er lagret og ansettelsen i selskapet er oppdatert.'
          : 'Profilen er lagret. Den følger deg, og kan knyttes til et selskap senere.');
        return;
      }
      const saved = await saveEmployee(familyId, result.employee);
      setRows((current) => sortEmployees([...current.filter((row) => row.id !== saved.id), saved]));
      if (saved.personUid && saved.personUid === uid) {
        const stored = await saveProfessionalProfile(uid, rememberLink({
          ...(profile || {}),
          person: saved.person,
          cv: saved.cv,
          customFields: saved.customFields.filter((field) => field.owner === 'person'),
        }, { companyId: familyId, employeeId: saved.id, companyName }));
        setProfile(stored);
      }
      setSelectedId(saved.id);
      setView('detail');
      setDraft(null);
      setNote('Medarbeideren er lagret.');
    } catch (err) {
      showError(err?.message || 'Kunne ikke lagre.');
    } finally {
      setBusy(false);
    }
  }

  async function pushProfile() {
    if (!selected || !profile || busy) return;
    setBusy(true);
    try {
      const saved = await saveEmployee(familyId, applyProfessionalProfile(selected, profile));
      setRows((current) => sortEmployees([...current.filter((row) => row.id !== saved.id), saved]));
      setNote('Ansettelsen bruker nå opplysningene fra profilen din.');
    } catch (err) {
      setError(err?.message || 'Kunne ikke oppdatere ansettelsen.');
    } finally {
      setBusy(false);
    }
  }

  async function pullToProfile() {
    if (!selected || busy || !uid) return;
    setBusy(true);
    try {
      const stored = await saveProfessionalProfile(uid, rememberLink(
        absorbCompanyIntoProfile(profile, selected),
        { companyId: familyId, employeeId: selected.id, companyName },
      ));
      setProfile(stored);
      setNote('Tomme felter på profilen din er fylt fra denne ansettelsen.');
    } catch (err) {
      setError(err?.message || 'Kunne ikke oppdatere profilen.');
    } finally {
      setBusy(false);
    }
  }

  async function destroy() {
    if (!selected || busy) return;
    setBusy(true);
    try {
      await removeEmployee(familyId, selected.id);
      setRows((current) => current.filter((row) => row.id !== selected.id));
      setSelectedId('');
      setView('list');
      setNote('Medarbeideren er slettet.');
    } catch (err) {
      setError(err?.message || 'Kunne ikke slette.');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  async function copyCv(cv) {
    const text = cvPlainText(cv);
    try {
      if (Platform.OS === 'web' && globalThis.navigator?.clipboard?.writeText) {
        await globalThis.navigator.clipboard.writeText(text);
        setNote('CV-teksten er kopiert.');
        return;
      }
    } catch {
      /* fall through */
    }
    setError('Kopiering er ikke tilgjengelig i denne visningen.');
  }

  const cv = selected ? buildCv(selected, { companyName }) : null;
  const mineCv = draft && view === 'mine' ? buildCv({
    ...draft,
    company: {
      ...draft.company,
      title: draft.company?.title || linked?.company?.title || '',
    },
  }, { companyName }) : null;
  const gaps = selected ? gapReport(selected) : null;

  return (
    <ScrollView
      ref={scrollRef}
      nativeID="employees-page"
      id="employees-page"
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.inner}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.kicker, { color: colors.muted }]}>Bedrift</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
        {view === 'mine' ? 'Min side' : view === 'import' ? 'Importer liste' : view === 'cv' && selected ? `CV · ${displayName(selected)}` : view !== 'list' && selected ? displayName(selected) : 'Ansatte'}
      </Text>
      {view === 'list' ? (
        <Text style={[styles.lead, { color: colors.muted }]}>
          Registrer medarbeidere her. Det som følger personen, som kontakt, utdanning og CV, fyller den ansatte ut på sin side. Ansettelse, avdeling og tilgang fyller bedriften ut.
        </Text>
      ) : null}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}

      {view === 'list' ? (
        <>
          <View style={styles.row}>
            {isAdmin ? (
              <TouchableOpacity nativeID="employees-new" onPress={openNew} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
                <Text style={styles.primaryText}>Ny medarbeider</Text>
              </TouchableOpacity>
            ) : null}
            {isAdmin ? (
              <TouchableOpacity nativeID="employees-import" onPress={openImport} disabled={busy} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line, opacity: busy ? 0.6 : 1 }]}>
                <Text style={{ color: colors.ink }}>{busy ? 'Leser liste…' : 'Importer liste'}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity nativeID="employees-mine" onPress={openMine} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Min side</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            nativeID="employees-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Søk"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <View style={styles.chips}>
            {FILTERS.map(([id, label]) => {
              const on = filter === id;
              return (
                <TouchableOpacity
                  key={id}
                  onPress={() => setFilter(id)}
                  accessibilityRole="button"
                  style={[styles.chip, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
                >
                  <Text style={{ color: on ? colors.brand : colors.ink }}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          <View style={[styles.stats, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={{ color: colors.ink }}>
              {`Medarbeidere som kan logge inn  ${stats.login} (+${stats.external} eksterne)`}
            </Text>
            <Text style={{ color: colors.muted }}>{`Lisenser: ${stats.licenses}`}</Text>
          </View>
          {!visible.length ? (
            <Text style={{ color: colors.muted }}>
              {rows.length ? 'Ingen treff på filteret.' : 'Ingen medarbeidere er registrert ennå.'}
            </Text>
          ) : null}
          {visible.map((row) => (
            <TouchableOpacity
              key={row.id}
              onPress={() => openDetail(row)}
              accessibilityRole="button"
              accessibilityLabel={displayName(row)}
              style={[styles.person, { borderColor: colors.line, backgroundColor: colors.card }]}
            >
              {row.person.photoUrl ? (
                <Image source={{ uri: row.person.photoUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.sunken }]}>
                  <Text style={{ color: colors.ink, fontWeight: '700' }}>{initials(row)}</Text>
                </View>
              )}
              <View style={styles.grow}>
                <Text style={[styles.personName, { color: colors.ink }]}>{displayName(row)}</Text>
                {!!contactLine(row) && <Text style={{ color: colors.muted }}>{contactLine(row)}</Text>}
                <Text style={{ color: colors.muted }}>{cardSubtitle(row, companyName)}</Text>
                <View style={styles.chips}>
                  {departmentLabels(row, departments).map((name) => (
                    <Text key={name} style={[styles.dept, { color: colors.brand, backgroundColor: colors.brandSoft }]}>{name}</Text>
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </>
      ) : null}

      {view !== 'list' ? (
        <View style={styles.row}>
          <TouchableOpacity onPress={openList} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
            <Text style={{ color: colors.ink }}>Til oversikten</Text>
          </TouchableOpacity>
          {view === 'detail' && selected && (isAdmin || selected.personUid === uid) ? (
            <TouchableOpacity onPress={() => openEdit(selected)} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
              <Text style={styles.primaryText}>Rediger</Text>
            </TouchableOpacity>
          ) : null}
          {view === 'detail' && selected && (isAdmin || selected.personUid === uid) ? (
            <TouchableOpacity onPress={() => { resetMessage(); setView('cv'); }} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>CV</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {view === 'import' && importPlan ? (
        <View nativeID="employees-import-plan" style={styles.stack}>
          <Text style={{ color: colors.muted }}>
            Kontroller treffene før de lagres. Like e-postadresser oppdaterer medarbeideren som finnes. Tomme celler lar det som allerede er registrert stå.
          </Text>
          <Text style={{ color: colors.ink }}>
            Rettighetene lagres på ansettelsen. Importen endrer ikke hvem som er administrator i ProTop.
          </Text>
          {importPlan.permissionColumns.length ? (
            <Text style={{ color: colors.muted }}>{`Rettighetskolonner: ${importPlan.permissionColumns.join(', ')}.`}</Text>
          ) : null}
          {importPlan.customColumns.length ? (
            <Text style={{ color: colors.muted }}>{`Andre kolonner lagres som egne felt: ${importPlan.customColumns.join(', ')}.`}</Text>
          ) : null}
          {importPlan.rows.map((row, index) => (
            <View key={`${row.action}-${index}`} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={[styles.personName, { color: colors.ink }]}>{row.name}</Text>
              <Text style={{ color: colors.muted }}>
                {row.action === 'create' ? 'Ny' : row.action === 'update' ? 'Oppdateres' : 'Hoppes over'}
                {row.email ? ` · ${row.email}` : ''}
                {row.accessRole ? ` · ${row.accessRole}` : ''}
              </Text>
              {row.permissions?.length ? (
                <Text style={{ color: colors.ink }}>{`Rettigheter: ${row.permissions.join(', ')}`}</Text>
              ) : null}
              {row.action !== 'skip' ? (
                <Text style={{ color: colors.muted }}>
                  {[
                    row.canLogin ? 'Kan logge inn' : '',
                    row.hasLicense ? 'Lisens' : '',
                    row.canHandleLegal ? 'Juridiske saker' : '',
                    row.external ? 'Ekstern' : '',
                  ].filter(Boolean).join(' · ') || 'Ingen innlogging, lisens eller juridisk tilgang fra listen.'}
                </Text>
              ) : null}
              {row.reason ? <Text style={{ color: colors.danger || '#b42318' }}>{row.reason}</Text> : null}
              {(row.warnings || []).map((warning) => (
                <Text key={warning} style={{ color: colors.muted }}>{warning}</Text>
              ))}
            </View>
          ))}
          <TouchableOpacity
            nativeID="employees-import-confirm"
            onPress={confirmImport}
            disabled={busy || !importPlan.rows.some((row) => row.employee)}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
          >
            <Text style={styles.primaryText}>
              {busy ? 'Importerer…' : `Importer ${importPlan.rows.filter((row) => row.employee).length} medarbeidere`}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {view === 'detail' && selected ? (
        <View style={styles.stack}>
          <View style={styles.hero}>
            {selected.person.photoUrl ? (
              <Image source={{ uri: selected.person.photoUrl }} style={styles.heroPhoto} />
            ) : (
              <View style={[styles.heroPhoto, styles.avatarFallback, { backgroundColor: colors.sunken }]}>
                <Text style={{ color: colors.ink, fontSize: 28, fontWeight: '700' }}>{initials(selected)}</Text>
              </View>
            )}
            <View style={styles.grow}>
              <Text style={{ color: colors.muted }}>{statusLabel(selected.company.status)}</Text>
              <Text style={{ color: colors.ink }}>{cardSubtitle(selected, companyName)}</Text>
              {!!periodLabel(selected) && (
                <Text style={{ color: colors.ink }}>
                  {`${selected.company.workPercent ? `${selected.company.workPercent} % · ` : ''}${periodLabel(selected)}`}
                </Text>
              )}
              <Text style={{ color: colors.muted }}>
                {selected.linkStatus === 'linked'
                  ? 'Knyttet til en person. Personopplysninger og CV kan følge hen videre.'
                  : 'Ikke knyttet til en personprofil ennå.'}
              </Text>
            </View>
          </View>
          <View style={styles.chips}>
            {departmentLabels(selected, departments).map((name) => (
              <Text key={name} style={[styles.dept, { color: colors.brand, backgroundColor: colors.brandSoft }]}>{name}</Text>
            ))}
          </View>
          {selected.personUid === uid ? (
            <View style={styles.row}>
              <TouchableOpacity onPress={pushProfile} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink }}>Bruk min profil her</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={pullToProfile} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink }}>Hent til min profil</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {FORM_SECTIONS.filter((section) => !section.repeatable && section.id !== 'link').map((section) => {
            const entries = section.fields
              .map((field) => ({ field, value: showDetailValue(selected, field, reveal) }))
              .filter((entry) => entry.value);
            if (!entries.length) return null;
            return (
              <View key={section.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <View style={styles.cardHead}>
                  <Text style={[styles.sectionTitle, { color: colors.ink }]}>{section.title}</Text>
                  <Text style={{ color: colors.brand, fontSize: 12 }}>{OWNER_LABEL[section.owner]}</Text>
                </View>
                {entries.map(({ field, value }) => (
                  <View key={field.key} style={styles.fact}>
                    <Text style={[styles.factLabel, { color: colors.muted }]}>{field.label}</Text>
                    <Text style={[styles.factValue, { color: colors.ink }]}>{value}</Text>
                  </View>
                ))}
              </View>
            );
          })}
          {FORM_SECTIONS.filter((section) => section.repeatable).map((section) => {
            const items = readPath(selected, section.collection) || [];
            if (!items.length) return null;
            return (
              <View key={section.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <View style={styles.cardHead}>
                  <Text style={[styles.sectionTitle, { color: colors.ink }]}>{section.title}</Text>
                  <Text style={{ color: colors.brand, fontSize: 12 }}>{OWNER_LABEL[section.owner]}</Text>
                </View>
                {items.map((item) => (
                  <Text key={item.id} style={{ color: colors.ink }}>{repeatSummary(section.id, item)}</Text>
                ))}
              </View>
            );
          })}
          {selected.customFields?.some((field) => field.value && (isAdmin || (field.owner === 'person' && selected.personUid === uid))) ? (
            <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <View style={styles.cardHead}>
                <Text style={[styles.sectionTitle, { color: colors.ink }]}>Egne felt</Text>
                <Text style={{ color: colors.brand, fontSize: 12 }}>Fra listen eller skjemaet</Text>
              </View>
              {selected.customFields.filter((field) => field.value && (isAdmin || (field.owner === 'person' && selected.personUid === uid))).map((field) => (
                <View key={field.id} style={styles.fact}>
                  <Text style={[styles.factLabel, { color: colors.muted }]}>{field.label}</Text>
                  <Text style={[styles.factValue, { color: colors.ink }]}>{field.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
          {gaps ? (
            <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={[styles.sectionTitle, { color: colors.ink }]}>Mangler</Text>
              {!gaps.register.length && !gaps.person.length && !gaps.cv.length ? (
                <Text style={{ color: colors.muted }}>Påkrevde felt og CV-grunnlag er fylt ut.</Text>
              ) : null}
              {!!gaps.register.length && <GapList title="Må fylles ut" items={gaps.register} colors={colors} />}
              {!!gaps.person.length && <GapList title="Den ansatte fyller ut" items={gaps.person} colors={colors} />}
              {!!gaps.cv.length && <GapList title="Trengs til CV" items={gaps.cv} colors={colors} />}
            </View>
          ) : null}
          {isAdmin ? (
            confirmDelete ? (
              <View style={styles.row}>
                <TouchableOpacity onPress={destroy} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.danger || '#b42318' }]}>
                  <Text style={styles.primaryText}>Slett medarbeider</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setConfirmDelete(false)} accessibilityRole="button">
                  <Text style={{ color: colors.ink }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setConfirmDelete(true)} accessibilityRole="button">
                <Text style={{ color: colors.danger || '#b42318' }}>Slett medarbeider</Text>
              </TouchableOpacity>
            )
          ) : null}
        </View>
      ) : null}

      {(view === 'edit' || view === 'mine') && draft ? (
        <View style={styles.stack}>
          {view === 'mine' ? (
            <Text style={{ color: colors.muted }}>
              Dette følger deg. Bedriften ser det på ansettelsen når du er knyttet, og du kan ta det med til neste selskap.
              {linked ? '' : ' Ingen ansettelse er knyttet til deg i dette selskapet ennå.'}
            </Text>
          ) : null}
          <EmployeeFields
            draft={draft}
            scope={view === 'mine' ? 'profile' : 'employee'}
            colors={colors}
            canEditOwner={canEditOwner}
            departments={departments}
            members={people}
            addressHits={addressHits}
            onPickAddress={pickAddress}
            onChange={changeDraft}
            onPhoto={choosePhoto}
          />
          <TouchableOpacity
            nativeID="employee-save"
            onPress={save}
            disabled={busy}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
          >
            <Text style={styles.primaryText}>{busy ? 'Lagrer…' : 'Lagre'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {view === 'cv' && cv ? (
        <View style={styles.stack}>
          {cv.gaps.length ? (
            <Text style={{ color: colors.muted }}>
              {`CV-en kan skrives ut, men mangler: ${cv.gaps.map((item) => item.label).join(', ')}.`}
            </Text>
          ) : (
            <Text style={{ color: colors.muted }}>CV-en er bygget fra profilen og ansettelsen.</Text>
          )}
          <View style={styles.row}>
            <TouchableOpacity onPress={() => copyCv(cv)} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Kopier tekst</Text>
            </TouchableOpacity>
            {Platform.OS === 'web' ? (
              <TouchableOpacity onPress={() => globalThis.print?.()} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink }}>Skriv ut</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          <EmployeeCvView cv={cv} colors={colors} />
        </View>
      ) : null}

      {view === 'mine' && mineCv ? (
        <View style={styles.stack}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Slik blir CV-en</Text>
          <EmployeeCvView cv={mineCv} colors={colors} />
        </View>
      ) : null}
    </ScrollView>
  );
}

function repeatSummary(sectionId, item) {
  if (sectionId === 'education') {
    const when = [item.from, item.to].filter(Boolean).join('–');
    return [when, item.school, item.program].filter(Boolean).join(' · ') || 'Utdanning';
  }
  if (sectionId === 'experience') {
    return [item.employer, item.title, item.from].filter(Boolean).join(' · ') || 'Erfaring';
  }
  if (sectionId === 'courses') return [item.date, item.title].filter(Boolean).join(' · ') || 'Kurs';
  if (sectionId === 'projects') return [item.title, item.client].filter(Boolean).join(' · ') || 'Prosjekt';
  return item.title || 'Oppføring';
}

function GapList({ title, items, colors }) {
  return (
    <View style={styles.stackTight}>
      <Text style={{ color: colors.muted }}>{title}</Text>
      {items.map((item) => (
        <Text key={item.key} style={{ color: colors.ink }}>{`• ${item.label}`}</Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 16, paddingBottom: 48, gap: 12, maxWidth: 880, width: '100%', alignSelf: 'flex-start' },
  kicker: { fontSize: 12, letterSpacing: 0.4 },
  title: { fontSize: 28, fontWeight: '700' },
  lead: { fontSize: 15, lineHeight: 22 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  stack: { gap: 12 },
  stackTight: { gap: 4 },
  primary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  primaryText: { color: '#fff', fontWeight: '600' },
  secondary: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  stats: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  person: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 10 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  personName: { fontSize: 16, fontWeight: '700' },
  grow: { flex: 1, gap: 2 },
  dept: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, fontSize: 12 },
  hero: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  heroPhoto: { width: 120, height: 140, borderRadius: 12 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 160, fontSize: 14 },
  factValue: { flex: 1, fontSize: 15 },
});
