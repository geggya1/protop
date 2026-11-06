import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { displayName } from '../../src/employees/model';
import {
  HIRED_LEVELS,
  hiredCatalogItem,
  hiredCells,
  hiredRequirementLabel,
  isHiredRequired,
  setHiredNote,
  setHiredStatus,
} from '../../src/hr/hired';
import { hmsCardFor, hmsCardStatus, upsertHmsCard } from '../../src/hr/hmsCard';
import { formatNbDate } from '../../src/hr/model';
import { showSaveToast } from '../../src/ui/saveToast';
import { radius, type } from '../../src/ui/tokens';
import { ACCENT, Bar, Ring, Segmented, tint } from '../hr/HrDashParts';
import { lazyScreen } from '../../src/ui/lazyScreen';
const HrButton = lazyScreen(() => import('../hr/HrShared'), { name: 'HrButton', pick: 'HrButton', silent: true });
const HrField = lazyScreen(() => import('../hr/HrShared'), { name: 'HrField', pick: 'HrField', silent: true });
const HmsCardEditor = lazyScreen(() => import('../hr/HmsCardEditor'), { name: 'HmsCardEditor', silent: true });

const STATUS_OPTIONS = [
  { id: 'ok', label: 'OK' },
  { id: 'missing', label: 'Mangler' },
  { id: 'na', label: 'Ikke aktuelt' },
];

/** Ikon og farge for én linje: grønn hake, rødt varsel, grått for ikke aktuelt, tom ring for anbefalt. */
function rowLook(row, required, law = false) {
  if (row.status === 'ok') return { icon: 'checkmark-circle', color: ACCENT.green, text: 'OK' };
  if (row.status === 'na') return { icon: 'remove-circle-outline', color: ACCENT.slate, text: 'Ikke aktuelt' };
  if (row.status === 'overdue') return { icon: 'alert-circle', color: ACCENT.red, text: 'Utløpt' };
  if (required) return { icon: 'alert-circle', color: ACCENT.red, text: 'Mangler' };
  if (law) return { icon: 'ellipse-outline', color: ACCENT.amber, text: 'Ved behov' };
  return { icon: 'ellipse-outline', color: ACCENT.amber, text: 'Ikke gjort' };
}

/**
 * Kravene til én innleid eller ekstern, kompakt: én linje per punkt med status.
 * Trykk på linjen for hva som må gjøres, hvorfor, status og notat.
 */
export default function HiredChecklist({
  colors, employee, kindLabel, hr, canWrite, onPatch, familyId,
}) {
  const id = String(employee?.id || '');
  const hmsRequired = hr.hmsRequired !== false;
  const { type, items, summary } = hiredCells(employee, kindLabel, hr);
  const hmsCard = hmsCardFor(id, hr.hmsCards || []);
  const [open, setOpen] = useState('');
  const pct = summary.lawTotal ? Math.round((summary.lawOk / summary.lawTotal) * 100) : 100;

  function setStatus(catalogId, status) {
    if (!canWrite || !id) return;
    onPatch?.((state) => ({ compliance: setHiredStatus(state.compliance || [], id, type, catalogId, status) }));
  }

  function saveNote(catalogId, note) {
    if (!canWrite || !id) return;
    onPatch?.((state) => ({ compliance: setHiredNote(state.compliance || [], id, type, catalogId, note) }));
    showSaveToast?.('Notatet er lagret');
  }

  function saveHmsCard(draft) {
    if (!canWrite || !id) return;
    onPatch?.((state) => ({
      hmsCards: upsertHmsCard(state.hmsCards || [], { ...draft, employeeId: id, updatedAt: new Date().toISOString() }),
    }));
    showSaveToast?.('HMS-kortet er lagret');
  }

  /** Kort tekst under navnet på linjen: frist, kortnummer eller dato for OK. */
  function subline(row, cat) {
    if (cat?.derived === 'hmsCard' && row.status !== 'na') {
      if (!hmsCard?.number) return '';
      return `${hmsCard.number} · ${hmsCardStatus(hmsCard).label}`;
    }
    if (row.status === 'ok' && row.completedAt) return `OK fra ${formatNbDate(row.completedAt)}`;
    return row.note ? row.note : '';
  }

  return (
    <View style={styles.stack}>
      <View
        nativeID="hr-hired-summary"
        style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.line }]}
      >
        <Ring
          pct={pct}
          size={60}
          stroke={7}
          color={summary.lawMissing ? ACCENT.red : ACCENT.green}
          label={`${summary.lawOk}/${summary.lawTotal}`}
          labelColor={colors.ink}
        />
        <View style={styles.summaryText}>
          <Text style={[styles.summaryTitle, { color: summary.lawMissing ? ACCENT.red : colors.ink }]}>
            {summary.lawMissing
              ? `${summary.lawMissing} lovkrav mangler`
              : 'Lovkravene er på plass'}
          </Text>
          <Text style={[styles.caption, { color: colors.muted }]}>
            {type === 'innleid'
              ? 'Innleid fra bemanningsforetak. Foretaket er arbeidsgiver. Dere har ansvaret for innleien, arbeidsmiljøet og arbeidstiden hos dere.'
              : 'Ekstern. Leverandøren er arbeidsgiver. Dere har ansvaret for sikkerheten på arbeidsstedet og personopplysningene.'}
          </Text>
          {summary.adviceTotal ? (
            <View style={styles.advice}>
              <Text style={[styles.caption, { color: colors.muted }]}>
                {`Anbefalt: ${summary.adviceDone} av ${summary.adviceTotal}`}
              </Text>
              <View style={styles.adviceBar}>
                <Bar ratio={summary.adviceDone / summary.adviceTotal} accent={ACCENT.teal} height={5} />
              </View>
            </View>
          ) : null}
        </View>
      </View>

      {HIRED_LEVELS.map((level) => {
        const isGap = (row) => isHiredRequired(row.catalogId, type, { hmsRequired }) && (row.status === 'missing' || row.status === 'overdue');
        const group = items
          .filter((row) => hiredCatalogItem(row.catalogId)?.level === level.id)
          .sort((a, b) => Number(isGap(b)) - Number(isGap(a)));
        if (!group.length) return null;
        return (
          <View
            key={level.id}
            nativeID={`hr-hired-level-${level.id}`}
            style={[styles.group, { backgroundColor: colors.card, borderColor: colors.line }]}
          >
            <Text style={[styles.groupTitle, { color: colors.muted }]}>{level.label.toUpperCase()}</Text>
            {group.map((row, index) => {
              const cat = hiredCatalogItem(row.catalogId);
              const required = isHiredRequired(row.catalogId, type, { hmsRequired });
              const look = rowLook(row, required, cat?.level === 'law');
              const expanded = open === row.catalogId;
              const sub = subline(row, cat);
              return (
                <View
                  key={row.catalogId}
                  nativeID={`hr-hired-item-${row.catalogId}`}
                  style={[styles.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.line }]}
                >
                  <Pressable
                    onPress={() => setOpen(expanded ? '' : row.catalogId)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded }}
                    accessibilityLabel={`${cat?.label}: ${look.text}`}
                    style={styles.rowHead}
                  >
                    <Ionicons name={look.icon} size={22} color={look.color} />
                    <View style={styles.rowText}>
                      <Text style={[styles.rowTitle, { color: colors.ink }]}>{cat?.label || row.label}</Text>
                      {sub ? <Text numberOfLines={1} style={[styles.caption, { color: colors.muted }]}>{sub}</Text> : null}
                    </View>
                    <View style={[styles.state, { backgroundColor: tint(look.color, 0.12) }]}>
                      <Text style={[styles.stateText, { color: look.color }]}>{look.text}</Text>
                    </View>
                    <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.muted} />
                  </Pressable>

                  {expanded ? (
                    <View style={styles.detail} nativeID={`hr-hired-detail-${row.catalogId}`}>
                      {row.status !== 'ok' && row.status !== 'na' && cat?.todo ? (
                        <Text style={[styles.body, { color: colors.ink }]}>{cat.todo}</Text>
                      ) : null}
                      <Text style={[styles.caption, { color: colors.muted }]}>
                        {`${hiredRequirementLabel(row.catalogId, type, { hmsRequired }).replace(/^./, (c) => c.toUpperCase())}. ${cat?.hint || ''}`}
                      </Text>

                      {cat?.derived === 'hmsCard' ? (
                        <HmsCardEditor
                          key={id}
                          colors={colors}
                          card={hmsCard}
                          canWrite={canWrite}
                          familyId={familyId}
                          personName={displayName(employee)}
                          personBirthDate={employee?.person?.birthDate || ''}
                          notApplicable={row.status === 'na'}
                          onSave={saveHmsCard}
                          onApplicable={(applicable) => setStatus(row.catalogId, applicable ? 'missing' : 'na')}
                        />
                      ) : null}

                      {!cat?.derived && canWrite ? (
                        <Segmented
                          colors={colors}
                          compact
                          nativeID={`hr-hired-status-${row.catalogId}`}
                          options={STATUS_OPTIONS}
                          value={row.status === 'overdue' ? 'missing' : row.status}
                          onChange={(status) => setStatus(row.catalogId, status)}
                        />
                      ) : null}

                      <ItemNote
                        key={`${id}:${row.catalogId}`}
                        colors={colors}
                        note={row.note}
                        canWrite={canWrite}
                        onSave={(note) => saveNote(row.catalogId, note)}
                      />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
        );
      })}
      {!canWrite ? (
        <Text style={[styles.caption, { color: colors.muted }]}>Du har lesetilgang. Endringer gjøres av leder.</Text>
      ) : null}
    </View>
  );
}

/** Notat eller bevis, for eksempel dato for oppslag i registeret eller hvem som ga introduksjonen. */
function ItemNote({ colors, note, canWrite, onSave }) {
  const [draft, setDraft] = useState(null);
  if (draft != null) {
    return (
      <View style={styles.stack}>
        <HrField colors={colors} label="Notat / bevis" value={draft} onChangeText={setDraft} />
        <View style={styles.actions}>
          <HrButton colors={colors} primary label="Lagre notat" onPress={() => { onSave(draft); setDraft(null); }} />
          <HrButton colors={colors} label="Avbryt" onPress={() => setDraft(null)} />
        </View>
      </View>
    );
  }
  if (!canWrite) return note ? <Text style={[styles.caption, { color: colors.muted }]}>{`Notat: ${note}`}</Text> : null;
  return (
    <Pressable onPress={() => setDraft(note || '')} accessibilityRole="button" style={styles.noteLink}>
      <Ionicons name="create-outline" size={15} color={colors.brand} />
      <Text style={[styles.caption, { color: colors.brand }]}>{note ? `Notat: ${note}` : 'Legg til notat eller bevis'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  summary: {
    flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, borderRadius: radius.card, padding: 14,
  },
  summaryText: { flex: 1, minWidth: 0, gap: 4 },
  summaryTitle: { ...type.title },
  advice: { gap: 4, marginTop: 2 },
  adviceBar: { maxWidth: 220 },
  group: { borderWidth: 1, borderRadius: radius.card, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
  groupTitle: { ...type.caption, fontWeight: '600', letterSpacing: 0.6, marginBottom: 2 },
  row: { paddingVertical: 4 },
  rowHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 6,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowTitle: { ...type.body, fontWeight: '500' },
  state: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  stateText: { ...type.caption, fontWeight: '600' },
  detail: { gap: 10, paddingLeft: 32, paddingBottom: 12 },
  body: { ...type.body },
  caption: { ...type.caption },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  noteLink: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
});
