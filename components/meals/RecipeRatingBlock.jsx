import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius } from '../../src/theme';

export function StarRatingInput({
  value = 0,
  onChange,
  size = 28,
  disabled = false,
}) {
  return (
    <View style={styles.row}>
      {[1, 2, 3, 4, 5].map((n) => (
        <TouchableOpacity
          key={n}
          onPress={() => !disabled && onChange?.(n)}
          disabled={disabled}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel={`${n} stjerner`}
        >
          <Ionicons
            name={n <= value ? 'star' : 'star-outline'}
            size={size}
            color={n <= value ? '#f59e0b' : colors.muted}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export function StarRatingDisplay({ average = 0, count = 0, size = 14 }) {
  const avg = Number(average) || 0;
  if (!avg && !count) return null;
  return (
    <View style={styles.displayRow}>
      <Ionicons name="star" size={size} color="#f59e0b" />
      <Text style={styles.avgTxt}>{avg.toFixed(1)}</Text>
      {count ? <Text style={styles.countTxt}>({count})</Text> : null}
    </View>
  );
}

export default function RecipeRatingBlock({
  average = 0,
  count = 0,
  myStars = 0,
  myComment = '',
  commentDraft,
  onCommentChange,
  onStarsChange,
  onSave,
  saving = false,
  entries = {},
  canRate = true,
}) {
  const comments = Object.values(entries || {})
    .filter((e) => e?.comment)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .slice(0, 8);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Vurdering</Text>
      <View style={styles.summaryRow}>
        <StarRatingDisplay average={average} count={count} size={16} />
        {!count ? <Text style={styles.empty}>Ingen vurderinger ennå</Text> : null}
      </View>

      {canRate ? (
        <>
          <Text style={styles.lbl}>Din vurdering</Text>
          <StarRatingInput value={myStars || 0} onChange={onStarsChange} />
          <TextInput
            style={styles.input}
            value={commentDraft ?? myComment}
            onChangeText={onCommentChange}
            placeholder="Valgfri kommentar…"
            multiline
          />
          <TouchableOpacity
            style={[styles.saveBtn, (!myStars || saving) && styles.saveDisabled]}
            onPress={onSave}
            disabled={!myStars || saving}
          >
            <Text style={styles.saveTxt}>{saving ? 'Lagrer…' : 'Lagre vurdering'}</Text>
          </TouchableOpacity>
        </>
      ) : null}

      {comments.length ? (
        <View style={styles.comments}>
          <Text style={styles.lbl}>Kommentarer</Text>
          {comments.map((c, i) => (
            <View key={`${c.userName}-${i}`} style={styles.commentRow}>
              <View style={styles.commentHead}>
                <Text style={styles.commentName}>{c.userName || 'Familie'}</Text>
                <StarRatingDisplay average={c.stars} count={0} size={12} />
              </View>
              <Text style={styles.commentBody}>{c.comment}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 12,
  },
  title: { fontWeight: '900', fontSize: 16, color: colors.ink, marginBottom: 10 },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  empty: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  lbl: {
    fontSize: 12, fontWeight: '800', color: colors.muted,
    marginBottom: 8, textTransform: 'uppercase',
  },
  row: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  displayRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avgTxt: { fontWeight: '800', color: colors.ink, fontSize: 13 },
  countTxt: { color: colors.muted, fontWeight: '600', fontSize: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 64,
    textAlignVertical: 'top',
    backgroundColor: colors.card,
    marginBottom: 10,
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 8,
  },
  saveDisabled: { opacity: 0.55 },
  saveTxt: { color: '#fff', fontWeight: '800' },
  comments: { marginTop: 8, gap: 10 },
  commentRow: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
  },
  commentHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  commentName: { fontWeight: '800', color: colors.ink, fontSize: 13 },
  commentBody: { color: colors.ink, fontSize: 14, lineHeight: 20 },
});
