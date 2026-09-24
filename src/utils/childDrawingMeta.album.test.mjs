/**
 * Smoke tests for drawing album URL/date helpers (pure meta, no RN).
 */
import assert from 'node:assert/strict';
import {
  drawingThumbUrl,
  drawingViewerUrl,
  formatDrawingDrawnAt,
} from './childDrawingMeta.js';

assert.equal(drawingThumbUrl({ thumbUrl: 't', imageUrl: 'i' }), 't');
assert.equal(drawingThumbUrl({ imageUrl: 'i' }), 'i');
assert.equal(drawingThumbUrl({}), null);

assert.equal(drawingViewerUrl({ thumbUrl: 't', imageUrl: 'i' }), 'i');
assert.equal(drawingViewerUrl({ thumbUrl: 't' }), 't');

assert.ok(formatDrawingDrawnAt('2024-06-15'));
assert.equal(formatDrawingDrawnAt(null), null);

console.log('childDrawingMeta.album.test.mjs: ok');
