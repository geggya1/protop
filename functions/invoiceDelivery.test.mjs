/**
 * Fakturautsending: filer fra bedriftens mappe og oppslag/sending mot Peppol.
 */
import assert from 'node:assert/strict';
import { allowedPath, storagePathFromUrl } from './invoiceFiles.js';
import { deliverEhf, lookupReceiver, participantId, PeppolNotConfigured } from './peppolProvider.js';

assert.equal(
  storagePathFromUrl('https://firebasestorage.googleapis.com/v0/b/protop-c189c.firebasestorage.app/o/families%2Ff1%2Finvoices%2Finv_1%2FFaktura-1.pdf?alt=media&token=x'),
  'families/f1/invoices/inv_1/Faktura-1.pdf',
);
assert.equal(storagePathFromUrl('https://example.com/a.pdf'), '');
assert.equal(allowedPath('families/f1/invoices/a.pdf', 'f1'), true);
assert.equal(allowedPath('families/f2/invoices/a.pdf', 'f1'), false);
assert.equal(allowedPath('families/f1/../f2/a.pdf', 'f1'), false);
assert.equal(allowedPath('families/f1/a.pdf', ''), false);

assert.equal(participantId('948 243 113'), '0192:948243113');
assert.equal(participantId('12'), '');

const directory = async (url) => {
  assert.ok(url.includes('iso6523-actorid-upis%3A%3A0192%3A948243113'));
  return {
    ok: true,
    json: async () => ({
      matches: [{
        docTypes: [
          { value: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2::Invoice##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1' },
          { value: 'urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2::CreditNote##urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0::2.1' },
        ],
        entities: [{ name: [{ name: 'SOLA KOMMUNE' }] }],
      }],
    }),
  };
};
const hit = await lookupReceiver('948243113', { fetchImpl: directory });
assert.deepEqual(hit, { found: true, invoice: true, creditNote: true, name: 'SOLA KOMMUNE' });
const none = await lookupReceiver('948243113', { fetchImpl: async () => ({ ok: true, json: async () => ({ matches: [] }) }) });
assert.equal(none.found, false);

// Uten avtale: tydelig «ikke koblet».
delete process.env.PEPPOL_API_KEY;
delete process.env.PEPPOL_SEND_URL;
const offline = async () => ({ ok: false, json: async () => ({}) });
await assert.rejects(
  deliverEhf({ xml: '<x/>', senderOrgnr: '916538804', receiverOrgnr: '948243113' }, { fetchImpl: offline }),
  (error) => error instanceof PeppolNotConfigured,
);

// Med avtale: XML-en postes med avsender og mottaker.
process.env.PEPPOL_API_KEY = 'test-key';
process.env.PEPPOL_SEND_URL = 'https://ap.example.com/send';
const sent = await deliverEhf(
  { xml: '<?xml version="1.0"?><Invoice/>', senderOrgnr: '916538804', receiverOrgnr: '948243113', documentId: '16722' },
  {
    fetchImpl: async (url, init) => {
      assert.equal(url, 'https://ap.example.com/send');
      assert.equal(init.headers.authorization, 'Bearer test-key');
      assert.equal(init.headers['x-peppol-sender'], '0192:916538804');
      assert.equal(init.headers['x-peppol-receiver'], '0192:948243113');
      return { ok: true, text: async () => JSON.stringify({ id: 'msg-1', status: 'accepted' }) };
    },
  },
);
assert.deepEqual(sent, { providerId: 'msg-1', status: 'accepted' });

console.log('invoiceDelivery.test.mjs: ok');
