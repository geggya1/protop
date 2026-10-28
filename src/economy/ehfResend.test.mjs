import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ehfAlreadySent, ehfResendWanted } from './invoiceDelivery.js';

test('«Send på nytt» når fakturaen er sendt før', () => {
  assert.equal(ehfResendWanted({}), false);
  assert.equal(ehfResendWanted({ sentAt: '2026-10-01' }), true);
  assert.equal(ehfResendWanted({ deliveries: [{ channel: 'ehf', status: 'sent' }] }), true);
  assert.equal(ehfResendWanted({ deliveries: [{ channel: 'ehf', status: 'failed' }] }), false);
});

test('svaret «allerede sendt» gjenkjennes', () => {
  assert.deepEqual(
    ehfAlreadySent({ code: 'functions/already-exists', details: { reason: 'already-sent', providerId: 'p1' } }),
    { providerId: 'p1' },
  );
  assert.equal(ehfAlreadySent({ code: 'functions/aborted', details: { reason: 'in-progress' } }), null);
  assert.equal(ehfAlreadySent({ code: 'functions/internal' }), null);
  assert.equal(ehfAlreadySent(null), null);
});

test('appen registrerer leveransen i stedet for å sende igjen', () => {
  const src = readFileSync(new URL('../../screens/economy/invoice/invoiceActions.js', import.meta.url), 'utf8');
  assert.match(src, /resend: ehfResendWanted\(current\)/);
  assert.match(src, /const already = ehfAlreadySent\(cause\)/);
});
