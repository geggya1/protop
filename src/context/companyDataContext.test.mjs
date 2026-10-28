/**
 * CompanyDataProvider og hookene: to skjermer i skallet deler én lytter, en skjerm utenfor
 * skallet (eller for et annet selskap) lytter selv, og et nytt navn når skjermen uten
 * omlasting. Kjører hookene med en liten React-dispatcher og falske kilder.
 */
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import React from 'react';

const log = { started: [], stopped: [] };
const emitters = new Map();
globalThis.__companyDataTest = { log, emitters };

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '../company/companyDataSources.js' && String(context.parentURL || '').endsWith('CompanyDataContext.js')) {
      return { url: 'mock:sources', shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'mock:sources') {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          const { log, emitters } = globalThis.__companyDataTest;
          const make = (key) => (companyId, onData) => {
            log.started.push(key + ':' + companyId);
            emitters.set(key + ':' + companyId, onData);
            return () => log.stopped.push(key + ':' + companyId);
          };
          export const companyDataSources = {
            employees: make('employees'),
            customers: make('customers'),
            projects: make('projects'),
            earnings: make('earnings'),
          };
        `,
      };
    }
    return next(url, context);
  },
});

const {
  CompanyDataProvider, useCompanyDirectory, useCustomers, useEmployees,
} = await import('./CompanyDataContext.js');
const { createCompanyDataStore } = await import('../company/companyDataStore.js');
const { companyDataSources } = await import('mock:sources');

const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
assert.ok(internals, 'React 19 client internals missing');

/** Én «komponent»: egne hook-plasser og effekter, og konteksten den ser. */
function mount(render, contextValue = null) {
  const slots = [];
  const effects = [];
  let cursor = 0;
  let dirty = false;
  let output = null;
  const pending = [];
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((dep, i) => Object.is(dep, b[i]));
  const dispatcher = {
    useState(initial) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (next) => {
        const value = typeof next === 'function' ? next(slots[i]) : next;
        if (Object.is(value, slots[i])) return;
        slots[i] = value;
        dirty = true;
      }];
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !sameDeps(slots[i].deps, deps)) slots[i] = { deps, value: fn() };
      return slots[i].value;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!effects[i] || !sameDeps(effects[i].deps, deps)) pending.push({ i, fn, deps });
    },
    useContext() {
      return contextValue;
    },
  };
  const api = {
    render() {
      for (let pass = 0; pass < 10; pass += 1) {
        cursor = 0;
        const previous = internals.H;
        internals.H = dispatcher;
        try {
          output = render();
        } finally {
          internals.H = previous;
        }
        for (const effect of pending.splice(0)) {
          effects[effect.i]?.cleanup?.();
          const cleanup = effect.fn();
          effects[effect.i] = { deps: effect.deps, cleanup };
        }
        if (!dirty) break;
        dirty = false;
      }
      return output;
    },
    get output() { return output; },
    unmount() {
      for (const effect of effects) effect?.cleanup?.();
    },
  };
  api.render();
  return api;
}

// Skallet: lageret slik CompanyDataProvider lager det (samme kilder).
const shell = createCompanyDataStore('co1', companyDataSources, { graceMs: 0 });
shell.setMembers([{ id: 'uid_kari', uid: 'uid_kari', name: 'Kari', active: true }], null);

const timer = mount(() => useEmployees('co1'), shell);
const report = mount(() => useCompanyDirectory(), shell);
assert.deepEqual(log.started, ['employees:co1'], 'to skjermer i skallet, én lytter');

emitters.get('employees:co1')([
  { id: 'emp_kari', personUid: 'uid_kari', person: { firstName: 'Kari', lastName: 'Nordmann' }, company: { status: 'active' } },
], { source: 'remote' });
timer.render();
report.render();
assert.equal(timer.output.employees.length, 1);
assert.equal(timer.output.ready, true);
assert.equal(report.output.resolvePerson('uid_kari').name, 'Kari Nordmann');

// Nytt navn hos en annen bruker: skjermen får det uten ny lesing.
emitters.get('employees:co1')([
  { id: 'emp_kari', personUid: 'uid_kari', person: { firstName: 'Kari', lastName: 'Berg' }, company: { status: 'active' } },
], { source: 'remote' });
report.render();
assert.equal(report.output.nameOf('emp_kari'), 'Kari Berg');
assert.deepEqual(log.started, ['employees:co1'], 'fortsatt bare én lytter');

// Utenfor skallet (eller et annet selskap): skjermen lytter selv, som før.
const other = mount(() => useCustomers('co2'), shell);
assert.deepEqual(log.started, ['employees:co1', 'customers:co2']);
emitters.get('customers:co2')([{ id: 'k1', name: 'Bygg AS' }], { source: 'remote' });
other.render();
assert.equal(other.output.resolveCustomer('k1').name, 'Bygg AS');
other.unmount();
assert.ok(log.stopped.includes('customers:co2'), 'egen lytter stoppes når skjermen lukkes');

// Uten selskap: tomme lister, klare med en gang, ingen lytter.
const none = mount(() => useEmployees(''), null);
assert.equal(none.output.ready, true);
assert.deepEqual(none.output.employees, []);
assert.equal(log.started.length, 2);

timer.unmount();
report.unmount();
await new Promise((resolve) => setTimeout(resolve, 5));
assert.ok(log.stopped.includes('employees:co1'), 'lytteren stoppes når ingen skjerm bruker den');

// Provideren lager lageret for companyId og gir det videre.
const element = mount(() => CompanyDataProvider({ companyId: 'co3', members: [], me: null, children: 'barn' }));
assert.equal(element.output.props.value.companyId, 'co3');
assert.equal(element.output.props.children, 'barn');
element.unmount();

console.log('src/context/companyDataContext.test.mjs: ok');
