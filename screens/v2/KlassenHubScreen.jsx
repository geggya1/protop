import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Platform,
  Modal, Pressable, ScrollView,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { radius, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Screen } from '../../components/ui';
import SchoolPageLayout from '../../components/SchoolPageLayout';
import ModuleIntroHost from '../../components/ModuleIntroHost';
import LocationPicker from '../../components/LocationPicker';
import CompactBackLink from '../../components/CompactBackLink';
import ShellAddButton from '../../components/ShellAddButton';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import {
  listenKlassen,
  createKlassenClass,
  canManageKlassen,
  classDisplayTitle,
  filterKlassenForChild,
} from '../../src/utils/klassen';
import { childFromRouteParams, serialChild } from '../../src/utils/childNav';

/**
 * Skole → Klassen: oversikt over klasser + opprett (foresatt/admin).
 */
export default function KlassenHubScreen({ inShell = false, onBack = null } = {}) {
  const nav = useNavigation();
  const route = useRoute();
  const colors = useColors();
  const { pad, isDesktop } = useLayout();
  const {
    familyId: ctxFamilyId,
    user,
    activeChild,
    meChild,
    isChild,
    isParent,
    isAdmin,
    members,
    children,
  } = useApp();

  const child = childFromRouteParams(route.params)
    || (isChild ? meChild : activeChild)
    || null;
  const familyId = route.params?.familyId || ctxFamilyId;
  const canManage = canManageKlassen({ isParent, isChild, isAdmin });

  const [rows, setRows] = useState([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    schoolName: '',
    place: null,
  });

  useEffect(() => {
    if (!familyId) return undefined;
    return listenKlassen(familyId, setRows);
  }, [familyId]);

  const visible = useMemo(
    () => filterKlassenForChild(rows, child?.id),
    [rows, child?.id],
  );

  const styles = useMemo(
    () => makeStyles(colors, { pad, isDesktop }),
    [colors, pad, isDesktop],
  );

  const openClass = useCallback((klass) => {
    nav.navigate('KlassenDetail', {
      familyId,
      classId: klass.id,
      child: serialChild(child),
    });
  }, [nav, familyId, child]);

  const submitCreate = useCallback(async () => {
    if (!familyId || busy) return;
    setError('');
    setBusy(true);
    try {
      const memberIds = (members || [])
        .map((m) => m?.uid)
        .filter(Boolean);
      const childIds = child?.id
        ? [child.id]
        : (children || []).map((c) => c.id).filter(Boolean);
      const id = await createKlassenClass(familyId, {
        name: form.name,
        schoolName: form.schoolName,
        place: form.place,
        childIds,
        memberIds,
        createdBy: user?.uid,
      });
      setForm({ name: '', schoolName: '', place: null });
      setCreating(false);
      nav.navigate('KlassenDetail', {
        familyId,
        classId: id,
        child: serialChild(child),
      });
    } catch (e) {
      setError(String(e?.message || e || 'Kunne ikke opprette'));
    } finally {
      setBusy(false);
    }
  }, [familyId, busy, form, members, children, child, user?.uid, nav]);

  const handleBack = useCallback(() => {
    if (typeof onBack === 'function') onBack();
    else nav.navigate('More');
  }, [onBack, nav]);

  const addBtn = useMemo(
    () => (canManage ? (
      <ShellAddButton
        label="Ny klasse"
        onPress={() => { setCreating(true); setError(''); }}
        accessibilityLabel="Opprett klasse"
      />
    ) : null),
    [canManage],
  );
  useShellTitleRight(addBtn, { active: canManage && !creating });

  const closeCreate = useCallback(() => {
    if (busy) return;
    setCreating(false);
    setError('');
  }, [busy]);

  const createForm = (
    <>
      <Text style={styles.fieldLabel}>Klassenavn</Text>
      <TextInput
        style={styles.input}
        value={form.name}
        onChangeText={(name) => setForm((f) => ({ ...f, name }))}
        placeholder="f.eks. 7C"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.fieldLabel}>Skole</Text>
      <TextInput
        style={styles.input}
        value={form.schoolName}
        onChangeText={(schoolName) => setForm((f) => ({ ...f, schoolName }))}
        placeholder="Skolens navn"
        placeholderTextColor={colors.muted}
      />
      <Text style={styles.fieldLabel}>Finn skolen (kart)</Text>
      <LocationPicker
        value={form.place}
        onChange={(place) => setForm((f) => ({
          ...f,
          place,
          schoolName: f.schoolName || place?.label || '',
        }))}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.modalActions}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={closeCreate} disabled={busy}>
          <Text style={styles.secondaryBtnTxt}>Avbryt</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.primaryBtn, busy && styles.btnDisabled]}
          onPress={submitCreate}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color="#fff" /> : (
            <Text style={styles.primaryBtnTxt}>Lagre</Text>
          )}
        </TouchableOpacity>
      </View>
    </>
  );

  const body = (
    <>
      <ModuleIntroHost scope="family" moduleId="klassen" />
      {inShell ? (
        <CompactBackLink label="Mer" onPress={handleBack} />
      ) : null}

      <Text style={styles.lead}>
        Skole, klasseliste, lærerkontakt, foreldremøter og meldinger — samlet for klassen.
        Last opp klasselisten fra ark under Klasseliste (bilde eller fil).
      </Text>

      <Text style={styles.section}>Klasser</Text>
      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={36} color={colors.muted} />
          <Text style={styles.emptyTitle}>Ingen klasse ennå</Text>
          <Text style={styles.emptyTxt}>
            {canManage
              ? 'Opprett klassen øverst til høyre med skole og klassenavn.'
              : 'Foresatte kan opprette klassen her.'}
          </Text>
        </View>
      ) : (
        visible.map((klass) => (
          <TouchableOpacity
            key={klass.id}
            style={styles.card}
            onPress={() => openClass(klass)}
            accessibilityRole="button"
            accessibilityLabel={classDisplayTitle(klass)}
          >
            <View style={styles.cardIcon}>
              <Ionicons name="people" size={22} color={colors.brand} />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{klass.name || 'Klasse'}</Text>
              <Text style={styles.cardSub} numberOfLines={2}>
                {klass.schoolName || 'Uten skolenavn'}
                {klass.place?.label ? ` · ${klass.place.label}` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </TouchableOpacity>
        ))
      )}
    </>
  );

  const createModal = (
    <Modal
      visible={creating && canManage}
      transparent
      animationType={isDesktop ? 'fade' : 'slide'}
      onRequestClose={closeCreate}
    >
      <Pressable
        style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
        onPress={closeCreate}
      >
        <Pressable
          style={[styles.modalSheet, isDesktop && [desktopSheet, styles.modalSheetDesk]]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {!isDesktop ? <View style={styles.sheetHandle} /> : null}
            <Text style={styles.modalTitle}>Ny klasse</Text>
            {createForm}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  if (inShell) {
    return (
      <Screen>
        <View style={styles.shellPad}>{body}</View>
        {createModal}
      </Screen>
    );
  }

  return (
    <Screen>
      <SchoolPageLayout
        activeId="klassen"
        child={child}
        familyId={familyId}
        title="Klassen"
        subtitle="Klasseliste, lærere, møter og meldinger"
      >
        {body}
      </SchoolPageLayout>
      {createModal}
    </Screen>
  );
}

function makeStyles(colors, { pad, isDesktop }) {
  return StyleSheet.create({
    shellPad: { padding: pad, paddingBottom: 40, maxWidth: isDesktop ? 720 : undefined },
    lead: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.muted,
      marginBottom: 16,
    },
    section: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginTop: 8,
      marginBottom: 10,
    },
    primaryBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: colors.brand,
      borderRadius: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
    },
    primaryBtnTxt: { color: '#fff', fontWeight: '500', fontSize: 14 },
    secondaryBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.brandSoft,
      borderRadius: 10,
      paddingVertical: 10,
    },
    secondaryBtnTxt: { color: colors.brand, fontWeight: '500' },
    modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
    btnDisabled: { opacity: 0.6 },
    fieldLabel: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.text,
      marginTop: 6,
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
    error: { color: colors.danger || '#b91c1c', marginVertical: 6 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 14,
      paddingHorizontal: 12,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      backgroundColor: colors.card || colors.bg,
      marginBottom: 10,
    },
    cardIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      backgroundColor: colors.brandSoft || '#e8eefc',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardBody: { flex: 1, minWidth: 0 },
    cardTitle: { fontSize: 16, fontWeight: '500', color: colors.text },
    cardSub: { fontSize: 13, color: colors.muted, marginTop: 2 },
    empty: {
      alignItems: 'center',
      paddingVertical: 36,
      paddingHorizontal: 16,
      gap: 8,
    },
    emptyTitle: { fontSize: 17, fontWeight: '500', color: colors.text },
    emptyTxt: { fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
    modalBackdrop: {
      flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: colors.bg || '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
      padding: 16, paddingBottom: 28, maxHeight: '92%',
    },
    modalSheetDesk: {
      alignSelf: 'center', marginBottom: 0, maxWidth: 480, width: '100%',
      borderRadius: 12, padding: 18, maxHeight: '85%',
    },
    sheetHandle: {
      width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line,
      alignSelf: 'center', marginBottom: 12,
    },
    modalTitle: { fontSize: 17, fontWeight: '500', color: colors.text || colors.ink, marginBottom: 8 },
  });
}
