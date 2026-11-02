import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeRange, inRange, nextInRange, normalizeSeries, seriesConflict, setActiveNumberSeries, suggestSeries,
} from './numberSeries.js';
import { nextCustomerNumber } from '../anbud/customers.js';
import { buildLinkRequest, konsernChildren, linkView, respondToLink, roleSentence } from './model.js';

test('serier: forslag, overlapp og neste nummer', () => {
  const s = suggestSeries(['mor', 'datter']);
  assert.deepEqual(s.mor.project, { from: 10000, to: 19999 });
  assert.deepEqual(s.datter.customer, { from: 20000, to: 29999 });
  assert.equal(seriesConflict(s, { mor: 'Mor', datter: 'Datter' }), '');
  const bad = { mor: { project: { from: 1, to: 500 } }, datter: { project: { from: 400, to: 900 } } };
  assert.match(seriesConflict(bad, { mor: 'Mor', datter: 'Datter' }), /overlapper/);
  assert.match(seriesConflict({ mor: { project: { from: 10, to: 5 } } }, { mor: 'Mor' }), /mindre enn/);
  assert.deepEqual(nextInRange(['24017', '20005', '1'], { from: 20000, to: 29999 }), { number: '24018', full: false });
  assert.deepEqual(nextInRange([], { from: 20000, to: 29999 }), { number: '20000', full: false });
  assert.equal(nextInRange(['29999'], { from: 20000, to: 29999 }).full, true);
  assert.equal(inRange('25000', { from: 20000, to: 29999 }), true);
  assert.equal(inRange('5', { from: 20000, to: 29999 }), false);
  assert.deepEqual(normalizeSeries({ project: { from: '100', to: '199' }, customer: { from: 'x' } }), { project: { from: 100, to: 199 } });
});

test('kundenummer følger selskapets serie', () => {
  const customers = [{ customerNumber: '5' }, { customerNumber: '20003' }];
  assert.equal(nextCustomerNumber(customers, { from: 20000, to: 29999 }), '20004');
  assert.equal(nextCustomerNumber(customers, null), '20004', 'uten serie: høyeste + 1 som før');
  assert.equal(nextCustomerNumber([{ customerNumber: '5' }], null), '6');
  setActiveNumberSeries({ customer: { from: 30000, to: 39999 } });
  assert.deepEqual(activeRange('customer'), { from: 30000, to: 39999 });
  assert.equal(nextCustomerNumber(customers), '30000');
  setActiveNumberSeries(null);
  assert.equal(activeRange('customer'), null);
});

test('samarbeidspartner: likestilt, ikke i konsernet', () => {
  const made = buildLinkRequest({ id: 'icl-p', requester: { id: 'a', name: 'Bygg AS' }, target: { id: 'b', name: 'Rør AS' }, role: 'partner' });
  assert.equal(made.link.relation, 'partner');
  const view = linkView(made.link, 'b');
  assert.equal(view.partnerRoleLabel, 'Samarbeidspartner');
  assert.equal(roleSentence(view), 'som samarbeidspartner');
  const active = respondToLink(made.link, { companyId: 'b', accept: true }).link;
  assert.deepEqual(konsernChildren([active], 'a'), [], 'partnere er ikke datterselskaper');
  const konsern = respondToLink(buildLinkRequest({ id: 'icl-k', requester: { id: 'a', name: 'Bygg AS' }, target: { id: 'c', name: 'Datter AS' }, role: 'child' }).link, { companyId: 'c', accept: true }).link;
  assert.deepEqual(konsernChildren([active, konsern], 'a').map((row) => row.id), ['c']);
  assert.equal(linkView(konsern, 'c').partnerRoleLabel, 'Morselskap');
});
