/**
 * Lokal Leksehjelp-veileder for tekst/research uten Gemini.
 * Holdes uten firebase-admin så den kan testes direkte.
 */
import {
  detectArithmeticProblem,
  buildMathCoachResponse,
  serverCanReveal,
} from './tutorMath.js';

export function looksLikeResearchTask(text) {
  const t = String(text || '').toLowerCase();
  return /(internett|på nettet|\bsøke?\b|\bsøker\b|\bsøkeord\b|google|finn fakta|finn ut|undersøk|kilde(r)?|wikipedia|oppslag|les om|finn informasjon|faktatek|research|søk etter|finn svar på nettet)/i.test(t);
}

function researchBoardSteps(taskText) {
  const topic = String(taskText || 'Oppgaven').replace(/\s+/g, ' ').trim().slice(0, 48);
  return [
    { id: 'b1', expression: topic, note: 'Hva skal du finne ut?', kind: 'write' },
    { id: 'b2', expression: 'Søkeord: …', note: '2–3 stikkord (ikke hele spørsmålet)', kind: 'ask' },
    { id: 'b3', expression: 'Fakta: …', note: 'Én ting du fant', kind: 'ask' },
    { id: 'b4', expression: 'Kilde: …', note: 'Hvor fant du det?', kind: 'ask' },
    { id: 'b5', expression: 'Mitt svar: …', note: 'Skriv med egne ord', kind: 'ask' },
  ];
}

function textBoardSteps(taskText) {
  const topic = String(taskText || 'Oppgaven').replace(/\s+/g, ' ').trim().slice(0, 48);
  return [
    { id: 'b1', expression: topic, note: 'Oppgaven', kind: 'write' },
    { id: 'b2', expression: 'Stikkord: …', note: 'Det viktigste du skal ha med', kind: 'ask' },
    { id: 'b3', expression: 'Første setning: …', note: 'Start svaret ditt her', kind: 'ask' },
    { id: 'b4', expression: 'Fullt svar: …', note: 'Skriv ferdig med egne ord', kind: 'ask' },
  ];
}

function boardVisibleForAction(action, lvl, total, hasReply) {
  if (action === 'reveal') return total;
  if (action === 'reply' || action === 'check') {
    return Math.min(total, Math.max(2, (hasReply ? 2 : 1) + Math.min(2, lvl)));
  }
  if (action === 'hint' || action === 'stuck') {
    return Math.min(total, Math.max(2, 1 + lvl));
  }
  return Math.min(total, 2); // start: vis oppgave + første konkrete steg
}

function researchCoachMessage(action, lvl, young, hasReply) {
  if (action === 'start') {
    return young
      ? 'Dette er en finne-ut-oppgave. Skriv 2–3 søkeord du kan bruke på nettet — bare stikkord, ikke hele spørsmålet.'
      : 'Dette ser ut som en research-oppgave. Skriv 2–3 søkeord (stikkord) du kan søke på — ikke lim inn hele oppgaveteksten.';
  }
  if (action === 'stuck') {
    return young
      ? 'Prøv dette nå: Åpne søk, skriv stikkordene, og skriv inn ÉN setning du fant.'
      : 'Konkret steg: søk med stikkordene, les første treff, og skriv inn én fakta + hvor du fant den.';
  }
  if (action === 'hint') {
    if (lvl <= 1) {
      return 'Hint: Plukk ut person / sted / tema fra oppgaven som søkeord. Hvilke 2 ord vil du søke på?';
    }
    if (lvl === 2) {
      return 'Hint: Etter søket — skriv ned bare én fakta (ikke kopiér hele siden). Hva fant du?';
    }
    return 'Hint: Skriv svaret med egne ord, og notér kilden (nettside/bok). Hva blir din setning?';
  }
  if (action === 'check' || (action === 'reply' && hasReply)) {
    return young
      ? 'Bra at du skrev noe! Neste: har du en kilde (hvor du fant det)? Skriv den, eller skriv én fakta til.'
      : 'Godt — da har vi noe å bygge på. Neste synlige steg på tavlen: noter kilde, eller formuler svaret med egne ord.';
  }
  return 'Skriv søkeordene dine, eller lim inn én fakta du fant — så går vi videre på tavlen.';
}

function textCoachMessage(action, lvl, subject, young, hasReply) {
  const subj = subject || 'oppgaven';
  if (action === 'start') {
    return young
      ? `Vi tar ${subj}. Skriv 2–3 stikkord for det du skal ha med i svaret.`
      : `Vi tar ${subj} steg for steg. Skriv stikkordene for det svaret ditt må inneholde.`;
  }
  if (action === 'stuck') {
    return young
      ? 'Skriv bare første setning i svaret ditt — så bygger vi videre derfra.'
      : 'Konkret: skriv åpningssetningen i svaret. Deretter fyller vi inn resten.';
  }
  if (action === 'hint') {
    if (lvl <= 1) return 'Hint: Hva er det viktigste ordet eller temaet du må ha med? Skriv det som stikkord.';
    if (lvl === 2) return 'Hint: Lag en enkel plan: innledning → 1–2 poeng → avslutning. Hva blir punkt 1?';
    return 'Hint: Skriv neste setning i svaret — ikke hele teksten på én gang.';
  }
  if (action === 'check' || (action === 'reply' && hasReply)) {
    return young
      ? 'Fint! Se på tavlen — neste linje er klar. Skriv videre derfra.'
      : 'Takk, da tegner jeg neste steg på tavlen. Fortsett med neste linje.';
  }
  return 'Skriv det du har så langt — så viser tavlen neste steg.';
}

/** Enkle skolefakta som kan gis lokalt uten Gemini. */
export function localFactAnswer(text) {
  const q = String(text || '').toLowerCase();
  if (!q.trim()) return null;

  if (/hovedstad.*(norge|norsk)|hovedstaden i norge/.test(q)) {
    return 'Hovedstaden i Norge er Oslo.';
  }
  if (/hovedstad.*(sverige)|hovedstaden i sverige/.test(q)) {
    return 'Hovedstaden i Sverige er Stockholm.';
  }
  if (/hovedstad.*(danmark)|hovedstaden i danmark/.test(q)) {
    return 'Hovedstaden i Danmark er København.';
  }
  if (/hvor mange fylker|antall fylker/.test(q)) {
    return 'Norge har 15 fylker (fra 2024).';
  }
  if (/kongen.*(norge)|norges konge|hvem er konge/.test(q)) {
    return 'Norges konge er Kong Harald V.';
  }
  if (/statsminister|hvem er statsminister/.test(q)) {
    return 'Norges statsminister (2021–) er Jonas Gahr Støre.';
  }
  if (/planet.*solsystem|hvor mange planeter/.test(q)) {
    return 'Det er åtte planeter i solsystemet. Jorda er den tredje fra sola.';
  }
  if (/hvorfor.*(himmel|himmelen).*blå|hvorfor er himmelen blå/.test(q)) {
    return 'Himmelen ser blå ut fordi sollyset spredes i lufta — blått lys spres mest (Rayleigh-spredning).';
  }
  if (/regnbue/.test(q) && /(hva|hvordan|hvorfor)/.test(q)) {
    return 'Regnbue oppstår når sollys brytes og reflekteres i vanndråper, så vi ser fargene i spekteret.';
  }
  if (/månen?.*(lyse|lys)/.test(q) || /hvorfor.*(månen?).*lyse/.test(q)) {
    return 'Månen lyser ikke selv — den speiler sollys.';
  }
  if (/vann.*koke|kokepunkt.*vann/.test(q)) {
    return 'Vann koker ved cirka 100 °C ved normalt lufttrykk.';
  }
  if (/jordas?.*(form|rund)|er jorda rund/.test(q)) {
    return 'Jorda er nesten kulerund (en litt flattrykt sfære).';
  }
  if (/fotosyntese/.test(q)) {
    return 'Fotosyntese: planter bruker sollys, vann og CO₂ til å lage sukker og oksygen.';
  }
  if (/vikingen?e?.*(når|år|tid)/.test(q) || /når.*(viking)/.test(q)) {
    return 'Vikingtiden var ca. år 800–1050.';
  }
  if (/norges nasjonaldag|17\.?\s*mai|syttende mai/.test(q)) {
    return 'Norges nasjonaldag er 17. mai (grunnlovsdagen, 1814).';
  }
  if (/hvor mange ben|bein.*(insekt|insekter)/.test(q)) {
    return 'Insekter har seks bein.';
  }
  if (/hvor mange liter|liter i (en )?kubikkmeter/.test(q)) {
    return '1 kubikkmeter = 1000 liter.';
  }
  if (/hvor mange cm|centimeter i (en )?meter/.test(q)) {
    return '1 meter = 100 centimeter.';
  }
  if (/hvor mange år.*(leap|skudd)|skuddår/.test(q) && /hva|når|hvor/.test(q)) {
    return 'Skuddår har 366 dager (februar får 29 dager), vanligvis hvert 4. år.';
  }
  return null;
}

/** Lokal veileder uten Gemini — brukes når AI mangler / feiler. */
export function localTutorFallback({
  message, subject, action, hintLevel, age, allowFasit = true, attemptCount = 0, history = [],
}) {
  const math = detectArithmeticProblem(message);
  if (math) {
    return buildMathCoachResponse({
      problem: math, action, hintLevel, age, allowFasit, attemptCount,
    });
  }

  const subj = subject || 'oppgaven';
  const lvl = Math.min(3, Math.max(0, Number(hintLevel) || 0) + (action === 'hint' || action === 'stuck' ? 1 : 0));
  const young = age != null && age < 10;
  const canRevealNow = serverCanReveal({ allowFasit, hintLevel: lvl, attemptCount });
  const historyText = Array.isArray(history)
    ? history.map((h) => h?.text || h?.message || '').join('\n')
    : '';
  // Bruk original oppgave fra historikk til tavle/research-deteksjon (message kan være et kort elevsvar).
  const seedText = [message, subj, historyText].filter(Boolean).join('\n');
  const taskSeed = (
    (Array.isArray(history) && history.find((h) => h?.role === 'user' && h?.text)?.text)
    || message
    || subj
  );
  const research = looksLikeResearchTask(seedText);
  const hasReply = action === 'reply' || action === 'check';
  const boardSteps = research ? researchBoardSteps(taskSeed) : textBoardSteps(taskSeed);
  const visible = boardVisibleForAction(action, lvl, boardSteps.length, hasReply);

  const steps = research
    ? [
      { id: 's1', title: 'Finn søkeord', status: 'done', coachNote: '2–3 stikkord.' },
      { id: 's2', title: 'Søk og noter', status: visible >= 3 ? 'done' : 'current', coachNote: 'Én fakta fra nettet.' },
      { id: 's3', title: 'Kilde', status: visible >= 4 ? 'current' : 'locked', coachNote: 'Hvor fant du det?' },
      { id: 's4', title: 'Skriv svaret', status: visible >= 5 ? 'current' : 'locked', coachNote: 'Egne ord.' },
    ]
    : [
      { id: 's1', title: 'Stikkord', status: 'done', coachNote: 'Det viktigste i svaret.' },
      { id: 's2', title: 'Første setning', status: visible >= 3 ? 'done' : 'current', coachNote: 'Start teksten.' },
      { id: 's3', title: 'Bygg ut', status: visible >= 4 ? 'current' : 'locked', coachNote: 'Ett punkt om gangen.' },
      { id: 's4', title: 'Les over', status: 'locked', coachNote: 'Gir det mening?' },
    ];

  if (action === 'reveal') {
    if (!allowFasit || !canRevealNow) {
      return {
        subject: subject || 'annet',
        problemSummary: String(message || 'Oppgaven din').slice(0, 120),
        difficulty: 'middels',
        message: !allowFasit
          ? 'Fasit er skrudd av. Ta neste konkrete steg på tavlen i stedet — skriv det inn her.'
          : 'Prøv neste steg på tavlen først. Skriv et forslag eller be om hint — så kan fasit åpnes.',
        questionToStudent: '',
        hintLevel: Math.min(3, lvl + 1),
        steps,
        currentStepIndex: Math.min(steps.length - 1, 1),
        boardSteps,
        boardVisible: Math.min(boardSteps.length, Math.max(2, visible)),
        encouragement: 'Du lærer mer når du prøver selv!',
        conceptTip: null,
        studentLooksCorrect: false,
        missionAccomplished: false,
        canRevealAnswer: false,
        finalAnswer: null,
        quickReplies: ['Gi meg et hint', 'Jeg prøver'],
        safetyRedirect: false,
        engine: 'local',
      };
    }

    // Lokal fasit uten Gemini: gi konkret svar når vi kan, ellers ferdig fremgangsmåte.
    const known = localFactAnswer(taskSeed) || localFactAnswer(message);
    if (known) {
      return {
        subject: subject || 'annet',
        problemSummary: String(taskSeed || message || 'Oppgaven din').slice(0, 120),
        difficulty: 'lett',
        message: young
          ? `Fasit:\n${known}\n\nLes det, og prøv å si det med egne ord etterpå.`
          : `Fasit:\n${known}\n\nSjekk at du forstår hvorfor — skriv gjerne svaret med egne ord.`,
        questionToStudent: '',
        hintLevel: lvl,
        steps: steps.map((s, i) => ({ ...s, status: 'done' })),
        currentStepIndex: steps.length - 1,
        boardSteps: [
          { id: 'b1', expression: String(taskSeed || message).slice(0, 48), note: 'Oppgaven', kind: 'write' },
          { id: 'b2', expression: known.slice(0, 80), note: 'Fasit', kind: 'write' },
        ],
        boardVisible: 2,
        encouragement: 'Nå vet du svaret — forklar det med egne ord så sitter det.',
        conceptTip: null,
        studentLooksCorrect: false,
        missionAccomplished: true,
        canRevealAnswer: true,
        finalAnswer: known,
        quickReplies: [],
        safetyRedirect: false,
        engine: 'local',
      };
    }

    const method = research
      ? (
        'Fasit — fremgangsmåte for å finne svaret:\n'
        + '1) Velg 2–3 søkeord fra oppgaven.\n'
        + '2) Søk og skriv ned 1–2 fakta med egne ord.\n'
        + '3) Noter kilden (nettside/bok).\n'
        + '4) Skriv hele svaret ut fra notatene.\n'
        + 'Spør en voksen hvis du trenger hjelp til å finne en trygg kilde.'
      )
      : (
        'Fasit — fremgangsmåte for tekstsvar:\n'
        + '1) Skriv stikkord for det som må være med.\n'
        + '2) Skriv første setning.\n'
        + '3) Legg til 1–2 setninger med forklaring.\n'
        + '4) Les over og rett.\n'
        + 'Be en voksen lese gjennom hvis du er usikker.'
      );

    return {
      subject: subject || 'annet',
      problemSummary: String(taskSeed || message || 'Oppgaven din').slice(0, 120),
      difficulty: 'middels',
      message: young
        ? `Her er fasiten som en plan du kan følge:\n${method}`
        : `Her er fasiten (tydelig fremgangsmåte):\n${method}`,
      questionToStudent: '',
      hintLevel: lvl,
      steps: steps.map((s, i) => ({ ...s, status: i < steps.length - 1 ? 'done' : 'current' })),
      currentStepIndex: steps.length - 1,
      boardSteps: boardSteps.map((b) => (
        b.kind === 'ask' ? { ...b, kind: 'write', note: b.note || 'Fyll inn' } : b
      )),
      boardVisible: boardSteps.length,
      encouragement: 'Følg stegene — da blir det overkommelig.',
      conceptTip: research
        ? 'Gode søkeord er korte. Unngå å lime inn hele oppgaveteksten i søkefeltet.'
        : 'Én setning om gangen er lettere enn hele svaret på én gang.',
      studentLooksCorrect: false,
      missionAccomplished: false,
      canRevealAnswer: true,
      finalAnswer: method,
      quickReplies: [],
      safetyRedirect: false,
      engine: 'local',
    };
  }

  const messageText = research
    ? researchCoachMessage(action, lvl, young, hasReply)
    : textCoachMessage(action, lvl, subj, young, hasReply);

  return {
    subject: subject || 'annet',
    problemSummary: message ? String(message).slice(0, 120) : 'Din oppgave',
    difficulty: 'middels',
    message: messageText,
    questionToStudent: '',
    hintLevel: lvl,
    steps,
    currentStepIndex: Math.min(steps.length - 1, Math.max(0, visible - 1)),
    boardSteps,
    boardVisible: visible,
    encouragement: hasReply
      ? 'Fint at du skrev — da kan tavlen gå videre.'
      : 'Ett konkret steg om gangen.',
    conceptTip: research
      ? 'Søkeord = stikkord. Ikke hele spørsmålet.'
      : null,
    studentLooksCorrect: false,
    missionAccomplished: false,
    canRevealAnswer: allowFasit && canRevealNow && lvl >= 3,
    finalAnswer: null,
    quickReplies: research
      ? ['Jeg har søkeord', 'Gi meg et hint']
      : ['Jeg skriver stikkord', 'Gi meg et hint'],
    safetyRedirect: false,
    engine: 'local',
  };
}

