import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Image,
  ActivityIndicator, KeyboardAvoidingView, Platform, Modal, Pressable,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { radius, useLayout } from '../../src/theme';
import { Screen } from '../../components/ui';
import SchoolPageLayout from '../../components/SchoolPageLayout';
import { profileAge } from '../../src/utils/age';
import {
  SUBJECTS, DIFFICULTY_LABELS, askLeksehjelp, pickHomeworkImage, prepareHomeworkImage,
} from '../../src/utils/leksehjelp';
import {
  homeworkHelpPrompt, listenChildHomework, isHomeworkDone, subjectMeta,
} from '../../src/utils/homework';
import { dateKey } from '../../src/utils/dates';
import {
  canRequestFasit, fasitLockedReason, pickPraise,
} from '../../src/utils/leksehjelp/pedagogy';
import {
  SUBJECT_THEMES,
  missionsForSubject,
} from '../../src/utils/leksehjelp/practiceMissions';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import ModuleIntroHost from '../../components/ModuleIntroHost';
import MathText from '../../components/leksehjelp/MathText';
import TutorPencilBoard from '../../components/leksehjelp/TutorPencilBoard';
import TutorPraise from '../../components/leksehjelp/TutorPraise';

function StepRail({ steps, colors }) {
  if (!steps?.length) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepRail}>
      {steps.map((s, i) => {
        const done = s.status === 'done';
        const cur = s.status === 'current';
        return (
          <View
            key={s.id || i}
            style={[
              styles.stepPill,
              done && { backgroundColor: colors.successSoft, borderColor: colors.success },
              cur && { backgroundColor: colors.brandSoft, borderColor: colors.brand },
            ]}
          >
            <View style={[
              styles.stepDot,
              done && { backgroundColor: colors.success },
              cur && { backgroundColor: colors.brand },
            ]}
            >
              {done ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : (
                <Text style={styles.stepDotTxt}>{i + 1}</Text>
              )}
            </View>
            <Text
              style={[styles.stepTitle, cur && { color: colors.brand, fontWeight: '400' }]}
              numberOfLines={1}
            >
              {s.title}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

function Bubble({ role, text, colors }) {
  const mine = role === 'user';
  return (
    <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
      {!mine && (
        <View style={[styles.avatar, { backgroundColor: colors.brandSoft }]}>
          <Ionicons name="school" size={16} color={colors.brand} />
        </View>
      )}
      <View style={[
        styles.bubble,
        mine
          ? { backgroundColor: colors.brand, borderBottomRightRadius: 6 }
          : { backgroundColor: '#fff', borderColor: colors.line, borderWidth: 1, borderBottomLeftRadius: 6 },
      ]}
      >
        <MathText
          style={[styles.bubbleTxt, mine && { color: '#fff' }]}
          accentColor={mine ? '#fde68a' : '#b45309'}
        >
          {text}
        </MathText>
      </View>
    </View>
  );
}

export default function LeksehjelpScreen() {
  useChildAppGuard('leksehjelp');
  const nav = useNavigation();
  const route = useRoute();
  const colors = useColors();
  const { isDesktop, isPhone } = useLayout();
  // Standard: 4 rader. Feltet vokser når eleven skriver mer.
  const inputLineH = isPhone ? 26 : 22;
  const inputPadV = 28; // paddingTop + paddingBottom
  const inputMinH = inputLineH * 4 + inputPadV;
  const [inputHeight, setInputHeight] = useState(inputMinH);
  const {
    familyId: ctxFamilyId, uid, isChild, isParent, isActingAsChild,
    meChild, activeChild, kids,
  } = useApp();

  const familyId = route.params?.familyId || ctxFamilyId;

  const routeChild = route.params?.child || null;
  const profileChild = routeChild
    || (isChild ? meChild : (isActingAsChild ? activeChild : null));
  const childId = profileChild?.id || profileChild?.childId;
  const childName = profileChild?.name?.split(' ')[0] || 'deg';
  const childAge = profileAge(profileChild);

  const incomingHomework = route.params?.homework || null;

  const [phase, setPhase] = useState('start'); // start | session
  const [subject, setSubject] = useState(incomingHomework?.subject || null);
  const [input, setInput] = useState(incomingHomework ? homeworkHelpPrompt(incomingHomework) : '');
  const [imageUri, setImageUri] = useState(null);
  const [imagePayload, setImagePayload] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState([]);
  const [tutor, setTutor] = useState(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [childPickOpen, setChildPickOpen] = useState(false);
  const [pickedChild, setPickedChild] = useState(profileChild);
  const [openHomework, setOpenHomework] = useState([]);
  const [attemptCount, setAttemptCount] = useState(0);
  const [praiseSeed, setPraiseSeed] = useState(0);
  const hintLevelRef = useRef(0);

  const homeworkKey = incomingHomework
    ? `${incomingHomework.id || ''}:${incomingHomework.title || ''}`
    : '';
  useEffect(() => {
    if (!incomingHomework) return;
    if (incomingHomework.subject) setSubject(incomingHomework.subject);
    setInput(homeworkHelpPrompt(incomingHomework));
    const img = (incomingHomework.attachments || []).find((a) => a?.storagePath || a?.url);
    if (img?.url) setImageUri(img.url);
    if (img?.storagePath) setImagePayload({ storagePath: img.storagePath, imageBase64: null });
  }, [homeworkKey]);

  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false),
    [kids],
  );

  const effectiveChild = pickedChild || profileChild;
  const effectiveChildId = effectiveChild?.id || effectiveChild?.childId;
  const allowFasit = effectiveChild?.leksehjelpAllowFasit !== false;
  const needChildPick = !effectiveChildId && isParent && !isActingAsChild;

  useEffect(() => {
    if (profileChild) setPickedChild(profileChild);
  }, [profileChild]);

  useEffect(() => {
    if (!familyId || !effectiveChildId) {
      setOpenHomework([]);
      return undefined;
    }
    const today = dateKey(new Date());
    return listenChildHomework(familyId, effectiveChildId, (items) => {
      const open = (items || [])
        .filter((h) => !isHomeworkDone(h, today))
        .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')))
        .slice(0, 6);
      setOpenHomework(open);
    });
  }, [familyId, effectiveChildId]);

  useEffect(() => {
    setInputHeight((h) => Math.max(inputMinH, h));
  }, [inputMinH]);

  // Tilbakestill til 4 rader når feltet tømmes
  useEffect(() => {
    if (!String(input || '').trim()) setInputHeight(inputMinH);
  }, [input, inputMinH]);

  const stylesDyn = useMemo(
    () => makeStyles(colors, { isPhone, inputMinH }),
    [colors, isPhone, inputMinH],
  );

  const fasitReady = canRequestFasit({
    allowFasit,
    attemptCount,
    hintLevel: hintLevelRef.current,
    missionAccomplished: !!tutor?.missionAccomplished,
  });
  const fasitHint = fasitLockedReason({
    allowFasit,
    attemptCount,
    hintLevel: hintLevelRef.current,
  });

  const appendAssistantReply = useCallback((data) => {
    const parts = [];
    if (data?.message) parts.push(String(data.message).trim());
    if (data?.questionToStudent) {
      parts.push(`❓ ${String(data.questionToStudent).trim()}`);
    }
    if (data?.conceptTip) {
      parts.push(`💡 ${String(data.conceptTip).trim()}`);
    }
    if (data?.finalAnswer) {
      parts.push(`✅ Fasit:\n${String(data.finalAnswer).trim()}`);
    }
    if (data?.safetyRedirect) {
      parts.push('Dette er noe en voksen bør hjelpe deg med. Snakk med mamma, pappa eller en annen trygg voksen.');
    }
    if (!parts.length) return;
    setMessages((prev) => [...prev, {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role: 'assistant',
      text: parts.join('\n\n'),
    }]);
  }, []);

  const appendLocal = useCallback((role, text) => {
    setMessages((prev) => [...prev, {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      role,
      text,
    }]);
  }, []);

  const historyForApi = useCallback(() => (
    messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, text: m.text }))
  ), [messages]);

  const callTutor = useCallback(async ({
    action, message, withImage = false, revealRequested = false, nextAttempts,
  }) => {
    if (!familyId || !effectiveChildId) {
      setError('Velg et barn først.');
      return null;
    }
    setBusy(true);
    setError('');
    try {
      const hist = historyForApi();
      if (message) {
        hist.push({ role: 'user', text: message });
      }
      const attempts = nextAttempts != null ? nextAttempts : attemptCount;
      const payload = {
        familyId,
        childId: effectiveChildId,
        childName: effectiveChild?.name || childName,
        childAge,
        subject,
        message: message || '',
        action,
        hintLevel: hintLevelRef.current,
        history: hist.slice(-10),
        revealRequested,
        allowFasit,
        attemptCount: attempts,
        storagePath: withImage ? imagePayload?.storagePath : null,
        imageBase64: withImage ? imagePayload?.imageBase64 : null,
      };
      const data = await askLeksehjelp(payload);
      hintLevelRef.current = Number(data?.hintLevel) || hintLevelRef.current;
      setTutor(data);
      appendAssistantReply(data);
      if (data?.studentLooksCorrect || data?.missionAccomplished) {
        setPraiseSeed((s) => s + 1);
      }
      return data;
    } catch (e) {
      const raw = String(e?.message || e?.code || '');
      const cleaned = raw.replace(/^Firebase:\s*/i, '').replace(/\s*\(.*\)\s*$/, '').trim();
      const timedOut = /deadline-exceeded|timeout|tid|tok for lang/i.test(`${raw} ${e?.code || ''}`);
      setError(
        timedOut
          ? 'Det tok for lang tid. Prøv igjen — skriv oppgaven tydelig (f.eks. 324 × 9 eller 5^2), så tegner vi stegene.'
          : (cleaned || 'Noe gikk galt. Prøv igjen.'),
      );
      return null;
    } finally {
      setBusy(false);
    }
  }, [
    familyId, effectiveChildId, effectiveChild, childName, childAge, subject,
    historyForApi, imagePayload, appendAssistantReply, allowFasit, attemptCount,
  ]);

  const onPickImage = async (camera) => {
    try {
      setError('');
      const picked = await pickHomeworkImage({ camera });
      if (!picked?.blob && !picked?.uri) return;
      setImageUri(picked.uri || null);
      if (!familyId || !uid) {
        setError('Du må være innlogget.');
        return;
      }
      setBusy(true);
      const uploaded = await prepareHomeworkImage(familyId, uid, picked.blob);
      setImagePayload(uploaded);
    } catch (e) {
      setError(e?.message || 'Klarte ikke hente bilde.');
    } finally {
      setBusy(false);
    }
  };

  const pickListedHomework = (item) => {
    if (!item) return;
    setSubject(item.subject || subject);
    setInput(homeworkHelpPrompt(item));
    const img = (item.attachments || []).find((a) => a?.storagePath || a?.url);
    if (img?.url) setImageUri(img.url);
    if (img?.storagePath) setImagePayload({ storagePath: img.storagePath, imageBase64: null });
    else if (!img?.url) {
      setImageUri(null);
      setImagePayload(null);
    }
  };

  const startSession = async () => {
    if (needChildPick) {
      setChildPickOpen(true);
      return;
    }
    if (!subject && !input.trim() && !imagePayload) {
      setError('Velg fag, skriv oppgaven, eller ta bilde.');
      return;
    }
    setPhase('session');
    setMessages([]);
    setAttemptCount(0);
    hintLevelRef.current = 0;
    const starter = input.trim() || (imagePayload ? 'Kan du hjelpe meg med oppgaven på bildet?' : `Jeg trenger hjelp i ${subject || 'lekser'}.`);
    if (input.trim()) appendLocal('user', input.trim());
    else if (imagePayload) appendLocal('user', '📷 Her er oppgaven min');
    else appendLocal('user', starter);
    setInput('');
    await callTutor({
      action: 'start',
      message: starter,
      withImage: !!imagePayload,
      nextAttempts: 0,
    });
  };

  const sendReply = async (text, action = 'reply') => {
    const msg = String(text || '').trim();
    if (!msg && action === 'reply') return;
    if (msg) appendLocal('user', msg);
    setInput('');
    let nextAttempts = attemptCount;
    if (action === 'reply' && msg) {
      nextAttempts = attemptCount + 1;
      setAttemptCount(nextAttempts);
    }
    await callTutor({
      action,
      message: msg || (
        action === 'hint' ? 'Kan jeg få et hint?'
          : action === 'stuck' ? 'Jeg står fast'
            : action === 'check' ? 'Kan du sjekke om jeg er på rett spor?'
              : ''
      ),
      nextAttempts,
    });
  };

  const confirmReveal = async () => {
    setRevealOpen(false);
    if (!allowFasit || !fasitReady) {
      appendLocal('user', 'Kan du vise fasit?');
      await callTutor({
        action: 'hint',
        message: 'Kan jeg få et hint i stedet for fasit?',
      });
      return;
    }
    appendLocal('user', 'Kan du vise fasit?');
    await callTutor({
      action: 'reveal',
      message: 'Vis fasit og forklar metoden kort',
      revealRequested: true,
    });
  };

  const onPressFasit = () => {
    if (!allowFasit) {
      setError(fasitHint || 'Fasit er skrudd av.');
      return;
    }
    if (!fasitReady) {
      setError(fasitHint || 'Prøv selv først.');
      return;
    }
    setRevealOpen(true);
  };

  const quickReplies = useMemo(() => {
    const raw = Array.isArray(tutor?.quickReplies) ? tutor.quickReplies : [];
    const filtered = raw
      .map((q) => String(q || '').trim())
      .filter(Boolean)
      .filter((q) => !/^(gi meg et hint|jeg står fast|kan jeg få et hint)/i.test(q))
      .slice(0, 2);
    return filtered;
  }, [tutor?.quickReplies]);

  const practiceMissions = useMemo(
    () => missionsForSubject(subject, childAge, 4),
    [subject, childAge],
  );

  const pickPracticeMission = useCallback((mission) => {
    if (!mission) return;
    setSubject(mission.subject);
    setInput(mission.prompt);
    setImageUri(null);
    setImagePayload(null);
    setError('');
    setInputHeight(inputMinH);
  }, [inputMinH]);

  const resetAll = () => {
    setPhase('start');
    setMessages([]);
    setTutor(null);
    setInput('');
    setImageUri(null);
    setImagePayload(null);
    setError('');
    setAttemptCount(0);
    hintLevelRef.current = 0;
  };

  const startForm = (
    <View style={[stylesDyn.startGrid, isDesktop && stylesDyn.startGridDesk]}>
      <View style={stylesDyn.startMain}>
        <View style={stylesDyn.masteryStrip}>
          <View style={stylesDyn.masteryBadge}>
            <Ionicons name="sparkles" size={16} color="#f59e0b" />
            <Text style={stylesDyn.masteryBadgeTxt}>
              {openHomework.length > 0
                ? `${openHomework.length} lekse${openHomework.length === 1 ? '' : 'r'} å knakke`
                : 'Klar for mestring'}
            </Text>
          </View>
          <Text style={stylesDyn.masteryLead}>
            Hvert hint du klarer uten fasit teller. Du blir sterkere for hver oppgave.
          </Text>
          <TouchableOpacity
            style={stylesDyn.masteryLink}
            onPress={() => nav.navigate('Mattehjelp', { child: effectiveChild, familyId })}
            accessibilityRole="button"
            accessibilityLabel="Åpne Lær skole for spill og øving"
          >
            <Ionicons name="rocket-outline" size={16} color={colors.brand} />
            <Text style={stylesDyn.masteryLinkTxt}>Vil du heller øve med spill? Åpne Lær skole →</Text>
          </TouchableOpacity>
        </View>

        {(isParent && !isActingAsChild && !isChild) && (
          <TouchableOpacity
            style={stylesDyn.childPick}
            onPress={() => setChildPickOpen(true)}
            activeOpacity={0.75}
          >
            <Ionicons name="person-outline" size={18} color={colors.brand} />
            <Text style={stylesDyn.childPickTxt}>
              {effectiveChild?.name ? `Hjelper: ${effectiveChild.name}` : 'Velg barn'}
            </Text>
            <Ionicons name="chevron-down" size={16} color={colors.muted} />
          </TouchableOpacity>
        )}

        {incomingHomework?.title ? (
          <View style={stylesDyn.homeworkCard}>
            <Ionicons name="book-outline" size={18} color={colors.brand} />
            <View style={{ flex: 1 }}>
              <Text style={stylesDyn.homeworkKicker}>Valgt lekse</Text>
              <Text style={stylesDyn.homeworkTitle}>{incomingHomework.title}</Text>
            </View>
          </View>
        ) : null}

        {!incomingHomework && openHomework.length > 0 ? (
          <View style={stylesDyn.lekseList}>
            <Text style={stylesDyn.label}>Dine åpne lekser</Text>
            {openHomework.map((h) => {
              const meta = subjectMeta(h.subject);
              return (
                <TouchableOpacity
                  key={h.id}
                  style={stylesDyn.lekseRow}
                  onPress={() => pickListedHomework(h)}
                  activeOpacity={0.8}
                >
                  <View style={[stylesDyn.lekseIcon, { backgroundColor: colors.brandSoft }]}>
                    <Ionicons name={meta.icon || 'book-outline'} size={16} color={colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={stylesDyn.lekseTitle} numberOfLines={1}>{h.title}</Text>
                    <Text style={stylesDyn.lekseMeta}>
                      {meta.label || 'Lekse'}
                      {h.dueDate ? ` · frist ${h.dueDate}` : ''}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={16} color={colors.muted} />
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        <Text style={stylesDyn.label}>Utforsk et fag</Text>
        <Text style={stylesDyn.inputHint}>
          Sveip sidelengs — AI skjønner faget av oppgaven uansett. Velg for farge og øvinger.
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={stylesDyn.themeRail}
        >
          {SUBJECT_THEMES.map((theme) => {
            const on = subject === theme.id;
            return (
              <TouchableOpacity
                key={theme.id}
                style={[
                  stylesDyn.themeCard,
                  { backgroundColor: theme.tint, borderColor: on ? theme.accent : colors.line },
                  on && { borderWidth: 2 },
                ]}
                onPress={() => setSubject(theme.id)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${theme.label}, ${theme.ageLabel}`}
              >
                <View style={[stylesDyn.themeAge, { backgroundColor: theme.accent }]}>
                  <Text style={stylesDyn.themeAgeTxt}>{theme.ageLabel}</Text>
                </View>
                <Text style={[stylesDyn.themeKicker, { color: theme.accent }]}>{theme.kicker}</Text>
                <Text style={stylesDyn.themeTitle}>{theme.label}</Text>
                <Text style={stylesDyn.themeBlurb} numberOfLines={3}>{theme.blurb}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {practiceMissions.length > 0 ? (
          <View style={stylesDyn.missionBlock}>
            <Text style={stylesDyn.label}>Øvingsoppgaver</Text>
            <Text style={stylesDyn.inputHint}>
              Start med en ferdig oppgave — vi gir hint, ikke fasit først.
            </Text>
            {practiceMissions.map((mission) => (
              <TouchableOpacity
                key={mission.id}
                style={stylesDyn.missionRow}
                onPress={() => pickPracticeMission(mission)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Øvingsoppgave: ${mission.title}`}
              >
                <View style={[stylesDyn.missionIcon, { backgroundColor: colors.brandSoft }]}>
                  <Ionicons name="flash-outline" size={16} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={stylesDyn.missionTitle}>{mission.title}</Text>
                  <Text style={stylesDyn.missionMeta} numberOfLines={2}>{mission.prompt}</Text>
                </View>
                <Ionicons name="arrow-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        <Text style={stylesDyn.label}>Hva lurer du på?</Text>
        <Text style={stylesDyn.inputHint}>
          Skriv hele oppgaven her. Feltet vokser når du skriver, så det er lett å lese på telefon.
        </Text>
        <TextInput
          style={[stylesDyn.input, { height: Math.max(inputMinH, inputHeight) }]}
          value={input}
          onChangeText={setInput}
          placeholder={'Skriv oppgaven din her …\nF.eks. 324 × 9\neller 5^2\neller lim inn tekst fra leksen'}
          placeholderTextColor={colors.muted}
          multiline
          scrollEnabled
          textAlignVertical="top"
          onContentSizeChange={(e) => {
            // Tomt felt beholder 4-raders standard — ikke la placeholder blåse opp høyden
            if (!String(input || '').trim()) {
              setInputHeight(inputMinH);
              return;
            }
            const h = e?.nativeEvent?.contentSize?.height;
            if (!Number.isFinite(h)) return;
            setInputHeight(Math.min(420, Math.max(inputMinH, Math.ceil(h) + inputPadV)));
          }}
          accessibilityLabel="Oppgavetekst"
        />

        {imageUri ? (
          <View style={stylesDyn.previewWrap}>
            <Image source={{ uri: imageUri }} style={stylesDyn.preview} />
            <TouchableOpacity
              style={stylesDyn.clearImg}
              onPress={() => { setImageUri(null); setImagePayload(null); }}
            >
              <Ionicons name="close" size={16} color="#fff" />
            </TouchableOpacity>
          </View>
        ) : (
          <View style={stylesDyn.photoRow}>
            <TouchableOpacity
              style={stylesDyn.photoBtn}
              onPress={() => onPickImage(true)}
              disabled={busy}
              activeOpacity={0.75}
            >
              <Ionicons name="camera-outline" size={18} color={colors.brand} />
              <Text style={stylesDyn.photoTxt}>Ta bilde</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={stylesDyn.photoBtn}
              onPress={() => onPickImage(false)}
              disabled={busy}
              activeOpacity={0.75}
            >
              <Ionicons name="image-outline" size={18} color={colors.brand} />
              <Text style={stylesDyn.photoTxt}>Velg bilde</Text>
            </TouchableOpacity>
          </View>
        )}

        {!!error && <Text style={stylesDyn.error}>{error}</Text>}

        <TouchableOpacity
          style={[stylesDyn.primary, busy && { opacity: 0.6 }]}
          onPress={startSession}
          disabled={busy}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Få hjelp med oppgaven"
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color="#fff" />
              <View style={stylesDyn.primaryCopy}>
                <Text style={stylesDyn.primaryTxt}>Få hjelp med oppgaven</Text>
                <Text style={stylesDyn.primarySub}>Vi starter med et lite hint — ikke fasit</Text>
              </View>
            </>
          )}
        </TouchableOpacity>
      </View>

      <View style={[stylesDyn.helpAside, isDesktop && stylesDyn.helpAsideDesk]}>
        <Text style={stylesDyn.helpTitle}>Slik lærer du best</Text>
        {[
          { icon: 'bulb-outline', text: 'Lite hint — ikke hele svaret' },
          { icon: 'pencil-outline', text: 'Du skriver / tenker selv' },
          { icon: 'star-outline', text: 'Vi roser innsats og metode' },
          { icon: 'shield-checkmark-outline', text: 'Foresatte styrer fasit' },
        ].map((item) => (
          <View key={item.text} style={stylesDyn.helpRow}>
            <View style={stylesDyn.helpIcon}>
              <Ionicons name={item.icon} size={16} color={colors.brand} />
            </View>
            <Text style={stylesDyn.helpTxt}>{item.text}</Text>
          </View>
        ))}
        <Text style={stylesDyn.helpFoot}>
          Bygget for norsk skole (LK20): scaffolding, sokratiske spørsmål og mestring — i alle fag.
        </Text>
      </View>
    </View>
  );

  return (
    <Screen>
      <SchoolPageLayout
        activeId="leksehjelp"
        child={effectiveChild}
        familyId={familyId}
        aiEnabled={effectiveChild?.aiEnabled !== false}
        scroll={phase === 'start'}
        compact={phase !== 'start'}
      >
        {phase === 'start' ? (
          <>
            {startForm}
            <Text style={stylesDyn.footnote}>
              AI kan ta feil. Spør en voksen hvis noe virker rart.
            </Text>
          </>
        ) : (
          <View style={stylesDyn.sessionShell}>
            <KeyboardAvoidingView
              style={stylesDyn.sessionKav}
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
            >
              {/*
                Én felles scroll for tavle + AI-svar + forslag — unngår at flex
                knuser chat-området til én linje («mini-vindu») bak sticky footer.
              */}
              <ScrollView
                style={stylesDyn.sessionScroll}
                contentContainerStyle={stylesDyn.chatBody}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator
              >
                <View style={stylesDyn.sessionTop}>
                  <TouchableOpacity
                    onPress={resetAll}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel="Start på nytt"
                    style={stylesDyn.topIconBtn}
                  >
                    <Ionicons name="refresh-outline" size={20} color={colors.ink} />
                    <Text style={stylesDyn.resetTxt}>Start på nytt</Text>
                  </TouchableOpacity>
                  <View style={stylesDyn.tryPill}>
                    <Ionicons name="fitness-outline" size={14} color={colors.brand} />
                    <Text style={[stylesDyn.tryTxt, { color: colors.brand }]}>
                      Forsøk {attemptCount}
                    </Text>
                  </View>
                </View>

                {tutor && (
                  <View style={stylesDyn.sessionMeta}>
                    <Text style={stylesDyn.metaTxt}>
                      {(SUBJECTS.find((s) => s.id === tutor.subject)?.label || tutor.subject || 'Lekse')}
                      {tutor.difficulty ? ` · ${DIFFICULTY_LABELS[tutor.difficulty] || tutor.difficulty}` : ''}
                    </Text>
                    {isParent && !isActingAsChild && !!tutor.engine && (
                      <Text style={stylesDyn.engineHint} accessibilityLabel={`Motor: ${tutor.engine}`}>
                        {tutor.engine === 'gemini'
                          ? 'AI-veileder aktiv'
                          : tutor.engine === 'local-math'
                            ? 'Lokal matteveileder'
                            : 'Lokal veileder (AI-reserve)'}
                      </Text>
                    )}
                    {!!tutor.problemSummary && (
                      <MathText style={stylesDyn.metaSub} mode="auto" accentColor="#b45309">
                        {tutor.problemSummary}
                      </MathText>
                    )}
                    <StepRail steps={tutor.steps} colors={colors} />
                  </View>
                )}

                {imageUri ? (
                  <Image source={{ uri: imageUri }} style={stylesDyn.sessionImg} />
                ) : null}

                {tutor?.boardSteps?.length ? (
                  <TutorPencilBoard
                    lines={tutor.boardSteps}
                    visibleCount={tutor.boardVisible}
                    accent={colors.brand}
                    title="Blyanttavlen"
                  />
                ) : null}

                {messages.map((m) => (
                  <Bubble key={m.id} role={m.role} text={m.text} colors={colors} />
                ))}

                <TutorPraise
                  visible={!!tutor?.studentLooksCorrect && !tutor?.missionAccomplished}
                  message={tutor?.encouragement || pickPraise(praiseSeed)}
                  seed={praiseSeed}
                  tone="progress"
                />
                <TutorPraise
                  visible={!!tutor?.missionAccomplished}
                  message={tutor?.encouragement || 'Du klarte det — og du forstår metoden!'}
                  seed={praiseSeed + 7}
                  tone="success"
                />

                {busy && (
                  <View style={stylesDyn.typing}>
                    <ActivityIndicator size="small" color={colors.brand} />
                    <Text style={stylesDyn.typingTxt}>Tegner neste steg…</Text>
                  </View>
                )}
                {!!error && <Text style={stylesDyn.error}>{error}</Text>}

                {!!quickReplies.length && !busy && (
                  <View style={stylesDyn.quickList}>
                    <Text style={stylesDyn.quickListLabel}>Forslag til svar</Text>
                    {quickReplies.map((q) => (
                      <TouchableOpacity
                        key={q}
                        style={stylesDyn.quickAnswer}
                        onPress={() => sendReply(q, 'reply')}
                        activeOpacity={0.75}
                      >
                        <MathText style={stylesDyn.quickAnswerTxt}>{q}</MathText>
                        <Ionicons name="arrow-forward" size={16} color={colors.muted} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </ScrollView>

              <View style={stylesDyn.actionBar}>
                <TouchableOpacity style={stylesDyn.actionBtn} onPress={() => sendReply('', 'hint')} disabled={busy}>
                  <Ionicons name="bulb-outline" size={18} color={colors.brand} />
                  <Text style={stylesDyn.actionTxt}>Be om hint</Text>
                </TouchableOpacity>
                <TouchableOpacity style={stylesDyn.actionBtn} onPress={() => sendReply('', 'stuck')} disabled={busy}>
                  <Ionicons name="hand-left-outline" size={18} color={colors.brand} />
                  <Text style={stylesDyn.actionTxt}>Jeg står fast</Text>
                </TouchableOpacity>
                {allowFasit ? (
                  <TouchableOpacity
                    style={[stylesDyn.actionBtn, !fasitReady && { opacity: 0.45 }]}
                    onPress={onPressFasit}
                    disabled={busy}
                  >
                    <Ionicons
                      name={fasitReady ? 'eye-outline' : 'lock-closed-outline'}
                      size={18}
                      color={colors.warn || '#d97706'}
                    />
                    <Text style={[stylesDyn.actionTxt, { color: colors.warn || '#d97706' }]}>
                      {fasitReady ? 'Fasit' : 'Fasit (lås)'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <View style={[stylesDyn.actionBtn, { opacity: 0.5 }]}>
                    <Ionicons name="eye-off-outline" size={18} color={colors.muted} />
                    <Text style={[stylesDyn.actionTxt, { color: colors.muted }]}>Fasit av</Text>
                  </View>
                )}
              </View>

              <View style={stylesDyn.composer}>
                <TextInput
                  style={stylesDyn.composerInput}
                  value={input}
                  onChangeText={setInput}
                  placeholder="Skriv hva du tenker… (prøv selv!)"
                  placeholderTextColor={colors.muted}
                  editable={!busy}
                  multiline
                  textAlignVertical="top"
                  onSubmitEditing={() => sendReply(input)}
                />
                <TouchableOpacity
                  style={[stylesDyn.sendBtn, { backgroundColor: colors.brand }, (!input.trim() || busy) && { opacity: 0.45 }]}
                  onPress={() => sendReply(input)}
                  disabled={!input.trim() || busy}
                >
                  <Ionicons name="send" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            </KeyboardAvoidingView>
          </View>
        )}
      </SchoolPageLayout>

      <Modal visible={revealOpen} transparent animationType="fade" onRequestClose={() => setRevealOpen(false)}>
        <Pressable style={stylesDyn.modalBg} onPress={() => setRevealOpen(false)}>
          <Pressable style={stylesDyn.modalCard} onPress={(e) => e.stopPropagation?.()}>
            <Text style={stylesDyn.modalTitle}>Vil du se fasit?</Text>
            <Text style={stylesDyn.modalBody}>
              Best er å prøve selv først. Hvis du ser fasit nå, får du også utregningen tegnet på blyanttavlen — men prøv gjerne ett hint til.
            </Text>
            <TouchableOpacity style={stylesDyn.primary} onPress={confirmReveal} activeOpacity={0.85}>
              <Text style={stylesDyn.primaryTxt}>Vis fasit + metode</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[stylesDyn.secondary, { marginTop: 10 }]}
              onPress={() => { setRevealOpen(false); sendReply('', 'hint'); }}
            >
              <Text style={[stylesDyn.secondaryTxt, { color: colors.brand }]}>Gi meg heller et hint</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={childPickOpen} transparent animationType="fade" onRequestClose={() => setChildPickOpen(false)}>
        <Pressable style={stylesDyn.modalBg} onPress={() => setChildPickOpen(false)}>
          <Pressable style={stylesDyn.modalCard} onPress={(e) => e.stopPropagation?.()}>
            <Text style={stylesDyn.modalTitle}>Hvem skal ha hjelp?</Text>
            {activeKids.map((k) => (
              <TouchableOpacity
                key={k.id}
                style={stylesDyn.kidRow}
                onPress={() => { setPickedChild(k); setChildPickOpen(false); }}
              >
                <Text style={stylesDyn.kidName}>{k.name}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
      <ModuleIntroHost scope="family" moduleId="leksehjelp" />
    </Screen>
  );
}

function makeStyles(colors, { isPhone = false, inputMinH = 116 } = {}) {
  return StyleSheet.create({
    startGrid: { gap: 16 },
    startGridDesk: { flexDirection: 'row', alignItems: 'flex-start' },
    startMain: {
      flex: 1,
      backgroundColor: '#fff',
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      padding: isPhone ? 14 : 16,
      gap: 4,
      minWidth: 0,
      overflow: 'visible',
    },
    masteryStrip: {
      backgroundColor: '#fffbeb',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: '#fde68a',
      padding: 12,
      gap: 8,
      marginBottom: 12,
    },
    masteryBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'flex-start',
      backgroundColor: '#fff',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
    },
    masteryBadgeTxt: { fontWeight: '400', fontSize: 12, color: colors.ink },
    masteryLead: { fontSize: 13, lineHeight: 18, color: colors.muted, fontWeight: '500' },
    masteryLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    masteryLinkTxt: { fontWeight: '400', fontSize: 13, color: colors.brand, flex: 1 },
    helpAside: {
      backgroundColor: colors.successSoft || '#ecfdf5',
      borderRadius: radius.md,
      padding: 16,
      gap: 12,
    },
    helpAsideDesk: { width: 260, flexShrink: 0 },
    helpTitle: { fontWeight: '400', fontSize: 15, color: colors.ink, marginBottom: 4 },
    helpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    helpIcon: {
      width: 28, height: 28, borderRadius: 14, backgroundColor: '#fff',
      alignItems: 'center', justifyContent: 'center',
    },
    helpTxt: { flex: 1, fontWeight: '500', fontSize: 13, color: colors.ink },
    helpFoot: {
      marginTop: 4, fontSize: 11, lineHeight: 16, color: colors.muted, fontWeight: '500',
    },
    sessionTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
      gap: 8,
    },
    topIconBtn: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 10,
      backgroundColor: '#fff',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
    },
    resetTxt: { fontWeight: '400', fontSize: 13, color: colors.ink },
    tryPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: colors.brandSoft,
    },
    tryTxt: { fontSize: 12, fontWeight: '400' },
    childPick: {
      flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: colors.card, borderRadius: radius.sm, paddingVertical: 11, paddingHorizontal: 12,
      borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, marginBottom: 14,
    },
    childPickTxt: { flex: 1, fontWeight: '500', color: colors.ink, fontSize: 14 },
    homeworkCard: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: colors.brandSoft, borderRadius: radius.sm,
      paddingVertical: 12, paddingHorizontal: 12, marginBottom: 14,
      borderWidth: 1, borderColor: colors.brand,
    },
    homeworkKicker: { fontWeight: '400', fontSize: 11, color: colors.brand, textTransform: 'uppercase' },
    homeworkTitle: { fontWeight: '400', fontSize: 15, color: colors.ink, marginTop: 2 },
    lekseList: { marginBottom: 10, gap: 6 },
    lekseRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.card,
      marginBottom: 6,
    },
    lekseIcon: {
      width: 32, height: 32, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    lekseTitle: { fontWeight: '400', fontSize: 14, color: colors.ink },
    lekseMeta: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: '500' },
    label: {
      fontWeight: '400', fontSize: 14, color: colors.ink, marginBottom: 4, marginTop: 2,
    },
    inputHint: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.muted,
      lineHeight: 17,
      marginBottom: 8,
    },
    subjectGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 },
    subjectChip: {
      flexDirection: 'row', alignItems: 'center', gap: 5,
      paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
      backgroundColor: '#fff',
      borderWidth: 1, borderColor: colors.line,
    },
    subjectTxt: { fontWeight: '500', fontSize: 13, color: colors.ink },
    themeRail: { gap: 10, paddingBottom: 4, paddingRight: 8, marginBottom: 12 },
    themeCard: {
      width: isPhone ? 200 : 220,
      borderRadius: 18,
      borderWidth: 1,
      padding: 14,
      gap: 6,
      minHeight: 148,
    },
    themeAge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      marginBottom: 2,
    },
    themeAgeTxt: { color: '#fff', fontSize: 11, fontWeight: '400' },
    themeKicker: {
      fontSize: 11,
      fontWeight: '400',
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    themeTitle: { fontSize: 20, fontWeight: '400', color: colors.ink },
    themeBlurb: { fontSize: 13, lineHeight: 18, color: colors.muted, fontWeight: '500' },
    missionBlock: { marginBottom: 8, gap: 4 },
    missionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 11,
      paddingHorizontal: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.line,
      backgroundColor: colors.card || '#fff',
      marginBottom: 6,
    },
    missionIcon: {
      width: 32, height: 32, borderRadius: 10,
      alignItems: 'center', justifyContent: 'center',
    },
    missionTitle: { fontWeight: '400', fontSize: 14, color: colors.ink },
    missionMeta: { fontSize: 12, color: colors.muted, marginTop: 2, fontWeight: '500', lineHeight: 16 },
    input: {
      minHeight: inputMinH,
      width: '100%',
      backgroundColor: '#fff',
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: colors.line,
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 14,
      fontSize: isPhone ? 18 : 16,
      lineHeight: isPhone ? 26 : 22,
      color: colors.ink,
      fontWeight: '500',
      marginBottom: 12,
      ...(Platform.OS === 'web' ? { resize: 'vertical', outlineStyle: 'none' } : null),
    },
    photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    photoBtn: {
      alignSelf: 'flex-start',
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
      backgroundColor: '#fff', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 12,
      borderWidth: 1, borderColor: colors.line,
    },
    photoTxt: { fontWeight: '400', color: colors.brand, fontSize: 13 },
    previewWrap: { position: 'relative', marginBottom: 14, borderRadius: radius.sm, overflow: 'hidden' },
    preview: { width: '100%', height: 180, backgroundColor: colors.line },
    clearImg: {
      position: 'absolute', top: 8, right: 8, width: 28, height: 28, borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
    },
    primary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      gap: 10,
      backgroundColor: colors.brand,
      borderRadius: 14,
      paddingVertical: isPhone ? 14 : 12,
      paddingHorizontal: 16,
      marginTop: 6,
      minHeight: isPhone ? 56 : 48,
    },
    primaryCopy: { flexShrink: 1 },
    primaryTxt: { color: '#fff', fontWeight: '400', fontSize: isPhone ? 16 : 15 },
    primarySub: {
      color: 'rgba(255,255,255,0.9)',
      fontWeight: '400',
      fontSize: 12,
      marginTop: 2,
    },
    secondary: {
      alignItems: 'center', justifyContent: 'center', paddingVertical: 12,
    },
    secondaryTxt: { fontWeight: '400', fontSize: 14 },
    footnote: {
      marginTop: 14, fontSize: 12, color: colors.muted, textAlign: 'center',
      fontWeight: '500', lineHeight: 17,
    },
    error: { color: colors.danger, fontWeight: '400', marginBottom: 10, fontSize: 13 },
    sessionShell: {
      flex: 1,
      minHeight: 0,
    },
    sessionKav: {
      flex: 1,
      minHeight: 0,
    },
    sessionScroll: {
      flex: 1,
      minHeight: 0,
    },
    sessionMeta: {
      paddingTop: 4,
      paddingBottom: 10,
      marginBottom: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.line,
    },
    metaTxt: { fontWeight: '400', fontSize: 13, color: colors.ink },
    engineHint: {
      marginTop: 2,
      marginBottom: 4,
      fontSize: 11,
      fontWeight: '400',
      color: colors.muted,
    },
    metaSub: { color: colors.muted, fontSize: 12, fontWeight: '500', marginTop: 2, marginBottom: 8 },
    sessionImg: { width: '100%', height: 100, backgroundColor: colors.line, marginBottom: 12, borderRadius: 12 },
    chatBody: {
      paddingHorizontal: 4,
      paddingTop: 4,
      paddingBottom: 24,
      flexGrow: 1,
    },
    typing: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    typingTxt: { color: colors.muted, fontWeight: '400', fontSize: 13 },
    quickList: {
      marginTop: 14,
      paddingTop: 12,
      gap: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    quickListLabel: {
      fontSize: 11,
      fontWeight: '400',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 2,
    },
    quickAnswer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 12,
      paddingVertical: 10,
      minHeight: 44,
    },
    quickAnswerTxt: {
      flex: 1,
      fontWeight: '400',
      fontSize: 14,
      lineHeight: 19,
      color: colors.ink,
    },
    actionBar: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 18,
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
      backgroundColor: colors.bg,
    },
    actionBtn: {
      alignSelf: 'flex-start', alignItems: 'center', gap: 2, paddingHorizontal: 10, paddingVertical: 4 },
    actionTxt: { fontSize: 11, fontWeight: '400', color: colors.brand },
    composer: {
      flexDirection: 'row', alignItems: 'flex-end', gap: 8,
      padding: 12, paddingBottom: Platform.OS === 'ios' ? 16 : 12,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.card,
    },
    composerInput: {
      flex: 1,
      backgroundColor: colors.bg,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: isPhone ? 12 : 10,
      fontSize: isPhone ? 17 : 16,
      lineHeight: isPhone ? 24 : 22,
      fontWeight: '500',
      color: colors.ink,
      minHeight: isPhone ? 48 : 40,
      maxHeight: isPhone ? 160 : 120,
    },
    sendBtn: {
      width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    },
    modalBg: {
      flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 24,
    },
    modalCard: {
      backgroundColor: colors.card, borderRadius: radius.md, padding: 20,
    },
    modalTitle: { fontWeight: '400', fontSize: 18, color: colors.ink, marginBottom: 8 },
    modalBody: { color: colors.muted, fontWeight: '500', fontSize: 14, lineHeight: 20, marginBottom: 16 },
    kidRow: {
      flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
    },
    kidName: { flex: 1, fontWeight: '400', fontSize: 16, color: colors.ink },
  });
}

const styles = StyleSheet.create({
  stepRail: { gap: 8, paddingVertical: 4 },
  stepPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12,
    backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: '#e2e8f0', marginRight: 8,
  },
  stepDot: {
    width: 18, height: 18, borderRadius: 9, backgroundColor: '#94a3b8',
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotTxt: { color: '#fff', fontSize: 10, fontWeight: '400' },
  stepTitle: { fontSize: 12, fontWeight: '500', color: '#5b6b82', maxWidth: 110 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10, maxWidth: '100%' },
  bubbleRowMine: { justifyContent: 'flex-end' },
  avatar: {
    width: 28, height: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
  },
  bubble: {
    maxWidth: '82%', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10,
  },
  bubbleTxt: { fontSize: 14, lineHeight: 20, fontWeight: '500', color: '#1a2744' },
});
