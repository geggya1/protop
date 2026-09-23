/** Pure helpers for Leksehjelpen math coaching (no Firebase). */

export function parseAge(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 4 || n > 18) return null;
  return Math.round(n);
}

/** Alder fra fødselsdato (ISO / Timestamp / Date). */
export function ageFromBirthday(value, now = new Date()) {
  if (value == null) return null;
  let birth = null;
  if (value instanceof Date) birth = value;
  else if (typeof value?.toDate === 'function') {
    try { birth = value.toDate(); } catch { birth = null; }
  } else if (typeof value === 'object' && value.seconds != null) {
    birth = new Date(Number(value.seconds) * 1000);
  } else {
    const s = String(value).trim();
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) birth = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    else {
      const dot = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
      if (dot) birth = new Date(Number(dot[3]), Number(dot[2]) - 1, Number(dot[1]));
    }
  }
  if (!birth || Number.isNaN(birth.getTime())) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const md = now.getMonth() - birth.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < birth.getDate())) age -= 1;
  return parseAge(age);
}

/**
 * Enkel aritmetikk / potens i fritekst:
 * «324x9», «324 × 9», «5^2», «5²», «2^10».
 */
export function detectArithmeticProblem(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 80) return null;

  const pow = s.match(/^(\d{1,4})\s*(?:\^|\*\*|²|³)\s*(\d{0,2})?\s*[.?！!]*$/i);
  if (pow || /²|³/.test(s)) {
    const m2 = s.match(/^(\d{1,4})\s*²\s*[.?！!]*$/);
    const m3 = s.match(/^(\d{1,4})\s*³\s*[.?！!]*$/);
    const mCaret = s.match(/^(\d{1,4})\s*(?:\^|\*\*)\s*(\d{1,2})\s*[.?！!]*$/);
    if (m2) {
      const a = Number(m2[1]);
      return {
        a, b: 2, op: '^', display: `${a}^2`, kind: 'power',
      };
    }
    if (m3) {
      const a = Number(m3[1]);
      return {
        a, b: 3, op: '^', display: `${a}^3`, kind: 'power',
      };
    }
    if (mCaret) {
      const a = Number(mCaret[1]);
      const b = Number(mCaret[2]);
      if (Number.isFinite(a) && Number.isFinite(b) && b >= 0 && b <= 12) {
        return {
          a, b, op: '^', display: `${a}^${b}`, kind: 'power',
        };
      }
    }
  }

  const m = s.match(/^(\d{1,6})\s*([x×*·+\+\-−/∶:÷])\s*(\d{1,6})\s*[.?！!]*$/i);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[3]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const opRaw = m[2];
  let op = opRaw;
  if (/[x×*·]/i.test(opRaw)) op = '×';
  else if (/\+/.test(opRaw)) op = '+';
  else if (/[\-−]/.test(opRaw)) op = '−';
  else if (/[\/∶:÷]/.test(opRaw)) op = '÷';
  else return null;
  return {
    a, b, op, display: `${a} ${op} ${b}`, kind: 'arithmetic',
  };
}

function splitPlaceValues(n) {
  const hundreds = Math.floor(n / 100) * 100;
  const tens = Math.floor((n % 100) / 10) * 10;
  const ones = n % 10;
  const parts = [];
  if (hundreds) parts.push({ value: hundreds, label: 'hundre' });
  if (tens) parts.push({ value: tens, label: 'tiere' });
  if (ones || parts.length === 0) parts.push({ value: ones, label: 'enere' });
  return parts;
}

function computeArithmeticAnswer(problem) {
  const { a, b, op } = problem;
  if (op === '×') return a * b;
  if (op === '+') return a + b;
  if (op === '−') return a - b;
  if (op === '^') {
    if (b > 12) return null;
    return a ** b;
  }
  if (op === '÷') {
    if (b === 0) return null;
    return Number.isInteger(a / b) ? a / b : Math.round((a / b) * 1000) / 1000;
  }
  return null;
}

function boardLine(id, expression, note, kind = 'write') {
  return {
    id, expression, note, kind, hiddenAnswer: kind === 'ask',
  };
}

/** Min. forsøk/hint før fasit (speiler client pedagogy). */
export const MIN_ATTEMPTS_BEFORE_FASIT = 2;
export const MIN_HINT_LEVEL_BEFORE_FASIT = 2;

export function serverCanReveal({ allowFasit, hintLevel = 0, attemptCount = 0 } = {}) {
  if (!allowFasit) return false;
  return (
    Number(hintLevel) >= MIN_HINT_LEVEL_BEFORE_FASIT
    || Number(attemptCount) >= MIN_ATTEMPTS_BEFORE_FASIT
  );
}

/**
 * Lokal, aldersbasert matematikk-veileder for enkle stykker (f.eks. 324×9, 5^2).
 * Brukes når Gemini mangler/timeout — og som rask start for ren tekst-aritmetikk.
 */
export function buildMathCoachResponse({
  problem, action, hintLevel, age, allowFasit = true, attemptCount = 0,
}) {
  const young = age == null || age < 10;
  const lvl = Math.min(3, Math.max(0, Number(hintLevel) || 0)
    + (action === 'hint' || action === 'stuck' ? 1 : 0));
  const { a, b, op, display } = problem;
  const answer = computeArithmeticAnswer(problem);
  const canRevealNow = serverCanReveal({ allowFasit, hintLevel: lvl, attemptCount });

  if (op === '^') {
    return buildPowerCoach({
      problem, action, lvl, young, answer, allowFasit, canRevealNow,
    });
  }

  const baseSteps = (() => {
    if (op !== '×' || a < 10) {
      return [
        { id: 's1', title: 'Forstå oppgaven', coachNote: `Vi skal regne ${display}.` },
        { id: 's2', title: 'Velg metode', coachNote: young ? 'Vi kan telle i hopp, eller bruke gangetabellen.' : 'Velg en metode som passer.' },
        { id: 's3', title: 'Regn ut', coachNote: 'Ett steg om gangen.' },
        { id: 's4', title: 'Sjekk', coachNote: 'Gir svaret mening?' },
      ];
    }
    const parts = splitPlaceValues(a);
    const partWords = parts.map((p) => String(p.value)).join(' + ');
    return [
      { id: 's1', title: 'Del opp tallet', coachNote: `${a} = ${partWords} (hundre, tiere, enere).` },
      { id: 's2', title: 'Gang hver del', coachNote: `Gang hver del med ${b} — start med den største.` },
      { id: 's3', title: 'Legg sammen', coachNote: 'Legg sammen del-svarene til ett tall.' },
      { id: 's4', title: 'Sjekk', coachNote: 'Se om svaret er omtrent så stort som du forventer.' },
    ];
  })();

  const markSteps = (currentIdx) => baseSteps.map((s, i) => ({
    ...s,
    status: i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'locked',
  }));

  if (action === 'reveal') {
    if (!allowFasit || !canRevealNow) {
      return {
        subject: 'matematikk',
        problemSummary: display,
        difficulty: a >= 100 ? 'middels' : 'lett',
        message: !allowFasit
          ? 'Fasit er skrudd av for deg. La oss ta neste lille steg i stedet — hva blir første delregning?'
          : 'Prøv selv litt til først! Be om et hint, eller skriv hva du tror — så åpner fasit seg etterpå.',
        questionToStudent: '',
        hintLevel: Math.min(3, lvl + 1),
        steps: markSteps(1),
        currentStepIndex: 1,
        boardSteps: [
          boardLine('b1', display, 'Oppgaven', 'write'),
          boardLine('b2', op === '×' && a >= 10
            ? `${a} = ${splitPlaceValues(a).map((p) => p.value).join(' + ')}`
            : `${display} = ?`, 'Neste steg', 'ask'),
        ],
        boardVisible: 2,
        encouragement: 'Du lærer mer når du prøver selv!',
        conceptTip: op === '×' && a >= 10
          ? 'Tips: Del store tall i hundre, tiere og enere før du ganger.'
          : null,
        studentLooksCorrect: false,
        missionAccomplished: false,
        canRevealAnswer: false,
        finalAnswer: null,
        quickReplies: ['Gi meg et hint', 'Jeg prøver selv'],
        safetyRedirect: false,
        engine: 'local-math',
      };
    }
    let finalAnswer = null;
    let boardSteps = [boardLine('b1', display, 'Oppgaven')];
    if (op === '×' && a >= 10) {
      const parts = splitPlaceValues(a);
      const lines = parts.map((p) => `${p.value} × ${b} = ${p.value * b}`);
      const sum = parts.reduce((acc, p) => acc + p.value * b, 0);
      finalAnswer = `${display}:\n${parts.map((p) => p.value).join(' + ')} = ${a}\n`
        + `${lines.join('\n')}\n`
        + `${parts.map((p) => p.value * b).join(' + ')} = ${sum}`;
      boardSteps = [
        boardLine('b1', display, 'Oppgaven'),
        boardLine('b2', `${a} = ${parts.map((p) => p.value).join(' + ')}`, 'Del opp'),
        ...parts.map((p, i) => boardLine(`b${i + 3}`, `${p.value} × ${b} = ${p.value * b}`, `Gang ${p.label}`)),
        boardLine('bf', `${parts.map((p) => p.value * b).join(' + ')} = ${sum}`, 'Legg sammen'),
      ];
    } else if (answer != null) {
      finalAnswer = `${display} = ${answer}`;
      boardSteps.push(boardLine('b2', `${display} = ${answer}`, 'Fasit'));
    }
    return {
      subject: 'matematikk',
      problemSummary: display,
      difficulty: a >= 100 ? 'middels' : 'lett',
      message: young
        ? 'Her er hele utregningen, steg for steg. Les den rolig på blyanttavlen — først deler vi opp, så ganger vi, så legger vi sammen.'
        : 'Her er metoden ferdig utregnet på tavlen. Merk rekkefølgen: del opp → gang hver del → legg sammen.',
      questionToStudent: '',
      hintLevel: 3,
      steps: markSteps(3).map((s) => ({ ...s, status: 'done' })),
      currentStepIndex: 3,
      boardSteps,
      boardVisible: boardSteps.length,
      encouragement: 'Nå kan du prøve et liknende stykke selv!',
      conceptTip: 'Dette kalles ofte å bruke tier-systemet (posisjonssystemet).',
      studentLooksCorrect: true,
      missionAccomplished: true,
      canRevealAnswer: true,
      finalAnswer,
      quickReplies: ['Start på nytt', 'Prøv et liknende stykke'],
      safetyRedirect: false,
      engine: 'local-math',
    };
  }

  if (op === '×' && a >= 10) {
    const parts = splitPlaceValues(a);
    const first = parts[0];
    const partWords = parts.map((p) => String(p.value)).join(' + ');

    if (action === 'start' || action === 'reply' || lvl <= 1) {
      return {
        subject: 'matematikk',
        problemSummary: display,
        difficulty: a >= 100 ? 'middels' : 'lett',
        message: young
          ? `Vi skal regne ${display}.\n\n`
            + `Først gjør vi dette: Vi deler ${a} i ${partWords}.\n\n`
            + `Se på blyanttavlen — det er ${first.label}. Så spør jeg deg bare om første del:`
          : `Oppgaven er ${display}.\n\n`
            + `Første steg: del ${a} i posisjonssystemet → ${partWords}.\n\n`
            + 'Vi tar én del om gangen, størst først. Følg med på blyanttavlen.',
        questionToStudent: `Hva er ${first.value} × ${b}?`,
        hintLevel: Math.max(1, lvl),
        steps: markSteps(0),
        currentStepIndex: 0,
        boardSteps: [
          boardLine('b1', display, 'Skriv oppgaven'),
          boardLine('b2', `${a} = ${partWords}`, 'Del i hundre / tiere / enere'),
          boardLine('b3', `${first.value} × ${b} = ?`, 'Din tur', 'ask'),
        ],
        boardVisible: 3,
        encouragement: young ? 'Bare første del nå — du klarer det!' : 'Ett steg om gangen.',
        conceptTip: young
          ? 'Hundre, tiere og enere gjør store gangestykker lettere.'
          : 'Multiplikasjon med flersifrede tall: fordel ut fra tier-systemet.',
        studentLooksCorrect: false,
        missionAccomplished: false,
        canRevealAnswer: false,
        finalAnswer: null,
        quickReplies: [`Jeg fant ${first.value} × ${b}`, 'Gi meg et hint'],
        safetyRedirect: false,
        engine: 'local-math',
      };
    }

    if (lvl === 2) {
      return {
        subject: 'matematikk',
        problemSummary: display,
        difficulty: a >= 100 ? 'middels' : 'lett',
        message: young
          ? `Bra at du jobber med ${display}!\n\n`
            + `Metode: Gang hver del med ${b}.\n`
            + `Du har delene ${partWords}.\n\n`
            + `Neste: regn ${first.value} × ${b}. (Si bare det svaret — ikke hele stykket ennå.)`
          : `Metode for ${display}: fordel ${a} = ${partWords}, gang hver del med ${b}, legg sammen til slutt.\n\n`
            + `Nå: kun ${first.value} × ${b}.`,
        questionToStudent: `Hva blir ${first.value} × ${b}?`,
        hintLevel: 2,
        steps: markSteps(1),
        currentStepIndex: 1,
        boardSteps: [
          boardLine('b1', display, 'Oppgaven'),
          boardLine('b2', `${a} = ${partWords}`, 'Oppsplitting'),
          boardLine('b3', `${first.value} × ${b} = ?`, 'Regn denne', 'ask'),
        ],
        boardVisible: 3,
        encouragement: 'Du er i gang — fortsett med den største delen.',
        conceptTip: null,
        studentLooksCorrect: false,
        missionAccomplished: false,
        canRevealAnswer: false,
        finalAnswer: null,
        quickReplies: ['Jeg har del-svaret', 'Jeg står fast'],
        safetyRedirect: false,
        engine: 'local-math',
      };
    }

    const almost = first.value * b;
    const rest = parts.slice(1).map((p) => p.value).join(' og ') || '…';
    return {
      subject: 'matematikk',
      problemSummary: display,
      difficulty: a >= 100 ? 'middels' : 'lett',
      message: young
        ? `Nest siste hint: ${first.value} × ${b} = ${almost}.\n\n`
          + `Nå gjør du det samme med de andre delene (${rest}), `
          + 'og legger sammen til slutt. Hva blir totalsummen?'
        : `Sterkt hint: ${first.value} × ${b} = ${almost}. Fullfør de øvrige delene og summer. `
          + 'Si totalsvaret når du er klar.',
      questionToStudent: 'Hva blir hele svaret når du legger sammen delene?',
      hintLevel: 3,
      steps: markSteps(2),
      currentStepIndex: 2,
      boardSteps: [
        boardLine('b1', display, 'Oppgaven'),
        boardLine('b2', `${a} = ${partWords}`, 'Oppsplitting'),
        boardLine('b3', `${first.value} × ${b} = ${almost}`, 'Første del ferdig'),
        boardLine('b4', '… + … = ?', 'Summer delene', 'ask'),
      ],
      boardVisible: 4,
      encouragement: 'Du er nesten i mål!',
      conceptTip: null,
      studentLooksCorrect: false,
      missionAccomplished: false,
      canRevealAnswer: canRevealNow,
      finalAnswer: null,
      quickReplies: canRevealNow && allowFasit ? ['Vis fasit', 'Jeg prøver ferdig'] : ['Jeg prøver ferdig'],
      safetyRedirect: false,
      engine: 'local-math',
    };
  }

  const startMsg = young
    ? `Vi skal regne ${display}.\n\nFørst: hva slags regnestykke er dette — pluss, minus, gange eller dele?`
    : `Oppgaven er ${display}. Hva er første smarte steg?`;

  return {
    subject: 'matematikk',
    problemSummary: display,
    difficulty: 'lett',
    message: action === 'hint' || action === 'stuck'
      ? (lvl <= 1
        ? `Hint: Se på tegnet i ${display}. Hva betyr det for hvordan du regner?`
        : lvl === 2
          ? `Hint: Velg en metode (hoppe på tallinja, gangetabell, tegne). Hva passer for ${display}?`
          : `Hint: Gjør bare første lille del av ${display} — ikke hele svaret ennå.`)
      : startMsg,
    questionToStudent: young
      ? `Er ${display} pluss, minus, gange eller dele?`
      : `Hva blir ditt første steg for ${display}?`,
    hintLevel: Math.max(action === 'start' ? 1 : 0, lvl),
    steps: markSteps(action === 'start' ? 0 : Math.min(1, lvl)),
    currentStepIndex: action === 'start' ? 0 : Math.min(1, lvl),
    boardSteps: [
      boardLine('b1', display, 'Skriv stykket med «blyant»'),
      boardLine('b2', `${display} = ?`, 'Hva blir det?', 'ask'),
    ],
    boardVisible: action === 'start' ? 1 : 2,
    encouragement: 'Vi tar det rolig — ett steg om gangen.',
    conceptTip: null,
    studentLooksCorrect: false,
    missionAccomplished: false,
    canRevealAnswer: allowFasit && canRevealNow && lvl >= 3,
    finalAnswer: null,
    quickReplies: ['Gi meg et hint', 'Jeg har et svar'],
    safetyRedirect: false,
    engine: 'local-math',
  };
}

function buildPowerCoach({
  problem, action, lvl, young, answer, allowFasit, canRevealNow,
}) {
  const { a, b, display } = problem;
  const pretty = b === 2 ? `${a}^2` : b === 3 ? `${a}^3` : `${a}^${b}`;
  const steps = [
    { id: 's1', title: 'Forstå potens', coachNote: `${pretty} betyr ${a} ganget med seg selv ${b} ganger.` },
    { id: 's2', title: 'Skriv ut', coachNote: `Skriv ${Array(b).fill(String(a)).join(' × ')}.` },
    { id: 's3', title: 'Regn ut', coachNote: 'Gang to og to.' },
    { id: 's4', title: 'Sjekk', coachNote: 'Gir svaret mening?' },
  ];
  const markSteps = (currentIdx) => steps.map((s, i) => ({
    ...s,
    status: i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'locked',
  }));
  const expanded = Array(b).fill(String(a)).join(' × ');

  if (action === 'reveal') {
    if (!allowFasit || !canRevealNow) {
      return {
        subject: 'matematikk',
        problemSummary: pretty,
        difficulty: 'lett',
        message: !allowFasit
          ? 'Fasit er skrudd av. La oss skrive potensen som multiplikasjon i stedet.'
          : 'Prøv å skrive potensen som gangestykke først — så kan fasit åpnes.',
        questionToStudent: `Hvordan skriver du ${pretty} som gangestykke?`,
        hintLevel: Math.min(3, lvl + 1),
        steps: markSteps(1),
        currentStepIndex: 1,
        boardSteps: [
          boardLine('b1', pretty, 'Potens'),
          boardLine('b2', `${pretty} = ? × ?`, 'Skriv ut', 'ask'),
        ],
        boardVisible: 2,
        encouragement: 'Potens er bare gjentatt multiplikasjon!',
        conceptTip: `${a}^${b} = ${a} multiplisert ${b} ganger.`,
        studentLooksCorrect: false,
        missionAccomplished: false,
        canRevealAnswer: false,
        finalAnswer: null,
        quickReplies: ['Gi meg et hint', 'Jeg prøver'],
        safetyRedirect: false,
        engine: 'local-math',
      };
    }
    return {
      subject: 'matematikk',
      problemSummary: pretty,
      difficulty: 'lett',
      message: young
        ? `Se på blyanttavlen: ${pretty} betyr ${expanded}. Når vi regner ut, får vi ${answer}.`
        : `Metode: ${pretty} = ${expanded} = ${answer}.`,
      questionToStudent: '',
      hintLevel: 3,
      steps: markSteps(3).map((s) => ({ ...s, status: 'done' })),
      currentStepIndex: 3,
      boardSteps: [
        boardLine('b1', pretty, 'Potens'),
        boardLine('b2', `${pretty} = ${expanded}`, 'Skriv ut'),
        boardLine('b3', `${expanded} = ${answer}`, 'Regn ut'),
      ],
      boardVisible: 3,
      encouragement: 'Nå kan du prøve en annen potens!',
      conceptTip: 'Eksponent forteller hvor mange ganger basen ganges med seg selv.',
      studentLooksCorrect: true,
      missionAccomplished: true,
      canRevealAnswer: true,
      finalAnswer: `${pretty} = ${expanded} = ${answer}`,
      quickReplies: ['Prøv en ny', 'Start på nytt'],
      safetyRedirect: false,
      engine: 'local-math',
    };
  }

  if (lvl <= 1 || action === 'start') {
    return {
      subject: 'matematikk',
      problemSummary: pretty,
      difficulty: 'lett',
      message: young
        ? `Vi skal regne ${pretty}.\n\n`
          + `Potens betyr: tallet ${a} ganges med seg selv. `
          + `Opphøyd i ${b} betyr ${b} ganger.\n\n`
          + 'Se på blyanttavlen — hvordan skriver du det som gangestykke?'
        : `${pretty} er en potens. Første steg: skriv den om til multiplikasjon.`,
      questionToStudent: `Hvordan skriver du ${pretty} uten potens-tegn?`,
      hintLevel: Math.max(1, lvl),
      steps: markSteps(0),
      currentStepIndex: 0,
      boardSteps: [
        boardLine('b1', pretty, 'Skriv potensen'),
        boardLine('b2', `${a}^${b} = ?`, 'Skriv som ×', 'ask'),
      ],
      boardVisible: 2,
      encouragement: 'Du klarer dette — ett tegn om gangen.',
        conceptTip: young
          ? (b === 2
            ? `${a}^2 kalles «kvadratet av ${a}».`
            : `Eksponenten (${b}) sier hvor mange faktorer.`)
          : 'Potens = gjentatt multiplikasjon.',
      studentLooksCorrect: false,
      missionAccomplished: false,
      canRevealAnswer: false,
      finalAnswer: null,
      quickReplies: [`${expanded}?`, 'Gi meg et hint'],
      safetyRedirect: false,
      engine: 'local-math',
    };
  }

  if (lvl === 2) {
    return {
      subject: 'matematikk',
      problemSummary: pretty,
      difficulty: 'lett',
      message: `Hint: ${pretty} = ${expanded}. Nå skal du bare gange tallene. Hva blir det?`,
      questionToStudent: `Hva er ${expanded}?`,
      hintLevel: 2,
      steps: markSteps(1),
      currentStepIndex: 1,
      boardSteps: [
        boardLine('b1', pretty, 'Potens'),
        boardLine('b2', `${pretty} = ${expanded}`, 'Skrevet ut'),
        boardLine('b3', `${expanded} = ?`, 'Regn', 'ask'),
      ],
      boardVisible: 3,
      encouragement: 'Nå er det «vanlig» ganging!',
      conceptTip: null,
      studentLooksCorrect: false,
      missionAccomplished: false,
      canRevealAnswer: false,
      finalAnswer: null,
      quickReplies: ['Jeg har svaret', 'Jeg står fast'],
      safetyRedirect: false,
      engine: 'local-math',
    };
  }

  return {
    subject: 'matematikk',
    problemSummary: pretty,
    difficulty: 'lett',
    message: `Sterkt hint: gang to og to i ${expanded}. Si totalsvaret når du er klar.`,
    questionToStudent: `Hva blir ${pretty}?`,
    hintLevel: 3,
    steps: markSteps(2),
    currentStepIndex: 2,
    boardSteps: [
      boardLine('b1', pretty, 'Potens'),
      boardLine('b2', `${pretty} = ${expanded}`, 'Skrevet ut'),
      boardLine('b3', `${expanded} = ?`, 'Siste steg', 'ask'),
    ],
    boardVisible: 3,
    encouragement: 'Du er nesten i mål!',
    conceptTip: null,
    studentLooksCorrect: false,
    missionAccomplished: false,
    canRevealAnswer: allowFasit && canRevealNow,
    finalAnswer: null,
    quickReplies: allowFasit && canRevealNow ? ['Vis fasit', 'Jeg prøver ferdig'] : ['Jeg prøver ferdig'],
    safetyRedirect: false,
    engine: 'local-math',
  };
}
