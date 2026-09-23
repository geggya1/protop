import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  KeyboardAvoidingView, Platform, ActivityIndicator, Modal, Pressable, ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors } from '../../src/theme';
import { Screen } from '../../components/ui';
import { profileAge } from '../../src/utils/age';
import {
  childGreeting,
  childSuggestedPrompts,
  CHILD_DISCLAIMER,
  PARENT_GREETING,
  PARENT_DISCLAIMER,
  parentSuggestedPrompts,
} from '../../src/utils/childChatPrompts';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../firebase';
import {
  appendAiMessage,
  createAiChat,
  ensureGreetingMessage,
  formatMessageStamp,
  formatThreadTime,
  listenAiMessages,
  listenAiChatsSimple,
} from '../../src/utils/aiChats';
import {
  SwipeStampRow,
  SwipeTimestampHost,
  useSwipeTimestampReveal,
} from '../../components/SwipeTimestamp';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import ModuleIntroHost from '../../components/ModuleIntroHost';
import ChatMarkdownText from '../../components/ChatMarkdownText';
import HelpTarget from '../../components/HelpTarget';

const FALLBACK_ANSWERS = [
  'Beklager, jeg klarte ikke hente et svar akkurat nå. Prøv igjen om litt!',
  'Hmm, noe gikk galt. Prøv å stille spørsmålet på nytt.',
];

export default function AiChatScreen({ inShell = false }) {
  useChildAppGuard('ai');
  const navigation = useNavigation();
  const route = useRoute();
  const paramChatId = route.params?.chatId || null;
  const wantNew = !!route.params?.newChat;
  const paramTitle = route.params?.title || null;

  const { isChild, family, familyId, meChild, uid, requestShellTab } = useApp();
  const [chatId, setChatId] = useState(wantNew ? null : paramChatId);
  const [chatTitle, setChatTitle] = useState(paramTitle || null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [disclaimerOpen, setDisclaimerOpen] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiChats, setAiChats] = useState([]);
  const flatRef = useRef(null);
  const creatingRef = useRef(false);
  const { reveal, panResponder, stampWidth } = useSwipeTimestampReveal();

  const childName = isChild ? (meChild?.name || 'Barn') : null;
  const childAge = isChild ? profileAge(meChild) : null;
  const childId = isChild ? (meChild?.id || meChild?.childId) : null;
  const suggestedPrompts = isChild ? childSuggestedPrompts(childAge) : parentSuggestedPrompts();
  const greeting = isChild
    ? childGreeting(childName, childAge)
    : PARENT_GREETING;

  // Start empty / greeting for new chats
  useEffect(() => {
    if (chatId) return;
    setMessages([{ id: 'greeting', role: 'assistant', text: greeting, createdAtMs: Date.now() }]);
  }, [chatId, greeting]);

  // ChatGPT-stil: trådhistorikk inne i AI-chatten
  useEffect(() => {
    if (!uid) return undefined;
    return listenAiChatsSimple(uid, setAiChats);
  }, [uid]);

  // Load persisted thread
  useEffect(() => {
    if (!uid || !chatId) return undefined;
    return listenAiMessages(uid, chatId, (items) => {
      if (!items.length) {
        setMessages([{ id: 'greeting', role: 'assistant', text: greeting, createdAtMs: Date.now() }]);
        ensureGreetingMessage(uid, chatId, greeting).catch(() => {});
        return;
      }
      setMessages(items.map((m) => ({
        id: m.id,
        role: m.role,
        text: m.text,
        createdAt: m.createdAt,
        createdAtMs: m.createdAtMs || m.createdAt?.toMillis?.() || 0,
      })));
    });
  }, [uid, chatId, greeting]);

  useEffect(() => {
    if (!chatId || !aiChats.length) return;
    const found = aiChats.find((c) => c.id === chatId);
    if (found?.title) setChatTitle(found.title);
  }, [chatId, aiChats]);

  const ensureChat = useCallback(async (firstUserText) => {
    if (chatId) return chatId;
    if (!uid || creatingRef.current) return chatId;
    creatingRef.current = true;
    try {
      const id = await createAiChat(uid, {
        familyId: familyId || '',
        context: isChild ? 'child' : 'parent',
        childId: childId || '',
        title: firstUserText || 'Ny AI-chat',
      });
      await ensureGreetingMessage(uid, id, greeting);
      setChatId(id);
      setChatTitle(firstUserText || 'Ny AI-chat');
      navigation.setParams?.({ chatId: id, newChat: false, title: firstUserText });
      return id;
    } finally {
      creatingRef.current = false;
    }
  }, [chatId, uid, familyId, isChild, childId, greeting, navigation]);

  const sendText = useCallback(async (text) => {
    const trimmed = String(text || '').trim();
    if (!trimmed || loading || !uid) return;

    setInput('');
    setLoading(true);

    const history = messages
      .filter((m) => m.id !== 'greeting' && !m.isGreeting)
      .slice(isChild ? -6 : -12)
      .map((m) => ({ role: m.role, text: m.text }));

    setMessages((prev) => [...prev, {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      createdAtMs: Date.now(),
    }]);

    let activeId = chatId;
    try {
      activeId = await ensureChat(trimmed);
      if (activeId) {
        await appendAiMessage(uid, activeId, { role: 'user', text: trimmed });
      }

      const fn = httpsCallable(functions, 'aiChat');
      const result = await fn({
        message: trimmed,
        context: isChild ? 'child' : 'parent',
        familyName: family?.name || '',
        familyId: familyId || '',
        childId: childId || '',
        childName: childName || '',
        childAge: childAge ?? null,
        history,
      });
      const reply = result?.data?.reply || FALLBACK_ANSWERS[0];

      setMessages((prev) => {
        const hasReply = prev.some((m) => m.role === 'assistant' && m.text === reply);
        if (hasReply) return prev;
        return [...prev, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: reply,
          createdAtMs: Date.now(),
        }];
      });
      if (activeId) {
        await appendAiMessage(uid, activeId, { role: 'assistant', text: reply });
      }
    } catch (err) {
      const msg = err?.message || '';
      const fallback = msg.includes('grense')
        ? msg
        : FALLBACK_ANSWERS[Math.floor(Math.random() * FALLBACK_ANSWERS.length)];
      if (activeId) {
        await appendAiMessage(uid, activeId, { role: 'assistant', text: fallback }).catch(() => {});
      }
      setMessages((prev) => {
        const has = prev.some((m) => m.text === fallback && m.role === 'assistant');
        if (has) return prev;
        return [...prev, {
          id: `a-${Date.now()}`,
          role: 'assistant',
          text: fallback,
          createdAtMs: Date.now(),
        }];
      });
    } finally {
      setLoading(false);
    }
  }, [
    loading, uid, chatId, ensureChat, messages, isChild,
    family?.name, familyId, childId, childName, childAge,
  ]);

  const sendMessage = useCallback(() => sendText(input), [input, sendText]);

  const startFresh = useCallback(() => {
    setChatId(null);
    setChatTitle(null);
    setHistoryOpen(false);
    setMessages([{ id: 'greeting', role: 'assistant', text: greeting, createdAtMs: Date.now() }]);
    navigation.setParams?.({ chatId: undefined, newChat: true, title: undefined });
  }, [greeting, navigation]);

  const openThread = useCallback((chat) => {
    if (!chat?.id) return;
    setChatId(chat.id);
    setChatTitle(chat.title || 'AI-chat');
    setHistoryOpen(false);
    navigation.setParams?.({ chatId: chat.id, newChat: false, title: chat.title });
  }, [navigation]);

  const renderItem = useCallback(({ item }) => {
    const isUser = item.role === 'user';
    const stamp = formatMessageStamp(item.createdAt || item.createdAtMs);
    return (
      <SwipeStampRow
        reveal={reveal}
        stampWidth={stampWidth}
        align={isUser ? 'right' : 'left'}
        stamp={<Text style={styles.stampTxt}>{stamp}</Text>}
      >
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAi]}>
          {!isUser && (
            <View style={styles.aiAvatar}>
              <Text style={{ fontSize: 16 }}>🤖</Text>
            </View>
          )}
          <View style={[styles.bubbleContent, isUser ? styles.bubbleContentUser : styles.bubbleContentAi]}>
            {isUser ? (
              <Text style={[styles.bubbleText, styles.bubbleTextUser]}>
                {item.text}
              </Text>
            ) : (
              <ChatMarkdownText
                text={item.text}
                style={[
                  styles.bubbleText,
                  isChild && styles.bubbleTextChild,
                ]}
              />
            )}
          </View>
        </View>
      </SwipeStampRow>
    );
  }, [isChild, reveal, stampWidth]);

  const disclaimer = isChild ? CHILD_DISCLAIMER : PARENT_DISCLAIMER;
  const headerTitle = chatTitle || (chatId ? 'AI-chat' : 'Ny AI-chat');

  const leave = () => {
    if (inShell) {
      requestShellTab?.('home');
      return;
    }
    if (navigation.canGoBack?.()) navigation.goBack();
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <View style={styles.header}>
          {!inShell && navigation.canGoBack?.() ? (
            <TouchableOpacity onPress={leave} style={styles.backBtn} accessibilityLabel="Tilbake">
              <Ionicons name="chevron-back" size={22} color={colors.ink} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            onPress={() => setHistoryOpen(true)}
            style={styles.iconBtn}
            accessibilityLabel="Mine AI-chatter"
          >
            <Ionicons name="menu-outline" size={20} color={colors.ink} />
          </TouchableOpacity>
          {!inShell ? <Text style={{ fontSize: 20 }}>🤖</Text> : null}
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {inShell ? (chatTitle || 'Ny chat') : headerTitle}
            </Text>
            <Text style={styles.headerSub}>
              {isChild ? `Hei ${childName?.split(/\s+/)[0] || 'du'}!` : 'ProTop Hjelper'}
            </Text>
          </View>
          <HelpTarget id="add" onAdvance={startFresh}>
            <TouchableOpacity onPress={startFresh} style={styles.iconBtn} accessibilityLabel="Ny chat">
              <Ionicons name="create-outline" size={20} color={colors.brand} />
            </TouchableOpacity>
          </HelpTarget>
        </View>

        {disclaimerOpen && (
          <View style={styles.disclaimer}>
            <Ionicons name="information-circle-outline" size={14} color="#f59e0b" />
            <Text style={styles.disclaimerTxt} numberOfLines={2}>{disclaimer}</Text>
            <TouchableOpacity onPress={() => setDisclaimerOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={16} color="#92400e" />
            </TouchableOpacity>
          </View>
        )}

        <Modal visible={historyOpen} transparent animationType="fade" onRequestClose={() => setHistoryOpen(false)}>
          <Pressable style={styles.historyBackdrop} onPress={() => setHistoryOpen(false)}>
            <Pressable style={styles.historySheet} onPress={(e) => e.stopPropagation()}>
              <View style={styles.historyHead}>
                <Text style={styles.historyTitle}>Mine AI-chatter</Text>
                <TouchableOpacity onPress={() => setHistoryOpen(false)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={colors.ink} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.historyNew} onPress={startFresh}>
                <Ionicons name="add-circle-outline" size={20} color={colors.brand} />
                <Text style={styles.historyNewTxt}>Ny AI-chat</Text>
              </TouchableOpacity>
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {aiChats.length === 0 ? (
                  <Text style={styles.historyEmpty}>Ingen lagrede chatter ennå. Still et spørsmål for å starte.</Text>
                ) : aiChats.map((c) => {
                  const active = c.id === chatId;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.historyRow, active && styles.historyRowActive]}
                      onPress={() => openThread(c)}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.historyName} numberOfLines={1}>
                          {c.title || 'AI-chat'}
                        </Text>
                        <Text style={styles.historyPreview} numberOfLines={1}>
                          {c.preview || '…'}
                        </Text>
                      </View>
                      <Text style={styles.historyTime}>
                        {formatThreadTime(c.updatedAt || c.updatedAtMs)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

        {suggestedPrompts.length > 0 && messages.length <= 1 && (
          <HelpTarget id="content" style={{ width: '100%' }}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsRow}
            >
              {suggestedPrompts.map((prompt) => (
                <TouchableOpacity
                  key={prompt}
                  style={styles.chip}
                  onPress={() => sendText(prompt)}
                  disabled={loading}
                  accessibilityRole="button"
                  accessibilityLabel={prompt}
                >
                  <Text style={styles.chipText} numberOfLines={1}>{prompt}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </HelpTarget>
        )}

        <SwipeTimestampHost panResponder={panResponder}>
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.chatList}
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
            onLayout={() => flatRef.current?.scrollToEnd({ animated: false })}
          />
        </SwipeTimestampHost>

        <Text style={styles.swipeHint}>Dra mot venstre for dato og tid</Text>

        {loading && (
          <View style={styles.typingRow}>
            <View style={styles.aiAvatar}><Text style={{ fontSize: 14 }}>🤖</Text></View>
            <View style={styles.typingBubble}>
              <ActivityIndicator size="small" color={colors.brand} />
              <Text style={styles.typingTxt}>Tenker...</Text>
            </View>
          </View>
        )}

        <HelpTarget id="input" style={{ width: '100%' }}>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, isChild && styles.inputChild]}
              value={input}
              onChangeText={setInput}
              placeholder={isChild ? 'Spør om lekser, lesing, gjøremål…' : 'Spør om plan, middag, barn — eller hva som helst…'}
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={500}
              onSubmitEditing={sendMessage}
              returnKeyType="send"
              blurOnSubmit
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!input.trim() || loading) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!input.trim() || loading}
            >
              <Ionicons name="send" size={18} color={input.trim() && !loading ? '#fff' : '#94a3b8'} />
            </TouchableOpacity>
          </View>
        </HelpTarget>
      </KeyboardAvoidingView>
      <ModuleIntroHost scope="family" moduleId="ai" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: colors.card, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  backBtn: { padding: 2 },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line,
  },
  headerTitle: { fontWeight: '800', fontSize: 15, color: colors.ink },
  headerSub: { color: colors.muted, fontWeight: '600', fontSize: 11 },

  disclaimer: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#fffbeb', paddingHorizontal: 10, paddingVertical: 6,
    marginHorizontal: 10, marginTop: 6,
    borderRadius: 8, borderWidth: 1, borderColor: '#fde68a',
  },
  disclaimerTxt: { flex: 1, color: '#92400e', fontSize: 11, fontWeight: '600' },

  chipsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4,
  },
  chip: {
    flexShrink: 0,
    backgroundColor: '#eef6ff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth, borderColor: '#bfdbfe',
    maxHeight: 28, justifyContent: 'center',
  },
  chipText: { color: '#0b74d1', fontWeight: '600', fontSize: 12, lineHeight: 16 },

  historyBackdrop: {
    flex: 1, backgroundColor: 'rgba(15,23,42,0.4)', justifyContent: 'flex-end',
  },
  historySheet: {
    backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 24, maxHeight: '78%',
  },
  historyHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
  },
  historyTitle: { fontWeight: '900', fontSize: 17, color: colors.ink },
  historyNew: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  historyNewTxt: { fontWeight: '800', fontSize: 14, color: colors.brand },
  historyEmpty: {
    paddingVertical: 20, color: colors.muted, fontWeight: '600', fontSize: 13, textAlign: 'center',
  },
  historyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  historyRowActive: { backgroundColor: '#eef6ff', marginHorizontal: -6, paddingHorizontal: 6, borderRadius: 10 },
  historyName: { fontWeight: '800', fontSize: 14, color: colors.ink },
  historyPreview: { fontSize: 12, fontWeight: '500', color: colors.muted, marginTop: 2 },
  historyTime: { fontSize: 11, fontWeight: '600', color: colors.muted },

  chatList: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4, flexGrow: 1 },
  stampTxt: { fontSize: 10, fontWeight: '700', color: '#94a3b8', textAlign: 'right' },
  swipeHint: {
    textAlign: 'center', fontSize: 10, fontWeight: '600', color: '#94a3b8',
    paddingBottom: 2,
  },

  bubble: { flexDirection: 'row', gap: 6, maxWidth: '100%' },
  bubbleUser: { justifyContent: 'flex-end' },
  bubbleAi: { justifyContent: 'flex-start' },
  aiAvatar: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  bubbleContent: { maxWidth: '78%', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 14 },
  bubbleContentUser: { backgroundColor: colors.brand, borderBottomRightRadius: 4 },
  bubbleContentAi: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderBottomLeftRadius: 4,
  },
  bubbleText: { fontSize: 14, lineHeight: 20, color: colors.ink, fontWeight: '500' },
  bubbleTextChild: { fontSize: 15, lineHeight: 22 },
  bubbleTextUser: { color: '#fff' },

  typingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingBottom: 6,
  },
  typingBubble: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.card, borderRadius: 14, padding: 8,
    borderWidth: 1, borderColor: colors.line,
  },
  typingTxt: { color: colors.muted, fontWeight: '600', fontSize: 12 },

  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: colors.card, borderTopWidth: 1, borderTopColor: colors.line,
  },
  input: {
    flex: 1, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: colors.line,
    borderRadius: 18, paddingHorizontal: 14, paddingVertical: 8,
    fontSize: 16, fontWeight: '500', color: colors.ink, maxHeight: 90,
  },
  inputChild: { minHeight: 40 },
  sendBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#e2e8f0' },
});
