import assert from 'node:assert/strict';
import {
  childCanEditTravel,
  childTravelReadOnly,
  canEditTravelContent,
} from './childTravelAccess.js';

assert.equal(childCanEditTravel({ isChild: true, travelSelfEdit: true }), true);
assert.equal(childCanEditTravel({ isChild: true, travelSelfEdit: false }), false);
assert.equal(childCanEditTravel({ isChild: false, travelSelfEdit: true }), false);

assert.equal(childTravelReadOnly({ isChildViewer: true, travelSelfEdit: false }), true);
assert.equal(childTravelReadOnly({ isChildViewer: true, travelSelfEdit: true }), false);
assert.equal(childTravelReadOnly({ isChildViewer: false, travelSelfEdit: false }), false);

assert.equal(canEditTravelContent({ isChildViewer: false }), true);
assert.equal(canEditTravelContent({ isChildViewer: true, travelSelfEdit: false }), false);
assert.equal(canEditTravelContent({ isChildViewer: true, travelSelfEdit: true }), true);
assert.equal(canEditTravelContent({
  isChildViewer: true, travelSelfEdit: true, tripEditable: false,
}), false);

console.log('childTravelAccess.test.mjs ok');
