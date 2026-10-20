import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePdfAttachment, providerAttachments } from './mail.js';

test('pdf-vedlegg pakkes for brevo, resend og sendgrid', () => {
  const empty = normalizePdfAttachment(null);
  assert.equal(empty.ok, true);
  assert.equal(empty.attachment, null);
  assert.deepEqual(providerAttachments('brevo', []), {});

  const bad = normalizePdfAttachment({ filename: 'brev.pdf', content: 'ikke base64 ***' });
  assert.equal(bad.ok, false);

  const huge = normalizePdfAttachment({ filename: 'brev.pdf', content: 'A'.repeat(2_000_001) });
  assert.equal(huge.ok, false);

  const file = normalizePdfAttachment({ filename: 'varsel', content: 'JVBERi0=' });
  assert.equal(file.ok, true);
  assert.equal(file.attachment.filename, 'varsel.pdf');
  assert.equal(file.attachment.contentType, 'application/pdf');

  const rows = [file.attachment];
  assert.deepEqual(providerAttachments('brevo', rows), {
    attachment: [{ content: 'JVBERi0=', name: 'varsel.pdf' }],
  });
  assert.deepEqual(providerAttachments('resend', rows), {
    attachments: [{ filename: 'varsel.pdf', content: 'JVBERi0=' }],
  });
  assert.deepEqual(providerAttachments('sendgrid', rows).attachments[0].disposition, 'attachment');
});
