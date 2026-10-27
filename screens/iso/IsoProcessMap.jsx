/**
 * Prosesskart (prosesslandskap) generert fra prosessene: ledelsesprosesser øverst,
 * verdikjeden (kjerneprosesser i rekkefølge) i midten og støtteprosesser nederst.
 * Hver boks er trykkbar og åpner prosessen. Ingen tegning – kartet følger dataene.
 */
import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';

const WEB = Platform.OS === 'web';
// Pilene i verdikjeden: hakk inn til venstre, spiss til høyre.
const NOTCH = 10;
const TIP = 14;
// Smalere enn dette blir navnene delt midt i ordet; da brytes kjeden heller over flere rader.
const CHAIN_MIN = 150;
const CHAIN_GAP = 4;

export function sortProcesses(list) {
  return [...(list || [])].sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999)
    || String(a.code || '').localeCompare(String(b.code || ''), 'nb', { numeric: true })
    || String(a.title).localeCompare(String(b.title), 'nb'));
}

function BoxText({ proc, colors, live, lines = 2 }) {
  return (
    <>
      {proc.code ? <Text style={{ color: colors.muted, fontSize: 10, fontWeight: '700' }}>{proc.code}</Text> : null}
      {/* Lange sammensatte ord deles med bindestrek (nettleseren, lang="nb") i stedet for midt i ordet. */}
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700', ...(WEB ? { hyphens: 'auto', WebkitHyphens: 'auto' } : {}) }} numberOfLines={lines}>{proc.title}</Text>
      <Text style={{ color: live ? colors.brand : colors.muted, fontSize: 10 }}>{live ? `v${proc.publishedVersion} i bruk` : 'utkast'}</Text>
    </>
  );
}

function Box({ proc, onOpen, colors }) {
  const live = !!proc.publishedVersion;
  return (
    <Pressable
      onPress={() => onOpen(proc.id)}
      accessibilityRole="button"
      accessibilityLabel={`Åpne prosess ${proc.code || ''} ${proc.title}`}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: 150,
        minHeight: 64,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: live ? colors.brand : colors.line,
        borderStyle: live ? 'solid' : 'dashed',
        backgroundColor: pressed ? colors.brandSoft : (live ? `${colors.brand}10` : colors.card),
        justifyContent: 'center',
        gap: 2,
        ...(WEB ? { cursor: 'pointer' } : {}),
      })}
    >
      <BoxText proc={proc} colors={colors} live={live} />
    </Pressable>
  );
}

/** Omrisset til en pil, en halv strek innenfor kanten så rammen ikke kappes. */
function chevronPoints(w, h, last) {
  const s = 1;
  const right = last ? [[w - s, s], [w - s, h - s]] : [[w - TIP, s], [w - s, h / 2], [w - TIP, h - s]];
  return [[s, s], ...right, [s, h - s], [NOTCH, h / 2]].map(([x, y]) => `${x},${y}`).join(' ');
}

/** Prosess i verdikjeden. Rammen tegnes som en pil, så den følger hakket og spissen hele veien rundt. */
function Chevron({ proc, onOpen, colors, last, width }) {
  const live = !!proc.publishedVersion;
  const [size, setSize] = useState(null);
  return (
    <Pressable
      onPress={() => onOpen(proc.id)}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setSize((cur) => (cur && cur.w === w && cur.h === h ? cur : { w, h }));
      }}
      accessibilityRole="button"
      accessibilityLabel={`Åpne prosess ${proc.code || ''} ${proc.title}`}
      style={{
        ...(width ? { width } : { flexGrow: 1, flexBasis: CHAIN_MIN }),
        minHeight: 64,
        paddingVertical: 10,
        paddingLeft: NOTCH + 8,
        paddingRight: last ? 10 : TIP + 6,
        justifyContent: 'center',
        gap: 2,
        ...(WEB ? { cursor: 'pointer' } : {}),
      }}
    >
      {({ pressed }) => (
        <>
          {size ? (
            <Svg pointerEvents="none" width={size.w} height={size.h} style={{ position: 'absolute', left: 0, top: 0 }}>
              <Polygon
                points={chevronPoints(size.w, size.h, last)}
                fill={(pressed ? colors.brandSoft : (live ? `${colors.brand}10` : colors.card)) || 'none'}
                stroke={(live ? colors.brand : colors.line) || 'none'}
                strokeWidth={1.5}
                strokeDasharray={live ? undefined : '5,4'}
                strokeLinejoin="round"
              />
            </Svg>
          ) : null}
          <BoxText proc={proc} colors={colors} live={live} lines={3} />
        </>
      )}
    </Pressable>
  );
}

/** Kjernene i rekkefølge. Får de ikke plass på én rad, fordeles de jevnt på flere (7 → 4 + 3). */
function Chain({ core, onOpen, colors }) {
  const [w, setW] = useState(0);
  const perRow = w ? Math.max(1, Math.min(core.length, Math.floor((w + CHAIN_GAP) / (CHAIN_MIN + CHAIN_GAP)))) : core.length;
  const each = Math.ceil(core.length / Math.ceil(core.length / perRow));
  const width = w ? Math.floor((w - CHAIN_GAP * (each - 1)) / each) : 0;
  return (
    <View
      onLayout={(e) => setW(Math.floor(e.nativeEvent.layout.width))}
      style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: CHAIN_GAP }}
    >
      {core.map((p, i) => <Chevron key={p.id} proc={p} onOpen={onOpen} colors={colors} last={i === core.length - 1} width={width} />)}
    </View>
  );
}

function Band({ label, icon, children, colors }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name={icon} size={14} color={colors.muted} />
        <Text style={{ color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>{label.toUpperCase()}</Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'stretch' }}>{children}</View>
    </View>
  );
}

export default function IsoProcessMap({ processes, onOpen, wide }) {
  const colors = useColors();
  const live = (processes || []).filter((p) => !p.archived);
  const lead = sortProcesses(live.filter((p) => p.category === 'ledelse'));
  const core = sortProcesses(live.filter((p) => p.category === 'kjerne'));
  const support = sortProcesses(live.filter((p) => p.category === 'stotte'));
  if (!live.length) return null;
  return (
    <View style={{ gap: 14, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card }}>
      {lead.length ? <Band label="Ledelsesprosesser" icon="ribbon-outline" colors={colors}>{lead.map((p) => <Box key={p.id} proc={p} onOpen={onOpen} colors={colors} />)}</Band> : null}
      {core.length ? (
        <Band label="Verdikjeden – kjerneprosesser" icon="arrow-forward-circle-outline" colors={colors}>
          <View style={{ flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: 8, width: '100%' }}>
            <View style={{ padding: 8, borderRadius: 10, backgroundColor: colors.sunken, minWidth: 92 }}>
              <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center' }}>Kundens behov og krav</Text>
            </View>
            <Chain core={core} onOpen={onOpen} colors={colors} />
            <View style={{ padding: 8, borderRadius: 10, backgroundColor: colors.successSoft, minWidth: 92 }}>
              <Text style={{ color: colors.ink, fontSize: 11, textAlign: 'center' }}>Fornøyd kunde</Text>
            </View>
          </View>
        </Band>
      ) : null}
      {support.length ? <Band label="Støtteprosesser" icon="construct-outline" colors={colors}>{support.map((p) => <Box key={p.id} proc={p} onOpen={onOpen} colors={colors} />)}</Band> : null}
      <Text style={{ color: colors.muted, fontSize: 11 }}>Trykk på en prosess for å se kartet, styrende dokumenter og risiko. Stiplet ramme = ikke publisert ennå.</Text>
    </View>
  );
}
