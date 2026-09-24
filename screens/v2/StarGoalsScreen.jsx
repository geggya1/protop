/**
 * Langsiktige stjernemål med nivåer — individuelt eller delt mellom barn.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  ActivityIndicator, Platform, Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { colors } from '../../src/theme';
import { Screen, Loader } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import ConfirmDialog, { InfoDialog } from '../../components/ConfirmDialog';
import RewardGoalCard from '../../components/RewardGoalCard';
import RewardImageField from '../../components/RewardImageField';
import { STAR_GOAL_TEMPLATES } from '../../src/data/rewards';
import { pickImage, uploadImage, alertPhotoError } from '../../src/utils/media';
import { acceptRewardImageUrl, validateGoalDraft } from '../../src/utils/rewardGoalsLogic';
import {
  listenRewardGoals,
  saveRewardGoal,
  archiveRewardGoal,
  claimMilestone,
  lifetimeStarsFromTodos,
  goalsForChild,
  goalProgress,
  newMilestoneId,
} from '../../src/utils/rewardGoals';
import { mapTodo } from '../../src/utils/todos';

function blankMilestone(points = '100') {
  return {
    id: newMilestoneId(),
    points: String(points),
    title: '',
    emoji: '🎁',
    description: '',
    imageUrl: '',
    imagePath: '',
    linkUrl: '',
  };
}

function emptyForm(childId) {
  return {
    id: null,
    draftKey: `new_${Date.now().toString(36)}`,
    title: '',
    emoji: '⭐',
    description: '',
    imageUrl: '',
    imagePath: '',
    linkUrl: '',
    shared: false,
    childIds: childId ? [childId] : [],
    milestones: [blankMilestone('100')],
  };
}

export default function StarGoalsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { familyId, childId: focusChildId, childName } = route.params || {};
  const { isParent, isChild, kids, uid } = useApp();
  const canManage = isParent && !isChild;

  const [goals, setGoals] = useState([]);
  const [starsByChild, setStarsByChild] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [infoDialog, setInfoDialog] = useState({ visible: false, title: '', message: '' });
  const [claimTarget, setClaimTarget] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [imageBusy, setImageBusy] = useState(null);

  const activeKids = useMemo(
    () => (kids || []).filter((k) => {
      const id = k.id || k.childId;
      return id && k.active !== false && k.archived !== true && k.deleted !== true;
    }),
    [kids],
  );

  const showInfo = useCallback((title, message) => {
    if (Platform.OS === 'web') {
      setInfoDialog({ visible: true, title, message });
      return;
    }
    Alert.alert(title, message);
  }, []);

  useEffect(() => {
    if (!familyId) {
      setLoading(false);
      return undefined;
    }
    const unsub = listenRewardGoals(familyId, (list) => {
      setGoals(list);
      setLoading(false);
    });
    return unsub;
  }, [familyId]);

  // Lifetime stars per barn (for fremdrift)
  useEffect(() => {
    if (!familyId || !activeKids.length) {
      setStarsByChild({});
      return undefined;
    }
    let cancelled = false;
    const unsubs = activeKids.map((kid) => {
      const id = kid.id || kid.childId;
      return onSnapshot(collection(db, 'families', familyId, 'children', id, 'todos'), (snap) => {
        if (cancelled) return;
        const todos = snap.docs.map(mapTodo).filter((t) => t.active !== false && !t.deleted);
        setStarsByChild((prev) => ({
          ...prev,
          [id]: lifetimeStarsFromTodos(todos),
        }));
      }, () => {});
    });
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u?.());
    };
  }, [familyId, activeKids]);

  const visibleGoals = useMemo(() => {
    if (!focusChildId) return goals;
    return goalsForChild(goals, focusChildId);
  }, [goals, focusChildId]);

  const openNew = useCallback((template = null) => {
    const base = emptyForm(focusChildId);
    if (template) {
      base.title = template.title;
      base.emoji = template.emoji;
      base.description = template.description || '';
      base.shared = !!template.shared;
      base.childIds = template.shared
        ? activeKids.map((k) => k.id || k.childId).filter(Boolean)
        : (focusChildId ? [focusChildId] : base.childIds);
      base.milestones = (template.milestones || []).map((m) => ({
        ...blankMilestone(m.points),
        title: m.title,
        emoji: m.emoji || '🎯',
        description: m.description || '',
        linkUrl: m.linkUrl || '',
      }));
    }
    setEditing(base);
  }, [focusChildId, activeKids]);

  const openEdit = useCallback((goal) => {
    setEditing({
      id: goal.id,
      title: goal.title,
      emoji: goal.emoji,
      description: goal.description || '',
      imageUrl: goal.imageUrl || '',
      imagePath: goal.imagePath || '',
      linkUrl: goal.linkUrl || '',
      shared: !!goal.shared,
      childIds: [...(goal.childIds || [])],
      milestones: (goal.milestones || []).map((m) => ({
        id: m.id,
        points: String(m.points),
        title: m.title,
        emoji: m.emoji || '🎯',
        description: m.description || '',
        imageUrl: m.imageUrl || '',
        imagePath: m.imagePath || '',
        linkUrl: m.linkUrl || '',
        claimedAt: m.claimedAt || null,
        claimedBy: m.claimedBy || null,
        claimedForChildId: m.claimedForChildId || null,
        claims: m.claims || {},
      })),
    });
  }, []);

  const toggleChild = useCallback((id) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const has = prev.childIds.includes(id);
      const childIds = has
        ? prev.childIds.filter((x) => x !== id)
        : [...prev.childIds, id];
      return { ...prev, childIds };
    });
  }, []);

  const updateMilestone = useCallback((mid, patch) => {
    setEditing((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        milestones: prev.milestones.map((m) => (m.id === mid ? { ...m, ...patch } : m)),
      };
    });
  }, []);

  const addMilestone = useCallback(() => {
    setEditing((prev) => {
      if (!prev) return prev;
      const last = prev.milestones[prev.milestones.length - 1];
      const lastPts = Math.round(Number(last?.points) || 0);
      const step = lastPts < 200 ? 50 : lastPts < 1000 ? 100 : lastPts < 5000 ? 500 : 5000;
      const nextPts = (lastPts || 100) + step;
      return {
        ...prev,
        milestones: [
          ...prev.milestones,
          {
            ...blankMilestone(nextPts),
            title: '',
          },
        ],
      };
    });
  }, []);

  const removeMilestone = useCallback((mid) => {
    setEditing((prev) => {
      if (!prev || prev.milestones.length <= 1) return prev;
      return {
        ...prev,
        milestones: prev.milestones.filter((m) => m.id !== mid),
      };
    });
  }, []);

  const saveEditing = useCallback(async () => {
    if (!editing || !familyId || saving) return;
    if (!editing.title.trim()) {
      showInfo('Mangler tittel', 'Gi målet et navn.');
      return;
    }
    if (!editing.childIds.length) {
      showInfo('Velg barn', 'Målet må gjelde minst ett barn.');
      return;
    }
    const checked = validateGoalDraft(editing);
    if (!checked.ok) {
      showInfo('Kan ikke lagre', checked.errors[0]?.message || 'Sjekk feltene og prøv igjen.');
      return;
    }
    setSaving(true);
    try {
      await saveRewardGoal(familyId, editing.id, editing, uid || auth.currentUser?.uid);
      setEditing(null);
    } catch (e) {
      console.warn('[StarGoals] save failed', e);
      showInfo('Feil', 'Klarte ikke lagre målet.');
    } finally {
      setSaving(false);
    }
  }, [editing, familyId, saving, showInfo, uid]);

  const confirmClaim = useCallback(async () => {
    const t = claimTarget;
    setClaimTarget(null);
    if (!t || !familyId) return;
    try {
      await claimMilestone(familyId, t.goal, t.milestoneId, {
        uid: uid || auth.currentUser?.uid,
        childId: t.childId || focusChildId || null,
      });
    } catch (e) {
      console.warn('[StarGoals] claim failed', e);
      showInfo('Feil', 'Klarte ikke markere nivået som innløst.');
    }
  }, [claimTarget, familyId, uid, focusChildId, showInfo]);

  const confirmArchive = useCallback(async () => {
    const g = archiveTarget;
    setArchiveTarget(null);
    if (!g?.id || !familyId) return;
    try {
      await archiveRewardGoal(familyId, g.id);
    } catch (e) {
      console.warn('[StarGoals] archive failed', e);
      showInfo('Feil', 'Klarte ikke arkivere.');
    }
  }, [archiveTarget, familyId, showInfo]);

  const kidName = useCallback((id) => {
    const k = activeKids.find((x) => (x.id || x.childId) === id);
    return k?.name || 'Barn';
  }, [activeKids]);

  const attachImage = useCallback(async (target) => {
    if (!familyId || imageBusy) return;
    try {
      const picked = await pickImage({ edit: true, aspect: [16, 9] });
      if (!picked?.uri && !picked?.blob) return;
      setImageBusy(target);
      const folder = editing?.id || editing?.draftKey || 'draft';
      const path = `families/${familyId}/reward-goals/${folder}-${target}-${Date.now()}.jpg`;
      const url = await uploadImage(path, picked);
      const accepted = acceptRewardImageUrl(url);
      if (!accepted.ok) {
        showInfo('Bilde', accepted.error);
        return;
      }
      if (target === 'goal') {
        setEditing((p) => (p ? { ...p, imageUrl: accepted.imageUrl, imagePath: path } : p));
      } else {
        updateMilestone(target, { imageUrl: accepted.imageUrl, imagePath: path });
      }
    } catch (e) {
      alertPhotoError(e);
    } finally {
      setImageBusy(null);
    }
  }, [familyId, imageBusy, editing?.id, editing?.draftKey, showInfo, updateMilestone]);

  if (loading) {
    return (
      <Screen><Loader /></Screen>
    );
  }

  if (editing && canManage) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <CompactBackLink onPress={() => setEditing(null)} label="Opptjeningsmål" />
          <Text style={styles.screenTitle}>{editing.id ? 'Rediger mål' : 'Nytt opptjeningsmål'}</Text>
          <Text style={styles.screenSub}>
            Barnet ser bildet, teksten og lenken ved siden av stjernene.
          </Text>

          <Text style={styles.label}>Hva jobber dere mot?</Text>
          <TextInput
            style={styles.input}
            value={editing.title}
            onChangeText={(t) => setEditing((p) => ({ ...p, title: t }))}
            placeholder="F.eks. Nintendo, dyreparken, kinotur"
          />

          <Text style={styles.label}>Emoji</Text>
          <TextInput
            style={styles.input}
            value={editing.emoji}
            onChangeText={(t) => setEditing((p) => ({ ...p, emoji: t.slice(0, 8) }))}
            placeholder="⭐"
          />

          <Text style={styles.label}>Hvem gjelder det?</Text>
          <View style={styles.chipWrap}>
            {activeKids.map((k) => {
              const id = k.id || k.childId;
              const on = editing.childIds.includes(id);
              return (
                <TouchableOpacity
                  key={id}
                  style={[styles.chip, on && styles.chipActive]}
                  onPress={() => toggleChild(id)}
                >
                  <Text style={[styles.chipTxt, on && styles.chipTxtActive]}>{k.name || 'Barn'}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={styles.label}>Telling</Text>
          <View style={styles.chipWrap}>
            <TouchableOpacity
              style={[styles.chip, !editing.shared && styles.chipActive]}
              onPress={() => setEditing((p) => ({ ...p, shared: false }))}
            >
              <Text style={[styles.chipTxt, !editing.shared && styles.chipTxtActive]}>Individuelt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.chip, editing.shared && styles.chipActive]}
              onPress={() => setEditing((p) => ({ ...p, shared: true }))}
            >
              <Text style={[styles.chipTxt, editing.shared && styles.chipTxtActive]}>Delt (summeres)</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.hint}>
            {editing.shared
              ? 'Stjernene til alle valgte barn telles sammen mot nivåene.'
              : 'Hvert barn har egen fremdrift mot de samme nivåene.'}
          </Text>

          <Text style={styles.section}>Slik ser barnet det</Text>
          <Text style={styles.label}>Beskrivelse</Text>
          <TextInput
            style={[styles.input, styles.area]}
            value={editing.description}
            onChangeText={(t) => setEditing((p) => ({ ...p, description: t }))}
            placeholder="Hvorfor er dette gøy å jobbe mot?"
            multiline
          />

          <Text style={styles.label}>Bilde</Text>
          <RewardImageField
            imageUrl={editing.imageUrl}
            busy={imageBusy === 'goal'}
            onPick={() => attachImage('goal')}
            onClear={() => setEditing((p) => ({ ...p, imageUrl: '', imagePath: '' }))}
          />

          <Text style={styles.label}>Lenke (valgfritt)</Text>
          <TextInput
            style={styles.input}
            value={editing.linkUrl}
            onChangeText={(t) => setEditing((p) => ({ ...p, linkUrl: t }))}
            placeholder="https://… butikk, film eller tur"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.hint}>Barnet kan trykke og se belønningen. Bare vanlige nettsider.</Text>

          <Text style={[styles.label, { marginTop: 16 }]}>Belønninger</Text>
          <Text style={styles.hint}>
            Hvert nivå er en belønning. Bilde, tekst og lenke her vises når barnet nærmer seg.
          </Text>
          {editing.milestones.map((m, idx) => (
            <View key={m.id} style={styles.milestoneCard}>
              <View style={styles.milestoneHead}>
                <Text style={styles.milestoneIdx}>Nivå {idx + 1}</Text>
                {editing.milestones.length > 1 && (
                  <TouchableOpacity onPress={() => removeMilestone(m.id)} hitSlop={8}>
                    <Ionicons name="trash-outline" size={18} color="#b91c1c" />
                  </TouchableOpacity>
                )}
              </View>
              <Text style={styles.subLabel}>Belønning</Text>
              <TextInput
                style={styles.input}
                value={m.title}
                onChangeText={(t) => updateMilestone(m.id, { title: t })}
                placeholder="F.eks. Kino eller dyreparken"
              />
              <Text style={styles.subLabel}>Stjerner som kreves</Text>
              <TextInput
                style={styles.input}
                value={String(m.points)}
                onChangeText={(t) => updateMilestone(m.id, { points: t.replace(/[^\d]/g, '') })}
                keyboardType="number-pad"
                placeholder="100"
              />
              <Text style={styles.subLabel}>Emoji</Text>
              <TextInput
                style={styles.input}
                value={m.emoji}
                onChangeText={(t) => updateMilestone(m.id, { emoji: t.slice(0, 8) })}
                placeholder="🎯"
              />
              <Text style={styles.subLabel}>Kort tekst</Text>
              <TextInput
                style={[styles.input, styles.area]}
                value={m.description || ''}
                onChangeText={(t) => updateMilestone(m.id, { description: t })}
                placeholder="Hva får barnet, og når?"
                multiline
              />
              <Text style={styles.subLabel}>Bilde for denne belønningen</Text>
              <RewardImageField
                imageUrl={m.imageUrl}
                busy={imageBusy === m.id}
                label="Legg til bilde av belønningen"
                onPick={() => attachImage(m.id)}
                onClear={() => updateMilestone(m.id, { imageUrl: '', imagePath: '' })}
              />
              <Text style={styles.subLabel}>Lenke (valgfritt)</Text>
              <TextInput
                style={styles.input}
                value={m.linkUrl || ''}
                onChangeText={(t) => updateMilestone(m.id, { linkUrl: t })}
                placeholder="https://…"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
            </View>
          ))}

          <TouchableOpacity style={styles.secondaryBtn} onPress={addMilestone}>
            <Ionicons name="add" size={18} color={colors.brand} />
            <Text style={styles.secondaryBtnTxt}>Legg til nivå</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.7 }]}
            onPress={saveEditing}
            disabled={saving}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.saveBtnTxt}>Lagre mål</Text>}
          </TouchableOpacity>
          <View style={{ height: 40 }} />
        </ScrollView>
        <InfoDialog
          visible={infoDialog.visible}
          title={infoDialog.title}
          message={infoDialog.message}
          onClose={() => setInfoDialog({ visible: false, title: '', message: '' })}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.body}>
        <CompactBackLink onPress={() => navigation.goBack()} label={canManage ? 'Innstillinger' : 'Tilbake'} />
        <Text style={styles.screenTitle}>Opptjeningsmål</Text>
        <Text style={styles.screenSub}>
          {canManage
            ? (childName ? `For ${childName}. Bilde, tekst og lenke vises for barnet.` : 'Langsiktige belønninger barnet kan se frem til.')
            : 'Slik ser belønningen ut mens stjernene samler seg.'}
        </Text>

        {canManage && (
          <>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => openNew()}>
              <Ionicons name="add-circle-outline" size={20} color="#fff" />
              <Text style={styles.primaryBtnTxt}>Nytt mål</Text>
            </TouchableOpacity>

            <Text style={styles.section}>Hurtigmaler</Text>
            <View style={styles.templateRow}>
              {STAR_GOAL_TEMPLATES.map((tpl) => (
                <TouchableOpacity
                  key={tpl.title}
                  style={styles.templateCard}
                  onPress={() => openNew(tpl)}
                >
                  <Text style={styles.templateEmoji}>{tpl.emoji}</Text>
                  <Text style={styles.templateTitle}>{tpl.title}</Text>
                  <Text style={styles.templateMeta}>
                    {tpl.shared ? 'Delt' : 'Individuelt'} · {tpl.milestones.length} nivåer
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={styles.section}>{canManage ? 'Aktive mål' : 'Dine mål'}</Text>
        {visibleGoals.length === 0 && (
          <Text style={styles.empty}>
            {canManage
              ? 'Ingen mål ennå. Lag et med bilde og en lenke, eller start fra en mal.'
              : 'Ingen mål ennå. Spør en voksen om å legge inn en belønning.'}
          </Text>
        )}
        {visibleGoals.map((goal) => {
          const claimChildId = focusChildId || (goal.shared ? null : goal.childIds?.[0]);
          const prog = goalProgress(goal, starsByChild, claimChildId);
          const meta = `${goal.shared ? 'Delt' : 'Individuelt'} · ${(goal.childIds || []).map(kidName).join(', ')}`;
          return (
            <RewardGoalCard
              key={goal.id}
              goal={goal}
              progress={prog}
              meta={canManage ? meta : (goal.shared ? 'Sammen med søsken' : '')}
              showLevels
              large={!canManage}
              canClaim={canManage}
              claimChildId={claimChildId}
              onClaim={canManage ? (milestone) => setClaimTarget({
                goal,
                milestoneId: milestone.id,
                childId: claimChildId,
              }) : undefined}
              onEdit={canManage ? () => openEdit(goal) : undefined}
              onArchive={canManage ? () => setArchiveTarget(goal) : undefined}
            />
          );
        })}

        <View style={{ height: 48 }} />
      </ScrollView>

      <ConfirmDialog
        visible={!!claimTarget}
        title="Markere nivå som innløst?"
        message="Bekreft at belønningen er gitt. Fremdriften beholdes; nivået merkes som innløst."
        confirmText="Ja, innløst"
        cancelText="Avbryt"
        onCancel={() => setClaimTarget(null)}
        onConfirm={confirmClaim}
        onClose={() => setClaimTarget(null)}
      />

      <ConfirmDialog
        visible={!!archiveTarget}
        title="Arkivere mål?"
        message={`«${archiveTarget?.title || ''}» skjules fra listen.`}
        confirmText="Arkiver"
        cancelText="Avbryt"
        onCancel={() => setArchiveTarget(null)}
        onConfirm={confirmArchive}
        onClose={() => setArchiveTarget(null)}
      />

      <InfoDialog
        visible={infoDialog.visible}
        title={infoDialog.title}
        message={infoDialog.message}
        onClose={() => setInfoDialog({ visible: false, title: '', message: '' })}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16 },
  screenTitle: { fontSize: 20, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  screenSub: { fontSize: 14, fontWeight: '600', color: colors.muted, marginBottom: 16 },
  denied: { marginTop: 24, color: colors.muted, fontWeight: '600', fontSize: 15 },
  section: { marginTop: 18, marginBottom: 10, fontWeight: '800', color: colors.ink, fontSize: 15 },
  empty: { color: colors.muted, fontWeight: '600', lineHeight: 20 },
  label: { fontWeight: '700', color: colors.ink, marginTop: 12, marginBottom: 6, fontSize: 14 },
  subLabel: { fontWeight: '600', color: colors.muted, marginTop: 8, marginBottom: 4, fontSize: 12 },
  hint: { fontSize: 12, color: colors.muted, marginTop: 6, lineHeight: 17 },
  input: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12,
    fontSize: 16, backgroundColor: colors.sunken, color: colors.ink,
  },
  area: { minHeight: 72, textAlignVertical: 'top' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: colors.sunken, borderWidth: 1, borderColor: colors.line,
  },
  chipActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipTxt: { fontWeight: '800', color: colors.muted, fontSize: 13 },
  chipTxtActive: { color: '#fff' },
  primaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 14,
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  secondaryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.brandSoft, borderRadius: 12, paddingVertical: 12, marginTop: 8,
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '800' },
  saveBtn: {
    marginTop: 20, backgroundColor: colors.brand, paddingVertical: 16,
    borderRadius: 14, alignItems: 'center',
  },
  saveBtnTxt: { color: '#fff', fontWeight: '900', fontSize: 16 },
  templateRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  templateCard: {
    flexGrow: 1, minWidth: 140, backgroundColor: colors.card, borderRadius: 14,
    borderWidth: 1, borderColor: colors.line, padding: 12,
  },
  templateEmoji: { fontSize: 28 },
  templateTitle: { fontWeight: '800', color: colors.ink, marginTop: 6 },
  templateMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  goalCard: {
    backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.line,
    padding: 14, marginBottom: 12,
  },
  goalHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  goalEmoji: { fontSize: 28 },
  goalTitle: { fontWeight: '900', color: colors.ink, fontSize: 17 },
  goalMeta: { color: colors.muted, fontSize: 12, marginTop: 2, fontWeight: '600' },
  progressLbl: { marginTop: 12, fontWeight: '700', color: colors.ink, fontSize: 13 },
  bar: {
    marginTop: 6, height: 8, backgroundColor: '#e2e8f0', borderRadius: 999, overflow: 'hidden',
  },
  barFill: { height: 8, backgroundColor: colors.star || '#f59e0b', borderRadius: 999 },
  levelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12,
    paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line,
  },
  levelEmoji: { fontSize: 22 },
  levelTitle: { fontWeight: '800', color: colors.ink },
  levelClaimed: { textDecorationLine: 'line-through', color: colors.muted },
  levelPts: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  claimBtn: {
    backgroundColor: colors.brandSoft, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
  },
  claimBtnTxt: { color: colors.brand, fontWeight: '800', fontSize: 12 },
  claimedBadge: { color: '#15803d', fontWeight: '800', fontSize: 12 },
  locked: { color: colors.muted, fontWeight: '700', fontSize: 12 },
  archiveLink: { marginTop: 12, alignSelf: 'flex-start' },
  archiveLinkTxt: { color: '#b91c1c', fontWeight: '700', fontSize: 13 },
  milestoneCard: {
    backgroundColor: colors.sunken, borderRadius: 12, padding: 12, marginBottom: 10,
    borderWidth: 1, borderColor: colors.line,
  },
  milestoneHead: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  milestoneIdx: { fontWeight: '800', color: colors.ink },
});
