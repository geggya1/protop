import React, { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { attachPortalCatalog, fetchCompetitionFile } from '../../src/anbud/doffinClient';
import {
  awardContract,
  executionBlockers,
  markOutcome,
  openExecution,
  regulatoryChecks,
  STAGE_LABELS,
  STRATEGY_ITEMS,
  toggleStrategy,
} from '../../src/anbud/lifecycle';
import { formatWhen, portalFromUrl } from '../../src/anbud/model';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';

export default function BidDesk({ company, colors, bids, onOpenSettings, onOpenAlerts, onOpenContracts, onSnapshot }) {
  const [profile, setProfile] = useState(null);
  const [storedBids, setStoredBids] = useState(bids || []);
  const [busyId, setBusyId] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    loadAnbudState().then((state) => {
      setProfile(state.supplierProfile);
      const storedList = state.bids || [];
      const incoming = bids || [];
      const ids = new Set(storedList.map((row) => row.id));
      const extra = incoming.filter((row) => row?.id && !ids.has(row.id));
      setStoredBids(storedList.length || extra.length ? [...extra, ...storedList] : incoming);
      onSnapshot?.(state);
    });
  }, [company?.id, bids]);

  async function commit(result) {
    if (!result.ok) {
      setNote(result.error);
      return;
    }
    await saveAnbudState(result.state);
    setStoredBids(result.state.bids);
    onSnapshot?.(result.state);
    setNote('');
  }

  async function refreshFiles(bid) {
    setBusyId(bid.id);
    setNote('');
    let dossier = bid.dossier || {};
    try {
      if (/^\d{4}-\d+$/.test(String(bid.noticeId || ''))) {
        const file = await fetchCompetitionFile(bid.noticeId);
        dossier = file?.dossier ? { ...dossier, ...file.dossier } : dossier;
      }
      dossier = await attachPortalCatalog(dossier);
    } catch (err) {
      setNote(err?.message || 'Kunne ikke hente grunnlaget.');
      setBusyId('');
      return;
    }
    const loaded = await loadAnbudState();
    const next = {
      ...loaded,
      bids: (loaded.bids || []).map((row) => (row.id === bid.id ? { ...row, dossier: { ...(row.dossier || {}), ...dossier } } : row)),
      notices: (loaded.notices || []).map((row) => (row.id === bid.noticeId ? { ...row, dossier: { ...(row.dossier || {}), ...dossier } } : row)),
    };
    await saveAnbudState(next);
    setStoredBids(next.bids);
    setNote(dossier.portalFiles?.length
      ? `${dossier.portalFiles.length} dokumenter er lagt i konkurransen. Filene åpnes på portalen.`
      : (dossier.portalNote || 'Fillisten er oppdatert.'));
    setBusyId('');
  }

  const rows = storedBids.length ? storedBids : (bids || []);

  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.h, { color: colors.ink }]}>Tilbudsarbeid</Text>
      <Text style={{ color: colors.muted }}>
        Konkurranser som merkes aktuelle i anbudsvarslingen kommer hit med tekst, frister, vedlegg og publiserte spørsmål og svar.
      </Text>
      {profile ? (
        <Text style={{ color: colors.muted }}>
          Innlogging: {profile.username} · {profile.portal}. Endres under Innstillinger.
        </Text>
      ) : (
        <TouchableOpacity onPress={onOpenSettings} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Registrer innloggingsportalen under Innstillinger.</Text>
        </TouchableOpacity>
      )}
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {rows.map((bid) => (
        <BidCard
          key={bid.id}
          bid={bid}
          colors={colors}
          busy={busyId === bid.id}
          onRefresh={() => refreshFiles(bid)}
          onCommit={commit}
          onOpenContracts={onOpenContracts}
        />
      ))}
      {!rows.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted }}>Ingen konkurranser er merket aktuelle ennå. Merk dem i anbudsvarslingen, så hentes tekst, vedlegg og spørsmål hit.</Text>
          <TouchableOpacity onPress={onOpenAlerts} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Gå til treffene</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function BidCard({ bid, colors, busy, onRefresh, onCommit, onOpenContracts }) {
  const dossier = bid.dossier;
  const interest = bid.interest;
  const portalName = portalFromUrl(dossier?.interestUrl || dossier?.documentsUrl).name || 'portalen';
  const interestUrl = dossier?.interestUrl || dossier?.documentsUrl || '';
  const stage = bid.stage || 'planlegging';
  const locked = stage === 'kontrakt' || stage === 'tapt' || stage === 'trukket';
  const checks = regulatoryChecks(bid);
  const blockers = stage === 'planlegging' ? executionBlockers(bid) : [];
  const [value, setValue] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  async function apply(change) {
    const loaded = await loadAnbudState();
    await onCommit(change(loaded));
  }

  return (
    <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.brandSoft }]}>
      <Text style={{ color: colors.brand, fontWeight: '600' }}>{STAGE_LABELS[stage] || 'Planlegging'}</Text>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>{bid.title}</Text>
      <Text style={{ color: colors.ink }}>{bid.buyer || 'Oppdragsgiver ikke oppgitt'}</Text>
      {interest ? (
        <Text style={{ color: colors.ink }}>
          Interesse meldt i ProTop som {interest.username} {interest.registeredAt ? formatWhen(interest.registeredAt) : ''}
        </Text>
      ) : (
        <Text style={{ color: colors.muted }}>Interesse er ikke registrert i ProTop ennå.</Text>
      )}
      {interestUrl ? (
        <Text style={{ color: colors.brand }} onPress={() => Linking.openURL(interestUrl)}>
          Meld interesse og åpne filene på {portalName}
        </Text>
      ) : null}
      <TouchableOpacity onPress={onRefresh} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>{busy ? 'Henter grunnlag …' : 'Oppdater grunnlag'}</Text>
      </TouchableOpacity>
      {dossier?.documentsUrl || dossier?.submissionDeadline || dossier?.portalFiles?.length ? <DossierLines dossier={dossier} colors={colors} /> : (
        <Text style={{ color: colors.muted }}>Grunnlaget er ikke lest inn ennå.</Text>
      )}
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Kravsjekk</Text>
      {checks.map((check) => (
        <Text key={check.id} style={{ color: check.ok ? colors.ink : (check.blocking ? colors.danger : colors.warn) }}>
          {check.ok ? '✓' : '·'} {check.label}: {check.detail}
        </Text>
      ))}
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Tilbudsstrategi</Text>
      {STRATEGY_ITEMS.map((item) => {
        const on = !!bid.strategy?.[item.id];
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => apply((loaded) => toggleStrategy(loaded, bid.id, item.id))}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on, disabled: locked }}
            disabled={locked}
          >
            <Text style={{ color: on ? colors.ink : colors.muted }}>{on ? '✓' : '○'} {item.label}</Text>
          </TouchableOpacity>
        );
      })}
      {stage === 'planlegging' ? (
        <View style={{ gap: 6 }}>
          {blockers.length ? <Text style={{ color: colors.muted }}>Gjenstår: {blockers.join(' · ')}</Text> : null}
          <TouchableOpacity onPress={() => apply((loaded) => openExecution(loaded, bid.id))} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Start gjennomføring</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {stage === 'gjennomforing' ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Kontrakt ved tildeling</Text>
          <TextInput value={value} onChangeText={setValue} placeholder="Kontraktssum" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]} />
          <TextInput value={start} onChangeText={setStart} placeholder="Oppstart ÅÅÅÅ-MM-DD" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]} />
          <TextInput value={end} onChangeText={setEnd} placeholder="Overlevering ÅÅÅÅ-MM-DD" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]} />
          <TouchableOpacity onPress={() => apply((loaded) => awardContract(loaded, bid.id, { value, start, end }))} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Registrer kontrakt</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {stage === 'kontrakt' ? (
        <TouchableOpacity onPress={onOpenContracts} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>Kontrakten ligger i kontraktsoppfølgingen.</Text>
        </TouchableOpacity>
      ) : null}
      {stage === 'planlegging' || stage === 'gjennomforing' ? (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity onPress={() => apply((loaded) => markOutcome(loaded, bid.id, 'tapt'))} accessibilityRole="button">
            <Text style={{ color: colors.danger }}>Tapt</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => apply((loaded) => markOutcome(loaded, bid.id, 'trukket'))} accessibilityRole="button">
            <Text style={{ color: colors.muted }}>Trukket</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

function Line({ label, value, colors }) {
  if (!value) return null;
  return <Text style={{ color: colors.ink }}>{label}: {value}</Text>;
}

function DossierLines({ dossier, colors }) {
  const files = dossier.portalFiles || [];
  return (
    <View style={{ gap: 4 }}>
      <Line label="Tilbudsfrist" value={dossier.submissionDeadline} colors={colors} />
      <Line label="Frist for spørsmål" value={dossier.questionDeadline} colors={colors} />
      <Line label="Prosedyre" value={dossier.procedure} colors={colors} />
      <Line label="ESPD" value={dossier.espd ? 'Egenerklæring brukes' : ''} colors={colors} />
      {dossier.description ? <Text style={{ color: colors.ink }}>{dossier.description}</Text> : null}
      {dossier.procedureOutline ? <Text style={{ color: colors.ink }}>{dossier.procedureOutline}</Text> : null}
      {dossier.additionalInfo ? <Text style={{ color: colors.ink }}>{dossier.additionalInfo}</Text> : null}
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Vedlegg</Text>
      {files.length ? files.map((file) => (
        <Text key={file.name} style={{ color: colors.ink }}>{file.name}{file.size ? ` · ${file.size}` : ''} · åpnes på portalen</Text>
      )) : null}
      {dossier.documents?.length ? dossier.documents.map((doc) => (
        <Text key={doc.url} style={{ color: colors.brand }} onPress={() => Linking.openURL(doc.url)}>{doc.title}</Text>
      )) : null}
      {!files.length && !dossier.documents?.length ? <Text style={{ color: colors.muted }}>Ingen dokumenter er lest inn ennå.</Text> : null}
      {!!dossier.portalNote && !files.length ? <Text style={{ color: colors.muted }}>{dossier.portalNote}</Text> : null}
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Spørsmål og svar</Text>
      {dossier.qa?.length ? dossier.qa.map((row) => (
        <Text key={`${row.question}-${row.answer}`} style={{ color: colors.ink }}>{row.question}: {row.answer}</Text>
      )) : <Text style={{ color: colors.muted }}>Ingen spørsmål og svar er publisert i kunngjøringen ennå.</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
});
