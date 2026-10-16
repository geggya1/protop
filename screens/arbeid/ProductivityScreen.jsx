import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { CompanyAccessDenied } from '../../components/project/CompanyAccessSettings';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { activeEmployees, activeProjects, emptyPlan } from '../../src/capacity/plan';
import { capacityLoadMeta, loadCapacityPlan, saveCapacityPlan } from '../../src/capacity/storage';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { watchEmployees } from '../../src/employees/storage';
import { loadProjectState } from '../../src/project/storage';
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
  const [employees, setEmployees] = useState([]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [plan, setPlan] = useState(() => emptyPlan());
  const [dayHours, setDayHours] = useState(8);
  const [ready, setReady] = useState(false);
  const echo = useRef(true);
  const familyRef = useRef(familyId);
  familyRef.current = familyId;

  useEffect(() => {
    if (!familyId) return undefined;
    return watchEmployees(familyId, (rows) => setEmployees(rows || []));
  }, [familyId]);

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    echo.current = true;
    setReady(false);
    setPlan(emptyPlan());
    const companyId = familyId;
    Promise.all([
      loadProjectState(companyId, { hours: false }).catch(() => ({ projects: [], members: [] })),
      loadCapacityPlan(companyId).catch(() => emptyPlan()),
    ]).then(([projectState, loadedPlan]) => {
      if (!live || familyRef.current !== companyId) return;
      setProjects(projectState?.projects || []);
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

  const seeOthers = !access.active || access.can('hoursOthers', 'see');
  const canWrite = seeOthers ? access.can('hoursOthers', 'write') : access.can('hours', 'write');
  const people = useMemo(() => {
    const active = activeEmployees(employees);
    if (seeOthers) return active;
    const mine = ownEmployee(active, user);
    return mine ? [mine] : [];
  }, [employees, seeOthers, user]);
  const liveProjects = useMemo(() => activeProjects(projects), [projects]);

  if (access.active && !access.ready) {
    return <ScrollView style={[styles.scroll, { backgroundColor: colors.bg }]} nativeID="produktivitet-screen" />;
  }

  if (access.active && access.ready && !access.can('hours', 'see') && !access.can('hoursOthers', 'see')) {
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
