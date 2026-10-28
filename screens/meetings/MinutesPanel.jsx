/**
 * Referat: sammendrag (selv eller med AI), sjekkliste før ferdigstilling,
 * og forhåndsvisning av referatet eller innkallingen slik PDF-en blir.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import { finalizeChecks } from '../../src/meetings/flow';
import { isClosed, isLocked } from '../../src/meetings/model';
import { minutesDocument } from '../../src/meetings/minutesDoc';
import { summarizeMeeting } from '../../src/meetings/ai';
import {
  Banner, Btn, Card, Choice, Label, Pill,
} from './meetingUi';

const MARK_TONE = {
  T: ['#dcfce7', '#166534'], F: ['#fef3c7', '#92400e'], IM: ['#fee2e2', '#991b1b'], K: ['#eef2f6', '#475569'], '–': ['#f1f5f9', '#94a3b8'],
};

function Paper({ doc }) {
  const ink = '#111827';
  const muted = '#6b7280';
  const brand = '#1099F4';
  const navy = '#07274C';
  const minutes = doc.kind === 'referat';
  return (
    <View style={styles.paper} nativeID="minutes-paper">
      <View style={styles.paperBand} />
      {doc.draft ? <Text style={styles.watermark} pointerEvents="none">UTKAST</Text> : null}
      <View style={styles.pHead}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.pLabel, { color: brand }]}>{doc.label}</Text>
            {doc.draft ? <Text style={styles.pDraft}>UTKAST</Text> : null}
          </View>
          <Text style={[styles.pTitle, { color: navy }]}>{doc.title}</Text>
          <Text style={{ color: muted, fontSize: 13 }}>{doc.subtitle}</Text>
        </View>
        {doc.company ? <Text style={{ color: navy, fontWeight: '800', fontSize: 15 }}>{doc.company}</Text> : null}
      </View>
      <View style={styles.pFacts}>
        {doc.facts.map((f) => (
          <View key={f.label} style={styles.pFact}>
            <Text style={styles.pFactLabel}>{f.label.toUpperCase()}</Text>
            <Text style={{ color: ink, fontSize: 13, fontWeight: f.label === 'Dato' ? '700' : '400' }}>{f.value}</Text>
          </View>
        ))}
      </View>
      {doc.keyline ? <Text style={{ color: muted, fontSize: 12 }}>{doc.keyline}</Text> : null}
      {!minutes && doc.purpose ? (
        <View style={[styles.pAccent, { borderLeftColor: brand, backgroundColor: '#e8f4fe' }]}>
          <Text style={[styles.pAccentLabel, { color: brand }]}>FORMÅL</Text>
          <Text style={{ color: ink, fontSize: 13, lineHeight: 19 }}>{doc.purpose}</Text>
        </View>
      ) : null}
      {doc.summary ? (
        <View style={[styles.pAccent, { borderLeftColor: brand, backgroundColor: '#e8f4fe' }]}>
          <Text style={[styles.pAccentLabel, { color: brand }]}>SAMMENDRAG</Text>
          <Text style={{ color: ink, fontSize: 13, lineHeight: 19 }}>{doc.summary}</Text>
        </View>
      ) : null}
      <Text style={[styles.pH2, { color: navy }]}>Deltakere <Text style={{ color: muted, fontSize: 12 }}>{doc.participants.length}</Text></Text>
      <View>
        {doc.participants.map((p) => (
          <View key={p.id} style={styles.pRow}>
            <View style={{ flex: 2 }}>
              <Text style={{ color: ink, fontWeight: '700', fontSize: 12.5 }}>{p.name}</Text>
              <Text style={{ color: muted, fontSize: 11 }}>{[p.company, p.title].filter(Boolean).join(' · ')}</Text>
            </View>
            <Text style={{ flex: 1, color: ink, fontSize: 12 }}>{p.role}</Text>
            <Text style={{ flex: 1.6, color: ink, fontSize: 12 }} numberOfLines={1}>{p.email}</Text>
            {minutes || p.mark === 'K' ? (
              <Text style={[styles.pMark, { backgroundColor: MARK_TONE[p.mark]?.[0], color: MARK_TONE[p.mark]?.[1] }]}>{p.mark}</Text>
            ) : <View style={{ width: 26 }} />}
          </View>
        ))}
        <Text style={{ color: '#9ca3af', fontSize: 10.5, marginTop: 4 }}>{doc.legend}</Text>
      </View>
      <Text style={[styles.pH2, { color: navy }]}>{minutes ? 'Saker' : 'Dagsorden'}</Text>
      {doc.sections.map((section) => (
        <View key={section.id} style={{ gap: 6, marginBottom: 6 }}>
          <View style={[styles.pChapter, { borderBottomColor: '#e5e7eb' }]}>
            <Text style={{ color: brand, fontWeight: '800', fontSize: 14, width: 30 }}>{section.number}</Text>
            <Text style={{ color: navy, fontWeight: '800', fontSize: 14 }}>{section.title}</Text>
          </View>
          {section.items.map((item) => {
            const empty = minutes && !item.notes && !item.decisions.length && !item.actions.length;
            return (
              <View key={item.id} style={{ flexDirection: 'row', gap: 0, marginBottom: empty ? 0 : 6 }}>
                <Text style={{ width: 30, color: muted, fontWeight: '700', fontSize: 12 }}>{item.number}</Text>
                <View style={{ flex: 1, gap: 4 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ flex: 1, color: ink, fontWeight: '700', fontSize: 13 }}>{item.title}</Text>
                    {!minutes && item.start ? <Text style={{ color: muted, fontSize: 11.5 }}>kl. {item.start.replace(':', '.')}</Text> : null}
                    {empty ? <Text style={{ color: '#9ca3af', fontSize: 11 }}>Ingen merknader</Text> : null}
                    {minutes && item.carried ? <Text style={{ color: '#b45309', fontSize: 10.5, fontWeight: '800' }}>Videreført</Text> : null}
                  </View>
                  {item.presenter || (!minutes && item.minutes) ? (
                    <Text style={{ color: muted, fontSize: 11 }}>{[item.presenter ? `Innleder: ${item.presenter}` : '', !minutes && item.minutes ? `${item.minutes} min` : ''].filter(Boolean).join('  ·  ')}</Text>
                  ) : null}
                  {!minutes && item.description ? <Text style={{ color: '#374151', fontSize: 12, lineHeight: 17 }}>{item.description}</Text> : null}
                  {minutes && item.notes ? <Text style={{ color: ink, fontSize: 12.5, lineHeight: 18 }}>{item.notes}</Text> : null}
                  {item.decisions.map((d) => (
                    <View key={d} style={[styles.pBlock, { backgroundColor: '#f0fdf4', borderLeftColor: '#15803d' }]}>
                      <Text style={[styles.pBlockLabel, { color: '#15803d' }]}>BESLUTNING</Text>
                      <Text style={{ color: ink, fontSize: 12.5 }}>{d}</Text>
                    </View>
                  ))}
                  {item.actions.filter((a) => minutes || !a.done).map((a) => (
                    <View key={a.id} style={[styles.pBlock, { backgroundColor: a.done ? '#f8fafc' : '#fffbeb', borderLeftColor: a.done ? '#15803d' : '#c26a05', flexDirection: 'row', gap: 10 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pBlockLabel, { color: a.done ? '#15803d' : '#c26a05' }]}>OPPFØLGING{a.done ? ' · UTFØRT' : ''}{a.origin ? `   ${a.origin.toUpperCase()}` : ''}</Text>
                        <Text style={{ color: a.done ? muted : ink, fontSize: 12.5 }}>{a.text}</Text>
                      </View>
                      <View style={{ width: 110 }}>
                        <Text style={styles.pBlockMeta}>ANSVARLIG</Text>
                        <Text style={{ color: ink, fontSize: 12, fontWeight: '700' }}>{a.assignee || '–'}</Text>
                      </View>
                      <View style={{ width: 80 }}>
                        <Text style={styles.pBlockMeta}>FRIST</Text>
                        <Text style={{ color: ink, fontSize: 12 }}>{a.due || '–'}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      ))}
      {minutes && doc.actions.length ? (
        <View style={{ gap: 4 }}>
          <Text style={[styles.pH2, { color: navy }]}>Oppfølgingsliste <Text style={{ color: muted, fontSize: 12 }}>{doc.actions.filter((a) => !a.done).length} åpne</Text></Text>
          {doc.actions.map((a) => (
            <View key={a.id} style={styles.pRow}>
              <Text style={{ width: 34, color: muted, fontWeight: '700', fontSize: 12 }}>{a.itemNumber}</Text>
              <Text style={{ flex: 3, color: a.done ? muted : ink, fontSize: 12 }}>{a.text}</Text>
              <Text style={{ flex: 1.3, color: ink, fontSize: 12 }}>{a.assignee || '–'}</Text>
              <Text style={{ width: 80, color: ink, fontSize: 12 }}>{a.due || '–'}</Text>
              <Text style={[styles.pMark, { width: 46, backgroundColor: a.done ? '#dcfce7' : '#fef3c7', color: a.done ? '#166534' : '#92400e' }]}>{a.done ? 'Utført' : 'Åpen'}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {doc.next ? (
        <View style={[styles.pAccent, { borderLeftColor: navy, backgroundColor: '#f5f7fa', marginTop: 10 }]}>
          <Text style={[styles.pAccentLabel, { color: navy }]}>NESTE MØTE</Text>
          <Text style={{ color: ink, fontSize: 13 }}>{doc.next}</Text>
        </View>
      ) : null}
      <View style={styles.pFoot}>
        <Text style={{ color: muted, fontSize: 10.5, flex: 1 }}>{doc.footerLeft}</Text>
      </View>
    </View>
  );
}

function PdfFrame({ bytesFor }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let made = '';
    try {
      const bytes = bytesFor();
      made = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      setUrl(made);
    } catch {
      setUrl('');
    }
    return () => { if (made) URL.revokeObjectURL(made); };
  }, [bytesFor]);
  if (!url) return null;
  return React.createElement('iframe', {
    src: `${url}#toolbar=0&view=FitH`,
    title: 'PDF',
    style: { border: 0, width: '100%', height: 900, borderRadius: 12, background: '#525659' },
  });
}

export default function MinutesPanel({
  meeting, onChange, readOnly, canManage, company, width, companyId, remoteAi = true, onFinalize, onDownload, pdfBytes, busy,
}) {
  const colors = useColors();
  const [kind, setKind] = useState(meeting.status === 'utkast' || meeting.status === 'innkalt' ? 'innkalling' : 'referat');
  const [view, setView] = useState('side');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState('');
  const wide = width >= 1000;
  const locked = isLocked(meeting);
  const doc = useMemo(() => minutesDocument(meeting, { kind, company }), [meeting, kind, company]);
  const checks = useMemo(() => finalizeChecks(meeting), [meeting]);
  const bytesFor = useMemo(() => () => pdfBytes(kind), [pdfBytes, kind, meeting]); // eslint-disable-line react-hooks/exhaustive-deps

  async function writeSummary() {
    setAiBusy(true);
    setAiNote('');
    const result = await summarizeMeeting(meeting, { companyId }, { remote: remoteAi });
    onChange({ ...meeting, summary: result.summary, summarySource: result.engine === 'lokal' ? 'manuell' : 'ai' });
    setAiNote(result.note || (result.engine === 'lokal' ? 'Laget lokalt fra beslutninger og notater.' : 'Skrevet av AI. Les over og rett før du ferdigstiller.'));
    setAiBusy(false);
  }

  const side = (
    <View style={[{ gap: 12 }, wide && { width: 380 }]}>
      <Card style={{ gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink, flex: 1 }}>Sammendrag</Text>
          {meeting.summarySource === 'ai' ? <Pill label="AI" icon="sparkles" tone="violet" small /> : null}
        </View>
        {readOnly ? (
          <Text style={{ fontSize: 14, color: meeting.summary ? colors.ink : colors.muted, lineHeight: 21 }}>{meeting.summary || 'Ingen sammendrag.'}</Text>
        ) : (
          <>
            <TextInput
              nativeID="minutes-summary"
              value={meeting.summary}
              onChangeText={(v) => onChange({ ...meeting, summary: v, summarySource: meeting.summarySource === 'ai' ? 'ai' : 'manuell' })}
              multiline
              placeholder="Kort om hva møtet kom fram til. Står øverst i referatet."
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Sammendrag"
              style={[styles.area, { color: colors.ink, borderColor: colors.line }]}
            />
            <Btn label={meeting.summary ? 'Skriv på nytt med AI' : 'Skriv sammendrag med AI'} icon="sparkles" tone="ai" busy={aiBusy} onPress={writeSummary} nativeID="minutes-ai-summary" />
            {aiNote ? <Text style={{ fontSize: 12, color: colors.muted }}>{aiNote}</Text> : null}
          </>
        )}
      </Card>

      {!locked && canManage ? (
        <Card style={{ gap: 10 }}>
          <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>{checks.ok ? 'Klart til ferdigstilling' : 'Dette mangler'}</Text>
          {checks.blocking.map((c) => (
            <View key={c.id} style={styles.check}><Ionicons name="close-circle" size={17} color="#dc2626" /><Text style={{ flex: 1, fontSize: 13.5, color: colors.ink }}>{c.text}</Text></View>
          ))}
          {checks.warnings.map((c) => (
            <View key={c.id} style={styles.check}><Ionicons name="warning" size={16} color="#d97706" /><Text style={{ flex: 1, fontSize: 13.5, color: colors.ink }}>{c.text}</Text></View>
          ))}
          {checks.ok && !checks.warnings.length ? (
            <View style={styles.check}><Ionicons name="checkmark-circle" size={17} color="#16a34a" /><Text style={{ flex: 1, fontSize: 13.5, color: colors.ink }}>Alt ser bra ut.</Text></View>
          ) : null}
          <Text style={{ fontSize: 12.5, color: colors.muted, lineHeight: 18 }}>
            Ferdigstilt referat låses og lagres som PDF. Må noe rettes senere, gjenåpner du det med en begrunnelse, og neste versjon får ny revisjon.
          </Text>
          <Btn label="Ferdigstill referat" icon="lock-closed-outline" tone="primary" disabled={!checks.ok} busy={busy === 'finalize'} onPress={onFinalize} nativeID="minutes-finalize" />
        </Card>
      ) : null}

      {isClosed(meeting) ? (
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="lock-closed" size={16} color="#16a34a" />
            <Text style={{ fontSize: 15, fontWeight: '800', color: colors.ink }}>Ferdigstilt</Text>
            {meeting.revision > 1 ? <Pill label={`Revisjon ${meeting.revision}`} tone="warn" small /> : null}
          </View>
          <Text style={{ fontSize: 13, color: colors.muted }}>
            {meeting.finalizedAt ? new Date(meeting.finalizedAt).toLocaleString('nb-NO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Oslo' }) : ''}{meeting.finalizedByName ? ` av ${meeting.finalizedByName}` : ''}
          </Text>
          {meeting.archive.length ? (
            <View style={{ gap: 6 }}>
              <Label>Arkiv</Label>
              {meeting.archive.slice().reverse().map((file) => (
                <Btn key={`${file.revision}-${file.at}`} small tone="ghost" icon="document-attach-outline" label={`${file.revision > 1 ? `Revisjon ${file.revision}` : 'Referat'} (PDF)`} onPress={() => onDownload('archive', file)} />
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.split, !wide && { flexDirection: 'column' }]}>
      {side}
      <View style={{ flex: 1, minWidth: 0, gap: 10, width: wide ? undefined : '100%' }}>
        <View style={styles.toolbar}>
          <Choice
            small
            options={[{ id: 'referat', label: 'Referat', icon: 'document-text-outline' }, { id: 'innkalling', label: 'Innkalling', icon: 'mail-outline' }]}
            value={kind}
            onChange={setKind}
            nativeIDPrefix="minutes-kind"
          />
          {Platform.OS === 'web' ? (
            <Choice small options={[{ id: 'side', label: 'Side' }, { id: 'pdf', label: 'PDF' }]} value={view} onChange={setView} nativeIDPrefix="minutes-view" />
          ) : null}
          <View style={{ flex: 1 }} />
          <Btn small label="Last ned PDF" icon="download-outline" tone="ghost" onPress={() => onDownload(kind)} nativeID="minutes-download" />
        </View>
        {kind === 'referat' && !isClosed(meeting) ? (
          <Banner tone="info" icon="eye-outline">Forhåndsvisning av referatet slik det blir. Det står «Utkast» til det er ferdigstilt.</Banner>
        ) : null}
        <View style={[styles.desk, { backgroundColor: colors.sunken, borderColor: colors.line }]}>
          {view === 'pdf' && Platform.OS === 'web' ? <PdfFrame bytesFor={bytesFor} /> : <Paper doc={doc} />}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  split: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  area: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, minHeight: 130, fontSize: 14, lineHeight: 21, textAlignVertical: 'top' },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  desk: { borderWidth: 1, borderRadius: 16, padding: 18, alignItems: 'center' },
  paper: {
    width: '100%', maxWidth: 760, backgroundColor: '#fff', borderRadius: 4, paddingHorizontal: 44, paddingTop: 30, paddingBottom: 24, gap: 12,
    shadowColor: '#0f172a', shadowOpacity: 0.12, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, overflow: 'hidden',
  },
  paperBand: { position: 'absolute', top: 0, left: 0, right: 0, height: 5, backgroundColor: '#1099F4' },
  watermark: {
    position: 'absolute', top: 260, left: 0, right: 0, textAlign: 'center', fontSize: 110, fontWeight: '900', color: 'rgba(15,23,42,0.045)',
    transform: [{ rotate: '-35deg' }],
  },
  pHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  pLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  pDraft: { fontSize: 9.5, fontWeight: '800', color: '#b45309', backgroundColor: '#fef3c7', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, overflow: 'hidden', letterSpacing: 0.6 },
  pTitle: { fontSize: 26, fontWeight: '800', letterSpacing: -0.4, marginTop: 4 },
  pFacts: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#f6f8fa', borderRadius: 10, padding: 14, rowGap: 10 },
  pFact: { width: '33.3%', paddingRight: 10, gap: 2 },
  pFactLabel: { fontSize: 9.5, fontWeight: '800', color: '#6b7280', letterSpacing: 0.6 },
  pAccent: { borderLeftWidth: 3, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10, gap: 4 },
  pAccentLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.7 },
  pH2: { fontSize: 16, fontWeight: '800', marginTop: 10 },
  pRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eef0f3' },
  pMark: { width: 26, textAlign: 'center', fontSize: 10, fontWeight: '800', borderRadius: 8, paddingVertical: 2, overflow: 'hidden' },
  pChapter: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 5, marginTop: 6 },
  pBlock: { borderLeftWidth: 3, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7, gap: 2 },
  pBlockLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 0.6 },
  pBlockMeta: { fontSize: 8.5, fontWeight: '800', color: '#6b7280', letterSpacing: 0.4 },
  pFoot: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 8, marginTop: 14 },
});
