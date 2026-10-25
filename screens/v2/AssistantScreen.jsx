import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AssistantChat from '../../components/assistant/AssistantChat';

/**
 * ProTop-assistenten på full skjerm (native). Web bruker chat-docken.
 * «Vis meg» og «Åpne siden» går tilbake til skallet med riktig side.
 */
export default function AssistantScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const goBack = () => {
    if (nav.canGoBack?.()) nav.goBack();
    else nav.navigate('Home');
  };
  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <AssistantChat
        variant="screen"
        ask={route?.params?.ask || null}
        onBack={goBack}
        onCollapse={() => {}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07274C' },
});
