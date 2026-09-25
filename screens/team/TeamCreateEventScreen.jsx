import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, ScrollView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { createTeamEvent } from '../../src/utils/teams';
import { teamColors as c } from '../../src/teamTheme';
import LocationPicker from '../../components/LocationPicker';

function InviteChip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
    >
      <Ionicons
        name={selected ? 'checkmark-circle' : 'ellipse-outline'}
        size={18}
        color={selected ? c.brand : c.muted}
      />
      <Text style={[styles.chipTxt, selected && styles.chipTxtOn]} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function TeamCreateEventScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { teamId } = route.params || {};
  const { uid } = useApp();
  const [title, setTitle] = useState('');
  const [dateKey, setDateKey] = useState('');
  const [startTime, setStartTime] = useState('');
  const [locationPlace, setLocationPlace] = useState(null);
  const [parents, setParents] = useState([]);
  const [children, setChildren] = useState([]);
  const [inviteParentIds, setInviteParentIds] = useState([]);
  const [inviteChildIds, setInviteChildIds] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!teamId) return undefined;
    const unsubP = onSnapshot(
      query(collection(db, 'families', teamId, 'parents')),
      (snap) => setParents(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.active !== false && p.deleted !== true),
      ),
    );
    const unsubC = onSnapshot(
      query(collection(db, 'families', teamId, 'children')),
      (snap) => setChildren(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((ch) => ch.active !== false && ch.deleted !== true),
      ),
    );
    return () => { unsubP(); unsubC(); };
  }, [teamId]);

  const inviteCount = inviteParentIds.length + inviteChildIds.length;

  const toggleParent = (id) => {
    setInviteParentIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const toggleChild = (id) => {
    setInviteChildIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectAllPlayers = () => {
    setInviteChildIds(children.map((ch) => ch.id));
  };
  const clearInvites = () => {
    setInviteParentIds([]);
    setInviteChildIds([]);
  };

  const inviteSummary = useMemo(() => {
    if (!inviteCount) return 'Ingen invitert ennå';
    const parts = [];
    if (inviteChildIds.length) parts.push(`${inviteChildIds.length} spiller${inviteChildIds.length === 1 ? '' : 'e'}`);
    if (inviteParentIds.length) parts.push(`${inviteParentIds.length} foresatt${inviteParentIds.length === 1 ? '' : 'e'}`);
    return parts.join(' · ');
  }, [inviteCount, inviteChildIds.length, inviteParentIds.length]);

  const save = async () => {
    setBusy(true);
    try {
      await createTeamEvent({
        teamId,
        title,
        dateKey,
        startTime: startTime || null,
        location: locationPlace?.label || null,
        locationPlace,
        memberIds: inviteParentIds,
        childIds: inviteChildIds,
        authorUid: uid,
      });
      nav.goBack();
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.back} onPress={() => nav.goBack()}>
          <Ionicons name="chevron-back" size={22} color={c.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Nytt arrangement</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Tittel</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Trening, kamp…"
          placeholderTextColor={c.muted}
        />
        <Text style={styles.label}>Dato</Text>
        {Platform.OS === 'web' ? (
          <View style={styles.dateWrap}>
            <input
              type="date"
              value={dateKey}
              onChange={(e) => setDateKey(e.target.value)}
              style={{
                width: '100%', padding: 14, borderRadius: 16, border: `1px solid ${c.line}`,
                background: c.surface, color: c.ink, fontWeight: '400', fontSize: 16,
              }}
            />
          </View>
        ) : (
          <TextInput
            style={styles.input}
            value={dateKey}
            onChangeText={setDateKey}
            placeholder="ÅÅÅÅ-MM-DD"
            placeholderTextColor={c.muted}
          />
        )}
        <Text style={styles.label}>Klokkeslett (valgfritt)</Text>
        {Platform.OS === 'web' ? (
          <View style={styles.dateWrap}>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              style={{
                width: '100%', padding: 14, borderRadius: 16, border: `1px solid ${c.line}`,
                background: c.surface, color: c.ink, fontWeight: '400', fontSize: 16,
              }}
            />
          </View>
        ) : (
          <TextInput
            style={styles.input}
            value={startTime}
            onChangeText={setStartTime}
            placeholder="17:55"
            placeholderTextColor={c.muted}
          />
        )}

        <Text style={styles.label}>Sted (Google Maps)</Text>
        <Text style={styles.hint}>Søk etter hall, bane eller adresse. Kart åpnes i Google Maps.</Text>
        <LocationPicker value={locationPlace} onChange={setLocationPlace} />

        <Text style={styles.label}>Inviter deltakere</Text>
        <Text style={styles.hint}>{inviteSummary}</Text>
        <View style={styles.inviteActions}>
          {children.length > 0 && (
            <TouchableOpacity style={styles.miniBtn} onPress={selectAllPlayers}>
              <Text style={styles.miniBtnTxt}>Alle spillere</Text>
            </TouchableOpacity>
          )}
          {inviteCount > 0 && (
            <TouchableOpacity style={styles.miniBtnGhost} onPress={clearInvites}>
              <Text style={styles.miniBtnGhostTxt}>Fjern alle</Text>
            </TouchableOpacity>
          )}
        </View>

        {children.length > 0 && (
          <>
            <Text style={styles.subLabel}>Spillere</Text>
            <View style={styles.chipWrap}>
              {children.map((ch) => (
                <InviteChip
                  key={ch.id}
                  label={ch.name || 'Spiller'}
                  selected={inviteChildIds.includes(ch.id)}
                  onPress={() => toggleChild(ch.id)}
                />
              ))}
            </View>
          </>
        )}

        {parents.length > 0 && (
          <>
            <Text style={styles.subLabel}>Foresatte / ledere</Text>
            <View style={styles.chipWrap}>
              {parents.map((p) => (
                <InviteChip
                  key={p.id}
                  label={p.name || p.email || 'Foresatt'}
                  selected={inviteParentIds.includes(p.id)}
                  onPress={() => toggleParent(p.id)}
                />
              ))}
            </View>
          </>
        )}

        {children.length === 0 && parents.length === 0 && (
          <Text style={styles.hint}>Ingen medlemmer på laget ennå. Du kan lagre arrangementet uten invitasjoner.</Text>
        )}

        <TouchableOpacity
          style={[styles.btn, busy && { opacity: 0.6 }]}
          onPress={save}
          disabled={busy || !title.trim() || !dateKey}
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.btnTxt}>Lagre arrangement</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  back: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.line,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 20, fontWeight: '400', color: c.ink },
  body: { padding: 16, paddingBottom: 40 },
  label: { color: c.ink, fontWeight: '400', fontSize: 13, marginBottom: 6, marginTop: 10 },
  subLabel: {
    color: c.muted, fontWeight: '400', fontSize: 11, letterSpacing: 0.6,
    textTransform: 'uppercase', marginTop: 10, marginBottom: 6,
  },
  hint: { color: c.muted, fontWeight: '400', fontSize: 13, marginBottom: 8, lineHeight: 18 },
  input: {
    backgroundColor: c.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 14,
    color: c.ink, fontWeight: '400', fontSize: 16, borderWidth: 1, borderColor: c.line,
  },
  dateWrap: { marginBottom: 4 },
  inviteActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  miniBtn: {
    alignSelf: 'flex-start',
    backgroundColor: c.brandSoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
  },
  miniBtnTxt: { color: c.brand, fontWeight: '400', fontSize: 13 },
  miniBtnGhost: {
    backgroundColor: c.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: c.line,
  },
  miniBtnGhostTxt: { color: c.muted, fontWeight: '400', fontSize: 13 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.surface, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12,
    borderWidth: 1, borderColor: c.line, maxWidth: '100%',
  },
  chipOn: { backgroundColor: c.brandSoft, borderColor: c.brand },
  chipTxt: { color: c.ink, fontWeight: '400', fontSize: 13, maxWidth: 160 },
  chipTxtOn: { color: c.brand },
  btn: {
    alignSelf: 'flex-start',
    marginTop: 24, backgroundColor: c.brand, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center',
  },
  btnTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
});
