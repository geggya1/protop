import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CPV_CODES, TENDER_AREAS } from '../../src/anbud/catalog';
import { attachPortalCatalog, fetchCompetitionFile, fetchWatchHits, storeReachableFiles } from '../../src/anbud/doffinClient';
import { fetchPublicCompany } from '../../src/project/companyPublic';
import {
    alignDepartmentAreas, attachDossier, createBidWork, emptyAnbudState, formatWhen, latestPublished, mergeTenderNotices, nextNoticeDecision, normalizeCpvCode, normalizeDepartmentAreas, noticeDeadlineExpired, noticeInArea, noticeInCoverage, releaseUntouchedBid, sameMarkGesture, saveTenderWatch, searchCoverage, seedDossier, setNoticeDecision, toggleConsideration, watchFingerprint, watchQuery,
} from '../../src/anbud/model';
import { mergeAiFit, scoreNoticeFit, watchSearchTerms } from '../../src/anbud/matchFit';
import { geocodeMissing, geocodeQuery } from '../../src/anbud/geocodePlace';
import { locateNotice, mapFollowsList, mapPinsForNotices } from '../../src/anbud/noticePlace';
import { rankTenderHits } from '../../src/anbud/watchAi';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { SIDE_WIDTH_KEY, clampSideWidth, mapHeightForSide, sideWidthFromDrag } from '../../src/anbud/sideWidth';
import { departmentsOf } from '../../src/project/companyUnits';
import { BREAKPOINTS } from '../../src/theme';
import TenderHitCards from './TenderHitCards';
import TenderMap from './TenderMap';
import BidDecision from './BidDecision';
import RegionCoverage from './RegionCoverage';
import FilterMenu from '../../components/FilterMenu';
import {
  deadlineInfo,
  formatNoticeText,
  noticeIsCurrent,
  noticeIsRejected,
  nextRowAfterRemoval,
  noticeListFilter,
  noticeMatchesListFilter,
  noticeNeedsReview,
  officialNoticeUrl,
  sourceLabel,
} from '../../src/anbud/noticeText';

const FILTERS = [
  ['nye', 'Nye', 'emphasis'],
  ['aktuelle', 'Aktuelle', 'emphasis'],
  ['uaktuelle', 'Uaktuelle', 'plain'],
  ['alle', 'Alle', 'plain'],
  ['utlopt', 'Frist utløpt', 'plain'],
];

const COLUMNS = [
  { key: 'publishedAt', label: 'Publisert', width: 120, kind: 'date' },
  { key: 'source', label: 'Type', width: 90, kind: 'text' },
  { key: 'deadline', label: 'Frist', width: 110, kind: 'date' },
  { key: 'title', label: 'Konkurranse', width: 420, kind: 'text' },
  { key: 'buyer', label: 'Oppdragsgiver', width: 180, kind: 'text' },
  { key: 'place', label: 'Sted', width: 150, kind: 'text' },
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

function Chip({ label, on, onPress, colors, hint, count, emphasis }) {
  const hasCount = count != null && count !== '';
  const n = Number(count) || 0;
  const countText = hasCount ? ` (${String(n).padStart(2, '0')})` : '';
  if (emphasis) {
    return (
      <TouchableOpacity
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={hint || `${label}, ${n}`}
        style={[styles.chip, styles.chipEmphasis, { backgroundColor: on ? colors.brand : colors.sunken }]}
      >
        <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13, fontWeight: '600' }}>{label}</Text>
        <View style={[styles.badge, { backgroundColor: on ? 'rgba(255,255,255,0.28)' : '#64748b' }]} accessibilityElementsHidden>
          <Text style={styles.badgeTxt}>{n > 99 ? '99+' : String(n)}</Text>
        </View>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint || `${label}${countText}`}
      style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}
    >
      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13, fontWeight: '400' }}>
        {label}{countText}
      </Text>
    </TouchableOpacity>
  );
}

function NoticeBody({ row, colors }) {
  const raw = row.dossier?.description || row.description || row.noticeType || '';
  const body = formatNoticeText(raw) || 'Ingen utdrag.';
  const url = officialNoticeUrl(row);
  const label = sourceLabel(row);
  const deadline = deadlineInfo(row.deadline || row.dossier?.submissionDeadline);
  const toneColor = deadline.tone === 'danger'
    ? colors.danger
    : deadline.tone === 'warn'
      ? (colors.warn || colors.danger)
      : colors.ink;
  return (
    <View style={{ gap: 8 }}>
      <View style={[styles.deadlineBox, {
        borderColor: toneColor,
        backgroundColor: deadline.tone === 'danger' || deadline.tone === 'warn' ? colors.brandSoft : colors.sunken,
      }]}
      >
        <Text style={{ color: toneColor, fontSize: 18, fontWeight: '700' }}>{deadline.headline}</Text>
        <Text style={{ color: colors.ink }}>{deadline.detail}</Text>
      </View>
      <Text style={{ color: colors.ink, lineHeight: 22 }}>{body}</Text>
      {url ? (
        <TouchableOpacity onPress={() => Linking.openURL(url)} accessibilityRole="link">
          <Text style={{ color: colors.brand }}>Åpne på {label}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={{ color: colors.muted }}>Offisiell kunngjøring mangler lenke.</Text>
      )}
    </View>
  );
}

export default function TenderAlert({ company, colors, onBids, onOpenSettings, onOpenBid, units = [] }) {
  const { width } = useWindowDimensions();
  const [cssPhone, setCssPhone] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const query = window.matchMedia(`(max-width: ${BREAKPOINTS.tablet - 1}px)`);
    const sync = () => setCssPhone(query.matches);
    sync();
    query.addEventListener?.('change', sync);
    return () => query.removeEventListener?.('change', sync);
  }, []);
  // Telefon: smalt vindu. Nettbrett og web (fra 768 px) beholder tabellen.
  const phone = cssPhone || width < BREAKPOINTS.tablet;
  const [state, setState] = useState(emptyAnbudState());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState('nye');
  const [sourceFilter, setSourceFilter] = useState('alle');
  const [queryText, setQueryText] = useState('');
  const [keywords, setKeywords] = useState([]);
  const [selectedCpv, setSelectedCpv] = useState(() => new Set());
  const [trades, setTrades] = useState([]);
  const [nationwide, setNationwide] = useState(true);
  const [areas, setAreas] = useState(() => new Set());
  const [departmentAreas, setDepartmentAreas] = useState([]);
  const [departmentId, setDepartmentId] = useState('');
  const [sideWidth, setSideWidth] = useState(360);
  const sideWidthRef = useRef(360);
  const [channels, setChannels] = useState(() => new Set(['doffin', 'ted']));
  const [notify, setNotify] = useState({ push: true, varsel: true, email: false });
  const [emails, setEmails] = useState([]);
  const [savedNote, setSavedNote] = useState('');
  const [sourceOpen, setSourceOpen] = useState(false);
  const [areaId, setAreaId] = useState('');
  const [sort, setSort] = useState({ key: 'publishedAt', dir: 'desc' });
  const [colFilter, setColFilter] = useState({});
  const [openId, setOpenId] = useState('');
  const [mapFocusId, setMapFocusId] = useState('');
  const [mapFollow, setMapFollow] = useState({ id: '', at: 0 });
  const [mapNote, setMapNote] = useState('');
  const [pullingId, setPullingId] = useState('');
  const [ranking, setRanking] = useState(false);
  const [companyTrades, setCompanyTrades] = useState(company?.naeringskoder || []);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastMark = useRef({ key: '', at: 0 });

  const loadGen = useRef(0);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof localStorage === 'undefined') return;
    const raw = localStorage.getItem(SIDE_WIDTH_KEY);
    if (!raw) return;
    const next = clampSideWidth(Number(raw));
    sideWidthRef.current = next;
    setSideWidth(next);
  }, []);

  function rememberSideWidth(next) {
    sideWidthRef.current = next;
    setSideWidth(next);
  }

  function startSideResize(event) {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    event.preventDefault?.();
    const startX = event.clientX ?? event.nativeEvent?.clientX;
    const startW = sideWidthRef.current;
    const max = Math.min(840, Math.max(320, window.innerWidth - 520));
    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function move(e) {
      rememberSideWidth(sideWidthFromDrag(startW, startX, e.clientX, { min: 280, max }));
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
      try { localStorage.setItem(SIDE_WIDTH_KEY, String(sideWidthRef.current)); } catch { /* lagring er valgfri */ }
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  useEffect(() => {
    let live = true;
    const gen = ++loadGen.current;
    setReady(false);
    loadAnbudState(company?.id).then((loaded) => {
      if (!live || gen !== loadGen.current) return;
      const watch = loaded.watch || {};
      const codes = [...(company?.cpvCodes || []), ...(watch.cpvCodes || [])];
      setSelectedCpv(new Set(codes.map((row) => normalizeCpvCode(typeof row === 'string' ? row : row?.code)).filter(Boolean)));
      setTrades([...(company?.naeringskoder || []), ...(watch.naeringskoder || [])].filter((row, index, list) => list.indexOf(row) === index));
      setNationwide(watch.savedAt ? !!watch.nationwide : true);
      setAreas(new Set((watch.areas || []).map((row) => row.id)));
      setDepartmentAreas(normalizeDepartmentAreas(watch.departmentAreas));
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
    if (ready) saveAnbudState(state, company?.id).catch(() => setError('Kunne ikke lagre varslingen.'));
  }, [state, ready, company?.id]);

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
    const hasSignal = selectedCpv.size > 0
      || (state.watch.cpvCodes || []).length > 0
      || keywords.length > 0
      || (state.watch?.profile?.keywords || []).length > 0;
    if (!hasSignal) return undefined;
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
      departmentAreas,
      channels: [...channels],
      notify,
      emails,
      naeringskoder: trades,
      keywords,
      profile: state.watch?.profile,
    };
  }

  async function applyAiRank(watch, notices, { silent } = {}) {
    const profile = watch?.profile || {};
    const terms = watchSearchTerms(watch);
    if (!profile.description && !profile.summary && !profile.website && !terms.length) {
      if (!silent) setError('Beskriv bedriften, legg inn hjemmeside eller søkeord under Innstillinger, så kan AI merke de beste treffene.');
      return;
    }
    const open = (notices || []).filter((row) => (
      row.decision !== 'tilbud' && !noticeIsRejected(row) && !noticeDeadlineExpired(row)
    ));
    const candidates = (silent ? open.filter((row) => !row.aiFit?.score) : open).slice(0, 20);
    if (!candidates.length) {
      if (!silent) setSavedNote('Ingen åpne treff å vurdere med AI.');
      return;
    }
    setRanking(true);
    try {
      const data = await rankTenderHits({
        companyName: watch.companyName || company?.name,
        description: profile.description,
        summary: profile.summary,
        keywords: terms,
        notices: candidates,
      });
      const next = mergeAiFit(stateRef.current.notices, data.hits || []);
      commitState({ ...stateRef.current, notices: next });
      const marked = (data.hits || []).filter((row) => Number(row.score) >= 8).length;
      if (!silent || marked) {
        setSavedNote(marked
          ? `AI har fremhevet ${marked} treff dere bør se nærmere på.`
          : 'AI har vurdert treffene. Ingen ble merket som særskilt gode.');
      }
    } catch (err) {
      if (!silent) setError(err?.message || 'Kunne ikke vurdere treffene med AI.');
    } finally {
      setRanking(false);
    }
  }

  async function refresh(nextState, manual = false) {
    const draft = saveTenderWatch(nextState, inputFromForm());
    const watchForQuery = draft.ok ? draft.state.watch : nextState.watch;
    const active = watchQuery(watchForQuery);
    if (!active) {
      const profile = watchForQuery?.profile || {};
      setError((profile.description || profile.summary || profile.website)
        ? 'Profilen har ingen søkeord ennå. La AI tolke bedriften under Innstillinger, og trykk Oppdater nå.'
        : (draft.error || 'Legg inn CPV, søkeord eller en bedriftsbeskrivelse under Innstillinger, og trykk Oppdater nå.'));
      return;
    }
    setSyncing(true);
    setError('');
    const gen = loadGen.current;
    try {
      const watch = draft.ok ? draft.state.watch : nextState.watch;
      const fingerprint = watchFingerprint(watch);
      const sameSearch = nextState.queryKey === fingerprint && (nextState.notices || []).length > 0;
      const publishedFrom = sameSearch ? latestPublished(nextState.notices) : '';
      const known = new Set((nextState.notices || []).map((row) => row.id));
      const data = await fetchWatchHits({
        ...active,
        channels: watch.channels,
        publishedFrom,
      });
      if (gen !== loadGen.current) return;
      const latest = stateRef.current;
      const base = draft.ok ? { ...latest, watch } : latest;
      const merged = mergeTenderNotices(base, data.hits, data.fetchedAt).state;
      const added = merged.notices.filter((row) => !known.has(row.id)).length;
      commitState({ ...merged, queryKey: fingerprint });
      if (manual || added) {
        setSavedNote(added
          ? `${added} nye treff lagt til. Tidligere treff og vurderinger er beholdt.`
          : 'Ingen nye treff. Tidligere treff og vurderinger er beholdt.');
      }
      if (!data.hits?.length && data.errors?.length && !known.size) setError(data.errors[0]);
      else if (data.errors?.length) setError(data.errors.join(' '));
      applyAiRank(watch, merged.notices, { silent: true }).catch(() => {});
    } catch (err) {
      const raw = String(err?.message || '');
      setError(/internal|cors|failed to fetch|ikke funnet/i.test(raw)
        ? 'Søket mot Doffin og TED svarte ikke. Prøv Oppdater på nytt om et øyeblikk.'
        : (raw || 'Kunne ikke hente treff.'));
    } finally {
      setSyncing(false);
    }
  }

  function commitState(next) {
    stateRef.current = next;
    setState(next);
  }

  function scrollNoticeIntoView(id) {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const selector = `[data-notice-id="${String(id).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
    requestAnimationFrame(() => {
      document.querySelector(selector)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }

  function revealMarked(id, decision) {
    if (decision === 'aktuell' || decision === 'tilbud') setFilter('aktuelle');
    else if (decision === 'forkastet' || decision === 'arkiv' || decision === 'ikke') setFilter('uaktuelle');
    setOpenId(id);
    setMapFocusId(id);
    scrollNoticeIntoView(id);
  }

  function highlightFromMap(id, options = {}) {
    const row = (stateRef.current.notices || []).find((item) => item.id === id);
    if (!row) return;
    setMapFocusId(id);
    const followList = options.followList !== false;
    if (followList) {
      if (sourceFilter !== 'alle' && row.source !== sourceFilter) setSourceFilter('alle');
      const area = TENDER_AREAS.find((item) => item.id === areaId) || null;
      if (area && !noticeInArea(row, area)) setAreaId('');
      if (!noticeMatchesListFilter(row, filter)) {
        const next = noticeListFilter(row);
        if (next) setFilter(next);
      }
    }
    if (options.scroll === false) setMapNote('');
    else scrollNoticeIntoView(id);
  }

  function continueAfterChoice(notice, nextDecision) {
    if (!notice || noticeMatchesListFilter({ ...notice, decision: nextDecision }, filter)) return;
    if (!noticeMatchesListFilter(notice, filter)) return;
    const nextId = nextRowAfterRemoval(rows, notice.id);
    if (openId === notice.id) setOpenId('');
    setMapFocusId(nextId);
    setMapFollow({ id: nextId, at: Date.now() });
    if (nextId && !phone) scrollNoticeIntoView(nextId);
  }

  function markOnMap(id, decision) {
    mark(id, decision, { toggle: false, reveal: false });
    if (!phone) return;
    setMapNote(decision === 'forkastet'
      ? 'Uaktuell er tatt ut av listen.'
      : 'Merket aktuell og tatt ut av nye treff.');
  }

  function mark(id, decision, options = {}) {
    const toggle = options.toggle !== false;
    const reveal = options.reveal === true;
    const key = `${id}\0${decision}\0${toggle ? 't' : 's'}`;
    const now = Date.now();
    if (sameMarkGesture(lastMark.current, key, now)) {
      if (reveal) revealMarked(id, decision);
      return;
    }
    lastMark.current = { key, at: now };
    const current = (stateRef.current.notices || []).find((row) => row.id === id);
    const nextDecision = nextNoticeDecision(current?.decision, decision, { toggle });
    if (!current || current.decision === nextDecision) {
      if (reveal) revealMarked(id, nextDecision || decision);
      return;
    }
    const decided = setNoticeDecision(stateRef.current, id, nextDecision);
    if (!decided.ok) {
      setError(decided.error);
      return;
    }
    const released = nextDecision === 'aktuell'
      ? decided
      : releaseUntouchedBid(decided.state, id);
    setError('');
    commitState(released.state);
    if (reveal) revealMarked(id, nextDecision);
    else continueAfterChoice(current, nextDecision);
    if (nextDecision === 'aktuell') pullCurrent(id, current);
  }

  async function pullCurrent(id, notice) {
    setPullingId(id);
    setSavedNote('');
    let dossier = notice?.dossier || null;
    try {
      if (/^\d{4}-\d+$/.test(String(id))) {
        const file = await fetchCompetitionFile(id);
        dossier = file?.dossier || dossier;
        if (dossier) dossier = await attachPortalCatalog(dossier);
        if (dossier) dossier = await storeReachableFiles(dossier);
      }
    } catch (err) {
      setError(err?.message || 'Kunne ikke hente hele grunnlaget. Teksten i treffet er tatt med.');
    }
    const still = (stateRef.current.notices || []).find((row) => row.id === id);
    if (!still || (still.decision !== 'aktuell' && still.decision !== 'tilbud')) {
      setPullingId('');
      return;
    }
    const adopted = attachDossier(stateRef.current, id, dossier || seedDossier(still));
    if (!adopted.ok) setError(adopted.error);
    else {
      commitState(adopted.state);
      const stored = adopted.state.notices.find((row) => row.id === id)?.dossier || dossier;
      const files = (stored?.portalFiles?.length || 0) + (stored?.documents?.length || 0);
      const answers = stored?.qa?.length || 0;
      setSavedNote(`${still.title || 'Konkurransen'} er merket aktuell. ${files ? `${files} dokumenter` : 'Ingen vedlegg'} og ${answers ? `${answers} spørsmål og svar` : 'ingen spørsmål og svar'} er hentet inn. Neste steg er å gi tilbud eller la det være.`);
    }
    setPullingId('');
  }

  async function giveBid(id) {
    setPullingId(id);
    setError('');
    let base = stateRef.current;
    const notice = (base.notices || []).find((row) => row.id === id);
    let dossier = notice?.dossier || null;
    try {
      if (/^\d{4}-\d+$/.test(String(id))) {
        const file = await fetchCompetitionFile(id);
        dossier = file?.dossier || dossier;
        if (dossier) dossier = await attachPortalCatalog(dossier);
        if (dossier) dossier = await storeReachableFiles(dossier);
      }
    } catch (err) {
      setError(err?.message || 'Kunne ikke hente hele grunnlaget. Teksten som finnes, blir med.');
    }
    if (!dossier && notice) dossier = seedDossier(notice);
    if (dossier) {
      const attached = attachDossier(base, id, dossier);
      if (attached.ok) base = attached.state;
    }
    const made = createBidWork(base, id);
    if (!made.ok) {
      setError(made.error);
      setPullingId('');
      return;
    }
    await saveAnbudState(made.state, company?.id);
    commitState(made.state);
    const bid = made.state.bids.find((row) => row.noticeId === id);
    setPullingId('');
    if (bid) onOpenBid?.(bid.id);
  }

  function declineBid(id) {
    const decided = setNoticeDecision(stateRef.current, id, 'ikke');
    if (!decided.ok) {
      setError(decided.error);
      return;
    }
    const released = releaseUntouchedBid(decided.state, id);
    setError('');
    commitState(released.state);
    setSavedNote('Konkurransen er satt til ikke gi tilbud.');
  }

  function weigh(id, itemId) {
    const result = toggleConsideration(stateRef.current, id, itemId);
    if (!result.ok) setError(result.error);
    else {
      setError('');
      commitState(result.state);
    }
  }

  const departmentList = useMemo(
    () => departmentsOf(units).map((row) => ({ id: row.id, name: row.name })),
    [units],
  );
  const alignedDepartments = useMemo(
    () => alignDepartmentAreas(departmentAreas, departmentList),
    [departmentAreas, departmentList],
  );
  const coverageWatch = useMemo(() => ({
    nationwide,
    areas: [...areas].map((id) => TENDER_AREAS.find((row) => row.id === id)).filter(Boolean),
    departmentAreas: alignedDepartments,
  }), [nationwide, areas, alignedDepartments]);
  const viewCoverage = useMemo(
    () => searchCoverage(coverageWatch, departmentId),
    [coverageWatch, departmentId],
  );
  const scopedNotices = useMemo(
    () => notices.filter((row) => noticeInCoverage(row, viewCoverage)),
    [notices, viewCoverage],
  );

  function areaObjects(ids) {
    return [...ids].map((id) => TENDER_AREAS.find((row) => row.id === id)).filter(Boolean);
  }

  function commitCoverage({ nextNationwide, nextAreaIds, nextDepartments }) {
    if (!ready) return;
    const nation = nextNationwide ?? nationwide;
    const areaIds = nextAreaIds ?? [...areas];
    const rows = nextDepartments ?? departmentAreas;
    setNationwide(nation);
    setAreas(new Set(areaIds));
    setDepartmentAreas(rows);
    const saved = saveTenderWatch(stateRef.current, {
      ...inputFromForm(),
      nationwide: nation,
      areas: areaObjects(areaIds),
      departmentAreas: rows,
    });
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    setError('');
    commitState(saved.state);
  }

  const matchWatch = useMemo(() => ({
    cpvCodes: [...selectedCpv].map((code) => ({ code })),
    keywords,
    profile: state.watch?.profile,
  }), [selectedCpv, keywords, state.watch?.profile]);

  const filterCounts = useMemo(() => {
    const counts = { nye: 0, aktuelle: 0, uaktuelle: 0, alle: 0, utlopt: 0 };
    for (const row of scopedNotices) {
      if (row.decision === 'tilbud') continue;
      const expired = noticeDeadlineExpired(row);
      const rejected = noticeIsRejected(row);
      if (rejected) {
        counts.uaktuelle += 1;
        continue;
      }
      if (expired && noticeNeedsReview(row)) {
        counts.utlopt += 1;
        continue;
      }
      counts.alle += 1;
      if (noticeIsCurrent(row)) counts.aktuelle += 1;
      else if (noticeNeedsReview(row)) counts.nye += 1;
    }
    return counts;
  }, [scopedNotices]);

  const rows = useMemo(() => {
    const q = fold(queryText.trim());
    const area = TENDER_AREAS.find((row) => row.id === areaId) || null;
    const filtered = scopedNotices.filter((row) => {
      if (row.decision === 'tilbud') return false;
      const expired = noticeDeadlineExpired(row);
      const rejected = noticeIsRejected(row);
      if (filter === 'utlopt') {
        if (!(expired && noticeNeedsReview(row))) return false;
      } else if (filter === 'uaktuelle') {
        if (!rejected) return false;
      } else if (filter === 'nye') {
        if (rejected || expired || !noticeNeedsReview(row)) return false;
      } else if (filter === 'aktuelle') {
        if (!noticeIsCurrent(row) || rejected) return false;
      } else if (filter === 'alle') {
        if (rejected || (expired && noticeNeedsReview(row))) return false;
      }
      if (sourceFilter !== 'alle' && row.source !== sourceFilter) return false;
      if (area && !noticeInArea(row, area)) return false;
      if (q) {
        const hay = fold(`${row.title} ${row.buyer} ${(row.cpvCodes || []).join(' ')} ${(row.matchedKeywords || []).join(' ')}`);
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
      const aFit = scoreNoticeFit(a, matchWatch);
      const bFit = scoreNoticeFit(b, matchWatch);
      if (aFit.strong !== bFit.strong) return aFit.strong ? -1 : 1;
      if (aFit.score !== bFit.score) return bFit.score - aFit.score;
      const left = String(columnValue(a, key, matchWatch) || '');
      const right = String(columnValue(b, key, matchWatch) || '');
      if (!left && right) return 1;
      if (left && !right) return -1;
      return left.localeCompare(right, 'nb', { numeric: true }) * factor;
    });
  }, [scopedNotices, filter, sourceFilter, queryText, areaId, colFilter, sort, matchWatch]);

  const mapRows = useMemo(
    () => (mapFollowsList(filter) ? rows : []),
    [filter, rows],
  );
  const pins = useMemo(
    () => mapPinsForNotices(mapRows, { asShown: true }),
    [mapRows],
  );
  const missingPlaces = mapRows.filter((row) => !locateNotice(row)).length;
  const missingKey = mapRows.filter((row) => !locateNotice(row)).map((row) => row.id).join(',');

  useEffect(() => {
    if (!ready || !missingKey) return undefined;
    let live = true;
    const unknown = mapRows.filter((row) => !locateNotice(row));
    geocodeMissing(unknown, locateNotice, geocodeQuery).then((hits) => {
      if (!live || !hits.length) return;
      const byId = new Map(hits.map((row) => [row.id, row.geo]));
      const next = (stateRef.current.notices || []).map((row) => (
        byId.has(row.id) ? { ...row, geo: byId.get(row.id) } : row
      ));
      commitState({ ...stateRef.current, notices: next });
    }).catch(() => {});
    return () => { live = false; };
  }, [ready, missingKey]);

  function focusNotice(id) {
    const row = (stateRef.current.notices || []).find((item) => item.id === id);
    if (!row) return;
    setFilter(row.decision === 'aktuell' ? 'aktuelle' : 'nye');
    setOpenId(id);
    setMapFocusId(id);
    scrollNoticeIntoView(id);
  }

  const listEmpty = filter === 'utlopt'
    ? 'Ingen konkurranser med utløpt frist.'
    : filter === 'nye'
      ? 'Ingen ubehandlede treff. Oppdater for å søke, eller se Aktuelle.'
      : filter === 'uaktuelle'
        ? 'Ingen uaktuelle konkurranser.'
        : filter === 'aktuelle'
          ? 'Ingen er merket aktuelle ennå.'
          : (syncing ? 'Henter treff …' : 'Ingen treff i listen. Oppdater for å søke.');

  const cpvCount = selectedCpv.size;
  const searchTermCount = watchSearchTerms({ keywords, profile: state.watch?.profile }).length;
  const areaLabel = viewCoverage.nationwide
    ? (viewCoverage.label ? `${viewCoverage.label} · hele Norge` : 'Hele Norge')
    : (viewCoverage.areas.map((row) => row.name).join(', ') || 'Ingen fylker valgt');
  const channelLabel = [...channels].map((id) => (id === 'ted' ? 'TED' : 'Doffin')).join(', ') || 'Ingen kanal';

  const summary = (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={styles.summaryHead}>
        <Text style={[styles.h, { color: colors.ink }]}>Oppsummering</Text>
        <TouchableOpacity onPress={() => onOpenSettings?.()} accessibilityRole="button" accessibilityLabel="Åpne innstillinger for CPV og søk">
          <Ionicons name="settings-outline" size={20} color={colors.ink} />
        </TouchableOpacity>
      </View>
      <Text style={{ color: colors.ink }}>{company?.name || 'Bedriften'}</Text>
      <Text style={{ color: colors.muted }}>
        {cpvCount} CPV · {searchTermCount} søkeord · {companyTrades.length} næringskoder · {areaLabel} · {channelLabel}
      </Text>
      {state.watch?.profile?.summary ? (
        <Text style={{ color: colors.ink }}>{state.watch.profile.summary}</Text>
      ) : null}
      <Text style={{ color: colors.muted }}>
        {syncing ? 'Søker …' : ranking ? 'AI vurderer treff …' : `${scopedNotices.length} treff i listen.`}
      </Text>
    </View>
  );

  const searchField = (
    <TextInput
      value={queryText}
      onChangeText={setQueryText}
      placeholder="Filtrer på tittel, oppdragsgiver eller CPV"
      placeholderTextColor={colors.placeholder}
      style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
    />
  );

  const regionBox = (
    <View style={[styles.sourceBox, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <RegionCoverage
        colors={colors}
        picker
        departments={alignedDepartments}
        companyNationwide={nationwide}
        companyAreaIds={[...areas]}
        selectedDepartmentId={departmentId}
        onSelectDepartment={setDepartmentId}
        onCompanyChange={({ nationwide: nextNationwide, areaIds }) => commitCoverage({
          nextNationwide,
          nextAreaIds: areaIds,
        })}
        onDepartmentChange={(id, patch) => {
          const next = alignedDepartments.map((row) => (
            row.id === id
              ? {
                ...row,
                nationwide: !!patch.nationwide,
                areas: patch.nationwide ? [] : areaObjects(patch.areaIds || []),
              }
              : row
          ));
          commitCoverage({ nextDepartments: next });
        }}
      />
      {departmentId && !viewCoverage.nationwide && !viewCoverage.areas.length ? (
        <Text style={{ color: colors.muted, fontSize: 13 }}>
          Avdelingen har ingen region. Velg fylker eller hele Norge, og trykk Oppdater nå.
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={[styles.layout, !phone && styles.layoutDesktop]}>
      <View style={styles.main}>
        {phone ? summary : null}
        {!phone && !!savedNote ? <Text style={{ color: colors.brand }}>{savedNote}</Text> : null}
        <View style={[styles.titleRow, phone && styles.titleRowPhone]}>
          <View style={{ gap: 2, flex: 1, flexShrink: 1, minWidth: 0 }}>
            <Text style={[styles.h, { color: colors.ink }]}>Treff</Text>
            {state.syncedAt ? (
              <Text style={{ color: colors.muted, fontSize: 12 }}>
                {`Oppdatert ${formatWhen(state.syncedAt)}.`}
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => refresh(stateRef.current, true)} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '400' }}>{syncing ? 'Søker …' : 'Oppdater nå'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => applyAiRank(stateRef.current.watch, stateRef.current.notices)}
              accessibilityRole="button"
              accessibilityLabel="Vurder treff med AI"
              style={[styles.save, { backgroundColor: colors.sunken }]}
            >
              <Text style={{ color: colors.ink, fontWeight: '400' }}>{ranking ? 'Vurderer …' : 'Vurder treff med AI'}</Text>
            </TouchableOpacity>
          </View>
        </View>
        {phone ? null : searchField}
        {phone ? null : regionBox}
        <View style={styles.row}>
          <FilterMenu
            groups={[
              {
                id: 'status',
                label: 'Treff',
                value: filter,
                onChange: setFilter,
                options: FILTERS.map(([id, label]) => ({ id, label: `${label} (${filterCounts[id] || 0})` })),
              },
              ...(phone ? [
                {
                  id: 'channel',
                  label: 'Kanal',
                  value: sourceFilter,
                  idle: 'alle',
                  onChange: setSourceFilter,
                  options: [
                    { id: 'alle', label: 'Alle kanaler' },
                    { id: 'doffin', label: 'Doffin' },
                    { id: 'ted', label: 'TED' },
                  ],
                },
                {
                  id: 'area',
                  label: 'Område',
                  value: areaId,
                  onChange: setAreaId,
                  options: [
                    { id: '', label: 'Alle områder' },
                    ...TENDER_AREAS.map((area) => ({ id: area.id, label: area.name })),
                  ],
                },
              ] : []),
            ]}
          />
          {!phone ? (
            <Chip
              label="Kilde og område"
              colors={colors}
              on={sourceOpen || sourceFilter !== 'alle' || !!areaId}
              onPress={() => setSourceOpen((value) => !value)}
              hint="Vis filter for Doffin, TED og område"
            />
          ) : null}
        </View>
        {!phone && sourceOpen ? (
          <View style={[styles.sourceBox, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Kanal og område</Text>
            <View style={styles.row}>
              <Chip label="Alle kanaler" colors={colors} on={sourceFilter === 'alle'} onPress={() => setSourceFilter('alle')} />
              <Chip label="Doffin" colors={colors} on={sourceFilter === 'doffin'} onPress={() => setSourceFilter(sourceFilter === 'doffin' ? 'alle' : 'doffin')} />
              <Chip label="TED" colors={colors} on={sourceFilter === 'ted'} onPress={() => setSourceFilter(sourceFilter === 'ted' ? 'alle' : 'ted')} />
            </View>
            <View style={styles.row}>
              <Chip label="Alle områder" colors={colors} on={!areaId} onPress={() => setAreaId('')} />
              {TENDER_AREAS.map((area) => (
                <Chip key={area.id} label={area.name} colors={colors} on={areaId === area.id} onPress={() => setAreaId(areaId === area.id ? '' : area.id)} />
              ))}
            </View>
          </View>
        ) : null}
        {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
        {phone ? (
          <TenderMap
            pins={pins}
            selectedId={openId}
            colors={colors}
            missing={missingPlaces}
            compact
            note={mapNote}
            followId={mapFollow.id}
            followAt={mapFollow.at}
            view={mapFollowsList(filter) ? filter : ''}
            onSelect={focusNotice}
            onPreview={(id) => highlightFromMap(id, { scroll: false, followList: false })}
            onMark={markOnMap}
            busyId={pullingId}
          />
        ) : null}
        {phone && !!savedNote ? <Text style={{ color: colors.brand }}>{savedNote}</Text> : null}
        {phone ? searchField : null}
        {phone ? regionBox : null}
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
            focusId={mapFocusId}
            onToggle={(id) => setOpenId(openId === id ? '' : id)}
            onMark={mark}
            renderDecision={(row) => (
              <BidDecision
                notice={row}
                colors={colors}
                busy={pullingId === row.id}
                onToggle={(itemId) => weigh(row.id, itemId)}
                onGive={() => giveBid(row.id)}
                onDecline={() => declineBid(row.id)}
              />
            )}
            matchWatch={matchWatch}
            syncing={syncing}
            emptyText={listEmpty}
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
            const deadline = deadlineInfo(row.deadline);
            const soon = deadline.tone === 'danger' || deadline.tone === 'warn';
            const open = openId === row.id;
            const onMap = mapFocusId === row.id;
            const aktuell = row.decision === 'aktuell';
            const uaktuell = row.decision === 'forkastet' || row.decision === 'arkiv' || row.decision === 'ikke';
            const fit = scoreNoticeFit(row, matchWatch);
            return (
              <View key={row.id} dataSet={{ noticeId: row.id }} style={{
                borderColor: onMap ? colors.brand : colors.line,
                borderBottomWidth: 1,
                borderLeftWidth: onMap || fit.strong ? 4 : 0,
                borderLeftColor: onMap || fit.strong ? colors.brand : 'transparent',
                backgroundColor: onMap || aktuell || fit.strong ? colors.brandSoft : 'transparent',
              }}
              >
                <View style={styles.line}>
                  <TouchableOpacity onPress={() => setOpenId(open ? '' : row.id)} accessibilityRole="button" accessibilityState={{ selected: onMap }} style={styles.line}>
                    <Text style={[styles.td, { width: 120, color: colors.ink }]}>{day(row.publishedAt)}</Text>
                    <Text style={[styles.td, { width: 90, color: colors.ink }]}>{row.source === 'ted' ? 'TED' : 'Doffin'}</Text>
                    <View style={[styles.td, { width: 110 }]}>
                      <Text style={{ color: soon ? colors.danger : colors.ink, fontWeight: soon ? '700' : '400' }}>{day(row.deadline)}</Text>
                      {deadline.daysLeft != null && deadline.daysLeft >= 0 ? (
                        <Text style={{ color: soon ? colors.danger : colors.muted, fontSize: 11 }}>
                          {deadline.daysLeft === 0 ? 'I dag' : `${deadline.daysLeft} d`}
                        </Text>
                      ) : null}
                    </View>
                    <View style={[styles.td, { width: 420 }]}>
                      {onMap ? (
                        <Text style={{ color: colors.brand, fontSize: 11, fontWeight: '700' }}>Valgt på kartet</Text>
                      ) : null}
                      {fit.strong ? (
                        <Text style={{ color: colors.brand, fontSize: 11, fontWeight: '700' }}>Godt treff</Text>
                      ) : null}
                      <Text style={{ color: colors.ink }}>{row.title}</Text>
                      {fit.reason ? <Text style={{ color: colors.muted, fontSize: 11 }}>{fit.reason}</Text> : null}
                    </View>
                    <Text style={[styles.td, { width: 180, color: colors.ink }]}>{row.buyer || '—'}</Text>
                    <Text style={[styles.td, { width: 150, color: colors.muted }]}>{(row.places || []).join(', ') || '—'}</Text>
                  </TouchableOpacity>
                  <View style={styles.decision}>
                    <TouchableOpacity
                      onPress={() => mark(row.id, 'aktuell')}
                      accessibilityRole="button"
                      accessibilityLabel={`Merk ${row.title} som aktuell`}
                      style={[styles.mini, { backgroundColor: aktuell ? colors.brand : colors.sunken, borderColor: aktuell ? colors.brand : colors.line }]}
                    >
                      <Text style={{ color: aktuell ? '#fff' : colors.ink, fontSize: 12 }}>{pullingId === row.id ? 'Henter …' : 'Aktuell'}</Text>
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
                    <NoticeBody row={row} colors={colors} />
                    {pullingId === row.id ? <Text style={{ color: colors.muted }}>Henter tekst, vedlegg og spørsmål …</Text> : null}
                    {aktuell ? (
                      <BidDecision
                        notice={row}
                        colors={colors}
                        busy={pullingId === row.id}
                        onToggle={(itemId) => weigh(row.id, itemId)}
                        onGive={() => giveBid(row.id)}
                        onDecline={() => declineBid(row.id)}
                      />
                    ) : null}
                  </View>
                ) : null}
              </View>
            );
          })}
          {!rows.length ? <Text style={{ color: colors.muted, padding: 8 }}>{listEmpty}</Text> : null}
        </View>
        </ScrollView>
        )}
      </View>
      {!phone ? (
        <>
          {Platform.OS === 'web' ? React.createElement('div', {
            role: 'separator',
            'aria-orientation': 'vertical',
            'aria-label': 'Dra for å endre bredden på kartet',
            'aria-valuenow': sideWidth,
            'aria-valuemin': 280,
            'aria-valuemax': 840,
            onPointerDown: startSideResize,
            style: {
              width: 14,
              cursor: 'col-resize',
              alignSelf: 'stretch',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              touchAction: 'none',
              flexShrink: 0,
            },
          }, React.createElement('div', {
            style: {
              width: 4,
              height: 56,
              borderRadius: 4,
              background: colors.line,
            },
          })) : null}
          <View style={[styles.side, { width: sideWidth }]}>
            {summary}
            <TenderMap
              pins={pins}
              selectedId={openId}
              colors={colors}
              missing={missingPlaces}
              mapHeight={mapHeightForSide(sideWidth)}
              onSelect={focusNotice}
              onPreview={highlightFromMap}
              onMark={markOnMap}
              followId={mapFollow.id}
              followAt={mapFollow.at}
              view={mapFollowsList(filter) ? filter : ''}
              busyId={pullingId}
            />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  layout: { gap: 16, width: '100%', alignSelf: 'stretch' },
  layoutDesktop: { flexDirection: 'row', alignItems: 'flex-start' },
  main: { flex: 1, gap: 8, minWidth: 0 },
  side: {
    width: 360,
    flexGrow: 0,
    flexShrink: 0,
    gap: 12,
    ...(Platform.OS === 'web' ? { position: 'sticky', top: 12, alignSelf: 'flex-start' } : null),
  },
  summaryHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  tableScroll: {
    width: '100%',
    maxWidth: '100%',
    ...(Platform.OS === 'web' ? { overflowX: 'auto', overflowY: 'hidden' } : null),
  },
  tableContent: { flexGrow: 1 },
  table: { width: 1246, minWidth: 1246 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  h: { fontSize: 16, fontWeight: '600' },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  titleRowPhone: { flexWrap: 'wrap', alignItems: 'flex-start' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  chipEmphasis: { paddingRight: 8 },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 999,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#64748b',
  },
  badgeTxt: { color: '#fff', fontSize: 11, fontWeight: '700' },
  sourceBox: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 8 },
  deadlineBox: { borderWidth: 1, borderRadius: 12, padding: 10, gap: 2 },
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
