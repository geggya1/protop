/**
 * OCR og AI-tolking av kundelister og medarbeiderlister.
 * Regneark: modellen navngir ukjente kolonner. Skann: OCR-tekst og bilder leses av modellen.
 */
import { mergeCvReads, parseProjectSheet, parseProtopCv } from '../src/employees/cvText.js';
import {
  columnPrompt,
  cvPrompt,
  ocrPrompt,
  sanitizeColumnMap,
  sanitizeCv,
  sanitizeOcrRows,
} from '../src/imports/interpret.js';
import { extractCvPictures, withCvPictures } from './cvPictures.js';
import { CV_PDF_CHARS, extractPdfLines } from './documentText.js';
import { pagePartsFromPdf } from './importPages.js';

const MAX_DOC_CHARS = 6_000_000;

const CV_MODELS = ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-flash-latest'];

function imageParts(parts) {
  return (parts || []).filter((part) => part?.inline_data || part?.inlineData);
}

function textParts(parts) {
  return (parts || []).filter((part) => !part?.inline_data && !part?.inlineData);
}

function rememberRead(current, parsed) {
  if (!parsed) return current;
  if (!current) return parsed;
  return {
    ...mergeCvReads(current, parsed),
    summaryNote: parsed.summaryNote || current.summaryNote || '',
  };
}

async function readCvModel(call, apiKey, parts) {
  const options = {
    maxOutputTokens: 8192,
    perModelTimeoutMs: 45000,
    models: CV_MODELS,
  };
  const images = imageParts(parts);
  const prompt = cvPrompt();
  const text = textParts(parts);
  const readBatch = async (slice) => {
    try {
      return await call(apiKey, prompt, [...text, ...slice], options);
    } catch (err) {
      if (slice.length < 2) throw err;
      let merged = null;
      let lastErr = err;
      for (const image of slice) {
        try {
          merged = rememberRead(merged, await call(apiKey, prompt, [...text, image], options));
        } catch (singleErr) {
          lastErr = singleErr;
        }
      }
      if (merged) return merged;
      throw lastErr;
    }
  };
  if (!images.length) return call(apiKey, prompt, parts, options);

  let merged = null;
  let lastErr = null;
  for (let index = 0; index < images.length; index += 2) {
    try {
      merged = rememberRead(merged, await readBatch(images.slice(index, index + 2)));
    } catch (err) {
      lastErr = err;
    }
  }
  if (merged) return merged;
  throw lastErr || new Error('Gemini feilet');
}

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
  if (imageBase64.length < 80) {
    throw new Error('Send et bilde eller en PDF av listen.');
  }
  if (imageBase64.length > MAX_DOC_CHARS) {
    throw new Error('Filen er for stor til å lastes inn. Komprimer den (lavere oppløsning eller færre sider) før du laster opp, og prøv igjen.');
  }
  const intro = clean(options.intro, 160) || 'Les listen og trekk ut radene som står i dokumentet.';
  const parts = [{ text: intro }];
  if (mime === 'application/pdf') {
    const buffer = Buffer.from(imageBase64, 'base64');
    const maxImages = Number(options.maxImages) > 0 ? Number(options.maxImages) : 4;
    const prose = await extractPdfLines(buffer);
    if (prose.length >= 80) {
      parts.push({ text: `Dokumenttekst:\n${prose}` });
      return { parts, text: prose, usedOcr: false };
    }
    const embedded = pagePartsFromPdf(buffer, maxImages);
    if (embedded.length) {
      parts.push(...embedded);
      return { parts, text: '', usedOcr: true };
    }
    const { ocrPdfPages } = await import('./ocrPdf.js');
    const ocr = await ocrPdfPages(buffer).catch(() => ({ text: '', images: [] }));
    if (ocr.text) parts.push({ text: `OCR-tekst:\n${ocr.text.slice(0, CV_PDF_CHARS)}` });
    for (const image of (ocr.images || []).slice(0, maxImages)) {
      parts.push({
        inline_data: { mime_type: image.mime || 'image/png', data: image.buffer.toString('base64') },
      });
    }
    if (!(ocr.text || '').trim() && !(ocr.images || []).length && imageBase64.length <= 1_500_000) {
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
  const kind = data?.kind === 'employees'
    ? 'employees'
    : data?.kind === 'cv'
      ? 'cv'
      : data?.kind === 'invoices'
        ? 'invoices'
        : data?.kind === 'hours'
          ? 'hours'
          : 'customers';
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
      const prose = String(data?.text || '').replace(/\r\n/g, '\n').trim().slice(0, CV_PDF_CHARS);
      let parts;
      let usedOcr = false;
      let sourceText = prose;
      if (prose.length >= 40) {
        parts = [{ text: `CV-tekst:\n${prose}` }];
      } else {
        const document = await (deps.documentParts || documentParts)(data, {
          maxImages: 4,
          intro: 'Les CV-en.',
        });
        parts = document.parts;
        usedOcr = document.usedOcr;
        sourceText = document.text || '';
      }
      const local = parseProtopCv(sourceText);
      const sheet = parseProjectSheet(sourceText);
      const cvDocument = /^(profil|utdanning|erfaringer|referanseprosjekter)$/im.test(sourceText);
      if (sheet?.title) {
        if (!cvDocument) {
          local.headline = '';
          local.summary = '';
          local.firstName = '';
          local.middleName = '';
          local.lastName = '';
          local.projects = [sheet];
        } else if (!(local.projects || []).some((row) => row.title === sheet.title)) {
          local.projects = [...(local.projects || []), sheet];
        }
      }
      let parsed = null;
      try {
        parsed = await readCvModel(call, apiKey, parts);
      } catch (err) {
        if (!local.headline && !local.projects?.length && !local.experience?.length) throw err;
      }
      const merged = mergeCvReads(local, parsed || {});
      if (sheet?.title && !cvDocument) {
        merged.firstName = '';
        merged.middleName = '';
        merged.lastName = '';
        merged.headline = '';
        merged.summary = '';
        merged.birthDate = '';
        merged.maritalStatus = '';
        merged.nationality = '';
        merged.language = '';
        merged.education = [];
        merged.certifications = [];
        merged.courses = [];
        merged.experience = [];
        const match = (merged.projects || []).find((row) => row.title === sheet.title) || sheet;
        if (!sheet.category) match.category = '';
        if (!sheet.object) match.object = '';
        merged.projects = [match];
      }
      const read = sanitizeCv({
        ...merged,
        summaryNote: parsed?.summaryNote,
      });
      let cv = read.cv;
      if (clean(data?.mime, 80) === 'application/pdf' && data?.imageBase64) {
        const pdfBase64 = String(data.imageBase64).replace(/^data:[^;]+;base64,/i, '');
        const pictures = await extractCvPictures(Buffer.from(pdfBase64, 'base64')).catch(() => null);
        if (pictures) cv = withCvPictures(cv, pictures);
      }
      return {
        ...read,
        cv,
        engine: parsed ? (usedOcr ? 'ocr+gemini' : 'gemini') : 'text',
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
    if (/^Send et bilde|^Filen er for stor|^Åpne selskapet|^AI er ikke|^Ikke innlogget/.test(message)) throw err;
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
