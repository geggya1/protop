import assert from 'node:assert/strict';
import {
  createInitialState,
  fromFen,
  toFen,
  getLegalMoves,
  getLegalMovesFrom,
  makeMove,
  findMove,
  perft,
  getGameResult,
  isDeadPosition,
  isInCheck,
  chooseAiMove,
  evaluate,
  isPromotionMove,
  statusText,
  algebraic,
} from './chessEngine.js';

function play(fen, moves) {
  let state = fromFen(fen);
  for (const spec of moves) {
    const [from, to, promo] = spec.split(/[-/]/);
    const a = from;
    const b = to;
    const fr = 8 - Number(a[1]);
    const fc = a.charCodeAt(0) - 97;
    const tr = 8 - Number(b[1]);
    const tc = b.charCodeAt(0) - 97;
    const move = findMove(state, fr, fc, tr, tc, promo || undefined);
    assert.ok(move, `forventet lovlig trekk ${spec} i ${toFen(state)}`);
    state = makeMove(state, move);
  }
  return state;
}

function dests(state, sq) {
  const c = sq.charCodeAt(0) - 97;
  const r = 8 - Number(sq[1]);
  return getLegalMovesFrom(state, r, c).map((m) => algebraic(m.tr, m.tc) + (m.promo ? m.promo : ''));
}

// --- Startstilling og perft (kjente FIDE-trekkantall) ---
const start = createInitialState();
assert.equal(toFen(start).split(' ')[0], 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR');
assert.equal(getLegalMoves(start).length, 20);
assert.equal(perft(start, 1), 20);
assert.equal(perft(start, 2), 400);
assert.equal(perft(start, 3), 8902);

const kiwipete = fromFen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -');
assert.equal(perft(kiwipete, 1), 48);
assert.equal(perft(kiwipete, 2), 2039);

const pos3 = fromFen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -');
assert.equal(perft(pos3, 1), 14);
assert.equal(perft(pos3, 2), 191);
assert.equal(perft(pos3, 3), 2812);

const pos4 = fromFen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq -');
assert.equal(perft(pos4, 1), 6);
assert.equal(perft(pos4, 2), 264);

const pos5 = fromFen('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
assert.equal(perft(pos5, 1), 44);
assert.equal(perft(pos5, 2), 1486);

const pos6 = fromFen('r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10');
assert.equal(perft(pos6, 1), 46);
assert.equal(perft(pos6, 2), 2079);

// --- Ulovlige trekk: bonde kan ikke hoppe eller slå rett fram ---
const afterE4 = play('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', ['e2-e4']);
assert.equal(dests(afterE4, 'e7').sort().join(','), 'e5,e6');
assert.ok(dests(afterE4, 'd7').includes('d5'));
assert.equal(findMove(start, 6, 4, 4, 0), null); // e2 kan ikke gå til a4
assert.equal(findMove(start, 6, 4, 5, 3), null); // e2 kan ikke slå d3 (tomt, ikke en passant)
assert.equal(findMove(start, 7, 1, 5, 1), null); // springer b1 kan ikke gå to fram
const blockedPawn = fromFen('4k3/8/8/8/8/4n3/4P3/4K3 w - - 0 1');
assert.equal(findMove(blockedPawn, 6, 4, 5, 4), null); // e2-e3 opptatt
assert.equal(findMove(blockedPawn, 6, 4, 4, 4), null); // e2-e4 kan ikke hoppe

// Springer hopper, løper kan ikke hoppe
assert.ok(findMove(start, 7, 1, 5, 2)); // Nb1-c3
assert.equal(findMove(start, 7, 2, 5, 4), null); // løper c1 blokkert
assert.equal(findMove(start, 7, 3, 4, 3), null); // dronning d1 blokkert

// --- Narrematt ---
const fools = play(
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  ['f2-f3', 'e7-e5', 'g2-g4', 'd8-h4'],
);
const foolsRes = getGameResult(fools);
assert.equal(foolsRes.status, 'checkmate');
assert.equal(foolsRes.winner, 'b');
assert.equal(getLegalMoves(fools).length, 0);

// --- Sjakk: konge må unnslippe, kan ikke bli stående i sjakk ---
const checkPos = fromFen('4k3/8/8/8/8/8/8/4QK2 b - - 0 1');
assert.equal(isInCheck(checkPos.grid, 'b'), true);
const blackMoves = getLegalMoves(checkPos).map((m) => algebraic(m.tr, m.tc)).sort();
assert.ok(blackMoves.includes('d8') || blackMoves.includes('d7') || blackMoves.includes('e7'));
assert.ok(!getLegalMoves(checkPos).some((m) => m.fr === 0 && m.fc === 4 && m.tr === 0 && m.tc === 4));

// Pinned: tårn på e-linjen, konge bak — bonde/brikke kan ikke avdekke konge
const pin = fromFen('4k3/8/8/8/8/8/4R3/4K3 b - - 0 1');
assert.ok(isInCheck(pin.grid, 'b'));
assert.ok(getLegalMoves(pin).every((m) => m.fr === 0 && m.fc === 4)); // kun kongen kan flytte

// Kongene kan ikke stå ved siden av hverandre
const kingFace = fromFen('8/8/8/4k3/8/4K3/8/8 w - - 0 1');
assert.equal(findMove(kingFace, 5, 4, 4, 4), null); // e3-e4 inntil svart konge

// --- Rokade ---
const castle = fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
assert.ok(findMove(castle, 7, 4, 7, 6)); // O-O
assert.ok(findMove(castle, 7, 4, 7, 2)); // O-O-O
const afterOO = makeMove(castle, findMove(castle, 7, 4, 7, 6));
assert.equal(afterOO.grid[7][6].t, 'k');
assert.equal(afterOO.grid[7][5].t, 'r');
assert.equal(afterOO.grid[7][7], null);
assert.equal(afterOO.castling.wK, false);
assert.equal(afterOO.castling.wQ, false);

// Rokade ulovlig gjennom sjakk
const throughCheck2 = fromFen('5rk1/8/8/8/8/8/8/4K2R w K - 0 1');
assert.equal(findMove(throughCheck2, 7, 4, 7, 6), null);

// Rokade ulovlig når konge er i sjakk
const inCheckCastle = fromFen('4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
assert.equal(isInCheck(inCheckCastle.grid, 'w'), true);
assert.equal(findMove(inCheckCastle, 7, 4, 7, 6), null);
assert.equal(findMove(inCheckCastle, 7, 4, 7, 2), null);

// Rokade mistes når tårn flyttes
const rookMoved = play('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', ['h1-h2']);
assert.equal(rookMoved.castling.wK, false);
assert.equal(rookMoved.castling.wQ, true);

// Kan ikke rokere over brikker
const blocked = fromFen('r3k2r/8/8/8/8/8/8/RN2K2R w KQkq - 0 1');
assert.equal(findMove(blocked, 7, 4, 7, 2), null);

// --- En passant ---
const ep = fromFen('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
const epMove = findMove(ep, 3, 4, 2, 3);
assert.ok(epMove);
const afterEp = makeMove(ep, epMove);
assert.equal(afterEp.grid[2][3].t, 'p');
assert.equal(afterEp.grid[2][3].c, 'w');
assert.equal(afterEp.grid[3][3], null); // svart d5-bonde slått

// En passant kun umiddelbart etter dobbeltsteg
const missedEp = play('rnbqkbnr/ppp1pppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3', ['a2-a3']);
assert.equal(findMove(missedEp, 3, 4, 2, 3), null);

// --- Forfremmelse ---
const promo = fromFen('8/P7/8/8/8/8/8/4k1K1 w - - 0 1');
assert.equal(isPromotionMove(promo, 1, 0, 0), true);
const promoMoves = getLegalMovesFrom(promo, 1, 0);
assert.equal(promoMoves.length, 4);
assert.deepEqual(promoMoves.map((m) => m.promo).sort(), ['b', 'n', 'q', 'r']);
const asQueen = makeMove(promo, promoMoves.find((m) => m.promo === 'q'));
assert.equal(asQueen.grid[0][0].t, 'q');
assert.equal(asQueen.grid[0][0].c, 'w');

// --- Patt ---
const stale = fromFen('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
const staleRes = getGameResult(stale);
assert.equal(staleRes.status, 'stalemate');
assert.equal(staleRes.winner, null);

// --- Død stilling ---
assert.equal(isDeadPosition(fromFen('8/8/8/4k3/8/4K3/8/8 w - - 0 1').grid), true);
assert.equal(isDeadPosition(fromFen('8/8/8/4k3/8/4K3/7N/8 w - - 0 1').grid), true);
assert.equal(isDeadPosition(fromFen('8/8/8/4k3/8/4K3/7B/8 w - - 0 1').grid), true);
assert.equal(isDeadPosition(fromFen('8/8/8/4k3/8/4K3/7Q/8 w - - 0 1').grid), false);

// --- 50-trekksregelen ---
const fifty = fromFen('8/8/8/4k3/4P3/4K3/8/8 w - - 100 80');
assert.equal(getGameResult(fifty).status, 'draw');
assert.equal(getGameResult(fifty).reason, 'fifty');

// --- Trekk-gjentakelse ---
let rep = fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
rep = play(toFen(rep), ['g1-f3', 'b8-c6', 'f3-g1', 'c6-b8', 'g1-f3', 'b8-c6', 'f3-g1', 'c6-b8']);
assert.equal(getGameResult(rep).status, 'draw');
assert.equal(getGameResult(rep).reason, 'repetition');

// --- Status-tekst ---
assert.match(statusText(start, { mode: 'hotseat' }), /Hvit/);
assert.match(statusText(start, { mode: 'ai' }), /Din tur/);
assert.match(statusText(fools, { mode: 'ai' }), /datamaskinen vant/i);

// --- AI spiller kun lovlige trekk, og hard finner matt i 1 ---
const rng = () => 0.42;
for (const diff of ['easy', 'medium', 'hard']) {
  const mv = chooseAiMove(start, diff, rng);
  assert.ok(mv);
  assert.ok(getLegalMoves(start).some((m) => m.fr === mv.fr && m.fc === mv.fc && m.tr === mv.tr && m.tc === mv.tc));
}

const mateIn1 = fromFen('6k1/5ppp/8/8/8/8/5PPP/4R1K1 w - - 0 1');
const hardMate = chooseAiMove(mateIn1, 'hard', () => 0);
assert.ok(hardMate);
assert.equal(algebraic(hardMate.fr, hardMate.fc), 'e1');
assert.equal(algebraic(hardMate.tr, hardMate.tc), 'e8');
const afterMate = makeMove(mateIn1, hardMate);
assert.equal(getGameResult(afterMate).status, 'checkmate');

const hangQueen = fromFen('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
const take = chooseAiMove(hangQueen, 'hard', () => 0);
assert.equal(algebraic(take.fr, take.fc), 'd1');
assert.equal(algebraic(take.tr, take.tc), 'd5');
assert.ok(evaluate(makeMove(hangQueen, take)) > evaluate(hangQueen));

console.log('chessEngine.test.mjs ok');
