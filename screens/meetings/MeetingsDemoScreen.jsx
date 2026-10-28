/**
 * Auth-fri demo av Møter for manuell og automatisk UI-test.
 * Åpnes på /moter-demo (samme mønster som /faktura-demo). Minnelagring, ingen e-post.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../../src/context/ThemeContext';
import { todayOslo } from '../../src/meetings/model';
import { DEMO_PEOPLE, DEMO_PROJECTS, demoMeetings } from '../../src/meetings/demoData';
import { createMemoryMeetingStore } from '../../src/meetings/memoryStore';
import { MOTER_MENU } from '../../src/navigation/shellModules';
import MeetingsModule from './MeetingsModule';

export default function MeetingsDemoScreen() {
  const colors = useColors();
  const today = todayOslo();
  const [subView, setSubView] = useState('oversikt');
  const store = useMemo(() => createMemoryMeetingStore({ meetings: demoMeetings(today) }), [today]);
  const viewer = useMemo(() => ({
    uid: 'demo-user', email: 'goa@consult1.no', employeeId: 'emp_goa', name: 'Geir Ove Andersen',
  }), []);
  const people = useMemo(() => DEMO_PEOPLE.map((p) => ({ ...p, id: p.employeeId })), []);
  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <View style={[styles.bar, { borderBottomColor: colors.line, backgroundColor: colors.card }]}>
        <View style={{ flex: 1, minWidth: 220 }}>
          <Text style={{ fontWeight: '700', color: colors.ink }}>Møter-demo</Text>
          <Text style={{ color: colors.muted, fontSize: 12.5 }}>Minnelagring, ingen Firestore og ingen e-post. AI bruker lokal reserve.</Text>
        </View>
        {MOTER_MENU.map((item) => (
          <Pressable
            key={item.id}
            nativeID={`demo-nav-${item.id}`}
            onPress={() => setSubView(item.id)}
            style={[styles.tab, { borderColor: subView === item.id ? colors.brand : colors.line, backgroundColor: subView === item.id ? `${colors.brand}12` : colors.card }]}
          >
            <Text style={{ color: subView === item.id ? colors.brand : colors.ink, fontWeight: subView === item.id ? '700' : '500' }}>{item.label}</Text>
          </Pressable>
        ))}
      </View>
      <MeetingsModule
        subView={subView}
        onNavigate={setSubView}
        store={store}
        viewer={viewer}
        people={people}
        projects={DEMO_PROJECTS}
        company={{ name: 'Consult1 AS', orgNr: '912345678' }}
        canCreate
        isAdmin
        today={today}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%' },
  bar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  tab: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
});
