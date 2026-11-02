/**
 * ProTop Helpdesk — egen portal for helpdesk-teamet (protop.no/helpdesk).
 *
 * Egen innlogging (samme ProTop-konto, men egen side), og bare de som står i
 * helpdesk-teamet slipper inn (goa@invest-as.no er fast eier; flere inviteres
 * under Team). Arver det som virker hos Zendesk/Freshdesk/Help Scout:
 * visninger med tall, smart sortering (frist og prioritet), saksbilde med
 * kunde og teknisk info ved siden av samtalen, svar/internt notat, makroer,
 * «send som»-status, AI-sammendrag og svarforslag, fiks-forslag som må
 * godkjennes, statistikk (svartid, CSAT, løsningsgrad) og arkiv.
 */
import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import { useLayout } from '../../src/theme';
import {
  AGENT_VIEWS, CATEGORIES, CATEGORY_ORDER, FIX_STATES, MODULES, MODULE_ORDER, PRIORITY_ORDER, STATUS_ORDER,
  categoryLabel, filterTickets, formatDuration, formatWhen, moduleLabel, pickText, priorityLabel, slaState, sortTickets,
  statusLabel,
} from '../../src/helpdesk/model';
import { MACROS, fillMacro } from '../../src/helpdesk/macros';
import { getArticle } from '../../src/helpdesk/articles';
import {
  clearHelpdeskSession, helpdeskCall, isHelpdeskDemo, onHelpdeskChange,
} from '../../src/helpdesk/client';
import { toUpload } from '../../src/helpdesk/images';
import {
  AttachmentPicker, Avatar, Btn, Chip, Empty, Field, HD, Notice, Pill, PriorityPill, RemoteImage, StatusPill, s as ui,
} from '../../components/helpdesk/HelpdeskUi';
import { radius, type } from '../../src/ui/tokens';
import { signInWithGoogle, signInWithMicrosoft, mapAuthError } from '../../src/utils/authProviders';
import BrandLogo from '../../components/BrandLogo';
import { rememberHelpdeskAgent } from '../../src/helpdesk/useHelpdeskAgent';

const POLL_MS = 20000;

function copyText(text) {
  try {
    if (Platform.OS === 'web' && navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* ignore */ }
  return false;
}

/* ─────────── Innlogging og tilgang ─────────── */

export default function HelpdeskPortalScreen({ navigation, route, demoOutbox = null }) {
  const demo = isHelpdeskDemo();
  const [user, setUser] = useState(demo ? { uid: 'demo' } : auth.currentUser);
  const [authReady, setAuthReady] = useState(demo || !!auth.currentUser);
  const [session, setSession] = useState(null);
  const [sessionError, setSessionError] = useState('');

  useEffect(() => {
    if (demo) return undefined;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      setSession(null);
    });
  }, [demo]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.title = 'ProTop Helpdesk';
  }, []);

  useEffect(() => {
    if (!user) return;
    let live = true;
    clearHelpdeskSession();
    helpdeskCall('session')
      .then((res) => {
        if (!live) return;
        setSession(res);
        setSessionError('');
        if (!demo && res?.uid) rememberHelpdeskAgent(res.uid, !!res.isAgent);
      })
      .catch((e) => { if (live) setSessionError(e?.message || 'Klarte ikke sjekke tilgangen.'); });
    return () => { live = false; };
  }, [user, demo]);

  const leave = () => {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else navigation?.navigate?.('Home');
  };

  if (!authReady) return <Center><ActivityIndicator color={HD.brand} /></Center>;
  if (!user) return <HelpdeskLogin />;
  if (sessionError) {
    return (
      <Center>
        <Empty icon="cloud-offline-outline" title="Helpdesken svarer ikke" text={sessionError}>
          <Btn label="Prøv igjen" icon="refresh" onPress={() => { setSessionError(''); setUser({ ...user }); }} />
        </Empty>
      </Center>
    );
  }
  if (!session) return <Center><ActivityIndicator color={HD.brand} /><Text style={st.muted}>Sjekker tilgang …</Text></Center>;
  if (!session.isAgent) {
    return (
      <Center>
        <View style={st.loginCard} testID="helpdesk-denied">
          <Ionicons name="lock-closed" size={36} color={HD.brand} />
          <Text style={st.loginTitle}>Ingen tilgang til Helpdesk</Text>
          <Text style={st.loginLead}>
            {session.needsVerification
              ? 'Bekreft e-postadressen din først. Åpne lenken vi sendte deg, og last siden på nytt.'
              : `Du er logget inn som ${session.email || 'ukjent'}, som ikke er med i helpdesk-teamet. Be en eier om invitasjon.`}
          </Text>
          <View style={st.rowGap}>
            <Btn label="Til ProTop" icon="home-outline" kind="secondary" onPress={leave} />
            <Btn label="Logg ut" icon="log-out-outline" kind="ghost" onPress={() => signOut(auth)} />
          </View>
        </View>
      </Center>
    );
  }
  return (
    <Portal
      session={session}
      onLeave={leave}
      onSignOut={demo ? null : () => signOut(auth)}
      initialTicketId={route?.params?.ticketId || null}
      demoOutbox={demoOutbox}
    />
  );
}

function Center({ children }) {
  return <View style={st.center}>{children}</View>;
}

function HelpdeskLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const login = async (fn) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      const mapped = mapAuthError?.(e);
      setError(typeof mapped === 'string' ? mapped : 'Innloggingen feilet. Sjekk e-post og passord.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={st.loginPage} testID="helpdesk-login">
      <View style={st.loginCard}>
        <BrandLogo variant="full" height={44} maxWidth={240} />
        <View style={st.loginBadge}><Ionicons name="headset" size={14} color={HD.onBrand} /><Text style={st.loginBadgeTxt}>Helpdesk</Text></View>
        <Text style={st.loginTitle}>Logg inn i ProTop Helpdesk</Text>
        <Text style={st.loginLead}>For supportteamet. Bruk ProTop-kontoen du er invitert med.</Text>
        <Btn label="Logg inn med Google" icon="logo-google" kind="secondary" onPress={() => login(signInWithGoogle)} disabled={busy} style={{ alignSelf: 'stretch' }} />
        <Btn label="Logg inn med Microsoft" icon="logo-microsoft" kind="secondary" onPress={() => login(signInWithMicrosoft)} disabled={busy} style={{ alignSelf: 'stretch' }} />
        <Text style={st.or}>eller</Text>
        <View style={{ alignSelf: 'stretch' }}>
          <Field label="E-post" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" placeholder="navn@firma.no" testID="hd-login-email" />
          <Field label="Passord" value={password} onChangeText={setPassword} placeholder="Passord" secureTextEntry autoComplete="current-password" testID="hd-login-password" onSubmitEditing={() => login(() => signInWithEmailAndPassword(auth, email.trim(), password))} />
        </View>
        {error ? <Notice tone="danger" icon="alert-circle">{error}</Notice> : null}
        <Btn
          label="Logg inn"
          icon="log-in-outline"
          busy={busy}
          disabled={!email.trim() || !password}
          onPress={() => login(() => signInWithEmailAndPassword(auth, email.trim(), password))}
          style={{ alignSelf: 'stretch' }}
          testID="hd-login-submit"
        />
        <Text style={[st.muted, { marginTop: 8 }]}>Glemt passord? Bruk «Glemt passord» på protop.no/login.</Text>
      </View>
    </View>
  );
}

/* ─────────── Portalen ─────────── */

const EXTRA_VIEWS = [
  { id: 'fixes', icon: 'construct-outline', label: 'AI-fiks til godkjenning' },
  { id: 'stats', icon: 'stats-chart-outline', label: 'Statistikk' },
  { id: 'team', icon: 'people-outline', label: 'Team' },
];

function Portal({
  session, onLeave, onSignOut, initialTicketId, demoOutbox,
}) {
  const { isDesktop, isPhone, isWide } = useLayout();
  const [view, setView] = useState('open');
  const [list, setList] = useState(null);
  const [me, setMe] = useState(null);
  const [counts, setCounts] = useState({});
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('smart');
  const [selected, setSelected] = useState(initialTicketId);
  const [error, setError] = useState('');
  const [navOpen, setNavOpen] = useState(false);
  const [team, setTeam] = useState([]);

  const load = useCallback(async () => {
    try {
      const res = await helpdeskCall('agentList', { view, includeArchive: view === 'archive' || !!query.trim() });
      setList(res.tickets || []);
      setCounts(res.counts || {});
      setMe(res.me || null);
      setError('');
    } catch (e) {
      setError(e?.message || 'Klarte ikke hente saker.');
    }
  }, [view, query]);

  useEffect(() => {
    load();
    const off = onHelpdeskChange(() => load());
    const t = setInterval(load, POLL_MS);
    return () => { off(); clearInterval(t); };
  }, [load]);

  useEffect(() => {
    helpdeskCall('teamList').then((r) => setTeam(r?.members || [])).catch(() => {});
  }, []);

  const rows = useMemo(() => {
    if (!list) return null;
    const v = view === 'fixes' ? 'all' : view;
    let out = filterTickets(list, {
      view: query.trim() ? 'all' : v, query, agentUid: me?.uid, category,
    });
    if (view === 'fixes') out = out.filter((t) => ['proposed', 'approved'].includes(t.fixState));
    return sortTickets(out, { by: sort });
  }, [list, view, query, me, category, sort]);

  const ticketPane = view !== 'stats' && view !== 'team';
  const showList = ticketPane && (!selected || isWide);
  const showDetail = ticketPane && !!selected;
  const allViews = [...AGENT_VIEWS, ...EXTRA_VIEWS];
  const currentView = allViews.find((v) => v.id === view);

  const nav = (
    <View style={[st.side, !isDesktop && st.sideMobile]} testID="hd-nav">
      {allViews.map((v, i) => {
        const active = view === v.id;
        const count = v.id === 'fixes' ? (list || []).filter((t) => t.fixState === 'proposed').length : counts[v.id];
        return (
          <React.Fragment key={v.id}>
            {i === AGENT_VIEWS.length ? <View style={st.sideDivider} /> : null}
            <TouchableOpacity
              style={[st.sideItem, active && st.sideItemOn]}
              onPress={() => { setView(v.id); setSelected(null); setNavOpen(false); }}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              testID={`hd-view-${v.id}`}
            >
              <Ionicons name={v.icon} size={17} color={active ? HD.onBrand : HD.sideMuted} />
              <Text style={[st.sideTxt, active && { color: HD.onBrand }]} numberOfLines={1}>{pickText(v.label)}</Text>
              {count ? (
                <View style={[st.sideCount, v.id === 'urgent' && count ? { backgroundColor: HD.danger } : null]}>
                  <Text style={st.sideCountTxt}>{count}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
      {demoOutbox ? (
        <TouchableOpacity style={[st.sideItem, view === 'outbox' && st.sideItemOn]} onPress={() => { setView('outbox'); setSelected(null); }} testID="hd-view-outbox">
          <Ionicons name="mail-outline" size={17} color={HD.sideMuted} />
          <Text style={st.sideTxt}>E-post sendt (demo)</Text>
          <View style={st.sideCount}><Text style={st.sideCountTxt}>{demoOutbox.length}</Text></View>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <View style={st.portal} testID="helpdesk-portal">
      <View style={st.top}>
        {!isDesktop ? (
          <TouchableOpacity onPress={() => setNavOpen((v) => !v)} accessibilityLabel="Meny" style={st.topIcon} testID="hd-menu">
            <Ionicons name="menu" size={22} color={HD.onBrand} />
          </TouchableOpacity>
        ) : null}
        <View style={st.brandRow}>
          <Ionicons name="headset" size={20} color={HD.onBrand} />
          <Text style={st.brand}>ProTop <Text style={{ fontWeight: '400' }}>Helpdesk</Text></Text>
        </View>
        {!isPhone ? (
          <View style={st.topSearch}>
            <Ionicons name="search" size={16} color={HD.sideMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Søk i alle saker: nummer, navn, e-post, bruker-id, tekst"
              placeholderTextColor={HD.sidePlaceholder}
              style={st.topSearchInput}
              testID="hd-search"
            />
          </View>
        ) : <View style={{ flex: 1 }} />}
        <TouchableOpacity onPress={onLeave} style={st.topBtn} accessibilityRole="button" testID="hd-leave">
          <Ionicons name="arrow-back" size={15} color={HD.onBrand} />
          {!isPhone ? <Text style={st.topBtnTxt}>Til ProTop</Text> : null}
        </TouchableOpacity>
        <View style={st.meRow}>
          <Avatar name={session.name || session.email} size={30} color={HD.sideAccent} />
          {onSignOut ? (
            <TouchableOpacity onPress={onSignOut} accessibilityLabel="Logg ut" style={st.topIcon}>
              <Ionicons name="log-out-outline" size={20} color={HD.sideIcon} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
      {isPhone ? (
        <View style={st.phoneSearch}>
          <TextInput value={query} onChangeText={setQuery} placeholder="Søk i saker" style={ui.input} testID="hd-search" />
        </View>
      ) : null}
      <View style={st.body}>
        {isDesktop || navOpen ? nav : null}
        <View style={st.main}>
          {error ? <Notice tone="danger" icon="alert-circle">{error}</Notice> : null}
          {view === 'stats' ? <StatsPanel /> : null}
          {view === 'team' ? <TeamPanel session={session} onTeam={setTeam} /> : null}
          {view === 'outbox' ? <OutboxPanel outbox={demoOutbox || []} /> : null}
          {ticketPane && view !== 'outbox' ? (
            <View style={st.split}>
              {showList ? (
                <View style={[st.listCol, isWide && showDetail && st.listColNarrow]}>
                  <View style={st.listHead}>
                    <Text style={st.listTitle}>{query.trim() ? `Søk: «${query.trim()}»` : pickText(currentView?.label)}</Text>
                    <Text style={st.muted}>{rows ? `${rows.length} saker` : ''}</Text>
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={st.filterRow}>
                    <Chip label="Alle typer" active={!category} onPress={() => setCategory('')} />
                    {CATEGORY_ORDER.map((c) => <Chip key={c} label={categoryLabel(c)} active={category === c} onPress={() => setCategory(category === c ? '' : c)} />)}
                  </ScrollView>
                  <View style={st.sortRow}>
                    {[['smart', 'Viktigst først'], ['updated', 'Sist oppdatert'], ['newest', 'Nyeste']].map(([id, label]) => (
                      <TouchableOpacity key={id} onPress={() => setSort(id)} testID={`hd-sort-${id}`}>
                        <Text style={[st.sortTxt, sort === id && st.sortOn]}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {rows == null ? <ActivityIndicator color={HD.brand} style={{ margin: 30 }} /> : rows.length ? (
                    <ScrollView style={{ flex: 1 }} testID="hd-ticket-list">
                      {rows.map((t) => <TicketRow key={t.id} t={t} active={t.id === selected} onPress={() => setSelected(t.id)} />)}
                    </ScrollView>
                  ) : (
                    <Empty icon="checkmark-done-circle-outline" title="Ingen saker her" text={view === 'open' ? 'Innboksen er tom. Godt jobbet!' : 'Ingen saker passer filteret.'} />
                  )}
                </View>
              ) : null}
              {showDetail ? (
                <View style={st.detailCol}>
                  <TicketDetail id={selected} me={me} team={team} onClose={() => setSelected(null)} isWide={isWide} isPhone={isPhone} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function TicketRow({ t, active, onPress }) {
  const sla = slaState(t);
  return (
    <TouchableOpacity style={[st.row, active && st.rowOn]} onPress={onPress} accessibilityRole="button" testID={`hd-row-${t.number}`}>
      <View style={st.rowLeft}>
        {t.unreadForAgent ? <View style={st.dot} /> : <View style={{ width: 8 }} />}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={st.rowTop}>
          <Text style={st.rowNum}>{t.number}</Text>
          <StatusPill status={t.status} agent small />
          <PriorityPill priority={t.priority} small />
          {sla.state === 'breached' ? <Pill label="Over frist" tone="danger" icon="alarm" small /> : sla.state === 'soon' ? <Pill label="Frist snart" tone="warn" icon="alarm-outline" small /> : null}
          {t.fixState === 'proposed' ? <Pill label="AI-fiks" tone="violet" icon="construct" small /> : null}
        </View>
        <Text style={[st.rowSubject, t.unreadForAgent && { fontWeight: '600' }]} numberOfLines={1}>{t.subject}</Text>
        <Text style={st.rowPreview} numberOfLines={1}>{t.aiSummary || t.preview}</Text>
        <View style={st.rowMeta}>
          <Text style={st.rowMetaTxt} numberOfLines={1}>{t.requester?.name || t.requester?.email}{t.requester?.companyName ? ` · ${t.requester.companyName}` : ''}</Text>
          <Text style={st.rowMetaTxt}>{formatWhen(t.updatedAtMs)}</Text>
        </View>
        <View style={st.rowIcons}>
          {t.errorCount ? <Text style={st.rowIcon}><Ionicons name="bug-outline" size={11} /> {t.errorCount}</Text> : null}
          {t.hasAttachments ? <Ionicons name="image-outline" size={12} color={HD.muted} /> : null}
          {t.sentiment === 'negative' ? <Ionicons name="sad-outline" size={12} color={HD.danger} /> : null}
          {t.assigneeName ? <Text style={st.rowIcon}><Ionicons name="person-outline" size={11} /> {t.assigneeName}</Text> : <Text style={[st.rowIcon, { color: HD.warn }]}>Ikke tildelt</Text>}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ─────────── Saksbildet ─────────── */

function TicketDetail({
  id, me, team, onClose, isWide, isPhone,
}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mode, setMode] = useState('public');
  const [text, setText] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [macroOpen, setMacroOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const scrollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      setData(await helpdeskCall('agentGet', { id }));
      setError('');
    } catch (e) {
      setError(e?.message || 'Fant ikke saken.');
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    setText('');
    setFiles([]);
    setMode('public');
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [id, load]);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3500); };

  if (error) return <Empty icon="alert-circle-outline" title={error}><Btn label="Lukk" kind="secondary" onPress={onClose} /></Empty>;
  if (!data) return <ActivityIndicator color={HD.brand} style={{ margin: 40 }} />;
  const { ticket: t, messages, history, articles, brief } = data;
  const name = t.requester?.name || '';

  const update = async (patch, label) => {
    setBusy(label || 'update');
    try {
      const res = await helpdeskCall('agentUpdate', { id, ...patch });
      await load();
      if (res?.emailSent === true) flash('Oppdatert. Kunden har fått e-post.');
      else if (res?.emailSent === false) flash('Oppdatert, men e-posten til kunden feilet.');
      else flash('Oppdatert.');
    } catch (e) {
      flash(e?.message || 'Klarte ikke oppdatere.');
    } finally {
      setBusy('');
    }
  };

  const send = async (status) => {
    if (!text.trim() && !files.length) return;
    setBusy(`send-${status || 'note'}`);
    try {
      const res = await helpdeskCall('agentReply', {
        id, body: text.trim(), internal: mode === 'internal', status, attachments: toUpload(files),
      });
      setText('');
      setFiles([]);
      await load();
      flash(mode === 'internal' ? 'Internt notat lagret.' : res?.emailSent ? 'Svar sendt på e-post og i ProTop.' : 'Svar lagret i ProTop, men e-posten feilet.');
    } catch (e) {
      flash(e?.message || 'Svaret ble ikke sendt.');
    } finally {
      setBusy('');
    }
  };

  const rerunAi = async () => {
    setAiBusy(true);
    try { await helpdeskCall('agentAi', { id }); await load(); flash('AI-analysen er oppdatert.'); } catch (e) { flash(e?.message || 'AI svarte ikke.'); } finally { setAiBusy(false); }
  };

  const fix = async (state, extra = {}) => {
    setBusy(`fix-${state}`);
    try { await helpdeskCall('agentFix', { id, state, ...extra }); await load(); flash(`Fiks: ${pickText(FIX_STATES[state].label)}`); } catch (e) { flash(e?.message); } finally { setBusy(''); }
  };

  const ai = t.ai || {};
  const closed = t.status === 'closed';

  const conversation = (
    <View style={{ flex: 1, minWidth: 0 }}>
      {ai.summary || ai.suggestedReply ? (
        <View style={st.aiCard} testID="hd-ai-card">
          <View style={st.aiHead}>
            <Ionicons name="sparkles" size={16} color={HD.violet} />
            <Text style={st.aiTitle}>AI-analyse</Text>
            <Text style={st.muted}>{ai.engine === 'regler' ? 'regelbasert' : 'Gemini'} · {formatWhen(ai.atMs)}</Text>
            <View style={{ flex: 1 }} />
            <Btn label="Kjør på nytt" icon="refresh" kind="ghost" small busy={aiBusy} onPress={rerunAi} testID="hd-ai-rerun" />
          </View>
          {ai.summary ? <Text style={st.aiSummary}>{ai.summary}</Text> : null}
          {ai.rootCause ? <Text style={st.aiCause}><Text style={{ fontWeight: '600' }}>Sannsynlig årsak: </Text>{ai.rootCause}</Text> : null}
          <View style={st.rowGap}>
            {ai.sentiment === 'negative' ? <Pill label="Misfornøyd kunde" tone="danger" icon="sad-outline" small /> : null}
            {ai.isBug ? <Pill label="Feil i ProTop" tone="warn" icon="bug" small /> : null}
            {(ai.tags || []).map((tag) => <Pill key={tag} label={tag} small />)}
          </View>
          {ai.suggestedReply && !closed ? (
            <Btn
              label="Bruk svarforslaget"
              icon="create-outline"
              kind="secondary"
              small
              style={{ alignSelf: 'flex-start', marginTop: 8 }}
              onPress={() => { setMode('public'); setText(fillMacro(ai.suggestedReply, { name, number: t.number })); }}
              testID="hd-use-suggestion"
            />
          ) : null}
        </View>
      ) : (
        <Btn label="Kjør AI-analyse" icon="sparkles" kind="secondary" small busy={aiBusy} onPress={rerunAi} style={{ alignSelf: 'flex-start', marginBottom: 10 }} />
      )}

      <View style={st.thread} testID="hd-thread">
        {messages.map((m) => {
          if (m.role === 'system') {
            return (
              <View key={m.id} style={st.sysMsg}>
                <Ionicons name="information-circle-outline" size={13} color={HD.muted} />
                <Text style={st.sysTxt}>{m.body} · {formatWhen(m.createdAtMs)}</Text>
              </View>
            );
          }
          const agent = m.role === 'agent';
          return (
            <View key={m.id} style={[st.msg, m.internal ? st.msgNote : agent ? st.msgAgent : st.msgUser]}>
              <View style={st.msgHead}>
                <Avatar name={m.authorName || (agent ? 'Support' : name)} size={26} color={agent ? HD.brand : HD.teal} />
                <Text style={st.msgAuthor}>{m.authorName || (agent ? 'Support' : name)}</Text>
                {m.internal ? <Pill label="Internt notat" tone="warn" icon="lock-closed" small /> : null}
                <Text style={st.muted}>{formatWhen(m.createdAtMs)}</Text>
              </View>
              {m.body ? <Text style={st.msgBody} selectable>{m.body}</Text> : null}
              {m.attachments?.length ? (
                <View style={[st.rowGap, { marginTop: 8 }]}>{m.attachments.map((a) => <RemoteImage key={a.id} attachment={a} size={96} />)}</View>
              ) : null}
            </View>
          );
        })}
      </View>

      {t.transcript ? (
        <View style={st.transcript}>
          <Text style={st.boxTitle}>Samtale med assistenten før saken</Text>
          <Text style={st.monoSmall} selectable>{t.transcript}</Text>
        </View>
      ) : null}

      <View style={[st.composer, mode === 'internal' && st.composerNote]} testID="hd-composer">
        <View style={st.composerTabs}>
          {[['public', 'Svar til kunden', 'chatbubble-outline'], ['internal', 'Internt notat', 'lock-closed-outline']].map(([m, label, icon]) => (
            <TouchableOpacity key={m} onPress={() => setMode(m)} style={[st.cTab, mode === m && st.cTabOn]} testID={`hd-mode-${m}`}>
              <Ionicons name={icon} size={14} color={mode === m ? HD.ink : HD.muted} />
              <Text style={[st.cTabTxt, mode === m && { color: HD.ink, fontWeight: '600' }]}>{label}</Text>
            </TouchableOpacity>
          ))}
          <View style={{ flex: 1 }} />
          <TouchableOpacity onPress={() => setMacroOpen((v) => !v)} style={st.cTab} testID="hd-macros">
            <Ionicons name="flash-outline" size={14} color={HD.brand} />
            <Text style={[st.cTabTxt, { color: HD.brand }]}>Svarmaler</Text>
          </TouchableOpacity>
        </View>
        {macroOpen ? (
          <View style={st.macroList}>
            {MACROS.map((m) => (
              <TouchableOpacity
                key={m.id}
                style={st.macroRow}
                onPress={() => { setMode('public'); setText(fillMacro(m.body, { name, number: t.number })); setMacroOpen(false); }}
                testID={`hd-macro-${m.id}`}
              >
                <Text style={st.macroTitle}>{m.title}</Text>
                <Text style={st.muted}>→ {statusLabel(m.status, { agent: true })}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder={mode === 'internal' ? 'Notat bare teamet ser …' : `Svar til ${name || 'kunden'} …`}
          placeholderTextColor={HD.placeholder}
          style={st.composerInput}
          editable={!closed || mode === 'internal'}
          testID="hd-reply-input"
        />
        <AttachmentPicker value={files} onChange={setFiles} compact testID="hd-reply-attach" />
        {mode === 'public' ? (
          <View style={[st.rowGap, { marginTop: 10 }]}>
            <Text style={st.muted}>Send og sett status:</Text>
            <Btn label="Venter på kunde" icon="send" small busy={busy === 'send-pending'} disabled={closed || (!text.trim() && !files.length)} onPress={() => send('pending')} testID="hd-send-pending" />
            <Btn label="Åpen" kind="secondary" small busy={busy === 'send-open'} disabled={closed || (!text.trim() && !files.length)} onPress={() => send('open')} testID="hd-send-open" />
            <Btn label="På vent" kind="secondary" small busy={busy === 'send-on_hold'} disabled={closed || (!text.trim() && !files.length)} onPress={() => send('on_hold')} />
            <Btn label="Løst" icon="checkmark-done" kind="secondary" small busy={busy === 'send-solved'} disabled={closed || (!text.trim() && !files.length)} onPress={() => send('solved')} testID="hd-send-solved" />
          </View>
        ) : (
          <Btn label="Lagre notat" icon="lock-closed" small style={{ alignSelf: 'flex-start', marginTop: 10 }} busy={busy === 'send-note'} disabled={!text.trim() && !files.length} onPress={() => send(undefined)} testID="hd-save-note" />
        )}
      </View>
    </View>
  );

  const side = (
    <View style={[st.sideCol, !isWide && { width: '100%' }]}>
      <Box title="Kunde" icon="person-circle-outline" testID="hd-customer">
        <KV k="Navn" v={t.requester?.name} />
        <KV k="E-post" v={t.requester?.email} copy />
        {t.requester?.contactEmail ? <KV k="Svar til" v={t.requester.contactEmail} copy /> : null}
        <KV k="Bruker-ID" v={t.requester?.uid} copy mono />
        <KV k="Telefon" v={t.requester?.phone} />
        <KV k="Bedrift" v={t.requester?.companyName} />
        <KV k="Bedrift-ID" v={t.requester?.companyId} mono copy />
        <KV k="Område" v={t.requester?.workspace === 'company' ? 'Bedrift' : t.requester?.workspace === 'private' ? 'Privat' : ''} />
        <KV k="Rolle" v={t.requester?.role} />
        <KV k="Innlogging" v={`${t.requester?.provider || '?'}${t.requester?.emailVerified ? ' · bekreftet' : ' · ikke bekreftet'}`} />
        <KV k="Kanal" v={t.channel} />
      </Box>
      <TechBox d={t.diagnostics} />
      {t.fix ? <FixBox t={t} fix={t.fix} brief={brief} busy={busy} onFix={fix} flash={flash} /> : (
        <Box title="Oppdrag til utvikler" icon="code-slash-outline">
          <Text style={st.muted}>Ingen fiks-forslag. Lag et oppdrag manuelt hvis det er en feil.</Text>
          <View style={[st.rowGap, { marginTop: 8 }]}>
            <Btn label="Kopier oppdrag" icon="copy-outline" kind="secondary" small onPress={() => flash(copyText(brief) ? 'Oppdraget er kopiert.' : 'Kunne ikke kopiere.')} />
            <Btn label="Foreslå fiks" icon="construct-outline" kind="secondary" small onPress={() => fix('proposed', { title: t.subject })} />
          </View>
        </Box>
      )}
      {articles?.length ? (
        <Box title="Artikler som kan hjelpe" icon="book-outline">
          {articles.map((a) => (
            <TouchableOpacity key={a.id} style={st.artRow} onPress={() => { setMode('public'); setText((v) => `${v}${v ? '\n\n' : ''}Denne artikkelen forklarer det steg for steg: «${a.title}» – https://protop.no/hjelp/artikkel/${a.id}`); }}>
              <Ionicons name="add-circle-outline" size={15} color={HD.brand} />
              <Text style={st.artTxt} numberOfLines={2}>{a.title}</Text>
            </TouchableOpacity>
          ))}
          <Text style={[st.muted, { marginTop: 4 }]}>Trykk for å lime inn lenken i svaret.</Text>
        </Box>
      ) : null}
      {history?.length ? (
        <Box title={`Andre saker fra kunden (${history.length})`} icon="time-outline">
          {history.map((h) => (
            <View key={h.id} style={st.histRow}>
              <Text style={st.rowNum}>{h.number}</Text>
              <Text style={st.histTxt} numberOfLines={1}>{h.subject}</Text>
              <StatusPill status={h.status} agent small />
            </View>
          ))}
        </Box>
      ) : null}
      {t.csat ? (
        <Box title="Kundens vurdering" icon="heart-outline">
          <Pill label={t.csat.rating === 'good' ? 'Bra' : 'Ikke bra'} tone={t.csat.rating === 'good' ? 'ok' : 'danger'} icon={t.csat.rating === 'good' ? 'thumbs-up' : 'thumbs-down'} />
          {t.csat.comment ? <Text style={[st.msgBody, { marginTop: 6 }]}>«{t.csat.comment}»</Text> : null}
        </Box>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1 }} testID="hd-detail">
      <View style={st.detailHead}>
        <TouchableOpacity onPress={onClose} accessibilityLabel="Lukk saken" style={st.closeBtn} testID="hd-close-detail">
          <Ionicons name={isWide ? 'close' : 'arrow-back'} size={20} color={HD.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={st.rowGap}>
            <Text style={st.detailNum}>{t.number}</Text>
            <StatusPill status={t.status} agent />
            <PriorityPill priority={t.priority} />
            {slaState(t).state === 'breached' ? <Pill label="Over frist for første svar" tone="danger" icon="alarm" /> : null}
          </View>
          <Text style={st.detailSubject} selectable>{t.subject}</Text>
          <Text style={st.muted}>
            Opprettet {formatWhen(t.createdAtMs)} · Første svar: {t.firstResponseAtMs ? formatDuration(t.firstResponseAtMs - t.createdAtMs) : 'ikke ennå'}
          </Text>
        </View>
      </View>

      <View style={st.propsBar} testID="hd-props">
        <Select label="Status" value={t.status} options={STATUS_ORDER.map((v) => [v, statusLabel(v, { agent: true })])} onChange={(v) => update({ status: v }, 'status')} testID="hd-status" />
        <Select label="Prioritet" value={t.priority} options={PRIORITY_ORDER.map((v) => [v, priorityLabel(v)])} onChange={(v) => update({ priority: v })} testID="hd-priority" />
        <Select label="Kategori" value={t.category} options={CATEGORY_ORDER.map((v) => [v, categoryLabel(v)])} onChange={(v) => update({ category: v })} testID="hd-category" />
        <Select label="Område" value={t.module} options={MODULE_ORDER.map((v) => [v, moduleLabel(v)])} onChange={(v) => update({ module: v })} testID="hd-module" />
        <Select
          label="Tildelt"
          value={t.assigneeUid || ''}
          options={[['', 'Ikke tildelt'], ...team.map((m) => [m.uid, m.uid === me?.uid ? `${m.name || m.email} (meg)` : (m.name || m.email)])]}
          onChange={(v) => update({ assigneeUid: v })}
          testID="hd-assignee"
        />
        <View style={st.rowGap}>
          {t.status !== 'closed' ? <Btn label="Lukk og arkiver" icon="archive-outline" kind="secondary" small busy={busy === 'close'} onPress={() => update({ status: 'closed' }, 'close')} testID="hd-close-ticket" /> : (
            <Btn label="Gjenåpne" icon="refresh" kind="secondary" small onPress={() => flash('Lukkede saker gjenåpnes ikke. Be kunden opprette en ny sak.')} />
          )}
        </View>
      </View>
      {toast ? <View style={st.toast}><Text style={st.toastTxt} testID="hd-toast">{toast}</Text></View> : null}

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={[st.detailBody, isWide && !isPhone && st.detailBodyWide]}>
        {isWide && !isPhone ? (
          <>
            {conversation}
            {side}
          </>
        ) : (
          <>
            {conversation}
            {side}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Select({
  label, value, options, onChange, testID,
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(([v]) => v === value);
  return (
    <View style={[st.select, open && { zIndex: 100 }]}>
      <Text style={st.selectLabel}>{label}</Text>
      <TouchableOpacity onPress={() => setOpen((v) => !v)} style={st.selectBtn} accessibilityRole="button" accessibilityLabel={`${label}: ${current?.[1] || ''}`} testID={testID}>
        <Text style={st.selectVal} numberOfLines={1}>{current?.[1] || '–'}</Text>
        <Ionicons name="chevron-down" size={13} color={HD.muted} />
      </TouchableOpacity>
      {open ? (
        <View style={st.selectMenu}>
          {options.map(([v, l]) => (
            <TouchableOpacity key={v || 'none'} onPress={() => { setOpen(false); if (v !== value) onChange(v); }} style={[st.selectOpt, v === value && { backgroundColor: HD.brandSoft }]} testID={`${testID}-${v || 'none'}`}>
              <Text style={st.selectOptTxt}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Box({
  title, icon, children, testID, tone, style,
}) {
  return (
    <View style={[st.box, style, tone === 'violet' && { borderColor: HD.violetLine, backgroundColor: HD.violetBg }]} testID={testID}>
      <View style={st.boxHead}>
        <Ionicons name={icon} size={16} color={tone === 'violet' ? HD.violet : HD.brand} />
        <Text style={st.boxTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function KV({
  k, v, copy, mono,
}) {
  if (!v) return null;
  return (
    <View style={st.kv}>
      <Text style={st.kvK}>{k}</Text>
      <Text style={[st.kvV, mono && st.mono]} selectable numberOfLines={2}>{v}</Text>
      {copy && Platform.OS === 'web' ? (
        <TouchableOpacity onPress={() => copyText(String(v))} accessibilityLabel={`Kopier ${k}`}>
          <Ionicons name="copy-outline" size={14} color={HD.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function TechBox({ d }) {
  const [tab, setTab] = useState('console');
  if (!d) {
    return <Box title="Teknisk info" icon="hardware-chip-outline"><Text style={st.muted}>Kunden valgte å ikke sende teknisk info.</Text></Box>;
  }
  const env = d.env || {};
  const errors = (d.console || []).filter((c) => c.level === 'error' || c.level === 'warn');
  const fails = d.network || [];
  return (
    <Box title="Teknisk info" icon="hardware-chip-outline" testID="hd-tech">
      <KV k="Side" v={`${d.page?.path || '?'}${d.page?.tab ? ` (${d.page.tab}${d.page.subView ? `/${d.page.subView}` : ''})` : ''}`} mono />
      <KV k="Nettleser" v={[env.browser, env.os].filter(Boolean).join(' · ')} />
      <KV k="Plattform" v={`${env.platform || '?'}${env.standalone ? ' · hjemskjerm-app' : ''}${env.touch ? ' · berøring' : ''}`} />
      <KV k="Versjon" v={`${env.appVersion || '?'} · ${env.buildId || '?'}`} mono />
      <KV k="Skjerm" v={[env.viewport && `vindu ${env.viewport}`, env.screen && `skjerm ${env.screen}`, env.pixelRatio && `${env.pixelRatio}x`].filter(Boolean).join(' · ')} />
      <KV k="Språk / sone" v={[env.language, env.timezone].filter(Boolean).join(' · ')} />
      <KV k="Nett" v={env.online === false ? 'OFFLINE' : `online${env.connection ? ` (${env.connection})` : ''}`} />
      <View style={[st.rowGap, { marginTop: 8 }]}>
        {[['console', `Konsoll (${errors.length})`], ['network', `Nettverk (${fails.length})`], ['steps', `Steg (${(d.breadcrumbs || []).length})`]].map(([id, label]) => (
          <Chip key={id} label={label} active={tab === id} onPress={() => setTab(id)} testID={`hd-tech-${id}`} />
        ))}
      </View>
      <View style={st.techList}>
        {tab === 'console' ? (errors.length ? errors.map((c, i) => (
          <Text key={i} style={[st.monoSmall, { color: c.level === 'error' ? HD.consoleError : HD.noteLine }]} selectable>
            [{c.level}]{c.count > 1 ? ` ×${c.count}` : ''} {c.message}
          </Text>
        )) : <Text style={st.monoSmall}>Ingen feil i konsollen.</Text>) : null}
        {tab === 'network' ? (fails.length ? fails.map((n, i) => (
          <Text key={i} style={st.monoSmall} selectable>{n.method} {n.url} → {n.status || n.error || 'feil'}{n.durationMs ? ` (${n.durationMs} ms)` : ''}</Text>
        )) : <Text style={st.monoSmall}>Ingen feilede kall.</Text>) : null}
        {tab === 'steps' ? ((d.breadcrumbs || []).length ? d.breadcrumbs.map((b, i) => (
          <Text key={i} style={st.monoSmall}>{i + 1}. {b.type}: {b.label}</Text>
        )) : <Text style={st.monoSmall}>Ingen steg registrert.</Text>) : null}
      </View>
    </Box>
  );
}

function FixBox({
  t, fix, brief, busy, onFix, flash,
}) {
  const [pr, setPr] = useState(fix.prUrl || '');
  const state = FIX_STATES[fix.state] || FIX_STATES.proposed;
  return (
    <Box title="AI-forslag til fiks" icon="construct-outline" tone="violet" testID="hd-fix">
      <View style={st.rowGap}>
        <Pill label={pickText(state.label)} tone={state.tone === 'muted' ? 'muted' : state.tone} />
        {fix.risk ? <Pill label={`Risiko: ${fix.risk === 'low' ? 'lav' : fix.risk === 'high' ? 'høy' : 'middels'}`} tone={fix.risk === 'high' ? 'danger' : 'muted'} small /> : null}
      </View>
      {fix.title ? <Text style={st.fixTitle}>{fix.title}</Text> : null}
      {fix.likelyCause ? <Text style={st.msgBody}>{fix.likelyCause}</Text> : null}
      {fix.steps?.length ? (
        <View style={{ marginTop: 6 }}>{fix.steps.map((s, i) => <Text key={i} style={st.fixStep}>{i + 1}. {s}</Text>)}</View>
      ) : null}
      {fix.filesToInspect?.length ? (
        <View style={{ marginTop: 6 }}>{fix.filesToInspect.map((f) => <Text key={f} style={st.mono}>{f}</Text>)}</View>
      ) : null}
      {fix.testPlan?.length ? <Text style={[st.muted, { marginTop: 6 }]}>Test: {fix.testPlan.join(' · ')}</Text> : null}
      <Text style={[st.muted, { marginTop: 8 }]}>Ingenting deployes automatisk. Godkjenn, og gi oppdraget til Claude Code eller en utvikler.</Text>
      <View style={[st.rowGap, { marginTop: 8 }]}>
        <Btn label="Kopier oppdrag til Claude Code" icon="copy-outline" small onPress={() => flash(copyText(brief) ? 'Oppdraget er kopiert. Lim det inn i Claude Code.' : 'Kunne ikke kopiere på denne enheten.')} testID="hd-fix-copy" />
        {fix.state !== 'approved' && fix.state !== 'deployed' ? <Btn label="Godkjenn" icon="checkmark" kind="secondary" small busy={busy === 'fix-approved'} onPress={() => onFix('approved')} testID="hd-fix-approve" /> : null}
        {fix.state === 'proposed' ? <Btn label="Avvis" icon="close" kind="ghost" small busy={busy === 'fix-rejected'} onPress={() => onFix('rejected')} testID="hd-fix-reject" /> : null}
      </View>
      {fix.state === 'approved' ? (
        <View style={{ marginTop: 10 }}>
          <Field value={pr} onChangeText={setPr} placeholder="Lenke til PR (valgfritt)" />
          <Btn label="Merk som rettet og ute" icon="rocket-outline" small busy={busy === 'fix-deployed'} onPress={() => onFix('deployed', { prUrl: pr })} testID="hd-fix-deployed" />
          <Text style={[st.muted, { marginTop: 6 }]}>Bruk deretter svarmalen «Rettet og ute» for å gi kunden beskjed.</Text>
        </View>
      ) : null}
      {fix.history?.length ? (
        <View style={{ marginTop: 8 }}>
          {fix.history.map((h, i) => <Text key={i} style={st.muted}>{formatWhen(h.atMs)} · {h.byName}: {pickText(FIX_STATES[h.state]?.label)}{h.note ? ` – ${h.note}` : ''}</Text>)}
        </View>
      ) : null}
    </Box>
  );
}

/* ─────────── Statistikk ─────────── */

function StatsPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    helpdeskCall('agentStats').then(setData).catch((e) => setError(e?.message || 'Klarte ikke hente statistikk.'));
  }, []);
  if (error) return <Notice tone="danger">{error}</Notice>;
  if (!data) return <ActivityIndicator color={HD.brand} style={{ margin: 40 }} />;
  const s = data.stats;
  const tiles = [
    ['Åpne saker', s.open, 'file-tray-full-outline'],
    ['Ikke tildelt', s.unassigned, 'help-buoy-outline'],
    ['Over frist', s.breached, 'alarm-outline'],
    ['Nye i dag', s.createdToday, 'add-circle-outline'],
    ['Løst siste 30 d', s.solved, 'checkmark-done-outline'],
    ['Første svar (median)', formatDuration(s.medianFirstResponseMs), 'flash-outline'],
    ['Løsningstid (median)', formatDuration(s.medianResolutionMs), 'timer-outline'],
    ['Fornøyde kunder', s.csatPercent == null ? '–' : `${s.csatPercent} %`, 'heart-outline'],
    ['Løst av assistenten', s.deflectionRate == null ? '–' : `${s.deflectionRate} %`, 'sparkles-outline'],
    ['AI-fiks til godkjenning', s.fixProposals, 'construct-outline'],
  ];
  const maxCat = Math.max(1, ...Object.values(s.byCategory));
  const maxMod = Math.max(1, ...Object.values(s.byModule));
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} testID="hd-stats">
      <Text style={st.listTitle}>Statistikk (siste 30 dager)</Text>
      <View style={st.tiles}>
        {tiles.map(([label, value, icon]) => (
          <View key={label} style={st.tile}>
            <Ionicons name={icon} size={18} color={HD.brand} />
            <Text style={st.tileVal}>{value}</Text>
            <Text style={st.tileLabel}>{label}</Text>
          </View>
        ))}
      </View>
      <Text style={st.muted}>
        Målet er at hjelpeartikler og assistenten løser 80 % av henvendelsene. Assistenten har løst {data.deflection?.resolved || 0} og sendt {data.deflection?.escalated || 0} videre.
      </Text>
      <View style={st.chartsRow}>
        <Box title="Saker per kategori" icon="pie-chart-outline" style={st.chartBox}>
          {Object.entries(s.byCategory).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Bar key={k} label={categoryLabel(k)} value={v} max={maxCat} />)}
          {!Object.keys(s.byCategory).length ? <Text style={st.muted}>Ingen saker ennå.</Text> : null}
        </Box>
        <Box title="Saker per område" icon="grid-outline" style={st.chartBox}>
          {Object.entries(s.byModule).sort((a, b) => b[1] - a[1]).map(([k, v]) => <Bar key={k} label={moduleLabel(k)} value={v} max={maxMod} />)}
          {!Object.keys(s.byModule).length ? <Text style={st.muted}>Ingen saker ennå.</Text> : null}
        </Box>
      </View>
      <Box title="Mest leste hjelpeartikler" icon="book-outline">
        {(data.articles || []).map((a) => (
          <View key={a.id} style={st.kv}>
            <Text style={[st.kvV, { flex: 1 }]} numberOfLines={1}>{getArticle(a.id)?.title || a.title}</Text>
            <Text style={st.muted}>{a.views || 0} visn. · 👍 {a.helpful || 0} · 👎 {a.notHelpful || 0}</Text>
          </View>
        ))}
        {!data.articles?.length ? <Text style={st.muted}>Ingen visninger ennå.</Text> : null}
      </Box>
    </ScrollView>
  );
}

function Bar({ label, value, max }) {
  return (
    <View style={st.bar}>
      <Text style={st.barLabel} numberOfLines={1}>{label}</Text>
      <View style={st.barTrack}><View style={[st.barFill, { width: `${Math.max(4, (value / max) * 100)}%` }]} /></View>
      <Text style={st.barVal}>{value}</Text>
    </View>
  );
}

/* ─────────── Team ─────────── */

function TeamPanel({ session, onTeam }) {
  const [data, setData] = useState(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('agent');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const load = useCallback(async () => {
    const res = await helpdeskCall('teamList');
    setData(res);
    onTeam?.(res.members || []);
  }, [onTeam]);
  useEffect(() => { load().catch((e) => setMsg(e?.message)); }, [load]);
  const owner = session.role === 'owner';
  const invite = async () => {
    setBusy(true);
    setMsg('');
    try {
      const res = await helpdeskCall('teamInvite', { email, role });
      setMsg(res.emailSent ? `Invitasjon sendt til ${email}.` : `Invitasjonen er lagret, men e-posten feilet. Be ${email} logge inn på protop.no/helpdesk.`);
      setEmail('');
      await load();
    } catch (e) {
      setMsg(e?.message || 'Invitasjonen feilet.');
    } finally {
      setBusy(false);
    }
  };
  if (!data) return <ActivityIndicator color={HD.brand} style={{ margin: 40 }} />;
  const me = data.members.find((m) => m.uid === data.me?.uid);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16, maxWidth: 760 }} testID="hd-team">
      <Text style={st.listTitle}>Helpdesk-teamet</Text>
      <Box title={`Medlemmer (${data.members.length})`} icon="people-outline">
        {data.members.map((m) => (
          <View key={m.uid} style={st.memberRow}>
            <Avatar name={m.name || m.email} size={34} />
            <View style={{ flex: 1 }}>
              <Text style={st.kvV}>{m.name || m.email}{m.uid === data.me?.uid ? ' (deg)' : ''}</Text>
              <Text style={st.muted}>{m.email}</Text>
            </View>
            <Pill label={m.role === 'owner' ? 'Eier' : 'Saksbehandler'} tone={m.role === 'owner' ? 'info' : 'muted'} small />
            {owner && m.uid !== data.me?.uid && m.role !== 'owner' ? (
              <Btn label="Fjern" kind="ghost" small onPress={async () => { await helpdeskCall('teamRemove', { uid: m.uid }); load(); }} />
            ) : null}
          </View>
        ))}
      </Box>
      {me ? (
        <Box title="Mine varsler" icon="notifications-outline">
          <TouchableOpacity style={st.memberRow} onPress={async () => { await helpdeskCall('teamSettings', { notify: me.notify === false }); load(); }} accessibilityRole="switch" accessibilityState={{ checked: me.notify !== false }} testID="hd-notify-toggle">
            <Ionicons name={me.notify !== false ? 'checkbox' : 'square-outline'} size={22} color={HD.brand} />
            <Text style={st.kvV}>E-post når det kommer nye saker og kundesvar</Text>
          </TouchableOpacity>
        </Box>
      ) : null}
      {owner ? (
        <Box title="Inviter til teamet" icon="person-add-outline" testID="hd-invite">
          <Field label="E-post" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="kollega@firma.no" testID="hd-invite-email" />
          <View style={[st.rowGap, { marginBottom: 10 }]}>
            <Chip label="Saksbehandler" active={role === 'agent'} onPress={() => setRole('agent')} />
            <Chip label="Eier (kan invitere)" active={role === 'owner'} onPress={() => setRole('owner')} />
          </View>
          <Btn label="Send invitasjon" icon="send" busy={busy} disabled={!email.trim()} onPress={invite} style={{ alignSelf: 'flex-start' }} testID="hd-invite-send" />
          <Text style={[st.muted, { marginTop: 8 }]}>Personen logger inn på protop.no/helpdesk med denne e-posten (bekreftet). Da aktiveres tilgangen.</Text>
          {msg ? <Notice>{msg}</Notice> : null}
        </Box>
      ) : <Text style={st.muted}>Bare eiere kan invitere nye.</Text>}
      {data.invites?.length ? (
        <Box title="Ventende invitasjoner" icon="hourglass-outline">
          {data.invites.map((i) => (
            <View key={i.email} style={st.memberRow}>
              <Text style={[st.kvV, { flex: 1 }]}>{i.email}</Text>
              <Text style={st.muted}>{formatWhen(i.createdAtMs)}</Text>
              {owner ? <Btn label="Trekk tilbake" kind="ghost" small onPress={async () => { await helpdeskCall('teamRemove', { email: i.email }); load(); }} /> : null}
            </View>
          ))}
        </Box>
      ) : null}
    </ScrollView>
  );
}

function OutboxPanel({ outbox }) {
  const [open, setOpen] = useState(0);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} testID="hd-outbox">
      <Text style={st.listTitle}>E-post sendt (bare i demo)</Text>
      {outbox.map((m, i) => (
        <TouchableOpacity key={`${m.subject}-${i}`} style={st.box} onPress={() => setOpen(i)}>
          <Text style={st.muted}>Til: {m.to} · {formatWhen(m.atMs)}</Text>
          <Text style={st.kvV}>{m.subject}</Text>
          {open === i ? <Text style={[st.monoSmall, { color: HD.ink, marginTop: 8 }]} selectable>{m.text}</Text> : null}
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

/* ─────────── Stil ─────────── */

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10, backgroundColor: HD.bg },
  muted: { ...type.label, color: HD.muted },
  rowGap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  loginPage: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: HD.side },
  loginCard: { width: '100%', maxWidth: 420, backgroundColor: HD.card, borderRadius: radius.sheet, padding: 24, gap: 12, alignItems: 'center' },
  loginBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: HD.side, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill },
  loginBadgeTxt: { color: HD.onBrand, fontWeight: '600', ...type.caption, letterSpacing: 0.5 },
  loginTitle: { ...type.h2, fontWeight: '600', color: HD.ink, textAlign: 'center' },
  loginLead: { ...type.body, color: HD.muted, textAlign: 'center', },
  or: { color: HD.muted, ...type.caption },
  portal: { flex: 1, backgroundColor: HD.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, height: 56, backgroundColor: HD.side },
  topIcon: { padding: 6 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { color: HD.onBrand, ...type.title, fontWeight: '600' },
  topSearch: { flex: 1, maxWidth: 560, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: HD.sideSearch, borderRadius: radius.control, paddingHorizontal: 10, height: 36, marginLeft: 12 },
  topSearchInput: { flex: 1, color: HD.onBrand, ...type.body, height: 34 },
  topBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, height: 34, borderRadius: radius.control, borderWidth: 1, borderColor: HD.sideBorder, marginLeft: 'auto' },
  topBtnTxt: { color: HD.onBrand, ...type.label, fontWeight: '600' },
  meRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  phoneSearch: { padding: 10, backgroundColor: HD.card },
  body: { flex: 1, flexDirection: 'row', minHeight: 0 },
  side: { width: 236, backgroundColor: HD.side, paddingVertical: 10, paddingHorizontal: 8, gap: 2 },
  sideMobile: { position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 20, width: 260 },
  sideItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, minHeight: 38, borderRadius: radius.control },
  sideItemOn: { backgroundColor: HD.sideActive },
  sideTxt: { flex: 1, color: HD.sideInk, ...type.label },
  sideCount: { minWidth: 22, paddingHorizontal: 6, height: 20, borderRadius: radius.pill, backgroundColor: HD.sideCount, alignItems: 'center', justifyContent: 'center' },
  sideCountTxt: { color: HD.onBrand, ...type.caption, fontWeight: '600' },
  sideDivider: { height: 1, backgroundColor: HD.sideDivider, marginVertical: 8 },
  main: { flex: 1, minWidth: 0 },
  split: { flex: 1, flexDirection: 'row', minHeight: 0 },
  listCol: { flex: 1, borderRightWidth: 1, borderRightColor: HD.line, backgroundColor: HD.card, minWidth: 0 },
  listColNarrow: { flexGrow: 0, flexShrink: 0, flexBasis: 380, width: 380 },
  listHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 14 },
  listTitle: { ...type.title, fontWeight: '600', color: HD.ink },
  filterRow: { gap: 6, paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center' },
  sortRow: { flexDirection: 'row', gap: 14, paddingHorizontal: 14, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: HD.line },
  sortTxt: { ...type.label, color: HD.muted },
  sortOn: { color: HD.brand, fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: HD.line },
  rowOn: { backgroundColor: HD.brandSoft },
  rowLeft: { paddingTop: 6 },
  dot: { width: 8, height: 8, borderRadius: radius.pill, backgroundColor: HD.brand },
  rowTop: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5, marginBottom: 3 },
  rowNum: { ...type.caption, fontWeight: '600', color: HD.muted },
  rowSubject: { ...type.bodyStrong, color: HD.ink, fontWeight: '600' },
  rowPreview: { ...type.label, color: HD.muted, marginTop: 2 },
  rowMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  rowMetaTxt: { ...type.caption, color: HD.muted, flexShrink: 1 },
  rowIcons: { flexDirection: 'row', gap: 10, marginTop: 3, alignItems: 'center' },
  rowIcon: { ...type.caption, color: HD.muted },
  detailCol: { flex: 1.6, minWidth: 0, backgroundColor: HD.bg },
  detailHead: { flexDirection: 'row', gap: 10, padding: 14, backgroundColor: HD.card, borderBottomWidth: 1, borderBottomColor: HD.line },
  closeBtn: { padding: 4 },
  detailNum: { ...type.bodyStrong, fontWeight: '600', color: HD.brand },
  detailSubject: { ...type.h2, fontWeight: '600', color: HD.ink, marginVertical: 4 },
  propsBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end', paddingHorizontal: 14, paddingVertical: 10, backgroundColor: HD.card, borderBottomWidth: 1, borderBottomColor: HD.line, zIndex: 10 },
  select: { minWidth: 120, zIndex: 1 },
  selectLabel: { ...type.caption, color: HD.muted, marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.4 },
  selectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, borderWidth: 1, borderColor: HD.line, borderRadius: radius.control, paddingHorizontal: 10, height: 34, backgroundColor: HD.card },
  selectVal: { ...type.label, color: HD.ink, flexShrink: 1 },
  selectMenu: { position: 'absolute', top: 54, left: 0, minWidth: 200, maxHeight: 300, backgroundColor: HD.card, borderWidth: 1, borderColor: HD.line, borderRadius: radius.control, paddingVertical: 4, zIndex: 50, shadowColor: HD.night, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8, overflow: 'scroll' },
  selectOpt: { paddingHorizontal: 12, paddingVertical: 9 },
  selectOptTxt: { ...type.label, color: HD.ink },
  toast: { position: 'absolute', top: 120, alignSelf: 'center', backgroundColor: HD.night, paddingHorizontal: 16, paddingVertical: 10, borderRadius: radius.control, zIndex: 60 },
  toastTxt: { color: HD.onBrand, ...type.label },
  detailBody: { padding: 14, gap: 14 },
  detailBodyWide: { flexDirection: 'row', alignItems: 'flex-start' },
  aiCard: { padding: 12, borderRadius: radius.card, backgroundColor: HD.violetBg, borderWidth: 1, borderColor: HD.violetLine, marginBottom: 12, gap: 6 },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  aiTitle: { fontWeight: '600', color: HD.violet, ...type.bodyStrong },
  aiSummary: { ...type.body, color: HD.ink, },
  aiCause: { ...type.label, color: HD.ink, },
  thread: { gap: 10 },
  sysMsg: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'center', paddingHorizontal: 10 },
  sysTxt: { ...type.caption, color: HD.muted, textAlign: 'center' },
  msg: { padding: 12, borderRadius: radius.card, borderWidth: 1 },
  msgUser: { backgroundColor: HD.card, borderColor: HD.line },
  msgAgent: { backgroundColor: HD.brandSoft, borderColor: HD.agentLine },
  msgNote: { backgroundColor: HD.noteSoft, borderColor: HD.noteLine },
  msgHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  msgAuthor: { fontWeight: '600', color: HD.ink, ...type.label },
  msgBody: { ...type.body, color: HD.ink, },
  transcript: { marginTop: 12, padding: 12, borderRadius: radius.control, backgroundColor: HD.sunken },
  composer: { marginTop: 14, padding: 12, borderRadius: radius.card, backgroundColor: HD.card, borderWidth: 1, borderColor: HD.line },
  composerNote: { backgroundColor: HD.noteSoft, borderColor: HD.noteLine },
  composerTabs: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  cTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.control },
  cTabOn: { backgroundColor: HD.sunken },
  cTabTxt: { ...type.label, color: HD.muted },
  composerInput: { minHeight: 120, borderWidth: 1, borderColor: HD.line, borderRadius: radius.control, padding: 10, ...type.body, color: HD.ink, textAlignVertical: 'top', backgroundColor: HD.card, marginBottom: 8 },
  macroList: { borderWidth: 1, borderColor: HD.line, borderRadius: radius.control, marginBottom: 8, backgroundColor: HD.card },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: HD.line },
  macroTitle: { ...type.label, color: HD.ink, fontWeight: '600' },
  sideCol: { width: 340, gap: 12 },
  box: { padding: 12, borderRadius: radius.card, backgroundColor: HD.card, borderWidth: 1, borderColor: HD.line },
  boxHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  boxTitle: { fontWeight: '600', color: HD.ink, ...type.bodyStrong },
  kv: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  kvK: { width: 92, ...type.label, color: HD.muted },
  kvV: { flex: 1, ...type.label, color: HD.ink },
  mono: { fontFamily: Platform.OS === 'web' ? 'ui-monospace, Consolas, monospace' : undefined, ...type.label, color: HD.ink },
  monoSmall: { fontFamily: Platform.OS === 'web' ? 'ui-monospace, Consolas, monospace' : undefined, ...type.caption, color: HD.consoleInk, },
  techList: { marginTop: 8, padding: 10, borderRadius: radius.control, backgroundColor: HD.night, gap: 4 },
  fixTitle: { fontWeight: '600', color: HD.ink, ...type.bodyStrong, marginTop: 8 },
  fixStep: { ...type.label, color: HD.ink, },
  artRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  artTxt: { flex: 1, color: HD.brand, ...type.label },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  histTxt: { flex: 1, ...type.label, color: HD.ink },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: { width: 170, flexGrow: 1, padding: 14, borderRadius: radius.card, backgroundColor: HD.card, borderWidth: 1, borderColor: HD.line, gap: 4 },
  tileVal: { ...type.h1, fontWeight: '600', color: HD.ink },
  tileLabel: { ...type.label, color: HD.muted },
  chartsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  chartBox: { flexGrow: 1, flexBasis: 320 },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  barLabel: { width: 150, ...type.label, color: HD.ink },
  barTrack: { flex: 1, height: 10, borderRadius: radius.control, backgroundColor: HD.sunken, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: radius.control, backgroundColor: HD.brand },
  barVal: { width: 28, textAlign: 'right', ...type.label, color: HD.ink, fontWeight: '600' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
});
