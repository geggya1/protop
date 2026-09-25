import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, BREAKPOINTS } from '../src/theme';
import { useI18n } from '../src/i18n';
import { Screen, ScrollBody, BigButton, Title, Mute } from './ui';

/**
 * Onboarding wizard.
 * Phone: full-bleed (unchanged).
 * Tablet/desktop: centered card with max width so forms don’t stretch.
 */
export default function Wizard({
  title, subtitle, children, onNext, onBack, nextLabel, nextDisabled, footer,
  /** Override max content width; default 520 on wide screens */
  contentWidth,
  /** When true, skip top SafeArea (already inside AppShell) */
  embedded = false,
  /** Bare innhold — brukes i popup uten Screen/kort. */
  plain = false,
}) {
  const { t } = useI18n();
  const { width } = useWindowDimensions();
  const wide = width >= BREAKPOINTS.tablet;
  const maxW = contentWidth ?? (wide ? 520 : undefined);

  const header = (
    <>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={styles.back}>
          <Text style={[styles.backTxt, plain && styles.backTxtPlain]}>‹ {t('common.back')}</Text>
        </TouchableOpacity>
      ) : null}
      {title ? (plain ? <Text style={styles.plainTitle}>{title}</Text> : <Title size={wide ? 22 : 26}>{title}</Title>) : null}
      {subtitle ? (plain ? <Text style={styles.plainSub}>{subtitle}</Text> : <Mute style={styles.sub}>{subtitle}</Mute>) : null}
    </>
  );
  const actions = (
    <>
      {onNext ? (
        <BigButton label={nextLabel || t('common.next')} onPress={onNext} disabled={nextDisabled} />
      ) : null}
      {footer}
    </>
  );

  if (plain) {
    return (
      <View>
        {header}
        <View style={styles.body}>{children}</View>
        {actions}
      </View>
    );
  }

  return (
    <Screen style={wide ? styles.screenWide : null}>
      {embedded ? null : <SafeAreaView edges={['top']} />}
      <ScrollBody pad={wide ? 24 : undefined}>
        <View style={[styles.shell, maxW ? { maxWidth: maxW, alignSelf: 'center', width: '100%' } : null]}>
          {wide ? (
            <View style={styles.card}>
              {header}
              <View style={styles.body}>{children}</View>
              {actions}
            </View>
          ) : (
            <>
              {header}
              <View style={styles.body}>{children}</View>
              {actions}
            </>
          )}
        </View>
      </ScrollBody>
    </Screen>
  );
}

export function Choice({ label, emoji, icon, onPress, active, huge, disabled, compact }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.choice,
        compact && styles.choiceCompact,
        active && styles.choiceOn,
        huge && { minHeight: 84 },
        disabled && { opacity: 0.55 },
      ]}
    >
      {icon || (emoji ? <Text style={{ fontSize: compact ? 18 : 32 }}>{emoji}</Text> : null)}
      <Text style={[styles.choiceTxt, compact && styles.choiceTxtCompact, active && { color: '#fff' }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Compact selectable chips in a wrapping row (gender, etc.). */
export function ChoiceGrid({ options, value, onChange }) {
  return (
    <View style={styles.grid}>
      {options.map((opt) => {
        const active = value === opt.id;
        return (
          <TouchableOpacity
            key={opt.id}
            onPress={() => onChange(opt.id)}
            style={[styles.chip, active && styles.chipOn]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipTxt, active && styles.chipTxtOn]} numberOfLines={1}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  screenWide: { backgroundColor: '#e8eef6' },
  shell: { width: '100%' },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 28,
    borderWidth: 1,
    borderColor: colors.line,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 2px rgba(15,23,42,0.06), 0 12px 32px rgba(15,23,42,0.08)',
      },
      default: {
        shadowColor: '#0f172a',
        shadowOpacity: 0.08,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 3,
      },
    }),
  },
  sub: { marginBottom: 4 },
  body: { gap: 10, marginTop: 8, marginBottom: 16 },
  back: { alignSelf: 'flex-start', paddingVertical: 4 },
  backTxt: { fontWeight: '400', color: colors.brand, fontSize: 16 },
  backTxtPlain: { fontWeight: '400', fontSize: 13 },
  plainTitle: { fontSize: 16, fontWeight: '400', color: colors.ink, letterSpacing: -0.2, marginTop: 2 },
  plainSub: { fontSize: 13, fontWeight: '400', color: colors.muted, marginTop: 4, marginBottom: 4 },
  choice: {
    backgroundColor: colors.card, borderRadius: radius.md, padding: 16, minHeight: 64,
    flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 2, borderColor: colors.line,
  },
  choiceCompact: {
    minHeight: 44, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1.5,
  },
  choiceOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  choiceTxt: { flex: 1, fontWeight: '400', fontSize: 18, color: colors.ink },
  choiceTxtCompact: { fontSize: 15 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.card,
    minWidth: '47%',
    flexGrow: 1,
    alignItems: 'center',
  },
  chipOn: {
    backgroundColor: colors.brandSoft,
    borderColor: colors.brand,
  },
  chipTxt: { fontWeight: '400', fontSize: 14, color: colors.ink },
  chipTxtOn: { color: colors.brand },
});
