/**
 * Forhåndsvisning av medarbeiderdetalj uten innlogging.
 * Manuell QA via /employee-detail-preview (web).
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../src/theme';
import { presentEmployee } from '../../src/employees/model';
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
  const selected = siblings.find((row) => row.id === selectedId) || siblings[0];
  const departments = [{ id: 'dep-bygg', name: 'Bygg' }];

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
        reveal
        gaps={{
          register: [],
          person: [],
          cv: [{ key: 'cv.summary', label: 'Oppsummering' }],
        }}
        canEdit
        isAdmin
        isSelf
        siblings={siblings}
        confirmDelete={confirmDelete}
        onBack={() => {}}
        onEdit={() => {}}
        onCv={() => {}}
        onSelect={(row) => setSelectedId(row.id)}
        onPushProfile={() => {}}
        onPullToProfile={() => {}}
        onConfirmDelete={() => setConfirmDelete(true)}
        onCancelDelete={() => setConfirmDelete(false)}
        onDestroy={() => setConfirmDelete(false)}
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
