import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../src/context/AppContext';
import { useBirthdayPrepReminder } from '../src/hooks/useBirthdayPrepReminder';
import { colors, radius } from '../src/theme';
import { toIsoDate } from '../src/utils/age';
import {
  buildBirthdayPrepSuggestions,
  firstNameFrom,
  birthdayPrepNotificationId,
  birthdayPrepYear,
} from '../src/utils/birthdayPrepReminder';
import {
  createAllPrepTasks,
  ensureBirthdayWishlist,
} from '../src/utils/birthdayPrepActions';
import { formatCountdown } from '../src/utils/rememberDatesLogic';
import { markNotificationSeen } from '../src/utils/notifications';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch { /* ignore */ }
}

function SuggestionRow({ suggestion, busy, onPress }) {
  return (
    <TouchableOpacity
      style={styles.suggestRow}
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={suggestion.title}
    >
      <View style={styles.suggestIcon}>
        <Ionicons name={suggestion.icon || 'sparkles-outline'} size={20} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.suggestTitle}>{suggestion.title}</Text>
        {suggestion.body ? (
          <Text style={styles.suggestBody} numberOfLines={2}>{suggestion.body}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

function BirthdayPrepCard({
  item, onClose, onLater, busy, busyId, onSuggestion, onCreateAll,
}) {
  const name = firstNameFrom(item?.memberName);
  const suggestions = useMemo(() => buildBirthdayPrepSuggestions(item), [item]);
  const countdown = item?.daysUntil != null
    ? formatCountdown(item.daysUntil)
    : null;

  return (
    <View style={styles.card} accessibilityRole="dialog" accessibilityViewIsModal>
      <ScrollView
        style={styles.cardScroll}
        contentContainerStyle={styles.cardScrollInner}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <Text style={styles.emoji}>🎂</Text>
        <Text style={styles.title}>{name}s bursdag snart</Text>
        {countdown ? (
          <Text style={styles.subtitle}>{countdown} · tid for forberedelser</Text>
        ) : (
          <Text style={styles.subtitle}>Tid for forberedelser</Text>
        )}
        <Text style={styles.lead}>
          Vil du opprette gjøremål, handle bursdagsgave til {name}, velge ønskeliste
          eller planlegge feiring? Forslagene ligger også i varselmenyen etterpå.
        </Text>

        <View style={styles.suggestBlock}>
          {suggestions.map((s) => (
            <SuggestionRow
              key={s.id}
              suggestion={s}
              busy={busy}
              onPress={() => onSuggestion(s)}
            />
          ))}
        </View>
      </ScrollView>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={onLater}
          disabled={busy}
          accessibilityRole="button"
        >
          <Text style={styles.secondaryTxt}>Senere</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, busy && { opacity: 0.7 }]}
          onPress={onCreateAll}
          disabled={busy}
          accessibilityRole="button"
        >
          {busy && busyId === 'all' ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryTxt}>Opprett alle gjøremål</Text>
          )}
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.dismissLink} onPress={onClose} disabled={busy}>
        <Text style={styles.dismissTxt}>Ikke nå</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Popup på dashbordet for voksne: forslag når bursdag nærmer seg (≤20 dager).
 */
export default function BirthdayPrepReminderModal({ enabled = true }) {
  const nav = useNavigation();
  const {
    uid,
    familyId,
    members,
    isChild,
    isActingAsChild,
    meParent,
    userProfile,
    requestShellTab,
  } = useApp();
  const adultOk = !!uid && !isChild && !isActingAsChild;
  const { item, visible, dismiss } = useBirthdayPrepReminder({
    uid,
    familyId,
    members,
    enabled: enabled && adultOk,
  });
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [allowDismiss, setAllowDismiss] = useState(false);

  useEffect(() => {
    if (visible) {
      setAllowDismiss(false);
      const id = setTimeout(() => setAllowDismiss(true), 450);
      return () => clearTimeout(id);
    }
    setAllowDismiss(false);
    return undefined;
  }, [visible]);

  const markInboxSeen = useCallback(async () => {
    if (!uid || !familyId || !item?.memberId) return;
    const year = birthdayPrepYear(item.nextDate);
    const id = birthdayPrepNotificationId(familyId, item.memberId, year);
    try {
      await markNotificationSeen(uid, id);
    } catch { /* ignore */ }
  }, [uid, familyId, item]);

  const closeAndDismiss = useCallback(async () => {
    await markInboxSeen();
    await dismiss();
  }, [markInboxSeen, dismiss]);

  const later = useCallback(async () => {
    // Behold ulest varsel for gjenopptak; skjul kun popup lokalt
    await dismiss();
  }, [dismiss]);

  const runBusy = useCallback(async (id, fn) => {
    if (busy) return;
    setBusy(true);
    setBusyId(id);
    try {
      await fn();
    } finally {
      setBusy(false);
      setBusyId(null);
    }
  }, [busy]);

  const openWishlist = useCallback(async () => {
    const creatorName = meParent?.name || userProfile?.displayName || '';
    await ensureBirthdayWishlist({
      familyId,
      uid,
      creatorName,
      item,
      members,
    });
    await dismiss({ skipNext: true });
    requestShellTab?.('more', 'wishes');
  }, [familyId, uid, meParent, userProfile, item, members, dismiss, requestShellTab]);

  const onSuggestion = useCallback((suggestion) => {
    if (!suggestion || !item) return;
    const deadline = item.nextDate ? toIsoDate(item.nextDate) : null;

    if (suggestion.action === 'openWishlist') {
      runBusy(suggestion.id, openWishlist);
      return;
    }

    if (suggestion.action === 'createGiftTask' || suggestion.action === 'createCakeTask') {
      runBusy(suggestion.id, async () => {
        await dismiss({ skipNext: true });
        nav.navigate('ParentTask', {
          familyId,
          title: suggestion.taskTitle || suggestion.title,
          description: suggestion.body || '',
          deadline: deadline || undefined,
        });
      });
      return;
    }

    if (suggestion.action === 'createPartyEvent') {
      runBusy(suggestion.id, async () => {
        await dismiss({ skipNext: true });
        nav.navigate('EventForm', {
          familyId,
          title: suggestion.eventTitle || suggestion.title,
          dateKey: deadline || undefined,
        });
      });
      return;
    }

    if (suggestion.action === 'createPrepTasks') {
      runBusy(suggestion.id, async () => {
        await createAllPrepTasks({
          familyId, uid, item, members,
        });
        await markInboxSeen();
        await dismiss({ skipNext: true });
        requestShellTab?.('stars');
      });
    }
  }, [
    item, runBusy, openWishlist, dismiss, nav, familyId, uid, members,
    markInboxSeen, requestShellTab,
  ]);

  const onCreateAll = useCallback(() => {
    runBusy('all', async () => {
      await createAllPrepTasks({
        familyId, uid, item, members,
      });
      await markInboxSeen();
      await dismiss({ skipNext: true });
      requestShellTab?.('stars');
    });
  }, [runBusy, familyId, uid, item, members, markInboxSeen, dismiss, requestShellTab]);

  if (!visible || !item) return null;

  const overlay = (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        onPress={() => { if (allowDismiss && !busy) later(); }}
        accessibilityRole="button"
        accessibilityLabel="Lukk"
      />
      <BirthdayPrepCard
        item={item}
        busy={busy}
        busyId={busyId}
        onClose={closeAndDismiss}
        onLater={later}
        onSuggestion={onSuggestion}
        onCreateAll={onCreateAll}
      />
    </View>
  );

  if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined') {
    return createPortal(
      <View style={styles.webHost}>{overlay}</View>,
      document.body,
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={later}
      statusBarTranslucent
    >
      {overlay}
    </Modal>
  );
}

const styles = StyleSheet.create({
  webHost: {
    position: 'fixed',
    inset: 0,
    zIndex: 100050,
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayRoot: {
    ...Platform.select({
      web: { position: 'fixed', inset: 0, zIndex: 100050 },
      default: { flex: 1 },
    }),
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 20, 25, 0.45)',
  },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    backgroundColor: colors.card,
    borderRadius: 24,
    paddingTop: 22,
    paddingBottom: 12,
    zIndex: 1,
    ...Platform.select({
      web: { boxShadow: '0 8px 40px rgba(0,0,0,0.18)' },
      default: {
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 8 },
        elevation: 8,
      },
    }),
  },
  cardScroll: { maxHeight: 520 },
  cardScrollInner: { paddingHorizontal: 20, paddingBottom: 8 },
  emoji: { fontSize: 34, textAlign: 'center', marginBottom: 6 },
  title: {
    fontSize: 22,
    fontWeight: '400',
    color: '#0f1419',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '400',
    color: colors.brand,
    textAlign: 'center',
    marginTop: 6,
  },
  lead: {
    fontSize: 14,
    fontWeight: '400',
    color: '#536471',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 10,
    marginBottom: 14,
  },
  suggestBlock: {
    backgroundColor: '#f7f9f9',
    borderRadius: 16,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  suggestIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestTitle: { fontSize: 14, fontWeight: '400', color: '#0f1419' },
  suggestBody: { fontSize: 12, fontWeight: '400', color: '#536471', marginTop: 2, lineHeight: 16 },
  actions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  secondaryBtn: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  secondaryTxt: { fontWeight: '400', fontSize: 15, color: colors.ink },
  primaryBtn: {
    flex: 1.4,
    minHeight: 48,
    borderRadius: radius.pill,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  primaryTxt: { color: '#fff', fontWeight: '400', fontSize: 14, textAlign: 'center' },
  dismissLink: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  dismissTxt: { fontSize: 13, fontWeight: '400', color: colors.muted },
});
