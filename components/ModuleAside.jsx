import React, { createContext, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../src/theme';
import { useHelp } from '../src/context/HelpContext';
import { shortPitch } from '../src/utils/helpLayout';
import { moduleHeroName } from '../src/modules/moduleHero';
import { useI18n } from '../src/i18n';

export const ModuleAsideSlotContext = createContext(null);

export function ModuleAsideProvider({ children }) {
  const [node, setNode] = useState(null);
  const ownerRef = useRef(null);
  const api = useMemo(() => ({
    claim(owner, next) {
      ownerRef.current = owner;
      setNode((prev) => (prev === next ? prev : next));
    },
    release(owner) {
      if (ownerRef.current !== owner) return;
      ownerRef.current = null;
      setNode(null);
    },
  }), []);

  const value = useMemo(() => ({ ...api, node }), [api, node]);

  return (
    <ModuleAsideSlotContext.Provider value={value}>
      {children}
    </ModuleAsideSlotContext.Provider>
  );
}

function TipsCard() {
  const { lang } = useI18n();
  const { copy, hasHelp, openModuleHelp, moduleId } = useHelp();
  const moduleName = moduleHeroName(moduleId, lang);
  const tipsKicker = moduleName
    ? (lang === 'en' ? `Tips for ${moduleName}` : `Tips for ${moduleName}`)
    : (copy?.kicker || 'Tips');
  if (!hasHelp || !copy) {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>Tips</Text>
        <Text style={styles.title}>Hold oversikt uten støy</Text>
        <Text style={styles.body}>
          Hovedfeltet til venstre er selve appen. Her samler vi korte forklaringer
          og snarveier, så siden ikke trenger å fylle hele skjermen.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>{tipsKicker}</Text>
      <Text style={styles.title}>{copy.title}</Text>
      {!!copy.pitch && (
        <Text style={styles.body}>{shortPitch(copy.pitch, 180)}</Text>
      )}
      {(copy.steps || []).slice(0, 3).map((step, i) => (
        <View key={i} style={styles.step}>
          <Text style={styles.stepNum}>{i + 1}</Text>
          <Text style={styles.stepTxt}>{step}</Text>
        </View>
      ))}
      <TouchableOpacity
        style={styles.helpBtn}
        onPress={openModuleHelp}
        accessibilityRole="button"
        accessibilityLabel="Åpne hjelp"
      >
        <Ionicons name="bulb-outline" size={16} color={colors.brand} />
        <Text style={styles.helpTxt}>Åpne veiledning</Text>
      </TouchableOpacity>
    </View>
  );
}

/**
 * Sidestilt felt på desktop: kort hjelp / kontekst uten å strekke
 * hovedinnholdet over hele bredden. Skjermer kan legge inn ekstra
 * forslag under tipskortet via useModuleAsideSlot.
 */
export default function ModuleAside() {
  const ctx = React.useContext(ModuleAsideSlotContext);
  const extras = ctx?.node || null;

  return (
    <ScrollView
      style={styles.wrap}
      contentContainerStyle={styles.stack}
      showsVerticalScrollIndicator={false}
    >
      <TipsCard />
      {extras}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 0 },
  stack: { gap: 12, paddingBottom: 16 },
  card: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.ink,
    lineHeight: 20,
  },
  body: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.muted,
    lineHeight: 18,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  stepNum: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.brandSoft,
    color: colors.brand,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
    overflow: 'hidden',
  },
  stepTxt: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: colors.ink,
    lineHeight: 18,
  },
  helpBtn: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  helpTxt: { color: colors.brand, fontWeight: '700', fontSize: 13 },
});
