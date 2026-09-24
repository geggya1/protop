import assert from 'node:assert/strict';
import {
  normalizeRegNumber,
  formatRegNumber,
  isPlausibleRegNumber,
  mapFuelType,
  mapVehicleType,
  normalizeKjoretoydata,
  normalizeKjoretoyResponse,
  holdingFieldsFromLookup,
  fetchKjoretoyPublicRaw,
} from './vegvesenApis.js';

assert.equal(normalizeRegNumber('el 12345'), 'EL12345');
assert.equal(normalizeRegNumber('EV-11 223'), 'EV11223');
assert.equal(formatRegNumber('EL12345'), 'EL 12345');
assert.equal(formatRegNumber('AB12'), 'AB 12');
assert.equal(isPlausibleRegNumber('EL12345'), true);
assert.equal(isPlausibleRegNumber('X'), false);

assert.equal(mapFuelType('Diesel'), 'diesel');
assert.equal(mapFuelType('Bensin'), 'petrol');
assert.equal(mapFuelType('Elektrisk'), 'electric');
assert.equal(mapFuelType('Bensin', { hybrid: true }), 'hybrid');
assert.equal(mapFuelType('', { electricOnly: true }), 'electric');

assert.equal(mapVehicleType('M1'), 'car');
assert.equal(mapVehicleType('N1'), 'van');
assert.equal(mapVehicleType('L3e'), 'motorcycle');
assert.equal(mapVehicleType('L1e'), 'moped');
assert.equal(mapVehicleType('O1'), 'trailer');
assert.equal(mapVehicleType('', 'Personbil'), 'car');

const sample = {
  kjoretoyId: {
    kjennemerke: 'EL 12345',
    understellsnummer: 'WVWZZZ1KZAW123456',
  },
  forstegangsregistrering: {
    registrertForstegangNorgeDato: '2019-03-15',
  },
  periodiskKjoretoyKontroll: {
    kontrollfrist: '2026-04-30',
    sistGodkjent: '2024-04-12',
  },
  godkjenning: {
    tekniskGodkjenning: {
      kjoretoyklassifisering: {
        beskrivelse: 'Personbil',
        tekniskKode: { kodeVerdi: 'M1', kodeNavn: 'M1' },
      },
      tekniskeData: {
        generelt: {
          merke: [{ merke: 'Volkswagen' }],
          handelsbetegnelse: ['Golf'],
        },
        miljodata: {
          miljoOgdrivstoffGruppe: [
            { drivstoffKodeMiljodata: { kodeNavn: 'Elektrisk' } },
          ],
        },
        motorOgDrivverk: {
          utelukkendeElektriskDrift: true,
          hybridElektriskKjoretoy: false,
        },
      },
    },
  },
  registrering: {
    registreringsstatus: { kodeNavn: 'Registrert' },
  },
};

const vehicle = normalizeKjoretoydata(sample);
assert.equal(vehicle.regNumber, 'EL12345');
assert.equal(vehicle.regNumberFormatted, 'EL 12345');
assert.equal(vehicle.make, 'Volkswagen');
assert.equal(vehicle.model, 'Golf');
assert.equal(vehicle.year, '2019');
assert.equal(vehicle.fuelType, 'electric');
assert.equal(vehicle.vehicleType, 'car');
assert.equal(vehicle.euControlKey, '2026-04-30');
assert.equal(vehicle.understellsnummer, 'WVWZZZ1KZAW123456');
assert.match(vehicle.summaryLine, /Volkswagen/);

const listed = normalizeKjoretoyResponse({ kjoretoydataListe: [sample] });
assert.equal(listed.results.length, 1);
assert.equal(listed.results[0].make, 'Volkswagen');

const publicWrapped = normalizeKjoretoyResponse({
  kjoretoy: {
    ...sample,
    eierskap: { eier: { person: { navn: 'SKAL STRIPPES' } } },
  },
});
assert.equal(publicWrapped.results.length, 1);
assert.equal(publicWrapped.results[0].make, 'Volkswagen');
assert.equal(publicWrapped.results[0].raw?.eierskap, undefined);

const patch = holdingFieldsFromLookup(vehicle, { title: 'Familiebilen', notes: 'x' });
assert.equal(patch.title, 'Familiebilen');
assert.equal(patch.make, 'Volkswagen');
assert.equal(patch.euControlKey, '2026-04-30');
assert.ok(patch.vegvesenSyncedAt);

const dieselHybrid = normalizeKjoretoydata({
  kjoretoyId: { kjennemerke: 'AB12345' },
  godkjenning: {
    tekniskGodkjenning: {
      tekniskeData: {
        generelt: {
          merke: [{ merke: 'Toyota' }],
          handelsbetegnelse: ['RAV4'],
        },
        miljodata: {
          miljoOgdrivstoffGruppe: {
            drivstoffKodeMiljodata: { kodeNavn: 'Bensin' },
          },
        },
        motorOgDrivverk: { hybridElektriskKjoretoy: true },
      },
    },
  },
});
assert.equal(dieselHybrid.fuelType, 'hybrid');
assert.equal(dieselHybrid.vehicleType, 'car');

// Live offentlig oppslag (ingen nøkkel) — hopp over ved nettverksfeil.
try {
  const live = await fetchKjoretoyPublicRaw('EN63224');
  assert.equal(live.regNumber, 'EN63224');
  assert.ok(live.make, 'forventet merke');
  assert.ok(live.model || live.year, 'forventet modell eller år');
  console.log(`vegvesenApis.test.mjs: ok (unit + live ${live.make} ${live.model})`);
} catch (e) {
  if (e?.code === 'not-found' || e?.code === 'unavailable' || /fetch|network|ENOTFOUND|ECONN/i.test(String(e?.message))) {
    console.log(`vegvesenApis.test.mjs: ok (unit; live skipped: ${e.message || e})`);
  } else {
    throw e;
  }
}
