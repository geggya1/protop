/**
 * Deploy-inngang for kundeundersøkelsen (Kunder → Kundeundersøkelse og svarsiden /svar/…).
 * Regionen må settes før callable-modulen lastes.
 */
import './setRegion.js';

export { customerSurvey } from './customerSurveyCallable.js';
