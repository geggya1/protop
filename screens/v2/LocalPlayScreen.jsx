import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import GamePlayShell from '../../components/GamePlayShell';
import GamePlayArena from '../../components/GamePlayArena';
import GameWinCelebration, { useGameCelebration } from '../../components/GameWinCelebration';
import { useThemeMeta } from '../../src/context/ThemeContext';
import { colors } from '../../src/theme';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import { useGameBoardSize, LOCAL_GAME_GUIDES } from '../../src/utils/gameLayout';
import {
  chooseConnect4AiMove,
  applyConnect4Drop,
  emptyConnect4Board,
  chooseTttAiMove,
} from '../../src/utils/simpleGameAi';
import { checkWinner, emptyTttBoard } from '../../src/utils/ticTacToeLogic';
import ChessBoard from './ChessBoard';

const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function shuffledDeck() {
  const d = [];
  SUITS.forEach((s) => RANKS.forEach((r) => d.push({ s, r })));
  for (let i = d.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function rankValue(r, aceHigh = true) {
  if (r === 'A') return aceHigh ? 14 : 1;
  if (r === 'K') return 13;
  if (r === 'Q') return 12;
  if (r === 'J') return 11;
  return Number(r);
}

function bjValue(hand) {
  let tot = 0;
  let aces = 0;
  hand.forEach((c) => {
    if (c.r === 'A') { aces += 1; tot += 11; }
    else if ('JQK'.includes(c.r)) tot += 10;
    else tot += Number(c.r);
  });
  while (tot > 21 && aces) { tot -= 10; aces -= 1; }
  return tot;
}

function StatusBanner({ children, win = false }) {
  return (
    <View style={[styles.statusBanner, win && styles.statusBannerWin]}>
      <Text style={[styles.statusTxt, win && styles.statusTxtWin]}>{children}</Text>
    </View>
  );
}

function DiffChips({ difficulty, setDifficulty, simpleUi, onPick }) {
  return (
    <View style={styles.chipRow}>
      {[['easy', 'Enkel'], ['medium', 'Middels'], ['hard', 'Vanskelig']].map(([id, label]) => (
        <TouchableOpacity
          key={id}
          onPress={() => { setDifficulty(id); onPick?.(id); }}
          style={[styles.chip, difficulty === id && styles.chipOn, simpleUi && styles.chipSimple]}
        >
          <Text style={[styles.chipTxt, difficulty === id && styles.chipTxtOn]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function Connect4({ simpleUi, initialMode = 'hotseat' }) {
  const board = useGameBoardSize({
    cols: 7, rows: 6, gap: 6, maxCell: 108, minCell: 44, reserveH: 280, maxBoard: 860,
  });
  const [mode, setMode] = useState(initialMode === 'ai' ? 'ai' : 'hotseat');
  const [difficulty, setDifficulty] = useState('medium');
  const [grid, setGrid] = useState(emptyConnect4Board);
  const [turn, setTurn] = useState(1);
  const [winner, setWinner] = useState(0); // 1, 2, or 'draw'
  const [thinking, setThinking] = useState(false);
  const finished = !!winner;
  const roundKey = finished ? `c4-local-${winner}-${grid.flat().join('')}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(finished, roundKey);

  const reset = useCallback(() => {
    setGrid(emptyConnect4Board());
    setTurn(1);
    setWinner(0);
    setThinking(false);
    resetCelebrationSeen();
  }, [resetCelebrationSeen]);

  const drop = useCallback((col, player) => {
    setGrid((prev) => {
      if (winner) return prev;
      const applied = applyConnect4Drop(prev, col, player);
      if (!applied) return prev;
      if (applied.won) setWinner(player);
      else if (applied.draw) setWinner('draw');
      else setTurn(player === 1 ? 2 : 1);
      return applied.grid;
    });
  }, [winner]);

  useEffect(() => {
    if (mode !== 'ai' || winner || turn !== 2) return undefined;
    setThinking(true);
    const t = setTimeout(() => {
      setGrid((prev) => {
        const col = chooseConnect4AiMove(prev, 2, difficulty);
        if (col == null) return prev;
        const applied = applyConnect4Drop(prev, col, 2);
        if (!applied) return prev;
        if (applied.won) setWinner(2);
        else if (applied.draw) setWinner('draw');
        else setTurn(1);
        return applied.grid;
      });
      setThinking(false);
    }, 280);
    return () => clearTimeout(t);
  }, [mode, turn, winner, difficulty]);

  const cell = board.cell;
  const dot = Math.round(cell * 0.72);
  const locked = finished || thinking || (mode === 'ai' && turn === 2);
  const status = winner === 'draw'
    ? 'Uavgjort — brettet er fullt'
    : winner
      ? (mode === 'ai'
        ? (winner === 1 ? 'Du vant!' : 'Datamaskinen vant')
        : `Spiller ${winner} vant!`)
      : thinking
        ? 'Datamaskinen tenker…'
        : (mode === 'ai'
          ? (turn === 1 ? 'Din tur (rød)' : 'Datamaskinens tur')
          : `Spiller ${turn} sin tur`);

  return (
    <GamePlayShell
      title="Fire på rad"
      onReset={reset}
      guide={LOCAL_GAME_GUIDES.connect4}
      simpleUi={simpleUi}
      headerExtra={(
        <View style={{ gap: 8, marginBottom: 8 }}>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.chip, mode === 'ai' && styles.chipOn]}
              onPress={() => { setMode('ai'); reset(); }}
            >
              <Text style={[styles.chipTxt, mode === 'ai' && styles.chipTxtOn]}>Mot datamaskin</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, mode === 'hotseat' && styles.chipOn]}
              onPress={() => { setMode('hotseat'); reset(); }}
            >
              <Text style={[styles.chipTxt, mode === 'hotseat' && styles.chipTxtOn]}>Samme skjerm</Text>
            </TouchableOpacity>
          </View>
          {mode === 'ai' ? (
            <DiffChips difficulty={difficulty} setDifficulty={setDifficulty} simpleUi={simpleUi} onPick={() => reset()} />
          ) : null}
        </View>
      )}
    >
      <StatusBanner win={finished && winner !== 'draw' && !(mode === 'ai' && winner === 2) && !celebrationVisible}>
        {status}
      </StatusBanner>
      <GamePlayArena theme="board">
        <View style={[styles.c4, { padding: Math.max(8, cell * 0.12) }]}>
          {grid.map((row, r) => (
            <View key={r} style={styles.c4row}>
              {row.map((cellVal, c) => (
                <Pressable
                  key={c}
                  onPress={() => { if (!locked) drop(c, turn); }}
                  style={[styles.c4cell, { width: cell, height: cell }]}
                >
                  <View style={[
                    styles.c4dot,
                    { width: dot, height: dot, borderRadius: dot / 2 },
                    cellVal === 1 && { backgroundColor: '#ef4444' },
                    cellVal === 2 && { backgroundColor: '#eab308' },
                  ]}
                  />
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      </GamePlayArena>
      <GameWinCelebration
        visible={celebrationVisible}
        triggerKey={celebrationKey}
        outcome={winner === 'draw' ? 'draw' : (mode === 'ai' && winner === 2 ? 'lose' : 'win')}
        title={winner === 'draw' ? 'Uavgjort!' : (mode === 'ai' ? (winner === 1 ? 'Du vant!' : 'Datamaskinen vant') : `Spiller ${winner} vant!`)}
        subtitle="Fire på rad"
        draw={winner === 'draw'}
        actionLabel="Ny runde"
        onAction={reset}
        onClose={closeCelebration}
      />
    </GamePlayShell>
  );
}

function TicTacToeLocal({ simpleUi, initialMode = 'hotseat' }) {
  const board = useGameBoardSize({
    cols: 3, rows: 3, gap: 10, maxCell: 140, minCell: 72, reserveH: 320, maxBoard: 480, pad: 8,
  });
  const [mode, setMode] = useState(initialMode === 'ai' ? 'ai' : 'hotseat');
  const [difficulty, setDifficulty] = useState('medium');
  const [cells, setCells] = useState(emptyTttBoard);
  const [turn, setTurn] = useState('X');
  const [thinking, setThinking] = useState(false);
  const result = checkWinner(cells);
  const finished = !!result;
  const roundKey = finished ? `ttt-local-${result}-${cells.join('')}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(finished, roundKey);

  const reset = useCallback(() => {
    setCells(emptyTttBoard());
    setTurn('X');
    setThinking(false);
    resetCelebrationSeen();
  }, [resetCelebrationSeen]);

  const play = (idx, mark) => {
    setCells((prev) => {
      if (prev[idx] || checkWinner(prev)) return prev;
      const next = prev.slice();
      next[idx] = mark;
      return next;
    });
    setTurn(mark === 'X' ? 'O' : 'X');
  };

  useEffect(() => {
    if (mode !== 'ai' || result || turn !== 'O') return undefined;
    setThinking(true);
    const t = setTimeout(() => {
      setCells((prev) => {
        if (checkWinner(prev)) return prev;
        const idx = chooseTttAiMove(prev, 'O', difficulty);
        if (idx == null) return prev;
        const next = prev.slice();
        next[idx] = 'O';
        return next;
      });
      setTurn('X');
      setThinking(false);
    }, 220);
    return () => clearTimeout(t);
  }, [mode, turn, result, difficulty]);

  const cellSize = Math.min(board.cell, 120);
  const markSize = Math.round(cellSize * 0.55);
  const locked = finished || thinking || (mode === 'ai' && turn === 'O');
  const status = result === 'draw'
    ? 'Uavgjort!'
    : result
      ? (mode === 'ai' ? (result === 'X' ? 'Du vant!' : 'Datamaskinen vant') : `${result} vant!`)
      : thinking
        ? 'Datamaskinen tenker…'
        : (mode === 'ai' ? (turn === 'X' ? 'Din tur (✕)' : 'Datamaskinens tur') : `Tur: ${turn === 'X' ? '✕' : '○'}`);

  return (
    <GamePlayShell
      title="Tre på rad"
      onReset={reset}
      guide={LOCAL_GAME_GUIDES.ttt}
      simpleUi={simpleUi}
      headerExtra={(
        <View style={{ gap: 8, marginBottom: 8 }}>
          <View style={styles.chipRow}>
            <TouchableOpacity style={[styles.chip, mode === 'ai' && styles.chipOn]} onPress={() => { setMode('ai'); reset(); }}>
              <Text style={[styles.chipTxt, mode === 'ai' && styles.chipTxtOn]}>Mot datamaskin</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.chip, mode === 'hotseat' && styles.chipOn]} onPress={() => { setMode('hotseat'); reset(); }}>
              <Text style={[styles.chipTxt, mode === 'hotseat' && styles.chipTxtOn]}>Samme skjerm</Text>
            </TouchableOpacity>
          </View>
          {mode === 'ai' ? (
            <DiffChips difficulty={difficulty} setDifficulty={setDifficulty} simpleUi={simpleUi} onPick={() => reset()} />
          ) : null}
        </View>
      )}
    >
      <StatusBanner win={finished && result !== 'draw' && !(mode === 'ai' && result === 'O') && !celebrationVisible}>
        {status}
      </StatusBanner>
      <GamePlayArena theme="board">
        <View style={styles.tttBoard}>
          {[0, 1, 2].map((row) => (
            <View key={row} style={[styles.tttRow, { gap: board.gap }]}>
              {[0, 1, 2].map((col) => {
                const idx = row * 3 + col;
                const cell = cells[idx];
                return (
                  <Pressable
                    key={idx}
                    style={[styles.tttCell, { width: cellSize, height: cellSize }]}
                    onPress={() => { if (!locked && !cell) play(idx, turn); }}
                    disabled={locked || !!cell}
                    accessibilityRole="button"
                    accessibilityLabel={cell ? `Rute ${idx + 1}, ${cell}` : `Rute ${idx + 1}, tom`}
                  >
                    <Text style={{ fontSize: markSize, fontWeight: '400', color: colors.ink }}>
                      {cell === 'X' ? '✕' : cell === 'O' ? '○' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </GamePlayArena>
      <GameWinCelebration
        visible={celebrationVisible}
        triggerKey={celebrationKey}
        outcome={result === 'draw' ? 'draw' : (mode === 'ai' && result === 'O' ? 'lose' : 'win')}
        title={result === 'draw' ? 'Uavgjort!' : (mode === 'ai' ? (result === 'X' ? 'Du vant!' : 'Datamaskinen vant') : `${result} vant!`)}
        subtitle="Tre på rad"
        draw={result === 'draw'}
        actionLabel="Ny runde"
        onAction={reset}
        onClose={closeCelebration}
      />
    </GamePlayShell>
  );
}

function MemoryGame({ solo, simpleUi, initialMode = 'hotseat' }) {
  const board = useGameBoardSize({
    cols: 4, rows: 4, gap: 10, maxCell: 120, minCell: 64, reserveH: 280, maxBoard: 640,
  });
  const faces = ['🍎', '🚗', '⭐', '🐶', '🌈', '⚽', '🎵', '📚'];
  const deal = () => {
    const cards = [...faces, ...faces].map((f, i) => ({ id: i, f, open: false, done: false }));
    for (let i = cards.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  };
  const [mode, setMode] = useState(solo ? 'solo' : (initialMode === 'ai' ? 'ai' : 'hotseat'));
  const [cards, setCards] = useState(deal);
  const [picked, setPicked] = useState([]);
  const [turn, setTurn] = useState(0);
  const [scores, setScores] = useState([0, 0]);
  const [lock, setLock] = useState(false);
  const done = cards.every((c) => c.done);
  const isAi = mode === 'ai';
  const winnerIdx = scores[0] === scores[1] ? -1 : (scores[0] > scores[1] ? 0 : 1);
  const winnerLabel = solo || mode === 'solo'
    ? `Du fant alle ${scores[0]} par!`
    : winnerIdx < 0
      ? 'Uavgjort!'
      : (isAi
        ? (winnerIdx === 0 ? 'Du vant!' : 'Datamaskinen vant')
        : `Spiller ${winnerIdx + 1} vant!`);
  const roundKey = done ? `mem-${mode}-${scores.join('-')}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(done, roundKey);

  const tap = (idx) => {
    if (lock || cards[idx].open || cards[idx].done) return;
    if (isAi && turn === 1) return;
    const next = cards.map((c, i) => (i === idx ? { ...c, open: true } : c));
    const sel = [...picked, idx];
    setCards(next);
    if (sel.length === 1) { setPicked(sel); return; }
    setPicked([]);
    if (next[sel[0]].f === next[sel[1]].f) {
      setCards(next.map((c, i) => (sel.includes(i) ? { ...c, done: true } : c)));
      setScores((s) => {
        const n = [...s];
        n[solo || mode === 'solo' ? 0 : turn] += 1;
        return n;
      });
    } else {
      setLock(true);
      setTimeout(() => {
        setCards((cur) => cur.map((c, i) => (sel.includes(i) ? { ...c, open: false } : c)));
        setLock(false);
        if (!solo && mode !== 'solo') setTurn((t) => 1 - t);
      }, 700);
    }
  };

  useEffect(() => {
    if (!isAi || turn !== 1 || done || lock || picked.length) return undefined;
    const t = setTimeout(() => {
      const closed = cards.map((c, i) => (!c.open && !c.done ? i : -1)).filter((i) => i >= 0);
      if (closed.length < 2) return;
      const a = closed[Math.floor(Math.random() * closed.length)];
      let b = closed[Math.floor(Math.random() * closed.length)];
      while (b === a) b = closed[Math.floor(Math.random() * closed.length)];
      const next = cards.map((c, i) => (i === a || i === b ? { ...c, open: true } : c));
      setCards(next);
      setLock(true);
      const match = next[a].f === next[b].f;
      setTimeout(() => {
        if (match) {
          setCards((prev) => prev.map((c, i) => (i === a || i === b ? { ...c, done: true, open: true } : c)));
          setScores((s) => [s[0], s[1] + 1]);
          setLock(false);
        } else {
          setCards((prev) => prev.map((c, i) => (i === a || i === b ? { ...c, open: false } : c)));
          setTurn(0);
          setLock(false);
        }
      }, 650);
    }, 380);
    return () => clearTimeout(t);
  }, [isAi, turn, done, lock, picked.length, cards]);

  const reset = () => {
    setCards(deal()); setPicked([]); setTurn(0); setScores([0, 0]); setLock(false); resetCelebrationSeen();
  };

  return (
    <GamePlayShell
      title="Memory"
      onReset={reset}
      guide={solo || mode === 'solo' ? LOCAL_GAME_GUIDES.memorySolo : LOCAL_GAME_GUIDES.memory}
      simpleUi={simpleUi}
      headerExtra={!solo ? (
        <View style={[styles.chipRow, { marginBottom: 8 }]}>
          <TouchableOpacity style={[styles.chip, mode === 'ai' && styles.chipOn]} onPress={() => { setMode('ai'); reset(); }}>
            <Text style={[styles.chipTxt, mode === 'ai' && styles.chipTxtOn]}>Mot datamaskin</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, mode === 'hotseat' && styles.chipOn]} onPress={() => { setMode('hotseat'); reset(); }}>
            <Text style={[styles.chipTxt, mode === 'hotseat' && styles.chipTxtOn]}>Samme skjerm</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    >
      <StatusBanner win={done && !(isAi && winnerIdx === 1) && !celebrationVisible}>
        {done
          ? winnerLabel
          : (solo || mode === 'solo'
            ? `Par funnet: ${scores[0]}`
            : (isAi
              ? (turn === 0 ? `Din tur · ${scores[0]}–${scores[1]}` : `Datamaskinen · ${scores[0]}–${scores[1]}`)
              : `Spiller ${turn + 1} · ${scores[0]}–${scores[1]}`))}
      </StatusBanner>
      <GamePlayArena theme="cards">
        <View style={[styles.memGrid, { maxWidth: board.boardW, gap: board.gap }]}>
          {cards.map((c, i) => (
            <Pressable
              key={c.id}
              onPress={() => tap(i)}
              style={[
                styles.memCard,
                {
                  width: board.cell,
                  height: board.cell,
                  borderRadius: Math.max(12, board.cell * 0.16),
                },
                c.done && { opacity: 0.4 },
                (c.open || c.done) && styles.memCardOpen,
              ]}
            >
              <Text style={{ fontSize: Math.round(board.cell * 0.42) }}>
                {c.open || c.done ? c.f : '?'}
              </Text>
            </Pressable>
          ))}
        </View>
      </GamePlayArena>
      <GameWinCelebration
        visible={celebrationVisible}
        triggerKey={celebrationKey}
        outcome={winnerIdx < 0 && !solo ? 'draw' : (isAi && winnerIdx === 1 ? 'lose' : 'win')}
        title={winnerLabel}
        subtitle={solo || mode === 'solo' ? 'Alle par funnet!' : `${scores[0]} – ${scores[1]}`}
        draw={winnerIdx < 0 && !solo}
        actionLabel="Ny runde"
        onAction={reset}
        onClose={closeCelebration}
      />
    </GamePlayShell>
  );
}


const WORDS = ['FAMILIE', 'MANDAG', 'SKOLE', 'FOTBALL', 'MIDDAG', 'HYTTE', 'SOMMER', 'VENNSKAP'];

function Hangman({ simpleUi }) {
  const layout = useGameBoardSize({ cols: 1, rows: 1, reserveH: 200 });
  const fresh = () => WORDS[Math.floor(Math.random() * WORDS.length)];
  const [word, setWord] = useState(fresh);
  const [guessed, setGuessed] = useState([]);
  const wrong = guessed.filter((l) => !word.includes(l)).length;
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZÆØÅ'.split('');
  const shown = word.split('').map((l) => (guessed.includes(l) ? l : '_')).join(' ');
  const lost = wrong >= 6;
  const won = word.split('').every((l) => guessed.includes(l));
  const roundKey = (won || lost) ? `hang-${won ? 'win' : 'lose'}-${word}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(won || lost, roundKey);
  const letterSize = layout.isPhone ? 38 : layout.isTablet ? 46 : 52;

  const reset = () => {
    setWord(fresh()); setGuessed([]); resetCelebrationSeen();
  };

  return (
    <GamePlayShell
      title="Hangman"
      onReset={reset}
      guide={LOCAL_GAME_GUIDES.hangman}
      simpleUi={simpleUi}
     
    >
      <StatusBanner win={won}>
        {lost ? `Ordet var ${word}` : won ? 'Riktig — du vant!' : `${6 - wrong} forsøk igjen`}
      </StatusBanner>
      <View style={styles.hangStage}>
        <Text style={styles.hangFigure}>
          {['😄', '🙂', '😐', '😟', '😰', '😵', '💀'][Math.min(wrong, 6)]}
        </Text>
        <Text style={[styles.hangWord, { fontSize: layout.isDesktop ? 36 : 26 }]}>
          {lost || won ? word : shown}
        </Text>
      </View>
      <View style={[styles.letters, { maxWidth: layout.contentMax }]}>
        {letters.map((l) => (
          <TouchableOpacity
            key={l}
            disabled={guessed.includes(l) || won || lost}
            onPress={() => setGuessed((g) => [...g, l])}
            style={[
              styles.letter,
              { width: letterSize, height: letterSize + 4, borderRadius: 10 },
              guessed.includes(l) && styles.letterOff,
            ]}
          >
            <Text style={[styles.letterTxt, { fontSize: simpleUi ? 18 : 15 }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <GameWinCelebration
        visible={celebrationVisible}
        triggerKey={celebrationKey}
        outcome={lost ? 'lose' : 'win'}
        title={lost ? 'Game over' : 'Riktig!'}
        subtitle={`Ordet var ${word}`}
        actionLabel="Nytt ord"
        onAction={reset}
        onClose={closeCelebration}
      />
    </GamePlayShell>
  );
}

function War({ simpleUi }) {
  const deal = () => {
    const d = shuffledDeck();
    return { a: d.slice(0, 26), b: d.slice(26), log: 'Trekk et kort', lastA: null, lastB: null };
  };
  const [state, setState] = useState(deal);
  const over = !state.a.length || !state.b.length;
  const youWon = over && state.a.length > 0;
  const roundKey = over ? `war-${state.a.length}-${state.b.length}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(youWon, roundKey);

  const play = () => {
    if (!state.a.length || !state.b.length) return;
    const a = state.a[0];
    const b = state.b[0];
    const va = rankValue(a.r);
    const vb = rankValue(b.r);
    const na = state.a.slice(1);
    const nb = state.b.slice(1);
    let log = `${a.r}${a.s} mot ${b.r}${b.s}. `;
    if (va > vb) { na.push(a, b); log += 'Du vant slaget'; }
    else if (vb > va) { nb.push(b, a); log += 'Motstander vant'; }
    else { na.push(a); nb.push(b); log += 'Uavgjort'; }
    setState({ a: na, b: nb, log, lastA: a, lastB: b });
  };

  const reset = () => { setState(deal()); resetCelebrationSeen(); };

  return (
    <GamePlayShell title="Krig" onReset={reset} guide={LOCAL_GAME_GUIDES.war} simpleUi={simpleUi}>
      <StatusBanner win={youWon}>
        {over ? (youWon ? 'Du vant bunken!' : 'Motstander vant') : state.log}
      </StatusBanner>
      <View style={styles.cardArena}>
        <View style={styles.cardPile}>
          <Text style={styles.pileLabel}>Deg</Text>
          <View style={styles.playingCard}>
            <Text style={styles.cardFace}>
              {state.lastA ? `${state.lastA.r}${state.lastA.s}` : '🂠'}
            </Text>
          </View>
          <Text style={styles.pileCount}>{state.a.length} kort</Text>
        </View>
        <Text style={styles.vs}>VS</Text>
        <View style={styles.cardPile}>
          <Text style={styles.pileLabel}>Motstander</Text>
          <View style={styles.playingCard}>
            <Text style={styles.cardFace}>
              {state.lastB ? `${state.lastB.r}${state.lastB.s}` : '🂠'}
            </Text>
          </View>
          <Text style={styles.pileCount}>{state.b.length} kort</Text>
        </View>
      </View>
      <TouchableOpacity style={styles.playBtnLg} onPress={play} disabled={over}>
        <Text style={styles.playBtnTxt}>Trekk</Text>
      </TouchableOpacity>
      <GameWinCelebration
        visible={celebrationVisible}
        triggerKey={celebrationKey}
        title="Du vant!"
        subtitle="Hele bunken er din."
        actionLabel="Ny runde"
        onAction={reset}
        onClose={closeCelebration}
      />
    </GamePlayShell>
  );
}

function Blackjack({ simpleUi }) {
  const start = () => {
    const d = shuffledDeck();
    return { d: d.slice(4), you: [d[0], d[2]], house: [d[1], d[3]], stand: false };
  };
  const [g, setG] = useState(start);
  const you = bjValue(g.you);
  const house = bjValue(g.house);
  const done = g.stand || you >= 21;
  const outcome = !done ? null
    : you > 21 ? 'bust'
      : house > 21 || you > house ? 'win'
        : you === house ? 'push' : 'lose';
  const roundKey = done ? `bj-${outcome}-${you}-${house}-${g.you.length}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(outcome === 'win', roundKey);

  const hit = () => {
    if (done) return;
    const d = [...g.d];
    const card = d.shift();
    setG({ ...g, d, you: [...g.you, card] });
  };
  const stand = () => {
    if (done) return;
    const hd = [...g.house];
    const deck = [...g.d];
    let hv = bjValue(hd);
    while (hv < 17 && deck.length) {
      hd.push(deck.shift());
      hv = bjValue(hd);
    }
    setG({ ...g, house: hd, d: deck, stand: true });
  };
  const show = (hand) => hand.map((c) => `${c.r}${c.s}`).join('  ');
  const reset = () => { setG(start()); resetCelebrationSeen(); };

  return (
    <GamePlayShell title="Blackjack" onReset={reset} guide={LOCAL_GAME_GUIDES.blackjack} simpleUi={simpleUi}>
      <StatusBanner win={outcome === 'win'}>
        {!done
          ? 'Hit eller stand?'
          : outcome === 'bust' ? 'Bust — huset vant'
            : outcome === 'win' ? 'Du vant!'
              : outcome === 'push' ? 'Push — uavgjort'
                : 'Huset vant'}
      </StatusBanner>
      <View style={styles.bjTable}>
        <Text style={styles.bjLabel}>Huset</Text>
        <View style={styles.cardRow}>
          {(g.stand || you > 21 ? g.house : [g.house[0], { r: '?', s: '' }]).map((c, i) => (
            <View key={i} style={styles.playingCardSm}>
              <Text style={styles.cardFaceSm}>{c.r === '?' ? '🂠' : `${c.r}${c.s}`}</Text>
            </View>
          ))}
        </View>
        {(g.stand || you > 21) ? <Text style={styles.pileCount}>({house})</Text> : null}
        <Text style={[styles.bjLabel, { marginTop: 20 }]}>Deg</Text>
        <View style={styles.cardRow}>
          {g.you.map((c, i) => (
            <View key={i} style={styles.playingCardSm}>
              <Text style={styles.cardFaceSm}>{`${c.r}${c.s}`}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.big}>{you}</Text>
      </View>
      {!done ? (
        <View style={styles.rowCenter}>
          <TouchableOpacity style={styles.playBtnLg} onPress={hit}>
            <Text style={styles.playBtnTxt}>Hit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.playBtnLg} onPress={stand}>
            <Text style={styles.playBtnTxt}>Stand</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <GameWinCelebration
        visible={celebrationVisible}
        triggerKey={celebrationKey}
        title="Blackjack!"
        subtitle={`Du ${you} · Huset ${house}`}
        actionLabel="Ny runde"
        onAction={reset}
        onClose={closeCelebration}
      />
    </GamePlayShell>
  );
}

function HighLow({ simpleUi }) {
  const [deck, setDeck] = useState(() => shuffledDeck());
  const [i, setI] = useState(0);
  const [score, setScore] = useState(0);
  const card = deck[i];
  const finished = i >= deck.length - 1;
  const roundKey = finished ? `hl-${score}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(finished && score > 0, roundKey);

  const guess = (up) => {
    const next = deck[i + 1];
    if (!next) return;
    const ok = up ? rankValue(next.r) >= rankValue(card.r) : rankValue(next.r) <= rankValue(card.r);
    setScore((s) => s + (ok ? 1 : 0));
    setI((n) => n + 1);
  };
  const reset = () => {
    setDeck(shuffledDeck()); setI(0); setScore(0); resetCelebrationSeen();
  };

  return (
    <GamePlayShell title="Høyere eller lavere" onReset={reset} guide={LOCAL_GAME_GUIDES.highlow} simpleUi={simpleUi}>
      <StatusBanner win={finished && score > 20}>
        Poeng {score} · kort {i + 1}/{deck.length}
      </StatusBanner>
      <View style={styles.playingCardLg}>
        <Text style={styles.cardFaceLg}>{card ? `${card.r}${card.s}` : 'Ferdig'}</Text>
      </View>
      {i < deck.length - 1 ? (
        <View style={styles.rowCenter}>
          <TouchableOpacity style={styles.playBtnLg} onPress={() => guess(true)}>
            <Ionicons name="arrow-up" size={20} color="#fff" />
            <Text style={styles.playBtnTxt}>Høyere</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.playBtnLg} onPress={() => guess(false)}>
            <Ionicons name="arrow-down" size={20} color="#fff" />
            <Text style={styles.playBtnTxt}>Lavere</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <GameWinCelebration
        visible={celebrationVisible}
        triggerKey={celebrationKey}
        title="Ferdig!"
        subtitle={`Du fikk ${score} poeng`}
        actionLabel="Ny runde"
        onAction={reset}
        onClose={closeCelebration}
      />
    </GamePlayShell>
  );
}

function Game2048({ simpleUi }) {
  const board = useGameBoardSize({
    cols: 4, rows: 4, gap: 10, maxCell: 120, minCell: 60, reserveH: 300, maxBoard: 560,
  });
  const empty = () => Array.from({ length: 4 }, () => Array(4).fill(0));
  const spawn = (g) => {
    const free = [];
    g.forEach((row, r) => row.forEach((v, c) => { if (!v) free.push([r, c]); }));
    if (!free.length) return g;
    const [r, c] = free[Math.floor(Math.random() * free.length)];
    const n = g.map((row) => row.slice());
    n[r][c] = Math.random() < 0.9 ? 2 : 4;
    return n;
  };
  const [grid, setGrid] = useState(() => spawn(spawn(empty())));
  const maxTile = Math.max(0, ...grid.flat());
  const won = maxTile >= 2048;
  const roundKey = won ? '2048-reached' : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(won, roundKey);

  const slide = (dir) => {
    const g = grid.map((row) => row.slice());
    const rot = (m, n) => {
      let x = m.map((row) => row.slice());
      for (let i = 0; i < n; i += 1) {
        x = x[0].map((_, c) => x.map((row) => row[c]).reverse());
      }
      return x;
    };
    const turns = { left: 0, down: 1, right: 2, up: 3 }[dir];
    let m = rot(g, turns);
    m = m.map((row) => {
      const nums = row.filter(Boolean);
      for (let i = 0; i < nums.length - 1; i += 1) {
        if (nums[i] === nums[i + 1]) { nums[i] *= 2; nums.splice(i + 1, 1); }
      }
      while (nums.length < 4) nums.push(0);
      return nums;
    });
    m = rot(m, (4 - turns) % 4);
    setGrid(spawn(m));
  };

  const reset = () => { setGrid(spawn(spawn(empty()))); resetCelebrationSeen(); };
  const tileColor = (v) => {
    if (!v) return '#cdc1b4';
    const map = {
      2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563',
      32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61',
      512: '#edc850', 1024: '#edc53f', 2048: '#edc22e',
    };
    return map[v] || '#3c3a32';
  };

  return (
    <GamePlayShell title="2048" onReset={reset} guide={LOCAL_GAME_GUIDES.g2048} simpleUi={simpleUi}>
      <StatusBanner win={won}>{won ? 'Du nådde 2048!' : `Høyeste: ${maxTile}`}</StatusBanner>
      <View style={[styles.g2048, { width: board.boardW, gap: board.gap }]}>
        {grid.map((row, r) => (
          <View key={r} style={[styles.row, { gap: board.gap }]}>
            {row.map((v, c) => (
              <View
                key={c}
                style={[
                  styles.t2048,
                  {
                    width: board.cell,
                    height: board.cell,
                    backgroundColor: tileColor(v),
                    borderRadius: Math.max(8, board.cell * 0.12),
                  },
                ]}
              >
                <Text style={[
                  styles.t2048n,
                  {
                    fontSize: v >= 1000 ? board.cell * 0.28 : board.cell * 0.36,
                    color: v > 4 ? '#fff' : colors.ink,
                  },
                ]}
                >
                  {v || ''}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>
      <View style={styles.rowCenter}>
        {['up', 'left', 'down', 'right'].map((d) => (
          <TouchableOpacity key={d} style={styles.dirBtn} onPress={() => slide(d)}>
            <Ionicons name={`arrow-${d}`} size={22} color="#fff" />
          </TouchableOpacity>
        ))}
      </View>
      <GameWinCelebration
        visible={celebrationVisible}
        triggerKey={celebrationKey}
        title="2048!"
        subtitle="Fantastisk — du klarte det!"
        actionLabel="Fortsett"
        onAction={closeCelebration}
        onClose={closeCelebration}
      />
    </GamePlayShell>
  );
}

function Mines({ simpleUi }) {
  const board = useGameBoardSize({
    cols: 8, rows: 8, gap: 4, maxCell: 64, minCell: 36, reserveH: 260, maxBoard: 600,
  });
  const make = () => {
    const g = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => ({ m: false, o: false, n: 0 })));
    let mines = 0;
    while (mines < 10) {
      const r = Math.floor(Math.random() * 8);
      const c = Math.floor(Math.random() * 8);
      if (!g[r][c].m) { g[r][c].m = true; mines += 1; }
    }
    g.forEach((row, r) => row.forEach((cell, c) => {
      let n = 0;
      for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) {
        const rr = r + dr; const cc = c + dc;
        if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && g[rr][cc].m) n += 1;
      }
      cell.n = n;
    }));
    return g;
  };
  const [grid, setGrid] = useState(make);
  const [dead, setDead] = useState(false);
  const safe = grid.flat().filter((c) => !c.m);
  const won = !dead && safe.every((c) => c.o);
  const roundKey = won ? `mines-win-${grid.flat().filter((c) => c.o).length}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(won, roundKey);

  const open = (r, c) => {
    if (dead || won || grid[r][c].o) return;
    const next = grid.map((row) => row.map((cell) => ({ ...cell })));
    const flood = (rr, cc) => {
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7 || next[rr][cc].o) return;
      next[rr][cc].o = true;
      if (!next[rr][cc].m && next[rr][cc].n === 0) {
        for (let dr = -1; dr <= 1; dr += 1) for (let dc = -1; dc <= 1; dc += 1) flood(rr + dr, cc + dc);
      }
    };
    if (next[r][c].m) { next[r][c].o = true; setDead(true); }
    else flood(r, c);
    setGrid(next);
  };

  const reset = () => { setGrid(make()); setDead(false); resetCelebrationSeen(); };

  return (
    <GamePlayShell title="Minesveiper" onReset={reset} guide={LOCAL_GAME_GUIDES.mines} simpleUi={simpleUi}>
      <StatusBanner win={won}>
        {dead ? 'Boom — ny runde?' : won ? 'Du klarte det — ingen miner truffet!' : 'Åpne ruter. Unngå minene.'}
      </StatusBanner>
      <View style={[styles.mineGrid, { width: board.boardW, gap: board.gap }]}>
        {grid.map((row, r) => (
          <View key={r} style={[styles.row, { gap: board.gap }]}>
            {row.map((cell, c) => (
              <Pressable
                key={c}
                onPress={() => open(r, c)}
                style={[
                  styles.mine,
                  {
                    width: board.cell,
                    height: board.cell,
                    borderRadius: 6,
                    backgroundColor: cell.o ? '#e2e8f0' : '#64748b',
                  },
                ]}
              >
                <Text style={{ fontSize: board.cell * 0.4, fontWeight: '400', color: colors.ink }}>
                  {cell.o ? (cell.m ? '💣' : (cell.n || '')) : ''}
                </Text>
              </Pressable>
            ))}
          </View>
        ))}
      </View>
      <GameWinCelebration
        visible={celebrationVisible}
        triggerKey={celebrationKey}
        title="Ryddet!"
        subtitle="Alle sikre ruter er åpne."
        actionLabel="Ny runde"
        onAction={reset}
        onClose={closeCelebration}
      />
    </GamePlayShell>
  );
}

function Slide15({ simpleUi }) {
  const board = useGameBoardSize({
    cols: 4, rows: 4, gap: 8, maxCell: 120, minCell: 60, reserveH: 260, maxBoard: 560,
  });
  const solved = () => [...Array(15).keys()].map((n) => n + 1).concat(0);
  const shuffle = () => {
    const a = solved();
    for (let i = 0; i < 80; i += 1) {
      const z = a.indexOf(0);
      const r = Math.floor(z / 4); const c = z % 4;
      const opts = [];
      if (r) opts.push(z - 4);
      if (r < 3) opts.push(z + 4);
      if (c) opts.push(z - 1);
      if (c < 3) opts.push(z + 1);
      const t = opts[Math.floor(Math.random() * opts.length)];
      [a[z], a[t]] = [a[t], a[z]];
    }
    return a;
  };
  const [tiles, setTiles] = useState(shuffle);
  const won = tiles.every((n, i) => (i === 15 ? n === 0 : n === i + 1));
  const roundKey = won ? `slide-${tiles.join('-')}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(won, roundKey);

  const move = (i) => {
    if (won) return;
    const z = tiles.indexOf(0);
    const r = Math.floor(i / 4); const c = i % 4;
    const zr = Math.floor(z / 4); const zc = z % 4;
    if (Math.abs(r - zr) + Math.abs(c - zc) !== 1) return;
    const n = tiles.slice();
    [n[i], n[z]] = [n[z], n[i]];
    setTiles(n);
  };

  const reset = () => { setTiles(shuffle()); resetCelebrationSeen(); };

  return (
    <GamePlayShell title="15-puslespill" onReset={reset} guide={LOCAL_GAME_GUIDES.slide} simpleUi={simpleUi}>
      <StatusBanner win={won}>{won ? 'Løst!' : 'Flytt brikkene i riktig rekkefølge'}</StatusBanner>
      <View style={[styles.slide, { width: board.boardW, gap: board.gap }]}>
        {tiles.map((n, i) => (
          <Pressable
            key={i}
            onPress={() => move(i)}
            style={[
              styles.slideTile,
              {
                width: board.cell,
                height: board.cell,
                borderRadius: Math.max(10, board.cell * 0.14),
              },
              !n && { backgroundColor: 'transparent' },
            ]}
          >
            <Text style={[styles.slideTxt, { fontSize: board.cell * 0.38 }]}>{n || ''}</Text>
          </Pressable>
        ))}
      </View>
      <GameWinCelebration
        visible={celebrationVisible}
        triggerKey={celebrationKey}
        title="Løst!"
        subtitle="15-puslespillet er komplett."
        actionLabel="Ny runde"
        onAction={reset}
        onClose={closeCelebration}
      />
    </GamePlayShell>
  );
}

const GAMES = {
  chess: ChessBoard,
  connect4: Connect4,
  ttt: TicTacToeLocal,
  memory: (p) => <MemoryGame solo={false} {...p} />,
  memorySolo: (p) => <MemoryGame solo {...p} />,
  hangman: Hangman,
  war: War,
  blackjack: Blackjack,
  highlow: HighLow,
  g2048: Game2048,
  mines: Mines,
  slide: Slide15,
};

export { Connect4 as LocalConnect4, TicTacToeLocal };

export default function LocalPlayScreen({ previewGameId, previewMode } = {}) {
  useChildAppGuard('games');
  const { highChildFriendliness } = useThemeMeta();
  const route = useRoute();
  const id = previewGameId || route.params?.gameId;
  const Comp = GAMES[id] || Hangman;
  return (
    <Comp
      simpleUi={highChildFriendliness}
      initialMode={previewMode || route.params?.mode}
      initialDifficulty={route.params?.difficulty}
    />
  );
}

const styles = StyleSheet.create({
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card,
  },
  chipSimple: { paddingVertical: 10, paddingHorizontal: 14 },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  chipTxt: { color: colors.muted, fontWeight: '400', fontSize: 13 },
  chipTxtOn: { color: colors.brand },
  tttBoard: {
    alignSelf: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    gap: 10,
  },
  tttRow: { flexDirection: 'row' },
  tttCell: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.brandSoft, borderRadius: 12,
  },
  statusBanner: {
    alignSelf: 'stretch',
    backgroundColor: colors.brandSoft,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  statusBannerWin: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  statusTxt: {
    textAlign: 'center',
    color: colors.ink,
    fontWeight: '400',
    fontSize: 16,
  },
  statusTxtWin: { color: colors.success, fontSize: 18 },
  c4: { alignSelf: 'center', backgroundColor: '#1d4ed8', borderRadius: 16 },
  c4row: { flexDirection: 'row' },
  c4cell: { alignItems: 'center', justifyContent: 'center' },
  c4dot: { backgroundColor: colors.card },
  memGrid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', justifyContent: 'center' },
  memCard: {
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memCardOpen: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.brandSoft },
  hangStage: { alignItems: 'center', marginBottom: 16 },
  hangFigure: { fontSize: 64, marginBottom: 8 },
  hangWord: { letterSpacing: 6, color: colors.ink, fontWeight: '400', textAlign: 'center' },
  letters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', alignSelf: 'center' },
  letter: {
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letterOff: { opacity: 0.3 },
  letterTxt: { fontWeight: '400', color: colors.ink },
  big: { fontSize: 32, fontWeight: '400', color: colors.ink, marginTop: 8, textAlign: 'center' },
  playBtnLg: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    marginTop: 8,
    minWidth: 120,
  },
  playBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
  row: { flexDirection: 'row' },
  rowCenter: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16,
    justifyContent: 'center', alignSelf: 'center',
  },
  g2048: { alignSelf: 'center' },
  t2048: { alignItems: 'center', justifyContent: 'center' },
  t2048n: { fontWeight: '400' },
  dirBtn: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  mineGrid: { alignSelf: 'center' },
  mine: { alignItems: 'center', justifyContent: 'center' },
  slide: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center' },
  slideTile: {
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  slideTxt: { fontWeight: '400', color: colors.ink },
  cardArena: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginVertical: 12,
    flexWrap: 'wrap',
  },
  cardPile: { alignItems: 'center', gap: 8 },
  pileLabel: { fontWeight: '400', color: colors.muted, fontSize: 13 },
  pileCount: { color: colors.muted, fontWeight: '400' },
  vs: { fontWeight: '400', color: colors.brand, fontSize: 18 },
  playingCard: {
    width: 110, height: 150, borderRadius: 14, backgroundColor: colors.card,
    borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#0f172a', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
  },
  playingCardSm: {
    width: 72, height: 100, borderRadius: 12, backgroundColor: colors.card,
    borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  playingCardLg: {
    alignSelf: 'center', width: 140, height: 190, borderRadius: 18, backgroundColor: colors.card,
    borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
    marginVertical: 12,
  },
  cardFace: { fontSize: 36, fontWeight: '400', color: colors.ink },
  cardFaceSm: { fontSize: 22, fontWeight: '400', color: colors.ink },
  cardFaceLg: { fontSize: 48, fontWeight: '400', color: colors.ink },
  cardRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  bjTable: {
    alignSelf: 'center', width: '100%', maxWidth: 480, backgroundColor: '#166534',
    borderRadius: 20, padding: 20, alignItems: 'center',
  },
  bjLabel: { color: '#bbf7d0', fontWeight: '400', marginBottom: 8, fontSize: 14 },
});
