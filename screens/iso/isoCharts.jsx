/**
 * Grafer for ISO / K-HMS. Bygget på reelle registerdata; hvert punkt kan klikkes for
 * drilldown, og hver graf har et tekstlig tabellalternativ (tilgjengelighet, fil 03).
 */
import React, { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { useColors } from '../../src/context/ThemeContext';
import { monthLabel } from '../../src/iso/core';
import { toneColor } from './isoUi';

function TableToggle({ open, onToggle }) {
  const colors = useColors();
  return (
    <TouchableOpacity onPress={onToggle} accessibilityRole="button" style={{ alignSelf: 'flex-start', paddingVertical: 4 }}>
      <Text style={{ color: colors.brand, fontSize: 12 }}>{open ? 'Skjul tabell' : 'Vis som tabell'}</Text>
    </TouchableOpacity>
  );
}

function DataTable({ head, rows }) {
  const colors = useColors();
  return (
    <View style={{ borderWidth: 1, borderColor: colors.line, borderRadius: 10 }}>
      <View style={{ flexDirection: 'row', backgroundColor: colors.sunken, padding: 8 }}>
        {head.map((h) => <Text key={h} style={{ flex: 1, color: colors.muted, fontSize: 12, fontWeight: '600' }}>{h}</Text>)}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={{ flexDirection: 'row', padding: 8, borderTopWidth: 1, borderColor: colors.line }}>
          {r.map((c, j) => <Text key={j} style={{ flex: 1, color: colors.ink, fontSize: 13 }}>{String(c)}</Text>)}
        </View>
      ))}
    </View>
  );
}

/** Gruppert stolpediagram: nye vs. lukkede per måned (G02/G08). */
export function TrendBars({ rows, onPick }) {
  const colors = useColors();
  const [table, setTable] = useState(false);
  const max = Math.max(1, ...rows.flatMap((r) => [r.opened.length, r.closed.length]));
  const total = rows.reduce((s, r) => s + r.opened.length + r.closed.length, 0);
  if (!total) {
    return <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen avvik registrert i perioden.</Text>;
  }
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 10 }} accessibilityLabel="Nye og lukkede avvik per måned">
        {rows.map((r) => (
          <View key={r.key} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 130, gap: 3 }}>
              {[['opened', colors.brand, 'nye'], ['closed', colors.success, 'lukkede']].map(([k, c, word]) => (
                <TouchableOpacity
                  key={k}
                  onPress={() => onPick?.({ ids: r[k], label: `${monthLabel(r.key)}: ${word}` })}
                  accessibilityRole="button"
                  accessibilityLabel={`${monthLabel(r.key)} ${word}: ${r[k].length}`}
                  style={{ width: 14, height: Math.max(2, (r[k].length / max) * 126), backgroundColor: c, borderRadius: 4 }}
                />
              ))}
            </View>
            <Text style={{ color: colors.muted, fontSize: 11 }}>{monthLabel(r.key)}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 14 }}>
        <Legend color={colors.brand} label="Nye" />
        <Legend color={colors.success} label="Lukkede" />
      </View>
      <TableToggle open={table} onToggle={() => setTable(!table)} />
      {table ? <DataTable head={['Måned', 'Nye', 'Lukkede']} rows={rows.map((r) => [monthLabel(r.key), r.opened.length, r.closed.length])} /> : null}
    </View>
  );
}

export function Legend({ color, label }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color }} />
      <Text style={{ color: colors.muted, fontSize: 12 }}>{label}</Text>
    </View>
  );
}

/** Ring for interne kravstatuser (G07). Ikke sertifiseringsgrad. */
export function StatusDonut({ data, onPick }) {
  const colors = useColors();
  const [table, setTable] = useState(false);
  const size = 150;
  const r = 58;
  const c = 2 * Math.PI * r;
  const total = data.segments.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  if (!total) return <Text style={{ color: colors.muted, fontSize: 13 }}>Ingen kravposter. Aktiver standarder under Innstillinger.</Text>;
  return (
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center' }}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} accessibilityLabel="Fordeling av intern vurderingsstatus">
            <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
              <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.line} strokeWidth={18} fill="none" />
              {data.segments.map((s) => {
                const len = (s.value / total) * c;
                const el = (
                  <Circle
                    key={s.id}
                    cx={size / 2}
                    cy={size / 2}
                    r={r}
                    stroke={segmentColor(colors, s)}
                    strokeWidth={18}
                    fill="none"
                    strokeDasharray={`${len} ${c - len}`}
                    strokeDashoffset={-offset}
                    onPress={() => onPick?.(s)}
                  />
                );
                offset += len;
                return el;
              })}
            </G>
          </Svg>
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
            <Text style={{ color: colors.ink, fontSize: 24, fontWeight: '700' }}>{total}</Text>
            <Text style={{ color: colors.muted, fontSize: 11 }}>kravposter</Text>
          </View>
        </View>
        <View style={{ gap: 6, flex: 1, minWidth: 160 }}>
          {data.segments.map((s) => (
            <TouchableOpacity key={s.id} onPress={() => onPick?.(s)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: segmentColor(colors, s) }} />
              <Text style={{ color: colors.ink, fontSize: 13, flex: 1 }}>{s.label}</Text>
              <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{s.value}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{data.method}</Text>
      <TableToggle open={table} onToggle={() => setTable(!table)} />
      {table ? <DataTable head={['Status', 'Antall']} rows={data.segments.map((s) => [s.label, s.value])} /> : null}
    </View>
  );
}

function segmentColor(colors, s) {
  if (s.id === 'internt_verifisert') return colors.success;
  if (s.id === 'dokumentert') return colors.brand;
  if (s.id === 'under_arbeid') return colors.warn;
  if (s.id === 'mangler' || s.id === 'avvik') return colors.danger;
  if (s.id === 'ma_revurderes') return '#a855f7';
  return '#94a3b8';
}

const RISK_BG = ['#bbf7d0', '#d9f99d', '#fde68a', '#fdba74', '#fca5a5'];

function riskTone(l, c) {
  const s = l * c;
  if (s >= 15) return 4;
  if (s >= 10) return 3;
  if (s >= 5) return 2;
  if (s >= 3) return 1;
  return 0;
}

/** 5×5 risikomatrise (G09). Tall + farge, ikke bare farge. */
export function RiskMatrix({ cells, onPick, method }) {
  const colors = useColors();
  const total = cells.flat().reduce((s, x) => s + x.length, 0);
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        <View style={{ justifyContent: 'center', width: 14 }}>
          <Text style={{ color: colors.muted, fontSize: 10, transform: [{ rotate: '-90deg' }], width: 120, marginLeft: -52 }}>Sannsynlighet →</Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          {[5, 4, 3, 2, 1].map((l) => (
            <View key={l} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
              <Text style={{ color: colors.muted, fontSize: 11, width: 12 }}>{l}</Text>
              {[1, 2, 3, 4, 5].map((c) => {
                const ids = cells[l - 1][c - 1];
                return (
                  <TouchableOpacity
                    key={c}
                    onPress={() => ids.length && onPick?.({ ids, label: `Sannsynlighet ${l} × konsekvens ${c}` })}
                    accessibilityRole="button"
                    accessibilityLabel={`Sannsynlighet ${l}, konsekvens ${c}: ${ids.length}`}
                    style={{ flex: 1, height: 34, borderRadius: 6, backgroundColor: RISK_BG[riskTone(l, c)], alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text style={{ color: '#0f172a', fontWeight: '700', fontSize: 13 }}>{ids.length || ''}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))}
          <View style={{ flexDirection: 'row', gap: 4, paddingLeft: 16 }}>
            {[1, 2, 3, 4, 5].map((c) => <Text key={c} style={{ flex: 1, textAlign: 'center', color: colors.muted, fontSize: 11 }}>{c}</Text>)}
          </View>
          <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center' }}>Konsekvens →</Text>
        </View>
      </View>
      <Text style={{ color: colors.muted, fontSize: 12 }}>{total ? `${total} vurderte poster. ` : 'Ingen vurderte risikoer ennå. '}{method || ''}</Text>
    </View>
  );
}

/** Horisontale stolper (G05/G06/G15). */
export function HBars({ rows, onPick, unit = '', showCumulative = false, empty = 'Ingen data.' }) {
  const colors = useColors();
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.some((r) => r.value)) return <Text style={{ color: colors.muted, fontSize: 13 }}>{empty}</Text>;
  return (
    <View style={{ gap: 8 }}>
      {rows.map((r) => (
        <TouchableOpacity key={r.label} onPress={() => r.value && onPick?.(r)} accessibilityRole="button" accessibilityLabel={`${r.label}: ${r.value}`} style={{ gap: 4 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.ink, fontSize: 13, flex: 1 }} numberOfLines={1}>{r.label}</Text>
            <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }}>{r.value}{unit}{showCumulative ? `  ·  ${r.cumulative} % kum.` : ''}</Text>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: colors.sunken }}>
            <View style={{ width: `${(r.value / max) * 100}%`, height: 8, borderRadius: 4, backgroundColor: r.color || colors.brand }} />
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Kompetanse-heatmap (G12). */
export function CompetenceHeatmap({ matrix, onPick }) {
  const colors = useColors();
  if (!matrix.length || !matrix[0].cells.length) return <Text style={{ color: colors.muted, fontSize: 13 }}>Legg inn kompetansekrav og ansatte for å se matrisen.</Text>;
  const tone = { gyldig: 'ok', utloper: 'warn', utlopt: 'danger', mangler: 'danger', cv: 'info', na: 'muted' };
  const label = { gyldig: 'Gyldig', utloper: 'Utløper', utlopt: 'Utløpt', mangler: 'Mangler', cv: 'I CV', na: '–' };
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        <Text style={{ width: 130, color: colors.muted, fontSize: 11 }}>Ansatt</Text>
        {matrix[0].cells.map((c) => <Text key={c.requirement.id} style={{ flex: 1, minWidth: 70, color: colors.muted, fontSize: 11 }} numberOfLines={2}>{c.requirement.title}</Text>)}
      </View>
      {matrix.map((row) => (
        <View key={row.person.id || row.person.name} style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <Text style={{ width: 130, color: colors.ink, fontSize: 12 }} numberOfLines={1}>{row.person.name}</Text>
          {row.cells.map((c) => {
            const col = toneColor(colors, tone[c.status]);
            return (
              <TouchableOpacity key={c.requirement.id} disabled={c.status === 'na'} onPress={() => onPick?.(row.person, c)} accessibilityRole="button" accessibilityLabel={`${row.person.name}, ${c.requirement.title}: ${label[c.status]}`} style={{ flex: 1, minWidth: 70, height: 30, borderRadius: 6, backgroundColor: `${col}26`, borderWidth: 1, borderColor: `${col}66`, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.ink, fontSize: 11 }}>{label[c.status]}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** Måloppnåelse med tidsserie (G11). Stiplet linje = måltall. */
export function ObjectiveSpark({ record }) {
  const colors = useColors();
  const pts = (record.measurements || []).slice(-12);
  if (!pts.length) return <Text style={{ color: colors.muted, fontSize: 12 }}>Ingen datagrunnlag ennå.</Text>;
  const target = Number(record.target);
  const values = [...pts.map((p) => p.value), Number.isFinite(target) ? target : null, Number(record.baseline)].filter((v) => Number.isFinite(v));
  const hi = Math.max(...values);
  const lo = Math.min(...values);
  const span = hi - lo || 1;
  const H = 70;
  const y = (v) => ((v - lo) / span) * (H - 14) + 6;
  return (
    <View style={{ height: H + 16 }} accessibilityLabel={`Målinger: ${pts.map((p) => `${p.period} ${p.value}`).join(', ')}. Mål ${record.target}.`}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: H }}>
        {pts.map((p) => (
          <View key={p.period} style={{ alignItems: 'center', gap: 2, width: 44 }}>
            <Text style={{ color: colors.ink, fontSize: 10 }}>{p.value}</Text>
            <View style={{ width: 22, height: y(p.value), backgroundColor: p.quality === 'Målt' ? colors.brand : `${colors.brand}66`, borderRadius: 4 }} />
          </View>
        ))}
      </View>
      {Number.isFinite(target) ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 16 + y(target), borderTopWidth: 1, borderStyle: 'dashed', borderColor: colors.success }} /> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {pts.map((p) => <Text key={p.period} style={{ width: 44, textAlign: 'center', color: colors.muted, fontSize: 10 }}>{p.period}</Text>)}
      </View>
    </View>
  );
}

/**
 * Månedsstolper for data fra andre moduler (kjørebok, fravær). Stablet når `parts` er gitt.
 * rows: [{ key: 'ÅÅÅÅ-MM', ...verdier }], parts: [{ key, label, color }].
 */
export function MonthBars({ rows, parts, unit = '', empty = 'Ingen data.' }) {
  const colors = useColors();
  const [table, setTable] = useState(false);
  const total = (r) => parts.reduce((s, p) => s + (Number(r[p.key]) || 0), 0);
  const max = Math.max(1, ...rows.map(total));
  if (!rows.some((r) => total(r) > 0)) return <Text style={{ color: colors.muted, fontSize: 13 }}>{empty}</Text>;
  const tones = parts.map((p, i) => p.color || (i === 0 ? colors.brand : colors.muted));
  return (
    <View style={{ gap: 8 }}>
      {table ? (
        <View style={{ gap: 2 }}>
          {rows.map((r) => (
            <View key={r.key} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={{ color: colors.muted, fontSize: 12, width: 70 }}>{r.key}</Text>
              {parts.map((p) => <Text key={p.key} style={{ color: colors.ink, fontSize: 12, flex: 1 }}>{p.label}: {r[p.key] || 0}{unit}</Text>)}
            </View>
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 4 }} accessibilityLabel={`Månedsverdier: ${rows.map((r) => `${r.key} ${total(r)}${unit}`).join(', ')}`}>
          {rows.map((r) => (
            <View key={r.key} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View style={{ width: '70%', height: 90, justifyContent: 'flex-end' }}>
                {parts.slice().reverse().map((p, i) => {
                  const v = Number(r[p.key]) || 0;
                  if (!v) return null;
                  return <View key={p.key} style={{ height: Math.max(2, (v / max) * 90), backgroundColor: tones[parts.length - 1 - i], borderTopLeftRadius: 3, borderTopRightRadius: 3 }} />;
                })}
              </View>
              <Text style={{ color: colors.muted, fontSize: 9 }}>{r.key.slice(5)}</Text>
            </View>
          ))}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        {parts.length > 1 ? parts.map((p, i) => <Legend key={p.key} color={tones[i]} label={p.label} />) : null}
        <TouchableOpacity onPress={() => setTable(!table)} accessibilityRole="button"><Text style={{ color: colors.brand, fontSize: 12, fontWeight: '600' }}>{table ? 'Vis graf' : 'Vis tabell'}</Text></TouchableOpacity>
      </View>
    </View>
  );
}
