/**
 * «Importer fra Excel» på et register: velg .xlsx/.xlsm/.csv, ark og overskriftsrad,
 * koble kolonnene til registerets felt, se forhåndsvisningen og importer.
 * Samme rad importeres ikke to ganger (fil + ark + rad gir importnøkkelen).
 * Leseren og reglene er src/iso/spreadsheet.js.
 */
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { DEFAULT_RISK_METHOD } from '../../src/iso/catalog';
import { registerDef } from '../../src/iso/registers';
import {
  buildSheetImport, detectHeaderRow, importableFields, planSheetImport, readSpreadsheet, suggestMapping,
} from '../../src/iso/spreadsheet';
import { pickDocument } from '../../src/utils/media';
import { readFileBytes } from './readFileBytes';
import { Banner, Btn, Choice, Field, PersonPick, Pill, Row, Sheet, TextIn } from './isoUi';

const ACCEPT = '.xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel.sheet.macroEnabled.12,text/csv';

function columnLetter(i) {
  let n = i + 1;
  let s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export default function IsoExcelImport({ ctx, registerKey, visible, onClose }) {
  const colors = useColors();
  const { actor, store, state, people, wide } = ctx;
  const def = registerDef(registerKey);
  const fields = useMemo(() => importableFields(registerKey), [registerKey]);
  const [file, setFile] = useState(null);
  const [sheets, setSheets] = useState([]);
  const [sheetIx, setSheetIx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState({});
  const [defaults, setDefaults] = useState({});
  const [groupField, setGroupField] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');

  const rows = sheets[sheetIx]?.rows || [];
  const headers = rows[headerRow] || [];

  function startSheet(list, ix) {
    const r = list[ix]?.rows || [];
    const h = detectHeaderRow(r);
    setSheetIx(ix);
    setHeaderRow(h);
    setMapping(suggestMapping(r[h] || [], registerKey));
    // Påkrevde valgfelt som ikke er i arket, får første valg som utgangspunkt.
    const d = {};
    for (const f of fields) if (f.required && f.type === 'select' && f.options?.length) d[f.key] = f.options[0].id;
    setDefaults(d);
    setGroupField('');
  }

  async function pick() {
    setErr('');
    setDone('');
    try {
      const picked = await pickDocument({ accept: ACCEPT });
      if (!picked) return;
      const bytes = await readFileBytes(picked, 'regnearket');
      const res = readSpreadsheet(bytes, picked.name);
      const list = res.sheets.filter((s) => s.rows.some((r) => r.some(Boolean)));
      if (!list.length) throw new Error('Fant ingen ark med innhold i filen.');
      setFile(picked);
      setSheets(list);
      // Det synlige arket med flest rader (skjulte ark er ofte oppslagstabeller).
      const visibleSheets = list.map((sh, i) => ({ i, sh })).filter((x) => !x.sh.hidden);
      const pool = visibleSheets.length ? visibleSheets : list.map((sh, i) => ({ i, sh }));
      startSheet(list, pool.reduce((best, x) => (x.sh.rows.length > best.sh.rows.length ? x : best), pool[0]).i);
    } catch (e) {
      setErr(e?.message || 'Kunne ikke lese filen.');
    }
  }

  const plan = useMemo(() => (file ? planSheetImport({
    registerKey,
    rows,
    headerRow,
    mapping,
    defaults,
    groupField,
    fileName: file.name,
    sheetName: sheets[sheetIx]?.name || '',
    existing: state.records[registerKey] || [],
    refs: { ...state.records, process: state.processes, requirement: state.requirements },
  }) : null), [file, registerKey, rows, headerRow, mapping, defaults, groupField, sheets, sheetIx, state.records, state.processes, state.requirements]);

  async function run() {
    if (!plan?.counts.ny) return;
    setBusy(true);
    setErr('');
    const res = buildSheetImport(plan, registerKey, {
      actor,
      existing: store.current().records[registerKey] || [],
      riskMethod: state.system.riskMethod || DEFAULT_RISK_METHOD,
    });
    const saved = res.ok ? await store.commitMany(res.records.map((r) => ({ kind: 'records', entity: r })), res.events) : res;
    setBusy(false);
    if (!saved.ok) { setErr(saved.error || 'Kunne ikke lagre.'); return; }
    setDone(`${res.records.length} ${res.records.length === 1 ? 'post er importert' : 'poster er importert'} til ${def.title}. De står nederst i listen og kan endres som vanlig.`);
  }

  function close() {
    setFile(null); setSheets([]); setErr(''); setDone('');
    onClose?.();
  }

  const columnOptions = [{ id: '-1', label: 'Ikke i arket' }, ...headers.map((h, i) => ({ id: String(i), label: `${columnLetter(i)}: ${String(h || '').slice(0, 40) || '(uten overskrift)'}` }))];
  const groupOptions = [{ id: 'none', label: 'Hoppes over' }, ...fields.filter((f) => ['text', 'select', 'long'].includes(f.type)).map((f) => ({ id: f.key, label: f.label }))];
  const errorRows = plan ? plan.rows.filter((r) => r.status === 'feil') : [];
  const newRows = plan ? plan.rows.filter((r) => r.status === 'ny') : [];

  return (
    <Sheet
      visible={visible}
      title={`Importer ${def?.title || 'register'} fra Excel`}
      onClose={close}
      wide={wide}
      footer={(
        <>
          <Btn label={done ? 'Lukk' : 'Avbryt'} onPress={close} />
          {!done ? <Btn kind="primary" icon="cloud-upload-outline" label={plan?.counts.ny ? `Importer ${plan.counts.ny}` : 'Importer'} disabled={!plan?.counts.ny} busy={busy} onPress={run} /> : null}
        </>
      )}
    >
      <Text style={{ color: colors.ink, fontSize: 13 }}>
        Velg et regneark (.xlsx, .xlsm eller .csv). Makrofiler går fint, bare verdiene leses. Eksporter SharePoint-lister til Excel eller CSV først. Hver rad blir én post. Rader som er importert før, hoppes over.
      </Text>
      <Row>
        <Btn icon="document-attach-outline" label={file ? 'Velg en annen fil' : 'Velg regneark'} onPress={pick} />
        {file ? <Pill label={file.name} icon="grid-outline" /> : null}
      </Row>
      {err ? <Banner tone="danger" text={err} /> : null}
      {done ? <Banner tone="ok" text={done} /> : null}
      {file && !done ? (
        <>
          {sheets.length > 1 ? (
            <Field label="Ark">
              <Choice options={sheets.map((s, i) => ({ id: String(i), label: `${s.name}${s.hidden ? ' (skjult)' : ''}` }))} value={String(sheetIx)} onChange={(x) => startSheet(sheets, Number(x) || 0)} />
            </Field>
          ) : null}
          <Field label="Overskriftsrad" hint={headers.filter(Boolean).slice(0, 6).join(' · ') || 'Raden er tom'}>
            <TextIn
              keyboardType="numeric"
              value={String(headerRow + 1)}
              onChangeText={(x) => {
                const n = Math.max(1, Math.min(rows.length, Number(x) || 1)) - 1;
                setHeaderRow(n);
                setMapping(suggestMapping(rows[n] || [], registerKey));
              }}
            />
          </Field>
          <Text style={{ color: colors.ink, fontSize: 14, fontWeight: '700' }}>Kolonner</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Forslaget bygger på overskriftene. Endre der det ikke stemmer.</Text>
          {fields.map((f) => {
            const col = mapping[f.key] ?? -1;
            const needsDefault = f.required && col < 0;
            return (
              <View key={f.key} style={{ gap: 6 }}>
                <Field label={f.label} required={f.required}>
                  <Choice small options={columnOptions} value={String(col)} onChange={(x) => setMapping({ ...mapping, [f.key]: Number(x ?? -1) })} />
                </Field>
                {needsDefault && f.type === 'select' ? (
                  <Field label={`${f.label} for alle rader`}>
                    <Choice small options={f.options} value={defaults[f.key] || ''} onChange={(x) => setDefaults({ ...defaults, [f.key]: x || '' })} />
                  </Field>
                ) : null}
                {needsDefault && f.type === 'person' ? (
                  <Field label={`${f.label} for alle rader`}>
                    <PersonPick people={people} value={defaults[f.key] || ''} onChange={(p) => setDefaults({ ...defaults, [f.key]: p.name, ...(f.key === 'ownerName' ? { ownerUid: p.uid } : {}) })} />
                  </Field>
                ) : null}
                {needsDefault && f.type === 'ref' ? (
                  <Field label={`${f.label} for alle rader`}>
                    <Choice
                      small
                      options={(f.ref === 'process' ? state.processes : (f.ref === 'requirement' ? state.requirements : state.records[f.ref]) || [])
                        .filter((r) => r.state !== 'arkivert' && !r.archived)
                        .map((r) => ({ id: r.id, label: [r.code || r.number, r.title].filter(Boolean).join(' ') }))}
                      value={defaults[f.key] || ''}
                      onChange={(x) => setDefaults({ ...defaults, [f.key]: x || '' })}
                    />
                  </Field>
                ) : null}
                {needsDefault && !['select', 'person', 'ref'].includes(f.type) ? (
                  <Field label={`${f.label} for alle rader`}>
                    <TextIn value={String(defaults[f.key] ?? '')} onChangeText={(x) => setDefaults({ ...defaults, [f.key]: x })} />
                  </Field>
                ) : null}
              </View>
            );
          })}
          <Field label="Mellomoverskrifter i arket" hint="Rader med bare én utfylt celle, f.eks. en kategori over en gruppe risikoer.">
            <Choice small options={groupOptions} value={groupField || 'none'} onChange={(x) => setGroupField(x && x !== 'none' ? x : '')} />
          </Field>
          {plan ? (
            <View style={{ gap: 6 }}>
              <Row>
                <Pill label={`${plan.counts.ny} nye`} tone={plan.counts.ny ? 'ok' : 'muted'} />
                {plan.counts.finnes ? <Pill label={`${plan.counts.finnes} importert før`} /> : null}
                {plan.counts.feil ? <Pill label={`${plan.counts.feil} med feil`} tone="warn" /> : null}
              </Row>
              {newRows.slice(0, 4).map((r) => <Text key={`n${r.index}`} style={{ color: colors.ink, fontSize: 12 }}>• Rad {r.index + 1}: {r.label}</Text>)}
              {newRows.length > 4 ? <Text style={{ color: colors.muted, fontSize: 12 }}>… og {newRows.length - 4} til.</Text> : null}
              {errorRows.slice(0, 6).map((r) => <Text key={`e${r.index}`} style={{ color: colors.warn, fontSize: 12 }}>• Rad {r.index + 1} ({r.label}): {r.errors.slice(0, 2).join(' ')}</Text>)}
              {errorRows.length > 6 ? <Text style={{ color: colors.muted, fontSize: 12 }}>… og {errorRows.length - 6} rader til med feil. Rader med feil hoppes over.</Text> : null}
            </View>
          ) : null}
        </>
      ) : null}
    </Sheet>
  );
}
