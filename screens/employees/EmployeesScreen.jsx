import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { departmentsOf } from '../../src/project/companyUnits';
import { searchKartverketAdresser } from '../../src/utils/boligmappaApis';
import { downloadBytes } from '../../src/indeksregulering/office';
import { pickDocument, pickImage, pickImages, uploadImage } from '../../src/utils/media';
import { projectSheetFile } from '../../src/employees/projectSheet';
import { CV_IMPORT_ACCEPT, applyImportedCv, readCvImport } from '../../src/employees/cvImport';
import { cvAttention } from '../../src/employees/cvReview';
import { slimCvDocument, storeCvImages } from '../../src/employees/cvPictures';
import { PROJECT_IMPORT_ACCEPT, readProjectTable } from '../../src/employees/projectImport';
import { EMPLOYEE_IMPORT_ACCEPT } from '../../src/employees/import';
import { readEmployeeImport } from '../../src/imports/assist';
import { askImportInterpret } from '../../src/imports/interpretClient';
import { employeeReviewSeverity, importResult } from '../../src/imports/review';
import ImportReview, { ImportResult } from '../../components/ImportReview';
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
import { FORM_SECTIONS, OWNER_LABEL, cvEditorSections } from '../../src/employees/schema';
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
  return clipDetail(raw);
}

function clipDetail(value, limit = 220) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit - 1).trimEnd()}…`;
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
  const [busyKind, setBusyKind] = useState('');
  const [editSection, setEditSection] = useState('');
  const [editItemId, setEditItemId] = useState('');
  const [editToken, setEditToken] = useState(0);
  const [addressHits, setAddressHits] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [importPlan, setImportPlan] = useState(null);
  const [dropped, setDropped] = useState(() => new Set());
  const [importReport, setImportReport] = useState(null);
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

  function clearSectionEdit() {
    setEditSection('');
    setEditItemId('');
  }

  function beginSectionEdit(sectionId, itemId = '') {
    setEditSection(sectionId);
    setEditItemId(itemId);
    setEditToken((current) => current + 1);
    if (Platform.OS === 'web') {
      const targetId = view === 'cv' ? 'employee-cv-section' : 'employee-fields';
      setTimeout(() => {
        globalThis.document?.getElementById(targetId)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      }, 40);
    }
  }

  function openList() {
    setView('list');
    setDraft(null);
    setAddressHits([]);
    clearSectionEdit();
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
      const plan = await readEmployeeImport(bytes, file.name, {
        existing: rows,
        departments,
        familyId,
      }, (payload) => askImportInterpret(payload));
      setImportPlan(plan);
      setDropped(new Set());
      setImportReport(null);
      setView('import');
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
    } catch (err) {
      const message = String(err?.message || '');
      showError(/failed to fetch/i.test(message) || (err?.name === 'TypeError' && !message)
        ? 'Kunne ikke lese Excel-filen. Eksporter listen som CSV og importer den i stedet.'
        : (message || 'Kunne ikke lese listen.'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!isAdmin || !importPlan || busy) return;
    const accepted = importPlan.rows.filter((row, index) => (
      employeeReviewSeverity(row) !== 'block' && !dropped.has(String(index)) && row.employee
    ));
    if (!accepted.length) {
      showError('Ingen rader er valgt for import.');
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
      const imported = [];
      const leftOut = [];
      importPlan.rows.forEach((row, index) => {
        const taken = employeeReviewSeverity(row) !== 'block' && !dropped.has(String(index)) && row.employee;
        if (!taken) {
          leftOut.push({
            name: row.name,
            reason: employeeReviewSeverity(row) === 'block'
              ? (row.reason || 'Kan ikke importeres.')
              : 'Valgt bort før lagring.',
          });
          return;
        }
        imported.push({ name: row.name, issues: row.warnings || [] });
      });
      setImportReport(importResult(imported, leftOut));
      setImportPlan(null);
      setDropped(new Set());
      setDraft(null);
      setView('list');
      setNote(importResult(imported, leftOut).complete ? '' : 'Se hvem som ikke ble importert, og hvilke avvik som ble lagret.');
    } catch (err) {
      showError(err?.message || 'Kunne ikke importere listen.');
    } finally {
      setBusy(false);
    }
  }

  function openNew() {
    resetMessage();
    clearSectionEdit();
    setSelectedId('');
    setDraft(presentEmployee({
      ...emptyEmployee(newId('emp')),
      createdAt: new Date().toISOString(),
    }));
    setView('edit');
  }

  function openDetail(row) {
    resetMessage();
    clearSectionEdit();
    setSelectedId(row.id);
    setView('detail');
  }

  function openEdit(row) {
    resetMessage();
    clearSectionEdit();
    setSelectedId(row.id);
    setDraft(presentEmployee(row));
    setView('edit');
  }

  function openCv(row) {
    resetMessage();
    clearSectionEdit();
    setSelectedId(row.id);
    setDraft(presentEmployee(row));
    setView('cv');
  }

  async function importCvFile() {
    if (!draft || busy) return;
    setError('');
    const file = await pickDocument({ accept: CV_IMPORT_ACCEPT });
    if (!file) return;
    setBusy(true);
    setBusyKind('cv');
    try {
      const bytes = await bytesFromFile(file);
      if (bytes.length > 8_000_000) setNote('Filen er stor. Sidene gjøres mindre før de leses.');
      const interpreted = await readCvImport(bytes, file.name, {
        familyId,
        ask: (payload) => askImportInterpret(payload),
      });
      const applied = applyImportedCv(draft, interpreted.cv);
      setDraft(presentEmployee(applied.employee));
      scrollRef.current?.scrollTo?.({ y: 0, animated: true });
      const understood = interpreted.engine === 'text'
        ? ' fra teksten i filen'
        : interpreted.engine?.includes('ocr')
          ? ' med OCR og AI'
          : ' med AI';
      const found = applied.added.length ? `Lagt inn: ${applied.added.join(', ')}.` : 'Ingen nye opplysninger ble funnet.';
      const kept = applied.kept.length ? ` Det som allerede var fylt ut, ble beholdt: ${applied.kept.join(', ')}.` : '';
      setNote(`CV-en er lest${understood}. ${found}${kept} Ingenting er lagret før du trykker Lagre CV.`);
    } catch (err) {
      showError(err?.message || 'Kunne ikke lese CV-en.');
    } finally {
      setBusy(false);
      setBusyKind('');
    }
  }

  async function projectsFromSheet(bytes, filename) {
    const interpreted = await readCvImport(bytes, filename, {
      familyId,
      ask: (payload) => askImportInterpret(payload),
    });
    const projects = interpreted.cv?.projects || [];
    if (!projects.length) throw new Error('Fant ingen referanseprosjekter i dokumentet.');
    return projects;
  }

  function downloadSheet(project, kind) {
    try {
      const currentName = displayName(draft);
      const personName = currentName === 'Uten navn' ? (project.referenceName || '') : currentName;
      const file = projectSheetFile(project, kind, personName);
      downloadBytes(file.filename, file.bytes, file.mime);
    } catch (err) {
      showError(err?.message || 'Kunne ikke lage referansearket.');
    }
  }

  async function importProjectsFile() {
    if (!draft || busy) return;
    setError('');
    const file = await pickDocument({ accept: PROJECT_IMPORT_ACCEPT });
    if (!file) return;
    setBusy(true);
    setBusyKind('projects');
    try {
      const bytes = await bytesFromFile(file);
      const sheetFile = /\.(pdf|png|jpe?g|webp|docx)$/i.test(file.name || '');
      const projects = sheetFile
        ? await projectsFromSheet(bytes, file.name)
        : await readProjectTable(bytes, file.name);
      const applied = applyImportedCv(draft, { projects });
      setDraft(presentEmployee(applied.employee));
      const found = applied.added.length
        ? `Lagt inn: ${applied.added.join(', ')}.`
        : 'Ingen nye prosjekter ble funnet.';
      const saveLabel = view === 'cv' ? 'Lagre CV' : 'Lagre';
      setNote(`Prosjektlisten er lest. ${found} Feltene som stod i dokumentet er fylt ut, og tomme felt er tomme. Prosjektene knyttes til personen. Ingenting er lagret før du trykker ${saveLabel}.`);
    } catch (err) {
      showError(err?.message || 'Kunne ikke lese prosjektlisten.');
    } finally {
      setBusy(false);
      setBusyKind('');
    }
  }

  function openMine() {
    resetMessage();
    clearSectionEdit();
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

  async function addProjectImages(index) {
    try {
      const picked = await pickImages({ max: 8 });
      const files = Array.isArray(picked) ? picked.filter(Boolean) : [];
      if (!files.length || !draft) return;
      const id = draft.id || newId('emp');
      const projectId = draft.cv?.projects?.[index]?.id || newId('prj');
      const urls = [];
      for (let fileIndex = 0; fileIndex < files.length; fileIndex += 1) {
        const url = await uploadImage(
          `families/${familyId || 'personal'}/employees/${id}/projects/${projectId}/${Date.now().toString(36)}-${fileIndex}`,
          files[fileIndex],
        );
        if (url) urls.push(url);
      }
      if (!urls.length) throw new Error('Kunne ikke laste opp bildene.');
      setDraft((current) => {
        const projects = (current.cv?.projects || []).map((row, rowIndex) => {
          if (rowIndex !== index) return row;
          const existing = Array.isArray(row.images) ? row.images : [];
          return {
            ...row,
            id: row.id || projectId,
            images: [...existing, ...urls].slice(0, 8),
          };
        });
        return { ...current, id, cv: { ...current.cv, projects } };
      });
    } catch (err) {
      setError(err?.message || 'Kunne ikke laste opp bildene.');
    }
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
      const uploaded = await storeCvImages(result.employee, (path, dataUrl) => (
        uploadImage(`families/${familyId || 'personal'}/${path}`, dataUrl)
      ));
      const slim = slimCvDocument(uploaded);
      const employee = slim.employee;
      const imageNote = !slim.dropped
        ? ''
        : slim.keptPhoto
          ? ` Profilbildet er beholdt. ${slim.dropped} prosjektbilder ble ikke med og kan legges inn med blyanten.`
          : ` ${slim.dropped} bilder ble ikke med, fordi opplastingen ikke svarte. De kan legges inn med blyanten.`;
      if (scope === 'profile') {
        const nextProfile = rememberLink({
          ...(profile || {}),
          person: employee.person,
          cv: employee.cv,
          customFields: employee.customFields.filter((field) => field.owner === 'person'),
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
        setNote((linked
          ? 'Profilen er lagret og ansettelsen i selskapet er oppdatert.'
          : 'Profilen er lagret. Den følger deg, og kan knyttes til et selskap senere.') + imageNote);
        return;
      }
      const saved = await saveEmployee(familyId, employee);
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
      if (view === 'cv') {
        setDraft(presentEmployee(saved));
        setNote(`CV-en er lagret.${imageNote}`);
        return;
      }
      setView('detail');
      setDraft(null);
      setNote(`Medarbeideren er lagret.${imageNote}`);
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

  const cvEmployee = view === 'cv' && draft && draft.id === selectedId ? draft : selected;
  const cv = cvEmployee ? buildCv(cvEmployee, { companyName }) : null;
  const canEditCv = view === 'cv' && !!draft && (isAdmin || (!!selected?.personUid && selected.personUid === uid));
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
        {view === 'mine' ? 'Min side' : view === 'import' ? 'Kontroller import' : view === 'cv' && selected ? `CV · ${displayName(selected)}` : view !== 'list' && selected ? displayName(selected) : 'Ansatte'}
      </Text>
      {view === 'list' ? (
        <Text style={[styles.lead, { color: colors.muted }]}>
          Registrer medarbeidere her. Det som følger personen, som kontakt, utdanning og CV, fyller den ansatte ut på sin side. Ansettelse, avdeling og tilgang fyller bedriften ut.
        </Text>
      ) : null}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
      {view === 'list' && importReport ? <ImportResult colors={colors} result={importReport} /> : null}

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
                <Text style={{ color: colors.ink }}>{busy ? 'Tolker filen…' : 'Importer liste'}</Text>
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
            <TouchableOpacity onPress={() => openCv(selected)} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>CV</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      {view === 'import' && importPlan ? (
        <ImportReview
          nativeID="employees-import-plan"
          colors={colors}
          lead={[
            'Ingenting er lagret ennå. Kontroller radene og bekreft importen.',
            'Lik e-post oppdaterer medarbeideren som finnes. Rettigheter lagres på ansettelsen og endrer ikke hvem som er administrator i ProTop.',
            summaryNote(importPlan.ignoredSummaries),
            importPlan.interpretation?.engine?.includes('ocr') ? 'Dokumentet er lest med OCR og AI.' : '',
            importPlan.interpretation?.engine && importPlan.interpretation.engine !== 'lokal' && !importPlan.interpretation.engine.includes('ocr') ? 'Ukjente kolonner er tolket med AI.' : '',
            importPlan.permissionColumns?.length ? `Rettighetskolonner: ${importPlan.permissionColumns.join(', ')}.` : '',
            importPlan.customColumns?.length ? `Andre kolonner lagres som egne felt: ${importPlan.customColumns.join(', ')}.` : '',
          ].filter(Boolean).join('\n')}
          rows={importPlan.rows.map((row, index) => ({
            id: String(index),
            severity: employeeReviewSeverity(row),
            title: row.name,
            meta: [
              row.action === 'create' ? 'Ny' : row.action === 'update' ? 'Oppdaterer eksisterende' : '',
              row.email,
              row.detail,
              row.accessRole,
              row.permissions?.length ? `Rettigheter: ${row.permissions.join(', ')}` : '',
            ].filter(Boolean).join(' · '),
            issues: [row.reason, ...(row.warnings || [])].filter(Boolean),
            included: employeeReviewSeverity(row) !== 'block' && !dropped.has(String(index)),
          }))}
          busy={busy}
          confirmLabel={(count) => `Importer ${count} medarbeidere`}
          onToggle={(id) => setDropped((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
          })}
          onConfirm={confirmImport}
          onCancel={() => { setImportPlan(null); setDropped(new Set()); setView('list'); }}
        />
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
            const shown = items.slice(0, 3);
            const more = items.length - shown.length;
            return (
              <View key={section.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
                <View style={styles.cardHead}>
                  <Text style={[styles.sectionTitle, { color: colors.ink }]}>{section.title}</Text>
                  <Text style={{ color: colors.brand, fontSize: 12 }}>{`${items.length}`}</Text>
                </View>
                {shown.map((item) => (
                  <Text key={item.id} style={{ color: colors.ink }}>{repeatSummary(section.id, item)}</Text>
                ))}
                {more > 0 ? (
                  <TouchableOpacity onPress={() => openCv(selected)} accessibilityRole="button">
                    <Text style={{ color: colors.brand }}>{`og ${more} til i CV-en`}</Text>
                  </TouchableOpacity>
                ) : null}
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
        <View nativeID="employee-fields" style={styles.stack}>
          {view === 'mine' ? (
            <Text style={{ color: colors.muted }}>
              Dette følger deg. Bedriften ser det på ansettelsen når du er knyttet, og du kan ta det med til neste selskap.
              {linked ? '' : ' Ingen ansettelse er knyttet til deg i dette selskapet ennå.'}
            </Text>
          ) : (
            <Text style={{ color: colors.muted }}>Åpne ett avsnitt om gangen. Bildet vises på profilen og øverst i CV-en.</Text>
          )}
          {(view === 'mine' || isAdmin || (!!draft.personUid && draft.personUid === uid)) ? (
            <TouchableOpacity
              nativeID="employee-project-import"
              onPress={importProjectsFile}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.secondary, { borderColor: colors.line, opacity: busy ? 0.6 : 1, alignSelf: 'flex-start' }]}
            >
              <Text style={{ color: colors.ink }}>{busy && busyKind === 'projects' ? 'Leser prosjekter…' : 'Importer prosjekter'}</Text>
            </TouchableOpacity>
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
            onProjectImage={addProjectImages}
            review
            startOpen={editSection}
            focusItemId={editItemId}
            openToken={editToken}
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
        <View nativeID="employee-cv-editor" style={styles.stack}>
          <CvAttention draft={cvEmployee} colors={colors} />
          {canEditCv && editSection ? (
            <View nativeID="employee-cv-section">
              <EmployeeFields
                key={`${editSection}:${editItemId}:${editToken}`}
                draft={draft}
                scope="employee"
                sections={cvEditorSections('employee').filter((section) => section.id === editSection)}
                showCustom={false}
                review
                startOpen={editSection}
                focusItemId={editItemId}
                openToken={editToken}
                hideItems={editSection === 'projects' && !editItemId}
                onClose={clearSectionEdit}
                colors={colors}
                canEditOwner={canEditOwner}
                departments={departments}
                members={people}
                addressHits={addressHits}
                onPickAddress={pickAddress}
                onChange={changeDraft}
                onPhoto={choosePhoto}
                onProjectImage={addProjectImages}
              />
            </View>
          ) : null}
          <EmployeeCvView
            cv={cv}
            colors={colors}
            onEdit={canEditCv ? (sectionId) => beginSectionEdit(sectionId) : undefined}
            onEditProject={canEditCv ? (project) => beginSectionEdit('projects', project.id) : undefined}
            onProjectFile={downloadSheet}
          />
          <View style={styles.row}>
            {canEditCv ? (
              <TouchableOpacity
                nativeID="employee-cv-save"
                onPress={save}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.primary, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={styles.primaryText}>{busy ? 'Lagrer…' : 'Lagre CV'}</Text>
              </TouchableOpacity>
            ) : null}
            {canEditCv ? (
              <TouchableOpacity
                nativeID="employee-cv-import"
                onPress={importCvFile}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.secondary, { borderColor: colors.line, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.ink }}>{busy && busyKind === 'cv' ? 'Leser CV…' : 'Importer CV'}</Text>
              </TouchableOpacity>
            ) : null}
            {canEditCv ? (
              <TouchableOpacity
                nativeID="employee-project-import-cv"
                onPress={importProjectsFile}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.secondary, { borderColor: colors.line, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.ink }}>{busy && busyKind === 'projects' ? 'Leser prosjekter…' : 'Importer prosjekter'}</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={() => copyCv(cv)} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Kopier tekst</Text>
            </TouchableOpacity>
            {Platform.OS === 'web' ? (
              <TouchableOpacity onPress={() => globalThis.print?.()} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink }}>Skriv ut</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}

      {view === 'mine' && mineCv ? (
        <View style={styles.stack}>
          <Text style={[styles.sectionTitle, { color: colors.ink }]}>Slik blir CV-en</Text>
          <EmployeeCvView
            cv={mineCv}
            colors={colors}
            onEdit={(sectionId) => beginSectionEdit(sectionId)}
            onEditProject={(project) => beginSectionEdit('projects', project.id)}
            onProjectFile={downloadSheet}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function repeatSummary(sectionId, item) {
  let line = item.title || 'Oppføring';
  if (sectionId === 'education') {
    const when = [item.from, item.to].filter(Boolean).join('–');
    line = [when, item.school, item.program].filter(Boolean).join(' · ') || 'Utdanning';
  } else if (sectionId === 'experience') {
    line = [item.employer, item.title, item.from].filter(Boolean).join(' · ') || 'Erfaring';
  } else if (sectionId === 'courses') {
    line = [item.date, item.title].filter(Boolean).join(' · ') || 'Kurs';
  } else if (sectionId === 'projects') {
    line = [item.title, item.client].filter(Boolean).join(' · ') || 'Prosjekt';
  }
  return clipDetail(line, 90);
}

function CvAttention({ draft, colors }) {
  const attention = cvAttention(draft);
  const warn = '#9a6700';
  const danger = colors.danger || '#b42318';
  if (!attention.gaps.length && !attention.issues.length) return null;
  return (
    <View nativeID="employee-cv-attention" style={[styles.attention, { borderColor: warn, backgroundColor: colors.card }]}>
      <Text style={{ color: warn, fontWeight: '700' }}>Se over før du lagrer</Text>
      {attention.gaps.length ? (
        <Text style={{ color: danger, fontWeight: '600' }}>
          {`Mangler: ${attention.gaps.map((item) => item.label).join(', ')}.`}
        </Text>
      ) : null}
      {attention.issues.map((issue) => (
        <Text key={issue.text} style={{ color: warn, fontWeight: '600' }}>{issue.text}</Text>
      ))}
    </View>
  );
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

function summaryNote(labels) {
  const list = (Array.isArray(labels) ? labels : []).map((label) => String(label || '').trim()).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return `«${list[0]}» er en sumrad i filen, ikke en medarbeider, og tas ikke med.`;
  return `Sumrader tas ikke med: ${list.join(', ')}. De er ikke medarbeidere.`;
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
  attention: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { width: 160, fontSize: 14 },
  factValue: { flex: 1, fontSize: 15 },
});
