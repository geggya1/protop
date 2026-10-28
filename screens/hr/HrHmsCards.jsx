import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { hmsCardAlerts, siteOverviewCsv, siteOverviewRows } from '../../src/hr/hmsCard';
import { localIsoDate } from '../../src/hr/model';
import { EmptyHint, HrButton, HrCard, HrField, HrSectionTitle } from './HrShared';

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localIsoDate(d);
}

function isoFromInput(value) {
  const raw = String(value || '').trim();
  const nb = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (nb) return `${nb[3]}-${nb[2].padStart(2, '0')}-${nb[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : '';
}

function downloadCsv(filename, csv) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false;
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

/**
 * HMS-kort som er utløpt eller går ut snart, og daglig oversiktsliste for byggeplass
 * (byggherreforskriften § 15) fra timeføringen. entries er timene HR har lastet (tre måneder),
 * company er { name, orgnr } for arbeidsgiveren.
 */
export default function HrHmsCards({ colors, employees, hr, entries, company = null }) {
  const [from, setFrom] = useState(() => daysAgo(6));
  const [to, setTo] = useState(() => localIsoDate());
  const [project, setProject] = useState('');
  const [note, setNote] = useState('');
  const notApplicable = useMemo(
    () => (hr?.compliance || []).filter((row) => row.catalogId === 'hms_card' && row.status === 'na').map((row) => row.employeeId),
    [hr?.compliance],
  );
  const alerts = useMemo(
    () => hmsCardAlerts(employees, hr?.hmsCards || [], { notApplicable }),
    [employees, hr?.hmsCards, notApplicable],
  );
  const range = { from: isoFromInput(from), to: isoFromInput(to) };
  const wanted = project.trim().toLowerCase();
  const rows = useMemo(() => siteOverviewRows({
    entries: (entries || []).filter((row) => !wanted
      || String(row.projectNumber || '').toLowerCase() === wanted
      || String(row.projectName || '').toLowerCase().includes(wanted)),
    employees,
    cards: hr?.hmsCards || [],
    employer: { name: company?.name || '', orgnr: company?.orgnr || '' },
    from: range.from,
    to: range.to,
  }), [entries, employees, hr?.hmsCards, company, range.from, range.to, wanted]);
  const withoutCard = rows.filter((row) => row.hmsStatus === 'missing' || row.hmsStatus === 'expired').length;

  function exportList() {
    if (!rows.length) {
      setNote('Ingen timer i perioden.');
      return;
    }
    const name = `oversiktsliste-${wanted ? `${wanted.replace(/\W+/g, '-')}-` : ''}${range.from || 'fra'}-${range.to || 'til'}.csv`;
    const done = downloadCsv(name, siteOverviewCsv(rows));
    setNote(done ? `Oversiktslisten er lastet ned (${rows.length} rader).` : 'Oversiktslisten kan lastes ned i nettleseren.');
  }

  return (
    <HrCard colors={colors}>
      <View nativeID="hr-hms-cards" style={styles.stack}>
        <HrSectionTitle
          colors={colors}
          title="HMS-kort og oversiktsliste"
          subtitle="Kort som er utløpt eller går ut innen 30 dager, og daglig oversiktsliste for byggeplass fra timeføringen (byggherreforskriften § 15)."
        />
        {alerts.length ? alerts.map((row) => (
          <Text key={row.employeeId} style={[styles.line, { color: row.status === 'expired' ? colors.danger : colors.ink }]}>
            {`${row.name}: HMS-kort ${row.number} · ${row.text}`}
          </Text>
        )) : (
          <EmptyHint colors={colors} text="Ingen HMS-kort er utløpt eller går ut de neste 30 dagene." />
        )}
        <View style={styles.row}>
          <View style={styles.field}><HrField colors={colors} label="Fra dato" value={from} onChangeText={setFrom} placeholder="dd.mm.åååå" /></View>
          <View style={styles.field}><HrField colors={colors} label="Til dato" value={to} onChangeText={setTo} placeholder="dd.mm.åååå" /></View>
          <View style={styles.field}><HrField colors={colors} label="Prosjekt (nummer eller navn, tomt: alle)" value={project} onChangeText={setProject} /></View>
        </View>
        <Text style={[styles.line, { color: colors.muted }]} nativeID="hr-hms-overview-count">
          {`${rows.length} rader: navn, fødselsdato, arbeidsgiver, org.nr., HMS-kort og timer per dag og prosjekt.${withoutCard ? ` ${withoutCard} rader mangler gyldig HMS-kort.` : ''}`}
        </Text>
        <HrButton colors={colors} label="Last ned oversiktsliste (CSV)" icon="download-outline" nativeID="hr-hms-overview-export" onPress={exportList} />
        {note ? <Text style={[styles.line, { color: colors.brand }]}>{note}</Text> : null}
      </View>
    </HrCard>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 8 },
  line: { fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  field: { flexGrow: 1, flexBasis: 180 },
});
