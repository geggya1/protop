/**
 * Møter i bedriften: henter ansatte, prosjekter, tilgang og lagring, og viser modulen.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useApp } from '../../src/context/AppContext';
import { useCompanyAccess } from '../../src/access/useCompanyAccess';
import { displayName, employeeEmails, ownEmployee, personnelKind } from '../../src/employees/model';
import { loadProjectState, peekProjectState } from '../../src/project/storage';
import { pickableProjects } from '../../src/project/myProjects';
import { createMeetingStore } from '../../src/meetings/storage';
import MeetingsModule from './MeetingsModule';

function personFromEmployee(emp, companyName) {
  const external = personnelKind(emp) !== 'staff';
  return {
    id: emp.id,
    uid: emp.personUid || '',
    name: displayName(emp),
    company: external ? '' : companyName,
    email: employeeEmails(emp)[0] || '',
    phone: emp.person?.phone || '',
    title: emp.company?.title || '',
    photoUrl: emp.person?.photoUrl || '',
  };
}

export default function MeetingsScreen({ subView = 'oversikt' }) {
  const {
    familyId, family, user, uid, activeProfile, requestShellTab, shellIntent, clearShellIntent,
  } = useApp();
  const access = useCompanyAccess();
  const employees = access.employees || [];
  const companyName = family?.company?.name || family?.name || '';
  const [projectState, setProjectState] = useState(() => peekProjectState?.(familyId) || null);

  useEffect(() => {
    let live = true;
    loadProjectState(familyId).then((state) => { if (live) setProjectState(state); }).catch(() => {});
    return () => { live = false; };
  }, [familyId]);

  const me = useMemo(() => (access.previewing && access.viewingAs
    ? employees.find((row) => row.id === access.viewingAs.id) || access.viewingAs
    : ownEmployee(employees, {
      uid: uid || '',
      emails: [user?.email, activeProfile?.email].filter(Boolean),
      name: activeProfile?.name || user?.displayName || '',
    })), [access.previewing, access.viewingAs, employees, uid, user, activeProfile]);

  const viewer = useMemo(() => ({
    uid: access.previewing ? (me?.personUid || '') : (uid || ''),
    email: (me ? employeeEmails(me)[0] : '') || user?.email || '',
    employeeId: me?.id || '',
    name: me ? displayName(me) : (activeProfile?.name || user?.displayName || ''),
  }), [access.previewing, me, uid, user, activeProfile]);

  const people = useMemo(() => employees
    .filter((emp) => (emp.company?.status || 'active') !== 'ended')
    .map((emp) => personFromEmployee(emp, companyName))
    .filter((p) => p.name && p.name !== 'Uten navn')
    .sort((a, b) => a.name.localeCompare(b.name, 'nb')), [employees, companyName]);

  const projects = useMemo(() => {
    if (!projectState) return [];
    return pickableProjects(projectState, me, employees, { all: access.canAdmin('projects') })
      .map((p) => ({ id: p.id, number: p.number || '', name: p.name || '', customerName: p.customerName || p.client || '' }));
  }, [projectState, me, employees, access]);

  const store = useMemo(
    () => (familyId ? createMeetingStore(familyId, { uid: viewer.uid, name: viewer.name, email: viewer.email }) : null),
    [familyId, viewer.uid, viewer.name, viewer.email],
  );

  const intent = shellIntent && (shellIntent.type === 'openMeeting' || shellIntent.type === 'newMeeting') ? shellIntent : null;
  const navigate = useCallback((sub) => requestShellTab?.('moter', sub), [requestShellTab]);
  const openFormBuilder = useCallback(() => requestShellTab?.('skjema'), [requestShellTab]);

  return (
    <MeetingsModule
      subView={subView}
      onNavigate={navigate}
      store={store}
      viewer={viewer}
      people={people}
      projects={projects}
      company={{ name: companyName, orgNr: family?.company?.orgNr || family?.company?.orgnr || '' }}
      logo={family?.company?.logo || null}
      canCreate={access.canEdit('meetings')}
      isAdmin={access.canAdmin('meetings')}
      intent={intent}
      onIntentDone={clearShellIntent}
      onOpenFormBuilder={access.canView('forms') ? openFormBuilder : undefined}
    />
  );
}
