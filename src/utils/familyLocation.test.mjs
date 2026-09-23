import assert from 'node:assert/strict';
import {
  effectiveLocationSharing,
  childCanControlLocationSharing,
  distanceMeters,
} from './familyLocationLogic.js';

assert.equal(
  effectiveLocationSharing({ userProfile: { locationSharingEnabled: true } }),
  true,
);
assert.equal(
  effectiveLocationSharing({ userProfile: { locationSharingEnabled: false } }),
  false,
);

assert.equal(
  effectiveLocationSharing({
    userProfile: { locationSharingEnabled: true },
    childRecord: { locationSharingEnabled: false },
  }),
  false,
);

assert.equal(
  effectiveLocationSharing({
    userProfile: { locationSharingEnabled: false },
    childRecord: { locationSharingEnabled: true },
  }),
  true,
);

assert.equal(
  effectiveLocationSharing({
    userProfile: { locationSharingEnabled: false },
    childRecord: {
      locationSharingEnabled: true,
      locationSharingChildCanControl: true,
    },
  }),
  false,
);
assert.equal(
  childCanControlLocationSharing({
    locationSharingEnabled: true,
    locationSharingChildCanControl: true,
  }),
  true,
);
assert.equal(
  childCanControlLocationSharing({ locationSharingEnabled: true }),
  false,
);

const d = distanceMeters({ lat: 59.91, lng: 10.75 }, { lat: 59.91, lng: 10.75 });
assert.ok(d < 1);

console.log('familyLocation.test.mjs: ok');
