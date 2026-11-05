import assert from 'node:assert/strict';
import { emptyProjectState, normalizeAbsenceRow } from '../project/engine.js';
import { defaultAbsenceTypes } from './absenceCatalog.js';
import {
  WIZARD_GROUPS,
  applyPlainAbsence,
  dayAbsenceSummary,
  wizardOtherTypes,
  absenceFormFromRows,
  categoryDaysUsed,
  cleanFormDetails,
  defaultFormCategory,
  formCategory,
  formPayDecision,
  formSummary,
  formTypeFor,
  formWarnings,
  applyAbsenceForm,
  missingAbsenceForms,
  needsAbsenceForm,
  validateAbsenceForm,
} from './absenceForm.js';

const hours = (iso) => ([0, 6].includes(new Date(`${iso}T12:00:00Z`).getUTCDay()) ? 0 : 7.5);

// Hvilke typer som skal ha skjema.
assert.equal(needsAbsenceForm('annet_med'), true);
assert.equal(needsAbsenceForm('annet_uten'), true);
assert.equal(needsAbsenceForm('lege_med'), true);
assert.equal(needsAbsenceForm('foreldre'), true);
assert.equal(needsAbsenceForm('seminar_med'), true);
assert.equal(needsAbsenceForm('ferie'), false);
assert.equal(needsAbsenceForm('avspasering'), false);
assert.equal(needsAbsenceForm('egenmelding'), false);
assert.equal(needsAbsenceForm('sykt_barn'), false);
assert.equal(needsAbsenceForm('intern_admin'), false);
assert.equal(needsAbsenceForm('reise_uten_lonn'), false);
assert.equal(needsAbsenceForm('permittert'), false);
assert.equal(needsAbsenceForm('fravaersbeskjed'), false);
// Egen type i bedriften.
const catalog = [{ id: 'velferd', label: 'Velferdspermisjon', category: 'Permisjon', paid: true }];
assert.equal(needsAbsenceForm('velferd', catalog), true);

// Feltene følger med når raden normaliseres (lagres).
{
  const row = normalizeAbsenceRow({ id: 'a', employeeId: 'e1', date: '2026-11-04', hours: 8, type: 'annet_med', formId: 'fsk_1', formReason: 'Begravelse', formAt: '2026-11-04T10:00:00.000Z' });
  assert.equal(row.formId, 'fsk_1');
  assert.equal(row.formReason, 'Begravelse');
  const plain = normalizeAbsenceRow({ id: 'b', employeeId: 'e1', date: '2026-11-04', hours: 8, type: 'annet_med' });
  assert.equal('formId' in plain, false);
}

// Validering.
assert.deepEqual(validateAbsenceForm({ type: 'annet_med', category: 'annet', fromDate: '2026-11-04', toDate: '2026-11-04', reason: 'x' }), []);
assert.ok(validateAbsenceForm({ type: 'annet_med', category: 'annet', fromDate: '2026-11-04', toDate: '2026-11-03', reason: 'x' }).length);
assert.ok(validateAbsenceForm({ type: 'annet_med', category: 'annet', fromDate: '2026-11-04', reason: '' }).length);
// Grunnlag må velges.
assert.ok(validateAbsenceForm({ type: 'annet_med', fromDate: '2026-11-04', reason: 'x' }).some((e) => /gjelder/.test(e)));
// Kategoriene krever sine felt.
assert.ok(validateAbsenceForm({ type: 'foreldre', category: 'foreldre', fromDate: '2026-11-04' }).some((e) => /barnets/.test(e)));
assert.deepEqual(validateAbsenceForm({ type: 'foreldre', category: 'foreldre', fromDate: '2026-11-04', details: { childName: 'Ida', childDate: '2026-10-20' } }), []);
assert.ok(validateAbsenceForm({ type: 'annet_uten', category: 'naerstaende', fromDate: '2026-11-04' }).some((e) => /hvem/.test(e)));
assert.deepEqual(validateAbsenceForm({ type: 'annet_med', category: 'velferd', fromDate: '2026-11-04', details: { occasion: 'flytting' } }), []);
assert.ok(validateAbsenceForm({ type: 'annet_med', category: 'velferd', fromDate: '2026-11-04', details: { occasion: 'annet' } }).some((e) => /begrunnelse/.test(e)));
assert.ok(validateAbsenceForm({ type: 'annet_med', category: 'annet', fromDate: '2026-11-04', reason: 'x', confirmed: false }).some((e) => /Bekreft/.test(e)));
// Standardgrunnlag fra typen.
assert.equal(defaultFormCategory('foreldre'), 'foreldre');
assert.equal(defaultFormCategory('lege_med'), 'lege');
assert.equal(defaultFormCategory('seminar_uten'), 'kurs');
assert.equal(defaultFormCategory('annet_med'), '');
// Bare feltene kategorien spør om, lagres.
assert.deepEqual(cleanFormDetails('religios', { holiday: ' Eid ', childName: 'X' }), { holiday: 'Eid' });
// Varsler etter loven.
assert.ok(formWarnings({ category: 'religios', fromDate: '2026-11-10', toDate: '2026-11-10' }, { today: '2026-11-04', workDays: 1 }).some((w) => /14 dager/.test(w)));
assert.equal(formWarnings({ category: 'religios', fromDate: '2026-11-30', toDate: '2026-11-30' }, { today: '2026-11-04', workDays: 1 }).length, 0);
assert.ok(formWarnings({ category: 'religios', fromDate: '2026-12-01', toDate: '2026-12-01' }, { today: '2026-11-04', usedDays: 2, workDays: 1 }).some((w) => /inntil 2 dager/.test(w)));
assert.ok(formWarnings({ category: 'foreldre', fromDate: '2026-11-06', toDate: '2026-12-31' }, { today: '2026-11-04' }).some((w) => /12-7/.test(w)));
assert.equal(formWarnings({ category: 'foreldre', fromDate: '2026-11-20', toDate: '2026-12-31' }, { today: '2026-11-04' }).length, 0);
assert.ok(formWarnings({ category: 'livets_sluttfase', fromDate: '2026-11-04', toDate: '2027-02-01' }, { today: '2026-11-04' }).some((w) => /60 dager/.test(w)));

// Påminnelse og kobling.
{
  let state = emptyProjectState();
  state = {
    ...state,
    absences: [
      // Ført i timelisten fra den enkle dialogen, uten skjema (fredag + mandag = én periode).
      { id: 'f1', employeeId: 'e1', date: '2026-11-06', hours: 4, type: 'annet_med', status: 'registrert' },
      { id: 'f2', employeeId: 'e1', date: '2026-11-09', hours: 7.5, type: 'annet_med', status: 'registrert' },
      // Ikke sammenhengende (onsdag): egen periode.
      { id: 'f3', employeeId: 'e1', date: '2026-11-11', hours: 7.5, type: 'annet_med', status: 'registrert' },
      // Før skjemaet fantes: ingen påminnelse.
      { id: 'old', employeeId: 'e1', date: '2026-10-01', hours: 7.5, type: 'annet_med', status: 'registrert' },
      // Ferie og annen ansatt teller ikke.
      { id: 'fe', employeeId: 'e1', date: '2026-11-12', hours: 7.5, type: 'ferie', status: 'registrert' },
      { id: 'x', employeeId: 'e2', date: '2026-11-12', hours: 7.5, type: 'annet_med', status: 'registrert' },
    ].map(normalizeAbsenceRow),
  };
  const missing = missingAbsenceForms(state.absences, 'e1', { today: '2026-11-20' });
  assert.equal(missing.length, 2);
  assert.deepEqual(missing.map((m) => [m.fromDate, m.toDate]), [['2026-11-11', '2026-11-11'], ['2026-11-06', '2026-11-09']]);

  // Skjemaet for fredag–mandag: timene som er ført, beholdes; helgen føres ikke.
  const res = applyAbsenceForm(state, {
    employeeId: 'e1', type: 'annet_med', category: 'velferd', details: { occasion: 'flytting', childName: 'ignoreres' }, fromDate: '2026-11-06', toDate: '2026-11-09', reason: 'Flytting',
  }, { hoursForDate: hours, now: new Date('2026-11-09T08:00:00Z') });
  assert.equal(res.ok, true);
  assert.deepEqual(res.absenceIds.sort(), ['f1', 'f2']);
  const f1 = res.state.absences.find((a) => a.id === 'f1');
  assert.equal(f1.hours, 4);
  assert.equal(f1.formReason, 'Flytting');
  assert.equal(f1.formId, res.formId);
  assert.equal(f1.formCategory, 'velferd');
  assert.deepEqual(f1.formDetails, { occasion: 'flytting' });
  assert.equal(formSummary(f1), 'Velferdspermisjon · Flytting · Flytting');
  assert.equal(categoryDaysUsed(res.state.absences, { employeeId: 'e1', category: 'velferd', year: 2026 }), 2);
  assert.equal(categoryDaysUsed(res.state.absences, { employeeId: 'e1', category: 'velferd', year: 2026, excludeFormId: res.formId }), 0);
  assert.equal(missingAbsenceForms(res.state.absences, 'e1', { today: '2026-11-20' }).length, 1);

  // Utvid perioden til tirsdag: ny dag føres med timer fra arbeidsplanen.
  const form = absenceFormFromRows(res.state.absences, res.formId);
  assert.equal(form.fromDate, '2026-11-06');
  assert.equal(form.reason, 'Flytting');
  assert.equal(form.category, 'velferd');
  const wider = applyAbsenceForm(res.state, { ...form, toDate: '2026-11-10' }, { hoursForDate: hours });
  assert.equal(wider.ok, true);
  assert.equal(wider.absenceIds.length, 3);
  assert.equal(wider.state.absences.find((a) => a.date === '2026-11-10' && a.employeeId === 'e1').hours, 7.5);

  // Krymp: dagene utenfor fjernes.
  const narrow = applyAbsenceForm(wider.state, { ...form, fromDate: '2026-11-09', toDate: '2026-11-09' }, { hoursForDate: hours });
  assert.equal(narrow.ok, true);
  assert.equal(narrow.state.absences.filter((a) => a.formId === res.formId).length, 1);
  assert.equal(narrow.state.absences.some((a) => a.id === 'f1'), false);

  // Bare helg: ingen dager.
  const weekend = applyAbsenceForm(state, { employeeId: 'e1', type: 'annet_med', category: 'annet', fromDate: '2026-11-07', toDate: '2026-11-08', reason: 'x' }, { hoursForDate: hours });
  assert.equal(weekend.ok, false);
}

// Lønn etter aml. og bedriftens avtale.
{
  const none = { paidLeave: {} };
  const fob = { paidLeave: { lege: true, begravelse: true } };
  assert.equal(formPayDecision('svangerskapskontroll', {}, { rules: none }).paid, true);
  assert.equal(formPayDecision('lege', { whoFor: 'selv', provider: 'spesialist' }, { rules: none }).typeId, 'lege_uten');
  assert.equal(formPayDecision('lege', { whoFor: 'selv', provider: 'spesialist' }, { rules: fob }).typeId, 'lege_med');
  assert.equal(formPayDecision('lege', { whoFor: 'barn', provider: 'spesialist' }, { rules: fob }).typeId, 'lege_uten');
  assert.equal(formPayDecision('velferd', { occasion: 'begravelse' }, { rules: fob }).typeId, 'annet_med');
  assert.equal(formPayDecision('velferd', { occasion: 'flytting' }, { rules: fob }).typeId, 'annet_uten');
  assert.equal(formPayDecision('naerstaende', {}, { rules: fob }).typeId, 'annet_uten');
  assert.equal(formPayDecision('livets_sluttfase', {}, { rules: none }).payer, 'NAV');
  assert.equal(formPayDecision('foreldre', {}, { rules: none }).typeId, 'foreldre');
  assert.equal(formPayDecision('kurs', { ordered: true }, { rules: none }).typeId, 'seminar_med');
  assert.equal(formPayDecision('kurs', {}, { rules: none }).typeId, 'seminar_uten');
  assert.equal(formPayDecision('ammefri', { childDate: '2026-03-01' }, { rules: none, fromDate: '2026-11-04' }).paid, true);
  assert.equal(formPayDecision('ammefri', { childDate: '2025-03-01' }, { rules: none, fromDate: '2026-11-04' }).paid, false);
  assert.equal(formPayDecision('annet', {}, { rules: none }).typeId, '');
  // Typen finnes ikke hos bedriften: beholder typen dagene sto med.
  const custom = [{ id: 'annet_med' }, { id: 'velferd' }];
  const t = formTypeFor({ type: 'annet_med', category: 'lege', details: { whoFor: 'selv' } }, { rules: none, catalog: custom });
  assert.equal(t.resolvedType, 'annet_med');
  assert.equal(t.missingType, 'lege_uten');
  // Skjemaet bytter typen på dagen som sto som «Annet fravær med lønn».
  let state = { ...emptyProjectState(), absences: [normalizeAbsenceRow({ id: 'l1', employeeId: 'e1', date: '2026-11-04', hours: 2, type: 'annet_med' })] };
  const res = applyAbsenceForm(state, {
    employeeId: 'e1', type: 'lege_uten', originType: 'annet_med', category: 'lege', details: { whoFor: 'selv', provider: 'spesialist' },
    fromDate: '2026-11-04', toDate: '2026-11-04',
  }, { hoursForDate: hours });
  assert.equal(res.ok, true);
  assert.equal(res.state.absences.length, 1);
  assert.equal(res.state.absences[0].id, 'l1');
  assert.equal(res.state.absences[0].type, 'lege_uten');
  assert.equal(res.state.absences[0].hours, 2);
  // Alle feltene skjemaet lagrer, overlever normaliseringen (det som skrives til skyen).
  assert.deepEqual(normalizeAbsenceRow(res.state.absences[0]).formDetails, { whoFor: 'selv', provider: 'spesialist' });
  for (const cat of ['foreldre', 'naerstaende', 'velferd', 'kurs', 'religios', 'verv', 'utdanning', 'lege']) {
    const details = {
      childName: 'Ida', childDate: '2026-01-02', percent: 50, relation: 'forelder', person: 'Per', occasion: 'begravelse',
      education: 'Fagskole', organ: 'Kommunestyret', holiday: 'Eid', whoFor: 'barn', provider: 'tannlege', ordered: true,
    };
    const clean = cleanFormDetails(cat, details);
    const row = normalizeAbsenceRow({ id: 'x', employeeId: 'e1', date: '2026-11-04', hours: 1, type: 'annet_med', formId: 'f', formDetails: clean });
    assert.deepEqual(row.formDetails, clean, cat);
  }
  assert.ok(validateAbsenceForm({ type: 'lege_med', category: 'lege', fromDate: '2026-11-04', details: { whoFor: 'selv' } }).some((e) => /type time/.test(e)));
}

// Veiviseren «Registrer fravær».
{
  // Ferie over to dager med helg imellom: bare arbeidsdagene, timer fra arbeidsplanen.
  const base = emptyProjectState();
  const ferie = applyPlainAbsence(base, { employeeId: 'e1', type: 'ferie', fromDate: '2026-11-06', toDate: '2026-11-09' }, { hoursForDate: hours });
  assert.equal(ferie.ok, true);
  assert.deepEqual(ferie.state.absences.map((a) => a.date).sort(), ['2026-11-06', '2026-11-09']);
  assert.ok(ferie.state.absences.every((a) => a.type === 'ferie' && a.hours === 7.5 && !a.formId));
  // Kortere dag: timer per dag, høyst arbeidstiden.
  const kort = applyPlainAbsence(base, { employeeId: 'e1', type: 'avspasering', fromDate: '2026-11-06', toDate: '2026-11-06', hoursPerDay: 3 }, { hoursForDate: hours });
  assert.equal(kort.state.absences[0].hours, 3);
  const lang = applyPlainAbsence(base, { employeeId: 'e1', type: 'avspasering', fromDate: '2026-11-06', toDate: '2026-11-06', hoursPerDay: 12 }, { hoursForDate: hours });
  assert.equal(lang.state.absences[0].hours, 7.5);
  // Samme type på dagen fra før: timene endres, ingen ny rad.
  const igjen = applyPlainAbsence(kort.state, { employeeId: 'e1', type: 'avspasering', fromDate: '2026-11-06', toDate: '2026-11-06', hoursPerDay: 4 }, { hoursForDate: hours });
  assert.equal(igjen.state.absences.length, 1);
  assert.equal(igjen.state.absences[0].hours, 4);
  // Bare helg: ingen dager.
  assert.equal(applyPlainAbsence(base, { employeeId: 'e1', type: 'ferie', fromDate: '2026-11-07', toDate: '2026-11-08' }, { hoursForDate: hours }).ok, false);

  // Legetime med skjema: 2 timer.
  const lege = applyAbsenceForm(base, {
    employeeId: 'e1', type: 'lege_med', category: 'lege', details: { whoFor: 'selv', provider: 'tannlege' },
    fromDate: '2026-11-05', toDate: '2026-11-05', hoursPerDay: 2,
  }, { hoursForDate: hours });
  assert.equal(lege.ok, true);
  assert.equal(lege.state.absences[0].hours, 2);
  assert.equal(lege.state.absences[0].type, 'lege_med');

  // Valgene: syk og sykt barn går til egenmeldingen, ferie og avspasering er bare timer.
  const ids = WIZARD_GROUPS.map((g) => g.id);
  assert.deepEqual(ids.slice(0, 4), ['syk', 'sykt_barn', 'ferie', 'avspasering']);
  assert.equal(WIZARD_GROUPS.find((g) => g.id === 'sykt_barn').sick, 'child');
  for (const g of WIZARD_GROUPS.filter((row) => Array.isArray(row.options))) {
    for (const id of g.options) assert.ok(formCategory(id), `${g.id}: ${id}`);
  }
  // «Annet»: bedriftens øvrige typer, ikke sykdom, ferie eller typer med egne valg.
  const other = wizardOtherTypes(defaultAbsenceTypes()).map((row) => row.id);
  assert.ok(other.includes('intern_admin') && other.includes('annet_med') && other.includes('permittert'));
  assert.ok(!other.includes('ferie') && !other.includes('egenmelding') && !other.includes('lege_med') && !other.includes('avspasering'));
  assert.equal(wizardOtherTypes(defaultAbsenceTypes()).find((row) => row.id === 'intern_admin').needsForm, false);
  assert.equal(wizardOtherTypes(defaultAbsenceTypes()).find((row) => row.id === 'annet_med').needsForm, true);
  // Linjen «Fravær»: navnene på dagens fravær.
  assert.equal(dayAbsenceSummary([{ type: 'ferie', hours: 7.5 }, { type: 'lege_med', hours: 1 }, { type: 'ferie', hours: 0 }]), 'Ferie, Legebesøk med lønn');
  assert.equal(dayAbsenceSummary([]), '');
}

console.log('absenceForm ok');
