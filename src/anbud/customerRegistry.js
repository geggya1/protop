import { emptyAnbudState, mergeAnbudStates } from './model.js';

/**
 * Slår sammen kundelister uten å la en feilet lesing telle som «ingen kunder».
 * status ok: skyen svarte. status local: bare nettleseren har listen. status error: ingen lesing lyktes.
 */
export function resolveCustomerLoad({
  local,
  remote,
  registryCustomers,
  remoteOk,
  registryOk,
} = {}) {
  let state = local || emptyAnbudState();
  if (remoteOk) state = mergeAnbudStates(state, remote || {});
  if (registryOk) state = mergeAnbudStates(state, { customers: registryCustomers || [] });
  const hasCustomers = (state.customers || []).length > 0;
  let status = 'error';
  if (remoteOk || registryOk) status = 'ok';
  else if (hasCustomers) status = 'local';
  return { state, status };
}

/** Lister kundene fra det lille registeret, uten å lese hele anbudsdokumentet. */
export function pickCustomerList({ cached = [], registryCustomers = [], registryOk = false } = {}) {
  if (registryOk && registryCustomers.length) {
    const customers = mergeAnbudStates(
      { customers: cached },
      { customers: registryCustomers },
    ).customers;
    return { customers, status: 'ok', refreshRegistry: false };
  }
  if (cached.length) {
    return {
      customers: cached,
      status: registryOk ? 'ok' : 'local',
      refreshRegistry: registryOk,
    };
  }
  return { customers: [], status: registryOk ? 'ok' : 'error', refreshRegistry: false };
}

export function withCustomers(state, customers) {
  return mergeAnbudStates(state || emptyAnbudState(), { customers: customers || [] });
}
