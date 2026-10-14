import { postSameOrigin } from '../utils/sameOriginFn';
import { agentLog } from './debugAgentLog.js';

/** Ber Hosting-rewriten lese avtalen. Lokal tolkning brukes hvis kallet ikke svarer. */
export async function interpretAvtale(payload) {
  const documents = Array.isArray(payload?.documents) ? payload.documents.slice(0, 40).map((doc) => ({
    name: String(doc?.name || 'Avtale').slice(0, 180),
    text: String(doc?.text || '').slice(0, 20000),
  })) : [];
  const fileBase64 = String(payload?.fileBase64 || '').slice(0, 3500000);
  // #region agent log
  agentLog('B', 'aiClient.js:interpretAvtale', 'remote interpret request', {
    hasFileBase64: fileBase64.length > 40,
    fileBase64Len: fileBase64.length,
    fileName: String(payload?.fileName || ''),
    mimeType: String(payload?.mimeType || ''),
    textLen: String(payload?.text || '').length,
    documents: documents.map((doc) => ({ name: doc.name, textLen: doc.text.length, preview: doc.text.slice(0, 80) })),
  });
  // #endregion
  try {
    const result = await postSameOrigin('/api/interpret-avtale', {
      text: String(payload?.text || '').slice(0, 40000),
      fileName: String(payload?.fileName || '').slice(0, 180),
      mimeType: String(payload?.mimeType || '').slice(0, 120),
      fileBase64,
      documents,
    }, { timeoutMs: 90000 });
    // #region agent log
    agentLog('B', 'aiClient.js:interpretAvtale', 'remote interpret response', {
      ok: result?.ok,
      engine: result?.engine,
      hasExtracted: Boolean(result?.extracted),
      extractedTitle: result?.extracted?.title || '',
      extractedBuyer: result?.extracted?.buyer || '',
      extractedHonorar: result?.extracted?.honorar || '',
      extractedStart: result?.extracted?.startDate || '',
      responseTextLen: String(result?.text || '').length,
      warning: result?.warning || '',
    });
    // #endregion
    return result;
  } catch (error) {
    // #region agent log
    agentLog('B', 'aiClient.js:interpretAvtale', 'remote interpret failed', {
      message: error?.message || String(error),
    });
    // #endregion
    throw error;
  }
}
