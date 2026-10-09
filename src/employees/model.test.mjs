import assert from 'node:assert/strict';
import { FORM_SECTIONS, scalarFields } from './schema.js';
import {
  absorbCompanyIntoProfile,
  applyEmployeeClassification,
  cvPlainText,
  applyProfessionalProfile,
  isDeletedEmployee,
  isInnleidEmployee,
  blankRepeatItem,
  buildCv,
  canSeeSensitive,
  cardSubtitle,
  commitEmployee,
  departmentLabels,
  directoryStats,
  displayName,
  employeeNumberLabel,
  emptyEmployee,
  filterEmployees,
  formatNbDate,
  gapReport,
  initials,
  linkClash,
  maskNationalId,
  normalizeEmployee,
  periodLabel,
  personnelKind,
  personnelKindLabel,
  presentEmployee,
  profileFromEmployee,
  rememberLink,
  sortEmployees,
  statusLabel,
  validNationalId,
} from './model.js';

function sampleNationalId() {
  const weights1 = [3, 7, 6, 1, 8, 9, 4, 5, 2];
  const weights2 = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const rest = (sum) => {
    const mod = 11 - (sum % 11);
    return mod === 11 ? 0 : mod;
  };
  for (let n = 0; n < 800; n += 1) {
    const nine = `010180${String(n).padStart(3, '0')}`.slice(0, 9);
    const nums = [...nine].map(Number);
    const k1 = rest(weights1.reduce((sum, weight, index) => sum + weight * nums[index], 0));
    if (k1 === 10) continue;
    const ten = [...nums, k1];
    const k2 = rest(weights2.reduce((sum, weight, index) => sum + weight * ten[index], 0));
    if (k2 === 10) continue;
    return `${nine}${k1}${k2}`;
  }
  throw new Error('fant ikke gyldig test-personnummer');
}

const FNR = sampleNationalId();

{
  for (const section of FORM_SECTIONS) {
    assert.ok(section.id && section.title && section.owner && section.purpose, section.id);
    assert.ok(section.fields.length, section.id);
    for (const field of section.fields) {
      assert.ok(field.key && field.label && field.type, `${section.id}.${field.key}`);
    }
  }
  assert.ok(scalarFields().some((field) => field.key === 'person.firstName'));
  assert.ok(FORM_SECTIONS.some((section) => section.collection === 'cv.projects'));
}

{
  const saved = commitEmployee({
    person: {
      firstName: 'Ada',
      lastName: 'Nordmann',
      phone: '993 76 973',
      birthDate: '08.04.1981',
      nationalId: FNR,
      language: 'Engelsk',
    },
    company: {
      title: 'Prosjektleder',
      status: 'current',
      workPercent: '100%',
      periodFrom: '01.04.2016',
      extraDepartments: ['Bygg #2'],
      compensationType: 'Fastlønn',
    },
    cv: {
      summary: 'Kort oppsummering av erfaring.',
      education: [{ from: '2020', to: '2022', school: 'UiS', program: 'Master' }],
      experience: [{ employer: 'Nord AS', from: '2016', to: '', current: true, title: 'Leder', tasks: '- Plan\n- HMS' }],
    },
    extras: { future: { keep: true } },
    customFields: [{ label: 'Tillitsvalgt', value: 'Ja', owner: 'company', purpose: 'operations' }],
  });
  assert.equal(saved.ok, true, saved.errors.join(', '));
  const row = saved.employee;
  assert.equal(displayName(row), 'Ada Nordmann');
  assert.equal(initials(row), 'AN');
  assert.equal(row.person.birthDate, '1981-04-08');
  assert.equal(formatNbDate(row.person.birthDate), '08.04.1981');
  assert.equal(presentEmployee(row).person.birthDate, '08.04.1981');
  assert.equal(row.person.phone.startsWith('+47'), true);
  assert.equal(validNationalId(row.person.nationalId), true);
  assert.equal(maskNationalId(row.person.nationalId).endsWith('•••••'), true);
  assert.equal(row.company.workPercent, '100');
  assert.equal(periodLabel(row), '01.04.2016 – nåværende');
  assert.deepEqual(departmentLabels(row, []), ['Bygg #2']);
  assert.equal(row.extras.future.keep, true);
  assert.equal(row.customFields[0].label, 'Tillitsvalgt');
  assert.equal(row.cv.experience[0].current, true);
  const again = normalizeEmployee(row);
  assert.equal(again.person.firstName, 'Ada');
  assert.equal(again.extras.future.keep, true);
}

{
  const missing = commitEmployee({ person: { firstName: 'Ada' }, company: { email: '' } });
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.some((line) => line.includes('Etternavn')));
  assert.ok(missing.errors.some((line) => line.includes('E-post eller mobil')));
}

{
  const badDate = commitEmployee({
    person: { firstName: 'Ada', lastName: 'Nord', phone: '99376973', birthDate: '32.13.2020' },
  });
  assert.equal(badDate.ok, false);
  assert.ok(badDate.errors.some((line) => line.includes('Fødselsdato')));
}

{
  const badId = commitEmployee({
    person: { firstName: 'Ada', lastName: 'Nord', email: 'ada@example.com', nationalId: '01018000000' },
  });
  assert.equal(badId.ok, false);
  assert.ok(badId.errors.some((line) => line.includes('Personnummer')));
}

{
  const mailOnly = commitEmployee({
    person: { firstName: 'Ada', lastName: 'Nord' },
    company: { email: 'ada@firma.no' },
  });
  assert.equal(mailOnly.ok, true, mailOnly.errors.join(', '));
  assert.equal(mailOnly.employee.company.email, 'ada@firma.no');
}

{
  const rows = [
    normalizeEmployee({ id: 'b', person: { firstName: 'Bo', lastName: 'Ås' }, company: { status: 'former', title: 'Rådgiver' } }),
    normalizeEmployee({ id: 'a', person: { firstName: 'Ada', lastName: 'Berg', phone: '99376973' }, company: { status: 'current', employmentType: 'Innleid', title: 'Byggeleder', canLogin: true, hasLicense: true } }),
    normalizeEmployee({ id: 'c', person: { firstName: 'Cia', lastName: 'Dahl', email: 'cia@firma.no' }, company: { status: 'current', title: 'Prosjektleder', canLogin: true, hasLicense: true } }),
    normalizeEmployee({ id: 'd', person: { firstName: 'Dan', lastName: 'Ek' }, company: { status: 'active', external: true, title: 'Konsulent' } }),
  ];
  assert.equal(personnelKind(rows[0]), 'staff');
  assert.equal(personnelKind(rows[1]), 'innleid');
  assert.equal(personnelKind(rows[2]), 'staff');
  assert.equal(personnelKind(rows[3]), 'external');
  assert.equal(rows[0].company.status, 'inactive');
  assert.equal(rows[1].company.status, 'active');
  assert.equal(personnelKindLabel('staff', 'Consult1'), 'Consult1-personell');
  assert.equal(personnelKindLabel('innleid'), 'Innleid personell');
  assert.equal(personnelKindLabel('external'), 'Eksternt personell');

  const staffActive = filterEmployees(rows, { kind: 'staff', status: 'active' });
  assert.deepEqual(staffActive.map((row) => row.id), ['c']);
  assert.deepEqual(filterEmployees(rows, { status: 'active' }).map((row) => row.id), ['a', 'c', 'd']);
  assert.deepEqual(filterEmployees(rows, { kind: 'innleid', status: 'all' }).map((row) => row.id), ['a']);
  assert.deepEqual(filterEmployees(rows, { kind: 'external', status: 'all' }).map((row) => row.id), ['d']);
  assert.deepEqual(filterEmployees(rows, { status: 'inactive' }).map((row) => row.id), ['b']);
  assert.deepEqual(filterEmployees(rows, { status: 'former' }).map((row) => row.id), ['b']);
  assert.equal(statusLabel('current'), 'Aktiv');
  assert.equal(statusLabel('former'), 'Deaktivert');
  assert.equal(statusLabel('deleted'), 'Slettet (papirkurv)');
  assert.equal(statusLabel('leave'), 'Permisjon');
  assert.deepEqual(filterEmployees(rows, { kind: 'staff', status: 'leave' }).map((row) => row.id), []);
  const onLeave = applyEmployeeClassification(rows[2], { status: 'leave' });
  assert.equal(onLeave.company.status, 'leave');
  assert.deepEqual(filterEmployees([...rows.slice(0, 2), onLeave, rows[3]], { kind: 'staff', status: 'leave' }).map((row) => row.id), ['c']);
  const withNumber = normalizeEmployee({
    id: 'n',
    person: { firstName: 'Nils', lastName: 'Holm' },
    company: { status: 'current', externalEmployeeNumber: '1042' },
  });
  assert.equal(employeeNumberLabel(withNumber), 'Ansattnr 1042');
  const stats = directoryStats(rows);
  assert.equal(stats.staff, 2);
  assert.equal(stats.innleid, 1);
  assert.equal(stats.external, 1);
  assert.equal(stats.active, 3);
  assert.equal(stats.inactive, 1);
  const classified = applyEmployeeClassification(rows[2], { status: 'inactive', personnelKind: 'innleid', canLogin: false });
  assert.equal(classified.company.status, 'inactive');
  assert.equal(classified.company.personnelKind, 'innleid');
  assert.equal(classified.company.employmentType, 'Innleid');
  assert.equal(classified.company.external, false);
  assert.equal(classified.company.canLogin, false);
  assert.equal(isInnleidEmployee(classified), true);
  const trashed = applyEmployeeClassification(classified, { status: 'deleted' });
  assert.equal(isDeletedEmployee(trashed), true);
  const back = applyEmployeeClassification(trashed, { personnelKind: 'staff', status: 'active' });
  assert.equal(back.company.employmentType, 'Fast ansatt');
  assert.equal(back.company.status, 'active');
  assert.equal(back.company.personnelKind, 'staff');
  assert.equal(cardSubtitle(rows[1], 'Consult1'), 'Innleid personell');
  assert.equal(cardSubtitle(rows[3], 'Consult1'), 'Eksternt personell · Consult1');
  assert.equal(cardSubtitle(rows[2], 'Consult1'), 'Prosjektleder');
  assert.deepEqual(sortEmployees(rows).map((row) => row.person.firstName), ['Ada', 'Bo', 'Cia', 'Dan']);
}

{
  const employee = normalizeEmployee({
    id: 'emp',
    personUid: 'user-1',
    person: { firstName: 'Ada', lastName: 'Nord', phone: '99376973', language: 'Engelsk' },
    company: { title: 'Byggeleder', email: 'ada@firma.no', compensationType: 'Fastlønn' },
    cv: { summary: 'Utkast fra bedriften' },
    customFields: [{ id: 'pay', label: 'Lønnstrinn', value: '5', owner: 'company', purpose: 'operations' }],
  });
  const profile = {
    updatedAt: '2026-10-01T00:00:00.000Z',
    person: { firstName: 'Ada', middleName: 'Marie', lastName: 'Nord', phone: '' },
    cv: {
      summary: 'Oppdatert oppsummering fra personen.',
      education: [{ school: 'NTNU', program: 'Bachelor', from: '2010', to: '2013' }],
    },
    customFields: [{ id: 'clearance', label: 'Sikkerhetsklarering', value: 'Hemmelig', owner: 'person', purpose: 'cv' }],
  };
  const merged = applyProfessionalProfile(employee, profile, '2026-10-02T00:00:00.000Z');
  assert.equal(merged.person.middleName, 'Marie');
  assert.equal(merged.person.phone.startsWith('+47'), true);
  assert.equal(merged.person.language, 'Engelsk');
  assert.equal(merged.company.title, 'Byggeleder');
  assert.equal(merged.company.compensationType, 'Fastlønn');
  assert.equal(merged.cv.summary, 'Oppdatert oppsummering fra personen.');
  assert.equal(merged.cv.education[0].school, 'NTNU');
  assert.ok(merged.customFields.some((field) => field.label === 'Lønnstrinn'));
  assert.ok(merged.customFields.some((field) => field.label === 'Sikkerhetsklarering'));
  assert.equal(merged.personSyncedAt, '2026-10-02T00:00:00.000Z');
  assert.equal(merged.linkStatus, 'linked');
}

{
  const employee = normalizeEmployee({
    person: { firstName: 'Per', lastName: 'Holm', birthDate: '1986-12-29', nationality: 'Norsk', kinName: 'Kari Holm', kinPhone: '99260963' },
    cv: { headline: 'Partner', education: [{ school: 'UiA', program: 'Master', from: '2024', to: '2026' }] },
    customFields: [{ label: 'Drone', value: 'A1/A3', owner: 'person', purpose: 'cv' }],
  });
  const profile = absorbCompanyIntoProfile({
    person: { firstName: 'Per', lastName: 'Holm', language: 'Engelsk' },
    cv: { summary: 'Min egen tekst' },
  }, employee);
  assert.equal(profile.person.language, 'Engelsk');
  assert.equal(profile.person.birthDate, '1986-12-29');
  assert.equal(profile.person.nationality, 'Norsk');
  assert.equal(profile.cv.summary, 'Min egen tekst');
  assert.equal(profile.cv.headline, 'Partner');
  assert.equal(profile.cv.education.length, 1);
  assert.ok(profile.customFields.some((field) => field.label === 'Drone'));
  const seeded = profileFromEmployee(employee);
  assert.equal(seeded.person.kinName, 'Kari Holm');
  assert.equal(seeded.customFields.some((field) => field.owner === 'company'), false);
}

{
  const list = [
    normalizeEmployee({ id: '1', personUid: 'u1', person: { firstName: 'A', lastName: 'B', email: 'a@b.no' } }),
  ];
  assert.equal(linkClash(list, { id: '2', personUid: 'u1' })?.id, '1');
  assert.equal(linkClash(list, { id: '1', personUid: 'u1' }), null);
  const links = rememberLink(rememberLink(null, {
    companyId: 'c1', employeeId: '1', companyName: 'Nord AS',
  }), {
    companyId: 'c1', employeeId: '1', companyName: 'Nord AS nytt',
  });
  assert.equal(links.links.length, 1);
  assert.equal(links.links[0].companyName, 'Nord AS nytt');
}

{
  const cv = buildCv(normalizeEmployee({
    person: {
      firstName: 'Geir',
      middleName: 'Ove',
      lastName: 'Test',
      birthDate: '1986-12-29',
      maritalStatus: 'Ugift',
      nationality: 'Norsk',
      language: 'Norsk',
    },
    company: { title: 'Prosjekteringsleder' },
    cv: {
      summary: 'Oppsummering av nøkkelkvalifikasjoner.',
      education: [{ from: '2020', to: '2022', school: 'UiS', program: 'Bachelor' }],
      certifications: [{ title: 'Sertifisert droneoperatør' }],
      courses: [{ date: '05.2026', title: 'Samsvarsentreprise' }],
      experience: [{
        employer: 'Nord AS', place: 'Sandnes', from: '2016', current: true, title: 'Partner', tasks: 'Fremdrift\nØkonomi',
      }],
      projects: [{
        title: 'Ny skole', category: 'Offentlig næring', client: 'Kommunen', period: '2023 – 2025', roles: 'Prosjektleder',
      }],
    },
  }), { companyName: 'NORD AS' });
  assert.equal(cv.name, 'Geir Ove Test');
  assert.equal(cv.title, 'Prosjekteringsleder');
  assert.ok(cv.facts.some(([label, value]) => label === 'Født' && value === '29.12.1986'));
  assert.ok(cv.facts.some(([label, value]) => label === 'Arbeidsgiver' && value === 'NORD AS'));
  assert.equal(cv.summary.includes('nøkkel'), true);
  assert.equal(cv.education[0].school, 'UiS');
  assert.equal(cv.certifications[0], 'Sertifisert droneoperatør');
  assert.equal(cv.courses[0].when, '05.2026');
  assert.equal(cv.experience[0].when.endsWith('d.d.'), true);
  assert.deepEqual(cv.experience[0].tasks, ['Fremdrift', 'Økonomi']);
  assert.equal(cv.projects[0].client, 'Kommunen');
  assert.equal(cv.gaps.length, 0);
  const plain = cvPlainText(cv);
  for (const heading of ['CURRICULUM VITAE', 'Profil', 'Oppsummering og nøkkelkvalifikasjoner', 'Utdanning', 'Sertifiseringer', 'Kurs', 'Erfaringer', 'Referanseprosjekter']) {
    assert.ok(plain.includes(heading), heading);
  }
  assert.ok(plain.includes('Fremdrift'));
  assert.ok(plain.includes('Kunde: Kommunen'));
}

{
  const gaps = gapReport(emptyEmployee());
  assert.ok(gaps.register.some((item) => item.label === 'Fornavn'));
  assert.ok(gaps.person.some((item) => item.label === 'Personnummer'));
  assert.ok(gaps.person.some((item) => item.owner === 'person' && item.label === 'Pårørende'));
  assert.ok(gaps.cv.some((item) => item.label === 'Utdanning'));
  assert.ok(gaps.cv.some((item) => item.label === 'Erfaring'));
  const hidden = normalizeEmployee({ personUid: 'me' });
  assert.equal(canSeeSensitive(hidden, { uid: 'me', isAdmin: false }), true);
  assert.equal(canSeeSensitive(hidden, { uid: 'other', isAdmin: false }), false);
  assert.equal(canSeeSensitive(hidden, { uid: 'other', isAdmin: true }), true);
}

{
  const section = FORM_SECTIONS.find((item) => item.id === 'education');
  const blank = blankRepeatItem(section);
  assert.ok(blank.id);
  assert.equal(blank.school, '');
  const departments = departmentLabels(normalizeEmployee({
    company: { departmentIds: ['d1'], extraDepartments: ['Bygg #1'] },
  }), [{ id: 'd1', name: 'Bygg #2' }]);
  assert.deepEqual(departments, ['Bygg #2', 'Bygg #1']);
}

{
  const profileSave = commitEmployee({
    person: { firstName: 'Ada', lastName: 'Nord', birthDate: '1981-04-08' },
  }, { scope: 'profile' });
  assert.equal(profileSave.ok, true, profileSave.errors.join(', '));
}

console.log('employees.model.test.mjs: ok');
