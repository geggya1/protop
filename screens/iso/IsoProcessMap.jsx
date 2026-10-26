/**
 * Prosesskart (prosesslandskap) generert fra prosessene: ledelsesprosesser øverst,
 * verdikjeden (kjerneprosesser i rekkefølge) i midten og støtteprosesser nederst.
 * Hver boks er trykkbar og åpner prosessen. Ingen tegning – kartet følger dataene.
 */
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../../src/context/ThemeContext';

export function sortProcesses(list) {
  return [...(list || [])].sort((a, b) => (Number(a.order) || 999) - (Number(b.order) || 999)
    || String(a.code || '').localeCompare(String(b.code || ''), 'nb', { numeric: true })
    || String(a.title).localeCompare(String(b.title), 'nb'));
}

function Box({ proc, onOpen, chevron, colors, last }) {
  const live = !!proc.publishedVersion;
  return (
    <Pressable
      onPress={() => onOpen(proc.id)}
      accessibilityRole="button"
      accessibilityLabel={`Åpne prosess ${proc.code || ''} ${proc.title}`}
      style={({ pressed }) => ({
        flexGrow: 1,
        flexBasis: chevron ? 128 : 150,
        minHeight: 64,
        paddingVertical: 10,
        paddingLeft: chevron ? 18 : 12,
        paddingRight: chevron && !last ? 22 : 12,
        borderRadius: chevron ? 6 : 12,
        borderWidth: 1.5,
        borderColor: live ? colors.brand : colors.line,
        borderStyle: live ? 'solid' : 'dashed',
        backgroundColor: pressed ? colors.brandSoft : (live ? `${colors.brand}10` : colors.card),
        justifyContent: 'center',
        gap: 2,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
        ...(chevron && Platform.OS === 'web' ? { clipPath: last ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 10px 50%)' : 'polygon(0 0, calc(100% - 14px) 0, 100% 50%, calc(100% - 14px) 100%, 0 100%, 10px 50%)' } : {}),
      })}
    >
      {proc.code ? <Text style={{ color: colors.muted, fontSize: 10, fontWeight: '700' }}>{proc.code}</Text> : null}
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: '700' }} numberOfLines={2}>{proc.title}</Text>
      <Text style={{ color: live ? colors.brand : colors.muted, fontSize: 10 }}>{live ? `v${proc.publishedVersion} i bruk` : 'utkast'}</Text>
    </Pressable>
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
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
              {core.map((p, i) => <Box key={p.id} proc={p} onOpen={onOpen} chevron colors={colors} last={i === core.length - 1} />)}
            </View>
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
