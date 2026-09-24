import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Share, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { rotateTeamJoinCode } from '../../src/utils/teams';
import { teamColors as c } from '../../src/teamTheme';

export default function TeamInviteScreen({ teamId, team }) {
  const nav = useNavigation();
  const { uid } = useApp();
  const [code, setCode] = useState(team?.joinCode || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setCode(team?.joinCode || '');
  }, [team?.joinCode]);

  const share = async () => {
    const message = `Bli med i ${team?.name || 'laget'} på ProTop!\n\nLagkode: ${code}\n\nÅpne appen → Idrettslag → «Har du en lagkode?» Oppgi kode og barnets navn. Administrator må godkjenne.`;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(message);
        Alert.alert('Kopiert', 'Invitasjonsteksten er kopiert.');
        return;
      }
      await Share.share({ message });
    } catch {
      Alert.alert('Kode', code);
    }
  };

  const rotate = async () => {
    setBusy(true);
    try {
      const next = await rotateTeamJoinCode(teamId, uid);
      setCode(next);
      Alert.alert('Ny kode', `Lagkoden er nå ${next}`);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke fornye koden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.body}>
      <TouchableOpacity
        style={styles.direct}
        onPress={() => nav.navigate('TeamAddMember', { teamId, team })}
      >
        <Ionicons name="person-add-outline" size={18} color={c.brand} />
        <View style={{ flex: 1 }}>
          <Text style={styles.directTitle}>Inviter direkte</Text>
          <Text style={styles.directSub}>E-post, telefon eller opprett bruker med passord</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={c.muted} />
      </TouchableOpacity>

      <Text style={styles.lead}>
        Eller del lagkoden. Foresatte oppgir kode + barnets for- og etternavn, og du godkjenner under Godkjenninger.
      </Text>
      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>Lagkode</Text>
        <Text style={styles.code}>{code || '—'}</Text>
      </View>
      <TouchableOpacity style={styles.primary} onPress={share}>
        <Ionicons name="share-outline" size={18} color="#fff" />
        <Text style={styles.primaryTxt}>Del kode</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondary} onPress={rotate} disabled={busy}>
        <Text style={styles.secondaryTxt}>Forny kode</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16 },
  direct: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 14, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: c.brandSoft,
  },
  directTitle: { color: c.ink, fontWeight: '800', fontSize: 14 },
  directSub: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 2 },
  lead: { color: c.muted, fontWeight: '600', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  codeCard: {
    backgroundColor: c.surface, borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16,
  },
  codeLabel: { color: c.muted, fontWeight: '800', fontSize: 12, textTransform: 'uppercase' },
  code: { color: c.ink, fontWeight: '900', fontSize: 36, letterSpacing: 4, marginTop: 8 },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.brand, borderRadius: 16, paddingVertical: 14, marginBottom: 10,
  },
  primaryTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  secondary: {
    alignItems: 'center', paddingVertical: 14, borderRadius: 16, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.line,
  },
  secondaryTxt: { color: c.ink, fontWeight: '800' },
});
