import React from 'react';
import {
  Image, Platform, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';

/** Aksentfarger for HR-oversikten. Mellomtoner som leses i både lyst og mørkt tema. */
export const ACCENT = {
  blue: '#2F6BDB',
  violet: '#7C5CE0',
  green: '#16A34A',
  teal: '#0E9F8E',
  rose: '#E11D48',
  amber: '#D97706',
  red: '#DC2626',
  slate: '#64748B',
};

/** Hex med alfa, f.eks. tint('#2F6BDB', 0.12). */
export function tint(hex, alpha = 0.12) {
  const a = Math.round(Math.max(0, Math.min(1, alpha)) * 255).toString(16).padStart(2, '0');
  return `${hex}${a}`;
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0][0] || '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toUpperCase();
}

const webShadow = Platform.OS === 'web'
  ? { boxShadow: '0 6px 18px rgba(20, 36, 64, 0.06)' }
  : {};

/** Rutenett: inntil «columns» kolonner, smalere flater får færre. */
export function gridStyle(columns, minWidth, gap) {
  if (Platform.OS === 'web') {
    const gaps = gap * (columns - 1);
    return {
      display: 'grid',
      gap,
      gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, max(${minWidth}px, calc((100% - ${gaps}px) / ${columns}))), 1fr))`,
    };
  }
  return { flexDirection: 'row', flexWrap: 'wrap', gap };
}

export function gridItem(minWidth) {
  return Platform.OS === 'web' ? { minWidth: 0 } : { flexGrow: 1, flexBasis: minWidth, minWidth: 0 };
}

export function SectionLabel({ colors, icon, title, hint, right, nativeID }) {
  return (
    <View style={styles.sectionLabel} nativeID={nativeID}>
      <View style={styles.sectionLabelMain}>
        <Ionicons name={icon} size={15} color={colors.muted} />
        <Text style={[styles.sectionLabelText, { color: colors.ink }]}>{title}</Text>
        {hint ? <Text style={[styles.sectionLabelHint, { color: colors.muted }]}>{hint}</Text> : null}
      </View>
      {right || null}
    </View>
  );
}

export function DashCard({
  colors, icon, title, subtitle, badge, badgeAccent = ACCENT.red, actionLabel, onAction,
  children, nativeID, style,
}) {
  return (
    <View nativeID={nativeID} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }, style]}>
      <View style={styles.cardHead}>
        {icon ? <Ionicons name={icon} size={20} color={colors.ink} style={styles.cardIcon} /> : null}
        <View style={styles.cardHeadText}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardTitle, { color: colors.ink }]} numberOfLines={1}>{title}</Text>
            {badge != null && badge !== '' ? (
              <View style={[styles.cardBadge, { backgroundColor: badgeAccent }]}>
                <Text style={styles.cardBadgeText}>{badge}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? <Text style={[styles.cardSub, { color: colors.muted }]}>{subtitle}</Text> : null}
        </View>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} accessibilityRole="link" style={styles.cardAction}>
            <Text style={[styles.cardActionText, { color: colors.brand }]}>{actionLabel}</Text>
            <Ionicons name="chevron-forward" size={14} color={colors.brand} />
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

export function Ring({
  pct = 0, size = 56, stroke = 6, color = ACCENT.green, track, label, labelColor, labelSize,
}) {
  const ratio = Math.max(0, Math.min(1, (Number(pct) || 0) / 100));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const mid = size / 2;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle cx={mid} cy={mid} r={r} stroke={track || tint(color, 0.16)} strokeWidth={stroke} fill="none" />
        {ratio > 0 ? (
          <Circle
            cx={mid}
            cy={mid}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c * ratio} ${c}`}
            transform={`rotate(-90 ${mid} ${mid})`}
          />
        ) : null}
      </Svg>
      {label != null ? (
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={[styles.ringLabel, { color: labelColor, fontSize: labelSize || Math.round(size / 4.4) }]}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

export function IconDisc({ icon, accent, size = 40, iconSize }) {
  return (
    <View style={[styles.disc, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint(accent, 0.13) }]}>
      <Ionicons name={icon} size={iconSize || Math.round(size * 0.48)} color={accent} />
    </View>
  );
}

export function Avatar({
  name, photoUrl, size = 40, accent = ACCENT.blue, square = false, ring,
}) {
  const radius = square ? Math.round(size * 0.28) : size / 2;
  const frame = {
    width: size,
    height: size,
    borderRadius: radius,
    ...(ring ? { borderWidth: 2, borderColor: ring } : null),
  };
  if (photoUrl) {
    return <Image source={{ uri: photoUrl }} style={frame} accessibilityLabel={name} />;
  }
  return (
    <View style={[styles.avatar, frame, { backgroundColor: tint(accent, 0.16) }]}>
      <Text style={[styles.avatarText, { color: accent, fontSize: Math.round(size * 0.36) }]}>{initials(name)}</Text>
    </View>
  );
}

export function Pill({ label, accent, icon, solid = false }) {
  return (
    <View style={[styles.pill, { backgroundColor: solid ? accent : tint(accent, 0.12) }]}>
      {icon ? <Ionicons name={icon} size={12} color={solid ? '#fff' : accent} /> : null}
      <Text style={[styles.pillText, { color: solid ? '#fff' : accent }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** Segmentvelger med tall. Brukes til status og til å gruppere kortinnhold. */
export function Segmented({ colors, options, value, onChange, nativeID, compact = false }) {
  return (
    <View nativeID={nativeID} style={[styles.segment, { backgroundColor: tint(ACCENT.slate, 0.08) }]}>
      {options.map((option) => {
        const on = option.id === value;
        return (
          <Pressable
            key={option.id}
            nativeID={nativeID ? `${nativeID}-${option.id}` : undefined}
            onPress={() => onChange(option.id)}
            accessibilityRole="button"
            accessibilityLabel={option.a11y || option.label}
            accessibilityState={{ selected: on }}
            style={[
              styles.segmentItem,
              compact && styles.segmentItemCompact,
              on && [styles.segmentOn, { backgroundColor: colors.card }],
            ]}
          >
            {option.icon ? <Ionicons name={option.icon} size={14} color={on ? option.accent || colors.ink : colors.muted} /> : null}
            {option.label ? (
              <Text style={[styles.segmentText, { color: on ? colors.ink : colors.muted }]} numberOfLines={1}>
                {option.label}
              </Text>
            ) : null}
            {option.count != null ? (
              <View style={[styles.segmentCount, { backgroundColor: on ? tint(colors.brand, 0.14) : tint(ACCENT.slate, 0.12) }]}>
                <Text style={[styles.segmentCountText, { color: on ? colors.brand : colors.muted }]}>{option.count}</Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export function KpiTile({
  colors, icon, accent, label, value, badge, badgeAccent, hint, onPress, ringPct, nativeID,
}) {
  return (
    <Pressable
      nativeID={nativeID}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.card, styles.kpi, { backgroundColor: colors.card, borderColor: colors.line }]}
    >
      {ringPct != null ? (
        <Ring pct={ringPct} size={52} stroke={6} color={accent} label={`${Math.round(ringPct)}%`} labelColor={colors.ink} labelSize={12} />
      ) : (
        <IconDisc icon={icon} accent={accent} size={48} iconSize={22} />
      )}
      <View style={styles.kpiText}>
        <Text style={[styles.kpiLabel, { color: colors.ink }]} numberOfLines={1}>{label}</Text>
        <View style={styles.kpiValueRow}>
          <Text style={[styles.kpiValue, { color: colors.ink }]} numberOfLines={1}>{value}</Text>
          {badge ? <Pill label={badge} accent={badgeAccent || accent} /> : null}
        </View>
        {hint ? <Text style={[styles.kpiHint, { color: colors.muted }]} numberOfLines={2}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

export function MoreToggle({ colors, expanded, more, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.more}>
      <Text style={[styles.moreText, { color: colors.brand }]}>{expanded ? 'Vis færre' : `Vis ${more} til`}</Text>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={colors.brand} />
    </Pressable>
  );
}

export function Bar({ ratio = 0, accent, height = 6 }) {
  const pct = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
  return (
    <View style={[styles.barTrack, { height, borderRadius: height, backgroundColor: tint(accent, 0.14) }]}>
      <View style={[styles.barFill, { width: pct, height, borderRadius: height, backgroundColor: accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  sectionLabel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionLabelMain: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6, rowGap: 2, flexShrink: 1, minWidth: 0,
  },
  sectionLabelText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  sectionLabelHint: { fontSize: 13, flexShrink: 1 },
  card: {
    flexGrow: 1,
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 12,
    ...webShadow,
  },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  cardIcon: { marginTop: 1 },
  cardHeadText: { flex: 1, minWidth: 0 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2, flexShrink: 1 },
  cardBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1, minWidth: 22, alignItems: 'center' },
  cardBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  cardSub: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  cardAction: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 2 },
  cardActionText: { fontSize: 13, fontWeight: '600' },
  ringCenter: {
    position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center',
  },
  ringLabel: { fontWeight: '700' },
  disc: { alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '700' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  pillText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  segment: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignSelf: 'flex-start',
    borderRadius: 12,
    padding: 3,
    gap: 2,
    maxWidth: '100%',
  },
  segmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  segmentItemCompact: { paddingHorizontal: 9, paddingVertical: 5 },
  segmentOn: Platform.OS === 'web'
    ? { boxShadow: '0 1px 4px rgba(20, 36, 64, 0.12)' }
    : { elevation: 1 },
  segmentText: { fontSize: 13, fontWeight: '600' },
  segmentCount: { borderRadius: 999, paddingHorizontal: 6, minWidth: 20, alignItems: 'center' },
  segmentCountText: { fontSize: 11, fontWeight: '700' },
  // Smal flis (telefon): teksten legger seg under ikonet i stedet for å kuttes.
  kpi: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, paddingVertical: 14,
  },
  kpiText: {
    flexGrow: 1, flexShrink: 1, flexBasis: 110, minWidth: 0, gap: 1,
  },
  kpiLabel: { fontSize: 13, fontWeight: '600' },
  kpiValueRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  kpiValue: { fontSize: 26, fontWeight: '700', letterSpacing: -0.5 },
  kpiHint: { fontSize: 12 },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'center', paddingVertical: 2 },
  moreText: { fontSize: 13, fontWeight: '600' },
  barTrack: { width: '100%', overflow: 'hidden' },
  barFill: {},
});
