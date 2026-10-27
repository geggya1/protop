import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { loadAnbudState, peekAnbudState } from '../../src/anbud/storage';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { watchEmployees } from '../../src/employees/storage';
import { ensureProjectHours, loadProjectState, peekProjectState } from '../../src/project/storage';
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

/** Prosjektfremdrift: planlagt periode og utført arbeid for alle prosjekter. Bare visning. */
export default function ProjectTimelineScreen() {
  const colors = useColors();
  const { familyId, user } = useApp();
  const access = useCompanyAccess();
  const cachedProjects = peekProjectState(familyId);
  const [projects, setProjects] = useState(() => cachedProjects?.projects || []);
  const [dayHours, setDayHours] = useState(() => Number(cachedProjects?.fullDayHours) || 8);
  const [contracts, setContracts] = useState(() => peekAnbudState(familyId)?.contracts || []);
  const [timeEntries, setTimeEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [range, setRange] = useState(null);
  const [loadingHours, setLoadingHours] = useState(false);
  const familyRef = useRef(familyId);
  familyRef.current = familyId;

  const seeOthers = !access.active || access.canView('hoursOthers');

  useEffect(() => {
    if (!familyId || seeOthers) return undefined;
    return watchEmployees(familyId, (rows) => setEmployees(rows || []));
  }, [familyId, seeOthers]);

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    const companyId = familyId;
    loadProjectState(companyId, { hours: false })
      .then((state) => {
        if (!live || familyRef.current !== companyId) return;
        setProjects(state?.projects || []);
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

  const visibleEntries = useMemo(() => {
    if (seeOthers) return timeEntries;
    const mine = ownEmployee(employees, user);
    if (!mine) return [];
    return timeEntries.filter((row) => row.employeeId === mine.id);
  }, [timeEntries, seeOthers, employees, user]);

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
        projects={projects}
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
