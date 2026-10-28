import React, { memo, useCallback, useRef } from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
import { formatMailWhen } from '../../src/utils/outlookMail';
import { senderInitials } from '../../src/utils/mailUi';
import { avatarColor, categoryColor, recipientLabel } from '../../src/utils/mailModel';
import useDomHover from './useDomHover';

function HoverIcon({ icon, color, label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ hovered }) => [styles.hoverBtn, hovered && styles.hoverBtnOn]}
    >
      <Ionicons name={icon} size={15} color={color || colors.ink} />
    </Pressable>
  );
}

function CategoryChips({ categories, master }) {
  if (!categories?.length) return null;
  return (
    <View style={styles.cats}>
      {categories.slice(0, 3).map((c) => {
        const col = categoryColor(c, master);
        return (
          <View key={c} style={[styles.cat, { borderColor: col, backgroundColor: `${col}1f` }]}>
            <Text style={[styles.catTxt, { color: col }]} numberOfLines={1}>{c}</Text>
          </View>
        );
      })}
      {categories.length > 3 ? <Text style={styles.catMore}>+{categories.length - 3}</Text> : null}
    </View>
  );
}

const MessageRow = memo(function MessageRow({
  message: m, selected, compact, showRecipients, folderLabel, master, handlers,
}) {
  const anchorRef = useRef(null);
  const onEnter = useCallback(() => handlers.onPrefetch(m.id), [handlers, m.id]);
  const hovered = useDomHover(anchorRef, onEnter);
  const who = showRecipients
    ? `Til: ${(m.to || []).map(recipientLabel).filter(Boolean).join('; ') || '—'}`
    : (m.from?.name || m.from?.address || 'Ukjent');
  const avatarSrc = showRecipients ? m.to?.[0] : m.from;
  const openMenu = () => {
    const node = anchorRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x, y, w, h) => handlers.onMenu(m, { x: x + w - 240, y, w, h }));
    } else {
      handlers.onMenu(m, { x: 16, y: 120, w: 0, h: 0 });
    }
  };
  // Ingen knapp-rolle på raden: den har egne knapper inni, og knapp i knapp er ugyldig HTML.
  return (
    <Pressable
      ref={anchorRef}
      onPress={() => handlers.onOpen(m.id)}
      onLongPress={openMenu}
      accessibilityState={{ selected }}
      accessibilityLabel={`${m.isRead ? '' : 'Ulest. '}${who}. ${m.subject}`}
      style={[
        styles.row,
        compact && styles.rowCompact,
        hovered && styles.rowHover,
        selected && styles.rowOn,
      ]}
    >
      <>
        <View style={[styles.bar, !m.isRead && styles.barUnread]} />
        {!compact ? (
          <View style={[styles.avatar, { backgroundColor: `${avatarColor(avatarSrc?.address)}22` }]}>
            <Text style={[styles.avatarTxt, { color: avatarColor(avatarSrc?.address) }]}>
              {senderInitials(avatarSrc?.name, avatarSrc?.address)}
            </Text>
          </View>
        ) : null}
        <View style={styles.body}>
          <View style={styles.top}>
            <Text style={[styles.from, !m.isRead && styles.strong]} numberOfLines={1}>
              {m.isDraft ? <Text style={styles.draft}>[Utkast] </Text> : null}
              {who}
            </Text>
            {hovered && Platform.OS === 'web' ? (
              <View style={styles.hoverRow}>
                <HoverIcon icon="trash-outline" label="Slett" onPress={() => handlers.onAction('delete', m)} />
                <HoverIcon
                  icon={m.isRead ? 'mail-unread-outline' : 'mail-open-outline'}
                  label={m.isRead ? 'Merk som ulest' : 'Merk som lest'}
                  onPress={() => handlers.onAction('toggleRead', m)}
                />
                <HoverIcon
                  icon={m.flagged ? 'flag' : 'flag-outline'}
                  color={m.flagged ? colors.danger : colors.ink}
                  label={m.flagged ? 'Fjern flagg' : 'Flagg'}
                  onPress={() => handlers.onAction('toggleFlag', m)}
                />
                <HoverIcon icon="ellipsis-horizontal" label="Flere valg" onPress={openMenu} />
              </View>
            ) : (
              <View style={styles.meta}>
                {m.importance === 'high' ? <Ionicons name="alert" size={13} color={colors.danger} /> : null}
                {m.importance === 'low' ? <Ionicons name="arrow-down" size={12} color={colors.muted} /> : null}
                {m.hasAttachments ? <Ionicons name="attach" size={14} color={colors.muted} /> : null}
                {m.flagged ? <Ionicons name="flag" size={13} color={colors.danger} /> : null}
                {m.flagStatus === 'complete' ? <Ionicons name="checkmark-circle" size={13} color={colors.success} /> : null}
                <Text style={[styles.when, !m.isRead && styles.whenUnread]}>{formatMailWhen(m.receivedAt)}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.subject, !m.isRead && styles.subjectUnread]} numberOfLines={1}>{m.subject}</Text>
          {!compact ? <Text style={styles.preview} numberOfLines={2}>{m.preview || ' '}</Text> : null}
          {folderLabel ? <Text style={styles.folderLbl} numberOfLines={1}>{folderLabel}</Text> : null}
          <CategoryChips categories={m.categories} master={master} />
        </View>
      </>
    </Pressable>
  );
});

export default function MailMessageList({
  rows,
  selectedId,
  compact = false,
  showRecipients = false,
  folderNameOf,
  master,
  handlers,
  loading = false,
  emptyText,
  hasMore = false,
  moreBusy = false,
  onEndReached,
  header = null,
  contentStyle,
}) {
  const endRef = useRef(0);
  const onScroll = (e) => {
    if (!hasMore || moreBusy || !onEndReached) return;
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height < contentSize.height - 400) return;
    const now = Date.now();
    if (now - endRef.current < 800) return;
    endRef.current = now;
    onEndReached();
  };
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={contentStyle}
      onScroll={onScroll}
      scrollEventThrottle={64}
      keyboardShouldPersistTaps="handled"
    >
      {header}
      {!rows.length ? (
        loading ? (
          <View style={styles.loading}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={styles.skeleton}>
                <View style={styles.skelAvatar} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={[styles.skelLine, { width: '45%' }]} />
                  <View style={[styles.skelLine, { width: '80%' }]} />
                  <View style={[styles.skelLine, { width: '65%' }]} />
                </View>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Ionicons name="mail-open-outline" size={28} color={colors.line} />
            <Text style={styles.emptyTxt}>{emptyText}</Text>
          </View>
        )
      ) : rows.map((row) => (
        row.type === 'head' ? (
          <Text key={row.id} style={styles.section}>{row.label}</Text>
        ) : (
          <MessageRow
            key={row.id}
            message={row.message}
            selected={row.id === selectedId}
            compact={compact}
            showRecipients={showRecipients}
            folderLabel={folderNameOf ? folderNameOf(row.message.parentFolderId) : ''}
            master={master}
            handlers={handlers}
          />
        )
      ))}
      {rows.length && hasMore ? (
        <Pressable style={styles.more} onPress={onEndReached} disabled={moreBusy}>
          {moreBusy ? <ActivityIndicator size="small" color={colors.brand} /> : null}
          <Text style={styles.moreTxt}>{moreBusy ? 'Laster flere…' : 'Last flere meldinger'}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  section: {
    fontSize: 11, color: colors.muted, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4,
    backgroundColor: colors.card,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    paddingRight: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
    backgroundColor: colors.card,
  },
  rowCompact: { paddingVertical: 6 },
  rowHover: { backgroundColor: colors.sunken },
  rowOn: { backgroundColor: colors.brandSoft },
  bar: { width: 3, alignSelf: 'stretch', backgroundColor: 'transparent' },
  barUnread: { backgroundColor: colors.brand },
  avatar: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  avatarTxt: { fontSize: 12, fontWeight: '600' },
  body: { flex: 1, minWidth: 0 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 20 },
  from: { flex: 1, fontSize: 13, color: colors.ink },
  strong: { fontWeight: '600' },
  draft: { color: colors.danger, fontWeight: '400' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  when: { fontSize: 11, color: colors.muted },
  whenUnread: { color: colors.brand, fontWeight: '600' },
  hoverRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  hoverBtn: { width: 24, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  hoverBtnOn: { backgroundColor: colors.line },
  subject: { fontSize: 13, color: colors.ink, marginTop: 1 },
  subjectUnread: { color: colors.brand, fontWeight: '600' },
  preview: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 16 },
  folderLbl: { fontSize: 11, color: colors.muted, marginTop: 2, fontStyle: 'italic' },
  cats: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  cat: { borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, maxWidth: 140 },
  catTxt: { fontSize: 10 },
  catMore: { fontSize: 10, color: colors.muted, alignSelf: 'center' },
  loading: { paddingTop: 4 },
  skeleton: { flexDirection: 'row', gap: 10, padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  skelAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.sunken },
  skelLine: { height: 9, borderRadius: 4, backgroundColor: colors.sunken },
  empty: { alignItems: 'center', gap: 8, padding: 28 },
  emptyTxt: { fontSize: 13, color: colors.muted, textAlign: 'center' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, justifyContent: 'center' },
  moreTxt: { color: colors.brand, fontSize: 13 },
});
