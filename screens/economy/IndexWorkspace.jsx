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
import { osloDate } from '../../src/indeksregulering/watch';

const STEPS = ['Avtale og vilkår', 'Beregning', 'Varselbrev', 'Lagre og send'];

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
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= 980;
  const cases = contract?.indexCases || [];
  const existing = cases.find((row) => row.id === caseId) || null;
  const [step, setStep] = useState(initialView === 'historikk' ? 0 : 1);
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
    setStep(2);
    setNote(`Korrigering av ${entry.number} er startet. Den forrige saken er uendret.`);
  }

  const chain = math?.chain;
  const points = bundle?.series?.[draft?.indexId]?.points || [];

  return (
    <ScrollView nativeID="index-workspace" contentContainerStyle={styles.page}>
      <View style={styles.top}>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: colors.brand, fontWeight: '700' }}>Tilbake til oversikten</Text>
        </TouchableOpacity>
        <Text style={{ color: colors.muted, fontSize: 12 }}>
          {[project?.number, contract?.title, contract?.oppdragId].filter(Boolean).join(' · ')}
        </Text>
      </View>
      <Text style={[styles.title, { color: colors.ink }]}>Indeksregulering</Text>
      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>{contract?.title}</Text>
        <Text style={{ color: colors.muted }}>
          {[contract?.buyer, draft?.standard, draft?.terms?.frequency, chain?.table ? `SSB ${chain.table}` : ''].filter(Boolean).join(' · ')}
        </Text>
        <Text style={{ color: math?.ok && !math.provisional ? (colors.success || '#16a34a') : (colors.warn || '#d97706') }}>
          {math?.ok ? (math.provisional ? 'Foreløpig beregning. Indeksen er ikke endelig.' : 'Grunnlaget er klart for kontroll.') : (math?.error || (working ? 'Henter indeks…' : 'Venter på grunnlag.'))}
        </Text>
      </View>

      <View style={styles.steps}>
        <TouchableOpacity onPress={() => setStep(0)} style={[styles.step, { borderColor: step === 0 ? colors.brand : colors.line }]}>
          <Text style={{ color: step === 0 ? colors.brand : colors.ink }}>Historikk</Text>
        </TouchableOpacity>
        {STEPS.map((label, index) => (
          <TouchableOpacity key={label} onPress={() => setStep(index + 1)} style={[styles.step, { borderColor: step === index + 1 ? colors.brand : colors.line }]}>
            <Text style={{ color: step === index + 1 ? colors.brand : colors.ink }}>{index + 1}. {label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {error ? <Text style={{ color: colors.danger || '#dc2626' }}>{error}</Text> : null}
      {note ? <Text style={{ color: colors.ink }}>{note}</Text> : null}

      {step === 0 ? (
        <History cases={cases} regulations={contract?.regulations || []} colors={colors} onOpen={(row) => { setEntry(row); setStep(4); }} />
      ) : null}

      {step === 1 ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Inngått indeks og tidligere reguleringer</Text>
          <IndexTable chain={chain} math={math} colors={colors} />
          {chain?.changedSeries ? (
            <TouchableOpacity onPress={() => setSeriesConfirmed((value) => !value)} style={styles.row}>
              <Text style={{ color: colors.ink, flex: 1 }}>
                Indeksserien er endret siden forrige sak. Bekreft at avklaringen er dokumentert før beregning.
              </Text>
              <Text style={{ color: colors.brand }}>{seriesConfirmed ? 'Bekreftet' : 'Bekreft'}</Text>
            </TouchableOpacity>
          ) : null}
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => setStep(2)} style={[styles.primary, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Gå til beregning</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {step === 2 ? (
        <View style={{ gap: 12 }}>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.h, { color: colors.ink }]}>Beregning</Text>
            <Text style={{ color: colors.muted }}>
              {math?.mode === 'opprinnelig'
                ? 'Avtalens modell bruker opprinnelig indeks som nevner.'
                : 'Ordinær regulering bruker forrige beregningsindeks, ikke den opprinnelige, når en sak allerede er godkjent.'}
            </Text>
            <CalcTable math={math} colors={colors} />
            <Text style={{ color: colors.muted, fontSize: 12 }}>Velg periode. Serien byttes ikke selv om en nyere tabell finnes.</Text>
            <ScrollView horizontal contentContainerStyle={styles.row}>
              {points.slice(-8).map((point) => (
                <TouchableOpacity key={point.period} onPress={() => setSelectedPeriod(point.period)} style={[styles.step, { borderColor: (selectedPeriod || math?.regulationPoint?.period) === point.period ? colors.brand : colors.line }]}>
                  <Text style={{ color: colors.ink }}>{periodLabel(point.period)} · {formatIndex(point.value)}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.h, { color: colors.ink }]}>Reguleringsperiode</Text>
            <View style={[styles.grid, { flexDirection: wide ? 'row' : 'column' }]}>
              <Field label="Referanseperiode fra" value={periodLabel(chain?.previous?.period)} colors={colors} />
              <Field label="Referanseperiode til" value={periodLabel(math?.regulationPoint?.period)} colors={colors} />
              <Field label="Reguleringsdato" value={dates.regulationDate} colors={colors} onChange={(value) => patchDate('regulationDate', value)} placeholder="ÅÅÅÅ-MM-DD" />
              <Field label="Varslingsdato" value={dates.noticeDate} colors={colors} onChange={(value) => patchDate('noticeDate', value)} placeholder="ÅÅÅÅ-MM-DD" />
              <Field label="Ny pris gjelder fra" value={dates.effectiveFrom} colors={colors} onChange={(value) => patchDate('effectiveFrom', value)} placeholder="ÅÅÅÅ-MM-DD" />
              <Field label="Perioden slutter" value={dates.effectiveTo} colors={colors} onChange={(value) => patchDate('effectiveTo', value)} placeholder="ÅÅÅÅ-MM-DD" />
              <Field label="Varslingsfrist, dager" value={dates.noticeDays} colors={colors} onChange={(value) => patchDate('noticeDays', value)} />
            </View>
            {(math?.warnings || []).map((line) => <Text key={line} style={{ color: colors.muted }}>{line}</Text>)}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => setStep(3)} style={[styles.primary, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Gå til varselbrev</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {step === 3 ? (
        <View style={{ gap: 12 }}>
          <CompanyLogoChoice value={useLogo} onChange={setUseLogo} logo={logo} colors={colors} subject="indeksbrevet" />
          <Field label="Fritekst i brevet" value={freeText} colors={colors} onChange={setFreeText} placeholder="Valgfri presisering" />
          {letter ? <LetterPreview letter={letter} colors={colors} /> : <Text style={{ color: colors.muted }}>{math?.error || 'Brevet kan ikke vises ennå.'}</Text>}
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => download('pdf')} style={[styles.ghost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => download('docx')} style={[styles.ghost, { borderColor: colors.line }]}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Word</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setStep(4)} style={[styles.primary, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>Lagre og send</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {step === 4 ? (
        <View style={[styles.split, { flexDirection: wide ? 'row' : 'column' }]}>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, flex: 1 }]}>
            <Text style={[styles.h, { color: colors.ink }]}>Kontroll</Text>
            {(checks.length ? checks : ['Klar for godkjenning når brevet er generert og datoene er satt.']).map((line) => (
              <Text key={line} style={{ color: checks.length ? (colors.danger || '#dc2626') : (colors.success || '#16a34a') }}>{line}</Text>
            ))}
            <Text style={{ color: colors.muted }}>
              Sak {entry?.number || 'opprettes ved lagring'} · {CASE_STATUS_LABEL[entry?.status] || 'Ikke lagret'} · e-post {entry?.mailStatus || 'ikke sendt'}
            </Text>
            <View style={styles.actions}>
              <TouchableOpacity onPress={storeDraft} disabled={working} style={[styles.ghost, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>Lagre som utkast</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => approve(false)} disabled={working} style={[styles.ghost, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>Godkjenn uten utsending</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => download('pdf')} style={[styles.ghost, { borderColor: colors.line }]}>
                <Text style={{ color: colors.ink, fontWeight: '700' }}>Last ned</Text>
              </TouchableOpacity>
              {entry ? (
                <TouchableOpacity onPress={correct} style={[styles.ghost, { borderColor: colors.line }]}>
                  <Text style={{ color: colors.ink, fontWeight: '700' }}>Ny korrigering</Text>
                </TouchableOpacity>
              ) : null}
              {entry && entry.status !== 'sendt' ? (
                <TouchableOpacity onPress={async () => {
                  const pulled = withdrawCase(entry, actor);
                  if (!pulled.ok) setError(pulled.error);
                  else await persist(pulled.case, false);
                }} style={[styles.ghost, { borderColor: colors.line }]}>
                  <Text style={{ color: colors.ink }}>Trekk utkast</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card, flex: 1 }]}>
            <Text style={[styles.h, { color: colors.ink }]}>E-post</Text>
            <Field label="Mottaker" value={to} colors={colors} onChange={setTo} />
            <Field label="Kopi" value={cc} colors={colors} onChange={setCc} placeholder="flere adresser skilles med komma" />
            <Field label="Emne" value={subject} colors={colors} onChange={setSubject} placeholder="Settes fra perioden hvis feltet er tomt" />
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              Avsender er bedriftens e-postoppsett. Ingenting sendes før du trykker send.
            </Text>
            <TouchableOpacity onPress={() => approve(true)} disabled={working} style={[styles.primary, { backgroundColor: colors.brand, opacity: working ? 0.6 : 1 }]}>
              <Text style={{ color: '#fff', fontWeight: '700' }}>{working ? 'Jobber…' : 'Godkjenn og send til kunde'}</Text>
            </TouchableOpacity>
            {entry?.mail?.sentAt ? (
              <Text style={{ color: colors.ink }}>
                Sendt {entry.mail.sentAt} av {entry.mail.sentBy || '–'} til {entry.mail.to}. Dokumentversjon {entry.mail.documentVersion || entry.documentVersion || '–'}.
              </Text>
            ) : null}
            {entry?.mail?.error ? <Text style={{ color: colors.danger || '#dc2626' }}>{entry.mail.error}</Text> : null}
            {(entry?.documents || []).map((doc) => (
              <Text key={doc.id} style={{ color: colors.muted }}>Versjon {doc.version} · {doc.createdAt} · {doc.createdBy}</Text>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

function IndexTable({ chain, math, colors }) {
  const rows = [
    ['Avtale inngått', chain?.original?.label, chain?.original ? formatIndex(chain.original.value) : '–', chain?.originalPrice ? formatKr(chain.originalPrice) : '–'],
    ['Sist gjennomført', chain?.previous && chain.previous !== chain?.original ? chain.previous.label : '–', chain?.previous && chain.previous !== chain?.original ? formatIndex(chain.previous.value) : '–', chain?.previousPrice && chain.previous !== chain?.original ? formatKr(chain.previousPrice) : '–'],
    ['Ny indeks', math?.regulationPoint?.label || chain?.next?.label || 'Ikke publisert', math?.regulationPoint ? formatIndex(math.regulationPoint.value) : '–', math?.ok ? formatKr(math.regulated) : 'Beregnes'],
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
    <View style={[styles.letter, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Text style={{ color: colors.ink, fontWeight: '700' }}>{notice.logo ? '' : notice.brand}</Text>
      <Text style={{ color: colors.ink, fontSize: 18, fontWeight: '700' }}>{notice.title}</Text>
      <Text style={{ color: colors.ink, lineHeight: 20 }}>{notice.intro}</Text>
      {notice.sections.slice(0, 3).map((section) => (
        <View key={section.heading} style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>{section.heading}</Text>
          {section.rows.slice(0, 6).map((row, index) => (
            <Text key={`${section.heading}-${index}`} style={{ color: colors.ink }}>
              {row.map((cell) => cell.text).filter(Boolean).join(' · ')}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function History({ cases, regulations, colors, onOpen }) {
  const rows = cases.length ? cases : regulations;
  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Text style={[styles.h, { color: colors.ink }]}>Reguleringssaker</Text>
      {!rows.length ? <Text style={{ color: colors.muted }}>Ingen saker er lagret.</Text> : null}
      {rows.map((row) => (
        <TouchableOpacity key={row.id} onPress={() => onOpen(row)} style={styles.hist}>
          <Text style={{ color: colors.ink, fontWeight: '700', flex: 1 }}>{row.number || row.id}</Text>
          <Text style={{ color: colors.muted }}>{CASE_STATUS_LABEL[row.status] || (row.sentAt ? 'Sendt' : 'Lagret')}</Text>
          <Text style={{ color: colors.ink }}>{row.newPrice ? formatKr(row.newPrice) : formatKr(row.after)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 12, padding: 16, paddingBottom: 40 },
  top: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 24, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  h: { fontSize: 16, fontWeight: '700' },
  steps: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  step: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  grid: { flexWrap: 'wrap', gap: 10 },
  field: { minWidth: 160, flexGrow: 1, gap: 4 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 8 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  primary: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  ghost: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  split: { gap: 12, alignItems: 'stretch' },
  tr: { flexDirection: 'row', minWidth: 560 },
  th: { width: 150, fontSize: 12, paddingVertical: 6 },
  td: { width: 150, fontSize: 14, paddingVertical: 6 },
  calc: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  letter: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 8 },
  hist: { flexDirection: 'row', gap: 8, paddingVertical: 8 },
});
