import React from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { initialOf } from '../../src/utils/homeWidgetVisuals';
import { soft } from '../parentHome/softTheme';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import { immersiveCardSurface, immersiveIconDisc } from './homeGlass';

const WEEKPLAN_MARK = require('../../assets/weekplan-mark-square.png');

/** Home modules match the cream theme. Dimmed chrome is only for pickers. */
export const glassCard = {
  backgroundColor: soft.card,
};

export function ProgressRing({
  value = 0,
  max = 1,
  label,
  size = 44,
  color = '#34C759',
  track = 'rgba(61,68,80,0.12)',
}) {
  const pct = max ? Math.max(0, Math.min(1, value / max)) : 0;
  const stroke = 3.6;
  const r = (size / 2) - stroke;
  const c = 2 * Math.PI * r;
  const txt = label != null ? String(label) : `${Math.round(pct * 100)}`;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={track}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - pct)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={styles.ringTxt} numberOfLines={1}>{txt}</Text>
    </View>
  );
}

export function AppIconTile({ icon = 'apps', glyphColor, glyphBg }) {
  const immersive = useHomeImmersive();
  if (icon === 'mark' || !icon) {
    return (
      <View style={[styles.appIcon, immersive && styles.appIconImmersive, immersive && immersiveIconDisc]}>
        <Image source={WEEKPLAN_MARK} style={styles.appIconImg} resizeMode="contain" />
      </View>
    );
  }
  const name = typeof icon === 'string' ? icon : icon.name;
  const color = glyphColor || icon.color || '#3D4450';
  return (
    <View style={[
      styles.appIcon,
      immersive && styles.appIconImmersive,
      immersive ? immersiveIconDisc : null,
      !immersive && (glyphBg || icon.bg) ? { backgroundColor: glyphBg || icon.bg } : null,
    ]}>
      <View style={styles.glyphInner}>
        <Ionicons name={name} size={immersive ? 17 : 18} color={color} />
      </View>
    </View>
  );
}

export function WidgetBadge({ label, tone = 'muted' }) {
  if (!label) return null;
  const pal = BADGE_TONES[tone] || BADGE_TONES.muted;
  return (
    <View style={[styles.badge, { backgroundColor: pal.bg, borderColor: pal.border }]}>
      {tone === 'people' ? (
        <Ionicons name="people" size={11} color={pal.fg} style={{ marginRight: 4 }} />
      ) : null}
      <Text style={[styles.badgeTxt, { color: pal.fg }]}>{label}</Text>
    </View>
  );
}

const BADGE_TONES = {
  muted: { bg: soft.cream, border: soft.line, fg: soft.ink },
  green: { bg: soft.mint, border: '#B7D4BE', fg: '#1F8A4C' },
  people: { bg: soft.mint, border: '#B7D4BE', fg: '#1F8A4C' },
  blue: { bg: '#2F80ED', border: '#2F80ED', fg: '#fff' },
};

export function FooterCta({ label }) {
  if (!label) return null;
  return (
    <View style={styles.cta}>
      <Text style={styles.ctaTxt}>{label}</Text>
    </View>
  );
}

/**
 * Shared module chrome: cream-theme card, app-icon header, footer capsule.
 * Dimmed overlay belongs only in a picker, never on the home board.
 */
export default function ModuleWidget({
  title,
  subtitle,
  icon = 'apps',
  glyphColor,
  glyphBg,
  badge,
  badgeTone = 'muted',
  headerLink,
  headerDate,
  headerStat,
  footerMeta,
  footerIcon,
  footerCta,
  footerFull,
  onPress,
  compact = true,
  children,
}) {
  const immersive = useHomeImmersive();
  return (
    <TouchableOpacity
      style={[glassCard, styles.card, compact && styles.cardCompact, immersive && immersiveCardSurface]}
      onPress={onPress}
      activeOpacity={0.92}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.head}>
        <AppIconTile icon={icon} glyphColor={glyphColor} glyphBg={glyphBg} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
        {headerStat ? (
          <View style={styles.statWrap}>
            <Text style={styles.statValue}>{headerStat.value}</Text>
            {headerStat.hint ? (
              <Text style={styles.statHint}>{headerStat.hint}</Text>
            ) : null}
          </View>
        ) : headerDate ? (
          <View style={styles.dateWrap}>
            {headerDate.kicker ? (
              <Text style={styles.dateKicker}>{headerDate.kicker}</Text>
            ) : null}
            <Text style={styles.dateValue}>{headerDate.value}</Text>
          </View>
        ) : headerLink ? (
          <Text style={styles.headerLink}>{headerLink} ›</Text>
        ) : badge ? (
          <WidgetBadge label={badge} tone={badgeTone} />
        ) : null}
      </View>

      <View style={styles.body}>
        {children}
      </View>

      {footerFull ? (
        <View style={styles.fullFoot}>
          <Text style={styles.ctaFullTxt}>{footerFull}</Text>
        </View>
      ) : (footerMeta || footerCta) ? (
        <View style={styles.foot}>
          {footerMeta ? (
            <View style={styles.footMetaRow}>
              {footerIcon ? (
                <Ionicons name={footerIcon} size={13} color={soft.muted} />
              ) : null}
              <Text style={styles.footMeta} numberOfLines={1}>{footerMeta}</Text>
            </View>
          ) : <View style={{ flex: 1 }} />}
          {footerCta ? <FooterCta label={footerCta} /> : null}
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

export function ColorGlyph({ icon, bg, color = '#fff', size = 28, radius = 8 }) {
  return (
    <View style={[
      styles.glyph,
      { width: size, height: size, borderRadius: radius, backgroundColor: bg || '#5B63A6' },
    ]}>
      <Ionicons name={icon} size={Math.round(size * 0.52)} color={color} />
    </View>
  );
}

export function AvatarGlyph({ name, tint, pin, size = 34 }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint || '#8EB4F0' }]}>
      {pin ? (
        <Ionicons name="location" size={16} color="#fff" />
      ) : (
        <Text style={[styles.avatarTxt, { fontSize: size * 0.38 }]}>{initialOf(name)}</Text>
      )}
    </View>
  );
}

export function CheckCircle({ done, size = 20 }) {
  return done ? (
    <View style={[styles.checkOn, { width: size, height: size, borderRadius: size / 2 }]}>
      <Ionicons name="checkmark" size={size * 0.62} color="#fff" />
    </View>
  ) : (
    <View style={[styles.checkOff, { width: size, height: size, borderRadius: size / 2 }]} />
  );
}

export function PillRow({ children, style }) {
  return <View style={[styles.pill, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    padding: 10,
    minHeight: 112,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: soft.line,
    overflow: 'hidden',
  },
  cardCompact: { minHeight: 96, padding: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  appIcon: {
    width: 30, height: 30, borderRadius: 9, backgroundColor: soft.cream,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, borderColor: soft.line,
  },
  appIconImmersive: {
    width: 32, height: 32, borderRadius: 16, overflow: 'hidden',
  },
  appIconImg: { width: 24, height: 24 },
  glyphInner: {
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 15, color: soft.ink, fontWeight: '400',
    fontFamily: Platform.OS === 'web' ? 'Inter, system-ui, -apple-system, sans-serif' : undefined,
    lineHeight: 19,
  },
  subtitle: {
    fontSize: 12, color: soft.muted, marginTop: 1,
    fontFamily: Platform.OS === 'web' ? 'Inter, system-ui, -apple-system, sans-serif' : undefined,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeTxt: { fontSize: 12, fontWeight: '500' },
  headerLink: { fontSize: 12, color: soft.muted },
  dateWrap: { alignItems: 'flex-end' },
  dateKicker: { fontSize: 11, color: soft.muted, marginBottom: 1 },
  dateValue: { fontSize: 13, color: soft.ink, fontWeight: '400' },
  statWrap: { alignItems: 'flex-end' },
  statValue: { fontSize: 15, color: soft.ink, fontWeight: '400' },
  statHint: { fontSize: 11, color: soft.muted, marginTop: 1, maxWidth: 92, textAlign: 'right' },
  body: { gap: 6, flex: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: soft.cream,
  },
  glyph: { alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '400' },
  checkOn: { backgroundColor: '#34C759', alignItems: 'center', justifyContent: 'center' },
  checkOff: { borderWidth: 1.5, borderColor: '#C8CDD6' },
  foot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginTop: 8, paddingTop: 2,
  },
  fullFoot: {
    marginTop: 8,
    backgroundColor: soft.cream,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  footMeta: { fontSize: 12, color: soft.muted, flexShrink: 1 },
  cta: {
    backgroundColor: soft.mint,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#B7D4BE',
  },
  ctaTxt: { fontSize: 12, color: soft.sage },
  ctaFullTxt: { fontSize: 14, color: soft.sage },
  ringTxt: { fontSize: 10, color: soft.ink, fontWeight: '400' },
});
