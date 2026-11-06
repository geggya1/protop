import assert from 'node:assert/strict';
import {
  anchorSafe, parseTodoTarget, todoActionLabel, todoAnchorId, todoTargetOf,
} from './todoFocus.js';

// Hvert gjøremål har et mål, og målet har et sted siden ruller til.
assert.equal(todoTargetOf({ id: 'doc:abc', target: 'documents' }), 'documents:abc');
assert.equal(todoTargetOf({ id: 'hr:t1', target: 'hr' }), 'hr:t1');
assert.equal(todoTargetOf({ id: 'hms', target: 'hms' }), 'hms');
assert.equal(todoTargetOf({ id: 'kin', target: 'kin' }), 'kin');
assert.equal(todoTargetOf(null), 'attention');

assert.deepEqual(parseTodoTarget('documents:a:b'), { kind: 'documents', id: 'a:b' });
assert.deepEqual(parseTodoTarget('hms'), { kind: 'hms', id: '' });

assert.equal(todoAnchorId('documents:ks/1'), `my-doc-${anchorSafe('ks/1')}`);
assert.equal(todoAnchorId('documents'), 'employee-todo-docs');
assert.equal(todoAnchorId('hms'), 'employee-todo-hms');
assert.equal(todoAnchorId('hr:t1'), 'employee-todo-hr-t1');
assert.equal(todoAnchorId('done'), 'employee-todo-done');
assert.equal(todoAnchorId('attention'), 'employee-todo-attention');

// Knappen sier hva som skjer.
assert.equal(todoActionLabel({ target: 'documents', title: 'Fyll ut og signer: X' }), 'Fyll ut og signer');
assert.equal(todoActionLabel({ target: 'documents', title: 'Les og bekreft: X' }), 'Les og bekreft');
assert.equal(todoActionLabel({ target: 'kin', done: false }), 'Legg inn');
assert.equal(todoActionLabel({ target: 'hr' }), 'Se oppgaven');

console.log('todoFocus.test.mjs: ok');
