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
import GameWinCelebration, { useGameCelebration, celebrationRoundKey } from '../../components/GameWinCelebration';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { useApp } from '../../src/context/AppContext';
import { useThemeMeta } from '../../src/context/ThemeContext';
import { colors, useLayout } from '../../src/theme';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import { inviteSummary } from '../../src/utils/familyGamesShared';
import { useGameBoardSize, ONLINE_GAME_GUIDES, gameContentMax } from '../../src/utils/gameLayout';
import {
  TTT_STATUS,
  createTttGame,
  listenPendingTttInvites,
  listenTttGame,
  playTttMove,
  resetTttGame,
  myTttMark,
} from '../../src/utils/ticTacToe';
import {
  useOnlineGameFamily,
  useMergedTypeGameInvites,
  useRespondGameInvite,
} from '../../src/hooks/useOnlineGameFamily';
import { useOnlineInviteRoute } from '../../src/hooks/useOnlineInviteRoute';
import { TicTacToeLocal } from './LocalPlayScreen';

export default function TicTacToeScreen() {
  useChildAppGuard('games');
  const nav = useNavigation();
  const route = useRoute();
  const layout = useLayout();
  const contentMax = gameContentMax(layout);
  const board = useGameBoardSize({
    cols: 3, rows: 3, gap: 10, maxCell: 168, minCell: 80, reserveH: 300, maxBoard: 560, pad: 8,
  });
  const { familyId, uid, members, isChild, isActingAsChild, meChild, activeChild, friendPeople } = useApp();
  const { effectiveFamilyId, setGameFamilyId } = useOnlineGameFamily(route, familyId);
  const { highChildFriendliness } = useThemeMeta();
  const simpleUi = highChildFriendliness;

  const routeGameId = route.params?.gameId || null;
  const routeMode = route.params?.mode || null;
  const inviteGameId = route.params?.inviteGameId || null;
  const [mode, setMode] = useState(
    routeGameId ? GAME_PLAY_MODES.online
      : (routeMode === 'ai' || routeMode === 'hotseat' || routeMode === 'online' ? routeMode : null),
  );
  const [view, setView] = useState(routeGameId ? 'game' : 'hub');
  const [gameId, setGameId] = useState(routeGameId);
  const [game, setGame] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });

  useOnlineInviteRoute(route, { setMode, setView, setGameId, uid, game });

  const myName = useMemo(() => {
    if (isChild || isActingAsChild) return (isChild ? meChild : activeChild)?.name || 'Spiller';
    return members.find((m) => m.uid === uid)?.name || 'Spiller';
  }, [members, uid, isChild, isActingAsChild, meChild, activeChild]);

  const inviteable = useMemo(
    () => members.filter((m) => (m.uid || m.id) && (m.uid || m.id) !== uid),
    [members, uid],
  );

  const myMark = myTttMark(game, uid);
  const invites = useMemo(() => inviteSummary(game, members), [game, members]);
  const finished = game?.status === TTT_STATUS.finished;
  const isDraw = finished && game?.winner === 'draw';
  const winnerName = finished && !isDraw
    ? (game.winner === 'X' ? game.playerX?.name : game.playerO?.name)
    : null;
  const iWon = finished && !isDraw && (
    (game.winner === 'X' && game.playerX?.uid === uid)
    || (game.winner === 'O' && game.playerO?.uid === uid)
  );
  const celeKey = finished
    ? celebrationRoundKey(['ttt', gameId, game?.winner, (game?.board || []).join('')])
    : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(finished, celeKey);

  const pendingInvitesRaw = useMergedTypeGameInvites({
    familyId: effectiveFamilyId,
    uid,
    gameType: 'ttt',
    listenFamilyPending: listenPendingTttInvites,
    enabled: view === 'hub' || !!inviteGameId,
  });
  const pendingInvites = useMemo(() => {
    if (!inviteGameId) return pendingInvitesRaw;
    const match = pendingInvitesRaw.filter((i) => i.gameId === inviteGameId || i.id === inviteGameId);
    const rest = pendingInvitesRaw.filter((i) => i.gameId !== inviteGameId && i.id !== inviteGameId);
    return [...match, ...rest];
  }, [pendingInvitesRaw, inviteGameId]);

  useEffect(() => {
    if (!effectiveFamilyId || !gameId) return undefined;
    return listenTttGame(effectiveFamilyId, gameId, setGame);
  }, [effectiveFamilyId, gameId]);

  const showInfo = useCallback((title, message) => {
    setInfo({ visible: true, title, message: String(message || '') });
  }, []);

  const toggleMember = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? [] : [id]));
  }, []);

  const respondInvite = useRespondGameInvite({
    uid, name: myName, gameType: 'ttt', setGameFamilyId,
  });

  const createGame = useCallback(async () => {
    if (!effectiveFamilyId || !uid) return;
    try {
      setBusy(true);
      const { id } = await createTttGame(effectiveFamilyId, {
        uid, name: myName, invitedUids: selectedIds,
      });
      setSelectedIds([]);
      setGameId(id);
      setView('game');
      resetCelebrationSeen();
    } catch (e) {
      showInfo('Tre på rad', e?.message || 'Kunne ikke starte.');
    } finally {
      setBusy(false);
    }
  }, [effectiveFamilyId, uid, myName, selectedIds, showInfo, resetCelebrationSeen]);

  const acceptInvite = useCallback(async (inv) => {
    try {
      setBusy(true);
      const res = await respondInvite(inv, 'accepted');
      setGameId(res.gameId);
      setView('game');
      resetCelebrationSeen();
    } catch (e) {
      showInfo('Invitasjon', e?.message || 'Kunne ikke godta.');
    } finally {
      setBusy(false);
    }
  }, [respondInvite, showInfo, resetCelebrationSeen]);

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

  const onCell = useCallback(async (idx) => {
    if (!effectiveFamilyId || !gameId || !uid || !myMark) return;
    try {
      await playTttMove(effectiveFamilyId, gameId, { uid, cellIndex: idx });
    } catch (e) {
      showInfo('Trekk', e?.message || 'Kunne ikke spille.');
    }
  }, [effectiveFamilyId, gameId, uid, myMark, showInfo]);

  const statusText = useMemo(() => {
    if (!game) return '';
    if (game.status === TTT_STATUS.waiting) return 'Venter på at motspilleren godtar…';
    if (game.status === TTT_STATUS.finished) {
      if (game.winner === 'draw') return 'Uavgjort!';
      return `${winnerName} vant!`;
    }
    if (myMark && game.currentTurn === myMark) return 'Din tur!';
    return `Tur: ${game.currentTurn === 'X' ? game.playerX?.name : game.playerO?.name}`;
  }, [game, myMark, winnerName]);

  const styles = useMemo(
    () => makeStyles(simpleUi, contentMax, board),
    [simpleUi, contentMax, board],
  );

  if (mode === GAME_PLAY_MODES.ai || mode === GAME_PLAY_MODES.hotseat) {
    return <TicTacToeLocal simpleUi={simpleUi} initialMode={mode} />;
  }

  if (!mode) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.body}>
          <CompactBackLink onPress={() => nav.goBack()} label="FamilieSpill" />
          <GameModePicker
            title="Tre på rad"
            subtitle="Mot datamaskin, ulike enheter, eller samme skjerm."
            simpleUi={simpleUi}
            onSelect={(m) => {
              setMode(m);
              if (m === GAME_PLAY_MODES.online) setView('hub');
            }}
          />
        </ScrollView>
      </Screen>
    );
  }

  const replay = () => {
    resetCelebrationSeen();
    resetTttGame(effectiveFamilyId, gameId).catch((e) => showInfo('Reset', e?.message));
  };

  if (view === 'game' && game) {
    const cellSize = board.cell;
    const markSize = Math.round(cellSize * 0.55);
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.body}>
          <TouchableOpacity style={styles.backRow} onPress={() => { setView('hub'); setGameId(null); }}>
            <Ionicons name="chevron-back" size={18} color={colors.brand} />
            <Text style={styles.backTxt}>Nytt spill</Text>
          </TouchableOpacity>

          <GameHowTo
            title={ONLINE_GAME_GUIDES.ttt.title}
            steps={ONLINE_GAME_GUIDES.ttt.steps}
            simpleUi={simpleUi}
          />

          <View style={[styles.statusBanner, finished && styles.statusWin]}>
            <Text style={[styles.status, finished && styles.statusWinTxt]}>{statusText}</Text>
          </View>

          {game.status === TTT_STATUS.waiting ? (
            <View style={styles.inviteBoard}>
              {invites.map((row) => (
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
            <View style={[styles.playerChip, myMark === 'X' && styles.playerChipMe]}>
              <Text style={styles.playerMark}>✕</Text>
              <Text style={styles.playerName} numberOfLines={1}>{game.playerX?.name || '—'}</Text>
            </View>
            <Text style={styles.vs}>vs</Text>
            <View style={[styles.playerChip, myMark === 'O' && styles.playerChipMe]}>
              <Text style={styles.playerMark}>○</Text>
              <Text style={styles.playerName} numberOfLines={1}>{game.playerO?.name || 'Venter…'}</Text>
            </View>
          </View>

          <View style={[styles.board, { padding: board.pad, gap: board.gap }]}>
            {[0, 1, 2].map((row) => (
              <View key={row} style={[styles.boardRow, { gap: board.gap }]}>
                {[0, 1, 2].map((col) => {
                  const idx = row * 3 + col;
                  const cell = (game.board || Array(9).fill(null))[idx];
                  return (
                    <Pressable
                      key={idx}
                      style={[styles.cell, { width: cellSize, height: cellSize }]}
                      onPress={() => onCell(idx)}
                      disabled={!!cell || game.status !== TTT_STATUS.playing || !myMark || game.currentTurn !== myMark}
                    >
                      <Text style={[styles.cellTxt, { fontSize: markSize }]}>
                        {cell === 'X' ? '✕' : cell === 'O' ? '○' : ''}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          {!myMark && game.status === TTT_STATUS.playing ? (
            <Text style={styles.spectator}>Du ser på — spillet er fullt.</Text>
          ) : null}

          {finished ? (
            <TouchableOpacity style={styles.primary} onPress={replay}>
              <Text style={styles.primaryTxt}>Spill igjen</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
        <GameWinCelebration
          visible={celebrationVisible}
          triggerKey={celebrationKey}
          outcome={isDraw ? 'draw' : iWon ? 'win' : 'lose'}
          title={isDraw ? 'Uavgjort!' : (iWon ? 'Du vant!' : `${winnerName} vant!`)}
          subtitle="Tre på rad"
          draw={isDraw}
          actionLabel="Spill igjen"
          onAction={replay}
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
      <ScrollView contentContainerStyle={styles.body}>
        <CompactBackLink onPress={() => setMode(null)} label="Velg modus" />
        <GameHowTo
          title={ONLINE_GAME_GUIDES.ttt.title}
          steps={ONLINE_GAME_GUIDES.ttt.steps}
          defaultOpen
          simpleUi={simpleUi}
        />
        <GameInvitePanel
          title="Tre på rad · ulike enheter"
          description="To spillere spiller etter tur. Inviter én i familien eller en venn — hen må godta før spillet starter."
          members={inviteable}
          friends={friendPeople || []}
          hostUid={uid}
          selectedIds={selectedIds}
          onToggleMember={toggleMember}
          onCreate={createGame}
          pendingInvites={pendingInvites}
          onAcceptInvite={acceptInvite}
          onDeclineInvite={declineInvite}
          busy={busy}
          simpleUi={simpleUi}
          maxInvites={1}
          createLabel="Start nytt brett"
          highlightInviteId={inviteGameId}
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

function makeStyles(simpleUi, contentMax, board) {
  return StyleSheet.create({
    body: {
      padding: board.playPad || 16,
      paddingBottom: 48,
      width: '100%',
      maxWidth: contentMax,
      alignSelf: 'center',
    },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    backTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
    statusBanner: {
      backgroundColor: colors.brandSoft,
      borderRadius: 14,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.line,
    },
    statusWin: { backgroundColor: colors.successSoft, borderColor: colors.success },
    status: {
      textAlign: 'center', fontWeight: '400', fontSize: simpleUi ? 20 : 17, color: colors.ink,
    },
    statusWinTxt: { color: colors.success, fontSize: simpleUi ? 22 : 19 },
    inviteBoard: {
      backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line,
      padding: 8, marginBottom: 12,
    },
    inviteRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 8, paddingHorizontal: 6,
    },
    inviteName: { fontWeight: '400', color: colors.ink },
    inviteStatus: { fontWeight: '400', color: colors.muted },
    playersRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20,
    },
    playerChip: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
      borderWidth: 1, borderColor: colors.line, maxWidth: 160, minWidth: 110,
    },
    playerChipMe: { borderColor: colors.brand, borderWidth: 2, backgroundColor: colors.brandSoft },
    playerMark: { fontSize: 22, fontWeight: '400' },
    playerName: { fontWeight: '400', fontSize: 14, color: colors.ink, flex: 1 },
    vs: { color: colors.muted, fontWeight: '400', fontSize: 14 },
    board: {
      flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'center',
      backgroundColor: colors.line, borderRadius: 18,
    },
    cell: {
      backgroundColor: colors.card, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    },
    cellTxt: { fontWeight: '400', color: colors.ink },
    spectator: { textAlign: 'center', color: colors.muted, marginTop: 16, fontWeight: '400' },
    primary: {
      backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', marginTop: 24, alignSelf: 'center', paddingHorizontal: 40,
      minWidth: 200,
    },
    primaryTxt: { color: '#fff', fontWeight: '400', fontSize: 17 },
  });
}
