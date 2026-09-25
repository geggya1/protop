import React, { useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import SafeImage from './SafeImage';
import {
  formatStarCount,
  isMilestoneClaimed,
  motivationFor,
  parseRewardLink,
  rewardLinkHost,
} from '../src/utils/rewardGoalsLogic';

async function openRewardLink(url) {
  const parsed = parseRewardLink(url);
  if (!parsed.ok || !parsed.url) return;
  try {
    await Linking.openURL(parsed.url);
  } catch (e) {
    console.warn('[reward-link] open failed', e);
  }
}

function LinkButton({ url, large = false }) {
  const host = rewardLinkHost(url);
  if (!host) return null;
  return (
    <TouchableOpacity
      style={styles.linkBtn}
      onPress={() => openRewardLink(url)}
      accessibilityRole="link"
      accessibilityLabel={`Åpne ${host}`}
    >
      <Ionicons name="open-outline" size={16} color={colors.brand} />
      <Text style={[styles.linkTxt, large && styles.linkTxtLarge]}>Se {host}</Text>
    </TouchableOpacity>
  );
}

export default function RewardGoalCard({
  goal,
  progress,
  compact = false,
  large = false,
  showLevels = false,
  meta = '',
  canClaim = false,
  claimChildId = null,
  onClaim,
  onEdit,
  onArchive,
}) {
  const motive = motivationFor(goal, progress, { childId: claimChildId });
  const earned = progress?.earned || 0;
  const target = motive.next?.points || progress?.target || 0;
  const openLink = useCallback((url) => openRewardLink(url), []);

  let status = 'Alle nivåer er innløst';
  if (motive.ready && motive.next) {
    status = `Klar for ${motive.ready.title} · ${formatStarCount(motive.remaining)} stjerner igjen til ${motive.next.title}`;
  } else if (motive.ready) {
    status = `Klar for ${motive.ready.title}`;
  } else if (motive.next) {
    status = `${formatStarCount(motive.remaining)} stjerner igjen til ${motive.next.title}`;
  }

  return (
    <View style={[styles.card, large && styles.cardLarge]}>
      <View style={styles.head}>
        <Text style={styles.emoji}>{goal?.emoji || '⭐'}</Text>
        <View style={styles.headText}>
          <Text style={[styles.title, large && styles.titleLarge]} numberOfLines={2}>
            {goal?.title || 'Stjernemål'}
          </Text>
          {!!meta && <Text style={styles.meta}>{meta}</Text>}
        </View>
        {onEdit ? (
          <TouchableOpacity onPress={onEdit} hitSlop={8} accessibilityLabel="Rediger mål">
            <Ionicons name="create-outline" size={20} color={colors.brand} />
          </TouchableOpacity>
        ) : null}
      </View>

      {motive.imageUrl ? (
        <SafeImage pathOrUrl={motive.imageUrl} style={styles.hero} resizeMode="cover" />
      ) : !compact ? (
        <View style={styles.heroFallback}>
          <Text style={styles.heroEmoji}>{motive.emoji}</Text>
        </View>
      ) : null}

      {motive.texts.map((text) => (
        <Text
          key={text}
          style={[styles.desc, large && styles.descLarge]}
          numberOfLines={compact ? 3 : 6}
        >
          {text}
        </Text>
      ))}

      <Text style={styles.progressLbl}>
        {formatStarCount(earned)}
        {target ? ` av ${formatStarCount(target)}` : ''} stjerner
      </Text>
      <View style={styles.bar}>
        <View style={[styles.barFill, { width: `${progress?.pct || 0}%` }]} />
      </View>
      <Text style={[styles.status, large && styles.statusLarge]}>{status}</Text>

      {!!motive.linkUrl && <LinkButton url={motive.linkUrl} large={large} />}

      {showLevels && (goal?.milestones || []).map((m) => {
        const reached = earned >= m.points;
        const claimed = isMilestoneClaimed(m, {
          shared: !!goal?.shared,
          childId: claimChildId,
        });
        const levelLink = m.linkUrl && m.linkUrl !== motive.linkUrl ? m.linkUrl : '';
        return (
          <View key={m.id} style={styles.levelRow}>
            {m.imageUrl ? (
              <SafeImage pathOrUrl={m.imageUrl} style={styles.thumb} resizeMode="cover" />
            ) : (
              <Text style={styles.levelEmoji}>{m.emoji || '🎯'}</Text>
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.levelTitle, claimed && styles.levelClaimed]}>{m.title}</Text>
              <Text style={styles.levelPts}>{formatStarCount(m.points)} stjerner</Text>
              {!!m.description && (
                <Text style={styles.levelDesc} numberOfLines={2}>{m.description}</Text>
              )}
              {!!levelLink && (
                <TouchableOpacity onPress={() => openLink(levelLink)} accessibilityRole="link">
                  <Text style={styles.levelLink}>{rewardLinkHost(levelLink)}</Text>
                </TouchableOpacity>
              )}
            </View>
            {claimed ? (
              <Text style={styles.claimedBadge}>Innløst</Text>
            ) : reached && canClaim ? (
              <TouchableOpacity
                style={styles.claimBtn}
                onPress={() => onClaim?.(m)}
                accessibilityRole="button"
                accessibilityLabel={`Marker ${m.title} som innløst`}
              >
                <Text style={styles.claimBtnTxt}>Marker</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.locked}>{reached ? 'Klar' : '…'}</Text>
            )}
          </View>
        );
      })}

      {onArchive ? (
        <TouchableOpacity style={styles.archiveLink} onPress={onArchive}>
          <Text style={styles.archiveLinkTxt}>Arkiver mål</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#fde68a',
    padding: 14,
    marginBottom: 12,
  },
  cardLarge: { padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  emoji: { fontSize: 28 },
  headText: { flex: 1 },
  title: { fontWeight: '400', color: colors.ink, fontSize: 17 },
  titleLarge: { fontSize: 20 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2, fontWeight: '400' },
  hero: {
    marginTop: 12,
    width: '100%',
    height: 150,
    borderRadius: 12,
    backgroundColor: '#f8fafc',
  },
  heroFallback: {
    marginTop: 12,
    height: 88,
    borderRadius: 12,
    backgroundColor: colors.starSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroEmoji: { fontSize: 40 },
  desc: { marginTop: 10, color: colors.ink, fontSize: 14, lineHeight: 20, fontWeight: '400' },
  descLarge: { fontSize: 16, lineHeight: 22 },
  progressLbl: { marginTop: 12, fontWeight: '400', color: colors.ink, fontSize: 13 },
  bar: {
    marginTop: 6, height: 8, width: '100%', backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden',
  },
  barFill: { height: 8, backgroundColor: colors.star, borderRadius: 999 },
  status: { marginTop: 8, color: colors.ink, fontWeight: '400', fontSize: 13 },
  statusLarge: { fontSize: 15 },
  linkBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  linkTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  linkTxtLarge: { fontSize: 15 },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  thumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: '#f1f5f9' },
  levelEmoji: { fontSize: 22, width: 44, textAlign: 'center' },
  levelTitle: { fontWeight: '400', color: colors.ink },
  levelClaimed: { textDecorationLine: 'line-through', color: colors.muted },
  levelPts: { fontSize: 12, color: colors.muted, fontWeight: '400' },
  levelDesc: { fontSize: 12, color: colors.ink, marginTop: 2 },
  levelLink: { marginTop: 2, color: colors.brand, fontWeight: '400', fontSize: 12 },
  claimBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brandSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  claimBtnTxt: { color: colors.brand, fontWeight: '400', fontSize: 12 },
  claimedBadge: { color: '#15803d', fontWeight: '400', fontSize: 12 },
  locked: { color: colors.muted, fontWeight: '400', fontSize: 12 },
  archiveLink: { marginTop: 12, alignSelf: 'flex-start' },
  archiveLinkTxt: { color: '#b91c1c', fontWeight: '400', fontSize: 13 },
});
