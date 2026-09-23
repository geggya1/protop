import React, { useMemo } from 'react';
import {
  View, Text, Modal, Pressable, StyleSheet, TouchableOpacity, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '../src/context/ThemeContext';
import { radius, space } from '../src/theme';
import { valueForTask } from '../src/utils/todos';
import TodoTaskIcon from './TodoTaskIcon';
import HelpTarget from './HelpTarget';

/**
 * Innbydende detalj for barn: ikon, tittel, beskrivelse, belønning.
 * Kvittering skjer via egen CTA — ikke forveksles med redigering.
 *
 * På web brukes fixed overlay (RN Modal er upålitelig i Safari/Chrome).
 */
export default function ChildTodoDetailModal({
  visible,
  task,
  done,
  unitLabel = 'stjerner',
  quiet = false,
  onClose,
  onComplete,
  canEdit = false,
  onEdit,
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (!visible || !task) return null;

  const reward = valueForTask(task);
  const description = String(task.description || task.notes || task.details || '').trim();
  const isMoney = unitLabel === 'kr';
  const hideReward = quiet || reward <= 0;

  const card = (
    <View style={styles.card} accessibilityViewIsModal>
      <TouchableOpacity
        style={styles.closeBtn}
        onPress={onClose}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Lukk"
      >
        <Ionicons name="close" size={22} color={colors.muted} />
      </TouchableOpacity>

      <View style={styles.sparkleRow} pointerEvents="none">
        <Text style={styles.sparkle}>✨</Text>
        <Text style={styles.sparkle}>⭐</Text>
        <Text style={styles.sparkle}>✨</Text>
      </View>

      <View style={[styles.iconWrap, done && styles.iconWrapDone]}>
        <TodoTaskIcon task={task} style={styles.iconImg} emojiSize={48} />
      </View>

      <Text style={styles.kicker}>
        {canEdit ? (done ? 'Fullført' : 'Gjøremål') : (done ? 'Fullført!' : 'Ditt gjøremål')}
      </Text>
      <Text style={styles.title}>{task.title}</Text>

      {done ? (
        <View style={styles.donePill}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <Text style={styles.donePillTxt}>Ferdig i dag — digg jobba!</Text>
        </View>
      ) : hideReward ? (
        <View style={styles.quietPill}>
          <Ionicons name="checkbox-outline" size={18} color={colors.brand} />
          <Text style={styles.quietPillTxt}>
            {canEdit ? 'Sjekkliste — ingen belønning' : 'Kryss av når du er ferdig'}
          </Text>
        </View>
      ) : (
        <View style={styles.rewardPill}>
          <Text style={styles.rewardEmoji}>{isMoney ? '💰' : '⭐'}</Text>
          <Text style={styles.rewardTxt}>
            {canEdit ? `Belønning: ${reward} ${unitLabel}` : `Du kan tjene ${reward} ${unitLabel}`}
          </Text>
        </View>
      )}

      <ScrollView
        style={styles.bodyScroll}
        contentContainerStyle={styles.bodyScrollInner}
        showsVerticalScrollIndicator={false}
      >
        {description ? (
          <Text style={styles.body}>{description}</Text>
        ) : (
          <Text style={styles.bodyMuted}>
            {done
              ? 'Supert jobbet — kryss i boka!'
              : 'Les gjennom, gjør oppgaven, og trykk «Jeg er ferdig!» når du er klar.'}
          </Text>
        )}
      </ScrollView>

      {canEdit && onEdit ? (
        <View style={styles.ctaStack}>
          <TouchableOpacity
            style={styles.cta}
            onPress={onEdit}
            activeOpacity={0.88}
            accessibilityRole="button"
            accessibilityLabel="Rediger gjøremål"
          >
            <Ionicons name="create-outline" size={22} color="#fff" />
            <Text style={styles.ctaTxt}>Rediger gjøremål</Text>
          </TouchableOpacity>
          {!done && onComplete ? (
            <TouchableOpacity
              style={styles.ctaSecondary}
              onPress={onComplete}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Marker som ferdig"
            >
              <Ionicons name="checkmark-circle-outline" size={20} color={colors.brand} />
              <Text style={styles.ctaSecondaryTxt}>Marker som ferdig</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.ctaGhost} onPress={onClose} activeOpacity={0.85}>
              <Text style={styles.ctaGhostTxt}>Lukk</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : !done ? (
        <HelpTarget id="content">
        <TouchableOpacity
          style={styles.cta}
          onPress={onComplete}
          activeOpacity={0.88}
          accessibilityRole="button"
          accessibilityLabel="Marker gjøremål som ferdig"
        >
          <Ionicons name="checkmark-circle" size={22} color="#fff" />
          <Text style={styles.ctaTxt}>Jeg er ferdig!</Text>
        </TouchableOpacity>
        </HelpTarget>
      ) : (
        <TouchableOpacity style={styles.ctaGhost} onPress={onClose} activeOpacity={0.85}>
          <Text style={styles.ctaGhostTxt}>Lukk</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webPortal} pointerEvents="box-none">
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View style={styles.webCenter} pointerEvents="box-none">
          {card}
        </View>
      </View>
    );
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e?.stopPropagation?.()}>
          {card}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    webPortal: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 100000,
      elevation: 100000,
    },
    webCenter: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      padding: 20,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      backgroundColor: colors.card || '#fff',
      borderRadius: 24,
      padding: 22,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      maxWidth: 420,
      width: '100%',
      alignSelf: 'center',
      maxHeight: '90%',
      ...(Platform.OS === 'web' ? { boxShadow: '0 22px 50px rgba(15,23,42,0.28)' } : {
        shadowColor: '#0f172a',
        shadowOpacity: 0.25,
        shadowRadius: 24,
        shadowOffset: { width: 0, height: 12 },
        elevation: 12,
      }),
    },
    closeBtn: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2,
      borderRadius: 20,
      backgroundColor: colors.brandSoft || '#eef6ff',
    },
    sparkleRow: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 4,
      marginBottom: 2,
    },
    sparkle: { fontSize: 16, opacity: 0.85 },
    iconWrap: {
      width: 100,
      height: 100,
      borderRadius: 32,
      backgroundColor: '#fff8e8',
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 8,
      marginBottom: 12,
      borderWidth: 2,
      borderColor: '#fde68a',
    },
    iconWrapDone: {
      backgroundColor: colors.successSoft || '#ecfdf5',
      borderColor: '#86efac',
    },
    iconImg: { width: 72, height: 72, borderRadius: 18 },
    emoji: { fontSize: 52 },
    kicker: {
      fontSize: 12,
      fontWeight: '800',
      color: colors.brand,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: 4,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: colors.ink,
      textAlign: 'center',
      letterSpacing: -0.4,
      marginBottom: 12,
      paddingHorizontal: 8,
    },
    rewardPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#fff8e8',
      borderRadius: radius.pill || 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: '#fde68a',
    },
    quietPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#f1f5f9',
      borderRadius: radius.pill || 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
    },
    quietPillTxt: { fontWeight: '700', fontSize: 14, color: colors.ink },
    rewardEmoji: { fontSize: 18 },
    rewardTxt: { fontWeight: '800', fontSize: 15, color: '#92400e' },
    donePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.successSoft || '#ecfdf5',
      borderRadius: radius.pill || 999,
      paddingHorizontal: 16,
      paddingVertical: 10,
      marginBottom: 12,
    },
    donePillTxt: { fontWeight: '800', fontSize: 14, color: colors.success },
    bodyScroll: { maxHeight: 160, alignSelf: 'stretch' },
    bodyScrollInner: { paddingHorizontal: 4, paddingBottom: 4 },
    body: {
      fontSize: 16,
      lineHeight: 24,
      color: colors.ink,
      fontWeight: '500',
      textAlign: 'center',
      marginBottom: space.md,
    },
    bodyMuted: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
      fontWeight: '500',
      textAlign: 'center',
      marginBottom: space.md,
    },
    cta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      alignSelf: 'stretch',
      backgroundColor: colors.brand,
      borderRadius: 16,
      paddingVertical: 16,
      marginTop: 4,
    },
    ctaTxt: { color: '#fff', fontWeight: '800', fontSize: 17 },
    ctaStack: { alignSelf: 'stretch', gap: 8, marginTop: 4 },
    ctaSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      alignSelf: 'stretch',
      backgroundColor: colors.brandSoft || '#eef6ff',
      borderRadius: 16,
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: colors.line,
    },
    ctaSecondaryTxt: { color: colors.brand, fontWeight: '800', fontSize: 15 },
    ctaGhost: {
      alignSelf: 'stretch',
      alignItems: 'center',
      paddingVertical: 14,
      marginTop: 4,
    },
    ctaGhostTxt: { color: colors.brand, fontWeight: '700', fontSize: 16 },
  });
}
