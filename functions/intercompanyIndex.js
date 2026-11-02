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
  icAnswerLinkSettings,
  icListPartnerEmployees,
  icAllocateMembers,
  icRemoveMember,
  icSetNumberSeries,
} from './intercompany.js';
