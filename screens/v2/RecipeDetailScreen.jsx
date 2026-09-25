import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, Modal, Alert, ActivityIndicator, Image,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { colors, radius, useLayout } from '../../src/theme';
import { Screen } from '../../components/ui';
import CompactBackLink from '../../components/CompactBackLink';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import ConfirmDialog from '../../components/ConfirmDialog';
import DesktopFormShell from '../../components/DesktopFormShell';
import PostMealPlanConfirm from '../../components/meals/PostMealPlanConfirm';
import RecipeRatingBlock, { StarRatingDisplay } from '../../components/meals/RecipeRatingBlock';
import { useApp } from '../../src/context/AppContext';
import { createMeal, familyMealHeadcount, scaleIngredients } from '../../src/utils/meals';
import {
  deleteFamilyRecipe, hideBuiltinRecipe,
} from '../../src/utils/familyRecipes';
import { getRecipeDisplayImageUrl } from '../../src/utils/recipeImages';
import {
  listenRecipeRatings, recipeRatingKey, ratingForRecipe, upsertRecipeRating,
} from '../../src/utils/recipeRatings';
import { listenAccessibleLists } from '../../src/utils/shoppingLists';
import { useShopFamilyIds } from '../../src/hooks/useShopFamilyIds';
import { MEAL_TYPES, RECIPE_CATEGORIES } from '../../src/data/norwegianRecipes';
import { dateKey, addDays, startOfWeekMonday, WEEKDAYS_SHORT } from '../../src/utils/dates';
import PortionSteppers from '../../components/meals/PortionSteppers';

export default function RecipeDetailScreen({ recipe, onBack, weekStart, onEdit }) {
  const navigation = useNavigation();
  const { isDesktop } = useLayout();
  const { familyId, isParent, members, uid, families } = useApp();
  const familyCounts = useMemo(() => familyMealHeadcount(members), [members]);
  const myName = members.find((m) => m.uid === uid)?.name || '';
  const [adults, setAdults] = useState(familyCounts.adults);
  const [childrenCount, setChildrenCount] = useState(familyCounts.children);
  const countsTouched = useRef(false);
  const [ratingsMap, setRatingsMap] = useState({});
  const [myStars, setMyStars] = useState(0);
  const [commentDraft, setCommentDraft] = useState('');
  const [savingRating, setSavingRating] = useState(false);

  useEffect(() => {
    if (countsTouched.current) return;
    setAdults(familyCounts.adults);
    setChildrenCount(familyCounts.children);
  }, [familyCounts]);
  const [planOpen, setPlanOpen] = useState(false);
  const [planDay, setPlanDay] = useState(0);
  const [planTag, setPlanTag] = useState(recipe?.tag || 'Middag');
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [shoppingLists, setShoppingLists] = useState([]);
  const [postPlan, setPostPlan] = useState(null);

  const shopPlatformIds = useShopFamilyIds(families, familyId);

  useEffect(() => {
    if (!uid) return undefined;
    return listenAccessibleLists(shopPlatformIds, uid, { platforms: families }, setShoppingLists);
  }, [shopPlatformIds, uid]);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenRecipeRatings(familyId, setRatingsMap);
  }, [familyId]);

  useEffect(() => {
    if (!recipe) return;
    const rating = ratingForRecipe(ratingsMap, recipe);
    const mine = rating?.entries?.[uid];
    setMyStars(Number(mine?.stars) || 0);
    setCommentDraft(mine?.comment || '');
  }, [ratingsMap, recipe, uid]);

  const scaledIngredients = useMemo(
    () => scaleIngredients(
      recipe?.ingredients || [],
      recipe?.portions || 4,
      0,
      adults,
      childrenCount,
    ),
    [recipe?.ingredients, recipe?.portions, adults, childrenCount],
  );

  if (!recipe) return null;

  const isCustom = !!recipe.isCustom;
  const isBuiltin = !isCustom;
  const canManage = true;
  const heroUrl = getRecipeDisplayImageUrl(recipe);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart || startOfWeekMonday(new Date()), i));
  const rating = ratingForRecipe(ratingsMap, recipe);
  const categoryLabel = RECIPE_CATEGORIES.find((c) => c.id === recipe.category)?.label
    || (isCustom ? 'Mine oppskrifter' : recipe.tag);

  const openExternal = async (url) => {
    const u = String(url || '').trim();
    if (!u) return;
    try {
      const can = await Linking.canOpenURL(u);
      if (can) await Linking.openURL(u);
      else Alert.alert('Lenke', 'Klarte ikke åpne lenken.');
    } catch {
      Alert.alert('Lenke', 'Klarte ikke åpne lenken.');
    }
  };

  const saveRating = async () => {
    if (!familyId || !uid || !myStars) return;
    setSavingRating(true);
    try {
      await upsertRecipeRating(familyId, recipeRatingKey(recipe), {
        uid,
        userName: myName,
        stars: myStars,
        comment: commentDraft,
      });
    } catch {
      Alert.alert('Feil', 'Klarte ikke lagre vurderingen.');
    } finally {
      setSavingRating(false);
    }
  };

  const changeAdults = (n) => {
    const next = Math.max(0, n);
    if (next === 0 && childrenCount === 0) return;
    countsTouched.current = true;
    setAdults(next);
  };
  const changeChildren = (n) => {
    const next = Math.max(0, n);
    if (next === 0 && adults === 0) return;
    countsTouched.current = true;
    setChildrenCount(next);
  };

  const addToPlan = async () => {
    if (!familyId || !isParent) {
      Alert.alert('Kun foreldre', 'Kun foreldre kan legge inn måltider.');
      return;
    }
    setSaving(true);
    try {
      const d = weekDays[planDay];
      const ref = await createMeal(familyId, {
        title: recipe.title,
        dateKey: dateKey(d),
        tag: planTag,
        minutes: recipe.minutes,
        recipeId: recipe.id,
        imageUrl: getRecipeDisplayImageUrl(recipe) || '',
        description: recipe.description,
        emoji: recipe.emoji,
        adults,
        children: childrenCount,
        portionCustomized: true,
        recipePortions: recipe.portions,
        ingredients: (recipe.ingredients || []).map((i) => ({
          name: i.name,
          amount: i.amount,
          category: 'general',
        })),
      });
      setPlanOpen(false);
      const plannedMeal = {
        id: ref.id,
        title: recipe.title,
        dateKey: dateKey(d),
        tag: planTag,
        minutes: recipe.minutes,
        adults,
        children: childrenCount,
        portionCustomized: true,
        ingredients: recipe.ingredients,
        ingredientsForAdults: recipe.portions || 4,
        ingredientsForChildren: 0,
        ingredientsStatus: 'ready',
      };
      const dayLabel = `${WEEKDAYS_SHORT[planDay]} ${d.getDate()}.${d.getMonth() + 1}`;
      setPostPlan({
        meal: plannedMeal,
        mealTitle: recipe.title,
        mealTag: planTag,
        dayLabel,
      });
    } catch {
      Alert.alert('Feil', 'Klarte ikke legge til i ukeplanen.');
    } finally {
      setSaving(false);
    }
  };

  const dismissPostPlan = () => setPostPlan(null);

  const confirmAddIngredients = (listId) => {
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
  };

  const removeRecipe = async () => {
    if (!familyId || !recipe.id) return;
    setConfirmDelete(false);
    setDeleting(true);
    try {
      if (isCustom) {
        await deleteFamilyRecipe(familyId, recipe.id);
      } else {
        await hideBuiltinRecipe(familyId, recipe.id);
      }
      onBack?.();
    } catch {
      Alert.alert('Feil', 'Klarte ikke slette oppskriften.');
    } finally {
      setDeleting(false);
    }
  };

  const actionButtons = isParent ? (
    <>
      <TouchableOpacity
        style={[styles.planBtn, isDesktop && styles.planBtnDesk]}
        onPress={() => setPlanOpen(true)}
      >
        <Ionicons name="calendar-outline" size={isDesktop ? 18 : 20} color="#fff" />
        <Text style={[styles.planBtnTxt, isDesktop && styles.planBtnTxtDesk]}>Legg i ukeplan</Text>
      </TouchableOpacity>

      {canManage ? (
        <View style={[styles.customActions, isDesktop && styles.customActionsDesk]}>
          <TouchableOpacity style={[styles.editBtn, isDesktop && styles.editBtnDesk]} onPress={() => onEdit?.(recipe)}>
            <Ionicons name="pencil-outline" size={18} color={colors.brand} />
            <Text style={styles.editBtnTxt}>{isBuiltin ? 'Tilpass' : 'Rediger'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.deleteBtn, isDesktop && styles.deleteBtnDesk]} onPress={() => setConfirmDelete(true)}>
            <Ionicons name="trash-outline" size={18} color={colors.danger} />
            <Text style={styles.deleteBtnTxt}>{isBuiltin ? 'Fjern forslag' : 'Slett'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </>
  ) : null;

  const heroBlock = heroUrl ? (
    <Image
      source={{ uri: heroUrl }}
      style={[styles.heroImage, isDesktop && styles.heroImageDesk]}
      resizeMode="cover"
    />
  ) : (
    <View style={[styles.hero, isDesktop && styles.heroDesk, { backgroundColor: `${colors.brand}18` }]}>
      <Text style={[styles.heroEmoji, isDesktop && styles.heroEmojiDesk]}>{recipe.emoji || '🍽️'}</Text>
    </View>
  );

  const detailBody = (
    <>
      {heroBlock}

      {!isDesktop ? (
        <Text style={styles.title}>{recipe.title}</Text>
      ) : null}

      <View style={[styles.badgeRow, isDesktop && styles.badgeRowDesk]}>
        {isCustom ? (
          <View style={styles.ownBadge}>
            <Ionicons name="person" size={12} color="#fff" />
            <Text style={styles.ownBadgeTxt}>Egen oppskrift</Text>
          </View>
        ) : (
          <View style={styles.systemBadge}>
            <Ionicons name="library-outline" size={12} color={colors.brand} />
            <Text style={styles.systemBadgeTxt}>Forslag</Text>
          </View>
        )}
        {rating?.averageRating ? (
          <StarRatingDisplay average={rating.averageRating} count={rating.ratingCount} />
        ) : null}
      </View>

      <View style={[styles.pills, isDesktop && styles.pillsDesk]}>
        <View style={styles.pill}>
          <Ionicons name="time-outline" size={14} color={colors.brand} />
          <Text style={styles.pillTxt}>{recipe.minutes} min</Text>
        </View>
        <View style={styles.pill}>
          <Ionicons name="people-outline" size={14} color={colors.brand} />
          <Text style={styles.pillTxt}>Oppskrift: {recipe.portions} porsjoner</Text>
        </View>
        <View style={styles.pill}>
          <Ionicons name="restaurant-outline" size={14} color={colors.brand} />
          <Text style={styles.pillTxt}>{recipe.tag}</Text>
        </View>
      </View>

      <View style={[styles.detailGrid, isDesktop && styles.detailGridDesk]}>
        <View style={styles.detailBox}>
          <Text style={styles.detailLbl}>Forberedelse</Text>
          <Text style={styles.detailVal}>{recipe.prepMinutes || 0} min</Text>
        </View>
        <View style={styles.detailBox}>
          <Text style={styles.detailLbl}>Tilberedning</Text>
          <Text style={styles.detailVal}>{recipe.cookMinutes || recipe.minutes} min</Text>
        </View>
        <View style={styles.detailBox}>
          <Text style={styles.detailLbl}>Kategori</Text>
          <Text style={styles.detailVal} numberOfLines={1}>{categoryLabel}</Text>
        </View>
      </View>

      {recipe.description ? (
        <View style={[styles.card, isDesktop && styles.cardDesk]}>
          <Text style={[styles.cardTitle, isDesktop && styles.cardTitleDesk]}>Beskrivelse</Text>
          <Text style={[styles.desc, isDesktop && styles.descDesk]}>{recipe.description}</Text>
        </View>
      ) : null}

      {(recipe.sourceUrl || recipe.videoUrl) ? (
        <View style={[styles.card, isDesktop && styles.cardDesk]}>
          <Text style={[styles.cardTitle, isDesktop && styles.cardTitleDesk]}>Kilder</Text>
          {recipe.sourceUrl ? (
            <TouchableOpacity style={styles.linkRow} onPress={() => openExternal(recipe.sourceUrl)}>
              <Ionicons name="link-outline" size={18} color={colors.brand} />
              <Text style={styles.linkTxt} numberOfLines={1}>Åpne original oppskrift</Text>
            </TouchableOpacity>
          ) : null}
          {recipe.videoUrl ? (
            <TouchableOpacity style={styles.linkRow} onPress={() => openExternal(recipe.videoUrl)}>
              <Ionicons name="play-circle-outline" size={18} color={colors.brand} />
              <Text style={styles.linkTxt} numberOfLines={1}>Se video</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={{ marginBottom: isDesktop ? 8 : 12 }}>
        <PortionSteppers
          adults={adults}
          childrenCount={childrenCount}
          onChangeAdults={changeAdults}
          onChangeChildren={changeChildren}
          hint={`Oppskriften er for ${recipe.portions} porsjoner. Velg hvem som skal spise, så oppdateres mengdene.`}
        />
      </View>

      <View style={[styles.card, isDesktop && styles.cardDesk]}>
        <Text style={[styles.cardTitle, isDesktop && styles.cardTitleDesk]}>Ingredienser</Text>
        {scaledIngredients.map((ing, i) => (
          <View key={`${ing.name}-${i}`} style={styles.ingRow}>
            <Text style={[styles.ingName, isDesktop && styles.ingNameDesk]}>{ing.name}</Text>
            {ing.amount ? <Text style={styles.ingAmt}>{ing.amount}</Text> : null}
          </View>
        ))}
      </View>

      {recipe.instructions ? (
        <View style={[styles.card, isDesktop && styles.cardDesk]}>
          <Text style={[styles.cardTitle, isDesktop && styles.cardTitleDesk]}>Slik gjør du</Text>
          <Text style={[styles.desc, isDesktop && styles.descDesk]}>{recipe.instructions}</Text>
        </View>
      ) : null}

      <RecipeRatingBlock
        average={rating?.averageRating || 0}
        count={rating?.ratingCount || 0}
        myStars={myStars}
        commentDraft={commentDraft}
        onCommentChange={setCommentDraft}
        onStarsChange={setMyStars}
        onSave={saveRating}
        saving={savingRating}
        entries={rating?.entries || {}}
        canRate={!!uid}
      />

      {!isDesktop ? actionButtons : null}
      {!isDesktop ? <View style={{ height: 40 }} /> : null}
    </>
  );

  const dialogs = (
    <>
      <Modal visible={planOpen} transparent animationType="fade" onRequestClose={() => setPlanOpen(false)}>
        <View style={[styles.modalBackdrop, isDesktop && styles.modalBackdropDesk]}>
          <View style={[styles.modalCard, isDesktop && styles.modalCardDesk]}>
            <Text style={styles.modalTitle}>Legg i ukeplan</Text>
            <Text style={styles.modalHint}>Velg dag og måltid</Text>

            <Text style={styles.lbl}>Dag</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
              {weekDays.map((d, i) => (
                <TouchableOpacity
                  key={dateKey(d)}
                  style={[styles.dayBtn, planDay === i && styles.dayBtnOn]}
                  onPress={() => setPlanDay(i)}
                >
                  <Text style={[styles.dayBtnTxt, planDay === i && styles.dayBtnTxtOn]}>
                    {WEEKDAYS_SHORT[i]}
                  </Text>
                  <Text style={[styles.dayBtnSub, planDay === i && styles.dayBtnTxtOn]}>
                    {d.getDate()}.{d.getMonth() + 1}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.lbl}>Måltid</Text>
            <View style={styles.tagRow}>
              {MEAL_TYPES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.tagBtn, planTag === t && styles.tagBtnOn]}
                  onPress={() => setPlanTag(t)}
                >
                  <Text style={[styles.tagTxt, planTag === t && styles.tagTxtOn]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setPlanOpen(false)}>
                <Text style={styles.cancelTxt}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={addToPlan} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnTxt}>Legg til</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        visible={confirmDelete}
        title={isBuiltin ? 'Fjern forslag' : 'Slett oppskrift'}
        message={
          isBuiltin
            ? `Vil du skjule «${recipe.title}» fra familiens forslag? Du kan fortsatt legge til egne oppskrifter.`
            : `Vil du slette «${recipe.title}»?`
        }
        confirmText={isBuiltin ? 'Fjern' : 'Slett'}
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={removeRecipe}
      />

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

      {deleting ? (
        <View style={styles.deletingOverlay}>
          <ActivityIndicator color="#fff" size="large" />
        </View>
      ) : null}
    </>
  );

  if (isDesktop) {
    return (
      <>
        <DesktopFormShell
          visible
          title={recipe.title}
          onClose={onBack}
          width={620}
          footer={actionButtons}
        >
          {detailBody}
        </DesktopFormShell>
        {dialogs}
      </>
    );
  }

  return (
    <Screen>
      <EdgeSwipeBack onBack={onBack}>
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <CompactBackLink onPress={onBack} label="Oppskrifter" />
          {detailBody}
        </ScrollView>
      </EdgeSwipeBack>
      {dialogs}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 40 },
  hero: {
    height: 180, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  heroDesk: {
    height: undefined,
    aspectRatio: 16 / 9,
    maxHeight: 220,
    marginBottom: 12,
    borderRadius: radius.md,
  },
  heroImage: {
    width: '100%', height: 200, borderRadius: radius.lg, marginBottom: 16, backgroundColor: '#f1f5f9',
  },
  heroImageDesk: {
    height: undefined,
    aspectRatio: 16 / 9,
    maxHeight: 220,
    borderRadius: radius.md,
    marginBottom: 12,
  },
  heroEmoji: { fontSize: 64 },
  heroEmojiDesk: { fontSize: 48 },
  title: { fontSize: 26, fontWeight: '400', color: colors.ink, marginBottom: 10 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' },
  badgeRowDesk: { marginBottom: 8 },
  ownBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.brand, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
  },
  ownBadgeTxt: { color: '#fff', fontWeight: '400', fontSize: 12 },
  systemBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#eef6ff', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14,
  },
  systemBadgeTxt: { color: colors.brand, fontWeight: '400', fontSize: 12 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pillsDesk: { marginBottom: 12, gap: 6 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#eef6ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20,
  },
  pillTxt: { fontWeight: '400', fontSize: 12, color: colors.brand },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8,
  },
  linkTxt: { color: colors.brand, fontWeight: '400', flex: 1 },
  detailGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  detailGridDesk: { marginBottom: 12, gap: 6 },
  detailBox: {
    flex: 1, backgroundColor: colors.card, borderRadius: radius.md, padding: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  detailLbl: { fontSize: 10, fontWeight: '400', color: colors.muted, textTransform: 'uppercase', marginBottom: 4 },
  detailVal: { fontWeight: '400', color: colors.ink, fontSize: 14 },
  card: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: 16,
    borderWidth: 1, borderColor: colors.line, marginBottom: 12,
  },
  cardDesk: {
    padding: 12,
    marginBottom: 8,
    borderRadius: radius.md,
  },
  cardTitle: { fontWeight: '400', fontSize: 16, color: colors.ink, marginBottom: 10 },
  cardTitleDesk: { fontSize: 14, marginBottom: 8 },
  desc: { fontSize: 15, lineHeight: 22, color: colors.ink, fontWeight: '400' },
  descDesk: { fontSize: 14, lineHeight: 20 },
  ingRow: {
    flexDirection: 'row', justifyContent: 'space-between', gap: 12,
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line,
  },
  ingName: { fontWeight: '400', color: colors.ink, flex: 1 },
  ingNameDesk: { fontSize: 14 },
  ingAmt: { color: colors.muted, fontWeight: '400', fontSize: 13, flexShrink: 0 },
  planBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 14, marginTop: 8,
  },
  planBtnDesk: {
    marginTop: 0,
    paddingVertical: 11,
    borderRadius: 8,
  },
  planBtnTxt: { color: '#fff', fontWeight: '400', fontSize: 16 },
  planBtnTxtDesk: { fontSize: 14 },
  customActions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  customActionsDesk: { marginTop: 8, gap: 8 },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.brand, borderRadius: radius.md, paddingVertical: 12,
  },
  editBtnDesk: { paddingVertical: 9, borderRadius: 8 },
  editBtnTxt: { color: colors.brand, fontWeight: '400', fontSize: 13 },
  deleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, paddingVertical: 12,
  },
  deleteBtnDesk: { paddingVertical: 9, borderRadius: 8 },
  deleteBtnTxt: { color: colors.danger, fontWeight: '400', fontSize: 13 },
  deletingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 20 },
  modalBackdropDesk: { justifyContent: 'center', alignItems: 'center' },
  modalCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 20, maxWidth: 420, width: '100%', alignSelf: 'center' },
  modalCardDesk: { maxWidth: 400 },
  modalTitle: { fontSize: 20, fontWeight: '400', color: colors.ink },
  modalHint: { fontSize: 13, color: colors.muted, fontWeight: '400', marginBottom: 14, marginTop: 4 },
  lbl: { fontSize: 12, fontWeight: '400', color: colors.muted, marginBottom: 8, textTransform: 'uppercase' },
  dayRow: { gap: 8, marginBottom: 14 },
  dayBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center', minWidth: 52,
  },
  dayBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  dayBtnTxt: { fontWeight: '400', color: colors.brand, fontSize: 13 },
  dayBtnSub: { fontSize: 11, color: colors.muted, fontWeight: '400', marginTop: 2 },
  dayBtnTxtOn: { color: '#fff' },
  tagRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  tagBtn: {
    flex: 1, paddingVertical: 10, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.line, alignItems: 'center',
  },
  tagBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tagTxt: { fontWeight: '400', color: colors.brand, fontSize: 13 },
  tagTxtOn: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end' },
  cancelBtn: {
    alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 16 },
  cancelTxt: { color: colors.muted, fontWeight: '400' },
  saveBtn: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 20, minWidth: 100, alignItems: 'center',
  },
  saveBtnTxt: { color: '#fff', fontWeight: '400' },
});
