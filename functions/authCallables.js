/**
 * Innlogging, invitasjon og passord uten defineSecret.
 * Slim-deployen kan dermed sende funksjonene uten Secret Manager-tilgang
 * på deploy-kontoen. Nøkkelen leses i kjøringen via resolveMailApiKey.
 */
import './setRegion.js';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import * as logger from 'firebase-functions/logger';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { sendMail, friendlyMailError } from './mail.js';
import { buildInviteMessage, escapeHtml } from './inviteMessage.js';
import { sendSms, friendlySmsError, buildInviteSms, toE164 } from './sms.js';
import {
  issueEmailVerifyToken,
  consumeEmailVerifyToken,
  buildVerifyEmailHtml,
  VERIFY_TTL_MS,
} from './emailVerify.js';
import { resolveMailApiKey } from './mailApiKey.js';
import { loadSenderName } from './senderName.js';
import {
  assertCanInvite,
  assertRateLimit,
  assertSafeAppContinueUrl,
  hashRateKey,
  isFamilyOwnerOrAdmin,
  isValidEmail,
  listedOnFamily,
  redactEmail,
  requireAuth,
} from './security.js';
import { childHomeAnchored, memberPasswordDecision } from './memberPassword.js';
import { confirmMicrosoftEmailFor } from './microsoftEmail.js';
import { findVerifiedPhoneUid } from './verifiedPhone.js';

if (!getApps().length) initializeApp();
const db = getFirestore();
const adminAuth = getAuth();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 30,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

async function resolveGroupContext({ familyId, familyName, groupType }) {
  let name = String(familyName || '').trim();
  let type = String(groupType || '').trim();
  if (familyId && (!name || !type)) {
    try {
      const snap = await db.doc(`families/${familyId}`).get();
      if (snap.exists) {
        const d = snap.data() || {};
        if (!name) name = String(d.name || '').trim();
        if (!type) type = String(d.type || '').trim();
      }
    } catch (err) {
      logger.warn('Kunne ikke hente gruppenavn for invitasjon', { familyId, message: err?.message });
    }
  }
  return {
    familyName: name || familyId || 'gruppen',
    groupType: type || 'family',
  };
}

function phoneLookupCandidates(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return [];
  const digits = trimmed.replace(/\D/g, '');
  const out = new Set();
  if (trimmed) out.add(trimmed);
  if (digits) {
    out.add(digits);
    out.add(`+${digits}`);
  }
  const e164 = toE164(trimmed);
  if (e164) out.add(e164);
  if (digits.length === 8) {
    out.add(`+47${digits}`);
    out.add(`47${digits}`);
  }
  if (digits.length === 10 && digits.startsWith('47')) {
    out.add(`+${digits}`);
    out.add(digits.slice(2));
  }
  return [...out].filter((v) => String(v).replace(/\D/g, '').length >= 8);
}

/**
 * Bedriftsadmin skal kunne invitere en hel importert ansattliste. Andre grupper
 * (og bedrifter der kalleren ikke er admin) beholder den lave grensen.
 */
const ORG_INVITE_LIMIT = 200;

async function orgAdminLimit(callerUid, familyId, base) {
  const id = String(familyId || '').trim();
  if (!id) return base;
  try {
    const fam = await assertCanInvite(db, id, callerUid);
    const type = String(fam.data()?.type || '').toLowerCase();
    return ['organization', 'company'].includes(type) ? ORG_INVITE_LIMIT : base;
  } catch {
    return base;
  }
}

function publicAdultProfile(uid, data = {}) {
  return {
    uid,
    username: data.username || '',
    usernameLower: String(data.usernameLower || data.username || '').toLowerCase(),
    name: data.displayName || data.name || 'Bruker',
    phone: '',
    photoURL: data.photoURL || null,
    avatarId: data.avatarId || null,
  };
}

export const sendInviteV2 = onCall(CALL, async (req) => {
  try {
    const callerUid = requireAuth(req.auth);
    const {
      email, name, familyId, familyName, groupType, registerUrl, inviteLink,
      existingUser, inviteKind,
    } = req.data || {};
    if (!isValidEmail(email)) return { ok: false, error: 'Ugyldig e-postadresse' };
    if (!familyId) return { ok: false, error: 'Mangler gruppe.' };
    await assertCanInvite(db, familyId, callerUid);
    await assertRateLimit(db, {
      key: hashRateKey(['invite-mail', callerUid]),
      limit: await orgAdminLimit(callerUid, familyId, 20),
      windowMs: 60 * 60 * 1000,
    });
    const ctx = await resolveGroupContext({ familyId, familyName, groupType });
    const isExisting = existingUser === true || inviteKind === 'existing';
    const fallbackUrl = `https://www.protop.no/register?email=${encodeURIComponent(email)}&familyId=${encodeURIComponent(familyId)}`;
    const url = assertSafeAppContinueUrl(registerUrl || inviteLink || fallbackUrl, fallbackUrl);
    const apiKey = await resolveMailApiKey();
    if (!apiKey) return { ok: false, error: 'E-post er ikke konfigurert (MAIL_API_KEY mangler).' };
    // Hvem som inviterte: den innloggede avsenderen, slått opp her (ANSATT-05).
    const inviterName = await loadSenderName(db, callerUid, { familyId, tokenName: req.auth?.token?.name });
    await sendMail(apiKey, buildInviteMessage({
      to: email,
      name,
      familyId,
      familyName: ctx.familyName,
      groupType: ctx.groupType,
      registerUrl: url,
      existingUser: isExisting,
      inviterName,
    }));
    logger.info('[sendInviteV2] E-post sendt', {
      to: redactEmail(email),
      familyId,
      familyName: ctx.familyName,
      callerUid,
    });
    return { ok: true, familyName: ctx.familyName, groupType: ctx.groupType };
  } catch (error) {
    if (error instanceof HttpsError) return { ok: false, error: error.message };
    logger.error('[sendInviteV2] Feil ved e-postutsending', { message: error?.message });
    return { ok: false, error: friendlyMailError(error) };
  }
});

export const sendInviteSmsV2 = onCall(CALL, async (req) => {
  try {
    const callerUid = requireAuth(req.auth);
    const {
      phone, name, familyId, familyName, groupType, joinCode, registerUrl,
      existingUser, inviteKind,
    } = req.data || {};
    const to = toE164(phone);
    if (!to) return { ok: false, error: 'Ugyldig telefonnummer. Bruk landskode, f.eks. +47…' };
    if (!familyId) return { ok: false, error: 'Mangler gruppe.' };
    await assertCanInvite(db, familyId, callerUid);
    await assertRateLimit(db, {
      key: hashRateKey(['invite-sms', callerUid]),
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    const ctx = await resolveGroupContext({ familyId, familyName, groupType });
    const isExisting = existingUser === true || inviteKind === 'existing';
    const fallbackUrl = `https://www.protop.no/register?familyId=${encodeURIComponent(familyId)}&phone=${encodeURIComponent(to)}`;
    const url = assertSafeAppContinueUrl(registerUrl || fallbackUrl, fallbackUrl);
    const apiKey = await resolveMailApiKey();
    if (!apiKey) return { ok: false, error: 'SMS er ikke konfigurert (MAIL_API_KEY mangler).' };
    const inviterName = await loadSenderName(db, callerUid, { familyId, tokenName: req.auth?.token?.name });
    await sendSms(apiKey, {
      to,
      content: buildInviteSms({
        name,
        familyName: ctx.familyName,
        groupType: ctx.groupType,
        joinCode,
        registerUrl: url,
        existingUser: isExisting,
        inviterName,
      }),
    });
    logger.info('[sendInviteSmsV2] SMS sendt', { toLast4: to.slice(-4), callerUid });
    return { ok: true, to, familyName: ctx.familyName, groupType: ctx.groupType };
  } catch (error) {
    if (error instanceof HttpsError) return { ok: false, error: error.message };
    logger.error('[sendInviteSmsV2] Feil ved SMS-utsending', { message: error?.message });
    return { ok: false, error: friendlySmsError(error) };
  }
});

export const sendEmailVerificationV2 = onCall(CALL, async (req) => {
  try {
    const { email, continueUrl } = req.data || {};
    if (!isValidEmail(email)) return { ok: false, error: 'Ugyldig e-postadresse' };
    const callerUid = req.auth?.uid || null;
    const callerEmail = String(req.auth?.token?.email || '').toLowerCase();
    const target = String(email).trim().toLowerCase();
    if (callerUid && callerEmail && callerEmail !== target) {
      return { ok: false, error: 'Du kan bare bekrefte din egen e-post.' };
    }
    await assertRateLimit(db, {
      key: hashRateKey(['email-verify', callerUid || target]),
      limit: callerUid ? 8 : 3,
      windowMs: 60 * 60 * 1000,
    });
    const safeContinueUrl = assertSafeAppContinueUrl(continueUrl, 'https://www.protop.no/verify-email');
    const started = Date.now();
    const { token } = await issueEmailVerifyToken(db, adminAuth, email);
    const verifyUrl = `${safeContinueUrl.replace(/\/$/, '')}?vt=${token}`;
    const apiKey = await resolveMailApiKey();
    if (!apiKey) return { ok: false, error: 'E-post er ikke konfigurert (MAIL_API_KEY mangler).' };
    await sendMail(apiKey, {
      to: email,
      subject: 'Bekreft e-posten din – ProTop',
      text:
        `Hei!\n\nBekreft e-posten din (lenken er gyldig i 7 dager):\n${verifyUrl}\n\n`
        + 'E-posten kan bruke noen minutter — lenken utløper ikke med det samme.\n\nHilsen ProTop',
      html: buildVerifyEmailHtml(verifyUrl),
    });
    logger.info('[sendEmailVerificationV2] Sendt', {
      email: redactEmail(email),
      verifyTtlDays: VERIFY_TTL_MS / 86400000,
      totalMs: Date.now() - started,
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) return { ok: false, error: error.message };
    logger.error('[sendEmailVerificationV2] Feil ved utsending', { message: error?.message });
    return { ok: false, error: friendlyMailError(error) };
  }
});

export const confirmEmailVerificationV2 = onCall(CALL, async (req) => {
  try {
    const { token } = req.data || {};
    if (!token || String(token).length < 20) return { ok: false, error: 'Mangler bekreftelseslenke.' };
    await assertRateLimit(db, {
      key: hashRateKey(['confirm-verify', String(token).slice(0, 16)]),
      limit: 10,
      windowMs: 60 * 60 * 1000,
    });
    const result = await consumeEmailVerifyToken(db, adminAuth, token);
    if (!result.ok) return result;
    logger.info('[confirmEmailVerificationV2] Bekreftet', { uid: result.uid, email: redactEmail(result.email) });
    return { ok: true, email: result.email };
  } catch (error) {
    if (error instanceof HttpsError) return { ok: false, error: error.message };
    logger.error('[confirmEmailVerificationV2]', { message: error?.message });
    return { ok: false, error: error?.message || 'Kunne ikke bekrefte e-post' };
  }
});

export const sendPasswordResetV2 = onCall(CALL, async (req) => {
  try {
    const { email, continueUrl } = req.data || {};
    if (!isValidEmail(email)) return { ok: false, error: 'Ugyldig e-postadresse' };
    await assertRateLimit(db, {
      key: hashRateKey(['pwd-reset', String(email).trim().toLowerCase()]),
      limit: 5,
      windowMs: 60 * 60 * 1000,
    });
    const safeContinueUrl = assertSafeAppContinueUrl(continueUrl, 'https://www.protop.no/login');
    const resetLink = await adminAuth.generatePasswordResetLink(email, {
      url: safeContinueUrl,
      handleCodeInApp: false,
    });
    const apiKey = await resolveMailApiKey();
    if (!apiKey) return { ok: false, error: 'E-post er ikke konfigurert (MAIL_API_KEY mangler).' };
    await sendMail(apiKey, {
      to: email,
      subject: 'Tilbakestill passordet ditt – ProTop',
      text:
        `Hei!\n\nKlikk lenken for å velge et nytt passord:\n${resetLink}\n\n`
        + 'Hvis du ikke ba om dette, kan du se bort fra e-posten.\n\nHilsen ProTop',
      html: `
        <p>Hei!</p>
        <p>Klikk lenken for å velge et nytt passord:</p>
        <p><a href="${resetLink}">Velg nytt passord</a></p>
        <p style="color:#475569;font-size:13px">Hvis knappen ikke virker: <br/>${escapeHtml(resetLink)}</p>
        <p>Hvis du ikke ba om dette, kan du se bort fra e-posten.</p>
      `,
    });
    logger.info('[sendPasswordResetV2] Sendt', { email: redactEmail(email) });
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) return { ok: false, error: error.message };
    logger.error('[sendPasswordResetV2] Feil ved utsending', { message: error?.message });
    const msg = String(error?.message || '');
    if (/user-not-found|EMAIL_NOT_FOUND|auth\/user-not-found/i.test(msg)) return { ok: true };
    return { ok: false, error: friendlyMailError(error) };
  }
});

/** Alle grupper kontoen er med i (eier, administrator eller medlemslistene). */
async function groupsOfAccount(uid) {
  const snaps = await Promise.all([
    db.collection('families').where('members', 'array-contains', uid).limit(50).get(),
    db.collection('families').where('activeUsers', 'array-contains', uid).limit(50).get(),
    db.collection('families').where('memberIds', 'array-contains', uid).limit(50).get(),
    db.collection('families').where('adminUids', 'array-contains', uid).limit(50).get(),
    db.collection('families').where('ownerUid', '==', uid).limit(50).get(),
  ]);
  const byId = new Map();
  for (const snap of snaps) snap.docs.forEach((row) => byId.set(row.id, { id: row.id, ...row.data() }));
  return [...byId.values()];
}

/**
 * Passord lagres aldri i Firestore (SEC-21): gamle lesbare kopier slettes. På barnets
 * dokumenter merkes bare at passordet er satt (passwordSetAt), så foresatte ser «Satt».
 * Foresatte ser passordet én gang når de setter det, og setter et nytt om barnet glemmer det.
 * Bare dokumenter som finnes oppdateres: kallet skal aldri lage medlemsdokumenter.
 */
export async function writeMemberPasswordCopies(store, { uid, familyId, isChildMember }) {
  const wipe = { password: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() };
  const keep = { password: FieldValue.delete(), passwordSetAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() };
  const paths = [`parents/${uid}`, `users/${uid}`];
  const childPaths = [`children/${uid}`];
  if (familyId) {
    childPaths.push(`families/${familyId}/children/${uid}`);
    paths.push(`families/${familyId}/parents/${uid}`);
  }
  const jobs = [
    ...paths.map((path) => [path, wipe]),
    ...childPaths.map((path) => [path, isChildMember ? keep : wipe]),
  ].map(async ([path, patch]) => {
    const ref = store.doc(path);
    const snap = await ref.get();
    if (snap.exists) await ref.update(patch);
  });
  await Promise.all(jobs.map((job) => job.catch(() => {})));
}

export const setMemberPassword = onCall(CALL, async (req) => {
  try {
    const caller = req.auth?.uid;
    if (!caller) return { ok: false, error: 'Du må være innlogget.' };
    const { uid, password } = req.data || {};
    const familyId = String(req.data?.familyId || '').trim();
    const pwd = String(password || '');
    if (!uid || pwd.length < 6) return { ok: false, error: 'Passordet må ha minst 6 tegn.' };
    if (pwd.length > 128) return { ok: false, error: 'Passordet er for langt.' };
    if (familyId.includes('/') || String(uid).includes('/')) return { ok: false, error: 'Mangler gruppe.' };
    if (uid !== caller && !familyId) return { ok: false, error: 'Mangler gruppe.' };
    await assertRateLimit(db, {
      key: hashRateKey(['member-password', caller]),
      limit: 30,
      windowMs: 60 * 60 * 1000,
    });

    let family = null;
    let memberDoc = null;
    let isChildMember = false;
    let groups = [];
    if (familyId) {
      const [famSnap, child, parent] = await Promise.all([
        db.doc(`families/${familyId}`).get(),
        db.doc(`families/${familyId}/children/${uid}`).get(),
        db.doc(`families/${familyId}/parents/${uid}`).get(),
      ]);
      family = famSnap.exists ? famSnap.data() || {} : null;
      memberDoc = child.exists ? child.data() || {} : (parent.exists ? parent.data() || {} : null);
      isChildMember = child.exists;
    } else {
      isChildMember = (await db.doc(`children/${uid}`).get()).exists;
    }
    if (uid !== caller) {
      // Kontoen må tilhøre gruppen før vi slår opp i Auth eller i andre grupper.
      if (!family || !isFamilyOwnerOrAdmin(family, caller)) return { ok: false, error: 'Bare admin kan gjøre dette.' };
      groups = await groupsOfAccount(uid);
    }
    const authUser = await adminAuth.getUser(uid).catch(() => null);
    // Barnets egen familie (children/{uid}.familyId): der bestemmer foresatte med admin (REV-14).
    let home = null;
    if (uid !== caller && authUser) {
      const childSnap = await db.doc(`children/${uid}`).get();
      const homeId = childSnap.exists ? String(childSnap.data()?.familyId || '').trim() : '';
      const anchored = homeId && !homeId.includes('/') && childHomeAnchored({
        childCreatedMs: childSnap.createTime?.toMillis?.() || 0,
        authCreatedMs: Date.parse(authUser.metadata?.creationTime || ''),
      });
      if (anchored) {
        const homeSnap = homeId === familyId ? null : await db.doc(`families/${homeId}`).get();
        const data = homeId === familyId ? family : (homeSnap?.exists ? homeSnap.data() || {} : null);
        home = data ? { id: homeId, ...data } : null;
      }
    }
    const decision = memberPasswordDecision({
      caller, uid, family, memberDoc, groups, authUser, home,
    });
    if (!decision.ok) {
      logger.warn('[setMemberPassword] avvist', { caller, uid, familyId, error: decision.error });
      return { ok: false, error: decision.error };
    }
    // Egen konto: bare medlemskap i gruppen gir den lesbare kopien.
    if (uid === caller && familyId && !(family && listedOnFamily(family, uid))) isChildMember = false;

    await adminAuth.updateUser(uid, { password: pwd });
    await writeMemberPasswordCopies(db, {
      uid,
      familyId: family ? familyId : '',
      isChildMember,
    });
    logger.info('[setMemberPassword] passord satt', { caller, uid, familyId, self: uid === caller });
    return { ok: true };
  } catch (error) {
    if (error instanceof HttpsError) return { ok: false, error: error.message };
    logger.error('[setMemberPassword]', { message: error?.message });
    return { ok: false, error: error?.message || 'Kunne ikke endre passord' };
  }
});

/**
 * Etter Microsoft-innlogging: klienten sender Microsofts ID-token. Sier Microsoft at
 * e-posten er bekreftet (se microsoftEmail.js), merkes Firebase-kontoen som bekreftet,
 * og invitasjoner på e-post kan knyttes. Ellers må personen bekrefte e-posten selv.
 */
export const confirmMicrosoftEmail = onCall(CALL, async (req) => {
  try {
    const uid = requireAuth(req.auth);
    const idToken = String(req.data?.idToken || '');
    if (!idToken || idToken.length > 20000) return { ok: false, error: 'bad-token' };
    await assertRateLimit(db, {
      key: hashRateKey(['ms-email', uid]),
      limit: 20,
      windowMs: 60 * 60 * 1000,
    });
    const res = await confirmMicrosoftEmailFor(uid, idToken, { auth: adminAuth });
    logger.info('[confirmMicrosoftEmail]', { uid, ok: res.ok, verified: !!res.verified, reason: res.reason || res.error || '' });
    return res;
  } catch (error) {
    if (error instanceof HttpsError) return { ok: false, error: error.message };
    logger.error('[confirmMicrosoftEmail]', { message: error?.message });
    return { ok: false, error: 'failed' };
  }
});

/**
 * Oppslaget e-post/telefon/brukernavn → uid er bare for den som kan invitere til gruppen
 * (SEC-22). Andre får ingen profil, så uid-er og kontoer ikke kan kartlegges.
 */
export const LOOKUP_FORBIDDEN = 'Bare den som kan invitere til gruppen, kan slå opp brukere.';

export const lookupAdultProfile = onCall(
  { ...CALL, timeoutSeconds: 20 },
  async (req) => {
    try {
      const caller = requireAuth(req.auth);
      const familyId = String(req.data?.familyId || '').trim();
      const family = familyId && !familyId.includes('/')
        ? await assertCanInvite(db, familyId, caller).catch(() => null)
        : null;
      if (!family) return { ok: false, error: LOOKUP_FORBIDDEN, profile: null };
      const type = String(family.data()?.type || '').toLowerCase();
      await assertRateLimit(db, {
        key: hashRateKey(['lookup-adult', caller]),
        limit: ['organization', 'company'].includes(type) ? ORG_INVITE_LIMIT : 40,
        windowMs: 60 * 60 * 1000,
      });
      const identifier = String(req.data?.identifier || '').trim();
      if (!identifier) return { ok: true, profile: null };

      const looksLikeEmail = identifier.includes('@') && isValidEmail(identifier);
      if (looksLikeEmail) {
        const email = identifier.toLowerCase();
        const usersSnap = await db.collection('users').where('email', '==', email).limit(3).get();
        for (const d of usersSnap.docs) {
          const data = d.data() || {};
          if (data.role === 'child' || data.type === 'child') continue;
          return { ok: true, profile: publicAdultProfile(d.id, data) };
        }
        const parentsSnap = await db.collection('parents').where('email', '==', email).limit(5).get();
        for (const d of parentsSnap.docs) {
          const data = d.data() || {};
          if (data.placeholder === true && !data.uid) continue;
          const uid = data.uid || (String(d.id).length >= 20 ? d.id : null);
          if (!uid) continue;
          return { ok: true, profile: publicAdultProfile(uid, data) };
        }
        return { ok: true, profile: null };
      }

      const phoneCandidates = phoneLookupCandidates(identifier);
      const looksLikePhone = !identifier.includes('@') && phoneCandidates.length > 0
        && /^\+?[\d\s().-]+$/.test(identifier);
      if (looksLikePhone) {
        // Bare et nummer kontoen har bekreftet med SMS (Auth phoneNumber). users.phone og
        // parents.phone skriver brukeren selv, så de kan peke på en annens nummer (REV-22).
        // Uten treff inviterer appen nummeret med SMS, og personen godtar selv.
        const uid = await findVerifiedPhoneUid(phoneCandidates, adminAuth);
        if (!uid) return { ok: true, profile: null };
        const [userSnap, parentSnap] = await Promise.all([
          db.doc(`users/${uid}`).get(),
          db.doc(`parents/${uid}`).get(),
        ]);
        const userData = userSnap.exists ? userSnap.data() || {} : {};
        if (userData.role === 'child' || userData.type === 'child') return { ok: true, profile: null };
        const parentData = parentSnap.exists ? parentSnap.data() || {} : {};
        return { ok: true, profile: publicAdultProfile(uid, { ...parentData, ...userData }) };
      }

      const u = identifier.toLowerCase().replace(/^@/, '');
      if (u.length < 3) return { ok: true, profile: null };
      const unameSnap = await db.doc(`usernames/${u}`).get();
      if (unameSnap.exists) {
        const data = unameSnap.data() || {};
        if (data.type === 'child') return { ok: true, profile: null };
        const uid = data.uid;
        if (!uid) return { ok: true, profile: null };
        const [userSnap, parentSnap] = await Promise.all([
          db.doc(`users/${uid}`).get(),
          db.doc(`parents/${uid}`).get(),
        ]);
        const userData = userSnap.exists ? userSnap.data() : {};
        const parentData = parentSnap.exists ? parentSnap.data() : {};
        return {
          ok: true,
          profile: publicAdultProfile(uid, {
            ...parentData,
            ...userData,
            username: userData.username || parentData.username || u,
            usernameLower: u,
            name: userData.displayName || userData.name || parentData.name || u,
            photoURL: userData.photoURL || parentData.photoURL || null,
            avatarId: userData.avatarId || parentData.avatarId || null,
          }),
        };
      }
      return { ok: true, profile: null };
    } catch (error) {
      if (error instanceof HttpsError) return { ok: false, error: error.message, profile: null };
      logger.error('[lookupAdultProfile]', { message: error?.message });
      return { ok: false, error: error?.message || 'Oppslag feilet', profile: null };
    }
  },
);
