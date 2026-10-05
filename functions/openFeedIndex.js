/**
 * Deploy entry for fetchOpenFeedHttp only.
 * Same-origin Hosting rewrite — the callable OPTIONS preflight from protop.no
 * has no Access-Control-Allow-Origin when IAM/deploy fails.
 */
import './setRegion.js';
import { initializeApp, getApps } from 'firebase-admin/app';

if (!getApps().length) initializeApp();

export { fetchOpenFeedHttp } from './openFeed.js';
