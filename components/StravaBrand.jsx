import React, { useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, Platform, Image, Linking, ActivityIndicator,
} from 'react-native';

/** Geir / Andersen — offentlig Strava-profil (follow-badge). */
export const STRAVA_ATHLETE_ID = '141121474';
export const STRAVA_ATHLETE_URL = `https://www.strava.com/athletes/${STRAVA_ATHLETE_ID}`;

const SPRITE_URI = 'https://badges.strava.com/echelon-sprite-48.png';
const STRAVA_ORANGE = '#FC5200';

/**
 * Offisiell Strava follow-badge (48×48 sprite fra badges.strava.com).
 * Samme markup som Strava leverer for atlet-profil.
 */
export function StravaFollowBadge({
  athleteId = STRAVA_ATHLETE_ID,
  size = 48,
  style,
}) {
  const [hover, setHover] = useState(false);
  const url = `https://www.strava.com/athletes/${athleteId}`;

  const open = () => {
    Linking.openURL(url).catch(() => {});
  };

  if (Platform.OS === 'web') {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Følg på Strava"
        onPress={open}
        // @ts-expect-error web-only mouse events
        onHoverIn={() => setHover(true)}
        onHoverOut={() => setHover(false)}
        style={[styles.followWrap, { width: size, height: size }, style]}
      >
        <View
          style={[
            styles.followSprite,
            {
              width: size,
              height: size,
              // @ts-expect-error web background shorthand
              backgroundImage: `url(${SPRITE_URI})`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: hover ? '0 -63px' : '0 0',
              backgroundSize: '48px 174px',
            },
          ]}
        />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={open}
      accessibilityRole="link"
      accessibilityLabel="Følg på Strava"
      style={[styles.followWrap, { width: size, height: size }, style]}
    >
      <Image
        source={{ uri: SPRITE_URI }}
        style={{ width: size, height: size * (174 / 48), marginTop: 0 }}
        resizeMode="cover"
      />
    </Pressable>
  );
}

/**
 * «Connect with Strava» — 48px høyde, oransje #FC5200 (brand guidelines).
 * Triggere OAuth via onPress (ikke egen href — vi bruker AuthSession).
 */
export function StravaConnectButton({
  onPress,
  busy = false,
  label = 'Connect with Strava',
  connected = false,
  style,
}) {
  const text = connected ? 'Sync with Strava' : label;
  return (
    <Pressable
      onPress={busy ? undefined : onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={text}
      style={[
        styles.connectBtn,
        Platform.OS === 'web' ? { cursor: busy ? 'default' : 'pointer' } : null,
        busy && { opacity: 0.75 },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          <StravaMark size={20} />
          <Text style={styles.connectTxt}>{text}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Enkel Strava «S»-mark i hvit — brukt inne i Connect-knappen. */
function StravaMark({ size = 20 }) {
  return (
    <View style={[styles.mark, { width: size, height: size, borderRadius: size * 0.22 }]}>
      <Text style={[styles.markTxt, { fontSize: size * 0.72, lineHeight: size }]}>S</Text>
    </View>
  );
}

export function StravaPoweredBy({ style }) {
  return (
    <Pressable
      onPress={() => Linking.openURL('https://www.strava.com').catch(() => {})}
      style={[styles.poweredRow, style]}
      accessibilityRole="link"
    >
      <Text style={styles.poweredTxt}>Compatible with Strava</Text>
      <StravaFollowBadge size={32} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  followWrap: {
    overflow: 'hidden',
    borderRadius: 4,
  },
  followSprite: {
    overflow: 'hidden',
  },
  connectBtn: {
    height: 48,
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: STRAVA_ORANGE,
    borderRadius: 4,
    paddingHorizontal: 16,
  },
  connectTxt: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.2,
  },
  mark: {
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markTxt: {
    color: STRAVA_ORANGE,
    fontWeight: '900',
    textAlign: 'center',
  },
  poweredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginTop: 10,
    paddingVertical: 4,
  },
  poweredTxt: {
    color: '#64748b',
    fontWeight: '500',
    fontSize: 12,
  },
});
