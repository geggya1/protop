import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import CompactBackLink from '../../components/CompactBackLink';
import EdgeSwipeBack from '../../components/EdgeSwipeBack';
import ShellHeader from '../../components/ShellHeader';
import ConfirmDialog from '../../components/ConfirmDialog';
import MealShoppingListSheet from '../../components/meals/MealShoppingListSheet';
import { Screen } from '../../components/ui';
import { colors } from '../../src/theme';
import { useApp } from '../../src/context/AppContext';
import {
  listenMeal, deleteMeal, generateMealIngredients, updateMeal,
  formatMealPortions, ingredientsByCategory, familyMealHeadcount, scaleIngredients,
  mergeIngredientsIntoShopping,
} from '../../src/utils/meals';
import {
  listenAccessibleLists, addListItems, createList, scopeFromList,
  fetchListItems, updateListItem,
} from '../../src/utils/shoppingLists';
import { useShopFamilyIds } from '../../src/hooks/useShopFamilyIds';
import {
  listenPantry, subtractPantryFromCreates, applyPantryUpdates,
} from '../../src/utils/familyPantry';

import { formatMealDateLabel } from '../../src/utils/dates';
import PortionSteppers from '../../components/meals/PortionSteppers';

export default function MealDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const {
    familyId,
    mealId,
    meal: initial,
    targetListId: initialTargetListId,
    promptAddToList = false,
  } = route.params || {};
  const { uid, members, families, isParent, requestShellTab } = useApp();
  const [meal, setMeal] = useState(initial || null);
  const familyCounts = useMemo(() => familyMealHeadcount(members), [members]);
  const [adults, setAdults] = useState(
    () => (initial?.adults != null ? Number(initial.adults) : familyCounts.adults),
  );
  const [childrenCount, setChildrenCount] = useState(
    () => (initial?.children != null ? Number(initial.children) : familyCounts.children),
  );
  const persistTimer = React.useRef(null);
  const [generating, setGenerating] = useState(false);
  const [addingList, setAddingList] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lists, setLists] = useState([]);
  const [selectedListId, setSelectedListId] = useState(initialTargetListId || null);
  const [notice, setNotice] = useState(null);
  const [imported, setImported] = useState(false);
  const [showAddHint] = useState(!!promptAddToList);
  const [listOpen, setListOpen] = useState(!!promptAddToList);
  const [pantryItems, setPantryItems] = useState([]);

  const shopPlatformIds = useShopFamilyIds(families, familyId);
  const generateAttemptedRef = React.useRef(null);
  const noticeRef = React.useRef(null);
  noticeRef.current = notice;

  const dismissNotice = useCallback(() => {
    const n = noticeRef.current;
    noticeRef.current = null;
    setNotice(null);
    n?.onConfirm?.();
  }, []);

  const goHome = useCallback(() => {
    navigation.navigate('Home');
  }, [navigation]);

  useEffect(() => {
    if (!familyId || !mealId) return undefined;
    return listenMeal(familyId, mealId, setMeal);
  }, [familyId, mealId]);

  useEffect(() => {
    if (!familyId) return undefined;
    return listenPantry(familyId, setPantryItems);
  }, [familyId]);

  const initedMealId = React.useRef(null);
  useEffect(() => {
    if (!meal?.id || initedMealId.current === meal.id) return;
    initedMealId.current = meal.id;
    if (meal.portionCustomized) {
      setAdults(Number(meal.adults) || 0);
      setChildrenCount(Number(meal.children) || 0);
    } else {
      setAdults(familyCounts.adults);
      setChildrenCount(familyCounts.children);
    }
  }, [meal?.id, meal?.adults, meal?.children, familyCounts]);

  useEffect(() => {
    if (!uid) return undefined;
    return listenAccessibleLists(shopPlatformIds, uid, { platforms: families }, setLists);
  }, [shopPlatformIds, uid]);

  useEffect(() => {
    if (!lists.length) return;
    setSelectedListId((prev) => {
      if (prev && lists.some((l) => l.id === prev)) return prev;
      if (initialTargetListId && lists.some((l) => l.id === initialTargetListId)) {
        return initialTargetListId;
      }
      if (lists.length === 1) return lists[0].id;
      return prev || null;
    });
  }, [lists, initialTargetListId]);

  const selectedList = useMemo(
    () => lists.find((l) => l.id === selectedListId) || null,
    [lists, selectedListId],
  );

  const persistPortions = useCallback((nextAdults, nextChildren) => {
    if (!familyId || !meal?.id) return;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      updateMeal(familyId, meal.id, {
        adults: nextAdults,
        children: nextChildren,
        portionCustomized: true,
      }).catch(() => {});
    }, 350);
  }, [familyId, meal?.id]);

  useEffect(() => () => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
  }, []);

  const changeAdults = useCallback((n) => {
    const next = Math.max(0, n);
    if (next === 0 && childrenCount === 0) return;
    setAdults(next);
    persistPortions(next, childrenCount);
  }, [childrenCount, persistPortions]);

  const changeChildren = useCallback((n) => {
    const next = Math.max(0, n);
    if (next === 0 && adults === 0) return;
    setChildrenCount(next);
    persistPortions(adults, next);
  }, [adults, persistPortions]);

  const scaledIngredients = useMemo(() => {
    const list = meal?.ingredients || [];
    const fromA = meal?.ingredientsForAdults != null ? meal.ingredientsForAdults : (meal?.adults ?? 2);
    const fromC = meal?.ingredientsForChildren != null ? meal.ingredientsForChildren : (meal?.children ?? 0);
    return scaleIngredients(list, fromA, fromC, adults, childrenCount);
  }, [meal?.ingredients, meal?.ingredientsForAdults, meal?.ingredientsForChildren, meal?.adults, meal?.children, adults, childrenCount]);

  const runGenerate = useCallback(async () => {
    if (!familyId || !meal?.id) return;
    setGenerating(true);
    try {
      await updateMeal(familyId, meal.id, { adults, children: childrenCount });
      await generateMealIngredients(familyId, { ...meal, adults, children: childrenCount });
    } catch (e) {
      await updateMeal(familyId, meal.id, { ingredientsStatus: 'error' }).catch(() => {});
      Alert.alert('Feil', e?.message || 'Klarte ikke generere handleliste.');
    } finally {
      setGenerating(false);
    }
  }, [familyId, meal, adults, childrenCount]);

  useEffect(() => {
    if (!meal || !isParent) return;
    if (meal.ingredientsStatus !== 'pending') return;
    if (meal.ingredients?.length) return;
    if (generateAttemptedRef.current === meal.id) return;
    generateAttemptedRef.current = meal.id;
    runGenerate();
  }, [meal?.id, meal?.ingredientsStatus, isParent, runGenerate]);

  const groups = useMemo(
    () => ingredientsByCategory(scaledIngredients),
    [scaledIngredients],
  );

  const addAllToShoppingList = useCallback(async () => {
    if (!familyId || addingList || imported) return;
    if (!uid) {
      setNotice({ title: 'Feil', message: 'Du må være innlogget for å legge varer i handlelisten.' });
      return;
    }
    if (!scaledIngredients.length) {
      setNotice({
        title: 'Ingen varer',
        message: 'Det er ingen ingredienser å legge i handlelisten ennå.',
      });
      return;
    }
    if (lists.length > 1 && !selectedList) {
      setNotice({
        title: 'Velg handleliste',
        message: 'Velg hvilken handleliste ingrediensene skal legges i.',
      });
      return;
    }

    setAddingList(true);
    try {
      let list = selectedList || lists[0];
      if (!list) {
        const ref = await createList(
          familyId,
          uid,
          'Handleliste',
          members.find((m) => m.uid === uid)?.name || '',
        );
        list = {
          id: ref.id,
          name: 'Handleliste',
          storage: 'personal',
          personal: true,
          ownerUid: uid,
          createdBy: uid,
          memberIds: [uid],
        };
        setSelectedListId(ref.id);
      }
      const scope = scopeFromList(list, { familyId, uid });
      const existing = await fetchListItems(scope);
      const { updates, creates } = mergeIngredientsIntoShopping(
        existing,
        scaledIngredients,
        {
          addedBy: uid || null,
          addedByName: members.find((m) => m.uid === uid)?.name || '',
          mealId: meal?.id || mealId || null,
          mealTitle: meal?.title || '',
          mealDateKey: meal?.dateKey || '',
        },
      );
      const { creates: filteredCreates, pantryUpdates } = subtractPantryFromCreates(
        creates,
        pantryItems,
      );
      for (const patch of updates) {
        const { id, ...rest } = patch;
        await updateListItem(scope, id, rest);
      }
      if (filteredCreates.length) await addListItems(scope, filteredCreates);
      if (pantryUpdates.length) await applyPantryUpdates(familyId, pantryUpdates);
      setImported(true);
      setListOpen(false);
      const listId = list.id;
      const listName = list.name;
      const changed = updates.length + filteredCreates.length;
      const skipped = creates.length - filteredCreates.length;
      setNotice({
        title: 'Importert til handlelisten',
        message: `${changed} varer er oppdatert/lagt i «${listName}» (${formatMealPortions({ adults, children: childrenCount })}).${
          skipped > 0 ? ` ${skipped} dekket av lageret.` : ' Like varer summeres før avrunding.'
        }`,
        confirmText: 'Åpne handlelisten',
        cancelText: 'Bli her',
        onConfirm: () => {
          requestShellTab?.('more', 'shop', { openListId: listId });
          navigation.navigate('Home');
        },
      });
    } catch (e) {
      setNotice({
        title: 'Feil',
        message: e?.message
          ? `Klarte ikke legge varene i handlelisten: ${e.message}`
          : 'Klarte ikke legge varer i handlelisten.',
      });
    } finally {
      setAddingList(false);
    }
  }, [
    familyId, meal, mealId, lists, selectedList, uid, members, addingList, imported,
    scaledIngredients, adults, childrenCount, navigation, requestShellTab, pantryItems,
  ]);

  const doDelete = useCallback(async () => {
    setConfirmDelete(false);
    try {
      await deleteMeal(familyId, mealId);
      navigation.goBack();
    } catch {
      Alert.alert('Feil', 'Klarte ikke slette middagen.');
    }
  }, [familyId, mealId, navigation]);

  const listBtnLabel = imported
    ? 'Lagt i handlelisten'
    : selectedList
      ? `Legg alt i «${selectedList.name}»`
      : lists.length > 1
        ? 'Velg handleliste først'
        : 'Legg alt i handleliste';

  const dialogs = (
    <>
      <MealShoppingListSheet
        visible={listOpen}
        onClose={() => setListOpen(false)}
        mealTitle={meal?.title || ''}
        portionsLabel={formatMealPortions({ adults, children: childrenCount })}
        adults={adults}
        childrenCount={childrenCount}
        onChangeAdults={changeAdults}
        onChangeChildren={changeChildren}
        groups={groups}
        generating={generating || meal?.ingredientsStatus === 'pending'}
        empty={groups.length === 0 && meal?.ingredientsStatus !== 'pending' && !generating}
        isParent={!!isParent}
        lists={lists}
        selectedListId={selectedListId}
        onSelectList={setSelectedListId}
        imported={imported}
        addingList={addingList}
        listBtnLabel={listBtnLabel}
        listBtnDisabled={addingList || imported || (lists.length > 1 && !selectedList)}
        onAddAll={addAllToShoppingList}
        onGenerate={runGenerate}
      />

      <ConfirmDialog
        visible={!!notice}
        title={notice?.title || ''}
        message={notice?.message || ''}
        confirmText={notice?.confirmText || 'OK'}
        cancelText={notice?.cancelText || undefined}
        onConfirm={dismissNotice}
        onCancel={notice?.cancelText ? () => setNotice(null) : undefined}
        onClose={() => setNotice(null)}
      />

      <ConfirmDialog
        visible={confirmDelete}
        title="Slette middagen?"
        message="Handlelisten for denne retten fjernes også."
        confirmText="Slett"
        cancelText="Avbryt"
        danger
        onCancel={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        onClose={() => setConfirmDelete(false)}
      />
    </>
  );

  if (!meal) {
    return (
      <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
        <Screen>
          <ShellHeader title="Middag" onMenuPress={goHome} onLogoHome={goHome} />
          <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
        </Screen>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.safe}>
      <Screen>
        <ShellHeader
          title={meal.title || 'Middag'}
          onMenuPress={goHome}
          onLogoHome={goHome}
        />
        <EdgeSwipeBack onBack={() => navigation.goBack()}>
          <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
            <CompactBackLink
              onPress={() => navigation.goBack()}
              label="Måltider"
              accessibilityLabel="Tilbake til måltider"
            />
            <Text style={styles.meta}>
              {formatMealDateLabel(meal.dateKey)}
              {' · '}
              {formatMealPortions({ adults, children: childrenCount })}
            </Text>

            <View style={styles.hero}>
              <View style={styles.pill}><Text style={styles.pillTxt}>{meal.tag || 'Middag'}</Text></View>
              {!!meal.ingredientsSummary && (
                <Text style={styles.summary}>{meal.ingredientsSummary}</Text>
              )}
              {showAddHint && !imported ? (
                <Text style={styles.addHint}>
                  Juster antall personer, og legg deretter ingrediensene i handlelisten.
                </Text>
              ) : null}
            </View>

            <PortionSteppers
              adults={adults}
              childrenCount={childrenCount}
              onChangeAdults={changeAdults}
              onChangeChildren={changeChildren}
            />

            <TouchableOpacity
              style={styles.listOpener}
              onPress={() => setListOpen(true)}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Åpne handleliste for retten"
            >
              <View style={styles.listOpenerIcon}>
                <Ionicons
                  name={imported ? 'checkmark-circle' : 'cart-outline'}
                  size={20}
                  color={colors.brand}
                />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.listOpenerTitle}>Handleliste for retten</Text>
                <Text style={styles.listOpenerSub} numberOfLines={1}>
                  {generating || meal.ingredientsStatus === 'pending'
                    ? 'Lager handlelisten…'
                    : imported
                      ? 'Lagt i handlelisten'
                      : scaledIngredients.length
                        ? `${scaledIngredients.length} ${scaledIngredients.length === 1 ? 'vare' : 'varer'} · Åpne for å legge i listen`
                        : 'Ingen ingredienser ennå'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </TouchableOpacity>

            {isParent && (
              <TouchableOpacity style={styles.deleteBtn} onPress={() => setConfirmDelete(true)}>
                <Text style={styles.deleteTxt}>Slett middag</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </EdgeSwipeBack>
        {dialogs}
      </Screen>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.card },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  meta: {
    color: colors.muted,
    fontWeight: '400',
    fontSize: 13,
    marginBottom: 4,
  },
  hero: { gap: 8 },
  pill: {
    alignSelf: 'flex-start', backgroundColor: colors.brandSoft,
    borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4,
  },
  pillTxt: { color: colors.brand, fontWeight: '400', fontSize: 12 },
  summary: { color: colors.muted, fontWeight: '400', lineHeight: 20, fontSize: 14 },
  addHint: {
    color: colors.ink, fontWeight: '400', fontSize: 13, lineHeight: 18,
    backgroundColor: colors.brandSoft, borderRadius: 10, padding: 10,
  },
  listOpener: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  listOpenerIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listOpenerTitle: { fontWeight: '400', fontSize: 15, color: colors.ink },
  listOpenerSub: { color: colors.muted, fontWeight: '400', fontSize: 12, marginTop: 2 },
  deleteBtn: {
    alignSelf: 'flex-start', alignItems: 'center', paddingVertical: 12, marginTop: 8 },
  deleteTxt: { color: '#b91c1c', fontWeight: '400' },
});
