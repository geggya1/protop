import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatNbDate } from '../../src/hr/model';
import { radius, space, type } from '../../src/ui/tokens';
import { EmptyHint, HrButton, HrChip } from '../hr/HrShared';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Mottaker fra kunderegisteret: kontaktpersonen hvis den finnes, ellers kunden. */
export function recipientFromCustomer(c) {
  const email = String(c?.email || c?.invoiceEmail || '').trim();
  return {
    customerId: String(c?.id || ''),
    customerName: String(c?.name || '').trim(),
    name: String(c?.contactName || (c?.kind === 'person' ? c?.name : '') || '').trim(),
    email,
  };
}

function statusText(r, anonymous) {
  if (r.status === 'failed') return `Ikke sendt: ${r.error || 'feil'}`;
  if (r.status === 'pending') return 'Ikke sendt ennå';
  if (!anonymous && r.answered) return `Svarte ${formatNbDate(r.answeredAt)}`;
  const bits = [`Sendt ${formatNbDate(r.sentAt)}`];
  if (r.reminders) bits.push(`purret ${r.reminders} ${r.reminders === 1 ? 'gang' : 'ganger'}`);
  return bits.join(' · ');
}

/**
 * Mottakerne for en kundeundersøkelse: listen fra serveren, og å legge til fra kunderegisteret
 * eller med e-post. I en anonym undersøkelse vises ikke hvem som har svart.
 */
export default function CustomerSurveyRecipients({
  colors, survey, recipients, customers, canWrite, busy, onAdd, onRemove,
}) {
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const closed = survey.status === 'closed';
  const taken = useMemo(() => new Set((recipients || []).map((r) => r.email.toLowerCase())), [recipients]);
  const candidates = useMemo(() => (customers || [])
    .map((c) => ({ c, r: recipientFromCustomer(c) }))
    .filter(({ r }) => EMAIL.test(r.email) && !taken.has(r.email.toLowerCase()))
    .filter(({ c, r }) => {
      const q = query.trim().toLowerCase();
      return !q || [c.name, c.contactName, r.email, c.customerNumber].some((v) => String(v || '').toLowerCase().includes(q));
    })
    .sort((a, b) => a.r.customerName.localeCompare(b.r.customerName, 'nb')), [customers, taken, query]);
  const withoutEmail = (customers || []).filter((c) => !EMAIL.test(recipientFromCustomer(c).email)).length;
  const chosen = candidates.filter(({ c }) => picked[c.id]).map(({ r }) => r);

  const addPicked = async () => {
    if (!chosen.length) return;
    if (await onAdd(chosen)) {
      setPicked({});
      setPicking(false);
    }
  };
  const addManual = async () => {
    const e = email.trim();
    if (!EMAIL.test(e)) return;
    if (await onAdd([{ name: name.trim(), email: e, customerName: name.trim() }])) {
      setName('');
      setEmail('');
    }
  };

  const answered = (recipients || []).filter((r) => r.answered).length;
  return (
    <View style={styles.stack} nativeID="customer-survey-recipients">
      <View style={styles.headRow}>
        <Text style={[styles.title, { color: colors.ink }]}>{`Mottakere (${(recipients || []).length})`}</Text>
        {canWrite && !closed ? (
          <HrChip colors={colors} label={picking ? 'Lukk kunderegisteret' : 'Velg fra kunderegisteret'} active={picking} onPress={() => setPicking((v) => !v)} nativeID="customer-survey-pick" />
        ) : null}
      </View>
      {survey.anonymous && survey.status !== 'draft' ? (
        <Text style={[styles.caption, { color: colors.muted }]}>Anonym undersøkelse: du ser hvem som har fått den, men ikke hvem som har svart. Påminnelsen går bare til dem som ikke har svart.</Text>
      ) : null}
      {!survey.anonymous && survey.status !== 'draft' && recipients?.length ? (
        <Text style={[styles.caption, { color: colors.muted }]}>{`${answered} av ${recipients.length} har svart.`}</Text>
      ) : null}

      {picking ? (
        <View style={[styles.box, { borderColor: colors.line }]} nativeID="customer-survey-picker">
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Søk etter kunde, kontaktperson eller e-post"
            placeholderTextColor={colors.muted}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <View style={styles.headRow}>
            <Text style={[styles.caption, { color: colors.muted }]}>
              {`${candidates.length} kunder med e-post${withoutEmail ? ` · ${withoutEmail} uten e-post vises ikke` : ''}`}
            </Text>
            {candidates.length ? (
              <HrChip
                colors={colors}
                label={chosen.length === candidates.length ? 'Fjern alle' : 'Velg alle'}
                onPress={() => setPicked(chosen.length === candidates.length ? {} : Object.fromEntries(candidates.map(({ c }) => [c.id, true])))}
              />
            ) : null}
          </View>
          <View style={styles.pickList}>
            {candidates.slice(0, 200).map(({ c, r }) => {
              const on = !!picked[c.id];
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setPicked((p) => ({ ...p, [c.id]: !on }))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={[styles.pickRow, { borderColor: colors.line }]}
                  nativeID={`customer-survey-pick-${c.id}`}
                >
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.brandInk || colors.brand : colors.muted} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.body, { color: colors.ink }]} numberOfLines={1}>{r.customerName}</Text>
                    <Text style={[styles.caption, { color: colors.muted }]} numberOfLines={1}>{[r.name, r.email].filter(Boolean).join(' · ')}</Text>
                  </View>
                </Pressable>
              );
            })}
            {!candidates.length ? <EmptyHint colors={colors} text={customers?.length ? 'Ingen flere kunder med e-post.' : 'Kunderegisteret er tomt. Legg til mottakere med e-post under.'} /> : null}
          </View>
          <View style={styles.actions}>
            <HrButton colors={colors} primary icon="add" label={`Legg til valgte (${chosen.length})`} disabled={!chosen.length || busy} onPress={addPicked} nativeID="customer-survey-add-picked" />
          </View>
        </View>
      ) : null}

      {canWrite && !closed ? (
        <View style={styles.manual}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Navn (valgfritt)"
            placeholderTextColor={colors.muted}
            nativeID="customer-survey-manual-name"
            style={[styles.input, styles.manualName, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="E-post"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            onSubmitEditing={addManual}
            nativeID="customer-survey-manual-email"
            style={[styles.input, styles.manualEmail, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <HrButton colors={colors} icon="person-add-outline" label="Legg til" disabled={!EMAIL.test(email.trim()) || busy} onPress={addManual} nativeID="customer-survey-add-manual" />
        </View>
      ) : null}

      {recipients === null ? <EmptyHint colors={colors} text="Henter mottakere …" /> : null}
      {recipients && !recipients.length ? <EmptyHint colors={colors} text="Ingen mottakere ennå." /> : null}
      {(recipients || []).map((r) => (
        <View key={r.id} style={[styles.row, { borderColor: colors.line }]}>
          <Ionicons
            name={r.status === 'failed' ? 'alert-circle' : (!survey.anonymous && r.answered) ? 'checkmark-circle' : r.status === 'sent' ? 'mail-outline' : 'ellipse-outline'}
            size={18}
            color={r.status === 'failed' ? colors.danger : (!survey.anonymous && r.answered) ? colors.success : colors.muted}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.body, { color: colors.ink }]} numberOfLines={1}>{r.customerName || r.name || r.email}</Text>
            <Text style={[styles.caption, { color: colors.muted }]} numberOfLines={2}>
              {[r.customerName && r.name !== r.customerName ? r.name : '', r.email, statusText(r, survey.anonymous)].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {canWrite && !closed && !r.answered && !(survey.anonymous && r.status === 'sent') ? (
            <Pressable onPress={() => onRemove(r)} accessibilityRole="button" accessibilityLabel={`Fjern ${r.email}`} style={styles.remove} disabled={busy}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space.xs },
  headRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  title: { ...type.bodyStrong },
  body: { ...type.body },
  caption: { ...type.caption },
  box: { borderWidth: 1, borderRadius: radius.card, padding: space.sm, gap: 6 },
  input: { borderWidth: 1, borderRadius: radius.control, paddingHorizontal: space.xs, paddingVertical: 8, ...type.body },
  pickList: { maxHeight: 320, overflow: 'scroll' },
  pickRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderTopWidth: 1, paddingVertical: 6 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  manual: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' },
  manualName: { flexGrow: 1, flexBasis: 140 },
  manualEmail: { flexGrow: 2, flexBasis: 200 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, borderTopWidth: 1, paddingVertical: 6 },
  remove: { padding: 6 },
});
