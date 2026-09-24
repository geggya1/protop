/**
 * Sjakk — modusvalg: AI, ulike enheter (online), eller samme skjerm.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Pressable,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import GameInvitePanel from '../../components/GameInvitePanel';
import GameHowTo from '../../components/GameHowTo';
import GameModePicker, { GAME_PLAY_MODES } from '../../components/GameModePicker';
import GamePlayArena from '../../components/GamePlayArena';
import GameWinCelebration, { useGameCelebration, celebrationRoundKey } from '../../components/GameWinCelebration';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import ChessPieceGlyph from '../../components/ChessPieceGlyph';
import { useApp } from '../../src/context/AppContext';
import { useThemeMeta } from '../../src/context/ThemeContext';
import { colors, useLayout } from '../../src/theme';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import { inviteSummary } from '../../src/utils/familyGamesShared';
import { useGameBoardSize, ONLINE_GAME_GUIDES, LOCAL_GAME_GUIDES, gameContentMax } from '../../src/utils/gameLayout';
import {
  CHESS_STATUS,
  createChessGame,
  listenPendingChessInvites,
  listenChessGame,
  playChessMove,
  resetChessGame,
  myChessColor,
} from '../../src/utils/chessOnline';
import {
  useOnlineGameFamily,
  useMergedTypeGameInvites,
  useRespondGameInvite,
} from '../../src/hooks/useOnlineGameFamily';
import { useOnlineInviteRoute } from '../../src/hooks/useOnlineInviteRoute';
import {
  PIECE_GLYPH,
  fromFen,
  getLegalMovesFrom,
  findMove,
  isPromotionMove,
  getGameResult,
  isGameOver,
  statusText as engineStatusText,
  algebraic,
} from '../../src/utils/chessEngine';
import ChessBoard from './ChessBoard';

const PIECE_NAME = {
  k: 'konge', q: 'dronning', r: 'tårn', b: 'løper', n: 'springer', p: 'bonde',
};
const PROMO_LABEL = { q: 'Dronning', r: 'Tårn', b: 'Løper', n: 'Springer' };
const FILES = 'abcdefgh';
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function OnlineChessBoard({
  game, uid, familyId, gameId, simpleUi, onReplay, onBack, showInfo,
}) {
  const board = useGameBoardSize({
    cols: 8, rows: 8, gap: 0, maxCell: 88, minCell: 36, reserveH: 340, maxBoard: 780,
  });
  const [sel, setSel] = useState(null);
  const [pendingPromo, setPendingPromo] = useState(null);
  const [busy, setBusy] = useState(false);

  const myColor = myChessColor(game, uid);
  const state = useMemo(() => {
    try {
      const s = fromFen(game?.fen || START_FEN);
      if (Array.isArray(game?.keys) && game.keys.length) s.keys = game.keys.slice();
      return s;
    } catch {
      return fromFen(START_FEN);
    }
  }, [game?.fen, game?.keys]);

  const result = useMemo(() => getGameResult(state), [state]);
  const finished = game?.status === CHESS_STATUS.finished || isGameOver(result);
  const isDraw = finished && (game?.winner === 'draw' || !result.winner);
  const iWon = finished && !isDraw && game?.winner === myColor;
  const celeKey = finished
    ? celebrationRoundKey(['chess', gameId, game?.roundId || 1, game?.winner || result.winner])
    : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(finished, celeKey);

  const legalFromSel = useMemo(() => {
    if (!sel || !myColor || state.turn !== myColor) return [];
    return getLegalMovesFrom(state, sel.r, sel.c);
  }, [state, sel, myColor]);

  const legalSet = useMemo(() => {
    const map = new Set();
    legalFromSel.forEach((m) => map.add(`${m.tr},${m.tc}`));
    return map;
  }, [legalFromSel]);

  const cell = board.cell;
  const pieceSize = Math.round(cell * 0.72);
  const boardPixelW = cell * 8;
  const locked = busy || finished || game?.status !== CHESS_STATUS.playing
    || !myColor || state.turn !== myColor || !!pendingPromo;

  const lastMove = game?.lastMove || null;

  const applyRemote = async (move) => {
    if (!move || !familyId || !gameId) return;
    try {
      setBusy(true);
      await playChessMove(familyId, gameId, {
        uid,
        fr: move.fr,
        fc: move.fc,
        tr: move.tr,
        tc: move.tc,
        promo: move.promo,
      });
      setSel(null);
      setPendingPromo(null);
    } catch (e) {
      showInfo?.('Trekk', e?.message || 'Kunne ikke spille.');
    } finally {
      setBusy(false);
    }
  };

  const onSq = (r, c) => {
    if (locked && !pendingPromo) return;
    if (pendingPromo) return;
    const p = state.grid[r][c];
    if (sel) {
      if (sel.r === r && sel.c === c) { setSel(null); return; }
      if (p && p.c === myColor) { setSel({ r, c }); return; }
      if (!legalSet.has(`${r},${c}`)) { setSel(null); return; }
      if (isPromotionMove(state, sel.r, sel.c, r)) {
        setPendingPromo({ fr: sel.r, fc: sel.c, tr: r, tc: c });
        return;
      }
      applyRemote(findMove(state, sel.r, sel.c, r, c));
      return;
    }
    if (p && p.c === myColor && state.turn === myColor) setSel({ r, c });
  };

  const winnerName = !isDraw && finished
    ? (game?.winner === 'w' ? game.playerWhite?.name : game.playerBlack?.name)
    : null;

  const msg = game?.status === CHESS_STATUS.waiting
    ? 'Venter på at motspilleren godtar…'
    : finished
      ? (isDraw ? 'Uavgjort' : `${winnerName || 'Noen'} vant!`)
      : engineStatusText(state, { mode: 'hotseat', result });

  const inviteRows = useMemo(() => inviteSummary(game, []), [game]);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <TouchableOpacity style={styles.backRow} onPress={onBack}>
        <Ionicons name="chevron-back" size={18} color={colors.brand} />
        <Text style={styles.backTxt}>Nytt spill</Text>
      </TouchableOpacity>

      <GameHowTo
        title={ONLINE_GAME_GUIDES.chess.title}
        steps={ONLINE_GAME_GUIDES.chess.steps}
        simpleUi={simpleUi}
      />

      <View style={[styles.statusBanner, finished && !isDraw && styles.statusWin]}>
        <Text style={[styles.statusTxt, finished && !isDraw && styles.statusWinTxt]}>{msg}</Text>
      </View>

      {game?.status === CHESS_STATUS.waiting ? (
        <View style={styles.inviteBoard}>
          {(inviteRows.length ? inviteRows : [
            { uid: 'w', name: game.playerWhite?.name || 'Hvit', status: 'accepted' },
            { uid: 'b', name: 'Venter…', status: 'pending' },
          ]).map((row) => (
            <View key={row.uid} style={styles.inviteRow}>
              <Text style={styles.inviteName}>{row.name}</Text>
              <Text style={styles.inviteStatus}>
                {row.status === 'accepted' ? 'Godtatt' : row.status === 'declined' ? 'Avslått' : 'Venter…'}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.playersRow}>
        <View style={[styles.playerChip, myColor === 'w' && styles.playerChipMe]}>
          <Text style={styles.playerMark}>♔</Text>
          <Text style={styles.playerName} numberOfLines={1}>{game.playerWhite?.name || '—'}</Text>
        </View>
        <Text style={styles.vs}>vs</Text>
        <View style={[styles.playerChip, myColor === 'b' && styles.playerChipMe]}>
          <Text style={styles.playerMark}>♚</Text>
          <Text style={styles.playerName} numberOfLines={1}>{game.playerBlack?.name || 'Venter…'}</Text>
        </View>
      </View>

      <GamePlayArena theme="chess">
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
                return (
                  <Pressable
                    key={c}
                    onPress={() => onSq(r, c)}
                    accessibilityRole="button"
                    accessibilityLabel={p
                      ? `${p.c === 'w' ? 'Hvit' : 'Svart'} ${PIECE_NAME[p.t]} på ${algebraic(r, c)}`
                      : `Felt ${algebraic(r, c)}`}
                    style={[
                      styles.sq,
                      { width: cell, height: cell, backgroundColor: bg },
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
                    {legal && !p ? (
                      <View style={[styles.dot, { width: cell * 0.28, height: cell * 0.28, borderRadius: cell * 0.14 }]} />
                    ) : null}
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
      </GamePlayArena>

      {pendingPromo ? (
        <View style={styles.promoBox}>
          <Text style={styles.promoTitle}>Velg brikke å forfremme til</Text>
          <View style={styles.chipRow}>
            {['q', 'r', 'b', 'n'].map((t) => (
              <TouchableOpacity
                key={t}
                style={styles.promoBtn}
                onPress={() => applyRemote(findMove(
                  state, pendingPromo.fr, pendingPromo.fc, pendingPromo.tr, pendingPromo.tc, t,
                ))}
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

      {finished ? (
        <TouchableOpacity
          style={styles.primary}
          onPress={() => {
            resetCelebrationSeen();
            onReplay?.();
          }}
        >
          <Text style={styles.primaryTxt}>Spill igjen</Text>
        </TouchableOpacity>
      ) : null}

      <GameWinCelebration
        visible={celebrationVisible}
        triggerKey={celebrationKey}
        outcome={isDraw ? 'draw' : iWon ? 'win' : 'lose'}
        title={isDraw ? 'Uavgjort!' : iWon ? 'Du vant!' : `${winnerName || 'Motstander'} vant`}
        subtitle={isDraw ? 'Godt spilt begge to.' : iWon ? 'Sjakkmatt — bra jobbet!' : 'Bedre lykke neste gang.'}
        actionLabel="Spill igjen"
        onAction={() => { resetCelebrationSeen(); onReplay?.(); }}
        onClose={closeCelebration}
      />
    </ScrollView>
  );
}

export default function ChessScreen() {
  useChildAppGuard('games');
  const nav = useNavigation();
  const route = useRoute();
  const layout = useLayout();
  const contentMax = gameContentMax(layout);
  const { familyId, uid, members, isChild, isActingAsChild, meChild, activeChild, friendPeople } = useApp();
  const { effectiveFamilyId, setGameFamilyId } = useOnlineGameFamily(route, familyId);
  const { highChildFriendliness } = useThemeMeta();
  const simpleUi = highChildFriendliness;

  const routeGameId = route.params?.gameId || null;
  const routeMode = route.params?.mode || null;
  const inviteGameId = route.params?.inviteGameId || null;
  const [mode, setMode] = useState(
    routeGameId ? GAME_PLAY_MODES.online
      : routeMode === 'ai' || routeMode === 'hotseat' || routeMode === 'online'
        ? routeMode
        : null,
  );
  const [gameId, setGameId] = useState(routeGameId);
  const [game, setGame] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });

  useOnlineInviteRoute(route, { setMode, setGameId, uid, game });

  const myName = useMemo(() => {
    if (isChild || isActingAsChild) return (isChild ? meChild : activeChild)?.name || 'Spiller';
    return members.find((m) => m.uid === uid)?.name || 'Spiller';
  }, [members, uid, isChild, isActingAsChild, meChild, activeChild]);

  const inviteable = useMemo(
    () => members.filter((m) => (m.uid || m.id) && (m.uid || m.id) !== uid),
    [members, uid],
  );

  const pendingInvitesRaw = useMergedTypeGameInvites({
    familyId: effectiveFamilyId,
    uid,
    gameType: 'chess',
    listenFamilyPending: listenPendingChessInvites,
    enabled: (mode === GAME_PLAY_MODES.online && !gameId) || !!inviteGameId,
  });
  const pendingInvites = useMemo(() => {
    if (!inviteGameId) return pendingInvitesRaw;
    const match = pendingInvitesRaw.filter((i) => i.gameId === inviteGameId || i.id === inviteGameId);
    const rest = pendingInvitesRaw.filter((i) => i.gameId !== inviteGameId && i.id !== inviteGameId);
    return [...match, ...rest];
  }, [pendingInvitesRaw, inviteGameId]);

  useEffect(() => {
    if (!effectiveFamilyId || !gameId || mode !== GAME_PLAY_MODES.online) return undefined;
    return listenChessGame(effectiveFamilyId, gameId, setGame);
  }, [effectiveFamilyId, gameId, mode]);

  const showInfo = useCallback((title, message) => {
    setInfo({ visible: true, title, message: String(message || '') });
  }, []);

  const respondInvite = useRespondGameInvite({
    uid, name: myName, gameType: 'chess', setGameFamilyId,
  });

  const createGame = useCallback(async () => {
    if (!effectiveFamilyId || !uid) return;
    try {
      setBusy(true);
      const { id } = await createChessGame(effectiveFamilyId, {
        uid, name: myName, invitedUids: selectedIds,
      });
      setSelectedIds([]);
      setGameId(id);
    } catch (e) {
      showInfo('Sjakk', e?.message || 'Kunne ikke starte.');
    } finally {
      setBusy(false);
    }
  }, [effectiveFamilyId, uid, myName, selectedIds, showInfo]);

  const acceptInvite = useCallback(async (inv) => {
    try {
      setBusy(true);
      const res = await respondInvite(inv, 'accepted');
      setGameId(res.gameId);
    } catch (e) {
      showInfo('Invitasjon', e?.message || 'Kunne ikke godta.');
    } finally {
      setBusy(false);
    }
  }, [respondInvite, showInfo]);

  const declineInvite = useCallback(async (inv) => {
    try {
      setBusy(true);
      await respondInvite(inv, 'declined');
    } catch (e) {
      showInfo('Invitasjon', e?.message || 'Kunne ikke avslå.');
    } finally {
      setBusy(false);
    }
  }, [respondInvite, showInfo]);

  if (mode === GAME_PLAY_MODES.ai || mode === GAME_PLAY_MODES.hotseat) {
    return (
      <ChessBoard
        simpleUi={simpleUi}
        initialMode={mode}
        initialDifficulty={route.params?.difficulty || 'medium'}
        onChangeModeRequest={() => setMode(null)}
      />
    );
  }

  if (mode === GAME_PLAY_MODES.online && gameId && game) {
    return (
      <Screen>
        <View style={[styles.pad, { maxWidth: contentMax, alignSelf: 'center', width: '100%' }]}>
          <OnlineChessBoard
            game={game}
            uid={uid}
            familyId={effectiveFamilyId}
            gameId={gameId}
            simpleUi={simpleUi}
            showInfo={showInfo}
            onBack={() => { setGameId(null); setGame(null); }}
            onReplay={() => resetChessGame(effectiveFamilyId, gameId).catch((e) => showInfo('Reset', e?.message))}
          />
        </View>
        <ConfirmActionModal
          visible={info.visible}
          title={info.title}
          body={info.message}
          confirmLabel="OK"
          cancelLabel="Lukk"
          onConfirm={() => setInfo((s) => ({ ...s, visible: false }))}
          onCancel={() => setInfo((s) => ({ ...s, visible: false }))}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={[styles.pad, { maxWidth: contentMax, alignSelf: 'center', width: '100%' }]}>
        <CompactBackLink onPress={() => (mode ? setMode(null) : nav.goBack())} label={mode ? 'Velg modus' : 'Tilbake til spill'} />

        {!mode ? (
          <GameModePicker
            title="Sjakk"
            subtitle="Mot datamaskin, ulike enheter, eller samme skjerm."
            simpleUi={simpleUi}
            onSelect={setMode}
          />
        ) : (
          <>
            <Text style={styles.hubTitle}>Sjakk · ulike enheter</Text>
            <GameHowTo
              title={ONLINE_GAME_GUIDES.chess.title}
              steps={ONLINE_GAME_GUIDES.chess.steps}
              simpleUi={simpleUi}
            />
            <GameInvitePanel
              title="Inviter én motstander"
              members={inviteable}
          friends={friendPeople || []}
          hostUid={uid}
              selectedIds={selectedIds}
              onToggleMember={(id) => setSelectedIds((prev) => (prev.includes(id) ? [] : [id]))}
              onCreate={createGame}
              createLabel="Start sjakk"
              busy={busy}
              pendingInvites={pendingInvites}
              onAcceptInvite={acceptInvite}
              onDeclineInvite={declineInvite}
              simpleUi={simpleUi}
              maxInvites={1}
            />
          </>
        )}
      </ScrollView>
      <ConfirmActionModal
        visible={info.visible}
        title={info.title}
        body={info.message}
        confirmLabel="OK"
        cancelLabel="Lukk"
        onConfirm={() => setInfo((s) => ({ ...s, visible: false }))}
        onCancel={() => setInfo((s) => ({ ...s, visible: false }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 48 },
  hubTitle: { fontSize: 22, fontWeight: '800', color: colors.ink, marginBottom: 10 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  backTxt: { color: colors.brand, fontWeight: '700', fontSize: 14 },
  statusBanner: {
    backgroundColor: colors.brandSoft, borderRadius: 14, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  statusWin: { backgroundColor: colors.successSoft, borderColor: colors.success },
  statusTxt: { textAlign: 'center', fontWeight: '700', color: colors.ink, fontSize: 16 },
  statusWinTxt: { color: colors.success, fontSize: 18 },
  inviteBoard: { gap: 8, marginBottom: 12 },
  inviteRow: {
    flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card,
    borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.line,
  },
  inviteName: { fontWeight: '700', color: colors.ink },
  inviteStatus: { color: colors.muted, fontWeight: '600' },
  playersRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 12,
  },
  playerChip: {
    flex: 1, maxWidth: 160, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.card, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.line,
  },
  playerChipMe: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  playerMark: { fontSize: 18 },
  playerName: { flex: 1, fontWeight: '700', color: colors.ink, fontSize: 13 },
  vs: { fontWeight: '900', color: colors.muted },
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
  coord: { position: 'absolute', fontWeight: '700', fontSize: 10, zIndex: 2 },
  coordFile: { right: 3, bottom: 1 },
  coordRank: { left: 3, top: 1 },
  coordOnDark: { color: '#eeeed2' },
  coordOnLight: { color: '#769656' },
  promoBox: {
    marginTop: 14, backgroundColor: colors.card, borderRadius: 16, borderWidth: 1,
    borderColor: colors.line, padding: 14, alignItems: 'center', gap: 10,
  },
  promoTitle: { fontWeight: '800', color: colors.ink, fontSize: 16 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  promoBtn: {
    alignItems: 'center', backgroundColor: colors.brandSoft, borderRadius: 12,
    paddingVertical: 8, paddingHorizontal: 12, minWidth: 72,
  },
  promoGlyph: { fontSize: 28, color: colors.ink },
  promoLbl: { fontWeight: '700', color: colors.ink, fontSize: 12, marginTop: 2 },
  promoCancel: { color: colors.brand, fontWeight: '700', padding: 6 },
  primary: {
    marginTop: 16, backgroundColor: colors.brand, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  primaryTxt: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
