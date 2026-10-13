import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import {
  bidDeskBucket,
  bidOverview,
  bidStatusCounts,
  normalizeBidWork,
  sortBidsByDeadline,
} from '../../src/anbud/bidLibrary';
import { createManualBidWork } from '../../src/anbud/model';
import { assignmentFromChoice, assignmentGap, assignmentHint, processStepsForBid } from '../../src/anbud/processTrail';
import { departmentsOf } from '../../src/project/companyUnits';
import ProcessTrail from './ProcessTrail';
import { attachPortalCatalog, fetchCompetitionFile, storeReachableFiles } from '../../src/anbud/doffinClient';
import { STAGE_LABELS } from '../../src/anbud/lifecycle';
import { deadlineInfo } from '../../src/anbud/noticeText';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { showSaveToast } from '../../src/ui/saveToast';
import { bidMapRows, mergeWorkGeo } from '../../src/anbud/workMap';
import MapRail, { revealAnbudRow } from './MapRail';
import BidWorkspace from './BidWorkspace';
import FormBuilderScreen from './FormBuilderScreen';
import FilterMenu from '../../components/FilterMenu';
import InfoButton from '../../components/InfoButton';
import { useLayout } from '../../src/theme';

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
  company, colors, bids, focusBidId, onFocusHandled, onOpenSettings, onOpenAlerts, onOpenReview, onOpenContracts, onSnapshot,
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
  const [draftUnitId, setDraftUnitId] = useState('');
  const [draftPersonId, setDraftPersonId] = useState('');
  const { isPhone } = useLayout();
  const [mapFocusId, setMapFocusId] = useState('');
  const stateRef = useRef(null);
  stateRef.current = state;

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
    showSaveToast(`${downloaded} dokumenter er lagret i tilbudet.`);
    setBusyId('');
  }

  const departments = departmentsOf(units).map((row) => ({ id: row.id, name: row.name, kind: row.kind || 'avdeling' }));
  const people = (members || [])
    .filter((row) => row && row.role !== 'child' && (row.uid || row.id))
    .map((person) => ({
      id: person.uid || person.id,
      name: person.name || person.displayName || 'Uten navn',
    }));

  async function createManual() {
    const missing = assignmentGap({
      departments, people, unitId: draftUnitId, personId: draftPersonId,
    });
    if (missing.length) {
      setNote(assignmentHint(missing));
      return;
    }
    const loaded = state || await loadAnbudState(company?.id);
    const now = new Date().toISOString();
    const result = await commit(createManualBidWork(loaded, {
      title: draftTitle,
      buyer: draftBuyer,
      deadline: draftDeadline,
      source: 'manuell',
      originAt: now,
      interestAt: now,
      assignment: assignmentFromChoice({
        unit: departments.find((row) => row.id === draftUnitId) || null,
        person: people.find((row) => row.id === draftPersonId) || null,
      }),
    }));
    if (!result?.ok) return;
    showSaveToast('Tilbudet er opprettet.');
    const created = result.state.bids[0];
    setDraftTitle('');
    setDraftBuyer('');
    setDraftDeadline('');
    setDraftUnitId('');
    setDraftPersonId('');
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
  const mapBids = useMemo(() => {
    const list = visible.slice();
    if (openBidRow && !list.some((row) => row.id === openBidRow.id)) list.unshift(openBidRow);
    return bidMapRows(list, state?.notices);
  }, [visible, openBidRow, state?.notices]);

  useEffect(() => {
    if (openId) setMapFocusId(openId);
  }, [openId]);

  async function persistGeo(hits) {
    const current = stateRef.current;
    if (!current) return;
    const merged = mergeWorkGeo(current, hits);
    if (!merged.changed) return;
    await commit({ ok: true, state: { ...current, bids: merged.bids, notices: merged.notices } });
  }

  function openFromMap(id) {
    if (!rows.some((bid) => bid.id === id)) return;
    setMapFocusId(id);
    setShowForms(false);
    setNote('');
    setOpenId(id);
  }

  const map = (
    <MapRail
      rows={mapBids}
      colors={colors}
      selectedId={mapFocusId}
      legendLabel="Tilbud"
      kindLabel="Tilbud"
      openLabel="Åpne tilbudet"
      mapTitle="Kart over tilbud"
      onSelect={openFromMap}
      onPreview={(id) => { setMapFocusId(id); revealAnbudRow(id); }}
      onGeocode={persistGeo}
    />
  );

  if (openBidRow && state) {
    return (
      <View style={{ gap: 12 }}>
        {map}
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
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {map}
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={{ color: colors.ink, fontWeight: '600', flex: 1 }}>Nytt tilbudsarbeid</Text>
            {isPhone ? (
              <InfoButton title="Nytt tilbudsarbeid">
                Registrerte forespørsler vurderes under 2. Vurdering av aktuelle. Her oppretter du et tilbud som ikke har en henvendelse fra før, og velger hvem som skal arbeide med det.
              </InfoButton>
            ) : null}
          </View>
          {isPhone ? null : (
            <Text style={{ color: colors.muted }}>
              Registrerte forespørsler vurderes under 2. Vurdering av aktuelle. Her oppretter du et tilbud som ikke har en henvendelse fra før, og velger hvem som skal arbeide med det.
            </Text>
          )}
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
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Avdeling</Text>
          <View style={styles.toolbar}>
            {departments.map((unit) => {
              const on = draftUnitId === unit.id;
              return (
                <TouchableOpacity
                  key={unit.id}
                  onPress={() => setDraftUnitId(on ? '' : unit.id)}
                  accessibilityRole="button"
                  style={[styles.btn, { backgroundColor: on ? colors.brand : colors.sunken }]}
                >
                  <Text style={{ color: on ? '#fff' : colors.ink }}>{unit.name}</Text>
                </TouchableOpacity>
              );
            })}
            {!departments.length ? <Text style={{ color: colors.muted }}>Ingen avdelinger er registrert.</Text> : null}
          </View>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Person</Text>
          <View style={styles.toolbar}>
            {people.map((person) => {
              const on = draftPersonId === person.id;
              return (
                <TouchableOpacity
                  key={person.id}
                  onPress={() => setDraftPersonId(on ? '' : person.id)}
                  accessibilityRole="button"
                  style={[styles.btn, { backgroundColor: on ? colors.brand : colors.sunken }]}
                >
                  <Text style={{ color: on ? '#fff' : colors.ink }}>{person.name}</Text>
                </TouchableOpacity>
              );
            })}
            {!people.length ? <Text style={{ color: colors.muted }}>Ingen ansatte er registrert.</Text> : null}
          </View>
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
            dataSet={{ anbudId: bid.id }}
            style={[styles.card, {
              borderColor: mapFocusId === bid.id ? colors.brand : (urgent ? colors.danger : colors.line),
              backgroundColor: mapFocusId === bid.id ? colors.brandSoft : colors.card,
              borderWidth: mapFocusId === bid.id ? 2 : 1,
            }]}
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
                {bid.reviewNotes?.length ? (
                  <Text style={{ color: colors.ink }} numberOfLines={2}>
                    Notater fra vurderingen: {bid.reviewNotes.map((note) => note.text).join(' · ')}
                  </Text>
                ) : null}
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
            <ProcessTrail
              colors={colors}
              steps={processStepsForBid(bid, (state?.notices || []).find((row) => row.id === bid.noticeId))}
            />
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
            Ingen tilbud er opprettet. Merk en konkurranse som aktuell, og ta stilling under 2. Vurdering av aktuelle.
          </Text>
          <TouchableOpacity onPress={onOpenReview || onOpenAlerts} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff' }}>Gå til vurdering</Text>
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
