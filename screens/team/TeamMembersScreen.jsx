import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { isGroupAdmin, isTeamAdmin, resendAdultInvite } from '../../src/utils/groups';
import { teamColors as c } from '../../src/teamTheme';

function canInviteOnTeam(team, uid, parents) {
  return isTeamAdmin(team, uid, parents);
}

function isPendingInvite(p) {
  if (!p || p.deleted === true || p.leftAt) return false;
  if (p.placeholder === true) return true;
  if (p.inviteStatus === 'pending') return true;
  if (p.active === false && p.invitedAt) return true;
  return false;
}

function isActiveMember(p) {
  if (!p || p.deleted === true || p.leftAt) return false;
  return p.active !== false && !isPendingInvite(p);
}

export default function TeamMembersScreen({ teamId, team }) {
  const nav = useNavigation();
  const { uid } = useApp();
  const [parents, setParents] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resendBusyId, setResendBusyId] = useState(null);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    if (!teamId) { setLoading(false); return undefined; }
    const unsubP = onSnapshot(
      query(collection(db, 'families', teamId, 'parents')),
      (snap) => setParents(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.deleted !== true && !p.leftAt),
      ),
    );
    const unsubC = onSnapshot(
      query(collection(db, 'families', teamId, 'children')),
      (snap) => {
        setChildren(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((ch) => ch.active !== false && ch.deleted !== true));
        setLoading(false);
      },
    );
    return () => { unsubP(); unsubC(); };
  }, [teamId]);

  const canInvite = useMemo(
    () => canInviteOnTeam(team, uid, parents),
    [team, uid, parents],
  );

  const activeParents = useMemo(() => parents.filter(isActiveMember), [parents]);
  const invitedParents = useMemo(() => parents.filter(isPendingInvite), [parents]);

  const openInvite = (mode) => nav.navigate('TeamAddMember', { teamId, team, mode });

  const onResend = async (p) => {
    if (!canInvite || resendBusyId) return;
    if (!p?.email && !p?.phone) {
      setBanner({ ok: false, text: 'Mangler e-post og telefon — kan ikke sende på nytt.' });
      return;
    }
    setResendBusyId(p.id);
    setBanner(null);
    try {
      const res = await resendAdultInvite({
        familyId: teamId,
        parentId: p.id,
        familyName: team?.name || 'laget',
        groupType: team?.type || 'team',
        joinCode: team?.joinCode || '',
      });
      const parts = [];
      if (p.email) {
        if (res.emailSent) parts.push(`e-post til ${p.email}`);
        else parts.push(`e-post feilet${res.emailError ? ` (${res.emailError})` : ''}`);
      }
      if (p.phone) {
        if (res.smsSent) parts.push(`SMS til ${p.phone}`);
        else if (res.smsSent === false) parts.push(`SMS feilet${res.smsError ? ` (${res.smsError})` : ''}`);
      }
      const anyOk = res.emailSent === true || res.smsSent === true;
      setBanner({
        ok: anyOk,
        text: anyOk
          ? `Sendt på nytt: ${parts.join(' · ')}.`
          : `Kunne ikke sende: ${parts.join(' · ')}. Personen står fortsatt som invitert.`,
      });
    } catch (e) {
      setBanner({ ok: false, text: e?.message || 'Klarte ikke å sende på nytt.' });
    } finally {
      setResendBusyId(null);
    }
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;
  }

  return (
    <ScrollView contentContainerStyle={styles.body}>
      {canInvite ? (
        <TouchableOpacity style={styles.inviteCta} onPress={() => openInvite()}>
          <View style={styles.inviteIcon}>
            <Ionicons name="person-add" size={22} color="#fff" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.inviteTitle}>Inviter deltaker</Text>
            <Text style={styles.inviteSub}>E-post · telefon · eller bruker med passord</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#fff" />
        </TouchableOpacity>
      ) : (
        <View style={styles.hintBox}>
          <Text style={styles.hintTxt}>
            Administrator kan invitere foresatte med e-post, telefon eller opprette bruker med passord.
          </Text>
        </View>
      )}

      {banner ? (
        <View style={[styles.banner, banner.ok ? styles.bannerOk : styles.bannerErr]}>
          <Text style={styles.bannerTxt}>{banner.text}</Text>
        </View>
      ) : null}

      <View style={styles.modeRow}>
        {canInvite && (
          <>
            <TouchableOpacity style={styles.modeChip} onPress={() => openInvite('invite_email')}>
              <Ionicons name="mail-outline" size={16} color={c.brand} />
              <Text style={styles.modeChipTxt}>E-post</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modeChip} onPress={() => openInvite('invite_phone')}>
              <Ionicons name="call-outline" size={16} color={c.brand} />
              <Text style={styles.modeChipTxt}>Telefon</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modeChip} onPress={() => openInvite('password')}>
              <Ionicons name="key-outline" size={16} color={c.brand} />
              <Text style={styles.modeChipTxt}>Passord</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <Text style={styles.section}>Spillere / barn ({children.length})</Text>
      {children.length === 0 ? (
        <Text style={styles.empty}>Ingen spillere ennå. Godkjenn forespørsler eller del lagkode.</Text>
      ) : children.map((ch) => (
        <View key={ch.id} style={styles.row}>
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{(ch.name || '?')[0]}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{ch.name}</Text>
            <Text style={styles.sub}>Spiller</Text>
          </View>
        </View>
      ))}

      <Text style={[styles.section, { marginTop: 20 }]}>
        Invitert – ikke akseptert ({invitedParents.length})
      </Text>
      {invitedParents.length === 0 ? (
        <Text style={styles.empty}>Ingen ventende invitasjoner.</Text>
      ) : invitedParents.map((p) => {
        const contact = p.email || p.phone || '';
        const mailFailed = !!p.inviteEmailError && !p.inviteEmailSentAt;
        const smsFailed = !!p.inviteSmsError && !p.inviteSmsSentAt;
        const roleBit = p.admin || p.superAdmin ? ' · admin' : '';
        const canResend = !!(p.email || p.phone);
        return (
          <View key={p.id} style={styles.row}>
            <View style={[styles.avatar, styles.avatarPending]}>
              <Text style={styles.avatarTxt}>{(p.name || p.email || '?')[0]}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{p.name || p.email || 'Ukjent'}</Text>
              <Text style={styles.sub}>
                Invitert – ikke akseptert{roleBit}
                {contact ? ` · ${contact}` : ''}
              </Text>
              {mailFailed ? (
                <Text style={styles.errTiny}>E-post feilet: {p.inviteEmailError}</Text>
              ) : p.inviteEmailSentAt ? (
                <Text style={styles.okTiny}>E-post sendt</Text>
              ) : null}
              {smsFailed ? (
                <Text style={styles.errTiny}>SMS feilet: {p.inviteSmsError}</Text>
              ) : p.inviteSmsSentAt ? (
                <Text style={styles.okTiny}>SMS sendt</Text>
              ) : null}
            </View>
            {canInvite && canResend ? (
              <TouchableOpacity
                style={styles.resendBtn}
                onPress={() => onResend(p)}
                disabled={!!resendBusyId}
              >
                {resendBusyId === p.id ? (
                  <ActivityIndicator color={c.brand} size="small" />
                ) : (
                  <>
                    <Ionicons
                      name={p.email ? 'mail-outline' : 'chatbubble-ellipses-outline'}
                      size={14}
                      color={c.brand}
                    />
                    <Text style={styles.resendTxt}>Send på nytt</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        );
      })}

      <Text style={[styles.section, { marginTop: 20 }]}>
        Foresatte / ledere ({activeParents.length})
      </Text>
      {activeParents.length === 0 ? (
        <Text style={styles.empty}>Ingen aktive foresatte ennå.</Text>
      ) : activeParents.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{(p.name || '?')[0]}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{p.name || p.email || 'Ukjent'}</Text>
            <Text style={styles.sub}>
              {p.admin || p.superAdmin || team?.ownerUid === p.uid || team?.ownerUid === p.id
                ? 'Administrator'
                : 'Foresatt'}
            </Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  inviteCta: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.brand, borderRadius: 16, padding: 16, marginBottom: 10,
  },
  inviteIcon: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  inviteTitle: { color: '#fff', fontWeight: '400', fontSize: 16 },
  inviteSub: { color: 'rgba(255,255,255,0.88)', fontWeight: '400', fontSize: 12, marginTop: 2 },
  hintBox: {
    backgroundColor: c.surface, borderRadius: 12, padding: 12, marginBottom: 10,
  },
  hintTxt: { color: c.muted, fontWeight: '400', fontSize: 13, lineHeight: 18 },
  banner: { borderRadius: 12, padding: 12, marginBottom: 10 },
  bannerOk: { backgroundColor: '#d1fae5' },
  bannerErr: { backgroundColor: '#fef3c7' },
  bannerTxt: { color: c.ink, fontWeight: '400', fontSize: 13, lineHeight: 18 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  modeChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: c.brandSoft,
  },
  modeChipTxt: { color: c.brand, fontWeight: '400', fontSize: 12 },
  section: { color: c.muted, fontWeight: '400', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 12, padding: 12, marginBottom: 8,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarPending: { backgroundColor: c.brandSoft },
  avatarTxt: { color: c.ink, fontWeight: '400' },
  name: { color: c.ink, fontWeight: '400', fontSize: 15 },
  sub: { color: c.muted, fontWeight: '400', fontSize: 12, marginTop: 1 },
  errTiny: { color: '#b45309', fontWeight: '400', fontSize: 11, marginTop: 3 },
  okTiny: { color: c.tint, fontWeight: '400', fontSize: 11, marginTop: 3 },
  resendBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10,
    backgroundColor: c.brandSoft, minWidth: 44, justifyContent: 'center',
  },
  resendTxt: { color: c.brand, fontWeight: '400', fontSize: 11 },
  empty: { color: c.muted, fontWeight: '400', marginBottom: 8 },
});
