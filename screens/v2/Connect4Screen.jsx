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
  C4_STATUS,
  emptyBoard,
  createConnect4Game,
  listenPendingConnect4Invites,
  listenConnect4Game,
  playConnect4Move,
  resetConnect4Game,
  myConnect4Mark,
} from '../../src/utils/connect4';
import {
  useOnlineGameFamily,
  useMergedTypeGameInvites,
  useRespondGameInvite,
} from '../../src/hooks/useOnlineGameFamily';
import { useOnlineInviteRoute } from '../../src/hooks/useOnlineInviteRoute';
import { LocalConnect4 } from './LocalPlayScreen';

export default function Connect4Screen() {
  useChildAppGuard('games');
  const nav = useNavigation();
  const route = useRoute();
  const layout = useLayout();
  const contentMax = gameContentMax(layout);
  const board = useGameBoardSize({
    cols: 7, rows: 6, gap: 6, maxCell: 108, minCell: 44, reserveH: 300, maxBoard: 860,
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

  const myMark = myConnect4Mark(game, uid);
  const invites = useMemo(() => inviteSummary(game, members), [game, members]);
  const finished = game?.status === C4_STATUS.finished;
  const isDraw = finished && game?.winner === 'draw';
  const winnerName = finished && !isDraw
    ? (game.winner === 1 ? game.player1?.name : game.player2?.name)
    : null;
  const iWon = finished && !isDraw && (
    (game.winner === 1 && game.player1?.uid === uid)
    || (game.winner === 2 && game.player2?.uid === uid)
  );
  const celeKey = finished ? celebrationRoundKey(['c4', gameId, game?.winner, game?.roundId || 'r']) : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(finished, celeKey);

  const pendingInvitesRaw = useMergedTypeGameInvites({
    familyId: effectiveFamilyId,
    uid,
    gameType: 'connect4',
    listenFamilyPending: listenPendingConnect4Invites,
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
    return listenConnect4Game(effectiveFamilyId, gameId, setGame);
  }, [effectiveFamilyId, gameId]);

  const showInfo = useCallback((title, message) => {
    setInfo({ visible: true, title, message: String(message || '') });
  }, []);

  const toggleMember = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? [] : [id]));
  }, []);

  const respondInvite = useRespondGameInvite({
    uid, name: myName, gameType: 'connect4', setGameFamilyId,
  });

  const createGame = useCallback(async () => {
    if (!effectiveFamilyId || !uid) return;
    try {
      setBusy(true);
      const { id } = await createConnect4Game(effectiveFamilyId, {
        uid, name: myName, invitedUids: selectedIds,
      });
      setSelectedIds([]);
      setGameId(id);
      setView('game');
      resetCelebrationSeen();
    } catch (e) {
      showInfo('Fire på rad', e?.message || 'Kunne ikke starte.');
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

  const onDrop = useCallback(async (col) => {
    if (!effectiveFamilyId || !gameId || !uid || !myMark) return;
    try {
      await playConnect4Move(effectiveFamilyId, gameId, { uid, col });
    } catch (e) {
      showInfo('Trekk', e?.message || 'Kunne ikke spille.');
    }
  }, [effectiveFamilyId, gameId, uid, myMark, showInfo]);

  const statusText = useMemo(() => {
    if (!game) return '';
    if (game.status === C4_STATUS.waiting) return 'Venter på at motspilleren godtar…';
    if (game.status === C4_STATUS.finished) {
      if (game.winner === 'draw') return 'Uavgjort!';
      return `${winnerName} vant!`;
    }
    if (myMark && game.currentTurn === myMark) return 'Din tur!';
    const other = game.currentTurn === 1 ? game.player1?.name : game.player2?.name;
    return `Tur: ${other || 'motspiller'}`;
  }, [game, myMark, winnerName]);

  const styles = useMemo(
    () => makeStyles(simpleUi, contentMax, board),
    [simpleUi, contentMax, board],
  );

  if (mode === GAME_PLAY_MODES.ai || mode === GAME_PLAY_MODES.hotseat) {
    return <LocalConnect4 simpleUi={simpleUi} initialMode={mode} />;
  }

  if (!mode) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.body}>
          <CompactBackLink onPress={() => nav.goBack()} label="FamilieSpill" />
          <GameModePicker
            title="Fire på rad"
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
    resetConnect4Game(effectiveFamilyId, gameId).catch((e) => showInfo('Reset', e?.message));
  };

  if (view === 'game' && game) {
    const cell = board.cell;
    const dot = Math.round(cell * 0.72);
    const grid = game.board || emptyBoard();
    const canPlay = game.status === C4_STATUS.playing && myMark && game.currentTurn === myMark;

    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.body}>
          <TouchableOpacity style={styles.backRow} onPress={() => { setView('hub'); setGameId(null); }}>
            <Ionicons name="chevron-back" size={18} color={colors.brand} />
            <Text style={styles.backTxt}>Nytt spill</Text>
          </TouchableOpacity>

          <GameHowTo
            title={ONLINE_GAME_GUIDES.connect4.title}
            steps={ONLINE_GAME_GUIDES.connect4.steps}
            simpleUi={simpleUi}
          />

          <View style={[styles.statusBanner, finished && styles.statusWin]}>
            <Text style={[styles.status, finished && styles.statusWinTxt]}>{statusText}</Text>
          </View>

          {game.status === C4_STATUS.waiting ? (
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
            <View style={[styles.playerChip, myMark === 1 && styles.playerChipMe]}>
              <View style={[styles.swatch, { backgroundColor: '#ef4444' }]} />
              <Text style={styles.playerName} numberOfLines={1}>{game.player1?.name || '—'}</Text>
            </View>
            <Text style={styles.vs}>vs</Text>
            <View style={[styles.playerChip, myMark === 2 && styles.playerChipMe]}>
              <View style={[styles.swatch, { backgroundColor: '#eab308' }]} />
              <Text style={styles.playerName} numberOfLines={1}>{game.player2?.name || 'Venter…'}</Text>
            </View>
          </View>

          <View style={[styles.c4, { padding: Math.max(8, cell * 0.12) }]}>
            {grid.map((row, r) => (
              <View key={r} style={styles.c4row}>
                {row.map((cellVal, c) => (
                  <Pressable
                    key={c}
                    onPress={() => onDrop(c)}
                    disabled={!canPlay}
                    style={[styles.c4cell, { width: cell, height: cell }]}
                    accessibilityRole="button"
                    accessibilityLabel={`Kolonne ${c + 1}`}
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

          {!myMark && game.status === C4_STATUS.playing ? (
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
          subtitle="Fire på rad"
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
          title={ONLINE_GAME_GUIDES.connect4.title}
          steps={ONLINE_GAME_GUIDES.connect4.steps}
          defaultOpen
          simpleUi={simpleUi}
        />
        <GameInvitePanel
          title="Fire på rad · ulike enheter"
          description="To spillere bytter på å slippe brikker. Inviter én i familien eller en venn — hen må godta før spillet starter."
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
      textAlign: 'center', fontWeight: '800', fontSize: simpleUi ? 20 : 17, color: colors.ink,
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
    inviteName: { fontWeight: '600', color: colors.ink },
    inviteStatus: { fontWeight: '600', color: colors.muted },
    playersRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20,
    },
    playerChip: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.card, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10,
      borderWidth: 1, borderColor: colors.line, maxWidth: 160, minWidth: 110,
    },
    playerChipMe: { borderColor: colors.brand, borderWidth: 2, backgroundColor: colors.brandSoft },
    swatch: { width: 18, height: 18, borderRadius: 9 },
    playerName: { fontWeight: '700', fontSize: 14, color: colors.ink, flex: 1 },
    vs: { color: colors.muted, fontWeight: '800', fontSize: 14 },
    c4: {
      backgroundColor: '#2563eb',
      borderRadius: 16,
      alignSelf: 'center',
      gap: board.gap || 6,
    },
    c4row: { flexDirection: 'row', gap: board.gap || 6, justifyContent: 'center' },
    c4cell: { alignItems: 'center', justifyContent: 'center' },
    c4dot: { backgroundColor: colors.card },
    spectator: { textAlign: 'center', color: colors.muted, marginTop: 16, fontWeight: '600' },
    primary: {
      backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', marginTop: 24, alignSelf: 'center', paddingHorizontal: 40,
      minWidth: 200,
    },
    primaryTxt: { color: '#fff', fontWeight: '700', fontSize: 17 },
  });
}
