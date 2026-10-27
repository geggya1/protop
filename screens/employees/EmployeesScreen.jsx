import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useApp } from '../../src/context/AppContext';
import { employeeLevelIds, levelById, placedLevelId } from '../../src/access/companyAccess';
import {
  applyInviteSendResult,
  draftInviteEmployee,
  employeeContactEmail,
  employeeInviteState,
  inviteDeliveryError,
  inviteLevelFor,
  inviteOverview,
  inviteStatusLabel,
  matchEmployeeByEmail,
  placedAccessLevel,
  queueEmployeeInvite,
  unqueueEmployeeInvite,
} from '../../src/employees/invite';
import { inviteAdultSmart, resendAdultInvite } from '../../src/utils/groups';
import { recordUsage } from '../../src/employees/usageClient';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { showSaveToast } from '../../src/ui/saveToast';
import { isSuperAdmin } from '../../src/utils/groups';
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
import BrandBusyOverlay from '../../components/BrandBusyOverlay';
import ImportReview, { ImportResult } from '../../components/ImportReview';
import CreateMenu from '../../components/CreateMenu';
import EmployeeDirectory from '../../components/employees/EmployeeDirectory';
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
  displayName,
  employeeFromProfile,
  emptyEmployee,
  filterEmployees,
  gapReport,
  hasPersonContent,
  initials,
  isDeletedEmployee,
  linkClash,
  newId,
  ownEmployee,
  presentEmployee,
  rememberLink,
  resolveMineEmployeeId,
  sortEmployees,
} from '../../src/employees/model';

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
import EmployeePersonChrome from './EmployeePersonChrome';
import ArbeidScreen from '../arbeid/ArbeidScreen';
import EconomyHours from '../economy/EconomyHours';
import TimesaldoScreen from '../arbeid/TimesaldoScreen';
import { AbsenceOverviewScreen, MyOverviewScreen } from '../arbeid/AbsenceScreens';
import { ProjectExpensesScreen } from '../arbeid/OpsScreens';
import EmployeeWorkViews from './EmployeeWorkViews';
import EmployeeFields from './EmployeeFields';
import EmployeeInvitePanel from './EmployeeInvitePanel';
import RegisterEmployeeDialog from './RegisterEmployeeDialog';
import EmployeeUsagePanel from './EmployeeUsagePanel';
import EmployeeFilesView from './EmployeeFilesView';
import EmployeeHrSelfService from '../hr/EmployeeHrSelfService';
import { kinMissing } from '../../src/hr/kinReminder';
import { closeKinTask } from '../../src/hr/kinTasks';
import { FOCUS_FIELD_BG, FOCUS_FIELD_BORDER, FOCUS_FIELD_INK } from '../../src/forms/highlight';
import { emptyProjectState } from '../../src/project/engine';
import { loadProjectState } from '../../src/project/storage';
import {
  EMPLOYEE_DETAIL_TABS, EMPLOYEE_SETTINGS_SUBS, EMPLOYEE_SUB_TABS, PERSON_FILL_VIEWS, PERSON_VIEWS, employeeTabViews, employeeViewToTab,
} from '../../src/employees/personTabs.js';
import EmployeeEarningsSheet from '../../components/economy/EmployeeEarningsSheet';

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


// Views (ikke faner) andre ansatte kan se per nivå. Admin og personen selv ser alt.
const READER_PERSON_VIEWS = new Set(['detail']);
const EDITOR_PERSON_VIEWS = new Set(['detail', 'overview', 'hours', 'report', 'absence']);
// Egen profil med begrenset redigering: holde egen profil oppdatert. Inntjening og Innstillinger krever Admin.
const SELF_EDITOR_VIEWS = new Set(['detail', 'hours', 'report', 'saldo', 'absence', 'overview', 'files', 'expenses', 'cv']);

export default function EmployeesScreen() {
  const colors = useColors();
  const { familyId, family, members, uid, user, userProfile, requestShellTab, shellIntent, clearShellIntent } = useApp();
  const access = useCompanyAccess();
  // isAdmin = begrenset redigering (hovedsiden kan redigeres); employeesAdmin = Admin (alt annet).
  // Bare tilgangsstyringen gjelder. Administratorlisten på selskapet (adminUids) gir ikke Admin her;
  // eieren har full tilgang gjennom useCompanyAccess.
  const isAdmin = access.ready && access.canEdit('employees');
  const employeesAdmin = access.ready && access.canAdmin('employees');
  const canInvite = employeesAdmin;
  const canEditAccess = (isSuperAdmin(family, uid) && !access.previewLocks('accessControl'))
    || (access.ready && access.canAdmin('accessControl'));
  const accessLocked = canEditAccess ? [] : ['company.accessRole'];
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
  const [directoryReady, setDirectoryReady] = useState(false);
  const [profile, setProfile] = useState(null);
  const [projectState, setProjectState] = useState(() => emptyProjectState());
  const [view, setView] = useState('list');
  const [selectedId, setSelectedId] = useState('');
  const [draft, setDraft] = useState(null);
  const [focusSection, setFocusSection] = useState('');
  const [query, setQuery] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteProgress, setInviteProgress] = useState(null);
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
  const [registerOpen, setRegisterOpen] = useState(false);
  const pickedAddress = useRef('');
  const scrollRef = useRef(null);

  function showError(message) {
    setNote('');
    setError(message);
    scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  }

  function noteSaved(message) {
    setNote(message);
    showSaveToast(message);
  }

  useEffect(() => {
    if (!familyId) {
      setRows([]);
      setDirectoryReady(true);
      return undefined;
    }
    setDirectoryReady(false);
    const timer = setTimeout(() => setDirectoryReady(true), 12000);
    const stop = watchEmployees(familyId, (next, meta) => {
      setRows(next);
      if (meta?.source === 'remote' || (meta?.source === 'local' && next.length)) {
        clearTimeout(timer);
        setDirectoryReady(true);
      }
    }, (err) => {
      clearTimeout(timer);
      setDirectoryReady(true);
      setError(err?.message || 'Kunne ikke hente medarbeidere.');
    });
    return () => {
      clearTimeout(timer);
      stop();
    };
  }, [familyId]);

  useEffect(() => {
    if (!familyId) {
      setProjectState(emptyProjectState());
      return undefined;
    }
    let live = true;
    // Del samme MEMORY-cache som Arbeid/Prosjekt, så timer ført der syns her.
    loadProjectState(familyId).then((loaded) => {
      if (live) setProjectState(loaded || emptyProjectState());
    }).catch(() => {
      if (live) setProjectState(emptyProjectState());
    });
    return () => { live = false; };
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
  // Andre ansatte: Lese ser bare hovedsiden, begrenset redigering ser også
  // Oversikt, Timer og Fraværsoversikt (uten å endre). Resten krever Admin.
  // «Vis som»: den valgte ansatte er «meg», også når profilen ikke er knyttet til en bruker.
  function isSelfRow(row) {
    if (!row) return false;
    if (access.previewing && access.viewingAs) return row.id === access.viewingAs.id;
    return !!row.personUid && row.personUid === uid;
  }
  const limitedPerson = !!selected && !isAdmin && !isSelfRow(selected);
  const readOnlyPerson = !!selected && !employeesAdmin && !isSelfRow(selected);
  // Egen profil følger «Egen profil» i tilgangsstyringen: Lese, begrenset redigering eller Admin.
  const ownLevel = employeesAdmin || (access.ready && access.canAdmin('ownProfile'))
    ? 'admin'
    : (access.ready && access.canEdit('ownProfile') ? 'editor' : 'reader');
  const selfSelected = isSelfRow(selected);
  // Full tilgang til personens sider: Admin på ansatte, eller Admin på egen profil.
  const fullPersonAccess = employeesAdmin || (selfSelected && ownLevel === 'admin');
  const selfEditor = selfSelected && ownLevel === 'editor';
  function personTabsAllowed(row) {
    if (employeesAdmin) return null;
    if (isSelfRow(row)) {
      if (ownLevel === 'admin') return null;
      return ownLevel === 'editor' ? SELF_EDITOR_VIEWS : READER_PERSON_VIEWS;
    }
    return isAdmin ? EDITOR_PERSON_VIEWS : READER_PERSON_VIEWS;
  }
  function personViewAllowed(row, nextView) {
    if (!PERSON_VIEWS.has(nextView)) return true;
    if (nextView === 'earnings' && !access.canView('economyEarnings') && !access.canView('economy')) return false;
    const allowed = personTabsAllowed(row);
    return !allowed || allowed.has(nextView);
  }
  function allowedTabViews(row, tabId) {
    return employeeTabViews(tabId).filter((id) => personViewAllowed(row, id));
  }
  useEffect(() => {
    if (selected && PERSON_VIEWS.has(view) && !personViewAllowed(selected, view)) setView('detail');
  }, [selected, view, isAdmin, employeesAdmin, ownLevel, uid]);
  const mine = useMemo(() => ownEmployee(rows, {
    uid,
    emails: [
      user?.email,
      userProfile?.email,
      profile?.person?.email,
    ],
    name: userProfile?.displayName || user?.displayName || '',
  }), [rows, uid, user, userProfile, profile]);
  const linked = mine?.personUid === uid ? mine : (rows.find((row) => row.personUid && row.personUid === uid) || null);
  const mineHrEmployeeId = useMemo(
    () => resolveMineEmployeeId({ linked, mine, profile, familyId }),
    [linked, mine, profile, familyId],
  );
  const inviteCounts = useMemo(() => inviteOverview(rows), [rows]);
  const visible = useMemo(
    () => filterEmployees(rows, {
      status: 'all',
      query,
      departments,
      keepIds: mine?.id ? [mine.id] : [],
    }),
    [rows, query, departments, mine?.id],
  );
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
      if (file.wanted && file.got === 0) {
        setNote('CV-en er lastet ned, men ingen profil-/prosjektbilder kom med. Prøv på nytt, eller lagre CV først.');
      } else if (file.wanted && file.got < file.wanted) {
        setNote(`CV-en er lastet ned som PDF. ${file.got} av ${file.wanted} bilder kom med (profil/prosjekt).`);
      } else if (file.got) {
        setNote(`CV-en er lastet ned som PDF med ${file.got} bilde${file.got === 1 ? '' : 'r'}.`);
      } else {
        setNote('CV-en er lastet ned som PDF.');
      }
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
    if (!employeesAdmin || busy) return;
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

  function openInvite() {
    resetMessage();
    clearSectionEdit();
    setView('invite');
  }

  async function rememberInvite(next) {
    const committed = commitEmployee(next, { scope: 'company' });
    if (!committed.ok) {
      showError(committed.errors.join('\n'));
      return null;
    }
    const saved = await saveEmployee(familyId, committed.employee);
    setRows((current) => sortEmployees([...current.filter((row) => row.id !== saved.id), saved]));
    // Detaljsiden viser redigeringskopien. Uten invitasjonen her viser den gammel status,
    // og en senere lagring av kopien skriver over invitasjonen.
    setDraft((current) => (current?.id === saved.id ? withInviteFields(current, saved) : current));
    return saved;
  }

  async function addInvitePerson(draft) {
    if (!canInvite || busy || !familyId) return;
    setBusy(true);
    setError('');
    try {
      const existing = matchEmployeeByEmail(rows, draft.email);
      const base = existing || draftInviteEmployee({ ...draft, at: new Date().toISOString() });
      const accessLevel = existing && !canEditAccess
        ? (placedAccessLevel(existing) || draft.accessLevel)
        : draft.accessLevel;
      const queued = queueEmployeeInvite({
        ...base,
        person: {
          ...(base.person || {}),
          firstName: base.person?.firstName || draft.firstName,
          lastName: base.person?.lastName || draft.lastName,
          email: draft.email,
        },
      }, { accessLevel, at: new Date().toISOString() });
      if (!queued.ok) {
        showError(queued.error);
        return;
      }
      const saved = await rememberInvite(queued.employee);
      if (saved) noteSaved(`${displayName(saved)} er lagt klar. E-post sendes når du trykker Inviter.`);
    } catch (err) {
      showError(err?.message || 'Kunne ikke legge til personen.');
    } finally {
      setBusy(false);
    }
  }

  async function removeInvitePerson(employee) {
    if (!canInvite || busy) return;
    const removed = unqueueEmployeeInvite(employee);
    if (!removed.ok) {
      showError(removed.error);
      return;
    }
    setBusy(true);
    try {
      const saved = await rememberInvite(removed.employee);
      if (saved) noteSaved(`${displayName(saved)} er tatt ut av invitasjonskøen.`);
    } catch (err) {
      showError(err?.message || 'Kunne ikke ta personen ut.');
    } finally {
      setBusy(false);
    }
  }

  async function deliverInvites(ids, { known = [] } = {}) {
    const employeeIds = (ids || []).filter(Boolean);
    if (!canInvite || busy || !familyId) return;
    if (!employeeIds.length) {
      showError('Ingen personer er klare til invitasjon.');
      return;
    }
    setBusy(true);
    setError('');
    const sent = [];
    const failed = [];
    const at = new Date().toISOString();
    const many = employeeIds.length > 1;
    try {
      for (const [index, id] of employeeIds.entries()) {
        if (many) setInviteProgress({ done: index, total: employeeIds.length });
        const row = known.find((item) => item.id === id) || rows.find((item) => item.id === id);
        if (!row) {
          failed.push('Fant ikke medarbeideren.');
          continue;
        }
        let current = row;
        const who = displayName(row) || employeeContactEmail(row);
        if (current.invite?.status !== 'queued' && current.invite?.status !== 'sent') {
          // Bruker det som står på personen (navn, e-post, tilgang fra import). Uten tilgang: Ansatt.
          const queued = queueEmployeeInvite(current, { at, accessLevel: inviteLevelFor(current) });
          if (!queued.ok) {
            failed.push(many ? `${who}: ${queued.error}` : queued.error);
            continue;
          }
          const saved = await rememberInvite(queued.employee);
          if (!saved) {
            failed.push(`${who}: kunne ikke lagre personen.`);
            continue;
          }
          current = saved;
        }
        const email = employeeContactEmail(current);
        const name = displayName(current);
        try {
          const result = current.invite?.parentKey
            ? await resendAdultInvite({
              familyId,
              parentId: current.invite.parentKey,
              familyName: companyName,
              groupType: family?.type || 'organization',
            })
            : await inviteAdultSmart({
              familyId,
              name,
              email,
              familyName: companyName,
              groupType: family?.type || 'organization',
              createdBy: uid,
              asAdmin: placedAccessLevel(current) === 'administrator',
            });
          const next = applyInviteSendResult(current, result, { at });
          await rememberInvite(next);
          if (result?.emailSent) {
            sent.push(id);
            recordUsage({
              type: 'invite_sent',
              companyId: familyId,
              employeeId: id,
              summary: `Invitasjon sendt til ${email}`,
              detail: { accessLevel: placedAccessLevel(current) },
            }).catch(() => {});
          } else {
            failed.push(result?.emailError || `${name || email}: e-post ble ikke sendt.`);
          }
        } catch (err) {
          failed.push(many ? `${who}: ${inviteDeliveryError(err)}` : inviteDeliveryError(err));
        }
      }
      if (failed.length) setError(failed.filter(Boolean).join('\n'));
      else setError('');
      if (sent.length) {
        noteSaved(sent.length === 1
          ? 'Invitasjonen er sendt.'
          : `${sent.length} invitasjoner er sendt.`);
      }
    } catch (err) {
      showError(err?.message || 'Kunne ikke sende invitasjonen.');
    } finally {
      setInviteProgress(null);
      setBusy(false);
    }
  }

  async function inviteEmployee(employee) {
    if (!employee || !canInvite) return;
    let current = employee;
    if (current.invite?.status !== 'queued' && current.invite?.status !== 'sent') {
      const queued = queueEmployeeInvite(current, {
        at: new Date().toISOString(),
        accessLevel: inviteLevelFor(current),
      });
      if (!queued.ok) {
        showError(queued.error);
        return;
      }
      setBusy(true);
      try {
        const saved = await rememberInvite(queued.employee);
        if (!saved) return;
        current = saved;
      } catch (err) {
        showError(err?.message || 'Kunne ikke legge personen klar.');
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    await deliverInvites([current.id], { known: [current] });
  }

  function openNew() {
    resetMessage();
    clearSectionEdit();
    setSelectedId('');
    setRegisterOpen(true);
  }

  async function registerEmployee(result) {
    if (!canInvite || !familyId) throw new Error('Du kan ikke registrere medarbeidere.');
    const address = employeeContactEmail(result.employee);
    const existing = matchEmployeeByEmail(rows, address);
    if (existing) {
      setRegisterOpen(false);
      openDetail(existing);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const committed = commitEmployee({
        ...result.employee,
        id: newId('emp'),
        createdAt: new Date().toISOString(),
      }, { scope: 'company' });
      if (!committed.ok) throw new Error(committed.errors.join('\n'));
      let saved = await saveEmployee(familyId, committed.employee);
      setRows((current) => sortEmployees([...current.filter((row) => row.id !== saved.id), saved]));
      const name = displayName(saved);
      let noteText = `${name} er registrert.`;
      if (result.sendWelcome) {
        try {
          const sent = await inviteAdultSmart({
            familyId,
            name,
            email: address,
            familyName: companyName,
            groupType: family?.type || 'organization',
            createdBy: uid,
            asAdmin: placedAccessLevel(saved) === 'administrator',
          });
          const next = applyInviteSendResult(saved, sent, { at: new Date().toISOString() });
          const stored = commitEmployee(next, { scope: 'company' });
          if (stored.ok) {
            saved = await saveEmployee(familyId, stored.employee);
            setRows((current) => sortEmployees([...current.filter((row) => row.id !== saved.id), saved]));
          }
          if (sent?.emailSent) {
            noteText = `${name} er registrert, og velkomstmalen er sendt.`;
            recordUsage({
              type: 'invite_sent',
              companyId: familyId,
              employeeId: saved.id,
              summary: `Invitasjon sendt til ${address}`,
              detail: { accessLevel: placedAccessLevel(saved) },
            }).catch(() => {});
          } else {
            setError(sent?.emailError || 'Velkomstmalen ble ikke sendt.');
          }
        } catch (err) {
          setError(inviteDeliveryError(err));
        }
      }
      noteSaved(noteText);
      setRegisterOpen(false);
      const section = levelById(placedAccessLevel(saved))?.section || '';
      if (section) setFocusSection(section);
    } finally {
      setBusy(false);
    }
  }

  function openDetail(row) {
    resetMessage();
    clearSectionEdit();
    setSelectedId(row.id);
    setDraft(presentEmployee(row));
    setView('detail');
  }

  const pendingEmployeeId = useRef('');
  const pendingEmployeeView = useRef('detail');
  const pendingMyAbsence = useRef(false);
  const pendingMine = useRef(false);
  useEffect(() => {
    if (!shellIntent || typeof shellIntent !== 'object') return;
    if (shellIntent.type === 'openEmployee') {
      pendingEmployeeId.current = String(shellIntent.employeeId || '');
      pendingEmployeeView.current = shellIntent.view === 'absence' ? 'absence' : 'detail';
      clearShellIntent?.();
      return;
    }
    if (shellIntent.type === 'openMyAbsence') {
      pendingMyAbsence.current = true;
      clearShellIntent?.();
      return;
    }
    // Varsel om ny versjon av et dokument: Min side, der dokumentene leses og bekreftes.
    if (shellIntent.type === 'myDocuments') {
      pendingMine.current = true;
      clearShellIntent?.();
    }
  }, [shellIntent, clearShellIntent]);
  useEffect(() => {
    const id = pendingEmployeeId.current;
    if (!id) return;
    const row = rows.find((item) => item.id === id);
    if (!row) return;
    pendingEmployeeId.current = '';
    const nextView = pendingEmployeeView.current;
    pendingEmployeeView.current = 'detail';
    if (nextView === 'absence') openWork(row, 'absence');
    else openDetail(row);
  }, [rows]);

  function openCv(row) {
    resetMessage();
    clearSectionEdit();
    setSelectedId(row.id);
    setDraft(presentEmployee(row));
    setView(personViewAllowed(row, 'cv') ? 'cv' : 'detail');
  }

  function openHours(row) {
    resetMessage();
    clearSectionEdit();
    setSelectedId(row.id);
    setDraft(presentEmployee(row));
    setView(personViewAllowed(row, 'hours') ? 'hours' : 'detail');
  }

  function openWork(row, nextView) {
    resetMessage();
    clearSectionEdit();
    setSelectedId(row.id);
    setDraft(presentEmployee(row));
    setView(personViewAllowed(row, nextView) ? nextView : 'detail');
  }

  /** Bytt person uten å miste aktiv fane (rød tråd). */
  function openSibling(row) {
    if (!row) return;
    resetMessage();
    clearSectionEdit();
    setSelectedId(row.id);
    setDraft(presentEmployee(row));
    if (!PERSON_VIEWS.has(view) || !personViewAllowed(row, view)) setView('detail');
  }

  function openPersonView(nextView) {
    if (!selected || !personViewAllowed(selected, nextView)) return;
    if (nextView === 'detail') {
      openDetail(selected);
      return;
    }
    if (nextView === 'hours') {
      openHours(selected);
      return;
    }
    if (nextView === 'cv') {
      openCv(selected);
      return;
    }
    openWork(selected, nextView);
  }

  function openPersonTab(tabId) {
    if (!selected) return;
    const [first] = allowedTabViews(selected, tabId);
    if (first) openPersonView(first);
  }

  useEffect(() => {
    if (!pendingMyAbsence.current) return;
    const person = linked || mine;
    if (person) {
      pendingMyAbsence.current = false;
      openWork(person, 'absence');
      return;
    }
    if (!directoryReady) return;
    pendingMyAbsence.current = false;
    requestShellTab?.('arbeid', 'fravaer');
  }, [rows, directoryReady, linked, mine, requestShellTab]);

  useEffect(() => {
    if (!pendingMine.current || (!directoryReady && !linked && !mine)) return;
    pendingMine.current = false;
    openMine();
  }, [rows, directoryReady, linked, mine]); // eslint-disable-line react-hooks/exhaustive-deps

  async function saveWork(employee) {
    const saved = await saveEmployee(familyId, employee);
    setRows((current) => sortEmployees([...current.filter((row) => row.id !== saved.id), saved]));
    setSelectedId(saved.id);
    setDraft(presentEmployee(saved));
    noteSaved('Innstillingene er lagret.');
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

  async function restoreMine() {
    if (!uid || !familyId || busy) return;
    if (mine) {
      setQuery('');
      if (!mine.personUid && uid) {
        setBusy(true);
        try {
          const saved = await saveEmployee(familyId, { ...mine, personUid: uid });
          setRows((current) => sortEmployees([...current.filter((row) => row.id !== saved.id), saved]));
          openDetail(saved);
        } catch (err) {
          showError(err?.message || 'Kunne ikke knytte profilen til deg.');
        } finally {
          setBusy(false);
        }
        return;
      }
      openDetail(mine);
      return;
    }
    const hint = userProfile?.displayName || user?.displayName || '';
    const link = (profile?.links || []).find((row) => row.companyId === familyId);
    const draft = employeeFromProfile(profile, {
      id: link?.employeeId || '',
      uid,
      displayNameHint: hint,
      accessLevel: isSuperAdmin(family, uid) ? 'administrator' : 'ansatt',
    });
    const result = commitEmployee(draft, { scope: 'company' });
    if (!result.ok) {
      showError(result.errors.join('\n'));
      return;
    }
    setBusy(true);
    try {
      const saved = await saveEmployee(familyId, result.employee);
      setRows((current) => sortEmployees([...current.filter((row) => row.id !== saved.id), saved]));
      const stored = await saveProfessionalProfile(uid, rememberLink({
        ...(profile || {}),
        person: saved.person,
        cv: saved.cv,
        customFields: saved.customFields.filter((field) => field.owner === 'person'),
      }, { companyId: familyId, employeeId: saved.id, companyName }));
      setProfile(stored);
      setQuery('');
      setSelectedId(saved.id);
      setDraft(presentEmployee(saved));
      setView('detail');
      noteSaved('Profilen din er lagt tilbake i ansatte-listen.');
    } catch (err) {
      showError(err?.message || 'Kunne ikke gjenopprette profilen.');
    } finally {
      setBusy(false);
    }
  }

  function openMine() {
    resetMessage();
    clearSectionEdit();
    const base = profile || { person: {}, cv: {}, customFields: [] };
    const seed = !hasPersonContent(base) && linked ? absorbCompanyIntoProfile(base, linked) : base;
    const employeeId = resolveMineEmployeeId({ linked, mine, profile, familyId });
    setDraft(presentEmployee({
      ...emptyEmployee(employeeId),
      personUid: uid || linked?.personUid || '',
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
    return !!isAdmin || isSelfRow(draft);
  }

  function changeDetail(next) {
    setDraft(presentEmployee(next));
    setError('');
  }

  async function classifyEmployee(patch) {
    const levelSet = Object.prototype.hasOwnProperty.call(patch, 'accessLevels');
    const accessChange = levelSet || Object.prototype.hasOwnProperty.call(patch, 'accessLevel');
    if (busy) return;
    if (accessChange ? !canEditAccess : !isAdmin) return;
    const current = draft && draft.id === selectedId ? draft : selected;
    if (!current) return;
    const next = levelSet
      ? {
        ...current,
        company: {
          ...(current.company || {}),
          accessLevels: patch.accessLevels,
          accessLevel: '',
          accessRole: '',
        },
      }
      : applyEmployeeClassification(current, patch);
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
      const levelNames = employeeLevelIds(saved).map((id) => levelById(id)?.label).filter(Boolean);
      noteSaved(levelSet
        ? (levelNames.length ? `${displayName(saved)} har ${levelNames.join(', ')}.` : `${displayName(saved)} har ingen tilgangsnivå.`)
        : (accessChange
          ? `${displayName(current)} er nå ${levelById(patch.accessLevel)?.label || 'oppdatert'}.`
          : 'Tilknytningen er lagret.'));
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
          // Pårørende er lagt inn: oppgaven «Legg inn pårørende» lukkes.
          if (!kinMissing(stored)) closeKinTask(familyId, updated.id, { uid, name: displayName(stored) });
        }
        setDraft(presentEmployee({
          ...emptyEmployee(),
          person: stored.person,
          cv: stored.cv,
          customFields: stored.customFields,
        }));
        noteSaved(linked
          ? 'Profilen er lagret og ansettelsen i selskapet er oppdatert.'
          : 'Profilen er lagret. Den følger deg, og kan knyttes til et selskap senere.');
        return true;
      }
      const saved = await saveEmployee(familyId, employee);
      setRows((current) => sortEmployees([...current.filter((row) => row.id !== saved.id), saved]));
      if (!kinMissing(saved)) closeKinTask(familyId, saved.id, { uid });
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
        noteSaved('CV-en er lagret med alle bilder.');
        return true;
      }
      setDraft(presentEmployee(saved));
      setView('detail');
      noteSaved('Medarbeideren er lagret.');
      recordUsage({
        type: 'change',
        companyId: familyId,
        employeeId: saved.id,
        summary: 'Oppdaterte medarbeider',
      }).catch(() => {});
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
      noteSaved('Ansettelsen bruker nå opplysningene fra profilen din.');
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
      noteSaved('Tomme felter på profilen din er fylt fra denne ansettelsen.');
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
        noteSaved('Medarbeideren er slettet permanent.');
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
        noteSaved('Medarbeideren er flyttet til papirkurven.');
        setView('list');
        setFocusSection('trash');
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
    setFocusSection(placedLevelId(current) && levelById(placedLevelId(current))?.section === 'external' ? 'external' : 'company');
    noteSaved('Medarbeideren er gjenopprettet som aktiv.');
  }

  const cvEmployee = view === 'cv' && draft && draft.id === selectedId ? draft : selected;
  const cv = cvEmployee ? buildCv(cvEmployee, { companyName }) : null;
  const canEditCv = view === 'cv' && !!draft && (isAdmin || isSelfRow(selected));
  const mineCv = draft && view === 'mine' ? buildCv({
    ...draft,
    company: {
      ...draft.company,
      title: draft.company?.title || linked?.company?.title || '',
    },
  }, { companyName }) : null;
  const detailEmployee = (view === 'detail' && draft && draft.id === selectedId) ? draft : selected;
  const gaps = (detailEmployee || selected) ? gapReport(detailEmployee || selected) : null;

  const showBusyOverlay = busy && (
    busyKind === 'save'
    || busyKind === 'cv'
    || busyKind === 'projects'
    || busyKind === 'pdf'
    || view === 'import'
    || !busyKind
  );

  const personMode = PERSON_VIEWS.has(view) && !!selected;
  const personFills = personMode && PERSON_FILL_VIEWS.has(view);
  const personEmployee = (view === 'detail' || view === 'settings' || view === 'cv') && draft && draft.id === selectedId
    ? draft
    : selected;

  useEffect(() => {
    if (!personMode || personFills) return;
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [view, selectedId, personMode, personFills]);

  return (
    <>
    <View nativeID="employees-page" id="employees-page" style={[styles.screen, { backgroundColor: colors.bg }]}>
    {personMode ? (
      <View style={[styles.personChrome, { backgroundColor: colors.bg, borderBottomColor: colors.line }]}>
        <EmployeePersonChrome
          employee={personEmployee}
          colors={colors}
          companyName={companyName}
          siblings={visible}
          tabs={EMPLOYEE_DETAIL_TABS.filter((tab) => allowedTabViews(selected, tab.id).length > 0)}
          activeTab={employeeViewToTab(view)}
          onBack={openList}
          onTab={openPersonTab}
          onSelect={openSibling}
        >
          {(() => {
            const subs = (EMPLOYEE_SUB_TABS[employeeViewToTab(view)] || [])
              .filter((sub) => personViewAllowed(selected, sub.id));
            if (subs.length < 2) return null;
            return (
              <View nativeID="employee-sub-tabs" accessibilityRole="tablist" style={styles.subTabs}>
                {subs.map((sub) => {
                  const active = sub.id === view;
                  return (
                    <TouchableOpacity
                      key={sub.id}
                      nativeID={`employee-subtab-${sub.id}`}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: active }}
                      onPress={() => openPersonView(sub.id)}
                      style={[styles.subTab, {
                        borderColor: active ? colors.brand : colors.line,
                        backgroundColor: active ? colors.brandSoft : colors.card,
                      }]}
                    >
                      <Text style={{ color: active ? colors.brand : colors.ink, fontSize: 13 }}>{sub.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })()}
        </EmployeePersonChrome>
      </View>
    ) : null}
    {personFills ? (
      <View style={styles.personFill}>
        {view === 'hours' ? (
          <View style={styles.hoursHost} nativeID="employee-hours-view">
            <ArbeidScreen
              lockedEmployeeId={selected.id}
              embedded
              readOnly={readOnlyPerson}
              hideReportTools={!fullPersonAccess}
              memberProjectsOnly={!fullPersonAccess}
            />
          </View>
        ) : null}
        {view === 'report' ? (
          <View style={styles.hoursHost} nativeID="employee-report-view">
            <EconomyHours
              lockedEmployeeId={selected.id}
              hideBillable={!fullPersonAccess}
              embedded
              rights={fullPersonAccess ? 'admin' : selfEditor ? 'edit' : 'read'}
            />
          </View>
        ) : null}
        {view === 'absence' ? (
          <ScrollView
            nativeID="employee-absence-view"
            style={styles.absenceHost}
            contentContainerStyle={styles.absenceInner}
            keyboardShouldPersistTaps="handled"
          >
            <AbsenceOverviewScreen
              lockedEmployeeId={selected.id}
              readOnly={readOnlyPerson}
              embedded
              onBack={() => openDetail(selected)}
            />
          </ScrollView>
        ) : null}
        {view === 'saldo' ? (
          <View nativeID="employee-saldo-view" style={styles.personFill}>
            <TimesaldoScreen
              lockedEmployeeId={selected.id}
              embedded
              rights={fullPersonAccess ? 'admin' : selfEditor ? 'edit' : 'read'}
            />
          </View>
        ) : null}
        {view === 'expenses' ? (
          <View nativeID="employee-expenses-view" style={styles.personFill}>
            <ProjectExpensesScreen lockedEmployeeId={selected.id} embedded canImport={fullPersonAccess} />
          </View>
        ) : null}
      </View>
    ) : (
    <ScrollView
      ref={scrollRef}
      style={styles.screenScroll}
      contentContainerStyle={[
        styles.inner,
        personMode && styles.innerWide,
        (view === 'hours' || view === 'report') && styles.innerHours,
        view === 'absence' && styles.innerAbsence,
      ]}
      keyboardShouldPersistTaps="handled"
    >
      {view !== 'list' && !PERSON_VIEWS.has(view) ? (
        <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
          {view === 'mine' ? 'Min side'
            : view === 'import' ? 'Kontroller import'
              : view === 'invite' ? 'Inviter brukere'
                : (selected ? displayName(selected) : 'Ansatte')}
        </Text>
      ) : null}
      {view === 'list' ? (
        <CreateMenu
          label={isAdmin ? 'Ny medarbeider' : 'Min side'}
          title="Ny medarbeider"
          info={isAdmin ? 'Første registrering samler navn, kontakt og tilgang. Personen får en lenke for å sette passord.' : ''}
          actions={isAdmin ? [
            { id: 'new', nativeID: 'employees-new', label: 'Registrer medarbeider', primary: true, onPress: openNew },
            { id: 'invite', nativeID: 'employees-invite', label: 'Inviter brukere', onPress: openInvite },
            ...(employeesAdmin ? [{ id: 'import', nativeID: 'employees-import', label: busy ? 'Tolker filen…' : 'Importer liste', onPress: openImport, disabled: busy }] : []),
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
          {!mine ? (
            <View style={[styles.stats, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Profilen din ligger ikke i listen</Text>
              <Text style={{ color: colors.muted }}>
                Ansettelsen kan ha blitt flyttet til en annen kategori, eller den mangler i selskapet. Gjenopprett den her uten å miste Min side.
              </Text>
              <TouchableOpacity
                nativeID="employees-restore-mine"
                onPress={restoreMine}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.primary, { backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={styles.primaryText}>{busy ? 'Gjenoppretter…' : 'Gjenopprett min profil'}</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {canInvite && inviteCounts.none + inviteCounts.missingEmail > 0 ? (
            <View nativeID="employees-invite-overview" style={[styles.stats, { backgroundColor: colors.card, borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>
                {inviteCounts.none + inviteCounts.missingEmail === 1
                  ? '1 person er ikke invitert'
                  : `${inviteCounts.none + inviteCounts.missingEmail} personer er ikke invitert`}
              </Text>
              <Text style={{ color: colors.muted }}>
                {[
                  'De ligger i listen, men har ikke fått invitasjon. Du velger selv hvem som skal inviteres og når.',
                  inviteCounts.missingEmail ? `${inviteCounts.missingEmail} mangler e-post.` : '',
                  inviteCounts.sent ? `${inviteCounts.sent} venter på svar.` : '',
                ].filter(Boolean).join(' ')}
              </Text>
              <TouchableOpacity
                nativeID="employees-invite-open"
                onPress={openInvite}
                disabled={busy}
                accessibilityRole="button"
                style={[styles.primary, { marginTop: 6, backgroundColor: colors.brand, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={styles.primaryText}>Velg hvem som skal inviteres</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {!rows.length ? (
            <Text style={{ color: colors.muted }}>Ingen medarbeidere er registrert ennå.</Text>
          ) : (
            <EmployeeDirectory
              rows={visible}
              companyName={companyName}
              colors={colors}
              focusSection={focusSection}
              renderIdentity={(row) => (
                <TouchableOpacity
                  onPress={() => openDetail(row)}
                  nativeID={`employee-open-${row.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={displayName(row)}
                  style={styles.identity}
                >
                  {row.person.photoUrl ? (
                    <Image source={{ uri: row.person.photoUrl }} style={styles.avatarSmall} />
                  ) : (
                    <View style={[styles.avatarSmall, styles.avatarFallback, { backgroundColor: colors.sunken }]}>
                      <Text style={{ color: colors.ink, fontWeight: '400', fontSize: 12 }}>{initials(row)}</Text>
                    </View>
                  )}
                  <View style={styles.grow}>
                    <Text style={[styles.personName, { color: colors.ink }]}>{displayName(row)}</Text>
                    {!!contactLine(row) && <Text style={[styles.personMeta, { color: colors.muted }]}>{contactLine(row)}</Text>}
                    <Text style={[styles.personMeta, { color: colors.muted }]}>{cardSubtitle(row, companyName)}</Text>
                    <View style={styles.chips}>
                      {mine?.id === row.id ? (
                        <Text style={[styles.dept, { color: colors.brand, backgroundColor: colors.brandSoft }]}>Din profil</Text>
                      ) : null}
                      {canInvite ? <InviteChip employee={row} colors={colors} /> : null}
                      {departmentLabels(row, departments).map((name) => (
                        <Text key={name} style={[styles.dept, { color: colors.brand, backgroundColor: colors.brandSoft }]}>{name}</Text>
                      ))}
                    </View>
                  </View>
                </TouchableOpacity>
              )}
              renderPerson={(row) => (
                <TouchableOpacity
                  key={row.id}
                  onPress={() => openDetail(row)}
                  accessibilityRole="button"
                  accessibilityLabel={displayName(row)}
                  style={[styles.person, { borderColor: colors.line, backgroundColor: colors.bg }]}
                >
                  <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.sunken }]}>
                    <Text style={{ color: colors.ink, fontWeight: '400', fontSize: 13 }}>{initials(row)}</Text>
                  </View>
                  <View style={styles.grow}>
                    <Text style={[styles.personName, { color: colors.ink }]}>{displayName(row)}</Text>
                    {!!contactLine(row) && <Text style={[styles.personMeta, { color: colors.muted }]}>{contactLine(row)}</Text>}
                  </View>
                </TouchableOpacity>
              )}
            />
          )}
        </>
      ) : null}

      {view !== 'list' && !PERSON_VIEWS.has(view) ? (
        <View style={styles.row}>
          <TouchableOpacity onPress={openList} accessibilityRole="button" style={[styles.secondary, { borderColor: colors.line }]}>
            <Text style={{ color: colors.ink }}>Til oversikten</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {personMode && !personFills ? (
        <>
          {view === 'overview' ? (
            <View nativeID="employee-overview-view">
              <MyOverviewScreen lockedEmployeeId={selected.id} embedded />
            </View>
          ) : null}

          {view === 'files' ? (
            <EmployeeFilesView
              companyId={familyId}
              employee={selected}
              colors={colors}
              uid={uid}
              canEdit={fullPersonAccess || selfEditor}
              canDelete={fullPersonAccess}
              expenses={projectState.expenses || []}
            />
          ) : null}

          {view === 'earnings' && (access.canView('economyEarnings') || access.canView('economy')) ? (
            <EmployeeEarningsSheet
              companyId={familyId}
              employee={selected}
              colors={colors}
              canEdit={access.canEdit('economyEarnings') || access.canEdit('economy')}
            />
          ) : null}

          {view === 'settings' && personEmployee ? (
            <EmployeeDetailView
              section="employment"
              employee={personEmployee}
              colors={colors}
              companyName={companyName}
              departments={departments}
              members={people}
              addressHits={addressHits}
              reveal={canSeeSensitive(personEmployee, { uid, isAdmin })}
              canEdit={isAdmin || isSelfRow(personEmployee)}
              canEditAccess={canEditAccess}
              isAdmin={isAdmin}
              isSelf={isSelfRow(personEmployee)}
              busy={busy}
              onChange={changeDetail}
              onSave={save}
              onClassify={classifyEmployee}
              onPhoto={choosePhoto}
              onPickAddress={pickAddress}
            />
          ) : null}

          {EMPLOYEE_SETTINGS_SUBS[view] ? (
            <EmployeeWorkViews
              key={view}
              mode="settings"
              sub={EMPLOYEE_SETTINGS_SUBS[view]}
              employee={draft || selected}
              colors={colors}
              canEdit={isAdmin || isSelfRow(selected)}
              onSave={saveWork}
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
              canEdit={isAdmin || (isSelfRow(detailEmployee) && ownLevel !== 'reader')}
              canEditAccess={canEditAccess}
              isAdmin={isAdmin}
              isSelf={isSelfRow(detailEmployee)}
              limited={limitedPerson}
              showAdminCards={!readOnlyPerson}
              canDelete={employeesAdmin}
              confirmDelete={confirmDelete}
              busy={busy}
              onCv={() => openCv(detailEmployee)}
              onHours={() => openHours(detailEmployee)}
              projectState={projectState}
              onOpenProject={(project) => {
                if (!project?.id) return;
                requestShellTab?.('projects', null, { type: 'openProject', projectId: project.id });
              }}
              onChange={changeDetail}
              onSave={save}
              onClassify={classifyEmployee}
              onPhoto={choosePhoto}
              onPickAddress={pickAddress}
              onPushProfile={access.previewing ? undefined : pushProfile}
              onPullToProfile={access.previewing ? undefined : pullToProfile}
              onConfirmDelete={() => setConfirmDelete(true)}
              onCancelDelete={() => setConfirmDelete(false)}
              onDestroy={destroy}
              onRestore={restoreEmployee}
              canInvite={canInvite}
              onInvite={() => inviteEmployee(detailEmployee)}
            />
          ) : null}

          {view === 'detail' && detailEmployee ? (
            <EmployeeUsagePanel
              companyId={familyId}
              employee={detailEmployee}
              colors={colors}
              enabled={employeesAdmin || isSelfRow(detailEmployee)}
            />
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
        </>
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

      {view === 'invite' && canInvite ? (
        <EmployeeInvitePanel
          colors={colors}
          employees={rows}
          canEditAccess={canEditAccess}
          busy={busy}
          onAdd={addInvitePerson}
          onRemove={removeInvitePerson}
          onSend={deliverInvites}
          onResend={(row) => deliverInvites([row.id])}
          onInviteSelected={deliverInvites}
          progress={inviteProgress}
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
          {view === 'mine' && mineHrEmployeeId && kinMissing(profile || draft) && kinMissing(linked) ? (
            <View nativeID="employee-kin-todo" style={[styles.kinTodo, { backgroundColor: FOCUS_FIELD_BG, borderColor: FOCUS_FIELD_BORDER }]}>
              <Text style={{ color: FOCUS_FIELD_INK, fontWeight: '700' }}>Gjøremål: legg inn pårørende</Text>
              <Text style={{ color: FOCUS_FIELD_INK, lineHeight: 20 }}>
                Navn og telefon til nærmeste pårørende. Det vises bare for deg og administrator. Trykk Lagre når det er fylt inn, så lukkes oppgaven.
              </Text>
              <TouchableOpacity
                onPress={() => beginSectionEdit('kin')}
                accessibilityRole="button"
                style={[styles.secondary, { borderColor: FOCUS_FIELD_BORDER, alignSelf: 'flex-start', backgroundColor: colors.card }]}
              >
                <Text style={{ color: colors.ink, fontWeight: '600' }}>Fyll inn pårørende</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {view === 'mine' && mineHrEmployeeId ? (
            <EmployeeHrSelfService
              colors={colors}
              companyId={familyId}
              employeeId={mineHrEmployeeId}
            />
          ) : null}
          {(view === 'mine' || isAdmin || isSelfRow(draft)) ? (
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
            lockedKeys={accessLocked}
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
      <RegisterEmployeeDialog
        visible={registerOpen}
        initialEmail={/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(query.trim()) ? query.trim() : ''}
        colors={colors}
        employees={rows}
        departments={departments}
        canEditAccess={canEditAccess}
        busy={busy}
        onClose={() => { if (!busy) setRegisterOpen(false); }}
        onOpenExisting={(row) => {
          setRegisterOpen(false);
          openDetail(row);
        }}
        onSubmit={registerEmployee}
      />
    </ScrollView>
    )}
    </View>
    <BrandBusyOverlay
      visible={!directoryReady || !!showBusyOverlay}
      testID={busyKind === 'save' ? 'employee-cv-progress' : 'brand-busy-overlay'}
      label={!directoryReady && !showBusyOverlay ? 'Vent…' : busyLabel('Jobber…')}
      detail={
        !directoryReady && !showBusyOverlay
          ? 'Henter ansatte.'
          : busyKind === 'save'
            ? 'Jobber med bilder og lagring. Ikke lukk fanen.'
            : 'Vent til operasjonen er ferdig før du går videre.'
      }
      done={saveProgress?.done}
      total={saveProgress?.total}
    />
    </>
  );
}

/** Invitasjonen og det den endrer på personen, lagt inn i en redigeringskopi. */
function withInviteFields(draft, saved) {
  return {
    ...draft,
    personUid: saved.personUid,
    invite: saved.invite,
    person: { ...(draft.person || {}), email: draft.person?.email || saved.person?.email || '' },
    company: {
      ...(draft.company || {}),
      email: draft.company?.email || saved.company?.email || '',
      accessLevel: saved.company?.accessLevel || '',
      accessRole: saved.company?.accessRole || '',
      canLogin: saved.company?.canLogin === true,
    },
  };
}

const INVITE_CHIP_KEYS = new Set(['none', 'missingEmail', 'queued', 'sent', 'declined']);

/** Invitasjonsstatus på personen i listen (bare for den som kan invitere). */
function InviteChip({ employee, colors }) {
  const state = employeeInviteState(employee);
  if (!INVITE_CHIP_KEYS.has(state.key)) return null;
  const alert = state.key === 'declined' || state.key === 'missingEmail';
  return (
    <Text style={[styles.dept, { color: alert ? (colors.danger || '#b42318') : colors.muted, backgroundColor: colors.sunken }]}>
      {state.label}
    </Text>
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
  screen: { flex: 1, minHeight: 0, minWidth: 0, width: '100%', alignSelf: 'stretch' },
  screenScroll: { flex: 1, minWidth: 0, alignSelf: 'stretch' },
  personChrome: {
    flexShrink: 0,
    width: '100%',
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    paddingTop: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    zIndex: 2,
  },
  personFill: { flex: 1, minHeight: 0, minWidth: 0, width: '100%', alignSelf: 'stretch' },
  inner: { padding: 16, paddingBottom: 48, gap: 12, maxWidth: 1080, width: '100%', alignSelf: 'flex-start' },
  innerWide: { maxWidth: 1220 },
  innerHours: { maxWidth: '100%', width: '100%', alignSelf: 'stretch', flexGrow: 1 },
  innerAbsence: { padding: 0, gap: 0, maxWidth: 1180, paddingBottom: 28 },
  hoursHost: { flex: 1, minHeight: 0, minWidth: 0, width: '100%', maxWidth: '100%', alignSelf: 'stretch' },
  absenceHost: { flex: 1, minHeight: 0, width: '100%', alignSelf: 'stretch' },
  subTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subTab: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  // Fraværsoversikten fyller området under fanene og må rulle selv.
  absenceInner: { flexGrow: 1, paddingBottom: 28 },
  title: { fontSize: 28, fontWeight: '700' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  stack: { gap: 12 },
  primary: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  primaryText: { color: '#fff', fontWeight: '600' },
  secondary: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: 'flex-start' },
  kinTodo: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  stats: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  person: { borderWidth: 1, borderRadius: 14, padding: 10, flexDirection: 'row', gap: 10 },
  avatar: { width: 44, height: 44, borderRadius: 8 },
  avatarSmall: { width: 32, height: 32, borderRadius: 8 },
  identity: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  personName: { fontSize: 14, fontWeight: '700' },
  personMeta: { fontSize: 14, fontWeight: '400' },
  grow: { flex: 1, gap: 1 },
  dept: { overflow: 'hidden', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, fontSize: 12, fontWeight: '400' },
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
