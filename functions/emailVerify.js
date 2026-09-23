import crypto from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';

/** Tokens last 7 days — survives slow mail delivery and avoids Firebase oob expiry. */
export const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function hashVerifyToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

export async function issueEmailVerifyToken(db, adminAuth, email) {
  const normalized = email.toLowerCase().trim();
  const user = await adminAuth.getUserByEmail(normalized);
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashVerifyToken(token);
  const expiresAt = Date.now() + VERIFY_TTL_MS;

  await db.doc(`emailVerifyTokens/${tokenHash}`).set({
    uid: user.uid,
    email: normalized,
    expiresAt,
    used: false,
    createdAt: FieldValue.serverTimestamp(),
  });

  return { token, uid: user.uid, expiresAt };
}

export async function consumeEmailVerifyToken(db, adminAuth, token) {
  const tokenHash = hashVerifyToken(token);
  const ref = db.doc(`emailVerifyTokens/${tokenHash}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return { ok: false, error: 'Ugyldig lenke. Be om ny e-post fra appen.' };
  }
  const data = snap.data() || {};
  if (data.used) {
    return { ok: false, error: 'Lenken er allerede brukt. Logg inn hvis kontoen er aktiv.' };
  }
  if (!data.expiresAt || data.expiresAt < Date.now()) {
    return { ok: false, error: 'Lenken er utløpt. Be om ny e-post — den er gyldig i 7 dager.' };
  }

  await adminAuth.updateUser(data.uid, { emailVerified: true });
  await ref.update({ used: true, usedAt: FieldValue.serverTimestamp() });
  return { ok: true, uid: data.uid, email: data.email };
}

export function buildVerifyEmailHtml(verifyUrl) {
  return `
    <p>Hei!</p>
    <p>Trykk knappen for å bekrefte e-posten din. Lenken er gyldig i <strong>7 dager</strong>.</p>
    <p>
      <a href="${verifyUrl}"
         target="_self"
         rel="noopener"
         style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:10px;
                text-decoration:none;display:inline-block;font-weight:700">
        Bekreft e-posten
      </a>
    </p>
    <p style="color:#475569;font-size:13px;line-height:1.5">
      Hvis knappen ikke virker, kopier denne adressen:<br/>
      <span style="word-break:break-all">${verifyUrl}</span>
    </p>
    <p style="color:#64748b;font-size:12px">
      E-posten kan bruke noen minutter. Du trenger ikke bekrefte med én gang — lenken utløper ikke med det samme.
    </p>
    <p>Hilsen Weekplan-teamet</p>
  `;
}
