import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import CompanyLogoChoice from '../../components/CompanyLogoChoice';
import { companyLogoOf } from '../../src/project/companyLogo';
import { seriesById } from '../../src/indeksregulering/catalog';
import {
  allowedFrom,
  applyPriceVersion,
  approveCase,
  attachLetter,
  beginSend,
  caseFromCalculation,
  classifyContract,
  computeRegulation,
  finishSend,
  formatKr,
  formatPercentExact,
  priceVersionFromCase,
  saveDraft,
  validateCase,
  withdrawCase,
} from '../../src/indeksregulering/cases';
import { periodLabel } from '../../src/indeksregulering/engine';
import { buildLetter, formatIndex, formatPercent, letterFromRecord } from '../../src/indeksregulering/letter';
import { indexLetterMessage } from '../../src/indeksregulering/mail';
import { sendIndexLetter } from '../../src/indeksregulering/mailClient';
import { downloadBytes, exportFiles } from '../../src/indeksregulering/office';
import { fetchSeriesById } from '../../src/indeksregulering/ssb';
import { frequencyLabel } from '../../src/indeksregulering/settings';
import { osloDate } from '../../src/indeksregulering/watch';

const NAV = [
  { id: 'oversikt', label: 'Oversikt' },
  { id: 'beregning', label: 'Beregning' },
  { id: 'brev', label: 'Varselbrev' },
  { id: 'historikk', label: 'Historikk' },
];

function screenFromView(view) {
  return NAV.some((item) => item.id === view) ? view : 'oversikt';
}

function Field({ label, value, colors, onChange, placeholder, compact }) {
  return (
    <View style={[styles.field, compact && styles.fieldCompact]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      {onChange ? (
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder || ''}
          placeholderTextColor={colors.placeholder}
          style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
        />
      ) : (
        <Text style={{ color: colors.ink }}>{value || '–'}</Text>
      )}
    </View>
  );
}

export default function IndexWorkspace({
  contract,
  customer = null,
  company = null,
  project = null,
  draft,
  actor = null,
  caseId = '',
  initialView = '',
  series = null,
  onClose,
  onSave,
  onOpenProject,
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const cases = contract?.indexCases || [];
  const existing = cases.find((row) => row.id === caseId) || null;
  const [screen, setScreen] = useState(screenFromView(initialView));
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const [entry, setEntry] = useState(existing);
  const [useLogo, setUseLogo] = useState(true);
  const [seriesConfirmed, setSeriesConfirmed] = useState(false);
  const [freeText, setFreeText] = useState(existing?.freeText || '');
  const [to, setTo] = useState(customer?.email || draft?.email || '');
  const [recipientName, setRecipientName] = useState(customer?.contactName || draft?.contactName || '');
  const [cc, setCc] = useState('');
  const [frozen, setFrozen] = useState(null);
  const [openLetterId, setOpenLetterId] = useState('');
  const [subject, setSubject] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [dates, setDates] = useState(() => ({
    regulationDate: existing?.regulationDate || osloDate(),
    noticeDate: existing?.noticeDate || osloDate(),
    effectiveFrom: existing?.effectiveFrom || '',
    effectiveTo: existing?.effectiveTo || '',
    noticeDays: existing?.noticeDays ? String(existing.noticeDays) : '',
  }));
  const sending = useRef(false);
  useEffect(() => {
    setScreen(screenFromView(initialView));
  }, [contract?.id, initialView]);

  useEffect(() => {
    const email = customer?.email || draft?.email || '';
    const name = customer?.contactName || draft?.contactName || customer?.name || '';
    if (email) setTo((current) => current || email);
    if (name) setRecipientName((current) => current || name);
  }, [customer?.email, customer?.contactName, customer?.name, draft?.email, draft?.contactName]);

  useEffect(() => {
    if (dates.effectiveFrom || !draft) return;
    const from = allowedFrom({
      draft,
      cases,
      regulations: contract?.regulations || [],
      chain: null,
    });
    if (from) setDates((current) => (current.effectiveFrom ? current : { ...current, effectiveFrom: from }));
  }, [draft, contract?.id]);
  const logo = companyLogoOf(company);

  useEffect(() => {
    let live = true;
    if (!draft?.indexId) return undefined;
    setWorking(true);
    fetchSeriesById(draft.indexId).then((fetched) => {
      if (live) setBundle(fetched);
    }).catch((cause) => {
      if (live) setError(cause?.message || 'Kunne ikke hente indeksen fra SSB.');
    }).finally(() => {
      if (live) setWorking(false);
    });
    return () => { live = false; };
  }, [draft?.indexId]);

  const activeDraft = useMemo(() => ({
    ...draft,
    regulationDate: dates.regulationDate,
    noticeDate: dates.noticeDate,
    effectiveDate: dates.effectiveFrom,
    freeText,
    seriesConfirmed,
  }), [draft, dates, freeText, seriesConfirmed]);

  const liveSeries = bundle?.series || series;
  const math = useMemo(() => computeRegulation({
    draft: activeDraft,
    series: liveSeries,
    cases,
    regulations: contract?.regulations || [],
    period: selectedPeriod,
  }), [activeDraft, liveSeries, cases, contract?.regulations, selectedPeriod]);

  const letterPack = useMemo(() => {
    const options = { logo, includeLogo: useLogo };
    if (math?.ok) {
      return { letter: buildLetter(activeDraft, math, options), result: math, stored: false };
    }
    const stored = letterFromRecord(activeDraft || {}, recordForLetter(contract, entry), options);
    return stored
      ? { letter: stored.letter, result: stored.result, stored: true }
      : { letter: null, result: null, stored: false };
  }, [math, activeDraft, logo, useLogo, contract, entry]);
  const letter = letterPack.letter;
  const letterResult = letterPack.result;

  const checks = entry
    ? validateCase({ ...entry, letterPlain: letter?.plain || entry.letterPlain, provisional: math?.provisional }, cases, { forApproval: true })
    : [];

  function patchDate(key, value) {
    setDates((current) => ({ ...current, [key]: value }));
  }

  function ensureEntry() {
    if (entry) return entry;
    if (!math?.ok) return null;
    return caseFromCalculation({
      contract,
      draft: activeDraft,
      result: math,
      cases,
      actor,
      dates: {
        ...dates,
        allowedFrom: '',
        noticeDays: Number(dates.noticeDays) || 0,
        freeText,
        effectiveFrom: dates.effectiveFrom || osloDate(),
      },
    });
  }

  function withLetter(current) {
    if (!letter || !math?.ok) return current;
    if (current.letterPlain === letter.plain && current.freeText === freeText) return current;
    const attached = attachLetter({ ...current, freeText }, letter, { ...math, draft: activeDraft }, actor);
    return attached.ok ? attached.case : current;
  }

  async function persist(next, withPrice) {
    const version = withPrice ? priceVersionFromCase(next) : null;
    const priceVersions = version ? applyPriceVersion(contract?.priceVersions, version) : undefined;
    const result = await onSave?.(next, { priceVersions });
    if (!result?.ok) {
      setError(result?.error || 'Kunne ikke lagre saken.');
      return null;
    }
    const storedCase = result.case || next;
    setEntry(storedCase);
    setNote(savedNote(storedCase));
    return storedCase;
  }

  async function storeDraft() {
    const base = ensureEntry();
    if (!base) {
      setError(math?.error || 'Beregningen er ikke klar.');
      return;
    }
    const saved = saveDraft(withLetter({ ...base, ...datePatch(base) }), { freeText }, cases, actor);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    setWorking(true);
    try {
      await persist(saved.case, false);
    } finally {
      setWorking(false);
    }
  }

  function datePatch(base) {
    return {
      ...base,
      regulationDate: dates.regulationDate,
      noticeDate: dates.noticeDate,
      effectiveFrom: dates.effectiveFrom || base.effectiveFrom,
      effectiveTo: dates.effectiveTo,
      noticeDays: Number(dates.noticeDays) || 0,
      freeText,
      provisional: !!math?.provisional,
      newPrice: math?.regulated ?? base.newPrice,
      addition: math?.addition ?? base.addition,
      changePercent: math?.changePercent ?? base.changePercent,
      newIndex: math?.regulationPoint?.value ?? base.newIndex,
      newPeriod: math?.regulationPoint?.period ?? base.newPeriod,
      basisIndex: math?.basisPoint?.value ?? base.basisIndex,
      basisPeriod: math?.basisPoint?.period ?? base.basisPeriod,
    };
  }

  async function approve(sendAfter) {
    if (sending.current) return;
    const base = ensureEntry();
    if (!base) {
      setError(math?.error || 'Beregningen er ikke klar.');
      return;
    }
    let current = withLetter(datePatch(base));
    if (!['godkjent', 'klar_til_utsending', 'sendefeil', 'sending'].includes(current.status)) {
      const approved = approveCase(current, cases, actor);
      if (!approved.ok) {
        setError(approved.error);
        return;
      }
      current = approved.case;
    }
    setWorking(true);
    try {
      const stored = await persist(current, true);
      if (!stored) return false;
      if (sendAfter) await deliver(stored);
      return true;
    } finally {
      setWorking(false);
    }
  }

  async function registerLetter() {
    const ok = await approve(false);
    if (!ok) return;
    download('pdf');
    setNote('PDF er produsert og brevet er registrert. Ingenting er sendt.');
  }

  async function deliver(current) {
    if (sending.current) return;
    sending.current = true;
    setError('');
    try {
      const message = indexLetterMessage({
        to,
        cc: cc.split(/[;,]/),
        name: recipientName || customer?.contactName || draft?.contactName || customer?.name || '',
        companyName: company?.navn || draft?.supplier || '',
        letterPlain: current.letterPlain,
        period: periodLabel(current.newPeriod),
        subject,
      });
      const started = beginSend(current, message, actor);
      if (!started.ok) {
        setError(started.error);
        return;
      }
      const locked = await persist(started.case, true);
      if (!locked) return;
      try {
        const response = await sendIndexLetter(message);
        const done = finishSend(locked, { ok: true, providerId: response?.providerId || response?.id || '' }, actor);
        await persist(done.case, true);
        setNote(`Varsel sendt til ${message.to}.`);
      } catch (cause) {
        const done = finishSend(locked, { ok: false, error: cause?.message || 'Sending feilet' }, actor);
        await persist(done.case, true);
        setError(cause?.message || 'E-posten ble ikke sendt.');
      }
    } finally {
      sending.current = false;
    }
  }

  function download(kind) {
    if (!letter || !letterResult) {
      setError(math?.error || 'Brevet er ikke klart.');
      return;
    }
    const file = exportFiles(activeDraft, letterResult, letter, [seriesById(draft?.indexId)].filter(Boolean)).find((item) => item.kind === kind);
    if (!file) return;
    downloadBytes(file.filename, file.bytes, file.mime);
    setNote(`${file.filename} er lastet ned.`);
  }

  async function correct() {
    if (!entry) return;
    const fresh = caseFromCalculation({
      contract,
      draft: activeDraft,
      result: math?.ok ? math : { chain: math?.chain },
      cases,
      actor,
      previousId: entry.id,
      dates: { ...dates, freeText, effectiveFrom: dates.effectiveFrom || osloDate() },
    });
    setEntry({ ...fresh, status: 'utkast' });
    setScreen('beregning');
    setNote(`Korrigering av ${entry.number} er startet. Den forrige saken er uendret.`);
  }

  const chain = math?.chain;
  const points = bundle?.series?.[draft?.indexId]?.points || [];
  const queue = useMemo(() => classifyContract({
    contract,
    series: liveSeries,
  }), [contract, liveSeries]);
  const history = historyRows(cases, contract?.regulations || []);
  const savedPlain = savedLetterText(contract, draft, company);
  const savedCase = !!(entry && cases.some((row) => row.id === entry.id));

  async function reviewCalculation() {
    if (!math?.ok || letterPack.stored || !letter || !Number(math.addition)) {
      setError(math?.ok ? 'Indeksen er uendret, så det er ingen ny regulering å opprette.' : (math?.error || 'Ny indeks er ikke publisert.'));
      return;
    }
    const base = ensureEntry();
    if (!base) {
      setError('Beregningen er ikke klar.');
      return;
    }
    const saved = saveDraft(withLetter(datePatch(base)), { freeText }, cases, actor);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }
    setWorking(true);
    try {
      const stored = await persist(saved.case, false);
      if (!stored) return;
      setFrozen({
        id: stored.id,
        at: stored.noticeDate || dates.noticeDate || osloDate(),
        title: letter.title,
        plain: letter.plain,
        letter,
        price: formatKr(math.regulated),
        fromPrice: formatKr(math.baseSum),
        period: [periodLabel(math.basisPoint?.period), periodLabel(math.regulationPoint?.period)].filter(Boolean).join('–'),
        status: 'Generert',
      });
      setOpenLetterId(stored.id);
      setScreen('brev');
      setNote(`Utkast ${stored.number} er generert. Ingenting er sendt.`);
    } finally {
      setWorking(false);
    }
  }

  const shared = {
    contract, project, draft, customer, company, colors, wide, chain, math, queue, history,
    dates, patchDate, points, selectedPeriod, setSelectedPeriod, freeText, setFreeText,
    to, setTo, recipientName, setRecipientName, cc, setCc, subject, setSubject, useLogo, setUseLogo, logo, letter, entry,
    checks, working, cases, onOpenProject, setScreen, storeDraft, approve, download, correct,
    savedPlain, screen, frozen, openLetterId, setOpenLetterId, setEntry, reviewCalculation, registerLetter, savedCase,
    letterCaption: letterPack.stored
      ? 'Ny indeks for neste regulering er ikke publisert. Forhåndsvisningen viser siste lagrede varsel.'
      : '',
  };

  return (
    <View nativeID="index-workspace" style={styles.frame}>
      <View style={[styles.locked, { backgroundColor: colors.bg, borderBottomColor: colors.line }]}>
        <View style={styles.top}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button">
            <Text style={{ color: colors.brand, fontWeight: '700' }}>Tilbake til oversikten</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
            {contract?.title || 'Avtale'}
          </Text>
        </View>
        <View nativeID="index-workspace-nav" style={styles.nav}>
          {NAV.map((item) => {
            const on = screen === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => setScreen(item.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.navItem, { borderBottomColor: on ? colors.brand : 'transparent', backgroundColor: on ? (colors.brandSoft || '#E8F6FE') : 'transparent' }]}
              >
                <Text style={{ color: on ? colors.brand : colors.ink, fontWeight: on ? '700' : '500' }}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled">
        {error ? <Text style={{ color: colors.danger || '#dc2626' }}>{error}</Text> : null}
        {note ? <Text style={{ color: colors.ink }}>{note}</Text> : null}
        {screen === 'oversikt' ? <Overview {...shared} /> : null}
        {screen === 'beregning' ? <Calculation {...shared} /> : null}
        {screen === 'brev' ? <LetterScreen {...shared} /> : null}
        {screen === 'historikk' ? <HistoryScreen {...shared} onOpenCase={(row) => { setEntry(row); setScreen('brev'); }} /> : null}
      </ScrollView>
    </View>
  );
}

function recordForLetter(contract, entry) {
  const priced = (row) => Number(row?.newPrice || row?.after) > 0;
  if (priced(entry)) return entry;
  const fromCases = [...(contract?.indexCases || [])].reverse().find((row) => priced(row) || row?.letterPlain);
  if (fromCases && (priced(fromCases) || !entry?.letterPlain)) return fromCases;
  const legacy = [...(contract?.regulations || [])].reverse().find((row) => priced(row) || row?.letterPlain);
  if (entry?.letterPlain) return entry;
  return legacy || fromCases || null;
}

function savedNote(next) {
  const number = next?.number || 'Saken';
  if (next?.mailStatus === 'sendt' || next?.status === 'sendt') {
    return `Varsel sendt til ${next.mail?.to || ''}.`.replace(/\s+/g, ' ').trim();
  }
  if (next?.status === 'godkjent' || next?.status === 'klar_til_utsending') {
    return `${number} er godkjent og registrert. Ingenting er sendt.`;
  }
  if (next?.status === 'utkast') return `Utkast ${number} er lagret. Ingenting er sendt.`;
  return `${number} er lagret.`;
}

function pretty(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!match) return '';
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function historyRows(cases, regulations) {
  const fromCases = (cases || []).map((row) => ({
    ...row,
    id: row.id,
    number: row.number || row.id,
    title: row.freeText ? row.freeText.slice(0, 48) : `Regulering ${periodLabel(row.newPeriod) || ''}`.trim(),
    period: [periodLabel(row.previousPeriod || row.basisPeriod), periodLabel(row.newPeriod)].filter(Boolean).join('–'),
    from: pretty(row.effectiveFrom) || 'Ikke fastsatt',
    change: Number.isFinite(Number(row.changePercent)) ? formatPercent(row.changePercent) : '–',
    fromPrice: formatKr(row.previousPrice ?? row.before),
    price: row.newPrice ? formatKr(row.newPrice) : '–',
    statusLabel: regulationStatus(row),
  }));
  const seen = new Set((cases || []).map((row) => row.id));
  const legacy = (regulations || []).filter((row) => row?.id && !seen.has(row.id)).map((row) => ({
    ...row,
    number: row.id,
    title: 'Tidligere varsel',
    period: [periodLabel(row.fromPeriod), periodLabel(row.toPeriod)].filter(Boolean).join('–'),
    from: pretty(row.effectiveFrom || row.savedAt) || 'Ikke fastsatt',
    change: formatPercent(row.changePercent),
    fromPrice: formatKr(row.before),
    price: formatKr(row.after),
    statusLabel: row.sentAt ? 'Sendt' : 'Generert',
    mailStatus: row.sentAt ? 'sendt' : '',
  }));
  return [...fromCases, ...legacy];
}

function regulationStatus(row) {
  if (row?.mailStatus === 'sendt' || row?.sentAt || row?.status === 'sendt') return 'Sendt';
  if (row?.status === 'godkjent' || row?.status === 'klar_til_utsending') return 'Godkjent';
  if (row?.status === 'sendefeil') return 'Sendefeil';
  if (row?.status === 'sending') return 'Sending';
  if (row?.status === 'trukket') return 'Trukket';
  return 'Generert';
}

function Pill({ label, colors, tone }) {
  const color = tone === 'ok' ? (colors.success || '#16a34a') : (tone === 'wait' ? (colors.warn || '#d97706') : colors.brand);
  return (
    <View style={[styles.pill, { backgroundColor: `${color}18` }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

function landingStatus(queue, history) {
  const last = (history || []).find((row) => row.from && row.from !== 'Ikke fastsatt');
  const when = last?.from ? `Sist regulert ${last.from}.` : '';
  const band = queue?.band;
  if (band === 'kan_reguleres') {
    return { title: 'Kan reguleres på nytt', detail: queue.reason || '', tone: 'go' };
  }
  if (band === 'regulert') {
    return {
      title: 'Kan ikke reguleres på nytt nå',
      detail: [when, 'Venter på ny indeks.', queue?.reason].filter(Boolean).join(' '),
      tone: 'done',
    };
  }
  if (band === 'venter_indeks') {
    return { title: 'Venter på ny indeks', detail: [when, queue?.reason].filter(Boolean).join(' '), tone: 'wait' };
  }
  if (band === 'kommende') {
    return { title: 'Kan ikke reguleres ennå', detail: queue?.reason || '', tone: 'wait' };
  }
  if (band === 'ikke_aktuell') {
    return { title: 'Kan ikke reguleres', detail: queue?.reason || '', tone: 'stop' };
  }
  return { title: queue?.label || 'Må vurderes', detail: [when, queue?.reason].filter(Boolean).join(' '), tone: 'wait' };
}

function statusTone(tone, colors) {
  if (tone === 'go') return { bg: '#ecfdf3', border: colors.success || '#16a34a', ink: '#166534' };
  if (tone === 'done') return { bg: colors.brandSoft || '#E8F6FE', border: colors.brand, ink: colors.ink };
  if (tone === 'stop') return { bg: '#fef2f2', border: colors.danger || '#dc2626', ink: colors.danger || '#dc2626' };
  return { bg: '#fffbeb', border: colors.warn || '#d97706', ink: '#92400e' };
}

function Overview(props) {
  const {
    contract, project, draft, colors, wide, chain, queue, setScreen, history, setEntry, setOpenLetterId,
  } = props;
  const status = landingStatus(queue, history);
  const tone = statusTone(status.tone, colors);
  const [openId, setOpenId] = useState('');
  const letters = (history || []).filter((row) => row.letterPlain || row.newPrice || row.after || row.price);
  return (
    <View style={{ gap: 12 }}>
      <View nativeID="index-landing-status" style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.border }]}>
        <Text style={[styles.bannerTitle, { color: tone.ink }]}>{status.title}</Text>
        <Text style={{ color: colors.ink }}>{status.detail}</Text>
        {status.tone === 'go' ? (
          <TouchableOpacity onPress={() => setScreen('beregning')} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Gå til beregning</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={[styles.split, styles.splitStart, { flexDirection: wide ? 'row' : 'column' }]}>
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, flex: 1.2 }]}>
          <Text style={[styles.h, { color: colors.ink }]}>{contract?.title || 'Avtale'}</Text>
          <Text style={{ color: colors.muted }}>
            {[contract?.oppdragId, contract?.buyer, draft?.standard].filter(Boolean).join(' · ')}
          </Text>
          <View style={styles.grid}>
            <Field label="Avtalt pris eks. mva" value={chain?.originalPrice ? formatKr(chain.originalPrice) : ''} colors={colors} />
            <Field label="Gjeldende pris" value={chain?.previousPrice ? formatKr(chain.previousPrice) : ''} colors={colors} />
            <Field label="Avtaledato" value={pretty(draft?.contractDate)} colors={colors} />
            <Field label="Frekvens" value={frequencyLabel(draft?.terms?.frequency)} colors={colors} />
            <Field label="Prosjekt" value={[project?.number, project?.name].filter(Boolean).join(' · ')} colors={colors} />
            <Field label="Oppdragsgiver" value={contract?.buyer} colors={colors} />
            <Field label="Kontakt" value={[draft?.contactName, draft?.email].filter(Boolean).join(' · ')} colors={colors} />
            <Field label="Sist benyttet indeks" value={chain?.previous ? `${chain.previous.label} · ${formatIndex(chain.previous.value)}` : ''} colors={colors} />
          </View>
        </View>
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, flex: 1 }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Tidligere brev</Text>
          {!letters.length ? <Text style={{ color: colors.muted }}>Ingen brev er lagret eller sendt.</Text> : null}
          {letters.map((row) => {
            const open = openId === row.id;
            return (
              <View key={row.id} style={{ gap: 6 }}>
                <TouchableOpacity onPress={() => setOpenId(open ? '' : row.id)} accessibilityRole="button" style={styles.hist}>
                  <Text style={{ color: colors.ink, fontWeight: '700', width: 96 }}>{row.from || row.number}</Text>
                  <Text style={{ color: colors.ink, flex: 1 }}>{`${row.fromPrice} → ${row.price}`}</Text>
                  <Text style={{ color: colors.brand, fontWeight: '700' }}>{row.statusLabel}</Text>
                </TouchableOpacity>
                {open ? (
                  <View nativeID="index-letter-drawer" style={{ gap: 6, paddingLeft: 8 }}>
                    <Field label="Periode" value={row.period} colors={colors} compact />
                    <Field label="Endring" value={row.change} colors={colors} compact />
                    <Field label="Mottaker" value={row.mail?.to || row.sentTo || ''} colors={colors} compact />
                    {row.letterPlain ? <Text style={{ color: colors.ink }} numberOfLines={4}>{row.letterPlain}</Text> : null}
                    <TouchableOpacity
                      onPress={() => { setEntry(row); setOpenLetterId(row.id); setScreen('brev'); }}
                      accessibilityRole="button"
                      style={[styles.ghost, { borderColor: colors.line }]}
                    >
                      <Text style={{ color: colors.ink, fontWeight: '700' }}>Åpne brev</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function Stat({ label, value, colors }) {
  return (
    <View style={[styles.stat, { backgroundColor: colors.bg }]}>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>{value}</Text>
    </View>
  );
}

function calculationFacts({ math, contract, draft, dates }) {
  const filled = !!math?.ok;
  const show = (value) => (filled ? value : '');
  return [
    ['Avtale', show(contract?.title || draft?.title || '')],
    ['Oppdragsgiver', show(contract?.buyer || draft?.buyer || '')],
    ['Kontakt', show(draft?.contactName || '')],
    ['E-post', show(draft?.email || '')],
    ['Periode', show([periodLabel(math?.basisPoint?.period), periodLabel(math?.regulationPoint?.period)].filter(Boolean).join(' – '))],
    ['Startindeks', show(math?.basisPoint ? formatIndex(math.basisPoint.value) : '')],
    ['Ny indeks', show(math?.regulationPoint ? formatIndex(math.regulationPoint.value) : '')],
    ['Indeksendring', show(formatPercentExact(math?.changePercent))],
    ['Gjeldende pris eks. mva', show(formatKr(math?.baseSum))],
    ['Regulering', show(`${math?.addition >= 0 ? '+' : ''}${formatKr(math?.addition)}`)],
    ['Ny pris eks. mva', show(formatKr(math?.regulated))],
    ['Gjelder fra', show(pretty(dates?.effectiveFrom))],
  ];
}

function FactTable({ rows, colors }) {
  return (
    <View nativeID="index-letter-facts" style={{ gap: 2 }}>
      {rows.map(([label, value]) => (
        <View key={label} style={styles.calc}>
          <Text style={{ color: colors.muted, flex: 1 }}>{label}</Text>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{value || '–'}</Text>
        </View>
      ))}
    </View>
  );
}

function Calculation(props) {
  const {
    colors, wide, chain, math, dates, patchDate, points, selectedPeriod, setSelectedPeriod,
    contract, draft, reviewCalculation, working,
  } = props;
  const changed = !!(math?.ok && Number(math.addition));
  const facts = calculationFacts({ math, contract, draft, dates });
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.split, styles.splitStart, { flexDirection: wide ? 'row' : 'column' }]}>
        <View style={{ flex: 1.15, gap: 12, minWidth: 0 }}>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.h, { color: colors.ink }]}>1. Indeks og beregningsgrunnlag</Text>
            <IndexTable chain={chain} math={math} colors={colors} />
            <Text style={{ color: colors.muted, fontSize: 12 }}>Velg indeksperiode. Serien byttes ikke selv om en nyere tabell finnes.</Text>
            <View style={styles.row}>
              {points.slice(-6).map((point) => (
                <TouchableOpacity key={point.period} onPress={() => setSelectedPeriod(point.period)} style={[styles.ghost, { borderColor: (selectedPeriod || math?.regulationPoint?.period) === point.period ? colors.brand : colors.line }]}>
                  <Text style={{ color: colors.ink }}>{periodLabel(point.period)} · {formatIndex(point.value)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.h, { color: colors.ink }]}>2. Reguleringsperiode og virkning</Text>
            <View style={styles.grid}>
              <Field label="Referanseperiode fra" value={periodLabel(chain?.previous?.period)} colors={colors} />
              <Field label="Referanseperiode til" value={periodLabel(math?.regulationPoint?.period)} colors={colors} />
              <Field label="Reguleringsdato" value={dates.regulationDate} colors={colors} onChange={(value) => patchDate('regulationDate', value)} placeholder="ÅÅÅÅ-MM-DD" />
              <Field label="Varslingsdato" value={dates.noticeDate} colors={colors} onChange={(value) => patchDate('noticeDate', value)} placeholder="ÅÅÅÅ-MM-DD" />
              <Field label="Ny pris gjelder fra" value={dates.effectiveFrom} colors={colors} onChange={(value) => patchDate('effectiveFrom', value)} placeholder="ÅÅÅÅ-MM-DD" />
              <Field label="Perioden slutter" value={dates.effectiveTo} colors={colors} onChange={(value) => patchDate('effectiveTo', value)} placeholder="ÅÅÅÅ-MM-DD" />
            </View>
            {(math?.warnings || []).map((line) => <Text key={line} style={{ color: colors.muted }}>{line}</Text>)}
          </View>
          <TouchableOpacity
            onPress={reviewCalculation}
            disabled={!changed || working}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: changed ? colors.brand : colors.line, opacity: changed && !working ? 1 : 0.55 }]}
          >
            <Text style={{ color: changed ? '#fff' : colors.ink, fontWeight: '700' }}>Foreta en ny beregning</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.muted }}>
            {changed
              ? 'Knappen lager et utkast og åpner varselbrevet.'
              : (math?.ok ? 'Indeksen er uendret. Knappen blir aktiv når prisen endres.' : (math?.error || 'Ny indeks er ikke publisert.'))}
          </Text>
        </View>
        <View nativeID="index-calc-status" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, flex: 1, alignSelf: 'flex-start', width: wide ? undefined : '100%' }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Status etter beregning</Text>
          <FactTable rows={facts} colors={colors} />
        </View>
      </View>
    </View>
  );
}

function savedLetterText(contract, draft, company) {
  const rows = [...(contract?.indexCases || []), ...(contract?.regulations || [])];
  const stored = [...rows].reverse().find((row) => row?.letterPlain);
  if (stored?.letterPlain) return stored.letterPlain;
  const row = [...(contract?.indexCases || [])].reverse().find((item) => item?.newPrice)
    || [...(contract?.regulations || [])].reverse().find((item) => item?.after || item?.letterPlain);
  if (!row) return '';
  const price = row.newPrice || row.after;
  const before = row.previousPrice || row.before;
  return [
    company?.navn || draft?.supplier || '',
    'Varsel om indeksregulering av avtalte priser',
    contract?.title || draft?.title || '',
    contract?.buyer ? `Til ${contract.buyer}` : '',
    [periodLabel(row.previousPeriod || row.basisPeriod || row.fromPeriod), periodLabel(row.newPeriod || row.toPeriod)].filter(Boolean).join(' – '),
    before ? `Tidligere pris ${formatKr(before)} eks. mva` : '',
    price ? `Ny pris ${formatKr(price)} eks. mva` : '',
    row.effectiveFrom ? `Gjelder fra ${row.effectiveFrom}` : '',
    Number.isFinite(Number(row.changePercent)) ? `Endring ${formatPercent(row.changePercent)}` : '',
  ].filter(Boolean).join('\n');
}

function LetterDocument({ letter, plain, colors, caption }) {
  const text = String(plain || '').trim();
  if (!letter?.notice && !text) {
    return <Text style={{ color: colors.muted }}>Ingen brev er lagret, og ny indeks er ikke klar for et nytt varsel.</Text>;
  }
  return (
    <View style={{ gap: 8, flex: 1, minWidth: 0 }}>
      {caption ? <Text style={{ color: colors.muted }}>{caption}</Text> : null}
      {letter?.notice ? <LetterPreview letter={letter} colors={colors} /> : (
        <View nativeID="index-letter-preview" style={[styles.letter, { borderColor: colors.line, backgroundColor: '#fff' }]}>
          {text.split('\n').map((line, index) => (
            <Text key={`${index}-${line.slice(0, 12)}`} style={{ color: colors.ink, fontWeight: index < 2 ? '700' : '400', lineHeight: 22 }}>
              {line || ' '}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function sendOutcome({ entry, savedCase, frozen }) {
  if (entry?.mailStatus === 'sendt' || entry?.status === 'sendt') {
    return {
      title: 'Sendt',
      detail: `Varslet er sendt ${entry.mail?.sentAt || ''} til ${entry.mail?.to || ''}.`.replace(/\s+/g, ' ').trim(),
      tone: 'go',
    };
  }
  if (entry?.status === 'sendefeil' || entry?.mail?.error) {
    return { title: 'Ikke sendt', detail: entry.mail?.error || 'Utsendingen feilet. Ingenting er markert som sendt.', tone: 'stop' };
  }
  if (savedCase) {
    return { title: 'Lagret som utkast', detail: 'Saken er opprettet og ligger i historikken. Ingenting er sendt.', tone: 'wait' };
  }
  if (frozen) {
    return { title: 'Opprettet til gjennomgang', detail: 'Beregningen er låst i listen. Den er verken lagret eller sendt.', tone: 'wait' };
  }
  return { title: 'Ingenting er opprettet', detail: 'Kjør beregning og velg Se over og godkjenn før noe lagres eller sendes.', tone: 'done' };
}

function recordFacts(row, contract, draft) {
  return [
    ['Avtale', contract?.title || draft?.title || row.title || ''],
    ['Oppdragsgiver', contract?.buyer || draft?.buyer || ''],
    ['Periode', row.period || ''],
    ['Pris fra', row.fromPrice || formatKr(row.previousPrice ?? row.before)],
    ['Pris til', row.price || formatKr(row.newPrice ?? row.after)],
    ['Endring', row.change || ''],
    ['Gjelder fra', row.from || pretty(row.effectiveFrom) || ''],
    ['Status', row.statusLabel || row.status || ''],
  ];
}

function LetterScreen(props) {
  const {
    colors, wide, letter, math, freeText, setFreeText, useLogo, setUseLogo, logo,
    to, setTo, recipientName, setRecipientName, cc, setCc, subject, setSubject,
    entry, working, download, storeDraft, approve, correct,
    savedPlain, history, frozen, openLetterId, setOpenLetterId, savedCase, draft,
    contract, dates, patchDate, registerLetter,
  } = props;
  const [editing, setEditing] = useState(false);
  const outcome = sendOutcome({ entry, savedCase, frozen });
  const tone = statusTone(outcome.tone, colors);
  const rows = [
    ...(frozen ? [{
      ...frozen,
      id: frozen.id,
      date: pretty(frozen.at) || frozen.at,
      title: frozen.title || 'Nytt varsel',
      statusLabel: 'Generert',
      fromPrice: frozen.fromPrice,
      price: frozen.price,
      letter: frozen.letter,
      plain: frozen.plain,
      live: true,
    }] : []),
    ...(history || []).filter((row) => row.id !== frozen?.id).map((row) => ({
      ...row,
      date: row.from || pretty(row.createdAt) || row.number,
      title: row.title || row.number,
      letter: null,
      plain: row.letterPlain || '',
      live: false,
    })),
  ];
  const selected = rows.find((row) => row.id === openLetterId) || null;
  const previewLetter = selected?.letter
    || (selected?.live && letter ? letter : null)
    || (selected ? letterFromRecord(draft || {}, selected, { logo, includeLogo: useLogo })?.letter : null);
  const previewPlain = selected?.plain || selected?.letterPlain || (!selected ? '' : (entry?.letterPlain || savedPlain));
  const facts = selected?.live
    ? calculationFacts({ math, contract, draft, dates })
    : (selected ? recordFacts(selected, contract, draft) : []);
  const canRegister = !!(selected?.live && math?.ok && Number(math.addition));
  return (
    <View style={{ gap: 8 }}>
      {!rows.length ? <Text style={{ color: colors.muted }}>Ingen brev er generert ennå.</Text> : null}
      {rows.map((row) => {
        const on = openLetterId === row.id;
        return (
          <TouchableOpacity key={row.id} onPress={() => setOpenLetterId(on ? '' : row.id)} accessibilityRole="button" style={[styles.hist, { backgroundColor: on ? (colors.brandSoft || '#E8F6FE') : 'transparent' }]}>
            <Text style={{ color: colors.ink, fontWeight: '700', width: 96 }}>{row.date}</Text>
            <Text style={{ color: colors.ink, flex: 1 }}>{`${row.fromPrice || '–'} → ${row.price || '–'}`}</Text>
            <Text style={{ color: colors.brand, fontWeight: '700' }}>{row.statusLabel}</Text>
          </TouchableOpacity>
        );
      })}
      <View style={[styles.split, styles.splitStart, { flexDirection: wide ? 'row' : 'column' }]}>
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, flex: 1, minWidth: 0 }]}>
          <View style={styles.toolbar}>
            <Text style={[styles.h, { color: colors.ink }]}>Utfylte felt</Text>
            <View style={styles.actions}>
              <TouchableOpacity onPress={() => setEditing((open) => !open)} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>{editing ? 'Lukk endring' : 'Endre'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={registerLetter}
                disabled={!canRegister || working}
                accessibilityRole="button"
                style={[styles.primary, { backgroundColor: colors.brand, opacity: canRegister && !working ? 1 : 0.45 }]}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Se over og godkjenn</Text>
              </TouchableOpacity>
            </View>
          </View>
          {selected ? <FactTable rows={facts} colors={colors} /> : <Text style={{ color: colors.muted }}>Velg et brev for å se feltene.</Text>}
          {editing ? (
            <View style={{ gap: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Feltene under brukes i brevet og er ikke regnet ut av indeksen.</Text>
              <CompanyLogoChoice value={useLogo} onChange={setUseLogo} logo={logo} colors={colors} subject="indeksbrevet" />
              <Field label="Fritekst i brevet" value={freeText} colors={colors} onChange={setFreeText} placeholder="Valgfri presisering" compact />
              <Field label="Ny pris gjelder fra" value={dates.effectiveFrom} colors={colors} onChange={(value) => patchDate('effectiveFrom', value)} placeholder="ÅÅÅÅ-MM-DD" compact />
              <Field label="Varslingsdato" value={dates.noticeDate} colors={colors} onChange={(value) => patchDate('noticeDate', value)} placeholder="ÅÅÅÅ-MM-DD" compact />
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1.15, minWidth: 0 }}>
          {selected ? (
            <View style={{ gap: 8 }}>
              <View style={styles.actions}>
                <TouchableOpacity onPress={() => download('pdf')} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
                  <Text style={{ color: colors.ink, fontWeight: '700' }}>PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => download('docx')} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
                  <Text style={{ color: colors.ink, fontWeight: '700' }}>Word</Text>
                </TouchableOpacity>
              </View>
              <LetterDocument letter={previewLetter} plain={previewPlain} colors={colors} />
            </View>
          ) : (
            <Text style={{ color: colors.muted }}>Forhåndsvisningen av brevet vises her.</Text>
          )}
        </View>
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, width: wide ? 300 : '100%', flexGrow: 0, alignSelf: 'flex-start', gap: 8 }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Varsel og utsending</Text>
          <View nativeID="index-send-status" style={[styles.banner, { backgroundColor: tone.bg, borderColor: tone.border, padding: 10 }]}>
            <Text style={{ color: tone.ink, fontWeight: '700' }}>{outcome.title}</Text>
            <Text style={{ color: colors.ink }}>{outcome.detail}</Text>
          </View>
          <Field label="Kontakt" value={recipientName} colors={colors} onChange={setRecipientName} compact />
          <Field label="Mottaker" value={to} colors={colors} onChange={setTo} compact />
          <Field label="Kopi" value={cc} colors={colors} onChange={setCc} placeholder="flere adresser skilles med komma" compact />
          <Field label="Emne" value={subject} colors={colors} onChange={setSubject} placeholder="Settes fra perioden hvis feltet er tomt" compact />
          <TouchableOpacity onPress={storeDraft} disabled={working} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>Lagre som utkast</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => approve(false)} disabled={working} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>Godkjenn uten utsending</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => approve(true)} disabled={working} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand, opacity: working ? 0.6 : 1 }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>{working ? 'Jobber…' : 'Godkjenn og send'}</Text>
          </TouchableOpacity>
          {entry ? (
            <TouchableOpacity onPress={correct} accessibilityRole="button">
              <Text style={{ color: colors.brand, fontWeight: '700' }}>Ny korrigering</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  );
}

function HistoryScreen({ history, colors, wide, onOpenCase, contract }) {
  const [selectedId, setSelectedId] = useState(history[0]?.id || '');
  const selected = history.find((row) => row.id === selectedId) || history[0] || null;
  const sent = history.filter((row) => row.mailStatus === 'sendt' || row.status === 'sendt').length;
  const drafts = history.filter((row) => row.status === 'utkast').length;
  return (
    <View style={{ gap: 12 }}>
      <Text style={[styles.title, { color: colors.ink }]}>Reguleringshistorikk</Text>
      <Text style={{ color: colors.muted }}>{contract?.title} · saker, brev og revisjon</Text>
      <View style={styles.stats}>
        <Stat label="Reguleringssaker" value={String(history.length)} colors={colors} />
        <Stat label="Sendt" value={String(sent)} colors={colors} />
        <Stat label="Utkast" value={String(drafts)} colors={colors} />
      </View>
      <View style={[styles.split, { flexDirection: wide ? 'row' : 'column' }]}>
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, flex: 1.4 }]}>
          {!history.length ? <Text style={{ color: colors.muted }}>Ingen reguleringssaker er lagret på avtalen.</Text> : null}
          {history.map((row) => (
            <TouchableOpacity key={row.id} onPress={() => setSelectedId(row.id)} style={[styles.hist, { backgroundColor: selected?.id === row.id ? (colors.brandSoft || '#E8F6FE') : 'transparent' }]}>
              <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>{row.number}</Text>
              <Text style={{ color: colors.muted, width: 120 }}>{row.from}</Text>
              <Text style={{ color: colors.ink, width: 72 }}>{row.change}</Text>
              <Text style={{ color: colors.ink }}>{row.statusLabel}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {selected ? (
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, flex: 1 }]}>
            <Text style={[styles.h, { color: colors.ink }]}>{selected.number}</Text>
            <Field label="Periode" value={selected.period} colors={colors} />
            <Field label="Gjelder fra" value={selected.from} colors={colors} />
            <Field label="Ny pris" value={selected.price} colors={colors} />
            <Field label="Status" value={selected.statusLabel} colors={colors} />
            <Field label="Mottaker" value={selected.mail?.to || selected.sentTo || ''} colors={colors} />
            <TouchableOpacity onPress={() => onOpenCase(selected)} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Åpne sak og brev</Text>
            </TouchableOpacity>
            {(selected.audit || []).slice(-8).map((row, index) => (
              <Text key={`${row.at}-${index}`} style={{ color: colors.muted, fontSize: 12 }}>
                {row.at} · {row.action} · {row.by} {row.detail || ''}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.h, { color: colors.ink }]}>Hendelseslogg</Text>
        <EventLog history={history} colors={colors} />
      </View>
    </View>
  );
}

function EventLog({ history, colors }) {
  const lines = (history || []).flatMap((row) => {
    const audit = Array.isArray(row.audit) ? row.audit : [];
    if (audit.length) {
      return audit.map((item) => ({
        key: `${row.id}-${item.at}-${item.action}`,
        text: `${item.at} · ${row.number} · ${item.action}${item.detail ? ` · ${item.detail}` : ''}${item.by ? ` · ${item.by}` : ''}`,
      }));
    }
    return [{
      key: `${row.id}-status`,
      text: `${row.from || 'Uten dato'} · ${row.number} · ${row.statusLabel} · ${row.price || ''}`.trim(),
    }];
  });
  if (!lines.length) return <Text style={{ color: colors.muted }}>Ingen hendelser er logget.</Text>;
  return lines.map((line) => <Text key={line.key} style={{ color: colors.ink }}>{line.text}</Text>);
}

function IndexTable({ chain, math, colors }) {
  const rows = [
    ['Avtale inngått', chain?.original?.label, chain?.original ? formatIndex(chain.original.value) : '–', chain?.originalPrice ? formatKr(chain.originalPrice) : '–'],
    ['Sist benyttet', chain?.previous?.label || '–', chain?.previous ? formatIndex(chain.previous.value) : '–', chain?.previousPrice ? formatKr(chain.previousPrice) : '–'],
    ['Ny indeks', math?.regulationPoint?.label || chain?.next?.label || 'Ikke publisert', math?.regulationPoint ? formatIndex(math.regulationPoint.value) : (chain?.next ? formatIndex(chain.next.value) : '–'), math?.ok ? formatKr(math.regulated) : 'Beregnes'],
  ];
  return (
    <ScrollView horizontal>
      <View>
        <View style={styles.tr}>
          {['Hendelse', 'Periode', 'Indeks', 'Pris eks. mva'].map((label) => (
            <Text key={label} style={[styles.th, { color: colors.muted }]}>{label}</Text>
          ))}
        </View>
        {rows.map((row) => (
          <View key={row[0]} style={styles.tr}>
            {row.map((cell, index) => <Text key={`${row[0]}-${index}`} style={[styles.td, { color: colors.ink }]}>{cell}</Text>)}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function CalcTable({ math, colors }) {
  if (!math?.ok) return <Text style={{ color: colors.muted }}>{math?.error || 'Ingen beregning.'}</Text>;
  const lines = [
    ['Startindeks', formatIndex(math.basisPoint?.value)],
    ['Ny indeks', formatIndex(math.regulationPoint?.value)],
    ['Indeksendring', formatPercentExact(math.changePercent)],
    ['Gjeldende pris eks. mva', formatKr(math.baseSum)],
    ['Regulering', `${math.addition >= 0 ? '+' : ''}${formatKr(math.addition)}`],
    ['Ny pris eks. mva', formatKr(math.regulated)],
  ];
  return lines.map(([label, value]) => (
    <View key={label} style={styles.calc}>
      <Text style={{ color: colors.muted, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>{value}</Text>
    </View>
  ));
}

function LetterPreview({ letter, colors }) {
  const notice = letter.notice;
  return (
    <View nativeID="index-letter-preview" style={[styles.letter, { borderColor: colors.line, backgroundColor: '#fff' }]}>
      {notice.logo?.dataUrl ? (
        <Image
          source={{ uri: notice.logo.dataUrl }}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Bedriftens logo"
        />
      ) : (
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 18 }}>{notice.brand}</Text>
      )}
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{notice.title}</Text>
      <Text selectable style={{ color: colors.ink, lineHeight: 20 }}>{notice.intro}</Text>
      {notice.sections.map((section, sectionIndex) => (
        <View key={`${section.heading}-${sectionIndex}`} style={{ gap: 4 }}>
          <Text style={{ color: colors.brand, fontWeight: '700' }}>{section.heading}</Text>
          {section.lead ? <Text style={{ color: colors.ink }}>{section.lead}</Text> : null}
          {section.rows.map((row, index) => (
            <Text key={`${section.heading}-${index}`} style={{ color: colors.ink, lineHeight: 20 }}>
              {row.map((cell) => cell.text).filter(Boolean).join(' · ')}
            </Text>
          ))}
        </View>
      ))}
      {(notice.notes || []).map((line) => <Text key={line} style={{ color: colors.ink }}>{line}</Text>)}
      <Text style={{ color: colors.ink, fontWeight: '700' }}>Med vennlig hilsen</Text>
      {notice.signoff?.place ? <Text style={{ color: colors.ink }}>Sted: {notice.signoff.place}</Text> : null}
      <Text style={{ color: colors.ink }}>Dato: {notice.signoff?.date}</Text>
      {notice.signoff?.name ? <Text style={{ color: colors.ink }}>{notice.signoff.name}</Text> : null}
      <Text style={{ color: colors.ink }}>{notice.signoff?.company}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, width: '100%', minHeight: 0, gap: 8 },
  locked: { gap: 8, borderBottomWidth: 1, paddingBottom: 0, zIndex: 2 },
  nav: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  navItem: { paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 2, borderRadius: 8 },
  body: { flex: 1, width: '100%', minHeight: 0 },
  page: { gap: 12, paddingTop: 4, paddingBottom: 32, width: '100%' },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' },
  title: { fontSize: 24, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  h: { fontSize: 16, fontWeight: '700' },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center' },
  tabs: { flexDirection: 'row', gap: 16 },
  tab: { paddingBottom: 8 },
  tabOn: { paddingBottom: 8, borderBottomWidth: 2 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { borderRadius: 12, padding: 12, minWidth: 140, flexGrow: 1, gap: 4 },
  pill: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { minWidth: 160, flexGrow: 1, gap: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  primary: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  ghost: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  split: { gap: 12, alignItems: 'stretch' },
  splitStart: { alignItems: 'flex-start' },
  banner: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  bannerTitle: { fontSize: 22, fontWeight: '700' },
  fieldCompact: { flexGrow: 0, minWidth: 0, width: '100%' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tr: { flexDirection: 'row', minWidth: 560 },
  th: { width: 140, fontSize: 12, paddingVertical: 6 },
  td: { width: 140, fontSize: 14, paddingVertical: 6 },
  calc: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  letter: { borderWidth: 1, borderRadius: 4, padding: 20, gap: 8, width: '100%' },
  logo: { width: 180, height: 52, alignSelf: 'flex-start' },
  hist: { flexDirection: 'row', gap: 8, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center' },
});
