/**
 * Unit tests for drawing camera flash helpers.
 */
import assert from 'node:assert/strict';
import {
  FLASH_MODES,
  flashModeIcon,
  flashModeLabel,
  nextFlashMode,
} from './drawingCameraFlash.js';

assert.deepEqual(FLASH_MODES, ['off', 'auto', 'on']);
assert.equal(nextFlashMode('off'), 'auto');
assert.equal(nextFlashMode('auto'), 'on');
assert.equal(nextFlashMode('on'), 'off');
assert.equal(nextFlashMode('weird'), 'off');

assert.match(flashModeLabel('on'), /konstant/i);
assert.match(flashModeLabel('auto'), /Auto/i);
assert.match(flashModeLabel('off'), /Av/i);

assert.equal(flashModeIcon('on'), 'flashlight');
assert.equal(flashModeIcon('auto'), 'flash');
assert.equal(flashModeIcon('off'), 'flash-off');

console.log('drawingCameraFlash.test.mjs: ok');
