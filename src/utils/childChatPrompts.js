/** Forslagsknapper for AI-chat — speiler functions/childChatLocal.js og voksen Gemini-chat */

function toneLevel(age) {
  if (age == null || age < 8) return 'young';
  if (age < 13) return 'kid';
  return 'teen';
}

export function childGreeting(childName, age) {
  const name = String(childName || 'du').trim().split(/\s+/)[0] || 'du';
  const tone = toneLevel(age);
  if (tone === 'young') {
    return `Hei ${name}! 👋 Jeg er ProTop-hjelperen. Spør om lekser, lesing eller hva du lurer på!`;
  }
  if (tone === 'teen') {
    return `Hei ${name}! Jeg hjelper med lekser, planlegging og tips. Hva lurer du på?`;
  }
  return `Hei ${name}! 👋 Spør meg om lekser, hobbyer, eller hvordan ProTop fungerer.`;
}

export function childSuggestedPrompts(age) {
  const tone = toneLevel(age);
  if (tone === 'young') {
    return ['Hjelp med lekser', 'Lesetips', 'Hva skal jeg gjøre i dag?', 'Hvorfor er himmelen blå?'];
  }
  if (tone === 'teen') {
    return ['Studietips for i dag', 'Hvordan planlegge uka?', 'Hva er gjøremålene mine?', 'Motivasjon'];
  }
  return ['Hjelp meg starte leksen', 'Tips til lesing', 'Hva skal jeg gjøre i dag?', 'Hvordan fungerer poeng?'];
}

export const CHILD_DISCLAIMER = 'Jeg hjelper med lekser og hverdagen — ikke alt. Ved vanskelige ting: snakk med en voksen.';

export const PARENT_GREETING = 'Hei! Jeg er ProTop-assistenten. Spør om ukeplan, middager, gjøremål, lekser eller hva som helst i familie-hverdagen — vi tar det steg for steg.';

export const PARENT_DISCLAIMER = 'AI-assistenten kan gjøre feil. Svarene er veiledende og erstatter ikke fagfolk ved alvorlige tema.';

export function parentSuggestedPrompts() {
  return [
    'Lag middagsplan for uka',
    'Foreslå kveldsrutine for barna',
    'Hvordan bruke gjøremål i ProTop?',
    'Tips til lekser uten mas',
  ];
}
