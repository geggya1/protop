import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useUnread } from '../../src/context/NotificationContext';
import { useI18n } from '../../src/i18n';
import { colors, useLayout } from '../../src/theme';
import { Screen, Mute } from '../../components/ui';
import ShellHeader from '../../components/ShellHeader';
import { Ionicons } from '@expo/vector-icons';
import { navigateFromNotification } from '../../src/navigation/navRef';
import {
  markNotificationSeen,
  moduleForNotification,
} from '../../src/utils/notifications';
import { notificationNavPayload } from '../../src/utils/inAppNotifications';
import { isFriendChatNavPayload, friendUidFromNavPayload } from '../../src/utils/friendsLogic';
import { listenIncomingFamilyInvites } from '../../src/utils/groups';
import {
  listenIncomingGameInvites,
  listenFamilyPendingGameInvites,
  GAME_TYPE_LABELS,
} from '../../src/utils/familyGamesShared';

const CATEGORY_META = {
  members: { label: 'Familie', icon: 'people-outline' },
  chat: { label: 'Chat', icon: 'chatbubbles-outline' },
  plan: { label: 'Kalender', icon: 'calendar-outline' },
  stars: { label: 'Oppgaver', icon: 'star-outline' },
  chores: { label: 'Gjøremål', icon: 'checkmark-circle-outline' },
  notes: { label: 'Notater', icon: 'document-text-outline' },
  wishes: { label: 'Gaveønsker', icon: 'gift-outline' },
  games: { label: 'FamilieSpill', icon: 'game-controller-outline' },
  progress: { label: 'Attestering', icon: 'shield-checkmark-outline' },
  rememberDates: { label: 'Bursdag', icon: 'gift-outline' },
  other: { label: 'Annet', icon: 'notifications-outline' },
};

function categoryForNotification(n) {
  return moduleForNotification(n) || 'other';
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  if (value instanceof Date) return value.getTime();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function dayBucket(ms) {
  if (!ms) return 'older';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startYesterday = startToday - 86400000;
  if (ms >= startToday) return 'today';
  if (ms >= startYesterday) return 'yesterday';
  return 'older';
}

const DAY_LABELS = {
  today: 'I dag',
  yesterday: 'I går',
  older: 'Tidligere',
};

function formatWhen(value) {
  const ms = toMillis(value);
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  if (isYesterday) return `I går ${time}`;
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** Samle chat-varsler per tråd; øvrige én-og-én. */
function collapseItems(list) {
  const out = [];
  const chatBuckets = new Map();

  for (const n of list) {
    const isChat = !!(n.chatId || n.eventType === 'messageReceived');
    if (isChat && n.chatId) {
      const key = `chat:${n.familyId || ''}:${n.chatId}`;
      if (!chatBuckets.has(key)) {
        chatBuckets.set(key, []);
        out.push({ kind: 'chatGroup', key });
      }
      chatBuckets.get(key).push(n);
      continue;
    }
    out.push({ kind: 'single', key: n.id, item: n });
  }

  return out.map((entry) => {
    if (entry.kind === 'single') {
      const n = entry.item;
      const cat = categoryForNotification(n);
      return {
        id: n.id,
        kind: 'single',
        category: cat,
        title: n.title || 'Varsel',
        body: n.body || '',
        createdAt: n.createdAt,
        seen: n.seen === true,
        count: 1,
        ids: [n.id],
        source: n,
      };
    }
    const rows = (chatBuckets.get(entry.key) || []).slice().sort(
      (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt),
    );
    const latest = rows[0];
    const unreadCount = rows.filter((r) => r.seen !== true).length;
    const chatTitle = latest.chatTitle
      || latest.senderName
      || (latest.title && latest.title !== 'Ny melding' ? latest.title : null)
      || 'Chat';
    const count = rows.length;
    return {
      id: entry.key,
      kind: 'chatGroup',
      category: 'chat',
      title: chatTitle,
      body: count > 1
        ? `${count} meldinger · ${latest.body || 'Ny melding'}`
        : (latest.body || 'Ny melding'),
      createdAt: latest.createdAt,
      seen: unreadCount === 0,
      count,
      unreadCount,
      ids: rows.map((r) => r.id),
      source: latest,
    };
  });
}

function NotificationRow({ row, onPress, compact }) {
  const unread = !row.seen;
  const meta = CATEGORY_META[row.category] || CATEGORY_META.other;
  return (
    <TouchableOpacity
      onPress={() => onPress(row)}
      activeOpacity={0.8}
      style={[styles.row, compact && styles.rowDesk, unread && styles.rowUnread]}
      accessibilityRole="button"
      accessibilityLabel={`${row.title}. ${meta.label}`}
    >
      <View style={[styles.rowIcon, unread && styles.rowIconUnread]}>
        <Ionicons
          name={meta.icon}
          size={compact ? 16 : 18}
          color={unread ? colors.brand : colors.muted}
        />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Text style={[styles.rowTitle, compact && styles.rowTitleDesk]} numberOfLines={1}>
            {row.title}
          </Text>
          {!!formatWhen(row.createdAt) && (
            <Text style={styles.rowWhen}>{formatWhen(row.createdAt)}</Text>
          )}
        </View>
        <View style={styles.rowMeta}>
          <Text style={styles.rowCat} numberOfLines={1}>{meta.label}</Text>
          {row.count > 1 ? (
            <View style={styles.countPill}>
              <Text style={styles.countPillTxt}>{row.count}</Text>
            </View>
          ) : null}
        </View>
        {!!row.body && (
          <Text style={[styles.rowBodyTxt, compact && styles.rowBodyTxtDesk]} numberOfLines={2}>
            {row.body}
          </Text>
        )}
      </View>
      {unread ? <View style={styles.unreadDot} /> : (
        <Ionicons name="checkmark-done" size={16} color={colors.muted} />
      )}
    </TouchableOpacity>
  );
}

export default function NotificationsScreen() {
  const nav = useNavigation();
  const { t } = useI18n();
  const { isDesktop } = useLayout();
  const { uid, familyId, requestShellTab } = useApp();
  const { items, unreadTotal } = useUnread();
  const [familyInvites, setFamilyInvites] = useState([]);
  const [gameInvites, setGameInvites] = useState([]);
  const [familyGameInvites, setFamilyGameInvites] = useState([]);

  useEffect(() => {
    if (!uid) {
      setFamilyInvites([]);
      return undefined;
    }
    return listenIncomingFamilyInvites(uid, setFamilyInvites);
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setGameInvites([]);
      return undefined;
    }
    return listenIncomingGameInvites(uid, setGameInvites);
  }, [uid]);

  useEffect(() => {
    if (!uid || !familyId) {
      setFamilyGameInvites([]);
      return undefined;
    }
    return listenFamilyPendingGameInvites(familyId, uid, setFamilyGameInvites);
  }, [uid, familyId]);

  const mergedGameInvites = useMemo(() => {
    const byKey = new Map();
    [...(gameInvites || []), ...(familyGameInvites || [])].forEach((inv) => {
      const key = inv.inviteId || inv.id || `${inv.gameType}_${inv.gameId}`;
      if (!key || byKey.has(key)) return;
      byKey.set(key, inv);
    });
    return [...byKey.values()];
  }, [gameInvites, familyGameInvites]);

  const goHome = useCallback(() => {
    if (nav.canGoBack?.()) nav.goBack();
    else requestShellTab?.('home');
  }, [nav, requestShellTab]);

  const openSource = useCallback(async (n) => {
    // Chat → tråd / dock (friend vs family — same path as toast/push)
    if (n.chatId || n.eventType === 'messageReceived') {
      if (n.chatId) {
        const chatTitle = n.chatTitle || n.senderName || n.title || 'Chat';
        const title = chatTitle === 'Ny melding' ? 'Chat' : chatTitle;
        if (navigateFromNotification({
          ...notificationNavPayload(n),
          eventType: n.eventType || 'messageReceived',
          chatId: n.chatId,
          familyId: n.familyId || null,
          title,
        })) {
          return;
        }
        if (isFriendChatNavPayload(n)) {
          const friendUid = friendUidFromNavPayload(n, uid);
          nav.navigate('FriendChatThread', {
            chatId: n.chatId,
            friendUid,
            title,
          });
          return;
        }
        nav.navigate('ChatThread', {
          familyId: n.familyId,
          chatId: n.chatId,
          title,
        });
        return;
      }
      nav.navigate('Home', { openShell: { tab: 'chat' } });
      return;
    }

    if (n.eventType === 'familyInvite' && n.familyId && n.inviteId) {
      nav.navigate('FamilyInviteRespond', {
        familyId: n.familyId,
        inviteId: n.inviteId,
      });
      return;
    }

    if (n.eventType === 'gameInvite') {
      if (navigateFromNotification(n)) return;
    }

    if (n.eventType === 'taskReceived' || n.taskId) {
      nav.navigate('Home', { openShell: { tab: 'stars' } });
      return;
    }
    if (n.eventType === 'choreReceived' || n.choreId) {
      nav.navigate('Home', { openShell: { tab: 'chores' } });
      return;
    }
    if (n.eventType === 'eventCreated' || n.eventId) {
      nav.navigate('Home', { openShell: { tab: 'plan' } });
      return;
    }
    if (n.eventType === 'noteShared' || n.noteId) {
      nav.navigate('Home', { openShell: { tab: 'notes' } });
      return;
    }
    if (n.eventType === 'wishReserved' || n.eventType === 'wishPurchased' || n.eventType === 'wishShared'
      || n.wishlistId || n.wishId) {
      nav.navigate('Home', { openShell: { tab: 'more', subView: 'wishes' } });
      return;
    }
    if (n.eventType === 'attestPending') {
      nav.navigate('Home', { openShell: { tab: 'more', subView: 'progress', intent: 'attest' } });
      return;
    }
    if (n.eventType === 'birthdayReminder') {
      if (navigateFromNotification(n)) return;
    }

    if (navigateFromNotification(n)) return;
    goHome();
  }, [nav, goHome]);

  const openRow = useCallback(async (row) => {
    if (uid) {
      await Promise.all(
        (row.ids || [])
          .filter(Boolean)
          .map((id) => markNotificationSeen(uid, id).catch(() => {})),
      );
    }
    await openSource(row.source);
  }, [uid, openSource]);

  const openFamilyInvite = useCallback((inv) => {
    nav.navigate('FamilyInviteRespond', {
      familyId: inv.familyId,
      inviteId: inv.inviteId || inv.id,
    });
  }, [nav]);

  const openGameInvite = useCallback((inv) => {
    if (navigateFromNotification({
      eventType: 'gameInvite',
      familyId: inv.familyId,
      gameId: inv.gameId,
      gameType: inv.gameType,
    })) return;
    nav.navigate('Home', { openShell: { tab: 'more', subView: 'games' } });
  }, [nav]);

  // Grupper: uleste øverst, deretter etter dag. Chat kollapses per tråd.
  const grouped = useMemo(() => {
    const unread = [];
    const byDay = { today: [], yesterday: [], older: [] };
    for (const n of items) {
      if (n.seen !== true) unread.push(n);
      else byDay[dayBucket(toMillis(n.createdAt))].push(n);
    }
    const sortNewest = (a, b) => toMillis(b.createdAt) - toMillis(a.createdAt);
    unread.sort(sortNewest);
    for (const key of Object.keys(byDay)) byDay[key].sort(sortNewest);

    const sections = [];
    const unreadRows = collapseItems(unread);
    if (unreadRows.length) {
      sections.push({
        key: 'unread',
        label: 'Ulest',
        icon: 'mail-unread-outline',
        rows: unreadRows,
        unread: unread.length,
        highlight: true,
      });
    }
    for (const key of ['today', 'yesterday', 'older']) {
      const list = byDay[key].filter((n) => n.seen === true);
      if (!list.length) continue;
      const rows = collapseItems(list);
      if (!rows.length) continue;
      sections.push({
        key,
        label: DAY_LABELS[key],
        icon: key === 'today' ? 'today-outline' : 'time-outline',
        rows,
        unread: 0,
        highlight: false,
      });
    }
    return sections;
  }, [items]);

  const hasContent = grouped.length > 0 || familyInvites.length > 0 || mergedGameInvites.length > 0;

  return (
    <Screen>
      <ShellHeader
        title="Varslinger"
        onLogoHome={goHome}
        titleRight={
          unreadTotal > 0 ? (
            <View style={styles.headerBadge}>
              <Text style={styles.headerBadgeTxt}>{unreadTotal}</Text>
            </View>
          ) : null
        }
      />
      <ScrollView
        contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}
        showsVerticalScrollIndicator={false}
      >
        <Mute style={isDesktop && styles.muteDesk}>
          Trykk for å åpne opphavet — chat, kalender, oppgaver m.m.
        </Mute>

        {familyInvites.length > 0 ? (
          <View style={[styles.listCard, isDesktop && styles.listCardDesk, styles.inviteCard]}>
            <View style={styles.sectionHead}>
              <Ionicons name="people-outline" size={16} color={colors.brand} />
              <Text style={[styles.sectionTitle, isDesktop && styles.sectionTitleDesk]}>
                {t('member.pendingInvites')}
              </Text>
            </View>
            {familyInvites.map((inv, idx) => (
              <TouchableOpacity
                key={inv.id}
                onPress={() => openFamilyInvite(inv)}
                activeOpacity={0.8}
                style={[
                  styles.inviteRow,
                  isDesktop && styles.inviteRowDesk,
                  idx < familyInvites.length - 1 && styles.rowDivider,
                ]}
              >
                <View style={styles.inviteIcon}>
                  <Ionicons name="mail-open-outline" size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {inv.familyName || t('group.family')}
                  </Text>
                  <Text style={styles.rowBodyTxt}>{t('member.familyInviteHint')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {mergedGameInvites.length > 0 ? (
          <View style={[styles.listCard, isDesktop && styles.listCardDesk, styles.inviteCard]}>
            <View style={styles.sectionHead}>
              <Ionicons name="game-controller-outline" size={16} color={colors.brand} />
              <Text style={[styles.sectionTitle, isDesktop && styles.sectionTitleDesk]}>
                Spillinvitasjoner
              </Text>
            </View>
            {mergedGameInvites.map((inv, idx) => (
              <TouchableOpacity
                key={inv.id || `${inv.gameType}_${inv.gameId}`}
                onPress={() => openGameInvite(inv)}
                activeOpacity={0.8}
                style={[
                  styles.inviteRow,
                  isDesktop && styles.inviteRowDesk,
                  idx < mergedGameInvites.length - 1 && styles.rowDivider,
                ]}
              >
                <View style={styles.inviteIcon}>
                  <Ionicons name="game-controller-outline" size={18} color={colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {inv.gameTitle || GAME_TYPE_LABELS[inv.gameType] || 'Familiespill'}
                  </Text>
                  <Text style={styles.rowBodyTxt}>
                    {inv.hostName ? `${inv.hostName} inviterer deg` : 'Ny spillinvitasjon'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {!hasContent ? (
          <View style={[styles.listCard, isDesktop && styles.listCardDesk, styles.emptyCard]}>
            <Ionicons name="notifications-off-outline" size={28} color={colors.muted} />
            <Text style={styles.emptyTxt}>Ingen varsler ennå.</Text>
          </View>
        ) : (
          grouped.map((section) => (
            <View
              key={section.key}
              style={[
                styles.listCard,
                isDesktop && styles.listCardDesk,
                section.highlight && styles.listCardHighlight,
              ]}
            >
              <View style={styles.sectionHead}>
                <Ionicons name={section.icon} size={16} color={colors.brand} />
                <Text style={[styles.sectionTitle, isDesktop && styles.sectionTitleDesk]}>
                  {section.label}
                </Text>
                {section.unread > 0 ? (
                  <View style={styles.sectionBadge}>
                    <Text style={styles.sectionBadgeTxt}>{section.unread}</Text>
                  </View>
                ) : null}
              </View>
              {section.rows.map((row, idx) => (
                <View key={row.id}>
                  <NotificationRow row={row} onPress={openRow} compact={isDesktop} />
                  {idx < section.rows.length - 1 ? <View style={styles.rowDivider} /> : null}
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40, gap: 12 },
  bodyDesk: { padding: 12, gap: 10, maxWidth: 720, width: '100%', alignSelf: 'center' },
  headerBadge: {
    backgroundColor: colors.brand,
    borderRadius: 999,
    minWidth: 24,
    height: 24,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeTxt: { color: '#fff', fontWeight: '800', fontSize: 12 },
  muteDesk: { fontSize: 12 },
  listCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  listCardDesk: { borderRadius: 8, padding: 10 },
  listCardHighlight: {
    borderColor: '#bfdbfe',
    backgroundColor: '#f8fbff',
  },
  inviteCard: { borderColor: '#bfdbfe' },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontWeight: '600',
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    flex: 1,
  },
  sectionTitleDesk: { fontWeight: '500', fontSize: 11 },
  sectionBadge: {
    backgroundColor: colors.brandSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sectionBadgeTxt: { color: colors.brand, fontWeight: '800', fontSize: 11 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
  },
  rowDesk: { paddingVertical: 8, gap: 8 },
  rowUnread: {},
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowIconUnread: { backgroundColor: colors.brandSoft, borderColor: '#bfdbfe' },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  rowTitle: { fontWeight: '700', color: colors.ink, fontSize: 14, flex: 1 },
  rowTitleDesk: { fontSize: 13 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  rowCat: { fontSize: 11, fontWeight: '600', color: colors.brand },
  countPill: {
    backgroundColor: colors.brandSoft,
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  countPillTxt: { fontSize: 10, fontWeight: '800', color: colors.brand },
  rowWhen: { fontSize: 11, fontWeight: '600', color: colors.muted, flexShrink: 0 },
  rowBodyTxt: { color: colors.muted, fontWeight: '500', fontSize: 13, marginTop: 2 },
  rowBodyTxtDesk: { fontSize: 12 },
  rowDivider: { height: 1, backgroundColor: colors.line, marginLeft: 44 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.brand, marginTop: 6 },
  inviteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  inviteRowDesk: { paddingVertical: 8 },
  inviteIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
  },
  emptyCard: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyTxt: { color: colors.muted, fontWeight: '600', fontSize: 14 },
});
