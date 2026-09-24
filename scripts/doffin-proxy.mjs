/**
 * Lokal CORS-proxy så web-klienten kan hente Doffin mens funksjonen ikke kjører.
 * Lytter på 127.0.0.1:8787.
 */
import http from 'node:http';
import { searchDoffinNotices } from '../src/anbud/doffinQuery.js';

const server = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method !== 'POST' || req.url !== '/search') {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    const result = await searchDoffinNotices(body);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err?.message || 'Søk feilet' }));
  }
});

server.listen(8787, '127.0.0.1', () => {
  console.log('Doffin-proxy på http://127.0.0.1:8787/search');
});
