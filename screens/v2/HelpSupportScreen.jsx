/**
 * Help & Support portal — searchable articles, Skjetten bot, tickets, deploy news.
 * Opened as Mer subView `help` (also from Settings → Om).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, FlatList,
  ScrollView, ActivityIndicator, Image, KeyboardAvoidingView, Platform,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useHelp } from '../../src/context/HelpContext';
import { useI18n } from '../../src/i18n';
import { colors, deskType, useLayout } from '../../src/theme';
import { Screen } from '../../components/ui';
import HelpTarget from '../../components/HelpTarget';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import {
  articlesForCategory,
  buildHelpKnowledgeSnippets,
  listHelpCategories,
  localizeHelpArticle,
  getHelpArticle,
  resolveHelpAudience,
  resolveHelpDevice,
  searchHelpArticles,
} from '../../src/utils/helpCatalog';
import { formatNewsDate, listHelpNews } from '../../src/utils/helpNews';
import { groupUpdatesByDay } from '../../src/utils/appUpdatesLogic';
import {
  askSupportBot,
  appendTicketUserMessage,
  createSupportTicket,
  listenSupportMessages,
  listenSupportTickets,
  looksLikeBugReport,
  statusLabel,
} from '../../src/utils/supportTickets';
import { HELP_ESCALATE_AFTER, localHelpBotReply, shouldSuggestSupport } from '../../src/utils/helpBotLocal';
import { pickImage, uploadImage } from '../../src/utils/media';
import { profileAge, ageBand } from '../../src/utils/age';

const VIEWS = {
  hub: 'hub',
  category: 'category',
  article: 'article',
  bot: 'bot',
  tickets: 'tickets',
  form: 'form',
  ticket: 'ticket',
  news: 'news',
};

function Chip({ label, active, onPress, icon }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.chipOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
    >
      {icon ? <Ionicons name={icon} size={14} color={active ? '#fff' : colors.brand} /> : null}
      <Text style={[styles.chipTxt, active && styles.chipTxtOn]} numberOfLines={1}>{label}</Text>
    </TouchableOpacity>
  );
}

function ArticleRow({ item, onPress, compact }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.articleRow, compact && styles.articleRowDesk]}
      accessibilityRole="button"
    >
      <View style={[styles.articleIcon, { backgroundColor: item.soft || '#eef6ff' }]}>
        <Ionicons name={item.icon || 'help-circle-outline'} size={compact ? 16 : 18} color={item.accent || colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.articleTitle, compact && styles.articleTitleDesk]} numberOfLines={2}>
          {item.title}
        </Text>
        {item.summary ? (
          <Text style={[styles.articleSub, compact && styles.articleSubDesk]} numberOfLines={2}>
            {item.summary}
          </Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
    </TouchableOpacity>
  );
}

export default function HelpSupportScreen() {
  const { t, lang } = useI18n();
  const { isDesktop, isTablet, isPhone } = useLayout();
  const compact = isDesktop;
  const {
    uid, familyId, isChild, isParent, meChild, activeProfile, user,
    currentAgeBand, shellIntent, clearShellIntent,
  } = useApp();
  const { openModuleHelp } = useHelp();

  const layout = { isDesktop, isTablet, isPhone };
  const device = resolveHelpDevice(layout);
  const band = currentAgeBand || ageBand(profileAge(isChild ? meChild : activeProfile));
  const audience = resolveHelpAudience({ isChild, isParent, ageBand: band });

  const [view, setView] = useState(VIEWS.hub);
  const [query, setQuery] = useState('');
  const [categoryId, setCategoryId] = useState(null);
  const [articleId, setArticleId] = useState(null);
  const [ticketId, setTicketId] = useState(null);

  useHelpScene(view === VIEWS.hub ? 'hub' : 'inner', {
    onRetreat: () => setView(VIEWS.hub),
  });

  // Bot state
  const [botMessages, setBotMessages] = useState([]);
  const [botInput, setBotInput] = useState('');
  const [botLoading, setBotLoading] = useState(false);
  const [userQueryCount, setUserQueryCount] = useState(0);
  const [suggestSupport, setSuggestSupport] = useState(false);
  const botListRef = useRef(null);

  // Tickets
  const [tickets, setTickets] = useState([]);
  const [ticketMessages, setTicketMessages] = useState([]);
  const [formTitle, setFormTitle] = useState('');
  const [formBody, setFormBody] = useState('');
  const [formEmail, setFormEmail] = useState(user?.email || '');
  const [formAttachment, setFormAttachment] = useState(null);
  const [formBusy, setFormBusy] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyBusy, setReplyBusy] = useState(false);

  const categories = useMemo(() => listHelpCategories(lang), [lang]);
  const news = useMemo(() => listHelpNews({ lang, limit: 40 }), [lang]);
  const newsByDay = useMemo(() => groupUpdatesByDay(news), [news]);
  const knowledge = useMemo(
    () => buildHelpKnowledgeSnippets({ lang, limit: 20 }),
    [lang],
  );

  const searchResults = useMemo(
    () => searchHelpArticles(query, { lang, audience, device, limit: 30 }),
    [query, lang, audience, device],
  );

  const categoryArticles = useMemo(() => {
    if (!categoryId) return [];
    return articlesForCategory(categoryId, { lang, audience, device });
  }, [categoryId, lang, audience, device]);

  const activeArticle = useMemo(() => {
    if (!articleId) return null;
    const raw = getHelpArticle(articleId);
    return localizeHelpArticle(raw, { lang, audience, device });
  }, [articleId, lang, audience, device]);

  const activeTicket = useMemo(
    () => tickets.find((x) => x.id === ticketId) || null,
    [tickets, ticketId],
  );

  const needsContactEmail = isChild && !user?.email;

  useEffect(() => {
    if (shellIntent !== 'help-news') return;
    setView(VIEWS.news);
    clearShellIntent?.();
  }, [shellIntent, clearShellIntent]);

  useEffect(() => {
    if (!uid) return undefined;
    return listenSupportTickets(uid, setTickets);
  }, [uid]);

  useEffect(() => {
    if (!uid || !ticketId) {
      setTicketMessages([]);
      return undefined;
    }
    return listenSupportMessages(uid, ticketId, setTicketMessages);
  }, [uid, ticketId]);

  useEffect(() => {
    if (view !== VIEWS.bot) return;
    if (botMessages.length) return;
    const greet = audience === 'child'
      ? t('help.botGreetChild')
      : audience === 'teen' || audience === 'youth'
        ? t('help.botGreetTeen')
        : t('help.botGreet');
    setBotMessages([{ id: 'greet', role: 'assistant', text: greet }]);
  }, [view, botMessages.length, audience, t]);

  const goHub = () => {
    setView(VIEWS.hub);
    setCategoryId(null);
    setArticleId(null);
    setTicketId(null);
  };

  const openArticle = (id) => {
    setArticleId(id);
    setView(VIEWS.article);
  };

  const openCategory = (id) => {
    setCategoryId(id);
    setView(VIEWS.category);
  };

  const openBot = () => setView(VIEWS.bot);
  const openForm = (prefill = {}) => {
    if (prefill.title) setFormTitle(prefill.title);
    if (prefill.body) setFormBody(prefill.body);
    setView(VIEWS.form);
  };

  const sendBot = useCallback(async () => {
    const text = botInput.trim();
    if (!text || botLoading) return;
    setBotInput('');
    const nextCount = userQueryCount + 1;
    const userMsg = { id: `u-${Date.now()}`, role: 'user', text };
    setBotMessages((prev) => [...prev, userMsg]);
    setBotLoading(true);
    try {
      const history = botMessages
        .filter((m) => m.id !== 'greet')
        .slice(-10)
        .map((m) => ({ role: m.role, text: m.text }));
      let data = null;
      try {
        data = await askSupportBot({
          message: text,
          audience,
          device,
          lang,
          familyId,
          userQueryCount,
          knowledge,
          history,
        });
      } catch {
        data = null;
      }
      const reply = data?.reply || localHelpBotReply(text, {
        audience,
        device,
        knowledge,
        userQueryCount: nextCount,
      });
      setBotMessages((prev) => [...prev, {
        id: `a-${Date.now()}`,
        role: 'assistant',
        text: reply,
      }]);
      const count = data?.userQueryCount || nextCount;
      setUserQueryCount(count);
      if (data?.suggestSupport || shouldSuggestSupport(text, count)) {
        setSuggestSupport(true);
      }
    } catch (err) {
      const fallback = localHelpBotReply(text, {
        audience,
        device,
        knowledge,
        userQueryCount: nextCount,
      });
      setBotMessages((prev) => [...prev, {
        id: `e-${Date.now()}`,
        role: 'assistant',
        text: fallback || err?.message || t('help.botFallback'),
      }]);
      setUserQueryCount(nextCount);
      if (nextCount >= HELP_ESCALATE_AFTER) setSuggestSupport(true);
    } finally {
      setBotLoading(false);
      setTimeout(() => botListRef.current?.scrollToEnd?.({ animated: true }), 80);
    }
  }, [
    botInput, botLoading, botMessages, userQueryCount, audience, device, lang,
    familyId, knowledge, t,
  ]);

  const pickAttachment = async () => {
    try {
      const picked = await pickImage({ edit: false });
      if (!picked) return;
      setFormAttachment(picked);
    } catch {
      Alert.alert(t('common.error'), t('help.attachFail'));
    }
  };

  const submitTicket = async () => {
    const title = formTitle.trim();
    const body = formBody.trim();
    if (!title || !body || formBusy) return;

    const doCreate = async ({ allowInternalOnly }) => {
      setFormBusy(true);
      try {
        let attachmentUrls = [];
        if (formAttachment && uid) {
          const path = `users/${uid}/support/${Date.now()}.jpg`;
          const url = await uploadImage(path, formAttachment);
          if (url) attachmentUrls = [url];
        }
        const data = await createSupportTicket({
          title,
          body,
          contactEmail: formEmail.trim() || null,
          allowInternalOnly: !!allowInternalOnly,
          audience,
          device,
          lang,
          familyId,
          attachmentUrls,
          category: looksLikeBugReport(`${title} ${body}`) ? 'bug' : 'question',
        });
        setFormTitle('');
        setFormBody('');
        setFormAttachment(null);
        if (data?.ticketId) {
          setTicketId(data.ticketId);
          setView(VIEWS.ticket);
        } else {
          setView(VIEWS.tickets);
        }
        const num = data?.ticketNumber || '';
        Alert.alert(
          t('help.ticketCreatedTitle'),
          t('help.ticketCreatedBody').replace('{number}', num),
        );
      } catch (err) {
        Alert.alert(t('common.error'), err?.message || t('help.ticketFail'));
      } finally {
        setFormBusy(false);
      }
    };

    if (needsContactEmail && !formEmail.trim()) {
      Alert.alert(
        t('help.emailRequiredTitle'),
        t('help.emailRequiredBody'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('help.channelInternal'), onPress: () => doCreate({ allowInternalOnly: true }) },
        ],
      );
      return;
    }
    await doCreate({ allowInternalOnly: !needsContactEmail });
  };

  const sendTicketReply = async () => {
    const text = replyText.trim();
    if (!text || !uid || !ticketId || replyBusy) return;
    setReplyBusy(true);
    try {
      await appendTicketUserMessage(uid, ticketId, { text });
      setReplyText('');
    } catch (err) {
      Alert.alert(t('common.error'), err?.message || t('common.error'));
    } finally {
      setReplyBusy(false);
    }
  };

  const deviceLabel = device === 'desktop'
    ? t('help.deviceDesktop')
    : device === 'tablet'
      ? t('help.deviceTablet')
      : t('help.devicePhone');
  const deviceHint = t('help.deviceHint').replace('{device}', deviceLabel);

  const headerTitle = (() => {
    if (view === VIEWS.bot) return t('help.botTitle');
    if (view === VIEWS.form) return t('help.contactTitle');
    if (view === VIEWS.tickets) return t('help.myTickets');
    if (view === VIEWS.ticket) return activeTicket?.ticketNumber || t('help.myTickets');
    if (view === VIEWS.news) return t('help.newsTitle');
    if (view === VIEWS.article) return activeArticle?.title || t('help.title');
    if (view === VIEWS.category) {
      return categories.find((c) => c.id === categoryId)?.title || t('help.title');
    }
    return t('help.title');
  })();

  const showBack = view !== VIEWS.hub;

  const renderHub = () => (
    <ScrollView contentContainerStyle={[styles.body, compact && styles.bodyDesk]} keyboardShouldPersistTaps="handled">
      <Text style={[styles.lead, compact && styles.leadDesk]}>{t('help.lead')}</Text>
      <Text style={styles.deviceHint}>{deviceHint}</Text>

      <HelpTarget id="input" style={{ width: '100%' }}>
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('help.searchPlaceholder')}
          placeholderTextColor={colors.placeholder}
          style={styles.searchInput}
          returnKeyType="search"
          accessibilityLabel={t('common.search')}
        />
        {query ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
            <Ionicons name="close-circle" size={18} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>
      </HelpTarget>

      <HelpTarget id="content" style={{ width: '100%' }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        <Chip icon="chatbubble-ellipses" label={t('help.askBot')} active={false} onPress={openBot} />
        <Chip icon="mail-unread-outline" label={t('help.contact')} onPress={() => openForm()} />
        <Chip icon="file-tray-outline" label={t('help.myTickets')} onPress={() => setView(VIEWS.tickets)} />
        <Chip icon="newspaper-outline" label={t('help.newsTitle')} onPress={() => setView(VIEWS.news)} />
        <Chip
          icon="bulb-outline"
          label={t('help.openLightbulb')}
          onPress={() => {
            try { openModuleHelp?.(); } catch { /* optional */ }
          }}
        />
      </ScrollView>
      </HelpTarget>

      {query.trim() ? (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, compact && styles.sectionTitleDesk]}>
            {t('help.searchResults')}
          </Text>
          <View style={styles.card}>
            {searchResults.length === 0 ? (
              <Text style={styles.empty}>{t('help.noResults')}</Text>
            ) : (
              searchResults.map((item) => (
                <ArticleRow key={item.id} item={item} compact={compact} onPress={() => openArticle(item.id)} />
              ))
            )}
          </View>
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, compact && styles.sectionTitleDesk]}>
              {t('help.categories')}
            </Text>
            <View style={styles.catGrid}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.catTile, compact && styles.catTileDesk]}
                  onPress={() => openCategory(cat.id)}
                  accessibilityRole="button"
                >
                  <View style={styles.catIcon}>
                    <Ionicons name={cat.icon} size={compact ? 16 : 20} color={colors.brand} />
                  </View>
                  <Text style={[styles.catTitle, compact && styles.catTitleDesk]} numberOfLines={2}>
                    {cat.title}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={[styles.sectionTitle, compact && styles.sectionTitleDesk]}>
              {t('help.popular')}
            </Text>
            <View style={styles.card}>
              {searchHelpArticles('', { lang, audience, device, limit: 6 }).map((item) => (
                <ArticleRow key={item.id} item={item} compact={compact} onPress={() => openArticle(item.id)} />
              ))}
            </View>
          </View>

          {news[0] ? (
            <View style={styles.section}>
              <TouchableOpacity onPress={() => setView(VIEWS.news)} style={styles.newsTeaser}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.newsEyebrow}>{t('help.latestNews')}</Text>
                  <Text style={[styles.newsTitle, compact && styles.newsTitleDesk]}>{news[0].title}</Text>
                  <Text style={styles.newsMeta}>{formatNewsDate(news[0].date, lang)}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.muted} />
              </TouchableOpacity>
            </View>
          ) : null}
        </>
      )}
      <View style={{ height: 48 }} />
    </ScrollView>
  );

  const renderCategory = () => (
    <ScrollView contentContainerStyle={[styles.body, compact && styles.bodyDesk]}>
      <View style={styles.card}>
        {categoryArticles.map((item) => (
          <ArticleRow key={item.id} item={item} compact={compact} onPress={() => openArticle(item.id)} />
        ))}
        {!categoryArticles.length ? <Text style={styles.empty}>{t('help.noResults')}</Text> : null}
      </View>
    </ScrollView>
  );

  const renderArticle = () => {
    if (!activeArticle) return <Text style={styles.empty}>{t('help.noResults')}</Text>;
    return (
      <ScrollView contentContainerStyle={[styles.body, compact && styles.bodyDesk]}>
        <View style={[styles.heroBand, { backgroundColor: activeArticle.soft || '#eef6ff' }]}>
          <View style={[styles.articleIconLg, { backgroundColor: colors.card }]}>
            <Ionicons name={activeArticle.icon || 'help-circle'} size={28} color={activeArticle.accent || colors.brand} />
          </View>
          {activeArticle.kicker ? (
            <Text style={styles.kicker}>{activeArticle.kicker}</Text>
          ) : null}
          <Text style={[styles.heroTitle, compact && styles.heroTitleDesk]}>{activeArticle.title}</Text>
          <Text style={[styles.heroSummary, compact && styles.heroSummaryDesk]}>{activeArticle.summary}</Text>
        </View>

        {activeArticle.deviceTip ? (
          <View style={styles.tipBox}>
            <Ionicons name="phone-portrait-outline" size={16} color={colors.brand} />
            <Text style={styles.tipTxt}>{activeArticle.deviceTip}</Text>
          </View>
        ) : null}

        {activeArticle.audienceTip ? (
          <View style={[styles.tipBox, styles.tipBoxSoft]}>
            <Ionicons name="people-outline" size={16} color={colors.brand} />
            <Text style={styles.tipTxt}>{activeArticle.audienceTip}</Text>
          </View>
        ) : null}

        {activeArticle.steps?.length ? (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, compact && styles.sectionTitleDesk]}>
              {t('help.steps')}
            </Text>
            <View style={styles.card}>
              {activeArticle.steps.map((step, i) => (
                <View key={`${i}-${step.slice(0, 12)}`} style={styles.stepRow}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumTxt}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.stepTxt, compact && styles.stepTxtDesk]}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.ctaRow}>
          <TouchableOpacity style={styles.primaryBtn} onPress={openBot}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#fff" />
            <Text style={styles.primaryBtnTxt}>{t('help.askBot')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => openForm({ title: activeArticle.title })}
          >
            <Text style={styles.secondaryBtnTxt}>{t('help.contact')}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    );
  };

  const renderBot = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={64}
    >
      <FlatList
        ref={botListRef}
        data={botMessages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={[styles.botList, compact && styles.bodyDesk]}
        onContentSizeChange={() => botListRef.current?.scrollToEnd?.({ animated: true })}
        renderItem={({ item }) => (
          <View style={[
            styles.bubble,
            item.role === 'user' ? styles.bubbleUser : styles.bubbleBot,
          ]}
          >
            <Text style={[
              styles.bubbleTxt,
              item.role === 'user' && styles.bubbleTxtUser,
              compact && styles.bubbleTxtDesk,
            ]}
            >
              {item.text}
            </Text>
          </View>
        )}
        ListFooterComponent={botLoading ? (
          <ActivityIndicator style={{ marginVertical: 12 }} color={colors.brand} />
        ) : null}
      />
      {suggestSupport ? (
        <TouchableOpacity
          style={styles.escalateBar}
          onPress={() => {
            const lastUser = [...botMessages].reverse().find((m) => m.role === 'user');
            openForm({
              title: lastUser?.text?.slice(0, 80) || '',
              body: botMessages
                .filter((m) => m.role === 'user')
                .map((m) => m.text)
                .slice(-3)
                .join('\n\n'),
            });
          }}
        >
          <Ionicons name="mail-unread-outline" size={18} color="#fff" />
          <Text style={styles.escalateTxt}>{t('help.suggestSupport')}</Text>
        </TouchableOpacity>
      ) : null}
      <View style={styles.composer}>
        <TextInput
          value={botInput}
          onChangeText={setBotInput}
          placeholder={t('help.botPlaceholder')}
          placeholderTextColor={colors.placeholder}
          style={styles.composerInput}
          multiline
          maxLength={2000}
          onSubmitEditing={sendBot}
        />
        <TouchableOpacity
          onPress={sendBot}
          disabled={botLoading || !botInput.trim()}
          style={[styles.sendBtn, (!botInput.trim() || botLoading) && { opacity: 0.45 }]}
          accessibilityLabel={t('help.send')}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  const renderTickets = () => (
    <ScrollView contentContainerStyle={[styles.body, compact && styles.bodyDesk]}>
      <TouchableOpacity style={styles.primaryBtn} onPress={() => openForm()}>
        <Ionicons name="add" size={18} color="#fff" />
        <Text style={styles.primaryBtnTxt}>{t('help.newTicket')}</Text>
      </TouchableOpacity>
      <View style={[styles.card, { marginTop: 12 }]}>
        {tickets.length === 0 ? (
          <Text style={styles.empty}>{t('help.noTickets')}</Text>
        ) : (
          tickets.map((tk) => (
            <TouchableOpacity
              key={tk.id}
              style={styles.ticketRow}
              onPress={() => { setTicketId(tk.id); setView(VIEWS.ticket); }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.ticketNum}>{tk.ticketNumber}</Text>
                <Text style={[styles.articleTitle, compact && styles.articleTitleDesk]} numberOfLines={1}>
                  {tk.title}
                </Text>
                <Text style={styles.articleSub} numberOfLines={1}>{tk.preview || tk.body}</Text>
              </View>
              <View style={styles.statusPill}>
                <Text style={styles.statusPillTxt}>{statusLabel(tk.status, lang === 'en' ? 'en' : 'nb')}</Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </View>
    </ScrollView>
  );

  const renderForm = () => (
    <ScrollView contentContainerStyle={[styles.body, compact && styles.bodyDesk]} keyboardShouldPersistTaps="handled">
      <Text style={styles.lead}>{t('help.formLead')}</Text>
      <Text style={styles.fieldLabel}>{t('help.formTitle')}</Text>
      <TextInput
        value={formTitle}
        onChangeText={setFormTitle}
        style={styles.field}
        maxLength={120}
        placeholder={t('help.formTitlePh')}
        placeholderTextColor={colors.placeholder}
      />
      <Text style={styles.fieldLabel}>{t('help.formBody')}</Text>
      <TextInput
        value={formBody}
        onChangeText={setFormBody}
        style={[styles.field, styles.fieldArea]}
        multiline
        maxLength={5000}
        placeholder={t('help.formBodyPh')}
        placeholderTextColor={colors.placeholder}
        textAlignVertical="top"
      />
      {(needsContactEmail || isChild) ? (
        <>
          <Text style={styles.fieldLabel}>{t('help.formEmail')}</Text>
          <Text style={styles.fieldHint}>{t('help.formEmailHint')}</Text>
          <TextInput
            value={formEmail}
            onChangeText={setFormEmail}
            style={styles.field}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder="navn@epost.no"
            placeholderTextColor={colors.placeholder}
          />
        </>
      ) : (
        <Text style={styles.fieldHint}>{t('help.channelHint')}</Text>
      )}
      <TouchableOpacity style={styles.attachBtn} onPress={pickAttachment}>
        <Ionicons name="image-outline" size={18} color={colors.brand} />
        <Text style={styles.attachTxt}>
          {formAttachment ? t('help.attachChange') : t('help.attach')}
        </Text>
      </TouchableOpacity>
      {formAttachment?.uri ? (
        <Image source={{ uri: formAttachment.uri }} style={styles.attachPreview} />
      ) : null}
      <TouchableOpacity
        style={[styles.primaryBtn, formBusy && { opacity: 0.6 }]}
        onPress={submitTicket}
        disabled={formBusy}
      >
        {formBusy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="send" size={18} color="#fff" />
            <Text style={styles.primaryBtnTxt}>{t('help.submitTicket')}</Text>
          </>
        )}
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );

  const renderTicket = () => (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={64}
    >
      <ScrollView contentContainerStyle={[styles.body, compact && styles.bodyDesk]}>
        {activeTicket ? (
          <View style={styles.ticketHeader}>
            <Text style={styles.ticketNum}>{activeTicket.ticketNumber}</Text>
            <Text style={[styles.heroTitle, compact && styles.heroTitleDesk]}>{activeTicket.title}</Text>
            <Text style={styles.newsMeta}>
              {statusLabel(activeTicket.status, lang === 'en' ? 'en' : 'nb')}
              {' · '}
              {activeTicket.channel === 'internal' ? t('help.channelInternal') : t('help.channelEmail')}
            </Text>
          </View>
        ) : null}
        {ticketMessages.map((m) => (
          <View
            key={m.id}
            style={[
              styles.bubble,
              m.role === 'user' ? styles.bubbleUser : styles.bubbleBot,
            ]}
          >
            <Text style={[
              styles.bubbleTxt,
              m.role === 'user' && styles.bubbleTxtUser,
            ]}
            >
              {m.text}
            </Text>
            {m.attachmentUrl ? (
              <Image source={{ uri: m.attachmentUrl }} style={styles.msgImage} />
            ) : null}
          </View>
        ))}
      </ScrollView>
      <View style={styles.composer}>
        <TextInput
          value={replyText}
          onChangeText={setReplyText}
          placeholder={t('help.replyPlaceholder')}
          placeholderTextColor={colors.placeholder}
          style={styles.composerInput}
          multiline
        />
        <TouchableOpacity
          onPress={sendTicketReply}
          disabled={replyBusy || !replyText.trim()}
          style={[styles.sendBtn, (!replyText.trim() || replyBusy) && { opacity: 0.45 }]}
        >
          <Ionicons name="send" size={18} color="#fff" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );

  const renderNews = () => (
    <ScrollView contentContainerStyle={[styles.body, compact && styles.bodyDesk]}>
      <Text style={styles.lead}>{t('help.newsLead')}</Text>
      {newsByDay.map((day) => (
        <View key={day.date || 'unknown'} style={styles.newsDayBlock}>
          <Text style={[styles.sectionTitle, compact && styles.sectionTitleDesk]}>
            {formatNewsDate(day.date, lang)}
          </Text>
          <View style={styles.card}>
            {day.items.map((n) => (
              <View key={n.id} style={styles.newsRow}>
                <View style={styles.newsBadgeRow}>
                  <Text style={[
                    styles.newsBadge,
                    n.level === 'major' ? styles.newsBadgeMajor : styles.newsBadgeFix,
                  ]}
                  >
                    {n.level === 'major' ? t('help.newsMajorBadge') : t('help.newsFixBadge')}
                  </Text>
                  {n.version ? (
                    <Text style={styles.newsVersion}>{t('settings.version', { version: n.version })}</Text>
                  ) : null}
                </View>
                <Text style={[styles.articleTitle, compact && styles.articleTitleDesk]}>{n.title}</Text>
                <Text style={[styles.articleSub, compact && styles.articleSubDesk]}>{n.summary}</Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );

  return (
    <Screen>
      {showBack ? (
        <View style={[styles.topBar, compact && styles.topBarDesk]}>
          <TouchableOpacity
            onPress={() => {
              if (view === VIEWS.article && categoryId) setView(VIEWS.category);
              else if (view === VIEWS.ticket) setView(VIEWS.tickets);
              else goHub();
            }}
            style={styles.backBtn}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
          >
            <Ionicons name="chevron-back" size={22} color={colors.brand} />
            <Text style={styles.backTxt}>{t('common.back')}</Text>
          </TouchableOpacity>
          <Text style={[styles.topTitle, compact && styles.topTitleDesk]} numberOfLines={1}>
            {headerTitle}
          </Text>
          <View style={{ width: 72 }} />
        </View>
      ) : null}

      {view === VIEWS.hub && renderHub()}
      {view === VIEWS.category && renderCategory()}
      {view === VIEWS.article && renderArticle()}
      {view === VIEWS.bot && renderBot()}
      {view === VIEWS.tickets && renderTickets()}
      {view === VIEWS.form && renderForm()}
      {view === VIEWS.ticket && renderTicket()}
      {view === VIEWS.news && renderNews()}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line, backgroundColor: colors.card,
  },
  topBarDesk: { paddingVertical: 6 },
  backBtn: { flexDirection: 'row', alignItems: 'center', width: 72 },
  backTxt: { color: colors.brand, fontWeight: '700', fontSize: 15 },
  topTitle: { flex: 1, textAlign: 'center', fontWeight: '800', fontSize: 16, color: colors.ink },
  topTitleDesk: { ...deskType.title, fontWeight: '600' },

  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  bodyDesk: { paddingHorizontal: 12, paddingTop: 8, maxWidth: 720 },

  lead: { fontSize: 15, fontWeight: '600', color: colors.ink, marginBottom: 6, lineHeight: 22 },
  leadDesk: { ...deskType.body, fontWeight: '400', marginBottom: 4 },
  deviceHint: { fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 12 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.card, borderRadius: 12, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 12, paddingVertical: Platform.OS === 'web' ? 10 : 8, marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 15, color: colors.ink, fontWeight: '600', ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null) },

  chipRow: { gap: 8, paddingBottom: 8, paddingRight: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
  },
  chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontSize: 13, fontWeight: '700', color: colors.ink },
  chipTxtOn: { color: '#fff' },

  section: { marginTop: 16 },
  sectionTitle: {
    fontSize: 13, fontWeight: '800', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8, marginLeft: 2,
  },
  sectionTitleDesk: { ...deskType.section, marginBottom: 6 },

  card: {
    backgroundColor: colors.card, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.line,
  },
  articleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  articleRowDesk: { paddingVertical: 10 },
  articleIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  articleIconLg: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  articleTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  articleTitleDesk: { fontSize: 13, fontWeight: '600' },
  articleSub: { fontSize: 12, fontWeight: '600', color: colors.muted, marginTop: 2 },
  articleSubDesk: { fontSize: 12, fontWeight: '400' },

  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  catTile: {
    width: '47%', backgroundColor: colors.card, borderRadius: 14, borderWidth: 1,
    borderColor: colors.line, padding: 14, minHeight: 96,
  },
  catTileDesk: { width: '31%', minHeight: 84, padding: 12, borderRadius: 8 },
  catIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: '#eef6ff',
    alignItems: 'center', justifyContent: 'center', marginBottom: 8,
  },
  catTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  catTitleDesk: { fontSize: 12, fontWeight: '600' },

  newsTeaser: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    padding: 14,
  },
  newsEyebrow: { fontSize: 11, fontWeight: '800', color: colors.brand, textTransform: 'uppercase' },
  newsTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: 4 },
  newsTitleDesk: { fontSize: 14, fontWeight: '600' },
  newsMeta: { fontSize: 12, fontWeight: '600', color: colors.muted, marginTop: 4 },
  newsDayBlock: { marginBottom: 16 },
  newsRow: {
    padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  newsBadgeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap',
  },
  newsBadge: {
    fontSize: 11, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
    overflow: 'hidden',
  },
  newsBadgeMajor: { backgroundColor: '#dbeafe', color: colors.brand },
  newsBadgeFix: { backgroundColor: '#f1f5f9', color: colors.muted },
  newsVersion: { fontSize: 12, fontWeight: '700', color: colors.muted },

  heroBand: { borderRadius: 16, padding: 16, marginBottom: 12 },
  kicker: { fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  heroTitle: { fontSize: 22, fontWeight: '900', color: colors.ink, marginBottom: 6 },
  heroTitleDesk: { fontSize: 18, fontWeight: '700' },
  heroSummary: { fontSize: 15, fontWeight: '600', color: colors.ink, lineHeight: 22 },
  heroSummaryDesk: { fontSize: 13, fontWeight: '400', lineHeight: 20 },

  tipBox: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: '#eef6ff', borderRadius: 12, padding: 12, marginBottom: 10,
  },
  tipBoxSoft: { backgroundColor: '#f8fafc' },
  tipTxt: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.ink, lineHeight: 19 },

  stepRow: {
    flexDirection: 'row', gap: 12, padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  stepNum: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumTxt: { color: '#fff', fontWeight: '800', fontSize: 13 },
  stepTxt: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.ink, lineHeight: 20 },
  stepTxtDesk: { fontSize: 13, fontWeight: '500' },

  ctaRow: { gap: 10, marginTop: 16 },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brand, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 16,
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 15 },
  secondaryBtn: {
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, paddingVertical: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card,
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },

  botList: { padding: 16, paddingBottom: 24 },
  bubble: {
    maxWidth: '88%', borderRadius: 16, padding: 12, marginBottom: 10,
  },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: colors.brand },
  bubbleBot: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  bubbleTxt: { fontSize: 14, fontWeight: '600', color: colors.ink, lineHeight: 20 },
  bubbleTxtUser: { color: '#fff' },
  bubbleTxtDesk: { fontSize: 13, fontWeight: '400' },

  escalateBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#0f766e', paddingVertical: 12, paddingHorizontal: 12,
  },
  escalateTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },

  composer: {
    flexDirection: 'row', alignItems: 'flex-end', gap: 8,
    padding: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, backgroundColor: colors.card,
  },
  composerInput: {
    flex: 1, maxHeight: 120, minHeight: 40, borderRadius: 12, borderWidth: 1,
    borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, fontWeight: '600', color: colors.ink,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  sendBtn: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: colors.brand,
    alignItems: 'center', justifyContent: 'center',
  },

  ticketRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  ticketNum: { fontSize: 12, fontWeight: '800', color: colors.brand },
  ticketHeader: { marginBottom: 12 },
  statusPill: {
    backgroundColor: '#eef6ff', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  statusPillTxt: { fontSize: 11, fontWeight: '800', color: colors.brand },

  fieldLabel: { fontSize: 13, fontWeight: '800', color: colors.ink, marginTop: 12, marginBottom: 6 },
  fieldHint: { fontSize: 12, fontWeight: '600', color: colors.muted, marginBottom: 8, lineHeight: 18 },
  field: {
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 12, fontSize: 15, fontWeight: '600', color: colors.ink,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  fieldArea: { minHeight: 140 },
  attachBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, marginBottom: 10,
    alignSelf: 'flex-start',
  },
  attachTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },
  attachPreview: { width: '100%', height: 160, borderRadius: 12, marginBottom: 12, backgroundColor: '#e2e8f0' },
  msgImage: { width: 180, height: 120, borderRadius: 10, marginTop: 8 },

  empty: { padding: 16, textAlign: 'center', color: colors.muted, fontWeight: '600' },
});
