import assert from 'node:assert/strict';
import { FAMILY_ASSIGNEE, parentTaskVisibleToUser } from './parentTaskVisibility.js';

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

console.log('parentTaskVisibility.test.mjs: ok');
