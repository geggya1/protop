/**
 * Web-kamera feilmeldinger / plattformhjelpere for strekkodeskanner.
 * Holdes uten React Native-imports så Node-tester kan kjøre dem.
 */

export function needsCameraUserGesture(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (!nav) return false;
  const ua = nav.userAgent || '';
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  // iPadOS 13+ rapporterer seg som Mac
  if (nav.platform === 'MacIntel' && Number(nav.maxTouchPoints || 0) > 1) return true;
  return false;
}

export function friendlyWebCameraError(err, opts = {}) {
  const name = err?.name || '';
  const msg = String(err?.message || '');
  const insecure = opts.isSecureContext === false
    || (opts.isSecureContext == null
      && typeof window !== 'undefined'
      && window.isSecureContext === false);

  if (insecure) {
    return {
      title: 'Usikker tilkobling',
      body: 'Kamera krever HTTPS. Åpne https://www.protop.no i nettleseren.',
    };
  }
  if (name === 'NotAllowedError' || /not allowed by the user agent/i.test(msg)) {
    return {
      title: 'Kameratilgang trengs',
      body: 'Trykk «Åpne kamera» og tillat tilgang når nettleseren spør. Har du tidligere blokkert kamera, tillat det under nettstedinnstillinger for protop.no.',
    };
  }
  if (name === 'NotFoundError' || /Requested device not found/i.test(msg)) {
    return {
      title: 'Fant ikke kamera',
      body: 'Ingen kamera er tilgjengelig på denne enheten.',
    };
  }
  if (name === 'NotReadableError' || /Could not start video source/i.test(msg)) {
    return {
      title: 'Kamera opptatt',
      body: 'Kameraet brukes av en annen app. Lukk den og prøv igjen.',
    };
  }
  if (name === 'SecurityError') {
    return {
      title: 'Kameratilgang blokkert',
      body: 'Nettleseren blokkerte kamera. Sjekk at du er på https://www.protop.no og at kamera er tillatt.',
    };
  }
  return {
    title: 'Kunne ikke skanne',
    body: msg || 'Klarte ikke starte kamera.',
  };
}
