import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { PIPELINE_COLUMNS, pipelineBoard, pipelineStats, setPipelineStage } from '../../src/anbud/desk.js';

const NEXT = {
  planlegging: 'gjennomforing',
  gjennomforing: 'levert',
  levert: 'kontrakt',
  kontrakt: 'kontrakt',
  tapt: 'tapt',
  trukket: 'trukket',
};

export default function PipelineBoard({ state, colors, onCommit, onOpenBid }) {
  const board = pipelineBoard(state?.bids || []);
  const stats = pipelineStats(state?.bids || []);
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: colors.ink, fontWeight: '600', fontSize: 18 }}>Pipeline</Text>
      <Text style={{ color: colors.muted }}>
        {stats.open} åpne
        {stats.winRate == null ? '' : ` · win rate ${stats.winRate} %`}
        {stats.value ? ` · verdi i løpet ${Math.round(stats.value).toLocaleString('nb-NO')} kr` : ''}
      </Text>
      {board.map((column) => (
        <View key={column.id} style={{ gap: 6, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 10 }}>
          <Text style={{ color: colors.ink, fontWeight: '600' }}>{column.label} ({column.bids.length})</Text>
          {column.bids.map((bid) => (
            <View key={bid.id} style={{ gap: 4, paddingVertical: 6 }}>
              <TouchableOpacity onPress={() => onOpenBid?.(bid.id)} accessibilityRole="button">
                <Text style={{ color: colors.ink, fontWeight: '600' }}>{bid.title || 'Tilbud'}</Text>
              </TouchableOpacity>
              <Text style={{ color: colors.muted }}>
                {bid.buyer || 'Oppdragsgiver ikke oppgitt'}
                {bid.assignment?.personName ? ` · ${bid.assignment.personName}` : ''}
                {bid.value ? ` · ${Number(bid.value).toLocaleString('nb-NO')} kr` : ''}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {PIPELINE_COLUMNS.filter((item) => item.id !== column.id).slice(0, 2).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => {
                      const stage = item.stages[0];
                      const moved = setPipelineStage(state, bid.id, stage);
                      if (moved.ok) onCommit(moved.state);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.brand }}>Flytt til {item.label.toLowerCase()}</Text>
                  </TouchableOpacity>
                ))}
                {NEXT[bid.stage] && NEXT[bid.stage] !== bid.stage ? (
                  <TouchableOpacity
                    onPress={() => {
                      const moved = setPipelineStage(state, bid.id, NEXT[bid.stage]);
                      if (moved.ok) onCommit(moved.state);
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={{ color: colors.brand }}>Neste steg</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity
                  onPress={() => {
                    const moved = setPipelineStage(state, bid.id, 'tapt');
                    if (moved.ok) onCommit(moved.state);
                  }}
                  accessibilityRole="button"
                >
                  <Text style={{ color: colors.danger }}>Tapt</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
          {!column.bids.length ? <Text style={{ color: colors.muted }}>Ingen tilbud i denne kolonnen.</Text> : null}
        </View>
      ))}
    </View>
  );
}
