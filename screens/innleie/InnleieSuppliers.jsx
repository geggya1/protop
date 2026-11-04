import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { displayName } from '../../src/employees/model';
import { hrKindLabel } from '../../src/hr/directory';
import { formatNbDate, localIsoDate } from '../../src/hr/model';
import { hiredPeople } from '../../src/innleie/dashboard';
import {
  SUPPLIER_KINDS, normalizeSupplier, supplierKindLabel, supplierStatus, suppliersSummary,
} from '../../src/innleie/suppliers';
import { showSaveToast } from '../../src/ui/saveToast';
import { radius, type } from '../../src/ui/tokens';
import {
  ACCENT, Avatar, KpiTile, Pill, Ring, Segmented, gridItem, gridStyle, tint,
} from '../hr/HrDashParts';
import { EmptyHint, HrButton, HrChip, HrField } from '../hr/HrShared';

const STATUS_OPTIONS = [
  { id: 'ok', label: 'OK' },
  { id: 'missing', label: 'Mangler' },
  { id: 'na', label: 'Ikke aktuelt' },
];

function look(item) {
  if (item.status === 'ok') return { icon: 'checkmark-circle', color: ACCENT.green, text: 'OK' };
  if (item.status === 'na') return { icon: 'remove-circle-outline', color: ACCENT.slate, text: 'Ikke aktuelt' };
  if (item.status === 'expired') return { icon: 'alert-circle', color: ACCENT.red, text: 'Gått ut' };
  if (item.level === 'law') return { icon: 'alert-circle', color: ACCENT.red, text: 'Mangler' };
  return { icon: 'ellipse-outline', color: ACCENT.amber, text: 'Ikke gjort' };
}

function ringColor(row) {
  if (row.lawGaps.length) return ACCENT.red;
  if (row.pct < 100) return ACCENT.amber;
  return ACCENT.green;
}

/**
 * Leverandørkontroll: ett kort per firma med hvor mye som er på plass, og firmaet med
 * kontrollene, personene som kommer derfra og notat.
 */
export default function InnleieSuppliers({
  colors, employees, hr, canWrite, onPatch,
}) {
  const [selectedId, setSelectedId] = useState('');
  const [kind, setKind] = useState('all');
  const [draftName, setDraftName] = useState('');
  const [adding, setAdding] = useState(false);
  const summary = useMemo(() => suppliersSummary(hr.suppliers), [hr.suppliers]);
  const selected = (hr.suppliers || []).find((row) => row.id === selectedId) || null;

  function save(supplier, toast) {
    onPatch?.((state) => {
      const rows = Array.isArray(state.suppliers) ? [...state.suppliers] : [];
      const next = normalizeSupplier({ ...supplier, updatedAt: new Date().toISOString() });
      const index = rows.findIndex((row) => row.id === next.id);
      if (index >= 0) rows[index] = next;
      else rows.unshift({ ...next, createdAt: next.updatedAt });
      return { suppliers: rows };
    });
    if (toast) showSaveToast?.(toast);
  }

  function create() {
    const name = draftName.trim();
    if (!name || !canWrite) return;
    const row = normalizeSupplier({ name, kind: kind === 'all' ? 'underentreprenor' : kind });
    save(row, 'Leverandøren er lagt til');
    setDraftName('');
    setAdding(false);
    setSelectedId(row.id);
  }

  if (selected) {
    return (
      <SupplierSheet
        key={selected.id}
        colors={colors}
        supplier={selected}
        employees={employees}
        canWrite={canWrite}
        onSave={save}
        onBack={() => setSelectedId('')}
      />
    );
  }

  const rows = summary.rows.filter((row) => kind === 'all' || row.supplier.kind === kind);
  return (
    <View style={styles.page} nativeID="innleie-suppliers">
      <View style={gridStyle(4, 150, 10)}>
        <View style={gridItem(150)}>
          <KpiTile colors={colors} icon="business-outline" accent={ACCENT.blue} label="Leverandører" value={String(summary.count)} hint={summary.byKind.filter((row) => row.count).map((row) => `${row.count} ${row.short.toLowerCase()}`).join(' · ') || 'Ingen registrert'} />
        </View>
        <View style={gridItem(150)}>
          <KpiTile colors={colors} accent={summary.pct < 100 ? ACCENT.amber : ACCENT.green} ringPct={summary.pct} label="Kontroller på plass" value={`${summary.pct}%`} hint="Alle firma samlet" />
        </View>
        <View style={gridItem(150)}>
          <KpiTile colors={colors} icon="alert-circle-outline" accent={summary.withLawGaps ? ACCENT.red : ACCENT.green} label="Mangler lovkrav" value={String(summary.withLawGaps)} hint={summary.withLawGaps ? 'Firma med lovkrav som mangler' : 'Lovkravene er på plass'} />
        </View>
        <View style={gridItem(150)}>
          <KpiTile colors={colors} icon="time-outline" accent={summary.expired ? ACCENT.amber : ACCENT.teal} label="Gått ut" value={String(summary.expired)} hint="Skatteattest, påseplikt o.l. som må fornyes" />
        </View>
      </View>

      <View style={styles.tools}>
        <Segmented
          colors={colors}
          nativeID="innleie-supplier-kind"
          options={[
            { id: 'all', label: 'Alle', count: summary.count },
            ...summary.byKind.map((row) => ({ id: row.id, label: row.short, a11y: row.label, count: row.count })),
          ]}
          value={kind}
          onChange={setKind}
        />
        <View style={styles.grow} />
        {canWrite && !adding ? (
          <HrButton colors={colors} primary icon="add" label="Ny leverandør" nativeID="innleie-supplier-new" onPress={() => setAdding(true)} />
        ) : null}
      </View>

      {adding ? (
        <View style={[styles.addRow, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <TextInput
            autoFocus
            value={draftName}
            onChangeText={setDraftName}
            onSubmitEditing={create}
            placeholder="Firmanavn"
            placeholderTextColor={colors.muted}
            style={[styles.addInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            accessibilityLabel="Firmanavn"
            nativeID="innleie-supplier-name"
          />
          <HrButton colors={colors} primary label="Legg til" disabled={!draftName.trim()} onPress={create} />
          <HrButton colors={colors} label="Avbryt" onPress={() => { setAdding(false); setDraftName(''); }} />
        </View>
      ) : null}

      {rows.length ? (
        <View style={gridStyle(3, 260, 10)}>
          {rows.map((row) => (
            <View key={row.supplier.id} style={gridItem(260)}>
              <Pressable
                onPress={() => setSelectedId(row.supplier.id)}
                accessibilityRole="button"
                nativeID={`innleie-supplier-${row.supplier.id}`}
                style={[styles.card, { backgroundColor: colors.card, borderColor: row.lawGaps.length ? tint(ACCENT.red, 0.35) : colors.line }]}
              >
                <Ring pct={row.pct} size={48} stroke={5} color={ringColor(row)} label={`${row.ok}/${row.total}`} labelColor={colors.ink} labelSize={11} />
                <View style={styles.cardText}>
                  <Text numberOfLines={1} style={[styles.name, { color: colors.ink }]}>{row.supplier.name || 'Uten navn'}</Text>
                  <Text numberOfLines={1} style={[styles.caption, { color: colors.muted }]}>
                    {[supplierKindLabel(row.supplier.kind), row.supplier.orgNr && `org.nr. ${row.supplier.orgNr}`].filter(Boolean).join(' · ')}
                  </Text>
                  <View style={styles.pills}>
                    {row.lawGaps.length
                      ? <Pill label={`${row.lawGaps.length} lovkrav mangler`} accent={ACCENT.red} icon="alert-circle" />
                      : <Pill label="Lovkrav OK" accent={ACCENT.green} icon="checkmark-circle" />}
                    {row.expired.length ? <Pill label={`${row.expired.length} gått ut`} accent={ACCENT.amber} icon="time-outline" /> : null}
                    {row.supplier.employeeIds.length ? <Pill label={`${row.supplier.employeeIds.length} pers.`} accent={ACCENT.slate} icon="people-outline" /> : null}
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={16} color={colors.muted} />
              </Pressable>
            </View>
          ))}
        </View>
      ) : (
        <EmptyHint
          colors={colors}
          text={summary.count
            ? 'Ingen leverandører av denne typen.'
            : 'Ingen leverandører ennå. Legg inn bemanningsforetak og underentreprenører dere bruker, så ser dere hva som må kontrolleres for hvert firma.'}
        />
      )}
    </View>
  );
}

function SupplierSheet({
  colors, supplier, employees, canWrite, onSave, onBack,
}) {
  const [draft, setDraft] = useState(() => normalizeSupplier(supplier));
  const [open, setOpen] = useState('');
  const status = useMemo(() => supplierStatus(draft), [draft]);
  const people = useMemo(() => hiredPeople(employees, 'all'), [employees]);
  const dirty = JSON.stringify(normalizeSupplier(supplier)) !== JSON.stringify(normalizeSupplier(draft));

  function setCheck(id, patch, toast) {
    const current = draft.checks[id] || {};
    const next = { ...current, ...patch };
    if (patch.status === 'ok' && !current.date) next.date = localIsoDate();
    const updated = { ...draft, checks: { ...draft.checks, [id]: next } };
    setDraft(updated);
    onSave(updated, toast);
  }

  function togglePerson(id) {
    const has = draft.employeeIds.includes(id);
    const updated = { ...draft, employeeIds: has ? draft.employeeIds.filter((row) => row !== id) : [...draft.employeeIds, id] };
    setDraft(updated);
    onSave(updated, has ? 'Personen er tatt bort' : 'Personen er koblet til firmaet');
  }

  return (
    <View style={styles.page} nativeID="innleie-supplier-sheet">
      <Pressable onPress={onBack} accessibilityRole="button" style={styles.back}>
        <Ionicons name="arrow-back" size={16} color={colors.brand} />
        <Text style={[styles.caption, { color: colors.brand, fontWeight: '600' }]}>Til leverandørene</Text>
      </Pressable>

      <View style={[styles.head, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Ring pct={status.pct} size={64} stroke={7} color={ringColor(status)} label={`${status.pct}%`} labelColor={colors.ink} />
        <View style={styles.cardText}>
          <Text style={[styles.title, { color: colors.ink }]} numberOfLines={1}>{draft.name || 'Uten navn'}</Text>
          <Text style={[styles.caption, { color: colors.muted }]}>
            {status.lawGaps.length
              ? `${status.lawGaps.length} lovkrav mangler eller er gått ut`
              : `Lovkravene er på plass · ${status.ok} av ${status.total} kontroller`}
          </Text>
        </View>
      </View>

      <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.line }]}>
        <Segmented
          colors={colors}
          nativeID="innleie-supplier-type"
          options={SUPPLIER_KINDS.map((row) => ({ id: row.id, label: row.label, icon: row.icon }))}
          value={draft.kind}
          onChange={(value) => canWrite && setDraft({ ...draft, kind: value })}
        />
        <View style={gridStyle(2, 220, 10)}>
          <View style={gridItem(220)}>
            <HrField colors={colors} label="Firmanavn" value={draft.name} onChangeText={(name) => setDraft({ ...draft, name })} />
          </View>
          <View style={gridItem(220)}>
            <HrField colors={colors} label="Org.nr." value={draft.orgNr} keyboardType="number-pad" placeholder="9 siffer" onChangeText={(orgNr) => setDraft({ ...draft, orgNr: orgNr.replace(/\D/g, '').slice(0, 9) })} />
          </View>
          <View style={gridItem(220)}>
            <HrField colors={colors} label="Kontaktperson" value={draft.contact} onChangeText={(contact) => setDraft({ ...draft, contact })} />
          </View>
          <View style={gridItem(220)}>
            <HrField colors={colors} label="Notat" value={draft.note} onChangeText={(note) => setDraft({ ...draft, note })} />
          </View>
        </View>
        {canWrite ? (
          <View style={styles.tools}>
            <HrButton colors={colors} primary label="Lagre" disabled={!dirty || !draft.name.trim()} onPress={() => onSave(draft, 'Leverandøren er lagret')} nativeID="innleie-supplier-save" />
            <View style={styles.grow} />
            <HrButton
              colors={colors}
              icon={draft.archived ? 'refresh' : 'archive-outline'}
              label={draft.archived ? 'Ta i bruk igjen' : 'Arkiver'}
              onPress={() => { onSave({ ...draft, archived: !draft.archived }, draft.archived ? 'Tatt i bruk igjen' : 'Arkivert'); onBack(); }}
            />
          </View>
        ) : null}
      </View>

      <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.line }]} nativeID="innleie-supplier-checks">
        <Text style={[styles.groupTitle, { color: colors.muted }]}>KONTROLLER</Text>
        {status.items.map((item, index) => {
          const l = look(item);
          const expanded = open === item.id;
          const sub = [
            item.date && `Kontrollert ${formatNbDate(item.date)}`,
            item.validTo && `gjelder til ${formatNbDate(item.validTo)}`,
            item.note,
          ].filter(Boolean).join(' · ');
          return (
            <View key={item.id} style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }]}>
              <Pressable
                onPress={() => setOpen(expanded ? '' : item.id)}
                accessibilityRole="button"
                accessibilityState={{ expanded }}
                accessibilityLabel={`${item.label}: ${l.text}`}
                style={styles.rowHead}
              >
                <Ionicons name={l.icon} size={22} color={l.color} />
                <View style={styles.cardText}>
                  <Text style={[styles.rowTitle, { color: colors.ink }]}>{item.label}</Text>
                  {sub ? <Text numberOfLines={1} style={[styles.caption, { color: colors.muted }]}>{sub}</Text> : null}
                </View>
                <View style={[styles.state, { backgroundColor: tint(l.color, 0.12) }]}>
                  <Text style={[styles.stateText, { color: l.color }]}>{l.text}</Text>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
              </Pressable>
              {expanded ? (
                <View style={styles.detail}>
                  <Text style={[styles.caption, { color: colors.muted }]}>
                    {`${item.level === 'law' ? 'Lovkrav' : 'Anbefalt'}${item.validMonths ? `, fornyes hver ${item.validMonths}. måned` : ''}. ${item.hint}`}
                  </Text>
                  {canWrite ? (
                    <>
                      <Segmented
                        colors={colors}
                        compact
                        options={STATUS_OPTIONS}
                        value={item.status === 'expired' ? 'ok' : item.status}
                        onChange={(value) => setCheck(item.id, { status: value }, 'Kontrollen er lagret')}
                      />
                      {item.status === 'ok' || item.status === 'expired' ? (
                        <HrField colors={colors} label="Kontrollert dato" date="iso" value={item.date} onChangeText={(date) => setCheck(item.id, { date }, 'Datoen er lagret')} />
                      ) : null}
                      <CheckNote key={item.id} colors={colors} note={item.note} onSave={(note) => setCheck(item.id, { status: draft.checks[item.id]?.status || 'missing', note }, 'Notatet er lagret')} />
                    </>
                  ) : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={[styles.box, { backgroundColor: colors.card, borderColor: colors.line }]} nativeID="innleie-supplier-people">
        <Text style={[styles.groupTitle, { color: colors.muted }]}>PERSONELL FRA FIRMAET</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>
          Trykk for å koble innleide og eksterne til firmaet. Oversikten viser da hvor mange som kommer fra hver leverandør.
        </Text>
        {people.length ? (
          <View style={styles.chips}>
            {people.map((row) => (
              <HrChip
                key={row.id}
                colors={colors}
                label={`${displayName(row)} · ${hrKindLabel(row)}`}
                active={draft.employeeIds.includes(row.id)}
                onPress={canWrite ? () => togglePerson(row.id) : undefined}
                nativeID={`innleie-supplier-person-${row.id}`}
              />
            ))}
          </View>
        ) : (
          <View style={styles.line}>
            <Avatar name="?" size={30} accent={ACCENT.slate} />
            <Text style={[styles.caption, { color: colors.muted }]}>Ingen innleide eller eksterne er registrert.</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function CheckNote({ colors, note, onSave }) {
  const [value, setValue] = useState(note || '');
  return (
    <View style={styles.noteRow}>
      <View style={styles.grow}>
        <HrField colors={colors} label="Notat" value={value} onChangeText={setValue} placeholder="F.eks. hvor dokumentet ligger" />
      </View>
      <HrButton colors={colors} label="Lagre notat" disabled={value.trim() === (note || '').trim()} onPress={() => onSave(value.trim())} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 },
  grow: { flexGrow: 1, flexShrink: 1, minWidth: 0 },
  addRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radius.card, padding: 10,
  },
  addInput: {
    flexGrow: 1, flexBasis: 220, borderWidth: 1, borderRadius: radius.control, paddingHorizontal: 12, minHeight: 40, ...type.body,
  },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: radius.card, padding: 12,
  },
  cardText: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...type.body, fontWeight: '500' },
  title: { ...type.h2 },
  caption: { ...type.caption },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 36 },
  head: {
    flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: radius.card, padding: 14,
  },
  box: { borderWidth: 1, borderRadius: radius.card, padding: 14, gap: 10 },
  groupTitle: { ...type.caption, fontWeight: '600', letterSpacing: 0.6 },
  row: { paddingVertical: 2 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48 },
  rowTitle: { ...type.body },
  state: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  stateText: { ...type.caption, fontWeight: '600' },
  detail: { gap: 10, paddingLeft: 32, paddingBottom: 10 },
  noteRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
