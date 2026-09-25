import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View,
} from 'react-native';
import { CPV_CODES, CPV_GROUPS, TENDER_AREAS } from '../../src/anbud/catalog';
import { buildTenderAlert } from '../../src/anbud/alertMail';
import { fetchTenderHits, sendTenderAlert } from '../../src/anbud/doffinClient';
import { fetchPublicCompany } from '../../src/project/companyPublic';
import {
  emptyAnbudState, formatWhen, mergeTenderNotices, normalizeCpvCode, saveTenderWatch, setNoticeDecision, watchQuery,
} from '../../src/anbud/model';
import { loadAnbudState, saveAnbudState } from '../../src/anbud/storage';
import { updateGroup } from '../../src/utils/groups';

const FILTERS = [
  ['alle', 'Alle'],
  ['nye', 'Nye'],
  ['aktuelle', 'Aktuelle'],
  ['arkiv', 'Arkiv'],
  ['forkastet', 'Ikke aktuelle'],
];

function day(value) {
  const raw = String(value || '');
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return raw ? formatWhen(raw) : '—';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function Chip({ label, on, onPress, colors }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" style={[styles.chip, { backgroundColor: on ? colors.brand : colors.sunken }]}>
      <Text style={{ color: on ? '#fff' : colors.ink, fontSize: 13, fontWeight: '400' }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function TenderAlert({ company, colors }) {
  const { width } = useWindowDimensions();
  const wide = width >= 980;
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
      setSelectedCpv(new Set(codes.map((row) => row.code).filter(Boolean)));
      setTrades([...(company?.naeringskoder || []), ...(watch.naeringskoder || [])].filter((row, index, list) => list.indexOf(row) === index));
      setNationwide(watch.savedAt ? !!watch.nationwide : true);
      setAreas(new Set((watch.areas || []).map((row) => row.id)));
      setChannels(new Set(watch.channels?.length ? watch.channels : ['doffin', 'ted']));
      setNotify(watch.notify || { push: true, varsel: true, email: false });
      setEmails(watch.emails || []);
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
    if (!ready || !state.watch.savedAt) return undefined;
    const now = new Date();
    const mark = new Date(now);
    mark.setHours(23, 55, 0, 0);
    if (now < mark) mark.setDate(mark.getDate() - 1);
    const synced = state.syncedAt ? new Date(state.syncedAt).getTime() : 0;
    if (synced >= mark.getTime()) return undefined;
    refresh(stateRef.current);
    return undefined;
  }, [ready]);

  const notices = state.notices || [];
  const watchedCodes = [...selectedCpv];

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
    };
  }

  async function refresh(nextState) {
    const active = watchQuery(nextState.watch);
    if (!active) return;
    setSyncing(true);
    setError('');
    try {
      const data = await fetchTenderHits({ ...active, channels: nextState.watch.channels });
      const merged = mergeTenderNotices(nextState, data.hits, data.fetchedAt).state;
      setState(merged);
      if (!data.hits?.length && data.errors?.length) setError(data.errors[0]);
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
    else setState(result.state);
  }

  const rows = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return notices.filter((row) => {
      if (filter === 'nye' && !row.isNew) return false;
      if (filter === 'aktuelle' && row.decision !== 'aktuell') return false;
      if (filter === 'arkiv' && row.decision !== 'arkiv') return false;
      if (filter === 'forkastet' && row.decision !== 'forkastet') return false;
      if (filter === 'alle' && (row.decision === 'arkiv' || row.decision === 'forkastet')) return false;
      if (sourceFilter !== 'alle' && row.source !== sourceFilter) return false;
      if (!q) return true;
      return `${row.title} ${row.buyer} ${(row.cpvCodes || []).join(' ')}`.toLowerCase().includes(q);
    });
  }, [notices, filter, sourceFilter, queryText]);

  const preview = buildTenderAlert({
    companyName: company?.name || state.watch.companyName,
    cpvCodes: state.watch.cpvCodes,
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
        notices: notices.filter((row) => row.decision !== 'arkiv' && row.decision !== 'forkastet').slice(0, 20),
      });
      setMailNote(data?.ok ? `Sendt til ${data.sent} mottaker${data.sent === 1 ? '' : 'e'}.` : (data?.error || 'Kunne ikke sende.'));
    } catch (err) {
      setMailNote(err?.message || 'Kunne ikke sende e-posten.');
    }
  }

  const summary = (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Text style={[styles.h, { color: colors.ink }]}>Oppsummering</Text>
      <Text style={{ color: colors.ink, fontWeight: '400' }}>{company?.name || 'Bedriften'}</Text>
      <Text style={{ color: colors.muted }}>{watchedCodes.length} CPV · {companyTrades.length} næringskoder</Text>
      <Text style={{ color: colors.muted }}>{nationwide ? 'Hele Norge' : `${areas.size} fylker`}</Text>
      <Text style={{ color: colors.muted }}>{[...channels].map((id) => (id === 'ted' ? 'TED' : 'Doffin')).join(', ') || 'Ingen kanal'}</Text>
      <Text style={{ color: colors.muted }}>
        {['push', 'varsel', 'email'].filter((key) => notify[key]).map((key) => (key === 'email' ? 'E-post' : key === 'varsel' ? 'Varsel' : 'Push')).join(', ') || 'Ingen varsling'}
      </Text>
      <Text style={{ color: colors.muted }}>{emails.join(', ') || 'Ingen mottakere'}</Text>
      <Text style={{ color: colors.muted }}>{syncing ? 'Søker …' : `${notices.length} treff`}</Text>
    </View>
  );

  return (
    <View style={[styles.layout, wide && styles.layoutWide]}>
      <View style={styles.main}>
        <Text style={[styles.h, { color: colors.ink }]}>Treff</Text>
        <TextInput
          value={queryText}
          onChangeText={setQueryText}
          placeholder="Filtrer på tittel, oppdragsgiver eller CPV"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
        />
        <View style={styles.row}>
          {FILTERS.map(([id, label]) => <Chip key={id} label={label} colors={colors} on={filter === id} onPress={() => setFilter(id)} />)}
          <Chip label="Doffin" colors={colors} on={sourceFilter === 'doffin'} onPress={() => setSourceFilter(sourceFilter === 'doffin' ? 'alle' : 'doffin')} />
          <Chip label="TED" colors={colors} on={sourceFilter === 'ted'} onPress={() => setSourceFilter(sourceFilter === 'ted' ? 'alle' : 'ted')} />
        </View>
        {!!error && <Text style={{ color: colors.danger }}>{error}</Text>}
        <ScrollView horizontal={false} style={styles.tableWrap}>
          <View style={styles.table}>
            <View style={[styles.tr, { borderColor: colors.line }]}>
              {['Publisert', 'Type', 'Frist', 'Konkurranse', 'Oppdragsgiver', 'Sted', 'Matcher', 'Aktuell', 'Arkiv', 'Ikke'].map((label) => (
                <Text key={label} style={[styles.th, { color: colors.ink }]}>{label}</Text>
              ))}
            </View>
            {rows.map((row) => {
              const soon = row.deadline && new Date(row.deadline).getTime() - Date.now() < 14 * 86400000;
              return (
                <View key={row.id} style={[styles.tr, { borderColor: colors.line, backgroundColor: row.isNew ? colors.brandSoft : 'transparent' }]}>
                  <Text style={[styles.td, { color: colors.ink }]}>{day(row.publishedAt)}</Text>
                  <Text style={[styles.td, { color: colors.ink }]}>{row.source === 'ted' ? 'TED' : 'Doffin'}{'\n'}{row.noticeType || ''}</Text>
                  <Text style={[styles.td, { color: soon ? colors.danger : colors.ink }]}>{day(row.deadline)}</Text>
                  <Text style={[styles.tdWide, { color: colors.brand }]} onPress={() => row.url && Linking.openURL(row.url)}>{row.title}</Text>
                  <Text style={[styles.td, { color: colors.ink }]}>{row.buyer || '—'}</Text>
                  <Text style={[styles.td, { color: colors.muted }]}>{(row.places || []).join(', ') || '—'}</Text>
                  <Text style={[styles.td, { color: colors.ink }]}>{(row.cpvCodes || []).slice(0, 2).join(', ') || 'CPV-søk'}</Text>
                  <Check on={row.decision === 'aktuell'} colors={colors} onPress={() => mark(row.id, 'aktuell')} />
                  <Check on={row.decision === 'arkiv'} colors={colors} onPress={() => mark(row.id, 'arkiv')} />
                  <Check on={row.decision === 'forkastet'} colors={colors} onPress={() => mark(row.id, 'forkastet')} />
                </View>
              );
            })}
            {!rows.length ? <Text style={{ color: colors.muted, padding: 8 }}>{syncing ? 'Henter treff …' : 'Ingen treff i dette filteret. Oppdater for å søke.'}</Text> : null}
          </View>
        </ScrollView>
        <TouchableOpacity onPress={() => refresh(stateRef.current)} accessibilityRole="button">
          <Text style={{ color: colors.brand, fontWeight: '400' }}>{syncing ? 'Søker …' : 'Oppdater nå'}</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.side, wide && styles.sideWide]}>
        {summary}
        <TouchableOpacity onPress={() => setShowCriteria((value) => !value)} accessibilityRole="button" style={[styles.save, { backgroundColor: colors.sunken }]}>
          <Text style={{ color: colors.ink, fontWeight: '400' }}>{showCriteria ? 'Skjul kriterier' : 'Kriterier'}</Text>
        </TouchableOpacity>
        {!!savedNote && <Text style={{ color: colors.brand }}>{savedNote}</Text>}
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

function Check({ on, onPress, colors }) {
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: on }} style={styles.td}>
      <Text style={{ color: on ? colors.brand : colors.muted, fontSize: 16 }}>{on ? '☑' : '☐'}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  layout: { gap: 16 },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  main: { flex: 1, gap: 8, minWidth: 0 },
  side: { gap: 10 },
  sideWide: { width: 280 },
  tableWrap: { width: '100%' },
  table: { width: '100%', minWidth: 860 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
  h: { fontSize: 16, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  save: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  tr: { flexDirection: 'row', borderBottomWidth: 1, alignItems: 'flex-start' },
  th: { flex: 1, minWidth: 90, fontSize: 12, fontWeight: '600', padding: 8 },
  td: { flex: 1, minWidth: 90, fontSize: 13, fontWeight: '400', padding: 8 },
  tdWide: { flex: 2, minWidth: 180, fontSize: 13, fontWeight: '400', padding: 8 },
});
