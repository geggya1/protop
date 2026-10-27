import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { loadAnbudState, peekAnbudState } from '../../src/anbud/storage';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { watchEmployees } from '../../src/employees/storage';
import { ensureProjectHours, loadProjectState, peekProjectState } from '../../src/project/storage';
import { myProjectIds } from '../../src/project/myProjects';
import ProjectTimelineBoard from './ProjectTimelineBoard';

function ownEmployee(rows, user) {
  const uid = String(user?.uid || '');
  const email = String(user?.email || '').toLowerCase();
  if (uid) {
    const byUid = (rows || []).find((row) => row.personUid && row.personUid === uid);
    if (byUid) return byUid;
  }
  if (!email) return null;
  return (rows || []).find((row) => String(row.person?.email || row.company?.email || '').toLowerCase() === email) || null;
}

/**
 * Prosjektfremdrift: planlagt periode og utført arbeid. Bare visning.
 * Admin på Prosjekt ser alle prosjekter. Lese og begrenset redigering ser prosjektene de er med i.
 */
export default function ProjectTimelineScreen() {
  const colors = useColors();
  const { familyId, user } = useApp();
  const access = useCompanyAccess();
  const cachedProjects = peekProjectState(familyId);
  const [projects, setProjects] = useState(() => cachedProjects?.projects || []);
  const [members, setMembers] = useState(() => cachedProjects?.members || []);
  const [dayHours, setDayHours] = useState(() => Number(cachedProjects?.fullDayHours) || 8);
  const [contracts, setContracts] = useState(() => peekAnbudState(familyId)?.contracts || []);
  const [timeEntries, setTimeEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [range, setRange] = useState(null);
  const [loadingHours, setLoadingHours] = useState(false);
  const familyRef = useRef(familyId);
  familyRef.current = familyId;

  const seeOthers = !access.active || access.canView('hoursOthers');
  const allProjects = !access.active || (access.ready && access.canAdmin('projects'));

  useEffect(() => {
    if (!familyId || (seeOthers && allProjects)) return undefined;
    return watchEmployees(familyId, (rows) => setEmployees(rows || []));
  }, [familyId, seeOthers, allProjects]);

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    const companyId = familyId;
    loadProjectState(companyId, { hours: false })
      .then((state) => {
        if (!live || familyRef.current !== companyId) return;
        setProjects(state?.projects || []);
        setMembers(state?.members || []);
        if (Number(state?.fullDayHours) > 0) setDayHours(Number(state.fullDayHours));
      })
      .catch(() => {});
    loadAnbudState(companyId)
      .then((state) => {
        if (!live || familyRef.current !== companyId) return;
        setContracts(state?.contracts || []);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    let live = true;
    if (!familyId || !range?.fromDate) return undefined;
    const companyId = familyId;
    setLoadingHours(true);
    ensureProjectHours(companyId, range)
      .then((state) => {
        if (!live || familyRef.current !== companyId) return;
        setTimeEntries(state?.timeEntries || []);
      })
      .catch(() => {})
      .finally(() => {
        if (live) setLoadingHours(false);
      });
    return () => { live = false; };
  }, [familyId, range?.fromDate, range?.toDate]);

  // «Se som bruker»: den valgte personen.
  const me = useMemo(
    () => (access.previewing && access.viewingAs ? access.viewingAs : ownEmployee(employees, user)),
    [access.previewing, access.viewingAs, employees, user],
  );

  const visibleEntries = useMemo(() => {
    if (seeOthers) return timeEntries;
    if (!me) return [];
    return timeEntries.filter((row) => row.employeeId === me.id);
  }, [timeEntries, seeOthers, me]);

  const visibleProjects = useMemo(() => {
    if (allProjects) return projects;
    const own = myProjectIds({ projects, members, timeEntries }, me, employees);
    return projects.filter((project) => own.has(project.id));
  }, [allProjects, projects, members, timeEntries, me, employees]);

  if (access.active && !access.ready) {
    return <ScrollView style={[styles.scroll, { backgroundColor: colors.bg }]} nativeID="fremdrift-screen" />;
  }

  if (access.active && access.ready && !(access.canView('productivity') && access.canView('projects'))) {
    return <CompanyAccessDenied />;
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      nativeID="fremdrift-screen"
    >
      <ProjectTimelineBoard
        colors={colors}
        projects={visibleProjects}
        contracts={contracts}
        timeEntries={visibleEntries}
        fullWeekHours={dayHours * 5}
        loadingHours={loadingHours}
        onRange={setRange}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
});
