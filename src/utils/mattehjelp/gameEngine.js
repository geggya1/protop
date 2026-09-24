/**
 * Genererer spillrunder lokalt (uten AI) for lekbasert mengdetrening.
 * Pedagogikk: umiddelbar feedback (Kikora), lav stress, konkrete representasjoner.
 */

const EMOJIS = ['⭐', '🍎', '🔵', '🐸', '🎈', '🧁', '🦋', '🐠', '🌸', '🧩'];
const SHAPES = [
  { id: 'circle', label: 'Sirkel', emoji: '⚪' },
  { id: 'triangle', label: 'Trekant', emoji: '🔺' },
  { id: 'square', label: 'Firkant', emoji: '🟦' },
];
const COLORS = [
  { id: 'red', no: 'rød', en: 'red', emoji: '🔴' },
  { id: 'blue', no: 'blå', en: 'blue', emoji: '🔵' },
  { id: 'green', no: 'grønn', en: 'green', emoji: '🟢' },
  { id: 'yellow', no: 'gul', en: 'yellow', emoji: '🟡' },
];
const ANIMALS = [
  { id: 'cat', no: 'katt', en: 'cat', emoji: '🐱' },
  { id: 'dog', no: 'hund', en: 'dog', emoji: '🐶' },
  { id: 'bird', no: 'fugl', en: 'bird', emoji: '🐦' },
  { id: 'fish', no: 'fisk', en: 'fish', emoji: '🐟' },
];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ'.split('');

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function optionsAround(correct, { min = 1, max = 10, count = 4 } = {}) {
  const set = new Set([correct]);
  let guard = 0;
  while (set.size < count && guard < 40) {
    guard += 1;
    const delta = randInt(-3, 3) || 1;
    const n = Math.min(max, Math.max(min, correct + delta));
    set.add(n);
  }
  while (set.size < count) set.add(randInt(min, max));
  return shuffle([...set]);
}

/** @returns {{ type: string, prompt: string, items?: any[], options: any[], correctId: string|number, explain?: string }} */
export function generateRound(gameType, topic, { difficulty = 1 } = {}) {
  const skill = topic?.skill || 'antall';
  const subject = topic?.subject || 'matematikk';

  if (gameType === 'countTap' || (gameType === 'matchQty' && subject === 'matematikk')) {
    const max = difficulty >= 2 ? 10 : 5;
    const n = randInt(1, max);
    const emoji = pick(EMOJIS);
    return {
      type: 'countTap',
      prompt: 'Hvor mange ser du?',
      items: Array.from({ length: n }, (_, i) => ({ id: i, emoji })),
      options: optionsAround(n, { min: 1, max, count: 4 }).map((v) => ({ id: v, label: String(v) })),
      correctId: n,
      explain: `Det er ${n} — du telte én og én. Bra!`,
    };
  }

  if (gameType === 'moreLess') {
    const a = randInt(2, 8);
    let b = randInt(1, 9);
    while (b === a) b = randInt(1, 9);
    const more = a > b;
    return {
      type: 'moreLess',
      prompt: 'Hvilken haug har flest?',
      piles: [
        { id: 'a', count: a, emoji: pick(EMOJIS) },
        { id: 'b', count: b, emoji: pick(EMOJIS) },
      ],
      options: [
        { id: 'a', label: `Haug A (${a})` },
        { id: 'b', label: `Haug B (${b})` },
      ],
      correctId: more ? 'a' : 'b',
      explain: more ? `A har ${a}, B har ${b}. A har flest.` : `B har ${b}, A har ${a}. B har flest.`,
    };
  }

  if (gameType === 'matchPairs' && skill === 'form') {
    const shape = pick(SHAPES);
    const opts = shuffle(SHAPES).map((s) => ({ id: s.id, label: `${s.emoji} ${s.label}` }));
    return {
      type: 'matchPairs',
      prompt: `Finn ${shape.label.toLowerCase()}en`,
      hero: shape.emoji,
      options: opts,
      correctId: shape.id,
      explain: `Ja — det er en ${shape.label.toLowerCase()}!`,
    };
  }

  if (gameType === 'matchPairs' && (skill === 'bokstav' || topic?.id === 'letters')) {
    const letter = pick(LETTERS.slice(0, 12));
    const decoys = shuffle(LETTERS.filter((l) => l !== letter)).slice(0, 3);
    return {
      type: 'matchPairs',
      prompt: `Hvilken bokstav er dette?`,
      hero: letter,
      options: shuffle([letter, ...decoys]).map((l) => ({ id: l, label: l })),
      correctId: letter,
      explain: `Riktig — bokstaven ${letter}!`,
    };
  }

  if (gameType === 'matchPairs' && (skill === 'vocab' || subject === 'engelsk')) {
    const pool = topic?.id === 'en-colors' ? COLORS : ANIMALS;
    const item = pick(pool);
    const opts = shuffle(pool).map((x) => ({
      id: x.id,
      label: topic?.id === 'en-colors' ? `${x.emoji} ${x.en}` : `${x.emoji} ${x.en}`,
    }));
    return {
      type: 'matchPairs',
      prompt: topic?.id === 'en-colors'
        ? `Hva heter ${item.no} på engelsk?`
        : `What animal is this? ${item.emoji}`,
      hero: item.emoji,
      options: opts,
      correctId: item.id,
      explain: topic?.id === 'en-colors'
        ? `${item.no} = ${item.en}`
        : `${item.emoji} is a ${item.en} (${item.no}).`,
    };
  }

  if (gameType === 'quiz' || gameType === 'speedQuiz') {
    if (subject === 'matematikk') {
      if (skill === 'multiplikasjon') {
        const a = randInt(2, 9);
        const b = randInt(2, 9);
        const ans = a * b;
        return {
          type: 'quiz',
          prompt: `${a} × ${b} = ?`,
          options: optionsAround(ans, { min: 2, max: 81, count: 4 }).map((v) => ({ id: v, label: String(v) })),
          correctId: ans,
          explain: `${a} × ${b} = ${ans}. Du kan tenke ${a} hauger med ${b}.`,
        };
      }
      if (skill === 'subtraksjon') {
        const a = randInt(4, 10);
        const b = randInt(1, a);
        const ans = a - b;
        return {
          type: 'quiz',
          prompt: `${a} − ${b} = ?`,
          options: optionsAround(ans, { min: 0, max: 10, count: 4 }).map((v) => ({ id: v, label: String(v) })),
          correctId: ans,
          explain: `${a} minus ${b} er ${ans}.`,
        };
      }
      // default addisjon
      const a = randInt(1, 8);
      const b = randInt(1, Math.max(1, 10 - a));
      const ans = a + b;
      return {
        type: 'quiz',
        prompt: `${a} + ${b} = ?`,
        options: optionsAround(ans, { min: 1, max: 12, count: 4 }).map((v) => ({ id: v, label: String(v) })),
        correctId: ans,
        explain: `${a} + ${b} = ${ans}.`,
      };
    }
    if (subject === 'norsk' && skill === 'grammatikk') {
      return {
        type: 'quiz',
        prompt: 'Hvilken setning er riktig i fortid?',
        options: [
          { id: 'a', label: 'Jeg løp til skolen.' },
          { id: 'b', label: 'Jeg løper til skolen i går.' },
          { id: 'c', label: 'Jeg løpe til skolen.' },
          { id: 'd', label: 'Jeg har løp til skolen i går.' },
        ],
        correctId: 'a',
        explain: '«Løp» er preteritum av «løpe».',
      };
    }
    if (subject === 'engelsk') {
      return {
        type: 'quiz',
        prompt: 'Past tense of “go”?',
        options: [
          { id: 'a', label: 'goed' },
          { id: 'b', label: 'went' },
          { id: 'c', label: 'gone' },
          { id: 'd', label: 'goes' },
        ],
        correctId: 'b',
        explain: '“Go” → “went” (uregelrett verb).',
      };
    }
  }

  // Fallback count
  return generateRound('countTap', topic, { difficulty });
}

/**
 * Bygg et oppdrag (flere runder) for dagens path.
 */
export function buildMission({ topic, rounds = 5, difficulty = 1 } = {}) {
  const gameType = pick(topic?.gameTypes?.filter((g) => g !== 'ai') || ['countTap']);
  const list = [];
  for (let i = 0; i < rounds; i += 1) {
    list.push(generateRound(gameType, topic, { difficulty }));
  }
  return {
    id: `mission-${topic?.id || 'play'}-${Date.now()}`,
    topicId: topic?.id,
    subject: topic?.subject,
    title: topic?.title || 'Oppdrag',
    goal: topic?.goal,
    rounds: list,
  };
}

/** AI-los prompt for et topic */
export function aiMissionPrompt(topic, age) {
  const title = topic?.title || 'oppgave';
  const goal = topic?.goal || '';
  return (
    `Lag én passe vanskelig øvingsoppgave i ${topic?.subject || 'matematikk'} `
    + `for et barn på ca. ${age || 10} år om «${title}». `
    + `Pedagogisk mål: ${goal} `
    + 'Gi meg oppgaven klart formulert. Ikke gi fasit — jeg skal løse den med hint.'
  );
}
