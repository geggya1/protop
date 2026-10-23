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
import { companyComplianceOverview } from '../../src/hr/compliance';
import { normalizeFormTemplates } from '../../src/anbud/bidLibrary';
import { addDays, todayKey } from '../../src/iso/core';

export function useIsoSources({ familyId, family, canManage = false, canSeeHr = false }) {
  const [employees, setEmployees] = useState([]);
  const [projectState, setProjectState] = useState(null);
  const [anbud, setAnbud] = useState(null);
  const [hr, setHr] = useState(null);
  const [stamp, setStamp] = useState(0);

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
    if (!familyId || !canSeeHr) { setHr(null); return undefined; }
    loadHrState(familyId).then((s) => { if (live) setHr(s); }).catch(() => {});
    return () => { live = false; };
  }, [familyId, canSeeHr]);

  const reloadAnbud = useCallback(() => setStamp((x) => x + 1), []);

  return useMemo(() => {
    const active = employees.filter((e) => !isDeletedEmployee(e));
    // Egne aktive ansatte først; de er standardforslagene i personvelgerne.
    const people = active
      .map((e) => ({ id: e.id, name: displayName(e), uid: e.personUid || '', title: e.company?.title || e.company?.position || '', own: isOwnActiveEmployee(e) }))
      .filter((p) => p.name && p.name !== 'Uten navn')
      .sort((a, b) => Number(b.own) - Number(a.own));
    const projects = (projectState?.projects || []).filter((p) => p.status !== 'arkivert');
    const hrOverview = hr ? companyComplianceOverview(active, hr.compliance || [], { contracts: hr.contracts || [], reviews: hr.reviews || [] }) : null;
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
      equipment: projectState?.equipment || [],
      expenses: projectState?.expenses || [],
      legacyAudits: (projectState?.audits || []).map((a) => ({ ...a, projectName: projects.find((p) => p.id === a.projectId)?.name || '' })),
      contracts: (anbud?.contracts || []).filter((c) => !c.deletedAt),
      customers: anbud?.customers || [],
      anbud,
      formTemplates: anbud ? normalizeFormTemplates(anbud.formTemplates) : [],
      hrOverview,
      reloadAnbud,
    };
  }, [employees, projectState, anbud, hr, family, canManage, reloadAnbud]);
}
