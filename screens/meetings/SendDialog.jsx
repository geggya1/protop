/**
 * Utsending av innkalling eller referat: mottakere, emne, melding og vedlegg.
 * Kan også markere som sendt uten e-post (sendt på annen måte).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import DialogShell from '../economy/invoice/DialogShell';
import { finalizeChecks, invitationChecks } from '../../src/meetings/flow';
import { invitees, minutesRecipients } from '../../src/meetings/model';
import { invitationSubject, invitationText, minutesSubject, minutesText } from '../../src/meetings/mailText';
import { minutesFileName } from '../../src/meetings/minutesDoc';
import { icsFileName } from '../../src/meetings/ics';
import {
  Avatar, Banner, Btn, Check, Choice, Field, Label, Pill,
} from './meetingUi';

export default function SendDialog({
  visible, kind = 'innkalling', meeting, onClose, onSend, busy, viewer, company, demo,
}) {
  const colors = useColors();
  const people = useMemo(() => (kind === 'referat' ? minutesRecipients(meeting) : invitees(meeting)), [kind, meeting]);
  const withMail = people.filter((p) => p.email);
  const [picked, setPicked] = useState([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [attachPdf, setAttachPdf] = useState(true);
  const [attachIcs, setAttachIcs] = useState(true);
  const [calendar, setCalendar] = useState(true);
  const [channel, setChannel] = useState('epost');
  const update = kind === 'innkalling' && meeting.deliveries.some((d) => d.kind === 'innkalling');

  useEffect(() => {
    if (!visible) return;
    const sender = { senderName: viewer?.name, companyName: company?.name };
    setPicked(withMail.map((p) => p.email));
    setSubject(kind === 'referat' ? minutesSubject(meeting) : invitationSubject(meeting));
    setBody(kind === 'referat' ? minutesText(meeting, sender) : invitationText(meeting, { ...sender, update }));
    setAttachPdf(true);
    setAttachIcs(true);
    setCalendar(true);
    setChannel('epost');
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;
  const checks = kind === 'referat' ? { ok: true, blocking: [], warnings: [] } : invitationChecks(meeting);
  const finalize = kind === 'referat' && !['ferdigstilt', 'sendt'].includes(meeting.status) ? finalizeChecks(meeting) : null;
  const manual = channel === 'manuell';
  const canGo = checks.ok && (manual || picked.length > 0) && (!finalize || finalize.ok);
  const toggle = (email) => setPicked((list) => (list.includes(email) ? list.filter((e) => e !== email) : [...list, email]));
  const title = kind === 'referat' ? 'Send referat' : (update ? 'Send oppdatert innkalling' : 'Send innkalling');

  return (
    <DialogShell
      visible
      title={title}
      onClose={onClose}
      colors={colors}
      width={720}
      nativeID="send-dialog"
      footer={(
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Btn label="Avbryt" tone="ghost" onPress={onClose} />
          <Btn
            label={manual ? 'Marker som sendt' : `Send til ${picked.length} ${picked.length === 1 ? 'mottaker' : 'mottakere'}`}
            icon={manual ? 'checkmark' : 'paper-plane-outline'}
            tone="primary"
            disabled={!canGo}
            busy={busy}
            nativeID="send-confirm"
            onPress={() => onSend({
              to: manual ? [] : picked, subject, text: body, attachPdf, attachIcs, calendar: kind === 'innkalling' && calendar, manual,
            })}
          />
        </View>
      )}
    >
      {checks.blocking.map((c) => <Banner key={c.id} tone="danger" icon="close-circle">{c.text}</Banner>)}
      {checks.warnings.map((c) => <Banner key={c.id} tone="warn" icon="warning">{c.text}</Banner>)}
      {demo ? <Banner tone="info" icon="flask-outline">Demo: ingen e-post sendes. Utsendelsen registreres som om den gikk.</Banner> : null}
      <View style={{ gap: 6 }}>
        <Label>Hvordan</Label>
        <Choice
          options={[{ id: 'epost', label: 'Send på e-post', icon: 'mail-outline' }, { id: 'manuell', label: 'Sendt på annen måte', icon: 'checkmark-done-outline' }]}
          value={channel}
          onChange={setChannel}
          nativeIDPrefix="send-channel"
        />
      </View>
      {!manual ? (
        <>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Label style={{ flex: 1 }}>Mottakere</Label>
              <Btn small tone="plain" label={picked.length === withMail.length ? 'Fjern alle' : 'Velg alle'} onPress={() => setPicked(picked.length === withMail.length ? [] : withMail.map((p) => p.email))} />
            </View>
            <View style={[styles.people, { borderColor: colors.line }]}>
              {people.map((p) => (
                <View key={p.id} style={styles.person}>
                  <Check checked={!!p.email && picked.includes(p.email)} disabled={!p.email} onPress={() => toggle(p.email)} a11y={`Send til ${p.name}`} />
                  <Avatar name={p.name} photoUrl={p.photoUrl} size={26} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontSize: 13.5, color: colors.ink, fontWeight: '600' }} numberOfLines={1}>{p.name}</Text>
                    <Text style={{ fontSize: 12, color: p.email ? colors.muted : '#b45309' }} numberOfLines={1}>{p.email || 'Mangler e-post'}</Text>
                  </View>
                  {p.role === 'kopi' ? <Pill label="Kopi" small /> : null}
                  {p.role === 'leder' ? <Pill label="Møteleder" small tone="brand" /> : null}
                </View>
              ))}
            </View>
          </View>
          <Field label="Emne" value={subject} onChange={setSubject} nativeID="send-subject" />
          <Field label="Melding" value={body} onChange={setBody} multiline minHeight={220} nativeID="send-text" />
          <View style={{ gap: 8 }}>
            <Label>Vedlegg</Label>
            {kind === 'referat' ? (
              <Check checked label={minutesFileName(meeting, 'referat')} disabled />
            ) : (
              <>
                <Check checked={attachPdf} onPress={() => setAttachPdf((v) => !v)} label={`Innkalling som PDF (${minutesFileName(meeting, 'innkalling')})`} />
                <Check checked={attachIcs} onPress={() => setAttachIcs((v) => !v)} label={`Kalenderfil (${icsFileName(meeting)})`} />
              </>
            )}
          </View>
        </>
      ) : (
        <Text style={{ fontSize: 13.5, color: colors.muted, lineHeight: 20 }}>
          {kind === 'referat'
            ? 'Referatet registreres som sendt uten at ProTop sender e-post. Bruk dette når det er delt på annen måte.'
            : 'Møtet registreres som innkalt uten at ProTop sender e-post, for eksempel når innkallingen er sendt fra Outlook.'}
        </Text>
      )}
      {kind === 'innkalling' ? (
        <Check checked={calendar} onPress={() => setCalendar((v) => !v)} label="Legg møtet i deltakernes kalender i ProTop" />
      ) : null}
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  people: { borderWidth: 1, borderRadius: 12, padding: 6, gap: 2 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, paddingVertical: 6 },
});
