import assert from 'node:assert/strict';

/** Mirrors PushEnableBanner feedbackForResult for unit coverage. */
function feedbackForResult(result, platform = 'web') {
  if (!result || result.ok) return '';
  switch (result.reason) {
    case 'denied':
      return platform === 'web'
        ? 'Varsler er blokkert. Åpne iPhone-innstillinger → ProTop → Varsler og slå på.'
        : 'Varsler er blokkert i systeminnstillingene.';
    case 'ios-tab':
      return 'Åpne ProTop fra hjemskjerm-ikonet (ikke Safari-fanen), og trykk «Slå på» der.';
    case 'no-sw':
      return 'Klarte ikke starte varsel-tjenesten. Lukk appen helt og åpne den på nytt fra hjemskjermen.';
    case 'subscribe':
      return 'Tillatelse OK, men abonnement feilet. Prøv igjen, eller slett og legg til ProTop på hjemskjermen på nytt.';
    case 'unsupported':
      return 'Denne enheten støtter ikke web-push.';
    case 'permission':
    default:
      return 'Ingen tillatelse ble gitt. Trykk «Slå på» igjen og velg Tillat i dialogen.';
  }
}

assert.equal(feedbackForResult({ ok: true }), '');
assert.match(feedbackForResult({ ok: false, reason: 'denied' }), /blokkert/i);
assert.match(feedbackForResult({ ok: false, reason: 'ios-tab' }), /hjemskjerm/i);
assert.match(feedbackForResult({ ok: false, reason: 'no-sw' }), /varsel-tjenesten/i);
assert.match(feedbackForResult({ ok: false, reason: 'subscribe' }), /abonnement/i);
assert.match(feedbackForResult({ ok: false, reason: 'permission' }), /Tillat/i);
assert.match(feedbackForResult({ ok: false, reason: 'unknown' }), /Tillat/i);

console.log('pushBannerFeedback.test.mjs: ok');
