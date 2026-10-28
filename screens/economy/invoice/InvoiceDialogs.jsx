/**
 * Dialogene på fakturasiden: slett utkast, ferdigstill og send, krediter, betaling og tap.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateField from '../../../components/DateField';
import { dateKey } from '../../../src/utils/dates';
import { formatDate } from '../../../src/economy/invoices.js';
import { dueDateFor, invoiceTotals, isCreditNote, issueDates } from '../../../src/economy/invoiceFlow.js';
import { sectionLabel } from '../../../src/economy/invoiceLines.js';
import { ehfUnavailableText } from '../../../src/economy/ehf.js';
import DialogShell from './DialogShell';
import { Banner, Button, Check, Field, money } from '../billing/ui';

function Radio({ selected, onPress, title, text, colors, nativeID }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="radio" accessibilityState={{ checked: selected }} nativeID={nativeID} style={styles.radio}>
      <View style={[styles.radioDot, { borderColor: selected ? colors.brand : colors.muted }]}>
        {selected ? <View style={[styles.radioFill, { backgroundColor: colors.brand }]} /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>{title}</Text>
        {text ? <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>{text}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

function DateRow({ label, value, onChange, colors }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: colors.muted, fontSize: 12, fontWeight: '600' }}>{label}</Text>
      <DateField
        value={value}
        onChange={(date) => date && onChange(dateKey(date))}
        style={[styles.date, { borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

/** Slett utkast: tilbake til Til fakturering, eller ikke fakturer (avskriv) med årsak. */
export function DeleteDraftDialog({ visible, invoice, colors, busy, onCancel, onConfirm }) {
  const [mode, setMode] = useState('release');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (visible) {
      setMode('release');
      setReason('');
    }
  }, [visible]);
  const credit = isCreditNote(invoice);
  const hasWork = !credit && ((invoice?.timeEntryIds || []).length || (invoice?.lines || []).some((line) => (
    line.expenseIds?.length || line.tripIds?.length || line.saleIds?.length
  )));
  return (
    <DialogShell
      visible={visible}
      title={credit ? 'Slett kreditnotautkast' : 'Slett utkast'}
      onClose={onCancel}
      colors={colors}
      nativeID="invoice-delete-dialog"
      footer={(
        <>
          <Button label="Avbryt" tone="ghost" colors={colors} onPress={onCancel} />
          <Button
            label="Slett utkast"
            tone="danger"
            colors={colors}
            busy={busy}
            disabled={mode === 'writeoff' && !reason.trim()}
            onPress={() => onConfirm({ mode: hasWork ? mode : 'release', reason: reason.trim() })}
            nativeID="invoice-delete-confirm"
          />
        </>
      )}
    >
      <Text style={{ color: colors.ink, lineHeight: 20 }}>
        {hasWork
          ? 'Dette sletter utkastet permanent. Hvilken status skal timene, utleggene og salget på utkastet få?'
          : 'Dette sletter utkastet permanent. Det har ikke fått nummer, så nummerserien påvirkes ikke.'}
      </Text>
      {hasWork ? (
        <View style={{ gap: 12 }}>
          <Radio
            selected={mode === 'release'}
            onPress={() => setMode('release')}
            title="Tilbake til Til fakturering"
            text="Postene blir godkjent for fakturering igjen og vises i Til fakturering."
            colors={colors}
            nativeID="invoice-delete-release"
          />
          <Radio
            selected={mode === 'writeoff'}
            onPress={() => setMode('writeoff')}
            title="Ikke fakturer (avskriv)"
            text="Postene merkes som fakturert uten faktura og fjernes fra Til fakturering. Dette er ikke tap på en kundefordring, siden ingenting er fakturert."
            colors={colors}
            nativeID="invoice-delete-writeoff"
          />
          {mode === 'writeoff' ? (
            <Field label="Årsak (påkrevd)" value={reason} onChangeText={setReason} colors={colors} placeholder="For eksempel: Garantiarbeid, faktureres ikke" nativeID="invoice-delete-reason" />
          ) : null}
        </View>
      ) : null}
    </DialogShell>
  );
}

function RecipientList({ list, onChange, colors }) {
  const [draft, setDraft] = useState('');
  const valid = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(draft.trim());
  return (
    <View style={[styles.recipients, { borderColor: colors.line }]}>
      {list.map((row) => (
        <View key={row.email} style={[styles.recipient, { borderBottomColor: colors.line }]}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>til:</Text>
          <Text style={{ color: colors.ink, flex: 1 }}>{row.email}</Text>
          <Check
            checked={row.on}
            onPress={() => onChange(list.map((item) => (item.email === row.email ? { ...item, on: !item.on } : item)))}
            colors={colors}
            label={`Send til ${row.email}`}
          />
        </View>
      ))}
      <View style={styles.recipient}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="epost@firma.no"
          placeholderTextColor={colors.muted}
          keyboardType="email-address"
          autoCapitalize="none"
          accessibilityLabel="Legg til e-postadresse"
          nativeID="invoice-send-add-email"
          style={[styles.recipientInput, { color: colors.ink }]}
          onSubmitEditing={() => {
            if (!valid) return;
            onChange([...list.filter((row) => row.email !== draft.trim().toLowerCase()), { email: draft.trim().toLowerCase(), on: true }]);
            setDraft('');
          }}
        />
        <TouchableOpacity
          disabled={!valid}
          accessibilityRole="button"
          accessibilityLabel="Legg til mottaker"
          onPress={() => {
            onChange([...list.filter((row) => row.email !== draft.trim().toLowerCase()), { email: draft.trim().toLowerCase(), on: true }]);
            setDraft('');
          }}
        >
          <Ionicons name="add" size={20} color={valid ? colors.brand : colors.muted} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function initialRecipients(invoice, settings) {
  const emails = [
    invoice?.customerEmail,
    ...String(settings?.emailCc || '').split(/[,;\s]+/),
  ].map((row) => String(row || '').trim().toLowerCase()).filter((row) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row));
  return [...new Set(emails)].map((email, index) => ({ email, on: index === 0 || !!invoice?.customerEmail }));
}

/**
 * Ferdigstill og send (mode 'finalize') eller send en ferdigstilt faktura (mode 'send').
 * peppol: { loading, connected, receiver: { found, invoice } }
 */
export function SendDialog({
  visible,
  invoice,
  mode = 'finalize',
  colors,
  supplier = {},
  settings = {},
  peppol = null,
  checks = null,
  powerOffice = false,
  busy = false,
  onCancel,
  onConfirm,
}) {
  const credit = isCreditNote(invoice);
  const [send, setSend] = useState(true);
  const [channel, setChannel] = useState('email');
  const [recipients, setRecipients] = useState([]);
  const [replyTo, setReplyTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [includePdf, setIncludePdf] = useState(true);
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [includeTimeSpec, setIncludeTimeSpec] = useState(false);
  const [alsoEmail, setAlsoEmail] = useState(false);
  const [date, setDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTouched, setDueTouched] = useState(false);
  // Hvorfor dialogen byttet fra EHF til e-post (vises på e-postfanen), eller ''.
  const [ehfFallback, setEhfFallback] = useState('');

  const ehfReady = !!(peppol?.connected && peppol?.receiver?.found && peppol?.receiver?.[credit ? 'creditNote' : 'invoice']);
  useEffect(() => {
    if (!visible) return;
    const wanted = invoice?.deliveryMethod;
    const orgnr = String(invoice?.orgnr || '').replace(/\D/g, '');
    let start = wanted === 'manual' ? 'manual' : (wanted === 'ehf' && orgnr.length === 9 ? 'ehf' : 'email');
    if (start === 'email' && !invoice?.customerEmail && orgnr.length === 9) start = 'ehf';
    setChannel(start);
    setSend(true);
    setRecipients(initialRecipients(invoice, settings));
    setReplyTo(settings.emailReplyTo || supplier.email || '');
    setSubject((credit ? settings.creditEmailSubject : settings.emailSubject) || 'Faktura @invoiceNumber fra @company');
    setBody((credit ? settings.creditEmailBodyText : settings.emailBodyText) || '');
    setIncludePdf(settings.emailIncludePdf !== false);
    setIncludeAttachments(settings.emailIncludeAttachments !== false);
    setIncludeTimeSpec(!!settings.attachTimeSpec && !credit && (invoice?.timeEntryIds || []).length > 0);
    setAlsoEmail(!!settings.ehfAlsoEmail && !!invoice?.customerEmail);
    const dates = issueDates(invoice, { dueDateMode: settings.dueDateMode || 'invoice_date' });
    setDate(dates.invoiceDate);
    setDueDate(dates.dueDate);
    setDueTouched(false);
    setEhfFallback('');
  }, [visible]);

  // Ny fakturadato flytter fristen etter kredittiden, til fristen er valgt selv.
  function changeDate(day) {
    setDate(day);
    if (credit || dueTouched || invoice?.dueDateSet) return;
    setDueDate(dueDateFor({ ...invoice, invoiceDate: day }, {
      creditDays: invoice?.creditDays ?? null,
      dueDateMode: settings.dueDateMode || 'invoice_date',
    }));
  }

  // Når EHF ikke kan brukes (ikke koblet eller mottaker ikke funnet), foreslås e-post,
  // og dialogen sier hvorfor i stedet for å bytte stille.
  useEffect(() => {
    if (!visible || !peppol || peppol.loading) return;
    if (channel === 'ehf' && !ehfReady && invoice?.customerEmail) {
      setEhfFallback(ehfUnavailableText(invoice, peppol));
      setChannel('email');
    }
  }, [peppol?.loading, ehfReady]);

  const totals = invoiceTotals(invoice || {});
  const finalize = mode === 'finalize';
  const blocking = checks?.blocking || [];
  const warnings = checks?.warnings || [];
  const chosen = recipients.filter((row) => row.on).map((row) => row.email);
  const narrow = useWindowDimensions().width < 520;
  const needsMail = send && (channel === 'email' || (channel === 'ehf' && alsoEmail));
  const dueBeforeDate = finalize && !powerOffice && !credit && !!dueDate && !!date && dueDate < date;
  // Til PowerOffice sendes ingenting herfra, så mottakere og kanal spiller ingen rolle.
  const canGo = !blocking.length && (powerOffice || (!dueBeforeDate
    && (!send || channel === 'manual' || (channel === 'email' && chosen.length) || (channel === 'ehf' && ehfReady && (!alsoEmail || chosen.length)))));
  const title = finalize ? (credit ? 'Ferdigstill kreditnota' : 'Ferdigstill faktura') : (credit ? 'Send kreditnota' : 'Send faktura');
  let action = 'Send';
  if (finalize) action = send && !powerOffice ? 'Ferdigstill og send' : 'Ferdigstill';
  const again = powerOffice && invoice?.poweroffice?.state === 'missing';
  if (powerOffice) action = again ? 'Overfør på nytt' : 'Overfør til PowerOffice';

  const channelTabs = [
    { id: 'ehf', label: narrow ? 'EHF' : 'Send som EHF' },
    { id: 'email', label: narrow ? 'E-post' : 'Send som e-post' },
    { id: 'manual', label: 'Send selv' },
  ];

  return (
    <DialogShell
      visible={visible}
      title={title}
      onClose={onCancel}
      colors={colors}
      width={620}
      nativeID="invoice-send-dialog"
      footer={(
        <>
          <Button label="Avbryt" tone="ghost" colors={colors} onPress={onCancel} />
          <Button
            label={action}
            colors={colors}
            busy={busy}
            disabled={!canGo || busy}
            onPress={() => onConfirm({
              date,
              dueDate: credit ? '' : dueDate,
              send: !powerOffice && send,
              channel,
              to: chosen,
              alsoEmail: channel === 'ehf' && alsoEmail,
              replyTo: replyTo.trim(),
              subject,
              body,
              includePdf,
              includeAttachments,
              includeTimeSpec,
            })}
            nativeID="invoice-send-confirm"
          />
        </>
      )}
    >
      {finalize ? (
        <View style={{ gap: 8 }}>
          {blocking.length ? (
            <Banner tone="block" colors={colors} title="Dette må rettes før ferdigstilling">
              <View style={{ gap: 2 }}>
                {blocking.map((row) => <Text key={row.id} style={{ color: colors.ink, fontSize: 13 }}>{`• ${row.text}`}</Text>)}
              </View>
            </Banner>
          ) : null}
          {warnings.length ? (
            <Banner tone="warn" colors={colors} title="Kontroller">
              <View style={{ gap: 2 }}>
                {warnings.map((row) => <Text key={row.id} style={{ color: colors.ink, fontSize: 13 }}>{`• ${row.text}`}</Text>)}
              </View>
            </Banner>
          ) : null}
          {!powerOffice ? (
            <>
              <View style={styles.dates}>
                <View style={{ flexGrow: 1, flexBasis: 200 }}>
                  <DateRow label={credit ? 'Dato' : 'Fakturadato'} value={date} onChange={changeDate} colors={colors} />
                </View>
                {credit ? null : (
                  <View style={{ flexGrow: 1, flexBasis: 200 }}>
                    <DateRow
                      label="Betalingsfrist"
                      value={dueDate}
                      onChange={(day) => { setDueDate(day); setDueTouched(true); }}
                      colors={colors}
                    />
                  </View>
                )}
              </View>
              {dueBeforeDate ? (
                <Text style={{ color: colors.dangerInk || colors.danger, fontSize: 12 }}>Betalingsfristen er før fakturadatoen.</Text>
              ) : null}
              <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>
                Fakturaen får neste nummer i nummerserien og låses. Etterpå kan den bare rettes med kreditnota.
                {' '}Datoene over står på fakturaen. Loggen viser når den faktisk ble ferdigstilt og sendt.
              </Text>
            </>
          ) : (
            <>
              {again ? (
                <Banner tone="warn" colors={colors} title="Utkastet finnes ikke lenger i PowerOffice">
                  <Text style={{ color: colors.ink, fontSize: 13 }}>
                    Overfør på nytt bare hvis det ble slettet der. Ble det slått sammen med et annet utkast, blir kunden fakturert to ganger.
                  </Text>
                </Banner>
              ) : null}
              <Text style={{ color: colors.ink, lineHeight: 20 }}>
                Utkastet overføres til PowerOffice Go, som setter fakturanummer og KID. Kontroller og send fakturaen fra PowerOffice.
                Nummer, KID, sending og betaling hentes tilbake hit.
                {invoice?.invoiceDate ? `\n\nOrdredato i PowerOffice: ${formatDate(invoice.invoiceDate)}. ` : '\n\n'}
                {invoice?.dueDateSet && invoice?.creditDays != null && Number.isFinite(Number(invoice.creditDays))
                  ? `Betalingsfristen blir ${Number(invoice.creditDays)} dager fra dagen fakturaen sendes fra PowerOffice.`
                  : 'Betalingsfristen følger betalingsbetingelsen i PowerOffice.'}
              </Text>
            </>
          )}
        </View>
      ) : null}

      {!powerOffice ? (
        <View style={{ gap: 10 }}>
          {finalize ? (
            <View style={styles.inline}>
              <Check checked={send} onPress={() => setSend(!send)} colors={colors} label="Send faktura" nativeID="invoice-send-toggle" />
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{credit ? 'Send kreditnota' : 'Send faktura'}</Text>
            </View>
          ) : null}
          {send ? (
            <>
              <View style={[styles.tabs, { borderColor: colors.line }]}>
                {channelTabs.map((tab) => {
                  const on = channel === tab.id;
                  return (
                    <TouchableOpacity
                      key={tab.id}
                      onPress={() => setChannel(tab.id)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      nativeID={`invoice-channel-${tab.id}`}
                      style={[styles.tab, { backgroundColor: on ? colors.brand : colors.card }]}
                    >
                      <Text style={{ color: on ? '#fff' : colors.ink, fontWeight: on ? '700' : '500' }}>{tab.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {channel === 'ehf' ? (
                <View style={{ gap: 8 }}>
                  {peppol?.loading ? (
                    <View style={styles.inline}>
                      <ActivityIndicator size="small" color={colors.brand} />
                      <Text style={{ color: colors.muted }}>Sjekker om kunden kan ta imot EHF…</Text>
                    </View>
                  ) : null}
                  {!peppol?.loading && ehfReady ? (
                    <Banner tone="ok" colors={colors} title={`${credit ? 'Kreditnota' : 'Faktura'} til ${invoice.customerName} (org.nr. ${invoice.orgnr})`}>
                      Kunden kan ta imot EHF. Fakturaen sendes som e-faktura gjennom Peppol.
                    </Banner>
                  ) : null}
                  {!peppol?.loading && !ehfReady ? (
                    <Banner tone="warn" colors={colors} title="EHF kan ikke sendes nå">
                      {ehfUnavailableText(invoice, peppol)}
                    </Banner>
                  ) : null}
                  <View style={styles.inline}>
                    <Check checked={alsoEmail} onPress={() => setAlsoEmail(!alsoEmail)} colors={colors} label="Send også på e-post" />
                    <Text style={{ color: colors.ink }}>I tillegg, send på e-post til</Text>
                  </View>
                </View>
              ) : null}
              {channel === 'email' && ehfFallback ? (
                <View nativeID="invoice-ehf-fallback">
                  <Banner tone="warn" colors={colors} title="Sendes på e-post fordi EHF ikke kan brukes">
                    {ehfFallback}
                  </Banner>
                </View>
              ) : null}
              {needsMail ? (
                <View style={{ gap: 10 }}>
                  <RecipientList list={recipients} onChange={setRecipients} colors={colors} />
                  <Field label="Svar til" value={replyTo} onChangeText={setReplyTo} colors={colors} placeholder={supplier.email || 'faktura@firma.no'} />
                  <Field label="Emne" value={subject} onChangeText={setSubject} colors={colors} nativeID="invoice-send-subject" />
                  <Field label="Melding" value={body} onChangeText={setBody} colors={colors} multiline nativeID="invoice-send-body" />
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    {`Flettefelt: @invoiceNumber, @company, @amount, @dueDate, @kid, @customer, @project, @replyTo${credit ? ', @creditedInvoice' : ''}.`}
                  </Text>
                  <View style={styles.inline}>
                    <Check checked={includePdf} onPress={() => setIncludePdf(!includePdf)} colors={colors} label="Inkluder PDF" />
                    <Text style={{ color: colors.ink }}>{`Inkluder PDF-versjon av ${credit ? 'kreditnotaen' : 'fakturaen'}`}</Text>
                  </View>
                  {(invoice?.timeEntryIds || []).length ? (
                    <View style={styles.inline}>
                      <Check checked={includeTimeSpec} onPress={() => setIncludeTimeSpec(!includeTimeSpec)} colors={colors} label="Inkluder timespesifikasjon" />
                      <Text style={{ color: colors.ink }}>Inkluder timespesifikasjon</Text>
                    </View>
                  ) : null}
                  {(invoice?.attachments || []).length ? (
                    <View style={styles.inline}>
                      <Check checked={includeAttachments} onPress={() => setIncludeAttachments(!includeAttachments)} colors={colors} label="Inkluder vedlegg" />
                      <Text style={{ color: colors.ink }}>{`Inkluder vedlegg (${invoice.attachments.filter((row) => row.include !== false).length})`}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              {channel === 'manual' ? (
                <Text style={{ color: colors.ink, lineHeight: 20 }}>
                  Fakturaen markeres som sendt. Last ned PDF-en etterpå og send den selv.
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={{ color: colors.muted, fontSize: 13 }}>
              Fakturaen ferdigstilles uten å sendes. Den kan sendes senere fra fakturasiden.
            </Text>
          )}
        </View>
      ) : null}

      <View style={[styles.sum, { borderTopColor: colors.line }]}>
        <Text style={{ color: colors.muted }}>{credit ? 'Til gode' : 'Å betale'}</Text>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>{money(Math.abs(totals.totalDue), invoice?.currency)}</Text>
      </View>
    </DialogShell>
  );
}

/** Krediter: hele fakturaen eller valgte linjer, med årsak og tilbakeføring av grunnlaget. */
export function CreditDialog({ visible, invoice, colors, busy, onCancel, onConfirm }) {
  const [scope, setScope] = useState('all');
  const [picked, setPicked] = useState(() => new Set());
  const [reason, setReason] = useState('');
  const [release, setRelease] = useState(true);
  useEffect(() => {
    if (visible) {
      setScope('all');
      setPicked(new Set((invoice?.lines || []).map((line) => line.id)));
      setReason('');
      setRelease(true);
    }
  }, [visible]);
  const lines = invoice?.lines || [];
  const chosen = scope === 'all' ? lines : lines.filter((line) => picked.has(line.id));
  const work = useMemo(() => {
    const count = { hours: 0, expenses: 0, trips: 0, sales: 0 };
    for (const line of chosen) {
      count.hours += line.timeEntryIds?.length || 0;
      count.expenses += line.expenseIds?.length || 0;
      count.trips += line.tripIds?.length || 0;
      count.sales += line.saleIds?.length || 0;
    }
    return count;
  }, [chosen]);
  const workParts = [
    work.hours ? `${work.hours} ${work.hours === 1 ? 'timeføring' : 'timeføringer'}` : '',
    work.expenses ? `${work.expenses} utlegg` : '',
    work.trips ? `${work.trips} ${work.trips === 1 ? 'kjøretur' : 'kjøreturer'}` : '',
    work.sales ? `${work.sales} salg` : '',
  ].filter(Boolean);
  const amount = chosen.reduce((sum, line) => sum + (Number(line.amountExVat) || 0), 0);
  const paid = Number(invoice?.paidAmount) || 0;
  return (
    <DialogShell
      visible={visible}
      title="Krediter faktura"
      onClose={onCancel}
      colors={colors}
      width={600}
      nativeID="invoice-credit-dialog"
      footer={(
        <>
          <Button label="Avbryt" tone="ghost" colors={colors} onPress={onCancel} />
          <Button
            label="Lag kreditnota"
            colors={colors}
            busy={busy}
            disabled={!reason.trim() || (lines.length && !chosen.length)}
            onPress={() => onConfirm({
              lineIds: scope === 'all' ? null : chosen.map((line) => line.id),
              reason: reason.trim(),
              release: workParts.length ? release : false,
            })}
            nativeID="invoice-credit-confirm"
          />
        </>
      )}
    >
      <Text style={{ color: colors.ink, lineHeight: 20 }}>
        {`Faktura ${invoice?.invoiceNumber} av ${formatDate(invoice?.invoiceDate)} rettes med en kreditnota med henvisning til fakturaen. Kreditnotaen lages som utkast og ferdigstilles og sendes som en vanlig faktura.`}
      </Text>
      {paid > 0 ? (
        <Banner tone="warn" colors={colors} title={`Kunden har betalt ${money(paid, invoice?.currency)}`}>
          Krediteres mer enn det som står utestående, får kunden penger til gode. Avtal tilbakebetaling eller motregning.
        </Banner>
      ) : null}
      {lines.length ? (
        <View style={{ gap: 10 }}>
          <Radio selected={scope === 'all'} onPress={() => setScope('all')} title="Hele fakturaen" colors={colors} />
          <Radio selected={scope === 'lines'} onPress={() => setScope('lines')} title="Velg linjer" text="Delvis kreditering. Juster beløpene i kreditnotautkastet ved behov." colors={colors} />
          {scope === 'lines' ? (
            <View style={[styles.recipients, { borderColor: colors.line }]}>
              {lines.map((line) => (
                <View key={line.id} style={[styles.recipient, { borderBottomColor: colors.line }]}>
                  <Check
                    checked={picked.has(line.id)}
                    onPress={() => setPicked((current) => {
                      const next = new Set(current);
                      if (next.has(line.id)) next.delete(line.id);
                      else next.add(line.id);
                      return next;
                    })}
                    colors={colors}
                    label={`Krediter ${line.description}`}
                  />
                  <Text style={{ color: colors.muted, fontSize: 12, width: 90 }}>{sectionLabel(line.section)}</Text>
                  <Text style={{ color: colors.ink, flex: 1 }} numberOfLines={1}>{line.description}</Text>
                  <Text style={{ color: colors.ink }}>{money(line.amountExVat, invoice?.currency)}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
      <Field label="Årsak (påkrevd, står på kreditnotaen)" value={reason} onChangeText={setReason} colors={colors} placeholder="For eksempel: Feil timepris" nativeID="invoice-credit-reason" />
      {workParts.length ? (
        <View style={{ gap: 10 }}>
          <Text style={{ color: colors.ink, lineHeight: 20 }}>
            {`Det finnes ${workParts.join(', ')} som ble fakturert på ${scope === 'all' ? 'denne fakturaen' : 'de valgte linjene'}. Skal de tilbake til «Godkjent for fakturering», slik at de kan faktureres på nytt?`}
          </Text>
          <Radio selected={release} onPress={() => setRelease(true)} title="Ja, sett dem tilbake til Til fakturering" text="Skjer når kreditnotaen ferdigstilles." colors={colors} nativeID="invoice-credit-release" />
          <Radio selected={!release} onPress={() => setRelease(false)} title="Nei, la dem stå som fakturert" colors={colors} nativeID="invoice-credit-keep" />
        </View>
      ) : null}
      <View style={[styles.sum, { borderTopColor: colors.line }]}>
        <Text style={{ color: colors.muted }}>Krediteres eks. mva</Text>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>{money(-Math.abs(amount), invoice?.currency)}</Text>
      </View>
    </DialogShell>
  );
}

export function PaymentDialog({ visible, invoice, colors, busy, onCancel, onConfirm }) {
  const outstanding = Number(invoice?.outstandingAmount ?? invoiceTotals(invoice || {}).totalDue) || 0;
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (visible) {
      setDate(new Date().toISOString().slice(0, 10));
      setAmount(outstanding > 0 ? String(outstanding).replace('.', ',') : '');
      setNote('');
    }
  }, [visible]);
  const value = Number(String(amount).replace(/\s/g, '').replace(',', '.'));
  return (
    <DialogShell
      visible={visible}
      title="Registrer betaling"
      onClose={onCancel}
      colors={colors}
      width={460}
      nativeID="invoice-payment-dialog"
      footer={(
        <>
          <Button label="Avbryt" tone="ghost" colors={colors} onPress={onCancel} />
          <Button label="Registrer betaling" colors={colors} busy={busy} disabled={!Number.isFinite(value) || !value} onPress={() => onConfirm({ date, amount: value, note: note.trim() })} nativeID="invoice-payment-confirm" />
        </>
      )}
    >
      <Text style={{ color: colors.ink }}>{`Igjen å betale: ${money(outstanding, invoice?.currency)}`}</Text>
      <DateRow label="Betalt dato" value={date} onChange={setDate} colors={colors} />
      <Field label="Beløp" value={amount} onChangeText={setAmount} colors={colors} keyboardType="decimal-pad" nativeID="invoice-payment-amount" />
      <Field label="Merknad" value={note} onChangeText={setNote} colors={colors} placeholder="For eksempel: Delbetaling" />
      <Text style={{ color: colors.muted, fontSize: 12 }}>Delbetaling er mulig. Fakturaen blir betalt når hele beløpet er registrert.</Text>
    </DialogShell>
  );
}

export function LossDialog({ visible, invoice, colors, busy, onCancel, onConfirm }) {
  const [date, setDate] = useState('');
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (visible) {
      setDate(new Date().toISOString().slice(0, 10));
      setReason('');
    }
  }, [visible]);
  const outstanding = Number(invoice?.outstandingAmount) || 0;
  return (
    <DialogShell
      visible={visible}
      title="Før som tap"
      onClose={onCancel}
      colors={colors}
      width={500}
      nativeID="invoice-loss-dialog"
      footer={(
        <>
          <Button label="Avbryt" tone="ghost" colors={colors} onPress={onCancel} />
          <Button label="Før som tap" tone="danger" colors={colors} busy={busy} disabled={!reason.trim()} onPress={() => onConfirm({ date, reason: reason.trim() })} nativeID="invoice-loss-confirm" />
        </>
      )}
    >
      <Text style={{ color: colors.ink, lineHeight: 20 }}>
        {`Restbeløpet ${money(outstanding, invoice?.currency)} føres som konstatert tap på kundefordringen (konto 7830). Utgående mva kan da tilbakeføres (merverdiavgiftsloven § 4-7).`}
      </Text>
      <DateRow label="Dato tapet er konstatert" value={date} onChange={setDate} colors={colors} />
      <Field label="Årsak (påkrevd)" value={reason} onChangeText={setReason} colors={colors} placeholder="For eksempel: Konkurs, akkord, foreldet" />
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  radio: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  radioDot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioFill: { width: 8, height: 8, borderRadius: 4 },
  date: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  inline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dates: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tabs: { flexDirection: 'row', borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9 },
  recipients: { borderWidth: 1, borderRadius: 8 },
  recipient: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  recipientInput: { flex: 1, paddingVertical: 4, fontSize: 14 },
  sum: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
});
