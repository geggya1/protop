import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Pressable, Platform,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Mute } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import GameInvitePanel from '../../components/GameInvitePanel';
import GameHowTo from '../../components/GameHowTo';
import GameWinCelebration, { useGameCelebration } from '../../components/GameWinCelebration';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { ONLINE_GAME_GUIDES } from '../../src/utils/gameLayout';
import {
  SAMPLE_QUIZZES,
  QUIZ_STATUS,
  createQuizGame,
  listenPendingQuizInvites,
  listenQuizGame,
  listenQuizPlayers,
  startQuizQuestion,
  revealQuizQuestion,
  advanceOrFinishQuiz,
  submitQuizAnswer,
  endQuizGame,
  optionColors,
} from '../../src/utils/familyQuiz';
import { inviteSummary } from '../../src/utils/familyGamesShared';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import { useThemeMeta } from '../../src/context/ThemeContext';
import {
  useOnlineGameFamily,
  useMergedTypeGameInvites,
  useRespondGameInvite,
} from '../../src/hooks/useOnlineGameFamily';
import { useOnlineInviteRoute } from '../../src/hooks/useOnlineInviteRoute';

/**
 * Familiequiz — live Kahoot-stil med Firestore sanntid.
 * Vert inviterer familiemedlemmer; de godtar før quizen starter.
 */
export default function FamilyQuizScreen({ compactHeader = false, onBack }) {
  useChildAppGuard('games');
  const route = useRoute();
  const layout = useLayout();
  const { isDesktop } = layout;
  const { highChildFriendliness } = useThemeMeta();
  const simpleUi = highChildFriendliness;
  const {
    familyId, uid, members, isChild, isActingAsChild,
    meChild, activeChild, requestShellTab, friendPeople } = useApp();
  const { effectiveFamilyId, setGameFamilyId } = useOnlineGameFamily(route, familyId);
  const inviteGameId = route.params?.inviteGameId || null;
  const [view, setView] = useState('hub'); // hub | game
  const [gameId, setGameId] = useState(null);
  const [game, setGame] = useState(null);
  const [players, setPlayers] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pickedTemplate, setPickedTemplate] = useState(simpleUi ? 'smabarn' : 'norge');
  const [answered, setAnswered] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });

  useOnlineInviteRoute(route, { setView, setGameId, uid, game });

  const myName = useMemo(() => {
    if (isChild || isActingAsChild) {
      return (isChild ? meChild : activeChild)?.name || 'Spiller';
    }
    return members.find((m) => m.uid === uid)?.name || 'Vert';
  }, [members, uid, isChild, isActingAsChild, meChild, activeChild]);

  const inviteable = useMemo(
    () => members.filter((m) => (m.uid || m.id) && (m.uid || m.id) !== uid),
    [members, uid],
  );

  const asHost = !!(game && uid && game.hostUid === uid);
  const colors4 = optionColors();
  const invites = useMemo(() => inviteSummary(game, members), [game, members]);
  const acceptedCount = invites.filter((i) => i.status === 'accepted').length;
  const finished = game?.status === QUIZ_STATUS.finished;
  const champ = finished && players.length ? players[0] : null;
  const champTied = finished && players.length > 1
    && (players[0].score || 0) === (players[1].score || 0);
  const iWon = !!(champ && !champTied && champ.uid === uid);
  const celeKey = finished ? `quiz-${gameId}-${champ?.uid || 'tie'}-${champ?.score || 0}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration } = useGameCelebration(finished, celeKey);

  const pendingInvitesRaw = useMergedTypeGameInvites({
    familyId: effectiveFamilyId,
    uid,
    gameType: 'quiz',
    listenFamilyPending: listenPendingQuizInvites,
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
    return listenQuizGame(effectiveFamilyId, gameId, setGame);
  }, [effectiveFamilyId, gameId]);

  useEffect(() => {
    if (!effectiveFamilyId || !gameId) return undefined;
    return listenQuizPlayers(effectiveFamilyId, gameId, setPlayers);
  }, [effectiveFamilyId, gameId]);

  useEffect(() => {
    setAnswered(false);
    setLastResult(null);
  }, [game?.questionIndex, game?.status]);

  const showInfo = useCallback((title, message) => {
    setInfo({ visible: true, title, message: String(message || '') });
  }, []);

  const goBackHub = useCallback(() => {
    if (onBack) onBack();
    else requestShellTab?.('home');
  }, [onBack, requestShellTab]);

  const toggleMember = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const respondInvite = useRespondGameInvite({
    uid, name: myName, gameType: 'quiz', setGameFamilyId,
  });

  const createGame = useCallback(async () => {
    if (!effectiveFamilyId || !uid) return;
    const tpl = SAMPLE_QUIZZES.find((t) => t.id === pickedTemplate) || SAMPLE_QUIZZES[0];
    try {
      setBusy(true);
      const { id } = await createQuizGame(effectiveFamilyId, {
        uid,
        hostName: myName,
        title: tpl.title,
        questions: tpl.questions,
        invitedUids: selectedIds,
      });
      setSelectedIds([]);
      setGameId(id);
      setView('game');
    } catch (e) {
      showInfo('Quiz', e?.message || 'Kunne ikke starte quiz.');
    } finally {
      setBusy(false);
    }
  }, [effectiveFamilyId, uid, pickedTemplate, myName, selectedIds, showInfo]);

  const acceptInvite = useCallback(async (inv) => {
    try {
      setBusy(true);
      const res = await respondInvite(inv, 'accepted');
      setGameId(res.gameId);
      setView('game');
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

  const onAnswer = useCallback(async (choiceIndex) => {
    if (!effectiveFamilyId || !gameId || !uid || !game || answered) return;
    if (game.status !== QUIZ_STATUS.question) return;
    try {
      setAnswered(true);
      const res = await submitQuizAnswer(effectiveFamilyId, gameId, {
        uid,
        choiceIndex,
        questionIndex: game.questionIndex || 0,
      });
      setLastResult(res);
    } catch (e) {
      setAnswered(false);
      showInfo('Svar', e?.message || 'Kunne ikke sende svar.');
    }
  }, [effectiveFamilyId, gameId, uid, game, answered, showInfo]);

  const q = game?.questions?.[game.questionIndex || 0] || null;
  const canStart = acceptedCount > 0;

  if (view === 'game' && game) {
    return (
      <Screen>
        <ScrollView
          contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}
          keyboardShouldPersistTaps="handled"
        >
          <TouchableOpacity
            style={styles.backRow}
            onPress={() => { setView('hub'); setGameId(null); setGame(null); }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.brand} />
            <Text style={styles.backTxt}>Til hub</Text>
          </TouchableOpacity>

          <GameHowTo
            title={ONLINE_GAME_GUIDES.quiz.title}
            steps={ONLINE_GAME_GUIDES.quiz.steps}
            simpleUi={simpleUi}
          />

          <Text style={styles.title}>{game.title}</Text>
          <Mute style={{ textAlign: 'center' }}>
            {game.status === QUIZ_STATUS.lobby && 'Lobby — vent på at alle godtar, deretter starter verten'}
            {game.status === QUIZ_STATUS.question && `Spørsmål ${(game.questionIndex || 0) + 1} / ${game.questions?.length || 0}`}
            {game.status === QUIZ_STATUS.reveal && 'Riktig svar'}
            {game.status === QUIZ_STATUS.finished && (
              champTied
                ? 'Ferdig — uavgjort!'
                : iWon
                  ? 'Ferdig — du vant!'
                  : `Ferdig — ${champ?.name || 'vinneren'} vant!`
            )}
          </Mute>

          {game.status === QUIZ_STATUS.lobby ? (
            <View style={styles.inviteBoard}>
              <Text style={styles.section}>Invitasjoner</Text>
              {invites.length === 0 ? (
                <Text style={styles.empty}>Ingen inviterte</Text>
              ) : (
                invites.map((row) => (
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
                ))
              )}
            </View>
          ) : null}

          {asHost && game.status === QUIZ_STATUS.lobby && (
            <TouchableOpacity
              style={[styles.primary, !canStart && { opacity: 0.5 }]}
              disabled={!canStart}
              onPress={() => startQuizQuestion(effectiveFamilyId, gameId, 0).catch((e) => showInfo('Start', e?.message))}
            >
              <Text style={styles.primaryTxt}>
                {canStart ? 'Start quiz' : 'Vent til noen godtar'}
              </Text>
            </TouchableOpacity>
          )}

          {asHost && game.status === QUIZ_STATUS.question && (
            <TouchableOpacity
              style={styles.secondary}
              onPress={() => revealQuizQuestion(effectiveFamilyId, gameId).catch((e) => showInfo('Vis', e?.message))}
            >
              <Text style={styles.secondaryTxt}>Vis riktig svar</Text>
            </TouchableOpacity>
          )}

          {asHost && game.status === QUIZ_STATUS.reveal && (
            <TouchableOpacity
              style={styles.primary}
              onPress={() => advanceOrFinishQuiz(effectiveFamilyId, gameId).catch((e) => showInfo('Neste', e?.message))}
            >
              <Text style={styles.primaryTxt}>Neste spørsmål</Text>
            </TouchableOpacity>
          )}

          {asHost && game.status !== QUIZ_STATUS.finished && (
            <TouchableOpacity
              style={styles.dangerLink}
              onPress={() => endQuizGame(effectiveFamilyId, gameId).catch(() => {})}
            >
              <Text style={styles.dangerTxt}>Avslutt quiz</Text>
            </TouchableOpacity>
          )}

          {(game.status === QUIZ_STATUS.question || game.status === QUIZ_STATUS.reveal) && q ? (
            <View style={styles.qCard}>
              <Text style={styles.qText}>{q.text}</Text>
              <View style={styles.optGrid}>
                {q.options.map((opt, idx) => {
                  const showCorrect = game.status === QUIZ_STATUS.reveal;
                  const isCorrect = idx === q.correctIndex;
                  return (
                    <Pressable
                      key={`${q.id}-${idx}`}
                      style={[
                        styles.opt,
                        { backgroundColor: colors4[idx % 4] },
                        showCorrect && !isCorrect && { opacity: 0.45 },
                        showCorrect && isCorrect && styles.optCorrect,
                        Platform.OS === 'web' ? { cursor: answered || showCorrect ? 'default' : 'pointer' } : null,
                      ]}
                      onPress={() => onAnswer(idx)}
                      disabled={answered || game.status !== QUIZ_STATUS.question}
                    >
                      <Text style={styles.optTxt}>{opt}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {lastResult ? (
                <Text style={styles.resultHint}>
                  {lastResult.correct ? `Riktig! +${lastResult.points} poeng` : 'Feil — bedre lykke neste gang'}
                </Text>
              ) : answered ? (
                <Text style={styles.resultHint}>Svar sendt — venter…</Text>
              ) : null}
            </View>
          ) : null}

          <Text style={styles.section}>Live resultatliste</Text>
          <View style={styles.scoreBoard}>
            {players.length === 0 ? (
              <Text style={styles.empty}>Ingen spillere ennå</Text>
            ) : (
              players.map((p, i) => (
                <View key={p.id} style={[styles.scoreRow, finished && i === 0 && !champTied && styles.scoreChamp]}>
                  <Text style={styles.scoreRank}>{i === 0 && finished ? '🏆' : i + 1}</Text>
                  <Text style={styles.scoreName} numberOfLines={1}>
                    {p.name}{p.uid === uid ? ' (deg)' : ''}
                  </Text>
                  <Text style={styles.scorePts}>{p.score || 0}</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <GameWinCelebration
          visible={celebrationVisible}
          triggerKey={celebrationKey}
          title={champTied ? 'Uavgjort!' : (iWon ? 'Du vant quizen!' : `${champ?.name || 'Vinneren'} vant!`)}
          subtitle={champ ? `${champ.score || 0} poeng` : 'Godt spilt!'}
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
      <ScrollView
        contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}
        keyboardShouldPersistTaps="handled"
      >
        {!compactHeader ? (
          <>
            <CompactBackLink onPress={goBackHub} label="Tilbake" />
            <Text style={styles.hubTitle}>Familiequiz</Text>
            <Mute>
              Live quiz som Kahoot — inviter familien, de godtar, og poeng oppdateres i sanntid.
            </Mute>
          </>
        ) : null}

        <GameHowTo
          title={ONLINE_GAME_GUIDES.quiz.title}
          steps={ONLINE_GAME_GUIDES.quiz.steps}
          defaultOpen={!compactHeader}
          simpleUi={simpleUi}
        />

        <GameInvitePanel
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
          createLabel="Start live-quiz"
        >
          <Text style={styles.section}>Velg quiz</Text>
          <View style={styles.tplRow}>
            {SAMPLE_QUIZZES.map((t) => {
              const on = pickedTemplate === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.tplChip, on && styles.tplChipOn]}
                  onPress={() => setPickedTemplate(t.id)}
                >
                  <Text style={[styles.tplTxt, on && styles.tplTxtOn]}>{t.title}</Text>
                </TouchableOpacity>
              );
            })}
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

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48, gap: 8, width: '100%', maxWidth: 880, alignSelf: 'center' },
  bodyDesk: { maxWidth: 720, width: '100%', alignSelf: 'center', padding: 16 },
  hubTitle: { fontSize: 22, fontWeight: '400', color: colors.ink, marginBottom: 4 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  backTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
  section: {
    marginTop: 14, marginBottom: 6, color: colors.muted, fontWeight: '400',
    fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4,
  },
  tplRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  tplChip: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    backgroundColor: colors.card, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
  },
  tplChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tplTxt: { color: colors.ink, fontWeight: '500', fontSize: 13 },
  tplTxtOn: { color: '#fff' },
  primary: {
    backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 13,
    alignItems: 'center', marginTop: 4,
  },
  primaryTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },
  secondary: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    backgroundColor: colors.card, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 6,
  },
  secondaryTxt: { color: colors.brand, fontWeight: '400', fontSize: 14 },
  title: { fontSize: 20, fontWeight: '400', color: colors.ink, textAlign: 'center' },
  inviteBoard: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line, padding: 8, marginTop: 8,
  },
  inviteRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  inviteName: { flex: 1, fontWeight: '500', color: colors.ink, fontSize: 14 },
  inviteStatus: { fontWeight: '400', color: colors.muted, fontSize: 13 },
  inviteOk: { color: colors.brand },
  inviteNo: { color: '#b91c1c' },
  qCard: {
    marginTop: 12, backgroundColor: colors.card, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, padding: 16, gap: 12,
  },
  qText: { fontSize: 19, fontWeight: '400', color: colors.ink, textAlign: 'center', marginBottom: 4 },
  optGrid: { gap: 10 },
  opt: { borderRadius: 12, paddingVertical: 18, paddingHorizontal: 14, alignItems: 'center', minHeight: 56 },
  optCorrect: { borderWidth: 3, borderColor: '#fff' },
  optTxt: { color: '#fff', fontWeight: '400', fontSize: 16, textAlign: 'center' },
  resultHint: { textAlign: 'center', color: colors.ink, fontWeight: '400', marginTop: 4, fontSize: 15 },
  scoreBoard: {
    backgroundColor: colors.card, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line, padding: 8,
  },
  scoreRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  scoreChamp: { backgroundColor: colors.successSoft, borderRadius: 10 },
  scoreRank: { width: 28, fontWeight: '400', color: colors.muted, fontSize: 16 },
  scoreName: { flex: 1, fontWeight: '400', color: colors.ink, fontSize: 15 },
  scorePts: { fontWeight: '400', color: colors.brand, fontSize: 17 },
  empty: { color: colors.muted, padding: 10, textAlign: 'center' },
  dangerLink: { alignItems: 'center', paddingVertical: 10 },
  dangerTxt: { color: '#b91c1c', fontWeight: '500', fontSize: 13 },
});
