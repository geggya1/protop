import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useI18n } from '../../src/i18n';
import Wizard from '../../components/Wizard';
import { colors, radius } from '../../src/theme';

export default function LanguageScreen({ navigation, onDone }) {
  const { t, langs, lang, setLang } = useI18n();
  const [picked, setPicked] = useState(lang);

  const pick = async (id) => {
    setPicked(id);
    await setLang(id);
  };

  return (
    <Wizard
      title={t('lang.title')}
      subtitle={t('lang.subtitle')}
      onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined}
      onNext={async () => {
        await setLang(picked);
        if (onDone) {
          await onDone();
          return;
        }
        if (navigation.canGoBack()) navigation.goBack();
        else navigation.navigate('AuthChoice');
      }}
      nextLabel={t('common.continue')}
    >
      <Text style={styles.note} nativeID="lang-modules-note">{t('lang.modulesNorwegian')}</Text>
      <View style={styles.grid}>
        {langs.map((l) => (
          <TouchableOpacity
            key={l.id}
            onPress={() => pick(l.id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: picked === l.id }}
            accessibilityLabel={l.name}
            style={[styles.card, picked === l.id && styles.on]}
          >
            <Text style={styles.flag}>{l.flag}</Text>
            <Text style={[styles.name, picked === l.id && { color: colors.onBrand }]}>{l.name}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </Wizard>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '47%', minHeight: 88, borderRadius: radius.md, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: colors.line, padding: 10,
  },
  on: { backgroundColor: colors.brandInk, borderColor: colors.brandInk },
  note: { color: colors.muted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  flag: { fontSize: 32 },
  name: { fontWeight: '400', color: colors.ink, marginTop: 4 },
});
