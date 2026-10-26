/**
 * Dokumentstyring for ett dokument: dokumenthode, innsending, godkjenning,
 * eier og godkjenner, lesekrav, lesebekreftelser og revisjonslogg.
 * Brukes av Skjemabygger (maler), HR (personalhåndbok) og oversikten.
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  READ_RULES,
  REVISION_STATES,
  ackStatus,
  approveRevision,
  canApprove,
  contentHash,
  docHeader,
  publishedRevision,
  rejectRevision,
  revisionLog,
  shouldNotify,
  submitRevision,
  updateControl,
  withdrawRevision,
  workingRevision,
  controlStatus,
  employeeName,
} from '../../src/doccontrol/model';
import { FOCUS_FIELD_BG, FOCUS_FIELD_BORDER, FOCUS_FIELD_INK } from '../../src/forms/highlight';
import { showSaveToast } from '../../src/ui/saveToast';
import { HrButton, HrCard, HrSectionTitle } from '../hr/HrShared';
import { ChoiceChips, HeaderGrid, Label, OK_INK, PersonChips, StatusChip, dateText, dayText } from './parts';

const NOTIFY = [
  { id: 'standard', label: 'Som innstillingene' },
  { id: 'ja', label: 'Varsle ansatte' },
  { id: 'nei', label: 'Ikke varsle' },
];

const INTERVALS = [6, 12, 24, 36].map((months) => ({ id: String(months), label: months === 12 ? 'Hvert år' : months % 12 ? `Hver ${months}. måned` : `Hvert ${months / 12}. år` }));

export default function DocControlPanel({
  colors,
  dc,
  control,
  create = null,
  snapshot = null,
  beforeSubmit = null,
  blocked = '',
  canEdit = true,
  filled = [],
  onPreview = null,
  title = 'Dokumentstyring',
}) {
  const [reason, setReason] = useState('');
  const [rejectNote, setRejectNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [setup, setSetup] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [showReads, setShowReads] = useState(false);
  const [code, setCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [noteBad, setNoteBad] = useState(false);
  const { actor, settings, isAdmin } = dc;

  function say(text, bad = false) {
    setNote(text);
    setNoteBad(bad);
  }

  async function store(next, message) {
    setBusy(true);
    const res = await dc.storeControl(next);
    setBusy(false);
    if (!res.ok) {
      say(res.error, true);
      return null;
    }
    if (message) {
      say(message);
      showSaveToast(message);
    }
    return res.control;
  }

  if (!control) {
    if (!create) return null;
    return (
      <HrCard colors={colors}>
        <HrSectionTitle colors={colors} title={title} subtitle="Ikke styrt ennå. Ta dokumentet inn for versjon, godkjenning og lesekrav." />
        {canEdit ? (
          <HrButton
            colors={colors}
            primary
            icon="shield-checkmark-outline"
            label={busy ? 'Lagrer …' : 'Ta inn i dokumentstyring'}
            disabled={busy}
            onPress={async () => {
              const next = create();
              if (next) await store(next, 'Dokumentet er tatt inn i dokumentstyringen. Send rev. 1 til godkjenning når det er klart.');
            }}
          />
        ) : null}
        {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}
      </HrCard>
    );
  }

  const header = docHeader(control);
  const status = controlStatus(control);
  const pub = publishedRevision(control);
  const work = workingRevision(control);
  const draftHash = snapshot ? contentHash(snapshot) : '';
  const unchanged = !!pub && !work && draftHash && draftHash === pub.contentHash;
  const approval = canApprove(control, actor, settings, { isAdmin });
  const waiting = work?.state === 'til_gjennomgang';
  const changedSince = waiting && draftHash && work.contentHash && draftHash !== work.contentHash;
  const nextRevision = work?.revision || Math.max(0, ...control.revisions.map((row) => row.revision)) + 1;
  const needsReason = nextRevision > 1 && !work?.changeReason;
  const log = revisionLog(control);
  const reads = pub && (control.readRule === 'pakrevd' || control.readRule === 'info') ? ackStatus(dc.employees, dc.acks, control) : [];
  const signed = pub && control.readRule === 'signeres'
    ? dc.employees.map((employee) => ({
      employeeId: employee.id,
      name: employeeName(employee),
      current: (filled || []).some((doc) => doc.status === 'ferdig' && doc.templateId === control.refId && doc.subject?.kind === 'employee' && doc.subject.id === employee.id),
    }))
    : [];
  const readRows = control.readRule === 'signeres' ? signed : reads;
  const readDone = readRows.filter((row) => row.current).length;
  const approverName = control.approver?.name
    || (settings.approvers.length ? settings.approvers.map((row) => row.name).join(', ') : 'administrator');
  const canSetApprover = isAdmin || (control.approver?.uid && control.approver.uid === actor.uid) || settings.approverUids.includes(actor.uid);

  async function submit() {
    if (blocked) {
      say(blocked, true);
      return;
    }
    setBusy(true);
    const snap = beforeSubmit ? await beforeSubmit() : snapshot;
    setBusy(false);
    if (!snap) return;
    const res = submitRevision(control, snap, { changeReason: reason, actor });
    if (!res.ok) {
      say(res.error, true);
      return;
    }
    const saved = await store(res.control, `Rev. ${res.revision} er sendt til godkjenning hos ${approverName}.`);
    if (saved) {
      setReason('');
      dc.notifySubmitted(saved, res.revision);
    }
  }

  async function approve() {
    const res = approveRevision(control, { actor, settings, isAdmin, currentHash: draftHash });
    if (!res.ok) {
      say(res.error, true);
      return;
    }
    const notify = shouldNotify(res.control, settings);
    const saved = await store(res.control, `Versjon ${res.revision} er godkjent og gjelder fra i dag.${notify ? ' Ansatte får varsel.' : ''}`);
    if (saved) dc.notifyPublished(saved, res.revision);
  }

  async function reject() {
    const res = rejectRevision(control, rejectNote, { actor, settings, isAdmin });
    if (!res.ok) {
      say(res.error, true);
      return;
    }
    if (await store(res.control, `Rev. ${work.revision} er sendt tilbake med merknad.`)) {
      setRejecting(false);
      setRejectNote('');
    }
  }

  async function withdraw() {
    const res = withdrawRevision(control, { actor });
    if (!res.ok) say(res.error, true);
    else await store(res.control, `Rev. ${work.revision} er trukket tilbake og kan endres.`);
  }

  function change(part) {
    const next = updateControl(control, part, { actor });
    if (next !== control) store(next, 'Endringen er lagret.');
  }

  return (
    <HrCard colors={colors}>
      <HrSectionTitle
        colors={colors}
        title={title}
        subtitle={pub ? `Gjeldende versjon ${pub.revision}, godkjent ${dateText(pub.approvedAt)} av ${pub.approvedBy || '–'}` : 'Ingen godkjent versjon ennå'}
        right={<StatusChip status={status} colors={colors} />}
      />
      <HeaderGrid header={header} colors={colors} />
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Hodet fylles ut av systemet og står øverst i PDF-en. Versjon og «Godkjent av» settes først når godkjenner har godkjent.
      </Text>

      {waiting ? (
        <View style={[styles.box, { backgroundColor: FOCUS_FIELD_BG, borderColor: FOCUS_FIELD_BORDER }]}>
          <Text style={{ color: FOCUS_FIELD_INK, fontWeight: '600' }}>
            {`Rev. ${work.revision} venter på godkjenning hos ${approverName}`}
          </Text>
          <Text style={{ color: FOCUS_FIELD_INK }}>
            {`Sendt ${dateText(work.submittedAt)}${work.submittedBy ? ` av ${work.submittedBy}` : ''}. Endring: ${work.changeReason || '–'}`}
          </Text>
          {changedSince ? (
            <Text style={{ color: colors.danger }}>Utkastet er endret etter innsending. Trekk tilbake og send på nytt, så godkjenner ser riktig versjon.</Text>
          ) : null}
          <View style={styles.row}>
            {onPreview ? <HrButton colors={colors} icon="eye-outline" label="Se innsendt versjon" onPress={() => onPreview(work.snapshot, control)} /> : null}
            {approval.ok ? (
              <>
                <HrButton colors={colors} primary icon="checkmark-done" label={busy ? 'Lagrer …' : `Godkjenn og publiser versjon ${work.revision}`} onPress={approve} disabled={busy || changedSince} />
                <HrButton colors={colors} icon="return-down-back-outline" label="Send tilbake" onPress={() => setRejecting((value) => !value)} disabled={busy} />
              </>
            ) : null}
            {canEdit ? <HrButton colors={colors} icon="arrow-undo-outline" label="Trekk tilbake" onPress={withdraw} disabled={busy} /> : null}
          </View>
          {!approval.ok ? (
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {approval.reason}
              {isAdmin && settings.fourEyes && work.submittedByUid === actor.uid ? ' Er dere bare én som kan godkjenne, kan «Fire øyne» slås av under Skjemabygger › Dokumentstyring › Innstillinger.' : ''}
            </Text>
          ) : null}
          {rejecting ? (
            <View style={{ gap: 6 }}>
              <TextInput
                value={rejectNote}
                onChangeText={setRejectNote}
                multiline
                placeholder="Hva må endres før dokumentet kan godkjennes?"
                placeholderTextColor={colors.placeholder}
                style={[styles.input, styles.multi, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
              />
              <HrButton colors={colors} danger label="Send tilbake med merknad" onPress={reject} disabled={busy} />
            </View>
          ) : null}
        </View>
      ) : null}

      {!waiting && canEdit && !snapshot && !beforeSubmit ? (
        <Text style={{ color: colors.muted }}>
          {work ? `Rev. ${work.revision} er under arbeid. Den sendes til godkjenning fra dokumentet.` : 'Endre dokumentet der det redigeres. Da starter neste revisjon av seg selv.'}
        </Text>
      ) : null}

      {!waiting && canEdit && (snapshot || beforeSubmit) ? (
        <View style={{ gap: 6 }}>
          {work?.state === 'avvist' ? (
            <View style={[styles.box, { backgroundColor: FOCUS_FIELD_BG, borderColor: FOCUS_FIELD_BORDER }]}>
              <Text style={{ color: FOCUS_FIELD_INK, fontWeight: '600' }}>{`Rev. ${work.revision} ble sendt tilbake ${dateText(work.rejectedAt)}${work.rejectedBy ? ` av ${work.rejectedBy}` : ''}`}</Text>
              <Text style={{ color: FOCUS_FIELD_INK }}>{work.rejectNote}</Text>
            </View>
          ) : null}
          {unchanged ? (
            <Text style={{ color: colors.muted }}>{`Ingen endringer siden versjon ${pub.revision}. Når dokumentet endres og lagres, starter rev. ${nextRevision} av seg selv.`}</Text>
          ) : (
            <>
              <Label colors={colors}>{work ? `Rev. ${work.revision} under arbeid` : `Rev. ${nextRevision}`}</Label>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder={nextRevision > 1 ? 'Hva er endret? Står i revisjonsloggen.' : 'Første utgave (valgfritt)'}
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { color: colors.ink, borderColor: needsReason && !reason.trim() ? FOCUS_FIELD_BORDER : colors.line, backgroundColor: needsReason && !reason.trim() ? FOCUS_FIELD_BG : colors.bg }]}
              />
              {blocked ? <Text style={{ color: FOCUS_FIELD_INK, fontSize: 13 }}>{blocked}</Text> : null}
              <HrButton
                colors={colors}
                primary
                icon="paper-plane-outline"
                label={busy ? 'Sender …' : `Send rev. ${nextRevision} til godkjenning`}
                onPress={submit}
                disabled={busy || !!blocked}
              />
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {`Godkjennes av ${approverName}.${settings.fourEyes ? ' Den som sender inn, kan ikke godkjenne selv.' : ''}`}
              </Text>
            </>
          )}
        </View>
      ) : null}

      {!!note && <Text style={{ color: noteBad ? colors.danger : colors.brand }}>{note}</Text>}

      <View style={styles.summary}>
        <Text style={{ color: colors.ink }}>
          <Text style={{ fontWeight: '600' }}>Lesekrav: </Text>
          {READ_RULES.find((row) => row.id === control.readRule)?.label}
        </Text>
        <Text style={{ color: colors.ink }}>
          <Text style={{ fontWeight: '600' }}>Neste gjennomgang: </Text>
          {dayText(control.nextReview) || 'settes ved godkjenning'}
        </Text>
        {readRows.length ? (
          <TouchableOpacity onPress={() => setShowReads((value) => !value)} accessibilityRole="button">
            <Text style={{ color: readDone === readRows.length ? OK_INK : colors.brand }}>
              {`${control.readRule === 'signeres' ? 'Signert' : 'Bekreftet lest'}: ${readDone} av ${readRows.length} ${showReads ? '▾' : '▸'}`}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {showReads ? (
        <View>
          {readRows.map((row) => (
            <View key={row.employeeId} style={[styles.line, { borderBottomColor: colors.line }]}>
              <Ionicons name={row.current ? 'checkmark-circle' : 'ellipse-outline'} size={16} color={row.current ? OK_INK : FOCUS_FIELD_BORDER} />
              <Text style={{ color: colors.ink, flex: 1 }}>{row.name}</Text>
              <Text style={{ color: row.current ? colors.muted : FOCUS_FIELD_INK, fontSize: 13 }}>
                {row.current
                  ? (row.latest ? `Versjon ${row.latest.revision} · ${dateText(row.latest.at)}` : 'Signert')
                  : (row.latest ? `Har lest versjon ${row.latest.revision}` : 'Mangler')}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.row}>
        {canEdit ? (
          <TouchableOpacity onPress={() => setSetup((value) => !value)} accessibilityRole="button" style={styles.link}>
            <Ionicons name={setup ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.brand} />
            <Text style={{ color: colors.brand }}>Eier, godkjenner og lesekrav</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => setShowLog((value) => !value)} accessibilityRole="button" style={styles.link}>
          <Ionicons name={showLog ? 'chevron-down' : 'chevron-forward'} size={14} color={colors.brand} />
          <Text style={{ color: colors.brand }}>{`Revisjonslogg${log.length ? ` (${log.length})` : ''}`}</Text>
        </TouchableOpacity>
      </View>

      {setup && canEdit ? (
        <View style={{ gap: 6 }}>
          <Label colors={colors}>Dokument-ID</Label>
          <View style={styles.row}>
            <TextInput
              value={code ?? control.code}
              onChangeText={setCode}
              placeholder="For eksempel C1-B-03-003"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { flex: 1, minWidth: 160, color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            />
            {code != null && code.trim() !== control.code ? (
              <HrButton colors={colors} label="Lagre ID" onPress={() => { change({ code: code.trim() }); setCode(null); }} />
            ) : null}
          </View>
          <Label colors={colors}>Dokumenteier</Label>
          <PersonChips colors={colors} people={dc.people} value={control.owner} onChange={(owner) => change({ owner })} />
          <Label colors={colors}>Godkjenner</Label>
          <PersonChips
            colors={colors}
            people={dc.people}
            value={control.approver}
            emptyLabel={settings.approvers.length ? 'Godkjennerne i innstillingene' : 'Administrator'}
            onChange={(approver) => change({ approver })}
            disabled={!canSetApprover}
          />
          {!canSetApprover ? <Text style={{ color: colors.muted, fontSize: 12 }}>Bare godkjenner og administrator kan bytte godkjenner.</Text> : null}
          <Label colors={colors}>Lesekrav for ansatte</Label>
          <ChoiceChips colors={colors} options={READ_RULES} value={control.readRule} onChange={(readRule) => change({ readRule })} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>{READ_RULES.find((row) => row.id === control.readRule)?.hint}</Text>
          <Label colors={colors}>Varsel ved ny versjon</Label>
          <ChoiceChips colors={colors} options={NOTIFY} value={control.notify} onChange={(notify) => change({ notify })} />
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {settings.notifyOnPublish ? 'Innstillingene: ansatte varsles når et dokument med lesekrav får ny versjon.' : 'Innstillingene: ansatte varsles ikke om nye versjoner.'}
          </Text>
          <Label colors={colors}>Gjennomgang</Label>
          <ChoiceChips colors={colors} options={INTERVALS} value={String(control.reviewIntervalMonths)} onChange={(months) => change({ reviewIntervalMonths: Number(months) })} />
        </View>
      ) : null}

      {showLog ? (
        <View style={{ gap: 4 }}>
          {log.map((row) => (
            <View key={row.revision} style={[styles.line, { borderBottomColor: colors.line, alignItems: 'flex-start' }]}>
              <Text style={{ color: colors.ink, width: 34, fontWeight: '700' }}>{row.revision}</Text>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={{ color: colors.ink }}>{row.reason || '–'}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>
                  {`${REVISION_STATES[row.state]} · endret av ${row.changedBy || '–'} · godkjent ${dateText(row.approvedAt)} av ${row.approvedBy || '–'}`}
                </Text>
              </View>
            </View>
          ))}
          {!log.length ? <Text style={{ color: colors.muted }}>Ingen godkjente versjoner ennå.</Text> : null}
          <Label colors={colors}>Historikk</Label>
          {control.history.slice(-15).reverse().map((row, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <Text key={index} style={{ color: colors.muted, fontSize: 12 }}>
              {`${dateText(row.at)} · ${row.by || '–'} · ${row.action}${row.note ? `: ${row.note}` : ''}`}
            </Text>
          ))}
        </View>
      ) : null}
    </HrCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  box: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 15 },
  multi: { minHeight: 70, textAlignVertical: 'top' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
