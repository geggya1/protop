import assert from 'node:assert/strict';
import {
  AML_CONTRACT_FIELDS,
  AML_REQUIRED_KEYS,
  AML_STANDARD_TEXTS,
  COMPLIANCE_CATALOG,
  MOVED_TO_ISO,
  amlContractCompleteness,
  amlFieldLabel,
  amlRequiredKeys,
  companyComplianceOverview,
  contractDueDate,
  probationIssues,
  withAmlStandardTexts,
  complianceSummary,
  ensureEmployeeCompliance,
  replaceEmployeeCompliance,
  syncComplianceFromEvidence,
} from './compliance.js';

// Bare det HR eier: arbeidsmiljøloven og personvern. Kompetanse og opplæring ligger i ISO.
assert.equal(COMPLIANCE_CATALOG.length, 6);
assert.ok(COMPLIANCE_CATALOG.every((row) => ['aml', 'gdpr'].includes(row.source)));
assert.ok(!COMPLIANCE_CATALOG.some((row) => MOVED_TO_ISO.some((moved) => moved.id === row.id)));
assert.ok(COMPLIANCE_CATALOG.some((row) => row.id === 'aml_written_contract' && row.required));

{
  const rows = ensureEmployeeCompliance([], 'e1');
  assert.equal(rows.length, COMPLIANCE_CATALOG.length);
  assert.ok(rows.every((row) => row.employeeId === 'e1'));
  assert.ok(rows.every((row) => row.status === 'missing'));
  const patched = rows.map((row, i) => (i < 3 ? { ...row, status: 'ok' } : row));
  const summary = complianceSummary(patched);
  assert.ok(summary.total >= 3);
  assert.equal(summary.ok, patched.filter((r) => {
    const cat = COMPLIANCE_CATALOG.find((c) => c.id === r.catalogId);
    return cat?.required && r.status === 'ok';
  }).length);
}

/** Avtale med alle punktene i AML § 14-6 slik den lyder fra 1.7.2024. */
const FULL_CONTRACT = withAmlStandardTexts({
  employerName: 'A AS, 916538804', employeeName: 'B', workplace: 'C', positionTitle: 'D',
  startDate: '2020-01-01', workPercent: '100', salaryAmount: '1', paySchedule: 'Den 15. hver måned til konto',
  workHours: '37,5 t per uke, 07–15', noticePeriod: '3 mnd', breakLength: '30 min', collectiveAgreement: 'Ingen',
});

{
  const full = amlContractCompleteness(FULL_CONTRACT);
  assert.equal(full.pct, 100, JSON.stringify(full.missing));
  assert.equal(full.total, AML_REQUIRED_KEYS.length);
  // De gamle ni punktene er ikke nok etter 1.7.2024.
  const old = amlContractCompleteness({
    employerName: 'A', employeeName: 'B', workplace: 'C', positionTitle: 'D',
    startDate: '2020-01-01', workPercent: '100', salaryAmount: '1',
    workHours: '37.5', noticePeriod: '1 mnd',
  });
  assert.ok(old.pct < 100);
  for (const key of ['terminationProcedure', 'overtimeTerms', 'competenceDevelopment', 'pensionInsurance', 'holidayTerms', 'breakLength', 'collectiveAgreement', 'paySchedule']) {
    assert.ok(old.missing.includes(key), key);
  }
  const empty = amlContractCompleteness({});
  assert.equal(empty.filled, 0);
  // Dokumenttittel alene skal ikke telle som stilling
  assert.equal(amlContractCompleteness({ title: 'Arbeidsavtale' }).filled, 0);
}

{
  // Midlertidig ansettelse krever varighet og grunnlag. Utleie krever innleievirksomhet.
  const temp = { ...FULL_CONTRACT, employmentType: 'Midlertidig' };
  assert.deepEqual(amlContractCompleteness(temp).missing, ['endDate', 'temporaryBasis']);
  assert.equal(amlContractCompleteness({ ...temp, endDate: '2020-12-31', temporaryBasis: 'Vikariat for Kari' }).pct, 100);
  assert.deepEqual(amlRequiredKeys({ employmentType: 'Utleid fra bemanningsforetak' }).slice(-1), ['hirerIdentity']);
  assert.ok(AML_CONTRACT_FIELDS.every((row) => row.label && 'aml' in row));
  assert.equal(AML_CONTRACT_FIELDS.find((row) => row.key === 'collectiveAgreement').aml, 'm');
  assert.equal(amlFieldLabel('terminationProcedure'), 'Framgangsmåte ved opphør: formkrav, oppsigelsesfrister og frister for søksmål');
}

{
  // Standardtekstene fyller bare tomme felt, og nevner søksmålsfristene og overtidstillegget.
  const filled = withAmlStandardTexts({ holidayTerms: 'Egen tekst' });
  assert.equal(filled.holidayTerms, 'Egen tekst');
  assert.match(filled.terminationProcedure, /åtte uker/);
  assert.match(filled.terminationProcedure, /§ 17-4/);
  assert.match(filled.overtimeTerms, /40 %/);
  assert.match(AML_STANDARD_TEXTS.holidayTerms, /25 virkedager/);
}

{
  // Prøvetid: høyst seks måneder, og ved midlertidig ansettelse høyst halve perioden.
  assert.deepEqual(probationIssues({ probationMonths: '6' }), []);
  assert.match(probationIssues({ probationMonths: '8' })[0], /seks måneder/);
  const temp = { employmentType: 'Midlertidig', startDate: '2026-01-01', endDate: '2026-06-30', probationMonths: '6' };
  assert.match(probationIssues(temp)[0], /halvparten/);
  assert.deepEqual(probationIssues({ ...temp, probationMonths: '3' }), []);
  assert.equal(contractDueDate('2026-10-27'), '2026-11-03');
  assert.equal(contractDueDate(''), '');
}

{
  // «Lovpålagt» blir ikke grønn før avtalen er komplett, selv om punktet var krysset av.
  const partial = { ...FULL_CONTRACT, employeeId: 'e1', status: 'active', startDate: '2026-10-01', pensionInsurance: '' };
  const stored = [{ catalogId: 'aml_contract_minimum', employeeId: 'e1', status: 'ok', note: 'AML-minimum dekket (9/9)' }];
  const synced = syncComplianceFromEvidence(stored, { employeeId: 'e1', contracts: [partial], today: '2026-10-27' });
  const row = synced.find((item) => item.catalogId === 'aml_contract_minimum' && item.employeeId === 'e1');
  assert.equal(row.status, 'overdue', 'mer enn sju dager etter tiltredelse');
  assert.equal(row.dueDate, '2026-10-08');
  const early = syncComplianceFromEvidence([], { employeeId: 'e1', contracts: [partial], today: '2026-10-05' });
  assert.equal(early.find((item) => item.catalogId === 'aml_contract_minimum').status, 'missing');
  const none = syncComplianceFromEvidence(stored, { employeeId: 'e1', contracts: [] });
  assert.equal(none.find((item) => item.catalogId === 'aml_contract_minimum').status, 'missing', 'uten avtale ingen grønn hake');
  const na = syncComplianceFromEvidence([{ catalogId: 'aml_contract_minimum', employeeId: 'e1', status: 'na' }], { employeeId: 'e1', contracts: [partial] });
  assert.equal(na.find((item) => item.catalogId === 'aml_contract_minimum').status, 'na');
  assert.equal(COMPLIANCE_CATALOG.find((item) => item.id === 'aml_contract_minimum').derived, 'contract');
}

{
  const contract = {
    ...FULL_CONTRACT,
    employeeId: 'e1',
    status: 'active',
    probationMonths: '6',
  };
  const synced = syncComplianceFromEvidence([], {
    employeeId: 'e1',
    contracts: [contract],
    reviews: [{ employeeId: 'e1', status: 'done' }],
  });
  const byId = Object.fromEntries(synced.map((row) => [row.catalogId, row]));
  assert.equal(byId.aml_written_contract.status, 'ok');
  assert.equal(byId.aml_contract_minimum.status, 'ok');
  assert.equal(byId.aml_probation_documented.status, 'ok');
  assert.equal(byId.aml_followup_dialogue.status, 'ok');
}

{
  const overview = companyComplianceOverview(
    [{ id: 'e1', company: { status: 'active' } }, { id: 'e2', company: { status: 'deleted' } }],
    [],
  );
  assert.equal(overview.length, 1);
  assert.ok(overview[0].missing > 0);
}

{
  const contract = {
    ...FULL_CONTRACT,
    employeeId: 'e1',
    status: 'active',
    probationMonths: '6',
  };
  const withEvidence = companyComplianceOverview(
    [{ id: 'e1', company: { status: 'active' } }],
    [],
    { contracts: [contract], reviews: [{ employeeId: 'e1', status: 'done' }], applyEvidence: true },
  );
  const withoutEvidence = companyComplianceOverview(
    [{ id: 'e1', company: { status: 'active' } }],
    [],
    { contracts: [contract], reviews: [{ employeeId: 'e1', status: 'done' }], applyEvidence: false },
  );
  assert.ok(withEvidence[0].missing < withoutEvidence[0].missing);
  assert.ok(withEvidence[0].ok > 0);
}

{
  // Punkter flyttet til ISO: lagrede rader blir stående når personens sjekkliste lagres.
  const stored = [
    { catalogId: 'ik_hms_intro', employeeId: 'e1', status: 'ok', note: 'Kurs 2024' },
    { catalogId: 'iso45001_ppe', employeeId: 'e1', status: 'ok', source: 'iso45001' },
    { catalogId: 'ik_hms_intro', employeeId: 'e2', status: 'ok' },
  ];
  const synced = syncComplianceFromEvidence(stored, { employeeId: 'e1' });
  assert.ok(synced.some((row) => row.catalogId === 'ik_hms_intro' && row.employeeId === 'e1' && row.note === 'Kurs 2024'));
  assert.ok(synced.some((row) => row.catalogId === 'ik_hms_intro' && row.employeeId === 'e2'));
  const rows = ensureEmployeeCompliance(stored, 'e1');
  assert.equal(rows.length, COMPLIANCE_CATALOG.length);
  assert.ok(!rows.some((row) => row.catalogId === 'ik_hms_intro'));
  // Verneutstyr hører nå til arbeidsmiljøloven, også for rader lagret med gammel kilde.
  assert.equal(rows.find((row) => row.catalogId === 'iso45001_ppe').source, 'aml');
  const replaced = replaceEmployeeCompliance(stored, 'e1', rows);
  assert.equal(replaced.filter((row) => row.catalogId === 'ik_hms_intro').length, 2);
  assert.equal(replaced.filter((row) => row.catalogId === 'iso45001_ppe').length, 1);
  assert.equal(replaced.filter((row) => row.employeeId === 'e1').length, COMPLIANCE_CATALOG.length + 1);
}

console.log('hr/compliance.test.mjs ok');
