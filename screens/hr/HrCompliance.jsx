import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  COMPLIANCE_CATALOG,
  amlContractCompleteness,
  amlFieldLabel,
  complianceSummary,
  ensureEmployeeCompliance,
  isAutoNote,
  isRequiredItem,
  privacyGoverned,
  replaceEmployeeCompliance,
  syncComplianceFromEvidence,
} from '../../src/hr/compliance';
import { activeContractFor, formatNbDate, localIsoDate } from '../../src/hr/model';
import {
  hmsCardFor, hmsCardStatus, upsertHmsCard,
} from '../../src/hr/hmsCard';
import { showSaveToast } from '../../src/ui/saveToast';
import HmsCardEditor from './HmsCardEditor';
import {
  EmptyHint, HrButton, HrCard, HrChip, HrField, HrSectionTitle,
} from './HrShared';

const STATUS_LABEL = {
  ok: 'OK',
  missing: 'Mangler',
  overdue: 'Forfalt',
  na: 'Ikke aktuelt',
};

// Punkter som krysses av for hånd. Forfalt brukes bare der dataene har en frist.
const MANUAL_STATUS = ['ok', 'missing', 'na'];

const SHEET_LABELS = { avtale: 'Avtale' };

const ISO_STATUS = {
  gyldig: 'Gyldig',
  utloper: 'Utløper snart',
  utlopt: 'Utløpt',
  mangler: 'Mangler',
  cv: 'Står i CV-en, mangler bevis',
};

function catalogItem(catalogId) {
  return COMPLIANCE_CATALOG.find((c) => c.id === catalogId) || null;
}

/** Påkrevd punkt som ikke er OK eller «Ikke aktuelt». */
function isGap(row, required) {
  return required && (row.status === 'missing' || row.status === 'overdue');
}

/**
 * Lovpålagt på personen: én liste, det som mangler først, med hva som må gjøres.
 * Avtalepunktene og HMS-kortet følger dataene. Resten krysses av her.
 */
export default function HrCompliance({
  colors, hr, canWrite, onPatch, lockedEmployeeId, isoCompetence, onOpenIso, onOpenSheet, onOpenLibraryTemplate,
  familyId = '', personName = '', personBirthDate = '',
}) {
  const activeId = String(lockedEmployeeId || '');
  const hmsRequired = hr.hmsRequired !== false;
  // Personverninformasjonen som styrt dokument (src/hr/privacyDoc.js). Godkjent: punktet følger bekreftelsen.
  const privacyDoc = hr.privacyDoc || null;
  const privacy = privacyDoc?.published ? privacyDoc : null;
  const privacyFollowsAck = privacyGoverned(privacy, activeId);

  const rows = useMemo(() => {
    if (!activeId) return [];
    const sourced = syncComplianceFromEvidence(hr.compliance || [], {
      employeeId: activeId,
      contracts: hr.contracts || [],
      hmsCards: hr.hmsCards || [],
      privacy,
    });
    return ensureEmployeeCompliance(sourced, activeId);
  }, [hr.compliance, hr.contracts, hr.hmsCards, privacy, activeId]);
  const summary = complianceSummary(rows, { hmsRequired });
  const required = (row) => isRequiredItem(row.catalogId, { hmsRequired });
  // Det som mangler først, ellers katalogens rekkefølge.
  const ordered = [...rows].sort((a, b) => Number(isGap(b, required(b))) - Number(isGap(a, required(a))));
  const gapCount = rows.filter((row) => isGap(row, required(row))).length;
  const activeContract = activeId ? activeContractFor(activeId, hr.contracts || []) : null;
  const hmsCard = activeId ? hmsCardFor(activeId, hr.hmsCards || []) : null;

  /** Én linje om punktet: hva som må gjøres når det mangler, ellers hva det bygger på. */
  function stateText(row, cat, gap) {
    const due = row.dueDate && row.status !== 'ok' ? ` Frist ${formatNbDate(row.dueDate)}.` : '';
    if (cat?.derived === 'contractExists') {
      return activeContract ? 'Aktiv arbeidsavtale er registrert under Avtale.' : 'Ingen aktiv arbeidsavtale. Registrer den under Avtale.';
    }
    if (cat?.derived === 'contract') {
      if (!activeContract) return `Ingen aktiv arbeidsavtale. Registrer den under Avtale.${due}`;
      const aml = amlContractCompleteness(activeContract);
      if (!aml.missing.length) return `Alle ${aml.total} påkrevde punkter er fylt ut i avtalen.`;
      return `Fyll ut i avtalen: ${aml.missing.map(amlFieldLabel).join(' · ')}.${due}`;
    }
    if (cat?.derived === 'hmsCard') {
      if (row.status === 'na') return 'Ikke aktuelt for denne personen.';
      const state = hmsCardStatus(hmsCard);
      if (state.id === 'expired') return `${hmsCard.number} · ${state.label}. Bestill nytt kort på hmskort.no og registrer det under.`;
      if (state.id === 'expiring') return `${hmsCard.number} · ${state.label}. Bestill nytt kort i tide.`;
      if (hmsCard?.number) return `${hmsCard.number} · ${state.label}.`;
      return cat.todo;
    }
    if (cat?.doc) {
      if (privacyFollowsAck) {
        if (row.status === 'ok') {
          const at = privacy.ackedAt?.[activeId];
          return `Har lest og bekreftet versjon ${privacy.revision}${at ? ` ${formatNbDate(at.slice(0, 10))}` : ''}.`;
        }
        if (row.status === 'na') return 'Ikke aktuelt for denne personen.';
        return `Venter på at personen leser og bekrefter versjon ${privacy.revision} under Ansatte › Min side. Nyansatte og nye versjoner gir oppgave med varsel.`;
      }
      if (privacy) return 'Personen har ikke brukerkonto og kan ikke bekrefte selv. Gi personverninformasjonen på papir eller e-post, og marker OK.';
      if (row.status === 'ok' || row.status === 'na') return '';
      if (privacyDoc?.state === 'review') return 'Personverninformasjonen venter på godkjenning i Skjemabygger. Til da krysses punktet av for hånd.';
      if (privacyDoc?.state === 'draft') return 'Personverninformasjonen er et utkast. Send den til godkjenning i Skjemabygger, så får de ansatte den til lesing og bekreftelse.';
      return 'Sett opp «Personverninformasjon til ansatte» fra KS-malen. Når den er godkjent, får alle ansatte den til lesing, nyansatte får oppgave med varsel, og punktet blir OK når de har bekreftet.';
    }
    if (gap) return cat?.todo || '';
    return '';
  }

  function setStatus(catalogId, status) {
    if (!canWrite || !activeId) return;
    const cat = catalogItem(catalogId);
    const derived = cat?.derived;
    // Personverninformasjonen følger bekreftelsen når dokumentet er godkjent. «Ikke aktuelt» kan settes.
    if (cat?.doc && privacyFollowsAck && status !== 'na' && status !== 'missing') return;
    // HMS-kort kan settes til «Ikke aktuelt» og tilbake. Resten av de avledede følger dataene.
    if (derived && !(derived === 'hmsCard' && (status === 'na' || status === 'missing'))) return;
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

  function saveNote(catalogId, note) {
    if (!canWrite || !activeId) return;
    onPatch?.((state) => {
      const nextRows = ensureEmployeeCompliance(state.compliance || [], activeId).map((row) => (
        row.catalogId === catalogId ? { ...row, note, updatedAt: new Date().toISOString() } : row
      ));
      return { compliance: replaceEmployeeCompliance(state.compliance, activeId, nextRows) };
    });
    showSaveToast?.('Notatet er lagret');
  }

  function saveHmsCard(draft) {
    if (!canWrite || !activeId) return;
    onPatch?.((state) => {
      const hmsCards = upsertHmsCard(state.hmsCards || [], { ...draft, employeeId: activeId, updatedAt: new Date().toISOString() });
      const compliance = syncComplianceFromEvidence(state.compliance || [], {
        employeeId: activeId,
        contracts: state.contracts || [],
        hmsCards,
      });
      return { hmsCards, compliance };
    });
    showSaveToast?.('HMS-kortet er lagret');
  }

  if (!activeId) {
    return (
      <View style={styles.page} nativeID="hr-compliance">
        <HrCard colors={colors}>
          <EmptyHint colors={colors} text="Velg en ansatt i personellisten for å se hva som er lovpålagt." />
        </HrCard>
      </View>
    );
  }

  return (
    <View style={styles.page} nativeID="hr-compliance">
      <HrCard colors={colors}>
        <View nativeID="hr-compliance-summary" style={styles.stack}>
          <Text style={[styles.summary, { color: gapCount ? colors.danger : colors.ink }]}>
            {gapCount
              ? `Dette mangler: ${gapCount} av ${summary.total} påkrevde punkter`
              : `Alt lovpålagt er på plass (${summary.ok} av ${summary.total} påkrevde punkter)`}
          </Text>
          <Text style={[styles.hint, { color: colors.muted }]}>
            {`Arbeidsavtale og personvern gjelder alle. HMS-kort: ${hmsRequired ? 'påkrevd i bedriften' : 'ved behov'}. Prøvetid og verneutstyr gjelder når det er avtalt eller rollen krever det. Medarbeidersamtaler ligger under Oppfølging.`}
          </Text>
        </View>

        {ordered.map((row) => {
          const cat = catalogItem(row.catalogId);
          const req = required(row);
          const gap = isGap(row, req);
          const line = stateText(row, cat, gap);
          const warn = gap || (cat?.derived === 'hmsCard' && row.status !== 'na' && hmsCardStatus(hmsCard).id === 'expiring');
          return (
            <View
              key={row.catalogId}
              nativeID={`hr-compliance-item-${row.catalogId}`}
              style={[styles.item, { borderColor: colors.line }]}
            >
              <View style={styles.itemHead}>
                <Text style={[styles.itemTitle, { color: colors.ink }]}>{row.label}</Text>
                <Text
                  style={[styles.itemState, { color: gap ? colors.danger : colors.muted }]}
                  nativeID={`hr-compliance-state-${row.catalogId}`}
                >
                  {`${STATUS_LABEL[row.status] || row.status} · ${req ? 'påkrevd' : 'ved behov'}`}
                </Text>
              </View>
              {line ? (
                <Text
                  style={[styles.line, { color: warn ? colors.danger : colors.ink }]}
                  nativeID={cat?.derived ? `hr-compliance-derived-${row.catalogId}` : undefined}
                >
                  {line}
                </Text>
              ) : null}
              {cat?.derived === 'hmsCard' && hr.hmsRule?.text ? (
                <Text style={[styles.hint, { color: colors.muted }]} nativeID="hr-compliance-hms-rule">
                  {`${hr.hmsRule.text} Endres under HR → Lovpålagt.`}
                </Text>
              ) : null}
              {cat?.hint && cat?.derived !== 'hmsCard' ? (
                <Text style={[styles.hint, { color: colors.muted }]}>{cat.hint}</Text>
              ) : null}

              {gap && cat?.sheet && onOpenSheet ? (
                <View style={styles.actions}>
                  <HrButton
                    colors={colors}
                    label={`Åpne ${SHEET_LABELS[cat.sheet] || cat.sheet}`}
                    icon="arrow-forward-outline"
                    onPress={() => onOpenSheet(cat.sheet)}
                  />
                </View>
              ) : null}

              {cat?.derived === 'hmsCard' ? (
                <HmsCardEditor
                  key={activeId}
                  colors={colors}
                  card={hmsCard}
                  canWrite={canWrite}
                  familyId={familyId}
                  personName={personName}
                  personBirthDate={personBirthDate}
                  notApplicable={row.status === 'na'}
                  onSave={saveHmsCard}
                  onApplicable={(applicable) => setStatus('hms_card', applicable ? 'missing' : 'na')}
                />
              ) : null}

              {cat?.doc && !privacy && canWrite && onOpenLibraryTemplate ? (
                <View style={styles.actions}>
                  <HrButton
                    colors={colors}
                    label={privacyDoc?.state === 'none' ? 'Sett opp personverninformasjonen' : 'Åpne personverninformasjonen'}
                    icon="document-text-outline"
                    nativeID="hr-compliance-privacy-setup"
                    onPress={() => onOpenLibraryTemplate(cat.doc)}
                  />
                </View>
              ) : null}

              {!cat?.derived && canWrite ? (
                <View style={styles.actions}>
                  {(cat?.doc && privacyFollowsAck ? MANUAL_STATUS.filter((id) => id !== 'ok') : MANUAL_STATUS).map((id) => (
                    <HrChip
                      key={id}
                      colors={colors}
                      label={STATUS_LABEL[id]}
                      active={row.status === id}
                      onPress={() => setStatus(row.catalogId, id)}
                    />
                  ))}
                </View>
              ) : null}

              <ItemNote
                key={`${activeId}:${row.catalogId}`}
                colors={colors}
                note={(cat?.derived || cat?.doc) && isAutoNote(row.note) ? '' : row.note}
                canWrite={canWrite}
                onSave={(note) => saveNote(row.catalogId, note)}
              />
            </View>
          );
        })}
      </HrCard>

      <IsoCompetenceCard colors={colors} iso={isoCompetence} onOpenIso={onOpenIso} />
    </View>
  );
}

/** Notat eller bevis på punktet. Feltet åpnes bare når man vil skrive. */
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
        <Text style={[styles.hint, { color: colors.muted }]}>{text}</Text>
        {status === 'ready' ? rows.map((row) => (
          <View key={row.id} style={[styles.isoRow, { borderColor: colors.line }]}>
            <Text style={[styles.itemTitle, { color: colors.ink }]}>{row.title}</Text>
            <Text style={[styles.hint, { color: row.status === 'gyldig' ? colors.muted : colors.danger }]}>
              {`${ISO_STATUS[row.status] || row.status}${row.validTo ? ` · til ${formatNbDate(row.validTo)}` : ''}`}
            </Text>
          </View>
        )) : null}
        {onOpenIso ? (
          <View style={styles.actions}>
            <HrButton colors={colors} label="Åpne Kompetanse i ISO" icon="school-outline" onPress={onOpenIso} />
          </View>
        ) : null}
      </View>
    </HrCard>
  );
}

const styles = StyleSheet.create({
  page: { gap: 14 },
  stack: { gap: 8 },
  summary: { fontSize: 15, fontWeight: '600' },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 6 },
  itemHead: { flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 },
  itemTitle: { fontSize: 14, fontWeight: '600', flex: 1 },
  itemState: { fontSize: 12, fontWeight: '600' },
  line: { fontSize: 13, lineHeight: 18 },
  hint: { fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { flexGrow: 1, flexBasis: 200 },
  isoRow: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, marginTop: 8,
  },
});
