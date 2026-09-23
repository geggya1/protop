import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../firebase';
import { useApp } from '../../src/context/AppContext';
import { colors, MEMBER_COLORS, useLayout } from '../../src/theme';
import { dateKey, addDays, startOfWeekMonday, getISOWeek, parseDateKey } from '../../src/utils/dates';
import { listenChildTodos, attestTodo, undoAttestTodo } from '../../src/utils/todos';
import {
  weekPlanForChild,
  findCrossChildDuplicates,
  collectPendingAttestations,
  kidProgressSummary,
  choreFairnessByKid,
  attestKeysThroughToday,
  shortDateLabel,
} from '../../src/utils/familyProgress';
import { profileAge } from '../../src/utils/age';
import { markAttestNotificationsSeen } from '../../src/utils/notifications';
import { Screen, Loader, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer } from '../../components/ModulePageBg';
import { AvatarBubble } from '../../components/AvatarPicker';
import CompactBackLink from '../../components/CompactBackLink';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import { DeskBtn } from '../../components/DeskBtn';


const TABS = [
  { id: 'overview', label: 'Oversikt' },
  { id: 'fair', label: 'Innsats' },
  { id: 'plan', label: 'Ukeplan' },
  { id: 'attest', label: 'Attestering' },
];

/** Parent/admin hub: week progress, chore plan, and attestation — stays on parent profile. */
export default function FamilyProgressScreen({ inShell = false, onBack = null }) {
  const nav = useNavigation();
  const { isDesktop } = useLayout();
  const {
    family, familyId, kids, isParent, isChild, uid, shellIntent, clearShellIntent,
  } = useApp();
  const canAttest = isParent && !isChild;

  const today = useMemo(() => new Date(), []);
  const todayKey = dateKey(today);
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(
    () => addDays(startOfWeekMonday(today), weekOffset * 7),
    [today, weekOffset],
  );
  const weekKeys = useMemo(() => (
    Array.from({ length: 7 }, (_, i) => dateKey(addDays(weekStart, i)))
  ), [weekStart]);
  const iso = useMemo(() => getISOWeek(weekStart), [weekStart]);
  const attestKeys = useMemo(
    () => attestKeysThroughToday(weekKeys, todayKey),
    [weekKeys, todayKey],
  );

  const [kidMap, setKidMap] = useState({});
  const [tab, setTab] = useState('overview');
  const [expandedKidId, setExpandedKidId] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [planDayKey, setPlanDayKey] = useState(todayKey);

  useEffect(() => {
    if (shellIntent !== 'attest') return;
    setTab('attest');
    clearShellIntent?.();
  }, [shellIntent, clearShellIntent]);

  useEffect(() => {
    if (tab !== 'attest' || !uid) return;
    markAttestNotificationsSeen(uid, familyId).catch(() => {});
  }, [tab, uid, familyId]);

  useEffect(() => {
    if (!weekKeys.includes(planDayKey)) setPlanDayKey(weekKeys[0]);
  }, [weekKeys, planDayKey]);

  const kidsKey = useMemo(
    () => (kids || []).map((k) => k.id).filter(Boolean).sort().join('|'),
    [kids],
  );

  useEffect(() => {
    if (!familyId || !kidsKey) return undefined;
    const ids = kidsKey.split('|');
    const unsubs = ids.map((kidId) => listenChildTodos(familyId, kidId, (items) => {
      setKidMap((prev) => ({ ...prev, [kidId]: items }));
    }));
    return () => unsubs.forEach((u) => u && u());
  }, [familyId, kidsKey]);

  const activeKids = useMemo(
    () => (kids || []).filter((k) => k.active !== false),
    [kids],
  );

  const duplicates = useMemo(
    () => findCrossChildDuplicates(activeKids, kidMap, weekKeys),
    [activeKids, kidMap, weekKeys],
  );

  const pendingItems = useMemo(
    () => collectPendingAttestations(activeKids, kidMap, attestKeys),
    [activeKids, kidMap, attestKeys],
  );

  const fairness = useMemo(
    () => choreFairnessByKid(activeKids, kidMap, weekKeys, todayKey),
    [activeKids, kidMap, weekKeys, todayKey],
  );

  const actorName = auth.currentUser?.displayName || auth.currentUser?.email || 'Foresatt';

  const runAttest = useCallback(async (item, undo = false) => {
    if (!canAttest || !familyId) return;
    setBusyId(item.id);
    try {
      if (undo) {
        await undoAttestTodo(familyId, item.kidId, item.task, item.dateKey);
      } else {
        await attestTodo(familyId, item.kidId, item.task, item.dateKey, {
          uid,
          name: actorName,
        });
      }
    } catch (e) {
      Alert.alert('Feil', undo ? 'Klarte ikke angre attestering.' : 'Klarte ikke attestere.');
    } finally {
      setBusyId(null);
    }
  }, [canAttest, familyId, uid, actorName]);

  const attestAllPending = useCallback(async () => {
    if (!canAttest || !pendingItems.length) return;
    setBusyId('bulk');
    try {
      await Promise.all(pendingItems.map((item) => (
        attestTodo(familyId, item.kidId, item.task, item.dateKey, { uid, name: actorName })
      )));
      Alert.alert('Attestert', `${pendingItems.length} gjøremål er bekreftet.`);
    } catch {
      Alert.alert('Feil', 'Klarte ikke attestere alle. Prøv én og én.');
    } finally {
      setBusyId(null);
    }
  }, [canAttest, pendingItems, familyId, uid, actorName]);

  const goBack = () => {
    if (onBack) onBack();
    else nav.goBack();
  };

  if (!familyId) return <Screen><Loader /></Screen>;

  const content = (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.hub, isDesktop && styles.hubDesk]}
      showsVerticalScrollIndicator={false}
    >
      {!inShell ? (
        <>
          <CompactBackLink onPress={goBack} label="Tilbake" />
          {!isDesktop ? (
            <>
              <Text style={styles.kicker}>FAMILIEN</Text>
              <Text style={styles.title}>Progresjon</Text>
            </>
          ) : null}
        </>
      ) : null}

      {!isDesktop || !inShell ? (
        <Mute style={styles.sub}>
          {family?.name || 'ProTop'} · oppsyn uten å bytte profil
        </Mute>
      ) : (
        <Text style={styles.subDesk}>
          {family?.name || 'ProTop'} · oppsyn uten å bytte profil
        </Text>
      )}

      <View style={styles.weekNav}>
        <TouchableOpacity
          onPress={() => setWeekOffset((n) => n - 1)}
          style={styles.weekNavBtn}
          accessibilityLabel="Forrige uke"
        >
          <Ionicons name="chevron-back" size={18} color={colors.ink} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setWeekOffset(0)} style={styles.weekNavMid} accessibilityLabel="Denne uken">
          <Text style={styles.weekNavTitle}>Uke {iso.week}</Text>
          <Text style={styles.weekNavSub}>
            {shortDateLabel(weekKeys[0])} – {shortDateLabel(weekKeys[6])}
            {weekOffset === 0 ? ' · denne uken' : weekOffset < 0 ? ` · ${Math.abs(weekOffset)} uker tilbake` : ` · ${weekOffset} uker frem`}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setWeekOffset((n) => n + 1)}
          style={styles.weekNavBtn}
          accessibilityLabel="Neste uke"
        >
          <Ionicons name="chevron-forward" size={18} color={colors.ink} />
        </TouchableOpacity>
      </View>
      <View style={styles.weekJump}>
        <TouchableOpacity style={styles.weekJumpBtn} onPress={() => setWeekOffset((n) => n - 1)}>
          <Text style={styles.weekJumpTxt}>Forrige uke</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.weekJumpBtn, weekOffset === 0 && styles.weekJumpOn]}
          onPress={() => { setWeekOffset(0); setPlanDayKey(todayKey); }}
        >
          <Text style={[styles.weekJumpTxt, weekOffset === 0 && styles.weekJumpTxtOn]}>I dag</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.weekJumpBtn} onPress={() => setWeekOffset((n) => n + 1)}>
          <Text style={styles.weekJumpTxt}>Neste uke</Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.seg, isDesktop && styles.segDesk]}>
        {TABS.map((t) => {
          const on = tab === t.id;
          const badge = t.id === 'attest' && pendingItems.length > 0 ? pendingItems.length : 0;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.segBtn, isDesktop && styles.segBtnDesk, on && styles.segOn]}
              onPress={() => setTab(t.id)}
              activeOpacity={0.85}
            >
              <Text style={[styles.segTxt, on && styles.segTxtOn]}>{t.label}</Text>
              {badge > 0 ? (
                <View style={styles.tabBadge}>
                  <Text style={styles.tabBadgeTxt}>{badge}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>

      {activeKids.length === 0 ? (
        <View style={[styles.panel, isDesktop && styles.panelDesk]}>
          <Text style={styles.emptyInline}>Ingen aktive barn i familien.</Text>
        </View>
      ) : null}

      {tab === 'overview' && activeKids.length > 0 ? (
        <View style={[styles.panel, isDesktop && styles.panelDesk]}>
          <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>Barn</Text>
          {activeKids.map((kid, idx) => {
            const todos = kidMap[kid.id] || [];
            const summary = kidProgressSummary(todos, weekKeys, todayKey);
            const age = profileAge(kid);
            const pct = summary.todayTotal
              ? Math.round((summary.doneToday / summary.todayTotal) * 100)
              : 0;
            const expanded = expandedKidId === kid.id;
            const plan = expanded ? weekPlanForChild(todos, weekKeys) : null;
            const unit = (todos.some((t) => t.rewardType === 'money') && !todos.some((t) => t.rewardType === 'points'))
              ? 'kr'
              : '★';

            return (
              <View
                key={kid.id}
                style={[styles.kidBlock, idx > 0 && styles.kidBlockBorder]}
              >
                <TouchableOpacity
                  style={styles.cardTop}
                  onPress={() => setExpandedKidId(expanded ? null : kid.id)}
                  activeOpacity={0.75}
                >
                  <AvatarBubble
                    avatarId={kid.avatarId}
                    photoURL={kid.photoURL || kid.photoUrl}
                    name={kid.name}
                    size={isDesktop ? 32 : 40}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.kidName, isDesktop && styles.kidNameDesk]} numberOfLines={1}>
                      {kid.name}
                    </Text>
                    <View style={styles.statsRow}>
                      {age != null && <Text style={styles.kidAge}>{age} år</Text>}
                      <Text style={styles.kidSub}>
                        {summary.doneToday}/{summary.todayTotal} i dag
                      </Text>
                      <Text style={styles.kidPts}>
                        {summary.weekEarned}{unit} av {summary.weekPossible}{unit} uka
                      </Text>
                    </View>
                    {summary.pendingWeek > 0 ? (
                      <Text style={styles.pendingHint}>
                        {summary.pendingWeek} til attestering
                      </Text>
                    ) : null}
                    <View style={styles.kidBar}>
                      <View
                        style={[
                          styles.kidBarFill,
                          { width: `${pct}%` },
                          summary.todayTotal > 0 && summary.doneToday >= summary.todayTotal && styles.kidBarDone,
                        ]}
                      />
                    </View>
                    <Text style={styles.barHint}>
                      {summary.todayTotal === 0
                        ? 'Ingen oppgaver i dag'
                        : summary.doneToday >= summary.todayTotal
                          ? 'Alt kvittert i dag'
                          : `${pct}% kvittert i dag`}
                    </Text>
                  </View>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.muted}
                  />
                </TouchableOpacity>

                {expanded && plan ? (
                  <View style={styles.expandBlock}>
                    <Text style={styles.expandTitle}>Denne uka</Text>
                    {plan.map((day) => (
                      <View key={day.dateKey} style={styles.dayBlock}>
                        <Text style={[
                          styles.dayHead,
                          day.dateKey === todayKey && styles.dayHeadToday,
                        ]}
                        >
                          {day.weekday} {day.shortDate}
                          {day.pendingCount > 0 ? ` · ${day.pendingCount} venter` : ''}
                        </Text>
                        {day.chores.length === 0 ? (
                          <Text style={styles.dayEmpty}>Ingen gjøremål</Text>
                        ) : day.chores.map((c) => (
                          <View key={`${c.id}-${day.dateKey}`} style={styles.choreRow}>
                            <Ionicons
                              name={c.attested ? 'shield-checkmark' : c.done ? 'checkmark-circle' : 'ellipse-outline'}
                              size={16}
                              color={c.attested ? colors.success : c.done ? colors.brand : colors.muted}
                            />
                            <Text style={styles.choreTitle} numberOfLines={2}>{c.title}</Text>
                            <Text style={styles.choreMeta}>
                              {c.attested ? 'Attestert' : c.done ? 'Kvittert' : 'Åpen'}
                            </Text>
                            {canAttest && c.pending ? (
                              <TouchableOpacity
                                style={styles.miniAttest}
                                disabled={busyId === `${kid.id}:${c.id}:${day.dateKey}`}
                                onPress={() => runAttest({
                                  id: `${kid.id}:${c.id}:${day.dateKey}`,
                                  kidId: kid.id,
                                  task: c.task,
                                  dateKey: day.dateKey,
                                })}
                              >
                                <Text style={styles.miniAttestTxt}>Attestér</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      {tab === 'fair' && activeKids.length > 0 ? (
        <View style={[styles.panel, isDesktop && styles.panelDesk]}>
          <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>
            Innsats denne uken
          </Text>
          <Mute style={{ marginBottom: 10 }}>
            Hvem har gjort hvor mye — en toppliste for familiens gjøremål.
          </Mute>
          {fairness.map((row, i) => (
            <View key={row.kidId} style={[styles.fairRow, i > 0 && styles.kidBlockBorder]}>
              <AvatarBubble
                avatarId={row.avatarId}
                photoURL={row.photoURL}
                name={row.name}
                size={isDesktop ? 28 : 34}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.kidName} numberOfLines={1}>{row.name}</Text>
                <View style={styles.fairTrack}>
                  <View
                    style={[
                      styles.fairFill,
                      {
                        width: `${Math.max(row.sharePct, row.weekDone ? 6 : 0)}%`,
                        backgroundColor: row.color || MEMBER_COLORS[i % MEMBER_COLORS.length],
                      },
                    ]}
                  />
                </View>
                <Text style={styles.attestMeta}>
                  {row.weekDone} av {row.weekTotal} gjort · {row.sharePct}% av familiens innsats
                  {row.todayTotal ? ` · i dag ${row.doneToday}/${row.todayTotal}` : ''}
                </Text>
              </View>
            </View>
          ))}
          {fairness.every((r) => r.weekTotal === 0) ? (
            <Text style={styles.emptyInline}>Ingen gjøremål denne uken ennå.</Text>
          ) : null}
        </View>
      ) : null}

      {tab === 'plan' && activeKids.length > 0 ? (
        <View style={{ gap: 10 }}>
          {duplicates.length > 0 ? (
            <View style={styles.warnBox}>
              <Text style={styles.warnTitle}>Mulige duplikater denne uka</Text>
              {duplicates.slice(0, 8).map((d) => (
                <Text key={`${d.dateKey}:${d.title}`} style={styles.warnLine}>
                  {d.weekday} {d.shortDate}: «{d.title}» hos{' '}
                  {d.kids.map((k) => k.kidName).filter((n, i, a) => a.indexOf(n) === i).join(' + ')}
                </Text>
              ))}
              {duplicates.length > 8 ? (
                <Text style={styles.warnLine}>…og {duplicates.length - 8} til</Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.okDup}>Ingen like gjøremål på samme dag på tvers av barn.</Text>
          )}

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.dayChips}
          >
            {weekKeys.map((k) => {
              const on = planDayKey === k;
              const d = parseDateKey(k);
              const label = `${['Man', 'Tir', 'Ons', 'Tor', 'Fre', 'Lør', 'Søn'][(d.getDay() + 6) % 7]} ${shortDateLabel(k)}`;
              return (
                <TouchableOpacity
                  key={k}
                  style={[styles.dayChip, on && styles.dayChipOn, k === todayKey && styles.dayChipToday]}
                  onPress={() => setPlanDayKey(k)}
                >
                  <Text style={[styles.dayChipTxt, on && styles.dayChipTxtOn]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          <View style={[styles.panel, isDesktop && styles.panelDesk]}>
            {activeKids.map((kid, idx) => {
              const day = weekPlanForChild(kidMap[kid.id] || [], [planDayKey])[0];
              return (
                <View key={kid.id} style={[styles.planKid, idx > 0 && styles.kidBlockBorder]}>
                  <Text style={[styles.planKidName, isDesktop && styles.kidNameDesk]}>{kid.name}</Text>
                  {!day?.chores?.length ? (
                    <Text style={styles.dayEmpty}>Ingen gjøremål</Text>
                  ) : day.chores.map((c) => (
                    <View key={c.id} style={styles.choreRow}>
                      <Ionicons
                        name={c.attested ? 'shield-checkmark' : c.done ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={c.attested ? colors.success : c.done ? colors.brand : colors.muted}
                      />
                      <Text style={styles.choreTitle}>{c.title}</Text>
                      <Text style={styles.choreMeta}>
                        {c.value}{c.rewardType === 'money' ? ' kr' : ' p'}
                      </Text>
                    </View>
                  ))}
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {tab === 'attest' ? (
        <View style={{ gap: 10 }}>
          <Mute>
            Barn kvitterer selv. Du bekrefter her at gjøremålet faktisk er gjort.
          </Mute>
          {pendingItems.length === 0 ? (
            <View style={[styles.panel, isDesktop && styles.panelDesk]}>
              <Text style={styles.emptyInline}>Ingen gjøremål venter på attestering denne uka.</Text>
            </View>
          ) : (
            <>
              {canAttest ? (
                isDesktop ? (
                  <View style={styles.deskAddWrap}>
                    <DeskBtn
                      primary
                      icon="shield-checkmark"
                      label={`Attestér alle (${pendingItems.length})`}
                      onPress={attestAllPending}
                    />
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.bulkBtn, busyId === 'bulk' && { opacity: 0.6 }]}
                    onPress={attestAllPending}
                    disabled={busyId === 'bulk'}
                  >
                    {busyId === 'bulk' ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.bulkBtnTxt}>
                        Attestér alle ({pendingItems.length})
                      </Text>
                    )}
                  </TouchableOpacity>
                )
              ) : null}
              <View style={[styles.panel, isDesktop && styles.panelDesk]}>
                {pendingItems.map((item, idx) => (
                  <View
                    key={item.id}
                    style={[styles.attestRow, idx > 0 && styles.kidBlockBorder]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.attestTitle, isDesktop && styles.kidNameDesk]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={styles.attestMeta}>
                        {item.kidName} · {item.weekday} {item.shortDate}
                        {item.value ? ` · ${item.value}${item.rewardType === 'money' ? ' kr' : ' p'}` : ''}
                      </Text>
                    </View>
                    {canAttest ? (
                      <TouchableOpacity
                        style={styles.attestBtn}
                        onPress={() => runAttest(item)}
                        disabled={busyId === item.id}
                      >
                        {busyId === item.id ? (
                          <ActivityIndicator color="#fff" size="small" />
                        ) : (
                          <Text style={styles.attestBtnTxt}>Attestér</Text>
                        )}
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ))}
              </View>
            </>
          )}
        </View>
      ) : null}

      <Text style={styles.footerHint}>
        Trykk et barn under Oversikt for ukedetaljer — uten å bytte profil.
      </Text>
      <ModuleBgSpacer />
      </ScrollView>
  );

  if (inShell) {
    return (
      <View style={styles.shellRoot}>
        <ModulePageFrame name="progress">
          {content}
        </ModulePageFrame>
      </View>
    );
  }

  return (
    <Screen>
      <ModulePageFrame name="progress">
      <EdgeSwipeBack onBack={goBack}>
        {content}
      </EdgeSwipeBack>
      </ModulePageFrame>
    </Screen>
  );
}

const styles = StyleSheet.create({
  shellRoot: { flex: 1, minHeight: 0, position: 'relative', backgroundColor: 'transparent' },
  scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  hub: { flexGrow: 1, padding: 16, gap: 10, paddingBottom: 28 },
  hubDesk: { padding: 12, gap: 8 },
  kicker: { fontSize: 11, fontWeight: '500', color: colors.muted, letterSpacing: 0.8 },
  title: { fontSize: 22, fontWeight: '500', color: colors.ink, marginTop: 2 },
  sub: { marginBottom: 2 },
  subDesk: { color: colors.muted, fontWeight: '400', fontSize: 12, marginBottom: 2 },
  weekNav: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
    borderRadius: 12, paddingVertical: 6, paddingHorizontal: 6,
  },
  weekNavBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  weekNavMid: { flex: 1, alignItems: 'center' },
  weekNavTitle: { fontSize: 15, fontWeight: '500', color: colors.ink },
  weekNavSub: { fontSize: 12, fontWeight: '400', color: colors.muted, marginTop: 1 },
  weekJump: { flexDirection: 'row', gap: 8 },
  weekJumpBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line,
  },
  weekJumpOn: { backgroundColor: colors.brandSoft, borderColor: colors.brand },
  weekJumpTxt: { fontSize: 12, fontWeight: '400', color: colors.ink },
  weekJumpTxtOn: { color: colors.brand, fontWeight: '500' },

  seg: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.line,
  },
  segDesk: { borderRadius: 8, alignSelf: 'flex-start', maxWidth: 420 },
  segBtn: {
    flex: 1, paddingVertical: 6, paddingHorizontal: 8, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5,
  },
  segBtnDesk: { flexGrow: 0, flexBasis: 'auto', minWidth: 100, borderRadius: 6 },
  segOn: { backgroundColor: colors.brand },
  segTxt: { fontWeight: '500', fontSize: 12, color: colors.ink },
  segTxtOn: { color: '#fff' },
  tabBadge: {
    minWidth: 16, height: 16, borderRadius: 8, backgroundColor: colors.warn,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
  },
  tabBadgeTxt: { color: '#fff', fontWeight: '500', fontSize: 9 },

  panel: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  panelDesk: { borderRadius: 8, padding: 10 },
  listSection: {
    fontWeight: '500', fontSize: 12, color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4,
  },
  listSectionDesk: { fontWeight: '500', fontSize: 11, marginBottom: 2 },
  emptyInline: {
    color: colors.muted, fontWeight: '400', fontSize: 13, paddingVertical: 10, textAlign: 'center',
  },

  kidBlock: { paddingTop: 2 },
  kidBlockBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    marginTop: 4,
    paddingTop: 8,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  fairRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 6 },
  fairTrack: {
    height: 8, borderRadius: 6, backgroundColor: '#e2e8f0', overflow: 'hidden', marginTop: 6,
  },
  fairFill: { height: '100%', borderRadius: 6 },
  kidName: { fontWeight: '500', fontSize: 14, color: colors.ink },
  kidNameDesk: { fontWeight: '500', fontSize: 13 },
  statsRow: { flexDirection: 'row', gap: 6, alignItems: 'center', marginTop: 3, flexWrap: 'wrap' },
  kidAge: {
    fontWeight: '500', fontSize: 11, color: colors.brand,
    backgroundColor: colors.brandSoft, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 5,
  },
  kidSub: { color: colors.muted, fontWeight: '400', fontSize: 12 },
  kidPts: { color: colors.star, fontWeight: '500', fontSize: 12 },
  pendingHint: { marginTop: 3, color: colors.warn, fontWeight: '500', fontSize: 11 },
  kidBar: {
    marginTop: 8, height: 5, backgroundColor: '#e7effe', borderRadius: 999, overflow: 'hidden',
  },
  kidBarFill: { height: 5, backgroundColor: colors.brand, borderRadius: 999 },
  kidBarDone: { backgroundColor: colors.success },
  barHint: { marginTop: 4, fontSize: 11, fontWeight: '400', color: colors.muted },

  expandBlock: { marginTop: 10, paddingLeft: 42 },
  expandTitle: { fontWeight: '600', fontSize: 12, color: colors.ink, marginBottom: 6 },
  dayBlock: { marginBottom: 10 },
  dayHead: { fontWeight: '500', fontSize: 12, color: colors.muted, marginBottom: 4 },
  dayHeadToday: { color: colors.brand },
  dayEmpty: { color: colors.muted, fontWeight: '400', fontSize: 12, marginLeft: 2 },
  choreRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4,
  },
  choreTitle: { flex: 1, fontWeight: '500', fontSize: 13, color: colors.ink },
  choreMeta: { fontWeight: '400', fontSize: 11, color: colors.muted },
  miniAttest: {
    backgroundColor: colors.brand, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  miniAttestTxt: { color: '#fff', fontWeight: '600', fontSize: 11 },

  warnBox: {
    backgroundColor: '#fff7ed', borderRadius: 10, padding: 10,
    borderWidth: 1, borderColor: '#fed7aa',
  },
  warnTitle: { fontWeight: '600', color: '#9a3412', marginBottom: 4, fontSize: 13 },
  warnLine: { color: '#9a3412', fontWeight: '400', fontSize: 12, marginBottom: 3, lineHeight: 17 },
  okDup: { color: colors.success, fontWeight: '500', fontSize: 12 },
  dayChips: { gap: 6, alignItems: 'center', height: 32, paddingVertical: 0 },
  dayChip: {
    height: 28, paddingHorizontal: 10, borderRadius: 7, backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center',
  },
  dayChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayChipToday: { borderColor: colors.brand },
  dayChipTxt: { fontWeight: '500', fontSize: 12, color: colors.ink },
  dayChipTxtOn: { color: '#fff' },
  planKid: { paddingVertical: 6 },
  planKidName: { fontWeight: '600', fontSize: 14, color: colors.ink, marginBottom: 4 },

  deskAddWrap: { alignSelf: 'flex-end' },
  bulkBtn: {
    backgroundColor: colors.brand, borderRadius: 10, paddingVertical: 11,
    alignItems: 'center', alignSelf: 'stretch',
  },
  bulkBtnTxt: { color: '#fff', fontWeight: '600', fontSize: 14 },
  attestRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8,
  },
  attestTitle: { fontWeight: '600', fontSize: 14, color: colors.ink },
  attestMeta: { color: colors.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  attestBtn: {
    backgroundColor: colors.brand, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7,
    minWidth: 80, alignItems: 'center',
  },
  attestBtnTxt: { color: '#fff', fontWeight: '600', fontSize: 12 },
  footerHint: {
    marginTop: 4, fontSize: 12, color: colors.muted, fontWeight: '400',
    textAlign: 'center', lineHeight: 17,
  },
});
