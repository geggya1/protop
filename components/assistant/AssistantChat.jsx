import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator, Animated, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useHelp } from '../../src/context/HelpContext';
import { useColors } from '../../src/context/ThemeContext';
import { useI18n } from '../../src/i18n';
import { useLayout } from '../../src/theme';
import ChatMarkdownText from '../ChatMarkdownText';
import { isOrganizationType } from '../../src/utils/groupTypes';
import { currentRouteName, getAppNav } from '../../src/navigation/navRef';
import { createSupportTicket } from '../../src/utils/supportTickets';
import {
  ASSISTANT_ESCALATE_AFTER, SUPPORT_TITLE_MAX, greeting, starterSuggestions, supportTicketBody, transcriptText,
} from '../../src/help/assistantEngine';
import {
  askAssistant, clearConversation, loadConversation, saveConversation,
} from '../../src/help/assistantService';
import { getProtopPage } from '../../src/help/protopPages';

const BRAND = '#1099F4';
const NAVY = '#07274C';
const NATIVE_DRIVER = Platform.OS !== 'web';
/** Web: markør så hjelpens knappesøk (findTarget) hopper over assistenten. */
const WEB_MARK = Platform.OS === 'web' ? { dataSet: { assistantPanel: '1' } } : {};

function newId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function deviceFor(layout) {
  if (layout.isDesktop) return 'desktop';
  if (layout.isTablet) return 'tablet';
  return 'phone';
}

/** Åpner en side i skallet, også når brukeren står på en annen skjerm. */
function openShellPage(nav, requestShellTab) {
  if (!nav?.tab) return;
  const route = currentRouteName();
  const appNav = getAppNav();
  if (route && route !== 'Home' && appNav?.navigate) {
    appNav.navigate('Home', { openShell: { tab: nav.tab, subView: nav.subView || null } });
    return;
  }
  requestShellTab?.(nav.tab, nav.subView || null);
}

function TypingDots({ color }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(a, { toValue: 3, duration: 1100, useNativeDriver: NATIVE_DRIVER }),
    );
    loop.start();
    return () => loop.stop();
  }, [a]);
  return (
    <View style={styles.dots} accessibilityLabel="…">
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: color },
            {
              opacity: a.interpolate({
                inputRange: [0, i, i + 0.5, i + 1, 3],
                outputRange: [0.3, 0.3, 1, 0.3, 0.3],
                extrapolate: 'clamp',
              }),
            },
          ]}
        />
      ))}
    </View>
  );
}

function AssistantAvatar({ size = 32 }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
        Platform.OS === 'web' ? { backgroundImage: `linear-gradient(135deg, ${BRAND} 0%, ${NAVY} 100%)` } : null,
      ]}
    >
      <Ionicons name="sparkles" size={Math.round(size * 0.5)} color="#fff" />
    </View>
  );
}

function StepList({ steps, c }) {
  if (!steps?.length) return null;
  return (
    <View style={styles.steps}>
      {steps.map((s, i) => (
        <View key={`${i}-${(s.title || s.text || '').slice(0, 10)}`} style={styles.stepRow}>
          <View style={[styles.stepNum, { backgroundColor: BRAND }]}>
            <Text style={styles.stepNumTxt}>{i + 1}</Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            {s.title ? <Text style={[styles.stepTitle, { color: c.ink }]}>{s.title}</Text> : null}
            <Text style={[styles.stepTxt, { color: c.ink }]}>{s.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function BotMessage({
  msg, c, t, onAction, onFollowUp, onFeedback, onCopy, busy,
}) {
  const primary = (msg.actions || []).filter((a) => a.type === 'tour' || a.type === 'process');
  const secondary = (msg.actions || []).filter((a) => a.type !== 'tour' && a.type !== 'process');
  return (
    <View style={styles.botRow} testID="assistant-msg-bot">
      <AssistantAvatar size={26} />
      <View style={[styles.botBubble, { backgroundColor: c.card, borderColor: c.line }]}>
        {msg.text ? (
          <ChatMarkdownText text={msg.text} style={[styles.botTxt, { color: c.ink }]} />
        ) : null}
        <StepList steps={msg.steps} c={c} />
        {(msg.sources || []).length ? (
          <View style={styles.sources}>
            {msg.sources.slice(0, 2).map((src) => (
              <TouchableOpacity
                key={src.id}
                style={[styles.sourceChip, { borderColor: c.line }]}
                onPress={() => onAction?.(src.pageKey
                  ? { type: 'open', pageKey: src.pageKey, nav: getProtopPage(src.pageKey)?.nav }
                  : src.processId ? { type: 'process', processId: src.processId } : null)}
                accessibilityRole="link"
                accessibilityLabel={`${t('assistant.sources')}: ${src.label}`}
              >
                <Ionicons name="book-outline" size={12} color={BRAND} />
                <Text style={[styles.sourceTxt, { color: c.muted }]} numberOfLines={1}>
                  {t('assistant.sources')}: {src.label}{src.path ? ` · ${src.path}` : ''}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {primary.length || secondary.length ? (
          <View style={styles.actions}>
            {primary.map((a, i) => (
              <TouchableOpacity
                key={`p-${i}`}
                style={[styles.actionPrimary, busy && styles.disabled]}
                onPress={() => onAction?.(a)}
                disabled={busy}
                accessibilityRole="button"
                testID={a.type === 'tour' ? 'assistant-action-tour' : 'assistant-action-process'}
              >
                <Ionicons name={a.type === 'process' ? 'git-merge-outline' : 'footsteps-outline'} size={15} color="#fff" />
                <Text style={styles.actionPrimaryTxt} numberOfLines={1}>{a.label}</Text>
              </TouchableOpacity>
            ))}
            {secondary.map((a, i) => (
              <TouchableOpacity
                key={`s-${i}`}
                style={[styles.actionSecondary, { borderColor: BRAND }]}
                onPress={() => onAction?.(a)}
                accessibilityRole="button"
                testID={a.type === 'support' ? 'assistant-action-support' : 'assistant-action-open'}
              >
                <Ionicons
                  name={a.type === 'support' ? 'mail-unread-outline' : 'open-outline'}
                  size={14}
                  color={BRAND}
                />
                <Text style={[styles.actionSecondaryTxt, { color: BRAND }]} numberOfLines={1}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {msg.intent !== 'greeting' && msg.intent !== 'thanks' && msg.id !== 'greet' ? (
          <View style={styles.feedbackRow}>
            {msg.feedback ? (
              <Text style={[styles.feedbackTxt, { color: c.muted }]}>{t('assistant.thanks')}</Text>
            ) : (
              <>
                <Text style={[styles.feedbackTxt, { color: c.muted }]}>{t('assistant.helpful')}</Text>
                <TouchableOpacity onPress={() => onFeedback?.(msg.id, 'up')} hitSlop={8} accessibilityLabel="👍" testID="assistant-thumbs-up">
                  <Ionicons name="thumbs-up-outline" size={15} color={c.muted} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => onFeedback?.(msg.id, 'down')} hitSlop={8} accessibilityLabel="👎" testID="assistant-thumbs-down">
                  <Ionicons name="thumbs-down-outline" size={15} color={c.muted} />
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity onPress={() => onCopy?.(msg)} hitSlop={8} style={styles.copyBtn} accessibilityLabel={t('assistant.copy')}>
              <Ionicons name="copy-outline" size={14} color={c.muted} />
            </TouchableOpacity>
          </View>
        ) : null}
        {(msg.followUps || []).length ? (
          <View style={styles.followUps}>
            {msg.followUps.map((q) => (
              <TouchableOpacity
                key={q}
                style={[styles.followChip, { backgroundColor: `${BRAND}12`, borderColor: `${BRAND}33` }]}
                onPress={() => onFollowUp?.(q)}
                accessibilityRole="button"
                testID="assistant-followup"
              >
                <Text style={[styles.followTxt, { color: BRAND }]} numberOfLines={2}>{q}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function SupportCard({
  c, t, lang, initialTitle, transcript, onCancel, onSent,
}) {
  const { familyId, user } = useApp();
  const layout = useLayout();
  const [title, setTitle] = useState(initialTitle || '');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const tt = title.trim() || (lang === 'en' ? 'Question from the assistant' : 'Spørsmål fra assistenten');
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const fullBody = supportTicketBody({ note: body, transcript, lang });
      const data = await createSupportTicket({
        title: tt.slice(0, SUPPORT_TITLE_MAX),
        body: fullBody,
        contactEmail: user?.email || null,
        allowInternalOnly: true,
        audience: 'parent',
        device: deviceFor(layout),
        lang,
        familyId,
        attachmentUrls: [],
        category: /feil|bug|error|virker ikke|fungerer ikke/i.test(`${tt} ${body}`) ? 'bug' : 'question',
      });
      onSent?.(data || {});
    } catch {
      // Ingen tekniske feilkoder til brukeren — vis veien videre i stedet.
      setError(lang === 'en'
        ? 'Could not send the case right now. Try again in a moment, or use Help & support → Contact support.'
        : 'Kunne ikke sende saken akkurat nå. Prøv igjen om litt, eller bruk Hjelp & support → Kontakt support.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.supportCard, { backgroundColor: c.card, borderColor: c.line }]} testID="assistant-support-card">
      <View style={styles.supportHead}>
        <Ionicons name="mail-unread-outline" size={18} color={BRAND} />
        <Text style={[styles.supportTitle, { color: c.ink }]}>{t('assistant.contactSupport')}</Text>
      </View>
      <Text style={[styles.supportLead, { color: c.muted }]}>
        {lang === 'en'
          ? 'We attach this conversation so you don’t have to repeat yourself.'
          : 'Vi legger ved samtalen, så du slipper å gjenta deg.'}
      </Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder={lang === 'en' ? 'Title' : 'Tittel'}
        placeholderTextColor={c.placeholder || '#94a3b8'}
        style={[styles.supportInput, { color: c.ink, borderColor: c.line }]}
        maxLength={160}
        testID="assistant-support-title"
      />
      <TextInput
        value={body}
        onChangeText={setBody}
        placeholder={lang === 'en' ? 'What happened? (optional)' : 'Hva skjedde? (valgfritt)'}
        placeholderTextColor={c.placeholder || '#94a3b8'}
        style={[styles.supportInput, styles.supportArea, { color: c.ink, borderColor: c.line }]}
        multiline
        maxLength={2000}
      />
      {error ? <Text style={styles.supportError}>{error}</Text> : null}
      <View style={styles.supportBtns}>
        <TouchableOpacity onPress={onCancel} style={[styles.actionSecondary, { borderColor: c.line }]}>
          <Text style={[styles.actionSecondaryTxt, { color: c.ink }]}>{lang === 'en' ? 'Cancel' : 'Avbryt'}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={submit} style={[styles.actionPrimary, busy && styles.disabled]} disabled={busy} testID="assistant-support-send">
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={14} color="#fff" />}
          <Text style={styles.actionPrimaryTxt}>{lang === 'en' ? 'Send case' : 'Send sak'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/**
 * ProTop-assistenten som chat. Brukes i chat-docken (PC), chat-skuffen
 * (mobil web), egen skjerm (native) og i hjelpesenteret.
 *
 * variant: 'dock' | 'drawer' | 'screen' | 'embedded'
 * onCollapse: kalles etter «Vis meg»/«Åpne siden», så siden blir synlig.
 */
export default function AssistantChat({
  variant = 'dock',
  ask = null,
  onClose,
  onBack,
  onMinimize,
  onCollapse,
  onContactSupport,
  showHeader = true,
}) {
  const c = useColors();
  const { t, lang } = useI18n();
  const layout = useLayout();
  const {
    uid, familyId, family, requestShellTab,
  } = useApp();
  const help = useHelp();
  const company = isOrganizationType(family?.type);
  const pageKey = help.pageKey || null;
  const page = pageKey ? getProtopPage(pageKey) : null;

  const [messages, setMessages] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [support, setSupport] = useState(null);
  const [unresolved, setUnresolved] = useState(0);
  const scrollRef = useRef(null);
  const handledAskRef = useRef('');
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const scrollToEnd = useCallback(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd?.({ animated: true }), 60);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const prev = await loadConversation(uid);
      if (!alive) return;
      setMessages(prev.length ? prev : [{ id: 'greet', at: Date.now(), ...greeting({ lang, pageKey, company }) }]);
      setLoaded(true);
      scrollToEnd();
    })();
    return () => { alive = false; };
    // Bare ved åpning — siden brukeren står på brukes i hilsenen.
  }, [uid]);

  useEffect(() => {
    if (!loaded) return;
    saveConversation(uid, messages.filter((m) => m.id !== 'greet'));
  }, [messages, loaded, uid]);

  const send = useCallback(async (raw) => {
    const question = String(raw ?? input).trim();
    if (!question || busy) return;
    setInput('');
    setSupport(null);
    const userMsg = { id: newId('u'), role: 'user', text: question, at: Date.now() };
    const history = messagesRef.current.filter((m) => m.id !== 'greet');
    setMessages((prev) => [...prev, userMsg]);
    setBusy(true);
    scrollToEnd();
    try {
      const answer = await askAssistant({
        question,
        history,
        lang,
        pageKey,
        company,
        familyId,
        device: deviceFor(layout),
        unresolved,
      });
      const weak = answer.intent === 'unknown' || answer.confidence < 0.2;
      setUnresolved((n) => (weak ? n + 1 : 0));
      setMessages((prev) => [...prev, { id: newId('a'), at: Date.now(), ...answer }]);
    } finally {
      setBusy(false);
      scrollToEnd();
    }
  }, [input, busy, lang, pageKey, company, familyId, layout, unresolved, scrollToEnd]);

  // Spørsmål sendt med fra lyspæren / hjelpesenteret.
  useEffect(() => {
    if (!loaded || !ask?.text || !ask?.nonce || handledAskRef.current === ask.nonce) return;
    handledAskRef.current = ask.nonce;
    send(ask.text);
  }, [loaded, ask?.nonce, ask?.text, send]);

  const reset = useCallback(async () => {
    await clearConversation(uid);
    setUnresolved(0);
    setSupport(null);
    setMessages([{ id: 'greet', at: Date.now(), ...greeting({ lang, pageKey, company }) }]);
  }, [uid, lang, pageKey, company]);

  const onFeedback = useCallback((id, value) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, feedback: value } : m)));
    if (value === 'down') {
      setUnresolved((n) => {
        const next = n + 1;
        if (next >= ASSISTANT_ESCALATE_AFTER) {
          setMessages((prev) => [...prev, {
            id: newId('a'),
            role: 'assistant',
            at: Date.now(),
            intent: 'escalate',
            text: lang === 'en'
              ? 'Sorry that didn’t help. Want me to pass this to a person at ProTop support?'
              : 'Beklager at det ikke hjalp. Vil du at jeg sender dette videre til et menneske i ProTop-support?',
            actions: [{ type: 'support', label: t('assistant.contactSupport') }],
          }]);
          scrollToEnd();
        }
        return next;
      });
    }
  }, [lang, t, scrollToEnd]);

  const onCopy = useCallback(async (msg) => {
    const text = transcriptText([msg], { lang }).replace(/^(Assistent|Assistant): /, '');
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
      }
    } catch { /* ignore */ }
  }, [lang]);

  const firstQuestion = useMemo(
    () => messages.find((m) => m.role === 'user')?.text || '',
    [messages],
  );

  const onAction = useCallback((action) => {
    if (!action) return;
    if (action.type === 'support') {
      if (variant === 'embedded' && typeof onContactSupport === 'function') {
        onContactSupport({
          title: firstQuestion.slice(0, 80),
          body: supportTicketBody({
            transcript: transcriptText(messagesRef.current.filter((m) => m.id !== 'greet'), { lang }),
            lang,
          }),
        });
        return;
      }
      setSupport({ title: firstQuestion.slice(0, 80) });
      scrollToEnd();
      return;
    }
    if (action.type === 'process') {
      onCollapse?.();
      help.startProcessTour?.(action.processId, 0);
      return;
    }
    const nav = action.nav || getProtopPage(action.pageKey)?.nav;
    if (!nav) return;
    onCollapse?.();
    openShellPage(nav, requestShellTab);
    if (action.type === 'tour' && action.pageKey) help.startPageTour?.(action.pageKey);
  }, [variant, onContactSupport, firstQuestion, lang, scrollToEnd, onCollapse, help, requestShellTab]);

  const onSupportSent = useCallback((data) => {
    setSupport(null);
    setUnresolved(0);
    const num = data?.ticketNumber || '';
    setMessages((prev) => [...prev, {
      id: newId('a'),
      role: 'assistant',
      at: Date.now(),
      intent: 'ticket',
      text: lang === 'en'
        ? `Your case is sent${num ? ` (case number **${num}**)` : ''}. You will get the reply in Help & support → My requests.`
        : `Saken er sendt${num ? ` (saksnummer **${num}**)` : ''}. Svaret kommer i Hjelp & support → Mine henvendelser.`,
      actions: [{ type: 'open', nav: { tab: 'more', subView: 'help' }, label: t('help.myTickets') }],
    }]);
    scrollToEnd();
  }, [lang, t, scrollToEnd]);

  const suggestions = useMemo(
    () => starterSuggestions({ lang, pageKey, company }),
    [lang, pageKey, company],
  );
  const onlyGreeting = messages.length <= 1;
  const canSend = !!input.trim() && !busy;

  const onKeyPress = (e) => {
    if (Platform.OS !== 'web') return;
    const ne = e?.nativeEvent || {};
    if (ne.key === 'Enter' && !ne.shiftKey) {
      e.preventDefault?.();
      send();
    }
  };

  const header = showHeader ? (
    <View style={[styles.head, variant === 'embedded' && styles.headEmbedded]}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} hitSlop={8} accessibilityLabel={t('assistant.back')}>
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
      ) : null}
      <AssistantAvatar size={34} />
      <View style={styles.headText}>
        <Text style={styles.headTitle} numberOfLines={1}>{t('assistant.name')}</Text>
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.headSub} numberOfLines={1}>
            {page ? `${t('assistant.aboutPage')}: ${page.label?.[lang] || page.label?.nb}` : t('assistant.status')}
          </Text>
        </View>
      </View>
      <TouchableOpacity onPress={reset} hitSlop={8} accessibilityLabel={t('assistant.newChat')} testID="assistant-reset">
        <Ionicons name="refresh" size={19} color="#fff" />
      </TouchableOpacity>
      {onMinimize ? (
        <TouchableOpacity onPress={onMinimize} hitSlop={8} accessibilityLabel="Minimer">
          <Ionicons name="remove" size={20} color="#fff" />
        </TouchableOpacity>
      ) : null}
      {onClose ? (
        <TouchableOpacity onPress={onClose} hitSlop={8} accessibilityLabel={t('assistant.close')} testID="assistant-close">
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
      ) : null}
    </View>
  ) : null;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={variant === 'screen' ? 0 : 64}
    >
      <View
        style={[styles.root, { backgroundColor: c.bg }]}
        testID="assistant-panel"
        nativeID="assistant-panel"
        {...WEB_MARK}
      >
        {header}
        <ScrollView
          ref={scrollRef}
          style={styles.list}
          contentContainerStyle={styles.listInner}
          keyboardShouldPersistTaps="handled"
          onContentSizeChange={scrollToEnd}
        >
          {messages.map((m) => (m.role === 'user' ? (
            <View key={m.id} style={styles.userRow} testID="assistant-msg-user">
              <View style={styles.userBubble}>
                <Text style={styles.userTxt}>{m.text}</Text>
              </View>
            </View>
          ) : (
            <BotMessage
              key={m.id}
              msg={m}
              c={c}
              t={t}
              busy={busy}
              onAction={onAction}
              onFollowUp={send}
              onFeedback={onFeedback}
              onCopy={onCopy}
            />
          )))}
          {onlyGreeting && !messages[0]?.followUps?.length ? (
            <View style={styles.followUps}>
              {suggestions.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[styles.followChip, { backgroundColor: `${BRAND}12`, borderColor: `${BRAND}33` }]}
                  onPress={() => send(q)}
                  testID="assistant-followup"
                >
                  <Text style={[styles.followTxt, { color: BRAND }]}>{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {busy ? (
            <View style={styles.botRow} testID="assistant-typing">
              <AssistantAvatar size={26} />
              <View style={[styles.botBubble, styles.typingBubble, { backgroundColor: c.card, borderColor: c.line }]}>
                <TypingDots color={BRAND} />
              </View>
            </View>
          ) : null}
          {support ? (
            <SupportCard
              c={c}
              t={t}
              lang={lang}
              initialTitle={support.title}
              transcript={transcriptText(messages.filter((m) => m.id !== 'greet'), { lang })}
              onCancel={() => setSupport(null)}
              onSent={onSupportSent}
            />
          ) : null}
        </ScrollView>

        <View style={[styles.composer, { backgroundColor: c.card, borderTopColor: c.line }]}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={t('assistant.placeholder')}
            placeholderTextColor={c.placeholder || '#8b98a5'}
            style={[styles.input, { color: c.ink, backgroundColor: c.bg }]}
            multiline
            maxLength={2000}
            onKeyPress={onKeyPress}
            onSubmitEditing={Platform.OS === 'web' ? undefined : () => send()}
            blurOnSubmit={false}
            accessibilityLabel={t('assistant.placeholder')}
            testID="assistant-input"
          />
          <TouchableOpacity
            onPress={() => send()}
            disabled={!canSend}
            style={[styles.sendBtn, !canSend && styles.disabled]}
            accessibilityRole="button"
            accessibilityLabel={t('assistant.send')}
            testID="assistant-send"
          >
            {busy ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={16} color="#fff" />}
          </TouchableOpacity>
        </View>
        <Text style={[styles.privacy, { color: c.muted, backgroundColor: c.card }]} numberOfLines={2}>
          {t('assistant.privacy')}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    ...Platform.select({ web: { display: 'flex', flexDirection: 'column' }, default: {} }),
  },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: NAVY,
    minHeight: 56,
    flexShrink: 0,
  },
  headEmbedded: { borderRadius: 14 },
  headText: { flex: 1, minWidth: 0 },
  headTitle: { color: '#fff', fontWeight: '600', fontSize: 15 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#34d399' },
  headSub: { color: 'rgba(255,255,255,0.82)', fontSize: 11.5, flexShrink: 1 },
  avatar: {
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { flex: 1, minHeight: 0 },
  listInner: { padding: 12, gap: 10, paddingBottom: 18 },
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '86%',
    backgroundColor: BRAND,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  userTxt: { color: '#fff', fontSize: 14.5, lineHeight: 20 },
  botRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  botBubble: {
    flex: 1,
    minWidth: 0,
    maxWidth: 560,
    borderRadius: 16,
    borderTopLeftRadius: 4,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  typingBubble: { flex: 0, alignSelf: 'flex-start', paddingVertical: 12 },
  botTxt: { fontSize: 14.5, lineHeight: 21 },
  steps: { marginTop: 10, gap: 9 },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9 },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumTxt: { color: '#fff', fontSize: 12, fontWeight: '600' },
  stepTitle: { fontSize: 13.5, fontWeight: '600', lineHeight: 19 },
  stepTxt: { fontSize: 13.5, lineHeight: 19, opacity: 0.92 },
  sources: { marginTop: 10, gap: 6 },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  sourceTxt: { fontSize: 11.5, flexShrink: 1 },
  actions: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: BRAND,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: '100%',
  },
  actionPrimaryTxt: { color: '#fff', fontSize: 13.5, fontWeight: '600', flexShrink: 1 },
  actionSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  actionSecondaryTxt: { fontSize: 13, fontWeight: '500', flexShrink: 1 },
  disabled: { opacity: 0.5 },
  feedbackRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  feedbackTxt: { fontSize: 11.5 },
  copyBtn: { marginLeft: 'auto' },
  followUps: { marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  followChip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  followTxt: { fontSize: 12.5, fontWeight: '500' },
  dots: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 6,
    borderTopWidth: 1,
    flexShrink: 0,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14.5,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  privacy: {
    fontSize: 10.5,
    textAlign: 'center',
    paddingHorizontal: 12,
    paddingBottom: 8,
    flexShrink: 0,
  },
  supportCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    gap: 8,
  },
  supportHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  supportTitle: { fontSize: 15, fontWeight: '600' },
  supportLead: { fontSize: 12.5, lineHeight: 17 },
  supportInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
  },
  supportArea: { minHeight: 70, textAlignVertical: 'top' },
  supportError: { color: '#b91c1c', fontSize: 12.5 },
  supportBtns: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
});
