import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { useApp } from '../../src/context/AppContext';
import { INDEX_SERIES, MODELS, standardById } from '../../src/indeksregulering/catalog';
import { interpretAvtale } from '../../src/indeksregulering/aiClient';
import { calculate, emptyLine, periodLabel, todayIso } from '../../src/indeksregulering/engine';
import { extractContractText } from '../../src/indeksregulering/extractText';
import { interpretContract, mergeInterpretation } from '../../src/indeksregulering/interpret';
import { buildLetter, formatIndex, formatMoney, formatPercent } from '../../src/indeksregulering/letter';
import { downloadBytes, exportFiles } from '../../src/indeksregulering/office';
import { fetchAllIndices } from '../../src/indeksregulering/ssb';
import { loadCases, loadIndexCache, saveCases, saveIndexCache } from '../../src/indeksregulering/storage';
import { pickDocument } from '../../src/utils/media';

const STANDARDS = [
  ['NS 8407', 'NS 8407'],
  ['NS 8405', 'NS 8405'],
  ['NS 8406', 'NS 8406'],
  ['NS 8417', 'NS 8417'],
  ['NS 8415', 'NS 8415'],
  ['NS 8416', 'NS 8416'],
  ['husleieloven', 'Husleie'],
  ['bustadoppføringslova', 'Bustadoppføring'],
  ['håndverkertjenesteloven', 'Håndverk'],
  ['avtalt', 'Avtalt'],
];

function Field({ label, value, onChangeText, placeholder, colors, keyboardType, multiline }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      <TextInput
        value={value == null ? '' : String(value)}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.placeholder}
        keyboardType={keyboardType || 'default'}
        multiline={!!multiline}
        style={[styles.input, multiline && styles.inputMulti, { color: colors.ink, borderColor: colors.line, backgroundColor: colors.card }]}
      />
    </View>
  );
}

function Btn({ label, onPress, colors, tone = 'brand', disabled }) {
  const bg = tone === 'quiet' ? colors.sunken : colors.brand;
  const fg = tone === 'quiet' ? colors.ink : '#fff';
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.btn, { backgroundColor: bg, opacity: disabled ? 0.55 : 1 }]}
      accessibilityRole="button"
    >
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
    </TouchableOpacity>
  );
}

async function bytesFromFile(file) {
  let blob = file?.blob || null;
  if (!blob && file?.uri && typeof fetch === 'function') {
    const response = await fetch(file.uri);
    blob = await response.blob();
  }
  if (!blob || typeof blob.arrayBuffer !== 'function') {
    throw new Error('Kunne ikke lese filen.');
  }
  return new Uint8Array(await blob.arrayBuffer());
}

export default function IndeksreguleringPanel({ project }) {
  const colors = useColors();
  const { family } = useApp();
  const [draft, setDraft] = useState(() => ({
    title: project?.name || '',
    reference: project?.number || '',
    buyer: project?.client || '',
    supplier: '',
    standard: 'NS 8407',
    model: 'ns3405',
    indexId: 'bki-boligblokk',
    sharePercent: '100',
    vatPercent: '25',
    offerDate: '',
    tenderDeadline: '',
    regulationDate: todayIso(),
    noticeDate: todayIso(),
    regulationExcluded: false,
    overrideExclusion: false,
    lines: [emptyLine({ text: 'Kontraktssum', quantity: '1', unit: 'RS' })],
    periods: [],
    weights: [
      { indexId: 'bki-bustader-arbeid', weight: '50' },
      { indexId: 'bki-bustader-materialer', weight: '50' },
    ],
    findings: [],
    engine: '',
    sourceName: '',
  }));
  const [sourceText, setSourceText] = useState('');
  const [bundle, setBundle] = useState(null);
  const bundleRef = useRef(null);
  const [result, setResult] = useState(null);
  const [cases, setCases] = useState([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const supplier = family?.company?.navn || '';
    if (!supplier) return;
    setDraft((current) => (current.supplier ? current : { ...current, supplier }));
  }, [family?.company?.navn]);

  useEffect(() => {
    let live = true;
    Promise.all([loadIndexCache(), loadCases()]).then(([cache, stored]) => {
      if (!live) return;
      if (cache?.series) {
        bundleRef.current = cache;
        setBundle(cache);
      }
      setCases(stored);
    });
    return () => { live = false; };
  }, []);

  const letter = useMemo(
    () => (result?.ok ? buildLetter(draft, result) : null),
    [draft, result],
  );
  const seriesList = useMemo(() => (
    INDEX_SERIES.map((row) => ({ ...row, ...(bundle?.series?.[row.id] || {}) }))
  ), [bundle]);
  const visibleSeries = seriesList.filter((row) => {
    const q = query.trim().toLowerCase();
    if (q) return `${row.name} ${row.table} ${row.group}`.toLowerCase().includes(q);
    const group = seriesList.find((item) => item.id === draft.indexId)?.group || 'Bygg';
    return row.group === group;
  });
  const selected = seriesList.find((row) => row.id === draft.indexId) || null;

  function patch(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setResult(null);
  }

  function chooseStandard(id) {
    const rule = standardById(id);
    setDraft((current) => ({
      ...current,
      standard: id,
      model: rule.model,
      indexId: rule.indexId,
      vatPercent: rule.model === 'husleie' ? '0' : (current.vatPercent === '0' ? '25' : current.vatPercent),
    }));
    setResult(null);
  }

  function chooseModel(id) {
    setDraft((current) => ({
      ...current,
      model: id,
      indexId: id === 'husleie' ? 'kpi' : current.indexId,
      vatPercent: id === 'husleie' ? '0' : current.vatPercent,
    }));
    setResult(null);
  }

  function patchLine(id, key, value) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === id ? { ...line, [key]: value } : line)),
    }));
    setResult(null);
  }

  function preparedDraft(next) {
    return {
      ...next,
      supplier: next.supplier || draft.supplier,
      regulationDate: next.regulationDate || draft.regulationDate || todayIso(),
      noticeDate: draft.noticeDate || todayIso(),
      overrideExclusion: false,
      periods: draft.periods,
      weights: draft.weights,
      sourceName: draft.sourceName,
    };
  }

  async function regulatePrepared(prepared, note) {
    setDraft(prepared);
    setResult(null);
    if (note) setStatus(note);
    try {
      const cached = bundleRef.current;
      const data = cached?.series && Object.keys(cached.series).length
        ? cached
        : await refreshIndices();
      const calculated = calculate(prepared, data.series);
      setResult(calculated);
      if (!calculated.ok) setError(calculated.error);
      else setStatus('Avtalen er lest, indeksene er hentet og brevet er klart.');
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke hente indeksene.');
    }
  }

  async function readAgreement() {
    setError('');
    let text = sourceText.trim();
    if (text.length < 20) {
      setError('Lim inn avtaleteksten, eller last opp filen først.');
      return;
    }
    const local = interpretContract(text);
    await regulatePrepared(preparedDraft(local), 'Avtalen er lest. Kontroller feltene.');
    try {
      const remote = await interpretAvtale({ text, fileName: draft.sourceName });
      if (remote?.extracted) {
        const merged = preparedDraft(mergeInterpretation(local, remote.extracted));
        await regulatePrepared(merged, remote.engine === 'gemini'
          ? 'AI leste avtalen. Kontroller feltene før brevet sendes.'
          : 'Avtalen er lest. AI var ikke tilgjengelig, så den lokale lesingen ble brukt.');
      }
    } catch {
      setStatus('Avtalen er lest lokalt. AI-tjenesten svarte ikke.');
    }
  }

  async function uploadAgreement() {
    setError('');
    const file = await pickDocument({
      accept: '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain',
    });
    if (!file) return;
    setStatus('Leser avtalen…');
    try {
      const bytes = await bytesFromFile(file);
      const text = await extractContractText(bytes, file.name, file.mimeType);
      setSourceText(text);
      setDraft((current) => ({ ...current, sourceName: file.name || '' }));
      const local = interpretContract(text);
      const withName = { ...preparedDraft(local), sourceName: file.name || '' };
      await regulatePrepared(withName, `${file.name || 'Filen'} er lest.`);
      const remote = await interpretAvtale({ text, fileName: file.name, mimeType: file.mimeType }).catch(() => null);
      if (remote?.extracted) {
        await regulatePrepared(
          { ...preparedDraft(mergeInterpretation(local, remote.extracted)), sourceName: file.name || '' },
          remote.engine === 'gemini' ? 'AI tolket avtalen.' : 'Lokal tolkning er brukt.',
        );
      }
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke lese avtalen.');
      setStatus('');
    }
  }

  async function ensureIndices() {
    const cached = bundleRef.current;
    if (cached?.series && Object.keys(cached.series).length) return cached;
    return refreshIndices();
  }

  async function refreshIndices() {
    setError('');
    setStatus('Henter indeksene fra SSB…');
    const fetched = await fetchAllIndices({
      onProgress: ({ index, total, table }) => setStatus(`Henter SSB-tabell ${table} (${index} av ${total})…`),
    });
    bundleRef.current = fetched;
    setBundle(fetched);
    await saveIndexCache(fetched);
    const count = Object.keys(fetched.series).length;
    setStatus(fetched.errors?.length
      ? `Hentet ${count} serier. ${fetched.errors[0]}`
      : `Hentet ${count} serier fra SSB.`);
    return fetched;
  }

  async function runRegulation(forceFetch = false) {
    setError('');
    try {
      const data = forceFetch ? await refreshIndices() : (bundleRef.current?.series ? bundleRef.current : await ensureIndices());
      const calculated = calculate(draft, data.series);
      setResult(calculated);
      if (!calculated.ok) setError(calculated.error);
      else setStatus('Beregningen er klar. Brevet kan lastes ned.');
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke hente indeksene.');
    }
  }

  async function saveCase() {
    if (!result?.ok || !letter) {
      setError('Kjør beregningen før den lagres.');
      return;
    }
    const row = {
      id: `ir-${Date.now()}`,
      projectId: project?.id || '',
      savedAt: new Date().toISOString(),
      title: draft.title || 'Indeksregulering',
      reference: draft.reference || '',
      addition: result.addition,
      draft,
    };
    const next = [row, ...cases].slice(0, 40);
    setCases(next);
    await saveCases(next);
    setStatus('Beregningen er lagret på denne enheten.');
  }

  function exportKind(kind) {
    if (!letter || !result?.ok) {
      setError('Kjør beregningen før du eksporterer.');
      return;
    }
    const file = exportFiles(draft, result, letter, seriesList).find((item) => item.kind === kind);
    try {
      downloadBytes(file.filename, file.bytes, file.mime);
      setStatus(`${file.filename} er lastet ned.`);
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke laste ned filen.');
    }
  }

  return (
    <View style={styles.stack}>
      <Text style={[styles.h2, { color: colors.ink }]}>Indeksregulering</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Last opp avtalen. ProTop leser standard, sats, tilbudsdato og indeks, henter seriene hos SSB og skriver kravbrevet.
        Modellen følger NS 3405 for NS 8405, NS 8406, NS 8407 og underentreprise, og husleieloven § 4-2 for leie.
      </Text>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {status ? <Text style={{ color: colors.ink }}>{status}</Text> : null}

      <View style={styles.rowWrap}>
        <Btn label="Last opp avtale" colors={colors} onPress={uploadAgreement} />
        <Btn label="Les teksten" tone="quiet" colors={colors} onPress={readAgreement} />
      </View>
      <Field
        label="Avtaletekst"
        value={sourceText}
        onChangeText={setSourceText}
        placeholder="Lim inn avtalen, eller last opp PDF, Word eller tekst."
        colors={colors}
        multiline
      />
      {draft.findings?.length ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          {draft.findings.map((line) => <Text key={line} style={{ color: colors.ink }}>{line}</Text>)}
        </View>
      ) : null}

      <Text style={[styles.h2, { color: colors.ink }]}>Avtalen</Text>
      <Field label="Prosjekt eller avtale" value={draft.title} onChangeText={(value) => patch('title', value)} colors={colors} />
      <Field label="Referanse" value={draft.reference} onChangeText={(value) => patch('reference', value)} colors={colors} />
      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Field label="Til" value={draft.buyer} onChangeText={(value) => patch('buyer', value)} placeholder="Byggherre eller utleier" colors={colors} />
        </View>
        <View style={styles.splitItem}>
          <Field label="Fra" value={draft.supplier} onChangeText={(value) => patch('supplier', value)} placeholder="Entreprenør" colors={colors} />
        </View>
      </View>
      <Text style={[styles.label, { color: colors.muted }]}>Standard</Text>
      <View style={styles.rowWrap}>
        {STANDARDS.map(([id, label]) => (
          <Btn key={id} label={label} tone={draft.standard === id ? 'brand' : 'quiet'} colors={colors} onPress={() => chooseStandard(id)} />
        ))}
      </View>
      <Text style={[styles.label, { color: colors.muted }]}>Modell</Text>
      <View style={styles.rowWrap}>
        {MODELS.map((model) => (
          <Btn key={model.id} label={model.short} tone={draft.model === model.id ? 'brand' : 'quiet'} colors={colors} onPress={() => chooseModel(model.id)} />
        ))}
      </View>
      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Field label="Tilbudsdato" value={draft.offerDate} onChangeText={(value) => patch('offerDate', value)} placeholder="01.03.2024" colors={colors} />
        </View>
        <View style={styles.splitItem}>
          <Field label="Tilbudsfrist" value={draft.tenderDeadline} onChangeText={(value) => patch('tenderDeadline', value)} placeholder="15.03.2024" colors={colors} />
        </View>
      </View>
      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Field label="Reguleringsdato" value={draft.regulationDate} onChangeText={(value) => patch('regulationDate', value)} placeholder="04.10.2026" colors={colors} />
        </View>
        <View style={styles.splitItem}>
          <Field label="Regulert andel %" value={draft.sharePercent} onChangeText={(value) => patch('sharePercent', value)} keyboardType="decimal-pad" colors={colors} />
        </View>
      </View>
      {draft.model !== 'husleie' ? (
        <Field label="Merverdiavgift %" value={draft.vatPercent} onChangeText={(value) => patch('vatPercent', value)} keyboardType="decimal-pad" colors={colors} />
      ) : (
        <Text style={{ color: colors.muted }}>Husleie reguleres med KPI. Merverdiavgift legges ikke på.</Text>
      )}
      {draft.regulationExcluded ? (
        <View style={styles.rowWrap}>
          <Text style={{ color: colors.ink }}>Avtalen holder prisen fast.</Text>
          <Btn
            label={draft.overrideExclusion ? 'Fastpris er overstyrt' : 'Beregn likevel'}
            tone="quiet"
            colors={colors}
            onPress={() => patch('overrideExclusion', !draft.overrideExclusion)}
          />
        </View>
      ) : null}

      <Text style={[styles.h2, { color: colors.ink }]}>Satser</Text>
      {draft.lines.map((line) => (
        <View key={line.id} style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Field label="Post" value={line.text} onChangeText={(value) => patchLine(line.id, 'text', value)} colors={colors} />
          <View style={styles.split}>
            <View style={styles.splitItem}>
              <Field label="Mengde" value={line.quantity} onChangeText={(value) => patchLine(line.id, 'quantity', value)} keyboardType="decimal-pad" colors={colors} />
            </View>
            <View style={styles.splitItem}>
              <Field label="Enhet" value={line.unit} onChangeText={(value) => patchLine(line.id, 'unit', value)} colors={colors} />
            </View>
            <View style={styles.splitItem}>
              <Field label="Sats" value={line.rate} onChangeText={(value) => patchLine(line.id, 'rate', value)} keyboardType="decimal-pad" colors={colors} />
            </View>
          </View>
          <Btn
            label="Fjern"
            tone="quiet"
            colors={colors}
            onPress={() => patch('lines', draft.lines.filter((item) => item.id !== line.id))}
          />
        </View>
      ))}
      <Btn label="Ny sats" tone="quiet" colors={colors} onPress={() => patch('lines', [...draft.lines, emptyLine()])} />

      {draft.model === 'ns3405' ? (
        <>
          <Text style={[styles.h2, { color: colors.ink }]}>Månedlig produksjon</Text>
          <Text style={{ color: colors.muted }}>
            La listen stå tom for å regulere satsene over til valgt måned. Fyll den ut når kravet gjelder produksjon i flere avregningsmåneder.
          </Text>
          {draft.periods.map((row, index) => (
            <View key={`${row.month}-${index}`} style={styles.split}>
              <View style={styles.splitItem}>
                <Field
                  label="Måned"
                  value={row.month}
                  onChangeText={(value) => {
                    const periods = draft.periods.map((item, itemIndex) => (itemIndex === index ? { ...item, month: value } : item));
                    patch('periods', periods);
                  }}
                  placeholder="2026-08"
                  colors={colors}
                />
              </View>
              <View style={styles.splitItem}>
                <Field
                  label="Produksjon, kr"
                  value={row.amount}
                  onChangeText={(value) => {
                    const periods = draft.periods.map((item, itemIndex) => (itemIndex === index ? { ...item, amount: value } : item));
                    patch('periods', periods);
                  }}
                  keyboardType="decimal-pad"
                  colors={colors}
                />
              </View>
            </View>
          ))}
          <Btn
            label="Ny avregningsmåned"
            tone="quiet"
            colors={colors}
            onPress={() => patch('periods', [...draft.periods, { month: '', amount: '', text: '' }])}
          />
        </>
      ) : null}

      {draft.model === 'vektet' ? (
        <>
          <Text style={[styles.h2, { color: colors.ink }]}>Vekter</Text>
          {draft.weights.map((row, index) => (
            <View key={row.indexId} style={styles.split}>
              <View style={styles.splitItem}>
                <Text style={{ color: colors.ink }}>{INDEX_SERIES.find((item) => item.id === row.indexId)?.name}</Text>
              </View>
              <View style={styles.splitItem}>
                <Field
                  label="Vekt %"
                  value={row.weight}
                  onChangeText={(value) => {
                    const weights = draft.weights.map((item, itemIndex) => (itemIndex === index ? { ...item, weight: value } : item));
                    patch('weights', weights);
                  }}
                  keyboardType="decimal-pad"
                  colors={colors}
                />
              </View>
            </View>
          ))}
        </>
      ) : null}

      <Text style={[styles.h2, { color: colors.ink }]}>SSB-indeks</Text>
      <View style={styles.rowWrap}>
        <Btn label="Hent alle indekser fra SSB" colors={colors} onPress={refreshIndices} />
        <Btn label="Beregn og lag brev" tone="quiet" colors={colors} onPress={() => runRegulation(false)} />
      </View>
      {selected?.latest ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink }}>
            Gjeldende {selected.name}: {periodLabel(selected.latest.period)} = {formatIndex(selected.latest.value)}
          </Text>
          <Text style={{ color: colors.muted }}>
            {selected.source}. Basis {selected.basis}.
            {bundle?.fetchedAt ? ` Hentet ${bundle.fetchedAt.slice(0, 16).replace('T', ' ')}.` : ''}
          </Text>
        </View>
      ) : (
        <Text style={{ color: colors.muted }}>Indeksene er ikke hentet ennå.</Text>
      )}
      <Field label="Søk i seriene" value={query} onChangeText={setQuery} placeholder="Søk for KPI, veganlegg, rør eller materialer" colors={colors} />
      {visibleSeries.map((row) => {
        const on = row.id === draft.indexId;
        return (
          <TouchableOpacity
            key={row.id}
            onPress={() => patch('indexId', row.id)}
            style={[styles.card, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
          >
            <Text style={{ color: colors.ink }}>{row.group} · {row.name}</Text>
            <Text style={{ color: colors.muted }}>
              Tabell {row.table} · {row.basis}
              {row.latest ? ` · ${periodLabel(row.latest.period)} = ${formatIndex(row.latest.value)}` : ''}
            </Text>
          </TouchableOpacity>
        );
      })}

      {result?.ok ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.h2, { color: colors.ink }]}>Beregning</Text>
          <Text style={{ color: colors.ink }}>{result.model.formula}</Text>
          <Text style={{ color: colors.muted }}>
            t0 {periodLabel(result.basisPoint.period)} = {formatIndex(result.basisPoint.value)}
            {' · '}
            t {periodLabel(result.regulationPoint.period)} = {formatIndex(result.regulationPoint.value)}
            {' · '}
            endring {formatPercent(result.changePercent)}
          </Text>
          {result.rows.map((row) => (
            <Text key={`${row.text}-${row.period}`} style={{ color: colors.ink }}>
              {row.text}: grunnlag {formatMoney(row.base)} → tillegg {formatMoney(row.addition)} → ny sats {formatMoney(row.newRate)}
            </Text>
          ))}
          <Text style={{ color: colors.ink }}>
            Tillegg {formatMoney(result.addition)} kr
            {result.vat ? ` · mva ${formatMoney(result.vat)} kr · å betale ${formatMoney(result.payable)} kr` : ''}
          </Text>
          {result.warnings.map((line) => <Text key={line} style={{ color: colors.ink }}>{line}</Text>)}
        </View>
      ) : null}

      {letter ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={[styles.h2, { color: colors.ink }]}>Brev</Text>
          <Text selectable style={{ color: colors.ink, lineHeight: 21 }}>{letter.plain}</Text>
          <View style={styles.rowWrap}>
            <Btn label="PDF" colors={colors} onPress={() => exportKind('pdf')} />
            <Btn label="Word" colors={colors} onPress={() => exportKind('docx')} />
            <Btn label="Excel" colors={colors} onPress={() => exportKind('xlsx')} />
            <Btn label="Lagre" tone="quiet" colors={colors} onPress={saveCase} />
          </View>
        </View>
      ) : null}

      {cases.filter((row) => !project?.id || row.projectId === project.id || !row.projectId).slice(0, 8).map((row) => (
        <TouchableOpacity
          key={row.id}
          onPress={() => {
            setDraft(row.draft);
            setResult(null);
            setStatus('Lagret beregning er hentet. Kjør den på nytt mot ferske indekser.');
          }}
          style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}
        >
          <Text style={{ color: colors.ink }}>{row.title}</Text>
          <Text style={{ color: colors.muted }}>
            {row.savedAt.slice(0, 10)} · tillegg {formatMoney(row.addition)} kr
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  h2: { fontWeight: '400', fontSize: 16, marginTop: 8 },
  field: { gap: 4, flex: 1 },
  label: { fontSize: 12, fontWeight: '400' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  inputMulti: { minHeight: 120, textAlignVertical: 'top' },
  btn: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start' },
  btnText: { fontWeight: '400', fontSize: 13 },
  rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 6 },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  splitItem: { flexGrow: 1, flexBasis: 180, minWidth: 160 },
});
