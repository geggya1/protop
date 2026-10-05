/**
 * Deploy entry for friendListHttp only.
 * Does not import MAIL_API_KEY, so the GitHub deploy account can ship it.
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export { friendListHttp } from './friendListHttp.js';
