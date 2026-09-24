/**
 * Lokal barn-chat uten ekstern AI — aldersbevisst, med enkel intensjon og kunnskapsbase.
 */

const ADULT_ONLY = /mobbing|mobbe|mobbet|slåss|slå|vold|selvmord|død|dør|sex|seks|porno|naken|kniv|våpen|alkohol|røyk|sigaret|narkot|overgrep|misbruk|gråter|gråte|redd for|veldig trist|vil ikke leve/i;

const YOUNG = 'young'; // ~6–9
const KID = 'kid'; // ~10–12
const TEEN = 'teen'; // 13+

function toneLevel(age) {
  // Hvis vi mangler alder eller alder er ugyldig, velg nøytral "kid"-tone
  // fremfor å anta "young" (aldersbegrenset oppførsel).
  if (age == null) return KID;
  if (age < 8) return YOUNG;
  if (age < 13) return KID;
  return TEEN;
}

function firstName(name) {
  const n = String(name || '').trim().split(/\s+/)[0];
  return n || 'du';
}

function pick(tone, young, kid, teen) {
  if (tone === YOUNG) return young;
  if (tone === TEEN) return teen;
  return kid;
}

function normalize(text) {
  return String(text || '').toLowerCase().trim()
    .replace(/[æ]/g, 'ae').replace(/[ø]/g, 'o').replace(/[å]/g, 'a');
}

function matches(q, patterns) {
  return patterns.some((p) => (p instanceof RegExp ? p.test(q) : q.includes(p)));
}

function tryMath(q) {
  const rules = [
    [/(\d+)\s*(pluss|\+)\s*(\d+)/i, '+'],
    [/(\d+)\s*(minus|−|-)\s*(\d+)/i, '-'],
    [/(\d+)\s*(ganger|x|\*|·)\s*(\d+)/i, '*'],
    [/(\d+)\s*(delt|\/|:)\s*(\d+)/i, '/'],
    [/hva er\s+(\d+)\s*\+\s*(\d+)/i, '+'],
    [/hva er\s+(\d+)\s*-\s*(\d+)/i, '-'],
    [/hva er\s+(\d+)\s*[x×*]\s*(\d+)/i, '*'],
  ];
  for (const [re, op] of rules) {
    const m = q.match(re);
    if (!m) continue;
    const a = Number(m[1]);
    const b = Number(m[3] || m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (op === '+') return `${a} + ${b} = ${a + b}`;
    if (op === '-') return `${a} − ${b} = ${a - b}`;
    if (op === '*') return `${a} × ${b} = ${a * b}`;
    if (op === '/' && b !== 0) {
      const val = a / b;
      return Number.isInteger(val) ? `${a} ÷ ${b} = ${val}` : `${a} ÷ ${b} = ${Math.round(val * 100) / 100}`;
    }
  }
  return null;
}

function followUpFromHistory(message, history, tone, name) {
  const q = normalize(message);
  if (!matches(q, [/mer/, /fortell/, /eksempel/, /hvordan/, /forklar/, /enklere/, /simpler/, /igjen/])) {
    return null;
  }
  const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant?.text) return null;
  const prev = lastAssistant.text.toLowerCase();
  if (/lekse|oppgave|skole/.test(prev)) {
    return pick(tone,
      `Ok ${name}! Del oppgaven i tre små biter. Gjør bit 1 først — så tar vi resten. Spør en voksen hvis du står helt fast. Du klarer det! 📚`,
      `Greit, ${name}! Prøv dette: les oppgaven høyt, understrek det viktigste, og start med det du synes er lettest. Ta en kort pause etter 15 min. Spør en voksen hvis du sitter fast.`,
      `${name}, del oppgaven i konkrete steg og skriv dem ned. Start med det enkleste — momentum hjelper. 15–20 min fokus, så pause. Fasit får du ikke her, men metoden hjelper.`,
    );
  }
  if (/les/.test(prev)) {
    return pick(tone,
      'Les 5 sider, så fortell med egne ord hva som skjedde. Tegn gjerne en figur fra historien! 📖',
      'Les en side om gangen. Etter hver side: hva skjedde? Hvem var med? Skriv ett spørsmål du lurer på.',
      'Prøv aktiv lesing: noter 3 nøkkelord per side og oppsummer til slutt med 2 setninger.',
    );
  }
  return null;
}

function adultRedirect(name, tone) {
  return pick(tone,
    `${name}, det der er viktig — men du bør snakke med en voksen du stoler på (mamma, pappa, lærer). De kan hjelpe deg best. 💙`,
    `${name}, dette er noe du bør ta med en voksen — foresatt eller lærer. De kjenner deg og situasjonen. Jeg er her for lekser og hverdagstips.`,
    `${name}, det der bør du snakke med en voksen om. Jeg kan hjelpe med skole, planlegging og motivasjon — ikke slike tunge tema.`,
  );
}

function greeting(name, tone) {
  return pick(tone,
    `Hei ${name}! 👋 Jeg er Weekplan-hjelperen. Spør om lekser, lesing eller hva du lurer på!`,
    `Hei ${name}! 👋 Spør meg om lekser, hobbyer, eller hvordan Weekplan fungerer.`,
    `Hei ${name}! Jeg hjelper med lekser, planlegging og tips. Hva lurer du på?`,
  );
}

function homeworkHelp(name, tone, subject) {
  const tips = {
    matte: pick(tone,
      'Matte-tips: tell på fingrene eller tegn små figurer. Start med det du kan! 🔢',
      'Matte: skriv oppgaven, finn det du vet, og ta ett steg om gangen. Sjekk med regnetrening etterpå.',
      'Matte: identifiser hva oppgaven spør om, skriv formelen, og sjekk enheten til slutt.',
    ),
    norsk: pick(tone,
      'Norsk: les sakte og høyt. Finn hovedpersonen og hva som skjer. ✏️',
      'Norsk: les teksten to ganger — først for å skjønne, så for detaljer. Noter 3 viktige ord.',
      'Norsk: skisser svar med stikkord før du skriver hele setninger. Les korrektur høyt.',
    ),
    engelsk: pick(tone,
      'Engelsk: les ordet høyt tre ganger. Prøv å bruke det i en setning! 🇬🇧',
      'Engelsk: skriv 5 nye ord i dag og lag setninger. Se på ordet i sammenheng i teksten.',
      'Engelsk: les høyt for flyt, og noter uttrykk du ikke kjenner — slå opp eller spør lærer.',
    ),
    lesing: pick(tone,
      'Lesetips: 10 minutter er nok! Finn et rolig sted og kos deg med boka. 📚',
      'Lesing: 15–20 min uten skjerm. Oppsummer med én setning når du er ferdig.',
      'Lesing: varier mellom skjønnlitteratur og fag. Noter ett spørsmål per kapittel.',
    ),
    default: pick(tone,
      `${name}, del leksen i små deler. Gjør én del, ta en kort pause, så neste. Spør en voksen hvis du står fast! 💪`,
      `${name}, start med det letteste. Skriv ned hva oppgaven spør om. 15 min fokus, så pause.`,
      `${name}, lag en mini-plan: les oppgaven, noter det ukjente, start med det enkleste steget.`,
    ),
  };
  return tips[subject] || tips.default;
}

function scienceAnswer(q, tone, name) {
  if (/himmel|blå|blaa/.test(q)) {
    return pick(tone,
      'Himmelen ser blå ut fordi sollyset spredes i lufta — blått lys «spretter» mest! ☀️💙',
      'Sol lyser hvitt, men lufta sprer blått lys mer enn andre farger. Derfor ser himmelen blå ut!',
      'Rayleigh-spredning: korte bølgelengder (blått) spredes mer i atmosfæren — derfor blå himmel.',
    );
  }
  if (/regnbue|regnbue/.test(q)) {
    return pick(tone,
      'Regnbue kommer når sol og regn møtes — lyset deles i mange farger! 🌈',
      'Solens hvite lys brytes i vanndråper og blir til rød, gul, grønn, blå og mer.',
      'Regnbuen er spektrum: vanndråper bryter hvitt lys i ulike bølgelengder.',
    );
  }
  if (/måne|mane|månen/.test(q)) {
    return pick(tone,
      'Månen lyser ikke selv — den speiler sola! 🌙',
      'Månen reflekterer sollys. Vi ser ulike faser fordi sol og måne står forskjellig.',
      'Månefaser skyldes hvor mye av den opplyste siden vi ser fra jorden.',
    );
  }
  if (/dinosaur|dino/.test(q)) {
    return pick(tone,
      'Dinosaurer levde for veldig lenge siden — før mennesker fantes! 🦕',
      'Dinosaurer døde ut for ca. 66 millioner år siden. Fossiler forteller oss om dem.',
      'De fleste dinosaurer døde ut ved K-Pg-utdøingen; noen linjer ble til fugler.',
    );
  }
  if (/vann.*(koke|100)|100.*grad/.test(q)) {
    return pick(tone,
      'Vann koker ved 100 grader — da bobler det! 💧',
      'Vann koker ved omtrent 100 °C ved normalt lufttrykk.',
      'Kokepunktet avhenger av trykk — på fjellet koker vann ved lavere temperatur.',
    );
  }
  if (/planet|solsystem/.test(q)) {
    return pick(tone,
      'Solsystemet har sola i midten og planeter som jorda rundt! 🌍',
      'Åtte planeter går rundt sola. Jorda er den tredje — der bor vi!',
      'Indre planeter ( stein ) og ytre ( gass ) — jorda er i «Goldilocks-sone» for liv.',
    );
  }
  return null;
}

function motivation(name, tone, q) {
  if (/trøtt|trett|orker ikke|orker|vanskelig|gir opp|klarer ikke/.test(q)) {
    return pick(tone,
      `${name}, det er lov å synes det er vanskelig! Ta 5 dype pust, drikk vann, prøv én liten ting. Du er flink! 💪`,
      `${name}, alle har tunge dager. Start med 5 minutter — ofte blir det lettere. Be om hjelp hvis du trenger det.`,
      `${name}, motivation følger handling. Sett en 10-min timer og gjør det minste steget. Resten kan vente.`,
    );
  }
  if (/kjede|kjedelig|kjeder/.test(q)) {
    return pick(tone,
      'Kjedelig? Prøv å gjøre det til et spill — tidtak eller poeng til deg selv! 🎯',
      'Lag en liten utfordring: «kan jeg gjøre dette på 10 min?» Musikk i bakgrunnen kan hjelpe.',
      'Bytt rekkefølge på oppgaver, ta en kort pause, eller beløn deg selv etterpå.',
    );
  }
  return null;
}

function weekplanHelp(name, tone, q, todos) {
  if (/poeng|stjerne|belønning|premie/.test(q)) {
    return pick(tone,
      'Poeng får du når du gjør gjøremål og voksne attesterer! Se under Stjerner. ⭐',
      'Fullfør gjøremål → voksne attesterer → poeng og belønning. Sjekk Stjerner-fanen.',
      'Poeng kobles til attestede gjøremål. Snakk med foresatt om belønningsregler.',
    );
  }
  if (/gjøremål|oppgave|todo|husk|skal jeg|hva skal|i dag|idag/.test(q)) {
    if (todos?.length) {
      const list = todos.slice(0, 5).map((t) => `• ${t}`).join('\n');
      return pick(tone,
        `${name}, her er noe du kan gjøre:\n${list}\nStart med den første! ✅`,
        `${name}, aktive gjøremål:\n${list}\nKryss av i appen når du er ferdig.`,
        `${name}, dette ligger på planen:\n${list}\nPrioriter det som haster først.`,
      );
    }
    return pick(tone,
      `${name}, sjekk Gjøremål-fanen i Weekplan — der ser du hva voksne har lagt inn! 📋`,
      'Se under Gjøremål i appen. Du kan bare krysse av for i dag eller tidligere dager.',
      'Gå til Gjøremål i Weekplan. Foresatt kan legge inn og attestere — du ser fremdrift i ukeoversikten.',
    );
  }
  if (/ukeplan|timeplan|program|kalender/.test(q)) {
    return pick(tone,
      'Timeplan finner du under Program. Kalender viser hendelser! 📅',
      'Program = skoletider. Kalender = aktiviteter. Gjøremål = det du skal gjøre hjemme.',
      'Program-fanen har timeplan, Kalender har hendelser, Gjøremål har oppgaver hjemme.',
    );
  }
  return null;
}

function hobbyAnswer(q, tone, name) {
  if (/fotball|fotball|soccer/.test(q)) {
    return pick(tone,
      'Fotball er gøy! Øv på pasninger og ha det moro med venner. ⚽',
      'Tren ballkontroll 10 min daglig — touch, touch, pasning. Varm alltid opp.',
      'Kombiner teknikk (touch) med kondisjon. Se på posisjonsspill, ikke bare ballen.',
    );
  }
  if (/minecraft|gaming|spill|roblox|fortnite/.test(q)) {
    return pick(tone,
      'Spill er gøy — husk pauser og avtal med voksne hvor lenge! 🎮',
      'Sett tidsgrense med foresatt. Pause hver 45. min. Ikke del passord med andre.',
      'Balansér skjermtid med aktivitet og søvn. Spør foresatt om regler for multiplayer.',
    );
  }
  if (/tegn|tegne|maling|kreativ/.test(q)) {
    return pick(tone,
      'Tegn det du liker! Start med en enkel form — sirkel, firkant — og bygg videre. 🎨',
      'Tegn 5 min hver dag. Kopier noe du liker for å lære — så finner du egen stil.',
      'Skisser lett med blyant først. Eksperimenter med skygge og perspektiv.',
    );
  }
  return null;
}

function defaultHelp(name, tone) {
  return pick(tone,
    `${name}, bra spørsmål! Jeg kan hjelpe med lekser, lesing, gjøremål og ting du lurer på. Prøv å spørre mer spesifikt — for eksempel «hjelp med matte» eller «lesetips»! 🤔`,
    `${name}, jeg hjelper best med skole, Weekplan og hverdagen. Spør om lekser, motivasjon, eller «hva skal jeg gjøre i dag?»`,
    `${name}, prøv å være konkret — fag, lekse, planlegging eller motivasjon. Ved tunge tema: snakk med en voksen.`,
  );
}

/**
 * @param {object} opts
 * @param {string} opts.message
 * @param {string} [opts.childName]
 * @param {number|null} [opts.age]
 * @param {string[]} [opts.todos]
 * @param {Array<{role:string,text:string}>} [opts.history]
 */
export function childChatLocal(opts) {
  const message = String(opts?.message || '').trim();
  const name = firstName(opts?.childName);
  const age = opts?.age != null && Number.isFinite(Number(opts.age)) ? Number(opts.age) : null;
  const tone = toneLevel(age);
  const history = Array.isArray(opts?.history) ? opts.history : [];
  const todos = Array.isArray(opts?.todos) ? opts.todos : [];
  const q = normalize(message);

  if (!message) return greeting(name, tone);

  if (ADULT_ONLY.test(message)) return adultRedirect(name, tone);

  const followUp = followUpFromHistory(message, history, tone, name);
  if (followUp) return followUp;

  if (matches(q, [/^(hei|hallo|hello|morn|god morgen|yo)\b/, /^hi\b/])) {
    return greeting(name, tone);
  }
  if (matches(q, [/takk|thanks/, /^bra$/, /supert/, /nice/])) {
    return pick(tone,
      'Bare hyggelig! Spør igjen hvis du lurer på noe. 😊',
      'Glad jeg kunne hjelpe! Lykke til videre.',
      'Ingen årsak — lykke til med resten!',
    );
  }
  if (matches(q, [/ha det/, /adjø/, /bye/, /ses/])) {
    return pick(tone,
      `Ha det, ${name}! 👋`,
      `Ha det, ${name}! Kos deg.`,
      `Ha det, ${name}.`,
    );
  }

  const math = tryMath(q);
  if (math) {
    return pick(tone,
      `${math}! Regn gjerne en gang til for å sjekke. 🔢`,
      `${math}. Dobbeltsjekk om du er usikker.`,
      math,
    );
  }

  const sci = scienceAnswer(q, tone, name);
  if (sci) return sci;

  const mot = motivation(name, tone, q);
  if (mot) return mot;

  const wp = weekplanHelp(name, tone, q, todos);
  if (wp) return wp;

  const hob = hobbyAnswer(q, tone, name);
  if (hob) return hob;

  if (matches(q, [/matematikk|matte|regne|plus|gange|brøk|brok|geometri/])) {
    return homeworkHelp(name, tone, 'matte');
  }
  if (matches(q, [/norsk|skrive|stave|ord| dikt/])) {
    return homeworkHelp(name, tone, 'norsk');
  }
  if (matches(q, [/engelsk|english|ordbok/])) {
    return homeworkHelp(name, tone, 'engelsk');
  }
  if (matches(q, [/lese|lesing|bok|kapittel/])) {
    return homeworkHelp(name, tone, 'lesing');
  }
  if (matches(q, [/lekse|leksene|skole|skoleoppgave|oppgave|prøve|prove|test/])) {
    return homeworkHelp(name, tone, 'default');
  }

  if (matches(q, [/hva er|hvorfor|hvordan|kan du forklare/])) {
    return pick(tone,
      `${name}, det er et fint spørsmål! Jeg vet ikke alt, men prøv å spørre mer spesifikt — for eksempel «hvorfor er himmelen blå?» 🌤️`,
      `${name}, gi meg litt mer detaljer — emne og fag — så hjelper jeg bedre. Ved skole: spør også læreren.`,
      `${name}, presiser spørsmålet (fag/tema). For skolestoff er lærer og foresatt gode ressurser i tillegg.`,
    );
  }

  return defaultHelp(name, tone);
}

export function childGreeting(childName, age) {
  const name = firstName(childName);
  const tone = toneLevel(age != null ? Number(age) : null);
  return greeting(name, tone);
}

export function childSuggestedPrompts(age) {
  const tone = toneLevel(age != null ? Number(age) : null);
  if (tone === YOUNG) {
    return ['Hjelp med lekser', 'Lesetips', 'Hva skal jeg gjøre i dag?', 'Hvorfor er himmelen blå?'];
  }
  if (tone === TEEN) {
    return ['Studietips for i dag', 'Hvordan planlegge uka?', 'Hva er gjøremålene mine?', 'Motivasjon'];
  }
  return ['Hjelp meg starte leksen', 'Tips til lesing', 'Hva skal jeg gjøre i dag?', 'Hvordan fungerer poeng?'];
}
