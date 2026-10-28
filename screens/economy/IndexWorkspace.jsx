import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { BREAKPOINTS } from '../../src/ui/layout.js';
import CompanyLogoChoice from '../../components/CompanyLogoChoice';
import OptionPicker from '../../components/OptionPicker';
import { confirmUser } from '../../src/utils/dialog';
import { companyLogoOf } from '../../src/project/companyLogo';
import {
  allowedFrom,
  applyPriceVersion,
  approveCase,
  attachLetter,
  beginSend,
  canDeleteCase,
  caseFromCalculation,
  caseIsLocked,
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
import {
  applyLetterEdits,
  buildLetter,
  formatIndex,
  formatPercent,
  letterEditsFrom,
  letterFieldRows,
  letterFieldWide,
  letterFromRecord,
} from '../../src/indeksregulering/letter';
import { indexLetterMessage, pdfAttachmentFromBytes } from '../../src/indeksregulering/mail';
import { sendIndexLetter } from '../../src/indeksregulering/mailClient';
import { buildPdf, downloadBytes } from '../../src/indeksregulering/office';
import { fetchSeriesById } from '../../src/indeksregulering/ssb';
import { frequencyLabel } from '../../src/indeksregulering/settings';
import { osloDate } from '../../src/indeksregulering/watch';
import EconomyIndices from './EconomyIndices';

const NAV = [
  { id: 'oversikt', label: 'Oversikt' },
  { id: 'beregning', label: 'Beregning' },
  { id: 'brev', label: 'Varselbrev' },
  { id: 'historikk', label: 'Historikk' },
  { id: 'indekser', label: 'Indekser' },
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
  contracts = [],
  onClose,
  onSave,
  onDelete,
  onOpenProject,
}) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const wide = width >= BREAKPOINTS.desktop;
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
  const [calculated, setCalculated] = useState(false);
  const [sendPdf, setSendPdf] = useState(null);
  const [letterEdits, setLetterEdits] = useState(() => existing?.letterEdits || {});
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
  const pdfStamp = useRef('');
  const pdfCache = useRef({ key: '', file: null });
  useEffect(() => {
    setScreen(screenFromView(initialView));
    setCalculated(false);
    setSendPdf(null);
    pdfStamp.current = '';
  }, [contract?.id, initialView]);

  useEffect(() => {
    setLetterEdits(entry?.letterEdits || {});
  }, [entry?.id]);

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
      const base = buildLetter(activeDraft, math, options);
      return { letter: applyLetterEdits(base, letterEdits), base, result: math, stored: false };
    }
    const stored = letterFromRecord(activeDraft || {}, recordForLetter(contract, entry), options);
    return stored
      ? { letter: stored.letter, base: stored.letter, result: stored.result, stored: true }
      : { letter: null, base: null, result: null, stored: false };
  }, [math, activeDraft, logo, useLogo, contract, entry, letterEdits]);
  const letter = letterPack.letter;
  const letterResult = letterPack.result;
  useEffect(() => {
    if (!sendPdf) return;
    if (sendPdf.caseId !== entry?.id) {
      pdfStamp.current = '';
      setSendPdf(null);
      return;
    }
    // Et ferdigstilt brev er låst. Ny beregning etter godkjenningen endrer ikke PDF-en som skal sendes.
    if (caseIsLocked(entry) || !pdfStamp.current || !letter?.plain) return;
    if (pdfStamp.current !== letter.plain) {
      pdfStamp.current = '';
      setSendPdf(null);
      setNote('Brevet er endret. Ferdigstill på nytt før utsending.');
    }
  }, [letter?.plain, sendPdf, entry?.id, entry?.status]);

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
    const attached = attachLetter({ ...current, freeText, letterEdits }, letter, { ...math, draft: activeDraft }, actor);
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
    let current = caseIsLocked(base) ? base : withLetter(datePatch(base));
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
      if (!stored) return null;
      if (sendAfter) await deliver(stored);
      return stored;
    } finally {
      setWorking(false);
    }
  }

  function pdfFileFor(letterDoc) {
    if (!letterDoc) return null;
    try {
      const bytes = buildPdf(letterDoc);
      if (!bytes?.length) return null;
      return {
        kind: 'pdf',
        filename: `${letterDoc.filenameBase || 'indeksregulering'}.pdf`,
        mime: 'application/pdf',
        bytes,
      };
    } catch {
      return null;
    }
  }

  /** Samme brev gir samme fil, så forhåndsvisningen lastes ikke på nytt ved hver tegning. */
  function previewPdfFor(letterDoc) {
    if (!letterDoc?.notice) return null;
    const key = `${letterDoc.notice.logo ? 'logo' : ''}\n${letterDoc.plain}`;
    if (pdfCache.current.key !== key) pdfCache.current = { key, file: pdfFileFor(letterDoc) };
    return pdfCache.current.file;
  }

  async function producePdf() {
    if (!math?.ok || !letter || !letterResult || !Number.isFinite(Number(math.addition)) || Number(math.addition) === 0) {
      setError(math?.ok ? 'Indeksen er uendret, så det er ingen ny regulering å lage brev for.' : (math?.error || 'Brevet er ikke klart.'));
      return null;
    }
    const stored = await approve(false);
    if (!stored) return null;
    try {
      const file = previewPdfFor(letter);
      if (!file?.bytes?.length) {
        setError('PDF ble ikke produsert.');
        return null;
      }
      pdfStamp.current = letter.plain;
      setSendPdf({ ...file, caseId: stored.id });
      setFrozen((current) => (current?.id === stored.id ? { ...current, letter, plain: letter.plain } : current));
      setNote('Brevet er ferdigstilt, og PDF-en er klar som vedlegg. Ingenting er sendt.');
      return file;
    } catch (cause) {
      setError(cause?.message || 'PDF ble ikke produsert.');
      return null;
    }
  }

  /** Et brev som ble ferdigstilt tidligere, kan sendes senere med PDF bygget fra den lagrede saken. */
  function prepareStored(caseRow, letterDoc) {
    const file = previewPdfFor(letterDoc);
    if (!caseRow?.id || !file?.bytes?.length) {
      setError('PDF ble ikke produsert.');
      return;
    }
    setError('');
    setEntry(caseRow);
    pdfStamp.current = letterDoc.plain;
    setSendPdf({ ...file, caseId: caseRow.id });
    setNote('PDF-en er klar som vedlegg. Ingenting er sendt.');
  }

  function openCase(row) {
    setEntry(cases.find((item) => item.id === row.id) || row);
    setOpenLetterId(row.id);
    setScreen('brev');
  }

  async function deliver(current) {
    if (sending.current) return;
    const attachment = pdfAttachmentFromBytes(sendPdf);
    const stale = !caseIsLocked(current) && pdfStamp.current && letter?.plain && pdfStamp.current !== letter.plain;
    if (!attachment || sendPdf?.caseId !== current.id || stale) {
      setError('Ferdigstill brevet før det sendes.');
      return;
    }
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
        attachment,
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

  function runCalculation() {
    setCalculated(true);
    setError('');
    if (!math?.ok) {
      setError(math?.error || 'Ny indeks er ikke publisert.');
      return;
    }
    setNote('Beregningen er fylt inn til høyre. Ingenting er lagret eller sendt.');
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
    setEntry({ ...fresh, status: 'utkast', letterEdits });
    setSendPdf(null);
    pdfStamp.current = '';
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
        status: stored.status || 'utkast',
      });
      setOpenLetterId(stored.id);
      setScreen('brev');
      setNote(`Utkast ${stored.number} er lagret. Se over brevet, og trykk Ferdigstill eller Endre. Ingenting er sendt.`);
    } finally {
      setWorking(false);
    }
  }

  async function removeLetter(row) {
    if (!canDeleteCase(row)) {
      setError('Sendte brev kan ikke slettes.');
      return;
    }
    const priced = row.status === 'godkjent' || row.status === 'klar_til_utsending' || row.status === 'sendefeil';
    const ok = await confirmUser(
      'Slette brevet?',
      priced
        ? 'Brevet og den nye prisen det la inn, fjernes. Prisen går tilbake til forrige. Dette kan ikke angres.'
        : 'Brevet fjernes fra oversikten. Dette kan ikke angres.',
      { ok: 'Slett', cancel: 'Avbryt' },
    );
    if (!ok) return;
    setWorking(true);
    setError('');
    try {
      const stored = cases.some((item) => item.id === row.id)
        || (contract?.regulations || []).some((item) => item.id === row.id);
      if (stored) {
        const result = await onDelete?.(row.id);
        if (!result?.ok) {
          setError(result?.error || 'Kunne ikke slette brevet.');
          return;
        }
      }
      if (entry?.id === row.id) setEntry(null);
      if (frozen?.id === row.id) setFrozen(null);
      if (openLetterId === row.id) setOpenLetterId('');
      setSendPdf(null);
      pdfStamp.current = '';
      setNote('Brevet er slettet.');
    } finally {
      setWorking(false);
    }
  }

  const shared = {
    contract, project, draft, customer, company, colors, wide, chain, math, queue, history,
    dates, patchDate, points, selectedPeriod, setSelectedPeriod, freeText, setFreeText,
    to, setTo, recipientName, setRecipientName, cc, setCc, subject, setSubject, useLogo, setUseLogo, logo, letter, entry,
    checks, working, cases, onOpenProject, setScreen, storeDraft, approve, correct,
    screen, frozen, openLetterId, setOpenLetterId, setEntry, reviewCalculation, savedCase,
    calculated, runCalculation, producePdf, sendPdf, previewPdfFor, prepareStored, openCase,
    baseLetter: letterPack.base, letterEdits, setLetterEdits, removeLetter,
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
        {screen === 'historikk' ? <HistoryScreen {...shared} onOpenCase={openCase} /> : null}
        {screen === 'indekser' ? <EconomyIndices contracts={contracts.length ? contracts : [contract].filter(Boolean)} /> : null}
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
    contract, project, draft, colors, wide, chain, queue, setScreen, history, openCase,
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
                    <View style={styles.actions}>
                      <TouchableOpacity
                        onPress={() => openCase(row)}
                        accessibilityRole="button"
                        style={[styles.ghost, { borderColor: colors.line }]}
                      >
                        <Text style={{ color: colors.ink, fontWeight: '700' }}>Åpne brev</Text>
                      </TouchableOpacity>
                      <DeleteDraftButton row={row} onPress={props.removeLetter} colors={colors} />
                    </View>
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

function priceChanged(math) {
  const addition = Number(math?.addition);
  return !!(math?.ok && Number.isFinite(addition) && addition !== 0);
}

function FactTable({ rows, colors }) {
  return (
    <View nativeID="index-letter-facts" style={styles.factGrid}>
      {rows.map(([label, value]) => {
        const wide = letterFieldWide(label, value);
        return (
          <View key={label} style={[styles.factCell, wide ? styles.factCellWide : styles.factCellHalf]}>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
            <Text style={{ color: colors.ink, fontWeight: '700' }}>{value || '–'}</Text>
          </View>
        );
      })}
    </View>
  );
}

function DeleteDraftButton({ row, onPress, colors }) {
  if (!canDeleteCase(row)) return null;
  return (
    <TouchableOpacity onPress={() => onPress?.(row)} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
      <Text style={{ color: colors.danger || '#b42318', fontWeight: '700' }}>Slett</Text>
    </TouchableOpacity>
  );
}

function hourlyRows(math) {
  const rows = math?.rows || [];
  return rows.length > 0 && rows.every((row) => /time/i.test(`${row?.unit || ''} ${row?.text || ''}`));
}

/** Viser tydelig hva prisen går fra og til, rett før brevutkastet lages. */
function PriceChange({ math, dates, colors, working, onGenerate }) {
  const addition = Number(math?.addition) || 0;
  const sign = addition > 0 ? '+' : '';
  const kind = hourlyRows(math) ? 'Timepris' : 'Pris';
  const up = addition >= 0;
  const changeColor = up ? (colors.success || '#16a34a') : (colors.danger || '#b42318');
  const effective = pretty(dates?.effectiveFrom);
  return (
    <View nativeID="index-price-change" style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
      <Text style={[styles.h, { color: colors.ink }]}>Prisendring</Text>
      <View style={styles.changeRow}>
        <View style={styles.changeCell}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{`${kind} i dag`}</Text>
          <Text style={[styles.changeAmount, { color: colors.ink }]}>{formatKr(math?.baseSum)}</Text>
        </View>
        <Text style={[styles.changeArrow, { color: colors.muted }]}>→</Text>
        <View style={styles.changeCell}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{`Ny ${kind.toLowerCase()}`}</Text>
          <Text style={[styles.changeAmount, { color: colors.ink }]}>{formatKr(math?.regulated)}</Text>
        </View>
      </View>
      <View style={[styles.changeBadge, { backgroundColor: `${changeColor}14`, borderColor: changeColor }]}>
        <Text style={{ color: changeColor, fontWeight: '700', fontSize: 16 }}>
          {`${up ? 'Økning' : 'Reduksjon'} ${sign}${formatKr(addition)} (${sign}${formatPercent(math?.changePercent)})`}
        </Text>
      </View>
      <Text style={{ color: colors.muted }}>
        {[
          `Indeks ${formatIndex(math?.basisPoint?.value)} → ${formatIndex(math?.regulationPoint?.value)}`,
          effective ? `ny pris gjelder fra ${effective}` : 'dato for ny pris er ikke satt',
          'beløp eks. mva.',
        ].join(' · ')}
      </Text>
      <TouchableOpacity
        nativeID="index-generate-draft"
        onPress={onGenerate}
        disabled={working}
        accessibilityRole="button"
        style={[styles.primary, { backgroundColor: colors.brand, opacity: working ? 0.6 : 1 }]}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>{working ? 'Jobber…' : 'Generer brevutkast'}</Text>
      </TouchableOpacity>
      <Text style={{ color: colors.muted, fontSize: 12 }}>Lagrer et utkast og åpner varselbrevet som PDF. Ingenting sendes.</Text>
    </View>
  );
}

function Calculation(props) {
  const {
    colors, wide, chain, math, dates, patchDate, points, selectedPeriod, setSelectedPeriod,
    reviewCalculation, runCalculation, working, calculated, letter,
  } = props;
  const changed = calculated && priceChanged(math);
  const unchanged = calculated && !!math?.ok && !changed;
  const facts = letterFieldRows(math?.ok ? letter : null, { filled: !!(calculated && math?.ok) });
  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.split, styles.splitStart, { flexDirection: wide ? 'row' : 'column' }]}>
        <View style={{ flex: 1, gap: 12, minWidth: wide ? 280 : 0 }}>
          <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <Text style={[styles.h, { color: colors.ink }]}>1. Indeks og beregningsgrunnlag</Text>
            <IndexTable chain={chain} math={math} colors={colors} />
            <Text style={{ color: colors.muted, fontSize: 12 }}>Velg indeksperiode. Serien byttes ikke selv om en nyere tabell finnes.</Text>
            <OptionPicker
              options={points.slice(-6).map((point) => ({ id: point.period, label: `${periodLabel(point.period)} · ${formatIndex(point.value)}` }))}
              value={selectedPeriod || math?.regulationPoint?.period}
              onChange={(period) => { if (period) setSelectedPeriod(period); }}
              title="Indeksperiode"
              clearable={false}
            />
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
            nativeID="index-run-calculation"
            onPress={runCalculation}
            disabled={working}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: colors.brand, opacity: working ? 0.6 : 1 }]}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Foreta en ny beregning</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.muted }}>Knappen fyller ut feltene til høyre. Ingenting lagres.</Text>
          {changed ? <PriceChange math={math} dates={dates} colors={colors} working={working} onGenerate={reviewCalculation} /> : null}
          {unchanged ? (
            <View nativeID="index-price-change" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
              <Text style={[styles.h, { color: colors.ink }]}>Prisendring</Text>
              <Text style={{ color: colors.ink }}>{`Indeksen er uendret. Prisen blir fortsatt ${formatKr(math?.baseSum)}, så det lages ikke brev.`}</Text>
            </View>
          ) : null}
        </View>
        <View nativeID="index-calc-status" style={[styles.card, styles.factCard, { borderColor: colors.line, backgroundColor: colors.card, width: wide ? undefined : '100%' }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Status etter beregning</Text>
          {calculated && !math?.ok ? <Text style={{ color: colors.danger || '#b42318' }}>{math?.error || 'Ny indeks er ikke publisert.'}</Text> : null}
          <FactTable rows={facts} colors={colors} />
        </View>
      </View>
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
  if (savedCase && (entry?.status === 'godkjent' || entry?.status === 'klar_til_utsending')) {
    return { title: 'Ferdigstilt', detail: 'Brevet er låst, og ny pris er registrert på avtalen. Ingenting er sendt.', tone: 'done' };
  }
  if (savedCase) {
    return { title: 'Lagret som utkast', detail: 'Saken er opprettet og ligger i historikken. Ingenting er sendt.', tone: 'wait' };
  }
  if (frozen) {
    return { title: 'Opprettet til gjennomgang', detail: 'Beregningen er låst i listen. Den er verken lagret eller sendt.', tone: 'wait' };
  }
  return { title: 'Ingenting er opprettet', detail: 'Foreta beregning og ferdigstill brevet før noe sendes.', tone: 'done' };
}

function PdfPreview({ file, letter, colors }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    if (!file?.bytes || typeof URL === 'undefined' || typeof Blob === 'undefined' || typeof document === 'undefined') {
      setUrl('');
      return undefined;
    }
    const next = URL.createObjectURL(new Blob([file.bytes], { type: 'application/pdf' }));
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file?.bytes]);
  if (!file && !letter?.notice) {
    return (
      <Text nativeID="index-pdf-preview" style={{ color: colors.muted }}>
        Ingen forhåndsvisning ennå. Gå til Beregning, foreta en ny beregning og trykk Generer brevutkast.
      </Text>
    );
  }
  return (
    <View nativeID="index-pdf-preview" style={{ gap: 8, flex: 1, minWidth: 0, width: '100%' }}>
      {url ? React.createElement('iframe', {
        src: url,
        title: file.filename || 'Varselbrev',
        style: { width: '100%', height: 820, border: '1px solid #E6EBF2', borderRadius: 4, backgroundColor: '#fff' },
      }) : null}
      {!url && letter?.notice ? <LetterPreview letter={letter} colors={colors} /> : null}
      {!url && !letter?.notice ? <Text style={{ color: colors.ink }}>{file.filename}</Text> : null}
    </View>
  );
}

/** Alle felt i brevet kan rettes. Endringene brukes først når de bekreftes. */
function LetterEditor({ baseLetter, letterEdits, useLogo, logo, freeText, dates, colors, onApply, onCancel }) {
  const fields = letterFieldRows(baseLetter);
  const startValues = () => Object.fromEntries(fields.map(([key, value]) => [key, letterEdits?.[key] ?? value]));
  const [values, setValues] = useState(startValues);
  const [logoOn, setLogoOn] = useState(useLogo);
  const [extra, setExtra] = useState(freeText || '');
  const [effectiveFrom, setEffectiveFrom] = useState(dates.effectiveFrom || '');
  const [noticeDate, setNoticeDate] = useState(dates.noticeDate || '');

  function reset() {
    setValues(Object.fromEntries(fields.map(([key, value]) => [key, value])));
  }

  const buttons = (top) => (
    <View style={styles.actions}>
      <TouchableOpacity
        nativeID={top ? 'index-apply-letter-edits' : undefined}
        onPress={() => onApply({ values, useLogo: logoOn, freeText: extra, effectiveFrom, noticeDate })}
        accessibilityRole="button"
        style={[styles.primary, { backgroundColor: colors.brand }]}
      >
        <Text style={{ color: '#fff', fontWeight: '700' }}>Bruk endringene</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onCancel} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
        <Text style={{ color: colors.ink, fontWeight: '700' }}>Avbryt</Text>
      </TouchableOpacity>
      {top ? null : (
        <TouchableOpacity onPress={reset} accessibilityRole="button" style={[styles.ghost, { borderColor: colors.line }]}>
          <Text style={{ color: colors.ink, fontWeight: '700' }}>Tilbakestill alle felt</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View nativeID="index-letter-editor" style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card, width: '100%' }]}>
      <Text style={[styles.h, { color: colors.ink }]}>Endre brevet</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Endringene gjelder teksten i brevet. Beregnet pris og indeks i saken endres ikke.
      </Text>
      {buttons(true)}
      <CompanyLogoChoice value={logoOn} onChange={setLogoOn} logo={logo} colors={colors} subject="indeksbrevet" />
      <View style={styles.grid}>
        <Field label="Ny pris gjelder fra" value={effectiveFrom} colors={colors} onChange={setEffectiveFrom} placeholder="ÅÅÅÅ-MM-DD" />
        <Field label="Varslingsdato" value={noticeDate} colors={colors} onChange={setNoticeDate} placeholder="ÅÅÅÅ-MM-DD" />
      </View>
      <Field label="Ekstra merknad i brevet" value={extra} colors={colors} onChange={setExtra} placeholder="Valgfri presisering" compact />
      <View style={styles.factGrid}>
        {fields.map(([key, base]) => {
          const value = values[key] ?? '';
          const long = letterFieldWide(key, value || base);
          const touched = value.replace(/\s+/g, ' ').trim() !== base;
          return (
            <View key={key} style={[styles.factCell, long ? styles.factCellWide : styles.factCellHalf]}>
              <Text style={{ color: touched ? colors.brand : colors.muted, fontSize: 12, fontWeight: touched ? '700' : '400' }}>
                {touched ? `${key} · endret` : key}
              </Text>
              <TextInput
                value={value}
                onChangeText={(text) => setValues((current) => ({ ...current, [key]: text }))}
                multiline={long}
                placeholderTextColor={colors.placeholder}
                style={[styles.input, long && styles.inputLong, { color: colors.ink, borderColor: touched ? colors.brand : colors.line, backgroundColor: colors.bg }]}
              />
            </View>
          );
        })}
      </View>
      {buttons(false)}
    </View>
  );
}

function LetterScreen(props) {
  const {
    colors, wide, letter, baseLetter, math, freeText, setFreeText, useLogo, setUseLogo, logo,
    to, setTo, recipientName, setRecipientName, cc, setCc, subject, setSubject,
    entry, working, storeDraft, approve, correct, letterEdits, setLetterEdits,
    history, frozen, openLetterId, setOpenLetterId, savedCase, draft,
    dates, patchDate, calculated, producePdf, sendPdf, previewPdfFor, prepareStored, cases,
    removeLetter,
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
  const storedLetter = selected && !selected.live
    ? (letterFromRecord(draft || {}, selected, { logo, includeLogo: useLogo })?.letter || null)
    : null;
  const liveReady = priceChanged(math) && !!(calculated || selected?.live) && !!letter?.notice;
  const liveLetter = !storedLetter && liveReady ? letter : null;
  const shownLetter = storedLetter || liveLetter || (selected?.live ? selected.letter : null);
  const storedCase = storedLetter ? (cases || []).find((row) => row.id === selected.id) || null : null;
  const sent = entry?.status === 'sendt' || entry?.mailStatus === 'sendt';
  const locked = caseIsLocked(entry);
  const ready = !!sendPdf && sendPdf.caseId === entry?.id && (!storedLetter || storedCase?.id === entry?.id);
  const shownPdf = !storedLetter && ready ? sendPdf : previewPdfFor(shownLetter);
  const storedSendable = !!storedCase && caseIsLocked(storedCase) && !wasSent(storedCase);
  const canEdit = !!liveLetter && !locked && !sent && !working;
  const canFinish = !editing && !working && !ready && (storedLetter ? storedSendable : (!!liveLetter && !sent));
  const lead = previewLead({ storedLetter, storedSendable, shownLetter, ready, editing, locked, sent });

  function chooseRow(row) {
    setOpenLetterId(openLetterId === row.id ? '' : row.id);
    setEditing(false);
  }

  function downloadShown() {
    if (!shownPdf?.bytes) return;
    downloadBytes(shownPdf.filename, shownPdf.bytes, shownPdf.mime || 'application/pdf');
  }

  async function finish() {
    if (!locked) {
      const ok = await confirmUser(
        'Ferdigstille brevet?',
        'Brevet låses, og den nye prisen registreres på avtalen. Ingenting sendes før du trykker Send varsel.',
        { ok: 'Ferdigstill', cancel: 'Avbryt' },
      );
      if (!ok) return;
    }
    await producePdf();
  }

  function applyEdits(next) {
    setLetterEdits(letterEditsFrom(baseLetter, next.values));
    setUseLogo(next.useLogo);
    setFreeText(next.freeText);
    if (next.effectiveFrom !== dates.effectiveFrom) patchDate('effectiveFrom', next.effectiveFrom);
    if (next.noticeDate !== dates.noticeDate) patchDate('noticeDate', next.noticeDate);
    setEditing(false);
  }

  return (
    <View style={{ gap: 8 }}>
      {!rows.length ? <Text style={{ color: colors.muted }}>Ingen brev er generert ennå.</Text> : null}
      {rows.map((row) => {
        const on = openLetterId === row.id;
        return (
          <View key={row.id} style={[styles.hist, { backgroundColor: on ? (colors.brandSoft || '#E8F6FE') : 'transparent' }]}>
            <TouchableOpacity onPress={() => chooseRow(row)} accessibilityRole="button" style={{ flex: 1, flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Text style={{ color: colors.ink, fontWeight: '700', width: 96 }}>{row.date}</Text>
              <Text style={{ color: colors.ink, flex: 1 }}>{`${row.fromPrice || '–'} → ${row.price || '–'}`}</Text>
              <Text style={{ color: colors.brand, fontWeight: '700' }}>{row.statusLabel}</Text>
            </TouchableOpacity>
            <DeleteDraftButton row={row} onPress={removeLetter} colors={colors} />
          </View>
        );
      })}
      <View style={[styles.split, styles.splitStart, { flexDirection: wide ? 'row' : 'column' }]}>
        {editing && baseLetter?.notice ? (
          <View style={{ flex: 1, minWidth: wide ? 320 : 0, width: wide ? undefined : '100%' }}>
            <LetterEditor
              baseLetter={baseLetter}
              letterEdits={letterEdits}
              useLogo={useLogo}
              logo={logo}
              freeText={freeText}
              dates={dates}
              colors={colors}
              onApply={applyEdits}
              onCancel={() => setEditing(false)}
            />
          </View>
        ) : null}
        <View style={[{ flex: 1.3, gap: 8, minWidth: wide ? 320 : 0, width: wide ? undefined : '100%' }, editing && wide && styles.sticky]}>
          <View nativeID="index-letter-actions" style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
            <View style={[styles.toolbar, { flexWrap: 'wrap' }]}>
              <View style={{ flex: 1, minWidth: 220, gap: 2 }}>
                <Text style={[styles.h, { color: colors.ink }]}>Forhåndsvisning av varselbrevet</Text>
                <Text style={{ color: colors.muted }}>{lead}</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity
                  nativeID="index-finish-letter"
                  onPress={storedLetter ? () => prepareStored(storedCase, storedLetter) : finish}
                  disabled={!canFinish}
                  accessibilityRole="button"
                  style={[styles.primary, { backgroundColor: canFinish ? colors.brand : colors.line, opacity: canFinish ? 1 : 0.55 }]}
                >
                  <Text style={{ color: canFinish ? '#fff' : colors.ink, fontWeight: '700' }}>
                    {working ? 'Jobber…' : (storedSendable ? 'Klargjør for sending' : 'Ferdigstill')}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  nativeID="index-edit-letter"
                  onPress={() => setEditing(true)}
                  disabled={!canEdit || editing}
                  accessibilityRole="button"
                  style={[styles.ghost, { borderColor: colors.line, opacity: canEdit && !editing ? 1 : 0.55 }]}
                >
                  <Text style={{ color: colors.ink, fontWeight: '700' }}>Endre</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={downloadShown}
                  disabled={!shownPdf}
                  accessibilityRole="button"
                  style={[styles.ghost, { borderColor: colors.line, opacity: shownPdf ? 1 : 0.55 }]}
                >
                  <Text style={{ color: colors.ink, fontWeight: '700' }}>Last ned PDF</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          <PdfPreview file={shownPdf} letter={shownLetter} colors={colors} />
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
          <TouchableOpacity
            onPress={storeDraft}
            disabled={working || locked || sent}
            accessibilityRole="button"
            style={[styles.ghost, { borderColor: colors.line, opacity: working || locked || sent ? 0.55 : 1 }]}
          >
            <Text style={{ color: colors.ink, fontWeight: '700' }}>Lagre som utkast</Text>
          </TouchableOpacity>
          <TouchableOpacity
            nativeID="index-send-letter"
            onPress={() => approve(true)}
            disabled={working || !ready || sent}
            accessibilityRole="button"
            style={[styles.primary, { backgroundColor: ready && !sent ? colors.brand : colors.line, opacity: working || !ready || sent ? 0.55 : 1 }]}
          >
            <Text style={{ color: ready && !sent ? '#fff' : colors.ink, fontWeight: '700' }}>{working ? 'Jobber…' : 'Send varsel'}</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {ready ? 'PDF-en legges ved e-posten.' : 'Ferdigstill brevet før det kan sendes.'}
          </Text>
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

function wasSent(row) {
  return row?.status === 'sendt' || row?.mailStatus === 'sendt' || !!row?.sentAt;
}

function previewLead({ storedLetter, storedSendable, shownLetter, ready, editing, locked, sent }) {
  if (storedLetter && ready) return 'Brevet er ferdigstilt. PDF-en legges ved når du sender varselet.';
  if (storedLetter && storedSendable) return 'Brevet er ferdigstilt, men ikke sendt. Trykk Klargjør for sending for å legge PDF-en ved e-posten.';
  if (storedLetter) return 'Viser et lagret brev. Det kan lastes ned. Velg raden igjen for å lukke det.';
  if (!shownLetter) return 'Brevet vises her når beregningen er gjort og utkastet er generert.';
  if (sent) return 'Brevet er sendt og kan ikke endres.';
  if (ready) return 'Brevet er ferdigstilt. PDF-en legges ved når du sender varselet.';
  if (editing) return 'Rett feltene og trykk Bruk endringene. Forhåndsvisningen oppdateres.';
  if (locked) return 'Brevet er ferdigstilt. Åpne det fra Historikk for å klargjøre det for sending.';
  return 'Liker du brevet, trykk Ferdigstill. Vil du rette noe, trykk Endre.';
}

function HistoryScreen({ history, colors, wide, onOpenCase, contract, removeLetter }) {
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
            <DeleteDraftButton row={selected} onPress={removeLetter} colors={colors} />
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
    <View nativeID="index-letter-preview" style={[styles.letter, { borderColor: colors.line, backgroundColor: colors.card }]}>
      {notice.logo?.dataUrl ? (
        <Image
          source={{ uri: notice.logo.dataUrl }}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Bedriftens logo"
        />
      ) : (
        <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 18, alignSelf: 'flex-end' }}>{notice.brand}</Text>
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
  inputLong: { minHeight: 64, textAlignVertical: 'top' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  primary: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  ghost: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  split: { gap: 12, alignItems: 'stretch' },
  splitStart: { alignItems: 'flex-start' },
  sticky: Platform.OS === 'web' ? { position: 'sticky', top: 0 } : {},
  banner: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  bannerTitle: { fontSize: 22, fontWeight: '700' },
  fieldCompact: { flexGrow: 0, minWidth: 0, width: '100%' },
  factCard: { flexGrow: 1, flexShrink: 1, flexBasis: 460, minWidth: 340, alignSelf: 'flex-start' },
  factGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', width: '100%', gap: 8 },
  factCell: { gap: 2, paddingVertical: 4 },
  factCellHalf: { width: '48%', flexGrow: 1, flexBasis: '48%' },
  factCellWide: { width: '100%', flexBasis: '100%' },
  changeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 12 },
  changeCell: { gap: 2 },
  changeAmount: { fontSize: 22, fontWeight: '700' },
  changeArrow: { fontSize: 22, paddingBottom: 2 },
  changeBadge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  modalBackdrop: {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(21, 32, 51, 0.45)',
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: { width: '100%', maxWidth: 760, maxHeight: '90%', borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  tr: { flexDirection: 'row', minWidth: 560 },
  th: { width: 140, fontSize: 12, paddingVertical: 6 },
  td: { width: 140, fontSize: 14, paddingVertical: 6 },
  calc: { flexDirection: 'row', gap: 12, paddingVertical: 4 },
  letter: { borderWidth: 1, borderRadius: 4, padding: 20, gap: 8, width: '100%' },
  logo: { width: 180, height: 52, alignSelf: 'flex-end' },
  hist: { flexDirection: 'row', gap: 8, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 8, alignItems: 'center' },
});
