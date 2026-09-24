/**
 * Smoke tests for wall compose helpers (pure, no DOM canvas).
 */
import assert from 'node:assert/strict';
import {
  getFrameRect,
  ROOM_SCENES,
  wallDownloadFilename,
} from './childDrawingMeta.js';

const photoRooms = ROOM_SCENES.filter((s) => s.kind === 'photo');
assert.ok(photoRooms.length >= 4);

for (const room of photoRooms) {
  const rect = getFrameRect(room.id);
  assert.ok(rect, `frameRect missing for ${room.id}`);
  assert.ok(rect.width > 0.05 && rect.height > 0.05);
  assert.ok(rect.left + rect.width <= 1.01);
  assert.ok(rect.top + rect.height <= 1.01);
}

assert.equal(
  wallDownloadFilename({ title: 'Katter!' }, 'bedroom'),
  'Katter-soverom.jpg',
);
assert.match(
  wallDownloadFilename({ title: '' }, 'living'),
  /^tegning-stue\.jpg$/,
);

console.log('childDrawingCompose.test.mjs: ok');
