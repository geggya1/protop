import React from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { initialOf } from '../../src/utils/homeWidgetVisuals';
import { colors } from '../../src/theme';
import { radius } from '../../src/ui/tokens';
import { homeCardSurface, immersiveIconDisc } from './homeGlass';

const BRAND_MARK = require('../../assets/protop-mark-square.png');

/** Widgetkortet på Hjem er ProTop-kortet (UX-05). Dempet krom hører bare til velgere. */
export const glassCard = homeCardSurface;

export function ProgressRing({
  value = 0,
  max = 1,
  label,
  size = 44,
  color = colors.success,
  track = colors.line,
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
  if (icon === 'mark' || !icon) {
    return (
      <View style={styles.appIcon}>
        <Image source={BRAND_MARK} style={styles.appIconImg} resizeMode="contain" />
      </View>
    );
  }
  const name = typeof icon === 'string' ? icon : icon.name;
  const color = glyphColor || icon.color || colors.brand;
  return (
    <View style={[styles.appIcon, immersiveIconDisc, (glyphBg || icon.bg) ? { backgroundColor: glyphBg || icon.bg } : null]}>
      <View style={styles.glyphInner}>
        <Ionicons name={name} size={18} color={color} />
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
  muted: { bg: colors.bg, border: colors.line, fg: colors.ink },
  green: { bg: colors.bg, border: colors.line, fg: colors.successInk },
  people: { bg: colors.brandSoft, border: colors.brandSoft, fg: colors.brandInk },
  blue: { bg: colors.brandInk, border: colors.brandInk, fg: colors.onBrand },
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
 * Felles modulkort på Hjem: ProTop-kortet, ikon og tittel øverst, lenke nederst.
 * Dempet overlegg hører bare til velgere, aldri på Hjem.
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
  return (
    <TouchableOpacity
      style={[glassCard, styles.card, compact && styles.cardCompact]}
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
                <Ionicons name={footerIcon} size={13} color={colors.muted} />
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
      { width: size, height: size, borderRadius: radius, backgroundColor: bg || colors.brand },
    ]}>
      <Ionicons name={icon} size={Math.round(size * 0.52)} color={color} />
    </View>
  );
}

export function AvatarGlyph({ name, tint, pin, size = 34 }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: tint || colors.brand }]}>
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
    padding: 10,
    minHeight: 112,
    overflow: 'hidden',
  },
  cardCompact: { minHeight: 96, padding: 8 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  appIcon: {
    width: 30, height: 30, borderRadius: radius.control, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  appIconImg: { width: 24, height: 24 },
  glyphInner: {
    width: 30, height: 30, alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: 14, color: colors.ink, fontWeight: '600',
    lineHeight: 19,
  },
  subtitle: {
    fontSize: 12, color: colors.muted, marginTop: 1,
  },
  badge: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  badgeTxt: { fontSize: 12, fontWeight: '500' },
  headerLink: { fontSize: 12, color: colors.muted },
  dateWrap: { alignItems: 'flex-end' },
  dateKicker: { fontSize: 11, color: colors.muted, marginBottom: 1 },
  dateValue: { fontSize: 13, color: colors.ink, fontWeight: '400' },
  statWrap: { alignItems: 'flex-end' },
  statValue: { fontSize: 15, color: colors.ink, fontWeight: '400' },
  statHint: { fontSize: 11, color: colors.muted, marginTop: 1, maxWidth: 92, textAlign: 'right' },
  body: { gap: 6, flex: 1 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 32,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.card,
    backgroundColor: colors.bg,
  },
  glyph: { alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontWeight: '400' },
  checkOn: { backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  checkOff: { borderWidth: 1.5, borderColor: colors.muted },
  foot: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 8, marginTop: 8, paddingTop: 2,
  },
  fullFoot: {
    marginTop: 8,
    backgroundColor: colors.bg,
    borderRadius: 999,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  footMeta: { fontSize: 12, color: colors.muted, flexShrink: 1 },
  cta: {
    backgroundColor: colors.brandSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  ctaTxt: { fontSize: 12, color: colors.brandInk },
  ctaFullTxt: { fontSize: 14, color: colors.brandInk },
  ringTxt: { fontSize: 10, color: colors.ink, fontWeight: '400' },
});
