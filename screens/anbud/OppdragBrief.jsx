import React, { useState } from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PINNED = new Set(['deadline', 'value', 'place', 'procedure', 'nature', 'framework', 'dps', 'duration', 'ceiling']);

function open(url) {
  if (!url) return;
  if (typeof window !== 'undefined' && typeof window.open === 'function') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(url).catch(() => {});
}

function weightNumber(raw) {
  const number = Number(String(raw || '').replace(',', '.'));
  if (!Number.isFinite(number) || number <= 0 || number > 100) return 0;
  return number;
}

function awardLine(awards) {
  return (awards || [])
    .map((row) => (weightNumber(row.weight) ? `${row.weight} % ${row.title}` : row.title))
    .filter(Boolean)
    .join(' · ');
}

export default function OppdragBrief({ brief, colors, loading = false, stacked = false }) {
  const [expanded, setExpanded] = useState(false);
  if (!brief) return null;
  const source = brief.source || 'Kunngjøringen';
  const facts = brief.facts || [];
  const pinned = facts.filter((row) => PINNED.has(row.id));
  const rest = facts.filter((row) => !PINNED.has(row.id));
  const awards = awardLine(brief.awards);
  const hasMore = !!(
    rest.length
    || brief.awards?.length
    || brief.selection?.length
    || brief.description
    || brief.outline
    || brief.extra
    || brief.lots?.length
    || brief.qa?.length
    || brief.links?.length
  );
  return (
    <View style={[styles.panel, stacked ? styles.panelStacked : styles.panelSide, { borderColor: colors.line, backgroundColor: colors.bg }]}>
      <Text style={{ color: colors.ink, fontWeight: '600' }}>Om oppdraget</Text>
      <Text style={{ color: colors.muted, fontSize: 12 }}>
        Offentlig informasjon fra kunngjøringen, slik at vurderingen kan gjøres her.
      </Text>
      {brief.noticeUrl ? (
        <TouchableOpacity
          onPress={() => open(brief.noticeUrl)}
          accessibilityRole="link"
          accessibilityLabel={`Åpne kunngjøringen på ${source}`}
          style={[styles.primary, { backgroundColor: colors.brand }]}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Åpne på {source}</Text>
        </TouchableOpacity>
      ) : null}
      {loading ? <Text style={{ color: colors.muted }}>Henter resten av kunngjøringen …</Text> : null}
      {pinned.length ? (
        <View style={styles.facts}>
          {pinned.map((row) => (
            <View key={row.id} style={[styles.pin, { backgroundColor: row.tone === 'danger' || row.tone === 'warn' ? colors.danger : colors.brandSoft }]}>
              <Text style={{ color: row.tone === 'danger' || row.tone === 'warn' ? '#fff' : colors.muted, fontSize: 12 }}>{row.label}</Text>
              <Text numberOfLines={expanded ? undefined : 2} style={{ color: row.tone === 'danger' || row.tone === 'warn' ? '#fff' : colors.ink, fontWeight: '600' }}>{row.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {!expanded && awards ? (
        <Text style={{ color: colors.ink, lineHeight: 20 }} numberOfLines={2}>Tildeling: {awards}</Text>
      ) : null}
      {!expanded && !pinned.length && brief.description ? (
        <Text style={{ color: colors.ink, lineHeight: 20 }} numberOfLines={3}>{brief.description}</Text>
      ) : null}
      {hasMore ? (
        <TouchableOpacity
          onPress={() => setExpanded((value) => !value)}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Text style={{ color: colors.brand, fontWeight: '600' }}>{expanded ? 'Vis mindre' : 'Vis mer om oppdraget'}</Text>
        </TouchableOpacity>
      ) : null}
      {expanded && brief.awards?.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Tildelingskriterier</Text>
          {brief.awards.map((row) => {
            const weight = weightNumber(row.weight);
            return (
              <View key={`${row.title}-${row.weight}`} style={{ gap: 4 }}>
                <Text style={{ color: colors.ink }}>
                  {weight ? `${row.weight} % · ` : ''}{row.title}
                </Text>
                {weight ? (
                  <View style={[styles.track, { backgroundColor: colors.sunken }]}>
                    <View style={{ width: `${weight}%`, height: '100%', backgroundColor: colors.brand }} />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {expanded && brief.selection?.length ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Kvalifikasjon</Text>
          {brief.selection.map((row) => (
            <View key={row.title} style={{ gap: 2 }}>
              <Text style={{ color: colors.ink, lineHeight: 20 }}>{row.title}</Text>
              {row.detail ? <Text style={{ color: colors.muted, lineHeight: 18 }}>Dokumentasjon: {row.detail}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
      {expanded && rest.length ? (
        <View style={styles.facts}>
          {rest.map((row) => (
            <View key={row.id} style={styles.fact}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{row.label}</Text>
              <Text style={{ color: row.tone === 'danger' || row.tone === 'warn' ? colors.danger : colors.ink, fontWeight: '600' }}>
                {row.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {expanded && brief.description ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Beskrivelse</Text>
          <Text style={{ color: colors.ink, lineHeight: 22 }}>{brief.description}</Text>
        </View>
      ) : null}
      {expanded && brief.outline ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Hovedtrekk i prosedyren</Text>
          <Text style={{ color: colors.ink, lineHeight: 22 }}>{brief.outline}</Text>
        </View>
      ) : null}
      {expanded && brief.extra ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Tilleggsinformasjon</Text>
          <Text style={{ color: colors.ink, lineHeight: 22 }}>{brief.extra}</Text>
        </View>
      ) : null}
      {expanded && brief.lots?.length ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Delkontrakter</Text>
          {brief.lots.map((lot) => <Text key={lot} style={{ color: colors.ink }}>{lot}</Text>)}
        </View>
      ) : null}
      {expanded && brief.qa?.length ? (
        <View style={{ gap: 4 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Spørsmål og svar</Text>
          {brief.qa.map((row) => (
            <Text key={row.question} style={{ color: colors.ink, lineHeight: 20 }}>
              {row.question}{row.answer ? `: ${row.answer}` : ''}
            </Text>
          ))}
        </View>
      ) : null}
      {expanded && brief.links?.length ? (
        <View style={{ gap: 8 }}>
          <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 13 }}>Lenker</Text>
          {brief.links.map((link) => (
            <TouchableOpacity
              key={`${link.label}-${link.url}`}
              onPress={() => open(link.url)}
              accessibilityRole="link"
              accessibilityLabel={link.label}
            >
              <Text style={{ color: colors.brand, fontWeight: '600' }}>{link.label}</Text>
              {/^https?:/i.test(link.url) ? (
                <Text style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>{link.url}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {!facts.length && !brief.description && !brief.links?.length && !brief.awards?.length && !loading ? (
        <Text style={{ color: colors.muted }}>Kunngjøringen har ikke lagt ut mer tekst enn tittelen ennå.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 10 },
  panelSide: { flex: 1, minWidth: 280 },
  // I en kolonne må kortet ta sin egen høyde. flex:1 (basis 0) legger det oppå skjemaet.
  panelStacked: { width: '100%', minWidth: 0, alignSelf: 'stretch' },
  primary: { alignSelf: 'flex-start', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pin: { minWidth: 140, flexGrow: 1, gap: 2, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  fact: { minWidth: 140, flexGrow: 1, gap: 2 },
  track: { height: 8, borderRadius: 99, overflow: 'hidden' },
});
