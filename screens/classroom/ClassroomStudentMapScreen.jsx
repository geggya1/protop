import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Modal,
  Alert, ActivityIndicator, Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { classroomColors as c } from '../../src/classroomTheme';
import {
  MAP_SECTIONS, DEFAULT_SECTION_ROLES, STAFF_ROLES,
  listenStudentMap, listenMapEntries, listenMapAudit,
  ensureStudentMap, addMapEntry, updateMapAccess, logMapAccess,
  canViewMapSection, staffRoleOf, isClassroomAdmin,
} from '../../src/utils/classroom';
import { useApp } from '../../src/context/AppContext';
import { formatThreadTime } from '../../src/utils/aiChats';

export default function ClassroomStudentMapScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { uid, family, familyId } = useApp();
  const classroomId = route.params?.classroomId || familyId;
  const studentId = route.params?.studentId;
  const studentName = route.params?.studentName || 'Elev';
  const classroom = route.params?.classroom || family;

  const [mapDoc, setMapDoc] = useState(null);
  const [entries, setEntries] = useState([]);
  const [audit, setAudit] = useState([]);
  const [staff, setStaff] = useState([]);
  const [section, setSection] = useState('journal');
  const [open, setOpen] = useState(false);
  const [aclOpen, setAclOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [acl, setAcl] = useState(null);

  useEffect(() => {
    if (!classroomId || !studentId) return undefined;
    ensureStudentMap(classroomId, studentId, studentName).catch(() => {});
    const unsubs = [
      listenStudentMap(classroomId, studentId, setMapDoc),
      listenMapEntries(classroomId, studentId, setEntries),
      listenMapAudit(classroomId, studentId, setAudit),
      onSnapshot(collection(db, 'families', classroomId, 'parents'), (snap) => {
        setStaff(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      }),
    ];
    return () => unsubs.forEach((u) => u && u());
  }, [classroomId, studentId, studentName]);

  useEffect(() => {
    if (mapDoc?.access) setAcl(mapDoc.access);
  }, [mapDoc?.id]);

  useEffect(() => {
    if (uid && classroomId && studentId) {
      logMapAccess({ classroomId, studentId, actorUid: uid, sectionId: section }).catch(() => {});
    }
  }, [classroomId, studentId, uid, section]);

  const role = staffRoleOf(classroom, uid, staff);
  const isOwner = classroom?.ownerUid === uid;
  const isAdmin = isClassroomAdmin(classroom, uid, staff);
  const canSee = canViewMapSection({
    mapDoc, sectionId: section, uid, staffRole: role, isOwner,
  });
  const canManageAcl = isOwner || (mapDoc?.rightsProtectorUids || []).includes(uid) || role === 'principal';

  const sectionEntries = useMemo(
    () => entries.filter((e) => e.sectionId === section),
    [entries, section],
  );

  const saveEntry = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await addMapEntry({
        classroomId, studentId, sectionId: section, title, body, actorUid: uid,
        actorName: staff.find((p) => (p.uid || p.id) === uid)?.name || '',
      });
      setTitle('');
      setBody('');
      setOpen(false);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre.');
    } finally {
      setBusy(false);
    }
  };

  const saveAcl = async () => {
    if (busy || !acl) return;
    setBusy(true);
    try {
      await updateMapAccess(classroomId, studentId, { access: acl, actorUid: uid });
      setAclOpen(false);
    } catch (e) {
      Alert.alert('Feil', e?.message || 'Klarte ikke lagre tilgang.');
    } finally {
      setBusy(false);
    }
  };

  const toggleRole = (sectionId, roleId) => {
    setAcl((prev) => {
      const next = { ...(prev || {}) };
      const cur = { roles: [...(next[sectionId]?.roles || [])], uids: [...(next[sectionId]?.uids || [])] };
      if (cur.roles.includes(roleId)) cur.roles = cur.roles.filter((r) => r !== roleId);
      else cur.roles.push(roleId);
      next[sectionId] = cur;
      return next;
    });
  };

  const toggleUid = (sectionId, staffUid) => {
    setAcl((prev) => {
      const next = { ...(prev || {}) };
      const cur = { roles: [...(next[sectionId]?.roles || [])], uids: [...(next[sectionId]?.uids || [])] };
      if (cur.uids.includes(staffUid)) cur.uids = cur.uids.filter((u) => u !== staffUid);
      else cur.uids.push(staffUid);
      next[sectionId] = cur;
      return next;
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.head}>
        <TouchableOpacity style={styles.back} onPress={() => nav.goBack()}>
          <Ionicons name="chevron-back" size={22} color={c.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.kicker}>Elevmappe · kun skole</Text>
          <Text style={styles.title} numberOfLines={1}>{studentName}</Text>
        </View>
        {canManageAcl && (
          <TouchableOpacity style={styles.aclBtn} onPress={() => setAclOpen(true)}>
            <Ionicons name="key-outline" size={18} color={c.brand} />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {MAP_SECTIONS.map((s) => {
          const allowed = canViewMapSection({
            mapDoc, sectionId: s.id, uid, staffRole: role, isOwner,
          });
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.tab, section === s.id && styles.tabOn, !allowed && styles.tabLock]}
              onPress={() => setSection(s.id)}
            >
              {!allowed && <Ionicons name="lock-closed" size={12} color={c.sensitive} />}
              <Text style={[styles.tabTxt, section === s.id && styles.tabTxtOn]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.body}>
        {!canSee ? (
          <View style={styles.denied}>
            <Ionicons name="lock-closed-outline" size={32} color={c.sensitive} />
            <Text style={styles.deniedTitle}>Ingen tilgang</Text>
            <Text style={styles.deniedSub}>
              Rettighetsbeskytter har ikke gitt deg innsyn i denne seksjonen.
            </Text>
          </View>
        ) : (
          <>
            {canSee && isAdmin && (
              <TouchableOpacity style={styles.cta} onPress={() => setOpen(true)}>
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.ctaTxt}>Nytt notat</Text>
              </TouchableOpacity>
            )}
            {sectionEntries.length === 0 ? (
              <Text style={styles.empty}>Ingen registreringer i denne seksjonen.</Text>
            ) : sectionEntries.map((e) => (
              <View key={e.id} style={styles.card}>
                {!!e.title && <Text style={styles.cardTitle}>{e.title}</Text>}
                <Text style={styles.cardBody}>{e.body}</Text>
                <Text style={styles.cardFoot}>
                  {e.createdByName || 'Ansatt'}
                  {e.createdAt ? ` · ${formatThreadTime(e.createdAt)}` : ''}
                  {e.sensitivity === 'restricted' ? ' · begrenset' : ''}
                </Text>
              </View>
            ))}
            {canManageAcl && audit.length > 0 && (
              <>
                <Text style={styles.auditHead}>Innsynslogg</Text>
                {audit.slice(0, 12).map((a) => (
                  <Text key={a.id} style={styles.auditLine}>
                    {a.action === 'view' ? 'Åpnet' : 'Skrevet'} {a.sectionId || ''} · {a.actorUid?.slice(0, 6)}
                    {a.at ? ` · ${formatThreadTime(a.at)}` : ''}
                  </Text>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>Notat i {MAP_SECTIONS.find((s) => s.id === section)?.label}</Text>
            <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Overskrift" />
            <TextInput
              style={[styles.input, { minHeight: 120, textAlignVertical: 'top' }]}
              value={body}
              onChangeText={setBody}
              placeholder="Innhold — sensitive opplysninger"
              multiline
            />
            <TouchableOpacity style={styles.save} onPress={saveEntry} disabled={busy}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>Lagre i mappe</Text>}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={aclOpen} transparent animationType="fade" onRequestClose={() => setAclOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setAclOpen(false)}>
          <Pressable style={[styles.sheet, { maxHeight: '90%' }]} onStartShouldSetResponder={() => true}>
            <ScrollView>
              <Text style={styles.sheetTitle}>Rettighetsbeskytter</Text>
              <Text style={styles.aclLead}>
                Velg hvilke roller og enkeltpersoner som kan se hver seksjon. Rektor ser alt som standard.
              </Text>
              {MAP_SECTIONS.map((s) => (
                <View key={s.id} style={styles.aclBlock}>
                  <Text style={styles.aclName}>{s.label}</Text>
                  <View style={styles.chips}>
                    {STAFF_ROLES.map((r) => {
                      const on = (acl?.[s.id]?.roles || DEFAULT_SECTION_ROLES[s.id] || []).includes(r.id);
                      return (
                        <TouchableOpacity
                          key={r.id}
                          style={[styles.chip, on && styles.chipOn]}
                          onPress={() => toggleRole(s.id, r.id)}
                        >
                          <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{r.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {staff.filter((p) => p.staffRole && p.active !== false).map((p) => {
                    const id = p.uid || p.id;
                    const on = (acl?.[s.id]?.uids || []).includes(id);
                    return (
                      <TouchableOpacity key={id} style={styles.pick} onPress={() => toggleUid(s.id, id)}>
                        <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? c.brand : c.muted} />
                        <Text style={styles.pickTxt}>{p.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
              <TouchableOpacity style={styles.save} onPress={saveAcl} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveTxt}>Lagre tilgang</Text>}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: c.bg },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, paddingBottom: 8 },
  back: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface,
    borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center',
  },
  kicker: { fontSize: 11, fontWeight: '800', color: c.sensitive, letterSpacing: 0.6, textTransform: 'uppercase' },
  title: { fontSize: 20, fontWeight: '900', color: c.ink },
  aclBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: c.brandSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  tabs: { paddingHorizontal: 12, gap: 8, paddingBottom: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999,
    backgroundColor: c.surface, borderWidth: 1, borderColor: c.line,
  },
  tabOn: { backgroundColor: c.brandSoft, borderColor: c.brand },
  tabLock: { opacity: 0.7 },
  tabTxt: { color: c.muted, fontWeight: '800', fontSize: 12 },
  tabTxtOn: { color: c.brand },
  body: { padding: 16, paddingBottom: 40 },
  denied: { alignItems: 'center', padding: 28, gap: 8 },
  deniedTitle: { color: c.ink, fontWeight: '900', fontSize: 18 },
  deniedSub: { color: c.muted, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: c.brand, borderRadius: 14, paddingVertical: 12, marginBottom: 14,
  },
  ctaTxt: { color: '#fff', fontWeight: '900' },
  empty: { color: c.muted, fontWeight: '600' },
  card: {
    backgroundColor: c.surface, borderRadius: 16, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: c.line,
  },
  cardTitle: { color: c.ink, fontWeight: '900', fontSize: 16 },
  cardBody: { color: c.ink, fontWeight: '600', marginTop: 6, lineHeight: 20 },
  cardFoot: { color: c.muted, fontWeight: '600', fontSize: 12, marginTop: 8 },
  auditHead: { marginTop: 18, color: c.ink, fontWeight: '800', fontSize: 13, marginBottom: 6 },
  auditLine: { color: c.muted, fontWeight: '600', fontSize: 11, marginBottom: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(26,39,68,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 20, paddingBottom: 28,
  },
  sheetTitle: { fontSize: 20, fontWeight: '900', color: c.ink, marginBottom: 10 },
  input: {
    backgroundColor: c.bg, borderRadius: 14, padding: 12, color: c.ink, fontWeight: '700',
    borderWidth: 1, borderColor: c.line, marginBottom: 10,
  },
  save: { backgroundColor: c.brand, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 8, marginBottom: 12 },
  saveTxt: { color: '#fff', fontWeight: '900' },
  aclLead: { color: c.muted, fontWeight: '600', fontSize: 13, lineHeight: 19, marginBottom: 12 },
  aclBlock: { marginBottom: 14 },
  aclName: { color: c.ink, fontWeight: '800', marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999,
    backgroundColor: c.bg, borderWidth: 1, borderColor: c.line,
  },
  chipOn: { backgroundColor: c.brandSoft, borderColor: c.brand },
  chipTxt: { color: c.muted, fontWeight: '800', fontSize: 11 },
  chipTxtOn: { color: c.brand },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  pickTxt: { color: c.ink, fontWeight: '700', fontSize: 13 },
});
