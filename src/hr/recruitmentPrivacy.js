/**
 * Opplysninger som ikke skal innhentes eller brukes i rekruttering.
 *
 * Likestillings- og diskrimineringsloven § 30: arbeidsgiver må ikke innhente opplysninger om
 * graviditet, adopsjon, familieplanlegging, religion, livssyn, seksuell orientering m.m.
 * ved ansettelse. aml § 9-3: bare helseopplysninger som er nødvendige for stillingen.
 * Sletting av søknader står i retention.js, lønnskartlegging i payGap.js.
 */

// Norske ord: ordgrense i JavaScript tar ikke æ/ø/å, så grensene bygges med Unicode-bokstaver.
const W = String.raw`\p{L}*`;

function words(...parts) {
  try {
    return new RegExp(String.raw`(?<!\p{L})(?:` + parts.join('|') + String.raw`)(?!\p{L})`, 'iu');
  } catch {
    // Motorer uten lookbehind eller \p{L}: enklere treff uten ordgrense.
    return new RegExp(`(?:${parts.join('|').split(W).join('[a-zæøå]*')})`, 'i');
  }
}

const TOPICS = [
  { id: 'pregnancy', label: 'graviditet', pattern: words(`gravid${W}`, `svanger${W}`, 'termindato') },
  { id: 'family', label: 'familieplaner', pattern: words('barneplaner', `familieplan${W}`, 'planer om barn', 'ønsker (?:seg )?barn', 'få barn', 'stifte familie', `adopsjon${W}`, 'adoptere') },
  { id: 'children', label: 'barn og omsorg', pattern: words('antall barn', 'har (?:du |hun |han |to |tre )?(?:små)?barn', 'småbarn', `barnehage${W}`) },
  { id: 'religion', label: 'religion eller livssyn', pattern: words(`religi${W}`, `livssyn${W}`, `muslim${W}`, `kristen${W}`, `jødisk${W}`, 'hijab', 'tror på gud') },
  { id: 'orientation', label: 'seksuell orientering eller kjønnsidentitet', pattern: words(`homofil${W}`, `lesbisk${W}`, 'legning', 'seksuell orientering', 'kjønnsidentitet', `transperson${W}`) },
  { id: 'health', label: 'helse', pattern: words(`sykdom${W}`, `diagnose${W}`, 'sykehistorie', `helseproblem${W}`, `kronisk${W}`, `psykisk${W}`, `medisiner${W}`) },
  { id: 'ethnicity', label: 'etnisitet', pattern: words('etnisitet', 'hudfarge', 'rase') },
  { id: 'union', label: 'fagforening', pattern: words(`fagforening${W}`, `fagorganisert${W}`) },
];

/** Temaer i en tekst som ikke skal brukes i ansettelsen. Returnerer etiketter. */
export function sensitiveTopics(value) {
  const textValue = String(value ?? '');
  if (!textValue.trim()) return [];
  return TOPICS.filter((row) => row.pattern.test(textValue)).map((row) => row.label);
}
