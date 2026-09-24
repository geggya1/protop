import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Alert, Share, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { ensurePlatformJoinCode } from '../../src/platform/platformCore';
import { updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { isGroupAdmin } from '../../src/utils/groups';
import { generateJoinCode } from '../../src/platform/platformCore';

async function rotateJoinCode(groupId, uid, group) {
  if (!isGroupAdmin(group, uid)) throw new Error('Kun administrator kan fornye koden.');
  const joinCode = generateJoinCode(8);
  await updateDoc(doc(db, 'families', groupId), { joinCode, updatedAt: serverTimestamp() });
  return joinCode;
}

export default function PlatformInviteScreen({ config, groupId, group }) {
  const c = config.theme;
  const nav = useNavigation();
  const { uid } = useApp();
  const [code, setCode] = useState(group?.joinCode || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (group?.joinCode) {
      setCode(group.joinCode);
      return;
    }
    if (groupId && isGroupAdmin(group, uid)) {
      ensurePlatformJoinCode(groupId).then(setCode).catch(() => {});
    }
  }, [group?.joinCode, groupId, group, uid]);

  const share = async () => {
    const message = `Bli med i ${group?.name || config.label.toLowerCase()} på ProTop!\n\n${config.codeLabel}: ${code}\n\nÅpne appen → ${config.label} → «Bli med med kode». Administrator godkjenner under Godkjenninger.`;
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
      const next = await rotateJoinCode(groupId, uid, group);
      setCode(next);
      Alert.alert('Ny kode', `${config.codeLabel} er nå ${next}`);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke fornye koden.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.body, { backgroundColor: c.bg }]}>
      <Text style={[styles.lead, { color: c.muted }]}>
        Del {config.codeLabel.toLowerCase()} slik at andre kan be om å bli med. Du godkjenner under Godkjenninger.
      </Text>
      <View style={[styles.codeCard, { backgroundColor: c.surface }]}>
        <Text style={[styles.codeLabel, { color: c.muted }]}>{config.codeLabel}</Text>
        <Text style={[styles.code, { color: c.ink }]}>{code || '—'}</Text>
      </View>
      <TouchableOpacity style={[styles.primary, { backgroundColor: c.brand }]} onPress={share}>
        <Ionicons name="share-outline" size={18} color="#fff" />
        <Text style={styles.primaryTxt}>Del kode</Text>
      </TouchableOpacity>
      {isGroupAdmin(group, uid) && (
        <TouchableOpacity style={[styles.secondary, { borderColor: c.line }]} onPress={rotate} disabled={busy}>
          <Text style={[styles.secondaryTxt, { color: c.brand }]}>Forny kode</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        style={[styles.link, { backgroundColor: c.surface, borderColor: c.line }]}
        onPress={() => nav.navigate(config.joinRoute)}
      >
        <Ionicons name="key-outline" size={18} color={c.brand} />
        <Text style={[styles.linkTxt, { color: c.ink }]}>Har du en kode? Bli med her</Text>
        <Ionicons name="chevron-forward" size={16} color={c.muted} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: 16 },
  lead: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  codeCard: { borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16 },
  codeLabel: { fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  code: { fontWeight: '900', fontSize: 36, letterSpacing: 4, marginTop: 8 },
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingVertical: 14, marginBottom: 10 },
  primaryTxt: { color: '#fff', fontWeight: '900', fontSize: 15 },
  secondary: { alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  secondaryTxt: { fontWeight: '700', fontSize: 14 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 14, borderWidth: 1 },
  linkTxt: { flex: 1, fontWeight: '700', fontSize: 14 },
});
