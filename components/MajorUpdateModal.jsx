/**
 * One-shot popup when marketing major version increases (2.0 → 3.0).
 * Everyday fixes never open this — they only appear in the day-level changelog.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';
import { useI18n } from '../src/i18n';
import { colors, radius } from '../src/theme';
import {
  acknowledgeMajorUpdate,
  formatUpdateDate,
  getAppVersion,
  pickUpdateText,
  resolveMajorUpdatePrompt,
} from '../src/utils/appUpdates';

export default function MajorUpdateModal({ enabled = true }) {
  const { t, lang } = useI18n();
  const { uid, requestShellTab } = useApp();
  const [visible, setVisible] = useState(false);
  const [update, setUpdate] = useState(null);

  useEffect(() => {
    if (!enabled || !uid) {
      setVisible(false);
      setUpdate(null);
      return undefined;
    }
    let alive = true;
    (async () => {
      const result = await resolveMajorUpdatePrompt(uid, getAppVersion());
      if (!alive) return;
      if (result.shouldNotify && result.update) {
        setUpdate(result.update);
        setVisible(true);
      }
    })();
    return () => { alive = false; };
  }, [enabled, uid]);

  const dismiss = useCallback(async () => {
    setVisible(false);
    await acknowledgeMajorUpdate(uid, getAppVersion());
  }, [uid]);

  const openChangelog = useCallback(async () => {
    await dismiss();
    requestShellTab('more', 'help', 'help-news');
  }, [dismiss, requestShellTab]);

  if (!visible || !update) return null;

  const title = pickUpdateText(update.title, lang);
  const summary = pickUpdateText(update.summary, lang);
  const versionLabel = update.version || getAppVersion();
  const dateLabel = update.date ? formatUpdateDate(update.date, lang) : '';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={dismiss}
      statusBarTranslucent
    >
      <View style={styles.backdrop} accessibilityViewIsModal>
        <View style={styles.card} accessibilityRole="alert">
          <View style={styles.iconWrap}>
            <Ionicons name="sparkles" size={28} color={colors.brand} />
          </View>
          <Text style={styles.kicker}>{t('updates.majorKicker')}</Text>
          <Text style={styles.version}>{t('settings.version', { version: versionLabel })}</Text>
          <Text style={styles.title}>{title}</Text>
          {dateLabel ? <Text style={styles.date}>{dateLabel}</Text> : null}
          {summary ? <Text style={styles.body}>{summary}</Text> : null}
          <Text style={styles.hint}>{t('updates.majorHint')}</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              onPress={dismiss}
              style={styles.secondaryBtn}
              accessibilityRole="button"
              accessibilityLabel={t('updates.dismiss')}
            >
              <Text style={styles.secondaryTxt}>{t('updates.dismiss')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openChangelog}
              style={styles.primaryBtn}
              accessibilityRole="button"
              accessibilityLabel={t('updates.seeChangelog')}
            >
              <Text style={styles.primaryTxt}>{t('updates.seeChangelog')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.card,
    borderRadius: radius.lg || 16,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.line,
    ...(Platform.OS === 'web' ? { boxShadow: '0 18px 40px rgba(15,23,42,0.18)' } : {
      shadowColor: '#0f172a',
      shadowOpacity: 0.18,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    }),
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#eef6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  kicker: {
    fontSize: 12,
    fontWeight: '800',
    color: colors.brand,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  version: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
    marginBottom: 6,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.ink,
    marginBottom: 4,
  },
  date: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
    lineHeight: 22,
    marginBottom: 10,
  },
  hint: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    lineHeight: 18,
    marginBottom: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
  },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.bg || '#f1f5f9',
  },
  secondaryTxt: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.ink,
  },
  primaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.brand,
  },
  primaryTxt: {
    fontSize: 14,
    fontWeight: '800',
    color: '#fff',
  },
});
