import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  answerCount, defaultRespondBy, meetingLine, prepState, stampLine,
} from '../../src/hr/reviewPrep';
import { formatNbDate, localIsoDate } from '../../src/hr/model';
import { radius, type } from '../../src/ui/tokens';
import { lazyScreen } from '../../src/ui/lazyScreen';
const HrButton = lazyScreen(() => import('./HrShared'), { name: 'HrButton', pick: 'HrButton', silent: true });
const HrCard = lazyScreen(() => import('./HrShared'), { name: 'HrCard', pick: 'HrCard', silent: true });
const HrChip = lazyScreen(() => import('./HrShared'), { name: 'HrChip', pick: 'HrChip', silent: true });
const HrField = lazyScreen(() => import('./HrShared'), { name: 'HrField', pick: 'HrField', silent: true });
const HrSectionTitle = lazyScreen(() => import('./HrShared'), { name: 'HrSectionTitle', pick: 'HrSectionTitle', silent: true });

/** Bakgrunn og tekst per tone, fra paletten (lys og mørk). */
function toneColors(tone, colors) {
  if (tone === 'good') return [colors.successSoft, colors.successInk];
  if (tone === 'info') return [colors.brandSoft, colors.brandInk];
  if (tone === 'warn') return [colors.starSoft, colors.warnInk];
  return [colors.sunken, colors.muted];
}

function defaultMessage(name) {
  return `Hei${name ? ` ${name.split(' ')[0]}` : ''}! Her er temaene for medarbeidersamtalen vår. Skriv gjerne noen stikkord på forhånd om det du vil ta opp. Det er frivillig, men gjør samtalen bedre for oss begge.`;
}

function StateChip({ prep, colors }) {
  const state = prepState(prep);
  const [bg, fg] = toneColors(state.tone, colors);
  return (
    <View style={[styles.chip, { backgroundColor: bg }]}>
      <Text style={[styles.chipText, { color: fg }]}>{state.label}</Text>
    </View>
  );
}

/** Steg i flyten, så lederen ser hvor samtalen står. */
function Steps({ colors, prep }) {
  const at = { none: 0, sent: 1, submitted: 1, signing: 3, signed: 4 }[prep?.status || 'none'];
  const steps = ['Send temaene', 'Forberedelse (frivillig)', 'Samtalen', 'Signering', 'Kopi på e-post'];
  return (
    <View style={styles.steps}>
      {steps.map((label, i) => {
        const done = i < at || (prep?.status === 'submitted' && i === 1) || (prep?.status === 'signed' && i === 4);
        const now = !done && i === at;
        return (
          <View key={label} style={styles.step}>
            <View style={[styles.dot, { backgroundColor: done ? colors.successInk : now ? colors.brandInk : colors.line }]}>
              <Text style={[styles.dotText, { color: done || now ? colors.onBrand : colors.muted }]}>{done ? '✓' : String(i + 1)}</Text>
            </View>
            <Text style={[styles.stepText, { color: now ? colors.ink : colors.muted }, now && styles.stepNow]}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Forberedelse og signering over samtaleskjemaet (HR → Oppfølging og HR → Skjemaer).
 * Handlingene gjøres av HrFilledForm; panelet viser status og samler inn invitasjonen.
 */
export default function ReviewPrepPanel({
  colors, prep, employee, docDate = '', canWrite, busy,
  onInvite, onApply, onSign, onWithdraw, onRemind, onResend,
}) {
  const name = employee?.name || prep?.employeeName || 'medarbeideren';
  const first = String(name).split(' ')[0];
  const hasAccount = !!employee?.personUid;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [showAnswers, setShowAnswers] = useState(false);

  useEffect(() => {
    if (!editing) return;
    const date = prep?.meetingDate || docDate || '';
    setDraft({
      meetingDate: date,
      meetingTime: prep?.meetingTime || '',
      place: prep?.place || '',
      respondBy: prep?.respondBy || defaultRespondBy(date, localIsoDate()),
      message: prep?.message || defaultMessage(name),
    });
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const status = prep?.status || 'none';
  const count = answerCount(prep);
  const total = prep?.topics?.length || 0;
  const canInvite = canWrite && hasAccount && (status === 'none' || status === 'sent' || status === 'submitted');

  const invitationForm = draft ? (
    <View style={styles.form}>
      <View style={styles.pair}>
        <View style={styles.pairItem}>
          <HrField
            colors={colors}
            label="Dato for samtalen"
            date="iso"
            value={draft.meetingDate}
            onChangeText={(meetingDate) => setDraft((d) => ({
              ...d,
              meetingDate,
              respondBy: d.respondBy && d.respondBy !== defaultRespondBy(d.meetingDate, localIsoDate()) ? d.respondBy : defaultRespondBy(meetingDate, localIsoDate()),
            }))}
          />
        </View>
        <View style={styles.pairItem}>
          <HrField colors={colors} label="Klokkeslett" placeholder="10:00" value={draft.meetingTime} onChangeText={(meetingTime) => setDraft((d) => ({ ...d, meetingTime }))} />
        </View>
      </View>
      <View style={styles.pair}>
        <View style={styles.pairItem}>
          <HrField colors={colors} label="Sted" placeholder="Møterom, Teams …" value={draft.place} onChangeText={(place) => setDraft((d) => ({ ...d, place }))} />
        </View>
        <View style={styles.pairItem}>
          <HrField colors={colors} label="Svar ønskes innen (frivillig)" date="iso" clearable value={draft.respondBy} onChangeText={(respondBy) => setDraft((d) => ({ ...d, respondBy }))} />
        </View>
      </View>
      <HrField colors={colors} label={`Melding til ${first}`} multiline value={draft.message} onChangeText={(message) => setDraft((d) => ({ ...d, message }))} />
      <Text style={[styles.hint, { color: colors.muted }]}>
        {`${first} får varsel og e-post, og ser temaene fra skjemaet på Min side. Hen kan skrive stikkord per tema og sende inn før samtalen. Det er frivillig.`}
      </Text>
      <View style={styles.row}>
        <HrButton
          colors={colors}
          primary
          icon="paper-plane-outline"
          label={status === 'none' ? `Send temaene til ${first}` : 'Send på nytt'}
          disabled={busy || !draft.meetingDate}
          onPress={async () => {
            const ok = await onInvite?.(draft);
            if (ok) setEditing(false);
          }}
          nativeID="hr-review-invite"
        />
        {status !== 'none' ? <HrButton colors={colors} label="Avbryt" onPress={() => setEditing(false)} /> : null}
      </View>
    </View>
  ) : null;

  return (
    <HrCard colors={colors}>
      <HrSectionTitle
        colors={colors}
        title="Forberedelse og signering"
        subtitle={hasAccount
          ? `Send temaene til ${first} før samtalen, gå gjennom skjemaet sammen, og signer begge digitalt. Begge får kopi på e-post.`
          : `${name} har ikke bruker i ProTop. Inviter hen under Ansatte for å sende temaene og signere digitalt, eller skriv ut skjemaet (PDF) og signer på papir.`}
        right={prep ? <StateChip prep={prep} colors={colors} /> : null}
      />
      {hasAccount ? <Steps colors={colors} prep={prep} /> : null}

      {prep && status !== 'signed' && prep.meetingDate ? (
        <Text style={[styles.body, { color: colors.ink }]}>
          {`Samtale ${meetingLine(prep)}`}
          {prep.respondBy && (status === 'sent' || status === 'submitted') ? ` · svar ønskes innen ${formatNbDate(prep.respondBy)}` : ''}
        </Text>
      ) : null}

      {status === 'none' && canInvite && !editing ? (
        <View style={styles.row}>
          <HrButton colors={colors} primary icon="paper-plane-outline" label={`Send temaene til ${first}`} onPress={() => setEditing(true)} nativeID="hr-review-prepare" />
        </View>
      ) : null}
      {editing ? invitationForm : null}

      {(status === 'sent' || status === 'submitted') && !editing ? (
        <View style={styles.block}>
          {status === 'submitted' ? (
            <>
              <Text style={[styles.body, { color: colors.ink }]}>
                {`${first} sendte inn forberedelsen ${stampLine(prep.submittedAt)}: ${count} av ${total} tema har stikkord.`}
              </Text>
              {showAnswers ? (
                <View style={[styles.answers, { borderColor: colors.line }]}>
                  {prep.topics.filter((t) => prep.answers[t.id]).map((t) => (
                    <View key={t.id} style={{ gap: 2 }}>
                      <Text style={[styles.topic, { color: colors.ink }]}>{`${t.no} ${t.title}`}</Text>
                      <Text style={[styles.body, { color: colors.ink }]}>{prep.answers[t.id]}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
              <View style={styles.row}>
                {canWrite ? (
                  <HrButton colors={colors} primary icon="download-outline" label="Sett inn i skjemaet" disabled={busy || !count} onPress={onApply} nativeID="hr-review-apply" />
                ) : null}
                <HrChip colors={colors} label={showAnswers ? 'Skjul svarene' : 'Vis svarene'} active={showAnswers} onPress={() => setShowAnswers((v) => !v)} />
              </View>
              <Text style={[styles.hint, { color: colors.muted }]}>
                Stikkordene settes inn i kolonnen «Før samtalen». Notater du allerede har skrevet der, beholdes.
              </Text>
            </>
          ) : (
            <Text style={[styles.body, { color: colors.muted }]}>
              {`Sendt ${stampLine(prep.sentAt)}. ${first} har ikke sendt inn forberedelse ennå. Det er frivillig, så samtalen kan holdes uansett.`}
            </Text>
          )}
          {canInvite ? (
            <View style={styles.row}>
              <HrButton colors={colors} icon="create-outline" label="Endre tidspunkt eller send på nytt" onPress={() => setEditing(true)} />
            </View>
          ) : null}
        </View>
      ) : null}

      {hasAccount && canWrite && status !== 'signing' && status !== 'signed' && !editing ? (
        <View style={[styles.block, styles.after, { borderTopColor: colors.line }]}>
          <Text style={[styles.topic, { color: colors.ink }]}>Etter samtalen</Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            {`Når skjemaet og handlingsplanen er fylt ut sammen: signer for bedriften og send til ${first}. Skjemaet låses, ${first} leser det på Min side, kan skrive en merknad og signerer med egen innlogging. Begge får en signert kopi (PDF) på e-post.`}
          </Text>
          <View style={styles.row}>
            <HrButton colors={colors} primary icon="create" label={`Signer og send til ${first}`} disabled={busy} onPress={onSign} nativeID="hr-review-sign" />
          </View>
        </View>
      ) : null}

      {status === 'signing' ? (
        <View style={styles.block}>
          <Text style={[styles.body, { color: colors.ink }]}>
            {`Du signerte ${stampLine(prep.leaderSignature?.at || prep.signing?.requestedAt)}. Venter på at ${first} signerer på Min side. Skjemaet er låst så lenge.`}
          </Text>
          {canWrite ? (
            <View style={styles.row}>
              <HrButton colors={colors} icon="notifications-outline" label="Send påminnelse" disabled={busy} onPress={onRemind} />
              <HrButton colors={colors} icon="arrow-undo-outline" label="Trekk tilbake for å endre" disabled={busy} onPress={onWithdraw} nativeID="hr-review-withdraw" />
            </View>
          ) : null}
        </View>
      ) : null}

      {status === 'signed' ? (
        <View style={styles.block}>
          <Text style={[styles.body, { color: colors.ink }]}>
            {[
              prep.leaderSignature ? `${prep.leaderSignature.name} signerte ${stampLine(prep.leaderSignature.at)}` : '',
              prep.employeeSignature ? `${prep.employeeSignature.name} signerte ${stampLine(prep.employeeSignature.at)}` : '',
            ].filter(Boolean).join('. ')}.
          </Text>
          {prep.comment ? (
            <Text style={[styles.body, { color: colors.ink }]}>{`Merknad fra ${first}: ${prep.comment}`}</Text>
          ) : null}
          <Text style={[styles.body, { color: prep.mail?.to?.length ? colors.muted : colors.danger }]}>
            {prep.mail?.to?.length
              ? `Kopi sendt på e-post til ${prep.mail.to.join(' og ')} ${stampLine(prep.mail.sentAt)}.`
              : `Kopien er ikke sendt på e-post${prep.mail?.failed?.length ? ` (${prep.mail.failed.join('; ')})` : ''}.`}
          </Text>
          {canWrite ? (
            <View style={styles.row}>
              <HrButton colors={colors} icon="mail-outline" label="Send kopi på nytt" disabled={busy} onPress={onResend} />
            </View>
          ) : null}
        </View>
      ) : null}
    </HrCard>
  );
}

const styles = StyleSheet.create({
  chip: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { ...type.caption, fontWeight: '600' },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginVertical: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 20, height: 20, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  dotText: { ...type.caption, fontWeight: '600' },
  stepText: { ...type.caption },
  stepNow: { fontWeight: '600' },
  body: { ...type.body },
  hint: { ...type.label, fontWeight: '400' },
  topic: { ...type.bodyStrong },
  block: { gap: 8, marginTop: 4 },
  after: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, marginTop: 8 },
  answers: { gap: 10, borderWidth: 1, borderRadius: radius.card, padding: 12 },
  form: { gap: 8, marginTop: 4 },
  pair: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  pairItem: { flexGrow: 1, flexBasis: 220, minWidth: 200 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
