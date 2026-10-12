/**
 * Forhåndsvisning av medarbeiderdetalj uten innlogging.
 * Manuell QA via /employee-detail-preview (web).
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../src/theme';
import { applyEmployeeClassification, presentEmployee } from '../../src/employees/model';
import { emptyProjectState } from '../../src/project/engine';
import ProjectDetail from '../../components/project/ProjectDetail';
import EmployeeDetailView from './EmployeeDetailView';

function mockEmployee(id, overrides = {}) {
  return presentEmployee({
    id,
    linkStatus: 'linked',
    personUid: 'preview-user',
    person: {
      firstName: 'Geir Ove',
      lastName: 'Andersen',
      email: 'goa@consult1.no',
      phone: '+47 902 42 075',
      username: 'Goa',
      birthDate: '1978-05-12',
      gender: 'Mann',
      language: 'Norsk bokmål',
      nationality: 'Norsk',
      nationalId: '12057812345',
      address1: 'Eksempelveien 12',
      postalCode: '0150',
      place: 'Oslo',
      kinName: 'Kari Andersen',
      kinPhone: '+47 900 00 001',
      kinEmail: 'kari@example.no',
      maritalStatus: 'Gift',
      ...(overrides.person || {}),
    },
    company: {
      status: 'current',
      title: 'Prosjekt- og byggeleder',
      projectRole: 'Prosjektleder',
      accessRole: 'Administrator',
      employmentType: 'Heltidsmedarbeider',
      compensationType: 'Fastlønn',
      workPercent: '100',
      periodFrom: '2016-04-01',
      periodTo: '',
      externalEmployeeNumber: '2',
      email: 'goa@consult1.no',
      canLogin: true,
      hasLicense: true,
      departmentIds: ['dep-bygg'],
      permissions: ['Prosjektadmin', 'Timer'],
      comment: 'Ansatt 01.04.2016. Personnummer ligger i personopplysninger.',
      ...(overrides.company || {}),
    },
    cv: {
      headline: 'Prosjekt- og byggeleder',
      summary: 'Erfaren prosjektleder innen bygg og anlegg.',
      education: [
        { id: 'edu1', from: '1998', to: '2001', school: 'NTNU', program: 'Bygg og anlegg' },
      ],
      experience: [
        { id: 'exp1', employer: 'Consult1', title: 'Prosjektleder', from: '2016', current: true },
      ],
      courses: [],
      certifications: [],
      projects: [
        {
          id: 'p1',
          title: 'Prismen (Ny) : Delte entrepriser',
          object: '#10417',
          period: '2019 – nåværende',
          roles: 'Prosjektleder',
          client: 'Oslo kommune',
        },
        {
          id: 'p2',
          title: 'Skolebygg Vest',
          object: '#10201',
          period: '2021 – nåværende',
          roles: 'Prosjektleder\nSHA-koordinator',
          client: 'Statsbygg',
        },
        {
          id: 'p3',
          title: 'Kontorbygg Sentrum',
          object: '#9802',
          period: '2017 – 2019',
          roles: 'Prosjektmedlem',
          client: 'Private',
        },
      ],
      ...(overrides.cv || {}),
    },
    customFields: [
      { id: 'cf1', label: 'Kompetanseområde', value: 'Byggherreombud', owner: 'company', purpose: 'operations' },
    ],
    ...overrides,
  });
}

export default function EmployeeDetailPreview() {
  const siblings = useMemo(() => ([
    mockEmployee('emp-1'),
    mockEmployee('emp-2', {
      person: { firstName: 'Marte', lastName: 'Hansen', email: 'marte@consult1.no', username: 'Marte' },
      company: { title: 'Prosjekteringsleder', projectRole: 'Prosjekteringsleder', accessRole: 'Leder' },
    }),
    mockEmployee('emp-3', {
      person: { firstName: 'Jon', lastName: 'Berg', email: 'jon@consult1.no', username: 'Jon' },
      company: { title: 'Byggeleder', projectRole: 'Byggeleder', accessRole: 'Medarbeider' },
    }),
  ]), []);
  const [selectedId, setSelectedId] = useState(siblings[0].id);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [people, setPeople] = useState(siblings);
  const [openedId, setOpenedId] = useState('');
  const selected = people.find((row) => row.id === selectedId) || people[0];
  const departments = [{ id: 'dep-bygg', name: 'Bygg' }];
  const projectState = useMemo(() => {
    const now = new Date();
    const recent = new Date(now);
    recent.setMonth(recent.getMonth() - 1);
    const old = new Date(now);
    old.setMonth(old.getMonth() - 8);
    const iso = (d) => d.toISOString().slice(0, 10);
    const base = emptyProjectState();
    return {
      ...base,
      projects: [
        { id: 'wp-1', number: '10417', name: 'Prismen (Ny)', client: 'Oslo kommune', status: 'aktiv', manager: 'Geir Ove Andersen', projectStatus: 'Under arbeid', start: '2019-08-01', end: '' },
        { id: 'wp-2', number: '10201', name: 'Skolebygg Vest', client: 'Statsbygg', status: 'aktiv', manager: 'Geir Ove Andersen', projectStatus: 'Under arbeid', start: '2021-03-01', end: '' },
        { id: 'wp-3', number: '9802', name: 'Kontorbygg Sentrum', client: 'Private', status: 'aktiv', manager: 'Geir Ove Andersen', projectStatus: 'Avsluttet', start: '2017-01-01', end: '2019-12-31' },
        {
          id: 'wp-4',
          number: '10001',
          name: 'Myklebust CB6-12-13 (1882)',
          client: 'Sola Kommune',
          status: 'aktiv',
          manager: 'Geir Ove Andersen',
          projectStatus: 'Avsluttet',
          start: '42461',
          end: '43334',
        },
      ],
      members: [
        { id: 'm1', projectId: 'wp-1', employeeId: siblings[0].id, employeeName: 'Geir Ove Andersen', role: 'Prosjektleder', active: true },
        { id: 'm2', projectId: 'wp-2', employeeId: siblings[0].id, employeeName: 'Geir Ove Andersen', role: 'SHA-koordinator', active: true },
        { id: 'm3', projectId: 'wp-3', employeeId: siblings[0].id, employeeName: 'Geir Ove Andersen', role: 'Prosjektmedlem', active: true },
        { id: 'm4', projectId: 'wp-4', employeeId: siblings[0].id, employeeName: 'Geir Ove Andersen', role: 'Prosjektleder', active: true },
      ],
      timeEntries: [
        { id: 't1', projectId: 'wp-1', employeeId: siblings[0].id, date: iso(recent), hours: 6, billableHours: 6, status: 'registrert' },
        { id: 't2', projectId: 'wp-4', employeeId: siblings[0].id, date: iso(recent), hours: 3, billableHours: 3, status: 'registrert' },
        { id: 't3', projectId: 'wp-3', employeeId: siblings[0].id, date: iso(old), hours: 10, billableHours: 10, status: 'registrert' },
      ],
    };
  }, [siblings]);
  const openedProject = projectState.projects.find((row) => row.id === openedId) || null;

  if (openedProject) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16 }}>
        <Text style={[styles.banner, { color: colors.muted, borderColor: colors.line, backgroundColor: colors.card, marginBottom: 12 }]}>
          Forhåndsvisning · prosjekt åpnet fra medarbeider
        </Text>
        <ProjectDetail
          state={projectState}
          project={openedProject}
          employees={people}
          colors={colors}
          isAdmin
          uid="preview-user"
          onChangeState={() => {}}
          onBack={() => setOpenedId('')}
        />
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={styles.inner}>
      <Text style={[styles.banner, { color: colors.muted, borderColor: colors.line, backgroundColor: colors.card }]}>
        Forhåndsvisning · /employee-detail-preview
      </Text>
      <EmployeeDetailView
        employee={selected}
        colors={colors}
        companyName="Consult1"
        departments={departments}
        projectState={projectState}
        reveal
        gaps={{
          register: [],
          person: [],
          cv: [{ key: 'cv.summary', label: 'Oppsummering' }],
        }}
        canEdit
        isAdmin
        isSelf
        siblings={people}
        confirmDelete={confirmDelete}
        onBack={() => {}}
        onCv={() => {}}
        onOpenProject={(project) => setOpenedId(project.id)}
        onSelect={(row) => setSelectedId(row.id)}
        onChange={(next) => {
          setPeople((current) => current.map((row) => (row.id === next.id ? next : row)));
        }}
        onSave={() => true}
        onClassify={(patch) => {
          setPeople((current) => current.map((row) => (
            row.id === selected.id ? presentEmployee(applyEmployeeClassification(row, patch)) : row
          )));
        }}
        onPushProfile={() => {}}
        onPullToProfile={() => {}}
        onConfirmDelete={() => setConfirmDelete(true)}
        onCancelDelete={() => setConfirmDelete(false)}
        onDestroy={() => {
          setPeople((current) => current.map((row) => (
            row.id === selected.id
              ? presentEmployee(applyEmployeeClassification(row, { status: 'deleted' }))
              : row
          )));
          setConfirmDelete(false);
        }}
        onRestore={() => {
          setPeople((current) => current.map((row) => (
            row.id === selected.id
              ? presentEmployee(applyEmployeeClassification(row, { status: 'active' }))
              : row
          )));
        }}
      />
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inner: { padding: 20, paddingBottom: 48, maxWidth: 1220, width: '100%', alignSelf: 'center', gap: 12 },
  banner: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    alignSelf: 'flex-start',
  },
});
