import assert from 'node:assert/strict';
import { companyComplianceOverview, replaceEmployeeCompliance } from './compliance.js';
import {
  HIRED_CATALOG,
  hiredCatalogFor,
  hiredCells,
  hiredItemsFor,
  hiredRequirementLabel,
  hiredSummary,
  hiredType,
  isHiredRequired,
  setHiredNote,
  setHiredStatus,
} from './hired.js';

const innleid = { id: 'i1', person: { firstName: 'Aina' }, company: { status: 'active', personnelKind: 'innleid' } };
const ekstern = { id: 'x1', person: { firstName: 'Rolf' }, company: { status: 'active', personnelKind: 'external' } };

{
  // Typer: bare «Innleid» er innleie fra bemanningsforetak.
  assert.equal(hiredType('Innleid'), 'innleid');
  assert.equal(hiredType('Ekstern'), 'ekstern');
  assert.equal(hiredType(''), 'ekstern');
  const ids = new Set(HIRED_CATALOG.map((row) => row.id));
  assert.equal(ids.size, HIRED_CATALOG.length, 'id-ene er unike');
  for (const row of HIRED_CATALOG) {
    assert.ok(row.id.startsWith('inn_'), `${row.id} skilles fra egne ansattes punkter`);
    assert.ok(['law', 'advice'].includes(row.level));
    assert.ok(row.hint && row.todo && row.short);
    for (const t of row.requiredFor) assert.ok(row.appliesTo.includes(t));
    if (row.level === 'advice') assert.deepEqual(row.requiredFor, []);
  }
}

{
  // Innleid: grunnlag, registrert foretak og likebehandling er lovkrav. Databehandleravtale gjelder ikke.
  const ids = hiredCatalogFor('innleid').map((row) => row.id);
  assert.ok(ids.includes('inn_legal_basis'));
  assert.ok(ids.includes('inn_agency_registered'));
  assert.ok(ids.includes('inn_equal_terms'));
  assert.ok(ids.includes('inn_wage_check'));
  assert.equal(ids.includes('inn_processor_agreement'), false);
  // Ekstern: ikke bemanningsforetakets punkter.
  const ext = hiredCatalogFor('ekstern').map((row) => row.id);
  assert.equal(ext.includes('inn_legal_basis'), false);
  assert.equal(ext.includes('inn_equal_terms'), false);
  assert.ok(ext.includes('inn_processor_agreement'));
  assert.ok(ext.includes('inn_privacy_notice'));

  assert.equal(isHiredRequired('inn_legal_basis', 'innleid'), true);
  assert.equal(isHiredRequired('inn_safety_intro', 'innleid'), true);
  assert.equal(isHiredRequired('inn_safety_intro', 'ekstern'), false);
  assert.equal(isHiredRequired('inn_hms_card', 'innleid', { hmsRequired: false }), false);
  assert.equal(isHiredRequired('inn_supplier_contract', 'innleid'), false);
  assert.equal(hiredRequirementLabel('inn_supplier_contract', 'innleid'), 'anbefalt');
  assert.equal(hiredRequirementLabel('inn_safety_intro', 'ekstern'), 'ved behov');
  assert.equal(hiredRequirementLabel('inn_legal_basis', 'innleid'), 'påkrevd');
}

{
  // Status lagres i hr.compliance og påvirker ikke egne ansattes Lovpålagt.
  let compliance = [];
  compliance = setHiredStatus(compliance, 'i1', 'innleid', 'inn_legal_basis', 'ok', { today: '2026-11-03' });
  compliance = setHiredStatus(compliance, 'i1', 'innleid', 'inn_agency_registered', 'na');
  compliance = setHiredNote(compliance, 'i1', 'innleid', 'inn_equal_terms', '  Sendt 1.11.  ');
  const items = hiredItemsFor(compliance, 'i1', 'innleid', { today: '2026-11-03' });
  const by = Object.fromEntries(items.map((row) => [row.catalogId, row]));
  assert.equal(by.inn_legal_basis.status, 'ok');
  assert.equal(by.inn_legal_basis.completedAt, '2026-11-03');
  assert.equal(by.inn_agency_registered.status, 'na');
  assert.equal(by.inn_equal_terms.note, 'Sendt 1.11.');
  assert.equal(by.inn_hms_card.status, 'missing', 'uten kort mangler HMS-kortet');

  // HMS-kortet kan ikke krysses av som OK, det følger kortet.
  assert.equal(setHiredStatus(compliance, 'i1', 'innleid', 'inn_hms_card', 'ok'), compliance);
  const withCard = hiredItemsFor(compliance, 'i1', 'innleid', {
    hmsCards: [{ employeeId: 'i1', number: 'HMS123', validTo: '2027-06-01' }],
    today: '2026-11-03',
  });
  assert.equal(withCard.find((row) => row.catalogId === 'inn_hms_card').status, 'ok');

  const summary = hiredSummary(items, 'innleid');
  // Påkrevd for innleid: grunnlag, likebehandling, HMS-kort, HMS-introduksjon, arbeidstid, personvern
  // (registrert foretak er «Ikke aktuelt»).
  assert.equal(summary.lawTotal, 6);
  assert.equal(summary.lawOk, 1);
  assert.equal(summary.lawMissing, 5);
  assert.equal(summary.adviceDone, 0);
  assert.equal(summary.adviceTotal, 3);

  // Egne ansattes sjekkliste ser ikke innleiepunktene, og lar dem stå når den skrives.
  const overview = companyComplianceOverview([innleid], compliance, { applyEvidence: false })[0];
  assert.equal(overview.gapIds.some((id) => id.startsWith('inn_')), false);
  const kept = replaceEmployeeCompliance(compliance, 'i1', []);
  assert.equal(kept.filter((row) => row.catalogId.startsWith('inn_')).length, compliance.length);
  // Og innleiepunktene lar egne ansattes rader stå.
  const mixed = [{ id: 'hms_card_i1', catalogId: 'hms_card', employeeId: 'i1', status: 'na' }, ...compliance];
  const next = setHiredStatus(mixed, 'i1', 'innleid', 'inn_wage_check', 'ok');
  assert.ok(next.some((row) => row.catalogId === 'hms_card'));
}

{
  // Celletekster for listen.
  const cells = hiredCells(innleid, 'Innleid', { compliance: [], hmsCards: [] });
  assert.equal(cells.type, 'innleid');
  assert.equal(cells.lawWarn, true);
  assert.match(cells.law, /^Grunnlag, registrert foretak, likebehandling/);
  assert.equal(cells.advice, '0 av 3');
  const ext = hiredCells(ekstern, 'Ekstern', { compliance: [], hmsCards: [], hmsRequired: true });
  assert.equal(ext.law, 'Personvern');
  assert.equal(ext.advice, '0 av 1');
}

console.log('hired ok');
