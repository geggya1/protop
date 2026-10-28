import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Platform, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { colors } from '../src/theme';
import MailRichEditor from './MailRichEditor';
import MailRecipientField from './mail/MailRecipientField';
import { MailMenuButton, MailToolButton } from './mail/MailMenu';
import { MailBodyFrame } from './mail/MailReadingPane';
import { signatureBlockHtml } from '../src/utils/mailSignature';
import {
  SENSITIVITY_OPTIONS,
  attachmentIcon,
  formatBytes,
  formatQuoteDate,
  quoteHeaderHtml,
  sensitivityLabel,
} from '../src/utils/mailModel';
import { MAIL_FILE_MAX } from '../src/utils/mailGraph';

function readBlobAsDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

let fileSeq = 0;

export async function fileToAttachment(file) {
  const dataUrl = await readBlobAsDataUrl(file);
  fileSeq += 1;
  return {
    key: `f${Date.now()}-${fileSeq}`,
    name: file.name || 'vedlegg',
    contentType: file.type || 'application/octet-stream',
    size: Number(file.size || 0),
    contentBytes: dataUrl.replace(/^data:[^,]*,/, ''),
  };
}

function formatTime(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function Field({ label, children, right }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLbl}>{label}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>{children}</View>
      {right}
    </View>
  );
}

/**
 * Skrivevindu som i Outlook: mottakere med forslag, formatering, vedlegg,
 * signatur i teksten, viktighet, følsomhet, kvitteringer og utkast i Kladd.
 */
export default function MailComposeBox({
  compose,
  prefs,
  accounts = [],
  contacts = [],
  busy,
  onChange,
  onSend,
  onSaveDraft,
  onDiscard,
  onClose,
  onOpenSettings,
  onNotice,
}) {
  const win = useWindowDimensions();
  const editorRef = useRef(null);
  const fileRef = useRef(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [attachBusy, setAttachBusy] = useState(false);
  const phone = win.width < 760;
  const isReply = compose.mode === 'reply' || compose.mode === 'replyAll' || compose.mode === 'forward';
  const account = accounts.find((a) => a.id === compose.accountId) || accounts[0] || null;
  const latest = useRef(compose);
  latest.current = compose;

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !latest.current.minimized) {
        e.preventDefault();
        setConfirmClose(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (compose.focusBody) setTimeout(() => editorRef.current?.focus?.(), 60);
    // Bare når vinduet åpnes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = async (files) => {
    const list = [...(files || [])];
    if (!list.length) return;
    setAttachBusy(true);
    try {
      const out = [];
      for (const f of list) {
        if (Number(f.size || 0) > MAIL_FILE_MAX) {
          onNotice?.(`${f.name} er større enn 25 MB og kan ikke sendes på e-post.`);
          continue;
        }
        out.push(await fileToAttachment(f));
      }
      if (out.length) onChange({ files: [...(latest.current.files || []), ...out], dirty: true });
    } catch {
      onNotice?.('Klarte ikke lese filen.');
    } finally {
      setAttachBusy(false);
    }
  };

  const pickFiles = async () => {
    if (Platform.OS === 'web') {
      fileRef.current?.click();
      return;
    }
    const res = await DocumentPicker.getDocumentAsync({ multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return;
    const blobs = await Promise.all((res.assets || []).map(async (a) => {
      const blob = await (await fetch(a.uri)).blob();
      return Object.assign(blob, { name: a.name, type: a.mimeType || blob.type, size: a.size || blob.size });
    }));
    addFiles(blobs);
  };

  const removeFile = (key) => {
    onChange({ files: (compose.files || []).filter((f) => f.key !== key), removedFile: key, dirty: true });
  };

  const pickSignature = (sig) => {
    editorRef.current?.setSignature?.(sig ? signatureBlockHtml(sig.html) : '');
    onChange({ signatureId: sig?.id || '', dirty: true });
  };

  const requestClose = () => {
    if (compose.dirty) setConfirmClose(true);
    else onClose();
  };

  const signatureItems = () => [
    ...(prefs?.signatures || []).map((s) => ({
      id: s.id, label: s.name, icon: 'create-outline', checked: compose.signatureId === s.id, onPress: () => pickSignature(s),
    })),
    { id: 'none', label: 'Ingen signatur', icon: 'remove-circle-outline', checked: !compose.signatureId, onPress: () => pickSignature(null) },
    { divider: true },
    { id: 'edit', label: 'Rediger signaturer…', icon: 'settings-outline', onPress: onOpenSettings },
  ];

  const sensitivityItems = () => SENSITIVITY_OPTIONS.map((o) => ({
    id: o.id,
    label: o.label,
    checked: (compose.sensitivity || 'normal') === o.id,
    onPress: () => onChange({ sensitivity: o.id, dirty: true }),
  }));

  const trackingItems = () => [
    {
      id: 'read', label: 'Be om lesekvittering', icon: 'mail-open-outline', checked: !!compose.readReceipt,
      onPress: () => onChange({ readReceipt: !compose.readReceipt, dirty: true }),
    },
    {
      id: 'delivery', label: 'Be om leveringskvittering', icon: 'checkmark-done-outline', checked: !!compose.deliveryReceipt,
      onPress: () => onChange({ deliveryReceipt: !compose.deliveryReceipt, dirty: true }),
    },
  ];

  if (compose.minimized) {
    return (
      <View style={[styles.miniWrap, phone && styles.miniPhone]} pointerEvents="box-none">
        <Pressable style={styles.mini} onPress={() => onChange({ minimized: false })} accessibilityLabel="Åpne skrivevinduet">
          <Ionicons name="create-outline" size={16} color="#fff" />
          <Text style={styles.miniTxt} numberOfLines={1}>{compose.subject || compose.title}</Text>
          <Pressable onPress={() => onChange({ minimized: false })} hitSlop={6} accessibilityLabel="Gjenopprett">
            <Ionicons name="chevron-up" size={16} color="#fff" />
          </Pressable>
        </Pressable>
      </View>
    );
  }

  const cardSize = phone || compose.maximized
    ? styles.cardFull
    : { width: Math.min(1000, win.width - 48), height: Math.min(900, win.height - 48) };

  const card = (
    <View style={[styles.card, cardSize]}>
      <View style={styles.head}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker} numberOfLines={1}>{account?.email || 'Outlook'}</Text>
          <Text style={styles.title} numberOfLines={1}>{compose.subject || compose.title}</Text>
        </View>
        <MailToolButton icon="save-outline" label={phone ? '' : 'Lagre utkast'} compact={phone} onPress={onSaveDraft} accessibilityLabel="Lagre utkast" />
        {!phone ? (
          <>
            <MailToolButton icon="remove" compact accessibilityLabel="Minimer" onPress={() => onChange({ minimized: true })} />
            <MailToolButton
              icon={compose.maximized ? 'contract-outline' : 'expand-outline'}
              compact
              accessibilityLabel={compose.maximized ? 'Gjenopprett størrelse' : 'Maksimer'}
              onPress={() => onChange({ maximized: !compose.maximized })}
            />
          </>
        ) : null}
        <MailToolButton icon="close" compact accessibilityLabel="Lukk" onPress={requestClose} />
      </View>

      <View style={styles.ribbon}>
        <MailToolButton icon="attach" label="Legg ved fil" onPress={pickFiles} />
        <MailMenuButton icon="create-outline" label="Signatur" items={signatureItems} width={230} />
        <MailToolButton
          icon="alert"
          iconColor={colors.danger}
          label="Høy viktighet"
          active={compose.importance === 'high'}
          onPress={() => onChange({ importance: compose.importance === 'high' ? 'normal' : 'high', dirty: true })}
        />
        <MailToolButton
          icon="arrow-down"
          iconColor={colors.brand}
          label="Lav viktighet"
          active={compose.importance === 'low'}
          onPress={() => onChange({ importance: compose.importance === 'low' ? 'normal' : 'low', dirty: true })}
        />
        <MailMenuButton
          icon="lock-closed-outline"
          label={compose.sensitivity && compose.sensitivity !== 'normal' ? sensitivityLabel(compose.sensitivity) : 'Følsomhet'}
          active={!!compose.sensitivity && compose.sensitivity !== 'normal'}
          items={sensitivityItems}
          width={190}
        />
        <MailMenuButton
          icon="receipt-outline"
          label="Sporing"
          active={!!(compose.readReceipt || compose.deliveryReceipt)}
          items={trackingItems}
          width={250}
        />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollInner} keyboardShouldPersistTaps="handled">
        {accounts.length > 1 && compose.mode === 'new' && !compose.draftId ? (
          <Field label="Fra">
            <MailMenuButton
              label={account?.email || 'Velg konto'}
              items={() => accounts.map((a) => ({
                id: a.id, label: a.email || a.label, checked: a.id === account?.id, onPress: () => onChange({ accountId: a.id }),
              }))}
              width={280}
            />
          </Field>
        ) : null}
        <MailRecipientField
          label="Til"
          value={compose.to}
          onChange={(to) => onChange({ to, dirty: true })}
          contacts={contacts}
          autoFocus={!compose.focusBody}
          right={(
            <View style={styles.ccToggles}>
              {!compose.showCc ? (
                <Pressable onPress={() => onChange({ showCc: true })} hitSlop={4}><Text style={styles.link}>Kopi</Text></Pressable>
              ) : null}
              {!compose.showBcc ? (
                <Pressable onPress={() => onChange({ showBcc: true })} hitSlop={4}><Text style={styles.link}>Blindkopi</Text></Pressable>
              ) : null}
            </View>
          )}
        />
        {compose.showCc ? (
          <MailRecipientField label="Kopi" value={compose.cc} onChange={(cc) => onChange({ cc, dirty: true })} contacts={contacts} />
        ) : null}
        {compose.showBcc ? (
          <MailRecipientField label="Blindkopi" value={compose.bcc} onChange={(bcc) => onChange({ bcc, dirty: true })} contacts={contacts} />
        ) : null}
        <Field label="Emne">
          <TextInput
            style={styles.input}
            value={compose.subject}
            onChangeText={(subject) => onChange({ subject, dirty: true })}
            placeholder="Legg til et emne"
            placeholderTextColor={colors.placeholder}
          />
        </Field>

        {(compose.files || []).length || attachBusy ? (
          <View style={styles.files}>
            {(compose.files || []).map((f) => (
              <View key={f.key} style={styles.file}>
                <Ionicons name={attachmentIcon(f.name, f.contentType)} size={16} color={colors.brand} />
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Text style={styles.fileName} numberOfLines={1}>{f.name}</Text>
                  <Text style={styles.fileSize}>{formatBytes(f.size)}</Text>
                </View>
                <Pressable onPress={() => removeFile(f.key)} hitSlop={6} accessibilityLabel={`Fjern ${f.name}`}>
                  <Ionicons name="close" size={14} color={colors.muted} />
                </Pressable>
              </View>
            ))}
            {attachBusy ? <ActivityIndicator size="small" color={colors.brand} /> : null}
          </View>
        ) : null}

        <MailRichEditor
          key={compose.key}
          ref={editorRef}
          initialHtml={compose.body}
          onChange={(body) => onChange({ body, dirty: true })}
          fontFamily={prefs?.fontFamily}
          fontSize={prefs?.fontSize}
          onFiles={addFiles}
          onSubmitShortcut={onSend}
          onNotice={onNotice}
          minHeight={phone ? 220 : 260}
          style={styles.editor}
        />

        {isReply && compose.source ? (
          <View style={styles.quote}>
            <Pressable style={styles.quoteBar} onPress={() => setQuoteOpen((v) => !v)} accessibilityRole="button">
              <Ionicons name={quoteOpen ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.muted} />
              <Text style={styles.quoteTxt} numberOfLines={1}>
                {`Opprinnelig melding fra ${compose.source.from?.name || compose.source.from?.address || 'avsender'}`}
                {compose.source.receivedAt ? `, ${formatQuoteDate(compose.source.receivedAt)}` : ''}
              </Text>
            </Pressable>
            {compose.mode === 'forward' && compose.source.hasAttachments ? (
              <Text style={styles.quoteHint}>Vedleggene i den opprinnelige meldingen sendes med.</Text>
            ) : null}
            {quoteOpen ? (
              <View style={styles.quoteBody}>
                <MailBodyFrame html={`${quoteHeaderHtml(compose.source)}<br>${compose.source.html || ''}`} />
              </View>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={[styles.status, compose.error && styles.statusErr]} numberOfLines={2}>
          {compose.error
            || (compose.saving ? 'Lagrer utkast…' : compose.savedAt ? `Utkast lagret kl. ${formatTime(compose.savedAt)}` : (Platform.OS === 'web' && !phone ? 'Ctrl+Enter sender' : ''))}
        </Text>
        <MailToolButton icon="trash-outline" label="Forkast" onPress={onDiscard} />
        <MailToolButton primary icon="send" label={busy ? 'Sender…' : 'Send'} onPress={busy ? undefined : onSend} disabled={busy} />
      </View>

      {confirmClose ? (
        <View style={styles.confirmMask}>
          <View style={styles.confirm}>
            <Text style={styles.confirmTitle}>Vil du lagre utkastet?</Text>
            <Text style={styles.confirmTxt}>Utkastet legges i Kladd, så du kan fortsette senere – også i Outlook.</Text>
            <View style={styles.confirmRow}>
              <MailToolButton primary label="Lagre" onPress={() => { setConfirmClose(false); onSaveDraft({ close: true }); }} />
              <MailToolButton label="Forkast" onPress={() => { setConfirmClose(false); onDiscard(); }} />
              <MailToolButton label="Avbryt" onPress={() => setConfirmClose(false)} />
            </View>
          </View>
        </View>
      ) : null}

      {Platform.OS === 'web' ? React.createElement('input', {
        ref: fileRef,
        type: 'file',
        multiple: true,
        style: { display: 'none' },
        onChange: (e) => {
          addFiles(e.target.files);
          e.target.value = '';
        },
      }) : null}
    </View>
  );

  const dropZone = Platform.OS === 'web'
    ? React.createElement('div', {
      style: { display: 'contents' },
      onDragOver: (e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); },
      onDrop: (e) => {
        if (!e.dataTransfer?.files?.length || e.defaultPrevented) return;
        e.preventDefault();
        addFiles(e.dataTransfer.files);
      },
    }, card)
    : card;

  return (
    <View style={[styles.mask, compose.maximized && styles.maskFull]}>
      {dropZone}
    </View>
  );
}

const styles = StyleSheet.create({
  mask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
  },
  maskFull: { backgroundColor: 'rgba(15,23,42,0.5)' },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 18px 48px rgba(15, 23, 42, 0.28)' } : null),
  },
  cardFull: { ...StyleSheet.absoluteFillObject, borderRadius: 0 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  kicker: { fontSize: 11, color: colors.muted },
  title: { fontSize: 15, color: colors.ink },
  ribbon: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.sunken,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  scroll: { flex: 1, minHeight: 0 },
  scrollInner: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, flexGrow: 1 },
  field: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  fieldLbl: { width: 70, fontSize: 12, color: colors.muted },
  input: {
    fontSize: 14, color: colors.ink, paddingVertical: 8,
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
  ccToggles: { flexDirection: 'row', gap: 12, paddingLeft: 6 },
  link: { color: colors.brand, fontSize: 12 },
  files: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingVertical: 8, alignItems: 'center' },
  file: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.line,
    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 260,
  },
  fileName: { fontSize: 12, color: colors.ink },
  fileSize: { fontSize: 10, color: colors.muted },
  editor: { marginTop: 10, flexGrow: 1 },
  quote: { marginTop: 10 },
  quoteBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  quoteTxt: { fontSize: 12, color: colors.muted, flex: 1 },
  quoteHint: { fontSize: 11, color: colors.muted, marginLeft: 20, marginBottom: 4 },
  quoteBody: { borderLeftWidth: 2, borderLeftColor: colors.line, paddingLeft: 10, backgroundColor: '#fff' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  status: { flex: 1, fontSize: 12, color: colors.muted },
  statusErr: { color: colors.danger },
  confirmMask: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  confirm: {
    backgroundColor: colors.card, padding: 18, borderRadius: 6, maxWidth: 380, width: '100%', gap: 8,
    borderWidth: 1, borderColor: colors.line,
  },
  confirmTitle: { fontSize: 15, color: colors.ink },
  confirmTxt: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  confirmRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  miniWrap: {
    position: 'absolute', right: 20, bottom: 16, zIndex: 40,
  },
  miniPhone: { left: 12, right: 12 },
  mini: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brand,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 6, width: 320, maxWidth: '100%',
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)' } : null),
  },
  miniTxt: { color: '#fff', fontSize: 13, flex: 1 },
});
