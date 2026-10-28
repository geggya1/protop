/**
 * Kart-iframes på web (Leaflet + OpenStreetMap i srcDoc).
 *
 * OpenStreetMap blokkerer kartfliser som kommer uten Referer («Access blocked», 403).
 * En sandkasse uten allow-same-origin gir iframen et tomt opphav, og da sender nettleseren
 * aldri Referer. Kartet må derfor ha samme opphav som appen. Fremmed skript stoppes i stedet
 * av en CSP med nonce i selve kartdokumentet: bare Leaflet og vårt eget kartskript kjører.
 */
export const MAP_FRAME_SANDBOX = 'allow-scripts allow-same-origin';

let pageNonce = '';

/**
 * Én tilfeldig nonce per sidelasting. Samme kartdata gir da samme srcDoc, så kartet
 * lastes ikke på nytt ved hver rendering. Lagrede data (anbudstitler, stedsnavn) kan
 * ikke kjenne nonce-en på forhånd.
 */
export function mapScriptNonce() {
  if (pageNonce) return pageNonce;
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  pageNonce = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return pageNonce;
}

/** CSP for kartdokumentet: skript bare med riktig nonce, ingen inline-handlere eller plugins. */
export function mapCspMeta(nonce) {
  return `<meta http-equiv="Content-Security-Policy" content="script-src 'nonce-${nonce}'; object-src 'none'; base-uri 'none'"/>`;
}
