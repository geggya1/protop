import React, { useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer, ModuleHubIntro } from '../../components/ModulePageBg';
import { useApp } from '../../src/context/AppContext';
import { useThemeMeta } from '../../src/context/ThemeContext';
import { colors, useLayout, appTileWidth } from '../../src/theme';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';


const TOGETHER = [
  {
    id: 'quiz', icon: 'flash', label: 'Familiequiz', sub: 'Live quiz med invitasjon',
    subView: 'quiz', color: '#6366f1',
  },
  {
    id: 'chess', icon: 'trophy', label: 'Sjakk', sub: 'AI · nettbrett · samme skjerm',
    screen: 'Chess', color: '#334155',
  },
  {
    id: 'ttt', icon: 'grid', label: 'Tre på rad', sub: 'AI · nettbrett · samme skjerm',
    screen: 'TicTacToe', color: '#0ea5e9',
  },
  {
    id: 'connect4', icon: 'ellipse', label: 'Fire på rad', sub: 'AI · nettbrett · samme skjerm',
    screen: 'Connect4', color: '#2563eb',
  },
  {
    id: 'memory', icon: 'apps', label: 'Memory', sub: 'AI · nettbrett · samme skjerm',
    screen: 'Memory', color: '#7c3aed',
  },
  {
    id: 'rps', icon: 'hand-left', label: 'Stein-saks-papir', sub: 'Alle velger samtidig',
    screen: 'RockPaperScissors', color: '#f59e0b',
  },
  {
    id: 'guess', icon: 'help', label: 'Gjette tallet', sub: 'Tall 1–10 · for små barn',
    screen: 'GuessNumber', color: '#10b981',
  },
  {
    id: 'draw', icon: 'brush', label: 'Tegn og gjett', sub: 'Tegn · familien gjetter',
    screen: 'DrawGuess', color: '#ec4899',
  },
  {
    id: 'hangman2', icon: 'text', label: 'Hangman sammen', sub: 'Send telefonen rundt',
    localId: 'hangman', color: '#0f766e',
  },
];

const CARDS = [
  { id: 'war', icon: 'albums', label: 'Krig', sub: 'Høyeste kort vinner', localId: 'war', color: '#b91c1c' },
  { id: 'blackjack', icon: 'diamond', label: 'Blackjack', sub: 'Mot huset', localId: 'blackjack', color: '#166534' },
  { id: 'highlow', icon: 'swap-vertical', label: 'Høyere/lavere', sub: 'Gjett neste kort', localId: 'highlow', color: '#c2410c' },
  { id: 'pairs', icon: 'copy', label: 'Kort-memory', sub: 'Par alene', localId: 'memorySolo', color: '#6d28d9' },
];

const SOLO = [
  { id: 'g2048', icon: 'keypad', label: '2048', sub: 'Én spiller', localId: 'g2048', color: '#b45309' },
  { id: 'mines', icon: 'warning', label: 'Minesveiper', sub: 'Én spiller', localId: 'mines', color: '#475569' },
  { id: 'slide', icon: 'grid-outline', label: '15-puslespill', sub: 'Én spiller', localId: 'slide', color: '#0369a1' },
  { id: 'hangman1', icon: 'text-outline', label: 'Hangman', sub: 'Én spiller', localId: 'hangman', color: '#0f766e' },
];

/**
 * Hub for enkle familiespill — spill sammen på tvers av telefon, nettbrett og PC.
 */
export default function FamilyGamesScreen({ compactHeader = false, inShell = false }) {
  useChildAppGuard('games');
  const nav = useNavigation();
  const { requestShellTab } = useApp();
  const { highChildFriendliness } = useThemeMeta();
  const { isDesktop, pad } = useLayout();
  const simpleUi = highChildFriendliness;
  const cols = 3;
  const gap = simpleUi ? 10 : 8;
  const cardWidth = appTileWidth(cols, gap);

  const styles = useMemo(
    () => makeStyles({ cardWidth, gap, simpleUi, isDesktop }),
    [cardWidth, gap, simpleUi, isDesktop],
  );

  const openGame = (game) => {
    if (game.subView) {
      requestShellTab?.('more', game.subView);
      return;
    }
    if (game.localId) {
      nav.navigate('LocalPlay', { gameId: game.localId, ...(game.playParams || {}) });
      return;
    }
    if (game.screen) nav.navigate(game.screen);
  };

  const showHubChrome = !inShell && !compactHeader;

  return (
    <Screen>
      <ModulePageFrame name="games">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, { padding: pad }]}
      >
        <ModuleHubIntro>
        {showHubChrome ? (
          <>
            <Text style={styles.hubTitle}>FamilieSpill</Text>
            <Mute style={simpleUi ? styles.hubSubSimple : null}>
              Spill mot datamaskin, på ulike enheter, eller samme skjerm — på telefon, nettbrett og PC.
            </Mute>
          </>
        ) : (
          <Mute style={simpleUi ? styles.hubSubSimple : null}>
            AI, nettbrett eller samme skjerm — åpne et spill og velg hvordan dere vil spille.
          </Mute>
        )}
        </ModuleHubIntro>

        <Section label="Sammen" games={TOGETHER} openGame={openGame} simpleUi={simpleUi} styles={styles} />
        <Section label="Kortspill" games={CARDS} openGame={openGame} simpleUi={simpleUi} styles={styles} />
        <Section label="Alene" games={SOLO} openGame={openGame} simpleUi={simpleUi} styles={styles} />

        <View style={styles.tipBox}>
          <Ionicons name="people" size={20} color={colors.brand} />
          <Text style={styles.tipTxt}>
            Tips: To-spillerspill har tre modi — mot datamaskin, ulike enheter (invitasjon), og samme skjerm. Åpne «Slik går du frem» for reglene.
          </Text>
        </View>
      <ModuleBgSpacer />
      </ScrollView>
      </ModulePageFrame>
    </Screen>
  );
}

function Section({ label, games, openGame, simpleUi, styles }) {
  return (
    <View>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.grid}>
        {games.map((game) => (
          <TouchableOpacity
            key={game.id}
            style={[styles.card, simpleUi && styles.cardSimple]}
            onPress={() => openGame(game)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={game.label}
          >
            <View style={[styles.iconWrap, { backgroundColor: `${game.color}22` }]}>
              <Ionicons name={game.icon} size={simpleUi ? 36 : 28} color={game.color} />
            </View>
            <Text style={[styles.cardLabel, simpleUi && styles.cardLabelSimple]} numberOfLines={2}>
              {game.label}
            </Text>
            {!simpleUi ? (
              <Text style={styles.cardSub} numberOfLines={2}>{game.sub}</Text>
            ) : null}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function makeStyles({ cardWidth, gap, simpleUi, isDesktop }) {
  return StyleSheet.create({
    scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
    body: { paddingBottom: 120 },
    hubTitle: {
      fontSize: simpleUi ? 28 : 22, fontWeight: '500', color: colors.ink, marginBottom: 6,
    },
    hubSubSimple: { fontSize: 16, lineHeight: 22 },
    sectionLabel: {
      marginTop: 18, fontSize: 13, fontWeight: '500', color: colors.muted,
    },
    grid: {
      flexDirection: 'row', flexWrap: 'wrap', gap, marginTop: 8,
    },
    card: {
      width: cardWidth,
      backgroundColor: 'rgba(255,255,255,0.94)',
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 6,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.line,
      minHeight: isDesktop ? 108 : 118,
      shadowColor: '#0f172a',
      shadowOpacity: 0.06,
      shadowRadius: 10,
      shadowOffset: { height: 4, width: 0 },
    },
    cardSimple: {
      minHeight: 130,
      borderRadius: 18,
      borderWidth: 2,
      borderColor: colors.brand,
      paddingVertical: 16,
    },
    iconWrap: {
      width: simpleUi ? 56 : 48,
      height: simpleUi ? 56 : 48,
      borderRadius: simpleUi ? 16 : 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardLabel: {
      fontWeight: '500', color: colors.ink, marginTop: 8, fontSize: 12, textAlign: 'center',
    },
    cardLabelSimple: { fontSize: 15, marginTop: 10 },
    cardSub: {
      color: colors.muted, fontWeight: '400', fontSize: 10, marginTop: 2, textAlign: 'center',
    },
    tipBox: {
      flexDirection: 'row', gap: 10, alignItems: 'flex-start',
      marginTop: 24, padding: 14, borderRadius: 14,
      backgroundColor: colors.brandSoft, borderWidth: 1, borderColor: colors.line,
    },
    tipTxt: { flex: 1, color: colors.ink, fontSize: simpleUi ? 15 : 13, lineHeight: simpleUi ? 22 : 18, fontWeight: '500' },
  });
}
