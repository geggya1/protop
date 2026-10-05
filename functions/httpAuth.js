/**
 * CORS + Bearer-auth for Hosting rewrites (same-origin POST from protop.no).
 */
import { getAuth } from 'firebase-admin/auth';

export function applyCors(res) {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

export async function requireBearerUid(req, res) {
  const header = String(req.headers.authorization || '');
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    res.status(401).json({ ok: false, error: 'Du må være innlogget.' });
    return null;
  }
  try {
    const decoded = await getAuth().verifyIdToken(token);
    const uid = String(decoded?.uid || '').trim();
    if (!uid) {
      res.status(401).json({ ok: false, error: 'Du må være innlogget.' });
      return null;
    }
    return uid;
  } catch {
    res.status(401).json({ ok: false, error: 'Du må være innlogget.' });
    return null;
  }
}
