/**
 * Reproduces DirectAgreementForm import path for a sample PDF (no UI).
 * Mirrors readOneFile + applyDocs enough to hit extract/interpret/remote hooks.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractContractText, MAX_LOCAL_PDF_BYTES, pdfTextLooksReadable } from '../src/indeksregulering/extractText.js';
import { interpretDocuments, mergeInterpretation } from '../src/indeksregulering/interpret.js';
import { inputFromInterpretation } from '../src/anbud/directContract.js';
import { agentLog, flushAgentLogsToFile } from '../src/indeksregulering/debugAgentLog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pdfPath = process.argv[2]
  || '/home/ubuntu/.cursor/projects/workspace/uploads/251219_Oppdragsavtale_Consult1_AS-sign_c233.pdf';
const MAX_REMOTE_BYTES = 2500000;

function emptyForm() {
  return { title: '', buyer: '', value: '', honorar: '', start: '', end: '', orgnr: '' };
}

function formFromInput(input, current = emptyForm()) {
  return {
    ...current,
    title: input.title || '',
    buyer: input.buyer || '',
    value: input.value == null || input.value === '' ? '' : String(input.value),
    honorar: input.honorar || input.fields?.honorar || '',
    start: input.start || '',
    end: input.end || '',
    orgnr: input.orgnr || input.fields?.orgnr || '',
  };
}

async function main() {
  const bytes = new Uint8Array(fs.readFileSync(pdfPath));
  const fileName = path.basename(pdfPath);
  agentLog('A', 'debug-agreement-import.mjs', 'start', {
    pdfPath,
    byteLength: bytes.length,
    overLocalMax: bytes.length > MAX_LOCAL_PDF_BYTES,
  });

  let text = '';
  let pathUsed = '';
  try {
    text = await extractContractText(bytes, fileName, 'application/pdf');
    pathUsed = 'local-extract';
    agentLog('A', 'debug-agreement-import.mjs', 'local extract accepted', {
      textLen: text.length,
      readable: pdfTextLooksReadable(text),
      wouldTriggerRemoteOcrInCatch: false,
      runId: 'post-fix',
    });
  } catch (error) {
    pathUsed = 'local-failed→remote-ocr';
    agentLog('A', 'debug-agreement-import.mjs', 'local extract threw — would call remote OCR', {
      message: error?.message || String(error),
      runId: 'post-fix',
    });
  }

  // Simulate successful remote OCR+AI payload (as interpret-avtale would return for this oppdragsavtale).
  const simulatedExtracted = pathUsed.startsWith('local-failed') ? {
    title: 'Consult1 AS',
    buyer: 'Oppdragsgiver AS',
    supplier: 'Consult1 AS',
    honorar: '1080 kr eks. mva',
    startDate: '2025-12-19',
    kind: 'oppdrag',
    standard: 'NS 8403',
    lines: [{ text: 'Kontraktssum', quantity: 1, unit: 'RS', rate: 1080, included: true }],
  } : null;

  const docs = [{
    id: 'dok-1',
    name: fileName,
    text,
    role: 'hoved',
    interpreted: String(text || '').trim().length >= 20 || Boolean(simulatedExtracted),
    ...(simulatedExtracted ? { extracted: simulatedExtracted } : {}),
  }];

  const usable = docs.filter((doc) => {
    const body = String(doc?.text || '').trim();
    return body.length >= 20 && pdfTextLooksReadable(body);
  });
  let merged = interpretDocuments(usable);
  for (const doc of docs) {
    if (doc?.extracted) merged = mergeInterpretation(merged, doc.extracted, String(doc.text || ''));
  }
  agentLog('C', 'debug-agreement-import.mjs', 'after extract+merge', {
    pathUsed,
    usableCount: usable.length,
    title: merged.title,
    buyer: merged.buyer,
    honorar: merged.honorar,
    startDate: merged.startDate,
    runId: 'post-fix',
  });

  const next = inputFromInterpretation(merged, { documents: docs });
  const form = formFromInput(next, emptyForm());
  agentLog('E', 'debug-agreement-import.mjs', 'final form fields', {
    pathUsed,
    form,
    nextTitle: next.title,
    nextValue: next.value,
    runId: 'post-fix',
  });

  flushAgentLogsToFile('/opt/cursor/logs/debug.log');
  console.log(JSON.stringify({
    pathUsed,
    textLen: text.length,
    readable: pdfTextLooksReadable(text),
    wouldCallRemoteOcr: pathUsed.startsWith('local-failed'),
    form,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
