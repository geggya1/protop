/**
 * Deploy entry for Møter: innkalling og referat på e-post, og AI-hjelp til
 * dagsorden, sammendrag og notater. E-postnøkkelen hentes i kjøring (mailApiKey.js).
 */
import './setRegion.js';
import './geminiEnv.js';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export { sendMeetingMail, aiMeeting } from './meetingDelivery.js';
