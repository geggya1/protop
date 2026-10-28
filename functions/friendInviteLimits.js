/**
 * Venneinvitasjoner på e-post og SMS (L-33, markedsføringsloven § 15).
 * En invitasjon er én melding som en bruker selv sender. Mottakeren får ingen purringer:
 * - samme avsender kan invitere samme adresse/nummer én gang per 30 dager,
 * - samme adresse/nummer får høyst tre invitasjoner per 30 dager, fra alle avsendere,
 * - «Send på nytt» til en som ikke har konto, sender ingen ny e-post eller SMS,
 * - «Send på nytt» til en som har konto, sender e-post/SMS høyst én gang per 7 dager.
 * Postene ligger i friendInviteDeliveries og friendInviteRecipients (bare server).
 */
import { hashRateKey } from './security.js';

const DAY = 24 * 60 * 60 * 1000;
export const FRIEND_INVITE_REPEAT_MS = 30 * DAY;
export const FRIEND_INVITE_RECIPIENT_MAX = 3;
export const FRIEND_REMINDER_MS = 7 * DAY;

export const FRIEND_INVITE_LIMIT_TEXT = {
  'already-invited': 'Du har allerede invitert denne personen. ProTop sender ikke purringer, men personen kan bruke lenken i den første invitasjonen.',
  'recipient-limit': 'Denne personen har fått flere invitasjoner til ProTop nylig. Vi sender ikke flere nå.',
};

/** Adressen eller nummeret slik det sammenlignes (små bokstaver, uten mellomrom). */
export function inviteRecipientKey(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, '');
}

function millis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (typeof value.toMillis === 'function') return value.toMillis();
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Kan invitasjonen sendes? `lastFromSender`: forrige invitasjon fra samme avsender til samme
 * mottaker. `recentToRecipient`: tidspunktene for invitasjoner til mottakeren.
 */
export function inviteDeliveryDecision({ lastFromSender = 0, recentToRecipient = [], now = Date.now() } = {}) {
  const last = millis(lastFromSender);
  if (last && now - last < FRIEND_INVITE_REPEAT_MS) return { ok: false, reason: 'already-invited' };
  const recent = (recentToRecipient || []).map(millis).filter((t) => t && now - t < FRIEND_INVITE_REPEAT_MS);
  if (recent.length >= FRIEND_INVITE_RECIPIENT_MAX) return { ok: false, reason: 'recipient-limit' };
  return { ok: true, recent: [...recent, now] };
}

/** «Send på nytt» til en med konto: e-post/SMS bare når forrige påminnelse er minst 7 dager gammel. */
export function reminderDeliveryAllowed(lastSentAt, now = Date.now()) {
  const last = millis(lastSentAt);
  return !last || now - last >= FRIEND_REMINDER_MS;
}

/**
 * Reserverer utsendingen i en transaksjon. Svarer { ok } eller { ok: false, reason }.
 * `channel`: 'email' eller 'sms' (egen telling per kanal).
 */
export async function claimFriendInviteDelivery(db, { senderUid, recipient, channel, now = Date.now() }) {
  const to = inviteRecipientKey(recipient);
  if (!senderUid || !to) return { ok: true };
  const pairRef = db.doc(`friendInviteDeliveries/${hashRateKey(['friend-invite', channel, senderUid, to])}`);
  const recipientRef = db.doc(`friendInviteRecipients/${hashRateKey(['friend-invite-to', channel, to])}`);
  return db.runTransaction(async (tx) => {
    const [pair, rec] = await Promise.all([tx.get(pairRef), tx.get(recipientRef)]);
    const decision = inviteDeliveryDecision({
      lastFromSender: pair.exists ? pair.data()?.sentAt : 0,
      recentToRecipient: rec.exists ? rec.data()?.sentAt || [] : [],
      now,
    });
    if (!decision.ok) return decision;
    const expireAt = new Date(now + FRIEND_INVITE_REPEAT_MS);
    tx.set(pairRef, { channel, sentAt: now, expireAt });
    tx.set(recipientRef, { channel, sentAt: decision.recent, expireAt });
    return { ok: true };
  });
}
