import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { salvageTruncatedJson } from './timetableParse.js';

/** Gratis-nivå grenser — juster ved kommersialisering / betalt tier. */
export const AI_LIMITS = {
  /** Maks AI-import analyser per familie per dag (kun vellykkede / fullførte analyser) */
  importsPerFamilyPerDay: 20,
  /** Maks chat-meldinger per bruker per dag (foresatte) */
  chatPerUserPerDay: 40,
  /** Maks chat-meldinger per barn per dag (lokal motor, ingen API-kostnad) */
  chatPerChildPerDay: 50,
  /** Maks Leksehjelpen-turer per bruker per dag (litt slakk så barn ikke treffer tak midt i lekseøkt) */
  tutorPerUserPerDay: 50,
  /** Maks bildestørrelse (bytes) etter komprimering */
  maxImageBytes: 1_500_000,
  /** Maks PDF/dokument (bytes) for ukeplan-import */
  maxDocumentBytes: 4_000_000,
  /** Maks AI-middags-handlelister per familie per dag */
  mealsPerFamilyPerDay: 15,
  /** Maks ventende utkast per barn (unngår opphopning) */
  maxPendingDraftsPerChild: 3,
  /** Maks forslag fra én bildeanalyse (ukeplan kan ha 20+ timer + huskelapper) */
  maxSuggestions: 60,
  /** Utkast utløper etter (ms) */
  draftTtlMs: 48 * 60 * 60 * 1000,
  /** Behold godkjente/avviste utkast-metadata i (dager), deretter slett */
  draftArchiveDays: 30,
  /** Behold aiUsage-tellerdokumenter i (dager) */
  usageRetentionDays: 90,
};

export function getGeminiKey() {
  // WEEKPLAN_GEMINI_KEY (CI/.env) først — gammel Secret Manager GEMINI_API_KEY
  // kan være utdatert/tom og ville ellers skygge den fungerende env-nøkkelen.
  return String(
    process.env.WEEKPLAN_GEMINI_KEY
    || process.env.GEMINI_API_KEY
    || '',
  ).trim();
}

export function todayKeyOslo() {
  // Europe/Oslo — unngå UTC-dato som skifter feil sent på kvelden
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Oslo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

export async function assertFamilyAdult(db, uid, familyId) {
  if (!uid || !familyId) throw new Error('Mangler tilgang.');
  const fam = await db.doc(`families/${familyId}`).get();
  if (!fam.exists) throw new Error('Fant ikke familien.');
  const data = fam.data() || {};
  const adminUids = Array.isArray(data.adminUids) ? data.adminUids : [];
  if (data.ownerUid === uid || data.ownerId === uid || adminUids.includes(uid)) {
    return { role: 'admin' };
  }
  const parent = await db.doc(`families/${familyId}/parents/${uid}`).get();
  if (parent.exists() && parent.data()?.active !== false) {
    return { role: parent.data()?.admin ? 'admin' : 'parent' };
  }
  const top = await db.doc(`parents/${uid}`).get();
  if (top.exists() && top.data()?.familyId === familyId) {
    return { role: top.data()?.admin ? 'admin' : 'parent' };
  }
  throw new Error('Kun foresatte kan bruke denne funksjonen.');
}

function usageDocRef(db, familyId, uid, kind) {
  const dateKey = todayKeyOslo();
  if (kind === 'import' || kind === 'meal') {
    return { ref: db.doc(`aiUsage/family_${familyId}_${dateKey}`), dateKey };
  }
  if (kind === 'tutor') {
    return { ref: db.doc(`aiUsage/user_${uid}_${dateKey}_tutor`), dateKey };
  }
  return { ref: db.doc(`aiUsage/user_${uid}_${dateKey}`), dateKey };
}

function usageLimitError(kind, limit) {
  const err = new Error(
    kind === 'import'
      ? `Daglig grense for AI-import er nådd (${limit}/dag). Prøv igjen i morgen.`
      : kind === 'meal'
        ? `Daglig grense for AI-middag er nådd (${limit}/dag). Prøv igjen i morgen.`
        : kind === 'tutor'
          ? `Daglig grense for Leksehjelpen er nådd (${limit}/dag). Prøv igjen i morgen.`
          : `Daglig grense for AI-chat er nådd (${limit}/dag). Prøv igjen i morgen.`,
  );
  err.code = 'resource-exhausted';
  return err;
}

/** Sjekk dagsgrense uten å øke teller (bruk før dyr AI-kjøring). */
export async function assertUsageAllowed(db, familyId, uid, kind, limit) {
  const { ref } = usageDocRef(db, familyId, uid, kind);
  const snap = await ref.get();
  const count = snap.exists ? Number(snap.data()?.count || 0) : 0;
  if (count >= limit) throw usageLimitError(kind, limit);
  return count;
}

/** Øk dagsgrense-teller (kall etter fullført analyse / chat). */
export async function incrementUsage(db, familyId, uid, kind) {
  const { ref, dateKey } = usageDocRef(db, familyId, uid, kind);
  await ref.set({
    familyId: familyId || null,
    uid: uid || null,
    kind,
    dateKey,
    count: FieldValue.increment(1),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/** Bakoverkompatibel: sjekk + øk i ett steg (chat/middag). */
export async function checkAndIncrementUsage(db, familyId, uid, kind, limit) {
  await assertUsageAllowed(db, familyId, uid, kind, limit);
  await incrementUsage(db, familyId, uid, kind);
}

export async function downloadImageBase64(storagePath) {
  const bucket = getStorage().bucket();
  const file = bucket.file(storagePath);
  const [meta] = await file.getMetadata().catch(() => [null]);
  const size = Number(meta?.size || 0);
  if (size > AI_LIMITS.maxDocumentBytes) {
    throw new Error('Bildet er for stort. Prøv et mindre bilde eller ta nærmere foto.');
  }
  const [buf] = await file.download();
  const mime = meta?.contentType || 'image/jpeg';
  return { base64: buf.toString('base64'), mime, bytes: buf.length };
}

export async function deleteStorageObject(storagePath) {
  if (!storagePath) return;
  try {
    await getStorage().bucket().file(storagePath).delete({ ignoreNotFound: true });
  } catch {
    // best effort
  }
}

/**
 * Free-tier Flash-modeller (prøves i rekkefølge til én svarer).
 * Lite først: flash-kvote (429) er vanlig, og barn trenger raskt svar.
 */
export const GEMINI_MODEL = String(process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').trim();
export const GEMINI_MODEL_FALLBACKS = [
  GEMINI_MODEL,
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-3.5-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
].filter((m, i, arr) => m && arr.indexOf(m) === i);

/** Leksehjelpen: raske lite-modeller først, deretter tyngre flash som backup. */
export const TUTOR_GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-2.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-2.5-flash',
].filter((m, i, arr) => m && arr.indexOf(m) === i);

/** Brukervennlig feilmelding — aldri rå JSON/HTTP-body til UI. */
export function friendlyGeminiError(err) {
  const raw = String(err?.message || err || '');
  const httpMatch = raw.match(/Gemini HTTP (\d+)/i);
  const status = httpMatch ? Number(httpMatch[1]) : null;

  // Aldri videresend teknisk payload (JSON, model-id, generateContent, …)
  if (status === 404 || /not found|no longer available/i.test(raw)) {
    return 'AI-tjenesten er midlertidig utilgjengelig. Prøv igjen om litt.';
  }
  if (status === 429 || /resource.?exhausted|quota|rate/i.test(raw)) {
    return 'AI er midlertidig opptatt (dagsgrense). Prøv igjen om noen minutter.';
  }
  if (
    status === 400
    || status === 401
    || status === 403
    || /permission|API key|API_KEY|invalid.?key/i.test(raw)
  ) {
    return 'AI er ikke riktig satt opp akkurat nå. Prøv igjen senere.';
  }
  if (/block|safety|SAFETY/i.test(raw)) {
    return 'AI kunne ikke behandle dette bildet. Prøv et annet utsnitt.';
  }
  if (/ingen konkrete forslag|tomt svar|Ugyldig JSON/i.test(raw)) {
    return 'AI fant ingen tydelige forslag i dokumentet. Du kan legge til manuelt, eller prøve et skarpere bilde/PDF.';
  }
  if (/for lite|mangler/i.test(raw)) {
    return 'Dokumentet mangler eller er for lite. Ta et tydeligere foto, eller last opp PDF.';
  }
  if (/timeout|tid/i.test(raw)) {
    return 'Analysen tok for lang tid. Prøv igjen med et mindre eller skarpere dokument.';
  }
  if (status || /Gemini HTTP/i.test(raw)) {
    return 'AI-tjenesten er midlertidig utilgjengelig. Prøv igjen om litt.';
  }
  return 'AI klarte ikke tolke dokumentet akkurat nå. Prøv igjen, eller legg til manuelt.';
}

function extractJsonText(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p?.text || '').join('\n').trim();
  if (!text) throw new Error('Tomt svar fra AI');
  // Noen modeller wrapper JSON i ```json ... ```
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1);
  }
  return raw;
}

function normalizeUserParts(userParts) {
  return (userParts || []).map((part) => {
    if (part?.text) return { text: part.text };
    // Støtt både snake_case og camelCase bilde-payload
    const inline = part?.inline_data || part?.inlineData;
    if (inline) {
      return {
        inline_data: {
          mime_type: inline.mime_type || inline.mimeType || 'image/jpeg',
          data: inline.data,
        },
      };
    }
    return part;
  });
}

async function callGeminiJsonOnce(apiKey, model, systemPrompt, userParts, options = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const perModelMs = Number(options.perModelTimeoutMs) || 0;
  const fetchOpts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: normalizeUserParts(userParts) }],
      generationConfig: {
        maxOutputTokens: options.maxOutputTokens || 2048,
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
  };
  if (perModelMs > 0) {
    fetchOpts.signal = AbortSignal.timeout(perModelMs);
  }
  const res = await fetch(url, fetchOpts);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    // Log full detalj server-side, ikke til bruker
    console.warn('[callGeminiJsonOnce] HTTP', res.status, model, errText.slice(0, 200));
    throw new Error(`Gemini HTTP ${res.status} (${model})`);
  }
  const data = await res.json();
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini blokkerte forespørselen (${model}): ${blockReason}`);
  }
  const finish = data?.candidates?.[0]?.finishReason;
  if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
    throw new Error(`Gemini avsluttet uventet (${model}): ${finish}`);
  }
  if (finish === 'MAX_TOKENS') {
    console.warn('[callGeminiJsonOnce] output truncated (MAX_TOKENS)', model);
  }
  const jsonText = extractJsonText(data);
  try {
    return salvageTruncatedJson(jsonText);
  } catch {
    throw new Error(`Ugyldig JSON fra AI (${model})`);
  }
}

function normalizeGeminiTimeoutError(err) {
  const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
  if (timedOut) return new Error('Analysen tok for lang tid');
  return err;
}

/**
 * JSON fra Gemini med modell-fallback.
 * options.models — egen modelliste (ellers GEMINI_MODEL_FALLBACKS)
 * options.parallel — antall modeller som races samtidig (barn: 2 = raskere failover)
 */
export async function callGeminiJson(apiKey, systemPrompt, userParts, options = {}) {
  const maxModels = Number(options.maxModels) || GEMINI_MODEL_FALLBACKS.length;
  const source = Array.isArray(options.models) && options.models.length
    ? options.models
    : GEMINI_MODEL_FALLBACKS;
  const models = source.slice(0, Math.max(1, maxModels));
  const parallel = Math.min(Math.max(1, Number(options.parallel) || 1), models.length);
  let lastErr = null;

  for (let i = 0; i < models.length; i += parallel) {
    const batch = models.slice(i, i + parallel);
    if (batch.length === 1) {
      const model = batch[0];
      try {
        return await callGeminiJsonOnce(apiKey, model, systemPrompt, userParts, options);
      } catch (e) {
        lastErr = normalizeGeminiTimeoutError(e);
        console.warn('[callGeminiJson] model failed', model, lastErr?.message || e?.message);
      }
      continue;
    }

    // Race: første gyldige JSON vinner — barn slipper å vente på 429 på tung modell.
    try {
      return await Promise.any(
        batch.map(async (model) => {
          try {
            const value = await callGeminiJsonOnce(apiKey, model, systemPrompt, userParts, options);
            console.log('[callGeminiJson] race winner', model, 'of', batch.join(','));
            return value;
          } catch (e) {
            const normalized = normalizeGeminiTimeoutError(e);
            console.warn('[callGeminiJson] model failed', model, normalized?.message || e?.message);
            throw normalized;
          }
        }),
      );
    } catch (agg) {
      const errors = Array.isArray(agg?.errors) ? agg.errors : [agg];
      lastErr = errors[errors.length - 1] || lastErr || new Error('Gemini feilet for batch');
    }
  }
  throw lastErr || new Error('Gemini feilet for alle modeller');
}

function extractTextResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((p) => p?.text || '').join('\n').trim();
  if (!text) throw new Error('Tomt svar fra AI');
  return text;
}

async function callGeminiTextOnce(apiKey, model, systemPrompt, userParts, options = {}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const perModelMs = Number(options.perModelTimeoutMs) || 0;
  const fetchOpts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: 'user', parts: normalizeUserParts(userParts) }],
      generationConfig: {
        maxOutputTokens: options.maxOutputTokens || 8192,
        temperature: 0.1,
      },
    }),
  };
  if (perModelMs > 0) {
    fetchOpts.signal = AbortSignal.timeout(perModelMs);
  }
  const res = await fetch(url, fetchOpts);
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status} (${model})`);
  }
  const data = await res.json();
  const blockReason = data?.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini blokkerte forespørselen (${model}): ${blockReason}`);
  }
  return extractTextResponse(data);
}

/** Ren tekst fra Gemini (uten JSON-schema) — mer robust for lange timeplan-lister. */
export async function callGeminiText(apiKey, systemPrompt, userParts, options = {}) {
  const maxModels = Number(options.maxModels) || Math.min(2, GEMINI_MODEL_FALLBACKS.length);
  const models = GEMINI_MODEL_FALLBACKS.slice(0, Math.max(1, maxModels));
  let lastErr = null;
  for (const model of models) {
    try {
      return await callGeminiTextOnce(apiKey, model, systemPrompt, userParts, options);
    } catch (e) {
      lastErr = e;
      console.warn('[callGeminiText] model failed', model, e?.message);
    }
  }
  throw lastErr || new Error('Gemini feilet for alle modeller');
}

/** Parent toggle: allowedApps[appId], with legacy aiEnabled for AI modules. */
export function childAllowsApp(childData, appId) {
  const apps = childData?.allowedApps;
  if (apps && typeof apps[appId] === 'boolean') return apps[appId];
  if ((appId === 'ai' || appId === 'leksehjelp') && childData?.aiEnabled === false) {
    return false;
  }
  return true;
}
