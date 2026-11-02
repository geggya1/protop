/**
 * Deploy-inngang for konsernintegrasjon (kall). Regionen må settes før callable-modulene lastes.
 */
import './setRegion.js';

export {
  icRequestLink,
  icRespondLink,
  icWithdrawLink,
  icEndLink,
  icUpdateLinkSettings,
  icListPartnerEmployees,
  icAllocateMembers,
  icRemoveMember,
} from './intercompany.js';
