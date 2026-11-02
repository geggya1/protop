/**
 * Hjelp og support for brukerne.
 *
 * Bygget etter det som virker hos Zendesk, Intercom og Help Scout:
 *  - Søk først: stort søkefelt med svar mens du skriver.
 *  - «Mest stilte spørsmål» og emner rett under.
 *  - ProTop-assistenten (AI) svarer før saken blir en sak.
 *  - Saksskjemaet foreslår artikler mens du skriver (ticket deflection),
 *    tar imot skjermbilder (lim inn / dra) og sender teknisk info automatisk.
 *  - Kvittering med saksnummer, «Mine saker» med samtale, løst/gjenåpne og vurdering.
 *
 * Åpnes som Mer → help, fra lyspæren og fra /hjelp/... lenker i e-post.
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useOptionalApp } from '../../src/context/AppContext';
import { useLayout } from '../../src/theme';
import {
  ARTICLE_GROUPS, articlesInGroup, getArticle, groupCounts, popularArticles, relatedArticles, searchArticles, suggestForTicket,
} from '../../src/helpdesk/articles';
import {
  CATEGORIES, CATEGORY_ORDER, IMPACTS, IMPACT_ORDER, LIMITS, MODULES, MODULE_ORDER, categoryLabel, formatWhen, isOpenStatus,
  moduleLabel, pickText,
} from '../../src/helpdesk/model';
import { helpdeskCall, onHelpdeskChange } from '../../src/helpdesk/client';
import { collectDiagnostics } from '../../src/helpdesk/diagnostics';
import { toUpload } from '../../src/helpdesk/images';
import {
  AttachmentPicker, Btn, Chip, DiagnosticsPreview, Empty, Field, HD, Notice, RemoteImage, SectionTitle, StatusPill, s as ui,
} from '../../components/helpdesk/HelpdeskUi';
import { radius, type } from '../../src/ui/tokens';
import AssistantChat from '../../components/assistant/AssistantChat';
import { isOrganizationType } from '../../src/utils/groupTypes';
import { useHelpAccess } from '../../src/help/useHelpAccess';
import { condenseStepLocks } from '../../src/help/helpAccess';
import { formatNewsDate, listHelpNews } from '../../src/utils/helpNews';
import { groupUpdatesByDay } from '../../src/utils/appUpdatesLogic';

const lang = 'nb';
const POLL_MS = 30000;

/* ─────────── Små deler ─────────── */

function ArticleRow({ article, onPress, index, testID }) {
  return (
    <TouchableOpacity style={st.articleRow} onPress={onPress} accessibilityRole="button" testID={testID}>
      {index != null ? (
        <Text style={st.rank}>{index + 1}</Text>
      ) : (
        <View style={st.articleIcon}><Ionicons name={article.icon || 'document-text-outline'} size={18} color={HD.brand} /></View>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={st.articleTitle} numberOfLines={2}>{article.title}</Text>
        {article.summary ? <Text style={st.articleSub} numberOfLines={2}>{article.summary}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={16} color={HD.muted} />
    </TouchableOpacity>
  );
}

function Crumbs({ items }) {
  return (
    <View style={st.crumbs}>
      {items.map((it, i) => (
        <View key={it.label} style={st.crumbItem}>
          {i > 0 ? <Ionicons name="chevron-forward" size={12} color={HD.muted} /> : null}
          {it.onPress ? (
            <TouchableOpacity onPress={it.onPress} accessibilityRole="link"><Text style={st.crumbLink}>{it.label}</Text></TouchableOpacity>
          ) : <Text style={st.crumbHere} numberOfLines={1}>{it.label}</Text>}
        </View>
      ))}
    </View>
  );
}

/* ─────────── Skjermen ─────────── */

export default function HelpCenterScreen({ initial = null, demo = false }) {
  const app = useOptionalApp() || {};
  const {
    user, family, shellIntent, clearShellIntent, requestShellTab, shellNav, activeProfile, role: userRole,
  } = app;
  const { isDesktop, isPhone } = useLayout();
  const [view, setView] = useState({ name: 'home' });
  const [history, setHistory] = useState([]);
  const [query, setQuery] = useState('');
  const [tickets, setTickets] = useState(null);
  const [draft, setDraft] = useState(null);
  const viewed = useRef(new Set());
  const scrollRef = useRef(null);
  // Hjelpen viser bare sider brukeren har tilgang til, og sier fra om låste steg.
  const helpAccess = useHelpAccess();
  const canSee = useCallback((a) => !a?.pageKey || helpAccess.canSee(a), [helpAccess]);

  const go = useCallback((next) => {
    setHistory((h) => [...h, view].slice(-20));
    setView(next);
    try { scrollRef.current?.scrollTo?.({ y: 0, animated: false }); } catch { /* ignore */ }
  }, [view]);
  const back = useCallback(() => {
    setHistory((h) => {
      const prev = h[h.length - 1];
      setView(prev || { name: 'home' });
      return h.slice(0, -1);
    });
  }, []);
  const home = useCallback(() => { setHistory([]); setView({ name: 'home' }); }, []);

  const loadTickets = useCallback(async () => {
    try {
      const res = await helpdeskCall('myTickets');
      setTickets(res?.tickets || []);
    } catch {
      setTickets((t) => t || []);
    }
  }, []);

  useEffect(() => {
    loadTickets();
    const off = onHelpdeskChange(() => loadTickets());
    const timer = setInterval(loadTickets, POLL_MS);
    return () => { off(); clearInterval(timer); };
  }, [loadTickets]);

  // Lenker fra e-post (/hjelp/sak/:id, ?vurder=1) og fra lyspæren/assistenten.
  const applyIntent = useCallback((intent) => {
    // «Hva er nytt» fra Innstillinger og oppdateringsvarselet.
    if (intent === 'help-news') { setView({ name: 'news' }); return true; }
    if (!intent || typeof intent !== 'object' || intent.type !== 'helpdesk') return false;
    if (intent.view === 'ticket' && intent.id) setView({ name: 'ticket', id: intent.id, rate: intent.rate || null });
    else if (intent.view === 'article' && intent.id) setView({ name: 'article', id: intent.id });
    else if (intent.view === 'new') { setDraft(intent.prefill || null); setView({ name: 'new' }); }
    else if (intent.view === 'tickets') setView({ name: 'tickets' });
    else if (intent.view === 'assistant') setView({ name: 'assistant', ask: intent.ask || null });
    else setView({ name: 'home' });
    return true;
  }, []);

  useEffect(() => { if (initial) applyIntent(initial); }, [initial, applyIntent]);
  useEffect(() => {
    if (applyIntent(shellIntent)) clearShellIntent?.();
  }, [shellIntent, clearShellIntent, applyIntent]);

  const openArticle = useCallback((article) => {
    if (!article) return;
    if (!viewed.current.has(article.id)) {
      viewed.current.add(article.id);
      helpdeskCall('articleFeedback', { articleId: article.id, kind: 'view' }).catch(() => {});
    }
    go({ name: 'article', id: article.id });
  }, [go]);

  const startTicket = useCallback((prefill = null) => {
    setDraft(prefill);
    go({ name: 'new' });
  }, [go]);

  const unread = (tickets || []).filter((t) => t.unreadForRequester).length;
  const openCount = (tickets || []).filter((t) => isOpenStatus(t.status)).length;
  const shellTab = shellNav?.tab || '';
  const firstName = [user?.displayName, activeProfile?.name]
    .map((n) => String(n || '').trim().split(' ')[0])
    .find((n) => n && n.toLowerCase() !== 'meg') || '';
  const company = isOrganizationType(family?.type);

  const ctx = {
    go, back, home, openArticle, startTicket, tickets, loadTickets, query, setQuery, unread, openCount, firstName,
    isDesktop, isPhone, draft, setDraft, viewed, user, family, company, requestShellTab, shellTab, userRole, demo,
    helpAccess, canSee,
  };

  let body;
  switch (view.name) {
    case 'article': body = <ArticleView ctx={ctx} id={view.id} />; break;
    case 'group': body = <GroupView ctx={ctx} id={view.id} />; break;
    case 'search': body = <SearchView ctx={ctx} />; break;
    case 'assistant': body = <AssistantView ctx={ctx} ask={view.ask} />; break;
    case 'new': body = <NewTicketView ctx={ctx} />; break;
    case 'sent': body = <SentView ctx={ctx} result={view.result} />; break;
    case 'tickets': body = <TicketsView ctx={ctx} />; break;
    case 'ticket': body = <TicketView ctx={ctx} id={view.id} rate={view.rate} />; break;
    case 'news': body = <NewsView ctx={ctx} />; break;
    default: body = <HomeView ctx={ctx} />;
  }

  if (view.name === 'assistant') {
    return <View style={[st.root, { flex: 1 }]} testID="help-center">{body}</View>;
  }

  return (
    <KeyboardAvoidingView style={st.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined} testID="help-center">
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={[st.page, isDesktop && st.pageDesk]}
        keyboardShouldPersistTaps="handled"
      >
        {view.name !== 'home' ? (
          <TouchableOpacity onPress={back} style={st.back} accessibilityRole="button" testID="help-back">
            <Ionicons name="arrow-back" size={18} color={HD.brand} />
            <Text style={st.backTxt}>Tilbake</Text>
          </TouchableOpacity>
        ) : null}
        {body}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/* ─────────── Forsiden ─────────── */

function SearchBox({ ctx, autoFocus = false }) {
  const { query, setQuery, go } = ctx;
  return (
    <View style={st.searchBox}>
      <Ionicons name="search" size={20} color={HD.muted} />
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Søk i hjelpen, f.eks. «faktura», «passord» eller «hvit skjerm»"
        placeholderTextColor={HD.placeholder}
        style={st.searchInput}
        returnKeyType="search"
        autoFocus={autoFocus}
        onSubmitEditing={() => query.trim() && go({ name: 'search' })}
        accessibilityLabel="Søk i hjelp"
        testID="help-search"
      />
      {query ? (
        <TouchableOpacity onPress={() => setQuery('')} accessibilityLabel="Tøm søket" accessibilityRole="button">
          <Ionicons name="close-circle" size={20} color={HD.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function HomeView({ ctx }) {
  const {
    query, openArticle, go, startTicket, unread, openCount, firstName, isDesktop,
  } = ctx;
  const [views, setViews] = useState(null);
  useEffect(() => {
    helpdeskCall('popular').then((r) => setViews(r?.views || null)).catch(() => {});
  }, []);
  const popular = useMemo(() => popularArticles(lang, { limit: 12, views }).filter(ctx.canSee).slice(0, 10), [views, ctx]);
  const counts = useMemo(() => groupCounts(lang), []);
  const live = useMemo(() => (query.trim().length >= 2
    ? searchArticles(query, { lang, limit: 12 }).filter((r) => ctx.canSee(r.article)).slice(0, 6)
    : []), [query, ctx]);

  return (
    <View>
      <View style={st.hero}>
        <Text style={st.heroKicker}>Hjelp og support</Text>
        <Text style={st.heroTitle}>{firstName ? `Hei ${firstName}, hva trenger du hjelp med?` : 'Hva trenger du hjelp med?'}</Text>
        <SearchBox ctx={ctx} />
        {live.length ? (
          <View style={st.liveBox} testID="help-live-results">
            {live.map(({ article }) => (
              <ArticleRow key={article.id} article={article} onPress={() => openArticle(article)} />
            ))}
            <TouchableOpacity onPress={() => go({ name: 'search' })} style={st.liveMore} accessibilityRole="button">
              <Text style={ui.link}>Se alle treff for «{query.trim()}»</Text>
            </TouchableOpacity>
          </View>
        ) : query.trim().length >= 2 ? (
          <View style={st.liveBox}>
            <Text style={st.noHit}>Ingen artikler passet. Spør assistenten eller kontakt oss.</Text>
          </View>
        ) : null}
      </View>

      <View style={[st.actions, isDesktop && st.actionsDesk]}>
        <ActionCard
          icon="sparkles"
          color={HD.violet}
          title="Spør ProTop-assistenten"
          text="Få svar med en gang, døgnet rundt."
          onPress={() => go({ name: 'assistant' })}
          testID="help-action-assistant"
        />
        <ActionCard
          icon="chatbubbles"
          color={HD.brand}
          title="Kontakt support"
          text="Send en sak. Du får saksnummer og svar på e-post."
          onPress={() => startTicket()}
          testID="help-action-contact"
        />
        <ActionCard
          icon="file-tray-full"
          color={HD.teal}
          title="Mine saker"
          text={openCount ? `${openCount} åpne${unread ? ` · ${unread} nye svar` : ''}` : 'Se saker du har sendt.'}
          badge={unread}
          onPress={() => go({ name: 'tickets' })}
          testID="help-action-tickets"
        />
      </View>

      <SectionTitle>Mest stilte spørsmål</SectionTitle>
      <View style={st.card} testID="help-popular">
        {popular.map((a, i) => (
          <ArticleRow key={a.id} article={a} index={i} onPress={() => openArticle(a)} testID={`popular-${a.id}`} />
        ))}
      </View>

      <SectionTitle>Bla i emner</SectionTitle>
      <View style={st.groupGrid}>
        {ARTICLE_GROUPS.map((g) => (
          <TouchableOpacity
            key={g.id}
            style={[st.groupCard, isDesktop && st.groupCardDesk]}
            onPress={() => go({ name: 'group', id: g.id })}
            accessibilityRole="button"
            testID={`group-${g.id}`}
          >
            <View style={[st.groupIcon, { backgroundColor: `${g.color}18` }]}>
              <Ionicons name={g.icon} size={20} color={g.color} />
            </View>
            <Text style={st.groupTitle} numberOfLines={2}>{pickText(g.title, lang)}</Text>
            <Text style={st.groupCount}>{counts[g.id] || 0} artikler</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={st.newsLink} onPress={() => go({ name: 'news' })} accessibilityRole="button" testID="help-news-link">
        <Ionicons name="newspaper-outline" size={18} color={HD.brand} />
        <Text style={ui.link}>Nyheter og oppdateringer i ProTop</Text>
      </TouchableOpacity>

      <View style={st.footerCta}>
        <Ionicons name="time-outline" size={22} color={HD.brand} />
        <View style={{ flex: 1 }}>
          <Text style={st.footerTitle}>Fant du ikke svaret?</Text>
          <Text style={st.footerTxt}>Vi svarer normalt innen én arbeidsdag. Haster det, velg «Jeg kommer ikke videre» i saken.</Text>
        </View>
        <Btn label="Kontakt support" icon="send" onPress={() => startTicket()} small testID="help-footer-contact" />
      </View>
    </View>
  );
}

function ActionCard({
  icon, color, title, text, onPress, badge, testID,
}) {
  return (
    <TouchableOpacity style={st.actionCard} onPress={onPress} accessibilityRole="button" testID={testID}>
      <View style={[st.actionIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={22} color={color} />
        {badge ? <View style={st.badge}><Text style={st.badgeTxt}>{badge}</Text></View> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={st.actionTitle}>{title}</Text>
        <Text style={st.actionTxt}>{text}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={HD.muted} />
    </TouchableOpacity>
  );
}

/* ─────────── Søk, emne og artikkel ─────────── */

function SearchView({ ctx }) {
  const { query, openArticle, go, startTicket } = ctx;
  const results = useMemo(() => searchArticles(query, { lang, limit: 40 }).filter((r) => ctx.canSee(r.article)).slice(0, 30), [query, ctx]);
  return (
    <View>
      <Crumbs items={[{ label: 'Hjelpesenter', onPress: ctx.home }, { label: 'Søk' }]} />
      <SearchBox ctx={ctx} autoFocus />
      <Text style={st.resultCount}>{results.length ? `${results.length} treff` : 'Ingen treff'}</Text>
      {results.length ? (
        <View style={st.card}>
          {results.map(({ article }) => <ArticleRow key={article.id} article={article} onPress={() => openArticle(article)} />)}
        </View>
      ) : (
        <Empty icon="search" title="Vi fant ingen artikler" text="Prøv andre ord, spør assistenten, eller send oss en sak.">
          <View style={st.rowGap}>
            <Btn label="Spør assistenten" icon="sparkles" kind="secondary" onPress={() => go({ name: 'assistant', ask: query })} small />
            <Btn label="Kontakt support" icon="send" onPress={() => startTicket({ subject: query })} small />
          </View>
        </Empty>
      )}
    </View>
  );
}

function GroupView({ ctx, id }) {
  const group = ARTICLE_GROUPS.find((g) => g.id === id);
  const list = useMemo(() => articlesInGroup(id, lang).filter(ctx.canSee), [id, ctx]);
  const support = list.filter((a) => a.kind === 'support');
  const guides = list.filter((a) => a.kind !== 'support');
  return (
    <View>
      <Crumbs items={[{ label: 'Hjelpesenter', onPress: ctx.home }, { label: pickText(group?.title, lang) }]} />
      <Text style={st.h1}>{pickText(group?.title, lang)}</Text>
      {support.length ? (
        <>
          <SectionTitle>Vanlige spørsmål</SectionTitle>
          <View style={st.card}>{support.map((a) => <ArticleRow key={a.id} article={a} onPress={() => ctx.openArticle(a)} />)}</View>
        </>
      ) : null}
      {guides.length ? (
        <>
          <SectionTitle>Veiledninger</SectionTitle>
          <View style={st.card}>{guides.map((a) => <ArticleRow key={a.id} article={a} onPress={() => ctx.openArticle(a)} />)}</View>
        </>
      ) : null}
    </View>
  );
}

function ArticleView({ ctx, id }) {
  const article = getArticle(id, lang);
  const [vote, setVote] = useState(null);
  const related = useMemo(() => relatedArticles(article, lang, 8).filter(ctx.canSee).slice(0, 4), [article, ctx]);
  const pageLock = useMemo(() => {
    if (!article?.pageKey) return '';
    const gate = ctx.helpAccess.check(article.pageKey, null);
    return gate.ok ? '' : gate.text;
  }, [article, ctx.helpAccess]);
  const { locks: stepLocks, who: lockWho } = useMemo(() => {
    if (!article?.pageKey || pageLock) return { locks: [], who: '' };
    return condenseStepLocks((article.steps || []).map((_, i) => ctx.helpAccess.check(article.pageKey, i)));
  }, [article, pageLock, ctx.helpAccess]);
  if (!article) return <Empty icon="document-outline" title="Fant ikke artikkelen" />;
  const group = ARTICLE_GROUPS.find((g) => g.id === article.group);
  const feedback = (helpful) => {
    setVote(helpful ? 'up' : 'down');
    helpdeskCall('articleFeedback', { articleId: article.id, helpful }).catch(() => {});
  };
  return (
    <View testID={`article-${article.id}`}>
      <Crumbs items={[
        { label: 'Hjelpesenter', onPress: ctx.home },
        { label: pickText(group?.title, lang), onPress: () => ctx.go({ name: 'group', id: article.group }) },
        { label: article.title },
      ]}
      />
      <Text style={st.h1}>{article.title}</Text>
      {article.summary ? <Text style={st.lead}>{article.summary}</Text> : null}
      {article.path ? (
        <View style={st.pathRow}>
          <Ionicons name="navigate-outline" size={14} color={HD.muted} />
          <Text style={st.pathTxt}>{article.path}</Text>
        </View>
      ) : null}
      {pageLock ? (
        <View testID="help-article-locked"><Notice tone="warn" icon="lock-closed">{pageLock}</Notice></View>
      ) : null}
      <View style={st.steps}>
        {(article.steps || []).map((step, i) => (
          <View key={`${step.title}-${i}`} style={st.step}>
            <View style={st.stepNum}><Text style={st.stepNumTxt}>{i + 1}</Text></View>
            <View style={{ flex: 1 }}>
              {step.title ? <Text style={st.stepTitle}>{step.title}</Text> : null}
              <Text style={st.stepBody}>{step.body}</Text>
              {stepLocks[i] ? (
                <View style={st.stepLock} testID="help-step-locked">
                  <Ionicons name="lock-closed" size={13} color={HD.warn} />
                  <Text style={st.stepLockTxt}>{stepLocks[i]}</Text>
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </View>
      {lockWho ? <Text style={[st.meta, { marginTop: 8 }]}>{lockWho}</Text> : null}
      {(article.faq || []).length ? (
        <>
          <SectionTitle>Spørsmål og svar</SectionTitle>
          {article.faq.map((f) => (
            <View key={f.q} style={st.faq}>
              <Text style={st.faqQ}>{f.q}</Text>
              <Text style={st.faqA}>{f.a}</Text>
            </View>
          ))}
        </>
      ) : null}
      {article.nav?.tab && ctx.requestShellTab && !ctx.demo ? (
        <Btn
          label="Gå til siden"
          icon="open-outline"
          kind="secondary"
          style={{ alignSelf: 'flex-start', marginTop: 8 }}
          onPress={() => ctx.requestShellTab(article.nav.tab, article.nav.subView || null)}
        />
      ) : null}

      <View style={st.voteBox} testID="article-vote">
        {vote ? (
          vote === 'up' ? (
            <Text style={st.voteTxt}>Takk! Fint at det hjalp. 🎉</Text>
          ) : (
            <View style={{ gap: 10 }}>
              <Text style={st.voteTxt}>Leit at det ikke hjalp. Vi hjelper deg videre:</Text>
              <View style={st.rowGap}>
                <Btn label="Spør assistenten" icon="sparkles" kind="secondary" small onPress={() => ctx.go({ name: 'assistant', ask: article.title })} />
                <Btn label="Kontakt support" icon="send" small onPress={() => ctx.startTicket({ subject: article.title })} testID="article-contact" />
              </View>
            </View>
          )
        ) : (
          <View style={st.voteRow}>
            <Text style={st.voteTxt}>Var denne artikkelen nyttig?</Text>
            <View style={st.rowGap}>
              <Btn label="Ja" icon="thumbs-up-outline" kind="secondary" small onPress={() => feedback(true)} testID="vote-up" />
              <Btn label="Nei" icon="thumbs-down-outline" kind="secondary" small onPress={() => feedback(false)} testID="vote-down" />
            </View>
          </View>
        )}
      </View>

      {related.length ? (
        <>
          <SectionTitle>Relaterte artikler</SectionTitle>
          <View style={st.card}>{related.map((a) => <ArticleRow key={a.id} article={a} onPress={() => ctx.openArticle(a)} />)}</View>
        </>
      ) : null}
    </View>
  );
}

/* ─────────── Assistenten ─────────── */

function AssistantView({ ctx, ask }) {
  const askObj = useMemo(() => (ask ? { text: ask, nonce: `${Date.now()}` } : null), [ask]);
  return (
    <View style={{ flex: 1, minHeight: 480 }} testID="help-assistant">
      <View style={st.assistantBar}>
        <TouchableOpacity onPress={ctx.back} style={st.back} accessibilityRole="button" testID="help-back">
          <Ionicons name="arrow-back" size={18} color={HD.brand} />
          <Text style={st.backTxt}>Hjelpesenter</Text>
        </TouchableOpacity>
        <Text style={st.assistantTitle}>ProTop-assistenten</Text>
        <Btn label="Kontakt support" icon="send" small kind="secondary" onPress={() => ctx.startTicket()} />
      </View>
      <View style={{ flex: 1, minHeight: 0 }}>
        <AssistantChat
          variant="embedded"
          showHeader={false}
          ask={askObj}
          onContactSupport={(prefill) => ctx.startTicket({
            subject: prefill?.title || '',
            body: '',
            transcript: prefill?.body || '',
          })}
        />
      </View>
    </View>
  );
}

/* ─────────── Ny sak ─────────── */

function NewTicketView({ ctx }) {
  const {
    draft, user, family, company, shellTab, openArticle, go, viewed,
  } = ctx;
  const [category, setCategory] = useState(draft?.category || '');
  const [moduleId, setModuleId] = useState(draft?.module || (MODULES[shellTab] ? shellTab : 'general'));
  const [subject, setSubject] = useState(draft?.subject || '');
  const [body, setBody] = useState(draft?.body || '');
  const [impact, setImpact] = useState('hard');
  const [files, setFiles] = useState([]);
  const [phone, setPhone] = useState('');
  const [altEmail, setAltEmail] = useState('');
  const [share, setShare] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tried, setTried] = useState(false);
  const [showModules, setShowModules] = useState(false);
  const diagnostics = useMemo(() => collectDiagnostics({
    tab: shellTab || '',
    workspace: company ? 'company' : 'private',
    companyName: company ? (family?.name || '') : '',
  }), [shellTab, company, family?.name]);
  const [suggest, setSuggest] = useState([]);

  useEffect(() => {
    const id = setTimeout(() => {
      setSuggest(subject.trim().length >= 4 || body.trim().length >= 12
        ? suggestForTicket({ subject, body, lang, limit: 3 })
        : []);
    }, 350);
    return () => clearTimeout(id);
  }, [subject, body]);

  const email = user?.email || '';
  const subjectErr = tried && subject.trim().length < 3 ? 'Skriv en kort tittel.' : '';
  const bodyErr = tried && body.trim().length < 10 ? 'Beskriv litt mer (minst 10 tegn).' : '';
  const catErr = tried && !category ? 'Velg hva saken gjelder.' : '';

  const submit = async () => {
    setTried(true);
    setError('');
    if (!category || subject.trim().length < 3 || body.trim().length < 10) return;
    setBusy(true);
    try {
      const result = await helpdeskCall('createTicket', {
        subject: subject.trim(),
        body: body.trim(),
        category,
        module: moduleId,
        impact,
        phone,
        contactEmail: altEmail.trim(),
        name: ctx.firstName ? (user?.displayName || '') : '',
        companyId: company ? family?.id : '',
        role: ctx.userRole || '',
        workspace: company ? 'company' : 'private',
        transcript: draft?.transcript || '',
        shareDiagnostics: share,
        // Ferskt øyeblikksbilde: feil som skjedde mens skjemaet var åpent, kommer også med.
        diagnostics: share ? collectDiagnostics(diagnostics.page) : null,
        viewedArticleIds: [...viewed.current],
        attachments: toUpload(files),
        lang,
      });
      ctx.setDraft(null);
      go({ name: 'sent', result });
    } catch (e) {
      setError(e?.message || 'Saken ble ikke sendt. Prøv igjen.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View testID="new-ticket">
      <Crumbs items={[{ label: 'Hjelpesenter', onPress: ctx.home }, { label: 'Kontakt support' }]} />
      <Text style={st.h1}>Kontakt support</Text>
      <Text style={st.lead}>Beskriv hva som skjer, så hjelper vi deg. Du får saksnummer og kvittering på e-post.</Text>

      {draft?.transcript ? (
        <Notice icon="chatbubbles-outline">Samtalen med assistenten følger med saken, så du slipper å gjenta deg.</Notice>
      ) : null}

      <Text style={ui.fieldLabel}>Hva gjelder det?</Text>
      <View style={st.catGrid}>
        {CATEGORY_ORDER.map((id) => (
          <TouchableOpacity
            key={id}
            onPress={() => setCategory(id)}
            style={[st.catCard, category === id && st.catCardOn]}
            accessibilityRole="radio"
            accessibilityState={{ selected: category === id }}
            testID={`cat-${id}`}
          >
            <Ionicons name={CATEGORIES[id].icon} size={20} color={category === id ? HD.onBrand : HD.brand} />
            <View style={{ flex: 1 }}>
              <Text style={[st.catTitle, category === id && { color: HD.onBrand }]}>{categoryLabel(id, lang)}</Text>
              <Text style={[st.catHint, category === id && { color: HD.onBrandMuted }]} numberOfLines={2}>{pickText(CATEGORIES[id].hint, lang)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
      {catErr ? <Text style={ui.fieldError}>{catErr}</Text> : null}

      <View style={{ marginTop: 14 }}>
        <Text style={ui.fieldLabel}>Hvor i ProTop?</Text>
        <TouchableOpacity style={st.selectBtn} onPress={() => setShowModules((v) => !v)} accessibilityRole="button" testID="module-select">
          <Text style={st.selectTxt}>{moduleLabel(moduleId, lang)}</Text>
          <Ionicons name={showModules ? 'chevron-up' : 'chevron-down'} size={16} color={HD.muted} />
        </TouchableOpacity>
        {showModules ? (
          <View style={[st.rowWrap, { marginTop: 8 }]}>
            {MODULE_ORDER.map((id) => (
              <Chip key={id} label={moduleLabel(id, lang)} active={moduleId === id} onPress={() => { setModuleId(id); setShowModules(false); }} testID={`module-${id}`} />
            ))}
          </View>
        ) : null}
      </View>

      <View style={{ marginTop: 14 }}>
        <Field
          label="Tittel"
          value={subject}
          onChangeText={setSubject}
          placeholder="F.eks. «Fakturaen blir ikke sendt»"
          maxLength={LIMITS.subject}
          testID="ticket-subject"
          error={subjectErr}
        />
        {suggest.length ? (
          <View style={st.suggestBox} testID="ticket-suggestions">
            <View style={st.suggestHead}>
              <Ionicons name="bulb" size={16} color={HD.amber} />
              <Text style={st.suggestTitle}>Kanskje dette løser det med en gang?</Text>
            </View>
            {suggest.map((a) => (
              <TouchableOpacity key={a.id} onPress={() => openArticle(a)} style={st.suggestRow} accessibilityRole="link" testID={`suggest-${a.id}`}>
                <Ionicons name="document-text-outline" size={15} color={HD.brand} />
                <Text style={st.suggestLink} numberOfLines={1}>{a.title}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <Field
          label="Beskrivelse"
          value={body}
          onChangeText={setBody}
          multiline
          minHeight={140}
          maxLength={LIMITS.body}
          placeholder={'Hva prøvde du å gjøre?\nHva skjedde i stedet?\nSkjer det hver gang?'}
          testID="ticket-body"
          error={bodyErr}
        />
      </View>

      <Text style={ui.fieldLabel}>Hvor mye hindrer dette deg?</Text>
      <View style={st.rowWrap}>
        {IMPACT_ORDER.map((id) => (
          <Chip key={id} label={pickText(IMPACTS[id].label, lang)} active={impact === id} onPress={() => setImpact(id)} testID={`impact-${id}`} />
        ))}
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={ui.fieldLabel}>Skjermbilder</Text>
        <AttachmentPicker value={files} onChange={setFiles} max={LIMITS.attachments} testID="ticket-attach" />
      </View>

      <View style={{ marginTop: 16 }}>
        <Text style={ui.fieldLabel}>Kontaktinfo</Text>
        <View style={st.contactBox}>
          <View style={st.contactRow}>
            <Ionicons name="person-circle-outline" size={18} color={HD.muted} />
            <Text style={st.contactTxt}>{user?.displayName || ctx.firstName || 'Innlogget bruker'}</Text>
          </View>
          <View style={st.contactRow}>
            <Ionicons name="mail-outline" size={18} color={HD.muted} />
            <Text style={st.contactTxt}>{email || 'Ingen e-post på kontoen'}</Text>
          </View>
          {company && family?.name ? (
            <View style={st.contactRow}>
              <Ionicons name="business-outline" size={18} color={HD.muted} />
              <Text style={st.contactTxt}>{family.name}</Text>
            </View>
          ) : null}
          <Text style={ui.fieldHint}>Vi sender svar til e-posten over og i «Mine saker». Bruker-ID følger med, så vi finner kontoen din.</Text>
        </View>
        <View style={[st.twoCol, ctx.isPhone && { flexDirection: 'column' }]}>
          <View style={{ flex: 1 }}>
            <Field label="Annen e-post for svar (valgfritt)" value={altEmail} onChangeText={setAltEmail} keyboardType="email-address" placeholder="navn@firma.no" testID="ticket-alt-email" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Telefon (valgfritt)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="Hvis vi bør ringe" testID="ticket-phone" />
          </View>
        </View>
      </View>

      <DiagnosticsPreview diagnostics={diagnostics} enabled={share} onToggle={() => setShare((v) => !v)} />

      {error ? <Notice tone="danger" icon="alert-circle">{error}</Notice> : null}
      <View style={[st.rowGap, { marginTop: 18 }]}>
        <Btn label={busy ? 'Sender …' : 'Send saken'} icon="send" onPress={submit} busy={busy} testID="ticket-submit" />
        <Btn label="Avbryt" kind="ghost" onPress={ctx.back} />
      </View>
    </View>
  );
}

function SentView({ ctx, result }) {
  const arts = (result?.articles || []).map((a) => getArticle(a.id, lang)).filter(Boolean);
  return (
    <View style={st.sent} testID="ticket-sent">
      <View style={st.sentIcon}><Ionicons name="checkmark" size={36} color={HD.onBrand} /></View>
      <Text style={st.h1}>Saken er sendt</Text>
      <Text style={st.sentNumber} testID="ticket-number">{result?.number}</Text>
      <Text style={st.lead}>
        {result?.receiptSent
          ? `Vi har sendt en kvittering med sammendrag til ${result.email}.`
          : 'Saken er registrert. Kvitteringen på e-post kunne ikke sendes akkurat nå, men du finner saken under «Mine saker».'}
      </Text>
      <View style={st.timeline}>
        {['Mottatt – vi ser på saken', 'Du får svar her og på e-post', 'Saken løses og du får beskjed'].map((t, i) => (
          <View key={t} style={st.timelineRow}>
            <View style={[st.timelineDot, i === 0 && { backgroundColor: HD.ok }]} />
            <Text style={st.timelineTxt}>{t}</Text>
          </View>
        ))}
      </View>
      {arts.length ? (
        <View style={{ alignSelf: 'stretch' }}>
          <SectionTitle>Mens du venter</SectionTitle>
          <View style={st.card}>{arts.map((a) => <ArticleRow key={a.id} article={a} onPress={() => ctx.openArticle(a)} />)}</View>
        </View>
      ) : null}
      <View style={[st.rowGap, { marginTop: 18 }]}>
        <Btn label="Se saken" icon="eye-outline" onPress={() => ctx.go({ name: 'ticket', id: result?.id })} testID="sent-open" />
        <Btn label="Til hjelpesenteret" kind="secondary" onPress={ctx.home} />
      </View>
    </View>
  );
}

/* ─────────── Mine saker ─────────── */

function TicketsView({ ctx }) {
  const [tab, setTab] = useState('open');
  const list = (ctx.tickets || []).filter((t) => (tab === 'open' ? isOpenStatus(t.status) : !isOpenStatus(t.status)));
  return (
    <View testID="my-tickets">
      <Crumbs items={[{ label: 'Hjelpesenter', onPress: ctx.home }, { label: 'Mine saker' }]} />
      <View style={st.titleRow}>
        <Text style={st.h1}>Mine saker</Text>
        <Btn label="Ny sak" icon="add" small onPress={() => ctx.startTicket()} testID="tickets-new" />
      </View>
      <View style={st.tabs}>
        {[['open', 'Åpne'], ['done', 'Løste og lukkede']].map(([id, label]) => (
          <TouchableOpacity key={id} onPress={() => setTab(id)} style={[st.tab, tab === id && st.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} testID={`tickets-tab-${id}`}>
            <Text style={[st.tabTxt, tab === id && st.tabTxtOn]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {ctx.tickets == null ? <ActivityIndicator color={HD.brand} style={{ margin: 30 }} /> : list.length ? (
        <View style={st.card}>
          {list.map((t) => (
            <TouchableOpacity key={t.id} style={st.ticketRow} onPress={() => ctx.go({ name: 'ticket', id: t.id })} accessibilityRole="button" testID={`ticket-row-${t.number}`}>
              {t.unreadForRequester ? <View style={st.unreadDot} /> : <View style={{ width: 8 }} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={st.ticketTop}>
                  <Text style={st.ticketNum}>{t.number}</Text>
                  <StatusPill status={t.status} small />
                </View>
                <Text style={[st.articleTitle, t.unreadForRequester && { fontWeight: '600' }]} numberOfLines={1}>{t.subject}</Text>
                <Text style={st.articleSub}>{t.unreadForRequester ? 'Nytt svar · ' : ''}Oppdatert {formatWhen(t.lastPublicAtMs)}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={HD.muted} />
            </TouchableOpacity>
          ))}
        </View>
      ) : (
        <Empty
          icon="file-tray-outline"
          title={tab === 'open' ? 'Ingen åpne saker' : 'Ingen løste saker ennå'}
          text={tab === 'open' ? 'Når du sender en sak, ser du den her med status og svar.' : 'Løste og lukkede saker havner her.'}
        />
      )}
    </View>
  );
}

const STATUS_HELP = {
  new: 'Vi har mottatt saken og ser på den snart.',
  open: 'Vi jobber med saken.',
  pending: 'Vi venter på svar fra deg. Svar under, så går saken videre.',
  on_hold: 'Vi jobber med saken. Det kan ta litt tid, for eksempel når en feil må rettes.',
  solved: 'Saken er løst. Er det ikke løst, svarer du under innen 7 dager, så åpner vi den igjen.',
  closed: 'Saken er lukket og lagt i arkivet. Trenger du mer hjelp, opprett en ny sak.',
};

function TicketView({ ctx, id, rate }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reply, setReply] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState('');
  const [rated, setRated] = useState(null);

  const load = useCallback(async () => {
    try {
      setData(await helpdeskCall('myTicket', { id }));
      setError('');
    } catch (e) {
      setError(e?.message || 'Fant ikke saken.');
    }
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Lenke fra e-posten: ?vurder=1&svar=good|bad
  useEffect(() => {
    if (!rate || !data?.ticket || data.ticket.csat || rated) return;
    if (rate === 'good' || rate === 'bad') {
      setRated(rate);
      helpdeskCall('rate', { id, rating: rate }).then(load).catch(() => {});
    }
  }, [rate, data, id, rated, load]);

  if (error) return <Empty icon="alert-circle-outline" title={error} />;
  if (!data) return <ActivityIndicator color={HD.brand} style={{ margin: 40 }} />;
  const { ticket, messages } = data;
  const closed = ticket.status === 'closed';
  const solved = ticket.status === 'solved';

  const send = async () => {
    if (!reply.trim() && !files.length) return;
    setBusy(true);
    try {
      await helpdeskCall('myReply', { id, body: reply.trim(), attachments: toUpload(files) });
      setReply('');
      setFiles([]);
      await load();
    } catch (e) {
      setError(e?.message || 'Svaret ble ikke sendt.');
    } finally {
      setBusy(false);
    }
  };
  const markSolved = async () => {
    setBusy(true);
    try { await helpdeskCall('mySolve', { id }); await load(); } finally { setBusy(false); }
  };
  const sendRating = async (rating) => {
    setRated(rating);
    await helpdeskCall('rate', { id, rating, comment }).catch(() => {});
    await load();
  };

  return (
    <View testID="ticket-detail">
      <Crumbs items={[{ label: 'Hjelpesenter', onPress: ctx.home }, { label: 'Mine saker', onPress: () => ctx.go({ name: 'tickets' }) }, { label: ticket.number }]} />
      <View style={st.ticketHead}>
        <Text style={st.ticketNumBig}>{ticket.number}</Text>
        <StatusPill status={ticket.status} />
      </View>
      <Text style={st.h1}>{ticket.subject}</Text>
      <Text style={st.meta}>
        {categoryLabel(ticket.category, lang)} · {moduleLabel(ticket.module, lang)} · Opprettet {formatWhen(ticket.createdAtMs)}
        {ticket.assigneeName ? ` · Behandles av ${ticket.assigneeName}` : ''}
      </Text>
      <Notice tone={ticket.status === 'pending' ? 'warn' : solved || closed ? 'ok' : 'info'} icon={ticket.status === 'pending' ? 'hand-left-outline' : 'information-circle'}>
        {STATUS_HELP[ticket.status] || STATUS_HELP.open}
      </Notice>

      <View style={st.thread} testID="ticket-thread">
        {messages.map((m) => {
          const mine = m.role === 'requester';
          return (
            <View key={m.id} style={[st.msg, mine ? st.msgMine : st.msgAgent]}>
              <Text style={st.msgAuthor}>{mine ? 'Du' : m.authorName || 'ProTop support'} · {formatWhen(m.createdAtMs)}</Text>
              {m.body ? <Text style={st.msgBody}>{m.body}</Text> : null}
              {m.attachments?.length ? (
                <View style={[st.rowWrap, { marginTop: 8 }]}>
                  {m.attachments.map((a) => <RemoteImage key={a.id} attachment={a} />)}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      {(solved || closed) && !ticket.csat && !rated ? (
        <View style={st.rateBox} testID="ticket-rate">
          <Text style={st.rateTitle}>Hvordan var hjelpen?</Text>
          <Field value={comment} onChangeText={setComment} placeholder="Vil du si noe mer? (valgfritt)" />
          <View style={st.rowGap}>
            <Btn label="Bra" icon="thumbs-up" kind="secondary" onPress={() => sendRating('good')} testID="rate-good" />
            <Btn label="Ikke bra" icon="thumbs-down" kind="secondary" onPress={() => sendRating('bad')} testID="rate-bad" />
          </View>
        </View>
      ) : ticket.csat || rated ? (
        <Notice tone="ok" icon="heart">Takk for vurderingen!</Notice>
      ) : null}

      {!closed && (!solved || ticket.canReopen) ? (
        <View style={st.replyBox} testID="ticket-reply">
          <Field
            label={solved ? 'Ikke løst? Svar her, så åpner vi saken igjen' : 'Svar'}
            value={reply}
            onChangeText={setReply}
            multiline
            minHeight={100}
            placeholder="Skriv til support …"
            testID="ticket-reply-input"
          />
          <AttachmentPicker value={files} onChange={setFiles} compact testID="reply-attach" />
          <View style={[st.rowGap, { marginTop: 10 }]}>
            <Btn label={solved ? 'Gjenåpne og send' : 'Send svar'} icon="send" onPress={send} busy={busy} disabled={!reply.trim() && !files.length} testID="ticket-reply-send" />
            {!solved ? <Btn label="Saken er løst" icon="checkmark-done" kind="secondary" onPress={markSolved} testID="ticket-mark-solved" /> : null}
          </View>
        </View>
      ) : closed ? (
        <Btn label="Opprett ny sak" icon="add" kind="secondary" style={{ alignSelf: 'flex-start', marginTop: 12 }} onPress={() => ctx.startTicket({ subject: `Oppfølging av ${ticket.number}: ${ticket.subject}`.slice(0, 120) })} />
      ) : null}
    </View>
  );
}

function NewsView({ ctx }) {
  const days = useMemo(() => groupUpdatesByDay(listHelpNews({ lang, limit: 40 })), []);
  return (
    <View testID="help-news">
      <Crumbs items={[{ label: 'Hjelpesenter', onPress: ctx.home }, { label: 'Nyheter' }]} />
      <Text style={st.h1}>Nyheter og oppdateringer</Text>
      <Text style={st.lead}>Det siste vi har lagt til og rettet i ProTop.</Text>
      {days.map((day) => (
        <View key={day.date || 'ukjent'} style={{ marginBottom: 14 }}>
          <Text style={st.newsDay}>{formatNewsDate(day.date, lang)}</Text>
          <View style={st.card}>
            {day.items.map((n) => (
              <View key={n.id} style={st.articleRow}>
                <View style={{ flex: 1 }}>
                  <View style={[st.rowGap, { marginBottom: 4 }]}>
                    <Text style={[st.newsBadge, n.level === 'major' ? st.newsMajor : st.newsFix]}>{n.level === 'major' ? 'Nyhet' : 'Rettelse'}</Text>
                    {n.version ? <Text style={st.meta}>Versjon {n.version}</Text> : null}
                  </View>
                  <Text style={st.articleTitle}>{n.title}</Text>
                  {n.summary ? <Text style={st.articleSub}>{n.summary}</Text> : null}
                </View>
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/* ─────────── Stil ─────────── */

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: HD.bg },
  page: { padding: 16, paddingBottom: 60, width: '100%', maxWidth: 920, alignSelf: 'center' },
  pageDesk: { padding: 24 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 8, marginBottom: 4 },
  backTxt: { color: HD.brand, fontWeight: '600', ...type.bodyStrong },
  hero: { backgroundColor: HD.brand, borderRadius: radius.sheet, padding: 20, paddingVertical: 26, gap: 12, zIndex: 2 },
  heroKicker: { color: HD.onBrandMuted, ...type.label, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  heroTitle: { color: HD.onBrand, ...type.h2, fontWeight: '600', },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: HD.onBrand, borderRadius: radius.card, paddingHorizontal: 14, minHeight: 52, borderWidth: 1, borderColor: HD.line },
  searchInput: { flex: 1, ...type.title, color: HD.night, minHeight: 48 },
  liveBox: { backgroundColor: HD.card, borderRadius: radius.card, overflow: 'hidden' },
  liveMore: { padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: HD.line },
  noHit: { padding: 14, color: HD.muted, ...type.body },
  actions: { gap: 10, marginTop: 16 },
  actionsDesk: { flexDirection: 'row' },
  actionCard: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: HD.card, borderWidth: 1, borderColor: HD.line },
  actionIcon: { width: 44, height: 44, borderRadius: radius.card, alignItems: 'center', justifyContent: 'center' },
  actionTitle: { ...type.bodyStrong, fontWeight: '600', color: HD.ink },
  actionTxt: { ...type.label, color: HD.muted, marginTop: 2 },
  badge: { position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, borderRadius: radius.pill, backgroundColor: HD.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeTxt: { color: HD.onBrand, ...type.caption, fontWeight: '600' },
  card: { backgroundColor: HD.card, borderRadius: radius.card, borderWidth: 1, borderColor: HD.line, overflow: 'hidden' },
  articleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: HD.line },
  articleIcon: { width: 34, height: 34, borderRadius: radius.control, backgroundColor: HD.brandSoft, alignItems: 'center', justifyContent: 'center' },
  rank: { width: 26, textAlign: 'center', ...type.title, fontWeight: '600', color: HD.brand },
  articleTitle: { ...type.bodyStrong, fontWeight: '600', color: HD.ink },
  articleSub: { ...type.label, color: HD.muted, marginTop: 2, },
  groupGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  groupCard: { width: '47.5%', flexGrow: 1, padding: 14, borderRadius: radius.card, backgroundColor: HD.card, borderWidth: 1, borderColor: HD.line, gap: 6 },
  groupCardDesk: { width: '23%' },
  groupIcon: { width: 38, height: 38, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  groupTitle: { ...type.bodyStrong, fontWeight: '600', color: HD.ink },
  groupCount: { ...type.caption, color: HD.muted },
  newsLink: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  newsDay: { ...type.label, fontWeight: '600', color: HD.muted, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 },
  newsBadge: { ...type.caption, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  newsMajor: { backgroundColor: HD.infoSoft, color: HD.info },
  newsFix: { backgroundColor: HD.okSoft, color: HD.ok },
  footerCta: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 24, padding: 16, borderRadius: radius.card, backgroundColor: HD.brandSoft, flexWrap: 'wrap' },
  footerTitle: { ...type.bodyStrong, fontWeight: '600', color: HD.ink },
  footerTxt: { ...type.label, color: HD.muted, marginTop: 2, },
  crumbs: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginBottom: 8 },
  crumbItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  crumbLink: { color: HD.brand, ...type.label },
  crumbHere: { color: HD.muted, ...type.label, maxWidth: 260 },
  h1: { ...type.h1, fontWeight: '600', color: HD.ink, marginBottom: 6, },
  lead: { ...type.body, color: HD.muted, marginBottom: 10 },
  meta: { ...type.label, color: HD.muted, marginBottom: 6 },
  pathRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  pathTxt: { ...type.label, color: HD.muted },
  steps: { gap: 10, marginTop: 8 },
  step: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.card, backgroundColor: HD.card, borderWidth: 1, borderColor: HD.line },
  stepNum: { width: 28, height: 28, borderRadius: radius.pill, backgroundColor: HD.brand, alignItems: 'center', justifyContent: 'center' },
  stepNumTxt: { color: HD.onBrand, fontWeight: '600' },
  stepTitle: { ...type.bodyStrong, fontWeight: '600', color: HD.ink, marginBottom: 3 },
  stepBody: { ...type.body, color: HD.ink, },
  stepLock: { flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 6 },
  stepLockTxt: { flex: 1, ...type.label, color: HD.warn, },
  faq: { padding: 12, borderRadius: radius.control, backgroundColor: HD.card, borderWidth: 1, borderColor: HD.line, marginBottom: 8 },
  faqQ: { fontWeight: '600', color: HD.ink, marginBottom: 4 },
  faqA: { color: HD.ink, lineHeight: 20 },
  voteBox: { marginTop: 22, padding: 16, borderRadius: radius.card, backgroundColor: HD.sunken },
  voteRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 },
  voteTxt: { ...type.bodyStrong, fontWeight: '600', color: HD.ink },
  rowGap: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  resultCount: { color: HD.muted, marginVertical: 10 },
  assistantBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: HD.line, backgroundColor: HD.card },
  assistantTitle: { flex: 1, ...type.title, fontWeight: '600', color: HD.ink },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  catCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.card, borderWidth: 1, borderColor: HD.line, backgroundColor: HD.card, width: '48.5%', flexGrow: 1, minHeight: 62 },
  catCardOn: { backgroundColor: HD.brand, borderColor: HD.brand },
  catTitle: { ...type.bodyStrong, fontWeight: '600', color: HD.ink },
  catHint: { ...type.caption, color: HD.muted, marginTop: 2 },
  selectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: HD.line, borderRadius: radius.control, paddingHorizontal: 12, minHeight: 44, backgroundColor: HD.card },
  selectTxt: { ...type.body, color: HD.ink },
  suggestBox: { marginTop: -6, marginBottom: 14, padding: 12, borderRadius: radius.control, backgroundColor: HD.noteSoft, borderWidth: 1, borderColor: HD.noteLine, gap: 6 },
  suggestHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  suggestTitle: { fontWeight: '600', color: HD.noteInk, ...type.label },
  suggestRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3 },
  suggestLink: { color: HD.brand, ...type.bodyStrong, fontWeight: '600', flex: 1 },
  contactBox: { padding: 12, borderRadius: radius.control, backgroundColor: HD.sunken, gap: 6, marginBottom: 12 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contactTxt: { ...type.body, color: HD.ink },
  twoCol: { flexDirection: 'row', gap: 12 },
  sent: { alignItems: 'center', paddingTop: 20 },
  sentIcon: { width: 72, height: 72, borderRadius: radius.pill, backgroundColor: HD.ok, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  sentNumber: { ...type.h1, fontWeight: '600', color: HD.brand, letterSpacing: 1, marginBottom: 8 },
  timeline: { alignSelf: 'stretch', padding: 14, borderRadius: radius.card, backgroundColor: HD.card, borderWidth: 1, borderColor: HD.line, gap: 10, marginTop: 8 },
  timelineRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timelineDot: { width: 12, height: 12, borderRadius: radius.pill, backgroundColor: HD.line },
  timelineTxt: { ...type.body, color: HD.ink },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tabs: { flexDirection: 'row', gap: 6, marginVertical: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: HD.sunken },
  tabOn: { backgroundColor: HD.brand },
  tabTxt: { color: HD.ink, fontWeight: '600', ...type.label },
  tabTxtOn: { color: HD.onBrand },
  ticketRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: HD.line },
  ticketTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  ticketNum: { ...type.label, color: HD.muted, fontWeight: '600' },
  unreadDot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: HD.brand },
  ticketHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  ticketNumBig: { ...type.bodyStrong, fontWeight: '600', color: HD.brand, letterSpacing: 0.5 },
  thread: { gap: 10, marginTop: 10 },
  msg: { padding: 12, borderRadius: radius.card, maxWidth: '92%' },
  msgMine: { alignSelf: 'flex-end', backgroundColor: HD.brandSoft },
  msgAgent: { alignSelf: 'flex-start', backgroundColor: HD.card, borderWidth: 1, borderColor: HD.line },
  msgAuthor: { ...type.caption, color: HD.muted, marginBottom: 4, fontWeight: '600' },
  msgBody: { ...type.body, color: HD.ink, },
  rateBox: { marginTop: 16, padding: 14, borderRadius: radius.card, backgroundColor: HD.card, borderWidth: 1, borderColor: HD.line },
  rateTitle: { ...type.title, fontWeight: '600', color: HD.ink, marginBottom: 8 },
  replyBox: { marginTop: 16, padding: 14, borderRadius: radius.card, backgroundColor: HD.card, borderWidth: 1, borderColor: HD.line },
});
