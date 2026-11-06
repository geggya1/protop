import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import CompanyAccessDenied from '../../components/project/CompanyAccessDenied';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { activeEmployees, activeProjects, addDays, emptyPlan, planActivityFrom, toDateKey } from '../../src/capacity/plan';
import { capacityLoadMeta, loadCapacityPlan, saveCapacityPlan } from '../../src/capacity/storage';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useEmployees } from '../../src/context/CompanyDataContext';
import {
  absencesRangeCovered,
  ensureProjectAbsences,
  ensureProjectHours,
  hoursRangeCovered,
  loadProjectState,
  patchProjectOperations,
  peekProjectState,
} from '../../src/project/storage';
import { addProjectMember } from '../../src/project/engine';
import { displayName } from '../../src/employees/model';
import { myProjectIds } from '../../src/project/myProjects';
import { showSaveToast } from '../../src/ui/saveToast';
import { radius, type } from '../../src/ui/tokens';
import PageTabs from '../../components/PageTabs';
import ProductivityBoard from './ProductivityBoard';
import { controlMeasureGaps } from '../../src/hr/controlMeasures';
import { loadControlMeasures } from '../../src/hr/controlMeasuresStorage';

const VIEWS = [
  { id: 'people', label: 'Personer' },
  { id: 'sum', label: 'Sammenslått' },
];

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
  const [measureGaps, setMeasureGaps] = useState([]);

  // Produktivitet per ansatt er et kontrolltiltak (aml kap. 9).
  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    loadControlMeasures(familyId).then((settings) => {
      if (live) setMeasureGaps(controlMeasureGaps(settings.measures.productivity));
    });
    return () => { live = false; };
  }, [familyId]);
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [plan, setPlan] = useState(() => emptyPlan());
  const [timeEntries, setTimeEntries] = useState([]);
  const [absences, setAbsences] = useState([]);
  const [dayHours, setDayHours] = useState(8);
  // Tavlen vises når planen, prosjektdokumentet og fraværet er klart.
  // Timene trengs bare når en person er åpnet, og kommer etter.
  const [loaded, setLoaded] = useState({ plan: false, base: false, absences: false });
  const [loadingHours, setLoadingHours] = useState(false);
  const ready = loaded.plan && loaded.base && loaded.absences;
  const [view, setView] = useState('people');
  const echo = useRef(true);
  const familyRef = useRef(familyId);
  familyRef.current = familyId;

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    const companyId = familyId;
    const isLive = () => live && familyRef.current === companyId;
    const mark = (part) => {
      if (isLive()) setLoaded((current) => (current[part] ? current : { ...current, [part]: true }));
    };
    const today = toDateKey(new Date());
    const hourFrom = addDays(planActivityFrom(new Date()), -7 * 16);
    const hoursRange = { fromDate: hourFrom, toDate: today };
    const absenceRange = { fromDate: hourFrom, toDate: addDays(today, 7 * 60) };

    // Det som alt ligger i minnet (fra et tidligere besøk), tegnes med en gang. Nettet oppdaterer etterpå.
    const cached = peekProjectState(companyId);
    const absencesCached = !!cached && absencesRangeCovered(companyId, absenceRange);
    echo.current = true;
    setPlan(emptyPlan());
    setProjects(cached?.projects || []);
    setMembers(cached?.members || []);
    setDayHours(Number(cached?.fullDayHours) > 0 ? Number(cached.fullDayHours) : 8);
    setTimeEntries(cached && hoursRangeCovered(companyId, hoursRange) ? cached.timeEntries || [] : []);
    setAbsences(absencesCached ? cached.absences || [] : []);
    setLoaded({ plan: false, base: !!cached, absences: absencesCached });

    loadCapacityPlan(companyId)
      .catch(() => emptyPlan())
      .then((loadedPlan) => {
        if (!isLive()) return;
        echo.current = true;
        setPlan(loadedPlan || emptyPlan());
        mark('plan');
      });

    loadProjectState(companyId, { hours: false })
      .catch(() => null)
      .then((projectState) => {
        if (!isLive()) return;
        if (projectState) {
          setProjects(projectState.projects || []);
          setMembers(projectState.members || []);
          setDayHours(Number(projectState.fullDayHours) > 0 ? Number(projectState.fullDayHours) : 8);
        }
        mark('base');
        // Fravær og timer hentes samtidig, ikke etter hverandre.
        ensureProjectAbsences(companyId, absenceRange)
          .then((state) => {
            if (isLive()) setAbsences(state?.absences || []);
          })
          .catch(() => {})
          .finally(() => mark('absences'));
        setLoadingHours(true);
        ensureProjectHours(companyId, hoursRange)
          .then((state) => {
            if (isLive()) setTimeEntries(state?.timeEntries || []);
          })
          .catch(() => {})
          .finally(() => {
            if (isLive()) setLoadingHours(false);
          });
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

  // Admin og ledere setter personen inn som deltaker på prosjektet når de legger det til her.
  const canAddMember = canWrite && allProjects;
  async function addMember(person, project) {
    if (!canAddMember || !familyId || !person?.id || !project?.id) return;
    const already = members.some((row) => (
      row.projectId === project.id && row.employeeId === person.id && row.active !== false
    ));
    if (already) return;
    const input = {
      projectId: project.id,
      employeeId: person.id,
      employeeName: displayName(person),
      role: 'Prosjektmedlem',
      addedByUid: String(user?.uid || ''),
    };
    const companyId = familyId;
    let added = null;
    const result = await patchProjectOperations(companyId, (remote) => {
      const next = addProjectMember(remote, input);
      if (!next.ok) return null;
      added = next.state.members;
      return { members: next.state.members };
    }).catch((error) => ({ ok: false, error }));
    if (familyRef.current !== companyId) return;
    if (!result?.ok) {
      showSaveToast?.('Prosjektet står i listen, men personen ble ikke lagt inn som deltaker');
      return;
    }
    if (added) {
      setMembers(added);
      showSaveToast?.(`${displayName(person)} er lagt inn på ${project.number || project.name || 'prosjektet'}`);
    }
  }

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
    <View style={[styles.scroll, { backgroundColor: colors.bg }]}>
    <PageTabs id="produktivitet" label="Produktivitet" tabs={VIEWS} value={view} onChange={setView} />
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      nativeID="produktivitet-screen"
    >
      {canWrite && measureGaps.length ? (
        <Text nativeID="produktivitet-kontrolltiltak" style={[styles.notice, { color: colors.warnInk, backgroundColor: colors.card, borderColor: colors.warn }]}>
          {`Produktivitet per ansatt er et kontrolltiltak etter arbeidsmiljøloven kap. 9. ${measureGaps.join(' ')} Dokumenter det under HR → Lovpålagt.`}
        </Text>
      ) : null}
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
          loadingHours={loadingHours}
          canWrite={canWrite && (!access.active || access.ready)}
          onPlan={setPlan}
          onAddMember={canAddMember ? addMember : undefined}
          view={view}
        />
      ) : null}
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  notice: { borderWidth: 1, borderRadius: radius.card, padding: 12, marginBottom: 12, ...type.label, fontWeight: '400' },
});
