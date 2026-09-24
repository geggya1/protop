/**
 * Weekplan Help Support — Skjetten bot + ticket creation + bug analysis for admin.
 * AI never deploys; it only drafts recommendations and optional merge/deploy links for the developer.
 */

import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  getGeminiKey,
  checkAndIncrementUsage,
  AI_LIMITS,
  GEMINI_MODEL,
} from './aiShared.js';
import { assertFamilyMember } from './security.js';

const ESCALATE_AFTER = 4;

const SYSTEM_SUPPORT = `Du er «Skjetten» — Weekplan sin AI-hjelpeassistent (inspirert av gode helpdesk-boter som Hospitable).

Oppgave:
- Svar utfyllende, vennlig og konkret på norsk (bokmål) med mindre brukeren skriver et annet språk.
- Gi tips og steg-for-steg når det hjelper (nummererte steg).
- Tilpass tone: barn = enkle ord og korte setninger; ungdom = klar og respektfull; foresatte = praktisk og effektiv.
- Bruk kunnskapen om Weekplan-moduler som er lagt ved. Oppfinn ikke knapper som ikke finnes.
- Nevn lyspæren (in-app guide) når det passer.
- Hvis spørsmålet handler om feil, hvit skjerm, error eller bug: foreslå å ta skjermbilde og opprette supportsak.
- Etter flere spørsmål uten løsning: foreslå vennlig å kontakte support (skjema med tittel, tekst og bilde).
- Gi aldri medisinske/juridiske råd. Ved akutte farer: anbefal nødtjenester.

Format:
- Vanlig tekst. Bruk punktlister eller «1. 2. 3.» for steg.
- Avslutt gjerne med ett kort oppfølgingsspørsmål.`;

function sanitizeHistory(raw, { limit = 10, maxChars = 600 } = {}) {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(-limit)
    .map((m) => ({
      role: m?.role === 'user' ? 'user' : 'assistant',
      text: String(m?.text || '').slice(0, maxChars),
    }))
    .filter((m) => m.text);
}

function looksLikeBug(text = '') {
  const q = String(text).toLowerCase();
  return /feil|bug|error|crash|krasj|hvit skjerm|white screen|blank|fungerer ikke|virker ikke|broken|exception|stack|500|404/.test(q);
}

function ticketNumber() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `WP-${y}${m}${day}-${rand}`;
}

async function callGemini(apiKey, systemPrompt, message, history = [], options = {}) {
  const models = [GEMINI_MODEL, 'gemini-flash-latest', 'gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-flash-lite-latest'];
  const maxOut = Number(options.maxOutputTokens) || 900;
  const maxIn = Number(options.maxInputChars) || 1800;
  const contents = [];
  for (const h of history) {
    contents.push({
      role: h.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: h.text }],
    });
  }
  contents.push({ role: 'user', parts: [{ text: String(message || '').slice(0, maxIn) }] });

  let lastErr = null;
  for (const model of models) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: { maxOutputTokens: maxOut, temperature: 0.55 },
        }),
      });
      if (!res.ok) {
        lastErr = new Error(`Gemini HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        lastErr = new Error('Tomt svar');
        continue;
      }
      return String(text).trim();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Gemini feilet');
}

function localSupportReply(message, { audience, device, knowledge, userQueryCount }) {
  const q = String(message || '').toLowerCase();
  const kid = audience === 'child' || audience === 'teen';
  const escalate = Number(userQueryCount || 0) >= ESCALATE_AFTER;

  const match = (knowledge || []).find((k) => {
    const hay = `${k.title} ${k.summary} ${(k.steps || []).join(' ')} ${k.moduleId}`.toLowerCase();
    return q.split(/\s+/).filter((w) => w.length > 3).some((w) => hay.includes(w));
  });

  if (/lyspære|lightbulb|guide|rundtur/.test(q)) {
    return kid
      ? 'Trykk på den lille lyspæren oppe ved profilbildet. Da får du en kort forklaring og en pil som viser hvor du skal trykke.'
      : 'Lyspæren ved profilbildet åpner en kort guide for siden du står på. Velg «Vis meg hvordan» for steg-for-steg med markering i UI.';
  }
  if (/innstill|settings|språk|varsl/.test(q)) {
    return 'Åpne Mer → Innstillinger. Der finner du profil, språk, posisjon, værsted, varsler, barnas apper (foresatte) og under Om: personvern + Hjelp & support.';
  }
  if (looksLikeBug(q)) {
    return [
      kid
        ? 'Oi — det høres ut som noe ikke fungerer. Ta gjerne et bilde av skjermen.'
        : 'Det høres ut som en teknisk feil. Ta skjermbilde hvis du kan.',
      '1. Noter hva du trykket på rett før det skjedde',
      '2. Åpne Hjelp → Kontakt support',
      '3. Lim inn beskrivelsen og legg ved bildet',
      'Da får du et saksnummer, og vi (utvikler) får et analyseforslag — uten at noe endres automatisk.',
    ].join('\n');
  }
  if (match) {
    const steps = (match.steps || []).map((s, i) => `${i + 1}. ${s}`).join('\n');
    const tip = device === 'desktop'
      ? 'På web: se også venstremenyen / Mer-huben.'
      : device === 'tablet'
        ? 'På nettbrett: samme menyer som mobil, med mer plass.'
        : 'På mobil: bruk fanene nederst og Mer for flere apper.';
    return [
      `${match.title}`,
      match.summary,
      steps ? `\nSlik gjør du:\n${steps}` : '',
      `\n${tip}`,
      escalate ? '\nFikk du ikke svar? Trykk «Kontakt support» så lager vi en sak med saksnummer.' : '\nVil du at jeg forklarer et bestemt steg nærmere?',
    ].filter(Boolean).join('\n');
  }
  if (/hei|hallo|hello|help|hjelp/.test(q)) {
    return kid
      ? 'Hei! Jeg er Skjetten — jeg hjelper deg med Weekplan. Spør om kalender, gjøremål, lekser eller hvor du trykker. Etter noen spørsmål kan vi sende en sak til support hvis du står fast.'
      : 'Hei! Jeg er Skjetten, Weekplan sin hjelpebot. Spør om moduler, innstillinger eller feil — jeg svarer stegvis. Etter 4–5 spørsmål uten løsning foreslår jeg supportsak med bilde og saksnummer.';
  }
  const base = kid
    ? 'Jeg er ikke helt sikker. Prøv å spørre om en app (f.eks. kalender eller gjøremål), eller trykk lyspæren på siden du er på.'
    : 'Jeg fant ikke et eksakt treff. Prøv å nevne modulnavn (kalender, gjøremål, leksehjelp, handleliste…) eller beskriv hva du ser på skjermen.';
  return escalate
    ? `${base}\n\nDet kan være lurt å kontakte support nå — trykk «Kontakt support», skriv tittel og tekst, og legg ved bilde om du har.`
    : `${base}\n\nHvilken skjerm står du på, og hva prøvde du sist?`;
}

function buildKnowledgeBlock(knowledge = []) {
  return (knowledge || []).slice(0, 18).map((k, i) => {
    const steps = (k.steps || []).slice(0, 4).map((s, j) => `  ${j + 1}. ${s}`).join('\n');
    return `${i + 1}. [${k.moduleId}] ${k.title}\n${k.summary}\n${steps}`;
  }).join('\n\n');
}

export async function handleAiSupportChat(data, auth) {
  if (!auth?.uid) throw new Error('Du må være innlogget.');

  const message = String(data?.message || '').trim();
  if (!message) throw new Error('Skriv et spørsmål først.');
  if (message.length > 2000) throw new Error('Spørsmålet er for langt (maks 2000 tegn).');

  const audience = String(data?.audience || 'parent');
  const device = String(data?.device || 'phone');
  const lang = String(data?.lang || 'nb');
  const familyId = String(data?.familyId || '').trim() || null;
  const userQueryCount = Math.max(0, Number(data?.userQueryCount) || 0);
  const knowledge = Array.isArray(data?.knowledge) ? data.knowledge.slice(0, 20) : [];
  const history = sanitizeHistory(data?.history);

  const db = getFirestore();
  if (familyId) await assertFamilyMember(db, familyId, auth.uid);

  await checkAndIncrementUsage(db, familyId, auth.uid, 'supportChat', AI_LIMITS.chatPerUserPerDay);

  const knowledgeBlock = buildKnowledgeBlock(knowledge);
  const meta = [
    `Brukerprofil: audience=${audience}, device=${device}, lang=${lang}, spørsmålNr=${userQueryCount + 1}.`,
    userQueryCount + 1 >= ESCALATE_AFTER
      ? 'Viktig: foreslå kontakt support / supportsak hvis problemet ikke er løst.'
      : 'Du kan nevne at support finnes hvis det trengs senere.',
    knowledgeBlock ? `Kunnskapsbase:\n${knowledgeBlock}` : '',
  ].filter(Boolean).join('\n');

  const system = `${SYSTEM_SUPPORT}\n\n${meta}`;
  let reply = null;
  let engine = 'local';

  const apiKey = getGeminiKey();
  if (apiKey && audience !== 'child') {
    try {
      reply = await callGemini(apiKey, system, message, history, {
        maxOutputTokens: 1000,
        maxInputChars: 2000,
      });
      engine = 'gemini';
    } catch {
      // local fallback
    }
  }

  if (!reply) {
    reply = localSupportReply(message, {
      audience, device, knowledge, userQueryCount: userQueryCount + 1,
    });
  }

  // Learn: store anonymized Q→A candidates for later curation
  try {
    await db.collection('helpKnowledgeCandidates').add({
      uid: auth.uid,
      question: message.slice(0, 500),
      answer: String(reply).slice(0, 2000),
      audience,
      device,
      lang,
      engine,
      createdAt: FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
      reviewed: false,
    });
  } catch {
    // non-fatal
  }

  const suggestSupport = (userQueryCount + 1) >= ESCALATE_AFTER || looksLikeBug(message);
  return {
    reply,
    engine,
    suggestSupport,
    escalateAfter: ESCALATE_AFTER,
    userQueryCount: userQueryCount + 1,
  };
}

async function analyzeBugForAdmin(db, {
  ticketId, ticketNumber: num, title, body, uid, device, audience, attachmentUrls,
}) {
  const prompt = `Du er senior utvikler-assistent for Weekplan (React Native / Expo / Firebase).
Analyser denne brukerrapporten. Returner KUN gyldig JSON med feltene:
problemSummary (norsk), likelyCause, recommendedFix (steg for utvikler), filesToInspect (array av sannsynlige filstier), riskLevel (low|medium|high), draftPrTitle, draftPrBody, notesForAdmin.
Du skal IKKE deploye eller merje noe — kun anbefale. Lag en tenkt merge/deploy-lenke som plassholder: https://github.com/geggya1/weekplan-app/compare/main...cursor/fix-${ticketId}

Rapport:
Tittel: ${title}
Tekst: ${body}
Device: ${device}
Audience: ${audience}
Attachments: ${(attachmentUrls || []).length}
Ticket: ${num}`;

  const apiKey = getGeminiKey();
  let analysis = {
    problemSummary: body.slice(0, 280),
    likelyCause: 'Ukjent — trenger manuell triage',
    recommendedFix: 'Reproduser på samme enhet, sjekk siste deploy, se klientlogger.',
    filesToInspect: [],
    riskLevel: 'medium',
    draftPrTitle: `[support] ${num}: ${String(title).slice(0, 60)}`,
    draftPrBody: `Brukerrapport ${num}. Se supportInbox/${ticketId}.`,
    notesForAdmin: 'AI-utkast — krever din godkjenning før merge/deploy.',
    mergeDeployLink: `https://github.com/geggya1/weekplan-app/compare/main...cursor/fix-${ticketId}`,
    engine: 'local',
  };

  if (apiKey) {
    try {
      const raw = await callGemini(apiKey, 'Returner kun JSON.', prompt, [], {
        maxOutputTokens: 900,
        maxInputChars: 3500,
      });
      const jsonMatch = String(raw).match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        analysis = {
          ...analysis,
          ...parsed,
          mergeDeployLink: parsed.mergeDeployLink
            || `https://github.com/geggya1/weekplan-app/compare/main...cursor/fix-${ticketId}`,
          engine: 'gemini',
        };
      }
    } catch {
      // keep local analysis
    }
  }

  await db.collection('supportInbox').doc(ticketId).set({
    ticketId,
    ticketNumber: num,
    uid,
    title,
    body,
    device,
    audience,
    attachmentUrls: attachmentUrls || [],
    status: 'open',
    category: 'bug',
    bugAnalysis: analysis,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
    needsDeveloperReview: true,
    autoDeploy: false,
  }, { merge: true });

  return analysis;
}

export async function handleCreateSupportTicket(data, auth) {
  if (!auth?.uid) throw new Error('Du må være innlogget.');

  const title = String(data?.title || '').trim();
  const body = String(data?.body || '').trim();
  if (!title) throw new Error('Skriv en tittel.');
  if (!body) throw new Error('Beskriv spørsmålet eller problemet.');
  if (title.length > 120) throw new Error('Tittelen er for lang.');
  if (body.length > 5000) throw new Error('Teksten er for lang.');

  const contactEmail = String(data?.contactEmail || '').trim().toLowerCase() || null;
  const audience = String(data?.audience || 'parent');
  const device = String(data?.device || 'phone');
  const lang = String(data?.lang || 'nb');
  const familyId = String(data?.familyId || '').trim() || null;
  const category = String(data?.category || (looksLikeBug(`${title} ${body}`) ? 'bug' : 'question'));
  const attachmentUrls = Array.isArray(data?.attachmentUrls)
    ? data.attachmentUrls.map((u) => String(u)).filter(Boolean).slice(0, 4)
    : [];

  if ((audience === 'child' || audience === 'teen') && !contactEmail && !data?.allowInternalOnly) {
    // Still allow internal channel — flag missing email
  }

  const db = getFirestore();
  if (familyId) await assertFamilyMember(db, familyId, auth.uid);

  const num = ticketNumber();
  const channel = contactEmail ? 'email+internal' : 'internal';
  const uid = auth.uid;

  const ticketRef = db.collection('users').doc(uid).collection('supportTickets').doc();
  const ticket = {
    ticketNumber: num,
    title,
    body,
    preview: body.slice(0, 120),
    status: 'open',
    category,
    channel,
    contactEmail,
    audience,
    device,
    lang,
    familyId,
    attachmentUrls,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
    updatedAtMs: Date.now(),
    createdBy: uid,
  };

  await ticketRef.set(ticket);
  await ticketRef.collection('messages').add({
    role: 'user',
    text: body,
    attachmentUrl: attachmentUrls[0] || null,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
  });
  await ticketRef.collection('messages').add({
    role: 'system',
    text: lang === 'en'
      ? `Thanks — your ticket ${num} is registered. We reply in this help mailbox${contactEmail ? ` and may also use ${contactEmail}` : ''}.`
      : `Takk — saken din ${num} er registrert. Vi svarer i denne hjelpe-postkassen${contactEmail ? ` og kan også bruke ${contactEmail}` : ''}.`,
    createdAt: FieldValue.serverTimestamp(),
    createdAtMs: Date.now(),
  });

  let bugAnalysis = null;
  if (category === 'bug' || looksLikeBug(`${title} ${body}`)) {
    bugAnalysis = await analyzeBugForAdmin(db, {
      ticketId: ticketRef.id,
      ticketNumber: num,
      title,
      body,
      uid,
      device,
      audience,
      attachmentUrls,
    });
  } else {
    await db.collection('supportInbox').doc(ticketRef.id).set({
      ticketId: ticketRef.id,
      ticketNumber: num,
      uid,
      title,
      body,
      device,
      audience,
      attachmentUrls,
      status: 'open',
      category,
      contactEmail,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      createdAtMs: Date.now(),
      needsDeveloperReview: false,
      autoDeploy: false,
    }, { merge: true });
  }

  return {
    ticketId: ticketRef.id,
    ticketNumber: num,
    channel,
    category,
    bugAnalysis: bugAnalysis ? {
      problemSummary: bugAnalysis.problemSummary,
      needsDeveloperReview: true,
      mergeDeployLink: bugAnalysis.mergeDeployLink,
    } : null,
  };
}
