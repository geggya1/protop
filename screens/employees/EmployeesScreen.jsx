import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { departmentsOf } from '../../src/project/companyUnits';
import { searchKartverketAdresser } from '../../src/utils/boligmappaApis';
import { downloadBytes } from '../../src/indeksregulering/office';
import { photoErrorMessage, pickDocument, pickImage, pickImages, uploadImage } from '../../src/utils/media';
import { cvDocumentFile } from '../../src/employees/cvDocument';
import { projectSheetFile } from '../../src/employees/projectSheet';
import { CV_IMPORT_ACCEPT, applyImportedCv, readCvImport } from '../../src/employees/cvImport';
import { cvAttention } from '../../src/employees/cvReview';
import { countInlineCvImages, slimCvDocument, storeCvImages } from '../../src/employees/cvPictures';
import { PROJECT_IMPORT_ACCEPT, readProjectTable } from '../../src/employees/projectImport';
import { EMPLOYEE_IMPORT_ACCEPT, employeeImportMatchLabel } from '../../src/employees/import';
import { readEmployeeImport } from '../../src/imports/assist';
import { askImportInterpret } from '../../src/imports/interpretClient';
import { employeeReviewSeverity, importResult } from '../../src/imports/review';
import ImportReview, { ImportResult } from '../../components/ImportReview';
import CreateMenu from '../../components/CreateMenu';
import FilterMenu from '../../components/FilterMenu';
import {
  absorbCompanyIntoProfile,
  applyEmployeeClassification,
  applyProfessionalProfile,
  buildCv,
  canSeeSensitive,
  cardSubtitle,
  commitEmployee,
  contactLine,
  departmentLabels,
  directoryStats,
  displayName,
  employeeNumberLabel,
  emptyEmployee,
  filterEmployees,
  gapReport,
  hasPersonContent,
  initials,
  isDeletedEmployee,
  linkClash,
  newId,
  personnelKind,
  personnelKindLabel,
  presentEmployee,
  rememberLink,
  sortEmployees,
  statusLabel,
} from '../../src/employees/model';
import { PERSONNEL_KIND_OPTIONS, STATUS_OPTIONS } from '../../src/employees/schema';
import { cvEditorSections } from '../../src/employees/schema';
import {
  loadProfessionalProfile,
  removeEmployee,
  saveEmployee,
  saveProfessionalProfile,
  watchEmployees,
} from '../../src/employees/storage';
import EmployeeCvView from './EmployeeCvView';
import EmployeeDetailView from './EmployeeDetailView';
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


export default function EmployeesScreen() {
  const colors = useColors();
  const { familyId, family, members, uid, user, userProfile, isAdmin, requestShellTab } = useApp();
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
  const [kindFilter, setKindFilter] = useState('staff');
  const [statusFilter, setStatusFilter] = useState('active');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyKind, setBusyKind] = useState('');
  const [saveProgress, setSaveProgress] = useState(null);
  const [editSection, setEditSection] = useState('');
  const [editItemId, setEditItemId] = useState('');
  const [editToken, setEditToken] = useState(0);
  const [editExpanded, setEditExpanded] = useState(false);
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
    if (view !== 'edit' && view !== 'mine' && view !== 'detail') return undefined;
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
  const kindRows = useMemo(
    () => filterEmployees(rows, { kind: kindFilter, status: 'all', departments }),
    [rows, kindFilter, departments],
  );
  const visible = useMemo(
    () => filterEmployees(rows, { kind: kindFilter, status: statusFilter, query, departments }),
    [rows, kindFilter, statusFilter, query, departments],
  );
  const stats = directoryStats(kindRows);
  const kindOptions = useMemo(() => (
    PERSONNEL_KIND_OPTIONS.map((option) => ({
      id: option.value,
      label: personnelKindLabel(option.value, companyName),
    }))
  ), [companyName]);
  function resetMessage() {
    setNote('');
    setError('');
    setConfirmDelete(false);
  }

  function clearSectionEdit() {
    setEditSection('');
    setEditItemId('');
    setEditExpanded(false);
  }

  function beginSectionEdit(sectionId, itemId = '') {
    setEditSection(sectionId);
    setEditItemId(itemId);
    setEditToken((current) => current + 1);
    if (view === 'cv') return;
    if (Platform.OS === 'web') {
      setTimeout(() => {
        globalThis.document?.getElementById('employee-fields')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      }, 40);
    }
  }

  function focusAddedItem(itemId, sectionId = editSection) {
    if (!itemId) return;
    beginSectionEdit(sectionId || editSection, itemId);
  }

  async function downloadCvPdf() {
    if (busy) return;
    setError('');
    setBusy(true);
    setBusyKind('pdf');
    try {
      const employee = (draft && selectedId && draft.id === selectedId) ? draft : selected;
      const current = employee ? buildCv(employee, { companyName }) : null;
      if (!current) throw new Error('Ingen CV å eksportere.');
      const file = await cvDocumentFile(current, {
        logo: family?.company?.logo || null,
        photoUrl: current.photoUrl,
      });
      downloadBytes(file.filename, file.bytes, file.mime);
      setNote('CV-en er lastet ned som PDF med layout, logo og bilder.');
    } catch (err) {
      showError(err?.message || 'Kunne ikke lage PDF.');
    } finally {
      setBusy(false);
      setBusyKind('');
    }
  }

  function cvEditTitle() {
    if (editSection === 'projects' && editItemId) {
      const project = (draft?.cv?.projects || []).find((row) => row.id === editItemId);
      return project?.title ? `Rediger ${project.title}` : 'Rediger prosjekt';
    }
    const section = cvEditorSections('employee').find((row) => row.id === editSection);
    return section?.title ? `Rediger ${section.title}` : 'Rediger';
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
    setDraft(presentEmployee(row));
    setView('detail');
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
      if (bytes.length > 8_000_000) {
        setNote('Filen er stor. Sidene gjøres mindre før de leses. Hvis det feiler, komprimer PDF-en først.');
      }
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
      setNote(`CV-en er lest${understood}. Ingenting er lagret før du trykker Lagre CV.`);
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
      setError(photoErrorMessage(err));
    }
  }

  function canEditOwner(owner) {
    if (view === 'mine') return owner === 'person';
    if (owner === 'company') return !!isAdmin;
    return !!isAdmin || (!!draft?.personUid && draft.personUid === uid);
  }

  function changeDetail(next) {
    setDraft(presentEmployee(next));
    setError('');
  }

  async function classifyEmployee(patch) {
    if (!isAdmin || busy) return;
    const current = draft && draft.id === selectedId ? draft : selected;
    if (!current) return;
    const next = applyEmployeeClassification(current, patch);
    setDraft(next);
    const result = commitEmployee(next, { scope: 'company' });
    if (!result.ok) {
      showError(result.errors.join('\n'));
      return;
    }
    if (!familyId) {
      showError('Åpne selskapet før du lagrer en ansettelse.');
      return;
    }
    setBusy(true);
    try {
      const saved = await saveEmployee(familyId, result.employee);
      setRows((rowsNow) => sortEmployees([...rowsNow.filter((row) => row.id !== saved.id), saved]));
      setDraft(presentEmployee(saved));
      setSelectedId(saved.id);
      setNote('Tilknytningen er lagret.');
    } catch (err) {
      showError(err?.message || 'Kunne ikke lagre.');
    } finally {
      setBusy(false);
    }
  }

  function busyLabel(idle) {
    if (!busy) return idle;
    if (busyKind === 'cv') return 'Leser CV…';
    if (busyKind === 'projects') return 'Leser prosjekter…';
    if (busyKind === 'save') {
      if (saveProgress?.total) {
        return `Laster opp bilder ${saveProgress.done}/${saveProgress.total}…`;
      }
      return saveProgress?.label || 'Lagrer CV…';
    }
    return 'Jobber…';
  }

  async function save() {
    if (!draft || busy) return false;
    const scope = view === 'mine' ? 'profile' : 'company';
    const result = commitEmployee(draft, { scope });
    if (!result.ok) {
      showError(result.errors.join('\n'));
      return false;
    }
    if (scope === 'company' && !familyId) {
      showError('Åpne selskapet før du lagrer en ansettelse.');
      return false;
    }
    const clash = scope === 'company' ? linkClash(rows, result.employee) : null;
    if (clash) {
      showError(`${displayName(clash)} er allerede knyttet til denne personen.`);
      return false;
    }
    const pendingImages = countInlineCvImages(result.employee);
    setBusy(true);
    setBusyKind('save');
    setSaveProgress({
      done: 0,
      total: pendingImages,
      label: pendingImages ? `Laster opp 0 av ${pendingImages} bilder…` : 'Lagrer…',
    });
    setError('');
    setNote(pendingImages
      ? `Jobber med lagring. Laster opp ${pendingImages} bilder — dette kan ta litt tid.`
      : 'Lagrer…');
    try {
      let uploadLastError = '';
      const uploaded = await storeCvImages(
        result.employee,
        (path, dataUrl) => uploadImage(`families/${familyId || 'personal'}/${path}`, dataUrl),
        {
          onProgress: (info) => {
            if (info.lastError) uploadLastError = info.lastError;
            setSaveProgress(info);
            if (info.total) {
              setNote(`Jobber med lagring. ${info.label}`);
            }
          },
        },
      );
      const remaining = countInlineCvImages(uploaded);
      if (remaining > 0) {
        const detail = uploadLastError ? ` ${uploadLastError}` : '';
        showError(
          `Kunne ikke laste opp ${remaining} bilde${remaining === 1 ? '' : 'r'}.${detail} `
          + 'CV-en er ikke lagret, så du kan prøve igjen uten å miste teksten i utkastet.',
        );
        return false;
      }
      setSaveProgress({ done: pendingImages, total: pendingImages, label: 'Skriver CV…' });
      setNote('Bildene er lastet opp. Skriver CV…');
      const slim = slimCvDocument(uploaded);
      if (slim.dropped > 0) {
        showError(
          `${slim.dropped} bilde${slim.dropped === 1 ? '' : 'r'} ble for store til å lagres. `
          + 'CV-en er ikke lagret. Fjern noen bilder eller prøv igjen.',
        );
        return false;
      }
      const employee = slim.employee;
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
        setNote(linked
          ? 'Profilen er lagret og ansettelsen i selskapet er oppdatert.'
          : 'Profilen er lagret. Den følger deg, og kan knyttes til et selskap senere.');
        return true;
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
        setNote('CV-en er lagret med alle bilder.');
        return true;
      }
      setDraft(presentEmployee(saved));
      setView('detail');
      setNote('Medarbeideren er lagret.');
      return true;
    } catch (err) {
      showError(err?.message || 'Kunne ikke lagre.');
      return false;
    } finally {
      setBusy(false);
      setBusyKind('');
      setSaveProgress(null);
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
    const current = draft && draft.id === selectedId ? draft : selected;
    if (!current || busy) return;
    setBusy(true);
    try {
      if (isDeletedEmployee(current)) {
        await removeEmployee(familyId, current.id);
        setRows((list) => list.filter((row) => row.id !== current.id));
        setSelectedId('');
        setDraft(null);
        setView('list');
        setNote('Medarbeideren er slettet permanent.');
      } else {
        const next = applyEmployeeClassification(current, { status: 'deleted' });
        const committed = commitEmployee(next, { scope: 'company' });
        if (!committed.ok) {
          showError(committed.errors.join('\n'));
          return;
        }
        const saved = await saveEmployee(familyId, committed.employee);
        setRows((list) => sortEmployees([...list.filter((row) => row.id !== saved.id), saved]));
        setDraft(presentEmployee(saved));
        setSelectedId(saved.id);
        setNote('Medarbeideren er flyttet til papirkurven.');
        setView('list');
        setStatusFilter('deleted');
      }
    } catch (err) {
      setError(err?.message || 'Kunne ikke slette.');
    } finally {
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  async function restoreEmployee() {
    const current = draft && draft.id === selectedId ? draft : selected;
    if (!current || busy || !isDeletedEmployee(current)) return;
    await classifyEmployee({ status: 'active' });
    setStatusFilter('active');
    setNote('Medarbeideren er gjenopprettet som aktiv.');
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
  const detailEmployee = (view === 'detail' && draft && draft.id === selectedId) ? draft : selected;
  const gaps = (detailEmployee || selected) ? gapReport(detailEmployee || selected) : null;

  return (
    <ScrollView
      ref={scrollRef}
      nativeID="employees-page"
      id="employees-page"
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={[styles.inner, view === 'detail' && styles.innerWide]}
      keyboardShouldPersistTaps="handled"
    >
      {view !== 'list' && view !== 'detail' ? (
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          {view === 'mine' ? 'Min side' : view === 'import' ? 'Kontroller import' : view === 'cv' && selected ? `CV · ${displayName(selected)}` : (selected ? displayName(selected) : 'Ansatte')}
        </Text>
      ) : null}
      {view === 'list' ? (
        <CreateMenu
          label={isAdmin ? 'Ny medarbeider' : 'Min side'}
          title="Ny medarbeider"
          info={isAdmin ? 'Kontakt, utdanning og CV fyller den ansatte ut selv. Ansettelse, avdeling og tilgang fyller bedriften ut.' : ''}
          actions={isAdmin ? [
            { id: 'new', nativeID: 'employees-new', label: 'Registrer medarbeider', primary: true, onPress: openNew },
            { id: 'import', nativeID: 'employees-import', label: busy ? 'Tolker filen…' : 'Importer liste', onPress: openImport, disabled: busy },
            { id: 'mine', nativeID: 'employees-mine', label: 'Min side', onPress: openMine },
          ] : [
            { id: 'mine', nativeID: 'employees-mine', label: 'Min side', onPress: openMine },
          ]}
        />
      ) : null}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {!!error && <Text style={{ color: colors.danger || '#b42318' }}>{error}</Text>}
      {view === 'list' && importReport ? <ImportResult colors={colors} result={importReport} /> : null}

      {view === 'list' ? (
        <>
          <TextInput
            nativeID="employees-search"
            value={query}
            onChangeText={setQuery}
            placeholder="Søk"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
          />
          <FilterMenu
            groups={[
              {
                id: 'kind',
                label: 'Personell',
                value: kindFilter,
                onChange: setKindFilter,
                options: [
                  ...kindOptions,
                  { id: 'all', label: 'Alle kategorier' },
                ],
              },
              {
                id: 'status',
                label: 'Status',
                value: statusFilter,
                onChange: setStatusFilter,
                options: [
                  ...STATUS_OPTIONS.map((option) => ({
                    id: option.value,
                    label: option.value === 'deleted' ? 'Papirkurv' : option.label,
                  })),
                  { id: 'all', label: 'Alle statuser' },
                ],
              },
            ]}
          />
          <View style={[styles.stats, { backgroundColor: colors.card, borderColor: colors.line }]}>
            <Text style={{ color: colors.ink }}>
              {`${visible.length} vist · ${stats.total} ${kindFilter === 'all' ? 'medarbeidere' : personnelKindLabel(kindFilter, companyName).toLowerCase()}`}
            </Text>
            <Text style={{ color: colors.muted }}>
              {`Aktiv: ${stats.active} · Deaktivert: ${stats.inactive} · Permisjon: ${stats.leave} · Papirkurv: ${stats.deleted}`}
            </Text>
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
                {!!employeeNumberLabel(row) && (
                  <Text style={{ color: colors.muted }}>{employeeNumberLabel(row)}</Text>
                )}
                {!!contactLine(row) && <Text style={{ color: colors.muted }}>{contactLine(row)}</Text>}
                <Text style={{ color: colors.muted }}>{cardSubtitle(row, companyName)}</Text>
                <View style={styles.chips}>
                  {kindFilter === 'all' ? (
                    <Text style={[styles.dept, { color: colors.brand, backgroundColor: colors.brandSoft }]}>
                      {personnelKindLabel(personnelKind(row), companyName)}
                    </Text>
                  ) : null}
                  {statusFilter !== 'active' || row.company?.status !== 'active' ? (
                    <Text style={[styles.dept, { color: colors.brand, backgroundColor: colors.brandSoft }]}>
                      {row.company?.status === 'deleted' ? 'Papirkurv' : statusLabel(row.company?.status)}
                    </Text>
                  ) : null}
                  {departmentLabels(row, departments).map((name) => (
                    <Text key={name} style={[styles.dept, { color: colors.brand, backgroundColor: colors.brandSoft }]}>{name}</Text>
                  ))}
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </>
      ) : null}

      {view !== 'list' && view !== 'detail' ? (
        <View style={styles.row}>
          <TouchableOpacity onPress={openList} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
            <Text style={{ color: colors.ink }}>Til oversikten</Text>
          </TouchableOpacity>
          {view === 'cv' && selected ? (
            <TouchableOpacity onPress={() => openDetail(selected)} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink }}>Hovedside</Text>
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
            'E-post, personnummer og ansattnummer sjekkes mot de som allerede er registrert. Treff havner i «Finnes fra før» og oppdaterer den eksisterende medarbeideren. Rettigheter lagres på ansettelsen og endrer ikke hvem som er administrator i ProTop.',
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
              row.action === 'create' ? 'Ny' : row.action === 'update' ? (employeeImportMatchLabel(row.matchKind) || 'Oppdaterer eksisterende') : '',
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

      {view === 'detail' && detailEmployee ? (
        <EmployeeDetailView
          employee={detailEmployee}
          colors={colors}
          companyName={companyName}
          departments={departments}
          members={people}
          addressHits={addressHits}
          reveal={canSeeSensitive(detailEmployee, { uid, isAdmin })}
          gaps={gaps}
          canEdit={isAdmin || detailEmployee.personUid === uid}
          isAdmin={isAdmin}
          isSelf={detailEmployee.personUid === uid}
          siblings={visible}
          confirmDelete={confirmDelete}
          busy={busy}
          onBack={openList}
          onCv={() => openCv(detailEmployee)}
          onOpenProject={(project) => {
            if (!project?.id) return;
            requestShellTab?.('projects', null, { type: 'openProject', projectId: project.id });
          }}
          onSelect={openDetail}
          onChange={changeDetail}
          onSave={save}
          onClassify={classifyEmployee}
          onPhoto={choosePhoto}
          onPickAddress={pickAddress}
          onPushProfile={pushProfile}
          onPullToProfile={pullToProfile}
          onConfirmDelete={() => setConfirmDelete(true)}
          onCancelDelete={() => setConfirmDelete(false)}
          onDestroy={destroy}
          onRestore={restoreEmployee}
        />
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
            <Text style={styles.primaryText}>{busyLabel('Lagre')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {view === 'cv' && cv ? (
        <View nativeID="employee-cv-editor" style={styles.stack}>
          {canEditCv ? (
            <View style={styles.row}>
              <TouchableOpacity
                nativeID="employee-cv-save"
                onPress={save}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.primary, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={styles.primaryText}>{busyLabel('Lagre CV')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                nativeID="employee-cv-import"
                onPress={importCvFile}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.secondary, { borderColor: colors.line, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.ink }}>{busy && busyKind === 'cv' ? 'Leser CV…' : 'Importer CV'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                nativeID="employee-cv-export-pdf"
                onPress={downloadCvPdf}
                disabled={busy || !cv}
                accessibilityRole="button"
                accessibilityLabel="Eksporter CV som PDF"
                style={[styles.secondary, { borderColor: colors.line, opacity: busy || !cv ? 0.6 : 1 }]}
              >
                <Text style={{ color: colors.ink }}>Eksporter PDF</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {busy && (busyKind === 'save' || busyKind === 'cv' || busyKind === 'projects' || busyKind === 'pdf') ? (
            <View
              nativeID="employee-cv-progress"
              accessibilityLiveRegion="polite"
              style={[styles.progressBanner, { backgroundColor: colors.card, borderColor: colors.brand }]}
            >
              <ActivityIndicator color={colors.brand} />
              <View style={styles.grow}>
                <Text style={[styles.progressTitle, { color: colors.ink }]}>
                  {busyKind === 'cv' ? 'Leser CV…'
                    : busyKind === 'projects' ? 'Leser prosjekter…'
                      : busyKind === 'pdf' ? 'Lager PDF…'
                        : 'Lagrer CV…'}
                </Text>
                <Text style={{ color: colors.muted }}>
                  {saveProgress?.label
                    || (busyKind === 'save'
                      ? 'Jobber med bilder og lagring. Ikke lukk fanen.'
                      : 'Dette kan ta litt tid på store filer.')}
                </Text>
                {saveProgress?.total ? (
                  <View style={[styles.progressTrack, { backgroundColor: colors.line }]}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          backgroundColor: colors.brand,
                          width: `${Math.max(4, Math.round((saveProgress.done / Math.max(saveProgress.total, 1)) * 100))}%`,
                        },
                      ]}
                    />
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
          <CvAttention draft={cvEmployee} colors={colors} />
          <EmployeeCvView
            cv={cv}
            colors={colors}
            onEdit={canEditCv ? (sectionId) => beginSectionEdit(sectionId) : undefined}
            onEditProject={canEditCv ? (project) => beginSectionEdit('projects', project.id) : undefined}
          />
          <Modal
            visible={canEditCv && !!editSection}
            transparent
            animationType="fade"
            onRequestClose={clearSectionEdit}
          >
            <View style={styles.modalRoot}>
              <Pressable
                style={styles.modalBackdrop}
                onPress={clearSectionEdit}
                accessibilityRole="button"
                accessibilityLabel="Lukk redigering"
              />
              <View
                nativeID="employee-cv-section"
                accessibilityRole="dialog"
                style={[
                  styles.modalCard,
                  editExpanded && styles.modalCardExpanded,
                  { backgroundColor: colors.card, borderColor: colors.line },
                ]}
              >
                <View style={styles.modalHead}>
                  <Text style={[styles.modalTitle, { color: colors.ink, flex: 1 }]}>{cvEditTitle()}</Text>
                  <TouchableOpacity
                    onPress={() => setEditExpanded((on) => !on)}
                    accessibilityRole="button"
                    accessibilityLabel={editExpanded ? 'Mindre vindu' : 'Utvid vindu'}
                    style={[styles.secondary, { borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink }}>{editExpanded ? 'Mindre' : 'Utvid'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={clearSectionEdit}
                    accessibilityRole="button"
                    accessibilityLabel="Lagre og lukk"
                    style={[styles.primary, { backgroundColor: colors.brand }]}
                  >
                    <Text style={styles.primaryText}>Lagre</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={clearSectionEdit}
                    accessibilityRole="button"
                    accessibilityLabel="Lukk"
                    style={[styles.secondary, { borderColor: colors.line }]}
                  >
                    <Text style={{ color: colors.ink }}>Lukk</Text>
                  </TouchableOpacity>
                </View>
                {editSection === 'projects' && editItemId ? (
                  <View style={styles.row}>
                    <TouchableOpacity
                      onPress={() => downloadSheet((draft?.cv?.projects || []).find((row) => row.id === editItemId), 'pdf')}
                      accessibilityRole="button"
                      accessibilityLabel="Referanseark som PDF"
                      style={[styles.secondary, { borderColor: colors.line }]}
                    >
                      <Text style={{ color: colors.ink }}>PDF</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => downloadSheet((draft?.cv?.projects || []).find((row) => row.id === editItemId), 'docx')}
                      accessibilityRole="button"
                      accessibilityLabel="Referanseark som Word"
                      style={[styles.secondary, { borderColor: colors.line }]}
                    >
                      <Text style={{ color: colors.ink }}>Word</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <ScrollView
                  style={styles.modalScroll}
                  contentContainerStyle={styles.stack}
                  keyboardShouldPersistTaps="handled"
                >
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
                    hideItems={false}
                    onClose={clearSectionEdit}
                    onSave={clearSectionEdit}
                    onAddedItem={focusAddedItem}
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
                </ScrollView>
              </View>
            </View>
          </Modal>
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
          />
        </View>
      ) : null}
    </ScrollView>
  );
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

function summaryNote(labels) {
  const list = (Array.isArray(labels) ? labels : []).map((label) => String(label || '').trim()).filter(Boolean);
  if (!list.length) return '';
  if (list.length === 1) return `«${list[0]}» er en sumrad i filen, ikke en medarbeider, og tas ikke med.`;
  return `Sumrader tas ikke med: ${list.join(', ')}. De er ikke medarbeidere.`;
}

const styles = StyleSheet.create({
  inner: { padding: 16, paddingBottom: 48, gap: 12, maxWidth: 1080, width: '100%', alignSelf: 'flex-start' },
  innerWide: { maxWidth: 1220 },
  title: { fontSize: 28, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  stack: { gap: 12 },
  primary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  primaryText: { color: '#fff', fontWeight: '600' },
  secondary: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stats: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  person: { borderWidth: 1, borderRadius: 14, padding: 12, flexDirection: 'row', gap: 12 },
  avatar: { width: 56, height: 56, borderRadius: 10 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  personName: { fontSize: 16, fontWeight: '700' },
  grow: { flex: 1, gap: 2 },
  dept: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, fontSize: 12 },
  attention: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 6 },
  progressBanner: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  progressTitle: { fontSize: 16, fontWeight: '700' },
  progressTrack: { marginTop: 8, height: 6, borderRadius: 999, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 999 },
  sectionTitle: { fontSize: 17, fontWeight: '600' },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(26, 39, 68, 0.45)',
  },
  modalCard: {
    width: '100%',
    maxWidth: 720,
    maxHeight: Platform.OS === 'web' ? '88vh' : '90%',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    zIndex: 1,
    ...(Platform.OS === 'web' ? { boxShadow: '0 16px 40px rgba(15,23,42,0.18)' } : {}),
  },
  modalCardExpanded: {
    maxWidth: 1040,
    maxHeight: Platform.OS === 'web' ? '96vh' : '96%',
    minHeight: Platform.OS === 'web' ? '70vh' : undefined,
  },
  modalHead: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  modalTitle: { fontSize: 18, fontWeight: '700' },
  modalScroll: { flexGrow: 1, flexShrink: 1 },
});
