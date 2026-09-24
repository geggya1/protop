/**
 * Bygg notat-body fra AI-svar.
 * Kun den pene omskrivningen — ikke nøkkelpunkter eller råtranskripsjon.
 */
export function stripUnwantedNoteSections(text) {
  let t = String(text || '').trim();
  if (!t) return '';
  // Fjern seksjoner modellen likevel kan ha laget
  t = t.replace(/\n*##\s*Nøkkelpunkter\b[\s\S]*?(?=\n##\s|$)/gi, '');
  t = t.replace(/\n*##\s*Key\s*points?\b[\s\S]*?(?=\n##\s|$)/gi, '');
  t = t.replace(/\n*##\s*Transkripsjon\b[\s\S]*$/gi, '');
  t = t.replace(/\n*##\s*Transcript\b[\s\S]*$/gi, '');
  return t.trim();
}

export function structuredNoteBody({
  title, summary, body,
} = {}) {
  const fromBody = stripUnwantedNoteSections(body);
  if (fromBody) return fromBody;

  const sum = stripUnwantedNoteSections(summary);
  if (sum) return sum;

  if (title) return String(title).trim();
  return '';
}
