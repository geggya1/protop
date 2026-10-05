import assert from 'node:assert/strict';
import {
  canManageCompanyNews,
  canPublishCompanyNews,
  defaultCompanyNewsSettings,
  normalizeCompanyNewsSettings,
} from './companyNews.js';

const base = defaultCompanyNewsSettings();
assert.equal(base.whoCanPost, 'members');
assert.equal(base.images, true);
assert.equal(base.links, true);
assert.equal(base.reactions, true);
assert.equal(base.notify, true);

const open = normalizeCompanyNewsSettings(null);
assert.equal(canPublishCompanyNews(open, false), true);
assert.equal(canPublishCompanyNews(open, true), true);

const closed = normalizeCompanyNewsSettings({ whoCanPost: 'admins', images: false, links: false, reactions: false, notify: false });
assert.equal(closed.whoCanPost, 'admins');
assert.equal(closed.images, false);
assert.equal(canPublishCompanyNews(closed, false), false);
assert.equal(canPublishCompanyNews(closed, true), true);
assert.equal(normalizeCompanyNewsSettings({ whoCanPost: 'ukjent' }).whoCanPost, 'members');

assert.equal(canManageCompanyNews({ authorUid: 'a' }, 'a', false), true);
assert.equal(canManageCompanyNews({ authorUid: 'a' }, 'b', false), false);
assert.equal(canManageCompanyNews({ authorUid: 'a' }, 'b', true), true);

console.log('companyNews.test.mjs ok');
