import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { displayName, periodLabel } from '../../src/employees/model';
import { hrKindBucket, hrKindLabel } from '../../src/hr/directory';
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
import { type } from '../../src/ui/tokens';
import HmsCardEditor from './HmsCardEditor';
import HrFollowUp from './HrFollowUp';
import { HrFilterBar, HrTable, useHrDirectory } from './HrDirectory';
import {
  HrButton, HrCard, HrChip, HrField, HrSectionTitle,
} from './HrShared';

/**
 * Innleid og eksternt personell, atskilt fra egne ansatte.
 * Her står det dere som innleier eller oppdragsgiver skal ha kontroll på (src/hr/hired.js).
 * Arbeidsavtale, lønn og medarbeidersamtaler er leverandørens ansvar og vises ikke.
 */
const SHEETS = [
  { id: 'krav', label: 'Krav' },
  { id: 'oppfolging', label: 'Saker og oppgaver' },
];

const STATUS_LABEL = {
  ok: 'OK',
  missing: 'Mangler',
  overdue: 'Forfalt',
  na: 'Ikke aktuelt',
};

const COLUMNS = [
  { key: 'name', label: 'Navn', width: 190, value: (row) => displayName(row.employee) },
  { key: 'kind', label: 'Type', width: 90, value: (row) => row.kindLabel },
  { key: 'law', label: 'Lovkrav', width: 220, sheet: 'krav', value: (row) => row.cells.law, warn: (row) => row.cells.lawWarn },
  { key: 'advice', label: 'Anbefalt', width: 100, sheet: 'krav', value: (row) => row.cells.advice },
  { key: 'cases', label: 'Åpne saker', width: 110, sheet: 'oppfolging', value: (row) => row.openCases, warn: (row) => Number(row.openCases) > 0 },
];

export default function HrHired({
  colors, employees, hr, selectedId, onSelect, sheet = 'krav', onSheet,
  canWrite, onPatch, familyId,
  focusCaseId, assigneeUid, assigneeName, onOpenTask, onCreateFollowUpTask, formKit = null,
}) {
  const dir = useHrDirectory(employees, { lockedKind: 'external' });
  const rows = useMemo(() => dir.rows.map((employee) => {
    const kindLabel = hrKindLabel(employee);
    return {
      employee,
      kindLabel,
      cells: hiredCells(employee, kindLabel, hr),
      openCases: String((hr.cases || []).filter((row) => row.employeeId === employee.id && row.status !== 'closed').length),
    };
  }), [dir.rows, hr]);
  const selected = (employees || []).find((row) => row.id === selectedId && hrKindBucket(row) === 'external') || null;
  const activeSheet = SHEETS.some((item) => item.id === sheet) ? sheet : 'krav';

  if (!selected) {
    const innleid = rows.filter((row) => row.kindLabel === 'Innleid').length;
    return (
      <View style={styles.page} nativeID="hr-hired">
        <HrCard colors={colors}>
          <HrSectionTitle
            colors={colors}
            title="Innleid personell"
            subtitle="Innleide fra bemanningsforetak og eksterne som konsulenter, regnskap og underleverandører. Her er det dere som innleier skal ha kontroll på. Arbeidsavtale, lønn og medarbeidersamtaler er leverandørens ansvar og følges ikke opp her."
          />
          <HrFilterBar
            colors={colors}
            query={dir.query}
            onQuery={dir.setQuery}
            status={dir.status}
            onStatus={dir.setStatus}
            kind={dir.kind}
            onKind={dir.setKind}
            counts={dir.counts}
            showKind={false}
          />
          <Text style={[styles.hint, { color: colors.muted }]} nativeID="hr-hired-count">
            {`${innleid} innleid · ${rows.length - innleid} ekstern. Rødt er lovkrav som mangler.`}
          </Text>
          <HrTable
            colors={colors}
            columns={COLUMNS}
            rows={rows}
            rowKey={(row) => row.employee.id}
            emptyText="Ingen innleide eller eksterne i dette utvalget."
            onPressRow={(row, col) => {
              onSelect?.(row.employee.id);
              onSheet?.(col?.sheet || 'krav');
            }}
          />
        </HrCard>
      </View>
    );
  }

  const kindLabel = hrKindLabel(selected);
  return (
    <View style={styles.page} nativeID="hr-hired-sheet">
      <HrCard colors={colors}>
        <HrButton
          colors={colors}
          label="Til innleid personell"
          icon="arrow-back-outline"
          onPress={() => {
            onSelect?.('');
            onSheet?.('krav');
          }}
        />
        <HrSectionTitle
          colors={colors}
          title={displayName(selected)}
          subtitle={[selected?.company?.title, kindLabel, periodLabel(selected)].filter(Boolean).join(' · ')}
        />
        <View style={styles.chips}>
          {SHEETS.map((item) => (
            <HrChip
              key={item.id}
              nativeID={`hr-hired-sheet-${item.id}`}
              colors={colors}
              label={item.label}
              active={activeSheet === item.id}
              onPress={() => onSheet?.(item.id)}
            />
          ))}
        </View>
      </HrCard>

      {activeSheet === 'krav' ? (
        <HiredChecklist
          colors={colors}
          employee={selected}
          kindLabel={kindLabel}
          hr={hr}
          canWrite={canWrite}
          onPatch={onPatch}
          familyId={familyId}
        />
      ) : null}

      {activeSheet === 'oppfolging' ? (
        <HrFollowUp
          colors={colors}
          employees={employees}
          hr={hr}
          canWrite={canWrite}
          lockedEmployeeId={selected.id}
          onPatch={onPatch}
          familyId={familyId}
          focusCaseId={focusCaseId}
          assigneeUid={assigneeUid}
          assigneeName={assigneeName}
          onOpenTask={onOpenTask}
          onCreateFollowUpTask={onCreateFollowUpTask}
          formKit={formKit}
          hideReviews
        />
      ) : null}
    </View>
  );
}

function HiredChecklist({
  colors, employee, kindLabel, hr, canWrite, onPatch, familyId,
}) {
  const id = String(employee?.id || '');
  const hmsRequired = hr.hmsRequired !== false;
  const cells = hiredCells(employee, kindLabel, hr);
  const { type, items, summary } = cells;
  const hmsCard = hmsCardFor(id, hr.hmsCards || []);

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

  function stateText(row, cat) {
    if (cat?.derived === 'hmsCard') {
      if (row.status === 'na') return 'Ikke aktuelt for denne personen.';
      const state = hmsCardStatus(hmsCard);
      if (state.id === 'expired') return `${hmsCard.number} · ${state.label}. Personen må få nytt kort fra arbeidsgiveren sin.`;
      if (hmsCard?.number) return `${hmsCard.number} · ${state.label}.`;
      return cat.todo;
    }
    if (row.status === 'missing' || row.status === 'overdue') return cat?.todo || '';
    if (row.status === 'ok' && row.completedAt) return `OK fra ${formatNbDate(row.completedAt)}.`;
    return '';
  }

  return (
    <HrCard colors={colors}>
      <View nativeID="hr-hired-summary" style={styles.stack}>
        <Text style={[styles.summary, { color: summary.lawMissing ? colors.danger : colors.ink }]}>
          {summary.lawMissing
            ? `Dette mangler: ${summary.lawMissing} av ${summary.lawTotal} påkrevde lovkrav`
            : `Lovkravene er på plass (${summary.lawOk} av ${summary.lawTotal})`}
        </Text>
        <Text style={[styles.hint, { color: colors.muted }]}>
          {type === 'innleid'
            ? 'Innleid fra bemanningsforetak. Foretaket er arbeidsgiver og har ansvaret for arbeidsavtale, lønn og medarbeidersamtaler. Dere har ansvaret for grunnlaget for innleien, likebehandling, arbeidsmiljø og arbeidstid mens personen arbeider hos dere.'
            : 'Ekstern, for eksempel konsulent, regnskap eller underleverandør. Leverandøren er arbeidsgiver. Dere har ansvaret for sikkerheten på arbeidsstedet og for personopplysningene dere lagrer.'}
        </Text>
      </View>

      {HIRED_LEVELS.map((level) => {
        const group = items.filter((row) => hiredCatalogItem(row.catalogId)?.level === level.id);
        if (!group.length) return null;
        return (
          <View key={level.id} style={styles.stack} nativeID={`hr-hired-level-${level.id}`}>
            <Text style={[styles.levelTitle, { color: colors.ink }]}>{level.label}</Text>
            {group.map((row) => {
              const cat = hiredCatalogItem(row.catalogId);
              const required = isHiredRequired(row.catalogId, type, { hmsRequired });
              const gap = required && (row.status === 'missing' || row.status === 'overdue');
              const line = stateText(row, cat);
              return (
                <View key={row.catalogId} nativeID={`hr-hired-item-${row.catalogId}`} style={[styles.item, { borderColor: colors.line }]}>
                  <View style={styles.itemHead}>
                    <Text style={[styles.itemTitle, { color: colors.ink }]}>{cat?.label || row.label}</Text>
                    <Text style={[styles.itemState, { color: gap ? colors.danger : colors.muted }]}>
                      {`${STATUS_LABEL[row.status] || row.status} · ${hiredRequirementLabel(row.catalogId, type, { hmsRequired })}`}
                    </Text>
                  </View>
                  {line ? <Text style={[styles.line, { color: gap ? colors.danger : colors.ink }]}>{line}</Text> : null}
                  {cat?.hint ? <Text style={[styles.hint, { color: colors.muted }]}>{cat.hint}</Text> : null}

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
                    <View style={styles.actions}>
                      {['ok', 'missing', 'na'].map((status) => (
                        <HrChip
                          key={status}
                          colors={colors}
                          label={STATUS_LABEL[status]}
                          active={row.status === status}
                          onPress={() => setStatus(row.catalogId, status)}
                        />
                      ))}
                    </View>
                  ) : null}

                  <ItemNote
                    key={`${id}:${row.catalogId}`}
                    colors={colors}
                    note={row.note}
                    canWrite={canWrite}
                    onSave={(note) => saveNote(row.catalogId, note)}
                  />
                </View>
              );
            })}
          </View>
        );
      })}
      {!canWrite ? (
        <Text style={[styles.hint, { color: colors.muted }]}>Du har lesetilgang. Endringer gjøres av leder eller HR.</Text>
      ) : null}
    </HrCard>
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
          <HrButton colors={colors} label="Lagre notat" onPress={() => { onSave(draft); setDraft(null); }} />
          <HrButton colors={colors} label="Avbryt" onPress={() => setDraft(null)} />
        </View>
      </View>
    );
  }
  if (!note && !canWrite) return null;
  return (
    <View style={styles.actions}>
      {note ? <Text style={[styles.hint, { color: colors.muted, flex: 1 }]}>{`Notat: ${note}`}</Text> : null}
      {canWrite ? (
        <HrChip colors={colors} label={note ? 'Endre notat' : 'Legg til notat'} onPress={() => setDraft(note || '')} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  stack: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summary: { ...type.bodyStrong },
  levelTitle: { ...type.bodyStrong, marginTop: 8 },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 6 },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 },
  itemTitle: { ...type.bodyStrong, flex: 1 },
  itemState: { ...type.caption, fontWeight: '600' },
  line: { ...type.label, fontWeight: '400' },
  hint: { ...type.caption },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
});
