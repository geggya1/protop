import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
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
  CASE_STATUS_LABEL,
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
import { buildLetter, formatIndex, formatPercent } from '../../src/indeksregulering/letter';
import { indexLetterMessage } from '../../src/indeksregulering/mail';
import { sendIndexLetter } from '../../src/indeksregulering/mailClient';
import { downloadBytes, exportFiles } from '../../src/indeksregulering/office';
import { fetchSeriesById } from '../../src/indeksregulering/ssb';
import { frequencyLabel } from '../../src/indeksregulering/settings';
import { osloDate } from '../../src/indeksregulering/watch';

const SCREENS = [
  { id: 'oversikt', label: 'Oversikt' },
  { id: 'beregning', label: 'Beregning og periode' },
  { id: 'brev', label: 'Forhåndsvisning av varsel' },
  { id: 'historikk', label: 'Reguleringshistorikk' },
];

function Field({ label, value, colors, onChange, placeholder }) {
  return (
    <View style={styles.field}>
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
  onClose,
  onSave,
  onOpenProject,
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const cases = contract?.indexCases || [];
  const existing = cases.find((row) => row.id === caseId) || null;
  const [screen, setScreen] = useState(initialView === 'historikk' ? 'historikk' : 'oversikt');
  const [bundle, setBundle] = useState(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const [entry, setEntry] = useState(existing);
  const [useLogo, setUseLogo] = useState(true);
  const [seriesConfirmed, setSeriesConfirmed] = useState(false);
  const [freeText, setFreeText] = useState(existing?.freeText || '');
  const [to, setTo] = useState(customer?.email || draft?.email || '');
  const [cc, setCc] = useState('');
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
    setScreen(initialView === 'historikk' ? 'historikk' : 'oversikt');
  }, [contract?.id, initialView]);

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

  const math = useMemo(() => computeRegulation({
    draft: activeDraft,
    series: bundle?.series || null,
    cases,
    regulations: contract?.regulations || [],
    period: selectedPeriod,
  }), [activeDraft, bundle, cases, contract?.regulations, selectedPeriod]);

  const letter = useMemo(
    () => (math?.ok ? buildLetter(activeDraft, math, { logo, includeLogo: useLogo }) : null),
    [math, activeDraft, logo, useLogo],
  );

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
    setEntry(result.case || next);
    setNote(`${result.case?.number || next.number} er lagret.`);
    return result.case || next;
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
      if (!stored) return;
      if (sendAfter) await deliver(stored);
    } finally {
      setWorking(false);
    }
  }

  async function deliver(current) {
    if (sending.current) return;
    sending.current = true;
    setError('');
    try {
      const message = indexLetterMessage({
        to,
        cc: cc.split(/[;,]/),
        name: customer?.contactName || draft?.contactName || customer?.name || '',
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
    if (!letter || !math?.ok) {
      setError(math?.error || 'Brevet er ikke klart.');
      return;
    }
    const file = exportFiles(activeDraft, math, letter, [seriesById(draft.indexId)].filter(Boolean)).find((item) => item.kind === kind);
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
    series: bundle?.series || null,
  }), [contract, bundle]);
  const history = historyRows(cases, contract?.regulations || []);
  const shared = {
    contract, project, draft, customer, company, colors, wide, chain, math, queue, history,
    dates, patchDate, points, selectedPeriod, setSelectedPeriod, freeText, setFreeText,
    to, setTo, cc, setCc, subject, setSubject, useLogo, setUseLogo, logo, letter, entry,
    checks, working, cases, onOpenProject, setScreen, storeDraft, approve, download, correct,
  };

  return (
    <ScrollView nativeID="index-workspace" contentContainerStyle={styles.page}>
      <View style={styles.top}>
        <TouchableOpacity onPress={onClose} accessibilityRole="button">
          <Text style={{ color: colors.brand, fontWeight: '700' }}>Tilbake til oversikten</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
          Indeksregulering / {contract?.title || 'Avtale'}
        </Text>
      </View>
      {error ? <Text style={{ color: colors.danger || '#dc2626' }}>{error}</Text> : null}
      {note ? <Text style={{ color: colors.ink }}>{note}</Text> : null}
      {screen === 'oversikt' ? <Overview {...shared} /> : null}
      {screen === 'beregning' ? <Calculation {...shared} /> : null}
      {screen === 'brev' ? <LetterScreen {...shared} /> : null}
      {screen === 'historikk' ? <HistoryScreen {...shared} onOpenCase={(row) => { setEntry(row); setScreen('brev'); }} /> : null}
    </ScrollView>
  );
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
    price: row.newPrice ? formatKr(row.newPrice) : '–',
    statusLabel: row.mailStatus === 'sendt' ? 'Sendt' : (CASE_STATUS_LABEL[row.status] || row.status || 'Lagret'),
  }));
  const seen = new Set((cases || []).map((row) => row.id));
  const legacy = (regulations || []).filter((row) => row?.id && !seen.has(row.id)).map((row) => ({
    ...row,
    number: row.id,
    title: 'Tidligere varsel',
    period: [periodLabel(row.fromPeriod), periodLabel(row.toPeriod)].filter(Boolean).join('–'),
    from: pretty(row.savedAt),
    change: formatPercent(row.changePercent),
    price: formatKr(row.after),
    statusLabel: row.sentAt ? 'Sendt' : 'Lagret',
    mailStatus: row.sentAt ? 'sendt' : '',
  }));
  return [...fromCases, ...legacy];
}

function Pill({ label, colors, tone }) {
  const color = tone === 'ok' ? (colors.success || '#16a34a') : (tone === 'wait' ? (colors.warn || '#d97706') : colors.brand);
  return (
    <View style={[styles.pill, { backgroundColor: `${color}18` }]}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

function Overview(props) {
  const { contract, project, draft, colors, wide, chain, math, queue, onOpenProject, setScreen } = props;
  const checks = [
    [!!draft?.indexId, 'Avtalen inneholder indeksbestemmelse', chain?.table ? `SSB ${chain.table}` : 'Indeksserie mangler'],
    [!!chain?.original, 'Indeksgrunnlaget er registrert', chain?.original ? `${chain.original.label} · ${formatIndex(chain.original.value)}` : 'Opprinnelig indeks mangler'],
    [!!math?.ok && !math?.provisional, 'Ny indeks kan brukes', math?.ok ? (math.provisional ? 'Indeksen er ikke endelig' : formatKr(math.regulated)) : (math?.error || 'Venter på indeks')],
    [!(contract?.indexCases || []).some((row) => row.status === 'sendefeil'), 'Tidligere varsler', 'Ingen utsendelse står med feil'],
  ];
  return (
    <View style={{ gap: 12 }}>
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '700' }}>AVTALE / REGULERING</Text>
          <View style={styles.row}>
            <Text style={[styles.title, { color: colors.ink, flexShrink: 1 }]}>{contract?.title || 'Avtale'}</Text>
            <Pill label={queue?.label || 'Status'} colors={colors} tone={queue?.attention ? 'wait' : 'ok'} />
          </View>
          <Text style={{ color: colors.muted }}>
            {[contract?.oppdragId, contract?.buyer, draft?.standard].filter(Boolean).join(' · ')}
          </Text>
        </View>
        <View style={styles.actions}>
          <TouchableOpacity onPress={onOpenProject} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>Åpne prosjekt</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setScreen('beregning')} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Ny reguleringssak</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.tabs}>
        <TouchableOpacity onPress={() => setScreen('oversikt')} style={[styles.tabOn, { borderBottomColor: colors.brand }]}>
          <Text style={{ color: colors.brand, fontWeight: '700' }}>Oversikt</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setScreen('historikk')} style={styles.tab}>
          <Text style={{ color: colors.muted }}>Reguleringshistorikk</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.split, { flexDirection: wide ? 'row' : 'column' }]}>
        <View style={{ flex: 1.4, gap: 12 }}>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.h, { color: colors.ink }]}>Inngått avtale og indeksgrunnlag</Text>
            <View style={styles.stats}>
              <Stat label="Avtalt pris eks. mva" value={chain?.originalPrice ? formatKr(chain.originalPrice) : '–'} colors={colors} />
              <Stat label="Avtaledato" value={pretty(draft?.contractDate) || '–'} colors={colors} />
              <Stat label="Avtalt frekvens" value={frequencyLabel(draft?.terms?.frequency) || '–'} colors={colors} />
            </View>
            <IndexTable chain={chain} math={math} colors={colors} />
          </View>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.h, { color: colors.ink }]}>Avtaleopplysninger</Text>
            <Field label="Prosjekt" value={[project?.number, project?.name].filter(Boolean).join(' · ')} colors={colors} />
            <Field label="Oppdragsgiver" value={contract?.buyer} colors={colors} />
            <Field label="Kontakt" value={[draft?.contactName, draft?.email].filter(Boolean).join(' · ')} colors={colors} />
            <Field label="Neste tillatte dato" value={pretty(queue?.allowed)} colors={colors} />
          </View>
        </View>
        <View style={{ flex: 1, gap: 12 }}>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.h, { color: colors.ink }]}>Reguleringsstatus</Text>
            <Text style={{ color: colors.muted }}>{queue?.reason}</Text>
            <Field label="Utgangindeks" value={chain?.original ? `${formatIndex(chain.original.value)} · ${chain.original.label}` : '–'} colors={colors} />
            <Field label="Ny indeks" value={chain?.next ? `${formatIndex(chain.next.value)} · ${chain.next.label}` : 'Ikke publisert'} colors={colors} />
            <Field label="Beregnet ny pris" value={math?.ok ? formatKr(math.regulated) : '–'} colors={colors} />
            <TouchableOpacity onPress={() => setScreen('beregning')} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Start ny indeksregulering</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.h, { color: colors.ink }]}>Kontroller før regulering</Text>
            {checks.map(([ok, title, detail]) => (
              <Text key={title} style={{ color: ok ? (colors.success || '#16a34a') : (colors.warn || '#d97706') }}>
                {ok ? '●' : '▲'} {title}. {detail}
              </Text>
            ))}
          </View>
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

function Calculation(props) {
  const {
    colors, wide, chain, math, dates, patchDate, points, selectedPeriod, setSelectedPeriod, setScreen,
  } = props;
  return (
    <View style={{ gap: 12 }}>
      <StepBar current="beregning" colors={colors} onStep={setScreen} />
      <View style={[styles.split, { flexDirection: wide ? 'row' : 'column' }]}>
        <View style={{ flex: 1.4, gap: 12 }}>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.h, { color: colors.ink }]}>1. Indeks og beregningsgrunnlag</Text>
            <IndexTable chain={chain} math={math} colors={colors} />
            <CalcTable math={math} colors={colors} />
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
            <View style={[styles.grid, { flexDirection: wide ? 'row' : 'column' }]}>
              <Field label="Referanseperiode fra" value={periodLabel(chain?.previous?.period)} colors={colors} />
              <Field label="Referanseperiode til" value={periodLabel(math?.regulationPoint?.period)} colors={colors} />
              <Field label="Reguleringsdato" value={dates.regulationDate} colors={colors} onChange={(value) => patchDate('regulationDate', value)} placeholder="ÅÅÅÅ-MM-DD" />
              <Field label="Varslingsdato" value={dates.noticeDate} colors={colors} onChange={(value) => patchDate('noticeDate', value)} placeholder="ÅÅÅÅ-MM-DD" />
              <Field label="Ny pris gjelder fra" value={dates.effectiveFrom} colors={colors} onChange={(value) => patchDate('effectiveFrom', value)} placeholder="ÅÅÅÅ-MM-DD" />
              <Field label="Perioden slutter" value={dates.effectiveTo} colors={colors} onChange={(value) => patchDate('effectiveTo', value)} placeholder="ÅÅÅÅ-MM-DD" />
            </View>
            {(math?.warnings || []).map((line) => <Text key={line} style={{ color: colors.muted }}>{line}</Text>)}
          </View>
        </View>
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, flex: 1 }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Oppsummering</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Ny pris eks. mva</Text>
          <Text style={{ color: colors.ink, fontSize: 28, fontWeight: '700' }}>{math?.ok ? formatKr(math.regulated) : '–'}</Text>
          {math?.ok ? (
            <Text style={{ color: colors.muted }}>
              Fra {formatKr(math.baseSum)} · {math.addition >= 0 ? '+' : ''}{formatKr(math.addition)} ({formatPercent(math.changePercent)})
            </Text>
          ) : <Text style={{ color: colors.muted }}>{math?.error || 'Beregningen er ikke klar.'}</Text>}
          <TouchableOpacity onPress={() => setScreen('brev')} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand }]}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Forhåndsvis reguleringsbrev</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

function StepBar({ current, colors, onStep }) {
  const steps = [
    ['beregning', '1  Beregning og periode'],
    ['brev', '2  Forhåndsvisning av varsel'],
    ['brev', '3  Lagre og sende'],
  ];
  return (
    <View style={styles.steps}>
      {steps.map(([id, label], index) => {
        const on = current === id && (index < 2 || current === 'brev');
        return (
          <TouchableOpacity key={label} onPress={() => onStep(id)} accessibilityRole="button">
            <Text style={{ color: on ? colors.brand : colors.muted, fontWeight: on ? '700' : '400' }}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function LetterScreen(props) {
  const {
    colors, wide, letter, math, freeText, setFreeText, useLogo, setUseLogo, logo,
    to, setTo, cc, setCc, subject, setSubject, entry, working, download, storeDraft, approve, correct,
  } = props;
  return (
    <View style={{ gap: 12 }}>
      <StepBar current="brev" colors={colors} onStep={props.setScreen} />
      <View style={styles.actions}>
        <TouchableOpacity onPress={() => download('pdf')} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>PDF</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => download('docx')} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Word</Text>
        </TouchableOpacity>
      </View>
      <View style={[styles.split, { flexDirection: wide ? 'row' : 'column' }]}>
        <View style={{ flex: 1.3, gap: 12 }}>
          <CompanyLogoChoice value={useLogo} onChange={setUseLogo} logo={logo} colors={colors} subject="indeksbrevet" />
          <Field label="Fritekst i brevet" value={freeText} colors={colors} onChange={setFreeText} placeholder="Valgfri presisering" />
          {letter ? <LetterPreview letter={letter} colors={colors} /> : <Text style={{ color: colors.muted }}>{math?.error || 'Brevet kan ikke vises ennå.'}</Text>}
        </View>
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, flex: 1 }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Varsel og utsending</Text>
          <Field label="Mottaker" value={to} colors={colors} onChange={setTo} />
          <Field label="Kopi" value={cc} colors={colors} onChange={setCc} placeholder="flere adresser skilles med komma" />
          <Field label="Emne" value={subject} colors={colors} onChange={setSubject} placeholder="Settes fra perioden hvis feltet er tomt" />
          <Text style={{ color: colors.muted, fontSize: 12 }}>Ingenting sendes før du trykker send. Feil fra leverandøren setter sendefeil.</Text>
          <View style={styles.actions}>
            <TouchableOpacity onPress={storeDraft} disabled={working} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Lagre som utkast</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => approve(false)} disabled={working} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Godkjenn uten utsending</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => approve(true)} disabled={working} accessibilityRole="button" style={[styles.primary, { backgroundColor: colors.brand, opacity: working ? 0.6 : 1 }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{working ? 'Jobber…' : 'Godkjenn og send'}</Text>
            </TouchableOpacity>
          </View>
          {entry ? (
            <Text style={{ color: colors.ink }}>
              {entry.number} · {CASE_STATUS_LABEL[entry.status] || entry.status} · e-post {entry.mailStatus || 'ikke sendt'}
            </Text>
          ) : null}
          {entry?.mail?.sentAt ? (
            <Text style={{ color: colors.ink }}>
              Sendt {entry.mail.sentAt} av {entry.mail.sentBy || '–'} til {entry.mail.to}.
            </Text>
          ) : null}
          {entry?.mail?.error ? <Text style={{ color: colors.danger || '#dc2626' }}>{entry.mail.error}</Text> : null}
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
            {(selected.audit || []).slice(-6).map((row, index) => (
              <Text key={`${row.at}-${index}`} style={{ color: colors.muted, fontSize: 12 }}>
                {row.at} · {row.action} · {row.by}
              </Text>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
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
    <View style={[styles.letter, { borderColor: colors.line, backgroundColor: '#fff' }]}>
      <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 18 }}>{notice.logo ? '' : notice.brand}</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{notice.meta}</Text>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{notice.title}</Text>
      <Text style={{ color: colors.ink, lineHeight: 20 }}>{notice.intro}</Text>
      {notice.sections.slice(0, 4).map((section) => (
        <View key={section.heading} style={{ gap: 4 }}>
          <Text style={{ color: colors.brand, fontWeight: '700' }}>{section.heading}</Text>
          {section.rows.slice(0, 8).map((row, index) => (
            <Text key={`${section.heading}-${index}`} style={{ color: colors.ink }}>
              {row.map((cell) => cell.text).filter(Boolean).join(' · ')}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12, paddingBottom: 40 },
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
  grid: { flexWrap: 'wrap', gap: 10 },
  field: { minWidth: 160, flexGrow: 1, gap: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  primary: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  ghost: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  split: { gap: 12, alignItems: 'stretch' },
  tr: { flexDirection: 'row', minWidth: 560 },
  th: { width: 140, fontSize: 12, paddingVertical: 6 },
  td: { width: 140, fontSize: 14, paddingVertical: 6 },
  calc: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  letter: { borderWidth: 1, borderRadius: 4, padding: 20, gap: 8, maxWidth: 720 },
  hist: { flexDirection: 'row', gap: 8, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center' },
});
