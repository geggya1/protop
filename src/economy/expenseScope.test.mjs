/**
 * UX-17: Utlegg er én side med filteret «Prosjekt / Internt / Alle». Prosjektutlegg (Arbeid) og
 * Økonomi → Utlegg var to sider for de samme radene. Siden, Til fakturering og prosjektfanen leser
 * det samme: utlegg registrert i appen og importerte.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  EXPENSE_SCOPES,
  expenseDraftProblem,
  expenseRowActions,
  expenseScopeFromSearch,
  expenseScopeOf,
  expenseScopeSearch,
  expenseScopesFor,
  filterExpenseScope,
  isProjectExpense,
  movedExpensePage,
  projectExpenseRows,
  resolveExpenseScope,
} from './expenseScope.js';
import { combineExpenses } from './expenseSave.js';
import { companyTabAllowed, filterCompanyNav, standardGrants } from '../access/companyAccess.js';
import { OKONOMI_MENU, companyNavItems, companyMenuItems, groupCompanyDrawerItems } from '../navigation/shellModules.js';
import { PROTOP_PAGES, helpPageId, resolvePageKey } from '../help/protopPages.js';
import { evaluateHelpAccess } from '../help/helpAccess.js';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

const rows = [
  { id: 'p1', projectId: 'prj-1', projectName: 'Kontorbygg', description: 'Hotell' },
  { id: 'p2', projectNumber: '1001', description: 'Importert uten id' },
  { id: 'i1', description: 'Kontorrekvisita' },
  { id: 'x1', externalStore: true, description: 'Stillas fra fil' },
];

test('Prosjekt, Internt og Alle', () => {
  assert.deepEqual(EXPENSE_SCOPES.map((s) => s.label), ['Prosjekt', 'Internt', 'Alle']);
  assert.equal(isProjectExpense(rows[0]), true);
  assert.equal(isProjectExpense(rows[1]), true, 'prosjektnummer fra import teller');
  assert.equal(isProjectExpense(rows[2]), false);
  assert.equal(isProjectExpense(rows[3]), true, 'importerte utlegg er prosjektutlegg');
  assert.equal(expenseScopeOf(rows[2]), 'internt');
  assert.deepEqual(filterExpenseScope(rows, 'prosjekt').map((r) => r.id), ['p1', 'p2', 'x1']);
  assert.deepEqual(filterExpenseScope(rows, 'internt').map((r) => r.id), ['i1']);
  assert.deepEqual(filterExpenseScope(rows, 'alle').map((r) => r.id), ['p1', 'p2', 'i1', 'x1']);
});

test('filtrene følger tilgangen: Prosjektutlegg alene gir bare Prosjekt', () => {
  assert.deepEqual(expenseScopesFor({ all: true, project: true }).map((s) => s.id), ['prosjekt', 'internt', 'alle']);
  assert.deepEqual(expenseScopesFor({ all: true }).map((s) => s.id), ['prosjekt', 'internt', 'alle']);
  assert.deepEqual(expenseScopesFor({ project: true }).map((s) => s.id), ['prosjekt']);
  assert.deepEqual(expenseScopesFor({}), []);
  const all = expenseScopesFor({ all: true });
  const project = expenseScopesFor({ project: true });
  assert.equal(resolveExpenseScope('internt', all), 'internt');
  assert.equal(resolveExpenseScope('', all), 'alle', 'uten valg: alle, som Økonomi → Utlegg før');
  assert.equal(resolveExpenseScope('tull', all), 'alle');
  assert.equal(resolveExpenseScope('internt', project), 'prosjekt', 'Internt krever Utlegg-tilgang');
  assert.equal(resolveExpenseScope('', []), 'prosjekt');
});

test('filteret står i adressen (?vis=), og andre spørringer blir stående', () => {
  assert.equal(expenseScopeFromSearch('?vis=internt'), 'internt');
  assert.equal(expenseScopeFromSearch('?vis=PROSJEKT'), 'prosjekt');
  assert.equal(expenseScopeFromSearch('?vis=noe'), '');
  assert.equal(expenseScopeFromSearch(''), '');
  assert.equal(expenseScopeSearch('', 'prosjekt'), '?vis=prosjekt');
  assert.equal(expenseScopeSearch('?a=1&vis=alle', 'internt'), '?a=1&vis=internt');
});

test('gamle adresser: Arbeid → Prosjektutlegg åpner Utlegg med filteret Prosjekt', () => {
  assert.deepEqual(movedExpensePage('arbeid', 'utlegg'), {
    tab: 'okonomi', subView: 'utlegg', intent: { type: 'expenseScope', scope: 'prosjekt' },
  });
  assert.equal(movedExpensePage('okonomi', 'utlegg'), null, '/hjem/okonomi/utlegg er selve siden');
  assert.equal(movedExpensePage('arbeid', 'salg'), null);
  const shell = read('components/AppShell.jsx');
  assert.match(shell, /movedExpensePage\(tab, moreSubView\)/, 'skallet sender den gamle adressen videre');
  const page = read('screens/economy/ProjectExpensesScreen.jsx');
  assert.match(page, /shellIntent\?\.type !== 'expenseScope'/, 'siden tar imot filteret');
  assert.match(page, /expenseScopeSearch\(/, 'siden skriver filteret i adressen');
});

test('menyen har ett punkt «Utlegg», og det åpnes med Prosjektutlegg alene', () => {
  const okonomi = OKONOMI_MENU.map((item) => item.label);
  assert.equal(okonomi.filter((label) => /utlegg/i.test(label)).length, 1);
  assert.ok(okonomi.includes('Utlegg'));
  const ids = [];
  const walk = (items) => items.forEach((item) => { ids.push(item.id); walk(item.children || []); });
  walk(companyNavItems({ includeUnderenheter: true }));
  assert.equal(ids.includes('okonomi-prosjektutlegg'), false);
  for (const level of ['ansatt', 'innleie_ekstern', 'regnskap_ekstern', 'leder']) {
    const grants = standardGrants(level);
    assert.equal(companyTabAllowed('okonomi', 'utlegg', grants), true, level);
    const menu = filterCompanyNav(companyNavItems(), grants);
    const okonomiItem = menu.find((item) => item.id === 'okonomi');
    assert.ok(okonomiItem?.children?.some((child) => child.id === 'okonomi-utlegg'), `${level} ser Utlegg`);
  }
  // Prosjektutlegg alene åpner ikke resten av Økonomi.
  const innleid = standardGrants('innleie_ekstern');
  assert.equal(companyTabAllowed('okonomi', 'oversikt', innleid), false);
  assert.equal(companyTabAllowed('okonomi', 'faktura', innleid), false);
  const drawer = groupCompanyDrawerItems(companyMenuItems({ grants: innleid }));
  const finance = drawer.find((group) => group.id === 'company-finance');
  assert.equal(finance.children[0].id, 'okonomi-utlegg', 'bare én side: siden vises, ikke modulen');
  assert.equal(finance.children[0].label, 'Utlegg');
});

test('hjelpen: én side for Utlegg, og de gamle adressene får samme hjelp', () => {
  assert.equal(PROTOP_PAGES['arbeid.utlegg'], undefined);
  assert.equal(resolvePageKey(helpPageId('arbeid', 'utlegg')), 'okonomi.utlegg');
  assert.equal(resolvePageKey('okonomi.prosjektutlegg'), 'okonomi.utlegg');
  const page = PROTOP_PAGES['okonomi.utlegg'];
  assert.match(page.pitch.nb, /Prosjekt, Internt og Alle/);
  assert.ok(page.steps.some((s) => (s.find || []).includes('Importer fra fil')));
  // En ansatt (Prosjektutlegg) kan åpne siden, men ikke importere.
  const ansatt = standardGrants('ansatt');
  assert.equal(evaluateHelpAccess({ grants: ansatt, pageKey: 'okonomi.utlegg' }).ok, true);
  const importAt = page.steps.findIndex((s) => (s.find || []).includes('Importer fra fil'));
  assert.equal(evaluateHelpAccess({ grants: ansatt, pageKey: 'okonomi.utlegg', stepIndex: importAt }).ok, false);
});

test('samme utlegg på siden, i Til fakturering og på prosjektfanen', () => {
  const state = [
    { id: 'a', projectId: 'prj-1', description: 'Hotell', amountExVat: 100, date: '2026-10-01' },
    { id: 'b', description: 'Kontor', amountExVat: 50, date: '2026-10-02' },
    // En gammel kopi av en importert rad i prosjektdokumentet telles ikke.
    { id: 'x', projectId: 'prj-1', externalStore: true, description: 'Gammel kopi', amountExVat: 1, date: '2026-10-03' },
  ];
  const imported = [{ id: 'x', projectId: 'prj-1', externalStore: true, description: 'Stillas', amountExVat: 300, date: '2026-10-03' }];
  const all = combineExpenses(state, imported);
  assert.deepEqual(projectExpenseRows(state, imported, 'prj-1').map((r) => `${r.id}:${r.description}`).sort(), ['a:Hotell', 'x:Stillas']);
  assert.deepEqual(projectExpenseRows(state, imported, 'prj-1', { employeeId: 'emp-1' }), []);
  assert.deepEqual(filterExpenseScope(all, 'prosjekt').map((r) => r.id).sort(), ['a', 'x']);
  // Kildene: siden, prosjektfanen og Til fakturering bruker samme sammenslåing.
  assert.match(read('screens/economy/ProjectExpensesScreen.jsx'), /combineExpenses\(state\.expenses, remoteExpenses\)/);
  assert.match(read('components/project/ProjectExpensesTab.jsx'), /projectExpenseRows\(/);
  assert.match(read('components/project/ProjectExpensesTab.jsx'), /loadProjectExpenses\(/);
  assert.match(read('screens/economy/billing/useBillingData.js'), /combineExpenses\(projects\?\.expenses, remoteExpenses\)/);
  // Økonomi → Utlegg og Arbeid → Prosjektutlegg viser samme side.
  assert.match(read('screens/economy/EconomyScreen.jsx'), /page === 'utlegg'[\s\S]{0,80}<ExpensesScreen/);
  // Den gamle adressen tegner ingenting selv: skallet sender videre til Økonomi → Utlegg.
  assert.match(read('screens/arbeid/ArbeidHub.jsx'), /page === 'utlegg'\) return null;/);
});

test('hvem kan godkjenne, endre og slette', () => {
  const draft = { id: 'a', status: 'draft', employeeId: 'emp-ola' };
  const approved = { ...draft, status: 'approved' };
  const invoiced = { ...draft, status: 'invoiced', invoiceId: 'F-1' };
  const trip = { ...draft, tripId: 't1' };
  const manager = { canManage: true, myEmployeeId: 'emp-eva' };
  const ola = { canManage: false, myEmployeeId: 'emp-ola' };
  const kari = { canManage: false, myEmployeeId: 'emp-kari' };
  assert.deepEqual(expenseRowActions(draft, manager), { approve: true, edit: true, remove: true, trip: false });
  assert.deepEqual(expenseRowActions(approved, manager), { approve: false, edit: true, remove: true, trip: false });
  assert.deepEqual(expenseRowActions(invoiced, manager), { approve: false, edit: false, remove: false, trip: false });
  assert.deepEqual(expenseRowActions(draft, ola), { approve: false, edit: true, remove: true, trip: false }, 'eget utlegg som venter');
  assert.deepEqual(expenseRowActions(approved, ola), { approve: false, edit: false, remove: false, trip: false }, 'godkjent er låst for den ansatte');
  assert.deepEqual(expenseRowActions(draft, kari), { approve: false, edit: false, remove: false, trip: false }, 'andres utlegg');
  assert.deepEqual(expenseRowActions(trip, manager), { approve: false, edit: false, remove: false, trip: true }, 'kjøring endres i Kjørebok');
});

test('nytt utlegg: prosjekt kreves når personen bare har Prosjektutlegg', () => {
  assert.equal(expenseDraftProblem({ projectId: '' }, { needsProject: true }), 'Velg prosjekt.');
  assert.equal(expenseDraftProblem({ projectId: 'prj-1' }, { needsProject: true }), '');
  assert.equal(expenseDraftProblem({ projectId: '' }, { needsProject: false }), '');
});
