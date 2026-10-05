import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { formatMatchExplain, formatSources } from '../../src/anbud/model';

function sourceUrl(notice, source) {
  if (source === 'ted') return notice?.tedUrl || (notice?.source === 'ted' ? notice.url : '');
  return notice?.doffinUrl || (notice?.source === 'ted' ? '' : notice?.url) || notice?.url || '';
}

export default function MatchInfoBar({ notice, watch, colors }) {
  const explain = formatMatchExplain(notice, watch);
  const sources = explain.sources.length ? explain.sources : ['doffin'];
  return (
    <View style={[styles.bar, { borderColor: colors.line, backgroundColor: colors.sunken }]}>
      <Text style={[styles.title, { color: colors.ink }]}>Hvorfor treff</Text>
      {explain.cpv.length ? (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.muted }]}>Match på CPV-koder</Text>
          {explain.cpv.map((row) => (
            <Text key={row.code} style={{ color: colors.ink }}>
              {row.code}{row.label ? ` ${row.label}` : ''}
            </Text>
          ))}
        </View>
      ) : (
        <Text style={{ color: colors.muted }}>Treff fra CPV-søket, uten treff på en konkret kode i kunngjøringen.</Text>
      )}
      {explain.keywords.length ? (
        <View style={styles.block}>
          <Text style={[styles.label, { color: colors.muted }]}>Match på søkeord</Text>
          <Text style={{ color: colors.ink }}>{explain.keywords.join(', ')}</Text>
        </View>
      ) : null}
      <Text style={{ color: colors.muted }}>
        {sources.length > 1
          ? `Samme kunngjøring hos ${formatSources(notice)}. Vises som ett treff.`
          : `Kilde: ${formatSources(notice)}`}
      </Text>
      {sources.length > 1 ? (
        <View style={styles.links}>
          {sources.map((source) => {
            const url = sourceUrl(notice, source);
            const label = source === 'ted' ? 'TED' : 'Doffin';
            if (!url) return null;
            return (
              <TouchableOpacity key={source} onPress={() => Linking.openURL(url)} accessibilityRole="link">
                <Text style={{ color: colors.brand }}>Åpne hos {label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  title: { fontSize: 13, fontWeight: '600' },
  label: { fontSize: 12, fontWeight: '400' },
  block: { gap: 2 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
