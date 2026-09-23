/**
 * Velg spillmodus for tospillerspill: AI, ulike enheter, eller samme skjerm.
 */
import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';

export const GAME_PLAY_MODES = {
  ai: 'ai',
  online: 'online',
  hotseat: 'hotseat',
};

const DEFAULT_OPTIONS = [
  {
    id: GAME_PLAY_MODES.ai,
    icon: 'hardware-chip-outline',
    title: 'Mot datamaskin',
    subtitle: 'Spill alene mot AI — velg vanskelighetsgrad',
    accent: '#0f766e',
  },
  {
    id: GAME_PLAY_MODES.online,
    icon: 'tablet-landscape-outline',
    title: 'Ulike enheter',
    subtitle: 'Inviter familie eller venner — hvert sitt nettbrett eller telefon',
    accent: '#2563eb',
  },
  {
    id: GAME_PLAY_MODES.hotseat,
    icon: 'people-outline',
    title: 'Samme skjerm',
    subtitle: 'To spillere bytter på samme enhet',
    accent: '#c2410c',
  },
];

/**
 * @param {object} props
 * @param {string} props.title
 * @param {string} [props.subtitle]
 * @param {(mode: string) => void} props.onSelect
 * @param {string[]} [props.modes] — subset of ai|online|hotseat
 * @param {boolean} [props.simpleUi]
 * @param {Record<string, Partial<{title:string,subtitle:string,icon:string}>>} [props.overrides]
 */
export default function GameModePicker({
  title,
  subtitle = 'Hvordan vil dere spille?',
  onSelect,
  modes = [GAME_PLAY_MODES.ai, GAME_PLAY_MODES.online, GAME_PLAY_MODES.hotseat],
  simpleUi = false,
  overrides = {},
}) {
  const options = useMemo(
    () => DEFAULT_OPTIONS
      .filter((o) => modes.includes(o.id))
      .map((o) => ({ ...o, ...(overrides[o.id] || {}) })),
    [modes, overrides],
  );

  return (
    <View style={[styles.wrap, simpleUi && styles.wrapSimple]}>
      <Text style={[styles.title, simpleUi && styles.titleSimple]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.sub, simpleUi && styles.subSimple]}>{subtitle}</Text>
      ) : null}
      <View style={styles.list}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt.id}
            style={[styles.card, simpleUi && styles.cardSimple]}
            onPress={() => onSelect?.(opt.id)}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel={`${opt.title}. ${opt.subtitle}`}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${opt.accent}18` }]}>
              <Ionicons name={opt.icon} size={simpleUi ? 30 : 26} color={opt.accent} />
            </View>
            <View style={styles.copy}>
              <Text style={[styles.cardTitle, simpleUi && styles.cardTitleSimple]}>{opt.title}</Text>
              <Text style={[styles.cardSub, simpleUi && styles.cardSubSimple]} numberOfLines={2}>
                {opt.subtitle}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.muted} />
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', gap: 10 },
  wrapSimple: { gap: 12 },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.ink,
    letterSpacing: -0.3,
  },
  titleSimple: { fontSize: 26 },
  sub: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    fontWeight: '500',
    marginBottom: 4,
  },
  subSimple: { fontSize: 16, lineHeight: 22 },
  list: { gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  cardSimple: {
    borderRadius: 18,
    borderWidth: 2,
    borderColor: colors.brandSoft,
    paddingVertical: 16,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { flex: 1, gap: 2 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  cardTitleSimple: { fontSize: 18 },
  cardSub: { fontSize: 12, lineHeight: 17, color: colors.muted, fontWeight: '500' },
  cardSubSimple: { fontSize: 14, lineHeight: 20 },
});
