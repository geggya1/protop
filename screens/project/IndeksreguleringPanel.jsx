import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Share, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { useApp } from '../../src/context/AppContext';
import { COST_CODES } from '../../src/project/catalog';
import { INDEX_SERIES, MODELS, standardById } from '../../src/indeksregulering/catalog';
import { interpretAvtale } from '../../src/indeksregulering/aiClient';
import {
  calculate, emptyDraft, emptyLine, periodLabel, todayIso,
} from '../../src/indeksregulering/engine';
import { extractContractText } from '../../src/indeksregulering/extractText';
import { interpretContract, mergeInterpretation } from '../../src/indeksregulering/interpret';
import { buildLetter, formatIndex, formatMoney, formatPercent } from '../../src/indeksregulering/letter';
import { downloadBytes, exportFiles } from '../../src/indeksregulering/office';
import { fetchAllIndices } from '../../src/indeksregulering/ssb';
import { loadCases, loadIndexCache, saveCases, saveIndexCache } from '../../src/indeksregulering/storage';
import { pickDocument } from '../../src/utils/media';

const STANDARDS = [
  ['NS 8403', 'NS 8403'],
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

function NoticeView({ notice, colors }) {
  return (
    <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
      <Text style={[styles.brand, { color: colors.ink }]}>{notice.brand}</Text>
      <Text style={[styles.h2, { color: colors.ink, marginTop: 0 }]}>{notice.title}</Text>
      <Text selectable style={{ color: colors.ink, lineHeight: 20 }}>{notice.intro}</Text>
      {notice.sections.map((section, sectionIndex) => (
        <View key={`${section.heading}-${sectionIndex}`} style={styles.stack}>
          <Text style={[styles.h2, { color: colors.ink }]}>{section.heading}</Text>
          {section.lead ? <Text style={{ color: colors.ink }}>{section.lead}</Text> : null}
          <View style={[styles.grid, { borderColor: colors.line }]}>
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
        </View>
      ))}
      {notice.notes.map((line) => <Text key={line} style={{ color: colors.ink }}>{line}</Text>)}
      <Text style={[styles.h2, { color: colors.ink }]}>Med vennlig hilsen</Text>
      {notice.signoff.place ? <Text style={{ color: colors.ink }}>Sted: {notice.signoff.place}</Text> : null}
      <Text style={{ color: colors.ink }}>Dato: {notice.signoff.date}</Text>
      <Text style={{ color: colors.muted }}>Underskrift</Text>
      {notice.signoff.name ? <Text style={{ color: colors.ink }}>{notice.signoff.name}</Text> : null}
      <Text style={{ color: colors.ink }}>{notice.signoff.company}</Text>
      <Text style={{ color: colors.muted }}>{notice.footer.join('  |  ')}</Text>
    </View>
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

function freshDraft(project, supplier) {
  return emptyDraft({
    title: project?.name || '',
    reference: project?.number || '',
    buyer: project?.client || '',
    supplier: supplier || '',
    regulationDate: todayIso(),
    noticeDate: todayIso(),
    lines: [emptyLine({ text: 'Kontraktssum', quantity: '1', unit: 'RS' })],
  });
}

export default function IndeksreguleringPanel({ project, onBook }) {
  const colors = useColors();
  const { family, activeProfile } = useApp();
  const [draft, setDraft] = useState(() => freshDraft(project, ''));
  const [sourceText, setSourceText] = useState('');
  const [bundle, setBundle] = useState(null);
  const bundleRef = useRef(null);
  const fetchLock = useRef(null);
  const [cases, setCases] = useState([]);
  const [caseId, setCaseId] = useState('');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [bookCode, setBookCode] = useState('19');
  const [pickingWeight, setPickingWeight] = useState(-1);

  useEffect(() => {
    const company = family?.company || {};
    const contact = activeProfile?.kind === 'parent' ? activeProfile.name : '';
    setDraft((current) => ({
      ...current,
      supplier: current.supplier || company.navn || '',
      orgnr: current.orgnr || company.organisasjonsnummer || '',
      phone: current.phone || company.telefon || '',
      email: current.email || company.epostadresse || '',
      website: current.website || company.hjemmeside || '',
      contactName: current.contactName || (contact && contact !== 'Meg' ? contact : ''),
    }));
  }, [family?.company, activeProfile?.name, activeProfile?.kind]);

  useEffect(() => {
    let live = true;
    (async () => {
      const [cache, stored] = await Promise.all([loadIndexCache(), loadCases()]);
      if (!live) return;
      setCases(stored);
      if (cache?.series && Object.keys(cache.series).length) {
        bundleRef.current = cache;
        setBundle(cache);
        return;
      }
      setWorking(true);
      setStatus('Henter indeksene fra SSB…');
      try {
        const fetched = await fetchAllIndices({
          onProgress: ({ index, total, table }) => {
            if (live) setStatus(`Henter SSB-tabell ${table} (${index} av ${total})…`);
          },
        });
        if (!live) return;
        bundleRef.current = fetched;
        setBundle(fetched);
        await saveIndexCache(fetched);
        const count = Object.keys(fetched.series).length;
        setStatus(fetched.errors?.[0]
          ? `Hentet ${count} serier. ${fetched.errors[0]}`
          : `Hentet ${count} serier fra SSB.`);
      } catch (cause) {
        if (live) setError(cause?.message || 'Kunne ikke hente indeksene.');
      } finally {
        if (live) setWorking(false);
      }
    })();
    return () => { live = false; };
  }, []);

  const live = useMemo(() => {
    if (!bundle?.series || !Object.keys(bundle.series).length) return null;
    return calculate(draft, bundle.series);
  }, [draft, bundle]);
  const letter = useMemo(
    () => (live?.ok ? buildLetter(draft, live) : null),
    [draft, live],
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
  const span = useMemo(() => {
    if (!live?.ok || !selected?.points?.length) return [];
    return selected.points.filter((point) => (
      point.period >= live.basisPoint.period && point.period <= live.regulationPoint.period
    ));
  }, [live, selected]);

  function patch(partial) {
    setDraft((current) => ({ ...current, ...partial }));
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
  }

  function chooseModel(id) {
    setDraft((current) => ({
      ...current,
      model: id,
      indexId: id === 'husleie' ? 'kpi' : current.indexId,
      vatPercent: id === 'husleie' ? '0' : current.vatPercent,
    }));
  }

  function patchLine(id, key, value) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.id === id ? { ...line, [key]: value } : line)),
    }));
  }

  function preparedDraft(next) {
    return {
      ...next,
      supplier: next.supplier || draft.supplier,
      buyer: next.buyer || draft.buyer,
      title: next.title || draft.title,
      reference: next.reference || draft.reference,
      regulationDate: next.regulationDate || draft.regulationDate || todayIso(),
      noticeDate: draft.noticeDate || todayIso(),
      overrideExclusion: next.regulationExcluded ? draft.overrideExclusion : false,
      periods: draft.periods,
      weights: draft.weights,
      sourceName: next.sourceName || draft.sourceName,
    };
  }

  async function refreshIndices() {
    if (fetchLock.current) return fetchLock.current;
    const job = (async () => {
      setWorking(true);
      setError('');
      setStatus('Henter indeksene fra SSB…');
      try {
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
      } catch (cause) {
        setError(cause?.message || 'Kunne ikke hente indeksene.');
        throw cause;
      } finally {
        setWorking(false);
      }
    })();
    fetchLock.current = job;
    try {
      return await job;
    } finally {
      fetchLock.current = null;
    }
  }

  async function regulatePrepared(prepared, note) {
    setDraft(prepared);
    if (note) setStatus(note);
    if (!bundleRef.current?.series || !Object.keys(bundleRef.current.series).length) {
      try {
        await refreshIndices();
      } catch {
        // Feilen vises av refreshIndices.
      }
    }
  }

  async function readAgreement() {
    setError('');
    const text = sourceText.trim();
    if (text.length < 20) {
      setError('Lim inn avtaleteksten, eller last opp filen først.');
      return;
    }
    const local = interpretContract(text);
    await regulatePrepared(preparedDraft(local), 'Avtalen er lest. Kravet oppdateres når indeksene er inne.');
    try {
      const remote = await interpretAvtale({ text, fileName: draft.sourceName });
      if (remote?.extracted) {
        await regulatePrepared(
          preparedDraft(mergeInterpretation(local, remote.extracted)),
          remote.engine === 'gemini'
            ? 'AI leste avtalen. Kontroller feltene før brevet sendes.'
            : 'Avtalen er lest lokalt. AI-tjenesten var ikke tilgjengelig.',
        );
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
    setWorking(true);
    setStatus('Leser avtalen…');
    try {
      const bytes = await bytesFromFile(file);
      const text = await extractContractText(bytes, file.name, file.mimeType);
      setSourceText(text);
      const local = interpretContract(text);
      const named = { ...preparedDraft(local), sourceName: file.name || '' };
      await regulatePrepared(named, `${file.name || 'Filen'} er lest.`);
      const remote = await interpretAvtale({ text, fileName: file.name, mimeType: file.mimeType }).catch(() => null);
      if (remote?.extracted) {
        await regulatePrepared(
          { ...preparedDraft(mergeInterpretation(local, remote.extracted)), sourceName: file.name || '' },
          remote.engine === 'gemini' ? 'AI tolket avtalen.' : 'Lokal tolkning er brukt.',
        );
      }
    } catch (cause) {
      setError(cause?.message || 'Kunne ikke lese avtalen.');
    } finally {
      setWorking(false);
    }
  }

  async function saveCase() {
    if (!live?.ok) {
      setError(live?.error || 'Kravet er ikke klart til å lagres.');
      return;
    }
    const id = caseId || `ir-${Date.now()}`;
    const row = {
      id,
      projectId: project?.id || '',
      savedAt: new Date().toISOString(),
      title: draft.title || 'Indeksregulering',
      reference: draft.reference || '',
      addition: live.addition,
      draft: { ...draft, sourceText },
    };
    const next = [row, ...cases.filter((item) => item.id !== id)].slice(0, 40);
    setCaseId(id);
    setCases(next);
    await saveCases(next);
    setStatus('Beregningen er lagret på denne enheten.');
  }

  async function removeCase(id) {
    const next = cases.filter((item) => item.id !== id);
    setCases(next);
    if (caseId === id) setCaseId('');
    await saveCases(next);
  }

  function openCase(row) {
    setCaseId(row.id);
    setDraft(row.draft);
    setSourceText(row.draft?.sourceText || '');
    setStatus('Lagret beregning er åpnet. Kravet regnes på nytt mot indeksene som er hentet.');
    setError('');
  }

  function startNew() {
    setCaseId('');
    setSourceText('');
    setDraft(freshDraft(project, draft.supplier || family?.company?.navn || ''));
    setStatus('Ny beregning.');
    setError('');
  }

  function exportKind(kind) {
    if (!letter || !live?.ok) {
      setError(live?.error || 'Kravet er ikke klart til eksport.');
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

  async function shareLetter() {
    if (!letter) return;
    try {
      await Share.share({ message: letter.plain, title: letter.title });
    } catch (cause) {
      if (cause?.message && !/cancel/i.test(cause.message)) setError(cause.message);
    }
  }

  function book() {
    if (!onBook || !live?.ok) return;
    const amount = Math.abs(live.addition);
    if (!(amount > 0)) {
      setError('Tillegget er null, så det er ikke noe å føre.');
      return;
    }
    const reduction = live.addition < 0;
    const booked = onBook({
      kind: reduction ? 'cost' : 'income',
      account: reduction ? '7790' : '3100',
      costCode: bookCode || '19',
      text: `Indeksregulering ${live.regulationPoint.period} ${draft.reference || draft.title || ''}`.trim(),
      amount: String(amount),
      date: live.regulationDate,
    });
    if (booked && booked.ok === false) {
      setError(booked.error || 'Kunne ikke føre bilaget.');
      return;
    }
    setStatus(reduction
      ? 'Reduksjonen er ført som kostnad i prosjektregnskapet.'
      : 'Tillegget er ført som endringsinntekt på konto 3100.');
  }

  const shownSpan = span.length > 18 ? [...span.slice(0, 3), null, ...span.slice(-6)] : span;

  return (
    <View style={styles.stack}>
      <Text style={[styles.h2, { color: colors.ink }]}>Indeksregulering</Text>
      <Text style={{ color: colors.muted, lineHeight: 20 }}>
        Last opp avtalen. ProTop leser standard, sats, tilbudsdato og indeks, henter seriene hos SSB og holder kravbrevet oppdatert.
        NS-kontrakter reguleres etter NS 3405. Husleie følger husleieloven § 4-2.
      </Text>
      {error ? <Text style={{ color: colors.danger }}>{error}</Text> : null}
      {status ? <Text style={{ color: colors.ink }}>{status}</Text> : null}

      {live?.ok ? (
        <View style={[styles.card, { borderColor: colors.brand, backgroundColor: colors.card }]}>
          <Text style={[styles.h2, { color: colors.ink, marginTop: 0 }]}>
            {live.addition < 0 ? 'Reduksjon' : 'Tillegg'} {formatMoney(live.addition)} kr
          </Text>
          <Text style={{ color: colors.ink }}>{live.model.formula}</Text>
          <Text style={{ color: colors.muted }}>
            t0 {periodLabel(live.basisPoint.period)} = {formatIndex(live.basisPoint.value)}
            {' · '}
            t {periodLabel(live.regulationPoint.period)} = {formatIndex(live.regulationPoint.value)}
            {' · '}
            endring {formatPercent(live.changePercent)}
            {selected?.latest ? ` · gjeldende ${periodLabel(selected.latest.period)} = ${formatIndex(selected.latest.value)}` : ''}
          </Text>
          <Text style={{ color: colors.ink }}>
            Grunnlag {formatMoney(live.baseSum)} kr
            {live.vat ? ` · mva ${formatMoney(live.vat)} kr · å betale ${formatMoney(live.payable)} kr` : ''}
            {` · regulert ${formatMoney(live.regulated)} kr`}
          </Text>
          {live.warnings.map((line) => <Text key={line} style={{ color: colors.ink }}>{line}</Text>)}
          <View style={styles.rowWrap}>
            <Btn label="PDF" colors={colors} onPress={() => exportKind('pdf')} />
            <Btn label="Word" colors={colors} onPress={() => exportKind('docx')} />
            <Btn label="Excel" colors={colors} onPress={() => exportKind('xlsx')} />
            <Btn label="Del brev" tone="quiet" colors={colors} onPress={shareLetter} />
            <Btn label={caseId ? 'Oppdater lagret' : 'Lagre'} tone="quiet" colors={colors} onPress={saveCase} />
          </View>
          {project && onBook ? (
            <>
              <Text style={[styles.label, { color: colors.muted }]}>Før i prosjektregnskapet</Text>
              <View style={styles.rowWrap}>
                {COST_CODES.map((row) => (
                  <Btn
                    key={row.code}
                    label={`${row.code} ${row.name}`}
                    tone={bookCode === row.code ? 'brand' : 'quiet'}
                    colors={colors}
                    onPress={() => setBookCode(row.code)}
                  />
                ))}
              </View>
              <Btn
                label={live.addition < 0 ? 'Før reduksjonen' : 'Før tillegget på 3100'}
                colors={colors}
                onPress={book}
              />
            </>
          ) : (
            <Text style={{ color: colors.muted }}>Åpne et prosjekt for å føre tillegget i prosjektregnskapet.</Text>
          )}
        </View>
      ) : (
        <Text style={{ color: colors.muted }}>{live?.error || (working ? 'Henter indekser…' : 'Legg inn tilbudsdato og minst én sats. Kravet regnes når SSB-tallene er inne.')}</Text>
      )}

      <View style={styles.rowWrap}>
        <Btn label="Last opp avtale" colors={colors} disabled={working} onPress={uploadAgreement} />
        <Btn label="Les teksten" tone="quiet" colors={colors} disabled={working} onPress={readAgreement} />
        <Btn label="Ny beregning" tone="quiet" colors={colors} onPress={startNew} />
        <Btn label="Hent indekser på nytt" tone="quiet" colors={colors} disabled={working} onPress={refreshIndices} />
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
      <Field label="Prosjekt eller avtale" value={draft.title} onChangeText={(value) => patch({ title: value })} colors={colors} />
      <Field label="Referanse" value={draft.reference} onChangeText={(value) => patch({ reference: value })} colors={colors} />
      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Field label="Til" value={draft.buyer} onChangeText={(value) => patch({ buyer: value })} placeholder="Byggherre eller utleier" colors={colors} />
        </View>
        <View style={styles.splitItem}>
          <Field label="Fra" value={draft.supplier} onChangeText={(value) => patch({ supplier: value })} placeholder="Entreprenør" colors={colors} />
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
      <Text style={{ color: colors.muted }}>{MODELS.find((model) => model.id === draft.model)?.formula}</Text>
      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Field label="Tilbudsdato" value={draft.offerDate} onChangeText={(value) => patch({ offerDate: value })} placeholder="01.03.2024" colors={colors} />
        </View>
        <View style={styles.splitItem}>
          <Field label="Tilbudsfrist" value={draft.tenderDeadline} onChangeText={(value) => patch({ tenderDeadline: value })} placeholder="15.03.2024" colors={colors} />
        </View>
      </View>
      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Field label="Reguleringsdato" value={draft.regulationDate} onChangeText={(value) => patch({ regulationDate: value })} placeholder="04.10.2026" colors={colors} />
        </View>
        <View style={styles.splitItem}>
          <Field label="Regulert andel %" value={draft.sharePercent} onChangeText={(value) => patch({ sharePercent: value })} keyboardType="decimal-pad" colors={colors} />
        </View>
      </View>
      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Field label="Organisasjonsnummer" value={draft.orgnr} onChangeText={(value) => patch({ orgnr: value })} colors={colors} />
        </View>
        <View style={styles.splitItem}>
          <Field label="Kontaktperson" value={draft.contactName} onChangeText={(value) => patch({ contactName: value })} colors={colors} />
        </View>
      </View>
      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Field label="Telefon" value={draft.phone} onChangeText={(value) => patch({ phone: value })} colors={colors} />
        </View>
        <View style={styles.splitItem}>
          <Field label="E-post" value={draft.email} onChangeText={(value) => patch({ email: value })} colors={colors} />
        </View>
      </View>
      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Field label="Sted" value={draft.place} onChangeText={(value) => patch({ place: value })} placeholder="Sandnes" colors={colors} />
        </View>
        <View style={styles.splitItem}>
          <Field label="Nettside" value={draft.website} onChangeText={(value) => patch({ website: value })} placeholder="www.firma.no" colors={colors} />
        </View>
      </View>
      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Field label="Kontraktsdato" value={draft.contractDate} onChangeText={(value) => patch({ contractDate: value })} placeholder="25.08.2023" colors={colors} />
        </View>
        <View style={styles.splitItem}>
          <Field label="Eksternt PO-nr." value={draft.poNumber} onChangeText={(value) => patch({ poNumber: value })} colors={colors} />
        </View>
      </View>
      <View style={styles.split}>
        <View style={styles.splitItem}>
          <Field label="Gjeldende fra" value={draft.effectiveDate} onChangeText={(value) => patch({ effectiveDate: value })} placeholder="01.08.2025" colors={colors} />
        </View>
        <View style={styles.splitItem}>
          <Field label="Avtalt honorar" value={draft.honorar} onChangeText={(value) => patch({ honorar: value })} placeholder="Oppdraget honoreres etter medgått tid" colors={colors} />
        </View>
      </View>
      {draft.model !== 'husleie' ? (
        <Field label="Merverdiavgift %" value={draft.vatPercent} onChangeText={(value) => patch({ vatPercent: value })} keyboardType="decimal-pad" colors={colors} />
      ) : (
        <Text style={{ color: colors.muted }}>Husleie reguleres med KPI. Merverdiavgift legges ikke på. Varselet er brevet du deler eller laster ned.</Text>
      )}
      {draft.regulationExcluded ? (
        <View style={styles.rowWrap}>
          <Text style={{ color: colors.ink }}>Avtalen holder prisen fast.</Text>
          <Btn
            label={draft.overrideExclusion ? 'Fastpris er overstyrt' : 'Beregn likevel'}
            tone="quiet"
            colors={colors}
            onPress={() => patch({ overrideExclusion: !draft.overrideExclusion })}
          />
        </View>
      ) : null}

      <Text style={[styles.h2, { color: colors.ink }]}>Satser</Text>
      <Text style={{ color: colors.muted }}>Kryss av linjene som skal inngå i kravet. En avslått linje blir stående, men reguleres ikke.</Text>
      {draft.lines.map((line) => {
        const on = line.included !== false;
        return (
          <View key={line.id} style={[styles.card, { borderColor: on ? colors.brand : colors.line, backgroundColor: colors.card }]}>
            <View style={styles.rowWrap}>
              <Btn label={on ? 'Med i kravet' : 'Utenfor kravet'} tone={on ? 'brand' : 'quiet'} colors={colors} onPress={() => patchLine(line.id, 'included', !on)} />
              <Btn label="Fjern" tone="quiet" colors={colors} onPress={() => patch({ lines: draft.lines.filter((item) => item.id !== line.id) })} />
            </View>
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
          </View>
        );
      })}
      <Btn label="Ny sats" tone="quiet" colors={colors} onPress={() => patch({ lines: [...draft.lines, emptyLine()] })} />

      {draft.model === 'ns3405' ? (
        <>
          <Text style={[styles.h2, { color: colors.ink }]}>Månedlig produksjon</Text>
          <Text style={{ color: colors.muted }}>
            La listen stå tom for å regulere de avkryssede satsene til valgt måned. Fyll den ut når kravet gjelder produksjon i flere avregningsmåneder. Da er det produksjonen, ikke satsene, som utgjør kravet.
          </Text>
          {draft.periods.map((row, index) => (
            <View key={`periode-${index}`} style={styles.stack}>
              <View style={styles.split}>
                <View style={styles.splitItem}>
                  <Field
                    label="Måned"
                    value={row.month}
                    onChangeText={(value) => patch({
                      periods: draft.periods.map((item, itemIndex) => (itemIndex === index ? { ...item, month: value } : item)),
                    })}
                    placeholder="2026-08"
                    colors={colors}
                  />
                </View>
                <View style={styles.splitItem}>
                  <Field
                    label="Produksjon, kr"
                    value={row.amount}
                    onChangeText={(value) => patch({
                      periods: draft.periods.map((item, itemIndex) => (itemIndex === index ? { ...item, amount: value } : item)),
                    })}
                    keyboardType="decimal-pad"
                    colors={colors}
                  />
                </View>
              </View>
              <Btn
                label="Fjern måneden"
                tone="quiet"
                colors={colors}
                onPress={() => patch({ periods: draft.periods.filter((_, itemIndex) => itemIndex !== index) })}
              />
            </View>
          ))}
          <Btn
            label="Ny avregningsmåned"
            tone="quiet"
            colors={colors}
            onPress={() => patch({ periods: [...draft.periods, { month: '', amount: '', text: '' }] })}
          />
        </>
      ) : null}

      {draft.model === 'vektet' ? (
        <>
          <Text style={[styles.h2, { color: colors.ink }]}>Vekter</Text>
          <Text style={{ color: colors.muted }}>Vektene fordeles slik at de utgjør 100 %. Hver delindeks må være hentet fra SSB.</Text>
          {draft.weights.map((row, index) => (
            <View key={`${row.indexId}-${index}`} style={styles.stack}>
              <View style={styles.rowWrap}>
                <Btn
                  label={INDEX_SERIES.find((item) => item.id === row.indexId)?.name || row.indexId}
                  tone="quiet"
                  colors={colors}
                  onPress={() => setPickingWeight(pickingWeight === index ? -1 : index)}
                />
                <Btn
                  label="Fjern"
                  tone="quiet"
                  colors={colors}
                  onPress={() => patch({ weights: draft.weights.filter((_, itemIndex) => itemIndex !== index) })}
                />
              </View>
              {pickingWeight === index ? (
                <View style={styles.rowWrap}>
                  {INDEX_SERIES.map((item) => (
                    <Btn
                      key={item.id}
                      label={item.name}
                      tone={row.indexId === item.id ? 'brand' : 'quiet'}
                      colors={colors}
                      onPress={() => {
                        patch({
                          weights: draft.weights.map((weight, itemIndex) => (
                            itemIndex === index ? { ...weight, indexId: item.id } : weight
                          )),
                        });
                        setPickingWeight(-1);
                      }}
                    />
                  ))}
                </View>
              ) : null}
              <Field
                label="Vekt %"
                value={row.weight}
                onChangeText={(value) => patch({
                  weights: draft.weights.map((weight, itemIndex) => (itemIndex === index ? { ...weight, weight: value } : weight)),
                })}
                keyboardType="decimal-pad"
                colors={colors}
              />
            </View>
          ))}
          <Btn
            label="Ny delindeks"
            tone="quiet"
            colors={colors}
            onPress={() => patch({ weights: [...draft.weights, { indexId: 'bki-bustader', weight: '0' }] })}
          />
        </>
      ) : null}

      <Text style={[styles.h2, { color: colors.ink }]}>SSB-indeks</Text>
      {selected?.latest ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink }}>
            Gjeldende {selected.name}: {periodLabel(selected.latest.period)} = {formatIndex(selected.latest.value)}
          </Text>
          <Text style={{ color: colors.muted }}>
            {selected.source}. Basis {selected.basis}.
            {bundle?.fetchedAt ? ` Hentet ${String(bundle.fetchedAt).slice(0, 16).replace('T', ' ')}.` : ''}
          </Text>
        </View>
      ) : (
        <Text style={{ color: colors.muted }}>{working ? 'Henter indekser fra SSB…' : 'Indeksene er ikke hentet ennå.'}</Text>
      )}
      {shownSpan.length ? (
        <View style={[styles.card, { borderColor: colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink }}>Indeks fra basismåned til avregning</Text>
          {shownSpan.map((point, index) => (
            point ? (
              <Text key={point.period} style={{ color: colors.ink }}>
                {periodLabel(point.period)} · {formatIndex(point.value)}
              </Text>
            ) : (
              <Text key={`gap-${index}`} style={{ color: colors.muted }}>… mellomliggende måneder ligger i Excel-filen</Text>
            )
          ))}
        </View>
      ) : null}
      <Field label="Søk i seriene" value={query} onChangeText={setQuery} placeholder="Søk for KPI, veganlegg, rør eller materialer" colors={colors} />
      {visibleSeries.map((row) => {
        const on = row.id === draft.indexId;
        return (
          <TouchableOpacity
            key={row.id}
            onPress={() => patch({ indexId: row.id })}
            style={[styles.card, { borderColor: on ? colors.brand : colors.line, backgroundColor: on ? colors.brandSoft : colors.card }]}
          >
            <Text style={{ color: colors.ink }}>{row.group} · {row.name}</Text>
            <Text style={{ color: colors.muted }}>
              Tabell {row.table} · {row.basis}
              {row.latest ? ` · ${periodLabel(row.latest.period)} = ${formatIndex(row.latest.value)}` : ' · ikke hentet'}
            </Text>
          </TouchableOpacity>
        );
      })}

      {letter?.notice ? <NoticeView notice={letter.notice} colors={colors} /> : null}

      {cases.filter((row) => !project?.id || row.projectId === project.id || !row.projectId).length ? (
        <Text style={[styles.h2, { color: colors.ink }]}>Lagrede krav</Text>
      ) : null}
      {cases.filter((row) => !project?.id || row.projectId === project.id || !row.projectId).map((row) => (
        <View key={row.id} style={[styles.card, { borderColor: row.id === caseId ? colors.brand : colors.line, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.ink }}>{row.title || 'Indeksregulering'}</Text>
          <Text style={{ color: colors.muted }}>
            {String(row.savedAt || '').slice(0, 10)} · tillegg {formatMoney(row.addition)} kr
          </Text>
          <View style={styles.rowWrap}>
            <Btn label="Åpne" tone="quiet" colors={colors} onPress={() => openCase(row)} />
            <Btn label="Slett" tone="quiet" colors={colors} onPress={() => removeCase(row.id)} />
          </View>
        </View>
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
  brand: { fontSize: 18, textAlign: 'right' },
  grid: { borderWidth: 1, borderRadius: 8, overflow: 'hidden' },
  gridRow: { flexDirection: 'row', borderBottomWidth: 1 },
  split: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  splitItem: { flexGrow: 1, flexBasis: 180, minWidth: 160 },
});
