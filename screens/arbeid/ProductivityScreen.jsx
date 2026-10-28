import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { activeEmployees, activeProjects, addDays, emptyPlan, planActivityFrom, toDateKey } from '../../src/capacity/plan';
import { capacityLoadMeta, loadCapacityPlan, saveCapacityPlan } from '../../src/capacity/storage';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useEmployees } from '../../src/context/CompanyDataContext';
import { ensureProjectAbsences, loadProjectState } from '../../src/project/storage';
import { myProjectIds } from '../../src/project/myProjects';
import { showSaveToast } from '../../src/ui/saveToast';
import ProductivityBoard from './ProductivityBoard';

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

export default function ProductivityScreen() {
  const colors = useColors();
  const { familyId, user } = useApp();
  const access = useCompanyAccess();
  const { employees } = useEmployees(familyId);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [plan, setPlan] = useState(() => emptyPlan());
  const [timeEntries, setTimeEntries] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [dayHours, setDayHours] = useState(8);
  const [ready, setReady] = useState(false);
  const echo = useRef(true);
  const familyRef = useRef(familyId);
  familyRef.current = familyId;

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    echo.current = true;
    setReady(false);
    setPlan(emptyPlan());
    const companyId = familyId;
    const hourFrom = addDays(planActivityFrom(new Date()), -7 * 16);
    const absenceTo = addDays(toDateKey(new Date()), 7 * 60);
    Promise.all([
      loadProjectState(companyId, {
        hours: { fromDate: hourFrom, toDate: toDateKey(new Date()) },
      }).catch(() => ({ projects: [], members: [], timeEntries: [] }))
        .then((projectState) => ensureProjectAbsences(companyId, {
          fromDate: hourFrom,
          toDate: absenceTo,
        }).then((withAbs) => ({
          ...projectState,
          timeEntries: withAbs?.timeEntries?.length ? withAbs.timeEntries : projectState?.timeEntries,
          absences: withAbs?.absences || [],
        })).catch(() => projectState)),
      loadCapacityPlan(companyId).catch(() => emptyPlan()),
    ]).then(([projectState, loadedPlan]) => {
      if (!live || familyRef.current !== companyId) return;
      setProjects(projectState?.projects || []);
      setTimeEntries(projectState?.timeEntries || []);
      setAbsences(projectState?.absences || []);
      setDayHours(Number(projectState?.fullDayHours) > 0 ? Number(projectState.fullDayHours) : 8);
      setMembers(projectState?.members || []);
      echo.current = true;
      setPlan(loadedPlan || emptyPlan());
      setReady(true);
    });
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    if (!ready || !familyId) return undefined;
    if (echo.current) {
      echo.current = false;
      return undefined;
    }
    const companyId = familyId;
    const snapshot = plan;
    const timer = setTimeout(() => {
      saveCapacityPlan(snapshot, companyId).catch((err) => {
        if (familyRef.current !== companyId) return;
        const code = String(err?.code || '');
        if (code === 'capacity/auth') showSaveToast?.('Ikke innlogget — planen er lagret lokalt');
        else if (code === 'capacity/permission') showSaveToast?.('Mangler tilgang til å lagre planen');
        else if (code === 'capacity/skip-uncertain' || capacityLoadMeta(companyId) === 'error') {
          showSaveToast?.('Lagret lokalt — skyen ikke klar');
        } else showSaveToast?.('Kunne ikke lagre kapasitetsplanen');
      });
    }, 450);
    return () => clearTimeout(timer);
  }, [plan, ready, familyId]);

  const seeOthers = !access.active || access.canView('hoursOthers');
  const canWrite = access.canEdit('productivity')
    || (seeOthers ? access.canEdit('hoursOthers') : access.canEdit('hours'));
  // «Se som bruker»: den valgte personen.
  const me = useMemo(
    () => (access.previewing && access.viewingAs
      ? (employees.find((row) => row.id === access.viewingAs.id) || access.viewingAs)
      : ownEmployee(activeEmployees(employees), user)),
    [access.previewing, access.viewingAs, employees, user],
  );
  const people = useMemo(() => {
    const active = activeEmployees(employees);
    if (seeOthers) return active;
    return me ? [me] : [];
  }, [employees, seeOthers, me]);
  // Admin på Prosjekt ser alle prosjekter. Ellers bare prosjektene personen er med i.
  const allProjects = !access.active || (access.ready && access.canAdmin('projects'));
  const liveProjects = useMemo(() => {
    const live = activeProjects(projects);
    if (allProjects) return live;
    const own = myProjectIds({ projects, members, timeEntries }, me, employees);
    return live.filter((project) => own.has(project.id));
  }, [projects, allProjects, members, timeEntries, me, employees]);

  if (access.active && !access.ready) {
    return <ScrollView style={[styles.scroll, { backgroundColor: colors.bg }]} nativeID="produktivitet-screen" />;
  }

  if (
    access.active
    && access.ready
    && !access.canView('productivity')
    && !access.canView('hours')
    && !access.canView('hoursOthers')
  ) {
    return <CompanyAccessDenied />;
  }

  return (
    <ScrollView
      style={[styles.scroll, { backgroundColor: colors.bg }]}
      contentContainerStyle={styles.content}
      nativeID="produktivitet-screen"
    >
      {ready ? (
        <ProductivityBoard
          colors={colors}
          people={people}
          projects={liveProjects}
          members={members}
          plan={plan}
          timeEntries={timeEntries}
          absences={absences}
          fullDayHours={dayHours}
          canWrite={canWrite && (!access.active || access.ready)}
          onPlan={setPlan}
        />
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
});
