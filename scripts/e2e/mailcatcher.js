/**
 * Fanger utgående e-post og SMS i flyt-boten. Lastes før funksjonene i
 * emulatoren og erstatter fetch mot Brevo, Resend og SendGrid. Ingenting
 * går ut på nettet; meldingene skrives til E2E_MAIL_LOG som JSON-linjer,
 * så boten kan hente invitasjonslenker og koder derfra.
 */
import { appendFileSync } from 'node:fs';

const LOG = process.env.E2E_MAIL_LOG || '';
const PROVIDERS = /^https:\/\/api\.(brevo\.com|resend\.com|sendgrid\.com)\//;
const realFetch = globalThis.fetch;

globalThis.fetch = async function e2eFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : String(input?.url || '');
  if (!PROVIDERS.test(url)) return realFetch(input, init);
  let body = init?.body;
  try { body = JSON.parse(String(body || '')); } catch { /* behold rå tekst */ }
  const entry = { at: new Date().toISOString(), url, body };
  if (LOG) appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
  const payload = url.includes('sendgrid') ? '' : JSON.stringify({ id: `e2e-${Date.now()}`, messageId: `e2e-${Date.now()}` });
  return new Response(payload, {
    status: url.includes('sendgrid') ? 202 : 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
