/**
 * Deltakere: ansatte og eksterne, rolle (møteleder, referent, deltaker, kopi),
 * oppmøte og om de skal innkalles til neste møte i serien.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';
import OptionPicker from '../../components/OptionPicker';
import {
  PARTICIPANT_ROLES, attendanceCounts, createMeetingId, invitees, text,
} from '../../src/meetings/model';
import {
  Avatar, Banner, Btn, Card, Check, Field, IconBtn, Label, Pill,
} from './meetingUi';

const MARKS = [
  { id: 'tilstede', short: 'Til stede', color: '#16a34a', bg: '#dcfce7' },
  { id: 'forfall', short: 'Forfall', color: '#b45309', bg: '#fef3c7' },
  { id: 'fravaer', short: 'Ikke møtt', color: '#b91c1c', bg: '#fee2e2' },
];

function Attendance({ value, onChange, readOnly, name }) {
  const colors = useColors();
  if (readOnly) {
    const mark = MARKS.find((m) => m.id === value);
    return mark ? <Pill label={mark.short} tone={value === 'tilstede' ? 'success' : (value === 'forfall' ? 'warn' : 'danger')} small dot /> : <Text style={{ color: colors.muted, fontSize: 12.5 }}>Ikke registrert</Text>;
  }
  return (
    <View style={[styles.att, { borderColor: colors.line, backgroundColor: colors.sunken }]} accessibilityRole="radiogroup" accessibilityLabel={`Oppmøte for ${name}`}>
      {MARKS.map((m) => {
        const active = value === m.id;
        return (
          <Pressable
            key={m.id}
            onPress={() => onChange(active ? 'ukjent' : m.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={m.short}
            style={[styles.attItem, active && { backgroundColor: m.bg }]}
          >
            <Text style={{ fontSize: 12, fontWeight: active ? '800' : '500', color: active ? m.color : colors.muted }}>{m.short}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ParticipantsPanel({ meeting, onChange, readOnly, people = [], width, live }) {
  const colors = useColors();
  const [adding, setAdding] = useState(false);
  const [ext, setExt] = useState({ name: '', company: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const wide = width >= 900;
  const list = meeting.participants;
  const counts = attendanceCounts(meeting);
  const roleOptions = PARTICIPANT_ROLES.map((r) => ({ id: r.id, label: r.label }));
  const already = useMemo(() => new Set(list.map((p) => p.employeeId).filter(Boolean)), [list]);
  const addable = people.filter((p) => !already.has(p.id)).map((p) => ({ id: p.id, label: p.name, hint: [p.title, p.company].filter(Boolean).join(' · ') }));

  const set = (participants) => onChange({ ...meeting, participants });
  const patch = (id, p) => set(list.map((row) => {
    if (row.id !== id) {
      // Bare én møteleder og én referent.
      if (p.role && (p.role === 'leder' || p.role === 'referent') && row.role === p.role) return { ...row, role: 'deltaker' };
      return row;
    }
    return { ...row, ...p };
  }));

  function addEmployee(id) {
    const p = people.find((row) => row.id === id);
    if (!p) return;
    set([...list, {
      id: createMeetingId('dlt'), employeeId: p.id, uid: p.uid, name: p.name, company: p.company, email: p.email, phone: p.phone,
      title: p.title, photoUrl: p.photoUrl, role: 'deltaker', attendance: live ? 'tilstede' : 'ukjent', inviteNext: true, external: false,
    }]);
  }

  function addExternal() {
    if (!text(ext.name)) { setError('Skriv navnet til deltakeren.'); return; }
    if (ext.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text(ext.email))) { setError('E-postadressen ser ikke riktig ut.'); return; }
    set([...list, {
      id: createMeetingId('dlt'), employeeId: '', uid: '', name: text(ext.name), company: text(ext.company), email: text(ext.email).toLowerCase(),
      phone: text(ext.phone), title: '', photoUrl: '', role: 'deltaker', attendance: live ? 'tilstede' : 'ukjent', inviteNext: true, external: true,
    }]);
    setExt({ name: '', company: '', email: '', phone: '' });
    setError('');
    setAdding(false);
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.top, !wide && { flexDirection: 'column', alignItems: 'stretch' }]}>
        <View style={styles.counts}>
          <Pill label={`${counts.tilstede} til stede`} tone="success" dot />
          {counts.forfall ? <Pill label={`${counts.forfall} forfall`} tone="warn" dot /> : null}
          {counts.fravaer ? <Pill label={`${counts.fravaer} ikke møtt`} tone="danger" dot /> : null}
          {counts.ukjent ? <Pill label={`${counts.ukjent} ikke registrert`} tone="muted" dot /> : null}
          <Pill label={`${list.filter((p) => p.role === 'kopi').length} kopi`} tone="muted" />
        </View>
        {!readOnly ? (
          <View style={styles.tools}>
            {counts.ukjent ? (
              <Btn small label="Alle til stede" icon="checkmark-done" tone="ghost" onPress={() => set(list.map((p) => (p.role !== 'kopi' && p.attendance === 'ukjent' ? { ...p, attendance: 'tilstede' } : p)))} nativeID="participants-all-present" />
            ) : null}
            <View style={{ minWidth: 240 }}>
              <OptionPicker options={addable} value="" onChange={(id) => id && addEmployee(id)} placeholder="Legg til fra bedriften" searchable chipLimit={0} clearable={false} title="Legg til deltaker" />
            </View>
            <Btn small label="Ekstern deltaker" icon="person-add-outline" tone="soft" onPress={() => setAdding((v) => !v)} nativeID="participants-external" />
          </View>
        ) : null}
      </View>

      {adding ? (
        <Card style={{ gap: 10 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>Ekstern deltaker</Text>
          {error ? <Banner tone="danger" icon="alert-circle">{error}</Banner> : null}
          <View style={styles.extRow}>
            <Field label="Navn" value={ext.name} onChange={(v) => setExt({ ...ext, name: v })} style={{ flex: 1, minWidth: 180 }} nativeID="ext-name" autoFocus />
            <Field label="Bedrift" value={ext.company} onChange={(v) => setExt({ ...ext, company: v })} style={{ flex: 1, minWidth: 160 }} />
            <Field label="E-post" value={ext.email} onChange={(v) => setExt({ ...ext, email: v })} keyboardType="email-address" style={{ flex: 1, minWidth: 200 }} nativeID="ext-email" />
            <Field label="Telefon" value={ext.phone} onChange={(v) => setExt({ ...ext, phone: v })} keyboardType="phone-pad" style={{ width: 140 }} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn small label="Legg til" icon="add" tone="primary" onPress={addExternal} nativeID="ext-add" />
            <Btn small label="Avbryt" tone="plain" onPress={() => { setAdding(false); setError(''); }} />
          </View>
        </Card>
      ) : null}

      {!invitees(meeting).length ? (
        <Banner tone="warn" icon="people-outline">Møtet har ingen deltakere ennå. Legg til ansatte fra bedriften eller eksterne deltakere.</Banner>
      ) : null}

      <View style={[styles.table, { borderColor: colors.line, backgroundColor: colors.card }]}>
        {wide ? (
          <View style={[styles.headRow, { backgroundColor: colors.sunken, borderBottomColor: colors.line }]}>
            <Text style={[styles.th, { flex: 2.2, color: colors.muted }]}>NAVN</Text>
            <Text style={[styles.th, { width: 170, color: colors.muted }]}>ROLLE</Text>
            <Text style={[styles.th, { flex: 1.6, color: colors.muted }]}>KONTAKT</Text>
            <Text style={[styles.th, { width: 236, color: colors.muted }]}>OPPMØTE</Text>
            <Text style={[styles.th, { width: 86, color: colors.muted, textAlign: 'center' }]}>INNKALLES{'\n'}NESTE</Text>
            <View style={{ width: 30 }} />
          </View>
        ) : null}
        {list.map((p, i) => (
          <View key={p.id} style={[styles.row, i > 0 && { borderTopWidth: 1, borderTopColor: colors.line }, !wide && styles.rowStack]} nativeID={`participant-${p.id}`}>
            <View style={[styles.who, wide && { flex: 2.2 }]}>
              <Avatar name={p.name} photoUrl={p.photoUrl} size={36} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 14.5, fontWeight: '700', color: colors.ink }} numberOfLines={1}>{p.name}</Text>
                  {p.external ? <Pill label="Ekstern" small tone="muted" /> : null}
                  {p.role === 'leder' ? <Pill label="Møteleder" icon="ribbon" small tone="brand" /> : null}
                  {p.role === 'referent' ? <Pill label="Referent" icon="create" small tone="violet" /> : null}
                </View>
                <Text style={{ fontSize: 12.5, color: colors.muted }} numberOfLines={1}>{[p.title, p.company].filter(Boolean).join(' · ') || '–'}</Text>
              </View>
            </View>
            <View style={wide ? { width: 170 } : styles.cell}>
              {!wide ? <Label>Rolle</Label> : null}
              {readOnly ? <Text style={{ color: colors.ink }}>{PARTICIPANT_ROLES.find((r) => r.id === p.role)?.label}</Text> : (
                <OptionPicker small options={roleOptions} value={p.role} onChange={(role) => role && patch(p.id, { role })} clearable={false} chipLimit={0} title={`Rolle for ${p.name}`} />
              )}
            </View>
            <View style={wide ? { flex: 1.6, minWidth: 0 } : styles.cell}>
              {p.email ? (
                <View style={styles.contact}><Ionicons name="mail-outline" size={13} color={colors.muted} /><Text style={{ fontSize: 13, color: colors.ink }} numberOfLines={1}>{p.email}</Text></View>
              ) : (
                <View style={styles.contact}><Ionicons name="alert-circle-outline" size={13} color="#b45309" /><Text style={{ fontSize: 12.5, color: '#b45309' }}>Mangler e-post</Text></View>
              )}
              {p.phone ? <View style={styles.contact}><Ionicons name="call-outline" size={13} color={colors.muted} /><Text style={{ fontSize: 13, color: colors.muted }}>{p.phone}</Text></View> : null}
            </View>
            <View style={wide ? { width: 236 } : styles.cell}>
              {p.role === 'kopi' ? <Text style={{ fontSize: 12.5, color: colors.muted }}>Får referatet, deltar ikke</Text> : (
                <Attendance value={p.attendance} readOnly={readOnly} name={p.name} onChange={(attendance) => patch(p.id, { attendance })} />
              )}
            </View>
            <View style={[wide ? { width: 86, alignItems: 'center' } : styles.cell]}>
              <Check checked={p.inviteNext} disabled={readOnly} onPress={() => patch(p.id, { inviteNext: !p.inviteNext })} label={wide ? undefined : 'Innkalles til neste møte'} a11y={`Innkall ${p.name} til neste møte`} />
            </View>
            {!readOnly ? <IconBtn icon="close" label={`Fjern ${p.name}`} onPress={() => set(list.filter((row) => row.id !== p.id))} /> : <View style={{ width: 30 }} />}
          </View>
        ))}
      </View>
      <Text style={{ fontSize: 12, color: colors.muted }}>
        Møteleder og referent kan endre møtet og ferdigstille referatet. Kopi får referatet på e-post, men er ikke kalt inn. Oppmøtet står i referatet.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'space-between', flexWrap: 'wrap' },
  counts: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tools: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  extRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  table: { borderWidth: 1, borderRadius: 14, overflow: 'hidden' },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 9, borderBottomWidth: 1 },
  th: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
  rowStack: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  cell: { gap: 4 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  att: { flexDirection: 'row', borderWidth: 1, borderRadius: 9, padding: 2, alignSelf: 'flex-start' },
  attItem: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 7 },
});
