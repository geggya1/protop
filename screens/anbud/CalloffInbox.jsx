import React from 'react';
import { Linking, Text, TouchableOpacity, View } from 'react-native';
import { calloffNotices, linkCalloff, suggestFramework } from '../../src/anbud/desk.js';
import { useLayout } from '../../src/theme';
import InfoButton from '../../components/InfoButton';

export default function CalloffInbox({ state, colors, onCommit, onOpenBid }) {
  const { isPhone } = useLayout();
  const rows = calloffNotices(state?.notices);
  const frames = (state?.contracts || []).filter((row) => row.kind === 'rammeavtale');
  const about = 'Avrop som er publisert åpent på Doffin. Interesse og tilbud melder bedriften selv i portalen, med sitt eget brukernavn.';
  return (
    <View style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 18 }}>Avrop</Text>
        {isPhone ? <InfoButton title="Avrop">{about}</InfoButton> : null}
      </View>
      {isPhone ? null : <Text style={{ color: colors.muted }}>{about}</Text>}
      {rows.map((row) => {
        const suggested = suggestFramework(row, state?.contracts);
        const linked = (state?.contracts || []).find((item) => item.id === row.frameworkId) || suggested;
        return (
          <View key={row.id} style={{ gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 }}>
            <Text style={{ color: colors.ink, fontWeight: '600' }}>{row.title}</Text>
            <Text style={{ color: colors.muted }}>{row.buyer || 'Oppdragsgiver ikke oppgitt'}{row.deadline ? ` · frist ${String(row.deadline).slice(0, 10)}` : ''}</Text>
            <Text style={{ color: colors.ink }}>
              {linked ? `Rammeavtale: ${linked.title || linked.id}` : 'Ingen rammeavtale er koblet.'}
            </Text>
            {row.brief?.summary ? <Text style={{ color: colors.ink }}>{row.brief.summary}</Text> : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {row.url ? (
                <TouchableOpacity onPress={() => Linking.openURL(row.url)} accessibilityRole="link">
                  <Text style={{ color: colors.brand }}>Åpne kunngjøringen</Text>
                </TouchableOpacity>
              ) : null}
              {suggested && row.frameworkId !== suggested.id ? (
                <TouchableOpacity
                  onPress={() => {
                    const next = linkCalloff(state, row.id, suggested.id);
                    if (next.ok) onCommit(next.state);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.brand }}>Koble til {suggested.title || 'rammeavtalen'}</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={() => onOpenBid?.(row)} accessibilityRole="button">
                <Text style={{ color: colors.brand }}>Ta inn i vurdering</Text>
              </TouchableOpacity>
            </View>
            {frames.length && !linked ? (
              <Text style={{ color: colors.muted }}>{frames.length} rammeavtaler i kontraktregisteret kan kobles når oppdragsgiver stemmer.</Text>
            ) : null}
          </View>
        );
      })}
      {!rows.length ? (
        <Text style={{ color: colors.muted }}>Ingen åpne avrop i treffene. Oppdater anbudsvarslingen, så vises avrop som er publisert med ordet avrop i kunngjøringen.</Text>
      ) : null}
    </View>
  );
}
