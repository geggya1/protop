/**
 * OCR og AI-tolking av kundelister og medarbeiderlister.
 * Regneark: modellen navngir ukjente kolonner. Skann: OCR-tekst og bilder leses av modellen.
 */
import { mergeCvReads, parseProtopCv } from '../src/employees/cvText.js';
import {
  columnPrompt,
  cvPrompt,
  ocrPrompt,
  sanitizeColumnMap,
  sanitizeCv,
  sanitizeOcrRows,
} from '../src/imports/interpret.js';

const MAX_DOC_CHARS = 6_000_000;

function clean(value, max) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function tableMessage(data) {
  const headers = (Array.isArray(data?.headers) ? data.headers : []).slice(0, 40).map((header) => clean(header, 80));
  const samples = (Array.isArray(data?.samples) ? data.samples : []).slice(0, 3).map((row) => (
    headers.map((_, index) => clean(row?.[index], 80))
  ));
  const lines = headers.map((header, index) => {
    const examples = samples.map((row) => row[index]).filter(Boolean).slice(0, 3);
    return `${index + 1}. ${header}${examples.length ? ` | eksempler: ${examples.join(' · ')}` : ''}`;
  });
  return `Tolker disse kolonnene:\n${lines.join('\n')}`;
}

async function documentParts(data, options = {}) {
  const mime = clean(data?.mime, 80) || 'image/jpeg';
  const imageBase64 = String(data?.imageBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (imageBase64.length < 80 || imageBase64.length > MAX_DOC_CHARS) {
    throw new Error('Send et bilde eller en PDF av listen.');
  }
  const parts = [{ text: 'Les listen og trekk ut radene som står i dokumentet.' }];
  if (mime === 'application/pdf') {
    const buffer = Buffer.from(imageBase64, 'base64');
    const { ocrPdfPages } = await import('./ocrPdf.js');
    const ocr = await ocrPdfPages(buffer).catch(() => ({ text: '', images: [] }));
    if (ocr.text) parts.push({ text: `OCR-tekst:\n${ocr.text.slice(0, 24000)}` });
    const maxImages = Number(options.maxImages) > 0 ? Number(options.maxImages) : 4;
    for (const image of (ocr.images || []).slice(0, maxImages)) {
      parts.push({
        inline_data: { mime_type: image.mime || 'image/png', data: image.buffer.toString('base64') },
      });
    }
    if (!(ocr.text || '').trim() && !(ocr.images || []).length) {
      parts.push({ inline_data: { mime_type: 'application/pdf', data: imageBase64 } });
    }
    return { parts, text: ocr.text || '', usedOcr: Boolean(ocr.text || (ocr.images || []).length) };
  }
  parts.push({ inline_data: { mime_type: mime, data: imageBase64 } });
  return { parts, usedOcr: true };
}

export async function handleInterpretImport(data, auth, deps = {}) {
  const uid = auth?.uid;
  if (!uid) throw new Error('Ikke innlogget');
  const familyId = clean(data?.familyId, 80);
  const kind = data?.kind === 'employees' ? 'employees' : data?.kind === 'cv' ? 'cv' : 'customers';
  const mode = data?.mode === 'ocr' ? 'ocr' : 'columns';
  if (!familyId) throw new Error('Åpne selskapet før du importerer.');

  const runtime = await runtimeDeps(deps);
  await runtime.assertFamilyAdult(runtime.db, uid, familyId);
  await runtime.checkAndIncrementUsage(runtime.db, familyId, uid, 'import', runtime.importLimit);

  const apiKey = runtime.getGeminiKey();
  if (!apiKey) throw new Error('AI er ikke tilgjengelig akkurat nå. Prøv igjen senere.');
  const call = runtime.callGeminiJson;

  try {
    if (kind === 'cv') {
      const prose = String(data?.text || '').replace(/\r\n/g, '\n').trim().slice(0, 24000);
      let parts;
      let usedOcr = false;
      let sourceText = prose;
      if (prose.length >= 40) {
        parts = [{ text: `CV-tekst:\n${prose}` }];
      } else {
        const document = await (deps.documentParts || documentParts)(data, { maxImages: 8 });
        parts = document.parts;
        usedOcr = document.usedOcr;
        sourceText = document.text || '';
      }
      const local = parseProtopCv(sourceText);
      let parsed = null;
      try {
        parsed = await call(apiKey, cvPrompt(), parts, {
          maxOutputTokens: 16384,
          perModelTimeoutMs: 50000,
        });
      } catch (err) {
        if (!local.headline && !local.projects?.length && !local.experience?.length) throw err;
      }
      const read = sanitizeCv({
        ...mergeCvReads(local, parsed || {}),
        summaryNote: parsed?.summaryNote,
      });
      return {
        ...read,
        engine: usedOcr ? 'ocr+gemini' : 'gemini',
      };
    }
    if (mode === 'columns') {
      const parsed = await call(apiKey, columnPrompt(kind), [{ text: tableMessage(data) }], {
        maxOutputTokens: 2048,
        perModelTimeoutMs: 30000,
      });
      return { ...sanitizeColumnMap(parsed, kind), engine: 'gemini' };
    }
    const document = await (deps.documentParts || documentParts)(data);
    const parsed = await call(apiKey, ocrPrompt(kind), document.parts, {
      maxOutputTokens: 8192,
      perModelTimeoutMs: 50000,
    });
    return {
      ...sanitizeOcrRows(parsed, kind),
      engine: document.usedOcr ? 'ocr+gemini' : 'gemini',
    };
  } catch (err) {
    if (deps.passthroughErrors) throw err;
    const message = String(err?.message || '');
    if (/^Send et bilde|^Åpne selskapet|^AI er ikke|^Ikke innlogget/.test(message)) throw err;
    throw new Error(runtime.friendlyGeminiError(err));
  }
}

async function runtimeDeps(deps) {
  if (deps.db && deps.assertFamilyAdult && deps.checkAndIncrementUsage && deps.getGeminiKey && deps.callGeminiJson && deps.friendlyGeminiError) {
    return {
      db: deps.db,
      assertFamilyAdult: deps.assertFamilyAdult,
      checkAndIncrementUsage: deps.checkAndIncrementUsage,
      getGeminiKey: deps.getGeminiKey,
      callGeminiJson: deps.callGeminiJson,
      friendlyGeminiError: deps.friendlyGeminiError,
      importLimit: 20,
    };
  }
  const shared = await import('./aiShared.js');
  const { getFirestore } = await import('firebase-admin/firestore');
  return {
    db: deps.db || getFirestore(),
    assertFamilyAdult: deps.assertFamilyAdult || shared.assertFamilyAdult,
    checkAndIncrementUsage: deps.checkAndIncrementUsage || shared.checkAndIncrementUsage,
    getGeminiKey: deps.getGeminiKey || shared.getGeminiKey,
    callGeminiJson: deps.callGeminiJson || shared.callGeminiJson,
    friendlyGeminiError: deps.friendlyGeminiError || shared.friendlyGeminiError,
    importLimit: shared.AI_LIMITS.importsPerFamilyPerDay,
  };
}
