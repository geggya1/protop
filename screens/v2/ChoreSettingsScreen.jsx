// Innstillinger for barnets gjøremål/belønning — kun foresatte (og admin via foresatt-rolle).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection, doc, getDoc, getDocs, setDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { colors } from '../../src/theme';
import { Screen, Loader } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import ConfirmDialog, { InfoDialog } from '../../components/ConfirmDialog';
import AiImportChildPicker from '../../components/AiImportChildPicker';
import { makeSeriesKey } from '../../src/utils/dates';
import {
  selectChoresToCopy, buildCopiedTodoPayload,
} from '../../src/utils/todoCopy';
import {
  normalizeRewardMode,
  rewardModeChipLabel,
  rewardModeHint,
  showsBudget,
} from '../../src/utils/rewardModes';

const BUDGET_PERIODS = [
  { v: 'day', l: 'Dag' },
  { v: 'week', l: 'Uke' },
  { v: 'month', l: 'Måned' },
];

const MODE_OPTIONS = ['none', 'money', 'points'];

function Row({ label, children, hint, style }) {
  return (
    <View style={[styles.row, style]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <View style={styles.rowRight}>{children}</View>
    </View>
  );
}

export default function ChoreSettingsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { familyId, child } = route.params || {};
  const childId = child?.id || child?.childId;
  const { isParent, isChild, kids } = useApp();
  const canManage = isParent && !isChild;

  const [name, setName] = useState(child?.name || '');
  const [rewardMode, setRewardMode] = useState('points');
  const [budget, setBudget] = useState('100');
  const [budgetPeriod, setBudgetPeriod] = useState('week');
  const [rewardWeekStart] = useState(1);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState(null);
  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [infoDialog, setInfoDialog] = useState({ visible: false, title: '', message: '', onClose: null });
  const [childPickerOpen, setChildPickerOpen] = useState(false);
  const [importFromChild, setImportFromChild] = useState(null);
  const [importConfirmOpen, setImportConfirmOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const childDocRef = useMemo(
    () => (familyId && childId ? doc(db, 'families', familyId, 'children', childId) : null),
    [familyId, childId],
  );

  const snapshot = useCallback((form) => ({
    rewardMode: normalizeRewardMode(form.rewardMode || 'points'),
    budget: String(Math.max(0, Number(form.budget) || 0)),
    budgetPeriod: form.budgetPeriod || 'week',
  }), []);

  const currentForm = useMemo(
    () => ({ rewardMode, budget, budgetPeriod }),
    [rewardMode, budget, budgetPeriod],
  );

  const isDirty = useMemo(() => {
    if (!baseline) return false;
    return JSON.stringify(snapshot(currentForm)) !== JSON.stringify(baseline);
  }, [baseline, currentForm, snapshot]);

  const canSave = canManage && isDirty && !saving;
  const mode = normalizeRewardMode(rewardMode);
  const showBudgetUi = showsBudget(mode);

  useEffect(() => {
    let active = true;
    if (!childDocRef || !canManage) {
      setLoading(false);
      return () => { active = false; };
    }
    getDoc(childDocRef).then((snap) => {
      if (!active) return;
      const d = snap.exists() ? snap.data() : {};
      const loaded = {
        name: d.name || child?.name || '',
        rewardMode: normalizeRewardMode(d.rewardMode || 'points'),
        budget: typeof d.budget === 'number' ? String(d.budget)
          : typeof d.weeklyBudget === 'number' ? String(d.weeklyBudget) : '100',
        budgetPeriod: d.budgetPeriod || 'week',
      };
      setName(loaded.name);
      setRewardMode(loaded.rewardMode);
      setBudget(loaded.budget);
      setBudgetPeriod(loaded.budgetPeriod);
      setBaseline(snapshot(loaded));
    }).catch(() => {}).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [childDocRef, canManage, child?.name, snapshot]);

  const showInfo = useCallback((title, message, onClose) => {
    if (Platform.OS === 'web') {
      setInfoDialog({ visible: true, title, message, onClose: onClose || null });
      return;
    }
    Alert.alert(title, message, [{ text: 'OK', onPress: onClose }]);
  }, []);

  const otherKids = useMemo(
    () => (kids || []).filter((k) => {
      const id = k.id || k.childId;
      return id && id !== childId && k.active !== false && k.archived !== true && k.deleted !== true;
    }),
    [kids, childId],
  );

  const openChoreImport = useCallback(() => {
    if (importing) return;
    if (!otherKids.length) {
      showInfo(
        'Ingen andre barn',
        'Legg til et barn til i familien for å kopiere gjøremål hit.',
      );
      return;
    }
    setChildPickerOpen(true);
  }, [importing, otherKids.length, showInfo]);

  const onPickImportChild = useCallback((kid) => {
    setChildPickerOpen(false);
    setImportFromChild(kid);
    setImportConfirmOpen(true);
  }, []);

  const runChoreImport = useCallback(async () => {
    const from = importFromChild;
    const fromId = from?.id || from?.childId;
    const fromName = from?.name || 'det andre barnet';
    const toName = name.trim() || 'dette barnet';
    setImportConfirmOpen(false);
    if (!familyId || !childId || !fromId || importing) return;
    setImporting(true);
    try {
      const [fromSnap, toSnap] = await Promise.all([
        getDocs(collection(db, 'families', familyId, 'children', fromId, 'todos')),
        getDocs(collection(db, 'families', familyId, 'children', childId, 'todos')),
      ]);
      const sourceTodos = fromSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const targetTodos = toSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const { selected, skipped } = selectChoresToCopy(sourceTodos, targetTodos);
      if (!selected.length) {
        showInfo(
          skipped.length ? 'Allerede kopiert' : 'Ingen gjøremål',
          skipped.length
            ? `${fromName} sine gjøremål finnes allerede hos ${toName}.`
            : `${fromName} har ingen gjøremål å kopiere.`,
        );
        return;
      }
      const stamp = serverTimestamp();
      const uid = auth.currentUser?.uid || null;
      const col = collection(db, 'families', familyId, 'children', childId, 'todos');
      for (let i = 0; i < selected.length; i += 400) {
        const chunk = selected.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((source) => {
          batch.set(doc(col), buildCopiedTodoPayload(source, {
            targetChildId: childId,
            createdBy: uid,
            seriesKey: makeSeriesKey(childId),
            timestamps: stamp,
          }));
        });
        await batch.commit();
      }
      const extra = skipped.length
        ? ` ${skipped.length} ble hoppet over fordi de allerede fantes.`
        : '';
      showInfo(
        'Gjøremål kopiert',
        `${selected.length} gjøremål er lagt inn hos ${toName} som egne kopier. Endringer heretter gjelder bare ${toName}.${extra}`,
      );
    } catch (e) {
      console.warn('[ChoreSettings] chore import failed', e);
      showInfo('Feil', 'Klarte ikke å kopiere gjøremål. Prøv igjen.');
    } finally {
      setImporting(false);
    }
  }, [importFromChild, name, familyId, childId, importing, showInfo]);

  const performSave = useCallback(async () => {
    if (!familyId || !childId || !childDocRef) {
      showInfo('Feil', 'Mangler barn eller familie — gå tilbake og prøv igjen.');
      return;
    }
    setSaving(true);
    try {
      const amount = showBudgetUi ? Math.max(0, Number(budget) || 0) : 0;
      const payload = {
        rewardMode: mode,
        budget: amount,
        weeklyBudget: amount,
        budgetPeriod: showBudgetUi ? budgetPeriod : 'week',
        rewardWeekStart,
        updatedAt: serverTimestamp(),
      };
      await Promise.all([
        setDoc(childDocRef, payload, { merge: true }),
        setDoc(doc(db, 'children', childId), payload, { merge: true }).catch(() => {}),
      ]);
      setBaseline(snapshot({ rewardMode: mode, budget: String(amount), budgetPeriod }));
      setConfirmSaveOpen(false);
      showInfo('Lagret', 'Gjøremålsinnstillingene er lagret.', () => navigation.goBack());
    } catch (e) {
      console.warn('[ChoreSettings] save failed', e);
      showInfo('Feil', 'Klarte ikke lagre. Prøv igjen.');
    } finally {
      setSaving(false);
    }
  }, [
    familyId, childId, childDocRef, budget, mode, budgetPeriod, rewardWeekStart,
    showBudgetUi, snapshot, showInfo, navigation,
  ]);

  const requestSave = useCallback(() => {
    if (!canSave) return;
    if (Platform.OS === 'web') {
      setConfirmSaveOpen(true);
      return;
    }
    Alert.alert(
      'Lagre endringer?',
      `Vil du lagre gjøremålsinnstillingene for ${name.trim() || 'barnet'}?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Lagre', onPress: performSave },
      ],
    );
  }, [canSave, name, performSave]);

  const budgetLabel = useMemo(() => {
    if (mode === 'none') return '';
    const unit = mode === 'money' ? 'kr' : 'stjerner';
    const per = budgetPeriod === 'day' ? 'dag' : budgetPeriod === 'month' ? 'måned' : 'uke';
    return `Maks ${unit} barnet kan tjene per ${per}.`;
  }, [mode, budgetPeriod]);

  if (loading) {
    return (
      <Screen>
        <Loader />
      </Screen>
    );
  }

  if (!canManage) {
    return (
      <Screen>
        <View style={styles.body}>
          <CompactBackLink onPress={() => navigation.goBack()} label="Tilbake" />
          <Text style={styles.denied}>
            Kun foresatte kan endre gjøremålsinnstillinger.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <CompactBackLink onPress={() => navigation.goBack()} label="Gjøremål" />
        <Text style={styles.screenTitle}>Gjøremål – innstillinger</Text>
        <Text style={styles.screenSub}>{name || 'Barn'}</Text>

        <View style={styles.group}>
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Belønningsmodus</Text>
            <View style={styles.chipWrap}>
              {MODE_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.chip, mode === opt && styles.chipActive]}
                  onPress={() => setRewardMode(opt)}
                >
                  <Text style={[styles.chipTxt, mode === opt && styles.chipTxtActive]}>
                    {rewardModeChipLabel(opt)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.hint}>{rewardModeHint(mode)}</Text>
          </View>

          {showBudgetUi ? (
            <>
              <Row label="Budsjettperiode" hint="Hvor ofte nullstilles budsjettet?">
                <View style={styles.chipRow}>
                  {BUDGET_PERIODS.map((p) => (
                    <TouchableOpacity
                      key={p.v}
                      style={[styles.chip, budgetPeriod === p.v && styles.chipActive]}
                      onPress={() => setBudgetPeriod(p.v)}
                    >
                      <Text style={[styles.chipTxt, budgetPeriod === p.v && styles.chipTxtActive]}>{p.l}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Row>

              <View style={styles.fieldWrap}>
                <Text style={styles.fieldLabel}>
                  Budsjett ({mode === 'money' ? 'kr' : 'stjerner'} / {budgetPeriod === 'day' ? 'dag' : budgetPeriod === 'month' ? 'mnd' : 'uke'})
                </Text>
                <TextInput
                  style={styles.input}
                  value={budget}
                  onChangeText={setBudget}
                  keyboardType="number-pad"
                  placeholder={mode === 'money' ? 'f.eks. 100' : 'f.eks. 200'}
                />
                <Text style={styles.hint}>{budgetLabel}</Text>
              </View>
            </>
          ) : (
            <View style={styles.fieldWrap}>
              <Text style={styles.quietBox}>
                Ingen poeng eller penger. Barnet ser bare hva som er gjort — med en kort ros når noe krysses av.
              </Text>
            </View>
          )}

          {mode === 'points' && (
            <View style={styles.fieldWrap}>
              <Text style={styles.fieldLabel}>Opptjeningsmål</Text>
              <Text style={styles.hint}>
                Lag et mål barnet kan se: bilde, beskrivelse og lenke, pluss nivåer (f.eks. 100 stjerner → kino). Individuelt eller delt.
              </Text>
              <TouchableOpacity
                style={[styles.importPlanBtn, { marginTop: 10 }]}
                onPress={() => navigation.navigate('StarGoals', {
                  familyId,
                  childId,
                  childName: name.trim() || child?.name || 'Barn',
                })}
                accessibilityRole="button"
              >
                <Ionicons name="flag-outline" size={18} color={colors.brand} />
                <Text style={styles.importPlanBtnTxt}>Opptjeningsmål</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={[styles.fieldWrap, styles.fieldWrapLast]}>
            <Text style={styles.fieldLabel}>Kopier gjøremål</Text>
            <Text style={styles.hint}>
              Legg inn like gjøremål som et annet barn. De blir egne kopier hos {name.trim() || 'dette barnet'} — uten kobling til originalen.
            </Text>
            <TouchableOpacity
              style={[styles.importPlanBtn, { marginTop: 10 }, importing && { opacity: 0.6 }]}
              onPress={openChoreImport}
              disabled={importing}
              accessibilityRole="button"
            >
              {importing
                ? <ActivityIndicator color={colors.brand} />
                : <Ionicons name="copy-outline" size={18} color={colors.brand} />}
              <Text style={styles.importPlanBtnTxt}>
                {importing ? 'Kopierer…' : 'Importer gjøremål fra et barn'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
          onPress={requestSave}
          disabled={!canSave}
        >
          {saving
            ? <ActivityIndicator color="#fff" />
            : (
              <Text style={[styles.saveBtnTxt, !canSave && styles.saveBtnTxtDisabled]}>
                {isDirty ? 'Lagre endringer' : 'Ingen endringer'}
              </Text>
            )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <ConfirmDialog
        visible={confirmSaveOpen}
        title="Lagre endringer?"
        message={`Vil du lagre gjøremålsinnstillingene for ${name.trim() || 'barnet'}?`}
        confirmText="Lagre"
        cancelText="Avbryt"
        onCancel={() => setConfirmSaveOpen(false)}
        onConfirm={performSave}
        onClose={() => setConfirmSaveOpen(false)}
      />

      <AiImportChildPicker
        visible={childPickerOpen}
        kids={otherKids}
        title="Velg barn å kopiere gjøremål fra"
        onSelect={onPickImportChild}
        onClose={() => setChildPickerOpen(false)}
      />

      <ConfirmDialog
        visible={importConfirmOpen}
        title="Kopiere gjøremål?"
        message={`Alle aktive gjøremål hos ${importFromChild?.name || 'barnet'} kopieres til ${name.trim() || 'dette barnet'}. De blir egne gjøremål her. Endringer etterpå gjelder bare ${name.trim() || 'dette barnet'} — ikke der vi kopierte fra.`}
        confirmText="Importer"
        cancelText="Avbryt"
        onCancel={() => { setImportConfirmOpen(false); setImportFromChild(null); }}
        onConfirm={runChoreImport}
        onClose={() => setImportConfirmOpen(false)}
      />

      <InfoDialog
        visible={infoDialog.visible}
        title={infoDialog.title}
        message={infoDialog.message}
        onClose={() => {
          const cb = infoDialog.onClose;
          setInfoDialog({ visible: false, title: '', message: '', onClose: null });
          cb?.();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16 },
  screenTitle: { fontSize: 20, fontWeight: '400', color: colors.ink, marginBottom: 4 },
  screenSub: { fontSize: 14, fontWeight: '400', color: colors.muted, marginBottom: 16 },
  denied: { marginTop: 24, color: colors.muted, fontWeight: '400', fontSize: 15, lineHeight: 22 },

  group: { backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line, overflow: 'hidden' },

  row: {
    flexDirection: 'row', alignItems: 'center', padding: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  rowLabel: { fontWeight: '400', color: colors.ink, fontSize: 15 },
  rowHint: { fontSize: 12, color: colors.muted, marginTop: 2, lineHeight: 17 },
  rowRight: { marginLeft: 12 },

  fieldWrap: { padding: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  fieldWrapLast: { borderBottomWidth: 0 },
  fieldLabel: { fontWeight: '400', color: colors.ink, marginBottom: 8, fontSize: 14 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12,
    fontSize: 16, backgroundColor: colors.sunken, color: colors.ink,
  },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6, lineHeight: 17 },
  quietBox: {
    fontSize: 13, color: colors.muted, lineHeight: 19, fontWeight: '400',
    backgroundColor: colors.sunken, borderRadius: 10, padding: 12,
  },

  chipRow: { flexDirection: 'row', gap: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10,
    backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontWeight: '400', color: colors.muted, fontSize: 13 },
  chipTxtActive: { color: '#fff' },

  importPlanBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brandSoft, borderRadius: 12, paddingVertical: 12,
  },
  importPlanBtnTxt: { color: colors.brand, fontWeight: '400', fontSize: 14 },

  saveBtn: {
    alignSelf: 'flex-start', marginTop: 20, backgroundColor: colors.brand, paddingVertical: 16, borderRadius: 14, alignItems: 'center' },
  saveBtnDisabled: { backgroundColor: '#cbd5e1' },
  saveBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
  saveBtnTxtDisabled: { color: colors.muted },
});
