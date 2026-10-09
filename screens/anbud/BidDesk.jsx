import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  bidDeskBucket,
  bidOverview,
  bidStatusCounts,
  normalizeBidWork,
  sortBidsByDeadline,
} from '../../src/anbud/bidLibrary';
import { createManualBidWork } from '../../src/anbud/model';
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
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftBuyer, setDraftBuyer] = useState('');
  const [draftDeadline, setDraftDeadline] = useState('');

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
      return result;
    }
    setState(result.state);
    setNote('');
    onSnapshot?.(result.state);
    await saveAnbudState(result.state, company?.id);
    return result;
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

  async function createManual() {
    const loaded = state || await loadAnbudState(company?.id);
    const result = await commit(createManualBidWork(loaded, {
      title: draftTitle,
      buyer: draftBuyer,
      deadline: draftDeadline,
    }));
    if (!result?.ok) return;
    const created = result.state.bids[0];
    setDraftTitle('');
    setDraftBuyer('');
    setDraftDeadline('');
    setCreating(false);
    setOpenId(created.id);
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
      />
    );
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={styles.toolbar}>
        <TouchableOpacity
          onPress={() => { setCreating((value) => !value); setNote(''); }}
          accessibilityRole="button"
          style={[styles.btn, { backgroundColor: colors.brand }]}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>{creating ? 'Avbryt' : 'Ny'}</Text>
        </TouchableOpacity>
      </View>
      {creating ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card, gap: 8 }]}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Nytt tilbudsarbeid</Text>
          <Text style={{ color: colors.muted }}>
            Opprett et tilbud manuelt når konkurransen ikke kommer fra varslingen.
          </Text>
          <TextInput
            value={draftTitle}
            onChangeText={setDraftTitle}
            placeholder="Tittel"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <TextInput
            value={draftBuyer}
            onChangeText={setDraftBuyer}
            placeholder="Oppdragsgiver"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <TextInput
            value={draftDeadline}
            onChangeText={setDraftDeadline}
            placeholder="Tilbudsfrist, f.eks. 02.11.2026 12:00"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
          />
          <TouchableOpacity onPress={createManual} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Opprett og åpne</Text>
          </TouchableOpacity>
        </View>
      ) : null}
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
              onPress={() => setOpenId(bid.id)}
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
                onPress={() => setOpenId(bid.id)}
                accessibilityRole="button"
                accessibilityLabel={`Åpne ${bid.title} her`}
              >
                <Text style={{ color: colors.brand, fontWeight: '600' }}>Åpne</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
      {!rows.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.muted }}>
            Ingen tilbud er opprettet. Bruk Ny, eller merk en konkurranse som aktuell og velg Gi tilbud.
          </Text>
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
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  cardBody: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardMain: { flex: 1, gap: 4, minWidth: 0 },
  deadlineSide: { width: 140, flexShrink: 0, alignItems: 'flex-end', gap: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 2 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
});
