import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../../src/context/AppContext';
import { colors, useLayout } from '../../src/theme';
import { Screen, Title, Mute } from '../../components/ui';
import ShellAddButton from '../../components/ShellAddButton';
import HelpTarget from '../../components/HelpTarget';
import { useShellTitleRight } from '../../src/hooks/useShellTitleRight';
import { useHelpScene } from '../../src/hooks/useHelpScene';
import {
  MEAL_TYPES, RECIPE_CATEGORIES, searchRecipes, NORWEGIAN_RECIPES,
} from '../../src/data/norwegianRecipes';
import {
  listenFamilyRecipes, listenRecipeCatalog, listenHiddenBuiltinRecipeIds,
} from '../../src/utils/familyRecipes';
import {
  listenRecipeRatings, ratingForRecipe, sortRecipesByRating,
} from '../../src/utils/recipeRatings';
import { startOfWeekMonday } from '../../src/utils/dates';
import RecipeDetailScreen from './RecipeDetailScreen';
import CreateRecipeScreen from './CreateRecipeScreen';
import RecipeThumb from '../../components/meals/RecipeThumb';
import { StarRatingDisplay } from '../../components/meals/RecipeRatingBlock';
import { ModulePageFrame, ModuleBgSpacer, ModuleHubIntro } from '../../components/ModulePageBg';

/**
 * Egen Oppskrift-modul under Mat & innkjøp.
 * Samme katalog som Måltidsplanlegger → Oppskrifter, med AI-import og vurderinger.
 */
export default function RecipesHubScreen({ inShell = false }) {
  const { familyId, isParent } = useApp();
  const { isDesktop } = useLayout();
  const [customRecipes, setCustomRecipes] = useState([]);
  const [catalogRecipes, setCatalogRecipes] = useState([]);
  const [hiddenBuiltinIds, setHiddenBuiltinIds] = useState([]);
  const [ratingsMap, setRatingsMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [tagFilter, setTagFilter] = useState(null);
  const [activeRecipe, setActiveRecipe] = useState(null);
  const [createRecipe, setCreateRecipe] = useState(false);
  const [editRecipe, setEditRecipe] = useState(null);
  const [weekStart] = useState(() => startOfWeekMonday(new Date()));

  useEffect(() => {
    if (!familyId) {
      setLoading(false);
      return undefined;
    }
    const unsubs = [
      listenFamilyRecipes(familyId, (data) => {
        setCustomRecipes(data);
        setLoading(false);
      }),
      listenHiddenBuiltinRecipeIds(familyId, setHiddenBuiltinIds),
      listenRecipeRatings(familyId, setRatingsMap),
    ];
    return () => unsubs.forEach((u) => u?.());
  }, [familyId]);

  useEffect(() => listenRecipeCatalog(setCatalogRecipes), []);

  const filteredRecipes = useMemo(() => {
    const list = searchRecipes({
      query: search,
      category,
      tag: tagFilter,
      customRecipes,
      catalogRecipes,
      builtinRecipes: NORWEGIAN_RECIPES,
      hiddenBuiltinIds,
    });
    return sortRecipesByRating(list, ratingsMap);
  }, [search, category, tagFilter, customRecipes, catalogRecipes, hiddenBuiltinIds, ratingsMap]);

  const hubActive = !createRecipe && !editRecipe && !(activeRecipe && !isDesktop);
  const shellBtn = useMemo(() => {
    if (!isParent) return null;
    return (
      <HelpTarget id="add" onAdvance={() => setCreateRecipe(true)}>
        <ShellAddButton
          label="Ny oppskrift"
          onPress={() => setCreateRecipe(true)}
        />
      </HelpTarget>
    );
  }, [isParent]);
  useShellTitleRight(shellBtn, { active: hubActive });

  useHelpScene(createRecipe || editRecipe || activeRecipe ? 'inner' : 'hub', {
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
      <ModulePageFrame name="recipes">
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.body, isDesktop && styles.bodyDesk]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <ModuleHubIntro>
          {!inShell ? (
            <>
              <Title size={22}>Oppskrift</Title>
              <Mute style={{ marginBottom: 8 }}>
                Lagre familiens matretter, importer fra bilde eller lenke, og vurder favorittene.
              </Mute>
            </>
          ) : null}
          </ModuleHubIntro>

          <HelpTarget id="content" style={{ width: '100%', alignSelf: 'stretch' }}>
          <TextInput
            style={[styles.search, isDesktop && styles.searchDesk]}
            placeholder="Søk oppskrifter…"
            value={search}
            onChangeText={setSearch}
          />

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tagRow}
          >
            <TouchableOpacity
              style={[styles.tagChip, !tagFilter && styles.tagChipOn]}
              onPress={() => setTagFilter(null)}
            >
              <Text style={[styles.tagChipTxt, !tagFilter && styles.tagChipTxtOn]}>Alle måltid</Text>
            </TouchableOpacity>
            {MEAL_TYPES.map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.tagChip, tagFilter === t && styles.tagChipOn]}
                onPress={() => setTagFilter(t)}
              >
                <Text style={[styles.tagChipTxt, tagFilter === t && styles.tagChipTxtOn]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.catRow}
          >
            {RECIPE_CATEGORIES.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.catBtn, category === c.id && styles.catBtnOn]}
                onPress={() => setCategory(c.id)}
              >
                <Text style={[styles.catTxt, category === c.id && styles.catTxtOn]} numberOfLines={1}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {loading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: 24 }} />
          ) : (
            <View style={[styles.panel, isDesktop && styles.panelDesk]}>
              <Text style={styles.listSection}>
                {filteredRecipes.length} oppskrift{filteredRecipes.length === 1 ? '' : 'er'}
                {filteredRecipes.some((r) => ratingForRecipe(ratingsMap, r)?.averageRating)
                  ? ' · høyt vurdert først'
                  : ''}
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
                        size={isDesktop ? 36 : 44}
                        ratingAvg={rating?.averageRating || 0}
                      />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.metaRow}>
                          <Text style={styles.recipeTag}>
                            {r.isCustom ? 'Egen oppskrift' : r.tag}
                          </Text>
                          {rating?.averageRating ? (
                            <StarRatingDisplay
                              average={rating.averageRating}
                              count={rating.ratingCount}
                              size={12}
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
                          {r.instructions ? ' · med fremgangsmåte' : ''}
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.muted} />
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          )}

          {activeRecipe && isDesktop ? (
            <RecipeDetailScreen
              recipe={activeRecipe}
              weekStart={weekStart}
              onBack={() => setActiveRecipe(null)}
              onEdit={(r) => { setActiveRecipe(null); setEditRecipe(r); }}
            />
          ) : null}
          </HelpTarget>

          <ModuleBgSpacer />
        </ScrollView>
      </ModulePageFrame>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  body: { padding: 16, paddingBottom: 48 },
  bodyDesk: { maxWidth: 820, alignSelf: 'center', width: '100%' },
  search: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: colors.card,
    marginBottom: 10,
    fontSize: 15,
  },
  searchDesk: { marginBottom: 12 },
  tagRow: { gap: 8, marginBottom: 10, paddingRight: 8 },
  tagChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  tagChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  tagChipTxt: { fontWeight: '400', color: colors.ink, fontSize: 12 },
  tagChipTxtOn: { color: '#fff' },
  catRow: { gap: 8, marginBottom: 12, paddingRight: 8 },
  catBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  catBtnOn: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
  catTxt: { fontWeight: '400', color: colors.ink, fontSize: 12 },
  catTxtOn: { color: '#fff' },
  panel: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  panelDesk: { paddingHorizontal: 12 },
  listSection: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.muted,
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingTop: 14,
    paddingBottom: 8,
  },
  emptyInline: {
    textAlign: 'center',
    color: colors.muted,
    fontWeight: '400',
    paddingVertical: 28,
    paddingHorizontal: 16,
  },
  recipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  recipeRowDesk: { paddingVertical: 10 },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 2,
  },
  recipeTag: { fontSize: 11, fontWeight: '400', color: colors.brand },
  recipeTitle: { fontSize: 15, fontWeight: '400', color: colors.ink },
  recipeTitleDesk: { fontSize: 14 },
  recipeMeta: { fontSize: 12, color: colors.muted, fontWeight: '400', marginTop: 2 },
});
