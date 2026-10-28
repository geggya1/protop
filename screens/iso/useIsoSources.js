/**
 * Data fra resten av ProTop som ISO bruker (bare lesing).
 * Ansatte, prosjekter, kjørebok, avfall, fravær (aggregert), utstyr, utlegg,
 * kunder, kontrakter, Skjemabygger og HR-sjekklisten. Hver kilde lastes med
 * modulens egen lasterfunksjon og eies fortsatt av modulen.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { watchEmployees } from '../../src/employees/storage';
import { displayName, isDeletedEmployee, isOwnActiveEmployee } from '../../src/employees/model';
import { ensureProjectAbsences, loadProjectState } from '../../src/project/storage';
import { loadAnbudState } from '../../src/anbud/storage';
import { loadHrState } from '../../src/hr/storage';
import { normalizeFormTemplates } from '../../src/anbud/bidLibrary';
import { addDays, todayKey } from '../../src/iso/core';
import { loadProjectExpenses, mergeExpenseLists } from '../../src/economy/expenseStorage';
import { loadDocControls } from '../../src/iso/storage';
import { myProjectIds } from '../../src/project/myProjects';
import { employeeMaySeeGear } from '../../src/equipment/calendars';

/** Ansatte som personer i ISO (velgere, kompetanse, beredskap). Egne aktive ansatte først. */
export function peopleFromEmployees(employees) {
  return (employees || [])
    .filter((e) => e && !isDeletedEmployee(e))
    .map((e) => ({
      id: e.id,
      name: displayName(e),
      uid: e.personUid || '',
      title: e.company?.title || e.company?.position || '',
      own: isOwnActiveEmployee(e),
      // Kontakt, avdeling og CV eies av Ansatte; ISO bruker dem i velgere, beredskap og kompetanse.
      phone: e.person?.phone || '',
      email: e.company?.email || e.person?.email || '',
      departmentIds: e.company?.departmentIds || [],
      cv: e.cv || null,
    }))
    .filter((p) => p.name && p.name !== 'Uten navn')
    .sort((a, b) => Number(b.own) - Number(a.own));
}

/**
 * allProjects / allGear: hele listen. Ellers bare prosjektene personen er med i og utstyret
 * personen har rettighet på (`viewer` = personens ansattpost), som i Prosjekt og Utstyr.
 */
export function useIsoSources({
  familyId, family, canManage = false, canSeeHr = false, allProjects = true, allGear = true, viewer = null,
}) {
  const [employees, setEmployees] = useState([]);
  const [projectState, setProjectState] = useState(null);
  const [anbud, setAnbud] = useState(null);
  const [hr, setHr] = useState(null);
  const [stamp, setStamp] = useState(0);
  // Utlegg importert i bulk ligger i egen samling (projectExpenses); leverandørforslagene skal se alle.
  const [extraExpenses, setExtraExpenses] = useState([]);
  const [docControls, setDocControls] = useState([]);

  useEffect(() => {
    if (!familyId) return undefined;
    return watchEmployees(familyId, (rows) => setEmployees(rows || []));
  }, [familyId]);

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    // Fravær bare for dem som behandler HMS (aggregeres uten navn i ISO).
    const job = canManage
      ? ensureProjectAbsences(familyId, { fromDate: addDays(todayKey(), -400) })
      : loadProjectState(familyId);
    job.then((s) => { if (live) setProjectState(s); }).catch(() => {
      loadProjectState(familyId).then((s) => { if (live) setProjectState(s); }).catch(() => {});
    });
    return () => { live = false; };
  }, [familyId, canManage]);

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    loadAnbudState(familyId).then((s) => { if (live) setAnbud(s); }).catch(() => {});
    return () => { live = false; };
  }, [familyId, stamp]);

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    loadDocControls(familyId).then((rows) => { if (live) setDocControls(rows || []); }).catch(() => {});
    return () => { live = false; };
  }, [familyId, stamp]);

  useEffect(() => {
    let live = true;
    if (!familyId || !canManage) { setExtraExpenses([]); return undefined; }
    loadProjectExpenses(familyId).then((rows) => { if (live) setExtraExpenses(rows || []); }).catch(() => {});
    return () => { live = false; };
  }, [familyId, canManage]);

  useEffect(() => {
    let live = true;
    if (!familyId || !canSeeHr) { setHr(null); return undefined; }
    loadHrState(familyId).then((s) => { if (live) setHr(s); }).catch(() => {});
    return () => { live = false; };
  }, [familyId, canSeeHr]);

  const reloadAnbud = useCallback(() => setStamp((x) => x + 1), []);

  return useMemo(() => {
    const active = employees.filter((e) => !isDeletedEmployee(e));
    const people = peopleFromEmployees(active);
    const own = allProjects ? null : myProjectIds(projectState, viewer, employees);
    const projects = (projectState?.projects || [])
      .filter((p) => p.status !== 'arkivert' && (!own || own.has(p.id)));
    // HR-sjekklistens rader: avkrysninger for HMS-punktene som er flyttet til Kompetanse kan tas med derfra.
    const hrCompliance = hr ? (hr.compliance || []) : null;
    return {
      ready: !!projectState,
      company: family?.company || null,
      employees: active,
      people,
      projects,
      projectState,
      trips: projectState?.mileageTrips || [],
      waste: projectState?.waste || [],
      absences: canManage ? (projectState?.absences || []) : [],
      equipment: (projectState?.equipment || []).filter((row) => allGear || employeeMaySeeGear(row, viewer)),
      expenses: mergeExpenseLists(projectState?.expenses || [], extraExpenses),
      legacyAudits: (projectState?.audits || []).map((a) => ({ ...a, projectName: projects.find((p) => p.id === a.projectId)?.name || '' })),
      contracts: (anbud?.contracts || []).filter((c) => !c.deletedAt),
      customers: anbud?.customers || [],
      anbud,
      formTemplates: anbud ? normalizeFormTemplates(anbud.formTemplates) : [],
      hrCompliance,
      reloadAnbud,
      docControls,
    };
  }, [employees, projectState, anbud, hr, family, canManage, reloadAnbud, extraExpenses, docControls, allProjects, allGear, viewer]);
}
