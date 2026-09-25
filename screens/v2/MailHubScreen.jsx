import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  Platform, ActivityIndicator, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, useLayout } from '../../src/theme';
import { Screen } from '../../components/ui';
import { useApp } from '../../src/context/AppContext';
import { DeskBtn } from '../../components/DeskBtn';
import ShellAddButton from '../../components/ShellAddButton';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { MailPaneResizeHandle } from '../../components/MailPaneResizeHandle';
import MailSettingsModal from '../../components/MailSettingsModal';
import MailComposeBox from '../../components/MailComposeBox';
import HelpTarget from '../../components/HelpTarget';
import {
  listCalendarConnections,
  connectMicrosoftMail,
  getCalendarOAuthConfig,
  removeCalendarConnection,
  OAUTH_COMPLETE_MESSAGE,
} from '../../src/utils/calendarIntegration';
import { peekCalendarConnectionsCache } from '../../src/utils/calendarConnectionsCache';
import {
  listMailFolders,
  listMailMessages,
  syncOutlookMailbox,
  getMailMessage,
  sendOutlookMail,
  replyOutlookMail,
  forwardOutlookMail,
  deleteOutlookMail,
  formatMailWhen,
  mailSectionLabel,
} from '../../src/utils/outlookMail';
import {
  loadMailFoldersCache,
  putMailFoldersCache,
  loadMailMessagesCache,
  putMailMessagesCache,
  peekMailFoldersCache,
  peekMailMessagesCache,
  peekMailMessageCache,
  putMailMessageCache,
  loadMailMessageCache,
} from '../../src/utils/mailCache';
import { sanitizeHtml } from '../../src/utils/sanitizeHtml';
import {
  nestMailFolders,
  favoriteMailFolders,
  visibleMailFolderRows,
  expandAncestorIds,
  mailFolderIcon,
} from '../../src/utils/mailFolderTree';
import {
  applyMailPaneDrag,
  clampMailPaneWidth,
  MAIL_FOLDER_PANE_DEFAULT,
  MAIL_FOLDER_PANE_MAX,
  MAIL_FOLDER_PANE_MIN,
  MAIL_LIST_PANE_DEFAULT,
  MAIL_LIST_PANE_MAX,
  MAIL_LIST_PANE_MIN,
} from '../../src/utils/mailPanes';
import {
  uniqueMicrosoftConnections,
  duplicateMicrosoftConnectionIds,
  senderInitials,
} from '../../src/utils/mailUi';
import {
  friendlyMailError,
  isMailCacheFresh,
  MAIL_FOLDER_FRESH_MS,
  MAIL_LIST_PAGE,
  MAIL_STORAGE_MS,
  mailRefreshPlan,
  mergeMailMessages,
  newestMailReceivedAt,
  pickInboxFolderId,
} from '../../src/utils/mailSync';
import {
  loadMailComposePrefs,
  patchMailComposePrefs,
} from '../../src/utils/mailComposePrefs';
import { appendSignatureHtml, prepareHtmlForSend, shouldIncludeSignature } from '../../src/utils/mailSignature';
import { composeBodyToHtml, escapeHtml } from '../../src/utils/mailHtml';

const PANE_KEY = 'weekplan.mail.panes';
const EXPAND_KEY = 'weekplan.mail.expanded';
const DEFAULT_ACCOUNT_KEY = 'weekplan.mail.defaultAccount';
const LAST_FOLDER_KEY = 'weekplan.mail.lastFolder';
const UNREAD_FIRST_KEY = 'weekplan.mail.unreadFirst';

function readJson(key, fallback) {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null;
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

function FolderRow({ row, selected, onSelect, onToggle }) {
  return (
    <View style={[styles.folderRow, selected && styles.folderOn, { paddingLeft: 6 + row.depth * 14 }]}>
      <TouchableOpacity
        style={styles.folderChev}
        onPress={() => { if (row.hasKids) onToggle(row.id); }}
        disabled={!row.hasKids}
        accessibilityLabel={row.expanded ? 'Skjul undermapper' : 'Vis undermapper'}
      >
        {row.hasKids ? (
          <Ionicons
            name={row.expanded ? 'chevron-down' : 'chevron-forward'}
            size={12}
            color={colors.muted}
          />
        ) : (
          <View style={{ width: 12 }} />
        )}
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.folderBody}
        onPress={() => onSelect(row.id)}
        accessibilityRole="button"
        accessibilityState={{ selected }}
      >
        <Ionicons
          name={mailFolderIcon(row.wellKnownName)}
          size={14}
          color={selected ? colors.brand : colors.muted}
        />
        <Text style={[styles.folderName, selected && styles.folderNameOn]} numberOfLines={1}>
          {row.name}
        </Text>
        {row.unread > 0 ? <Text style={styles.unread}>{row.unread}</Text> : null}
      </TouchableOpacity>
    </View>
  );
}

function FolderList({
  favoriteRows, folderRows, folderId, mailAccounts, active,
  grantBusy, onSelect, onToggle, onSwitchAccount, onGrant, onOpenSettings,
}) {
  return (
    <>
      {favoriteRows.length ? (
        <>
          <Text style={styles.paneKicker}>Favoritter</Text>
          {favoriteRows.map((f) => (
            <FolderRow
              key={`fav-${f.id}`}
              row={{ ...f, depth: 0, hasKids: false, expanded: false }}
              selected={f.id === folderId}
              onSelect={onSelect}
              onToggle={onToggle}
            />
          ))}
        </>
      ) : null}
      <Text style={styles.paneKicker}>Mapper</Text>
      {mailAccounts.length === 0 ? (
        <Text style={[styles.muted, { paddingHorizontal: 12 }]}>
          Koble til en Outlook-konto under Innstillinger.
        </Text>
      ) : null}
      {mailAccounts.map((acc) => (
        <View key={acc.id} style={styles.accountBlock}>
          <TouchableOpacity
            style={[styles.accountRow, acc.id === active?.id && styles.accountOn]}
            onPress={() => onSwitchAccount(acc)}
          >
            <Ionicons
              name={acc.id === active?.id ? 'chevron-down' : 'chevron-forward'}
              size={12}
              color={colors.muted}
            />
            <Ionicons name="mail" size={14} color={colors.brand} />
            <Text style={styles.accountLbl} numberOfLines={1}>{acc.email || acc.label || 'Outlook'}</Text>
          </TouchableOpacity>
          {!acc.mailAccess ? (
            <TouchableOpacity style={styles.grantBtn} onPress={() => onGrant(acc.id)} disabled={grantBusy}>
              <Text style={styles.grantTxt}>{grantBusy ? 'Kobler til e-post…' : 'Gi e-posttilgang'}</Text>
            </TouchableOpacity>
          ) : acc.id === active?.id ? (
            folderRows.map((row) => (
              <FolderRow
                key={row.id}
                row={row}
                selected={row.id === folderId}
                onSelect={onSelect}
                onToggle={onToggle}
              />
            ))
          ) : null}
        </View>
      ))}
      <TouchableOpacity style={styles.grantBtn} onPress={onOpenSettings}>
        <Text style={styles.grantTxt}>Innstillinger</Text>
      </TouchableOpacity>
    </>
  );
}

function MailFolderDrawer({
  visible, onClose, currentName, children,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.drawerRoot}>
        <Pressable style={styles.drawerBackdrop} onPress={onClose} accessibilityLabel="Lukk mapper" />
        <View style={styles.drawerPanel}>
          <View style={styles.drawerHead}>
            <Text style={styles.drawerTitle} numberOfLines={1}>{currentName || 'Mapper'}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Lukk" style={styles.drawerClose}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function addrLine(list) {
  return (list || []).map((r) => r.name || r.address).filter(Boolean).join(', ');
}

function MessageRows({ grouped, selectedId, onOpen, onPrefetch, compact = false, emptyText, loading }) {
  if (!grouped.length) {
    if (loading) {
      return (
        <View style={styles.listLoading}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.muted}>Laster meldinger…</Text>
        </View>
      );
    }
    return <Text style={[styles.muted, { padding: 16 }]}>{emptyText}</Text>;
  }
  return grouped.map((row) => (
    row.type === 'head' ? (
      <Text key={row.id} style={styles.section}>{row.label}</Text>
    ) : (
      <TouchableOpacity
        key={row.id}
        style={[styles.msgRow, compact && styles.msgRowCompact, row.id === selectedId && styles.msgOn, !row.isRead && styles.msgUnread]}
        onPress={() => onOpen(row.id)}
        onMouseEnter={onPrefetch ? () => onPrefetch(row.id) : undefined}
      >
        {!row.isRead ? <View style={styles.unreadDot} /> : <View style={styles.readDot} />}
        <View style={styles.avatar}>
          <Text style={styles.avatarTxt}>{senderInitials(row.from?.name, row.from?.address)}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.msgTop}>
            <Text style={[styles.msgFrom, !row.isRead && styles.msgBold]} numberOfLines={1}>
              {row.from?.name || row.from?.address || 'Ukjent'}
            </Text>
            <Text style={styles.msgWhen}>{formatMailWhen(row.receivedAt)}</Text>
          </View>
          <Text style={styles.msgSub} numberOfLines={1}>{row.subject}</Text>
          <Text style={styles.msgPrev} numberOfLines={compact ? 1 : 2}>{row.preview}</Text>
        </View>
        {row.hasAttachments ? <Ionicons name="attach" size={14} color={colors.muted} /> : null}
        {row.importance === 'high' ? <Ionicons name="arrow-up" size={12} color={colors.danger} /> : null}
      </TouchableOpacity>
    )
  ));
}

function ReadingBody({ open, onReply, onReplyAll, onForward }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
      <Text style={styles.readSubject}>{open.subject}</Text>
      <Text style={styles.readFrom}>
        {open.from?.name || open.from?.address}
        {open.from?.address ? ` <${open.from.address}>` : ''}
      </Text>
      <Text style={styles.readMeta}>Til: {addrLine(open.to) || '—'}</Text>
      <View style={styles.readActions}>
        <DeskBtn icon="arrow-undo-outline" label="Svar" onPress={onReply} />
        <DeskBtn icon="arrow-undo" label="Svar alle" onPress={onReplyAll} />
        <DeskBtn icon="arrow-redo-outline" label="Videresend" onPress={onForward} />
      </View>
      {Platform.OS === 'web' ? (
        <iframe
          title="Melding"
          sandbox=""
          srcDoc={`<base target="_blank" /><style>body{font-family:Segoe UI,sans-serif;font-size:14px;color:#1a2744;margin:0}</style>${sanitizeHtml(open.html || '')}`}
          style={{ width: '100%', minHeight: 320, border: 0, flex: 1 }}
        />
      ) : (
        <Text style={styles.readPlain}>{open.preview}</Text>
      )}
    </ScrollView>
  );
}

export default function MailHubScreen() {
  const { isDesktop } = useLayout();
  const { uid } = useApp();
  const [accounts, setAccounts] = useState(() => {
    const peeked = peekCalendarConnectionsCache(uid);
    return peeked?.connections || [];
  });
  const [connectionId, setConnectionId] = useState(() => {
    const preferred = readJson(DEFAULT_ACCOUNT_KEY, null);
    const peeked = peekCalendarConnectionsCache(uid);
    const ms = uniqueMicrosoftConnections(
      (peeked?.connections || []).filter((c) => c.type === 'microsoft'),
    );
    if (preferred && ms.some((c) => c.id === preferred)) return preferred;
    return ms.find((c) => c.mailAccess)?.id || ms[0]?.id || null;
  });
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState(() => {
    const saved = readJson(LAST_FOLDER_KEY, null);
    return typeof saved === 'string' ? saved : null;
  });
  const [messages, setMessages] = useState([]);
  const [unreadOnly, setUnreadOnly] = useState(() => readJson(UNREAD_FIRST_KEY, false) === true);
  const [selectedId, setSelectedId] = useState(null);
  const [open, setOpen] = useState(null);
  // Ikke blokker hele UI hvis vi allerede har konti fra cache
  const [loading, setLoading] = useState(() => {
    const peeked = peekCalendarConnectionsCache(uid);
    return !(peeked?.connections?.length);
  });
  const [listBusy, setListBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [compose, setCompose] = useState(null);
  const [composeBusy, setComposeBusy] = useState(false);
  const [grantBusy, setGrantBusy] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultAccountId, setDefaultAccountId] = useState(() => {
    const saved = readJson(DEFAULT_ACCOUNT_KEY, null);
    return typeof saved === 'string' ? saved : null;
  });
  const [composePrefs, setComposePrefs] = useState(() => loadMailComposePrefs());
  const [hasMore, setHasMore] = useState(false);
  const [nextSkip, setNextSkip] = useState(0);
  const [moreBusy, setMoreBusy] = useState(false);
  const [folderW, setFolderW] = useState(MAIL_FOLDER_PANE_DEFAULT);
  const [listW, setListW] = useState(MAIL_LIST_PANE_DEFAULT);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const folderWRef = useRef(MAIL_FOLDER_PANE_DEFAULT);
  const listWRef = useRef(MAIL_LIST_PANE_DEFAULT);
  const folderOriginRef = useRef(MAIL_FOLDER_PANE_DEFAULT);
  const listOriginRef = useRef(MAIL_LIST_PANE_DEFAULT);
  const prevConnRef = useRef(null);
  const bootGenRef = useRef(0);
  const lastAccountFetchRef = useRef(0);
  const nextSkipRef = useRef(0);
  folderWRef.current = folderW;
  listWRef.current = listW;

  const mailAccounts = useMemo(
    () => uniqueMicrosoftConnections((accounts || []).filter((c) => c.type === 'microsoft')),
    [accounts],
  );
  const active = mailAccounts.find((c) => c.id === connectionId) || mailAccounts.find((c) => c.mailAccess) || mailAccounts[0] || null;

  useEffect(() => {
    const saved = readJson(PANE_KEY, null);
    if (saved?.folder) {
      setFolderW(clampMailPaneWidth(saved.folder, MAIL_FOLDER_PANE_MIN, MAIL_FOLDER_PANE_MAX));
    }
    if (saved?.list) {
      setListW(clampMailPaneWidth(saved.list, MAIL_LIST_PANE_MIN, MAIL_LIST_PANE_MAX));
    }
  }, []);

  useEffect(() => {
    const id = active?.id;
    if (prevConnRef.current && prevConnRef.current !== id) {
      setFolderId(null);
      setFolders([]);
      setMessages([]);
      setSelectedId(null);
      setOpen(null);
      setError('');
      setHasMore(false);
      setNextSkip(0);
    }
    prevConnRef.current = id || null;
    if (!id) return;
    const saved = readJson(`${EXPAND_KEY}.${id}`, []);
    setExpandedIds(new Set(Array.isArray(saved) ? saved : []));
  }, [active?.id]);

  const reloadAccounts = useCallback(async () => {
    try {
      const list = await listCalendarConnections();
      const microsoft = (list || []).filter((c) => c.type === 'microsoft');
      const extras = duplicateMicrosoftConnectionIds(microsoft);
      const keptMs = uniqueMicrosoftConnections(microsoft);
      setAccounts([
        ...(list || []).filter((c) => c.type !== 'microsoft'),
        ...keptMs,
      ]);
      if (extras.length) {
        extras.forEach((id) => {
          removeCalendarConnection(id).catch(() => {});
        });
      }
      const preferred = readJson(DEFAULT_ACCOUNT_KEY, null);
      setConnectionId((cur) => {
        if (cur && keptMs.some((c) => c.id === cur)) return cur;
        if (preferred && keptMs.some((c) => c.id === preferred)) return preferred;
        const withMail = keptMs.find((c) => c.mailAccess);
        return withMail?.id || keptMs[0]?.id || null;
      });
      lastAccountFetchRef.current = Date.now();
    } catch (e) {
      setError(e?.message || 'Klarte ikke hente kontoer');
    }
  }, []);

  useEffect(() => { reloadAccounts().finally(() => setLoading(false)); }, [reloadAccounts]);

  // Synk-hydrat folders/messages fra minne når aktiv konto er klar
  useEffect(() => {
    if (!uid || !active?.id || !active.mailAccess) return;
    const folderPeek = peekMailFoldersCache(uid, active.id, { maxAgeMs: MAIL_STORAGE_MS });
    if (folderPeek?.folders?.length) {
      setFolders(folderPeek.folders);
      setFolderId((cur) => {
        if (cur && folderPeek.folders.some((f) => f.id === cur)) return cur;
        const last = readJson(LAST_FOLDER_KEY, null);
        if (last && folderPeek.folders.some((f) => f.id === last)) return last;
        const inbox = folderPeek.folders.find((f) => (
          f.wellKnownName === 'inbox' || /^innboks$|^inbox$/i.test(f.name || '')
        ));
        return inbox?.id || folderPeek.folders[0]?.id || cur;
      });
    }
  }, [uid, active?.id, active?.mailAccess]);

  useEffect(() => {
    if (!uid || !active?.id || !folderId) return;
    const msgPeek = peekMailMessagesCache(uid, active.id, folderId, unreadOnly, {
      maxAgeMs: MAIL_STORAGE_MS,
    });
    if (msgPeek?.messages) setMessages(msgPeek.messages);
  }, [uid, active?.id, folderId, unreadOnly]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onFocus = () => {
      if (Date.now() - lastAccountFetchRef.current < 120000) return;
      reloadAccounts();
    };
    const onMsg = (e) => {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === OAUTH_COMPLETE_MESSAGE) reloadAccounts();
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('message', onMsg);
    };
  }, [reloadAccounts]);

  const applyFolderList = useCallback((id, list, { persist = true } = {}) => {
    const foldersList = list || [];
    setFolders(foldersList);
    if (persist) putMailFoldersCache(uid, id, foldersList);
    setFolderId((cur) => {
      if (cur && cur !== 'inbox' && foldersList.some((f) => f.id === cur)) return cur;
      const last = readJson(LAST_FOLDER_KEY, null);
      if (last && foldersList.some((f) => f.id === last)) return last;
      return pickInboxFolderId(foldersList, cur || 'inbox');
    });
  }, [uid]);

  const applyMessagePage = useCallback((id, fid, unread, page, { append = false, merge = false } = {}) => {
    const incoming = page?.messages || [];
    setMessages((prev) => {
      const next = mergeMailMessages(prev, incoming, { append, merge });
      putMailMessagesCache(uid, id, fid, unread, next);
      return next;
    });
    const skip = Number(page?.nextSkip || incoming.length) || incoming.length;
    nextSkipRef.current = skip;
    setNextSkip(skip);
    setHasMore(page?.hasMore === true);
    if (page?.folderId && page.folderId !== fid) setFolderId(page.folderId);
  }, [uid]);

  const loadFolders = useCallback(async (id, { force = false } = {}) => {
    if (!id) return;
    const acc = mailAccounts.find((c) => c.id === id);
    if (!acc?.mailAccess) {
      setFolders([]);
      return;
    }
    const cached = peekMailFoldersCache(uid, id, { maxAgeMs: MAIL_STORAGE_MS })
      || await loadMailFoldersCache(uid, id);
    if (cached?.folders?.length) applyFolderList(id, cached.folders, { persist: false });
    if (!force && isMailCacheFresh(cached, MAIL_FOLDER_FRESH_MS)) return;
    const res = await listMailFolders(id);
    if (!res?.ok) {
      setError(friendlyMailError({ message: res?.error, code: res?.code }, 'Klarte ikke hente mapper'));
      setFolderId((cur) => cur || 'inbox');
      return;
    }
    applyFolderList(id, res.folders || []);
  }, [mailAccounts, uid, applyFolderList]);

  const loadMessages = useCallback(async (id, fid, unread, { force = false, append = false } = {}) => {
    if (!id || !fid) {
      if (!append) setMessages([]);
      return;
    }
    const cached = peekMailMessagesCache(uid, id, fid, unread, { maxAgeMs: MAIL_STORAGE_MS })
      || await loadMailMessagesCache(uid, id, fid, unread);
    if (!append && cached?.messages) setMessages(cached.messages);
    if (!append && !force && isMailCacheFresh(cached)) {
      setHasMore((cached.messages || []).length >= MAIL_LIST_PAGE);
      setNextSkip((cached.messages || []).length);
      return;
    }
    if (!append && !cached?.messages?.length) setListBusy(true);
    const since = !append && !force && cached?.messages?.length
      ? newestMailReceivedAt(cached.messages)
      : '';
    try {
      const res = await listMailMessages(id, {
        folderId: fid,
        unreadOnly: unread,
        skip: append ? nextSkipRef.current : 0,
        top: MAIL_LIST_PAGE,
        since: since || undefined,
      });
      if (!res?.ok) {
        const msg = res?.error || 'Klarte ikke hente e-post';
        if (/targeted mailbox|does not belong|doesn't belong/i.test(msg)) {
          setFolderId('inbox');
          setError('');
          if (!cached?.messages?.length) setMessages([]);
          return;
        }
        if (cached?.messages?.length) return;
        setError(friendlyMailError({ message: msg, code: res?.code }));
        if (!cached?.messages?.length) setMessages([]);
        return;
      }
      applyMessagePage(id, fid, unread, res, { append, merge: !!since || append });
    } finally {
      setListBusy(false);
      setMoreBusy(false);
    }
  }, [uid, applyMessagePage]);

  const bootMailbox = useCallback(async (id, fid, unread, force = false) => {
    const gen = ++bootGenRef.current;
    const folderCached = peekMailFoldersCache(uid, id, { maxAgeMs: MAIL_STORAGE_MS })
      || await loadMailFoldersCache(uid, id);
    const resolvedFolder = fid
      || (folderCached?.folders ? pickInboxFolderId(folderCached.folders) : 'inbox');
    const msgCached = resolvedFolder
      ? (peekMailMessagesCache(uid, id, resolvedFolder, unread, { maxAgeMs: MAIL_STORAGE_MS })
        || await loadMailMessagesCache(uid, id, resolvedFolder, unread))
      : null;
    if (gen !== bootGenRef.current) return;
    if (folderCached?.folders?.length) applyFolderList(id, folderCached.folders, { persist: false });
    if (msgCached?.messages) {
      setMessages(msgCached.messages);
      nextSkipRef.current = msgCached.messages.length;
      setNextSkip(msgCached.messages.length);
      setHasMore(msgCached.messages.length >= MAIL_LIST_PAGE);
    }
    const foldersFresh = !force && isMailCacheFresh(folderCached, MAIL_FOLDER_FRESH_MS);
    const messagesFresh = !force && isMailCacheFresh(msgCached);
    const plan = mailRefreshPlan({
      foldersFresh,
      messagesFresh,
      hasMessages: !!(msgCached?.messages?.length),
      force,
    });
    if (plan === 'none') return;
    // Empty mailbox cache: one combined Graph sync. With cached mail, only
    // fetch new messages (since) so we don't re-download the whole inbox.
    if (plan === 'full' && !msgCached?.messages?.length && resolvedFolder) {
      if (!msgCached?.messages?.length) setListBusy(true);
      try {
        const res = await syncOutlookMailbox(id, {
          folderId: resolvedFolder,
          unreadOnly: unread,
          top: MAIL_LIST_PAGE,
        });
        if (gen !== bootGenRef.current) return;
        if (res?.ok) {
          applyFolderList(id, res.folders || []);
          const realFolder = pickInboxFolderId(res.folders, res.folderId || resolvedFolder);
          applyMessagePage(id, realFolder, unread, res);
          return;
        }
      } finally {
        if (gen === bootGenRef.current) setListBusy(false);
      }
    }
    if (!foldersFresh) await loadFolders(id, { force });
    if (!messagesFresh && resolvedFolder) await loadMessages(id, resolvedFolder, unread, { force });
  }, [uid, applyFolderList, applyMessagePage, loadFolders, loadMessages]);

  useEffect(() => {
    if (!active?.id || !active.mailAccess) return undefined;
    bootMailbox(active.id, folderId, unreadOnly, false)
      .catch((e) => setError(friendlyMailError(e, 'E-post feilet')));
    return undefined;
  }, [active?.id, active?.mailAccess, folderId, unreadOnly, bootMailbox]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => (
      `${m.subject} ${m.from?.name || ''} ${m.from?.address || ''} ${m.preview}`.toLowerCase().includes(q)
    ));
  }, [messages, query]);

  const grouped = useMemo(() => {
    const out = [];
    let last = '';
    filtered.forEach((m) => {
      const label = mailSectionLabel(m.receivedAt);
      if (label !== last) {
        out.push({ type: 'head', id: `h-${label}-${m.id}`, label });
        last = label;
      }
      out.push({ type: 'msg', ...m });
    });
    return out;
  }, [filtered]);

  const folderTree = useMemo(() => nestMailFolders(folders), [folders]);
  const favoriteRows = useMemo(() => favoriteMailFolders(folderTree), [folderTree]);
  const folderRows = useMemo(
    () => visibleMailFolderRows(folderTree, expandedIds),
    [folderTree, expandedIds],
  );

  useEffect(() => {
    if (!folderId || !folderTree.length) return;
    const extra = expandAncestorIds(folderTree, folderId);
    if (!extra.size) return;
    setExpandedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      extra.forEach((id) => {
        if (!next.has(id)) {
          next.add(id);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [folderId, folderTree]);

  const persistExpanded = (next) => {
    setExpandedIds(next);
    if (active?.id) writeJson(`${EXPAND_KEY}.${active.id}`, [...next]);
  };

  const toggleFolder = (id) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    persistExpanded(next);
  };

  const persistPanes = (folder, list) => {
    writeJson(PANE_KEY, { folder, list });
  };

  const currentFolderName = useMemo(() => {
    const hit = folders.find((f) => f.id === folderId);
    if (hit?.name) return hit.name;
    if (folderId === 'inbox') return 'Innboks';
    return 'E-post';
  }, [folders, folderId]);

  const switchAccount = (acc) => {
    if (acc.id !== connectionId) {
      setConnectionId(acc.id);
    }
    if (!acc.mailAccess) grantMail(acc.id);
  };

  const openMessage = async (id) => {
    if (!active?.id || !id) return;
    setSelectedId(id);
    const cached = peekMailMessageCache(uid, active.id, id)
      || await loadMailMessageCache(uid, active.id, id);
    const summary = messages.find((m) => m.id === id);
    if (cached?.message?.html) {
      setOpen(cached.message);
    } else if (summary) {
      setOpen({
        ...summary,
        html: `<p>${escapeHtml(summary.preview || '')}</p>`,
        partial: true,
      });
    } else {
      setOpen(null);
    }
    if (cached?.message?.html) {
      setOpen(cached.message);
      setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)));
      if (!cached.stale) {
        getMailMessage(active.id, id).then((res) => {
          if (res?.ok) {
            setOpen((cur) => (cur?.id === id ? res.message : cur));
            putMailMessageCache(uid, active.id, id, res.message);
          }
        }).catch(() => {});
        return;
      }
    }
    const res = await getMailMessage(active.id, id);
    if (!res?.ok) {
      setError(friendlyMailError({ message: res?.error, code: res?.code }, 'Klarte ikke åpne meldingen'));
      return;
    }
    setOpen(res.message);
    putMailMessageCache(uid, active.id, id, res.message);
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isRead: true } : m)));
  };

  const prefetchMessage = (id) => {
    if (!active?.id || !id || Platform.OS !== 'web') return;
    if (peekMailMessageCache(uid, active.id, id)) return;
    getMailMessage(active.id, id).then((res) => {
      if (res?.ok) putMailMessageCache(uid, active.id, id, res.message);
    }).catch(() => {});
  };

  const persistDefaultAccount = (id) => {
    setDefaultAccountId(id || null);
    writeJson(DEFAULT_ACCOUNT_KEY, id || null);
    if (id) setConnectionId(id);
  };

  const persistUnreadFirst = (value) => {
    setUnreadOnly(!!value);
    writeJson(UNREAD_FIRST_KEY, !!value);
  };

  const persistComposePrefs = (patch) => {
    setComposePrefs(patchMailComposePrefs(patch));
  };

  const buildSendPayload = (draft) => {
    const html = composeBodyToHtml(draft.body, composePrefs);
    const withSig = draft.includeSignature !== false
      ? appendSignatureHtml(html, composePrefs.signature, { mode: draft.mode, preview: true })
      : html;
    const prepared = prepareHtmlForSend(withSig, composePrefs.signature);
    return {
      to: draft.to,
      cc: draft.cc,
      bcc: draft.bcc,
      subject: draft.subject,
      body: prepared.html,
      html: true,
      importance: draft.importance || 'normal',
      readReceipt: !!draft.readReceipt,
      attachments: prepared.attachments,
    };
  };

  const runCompose = async () => {
    if (!active?.id || !compose) return;
    setComposeBusy(true);
    try {
      const payload = buildSendPayload(compose);
      let res;
      if (compose.mode === 'reply' || compose.mode === 'replyAll') {
        res = await replyOutlookMail(active.id, compose.messageId, {
          ...payload,
          replyAll: compose.mode === 'replyAll',
        });
      } else if (compose.mode === 'forward') {
        res = await forwardOutlookMail(active.id, compose.messageId, payload);
      } else {
        res = await sendOutlookMail(active.id, payload);
      }
      if (!res?.ok) {
        setCompose((c) => ({ ...c, error: res?.error || 'Sending feilet' }));
        return;
      }
      setCompose(null);
      if (folderId) loadMessages(active.id, folderId, unreadOnly, { force: true });
    } finally {
      setComposeBusy(false);
    }
  };

  const removeAccount = async (id) => {
    if (!id) return;
    try {
      await removeCalendarConnection(id);
      if (defaultAccountId === id) persistDefaultAccount(null);
      await reloadAccounts();
    } catch (e) {
      setError(e?.message || 'Klarte ikke fjerne kontoen');
    }
  };

  const grantMail = async (id) => {
    try {
      setGrantBusy(true);
      setError('');
      const cfg = await getCalendarOAuthConfig();
      const acc = mailAccounts.find((c) => c.id === id);
      await connectMicrosoftMail({
        clientId: cfg?.microsoft?.clientId,
        connectionId: id,
        loginHint: acc?.email,
      });
    } catch (e) {
      if (e?.message === 'cancelled') return;
      setError(e?.message || 'Klarte ikke be om e-posttilgang');
    } finally {
      setGrantBusy(false);
    }
  };

  const onDelete = async () => {
    if (!active?.id || !selectedId) return;
    const res = await deleteOutlookMail(active.id, selectedId);
    if (!res?.ok) {
      setError(res?.error || 'Klarte ikke slette');
      return;
    }
    setMessages((prev) => prev.filter((m) => m.id !== selectedId));
    setSelectedId(null);
    setOpen(null);
  };

  const emptyDraft = (mode) => ({
    mode,
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '<div><br></div>',
    importance: 'normal',
    readReceipt: !!composePrefs.readReceipt,
    includeSignature: shouldIncludeSignature(composePrefs.signature, mode),
    openedAt: Date.now(),
    error: '',
  });

  const startReply = (replyAll) => {
    if (!open) return;
    const mode = replyAll ? 'replyAll' : 'reply';
    const to = replyAll
      ? [open.from?.address, ...((open.to || []).map((r) => r.address))].filter(Boolean).join('; ')
      : (open.from?.address || '');
    setCompose({
      ...emptyDraft(mode),
      title: replyAll ? 'Svar til alle' : 'Svar',
      messageId: open.id,
      to,
      subject: open.subject?.startsWith('Re:') ? open.subject : `Re: ${open.subject}`,
    });
  };

  const startCompose = () => setCompose({
    ...emptyDraft('new'),
    title: 'Ny e-post',
  });

  const shellMailAdd = useMemo(() => {
    if (compose || loading) return null;
    return <ShellAddButton label="Ny e-post" onPress={startCompose} />;
  }, [compose, loading, composePrefs]);
  useShellTitleRight(shellMailAdd);

  const pickFolder = (id) => {
    setFolderId(id);
    writeJson(LAST_FOLDER_KEY, id || null);
    setFolderOpen(false);
    if (!isDesktop) {
      setOpen(null);
      setSelectedId(null);
    }
  };

  const folderNav = (
    <FolderList
      favoriteRows={favoriteRows}
      folderRows={folderRows}
      folderId={folderId}
      mailAccounts={mailAccounts}
      active={active}
      grantBusy={grantBusy}
      onSelect={pickFolder}
      onToggle={toggleFolder}
      onSwitchAccount={switchAccount}
      onGrant={grantMail}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  );

  // Kun full-skjerm spinner ved kald start uten cache
  if (loading && !accounts.length && !messages.length) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
          <Text style={styles.muted}>Laster e-post…</Text>
        </View>
      </Screen>
    );
  }

  const emptyListText = active && !active.mailAccess
    ? 'Gi e-posttilgang for å lese innboksen.'
    : 'Ingen meldinger i denne mappen.';
  const listLoading = listBusy && messages.length === 0;

  const forwardOpen = () => {
    if (!open) return;
    setCompose({
      ...emptyDraft('forward'),
      title: 'Videresend',
      messageId: open.id,
      subject: `Vs: ${open.subject || ''}`,
    });
  };

  const refreshMailbox = () => {
    if (active?.id) bootMailbox(active.id, folderId, unreadOnly, true);
  };

  const loadMore = () => {
    if (!active?.id || !folderId || moreBusy || !hasMore) return;
    setMoreBusy(true);
    loadMessages(active.id, folderId, unreadOnly, { append: true, force: true });
  };

  const moreRow = hasMore && !listLoading ? (
    <TouchableOpacity style={styles.moreBtn} onPress={loadMore} disabled={moreBusy}>
      <Text style={styles.moreTxt}>{moreBusy ? 'Laster flere…' : 'Last flere meldinger'}</Text>
    </TouchableOpacity>
  ) : null;

  const composeOverlay = compose ? (
    <MailComposeBox
      compose={compose}
      prefs={composePrefs}
      busy={composeBusy}
      onChange={(patch) => setCompose((c) => ({ ...c, ...patch }))}
      onSend={runCompose}
      onClose={() => setCompose(null)}
      onOpenSettings={() => setSettingsOpen(true)}
    />
  ) : null;

  const settingsModal = (
    <MailSettingsModal
      visible={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      accounts={mailAccounts}
      defaultId={defaultAccountId || active?.id}
      unreadFirst={unreadOnly}
      grantBusy={grantBusy}
      onDefaultChange={persistDefaultAccount}
      onUnreadFirstChange={persistUnreadFirst}
      onConnect={() => grantMail(undefined)}
      onGrant={grantMail}
      onRemove={removeAccount}
      composePrefs={composePrefs}
      onComposePrefsChange={persistComposePrefs}
    />
  );

  if (!isDesktop) {
    return (
      <Screen>
        <View style={styles.shell}>
          {open ? (
            <View style={styles.mobileRead}>
              <View style={styles.mobileBar}>
                <TouchableOpacity
                  style={styles.mobileBarBtn}
                  onPress={() => { setOpen(null); setSelectedId(null); }}
                  accessibilityLabel="Tilbake til listen"
                >
                  <Ionicons name="chevron-back" size={22} color={colors.brand} />
                  <Text style={styles.mobileBackTxt} numberOfLines={1}>{currentFolderName}</Text>
                </TouchableOpacity>
                <View style={styles.mobileBarActions}>
                  <TouchableOpacity style={styles.iconHit} onPress={() => startReply(false)} accessibilityLabel="Svar">
                    <Ionicons name="arrow-undo-outline" size={20} color={colors.ink} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconHit} onPress={onDelete} accessibilityLabel="Slett">
                    <Ionicons name="trash-outline" size={20} color={colors.ink} />
                  </TouchableOpacity>
                </View>
              </View>
              {error ? (
                <TouchableOpacity style={styles.banner} onPress={() => setError('')}>
                  <Text style={styles.bannerTxt}>{error}</Text>
                </TouchableOpacity>
              ) : null}
              <ReadingBody
                open={open}
                onReply={() => startReply(false)}
                onReplyAll={() => startReply(true)}
                onForward={forwardOpen}
              />
            </View>
          ) : (
            <View style={styles.mobileList}>
              <View style={styles.mobileBar}>
                <TouchableOpacity
                  style={styles.mobileBarBtn}
                  onPress={() => setFolderOpen(true)}
                  accessibilityLabel="Velg mappe"
                >
                  <Ionicons name="folder-outline" size={20} color={colors.ink} />
                  <Text style={styles.mobileTitle} numberOfLines={1}>{currentFolderName}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.muted} />
                </TouchableOpacity>
                <View style={styles.mobileBarActions}>
                  <TouchableOpacity
                    style={styles.iconHit}
                    onPress={() => {
                      if (active?.id && folderId) refreshMailbox();
                    }}
                    accessibilityLabel="Oppdater"
                  >
                    <Ionicons name="refresh" size={20} color={colors.ink} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconHit}
                    onPress={() => setSettingsOpen(true)}
                    accessibilityLabel="Innstillinger"
                  >
                    <Ionicons name="settings-outline" size={20} color={colors.ink} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconHit}
                    onPress={() => setSearchOpen((v) => !v)}
                    accessibilityLabel="Søk"
                  >
                    <Ionicons name="search" size={20} color={colors.ink} />
                  </TouchableOpacity>
                </View>
              </View>
              {searchOpen ? (
                <View style={styles.mobileSearch}>
                  <Ionicons name="search" size={14} color={colors.muted} />
                  <TextInput
                    style={styles.search}
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Søk"
                    placeholderTextColor={colors.muted}
                    autoFocus
                  />
                </View>
              ) : null}
              <View style={styles.listTabs}>
                <TouchableOpacity onPress={() => setUnreadOnly(false)} style={[styles.pill, !unreadOnly && styles.pillOn]}>
                  <Text style={[styles.pillTxt, !unreadOnly && styles.pillTxtOn]}>Alle</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setUnreadOnly(true)} style={[styles.pill, unreadOnly && styles.pillOn]}>
                  <Text style={[styles.pillTxt, unreadOnly && styles.pillTxtOn]}>Ulest</Text>
                </TouchableOpacity>
                {listBusy ? <ActivityIndicator size="small" color={colors.brand} /> : null}
              </View>
              {error ? (
                <TouchableOpacity style={styles.banner} onPress={() => setError('')}>
                  <Text style={styles.bannerTxt}>{error}</Text>
                </TouchableOpacity>
              ) : null}
              <HelpTarget id="content" style={{ flex: 1, minHeight: 0, width: '100%' }}>
              <ScrollView style={styles.paneScroll} contentContainerStyle={styles.mobileListPad}>
                <MessageRows
                  grouped={grouped}
                  selectedId={selectedId}
                  onOpen={openMessage}
                  onPrefetch={prefetchMessage}
                  compact
                  emptyText={emptyListText}
                  loading={listLoading}
                />
                {moreRow}
              </ScrollView>
              </HelpTarget>
            </View>
          )}
        </View>
        <MailFolderDrawer
          visible={folderOpen}
          onClose={() => setFolderOpen(false)}
          currentName={currentFolderName}
        >
          {folderNav}
        </MailFolderDrawer>
        {composeOverlay}
        {settingsModal}
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.shell}>
        <View style={styles.toolbar}>
          <DeskBtn icon="arrow-undo-outline" label="Svar" onPress={() => startReply(false)} />
          <DeskBtn icon="arrow-undo" label="Svar alle" onPress={() => startReply(true)} />
          <DeskBtn icon="arrow-redo-outline" label="Videresend" onPress={forwardOpen} />
          <DeskBtn icon="trash-outline" label="Slett" onPress={onDelete} />
          <DeskBtn icon="refresh" label="Oppdater" onPress={refreshMailbox} />
          <DeskBtn icon="settings-outline" label="Innstillinger" onPress={() => setSettingsOpen(true)} />
          <View style={{ flex: 1 }} />
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={14} color={colors.muted} />
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              placeholder="Søk"
              placeholderTextColor={colors.muted}
            />
          </View>
        </View>

        {error ? (
          <TouchableOpacity style={styles.banner} onPress={() => setError('')}>
            <Text style={styles.bannerTxt}>{error}</Text>
          </TouchableOpacity>
        ) : null}

        <View style={styles.panes}>
          <View style={[styles.folderPane, { width: folderW }]}>
            <ScrollView style={styles.paneScroll} contentContainerStyle={styles.folderScrollInner}>
              {folderNav}
            </ScrollView>
            <MailPaneResizeHandle
              label="Endre bredde på mapper"
              onGrant={() => { folderOriginRef.current = folderWRef.current; }}
              onMove={(dx) => {
                const next = applyMailPaneDrag(
                  folderOriginRef.current,
                  dx,
                  MAIL_FOLDER_PANE_MIN,
                  MAIL_FOLDER_PANE_MAX,
                );
                folderWRef.current = next;
                setFolderW(next);
              }}
              onEnd={() => persistPanes(folderWRef.current, listWRef.current)}
            />
          </View>

          <View style={[styles.listPane, { width: listW }]}>
            <View style={styles.listTabs}>
              <TouchableOpacity onPress={() => setUnreadOnly(false)} style={[styles.tab, !unreadOnly && styles.tabOn]}>
                <Text style={[styles.tabTxt, !unreadOnly && styles.tabTxtOn]}>Alle</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setUnreadOnly(true)} style={[styles.tab, unreadOnly && styles.tabOn]}>
                <Text style={[styles.tabTxt, unreadOnly && styles.tabTxtOn]}>Ulest</Text>
              </TouchableOpacity>
              {listBusy ? <ActivityIndicator size="small" color={colors.brand} /> : null}
            </View>
            <HelpTarget id="content" style={{ flex: 1, minHeight: 0, width: '100%' }}>
            <ScrollView style={styles.paneScroll}>
              <MessageRows
                grouped={grouped}
                selectedId={selectedId}
                onOpen={openMessage}
                onPrefetch={prefetchMessage}
                compact={!!composePrefs.compactList}
                emptyText={emptyListText}
                loading={listLoading}
              />
              {moreRow}
            </ScrollView>
            </HelpTarget>
            <MailPaneResizeHandle
              label="Endre bredde på meldingsliste"
              onGrant={() => { listOriginRef.current = listWRef.current; }}
              onMove={(dx) => {
                const next = applyMailPaneDrag(
                  listOriginRef.current,
                  dx,
                  MAIL_LIST_PANE_MIN,
                  MAIL_LIST_PANE_MAX,
                );
                listWRef.current = next;
                setListW(next);
              }}
              onEnd={() => persistPanes(folderWRef.current, listWRef.current)}
            />
          </View>

          <View style={styles.readPane}>
            {!open ? (
              <View style={styles.center}>
                <Ionicons name="mail-open-outline" size={36} color={colors.line} />
                <Text style={styles.muted}>Velg en melding</Text>
              </View>
            ) : (
              <ReadingBody
                open={open}
                onReply={() => startReply(false)}
                onReplyAll={() => startReply(true)}
                onForward={forwardOpen}
              />
            )}
          </View>
        </View>
      </View>

      {composeOverlay}
      {settingsModal}
    </Screen>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, minHeight: 0, backgroundColor: colors.card },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  listLoading: {
    paddingVertical: 28, alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  muted: { color: colors.muted, fontSize: 13, fontWeight: '400' },
  toolbar: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 8, height: 32, minWidth: 180, backgroundColor: colors.card,
  },
  search: { flex: 1, fontSize: 13, color: colors.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null) },
  banner: { backgroundColor: '#fff7ed', padding: 8, marginHorizontal: 10, marginTop: 8 },
  bannerTxt: { color: '#9a3412', fontWeight: '400', fontSize: 12 },
  panes: { flex: 1, flexDirection: 'row', minHeight: 0, position: 'relative', alignItems: 'stretch' },
  panesStack: { flexDirection: 'column' },
  paneScroll: { flex: 1, minHeight: 0 },
  folderScrollInner: { paddingVertical: 8 },
  mobileList: { flex: 1, minHeight: 0, position: 'relative' },
  mobileRead: { flex: 1, minHeight: 0 },
  mobileListPad: { paddingBottom: 88 },
  mobileBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 8, gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  mobileBarBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  mobileTitle: { fontSize: 20, fontWeight: '400', color: colors.ink, flexShrink: 1 },
  mobileBackTxt: { fontSize: 16, fontWeight: '400', color: colors.brand, flexShrink: 1 },
  mobileBarActions: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  iconHit: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  mobileSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 10, marginBottom: 6,
    borderWidth: 1, borderColor: colors.line, paddingHorizontal: 8, height: 36, backgroundColor: colors.card,
  },
  pill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, backgroundColor: colors.bg },
  pillOn: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  pillTxt: { fontWeight: '400', color: colors.muted, fontSize: 13 },
  pillTxtOn: { color: colors.ink },
  drawerRoot: { flex: 1, flexDirection: 'row' },
  drawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.4)' },
  drawerPanel: {
    width: '82%', maxWidth: 320, height: '100%', backgroundColor: colors.card,
    zIndex: 2, paddingTop: 8,
  },
  drawerHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  drawerTitle: { fontSize: 18, fontWeight: '400', color: colors.ink, flex: 1 },
  drawerClose: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg,
  },
  folderPane: {
    width: MAIL_FOLDER_PANE_DEFAULT,
    flexShrink: 0,
    position: 'relative',
    overflow: 'visible',
    zIndex: 3,
    minHeight: 0,
  },
  folderPaneMobile: {
    width: '100%',
    maxHeight: 220,
    overflow: 'hidden',
    borderRightWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  paneKicker: {
    fontSize: 11, fontWeight: '400', color: colors.muted, letterSpacing: 0.4,
    paddingHorizontal: 12, marginTop: 8, marginBottom: 4, textTransform: 'uppercase',
  },
  accountBlock: { marginBottom: 4 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  accountOn: { backgroundColor: colors.brandSoft },
  accountLbl: { flex: 1, fontSize: 12, fontWeight: '400', color: colors.ink },
  grantBtn: {
    alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6 },
  grantTxt: { color: colors.brand, fontWeight: '400', fontSize: 12 },
  folderRow: { flexDirection: 'row', alignItems: 'center', paddingRight: 8, minHeight: 26 },
  folderOn: { backgroundColor: '#e8f1fc' },
  folderChev: { width: 18, height: 24, alignItems: 'center', justifyContent: 'center' },
  folderBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, paddingVertical: 4 },
  folderName: { flex: 1, fontSize: 13, color: colors.ink },
  folderNameOn: { fontWeight: '400', color: colors.brand },
  unread: { fontSize: 11, fontWeight: '400', color: colors.brand },
  listPane: {
    width: MAIL_LIST_PANE_DEFAULT,
    flexShrink: 0,
    minWidth: 0,
    minHeight: 0,
    position: 'relative',
    overflow: 'visible',
    zIndex: 2,
  },
  listTabs: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  tab: { paddingVertical: 4, paddingHorizontal: 8 },
  tabOn: { borderBottomWidth: 2, borderBottomColor: colors.brand },
  tabTxt: { fontWeight: '400', color: colors.muted, fontSize: 13 },
  tabTxtOn: { color: colors.brand },
  section: { fontSize: 11, fontWeight: '400', color: colors.muted, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4 },
  msgRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingRight: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  msgRowCompact: { paddingVertical: 10 },
  msgOn: { backgroundColor: '#f8fbff' },
  msgUnread: { backgroundColor: '#fcfdff' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginLeft: 6 },
  readDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: 'transparent', marginLeft: 6 },
  avatar: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: '#dbeafe',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  avatarTxt: { fontSize: 12, fontWeight: '400', color: colors.brand },
  msgTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  msgFrom: { flex: 1, fontSize: 13, color: colors.ink },
  msgBold: { fontWeight: '400' },
  msgWhen: { fontSize: 11, color: colors.muted, fontWeight: '400' },
  msgSub: { fontSize: 13, color: colors.brand, fontWeight: '400', marginTop: 1 },
  msgPrev: { fontSize: 12, color: colors.muted, marginTop: 2 },
  readPane: { flex: 1, minWidth: 0, minHeight: 0, zIndex: 1, overflow: 'hidden' },
  readSubject: { fontSize: 20, fontWeight: '400', color: colors.ink, marginBottom: 8 },
  readFrom: { fontSize: 14, fontWeight: '400', color: colors.ink },
  readMeta: { fontSize: 12, color: colors.muted, marginTop: 4 },
  readActions: { flexDirection: 'row', gap: 6, marginVertical: 12, flexWrap: 'wrap' },
  readPlain: { fontSize: 14, color: colors.ink, lineHeight: 20 },
  moreBtn: {
    alignSelf: 'flex-start', paddingVertical: 12, alignItems: 'center' },
  moreTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },
});
