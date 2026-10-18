/**
 * Forslag til kjørelengde, bompasseringer og ferje for en tur.
 * Google Maps gir rute og bomestimat når Routes API svarer.
 * Hver AutoPASS-stasjon ruta krysser registreres fra vegdatabanken.
 */

import { planDrivingRoute } from './drivingRoute.js';
import { chargesForRoute } from './routePlan.js';
import { TOLL_STATIONS } from './tollStations.js';
import { ferryPassages, tollPassagesForRoute } from './tollPassages.js';
import { roundMoney } from '../economy/vat.js';

function googleTollRow(estimate, roundTrip) {
  const passes = roundTrip ? 2 : 1;
  return {
    id: 'google-bom',
    name: roundTrip ? 'Bom langs ruten, tur/retur' : 'Bom langs ruten',
    kind: 'toll',
    passes,
    unitPrice: estimate,
    amount: roundMoney(estimate * passes),
    source: 'google',
  };
}

export async function suggestDriving(from, to, {
  fetchImpl = fetch,
  apiKey = '',
  roundTrip = true,
  stations,
} = {}) {
  const route = await planDrivingRoute(from, to, { fetchImpl, apiKey });
  if (!route) return null;
  const stationList = Array.isArray(stations) ? stations : TOLL_STATIONS;
  let tolls = [];
  let listedPasses = false;
  if (route.source !== 'estimate' && route.points?.length > 1) {
    tolls = tollPassagesForRoute(route.points, stationList, { roundTrip });
    listedPasses = true;
  }
  if (!listedPasses) {
    if (route.tollEstimate > 0) {
      tolls = [googleTollRow(route.tollEstimate, roundTrip)];
    } else {
      tolls = chargesForRoute(route.points, { roundTrip }).filter((row) => row.kind === 'toll');
    }
  } else if (!tolls.length && route.tollEstimate > 0) {
    tolls = [googleTollRow(route.tollEstimate, roundTrip)];
  }
  const ferries = ferryPassages(route.ferries, { roundTrip });
  const catalogFerries = ferries.length
    ? []
    : chargesForRoute(route.points, { roundTrip }).filter((row) => row.kind === 'ferry');
  return {
    oneWayKm: route.oneWayKm,
    points: route.points,
    source: route.source,
    tollEstimate: route.tollEstimate,
    charges: [...tolls, ...ferries, ...catalogFerries],
  };
}
