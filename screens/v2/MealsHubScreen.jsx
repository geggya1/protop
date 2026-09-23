import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
  ActivityIndicator, Modal, Alert, Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { desktopOverlay, desktopSheet } from '../../src/desktop';
import { Screen, Title, Mute } from '../../components/ui';
import ShellAddButton from '../../components/ShellAddButton';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import {
  listenMeals, createMeal, familyMealHeadcount,
  findMealForSlot, mealsInWeek, formatWeekRange,
} from '../../src/utils/meals';
import {
  dateKey, addDays, startOfWeekMonday, WEEKDAYS_SHORT, isToday,
} from '../../src/utils/dates';
import {
  MEAL_TYPES, RECIPE_CATEGORIES, searchRecipes, NORWEGIAN_RECIPES,
} from '../../src/data/norwegianRecipes';
import {
  listenFamilyRecipes, listenRecipeCatalog, listenHiddenBuiltinRecipeIds,
} from '../../src/utils/familyRecipes';
import {
  listenRecipeRatings, ratingForRecipe, sortRecipesByRating,
} from '../../src/utils/recipeRatings';
import { hasRecipeDisplayImage, getRecipeDisplayImageUrl } from '../../src/utils/recipeImages';
import { listenAccessibleLists } from '../../src/utils/shoppingLists';
import { useShopFamilyIds } from '../../src/hooks/useShopFamilyIds';
import RecipeDetailScreen from './RecipeDetailScreen';
import CreateRecipeScreen from './CreateRecipeScreen';
import RecipeThumb from '../../components/meals/RecipeThumb';
import { StarRatingDisplay } from '../../components/meals/RecipeRatingBlock';
import PostMealPlanConfirm from '../../components/meals/PostMealPlanConfirm';
import { ModulePageFrame, ModuleBgSpacer, ModuleHubIntro } from '../../components/ModulePageBg';
import HelpTarget from '../../components/HelpTarget';
import { useHelpScene } from '../../src/hooks/useHelpScene';

const WEEK_TYPE_COL_W = 56;
const WEEK_DAY_COL_W = 76;

const TABS = [
  { id: 'week', label: 'Ukeplan' },
  { id: 'today', label: 'I dag' },
  { id: 'recipes', label: 'Oppskrifter' },
];

function MealSlotCard({ meal, onPress, onAdd, today }) {
  if (meal) {
    const showImage = hasRecipeDisplayImage(meal);
    return (
      <TouchableOpacity
        style={[styles.slotFilled, today && styles.slotToday]}
        onPress={onPress}
      >
        {showImage ? (
          <RecipeThumb recipe={meal} size={28} style={styles.slotImage} />
        ) : (
          <Text style={styles.slotEmoji}>{meal.emoji || '🍽️'}</Text>
        )}
        <Text style={styles.slotTitle} numberOfLines={2}>{meal.title}</Text>
        {meal.minutes ? (
          <Text style={styles.slotMetaTxt}>{meal.minutes} min</Text>
        ) : null}
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity
      style={[styles.slotEmpty, today && styles.slotTodayEmpty]}
      onPress={onAdd}
    >
      <Ionicons name="add" size={16} color={today ? colors.brand : colors.muted} />
    </TouchableOpacity>
  );
}

export default function MealsHubScreen({ inShell = false }) {
  const navigation = useNavigation();
  const { familyId, isParent, members, uid, families } = useApp();
  const { isDesktop, width: layoutW } = useLayout();
  const weekScrollRef = useRef(null);
  const [meals, setMeals] = useState([]);
  const [customRecipes, setCustomRecipes] = useState([]);
  const [catalogRecipes, setCatalogRecipes] = useState([]);
  const [hiddenBuiltinIds, setHiddenBuiltinIds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [createRecipe, setCreateRecipe] = useState(false);
  const [editRecipe, setEditRecipe] = useState(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [pickSlot, setPickSlot] = useState(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [slotFormOpen, setSlotFormOpen] = useState(false);
  const [addDay, setAddDay] = useState(0);
  const [addTag, setAddTag] = useState('Middag');
  const [shoppingLists, setShoppingLists] = useState([]);
  const [postPlan, setPostPlan] = useState(null);
  const [ratingsMap, setRatingsMap] = useState({});

  useEffect(() => {
    if (!familyId) return undefined;
    return listenMeals(familyId, (data) => {
      setMeals(data);
      setLoading(false);
    });
  }, [familyId]);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenFamilyRecipes(familyId, setCustomRecipes);
  }, [familyId]);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenHiddenBuiltinRecipeIds(familyId, setHiddenBuiltinIds);
  }, [familyId]);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenRecipeRatings(familyId, setRatingsMap);
  }, [familyId]);

  useEffect(() => listenRecipeCatalog(setCatalogRecipes), []);

  const shopPlatformIds = useShopFamilyIds(families, familyId);

  useEffect(() => {
    if (!uid) return undefined;
    return listenAccessibleLists(shopPlatformIds, uid, { platforms: families }, setShoppingLists);
  }, [shopPlatformIds, uid]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const todayColIndex = useMemo(
    () => weekDays.findIndex((d) => isToday(d)),
    [weekDays],
  );

  const weekMeals = useMemo(() => mealsInWeek(meals, weekStart), [meals, weekStart]);
  const plannedCount = weekMeals.length;

  /** Scroll week grid so today's column is visible and emphasized. */
  const scrollWeekToToday = useCallback((animated = true) => {
    if (isDesktop || todayColIndex < 0 || !weekScrollRef.current) return;
    // Approximate visible panel width: screen minus page + card padding.
    const visibleW = Math.max(200, layoutW - 48);
    const dayCenterX = WEEK_TYPE_COL_W + todayColIndex * WEEK_DAY_COL_W + WEEK_DAY_COL_W / 2;
    const x = Math.max(0, dayCenterX - visibleW / 2);
    weekScrollRef.current.scrollTo({ x, animated });
  }, [isDesktop, todayColIndex, layoutW]);

  useEffect(() => {
    if (tab !== 'week' || loading || isDesktop || todayColIndex < 0) return undefined;
    const t = setTimeout(() => scrollWeekToToday(true), 80);
    return () => clearTimeout(t);
  }, [tab, loading, isDesktop, todayColIndex, weekStart, scrollWeekToToday]);

  const filteredRecipes = useMemo(
    () => sortRecipesByRating(searchRecipes({
      query: search,
      category,
      customRecipes,
      catalogRecipes,
      builtinRecipes: NORWEGIAN_RECIPES,
      hiddenBuiltinIds,
    }), ratingsMap),
    [search, category, customRecipes, catalogRecipes, hiddenBuiltinIds, ratingsMap],
  );

  const pickRecipes = useMemo(
    () => sortRecipesByRating(searchRecipes({
      category: 'all',
      tag: pickSlot?.mealType,
      customRecipes,
      catalogRecipes,
      builtinRecipes: NORWEGIAN_RECIPES,
      hiddenBuiltinIds,
    }), ratingsMap),
    [pickSlot, customRecipes, catalogRecipes, hiddenBuiltinIds, ratingsMap],
  );

  const todayMeals = useMemo(() => {
    const k = dateKey(new Date());
    return MEAL_TYPES.map((tag) => ({
      tag,
      meal: findMealForSlot(meals, k, tag),
    }));
  }, [meals]);

  const shiftWeek = (delta) => {
    setWeekStart((prev) => addDays(prev, delta * 7));
  };

  const goThisWeek = () => setWeekStart(startOfWeekMonday(new Date()));

  const openMeal = (meal, extras = {}) => {
    navigation.navigate('MealDetail', { familyId, mealId: meal.id, meal, ...extras });
  };

  const openAddSlot = (dayIndex, mealType) => {
    if (!isParent) {
      Alert.alert('Kun foreldre', 'Kun foreldre kan planlegge måltider.');
      return;
    }
    setPickSlot({ dayIndex, mealType });
    setPickOpen(true);
  };

  const openAddFromTop = () => {
    if (!isParent) {
      Alert.alert('Kun foreldre', 'Kun foreldre kan planlegge måltider.');
      return;
    }
    const todayIdx = weekDays.findIndex((d) => isToday(d));
    setAddDay(todayIdx >= 0 ? todayIdx : 0);
    setAddTag(tab === 'today' ? 'Lunsj' : 'Middag');
    setSlotFormOpen(true);
  };

  const confirmSlotForm = () => {
    setSlotFormOpen(false);
    setPickSlot({ dayIndex: addDay, mealType: addTag });
    setPickOpen(true);
  };

  const planRecipe = useCallback(async (recipe) => {
    if (!pickSlot || !familyId) return;
    const d = weekDays[pickSlot.dayIndex];
    const mealType = pickSlot.mealType;
    const dayIdx = pickSlot.dayIndex;
    try {
      const head = familyMealHeadcount(members);
      const ref = await createMeal(familyId, {
        title: recipe.title,
        dateKey: dateKey(d),
        tag: mealType,
        minutes: recipe.minutes,
        recipeId: recipe.id,
        imageUrl: getRecipeDisplayImageUrl(recipe) || '',
        description: recipe.description,
        emoji: recipe.emoji,
        adults: head.adults,
        children: head.children,
        recipePortions: recipe.portions,
        ingredients: (recipe.ingredients || []).map((i) => ({
          name: i.name,
          amount: i.amount,
          category: 'general',
        })),
      });
      setPickOpen(false);
      setPickSlot(null);
      const plannedMeal = {
        id: ref.id,
        title: recipe.title,
        dateKey: dateKey(d),
        tag: mealType,
        minutes: recipe.minutes,
        adults: head.adults,
        children: head.children,
        ingredients: recipe.ingredients,
        ingredientsForAdults: recipe.portions || 4,
        ingredientsForChildren: 0,
        ingredientsStatus: 'ready',
      };
      const dayLabel = `${WEEKDAYS_SHORT[dayIdx]} ${d.getDate()}.${d.getMonth() + 1}`;
      setPostPlan({
        meal: plannedMeal,
        mealTitle: recipe.title,
        mealTag: mealType,
        dayLabel,
      });
    } catch {
      Alert.alert('Feil', 'Klarte ikke legge til måltidet.');
    }
  }, [pickSlot, familyId, weekDays, members]);

  const dismissPostPlan = useCallback(() => {
    setPostPlan(null);
  }, []);

  const confirmAddIngredients = useCallback((listId) => {
    const meal = postPlan?.meal;
    setPostPlan(null);
    if (!meal) return;
    navigation.navigate('MealDetail', {
      familyId,
      mealId: meal.id,
      meal,
      targetListId: listId || undefined,
      promptAddToList: true,
    });
  }, [postPlan, familyId, navigation]);

  const mealsHubActive = !createRecipe && !editRecipe && !(activeRecipe && !isDesktop);
  const shellMealBtn = useMemo(() => {
    if (!isParent) return null;
    if (tab === 'recipes') {
      return (
        <ShellAddButton
          label="Ny oppskrift"
          onPress={() => setCreateRecipe(true)}
        />
      );
    }
    if (tab === 'week' || tab === 'today') {
      return (
        <ShellAddButton
          label="Legg til"
          accessibilityLabel="Legg til måltid"
          onPress={openAddFromTop}
        />
      );
    }
    return null;
  }, [isDesktop, isParent, tab, openAddFromTop]);
  useShellTitleRight(shellMealBtn, { active: mealsHubActive });

  useHelpScene(createRecipe || editRecipe || (activeRecipe && !isDesktop) ? 'inner' : 'hub', {
    onRetreat: () => {
      setCreateRecipe(false);
      setEditRecipe(null);
      setActiveRecipe(null);
    },
  });

  if (createRecipe || editRecipe) {
    return (
      <CreateRecipeScreen
        recipe={editRecipe}
        onBack={() => { setCreateRecipe(false); setEditRecipe(null); }}
        onSaved={() => { setCreateRecipe(false); setEditRecipe(null); }}
      />
    );
  }

  if (activeRecipe && !isDesktop) {
    return (
      <RecipeDetailScreen
        recipe={activeRecipe}
        weekStart={weekStart}
        onBack={() => setActiveRecipe(null)}
        onEdit={(r) => { setActiveRecipe(null); setEditRecipe(r); }}
      />
    );
  }

  return (
    <Screen>
      <ModulePageFrame name="meals">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ModuleHubIntro>
        {!inShell ? (
          <>
            <Title size={22}>Måltidsplanlegger</Title>
            <Mute style={{ marginBottom: 8 }}>
              Planlegg ukens måltider med norske oppskrifter.
            </Mute>
          </>
        ) : null}
        </ModuleHubIntro>

        <View style={[styles.seg, isDesktop && styles.segDesk]}>
          {TABS.map((t) => (
            <TouchableOpacity
              key={t.id}
              style={[styles.segBtn, isDesktop && styles.segBtnDesk, tab === t.id && styles.segOn]}
              onPress={() => setTab(t.id)}
            >
              <Text style={[styles.segTxt, tab === t.id && styles.segTxtOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
        ) : null}

        {tab === 'week' && !loading ? (
          <>
            <View style={styles.navRow}>
              <TouchableOpacity onPress={() => shiftWeek(-1)} style={[styles.navBtn, isDesktop && styles.navBtnDesk]} hitSlop={8}>
                <Ionicons name="chevron-back" size={18} color={colors.ink} />
              </TouchableOpacity>
              <View style={styles.navCenter}>
                <Text style={[styles.weekRange, isDesktop && styles.weekRangeDesk]}>
                  {formatWeekRange(weekStart)}
                </Text>
                <Text style={styles.weekMeta}>{plannedCount} måltider planlagt</Text>
              </View>
              <TouchableOpacity onPress={() => shiftWeek(1)} style={[styles.navBtn, isDesktop && styles.navBtnDesk]} hitSlop={8}>
                <Ionicons name="chevron-forward" size={18} color={colors.ink} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.thisWeekBtn} onPress={goThisWeek}>
              <Text style={styles.thisWeekTxt}>Denne uken</Text>
            </TouchableOpacity>

            <HelpTarget id="content" style={{ width: '100%', alignSelf: 'stretch' }}>
            <View style={[styles.weekPanel, isDesktop && styles.weekPanelDesk]}>
              {isDesktop ? (
                <View>
                  <View style={styles.weekGridHeader}>
                    <View style={[styles.typeCol, styles.typeColDesk]} />
                    {weekDays.map((d, i) => (
                      <View key={dateKey(d)} style={[styles.dayColDesk, isToday(d) && styles.dayColToday]}>
                        <Text style={[styles.dayLbl, isToday(d) && styles.dayLblToday]}>
                          {WEEKDAYS_SHORT[i].toLowerCase()}.
                        </Text>
                        <Text style={[styles.dayNum, isToday(d) && styles.dayNumToday]}>
                          {d.getDate()}.
                        </Text>
                        {isToday(d) ? <Text style={styles.todayBadge}>I dag</Text> : null}
                      </View>
                    ))}
                  </View>
                  {MEAL_TYPES.map((mealType) => (
                    <View key={mealType} style={styles.weekRow}>
                      <View style={[styles.typeCol, styles.typeColDesk]}>
                        <Text style={styles.typeLbl}>{mealType}</Text>
                      </View>
                      {weekDays.map((d, i) => {
                        const meal = findMealForSlot(meals, dateKey(d), mealType);
                        return (
                          <View
                            key={`${dateKey(d)}-${mealType}`}
                            style={[styles.dayColDesk, isToday(d) && styles.dayColToday]}
                          >
                            <MealSlotCard
                              meal={meal}
                              today={isToday(d)}
                              onPress={() => meal && openMeal(meal)}
                              onAdd={() => openAddSlot(i, mealType)}
                            />
                          </View>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ) : (
                <ScrollView
                  ref={weekScrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  onContentSizeChange={() => scrollWeekToToday(false)}
                >
                  <View>
                    <View style={styles.weekGridHeader}>
                      <View style={[styles.typeCol, { width: WEEK_TYPE_COL_W }]} />
                      {weekDays.map((d, i) => (
                        <View
                          key={dateKey(d)}
                          style={[
                            styles.dayCol,
                            { width: WEEK_DAY_COL_W },
                            isToday(d) && styles.dayColToday,
                          ]}
                        >
                          <Text style={[styles.dayLbl, isToday(d) && styles.dayLblToday]}>
                            {WEEKDAYS_SHORT[i].toLowerCase()}.
                          </Text>
                          <Text style={[styles.dayNum, isToday(d) && styles.dayNumToday]}>
                            {d.getDate()}.
                          </Text>
                          {isToday(d) ? <Text style={styles.todayBadge}>I dag</Text> : null}
                        </View>
                      ))}
                    </View>
                    {MEAL_TYPES.map((mealType) => (
                      <View key={mealType} style={styles.weekRow}>
                        <View style={[styles.typeCol, { width: WEEK_TYPE_COL_W }]}>
                          <Text style={styles.typeLbl}>{mealType}</Text>
                        </View>
                        {weekDays.map((d, i) => {
                          const meal = findMealForSlot(meals, dateKey(d), mealType);
                          return (
                            <View
                              key={`${dateKey(d)}-${mealType}`}
                              style={[
                                styles.dayCol,
                                { width: WEEK_DAY_COL_W },
                                isToday(d) && styles.dayColToday,
                              ]}
                            >
                              <MealSlotCard
                                meal={meal}
                                today={isToday(d)}
                                onPress={() => meal && openMeal(meal)}
                                onAdd={() => openAddSlot(i, mealType)}
                              />
                            </View>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}
            </View>
            </HelpTarget>

            <Mute style={styles.hint}>Trykk en tom rute, eller Legg til øverst, for å planlegge et måltid.</Mute>
          </>
        ) : null}

        {tab === 'today' && !loading ? (
          <View style={[styles.panel, isDesktop && styles.panelDesk]}>
            {todayMeals.map(({ tag, meal }, idx) => (
              <View
                key={tag}
                style={[styles.todayBlock, idx > 0 && styles.todayBlockBorder]}
              >
                <Text style={styles.todayTag}>{tag}</Text>
                {meal ? (
                  <TouchableOpacity style={styles.todayMeal} onPress={() => openMeal(meal)}>
                    {hasRecipeDisplayImage(meal) ? (
                      <RecipeThumb recipe={meal} size={isDesktop ? 32 : 40} />
                    ) : (
                      <Text style={styles.todayEmoji}>{meal.emoji || '🍽️'}</Text>
                    )}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[styles.todayTitle, isDesktop && styles.todayTitleDesk]} numberOfLines={1}>
                        {meal.title}
                      </Text>
                      {meal.minutes ? (
                        <Text style={styles.todayMeta}>{meal.minutes} minutter</Text>
                      ) : null}
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.todayEmpty}
                    onPress={() => openAddSlot(weekDays.findIndex((d) => isToday(d)), tag)}
                  >
                    <Ionicons name="add" size={16} color={colors.brand} />
                    <Text style={styles.todayEmptyTxt}>Legg til {tag.toLowerCase()}</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        ) : null}

        {tab === 'recipes' && !loading ? (
          <>
            <TextInput
              style={[styles.search, isDesktop && styles.searchDesk]}
              placeholder="Søk oppskrifter…"
              value={search}
              onChangeText={setSearch}
            />
            <View style={styles.catRowWrap}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.catScroll}
                contentContainerStyle={styles.catRow}
              >
                {RECIPE_CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    style={[
                      styles.catBtn,
                      isDesktop && styles.catBtnDesk,
                      category === c.id && styles.catBtnOn,
                    ]}
                    onPress={() => setCategory(c.id)}
                  >
                    <Text
                      style={[
                        styles.catTxt,
                        isDesktop && styles.catTxtDesk,
                        category === c.id && styles.catTxtOn,
                      ]}
                      numberOfLines={1}
                    >
                      {c.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View style={[styles.panel, isDesktop && styles.panelDesk]}>
              <Text style={[styles.listSection, isDesktop && styles.listSectionDesk]}>
                {filteredRecipes.length} oppskrift{filteredRecipes.length === 1 ? '' : 'er'}
              </Text>
              {filteredRecipes.length === 0 ? (
                <Text style={styles.emptyInline}>
                  Ingen oppskrifter her. Opprett en egen, eller bytt kategori.
                </Text>
              ) : (
                filteredRecipes.map((r) => {
                  const rating = ratingForRecipe(ratingsMap, r);
                  return (
                  <TouchableOpacity
                    key={r.id}
                    style={[styles.recipeRow, isDesktop && styles.recipeRowDesk]}
                    onPress={() => setActiveRecipe(r)}
                    activeOpacity={0.75}
                  >
                    <RecipeThumb
                      recipe={r}
                      size={isDesktop ? 32 : 40}
                      ratingAvg={rating?.averageRating || 0}
                    />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.recipeTag}>
                          {r.isCustom ? 'Egen oppskrift' : r.tag}
                        </Text>
                        {rating?.averageRating ? (
                          <StarRatingDisplay
                            average={rating.averageRating}
                            count={rating.ratingCount}
                            size={11}
                          />
                        ) : null}
                      </View>
                      <Text
                        style={[styles.recipeTitle, isDesktop && styles.recipeTitleDesk]}
                        numberOfLines={1}
                      >
                        {r.title}
                      </Text>
                      <Text style={styles.recipeMeta}>
                        {r.minutes} min · {r.portions} porsjoner
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                  </TouchableOpacity>
                  );
                })
              )}
            </View>
          </>
        ) : null}

        <ModuleBgSpacer />
      </ScrollView>
      </ModulePageFrame>

      <Modal
        visible={slotFormOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSlotFormOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={() => setSlotFormOpen(false)}
        >
          <Pressable
            style={[styles.modalCard, isDesktop && [desktopSheet, styles.modalCardDesk]]}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, isDesktop && styles.modalTitleDesk]}>Legg til måltid</Text>
            <Text style={styles.modalHint}>Velg dag og måltidstype, deretter oppskrift.</Text>

            <Text style={styles.formLbl}>Dag</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayRow}
            >
              {weekDays.map((d, i) => (
                <TouchableOpacity
                  key={dateKey(d)}
                  style={[styles.dayBtn, addDay === i && styles.dayBtnOn]}
                  onPress={() => setAddDay(i)}
                >
                  <Text style={[styles.dayBtnTxt, addDay === i && styles.dayBtnTxtOn]}>
                    {WEEKDAYS_SHORT[i]}
                  </Text>
                  <Text style={[styles.dayBtnSub, addDay === i && styles.dayBtnTxtOn]}>
                    {d.getDate()}.{d.getMonth() + 1}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.formLbl}>Måltid</Text>
            <View style={styles.tagRow}>
              {MEAL_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tagBtn, addTag === t && styles.tagBtnOn]}
                  onPress={() => setAddTag(t)}
                >
                  <Text style={[styles.tagTxt, addTag === t && styles.tagTxtOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.formActions}>
              <TouchableOpacity style={styles.cancelBtnFull} onPress={() => setSlotFormOpen(false)}>
                <Text style={styles.cancelTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.formContinue} onPress={confirmSlotForm}>
                <Text style={styles.formContinueTxt}>Velg oppskrift</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={pickOpen}
        transparent
        animationType={isDesktop ? 'fade' : 'fade'}
        onRequestClose={() => setPickOpen(false)}
      >
        <Pressable
          style={[styles.modalBackdrop, isDesktop && desktopOverlay]}
          onPress={() => { setPickOpen(false); setPickSlot(null); }}
        >
          <Pressable
            style={[styles.modalCard, isDesktop && [desktopSheet, styles.modalCardDesk]]}
            onPress={() => {}}
          >
            <Text style={[styles.modalTitle, isDesktop && styles.modalTitleDesk]}>Velg oppskrift</Text>
            {pickSlot ? (
              <Text style={styles.modalHint}>
                {MEAL_TYPES.includes(pickSlot.mealType) ? pickSlot.mealType : 'Middag'}
                {' · '}
                {WEEKDAYS_SHORT[pickSlot.dayIndex]} {weekDays[pickSlot.dayIndex]?.getDate()}.
                {weekDays[pickSlot.dayIndex]?.getMonth() + 1}
              </Text>
            ) : null}
            <ScrollView style={{ maxHeight: isDesktop ? 360 : 320 }} showsVerticalScrollIndicator={false}>
              {pickRecipes.map((r) => {
                const rating = ratingForRecipe(ratingsMap, r);
                const highlighted = Number(rating?.averageRating) > 0;
                return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.pickRow, highlighted && styles.pickRowRated]}
                  onPress={() => planRecipe(r)}
                >
                  <RecipeThumb
                    recipe={r}
                    size={36}
                    ratingAvg={rating?.averageRating || 0}
                  />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.pickTitle} numberOfLines={1}>{r.title}</Text>
                    <Text style={styles.pickMeta}>
                      {r.minutes} min
                      {r.isCustom ? ' · Egen' : ''}
                      {highlighted ? ` · ${Number(rating.averageRating).toFixed(1)}★` : ''}
                    </Text>
                  </View>
                  {highlighted ? (
                    <Ionicons name="star" size={16} color="#f59e0b" />
                  ) : null}
                </TouchableOpacity>
                );
              })}
              {!pickRecipes.length ? (
                <Mute style={{ textAlign: 'center', paddingVertical: 20 }}>
                  Ingen oppskrifter for dette måltidet. Opprett en under Oppskrifter.
                </Mute>
              ) : null}
            </ScrollView>
            <TouchableOpacity
              style={styles.cancelBtnFull}
              onPress={() => { setPickOpen(false); setPickSlot(null); }}
            >
              <Text style={styles.cancelTxt}>Avbryt</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {activeRecipe && isDesktop ? (
        <RecipeDetailScreen
          recipe={activeRecipe}
          weekStart={weekStart}
          onBack={() => setActiveRecipe(null)}
          onEdit={(r) => { setActiveRecipe(null); setEditRecipe(r); }}
        />
      ) : null}

      <PostMealPlanConfirm
        visible={!!postPlan}
        mealTitle={postPlan?.mealTitle || ''}
        mealTag={postPlan?.mealTag || 'Middag'}
        dayLabel={postPlan?.dayLabel || ''}
        lists={shoppingLists}
        onDecline={dismissPostPlan}
        onConfirm={confirmAddIngredients}
        onClose={dismissPostPlan}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, zIndex: 1, backgroundColor: 'transparent' },
  body: { flexGrow: 1, padding: 16, gap: 10, paddingBottom: 16 },
  bodyDesk: { padding: 12, gap: 8, paddingBottom: 12 },

  seg: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 4,
  },
  segDesk: { borderRadius: 8, alignSelf: 'flex-start', maxWidth: 360 },
  segBtn: { flex: 1, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, alignItems: 'center' },
  segBtnDesk: { flexGrow: 0, flexBasis: 'auto', minWidth: 96, borderRadius: 6 },
  segOn: { backgroundColor: colors.brand },
  segTxt: { fontWeight: '500', color: colors.ink, fontSize: 12 },
  segTxtOn: { color: '#fff' },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  navBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.card,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.line,
  },
  navBtnDesk: { borderRadius: 7 },
  navCenter: { flex: 1, alignItems: 'center', marginHorizontal: 8 },
  weekRange: { fontWeight: '600', fontSize: 14, color: colors.ink },
  weekRangeDesk: { fontWeight: '500', fontSize: 13 },
  weekMeta: { fontSize: 11, color: colors.muted, fontWeight: '400', marginTop: 1 },
  thisWeekBtn: {
    alignSelf: 'center', paddingVertical: 4, paddingHorizontal: 8, marginBottom: 2,
  },
  thisWeekTxt: { color: colors.brand, fontWeight: '500', fontSize: 12 },

  weekPanel: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 8,
    overflow: 'hidden',
  },
  weekPanelDesk: { borderRadius: 8, padding: 8 },
  weekGridFill: { width: '100%' },
  weekGridHeader: { flexDirection: 'row', marginBottom: 2 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  typeCol: { width: WEEK_TYPE_COL_W, justifyContent: 'center', paddingRight: 4 },
  typeColDesk: { width: 64 },
  dayCol: { width: WEEK_DAY_COL_W, paddingHorizontal: 2, paddingVertical: 2 },
  dayColDesk: { flex: 1, minWidth: 0, paddingHorizontal: 2, paddingVertical: 2 },
  dayColToday: {
    backgroundColor: colors.brandSoft,
    borderRadius: 8,
  },
  typeLbl: { fontSize: 10, fontWeight: '600', color: colors.muted },
  dayLbl: { fontSize: 10, fontWeight: '500', color: colors.muted, textAlign: 'center' },
  dayNum: { fontSize: 12, fontWeight: '600', color: colors.ink, textAlign: 'center' },
  dayLblToday: { color: colors.brand, fontWeight: '600' },
  dayNumToday: { color: colors.brand },
  todayBadge: {
    marginTop: 1, alignSelf: 'center', overflow: 'hidden',
    backgroundColor: colors.brand, color: '#fff',
    fontSize: 8, fontWeight: '600', textAlign: 'center',
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6,
  },

  slotFilled: {
    backgroundColor: colors.card, borderRadius: 8, padding: 6,
    borderWidth: 1, borderColor: colors.line, minHeight: 52,
  },
  slotEmpty: {
    backgroundColor: '#f8fafc', borderRadius: 8, padding: 6,
    borderWidth: 1, borderColor: colors.line, borderStyle: 'dashed',
    minHeight: 52, alignItems: 'center', justifyContent: 'center',
  },
  slotToday: { borderColor: colors.brand, borderWidth: 1.5, backgroundColor: colors.card },
  slotTodayEmpty: { borderColor: colors.brand, backgroundColor: colors.card },
  slotImage: { marginBottom: 2 },
  slotEmoji: { fontSize: 16, marginBottom: 1 },
  slotTitle: { fontSize: 10, fontWeight: '500', color: colors.ink, lineHeight: 13 },
  slotMetaTxt: { fontSize: 9, color: colors.muted, fontWeight: '400', marginTop: 2 },
  hint: { textAlign: 'center', marginTop: 8, fontWeight: '400', fontSize: 12 },

  panel: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
  },
  panelDesk: { borderRadius: 8, padding: 10 },
  listSection: {
    fontWeight: '600',
    fontSize: 12,
    color: colors.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  listSectionDesk: { fontWeight: '500', fontSize: 11, marginBottom: 4 },
  emptyInline: {
    color: colors.muted,
    fontWeight: '400',
    fontSize: 13,
    paddingVertical: 10,
  },

  todayBlock: { paddingVertical: 8 },
  todayBlockBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  todayTag: { fontWeight: '600', fontSize: 12, color: colors.brand, marginBottom: 6 },
  todayMeal: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  todayEmoji: { fontSize: 24 },
  todayTitle: { fontWeight: '600', fontSize: 14, color: colors.ink },
  todayTitleDesk: { fontWeight: '500', fontSize: 13 },
  todayMeta: { fontSize: 11, color: colors.muted, fontWeight: '400', marginTop: 1 },
  todayEmpty: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  todayEmptyTxt: { color: colors.brand, fontWeight: '500', fontSize: 13 },

  search: {
    borderWidth: 1, borderColor: colors.line, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14,
    backgroundColor: colors.card, fontWeight: '400',
  },
  searchDesk: { paddingVertical: 8, borderRadius: 8, fontSize: 13 },
  catRowWrap: {
    flexGrow: 0,
    flexShrink: 0,
    height: 32,
    marginVertical: 2,
  },
  catScroll: {
    flexGrow: 0,
    height: 32,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 0,
    height: 32,
  },
  catBtn: {
    height: 28,
    paddingHorizontal: 10,
    borderRadius: 7,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    flexShrink: 0,
  },
  catBtnDesk: { height: 28, paddingHorizontal: 9, borderRadius: 6 },
  catBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  catTxt: { fontWeight: '500', color: colors.ink, fontSize: 12, lineHeight: 16 },
  catTxtDesk: { fontSize: 12 },
  catTxtOn: { color: '#fff' },

  recipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  recipeRowDesk: { paddingVertical: 8, gap: 8 },
  recipeTag: {
    fontSize: 10, fontWeight: '500', color: colors.brand,
    textTransform: 'uppercase', letterSpacing: 0.3,
  },
  recipeTitle: { fontWeight: '600', fontSize: 14, color: colors.ink, marginTop: 1 },
  recipeTitleDesk: { fontWeight: '500', fontSize: 13 },
  recipeMeta: { fontSize: 11, color: colors.muted, fontWeight: '400', marginTop: 1 },

  deskAddWrap: { marginBottom: 4, alignSelf: 'flex-start' },

  modalBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20,
  },
  modalCard: {
    backgroundColor: colors.card, borderRadius: 14, padding: 16,
    maxWidth: 420, width: '100%', alignSelf: 'center',
  },
  modalCardDesk: { borderRadius: 12, padding: 16 },
  modalTitle: { fontSize: 16, fontWeight: '600', color: colors.ink },
  modalTitleDesk: { fontSize: 15, fontWeight: '500' },
  modalHint: { fontSize: 12, color: colors.muted, fontWeight: '400', marginVertical: 8 },
  formLbl: {
    fontSize: 11, fontWeight: '600', color: colors.muted,
    textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6, marginTop: 4,
  },
  dayRow: { gap: 6, marginBottom: 10, paddingRight: 4 },
  dayBtn: {
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    alignItems: 'center', minWidth: 48, backgroundColor: colors.card,
  },
  dayBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayBtnTxt: { fontWeight: '600', color: colors.brand, fontSize: 12 },
  dayBtnSub: { fontSize: 10, color: colors.muted, fontWeight: '400', marginTop: 1 },
  dayBtnTxtOn: { color: '#fff' },
  tagRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  tagBtn: {
    flex: 1, paddingVertical: 9, borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line,
    alignItems: 'center', backgroundColor: colors.card,
  },
  tagBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tagTxt: { fontWeight: '600', color: colors.brand, fontSize: 12 },
  tagTxtOn: { color: '#fff' },
  formActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  formContinue: {
    backgroundColor: colors.brand, borderRadius: 8,
    paddingVertical: 10, paddingHorizontal: 14,
  },
  formContinueTxt: { color: '#fff', fontWeight: '600', fontSize: 13 },
  pickRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  pickRowRated: {
    backgroundColor: '#fffbeb',
    marginHorizontal: -6,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  pickTitle: { fontWeight: '500', color: colors.ink, fontSize: 14 },
  pickMeta: { fontSize: 11, color: colors.muted, fontWeight: '400', marginTop: 1 },
  cancelBtnFull: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelTxt: { color: colors.muted, fontWeight: '500', fontSize: 14 },
});
