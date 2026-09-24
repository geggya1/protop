import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import GameInvitePanel from '../../components/GameInvitePanel';
import GameHowTo from '../../components/GameHowTo';
import GameWinCelebration, { useGameCelebration } from '../../components/GameWinCelebration';
import ConfirmActionModal from '../../components/ConfirmActionModal';
import DrawingBoard from '../../components/DrawingBoard';
import { useApp } from '../../src/context/AppContext';
import { useThemeMeta } from '../../src/context/ThemeContext';
import { colors, useLayout } from '../../src/theme';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import { inviteSummary } from '../../src/utils/familyGamesShared';
import { ONLINE_GAME_GUIDES, gameContentMax } from '../../src/utils/gameLayout';
import {
  DRAW_STATUS,
  createDrawGuessGame,
  listenPendingDrawGuessInvites,
  listenDrawGuessGame,
  listenDrawGuessAttempts,
  publishDrawStrokes,
  publishLiveStroke,
  clearDrawing,
  reshuffleWord,
  submitDrawGuess,
  startNextDrawRound,
  endDrawGuessGame,
} from '../../src/utils/drawGuess';
import {
  useOnlineGameFamily,
  useMergedTypeGameInvites,
  useRespondGameInvite,
} from '../../src/hooks/useOnlineGameFamily';
import { useOnlineInviteRoute } from '../../src/hooks/useOnlineInviteRoute';

const PEN_COLORS = ['#1a2744', '#dc2626', '#2563eb', '#16a34a', '#d97706', '#a855f7'];

export default function DrawGuessScreen() {
  useChildAppGuard('games');
  const nav = useNavigation();
  const route = useRoute();
  const layout = useLayout();
  const contentMax = gameContentMax(layout);
  const { familyId, uid, members, isChild, isActingAsChild, meChild, activeChild, friendPeople } = useApp();
  const { effectiveFamilyId, setGameFamilyId } = useOnlineGameFamily(route, familyId);
  const { highChildFriendliness } = useThemeMeta();
  const simpleUi = highChildFriendliness;
  const boardHeight = layout.isDesktop ? 440 : layout.isTablet ? 380 : (simpleUi ? 320 : 280);

  const inviteGameId = route.params?.inviteGameId || null;
  const [view, setView] = useState('hub');
  const [gameId, setGameId] = useState(null);
  const [game, setGame] = useState(null);
  const [attempts, setAttempts] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [guessText, setGuessText] = useState('');
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });
  const liveTimer = useRef(null);
  const pendingLive = useRef(null);

  useOnlineInviteRoute(route, { setView, setGameId, uid, game });

  const myName = useMemo(() => {
    if (isChild || isActingAsChild) return (isChild ? meChild : activeChild)?.name || 'Spiller';
    return members.find((m) => m.uid === uid)?.name || 'Spiller';
  }, [members, uid, isChild, isActingAsChild, meChild, activeChild]);

  const inviteable = useMemo(
    () => members.filter((m) => (m.uid || m.id) && (m.uid || m.id) !== uid),
    [members, uid],
  );

  const asDrawer = !!(game && uid && game.drawerUid === uid);
  const invites = useMemo(() => inviteSummary(game, members), [game, members]);
  const myAttempts = useMemo(
    () => attempts.filter((a) => a.uid === uid && (a.round || 1) === (game?.round || 1)),
    [attempts, uid, game?.round],
  );
  const roundAttempts = useMemo(
    () => attempts.filter((a) => (a.round || 1) === (game?.round || 1)),
    [attempts, game?.round],
  );
  const won = game?.status === DRAW_STATUS.won;
  const iWon = won && game?.winnerUid === uid;
  const celeKey = won ? `draw-${gameId}-${game?.round}-${game?.winnerUid}` : null;
  const { celebrationVisible, celebrationKey, closeCelebration, resetCelebrationSeen } = useGameCelebration(won, celeKey);

  const pendingInvitesRaw = useMergedTypeGameInvites({
    familyId: effectiveFamilyId,
    uid,
    gameType: 'draw',
    listenFamilyPending: listenPendingDrawGuessInvites,
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
    return listenDrawGuessGame(effectiveFamilyId, gameId, setGame);
  }, [effectiveFamilyId, gameId]);

  useEffect(() => {
    if (!effectiveFamilyId || !gameId) return undefined;
    return listenDrawGuessAttempts(effectiveFamilyId, gameId, setAttempts);
  }, [effectiveFamilyId, gameId]);

  useEffect(() => () => {
    if (liveTimer.current) clearTimeout(liveTimer.current);
  }, []);

  const showInfo = useCallback((title, message) => {
    setInfo({ visible: true, title, message: String(message || '') });
  }, []);

  const toggleMember = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const respondInvite = useRespondGameInvite({
    uid, name: myName, gameType: 'draw', setGameFamilyId,
  });

  const createGame = useCallback(async () => {
    if (!effectiveFamilyId || !uid) return;
    try {
      setBusy(true);
      const { id } = await createDrawGuessGame(effectiveFamilyId, {
        uid, name: myName, invitedUids: selectedIds,
      });
      setSelectedIds([]);
      setGameId(id);
      setView('game');
      resetCelebrationSeen();
    } catch (e) {
      showInfo('Tegn og gjett', e?.message || 'Kunne ikke starte.');
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

  const flushLiveStroke = useCallback(async (stroke) => {
    if (!effectiveFamilyId || !gameId || !uid || !asDrawer) return;
    try {
      await publishLiveStroke(effectiveFamilyId, gameId, { uid, liveStroke: stroke });
    } catch {
      // Ignorer midlertidige sync-feil under tegning.
    }
  }, [effectiveFamilyId, gameId, uid, asDrawer]);

  const onLiveStrokeChange = useCallback((stroke) => {
    pendingLive.current = stroke;
    if (liveTimer.current) return;
    liveTimer.current = setTimeout(() => {
      liveTimer.current = null;
      flushLiveStroke(pendingLive.current);
    }, 140);
  }, [flushLiveStroke]);

  const onStrokesChange = useCallback(async (nextStrokes) => {
    if (!effectiveFamilyId || !gameId || !uid) return;
    if (liveTimer.current) {
      clearTimeout(liveTimer.current);
      liveTimer.current = null;
    }
    try {
      await publishDrawStrokes(effectiveFamilyId, gameId, {
        uid,
        strokes: nextStrokes,
        liveStroke: null,
      });
    } catch (e) {
      showInfo('Tegning', e?.message || 'Kunne ikke lagre streken.');
    }
  }, [effectiveFamilyId, gameId, uid, showInfo]);

  const onClear = useCallback(async () => {
    if (!effectiveFamilyId || !gameId || !uid) return;
    try {
      await clearDrawing(effectiveFamilyId, gameId, { uid });
    } catch (e) {
      showInfo('Tegning', e?.message || 'Kunne ikke slette.');
    }
  }, [effectiveFamilyId, gameId, uid, showInfo]);

  const onUndo = useCallback(async () => {
    if (!effectiveFamilyId || !gameId || !uid || !game) return;
    const next = (game.strokes || []).slice(0, -1);
    try {
      await publishDrawStrokes(effectiveFamilyId, gameId, { uid, strokes: next, liveStroke: null });
    } catch (e) {
      showInfo('Tegning', e?.message || 'Kunne ikke angre.');
    }
  }, [effectiveFamilyId, gameId, uid, game, showInfo]);

  const onReshuffle = useCallback(async () => {
    if (!effectiveFamilyId || !gameId || !uid) return;
    try {
      setBusy(true);
      await reshuffleWord(effectiveFamilyId, gameId, { uid });
    } catch (e) {
      showInfo('Bytt ord', e?.message || 'Kunne ikke bytte ord.');
    } finally {
      setBusy(false);
    }
  }, [effectiveFamilyId, gameId, uid, showInfo]);

  const guess = useCallback(async (value) => {
    if (!effectiveFamilyId || !gameId || !uid) return;
    const text = String(value || guessText || '').trim();
    if (!text) {
      showInfo('Gjett', 'Skriv eller velg hva du tror det er.');
      return;
    }
    try {
      setBusy(true);
      await submitDrawGuess(effectiveFamilyId, gameId, { uid, name: myName, guess: text });
      setGuessText('');
    } catch (e) {
      showInfo('Gjett', e?.message || 'Kunne ikke gjette.');
    } finally {
      setBusy(false);
    }
  }, [effectiveFamilyId, gameId, uid, myName, guessText, showInfo]);

  const styles = useMemo(
    () => makeStyles(simpleUi, contentMax, layout),
    [simpleUi, contentMax, layout],
  );

  if (view === 'game' && game) {
    const canGuess = !asDrawer
      && game.status !== DRAW_STATUS.won
      && game.status !== DRAW_STATUS.finished;
    const options = Array.isArray(game.options) ? game.options : [];

    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <TouchableOpacity
            style={styles.backRow}
            onPress={() => { setView('hub'); setGameId(null); setGame(null); }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.brand} />
            <Text style={styles.backTxt}>Nytt spill</Text>
          </TouchableOpacity>

          <GameHowTo
            title={ONLINE_GAME_GUIDES.draw.title}
            steps={ONLINE_GAME_GUIDES.draw.steps}
            simpleUi={simpleUi}
          />

          <Text style={styles.roundLabel}>Runde {game.round || 1}</Text>

          {asDrawer ? (
            <View style={styles.secretCard}>
              <Text style={styles.secretLabel}>Tegn dette (hemmelig):</Text>
              <Text style={[styles.secretWord, simpleUi && styles.secretWordSimple]}>
                {game.secret}
              </Text>
              {game.status === DRAW_STATUS.waiting ? (
                <Text style={styles.waitHint}>Venter på at noen godtar invitasjonen…</Text>
              ) : (
                <Text style={styles.waitHint}>Familien ser tegningen din og gjetter!</Text>
              )}
            </View>
          ) : (
            <Text style={styles.prompt}>
              {game.status === DRAW_STATUS.won
                ? (game.winnerUid === uid
                  ? `🎉 Du gjettet riktig — det var «${game.secret}»!`
                  : `🎉 ${game.winnerName} gjettet riktig — det var «${game.secret}»!`)
                : 'Hva tegner de? Gjett!'}
            </Text>
          )}

          <DrawingBoard
            strokes={game.strokes || []}
            liveStroke={game.liveStroke || null}
            editable={asDrawer && game.status !== DRAW_STATUS.finished && game.status !== DRAW_STATUS.won}
            color={penColor}
            onStrokesChange={onStrokesChange}
            onLiveStrokeChange={onLiveStrokeChange}
            height={boardHeight}
          />

          {asDrawer && game.status !== DRAW_STATUS.won && game.status !== DRAW_STATUS.finished ? (
            <View style={styles.tools}>
              <View style={styles.colorRow}>
                {PEN_COLORS.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.colorDot, { backgroundColor: c }, penColor === c && styles.colorDotOn]}
                    onPress={() => setPenColor(c)}
                    accessibilityLabel={`Farge ${c}`}
                  />
                ))}
              </View>
              <View style={styles.toolRow}>
                <TouchableOpacity style={styles.toolBtn} onPress={onUndo}>
                  <Ionicons name="arrow-undo" size={18} color={colors.ink} />
                  <Text style={styles.toolTxt}>Angre</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.toolBtn} onPress={onClear}>
                  <Ionicons name="trash-outline" size={18} color={colors.ink} />
                  <Text style={styles.toolTxt}>Slett</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.toolBtn} onPress={onReshuffle} disabled={busy}>
                  <Ionicons name="shuffle" size={18} color={colors.ink} />
                  <Text style={styles.toolTxt}>Bytt ord</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {canGuess ? (
            <View style={styles.guessBox}>
              {options.length ? (
                <>
                  <Text style={styles.section}>Velg hva det er</Text>
                  <View style={styles.optionGrid}>
                    {options.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[styles.optionBtn, simpleUi && styles.optionBtnSimple]}
                        onPress={() => guess(opt)}
                        disabled={busy}
                      >
                        <Text style={[styles.optionTxt, simpleUi && styles.optionTxtSimple]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              ) : null}
              <Text style={styles.section}>Eller skriv selv</Text>
              <View style={styles.guessRow}>
                <TextInput
                  style={[styles.guessInput, simpleUi && styles.guessInputSimple]}
                  value={guessText}
                  onChangeText={setGuessText}
                  placeholder="F.eks. katt"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={40}
                  onSubmitEditing={() => guess()}
                  returnKeyType="send"
                />
                <TouchableOpacity
                  style={[styles.guessBtn, busy && { opacity: 0.6 }]}
                  onPress={() => guess()}
                  disabled={busy}
                >
                  {busy ? <ActivityIndicator color="#fff" /> : (
                    <Text style={styles.guessBtnTxt}>Gjett</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {asDrawer ? (
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
              <Text style={styles.section}>Gjetninger</Text>
              {roundAttempts.length === 0 ? (
                <Text style={styles.empty}>Ingen har gjettet ennå…</Text>
              ) : (
                roundAttempts.map((a) => (
                  <View key={a.id} style={styles.attemptRow}>
                    <Text style={styles.attemptName}>{a.name}</Text>
                    <Text style={styles.attemptGuess}>{a.guess}</Text>
                    <Text style={[styles.attemptHint, a.correct && styles.attemptCorrect]}>
                      {a.correct ? 'riktig!' : 'prøv igjen'}
                    </Text>
                  </View>
                ))
              )}
            </View>
          ) : (
            <>
              <Text style={styles.section}>Dine forsøk</Text>
              {myAttempts.length === 0 ? (
                <Text style={styles.empty}>Ingen forsøk ennå</Text>
              ) : (
                myAttempts.map((a) => (
                  <Text key={a.id} style={styles.myAttempt}>
                    Du gjettet «{a.guess}» — {a.correct ? 'riktig!' : 'ikke riktig'}
                  </Text>
                ))
              )}
            </>
          )}

          {game.status === DRAW_STATUS.won && asDrawer ? (
            <TouchableOpacity
              style={styles.primary}
              onPress={() => startNextDrawRound(effectiveFamilyId, gameId, { uid }).catch((e) => {
                showInfo('Ny runde', e?.message || 'Kunne ikke starte.');
              })}
            >
              <Text style={styles.primaryTxt}>Ny runde</Text>
            </TouchableOpacity>
          ) : null}

          {asDrawer ? (
            <TouchableOpacity
              style={styles.dangerLink}
              onPress={() => endDrawGuessGame(effectiveFamilyId, gameId).catch(() => {})}
            >
              <Text style={styles.dangerTxt}>Avslutt spill</Text>
            </TouchableOpacity>
          ) : null}
        </ScrollView>
        <GameWinCelebration
          visible={celebrationVisible}
          triggerKey={celebrationKey}
          title={iWon ? 'Du gjettet riktig!' : `${game.winnerName} gjettet riktig!`}
          subtitle={`Ordet var «${game.secret}»`}
          actionLabel={asDrawer ? 'Ny runde' : undefined}
          onAction={asDrawer ? () => {
            startNextDrawRound(effectiveFamilyId, gameId, { uid }).catch((e) => {
              showInfo('Ny runde', e?.message || 'Kunne ikke starte.');
            });
            resetCelebrationSeen();
          } : undefined}
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
          title={ONLINE_GAME_GUIDES.draw.title}
          steps={ONLINE_GAME_GUIDES.draw.steps}
          defaultOpen
          simpleUi={simpleUi}
        />
        <GameInvitePanel
          title="Tegn og gjett"
          description="Du får et hemmelig ord, tegner det, og familien gjetter hva det er. Perfekt for barn!"
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
          createLabel="Start tegnespill"
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
    roundLabel: {
      alignSelf: 'center', color: colors.muted, fontWeight: '700', fontSize: 12,
      textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
    },
    secretCard: {
      backgroundColor: colors.brandSoft, borderRadius: 14, padding: 14, marginBottom: 12,
      borderWidth: 1, borderColor: colors.brand, alignItems: 'center',
    },
    secretLabel: { color: colors.muted, fontWeight: '600', fontSize: 13 },
    secretWord: {
      color: colors.ink, fontWeight: '800', fontSize: 28, marginTop: 4, textTransform: 'capitalize',
    },
    secretWordSimple: { fontSize: 34 },
    waitHint: { color: colors.muted, fontWeight: '500', marginTop: 6, textAlign: 'center' },
    prompt: {
      textAlign: 'center', fontWeight: '800', fontSize: simpleUi ? 22 : 18,
      color: colors.ink, marginBottom: 12,
    },
    tools: { marginTop: 10, gap: 10 },
    colorRow: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
    colorDot: {
      width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: '#fff',
      shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 2, elevation: 2,
    },
    colorDotOn: { borderColor: colors.ink, transform: [{ scale: 1.12 }] },
    toolRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, flexWrap: 'wrap' },
    toolBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: colors.card, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
      borderWidth: 1, borderColor: colors.line,
    },
    toolTxt: { fontWeight: '600', color: colors.ink, fontSize: 13 },
    guessBox: { marginTop: 12 },
    section: {
      marginTop: 14, marginBottom: 6, color: colors.muted, fontWeight: '600',
      fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4,
    },
    optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    optionBtn: {
      backgroundColor: colors.card, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14,
      borderWidth: 2, borderColor: colors.line, minWidth: '46%', flexGrow: 1, alignItems: 'center',
    },
    optionBtnSimple: { borderRadius: 16, borderColor: colors.brand, paddingVertical: 16 },
    optionTxt: { fontWeight: '700', color: colors.ink, fontSize: 16, textTransform: 'capitalize' },
    optionTxtSimple: { fontSize: 20 },
    guessRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    guessInput: {
      flex: 1, backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line,
      paddingHorizontal: 12, paddingVertical: 12, fontSize: 16, color: colors.ink, fontWeight: '600',
    },
    guessInputSimple: { borderRadius: 16, borderWidth: 2, paddingVertical: 14, fontSize: 18 },
    guessBtn: {
      backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12,
      minWidth: 80, alignItems: 'center',
    },
    guessBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
    inviteBoard: {
      backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line,
      padding: 8, marginTop: 8,
    },
    inviteRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingVertical: 8, paddingHorizontal: 6,
    },
    inviteName: { fontWeight: '600', color: colors.ink },
    inviteStatus: { fontWeight: '600', color: colors.muted },
    attemptRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.bg, borderRadius: 10, padding: 10, marginBottom: 6,
    },
    attemptName: { flex: 1, fontWeight: '600', color: colors.ink },
    attemptGuess: { fontWeight: '700', color: colors.ink, textTransform: 'capitalize' },
    attemptHint: { fontWeight: '700', color: colors.muted, minWidth: 72, textAlign: 'right' },
    attemptCorrect: { color: colors.success },
    myAttempt: { fontWeight: '600', color: colors.ink, marginBottom: 4 },
    empty: { color: colors.muted, textAlign: 'center', padding: 12 },
    primary: {
      backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 14,
      alignItems: 'center', marginTop: 16,
    },
    primaryTxt: { color: '#fff', fontWeight: '800', fontSize: 16 },
    dangerLink: { alignItems: 'center', paddingVertical: 14 },
    dangerTxt: { color: '#b91c1c', fontWeight: '600' },
  });
}
