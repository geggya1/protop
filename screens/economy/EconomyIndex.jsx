import React, { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { calculate, emptyLine, parseAmount, periodLabel } from '../../src/indeksregulering/engine';
import { buildLetter, formatIndex, formatMoney, formatPercent } from '../../src/indeksregulering/letter';
import { downloadBytes, exportFiles } from '../../src/indeksregulering/office';
import { regulationCells, regulationEntry, rememberRegulation } from '../../src/indeksregulering/regulationLog';
import { fetchSeriesById } from '../../src/indeksregulering/ssb';
import { seriesById } from '../../src/indeksregulering/catalog';
import { draftFromRegisteredContract, knownIndexFacts, missingIndexFields } from '../../src/economy/fromContract';
import { companyLogoOf } from '../../src/project/companyLogo';
import CompanyLogoChoice from '../../components/CompanyLogoChoice';

function Fact({ label, value, colors }) {
  if (!value) return null;
  return (
    <View style={styles.fact}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.ink }]}>{value}</Text>
    </View>
  );
}

function LetterView({ notice, colors }) {
  if (!notice) return null;
  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      {notice.logo?.dataUrl ? (
        <Image
          source={{ uri: notice.logo.dataUrl }}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="Bedriftens logo"
        />
      ) : null}
      <Text style={[styles.h, { color: colors.ink }]}>{notice.brand}</Text>
      <Text style={[styles.h, { color: colors.ink }]}>{notice.title}</Text>
      <Text selectable style={{ color: colors.ink, lineHeight: 20 }}>{notice.intro}</Text>
      {notice.sections.map((section, sectionIndex) => (
        <View key={`${section.heading}-${sectionIndex}`} style={{ gap: 6 }}>
          <Text style={[styles.h, { color: colors.ink }]}>{section.heading}</Text>
          {section.lead ? <Text style={{ color: colors.ink }}>{section.lead}</Text> : null}
          {section.rows.map((row, index) => (
            <View key={`${section.heading}-${index}`} style={[styles.gridRow, { borderColor: colors.line }]}>
              {row.map((item, cellIndex) => (
                <Text
                  key={`${section.heading}-${index}-${cellIndex}`}
                  style={{ color: colors.ink, flex: item.span || 1, fontWeight: item.label ? '500' : '400', padding: 6 }}
                >
                  {item.text}
                </Text>
              ))}
            </View>
          ))}
        </View>
      ))}
      {notice.notes.map((line) => <Text key={line} style={{ color: colors.ink }}>{line}</Text>)}
      <Text style={[styles.h, { color: colors.ink }]}>Med vennlig hilsen</Text>
      {notice.signoff.place ? <Text style={{ color: colors.ink }}>Sted: {notice.signoff.place}</Text> : null}
      <Text style={{ color: colors.ink }}>Dato: {notice.signoff.date}</Text>
      <Text style={{ color: colors.muted }}>Underskrift</Text>
      {notice.signoff.name ? <Text style={{ color: colors.ink }}>{notice.signoff.name}</Text> : null}
      <Text style={{ color: colors.ink }}>{notice.signoff.company}</Text>
    </View>
  );
}

function RegulationCard({ entry, colors, open, onToggle }) {
  const cells = regulationCells(entry);
  const brief = cells.filter((cell) => cell.label !== 'Brev' && cell.label !== 'Spørring');
  const letterCell = cells.find((cell) => cell.label === 'Brev');
  const queryCell = cells.find((cell) => cell.label === 'Spørring');
  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <View style={styles.grid}>
        {brief.map((cell) => (
          <Fact key={`${entry.id}-${cell.label}`} label={cell.label} value={cell.value} colors={colors} />
        ))}
      </View>
      <Fact label="Brev" value={letterCell?.value} colors={colors} />
      <Fact label="Spørring" value={queryCell?.value} colors={colors} />
      {entry.letterPlain ? (
        <TouchableOpacity onPress={onToggle} accessibilityRole="button">
          <Text style={{ color: colors.brand }}>{open ? 'Skjul lagret brev' : 'Vis lagret brev'}</Text>
        </TouchableOpacity>
      ) : null}
      {open ? (
        <Text selectable style={{ color: colors.ink, lineHeight: 20 }}>{entry.letterPlain}</Text>
      ) : null}
    </View>
  );
}

export default function EconomyIndex({
  contract,
  customer = null,
  company = null,
  project = null,
  onClose,
  onSaveRegulations,
}) {
  const colors = useColors();
  const companyLogo = companyLogoOf(company);
  const extras = { customer, company, projectNumber: project?.number || '' };
  const [draft, setDraft] = useState(() => draftFromRegisteredContract(contract, extras));
  const [useLogo, setUseLogo] = useState(true);
  const [bundle, setBundle] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [ownerId, setOwnerId] = useState(() => contract?.id || '');
  const [openLetterId, setOpenLetterId] = useState('');
  const [saveNote, setSaveNote] = useState('');

  useEffect(() => {
    setOwnerId(contract?.id || '');
    setDraft(draftFromRegisteredContract(contract, {
      customer,
      company,
      projectNumber: project?.number || '',
    }));
    setOpenLetterId('');
    setSaveNote('');
  }, [contract?.id, customer?.id, company?.organisasjonsnummer, company?.navn, project?.number]);

  const facts = useMemo(() => knownIndexFacts(draft), [draft]);
  const missing = useMemo(() => missingIndexFields(draft), [draft]);
  const series = bundle?.series?.[draft.indexId] || seriesById(draft.indexId);
  const latest = bundle?.series?.[draft.indexId]?.latest || null;
  const live = useMemo(() => {
    if (!bundle?.series || missing.length) return null;
    return calculate(draft, bundle.series);
  }, [draft, bundle, missing.length]);
  const letter = useMemo(
    () => (live?.ok ? buildLetter(draft, live, { logo: companyLogo, includeLogo: useLogo }) : null),
    [draft, live, companyLogo, useLogo],
  );
  const entry = useMemo(
    () => (live?.ok && letter ? regulationEntry(draft, live, letter) : null),
    [draft, live, letter],
  );
  const history = useMemo(() => {
    const stored = Array.isArray(contract?.regulations) ? contract.regulations : [];
    return entry && ownerId === contract?.id ? rememberRegulation(stored, entry) : stored;
  }, [contract?.regulations, contract?.id, entry, ownerId]);
  const seriesList = useMemo(() => {
    const fetched = bundle?.series?.[draft.indexId];
    const base = seriesById(draft.indexId);
    if (!fetched && !base) return [];
    return [{ ...(base || {}), ...(fetched || {}) }];
  }, [bundle, draft.indexId]);

  function patch(part) {
    setDraft((current) => {
      const next = { ...current, ...part };
      if (part.value != null) {
        const rate = String(part.value);
        next.lines = current.lines?.length
          ? current.lines.map((line, index) => (index === 0 ? { ...line, rate } : line))
          : [emptyLine({ text: 'Avtalt honorar', quantity: '1', unit: 'RS', rate })];
      }
      return next;
    });
  }

  async function loadIndex() {
    if (!draft.indexId) {
      setError('Avtalen har ikke en registrert indeksserie ennå.');
      return;
    }
    setWorking(true);
    setError('');
    setStatus(`Henter ${seriesById(draft.indexId)?.name || draft.indexId} fra SSB…`);
    try {
      const fetched = await fetchSeriesById(draft.indexId);
      setBundle(fetched);
      const point = fetched.series[draft.indexId]?.latest;
      setStatus(point
        ? `Siste gjeldende indeks er ${formatIndex(point.value)} for ${periodLabel(point.period)}.`
        : 'Serien er hentet, men har ingen publiserte punkt.');
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke hente indeksen.');
    } finally {
      setWorking(false);
    }
  }

  useEffect(() => {
    if (draft.indexId) loadIndex();
  }, [draft.indexId]);

  useEffect(() => {
    if (!entry || !contract?.id || ownerId !== contract.id || !onSaveRegulations) return undefined;
    const existing = contract.regulations || [];
    if (existing.some((row) => row.id === entry.id)) return undefined;
    let liveSave = true;
    setSaveNote('Brevet og beregningen er lagret på avtalen.');
    onSaveRegulations(contract.id, entry).then((result) => {
      if (!liveSave) return;
      if (result && result.ok === false) {
        setSaveNote('');
        setError(result.error || 'Kunne ikke lagre brevet.');
      }
    }).catch((cause) => {
      if (liveSave) setError(cause?.message || 'Kunne ikke lagre brevet.');
    });
    return () => { liveSave = false; };
  }, [entry, contract?.id, contract?.regulations, ownerId, onSaveRegulations]);

  function exportKind(kind) {
    if (!letter || !live?.ok) {
      setError(live?.error || 'Brevet er ikke klart.');
      return;
    }
    const file = exportFiles(draft, live, letter, seriesList).find((item) => item.kind === kind);
    try {
      downloadBytes(file.filename, file.bytes, file.mime);
      setStatus(`${file.filename} er lastet ned.`);
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke laste ned filen.');
    }
  }

  return (
    <View nativeID="economy-index" id="economy-index" style={styles.stack}>
      <TouchableOpacity onPress={onClose} accessibilityRole="button">
        <Text style={{ color: colors.brand }}>Tilbake til avtalen</Text>
      </TouchableOpacity>
      <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
        <Text style={[styles.h, { color: colors.ink }]}>{draft.title || 'Avtale'}</Text>
        <View style={styles.grid}>
          {facts.map((row) => (
            <Fact key={row.label} label={row.label} value={row.value} colors={colors} />
          ))}
        </View>
      </View>

      {latest ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
          <Text style={[styles.label, { color: colors.muted }]}>Siste gjeldende indeks</Text>
          <Text style={[styles.value, { color: colors.ink }]}>
            {series?.name || draft.indexId}: {formatIndex(latest.value)} · {periodLabel(latest.period)}
          </Text>
          {series?.table ? (
            <Text style={{ color: colors.muted }}>SSB-tabell {series.table}{series.codes?.length ? ` · ${series.codes.join(', ')}` : ''}</Text>
          ) : null}
        </View>
      ) : null}

      {missing.length ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.h, { color: colors.ink }]}>Påkrevd for beregningen</Text>
          {missing.map((row) => (
            <View key={row.id} style={{ gap: 4 }}>
              <Text style={[styles.label, { color: colors.muted }]}>{row.label}</Text>
              <Text style={{ color: colors.ink, fontSize: 13 }}>{row.hint}</Text>
              <TextInput
                value={draft[row.id] == null ? '' : String(draft[row.id])}
                onChangeText={(value) => patch({ [row.id]: value })}
                placeholder={row.suggest || ''}
                placeholderTextColor={colors.placeholder}
                style={[styles.input, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.bg }]}
              />
              {row.suggest ? (
                <TouchableOpacity onPress={() => patch({ [row.id]: row.suggest })} accessibilityRole="button">
                  <Text style={{ color: colors.brand }}>Bruk {row.suggest}</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {status ? <Text style={{ color: colors.ink }}>{status}</Text> : null}

      <View style={styles.row}>
        <TouchableOpacity
          onPress={loadIndex}
          disabled={working || !draft.indexId}
          accessibilityRole="button"
          style={[styles.btn, { backgroundColor: colors.brand, opacity: working || !draft.indexId ? 0.55 : 1 }]}
        >
          <Text style={{ color: '#fff' }}>{working ? 'Henter indeks…' : 'Hent siste indeks'}</Text>
        </TouchableOpacity>
      </View>

      {live?.ok ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
          <Text style={[styles.h, { color: colors.ink }]}>
            {live.addition < 0 ? 'Reduksjon' : 'Tillegg'} {formatMoney(live.addition)} kr
          </Text>
          <Text style={{ color: colors.ink }}>{live.model?.formula}</Text>
          <Text style={{ color: colors.muted }}>
            t0 {periodLabel(live.basisPoint.period)} = {formatIndex(live.basisPoint.value)}
            {' · '}
            t {periodLabel(live.regulationPoint.period)} = {formatIndex(live.regulationPoint.value)}
            {' · '}
            endring {formatPercent(live.changePercent)}
          </Text>
          {parseAmount(draft.lines?.[0]?.rate) != null ? (
            <Text style={{ color: colors.ink }}>
              Grunnlag {formatMoney(live.baseSum)} kr
            </Text>
          ) : null}
        </View>
      ) : live?.error ? (
        <Text style={{ color: colors.muted }}>{live.error}</Text>
      ) : null}

      {letter ? (
        <View style={{ gap: 8 }}>
          <Text style={[styles.h, { color: colors.ink }]}>Brev</Text>
          <CompanyLogoChoice
            value={useLogo}
            onChange={setUseLogo}
            logo={companyLogo}
            colors={colors}
            subject="indeksbrevet"
          />
          <Text style={{ color: colors.muted }}>
            Brevet er generert fra beregningen og lagres sammen med spørringen.
          </Text>
          {saveNote ? <Text style={{ color: colors.ink }}>{saveNote}</Text> : null}
          <View style={styles.row}>
            <TouchableOpacity onPress={() => exportKind('pdf')} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff' }}>PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => exportKind('docx')} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff' }}>Word</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => exportKind('xlsx')} accessibilityRole="button" style={[styles.btn, { backgroundColor: colors.brand }]}>
              <Text style={{ color: '#fff' }}>Excel</Text>
            </TouchableOpacity>
          </View>
          <LetterView notice={letter.notice} colors={colors} />
        </View>
      ) : null}

      {history.length ? (
        <View style={{ gap: 8 }}>
          <Text style={[styles.h, { color: colors.ink }]}>Reguleringer</Text>
          <Text style={{ color: colors.muted }}>
            Hver rad er før, etter, økning og indeksen fra og til, med brevet og spørringen som ble generert.
          </Text>
          {history.map((row) => (
            <RegulationCard
              key={row.id}
              entry={row}
              colors={colors}
              open={openLetterId === row.id}
              onToggle={() => setOpenLetterId((current) => (current === row.id ? '' : row.id))}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 12 },
  h: { fontSize: 18, fontWeight: '600' },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  fact: { minWidth: 160, flexGrow: 1, gap: 2 },
  label: { fontSize: 12 },
  value: { fontSize: 15, lineHeight: 20 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, fontSize: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  btn: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignSelf: 'flex-start' },
  gridRow: { flexDirection: 'row', flexWrap: 'wrap', borderBottomWidth: StyleSheet.hairlineWidth },
  logo: { width: 140, height: 48 },
});
