import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  bidDeskBucket,
  bidOverview,
  bidStatusCounts,
  bidWorkspacePath,
  normalizeBidWork,
  sortBidsByDeadline,
} from '../../src/anbud/bidLibrary';
import { attachPortalCatalog, fetchCompetitionFile, storeReachableFiles } from '../../src/anbud/doffinClient';
import { STAGE_LABELS } from '../../src/anbud/lifecycle';
import { deadlineInfo } from '../../src/anbud/noticeText';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import BidWorkspace from './BidWorkspace';
import FormBuilderScreen from './FormBuilderScreen';
import FilterMenu from '../../components/FilterMenu';

const FILTERS = [
  ['alle', 'Alle'],
  ['aktive', 'Aktive'],
  ['levert', 'Levert'],
  ['vunnet', 'Vunnet'],
  ['utgatt', 'Utgått'],
  ['avsluttet', 'Avsluttet'],
];

const SORTS = [
  ['asc', 'Frist nærmest først'],
  ['desc', 'Frist lengst først'],
];

function openBidInOwnWindow(bidId) {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const path = bidWorkspacePath(bidId);
  if (!path) return false;
  const url = `${window.location.origin}${path}`;
  window.open(url, `protop_tilbud_${bidId}`, 'noopener,noreferrer');
  return true;
}

export default function BidDesk({
  company, colors, bids, focusBidId, onFocusHandled, onOpenSettings, onOpenAlerts, onOpenContracts, onSnapshot,
  members = [], units = [], companies = [],
}) {
  const [state, setState] = useState(null);
  const [openId, setOpenId] = useState('');
  const [filter, setFilter] = useState('aktive');
  const [sortDir, setSortDir] = useState('asc');
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

  function openBid(bidId) {
    if (openBidInOwnWindow(bidId)) return;
    setOpenId(bidId);
  }

  const rows = state?.bids || bids || [];
  const counts = bidStatusCounts(rows);
  const visible = sortBidsByDeadline(
    rows.filter((bid) => {
      if (filter === 'alle') return true;
      return bidDeskBucket(bid) === filter;
    }),
    sortDir,
  );
  const openBidRow = rows.find((row) => row.id === openId) || null;

  if (openBidRow && state) {
    return (
      <BidWorkspace
        bid={openBidRow}
        state={state}
        colors={colors}
        busy={busyId === openBidRow.id}
        note={note}
        members={members}
        units={units}
        companies={companies}
        onBack={() => { setOpenId(''); setNote(''); }}
        onCommit={commit}
        onRefresh={() => refreshFiles(openBidRow)}
        onOpenInWindow={Platform.OS === 'web' ? () => openBidInOwnWindow(openBidRow.id) : undefined}
      />
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {counts.alle ? (
        <Text style={{ color: colors.muted }}>
          {`${counts.alle} tilbud · ${counts.aktive} aktive · ${counts.levert} levert · ${counts.vunnet} vunnet · ${counts.utgatt} utgått`}
        </Text>
      ) : null}
      <FilterMenu
        groups={[
          {
            id: 'status',
            label: 'Status',
            value: filter,
            onChange: setFilter,
            options: FILTERS.map(([id, label]) => ({ id, label: `${label} (${counts[id] || 0})` })),
          },
          {
            id: 'sort',
            label: 'Sortering',
            value: sortDir,
            onChange: setSortDir,
            options: SORTS.map(([id, label]) => ({ id, label })),
          },
        ]}
      />
      {!!note && <Text style={{ color: colors.brand }}>{note}</Text>}
      {visible.map((bid) => {
        const overview = bidOverview(bid);
        const deadline = deadlineInfo(overview.deadline);
        const urgent = deadline.tone === 'danger' || deadline.tone === 'warn';
        const bucket = bidDeskBucket(bid);
        const statusLabel = bucket === 'utgatt'
          ? 'Utgått'
          : (STAGE_LABELS[overview.stage] || 'Planlegging');
        return (
          <View
            key={bid.id}
            style={[styles.card, { borderColor: urgent ? colors.danger : colors.line, backgroundColor: colors.card }]}
          >
            <TouchableOpacity
              onPress={() => openBid(bid.id)}
              accessibilityRole="button"
              accessibilityLabel={`Åpne tilbud ${bid.title}`}
              style={styles.cardBody}
            >
              <View style={styles.cardMain}>
                <Text style={{ color: colors.brand, fontWeight: '600' }}>{statusLabel}</Text>
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{bid.title}</Text>
                <Text style={{ color: colors.ink }}>{bid.buyer || 'Oppdragsgiver ikke oppgitt'}</Text>
                <Text style={{ color: colors.muted }}>
                  {overview.assignee ? `Ansvarlig: ${overview.assignee} · ` : 'Ikke tildelt · '}
                  {`${overview.downloaded} dokumenter lastet`}
                  {` · ${overview.qa} spørsmål`}
                  {overview.forms ? ` · ${overview.doneForms}/${overview.forms} skjema ferdig` : ''}
                </Text>
              </View>
              <View style={styles.deadlineSide} accessibilityRole="summary">
                <Text style={{ color: urgent ? colors.danger : colors.brand, fontWeight: '700', fontSize: urgent ? 16 : 14, textAlign: 'right' }}>
                  {deadline.headline}
                </Text>
                <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'right' }}>{deadline.detail}</Text>
              </View>
            </TouchableOpacity>
            <View style={styles.actions}>
              <TouchableOpacity
                onPress={() => openBid(bid.id)}
                accessibilityRole="button"
                accessibilityLabel={`Arbeid med ${bid.title}`}
              >
                <Text style={{ color: colors.brand, fontWeight: '600' }}>
                  {Platform.OS === 'web' ? 'Åpne i eget vindu' : 'Åpne'}
                </Text>
              </TouchableOpacity>
              {Platform.OS === 'web' ? (
                <TouchableOpacity
                  onPress={() => setOpenId(bid.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Åpne ${bid.title} her`}
                >
                  <Text style={{ color: colors.muted }}>Åpne her</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
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
      {rows.length && !visible.length ? (
        <Text style={{ color: colors.muted }}>Ingen tilbud i denne statusen.</Text>
      ) : null}
      <TouchableOpacity onPress={() => setShowForms((value) => !value)} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>{showForms ? 'Skjul skjemabygger' : 'Bygg skjema for bedriften'}</Text>
      </TouchableOpacity>
      {showForms && state ? <FormBuilderScreen state={state} colors={colors} commit={commit} /> : null}
      <TouchableOpacity onPress={onOpenContracts} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>Kontrakter og avtaler</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onOpenSettings} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>Innloggingsportal</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  h: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  step: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  cardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardMain: { flex: 1, gap: 4, minWidth: 0 },
  deadlineSide: { width: 140, flexShrink: 0, alignItems: 'flex-end', gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 2 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
});
