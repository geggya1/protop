import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveActorAccess } from '../access/companyAccess.js';
import {
  inviteDeliveryError,
  queueEmployeeInvite,
} from '../employees/invite.js';
import { validNationalId } from '../employees/model.js';
import { groupInviteCopy } from '../utils/inviteIdentifiers.js';
import { OLD_BRAND_PATTERN } from '../utils/legacyNames.js';
import {
  addHr,
  awaiting,
  claimInvite,
  createBot,
  createCompanyFromLookup,
  createCompanyWorld,
  createManualWorkspace,
  createUnderenhet,
  deactivateWorkspace,
  deleteWorkspace,
  deliverInvite,
  dropQueued,
  employ,
  failInvite,
  isDeletedEmployee,
  memberView,
  publicSeekerView,
  publicUnitsNotRegistered,
  publishWall,
  queueMember,
  reactivateWorkspace,
  removeMember,
  segmentsFor,
  setMemberStatus,
  shapePublicUnits,
  switcherFor,
  employeeShowsInSection,
} from './companyVisibility.js';

const ADA = 'adaAdaAdaAdaAdaAdaAdaAdaAdaA';
const BO = 'boBoBoBoBoBoBoBoBoBoBoBoBoBo';
const KARI = 'kariKariKariKariKariKariKari';
const NILS = 'nilsNilsNilsNilsNilsNilsNils';
const EVA = 'evaEvaEvaEvaEvaEvaEvaEvaEvaE';
const DAN = 'danDanDanDanDanDanDanDanDanD';
const SIRI = 'siriSiriSiriSiriSiriSiriSiri';
const LEIF = 'leifLeifLeifLeifLeifLeifLeif';
const PER = 'perPerPerPerPerPerPerPerPerP';
const LIV = 'livLivLivLivLivLivLivLivLivL';
const SEEKER = 'seekerSeekerSeekerSeekerSeek';

const BO_ID = '01019000164';
const KARI_ID = '02029200125';
const NILS_ID = '15058512343';

const consultRaw = {
  organisasjonsnummer: '916538804',
  navn: 'CONSULT1 AS',
  organisasjonsform: { kode: 'AS', beskrivelse: 'Aksjeselskap' },
  hjemmeside: 'www.consult1.no',
  epostadresse: 'post@consult1.no',
  telefon: '52 05 52 10',
  stiftelsesdato: '2016-01-01',
  vedtektsfestetFormaal: ['Eiendom og investering.'],
  naeringskode1: { kode: '71.121', beskrivelse: 'Byggeteknisk konsulentvirksomhet' },
  antallAnsatte: 19,
  harRegistrertAntallAnsatte: true,
  forretningsadresse: {
    land: 'Norge',
    postnummer: '4313',
    poststed: 'SANDNES',
    adresse: ['2 Etasje', 'Svanholmen 7'],
  },
  kapital: { belop: 100000, antallAksjer: 3000, type: 'Aksjekapital', valuta: 'NOK' },
};

const consultRoles = {
  rollegrupper: [
    {
      type: { beskrivelse: 'Styre' },
      roller: [
        { type: { beskrivelse: 'Styrets leder' }, person: { navn: { fornavn: 'Torbjørn', etternavn: 'Øgreid' } } },
        { type: { beskrivelse: 'Styremedlem' }, fratraadt: true, person: { navn: { fornavn: 'Ut', etternavn: 'Av' } } },
      ],
    },
  ],
};

const underRaw = {
  organisasjonsnummer: '916570783',
  navn: 'CONSULT1 AS',
  organisasjonsform: { kode: 'BEDR', beskrivelse: 'Underenhet' },
  overordnetEnhet: '916538804',
  beliggenhetsadresse: {
    adresse: ['Svanholmen 7'],
    postnummer: '4313',
    poststed: 'SANDNES',
  },
};

const nordRaw = {
  organisasjonsnummer: '999888777',
  navn: 'NORDBYGG AS',
  organisasjonsform: { kode: 'AS', beskrivelse: 'Aksjeselskap' },
  antallAnsatte: 4,
  harRegistrertAntallAnsatte: true,
  forretningsadresse: {
    postnummer: '8006',
    poststed: 'BODØ',
    adresse: ['Storgata 1'],
  },
};

function names(view) {
  return view.employees.map((row) => row.name);
}

function throwsMessage(fn) {
  try {
    fn();
  } catch (error) {
    return error.message;
  }
  return '';
}

test('flere boter: oppslag, flere bedrifter, invitasjon, e-post, deaktivering og sletting', () => {
  for (const uid of [ADA, BO, KARI, NILS, EVA, DAN, SIRI, LEIF, PER, LIV, SEEKER]) {
    assert.equal(uid.length, 28);
  }
  assert.equal(validNationalId(BO_ID), true);
  assert.equal(validNationalId(KARI_ID), true);
  assert.equal(validNationalId(NILS_ID), true);

  const world = createCompanyWorld();
  const ada = createBot(world, { uid: ADA, name: 'Ada' });
  const kari = createBot(world, { uid: KARI, name: 'Kari' });
  const seeker = createBot(world, { uid: SEEKER, name: 'Søker' });
  const dan = createBot(world, { uid: DAN, name: 'Dan' });
  ada.watch('*');
  seeker.stop();

  const before = publicSeekerView(world, '916538804');
  assert.equal(before.found, false);
  assert.equal(before.decision.kind, 'create');
  assert.equal(before.card, null);
  assert.deepEqual(before.employees, []);
  assert.equal(before.books, null);
  assert.deepEqual(before.wall, []);

  assert.throws(
    () => createCompanyFromLookup(world, { actorUid: ADA, raw: { navn: 'Uten nummer' } }),
    /company:invalid/,
  );

  const opened = createCompanyFromLookup(world, {
    actorUid: ADA,
    raw: consultRaw,
    roles: consultRoles,
  });
  assert.equal(opened.decision.kind, 'create');
  const consult = opened.company;
  assert.equal(consult.company.organisasjonsnummer, '916538804');
  assert.equal(opened.card.ansatte, 19);
  assert.equal(opened.card.forretning.poststed, 'SANDNES');
  assert.equal(world.companies.length, 1);
  assert.ok(ada.events.some((event) => event.kind === 'created' && event.companyId === consult.id));

  const again = createCompanyFromLookup(world, { actorUid: DAN, raw: consultRaw, roles: consultRoles });
  assert.equal(again.decision.kind, 'join');
  assert.equal(again.company.id, consult.id);
  assert.equal(world.companies.length, 1);

  const seekerConsult = publicSeekerView(world, '916 538 804');
  assert.equal(seekerConsult.found, true);
  assert.equal(seekerConsult.workspaceLive, true);
  assert.equal(seekerConsult.card.navn, 'CONSULT1 AS');
  assert.equal(seekerConsult.card.ansatte, 19);
  assert.equal(seekerConsult.card.hjemmeside, 'www.consult1.no');
  assert.deepEqual(seekerConsult.roles.map((row) => row.navn), ['Torbjørn Øgreid']);
  assert.deepEqual(seekerConsult.employees, []);
  assert.deepEqual(seekerConsult.nationalIds, []);
  assert.equal(seekerConsult.books, null);
  assert.equal(seekerConsult.hr, null);
  assert.deepEqual(seekerConsult.wall, []);
  assert.equal(seekerConsult.decision.kind, 'join');
  assert.equal(seekerConsult.decision.companyName, 'CONSULT1 AS');
  assert.equal(memberView(world, consult.id, SEEKER).inside, false);

  const listedUnits = shapePublicUnits({
    _embedded: {
      underenheter: [
        { organisasjonsnummer: '916570783', navn: 'CONSULT1 AS', beliggenhetsadresse: { adresse: ['Svanholmen 7'], poststed: 'SANDNES' } },
        { organisasjonsnummer: '111111111', navn: 'Nedlagt', nedleggelsesdato: '2020-01-01' },
      ],
    },
  });
  assert.equal(listedUnits.length, 1);
  assert.equal(publicUnitsNotRegistered(listedUnits, []).length, 1);
  const under = createUnderenhet(world, { actorUid: ADA, parent: consult, raw: underRaw });
  assert.equal(under.company.kind, 'underenhet');
  assert.equal(under.company.organisasjonsformKode, 'BEDR');
  assert.equal(publicUnitsNotRegistered(listedUnits, [{
    kind: 'underenhet',
    name: 'CONSULT1 AS',
    organisasjonsnummer: '916570783',
  }]).length, 0);
  assert.deepEqual(switcherFor(world, ADA).map((row) => row.id), [consult.id]);

  const nordOpen = createCompanyFromLookup(world, { actorUid: DAN, raw: nordRaw });
  assert.equal(nordOpen.decision.kind, 'create');
  const nord = nordOpen.company;
  const manual = createManualWorkspace(world, {
    actorUid: ADA,
    name: 'Ada Konsulent',
    address: 'Svanholmen 7',
  });
  assert.equal(manual.company.organisasjonsnummer, '');
  assert.equal(manual.company.manual, true);
  assert.throws(
    () => createManualWorkspace(world, { actorUid: ADA, name: '   ' }),
    /Bedriftsnavn må fylles ut/,
  );

  const adaSwitcher = switcherFor(world, ADA).map((row) => row.name).sort();
  assert.deepEqual(adaSwitcher, ['Ada Konsulent', 'CONSULT1 AS']);
  assert.equal(segmentsFor(world, ADA).find((row) => row.id === 'company').groupId, null);
  assert.deepEqual(switcherFor(world, DAN).map((row) => row.name), ['NORDBYGG AS']);
  assert.equal(segmentsFor(world, DAN).find((row) => row.id === 'company').groupId, nord.id);
  assert.equal(publicSeekerView(world, '999888777').card.navn, 'NORDBYGG AS');
  assert.equal(publicSeekerView(world, '999888777').card.forretning.poststed, 'BODØ');
  assert.equal(memberView(world, consult.id, DAN).inside, false);
  assert.equal(memberView(world, nord.id, ADA).inside, false);
  assert.equal(publicSeekerView(world, '916570783').card.kind, 'underenhet');

  const bo = employ(world, {
    companyId: consult.id,
    uid: BO,
    firstName: 'Bo',
    lastName: 'Berg',
    email: 'bo@example.com',
    accessLevel: 'ansatt',
    nationalId: BO_ID,
  });
  const kariEmployee = employ(world, {
    companyId: consult.id,
    uid: KARI,
    firstName: 'Kari',
    lastName: 'Kran',
    email: 'kari@example.com',
    accessLevel: 'innleie_ekstern',
    nationalId: KARI_ID,
  });
  const nils = employ(world, {
    companyId: consult.id,
    uid: NILS,
    firstName: 'Nils',
    lastName: 'Nilsen',
    email: 'nils@example.com',
    accessLevel: 'regnskap_ekstern',
    nationalId: NILS_ID,
  });
  const siri = employ(world, {
    companyId: consult.id,
    uid: SIRI,
    firstName: 'Siri',
    lastName: 'Sørensen',
    email: 'siri@example.com',
    accessLevel: 'avdelingsleder',
  });
  const leif = employ(world, {
    companyId: consult.id,
    uid: LEIF,
    firstName: 'Leif',
    lastName: 'Larsen',
    email: 'leif@example.com',
    accessLevel: 'leder',
  });

  const adaView = memberView(world, consult.id, ADA);
  assert.equal(adaView.inside, true);
  assert.equal(adaView.levelId, 'administrator');
  assert.equal(adaView.canPublish, true);
  assert.equal(adaView.settings, true);
  assert.equal(adaView.units, true);
  assert.equal(adaView.books.revenue, 50613141);
  assert.ok(adaView.tabs.includes('ansatte'));
  assert.ok(adaView.tabs.includes('hr'));
  assert.ok(adaView.tabs.includes('okonomi'));
  assert.deepEqual(names(adaView), ['Bo Berg', 'Kari Kran', 'Leif Larsen', 'Nils Nilsen', 'Siri Sørensen']);
  assert.ok(adaView.nationalIds.includes(BO_ID));
  assert.ok(adaView.nationalIds.includes(KARI_ID));
  assert.equal(names(adaView).includes('Ada'), false);

  const boView = memberView(world, consult.id, BO);
  assert.equal(boView.levelId, 'ansatt');
  assert.equal(boView.books, null);
  assert.equal(boView.canPublish, false);
  assert.equal(boView.settings, false);
  assert.equal(boView.units, true);
  assert.ok(boView.tabs.includes('ansatte'));
  assert.equal(boView.tabs.includes('hr'), false);
  assert.equal(boView.tabs.includes('okonomi'), false);
  const boSelf = boView.employees.find((row) => row.name === 'Bo Berg');
  const boSeesKari = boView.employees.find((row) => row.name === 'Kari Kran');
  assert.equal(boSelf.nationalId, BO_ID);
  assert.equal(boSeesKari.nationalId, '020292 •••••');
  assert.equal(boView.employees.find((row) => row.name === 'Nils Nilsen').nationalId, '150585 •••••');

  const kariView = memberView(world, consult.id, KARI);
  assert.equal(kariView.levelId, 'innleie_ekstern');
  // Innleide har Tildelte prosjekt og ser Prosjekt med egne prosjekter.
  assert.deepEqual(kariView.tabs, ['selskap', 'projects', 'arbeid', 'utstyr']);
  assert.deepEqual(kariView.employees, []);
  assert.equal(kariView.books, null);
  assert.equal(kariView.settings, false);
  assert.equal(kariView.units, false);
  assert.equal(kariView.canPublish, false);

  const nilsView = memberView(world, consult.id, NILS);
  assert.equal(nilsView.levelId, 'regnskap_ekstern');
  assert.deepEqual(nilsView.employees, []);
  assert.equal(nilsView.books.revenue, 50613141);
  assert.ok(nilsView.tabs.includes('okonomi'));
  assert.equal(nilsView.tabs.includes('ansatte'), false);
  assert.equal(nilsView.tabs.includes('hr'), false);

  const leifView = memberView(world, consult.id, LEIF);
  assert.equal(leifView.levelId, 'leder');
  assert.equal(leifView.settings, true);
  assert.equal(leifView.canPublish, false);
  assert.equal(leifView.books.revenue, 50613141);
  assert.ok(leifView.tabs.includes('hr'));

  const siriView = memberView(world, consult.id, SIRI);
  assert.equal(siriView.canPublish, false);
  assert.equal(siriView.books, null);
  assert.ok(siriView.tabs.includes('ansatte'));
  assert.ok(siriView.tabs.includes('hr'));

  addHr(world, consult.id, 'memos', {
    id: 'memo-hidden',
    employeeId: bo.id,
    title: 'Internt notat',
    body: 'Lønnssamtale holdes hemmelig',
    employeeVisible: false,
  });
  addHr(world, consult.id, 'salaries', {
    id: 'sal-open',
    employeeId: bo.id,
    annualAmount: 640000,
    employeeVisible: true,
  });
  addHr(world, consult.id, 'salaries', {
    id: 'sal-hidden',
    employeeId: bo.id,
    annualAmount: 990000,
    employeeVisible: false,
  });
  const boHr = memberView(world, consult.id, BO).hr;
  assert.deepEqual(boHr.memos, []);
  assert.deepEqual(boHr.salaries.map((row) => row.annualAmount), [640000]);
  const adaHr = memberView(world, consult.id, ADA).hr;
  assert.equal(adaHr.memos.length, 1);
  assert.deepEqual(adaHr.salaries.map((row) => row.annualAmount).sort(), [640000, 990000]);
  assert.deepEqual(memberView(world, consult.id, NILS).hr.salaries, []);
  assert.equal(memberView(world, consult.id, NILS).books.revenue, 50613141);
  assert.equal(publicSeekerView(world, '916538804').card.ansatte, 19);
  assert.deepEqual(publicSeekerView(world, '916538804').employees, []);

  kari.watch(consult.id);
  dan.watch(nord.id);
  const wall = publishWall(world, {
    companyId: consult.id,
    authorUid: ADA,
    body: 'Ny kontrakt i Sandnes',
  });
  assert.equal(wall.body, 'Ny kontrakt i Sandnes');
  assert.equal(
    throwsMessage(() => publishWall(world, { companyId: consult.id, authorUid: KARI, body: 'Fra innleid' })),
    'Du kan ikke publisere på veggen.',
  );
  assert.equal(
    throwsMessage(() => publishWall(world, { companyId: consult.id, authorUid: LEIF, body: 'Fra leder' })),
    'Du kan ikke publisere på veggen.',
  );
  assert.deepEqual(memberView(world, consult.id, KARI).wall, ['Ny kontrakt i Sandnes']);
  assert.deepEqual(publicSeekerView(world, '916538804').wall, []);
  assert.ok(kari.events.some((event) => event.kind === 'wall' && event.companyId === consult.id));
  assert.equal(seeker.events.length, 0);
  assert.equal(dan.events.some((event) => event.companyId === consult.id), false);

  assert.equal(groupInviteCopy('organization', 'CONSULT1 AS').title, 'Bedriftsinvitasjon');
  assert.equal(inviteDeliveryError('cannot-invite-self'), 'Du kan ikke invitere deg selv.');
  assert.equal(inviteDeliveryError('already-member'), 'Personen er allerede med i bedriften.');
  assert.equal(inviteDeliveryError('contact-required'), 'E-post mangler.');

  const badEmail = queueMember(world, {
    companyId: consult.id,
    actorUid: ADA,
    firstName: 'Eva',
    lastName: 'Test',
    email: 'ikke-en-epost',
    accessLevel: 'ansatt',
  });
  assert.equal(badEmail.error, 'E-post mangler eller er ugyldig.');
  const noLevel = queueMember(world, {
    companyId: consult.id,
    actorUid: ADA,
    firstName: 'Eva',
    lastName: 'Test',
    email: 'eva@example.com',
    accessLevel: '',
  });
  assert.equal(noLevel.error, 'Velg tilgangsnivå før invitasjon.');
  assert.equal(
    throwsMessage(() => queueMember(world, {
      companyId: consult.id,
      actorUid: BO,
      firstName: 'Eva',
      lastName: 'Test',
      email: 'eva@example.com',
      accessLevel: 'ansatt',
    })),
    'Bare administrator kan sende invitasjonen.',
  );
  assert.equal(
    throwsMessage(() => queueMember(world, {
      companyId: consult.id,
      actorUid: NILS,
      firstName: 'Eva',
      lastName: 'Test',
      email: 'eva@example.com',
      accessLevel: 'ansatt',
    })),
    'Bare administrator kan sende invitasjonen.',
  );

  const queued = queueMember(world, {
    companyId: consult.id,
    actorUid: ADA,
    firstName: 'Eva',
    lastName: '<script>',
    email: 'Eva@Example.com',
    accessLevel: 'ansatt',
  });
  assert.equal(queued.ok, true);
  assert.equal(queued.employee.invite.status, 'queued');
  assert.equal(queued.employee.invite.email, 'eva@example.com');
  assert.deepEqual(awaiting(consult), ['eva@example.com']);
  const earlyClaim = claimInvite(world, { companyId: consult.id, uid: EVA, email: 'eva@example.com' });
  assert.equal(earlyClaim.skipped, true);
  const mailBeforeFail = world.mail.length;
  const failed = failInvite(world, { companyId: consult.id, employeeId: queued.employee.id });
  assert.equal(failed.invite.status, 'queued');
  assert.equal(failed.invite.error, 'Kunne ikke sende invitasjon');
  assert.equal(world.mail.length, mailBeforeFail);
  assert.equal(claimInvite(world, { companyId: consult.id, uid: EVA, email: 'eva@example.com' }).skipped, true);

  const dropped = dropQueued(world, { companyId: consult.id, employeeId: queued.employee.id });
  assert.equal(dropped.ok, true);
  assert.deepEqual(awaiting(consult), []);
  const requeued = queueEmployeeInvite(dropped.employee, { accessLevel: 'ansatt' });
  assert.equal(requeued.ok, true);
  consult.employees = consult.employees.map((row) => (
    row.id === requeued.employee.id ? requeued.employee : row
  ));

  const sent = deliverInvite(world, {
    companyId: consult.id,
    actorUid: ADA,
    employeeId: queued.employee.id,
    existingUser: false,
  });
  assert.equal(sent.ok, true);
  assert.equal(sent.employee.invite.status, 'sent');
  assert.match(sent.mail.subject, /^Invitasjon til bedriften CONSULT1 AS på ProTop$/);
  assert.match(sent.mail.text, /Du er invitert inn i bedriften «CONSULT1 AS» på ProTop/);
  assert.match(sent.mail.text, /Opprett konto her/);
  assert.match(sent.mail.text, /Du blir ikke med i bedriften før du har godtatt/);
  assert.match(sent.mail.html, /Opprett konto og svar på invitasjonen/);
  assert.match(sent.mail.html, /Hei Eva &lt;script&gt;/);
  assert.equal(sent.mail.html.includes('<script>'), false);
  assert.match(sent.mail.text, /https:\/\/www\.protop\.no\/register\?email=eva%40example\.com&familyId=/);
  assert.equal(sent.mail.text.includes('NORDBYGG'), false);
  assert.doesNotMatch(sent.mail.text, OLD_BRAND_PATTERN);
  assert.match(sent.mail.text, /ProTop/);
  assert.equal(dropQueued(world, { companyId: consult.id, employeeId: queued.employee.id }).ok, false);

  const claimed = claimInvite(world, { companyId: consult.id, uid: EVA, email: 'eva@example.com' });
  assert.equal(claimed.ok, true);
  assert.equal(claimed.already, false);
  assert.equal(claimed.accessLevel, 'ansatt');
  assert.equal(memberView(world, consult.id, EVA).inside, true);
  assert.equal(memberView(world, consult.id, EVA).levelId, 'ansatt');
  assert.equal(claimInvite(world, { companyId: consult.id, uid: EVA, email: 'eva@example.com' }).already, true);
  assert.equal(
    claimInvite(world, { companyId: consult.id, uid: PER, email: 'eva@example.com' }).error,
    'Medarbeideren er knyttet til en annen bruker.',
  );

  const perQueued = queueMember(world, {
    companyId: consult.id,
    actorUid: SIRI,
    firstName: 'Per',
    lastName: 'Eksisterende',
    email: 'per@example.com',
    accessLevel: 'ansatt',
  });
  assert.equal(perQueued.ok, true);
  const perMail = deliverInvite(world, {
    companyId: consult.id,
    actorUid: LEIF,
    employeeId: perQueued.employee.id,
    existingUser: true,
  });
  assert.match(perMail.mail.subject, /^Invitasjon til bedriften CONSULT1 AS på ProTop$/);
  assert.match(perMail.mail.html, /Godta eller avslå invitasjonen/);
  assert.match(perMail.mail.text, /Du blir ikke med i bedriften før du godtar invitasjonen/);
  assert.match(perMail.mail.text, /Du har allerede en ProTop-konto/);
  setMemberStatus(world, { companyId: consult.id, employeeId: perQueued.employee.id, status: 'inactive' });
  assert.equal(
    claimInvite(world, { companyId: consult.id, uid: PER, email: 'per@example.com' }).error,
    'Ansettelsen er ikke aktiv.',
  );
  assert.equal(
    queueEmployeeInvite(consult.employees.find((row) => row.id === perQueued.employee.id)).error,
    'Medarbeideren er deaktivert.',
  );

  const evaRow = setMemberStatus(world, { companyId: consult.id, employeeId: queued.employee.id, status: 'inactive' });
  assert.equal(evaRow.company.canLogin, false);
  assert.equal(evaRow.company.status, 'inactive');
  const evaLocked = memberView(world, consult.id, EVA);
  assert.equal(evaLocked.inside, true);
  assert.deepEqual(evaLocked.tabs, []);
  assert.equal(evaLocked.books, null);
  assert.deepEqual(evaLocked.wall, []);
  assert.equal(names(memberView(world, consult.id, BO)).includes('Eva <script>'), false);
  assert.equal(employeeShowsInSection(evaRow, 'company'), true);
  const reactivated = setMemberStatus(world, { companyId: consult.id, employeeId: evaRow.id, status: 'active' });
  assert.equal(reactivated.company.status, 'active');
  assert.equal(reactivated.company.canLogin, false);

  const removed = removeMember(world, { companyId: consult.id, employeeId: evaRow.id });
  assert.equal(isDeletedEmployee(removed), true);
  assert.equal(removed.company.canLogin, false);
  assert.equal(employeeShowsInSection(removed, 'company'), false);
  assert.equal(consult.members.includes(EVA), false);
  assert.equal(memberView(world, consult.id, EVA).inside, false);
  assert.equal(names(memberView(world, consult.id, ADA)).includes('Eva <script>'), false);
  assert.equal(
    queueEmployeeInvite(removed).error,
    'Medarbeideren ligger i papirkurven.',
  );
  assert.equal(
    claimInvite(world, { companyId: consult.id, uid: EVA, email: 'eva@example.com' }).already,
    true,
  );

  const liv = employ(world, {
    companyId: nord.id,
    uid: LIV,
    firstName: 'Liv',
    lastName: 'Lien',
    email: 'liv@example.com',
    accessLevel: 'ansatt',
  });
  assert.equal(names(memberView(world, consult.id, BO)).includes('Liv Lien'), false);
  assert.equal(memberView(world, nord.id, BO).inside, false);
  employ(world, {
    companyId: nord.id,
    uid: BO,
    firstName: 'Bo',
    lastName: 'Berg',
    email: 'bo@example.com',
    accessLevel: 'ansatt',
    nationalId: BO_ID,
  });
  const boNord = memberView(world, nord.id, BO);
  assert.equal(boNord.levelId, 'ansatt');
  assert.deepEqual(names(boNord), ['Bo Berg', 'Liv Lien']);
  assert.equal(names(memberView(world, consult.id, BO)).includes('Liv Lien'), false);
  assert.equal(names(memberView(world, nord.id, BO)).includes(kariEmployee.person.firstName + ' Kran'), false);
  assert.equal(memberView(world, consult.id, BO).levelId, 'ansatt');
  assert.deepEqual(switcherFor(world, BO).map((row) => row.name).sort(), ['CONSULT1 AS', 'NORDBYGG AS']);
  assert.equal(liv.company.accessRole, 'Ansatt');

  const nordMail = deliverInvite(world, {
    companyId: nord.id,
    actorUid: DAN,
    employeeId: queueMember(world, {
      companyId: nord.id,
      actorUid: DAN,
      firstName: 'Otto',
      lastName: 'Olsen',
      email: 'otto@example.com',
      accessLevel: 'ansatt',
    }).employee.id,
  });
  assert.match(nordMail.mail.text, /NORDBYGG AS/);
  assert.equal(nordMail.mail.text.includes('CONSULT1'), false);
  assert.ok(world.mail.filter((row) => row.companyId === consult.id).every((row) => !row.text.includes('NORDBYGG')));
  assert.ok(world.mail.filter((row) => row.companyId === nord.id).every((row) => !row.text.includes('CONSULT1')));

  deactivateWorkspace(world, consult.id);
  assert.equal(memberView(world, consult.id, ADA).inside, false);
  assert.equal(memberView(world, consult.id, BO).inside, false);
  assert.equal(memberView(world, consult.id, KARI).inside, false);
  assert.equal(publicSeekerView(world, '916538804').workspaceLive, false);
  assert.equal(publicSeekerView(world, '916538804').card.navn, 'CONSULT1 AS');
  assert.equal(publicSeekerView(world, '916538804').decision.kind, 'join');
  assert.equal(switcherFor(world, ADA).some((row) => row.id === consult.id), false);
  assert.equal(memberView(world, nord.id, DAN).inside, true);
  assert.equal(memberView(world, nord.id, BO).inside, true);
  const blocked = createCompanyFromLookup(world, { actorUid: SEEKER, raw: consultRaw });
  assert.equal(blocked.decision.kind, 'join');
  assert.equal(blocked.company.id, consult.id);

  reactivateWorkspace(world, consult.id);
  assert.equal(memberView(world, consult.id, ADA).inside, true);
  assert.equal(memberView(world, consult.id, BO).books, null);
  assert.equal(publicSeekerView(world, '916538804').workspaceLive, true);
  assert.ok(switcherFor(world, ADA).some((row) => row.id === consult.id));

  deleteWorkspace(world, consult.id);
  assert.equal(memberView(world, consult.id, ADA).inside, false);
  assert.equal(memberView(world, consult.id, LEIF).inside, false);
  assert.equal(publicSeekerView(world, '916538804').found, true);
  assert.equal(publicSeekerView(world, '916538804').workspaceLive, false);
  assert.equal(publicSeekerView(world, '916538804').card.ansatte, 19);
  assert.equal(publicSeekerView(world, '916538804').decision.kind, 'join');
  assert.deepEqual(publicSeekerView(world, '916538804').employees, []);
  const stillJoin = createCompanyFromLookup(world, { actorUid: SEEKER, raw: consultRaw });
  assert.equal(stillJoin.decision.kind, 'join');
  assert.equal(stillJoin.company.id, consult.id);
  assert.equal(world.companies.filter((row) => row.company.organisasjonsnummer === '916538804').length, 1);
  assert.deepEqual(
    switcherFor(world, ADA).map((row) => row.name).sort(),
    ['Ada Konsulent', 'CONSULT1 AS'],
  );
  assert.equal(switcherFor(world, ADA).find((row) => row.name === 'CONSULT1 AS').id, under.id);
  assert.equal(memberView(world, nord.id, DAN).inside, true);
  assert.equal(memberView(world, manual.id, ADA).inside, true);
  assert.equal(publicSeekerView(world, '999888777').workspaceLive, true);

  const unlinked = resolveActorAccess({
    policy: consult.policy,
    employees: consult.employees,
    uid: SEEKER,
  });
  assert.equal(unlinked.levelId, 'ansatt');
  assert.equal(unlinked.employee, null);
  assert.equal(publicSeekerView(world, '916538804').employees.length, 0);
});
