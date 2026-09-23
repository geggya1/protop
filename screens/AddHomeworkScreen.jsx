/**
 * Registrer / rediger en lekse — ikke et gjøremål.
 * Samme type felter som en oppgave (tittel, frist, vedlegg, ansvarlig),
 * men lagres som lekse og kan åpnes i leksehjelpen.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView,
  Platform, Image, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../src/context/AppContext';
import { useColors } from '../src/context/ThemeContext';
import { radius, useLayout } from '../src/theme';
import { Screen, Title, BigButton } from '../components/ui';
import DesktopFormShell from '../components/DesktopFormShell';
import ConfirmActionModal from '../components/ConfirmActionModal';
import { dateKey, parseDateKey } from '../src/utils/dates';
import { pickDocument, uploadFile } from '../src/utils/media';
import {
  HOMEWORK_SUBJECTS,
  canCreateHomework,
  deleteHomework,
  inferSubjectId,
  isHomeworkDone,
  markLegacyTodoMigrated,
  saveHomework,
} from '../src/utils/homework';
import { childFromRouteParams } from '../src/utils/childNav';
import { allowedAppsForChild, isChildAppAllowed } from '../src/utils/childApps';

export default function AddHomeworkScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const { isDesktop } = useLayout();
  const colors = useColors();
  const {
    familyId: ctxFamilyId, members, uid, isChild, isParent, isActingAsChild, isAdmin, kids,
  } = useApp();

  const familyId = route.params?.familyId || ctxFamilyId;
  const routeChild = childFromRouteParams(route.params) || route.params?.child || null;
  const child = useMemo(() => {
    const seedChild = routeChild;
    const id = seedChild?.id || seedChild?.childId;
    if (!id) return seedChild || null;
    return (kids || []).find((k) => (k.id || k.childId) === id) || seedChild;
  }, [routeChild, kids]);
  const childId = child?.id || child?.childId;
  const existing = route.params?.homework || null;
  const legacyTodo = route.params?.legacyTodo || null;
  const seed = existing || legacyTodo || null;
  const isNew = !existing?.id && !legacyTodo?.sourceTodoId;
  const homeworkId = existing?.source === 'legacy-todo' ? null : (existing?.id || null);

  const lekserAllowed = isChildAppAllowed(allowedAppsForChild(child), 'lekser');
  const canWrite = canCreateHomework({
    isParent,
    isChild,
    isActingAsChild,
    isAdmin,
    homeworkSelfEdit: child?.homeworkSelfEdit,
    lekserAllowed,
  });
  const readOnly = !canWrite;

  const [title, setTitle] = useState(seed?.title || '');
  const [description, setDescription] = useState(seed?.description || '');
  const [subject, setSubject] = useState(seed?.subject || inferSubjectId(seed?.title) || 'annet');
  const [dueDate, setDueDate] = useState(seed?.dueDate || route.params?.defaultDueKey || '');
  const [assignedTo, setAssignedTo] = useState(seed?.assignedTo || childId || null);
  const [attachments, setAttachments] = useState(Array.isArray(seed?.attachments) ? seed.attachments : []);
  const [done, setDone] = useState(seed ? isHomeworkDone(seed, dateKey(new Date())) : false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState({ visible: false, title: '', message: '' });

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const showNotice = useCallback((titleMsg, message) => {
    setNotice({ visible: true, title: titleMsg, message });
  }, []);
  const myName = useMemo(() => {
    const m = (members || []).find((x) => x.uid === uid || x.id === uid);
    return m?.name || 'Ukjent';
  }, [members, uid]);

  const childName = child?.name || (kids || []).find((k) => (k.id || k.childId) === childId)?.name || 'Barnet';

  const assigneePeople = useMemo(() => {
    const list = [];
    if (childId) {
      list.push({ id: childId, name: childName, role: 'child' });
    }
    (members || []).forEach((m) => {
      const mid = m.uid || m.id;
      if (!mid || mid === childId) return;
      if (m.role === 'child') return;
      list.push({ id: mid, name: m.name, role: 'parent' });
    });
    return list;
  }, [childId, childName, members]);

  const assigneeLabel = useMemo(() => {
    const p = assigneePeople.find((x) => x.id === assignedTo);
    return p?.name || childName;
  }, [assigneePeople, assignedTo, childName]);

  const save = useCallback(async () => {
    if (readOnly || !title.trim() || !familyId || !childId) return;
    setSaving(true);
    try {
      const person = assigneePeople.find((x) => x.id === assignedTo);
      const id = await saveHomework(familyId, childId, {
        title: title.trim(),
        description: description.trim(),
        subject: subject || inferSubjectId(title) || 'annet',
        dueDate: dueDate.trim() || null,
        assignedTo: assignedTo || childId,
        assignedToName: person?.name || null,
        attachments,
        done,
        completedDates: done ? [dateKey(new Date())] : [],
        createdBy: uid,
        source: legacyTodo ? 'migrated_todo' : (existing?.source === 'ai_import' ? 'ai_import' : 'manual'),
        sourceTodoId: legacyTodo?.sourceTodoId || existing?.sourceTodoId || null,
      }, { homeworkId });
      if (legacyTodo?.sourceTodoId) {
        await markLegacyTodoMigrated(familyId, childId, legacyTodo.sourceTodoId, id);
      }
      nav.goBack();
    } catch {
      showNotice('Feil', 'Klarte ikke lagre leksen.');
    } finally {
      setSaving(false);
    }
  }, [
    readOnly, title, familyId, childId, description, subject, dueDate, assignedTo,
    attachments, done, uid, homeworkId, legacyTodo, existing, assigneePeople, nav, showNotice,
  ]);

  // Alert.alert er no-op på web — bruk ConfirmActionModal (fungerer native + web).
  const onDelete = useCallback(() => {
    if (readOnly || !homeworkId || deleting) return;
    setConfirmDelete(true);
  }, [readOnly, homeworkId, deleting]);

  const doDelete = useCallback(async () => {
    if (readOnly || !homeworkId || deleting) return;
    setDeleting(true);
    try {
      await deleteHomework(familyId, childId, homeworkId);
      setConfirmDelete(false);
      nav.goBack();
    } catch {
      setConfirmDelete(false);
      showNotice('Feil', 'Klarte ikke slette leksen.');
    } finally {
      setDeleting(false);
    }
  }, [readOnly, homeworkId, deleting, familyId, childId, nav, showNotice]);

  const pickAttachment = useCallback(async () => {
    if (readOnly) return;
    try {
      const picked = await pickDocument();
      if (!picked) return;
      setUploading(true);
      const name = picked.name || `Vedlegg ${attachments.length + 1}`;
      const path = `families/${familyId}/homework-attachments/${childId || 'child'}-${Date.now()}-${name}`;
      const url = await uploadFile(path, picked, picked.mimeType);
      setAttachments((prev) => [...prev, {
        url,
        name,
        storagePath: path,
        contentType: picked.mimeType || null,
        addedBy: myName,
      }]);
    } catch (e) {
      showNotice('Feil', e?.message || 'Klarte ikke laste opp vedlegg.');
    } finally {
      setUploading(false);
    }
  }, [readOnly, familyId, childId, attachments.length, myName, showNotice]);

  const openHelp = useCallback(() => {
    nav.navigate('Leksehjelp', {
      child,
      familyId,
      homework: {
        id: homeworkId,
        title: title.trim() || seed?.title,
        description: description.trim() || seed?.description,
        subject,
        dueDate,
        attachments,
      },
    });
  }, [nav, child, familyId, homeworkId, title, description, subject, dueDate, attachments, seed]);

  const formTitle = isNew ? 'Ny lekse' : 'Lekse';

  const formBody = (
    <>
      {!isDesktop ? (
        <View style={styles.topRow}>
          <TouchableOpacity onPress={() => nav.goBack()} style={styles.backBtn} accessibilityLabel="Tilbake">
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <Title size={20}>{formTitle}</Title>
        </View>
      ) : null}

      <Text style={styles.intro}>
        {readOnly
          ? `Lekse for ${childName}. Marker ferdig eller åpne leksehjelpen.`
          : `Lekse for ${childName} — ikke et gjøremål. Knytt den til et fag, sett frist og åpne leksehjelpen når det trengs.`}
      </Text>

      <Text style={styles.label}>Fag</Text>
      <View style={styles.chipRow}>
        {HOMEWORK_SUBJECTS.map((s) => {
          const on = subject === s.id;
          return (
            <TouchableOpacity
              key={s.id}
              style={[styles.chip, on && styles.chipOn]}
              onPress={() => { if (!readOnly) setSubject(s.id); }}
              disabled={readOnly}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Ionicons name={s.icon} size={14} color={on ? '#fff' : colors.muted} />
              <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>{s.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>Tittel</Text>
      <TextInput
        style={[styles.input, readOnly && styles.inputReadonly]}
        value={title}
        onChangeText={(t) => {
          setTitle(t);
          if (isNew && (!subject || subject === 'annet')) {
            const guessed = inferSubjectId(t);
            if (guessed && guessed !== 'annet') setSubject(guessed);
          }
        }}
        placeholder="F.eks. Matte: oppgave 3–7"
        editable={!readOnly}
      />

      <Text style={styles.label}>Beskrivelse</Text>
      <TextInput
        style={[styles.input, styles.textArea, readOnly && styles.inputReadonly]}
        value={description}
        onChangeText={setDescription}
        placeholder="Sider, oppgaver, hva som skal leveres…"
        multiline
        textAlignVertical="top"
        editable={!readOnly}
      />

      <Text style={styles.label}>Frist</Text>
      {readOnly ? (
        <Text style={styles.readonlyValue}>{dueDate || 'Ingen frist'}</Text>
      ) : (
        <>
          <View style={styles.deadlineRow}>
            {Platform.OS === 'web' ? (
              <View style={[styles.pickerBtn, { flex: 1 }]}>
                <Ionicons name="calendar-outline" size={18} color={colors.brand} />
                <Text style={[styles.pickerBtnTxt, !dueDate && styles.pickerPlaceholder]}>
                  {dueDate || 'Velg dato'}
                </Text>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  style={styles.webPickerOverlay}
                  aria-label="Velg frist"
                />
              </View>
            ) : (
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={dueDate}
                onChangeText={setDueDate}
                placeholder="ÅÅÅÅ-MM-DD"
              />
            )}
          </View>
          {dueDate ? (
            <TouchableOpacity onPress={() => setDueDate('')}>
              <Text style={[styles.hint, { color: colors.brand }]}>Fjern frist</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.hint}>Når skal leksen være ferdig?</Text>
          )}
          {dueDate ? (() => {
            const d = parseDateKey(dueDate);
            if (!d) return null;
            const diff = Math.ceil((d - new Date()) / 86400000);
            if (diff < 0) return <Text style={[styles.hint, { color: '#b91c1c' }]}>Fristen er utløpt</Text>;
            if (diff === 0) return <Text style={[styles.hint, { color: '#f59e0b' }]}>Fristen er i dag</Text>;
            return <Text style={styles.hint}>{diff} dager igjen</Text>;
          })() : null}
        </>
      )}

      <Text style={styles.label}>Ansvarlig</Text>
      {readOnly ? (
        <Text style={styles.readonlyValue}>{assigneeLabel}</Text>
      ) : (
        <>
          <Text style={styles.hint}>Barnet som skal gjøre leksen, eller en voksen som følger opp.</Text>
          <View style={styles.chipRow}>
            {assigneePeople.map((p) => {
              const on = assignedTo === p.id;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.chip, on && styles.chipOn]}
                  onPress={() => setAssignedTo(p.id)}
                >
                  <Text style={[styles.chipTxt, on && styles.chipTxtOn]}>
                    {p.name?.split(' ')[0] || p.name}
                  </Text>
                  {on && <Ionicons name="checkmark" size={14} color="#fff" />}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      <Text style={[styles.label, { marginTop: 16 }]}>Vedlegg</Text>
      {attachments.map((att, idx) => {
        const isImage = /^image\//.test(att.contentType || '') || /\.(png|jpe?g|gif|webp)$/i.test(att.name || att.url || '');
        return (
          <View key={`att-${idx}`} style={styles.attRow}>
            {isImage && att.url ? (
              <Image source={{ uri: att.url }} style={styles.attThumb} />
            ) : (
              <View style={[styles.attThumb, styles.attFile]}>
                <Ionicons name="document-outline" size={20} color={colors.brand} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.attName}>{att.name || `Vedlegg ${idx + 1}`}</Text>
              {att.addedBy ? <Text style={styles.attBy}>{att.addedBy}</Text> : null}
            </View>
            {!readOnly && (
              <TouchableOpacity
                onPress={() => setAttachments((prev) => prev.filter((_, i) => i !== idx))}
                style={{ padding: 8 }}
                accessibilityLabel="Fjern vedlegg"
              >
                <Ionicons name="trash-outline" size={16} color="#b91c1c" />
              </TouchableOpacity>
            )}
          </View>
        );
      })}
      {readOnly && attachments.length === 0 && (
        <Text style={styles.emptyTxt}>Ingen vedlegg.</Text>
      )}
      {!readOnly && (
        uploading ? (
          <View style={styles.uploadingRow}>
            <ActivityIndicator color={colors.brand} />
            <Text style={styles.uploadingTxt}>Laster opp…</Text>
          </View>
        ) : (
          <TouchableOpacity style={styles.addAttBtn} onPress={pickAttachment}>
            <Ionicons name="attach" size={18} color={colors.brand} />
            <Text style={styles.addAttTxt}>Legg til vedlegg</Text>
          </TouchableOpacity>
        )
      )}

      {(title.trim() || seed?.title) ? (
        <TouchableOpacity style={styles.helpBtn} onPress={openHelp} activeOpacity={0.85}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.brand} />
          <Text style={styles.helpBtnTxt}>Åpne i leksehjelpen</Text>
        </TouchableOpacity>
      ) : null}

      {!isDesktop && !readOnly && (
        <BigButton
          label={isNew ? 'Lagre lekse' : 'Lagre endringer'}
          onPress={save}
          disabled={!title.trim() || saving}
        />
      )}

      {!isNew && !readOnly && homeworkId ? (
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
          <Ionicons name="trash-outline" size={18} color="#b91c1c" />
          <Text style={styles.deleteTxt}>Slett lekse</Text>
        </TouchableOpacity>
      ) : null}

      {isDesktop ? null : <View style={{ height: 40 }} />}
    </>
  );

  const confirmModals = (
    <>
      <ConfirmActionModal
        visible={confirmDelete}
        title="Slett lekse?"
        body={title.trim() ? `Vil du slette «${title.trim()}»?` : 'Vil du slette denne leksen?'}
        confirmLabel="Slett"
        cancelLabel="Avbryt"
        danger
        busy={deleting}
        onConfirm={doDelete}
        onCancel={() => { if (!deleting) setConfirmDelete(false); }}
      />
      <ConfirmActionModal
        visible={notice.visible}
        title={notice.title}
        body={notice.message}
        confirmLabel="OK"
        cancelLabel="Lukk"
        onConfirm={() => setNotice((s) => ({ ...s, visible: false }))}
        onCancel={() => setNotice((s) => ({ ...s, visible: false }))}
      />
    </>
  );

  if (isDesktop) {
    return (
      <View style={styles.desktopRoot}>
        <DesktopFormShell
          title={formTitle}
          onClose={() => nav.goBack()}
          width={560}
          footer={!readOnly ? (
            <BigButton
              label={isNew ? 'Lagre lekse' : 'Lagre endringer'}
              onPress={save}
              disabled={!title.trim() || saving}
            />
          ) : null}
        >
          {formBody}
        </DesktopFormShell>
        {confirmModals}
      </View>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {formBody}
      </ScrollView>
      {confirmModals}
    </Screen>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    desktopRoot: { flex: 1, backgroundColor: 'transparent' },
    body: { padding: 16 },
    topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    backBtn: { padding: 6, borderRadius: 10, backgroundColor: colors.sunken },
    intro: {
      fontSize: 13, fontWeight: '400', color: colors.muted, lineHeight: 18,
      marginBottom: 8, marginTop: 4,
    },
    label: { fontWeight: '600', color: colors.ink, fontSize: 13, marginBottom: 6, marginTop: 14 },
    hint: { fontSize: 12, color: '#94a3b8', marginBottom: 8, marginTop: 4 },
    input: {
      borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12,
      fontSize: 15, backgroundColor: '#fff', color: colors.ink, marginBottom: 4,
    },
    inputReadonly: { backgroundColor: colors.sunken },
    readonlyValue: {
      fontSize: 14, fontWeight: '500', color: colors.ink,
      backgroundColor: colors.sunken, borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: colors.line,
    },
    textArea: { minHeight: 100, textAlignVertical: 'top' },
    chipRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 4 },
    chip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8,
      backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line,
    },
    chipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
    chipTxt: { fontWeight: '600', color: colors.ink, fontSize: 13 },
    chipTxtOn: { color: '#fff' },
    pickerBtn: {
      position: 'relative',
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.brand,
      backgroundColor: '#fff',
    },
    pickerBtnTxt: { flex: 1, fontSize: 14, fontWeight: '500', color: colors.ink },
    pickerPlaceholder: { color: colors.muted, fontWeight: '400' },
    webPickerOverlay: {
      position: 'absolute', left: 0, top: 0, width: '100%', height: '100%',
      opacity: 0, cursor: 'pointer', border: 'none', backgroundColor: 'transparent',
    },
    deadlineRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    attRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 6,
      borderWidth: 1, borderColor: colors.line,
    },
    attThumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: '#e2e8f0' },
    attFile: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff' },
    attName: { fontWeight: '500', color: colors.ink, fontSize: 14 },
    attBy: { color: '#94a3b8', fontSize: 11 },
    addAttBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: '#eef6ff', borderRadius: 10, paddingVertical: 10, marginBottom: 12,
      borderWidth: 1, borderColor: '#93c5fd', borderStyle: 'dashed',
    },
    addAttTxt: { color: colors.brand, fontWeight: '600' },
    uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 },
    uploadingTxt: { color: colors.brand, fontWeight: '500' },
    helpBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: 8, marginBottom: 12,
      borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md,
      paddingVertical: 12, backgroundColor: '#fff',
    },
    helpBtnTxt: { color: colors.brand, fontWeight: '500', fontSize: 14 },
    emptyTxt: { color: '#94a3b8', fontSize: 13, marginBottom: 8 },
    deleteBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      marginTop: 12, paddingVertical: 12, borderRadius: 10,
      backgroundColor: '#fee2e2', borderWidth: 1, borderColor: '#fecaca',
    },
    deleteTxt: { color: '#b91c1c', fontWeight: '600', fontSize: 14 },
  });
}
