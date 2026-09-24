import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { colors, radius, useLayout } from '../../src/theme';
import { Screen, Title, Mute, ScrollBody, BigButton } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import BrandToggle from '../../components/BrandToggle';
import CustodyRuleCard from '../../components/CustodyRuleCard';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import { InfoDialog } from '../../components/ConfirmDialog';
import {
  buildCustodyPayload,
  custodyFormReady,
  custodySummaryLabel,
  defaultCustodyRules,
  initCustodyForm,
  newCustodyRule,
  normalizeCustody,
  normalizeCustodyForm,
  resolveCustodyLabels,
} from '../../src/utils/custodySchedule';

function resolveChildFromParams({ routeParams, kids, childProp }) {
  if (childProp?.id || childProp?.childId) return childProp;
  const raw = routeParams?.child;
  if (raw && typeof raw === 'object' && (raw.id || raw.childId)) return raw;
  const childId = routeParams?.childId
    || (typeof raw === 'string' && raw !== '[object Object]' ? raw : null);
  if (!childId) return null;
  return (kids || []).find((k) => k.id === childId || k.uid === childId) || {
    id: childId,
    childId,
    name: routeParams?.childName || 'Barn',
  };
}

export default function CustodySettingsScreen({ inShell = false, onBack, child: childProp } = {}) {
  const nav = useNavigation();
  const route = useRoute();
  const { isDesktop, pad } = useLayout();
  const { familyId, kids, parents, uid, isParent } = useApp();

  const child = useMemo(
    () => resolveChildFromParams({ routeParams: route.params, kids, childProp }),
    [route.params, kids, childProp],
  );
  const childId = child?.id || child?.childId || route.params?.childId;
  const childName = child?.name || route.params?.childName || 'Barn';

  const goBack = useCallback(() => {
    if (typeof onBack === 'function') onBack();
    else nav.goBack();
  }, [onBack, nav]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(() => initCustodyForm(child, { parents, myUid: uid }));
  const [info, setInfo] = useState({ visible: false, title: '', message: '' });

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.activeElement?.blur?.();
    }
  }, []);

  const activeParents = useMemo(
    () => (parents || []).filter((p) => p.active !== false && p.archived !== true),
    [parents],
  );

  const otherParentOptions = useMemo(
    () => activeParents.filter((p) => (p.uid || p.id) !== uid),
    [activeParents, uid],
  );

  const parentNames = useMemo(
    () => resolveCustodyLabels(form, { parents: activeParents, viewerUid: uid }),
    [form, activeParents, uid],
  );

  const formReady = custodyFormReady(form);
  const mySideLabel = form.myParentSlot === 'parentB' ? parentNames.parentB : parentNames.parentA;
  const otherSideLabel = form.myParentSlot === 'parentB' ? parentNames.parentA : parentNames.parentB;

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!familyId || !childId) {
        setLoading(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'families', familyId, 'children', childId));
        if (!alive) return;
        const data = snap.exists() ? snap.data() : {};
        const merged = { ...child, ...data, id: childId, name: data.name || childName };
        const persisted = normalizeCustody(merged.custody);
        if (persisted.enabled) {
          setForm(persisted);
        } else {
          setForm(initCustodyForm(merged, { parents, myUid: uid }));
        }
      } catch {
        if (alive) setForm(initCustodyForm(child, { parents, myUid: uid }));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [familyId, childId, childName, parents, uid]);

  const patchForm = (patch) => setForm((prev) => normalizeCustodyForm({ ...prev, ...patch }));

  const enableCustody = () => {
    setForm((prev) => normalizeCustodyForm({
      ...prev,
      enabled: true,
      parentAUid: prev.parentAUid || uid,
      rules: (prev.rules || []).length ? prev.rules : defaultCustodyRules(),
    }));
  };

  const disableCustody = () => {
    setForm((prev) => normalizeCustodyForm({ ...prev, enabled: false }));
  };

  const swapSides = () => {
    setForm((prev) => normalizeCustodyForm({
      ...prev,
      parentAUid: prev.parentBUid,
      parentBUid: prev.parentAUid,
      parentALabel: prev.parentBLabel,
      parentBLabel: prev.parentALabel,
      myParentSlot: prev.myParentSlot === 'parentA' ? 'parentB' : 'parentA',
      rules: (prev.rules || []).map((rule) => ({
        ...rule,
        parentSlot: rule.parentSlot === 'parentA' ? 'parentB' : 'parentA',
      })),
    }));
  };

  const addRule = () => {
    patchForm({
      enabled: true,
      parentAUid: form.parentAUid || uid,
      rules: [...(form.rules || []), newCustodyRule({ parentSlot: 'parentA' })],
    });
  };

  const applyTemplate = () => {
    patchForm({
      enabled: true,
      parentAUid: form.parentAUid || uid,
      rules: defaultCustodyRules(),
    });
  };

  const updateRule = (index, nextRule) => {
    setForm((prev) => {
      const rules = [...(prev.rules || [])];
      rules[index] = nextRule;
      return normalizeCustodyForm({ ...prev, enabled: true, rules });
    });
  };

  const removeRule = (index) => {
    setForm((prev) => {
      const rules = (prev.rules || []).filter((_, i) => i !== index);
      return normalizeCustodyForm({ ...prev, rules, enabled: rules.length > 0 ? prev.enabled : false });
    });
  };

  const save = async () => {
    if (!familyId || !childId || !isParent) return;
    if (form.enabled && !(form.rules || []).length) {
      setInfo({ visible: true, title: 'Mangler regler', message: 'Legg til minst én bostedsregel med regelmessighet.' });
      return;
    }
    setSaving(true);
    try {
      const toSave = normalizeCustodyForm({
        ...form,
        parentAUid: form.parentAUid || uid,
      });
      const payload = {
        ...buildCustodyPayload(toSave).custody,
        updatedAt: serverTimestamp(),
      };
      await Promise.all([
        setDoc(doc(db, 'families', familyId, 'children', childId), { custody: payload }, { merge: true }),
        setDoc(doc(db, 'children', childId), { custody: payload }, { merge: true }).catch(() => {}),
      ]);
      setInfo({
        visible: true,
        title: 'Lagret',
        message: form.enabled
          ? `Delt bosted for ${childName} er lagret.`
          : 'Delt bosted er slått av.',
      });
    } catch (e) {
      setInfo({ visible: true, title: 'Feil', message: e?.message || 'Klarte ikke lagre.' });
    } finally {
      setSaving(false);
    }
  };

  if (!isParent) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Kun for foreldre</Text>
          <Mute style={{ textAlign: 'center' }}>Delt bosted kan settes opp av en forelder.</Mute>
        </View>
      </Screen>
    );
  }

  if (!childId) {
    return (
      <Screen>
        <View style={styles.center}>
          <Text style={styles.centerTitle}>Fant ikke barnet</Text>
          <Mute style={{ textAlign: 'center', marginBottom: 16 }}>Gå tilbake og velg barnet på nytt.</Mute>
          <BigButton label="Tilbake" onPress={goBack} />
        </View>
      </Screen>
    );
  }

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.brand} />
        </View>
      </Screen>
    );
  }

  const summary = custodySummaryLabel(form.enabled && formReady ? form : { enabled: false }, parentNames);

  const body = (
    <>
      <CompactBackLink onPress={goBack} label="Tilbake" />

      <Title size={isDesktop ? 18 : 24}>
        Delt bosted
        {childName ? ` · ${childName}` : ''}
      </Title>
      <Mute style={styles.lead}>
        Du kan sette opp bostedsplan alene. Den andre forelderen trenger ikke ProTop-konto — gi dem et navn (f.eks. Mor/Far).
        Reglene vises som farge i kalenderen, ikke som hendelser.
      </Mute>

      <View style={styles.card}>
        <View style={styles.rowBetween}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.rowTitle}>Aktiver delt bosted</Text>
            <Text style={styles.rowSub}>{form.enabled ? summary : 'Ikke aktivert'}</Text>
          </View>
          <BrandToggle
            value={!!form.enabled}
            onValueChange={(enabled) => (enabled ? enableCustody() : disableCustody())}
          />
        </View>
      </View>

      {form.enabled ? (
        <>
          <Text style={styles.section}>Hvem er hvem</Text>
          <View style={styles.card}>
            <View style={styles.sideBlock}>
              <Text style={styles.sideLbl}>Dine perioder (blå i kalenderen)</Text>
              <Text style={styles.sideName}>{mySideLabel}</Text>
              <Text style={styles.sideHint}>Knyttet til deg som innlogget foresatt</Text>
            </View>

            <TouchableOpacity style={styles.swapBtn} onPress={swapSides} accessibilityLabel="Bytt side">
              <Ionicons name="swap-vertical" size={18} color={colors.brand} />
              <Text style={styles.swapTxt}>Bytt side</Text>
            </TouchableOpacity>

            <View style={styles.sideBlock}>
              <Text style={styles.sideLbl}>Andre forelders perioder (oransje)</Text>
              <TextInput
                value={form.myParentSlot === 'parentB' ? form.parentALabel : form.parentBLabel}
                onChangeText={(parentBLabel) => patchForm(
                  form.myParentSlot === 'parentB'
                    ? { parentALabel: parentBLabel }
                    : { parentBLabel },
                )}
                placeholder="F.eks. Mor, Far, Bestemor"
                style={styles.labelInput}
              />
              <Text style={styles.sideHint}>Trenger ikke ProTop-konto</Text>
            </View>

            {otherParentOptions.length > 0 ? (
              <View style={styles.linkRow}>
                <Text style={styles.linkLbl}>Valgfritt: knytt til medlem i familien</Text>
                <View style={styles.chipRow}>
                  <TouchableOpacity
                    style={[styles.chip, !form.parentBUid && styles.chipOn]}
                    onPress={() => patchForm({ parentBUid: null })}
                  >
                    <Text style={[styles.chipTxt, !form.parentBUid && styles.chipTxtOn]}>Ingen konto</Text>
                  </TouchableOpacity>
                  {otherParentOptions.map((p) => (
                    <TouchableOpacity
                      key={p.uid || p.id}
                      style={[styles.chip, form.parentBUid === (p.uid || p.id) && styles.chipOnB]}
                      onPress={() => patchForm({
                        parentBUid: p.uid || p.id,
                        parentBLabel: String(p.name || '').split(' ')[0] || form.parentBLabel,
                      })}
                    >
                      <Text style={[styles.chipTxt, form.parentBUid === (p.uid || p.id) && styles.chipTxtOn]}>
                        {p.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
          </View>

          <Text style={styles.section}>Bostedsregler</Text>
          <Mute style={styles.cardHint}>
            Velg hos hvem barnet er ({String(mySideLabel).split(' ')[0]} eller {String(otherSideLabel).split(' ')[0]}) og sett regelmessighet som gjøremål.
          </Mute>

          {(form.rules || []).map((rule, index) => (
            <CustodyRuleCard
              key={rule.id || `rule-${index}`}
              rule={rule}
              parentNames={parentNames}
              onChange={(next) => updateRule(index, next)}
              onRemove={() => removeRule(index)}
              canRemove={(form.rules || []).length > 1}
            />
          ))}

          <TouchableOpacity style={styles.addBtn} onPress={addRule}>
            <Ionicons name="add" size={18} color={colors.brand} />
            <Text style={styles.addBtnTxt}>Legg til regel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.templateBtn} onPress={applyTemplate}>
            <Text style={styles.templateBtnTxt}>Mal: annenhver uke 50/50</Text>
          </TouchableOpacity>
        </>
      ) : null}

      <BigButton label={saving ? 'Lagrer…' : 'Lagre'} onPress={save} disabled={saving} />
    </>
  );

  return (
    <Screen>
      <EdgeSwipeBack enabled={!inShell} onBack={goBack}>
        <ScrollBody pad={pad}>{body}</ScrollBody>
      </EdgeSwipeBack>

      <InfoDialog
        visible={info.visible}
        title={info.title}
        message={info.message}
        onClose={() => {
          setInfo({ visible: false, title: '', message: '' });
          if (info.title === 'Lagret') goBack();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  lead: { marginBottom: 12 },
  section: {
    fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase',
    letterSpacing: 0.8, marginTop: 8, marginBottom: 6, marginLeft: 2,
  },
  card: {
    backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.line, padding: 14, gap: 12,
  },
  rowBetween: { flexDirection: 'row', alignItems: 'center' },
  rowTitle: { fontWeight: '800', fontSize: 15, color: colors.ink },
  rowSub: { fontSize: 12, color: colors.muted, fontWeight: '600', marginTop: 2 },
  cardHint: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  sideBlock: { gap: 4 },
  sideLbl: { fontSize: 11, fontWeight: '800', color: colors.muted, textTransform: 'uppercase' },
  sideName: { fontSize: 17, fontWeight: '800', color: colors.ink },
  sideHint: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  labelInput: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, fontWeight: '600',
    color: colors.ink, backgroundColor: colors.bg,
  },
  swapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 10, backgroundColor: colors.brandSoft,
  },
  swapTxt: { color: colors.brand, fontWeight: '800', fontSize: 13 },
  linkRow: { gap: 8, marginTop: 4, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  linkLbl: { fontSize: 12, fontWeight: '700', color: colors.muted },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10,
    borderWidth: 1, borderColor: colors.line, backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  chipOnB: { backgroundColor: '#ffedd5', borderColor: '#ea580c' },
  chipTxt: { fontWeight: '700', fontSize: 13, color: colors.ink },
  chipTxtOn: { color: colors.brand },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.brand,
    backgroundColor: colors.brandSoft,
  },
  addBtnTxt: { color: colors.brand, fontWeight: '800', fontSize: 14 },
  templateBtn: { alignItems: 'center', paddingVertical: 8 },
  templateBtnTxt: { color: colors.brand, fontWeight: '700', fontSize: 13 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerTitle: { fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 8 },
});
