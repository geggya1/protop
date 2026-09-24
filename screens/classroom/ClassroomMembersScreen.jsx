import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, ActivityIndicator, TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { isClassroomAdmin, staffRoleLabel, setStaffRole, STAFF_ROLES } from '../../src/utils/classroom';
import { resendAdultInvite, dedupeFamilyParents, archiveSupersededParentPlaceholders } from '../../src/utils/groups';
import { classroomColors as c } from '../../src/classroomTheme';

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

export default function ClassroomMembersScreen({ classroomId, classroom }) {
  const nav = useNavigation();
  const { uid } = useApp();
  const [parents, setParents] = useState([]);
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resendBusyId, setResendBusyId] = useState(null);
  const [banner, setBanner] = useState(null);

  useEffect(() => {
    if (!classroomId) { setLoading(false); return undefined; }
    const unsubP = onSnapshot(
      query(collection(db, 'families', classroomId, 'parents')),
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.deleted !== true && !p.leftAt);
        const deduped = dedupeFamilyParents(list);
        setParents(deduped);
        if (list.length > deduped.length) {
          archiveSupersededParentPlaceholders(classroomId, list).catch(() => {});
        }
      },
    );
    const unsubC = onSnapshot(
      query(collection(db, 'families', classroomId, 'children')),
      (snap) => {
        setChildren(snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((ch) => ch.active !== false && ch.deleted !== true));
        setLoading(false);
      },
    );
    return () => { unsubP(); unsubC(); };
  }, [classroomId]);

  const canInvite = useMemo(
    () => isClassroomAdmin(classroom, uid, parents),
    [classroom, uid, parents],
  );

  const activeParents = useMemo(() => parents.filter(isActiveMember), [parents]);
  const invitedParents = useMemo(() => parents.filter(isPendingInvite), [parents]);
  const staff = useMemo(() => {
    const seen = new Set();
    return activeParents.filter((p) => {
      const isStaff = !!(p.staffRole || p.admin || p.superAdmin
        || classroom?.ownerUid === p.uid || classroom?.ownerUid === p.id);
      if (!isStaff) return false;
      const key = p.uid || p.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activeParents, classroom?.ownerUid]);
  const guardians = useMemo(() => {
    const staffKeys = new Set(staff.map((p) => p.uid || p.id).filter(Boolean));
    return activeParents.filter((p) => !staffKeys.has(p.uid || p.id));
  }, [activeParents, staff]);

  const onResend = async (p) => {
    if (!canInvite || resendBusyId) return;
    setResendBusyId(p.id);
    try {
      const res = await resendAdultInvite({
        familyId: classroomId,
        parentId: p.id,
        familyName: classroom?.name || 'klassen',
        groupType: classroom?.type || 'classroom',
        joinCode: classroom?.joinCode || '',
      });
      const anyOk = res.emailSent === true || res.smsSent === true;
      setBanner({ ok: anyOk, text: anyOk ? 'Invitasjon sendt på nytt.' : 'Kunne ikke sende på nytt.' });
    } catch (e) {
      setBanner({ ok: false, text: e?.message || 'Klarte ikke å sende.' });
    } finally {
      setResendBusyId(null);
    }
  };

  const changeRole = (p) => {
    if (!canInvite) return;
    Alert.alert(
      'Sett rolle',
      p.name || 'Ansatt',
      [
        ...STAFF_ROLES.map((r) => ({
          text: r.label,
          onPress: () => setStaffRole(classroomId, p.uid || p.id, r.id).catch((e) => Alert.alert('Feil', e?.message)),
        })),
        { text: 'Avbryt', style: 'cancel' },
      ],
    );
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={c.brand} /></View>;

  return (
    <ScrollView contentContainerStyle={styles.body}>
      {canInvite ? (
        <>
          <TouchableOpacity
            style={styles.inviteCta}
            onPress={() => nav.navigate('ClassroomAddStaff', { classroomId, classroom })}
          >
            <View style={styles.inviteIcon}><Ionicons name="person-add" size={22} color="#fff" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteTitle}>Inviter lærer / ansatt</Text>
              <Text style={styles.inviteSub}>Rektor, lærer, assistent eller skoleadmin</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryCta}
            onPress={() => nav.navigate('ClassroomAddStudents', { classroomId, classroom })}
          >
            <Ionicons name="people-outline" size={18} color={c.brand} />
            <Text style={styles.secondaryTxt}>Legg til mange elever</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.hintBox}>
          <Text style={styles.hintTxt}>Rektor kan invitere ansatte og legge inn elever.</Text>
        </View>
      )}

      {banner ? (
        <View style={[styles.banner, banner.ok ? styles.bannerOk : styles.bannerErr]}>
          <Text style={styles.bannerTxt}>{banner.text}</Text>
        </View>
      ) : null}

      <Text style={styles.section}>Elever ({children.length})</Text>
      {children.length === 0 ? (
        <Text style={styles.empty}>Ingen elever ennå. Legg til i liste eller del klassekode.</Text>
      ) : children.map((ch) => (
        <View key={ch.id} style={styles.row}>
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{(ch.name || '?')[0]}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{ch.name}</Text>
            <Text style={styles.sub}>Elev</Text>
          </View>
        </View>
      ))}

      <Text style={[styles.section, { marginTop: 20 }]}>Ansatte ({staff.length})</Text>
      {staff.length === 0 ? (
        <Text style={styles.empty}>Ingen ansatte ennå.</Text>
      ) : staff.map((p) => (
        <TouchableOpacity key={p.uid || p.id} style={styles.row} onPress={() => canInvite && changeRole(p)}>
          <View style={styles.avatar}><Text style={styles.avatarTxt}>{(p.name || '?')[0]}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{p.name || p.email || 'Ukjent'}</Text>
            <Text style={styles.sub}>
              {p.staffRole ? staffRoleLabel(p.staffRole)
                : (classroom?.ownerUid === p.uid ? 'Rektor' : 'Ansatt')}
            </Text>
          </View>
        </TouchableOpacity>
      ))}

      {guardians.length > 0 && (
        <>
          <Text style={[styles.section, { marginTop: 20 }]}>Foresatte ({guardians.length})</Text>
          {guardians.map((p) => (
            <View key={p.id} style={styles.row}>
              <View style={styles.avatar}><Text style={styles.avatarTxt}>{(p.name || '?')[0]}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name || p.email || 'Ukjent'}</Text>
                <Text style={styles.sub}>Foresatt</Text>
              </View>
            </View>
          ))}
        </>
      )}

      <Text style={[styles.section, { marginTop: 20 }]}>
        Invitert – ikke akseptert ({invitedParents.length})
      </Text>
      {invitedParents.length === 0 ? (
        <Text style={styles.empty}>Ingen ventende invitasjoner.</Text>
      ) : invitedParents.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={[styles.avatar, styles.avatarPending]}>
            <Text style={styles.avatarTxt}>{(p.name || p.email || '?')[0]}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{p.name || p.email || 'Ukjent'}</Text>
            <Text style={styles.sub}>Invitert{p.email ? ` · ${p.email}` : ''}</Text>
          </View>
          {canInvite && (p.email || p.phone) ? (
            <TouchableOpacity style={styles.resendBtn} onPress={() => onResend(p)} disabled={!!resendBusyId}>
              {resendBusyId === p.id
                ? <ActivityIndicator color={c.brand} size="small" />
                : <Text style={styles.resendTxt}>Send</Text>}
            </TouchableOpacity>
          ) : null}
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
  inviteTitle: { color: '#fff', fontWeight: '900', fontSize: 16 },
  inviteSub: { color: 'rgba(255,255,255,0.88)', fontWeight: '600', fontSize: 12, marginTop: 2 },
  secondaryCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.surface, borderRadius: 14, paddingVertical: 12, marginBottom: 12,
    borderWidth: 1, borderColor: c.line,
  },
  secondaryTxt: { color: c.brand, fontWeight: '800' },
  hintBox: { backgroundColor: c.surface, borderRadius: 12, padding: 12, marginBottom: 10 },
  hintTxt: { color: c.muted, fontWeight: '600', fontSize: 13, lineHeight: 18 },
  banner: { borderRadius: 12, padding: 12, marginBottom: 10 },
  bannerOk: { backgroundColor: '#d1fae5' },
  bannerErr: { backgroundColor: '#fef3c7' },
  bannerTxt: { color: c.ink, fontWeight: '700', fontSize: 13 },
  section: { color: c.muted, fontWeight: '800', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: c.surface, borderRadius: 12, padding: 12, marginBottom: 8,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarPending: { backgroundColor: c.brandSoft },
  avatarTxt: { color: c.ink, fontWeight: '900' },
  name: { color: c.ink, fontWeight: '800', fontSize: 15 },
  sub: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 1 },
  resendBtn: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: c.brandSoft,
  },
  resendTxt: { color: c.brand, fontWeight: '800', fontSize: 11 },
  empty: { color: c.muted, fontWeight: '600', marginBottom: 8 },
});
