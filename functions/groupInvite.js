/**
 * Svar på invitasjoner til familie, lag, klasse og bedrift.
 * Medlemskap gis bare når personen selv trykker Godta. For bedrifter knyttes
 * medarbeideren og tilgangsnivået i samme operasjon.
 */
import { onCall } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { levelById } from '../src/access/companyAccess.js';
import { isGroupAdminOf } from '../src/notifications/audience.js';
import {
  claimEmployeeSeatPlan,
  declineEmployeeInvitePlan,
  sentInviteEmployee,
} from '../src/employees/invite.js';
import { clientIpFromHeaders, sanitizeIp } from '../src/employees/usage.js';
import {
  inviteAcceptEmailCheck,
  inviteDeclineEmail,
  inviteExpired,
  inviteFromPlaceholder,
  isCompanyGroupType,
  isConfirmedMember,
  isPendingPlaceholder,
  staleInboxStatus,
} from '../src/utils/groupInviteLogic.js';
import {
  assertRateLimit, emailTrusted, hashRateKey, requireAuth,
} from './security.js';
import { writeUsageEvent } from './usageLog.js';

if (!getApps().length) initializeApp();
const db = getFirestore();

const CALL = {
  region: 'europe-west1',
  timeoutSeconds: 60,
  memory: '256MiB',
  cors: true,
  invoker: 'public',
};

function text(value) {
  return String(value ?? '').trim();
}

function authEmailOf(req) {
  return text(req.auth?.token?.email).toLowerCase();
}

function clientIp(req) {
  const headers = req?.rawRequest?.headers || {};
  return clientIpFromHeaders(headers) || sanitizeIp(req?.rawRequest?.ip || '');
}

function groupDeleted(data) {
  return !data || data.deleted === true || data.hiddenFromApp === true;
}

function groupLabel(family) {
  return text(family?.company?.navn || family?.name) || 'gruppen';
}

function inviteNotice(groupType, familyName) {
  const name = familyName || 'gruppen';
  if (isCompanyGroupType(groupType)) {
    return {
      title: 'Bedriftsinvitasjon',
      body: `Du er invitert inn i bedriften «${name}» på ProTop. Godta eller avslå invitasjonen.`,
    };
  }
  return {
    title: 'Invitasjon',
    body: `Du er invitert til «${name}» på ProTop. Godta eller avslå invitasjonen.`,
  };
}

async function notify(uid, payload) {
  const to = text(uid);
  if (!to) return;
  const id = text(payload.notificationId);
  const ref = id
    ? db.doc(`users/${to}/notifications/${id}`)
    : db.collection(`users/${to}/notifications`).doc();
  await ref.set({
    eventType: payload.eventType,
    title: payload.title,
    body: payload.body,
    familyId: payload.familyId || null,
    inviteId: payload.inviteId || null,
    createdBy: payload.createdBy || null,
    createdAt: FieldValue.serverTimestamp(),
    seen: false,
  }, { merge: true }).catch((error) => {
    logger.warn('invite notification failed', { message: error?.message });
  });
}

/** E-post-plassholdere for samme person i gruppen (ny-bruker-invitasjoner). */
async function placeholdersFor(familyId, emails) {
  const out = [];
  const seen = new Set();
  for (const email of emails) {
    if (!email) continue;
    const snap = await db.collection(`families/${familyId}/parents`).where('email', '==', email).get();
    snap.docs.forEach((row) => {
      if (seen.has(row.id)) return;
      seen.add(row.id);
      out.push(row);
    });
  }
  return out;
}

async function companyEmployees(familyId) {
  const snap = await db.collection(`families/${familyId}/employees`).get();
  return snap.docs.map((row) => ({ id: row.id, ...row.data() }));
}

/**
 * Var den som inviterte administrator i gruppen (samme som assertFamilyAdmin)?
 * Bare eier og adminUids teller. createdBy på gruppen og admin på medlemsdokumentet kan
 * medlemmer skrive selv. invitedBy er avsenderen selv (reglene krever det for nye invitasjoner).
 */
async function inviterIsAdmin(familyId, family, inviterUid) {
  if (!inviterUid) return false;
  return isGroupAdminOf(family, inviterUid);
}

/**
 * matchEmail: kontoens e-post når den er bekreftet, ellers tom (inviteAcceptEmailCheck).
 * Plassholdere, invitasjonslisten og medarbeiderposter knyttes bare på en bekreftet e-post.
 * Ellers gjelder bare uid-en invitasjonen er adressert til (REV-05, SEC-17).
 */
async function acceptInvite({ req, uid, familyId, inviteRef, invite, family, matchEmail = '' }) {
  const authEmail = matchEmail;
  const now = new Date().toISOString();
  const company = isCompanyGroupType(family.type || invite.groupType);
  const familyName = groupLabel(family);

  let seat = null;
  let employee = null;
  if (company) {
    const employees = await companyEmployees(familyId);
    seat = claimEmployeeSeatPlan({ employees, uid, authEmail, now, companyId: familyId });
    // Ledertilgang krever bekreftet e-post lik invitasjonsadressen (SEC-26). Invitasjonen står,
    // og personen kan godta når e-posten er bekreftet (eller administrator knytter posten).
    if (seat.code) return { ok: false, error: seat.code };
    if ((!seat.ok || seat.skipped) && !authEmail) {
      // Medarbeideren venter bare på e-posten, og den er ikke bekreftet: invitasjonen står,
      // og personen kan godta når e-posten er bekreftet.
      const byEmail = claimEmployeeSeatPlan({ employees, uid, authEmail: authEmailOf(req), now, companyId: familyId });
      if (byEmail.ok && !byEmail.skipped) return { ok: false, error: 'email-not-verified' };
    }
    // Bedriftsinvitasjon gjelder bare så lenge en aktiv medarbeider venter på personen.
    // Er medarbeideren slettet, deaktivert eller tatt av en annen, trekkes invitasjonen tilbake.
    if (!seat.ok || seat.skipped) {
      await Promise.all([
        inviteRef.update({ status: 'revoked', revokedAt: now, revokedReason: 'no-employee', updatedAt: now }),
        closeInbox(uid, inviteRef.id, 'revoked', now),
        releasePlaceholder(familyId, family, uid, 'revoked', now),
      ]);
      logger.info('[respondGroupInvite] no active employee', { familyId, inviteId: inviteRef.id, reason: seat.error || 'skipped' });
      return { ok: false, error: 'no-employee' };
    }
    employee = seat.employeeId ? employees.find((row) => row.id === seat.employeeId) || null : null;
  }
  const accessLevel = seat?.accessLevel || '';
  // Admin bare når en administrator inviterte som admin. Andre som kan invitere
  // (f.eks. Øverste leder i en bedrift) kan ikke gi mer enn de har selv.
  const adminInvite = invite.asAdmin === true && await inviterIsAdmin(familyId, family, text(invite.invitedBy));
  const asAdmin = adminInvite || accessLevel === 'administrator';
  const name = text(invite.inviteeName)
    || [employee?.person?.firstName, employee?.person?.lastName].map(text).filter(Boolean).join(' ')
    || text(req.auth?.token?.name);
  const emails = [...new Set([authEmail, text(invite.inviteeEmail).toLowerCase()].filter(Boolean))];

  const memberRef = db.doc(`families/${familyId}/parents/${uid}`);
  const [memberSnap, placeholders] = await Promise.all([
    memberRef.get(),
    placeholdersFor(familyId, emails),
  ]);
  const source = placeholders.find((row) => row.id === text(invite.placeholderId))
    || placeholders.find((row) => row.id !== uid && isPendingPlaceholder(row.data(), row.data()?.email));
  const base = memberSnap.exists ? {} : { ...(source?.data() || {}), createdAt: now };

  const batch = db.batch();
  const familyPatch = {
    members: FieldValue.arrayUnion(uid),
    activeUsers: FieldValue.arrayUnion(uid),
    updatedAt: now,
  };
  if (emails.length) familyPatch.invitedEmails = FieldValue.arrayRemove(...emails);
  if (asAdmin) familyPatch.adminUids = FieldValue.arrayUnion(uid);
  batch.update(db.doc(`families/${familyId}`), familyPatch);

  const memberPatch = {
    ...base,
    uid,
    email: authEmail || text(invite.inviteeEmail).toLowerCase(),
    familyId,
    active: true,
    placeholder: false,
    inviteStatus: 'accepted',
    acceptedAt: now,
    deleted: false,
    archived: false,
    // Kommer personen tilbake (forlot selv, eller ansettelsen ble avsluttet), gjelder ikke
    // utmeldingen lenger. Ellers stenger leftAt for serveren og reglene (REV-04).
    leftAt: FieldValue.delete(),
    leftReason: FieldValue.delete(),
    endedBy: FieldValue.delete(),
    updatedAt: now,
  };
  if (name) memberPatch.name = name;
  if (asAdmin) memberPatch.admin = true;
  else if (!memberSnap.exists) memberPatch.admin = false;
  if (!memberSnap.exists) memberPatch.superAdmin = false;
  delete memberPatch.clientSendsInvite;
  batch.set(memberRef, memberPatch, { merge: true });

  placeholders.forEach((row) => {
    if (row.id === uid) return;
    batch.set(row.ref, {
      deleted: true,
      archived: true,
      active: false,
      placeholder: true,
      inviteStatus: 'accepted',
      migratedToUid: uid,
      updatedAt: now,
    }, { merge: true });
  });

  // Profilens e-post brukes til oppslag. Serveren skriver bare en bekreftet adresse dit.
  const ownEmail = authEmail ? { email: authEmail } : {};
  batch.set(db.doc(`users/${uid}`), {
    uid,
    ...ownEmail,
    familyIds: FieldValue.arrayUnion(familyId),
    updatedAt: now,
  }, { merge: true });
  batch.set(db.doc(`parents/${uid}`), {
    uid,
    ...ownEmail,
    active: true,
    familyIds: FieldValue.arrayUnion(familyId),
    updatedAt: now,
  }, { merge: true });

  batch.update(inviteRef, {
    status: 'accepted',
    acceptedAt: now,
    acceptedBy: uid,
    updatedAt: now,
  });
  batch.set(db.doc(`users/${uid}/familyInvites/${inviteRef.id}`), {
    status: 'accepted',
    acceptedAt: now,
    updatedAt: now,
  }, { merge: true });
  // «Be om å bli med»: forespørselen er besvart når personen er inne.
  if (company) {
    const request = await db.doc(`families/${familyId}/joinRequests/${uid}`).get();
    if (request.exists && request.data()?.status === 'pending') {
      batch.update(request.ref, { status: 'accepted', resolvedAt: now, updatedAt: now });
    }
  }

  if (company && seat?.employeePatch && seat.employeeId) {
    batch.update(db.doc(`families/${familyId}/employees/${seat.employeeId}`), {
      personUid: uid,
      linkStatus: 'linked',
      'company.canLogin': true,
      'invite.status': 'accepted',
      'invite.acceptedAt': now,
      'invite.acceptedUid': uid,
      'invite.email': authEmail || text(employee?.invite?.email).toLowerCase(),
      'invite.accessLevel': accessLevel,
      'invite.error': '',
      updatedAt: now,
    });
  }
  await batch.commit();

  if (company && seat?.employeePatch && seat.employeeId) {
    await writeUsageEvent(db, {
      type: 'invite_accepted',
      companyId: familyId,
      employeeId: seat.employeeId,
      actorUid: uid,
      summary: `Godtok invitasjonen til ${familyName}`,
      detail: { accessLevel: levelById(accessLevel)?.label || accessLevel || '' },
      at: now,
      ip: clientIp(req),
      userAgent: String(req.rawRequest?.headers?.['user-agent'] || '').slice(0, 180),
    }, { trusted: true }).catch((error) => {
      logger.warn('usage log for invite accept failed', { message: error?.message });
    });
  }
  await notify(invite.invitedBy, {
    eventType: 'familyInviteAccepted',
    title: 'Invitasjon godtatt',
    body: `${name || 'Noen'} godtok invitasjonen og er med i «${familyName}».`,
    familyId,
    inviteId: inviteRef.id,
    createdBy: uid,
  });
  return {
    ok: true,
    response: 'accepted',
    familyId,
    familyName,
    groupType: family.type || invite.groupType || 'family',
    accessLevel,
    accessLabel: levelById(accessLevel)?.label || '',
  };
}

/**
 * Avslå. Invitasjonen, innboksen og en ventende plassholder på uid-en avslås alltid. Plassholdere,
 * invitasjonslisten og medarbeiderposter på e-post bare når kontoens bekreftede e-post er adressen
 * invitasjonen ble sendt til (inviteDeclineEmail, samme regel som Godta, REV-23).
 */
async function declineInvite({ req, uid, familyId, inviteRef, invite, family }) {
  const authEmail = inviteDeclineEmail({ invite, authEmail: authEmailOf(req), trusted: emailTrusted(req.auth) });
  const now = new Date().toISOString();
  const company = isCompanyGroupType(family.type || invite.groupType);
  const familyName = groupLabel(family);
  const emails = authEmail ? [authEmail] : [];

  const memberRef = db.doc(`families/${familyId}/parents/${uid}`);
  const [memberSnap, placeholders, employees] = await Promise.all([
    memberRef.get(),
    placeholdersFor(familyId, emails),
    company ? companyEmployees(familyId) : Promise.resolve([]),
  ]);

  const batch = db.batch();
  batch.update(inviteRef, {
    status: 'declined',
    declinedAt: now,
    declinedBy: uid,
    updatedAt: now,
  });
  batch.set(db.doc(`users/${uid}/familyInvites/${inviteRef.id}`), {
    status: 'declined',
    declinedAt: now,
    updatedAt: now,
  }, { merge: true });
  const declinedDoc = {
    inviteStatus: 'declined',
    active: false,
    archived: true,
    deleted: true,
    declinedAt: now,
    updatedAt: now,
  };
  // Et ekte medlemskap røres ikke, bare den ventende plassholderen.
  const memberData = memberSnap.exists ? memberSnap.data() || {} : null;
  if (memberData && (memberData.placeholder === true || memberData.inviteStatus === 'pending')) {
    batch.set(memberRef, declinedDoc, { merge: true });
  }
  placeholders.forEach((row) => {
    if (row.id === uid) return;
    if (!isPendingPlaceholder(row.data(), row.data()?.email)) return;
    batch.set(row.ref, declinedDoc, { merge: true });
  });
  if (emails.length) {
    batch.update(db.doc(`families/${familyId}`), {
      invitedEmails: FieldValue.arrayRemove(...emails),
      updatedAt: now,
    });
  }
  const declined = company ? declineEmployeeInvitePlan({ employees, authEmail, uid, now }) : [];
  declined.forEach((row) => {
    batch.update(db.doc(`families/${familyId}/employees/${row.employeeId}`), {
      'invite.status': 'declined',
      'invite.declinedAt': now,
      'invite.error': '',
      updatedAt: now,
    });
  });
  await batch.commit();

  for (const row of declined) {
    await writeUsageEvent(db, {
      type: 'invite_declined',
      companyId: familyId,
      employeeId: row.employeeId,
      actorUid: uid,
      summary: `Avslo invitasjonen til ${familyName}`,
      at: now,
      ip: clientIp(req),
    }, { trusted: true }).catch(() => {});
  }
  await notify(invite.invitedBy, {
    eventType: 'familyInviteDeclined',
    title: 'Invitasjon avslått',
    body: `${text(invite.inviteeName) || 'Noen'} avslo invitasjonen til «${familyName}».`,
    familyId,
    inviteId: inviteRef.id,
    createdBy: uid,
  });
  return { ok: true, response: 'declined', familyId, familyName, groupType: family.type || invite.groupType || 'family' };
}

/**
 * Ventende plassholder (families/{id}/parents/{uid}) for en eksisterende bruker frigjøres når
 * invitasjonen ikke lenger gjelder. Ellers stopper en ny invitasjon på «invite-pending».
 */
async function releasePlaceholder(familyId, family, uid, status, now) {
  if (isConfirmedMember(family, uid)) return;
  const ref = db.doc(`families/${familyId}/parents/${uid}`);
  const snap = await ref.get();
  const row = snap.exists ? snap.data() || {} : null;
  if (!row || (row.placeholder !== true && row.inviteStatus !== 'pending')) return;
  await ref.set({ inviteStatus: status, active: false, updatedAt: now }, { merge: true });
}

/** Lukk invitasjonen i personens innboks, så invitasjonsvinduet ikke kommer tilbake. */
async function closeInbox(uid, inviteId, status, now) {
  const ref = db.doc(`users/${uid}/familyInvites/${inviteId}`);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.status !== 'pending') return;
  await ref.set({ status, closedAt: now, updatedAt: now }, { merge: true });
}

/**
 * Godta eller avslå en invitasjon. Bare personen invitasjonen gjelder kan svare.
 * Gjelder invitasjonen ikke lenger (finnes ikke, besvart, utløpt, trukket tilbake eller
 * gruppen slettet), lukkes innboksen. Avslå lykkes da alltid; Godta gir feilkoden.
 */
export const respondGroupInvite = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const familyId = text(req.data?.familyId);
  const inviteId = text(req.data?.inviteId);
  const response = text(req.data?.response);
  if (!familyId || !inviteId || !['accepted', 'declined'].includes(response)) {
    return { ok: false, error: 'bad-request' };
  }
  await assertRateLimit(db, {
    key: hashRateKey(['group-invite-respond', uid]),
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  const inviteRef = db.doc(`families/${familyId}/memberInvites/${inviteId}`);
  const [inviteSnap, familySnap] = await Promise.all([
    inviteRef.get(),
    db.doc(`families/${familyId}`).get(),
  ]);
  const now = new Date().toISOString();
  const stale = async (error, status = 'expired') => {
    await closeInbox(uid, inviteId, status, now);
    if (response === 'declined') return { ok: true, response: 'declined', stale: error, familyId };
    return { ok: false, error };
  };
  if (!inviteSnap.exists) return stale('not-found');
  const invite = inviteSnap.data() || {};
  if (text(invite.inviteeUid) !== uid) return stale('forbidden');
  if (invite.status !== 'pending') {
    return stale(invite.status === 'revoked' ? 'revoked' : 'already-handled', staleInboxStatus(invite.status));
  }
  const family = familySnap.exists ? familySnap.data() || {} : null;
  if (groupDeleted(family)) {
    await inviteRef.update({ status: 'cancelled', cancelledAt: now, updatedAt: now }).catch(() => {});
    return stale('gone', 'cancelled');
  }
  if (inviteExpired(invite, new Date(now))) {
    await inviteRef.update({ status: 'expired', expiredAt: now, updatedAt: now });
    await releasePlaceholder(familyId, family, uid, 'expired', now);
    return stale('expired');
  }
  // Invitasjonen gjelder kontoen (inviteeUid). Bekreftet e-post kreves bare når kontoen ble
  // funnet på e-post (REV-05). Ellers knyttes ingenting på den ubekreftede adressen.
  const emailCheck = inviteAcceptEmailCheck({ invite, authEmail: authEmailOf(req), trusted: emailTrusted(req.auth) });
  if (response === 'accepted' && !emailCheck.ok) return { ok: false, error: emailCheck.error };

  const args = {
    req, uid, familyId, inviteRef, invite, family, matchEmail: emailCheck.matchEmail,
  };
  const result = response === 'accepted' ? await acceptInvite(args) : await declineInvite(args);
  logger.info('[respondGroupInvite]', { familyId, inviteId, response, company: isCompanyGroupType(family.type) });
  return result;
});

/**
 * Ny bruker som ble invitert på e-post: når e-posten er bekreftet, legges
 * invitasjonen i innboksen (Godta/Avslå). Ingen blir medlem her.
 * Bekreftet betyr email_verified i tokenet (emailTrusted): Google og Apple, lenken fra ProTop,
 * eller Microsoft når Microsofts eget token bekrefter adressen (confirmMicrosoftEmail).
 */
export const syncMyInvites = onCall(CALL, async (req) => {
  const uid = requireAuth(req.auth);
  const authEmail = authEmailOf(req);
  if (!authEmail) return { ok: true, invites: [] };
  if (!emailTrusted(req.auth)) return { ok: true, skipped: 'email-not-verified', invites: [] };
  await assertRateLimit(db, {
    key: hashRateKey(['group-invite-sync', uid]),
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  const snap = await db.collection('families').where('invitedEmails', 'array-contains', authEmail).limit(20).get();
  const out = [];
  for (const familyDoc of snap.docs) {
    const familyId = familyDoc.id;
    const family = familyDoc.data() || {};
    if (groupDeleted(family) || isConfirmedMember(family, uid)) continue;
    const rows = await placeholdersFor(familyId, [authEmail]);
    // En plassholder som har utløpt (30 dager uten svar), gir ingen invitasjon.
    const placeholder = rows.find((row) => (
      row.id !== uid && isPendingPlaceholder(row.data(), authEmail) && !inviteExpired({ inviteExpiresAt: row.data()?.inviteExpiresAt })
    )) || null;
    let source = placeholder ? { id: placeholder.id, data: placeholder.data() } : null;
    if (!source && isCompanyGroupType(family.type)) {
      // Invitert på nytt fra Ansatte: plassholderen fra en tidligere runde kan være ryddet
      // bort (godtatt, avslått, flyttet til en konto). Medarbeideren med sendt invitasjon gjelder.
      const employee = sentInviteEmployee({ employees: await companyEmployees(familyId), uid, authEmail });
      // Sendt for mer enn 30 dager siden uten svar: utløpt. Send på nytt gir ny frist.
      if (employee && !inviteExpired({ createdAt: employee.invite?.sentAt })) {
        const earlier = rows.map((row) => row.data() || {}).find((row) => text(row.createdBy || row.invitedBy)) || {};
        source = {
          id: '',
          data: {
            name: [employee.person?.firstName, employee.person?.lastName].map(text).filter(Boolean).join(' '),
            createdBy: text(earlier.createdBy || earlier.invitedBy) || text(family.ownerUid || family.createdBy) || null,
          },
        };
      }
    }
    if (!source) continue;

    const pending = await db.collection(`families/${familyId}/memberInvites`)
      .where('inviteeUid', '==', uid)
      .where('status', '==', 'pending')
      .limit(1)
      .get();
    const now = new Date().toISOString();
    let inviteId;
    let invite;
    let existing = pending.empty ? null : pending.docs[0];
    if (existing && inviteExpired(existing.data(), new Date(now))) {
      await existing.ref.update({ status: 'expired', expiredAt: now, updatedAt: now });
      await closeInbox(uid, existing.id, 'expired', now);
      existing = null;
    }
    if (existing) {
      inviteId = existing.id;
      invite = existing.data() || {};
    } else {
      const ref = db.collection(`families/${familyId}/memberInvites`).doc();
      inviteId = ref.id;
      invite = inviteFromPlaceholder({
        placeholder: source.data,
        placeholderId: source.id,
        family,
        familyId,
        uid,
        authEmail,
        now,
      });
      await ref.set(invite);
    }
    await db.doc(`users/${uid}/familyInvites/${inviteId}`).set({ ...invite, inviteId }, { merge: true });
    if (placeholder) await placeholder.ref.set({ inviteId, inviteeUid: uid, updatedAt: now }, { merge: true });
    if (!existing) {
      await notify(uid, {
        eventType: 'familyInvite',
        ...inviteNotice(invite.groupType, invite.familyName),
        familyId,
        inviteId,
        createdBy: invite.invitedBy || null,
        notificationId: `familyInvite_${familyId}_${inviteId}`,
      });
    }
    out.push({ familyId, inviteId, familyName: invite.familyName, groupType: invite.groupType });
  }
  return { ok: true, invites: out };
});

/**
 * Registreringssiden viser hvem som inviterer. Svarer bare når e-posten
 * faktisk er invitert til gruppen, og bare med navn og type.
 */
export const invitePreview = onCall(CALL, async (req) => {
  const familyId = text(req.data?.familyId);
  const email = text(req.data?.email).toLowerCase();
  if (!familyId || !email.includes('@')) return { ok: false };
  await assertRateLimit(db, {
    key: hashRateKey(['invite-preview', req.auth?.uid || clientIp(req) || 'anon']),
    limit: 30,
    windowMs: 60 * 60 * 1000,
  });
  const snap = await db.doc(`families/${familyId}`).get();
  const family = snap.exists ? snap.data() || {} : null;
  if (groupDeleted(family)) return { ok: false };
  const invited = Array.isArray(family.invitedEmails) && family.invitedEmails.includes(email);
  if (!invited) return { ok: false };
  return { ok: true, name: groupLabel(family), type: text(family.type) || 'family' };
});
