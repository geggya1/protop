/**
 * Lokal demo av hjelpesenteret og Helpdesk-portalen (/helpdesk-demo).
 * Bare i utviklingsbygg. Kjører den ekte saksbehandlingen (src/helpdesk/service.js)
 * mot en database i minnet, så alt kan prøves uten innlogging og uten ekte data.
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createDemoBackend } from '../../src/helpdesk/demoBackend';
import { setHelpdeskBackend } from '../../src/helpdesk/client';
import HelpCenterScreen from './HelpCenterScreen';
import HelpdeskPortalScreen from './HelpdeskPortalScreen';
import { HD } from '../../components/helpdesk/HelpdeskUi';

export function helpdeskDemoAllowed() {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

export default function HelpdeskDemoScreen({ navigation, route }) {
  const backend = useMemo(() => (helpdeskDemoAllowed() ? createDemoBackend() : null), []);
  const [role, setRole] = useState(route?.params?.som === 'kunde' ? 'user' : 'agent');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!backend) return undefined;
    setHelpdeskBackend(backend);
    backend.ready.then(() => setReady(true));
    return () => setHelpdeskBackend(null);
  }, [backend]);

  useEffect(() => { backend?.setIdentity(role); }, [backend, role]);

  if (!backend) {
    return <View style={st.center}><Text>Siden finnes bare lokalt.</Text></View>;
  }
  if (!ready) return <View style={st.center}><Text style={{ color: HD.muted }}>Lager eksempelsaker …</Text></View>;

  return (
    <View style={st.root} testID="helpdesk-demo">
      <View style={st.bar}>
        <Ionicons name="flask-outline" size={16} color="#92400e" />
        <Text style={st.barTxt}>Demo med eksempeldata. Ingenting lagres, og ingen e-post sendes.</Text>
        <View style={st.switch}>
          {[['user', 'Kunde (Kari)'], ['agent', 'Helpdesk (Geir Ove)']].map(([id, label]) => (
            <TouchableOpacity key={id} onPress={() => setRole(id)} style={[st.seg, role === id && st.segOn]} testID={`demo-as-${id}`}>
              <Text style={[st.segTxt, role === id && st.segTxtOn]}>{label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      <View style={{ flex: 1 }} key={role}>
        {role === 'user'
          ? <HelpCenterScreen demo />
          : <HelpdeskPortalScreen navigation={navigation} route={route} demoOutbox={backend.outbox} />}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: HD.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#fef3c7', flexWrap: 'wrap' },
  barTxt: { flex: 1, color: '#92400e', fontSize: 12.5, minWidth: 200 },
  switch: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 8, padding: 2, borderWidth: 1, borderColor: '#fde68a' },
  seg: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  segOn: { backgroundColor: '#92400e' },
  segTxt: { fontSize: 12.5, color: '#92400e', fontWeight: '600' },
  segTxtOn: { color: '#fff' },
});
