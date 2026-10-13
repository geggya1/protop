import assert from 'node:assert/strict';
import {
  canSwitchTimesheetPerson,
  timesheetCrumb,
  timesheetIdentity,
} from './timesheetIdentity.js';

{
  const own = timesheetIdentity({ personal: true });
  const admin = timesheetIdentity({ personal: false });
  assert.equal(own.fontSize, 13);
  assert.equal(own.numberOfLines, 2);
  assert.ok(admin.fontSize > own.fontSize + 6);
  assert.equal(admin.fontSize, 22);
  assert.equal(admin.fontWeight, '700');
  assert.equal(canSwitchTimesheetPerson({ personal: true, manager: true }), false);
  assert.equal(canSwitchTimesheetPerson({ personal: false, manager: true }), true);
  assert.equal(canSwitchTimesheetPerson({ personal: false, locked: true, manager: true }), false);
  assert.equal(canSwitchTimesheetPerson({ manager: false }), false);
  assert.equal(timesheetCrumb({ personal: true, companyLabel: 'CONSULT1 AS' }), 'Timeliste · CONSULT1 AS');
  assert.equal(timesheetCrumb({ locked: true }), 'Ansatte / Timeføring');
  assert.equal(timesheetCrumb({}), 'Arbeid / Timeføring');
}

console.log('timesheetIdentity.test.mjs: ok');
