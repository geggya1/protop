import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import GameInvitePanel from '../../components/GameInvitePanel';
import GameHowTo from '../../components/GameHowTo';
import GameWinCelebration, { useGameCelebration } from '../../components/GameWinCelebration';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { useApp } from '../../src/context/AppContext';
import { useThemeMeta } from '../../src/context/ThemeContext';
import { colors, useLayout } from '../../src/theme';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import { inviteSummary } from '../../src/utils/familyGamesShared';
import { useGameBoardSize, ONLINE_GAME_GUIDES, gameContentMax } from '../../src/utils/gameLayout';
import {
  GUESS_STATUS,
  createGuessGame,
  listenPendingGuessInvites,
  listenGuessGame,
  listenGuessAttempts,
  submitGuess,
  endGuessGame,
} from '../../src/utils/guessNumber';
import {
  useOnlineGameFamily,
  useMergedTypeGameInvites,
  useRespondGameInvite,
} from '../../src/hooks/useOnlineGameFamily';
import { useOnlineInviteRoute } from '../../src/hooks/useOnlineInviteRoute';

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

export default function GuessNumberScreen() {
  useChildAppGuard('games');
  const nav = useNavigation();
  const route = useRoute();
  const layout = useLayout();
  const contentMax = gameContentMax(layout);
  const board = useGameBoardSize({
    cols: 5, rows: 2, gap: 10, maxCell: 88, minCell: 52, reserveH: 300, maxBoard: 520,
  });
  const { familyId, uid, members, isChild, isActingAsChild, meChild, activeChild, friendPeople } = useApp();
  const { effectiveFamilyId, setGameFamilyId } = useOnlineGameFamily(route, familyId);
  const { highChildFriendliness } = useThemeMeta();
  const simpleUi = highChildFriendliness;

  const inviteGameId = route.params?.inviteGameId || null;
  const [view, setView] = useState('hub');
  const [gameId, setGameId] = useState(null);
  const [game, setGame] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pickedSecret, setPickedSecret] = useState(null);
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });

  useOnlineInviteRoute(route, { setView, setGameId, uid, game });

  const myName = useMemo(() => {
    if (isChild || isActingAsChild) return (isChild ? meChild : activeChild)?.name || 'Spiller';
    return members.find((m) => m.uid === uid)?.name || 'Spiller';
  }, [members, uid, isChild, isActingAsChild, meChild, activeChild]);

  const inviteable = useMemo(
    () => members.filter((m) => (m.uid || m.id) && (m.uid || m.id) !== uid),
    [members, uid],
  );

  const asHost = !!(game && uid && game.hostUid === uid);
  const invites = useMemo(() => inviteSummary(game, members), [game, members]);
  const won = game?.status === GUESS_STATUS.won;
  const iWon = won && game?.winnerUid === uid;
  const celeKey = won ? `guess-${gameId}-${game?.winnerUid}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(won, celeKey);

  const pendingInvitesRaw = useMergedTypeGameInvites({
    familyId: effectiveFamilyId,
    uid,
    gameType: 'guess',
    listenFamilyPending: listenPendingGuessInvites,
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
    return listenGuessGame(effectiveFamilyId, gameId, setGame);
  }, [effectiveFamilyId, gameId]);

  useEffect(() => {
    if (!effectiveFamilyId || !gameId) return undefined;
    return listenGuessAttempts(effectiveFamilyId, gameId, setAttempts);
  }, [effectiveFamilyId, gameId]);

  const showInfo = useCallback((title, message) => {
    setInfo({ visible: true, title, message: String(message || '') });
  }, []);

  const toggleMember = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const respondInvite = useRespondGameInvite({
    uid, name: myName, gameType: 'guess', setGameFamilyId,
  });

  const createGame = useCallback(async () => {
    if (!effectiveFamilyId || !uid) return;
    if (pickedSecret == null) {
      showInfo('Velg tall', 'Trykk på et tall mellom 1 og 10 som de andre skal gjette.');
      return;
    }
    try {
      setBusy(true);
      const { id } = await createGuessGame(effectiveFamilyId, {
        uid, name: myName, secret: pickedSecret, invitedUids: selectedIds,
      });
      setSelectedIds([]);
      setGameId(id);
      setView('game');
      resetCelebrationSeen();
    } catch (e) {
      showInfo('Gjette tallet', e?.message || 'Kunne ikke starte.');
    } finally {
      setBusy(false);
    }
  }, [effectiveFamilyId, uid, myName, pickedSecret, selectedIds, showInfo, resetCelebrationSeen]);

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

  const guess = useCallback(async (num) => {
    if (!effectiveFamilyId || !gameId || !uid) return;
    try {
      await submitGuess(effectiveFamilyId, gameId, { uid, name: myName, guess: num });
    } catch (e) {
      showInfo('Gjett', e?.message || 'Kunne ikke gjette.');
    }
  }, [effectiveFamilyId, gameId, uid, myName, showInfo]);

  const styles = useMemo(
    () => makeStyles(simpleUi, contentMax, board),
    [simpleUi, contentMax, board],
  );

  const numBtn = (n, selected = false, onPress) => (
    <TouchableOpacity
      key={n}
      style={[
        styles.numBtn,
        { width: board.cell, height: board.cell, borderRadius: Math.max(14, board.cell * 0.22) },
        selected && styles.numBtnOn,
      ]}
      onPress={onPress}
    >
      <Text style={[styles.numTxt, { fontSize: Math.round(board.cell * 0.4) }]}>{n}</Text>
    </TouchableOpacity>
  );

  if (view === 'game' && game) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.body}>
          <TouchableOpacity style={styles.backRow} onPress={() => { setView('hub'); setGameId(null); }}>
            <Ionicons name="chevron-back" size={18} color={colors.brand} />
            <Text style={styles.backTxt}>Nytt spill</Text>
          </TouchableOpacity>

          <GameHowTo
            title={ONLINE_GAME_GUIDES.guess.title}
            steps={ONLINE_GAME_GUIDES.guess.steps}
            simpleUi={simpleUi}
          />

          {asHost ? (
            <>
              <View style={styles.secretHero}>
                <Text style={styles.hostHint}>Du er vert — hemmelig tall</Text>
                <Text style={styles.secretBig}>{game.secret}</Text>
                <Text style={styles.hostSub}>Bare du ser dette</Text>
              </View>
              <View style={styles.inviteBoard}>
                <Text style={styles.section}>Invitasjoner</Text>
                {invites.map((row) => (
                  <View key={row.uid} style={styles.inviteRow}>
                    <Text style={styles.inviteName}>{row.name}</Text>
                    <Text style={styles.inviteStatus}>
                      {row.status === 'accepted' ? 'Godtatt' : row.status === 'declined' ? 'Avslått' : 'Venter…'}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={styles.section}>Gjetninger fra familien</Text>
              {attempts.length === 0 ? (
                <Text style={styles.empty}>Ingen har gjettet ennå…</Text>
              ) : (
                attempts.map((a) => (
                  <View key={a.id} style={styles.attemptRow}>
                    <Text style={styles.attemptName}>{a.name}</Text>
                    <Text style={styles.attemptGuess}>{a.guess}</Text>
                    <Text style={[styles.attemptHint, a.correct && styles.attemptCorrect]}>{a.hint}</Text>
                  </View>
                ))
              )}
              {won ? (
                <View style={[styles.statusBanner, styles.statusWin]}>
                  <Text style={styles.winner}>{game.winnerName} gjettet riktig!</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.dangerLink}
                onPress={() => endGuessGame(effectiveFamilyId, gameId).catch(() => {})}
              >
                <Text style={styles.dangerTxt}>Avslutt spill</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.prompt}>Gjett et tall mellom 1 og 10!</Text>
              {won ? (
                <View style={[styles.statusBanner, styles.statusWin]}>
                  <Text style={styles.winner}>
                    {iWon ? 'Du vant!' : `${game.winnerName} vant!`}
                  </Text>
                </View>
              ) : (
                <View style={[styles.numGrid, { width: board.boardW, gap: board.gap }]}>
                  {NUMBERS.map((n) => numBtn(n, false, () => guess(n)))}
                </View>
              )}
              <Text style={styles.section}>Dine og andres forsøk</Text>
              {attempts.filter((a) => a.uid === uid).map((a) => (
                <Text key={a.id} style={styles.myAttempt}>
                  Du gjettet {a.guess} — {a.hint}
                </Text>
              ))}
            </>
          )}
        </ScrollView>
        <GameWinCelebration
          visible={celebrationVisible}
          triggerKey={celebrationKey}
          title={iWon ? 'Du vant!' : `${game.winnerName} gjettet riktig!`}
          subtitle={`Det hemmelige tallet var ${game.secret}`}
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
        <CompactBackLink onPress={() => nav.goBack()} label="FamilieSpill" />
        <GameHowTo
          title={ONLINE_GAME_GUIDES.guess.title}
          steps={ONLINE_GAME_GUIDES.guess.steps}
          defaultOpen
          simpleUi={simpleUi}
        />
        <GameInvitePanel
          title="Gjette tallet"
          description="Velg et hemmelig tall og inviter familien. De må godta før de kan gjette."
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
          createLabel="Start med valgt tall"
        >
          <Text style={styles.section}>Velg hemmelig tall (som vert)</Text>
          <View style={[styles.numGrid, { width: board.boardW, gap: board.gap, alignSelf: 'center' }]}>
            {NUMBERS.map((n) => numBtn(n, pickedSecret === n, () => setPickedSecret(n)))}
          </View>
        </GameInvitePanel>
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
    secretHero: {
      alignItems: 'center',
      backgroundColor: colors.successSoft,
      borderRadius: 20,
      padding: 24,
      marginBottom: 16,
      borderWidth: 2,
      borderColor: colors.success,
    },
    hostHint: { fontWeight: '400', color: colors.muted, fontSize: simpleUi ? 15 : 13 },
    secretBig: { fontSize: 72, fontWeight: '400', color: colors.success, marginVertical: 4 },
    hostSub: { color: colors.muted, fontWeight: '500' },
    prompt: {
      textAlign: 'center', fontWeight: '400', fontSize: simpleUi ? 24 : 20,
      color: colors.ink, marginVertical: 14,
    },
    section: {
      marginTop: 14, marginBottom: 6, color: colors.muted, fontWeight: '400',
      fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4,
    },
    inviteBoard: {
      backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line,
      padding: 8, marginBottom: 8,
    },
    inviteRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 8, paddingHorizontal: 6,
    },
    inviteName: { fontWeight: '400', color: colors.ink },
    inviteStatus: { fontWeight: '400', color: colors.muted },
    numGrid: {
      flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginVertical: 12, alignSelf: 'center',
    },
    numBtn: {
      alignSelf: 'flex-start',
      backgroundColor: colors.card,
      borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
    },
    numBtnOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
    numTxt: { fontWeight: '400', color: colors.ink },
    attemptRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.card, borderRadius: 12, padding: 12, marginBottom: 6,
      borderWidth: 1, borderColor: colors.line,
    },
    attemptName: { flex: 1, fontWeight: '400', color: colors.ink },
    attemptGuess: { fontWeight: '400', fontSize: 20, width: 32, textAlign: 'center' },
    attemptHint: { fontWeight: '400', color: colors.muted, minWidth: 80, textAlign: 'right' },
    attemptCorrect: { color: colors.success },
    myAttempt: { fontWeight: '400', color: colors.ink, marginBottom: 4, fontSize: 15 },
    empty: { color: colors.muted, textAlign: 'center', padding: 12 },
    statusBanner: {
      borderRadius: 14, padding: 16, marginVertical: 12, backgroundColor: colors.brandSoft,
    },
    statusWin: { backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.success },
    winner: { textAlign: 'center', fontWeight: '400', fontSize: 20, color: colors.success },
    dangerLink: { alignItems: 'center', paddingVertical: 14 },
    dangerTxt: { color: '#b91c1c', fontWeight: '400' },
  });
}
