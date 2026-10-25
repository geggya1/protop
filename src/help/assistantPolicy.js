/**
 * Når skal ProTop-assistenten spørre AI-motoren på serveren?
 * Sikre treff i hjelpebiblioteket svares lokalt (raskt og presist);
 * uklare eller lange spørsmål går til AI med de mest relevante sidene.
 * Ren JS, så node-testene kan bruke den.
 */

/** Lokale svar over denne grensen er presise nok til å vises uten AI. */
export const LOCAL_CONFIDENT = 0.5;

const PASSTHROUGH = new Set(['greeting', 'thanks', 'offTopic', 'human', 'empty', 'bug']);

export function shouldAskServer(local, question) {
  if (!local) return true;
  if (PASSTHROUGH.has(local.intent)) return false;
  const words = String(question || '').trim().split(/\s+/).length;
  if (local.confidence >= LOCAL_CONFIDENT && words <= 14) return false;
  return true;
}
