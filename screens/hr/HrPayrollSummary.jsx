import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useTimesheetWorkspace } from '../arbeid/useTimesheetWorkspace';
import {
  approveMonthPayouts,
  buildPayrollSummary,
  cancelOvertimePayout,
  monthBounds,
  payoutRowsFor,
  PAYOUT_RATES,
} from '../../src/arbeid/payroll.js';
import {
  buildPayrollMail,
  normalizePayrollRun,
  normalizePayrollSettings,
  payrollLinesFor,
  payrollMonthName,
} from '../../src/arbeid/payrollMail.js';
import {
  loadPayrollRun,
  loadPayrollSettings,
  savePayrollRun,
  savePayrollSettings,
  sendPayrollRun,
} from '../../src/arbeid/payrollStore.js';
import { formatHours, parseHours } from '../../src/arbeid/hours.js';
import { employeeDisplayName } from '../../src/arbeid/roles.js';
import { formatNbDate } from '../../src/hr/model';
import {
  EmptyHint, HrButton, HrCard, HrField, HrSectionTitle,
} from './HrShared';
import { radius, type } from '../../src/ui/tokens';
import { companyDisplayName } from '../../src/utils/companyName';

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Forrige måned: lønnsgrunnlaget lages etter at måneden er låst. */
function defaultMonth() {
  const now = new Date();
  return shiftMonth(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, -1);
}

const STATUS_TEXT = {
  draft: 'Utkast – ikke godkjent',
  approved: 'Godkjent – ikke sendt',
  sent: 'Sendt til regnskapsfører',
};

function stamp(iso) {
  if (!iso) return '';
  const date = formatNbDate(String(iso).slice(0, 10));
  const time = String(iso).slice(11, 16);
  return time ? `${date} kl. ${time}` : date;
}

/** Faste (hver måned) og månedens egne linjer for én ansatt. */
function LineEditor({ colors, title, lines, onChange, nativeID }) {
  const rows = lines.length ? lines : [];
  return (
    <View style={styles.lineBlock} nativeID={nativeID}>
      <Text style={[styles.label, { color: colors.muted }]}>{title}</Text>
      {rows.map((row, index) => (
        <View key={`${index}`} style={styles.lineRow}>
          <TextInput
            value={row.label}
            onChangeText={(value) => onChange(rows.map((item, i) => (i === index ? { ...item, label: value } : item)))}
            placeholder="For eksempel: Ekstra månedlig skattetrekk"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.flex, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            accessibilityLabel="Hva"
          />
          <TextInput
            value={row.value}
            onChangeText={(value) => onChange(rows.map((item, i) => (i === index ? { ...item, value } : item)))}
            placeholder="1000,-"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.amount, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            accessibilityLabel="Verdi"
          />
          <TouchableOpacity onPress={() => onChange(rows.filter((_, i) => i !== index))} accessibilityRole="button" accessibilityLabel="Fjern linje">
            <Ionicons name="close-circle-outline" size={20} color={colors.muted} />
          </TouchableOpacity>
        </View>
      ))}
      <TouchableOpacity onPress={() => onChange([...rows, { label: '', value: '' }])} accessibilityRole="button">
        <Text style={[styles.link, { color: colors.brand }]}>+ Legg til linje</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmployeeBlock({
  colors, row, editable, open, onToggle, recurring, extra, note, onRecurring, onExtra, onNote,
}) {
  const lines = payrollLinesFor(row);
  return (
    <View style={[styles.person, { borderColor: colors.line }]} nativeID={`lonn-ansatt-${row.employeeId}`}>
      <Pressable
        onPress={editable ? onToggle : undefined}
        style={styles.personHead}
        accessibilityRole={editable ? 'button' : undefined}
        accessibilityLabel={editable ? `Endre linjer for ${row.name}` : undefined}
      >
        <View style={styles.flex}>
          <Text style={[styles.name, { color: colors.ink }]}>{row.name}</Text>
          {lines.map((line) => (
            <Text key={line} style={[styles.body, { color: colors.ink }]}>{`• ${line}`}</Text>
          ))}
          {row.payoutPending ? (
            <Text style={[styles.caption, { color: colors.brand }]}>Uttak fra timebanken venter på godkjenning.</Text>
          ) : null}
        </View>
        {editable ? (
          <View style={styles.editHint}>
            <Ionicons name={open ? 'chevron-up' : 'create-outline'} size={16} color={colors.brand} />
            <Text style={[styles.link, { color: colors.brand }]}>{open ? 'Lukk' : 'Endre'}</Text>
          </View>
        ) : null}
      </Pressable>
      {editable && open ? (
        <View style={styles.editor}>
          <LineEditor
            colors={colors}
            title="Fast hver måned (f.eks. ekstra skattetrekk)"
            lines={recurring}
            onChange={onRecurring}
            nativeID={`lonn-fast-${row.employeeId}`}
          />
          <LineEditor
            colors={colors}
            title={`Bare for ${payrollMonthName(row.month || '')}`.trim()}
            lines={extra}
            onChange={onExtra}
            nativeID={`lonn-maaned-${row.employeeId}`}
          />
          <HrField colors={colors} label="Merknad til regnskapsfører" value={note} onChangeText={onNote} multiline />
        </View>
      ) : null}
    </View>
  );
}

/**
 * HR › Lønn: månedens lønnsgrunnlag (overtid, mertid fra timebanken, sykdom og kjøring) til
 * regnskapsfører. Leder ser over, godkjenner og sender. Se src/arbeid/payroll.js.
 */
export default function HrPayrollSummary({ colors, familyId, canWrite = false }) {
  const { user, userProfile, family } = useApp();
  const [month, setMonth] = useState(defaultMonth);
  const { from, to } = monthBounds(month);
  const workspace = useTimesheetWorkspace({
    companyId: familyId,
    fromDate: from,
    toDate: to,
    absences: { fromDate: from, toDate: to },
  });
  const [settings, setSettings] = useState(() => normalizePayrollSettings({}));
  const [settingsDraft, setSettingsDraft] = useState(null);
  const [run, setRun] = useState(() => normalizePayrollRun({}, month));
  const [loaded, setLoaded] = useState(false);
  const [openId, setOpenId] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(false);
  const actorName = String(userProfile?.displayName || user?.displayName || '').trim();

  useEffect(() => {
    let live = true;
    if (!familyId) return undefined;
    loadPayrollSettings(familyId).then((next) => { if (live) setSettings(next); }).catch(() => {});
    return () => { live = false; };
  }, [familyId]);

  useEffect(() => {
    let live = true;
    setLoaded(false);
    setOpenId('');
    setNote('');
    setError('');
    if (!familyId) return undefined;
    loadPayrollRun(familyId, month)
      .then((next) => { if (live) { setRun(next); setLoaded(true); } })
      .catch(() => { if (live) { setRun(normalizePayrollRun({}, month)); setLoaded(true); setError('Kunne ikke hente lønnsgrunnlaget.'); } });
    return () => { live = false; };
  }, [familyId, month]);

  const draft = run.status === 'draft';
  const editable = canWrite && draft;
  const liveRows = useMemo(() => buildPayrollSummary({
    month,
    employees: workspace.employees,
    state: workspace.state,
    recurring: settings.recurring,
    extra: run.extra,
    notes: run.notes,
  }), [month, workspace.employees, workspace.state, settings.recurring, run.extra, run.notes]);
  const rows = draft ? liveRows : run.rows;
  const payouts = payoutRowsFor(workspace.state.balanceAdjustments, { month });
  const nameOf = (id) => employeeDisplayName(workspace.employees.find((row) => row.id === id)) || 'Ukjent';
  const mail = buildPayrollMail({
    month, rows, companyName: companyDisplayName(family), senderName: run.approvedByName || actorName, note: run.note,
  });

  async function persistRun(next) {
    const saved = await savePayrollRun(familyId, month, next);
    setRun(saved);
    return saved;
  }

  async function patchRun(patch) {
    if (!editable) return;
    setRun((current) => ({ ...current, ...patch }));
    try {
      await persistRun({ ...run, ...patch });
    } catch {
      setError('Kunne ikke lagre.');
    }
  }

  async function saveRecurring(employeeId, lines) {
    const recurring = { ...settings.recurring, [employeeId]: lines };
    setSettings((current) => ({ ...current, recurring }));
    try {
      setSettings(await savePayrollSettings(familyId, { ...settings, recurring }));
    } catch {
      setError('Kunne ikke lagre de faste linjene.');
    }
  }

  // Tekstfelt lagres når feltet forlates eller etter en kort pause, ikke for hvert tegn.
  const [pending, setPending] = useState(null);
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setTimeout(() => {
      const { kind, employeeId, value } = pending;
      setPending(null);
      if (kind === 'recurring') saveRecurring(employeeId, value);
      if (kind === 'extra') patchRun({ extra: { ...run.extra, [employeeId]: value } });
      if (kind === 'note') patchRun({ notes: { ...run.notes, [employeeId]: value } });
      if (kind === 'mailNote') patchRun({ note: value });
    }, 700);
    return () => clearTimeout(timer);
  }, [pending]);

  function localEdit(kind, employeeId, value) {
    if (kind === 'recurring') setSettings((current) => ({ ...current, recurring: { ...current.recurring, [employeeId]: value } }));
    if (kind === 'extra') setRun((current) => ({ ...current, extra: { ...current.extra, [employeeId]: value } }));
    if (kind === 'note') setRun((current) => ({ ...current, notes: { ...current.notes, [employeeId]: value } }));
    if (kind === 'mailNote') setRun((current) => ({ ...current, note: value }));
    setPending({ kind, employeeId, value });
  }

  function removePayout(row) {
    if (!editable) return;
    const result = cancelOvertimePayout(workspace.state, { id: row.id, force: true });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    workspace.setState(result.state);
    setNote(`Uttaket for ${nameOf(row.employeeId)} er fjernet. Timene står i timebanken igjen.`);
  }

  async function send() {
    setBusy(true);
    setError('');
    const result = await sendPayrollRun(familyId, month);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      loadPayrollRun(familyId, month).then(setRun).catch(() => {});
      return;
    }
    setRun(result.run);
    setNote(`Sendt til ${result.run.sentTo.join(', ')}.`);
  }

  async function approve() {
    if (!editable || busy) return;
    if (!rows.length) {
      setError('Ingen ansatte å ta med for måneden.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await persistRun({
        ...run,
        status: 'approved',
        rows,
        approvedAt: new Date().toISOString(),
        approvedByUid: user?.uid || '',
        approvedByName: actorName,
        sentAt: '',
        sentTo: [],
        sendError: '',
      });
      // Uttakene fra timebanken står som godkjent, så den ansatte ikke endrer dem etterpå.
      const approved = approveMonthPayouts(workspace.state, { month, byUid: user?.uid || '' });
      if (approved.ok && approved.state !== workspace.state) workspace.setState(approved.state);
      setNote('Lønnsgrunnlaget er godkjent.');
    } catch {
      setBusy(false);
      setError('Kunne ikke godkjenne. Prøv igjen.');
      return;
    }
    setBusy(false);
    if (settings.autoSend && settings.accountantEmail) await send();
  }

  async function reopen() {
    if (!canWrite || busy) return;
    setBusy(true);
    try {
      await persistRun({ ...run, status: 'draft', approvedAt: '', approvedByUid: '', approvedByName: '' });
      setNote('Lønnsgrunnlaget er åpnet igjen. Godkjenn på nytt når det er rettet.');
    } catch {
      setError('Kunne ikke åpne igjen.');
    }
    setBusy(false);
  }

  async function saveSettings() {
    if (!settingsDraft) return;
    try {
      const next = await savePayrollSettings(familyId, { ...settings, ...settingsDraft });
      if (settingsDraft.accountantEmail && !next.accountantEmail) {
        setError('E-postadressen er ikke gyldig.');
        return;
      }
      setSettings(next);
      setSettingsDraft(null);
      setNote('Regnskapsfører er lagret.');
    } catch {
      setError('Kunne ikke lagre regnskapsfører.');
    }
  }

  const monthSwitch = (
    <View style={styles.monthSwitch}>
      <TouchableOpacity onPress={() => setMonth((m) => shiftMonth(m, -1))} accessibilityRole="button" accessibilityLabel="Forrige måned" nativeID="lonn-forrige">
        <Ionicons name="chevron-back" size={20} color={colors.ink} />
      </TouchableOpacity>
      <Text style={[styles.monthText, { color: colors.ink }]} nativeID="lonn-maaned">{payrollMonthName(month)}</Text>
      <TouchableOpacity onPress={() => setMonth((m) => shiftMonth(m, 1))} accessibilityRole="button" accessibilityLabel="Neste måned" nativeID="lonn-neste">
        <Ionicons name="chevron-forward" size={20} color={colors.ink} />
      </TouchableOpacity>
    </View>
  );

  const statusLine = [
    STATUS_TEXT[run.status],
    run.approvedAt ? `godkjent ${stamp(run.approvedAt)}${run.approvedByName ? ` av ${run.approvedByName}` : ''}` : '',
    run.sentAt ? `sendt ${stamp(run.sentAt)} til ${run.sentTo.join(', ')}` : '',
  ].filter(Boolean).join(' · ');

  return (
    <HrCard colors={colors}>
      <View nativeID="hr-lonnsgrunnlag" style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title="Lønnsgrunnlag til regnskapsfører"
          subtitle="Overtid, mertid fra timebanken, sykdom og kjøring for måneden. Se over, godkjenn og send."
          right={monthSwitch}
        />

        <View style={[styles.status, { borderColor: colors.line, backgroundColor: colors.bg }]} nativeID="lonn-status">
          <Ionicons
            name={run.status === 'sent' ? 'checkmark-done' : run.status === 'approved' ? 'checkmark' : 'create-outline'}
            size={16}
            color={run.status === 'draft' ? colors.muted : colors.brand}
          />
          <Text style={[styles.body, styles.flex, { color: colors.ink }]}>{loaded ? statusLine : 'Henter …'}</Text>
        </View>
        {run.sendError ? <Text style={[styles.caption, { color: colors.danger }]}>{`Forrige sending feilet: ${run.sendError}`}</Text> : null}

        {payouts.length ? (
          <View style={styles.lineBlock} nativeID="lonn-uttak">
            <Text style={[styles.label, { color: colors.muted }]}>Mertid tatt ut av timebanken</Text>
            {payouts.map((row) => (
              <View key={row.id} style={styles.payoutRow}>
                <Text style={[styles.body, styles.flex, { color: colors.ink }]}>
                  {`${nameOf(row.employeeId)}: ${formatHours(-parseHours(row.hours))} t som ${(PAYOUT_RATES.find((r) => r.id === row.rate) || PAYOUT_RATES[0]).label.toLowerCase()}`}
                  {row.status === 'approved' ? ' · godkjent' : ' · venter'}
                </Text>
                {editable ? (
                  <TouchableOpacity onPress={() => removePayout(row)} accessibilityRole="button" accessibilityLabel={`Fjern uttaket for ${nameOf(row.employeeId)}`}>
                    <Text style={[styles.link, { color: colors.danger }]}>Fjern</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
          </View>
        ) : null}

        {!workspace.ready || !workspace.employeesReady ? (
          <EmptyHint colors={colors} text="Henter timer, fravær og kjøring …" />
        ) : rows.length === 0 ? (
          <EmptyHint colors={colors} text="Ingen egne ansatte i måneden." />
        ) : rows.map((row) => (
          <EmployeeBlock
            key={row.employeeId}
            colors={colors}
            row={{ ...row, month }}
            editable={editable}
            open={openId === row.employeeId}
            onToggle={() => setOpenId((id) => (id === row.employeeId ? '' : row.employeeId))}
            recurring={settings.recurring[row.employeeId] || []}
            extra={run.extra[row.employeeId] || []}
            note={run.notes[row.employeeId] || ''}
            onRecurring={(value) => localEdit('recurring', row.employeeId, value)}
            onExtra={(value) => localEdit('extra', row.employeeId, value)}
            onNote={(value) => localEdit('note', row.employeeId, value)}
          />
        ))}

        {editable ? (
          <HrField
            colors={colors}
            label="Tekst nederst i e-posten (valgfritt)"
            value={run.note}
            onChangeText={(value) => localEdit('mailNote', '', value)}
            multiline
          />
        ) : null}

        <TouchableOpacity onPress={() => setPreview((v) => !v)} accessibilityRole="button" nativeID="lonn-forhandsvis">
          <Text style={[styles.link, { color: colors.brand }]}>{preview ? 'Skjul e-posten' : 'Vis e-posten som sendes'}</Text>
        </TouchableOpacity>
        {preview ? (
          <View style={[styles.preview, { borderColor: colors.line, backgroundColor: colors.bg }]} nativeID="lonn-epost">
            <Text style={[styles.label, { color: colors.muted }]}>{`Til: ${settings.accountantEmail || '(ikke satt)'}`}</Text>
            <Text style={[styles.label, { color: colors.ink }]}>{mail.subject}</Text>
            <Text style={[styles.mono, { color: colors.ink }]}>{mail.text}</Text>
          </View>
        ) : null}

        {error ? <Text style={[styles.caption, { color: colors.danger }]} nativeID="lonn-feil">{error}</Text> : null}
        {note ? <Text style={[styles.caption, { color: colors.brand }]}>{note}</Text> : null}

        {canWrite ? (
          <View style={styles.actions}>
            {draft ? (
              <HrButton
                colors={colors}
                primary
                icon="checkmark"
                label={settings.autoSend && settings.accountantEmail ? 'Godkjenn og send' : 'Godkjenn'}
                onPress={approve}
                disabled={busy || !loaded || !workspace.ready || !rows.length}
                nativeID="lonn-godkjenn"
              />
            ) : (
              <>
                <HrButton
                  colors={colors}
                  primary
                  icon="send"
                  label={run.status === 'sent' ? 'Send på nytt' : 'Send til regnskapsfører'}
                  onPress={send}
                  disabled={busy || !settings.accountantEmail}
                  nativeID="lonn-send"
                />
                <HrButton colors={colors} icon="create-outline" label="Åpne for endring" onPress={reopen} disabled={busy} nativeID="lonn-apne" />
              </>
            )}
          </View>
        ) : null}
        {canWrite && !settings.accountantEmail ? (
          <Text style={[styles.caption, { color: colors.muted }]}>Legg inn e-posten til regnskapsfører under for å kunne sende.</Text>
        ) : null}

        <View style={[styles.settings, { borderColor: colors.line }]} nativeID="lonn-regnskapsforer">
          <View style={styles.personHead}>
            <View style={styles.flex}>
              <Text style={[styles.name, { color: colors.ink }]}>Regnskapsfører</Text>
              <Text style={[styles.body, { color: colors.muted }]}>
                {settings.accountantEmail
                  ? `${settings.accountantName ? `${settings.accountantName} · ` : ''}${settings.accountantEmail}${settings.ccEmail ? ` · kopi ${settings.ccEmail}` : ''}${settings.autoSend ? ' · sendes når det godkjennes' : ''}`
                  : 'Ikke satt opp'}
              </Text>
            </View>
            {canWrite && !settingsDraft ? (
              <TouchableOpacity onPress={() => setSettingsDraft({ ...settings })} accessibilityRole="button" nativeID="lonn-regnskapsforer-endre">
                <Text style={[styles.link, { color: colors.brand }]}>Endre</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {settingsDraft ? (
            <View style={styles.editor}>
              <HrField colors={colors} label="Navn" value={settingsDraft.accountantName} onChangeText={(v) => setSettingsDraft((d) => ({ ...d, accountantName: v }))} placeholder="For eksempel: Aina, JLR" />
              <HrField colors={colors} label="E-post" value={settingsDraft.accountantEmail} onChangeText={(v) => setSettingsDraft((d) => ({ ...d, accountantEmail: v }))} placeholder="navn@regnskap.no" keyboardType="email-address" />
              <HrField colors={colors} label="Kopi til (valgfritt)" value={settingsDraft.ccEmail} onChangeText={(v) => setSettingsDraft((d) => ({ ...d, ccEmail: v }))} keyboardType="email-address" />
              <Pressable
                onPress={() => setSettingsDraft((d) => ({ ...d, autoSend: !d.autoSend }))}
                style={styles.check}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: !!settingsDraft.autoSend }}
                nativeID="lonn-autosend"
              >
                <View style={[styles.box, { borderColor: settingsDraft.autoSend ? colors.brand : colors.line, backgroundColor: settingsDraft.autoSend ? colors.brand : 'transparent' }]}>
                  {settingsDraft.autoSend ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Text style={[styles.body, styles.flex, { color: colors.ink }]}>Send automatisk når lønnsgrunnlaget godkjennes</Text>
              </Pressable>
              <View style={styles.actions}>
                <HrButton colors={colors} primary label="Lagre" onPress={saveSettings} nativeID="lonn-regnskapsforer-lagre" />
                <HrButton colors={colors} label="Avbryt" onPress={() => setSettingsDraft(null)} />
              </View>
            </View>
          ) : null}
        </View>
      </View>
    </HrCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  flex: { flex: 1, minWidth: 0 },
  body: { ...type.body },
  caption: { ...type.caption },
  label: { ...type.caption, fontWeight: '600' },
  name: { ...type.bodyStrong },
  link: { ...type.label },
  mono: { ...type.body, fontFamily: 'monospace', fontSize: 13 },
  monthSwitch: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthText: { ...type.bodyStrong, minWidth: 120, textAlign: 'center' },
  status: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.card, padding: 10,
  },
  person: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 8 },
  personHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  editHint: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  editor: { gap: 10, paddingLeft: 4 },
  lineBlock: { gap: 6 },
  lineRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  payoutRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    ...type.body, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 10, paddingVertical: 8,
  },
  amount: { width: 110 },
  preview: { borderWidth: 1, borderRadius: radius.card, padding: 12, gap: 6 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  settings: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 10 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: {
    width: 20, height: 20, borderRadius: 4, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
});
