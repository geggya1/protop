import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { CPV_CODES, TENDER_AREAS } from '../../src/project/tenderCatalog';
import { fetchDoffinNotices } from '../../src/project/doffinClient';
import {
  formatNok,
  formatWhen,
  mergeTenderNotices,
  normalizeCpvCode,
  saveTenderWatch,
  watchQuery,
} from '../../src/project/tenders';

function Chip({ label, on, onPress, colors }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      accessibilityRole="button"
      style={{
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: on ? colors.brand : colors.sunken,
      }}
    >
      <Text style={{ color: on ? '#fff' : colors.ink, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function TenderWatchSection({ state, run, colors, Field, Btn, styles }) {
  const watch = state.tenderWatch;
  const [companyName, setCompanyName] = useState(watch.companyName || '');
  const [selectedCpv, setSelectedCpv] = useState(() => new Set(watch.cpvCodes.map((row) => row.code)));
  const [customCpv, setCustomCpv] = useState('');
  const [nationwide, setNationwide] = useState(!!watch.nationwide);
  const [selectedAreas, setSelectedAreas] = useState(() => new Set(watch.areas.map((row) => row.id)));
  const [cpvQuery, setCpvQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState('');

  useEffect(() => {
    setCompanyName(watch.companyName || '');
    setSelectedCpv(new Set(watch.cpvCodes.map((row) => row.code)));
    setNationwide(!!watch.nationwide);
    setSelectedAreas(new Set(watch.areas.map((row) => row.id)));
  }, [watch.savedAt]);

  const query = watchQuery(watch);
  const notices = state.tenderNotices || [];
  const freshCount = notices.filter((row) => row.isNew).length;
  const stateRef = useRef(state);
  stateRef.current = state;

  const visibleCpv = useMemo(() => {
    const q = cpvQuery.trim().toLowerCase();
    if (!q) return CPV_CODES;
    return CPV_CODES.filter((row) => `${row.code} ${row.label}`.toLowerCase().includes(q));
  }, [cpvQuery]);

  function toggleSet(setter, value) {
    setter((current) => {
      const next = new Set(current);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  function currentInput() {
    const codes = [...selectedCpv].map((code) => {
      const known = CPV_CODES.find((row) => row.code === code);
      return { code, label: known?.label || `CPV ${code}` };
    });
    return {
      companyName,
      cpvCodes: codes,
      nationwide,
      areas: [...selectedAreas].map((id) => TENDER_AREAS.find((row) => row.id === id)).filter(Boolean),
    };
  }

  async function refresh(nextState) {
    const active = watchQuery(nextState.tenderWatch);
    if (!active) return;
    setSyncing(true);
    setSyncError('');
    try {
      const data = await fetchDoffinNotices(active);
      run(mergeTenderNotices(nextState, data?.hits, data?.fetchedAt));
    } catch (err) {
      setSyncError(err?.message || 'Kunne ikke oppdatere fra Doffin.');
    } finally {
      setSyncing(false);
    }
  }

  const queryKey = query ? `${query.cpvCodes.join(',')}|${query.locationIds.join(',')}` : '';

  useEffect(() => {
    if (!queryKey) return undefined;
    let live = true;
    const tick = () => {
      if (live) refresh(stateRef.current);
    };
    tick();
    const timer = setInterval(tick, 60 * 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [queryKey]);

  return (
    <View style={styles.stack}>
      <Text style={[styles.h2, { color: colors.ink }]}>Anbudsvarsel</Text>
      <Text style={{ color: colors.muted }}>
        Registrer bedriftens CPV-koder og område. Lista viser aktive konkurranser fra Doffin som treffer, og oppdateres fortløpende.
      </Text>
      <Field label="Bedrift" value={companyName} onChangeText={setCompanyName} placeholder="Firmanavn" colors={colors} />
      <Field label="Søk i CPV" value={cpvQuery} onChangeText={setCpvQuery} placeholder="Kode eller fag, f.eks. elektro" colors={colors} />
      <View style={styles.rowWrap}>
        {visibleCpv.map((row) => (
          <Chip
            key={row.code}
            colors={colors}
            on={selectedCpv.has(row.code)}
            label={`${row.code.slice(0, 4)} ${row.label}`}
            onPress={() => toggleSet(setSelectedCpv, row.code)}
          />
        ))}
      </View>
      <Field label="Egen CPV-kode" value={customCpv} onChangeText={setCustomCpv} placeholder="8 siffer, f.eks. 45233120" colors={colors} />
      <Btn
        label="Legg til kode"
        tone="quiet"
        colors={colors}
        onPress={() => {
          const code = normalizeCpvCode(customCpv);
          if (!code) return;
          setSelectedCpv((current) => new Set(current).add(code));
          setCustomCpv('');
        }}
      />
      <Text style={[styles.label, { color: colors.muted }]}>Område</Text>
      <View style={styles.rowWrap}>
        <Chip label="Hele Norge" colors={colors} on={nationwide} onPress={() => setNationwide((value) => !value)} />
        {!nationwide && TENDER_AREAS.map((area) => (
          <Chip
            key={area.id}
            colors={colors}
            on={selectedAreas.has(area.id)}
            label={area.name}
            onPress={() => toggleSet(setSelectedAreas, area.id)}
          />
        ))}
      </View>
      <Btn
        label="Lagre forespørsel"
        colors={colors}
        onPress={() => {
          const result = saveTenderWatch(state, currentInput());
          run(result, () => {
            if (result.ok) refresh(result.state);
          });
        }}
      />
      {watch.savedAt ? (
        <View style={[styles.summary, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.summaryTitle, { color: colors.ink }]}>{watch.companyName}</Text>
          <Text style={{ color: colors.muted }}>
            {watch.cpvCodes.map((row) => row.code).join(', ')}
            {' · '}
            {watch.nationwide ? 'Hele Norge' : watch.areas.map((row) => row.name).join(', ')}
          </Text>
          <Text style={{ color: colors.muted }}>
            {syncing ? 'Henter fra Doffin …' : state.tenderSyncedAt ? `Oppdatert ${formatWhen(state.tenderSyncedAt)}` : 'Ikke hentet ennå'}
            {` · ${notices.length} aktive`}
            {freshCount ? ` · ${freshCount} nye` : ''}
          </Text>
          <Btn label="Oppdater nå" tone="quiet" colors={colors} onPress={() => refresh(state)} />
        </View>
      ) : null}
      {syncError ? <Text style={[styles.error, { color: colors.danger }]}>{syncError}</Text> : null}
      {watch.savedAt && !notices.length && !syncing ? (
        <Text style={{ color: colors.muted }}>Ingen aktive kunngjøringer treffer kodene i valgt område.</Text>
      ) : null}
      {notices.map((row) => (
        <View key={row.id} style={[styles.card, { borderColor: row.isNew ? colors.brand : colors.line, backgroundColor: colors.card }]}>
          <View style={styles.rowWrap}>
            {row.isNew ? <Text style={{ color: colors.brand, fontWeight: '800' }}>Ny</Text> : null}
            <Text style={{ color: colors.muted }}>{row.id}</Text>
          </View>
          <Text style={{ color: colors.ink, fontWeight: '700', fontSize: 16 }}>{row.title}</Text>
          <Text style={{ color: colors.ink }}>{row.buyer || 'Ukjent oppdragsgiver'}</Text>
          <Text style={{ color: colors.muted }}>
            {[row.places.join(', ') || 'Sted ikke oppgitt', row.deadline ? `Frist ${formatWhen(row.deadline)}` : 'Uten frist', formatNok(row.amount)].filter(Boolean).join(' · ')}
          </Text>
          {row.description ? (
            <Text style={{ color: colors.muted }} numberOfLines={3}>{row.description}</Text>
          ) : null}
          <TouchableOpacity onPress={() => Linking.openURL(row.url)} accessibilityRole="link">
            <Text style={{ color: colors.brand, fontWeight: '700' }}>Åpne på Doffin</Text>
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}
