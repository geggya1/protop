/**
 * Memory — modusvalg: AI, ulike enheter, samme skjerm.
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
import { useApp } from '../../src/context/AppContext';
import { useThemeMeta } from '../../src/context/ThemeContext';
import { colors, useLayout } from '../../src/theme';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import { inviteSummary } from '../../src/utils/familyGamesShared';
import { useGameBoardSize, ONLINE_GAME_GUIDES, gameContentMax } from '../../src/utils/gameLayout';
import {
  MEMORY_STATUS,
  createMemoryGame,
  listenPendingMemoryInvites,
  listenMemoryGame,
  flipMemoryCard,
  resolveMemoryFlip,
  resetMemoryGame,
  myMemorySeat,
} from '../../src/utils/memoryOnline';
import {
  useOnlineGameFamily,
  useMergedTypeGameInvites,
  useRespondGameInvite,
} from '../../src/hooks/useOnlineGameFamily';
import { useOnlineInviteRoute } from '../../src/hooks/useOnlineInviteRoute';

function LocalMemory({ simpleUi, initialMode = 'hotseat', onBack }) {
  const nav = useNavigation();
  const board = useGameBoardSize({
    cols: 4, rows: 4, gap: 10, maxCell: 130, minCell: 68, reserveH: 280, maxBoard: 640,
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
  const [mode, setMode] = useState(initialMode === 'ai' ? 'ai' : 'hotseat');
  const [cards, setCards] = useState(deal);
  const [pick, setPick] = useState([]);
  const [scores, setScores] = useState([0, 0]);
  const [turn, setTurn] = useState(0);
  const [lock, setLock] = useState(false);
  const done = cards.every((c) => c.done);
  const roundKey = done ? celebrationRoundKey(['mem-local', scores.join('-'), cards.map((c) => c.id).join('')]) : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(done, roundKey);

  const reset = () => {
    setCards(deal());
    setPick([]);
    setScores([0, 0]);
    setTurn(0);
    setLock(false);
    resetCelebrationSeen();
  };

  const onCard = (idx) => {
    if (lock || done || cards[idx].open || cards[idx].done) return;
    if (mode === 'ai' && turn === 1) return;
    const nextPick = [...pick, idx];
    const nextCards = cards.map((c, i) => (i === idx ? { ...c, open: true } : c));
    setCards(nextCards);
    setPick(nextPick);
    if (nextPick.length < 2) return;
    setLock(true);
    const [a, b] = nextPick;
    const match = nextCards[a].f === nextCards[b].f;
    setTimeout(() => {
      if (match) {
        setCards((prev) => prev.map((c, i) => (i === a || i === b ? { ...c, done: true, open: true } : c)));
        setScores((s) => {
          const copy = [...s];
          copy[turn] += 1;
          return copy;
        });
        setPick([]);
        setLock(false);
      } else {
        setCards((prev) => prev.map((c, i) => (i === a || i === b ? { ...c, open: false } : c)));
        setPick([]);
        setTurn((t) => (t === 0 ? 1 : 0));
        setLock(false);
      }
    }, 650);
  };

  // Enkel AI: åpne to lukkede kort tilfeldig
  useEffect(() => {
    if (mode !== 'ai' || turn !== 1 || done || lock || pick.length) return undefined;
    const t = setTimeout(() => {
      const closed = cards.map((c, i) => (!c.open && !c.done ? i : -1)).filter((i) => i >= 0);
      if (closed.length < 2) return;
      const a = closed[Math.floor(Math.random() * closed.length)];
      let b = closed[Math.floor(Math.random() * closed.length)];
      while (b === a) b = closed[Math.floor(Math.random() * closed.length)];
      // Åpne sekvensielt via onCard-logikk
      const nextCards = cards.map((c, i) => (i === a || i === b ? { ...c, open: true } : c));
      setCards(nextCards);
      setLock(true);
      const match = nextCards[a].f === nextCards[b].f;
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
      }, 700);
    }, 400);
    return () => clearTimeout(t);
  }, [mode, turn, done, lock, pick.length, cards]);

  const cell = board.cell;
  const winnerIdx = scores[0] === scores[1] ? -1 : (scores[0] > scores[1] ? 0 : 1);
  const status = done
    ? (winnerIdx < 0 ? 'Uavgjort!' : (mode === 'ai'
      ? (winnerIdx === 0 ? 'Du vant!' : 'Datamaskinen vant')
      : `Spiller ${winnerIdx + 1} vant!`))
    : (mode === 'ai'
      ? (turn === 0 ? `Din tur · ${scores[0]}–${scores[1]}` : `Datamaskinen · ${scores[0]}–${scores[1]}`)
      : `Spiller ${turn + 1} · ${scores[0]}–${scores[1]}`);

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <CompactBackLink onPress={onBack || (() => nav.goBack())} label="Tilbake til spill" />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, alignItems: 'center' }}>
          <Text style={{ fontSize: 22, fontWeight: '400', color: colors.ink, flex: 1 }}>Memory</Text>
          <TouchableOpacity onPress={reset} style={styles.resetBtn}>
            <Text style={styles.resetTxt}>Ny runde</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.chipRow}>
          <TouchableOpacity style={[styles.chip, mode === 'ai' && styles.chipOn]} onPress={() => { setMode('ai'); reset(); }}>
            <Text style={[styles.chipTxt, mode === 'ai' && styles.chipTxtOn]}>Mot datamaskin</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.chip, mode === 'hotseat' && styles.chipOn]} onPress={() => { setMode('hotseat'); reset(); }}>
            <Text style={[styles.chipTxt, mode === 'hotseat' && styles.chipTxtOn]}>Samme skjerm</Text>
          </TouchableOpacity>
        </View>
        <GameHowTo title={ONLINE_GAME_GUIDES.memory.title} steps={ONLINE_GAME_GUIDES.memory.steps} simpleUi={simpleUi} />
        <View style={[styles.statusBanner, done && winnerIdx === 0 && styles.statusWin]}>
          <Text style={styles.statusTxt}>{status}</Text>
        </View>
        <GamePlayArena theme="cards">
          <View style={[styles.grid, { width: board.boardW, gap: board.gap }]}>
            {cards.map((c, idx) => (
              <Pressable
                key={c.id}
                onPress={() => onCard(idx)}
                style={[
                  styles.card,
                  { width: cell, height: cell },
                  (c.open || c.done) && styles.cardOpen,
                ]}
              >
                <Text style={{ fontSize: Math.round(cell * 0.45) }}>
                  {(c.open || c.done) ? c.f : '?'}
                </Text>
              </Pressable>
            ))}
          </View>
        </GamePlayArena>
        <GameWinCelebration
          visible={celebrationVisible}
          triggerKey={celebrationKey}
          outcome={winnerIdx < 0 ? 'draw' : (mode === 'ai' && winnerIdx === 1 ? 'lose' : 'win')}
          title={winnerIdx < 0 ? 'Uavgjort!' : (mode === 'ai' ? (winnerIdx === 0 ? 'Du vant!' : 'Datamaskinen vant') : `Spiller ${winnerIdx + 1} vant!`)}
          subtitle="Memory"
          draw={winnerIdx < 0}
          actionLabel="Ny runde"
          onAction={reset}
          onClose={closeCelebration}
        />
      </ScrollView>
    </Screen>
  );
}

export default function MemoryScreen() {
  useChildAppGuard('games');
  const nav = useNavigation();
  const route = useRoute();
  const layout = useLayout();
  const contentMax = gameContentMax(layout);
  const board = useGameBoardSize({
    cols: 4, rows: 4, gap: 10, maxCell: 120, minCell: 64, reserveH: 320, maxBoard: 640,
  });
  const { familyId, uid, members, isChild, isActingAsChild, meChild, activeChild, friendPeople } = useApp();
  const { effectiveFamilyId, setGameFamilyId } = useOnlineGameFamily(route, familyId);
  const { highChildFriendliness } = useThemeMeta();
  const simpleUi = highChildFriendliness;

  const routeGameId = route.params?.gameId || null;
  const inviteGameId = route.params?.inviteGameId || null;
  const [mode, setMode] = useState(routeGameId ? GAME_PLAY_MODES.online : null);
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

  const mySeat = myMemorySeat(game, uid);
  const finished = game?.status === MEMORY_STATUS.finished;
  const isDraw = finished && game?.winner === 'draw';
  const iWon = finished && !isDraw && game?.winner === mySeat;
  const winnerName = finished && !isDraw
    ? (game.winner === 1 ? game.player1?.name : game.player2?.name)
    : null;
  const celeKey = finished
    ? celebrationRoundKey(['memory', gameId, game?.roundId || 1, game?.winner])
    : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(finished, celeKey);

  const pendingInvitesRaw = useMergedTypeGameInvites({
    familyId: effectiveFamilyId,
    uid,
    gameType: 'memory',
    listenFamilyPending: listenPendingMemoryInvites,
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
    return listenMemoryGame(effectiveFamilyId, gameId, setGame);
  }, [effectiveFamilyId, gameId, mode]);

  // Auto-resolve mismatch flips
  useEffect(() => {
    if (!game?.lockUntil || !effectiveFamilyId || !gameId) return undefined;
    const wait = Math.max(0, game.lockUntil - Date.now());
    const t = setTimeout(() => {
      resolveMemoryFlip(effectiveFamilyId, gameId).catch(() => {});
    }, wait + 50);
    return () => clearTimeout(t);
  }, [game?.lockUntil, effectiveFamilyId, gameId]);

  const showInfo = useCallback((title, message) => {
    setInfo({ visible: true, title, message: String(message || '') });
  }, []);

  const respondInvite = useRespondGameInvite({
    uid, name: myName, gameType: 'memory', setGameFamilyId,
  });

  const createGame = useCallback(async () => {
    if (!effectiveFamilyId || !uid) return;
    try {
      setBusy(true);
      const { id } = await createMemoryGame(effectiveFamilyId, {
        uid, name: myName, invitedUids: selectedIds,
      });
      setSelectedIds([]);
      setGameId(id);
    } catch (e) {
      showInfo('Memory', e?.message || 'Kunne ikke starte.');
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
    return <LocalMemory simpleUi={simpleUi} initialMode={mode} />;
  }

  if (!mode) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={[styles.pad, { maxWidth: contentMax }]}>
          <CompactBackLink onPress={() => nav.goBack()} label="FamilieSpill" />
          <GameModePicker
            title="Memory"
            subtitle="Mot datamaskin, ulike enheter, eller samme skjerm."
            simpleUi={simpleUi}
            onSelect={setMode}
          />
        </ScrollView>
      </Screen>
    );
  }

  const cell = board.cell;
  const flipped = game?.flipped || [];
  const cards = game?.cards || [];
  const scores = game?.scores || { p1: 0, p2: 0 };

  if (gameId && game) {
    const status = game.status === MEMORY_STATUS.waiting
      ? 'Venter på motspiller…'
      : finished
        ? (isDraw ? 'Uavgjort!' : `${winnerName} vant!`)
        : (mySeat && game.currentTurn === mySeat
          ? `Din tur · ${scores.p1}–${scores.p2}`
          : `Motstanders tur · ${scores.p1}–${scores.p2}`);

    return (
      <Screen>
        <ScrollView contentContainerStyle={[styles.pad, { maxWidth: contentMax }]}>
          <TouchableOpacity style={styles.backRow} onPress={() => { setGameId(null); setGame(null); }}>
            <Ionicons name="chevron-back" size={18} color={colors.brand} />
            <Text style={styles.backTxt}>Nytt spill</Text>
          </TouchableOpacity>
          <GameHowTo title={ONLINE_GAME_GUIDES.memory.title} steps={ONLINE_GAME_GUIDES.memory.steps} simpleUi={simpleUi} />
          <View style={[styles.statusBanner, finished && !isDraw && styles.statusWin]}>
            <Text style={styles.statusTxt}>{status}</Text>
          </View>
          <GamePlayArena theme="cards">
            <View style={[styles.grid, { width: board.boardW, gap: board.gap }]}>
              {cards.map((c, idx) => {
                const show = c.matched || flipped.includes(idx);
                return (
                  <Pressable
                    key={c.id || idx}
                    onPress={() => {
                      if (!mySeat || game.currentTurn !== mySeat || game.status !== MEMORY_STATUS.playing) return;
                      flipMemoryCard(effectiveFamilyId, gameId, { uid, index: idx }).catch((e) => showInfo('Trekk', e?.message));
                    }}
                    style={[styles.card, { width: cell, height: cell }, show && styles.cardOpen]}
                  >
                    <Text style={{ fontSize: Math.round(cell * 0.42) }}>{show ? c.emoji : '?'}</Text>
                  </Pressable>
                );
              })}
            </View>
          </GamePlayArena>
          {finished ? (
            <TouchableOpacity
              style={styles.primary}
              onPress={() => {
                resetCelebrationSeen();
                resetMemoryGame(effectiveFamilyId, gameId).catch((e) => showInfo('Reset', e?.message));
              }}
            >
              <Text style={styles.primaryTxt}>Spill igjen</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
        <GameWinCelebration
          visible={celebrationVisible}
          triggerKey={celebrationKey}
          outcome={isDraw ? 'draw' : iWon ? 'win' : 'lose'}
          title={isDraw ? 'Uavgjort!' : (iWon ? 'Du vant!' : `${winnerName} vant!`)}
          subtitle="Memory"
          draw={isDraw}
          actionLabel="Spill igjen"
          onAction={() => {
            resetCelebrationSeen();
            resetMemoryGame(effectiveFamilyId, gameId).catch((e) => showInfo('Reset', e?.message));
          }}
          onClose={closeCelebration}
        />
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
      <ScrollView contentContainerStyle={[styles.pad, { maxWidth: contentMax }]}>
        <CompactBackLink onPress={() => setMode(null)} label="Velg modus" />
        <GameHowTo title={ONLINE_GAME_GUIDES.memory.title} steps={ONLINE_GAME_GUIDES.memory.steps} simpleUi={simpleUi} />
        <GameInvitePanel
          title="Memory · ulike enheter"
          description="Inviter én i familien. Dere bytter på å finne par."
          members={inviteable}
          friends={friendPeople || []}
          hostUid={uid}
          selectedIds={selectedIds}
          onToggleMember={(id) => setSelectedIds((prev) => (prev.includes(id) ? [] : [id]))}
          onCreate={createGame}
          pendingInvites={pendingInvites}
          onAcceptInvite={acceptInvite}
          onDeclineInvite={declineInvite}
          busy={busy}
          simpleUi={simpleUi}
          maxInvites={1}
          createLabel="Start memory"
        />
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
  pad: { padding: 16, paddingBottom: 48, width: '100%', alignSelf: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  backTxt: { color: colors.brand, fontWeight: '400' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14,
    borderWidth: 1.5, borderColor: colors.line, backgroundColor: colors.card,
  },
  chipOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  chipTxt: { color: colors.muted, fontWeight: '400', fontSize: 13 },
  chipTxtOn: { color: colors.brand },
  statusBanner: {
    backgroundColor: colors.brandSoft, borderRadius: 14, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  statusWin: { backgroundColor: colors.successSoft, borderColor: colors.success },
  statusTxt: { textAlign: 'center', fontWeight: '400', color: colors.ink, fontSize: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.brand, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
  },
  cardOpen: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.brandSoft },
  resetBtn: {
    alignSelf: 'flex-start', backgroundColor: colors.brandSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  resetTxt: { color: colors.brand, fontWeight: '400' },
  primary: {
    marginTop: 16, backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
  },
  primaryTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
});
