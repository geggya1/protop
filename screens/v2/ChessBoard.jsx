import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Pressable,
} from 'react-native';
import GamePlayShell from '../../components/GamePlayShell';
import GameWinCelebration, { useGameCelebration } from '../../components/GameWinCelebration';
import ChessPieceGlyph from '../../components/ChessPieceGlyph';
import { colors } from '../../src/theme';
import { useGameBoardSize, LOCAL_GAME_GUIDES } from '../../src/utils/gameLayout';
import {
  PIECE_GLYPH,
  createInitialState,
  getLegalMovesFrom,
  makeMove,
  findMove,
  getGameResult,
  isGameOver,
  isPromotionMove,
  statusText,
  chooseAiMove,
  capturedPieces,
  algebraic,
} from '../../src/utils/chessEngine';

const PIECE_NAME = {
  k: 'konge', q: 'dronning', r: 'tårn', b: 'løper', n: 'springer', p: 'bonde',
};
const PROMO_LABEL = { q: 'Dronning', r: 'Tårn', b: 'Løper', n: 'Springer' };
const FILES = 'abcdefgh';

function StatusBanner({ children, win = false }) {
  return (
    <View style={[styles.statusBanner, win && styles.statusBannerWin]}>
      <Text style={[styles.statusTxt, win && styles.statusTxtWin]}>{children}</Text>
    </View>
  );
}

function Chip({ label, on: active, onPress, simpleUi }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.chipOn, simpleUi && styles.chipSimple]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.chipTxt, active && styles.chipTxtOn, simpleUi && styles.chipTxtSimple]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function ChessBoard({
  simpleUi,
  initialMode = 'ai',
  initialDifficulty = 'medium',
  onChangeModeRequest,
} = {}) {
  const board = useGameBoardSize({
    cols: 8, rows: 8, gap: 0, maxCell: 88, minCell: 36, reserveH: 320, maxBoard: 780,
  });
  const [mode, setMode] = useState(initialMode === 'hotseat' ? 'hotseat' : 'ai');
  const [difficulty, setDifficulty] = useState(
    ['easy', 'medium', 'hard'].includes(initialDifficulty) ? initialDifficulty : 'medium',
  );
  const [state, setState] = useState(createInitialState);
  const [sel, setSel] = useState(null);
  const [pendingPromo, setPendingPromo] = useState(null);
  const [lastMove, setLastMove] = useState(null);
  const [thinking, setThinking] = useState(false);

  const result = useMemo(() => getGameResult(state), [state]);
  const over = isGameOver(result);
  const won = result.status === 'checkmate';
  const draw = over && !won;
  const roundKey = over
    ? `chess-${result.status}-${result.winner || 'draw'}-${state.keys[state.keys.length - 1]}`
    : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(over, roundKey);

  const legalFromSel = useMemo(() => {
    if (!sel) return [];
    return getLegalMovesFrom(state, sel.r, sel.c);
  }, [state, sel]);

  const legalSet = useMemo(() => {
    const map = new Set();
    legalFromSel.forEach((m) => map.add(`${m.tr},${m.tc}`));
    return map;
  }, [legalFromSel]);

  const captured = useMemo(() => capturedPieces(state.grid), [state.grid]);
  const cell = board.cell;
  const pieceSize = Math.round(cell * 0.72);
  const boardPixelW = cell * 8;
  const playerLocked = mode === 'ai' && (state.turn !== 'w' || thinking);

  const reset = useCallback(() => {
    setState(createInitialState());
    setSel(null);
    setPendingPromo(null);
    setLastMove(null);
    setThinking(false);
    resetCelebrationSeen();
  }, [resetCelebrationSeen]);

  const changeMode = (next) => {
    setMode(next);
    setState(createInitialState());
    setSel(null);
    setPendingPromo(null);
    setLastMove(null);
    setThinking(false);
    resetCelebrationSeen();
  };

  const changeDifficulty = (next) => {
    setDifficulty(next);
    setState(createInitialState());
    setSel(null);
    setPendingPromo(null);
    setLastMove(null);
    setThinking(false);
    resetCelebrationSeen();
  };

  const apply = useCallback((move) => {
    if (!move) return;
    setState((prev) => makeMove(prev, move));
    setLastMove(move);
    setSel(null);
    setPendingPromo(null);
  }, []);

  useEffect(() => {
    if (mode !== 'ai' || over || pendingPromo) return undefined;
    if (state.turn !== 'b') return undefined;
    setThinking(true);
    const t = setTimeout(() => {
      const move = chooseAiMove(state, difficulty);
      if (move) {
        setState((prev) => makeMove(prev, move));
        setLastMove(move);
      }
      setSel(null);
      setThinking(false);
    }, difficulty === 'hard' ? 280 : 180);
    return () => clearTimeout(t);
  }, [state, mode, difficulty, over, pendingPromo]);

  const onSq = (r, c) => {
    if (over || playerLocked || pendingPromo) return;
    const p = state.grid[r][c];
    if (sel) {
      if (sel.r === r && sel.c === c) {
        setSel(null);
        return;
      }
      if (p && p.c === state.turn) {
        setSel({ r, c });
        return;
      }
      if (!legalSet.has(`${r},${c}`)) {
        setSel(null);
        return;
      }
      if (isPromotionMove(state, sel.r, sel.c, r)) {
        setPendingPromo({ fr: sel.r, fc: sel.c, tr: r, tc: c });
        return;
      }
      apply(findMove(state, sel.r, sel.c, r, c));
      return;
    }
    if (p && p.c === state.turn) setSel({ r, c });
  };

  const confirmPromo = (promo) => {
    if (!pendingPromo) return;
    apply(findMove(state, pendingPromo.fr, pendingPromo.fc, pendingPromo.tr, pendingPromo.tc, promo));
  };

  const msg = statusText(state, { mode, thinking, result });
  const winTitle = draw
    ? 'Uavgjort!'
    : result.winner === 'w'
      ? (mode === 'ai' ? 'Du vant!' : 'Hvit vant!')
      : (mode === 'ai' ? 'Datamaskinen vant' : 'Svart vant!');
  const winOutcome = draw ? 'draw' : (mode === 'ai' && result.winner === 'b' ? 'lose' : 'win');
  const winSubtitle = draw
    ? (result.status === 'stalemate' ? 'Patt — ingen lovlige trekk.' : 'Partiet endte uavgjort.')
    : 'Sjakkmatt — godt spilt!';

  return (
    <GamePlayShell
      title="Sjakk"
      onReset={reset}
      guide={LOCAL_GAME_GUIDES.chess}
      simpleUi={simpleUi}
      headerExtra={(
        <View style={styles.controls}>
          <View style={styles.chipRow}>
            <Chip simpleUi={simpleUi} label="Mot datamaskin" on={mode === 'ai'} onPress={() => changeMode('ai')} />
            <Chip simpleUi={simpleUi} label="Samme skjerm" on={mode === 'hotseat'} onPress={() => changeMode('hotseat')} />
            {onChangeModeRequest ? (
              <Chip simpleUi={simpleUi} label="Ulike enheter" on={false} onPress={onChangeModeRequest} />
            ) : null}
          </View>
          {mode === 'ai' ? (
            <View style={styles.chipRow}>
              <Chip simpleUi={simpleUi} label="Enkel" on={difficulty === 'easy'} onPress={() => changeDifficulty('easy')} />
              <Chip simpleUi={simpleUi} label="Middels" on={difficulty === 'medium'} onPress={() => changeDifficulty('medium')} />
              <Chip simpleUi={simpleUi} label="Vanskelig" on={difficulty === 'hard'} onPress={() => changeDifficulty('hard')} />
            </View>
          ) : null}
        </View>
      )}
    >
      <StatusBanner win={won && !celebrationVisible}>
        {mode === 'hotseat' && !over ? `${msg} · to spillere på samme skjerm` : msg}
      </StatusBanner>

      <CapturedRow color="b" pieces={captured.b} cell={cell} />
      <View style={[styles.chess, { width: boardPixelW }]}>
        {state.grid.map((row, r) => (
          <View key={r} style={styles.chessRow}>
            {row.map((p, c) => {
              const dark = (r + c) % 2 === 1;
              const on = sel && sel.r === r && sel.c === c;
              const last = lastMove && (
                (lastMove.fr === r && lastMove.fc === c)
                || (lastMove.tr === r && lastMove.tc === c)
              );
              const legal = legalSet.has(`${r},${c}`);
              const kingCheck = result.inCheck && p?.t === 'k' && p.c === state.turn;
              let bg = dark ? '#769656' : '#eeeed2';
              if (last) bg = dark ? '#baca44' : '#f6f669';
              if (kingCheck) bg = dark ? '#c84646' : '#e07070';
              const label = p
                ? `${p.c === 'w' ? 'Hvit' : 'Svart'} ${PIECE_NAME[p.t]} på ${algebraic(r, c)}`
                : `Felt ${algebraic(r, c)}${legal ? ', lovlig trekk' : ''}`;
              return (
                <Pressable
                  key={c}
                  onPress={() => onSq(r, c)}
                  accessibilityRole="button"
                  accessibilityLabel={label}
                  style={[
                    styles.sq,
                    {
                      width: cell,
                      height: cell,
                      backgroundColor: bg,
                    },
                    on && styles.sqOn,
                  ]}
                >
                  {r === 7 ? (
                    <Text style={[styles.coord, styles.coordFile, dark ? styles.coordOnDark : styles.coordOnLight]}>
                      {FILES[c]}
                    </Text>
                  ) : null}
                  {c === 0 ? (
                    <Text style={[styles.coord, styles.coordRank, dark ? styles.coordOnDark : styles.coordOnLight]}>
                      {8 - r}
                    </Text>
                  ) : null}
                  {legal && !p ? <View style={[styles.dot, { width: cell * 0.28, height: cell * 0.28, borderRadius: cell * 0.14 }]} /> : null}
                  {legal && p ? (
                    <View style={[styles.capture, { borderRadius: cell / 2, borderWidth: Math.max(3, cell * 0.08) }]} />
                  ) : null}
                  {p ? <ChessPieceGlyph type={p.t} color={p.c} size={pieceSize} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      <CapturedRow color="w" pieces={captured.w} cell={cell} />

      {pendingPromo ? (
        <View style={styles.promoBox}>
          <Text style={styles.promoTitle}>Velg brikke å forfremme til</Text>
          <View style={styles.chipRow}>
            {['q', 'r', 'b', 'n'].map((t) => (
              <TouchableOpacity
                key={t}
                style={styles.promoBtn}
                onPress={() => confirmPromo(t)}
                accessibilityRole="button"
                accessibilityLabel={PROMO_LABEL[t]}
              >
                <Text style={styles.promoGlyph}>{PIECE_GLYPH[t]}</Text>
                <Text style={styles.promoLbl}>{PROMO_LABEL[t]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity onPress={() => setPendingPromo(null)}>
            <Text style={styles.promoCancel}>Avbryt</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <GameWinCelebration
        visible={celebrationVisible}
        triggerKey={celebrationKey}
        outcome={winOutcome}
        title={winTitle}
        subtitle={winSubtitle}
        draw={draw}
        actionLabel="Ny runde"
        onAction={reset}
        onClose={closeCelebration}
      />
    </GamePlayShell>
  );
}

function CapturedRow({ color, pieces, cell }) {
  if (!pieces.length) return <View style={styles.capturedSlot} />;
  const size = Math.max(14, cell * 0.28);
  return (
    <View style={styles.capturedRow}>
      {pieces.map((t, i) => (
        <ChessPieceGlyph key={`${t}-${i}`} type={t} color={color} size={size} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { marginBottom: 10, gap: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: '#fff',
  },
  chipSimple: { paddingVertical: 10, paddingHorizontal: 14 },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  chipTxt: { color: colors.muted, fontWeight: '400', fontSize: 13 },
  chipTxtSimple: { fontSize: 15 },
  chipTxtOn: { color: colors.brand },
  statusBanner: {
    alignSelf: 'stretch',
    backgroundColor: colors.brandSoft,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 12,
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
  chess: { alignSelf: 'center', borderWidth: 2, borderColor: '#334155', borderRadius: 4, overflow: 'hidden' },
  chessRow: { flexDirection: 'row' },
  sq: { alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  sqOn: { borderWidth: 3, borderColor: '#1e3a8a' },
  dot: { position: 'absolute', backgroundColor: 'rgba(15,23,42,0.28)', zIndex: 2 },
  capture: {
    ...StyleSheet.absoluteFillObject,
    borderColor: 'rgba(15,23,42,0.42)',
    backgroundColor: 'transparent',
    zIndex: 2,
  },
  coord: { position: 'absolute', fontWeight: '400', fontSize: 10, zIndex: 2 },
  coordFile: { right: 3, bottom: 1 },
  coordRank: { left: 3, top: 1 },
  coordOnDark: { color: '#eeeed2' },
  coordOnLight: { color: '#769656' },
  capturedSlot: { height: 22, marginVertical: 4 },
  capturedRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 22,
    marginVertical: 4,
    gap: 2,
  },
  promoBox: {
    marginTop: 14,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    alignItems: 'center',
    gap: 10,
  },
  promoTitle: { fontWeight: '400', color: colors.ink, fontSize: 16 },
  promoBtn: {
    alignSelf: 'flex-start',
    alignItems: 'center',
    backgroundColor: colors.brandSoft,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 72,
  },
  promoGlyph: { fontSize: 28, color: colors.ink },
  promoLbl: { fontWeight: '400', color: colors.ink, fontSize: 12, marginTop: 2 },
  promoCancel: { color: colors.brand, fontWeight: '400', padding: 6 },
});
