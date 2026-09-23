import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { useColors } from '../../src/context/ThemeContext';
import { radius, useLayout } from '../../src/theme';
import { Screen, Mute } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import SchoolPageLayout from '../../components/SchoolPageLayout';
import ModuleIntroHost from '../../components/ModuleIntroHost';
import ShellAddButton from '../../components/ShellAddButton';
import { useChildAppGuard } from '../../src/hooks/useChildAppGuard';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { dateKey, addDays, startOfWeekMonday, getISOWeek } from '../../src/utils/dates';
import { aiImportNavParams, childFromRouteParams } from '../../src/utils/childNav';
import { listenChildTodos, toggleTodo, lekserInWeek, isLekserTodo } from '../../src/utils/todos';
import {
  listenChildHomework,
  toggleHomework,
  isHomeworkDone,
  formatHomeworkDue,
  mergeLekserForWeek,
  canAdultEditHomework,
  canCreateHomework,
  groupHomeworkBySubject,
  subjectLabel,
  subjectMeta,
} from '../../src/utils/homework';
import { allowedAppsForChild, isChildAppAllowed } from '../../src/utils/childApps';

function LekseRow({
  item, todayKey, onToggle, onEdit, onStart, colors, styles,
}) {
  const done = isHomeworkDone(item, todayKey);
  const due = formatHomeworkDue(item.dueDate);
  const subject = subjectLabel(item.subject);
  const meta = subjectMeta(item.subject);
  return (
    <View style={[styles.row, done && styles.rowDone]}>
      <TouchableOpacity
        style={styles.checkWrap}
        onPress={() => onToggle(item)}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
      >
        <View style={[styles.check, done && styles.checkDone]}>
          {done && <Ionicons name="checkmark" size={14} color="#fff" />}
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.rowBody}
        onPress={() => onEdit(item)}
        activeOpacity={0.75}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <View style={[styles.subjectDot, { backgroundColor: colors.brandSoft, borderColor: colors.brand }]}>
              <Ionicons name={meta.icon} size={12} color={colors.brand} />
            </View>
            <Text style={[styles.title, done && styles.titleDone]} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          {!!item.description && (
            <Text style={styles.desc} numberOfLines={2}>{item.description}</Text>
          )}
          <Text style={styles.meta}>
            {[subject, due ? `Frist ${due}` : null, done ? 'Ferdig' : null].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </TouchableOpacity>
      {!done ? (
        <TouchableOpacity
          style={styles.startBtn}
          onPress={() => onStart(item)}
          accessibilityRole="button"
          accessibilityLabel="Start leksehjelp"
        >
          <Text style={styles.startBtnTxt}>Start</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function LekserContent({
  loading,
  week,
  weekOffset,
  setWeekOffset,
  doneCount,
  weekLekser,
  canImport,
  canAdd,
  todayKey,
  onToggle,
  onEdit,
  onStart,
  onOpenHelp,
  onOpenPlay,
  colors,
  styles,
  isDesktop,
}) {
  const progress = weekLekser.length ? doneCount / weekLekser.length : 0;

  return (
    <>
      <View style={[styles.toolbar, !isDesktop && styles.toolbarMobile]}>
        <View style={styles.weekNav}>
          <TouchableOpacity onPress={() => setWeekOffset((v) => v - 1)} hitSlop={12}>
            <Ionicons name="chevron-back" size={20} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.weekLabel}>Uke {week}</Text>
          <TouchableOpacity
            onPress={() => setWeekOffset((v) => Math.min(0, v + 1))}
            hitSlop={12}
            disabled={weekOffset >= 0}
            style={weekOffset >= 0 ? { opacity: 0.35 } : null}
          >
            <Ionicons name="chevron-forward" size={20} color={colors.ink} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.columns, isDesktop && styles.columnsDesk]}>
        <View style={styles.mainCol}>
          <View style={styles.progressCard}>
            <View style={styles.progressHead}>
              <Text style={styles.progressTitle}>Dette gjør du i dag</Text>
              <Text style={styles.progressMeta}>
                {doneCount} av {weekLekser.length} ferdig
              </Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
            </View>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={colors.brand} />
          ) : weekLekser.length === 0 ? (
            <View style={styles.emptyCard}>
              <Ionicons name="book-outline" size={32} color={colors.muted} />
              <Text style={styles.emptyCardTxt}>Ingen lekser registrert for denne uken.</Text>
              <Text style={styles.emptyHint}>
                {canImport
                  ? 'Last opp lekseplanen øverst til høyre. AI leser leksene per fag — du godkjenner før de lagres her.'
                  : canAdd
                    ? 'Trykk Ny lekse øverst til høyre for å legge inn en lekse knyttet til et fag.'
                    : 'Foresatte kan legge inn lekser eller importere ukens lekseplan.'}
              </Text>
            </View>
          ) : (
            groupHomeworkBySubject(weekLekser).map((group) => (
              <View key={group.id} style={styles.subjectGroup}>
                <View style={styles.subjectHead}>
                  <Ionicons name={group.icon} size={16} color={colors.brand} />
                  <Text style={styles.subjectHeadTxt}>{group.label}</Text>
                  <Text style={styles.subjectHeadCount}>{group.items.length}</Text>
                </View>
                {group.items.map((item) => (
                  <LekseRow
                    key={`${item.source || 'hw'}-${item.id}`}
                    item={item}
                    todayKey={todayKey}
                    onToggle={onToggle}
                    onEdit={onEdit}
                    onStart={onStart}
                    colors={colors}
                    styles={styles}
                  />
                ))}
              </View>
            ))
          )}
        </View>

        <View style={[styles.sideCol, isDesktop && styles.sideColDesk]}>
          <View style={styles.hintCard}>
            <Text style={styles.hintTitle}>Trenger du et hint?</Text>
            <Text style={styles.hintBody}>
              Leksehjelpen gir små hint og spørsmål til ekte lekser — ikke bare fasit. Slik lærer du mer.
            </Text>
            <TouchableOpacity style={styles.hintBtn} onPress={onOpenHelp} activeOpacity={0.85}>
              <Text style={styles.hintBtnTxt}>Åpne leksehjelpen</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.playCard}>
            <Text style={styles.hintTitle}>Vil du øve mer?</Text>
            <Text style={styles.hintBody}>
              Lær skole er spill og oppdrag med stjerner — frivillig trening, helt egen fra leksehjelp.
            </Text>
            <TouchableOpacity
              style={styles.playBtn}
              onPress={onOpenPlay}
              activeOpacity={0.85}
            >
              <Ionicons name="rocket-outline" size={16} color="#fff" />
              <Text style={styles.playBtnTxt}>Åpne Lær skole</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.tipCard}>
            <Ionicons name="bag-outline" size={18} color={colors.success} />
            <Text style={styles.tipTxt}>Pakk boka når du er ferdig — mestring føles best da</Text>
          </View>
        </View>
      </View>
    </>
  );
}

export default function LekserHubScreen({ inShell = false, onBack } = {}) {
  useChildAppGuard('lekser');
  const nav = useNavigation();
  const route = useRoute();
  const colors = useColors();
  const { isDesktop } = useLayout();
  const {
    familyId: ctxFamilyId, isChild, isParent, isActingAsChild, isAdmin,
    meChild, activeChild, kids, requestShellTab,
  } = useApp();
  const [todos, setTodos] = useState([]);
  const [homework, setHomework] = useState([]);
  const [loading, setLoading] = useState(true);
  const [weekOffset, setWeekOffset] = useState(0);

  const stackParams = inShell ? {} : (route.params || {});
  const familyId = stackParams.familyId || ctxFamilyId;
  const routeChild = inShell ? null : childFromRouteParams(stackParams);
  const profileChild = isChild ? meChild : (isActingAsChild ? activeChild : null);

  const child = useMemo(() => {
    const seed = routeChild || profileChild;
    const id = seed?.id || seed?.childId;
    if (!id) return seed || null;
    return (kids || []).find((k) => (k.id || k.childId) === id) || seed;
  }, [routeChild, profileChild, kids]);

  const childId = child?.id || child?.childId;
  const canAdult = canAdultEditHomework({ isParent, isChild, isAdmin });
  const lekserAllowed = isChildAppAllowed(allowedAppsForChild(child), 'lekser');
  const canAdd = canCreateHomework({
    isParent,
    isChild,
    isActingAsChild,
    isAdmin,
    homeworkSelfEdit: child?.homeworkSelfEdit,
    lekserAllowed,
  });
  const canImport = canAdult;

  const refDate = useMemo(() => {
    const mon = startOfWeekMonday(new Date());
    return addDays(mon, weekOffset * 7);
  }, [weekOffset]);

  const todayKey = dateKey(new Date());
  const { week } = getISOWeek(refDate);
  const weekLekser = useMemo(
    () => mergeLekserForWeek({
      homework,
      legacyTodos: lekserInWeek(todos, refDate),
      refDate,
      childId,
    }),
    [homework, todos, refDate, childId],
  );
  const doneCount = weekLekser.filter((item) => isHomeworkDone(item, todayKey)).length;

  const styles = useMemo(() => makeStyles(colors), [colors]);

  useEffect(() => {
    if (!familyId || !childId) {
      setTodos([]);
      setHomework([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    let todosReady = false;
    let homeworkReady = false;
    const maybeReady = () => {
      if (todosReady && homeworkReady) setLoading(false);
    };
    const unsubTodos = listenChildTodos(familyId, childId, (items) => {
      setTodos((items || []).filter(isLekserTodo));
      todosReady = true;
      maybeReady();
    });
    const unsubHw = listenChildHomework(familyId, childId, (items) => {
      setHomework(items);
      homeworkReady = true;
      maybeReady();
    });
    return () => {
      unsubTodos();
      unsubHw();
    };
  }, [familyId, childId]);

  const goBack = useCallback(() => {
    if (onBack) onBack();
    else if (nav.canGoBack()) nav.goBack();
    else requestShellTab?.('home');
  }, [onBack, nav, requestShellTab]);

  const onToggle = async (item) => {
    if (!familyId || !childId) return;
    try {
      if (item.source === 'legacy-todo' && item.sourceTodoId) {
        await toggleTodo(familyId, childId, { ...item, id: item.sourceTodoId }, new Date());
      } else {
        await toggleHomework(familyId, childId, item, new Date());
      }
    } catch { /* ignore */ }
  };

  const onEdit = (item) => {
    if (!child) return;
    if (item.source === 'legacy-todo') {
      nav.navigate('AddHomework', {
        familyId,
        child,
        childId,
        childName: child.name,
        legacyTodo: item,
      });
      return;
    }
    nav.navigate('AddHomework', {
      familyId,
      child,
      childId,
      childName: child.name,
      homework: item,
    });
  };

  const onStart = (item) => {
    if (!child) return;
    nav.navigate('Leksehjelp', {
      child,
      familyId,
      homework: {
        id: item.source === 'legacy-todo' ? null : item.id,
        title: item.title,
        description: item.description,
        subject: item.subject,
        dueDate: item.dueDate,
        attachments: item.attachments || [],
      },
    });
  };

  const onAdd = useCallback(() => {
    if (!canAdd || !child) return;
    const fri = dateKey(addDays(startOfWeekMonday(refDate), 4));
    nav.navigate('AddHomework', {
      familyId,
      child,
      childId,
      childName: child.name,
      defaultDueKey: fri,
    });
  }, [canAdd, child, childId, familyId, nav, refDate]);

  const onImport = useCallback((autoStart = null) => {
    if (!canImport || !child || !familyId) return;
    nav.navigate('AiImportReview', aiImportNavParams({
      familyId,
      child,
      focusMode: 'homework',
      autoStart: autoStart || undefined,
      returnToHomework: true,
    }));
  }, [canImport, child, familyId, nav]);

  const onOpenHelp = () => {
    nav.navigate('Leksehjelp', { child, familyId });
  };

  const onOpenPlay = () => {
    nav.navigate('Mattehjelp', { child, familyId });
  };

  const mobileHeaderActions = useMemo(() => {
    if (!canImport && !canAdd) return null;
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {canImport ? (
          <TouchableOpacity
            onPress={() => onImport(Platform.OS === 'web' ? 'gallery' : 'camera')}
            accessibilityRole="button"
            accessibilityLabel="Importer lekseplan"
            style={{
              width: isDesktop ? 32 : 36, height: isDesktop ? 32 : 36,
              borderRadius: isDesktop ? 6 : 10,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line,
            }}
          >
            <Ionicons name="cloud-upload-outline" size={18} color={colors.brand} />
          </TouchableOpacity>
        ) : null}
        {canAdd ? (
          <ShellAddButton
            label="Ny lekse"
            onPress={onAdd}
            accessibilityLabel="Legg til lekse"
          />
        ) : null}
      </View>
    );
  }, [isDesktop, canImport, canAdd, onImport, onAdd, colors.line, colors.brand]);
  useShellTitleRight(mobileHeaderActions);

  const contentProps = {
    loading,
    week,
    weekOffset,
    setWeekOffset,
    doneCount,
    weekLekser,
    canImport,
    canAdd,
    todayKey,
    onToggle,
    onEdit,
    onStart,
    onOpenHelp,
    onOpenPlay,
    colors,
    styles,
    isDesktop,
  };

  if (!childId) {
    return (
      <Screen>
        <CompactBackLink onPress={goBack} label="Skole" accessibilityLabel="Tilbake til skole" />
        <View style={styles.emptyWrap}>
          <Ionicons name="book-outline" size={40} color={colors.muted} />
          <Text style={styles.emptyTitle}>Velg et barn</Text>
          <Mute>Åpne Lekser fra barnets profil for å se og importere ukelekser.</Mute>
        </View>
      </Screen>
    );
  }

  if (inShell) {
    return (
      <Screen>
        <ScrollView contentContainerStyle={styles.shellBody} showsVerticalScrollIndicator={false}>
          <LekserContent {...contentProps} />
        </ScrollView>
        <ModuleIntroHost scope="family" moduleId="lekser" />
      </Screen>
    );
  }

  return (
    <Screen>
      <SchoolPageLayout
        activeId="lekser"
        child={child}
        familyId={familyId}
        canEdit={canAdult}
        weekLabel={`Uke ${week}`}
        aiEnabled={child?.aiEnabled !== false}
      >
        <LekserContent {...contentProps} />
      </SchoolPageLayout>
      <ModuleIntroHost scope="family" moduleId="lekser" />
    </Screen>
  );
}

function makeStyles(colors) {
  return StyleSheet.create({
    shellBody: { padding: 12, paddingBottom: 40 },
    toolbar: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 12,
    },
    toolbarMobile: {
      flexDirection: 'column',
      alignItems: 'stretch',
    },
    weekNav: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: '#fff',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    weekLabel: { fontWeight: '500', fontSize: 14, color: colors.ink, minWidth: 64, textAlign: 'center' },
    columns: { gap: 12 },
    columnsDesk: { flexDirection: 'row', alignItems: 'flex-start' },
    mainCol: { flex: 1, gap: 10, minWidth: 0 },
    sideCol: { gap: 10 },
    sideColDesk: { width: 260, flexShrink: 0 },
    progressCard: {
      backgroundColor: '#fff',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 14,
    },
    progressHead: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 10,
      gap: 8,
    },
    progressTitle: { fontWeight: '500', fontSize: 15, color: colors.ink },
    progressMeta: { fontWeight: '400', fontSize: 12, color: colors.muted },
    progressTrack: {
      height: 8,
      borderRadius: 99,
      backgroundColor: colors.line,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 99,
      backgroundColor: colors.success,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'stretch',
      backgroundColor: '#fff',
      borderRadius: radius.md,
      marginBottom: 8,
      borderWidth: 1,
      borderColor: colors.line,
      overflow: 'hidden',
    },
    rowDone: { opacity: 0.75 },
    checkWrap: { paddingLeft: 12, justifyContent: 'center' },
    check: {
      width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: colors.line,
      alignItems: 'center', justifyContent: 'center',
    },
    checkDone: { backgroundColor: colors.success, borderColor: colors.success },
    rowMain: {
      flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, paddingRight: 12,
    },
    rowBody: { flex: 1, paddingVertical: 12, paddingRight: 8 },
    startBtn: {
      backgroundColor: colors.brandSoft,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginRight: 12,
      alignSelf: 'center',
    },
    title: { fontWeight: '500', fontSize: 15, color: colors.ink, flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    subjectDot: {
      width: 22, height: 22, borderRadius: 11, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center', marginTop: 1,
    },
    titleDone: { textDecorationLine: 'line-through', color: colors.muted },
    desc: { fontSize: 13, color: colors.muted, marginTop: 2, fontWeight: '400' },
    meta: { fontSize: 12, color: colors.muted, fontWeight: '400', marginTop: 4 },
    startBtnTxt: { color: colors.brand, fontWeight: '500', fontSize: 12 },
    hintCard: {
      backgroundColor: '#fff',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.line,
      padding: 16,
      gap: 8,
    },
    hintTitle: { fontWeight: '500', fontSize: 15, color: colors.ink },
    hintBody: { fontSize: 13, color: colors.muted, lineHeight: 18, fontWeight: '400' },
    hintBtn: {
      marginTop: 4,
      alignSelf: 'flex-start',
      borderWidth: 1,
      borderColor: colors.brand,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    hintBtnTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },
    playCard: {
      backgroundColor: '#ecfeff',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: '#a5f3fc',
      padding: 16,
      gap: 8,
    },
    playBtn: {
      marginTop: 4,
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.brand,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    playBtnTxt: { color: '#fff', fontWeight: '600', fontSize: 13 },
    tipCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.successSoft || '#ecfdf5',
      borderRadius: radius.md,
      padding: 12,
    },
    tipTxt: { flex: 1, fontWeight: '400', fontSize: 13, color: colors.ink },
    emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
    emptyTitle: { fontWeight: '500', fontSize: 18, color: colors.ink, marginTop: 8 },
    emptyCard: {
      alignItems: 'center', padding: 28, backgroundColor: '#fff',
      borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, gap: 8,
    },
    emptyCardTxt: { fontWeight: '500', fontSize: 15, color: colors.ink, textAlign: 'center' },
    emptyHint: { fontSize: 13, color: colors.muted, textAlign: 'center', fontWeight: '400', lineHeight: 18 },
    subjectGroup: { gap: 0 },
    subjectHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 6,
      marginBottom: 8,
    },
    subjectHeadTxt: { fontWeight: '500', fontSize: 13, color: colors.ink, flex: 1 },
    subjectHeadCount: { fontWeight: '400', fontSize: 12, color: colors.muted },
  });
}
