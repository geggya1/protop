import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  COMPLIANCE_CATALOG,
  COMPLIANCE_SOURCES,
  amlContractCompleteness,
  amlFieldLabel,
  complianceSummary,
  ensureEmployeeCompliance,
  replaceEmployeeCompliance,
  syncComplianceFromEvidence,
} from '../../src/hr/compliance';
import { activeContractFor, formatNbDate, localIsoDate } from '../../src/hr/model';
import { showSaveToast } from '../../src/ui/saveToast';
import OptionPicker from '../../components/OptionPicker';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle,
} from './HrShared';

const STATUS = [
  { id: 'ok', label: 'OK' },
  { id: 'missing', label: 'Mangler' },
  { id: 'overdue', label: 'Forfalt' },
  { id: 'na', label: 'Ikke aktuelt' },
];

const ISO_STATUS = {
  gyldig: 'Gyldig',
  utloper: 'Utløper snart',
  utlopt: 'Utløpt',
  mangler: 'Mangler',
  cv: 'Står i CV-en, mangler bevis',
};

export default function HrCompliance({
  colors, hr, canWrite, onPatch, lockedEmployeeId, isoCompetence, onOpenIso,
}) {
  const activeId = String(lockedEmployeeId || '');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [noteDrafts, setNoteDrafts] = useState({});

  useEffect(() => {
    setNoteDrafts({});
  }, [activeId]);

  const rows = useMemo(() => {
    if (!activeId) return [];
    const sourced = syncComplianceFromEvidence(hr.compliance || [], {
      employeeId: activeId,
      contracts: hr.contracts || [],
      reviews: hr.reviews || [],
    });
    return ensureEmployeeCompliance(sourced, activeId);
  }, [hr.compliance, hr.contracts, hr.reviews, activeId]);
  const visible = sourceFilter === 'all'
    ? rows
    : rows.filter((row) => row.source === sourceFilter);
  const summary = complianceSummary(rows);
  const activeContract = activeId ? activeContractFor(activeId, hr.contracts || []) : null;

  /** Punkter som settes fra dataene: hva som mangler, i stedet for avkrysning. */
  function derivedText(row, cat) {
    if (cat?.derived !== 'contract') return '';
    const due = row.dueDate && row.status !== 'ok' ? ` Frist ${formatNbDate(row.dueDate)}.` : '';
    if (!activeContract) return `Ingen aktiv arbeidsavtale. Registrer den under Ansettelsesavtale.${due}`;
    const aml = amlContractCompleteness(activeContract);
    if (!aml.missing.length) return `Alle ${aml.total} påkrevde punkter er fylt ut i avtalen.`;
    return `Settes fra avtalen. Mangler: ${aml.missing.map(amlFieldLabel).join(' · ')}.${due}`;
  }

  function noteKey(catalogId, empId = activeId) {
    return `${empId || ''}:${catalogId}`;
  }

  function setStatus(catalogId, status) {
    if (!canWrite || !activeId) return;
    if (COMPLIANCE_CATALOG.find((c) => c.id === catalogId)?.derived) return;
    onPatch?.((state) => {
      const nextRows = ensureEmployeeCompliance(state.compliance || [], activeId).map((row) => (
        row.catalogId === catalogId
          ? {
            ...row,
            status,
            completedAt: status === 'ok' ? localIsoDate() : '',
            updatedAt: new Date().toISOString(),
          }
          : row
      ));
      return { compliance: replaceEmployeeCompliance(state.compliance, activeId, nextRows) };
    });
  }

  function commitNote(catalogId) {
    if (!canWrite || !activeId) return;
    const note = noteDrafts[noteKey(catalogId)];
    if (note == null) return;
    onPatch?.((state) => {
      const nextRows = ensureEmployeeCompliance(state.compliance || [], activeId).map((row) => (
        row.catalogId === catalogId ? { ...row, note, updatedAt: new Date().toISOString() } : row
      ));
      return { compliance: replaceEmployeeCompliance(state.compliance, activeId, nextRows) };
    });
  }

  function syncFromEvidence() {
    if (!canWrite || !activeId) return;
    onPatch?.((state) => {
      const compliance = syncComplianceFromEvidence(state.compliance || [], {
        employeeId: activeId,
        contracts: state.contracts || [],
        reviews: state.reviews || [],
      });
      return { compliance };
    });
    showSaveToast?.('Compliance synket fra avtaler og samtaler');
  }

  return (
    <View style={styles.page} nativeID="hr-compliance">
      {!activeId ? (
        <HrCard colors={colors}>
          <EmptyHint colors={colors} text="Velg en ansatt i personellisten for å se sjekklisten." />
        </HrCard>
      ) : (
        <HrCard colors={colors}>
          <HrSectionTitle
            colors={colors}
            title="Lovpålagt"
            subtitle="Arbeidsavtale, oppfølging, verneutstyr og personvern for denne personen"
          />
          <Text style={[styles.summary, { color: colors.ink }]}>
            {`OK: ${summary.ok}/${summary.total} (${summary.pct} %) · Mangler: ${summary.missing}`}
          </Text>
        </HrCard>
      )}

      {activeId ? (
        <HrCard colors={colors}>
          <OptionPicker
            options={COMPLIANCE_SOURCES}
            value={sourceFilter === 'all' ? '' : sourceFilter}
            onChange={(id) => setSourceFilter(id || 'all')}
            placeholder="Alle kilder"
            clearLabel="Alle kilder"
            title="Kilde"
          />
          {canWrite ? (
            <HrButton
              colors={colors}
              label="Synk fra avtale + samtale"
              icon="sync-outline"
              onPress={syncFromEvidence}
            />
          ) : null}

          {visible.map((row) => {
            const cat = COMPLIANCE_CATALOG.find((c) => c.id === row.catalogId);
            return (
              <View key={row.catalogId} style={[styles.item, { borderColor: colors.line }]}>
                <Text style={[styles.itemTitle, { color: colors.ink }]}>
                  {row.label}{cat?.required ? ' *' : ''}
                </Text>
                {cat?.hint ? (
                  <Text style={[styles.itemHint, { color: colors.muted }]}>{cat.hint}</Text>
                ) : null}
                {cat?.derived ? (
                  <Text
                    style={[styles.itemHint, { color: row.status === 'ok' ? colors.ink : colors.danger }]}
                    nativeID={`hr-compliance-derived-${row.catalogId}`}
                  >
                    {`${STATUS.find((s) => s.id === row.status)?.label || row.status} · ${derivedText(row, cat)}`}
                  </Text>
                ) : (
                  <View style={styles.chips}>
                    {STATUS.map((s) => (
                      <HrChip
                        key={s.id}
                        colors={colors}
                        label={s.label}
                        active={row.status === s.id}
                        onPress={() => setStatus(row.catalogId, s.id)}
                      />
                    ))}
                  </View>
                )}
                {canWrite ? (
                  <>
                    <HrField
                      colors={colors}
                      label="Notat / bevis"
                      value={noteDrafts[noteKey(row.catalogId)] ?? row.note ?? ''}
                      onChangeText={(note) => setNoteDrafts((prev) => ({
                        ...prev,
                        [noteKey(row.catalogId)]: note,
                      }))}
                    />
                    <HrButton
                      colors={colors}
                      label="Lagre notat"
                      onPress={() => commitNote(row.catalogId)}
                    />
                  </>
                ) : null}
              </View>
            );
          })}
        </HrCard>
      ) : null}

      {activeId ? (
        <IsoCompetenceCard colors={colors} iso={isoCompetence} onOpenIso={onOpenIso} />
      ) : null}

      {canWrite && activeId ? (
        <HrButton
          colors={colors}
          label="Marker alle påkrevde som OK (unntatt det som settes fra avtalen)"
          primary
          onPress={() => {
            onPatch?.((state) => {
              const nextRows = ensureEmployeeCompliance(state.compliance || [], activeId).map((row) => {
                const cat = COMPLIANCE_CATALOG.find((c) => c.id === row.catalogId);
                // Punkter som settes fra dataene (avtalen), krysses ikke av for hånd.
                if (!cat?.required || cat.derived) return row;
                return {
                  ...row,
                  status: 'ok',
                  completedAt: localIsoDate(),
                  updatedAt: new Date().toISOString(),
                };
              });
              return { compliance: replaceEmployeeCompliance(state.compliance, activeId, nextRows) };
            });
          }}
        />
      ) : null}
    </View>
  );
}

/** Kompetanse, opplæring og HMS-introduksjon eies av ISO / K-HMS. HR viser status, men endrer ikke. */
function IsoCompetenceCard({ colors, iso, onOpenIso }) {
  const status = iso?.status || 'off';
  const rows = iso?.rows || [];
  const valid = rows.filter((row) => row.status === 'gyldig').length;
  let text = 'Kompetanse, opplæring, HMS-introduksjon og avviksrutine følges opp i ISO / K-HMS → Kompetanse.';
  if (status === 'loading') text = 'Henter kompetansen fra ISO …';
  if (status === 'error') text = 'Fikk ikke hentet kompetansen fra ISO. Åpne Kompetanse i ISO for å se den.';
  if (status === 'ready') {
    text = rows.length
      ? `${valid} av ${rows.length} krav er gyldige. Krav og bevis registreres i ISO.`
      : 'Ingen kompetansekrav i ISO gjelder denne personen ennå.';
  }
  return (
    <HrCard colors={colors}>
      <View nativeID="hr-compliance-iso">
        <HrSectionTitle colors={colors} title="Kompetanse og opplæring" subtitle="Fra ISO / K-HMS" />
        <Text style={[styles.itemHint, { color: colors.muted }]}>{text}</Text>
        {status === 'ready' ? rows.map((row) => (
          <View key={row.id} style={[styles.isoRow, { borderColor: colors.line }]}>
            <Text style={[styles.itemTitle, { color: colors.ink, flex: 1 }]}>{row.title}</Text>
            <Text style={[styles.itemHint, { color: row.status === 'gyldig' ? colors.muted : colors.danger }]}>
              {`${ISO_STATUS[row.status] || row.status}${row.validTo ? ` · til ${formatNbDate(row.validTo)}` : ''}`}
            </Text>
          </View>
        )) : null}
        {onOpenIso ? (
          <HrButton colors={colors} label="Åpne Kompetanse i ISO" icon="school-outline" onPress={onOpenIso} />
        ) : null}
      </View>
    </HrCard>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summary: { fontSize: 15, fontWeight: '600' },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
  itemTitle: { fontSize: 14, fontWeight: '600' },
  itemHint: { fontSize: 12, lineHeight: 17 },
  isoRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8,
  },
});
