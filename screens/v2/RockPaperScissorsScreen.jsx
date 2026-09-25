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
import GameWinCelebration, { useGameCelebration } from '../../components/GameWinCelebration';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import { useApp } from '../../src/context/AppContext';
import { useThemeMeta } from '../../src/context/ThemeContext';
import { colors, useLayout } from '../../src/theme';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import { RPS_CHOICES, inviteSummary } from '../../src/utils/familyGamesShared';
import { ONLINE_GAME_GUIDES, gameContentMax } from '../../src/utils/gameLayout';
import {
  RPS_STATUS,
  createRpsGame,
  listenPendingRpsInvites,
  listenRpsGame,
  listenRpsPlayers,
  startRpsRound,
  submitRpsChoice,
  nextRpsRoundOrFinish,
} from '../../src/utils/rockPaperScissors';
import {
  useOnlineGameFamily,
  useMergedTypeGameInvites,
  useRespondGameInvite,
} from '../../src/hooks/useOnlineGameFamily';
import { useOnlineInviteRoute } from '../../src/hooks/useOnlineInviteRoute';

export default function RockPaperScissorsScreen() {
  useChildAppGuard('games');
  const nav = useNavigation();
  const route = useRoute();
  const layout = useLayout();
  const contentMax = gameContentMax(layout);
  const { familyId, uid, members, isChild, isActingAsChild, meChild, activeChild, friendPeople } = useApp();
  const { effectiveFamilyId, setGameFamilyId } = useOnlineGameFamily(route, familyId);
  const { highChildFriendliness } = useThemeMeta();
  const simpleUi = highChildFriendliness;

  const inviteGameId = route.params?.inviteGameId || null;
  const [view, setView] = useState('hub');
  const [gameId, setGameId] = useState(null);
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [myChoice, setMyChoice] = useState(null);
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
  const acceptedCount = invites.filter((i) => i.status === 'accepted').length;

  const ranked = useMemo(
    () => [...players].sort((a, b) => (b.score || 0) - (a.score || 0)),
    [players],
  );
  const finished = game?.status === RPS_STATUS.finished;
  const champ = finished && ranked.length ? ranked[0] : null;
  const champTied = finished && ranked.length > 1
    && (ranked[0].score || 0) === (ranked[1].score || 0);
  const iWon = !!(champ && !champTied && champ.uid === uid);
  const celeKey = finished ? `rps-${gameId}-${champ?.uid || 'tie'}-${champ?.score || 0}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(finished, celeKey);

  const pendingInvitesRaw = useMergedTypeGameInvites({
    familyId: effectiveFamilyId,
    uid,
    gameType: 'rps',
    listenFamilyPending: listenPendingRpsInvites,
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
    return listenRpsGame(effectiveFamilyId, gameId, setGame);
  }, [effectiveFamilyId, gameId]);

  useEffect(() => {
    if (!effectiveFamilyId || !gameId) return undefined;
    return listenRpsPlayers(effectiveFamilyId, gameId, setPlayers);
  }, [effectiveFamilyId, gameId]);

  useEffect(() => {
    if (game?.status === RPS_STATUS.choosing) setMyChoice(null);
  }, [game?.status, game?.round]);

  const showInfo = useCallback((title, message) => {
    setInfo({ visible: true, title, message: String(message || '') });
  }, []);

  const toggleMember = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const respondInvite = useRespondGameInvite({
    uid, name: myName, gameType: 'rps', setGameFamilyId,
  });

  const createGame = useCallback(async () => {
    if (!effectiveFamilyId || !uid) return;
    try {
      setBusy(true);
      const { id } = await createRpsGame(effectiveFamilyId, {
        uid, name: myName, invitedUids: selectedIds,
      });
      setSelectedIds([]);
      setGameId(id);
      setView('game');
      resetCelebrationSeen();
    } catch (e) {
      showInfo('Stein-saks-papir', e?.message || 'Kunne ikke starte.');
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

  const pick = useCallback(async (choice) => {
    if (!effectiveFamilyId || !gameId || !uid) return;
    try {
      setMyChoice(choice);
      await submitRpsChoice(effectiveFamilyId, gameId, { uid, choice });
    } catch (e) {
      setMyChoice(null);
      showInfo('Valg', e?.message || 'Kunne ikke sende valg.');
    }
  }, [effectiveFamilyId, gameId, uid, showInfo]);

  const styles = useMemo(() => makeStyles(simpleUi, contentMax, layout), [simpleUi, contentMax, layout]);
  const canStart = acceptedCount > 0;
  const choiceMin = layout.isPhone ? (simpleUi ? 100 : 92) : layout.isTablet ? 120 : 140;

  if (view === 'game' && game) {
    const roundLabel = game.round ? `Runde ${game.round} / 5` : 'Lobby';
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.body}>
          <TouchableOpacity style={styles.backRow} onPress={() => { setView('hub'); setGameId(null); }}>
            <Ionicons name="chevron-back" size={18} color={colors.brand} />
            <Text style={styles.backTxt}>Nytt spill</Text>
          </TouchableOpacity>

          <GameHowTo
            title={ONLINE_GAME_GUIDES.rps.title}
            steps={ONLINE_GAME_GUIDES.rps.steps}
            simpleUi={simpleUi}
          />

          <View style={[styles.roundBanner, finished && styles.roundBannerWin]}>
            <Text style={styles.roundLabel}>{finished ? 'Ferdig!' : roundLabel}</Text>
          </View>

          {game.status === RPS_STATUS.lobby ? (
            <View style={styles.inviteBoard}>
              <Text style={styles.section}>Invitasjoner</Text>
              {invites.map((row) => (
                <View key={row.uid} style={styles.inviteRow}>
                  <Text style={styles.inviteName} numberOfLines={1}>{row.name}</Text>
                  <Text style={[
                    styles.inviteStatus,
                    row.status === 'accepted' && styles.inviteOk,
                    row.status === 'declined' && styles.inviteNo,
                  ]}
                  >
                    {row.status === 'accepted' ? 'Godtatt' : row.status === 'declined' ? 'Avslått' : 'Venter…'}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {game.status === RPS_STATUS.lobby && asHost && (
            <TouchableOpacity
              style={[styles.primary, !canStart && { opacity: 0.5 }]}
              disabled={!canStart}
              onPress={() => startRpsRound(effectiveFamilyId, gameId).catch((e) => showInfo('Start', e?.message))}
            >
              <Text style={styles.primaryTxt}>
                {canStart ? 'Start runde 1' : 'Vent til noen godtar'}
              </Text>
            </TouchableOpacity>
          )}

          {game.status === RPS_STATUS.lobby && !asHost ? (
            <Text style={styles.wait}>Verten starter snart… ({players.length} spillere)</Text>
          ) : null}

          {game.status === RPS_STATUS.choosing ? (
            <>
              <Text style={styles.prompt}>Velg din hånd!</Text>
              <View style={styles.choiceRow}>
                {RPS_CHOICES.map((c) => (
                  <Pressable
                    key={c.id}
                    style={[
                      styles.choiceBtn,
                      { minWidth: choiceMin, minHeight: choiceMin },
                      myChoice === c.id && styles.choiceBtnOn,
                    ]}
                    onPress={() => pick(c.id)}
                    disabled={!!myChoice}
                  >
                    <Text style={[styles.choiceEmoji, { fontSize: layout.isDesktop ? 64 : simpleUi ? 52 : 44 }]}>
                      {c.emoji}
                    </Text>
                    <Text style={styles.choiceLabel}>{c.label}</Text>
                  </Pressable>
                ))}
              </View>
              {myChoice ? <Text style={styles.wait}>Venter på de andre…</Text> : null}
            </>
          ) : null}

          {game.status === RPS_STATUS.reveal ? (
            <>
              <Text style={styles.prompt}>Resultat!</Text>
              <View style={styles.revealRow}>
                {players.map((p) => {
                  const c = RPS_CHOICES.find((x) => x.id === p.choice);
                  return (
                    <View key={p.id} style={[styles.revealCard, { minWidth: layout.isPhone ? 100 : 130 }]}>
                      <Text style={[styles.revealEmoji, { fontSize: layout.isDesktop ? 56 : 42 }]}>
                        {c?.emoji || '❓'}
                      </Text>
                      <Text style={styles.revealName} numberOfLines={1}>
                        {p.name}{p.uid === uid ? ' (deg)' : ''}
                      </Text>
                    </View>
                  );
                })}
              </View>
              {asHost ? (
                <TouchableOpacity
                  style={styles.primary}
                  onPress={() => nextRpsRoundOrFinish(effectiveFamilyId, gameId).catch((e) => showInfo('Neste', e?.message))}
                >
                  <Text style={styles.primaryTxt}>
                    {game.round >= 5 ? 'Avslutt' : 'Neste runde'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.wait}>Verten starter neste runde…</Text>
              )}
            </>
          ) : null}

          {finished ? (
            <View style={[styles.roundBanner, styles.roundBannerWin]}>
              <Text style={styles.finished}>
                {champTied
                  ? 'Uavgjort — se poenglisten!'
                  : iWon
                    ? 'Du vant mesterskapet!'
                    : `${champ?.name || 'Vinneren'} vant!`}
              </Text>
            </View>
          ) : null}

          <Text style={styles.section}>Poeng</Text>
          <View style={styles.scoreBoard}>
            {ranked.map((p, i) => (
              <View key={p.id} style={[styles.scoreRow, finished && i === 0 && !champTied && styles.scoreChamp]}>
                <Text style={styles.scoreRank}>{i === 0 ? '🏆' : i + 1}</Text>
                <Text style={styles.scoreName} numberOfLines={1}>
                  {p.name}{p.uid === uid ? ' (deg)' : ''}
                </Text>
                <Text style={styles.scorePts}>{p.score || 0}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
        <GameWinCelebration
          visible={celebrationVisible}
          triggerKey={celebrationKey}
          title={champTied ? 'Uavgjort!' : (iWon ? 'Du vant!' : `${champ?.name || 'Vinneren'} vant!`)}
          subtitle="Best av 5 runder — godt spilt!"
          draw={champTied}
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
          title={ONLINE_GAME_GUIDES.rps.title}
          steps={ONLINE_GAME_GUIDES.rps.steps}
          defaultOpen
          simpleUi={simpleUi}
        />
        <GameInvitePanel
          title="Stein-saks-papir"
          description="Inviter familien — alle godtar, deretter velger alle samtidig. Best av 5 runder."
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

function makeStyles(simpleUi, contentMax, layout) {
  return StyleSheet.create({
    body: {
      padding: layout.pad,
      paddingBottom: 48,
      width: '100%',
      maxWidth: contentMax,
      alignSelf: 'center',
    },
    backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
    backTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
    roundBanner: {
      backgroundColor: colors.brandSoft,
      borderRadius: 14,
      paddingVertical: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.line,
    },
    roundBannerWin: { backgroundColor: colors.successSoft, borderColor: colors.success },
    roundLabel: { textAlign: 'center', color: colors.ink, fontWeight: '400', fontSize: 16 },
    wait: { textAlign: 'center', color: colors.muted, fontWeight: '400', marginVertical: 12, fontSize: 15 },
    prompt: {
      textAlign: 'center', fontWeight: '400', fontSize: simpleUi ? 24 : 20,
      color: colors.ink, marginVertical: 14,
    },
    choiceRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, flexWrap: 'wrap' },
    choiceBtn: {
      alignSelf: 'flex-start',
      backgroundColor: colors.card, borderRadius: 20, padding: simpleUi ? 22 : 16,
      alignItems: 'center', borderWidth: 3, borderColor: colors.line, justifyContent: 'center',
    },
    choiceBtnOn: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
    choiceEmoji: {},
    choiceLabel: { fontWeight: '400', marginTop: 8, color: colors.ink, fontSize: simpleUi ? 17 : 14 },
    revealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' },
    revealCard: {
      backgroundColor: colors.card, borderRadius: 16, padding: 16, alignItems: 'center',
      borderWidth: 1, borderColor: colors.line,
    },
    revealEmoji: {},
    revealName: { fontWeight: '400', fontSize: 13, marginTop: 6, color: colors.ink },
    finished: { textAlign: 'center', fontWeight: '400', color: colors.success, fontSize: 18 },
    section: {
      marginTop: 18, marginBottom: 6, color: colors.muted, fontWeight: '400',
      fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4,
    },
    inviteBoard: {
      backgroundColor: colors.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line, padding: 8, marginBottom: 8,
    },
    inviteRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 6,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
    },
    inviteName: { flex: 1, fontWeight: '500', color: colors.ink, fontSize: 14 },
    inviteStatus: { fontWeight: '400', color: colors.muted, fontSize: 13 },
    inviteOk: { color: colors.brand },
    inviteNo: { color: '#b91c1c' },
    scoreBoard: {
      backgroundColor: colors.card, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line, padding: 8,
    },
    scoreRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
    },
    scoreChamp: { backgroundColor: colors.successSoft, borderRadius: 10 },
    scoreRank: { width: 28, fontWeight: '400', color: colors.muted, fontSize: 16 },
    scoreName: { flex: 1, fontWeight: '400', color: colors.ink, fontSize: 15 },
    scorePts: { fontWeight: '400', color: colors.brand, fontSize: 18 },
    primary: {
      backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 16,
      alignItems: 'center', marginTop: 14,
    },
    primaryTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
  });
}
