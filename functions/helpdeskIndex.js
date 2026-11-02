/**
 * Deploy-inngang for ProTop Helpdesk (hjelpesenter, saker, helpdesk-portal).
 * setRegion må lastes først, og geminiEnv før AI-kallene.
 */
import './setRegion.js';
import './geminiEnv.js';

export { helpdesk } from './helpdeskCallable.js';
