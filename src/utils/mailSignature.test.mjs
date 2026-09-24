import assert from 'node:assert/strict';
import {
  buildSignatureHtml,
  shouldIncludeSignature,
  appendSignatureHtml,
  prepareHtmlForSend,
  parseDataUrl,
  DEFAULT_MAIL_SIGNATURE,
} from './mailSignature.js';
import { normalizeMailComposePrefs } from './mailComposePrefs.js';

assert.equal(buildSignatureHtml({ ...DEFAULT_MAIL_SIGNATURE, enabled: false }), '');
assert.equal(buildSignatureHtml({ ...DEFAULT_MAIL_SIGNATURE, enabled: true }), '');

const html = buildSignatureHtml({
  enabled: true,
  name: 'Geir Olsen',
  title: 'Utvikler',
  company: 'Consult1',
  phone: '999 99 999',
  website: 'consult1.no',
  extra: 'Org.nr 123',
  logoDataUrl: 'data:image/png;base64,aaa',
}, { preview: true });
assert.match(html, /Geir Olsen/);
assert.match(html, /Consult1/);
assert.match(html, /data:image\/png;base64,aaa/);

const sent = buildSignatureHtml({
  enabled: true,
  name: 'Geir Olsen',
  logoDataUrl: 'data:image/png;base64,aaa',
}, { preview: false });
assert.match(sent, /cid:signature-logo/);

assert.equal(shouldIncludeSignature({ enabled: true, includeOnNew: true }, 'new'), true);
assert.equal(shouldIncludeSignature({ enabled: true, includeOnReply: false }, 'reply'), false);

const withSig = appendSignatureHtml('<div>Hei</div>', {
  enabled: true,
  includeOnNew: true,
  name: 'Geir',
}, { mode: 'new' });
assert.match(withSig, /data-wp-signature="1"/);
assert.equal(appendSignatureHtml(withSig, { enabled: true, name: 'Geir' }, { mode: 'new' }), withSig);

const prepared = prepareHtmlForSend(
  '<div>Hei<img src="data:image/png;base64,abc"></div>',
  { logoDataUrl: 'data:image/png;base64,abc' },
);
assert.match(prepared.html, /cid:signature-logo/);
assert.equal(prepared.attachments[0].contentBytes, 'abc');
assert.deepEqual(parseDataUrl('data:image/jpeg;base64,xyz'), { mime: 'image/jpeg', contentBytes: 'xyz' });

const prefs = normalizeMailComposePrefs({ fontSize: 99, showBcc: true, signature: { name: 'Ada' } });
assert.equal(prefs.fontSize, 11);
assert.equal(prefs.showBcc, true);
assert.equal(prefs.signature.name, 'Ada');

console.log('mailSignature ok');
