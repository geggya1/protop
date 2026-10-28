import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  View, Text, TouchableOpacity, Pressable, StyleSheet, ScrollView, TextInput,
  Platform, ActivityIndicator, Modal, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, useLayout } from '../../src/theme';
import { Screen } from '../../components/ui';
import { useApp } from '../../src/context/AppContext';
import ShellAddButton from '../../components/ShellAddButton';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { MailPaneResizeHandle } from '../../components/MailPaneResizeHandle';
import MailSettingsModal from '../../components/MailSettingsModal';
import MailComposeBox from '../../components/MailComposeBox';
import HelpTarget from '../../components/HelpTarget';
import ConfirmDialog from '../../components/ConfirmDialog';
import MailMessageList from '../../components/mail/MailMessageList';
import MailReadingPane from '../../components/mail/MailReadingPane';
import { MailMenu, MailMenuButton, MailToolButton } from '../../components/mail/MailMenu';
import useDomHover from '../../components/mail/useDomHover';
import {
  listCalendarConnections,
  connectMicrosoftMail,
  getCalendarOAuthConfig,
  removeCalendarConnection,
  OAUTH_COMPLETE_MESSAGE,
  friendlyMicrosoftAuthMessage,
} from '../../src/utils/calendarIntegration';
import { peekCalendarConnectionsCache } from '../../src/utils/calendarConnectionsCache';
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
import {
  nestMailFolders,
  flattenMailFolders,
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
import { uniqueMicrosoftConnections, duplicateMicrosoftConnectionIds } from '../../src/utils/mailUi';
import {
  friendlyMailError,
  MAIL_STORAGE_MS,
  mergeFirstPage,
  mergeMailMessages,
  pickInboxFolderId,
} from '../../src/utils/mailSync';
import { loadMailComposePrefs, patchMailComposePrefs, signatureFor } from '../../src/utils/mailComposePrefs';
import { signatureBlockHtml } from '../../src/utils/mailSignature';
import { composeBodyToHtml } from '../../src/utils/mailHtml';
import {
  FLAG_OPTIONS,
  MAIL_FILTERS,
  applyFlagLocally,
  categoryChoices,
  contactsFromMessages,
  flagPatch,
  folderByWell,
  forwardSubject,
  groupMailRows,
  isValidAddress,
  matchesMailFilter,
  mergeContacts,
  normalizeMailFilter,
  replyRecipients,
  replySubject,
  toggleCategory,
  visibleAttachments,
} from '../../src/utils/mailModel';
import {
  keepMailTokenFresh,
  prefetchMailMessages,
  loadInlineImages,
  updateMailMessages,
  moveMailMessages,
  deleteMailMessagesPermanently,
  loadMasterCategories,
  searchMailMessages,
  downloadMailAttachment,
  saveMailDraft,
  discardMailDraft,
  openMailDraft,
  removeDraftAttachment,
} from '../../src/utils/mailGraph';
import {
  bootMailbox,
  listMessages,
  loadFolders,
  getMessage,
  sendCompose,
  deleteMessages,
  isDirectMail,
} from '../../src/utils/mailBackend';
import { friendlyCallableError } from '../../src/utils/callableErrors';

const PANE_KEY = 'protop.mail.panes';
const EXPAND_KEY = 'protop.mail.expanded';
const FAVORITES_KEY = 'protop.mail.favorites';
const DEFAULT_ACCOUNT_KEY = 'protop.mail.defaultAccount';
const LAST_FOLDER_KEY = 'protop.mail.lastFolder';
const UNREAD_FIRST_KEY = 'protop.mail.unreadFirst';
const FILTER_KEY = 'protop.mail.filter';
const CONTACTS_KEY = 'protop.mail.contacts';

const PAGE = 30;
/** Samme liste hentes ikke på nytt innen dette (cache vises med en gang). */
const FRESH_MS = 20 * 1000;
const POLL_MS = 60 * 1000;
const AUTOSAVE_MS = 15 * 1000;

/** Bilder i åpnede meldinger, så de ikke hentes på nytt ved hvert klikk. */
const IMAGE_CACHE = new Map();

function imageCacheKey(conn, id) {
  return `${conn}|${id}`;
}

function rememberImages(key, value) {
  IMAGE_CACHE.delete(key);
  IMAGE_CACHE.set(key, value);
  while (IMAGE_CACHE.size > 30) IMAGE_CACHE.delete(IMAGE_CACHE.keys().next().value);
}

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

function timeLabel(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isTypingTarget(el) {
  if (!el) return false;
  const tag = String(el.tagName || '').toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || el.isContentEditable;
}

/* ───────── Mapper ───────── */

function FolderRow({
  row, selected, onSelect, onToggle, favorite, onFavorite,
}) {
  const ref = useRef(null);
  const hovered = useDomHover(ref);
  const count = row.wellKnownName === 'drafts' ? row.total : row.unread;
  return (
    <Pressable
      ref={ref}
      style={[
        styles.folderRow,
        hovered && styles.folderHover,
        selected && styles.folderOn,
        { paddingLeft: 6 + row.depth * 14 },
      ]}
      onPress={() => onSelect(row.id)}
      accessibilityState={{ selected }}
      accessibilityLabel={`${row.name}${count ? `, ${count}` : ''}`}
    >
      <>
        <TouchableOpacity
          style={styles.folderChev}
          onPress={() => { if (row.hasKids) onToggle(row.id); }}
          disabled={!row.hasKids}
          accessibilityLabel={row.expanded ? 'Skjul undermapper' : 'Vis undermapper'}
        >
          {row.hasKids ? (
            <Ionicons name={row.expanded ? 'chevron-down' : 'chevron-forward'} size={12} color={colors.muted} />
          ) : <View style={{ width: 12 }} />}
        </TouchableOpacity>
        <Ionicons name={mailFolderIcon(row.wellKnownName)} size={14} color={selected ? colors.brand : colors.muted} />
        <Text style={[styles.folderName, selected && styles.folderNameOn, row.unread > 0 && styles.folderNameUnread]} numberOfLines={1}>
          {row.name}
        </Text>
        {hovered && onFavorite && Platform.OS === 'web' ? (
          <Pressable onPress={() => onFavorite(row.id)} hitSlop={4} accessibilityLabel={favorite ? 'Fjern fra favoritter' : 'Legg til i favoritter'}>
            <Ionicons name={favorite ? 'star' : 'star-outline'} size={13} color={favorite ? colors.star : colors.muted} />
          </Pressable>
        ) : count > 0 ? (
          <Text style={[styles.unread, row.wellKnownName === 'drafts' && styles.unreadMuted]}>
            {row.wellKnownName === 'drafts' || row.wellKnownName === 'junkemail' ? `[${count}]` : count}
          </Text>
        ) : null}
      </>
    </Pressable>
  );
}

function FolderList({
  favoriteRows, folderRows, folderId, mailAccounts, active, favoriteIds,
  grantBusy, onSelect, onToggle, onSwitchAccount, onGrant, onOpenSettings, onFavorite,
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
              favorite
              onFavorite={onFavorite}
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
            <Ionicons name={acc.id === active?.id ? 'chevron-down' : 'chevron-forward'} size={12} color={colors.muted} />
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
                favorite={favoriteIds.includes(row.id)}
                onFavorite={onFavorite}
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

function MailFolderDrawer({ visible, onClose, currentName, children }) {
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

function Toast({ toast, onClose }) {
  if (!toast) return null;
  return (
    <View style={styles.toastWrap} pointerEvents="box-none">
      <View style={[styles.toast, toast.error && styles.toastErr]}>
        {toast.busy ? <ActivityIndicator size="small" color="#fff" /> : null}
        <Text style={styles.toastTxt} numberOfLines={2}>{toast.text}</Text>
        {toast.action ? (
          <Pressable onPress={() => { onClose(); toast.action.run(); }} hitSlop={6}>
            <Text style={styles.toastAction}>{toast.action.label}</Text>
          </Pressable>
        ) : null}
        <Pressable onPress={onClose} hitSlop={6} accessibilityLabel="Lukk melding">
          <Ionicons name="close" size={14} color="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

export default function MailHubScreen() {
  const { isDesktop } = useLayout();
  const win = useWindowDimensions();
  const { uid } = useApp();
  const [accounts, setAccounts] = useState(() => peekCalendarConnectionsCache(uid)?.connections || []);
  const [connectionId, setConnectionId] = useState(() => {
    const preferred = readJson(DEFAULT_ACCOUNT_KEY, null);
    const ms = uniqueMicrosoftConnections(
      (peekCalendarConnectionsCache(uid)?.connections || []).filter((c) => c.type === 'microsoft'),
    );
    if (preferred && ms.some((c) => c.id === preferred)) return preferred;
    return ms.find((c) => c.mailAccess)?.id || ms[0]?.id || null;
  });
  const [folders, setFolders] = useState([]);
  const [folderId, setFolderId] = useState(() => {
    const saved = readJson(LAST_FOLDER_KEY, null);
    return typeof saved === 'string' ? saved : null;
  });
  const [filter, setFilter] = useState(() => {
    const saved = readJson(FILTER_KEY, null);
    if (saved) return normalizeMailFilter(saved);
    return readJson(UNREAD_FIRST_KEY, false) === true ? 'unread' : 'all';
  });
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [syncCount, setSyncCount] = useState(0);
  const [syncedAt, setSyncedAt] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [open, setOpen] = useState(null);
  const [bodyLoading, setBodyLoading] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState(null);
  const [compose, setCompose] = useState(null);
  const [composeBusy, setComposeBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [master, setMaster] = useState([]);
  const [storedContacts, setStoredContacts] = useState(() => readJson(CONTACTS_KEY, []));
  const [loadingAccounts, setLoadingAccounts] = useState(() => !(peekCalendarConnectionsCache(uid)?.connections?.length));
  const [grantBusy, setGrantBusy] = useState(false);
  const [folderOpen, setFolderOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [defaultAccountId, setDefaultAccountId] = useState(() => {
    const saved = readJson(DEFAULT_ACCOUNT_KEY, null);
    return typeof saved === 'string' ? saved : null;
  });
  const [composePrefs, setComposePrefs] = useState(() => loadMailComposePrefs());
  const [folderW, setFolderW] = useState(MAIL_FOLDER_PANE_DEFAULT);
  const [listW, setListW] = useState(MAIL_LIST_PANE_DEFAULT);
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [favoriteIds, setFavoriteIds] = useState(null);
  const [menu, setMenu] = useState(null);
  const [purgeIds, setPurgeIds] = useState(null);
  const [attachmentBusy, setAttachmentBusy] = useState(null);

  const folderWRef = useRef(MAIL_FOLDER_PANE_DEFAULT);
  const listWRef = useRef(MAIL_LIST_PANE_DEFAULT);
  const folderOriginRef = useRef(MAIL_FOLDER_PANE_DEFAULT);
  const listOriginRef = useRef(MAIL_LIST_PANE_DEFAULT);
  const prevConnRef = useRef(null);
  const lastAccountFetchRef = useRef(0);
  const nextSkipRef = useRef(0);
  const keyRef = useRef('');
  const bootedRef = useRef(new Set());
  const bootingRef = useRef(new Set());
  const lastFetchRef = useRef(new Map());
  const messagesRef = useRef([]);
  const foldersRef = useRef([]);
  const openRef = useRef(null);
  const composeRef = useRef(null);
  const savingRef = useRef(Promise.resolve());
  /** Siste lagring per skrivevindu, så send/forkast ser utkastet selv om tilstanden ikke er oppdatert ennå. */
  const savedDraftsRef = useRef(new Map());
  const autosaveRef = useRef(null);
  const toastTimer = useRef(null);
  const hoverTimer = useRef(null);
  const pollTick = useRef(0);
  const loadListRef = useRef(null);
  folderWRef.current = folderW;
  listWRef.current = listW;
  messagesRef.current = messages;
  foldersRef.current = folders;
  openRef.current = open;
  composeRef.current = compose;

  const mailAccounts = useMemo(
    () => uniqueMicrosoftConnections((accounts || []).filter((c) => c.type === 'microsoft')),
    [accounts],
  );
  const active = mailAccounts.find((c) => c.id === connectionId)
    || mailAccounts.find((c) => c.mailAccess) || mailAccounts[0] || null;
  const activeRef = useRef(active);
  activeRef.current = active;
  const folderIdRef = useRef(folderId);
  folderIdRef.current = folderId;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const syncing = syncCount > 0;
  /** Under denne bredden vises sjeldnere knapper bare som ikon, så båndet holder seg på én linje. */
  const ribbonCompact = win.width < 1580;

  /* ───────── Meldinger, feil og tilstand ───────── */

  const showToast = useCallback((text, opts = {}) => {
    clearTimeout(toastTimer.current);
    setToast({ text, ...opts });
    if (!opts.busy) toastTimer.current = setTimeout(() => setToast(null), opts.action ? 8000 : 4500);
  }, []);

  const showError = useCallback((e, fallback = 'E-post feilet') => {
    const text = friendlyMailError(e?.message ? e : { message: String(e || '') }, fallback);
    const consent = e?.needsMailConsent === true || (e?.code === 'token' && e?.status === 401) || e?.status === 403;
    setError({ text, consent });
  }, []);

  useEffect(() => {
    const saved = readJson(PANE_KEY, null);
    if (saved?.folder) setFolderW(clampMailPaneWidth(saved.folder, MAIL_FOLDER_PANE_MIN, MAIL_FOLDER_PANE_MAX));
    if (saved?.list) setListW(clampMailPaneWidth(saved.list, MAIL_LIST_PANE_MIN, MAIL_LIST_PANE_MAX));
    return () => {
      clearTimeout(toastTimer.current);
      clearTimeout(autosaveRef.current);
      clearTimeout(hoverTimer.current);
    };
  }, []);

  useEffect(() => {
    const id = active?.id;
    if (prevConnRef.current && prevConnRef.current !== id) {
      setFolderId(null);
      setFolders([]);
      setMessages([]);
      setSelectedId(null);
      setOpen(null);
      setError(null);
      setHasMore(false);
      setSearch(null);
      nextSkipRef.current = 0;
      foldersRef.current = [];
      messagesRef.current = [];
      folderIdRef.current = null;
      openRef.current = null;
    }
    prevConnRef.current = id || null;
    if (!id) return undefined;
    const saved = readJson(`${EXPAND_KEY}.${id}`, []);
    setExpandedIds(new Set(Array.isArray(saved) ? saved : []));
    const favs = readJson(`${FAVORITES_KEY}.${id}`, null);
    setFavoriteIds(Array.isArray(favs) ? favs : null);
    if (!active?.mailAccess) return undefined;
    const release = keepMailTokenFresh(id);
    if (isDirectMail(id)) {
      loadMasterCategories(id).then((list) => {
        if (list && activeRef.current?.id === id) setMaster(list);
      }).catch(() => {});
    }
    return release;
  }, [active?.id, active?.mailAccess]);

  const reloadAccounts = useCallback(async () => {
    try {
      const list = await listCalendarConnections();
      const microsoft = (list || []).filter((c) => c.type === 'microsoft');
      const extras = duplicateMicrosoftConnectionIds(microsoft);
      const keptMs = uniqueMicrosoftConnections(microsoft);
      setAccounts([...(list || []).filter((c) => c.type !== 'microsoft'), ...keptMs]);
      extras.forEach((id) => { removeCalendarConnection(id).catch(() => {}); });
      const preferred = readJson(DEFAULT_ACCOUNT_KEY, null);
      setConnectionId((cur) => {
        if (cur && keptMs.some((c) => c.id === cur)) return cur;
        if (preferred && keptMs.some((c) => c.id === preferred)) return preferred;
        return keptMs.find((c) => c.mailAccess)?.id || keptMs[0]?.id || null;
      });
      lastAccountFetchRef.current = Date.now();
    } catch (e) {
      setError({ text: friendlyCallableError(e, 'Klarte ikke hente kontoer.') });
    }
  }, []);

  useEffect(() => { reloadAccounts().finally(() => setLoadingAccounts(false)); }, [reloadAccounts]);

  /* ───────── Lasting av mapper og liste ───────── */

  const applyFolders = useCallback((conn, list, { persist = true } = {}) => {
    const next = list || [];
    foldersRef.current = next;
    setFolders(next);
    if (persist) putMailFoldersCache(uid, conn, next);
  }, [uid]);

  const prefetchTop = useCallback((conn, list) => {
    if (!isDirectMail(conn)) return;
    const ids = (list || [])
      .slice(0, 8)
      .map((m) => m.id)
      .filter((id) => !peekMailMessageCache(uid, conn, id))
      .slice(0, 6);
    if (!ids.length) return;
    prefetchMailMessages(conn, ids).then((full) => {
      full.forEach((m) => putMailMessageCache(uid, conn, m.id, m));
    }).catch(() => {});
  }, [uid]);

  const applyPage = useCallback((conn, fid, f, page, { append = false } = {}) => {
    const incoming = page?.messages || [];
    const prev = messagesRef.current;
    const next = append
      ? mergeMailMessages(prev, incoming, { append: true })
      : mergeFirstPage(prev, incoming, { hasMore: page?.hasMore !== false });
    messagesRef.current = next;
    setMessages(next);
    putMailMessagesCache(uid, conn, fid, f, next);
    nextSkipRef.current = append ? Number(page?.nextSkip || next.length) : Math.max(next.length, incoming.length);
    setHasMore(page?.hasMore === true);
    if (!append) prefetchTop(conn, next);
  }, [uid, prefetchTop]);

  const loadList = useCallback(async ({ force = false, silent = false } = {}) => {
    const acc = activeRef.current;
    if (!uid || !acc?.id || !acc.mailAccess) return;
    const conn = acc.id;
    const fid = folderIdRef.current;
    const f = filterRef.current;
    const booted = bootedRef.current.has(conn);
    const key = `${conn}|${fid || ''}|${f}`;
    keyRef.current = key;

    if (!silent) {
      const cachedFolders = peekMailFoldersCache(uid, conn, { maxAgeMs: MAIL_STORAGE_MS })
        || await loadMailFoldersCache(uid, conn);
      if (keyRef.current !== key) return;
      if (cachedFolders?.folders?.length && !foldersRef.current.length) {
        applyFolders(conn, cachedFolders.folders, { persist: false });
      }
      const cfid = fid || (cachedFolders?.folders?.length ? pickInboxFolderId(cachedFolders.folders, null) : null);
      if (cfid) {
        const cached = peekMailMessagesCache(uid, conn, cfid, f, { maxAgeMs: MAIL_STORAGE_MS })
          || await loadMailMessagesCache(uid, conn, cfid, f);
        if (keyRef.current !== key) return;
        const list = cached?.messages || [];
        messagesRef.current = list;
        setMessages(list);
        setHasMore(list.length >= PAGE);
        nextSkipRef.current = list.length;
      } else if (!messagesRef.current.length) {
        setMessages([]);
      }
    }

    if (!force && booted && fid && Date.now() - (lastFetchRef.current.get(key) || 0) < FRESH_MS) return;
    // Første henting for kontoen pågår; den laster riktig liste når den er ferdig.
    if ((!booted || !fid) && bootingRef.current.has(conn)) return;
    if (!silent) setSyncCount((n) => n + 1);
    try {
      if (!booted || !fid) {
        bootingRef.current.add(conn);
        let res;
        try {
          res = await bootMailbox(conn, { folderId: fid || 'inbox', filter: f, top: PAGE });
        } finally {
          bootingRef.current.delete(conn);
        }
        if (activeRef.current?.id !== conn) return;
        bootedRef.current.add(conn);
        applyFolders(conn, res.folders);
        const realFid = res.folderId === 'inbox' ? pickInboxFolderId(res.folders, 'inbox') : res.folderId;
        const realKey = `${conn}|${realFid}|${f}`;
        lastFetchRef.current.set(realKey, Date.now());
        if (keyRef.current === key || keyRef.current === realKey) {
          keyRef.current = realKey;
          if (folderIdRef.current !== realFid) {
            folderIdRef.current = realFid;
            setFolderId(realFid);
          }
          applyPage(conn, realFid, f, res.page);
        } else {
          // Brukeren byttet mappe eller filter mens kontoen lastet.
          setTimeout(() => loadListRef.current?.(), 0);
        }
        res.deeper().then((extra) => {
          if (!extra.length || activeRef.current?.id !== conn) return;
          const have = new Set(foldersRef.current.map((x) => x.id));
          applyFolders(conn, [...foldersRef.current, ...extra.filter((x) => !have.has(x.id))]);
        }).catch(() => {});
      } else {
        const page = await listMessages(conn, fid, { filter: f, top: PAGE });
        if (keyRef.current !== key) return;
        lastFetchRef.current.set(key, Date.now());
        applyPage(conn, fid, f, page);
      }
      setSyncedAt(Date.now());
      setError((cur) => (cur?.sync ? null : cur));
    } catch (e) {
      if (keyRef.current === key && !silent) {
        showError(e, 'Klarte ikke hente e-post');
        setError((cur) => (cur ? { ...cur, sync: true } : cur));
      }
    } finally {
      if (!silent) setSyncCount((n) => Math.max(0, n - 1));
    }
  }, [uid, applyFolders, applyPage, showError]);
  loadListRef.current = loadList;

  const refreshFolders = useCallback(async () => {
    const conn = activeRef.current?.id;
    if (!conn || !isDirectMail(conn)) return;
    try {
      const list = await loadFolders(conn);
      if (activeRef.current?.id === conn && list?.length) applyFolders(conn, list);
    } catch { /* stille */ }
  }, [applyFolders]);

  useEffect(() => {
    if (!uid || !active?.id || !active.mailAccess) return;
    setSearch(null);
    loadListRef.current?.();
  }, [uid, active?.id, active?.mailAccess, folderId, filter]);

  // Ny e-post hentes i bakgrunnen mens siden er åpen, som i Outlook.
  useEffect(() => {
    if (!active?.id || !active.mailAccess) return undefined;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      pollTick.current += 1;
      loadListRef.current?.({ force: true, silent: true }).catch(() => {});
      if (pollTick.current % 3 === 0) refreshFolders();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [active?.id, active?.mailAccess, refreshFolders]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return undefined;
    const onFocus = () => {
      if (Date.now() - lastAccountFetchRef.current > 120000) reloadAccounts();
      loadListRef.current?.({ silent: true });
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

  const loadMore = useCallback(async () => {
    const conn = activeRef.current?.id;
    const fid = folderIdRef.current;
    const f = filterRef.current;
    if (!conn || !fid || moreBusy || !hasMore || search) return;
    const key = keyRef.current;
    setMoreBusy(true);
    try {
      const page = await listMessages(conn, fid, { filter: f, top: PAGE, skip: nextSkipRef.current });
      if (keyRef.current === key) applyPage(conn, fid, f, page, { append: true });
    } catch (e) {
      showError(e, 'Klarte ikke hente flere');
    } finally {
      setMoreBusy(false);
    }
  }, [moreBusy, hasMore, search, applyPage, showError]);

  /* ───────── Visning ───────── */

  const listSource = search ? search.messages : messages;
  const shown = useMemo(() => {
    const q = search ? '' : query.trim().toLowerCase();
    return listSource.filter((m) => {
      if (!search && !matchesMailFilter(m, filter)) return false;
      if (!q) return true;
      return `${m.subject} ${m.from?.name || ''} ${m.from?.address || ''} ${m.preview}`.toLowerCase().includes(q);
    });
  }, [listSource, query, search, filter]);
  const rows = useMemo(() => groupMailRows(shown), [shown]);

  const folderTree = useMemo(() => nestMailFolders(folders), [folders]);
  const allFolders = useMemo(() => flattenMailFolders(folderTree), [folderTree]);
  const foldersById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const effectiveFavorites = useMemo(() => {
    if (favoriteIds) return favoriteIds.filter((id) => foldersById.has(id));
    return ['inbox', 'sentitems'].map((w) => folderByWell(folders, w)?.id).filter(Boolean);
  }, [favoriteIds, foldersById, folders]);
  const favoriteRows = useMemo(
    () => effectiveFavorites.map((id) => foldersById.get(id)).filter(Boolean),
    [effectiveFavorites, foldersById],
  );
  const folderRows = useMemo(() => visibleMailFolderRows(folderTree, expandedIds), [folderTree, expandedIds]);
  const currentFolder = foldersById.get(folderId) || null;
  const currentWell = currentFolder?.wellKnownName || (folderId === 'inbox' ? 'inbox' : null);
  const currentFolderName = currentFolder?.name || (folderId === 'inbox' ? 'Innboks' : 'E-post');
  const contacts = useMemo(
    () => mergeContacts(storedContacts, contactsFromMessages(messages).map((c) => ({ ...c, count: 0 })), 0),
    [storedContacts, messages],
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

  const toggleFolder = (id) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setExpandedIds(next);
    if (active?.id) writeJson(`${EXPAND_KEY}.${active.id}`, [...next]);
  };

  const toggleFavorite = (id) => {
    const cur = effectiveFavorites;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    setFavoriteIds(next);
    if (active?.id) writeJson(`${FAVORITES_KEY}.${active.id}`, next);
  };

  const persistPanes = (folder, list) => writeJson(PANE_KEY, { folder, list });

  /* ───────── Lokale endringer ───────── */

  const putList = useCallback((next) => {
    messagesRef.current = next;
    setMessages(next);
    const conn = activeRef.current?.id;
    if (conn && folderIdRef.current) putMailMessagesCache(uid, conn, folderIdRef.current, filterRef.current, next);
  }, [uid]);

  const patchLocal = useCallback((ids, fn) => {
    const set = new Set(ids);
    putList(messagesRef.current.map((m) => (set.has(m.id) ? fn(m) : m)));
    setOpen((o) => (o && set.has(o.id) ? fn(o) : o));
    setSearch((s) => (s ? { ...s, messages: s.messages.map((m) => (set.has(m.id) ? fn(m) : m)) } : s));
    const conn = activeRef.current?.id;
    ids.forEach((id) => {
      const hit = peekMailMessageCache(uid, conn, id);
      if (hit?.message) putMailMessageCache(uid, conn, id, fn(hit.message));
    });
  }, [uid, putList]);

  const bumpUnread = useCallback((fid, delta) => {
    const conn = activeRef.current?.id;
    if (!conn || !delta) return;
    const target = foldersRef.current.find((f) => f.id === fid || f.wellKnownName === fid);
    if (!target) return;
    applyFolders(conn, foldersRef.current.map((f) => (
      f.id === target.id ? { ...f, unread: Math.max(0, Number(f.unread || 0) + delta) } : f
    )));
  }, [applyFolders]);

  /* ───────── Åpne melding ───────── */

  const withImages = useCallback((conn, message) => {
    const hit = IMAGE_CACHE.get(imageCacheKey(conn, message.id));
    if (hit) return { ...message, html: hit.html, visibleAttachments: visibleAttachments(message, hit.used) };
    return { ...message, visibleAttachments: visibleAttachments(message, new Set()) };
  }, []);

  const resolveImages = useCallback(async (conn, message) => {
    if (!isDirectMail(conn) || !/cid:/i.test(message.html || '')) return;
    if (IMAGE_CACHE.has(imageCacheKey(conn, message.id))) return;
    try {
      const res = await loadInlineImages(conn, message);
      rememberImages(imageCacheKey(conn, message.id), { html: res.html, used: res.used });
      setOpen((cur) => (cur?.id === message.id ? withImages(conn, { ...message, ...cur, html: message.html }) : cur));
    } catch { /* teksten vises uten bilder */ }
  }, [withImages]);

  const markRead = useCallback((list, isRead) => {
    const conn = activeRef.current?.id;
    const targets = (list || []).filter((m) => m && m.isRead !== isRead && !m.isDraft);
    if (!conn || !targets.length) return;
    const ids = targets.map((m) => m.id);
    patchLocal(ids, (m) => ({ ...m, isRead }));
    const byFolder = {};
    targets.forEach((m) => {
      const fid = m.parentFolderId || folderIdRef.current;
      byFolder[fid] = (byFolder[fid] || 0) + (isRead ? -1 : 1);
    });
    Object.entries(byFolder).forEach(([fid, d]) => bumpUnread(fid, d));
    if (!isDirectMail(conn)) return;
    updateMailMessages(conn, ids, { isRead }).catch((e) => {
      patchLocal(ids, (m) => ({ ...m, isRead: !isRead }));
      Object.entries(byFolder).forEach(([fid, d]) => bumpUnread(fid, -d));
      showError(e);
    });
  }, [patchLocal, bumpUnread, showError]);

  const openMessage = useCallback(async (id) => {
    const conn = activeRef.current?.id;
    if (!conn || !id) return;
    setSelectedId(id);
    const summary = messagesRef.current.find((m) => m.id === id)
      || search?.messages?.find((m) => m.id === id);
    const cached = peekMailMessageCache(uid, conn, id) || await loadMailMessageCache(uid, conn, id);
    const cachedFull = cached?.message?.full && cached.message.html ? cached.message : null;
    if (cachedFull) {
      setOpen(withImages(conn, { ...cachedFull, ...(summary ? {
        isRead: summary.isRead, flagged: summary.flagged, flagStatus: summary.flagStatus, flagDue: summary.flagDue, categories: summary.categories,
      } : {}) }));
      setBodyLoading(false);
    } else if (summary) {
      setOpen({ ...summary, html: '', partial: true });
      setBodyLoading(true);
    }
    if (summary && !summary.isRead && composePrefs.markReadOnOpen !== false) markRead([summary], true);

    let full = cachedFull;
    if (!full || cached?.stale) {
      try {
        full = await getMessage(conn, id);
        putMailMessageCache(uid, conn, id, full);
        if (openRef.current?.id === id || !openRef.current) {
          const live = messagesRef.current.find((m) => m.id === id);
          setOpen(withImages(conn, {
            ...full,
            ...(live ? { isRead: live.isRead, flagged: live.flagged, flagStatus: live.flagStatus, flagDue: live.flagDue, categories: live.categories } : {}),
          }));
        }
      } catch (e) {
        if (!cachedFull) showError(e, 'Klarte ikke åpne meldingen');
      } finally {
        if (!openRef.current || openRef.current.id === id) setBodyLoading(false);
      }
    }
    if (full) resolveImages(conn, full);
  }, [uid, search, withImages, markRead, resolveImages, showError, composePrefs.markReadOnOpen]);

  const prefetchOne = useCallback((id) => {
    const conn = activeRef.current?.id;
    if (!conn || !id || Platform.OS !== 'web' || !isDirectMail(conn)) return;
    clearTimeout(hoverTimer.current);
    hoverTimer.current = setTimeout(() => {
      if (peekMailMessageCache(uid, conn, id)) return;
      getMessage(conn, id).then((m) => putMailMessageCache(uid, conn, id, m)).catch(() => {});
    }, 220);
  }, [uid]);

  const ensureFull = useCallback(async (m) => {
    if (!m) return null;
    if (m.full && m.html !== undefined) return m;
    const conn = activeRef.current?.id;
    const full = await getMessage(conn, m.id);
    putMailMessageCache(uid, conn, m.id, full);
    return full;
  }, [uid]);

  /* ───────── Handlinger ───────── */

  const selectAfterRemove = useCallback((ids) => {
    const set = new Set(ids);
    const list = shown;
    const idx = list.findIndex((m) => set.has(m.id));
    const rest = list.filter((m) => !set.has(m.id));
    if (openRef.current && set.has(openRef.current.id)) {
      const next = rest[Math.min(Math.max(0, idx), rest.length - 1)];
      if (next && isDesktop) openMessage(next.id);
      else {
        setOpen(null);
        setSelectedId(null);
      }
    }
  }, [shown, isDesktop, openMessage]);

  const removeLocal = useCallback((ids) => {
    const set = new Set(ids);
    selectAfterRemove(ids);
    putList(messagesRef.current.filter((m) => !set.has(m.id)));
    setSearch((s) => (s ? { ...s, messages: s.messages.filter((m) => !set.has(m.id)) } : s));
  }, [putList, selectAfterRemove]);

  const targets = useCallback((m) => (m ? [m] : (openRef.current ? [openRef.current] : [])), []);

  const moveTo = useCallback(async (m, destId, label) => {
    const conn = activeRef.current?.id;
    const list = targets(m);
    if (!conn || !list.length) return;
    const ids = list.map((x) => x.id);
    const from = list[0].parentFolderId || folderIdRef.current;
    const unreadN = list.filter((x) => !x.isRead).length;
    removeLocal(ids);
    bumpUnread(from, -unreadN);
    bumpUnread(destId, unreadN);
    try {
      const moved = destId === 'deleteditems'
        ? await deleteMessages(conn, ids)
        : await moveMailMessages(conn, ids, destId);
      const newIds = moved.map((x) => x.message?.id).filter(Boolean);
      showToast(`Flyttet til ${label}`, newIds.length && from ? {
        action: {
          label: 'Angre',
          run: () => {
            moveMailMessages(conn, newIds, from)
              .then(() => {
                bumpUnread(destId, -unreadN);
                bumpUnread(from, unreadN);
                return loadListRef.current?.({ force: true, silent: true });
              })
              .catch((e) => showError(e));
          },
        },
      } : {});
    } catch (e) {
      bumpUnread(from, unreadN);
      bumpUnread(destId, -unreadN);
      showError(e, 'Klarte ikke flytte');
      loadListRef.current?.({ force: true });
    }
  }, [targets, removeLocal, bumpUnread, showToast, showError]);

  const onDelete = useCallback((m) => {
    const list = targets(m);
    if (!list.length) return;
    const inTrash = (list[0].parentFolderId && foldersById.get(list[0].parentFolderId)?.wellKnownName === 'deleteditems')
      || currentWell === 'deleteditems';
    if (inTrash) {
      setPurgeIds(list.map((x) => x.id));
      return;
    }
    moveTo(m, 'deleteditems', 'Slettede elementer');
  }, [targets, foldersById, currentWell, moveTo]);

  const purge = async () => {
    const ids = purgeIds || [];
    setPurgeIds(null);
    const conn = activeRef.current?.id;
    if (!conn || !ids.length) return;
    removeLocal(ids);
    try {
      await deleteMailMessagesPermanently(conn, ids);
      showToast('Slettet for godt');
    } catch (e) {
      showError(e, 'Klarte ikke slette');
      loadListRef.current?.({ force: true });
    }
  };

  const setFlag = useCallback((m, kind) => {
    const conn = activeRef.current?.id;
    const list = targets(m);
    if (!conn || !list.length) return;
    const ids = list.map((x) => x.id);
    const before = new Map(list.map((x) => [x.id, x]));
    const patch = flagPatch(kind);
    patchLocal(ids, (x) => applyFlagLocally(x, patch));
    updateMailMessages(conn, ids, patch).catch((e) => {
      patchLocal(ids, (x) => ({
        ...x,
        flagged: before.get(x.id)?.flagged,
        flagStatus: before.get(x.id)?.flagStatus,
        flagDue: before.get(x.id)?.flagDue,
      }));
      showError(e);
    });
  }, [targets, patchLocal, showError]);

  const setCategories = useCallback((m, next) => {
    const conn = activeRef.current?.id;
    const list = targets(m);
    if (!conn || !list.length) return;
    const target = list[0];
    const before = target.categories || [];
    patchLocal([target.id], (x) => ({ ...x, categories: next }));
    updateMailMessages(conn, [target.id], { categories: next }).catch((e) => {
      patchLocal([target.id], (x) => ({ ...x, categories: before }));
      showError(e);
    });
  }, [targets, patchLocal, showError]);

  /* ───────── Skriv ───────── */

  const baseCompose = useCallback((mode, extra = {}) => {
    const sig = signatureFor(composePrefs, mode === 'new' ? 'new' : 'reply');
    return {
      key: `c${Date.now()}`,
      mode,
      accountId: activeRef.current?.id,
      title: 'Ny e-post',
      to: [],
      cc: [],
      bcc: [],
      showCc: false,
      showBcc: !!composePrefs.showBcc,
      subject: '',
      body: `<div><br></div>${signatureBlockHtml(sig?.html)}`,
      signatureId: sig?.id || '',
      importance: 'normal',
      sensitivity: 'normal',
      readReceipt: !!composePrefs.readReceipt,
      deliveryReceipt: false,
      files: [],
      draftId: '',
      quoteHtml: '',
      inlineKnown: {},
      inlineUploaded: [],
      rev: 0,
      savedRev: 0,
      error: '',
      savedAt: 0,
      ...extra,
    };
  }, [composePrefs]);

  const startCompose = useCallback((extra = {}) => {
    if (composeRef.current && !composeRef.current.minimized) return;
    setCompose(baseCompose('new', extra));
  }, [baseCompose]);

  const startReply = useCallback(async (mode, m) => {
    const src = m || openRef.current;
    if (!src) return;
    if (composeRef.current) {
      showToast('Lukk eller send meldingen du skriver først.');
      setCompose((c) => (c ? { ...c, minimized: false } : c));
      return;
    }
    try {
      const msg = await ensureFull(src);
      const self = activeRef.current?.email;
      const base = {
        sourceId: msg.id,
        source: msg,
        focusBody: true,
      };
      if (mode === 'forward') {
        setCompose(baseCompose('forward', { ...base, title: 'Videresend', subject: forwardSubject(msg.subject), focusBody: false }));
        return;
      }
      const { to, cc } = replyRecipients(msg, self, { all: mode === 'replyAll' });
      setCompose(baseCompose(mode, {
        ...base,
        title: mode === 'replyAll' ? 'Svar alle' : 'Svar',
        to,
        cc,
        showCc: cc.length > 0,
        subject: replySubject(msg.subject),
      }));
    } catch (e) {
      showError(e, 'Klarte ikke åpne meldingen');
    }
  }, [ensureFull, baseCompose, showToast, showError]);

  const editDraft = useCallback(async (m) => {
    const conn = activeRef.current?.id;
    const src = m || openRef.current;
    if (!conn || !src) return;
    try {
      const d = await openMailDraft(conn, src.id);
      const msg = d.message;
      setCompose(baseCompose('draft', {
        title: 'Utkast',
        draftId: msg.id,
        quoteHtml: d.quoteHtml,
        inlineKnown: d.inlineKnown,
        inlineUploaded: d.inlineUploaded,
        to: msg.to,
        cc: msg.cc,
        bcc: msg.bcc,
        showCc: msg.cc.length > 0,
        showBcc: msg.bcc.length > 0,
        subject: msg.subject === '(uten emne)' ? '' : msg.subject,
        body: d.editable,
        signatureId: '',
        importance: msg.importance,
        sensitivity: msg.sensitivity,
        readReceipt: msg.readReceipt,
        deliveryReceipt: msg.deliveryReceipt,
        files: d.files,
        focusBody: true,
      }));
    } catch (e) {
      showError(e, 'Klarte ikke åpne utkastet');
    }
  }, [baseCompose, showError]);

  const updateCompose = useCallback((patch) => {
    setCompose((c) => {
      if (!c) return c;
      if (patch.removedFile) {
        const gone = (c.files || []).find((f) => f.key === patch.removedFile);
        if (gone?.graphId && c.draftId) removeDraftAttachment(c.accountId, c.draftId, gone.graphId);
      }
      const { dirty, removedFile, ...rest } = patch;
      return { ...c, ...rest, rev: dirty ? (c.rev || 0) + 1 : c.rev, error: dirty ? '' : (rest.error ?? c.error) };
    });
  }, []);

  const composeHtml = useCallback((c) => composeBodyToHtml(c.body, composePrefs), [composePrefs]);

  const saveDraft = useCallback(({ close = false, silent = false } = {}) => {
    const run = savingRef.current.then(async () => {
      const c = composeRef.current;
      if (!c) return;
      if (!isDirectMail(c.accountId)) {
        if (!silent) updateCompose({ error: 'Utkast krever at e-posten kobles til på nytt.' });
        return;
      }
      const rev = c.rev || 0;
      setCompose((cur) => (cur?.key === c.key ? { ...cur, saving: true } : cur));
      try {
        const res = await saveMailDraft(c.accountId, { ...c, html: composeHtml(c) });
        savedDraftsRef.current.set(c.key, res);
        setCompose((cur) => {
          if (cur?.key !== c.key) return cur;
          const files = (cur.files || []).map((f) => res.files.find((x) => x.key === f.key) || f);
          return {
            ...cur, ...res, files, saving: false, savedAt: Date.now(), savedRev: rev, error: '',
          };
        });
        if (close) {
          setCompose(null);
          showToast('Utkastet er lagret i Kladd');
        }
      } catch (e) {
        setCompose((cur) => (cur?.key === c.key ? {
          ...cur, saving: false, error: silent ? 'Klarte ikke lagre utkastet automatisk.' : friendlyMailError(e, 'Klarte ikke lagre utkastet'),
        } : cur));
      }
    });
    savingRef.current = run.catch(() => {});
    return run;
  }, [composeHtml, updateCompose, showToast]);

  // Autolagring av utkast, som i Outlook.
  useEffect(() => {
    clearTimeout(autosaveRef.current);
    if (!compose || composeBusy || (compose.rev || 0) === (compose.savedRev || 0)) return undefined;
    const hasContent = compose.to.length || compose.subject || String(compose.body || '').replace(/<[^>]+>|&nbsp;/g, '').trim();
    if (!hasContent) return undefined;
    autosaveRef.current = setTimeout(() => saveDraft({ silent: true }), AUTOSAVE_MS);
    return () => clearTimeout(autosaveRef.current);
  }, [compose, composeBusy, saveDraft]);

  const withSavedDraft = useCallback((c) => {
    const res = c ? savedDraftsRef.current.get(c.key) : null;
    if (!res) return c;
    return {
      ...c,
      draftId: c.draftId || res.draftId,
      quoteHtml: c.quoteHtml || res.quoteHtml,
      inlineUploaded: [...new Set([...(c.inlineUploaded || []), ...(res.inlineUploaded || [])])],
      files: (c.files || []).map((f) => (f.graphId ? f : (res.files || []).find((x) => x.key === f.key && x.graphId) || f)),
    };
  }, []);

  const discardCompose = useCallback(async () => {
    const c = composeRef.current;
    clearTimeout(autosaveRef.current);
    setCompose(null);
    await savingRef.current;
    const draftId = withSavedDraft(c)?.draftId;
    if (c) savedDraftsRef.current.delete(c.key);
    if (c && draftId) {
      discardMailDraft(c.accountId, draftId).then(() => {
        if (currentWell === 'drafts') loadListRef.current?.({ force: true, silent: true });
      });
    }
  }, [currentWell, withSavedDraft]);

  const rememberRecipients = useCallback((c) => {
    const next = mergeContacts(readJson(CONTACTS_KEY, []), [...c.to, ...c.cc, ...c.bcc], 3);
    writeJson(CONTACTS_KEY, next);
    setStoredContacts(next);
  }, []);

  const runSend = useCallback(async () => {
    const c = composeRef.current;
    if (!c || composeBusy) return;
    const all = [...c.to, ...c.cc, ...c.bcc];
    if (!all.length) {
      updateCompose({ error: 'Legg til minst én mottaker.' });
      return;
    }
    const bad = all.filter((r) => !isValidAddress(r.address));
    if (bad.length) {
      updateCompose({ error: `Sjekk adressen: ${bad.map((r) => r.address).join(', ')}` });
      return;
    }
    if (!String(c.subject || '').trim() && !c.noSubjectOk) {
      updateCompose({ error: 'Meldingen har ikke emne. Trykk Send igjen for å sende likevel.', noSubjectOk: true });
      return;
    }
    clearTimeout(autosaveRef.current);
    setComposeBusy(true);
    await savingRef.current;
    const latest = withSavedDraft(composeRef.current || c);
    savedDraftsRef.current.delete(latest.key);
    setCompose(null);
    showToast('Sender…', { busy: true });
    try {
      await sendCompose(latest.accountId, { ...latest, html: composeHtml(latest) });
      rememberRecipients(latest);
      if (latest.draftId && messagesRef.current.some((m) => m.id === latest.draftId)) removeLocal([latest.draftId]);
      showToast('Sendt');
      if (currentWell === 'sentitems' || currentWell === 'drafts') {
        setTimeout(() => loadListRef.current?.({ force: true, silent: true }), 1500);
      }
    } catch (e) {
      setCompose({
        ...latest,
        draftId: e?.draftId || latest.draftId,
        quoteHtml: e?.quoteHtml || latest.quoteHtml,
        error: friendlyMailError(e, 'Sending feilet'),
        minimized: false,
      });
      showToast('Meldingen ble ikke sendt', { error: true });
    } finally {
      setComposeBusy(false);
    }
  }, [composeBusy, updateCompose, composeHtml, showToast, rememberRecipients, currentWell, withSavedDraft, removeLocal]);

  /* ───────── Vedlegg ───────── */

  const openAttachment = useCallback(async (att) => {
    const conn = activeRef.current?.id;
    const msg = openRef.current;
    if (!conn || !msg) return;
    if (Platform.OS !== 'web') {
      showToast('Vedlegg åpnes foreløpig i nettleseren på PC.');
      return;
    }
    const preview = /pdf|^image\/|^text\/plain/i.test(att.contentType);
    const w = preview ? window.open('', '_blank') : null;
    if (w?.document?.body) {
      w.document.title = att.name;
      w.document.body.innerHTML = '<p style="font-family:Segoe UI,sans-serif;color:#5b6b82;padding:16px">Henter vedlegg…</p>';
    }
    setAttachmentBusy(att.id);
    try {
      const blob = await downloadMailAttachment(conn, msg.id, att.id);
      const typed = new Blob([blob], { type: att.contentType || blob.type || 'application/octet-stream' });
      const url = URL.createObjectURL(typed);
      if (w) {
        w.location.href = url;
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = att.name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      setTimeout(() => URL.revokeObjectURL(url), 120000);
    } catch (e) {
      w?.close?.();
      showError(e, 'Klarte ikke hente vedlegget');
    } finally {
      setAttachmentBusy(null);
    }
  }, [showToast, showError]);

  /* ───────── Søk ───────── */

  const runSearch = useCallback(async (raw) => {
    const q = String(raw || '').trim();
    const conn = activeRef.current?.id;
    if (!q) {
      setSearch(null);
      return;
    }
    if (!conn || !isDirectMail(conn)) return;
    setSearch((s) => ({ query: q, messages: s?.messages || [], busy: true }));
    try {
      const res = await searchMailMessages(conn, q);
      setSearch((s) => (s && s.query === q ? { query: q, messages: res.messages, busy: false } : s));
    } catch (e) {
      setSearch((s) => (s && s.query === q ? { ...s, busy: false } : s));
      showError(e, 'Søket feilet');
    }
  }, [showError]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setSearch(null);
      return undefined;
    }
    if (q.length < 3) return undefined;
    const t = setTimeout(() => runSearch(q), 650);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  /* ───────── Kontoer og innstillinger ───────── */

  const switchAccount = (acc) => {
    if (acc.id !== connectionId) setConnectionId(acc.id);
    if (!acc.mailAccess) grantMail(acc.id);
  };

  const persistDefaultAccount = (id) => {
    setDefaultAccountId(id || null);
    writeJson(DEFAULT_ACCOUNT_KEY, id || null);
    if (id) setConnectionId(id);
  };

  const pickFilter = (id) => {
    const next = normalizeMailFilter(id);
    setFilter(next);
    writeJson(FILTER_KEY, next);
  };

  const persistComposePrefs = (patch) => {
    const next = patchMailComposePrefs(patch);
    setComposePrefs(next);
    if (next.saveFailed) showToast('Signaturen er for stor til å lagres. Bruk mindre bilder.', { error: true });
  };

  const removeAccount = async (id) => {
    if (!id) return;
    try {
      await removeCalendarConnection(id);
      if (defaultAccountId === id) persistDefaultAccount(null);
      await reloadAccounts();
    } catch (e) {
      setError({ text: friendlyCallableError(e, 'Klarte ikke fjerne kontoen.') });
    }
  };

  async function grantMail(id) {
    try {
      setGrantBusy(true);
      setError(null);
      const cfg = await getCalendarOAuthConfig();
      const acc = mailAccounts.find((c) => c.id === id);
      await connectMicrosoftMail({ clientId: cfg?.microsoft?.clientId, connectionId: id, loginHint: acc?.email });
    } catch (e) {
      if (e?.message === 'cancelled') return;
      setError({ text: friendlyMicrosoftAuthMessage(friendlyCallableError(e, 'Klarte ikke koble til e-postkontoen.')) });
    } finally {
      setGrantBusy(false);
    }
  }

  const pickFolder = (id) => {
    setFolderId(id);
    writeJson(LAST_FOLDER_KEY, id || null);
    setFolderOpen(false);
    setQuery('');
    setSearch(null);
    if (id !== folderIdRef.current) {
      setOpen(null);
      setSelectedId(null);
    }
  };

  const refreshMailbox = () => {
    if (search) {
      runSearch(search.query);
      return;
    }
    loadListRef.current?.({ force: true });
    refreshFolders();
  };

  /* ───────── Menyer ───────── */

  const moveItems = useCallback((m) => {
    const skip = (m?.parentFolderId) || folderIdRef.current;
    return [
      { header: 'Flytt til' },
      ...allFolders
        .filter((f) => f.id !== skip && f.wellKnownName !== 'outbox' && f.wellKnownName !== 'drafts')
        .map((f) => ({
          id: `mv-${f.id}`,
          label: `${' '.repeat(Math.min(4, Number(f.depth || 0)))}${f.name}`,
          icon: mailFolderIcon(f.wellKnownName),
          onPress: () => moveTo(m, f.id, f.name),
        })),
    ];
  }, [allFolders, moveTo]);

  const flagItems = useCallback((m) => FLAG_OPTIONS.map((o) => ({
    id: `fl-${o.id}`,
    label: o.label,
    icon: o.id === 'clear' ? 'flag-outline' : o.id === 'complete' ? 'checkmark-circle-outline' : 'flag',
    iconColor: o.id === 'clear' || o.id === 'complete' ? colors.ink : colors.danger,
    onPress: () => setFlag(m, o.id),
  })), [setFlag]);

  const categoryItems = useCallback((m) => {
    const target = m || openRef.current;
    const current = target?.categories || [];
    return [
      ...categoryChoices(master, [...messagesRef.current, ...(target ? [target] : [])]).map((c) => ({
        id: `cat-${c.name}`,
        label: c.name,
        swatch: c.color,
        checked: current.some((x) => x.toLowerCase() === c.name.toLowerCase()),
        onPress: () => setCategories(target, toggleCategory(current, c.name)),
      })),
      { divider: true },
      { id: 'cat-clear', label: 'Fjern alle kategorier', icon: 'close-circle-outline', disabled: !current.length, onPress: () => setCategories(target, []) },
    ];
  }, [master, setCategories]);

  // Undermenyen åpnes der forrige meny var, etter at den er lukket.
  const openLater = useCallback((next) => setTimeout(() => setMenu(next), 0), []);

  const moreItems = useCallback((m, anchor) => {
    const target = m || openRef.current;
    if (!target) return [];
    const at = anchor || {
      x: Math.max(8, win.width / 2 - 120), y: 120, w: 0, h: 0,
    };
    const sub = (kind) => () => openLater({ kind, message: target, anchor: at });
    return [
      ...(target.isDraft ? [{ id: 'm-edit', label: 'Fortsett utkast', icon: 'create-outline', onPress: () => editDraft(target) }] : [
        { id: 'm-reply', label: 'Svar', icon: 'arrow-undo-outline', onPress: () => startReply('reply', target) },
        { id: 'm-replyall', label: 'Svar alle', icon: 'arrow-undo', onPress: () => startReply('replyAll', target) },
        { id: 'm-fwd', label: 'Videresend', icon: 'arrow-redo-outline', onPress: () => startReply('forward', target) },
      ]),
      { divider: true },
      {
        id: 'm-read',
        label: target.isRead ? 'Merk som ulest' : 'Merk som lest',
        icon: target.isRead ? 'mail-unread-outline' : 'mail-open-outline',
        onPress: () => markRead([target], !target.isRead),
      },
      { id: 'm-flag', label: 'Flagg …', icon: 'flag-outline', onPress: sub('flag') },
      { id: 'm-cat', label: 'Kategoriser …', icon: 'pricetags-outline', onPress: sub('category') },
      { divider: true },
      { id: 'm-move', label: 'Flytt til …', icon: 'folder-open-outline', onPress: sub('move') },
      { id: 'm-archive', label: 'Arkiver', icon: 'archive-outline', onPress: () => moveTo(target, 'archive', 'Arkiv') },
      { id: 'm-junk', label: 'Søppelpost', icon: 'alert-circle-outline', onPress: () => moveTo(target, 'junkemail', 'Søppelpost') },
      { id: 'm-delete', label: 'Slett', icon: 'trash-outline', danger: true, onPress: () => onDelete(target) },
    ];
  }, [editDraft, startReply, markRead, moveTo, onDelete, openLater, win.width]);

  const menuItems = useMemo(() => {
    if (!menu) return [];
    if (menu.kind === 'move') return moveItems(menu.message);
    if (menu.kind === 'flag') return flagItems(menu.message);
    if (menu.kind === 'category') return categoryItems(menu.message);
    return moreItems(menu.message, menu.anchor);
  }, [menu, moveItems, flagItems, categoryItems, moreItems]);

  const rowHandlers = useMemo(() => ({
    onOpen: (id) => openMessage(id),
    onPrefetch: (id) => prefetchOne(id),
    onAction: (kind, m) => {
      if (kind === 'delete') onDelete(m);
      else if (kind === 'toggleRead') markRead([m], !m.isRead);
      else if (kind === 'toggleFlag') setFlag(m, m.flagged ? 'clear' : 'noDate');
    },
    onMenu: (m, anchor) => setMenu({ kind: 'more', message: m, anchor }),
  }), [openMessage, prefetchOne, onDelete, markRead, setFlag]);

  /* ───────── Tastatur (web) ───────── */

  const keyState = useRef({});
  keyState.current = {
    shown, open, compose, menu, purgeIds, settingsOpen, isDesktop,
    openMessage, onDelete, startReply, markRead, setFlag, startCompose,
  };
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      const s = keyState.current;
      if (!s.isDesktop || (s.compose && !s.compose.minimized) || s.menu || s.purgeIds || s.settingsOpen) return;
      if (isTypingTarget(e.target)) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const k = e.key;
      const idx = s.shown.findIndex((m) => m.id === s.open?.id);
      if (k === 'ArrowDown' || k === 'ArrowUp' || ((k === 'j' || k === 'k') && !ctrl)) {
        e.preventDefault();
        const dir = k === 'ArrowDown' || k === 'j' ? 1 : -1;
        const next = s.shown[Math.max(0, Math.min(s.shown.length - 1, idx < 0 ? 0 : idx + dir))];
        if (next) s.openMessage(next.id);
      } else if (k === 'Delete' && s.open) {
        e.preventDefault();
        s.onDelete(null);
      } else if (ctrl && e.shiftKey && (k === 'R' || k === 'r') && s.open) {
        e.preventDefault();
        s.startReply('replyAll');
      } else if (ctrl && !e.shiftKey && (k === 'r' || k === 'R') && s.open) {
        e.preventDefault();
        s.startReply('reply');
      } else if (ctrl && e.shiftKey && (k === 'F' || k === 'f') && s.open) {
        e.preventDefault();
        s.startReply('forward');
      } else if (ctrl && (k === 'q' || k === 'Q') && s.open) {
        e.preventDefault();
        s.markRead([s.open], true);
      } else if (ctrl && (k === 'u' || k === 'U') && s.open) {
        e.preventDefault();
        s.markRead([s.open], false);
      } else if (k === 'Insert' && s.open) {
        e.preventDefault();
        s.setFlag(null, s.open.flagged ? 'clear' : 'noDate');
      } else if ((k === 'n' || k === 'N') && !ctrl && !e.altKey) {
        e.preventDefault();
        s.startCompose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const shellMailAdd = useMemo(() => {
    if (compose && !compose.minimized) return null;
    if (loadingAccounts && !accounts.length) return null;
    return <ShellAddButton label="Ny e-post" onPress={() => startCompose()} />;
  }, [compose, loadingAccounts, accounts.length, startCompose]);
  useShellTitleRight(shellMailAdd);

  /* ───────── Felles deler ───────── */

  const folderNav = (
    <FolderList
      favoriteRows={favoriteRows}
      folderRows={folderRows}
      folderId={folderId}
      mailAccounts={mailAccounts}
      active={active}
      favoriteIds={effectiveFavorites}
      grantBusy={grantBusy}
      onSelect={pickFolder}
      onToggle={toggleFolder}
      onSwitchAccount={switchAccount}
      onGrant={grantMail}
      onOpenSettings={() => setSettingsOpen(true)}
      onFavorite={toggleFavorite}
    />
  );

  if (loadingAccounts && !accounts.length && !messages.length) {
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
    : search
      ? (search.busy ? 'Søker…' : `Fant ingen meldinger for «${search.query}».`)
      : filter !== 'all'
        ? `Ingen meldinger her med filteret «${MAIL_FILTERS.find((f) => f.id === filter)?.label}».`
        : 'Ingen meldinger i denne mappen.';
  const listLoading = (syncing && !messages.length && !search) || (search?.busy && !search.messages.length);
  const showRecipients = !search && (currentWell === 'sentitems' || currentWell === 'drafts' || currentWell === 'outbox');
  const folderNameOf = search ? (id) => foldersById.get(id)?.name || '' : null;

  const banner = error ? (
    <View style={styles.banner}>
      <Ionicons name="warning-outline" size={14} color="#9a3412" />
      <Text style={styles.bannerTxt}>{error.text}</Text>
      {error.consent && active ? (
        <Pressable onPress={() => grantMail(active.id)} hitSlop={6}>
          <Text style={styles.bannerAction}>Gi e-posttilgang</Text>
        </Pressable>
      ) : null}
      <Pressable onPress={() => setError(null)} hitSlop={6} accessibilityLabel="Lukk">
        <Ionicons name="close" size={14} color="#9a3412" />
      </Pressable>
    </View>
  ) : null;

  const listHeader = (
    <View style={styles.listHead}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.listTitle} numberOfLines={1}>
          {search ? `Søk: «${search.query}»` : currentFolderName}
        </Text>
        <Text style={styles.listSub} numberOfLines={1}>
          {search
            ? (search.busy ? 'Søker i alle mapper…' : `${search.messages.length} treff i alle mapper`)
            : syncing ? 'Oppdaterer…' : syncedAt ? `Oppdatert ${timeLabel(syncedAt)}` : ''}
        </Text>
      </View>
      {search ? (
        <MailToolButton icon="close" label="Avslutt søk" onPress={() => { setQuery(''); setSearch(null); }} />
      ) : (
        <MailMenuButton
          icon="filter-outline"
          label={MAIL_FILTERS.find((f) => f.id === filter)?.label || 'Alle'}
          active={filter !== 'all'}
          width={190}
          items={() => MAIL_FILTERS.map((f) => ({
            id: f.id, label: f.label, checked: f.id === filter, onPress: () => pickFilter(f.id),
          }))}
        />
      )}
      {syncing || search?.busy ? <ActivityIndicator size="small" color={colors.brand} /> : null}
    </View>
  );

  const list = (
    <MailMessageList
      rows={rows}
      selectedId={selectedId}
      compact={!!composePrefs.compactList}
      showRecipients={showRecipients}
      folderNameOf={folderNameOf}
      master={master}
      handlers={rowHandlers}
      loading={listLoading}
      emptyText={emptyListText}
      hasMore={!search && hasMore}
      moreBusy={moreBusy}
      onEndReached={loadMore}
      contentStyle={!isDesktop ? styles.mobileListPad : undefined}
    />
  );

  const reading = open ? (
    <MailReadingPane
      message={open}
      bodyLoading={bodyLoading}
      master={master}
      attachmentBusy={attachmentBusy}
      onReply={() => startReply('reply')}
      onReplyAll={() => startReply('replyAll')}
      onForward={() => startReply('forward')}
      onOpenAttachment={openAttachment}
      onEditDraft={() => editDraft(open)}
      moreItems={(anchor) => moreItems(open, anchor)}
      showActions={isDesktop}
    />
  ) : null;

  const contextMenu = (
    <MailMenu
      visible={!!menu}
      anchor={menu?.anchor}
      items={menuItems}
      onClose={() => setMenu(null)}
      width={menu?.kind === 'move' ? 280 : 240}
    />
  );

  const composeOverlay = compose ? (
    <MailComposeBox
      compose={{ ...compose, dirty: (compose.rev || 0) !== (compose.savedRev || 0) }}
      prefs={composePrefs}
      accounts={mailAccounts.filter((a) => a.mailAccess)}
      contacts={contacts}
      busy={composeBusy}
      onChange={updateCompose}
      onSend={runSend}
      onSaveDraft={(opts) => saveDraft({ close: !!opts?.close })}
      onDiscard={discardCompose}
      onClose={() => setCompose(null)}
      onOpenSettings={() => setSettingsOpen(true)}
      onNotice={(text) => showToast(text)}
    />
  ) : null;

  const settingsModal = (
    <MailSettingsModal
      visible={settingsOpen}
      onClose={() => setSettingsOpen(false)}
      accounts={mailAccounts}
      defaultId={defaultAccountId || active?.id}
      unreadFirst={filter === 'unread'}
      grantBusy={grantBusy}
      onDefaultChange={persistDefaultAccount}
      onUnreadFirstChange={(v) => pickFilter(v ? 'unread' : 'all')}
      onConnect={() => grantMail(undefined)}
      onGrant={grantMail}
      onRemove={removeAccount}
      // Feilen vises i vinduet brukeren ser på, ikke på siden bak (SOS-17).
      error={settingsOpen ? error?.text || '' : ''}
      onDismissError={() => setError(null)}
      composePrefs={composePrefs}
      onComposePrefsChange={persistComposePrefs}
    />
  );

  const purgeDialog = (
    <ConfirmDialog
      visible={!!purgeIds}
      title="Slette for godt?"
      message="Meldingen ligger i Slettede elementer og blir borte for godt."
      confirmText="Slett"
      cancelText="Avbryt"
      danger
      onCancel={() => setPurgeIds(null)}
      onConfirm={purge}
      onClose={() => setPurgeIds(null)}
    />
  );

  const overlays = (
    <>
      {contextMenu}
      {composeOverlay}
      {settingsModal}
      {purgeDialog}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </>
  );

  /* ───────── Mobil ───────── */

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
                  <Text style={styles.mobileBackTxt} numberOfLines={1}>{search ? 'Søk' : currentFolderName}</Text>
                </TouchableOpacity>
                <View style={styles.mobileBarActions}>
                  {open.isDraft ? (
                    <MailToolButton icon="create-outline" compact accessibilityLabel="Fortsett utkast" onPress={() => editDraft(open)} />
                  ) : (
                    <MailMenuButton
                      icon="arrow-undo-outline"
                      compact
                      accessibilityLabel="Svar"
                      items={() => [
                        { id: 'r', label: 'Svar', icon: 'arrow-undo-outline', onPress: () => startReply('reply') },
                        { id: 'ra', label: 'Svar alle', icon: 'arrow-undo', onPress: () => startReply('replyAll') },
                        { id: 'f', label: 'Videresend', icon: 'arrow-redo-outline', onPress: () => startReply('forward') },
                      ]}
                    />
                  )}
                  <MailToolButton
                    icon={open.flagged ? 'flag' : 'flag-outline'}
                    iconColor={open.flagged ? colors.danger : undefined}
                    compact
                    accessibilityLabel={open.flagged ? 'Fjern flagg' : 'Flagg'}
                    onPress={() => setFlag(null, open.flagged ? 'clear' : 'noDate')}
                  />
                  <MailToolButton icon="trash-outline" compact accessibilityLabel="Slett" onPress={() => onDelete(null)} />
                  <MailMenuButton
                    icon="ellipsis-horizontal"
                    compact
                    accessibilityLabel="Flere handlinger"
                    items={(anchor) => moreItems(open, anchor)}
                  />
                </View>
              </View>
              {banner}
              {reading}
            </View>
          ) : (
            <View style={styles.mobileList}>
              <View style={styles.mobileBar}>
                <TouchableOpacity style={styles.mobileBarBtn} onPress={() => setFolderOpen(true)} accessibilityLabel="Velg mappe">
                  <Ionicons name="folder-outline" size={20} color={colors.ink} />
                  <Text style={styles.mobileTitle} numberOfLines={1}>{currentFolderName}</Text>
                  <Ionicons name="chevron-down" size={14} color={colors.muted} />
                </TouchableOpacity>
                <View style={styles.mobileBarActions}>
                  <MailToolButton icon="refresh" compact accessibilityLabel="Oppdater" onPress={refreshMailbox} />
                  <MailToolButton icon="settings-outline" compact accessibilityLabel="Innstillinger" onPress={() => setSettingsOpen(true)} />
                  <MailToolButton icon="search" compact accessibilityLabel="Søk" onPress={() => setSearchOpen((v) => !v)} />
                </View>
              </View>
              {searchOpen ? (
                <View dataSet={{ focusWithin: '1' }} style={styles.mobileSearch}>
                  <Ionicons name="search" size={14} color={colors.muted} />
                  <TextInput
                    style={styles.search}
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={() => runSearch(query)}
                    placeholder="Søk i all e-post"
                    placeholderTextColor={colors.muted}
                    returnKeyType="search"
                    autoFocus
                  />
                </View>
              ) : null}
              {listHeader}
              {banner}
              <HelpTarget id="content" style={{ flex: 1, minHeight: 0, width: '100%' }}>
                {list}
              </HelpTarget>
            </View>
          )}
        </View>
        <MailFolderDrawer visible={folderOpen} onClose={() => setFolderOpen(false)} currentName={currentFolderName}>
          {folderNav}
        </MailFolderDrawer>
        {overlays}
      </Screen>
    );
  }

  /* ───────── Desktop ───────── */

  const hasOpen = !!open;
  return (
    <Screen>
      <View style={styles.shell}>
        <View style={styles.ribbon}>
          <MailToolButton icon="create-outline" label="Ny e-post" primary onPress={() => startCompose()} />
          <View style={styles.ribbonSep} />
          <MailToolButton icon="trash-outline" label="Slett" compact={ribbonCompact} disabled={!hasOpen} onPress={() => onDelete(null)} />
          <MailToolButton icon="archive-outline" label="Arkiver" compact={ribbonCompact} disabled={!hasOpen} onPress={() => moveTo(null, 'archive', 'Arkiv')} />
          <MailMenuButton icon="folder-open-outline" label="Flytt" compact={ribbonCompact} disabled={!hasOpen} width={280} items={() => moveItems(open)} />
          <MailToolButton icon="alert-circle-outline" label="Søppelpost" compact={ribbonCompact} disabled={!hasOpen} onPress={() => moveTo(null, 'junkemail', 'Søppelpost')} />
          <View style={styles.ribbonSep} />
          <MailToolButton icon="arrow-undo-outline" label="Svar" disabled={!hasOpen || open?.isDraft} onPress={() => startReply('reply')} />
          <MailToolButton icon="arrow-undo" label="Svar alle" disabled={!hasOpen || open?.isDraft} onPress={() => startReply('replyAll')} />
          <MailToolButton icon="arrow-redo-outline" label="Videresend" disabled={!hasOpen || open?.isDraft} onPress={() => startReply('forward')} />
          <View style={styles.ribbonSep} />
          <MailToolButton
            icon={open?.isRead === false ? 'mail-open-outline' : 'mail-unread-outline'}
            label={open?.isRead === false ? 'Merk som lest' : 'Merk som ulest'}
            compact={ribbonCompact}
            disabled={!hasOpen}
            onPress={() => markRead([open], open?.isRead === false)}
          />
          <MailMenuButton
            icon={open?.flagged ? 'flag' : 'flag-outline'}
            iconColor={open?.flagged ? colors.danger : undefined}
            label="Flagg"
            compact={ribbonCompact}
            disabled={!hasOpen}
            width={210}
            items={() => flagItems(null)}
          />
          <MailMenuButton icon="pricetags-outline" label="Kategoriser" compact={ribbonCompact} disabled={!hasOpen} width={240} items={() => categoryItems(null)} />
          <View style={styles.ribbonSep} />
          <MailToolButton icon="refresh" label="Oppdater" compact={ribbonCompact} onPress={refreshMailbox} />
          <MailToolButton icon="settings-outline" label="Innstillinger" compact onPress={() => setSettingsOpen(true)} />
          <View style={{ flex: 1 }} />
          <View dataSet={{ focusWithin: '1' }} style={styles.searchWrap}>
            <Ionicons name="search" size={14} color={colors.muted} />
            <TextInput
              style={styles.search}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => runSearch(query)}
              placeholder="Søk i all e-post"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              accessibilityLabel="Søk i e-post"
            />
            {query ? (
              <Pressable onPress={() => { setQuery(''); setSearch(null); }} hitSlop={6} accessibilityLabel="Tøm søk">
                <Ionicons name="close-circle" size={14} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>

        {banner}

        <View style={styles.panes}>
          <View style={[styles.folderPane, { width: folderW }]}>
            <ScrollView style={styles.paneScroll} contentContainerStyle={styles.folderScrollInner}>
              {folderNav}
            </ScrollView>
            <MailPaneResizeHandle
              label="Endre bredde på mapper"
              onGrant={() => { folderOriginRef.current = folderWRef.current; }}
              onMove={(dx) => {
                const next = applyMailPaneDrag(folderOriginRef.current, dx, MAIL_FOLDER_PANE_MIN, MAIL_FOLDER_PANE_MAX);
                folderWRef.current = next;
                setFolderW(next);
              }}
              onEnd={() => persistPanes(folderWRef.current, listWRef.current)}
            />
          </View>

          <View style={[styles.listPane, { width: listW }]}>
            {listHeader}
            <HelpTarget id="content" style={{ flex: 1, minHeight: 0, width: '100%' }}>
              {list}
            </HelpTarget>
            <MailPaneResizeHandle
              label="Endre bredde på meldingsliste"
              onGrant={() => { listOriginRef.current = listWRef.current; }}
              onMove={(dx) => {
                const next = applyMailPaneDrag(listOriginRef.current, dx, MAIL_LIST_PANE_MIN, MAIL_LIST_PANE_MAX);
                listWRef.current = next;
                setListW(next);
              }}
              onEnd={() => persistPanes(folderWRef.current, listWRef.current)}
            />
          </View>

          <View style={styles.readPane}>
            {reading || (
              <View style={styles.center}>
                <Ionicons name="mail-open-outline" size={36} color={colors.line} />
                <Text style={styles.muted}>Velg en melding</Text>
                {Platform.OS === 'web' ? (
                  <Text style={styles.hint}>
                    Piltaster blar · Delete sletter · Ctrl+R svar · Ctrl+Shift+R svar alle · Ctrl+Shift+F videresend · N ny e-post
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        </View>
      </View>
      {overlays}
    </Screen>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, minHeight: 0, backgroundColor: colors.card },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
  muted: { color: colors.muted, fontSize: 13 },
  hint: { color: colors.muted, fontSize: 11, textAlign: 'center', maxWidth: 360, lineHeight: 16 },
  ribbon: {
    flexDirection: 'row', alignItems: 'center', gap: 2, flexWrap: 'wrap',
    paddingHorizontal: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.line,
    backgroundColor: colors.card,
  },
  ribbonSep: { width: 1, height: 20, backgroundColor: colors.line, marginHorizontal: 4 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 4,
    paddingHorizontal: 8, height: 32, width: 260, flexShrink: 1, minWidth: 150, backgroundColor: colors.card,
  },
  search: { flex: 1, fontSize: 13, color: colors.ink, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null) },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fff7ed', paddingHorizontal: 10, paddingVertical: 8, marginHorizontal: 10, marginTop: 8, borderRadius: 4,
  },
  bannerTxt: { color: '#9a3412', fontSize: 12, flex: 1 },
  bannerAction: { color: colors.brand, fontSize: 12 },
  panes: { flex: 1, flexDirection: 'row', minHeight: 0, position: 'relative', alignItems: 'stretch' },
  paneScroll: { flex: 1, minHeight: 0 },
  folderScrollInner: { paddingVertical: 8 },
  mobileList: { flex: 1, minHeight: 0, position: 'relative' },
  mobileRead: { flex: 1, minHeight: 0 },
  mobileListPad: { paddingBottom: 88 },
  mobileBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 10, paddingVertical: 6, gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  mobileBarBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  mobileTitle: { fontSize: 20, color: colors.ink, flexShrink: 1 },
  mobileBackTxt: { fontSize: 16, color: colors.brand, flexShrink: 1 },
  mobileBarActions: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 0 },
  mobileSearch: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 10, marginTop: 6,
    borderWidth: 1, borderColor: colors.line, paddingHorizontal: 8, height: 36, backgroundColor: colors.card, borderRadius: 4,
  },
  drawerRoot: { flex: 1, flexDirection: 'row' },
  drawerBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.4)' },
  drawerPanel: { width: '82%', maxWidth: 320, height: '100%', backgroundColor: colors.card, zIndex: 2, paddingTop: 8 },
  drawerHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  drawerTitle: { fontSize: 18, color: colors.ink, flex: 1 },
  drawerClose: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg,
  },
  folderPane: {
    width: MAIL_FOLDER_PANE_DEFAULT, flexShrink: 0, position: 'relative', overflow: 'visible', zIndex: 3, minHeight: 0,
  },
  paneKicker: {
    fontSize: 11, color: colors.muted, letterSpacing: 0.4,
    paddingHorizontal: 12, marginTop: 8, marginBottom: 4, textTransform: 'uppercase',
  },
  accountBlock: { marginBottom: 4 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7 },
  accountOn: { backgroundColor: colors.brandSoft },
  accountLbl: { flex: 1, fontSize: 12, color: colors.ink },
  grantBtn: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 6 },
  grantTxt: { color: colors.brand, fontSize: 12 },
  folderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 10, minHeight: 27,
  },
  folderHover: { backgroundColor: colors.sunken },
  folderOn: { backgroundColor: colors.brandSoft },
  folderChev: { width: 18, height: 24, alignItems: 'center', justifyContent: 'center' },
  folderName: { flex: 1, fontSize: 13, color: colors.ink },
  folderNameOn: { color: colors.brand },
  folderNameUnread: { fontWeight: '600' },
  unread: { fontSize: 11, color: colors.brand, fontWeight: '600' },
  unreadMuted: { color: colors.muted, fontWeight: '400' },
  listPane: {
    width: MAIL_LIST_PANE_DEFAULT, flexShrink: 0, minWidth: 0, minHeight: 0, position: 'relative', overflow: 'visible', zIndex: 2,
    borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.line,
  },
  listHead: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  listTitle: { fontSize: 15, color: colors.ink },
  listSub: { fontSize: 11, color: colors.muted },
  readPane: { flex: 1, minWidth: 0, minHeight: 0, zIndex: 1, overflow: 'hidden' },
  toastWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 24, alignItems: 'center', zIndex: 60,
  },
  toast: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#1f2937',
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6, maxWidth: 520, marginHorizontal: 16,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(15,23,42,0.3)' } : null),
  },
  toastErr: { backgroundColor: '#991b1b' },
  toastTxt: { color: '#fff', fontSize: 13, flexShrink: 1 },
  toastAction: { color: '#93c5fd', fontSize: 13, fontWeight: '600' },
});
