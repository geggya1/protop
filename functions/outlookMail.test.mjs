import assert from 'node:assert/strict';
import { FOLDER_SELECT, inferWellKnownName, mapMailFolder, collectExpandedFolders, missingPrimaryWellKnown, applyWellKnownIds } from './outlookMailFolders.js';
import { parseAddresses, buildMailBody, mapInlineAttachments, buildSendPayload } from './outlookMailCompose.js';

assert.equal(inferWellKnownName({ id: 'aa', displayName: 'Innboks' }), 'inbox');
assert.equal(inferWellKnownName({ id: 'aa', displayName: 'Inbox' }), 'inbox');
assert.equal(inferWellKnownName({ id: 'aa', displayName: 'Sendte elementer' }), 'sentitems');
assert.equal(inferWellKnownName({ id: 'aa', displayName: 'Sent Items' }), 'sentitems');
assert.equal(inferWellKnownName({ id: 'aa', displayName: 'Kladd' }), 'drafts');
assert.equal(inferWellKnownName({ id: 'aa', displayName: 'Prosjekt' }), null);
assert.equal(
  inferWellKnownName({ id: 'folder-1', displayName: 'Custom' }, new Map([['folder-1', 'inbox']])),
  'inbox',
);
assert.equal(inferWellKnownName({ id: 'aa', wellKnownName: 'junkemail', displayName: 'X' }), 'junkemail');
assert.equal(mapMailFolder({ id: '1', displayName: 'Innboks', unreadItemCount: 3 }).name, 'Innboks');
assert.equal(mapMailFolder({ id: '1', displayName: 'Innboks' }).wellKnownName, 'inbox');
assert.equal(mapMailFolder({ id: '1', displayName: 'X', parentFolderId: 'p' }).parentFolderId, 'p');
assert.equal(FOLDER_SELECT.includes('wellKnownName'), false);
assert.ok(FOLDER_SELECT.includes('parentFolderId'));

const expanded = collectExpandedFolders([
  {
    id: 'in',
    displayName: 'Innboks',
    unreadItemCount: 2,
    childFolderCount: 1,
    childFolders: [
      { id: 'proj', displayName: 'Prosjekt', parentFolderId: 'in', childFolderCount: 1 },
    ],
  },
  { id: 'sent', displayName: 'Sendte elementer', childFolderCount: 0 },
], new Map(), 0);
assert.equal(expanded.folders.length, 3);
assert.equal(expanded.folders[0].wellKnownName, 'inbox');
assert.equal(expanded.folders[1].name, 'Prosjekt');
assert.equal(expanded.folders[1].depth, 1);
assert.equal(expanded.pending.length, 1);
assert.equal(expanded.pending[0].id, 'proj');
assert.deepEqual(missingPrimaryWellKnown(expanded.folders), []);

const tagged = applyWellKnownIds(
  [{ id: 'x', name: 'Postkasse', wellKnownName: null }],
  new Map([['x', 'inbox']]),
);
assert.equal(tagged[0].wellKnownName, 'inbox');
assert.equal(tagged[0].name, 'Innboks');

assert.equal(parseAddresses('a@x.no; b@y.no, c@z.no').length, 3);
assert.equal(buildMailBody('<b>Hei</b>').contentType, 'HTML');
assert.equal(buildMailBody('Hei').contentType, 'Text');
assert.equal(buildMailBody('Hei', { html: true }).contentType, 'HTML');

const inline = mapInlineAttachments([{
  name: 'logo.png',
  contentType: 'image/png',
  contentBytes: 'data:image/png;base64,abc',
  contentId: 'signature-logo',
}]);
assert.equal(inline[0].contentBytes, 'abc');
assert.equal(inline[0].isInline, true);

const send = buildSendPayload({
  to: 'goa@consult1.no',
  cc: 'copy@x.no',
  bcc: 'hidden@x.no',
  subject: 'Hei',
  body: '<p>Test</p>',
  html: true,
  importance: 'high',
  readReceipt: true,
  attachments: inline,
});
assert.equal(send.to.length, 1);
assert.equal(send.message.body.contentType, 'HTML');
assert.equal(send.message.importance, 'high');
assert.equal(send.message.isReadReceiptRequested, true);
assert.equal(send.message.bccRecipients.length, 1);
assert.equal(send.message.attachments.length, 1);

console.log('outlookMail folders ok');
