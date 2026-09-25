import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { useI18n } from '../../src/i18n';
import { colors, deskType, radius, useLayout } from '../../src/theme';
import { Screen, Title, Mute, ScrollBody } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import { updateGroup } from '../../src/utils/groups';
import { billingMethodIdsForPlatform } from '../../src/utils/billingMethods';

const METHOD_DEFS = [
  { id: 'appstore', icon: 'logo-apple-appstore', label: 'App Store', hintKey: 'group.billingAppStoreHint' },
  { id: 'googleplay', icon: 'logo-google-playstore', label: 'Google Play', hintKey: 'group.billingPlayHint' },
  { id: 'card', icon: 'card-outline', labelKey: 'group.billingCard', hintKey: 'group.billingCardHint', brands: ['Visa', 'Mastercard'] },
  { id: 'vipps', icon: 'phone-portrait-outline', label: 'Vipps', hintKey: 'group.billingVippsHint', accent: '#ff5b24' },
];

function trialDaysLeft(createdAt) {
  if (!createdAt) return 14;
  const start = createdAt.toDate ? createdAt.toDate() : new Date(createdAt);
  if (Number.isNaN(start.getTime())) return 14;
  const end = start.getTime() + 14 * 86400000;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000));
}

function MethodCard({ method, selected, onPress, compact, chosenLabel }) {
  const tint = method.accent || colors.brand;
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.method,
        compact && styles.methodDesk,
        selected && { borderColor: tint, backgroundColor: colors.card },
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={method.label}
    >
      <View style={[styles.methodIcon, { backgroundColor: selected ? tint : '#eef6ff' }]}>
        <Ionicons name={method.icon} size={compact ? 18 : 22} color={selected ? '#fff' : tint} />
      </View>
      <View style={styles.methodBody}>
        <View style={styles.methodTitleRow}>
          <Text style={[styles.methodLabel, compact && styles.methodLabelDesk]}>{method.label}</Text>
          {selected ? (
            <View style={[styles.badge, { backgroundColor: tint }]}>
              <Text style={styles.badgeTxt}>{chosenLabel}</Text>
            </View>
          ) : (
            <Text style={styles.platformTag}>{method.id === 'appstore' ? 'iOS' : method.id === 'googleplay' ? 'Android' : 'Web'}</Text>
          )}
        </View>
        <Text style={[styles.methodHint, compact && styles.methodHintDesk]}>{method.hint}</Text>
        {method.brands ? (
          <View style={styles.brandRow}>
            {method.brands.map((b) => (
              <View key={b} style={styles.brandChip}>
                <Text style={styles.brandChipTxt}>{b}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

export default function SubscriptionScreen({ inShell = false, onBack }) {
  const nav = useNavigation();
  const { t } = useI18n();
  const { isDesktop, hasRail, pad } = useLayout();
  const { isSuperAdmin, family, familyId, requestShellTab } = useApp();
  const compact = isDesktop;
  const [selected, setSelected] = useState(family?.billingPreferredMethod || null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (family?.billingPreferredMethod) setSelected(family.billingPreferredMethod);
  }, [family?.billingPreferredMethod]);

  useEffect(() => {
    if (inShell || !hasRail) return undefined;
    requestShellTab('more', 'subscription');
    if (nav.canGoBack?.()) nav.goBack();
    return undefined;
  }, [inShell, hasRail, requestShellTab, nav]);

  const daysLeft = useMemo(() => trialDaysLeft(family?.createdAt), [family?.createdAt]);
  const trialOn = daysLeft > 0;
  const methods = useMemo(() => {
    const allowed = new Set(billingMethodIdsForPlatform(Platform.OS));
    return METHOD_DEFS.filter((m) => allowed.has(m.id)).map((m) => ({
      ...m,
      label: m.labelKey ? t(m.labelKey) : m.label,
      hint: t(m.hintKey),
    }));
  }, [t]);
  const method = methods.find((m) => m.id === selected) || null;

  useEffect(() => {
    if (selected && !methods.some((m) => m.id === selected)) setSelected(null);
  }, [methods, selected]);

  const goBack = () => {
    if (onBack) onBack();
    else if (nav.canGoBack?.()) nav.goBack();
  };

  const saveMethod = async () => {
    if (!selected || !familyId || !isSuperAdmin) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await updateGroup(familyId, { billingPreferredMethod: selected });
      setNotice(
        selected === 'vipps'
          ? t('group.billingSavedVipps')
          : selected === 'card'
            ? t('group.billingSavedCard')
            : t('group.billingSavedStore', { label: method?.label || '' }),
      );
    } catch (err) {
      setError(err?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (!inShell && hasRail) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollBody pad={pad}>
        {onBack || (!inShell && nav.canGoBack?.()) ? (
          <CompactBackLink onPress={goBack} label={inShell ? 'Mer' : t('common.back')} />
        ) : null}

        {!inShell || !compact ? (
          <>
            <Title size={22}>{t('group.subscription')}</Title>
            <Mute>{t('group.billingOnlyOwner')}</Mute>
          </>
        ) : (
          <Mute>{t('group.billingOnlyOwner')}</Mute>
        )}

        {!isSuperAdmin ? (
          <Text style={styles.lock}>{t('group.billingOnlyOwner')}</Text>
        ) : (
          <>
            <View style={[styles.plan, compact && styles.planDesk]}>
              <View style={[styles.planIcon, compact && styles.planIconDesk]}>
                <Ionicons name="sparkles-outline" size={compact ? 20 : 26} color={colors.brand} />
              </View>
              <View style={styles.planBody}>
                <Text style={[styles.planKicker, compact && styles.planKickerDesk]}>
                  {trialOn ? t('welcome.trialTitle') : t('group.billingActive')}
                </Text>
                <Text style={[styles.planTitle, compact && styles.planTitleDesk]}>{t('group.billingPlanName')}</Text>
                <Text style={[styles.planPrice, compact && styles.planPriceDesk]}>{t('welcome.price')}</Text>
                <Text style={[styles.planBodyTxt, compact && styles.planBodyTxtDesk]}>
                  {trialOn
                    ? `${t('group.billingDaysLeft', { days: daysLeft })} ${t('welcome.trialBody')}`
                    : t('welcome.trialBody')}
                </Text>
              </View>
            </View>

            <Text style={[styles.section, compact && styles.sectionDesk]}>{t('group.billingMethods')}</Text>
            <Text style={[styles.sectionHint, compact && styles.sectionHintDesk]}>
              {Platform.OS === 'web' ? t('group.billingHintWeb') : t('group.billingHintNative')}
            </Text>

            <View style={[styles.methodGrid, compact && styles.methodGridDesk]}>
              {methods.map((m) => (
                <View key={m.id} style={compact ? styles.methodCellDesk : styles.methodCell}>
                  <MethodCard
                    method={m}
                    selected={selected === m.id}
                    onPress={() => {
                      setSelected(m.id);
                      setNotice('');
                      setError('');
                    }}
                    compact={compact}
                    chosenLabel={t('group.billingChosen')}
                  />
                </View>
              ))}
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            <TouchableOpacity
              onPress={saveMethod}
              disabled={!selected || saving}
              style={[
                styles.cta,
                compact && styles.ctaDesk,
                (!selected || saving) && styles.ctaDisabled,
                selected === 'vipps' && styles.ctaVipps,
              ]}
              accessibilityRole="button"
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={selected === 'vipps' ? 'phone-portrait-outline' : 'checkmark-circle-outline'}
                    size={18}
                    color="#fff"
                  />
                  <Text style={styles.ctaTxt}>
                    {!selected
                      ? t('group.billingPick')
                      : selected === 'vipps'
                        ? t('group.billingSaveVipps')
                        : selected === 'card'
                          ? t('group.billingSaveCard')
                          : t('group.billingSave', { label: method?.label || '' })}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={[styles.footnote, compact && styles.footnoteDesk]}>
              {t('group.billingSoon')}
            </Text>
          </>
        )}
      </ScrollBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  lock: {
    marginTop: 16,
    color: colors.muted,
    fontWeight: '400',
    fontSize: 14,
  },
  plan: {
    marginTop: 16,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    flexDirection: 'row',
    gap: 14,
    alignItems: 'flex-start',
  },
  planDesk: {
    padding: 14,
    gap: 12,
    borderRadius: 8,
  },
  planIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#eef6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planIconDesk: { width: 36, height: 36, borderRadius: 8 },
  planBody: { flex: 1, minWidth: 0 },
  planKicker: {
    fontSize: 11,
    fontWeight: '400',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: colors.brand,
    marginBottom: 2,
  },
  planKickerDesk: { ...deskType.section, color: colors.brand, marginBottom: 2 },
  planTitle: { fontWeight: '400', fontSize: 18, color: colors.ink },
  planTitleDesk: { ...deskType.title, fontSize: 16 },
  planPrice: { marginTop: 4, fontWeight: '400', fontSize: 15, color: colors.ink },
  planPriceDesk: { ...deskType.label, marginTop: 2, fontSize: 13 },
  planBodyTxt: {
    marginTop: 8,
    color: colors.muted,
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 19,
  },
  planBodyTxtDesk: { ...deskType.meta, marginTop: 6, lineHeight: 18 },
  section: {
    marginTop: 22,
    fontSize: 13,
    fontWeight: '400',
    color: colors.ink,
  },
  sectionDesk: { ...deskType.section, marginTop: 18, color: colors.ink },
  sectionHint: {
    marginTop: 4,
    marginBottom: 10,
    color: colors.muted,
    fontWeight: '400',
    fontSize: 13,
    lineHeight: 18,
  },
  sectionHintDesk: { ...deskType.meta, marginTop: 4, marginBottom: 8, lineHeight: 18 },
  methodGrid: { gap: 10 },
  methodGridDesk: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  methodCell: { width: '100%' },
  methodCellDesk: {
    width: Platform.OS === 'web' ? 'calc(50% - 4px)' : '48%',
    minWidth: 240,
    flexGrow: 1,
  },
  method: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
  },
  methodDesk: {
    padding: 12,
    borderRadius: 8,
    gap: 10,
    minHeight: 88,
  },
  methodIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodBody: { flex: 1, minWidth: 0 },
  methodTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  methodLabel: { flex: 1, fontWeight: '400', fontSize: 15, color: colors.ink },
  methodLabelDesk: { ...deskType.label, fontSize: 13 },
  methodHint: {
    marginTop: 4,
    color: colors.muted,
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 17,
  },
  methodHintDesk: { ...deskType.small, marginTop: 3, lineHeight: 16 },
  platformTag: { fontSize: 11, fontWeight: '400', color: colors.muted },
  badge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeTxt: { color: '#fff', fontSize: 10, fontWeight: '400' },
  brandRow: { flexDirection: 'row', gap: 6, marginTop: 8 },
  brandChip: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#f8fafc',
  },
  brandChipTxt: { fontSize: 11, fontWeight: '400', color: colors.ink },
  cta: {
    marginTop: 16,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
  },
  ctaDesk: {
    borderRadius: 7,
    paddingVertical: 8,
    paddingHorizontal: 12,
    minHeight: 36,
  },
  ctaVipps: { backgroundColor: '#ff5b24' },
  ctaDisabled: { opacity: 0.55 },
  ctaTxt: { color: '#fff', fontWeight: '400', fontSize: 14 },
  error: { marginTop: 10, color: colors.danger, fontWeight: '400', fontSize: 13 },
  notice: { marginTop: 10, color: colors.success, fontWeight: '400', fontSize: 13, lineHeight: 18 },
  footnote: {
    marginTop: 14,
    color: colors.muted,
    fontWeight: '400',
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 640,
  },
  footnoteDesk: { ...deskType.small, marginTop: 12, lineHeight: 17 },
});
