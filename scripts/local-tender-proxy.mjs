/**
 * Kjører den ekte tenderProxy-funksjonen lokalt, for å teste endringer før deploy.
 * Lytter bare på 127.0.0.1:8788. Bruk sammen med
 * EXPO_PUBLIC_TENDER_PROXY_URL=http://127.0.0.1:8788/api/tender-proxy
 */
import http from 'node:http';
import { tenderProxy } from '../functions/tenderProxy.js';

const PORT = Number(process.env.PORT) || 8788;

/** Express-metodene funksjonen bruker, lagt på Node-responsen (wrapperen lytter på «finish»). */
function shim(res) {
  res.statusCode = 200;
  res.set = (name, value) => { res.setHeader(name, value); return res; };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };
  res.send = (body) => { res.end(body); };
  return res;
}

http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', async () => {
    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = {};
    }
    const started = Date.now();
    req.body = body;
    await tenderProxy(req, shim(res));
    console.log(`${body.action || 'search'} ${res.statusCode} ${Date.now() - started} ms`);
  });
}).listen(PORT, '127.0.0.1', () => {
  console.log(`tenderProxy lokalt på http://127.0.0.1:${PORT}/api/tender-proxy`);
});
