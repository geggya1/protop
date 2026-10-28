import assert from 'node:assert/strict';
import {
  baseSubject,
  replySubject,
  forwardSubject,
  parseRecipients,
  isValidAddress,
  replyRecipients,
  toGraphRecipients,
  formatRecipient,
  mapGraphMessage,
  mapGraphMessageFull,
  collectGraphFolders,
  injectIntoBody,
  stripForeignStyles,
  dataImagesToInline,
  replaceCidImages,
  inlineCandidates,
  visibleAttachments,
  graphListFilter,
  matchesMailFilter,
  mailSectionLabel,
  groupMailRows,
  flagPatch,
  applyFlagLocally,
  sensitivityOf,
  sensitivityProps,
  categoryColor,
  categoryChoices,
  toggleCategory,
  formatBytes,
  formatMailDateLong,
  mergeContacts,
  suggestContacts,
  base64Size,
  quoteHeaderHtml,
} from './mailModel.js';

// Emne: ett prefiks, norsk som i Outlook.
assert.equal(baseSubject('Re: SV: VS: Tilbud'), 'Tilbud');
assert.equal(replySubject('ProTop: Personalhåndbok'), 'SV: ProTop: Personalhåndbok');
assert.equal(replySubject('SV: Møte'), 'SV: Møte');
assert.equal(replySubject('RE: Møte'), 'SV: Møte');
assert.equal(forwardSubject('Fw: Faktura'), 'VS: Faktura');
assert.equal(forwardSubject(''), 'VS:');

// Mottakere skrevet inn for hånd.
assert.deepEqual(parseRecipients('Ola Nordmann <ola@x.no>; kari@y.no, "Dahl, Gudrid" <gd@z.no>'), [
  { name: 'Ola Nordmann', address: 'ola@x.no' },
  { name: '', address: 'kari@y.no' },
  { name: 'Dahl, Gudrid', address: 'gd@z.no' },
]);
assert.equal(isValidAddress('goa@consult1.no'), true);
assert.equal(isValidAddress('goa@consult1'), false);
assert.equal(isValidAddress('Kopi'), false);
assert.deepEqual(toGraphRecipients([{ name: 'Ola', address: 'ola@x.no' }, { name: '', address: 'ugyldig' }]), [
  { emailAddress: { address: 'ola@x.no', name: 'Ola' } },
]);
assert.equal(formatRecipient({ name: 'Ola', address: 'ola@x.no' }), 'Ola <ola@x.no>');
assert.equal(formatRecipient({ name: 'ola@x.no', address: 'ola@x.no' }), 'ola@x.no');

// Svar og svar til alle: aldri deg selv, kopi beholdes.
const msg = {
  from: { name: 'Anders', address: 'ar@consult1.no' },
  to: [{ name: 'Geir Ove', address: 'GOA@consult1.no' }, { name: 'Torbjørn', address: 'to@consult1.no' }],
  cc: [{ name: 'Aina', address: 'aj@x.no' }, { name: 'Anders', address: 'ar@consult1.no' }],
};
assert.deepEqual(replyRecipients(msg, 'goa@consult1.no'), {
  to: [{ name: 'Anders', address: 'ar@consult1.no' }],
  cc: [],
});
assert.deepEqual(replyRecipients(msg, 'goa@consult1.no', { all: true }), {
  to: [{ name: 'Anders', address: 'ar@consult1.no' }, { name: 'Torbjørn', address: 'to@consult1.no' }],
  cc: [{ name: 'Aina', address: 'aj@x.no' }],
});
// Svar på egen sendt melding går til de opprinnelige mottakerne.
const own = { from: { name: 'Geir Ove', address: 'goa@consult1.no' }, to: [{ name: 'Kunde', address: 'k@kunde.no' }], cc: [] };
assert.deepEqual(replyRecipients(own, 'goa@consult1.no').to, [{ name: 'Kunde', address: 'k@kunde.no' }]);
// Svar-til-adresse vinner over avsender.
assert.deepEqual(
  replyRecipients({ ...msg, replyTo: [{ name: 'Support', address: 'support@x.no' }] }, 'goa@consult1.no').to,
  [{ name: 'Support', address: 'support@x.no' }],
);

// Mapping fra Graph.
const raw = {
  id: 'm1',
  subject: '',
  from: { emailAddress: { name: 'ProTop', address: 'noreply@protop.no' } },
  toRecipients: [{ emailAddress: { name: 'Geir', address: 'goa@consult1.no' } }],
  receivedDateTime: '2026-10-27T22:00:00Z',
  isRead: false,
  hasAttachments: true,
  bodyPreview: 'Hei  \n  der',
  importance: 'High',
  flag: { flagStatus: 'flagged', dueDateTime: { dateTime: '2026-10-28T00:00:00.0000000', timeZone: 'UTC' } },
  categories: ['Rød kategori'],
};
const mapped = mapGraphMessage(raw);
assert.equal(mapped.subject, '(uten emne)');
assert.equal(mapped.preview, 'Hei der');
assert.equal(mapped.importance, 'high');
assert.equal(mapped.flagged, true);
assert.equal(mapped.flagDue, '2026-10-28T00:00:00.0000000');
assert.deepEqual(mapped.categories, ['Rød kategori']);

const full = mapGraphMessageFull({
  ...raw,
  body: { contentType: 'text', content: 'Linje <1>' },
  singleValueExtendedProperties: [{ id: 'Integer 0x36', value: '2' }],
}, [{ id: 'a1', name: 'logo.png', contentType: 'image/png', size: 10, isInline: true, '@odata.type': '#microsoft.graph.fileAttachment' }]);
assert.match(full.html, /Linje &lt;1&gt;/);
assert.equal(full.attachments[0].kind, 'fileAttachment');
assert.equal(full.sensitivity, 'private');

// Følsomhet (privat) via MAPI-egenskap.
assert.equal(sensitivityOf([{ id: 'Integer 0x0036', value: '2' }]), 'private');
assert.equal(sensitivityOf([]), 'normal');
assert.deepEqual(sensitivityProps('confidential'), [{ id: 'Integer 0x0036', value: '3' }]);

// Mapper med utvidede undermapper.
const { folders, pending } = collectGraphFolders([
  {
    id: 'i', displayName: 'Inbox', childFolderCount: 2, unreadItemCount: 7,
    childFolders: [
      { id: 'c1', displayName: 'Prosjekt C1', parentFolderId: 'i', childFolderCount: 0 },
      { id: 'c2', displayName: 'Consult1 Vest AS', parentFolderId: 'i', childFolderCount: 3 },
    ],
  },
  { id: 's', displayName: 'Sendte elementer', childFolderCount: 0 },
], new Map([['s', 'sentitems']]));
assert.equal(folders.length, 4);
assert.equal(folders[0].name, 'Innboks');
assert.equal(folders[0].unread, 7);
assert.equal(folders[3].wellKnownName, 'sentitems');
assert.deepEqual(pending.map((f) => f.id), ['c2']);

// Vår tekst settes først i <body> i utkastet.
assert.equal(
  injectIntoBody('<html><head></head><body dir="ltr"><div>sitat</div></body></html>', '<p>Hei</p>'),
  '<html><head></head><body dir="ltr"><div id="protop-compose"><p>Hei</p></div><div>sitat</div></body></html>',
);
assert.equal(injectIntoBody('<div>x</div>', '<p>y</p>'), '<div id="protop-compose"><p>y</p></div><div>x</div>');

// Innlimt Office-HTML: ingen stilark eller skript.
const pasted = stripForeignStyles('<html><head><style>p{margin:0}</style></head><body><!--[if gte mso]><x><![endif]--><p class="MsoNormal" onclick="x()">Hei<o:p></o:p></p><script>alert(1)</script></body></html>');
assert.equal(pasted, '<p class="MsoNormal">Hei</p>');

// Data-bilder blir innebygde vedlegg, og samme bilde lastes bare opp én gang.
const png = 'iVBORw0KGgo=';
const { html: inlined, attachments } = dataImagesToInline(`<p><img src="data:image/png;base64,${png}"><img alt="" src='data:image/png;base64,${png}'></p>`);
assert.equal(attachments.length, 1);
assert.match(inlined, /src="cid:img-[a-z0-9]+@protop"/);
assert.equal((inlined.match(/cid:/g) || []).length, 2);
assert.equal(attachments[0].contentType, 'image/png');
const knownUrl = `data:image/png;base64,${png}`;
const again = dataImagesToInline(`<img src="${knownUrl}">`, { known: { [knownUrl]: 'image001.png@01DB' } });
assert.equal(again.attachments.length, 0);
assert.equal(again.html, '<img src="cid:image001.png@01DB">');
assert.equal(base64Size('aGVp'), 3);

// cid: i mottatt e-post byttes med bildet.
const cidMsg = {
  html: '<img src="cid:image001.png@01DB">',
  attachments: [
    { id: 'a1', kind: 'fileAttachment', contentType: 'image/png', isInline: true },
    { id: 'a2', kind: 'fileAttachment', contentType: 'application/pdf', isInline: false, name: 'tegning.pdf' },
  ],
};
assert.deepEqual(inlineCandidates(cidMsg).map((a) => a.id), ['a1']);
const replaced = replaceCidImages(cidMsg.html, [{ id: 'a1', contentId: '<image001.png@01DB>', contentType: 'image/png', contentBytes: png }]);
assert.equal(replaced.html, `<img src="data:image/png;base64,${png}">`);
assert.equal(replaced.known[`data:image/png;base64,${png}`], 'image001.png@01DB');
assert.deepEqual(visibleAttachments(cidMsg, replaced.used).map((a) => a.id), ['a2']);

// Filtre: feltet i $orderby står først.
assert.equal(graphListFilter('all'), '');
assert.equal(graphListFilter('unread'), 'receivedDateTime ge 1900-01-01T00:00:00Z and isRead eq false');
assert.equal(graphListFilter('flagged', '2026-10-27T10:00:00Z'), "receivedDateTime ge 2026-10-27T10:00:00Z and flag/flagStatus eq 'flagged'");
assert.equal(matchesMailFilter({ isRead: false }, 'unread'), true);
assert.equal(matchesMailFilter({ flagged: false }, 'flagged'), false);

// Grupper (tirsdag 27.10.2026 kl. 23).
const now = new Date(2026, 9, 27, 23, 0);
assert.equal(mailSectionLabel(new Date(2026, 9, 27, 8).toISOString(), now), 'I dag');
assert.equal(mailSectionLabel(new Date(2026, 9, 26, 8).toISOString(), now), 'I går');
assert.equal(mailSectionLabel(new Date(2026, 9, 22, 8).toISOString(), now), 'Forrige uke');
assert.equal(mailSectionLabel(new Date(2026, 9, 5, 8).toISOString(), now), 'Tidligere denne måneden');
assert.equal(mailSectionLabel(new Date(2026, 8, 5, 8).toISOString(), now), 'Forrige måned');
assert.equal(mailSectionLabel(new Date(2025, 8, 5, 8).toISOString(), now), 'Eldre');
assert.equal(mailSectionLabel(null, now), 'Eldre');
const rows = groupMailRows([
  { id: 'a', receivedAt: new Date(2026, 9, 27, 9).toISOString() },
  { id: 'b', receivedAt: new Date(2026, 9, 27, 8).toISOString() },
  { id: 'c', receivedAt: new Date(2026, 9, 26, 8).toISOString() },
], now);
assert.deepEqual(rows.map((r) => r.type), ['head', 'msg', 'msg', 'head', 'msg']);

// Flagg: datoer som i Outlook.
assert.deepEqual(flagPatch('clear'), { flag: { flagStatus: 'notFlagged' } });
const tomorrow = flagPatch('tomorrow', now);
assert.equal(tomorrow.flag.dueDateTime.dateTime, '2026-10-28T00:00:00');
const thisWeek = flagPatch('thisWeek', now);
assert.equal(thisWeek.flag.dueDateTime.dateTime, '2026-10-30T00:00:00');
const nextWeek = flagPatch('nextWeek', now);
assert.equal(nextWeek.flag.startDateTime.dateTime, '2026-11-02T00:00:00');
assert.equal(nextWeek.flag.dueDateTime.dateTime, '2026-11-06T00:00:00');
assert.equal(flagPatch('complete', now).flag.flagStatus, 'complete');
assert.equal(applyFlagLocally({ id: 'x', flagged: false }, tomorrow).flagged, true);
assert.equal(applyFlagLocally({ id: 'x', flagged: true }, flagPatch('complete', now)).flagged, false);

// Kategorier.
assert.equal(categoryColor('Rød kategori'), '#e3424a');
assert.equal(categoryColor('Red category'), '#e3424a');
assert.equal(categoryColor('Prosjekt', [{ displayName: 'Prosjekt', color: 'preset7' }]), '#2f80ed');
assert.match(categoryColor('Noe nytt'), /^#[0-9a-f]{6}$/);
const choices = categoryChoices([], [{ categories: ['Kunde A', 'Rød kategori'] }]);
assert.equal(choices.length, 7);
assert.equal(choices[6].name, 'Kunde A');
assert.deepEqual(toggleCategory(['Rød kategori'], 'rød kategori'), []);
assert.deepEqual(toggleCategory([], 'Blå kategori'), ['Blå kategori']);

// Diverse formatering.
assert.equal(formatBytes(512), '512 B');
assert.equal(formatBytes(2048), '2 kB');
assert.equal(formatBytes(3.5 * 1024 * 1024), '3,5 MB');
assert.equal(formatMailDateLong(new Date(2026, 9, 27, 22, 58).toISOString()), 'tir. 27.10.2026 22:58');
assert.match(quoteHeaderHtml({ from: { name: 'Ola', address: 'o@x.no' }, to: [], subject: 'Hei & ha det' }), /<b>Emne:<\/b> Hei &amp; ha det/);

// Kontaktforslag: hyppige adresser først, uten dem som allerede er lagt til.
let contacts = mergeContacts([], [{ name: 'Anders Rolandsen', address: 'ar@consult1.no' }]);
contacts = mergeContacts(contacts, [{ name: 'Aina Jespersen', address: 'aj@x.no' }, { name: 'Aina Jespersen', address: 'AJ@x.no' }]);
assert.equal(contacts.length, 2);
assert.equal(contacts[0].address, 'aj@x.no');
assert.deepEqual(suggestContacts(contacts, 'a').map((c) => c.address), ['aj@x.no', 'ar@consult1.no']);
assert.deepEqual(suggestContacts(contacts, 'rol').map((c) => c.address), ['ar@consult1.no']);
assert.deepEqual(suggestContacts(contacts, 'a', ['aj@x.no']).map((c) => c.address), ['ar@consult1.no']);

console.log('src/utils/mailModel.test.mjs: ok');
