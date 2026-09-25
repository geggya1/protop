import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { CPV_CODES, TENDER_AREAS } from '../../src/anbud/catalog';
import { fetchCompanyCpv, fetchCompetitionFile, fetchDoffinNotices } from '../../src/anbud/doffinClient';
import {
  attachDossier,
  createBidWork,
  emptyAnbudState,
  formatWhen,
  mergeTenderNotices,
  normalizeCpvCode,
  saveTenderWatch,
  setNoticeDecision,
  watchQuery,
} from '../../src/anbud/model';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { updateGroup } from '../../src/utils/groups';
import NoticeBoard from './NoticeBoard';

function Field({ label, value, onChangeText, placeholder, colors }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

function Btn({ label, onPress, colors, tone = 'brand' }) {
  const bg = tone === 'quiet' ? colors.sunken : colors.brand;
  const fg = tone === 'quiet' ? colors.ink : '#fff';
  return (
    <TouchableOpacity onPress={onPress} style={[styles.btn, { backgroundColor: bg }]} accessibilityRole="button">
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Chip({ label, on, onPress, colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.btn, { backgroundColor: on ? colors.brand : colors.sunken }]}
    >
      <Text style={{ color: on ? '#fff' : colors.ink, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AnbudScreen({ company }) {
  const colors = useColors();
  const [state, setState] = useState(emptyAnbudState());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [orgnr, setOrgnr] = useState('');
  const [cpvSource, setCpvSource] = useState('');
  const [fetchedLabels, setFetchedLabels] = useState({});
  const [lookupNote, setLookupNote] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [selectedCpv, setSelectedCpv] = useState(() => new Set());
  const [customCpv, setCustomCpv] = useState('');
  const [nationwide, setNationwide] = useState(false);
  const [selectedAreas, setSelectedAreas] = useState(() => new Set());
  const [cpvQuery, setCpvQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [view, setView] = useState('treff');
  const [busyId, setBusyId] = useState('');
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let live = true;
    loadAnbudState().then((loaded) => {
      if (!live) return;
      setState(loaded);
      const watch = loaded.watch;
      const fromCompany = !watch.savedAt && company?.name;
      setCompanyName(fromCompany ? company.name : (watch.companyName || company?.name || ''));
      setOrgnr(fromCompany ? (company.orgnr || '') : (watch.orgnr || company?.orgnr || ''));
      setCpvSource(fromCompany ? (company.cpvSource || '') : (watch.cpvSource || company?.cpvSource || ''));
      const codes = fromCompany ? (company.cpvCodes || []) : (watch.cpvCodes?.length ? watch.cpvCodes : (company?.cpvCodes || []));
      const labels = {};
      codes.forEach((row) => { if (row?.label) labels[row.code] = row.label; });
      setFetchedLabels(labels);
      setSelectedCpv(new Set(codes.map((row) => row.code).filter(Boolean)));
      setNationwide(!!watch.nationwide);
      setSelectedAreas(new Set(watch.areas.map((row) => row.id)));
      setReady(true);
    });
    return () => { live = false; };
  }, []);

  useEffect(() => {
    if (ready) saveAnbudState(state).catch(() => setError('Kunne ikke lagre anbudet lokalt.'));
  }, [state, ready]);

  const watch = state.watch;
  const query = watchQuery(watch);
  const notices = state.notices || [];
  const freshCount = notices.filter((row) => row.isNew).length;
  const queryKey = query ? `${query.cpvCodes.join(',')}|${query.locationIds.join(',')}` : '';

  const visibleCpv = useMemo(() => {
    const q = cpvQuery.trim().toLowerCase();
    if (!q) return CPV_CODES;
    return CPV_CODES.filter((row) => `${row.code} ${row.label}`.toLowerCase().includes(q));
  }, [cpvQuery]);

  function toggleSet(setter, value) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function apply(result) {
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setError('');
    setState(result.state);
    return result.state;
  }

  async function refresh(nextState) {
    const active = watchQuery(nextState.watch);
    if (!active) return;
    setSyncing(true);
    setSyncError('');
    try {
      const data = await fetchDoffinNotices(active);
      apply(mergeTenderNotices(nextState, data?.hits, data?.fetchedAt));
    } catch (err) {
      setSyncError(err?.message || 'Kunne ikke oppdatere fra Doffin.');
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!ready || !queryKey) return undefined;
    let live = true;
    const tick = () => {
      if (live) refresh(stateRef.current);
    };
    tick();
    const timer = setInterval(tick, 60 * 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [ready, queryKey]);

  function currentInput() {
    return {
      companyName,
      orgnr,
      cpvSource,
      cpvCodes: [...selectedCpv].map((code) => {
        const known = CPV_CODES.find((row) => row.code === code);
        return { code, label: fetchedLabels[code] || known?.label || `CPV ${code}` };
      }),
      nationwide,
      areas: [...selectedAreas].map((id) => TENDER_AREAS.find((row) => row.id === id)).filter(Boolean),
    };
  }

  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.bg }]} contentContainerStyle={styles.inner}>
      <Text style={[styles.h2, { color: colors.ink }]}>Trinn 1 · Anbudsvarsel</Text>
      <Text style={{ color: colors.muted }}>
        {company?.name || companyName || 'Bedriften'} bruker CPV-kodene fra registeret. Juster kodene og området, og følg kunngjøringene som treffer.
      </Text>
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <Field label="Organisasjonsnummer" value={orgnr} onChangeText={setOrgnr} placeholder="9 siffer" colors={colors} />
      <Field label="Bedrift" value={companyName} onChangeText={setCompanyName} placeholder="Fylles ut fra Enhetsregisteret" colors={colors} />
      <Btn
        label={lookingUp ? 'Henter …' : 'Hent CPV fra register'}
        colors={colors}
        onPress={async () => {
          setLookingUp(true);
          setLookupNote('');
          setError('');
          try {
            const data = await fetchCompanyCpv(orgnr);
            setCompanyName(data.company?.name || companyName);
            setOrgnr(data.company?.orgnr || orgnr);
            const labels = {};
            const codes = new Set();
            for (const row of data.cpvCodes || []) {
              codes.add(row.code);
              labels[row.code] = row.label;
            }
            setFetchedLabels(labels);
            setSelectedCpv(codes);
            setCpvSource(codes.size ? 'doffin' : '');
            setLookupNote(codes.size
              ? `Hentet ${codes.size} koder fra Doffin-tildelinger${data.winners?.length ? ` for ${data.winners.join(', ')}` : ''}. Ta bort eller legg til koder før du lagrer.`
              : 'Bedriften er i Enhetsregisteret, men har ingen offentlige CPV-koder på Doffin. Legg inn kodene manuelt.');
          } catch (err) {
            setError(err?.message || 'Kunne ikke hente bedriften.');
          } finally {
            setLookingUp(false);
          }
        }}
      />
      {lookupNote ? <Text style={{ color: colors.muted }}>{lookupNote}</Text> : null}
      <Field label="Søk i CPV" value={cpvQuery} onChangeText={setCpvQuery} placeholder="Kode eller fag, f.eks. elektro" colors={colors} />
      <View style={styles.rowWrap}>
        {[...selectedCpv].filter((code) => !CPV_CODES.some((row) => row.code === code)).map((code) => (
          <Chip
            key={code}
            colors={colors}
            on
            label={`${code.slice(0, 4)} ${fetchedLabels[code] || 'CPV'}`}
            onPress={() => toggleSet(setSelectedCpv, code)}
          />
        ))}
        {visibleCpv.map((row) => (
          <Chip
            key={row.code}
            colors={colors}
            on={selectedCpv.has(row.code)}
            label={`${row.code.slice(0, 4)} ${row.label}`}
            onPress={() => toggleSet(setSelectedCpv, row.code)}
          />
        ))}
      </View>
      <Field label="Egen CPV-kode" value={customCpv} onChangeText={setCustomCpv} placeholder="8 siffer, f.eks. 45233120" colors={colors} />
      <Btn
        label="Legg til kode"
        tone="quiet"
        colors={colors}
        onPress={() => {
          const code = normalizeCpvCode(customCpv);
          if (!code) return;
          setSelectedCpv((current) => new Set(current).add(code));
          setCustomCpv('');
        }}
      />
      <Text style={[styles.label, { color: colors.muted }]}>Område</Text>
      <View style={styles.rowWrap}>
        <Chip label="Hele Norge" colors={colors} on={nationwide} onPress={() => setNationwide((value) => !value)} />
        {!nationwide && TENDER_AREAS.map((area) => (
          <Chip
            key={area.id}
            colors={colors}
            on={selectedAreas.has(area.id)}
            label={area.name}
            onPress={() => toggleSet(setSelectedAreas, area.id)}
          />
        ))}
      </View>
      <Btn
        label="Lagre forespørsel"
        colors={colors}
        onPress={() => {
          const input = currentInput();
          const next = apply(saveTenderWatch(state, input));
          if (company?.id) {
            updateGroup(company.id, {
              orgnr: input.orgnr,
              cpvCodes: input.cpvCodes,
              cpvSource: input.cpvSource,
            }).catch(() => {});
          }
          if (next) refresh(next);
        }}
      />
      {watch.savedAt ? (
        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.summaryTitle, { color: colors.ink }]}>{watch.companyName}</Text>
          <Text style={{ color: colors.muted }}>
            {watch.cpvCodes.map((row) => row.code).join(', ')}
            {' · '}
            {watch.nationwide ? 'Hele Norge' : watch.areas.map((row) => row.name).join(', ')}
          </Text>
          <Text style={{ color: colors.muted }}>
            {syncing ? 'Henter fra Doffin …' : state.syncedAt ? `Oppdatert ${formatWhen(state.syncedAt)}` : 'Ikke hentet ennå'}
            {` · ${notices.length} aktive`}
            {freshCount ? ` · ${freshCount} nye` : ''}
          </Text>
          <Btn label="Oppdater nå" tone="quiet" colors={colors} onPress={() => refresh(state)} />
        </View>
      ) : null}
      {syncError ? <Text style={[styles.error, { color: colors.danger }]}>{syncError}</Text> : null}
      {watch.savedAt ? (
        <View style={styles.rowWrap}>
          {[
            ['treff', 'Treff'],
            ['aktuelle', 'Aktuelle'],
            ['forkastet', 'Forkastet'],
            ['tilbud', 'Tilbudsarbeid'],
          ].map(([id, label]) => (
            <Chip key={id} label={label} colors={colors} on={view === id} onPress={() => setView(id)} />
          ))}
        </View>
      ) : null}
      <NoticeBoard
        notices={notices}
        bids={state.bids || []}
        view={view}
        colors={colors}
        busyId={busyId}
        onInterest={async (id) => {
          const next = apply(setNoticeDecision(stateRef.current, id, 'aktuell'));
          if (!next) return;
          setView('aktuelle');
          setBusyId(id);
          try {
            const data = await fetchCompetitionFile(id);
            apply(attachDossier(next, id, data?.dossier));
          } catch (err) {
            setSyncError(err?.message || 'Kunne ikke hente konkurransegrunnlaget.');
          } finally {
            setBusyId('');
          }
        }}
        onReject={(id) => {
          apply(setNoticeDecision(stateRef.current, id, 'forkastet'));
          setView('forkastet');
        }}
        onBid={(id) => {
          const next = apply(createBidWork(stateRef.current, id));
          if (next) setView('tilbud');
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  inner: { padding: 16, paddingBottom: 48, gap: 10 },
  field: { gap: 4 },
  label: { fontSize: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  btn: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  btnText: { fontWeight: '700', fontSize: 13 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 6 },
  summary: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 4 },
  summaryTitle: { fontWeight: '800', fontSize: 16 },
  h2: { fontWeight: '800', fontSize: 18 },
  error: { fontWeight: '700' },
});
