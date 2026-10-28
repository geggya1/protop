import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FAMILY_ASSIGNEE, parentTaskInTrashForUser, parentTaskVisibleToUser } from './parentTaskVisibility.js';

const parentUid = 'parent1';
const childUid = 'child-uid';
const childIds = new Set([childUid, 'child-doc']);

assert.equal(
  parentTaskVisibleToUser(
    { createdBy: parentUid, assignedTo: null },
    { uid: parentUid, ids: new Set([parentUid]), asChild: false },
  ),
  true,
);

assert.equal(
  parentTaskVisibleToUser(
    { createdBy: parentUid, assignedTo: null },
    { uid: childUid, ids: childIds, asChild: true },
  ),
  false,
);

assert.equal(
  parentTaskVisibleToUser(
    { assignedTo: null },
    { uid: parentUid, ids: new Set([parentUid]), asChild: false },
  ),
  true,
);

assert.equal(
  parentTaskVisibleToUser(
    { assignedTo: null },
    { uid: childUid, ids: childIds, asChild: true },
  ),
  false,
);

assert.equal(
  parentTaskVisibleToUser(
    { createdBy: childUid, assignedTo: null },
    { uid: childUid, ids: childIds, asChild: true },
  ),
  true,
);

assert.equal(
  parentTaskVisibleToUser(
    { createdBy: parentUid, assignedTo: childUid },
    { uid: childUid, ids: childIds, asChild: true },
  ),
  true,
);

assert.equal(
  parentTaskVisibleToUser(
    { createdBy: childUid, assignedTo: parentUid },
    { uid: childUid, ids: childIds, asChild: true },
  ),
  false,
);

assert.equal(
  parentTaskVisibleToUser(
    { createdBy: parentUid, assignedTo: FAMILY_ASSIGNEE },
    { uid: childUid, ids: childIds, asChild: true },
  ),
  true,
);

// SOS-05: papirkurven. Eva oppretter og tildeler Kim, oppgaven slettes.
{
  const eva = 'eva';
  const kim = 'kim';
  const kari = 'kari';
  const task = { createdBy: eva, assignedTo: kim, deleted: true, active: true };
  // Slettede oppgaver vises aldri i de vanlige listene.
  assert.equal(parentTaskVisibleToUser(task, { uid: kim, ids: [kim] }), false);
  // Men i papirkurven hos både oppretter og ansvarlig.
  assert.equal(parentTaskInTrashForUser(task, { uid: eva, ids: [eva] }), true);
  assert.equal(parentTaskInTrashForUser(task, { uid: kim, ids: [kim] }), true);
  // Ikke hos en kollega som aldri så den.
  assert.equal(parentTaskInTrashForUser(task, { uid: kari, ids: [kari] }), false);
  // Ikke-slettede og deaktiverte oppgaver ligger ikke i papirkurven.
  assert.equal(parentTaskInTrashForUser({ ...task, deleted: false }, { uid: eva, ids: [eva] }), false);
  assert.equal(parentTaskInTrashForUser({ ...task, active: false }, { uid: eva, ids: [eva] }), false);
  // «Hele gruppen»: alle som så den.
  assert.equal(
    parentTaskInTrashForUser({ createdBy: eva, assignedTo: FAMILY_ASSIGNEE, deleted: true }, { uid: kari, ids: [kari] }),
    true,
  );
  // Privat «Meg»-oppgave: bare oppretteren.
  assert.equal(parentTaskInTrashForUser({ createdBy: eva, assignedTo: null, deleted: true }, { uid: kim, ids: [kim] }), false);

  const screen = readFileSync(new URL('../../screens/v2/RewardsScreen.jsx', import.meta.url), 'utf8');
  assert.match(screen, /filter\(\(t\) => parentTaskInTrashForUser\(t, \{/);
  assert.match(screen, /includeDeleted: true/);
}

console.log('parentTaskVisibility.test.mjs: ok');
