import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Alert, Platform, Image, Modal, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Screen, Title, Mute } from '../../components/ui';
import { ModulePageFrame, ModuleBgSpacer, ModuleHubIntro } from '../../components/ModulePageBg';
import ShellAddButton from '../../components/ShellAddButton';
import RecipeThumb from '../../components/meals/RecipeThumb';
import HelpTarget from '../../components/HelpTarget';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import { getRecipeDisplayImageUrl } from '../../src/utils/recipeImages';
import { NORWEGIAN_RECIPES } from '../../src/data/norwegianRecipes';
import {
  MATCOACH_DIETS,
  MATCOACH_GOAL_OPTIONS,
  loadMatcoachPrefs,
  saveMatcoachPrefs,
  generateMatcoachWeekPlan,
  generateMatcoachLunchBoxes,
  swapMatcoachMeal,
  applyWeekPlanToMeals,
  collectShoppingFromPlan,
  listenMatcoachHistory,
  buildLocalWeekPlan,
  subtractPantryFromShopping,
  restorePlanFromHistoryEntry,
  restoreLunchFromHistoryEntry,
  enrichSuggestionDay,
  enrichPlanDays,
  dayAsRecipeThumb,
  pushDaysToShopping,
} from '../../src/utils/matcoach';
import { listenPantry } from '../../src/utils/familyPantry';
import { listenAccessibleLists } from '../../src/utils/shoppingLists';
import { useShopFamilyIds } from '../../src/hooks/useShopFamilyIds';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { formatWeekRange } from '../../src/utils/meals';
import { dateKey, startOfWeekMonday } from '../../src/utils/dates';

const TABS = [
  { id: 'coach', label: 'Ukeplan', icon: 'sparkles' },
  { id: 'lunch', label: 'Matpakker', icon: 'briefcase' },
  { id: 'prefs', label: 'Familie', icon: 'people' },
  { id: 'history', label: 'Historikk', icon: 'time' },
];

function alertMsg(title, message) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
}

function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipOn]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <Text style={[styles.chipTxt, active && styles.chipTxtOn]}>{label}</Text>
    </TouchableOpacity>
  );
}

function DayCard({ day, onSwap, swapping, onOpen }) {
  const thumb = dayAsRecipeThumb(day);
  return (
    <TouchableOpacity
      style={styles.dayCard}
      onPress={onOpen}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`Åpne ${day.title}`}
      accessibilityHint="Viser bilde, ingredienser og oppskrift"
    >
      <View style={styles.dayTop}>
        <RecipeThumb recipe={thumb} size={64} showCustomBadge={false} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.dayName}>{day.dayName}</Text>
          <Text style={styles.dayTitle} numberOfLines={2}>{day.title}</Text>
          <View style={styles.metaRow}>
            {day.minutes ? <Text style={styles.meta}>{day.minutes} min</Text> : null}
            {day.kcal ? <Text style={styles.meta}>{day.kcal} kcal</Text> : null}
          </View>
        </View>
        <View style={styles.dayActions}>
          {onSwap ? (
            <TouchableOpacity
              style={styles.swapBtn}
              onPress={(e) => {
                e?.stopPropagation?.();
                onSwap();
              }}
              disabled={swapping}
              accessibilityLabel={`Bytt ${day.dayName}`}
            >
              {swapping ? (
                <ActivityIndicator size="small" color={colors.brand} />
              ) : (
                <Ionicons name="shuffle" size={18} color={colors.brand} />
              )}
            </TouchableOpacity>
          ) : null}
          <Ionicons name="chevron-forward" size={18} color={colors.muted} />
        </View>
      </View>
      {day.tags?.length ? (
        <View style={styles.tagRow}>
          {day.tags.slice(0, 4).map((t) => (
            <View key={t} style={styles.tag}><Text style={styles.tagTxt}>{t}</Text></View>
          ))}
        </View>
      ) : null}
      {day.whyChosen ? <Text style={styles.why} numberOfLines={2}>{day.whyChosen}</Text> : null}
      <Text style={styles.openHint}>Trykk for bilde, oppskrift og registrering</Text>
    </TouchableOpacity>
  );
}

function MealDetailModal({
  visible, day, prefs, busy, onClose, onSwap, onRegister,
}) {
  const { isDesktop } = useLayout();
  const [toMeals, setToMeals] = useState(true);
  const [toShop, setToShop] = useState(true);

  useEffect(() => {
    if (visible) {
      setToMeals(true);
      setToShop(true);
    }
  }, [visible, day?.dayIndex, day?.title]);

  if (!day) return null;
  const thumb = dayAsRecipeThumb(day);
  const heroUrl = getRecipeDisplayImageUrl(thumb);

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
        onPress={onClose}
      >
        <Pressable
          style={[styles.modalCard, isDesktop && [desktopSheet, styles.modalCardDesk]]}
          onPress={() => {}}
          onStartShouldSetResponder={() => true}
        >
          <ScrollView contentContainerStyle={styles.modalScroll}>
            {heroUrl ? (
              <Image source={{ uri: heroUrl }} style={styles.heroImage} resizeMode="cover" />
            ) : (
              <View style={styles.heroFallback}>
                <Text style={{ fontSize: 56 }}>{day.emoji || '🍽️'}</Text>
              </View>
            )}
            <View style={styles.modalBody}>
            <View style={styles.modalHeadRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.dayName}>{day.dayName}</Text>
                <Text style={styles.modalTitle}>{day.title}</Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={10} style={styles.modalClose}>
                <Ionicons name="close" size={22} color={colors.muted} />
              </TouchableOpacity>
            </View>
            <View style={styles.metaRow}>
              {day.minutes ? <Text style={styles.meta}>{day.minutes} min</Text> : null}
              {day.kcal ? <Text style={styles.meta}>{day.kcal} kcal</Text> : null}
              <Text style={styles.meta}>
                {prefs?.adults || 2} voksne · {prefs?.children || 0} barn
              </Text>
            </View>
            {day.tags?.length ? (
              <View style={styles.tagRow}>
                {day.tags.map((t) => (
                  <View key={t} style={styles.tag}><Text style={styles.tagTxt}>{t}</Text></View>
                ))}
              </View>
            ) : null}
            {day.whyChosen ? <Text style={styles.why}>Hvorfor: {day.whyChosen}</Text> : null}
            {day.description ? (
              <>
                <Text style={styles.sectionTitle}>Beskrivelse</Text>
                <Text style={styles.desc}>{day.description}</Text>
              </>
            ) : null}
            <Text style={styles.sectionTitle}>Ingredienser</Text>
            {(day.ingredients || []).length ? (
              (day.ingredients || []).map((ing) => (
                <Text key={`${ing.name}-${ing.amount}`} style={styles.desc}>
                  • {ing.name}{ing.amount ? ` — ${ing.amount}` : ''}
                </Text>
              ))
            ) : (
              <Mute>Ingen ingredienser oppgitt.</Mute>
            )}
            <Text style={styles.sectionTitle}>Slik gjør du</Text>
            <Text style={styles.instructions}>
              {day.instructions || 'Se beskrivelsen og tilbered etter smak.'}
            </Text>

            <Text style={styles.sectionTitle}>Registrer</Text>
            <Mute>Velg måltidsplan, handleliste — eller begge.</Mute>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setToMeals((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: toMeals }}
            >
              <Ionicons name={toMeals ? 'checkbox' : 'square-outline'} size={22} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.checkTitle}>Måltidsplanlegger</Text>
                <Text style={styles.checkSub}>Legg inn som middag {day.dayName?.toLowerCase()}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.checkRow}
              onPress={() => setToShop((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: toShop }}
            >
              <Ionicons name={toShop ? 'checkbox' : 'square-outline'} size={22} color={colors.brand} />
              <View style={{ flex: 1 }}>
                <Text style={styles.checkTitle}>Handleliste</Text>
                <Text style={styles.checkSub}>Legg til ingrediensene for denne retten</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.primaryBtn, ((!toMeals && !toShop) || busy) && styles.btnDisabled]}
                disabled={(!toMeals && !toShop) || !!busy}
                onPress={() => onRegister?.({ toMeals, toShop })}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnTxt}>
                    {toMeals && toShop
                      ? 'Registrer begge'
                      : toMeals
                        ? 'Legg i måltidsplan'
                        : toShop
                          ? 'Legg i handleliste'
                          : 'Velg minst én'}
                  </Text>
                )}
              </TouchableOpacity>
              {onSwap ? (
                <TouchableOpacity style={styles.secondaryBtn} onPress={onSwap} disabled={!!busy}>
                  <Ionicons name="shuffle" size={18} color={colors.brand} />
                  <Text style={styles.secondaryBtnTxt}>Bytt rett</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function MatcoachHubScreen({ inShell = false, setSubView }) {
  const { familyId, isParent, members, uid, families } = useApp();
  const { isDesktop } = useLayout();
  const [tab, setTab] = useState('coach');
  const [prefs, setPrefs] = useState(null);
  const [prefsDraft, setPrefsDraft] = useState(null);
  const [plan, setPlan] = useState(null);
  const [lunch, setLunch] = useState(null);
  const [busy, setBusy] = useState('');
  const [swapDay, setSwapDay] = useState(null);
  const [pantry, setPantry] = useState([]);
  const [lists, setLists] = useState([]);
  const [history, setHistory] = useState([]);
  const [allergyInput, setAllergyInput] = useState('');
  const [dislikeInput, setDislikeInput] = useState('');
  const [activeDay, setActiveDay] = useState(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [skipPantry, setSkipPantry] = useState(true);
  const [bulkToMeals, setBulkToMeals] = useState(true);
  const [bulkToShop, setBulkToShop] = useState(true);
  const weekStart = useMemo(() => startOfWeekMonday(new Date()), []);
  const recipePool = useMemo(() => NORWEGIAN_RECIPES, []);

  useHelpScene(tab === 'prefs' ? 'inner' : 'hub', {
    onRetreat: () => setTab('coach'),
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const loaded = await loadMatcoachPrefs(familyId, members);
      if (!alive) return;
      setPrefs(loaded);
      setPrefsDraft(loaded);
    })();
    return () => { alive = false; };
  }, [familyId, members]);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenPantry(familyId, setPantry);
  }, [familyId]);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenMatcoachHistory(familyId, setHistory);
  }, [familyId]);

  const shopPlatformIds = useShopFamilyIds(families, familyId);

  useEffect(() => {
    if (!uid) return undefined;
    return listenAccessibleLists(shopPlatformIds, uid, { platforms: families }, setLists);
  }, [shopPlatformIds, uid]);

  const shoppingPreview = useMemo(() => {
    const all = collectShoppingFromPlan(plan);
    if (!skipPantry) return { needed: all, covered: [] };
    return subtractPantryFromShopping(all, pantry);
  }, [plan, pantry, skipPantry]);
  const primaryList = lists.find((l) => !l.archived) || lists[0];

  const ensureParent = useCallback(() => {
    if (!isParent) {
      alertMsg('Kun foresatte', 'AI Matcoach er for foresatte i familien.');
      return false;
    }
    if (!familyId) {
      alertMsg('Mangler familie', 'Velg en familie først.');
      return false;
    }
    return true;
  }, [isParent, familyId]);

  const onGeneratePlan = useCallback(async () => {
    if (!ensureParent() || !prefs) return;
    setBusy('plan');
    try {
      const pantryNames = pantry.map((p) => p.name).filter(Boolean).slice(0, 30);
      let next;
      try {
        next = await generateMatcoachWeekPlan(familyId, {
          prefs,
          pantryNames,
          extraRecipes: recipePool,
        });
      } catch (err) {
        next = buildLocalWeekPlan(prefs);
        next.summary = `${next.summary} (lokal reserve: ${err?.message || 'AI utilgjengelig'})`;
      }
      next = enrichPlanDays(next, recipePool);
      setPlan(next);
      setActiveDay(null);
      setDetailOpen(false);
      setTab('coach');
    } catch (err) {
      alertMsg('Klarte ikke lage ukeplan', err?.message || 'Prøv igjen');
    } finally {
      setBusy('');
    }
  }, [ensureParent, prefs, pantry, familyId, recipePool]);

  const matcoachAddBtn = useMemo(() => {
    if (!isParent) return null;
    return (
      <HelpTarget id="add" onAdvance={onGeneratePlan}>
        <ShellAddButton
          label="Ny ukeplan"
          accessibilityLabel="Ny ukeplan"
          onPress={onGeneratePlan}
        />
      </HelpTarget>
    );
  }, [isParent, onGeneratePlan]);
  useShellTitleRight(matcoachAddBtn);

  const onApplyPlan = useCallback(async () => {
    if (!ensureParent() || !plan) return;
    if (!bulkToMeals && !bulkToShop) {
      alertMsg('Velg registrering', 'Kryss av måltidsplan, handleliste — eller begge.');
      return;
    }
    if (bulkToShop && !primaryList) {
      alertMsg('Ingen handleliste', 'Opprett en handleliste under Handleliste først.');
      setSubView?.('shop');
      return;
    }
    setBusy('apply');
    try {
      const parts = [];
      if (bulkToMeals) {
        await applyWeekPlanToMeals(familyId, plan, prefs, { weekStart });
        parts.push('måltidsplanen');
      }
      if (bulkToShop) {
        const result = await pushDaysToShopping(familyId, primaryList.id, plan.days, {
          pantryItems: pantry,
          skipPantry,
        });
        parts.push(`handlelisten (${result.added} varer)`);
      }
      alertMsg('Registrert', `Lagt til i ${parts.join(' og ')}.`);
      if (bulkToMeals && !bulkToShop) setSubView?.('meals');
      else if (!bulkToMeals && bulkToShop) setSubView?.('shop');
    } catch (err) {
      alertMsg('Kunne ikke lagre', err?.message || 'Prøv igjen');
    } finally {
      setBusy('');
    }
  }, [
    ensureParent, plan, familyId, prefs, weekStart, setSubView,
    bulkToMeals, bulkToShop, primaryList, pantry, skipPantry,
  ]);

  const onPushShopping = useCallback(async () => {
    if (!ensureParent() || !plan?.days?.length) return;
    if (!primaryList) {
      alertMsg('Ingen handleliste', 'Opprett en handleliste under Handleliste først.');
      setSubView?.('shop');
      return;
    }
    setBusy('shop');
    try {
      const result = await pushDaysToShopping(familyId, primaryList.id, plan.days, {
        pantryItems: pantry,
        skipPantry,
      });
      alertMsg(
        'Handleliste oppdatert',
        `${result.added} varer lagt til${result.covered ? ` (${result.covered} allerede i lager)` : ''}.`,
      );
    } catch (err) {
      alertMsg('Kunne ikke legge til', err?.message || 'Prøv igjen');
    } finally {
      setBusy('');
    }
  }, [ensureParent, plan, primaryList, familyId, setSubView, pantry, skipPantry]);

  const onSwap = useCallback(async (dayIndex) => {
    if (!ensureParent() || !plan || !prefs) return;
    const day = plan.days[dayIndex];
    if (!day) return;
    setSwapDay(dayIndex);
    try {
      const avoidTitles = plan.days.map((d) => d.title);
      const swapped = await swapMatcoachMeal(familyId, {
        prefs,
        currentTitle: day.title,
        avoidTitles,
      });
      const enriched = enrichSuggestionDay({
        ...day,
        title: swapped.title,
        minutes: swapped.minutes,
        kcal: swapped.kcal,
        tags: swapped.tags || [],
        whyChosen: swapped.whyChosen || day.whyChosen,
        description: swapped.description || '',
        ingredients: swapped.ingredients || [],
        recipeId: swapped.recipeId || '',
        emoji: swapped.emoji || day.emoji,
        instructions: swapped.instructions || '',
      }, recipePool);
      setPlan((prev) => ({
        ...prev,
        days: prev.days.map((d, i) => (i === dayIndex ? enriched : d)),
      }));
      setActiveDay((prev) => (prev?.dayIndex === dayIndex ? enriched : prev));
    } catch (err) {
      alertMsg('Bytte feilet', err?.message || 'Prøv igjen');
    } finally {
      setSwapDay(null);
    }
  }, [ensureParent, plan, prefs, familyId, recipePool]);

  const openDayDetail = useCallback((day) => {
    const enriched = enrichSuggestionDay(day, recipePool);
    setActiveDay(enriched);
    setDetailOpen(true);
  }, [recipePool]);

  const onRegisterDay = useCallback(async ({ toMeals, toShop }) => {
    if (!ensureParent() || !activeDay) return;
    if (!toMeals && !toShop) return;
    if (toShop && !primaryList) {
      alertMsg('Ingen handleliste', 'Opprett en handleliste under Handleliste først.');
      setSubView?.('shop');
      return;
    }
    setBusy('day');
    try {
      const parts = [];
      if (toMeals) {
        await applyWeekPlanToMeals(familyId, null, prefs, {
          weekStart,
          days: [activeDay],
        });
        parts.push('måltidsplanen');
      }
      if (toShop) {
        const result = await pushDaysToShopping(familyId, primaryList.id, [activeDay], {
          pantryItems: pantry,
          skipPantry,
        });
        parts.push(`handlelisten (${result.added} varer)`);
      }
      alertMsg('Registrert', `«${activeDay.title}» lagt til i ${parts.join(' og ')}.`);
      setDetailOpen(false);
    } catch (err) {
      alertMsg('Kunne ikke registrere', err?.message || 'Prøv igjen');
    } finally {
      setBusy('');
    }
  }, [
    ensureParent, activeDay, primaryList, familyId, prefs, weekStart,
    pantry, skipPantry, setSubView,
  ]);

  const onGenerateLunch = useCallback(async () => {
    if (!ensureParent() || !prefs) return;
    setBusy('lunch');
    try {
      const next = await generateMatcoachLunchBoxes(familyId, { prefs });
      setLunch(next);
      setTab('lunch');
    } catch (err) {
      alertMsg('Matpakker feilet', err?.message || 'Prøv igjen');
    } finally {
      setBusy('');
    }
  }, [ensureParent, prefs, familyId]);

  const onSavePrefs = useCallback(async () => {
    if (!prefsDraft) return;
    const saved = await saveMatcoachPrefs(familyId, prefsDraft);
    setPrefs(saved);
    setPrefsDraft(saved);
    alertMsg('Lagret', 'Familiepreferansene er oppdatert.');
  }, [prefsDraft, familyId]);

  const addTagValue = (field, value, clear) => {
    const v = String(value || '').trim();
    if (!v || !prefsDraft) return;
    const list = Array.isArray(prefsDraft[field]) ? prefsDraft[field] : [];
    if (list.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    setPrefsDraft({ ...prefsDraft, [field]: [...list, v] });
    clear('');
  };

  const body = (
    <ScrollView contentContainerStyle={[styles.pad, isDesktop && styles.padDesk]}>
      <ModuleBgSpacer />
      <ModuleHubIntro>
      <View style={styles.hero}>
        <Text style={styles.brand}>AI Matcoach</Text>
        <Text style={styles.heroTitle}>Ukeplanen lager seg selv</Text>
        <Mute>
          Familietilpassede middager, matpakker og handleliste — inspirert av det som fungerer hos matbokser, Mealime og Ollie.
          Oppdater lageret med AI-skanner under Lager.
        </Mute>
      </View>
      </ModuleHubIntro>
        <Text style={styles.weekLabel}>
          Uke {formatWeekRange ? formatWeekRange(weekStart) : dateKey(weekStart)}
        </Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabs}>
        {TABS.map((t) => {
          const tabBtn = (
            <TouchableOpacity
              style={[styles.tab, tab === t.id && styles.tabOn]}
              onPress={() => setTab(t.id)}
              accessibilityRole="button"
              accessibilityLabel={t.label}
            >
              <Ionicons
                name={t.icon}
                size={16}
                color={tab === t.id ? '#fff' : colors.muted}
              />
              <Text style={[styles.tabTxt, tab === t.id && styles.tabTxtOn]}>{t.label}</Text>
            </TouchableOpacity>
          );
          if (t.id === 'prefs') {
            return (
              <HelpTarget key={t.id} id="prefs" onAdvance={() => setTab('prefs')}>
                {tabBtn}
              </HelpTarget>
            );
          }
          return <React.Fragment key={t.id}>{tabBtn}</React.Fragment>;
        })}
      </ScrollView>

      {tab === 'coach' ? (
        <HelpTarget id="content" style={{ width: '100%', alignSelf: 'stretch' }}>
        <View style={styles.section}>
          {busy === 'plan' ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={colors.brand} />
          ) : null}
          {plan ? (
            <>
              <Text style={styles.planHeadline}>{plan.headline}</Text>
              {plan.summary ? <Text style={styles.planSummary}>{plan.summary}</Text> : null}
              <Text style={styles.cost}>
                Est. {plan.estimatedWeeklyCostKr || prefs?.budgetKr || '–'} kr · motor {plan.engine || 'ai'}
              </Text>
              {plan.days?.map((day) => (
                <DayCard
                  key={day.dayIndex}
                  day={enrichSuggestionDay(day, recipePool)}
                  swapping={swapDay === day.dayIndex}
                  onOpen={() => openDayDetail(day)}
                  onSwap={() => onSwap(day.dayIndex)}
                />
              ))}
              <TouchableOpacity
                style={styles.linkBtn}
                onPress={() => setSkipPantry((v) => !v)}
              >
                <Text style={styles.linkTxt}>
                  {skipPantry
                    ? `✓ Trekker fra lager (${shoppingPreview.covered?.length || 0} dekket)`
                    : '○ Ta med alt (ignorer lager)'}
                </Text>
              </TouchableOpacity>
              <Text style={styles.sectionTitle}>Registrer hele uken</Text>
              <Mute>Velg måltidsplan, handleliste — eller begge.</Mute>
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => setBulkToMeals((v) => !v)}
              >
                <Ionicons
                  name={bulkToMeals ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={colors.brand}
                />
                <Text style={styles.checkTitle}>Måltidsplanlegger</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => setBulkToShop((v) => !v)}
              >
                <Ionicons
                  name={bulkToShop ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={colors.brand}
                />
                <Text style={styles.checkTitle}>
                  Handleliste ({shoppingPreview.needed?.length || 0} varer)
                </Text>
              </TouchableOpacity>
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    (busy === 'apply' || (!bulkToMeals && !bulkToShop)) && styles.btnDisabled,
                  ]}
                  onPress={onApplyPlan}
                  disabled={!!busy || (!bulkToMeals && !bulkToShop)}
                >
                  {busy === 'apply' ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={18} color="#fff" />
                      <Text style={styles.primaryBtnTxt}>
                        {bulkToMeals && bulkToShop
                          ? 'Registrer begge'
                          : bulkToMeals
                            ? 'Legg i måltidsplan'
                            : 'Legg i handleliste'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
                {bulkToShop && !bulkToMeals ? null : (
                  <TouchableOpacity
                    style={[styles.secondaryBtn, busy === 'shop' && styles.btnDisabled]}
                    onPress={onPushShopping}
                    disabled={!!busy || !shoppingPreview.needed?.length}
                  >
                    {busy === 'shop' ? (
                      <ActivityIndicator color={colors.brand} />
                    ) : (
                      <>
                        <Ionicons name="cart" size={18} color={colors.brand} />
                        <Text style={styles.secondaryBtnTxt}>Bare handleliste</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
              <TouchableOpacity style={styles.linkBtn} onPress={() => setSubView?.('recipes')}>
                <Text style={styles.linkTxt}>Åpne oppskrifter →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <View style={styles.emptyBox}>
              <Ionicons name="restaurant-outline" size={36} color={colors.muted} />
              <Text style={styles.emptyTitle}>Ingen plan ennå</Text>
              <Mute>Trykk «+ Ny ukeplan» — så får du 7 middager med hvorfor de ble valgt.</Mute>
            </View>
          )}
        </View>
        </HelpTarget>
      ) : null}

      {tab === 'lunch' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Matpakker</Text>
          <Mute>Fem dager med enkle, allergivennlige matpakker til skole og jobb.</Mute>
          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 12 }, busy === 'lunch' && styles.btnDisabled]}
            onPress={onGenerateLunch}
            disabled={!!busy}
          >
            {busy === 'lunch' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="briefcase" size={18} color="#fff" />
                <Text style={styles.primaryBtnTxt}>Lag matpakkeuke</Text>
              </>
            )}
          </TouchableOpacity>
          {lunch?.boxes?.map((box) => (
            <View key={box.dayIndex} style={styles.dayCard}>
              <Text style={styles.dayName}>{box.dayName}</Text>
              <Text style={styles.dayTitle}>{box.emoji} {box.title}</Text>
              <View style={styles.tagRow}>
                {(box.tags || ['Kald']).map((t) => (
                  <View key={t} style={styles.tag}><Text style={styles.tagTxt}>{t}</Text></View>
                ))}
              </View>
              {box.whyChosen ? <Text style={styles.why}>{box.whyChosen}</Text> : null}
              {(box.items || []).map((it) => (
                <Text key={it.name} style={styles.desc}>• {it.name}{it.amount ? ` — ${it.amount}` : ''}</Text>
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {tab === 'prefs' ? (
        <HelpTarget id="content" style={{ width: '100%', alignSelf: 'stretch' }}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Familietilpasset</Text>
          <Mute>Kosthold, allergier, tid og budsjett styrer AI-planen.</Mute>
          {prefsDraft ? (
            <>
              <Text style={styles.label}>Kosthold</Text>
              <View style={styles.chipRow}>
                {MATCOACH_DIETS.map((d) => (
                  <Chip
                    key={d.id}
                    label={d.label}
                    active={prefsDraft.diet === d.id}
                    onPress={() => setPrefsDraft({ ...prefsDraft, diet: d.id })}
                  />
                ))}
              </View>
              <Text style={styles.label}>Mål</Text>
              <View style={styles.chipRow}>
                {MATCOACH_GOAL_OPTIONS.map((g) => {
                  const on = (prefsDraft.goals || []).includes(g.id);
                  return (
                    <Chip
                      key={g.id}
                      label={g.label}
                      active={on}
                      onPress={() => {
                        const goals = new Set(prefsDraft.goals || []);
                        if (on) goals.delete(g.id);
                        else goals.add(g.id);
                        setPrefsDraft({ ...prefsDraft, goals: [...goals] });
                      }}
                    />
                  );
                })}
              </View>
              <Text style={styles.label}>Voksne / barn</Text>
              <View style={styles.numRow}>
                <TextInput
                  style={styles.numInput}
                  keyboardType="number-pad"
                  value={String(prefsDraft.adults)}
                  onChangeText={(t) => setPrefsDraft({ ...prefsDraft, adults: Number(t) || 0 })}
                />
                <Text style={styles.numSep}>voksne</Text>
                <TextInput
                  style={styles.numInput}
                  keyboardType="number-pad"
                  value={String(prefsDraft.children)}
                  onChangeText={(t) => setPrefsDraft({ ...prefsDraft, children: Number(t) || 0 })}
                />
                <Text style={styles.numSep}>barn</Text>
              </View>
              <Text style={styles.label}>Maks minutter · Budsjett (kr/uke)</Text>
              <View style={styles.numRow}>
                <TextInput
                  style={styles.numInput}
                  keyboardType="number-pad"
                  value={String(prefsDraft.maxMinutes)}
                  onChangeText={(t) => setPrefsDraft({ ...prefsDraft, maxMinutes: Number(t) || 30 })}
                />
                <Text style={styles.numSep}>min</Text>
                <TextInput
                  style={[styles.numInput, { minWidth: 88 }]}
                  keyboardType="number-pad"
                  value={String(prefsDraft.budgetKr)}
                  onChangeText={(t) => setPrefsDraft({ ...prefsDraft, budgetKr: Number(t) || 800 })}
                />
                <Text style={styles.numSep}>kr</Text>
              </View>
              <Text style={styles.label}>Allergier</Text>
              <View style={styles.chipRow}>
                {(prefsDraft.allergies || []).map((a) => (
                  <Chip
                    key={a}
                    label={a}
                    active
                    onPress={() => setPrefsDraft({
                      ...prefsDraft,
                      allergies: prefsDraft.allergies.filter((x) => x !== a),
                    })}
                  />
                ))}
              </View>
              <View style={styles.numRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="F.eks. nøtter"
                  placeholderTextColor={colors.muted}
                  value={allergyInput}
                  onChangeText={setAllergyInput}
                  onSubmitEditing={() => addTagValue('allergies', allergyInput, setAllergyInput)}
                />
                <TouchableOpacity
                  style={styles.addSmall}
                  onPress={() => addTagValue('allergies', allergyInput, setAllergyInput)}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              <Text style={styles.label}>Vil ikke ha</Text>
              <View style={styles.chipRow}>
                {(prefsDraft.dislikes || []).map((a) => (
                  <Chip
                    key={a}
                    label={a}
                    active
                    onPress={() => setPrefsDraft({
                      ...prefsDraft,
                      dislikes: prefsDraft.dislikes.filter((x) => x !== a),
                    })}
                  />
                ))}
              </View>
              <View style={styles.numRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  placeholder="F.eks. leverpostei"
                  placeholderTextColor={colors.muted}
                  value={dislikeInput}
                  onChangeText={setDislikeInput}
                  onSubmitEditing={() => addTagValue('dislikes', dislikeInput, setDislikeInput)}
                />
                <TouchableOpacity
                  style={styles.addSmall}
                  onPress={() => addTagValue('dislikes', dislikeInput, setDislikeInput)}
                >
                  <Ionicons name="add" size={20} color="#fff" />
                </TouchableOpacity>
              </View>
              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 16 }]} onPress={onSavePrefs}>
                <Text style={styles.primaryBtnTxt}>Lagre preferanser</Text>
              </TouchableOpacity>
            </>
          ) : <ActivityIndicator color={colors.brand} />}
        </View>
        </HelpTarget>
      ) : null}

      {tab === 'history' ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Historikk</Text>
          {!history.length ? (
            <Mute>Genererte planer og matpakker dukker opp her.</Mute>
          ) : history.map((h) => (
            <TouchableOpacity
              key={h.id}
              style={styles.listRow}
              onPress={() => {
                const planRestored = restorePlanFromHistoryEntry(h);
                const lunchRestored = restoreLunchFromHistoryEntry(h);
                if (planRestored) {
                  const enriched = enrichPlanDays(planRestored, recipePool);
                  setPlan(enriched);
                  setActiveDay(null);
                  setDetailOpen(false);
                  setTab('coach');
                  return;
                }
                if (lunchRestored) {
                  setLunch(lunchRestored);
                  setTab('lunch');
                }
              }}
            >
              <Ionicons
                name={h.kind === 'lunchBoxes' ? 'briefcase-outline' : 'sparkles-outline'}
                size={16}
                color={colors.brand}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.listTxt}>{h.headline || h.kind}</Text>
                {h.summary ? <Text style={styles.desc} numberOfLines={2}>{h.summary}</Text> : null}
                <Text style={styles.meta}>Trykk for å gjenåpne</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.quickLinks}>
        <TouchableOpacity style={styles.quick} onPress={() => setSubView?.('meals')}>
          <Ionicons name="calendar-outline" size={18} color={colors.brand} />
          <Text style={styles.quickTxt}>Måltider</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={() => setSubView?.('recipes')}>
          <Ionicons name="book-outline" size={18} color={colors.brand} />
          <Text style={styles.quickTxt}>Oppskrifter</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={() => setSubView?.('shop')}>
          <Ionicons name="cart-outline" size={18} color={colors.brand} />
          <Text style={styles.quickTxt}>Handleliste</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quick} onPress={() => setSubView?.('pantry')}>
          <Ionicons name="cube-outline" size={18} color={colors.brand} />
          <Text style={styles.quickTxt}>Lager</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );

  if (inShell) {
    return (
      <ModulePageFrame name="matcoach">
        {body}
        <MealDetailModal
          visible={detailOpen}
          day={activeDay}
          prefs={prefs}
          busy={busy === 'day'}
          onClose={() => setDetailOpen(false)}
          onSwap={activeDay != null ? () => onSwap(activeDay.dayIndex) : undefined}
          onRegister={onRegisterDay}
        />
      </ModulePageFrame>
    );
  }

  return (
    <Screen>
      <ModulePageFrame name="matcoach">
        <ModuleHubIntro><Title>AI Matcoach</Title></ModuleHubIntro>
        {body}
        <MealDetailModal
          visible={detailOpen}
          day={activeDay}
          prefs={prefs}
          busy={busy === 'day'}
          onClose={() => setDetailOpen(false)}
          onSwap={activeDay != null ? () => onSwap(activeDay.dayIndex) : undefined}
          onRegister={onRegisterDay}
        />
      </ModulePageFrame>
    </Screen>
  );
}

const styles = StyleSheet.create({
  pad: { padding: 16, paddingBottom: 48 },
  padDesk: { maxWidth: 720, alignSelf: 'center', width: '100%' },
  hero: {
    marginBottom: 16,
    padding: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(37, 99, 235, 0.18)',
  },
  brand: {
    fontSize: 13,
    fontWeight: '400',
    letterSpacing: 0.6,
    color: colors.brand,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '400',
    color: colors.text,
    marginBottom: 8,
  },
  weekLabel: { marginTop: 10, color: colors.muted, fontSize: 13 },
  tabs: { marginBottom: 14, flexGrow: 0 },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card || '#f3f4f6',
    marginRight: 8,
  },
  tabOn: { backgroundColor: colors.brand },
  tabTxt: { color: colors.muted, fontWeight: '400', fontSize: 13 },
  tabTxtOn: { color: '#fff' },
  section: { gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: '400', color: colors.text, marginTop: 4 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 },
  primaryBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.brand,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 15 },
  secondaryBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(37,99,235,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  secondaryBtnTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  btnDisabled: { opacity: 0.6 },
  planHeadline: { fontSize: 20, fontWeight: '400', color: colors.text },
  planSummary: { color: colors.text, opacity: 0.85, marginBottom: 4 },
  cost: { color: colors.muted, marginBottom: 8, fontSize: 13 },
  dayCard: {
    backgroundColor: colors.card || '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  dayCardSelected: {
    borderColor: colors.brand,
    backgroundColor: 'rgba(37,99,235,0.06)',
  },
  detailCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.25)',
  },
  dayTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dayActions: { alignItems: 'center', gap: 6 },
  dayName: { fontSize: 12, fontWeight: '400', color: colors.brand, textTransform: 'uppercase' },
  dayTitle: { fontSize: 16, fontWeight: '400', color: colors.text },
  openHint: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '400',
    color: colors.brand,
  },
  swapBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,99,235,0.1)',
  },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
  meta: { color: colors.muted, fontSize: 12, fontWeight: '400' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  tag: {
    backgroundColor: 'rgba(37,99,235,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  tagTxt: { fontSize: 11, color: colors.brand, fontWeight: '400' },
  why: { marginTop: 8, fontStyle: 'italic', color: colors.text, opacity: 0.8 },
  desc: { marginTop: 4, color: colors.muted, fontSize: 13, lineHeight: 18 },
  instructions: {
    marginTop: 4,
    color: colors.text,
    fontSize: 14,
    lineHeight: 21,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  checkTitle: { fontWeight: '400', color: colors.text, fontSize: 15 },
  checkSub: { color: colors.muted, fontSize: 12, marginTop: 2 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,20,0.45)',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  modalCardDesk: { maxWidth: 560, alignSelf: 'center', width: '100%' },
  modalScroll: { paddingBottom: 28 },
  modalBody: { paddingHorizontal: 16, paddingBottom: 8 },
  heroImage: { width: '100%', height: 200, backgroundColor: '#e8eef8' },
  heroFallback: {
    width: '100%',
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(37,99,235,0.08)',
  },
  modalHeadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingTop: 14,
  },
  modalTitle: { fontSize: 22, fontWeight: '400', color: colors.text },
  modalClose: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f3f4f6',
  },
  emptyBox: {
    alignItems: 'center',
    padding: 28,
    gap: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.03)',
  },
  emptyTitle: { fontWeight: '400', fontSize: 16, color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginVertical: 8,
    color: colors.text,
    backgroundColor: colors.card,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  listTxt: { color: colors.text, fontWeight: '400', flex: 1 },
  label: { marginTop: 12, marginBottom: 6, fontWeight: '400', color: colors.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    backgroundColor: '#eff6ff',
  },
  chipOn: { backgroundColor: colors.brand },
  chipTxt: { color: colors.text, fontWeight: '400', fontSize: 13 },
  chipTxtOn: { color: '#fff' },
  numRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  numInput: {
    minWidth: 56,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.text,
    backgroundColor: colors.card,
    textAlign: 'center',
  },
  numSep: { color: colors.muted },
  addSmall: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkBtn: {
    alignSelf: 'flex-start', marginTop: 8, marginBottom: 12 },
  linkTxt: { color: colors.brand, fontWeight: '400' },
  quickLinks: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 20,
  },
  quick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: colors.card || '#fff',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  quickTxt: { fontWeight: '400', color: colors.text },
});
