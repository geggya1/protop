import React from 'react';
import { View, Text, ScrollView, StyleSheet, Platform } from 'react-native';
import CompactBackLink from '../CompactBackLink';
import { ShortcutTile } from './PastelCards';
import { useHomeImmersive } from '../../src/context/HomeImmersiveContext';
import { immersiveHeroMuted, immersiveHeroText } from './homeGlass';
import { useBottomChromeInset } from '../../src/utils/useBottomChromeInset';
import { parentAppShortLabel } from '../../src/utils/parentHomeShortcuts';
import { countForItem } from '../../src/utils/notifications';
import { soft } from '../parentHome/softTheme';

/**
 * Photo-backdrop dashboard of every family module as glass shortcut tiles.
 * Opened from the home «+ mer» folder tile.
 */
export default function HomeModulesBoard({
  apps = [],
  unreadByModule,
  onPress,
  onBack,
  title = 'Moduler',
  subtitle,
  backLabel = 'Tilbake',
  embedded = false,
}) {
  const immersive = useHomeImmersive();
  const { contentPaddingBottom } = useBottomChromeInset();

  const inner = (
    <>
      {onBack ? (
        <CompactBackLink
          onPress={onBack}
          label={backLabel}
          color={immersive ? '#FFFFFF' : undefined}
          light={immersive}
        />
      ) : null}
      <Text
        style={[styles.title, immersive && styles.titleImmersive]}
        accessibilityRole="header"
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.sub, immersive && styles.subImmersive]}>{subtitle}</Text>
      ) : null}
      <View style={styles.grid}>
        {apps.map((app, i) => (
          <View key={app.id} style={styles.cell}>
            <ShortcutTile
              app={{
                ...app,
                tileLabel: parentAppShortLabel(app) || app.label,
                badge: countForItem(unreadByModule, app),
              }}
              index={i}
              size="board"
              onPress={onPress}
            />
          </View>
        ))}
      </View>
    </>
  );

  if (embedded) {
    return (
      <View testID="home-modules-board" style={styles.embedded}>
        {inner}
      </View>
    );
  }

  return (
    <ScrollView
      testID="home-modules-board"
      style={styles.scroll}
      contentContainerStyle={[styles.body, { paddingBottom: contentPaddingBottom }]}
      showsVerticalScrollIndicator={false}
    >
      {inner}
    </ScrollView>
  );
}

const sans = Platform.OS === 'web' ? 'Inter, system-ui, -apple-system, sans-serif' : undefined;
const display = Platform.OS === 'web' ? 'Fraunces, Georgia, serif' : undefined;

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: 'transparent' },
  embedded: {
    backgroundColor: 'transparent',
    paddingBottom: 8,
  },
  body: {
    paddingHorizontal: 10,
    paddingTop: 4,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 26,
    lineHeight: 30,
    color: soft.ink,
    fontFamily: display,
    fontWeight: '500',
    marginBottom: 4,
  },
  titleImmersive: {
    color: immersiveHeroText,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  },
  sub: {
    fontSize: 14,
    lineHeight: 18,
    color: soft.muted,
    fontFamily: sans,
    marginBottom: 12,
  },
  subImmersive: {
    color: immersiveHeroMuted,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  cell: {
    width: '23.2%',
    maxWidth: '23.2%',
    flexGrow: 0,
    flexShrink: 0,
  },
});
