import assert from 'node:assert/strict';
import {
  buildSignatureHtml,
  shouldIncludeSignature,
  appendSignatureHtml,
  prepareHtmlForSend,
  parseDataUrl,
  DEFAULT_MAIL_SIGNATURE,
} from './mailSignature.js';
import { normalizeMailComposePrefs, signatureFor } from './mailComposePrefs.js';
import { signatureBlockHtml } from './mailSignature.js';

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

// Gammel feltsignatur blir én HTML-signatur, brukt i nye meldinger og svar.
assert.equal(prefs.signatures.length, 1);
assert.match(prefs.signatures[0].html, /Ada/);
assert.doesNotMatch(prefs.signatures[0].html, /data-wp-signature/);
assert.equal(prefs.signatureNew, 'standard');
assert.equal(signatureFor(prefs, 'reply').id, 'standard');

// Flere signaturer: egen for svar, ukjent id gir ingen signatur.
const multi = normalizeMailComposePrefs({
  signatures: [{ id: 'full', name: 'Full', html: '<b>Geir Ove</b>' }, { id: 'kort', name: 'Kort', html: 'GOA' }],
  signatureNew: 'full',
  signatureReply: 'finnes-ikke',
});
assert.equal(signatureFor(multi, 'new').name, 'Full');
assert.equal(signatureFor(multi, 'reply'), null);
assert.equal(normalizeMailComposePrefs({ signatures: [] }).signatures.length, 0);
assert.equal(signatureBlockHtml(''), '');
assert.equal(signatureBlockHtml('<b>X</b>'), '<div data-wp-signature="1"><div><br></div><b>X</b></div>');

console.log('mailSignature ok');
