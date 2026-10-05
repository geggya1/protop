import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { bidOverview, bidStatusCounts, normalizeBidWork } from '../../src/anbud/bidLibrary';
import { attachPortalCatalog, fetchCompetitionFile, storeReachableFiles } from '../../src/anbud/doffinClient';
import { STAGE_LABELS } from '../../src/anbud/lifecycle';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import BidWorkspace from './BidWorkspace';
import FormBuilderScreen from './FormBuilderScreen';

const FILTERS = [
  ['alle', 'Alle'],
  ['planlegging', 'Planlegging'],
  ['gjennomforing', 'Gjennomføring'],
  ['kontrakt', 'Kontrakt'],
  ['avsluttet', 'Avsluttet'],
];

export default function BidDesk({ company, colors, bids, focusBidId, onFocusHandled, onOpenSettings, onOpenAlerts, onOpenContracts, onSnapshot }) {
  const [state, setState] = useState(null);
  const [openId, setOpenId] = useState('');
  const [filter, setFilter] = useState('alle');
  const [busyId, setBusyId] = useState('');
  const [note, setNote] = useState('');
  const [showForms, setShowForms] = useState(false);

  useEffect(() => {
    let live = true;
    loadAnbudState(company?.id).then((loaded) => {
      if (!live) return;
      setState(loaded);
      onSnapshot?.(loaded);
    });
    return () => { live = false; };
    // bids holdes utenfor. onSnapshot gir forelderen et nytt array, og da ville lasting kjørt i ring.
  }, [company?.id]);

  useEffect(() => {
    if (!focusBidId) return;
    setOpenId(focusBidId);
    setShowForms(false);
    onFocusHandled?.();
  }, [focusBidId]);

  async function commit(result) {
    if (!result?.ok) {
      setNote(result?.error || 'Kunne ikke lagre.');
      return;
    }
    setState(result.state);
    setNote('');
    onSnapshot?.(result.state);
    await saveAnbudState(result.state, company?.id);
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
      dossier = await storeReachableFiles(dossier);
    } catch (err) {
      setNote(err?.message || 'Kunne ikke hente grunnlaget.');
      setBusyId('');
      return;
    }
    const loaded = await loadAnbudState(company?.id);
    const next = {
      ...loaded,
      bids: (loaded.bids || []).map((row) => (
        row.id === bid.id ? normalizeBidWork({ ...row, dossier: { ...(row.dossier || {}), ...dossier } }) : row
      )),
      notices: (loaded.notices || []).map((row) => (
        row.id === bid.noticeId ? { ...row, dossier: { ...(row.dossier || {}), ...dossier } } : row
      )),
    };
    await saveAnbudState(next, company?.id);
    setState(next);
    onSnapshot?.(next);
    const stored = next.bids.find((row) => row.id === bid.id);
    const downloaded = (stored?.files || []).filter((row) => row.status === 'lastet').length;
    const answers = stored?.dossier?.qa?.length || 0;
    setNote(`${downloaded} dokumenter er lagret i tilbudet. ${answers ? `${answers} spørsmål og svar` : 'Ingen spørsmål og svar er publisert ennå'}.`);
    setBusyId('');
  }

  const rows = state?.bids || bids || [];
  const counts = bidStatusCounts(rows);
  const visible = rows.filter((bid) => {
    if (filter === 'alle') return true;
    if (filter === 'avsluttet') return bid.stage === 'tapt' || bid.stage === 'trukket';
    return (bid.stage || 'planlegging') === filter;
  });
  const openBid = rows.find((row) => row.id === openId) || null;

  if (openBid && state) {
    return (
      <BidWorkspace
        bid={openBid}
        state={state}
        colors={colors}
        busy={busyId === openBid.id}
        note={note}
        onBack={() => { setOpenId(''); setNote(''); }}
        onCommit={commit}
        onRefresh={() => refreshFiles(openBid)}
      />
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.h, { color: colors.ink }]}>Tilbud</Text>
      <Text style={{ color: colors.muted }}>
        {counts.alle
          ? `${counts.alle} tilbud · ${counts.planlegging} i planlegging · ${counts.gjennomforing} i gjennomføring · ${counts.kontrakt} kontrakt`
          : 'Gi tilbud på en aktuell konkurranse, så åpnes tilbudsarbeidet her.'}
      </Text>
      <View style={styles.row}>
        {FILTERS.map(([id, label]) => {
          const on = filter === id;
          const count = counts[id] || 0;
          return (
            <TouchableOpacity
              key={id}
              onPress={() => setFilter(id)}
              accessibilityRole="button"
              style={[styles.step, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
            >
              <Text style={{ color: colors.ink }}>{label} ({count})</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {visible.map((bid) => {
        const overview = bidOverview(bid);
        return (
          <TouchableOpacity
            key={bid.id}
            onPress={() => setOpenId(bid.id)}
            accessibilityRole="button"
            accessibilityLabel={`Åpne tilbud ${bid.title}`}
            style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}
          >
            <Text style={{ color: colors.brand, fontWeight: '600' }}>{STAGE_LABELS[overview.stage] || 'Planlegging'}</Text>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{bid.title}</Text>
            <Text style={{ color: colors.ink }}>{bid.buyer || 'Oppdragsgiver ikke oppgitt'}</Text>
            <Text style={{ color: colors.muted }}>
              {overview.deadline ? `Frist ${overview.deadline}` : 'Frist ikke oppgitt'}
              {` · ${overview.downloaded} dokumenter lastet`}
              {` · ${overview.qa} spørsmål`}
              {overview.forms ? ` · ${overview.doneForms}/${overview.forms} skjema ferdig` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}
      {!rows.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted }}>Ingen tilbud er opprettet. Merk konkurransen som aktuell, og velg Gi tilbud.</Text>
          <TouchableOpacity onPress={onOpenAlerts} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Gå til treffene</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      <TouchableOpacity onPress={() => setShowForms((value) => !value)} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>{showForms ? 'Skjul skjemabygger' : 'Bygg skjema for bedriften'}</Text>
      </TouchableOpacity>
      {showForms && state ? <FormBuilderScreen state={state} colors={colors} commit={commit} /> : null}
      <TouchableOpacity onPress={onOpenContracts} accessibilityRole="button">
        <Text style={{ color: colors.muted }}>Kontrakter som er tildelt, ligger i kontraktsoppfølgingen.</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onOpenSettings} accessibilityRole="button">
        <Text style={{ color: colors.muted }}>Innloggingsportalen endres under Innstillinger.</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  step: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 4 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
});
