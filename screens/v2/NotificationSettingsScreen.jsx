import React from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../../src/theme';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import NotificationPrefsPanel from '../../components/NotificationPrefsPanel';

/** Varselinnstillinger: push og e-post per varseltype. Lenket fra e-poster (settings/notifications). */
export default function NotificationSettingsScreen() {
  const nav = useNavigation();
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <CompactBackLink onPress={() => (nav.canGoBack() ? nav.goBack() : nav.navigate('Home'))} label="Tilbake" />
        <Text accessibilityRole="header" style={styles.title}>Varselinnstillinger</Text>
        <NotificationPrefsPanel />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 12, maxWidth: 760, width: '100%', alignSelf: 'center' },
  title: { color: colors.ink, fontSize: 24, fontWeight: '700' },
});
