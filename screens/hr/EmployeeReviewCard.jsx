/**
 * Medarbeidersamtalen på Min side: forbered deg (frivillig), les gjennom og signer, og last ned
 * den signerte kopien. Svar og signatur går gjennom serveren (reviewAction). Se src/hr/reviewPrep.js.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  COMMENT_MAX, answerCount, canAnswer, copyFileName, meetingLine, reviewSummary, stampLine,
} from '../../src/hr/reviewPrep';
import { reviewAction, watchMyPreps } from '../../src/hr/reviewPrepStore';
import { formatNbDate } from '../../src/hr/model';
import { tokenContext } from '../../src/forms/tokens';
import { companyLogoOf } from '../../src/project/companyLogo';
import { useOptionalApp } from '../../src/context/AppContext';
import { showSaveToast } from '../../src/ui/saveToast';
import { radius, type } from '../../src/ui/tokens';
import { HrButton, HrCard, HrSectionTitle } from './HrShared';

const RECENT_DAYS = 120;

function firstName(name) {
  return String(name || '').trim().split(/\s+/)[0] || '';
}

async function downloadCopy(prep, family) {
  if (Platform.OS !== 'web') return false;
  const [{ buildReviewCopyPdf }, { downloadBytes }] = await Promise.all([
    import('../../src/hr/reviewCopyPdf'),
    import('../../src/indeksregulering/office'),
  ]);
  const company = tokenContext(family?.company, { fallbackName: family?.name });
  const bytes = buildReviewCopyPdf(prep.signing.doc, {
    company, logo: companyLogoOf(family?.company), employeeName: prep.employeeName, meetingDate: prep.meetingDate,
  });
  downloadBytes(copyFileName(prep), bytes, 'application/pdf');
  return true;
}

function Prepare({ colors, companyId, prep }) {
  const [answers, setAnswers] = useState(prep.answers || {});
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const leader = firstName(prep.leaderName) || 'lederen';
  // Nye svar fra serveren (annen enhet) når ingenting er endret her.
  useEffect(() => { setAnswers(prep.answers || {}); }, [prep.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  async function send(action) {
    setBusy(true);
    setNote('');
    const res = await reviewAction(companyId, prep.docId, action, { answers });
    setBusy(false);
    if (!res.ok) {
      setNote(res.error);
      return;
    }
    const message = action === 'submit' ? `Sendt til ${leader}.` : 'Utkastet er lagret.';
    setNote(message);
    showSaveToast(message);
  }

  const filled = Object.values(answers).filter((v) => String(v || '').trim()).length;
  return (
    <View style={styles.block}>
      {prep.message ? (
        <View style={[styles.quote, { borderLeftColor: colors.brand, backgroundColor: colors.bg }]}>
          <Text style={[styles.body, { color: colors.ink }]}>{prep.message}</Text>
          <Text style={[styles.small, { color: colors.muted }]}>{prep.leaderName}</Text>
        </View>
      ) : null}
      <Text style={[styles.small, { color: colors.muted }]}>
        {`Forberedelsen er frivillig. Skriv stikkord til temaene du vil ta opp, og hopp over resten. Utkastet lagres, og ${leader} får svarene når du sender inn${prep.respondBy ? `, gjerne innen ${formatNbDate(prep.respondBy)}` : ''}.`}
      </Text>
      {prep.topics.map((topic) => (
        <View key={topic.id} style={[styles.topic, { borderColor: colors.line }]}>
          <Text style={[styles.topicTitle, { color: colors.ink }]}>{`${topic.no} ${topic.title}`.trim()}</Text>
          {topic.prompts.map((p) => (
            <Text key={p} style={[styles.small, { color: colors.muted }]}>{`• ${p}`}</Text>
          ))}
          <TextInput
            value={answers[topic.id] || ''}
            onChangeText={(value) => setAnswers((prev) => ({ ...prev, [topic.id]: value }))}
            placeholder="Dine stikkord (valgfritt)"
            placeholderTextColor={colors.muted}
            multiline
            maxLength={1200}
            accessibilityLabel={topic.title}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
        </View>
      ))}
      {prep.status === 'submitted' ? (
        <Text style={[styles.small, { color: colors.successInk }]}>{`Sendt inn ${stampLine(prep.submittedAt)}. Du kan endre og sende på nytt frem til samtalen.`}</Text>
      ) : null}
      {note ? <Text style={[styles.small, { color: colors.brand }]}>{note}</Text> : null}
      <View style={styles.row}>
        <HrButton colors={colors} label="Lagre utkast" icon="save-outline" disabled={busy} onPress={() => send('save')} />
        <HrButton
          colors={colors}
          primary
          icon="paper-plane-outline"
          label={prep.status === 'submitted' ? 'Send oppdatert' : `Send til ${leader}`}
          disabled={busy || !filled}
          onPress={() => send('submit')}
          nativeID="employee-review-submit"
        />
      </View>
    </View>
  );
}

function Sign({ colors, companyId, prep, family }) {
  const [comment, setComment] = useState('');
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const company = useMemo(() => tokenContext(family?.company, { fallbackName: family?.name }), [family]);
  const summary = useMemo(() => reviewSummary(prep.signing?.doc), [prep.signing?.doc]);
  const leader = prep.leaderName || 'Lederen';

  async function sign() {
    setBusy(true);
    setNote('');
    const res = await reviewAction(companyId, prep.docId, 'sign', { comment });
    setBusy(false);
    if (!res.ok) setNote(res.error);
    else showSaveToast('Du har signert medarbeidersamtalen');
  }

  return (
    <View style={styles.block}>
      <Text style={[styles.body, { color: colors.ink }]}>
        {`${leader} signerte for ${company.firma || 'bedriften'} ${stampLine(prep.leaderSignature?.at || prep.signing?.requestedAt)}. Les gjennom det dere ble enige om, og signer.`}
      </Text>
      {summary.topics.filter((t) => t.before || t.during).map((t) => (
        <View key={t.id} style={[styles.topic, { borderColor: colors.line }]}>
          <Text style={[styles.topicTitle, { color: colors.ink }]}>{`${t.no} ${t.title}`.trim()}</Text>
          {t.before ? <Text style={[styles.small, { color: colors.muted }]}>{`Før samtalen: ${t.before}`}</Text> : null}
          {t.during ? <Text style={[styles.body, { color: colors.ink }]}>{t.during}</Text> : null}
        </View>
      ))}
      <View style={[styles.topic, { borderColor: colors.line }]}>
        <Text style={[styles.topicTitle, { color: colors.ink }]}>Handlingsplan</Text>
        {summary.plan.length ? summary.plan.map((row, i) => (
          <Text key={`${i}-${row.tiltak.slice(0, 10)}`} style={[styles.body, { color: colors.ink }]}>
            {[`${i + 1}. ${row.tiltak}`, row.ansvar && `ansvar: ${row.ansvar}`, row.frist && `frist: ${formatNbDate(row.frist)}`].filter(Boolean).join(' · ')}
          </Text>
        )) : <Text style={[styles.small, { color: colors.muted }]}>Ingen tiltak.</Text>}
      </View>
      {Platform.OS === 'web' ? (
        <View style={styles.row}>
          <HrButton colors={colors} icon="document-text-outline" label="Les hele skjemaet (PDF)" onPress={() => downloadCopy(prep, family)} />
        </View>
      ) : null}
      <Text style={[styles.small, { color: colors.muted }]}>Merknad (valgfritt). Skriv her om du ser noe annerledes eller vil legge til noe. Merknaden står i skjemaet over signaturene.</Text>
      <TextInput
        value={comment}
        onChangeText={setComment}
        placeholder="Merknad fra deg (valgfritt)"
        placeholderTextColor={colors.muted}
        multiline
        maxLength={COMMENT_MAX}
        accessibilityLabel="Merknad"
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
      />
      <TouchableOpacity onPress={() => setRead((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: read }} style={styles.check}>
        <Ionicons name={read ? 'checkbox' : 'square-outline'} size={20} color={read ? colors.brand : colors.muted} />
        <Text style={[styles.body, { color: colors.ink, flex: 1 }]}>Jeg har lest gjennom samtalen og handlingsplanen.</Text>
      </TouchableOpacity>
      {note ? <Text style={[styles.small, { color: colors.danger }]}>{note}</Text> : null}
      <View style={styles.row}>
        <HrButton colors={colors} primary icon="create" label={busy ? 'Signerer …' : 'Signer'} disabled={busy || !read} onPress={sign} nativeID="employee-review-sign" />
      </View>
      <Text style={[styles.small, { color: colors.muted }]}>Du signerer med innloggingen din. Begge får en signert kopi (PDF) på e-post.</Text>
    </View>
  );
}

function Signed({ colors, prep, family }) {
  return (
    <View style={styles.block}>
      <Text style={[styles.body, { color: colors.ink }]}>
        {`Signert av begge. Du signerte ${stampLine(prep.employeeSignature?.at)}.`}
        {prep.mail?.to?.length ? ' Kopien er sendt på e-post.' : ''}
      </Text>
      {Platform.OS === 'web' && prep.signing?.doc ? (
        <View style={styles.row}>
          <HrButton colors={colors} icon="download-outline" label="Last ned signert kopi (PDF)" onPress={() => downloadCopy(prep, family)} />
        </View>
      ) : null}
    </View>
  );
}

/** Én samtale på Min side: forberede, signere eller laste ned kopien. */
export function EmployeeReviewItem({ colors, companyId, prep, family }) {
  const subtitle = [
    meetingLine(prep) ? `Samtale ${meetingLine(prep)}` : '',
    prep.leaderName ? `med ${prep.leaderName}` : '',
  ].filter(Boolean).join(' ');
  const title = prep.status === 'signing'
    ? 'Signer medarbeidersamtalen'
    : prep.status === 'signed' ? 'Medarbeidersamtale' : 'Forbered medarbeidersamtalen';
  return (
    <HrCard colors={colors}>
      <HrSectionTitle
        colors={colors}
        title={title}
        subtitle={subtitle}
        right={canAnswer(prep) && answerCount(prep) ? (
          <Text style={[styles.caption, { color: colors.muted }]}>{`${answerCount(prep)} av ${prep.topics.length} tema`}</Text>
        ) : null}
      />
      {canAnswer(prep) ? <Prepare colors={colors} companyId={companyId} prep={prep} /> : null}
      {prep.status === 'signing' ? <Sign colors={colors} companyId={companyId} prep={prep} family={family} /> : null}
      {prep.status === 'signed' ? <Signed colors={colors} prep={prep} family={family} /> : null}
    </HrCard>
  );
}

export default function EmployeeReviewCard({ colors, companyId, uid }) {
  const family = useOptionalApp()?.family || null;
  const [preps, setPreps] = useState([]);

  useEffect(() => watchMyPreps(companyId, uid, setPreps), [companyId, uid]);

  const cutoff = new Date(Date.now() - RECENT_DAYS * 86400000).toISOString();
  const shown = preps.filter((p) => p.status !== 'signed' || String(p.employeeSignature?.at || '') >= cutoff);
  if (!shown.length) return null;

  return (
    <View style={{ gap: 12 }} nativeID="employee-review" id="employee-review">
      {shown.map((prep) => (
        <EmployeeReviewItem key={prep.docId} colors={colors} companyId={companyId} prep={prep} family={family} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: 10 },
  body: { ...type.body },
  small: { ...type.label, fontWeight: '400' },
  caption: { ...type.caption },
  quote: { borderLeftWidth: 3, borderRadius: radius.control, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  topic: { borderWidth: 1, borderRadius: radius.card, padding: 12, gap: 4 },
  topicTitle: { ...type.bodyStrong },
  input: { ...type.body, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 10, paddingVertical: 8, minHeight: 64, marginTop: 6, textAlignVertical: 'top' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
});
