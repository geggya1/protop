import { callGeminiJson, getGeminiKey } from './aiShared.js';

const SYSTEM = `Du kontrollerer en låst timeliste for et norsk firma før godkjenning til fakturering.
Finn skrivefeil, uklare tekster og avvik i timene.
Svar kun med JSON: {"findings":[{"entryId":"...","severity":"error"|"warn","kind":"skrivefeil"|"avvik","message":"kort norsk forklaring","suggestion":"foreslått full tekst eller tom streng"}]}.
- severity error når teksten bør rettes eller timene ser feil ut.
- severity warn ved noe som bør ses på, men ikke nødvendigvis er feil.
- suggestion er hele den korrigerte beskrivelsen, ikke bare ordet. Tom hvis du ikke foreslår ny tekst.
- Ikke finn feil som ikke finnes. Ikke dikt opp timer.
- Maks 20 funn.`;

function text(value) {
  return String(value || '').trim();
}

function normalizeFinding(row, allowed) {
  const entryId = text(row?.entryId);
  if (!entryId || !allowed.has(entryId)) return null;
  const severity = row?.severity === 'warn' ? 'warn' : 'error';
  const kind = row?.kind === 'avvik' ? 'avvik' : 'skrivefeil';
  const message = text(row?.message).slice(0, 180);
  if (!message) return null;
  const suggestion = text(row?.suggestion).slice(0, 240);
  const code = `${kind}:${message.slice(0, 40)}`;
  return {
    id: `ai:${entryId}:${code}`,
    entryId,
    severity,
    kind,
    message,
    suggestion,
  };
}

export async function handleScanTimesheet(data) {
  const rows = (Array.isArray(data?.entries) ? data.entries : []).slice(0, 80).map((row) => ({
    id: text(row?.id).slice(0, 60),
    date: text(row?.date).slice(0, 10),
    hours: Number(row?.hours) || 0,
    project: text(row?.projectName).slice(0, 80),
    text: text(row?.description).slice(0, 240),
  })).filter((row) => row.id);
  const key = getGeminiKey();
  if (!key || !rows.length) return { findings: [], engine: 'local' };
  const allowed = new Set(rows.map((row) => row.id));
  const raw = await callGeminiJson(key, SYSTEM, JSON.stringify(rows), {
    maxOutputTokens: 2048,
    maxModels: 2,
  });
  const list = Array.isArray(raw) ? raw : (raw?.findings || []);
  const findings = [];
  const seen = new Set();
  for (const row of list) {
    const finding = normalizeFinding(row, allowed);
    if (!finding || seen.has(finding.id)) continue;
    seen.add(finding.id);
    findings.push(finding);
    if (findings.length >= 20) break;
  }
  return { findings, engine: 'gemini' };
}
