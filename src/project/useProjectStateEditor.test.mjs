/**
 * DS-02: å åpne Økonomi eller ISO skrev prosjektkopien i minnet tilbake til skyen.
 * useProjectStateEditor lagrer bare etter en endring brukeren gjør, aldri etter lasting.
 * Kjører hooken med en liten React-dispatcher og en falsk storage.js.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';
import React from 'react';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const calls = { load: 0, save: [], put: 0 };
globalThis.__editorTestCalls = calls;
globalThis.__editorTestLoaded = { projects: [{ id: 'p1', number: '100' }], baseRev: 'r1' };

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === './storage.js' && String(context.parentURL || '').endsWith('useProjectStateEditor.js')) {
      return { url: 'mock:storage', shortCircuit: true };
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'mock:storage') {
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          const calls = globalThis.__editorTestCalls;
          export function peekProjectState() { return null; }
          export async function loadProjectState() { calls.load += 1; return globalThis.__editorTestLoaded; }
          export function putProjectState(state) { calls.put += 1; return state; }
          export async function saveProjectState(state) { calls.save.push(state); return state; }
        `,
      };
    }
    return next(url, context);
  },
});

const { useProjectStateEditor } = await import('./useProjectStateEditor.js');

function createHooks() {
  const frame = { values: [], i: 0, effects: [] };
  let dirty = false;
  const pending = [];
  const dispatcher = {
    useState(initial) {
      const i = frame.i++;
      if (frame.values.length <= i) frame.values[i] = typeof initial === 'function' ? initial() : initial;
      return [frame.values[i], (next) => {
        const value = typeof next === 'function' ? next(frame.values[i]) : next;
        if (Object.is(value, frame.values[i])) return;
        frame.values[i] = value;
        dirty = true;
      }];
    },
    useEffect(fn, deps) {
      const i = frame.i++;
      const prev = frame.effects[i];
      const same = prev && deps && prev.deps.length === deps.length
        && deps.every((dep, index) => Object.is(dep, prev.deps[index]));
      if (!same) pending.push({ i, fn, deps });
    },
    useRef(value) {
      const i = frame.i++;
      if (frame.values.length <= i) frame.values[i] = { current: value };
      return frame.values[i];
    },
    useCallback(fn, deps) {
      const i = frame.i++;
      const prev = frame.values[i];
      if (prev && deps && prev.deps.length === deps.length && deps.every((dep, index) => Object.is(dep, prev.deps[index]))) {
        return prev.fn;
      }
      frame.values[i] = { fn, deps };
      return fn;
    },
  };
  return {
    dispatcher,
    begin() { frame.i = 0; },
    takeDirty() { const was = dirty; dirty = false; return was; },
    runEffects() {
      for (const effect of pending.splice(0)) {
        frame.effects[effect.i] = { deps: effect.deps };
        effect.fn();
      }
    },
  };
}

const internals = React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
assert.ok(internals, 'React 19 client internals missing');
const hooks = createHooks();
let api = null;

async function render() {
  for (let pass = 0; pass < 10; pass += 1) {
    hooks.begin();
    const previous = internals.H;
    internals.H = hooks.dispatcher;
    try {
      api = useProjectStateEditor('co1');
    } finally {
      internals.H = previous;
    }
    hooks.runEffects();
    await Promise.resolve();
    await Promise.resolve();
    if (!hooks.takeDirty()) break;
  }
}

await render();
assert.equal(calls.load, 1);
assert.equal(api.ready, true);
assert.equal(api.state, globalThis.__editorTestLoaded);
assert.equal(calls.save.length, 0, 'lasting skal ikke lagre');

const edited = { ...api.state, projects: [...api.state.projects, { id: 'p2', number: '200' }] };
api.setState(edited);
await render();
assert.equal(calls.save.length, 1, 'endring fra brukeren lagres');
assert.equal(calls.save[0], edited);
assert.equal(calls.put, 1);

await render();
assert.equal(calls.save.length, 1, 'ny visning uten endring lagrer ikke på nytt');

// Skjermene som lagret rett etter lasting, bruker nå vernet (eller lagrer ikke i det hele tatt).
const economy = fs.readFileSync(path.join(ROOT, 'screens/economy/EconomyScreen.jsx'), 'utf8');
assert.ok(!/saveProjectState/.test(economy), 'Økonomi skriver ikke prosjektene tilbake');
const ops = fs.readFileSync(path.join(ROOT, 'screens/economy/EconomyOps.jsx'), 'utf8');
assert.ok(/useProjectStateEditor\(/.test(ops), 'Utlegg/Kjørebok bruker useProjectStateEditor');
assert.ok(!/if \(ready\) saveProjectState/.test(ops));
assert.equal(fs.existsSync(path.join(ROOT, 'screens/project/IsoScreen.jsx')), false, 'den gamle ISO-siden er fjernet');

console.log('useProjectStateEditor.test.mjs: ok');
