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
