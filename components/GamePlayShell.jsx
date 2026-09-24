/**
 * Felles chrome for spilleskjermer — responsiv padding og max-bredde.
 */
import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from './ui';
import CompactBackLink from './CompactBackLink';
import EdgeSwipeBack from './EdgeSwipeBack';
import GameHowTo from './GameHowTo';
import { colors, useLayout } from '../src/theme';
import { gameContentMax } from '../src/utils/gameLayout';

/**
 * @param {object} props
 * @param {string} [props.title]
 * @param {React.ReactNode} props.children
 * @param {() => void} [props.onBack]
 * @param {string} [props.backLabel]
 * @param {() => void} [props.onReset]
 * @param {string} [props.resetLabel]
 * @param {{ title: string, steps: string[] }} [props.guide]
 * @param {boolean} [props.simpleUi]
 * @param {boolean} [props.guideDefaultOpen]
 * @param {React.ReactNode} [props.headerExtra]
 * @param {boolean} [props.scroll=true]
 */
export default function GamePlayShell({
  title,
  children,
  onBack,
  backLabel = 'Tilbake til spill',
  onReset,
  resetLabel = 'Ny runde',
  guide,
  simpleUi = false,
  guideDefaultOpen = false,
  headerExtra,
  scroll = true,
}) {
  const nav = useNavigation();
  const layout = useLayout();
  const contentMax = gameContentMax(layout);
  const styles = useMemo(
    () => makeStyles(layout, contentMax, simpleUi),
    [layout, contentMax, simpleUi],
  );

  const handleBack = onBack || (() => nav.goBack());

  const inner = (
    <>
      <CompactBackLink onPress={handleBack} label={backLabel} />
      {(title || onReset) ? (
        <View style={styles.head}>
          {title ? (
            <Text style={styles.title} numberOfLines={2}>{title}</Text>
          ) : <View style={{ flex: 1 }} />}
          {onReset ? (
            <TouchableOpacity onPress={onReset} style={styles.reset} accessibilityRole="button">
              <Ionicons name="refresh" size={16} color={colors.brand} />
              <Text style={styles.resetTxt}>{resetLabel}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
      {headerExtra}
      {guide?.steps?.length ? (
        <GameHowTo
          title={guide.title}
          steps={guide.steps}
          defaultOpen={guideDefaultOpen}
          simpleUi={simpleUi}
        />
      ) : null}
      <View style={styles.playArea}>{children}</View>
    </>
  );

  return (
    <Screen>
      <EdgeSwipeBack enabled={!layout.isDesktop} onBack={handleBack}>
        {scroll ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {inner}
          </ScrollView>
        ) : (
          <View style={[styles.body, styles.bodyFill]}>{inner}</View>
        )}
      </EdgeSwipeBack>
    </Screen>
  );
}

function makeStyles(layout, contentMax, simpleUi) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    body: {
      padding: layout.pad,
      paddingBottom: 48,
      width: '100%',
      maxWidth: contentMax,
      alignSelf: 'center',
      flexGrow: 1,
    },
    bodyFill: { flex: 1 },
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 10,
    },
    title: {
      flex: 1,
      fontSize: simpleUi ? 26 : layout.isDesktop ? 24 : 22,
      fontWeight: '700',
      color: colors.ink,
      letterSpacing: -0.3,
    },
    reset: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
      backgroundColor: colors.brandSoft,
    },
    resetTxt: { color: colors.brand, fontWeight: '700', fontSize: simpleUi ? 15 : 13 },
    playArea: {
      width: '100%',
      alignItems: 'stretch',
      minHeight: layout.isPhone ? 300 : layout.isTablet ? 420 : 520,
    },
  });
}
