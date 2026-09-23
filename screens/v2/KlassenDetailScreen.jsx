import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator,
  Alert, Linking, Platform, ScrollView, Modal, Pressable,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { radius, useLayout } from '../../src/theme';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import LocationPicker from '../../components/LocationPicker';
import { mapsEmbed, openGoogleMaps } from '../../src/utils/location';
import { ensureChatDoc } from '../../src/utils/chats';
import {
  listenKlassenClass,
  listenKlassenContacts,
  listenKlassenMeetings,
  updateKlassenClass,
  deleteKlassenClass,
  addKlassenContact,
  deleteKlassenContact,
  addKlassenMeeting,
  updateKlassenMeeting,
  deleteKlassenMeeting,
  uploadKlassenMeetingFile,
  pickDocument,
  canManageKlassen,
  classDisplayTitle,
  klassenChatId,
  CONTACT_KINDS,
  CONTACT_KIND_LABELS,
} from '../../src/utils/klassen';
import {
  pickClassListImage,
  pickClassListFile,
  prepareClassListUpload,
  askClassListOcr,
  importKlassenContacts,
} from '../../src/utils/klassenImport';
import { childFromRouteParams, serialChild } from '../../src/utils/childNav';

const TABS = [
  { id: 'overview', label: 'Oversikt', icon: 'home-outline' },
  { id: 'list', label: 'Klasseliste', icon: 'list-outline' },
  { id: 'teachers', label: 'Lærere', icon: 'school-outline' },
  { id: 'meetings', label: 'Møter', icon: 'document-text-outline' },
  { id: 'messages', label: 'Meldinger', icon: 'chatbubbles-outline' },
];

function showAlert(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function confirmAction(title, message, onYes) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Avbryt', style: 'cancel' },
    { text: 'Slett', style: 'destructive', onPress: onYes },
  ]);
}

/**
 * Detalj for én klasse: klasseliste, lærere, foreldremøter, meldinger.
 */
export default function KlassenDetailScreen() {
  const nav = useNavigation();
  const route = useRoute();
  const colors = useColors();
  const { pad, isDesktop } = useLayout();
  const {
    familyId: ctxFamilyId,
    user,
    isChild,
    isParent,
    isAdmin,
    members,
  } = useApp();

  const familyId = route.params?.familyId || ctxFamilyId;
  const classId = route.params?.classId;
  const child = childFromRouteParams(route.params);
  const canManage = canManageKlassen({ isParent, isChild, isAdmin });

  const [tab, setTab] = useState('overview');
  const [klass, setKlass] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const [editForm, setEditForm] = useState(null);
  const [contactForm, setContactForm] = useState({
    kind: CONTACT_KINDS.student,
    name: '',
    phone: '',
    email: '',
    roleTitle: '',
    linkedStudentName: '',
  });
  const [meetingForm, setMeetingForm] = useState({
    title: 'Foreldremøte',
    dateKey: '',
    notes: '',
  });
  const [importPreview, setImportPreview] = useState(null);
  const [importSelected, setImportSelected] = useState({});

  useEffect(() => {
    if (!familyId || !classId) return undefined;
    return listenKlassenClass(familyId, classId, setKlass);
  }, [familyId, classId]);

  useEffect(() => {
    if (!familyId || !classId) return undefined;
    return listenKlassenContacts(familyId, classId, setContacts);
  }, [familyId, classId]);

  useEffect(() => {
    if (!familyId || !classId) return undefined;
    return listenKlassenMeetings(familyId, classId, setMeetings);
  }, [familyId, classId]);

  useEffect(() => {
    if (!klass) return;
    setEditForm({
      name: klass.name || '',
      schoolName: klass.schoolName || '',
      place: klass.place || null,
    });
  }, [klass?.id, klass?.name, klass?.schoolName, klass?.place?.label]);

  const styles = useMemo(
    () => makeStyles(colors, { pad, isDesktop }),
    [colors, pad, isDesktop],
  );

  const students = useMemo(
    () => contacts.filter((c) => c.kind === CONTACT_KINDS.student),
    [contacts],
  );
  const guardians = useMemo(
    () => contacts.filter((c) => c.kind === CONTACT_KINDS.guardian),
    [contacts],
  );
  const teachers = useMemo(
    () => contacts.filter((c) => c.kind === CONTACT_KINDS.teacher),
    [contacts],
  );

  const goBack = useCallback(() => {
    nav.navigate('Klassen', {
      familyId,
      child: serialChild(child),
    });
  }, [nav, familyId, child]);

  const saveOverview = useCallback(async () => {
    if (!canManage || !editForm) return;
    setBusy('save');
    setError('');
    try {
      await updateKlassenClass(familyId, classId, {
        name: editForm.name,
        schoolName: editForm.schoolName,
        place: editForm.place,
      });
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy('');
    }
  }, [canManage, editForm, familyId, classId]);

  const removeClass = useCallback(() => {
    if (!canManage) return;
    confirmAction('Slett klasse', 'Klassen skjules for familien. Fortsette?', async () => {
      setBusy('delete');
      try {
        await deleteKlassenClass(familyId, classId);
        goBack();
      } catch (e) {
        showAlert('Feil', String(e?.message || e));
      } finally {
        setBusy('');
      }
    });
  }, [canManage, familyId, classId, goBack]);

  const addContact = useCallback(async (kindOverride) => {
    if (!canManage) return;
    setBusy('contact');
    setError('');
    try {
      await addKlassenContact(familyId, classId, {
        ...contactForm,
        kind: kindOverride || contactForm.kind,
        createdBy: user?.uid,
      });
      setContactForm({
        kind: kindOverride || contactForm.kind,
        name: '',
        phone: '',
        email: '',
        roleTitle: '',
        linkedStudentName: '',
      });
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy('');
    }
  }, [canManage, familyId, classId, contactForm, user?.uid]);

  const runClassListImport = useCallback(async ({ camera = false, file = false } = {}) => {
    if (!canManage || !familyId || !user?.uid) return;
    setError('');
    setBusy('import');
    try {
      const picked = file
        ? await pickClassListFile()
        : await pickClassListImage({ camera });
      if (!picked?.blob && !picked?.uri) {
        setBusy('');
        return;
      }
      let blob = picked.blob;
      if (!blob && picked.uri) {
        const res = await fetch(picked.uri);
        blob = await res.blob();
      }
      if (!blob) throw new Error('Kunne ikke lese filen.');
      const prepared = await prepareClassListUpload(familyId, user.uid, blob, {
        mimeType: picked.mimeType,
        fileName: picked.name,
      });
      const result = await askClassListOcr({
        familyId,
        storagePath: prepared.storagePath,
        imageBase64: prepared.imageBase64,
        hint: klass?.name ? `Klasse ${klass.name}` : '',
      });
      const contactsFound = Array.isArray(result?.contacts) ? result.contacts : [];
      if (!contactsFound.length) {
        throw new Error('Fant ingen navn. Prøv et skarpere bilde av listen.');
      }
      const selected = {};
      contactsFound.forEach((_, i) => { selected[i] = true; });
      setImportSelected(selected);
      setImportPreview(result);
    } catch (e) {
      setError(String(e?.message || e || 'Import feilet'));
    } finally {
      setBusy('');
    }
  }, [canManage, familyId, user?.uid, klass?.name]);

  const confirmClassListImport = useCallback(async () => {
    if (!importPreview?.contacts?.length || !canManage) return;
    setBusy('import-save');
    setError('');
    try {
      const rows = importPreview.contacts.filter((_, i) => importSelected[i]);
      const n = await importKlassenContacts(familyId, classId, rows, user?.uid);
      if (importPreview.className || importPreview.schoolName) {
        await updateKlassenClass(familyId, classId, {
          name: importPreview.className || klass?.name,
          schoolName: importPreview.schoolName || klass?.schoolName,
          place: klass?.place,
        });
      }
      setImportPreview(null);
      setImportSelected({});
      showAlert('Importert', `${n} kontakt${n === 1 ? '' : 'er'} lagt til.`);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy('');
    }
  }, [
    importPreview, importSelected, canManage, familyId, classId, user?.uid,
    klass?.name, klass?.schoolName, klass?.place,
  ]);

  const removeContact = useCallback((contact) => {
    if (!canManage) return;
    confirmAction('Fjern kontakt', `Fjerne ${contact.name}?`, async () => {
      try {
        await deleteKlassenContact(familyId, classId, contact.id);
      } catch (e) {
        showAlert('Feil', String(e?.message || e));
      }
    });
  }, [canManage, familyId, classId]);

  const createMeeting = useCallback(async () => {
    if (!canManage) return;
    setBusy('meeting');
    setError('');
    try {
      await addKlassenMeeting(familyId, classId, {
        title: meetingForm.title,
        dateKey: meetingForm.dateKey || null,
        notes: meetingForm.notes,
        createdBy: user?.uid,
      });
      setMeetingForm({ title: 'Foreldremøte', dateKey: '', notes: '' });
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy('');
    }
  }, [canManage, familyId, classId, meetingForm, user?.uid]);

  const uploadToMeeting = useCallback(async (meeting) => {
    if (!canManage) return;
    setBusy(`file-${meeting.id}`);
    try {
      const pickedList = await pickDocument({ multiple: false });
      const picked = Array.isArray(pickedList) ? pickedList[0] : pickedList;
      if (!picked) return;
      const file = await uploadKlassenMeetingFile({
        familyId,
        classId,
        meetingId: meeting.id,
        picked,
        uploadedBy: user?.uid,
      });
      await updateKlassenMeeting(familyId, classId, meeting.id, {
        files: [...(meeting.files || []), file],
      });
    } catch (e) {
      showAlert('Opplasting feilet', String(e?.message || e));
    } finally {
      setBusy('');
    }
  }, [canManage, familyId, classId, user?.uid]);

  const openMessages = useCallback(async () => {
    if (!familyId || !classId) return;
    const chatId = klass?.chatId || klassenChatId(classId);
    const memberIds = (klass?.memberIds?.length
      ? klass.memberIds
      : (members || []).map((m) => m?.uid).filter(Boolean));
    try {
      await ensureChatDoc(familyId, chatId, {
        type: 'group',
        title: `Klassen ${klass?.name || ''}`.trim(),
        memberIds,
      });
    } catch {
      // fortsatt åpne tråden
    }
    nav.navigate('ChatThread', {
      familyId,
      chatId,
      title: `Klassen ${klass?.name || ''}`.trim() || 'Klassen',
      memberIds,
    });
  }, [familyId, classId, klass, members, nav]);

  const openFile = useCallback((file) => {
    if (!file?.downloadUrl) return;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(file.downloadUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    Linking.openURL(file.downloadUrl).catch(() => {});
  }, []);

  if (!classId) {
    return (
      <Screen>
        <View style={styles.pad}>
          <CompactBackLink label="Klassen" onPress={goBack} />
          <Text style={styles.error}>Mangler klasse.</Text>
        </View>
      </Screen>
    );
  }

  const renderContactRow = (c) => (
    <View key={c.id} style={styles.row}>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{c.name}</Text>
        <Text style={styles.rowMeta}>
          {CONTACT_KIND_LABELS[c.kind] || c.kind}
          {c.roleTitle ? ` · ${c.roleTitle}` : ''}
          {c.linkedStudentName ? ` · elev: ${c.linkedStudentName}` : ''}
        </Text>
        {c.phone ? <Text style={styles.rowContact}>{c.phone}</Text> : null}
        {c.email ? <Text style={styles.rowContact}>{c.email}</Text> : null}
      </View>
      {canManage ? (
        <TouchableOpacity onPress={() => removeContact(c)} hitSlop={8}>
          <Ionicons name="trash-outline" size={18} color={colors.muted} />
        </TouchableOpacity>
      ) : null}
    </View>
  );

  const contactFormBlock = (defaultKind) => (
    <View style={styles.formBox}>
      <Text style={styles.fieldLabel}>Navn</Text>
      <TextInput
        style={styles.input}
        value={contactForm.name}
        onChangeText={(name) => setContactForm((f) => ({ ...f, name, kind: defaultKind }))}
        placeholder="Navn"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.fieldLabel}>Telefon</Text>
      <TextInput
        style={styles.input}
        value={contactForm.phone}
        onChangeText={(phone) => setContactForm((f) => ({ ...f, phone }))}
        placeholder="Telefonnummer"
        keyboardType="phone-pad"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.fieldLabel}>E-post</Text>
      <TextInput
        style={styles.input}
        value={contactForm.email}
        onChangeText={(email) => setContactForm((f) => ({ ...f, email }))}
        placeholder="valgfritt"
        keyboardType="email-address"
        autoCapitalize="none"
        placeholderTextColor={colors.muted}
      />
      {defaultKind === CONTACT_KINDS.teacher ? (
        <>
          <Text style={styles.fieldLabel}>Rolle</Text>
          <TextInput
            style={styles.input}
            value={contactForm.roleTitle}
            onChangeText={(roleTitle) => setContactForm((f) => ({ ...f, roleTitle }))}
            placeholder="f.eks. Kontaktlærer"
            placeholderTextColor={colors.muted}
          />
        </>
      ) : null}
      {defaultKind === CONTACT_KINDS.guardian ? (
        <>
          <Text style={styles.fieldLabel}>Barn (elev)</Text>
          <TextInput
            style={styles.input}
            value={contactForm.linkedStudentName}
            onChangeText={(linkedStudentName) => setContactForm((f) => ({ ...f, linkedStudentName }))}
            placeholder="Elevens navn"
            placeholderTextColor={colors.muted}
          />
        </>
      ) : null}
      <TouchableOpacity
        style={styles.primaryBtn}
        onPress={() => addContact(defaultKind)}
        disabled={busy === 'contact'}
      >
        {busy === 'contact' ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.primaryBtnTxt}>Legg til</Text>
        )}
      </TouchableOpacity>
    </View>
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.pad} keyboardShouldPersistTaps="handled">
        <CompactBackLink label="Klassen" onPress={goBack} />
        <Text style={styles.h1}>{classDisplayTitle(klass) || 'Klasse'}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setTab(t.id)}
              >
                <Ionicons
                  name={t.icon}
                  size={16}
                  color={active ? colors.brand : colors.muted}
                />
                <Text style={[styles.tabTxt, active && styles.tabTxtActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {tab === 'overview' && editForm ? (
          <View style={styles.block}>
            {canManage ? (
              <>
                <Text style={styles.fieldLabel}>Klassenavn</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.name}
                  onChangeText={(name) => setEditForm((f) => ({ ...f, name }))}
                />
                <Text style={styles.fieldLabel}>Skole</Text>
                <TextInput
                  style={styles.input}
                  value={editForm.schoolName}
                  onChangeText={(schoolName) => setEditForm((f) => ({ ...f, schoolName }))}
                />
                <Text style={styles.fieldLabel}>Skole på kart</Text>
                <LocationPicker
                  value={editForm.place}
                  onChange={(place) => setEditForm((f) => ({
                    ...f,
                    place,
                    schoolName: f.schoolName || place?.label || '',
                  }))}
                />
                <TouchableOpacity style={styles.primaryBtn} onPress={saveOverview} disabled={busy === 'save'}>
                  {busy === 'save' ? <ActivityIndicator color="#fff" /> : (
                    <Text style={styles.primaryBtnTxt}>Lagre</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity style={styles.dangerBtn} onPress={removeClass}>
                  <Text style={styles.dangerBtnTxt}>Slett klasse</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.rowTitle}>{klass?.name}</Text>
                <Text style={styles.rowMeta}>{klass?.schoolName}</Text>
                {klass?.place?.label ? (
                  <Text style={styles.rowContact}>{klass.place.label}</Text>
                ) : null}
              </>
            )}
            {klass?.place ? (
              <TouchableOpacity style={styles.mapLink} onPress={() => openGoogleMaps(klass.place)}>
                <Ionicons name="map-outline" size={18} color={colors.brand} />
                <Text style={styles.mapLinkTxt}>Åpne i Google Maps</Text>
              </TouchableOpacity>
            ) : null}
            {Platform.OS === 'web' && klass?.place && mapsEmbed(klass.place) ? (
              <View style={styles.mapFrame}>
                {/* eslint-disable-next-line jsx-a11y/iframe-has-title */}
                <iframe
                  title="Kart"
                  src={mapsEmbed(klass.place)}
                  style={{ border: 0, width: '100%', height: 220, borderRadius: 12 }}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === 'list' ? (
          <View style={styles.block}>
            {canManage ? (
              <View style={styles.importCard}>
                <View style={styles.importHead}>
                  <Ionicons name="scan-outline" size={22} color={colors.brand} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.importTitle}>Last opp og tolk klasseliste</Text>
                    <Text style={styles.importBlurb}>
                      Ta bilde eller last opp arket fra skolen — AI finner elever, foresatte og lærere.
                    </Text>
                  </View>
                </View>
                <View style={styles.importActions}>
                  <TouchableOpacity
                    style={styles.importBtn}
                    onPress={() => runClassListImport({ camera: true })}
                    disabled={!!busy}
                  >
                    {busy === 'import' ? (
                      <ActivityIndicator color={colors.brand} />
                    ) : (
                      <>
                        <Ionicons name="camera-outline" size={18} color={colors.brand} />
                        <Text style={styles.importBtnTxt}>Ta bilde</Text>
                      </>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.importBtn}
                    onPress={() => runClassListImport({ file: true })}
                    disabled={!!busy}
                  >
                    <Ionicons name="document-outline" size={18} color={colors.brand} />
                    <Text style={styles.importBtnTxt}>Last opp fil</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.importBtn}
                    onPress={() => runClassListImport({ camera: false })}
                    disabled={!!busy}
                  >
                    <Ionicons name="image-outline" size={18} color={colors.brand} />
                    <Text style={styles.importBtnTxt}>Velg bilde</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            <Text style={styles.section}>Elever</Text>
            {students.map(renderContactRow)}
            {!students.length ? <Text style={styles.muted}>Ingen elever registrert.</Text> : null}
            {canManage ? (
              <>
                <Text style={styles.section}>Legg til elev</Text>
                {contactFormBlock(CONTACT_KINDS.student)}
              </>
            ) : null}

            <Text style={styles.section}>Foresatte</Text>
            {guardians.map(renderContactRow)}
            {!guardians.length ? <Text style={styles.muted}>Ingen foresatte registrert.</Text> : null}
            {canManage ? (
              <>
                <Text style={styles.section}>Legg til foresatt</Text>
                {contactFormBlock(CONTACT_KINDS.guardian)}
              </>
            ) : null}
          </View>
        ) : null}

        {tab === 'teachers' ? (
          <View style={styles.block}>
            <Text style={styles.section}>Lærerkontakter</Text>
            {teachers.map(renderContactRow)}
            {!teachers.length ? <Text style={styles.muted}>Ingen lærere ennå.</Text> : null}
            {canManage ? (
              <>
                <Text style={styles.section}>Legg til lærer</Text>
                {contactFormBlock(CONTACT_KINDS.teacher)}
              </>
            ) : null}
          </View>
        ) : null}

        {tab === 'meetings' ? (
          <View style={styles.block}>
            <Text style={styles.section}>Foreldremøter / referat</Text>
            {meetings.map((m) => (
              <View key={m.id} style={styles.meetingCard}>
                <View style={styles.row}>
                  <View style={styles.rowBody}>
                    <Text style={styles.rowTitle}>{m.title}</Text>
                    {m.dateKey ? <Text style={styles.rowMeta}>{m.dateKey}</Text> : null}
                    {m.notes ? <Text style={styles.rowContact}>{m.notes}</Text> : null}
                  </View>
                  {canManage ? (
                    <TouchableOpacity
                      onPress={() => confirmAction('Slett', 'Slette møtet?', () => deleteKlassenMeeting(familyId, classId, m.id))}
                      hitSlop={8}
                    >
                      <Ionicons name="trash-outline" size={18} color={colors.muted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {(m.files || []).map((f, idx) => (
                  <TouchableOpacity key={`${f.storagePath || idx}`} style={styles.fileRow} onPress={() => openFile(f)}>
                    <Ionicons name="attach-outline" size={16} color={colors.brand} />
                    <Text style={styles.fileTxt} numberOfLines={1}>{f.name || 'Fil'}</Text>
                  </TouchableOpacity>
                ))}
                {canManage ? (
                  <TouchableOpacity
                    style={styles.secondaryBtn}
                    onPress={() => uploadToMeeting(m)}
                    disabled={busy === `file-${m.id}`}
                  >
                    {busy === `file-${m.id}` ? (
                      <ActivityIndicator color={colors.brand} />
                    ) : (
                      <>
                        <Ionicons name="cloud-upload-outline" size={18} color={colors.brand} />
                        <Text style={styles.secondaryBtnTxt}>Last opp referat</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}
            {!meetings.length ? <Text style={styles.muted}>Ingen møter ennå.</Text> : null}

            {canManage ? (
              <View style={styles.formBox}>
                <Text style={styles.section}>Nytt møte</Text>
                <Text style={styles.fieldLabel}>Tittel</Text>
                <TextInput
                  style={styles.input}
                  value={meetingForm.title}
                  onChangeText={(title) => setMeetingForm((f) => ({ ...f, title }))}
                />
                <Text style={styles.fieldLabel}>Dato (YYYY-MM-DD)</Text>
                <TextInput
                  style={styles.input}
                  value={meetingForm.dateKey}
                  onChangeText={(dateKey) => setMeetingForm((f) => ({ ...f, dateKey }))}
                  placeholder="2026-09-10"
                  placeholderTextColor={colors.muted}
                />
                <Text style={styles.fieldLabel}>Notater</Text>
                <TextInput
                  style={[styles.input, styles.inputMulti]}
                  value={meetingForm.notes}
                  onChangeText={(notes) => setMeetingForm((f) => ({ ...f, notes }))}
                  multiline
                  placeholder="Kort referat / agenda"
                  placeholderTextColor={colors.muted}
                />
                <TouchableOpacity style={styles.primaryBtn} onPress={createMeeting} disabled={busy === 'meeting'}>
                  {busy === 'meeting' ? <ActivityIndicator color="#fff" /> : (
                    <Text style={styles.primaryBtnTxt}>Opprett møte</Text>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {tab === 'messages' ? (
          <View style={styles.block}>
            <Text style={styles.lead}>
              Meldinger til og fra lærere og foresatte i klassen. Åpner en egen chat-tråd for klassen.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={openMessages}>
              <Ionicons name="chatbubbles" size={20} color="#fff" />
              <Text style={styles.primaryBtnTxt}>Åpne klassemeldinger</Text>
            </TouchableOpacity>
            {teachers.length ? (
              <>
                <Text style={styles.section}>Lærerkontakter</Text>
                {teachers.map((t) => (
                  <View key={t.id} style={styles.row}>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle}>{t.name}</Text>
                      {t.phone ? (
                        <TouchableOpacity onPress={() => Linking.openURL(`tel:${t.phone}`)}>
                          <Text style={styles.link}>{t.phone}</Text>
                        </TouchableOpacity>
                      ) : null}
                      {t.email ? (
                        <TouchableOpacity onPress={() => Linking.openURL(`mailto:${t.email}`)}>
                          <Text style={styles.link}>{t.email}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                ))}
              </>
            ) : null}
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={!!importPreview}
        transparent
        animationType="fade"
        onRequestClose={() => setImportPreview(null)}
      >
        <Pressable style={styles.modalBg} onPress={() => setImportPreview(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation?.()}>
            <Text style={styles.modalTitle}>Forslag fra klasselisten</Text>
            <Text style={styles.modalBody}>
              {importPreview?.summary
                || `Fant ${importPreview?.contacts?.length || 0} kontakter. Huk av dem du vil importere.`}
            </Text>
            <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
              {(importPreview?.contacts || []).map((c, i) => {
                const on = !!importSelected[i];
                return (
                  <TouchableOpacity
                    key={`${c.kind}-${c.name}-${i}`}
                    style={[styles.importRow, on && styles.importRowOn]}
                    onPress={() => setImportSelected((s) => ({ ...s, [i]: !s[i] }))}
                  >
                    <Ionicons
                      name={on ? 'checkbox' : 'square-outline'}
                      size={20}
                      color={on ? colors.brand : colors.muted}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{c.name}</Text>
                      <Text style={styles.rowMeta}>
                        {CONTACT_KIND_LABELS[c.kind] || c.kind}
                        {c.phone ? ` · ${c.phone}` : ''}
                        {c.linkedStudentName ? ` · elev: ${c.linkedStudentName}` : ''}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={confirmClassListImport}
              disabled={busy === 'import-save'}
            >
              {busy === 'import-save' ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnTxt}>Importer valgte</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, { marginTop: 10 }]}
              onPress={() => setImportPreview(null)}
            >
              <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

function makeStyles(colors, { pad, isDesktop }) {
  return StyleSheet.create({
    pad: {
      padding: pad,
      paddingBottom: 48,
      maxWidth: isDesktop ? 760 : undefined,
      width: '100%',
      alignSelf: 'center',
    },
    h1: {
      fontSize: 24,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 12,
    },
    lead: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
      marginBottom: 14,
    },
    tabs: { marginBottom: 16, flexGrow: 0 },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      marginRight: 8,
      backgroundColor: colors.card || colors.bg,
    },
    tabActive: {
      borderColor: colors.brand,
      backgroundColor: colors.brandSoft || '#e8eefc',
    },
    tabTxt: { fontSize: 13, fontWeight: '600', color: colors.muted },
    tabTxtActive: { color: colors.brand },
    block: { gap: 4 },
    section: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginTop: 16,
      marginBottom: 8,
    },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      marginTop: 8,
      marginBottom: 4,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 12 : 10,
      fontSize: 16,
      color: colors.text,
      backgroundColor: colors.bg,
      marginBottom: 4,
    },
    inputMulti: { minHeight: 80, textAlignVertical: 'top' },
    primaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      backgroundColor: colors.brand,
      borderRadius: 10,
      paddingVertical: 9,
      paddingHorizontal: 14,
      marginTop: 10,
    },
    primaryBtnTxt: { color: '#fff', fontWeight: '500', fontSize: 14 },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      borderWidth: 1,
      borderColor: colors.line,
      borderRadius: 10,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginTop: 8,
    },
    secondaryBtnTxt: { color: colors.brand, fontWeight: '500' },
    dangerBtn: {
      alignItems: 'center',
      paddingVertical: 12,
      marginTop: 8,
    },
    dangerBtnTxt: { color: colors.danger || '#b91c1c', fontWeight: '600' },
    formBox: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: 12,
      marginTop: 8,
      marginBottom: 8,
      backgroundColor: colors.card || colors.bg,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowBody: { flex: 1, minWidth: 0 },
    rowTitle: { fontSize: 16, fontWeight: '500', color: colors.text },
    rowMeta: { fontSize: 13, color: colors.muted, marginTop: 2 },
    rowContact: { fontSize: 14, color: colors.text, marginTop: 2 },
    muted: { color: colors.muted, fontSize: 14, marginBottom: 8 },
    error: { color: colors.danger || '#b91c1c', marginBottom: 8 },
    meetingCard: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: radius.lg,
      padding: 12,
      marginBottom: 10,
      backgroundColor: colors.card || colors.bg,
    },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 6,
    },
    fileTxt: { color: colors.brand, flex: 1, fontSize: 14 },
    mapLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
    },
    mapLinkTxt: { color: colors.brand, fontWeight: '600' },
    mapFrame: { marginTop: 12, overflow: 'hidden', borderRadius: 12 },
    link: { color: colors.brand, marginTop: 2 },
    importCard: {
      borderWidth: 1,
      borderColor: colors.brand,
      backgroundColor: colors.brandSoft || '#eef4ff',
      borderRadius: radius.lg,
      padding: 14,
      marginBottom: 16,
      gap: 12,
    },
    importHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    importTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
    importBlurb: { fontSize: 13, color: colors.muted, marginTop: 4, lineHeight: 18 },
    importActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    importBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: '#fff',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.line,
      paddingVertical: 8,
      paddingHorizontal: 12,
    },
    importBtnTxt: { color: colors.brand, fontWeight: '600', fontSize: 13 },
    modalBg: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.45)',
      justifyContent: 'center',
      padding: 20,
    },
    modalCard: {
      backgroundColor: colors.bg || '#fff',
      borderRadius: 16,
      padding: 18,
      maxHeight: '85%',
    },
    modalTitle: { fontSize: 18, fontWeight: '600', color: colors.text, marginBottom: 6 },
    modalBody: { fontSize: 14, color: colors.muted, lineHeight: 20, marginBottom: 12 },
    modalList: { maxHeight: 320, marginBottom: 8 },
    importRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRadius: 10,
      marginBottom: 4,
    },
    importRowOn: { backgroundColor: colors.brandSoft || '#eef4ff' },
  });
}
