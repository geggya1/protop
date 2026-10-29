/**
 * Sidepanelet på fakturasiden: status, sjekkliste, handlinger, notater, logg, PDF og vedlegg.
 */
import React, { useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDate } from '../../../src/economy/invoices.js';
import { type } from '../../../src/ui/tokens';
import { REMINDER_FEE_MAX } from '../../../src/economy/companyInvoiceDefaults.js';
import {
  COLLECTION_FLAGS,
  deliveryChannelLabel,
  displayStatus,
  isCreditNote,
  reminderFrom,
} from '../../../src/economy/invoiceFlow.js';
import { Banner, Button, Check, Chip, LinkText, money } from '../billing/ui';

const STATUS_TONES = {
  draft: 'muted',
  approved: 'info',
  transferred: 'info',
  issued: 'info',
  sent: 'info',
  partly_paid: 'warn',
  paid: 'ok',
  overdue: 'block',
  credited: 'muted',
  partly_credited: 'warn',
  written_off: 'block',
  credit_note: 'info',
  registered: 'muted',
};

export function StatusChip({ invoice }) {
  const status = displayStatus(invoice);
  return <Chip label={status.label} tone={STATUS_TONES[status.id] || 'muted'} icon="" />;
}

function Card({ title, right = null, children, colors, nativeID }) {
  return (
    <View nativeID={nativeID} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      {title ? (
        <View style={[styles.cardHead, { backgroundColor: colors.sunken || colors.bg, borderBottomColor: colors.line }]}>
          <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>{title}</Text>
          {right}
        </View>
      ) : null}
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function timeAgo(iso) {
  const at = Date.parse(iso || '');
  if (!at) return '';
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return 'for noen sekunder siden';
  if (minutes < 60) return `for ${minutes} ${minutes === 1 ? 'minutt' : 'minutter'} siden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `for ${hours} ${hours === 1 ? 'time' : 'timer'} siden`;
  return formatDate(String(iso).slice(0, 10));
}

const EVENT_ICONS = {
  create: 'add-circle-outline',
  edit: 'create-outline',
  approval: 'checkmark-done-outline',
  issue: 'lock-closed-outline',
  delivery: 'paper-plane-outline',
  payment: 'cash-outline',
  credit: 'return-down-back-outline',
  loss: 'alert-circle-outline',
  collection: 'flag-outline',
  attachment: 'attach-outline',
  manual: 'chatbox-ellipses-outline',
  archive: 'archive-outline',
};

function InlineAdd({ placeholder, onSave, colors, nativeID, multiline = true }) {
  const [text, setText] = useState('');
  return (
    <View style={{ gap: 6 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        nativeID={nativeID}
        accessibilityLabel={placeholder}
        style={[styles.input, { borderColor: colors.line, color: colors.ink, backgroundColor: colors.card }]}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        <Button label="Lagre" small colors={colors} disabled={!text.trim()} onPress={async () => { await onSave(text.trim()); setText(''); }} />
      </View>
    </View>
  );
}

function overdueText(invoice, settings) {
  const from = reminderFrom(invoice, settings);
  const fee = Number(settings.reminderFee) || 0;
  const today = new Date().toISOString().slice(0, 10);
  const when = !from ? '' : from <= today ? ' Purring kan sendes nå' : ` Purring kan sendes fra ${formatDate(from)}`;
  const feeText = fee > 0 ? ` med purregebyr ${money(Math.min(fee, REMINDER_FEE_MAX))}.` : '.';
  return `Forfall var ${formatDate(invoice.dueDate)}.${when ? `${when}${feeText}` : ''} Marker «Purring sendt» når den er sendt.`;
}

export default function InvoiceSidebar({
  invoice,
  colors,
  mode,
  canManage,
  checks,
  busy,
  previewUrl,
  editing,
  locked,
  canUpload = false,
  editable,
  onAction,
  onFlag,
  onAddNote,
  onRemoveNote,
  onAddEvent,
  onDownload,
  onUpload,
  onToggleAttachment,
  onRemoveAttachment,
  onOpenOriginal,
  onOpenCredit,
  powerOfficeSummary,
  powerOfficeUrl = '',
  onPowerOfficeSend = null,
  onPowerOfficeSync = null,
  settings = {},
}) {
  const [noteOpen, setNoteOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [allEvents, setAllEvents] = useState(false);
  const status = displayStatus(invoice);
  const credit = isCreditNote(invoice);
  const draft = status.id === 'draft' || status.id === 'approved';
  const issued = !!invoice.issuedAt || (!draft && status.id !== 'transferred');
  const po = mode === 'poweroffice';
  const events = [...(invoice.events || [])].reverse();
  const shownEvents = allEvents ? events : events.slice(0, 6);
  const notes = [...(invoice.noteList || [])].reverse();
  const outstanding = Number(invoice.outstandingAmount) || 0;
  const blocked = !!checks?.blocking?.length;
  const isBusy = (key) => busy === key;

  const actions = [];
  if (canManage && editable) {
    actions.push(
      <View key="row1" style={styles.actionRow}>
        <Button label="Slett utkast" icon="trash-outline" tone="danger" small colors={colors} onPress={() => onAction('delete')} disabled={!!busy || editing} nativeID="invoice-action-delete" />
        {!credit && invoice.projectId ? (
          <Button label="Oppdater utkast" icon="refresh" tone="ghost" small colors={colors} onPress={() => onAction('refresh')} busy={isBusy('refresh')} disabled={!!busy || editing} nativeID="invoice-action-refresh" />
        ) : null}
      </View>,
      <View key="row2" style={styles.actionRow}>
        <Button
          label={invoice.approval ? 'Trekk godkjenning' : 'Godkjenn utkast'}
          icon={invoice.approval ? 'close-circle-outline' : 'checkmark'}
          tone={invoice.approval ? 'ghost' : 'success'}
          small
          colors={colors}
          onPress={() => onAction('approve')}
          busy={isBusy('approve')}
          disabled={!!busy || editing}
          nativeID="invoice-action-approve"
        />
        <Button
          label={po ? 'Overfør til PowerOffice' : 'Ferdigstill og send'}
          icon={po ? 'cloud-upload-outline' : 'paper-plane-outline'}
          small
          colors={colors}
          onPress={() => onAction(po ? 'transfer' : 'finalize')}
          busy={isBusy('finalize') || isBusy('transfer')}
          disabled={!!busy || editing}
          nativeID="invoice-action-finalize"
        />
      </View>,
    );
  }
  if (canManage && issued && !po) {
    const row = [];
    if (status.id !== 'credited' && status.id !== 'written_off' && invoice.issuedAt) {
      row.push(<Button key="send" label={invoice.sentAt ? 'Send på nytt' : (credit ? 'Send kreditnota' : 'Send faktura')} icon="paper-plane-outline" small colors={colors} onPress={() => onAction('send')} disabled={!!busy} nativeID="invoice-action-send" />);
    }
    if (!credit && outstanding > 0.004 && status.id !== 'written_off') {
      row.push(<Button key="pay" label="Registrer betaling" icon="cash-outline" tone="success" small colors={colors} onPress={() => onAction('payment')} disabled={!!busy} nativeID="invoice-action-payment" />);
    }
    if (!credit && status.id !== 'credited') {
      row.push(<Button key="credit" label="Opprett kreditnota" icon="return-down-back-outline" tone="ghost" small colors={colors} onPress={() => onAction('credit')} disabled={!!busy} nativeID="invoice-action-credit" />);
    }
    if (!credit && outstanding > 0.004 && status.id !== 'written_off' && status.id !== 'credited') {
      row.push(<Button key="loss" label="Før som tap" icon="alert-circle-outline" tone="ghost" small colors={colors} onPress={() => onAction('loss')} disabled={!!busy} nativeID="invoice-action-loss" />);
    }
    if (row.length) actions.push(<View key="issued" style={styles.actionRow}>{row}</View>);
  }
  if (canManage && issued && po && !credit && status.id !== 'credited') {
    actions.push(
      <View key="po" style={styles.actionRow}>
        {outstanding > 0.004 ? <Button label="Registrer betaling" icon="cash-outline" tone="success" small colors={colors} onPress={() => onAction('payment')} disabled={!!busy} /> : null}
      </View>,
    );
  }

  return (
    <View style={styles.side}>
      <Card
        title="Status"
        colors={colors}
        nativeID="invoice-status-card"
        right={<StatusChip invoice={invoice} />}
      >
        <View style={{ gap: 4 }}>
          {invoice.issuedAt ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {`Ferdigstilt ${formatDate(invoice.issuedAt.slice(0, 10))}${invoice.issuedByName ? ` av ${invoice.issuedByName}` : ''}`}
            </Text>
          ) : null}
          {invoice.approval ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {`Godkjent ${formatDate(invoice.approval.at.slice(0, 10))}${invoice.approval.byName ? ` av ${invoice.approval.byName}` : ''}`}
            </Text>
          ) : null}
          {invoice.sentAt ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {`Sendt ${formatDate(invoice.sentAt)}${invoice.deliveryChannel ? ` · ${deliveryChannelLabel(invoice.deliveryChannel)}` : ''}`}
            </Text>
          ) : null}
          {credit && invoice.creditNoteForNumber ? (
            <LinkText label={`Krediterer faktura ${invoice.creditNoteForNumber}`} onPress={onOpenOriginal} colors={colors} icon="link-outline" />
          ) : null}
          {(invoice.creditNoteIds || []).map((id) => (
            <LinkText key={id} label="Åpne kreditnota" onPress={() => onOpenCredit?.(id)} colors={colors} icon="link-outline" />
          ))}
          {powerOfficeSummary ? (
            <View style={{ gap: 2, marginTop: 4 }}>
              <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 13 }}>{powerOfficeSummary.title}</Text>
              {powerOfficeSummary.lines.map((line) => (
                <Text
                  key={line}
                  style={{ ...type.caption, color: line.startsWith('Sendingen feilet') ? (colors.danger || '#b42318') : colors.muted }}
                >
                  {line}
                </Text>
              ))}
              {onPowerOfficeSend ? (
                <View style={[styles.actionRow, { marginTop: 6 }]}>
                  <Button
                    label="Send fra PowerOffice nå"
                    icon="send-outline"
                    small
                    colors={colors}
                    onPress={onPowerOfficeSend}
                    busy={isBusy('posend')}
                    disabled={!!busy}
                    nativeID="invoice-poweroffice-send"
                  />
                </View>
              ) : null}
              <View style={[styles.actionRow, { marginTop: 4 }]}>
                {onPowerOfficeSync ? (
                  <LinkText label={isBusy('posync') ? 'Synker …' : 'Synk nå'} icon="sync-outline" colors={colors} onPress={() => !busy && onPowerOfficeSync()} nativeID="invoice-poweroffice-sync" />
                ) : null}
                {powerOfficeUrl ? (
                  <LinkText label="Åpne PowerOffice Go" icon="open-outline" colors={colors} onPress={() => Linking.openURL(powerOfficeUrl)} nativeID="invoice-open-poweroffice" />
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
        {issued && !credit ? (
          <View style={{ gap: 6, marginTop: 8 }}>
            {COLLECTION_FLAGS.map((row) => (
              <View key={row.id} style={styles.flagRow}>
                <Text style={{ color: colors.ink, flex: 1, fontSize: 13 }}>{row.label}</Text>
                <Check
                  checked={!!invoice.collection?.[row.id]}
                  onPress={() => onFlag(row.id, !invoice.collection?.[row.id])}
                  colors={colors}
                  disabled={!canManage || !!busy}
                  label={row.label}
                  nativeID={`invoice-flag-${row.id}`}
                />
              </View>
            ))}
          </View>
        ) : null}
      </Card>

      {draft ? (
        <View style={[styles.draftBanner, { backgroundColor: '#e9d5ff', borderColor: '#c4b5fd' }]} nativeID="invoice-draft-banner">
          <Ionicons name="warning" size={16} color="#5b21b6" />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: '#4c1d95', fontWeight: '700' }}>{credit ? 'Dette er et kreditnotautkast' : 'Dette er et fakturautkast'}</Text>
            <Text style={{ color: '#5b21b6', fontSize: 13 }}>Gjør nødvendige justeringer før du ferdigstiller utkastet.</Text>
          </View>
        </View>
      ) : null}

      {draft && checks ? (
        <Card title={checks.ok ? 'Klar til å ferdigstilles' : 'Dette mangler'} colors={colors} nativeID="invoice-checklist">
          {checks.ok ? (
            <View style={styles.flagRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.success || '#15803d'} />
              <Text style={{ color: colors.ink, fontSize: 13, flex: 1 }}>Alt som kreves på en faktura er på plass.</Text>
            </View>
          ) : null}
          {(checks.blocking || []).map((row) => (
            <View key={row.id} style={styles.flagRow}>
              <Ionicons name="close-circle" size={16} color={colors.danger || '#b42318'} />
              <Text style={{ color: colors.ink, fontSize: 13, flex: 1 }}>{row.text}</Text>
            </View>
          ))}
          {(checks.warnings || []).map((row) => (
            <View key={row.id} style={styles.flagRow}>
              <Ionicons name="warning" size={16} color={colors.warn || '#b45309'} />
              <Text style={{ color: colors.ink, fontSize: 13, flex: 1 }}>{row.text}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {actions.length ? <View style={{ gap: 8 }}>{actions}</View> : null}
      {blocked && draft && canManage ? (
        <Text style={{ color: colors.muted, fontSize: 12 }}>Ferdigstill viser det som må rettes først.</Text>
      ) : null}

      <Card
        title="Notater"
        colors={colors}
        nativeID="invoice-notes"
        right={<LinkText label="+ Nytt notat" onPress={() => setNoteOpen(!noteOpen)} colors={colors} nativeID="invoice-note-add" />}
      >
        {noteOpen ? <InlineAdd placeholder="Skriv et notat. Notater er interne og står ikke på fakturaen." onSave={async (text) => { await onAddNote(text); setNoteOpen(false); }} colors={colors} nativeID="invoice-note-input" /> : null}
        {!notes.length && !noteOpen ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen notater.</Text> : null}
        {notes.map((row) => (
          <View key={row.id} style={[styles.note, { borderTopColor: colors.line }]}>
            <Text style={{ color: colors.ink, fontSize: 13, lineHeight: 19 }}>{row.text}</Text>
            <View style={styles.flagRow}>
              <Text style={{ color: colors.muted, fontSize: 12, flex: 1 }}>{[row.byName, timeAgo(row.at)].filter(Boolean).join(' · ')}</Text>
              {canManage ? (
                <TouchableOpacity onPress={() => onRemoveNote(row.id)} accessibilityLabel="Slett notatet" hitSlop={6}>
                  <Ionicons name="trash-outline" size={14} color={colors.muted} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
        ))}
        {invoice.notes && !notes.length ? <Text style={{ color: colors.muted, fontSize: 12 }}>{invoice.notes}</Text> : null}
      </Card>

      <Card
        title="Endringslogg"
        colors={colors}
        nativeID="invoice-log"
        right={<LinkText label="+ Legg til hendelse" onPress={() => setEventOpen(!eventOpen)} colors={colors} />}
      >
        {eventOpen ? <InlineAdd placeholder="Hva skjedde? For eksempel: Kunden ringte om fakturaen." onSave={async (text) => { await onAddEvent(text); setEventOpen(false); }} colors={colors} multiline={false} /> : null}
        {!events.length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen hendelser ennå.</Text> : null}
        {shownEvents.map((row) => (
          <View key={row.id} style={[styles.event, { borderTopColor: colors.line }]}>
            <Ionicons name={EVENT_ICONS[row.type] || 'ellipse-outline'} size={14} color={colors.muted} />
            <Text style={{ color: colors.ink, fontSize: 13, flex: 1, lineHeight: 18 }}>
              {row.byName ? <Text style={{ color: colors.brand }}>{`${row.byName} `}</Text> : null}
              {row.text}
              <Text style={{ color: colors.muted }}>{` ${timeAgo(row.at)}`}</Text>
            </Text>
          </View>
        ))}
        {events.length > 6 ? (
          <LinkText label={allEvents ? 'Vis færre' : `Vis alle ${events.length}`} onPress={() => setAllEvents(!allEvents)} colors={colors} />
        ) : null}
      </Card>

      <Card title="Forhåndsvisning" colors={colors} nativeID="invoice-preview">
        {Platform.OS === 'web' && previewUrl ? (
          <View style={[styles.frame, { borderColor: colors.line }]}>
            {React.createElement('iframe', {
              title: `PDF ${invoice.invoiceNumber || 'utkast'}`,
              src: `${previewUrl}#toolbar=0&view=FitH`,
              style: { border: 0, width: '100%', height: 520, background: '#fff' },
            })}
          </View>
        ) : (
          <Text style={{ color: colors.muted, fontSize: 13 }}>PDF-en lages når du laster den ned.</Text>
        )}
      </Card>

      <Card title="Last ned" colors={colors} nativeID="invoice-downloads">
        <LinkText label={invoice.issuedAt ? `${credit ? 'Kreditnota' : 'Faktura'}-${invoice.invoiceNumber}.pdf` : (credit ? 'Kreditnota-utkast.pdf' : 'Faktura-utkast.pdf')} icon="document-outline" onPress={() => onDownload('pdf')} colors={colors} nativeID="invoice-download-pdf" />
        {(invoice.timeEntryIds || []).length ? (
          <>
            <LinkText label="Timespesifikasjoner" icon="document-outline" onPress={() => onDownload('timespec')} colors={colors} nativeID="invoice-download-timespec" />
            <LinkText label="Faktura med timespesifikasjoner" icon="document-outline" onPress={() => onDownload('combined')} colors={colors} />
          </>
        ) : null}
        <LinkText label="EHF (XML)" icon="code-outline" onPress={() => onDownload('ehf')} colors={colors} nativeID="invoice-download-ehf" />
        {invoice.archive?.pdf?.url ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {`Arkivert ${formatDate(String(invoice.archive.pdf.at || invoice.issuedAt).slice(0, 10))}. Arkivkopien endres ikke.`}
          </Text>
        ) : null}
        {invoice.attachment?.url ? (
          <LinkText label={invoice.attachment.name || 'Opplastet PDF'} icon="document-attach-outline" onPress={() => onDownload('attachment')} colors={colors} />
        ) : null}
      </Card>

      <Card title="Vedlegg" colors={colors} nativeID="invoice-attachments">
        {!(invoice.attachments || []).length ? <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen vedlegg.</Text> : null}
        {(invoice.attachments || []).map((row) => (
          <View key={row.id} style={[styles.attachment, { borderColor: colors.line }]}>
            <Check
              checked={row.include !== false}
              onPress={() => onToggleAttachment(row.id)}
              colors={colors}
              disabled={!canManage || locked}
              label={`Send med ${row.name}`}
            />
            <TouchableOpacity style={{ flex: 1 }} onPress={() => onDownload('file', row)} accessibilityRole="link">
              <Text style={{ color: colors.brand, fontSize: 13 }} numberOfLines={1}>{row.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {[row.source === 'expense' ? 'Fra utlegg' : 'Lastet opp', row.size ? `${Math.round(row.size / 1024)} kB` : ''].filter(Boolean).join(' · ')}
                {!row.storagePath && !/firebasestorage/.test(row.url || '') ? ' · ligger utenfor ProTop og sendes ikke med' : ''}
              </Text>
            </TouchableOpacity>
            {canManage && !locked ? (
              <TouchableOpacity onPress={() => onRemoveAttachment(row.id)} accessibilityLabel={`Fjern ${row.name}`} hitSlop={6}>
                <Ionicons name="close" size={16} color={colors.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
        {canUpload ? (
          <TouchableOpacity onPress={onUpload} style={[styles.upload, { borderColor: colors.line }]} accessibilityRole="button" nativeID="invoice-upload">
            <Ionicons name="cloud-upload-outline" size={18} color={colors.brand} />
            <Text style={{ color: colors.brand }}>Last opp fakturavedlegg</Text>
          </TouchableOpacity>
        ) : null}
        {locked && !canUpload && (invoice.attachments || []).length ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>Vedleggene er låst sammen med fakturaen.</Text>
        ) : null}
      </Card>

      {issued && (invoice.payments || []).length ? (
        <Card title="Betalinger" colors={colors}>
          {(invoice.payments || []).map((row) => (
            <View key={row.id} style={styles.flagRow}>
              <Text style={{ color: colors.ink, fontSize: 13, flex: 1 }}>{`${formatDate(row.date)}${row.note ? ` · ${row.note}` : ''}`}</Text>
              <Text style={{ color: colors.ink, fontSize: 13 }}>{money(row.amount, invoice.currency)}</Text>
            </View>
          ))}
        </Card>
      ) : null}
      {status.id === 'overdue' ? (
        <Banner tone="block" colors={colors} title="Forfalt">
          {overdueText(invoice, settings)}
        </Banner>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  side: { gap: 12 },
  card: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderBottomWidth: 1 },
  cardBody: { padding: 12, gap: 8 },
  draftBanner: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 10, padding: 12, alignItems: 'flex-start' },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minHeight: 40, fontSize: 13 },
  note: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 4 },
  event: { flexDirection: 'row', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, alignItems: 'flex-start' },
  frame: { borderWidth: 1, borderRadius: 6, overflow: 'hidden' },
  attachment: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 8, padding: 8 },
  upload: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 16 },
});
