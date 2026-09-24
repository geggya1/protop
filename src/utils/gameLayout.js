/**
 * Responsiv layout for familiespill — mobil, nettbrett og web.
 */
import { useMemo } from 'react';
import { useLayout } from '../theme';

/**
 * Beregn brettstørrelse som fyller tilgjengelig plass.
 * @param {{ cols?: number, rows?: number, gap?: number, maxCell?: number, minCell?: number, reserveH?: number, maxBoard?: number, pad?: number }} opts
 */
export function useGameBoardSize({
  cols = 3,
  rows = 3,
  gap = 6,
  maxCell = 140,
  minCell = 48,
  reserveH = 220,
  maxBoard = 720,
  pad = 0,
} = {}) {
  const layout = useLayout();
  const { width, height, isPhone, isTablet, isDesktop, pad: screenPad } = layout;

  return useMemo(() => {
    const sidePad = screenPad * 2;
    const contentW = Math.min(
      maxBoard,
      isDesktop ? Math.min(width - 80, 1100) : isTablet ? Math.min(width - 48, 780) : width - sidePad,
    );
    const availH = Math.max(280, height - reserveH);
    const innerPad = Math.max(0, pad) * 2;
    const cellFromW = Math.floor((contentW - innerPad - gap * (cols - 1)) / cols);
    const cellFromH = Math.floor((availH - innerPad - gap * (rows - 1)) / rows);
    let cell = Math.min(cellFromW, cellFromH, maxCell);
    if (isPhone) cell = Math.min(cell, maxCell);
    if (isTablet) cell = Math.min(Math.max(cell, minCell + 16), maxCell);
    if (isDesktop) cell = Math.min(Math.max(cell, minCell + 28), maxCell);
    cell = Math.max(minCell, cell);
    const boardW = cell * cols + gap * (cols - 1) + innerPad;
    const boardH = cell * rows + gap * (rows - 1) + innerPad;
    return {
      ...layout,
      cell,
      gap,
      pad,
      boardW,
      boardH,
      contentMax: contentW,
      fontScale: cell >= 100 ? 1.35 : cell >= 72 ? 1.15 : 1,
      playPad: isDesktop ? 20 : isTablet ? 18 : 14,
    };
  }, [width, height, isPhone, isTablet, isDesktop, screenPad, cols, rows, gap, maxCell, minCell, reserveH, maxBoard, pad, layout]);
}

/** Max bredde for spillinnhold på store skjermer. */
export function gameContentMax(layout) {
  if (layout.isDesktop) return Math.min(layout.width - 48, 1100);
  if (layout.isTablet) return Math.min(layout.width - 40, 820);
  return layout.width;
}

export const LOCAL_GAME_GUIDES = {
  chess: {
    title: 'Slik spiller du sjakk',
    steps: [
      'Velg spillmodus: mot datamaskin, ulike enheter (inviter familie), eller to spillere på samme skjerm. Hvit begynner.',
      'Trykk på en brikke for å se lovlige trekk, deretter feltet den skal flytte til.',
      'Alle vanlige sjakkregler gjelder: rokade, en passant, forfremmelse, sjakk og sjakkmatt.',
      'Du kan ikke flytte slik at kongen din står i sjakk. Sjakkmatt vinner — patt og andre uavgjort-regler gjelder.',
    ],
  },
  ttt: {
    title: 'Slik spiller du tre på rad',
    steps: [
      'Velg modus: mot datamaskin, ulike enheter, eller samme skjerm.',
      'Spillere bytter på å sette ✕ og ○. Du starter som ✕.',
      'Første med tre på rad (vannrett, loddrett eller diagonalt) vinner.',
      'Ved uavgjort — eller etter seier — trykk «Ny runde».',
    ],
  },
  connect4: {
    title: 'Slik spiller du fire på rad',
    steps: [
      'Velg modus: mot datamaskin, ulike enheter, eller samme skjerm.',
      'Rød starter. Trykk på en kolonne for å slippe en brikke.',
      'Første med fire på rad (vannrett, loddrett eller diagonalt) vinner.',
      'Ved fullt brett uten fire på rad blir det uavgjort.',
    ],
  },
  memory: {
    title: 'Slik spiller du memory',
    steps: [
      'Velg modus: mot datamaskin, ulike enheter, eller samme skjerm.',
      'Trykk på to kort for å snu dem. Finner du et par, får du poeng og fortsetter.',
      'Ellers snur kortene tilbake — turen går videre.',
      'Når alle par er funnet, vinner den med flest par.',
    ],
  },
  memorySolo: {
    title: 'Slik spiller du memory',
    steps: [
      'Trykk på to kort for å snu dem.',
      'Finn alle parene med færrest forsøk.',
      'Bruk «Ny runde» for å blande på nytt.',
    ],
  },
  hangman: {
    title: 'Slik spiller du hangman',
    steps: [
      'Gjett bokstaver i det skjulte ordet.',
      'Du har 6 feilforsøk før det er game over.',
      'På samme skjerm: én tenker på ordet, de andre gjetter — eller spill alene.',
    ],
  },
  war: {
    title: 'Slik spiller du krig',
    steps: [
      'Hver spiller har en bunke. Trykk «Trekk» for å spille et kort hver.',
      'Høyeste kort vinner begge kortene (ess er høyest).',
      'Spill til én bunke er tom — den med kort igjen vinner.',
    ],
  },
  blackjack: {
    title: 'Slik spiller du blackjack',
    steps: [
      'Målet er å komme nærmest 21 uten å gå over.',
      '«Hit» = nytt kort. «Stand» = stopp og la huset spille.',
      'Ess teller 1 eller 11. Knekt/dame/konge teller 10.',
    ],
  },
  highlow: {
    title: 'Slik spiller du høyere/lavere',
    steps: [
      'Se det åpne kortet og gjett om neste er høyere eller lavere.',
      'Riktig gjetning gir poeng. Spill gjennom stokken.',
    ],
  },
  g2048: {
    title: 'Slik spiller du 2048',
    steps: [
      'Sveip (eller bruk pilknappene) for å skyve alle fliser i én retning.',
      'Like tall smelter sammen til det dobbelte.',
      'Målet er å lage flisen 2048. Ny flis dukker opp etter hvert trekk.',
    ],
  },
  mines: {
    title: 'Slik spiller du minesveiper',
    steps: [
      'Trykk for å åpne en rute. Tall viser hvor mange miner som ligger rundt.',
      'Unngå minene. Åpne alle sikre ruter for å vinne.',
      '«Ny runde» starter et nytt brett.',
    ],
  },
  slide: {
    title: 'Slik spiller du 15-puslespill',
    steps: [
      'Trykk på en brikke ved siden av det tomme feltet for å flytte den.',
      'Sorter tallene 1–15 i rekkefølge med det tomme feltet nederst til høyre.',
    ],
  },
};

export const ONLINE_GAME_GUIDES = {
  chess: {
    title: 'Slik spiller du sjakk på ulike enheter',
    steps: [
      'Inviter én i familien eller en venn — hen må godta før partiet starter. Verten spiller hvit.',
      'Dere ser samme brett i sanntid. Trykk brikke, deretter felt.',
      'Vanlige sjakkregler gjelder. Sjakkmatt vinner; patt er uavgjort.',
      'Trykk «Spill igjen» for ny runde med samme motstander.',
    ],
  },
  ttt: {
    title: 'Slik spiller du tre på rad på ulike enheter',
    steps: [
      'Inviter én i familien eller en venn — hen må godta før spillet starter.',
      'Dere bytter på å sette ✕ og ○ på et 3×3-brett.',
      'Første med tre på rad vinner. Ved uavgjort kan dere spille igjen.',
    ],
  },
  connect4: {
    title: 'Slik spiller du fire på rad på ulike enheter',
    steps: [
      'Inviter én i familien eller en venn — hen må godta før spillet starter.',
      'Bytt på å slippe en brikke i en av de sju kolonnene.',
      'Første med fire på rad vinner. Ved uavgjort — spill igjen.',
    ],
  },
  memory: {
    title: 'Slik spiller du memory',
    steps: [
      'Velg modus, eller inviter én i familien eller en venn for spill på ulike enheter.',
      'Trykk to kort. Par gir poeng og ny tur; bom bytter tur.',
      'Flest par når alle er funnet, vinner.',
    ],
  },
  rps: {
    title: 'Slik spiller du stein-saks-papir',
    steps: [
      'Inviter familien. Når noen har godtatt, starter verten runde 1.',
      'Alle velger stein, saks eller papir samtidig.',
      'Stein slår saks, saks slår papir, papir slår stein.',
      'Best av 5 runder — den med flest poeng vinner.',
    ],
  },
  guess: {
    title: 'Slik spiller du gjette tallet',
    steps: [
      'Verten velger et hemmelig tall mellom 1 og 10 og inviterer familien.',
      'De andre gjetter tall. Dere får hint: for lavt / for høyt.',
      'Første som treffer det hemmelige tallet vinner.',
    ],
  },
  draw: {
    title: 'Slik spiller du tegn og gjett',
    steps: [
      'Verten får et hemmelig ord og tegner det på tavlen.',
      'Familien ser tegningen i sanntid og gjetter hva det er.',
      'Velg blant forslagene eller skriv selv. Første riktige gjetning vinner runden.',
    ],
  },
  quiz: {
    title: 'Slik spiller du familiequiz',
    steps: [
      'Velg en quiz-mal og inviter familien.',
      'Når spillere har godtatt, starter verten spørsmålene.',
      'Svar raskt — poeng for riktig svar (litt ekstra for fart).',
      'Den med flest poeng vinner når quizen er ferdig.',
    ],
  },
};
