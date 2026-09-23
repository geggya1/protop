/**
 * Outlook/ICS/Google calendar callables.
 * Kept out of index.js so they can be deployed without loading MAIL_API_KEY.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { assertRateLimits, hashRateKey, requireAuth } from './security.js';
import { defineString } from 'firebase-functions/params';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as logger from 'firebase-functions/logger';
import {
  handleAddIcsCalendar,
  handleExchangeCalendarOAuth,
  handleExchangeMicrosoftSignIn,
  handleFetchExternalCalendarEvents,
  handleGetCalendarOAuthConfig,
  handleListCalendarConnections,
  handleRemoveCalendarConnection,
} from './calendarIntegration.js';
import {
  handleDeleteMail,
  handleForwardMail,
  handleGetMailMessage,
  handleListMailFolders,
  handleListMailMessages,
  handleReplyMail,
  handleSendMail,
  handleSyncMailbox,
  wrapMailHandler,
} from './outlookMail.js';

const MICROSOFT_CLIENT_ID = defineString('MICROSOFT_CLIENT_ID', {
  default: 'd641e51b-4503-43d8-b2f4-332acb296864',
});
const MICROSOFT_CLIENT_SECRET = defineString('MICROSOFT_CLIENT_SECRET', { default: '' });

function touchMicrosoftCalendarParams() {
  const id = String(MICROSOFT_CLIENT_ID.value() || '').trim();
  const secret = String(MICROSOFT_CLIENT_SECRET.value() || '').trim();
  if (id) process.env.MICROSOFT_CLIENT_ID = id;
  if (secret) process.env.MICROSOFT_CLIENT_SECRET = secret;
  if (!id && process.env.MICROSOFT_CLIENT_ID === undefined) {
    process.env.MICROSOFT_CLIENT_ID = '';
  }
}

if (!getApps().length) initializeApp();
const db = getFirestore();

export const listCalendarConnections = onCall(
  { timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    const uid = requireAuth(req.auth);
    await assertRateLimits(db, {
      key: hashRateKey(['cal-list', uid]),
      hourlyLimit: 60,
      dailyLimit: 250,
    });
    try {
      return await handleListCalendarConnections(req.data, req.auth, db);
    } catch (error) {
      logger.warn('listCalendarConnections failed', { message: error?.message });
      throw new Error(error?.message || 'Klarte ikke hente kalendertilkoblinger.');
    }
  },
);

export const addIcsCalendar = onCall(
  { timeoutSeconds: 45, memory: '256MiB', cors: true },
  async (req) => {
    try {
      return await handleAddIcsCalendar(req.data, req.auth, db);
    } catch (error) {
      logger.warn('addIcsCalendar failed', { message: error?.message });
      throw new Error(error?.message || 'Klarte ikke legge til ICS-kalender.');
    }
  },
);

export const removeCalendarConnection = onCall(
  { timeoutSeconds: 30, memory: '256MiB', cors: true },
  async (req) => {
    try {
      return await handleRemoveCalendarConnection(req.data, req.auth, db);
    } catch (error) {
      logger.warn('removeCalendarConnection failed', { message: error?.message });
      throw new Error(error?.message || 'Klarte ikke fjerne kalenderen.');
    }
  },
);

export const getCalendarOAuthConfig = onCall(
  { timeoutSeconds: 15, memory: '256MiB', cors: true },
  async (req) => {
    try {
      touchMicrosoftCalendarParams();
      return await handleGetCalendarOAuthConfig(req.data, req.auth);
    } catch (error) {
      logger.warn('getCalendarOAuthConfig failed', { message: error?.message });
      throw new Error(error?.message || 'Klarte ikke hente OAuth-oppsett.');
    }
  },
);

export const exchangeCalendarOAuth = onCall(
  { timeoutSeconds: 45, memory: '256MiB', cors: true },
  async (req) => {
    try {
      touchMicrosoftCalendarParams();
      return await handleExchangeCalendarOAuth(req.data, req.auth, db);
    } catch (error) {
      logger.warn('exchangeCalendarOAuth failed', { message: error?.message });
      throw new Error(error?.message || 'Kalender-innlogging feilet.');
    }
  },
);

/** Public (no auth) — Microsoft account login via /oauth/calendar redirect. */
export const exchangeMicrosoftSignIn = onCall(
  { timeoutSeconds: 45, memory: '256MiB', cors: true },
  async (req) => {
    const ip = String(
      req.rawRequest?.headers?.['x-forwarded-for']
      || req.rawRequest?.ip
      || 'anon',
    ).split(',')[0].trim() || 'anon';
    await assertRateLimits(db, {
      key: hashRateKey(['ms-signin', ip]),
      hourlyLimit: 40,
      dailyLimit: 120,
    });
    try {
      touchMicrosoftCalendarParams();
      return await handleExchangeMicrosoftSignIn(req.data || {});
    } catch (error) {
      logger.warn('exchangeMicrosoftSignIn failed', { message: error?.message });
      throw new Error(error?.message || 'Microsoft-innlogging feilet.');
    }
  },
);

export const fetchExternalCalendarEvents = onCall(
  { timeoutSeconds: 60, memory: '512MiB', cors: true },
  async (req) => {
    const uid = requireAuth(req.auth);
    await assertRateLimits(db, {
      key: hashRateKey(['ics-fetch', uid]),
      hourlyLimit: 30,
      dailyLimit: 120,
    });
    try {
      touchMicrosoftCalendarParams();
      return await handleFetchExternalCalendarEvents(req.data, req.auth, db);
    } catch (error) {
      logger.warn('fetchExternalCalendarEvents failed', { message: error?.message });
      throw new Error(error?.message || 'Klarte ikke hente eksterne kalenderhendelser.');
    }
  },
);

function mailCallable(name, handler, fallback, timeoutSeconds = 45, limits = null) {
  return onCall(
    { region: 'europe-west1', timeoutSeconds, memory: '256MiB', cors: true, invoker: 'public' },
    async (req) => {
      const uid = requireAuth(req.auth);
      if (limits) {
        await assertRateLimits(db, {
          key: hashRateKey([`mail-${name}`, uid]),
          hourlyLimit: limits.hourly,
          dailyLimit: limits.daily,
        });
      }
      try {
        touchMicrosoftCalendarParams();
        return await wrapMailHandler(handler, fallback)(req.data, req.auth, db);
      } catch (error) {
        logger.warn(`${name} failed`, { message: error?.message });
        throw new Error(error?.message || fallback);
      }
    },
  );
}

export const listMailFolders = mailCallable(
  'listMailFolders',
  handleListMailFolders,
  'Klarte ikke hente mapper.',
  45,
  { hourly: 80, daily: 300 },
);
export const listMailMessages = mailCallable(
  'listMailMessages',
  handleListMailMessages,
  'Klarte ikke hente e-post.',
  45,
  { hourly: 120, daily: 400 },
);
export const syncOutlookMailbox = mailCallable(
  'syncOutlookMailbox',
  handleSyncMailbox,
  'Klarte ikke synkronisere e-post.',
  45,
  { hourly: 80, daily: 300 },
);
export const getMailMessage = mailCallable(
  'getMailMessage',
  handleGetMailMessage,
  'Klarte ikke åpne meldingen.',
  45,
  { hourly: 200, daily: 800 },
);
export const sendOutlookMail = mailCallable(
  'sendOutlookMail',
  handleSendMail,
  'Klarte ikke sende e-post.',
  45,
  { hourly: 40, daily: 100 },
);
export const replyOutlookMail = mailCallable(
  'replyOutlookMail',
  handleReplyMail,
  'Klarte ikke svare.',
  45,
  { hourly: 40, daily: 100 },
);
export const forwardOutlookMail = mailCallable(
  'forwardOutlookMail',
  handleForwardMail,
  'Klarte ikke videresende.',
  45,
  { hourly: 30, daily: 80 },
);
export const deleteOutlookMail = mailCallable(
  'deleteOutlookMail',
  handleDeleteMail,
  'Klarte ikke slette.',
  45,
  { hourly: 60, daily: 200 },
);
