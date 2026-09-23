import assert from 'node:assert/strict';
import {
  applyMailPaneDrag,
  clampMailPaneWidth,
  MAIL_FOLDER_PANE_MAX,
  MAIL_FOLDER_PANE_MIN,
  MAIL_LIST_PANE_MAX,
  MAIL_LIST_PANE_MIN,
} from './mailPanes.js';

assert.equal(clampMailPaneWidth(undefined, 180, 420), 180);
assert.equal(clampMailPaneWidth('nope', 180, 420), 180);
assert.equal(clampMailPaneWidth(300, 180, 420), 300);

assert.equal(applyMailPaneDrag(248, 40, MAIL_FOLDER_PANE_MIN, MAIL_FOLDER_PANE_MAX), 288);
assert.equal(applyMailPaneDrag(248, -200, MAIL_FOLDER_PANE_MIN, MAIL_FOLDER_PANE_MAX), MAIL_FOLDER_PANE_MIN);
assert.equal(applyMailPaneDrag(248, 400, MAIL_FOLDER_PANE_MIN, MAIL_FOLDER_PANE_MAX), MAIL_FOLDER_PANE_MAX);
assert.equal(applyMailPaneDrag(352, -20, MAIL_LIST_PANE_MIN, MAIL_LIST_PANE_MAX), 332);
console.log('mailPanes tests ok');
