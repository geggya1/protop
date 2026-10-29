/**
 * «Godkjenn utvalg» i Til fakturering: prosesslinjen Timer → Godkjenn → Til fakturering →
 * Faktura øverst, så timene og postene som ikke er godkjent, ett prosjekt (ett
 * fakturautkast) om gangen. Fjern haken på det som ikke skal godkjennes nå, og lagre.
 * Ingenting lagres før brukeren trykker «Godkjenn».
 */
import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatHours } from '../../../src/arbeid/hours.js';
import { formatDate } from '../../../src/economy/invoices.js';
import { approvalSelection, approvalTotals, postsLabel } from '../../../src/economy/billingApproval.js';
import { type } from '../../../src/ui/tokens';
import DialogShell from '../invoice/DialogShell';
import BillingChainLine from './BillingChainLine';
import { Banner, Button, Check, MiniTable, money } from './ui';

/**
 * review: [{ project, lines }] fra approvalReview().
 * chain: tallene til prosesslinjen (null: linjen henter dem selv). showChain: false skjuler den.
 * onSave(selections): lagrer og gir antall godkjent. Kaster ved feil.
 * onClose(count): dialogen lukkes, count er antall godkjent mens den var åpen.
 */
export default function BillingApproveDialog({
  review = [],
  colors,
  chain = null,
  showChain = true,
  stacked = false,
  busy = false,
  onSave,
  onClose,
}) {
  const [index, setIndex] = useState(0);
  const [excluded, setExcluded] = useState(() => new Set());
  // projectId → antall godkjent. Prosjekter som hoppes over, står ikke her.
  const [done, setDone] = useState({});
  const [approved, setApproved] = useState(0);
  const [error, setError] = useState('');

  const item = review[index] || review[0];
  if (!item) return null;
  const projectId = item.project.projectId;
  const isDone = done[projectId] != null;
  const pickedOf = (row) => new Set(row.lines.map((line) => line.key).filter((key) => !excluded.has(key)));
  const picked = pickedOf(item);
  const totals = approvalTotals(item.lines, picked);
  const left = review.filter((row) => done[row.project.projectId] == null);
  const leftCount = left.reduce((sum, row) => sum + approvalTotals(row.lines, pickedOf(row)).count, 0);
  const nextIndex = review.findIndex((row, at) => at > index && done[row.project.projectId] == null);
  const allPicked = item.lines.every((line) => picked.has(line.key));

  function finish(count = approved) {
    onClose?.(count);
  }

  function toggle(keys, on) {
    setExcluded((current) => {
      const next = new Set(current);
      for (const key of keys) {
        if (on) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  }

  async function save(rows) {
    setError('');
    try {
      const count = await onSave?.(rows.map((row) => approvalSelection(row.lines, pickedOf(row))));
      const total = approved + (count || 0);
      setApproved(total);
      setDone((current) => {
        const next = { ...current };
        for (const row of rows) next[row.project.projectId] = approvalTotals(row.lines, pickedOf(row)).count;
        return next;
      });
      return total;
    } catch (cause) {
      setError(String(cause?.message || cause) || 'Kunne ikke godkjenne utvalget.');
      return null;
    }
  }

  async function approveCurrent() {
    const total = await save([item]);
    if (total == null) return;
    if (nextIndex < 0) finish(total);
    else setIndex(nextIndex);
  }

  async function approveAll() {
    const total = await save(left);
    if (total != null) finish(total);
  }

  const checkFor = (line) => (
    <Check
      checked={picked.has(line.key)}
      onPress={() => toggle([line.key], !picked.has(line.key))}
      colors={colors}
      disabled={isDone || busy}
      label={`Godkjenn ${line.who || line.what} ${formatDate(line.date)}`}
      nativeID={`billing-approve-line-${line.key}`}
    />
  );
  const statusColor = (line) => (line.status === 'Levert' ? colors.ink : (colors.warn || '#b45309'));
  const amountOf = (line) => (line.amount == null ? '–' : money(line.amount));

  const columns = [
    { key: 'pick', label: '', width: 26, render: checkFor },
    { key: 'date', label: 'Dato', width: 86, render: (line) => formatDate(line.date) },
    { key: 'who', label: 'Medarbeider', flex: 1, render: (line) => line.who || '–' },
    { key: 'what', label: 'Aktivitet / beskrivelse', flex: 1.6, wrap: true, render: (line) => (
      <View>
        <Text style={{ color: colors.ink, fontSize: type.label.fontSize }} numberOfLines={2}>{line.what}</Text>
        {line.note || line.kindLabel ? (
          <Text style={[type.caption, { color: colors.muted }]} numberOfLines={3}>{line.note || line.kindLabel}</Text>
        ) : null}
      </View>
    ) },
    { key: 'status', label: 'Status', width: 84, render: (line) => (line.status
      ? <Text style={{ color: statusColor(line), fontSize: type.label.fontSize }}>{line.status}</Text>
      : '') },
    { key: 'hours', label: 'Timer', width: 60, align: 'right', render: (line) => (line.kind === 'hours' ? formatHours(line.hours) : '') },
    { key: 'amount', label: 'Beløp', width: 108, align: 'right', render: amountOf },
  ];

  // Mobil: én kompakt rad per linje i stedet for tabellen.
  const phoneLines = (
    <View>
      {item.lines.map((line) => (
        <View
          key={line.key}
          style={[styles.phoneLine, { borderBottomColor: colors.line, opacity: picked.has(line.key) ? 1 : 0.5 }]}
        >
          {checkFor(line)}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[type.label, { color: colors.ink }]} numberOfLines={1}>
              {[formatDate(line.date), line.who].filter(Boolean).join(' · ')}
            </Text>
            <Text style={[type.caption, { color: colors.ink }]} numberOfLines={2}>{line.what}</Text>
            {line.note || line.kindLabel ? (
              <Text style={[type.caption, { color: colors.muted }]} numberOfLines={3}>{line.note || line.kindLabel}</Text>
            ) : null}
            {line.status ? <Text style={[type.caption, { color: statusColor(line) }]}>{line.status}</Text> : null}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {line.kind === 'hours' ? <Text style={[type.label, { color: colors.ink }]}>{formatHours(line.hours)}</Text> : null}
            <Text style={[type.caption, { color: colors.muted }]}>{amountOf(line)}</Text>
          </View>
        </View>
      ))}
    </View>
  );

  const footer = (
    <>
      {!isDone && left.length > 1 ? (
        <Button
          label={`Godkjenn alle (${postsLabel(leftCount)})`}
          tone="secondary"
          colors={colors}
          disabled={!leftCount || busy}
          onPress={approveAll}
          nativeID="billing-approve-all"
        />
      ) : null}
      <View style={styles.spacer} />
      {!isDone && nextIndex >= 0 ? (
        <Button
          label="Hopp over"
          tone="secondary"
          colors={colors}
          disabled={busy}
          onPress={() => setIndex(nextIndex)}
          nativeID="billing-approve-skip"
        />
      ) : null}
      {isDone ? (
        <Button
          label={nextIndex >= 0 ? 'Neste' : 'Ferdig'}
          colors={colors}
          onPress={() => (nextIndex >= 0 ? setIndex(nextIndex) : finish())}
          nativeID="billing-approve-next"
        />
      ) : (
        <Button
          label={nextIndex >= 0 ? 'Godkjenn og neste' : `Godkjenn ${postsLabel(totals.count)}`}
          icon="checkmark"
          tone="success"
          colors={colors}
          disabled={!totals.count}
          busy={busy}
          onPress={approveCurrent}
          nativeID="billing-approve-confirm"
        />
      )}
    </>
  );

  return (
    <DialogShell
      visible
      title="Godkjenn utvalget"
      onClose={() => finish()}
      footer={footer}
      colors={colors}
      width={920}
      nativeID="billing-approve-dialog"
    >
      {showChain ? <BillingChainLine current="godkjenn" counts={chain} onNavigate={() => finish()} /> : null}
      <Text style={[type.label, { color: colors.muted, fontWeight: '400' }]}>
        Kontroller timene og postene som ikke er godkjent. Fjern haken på det som ikke skal godkjennes nå.
        Det som godkjennes, kan legges på fakturautkast.
      </Text>

      {review.length > 1 ? (
        <View style={[styles.pager, { borderColor: colors.line }]}>
          <TouchableOpacity
            onPress={() => setIndex(index - 1)}
            disabled={index <= 0 || busy}
            accessibilityRole="button"
            accessibilityLabel="Forrige prosjekt"
            nativeID="billing-approve-prev"
            hitSlop={8}
            style={{ opacity: index <= 0 ? 0.3 : 1 }}
          >
            <Ionicons name="chevron-back" size={18} color={colors.ink} />
          </TouchableOpacity>
          <Text style={[type.label, { color: colors.muted, fontWeight: '400' }]} nativeID="billing-approve-position">
            {`Prosjekt ${index + 1} av ${review.length}`}
            {approved ? ` · ${postsLabel(approved)} godkjent` : ''}
          </Text>
          <TouchableOpacity
            onPress={() => setIndex(index + 1)}
            disabled={index >= review.length - 1 || busy}
            accessibilityRole="button"
            accessibilityLabel="Neste prosjekt"
            nativeID="billing-approve-forward"
            hitSlop={8}
            style={{ opacity: index >= review.length - 1 ? 0.3 : 1 }}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.ink} />
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.projectHead}>
        <Check
          checked={allPicked}
          partial={!allPicked && picked.size > 0}
          onPress={() => toggle(item.lines.map((line) => line.key), !allPicked)}
          colors={colors}
          disabled={isDone || busy}
          label="Velg alle linjene på prosjektet"
          nativeID="billing-approve-check-all"
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[type.body, { color: colors.ink }]} numberOfLines={stacked ? 3 : 2}>
            <Text style={{ color: colors.muted }}>#{item.project.number} </Text>
            <Text style={{ fontWeight: '600' }}>{item.project.name}</Text>
            <Text style={{ color: colors.muted }}> for kunden </Text>
            <Text style={{ fontWeight: '600' }}>{item.project.customerName || 'Uten kunde'}</Text>
          </Text>
          <Text style={[type.caption, { color: colors.muted }]}>
            {`${totals.count} av ${item.lines.length} valgt`}
            {totals.hours ? ` · ${formatHours(totals.hours)} t` : ''}
            {` · ${money(totals.amount)} eks. mva`}
          </Text>
        </View>
      </View>

      {isDone ? (
        <Banner tone="ok" colors={colors}>{`${postsLabel(done[projectId])} er godkjent på dette prosjektet.`}</Banner>
      ) : null}
      {error ? <Banner tone="block" colors={colors}>{error}</Banner> : null}

      {stacked ? phoneLines : (
        <MiniTable columns={columns} rows={item.lines} colors={colors} dimmed={(line) => !picked.has(line.key)} />
      )}
    </DialogShell>
  );
}

const styles = StyleSheet.create({
  spacer: { flexGrow: 1 },
  pager: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  projectHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  phoneLine: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
});
