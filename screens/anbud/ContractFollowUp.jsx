import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { projectFromAward } from '../../src/anbud/handoff';
import {
  addDelivery,
  closeContract,
  contractAlerts,
  linkProject,
  setDeliveryStatus,
  setMilestoneDue,
  setMilestoneStatus,
} from '../../src/anbud/lifecycle';
import { formatNok } from '../../src/anbud/model';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { loadProjectState, saveProjectState } from '../../src/project/storage';

export default function ContractFollowUp({ colors, onOpenWork, onSnapshot }) {
  const [state, setState] = useState(null);
  const [note, setNote] = useState('');
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    loadAnbudState().then((loaded) => {
      setState(loaded);
      onSnapshot?.(loaded);
    });
  }, []);

  async function commit(result) {
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    await saveAnbudState(result.state);
    setState(result.state);
    onSnapshot?.(result.state);
    setNote('');
  }

  async function openProject(contract) {
    const projects = await loadProjectState();
    const handed = projectFromAward(projects, contract);
    if (!handed.ok) {
      setNote(handed.error);
      return;
    }
    if (handed.created) await saveProjectState(handed.state);
    if (contract.projectId && contract.projectId === handed.projectId) {
      setNote('Prosjektet er allerede koblet.');
      return;
    }
    const loaded = await loadAnbudState();
    const linked = linkProject(loaded, contract.id, handed.projectId);
    await commit(linked);
    if (linked.ok) setNote(handed.created ? 'Prosjektet er opprettet med kontraktssummen.' : 'Prosjektet er koblet.');
  }

  if (!state) return null;
  const contracts = state.contracts || [];
  const alerts = contractAlerts(contracts);
  const active = contracts.filter((row) => row.status !== 'avsluttet');
  const closed = contracts.filter((row) => row.status === 'avsluttet');

  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.h, { color: colors.ink }]}>Kontraktsoppfølging</Text>
      <Text style={{ color: colors.muted }}>
        Milepæler, leveranser og varsler fra tildeling til sluttfaktura. Hvert steg blir liggende i loggen.
      </Text>
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {alerts.map((alert) => (
        <Text key={`${alert.contractId}-${alert.kind}-${alert.title}`} style={{ color: alert.level === 'forfalt' ? colors.danger : colors.warn }}>
          {alert.level === 'forfalt' ? 'Forfalt' : 'Innen 14 dager'}: {alert.title} · {alert.due} · {alert.contractTitle}
        </Text>
      ))}
      {!contracts.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted }}>Ingen kontrakt er registrert. Tildelte konkurranser kommer hit fra tilbudsarbeidet.</Text>
          <TouchableOpacity onPress={onOpenWork} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Gå til tilbudsarbeidet</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {active.map((contract) => (
        <ContractCard
          key={contract.id}
          contract={contract}
          colors={colors}
          draft={drafts[contract.id] || { title: '', due: '' }}
          onDraft={(patch) => setDrafts((current) => ({ ...current, [contract.id]: { ...(current[contract.id] || { title: '', due: '' }), ...patch } }))}
          onCommit={commit}
          onOpenProject={() => openProject(contract)}
        />
      ))}
      {closed.map((contract) => (
        <View key={contract.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{contract.title}</Text>
          <Text style={{ color: colors.muted }}>Avsluttet · {formatNok(contract.value)}</Text>
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

function ContractCard({ contract, colors, draft, onDraft, onCommit, onOpenProject }) {
  const [dates, setDates] = useState({});

  async function apply(change) {
    const loaded = await loadAnbudState();
    const result = change(loaded);
    await onCommit(result);
    return result;
  }

  return (
    <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>{contract.title}</Text>
      <Text style={{ color: colors.ink }}>{contract.buyer || 'Oppdragsgiver ikke oppgitt'} · {formatNok(contract.value)}</Text>
      {contract.start || contract.end ? (
        <Text style={{ color: colors.muted }}>{[contract.start, contract.end].filter(Boolean).join(' – ')}</Text>
      ) : null}
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
});
