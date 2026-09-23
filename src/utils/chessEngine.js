/**
 * Sjakkmotor etter FIDE Laws of Chess (2023): lovlige trekk, sjakk/matt/patt,
 * rokade, en passant, forfremmelse og trekk-uavgjort.
 *
 * Brett: rad 0 = 8. rad (svart baklinje), rad 7 = 1. rad (hvit baklinje).
 * Kolonne 0 = a-linjen, kolonne 7 = h-linjen.
 */

export const WHITE = 'w';
export const BLACK = 'b';
export const PROMOTION_PIECES = ['q', 'r', 'b', 'n'];
export const PIECE_GLYPH = { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' };
export const PIECE_GLYPH_BLACK = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
export const DIFFICULTIES = ['easy', 'medium', 'hard'];

const VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const MATE = 100000;
const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const KING = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const BISHOP = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Piece-square tables (white, rad 8 øverst) — Simplified Evaluation Function.
const PST_P = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];
const PST_N = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];
const PST_B = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 10, 10, 5, 0, -10,
  -10, 5, 5, 10, 10, 5, 5, -10,
  -10, 0, 10, 10, 10, 10, 0, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 5, 0, 0, 0, 0, 5, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];
const PST_R = [
  0, 0, 0, 0, 0, 0, 0, 0,
  5, 10, 10, 10, 10, 10, 10, 5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 0, 5, 5, 0, 0, 0,
];
const PST_Q = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 5, 5, 5, 0, -5,
  0, 0, 5, 5, 5, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];
const PST_K_MG = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 20, 0, 0, 0, 0, 20, 20,
  20, 30, 10, 0, 0, 10, 30, 20,
];
const PST_K_EG = [
  -50, -40, -30, -20, -20, -30, -40, -50,
  -30, -20, -10, 0, 0, -10, -20, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 30, 40, 40, 30, -10, -30,
  -30, -10, 20, 30, 30, 20, -10, -30,
  -30, -30, 0, 0, 0, 0, -30, -30,
  -50, -30, -30, -30, -30, -30, -30, -50,
];

const PST = { p: PST_P, n: PST_N, b: PST_B, r: PST_R, q: PST_Q };

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function cloneGrid(grid) {
  return grid.map((row) => row.slice());
}

function emptyCastling() {
  return { wK: false, wQ: false, bK: false, bQ: false };
}

function piece(t, c) {
  return { t, c };
}

function initialGrid() {
  const g = Array.from({ length: 8 }, () => Array(8).fill(null));
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  back.forEach((t, i) => {
    g[0][i] = piece(t, BLACK);
    g[7][i] = piece(t, WHITE);
    g[1][i] = piece('p', BLACK);
    g[6][i] = piece('p', WHITE);
  });
  return g;
}

export function algebraic(r, c) {
  return `${'abcdefgh'[c]}${8 - r}`;
}

export function parseSquare(sq) {
  if (!sq || sq.length < 2) return null;
  const c = sq.charCodeAt(0) - 97;
  const rank = Number(sq[1]);
  if (c < 0 || c > 7 || rank < 1 || rank > 8) return null;
  return { r: 8 - rank, c };
}

export function positionKey(state) {
  return `${boardFen(state.grid)} ${state.turn} ${castlingFen(state.castling)} ${epFen(state.enPassant)}`;
}

function boardFen(grid) {
  const ranks = [];
  for (let r = 0; r < 8; r += 1) {
    let row = '';
    let empty = 0;
    for (let c = 0; c < 8; c += 1) {
      const p = grid[r][c];
      if (!p) {
        empty += 1;
        continue;
      }
      if (empty) {
        row += String(empty);
        empty = 0;
      }
      const ch = p.t;
      row += p.c === WHITE ? ch.toUpperCase() : ch;
    }
    if (empty) row += String(empty);
    ranks.push(row);
  }
  return ranks.join('/');
}

function castlingFen(castling) {
  let s = '';
  if (castling.wK) s += 'K';
  if (castling.wQ) s += 'Q';
  if (castling.bK) s += 'k';
  if (castling.bQ) s += 'q';
  return s || '-';
}

function epFen(ep) {
  return ep ? algebraic(ep.r, ep.c) : '-';
}

export function toFen(state) {
  return `${positionKey(state)} ${state.halfmove} ${state.fullmove}`;
}

function parseCastling(s) {
  const c = emptyCastling();
  if (!s || s === '-') return c;
  if (s.includes('K')) c.wK = true;
  if (s.includes('Q')) c.wQ = true;
  if (s.includes('k')) c.bK = true;
  if (s.includes('q')) c.bQ = true;
  return c;
}

export function fromFen(fen) {
  const parts = String(fen || '').trim().split(/\s+/);
  const board = parts[0] || '';
  const ranks = board.split('/');
  const grid = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r += 1) {
    const rank = ranks[r] || '';
    let c = 0;
    for (const ch of rank) {
      if (c > 7) break;
      if (ch >= '1' && ch <= '8') {
        c += Number(ch);
        continue;
      }
      const lower = ch.toLowerCase();
      grid[r][c] = piece(lower, ch === lower ? BLACK : WHITE);
      c += 1;
    }
  }
  const turn = parts[1] === BLACK ? BLACK : WHITE;
  const castling = parseCastling(parts[2]);
  let enPassant = null;
  if (parts[3] && parts[3] !== '-') enPassant = parseSquare(parts[3]);
  const halfmove = Number(parts[4] || 0) || 0;
  const fullmove = Number(parts[5] || 1) || 1;
  const state = {
    grid,
    turn,
    castling,
    enPassant,
    halfmove,
    fullmove,
    keys: [],
  };
  state.keys = [positionKey(state)];
  return state;
}

export function createInitialState() {
  return fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
}

export function cloneState(state) {
  return {
    grid: cloneGrid(state.grid),
    turn: state.turn,
    castling: { ...state.castling },
    enPassant: state.enPassant ? { ...state.enPassant } : null,
    halfmove: state.halfmove,
    fullmove: state.fullmove,
    keys: state.keys ? state.keys.slice() : [],
  };
}

function findKing(grid, color) {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const p = grid[r][c];
      if (p && p.t === 'k' && p.c === color) return { r, c };
    }
  }
  return null;
}

function firstPieceOnRay(grid, r, c, dr, dc) {
  let rr = r + dr;
  let cc = c + dc;
  while (inBounds(rr, cc)) {
    const p = grid[rr][cc];
    if (p) return p;
    rr += dr;
    cc += dc;
  }
  return null;
}

export function isSquareAttacked(grid, r, c, byColor) {
  const pawnDir = byColor === WHITE ? 1 : -1;
  for (const dc of [-1, 1]) {
    const pr = r + pawnDir;
    const pc = c + dc;
    if (inBounds(pr, pc)) {
      const p = grid[pr][pc];
      if (p && p.t === 'p' && p.c === byColor) return true;
    }
  }
  for (const [dr, dc] of KNIGHT) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const p = grid[nr][nc];
    if (p && p.t === 'n' && p.c === byColor) return true;
  }
  for (const [dr, dc] of KING) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inBounds(nr, nc)) continue;
    const p = grid[nr][nc];
    if (p && p.t === 'k' && p.c === byColor) return true;
  }
  for (const [dr, dc] of BISHOP) {
    const p = firstPieceOnRay(grid, r, c, dr, dc);
    if (p && p.c === byColor && (p.t === 'b' || p.t === 'q')) return true;
  }
  for (const [dr, dc] of ROOK) {
    const p = firstPieceOnRay(grid, r, c, dr, dc);
    if (p && p.c === byColor && (p.t === 'r' || p.t === 'q')) return true;
  }
  return false;
}

export function isInCheck(grid, color) {
  const king = findKing(grid, color);
  if (!king) return true;
  return isSquareAttacked(grid, king.r, king.c, color === WHITE ? BLACK : WHITE);
}

function slideMoves(grid, r, c, color, dirs, moves) {
  for (const [dr, dc] of dirs) {
    let rr = r + dr;
    let cc = c + dc;
    while (inBounds(rr, cc)) {
      const t = grid[rr][cc];
      if (!t) {
        moves.push({ fr: r, fc: c, tr: rr, tc: cc });
      } else {
        if (t.c !== color) moves.push({ fr: r, fc: c, tr: rr, tc: cc });
        break;
      }
      rr += dr;
      cc += dc;
    }
  }
}

function addPawnMoves(state, r, c, color, moves) {
  const dir = color === WHITE ? -1 : 1;
  const start = color === WHITE ? 6 : 1;
  const last = color === WHITE ? 0 : 7;
  const push1 = r + dir;
  if (inBounds(push1, c) && !state.grid[push1][c]) {
    pushPawn(moves, r, c, push1, c, last);
    const push2 = r + dir * 2;
    if (r === start && inBounds(push2, c) && !state.grid[push2][c]) {
      moves.push({ fr: r, fc: c, tr: push2, tc: c });
    }
  }
  for (const dc of [-1, 1]) {
    const cc = c + dc;
    const rr = r + dir;
    if (!inBounds(rr, cc)) continue;
    const t = state.grid[rr][cc];
    if (t && t.c !== color) pushPawn(moves, r, c, rr, cc, last);
    else if (
      state.enPassant
      && state.enPassant.r === rr
      && state.enPassant.c === cc
    ) {
      moves.push({ fr: r, fc: c, tr: rr, tc: cc, enPassant: true });
    }
  }
}

function pushPawn(moves, fr, fc, tr, tc, last) {
  if (tr === last) {
    PROMOTION_PIECES.forEach((promo) => {
      moves.push({ fr, fc, tr, tc, promo });
    });
  } else {
    moves.push({ fr, fc, tr, tc });
  }
}

function addCastling(state, r, c, color, moves) {
  const rank = color === WHITE ? 7 : 0;
  if (r !== rank || c !== 4) return;
  if (isInCheck(state.grid, color)) return;
  const enemy = color === WHITE ? BLACK : WHITE;
  const rights = state.castling;
  const kingSide = color === WHITE ? rights.wK : rights.bK;
  const queenSide = color === WHITE ? rights.wQ : rights.bQ;
  if (kingSide
    && !state.grid[rank][5]
    && !state.grid[rank][6]
    && state.grid[rank][7]?.t === 'r'
    && state.grid[rank][7]?.c === color
    && !isSquareAttacked(state.grid, rank, 5, enemy)
    && !isSquareAttacked(state.grid, rank, 6, enemy)
  ) {
    moves.push({ fr: r, fc: c, tr: rank, tc: 6, castle: 'K' });
  }
  if (queenSide
    && !state.grid[rank][1]
    && !state.grid[rank][2]
    && !state.grid[rank][3]
    && state.grid[rank][0]?.t === 'r'
    && state.grid[rank][0]?.c === color
    && !isSquareAttacked(state.grid, rank, 3, enemy)
    && !isSquareAttacked(state.grid, rank, 2, enemy)
  ) {
    moves.push({ fr: r, fc: c, tr: rank, tc: 2, castle: 'Q' });
  }
}

function generatePseudoLegal(state) {
  const color = state.turn;
  const moves = [];
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const p = state.grid[r][c];
      if (!p || p.c !== color) continue;
      if (p.t === 'p') addPawnMoves(state, r, c, color, moves);
      else if (p.t === 'n') {
        for (const [dr, dc] of KNIGHT) {
          const rr = r + dr;
          const cc = c + dc;
          if (!inBounds(rr, cc)) continue;
          const t = state.grid[rr][cc];
          if (!t || t.c !== color) moves.push({ fr: r, fc: c, tr: rr, tc: cc });
        }
      } else if (p.t === 'b') slideMoves(state.grid, r, c, color, BISHOP, moves);
      else if (p.t === 'r') slideMoves(state.grid, r, c, color, ROOK, moves);
      else if (p.t === 'q') slideMoves(state.grid, r, c, color, [...BISHOP, ...ROOK], moves);
      else if (p.t === 'k') {
        for (const [dr, dc] of KING) {
          const rr = r + dr;
          const cc = c + dc;
          if (!inBounds(rr, cc)) continue;
          const t = state.grid[rr][cc];
          if (!t || t.c !== color) moves.push({ fr: r, fc: c, tr: rr, tc: cc });
        }
        addCastling(state, r, c, color, moves);
      }
    }
  }
  return moves;
}

function applyMove(state, move, trackKeys) {
  const next = {
    grid: cloneGrid(state.grid),
    turn: state.turn === WHITE ? BLACK : WHITE,
    castling: { ...state.castling },
    enPassant: null,
    halfmove: state.halfmove + 1,
    fullmove: state.fullmove + (state.turn === BLACK ? 1 : 0),
    keys: trackKeys && state.keys ? state.keys.slice() : [],
  };
  const { fr, fc, tr, tc } = move;
  const moving = state.grid[fr][fc];
  const target = state.grid[tr][tc];
  const isPawn = moving.t === 'p';
  let captured = !!target;

  if (isPawn && !target && fc !== tc) {
    next.grid[fr][tc] = null;
    captured = true;
  }

  next.grid[fr][fc] = null;
  next.grid[tr][tc] = move.promo ? piece(move.promo, moving.c) : moving;

  if (moving.t === 'k' && Math.abs(tc - fc) === 2) {
    if (tc === 6) {
      next.grid[tr][5] = next.grid[tr][7];
      next.grid[tr][7] = null;
    } else if (tc === 2) {
      next.grid[tr][3] = next.grid[tr][0];
      next.grid[tr][0] = null;
    }
  }

  if (moving.t === 'k') {
    if (moving.c === WHITE) {
      next.castling.wK = false;
      next.castling.wQ = false;
    } else {
      next.castling.bK = false;
      next.castling.bQ = false;
    }
  }
  if (moving.t === 'r') {
    if (fr === 7 && fc === 0) next.castling.wQ = false;
    if (fr === 7 && fc === 7) next.castling.wK = false;
    if (fr === 0 && fc === 0) next.castling.bQ = false;
    if (fr === 0 && fc === 7) next.castling.bK = false;
  }
  if (target?.t === 'r') {
    if (tr === 7 && tc === 0) next.castling.wQ = false;
    if (tr === 7 && tc === 7) next.castling.wK = false;
    if (tr === 0 && tc === 0) next.castling.bQ = false;
    if (tr === 0 && tc === 7) next.castling.bK = false;
  }

  if (isPawn && Math.abs(tr - fr) === 2) {
    next.enPassant = { r: (fr + tr) / 2, c: fc };
  }

  if (isPawn || captured) next.halfmove = 0;
  if (trackKeys) next.keys.push(positionKey(next));
  return next;
}

export function makeMove(state, move) {
  return applyMove(state, move, true);
}

export function getLegalMoves(state) {
  const color = state.turn;
  const legal = [];
  for (const move of generatePseudoLegal(state)) {
    const next = applyMove(state, move, false);
    if (!isInCheck(next.grid, color)) legal.push(move);
  }
  return legal;
}

export function getLegalMovesFrom(state, r, c) {
  return getLegalMoves(state).filter((m) => m.fr === r && m.fc === c);
}

export function isPromotionMove(state, fr, fc, tr) {
  const p = state.grid[fr]?.[fc];
  return p?.t === 'p' && (tr === 0 || tr === 7);
}

export function findMove(state, fr, fc, tr, tc, promo) {
  return getLegalMoves(state).find((m) => (
    m.fr === fr && m.fc === fc && m.tr === tr && m.tc === tc
    && (promo ? m.promo === promo : !m.promo || m.promo === 'q')
  )) || null;
}

function countPieces(grid) {
  const counts = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0, bishops: [] },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0, bishops: [] },
  };
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const p = grid[r][c];
      if (!p) continue;
      counts[p.c][p.t] += 1;
      if (p.t === 'b') counts[p.c].bishops.push((r + c) % 2);
    }
  }
  return counts;
}

export function isDeadPosition(grid) {
  const { w, b } = countPieces(grid);
  if (w.p + b.p + w.r + b.r + w.q + b.q > 0) return false;
  const wMin = w.n + w.b;
  const bMin = b.n + b.b;
  if (wMin + bMin === 0) return true;
  if (wMin + bMin === 1 && w.n + b.n + w.b + b.b === 1) return true;
  if (w.n + b.n === 0 && w.b === 1 && b.b === 1 && w.bishops[0] === b.bishops[0]) return true;
  return false;
}

function isThreefold(state) {
  if (!state.keys?.length) return false;
  const cur = state.keys[state.keys.length - 1];
  let n = 0;
  for (const k of state.keys) if (k === cur) n += 1;
  return n >= 3;
}

export function getGameResult(state) {
  const moves = getLegalMoves(state);
  const inCheck = isInCheck(state.grid, state.turn);
  if (!moves.length) {
    if (inCheck) {
      return {
        status: 'checkmate',
        winner: state.turn === WHITE ? BLACK : WHITE,
        inCheck: true,
      };
    }
    return { status: 'stalemate', winner: null, inCheck: false };
  }
  if (isDeadPosition(state.grid)) {
    return { status: 'draw', reason: 'material', winner: null, inCheck };
  }
  if (state.halfmove >= 100) {
    return { status: 'draw', reason: 'fifty', winner: null, inCheck };
  }
  if (isThreefold(state)) {
    return { status: 'draw', reason: 'repetition', winner: null, inCheck };
  }
  return { status: inCheck ? 'check' : 'playing', winner: null, inCheck };
}

export function isGameOver(result) {
  return result.status === 'checkmate' || result.status === 'stalemate' || result.status === 'draw';
}

export function statusText(state, {
  mode = 'hotseat',
  thinking = false,
  result = null,
} = {}) {
  const res = result || getGameResult(state);
  if (res.status === 'checkmate') {
    const winner = res.winner === WHITE ? 'Hvit' : 'Svart';
    if (mode === 'ai') {
      return res.winner === WHITE ? 'Sjakkmatt — du vant!' : 'Sjakkmatt — datamaskinen vant';
    }
    return `Sjakkmatt — ${winner} vant!`;
  }
  if (res.status === 'stalemate') return 'Patt — uavgjort';
  if (res.status === 'draw') {
    if (res.reason === 'material') return 'Uavgjort — ikke nok brikker til matt';
    if (res.reason === 'fifty') return 'Uavgjort — 50 trekk uten slag eller bonde';
    if (res.reason === 'repetition') return 'Uavgjort — samme stilling tre ganger';
    return 'Uavgjort';
  }
  if (thinking) return 'Datamaskinen tenker…';
  const turn = state.turn === WHITE ? 'Hvit' : 'Svart';
  const check = res.inCheck ? ' — sjakk!' : '';
  if (mode === 'ai') {
    if (state.turn === WHITE) return `Din tur (hvit)${check}`;
    return `Datamaskinens tur${check}`;
  }
  return `${turn} sin tur${check}`;
}

function isEndgame(grid) {
  let queens = 0;
  let extra = 0;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const p = grid[r][c];
      if (!p || p.t === 'k' || p.t === 'p') continue;
      if (p.t === 'q') queens += 1;
      else extra += VALUE[p.t];
    }
  }
  return queens === 0 || (queens === 1 && extra <= 400);
}

export function evaluate(state) {
  const end = isEndgame(state.grid);
  let score = 0;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const p = state.grid[r][c];
      if (!p) continue;
      const idx = p.c === WHITE ? r * 8 + c : (7 - r) * 8 + c;
      const pst = p.t === 'k' ? (end ? PST_K_EG : PST_K_MG) : PST[p.t];
      const val = VALUE[p.t] + (pst ? pst[idx] : 0);
      score += p.c === WHITE ? val : -val;
    }
  }
  return score;
}

function orderMoves(state, moves) {
  return moves
    .map((m) => {
      const victim = state.grid[m.tr][m.tc];
      const attacker = state.grid[m.fr][m.fc];
      let s = 0;
      if (victim) s += 10 * VALUE[victim.t] - VALUE[attacker.t];
      if (m.promo) s += VALUE[m.promo];
      if (m.enPassant) s += 105;
      return { m, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((x) => x.m);
}

function search(state, depth, alpha, beta) {
  const moves = getLegalMoves(state);
  const inCheck = isInCheck(state.grid, state.turn);
  if (!moves.length) {
    if (inCheck) return state.turn === WHITE ? -MATE - depth : MATE + depth;
    return 0;
  }
  if (state.halfmove >= 100 || isDeadPosition(state.grid)) return 0;
  if (depth <= 0) return evaluate(state);

  const ordered = orderMoves(state, moves);
  if (state.turn === WHITE) {
    let best = -Infinity;
    for (const move of ordered) {
      const val = search(applyMove(state, move, false), depth - 1, alpha, beta);
      if (val > best) best = val;
      if (val > alpha) alpha = val;
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const move of ordered) {
    const val = search(applyMove(state, move, false), depth - 1, alpha, beta);
    if (val < best) best = val;
    if (val < beta) beta = val;
    if (beta <= alpha) break;
  }
  return best;
}

function pickRandom(arr, rng) {
  return arr[Math.floor(rng() * arr.length)];
}

function greedyBest(state, moves, rng) {
  const maximizing = state.turn === WHITE;
  let best = maximizing ? -Infinity : Infinity;
  const scored = [];
  for (const move of moves) {
    const next = applyMove(state, move, false);
    const nextMoves = getLegalMoves(next);
    const inCheck = isInCheck(next.grid, next.turn);
    let val;
    if (!nextMoves.length) val = inCheck ? (maximizing ? MATE : -MATE) : 0;
    else val = evaluate(next);
    scored.push({ move, val });
    if (maximizing ? val > best : val < best) best = val;
  }
  const near = scored.filter((s) => Math.abs(s.val - best) < 30);
  return pickRandom(near.length ? near : scored, rng).move;
}

/**
 * Velg trekk for datamaskinen.
 * easy: mest tilfeldig blant lovlige trekk (noen ganger tar den slag).
 * medium: 1-ply materiell + stilling.
 * hard: minimax med alfa-beta, dybde 2.
 */
export function chooseAiMove(state, difficulty = 'medium', rng = Math.random) {
  const moves = getLegalMoves(state);
  if (!moves.length) return null;
  const level = DIFFICULTIES.includes(difficulty) ? difficulty : 'medium';

  if (level === 'easy') {
    const captures = moves.filter((m) => state.grid[m.tr][m.tc] || m.enPassant);
    if (captures.length && rng() < 0.28) return pickRandom(captures, rng);
    if (rng() < 0.18) return greedyBest(state, moves, rng);
    return pickRandom(moves, rng);
  }

  if (level === 'medium') {
    return greedyBest(state, moves, rng);
  }

  const maximizing = state.turn === WHITE;
  let bestVal = maximizing ? -Infinity : Infinity;
  const best = [];
  const ordered = orderMoves(state, moves);
  for (const move of ordered) {
    const val = search(applyMove(state, move, false), 1, -Infinity, Infinity);
    if (val === bestVal) best.push(move);
    else if (maximizing ? val > bestVal : val < bestVal) {
      bestVal = val;
      best.length = 0;
      best.push(move);
    }
  }
  return pickRandom(best, rng);
}

export function perft(state, depth) {
  if (depth <= 0) return 1;
  const moves = getLegalMoves(state);
  if (depth === 1) return moves.length;
  let n = 0;
  for (const move of moves) n += perft(applyMove(state, move, false), depth - 1);
  return n;
}

export function capturedPieces(grid) {
  const start = {
    w: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
    b: { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 },
  };
  const now = countPieces(grid);
  const out = { w: [], b: [] };
  for (const color of [WHITE, BLACK]) {
    for (const t of ['q', 'r', 'b', 'n', 'p']) {
      const missing = start[color][t] - now[color][t];
      for (let i = 0; i < missing; i += 1) out[color].push(t);
    }
  }
  return out;
}
