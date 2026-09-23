import assert from 'node:assert/strict';
import { chatDrawerBottomInset, CHAT_WINDOW_BOTTOM } from './chatDockLayout.js';

assert.equal(chatDrawerBottomInset(0), CHAT_WINDOW_BOTTOM);
assert.equal(chatDrawerBottomInset(60), 68);
assert.equal(chatDrawerBottomInset(8), CHAT_WINDOW_BOTTOM);
assert.equal(chatDrawerBottomInset(null), CHAT_WINDOW_BOTTOM);
assert.equal(chatDrawerBottomInset(undefined), CHAT_WINDOW_BOTTOM);
assert.equal(chatDrawerBottomInset(12.7), 21);

console.log('chatDockLayout.test.mjs: ok');
