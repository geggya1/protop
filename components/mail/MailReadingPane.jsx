import React, {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import {
  ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../src/theme';
import { sanitizeHtml } from '../../src/utils/sanitizeHtml';
import { senderInitials } from '../../src/utils/mailUi';
import {
  attachmentIcon,
  avatarColor,
  categoryColor,
  formatBytes,
  formatDueDate,
  formatMailDateLong,
  formatRecipient,
  sensitivityLabel,
} from '../../src/utils/mailModel';
import { MailMenuButton, MailToolButton } from './MailMenu';

const FRAME_CSS = `
html,body{margin:0;padding:0;background:#fff}
body{font-family:Calibri,'Segoe UI',Arial,sans-serif;font-size:11pt;color:#1a2744;line-height:1.4;overflow-wrap:anywhere;padding:0 2px 16px}
img{max-width:100%;height:auto}
pre{white-space:pre-wrap}
blockquote{margin:0 0 0 6px;padding-left:10px;border-left:2px solid #d0d7e2}
a{color:#0f6cbd}
`;

export function mailFrameDoc(html) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><base target="_blank"><style>${FRAME_CSS}</style></head><body>${sanitizeHtml(html || '')}</body></html>`;
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Meldingsteksten i en isolert iframe uten skript. Høyden følger innholdet,
 * så hele lesefeltet ruller som én side (som i Outlook).
 */
export function MailBodyFrame({ html, minHeight = 120 }) {
  const ref = useRef(null);
  const [height, setHeight] = useState(minHeight);
  const srcDoc = useMemo(() => mailFrameDoc(html), [html]);

  const measure = useCallback(() => {
    const docEl = ref.current?.contentDocument;
    if (!docEl?.documentElement) return;
    const h = Math.max(docEl.documentElement.scrollHeight, docEl.body?.scrollHeight || 0);
    setHeight(Math.max(minHeight, h + 4));
  }, [minHeight]);

  const onLoad = useCallback(() => {
    measure();
    const docEl = ref.current?.contentDocument;
    if (!docEl) return;
    docEl.querySelectorAll('img').forEach((img) => {
      if (!img.complete) img.addEventListener('load', measure, { once: true });
    });
    if (typeof ResizeObserver !== 'undefined' && docEl.body) {
      const ro = new ResizeObserver(() => measure());
      ro.observe(docEl.body);
      ref.current.__ro?.disconnect?.();
      ref.current.__ro = ro;
    }
  }, [measure]);

  useEffect(() => () => ref.current?.__ro?.disconnect?.(), []);

  if (Platform.OS !== 'web') {
    return <Text style={styles.plain}>{htmlToText(html)}</Text>;
  }
  return React.createElement('iframe', {
    ref,
    title: 'Meldingstekst',
    sandbox: 'allow-same-origin allow-popups allow-popups-to-escape-sandbox',
    srcDoc,
    onLoad,
    style: {
      width: '100%', height, border: 0, display: 'block', background: '#fff',
    },
  });
}

function RecipientLine({ label, list }) {
  if (!list?.length) return null;
  return (
    <Text style={styles.recip} numberOfLines={3}>
      <Text style={styles.recipLbl}>{label}: </Text>
      {list.map((r) => formatRecipient(r)).join('; ')}
    </Text>
  );
}

function InfoBar({ icon, color, children }) {
  return (
    <View style={styles.info}>
      <Ionicons name={icon} size={14} color={color || colors.muted} />
      <Text style={styles.infoTxt}>{children}</Text>
    </View>
  );
}

export default function MailReadingPane({
  message,
  bodyLoading = false,
  master,
  attachmentBusy,
  onReply,
  onReplyAll,
  onForward,
  onOpenAttachment,
  moreItems,
  showActions = true,
  onEditDraft,
}) {
  if (!message) return null;
  const from = message.from || {};
  const color = avatarColor(from.address);
  const files = message.visibleAttachments || [];
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.inner}>
      <Text style={styles.subject} selectable>{message.subject}</Text>
      {(message.categories?.length || (message.sensitivity && message.sensitivity !== 'normal')) ? (
        <View style={styles.tags}>
          {message.sensitivity && message.sensitivity !== 'normal' ? (
            <View style={[styles.tag, styles.tagPrivate]}>
              <Ionicons name="lock-closed" size={11} color={colors.ink} />
              <Text style={styles.tagTxt}>{sensitivityLabel(message.sensitivity)}</Text>
            </View>
          ) : null}
          {(message.categories || []).map((c) => {
            const col = categoryColor(c, master);
            return (
              <View key={c} style={[styles.tag, { borderColor: col, backgroundColor: `${col}1f` }]}>
                <View style={[styles.dot, { backgroundColor: col }]} />
                <Text style={styles.tagTxt}>{c}</Text>
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={styles.head}>
        <View style={[styles.avatar, { backgroundColor: `${color}22` }]}>
          <Text style={[styles.avatarTxt, { color }]}>{senderInitials(from.name, from.address)}</Text>
        </View>
        <View style={styles.headMain}>
          <Text style={styles.from} selectable numberOfLines={2}>
            {from.name || from.address}
            {from.address && from.name ? <Text style={styles.fromAddr}>{` <${from.address}>`}</Text> : null}
          </Text>
          <RecipientLine label="Til" list={message.to} />
          <RecipientLine label="Kopi" list={message.cc} />
          <RecipientLine label="Blindkopi" list={message.bcc} />
        </View>
        <View style={styles.headSide}>
          {showActions ? (
            <View style={styles.actions}>
              {message.isDraft && onEditDraft ? (
                <MailToolButton icon="create-outline" label="Fortsett utkast" onPress={onEditDraft} />
              ) : (
                <>
                  <MailToolButton icon="arrow-undo-outline" label="Svar" onPress={onReply} />
                  <MailToolButton icon="arrow-undo" label="Svar alle" onPress={onReplyAll} />
                  <MailToolButton icon="arrow-redo-outline" label="Videresend" onPress={onForward} />
                </>
              )}
              {moreItems ? (
                <MailMenuButton icon="ellipsis-horizontal" compact accessibilityLabel="Flere handlinger" items={moreItems} />
              ) : null}
            </View>
          ) : null}
          <Text style={styles.date}>{formatMailDateLong(message.receivedAt)}</Text>
        </View>
      </View>

      {message.importance === 'high' ? (
        <InfoBar icon="alert-circle" color={colors.danger}>Denne meldingen ble sendt med høy viktighet.</InfoBar>
      ) : null}
      {message.importance === 'low' ? (
        <InfoBar icon="arrow-down-circle-outline">Denne meldingen ble sendt med lav viktighet.</InfoBar>
      ) : null}
      {message.flagged ? (
        <InfoBar icon="flag" color={colors.danger}>
          {message.flagDue ? `Følg opp. Forfaller ${formatDueDate(message.flagDue)}.` : 'Følg opp.'}
        </InfoBar>
      ) : null}
      {message.flagStatus === 'complete' ? (
        <InfoBar icon="checkmark-circle" color={colors.success}>Oppfølgingen er fullført.</InfoBar>
      ) : null}
      {message.sensitivity && message.sensitivity !== 'normal' ? (
        <InfoBar icon="lock-closed-outline">{`Merk at denne meldingen er merket som ${sensitivityLabel(message.sensitivity)}.`}</InfoBar>
      ) : null}
      {message.readReceipt && !message.isDraft ? (
        <InfoBar icon="mail-open-outline">Avsenderen har bedt om lesekvittering.</InfoBar>
      ) : null}

      {files.length ? (
        <View style={styles.files}>
          {files.map((a) => (
            <Pressable
              key={a.id}
              onPress={() => onOpenAttachment?.(a)}
              accessibilityRole="button"
              accessibilityLabel={`Åpne vedlegg ${a.name}`}
              style={({ hovered }) => [styles.file, hovered && styles.fileHover]}
            >
              {attachmentBusy === a.id ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Ionicons name={attachmentIcon(a.name, a.contentType)} size={18} color={colors.brand} />
              )}
              <View style={{ flexShrink: 1, minWidth: 0 }}>
                <Text style={styles.fileName} numberOfLines={1}>{a.name}</Text>
                <Text style={styles.fileSize}>{formatBytes(a.size)}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}

      <View style={styles.bodyWrap}>
        {bodyLoading && !message.full ? (
          <View style={styles.bodyLoading}>
            <Text style={styles.previewTxt}>{message.preview}</Text>
            <ActivityIndicator size="small" color={colors.brand} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
          </View>
        ) : (
          <MailBodyFrame html={message.html} />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, minHeight: 0 },
  inner: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 32 },
  subject: { fontSize: 19, color: colors.ink, marginBottom: 6, lineHeight: 25 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  tag: {
    flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 7, paddingVertical: 2, borderColor: colors.line,
  },
  tagPrivate: { backgroundColor: colors.sunken },
  tagTxt: { fontSize: 11, color: colors.ink },
  dot: { width: 8, height: 8, borderRadius: 2 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4, marginBottom: 10, flexWrap: 'wrap' },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { fontSize: 14, fontWeight: '600' },
  headMain: { flex: 1, minWidth: 200, gap: 2 },
  from: { fontSize: 14, color: colors.ink },
  fromAddr: { fontSize: 13, color: colors.muted },
  recip: { fontSize: 12, color: colors.muted },
  recipLbl: { color: colors.muted },
  headSide: { alignItems: 'flex-end', gap: 4, marginLeft: 'auto' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 2, flexWrap: 'wrap', justifyContent: 'flex-end' },
  date: { fontSize: 12, color: colors.muted },
  info: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.sunken,
    paddingHorizontal: 10, paddingVertical: 6, marginBottom: 6, borderRadius: 4,
  },
  infoTxt: { fontSize: 12, color: colors.ink, flex: 1 },
  files: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  file: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line,
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, maxWidth: 260, backgroundColor: colors.card,
  },
  fileHover: { backgroundColor: colors.sunken },
  fileName: { fontSize: 12, color: colors.ink },
  fileSize: { fontSize: 11, color: colors.muted },
  bodyWrap: {
    marginTop: 6, backgroundColor: '#fff', borderRadius: 4, overflow: 'hidden',
  },
  bodyLoading: { padding: 4 },
  previewTxt: { fontSize: 14, color: '#1a2744', lineHeight: 20 },
  plain: { fontSize: 14, color: colors.ink, lineHeight: 20 },
});
