import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NETWORK_ERROR_TEXT, friendlyCallableError } from './callableErrors.js';

const online = { offline: false };

test('uten nett vises aldri rå «internal» (SOS-17)', () => {
  const internal = Object.assign(new Error('internal'), { code: 'functions/internal' });
  assert.equal(friendlyCallableError(internal, 'Kunne ikke legge til ICS-kalender.', { offline: true }), NETWORK_ERROR_TEXT);
  assert.equal(
    friendlyCallableError(internal, 'Kunne ikke legge til ICS-kalender.', online),
    'Kunne ikke legge til ICS-kalender. Sjekk nettet og prøv igjen.',
  );
  assert.equal(friendlyCallableError(new TypeError('Failed to fetch'), 'X.', online), NETWORK_ERROR_TEXT);
  assert.equal(friendlyCallableError({ code: 'functions/deadline-exceeded', message: 'deadline-exceeded' }, 'X.', online), 'X. Sjekk nettet og prøv igjen.');
});

test('tekniske koder blir norsk tekst, vanlige meldinger slipper gjennom', () => {
  assert.equal(friendlyCallableError({ code: 'functions/permission-denied', message: 'PERMISSION_DENIED: No matching allow statements' }, 'X.', online), 'Du har ikke tilgang til dette.');
  assert.equal(friendlyCallableError({ code: 'functions/unauthenticated', message: 'unauthenticated' }, 'X.', online), 'Du er logget ut. Logg inn på nytt og prøv igjen.');
  assert.equal(friendlyCallableError({ code: 'functions/not-found', message: 'not-found' }, 'X.', online), 'Tjenesten er ikke tilgjengelig akkurat nå. Prøv igjen senere.');
  assert.equal(
    friendlyCallableError({ code: 'resource-exhausted', message: 'For mange kall til listCalendarConnections (8/min).' }, 'X.', online),
    'For mange forsøk på kort tid. Vent litt og prøv igjen.',
  );
  assert.equal(
    friendlyCallableError({ code: 'functions/resource-exhausted', message: 'For mange forespørsler. Prøv igjen senere (15 per time).' }, 'X.', online),
    'For mange forespørsler. Prøv igjen senere (15 per time).',
  );
  assert.equal(friendlyCallableError(new Error('Ugyldig ICS-adresse.'), 'X.', online), 'Ugyldig ICS-adresse.');
  assert.equal(friendlyCallableError(new Error('FirebaseError: functions/foo'), 'Kunne ikke.', online), 'Kunne ikke.');
  assert.equal(friendlyCallableError(null, 'Kunne ikke.', online), 'Kunne ikke.');
  // Outlook-feil går videre til friendlyMicrosoftAuthMessage uendret.
  assert.equal(friendlyCallableError(new Error('AADSTS70008: expired'), 'X.', online), 'AADSTS70008: expired');
});

test('kalender- og e-postinnstillingene bruker meldingene, og e-postfeilen vises i vinduet', () => {
  const cal = readFileSync(new URL('../../screens/v2/CalendarSettingsScreen.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(cal, /showInfo\('Feil', e\?\.message/);
  assert.match(cal, /friendlyCallableError\(e, 'Kunne ikke legge til ICS-kalender\.'\)/);
  const mail = readFileSync(new URL('../../screens/v2/MailHubScreen.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(mail, /setError\(e\?\.message/);
  // Feilen er et objekt ({ text, consent }) etter #555.
  assert.match(mail, /error=\{settingsOpen \? error\?\.text \|\| '' : ''\}/);
  assert.match(mail, /friendlyCallableError\(e, 'Klarte ikke hente kontoer\.'\)/);
  const modal = readFileSync(new URL('../../components/MailSettingsModal.jsx', import.meta.url), 'utf8');
  assert.match(modal, /\{error \? \(/);
  assert.match(modal, /accessibilityRole="alert"/);
});
