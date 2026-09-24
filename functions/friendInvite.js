/**
 * Friend invite email/SMS delivery.
 * Uses WEEKPLAN_MAIL_KEY (CI /.env) or a MAIL_API_KEY secret mount, plus runtime
 * Secret Manager fallback — so GitHub deploy SA can ship these without defineSecret.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { sendMail, friendlyMailError } from './mail.js';
import { sendSms, friendlySmsError, toE164 } from './sms.js';
import { resolveMailApiKey } from './mailApiKey.js';
import {
  requireAuth,
  isValidEmail,
  redactEmail,
  hashRateKey,
  assertRateLimit,
  assertSafeAppContinueUrl,
} from './security.js';
import { buildFriendInviteMessage, buildFriendInviteSms } from './friendInviteCopy.js';

export { buildFriendInviteMessage, buildFriendInviteSms };
export { lookupFriendProfile } from './friendLookup.js';

if (!getApps().length) initializeApp();

const db = getFirestore();

export const sendFriendInviteV2 = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const {
        email, name, fromName, registerUrl, inviteLink, existingUser,
      } = req.data || {};
      if (!isValidEmail(email)) {
        return { ok: false, error: 'Ugyldig e-postadresse' };
      }
      const apiKey = await resolveMailApiKey();
      if (!apiKey) {
        return { ok: false, error: 'E-post er ikke konfigurert (MAIL_API_KEY mangler).' };
      }
      await assertRateLimit(db, {
        key: hashRateKey(['friend-invite-mail', callerUid]),
        limit: 20,
        windowMs: 60 * 60 * 1000,
      });
      const fallbackUrl = `https://www.protop.no/register?email=${encodeURIComponent(email)}`;
      const url = assertSafeAppContinueUrl(registerUrl || inviteLink || fallbackUrl, fallbackUrl);
      await sendMail(
        apiKey,
        buildFriendInviteMessage({
          to: email,
          name,
          fromName,
          registerUrl: url,
          existingUser: existingUser === true,
        }),
      );
      logger.info('✅ [sendFriendInviteV2] E-post sendt', {
        to: redactEmail(email),
        callerUid,
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof HttpsError) {
        return { ok: false, error: error.message };
      }
      logger.error('❌ [sendFriendInviteV2]', { message: error?.message });
      return { ok: false, error: friendlyMailError(error) };
    }
  },
);

export const sendFriendInviteSmsV2 = onCall(
  {
    region: 'europe-west1',
    timeoutSeconds: 30,
    memory: '256MiB',
    cors: true,
  },
  async (req) => {
    try {
      const callerUid = requireAuth(req.auth);
      const {
        phone, name, fromName, registerUrl, existingUser,
      } = req.data || {};
      const to = toE164(phone);
      if (!to) {
        return { ok: false, error: 'Ugyldig telefonnummer. Bruk landskode, f.eks. +47…' };
      }
      const apiKey = await resolveMailApiKey();
      if (!apiKey) {
        return { ok: false, error: 'SMS er ikke konfigurert (MAIL_API_KEY mangler).' };
      }
      await assertRateLimit(db, {
        key: hashRateKey(['friend-invite-sms', callerUid]),
        limit: 10,
        windowMs: 60 * 60 * 1000,
      });
      const fallbackUrl = `https://www.protop.no/register?phone=${encodeURIComponent(to)}`;
      const url = assertSafeAppContinueUrl(registerUrl || fallbackUrl, fallbackUrl);
      await sendSms(apiKey, {
        to,
        content: buildFriendInviteSms({
          name,
          fromName,
          registerUrl: url,
          existingUser: existingUser === true,
        }),
      });
      logger.info('✅ [sendFriendInviteSmsV2] SMS sendt', {
        toLast4: to.slice(-4),
        callerUid,
      });
      return { ok: true, to };
    } catch (error) {
      if (error instanceof HttpsError) {
        return { ok: false, error: error.message };
      }
      logger.error('❌ [sendFriendInviteSmsV2]', { message: error?.message });
      return { ok: false, error: friendlySmsError(error) };
    }
  },
);
