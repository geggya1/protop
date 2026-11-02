import test from 'node:test';
import assert from 'node:assert/strict';
import {
  answerLinkSettings,
  linkIdFor,
  proposeLinkSettings,
  buildCloneProject,
  buildLinkRequest,
  cloneProjectId,
  diffCloneSales,
  endLink,
  ensurePartnerCustomer,
  externalEmployeeRecord,
  groupLinks,
  lendableEmployees,
  linkView,
  mirrorExpense,
  mirrorStatusText,
  mirrorAwaitingSupplier,
  mirrorId,
  mirrorSale,
  mirrorTimeEntry,
  normalizeLinkSettings,
  openLinkBetween,
  parseCloneProjectId,
  rentalQuantity,
  rentalSaleFromBooking,
  respondToLink,
  salesToMirror,
  settingsError,
  syncRentalSales,
  updateLinkSettings,
  withdrawLink,
} from './model.js';

const MOR = { id: 'famMor', name: 'Mor AS', orgnr: '911111111' };
const DATTER = { id: 'famDatter', name: 'Datter AS', orgnr: '922222222' };

function pendingFromMor(settings = {}) {
  const made = buildLinkRequest({ id: 'icl-1', requester: MOR, target: DATTER, role: 'child', uid: 'u1', settings, at: '2026-11-01T10:00:00Z' });
  assert.equal(made.ok, true);
  return made.link;
}

test('forespørsel: mor ber datter, datter må godkjenne', () => {
  const link = pendingFromMor();
  assert.equal(link.parent.id, MOR.id);
  assert.equal(link.child.id, DATTER.id);
  assert.equal(link.status, 'pending');
  assert.equal(linkView(link, MOR.id).outgoing, true);
  assert.equal(linkView(link, DATTER.id).incoming, true);
  assert.equal(linkView(link, DATTER.id).partnerRoleLabel, 'Morselskap');
  assert.equal(linkView(link, 'annen'), null);

  const own = respondToLink(link, { companyId: MOR.id, accept: true });
  assert.equal(own.ok, false, 'den som spør, kan ikke godkjenne selv');
  const yes = respondToLink(link, { companyId: DATTER.id, accept: true, uid: 'u2' });
  assert.equal(yes.ok, true);
  assert.equal(yes.link.status, 'active');
  assert.equal(respondToLink(yes.link, { companyId: DATTER.id, accept: true }).ok, false);
});

test('forespørsel begge veier: datter kan be mor', () => {
  const made = buildLinkRequest({ id: 'icl-2', requester: DATTER, target: MOR, role: 'parent' });
  assert.equal(made.link.parent.id, MOR.id);
  assert.equal(made.link.child.id, DATTER.id);
  assert.equal(linkView(made.link, MOR.id).incoming, true);
  assert.equal(buildLinkRequest({ requester: MOR, target: MOR }).ok, false);
});

test('avslag, tilbaketrekking, avslutning og innstillinger', () => {
  const link = pendingFromMor();
  assert.equal(respondToLink(link, { companyId: DATTER.id, accept: false }).link.status, 'declined');
  assert.equal(withdrawLink(link, { companyId: DATTER.id }).ok, false);
  assert.equal(withdrawLink(link, { companyId: MOR.id }).link.status, 'withdrawn');
  const active = respondToLink(link, { companyId: DATTER.id, accept: true }).link;
  const ended = endLink(active, { companyId: DATTER.id });
  assert.equal(ended.link.status, 'ended');
  assert.equal(updateLinkSettings(ended.link, { companyId: MOR.id, settings: {} }).ok, false);
  const fixedMissing = updateLinkSettings(active, { companyId: MOR.id, settings: { hours: { mode: 'fixed' } } });
  assert.equal(fixedMissing.ok, false);
  const fixed = updateLinkSettings(active, { companyId: MOR.id, settings: { hours: { mode: 'fixed', fixedRate: '850,5' } } });
  assert.equal(fixed.link.settings.hours.fixedRate, 850.5);
});

test('innstillinger normaliseres', () => {
  const s = normalizeLinkSettings({ hours: { discountPercent: '150' }, products: { discountPercent: '-3' }, invoiceDelivery: 'post' });
  assert.equal(s.hours.discountPercent, 100);
  assert.equal(s.products.discountPercent, 0);
  assert.equal(s.invoiceDelivery, 'ehf');
  assert.equal(settingsError({ hours: { mode: 'fixed', fixedRate: 0 } }), 'Fyll inn den faste timeprisen.');
});

test('gruppering og åpen avtale', () => {
  const pending = pendingFromMor();
  const active = { ...respondToLink(buildLinkRequest({ id: 'icl-9', requester: MOR, target: { id: 'x', name: 'X AS' } }).link, { companyId: 'x', accept: true }).link };
  const groups = groupLinks([pending, active], MOR.id);
  assert.equal(groups.outgoing.length, 1);
  assert.equal(groups.active.length, 1);
  assert.equal(groupLinks([pending], DATTER.id).incoming.length, 1);
  assert.ok(openLinkBetween([pending], DATTER.id, MOR.id));
  assert.equal(openLinkBetween([withdrawLink(pending, { companyId: MOR.id }).link], MOR.id, DATTER.id), null);
});

test('prosjektkopi-id kan leses tilbake', () => {
  const id = cloneProjectId('icl-abc-123', 'prjXYZ');
  assert.deepEqual(parseCloneProjectId(id), { linkId: 'icl-abc-123', ownerProjectId: 'prjXYZ' });
  // Ekte prosjekt-id fra createId har understrek (prj_lz1_ab12cd).
  const real = cloneProjectId(linkIdFor('famA', 'famB', 1700000000000), 'prj_lz1_ab12cd');
  assert.equal(parseCloneProjectId(real).ownerProjectId, 'prj_lz1_ab12cd');
  assert.equal(mirrorId('famA', 'tid_x_1'), 'ic_famA_tid_x_1');
  assert.equal(parseCloneProjectId('prj123'), null);
  assert.equal(mirrorId('famA', 'tid1'), 'ic_famA_tid1');
});

test('kopien har eierens nummer, eieren som kunde og avtalt pris', () => {
  const link = { ...pendingFromMor({ hours: { mode: 'discount', discountPercent: 15 }, products: { discountPercent: 10 }, rental: { discountPercent: 5 } }), status: 'active' };
  const ownerProject = { id: 'prjA', number: '24017', name: 'Skole', pricingSettings: { hourlyRate: 1200 }, phase: 'utførelse' };
  const clone = buildCloneProject({
    link, owner: MOR, ownerProject, customer: { id: 'cus-famMor', customerNumber: '10044' },
    projects: [{ id: 'prjB', number: '24017' }], at: '2026-11-02T08:00:00Z',
  });
  assert.equal(clone.id, cloneProjectId(link.id, 'prjA'));
  assert.equal(clone.number, '24017-IC', 'nummeret er brukt hos datter, så kopien får -IC');
  assert.equal(clone.customerId, 'cus-famMor');
  assert.equal(clone.client, 'Mor AS');
  assert.equal(clone.pricingSettings.hourlyRate, 1200);
  assert.equal(clone.invoiceSettings.discountHours, 15);
  assert.equal(clone.invoiceSettings.discountProducts, 10);
  assert.equal(clone.intercompany.ownerProjectNumber, '24017');
  assert.equal(clone.intercompany.rentalDiscountPercent, 5);

  const fixedLink = { ...link, settings: { hours: { mode: 'fixed', fixedRate: 900 } } };
  const fixedClone = buildCloneProject({ link: fixedLink, owner: MOR, ownerProject, existing: { ...clone, manager: 'Kari' } });
  assert.equal(fixedClone.pricingSettings.hourlyRate, 1200, 'en kopi som finnes, beholder sin egen pris');
  assert.equal(buildCloneProject({ link: fixedLink, owner: MOR, ownerProject }).pricingSettings.hourlyRate, 900, 'ny kopi får avtalens pris');
  assert.equal(fixedClone.manager, 'Kari', 'leverandørens egne felt står');
  assert.equal(fixedClone.number, '24017');
});

test('innleid medarbeider hos eier og hvem som kan lånes ut', () => {
  const link = pendingFromMor();
  const rec = externalEmployeeRecord({ link, supplier: DATTER, employee: { id: 'emp7', person: { name: 'Ola Nordmann', email: 'ola@d.no' }, company: { title: 'Tømrer' } } });
  assert.equal(rec.id, 'ic_famDatter_emp7');
  assert.equal(rec.company.personnelKind, 'innleid');
  assert.equal(rec.company.homeCompanyId, DATTER.id);
  assert.equal(rec.company.accessLevel, 'innleie_ekstern');
  const list = lendableEmployees([
    { id: 'a', person: { name: 'Bjørn' }, company: { status: 'active', personnelKind: 'staff' } },
    { id: 'b', person: { name: 'Anne' }, company: { status: 'inactive' } },
    { id: 'c', person: { name: 'Cato' }, company: { personnelKind: 'innleid' } },
    { id: 'd', person: { name: 'Dina' }, company: { homeCompanyId: 'x' } },
  ]);
  assert.deepEqual(list.map((row) => row.id), ['a']);
});

test('kunden hos leverandøren: finnes på org.nr. eller opprettes', () => {
  const link = { ...pendingFromMor({ invoiceDelivery: 'email', invoiceEmails: { famMor: 'faktura@mor.no' } }) };
  const created = ensurePartnerCustomer([], { owner: MOR, link, nextNumber: '10001' });
  assert.equal(created.created, true);
  assert.equal(created.customer.invoiceDelivery, 'email');
  assert.equal(created.customer.invoiceEmail, 'faktura@mor.no');
  const found = ensurePartnerCustomer([{ id: 'k1', name: 'Mor', orgnr: '911 111 111', invoiceDelivery: 'ehf' }], { owner: MOR, link });
  assert.equal(found.created, false);
  assert.equal(found.customer.id, 'k1');
  assert.equal(found.changed, true, 'fakturaadressen fra avtalen fylles inn når kunden mangler den');
  assert.equal(found.customer.invoiceEmail, 'faktura@mor.no');
  assert.equal(found.customer.invoiceDelivery, 'ehf', 'kundens egen leveringsmåte står');
});

const CLONE = {
  id: 'prjic_icl-1_prjA',
  intercompany: { linkId: 'icl-1', role: 'supplier', ownerCompanyId: MOR.id, ownerProjectId: 'prjA', ownerProjectNumber: '24017', ownerProjectName: 'Skole' },
};

test('når datter fakturerer mor, står godkjenningen hos mor', () => {
  const source = { id: 'tid1', projectId: CLONE.id, employeeId: 'emp7', date: '2026-11-02', hours: 7.5, status: 'låst', invoiceId: 'F-datter-1' };
  const ownerApproved = { id: 'ic_famDatter_tid1', date: '2026-11-02', hours: 7.5, billableHours: 7.5, timeType: 'ordinary', status: 'godkjent', internalNote: 'mors notat', icMirror: true, intercompany: { mirror: true, supplierApproved: true } };
  const out = mirrorTimeEntry({ source, existing: ownerApproved, clone: CLONE, supplier: DATTER, ownerEmployeeId: 'x' });
  assert.equal(out.row.status, 'godkjent');
  assert.equal(out.row.intercompany.supplierApproved, true);
  assert.equal(out.row.internalNote, 'mors notat', 'eiers felt står');
});

test('nye priser i aktiv avtale må godtas av den andre parten', () => {
  const active = respondToLink(pendingFromMor({ hours: { discountPercent: 10 } }), { companyId: DATTER.id, accept: true }).link;
  const proposed = proposeLinkSettings(active, { companyId: MOR.id, settings: { hours: { discountPercent: 100 } } });
  assert.equal(proposed.proposed, true);
  assert.equal(proposed.link.settings.hours.discountPercent, 10, 'gjelder ikke før datter godtar');
  assert.equal(linkView(proposed.link, DATTER.id).settingsToAnswer, true);
  assert.equal(answerLinkSettings(proposed.link, { companyId: MOR.id, accept: true }).ok, false);
  const accepted = answerLinkSettings(proposed.link, { companyId: DATTER.id, accept: true });
  assert.equal(accepted.link.settings.hours.discountPercent, 100);
  assert.equal(accepted.link.pendingSettings, null);
  const rejected = answerLinkSettings(proposed.link, { companyId: DATTER.id, accept: false });
  assert.equal(rejected.link.settings.hours.discountPercent, 10);
  // Ventende forespørsel: den som spurte, kan justere før svar; den andre kan ikke.
  const pending = pendingFromMor();
  assert.equal(proposeLinkSettings(pending, { companyId: MOR.id, settings: { hours: { discountPercent: 3 } } }).link.settings.hours.discountPercent, 3);
  assert.equal(proposeLinkSettings(pending, { companyId: DATTER.id, settings: {} }).ok, false);
});

test('timer speiles: arbeidsgiveren godkjenner, og fakturaen vises hos mor', () => {
  const source = { id: 'tid1', projectId: CLONE.id, employeeId: 'emp7', employeeName: 'Ola', date: '2026-11-02', hours: 7.5, status: 'registrert' };
  const first = mirrorTimeEntry({ source, clone: CLONE, supplier: DATTER, ownerEmployeeId: 'ic_famDatter_emp7' });
  assert.equal(first.action, 'set');
  assert.equal(first.row.id, 'ic_famDatter_tid1');
  assert.equal(first.row.projectId, 'prjA');
  assert.equal(first.row.status, 'registrert');
  assert.equal(mirrorAwaitingSupplier(first.row), true);
  assert.match(mirrorStatusText(first.row), /venter på godkjenning i|venter på godkjenning der/);

  const approved = mirrorTimeEntry({ source: { ...source, status: 'godkjent' }, existing: first.row, clone: CLONE, supplier: DATTER, ownerEmployeeId: 'ic_famDatter_emp7' });
  assert.equal(approved.row.status, 'godkjent', 'godkjent hos arbeidsgiveren = godkjent hos mor, ingen ny godkjenning');
  assert.equal(mirrorAwaitingSupplier(approved.row), false);

  const draft = mirrorTimeEntry({ source: { ...source, status: 'låst', invoiceId: 'invD1' }, existing: approved.row, clone: CLONE, supplier: DATTER, ownerEmployeeId: 'x', invoice: { status: 'draft' } });
  assert.equal(draft.row.status, 'godkjent');
  assert.equal(draft.row.intercompany.supplierInvoice.id, 'invD1');
  assert.match(mirrorStatusText(draft.row), /fakturautkast/);
  const issued = mirrorTimeEntry({ source: { ...source, status: 'låst', invoiceId: 'invD1' }, existing: draft.row, clone: CLONE, supplier: DATTER, ownerEmployeeId: 'x', invoice: { status: 'issued', invoiceNumber: '10023' } });
  assert.equal(issued.row.intercompany.supplierInvoice.number, '10023');
  assert.equal(mirrorStatusText(issued.row), 'Ført i Datter AS · belastes dere på faktura 10023 fra Datter AS');

  const reopened = mirrorTimeEntry({ source: { ...source, status: 'registrert' }, existing: approved.row, clone: CLONE, supplier: DATTER, ownerEmployeeId: 'x' });
  assert.equal(reopened.row.status, 'registrert', 'godkjenning trukket hos arbeidsgiveren');
});

test('fakturerte speilede timer endres ikke, og slettede fjernes', () => {
  const invoiced = { id: 'ic_famDatter_tid1', invoiceId: 'inv1', hours: 7.5, date: '2026-11-02', timeType: 'ordinary', billableHours: 7.5, status: 'godkjent', intercompany: { mirror: true } };
  const changed = mirrorTimeEntry({ source: { id: 'tid1', date: '2026-11-02', hours: 9, status: 'godkjent' }, existing: invoiced, clone: CLONE, supplier: DATTER, ownerEmployeeId: 'x' });
  assert.equal(changed.row.hours, 7.5);
  assert.equal(changed.row.intercompany.sourceChangedAfterInvoice, true);
  assert.equal(mirrorTimeEntry({ source: null, existing: invoiced, clone: CLONE, supplier: DATTER }).row.intercompany.sourceDeleted, true);
  assert.equal(mirrorTimeEntry({ source: null, existing: { id: 'y' }, clone: CLONE, supplier: DATTER }).action, 'delete');
  assert.equal(mirrorTimeEntry({ source: null, existing: null, clone: CLONE, supplier: DATTER }).action, 'none');
});

test('salg og utleie speiles til eier', () => {
  const sale = { id: 's1', projectId: CLONE.id, name: 'Gips', quantity: 10, unitPrice: 99, status: 'draft', discountPercent: 10 };
  const first = mirrorSale({ source: sale, clone: CLONE, supplier: DATTER });
  assert.equal(first.row.projectId, 'prjA');
  assert.equal(first.row.status, 'draft');
  assert.equal(first.row.discountPercent, 0, 'rabatten til mor følger ikke med til sluttkunden');
  assert.equal(first.row.intercompany.supplierApproved, false);
  const ready = mirrorSale({ source: { ...sale, status: 'approved' }, existing: first.row, clone: CLONE, supplier: DATTER });
  assert.equal(ready.row.status, 'approved', 'klar hos arbeidsgiveren = klar til fakturering hos mor');
  const ownerSet = { ...ready.row, discountPercent: 5, comment: 'Mors notat' };
  const touched = mirrorSale({ source: { ...sale, status: 'approved', comment: 'ny' }, existing: ownerSet, clone: CLONE, supplier: DATTER });
  assert.equal(touched.row.discountPercent, 5, 'mors rabatt mot sluttkunden står');
  assert.equal(touched.row.comment, 'Mors notat');
  assert.equal(mirrorSale({ source: { ...sale, status: 'rejected' }, existing: ready.row, clone: CLONE, supplier: DATTER }).action, 'delete');

  const rows = salesToMirror([sale, { id: 'r', kind: 'rental', projectId: CLONE.id }, { id: 'own', projectId: 'prj1' }], { rental: { enabled: false } });
  assert.deepEqual(rows.map((row) => row.id), ['s1']);
  const diff = diffCloneSales([sale], [{ ...sale, quantity: 11 }, { id: 'n', projectId: CLONE.id }]);
  assert.equal(diff.changed.length, 2);
  assert.equal(diffCloneSales([sale], []).removed.length, 1);
});

test('utleie: booking på prosjekt blir salgsrad med utleiepris', () => {
  const equipment = { id: 'eq1', name: 'Minigraver', rental: { enabled: true, price: 1500, unit: 'dag' } };
  const booking = { id: 'b1', equipmentId: 'eq1', projectId: CLONE.id, date: '2026-11-02', endDate: '2026-11-04', status: 'reserved' };
  assert.equal(rentalQuantity(booking, 'dag'), 3);
  assert.equal(rentalQuantity({ start: '2026-11-02T07:00', end: '2026-11-02T11:00', date: '2026-11-02' }, 'time'), 4);
  assert.equal(rentalQuantity({ date: '2026-11-02', endDate: '2026-11-04', start: '2026-11-02T07:00', end: '2026-11-02T15:00' }, 'time'), 24, '8 timer x 3 dager');
  assert.equal(rentalSaleFromBooking({ booking: { ...booking, status: 'pending' }, equipment }), null, 'ventende forespørsel faktureres ikke');
  assert.equal(rentalSaleFromBooking({ booking: { ...booking, recurring: true }, equipment }), null, 'faste serier faktureres ikke automatisk');
  assert.equal(rentalSaleFromBooking({ booking, equipment: { ...equipment, rental: { ...equipment.rental, since: '2026-11-03' } } }), null, 'eldre reservasjoner blir ikke utleie');
  const row = rentalSaleFromBooking({ booking, equipment, project: { ...CLONE, intercompany: { ...CLONE.intercompany, rentalDiscountPercent: 10 } } });
  assert.equal(row.kind, 'rental');
  assert.equal(row.quantity, 3);
  assert.equal(row.unitPrice, 1500);
  assert.equal(row.discountPercent, 10);
  assert.equal(row.account, '3600');
  assert.equal(rentalSaleFromBooking({ booking: { ...booking, status: 'cancelled' }, equipment }), null);
  assert.equal(rentalSaleFromBooking({ booking, equipment: { ...equipment, rental: { enabled: false } } }), null);

  const synced = syncRentalSales({ sales: [], bookings: [booking], equipment: [equipment], projects: [CLONE] });
  assert.equal(synced.changed, true);
  assert.equal(synced.sales.length, 1);
  const same = syncRentalSales({ sales: synced.sales, bookings: [booking], equipment: [equipment], projects: [CLONE] });
  assert.equal(same.changed, false);
  const cancelled = syncRentalSales({ sales: synced.sales, bookings: [{ ...booking, status: 'cancelled' }], equipment: [equipment], projects: [CLONE] });
  assert.equal(cancelled.sales.length, 0);
  const invoiced = syncRentalSales({ sales: [{ ...synced.sales[0], status: 'invoiced', invoiceId: 'i' }], bookings: [], equipment: [equipment], projects: [] });
  assert.equal(invoiced.sales.length, 1, 'fakturert utleie blir stående');
});


test('utlegg speiles: godkjent hos arbeidsgiveren kan faktureres sluttkunden hos mor', () => {
  const source = { id: 'e1', projectId: CLONE.id, employeeId: 'emp7', description: 'Hotell', amountExVat: 1000, amountInclVat: 1120, vatAmount: 120, status: 'submitted', paidBy: 'personal' };
  const first = mirrorExpense({ source, clone: CLONE, supplier: DATTER });
  assert.equal(first.row.id, 'ic_famDatter_e1');
  assert.equal(first.row.projectId, 'prjA');
  assert.equal(first.row.status, 'draft');
  assert.equal(first.row.paidBy, 'company', 'mor skal ikke refundere den ansatte');
  assert.equal(first.row.employeeId, 'ic_famDatter_emp7');
  const approved = mirrorExpense({ source: { ...source, status: 'approved' }, existing: { ...first.row, markupPercent: 10 }, clone: CLONE, supplier: DATTER });
  assert.equal(approved.row.status, 'approved');
  assert.equal(approved.row.markupPercent, 10, 'mors påslag står');
  const invoiced = mirrorExpense({ source: { ...source, status: 'invoiced', invoiceId: 'invD1' }, existing: approved.row, clone: CLONE, supplier: DATTER, invoice: { invoiceNumber: '10023', status: 'sent' } });
  assert.match(mirrorStatusText(invoiced.row), /faktura 10023/);
  assert.equal(mirrorExpense({ source: { ...source, status: 'rejected' }, existing: approved.row, clone: CLONE, supplier: DATTER }).action, 'delete');
});

test('pris på kopien settes som på ethvert prosjekt; avtalens pris er bare utgangspunkt', () => {
  const link = { ...pendingFromMor({ hours: { mode: 'fixed', fixedRate: 900 } }), status: 'active' };
  const ownerProject = { id: 'prjA', number: '24017', name: 'Skole' };
  const first = buildCloneProject({ link, owner: MOR, ownerProject });
  assert.equal(first.pricingSettings.hourlyRate, 900);
  const edited = { ...first, pricingModel: 'fixed', pricingSettings: { fixedFee: 50000 } };
  const again = buildCloneProject({ link, owner: MOR, ownerProject: { ...ownerProject, name: 'Skole, trinn 2' }, existing: edited });
  assert.equal(again.pricingModel, 'fixed', 'egne betingelser på prosjektet står');
  assert.equal(again.pricingSettings.fixedFee, 50000);
  assert.equal(again.name, 'Skole, trinn 2');
});
