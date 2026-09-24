import assert from 'node:assert/strict';
import {
  childCanCreateCalendarEvent,
  childCanOpenCalendarEvent,
  childCalendarEventReadOnly,
  canShowCalendarSettings,
  canCreateFamilyCalendarEvent,
} from './childCalendarAccess.js';

assert.equal(childCanCreateCalendarEvent({ isChild: true, calendarSelfEdit: true }), true);
assert.equal(childCanCreateCalendarEvent({ isChild: true, calendarSelfEdit: false }), false);
assert.equal(childCanCreateCalendarEvent({ isChild: false, calendarSelfEdit: true }), false);

assert.equal(childCanOpenCalendarEvent({ isChild: true }), true);
assert.equal(childCanOpenCalendarEvent({ isChild: false }), false);

assert.equal(childCalendarEventReadOnly({ isChild: true, calendarSelfEdit: false, isParentViewer: false }), true);
assert.equal(childCalendarEventReadOnly({ isChild: true, calendarSelfEdit: true, isParentViewer: false }), false);
assert.equal(childCalendarEventReadOnly({ isChild: true, calendarSelfEdit: false, isParentViewer: true }), false);

assert.equal(canShowCalendarSettings({ isParent: true, asChildViewer: false }), true);
assert.equal(canShowCalendarSettings({ isParent: true, asChildViewer: true }), false);
assert.equal(canShowCalendarSettings({ isParent: false, asChildViewer: false }), false);

assert.equal(canCreateFamilyCalendarEvent({ isParent: true, asChildViewer: false, childCanEditCalendar: false }), true);
assert.equal(canCreateFamilyCalendarEvent({ isParent: false, asChildViewer: true, childCanEditCalendar: true }), true);
assert.equal(canCreateFamilyCalendarEvent({ isParent: false, asChildViewer: true, childCanEditCalendar: false }), false);

console.log('childCalendarAccess.test.mjs: ok');
