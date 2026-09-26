import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CPV_CODES, CPV_GROUPS, TENDER_AREAS } from '../../src/anbud/catalog';
import { buildTenderAlert } from '../../src/anbud/alertMail';
import { attachPortalCatalog, fetchCompetitionFile, fetchWatchHits, sendTenderAlert } from '../../src/anbud/doffinClient';
import { fetchPublicCompany } from '../../src/project/companyPublic';
import {
  emptyAnbudState, formatMatchLabel, formatWhen, latestPublished, mergeTenderNotices, normalizeCpvCode, normalizeKeywords, noticeInArea, registerInterest, saveTenderWatch, setNoticeDecision, watchFingerprint, watchQuery,
} from '../../src/anbud/model';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { updateGroup } from '../../src/utils/groups';
import { BREAKPOINTS } from '../../src/theme';
import TenderHitCards from './TenderHitCards';

const FILTERS = [
  ['alle', 'Alle'],
  ['nye', 'Nye'],
  ['aktuelle', 'Aktuelle'],
];

const COLUMNS = [
  { key: 'publishedAt', label: 'Publisert', width: 120, kind: 'date' },
  { key: 'source', label: 'Type', width: 90, kind: 'text' },
  { key: 'deadline', label: 'Frist', width: 110, kind: 'date' },
  { key: 'title', label: 'Konkurranse', width: 340, kind: 'text' },
  { key: 'buyer', label: 'Oppdragsgiver', width: 170, kind: 'text' },
  { key: 'place', label: 'Sted', width: 150, kind: 'text' },
  { key: 'match', label: 'Matcher', width: 160, kind: 'text' },
];

function fold(value) {
  return String(value || '')
    .toLocaleLowerCase('nb-NO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function columnValue(row, key, watch) {
  if (key === 'source') return row.source === 'ted' ? 'TED' : 'Doffin';
  if (key === 'place') return (row.places || []).join(', ');
  if (key === 'match') return formatMatchLabel(row, watch);
  if (key === 'buyer') return row.buyer || '';
  if (key === 'title') return row.title || '';
  return row[key] || '';
}

function day(value) {
  const raw = String(value || '');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw ? formatWhen(raw) : '—';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function Chip({ label, on, onPress, colors, hint }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={hint || label} style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}>
      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13, fontWeight: '400' }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function TenderAlert({ company, colors, onBids, onOpenSettings }) {
  const { width } = useWindowDimensions();
  const wide = width >= 860;
  // Telefon under 768 px. Nettbrett og web beholder tabellen.
  const phone = width < BREAKPOINTS.tablet;
  const [state, setState] = useState(emptyAnbudState());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState('alle');
  const [sourceFilter, setSourceFilter] = useState('alle');
  const [queryText, setQueryText] = useState('');
  const [cpvQuery, setCpvQuery] = useState('');
  const [customCpv, setCustomCpv] = useState('');
  const [tradeDraft, setTradeDraft] = useState('');
  const [keywordDraft, setKeywordDraft] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [emailDraft, setEmailDraft] = useState('');
  const [selectedCpv, setSelectedCpv] = useState(() => new Set());
  const [trades, setTrades] = useState([]);
  const [nationwide, setNationwide] = useState(true);
  const [areas, setAreas] = useState(() => new Set());
  const [channels, setChannels] = useState(() => new Set(['doffin', 'ted']));
  const [notify, setNotify] = useState({ push: true, varsel: true, email: false });
  const [emails, setEmails] = useState([]);
  const [mailNote, setMailNote] = useState('');
  const [savedNote, setSavedNote] = useState('');
  const [showCriteria, setShowCriteria] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(true);
  const [archiveOn, setArchiveOn] = useState(false);
  const [areaId, setAreaId] = useState('');
  const [areaOpen, setAreaOpen] = useState(false);
  const [sort, setSort] = useState({ key: 'publishedAt', dir: 'desc' });
  const [colFilter, setColFilter] = useState({});
  const [openId, setOpenId] = useState('');
  const [openGroups, setOpenGroups] = useState(() => new Set());
  const [companyTrades, setCompanyTrades] = useState(company?.naeringskoder || []);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    let live = true;
    loadAnbudState().then((loaded) => {
      if (!live) return;
      const watch = loaded.watch || {};
      const codes = [...(company?.cpvCodes || []), ...(watch.cpvCodes || [])];
      setSelectedCpv(new Set(codes.map((row) => normalizeCpvCode(typeof row === 'string' ? row : row?.code)).filter(Boolean)));
      setTrades([...(company?.naeringskoder || []), ...(watch.naeringskoder || [])].filter((row, index, list) => list.indexOf(row) === index));
      setNationwide(watch.savedAt ? !!watch.nationwide : true);
      setAreas(new Set((watch.areas || []).map((row) => row.id)));
      setChannels(new Set(watch.channels?.length ? watch.channels : ['doffin', 'ted']));
      setNotify(watch.notify || { push: true, varsel: true, email: false });
      setEmails(watch.emails || []);
      setKeywords(watch.keywords || []);
      setState(loaded);
      setReady(true);
    });
    return () => { live = false; };
  }, [company?.id]);

  useEffect(() => {
    if (ready) saveAnbudState(state).catch(() => setError('Kunne ikke lagre varslingen lokalt.'));
  }, [state, ready]);

  useEffect(() => {
    const orgnr = company?.orgnr;
    if (!orgnr) return undefined;
    let alive = true;
    fetchPublicCompany(orgnr).then((data) => {
      if (!alive || !data?.ok) return;
      const fromRegister = (data.company?.naeringer || []).map((row) => [row.kode, row.beskrivelse].filter(Boolean).join(' · ')).filter(Boolean);
      setCompanyTrades((current) => [...new Set([...fromRegister, ...current, ...(company?.naeringskoder || [])])]);
    }).catch(() => {});
    return () => { alive = false; };
  }, [company?.orgnr]);

  useEffect(() => {
    if (!ready) return undefined;
    const hasCodes = selectedCpv.size > 0 || (state.watch.cpvCodes || []).length > 0;
    if (!hasCodes) return undefined;
    const now = new Date();
    const mark = new Date(now);
    mark.setHours(23, 55, 0, 0);
    if (now < mark) mark.setDate(mark.getDate() - 1);
    const synced = state.syncedAt ? new Date(state.syncedAt).getTime() : 0;
    const hasHits = (state.notices || []).length > 0;
    if (hasHits && synced >= mark.getTime()) return undefined;
    refresh(stateRef.current);
    return undefined;
  }, [ready]);

  useEffect(() => {
    onBids?.(state.bids || []);
  }, [state.bids, onBids]);

  const notices = state.notices || [];

  function inputFromForm() {
    return {
      companyName: company?.name || state.watch.companyName || 'Bedriften',
      orgnr: company?.orgnr || '',
      cpvSource: 'bedrift',
      cpvCodes: [...selectedCpv].map((code) => {
        const known = CPV_CODES.find((row) => row.code === code);
        return { code, label: known?.label || `CPV ${code}` };
      }),
      nationwide,
      areas: [...areas].map((id) => TENDER_AREAS.find((row) => row.id === id)).filter(Boolean),
      channels: [...channels],
      notify,
      emails,
      naeringskoder: trades,
      keywords,
    };
  }

  async function refresh(nextState, manual = false) {
    const draft = saveTenderWatch(nextState, inputFromForm());
    const active = watchQuery(draft.ok ? draft.state.watch : nextState.watch);
    if (!active) {
      setError(draft.error || 'Registrer minst én CPV-kode og trykk Lagre og søk.');
      return;
    }
    setSyncing(true);
    setError('');
    try {
      const watch = draft.ok ? draft.state.watch : nextState.watch;
      const fingerprint = watchFingerprint(watch);
      const sameSearch = nextState.queryKey === fingerprint && (nextState.notices || []).length > 0;
      const publishedFrom = sameSearch ? latestPublished(nextState.notices) : '';
      const known = new Set((nextState.notices || []).map((row) => row.id));
      const data = await fetchWatchHits({
        ...active,
        channels: watch.channels,
        keywords: watch.keywords,
        publishedFrom,
      });
      const base = draft.ok ? { ...nextState, watch } : nextState;
      const merged = mergeTenderNotices(base, data.hits, data.fetchedAt).state;
      const added = merged.notices.filter((row) => !known.has(row.id)).length;
      setState({ ...merged, queryKey: fingerprint });
      if (manual || added) {
        setSavedNote(added
          ? `${added} nye treff lagt til. Tidligere treff og vurderinger er beholdt.`
          : 'Ingen nye treff. Tidligere treff og vurderinger er beholdt.');
      }
      if (!data.hits?.length && data.errors?.length && !known.size) setError(data.errors[0]);
      else if (data.errors?.length) setError(data.errors.join(' '));
    } catch (err) {
      const raw = String(err?.message || '');
      setError(/internal|cors|failed to fetch|ikke funnet/i.test(raw)
        ? 'Søket mot Doffin og TED svarte ikke. Prøv Oppdater på nytt om et øyeblikk.'
        : (raw || 'Kunne ikke hente treff.'));
    } finally {
      setSyncing(false);
    }
  }

  function saveCriteria() {
    const saved = saveTenderWatch(stateRef.current, inputFromForm());
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    setError('');
    setSavedNote('Lagret. Søket bruker kodene fra bedriften.');
    setState(saved.state);
    if (company?.id) {
      updateGroup(company.id, {
        cpvCodes: saved.state.watch.cpvCodes.map((row) => ({ ...row, source: 'bedrift' })),
        cpvSource: 'bedrift',
        tenderWatch: {
          nationwide,
          areas: saved.state.watch.areas,
          channels: saved.state.watch.channels,
          notify,
          emails,
          naeringskoder: trades,
          keywords,
        },
      }).catch(() => {});
    }
    refresh(saved.state);
  }

  function toggle(setter, value) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function mark(id, decision) {
    const current = (stateRef.current.notices || []).find((row) => row.id === id);
    const nextDecision = current?.decision === decision ? 'ubestemt' : decision;
    const result = setNoticeDecision(stateRef.current, id, nextDecision);
    if (!result.ok) setError(result.error);
    else {
      setError('');
      setState(result.state);
      if (nextDecision === 'forkastet' || nextDecision === 'arkiv') setArchiveOn(false);
    }
  }

  async function expressInterest(id) {
    const stored = await loadAnbudState();
    const base = {
      ...stateRef.current,
      supplierProfile: stored.supplierProfile || stateRef.current.supplierProfile,
    };
    if (!base.supplierProfile?.username || !base.supplierProfile?.portalUrl) {
      setError('Registrer innloggingsportalen under Innstillinger før interesse meldes.');
      onOpenSettings?.();
      return;
    }
    setSyncing(true);
    setError('');
    let dossier = null;
    try {
      if (/^\d{4}-\d+$/.test(String(id))) {
        const file = await fetchCompetitionFile(id);
        dossier = file?.dossier || null;
        if (dossier) dossier = await attachPortalCatalog(dossier);
      }
    } catch (err) {
      setError(err?.message || 'Kunne ikke hente konkurransegrunnlaget. Interessen meldes likevel.');
    }
    const result = registerInterest(base, id, dossier);
    if (!result.ok) setError(result.error);
    else {
      const who = result.state.supplierProfile.username;
      const files = dossier?.portalFiles?.length ? ` ${dossier.portalFiles.length} dokumenter er listet.` : '';
      setSavedNote(`Interesse er meldt som ${who}. Grunnlag og filliste ligger i tilbudsarbeidet.${files} Filene åpnes på ${result.state.supplierProfile.portal}.`);
      setState(result.state);
    }
    setSyncing(false);
  }

  const matchWatch = useMemo(() => ({
    cpvCodes: [...selectedCpv].map((code) => ({ code })),
    keywords,
  }), [selectedCpv, keywords]);

  const rows = useMemo(() => {
    const q = fold(queryText.trim());
    const area = TENDER_AREAS.find((row) => row.id === areaId) || null;
    const filtered = notices.filter((row) => {
      if (row.decision === 'tilbud') return false;
      const archived = row.decision === 'arkiv' || row.decision === 'forkastet';
      if (archiveOn !== archived) return false;
      if (!archiveOn && filter === 'nye' && !row.isNew) return false;
      if (!archiveOn && filter === 'aktuelle' && row.decision !== 'aktuell') return false;
      if (sourceFilter !== 'alle' && row.source !== sourceFilter) return false;
      if (area && !noticeInArea(row, area)) return false;
      if (q) {
        const hay = fold(`${row.title} ${row.buyer} ${(row.cpvCodes || []).join(' ')} ${(row.matchedKeywords || []).join(' ')} ${formatMatchLabel(row, matchWatch)}`);
        if (!hay.includes(q)) return false;
      }
      return COLUMNS.every((col) => {
        const needle = fold(colFilter[col.key] || '');
        if (!needle) return true;
        const raw = columnValue(row, col.key, matchWatch);
        const shown = col.kind === 'date' ? `${raw} ${day(raw)}` : raw;
        return fold(shown).includes(needle);
      });
    });
    const { key, dir } = sort;
    const factor = dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const left = String(columnValue(a, key, matchWatch) || '');
      const right = String(columnValue(b, key, matchWatch) || '');
      if (!left && right) return 1;
      if (left && !right) return -1;
      return left.localeCompare(right, 'nb', { numeric: true }) * factor;
    });
  }, [notices, filter, sourceFilter, queryText, archiveOn, areaId, colFilter, sort, matchWatch]);

  const preview = buildTenderAlert({
    companyName: company?.name || state.watch.companyName,
    cpvCodes: state.watch.cpvCodes,
    keywords,
    notices: notices.filter((row) => row.isNew || row.decision === 'ubestemt').slice(0, 12),
  });

  async function sendMail() {
    setMailNote('');
    if (!notify.email || !emails.length) {
      setMailNote('Slå på e-post og legg inn minst én mottaker.');
      return;
    }
    try {
      const data = await sendTenderAlert({
        emails,
        companyName: company?.name || state.watch.companyName,
        cpvCodes: state.watch.cpvCodes,
        keywords,
        notices: notices.filter((row) => row.decision !== 'arkiv' && row.decision !== 'forkastet').slice(0, 20),
      });
      setMailNote(data?.ok ? `Sendt til ${data.sent} mottaker${data.sent === 1 ? '' : 'e'}.` : (data?.error || 'Kunne ikke sende.'));
    } catch (err) {
      setMailNote(err?.message || 'Kunne ikke sende e-posten.');
    }
  }

  const cpvLabels = [...selectedCpv].map((code) => {
    const known = CPV_CODES.find((row) => row.code === code) || CPV_GROUPS.flatMap((group) => [group, ...group.children]).find((row) => row.code === code);
    return known ? `${code} ${known.label}` : code;
  });
  const areaLabel = nationwide
    ? 'Hele Norge'
    : [...areas].map((id) => TENDER_AREAS.find((row) => row.id === id)?.name || id).join(', ') || 'Ingen fylker valgt';

  const summary = (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={styles.summaryHead}>
        <Text style={[styles.h, { color: colors.ink }]}>Oppsummering</Text>
        <TouchableOpacity onPress={() => setShowCriteria(true)} accessibilityRole="button" accessibilityLabel="Innstillinger for søkekriterier">
          <Ionicons name="settings-outline" size={20} color={colors.ink} />
        </TouchableOpacity>
      </View>
      <Text style={{ color: colors.ink, fontWeight: '400' }}>{company?.name || 'Bedriften'}</Text>
      <Text style={{ color: colors.muted }}>{cpvLabels.length} CPV · {keywords.length} søkeord · {companyTrades.length} næringskoder · {areaLabel}</Text>
      <Text style={{ color: colors.muted }}>Listen oppdateres automatisk én gang i døgnet, kl. 23:55. Ekstra søk gjøres med Oppdater nå.</Text>
      <TouchableOpacity onPress={() => setSummaryOpen((value) => !value)} accessibilityRole="button">
        <Text style={{ color: colors.brand, fontWeight: '400' }}>{summaryOpen ? 'Vis mindre' : 'Vis søket'}</Text>
      </TouchableOpacity>
      {summaryOpen ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>CPV som søkes</Text>
          {cpvLabels.length ? cpvLabels.map((row) => <Text key={row} style={{ color: colors.ink }}>{row}</Text>) : <Text style={{ color: colors.muted }}>Ingen CPV valgt.</Text>}
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Søkeord</Text>
          {keywords.length ? keywords.map((row) => <Text key={row} style={{ color: colors.ink }}>{row}</Text>) : <Text style={{ color: colors.muted }}>Ingen søkeord. CPV-treff brukes alene.</Text>}
          <Text style={{ color: colors.ink, fontWeight: '600' }}>Område</Text>
          <Text style={{ color: colors.ink }}>{areaLabel}</Text>
          <Text style={{ color: colors.muted }}>{[...channels].map((id) => (id === 'ted' ? 'TED' : 'Doffin')).join(', ') || 'Ingen kanal'}</Text>
          <Text style={{ color: colors.muted }}>{syncing ? 'Søker …' : `${notices.length} treff i listen`}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.layout, wide && styles.layoutWide]}>
      <View style={styles.main}>
        <View style={styles.titleRow}>
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Text style={[styles.h, { color: colors.ink }]}>Treff</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {state.syncedAt ? `Oppdatert ${formatWhen(state.syncedAt)}. ` : ''}Nye treff legges til. Vurderinger beholdes.
            </Text>
          </View>
          <TouchableOpacity onPress={() => refresh(stateRef.current, true)} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff', fontWeight: '400' }}>{syncing ? 'Søker …' : 'Oppdater nå'}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder="Filtrer på tittel, oppdragsgiver eller CPV"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        />
        <View style={styles.row}>
          {FILTERS.map(([id, label]) => (
            <Chip key={id} label={label} colors={colors} on={!archiveOn && filter === id} onPress={() => { setArchiveOn(false); setFilter(id); }} />
          ))}
          <Chip label="Arkiv" colors={colors} on={archiveOn} onPress={() => setArchiveOn((value) => !value)} />
          <Chip label="Doffin" colors={colors} on={sourceFilter === 'doffin'} onPress={() => setSourceFilter(sourceFilter === 'doffin' ? 'alle' : 'doffin')} />
          <Chip label="TED" colors={colors} on={sourceFilter === 'ted'} onPress={() => setSourceFilter(sourceFilter === 'ted' ? 'alle' : 'ted')} />
          <Chip
            label={areaId ? (TENDER_AREAS.find((row) => row.id === areaId)?.name || 'Område') : 'Område'}
            colors={colors}
            on={!!areaId || areaOpen}
            onPress={() => setAreaOpen((value) => !value)}
          />
        </View>
        {areaOpen ? (
          <View style={styles.row}>
            <Chip label="Alle områder" colors={colors} on={!areaId} onPress={() => setAreaId('')} />
            {TENDER_AREAS.map((area) => (
              <Chip key={area.id} label={area.name} colors={colors} on={areaId === area.id} onPress={() => setAreaId(area.id)} />
            ))}
          </View>
        ) : null}
        {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
        {phone ? (
          <TenderHitCards
            rows={rows}
            columns={COLUMNS}
            colors={colors}
            sort={sort}
            onSort={setSort}
            colFilter={colFilter}
            onColFilter={setColFilter}
            openId={openId}
            onToggle={(id) => setOpenId(openId === id ? '' : id)}
            onMark={mark}
            onInterest={expressInterest}
            matchWatch={matchWatch}
            archiveOn={archiveOn}
            syncing={syncing}
          />
        ) : (
        <ScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={styles.tableScroll}
          contentContainerStyle={styles.tableContent}
        >
        <View style={styles.table}>
          <View style={[styles.tr, { borderColor: colors.line, alignItems: 'stretch' }]}>
            {COLUMNS.map((col) => {
              const active = sort.key === col.key;
              const arrow = active ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : '';
              return (
                <View key={col.key} style={{ width: col.width, flexGrow: 0, flexShrink: 0 }}>
                  <TouchableOpacity
                    onPress={() => setSort((current) => (
                      current.key === col.key
                        ? { key: col.key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
                        : { key: col.key, dir: col.kind === 'date' ? 'desc' : 'asc' }
                    ))}
                    accessibilityRole="button"
                    accessibilityLabel={`Sorter på ${col.label}`}
                  >
                    <Text style={[styles.th, { width: col.width, color: colors.ink }]}>{col.label}{arrow}</Text>
                  </TouchableOpacity>
                  <TextInput
                    value={colFilter[col.key] || ''}
                    onChangeText={(value) => setColFilter((current) => ({ ...current, [col.key]: value }))}
                    placeholder="Filtrer"
                    placeholderTextColor={colors.placeholder}
                    accessibilityLabel={`Filtrer ${col.label}`}
                    style={[styles.filterInput, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card, width: col.width - 8 }]}
                  />
                </View>
              );
            })}
            <Text style={[styles.th, { width: 176, color: colors.ink }]}>Vurdering</Text>
          </View>
          {rows.map((row) => {
            const soon = row.deadline && new Date(row.deadline).getTime() - Date.now() < 14 * 86400000;
            const open = openId === row.id;
            const aktuell = row.decision === 'aktuell';
            const uaktuell = row.decision === 'forkastet' || row.decision === 'arkiv';
            return (
              <View key={row.id} style={{ borderColor: colors.line, borderBottomWidth: 1, backgroundColor: aktuell ? colors.brandSoft : 'transparent' }}>
                <View style={styles.line}>
                  <TouchableOpacity onPress={() => setOpenId(open ? '' : row.id)} accessibilityRole="button" style={styles.line}>
                    <Text style={[styles.td, { width: 120, color: colors.ink }]}>{day(row.publishedAt)}</Text>
                    <Text style={[styles.td, { width: 90, color: colors.ink }]}>{row.source === 'ted' ? 'TED' : 'Doffin'}</Text>
                    <Text style={[styles.td, { width: 110, color: soon ? colors.danger : colors.ink }]}>{day(row.deadline)}</Text>
                    <Text style={[styles.td, { width: 340, color: colors.ink }]}>{row.title}</Text>
                    <Text style={[styles.td, { width: 170, color: colors.ink }]}>{row.buyer || '—'}</Text>
                    <Text style={[styles.td, { width: 150, color: colors.muted }]}>{(row.places || []).join(', ') || '—'}</Text>
                    <Text style={[styles.td, { width: 160, color: colors.ink }]}>{formatMatchLabel(row, matchWatch)}</Text>
                  </TouchableOpacity>
                  <View style={styles.decision}>
                    <TouchableOpacity
                      onPress={() => mark(row.id, 'aktuell')}
                      accessibilityRole="button"
                      accessibilityLabel={`Merk ${row.title} som aktuell`}
                      style={[styles.mini, { backgroundColor: aktuell ? colors.brand : colors.sunken, borderColor: aktuell ? colors.brand : colors.line }]}
                    >
                      <Text style={{ color: aktuell ? '#fff' : colors.ink, fontSize: 12 }}>Aktuell</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => mark(row.id, 'forkastet')}
                      accessibilityRole="button"
                      accessibilityLabel={`Merk ${row.title} som uaktuell`}
                      style={[styles.mini, { backgroundColor: uaktuell ? colors.danger : colors.sunken, borderColor: uaktuell ? colors.danger : colors.line }]}
                    >
                      <Text style={{ color: uaktuell ? '#fff' : colors.ink, fontSize: 12 }}>Uaktuell</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {open ? (
                  <View style={{ padding: 8, gap: 8 }}>
                    <Text style={{ color: colors.ink }}>{row.description || row.noticeType || 'Ingen utdrag.'}</Text>
                    <TouchableOpacity onPress={() => row.url && Linking.openURL(row.url)} accessibilityRole="link">
                      <Text style={{ color: colors.brand }}>Åpne kunngjøringen</Text>
                    </TouchableOpacity>
                    {aktuell ? (
                      <TouchableOpacity onPress={() => expressInterest(row.id)} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
                        <Text style={{ color: '#fff' }}>Meld interesse</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
          {!rows.length ? <Text style={{ color: colors.muted, padding: 8 }}>{archiveOn ? 'Arkivet er tomt.' : (syncing ? 'Henter treff …' : 'Ingen treff i listen. Oppdater for å søke.')}</Text> : null}
        </View>
        </ScrollView>
        )}
      </View>
      <View style={[styles.side, wide && styles.sideWide]}>
        {summary}
        {!!savedNote && <Text style={{ color: colors.brand }}>{savedNote}</Text>}
        {showCriteria ? (
          <TouchableOpacity onPress={() => setShowCriteria(false)} accessibilityRole="button">
            <Text style={{ color: colors.muted }}>Lukk innstillinger</Text>
          </TouchableOpacity>
        ) : null}
        {showCriteria ? <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Kriterier</Text>
          <Text style={{ color: colors.muted }}>Utgangspunktet er CPV-kodene som er registrert på bedriften. Her kan du legge til flere.</Text>
          <TextInput value={cpvQuery} onChangeText={setCpvQuery} placeholder="Søk i CPV" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
          {CPV_GROUPS.map((group) => {
            const q = cpvQuery.trim().toLowerCase();
            const children = group.children.filter((row) => !q || `${row.code} ${row.label}`.toLowerCase().includes(q));
            const opened = openGroups.has(group.code) || !!q;
            return (
            <View key={group.code} style={{ gap: 6 }}>
              <Chip label={`${group.code.slice(0, 4)} ${group.label}`} colors={colors} on={selectedCpv.has(group.code)} onPress={() => toggle(setSelectedCpv, group.code)} />
              <TouchableOpacity onPress={() => setOpenGroups((current) => {
                const next = new Set(current);
                if (next.has(group.code)) next.delete(group.code);
                else next.add(group.code);
                return next;
              })} accessibilityRole="button">
                <Text style={{ color: colors.brand, fontWeight: '400' }}>{opened ? 'Skjul undernivå' : `Vis ${children.length} undernivå`}</Text>
              </TouchableOpacity>
              {opened ? (
                <View style={styles.row}>
                  {children.map((row) => (
                    <Chip key={row.code} colors={colors} on={selectedCpv.has(row.code)} label={`${row.code.slice(0, 4)} ${row.label}`} onPress={() => toggle(setSelectedCpv, row.code)} />
                  ))}
                </View>
              ) : null}
            </View>
            );
          })}
          <TextInput value={customCpv} onChangeText={setCustomCpv} placeholder="Egen CPV, 8 siffer" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
          <Chip label="Legg til CPV" colors={colors} on={false} onPress={() => {
            const code = normalizeCpvCode(customCpv);
            if (!code) return;
            setSelectedCpv((current) => new Set(current).add(code));
            setCustomCpv('');
          }} />
          <Text style={[styles.h, { color: colors.ink }]}>Søkeord</Text>
          <Text style={{ color: colors.muted }}>Ord som skal treffe i tittel, beskrivelse eller oppdragsgiver, i tillegg til CPV-treff.</Text>
          <View style={styles.row}>
            {keywords.map((row) => (
              <Chip key={row} label={`${row} ×`} hint={`Fjern søkeord ${row}`} colors={colors} on onPress={() => setKeywords((current) => current.filter((item) => item !== row))} />
            ))}
          </View>
          <TextInput
            value={keywordDraft}
            onChangeText={setKeywordDraft}
            placeholder="F.eks. sykehus, adgangskontroll"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
            onSubmitEditing={() => {
              const next = normalizeKeywords([...keywords, ...keywordDraft.split(/[,;\n]/)]);
              setKeywords(next);
              setKeywordDraft('');
            }}
          />
          <Chip label="Legg til søkeord" colors={colors} on={false} onPress={() => {
            const next = normalizeKeywords([...keywords, ...keywordDraft.split(/[,;\n]/)]);
            if (next.length === keywords.length) return;
            setKeywords(next);
            setKeywordDraft('');
          }} />
          <Text style={{ color: colors.muted }}>Næringskoder</Text>
          {trades.map((row) => <Text key={row} style={{ color: colors.ink }}>{row}</Text>)}
          <TextInput value={tradeDraft} onChangeText={setTradeDraft} placeholder="Kode eller beskrivelse" placeholderTextColor={colors.placeholder} style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
          <Chip label="Legg til næringskode" colors={colors} on={false} onPress={() => {
            const value = tradeDraft.trim();
            if (!value) return;
            setTrades((current) => current.includes(value) ? current : [...current, value]);
            setTradeDraft('');
          }} />
          <Text style={[styles.h, { color: colors.ink }]}>Område</Text>
          <View style={styles.row}>
            <Chip label="Hele Norge" colors={colors} on={nationwide} onPress={() => setNationwide((value) => !value)} />
            {!nationwide && TENDER_AREAS.map((area) => (
              <Chip key={area.id} colors={colors} on={areas.has(area.id)} label={area.name} onPress={() => toggle(setAreas, area.id)} />
            ))}
          </View>
          <Text style={[styles.h, { color: colors.ink }]}>Kanaler</Text>
          <View style={styles.row}>
            <Chip label="Doffin" colors={colors} on={channels.has('doffin')} onPress={() => toggle(setChannels, 'doffin')} />
            <Chip label="TED" colors={colors} on={channels.has('ted')} onPress={() => toggle(setChannels, 'ted')} />
          </View>
          <Text style={{ color: colors.muted }}>Mercell har ikke et åpent søke-API. Treff derfra kommer ikke inn automatisk.</Text>
          <Text style={[styles.h, { color: colors.ink }]}>Varsling</Text>
          <View style={styles.row}>
            <Chip label="Push" colors={colors} on={notify.push} onPress={() => setNotify((n) => ({ ...n, push: !n.push }))} />
            <Chip label="Varsel" colors={colors} on={notify.varsel} onPress={() => setNotify((n) => ({ ...n, varsel: !n.varsel }))} />
            <Chip label="E-post" colors={colors} on={notify.email} onPress={() => setNotify((n) => ({ ...n, email: !n.email }))} />
          </View>
          {emails.map((row) => <Text key={row} style={{ color: colors.ink }}>{row}</Text>)}
          <TextInput value={emailDraft} onChangeText={setEmailDraft} placeholder="Mottaker, f.eks. nye_prosjekt@firma.no" placeholderTextColor={colors.placeholder} autoCapitalize="none" keyboardType="email-address" style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]} />
          <Chip label="Legg til e-post" colors={colors} on={false} onPress={() => {
            const value = emailDraft.trim().toLowerCase();
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return;
            setEmails((current) => current.includes(value) ? current : [...current, value]);
            setEmailDraft('');
          }} />
          <TouchableOpacity onPress={saveCriteria} style={[styles.save, { backgroundColor: colors.brand }]} accessibilityRole="button">
            <Text style={{ color: '#fff', fontWeight: '400' }}>{syncing ? 'Søker …' : 'Lagre og søk'}</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.muted }}>E-posten følger samme oppsett som Mercell: treff, frist, oppdragsgiver og hvilken CPV som traff.</Text>
          <Text style={{ color: colors.muted }} numberOfLines={4}>{preview.text}</Text>
          <TouchableOpacity onPress={sendMail} accessibilityRole="button">
            <Text style={{ color: colors.brand, fontWeight: '400' }}>Send varsel nå</Text>
          </TouchableOpacity>
          {!!mailNote && <Text style={{ color: colors.muted }}>{mailNote}</Text>}
        </View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { gap: 16, width: '100%', alignSelf: 'stretch' },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  main: { flex: 1, gap: 8, minWidth: 0 },
  side: { gap: 10, width: '100%' },
  sideWide: { width: 320, flexShrink: 0, marginLeft: 24 },
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tableScroll: {
    width: '100%',
    maxWidth: '100%',
    ...(Platform.OS === 'web' ? { overflowX: 'auto', overflowY: 'hidden' } : null),
  },
  tableContent: { flexGrow: 1 },
  table: { width: 1320, minWidth: 1320 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  h: { fontSize: 16, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, alignItems: 'flex-start' },
  line: { flexDirection: 'row', alignItems: 'flex-start' },
  th: { fontSize: 12, fontWeight: '600', padding: 8 },
  td: { flexGrow: 0, flexShrink: 0, fontSize: 13, fontWeight: '400', padding: 8 },
  filterInput: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 4, fontSize: 13, marginHorizontal: 4, marginBottom: 6 },
  decision: { width: 176, flexGrow: 0, flexShrink: 0, flexDirection: 'row', gap: 4, padding: 6, alignItems: 'center' },
  mini: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 6 },
});
