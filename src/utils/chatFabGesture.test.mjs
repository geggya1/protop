import assert from 'node:assert/strict';
import {
  CHAT_FAB_TAP_SLOP,
  CHAT_FAB_TOUCH_SLOP,
  pointerClientPoint,
  isChatFabDrag,
  shouldOpenChatOnFabRelease,
  chatFabSlopForPointerType,
} from './chatFabGesture.js';

assert.equal(CHAT_FAB_TAP_SLOP, 12);
assert.ok(CHAT_FAB_TOUCH_SLOP > CHAT_FAB_TAP_SLOP);

assert.deepEqual(pointerClientPoint(null), { x: 0, y: 0, valid: false });
assert.deepEqual(
  pointerClientPoint({ clientX: 120, clientY: 80 }),
  { x: 120, y: 80, valid: true },
);
assert.deepEqual(
  pointerClientPoint({ nativeEvent: { clientX: 10, clientY: 20 } }),
  { x: 10, y: 20, valid: true },
  'prefer RN nativeEvent when it has coordinates',
);
assert.deepEqual(
  pointerClientPoint({ clientX: 99, clientY: 88, nativeEvent: {} }),
  { x: 99, y: 88, valid: true },
  'fall back to the DOM event when nativeEvent has no coordinates',
);
assert.deepEqual(
  pointerClientPoint({ pageX: 4, pageY: 6 }),
  { x: 4, y: 6, valid: true },
);
assert.deepEqual(
  pointerClientPoint({ changedTouches: [{ clientX: 30, clientY: 40 }] }),
  { x: 30, y: 40, valid: true },
);
assert.equal(
  pointerClientPoint({}).valid,
  false,
  'missing coordinates must not be treated as 0,0 (Android false drag)',
);

assert.equal(isChatFabDrag(0, 0), false);
assert.equal(isChatFabDrag(5, 5), false);
assert.equal(isChatFabDrag(13, 0), true);
assert.equal(isChatFabDrag(0, -13), true);
assert.equal(isChatFabDrag(12, 0), false, 'exactly at slop is still a tap');
assert.equal(isChatFabDrag(20, 0, CHAT_FAB_TOUCH_SLOP), false, 'touch slop absorbs jitter');
assert.equal(isChatFabDrag(29, 0, CHAT_FAB_TOUCH_SLOP), true);

assert.equal(chatFabSlopForPointerType('touch'), CHAT_FAB_TOUCH_SLOP);
assert.equal(chatFabSlopForPointerType('mouse'), CHAT_FAB_TAP_SLOP);

assert.equal(shouldOpenChatOnFabRelease({ moved: false }), true);
assert.equal(shouldOpenChatOnFabRelease({ moved: true }), false);
assert.equal(shouldOpenChatOnFabRelease({}), true);

console.log('chatFabGesture.test.mjs: ok');
