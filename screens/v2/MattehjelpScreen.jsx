/**
 * Lær skole — frivillig trening med spill, oppdrag og AI-los (3–16 år).
 * Skilt fra Leksehjelpen (ekte lekser). Norsk pedagogikk (LK20, hint først).
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { useLayout } from '../../src/theme';
import { Screen } from '../../components/ui';
import SchoolPageLayout from '../../components/SchoolPageLayout';
import ModuleIntroHost from '../../components/ModuleIntroHost';
import PlayRound from '../../components/mattehjelp/PlayRound';
import MissionCelebration from '../../components/mattehjelp/MissionCelebration';
import TutorPencilBoard from '../../components/leksehjelp/TutorPencilBoard';
import TutorPraise from '../../components/leksehjelp/TutorPraise';
import MathText from '../../components/leksehjelp/MathText';
import { profileAge } from '../../src/utils/age';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import {
  AGE_WORLDS, SUBJECTS, worldForAge, modesForWorld, subjectMeta,
} from '../../src/utils/mattehjelp/worlds';
import { topicsFor, topicById } from '../../src/utils/mattehjelp/curriculum';
import { buildMission, aiMissionPrompt } from '../../src/utils/mattehjelp/gameEngine';
import {
  loadMattehjelpSummary, recordMattehjelpProgress, bumpLocalStars,
} from '../../src/utils/mattehjelp/progress';
import { askLeksehjelp } from '../../src/utils/leksehjelp';
import { pickPraise } from '../../src/utils/leksehjelp/pedagogy';

export default function MattehjelpScreen() {
  useChildAppGuard('mattehjelp');
  const nav = useNavigation();
  const route = useRoute();
  const colors = useColors();
  const { isPhone } = useLayout();
  const {
    familyId: ctxFamilyId, isChild, isActingAsChild,
    meChild, activeChild, kids,
  } = useApp();

  const familyId = route.params?.familyId || ctxFamilyId;
  const routeChildId = route.params?.childId || null;
  const routeChild = route.params?.child
    || (routeChildId && Array.isArray(kids)
      ? kids.find((k) => k.id === routeChildId || k.uid === routeChildId)
      : null)
    || null;
  const profileChild = routeChild
    || (isChild ? meChild : (isActingAsChild ? activeChild : null));
  const child = profileChild;
  const childId = child?.id || child?.childId;
  const childName = child?.name?.split(' ')[0] || 'deg';
  const childAge = profileAge(child) ?? 8;

  const defaultWorld = worldForAge(childAge);
  const [worldId, setWorldId] = useState(defaultWorld.id);
  const [subjectId, setSubjectId] = useState('matematikk');
  const [phase, setPhase] = useState('hub'); // hub | play | ai | done
  const [mode, setMode] = useState(null);
  const [mission, setMission] = useState(null);
  const [roundIdx, setRoundIdx] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [stars, setStars] = useState(0);
  const [localStars, setLocalStars] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [aiMessages, setAiMessages] = useState([]);
  const [aiTutor, setAiTutor] = useState(null);
  const [aiInput, setAiInput] = useState('');
  const [hintLevel, setHintLevel] = useState(0);
  const [attemptCount, setAttemptCount] = useState(0);

  const styles = useMemo(() => makeStyles(colors, isPhone), [colors, isPhone]);
  const world = AGE_WORLDS.find((w) => w.id === worldId) || defaultWorld;
  const modes = modesForWorld(worldId);
  const topics = topicsFor({ worldId, subjectId });
  const subject = subjectMeta(subjectId);
  const currentRound = mission?.rounds?.[roundIdx] || null;

  useEffect(() => {
    setWorldId(worldForAge(childAge).id);
  }, [childAge]);

  useEffect(() => {
    if (!familyId || !childId) return undefined;
    let cancelled = false;
    loadMattehjelpSummary(familyId, childId).then((s) => {
      if (!cancelled && s?.stars != null) setLocalStars(Number(s.stars) || 0);
    });
    return () => { cancelled = true; };
  }, [familyId, childId]);

  const startPlay = useCallback((playMode, topicOverride = null) => {
    setError('');
    setMode(playMode);
    const topic = topicOverride || topics[0] || topicById('count-1-5');
    if (playMode === 'ai-los') {
      setPhase('ai');
      setAiMessages([]);
      setAiTutor(null);
      setAiInput('');
      setHintLevel(0);
      setAttemptCount(0);
      setBusy(true);
      const prompt = aiMissionPrompt(topic, childAge);
      askLeksehjelp({
        familyId,
        childId,
        childName,
        childAge,
        subject: topic.subject,
        message: prompt,
        action: 'start',
        allowFasit: child?.leksehjelpAllowFasit !== false,
        attemptCount: 0,
      }).then((res) => {
        setAiTutor(res);
        setAiMessages([
          { id: 'u1', role: 'user', text: `Oppdrag: ${topic.title}` },
          { id: 'a1', role: 'assistant', text: res?.reply || res?.message || 'La oss starte — jeg gir deg et hint først.' },
        ]);
      }).catch((err) => {
        setError(err?.message || 'Kunne ikke starte AI-losen. Prøv et spill i stedet.');
        setPhase('hub');
      }).finally(() => setBusy(false));
      return;
    }

    const difficulty = worldId === 'smaatroll' ? 1 : worldId === 'oppdagere' ? 2 : 3;
    const rounds = playMode === 'oppdrag' ? 5 : 4;
    const m = buildMission({ topic, rounds, difficulty });
    setMission(m);
    setRoundIdx(0);
    setCorrectCount(0);
    setStars(0);
    setPhase('play');
  }, [topics, childAge, familyId, childId, childName, child, worldId]);

  const finishMission = useCallback(async (correct, total, earnedStars) => {
    setStars(earnedStars);
    setCelebrate(true);
    setLocalStars((s) => bumpLocalStars(s, earnedStars));
    await recordMattehjelpProgress({
      familyId,
      childId,
      topicId: mission?.topicId,
      skill: topicById(mission?.topicId)?.skill,
      subject: mission?.subject || subjectId,
      starsEarned: earnedStars,
      correct: correct > 0,
      mode: mode || 'lek',
    });
  }, [familyId, childId, mission, subjectId, mode]);

  const onRoundAnswer = useCallback((ok) => {
    const nextCorrect = correctCount + (ok ? 1 : 0);
    setCorrectCount(nextCorrect);
    const nextIdx = roundIdx + 1;
    if (nextIdx >= (mission?.rounds?.length || 0)) {
      const earned = Math.max(1, Math.min(5, nextCorrect + (ok ? 1 : 0)));
      finishMission(nextCorrect, mission.rounds.length, earned);
      setPhase('done');
      return;
    }
    setRoundIdx(nextIdx);
  }, [correctCount, roundIdx, mission, finishMission]);

  const sendAi = async (text, action = 'reply') => {
    if (!familyId || !childId || busy) return;
    const msg = String(text || '').trim();
    if (action === 'reply' && !msg) return;
    setBusy(true);
    setError('');
    if (msg) setAiMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', text: msg }]);
    setAiInput('');
    try {
      const nextAttempts = action === 'reply' ? attemptCount + 1 : attemptCount;
      const nextHints = action === 'hint' || action === 'stuck' ? hintLevel + 1 : hintLevel;
      const res = await askLeksehjelp({
        familyId,
        childId,
        childName,
        childAge,
        subject: subjectId,
        message: msg,
        action,
        hintLevel: nextHints,
        history: aiMessages.map((m) => ({ role: m.role, text: m.text })),
        allowFasit: child?.leksehjelpAllowFasit !== false,
        attemptCount: nextAttempts,
      });
      setAttemptCount(nextAttempts);
      setHintLevel(nextHints);
      setAiTutor(res);
      setAiMessages((m) => [
        ...m,
        { id: `a${Date.now()}`, role: 'assistant', text: res?.reply || res?.message || '…' },
      ]);
      if (res?.missionAccomplished || res?.studentLooksCorrect) {
        const earned = 3;
        setStars(earned);
        setLocalStars((s) => bumpLocalStars(s, earned));
        await recordMattehjelpProgress({
          familyId, childId, subject: subjectId, starsEarned: earned, correct: true, mode: 'ai-los',
        });
        setCelebrate(true);
      }
    } catch (err) {
      setError(err?.message || 'Noe gikk galt');
    } finally {
      setBusy(false);
    }
  };

  const backToHub = () => {
    setPhase('hub');
    setMission(null);
    setCelebrate(false);
    setMode(null);
    setAiTutor(null);
    setAiMessages([]);
  };

  const hub = (
    <View style={styles.hub}>
      <View style={styles.welcomeRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.welcomeTitle}>Hei {childName}!</Text>
          <Text style={styles.welcomeLead}>Velg alder og fag, så starter du øvingen.</Text>
        </View>
        <View style={styles.starBadge} accessibilityLabel={`${localStars} stjerner`}>
          <Ionicons name="star" size={16} color="#f59e0b" />
          <Text style={styles.starBadgeTxt}>{localStars}</Text>
        </View>
      </View>

      <Text style={styles.stepLabel}>1. Din alder</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ageRow}>
        {AGE_WORLDS.map((w) => {
          const on = worldId === w.id;
          return (
            <TouchableOpacity
              key={w.id}
              style={[
                styles.ageChip,
                { backgroundColor: on ? w.accent : w.tint, borderColor: on ? w.accent : colors.line },
              ]}
              onPress={() => setWorldId(w.id)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${w.label}, ${w.ageMin} til ${w.ageMax} år`}
            >
              <Text style={[styles.ageChipYears, on && styles.ageChipOn]}>
                {w.ageMin}–{w.ageMax} år
              </Text>
              <Text style={[styles.ageChipLabel, on && styles.ageChipOn]} numberOfLines={1}>
                {w.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
      <Text style={styles.worldHint}>{world.blurb}</Text>

      <Text style={styles.stepLabel}>2. Fag</Text>
      <View style={styles.subjectRow}>
        {SUBJECTS.map((s) => {
          const on = subjectId === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.subjectChip, on && { backgroundColor: s.tint, borderColor: s.accent }]}
              onPress={() => setSubjectId(s.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Ionicons name={s.icon} size={16} color={on ? s.accent : colors.muted} />
              <Text style={[styles.subjectTxt, on && { color: s.accent }]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.stepLabel}>3. Start øving</Text>
      {modes.map((m) => (
        <TouchableOpacity
          key={m.id}
          style={styles.modeCard}
          onPress={() => startPlay(m.id)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`Start ${m.label}`}
        >
          <View style={[styles.modeIcon, { backgroundColor: subject.tint }]}>
            <Ionicons name={m.icon} size={22} color={subject.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeTitle}>{m.label}</Text>
            <Text style={styles.modeBlurb}>{m.blurb}</Text>
          </View>
          <Ionicons name="play-circle" size={28} color={subject.accent} />
        </TouchableOpacity>
      ))}

      <Text style={styles.stepLabel}>Eller velg et tema</Text>
      {topics.length === 0 ? (
        <Text style={styles.empty}>Ingen temaer her ennå — bytt alder eller fag.</Text>
      ) : topics.map((t) => (
        <TouchableOpacity
          key={t.id}
          style={styles.topicRow}
          onPress={() => startPlay(t.gameTypes?.includes('ai') && worldId !== 'smaatroll' ? 'ai-los' : 'lek', t)}
          accessibilityRole="button"
          accessibilityLabel={`Start tema ${t.title}`}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.topicTitle}>{t.title}</Text>
            <Text style={styles.topicGoal} numberOfLines={2}>{t.goal}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </TouchableOpacity>
      ))}

      <View style={styles.tipBox}>
        <Ionicons name="bulb-outline" size={16} color={colors.brand} />
        <Text style={styles.tipTxt}>
          Hint først, fasit sist. Du får stjerner når du øver — jo mer du øver, jo mer mestrer du.
        </Text>
      </View>

      <TouchableOpacity
        style={styles.linkLekse}
        onPress={() => nav.navigate('Leksehjelp', { child, familyId })}
        accessibilityRole="button"
        accessibilityLabel="Åpne Leksehjelpen for ekte lekser"
      >
        <Ionicons name="chatbubble-ellipses-outline" size={16} color={colors.brand} />
        <Text style={styles.linkLekseTxt}>Har du ekte lekser? Åpne Leksehjelpen →</Text>
      </TouchableOpacity>
    </View>
  );

  const playView = (
    <View style={styles.playShell}>
      <View style={styles.playTop}>
        <TouchableOpacity onPress={backToHub} style={styles.backBtn} hitSlop={10}>
          <Ionicons name="arrow-back" size={20} color={colors.ink} />
          <Text style={styles.backTxt}>Hub</Text>
        </TouchableOpacity>
        <Text style={styles.progressTxt}>
          {mission?.title} · {roundIdx + 1}/{mission?.rounds?.length || 0}
        </Text>
      </View>
      <PlayRound
        round={currentRound}
        accent={subject.accent}
        onAnswer={onRoundAnswer}
      />
    </View>
  );

  const aiView = (
    <ScrollView contentContainerStyle={styles.aiBody} keyboardShouldPersistTaps="handled">
      <View style={styles.playTop}>
        <TouchableOpacity onPress={backToHub} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={20} color={colors.ink} />
          <Text style={styles.backTxt}>Hub</Text>
        </TouchableOpacity>
        <Text style={styles.progressTxt}>AI-losen</Text>
      </View>
      {busy && !aiMessages.length ? <ActivityIndicator color={colors.brand} /> : null}
      {aiTutor?.boardSteps?.length ? (
        <TutorPencilBoard
          lines={aiTutor.boardSteps}
          visibleCount={aiTutor.boardVisible}
          accent={colors.brand}
          title="Blyanttavlen"
        />
      ) : null}
      {aiMessages.map((m) => (
        <View
          key={m.id}
          style={[styles.bubble, m.role === 'user' ? styles.bubbleMe : styles.bubbleAi]}
        >
          <MathText style={[styles.bubbleTxt, m.role === 'user' && { color: '#fff' }]}>
            {m.text}
          </MathText>
        </View>
      ))}
      <TutorPraise
        visible={!!aiTutor?.studentLooksCorrect}
        message={aiTutor?.encouragement || pickPraise(attemptCount)}
        seed={attemptCount}
        tone="progress"
      />
      {!!error && <Text style={styles.err}>{error}</Text>}
      <View style={styles.aiActions}>
        <TouchableOpacity style={styles.aiChip} onPress={() => sendAi('', 'hint')} disabled={busy}>
          <Text style={styles.aiChipTxt}>Hint</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.aiChip} onPress={() => sendAi('', 'stuck')} disabled={busy}>
          <Text style={styles.aiChipTxt}>Jeg står fast</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.composer}>
        <TouchableOpacity
          style={[styles.sendBtn, { flex: 1 }]}
          onPress={() => sendAi(aiInput || 'Jeg tror jeg har svaret — sjekk om jeg er på rett vei', 'reply')}
          disabled={busy}
        >
          <Text style={styles.sendTxt}>{busy ? 'Tenker…' : 'Send svar / tanke'}</Text>
        </TouchableOpacity>
      </View>
      {/* Simple input via quick prompts for younger; older can use Leksehjelp */}
      <View style={styles.quickPrompts}>
        {['Er dette riktig tenkt?', 'Forklar med et eksempel', 'Gi meg et lettere steg'].map((q) => (
          <TouchableOpacity key={q} style={styles.quick} onPress={() => sendAi(q, 'reply')} disabled={busy}>
            <Text style={styles.quickTxt}>{q}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );

  return (
    <Screen>
      <SchoolPageLayout
        activeId="mattehjelp"
        child={child}
        familyId={familyId}
        aiEnabled={child?.aiEnabled !== false}
        scroll={phase === 'hub'}
        compact={phase !== 'hub'}
      >
        {phase === 'hub' ? hub : null}
        {phase === 'play' || phase === 'done' ? playView : null}
        {phase === 'ai' ? aiView : null}
      </SchoolPageLayout>

      <MissionCelebration
        visible={celebrate}
        stars={stars}
        correct={correctCount}
        total={mission?.rounds?.length || 0}
        onContinue={backToHub}
        onClose={backToHub}
      />
      <ModuleIntroHost scope="family" moduleId="mattehjelp" />
    </Screen>
  );
}

function makeStyles(colors, isPhone) {
  return StyleSheet.create({
    hub: { paddingBottom: 24, gap: 6 },
    welcomeRow: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      marginBottom: 6, paddingVertical: 2,
    },
    welcomeTitle: {
      fontSize: isPhone ? 20 : 24, fontWeight: '400', color: colors.ink,
    },
    welcomeLead: {
      fontSize: 13, color: colors.muted, marginTop: 2, lineHeight: 18,
    },
    starBadge: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      backgroundColor: '#fff', paddingHorizontal: 10, paddingVertical: 6,
      borderRadius: 999, borderWidth: 1, borderColor: colors.line,
    },
    starBadgeTxt: { fontWeight: '400', color: colors.ink },
    stepLabel: {
      fontWeight: '400', fontSize: 13, color: colors.ink,
      marginTop: 10, marginBottom: 6, letterSpacing: 0.2,
    },
    ageRow: { gap: 8, paddingRight: 8, paddingBottom: 2 },
    ageChip: {
      minWidth: 88, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12,
      borderWidth: 1, gap: 2,
    },
    ageChipYears: { fontSize: 12, fontWeight: '400', color: colors.ink },
    ageChipLabel: { fontSize: 12, fontWeight: '400', color: colors.muted },
    ageChipOn: { color: '#fff' },
    worldHint: {
      fontSize: 12, color: colors.muted, lineHeight: 16, marginTop: 4, marginBottom: 2,
    },
    subjectRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    subjectChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
      borderWidth: 1, borderColor: colors.line, backgroundColor: '#fff',
    },
    subjectTxt: { fontWeight: '400', fontSize: 13, color: colors.ink },
    modeCard: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: '#fff', borderRadius: 14, padding: 12,
      borderWidth: 1, borderColor: colors.line, marginBottom: 6,
    },
    modeIcon: {
      width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    },
    modeTitle: { fontWeight: '400', fontSize: 15, color: colors.ink },
    modeBlurb: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 16 },
    topicRow: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12,
      borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card || '#fff',
      marginBottom: 6,
    },
    topicTitle: { fontWeight: '400', fontSize: 14, color: colors.ink },
    topicGoal: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 16 },
    empty: { color: colors.muted, fontSize: 13, marginBottom: 4 },
    tipBox: {
      flexDirection: 'row', alignItems: 'flex-start', gap: 8,
      marginTop: 10, backgroundColor: colors.successSoft || '#ecfdf5',
      borderRadius: 12, padding: 12,
    },
    tipTxt: { flex: 1, fontSize: 13, color: colors.ink, lineHeight: 18, fontWeight: '500' },
    linkLekse: {
      marginTop: 8, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8,
    },
    linkLekseTxt: { color: colors.brand, fontWeight: '400', fontSize: 13, flex: 1 },
    playShell: { flex: 1, gap: 8 },
    playTop: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8,
    },
    backBtn: {
      alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4 },
    backTxt: { fontWeight: '400', color: colors.ink },
    progressTxt: { fontWeight: '400', color: colors.muted, fontSize: 13 },
    aiBody: { paddingBottom: 40, gap: 8 },
    bubble: {
      borderRadius: 14, padding: 12, marginBottom: 6, maxWidth: '92%',
    },
    bubbleMe: { backgroundColor: colors.brand, alignSelf: 'flex-end' },
    bubbleAi: {
      backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, alignSelf: 'flex-start',
    },
    bubbleTxt: { fontSize: 15, color: colors.ink, lineHeight: 21 },
    aiActions: { flexDirection: 'row', gap: 8, marginTop: 8 },
    aiChip: {
      paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
      backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.brand,
    },
    aiChipTxt: { color: colors.brand, fontWeight: '400' },
    composer: { marginTop: 10 },
    sendBtn: {
      alignSelf: 'flex-start',
      backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center',
    },
    sendTxt: { color: '#fff', fontWeight: '400' },
    quickPrompts: { gap: 6, marginTop: 10 },
    quick: {
      padding: 12, borderRadius: 12, backgroundColor: '#fff',
      borderWidth: 1, borderColor: colors.line,
    },
    quickTxt: { fontWeight: '400', color: colors.ink, fontSize: 13 },
    err: { color: '#dc2626', fontWeight: '400', marginTop: 8 },
  });
}
