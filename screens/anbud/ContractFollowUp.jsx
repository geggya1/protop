import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { projectFromAward } from '../../src/anbud/handoff';
import {
  addDelivery,
  closeContract,
  contractAlerts,
  linkProject,
  registerDirectContract,
  setDeliveryStatus,
  setMilestoneDue,
  setMilestoneStatus,
  updateContractDetails,
} from '../../src/anbud/lifecycle';
import { filterContracts, indeksCaseFromContract } from '../../src/anbud/directContract';
import { formatNok } from '../../src/anbud/model';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { loadCases, saveCases } from '../../src/indeksregulering/storage';
import { loadProjectState, saveProjectState } from '../../src/project/storage';
import DirectAgreementForm from './DirectAgreementForm';

export default function ContractFollowUp({ colors, companyId, onOpenWork, onOpenIndex, onSnapshot }) {
  const [state, setState] = useState(null);
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState({});
  const [projects, setProjects] = useState([]);
  const [compose, setCompose] = useState(false);
  const [filters, setFilters] = useState({ buyer: '', project: '', from: '', to: '', query: '' });

  useEffect(() => {
    loadAnbudState(companyId).then((loaded) => {
      setState(loaded);
      onSnapshot?.(loaded);
    });
    loadProjectState().then((loaded) => {
      setProjects((loaded.projects || []).filter((row) => row.status !== 'arkivert'));
    });
  }, [companyId]);

  async function commit(result) {
    if (!result.ok) {
      setNote(result.error);
      return result;
    }
    const saved = await saveAnbudState(result.state, companyId);
    setState(saved);
    onSnapshot?.(saved);
    setNote('');
    return { ...result, state: saved };
  }

  async function seedIndex(contract) {
    const row = indeksCaseFromContract(contract);
    if (!row) return '';
    const cases = await loadCases();
    const next = [row, ...cases.filter((item) => item.id !== row.id)].slice(0, 40);
    await saveCases(next);
    return row.id;
  }

  async function register(input) {
    const loaded = await loadAnbudState(companyId);
    const result = await commit(registerDirectContract(loaded, input));
    if (!result?.ok) return result;
    const contract = result.state.contracts[0];
    const indeksCaseId = await seedIndex(contract);
    if (indeksCaseId && contract) {
      const linked = await loadAnbudState(companyId);
      await commit(updateContractDetails(linked, contract.id, { indeksCaseId }));
    }
    setCompose(false);
    setNote('Avtalen er registrert. Feltene er klare for indeksarbeid.');
    return result;
  }

  async function openProject(contract) {
    const projectState = await loadProjectState();
    const handed = projectFromAward(projectState, contract);
    if (!handed.ok) {
      setNote(handed.error);
      return;
    }
    if (handed.created) await saveProjectState(handed.state);
    setProjects((handed.state.projects || []).filter((row) => row.status !== 'arkivert'));
    if (contract.projectId && contract.projectId === handed.projectId) {
      setNote('Prosjektet er allerede koblet.');
      return;
    }
    const loaded = await loadAnbudState(companyId);
    const linked = linkProject(loaded, contract.id, handed.projectId);
    await commit(linked);
    if (linked.ok) setNote(handed.created ? 'Prosjektet er opprettet med kontraktssummen.' : 'Prosjektet er koblet.');
  }

  function openIndex(contract) {
    const draft = contract.indexDraft;
    if (!draft) {
      setNote('Avtalen har ikke uttrukne indeksfelt ennå. Importer dokumentet på nytt.');
      return;
    }
    onOpenIndex?.({ type: 'openIndexDraft', draft, caseId: contract.indeksCaseId || `ir-${contract.id}` });
  }

  if (!state) return null;
  const contracts = state.contracts || [];
  const visible = filterContracts(contracts, filters);
  const alerts = contractAlerts(visible);
  const active = visible.filter((row) => row.status !== 'avsluttet');
  const closed = visible.filter((row) => row.status === 'avsluttet');

  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.h, { color: colors.ink }]}>Kontraktsoppfølging</Text>
      <Text style={{ color: colors.muted }}>
        Registrer inngåtte avtaler direkte, eller følg opp tildeling fra tilbudsarbeidet. KI overfører opplysningene til faste felt for indeksarbeid.
      </Text>
      <View style={styles.row}>
        <TouchableOpacity onPress={() => setCompose(true)} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
          <Text style={{ color: '#fff' }}>Ny avtale</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onOpenWork} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Tilbudsarbeid</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.filters, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.ink, fontWeight: '600' }}>Filter</Text>
        <TextInput value={filters.buyer} onChangeText={(buyer) => setFilters((current) => ({ ...current, buyer }))} placeholder="Kunde" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
        <TextInput value={filters.project} onChangeText={(project) => setFilters((current) => ({ ...current, project }))} placeholder="Prosjekt" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
        <TextInput value={filters.from} onChangeText={(from) => setFilters((current) => ({ ...current, from }))} placeholder="Fra dato ÅÅÅÅ-MM-DD" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
        <TextInput value={filters.to} onChangeText={(to) => setFilters((current) => ({ ...current, to }))} placeholder="Til dato ÅÅÅÅ-MM-DD" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
        <TextInput value={filters.query} onChangeText={(query) => setFilters((current) => ({ ...current, query }))} placeholder="Søk i avtale, standard, kontakt" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
      </View>
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {compose ? (
        <DirectAgreementForm
          colors={colors}
          projects={projects}
          onCancel={() => setCompose(false)}
          onRegister={register}
        />
      ) : null}
      {alerts.map((alert) => (
        <Text key={`${alert.contractId}-${alert.kind}-${alert.title}`} style={{ color: alert.level === 'forfalt' ? colors.danger : colors.warn }}>
          {alert.level === 'forfalt' ? 'Forfalt' : 'Innen 14 dager'}: {alert.title} · {alert.due} · {alert.contractTitle}
        </Text>
      ))}
      {!contracts.length && !compose ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted }}>Ingen avtale er registrert. Importer en oppdragsavtale, eller opprett den for hånd. Tildelte konkurranser kommer fortsatt hit fra tilbudsarbeidet.</Text>
        </View>
      ) : null}
      {contracts.length && !visible.length ? (
        <Text style={{ color: colors.muted }}>Ingen avtaler matcher filteret.</Text>
      ) : null}
      {active.map((contract) => (
        <ContractCard
          key={contract.id}
          contract={contract}
          colors={colors}
          draft={drafts[contract.id] || { title: '', due: '' }}
          onDraft={(patch) => setDrafts((current) => ({ ...current, [contract.id]: { ...(current[contract.id] || { title: '', due: '' }), ...patch } }))}
          onCommit={commit}
          companyId={companyId}
          onOpenProject={() => openProject(contract)}
          onOpenIndex={() => openIndex(contract)}
        />
      ))}
      {closed.map((contract) => (
        <View key={contract.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{contract.title}</Text>
          <Text style={{ color: colors.muted }}>Avsluttet · {contract.buyer || 'Uten kunde'} · {formatNok(contract.value)}</Text>
        </View>
      ))}
      {state.audit?.length ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Logg</Text>
          {state.audit.slice(0, 8).map((row) => (
            <Text key={row.id} style={{ color: colors.muted }}>{row.detail || row.action}</Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function fieldLines(contract) {
  const fields = contract.fields || {};
  return [
    fields.standard && `Standard ${fields.standard}`,
    fields.contactName && `Kontakt ${fields.contactName}`,
    fields.indexId && `Indeks ${fields.indexId}`,
    contract.source === 'direkte' ? 'Registrert direkte' : 'Fra tilbudsarbeid',
  ].filter(Boolean);
}

function ContractCard({ contract, colors, draft, onDraft, onCommit, companyId, onOpenProject, onOpenIndex }) {
  const [dates, setDates] = useState({});

  async function apply(change) {
    const loaded = await loadAnbudState(companyId);
    const result = change(loaded);
    await onCommit(result);
    return result;
  }

  return (
    <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>{contract.title}</Text>
      <Text style={{ color: colors.ink }}>{contract.buyer || 'Oppdragsgiver ikke oppgitt'} · {formatNok(contract.value)}</Text>
      {contract.projectName && contract.projectName !== contract.title ? (
        <Text style={{ color: colors.muted }}>Prosjekt: {contract.projectName}</Text>
      ) : null}
      {contract.start || contract.end ? (
        <Text style={{ color: colors.muted }}>{[contract.start, contract.end].filter(Boolean).join(' – ')}</Text>
      ) : null}
      {fieldLines(contract).map((line) => (
        <Text key={line} style={{ color: colors.muted }}>{line}</Text>
      ))}
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Milepæler</Text>
      {contract.milestones.map((row) => (
        <View key={row.id} style={{ gap: 4 }}>
          <TouchableOpacity
            onPress={() => apply((loaded) => setMilestoneStatus(loaded, contract.id, row.id, row.status === 'utfort' ? 'planlagt' : 'utfort'))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: row.status === 'utfort' }}
          >
            <Text style={{ color: row.status === 'utfort' ? colors.success : colors.ink }}>
              {row.status === 'utfort' ? '✓' : '○'} {row.title}{row.due ? ` · ${row.due}` : ''}
            </Text>
          </TouchableOpacity>
          {!row.due ? (
            <TextInput
              value={dates[row.id] || ''}
              onChangeText={(due) => setDates((current) => ({ ...current, [row.id]: due }))}
              onBlur={() => {
                const due = dates[row.id];
                if (due) apply((loaded) => setMilestoneDue(loaded, contract.id, row.id, due));
              }}
              placeholder="Dato ÅÅÅÅ-MM-DD"
              placeholderTextColor={colors.placeholder}
              style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
            />
          ) : null}
        </View>
      ))}
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Leveranser</Text>
      {contract.deliveries.map((row) => (
        <TouchableOpacity
          key={row.id}
          onPress={() => apply((loaded) => setDeliveryStatus(loaded, contract.id, row.id, row.status === 'levert' ? 'avtalt' : 'levert'))}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: row.status === 'levert' }}
        >
          <Text style={{ color: row.status === 'levert' ? colors.success : colors.ink }}>
            {row.status === 'levert' ? '✓' : '○'} {row.title}{row.due ? ` · ${row.due}` : ''}
          </Text>
        </TouchableOpacity>
      ))}
      <TextInput value={draft.title} onChangeText={(title) => onDraft({ title })} placeholder="Ny leveranse" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]} />
      <TextInput value={draft.due} onChangeText={(due) => onDraft({ due })} placeholder="Frist ÅÅÅÅ-MM-DD" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]} />
      <TouchableOpacity
        onPress={async () => {
          const result = await apply((loaded) => addDelivery(loaded, contract.id, draft));
          if (result?.ok) onDraft({ title: '', due: '' });
        }}
        accessibilityRole="button"
        style={[styles.save, { backgroundColor: colors.brand }]}
      >
        <Text style={{ color: '#fff' }}>Legg til leveranse</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <TouchableOpacity onPress={onOpenProject} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>{contract.projectId ? 'Prosjektet er koblet' : 'Opprett prosjekt'}</Text>
        </TouchableOpacity>
        {contract.indexDraft ? (
          <TouchableOpacity onPress={onOpenIndex} accessibilityRole="button">
            <Text style={{ color: colors.brand }}>Åpne i indeksarbeid</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity onPress={() => apply((loaded) => closeContract(loaded, contract.id))} accessibilityRole="button">
          <Text style={{ color: colors.muted }}>Avslutt kontrakt</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' },
  filters: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
});
