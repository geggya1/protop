import assert from 'node:assert/strict';
import {
  normalizePricingModel,
  pricingModelLabel,
  scrubProjectFields,
  scrubProjectState,
  normalizePricingSettings,
  feeEstimateFromSettings,
} from './projectFields.js';
import {
  createProject,
  emptyProjectState,
  normalizeProjectState,
  attachOfferDocuments,
  addProjectAgreementDocuments,
} from './engine.js';

assert.equal(normalizePricingModel('notbillable'), 'not_billable');
assert.equal(normalizePricingModel('hourlyRate'), 'hourly');
assert.equal(normalizePricingModel('fixedPrice'), 'fixed');
assert.equal(pricingModelLabel('notbillable'), 'Ikke fakturerbar');

const scrubbed = scrubProjectFields({
  id: 'p1',
  name: 'Test',
  number: '1',
  pricingModel: 'notbillable',
  hoursPeriod: 120,
  billableHours: 80,
  inboxEmail: 'moment@example.com',
  customerTags: 'x',
  supplierLabel: 'Kunde',
  createdBy: 'Moment',
  feeEstimate: 1500,
});
assert.equal(scrubbed.pricingModel, 'not_billable');
assert.equal(scrubbed.hoursPeriod, null);
assert.equal(scrubbed.billableHours, null);
assert.equal(scrubbed.inboxEmail, null);
assert.equal(scrubbed.customerTags, null);
assert.equal(scrubbed.supplierLabel, null);
assert.equal(scrubbed.createdBy, null);

const settings = normalizePricingSettings({ hourlyRate: 1200 }, 'hourly');
assert.equal(settings.hourlyRate, 1200);
assert.equal(feeEstimateFromSettings('hourly', settings), 1200);

let state = emptyProjectState();
const created = createProject(state, {
  name: 'Leilighet',
  number: 'P-1',
  pricingModel: 'hourlyRate',
  pricingSettings: { hourlyRate: 950 },
  hoursPeriod: 40,
  inboxEmail: 'x@moment.team',
});
assert.equal(created.ok, true);
state = created.state;
const project = state.projects[0];
assert.equal(project.pricingModel, 'hourly');
assert.equal(project.feeEstimate, 950);
assert.equal(project.hoursPeriod, null);
assert.equal(project.inboxEmail, null);

const withDocs = addProjectAgreementDocuments(state, project.id, [
  { name: 'Avtale.pdf', url: 'https://example.com/a.pdf' },
]);
assert.equal(withDocs.ok, true);
assert.equal(withDocs.state.projects[0].agreementDocuments.length, 1);

const withOffer = attachOfferDocuments(withDocs.state, project.id, [
  { name: 'Tilbud.pdf', url: 'https://example.com/t.pdf', source: 'tilbud', sourceId: 'f1' },
]);
assert.equal(withOffer.ok, true);
assert.equal(withOffer.state.projects[0].offerDocuments.length, 1);

const normalized = normalizeProjectState({
  projects: [{
    id: 'legacy',
    name: 'Gammelt',
    number: '9',
    pricingModel: 'notbillable',
    hoursPeriod: 10,
    exportStatus: 'ok',
    createdBy: 'Moment import',
  }],
});
assert.equal(normalized.projects[0].pricingModel, 'not_billable');
assert.equal(normalized.projects[0].hoursPeriod, null);
assert.equal(normalized.projects[0].exportStatus, null);
assert.equal(normalized.projects[0].createdBy, null);

const scrubbedState = scrubProjectState({ projects: [{ id: 'a', hoursPeriod: 1, inboxEmail: 'm' }] });
assert.equal(scrubbedState.projects[0].hoursPeriod, null);
assert.equal(scrubbedState.projects[0].inboxEmail, null);

console.log('projectFields.test.mjs: ok');
